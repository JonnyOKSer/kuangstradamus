# Kuangstradamus API

Fantasy football trade commissioner and league analyst. Express backend, deployed on Railway.

**No paid data.** Everything comes from Sleeper's free public API: player list (with ESPN / Yahoo / GSIS ids), weekly and season projections in PPR / half / standard, actual stats, and full league data (settings, rosters, matchups, transactions). Proverbs come from a pregenerated bilingual bank, so no LLM key is needed at runtime either.

## Run

```bash
npm install
npm run dev        # nodemon on :3000
npm test           # node --test (no network needed)
```

`.env` only needs `PORT`. Optional: `CORS_ORIGINS=https://a.com,https://b.com` to allow extra browser origins (production + localhost are always allowed).

## Endpoints

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/api/chat` | `{ message, lang?: 'en'\|'zh', scoring?: 'ppr'\|'half_ppr'\|'std', leagueId? }` | `{ reply, proverb: {en, zh, category}, players, analysis }` |
| POST | `/api/trade` | `{ message }` or `{ teamA: [...], teamB: [...] }` plus `scoring?`, `leagueId?` | full analysis (value over replacement per player, verdict, flags, unmatched names) |
| GET | `/api/players/search?q=` | | autocomplete |
| GET | `/api/state` | | current NFL season / week |
| GET | `/api/league/user/:username?season=` | | the user's Sleeper leagues |
| GET | `/api/league/:leagueId` | | settings, standings, playoff odds, positional strength |
| GET | `/api/league/:leagueId/season` | | lineup efficiency, all-play luck, strength of schedule, playoff odds |
| GET | `/api/league/:leagueId/team/:rosterId?week=` | | valued roster, gated start/sit, key dates + alerts, trade targets, waiver targets, deep sleepers |
| GET | `/api/league/:leagueId/team/:rosterId/lineup?week=` | | gate-adjusted lineup vs current |
| POST | `/api/league/:leagueId/team/:rosterId/lineup/apply` | | `501` — Sleeper has no official write API |
| GET | `/api/health` | | liveness + cache stats + last data refresh |
| POST | `/api/refresh` | header `x-refresh-token` when `REFRESH_TOKEN` is set | force a data refresh |

Example:

```bash
curl -s localhost:3000/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"Christian McCaffrey for Bijan Robinson and Jake Ferguson"}' | jq .reply
```

## How valuation works

1. **Rest-of-season points** = sum of Sleeper weekly projections from the current week through week 17. Bye weeks come from the NFL schedule feed — Sleeper projects every player in every week, so a missing projection does *not* mean a bye.
2. **League scoring** — when a `leagueId` is given, every projected stat line is scored with that league's exact `scoring_settings` (TE premium, 6-pt pass TDs, bonuses all flow through). Without a league, the PPR / half / standard buckets are used with a default 12-team lineup.
3. **Replacement level** per position is derived from the league's roster slots and team count (dedicated slots, then FLEX allocated greedily, then a small bench buffer).
4. **Value** = max(0, ROS points − replacement). Trade sides are compared on total value, so a 2-for-1 is judged on what the empty slot's free fill-in is worth.
5. Verdict categories: even (< 6% gap), slight, clear (≥ 18%), lopsided (≥ 40%). The proverb category follows the verdict. When neither side clears replacement level both values floor at zero, so the comparison falls back to raw projected points.

Only the positions a league actually starts are analysed. `activePositions` is derived from `roster_positions`, so a league with no K or DEF slot gets no kicker or defence anywhere — not in the roster table, positional strength, waivers, drop candidates or bye coverage.

## Start/sit: the challenger gates

A raw projection does not know that a back just lost his job, that the defence opposite him has been shredded for five weeks, or that the game is in a 22°F snowstorm. Every player-week is re-scored through six gates, each returning a bounded multiplier and a reason:

| Gate | Asks | Source |
|---|---|---|
| availability | out, doubtful, questionable, bye, no projection | Sleeper injury tags + schedule |
| role | snap share, touch and target trend | weekly stat lines (`off_snp` / `tm_off_snp`) |
| form | last three games vs the ones before, shrunk by sample size | weekly stat lines |
| matchup | what this defence has actually allowed to the position, in league scoring | weekly stat lines by opponent |
| weather | wind, cold, snow and rain, weighted by position; skipped indoors | Open-Meteo + stadium table |
| gameScript | recent team output, home/away | weekly stat lines |

The product is clamped to ±40% so no single signal runs away with a lineup, and any gate that cannot be evaluated lowers **confidence** rather than silently passing. A bench player only displaces a starter when his gated projection clears a bar that widens as confidence falls — swaps that fail are reported under `held` with the reason, so the analyzer shows its work both ways.

## Deep sleepers

The ordinary waiver list ranks free agents by projection, which surfaces streamers and never the back who becomes a top-12 RB the moment the starter ahead of him pulls up. `domain/sleepers.js` works the other way: it identifies genuine workhorses from real usage (touches, targets, snap share), walks down the NFL depth chart to the next man, and values him on what he would inherit — plus flags any backup whose own snap share is already climbing.

## Layout

```
src/
  services/sleeper/   client (cache), players (dump + name resolution), projections, league import
  services/nfl/       schedule (home/away, byes), usage (form + defence-vs-position), per-week context
  services/weather/   Open-Meteo game-day forecasts
  services/analysis   per-league context: import + league-scored projections + replacement levels + trends
  services/refresh    scheduled cache refresh (every 6h) and POST /api/refresh
  domain/             tradeParser, scoring, valuation, lineup (Hungarian optimizer), season analytics,
                      gates (challenger pipeline), sleepers (handcuff discovery), calendar (key dates),
                      stadiums (roof + coordinates)
  routes/             chat, trade, league
  data/proverbs.json  bilingual proverb bank by verdict category
test/                 node:test suites (pure, offline)
```

## Freshness

Injury tags move on Friday, snap counts land on Tuesday, and a forecast four days out is not Sunday's forecast. TTLs alone would let a warm cache serve stale context to whoever asks first, so the service also refreshes on a clock — every six hours, four times a day — and `GET /api/health` reports when it last ran.

## Data sources

- Sleeper players: `https://api.sleeper.app/v1/players/nfl` (cached 24h)
- Sleeper projections: `https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular&position[]=...` (cached 1h)
- Sleeper league: `https://api.sleeper.app/v1/league/{id}` and sub-resources (cached 10m)
- Sleeper weekly stats: `https://api.sleeper.com/stats/nfl/{season}/{week}?season_type=regular` (cached 1h) — one request returns every position
- Sleeper schedule: `https://api.sleeper.com/schedule/nfl/regular/{season}` (cached 12h) — home/away, dates, byes
- Weather: `https://api.open-meteo.com/v1/forecast` (cached 3h, free, no API key, 16-day horizon)
- Sleeper docs: https://docs.sleeper.com (read-only; stay under 1000 req/min)

All sources remain free. No paid data providers.
