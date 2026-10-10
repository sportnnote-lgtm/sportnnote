# Cross-sport levels — depth audit (generic infrastructure)

Standard sources: the per-sport bodies listed in `README.md`, plus these points-table and tie-break rules:
- FIFA World Cup 2026 regulations, art. 13: points → h2h pts → h2h GD → h2h GF → GD → GF → fair play.
- FIBA Internal Regulations, Book 1 D.1: 2 points a win, 1 a loss, 0 a forfeit. Ties: h2h classification points → h2h point difference → h2h points scored → all-games point difference → all-games points scored.
- FIVB pool ranking: matches won → match points (3-0 / 3-1 = 3, 3-2 = 2, 2-3 = 1) → set ratio → point ratio → h2h.
- Pro Kabaddi League: win 5, tie 3, loss by ≤ 7 points 1 → then score difference.
- BWF General Competition Regulations 16.2: matches won → h2h (2 tied) → game difference → point difference.
- ITTF Handbook 3.7.5.
- ATP round robin: wins → h2h (2 tied) → sets % → games %.
- Premier Padel: wins → h2h → sets difference → games difference.
- FIDE C.07: Sonneborn-Berger / Buchholz / wins / direct encounter.
- ICC NRR.

Summary: The generic layer gives every sport a working floor:
- a league table with h2h / diff / for tie-breaks, organiser points and adjustments;
- a summed-counter leaderboard;
- a summed-counter career grid;
- team form / h2h / leaders;
- a stat-weight MVP and award slots;
- event-level corrections;
- a summary-only ticker.

Above that floor, depth is **hand-written per sport in scattered places**, so it exists almost only for cricket. Cricket has `statTotals`, `cricketCareer.ts`, `tickerDetail`, a CorrectionEditor and its own Summary. Football has rich match stats and a ticker. Golf has a custom career block and absolute round stats. The other 11 sports reduce to "points" in every level above the match. The root causes are structural:
1. **Stat definitions live in 6+ separate maps**, each keyed by sport: `STAT_CATEGORIES`, `STAT_WEIGHTS`, `SPORT_AWARDS`, `EXTRA_SLOTS`, `STAT_LABELS` ×2, `HEADLINE_ORDER`, `UNIT`.
2. **The leaderboard and award engine can only sum a key.** It cannot do max, best figure, rate, per-game average or qualifiers.
3. **Only cricket implements absolute `statTotals`.** Every other sport depends on live read-modify-write increments, which are non-atomic: `repos.ts:2646-2665`.
4. **Stat lines exist only for players who were credited a stat**, so "Matches" is not appearances.
5. **`StatLine.won` is a boolean**, so draws, ties and no-results read as LOST.
6. **Standings rules are generic** (2-1-0 + h2h/diff/for) for 10 of 14 sports, while the real bodies use different match-point systems: FIBA, FIVB, PKL, BWF, ATP, padel.

## 1. Infrastructure inventory (what each generic piece does)

| Piece | File | What it gives every sport | Limits found |
|---|---|---|---|
| SportPlugin contract | `src/sports/types.ts:240-375` | `result`, `standingsRate`, `standingsPoints`, `statTotals`, `snapshot`, `tickerDetail`/`tickerFlash`, `Summary`, `autoPotm`, `CorrectionEditor`, `correctable` | No declarative stat schema. Depth hooks are optional and mostly unimplemented outside cricket |
| Standings | `src/data/standings.ts:90-115,182-252` | points config per sport (football 3, chess 1-½-0, TT 2-1, else 2-1-0), NR points, adjustments, recursive tie-break with ITTF restart | Tie-breakers limited to `h2h, nrr, diff, for, wins, sb, h2hRatio, h2hPoints` (`:66`). Missing: h2h diff / h2h for (FIFA, FIBA), set / point ratio (FIVB), Buchholz (Swiss), fair play, margin-dependent points (PKL "loss ≤ 7", FIVB 3-2). `availableTieBreakers` hard-codes 3 sport branches (`:111-115`) |
| Overall (multi-sport) table | `standings.ts:355-371` | sums per-sport points by team name | Calls `teamStandings(matches, sport)` with the **default config**: organiser points (e.g. 3-pt win) and adjustments are ignored in the overall table (`:362`) |
| Groups / seeding | `src/data/groups.ts:33-42` | best-placed qualifiers across groups | `seedCmp` maps every non-`nrr`/`diff` tie-breaker to **`for`**. TT (`h2hRatio`, `h2hPoints`) and chess (`sb`, `wins`) cross-group seeding silently fall back to "score for" (`:34,38`) |
| Leaders | `standings.ts:375-485` | `STAT_CATEGORIES` per sport, `leadersByKey` = **sum** of a key, coverage flags | Sum only, so no max, best, rate, average-per-game or qualifier. 9 sports have 1–2 categories |
| Player stats rollup | `src/data/stats.ts:32-61` | sums all keys per sport | "Matches" = number of lines, not appearances. `won` boolean only. Every key is summed blindly, so tennis career "points" is meaningless |
| Career UI | `src/screens/SportProfileScreen.tsx:146-215` | golf custom (`:146-171`), cricket custom (`:183-200`), everyone else gets a **raw dump of summed keys** (`:201-215`) | WON/LOST pill: draw, tie and NR show LOST (`:293`). Win rate counts a draw as a non-win (`:179`) |
| Team stats | `src/data/teamStats.ts:37-98`, `TeamProfileScreen.tsx:117,183-235` | P/W/D/L, form, for/against, h2h, leaders via `SPORT_AWARDS` | NR dropped from P (`teamStats.ts:29-30`). `UNIT` for only 5 sports (`:25`). Cricket and chess leaders are empty (`ratings.ts:98,103`). No per-sport team box (possession %, FG %, set ratio…) |
| Ratings / MVP | `src/data/ratings.ts:13-37,122-158` | linear stat weights per sport | Racquet sports and pickleball are weighted `points: 1` only, so the MVP is "most points" |
| Awards | `ratings.ts:74-106,189-205,239-300` | MVP + `SPORT_AWARDS` slots (+ cricket / chess extras) | Slots are all "highest summed key". No best-figure / rate slots. "Top scorer" offered for tennis / badminton / padel / squash / TT / pickleball, which is not an award those sports give |
| Match summary | `src/components/MatchSummary.tsx:38-45` | generic stat-line ratings + `awardsFor` | Cricket only has its own `Summary` |
| Stat sync (absolute) | `src/data/statSync.ts:37-76`; called from `useLiveMatch.ts:124-126`, `amendments.ts:53` | idempotent absolute rewrite at completion / correction | **Only cricket implements `statTotals`.** Golf writes absolute round lines via its own path (`golf.ts:308`, `golf/engine.ts:452`) |
| Live attribution | `useLiveMatch.ts:230-262` | `attribution` / `attribution2` / `extra` → `recordStatLine` increments | Non-atomic select-then-update (`repos.ts:2646-2665`): two scorers or a retried outbox can lose or duplicate increments. Fixed only where `statTotals` re-syncs |
| Corrections | `CorrectMatchScreen.tsx:104-110`, `src/sports/amend.ts:34-145` | generic `EventCorrectionList` (void / replace event) + `statDeltas` for every sport | Rich editor only for cricket (`cricket/index.tsx:1911-1912`). Without `statTotals`, corrections rely on delta arithmetic |
| Ticker | `src/sports/ticker.ts` | summary-based model for all | `tickerDetail` / `tickerFlash` only for cricket and football |

## 2. Matrix — 14 sports × generic levels

Legend: ✅ international-standard depth · ⚠️ generic floor / partial · ❌ missing. "Events" = distinct scorer action types in the plugin (from the reducers).

| Sport | Events | Box score / scorecard | statTotals (absolute) | Career section | Team stats | Tournament leaders | Sport-specific standings tie-breaks | Award slots | Correction | Ticker detail |
|---|---|---|---|---|---|---|---|---|---|---|
| Cricket | 25 | ✅ full card, FoW, partnerships, overs (`cricket/scorecard.ts`) | ✅ `scorecard.ts:247` | ✅ `cricketCareer.ts` (bat / bowl / field) | ⚠️ generic; no leaders, tie = D, no NRR | ⚠️ 3 (runs / wkts / ct) | ✅ NRR all-out rule, NR pts (DLS rule missing) | ✅ POT + bat + bowl | ✅ OverEditor | ✅ + flash |
| Football | 19 | ✅ team match stats + lineup + timeline (`footballStats`, `LineupView`) | ❌ | ⚠️ raw dump (14 keys) | ⚠️ generic (unit goals) | ✅ 14 categories | ⚠️ h2h pts → GD → GF; no h2h GD / GF, no fair play | ✅ POT + scorer / playmaker / clean sheet | ⚠️ generic list | ✅ + flash |
| Basketball | 17 | ⚠️ PTS / REB / AST / PF per quarter (`basketball/BoxScore.tsx`); no FGM-A, 3PM-A, FTM-A, STL, BLK, TO columns although the events exist | ❌ | ⚠️ raw dump; no PPG / RPG / APG | ⚠️ | ⚠️ 5 (sums, not per-game) | ❌ 2-0 (FIBA is 2-1); no h2h point diff | ✅ POT + 3 | ⚠️ generic | ❌ |
| Volleyball | 4 (+EDIT_LOG / STAT_ADJUST) | ⚠️ points / aces per set | ❌ | ⚠️ raw dump | ⚠️ (unit "sets") | ⚠️ 3 | ❌ no 3-3-2-1 points, no set / point ratio | ⚠️ POT + scorer + aces (no blocks) | ⚠️ EDIT_LOG + generic | ❌ |
| Kabaddi | 12 | ✅ raid / tackle / total per half (`kabaddi/BoxScore.tsx`) | ❌ | ⚠️ raw dump; no Super 10 / High 5 / raid strike % | ⚠️ | ⚠️ 2 (no total points) | ❌ no PKL 5-3-1 (loss ≤ 7) | ✅ POT + raider + defender | ⚠️ generic | ❌ |
| Tennis | 5 | ⚠️ points + aces per set; double faults attributed but not shown | ❌ | ⚠️ raw dump ("points") | ⚠️ (no unit) | ⚠️ points / aces | ❌ no sets % / games % | ⚠️ "Top scorer" + aces | ⚠️ EDIT_LOG + generic | ❌ |
| Badminton | 4 | ⚠️ points per player per game | ❌ | ⚠️ raw dump | ⚠️ | ⚠️ points | ⚠️ game diff via `diff`; no point diff | ⚠️ "Top scorer" | ⚠️ EDIT_LOG + generic | ❌ |
| Table tennis | 1 (POINT, rally engine) | ⚠️ `PointBoxScore` points per player | ❌ | ⚠️ raw dump | ⚠️ | ⚠️ points | ✅ ITTF 2-1, h2h, games ratio, points ratio, restart (`standings.ts:99`) — but the cross-group seed is wrong (`groups.ts:34`) | ⚠️ "Top scorer" | ⚠️ generic | ❌ |
| Squash | 1 | ⚠️ PointBoxScore | ❌ | ⚠️ raw dump | ⚠️ | ⚠️ points | ❌ generic | ⚠️ "Top scorer" | ⚠️ generic | ❌ |
| Padel | 2 | ⚠️ PointBoxScore | ❌ | ⚠️ raw dump | ⚠️ | ⚠️ points | ❌ no games difference (score = sets) | ⚠️ "Top scorer" | ⚠️ generic | ❌ |
| Pickleball | 1 | ⚠️ PointBoxScore | ❌ | ⚠️ raw dump | ⚠️ | ⚠️ points | ❌ generic (PPA: wins → h2h → point diff) | ⚠️ "Top scorer" | ⚠️ generic | ❌ |
| Golf | 2 match-play + field events | ✅ hole-by-hole card (field events) | ⚠️ own absolute path (`golf.ts:308`), not `statTotals` | ✅ custom: rounds, scoring avg, best, GIR / FIR, putts (`SportProfileScreen.tsx:146-171`) | ❌ not meaningful (no team aggregate) | ⚠️ birdies / holes won (stroke leaderboard lives in field events) | n/a (stroke play) / generic (match play) | ⚠️ most birdies | ⚠️ generic | ❌ |
| Chess | 2 | ❌ none (result + method + moves only) | ❌ | ⚠️ raw dump (games / wins / draws / losses); draw shows LOST | ⚠️ no leaders (`ratings.ts:103`) | ⚠️ wins / draws (not points 1-½-0) | ✅ SB → wins → h2h; ❌ Buchholz for Swiss | ⚠️ POT + most wins | ⚠️ generic | ❌ |
| Carrom | 1 | ⚠️ board log | ❌ | ⚠️ raw dump | ⚠️ | ✅ points / queens | ❌ generic | ⚠️ scorer + queens | ⚠️ generic | ❌ |

**Weakest sports:**
1. Squash, pickleball and table tennis (1 action type, 1 stat; every level above the match reads "points").
2. Padel, badminton and tennis: score-only racquet depth, and "Top scorer" awards.
3. Chess: no box score, draws shown as LOST, points shown as wins / draws.
4. Volleyball and kabaddi: decent box scores, but their standings rules are wrong for FIVB / PKL.

## 3. Cross-level bugs found (fix regardless of the GEN work)

| # | Bug | Where | Impact |
|---|---|---|---|
| X1 | Overall multi-sport table ignores organiser points config / adjustments | `standings.ts:362` | house table disagrees with the per-sport tables |
| X2 | Cross-group seeding maps `h2hRatio` / `h2hPoints` / `sb` / `wins` to "score for" | `groups.ts:34-38` | wrong best-3rd qualifiers in TT / chess groups |
| X3 | Draw / tie / NR shows **LOST**; win rate counts them as losses | `SportProfileScreen.tsx:179,293`; `StatLine.won` boolean `core/types.ts:333`; `repos.ts:2201-2206` | every drawable sport (football, chess, cricket tie / NR, kabaddi tie) |
| X4 | Team page drops NR matches from Played | `teamStats.ts:29-30` | team P ≠ table P |
| X5 | Non-atomic stat increments | `repos.ts:2646-2665` | lost or double stats with 2 scorers / outbox retry. Absolute sync fixes it, but only cricket has one |
| X6 | "Matches" = lines with a stat, not appearances | `stats.ts:45-48` | a defender with no stat "didn't play" |

## 4. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| GEN-01 | **Declarative per-sport Stat Schema** (`src/sports/<sport>/stats.ts`, exported as `plugin.statSchema`). Each stat: `key`, labels (sing / plural / short), group (Batting / Attack / Serve…), `agg` (`sum` / `max` / `min` / `best(cmp)` / `rate(num, den, scale)` / `perGame` / `countIf(pred)`), `qualifier` (min den), `weight` (MVP), `leader` / `award` / `boxScore` / `career` / `headline` flags, `teamAgg`. **Replaces** `STAT_CATEGORIES`, `STAT_WEIGHTS`, `SPORT_AWARDS` / `EXTRA_SLOTS`, `STAT_LABELS` ×2, `HEADLINE_ORDER`, `UNIT`. Cricket's `cricketCareer.ts` becomes its schema (pattern proof). | P0 | L | all 4 | none (reads existing keys) | no | ✅ core |
| GEN-02 | **Aggregate engine** over the schema: `careerOf(lines, schema)`, `leaders(lines, schema, key, {qualifier})`, `teamTotals`. Supports max / best / rate / perGame / countIf, qualifier filters and coverage flags (reusing `statCoverage`). Drives the leaders rail, award candidates (`rankAwardCandidates`), team leaders and the career grid from one place | P0 | M | Tournament, Player, Team | none | no | ✅ |
| GEN-03 | **Appearance + result lines**: at completion, write a line for every matchday-squad / roster player (`apps:1`). Replace boolean `won` with `result: 'W' \| 'D' \| 'L' \| 'T' \| 'NR'` (keep `won` for back-compat). Profile pill, win % and W-D-L read it | P0 | M | Player, Team | none | **yes**: `stat_lines.result text` (nullable; backfill from `matches.winner` / `result.kind`) | ✅ |
| GEN-04 | **`statTotals` for every event-scored sport** (football, basketball, volleyball, kabaddi, tennis, badminton, TT, squash, padel, pickleball, carrom, chess), derived from each reducer's event list. Makes completion and corrections absolute and fixes X5. Pure, so it can be tested by replaying the `docs/sport-coverage` logs | P0 | M per sport (S for rally sports via `rallyCore` once) | Match → Player | none (derived). Must replay old logs identically; keys absent on old lines stay absent until a re-sync | no | ✅ (one rallyCore implementation covers TT / squash / pickleball, padel and badminton close to it) |
| GEN-05 | **Line context for splits**: read-time join of each line to its match (`config.preset`, format, singles / doubles, tournament, season, opponent team id) → filter chips (format / season / tournament / opponent) on the career, leaders and awards. Optional later `stat_lines.format text` for server queries | P1 | M | Player, Tournament | none | no (optional later) | ✅ |
| GEN-06 | **Match-records hook** `plugin.matchRecords(state)`, persisted in the snapshot: per-match bests that can't be summed (cricket partnerships / team totals; basketball team high; tennis longest rally / tiebreaks; golf best hole). The tournament "Records" card reads it | P1 | M | Tournament, Team | none (derived on snapshot) | no (rides `matches.state`) | ✅ |
| GEN-07 | **Standings rule kit**: (a) margin-aware points: `pointsFor(result, margin, setsScore)` per sport for FIVB 3-3-2-1, PKL 5-3-1 (≤ 7), FIBA 2-1 + forfeit 0. (b) New tie-breakers `h2hDiff`, `h2hFor`, `setRatio`, `pointRatio`, `gamesDiff` (via `standingsPoints`-style providers), `buchholz`, `fairPlay`. (c) Per-sport defaults that match the bodies cited above. (d) Fix X1, X2 | P0 | M | Tournament | none (needs `standingsPoints`-like providers for sets / games; rally sports already supply points) | no (config in `formats` jsonb) | ✅ |
| GEN-08 | **Generic schema-driven Box Score + Career components** (`StatTable` with period toggle; `CareerGrid` with sections). Replace the 5 bespoke BoxScore files and `PointBoxScore` where the schema covers them, and the raw-key dump in `SportProfileScreen.tsx:201-215` | P1 | M | Match, Player | none | no | ✅ |
| GEN-09 | **Team stats per schema**: team aggregates (`teamAgg`: sum / avg per game / ratio), proper result kinds (T / NR from GEN-03), per-sport unit and "difference" label (NRR for cricket, set ratio for volleyball), leaders from the schema (fixes the empty cricket / chess leaders) | P1 | S | Team | none | no | ✅ |
| GEN-10 | **Award slots from the schema**, including best-figure / rate slots (best bowling, best FT %…). Drop "Top scorer" for racquet sports; replace it with sport-correct slots (most aces, most matches won, best games ratio) | P1 | S | Tournament | none | no (`tournaments.awards` jsonb already) | ✅ |
| GEN-11 | **Generic `tickerDetail`** from the schema + summary (set / game scores, server dot, current period, top performer line) for every sport without one | P2 | S | Match | none | no | ✅ |
| GEN-12 | **Atomic stat increment** (RPC `increment_stat(match, player, sport, key, by)` using `jsonb_set` in one UPDATE … ON CONFLICT) as the interim fix for X5 until GEN-04 lands for each sport | P1 | S | Match → Player | none | **yes** (RPC + unique index on `stat_lines(match_id, player_id, sport)` if absent) | ✅ |

Suggested order: GEN-07 (fixes X1 / X2, credibility of tables), then GEN-01 → GEN-02 → GEN-03, then GEN-04 per sport, then GEN-08 / 09 / 10. Then GEN-05 / 06, then GEN-11 / 12 as needed. Cricket's CK-01 / CK-02 / CK-03 fall out of GEN-02 / 09 / 05 once cricket's schema exists.
