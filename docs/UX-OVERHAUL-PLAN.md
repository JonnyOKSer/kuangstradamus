# Kuangstradamus UX Overhaul: The Almanac Redesign

Written 2026-10-31 against `main` at `91fe774`. Companion to `REVIEW-AND-ROADMAP.md`. The visual pitch with mockups is the published artifact "Kuangstradamus Almanac Redesign".

> **Build status 2026-10-31:** Phase 0 and Phase 1 shipped in the Tempered Neon style: URL state, my-team memory, Slips + Ledger, glance strip, week ribbon, hexagram, player sheet, league page with odds bars and heat grid, season ledger as marks, Oracle with give/get, verdict seals and league-rule scoring. Remaining: name chips and the balance scale on the Oracle, the brief/player/pulse endpoints, motion and a11y pass.

## 0. The one-paragraph version

The product's data layer is now excellent and the UI has not caught up. Every screen renders every number at the same altitude, so the Team view puts roughly 250 figures on one scroll and the League page opens on a ten-column table. The redesign keeps the ink, paper and cinnabar identity and reorganises the whole app around the structure a real Chinese almanac (通書) already has: a **day page** you glance at, **slips** (签) you open for one answer, and **ledgers** you consult when you want the records. Three altitudes, one drill path, one player sheet everywhere, and a remembered "my team" so the Almanac opens on what matters to you this week.

## 1. Audit: what is wrong today

Measured by reading `pages/index.js`, `pages/league.js`, `components/ui.js` and the report shapes in `services/analysis.js`.

| Problem | Evidence | Cost to the user |
|---|---|---|
| **One altitude** | Team view renders team card, key dates, lineup (moves with four lines of metadata each, held list, gate-by-gate lineup), full roster table (8 cols), trade targets, sleepers, waiver table (10 cols), drop candidates, all expanded on load. | Nothing says "do these three things". Scroll depth on mobile is several screens before the first actionable item. |
| **Tables as the default container** | Standings 10 columns, strength 8, season report four stacked tables, roster 8, waivers 10. `DataTable` collapses to stacked label/value cards on phones, which for 10 columns is a wall of key-value pairs. | Numbers without hierarchy. Comparison across rows (the point of a table) is lost on mobile. |
| **No "me"** | The app never remembers which team is yours. Every visit: type username, pick league, find your row, press Analyze. League-wide views come first; your week comes last. | Four taps and two network round-trips before any personal insight. |
| **Weak navigation state** | Tabs live inside a card; the team opens as a fourth tab; only `?league=` survives reload; no team deep link; "Go back" is a button that appears when the search box is empty. | Can't share or bookmark "my team", can't use the browser back button, lose place on refresh. |
| **Abstract labels** | "Side A / Side B" on the Oracle; "Starter value", "vs repl.", "σ" in headers; gate names (`gameScript`) exposed raw. | Readers translate the system's vocabulary into theirs on every row. |
| **The player is not an object** | A player's ROS, value, next week, bye, injury, gates and trending are scattered across five tables. There is no single place to look a player up. | Every question about a player becomes a hunt across sections. |
| **Rich context shown as paragraphs** | Scoring audit, bonus calibration, FAAB methodology and gate backtest caveats appear as running text inside cards. | Important honesty about the model reads as boilerplate and pushes content down. |
| **Unused capabilities** | `/api/players/search` exists but the Oracle has no name chips; `analyzeTrade` accepts `leagueId` but the UI never sends it; trade targets produce `offerIdeas` but there is no path to evaluate the offer in the Oracle. | Features built, not surfaced. |

What is already right and must survive: the identity (tokens in `globals.css`, Garamond + Inter + han serif, seals, paper grain, double rules, cinnabar reserved for the oracle's voice), the bilingual copy, the `DataTable` mobile fallback, the honest tone in the footer, the access gate.

## 2. Design principles

1. **Lead with the reading, not the records.** Every screen opens with the oracle's verdict for this week. Records are one tap away, never in the way.
2. **Three altitudes, one drill path.** Glance (one line, one number, one action) → Slip (a card with three to five facts and the "why") → Ledger (the full table or the gate-by-gate trace). Every item in the app is reachable at all three, and the same gesture opens the next one.
3. **Me first.** Pick your team once. The Almanac remembers it and opens on your day page. League-wide views are a tab, not the front door.
4. **Decisions, not data.** Each insight is phrased as an action with a cost and a confidence: "Start Concepcion over Vele, +0.3, within noise: keep as is." "Bid $12 to $18 on Shakir; covers your week 9 WR bye."
5. **The oracle speaks in cinnabar, the ledger in ink.** Verdicts, seals and proverbs carry the voice. Numbers stay quiet, tabular and jade/rust only when they mean good/bad.
6. **Progressive disclosure is the brand.** Divination is a sequence: 卜 ask, 签 draw the slip, 解 read the interpretation, 籍 consult the records. The UI's altitudes map onto it one to one, so the metaphor does structural work instead of decorating.
7. **Mobile is the primary device.** Fantasy decisions are made on phones on Sunday mornings. Desktop gets a second column, not a different app.

## 3. Information architecture

### Routes

The site is a static export on Netlify, so arbitrary dynamic segments cannot be prerendered. State lives in query parameters, which also makes every view shareable.

| Route | Name | Job |
|---|---|---|
| `/` | The Oracle 易 | Trade verdicts. Unchanged job, refined surface. |
| `/league` | The Almanac 盟 | Entry: remembered leagues and teams, or a username / league id. If "my team" is remembered, redirects straight to the day page. |
| `/league?l=ID` | League page | Standings with odds, strength grid, league pulse. |
| `/league?l=ID&t=RID` | **Day page** (team) | The heart of the app: today's reading, slips, ledger. |
| `/league?l=ID&t=RID&open=lineup` | Day page with a slip open | Deep link into one section; also what the browser back button restores. |
| `/league?l=ID&view=season` | Season ledger | Efficiency, luck, odds, schedule as charts. |
| `/league?l=ID&p=PLAYERID` | Player sheet overlay | Any player, from anywhere. |

Browser history: every `open`, `view` and `p` change is a `pushState`, so back closes the sheet or the slip. Reload restores the exact view.

### Global shell

- Header keeps the seal, wordmark, language and theme toggles. Adds a **league switcher** (remembered leagues, "add another") and a **my team** chip. When a team is remembered, the nav item "League Almanac" goes straight to the day page.
- A persistent **week marker** in the header: "Week 8 · lineups lock Sun 1:00 pm" from `/api/state` plus the league's first kickoff. The app is about a weekly deadline; the header should say so.
- Footer unchanged.

### Memory (client only)

`localStorage`: `kuang_leagues` (list of `{id, name, season}`), `kuang_team:{leagueId}` (rosterId), `kuang_recent_consults` (last five Oracle queries). All guarded like `lib/ui.js` already does.

## 4. Page by page

### 4.1 The Oracle (`/`)

Keep the hero and the single question box. Change the answer.

**Ask.** The textarea stays, but names become **chips** as you type: after a comma, "and" or "for", the partial name queries `/api/players/search` and offers up to five candidates in a popover; Enter accepts. Chips show position and team, so "Josh Allen" is unambiguous before you submit. A quiet **league context** control under the box ("Scored as: PPR ▾" / "Scored as: Bless em league rules") sends `leagueId` when a league is remembered, which is the single biggest accuracy win available.

**Answer: the Scale.** Replace "Side A / Side B" with **You give / You get** (the user chooses the direction once; default is left side given). A balance-beam SVG tilts by `marginPct`, capped at 12°. Each pan holds player chips. The verdict is stamped as a **verdict seal** at an angle: 平 even, 微 slight, 勝 clear, 掠 lopsided. Under it, one sentence in the oracle's voice (`reply`) and the proverb in Garamond italic. That is the whole first view.

**The slip.** "Open the slip 拆签" expands per-player rows as **PlayerChips** with value bars, not a nine-column table. Each chip opens the Player sheet. The ledger (the current DataTable with every column) is the third altitude, behind "Consult the ledger 籍".

**Compare rail.** The last five consultations collapse into a horizontal rail of small cards (names + seal). Tapping one scrolls to it. "Start over" clears the rail. This replaces the growing vertical stack.

**Offer builder entry.** The Oracle accepts `?give=ID,ID&get=ID&l=LEAGUE` so the Almanac's trade targets can hand a ready-made question to it.

### 4.2 The Almanac entry (`/league`)

If nothing is remembered: one field, one button, and three example leagues underneath as "try one" cards so the page is never empty. If leagues are remembered: a list of **league cards** (name, season, week, your team name and record, a 12-cell odds spark) and a secondary "find another" field. Picking a league with no remembered team shows the standings with a "this is me" action on each row; choosing it stores the team and opens the day page.

### 4.3 The Day page (`/league?l=&t=`)

Desktop: two columns, 2/3 reading and 1/3 ledger rail. Mobile: one column; the ledger rail becomes a bottom tab bar (Reading · Roster · League).

**Masthead.** Team name, record, rank, a six-line **hexagram meter** of positional strength (one line per position: solid when above league average, broken when below; the number sits beside it), and the week ribbon.

**Week ribbon.** Eighteen small cells, one per NFL week, like almanac day boxes. Marks: current week (cinnabar seal dot), byes for your starters (ink ticks with position initials), trade deadline (a vertical rule with 易), playoff weeks (shaded). It replaces the Key Dates card, the bye outlook list and the milestones list with one strip; tapping a cell opens that week's slip (who is out, who covers).

**Today's reading (glance strip).** Exactly three glance cards, chosen by priority:

1. **Lineup** · "+2.4 if you start Love over Vele" or "✓ Set. Within 1 point of optimal." Action: Open slip.
2. **Waivers** · "Shakir, WR BUF · $12–18 · covers your week 9 bye." Action: Open slip.
3. **Next date** · "Trade deadline in 2 weeks" / "3 WR on bye in week 9, 1 short" / "Playoffs start week 15 · 67% odds." Action: Open slip.

Rules: one number each, one action each, no tables. If the lineup is already optimal the card still appears, in jade, because reassurance is a reading too. The strip renders from a new lightweight payload (see §8) so it paints in under a second even when the full report is still loading.

**Slips (collapsed sections).** Each has a summary row (han glyph, title, one-line state, chevron) and expands in place; one open at a time by default, `open=` in the URL.

- **阵 Start / sit.** Moves only, as swap rows: `FLEX  Love ▸ Vele  +2.4  ●●●○` (confidence dots). "Why" on each row opens the gate trace in the Player sheet. Held decisions and the full recommended lineup move to the ledger. The methodology sentence ("weather and matchup adjust, form is context") becomes an ⓘ tooltip, not a subtitle.
- **补 Waivers.** Top five as cards: name chip, need badge, FAAB range with a tiny distribution tick mark, "upgrade over X (+gain)", and the drop candidate suggested for it. "All 12 targets" opens the ledger table. Sleepers are a sub-slip here ("潜 Deep sleepers · 3") because they are the same decision.
- **易 Trades.** Top three targets as cards: target chip, partner team, hole it fills, and **"Ask the Oracle"** which deep-links to `/` with give/get prefilled from `offerIdeas`. After the deadline this slip collapses to one line and a lock.
- **历 Calendar.** The ribbon is the glance; the slip lists the next four weeks as rows with bye counts, shortages and who covers them.
- **势 Strength.** The hexagram meter expanded: six rows, each position's starter value vs league average as a diverging bar (jade right, rust left, paper midpoint), with the weakest starter named.

**Ledger rail / tab.** Roster (full table, sortable, unchanged columns), Recommended lineup gate by gate, All waivers, Held decisions, Methodology (scoring audit, calibration, FAAB sample size, gate backtest summary). Everything that is currently a paragraph of caveats lives here under "How the oracle reads", written once, well.

### 4.4 League page (`/league?l=`)

**Masthead.** League name, week, one-line scoring summary ("1 PPR · 6-pt pass TD · TE +0.5") with "all 41 rules" opening the methodology ledger. The four stat tiles go; they are facts about the league, not readings.

**League pulse (glance strip).** Three cards: biggest game this week (two teams, projected totals), luckiest and unluckiest (name + luck), hottest free agent in this league (name + trending).

**Standings.** Compact: rank, team (owner small), record, PF, **playoff odds as an inline bar with the percentage**, luck as a small jade/rust dot. Points against, all-play, starter value move to the ledger. Your team row is marked with the seal dot. Tap a row to open that team's day page (yes, you can read other teams; the "my team" chip makes yours the default).

**Strength grid.** Teams × positions **heat grid**: one hue (ink alpha), darker is stronger, number on hover and in the ledger. Replaces the eight-column delta table and is readable at a glance on a phone.

**Season ledger** (`view=season`). Four charts instead of four tables, each with its table behind a toggle:
- Playoff odds: horizontal bars sorted, current wins as a tick.
- Luck: dot plot, expected wins vs actual, connected by a hairline; jade when actual ahead.
- Lineup efficiency: percentage bars with the worst week annotated.
- Strength of schedule: dumbbell of own vs opponent projection.

### 4.5 Player sheet (global)

A bottom sheet on mobile, a right-side panel on desktop, opened from any player name anywhere (`p=` in the URL). Contents, in order:

1. Name, position, NFL team, status dot and text, bye week.
2. **Value line**: ROS points, replacement at position, value above it, positional rank. One sentence: "Worth 63 points more than a free WR in this league."
3. **Next four weeks** sparkline with opponent initials, bye shown as a gap.
4. **This week's gates** (when a week is in scope): the five gates as rows, applied ones with their multiplier, context ones greyed, with the note. This is where the gate trace lives now.
5. Trending adds (if a free agent), FAAB estimate (if applicable), "Ask the Oracle" (prefills a trade with this player).

One component replaces the flags column, the gate-by-gate list, the sleeper "why" lines and half the waiver columns.

## 5. Component system

New or changed components in `components/`:

| Component | Role | Notes |
|---|---|---|
| `GlanceCard` | Headline + one number + one action + chevron | Tone: default, jade (good), cinnabar (urgent). Max three per strip. |
| `Slip` | Collapsible section with summary row | `open` synced to URL; `aria-expanded`; summary row is a button. |
| `Sheet` | Bottom sheet / side panel | Focus trap, Esc closes, back button closes, `inert` on background. |
| `PlayerChip` | Name, pos/team, status dot | The universal tappable player reference. |
| `WeekRibbon` | 18-cell week strip with marks | Scrolls horizontally on phones, current week centred. |
| `Hexagram` | Six-line meter | One line per position; solid/broken plus the number. Never colour alone. |
| `VerdictSeal` | 平 / 微 / 勝 / 掠 chop | Rotated 6 to 10°, stamp animation once, `prefers-reduced-motion` respected. |
| `Scale` | Balance beam for trades | Tilt = min(12°, marginPct / 4). |
| `OddsBar`, `Spark`, `HeatCell`, `Dumbbell` | Small SVG marks | Plain SVG, theme tokens, hover tooltip, table view always available. |
| `Ledger` | Tabbed container of full tables | Hosts the existing `DataTable` unchanged. |
| `NameInput` | Textarea with autocomplete chips | Uses `/api/players/search`; keyboard-first. |
| `LeagueSwitcher`, `MyTeamChip` | Header controls | Backed by localStorage memory. |

Retire: `Stat` tiles on the league masthead; inline `details` for methodology; the "Analyze" button column (rows are tappable).

## 6. Visual language: keep the vibe, sharpen it

> **Superseded 2026-10-31 (owner's call): the visual language is now "Tempered Neon", not the ink-paper-cinnabar tokens below.** After seeing four directions side by side, the owner found the paper palette dated and chose a tempered version of the neon direction: near-black ground (`#0a0a0c`) with a 24-px hairline grid, vermilion `#ff4d3d` as the one accent with glow allowed on exactly one element per screen, electric jade `#35e0a0` for good, cool violet `#a08cff` for below-average (never a second red), amber only for "questionable"; Instrument Serif for verdicts and big numerals, Inter for words, JetBrains Mono for data; 10-px card radius with hairline borders; outlined neon seals; dark only. The structure in this section (type roles, glow budget, three motion moments, data colour having three jobs) still applies. Tokens live in `kuang-frontend/styles/globals.css`.

Keep every token in `globals.css`. Additions are structural, not decorative.

- **Type scale.** Display 36 / 28 / 22 (Garamond 500, `text-wrap: balance`). Body 15 / 14 (Inter). Data 13 tabular. Label 11 uppercase, 0.12em tracking. Han accents 12 / 10. Three sizes of seal: 18 inline, 30 header, 44 verdict.
- **Grid.** 8-pt spacing. Oracle column 48rem. Almanac 64rem with a 2/3 + 1/3 split at ≥ 1024px. Cards keep `rounded-sm` (2px) and hairline borders; only the **sheet** gets a shadow, because it is the one thing that floats.
- **The almanac devices.** Double rule between major sections (exists). Week ribbon cells drawn as almanac day boxes with a hairline grid. Verdict seals and the oracle's one-sentence reading are the only cinnabar on a result. Lot-stick icon (签) is the drill affordance everywhere, replacing chevrons on slips so the metaphor stays consistent.
- **Data colour.** Jade/rust for good/bad only. Heat grids use a single ink-alpha ramp. Diverging charts use jade and rust with paper as the midpoint. No categorical palette is needed anywhere in the plan, so no chart depends on hue to separate series.
- **Dark mode.** Already tokenised; the new SVG marks take `currentColor` and the semantic tokens. Cinnabar-400 on dark grounds, never cinnabar-600.
- **Motion.** Three moments only: the verdict seal stamp (240 ms, scale 1.15 → 1, rotate −8° → −6°, once), sheet slide (200 ms), slip expand (160 ms height). Nothing loops. All disabled under `prefers-reduced-motion`, which `globals.css` already handles.

## 7. Content and copy rules

- Headlines are decisions in the imperative with the cost attached: "Start Love over Vele (+2.4)". Second line is the reason. Third altitude is the trace.
- Vocabulary: "value" is always "points above a free replacement" on first use per page (tooltip). "ROS" becomes "rest of season" in headers; abbreviations only in the ledger. "Side A/B" becomes "you give / you get". Gate names become plain words: availability, weather, matchup, role, form, game script.
- One number per sentence outside tables. Percentages for odds, points for everything else, dollars for FAAB with a range.
- The oracle's voice is reserved for the verdict sentence and the proverb. Everything else is plain and short.
- Chinese: continue full translation; han glyphs stay as section identity; verdict seals use single characters that read in both languages.
- Caveats move to "How the oracle reads" in the ledger, written once with the backtest numbers, and are linked with ⓘ where they apply.

## 8. Backend deltas (small, additive)

| Change | Why |
|---|---|
| `GET /api/league/:id/team/:rid/brief` → `{ lineup: {gain, move, note}, waiver: {top, faab, coversBye}, nextDate, odds }` | Lets the glance strip paint in < 1 s; the full `teamReport` loads behind it. Compute from the same context; trim the payload. |
| `GET /api/league/:id/player/:pid?week=` → player sheet payload (value line, next four weeks with opponents, gates for the week, trending, faab) | One endpoint for the universal sheet instead of five partial shapes. |
| `GET /api/league/:id/pulse` → biggest game, luckiest, unluckiest, hottest FA | League glance strip. |
| `teamReport` adds `priority` ordering for the three glance cards (server decides which three matter this week) | Keeps the client dumb and the rule in one place. |
| Oracle accepts `give`/`get` as Sleeper ids in addition to names | Deep links from trade targets without a second name resolution. |

Everything else already exists in `teamReport`, `leagueSummary` and `seasonReport`.

## 9. Accessibility and performance

- All drill affordances are buttons with `aria-expanded` / `aria-controls`; sheets trap focus and return it on close; the week ribbon is a `role="list"` with each cell labelled ("Week 9: two starters on bye").
- Every chart has a table toggle and a text summary; no information is colour-only (hexagram lines carry the number; luck dots carry the sign).
- Contrast: existing tokens pass; new ink-alpha heat steps must keep text on them at ≥ 4.5:1 or move the number to hover and the table.
- Targets ≥ 44 px, which the current `min-h-11` buttons already satisfy; extend to ribbon cells and chips.
- Performance: glance strip from the brief endpoint; slips lazy-render their body on first open; ledgers mount on tab open; `teamReport` fetched once and shared. Target: first reading visible in < 1 s on a warm backend, < 3 s cold.

## 10. Rollout

| Phase | Scope | Outcome |
|---|---|---|
| **0 · Stop the spew** (2–3 days) | URL state for team/section/sheet; "my team" memory; wrap existing sections in `Slip` collapsed by default; move roster, held, gate trace, methodology into a `Ledger`. No new visuals. | Team view opens on the lineup slip only. Back button works. Shareable links. |
| **1 · The day page** (1 week) | `GlanceCard` strip, `WeekRibbon`, `Hexagram` masthead, `PlayerChip` + `Sheet` with the player endpoint, brief endpoint. | The three-things-this-week experience. |
| **2 · League page** (3–4 days) | Compact standings with `OddsBar`, strength heat grid, league pulse, season ledger as charts with table toggles. | League page readable on a phone. |
| **3 · The Oracle** (3–4 days) | `NameInput` chips, league context, `Scale` + `VerdictSeal`, compare rail, offer-builder deep links from trade targets. | Trades evaluated in league scoring; the two halves of the app finally talk. |
| **4 · Polish** (2 days) | Motion, dark QA, a11y audit (axe + keyboard pass), copy pass against §7, screenshots for the README. | Ship. |

Each phase is independently shippable and leaves the app better than before it.

## 11. Success measures

Measured client-side with a privacy-safe counter (no third-party analytics):

- Time to first reading on the day page: < 1 s warm, < 3 s cold.
- Numbers visible above the fold on the day page: ≤ 12 (today: roughly 60 on desktop, more on mobile before the first actionable item).
- Share of day-page sessions that open at least one slip: > 60%. Sessions that open the ledger: 10 to 20% (it should exist, not dominate).
- Mobile scroll depth to reach the lineup recommendation: one screen (today: three to five).
- Lighthouse accessibility ≥ 95 on both pages, both themes.
- Oracle consultations that run with league scoring: > 50% of consultations from users with a remembered league.

## 12. Open questions for the owner

1. Direction convention on the Oracle: left side = "you give" by default, with a swap control. Agree?
2. Should other managers' day pages be readable, or only your own? The data is public on Sleeper, so the plan allows it.
3. Hexagram meter: six lines map perfectly onto QB/RB/WR/TE/K/DEF, but leagues without K and DEF would show four lines. Acceptable, or use a different meter for those leagues?
4. Is a "league pulse" strip worth a backend endpoint now, or should it wait for Phase 2?
