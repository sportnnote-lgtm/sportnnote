# Sport depth: the plan

**Founder direction (2026-10-10):** every sport carries equal importance. Scoring depth and stats at match, team, tournament and player level must reach international standard for all 14 sports.

**Founder scope update (2026-10-10, later the same day):**
- The order is fixed: Wave 0 (live correctness bugs), then Wave 1 (shared foundations), then per-sport depth (Waves 2–3) **and new sports (Wave 4)**. Wave 4 may run alongside Waves 2–3 once Wave 1 lands.
- **New sports to add:** all international-level timed/measured sports (athletics, swimming, archery, shooting, weightlifting, cycling, rowing, canoe/kayak), plus **hockey (FIH)** and **handball (IHF)**.
- Judged sports (gymnastics, diving, boxing) are **not** in this batch. NFL, rugby and other team sports not widely played in India are skipped for now.
- **Wave 1 foundations are designed from day one to cover these sports** (§3.3, GEN-27 results engine).

This plan pulls together the 15 audits in this folder (`football.md` … `cricket.md`, plus `cross-sport.md`; `tennis.md` also holds the shared racket/net core audit). The method is in `README.md`. The build queue is `BACKLOG.md` (SD-01 …).

Conventions:
- Per-sport IDs are the auditors' own IDs (`FB-04`, `TN-08` …).
- **GEN- IDs in this file are new.** The audits used GEN numbers that clash (GEN-01 means something different in five files). §3.1 maps every old label to its new number. From now on, use only the numbers in this file.
- New-sport items are SD-90 … SD-102 (§7).
- "Subsumed" means a GEN item delivers that item. The sport then ships only its spec: its keys, labels and defaults.

---

## 1. Headline: depth today

●●● deep (international standard, or close) · ●● partial (correct, but below the official stat set) · ● thin (generic floor, or wrong numbers)

| Sport | Match | Team | Tournament | Player | Audit |
|---|---|---|---|---|---|
| Cricket | ●●● 25 action types, full scorecard, FoW, partnerships, absolute `statTotals`, corrections | ● tie shows as "D", NR dropped from Played, no top performers, no season NRR | ●● P/W/L/T/NR/NRR table is close to ICC, but the leaders rail is a sum only (no HS, BBI, Ave or SR), and the DLS NRR rule is missing | ●● core Statsguru line, but no true Mat, no format split, no captain/keeper record | `cricket.md` |
| Football | ●●● richest non-cricket capture, FIFA-style stats panel. **But** 45+2' shows as 47', blocked shots count as on target, clean sheets are wrong | ●● P W D L, form, H2H; no GD, clean sheets or discipline | ●● 14 leader categories, but no H2H GD/GF or fair play, and the Golden Glove can go to a defender | ● raw key dump, no Apps or Minutes, draws show as LOST | `football.md` |
| Basketball | ●● good capture, but the box score shows only PTS/REB/AST/STL/BLK/TO/PF and there are no missed FGs. **Bonus is one foul late; technicals and OT fouls are wrong** | ● totals only; no PPG or team per-game | ● **2-0 default (FIBA is 2-1)**, no H2H point difference, leaders by total not average | ● raw dump, 3PM lost, no per-game or % | `basketball.md` |
| Volleyball | ●● engine and set score are right. **No "opponent error", so every point becomes a kill; aces and blocks aren't counted as points** | ● sets only; no point or set ratio | ● FIVB 3-3-2-1 and set/point ratio can't be expressed | ● profile Points ≠ box-score PTS; no sets played, no per-set rates | `volleyball.md` |
| Kabaddi | ●● the raid engine is correct. **Every guided raid credits the raider +1, and the tackle point lands in the raiding team's column** | ● record only; no raid/tackle/all-out breakdown | ● no PKL 5-3-1 (loss ≤ 7) and no SD column; the raid-points board is wrong | ● two summed numbers; defenders lose appearances | `kabaddi.md` |
| Tennis | ●● ITF-grade scoring and serve. **"0–0" after the match; tiebreak score dropped; the Slam preset is wrong;** stats are points and aces only | ● sets only; no games or tiebreak record | ● no ATP sets %/games %; leaders are "points" | ● matches and wins only; W-L depends on attribution | `tennis.md` |
| Badminton | ●● BWF scoring and serve court are right. **"0–0" after the match;** stats are points per player only | ● games only | ● 3+ tied goes to H2H, not games diff (BWF); no points difference | ● points only; no games or points % | `badminton.md` |
| Table tennis | ● thinnest plugin. **"0–0" after the match;** no line scoreboard and no point editor | ● no team match (the standard TT format) | ●● ITTF 3.7.5 ranking is faithful; **cross-group seeding is wrong** | ● points only | `tabletennis.md` |
| Squash | ● scoring is right, but there are no let/stroke/no-let decisions, no conduct, and game scores aren't shown off the live screen. **"0–0" after the match** | ● games only | ● generic 2-1-0 + h2h/diff/for; "points" leaders | ● W/L only; history reads "34 pts" | `squash.md` |
| Padel | ●● own engine, golden point, serve tracking. Stats are PTS only; break, hold and golden-point stats aren't derived | ● sets only | ● no games-difference tie-break | ● no sets or games W-L, no per-partner record | `padel.md` |
| Pickleball | ● **the "Tournament" preset is rally scoring; the named server is wrong** (roster[0]); points only | ● games only; no point differential | ● diff = games, not point differential | ● W/L only | `pickleball.md` |
| Golf | ●● strokes, putts, WHS net, Stableford. FIR/GIR/penalties have no capture UI | ● no team golf (best N of M) | ● **missed-cut players are ranked among those who made the cut**; no R1–R4 or total column, no WD/DQ; golf is missing from leaders | ●● custom career, but **best round mixes 9 and 18 holes** and putts/round has the wrong denominator | `golf.md` |
| Chess | ●● result-only is the standard: 9 FIDE methods, colour, time control | ● no team match (boards) | ●● round robin is FIDE-grade. **Swiss has no bye point and no Buchholz;** pairing is greedy and colour-blind | ● draws show as LOST; win rate ignores draws; no colour or time-control record | `chess.md` |
| Carrom | ●● ICF engine is replay-checked. **The scoreboard reads 0 : 0 after the match;** no breaker or slams | ● no team championship tie | ● no points-difference tie-break | ● **losers get no line, so everyone has a 100% win rate;** doubles partner uncredited | `carrom.md` |

The new sports (§7) are not in the app yet, so they have no rating. They must be "born deep".

Root causes, from `cross-sport.md` §1:
1. Stat definitions are spread over six or more maps.
2. Leaders and awards can only *sum* a key.
3. Only cricket has absolute `statTotals`.
4. Stat lines exist only for credited players.
5. `StatLine.won` is a boolean.
6. 10 of the 14 sports use generic 2-1-0 standings.

---

## 2. Wave 0: live correctness bugs (fix first)

Wave 0 is everything that shows **wrong** numbers today, not just missing depth. That makes 13 shippable items. Wave 0 has no dependency on Waves 1–3. Most items ship with no migration; SD-11 needs one.

| SD | Item | Sport | Sources | Size | Migration | Event-log impact |
|---|---|---|---|---|---|---|
| SD-01 | **Final score after the match.** Once a match ends, `summary()` returns sets/games won plus the set/game scores, not the reset current-game "0–0". This fixes the result alert, ticker, MiniScore and CorrectMatch screen | tennis, badminton, TT, squash, pickleball (rallyCore), carrom | TN-00, BD-01, TT-01, CR-01; tennis.md shared core | S | no | none (summary projection) |
| SD-02 | **Tennis scoreline correctness.** Keep the tiebreak score per set and render 7-6(4) everywhere. Add a Grand Slam deciding set (10-point tiebreak *at 6-6*, `finalSetTBAt`) and fix the `gs5` preset, which today plays a champions' tiebreak | tennis | TN-04, TN-08 | S | no | none (state rebuilt on replay); new format value only |
| SD-03 | **Kabaddi raid/tackle attribution.** Credit the raider with the raid points actually scored (nothing on an empty or failed raid). Emit the tackle point as a defending-side `tackle` event, so the box score, half columns and timeline are right. Fix REMOVE_EVENT's ordinal, make Edit re-dispatch `RAID_OUTCOME`, and fix the scoreboard winner on a draw or shootout. A voice "tackle" on a super tackle should credit 2 | kabaddi | KB-01 | M | no | logged actions unchanged, so the same score replays; derived events change (intended). Optional `raiderId`/`tacklerId` on `RAID_OUTCOME` |
| SD-04 | **Volleyball point credit.** Add an "Opp. error" capture (serve / attack / net fault, optional player) and a "Serve error" capture, so a team point is one tap and not a fake kill. ACE and BLOCK also add `points:1`. Update the match MVP weights at the same time | volleyball | VB-01, VB-02 | M | no | new `OPP_ERROR`, `SERVE_ERROR`; `extra.points` on ACE/BLOCK attribution; `rallyEdit` kinds extended. Old logs replay identically |
| SD-05 | **Basketball FIBA rules.** Bonus from the 5th team foul (`foulsForBonus: 4`). Add a `techIsTeamFoul` flag (FIBA true, NBA false). OT fouls carry over from Q4 (FIBA). Default classification becomes win 2 / loss 1. In full-court games the "+1" button goes to the FT flow (3×3 keeps 1-pt FGs) | basketball | BK-01, BK-02 (points part), BK-03 (+1 part) | S | no | config keys only; absent = legacy behaviour |
| SD-06 | **Pickleball formats and server.** Presets match real events: USA Pickleball/PPA side-out bo3 to 11, 15, 21, a Medal preset, MLP rally 21, and Rec rally 11. The current rally "Tournament" preset is renamed. Right-court server identity comes from one "who starts on the right" pick plus score parity, and the headline reads "Serving: Asha (right) · 4-2-1" | pickleball | PB-01, PB-02 | M | no | new pre-serve `SET_START_RIGHT`; absent = roster order (identical replay) |
| SD-07 | **Golf leaderboard and profile bugs.** Missed-cut players rank below those who made the cut, labelled MC, and next-round picks exclude them (with a litmus test through `buildLeaderboard`). Best round counts only complete 18-hole rounds (best 9 shown separately). Putts/round uses putt-tracked rounds only (`puttHoles`). Countback applies only to complete cards; partial cards show "T" | golf | GF-01, GF-03, GF-12 (countback part) | M | no | format jsonb `cutAfterRound`/`cut`; stat-line keys `puttHoles`, `holesPlayed18` |
| SD-08 | **Football minutes and shots.** Show 45+2' / 90+4' from (`half`, `minute`) and sort the timeline by (half, minute, id). Use the ordinal minute only behind a new-match flag. A blocked shot gets `onTarget:false, blocked:true` and the blocker gets `blocks` | football | FB-03, FB-05 | S | no | new `blocked` payload key; optional `state.minuteOrdinal` init flag; old logs unchanged (documented) |
| SD-09 | **Football clean sheets.** Derive time on the pitch from the lineup, subs and reds. The clean sheet goes to the GK who was on the pitch longest when the opponent scored 0. Award it on every completion path, including a shootout, and re-evaluate it on correction. Write `cleanSheets`, `goalsConceded` and `minutes` absolutely. Golden Glove = GK only (clean sheets → saves → fewer conceded) | football | FB-04, FB-02 (derivation), FB-11 (GK part) | M | no | stop dispatching `CLEAN_SHEET` for new matches; it is ignored in old logs once totals own the key |
| SD-10 | **Chess Swiss bye point.** A pairing-allocated bye scores 1 by default (organiser can choose 1, ½ or 0) and counts as unplayed for tie-breaks. Forfeits are excluded from SB and played-game stats | chess | CH-01, CH-08 (forfeit part) | S | no | none (`Match.byes` already stored; `byePoints` in formats jsonb) |
| SD-11 | **Every player who played gets a line, with W/D/L/T/NR.** At completion, write an appearance line (`apps:1`, `starts`) for every matchday-squad or roster player, including both sides and both doubles partners (unused subs excluded). Add `stat_lines.result` ('W','D','L','T','NR') and keep `won` for back-compat. The profile pill, win %, and W-D-L read it, so draws stop showing as LOST and carrom stops showing a 100% win rate | all | **GEN-01**; FB-01, FB-07, CK-08 (apps), CR-02 (lines), cross-sport GEN-03/X3/X6, kabaddi GEN-01, tennis GEN-APP | M | **yes** (0050: `stat_lines.result` + backfill from `matches.winner` / `result.kind`) | none |
| SD-12 | **Standings and team-record bugs.** The overall house table uses each sport's organiser points and adjustments (X1). Cross-group seeding uses the sport's real tie-breakers (`h2hRatio`, `h2hPoints`, `sb`, `wins`) instead of falling back to "score for" (X2). The team page counts NR in Played (X4). Cricket ties show "T", not "D", there's an NR column, and `LeagueTable` shows no run difference | all; cricket labels | cross-sport X1, X2, X4; CK-02 (label part) | S | no | none |
| SD-13 | **Cricket NRR rules.** Add a `standingsScore` hook. In a DLS-decided match, Team 1 is credited (revised target − 1) off Team 2's allotted overs. An innings that ends with no batter available counts as all out. Team 1 keeps its original quota when the cut hit only Team 2. Gated on `dlsV`, so legacy tables don't move | cricket | CK-05 | S | no | none (read-side) |

**Re-sync note.** SD-03, SD-04, SD-09 and SD-11 fix *future* numbers immediately. Past stat lines heal when the sport's absolute `statTotals` re-syncs them (Waves 1–2). Founder decision D2 covers backfilling.

---

## 3. Shared foundation (GEN), de-duplicated and renumbered

### 3.1 Old label → new number

| Audit | Old label → new |
|---|---|
| cross-sport | GEN-01 schema → **GEN-02** · GEN-02 aggregate → **GEN-03** · GEN-03 appearance/result → **GEN-01** · GEN-04 statTotals → **GEN-06** + per-sport items · GEN-05 line context → **GEN-12** · GEN-06 match records → **GEN-21** · GEN-07 standings kit → **GEN-04** (+ X1/X2 in SD-12) · GEN-08 box/career components → **GEN-10 / GEN-11** · GEN-09 team stats → **GEN-15** · GEN-10 award slots → **GEN-14** · GEN-11 ticker → **GEN-26** · GEN-12 atomic increment → **GEN-25** |
| kabaddi | GEN-01 → GEN-01 · GEN-02 → GEN-11 + GEN-06 · GEN-03 → GEN-05 · GEN-04 → GEN-04 · GEN-05 → GEN-10 |
| chess | GEN-02 → GEN-11 · GEN-03 → GEN-05 · GEN-06 → GEN-17 · GEN-07 → GEN-13 (+ SD-10) |
| carrom | GEN-01 → GEN-01 · GEN-02 → GEN-06 / GEN-11 · GEN-03 → GEN-04 / GEN-05 · GEN-06 → GEN-17 |
| tennis | GEN-RES → SD-01 · GEN-RS → GEN-09 · GEN-RC → GEN-11 (+ GEN-06) · GEN-TB → GEN-04 · GEN-TIE → GEN-17 · GEN-PO → GEN-22 · GEN-H2H → GEN-16 · GEN-APP → GEN-01 |
| squash | GEN-01 → GEN-07 · GEN-02 → GEN-22 (+ GEN-09) · GEN-03 → GEN-24 · GEN-04 → GEN-04 · GEN-05 → GEN-16 · GEN-06 → GEN-06 / GEN-11 · GEN-07 → GEN-23 · GEN-08 (ranking points) → parked |
| padel | GEN-01 → GEN-07 · GEN-02 → GEN-22 · GEN-03 → GEN-24 · GEN-04 → GEN-04 · GEN-05 → GEN-16 · GEN-06 → GEN-06 / GEN-11 · GEN-08 → parked · GEN-09 → GEN-09 |
| pickleball | GEN-01 → GEN-07 · GEN-02 → GEN-22 · GEN-02a → GEN-09 · GEN-04 → GEN-04 · GEN-05 → GEN-16 · GEN-06 → GEN-06 / GEN-11 · GEN-11 → GEN-24 · GEN-10 (rating) → parked |
| football (named) | apps/minutes → GEN-01 / GEN-19 · draws → GEN-01 · career → GEN-11 · box → GEN-10 · tie-breakers → GEN-04 · leaderboard chains → GEN-14 · discipline → FB-12 · statTotals → GEN-06 |
| basketball (named) | label registry → GEN-02 · box → GEN-10 · statTotals → GEN-06 · career → GEN-11 · leaders by average → GEN-14 · team per-game → GEN-15 · game flow → GEN-20 · h2h diff → GEN-04 |
| volleyball (named) | point outcome → SD-04 + GEN-22 · statTotals → GEN-06 · FIVB points → GEN-04 · serve/rotation → VB-05 (feeds GEN-09) · sub tracker → GEN-19 · box → GEN-10 · career → GEN-11 |
| golf (named) | field results → GEN-18 · career → GEN-11 · field-entry admin → GF-04 · team aggregation → GF-07 · rating trend → GF-09 / CH-07 · per-unit detail row → GF-02 |
| cricket (refs) | GEN-02 → GEN-03 · GEN-03 → GEN-01 · GEN-04 → GEN-01 · GEN-05 → GEN-12 · GEN-06 → GEN-21 · GEN-07 → GEN-14 |

### 3.2 The GEN items

| GEN | What it is | Unlocks / subsumes | Size | Migration | Event-log impact | Wave (SD) |
|---|---|---|---|---|---|---|
| **GEN-01** | **Appearance + result lines.** At completion, every player who took part gets a line, and `result` is W/D/L/T/NR | FB-01, FB-07, CK-08 (apps), CR-02 (lines), X3, X6, tennis GEN-APP. Precondition for every career and win % | M | **yes** (0050) | none | 0 (SD-11) |
| **GEN-02** | **Per-sport stat schema** (`plugin.statSchema`): key, labels (singular/plural/short), group, `agg` (sum / max / min / best(cmp) / rate(num, den, scale) / perGame / perSet / countIf), qualifier, MVP weight, and flags for box / career / leader / award / headline / teamAgg. **One definition** drives the box score, career, leaders, awards, MVP and labels. It replaces `STAT_CATEGORIES`, `STAT_WEIGHTS`, `SPORT_AWARDS`, `EXTRA_SLOTS`, `STAT_LABELS` ×2, `HEADLINE_ORDER` and `UNIT`. Cricket's `cricketCareer.ts` is the proof spec | Every raw-key label gap (FB-17 labels, BK labels, VB `blocks`, CH `wins/draws/losses`, CR `boards/queens`, TN `doubleFaults`). Basketball's "single label registry" | L | no | none (reads existing keys) | 1 (SD-15) |
| **GEN-03** | **Aggregate engine** over the schema: `careerOf`, `leaders`, `teamTotals`. Handles max / best figure / rate with a minimum qualifier / per-game / per-set / count-if, with coverage-aware denominators (only lines that tracked the input) and per-category tie-break chains | CK-01 (engine), BK-07 (rank by average), FB-11 (Golden Boot chain), KB-08 (strike rate with a minimum). Feeds GEN-11 / 14 / 15 | M | no | none | 1 (SD-16) |
| **GEN-04** | **Standings rule kit.** (a) Margin-aware points `pointsFor(result, margin, setScore)`: FIVB 3-3-2-1-0, PKL 5-3-1 (loss ≤ 7) via `lossBonus`, FIBA 2-1 + forfeit 0, **FIH 3-1-0 with shoot-out bonus variants (e.g. SO win 2 / SO loss 1)**, **IHF 2-1-0**. (b) Tie-breakers `h2hDiff`, `h2hFor` (with restart among the subset), `setRatio`, `pointRatio`, `gamesDiff`, `pointsDiff`, `setsPct`, `gamesPct`, `played`, `fairPlay` (from cards), and explicit **lots** ("level, organiser decides") instead of the silent name order. (c) Cluster-size branching (BWF: 2 tied → H2H; 3+ → games diff → points diff). (d) `standingsPoints` providers for volleyball, tennis, badminton, padel and carrom. (e) Per-sport defaults that follow the bodies (decision D1), **including FIH and IHF tie-break chains** (IHF: points → H2H points → H2H goal difference → H2H goals → overall GD → overall goals). Swiss tie-breaks live in GEN-13 | BK-02 (rest), VB-04, KB-07, FB-10, TN-07, BD-03, SQ-05, PD-04, PB-07, CR-06, CK-06 | M–L | no (formats jsonb) | none | 1 (SD-17) |
| **GEN-05** | **Standings columns per sport**: PF/PA/± (basketball), SD (kabaddi), GD (football), Sets / SR / PR (volleyball), G± / P± (carrom, racket), Pts + TB1..n (chess). A "Player" header for individual sports and W/D/L behind a toggle where the sport hides it | CH-04, KB-08 (SD column), BK-02 (columns), CR-06 (columns) | S | no | none | 1 (SD-18) |
| **GEN-06** | **Absolute `statTotals` everywhere.** The shared contract and replay-test harness, plus **one rally/racket implementation** in rallyCore (TT, squash, pickleball) and the tennis, badminton and padel engines: `gamesWon/Lost`, `setsWon/Lost`, `ptsWon/Lost`, `decidersWon/Played`, tiebreaks, `partnerId`, singles/doubles. Event sports implement the same contract in Wave 2 | SQ-02 (totals), PD-03 (totals), PB-06 (totals), TN-06 / BD-04 / TT-08 (keys). Unlocks FB-06, BK-05, VB-03, KB-02, CR-02, CH-05 (keys). Fixes X5 for completed matches | M (+ M per event sport) | no (stats jsonb) | none (derived); keys absent on old lines until re-sync | 1 (SD-19) |
| **GEN-07** | **Game/set score line on results.** Store per-period scores in the result (`result.periods`) and show "3-1 (11-7 9-11 11-5 11-8)", "6-4 3-6 [10-7]" and "7-6(4)" on the match card, result banner, share text and history row. Add a `LineScoreboard` in rallyCore. Retired, w/o and default markers ("6-4 2-1 ret.") | SQ-01, PD-01 (padel must store match-tiebreak points in the set entry), PB-04, TT-02, TN-11; the history scoreline in TN-06 / BD-04 / TT-08 | M | no (result jsonb) | none (derived at completion) | 1 (SD-20) |
| **GEN-08** | **Point editor for rally-engine sports.** `rallyEngine` learns `EDIT_LOG` / `STAT_ADJUST` via `replayPoints`, and `RallyPointEditor` is mounted in rallyCore and padel. A `rally` kind with `wonBy` makes side-out hand-outs and 2nd-server events replay | TT-03, SQ-08, PB-10, PD-06 | M | no | `EDIT_LOG` / `STAT_ADJUST` in the rally engine (old logs never contain them). `wonBy` key on side-out events going forward; old ones inferred | 1 (SD-21) |
| **GEN-09** | **Rally-stats engine from serve replay.** Replay the point log through the reducer and tag each point with the server (`serve.ts`, `ttServer`, last-rally-winner). Gives points won on serve / receive, total points won %, holds/breaks, break points saved/converted, golden points, tiebreaks, side-outs and points per service turn, longest run, biggest lead, game/match points saved, and the score at the interval. Per set and overall, as a match-stats panel. Covers 7 sports: tennis, padel, badminton, TT, squash, pickleball, plus volleyball once VB-05 lands | TN-03, BD-02, TT-04, PD-02, PB-03. TN-05 (`FAULT`) adds 1st-serve %; VB-05 adds volleyball | M | no | none (pure derivation, old logs included) | 1 (SD-22) |
| **GEN-10** | **Shared box score** (`StatTable`, schema-driven): period toggle, sticky name column, starters marked, **team totals row**. Plus a home-vs-away **team comparison panel**. Replaces the bespoke BoxScore files and `PointBoxScore` where the schema covers them | BK-04 (component), VB-07, FB-09 (component), KB-03 (panel) | M | no | none | 1 (SD-23) |
| **GEN-11** | **Shared career framework** (`CareerGrid` with sections: totals, per-game/per-set averages, rates with coverage denominators, bests and milestones, curated game-log line) **plus the racket career spec**. The racket spec covers W-L split by singles/doubles, sets/games/points W-L %, deciders, tiebreaks, comebacks, best run, titles/finals from `bracketChampion`, per-partner record, and history with the scoreline. Replaces the raw-key dump in `SportProfileScreen` | Racket: TN-06, BD-04, TT-08, SQ-02 (UI), PD-03 (UI + partner), PB-06 (UI + partner). Event-sport specs follow in Waves 2–3: FB-08, BK-06, CH-05, VB-08, KB-04, CR-05; golf GF-03 / GF-17 use it | M | no | none | 1 (SD-24) |
| **GEN-12** | **Line context and splits.** A read-time join of each line to its match (preset/format, ball type, singles/doubles, tournament, season, opponent, colour, time control) gives filter chips on the career, leaders and awards | CK-03 (cricket classification spec), CH-05 (by colour / time control), racket singles/doubles split | M | no (optional `stat_lines.format` column later) | none | 1 (SD-25) |
| **GEN-13** | **Swiss done properly** (any Swiss sport). Buchholz, Buchholz Cut-1, Median and Progressive, with FIDE C.07 handling of unplayed rounds; Swiss chess default `bhc1, bh, sb, wins`. Colour-aware, score-group Dutch approximation (S1 vs S2, floaters, no 3 in a row, imbalance ≤ 2) that writes White into the fixture. The bye point is already in SD-10 | CH-02, CH-03 | M | no | optional fixture key `white`; old matches default to home | 1 (SD-26) |
| **GEN-14** | **Leaderboards and award slots from the schema.** Rank by per-game average with a minimum where the body does (FIBA), add best-figure and rate slots, and give each sport its correct slots: drop "Top scorer" for racket sports and use wins, win %, games %, aces, holds %, BP converted %. MVP weights from the schema (basketball EFF, volleyball after SD-04, tennis DF −1) | BK-07, TN-10, BD-07, TT-12, SQ-13, KB-08 (boards), VB-08 (FIVB awards part), FB-11 (rest), CK-01 (categories), CH-12 (P2) | M | no | none | 1 (SD-27) |
| **GEN-15** | **Team stats and records from the schema.** Per-game team averages (PPG / opp PPG / margin, REB / AST / TO / FT%), sport unit and "difference" label (NRR, set ratio, GD), result kinds T / NR, team leaders (fixes the empty cricket and chess lists), and a records block (GD, clean sheets, failed to score, biggest win/defeat, unbeaten run, highest/lowest totals) | BK-08, VB-09, FB-15, CK-02 (rest), KB-09 (P2) | M | no | none | 3 (SD-46) |
| **GEN-16** | **Head-to-head and form for individuals** (player vs player, last 5) | SQ-11; tennis / badminton / TT / padel / pickleball H2H rows | M | no | none | 3 (SD-47) |
| **GEN-17** | **Team ties.** One fixture made of N rubbers: TT Swaythling / Corbillon / Olympic, chess boards, carrom team, Davis Cup, Thomas / Uber / Sudirman, squash teams. Lineups and order, auto-created rubbers, stop at the majority, ½-point rubbers. Group standings count ties: match points, then rubbers / board points, games, points | TT-05, CH-11, CR-08, BD-09, tennis GEN-TIE, PB-13 (P2), GF-16 (½-point part, P2) | L | TBD at spec (TT/BD audits: none, using `__series*` + `__seriesSlot` in formats; chess/carrom: "likely") | new `__seriesSlot` key; rubbers stay normal matches | 3 (SD-48) |
| **GEN-18** | **Field results in tournament leaders, awards and the medal table.** Include field-event lines (`eventId`); final positions feed `medalStandings` position points | GF-08 (golf categories: low round, birdies, eagles, fewest putts, GIR %; drop "holes won"). Golf rides the GEN-27 leaders/medal path, so this becomes mostly golf's spec | M | no | none | 3 (SD-49) |
| **GEN-19** | **Time-on-field / on-court tracker** from the lineup + SUB (+ red cards), **including timed suspensions** (hockey green 2 min / yellow 5–10 min, handball 2-minute, kabaddi yellow 2 min). Gives minutes, +/-, starters, sets played and players-on-field counts. Generalises the football derivation built in SD-09. **Moved into Wave 1** because hockey and handball need it | BK-10, VB-06 (sets played), FB-02 (display in box score and career); KB-06 suspension timing; SD-101, SD-102 | M | no | none (VB-06 adds its own `SUB`) | 1 (SD-29) |
| **GEN-20** | **Game-flow stats** for running-score sports: biggest lead, lead changes, times tied, largest run, bench points | BK-09 (also football and kabaddi summaries) | S | no | none | 3 (SD-50) |
| **GEN-21** | **Match-records hook** `plugin.matchRecords(state)`, persisted in the snapshot (partnerships, team totals, team highs, tiebreaks), which the tournament Records card reads | CK-07; basketball team high; tennis tiebreaks | M | no (rides `matches.state`) | none (derived on snapshot; one-off backfill replay) | 3 (SD-51) |
| **GEN-22** | **Optional point-outcome tag.** Off by default and stamped in `tracked[]` for coverage. Tags: winner / forced / unforced error / service fault / kitchen / smash (padel por 3 / por 4), credited to the player (`attribution2` for the error maker) | PD-05, PB-05 (P1); TN-12, BD-06, TT-11, SQ-10 (P2); volleyball shape already in SD-04 | M | no | optional `POINT.payload.how` / `outcome`; absent = plain point | 3 (SD-52) |
| **GEN-23** | **Conduct, cards and penalty events** in racket sports and volleyball: warning → penalty point → penalty game → match, with `AWARD_GAME` in the engines | SQ-04 (P1); TN-13, TT-10, BD-11, VB-10 sanctions (P2) | M | no | new `CONDUCT` / `CARD` / `AWARD_GAME` actions (additive) | 3 (SD-53) |
| **GEN-24** | **Rally timeouts + match/game duration.** `TIMEOUT` in the rally engine (1 per match for TT; 2/3 per game for pickleball), shown in the timeline and stats. Durations from event `created_at` | TT-06, PB-08 (timeouts + switch-ends prompt), SQ-09 (P1); TN-14, BD-12, TT-13, PD-11 (P2) | S | no | new `TIMEOUT` action (no score effect) | 3 (SD-54) |
| **GEN-25** | **Atomic stat increment** RPC (`jsonb_set` in one UPDATE … ON CONFLICT). Live mid-match lines stop losing or duplicating increments on an outbox retry. Optional once GEN-06 covers every sport | cross-sport X5 | S | **yes** (RPC + unique index on `stat_lines(match_id, player_id, sport)` if absent) | none | 3 (SD-55), optional |
| GEN-26 | Generic `tickerDetail` from the schema | cross-sport GEN-11 | S | no | none | parked (P2) |
| **GEN-27** | **Results engine for timed / measured events** (founder, 2026-10-10). Generalises golf's field-competition model (`field_entries`, card snapshots, `rankLeaderboard`). Covers: events with heats / rounds / semis / finals and progression (Q by place, q by time/mark; repechage); start lists, lanes and order, heat sheets; **attempts** with best-of (field events 3 + 3, weightlifting 3 + 3, archery ends × arrows, shooting series); units (time, distance, height, points, kg) with the right ordering (lower vs higher is better) and precision; ties and countback per sport (next-best mark, X/10 count, inner tens, earlier total, jump-off / shoot-off); wind and legal-mark flags; DNF / DNS / DQ (rule ref) / NM / NH; PB / SB, meet and school records; relay and crew teams; team scoring by placings; medal-table and position-points integration (`medalStandings`). Practicality: **one official enters results on a phone**, offline-safe (golf outbox pattern) | Unlocks SD-90 … SD-100. Golf migrates onto it (GEN-18, GF-07 team link, GF-04 status admin pattern). Subsumes golf's "field results" and "team aggregation" GEN candidates | L | **likely** (`field_entries.team_id`, shared with GF-07; heat/round structure prefers jsonb; confirm at spec) | n/a (result snapshots, not an event log; absent arrays = not tracked) | 1 (SD-28) |

### 3.3 Design targets for the Wave 1 foundations (new sports)

Each Wave 1 item must be specced so the new sports fit without rework:

| Foundation | Hockey (FIH) | Handball (IHF) | Timed / measured sports |
|---|---|---|---|
| GEN-02 schema / GEN-03 aggregates | Goals (field / PC / stroke), PCs won / converted, shots, GK saves %, cards | Goals by type (6 m, wing, 9 m, 7 m, fast break), shots / %, 7 m scored / taken, GK saves %, 2-min suspensions | `agg: best` with unit-aware ordering, season best, PB, records; medals |
| GEN-04 rule kit | 3-1-0; shoot-out bonus variants; FIH tie-breakers | 2-1-0; IHF H2H chain | Ranking by result with countback; Q/q progression |
| GEN-06 statTotals | From the event log (quarters) | From the event log (halves) | Result snapshots (golf pattern) |
| GEN-10 box score / GEN-11 career | Per-quarter box; GK section | Per-half box; GK section | Results sheet per heat / final; athlete career by event (PB, SB, best per season, medals) |
| GEN-19 tracker | Green / yellow timed suspensions; red = permanent | 2-min suspensions; disqualification | n/a |
| GEN-14 leaders / awards | Top scorer, best GK | Top scorer, best GK, 7 m % | Best marks, medals, records broken |
| GEN-27 results engine | n/a | n/a | Core |

---

## 4. Per-sport items (after GEN subsumption)

Only P0/P1 items remain in this section. "→" shows where each subsumed ID went. P2 items are listed in §6.2.

### Football (`football.md`)
Subsumed: FB-01 → SD-11 · FB-02 → SD-09 + GEN-19 · FB-03, FB-05 → SD-08 · FB-04 → SD-09 · FB-07 → SD-11 · FB-10 → GEN-04 · FB-11 → SD-09 + GEN-14 · FB-15 → GEN-15

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| FB-06 | Football `statTotals`: goals by type, assists, shots/SoT/blocked, saves, cards, apps/starts/minutes, clean sheets, GA, own goals, penalties. Adds `playerId` to goal/card/sub payloads (names kept for old logs) | P0 | M | SD-30 |
| FB-08 | Football career spec (Outfield / Goalkeeper / Discipline / Bests; G per 90, conversion %, save %; hat-tricks; curated history line) | P0 | M | SD-39 |
| FB-09 | Football box score spec (No · Min · G · A · Sh(OT) · cards; GK Saves/GA) + HT score; drop the dead `PlayerStatLine.goals` | P1 | M | SD-56 |
| FB-12 | Discipline table + suspension rule ("N yellows / 1 red → misses next match" warning on the squad picker) | P1 | M | SD-70 |
| FB-13 + FB-14 | Own goals credited to the player; shootout taker/keeper per kick (scored/saved/missed) | P1 | S+S | SD-80 |

### Basketball (`basketball.md`)
Subsumed: BK-01 → SD-05 · BK-02 → SD-05 + GEN-04/05 · BK-07 → GEN-14 · BK-08 → GEN-15 · BK-09 → GEN-20 · BK-10 → GEN-19

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| BK-03 | Missed FG capture ("Miss 2 / Miss 3", optional player). `fgMade/fgAtt/threesMade/threesAtt` extras; a "Track missed shots" coverage toggle | P0 | M | SD-31 |
| BK-04 + BK-05 | FIBA box score spec (FG / 3P / FT M-A, OREB / DREB, +/-, EFF, team fouls per period) on GEN-10, plus basketball `statTotals` | P0 | M+M | SD-40 |
| BK-06 | Basketball career spec (PPG / RPG / APG / SPG / BPG / TOPG, FG% / 3P% / FT%, career highs, double-doubles, EFF/game) | P0 | M | SD-44 |
| BK-11 | FIBA timeouts per half (2 / 3 / 1 per OT); "End as a draw" only where the format allows it | P1 | S | SD-57 |

### Volleyball (`volleyball.md`)
Subsumed: VB-01, VB-02 → SD-04 · VB-04 → GEN-04/05 · VB-09 → GEN-15

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| VB-03 | Volleyball `statTotals` (points, attack / block points, aces, serve errors, errors, sets played); heals past lines | P0 | M | SD-32 |
| VB-05 | Serve tracking (first server, optional rotation); pre-fills Ace / Serve error; feeds GEN-09 | P1 | M | SD-58 |
| VB-06 | Substitutions (6 per set counter) + libero swap → sets played (on GEN-19) | P1 | M | SD-71 |
| VB-07 + VB-08 | Box score spec (PTS · Att · Blk · Ace · SE · Err + opp. errors in team totals) and career spec with per-set rates; FIVB awards (Best Scorer, Best Blocker blk/set, Best Server ace/set) | P1 | S+M | SD-81 |

### Kabaddi (`kabaddi.md`)
Subsumed: KB-01 → SD-03 · KB-07 → GEN-04 · KB-08 → GEN-05/14 · KB-09 → GEN-15

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| KB-02 | Kabaddi `statTotals` from `raids[]`: raid / touch / bonus / tackle points, raids, successful, empty, out, super raids/tackles, do-or-die | P0 | M | SD-33 |
| KB-03 | PKL match-centre panel (raid / tackle / all-out / extras, strike rates, super raids/tackles, all-outs on the timeline) on the GEN-10 comparison panel | P0 | M | SD-41 |
| KB-05 | Technical points and line-outs (`TECH_POINT`, folded into the raid replay) | P1 | S | SD-59 |
| KB-06 | Cards: green / yellow (2-min suspension changes the mat count) / red | P1 | M | SD-72 |
| KB-04 | Kabaddi career spec (pts/match, raid strike %, not-out %, tackle %, Super 10s, High 5s, best match) | P1 | M | SD-82 |
| KB-11 | Rule check: do a caught raider's touches score? Verify against AKFI/IKF; if not, gate on `payload.v === 2` (see D6) | P1 | S | SD-83 |

### Tennis (`tennis.md`)
Subsumed: TN-00 → SD-01 · TN-03 → GEN-09 · TN-04, TN-08 → SD-02 · TN-06 → GEN-06/11 · TN-07 → GEN-04 · TN-10 → GEN-14 · TN-11 → GEN-07 · TN-12 → GEN-22 · TN-13 → GEN-23 · TN-14 → GEN-24

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| TN-01 + TN-02 | Double fault as a first-class point kind (timeline, DF column, `rallyEdit` `df`, reconcile on edit, labels) + one-tap Ace / Double fault for the current server | P0 | S+S | SD-34 |
| TN-05 | 1st-serve tracking (`FAULT` button) → 1st serve %, 1st/2nd serve points won (into GEN-09) | P1 | M | SD-60 |
| TN-09 (+ PD-08) | Doubles serving order chosen per set (ITF Rule 14); the same pick fixes padel server naming | P1 | S | SD-73 |

### Badminton (`badminton.md`)
Subsumed: BD-01 → SD-01 · BD-02 → GEN-09 · BD-03 → GEN-04 · BD-04 → GEN-06/11 · BD-07 → GEN-14 · BD-09 → GEN-17. Badminton's P0 depth all comes from Wave 1.

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| BD-08 | Fast doubles scoring: two big "Rally won" buttons; player credit optional (long-press) | P1 | S | SD-61 |
| BD-05 | Doubles server and receiver by name (Law 11) | P1 | M | SD-74 |

### Table tennis (`tabletennis.md`)
Subsumed: TT-01 → SD-01 · TT-02 → GEN-07 · TT-03 → GEN-08 · TT-04 → GEN-09 · TT-05 → GEN-17 · TT-06 → GEN-24 · TT-08 → GEN-06/11 · TT-12 → GEN-14. All P0 depth comes from Wave 1.

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| TT-07 | Doubles service/receive order by name (Law 2.14), switch at 5 in the decider, change-ends cue | P1 | M | SD-62 |

### Squash (`squash.md`)
Subsumed: SQ-01 → GEN-07 · SQ-02 → GEN-06/11 · SQ-04 → GEN-23 · SQ-05 → GEN-04 · SQ-08 → GEN-08 · SQ-09 → GEN-24 · SQ-10 → GEN-22 · SQ-11 → GEN-16 · SQ-13 → GEN-14

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| SQ-12 (+ PB-12, PD-10) | Engine replay tests (PSA final, English hand-out game; PPA side-out doubles; Premier Padel final). Ships **first in Wave 1** to protect GEN-06/07/08 | P1 | S | SD-14 |
| SQ-03 | Let / Stroke / No Let decisions (the sport's signature), counted in the box score and profile | P1 | M | SD-63 |
| SQ-06 (+ PB-11) | "Serves first (racket spin / toss)" exposed; verify pickleball's game-2 first server | P1 | S | SD-65 |

### Padel (`padel.md`)
Subsumed: PD-01 → GEN-07 · PD-02 → GEN-09 · PD-03 → GEN-06/11 · PD-04 → GEN-04 · PD-05 → GEN-22 · PD-06 → GEN-08 · PD-08 → SD-73 · PD-10 → SD-14 · PD-11 → GEN-24

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| PD-07 | Star Point deuce option (FIP 2026). Verify the rule text first (D5) | P1 | S | SD-64 |
| PD-09 | Timeline: "Game {team}" / "Break {team}" / "Hold" instead of "Game home" | P1 | S | SD-75 |

### Pickleball (`pickleball.md`)
Subsumed: PB-01, PB-02 → SD-06 · PB-03 → GEN-09 · PB-04 → GEN-07 · PB-05 → GEN-22 · PB-06 → GEN-06/11 · PB-07 → GEN-04 · PB-08 → GEN-24 · PB-10 → GEN-08 · PB-11 → SD-65 · PB-12 → SD-14. No per-sport P0/P1 items remain.

### Golf (`golf.md`)
Subsumed: GF-01, GF-03 → SD-07 · GF-08 → GEN-18 · GF-12 (countback) → SD-07

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| GF-04 | Entry admin: WD / DQ / DNS, edit handicap, remove (host long-press → existing `updateFieldEntry`) | P0 | S | SD-35 |
| GF-05 | Pro leaderboard columns: total strokes, R1–R4, "F" in the hub, "–" before tee-off, cut line, card drill-down with a round picker | P0 | M | SD-42 |
| GF-02 | Per-hole stats row (fairway L/✓/R, penalties, bunker; GIR, scrambling and sand saves derived), remembered toggle | P0 | M | SD-45 |
| GF-06 | Gross + net boards side by side (Best Gross / Best Net; one prize per player option) | P1 | S | SD-66 |
| GF-07 | Team stroke play, best N of M (school format) | P1 | M | SD-76 (uses SD-28's `field_entries.team_id`) |
| GF-09 | Handicap Index field + trend + estimated differential labelled unofficial | P1 | M | SD-84 |
| GF-10 | Match play with per-hole strokes and handicap dots; back 9 numbered 10–18 | P1 | M | SD-87 |
| GF-11 | Proper scorecard view (Out / In / Total, net, points and putts rows, ○ / □ glyphs) | P1 | S | SD-88 |
| GF-12 | Playoff tie-break option ("Playoff pending" → host records the winner) | P1 | S | SD-89 |

### Chess (`chess.md`)
Subsumed: CH-01 → SD-10 · CH-02, CH-03 → GEN-13 · CH-04 → GEN-05 · CH-11 → GEN-17 · CH-12 → GEN-14

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| CH-05 | Chess career spec: score and score % (W + ½D), W/D/L by colour and by time control, wins by method, unbeaten streak (colour / tc / method keys on the line) | P0 | M | SD-36 |
| CH-08 | More results (double forfeit 0-0, dead position, adjudication, arbiter decision); player's name in "has White"; exact time control | P1 | S | SD-67 |
| CH-06 | Wall chart / crosstable (RR grid; Swiss "12w1 4b½" rows) | P1 | M | SD-77 |
| CH-07 | Ratings: FIDE ID + rating per time control; seed round 1 by rating; ARO and performance rating | P1 | M | SD-85 |

### Carrom (`carrom.md`)
Subsumed: CR-01 → SD-01 · CR-02 (lines) → SD-11 · CR-06 → GEN-04/05 · CR-08 → GEN-17

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| CR-02 | Carrom `statTotals` (matches, games W/L, boards won/played, points capped to game totals, Queens, both doubles partners) | P0 | M | SD-37 |
| CR-03 | ICF score sheet (board · breaker · winner · coins · Queen · running total; penalty boards marked) | P1 | S | SD-68 |
| CR-04 | Break and slams (toss, auto-alternate; White/Black Slam chip) | P1 | S | SD-78 |
| CR-05 | Carrom career spec (board %, points/board, slams, 25-0 games, best game) | P1 | M | SD-86 |

### Cricket (`cricket.md`)
Subsumed: CK-02 → SD-12 (labels) + GEN-15 (rest) · CK-05 → SD-13 · CK-06 → GEN-04 · CK-07 → GEN-21 · CK-08 (apps) → SD-11

| ID | Item | Pri | Size | SD |
|---|---|---|---|---|
| CK-01 | Records leaderboards spec: HS, BBI, Ave/SR/Econ with qualifiers (default ≥ 30 balls / ≥ 6 overs T20), 4s/6s/50s/100s/maidens/dots/ducks | P0 | M | SD-38 |
| CK-03 | Career by format and ball type (T20 / One-day / T10-box / Hundred / Long; leather / tennis) on GEN-12 | P0 | M | SD-43 |
| CK-04 | Captain and keeper flags in `statTotals` → Captaincy section, keeper dismissals | P1 | S | SD-69 |
| CK-08 (rest) | Career shows BF, ducks, bowling innings, 4w/5w | P1 | S | SD-79 |

---

## 5. Sequencing

| Wave | What | Items | SD range |
|---|---|---|---|
| **0** | Live correctness bugs | **13** | SD-01 … SD-13 |
| **1** | Shared foundations, designed for the new sports too (racket P0 depth arrives here) | **16** | SD-14 … SD-29 |
| **2** | Per-sport P0, round-robin by sport | **16** | SD-30 … SD-45 |
| **3** | P1: generic first (3a), then per-sport round-robin (3b) | **44** (10 + 34) | SD-46 … SD-89 |
| **4** | New sports, born deep. Runs alongside Waves 2–3 once Wave 1 lands | **13** | SD-90 … SD-102 |
| Parked | P2 (§6.2) | ~45 | not numbered |

### Wave 1 order and why
1. SD-14 replay tests (squash / pickleball / padel). These are the safety net before the rally-engine changes.
2. SD-15 GEN-02 schema, then SD-16 GEN-03 aggregate. Everything that shows a stat reads these.
3. SD-17 GEN-04 rule kit, then SD-18 GEN-05 columns. These fix FIVB, PKL, BWF, ATP, padel, pickleball, FIBA H2H and FIFA H2H tables at once.
4. SD-19 GEN-06 statTotals (contract + rally/racket).
5. SD-20 GEN-07 score line, then SD-21 GEN-08 point editor, then SD-22 GEN-09 rally stats. All three touch rallyCore, so they ship one after another.
6. SD-23 GEN-10 box score, then SD-24 GEN-11 career (+ racket spec).
7. SD-25 GEN-12 splits, SD-26 GEN-13 Swiss, SD-27 GEN-14 leaderboards and awards.
8. SD-28 GEN-27 results engine (timed / measured events; golf moves onto it) and SD-29 GEN-19 time-on-field tracker with timed suspensions. Wave 4 needs both.

After Wave 1, the six racket sports have reached their audits' P0 depth: score line, serve/return stats, career, tie-breaks, correct awards and the editor.

### Wave 2 round-robin (one item per sport per round)
- **Round 1:** FB-06 · BK-03 · VB-03 · KB-02 · TN-01/02 · GF-04 · CH-05 · CR-02 · CK-01
- **Round 2:** FB-08 · BK-04/05 · KB-03 · GF-05 · CK-03
- **Round 3:** BK-06 · GF-02

Badminton, TT, squash, padel and pickleball have no Wave 2 rows because their P0s were all generic (Wave 1).

### Wave 3 round-robin (3b)
- **R1:** FB-09 · BK-11 · VB-05 · KB-05 · TN-05 · BD-08 · TT-07 · SQ-03 · PD-07 · SQ-06/PB-11 · GF-06 · CH-08 · CR-03 · CK-04
- **R2:** FB-12 · VB-06 · KB-06 · TN-09/PD-08 · BD-05 · PD-09 · GF-07 · CH-06 · CR-04 · CK-08
- **R3:** FB-13/14 · VB-07/08 · KB-04 · KB-11 · GF-09 · CH-07 · CR-05
- **R4:** GF-10 · GF-11 · GF-12

### Dependencies (explicit)

| Item | Needs | Why |
|---|---|---|
| Every career / leaders / award item | SD-11 (GEN-01), GEN-02, GEN-03 | Appearances and W/D/L are the denominators; the schema provides labels and aggregates |
| FB-06, BK-05, VB-03, KB-02, CR-02, CH-05 | GEN-06 contract | Same `statTotals` path and test harness |
| SD-03, SD-04, SD-09 (past matches) | KB-02, VB-03, FB-06 + decision D2 | Wrong historical lines heal only on an absolute re-sync |
| BK-05 / BK-06 | BK-03 | FGA / 3PA / FG% need the miss tap |
| BK-04, VB-07, KB-03, FB-09 | GEN-10 | Shared table and comparison panel |
| FB-08, BK-06, CH-05, VB-08, KB-04, CR-05 | GEN-11 | Career framework |
| CK-01, GEN-14 | GEN-03 | max / best / rate + qualifier |
| CK-03, CH-05 (splits) | GEN-12 | Line context |
| GEN-09 (rally stats) | GEN-07 recommended first; TN-05 for 1st-serve %; VB-05 for volleyball | Serve per point; FAULT input; rotation |
| GEN-08 (editor) | SD-14 tests; `wonBy` on side-out events | Side-out replay correctness |
| TN-01 | GEN-08 not required (tennis already has the editor) | — |
| VB-06, BK-10 display | GEN-19 | On-court tracker |
| CH-06 | GEN-13 | Colours and Swiss rounds feed the wall chart |
| CH-11, CR-08, TT-05, BD-09 | GEN-17 | Team-tie fixture shape |
| GEN-18 | SD-07, GF-05 | A correct field leaderboard before it feeds medals |
| GF-07 | migration (`field_entries.team_id`) | Team link |
| KB-06 | SD-03, KB-05 | Suspensions replay inside `replayRaids` |
| GEN-04 defaults | D1 | Which points system is the default per sport |
| GEN-25 | — | Optional; drop if GEN-06 + per-sport statTotals cover all live drift |
| SD-90 … SD-100 (timed / measured sports) | SD-28 (GEN-27), SD-11, SD-15, SD-16, SD-24, SD-27 | Results engine, appearance lines, schema, career, leaders |
| SD-93 combined events | SD-90, SD-91 | Scores come from track and field marks |
| SD-101 hockey, SD-102 handball | SD-11, SD-15 … SD-19, SD-23, SD-24, SD-27, SD-29 | Team-match foundations + timed suspensions |
| SD-49 (GEN-18 golf into leaders / medals) | SD-28 | Golf rides the results engine's medal path |

---

## 6. Migrations and out of scope

### 6.1 Migrations (founder runs them; numbers are assigned in build order; latest live = 0049)

| # (provisional) | For | What | Before it runs |
|---|---|---|---|
| 0050 | SD-11 (GEN-01) | `stat_lines.result text` (nullable) + backfill from `matches.winner` / `result.kind` | Appearance lines still written; pill falls back to `won` (draw = LOST until run) |
| 0051 | SD-28 (GEN-27) | `field_entries.team_id` (relays, crews, team scoring; reused by GF-07 / SD-76). Heat / round structure goes in jsonb unless the spec shows otherwise | Team / relay results hidden with the "needs the latest database update" notice |
| 0052 | SD-55 (GEN-25), optional | `increment_stat` RPC + unique index on `stat_lines(match_id, player_id, sport)` if absent | Today's non-atomic increments |
| TBD | SD-48 (GEN-17) | Only if the spec can't fit ties in formats jsonb (`__series*`, `__seriesSlot`) | — |
| later, optional | GEN-12 | `stat_lines.format text` for server-side split queries | Read-time join works without it |
| P2 | GF-16 | Pair entries for four-ball / foursomes | — |

No other item needs a migration: they ride `stat_lines.stats`, `matches.state`/`result` and `formats` jsonb.

### 6.2 Parked P2 (not in the queue until promoted)
FB-16, FB-17 (toggles; labels go via GEN-02), FB-18, FB-19 · BK-12, BK-13 · VB-10 (via GEN-23 / GEN-24), VB-11 · KB-09 (via GEN-15), KB-10 · TN-12, TN-13, TN-14 (via GEN-22/23/24) · BD-06, BD-10, BD-11, BD-12 · TT-09, TT-10, TT-11, TT-13 · SQ-07, SQ-10 · PD-11, PD-12 · PB-09, PB-13 · GF-13, GF-14, GF-15, GF-16, GF-17 · CH-09, CH-10, CH-12 · CR-07, CR-09 · CK-09 (D3), CK-10, CK-11, CK-12 · GEN-26 ticker · ranking points by round reached (squash/padel GEN-08) · self-contained Elo / DUPR-style rating (note only).

### 6.3 Out of scope (needs tracking cameras or extra spotters)

| Sport | Not proposed |
|---|---|
| Football | xG / xA, big chances, distance and sprints, heatmaps, full pass counts and maps, duels/aerials, pressures, GK distribution, offside lines / VAR. Possession stays an optional time estimate |
| Basketball | Shot charts and location, points in paint, fast-break points, exact seconds played (approx. MIN is in scope), hustle stats, live shot clock |
| Volleyball | Attack attempts / efficiency as default (optional mode VB-11 is P2), reception quality, digs, excellent sets, zones, serve speed, libero touch stats |
| Kabaddi | Raid duration, raid-zone maps, tackle skill type, every unsuccessful tackle attempt, live named revival at PKL pace (KB-10 optional P2) |
| Tennis | Serve speed and placement, return depth, rally length, Hawk-Eye, spin, full stroke-type winner/error split |
| Badminton | Shuttle speed, placement, rally length, stroke-type breakdown, movement |
| Table tennis | Ball speed/spin, placement, rally length, stroke types, expedite "13 returns" count |
| Squash | Shot-type mix, T-position, rally length in shots, ball speed, distance |
| Padel | Shot maps (bandeja / víbora / chiquita), glass usage, net position %, ball speed, rally length |
| Pickleball | 3rd-shot success, dinks, rally length, placement, ball speed, kitchen-line time |
| Golf | Strokes Gained, driving distance, proximity, putt length, per-shot club/lie, shot maps |
| Chess | Live move-by-move entry by a scorer, engine analysis / accuracy, per-move clocks, certified FIDE (JaVaFo) pairing |
| Carrom | Stroke-by-stroke pockets, fouls and dues per stroke, pocketing %, shot types, time per turn |
| Cricket | Ball speed, Hawk-Eye line/length and release analytics, control % / false-shot % |
| Hockey / handball | Tracking data (distance, speed, heatmaps), shot location maps, possession by tracking |
| Timed / measured sports | Live integration with fully automatic timing / photo-finish, EDM and scoring-target hardware (results from them are **typed in**), split timing by transponder, reaction times |

**Not in this batch (founder):** judged sports (gymnastics, diving, boxing). Skipped for now: NFL, rugby and other team sports not widely played in India.

---

## 7. Wave 4: new sports, born deep

Every new sport ships with the full "born deep" set, built on the Wave 1 foundations: live scoring or result entry (one official, one phone), a box score or results sheet, career (PB / SB / bests, or a team-sport career), standings or rankings, records, leaderboards, awards and a public guide. The sport-policy rule still applies: international-level sports only.

| SD | Sport | International body and standard | Shape | Notes |
|---|---|---|---|---|
| SD-90 | Athletics: track | World Athletics Competition & Technical Rules | Heats → semis → final, lanes, Q/q, times (hand times flagged), wind (100 / 200 / hurdles / horizontal jumps), relays | Largest school-meet demand (D9) |
| SD-91 | Athletics: field | World Athletics Technical Rules | Attempt cards (3 + 3 for the top 8), countback on next best; height progression O / X / –, jump-off; NM | |
| SD-92 | Athletics: road / cross-country | World Athletics road and XC rules | Mass start, finish order and time, team scoring by placings | |
| SD-93 | Athletics: combined events | World Athletics combined-events scoring tables | Points per event → total; deca / hepta / school pentathlon | Needs SD-90, SD-91 |
| SD-94 | Swimming | World Aquatics Swimming Rules | Heats / semis / finals by time, lanes, splits, relays, DQ codes | |
| SD-95 | Archery | World Archery Rulebook | Ranking round (ends × arrows, 10s / X count), set-system (recurve) and cumulative (compound) matches, shoot-off | Uses the bracket for matches |
| SD-96 | Shooting | ISSF General Technical Rules | Qualification series (decimal / integer), finals elimination, tie-breaks by inner tens and last series | |
| SD-97 | Weightlifting | IWF Technical & Competition Rules | Snatch + clean & jerk, 3 attempts each, total, bodyweight categories, attempt order | Tie: the lifter who reached the total first |
| SD-98 | Cycling (track / road) | UCI Regulations | Road: mass start, ITT, GC by time; track: sprint, keirin, pursuit, points / scratch | |
| SD-99 | Rowing | World Rowing Rules of Racing | Heats → repechage → finals by time; crews, boat classes | Crews use `team_id` |
| SD-100 | Canoe / kayak sprint | ICF Canoe Sprint Competition Rules | K / C 1–4, heats → semis → finals by time | Slalom later |
| SD-101 | Hockey | FIH Rules of Hockey + FIH tournament regulations | 4 × 15-min quarters, field goals / penalty corners / strokes, green / yellow / red cards with timed suspensions, shoot-out; 3-1-0 + SO bonus variants | Team-match foundations + GEN-19 |
| SD-102 | Handball | IHF Rules of the Game + IHF regulations | 2 × 30-min halves, 7 m throws, 2-min suspensions, yellow / red / blue cards, GK saves %, team timeouts, 7 m shoot-out; 2-1-0 + IHF tie-breakers | Team-match foundations + GEN-19 |

Order inside Wave 4: athletics track, then field (school meets first), then swimming, then hockey and handball. These can interleave with the timed sports, because they use different foundations. Archery, shooting, weightlifting, then cycling, rowing and canoe follow. Then road and combined events.

---

## 8. Founder decisions — ✅ ALL APPROVED with the recommended defaults (2026-10-10)

| # | Decision | Options | Recommended default |
|---|---|---|---|
| D1 | **Default points system per sport** for new tournaments (school meets) | (a) the international body's system as the default: FIBA 2-1, FIVB 3-3-2-1-0, PKL 5-3-1 (≤ 7), FIH 3-1-0 (shoot-out bonus off unless the event uses it), IHF 2-1-0, BWF / ATP / padel / pickleball orders, FIFA H2H chain; (b) keep "simple 2-1-0" and offer the body's system as a preset | **(a)** for tournaments created after the change, with a one-tap "Simple 2-1-0" preset. Existing tournaments keep their stored config (consistent with "keep all live tournaments as is") |
| D2 | **Re-sync past matches** once each sport's absolute `statTotals` lands. Kabaddi raid points, volleyball points and clean sheets change on live profiles | (a) one-off backfill of stat lines for all completed matches; (b) heal only on the next correction | **(a)** backfill **player stat lines** (they are wrong today), but never alter tournament points configs or published awards. Announce it in the changelog |
| D3 | **Multi-innings cricket** (Test / 2-day school games: declarations, follow-on, innings win, BBM), CK-09 | in scope now / park | **Park (P2)** until a school asks. The one-innings "Test / timeless" preset stays |
| D4 | **Pickleball "Tournament" preset** switches to side-out (USA Pickleball / PPA bo3 to 11) and the current rally preset becomes "Rec (rally 11)" | yes / no | **Yes** (SD-06). Existing matches keep their stored format |
| D5 | **Padel Star Point** (FIP 2026) | add as an option / wait | **Add as an option** (not the default) after checking the FIP 2026 text. Golden point and advantage stay |
| D6 | **Kabaddi rulebook of record** (scoring rules such as touches + raider caught, KB-11; tie-break order) | AKFI/IKF / PKL | **AKFI/IKF for scoring rules**, with PKL 5-3-1 and an SD-first order as a preset. KB-11 changes behaviour only for new matches (`v:2`) |
| D7 | **Swiss pairing standard** for chess | (a) in-app colour-aware Dutch approximation, labelled "not FIDE-certified", plus later TRF import (CH-10) for rated events; (b) certified pairing only | **(a).** Bye defaults to 1 point (organiser can choose ½ or 0) |
| D8 | **Optional detail modes stay off by default** (missed FGs, 1st-serve faults, point-outcome tags, volleyball detailed mode, golf per-hole stats) with coverage shown ("not tracked" instead of a false 0) | off / on by default | **Off by default, remembered per scorer**, with coverage flags. This protects the one-phone scoring pace; organisers can turn a mode on per tournament |
| D9 | **First athletics event list for school meets** (new-sport scope) | (a) the full World Athletics programme at once; (b) a school-meet core first | **(b):** 100 / 200 / 400 / 800 / 1500 / 3000 m, sprint hurdles, 4×100 and 4×400 relays, long jump, high jump, triple jump, shot put, discus, javelin, with U-age categories. Steeplechase, pole vault, hammer, road, race walks and combined events follow in SD-92 / SD-93 |
