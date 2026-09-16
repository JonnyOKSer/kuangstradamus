# Kuangstradamus: Project Review and Roadmap

Reviewed 2026-09-14 against `main` at `ff962a3`. Live endpoints were probed directly on 2026-09-09 and 2026-09-14; anything not probed is marked as unverified.

> **Status 2026-09-16:** M0 (hygiene), M1 (free Sleeper data), M2 (value-over-replacement trade analyzer), M3 (Sleeper league import + season report) and M4 (lineup optimizer + trade/waiver targets) are implemented in `kuang-backend` and a League page was added to `kuang-frontend`. OpenAI was removed in favour of a pregenerated proverb bank. M5 (Yahoo) is blocked on Yahoo API access; M6 stays optional. Backlog is in section 9.

## 1. What exists today

- **Backend** (`kuang-backend`, Express, deployed on Railway). `POST /api/chat` takes a free-text trade like `A and B for C and D`, splits on `for` / `and`, looks up each name in Fantasy Nerds rest-of-season (ROS) projections, sums points per side, returns a verdict plus a GPT-generated Chinese-style proverb. `POST /api/trade` is a JSON variant.
- **Frontend** (`kuang-frontend`, Next.js static export, deployed on Netlify at kuangstradamus.xyz). Single page with EN/ZH toggle, dark mode, chat thread, and a collapsible player table.
- **Data**: Fantasy Nerds with the `TEST` API key. Probed live: the `TEST` key returns the **2021 season**, which is why the input placeholder says "Use 2021 Players".
- **LLM**: OpenAI `gpt-4o` for the proverb only.

## 2. Findings

### Critical

| # | Finding | Where |
|---|---|---|
| 1 | An OpenAI `sk-proj-...` key is hardcoded as the env fallback and committed to the public repo (commit `1e10e18`, still in HEAD). Treat as compromised: rotate at platform.openai.com, delete the fallback, set `OPENAI_API_KEY` only in Railway. | `kuang-backend/src/utils/proverbLogic.js:4` |
| 2 | The data source is effectively dead. The `TEST` key serves 2021 data, and the `.env` variable is named `FN_API_KEY` while the code reads `NERDS_APIKEY`, so even a paid key would be ignored. | `nerdsService.js:6`, `.env` |

### High

| # | Finding | Where |
|---|---|---|
| 3 | `POST /api/trade` always fails. The route passes two arrays but `analyzeTrade` expects one string, so `input.split` throws. Reproduced locally. | `routes/trade.js:10`, `utils/tradeLogic.js:14` |
| 4 | Every player lookup downloads the entire projections payload again. A four-player trade is four full downloads per request, with no cache. | `nerdsService.js:10` |
| 5 | Valuation is a raw sum of ROS points. It ignores positional scarcity, replacement level, roster context, 2-for-1 consolidation, and league scoring. A QB projected for 350 points "beats" an elite RB projected for 290 every time. | `tradeLogic.js:37-60` |
| 6 | Unmatched players are silently dropped and totals are computed on whoever remains, so a typo can flip the verdict without any warning to the user. | `tradeLogic.js:31` |

### Medium

| # | Finding | Where |
|---|---|---|
| 7 | Parser only understands `and` / `for`. Commas, `+`, `&`, draft picks, and "in exchange for" all fail. | `tradeLogic.js:3-11` |
| 8 | Two different Railway URLs are hardcoded in the frontend, CORS only allows the production origin, and `next.config.js` rewrites to port 3001 while the backend defaults to 3000. Local development cannot work as-is. | `pages/index.js:36`, `pages/chat.js:16`, `app.js:12-23`, `next.config.js` |
| 9 | `pages/chat.js` is dead code: it sends a `mode` field the backend ignores and hits a stale URL. | `kuang-frontend/pages/chat.js` |
| 10 | `kuang-frontend-backup/` is tracked in git and `kuang-backend-backup/` is untracked clutter. Git history already preserves old versions. | repo root |
| 11 | No tests, no lint, empty READMEs. | both packages |
| 12 | OpenAI is a second paid dependency. Cheap options: a smaller model, a cached proverb bank keyed by verdict, or generate once per unique trade and store. | `proverbLogic.js` |

## 3. Zero-cost data stack (verified)

Sleeper's public API needs no key, no login, and is free for non-commercial use (documented limit: stay under 1000 calls/minute). It covers everything Fantasy Nerds did and more.

| Need | Endpoint | Verified fields |
|---|---|---|
| Canonical players + cross-platform IDs | `GET https://api.sleeper.app/v1/players/nfl` | 12,227 players, 14.6 MB. `player_id`, `full_name`, `search_full_name`, `position`, `fantasy_positions`, `team`, `espn_id`, `yahoo_id`, `gsis_id`, `sportradar_id`, `injury_status`, `depth_chart_order`, `active`, `search_rank`. Refresh once a day. |
| Current season / week | `GET https://api.sleeper.app/v1/state/nfl` | `season: "2026"`, `week`, `season_type`, `season_start_date`. |
| Season-total projections, all players at a position | `GET https://api.sleeper.com/projections/nfl/2026?season_type=regular&position[]=RB&order_by=pts_ppr` | 750 RBs. `stats.pts_ppr`, `pts_half_ppr`, `pts_std`, `gp`, rushing/receiving lines, `adp_ppr`, `adp_half_ppr`, `adp_std`, dynasty ADP. |
| Weekly projections, all players at a position | `GET https://api.sleeper.com/projections/nfl/2026/1?season_type=regular&position[]=RB&order_by=pts_ppr` | Same `stats` shape per week, plus embedded `player` with `injury_status`, `injury_body_part`, game `date`. |
| Per-player weekly projections (ROS and byes) | `GET https://api.sleeper.com/projections/nfl/player/{player_id}?season=2026&season_type=regular&grouping=week` | Keys `1..18`; bye week is `null` (McCaffrey: week 8). Each week has `opponent`, `date`, `stats.pts_*`. **ROS = sum of weeks >= current week.** |
| Per-player actual stats | `GET https://api.sleeper.com/stats/nfl/player/{player_id}?season=2025&season_type=regular` (add `&grouping=week` for per-week) | McCaffrey 2025: `gp 17`, `pts_ppr 416.6`, `rush_yd 1202`, `rec 102`. |
| Trending adds/drops | `GET https://api.sleeper.app/v1/players/nfl/trending/add` | Documented; not probed. |
| League import | `/v1/user/{username}`, `/v1/user/{user_id}/leagues/nfl/2026`, `/v1/league/{id}`, `/rosters`, `/users`, `/matchups/{week}`, `/transactions/{round}`, `/traded_picks`, `/drafts` | Documented at docs.sleeper.com; not probed (needs a real league id). `league.scoring_settings` and `roster_positions` give scoring and lineup slots. |

Fallbacks, also free:

- **ESPN unofficial**: `GET https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info` with an `X-Fantasy-Filter` header. Probed: HTTP 200 with no cookies, returns projections and PPR/standard ranks. Useful as a second projection source to blend with Sleeper. Reverse-engineered; can change without notice.
- **DynastyProcess player ID crosswalk**: `https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv`. Probed: columns include `sleeper_id`, `espn_id`, `yahoo_id`, `gsis_id`, `pfr_id`, `fantasypros_id`. Only needed if Sleeper's own `espn_id` / `yahoo_id` fields have gaps.
- **nflverse** historical stats, player master, and schedules (free CSV releases on GitHub, all probed HTTP 200 on 2026-09-14):
  - `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv` (per player per week: `player_id` is the gsis id, `team`, `opponent_team`, passing/rushing/receiving lines)
  - `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_2025.csv` (season totals)
  - `https://github.com/nflverse/nflverse-data/releases/download/players/players.csv` (master list with `gsis_id`, `espn_id`, `pfr_id`, `pff_id`)
  - `https://github.com/nflverse/nfldata/raw/master/data/games.csv` (full schedule with Vegas `spread_line`, `total`, moneylines; bye weeks derivable per team)
  Join to Sleeper on `gsis_id`. Best use: multi-season history for variance estimates in the playoff-odds simulation, and Vegas lines as a projection adjustment.

Implementation shape for the swap:

```
src/services/sleeper/
  client.js       fetch + in-memory TTL cache (players 24h, projections 1h, state 10m)
  players.js      load dump, index by search_full_name, Fuse.js fallback, position/team hints
  projections.js  seasonTotals(position), weekly(week, position), rosByPlayer(id, fromWeek)
  league.js       user -> leagues -> league/rosters/users/matchups/transactions
```

The Fantasy Nerds service becomes deletable. Frontend placeholder text drops the "2021 players" warning.

## 4. Trade analyzer v2: valuation that matches the goal

The README's stated goal is a "virtual trade commissioner". Raw point sums cannot do that. Recommended model, cheapest to build first:

1. **Scoring-aware points**: pick `pts_ppr` / `pts_half_ppr` / `pts_std` from the league's `scoring_settings` (default PPR when no league is attached).
2. **Replacement level (VORP)**: value = ROS points minus the ROS points of the replacement-level player at that position for the league size and lineup slots. For a 12-team 1QB / 2RB / 3WR / 1TE / 1FLEX league the replacement ranks land near QB13, RB27, WR39, TE13 once FLEX is allocated. Compute from the league's `roster_positions`, not constants.
3. **Blend** Sleeper and ESPN projections when both exist; flag players where they disagree by more than a threshold.
4. **Adjustments**: injury status from the player dump, bye weeks during fantasy playoffs (weeks 15 to 17), and a small consolidation bonus for the side receiving the single best player in an uneven trade.
5. **Roster context** (once league import exists): value each player as the marginal change in the team's optimal starting lineup, which is what actually decides whether a 2-for-1 helps.
6. **Never silently drop a player.** Return `unmatched: [...]` and refuse to give a verdict if any side has an unresolved name.
7. **Parser**: split sides on `for` / `in exchange for` / `→`; split players on `,`, `and`, `&`, `+`; recognize picks like `2027 1st` and value them from a static pick chart.
8. Keep the verdict, summary, and proverb exactly where the frontend expects them so the UI keeps working.

## 5. League import, season analysis, and lineups

### Phase A: import (Sleeper first, no auth needed)

Username → `user_id` → leagues for the season → league settings, rosters, users, all weekly matchups, transactions, traded picks. Persist in SQLite via `better-sqlite3` on a Railway volume (simplest) or Railway Postgres. Resolve every roster `player_id` against the player dump.

New routes: `POST /api/league/import { platform, username | leagueId }`, `GET /api/league/:id/summary`, `GET /api/league/:id/team/:rosterId`.

### Phase B: season analysis

- **Lineup efficiency**: for each past week, optimal lineup vs actual starters, "points left on bench", running total.
- **Luck**: all-play record and expected wins from weekly scores.
- **Strength of schedule** remaining, using opponents' projected starters.
- **Playoff odds**: Monte Carlo over remaining weeks using weekly projections plus historical variance per position.
- **Trade targets**: positional surplus/deficit per team via VORP, then rank counterpart teams with the mirror-image imbalance. This is where the trade analyzer and the league importer meet.
- **Waiver targets**: trending adds intersected with the league's free-agent pool, filtered to players projected above the team's worst starter.

### Phase C: lineup suggestions (all platforms)

Optimizer: assign roster players to `roster_positions` to maximize projected points for the target week, honoring slot eligibility (`FLEX`, `SUPER_FLEX`, `REC_FLEX`), and excluding `OUT`, `IR`, `Doubtful`, and bye-week players. Output a diff against current starters with reasons. Run as a scheduled job (Railway cron or `node-cron`) Thursday morning and Sunday morning before lock, and deliver via email, Discord webhook, or the frontend.

### Phase D: auto-set lineups, platform by platform

| Platform | Official write API? | Verdict | Notes |
|---|---|---|---|
| **Yahoo** | Yes. OAuth 2.0, `PUT /fantasy/v2/team/{team_key}/roster` with an XML body (`coverage_type` week, `week`, list of `player_key` + `position`). Transactions endpoint handles add/drop/waiver. | **Feasible and supported.** | Access now goes through an apply-and-review flow on sports.yahoo.com/developer rather than instant key issuance, so apply early. Attribution "Fantasy data provided by Yahoo Fantasy" is required. Client note: the `yahoo-fantasy` npm wrapper reads rosters but lists roster PUT as a TODO, so either send the XML PUT yourself with `fetch` (it is one request) or borrow the body format from Python `yahoo_fantasy_api`'s `team.change_positions`. |
| **Sleeper** | No. docs.sleeper.com states you "cannot modify contents via this API". | **Suggest-only by default.** Unofficial auto-set is possible but risky. | The web app uses an undocumented GraphQL endpoint at `sleeper.com/graphql` with a browser JWT. Community notes: `update_matchup_leg(round, leg, league_id, roster_id, starters)` is what actually changes the scored lineup; `roster_update_starters` succeeds but does not affect scoring. REST reads are Cloudflare-cached and cannot confirm a write. Token equals full account access. Sleeper can break or block this at any time. |
| **ESPN** | No. Writes go to `lm-api-writes.fantasy.espn.com` with `espn_s2` / `SWID` cookies. | Suggest-only unless you accept the same risks as Sleeper. | Not probed. |

### MCP servers: what exists and how to use them

Community MCP servers exist for both platforms, all small hobby projects (0 to low stars, no vendor backing):

- Sleeper, read-only: GregBaugues/sleeper-mcp, sourknives/sleeper-mcp-server, FloSchl8/sleeper-mcp, anthonybaldwin/sleeper-api-mcp, justfeltlikerunning/sleeper-fantasy-mcp.
- Sleeper, with unofficial writes (`set_lineup`, `waiver_claim`, `propose_trade`): bealmot/sleeper-mcp (Python, requires `SLEEPER_TOKEN` and `SLEEPER_ENABLE_WRITES=1`). cameron-eth/sleeper-sdk (Python) also implements `lineup-set` and `send-trade` over GraphQL.
- Yahoo, with official writes (`ff_set_lineup`, `ff_change_player_position`, `ff_add_player`, `ff_drop_player`): carterfawson/fantasy-football-mcp and cketcham/fantasy-football-mcp (Python). Read-only: krger/yahoo-fantasy-mcp, spilchen/yahoo_fantasy_mcp.

Recommendation: do **not** make the backend depend on these MCP servers. They are designed for a human driving Claude Desktop interactively, and the underlying REST calls are simple enough to own directly. Instead:

1. The Express backend calls Sleeper REST and Yahoo REST itself (Phase A, D).
2. Expose **Kuangstradamus itself as an MCP server** using `@modelcontextprotocol/sdk` with tools like `analyze_trade`, `import_league`, `season_report`, `suggest_lineup`, and `set_lineup` (Yahoo only, or Sleeper behind an explicit opt-in flag). Then Claude Code or Claude Desktop can drive the whole thing, and the same functions back the web UI.

## 6. Proposed layout

```
kuang-backend/src/
  services/
    sleeper/   client.js  players.js  projections.js  league.js
    yahoo/     oauth.js   client.js   roster.js
    espn/      projections.js            (fallback blend source)
  domain/
    tradeParser.js  valuation.js  lineup.js  season.js  picks.js
  routes/      chat.js  trade.js  league.js  lineup.js
  jobs/        weeklyLineup.js
  db/          schema.sql  index.js       (better-sqlite3)
  mcp/         server.js                  (optional MCP exposure)
```

## 7. Sequenced milestones

| Milestone | Scope | Depends on |
|---|---|---|
| **M0 Hygiene** | Rotate OpenAI key and remove fallback; fix env var name; fix `/api/trade`; delete backup dirs; allow localhost in CORS; remove dead `chat.js`; write READMEs. | nothing |
| **M1 Free data** | Sleeper service with cache and name resolution; delete Fantasy Nerds; update placeholder text; basic tests for parser and matching. | M0 |
| **M2 Valuation v2** | Scoring-aware VORP, ESPN blend, injury/bye flags, unmatched-player errors, richer parser. | M1 |
| **M3 League import + season report** | Sleeper import, SQLite, analytics endpoints, a "League" page in the frontend. | M1 |
| **M4 Lineup optimizer + weekly job** | Optimizer, diff output, scheduled suggestions, notifications. | M3 |
| **M5 Yahoo** | Apply for API access first (lead time unknown); OAuth flow; import; official auto-set. | M4, Yahoo approval |
| **M6 Optional** | Sleeper unofficial auto-set behind `SLEEPER_ENABLE_WRITES` with dry-run; MCP server exposure. | M4 |

## 8. Decisions for the owner

1. Keep the OpenAI proverb as-is, downgrade the model, or cache proverbs to cut the second paid dependency.
2. SQLite on a Railway volume vs Railway Postgres.
3. Whether Sleeper unofficial writes are acceptable for your own account, or suggest-only is enough.
4. Apply for Yahoo Fantasy API access now so M5 is not blocked later.

## 9. Backlog (added 2026-09-16)

- **FAAB waiver strategist.** Recommend a bid amount, not just a target. Inputs the import already has: each team's remaining FAAB (`waiver_budget` minus `waiver_budget_used`), the league's own bid history from `/transactions/{round}` (every successful and failed claim carries `settings.waiver_bid`), positional need per team from the strength table, trending add counts, and the target's value over replacement. Output: target, suggested bid, win probability at that bid, who else is likely bidding and how much they can afford, and the drop candidate. Later: learn the league's price-per-VORP curve from its own history instead of a global prior.
- **Full league configuration in every recommendation.** Done in the current build for scoring (all `scoring_settings` keys are applied to projected stat lines) and roster slots (used for replacement level and the optimizer). Still to add: `reserve_allow_*` and `taxi_*` rules when suggesting IR / taxi moves, `trade_deadline` awareness in trade targets, `waiver_type` / `daily_waivers` timing in waiver advice, keeper settings.
- **Auto-set adapters.** Yahoo official API once app access is approved; Sleeper unofficial GraphQL only behind an explicit opt-in flag with dry-run.
- **Persistence.** Snapshot imported leagues weekly so the season report can show trends rather than recomputing from live data.
- **Notifications.** Thursday and Sunday lineup-check messages (email or Discord webhook) once a scheduler exists.

## Sources

- Sleeper API docs: https://docs.sleeper.com/
- Sleeper unofficial GraphQL notes: https://github.com/bealmot/sleeper-mcp (API-NOTES.md)
- Sleeper SDK with GraphQL writes: https://github.com/cameron-eth/sleeper-sdk
- Yahoo developer portal and docs: https://sports.yahoo.com/developer , https://sports.yahoo.com/developer/docs/
- Yahoo Node wrapper (read-only roster today): https://y-fantasy-node-docs.vercel.app/resource/roster
- Yahoo Python client with `change_positions`: https://yahoo-fantasy-api.readthedocs.io/en/latest/yahoo_fantasy_api.html
- Yahoo MCP with write tools: https://github.com/carterfawson/fantasy-football-mcp , https://github.com/cketcham/fantasy-football-mcp
- Yahoo read-only MCPs: https://github.com/krger/yahoo-fantasy-mcp , https://github.com/spilchen/yahoo_fantasy_mcp
- Sleeper read-only MCPs: https://github.com/GregBaugues/sleeper-mcp , https://github.com/sourknives/sleeper-mcp-server , https://github.com/FloSchl8/sleeper-mcp , https://github.com/anthonybaldwin/sleeper-api-mcp , https://github.com/justfeltlikerunning/sleeper-fantasy-mcp
- DynastyProcess player ID crosswalk: https://github.com/dynastyprocess/data
