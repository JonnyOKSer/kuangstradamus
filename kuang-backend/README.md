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
| GET | `/api/league/:leagueId/team/:rosterId?week=` | | valued roster, current vs optimal lineup, trade targets, waiver targets |
| GET | `/api/league/:leagueId/team/:rosterId/lineup?week=` | | optimal lineup vs current |
| POST | `/api/league/:leagueId/team/:rosterId/lineup/apply` | | `501` — Sleeper has no official write API |
| GET | `/api/health` | | liveness + cache stats |

Example:

```bash
curl -s localhost:3000/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"Christian McCaffrey for Bijan Robinson and Jake Ferguson"}' | jq .reply
```

## How valuation works

1. **Rest-of-season points** = sum of Sleeper weekly projections from the current week through week 17. Bye weeks are simply weeks without a projection.
2. **League scoring** — when a `leagueId` is given, every projected stat line is scored with that league's exact `scoring_settings` (TE premium, 6-pt pass TDs, bonuses all flow through). Without a league, the PPR / half / standard buckets are used with a default 12-team lineup.
3. **Replacement level** per position is derived from the league's roster slots and team count (dedicated slots, then FLEX allocated greedily, then a small bench buffer).
4. **Value** = max(0, ROS points − replacement). Trade sides are compared on total value, so a 2-for-1 is judged on what the empty slot's free fill-in is worth.
5. Verdict categories: even (< 6% gap), slight, clear (≥ 18%), lopsided (≥ 40%). The proverb category follows the verdict.

## Layout

```
src/
  services/sleeper/   client (cache), players (dump + name resolution), projections, league import
  services/analysis   per-league context: import + league-scored projections + replacement levels
  domain/             tradeParser, scoring, valuation, lineup (Hungarian optimizer), season analytics
  routes/             chat, trade, league
  data/proverbs.json  bilingual proverb bank by verdict category
test/                 node:test suites (pure, offline)
```

## Data sources

- Sleeper players: `https://api.sleeper.app/v1/players/nfl` (cached 24h)
- Sleeper projections: `https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular&position[]=...` (cached 1h)
- Sleeper league: `https://api.sleeper.app/v1/league/{id}` and sub-resources (cached 10m)
- Sleeper docs: https://docs.sleeper.com (read-only; stay under 1000 req/min)
