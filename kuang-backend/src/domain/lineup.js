// Optimal lineup = maximum-weight assignment of players to starting slots.
// Roster sizes are tiny (≤ ~20 players, ≤ ~12 slots) so a Hungarian solve is instant.

export const SLOT_ELIGIBILITY = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  DL: ['DL', 'DE', 'DT'],
  LB: ['LB'],
  DB: ['DB', 'CB', 'S'],
  IDP_FLEX: ['DL', 'LB', 'DB', 'DE', 'DT', 'CB', 'S'],
};
export const NON_STARTING_SLOTS = new Set(['BN', 'IR', 'TAXI']);
export const UNAVAILABLE_STATUSES = new Set(['Out', 'IR', 'PUP', 'Sus', 'COV', 'NA', 'DNR']);

const NEG = -1e6;

export function isEligible(slot, player) {
  const elig = SLOT_ELIGIBILITY[slot];
  if (!elig) return false;
  const positions = player.fantasyPositions?.length ? player.fantasyPositions : [player.position];
  return positions.some((p) => elig.includes(p));
}

/** Hungarian algorithm (min-cost) on a square matrix. Returns row -> col. */
function hungarianMin(cost) {
  const n = cost.length;
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else { minv[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]) assignment[p[j] - 1] = j - 1;
  return assignment;
}

/**
 * @param rosterPositions e.g. ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN',...]
 * @param players [{ id, name, position, fantasyPositions, points, injuryStatus, onBye }]
 * @returns { starters: [{slot, player, points}], bench: [player], total, unfilled: [slot] }
 */
export function optimizeLineup({ rosterPositions, players, excludeStatuses = UNAVAILABLE_STATUSES, excludeBye = true }) {
  const slots = rosterPositions.filter((s) => !NON_STARTING_SLOTS.has(s));
  const available = players.filter((p) => {
    if (p.injuryStatus && excludeStatuses.has(p.injuryStatus)) return false;
    if (excludeBye && p.onBye) return false;
    return true;
  });

  const n = Math.max(slots.length, available.length, 1);
  const BIG = 1e7;
  const cost = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i >= slots.length || j >= available.length) return BIG; // padding
      const pl = available[j];
      const w = isEligible(slots[i], pl) ? (pl.points ?? 0) : NEG;
      return BIG - w;
    }),
  );

  const assignment = hungarianMin(cost);
  const starters = [];
  const unfilled = [];
  const used = new Set();
  slots.forEach((slot, i) => {
    const j = assignment[i];
    const pl = j >= 0 && j < available.length ? available[j] : null;
    if (pl && isEligible(slot, pl)) {
      starters.push({ slot, player: pl, points: Number((pl.points ?? 0).toFixed(2)) });
      used.add(pl.id);
    } else {
      unfilled.push(slot);
      starters.push({ slot, player: null, points: 0 });
    }
  });
  const bench = players.filter((p) => !used.has(p.id));
  const total = Number(starters.reduce((s, x) => s + x.points, 0).toFixed(2));
  return { starters, bench, total, unfilled };
}

/**
 * Compare a current set of starter ids to an optimal lineup and describe the moves.
 */
export function diffLineups(currentStarterIds, optimal, playersById) {
  const current = new Set((currentStarterIds || []).filter(Boolean).map(String));
  const optimalIds = new Set(optimal.starters.filter((s) => s.player).map((s) => String(s.player.id)));
  const benchToStart = [...optimalIds].filter((id) => !current.has(id));
  const startToBench = [...current].filter((id) => !optimalIds.has(id));
  const moves = [];
  for (const inId of benchToStart) {
    const slot = optimal.starters.find((s) => s.player && String(s.player.id) === inId)?.slot;
    const inPl = playersById.get(inId);
    moves.push({ action: 'start', slot, playerId: inId, name: inPl?.name || inId, points: inPl?.points ?? 0 });
  }
  for (const outId of startToBench) {
    const outPl = playersById.get(outId);
    moves.push({ action: 'bench', playerId: outId, name: outPl?.name || outId, points: outPl?.points ?? 0, reason: reasonFor(outPl) });
  }
  const currentTotal = Number([...current].reduce((s, id) => s + (playersById.get(id)?.points ?? 0), 0).toFixed(2));
  return { moves, currentTotal, optimalTotal: optimal.total, gain: Number((optimal.total - currentTotal).toFixed(2)) };
}

function reasonFor(p) {
  if (!p) return 'no longer on roster';
  if (p.onBye) return 'bye week';
  if (p.injuryStatus && UNAVAILABLE_STATUSES.has(p.injuryStatus)) return `listed ${p.injuryStatus}`;
  return 'lower projection';
}
