// Canonical player list from Sleeper's free player dump, plus name resolution.
// Sleeper ids are the primary key everywhere in this app. The dump also carries
// espn_id / yahoo_id / gsis_id so other platforms can be joined later.

import Fuse from 'fuse.js';
import { fetchJson, TTL } from './client.js';

const PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const TRENDING_URL = 'https://api.sleeper.app/v1/players/nfl/trending';

export const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

// abbr -> aliases (lowercase). Sleeper uses the abbr as the DEF player_id.
export const TEAM_ALIASES = {
  ARI: ['arizona', 'cardinals', 'cards'],
  ATL: ['atlanta', 'falcons'],
  BAL: ['baltimore', 'ravens'],
  BUF: ['buffalo', 'bills'],
  CAR: ['carolina', 'panthers'],
  CHI: ['chicago', 'bears'],
  CIN: ['cincinnati', 'bengals'],
  CLE: ['cleveland', 'browns'],
  DAL: ['dallas', 'cowboys'],
  DEN: ['denver', 'broncos'],
  DET: ['detroit', 'lions'],
  GB: ['green bay', 'packers'],
  HOU: ['houston', 'texans'],
  IND: ['indianapolis', 'colts'],
  JAX: ['jacksonville', 'jaguars', 'jags'],
  KC: ['kansas city', 'chiefs'],
  LV: ['las vegas', 'raiders'],
  LAC: ['los angeles chargers', 'la chargers', 'chargers'],
  LAR: ['los angeles rams', 'la rams', 'rams'],
  MIA: ['miami', 'dolphins'],
  MIN: ['minnesota', 'vikings'],
  NE: ['new england', 'patriots', 'pats'],
  NO: ['new orleans', 'saints'],
  NYG: ['new york giants', 'ny giants', 'giants'],
  NYJ: ['new york jets', 'ny jets', 'jets'],
  PHI: ['philadelphia', 'eagles'],
  PIT: ['pittsburgh', 'steelers'],
  SF: ['san francisco', '49ers', 'niners', 'forty niners'],
  SEA: ['seattle', 'seahawks'],
  TB: ['tampa bay', 'tampa', 'buccaneers', 'bucs'],
  TEN: ['tennessee', 'titans'],
  WAS: ['washington', 'commanders'],
};

// A few nicknames people actually type into a trade box.
const NICKNAMES = {
  cmc: 'christian mccaffrey',
  jjettas: 'justin jefferson',
  jj: 'justin jefferson',
  bijan: 'bijan robinson',
  jamo: 'jameson williams',
  dk: 'dk metcalf',
  ceedee: 'ceedee lamb',
  kupp: 'cooper kupp',
  'a.j. brown': 'aj brown',
};

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

export const normalize = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function cleanQuery(raw = '') {
  let q = raw.toLowerCase().trim();
  q = q.replace(/[’'`]/g, '').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  q = q.replace(/^(the|my|his|her|their|our)\s+/, '');
  const tokens = q.split(' ').filter((t) => !SUFFIXES.has(t));
  return tokens.join(' ');
}

function slim(p) {
  const isDef = p.position === 'DEF';
  const name = p.full_name || (isDef ? `${p.first_name} ${p.last_name}` : `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
  return {
    id: p.player_id,
    name,
    searchName: p.search_full_name || normalize(name),
    firstName: p.first_name,
    lastName: p.last_name,
    position: p.position,
    fantasyPositions: p.fantasy_positions || [p.position],
    team: p.team || null,
    status: p.status,
    active: !!p.active,
    injuryStatus: p.injury_status || null,
    injuryBodyPart: p.injury_body_part || null,
    depthChartOrder: p.depth_chart_order ?? null,
    searchRank: p.search_rank ?? 9_999_999,
    age: p.age ?? null,
    yearsExp: p.years_exp ?? null,
    number: p.number ?? null,
    espnId: p.espn_id ?? null,
    yahooId: p.yahoo_id ?? null,
    gsisId: p.gsis_id ?? null,
  };
}

function isFantasyRelevant(p) {
  if (FANTASY_POSITIONS.includes(p.position)) return true;
  return (p.fantasy_positions || []).some((fp) => FANTASY_POSITIONS.includes(fp));
}

/**
 * Build a name resolver over a list of slim players. Exported so tests can use
 * a fixture instead of the live 14 MB dump.
 */
export function createResolver(list) {
  const pool = list.filter((p) => p.active && p.team && FANTASY_POSITIONS.includes(p.position));
  const fallbackPool = list;
  const bySearch = new Map();
  for (const p of fallbackPool) {
    const arr = bySearch.get(p.searchName) || [];
    arr.push(p);
    bySearch.set(p.searchName, arr);
  }
  const defByTeam = new Map(list.filter((p) => p.position === 'DEF').map((p) => [p.team || p.id, p]));
  const fuse = new Fuse(pool, {
    keys: [{ name: 'name', weight: 0.8 }, { name: 'lastName', weight: 0.2 }],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
  });
  // A deliberately looser index used only to answer "did you mean ...?" after a
  // miss. It never resolves a name on its own.
  const loose = new Fuse(pool, {
    keys: [{ name: 'name', weight: 0.6 }, { name: 'lastName', weight: 0.4 }],
    includeScore: true,
    threshold: 0.7,
    ignoreLocation: true,
  });
  const byLastName = new Map();
  for (const p of pool) {
    const key = normalize(p.lastName || '');
    if (!key) continue;
    if (!byLastName.has(key)) byLastName.set(key, []);
    byLastName.get(key).push(p);
  }

  const rank = (arr, hints) => {
    const scored = arr.map((p) => {
      let bonus = 0;
      if (hints.position && p.position === hints.position) bonus -= 1e6;
      if (hints.team && p.team === hints.team) bonus -= 1e6;
      if (p.active && p.team) bonus -= 1e5;
      return { p, key: p.searchRank + bonus };
    });
    scored.sort((a, b) => a.key - b.key);
    return scored.map((s) => s.p);
  };

  function resolveTeamDefense(q) {
    const t = q.replace(/\b(d\/st|dst|defense|defence|def|d)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const upper = t.toUpperCase();
    if (TEAM_ALIASES[upper]) return defByTeam.get(upper) || null;
    for (const [abbr, aliases] of Object.entries(TEAM_ALIASES)) {
      if (aliases.includes(t)) return defByTeam.get(abbr) || null;
    }
    return null;
  }

  /**
   * Close-but-not-confident candidates, used to turn a dead end into
   * "did you mean ...?". Surname hits come first because the most common real
   * miss is a right surname with the wrong or outdated first name.
   */
  function nearMatches(query, hints = {}, limit = 4) {
    const tokens = query.split(' ').filter(Boolean);
    const norm = normalize(query);
    const seen = new Set();
    const out = [];
    const push = (p, why) => {
      if (!p || seen.has(p.id) || out.length >= limit) return;
      seen.add(p.id);
      out.push({ id: p.id, name: p.name, position: p.position, team: p.team, why });
    };

    if (tokens.length >= 2) {
      for (const p of rank(byLastName.get(normalize(tokens[tokens.length - 1])) || [], hints)) push(p, 'same surname');
    }
    if (tokens.length === 1 && norm) {
      for (const p of rank(byLastName.get(norm) || [], hints)) push(p, 'same surname');
    }
    for (const p of pool.filter((x) => norm && x.searchName.includes(norm)).sort((a, b) => a.searchRank - b.searchRank)) push(p, 'name contains your text');
    for (const r of loose.search(query, { limit: limit * 2 })) push(r.item, 'similar spelling');
    return out;
  }

  return function resolve(rawQuery, hints = {}) {
    const query = cleanQuery(rawQuery);
    if (!query) return null;

    // Team defenses: "49ers", "SF D/ST", "Browns defense", "CLE".
    const wantsDef = /\b(d\/st|dst|defense|defence|def)\b/.test(query) || hints.position === 'DEF';
    const def = resolveTeamDefense(query);
    if (def && (wantsDef || query.split(' ').length <= 2)) {
      // Only treat a bare team name as a defense when it is not also a player name.
      if (wantsDef || !bySearch.has(normalize(query))) {
        return { player: def, confidence: 1, method: 'team-defense' };
      }
    }

    const aliased = NICKNAMES[query] || query;
    const norm = normalize(aliased);

    // 1. exact normalized match
    const exact = bySearch.get(norm);
    if (exact?.length) {
      const [best] = rank(exact, hints);
      return { player: best, confidence: exact.length === 1 ? 1 : 0.9, method: 'exact' };
    }

    // 2. single token: last-name match among active players
    const tokens = aliased.split(' ');
    if (tokens.length === 1) {
      const lastNameHits = pool.filter((p) => normalize(p.lastName || '') === norm);
      if (lastNameHits.length === 1) return { player: lastNameHits[0], confidence: 0.85, method: 'last-name' };
      if (lastNameHits.length > 1) {
        const [best] = rank(lastNameHits, hints);
        const decisive = hints.position || hints.team;
        return { player: best, confidence: decisive ? 0.8 : 0.5, method: 'last-name-ambiguous', alternatives: lastNameHits.slice(0, 5).map((p) => p.name) };
      }
    }

    // 3. prefix / contains among active players
    const contains = pool.filter((p) => p.searchName.startsWith(norm) || p.searchName.includes(norm));
    if (contains.length === 1) return { player: contains[0], confidence: 0.85, method: 'contains' };

    // 4. fuzzy
    const results = fuse.search(aliased, { limit: 5 });
    if (results.length) {
      results.sort((a, b) => a.score - b.score || a.item.searchRank - b.item.searchRank);
      const [top] = results;
      const confidence = 1 - top.score;
      if (confidence >= 0.6) {
        return {
          player: top.item,
          confidence: Number(confidence.toFixed(2)),
          method: 'fuzzy',
          alternatives: results.slice(1, 4).map((r) => r.item.name),
        };
      }
    }

    // 5. no confident match. Offer candidates rather than a dead end — a wrong
    // first name on a real surname ("david boston") is the common case, and
    // guessing a different player would be worse than asking.
    const suggestions = nearMatches(aliased, hints);
    return suggestions.length ? { player: null, confidence: 0, method: 'miss', suggestions } : null;
  };
}

let indexPromise = null;

/** Load (and cache for a day) the slimmed player index. */
export async function loadPlayers() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const raw = await fetchJson(PLAYERS_URL, { ttl: TTL.players });
      const list = Object.values(raw).filter(isFantasyRelevant).map(slim);
      const byId = new Map(list.map((p) => [p.id, p]));
      const resolve = createResolver(list);
      return { list, byId, resolve, loadedAt: Date.now() };
    })().catch((err) => {
      indexPromise = null; // allow retry on next call
      throw err;
    });
    // refresh once a day
    setTimeout(() => { indexPromise = null; }, TTL.players).unref?.();
  }
  return indexPromise;
}

/** Force the next loadPlayers() to re-fetch the dump. */
export function invalidatePlayers() {
  indexPromise = null;
}

export async function getPlayer(id) {
  const { byId } = await loadPlayers();
  return byId.get(String(id)) || null;
}

export async function resolvePlayer(query, hints) {
  const { resolve } = await loadPlayers();
  return resolve(query, hints);
}

export async function searchPlayers(query, limit = 8) {
  const { list } = await loadPlayers();
  const norm = normalize(query);
  if (!norm) return [];
  const pool = list.filter((p) => p.active && p.team);
  const starts = pool.filter((p) => p.searchName.startsWith(norm));
  const contains = pool.filter((p) => !p.searchName.startsWith(norm) && p.searchName.includes(norm));
  return [...starts, ...contains]
    .sort((a, b) => a.searchRank - b.searchRank)
    .slice(0, limit);
}

/** Trending adds/drops over the last `lookbackHours`. type: 'add' | 'drop'. */
export async function getTrending(type = 'add', { lookbackHours = 24, limit = 25 } = {}) {
  const url = `${TRENDING_URL}/${type}?lookback_hours=${lookbackHours}&limit=${limit}`;
  return fetchJson(url, { ttl: TTL.trending });
}
