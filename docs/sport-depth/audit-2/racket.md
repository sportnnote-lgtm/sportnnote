# Audit 2 — racket sports (tennis, badminton, table tennis, squash, padel, pickleball)

Read-only gap audit, 2026-10-11, after the depth programme (SD-01 … SD-119, SD-48 team ties). Measured against the ITF Rules of Tennis + Appendix V, BWF Laws + GCR, ITTF Handbook, WSF Rules of Singles Squash, FIP Rules of Padel, USA Pickleball Rulebook / MLP, plus the ATP/WTA, BWF, WTT, PSA, Premier Padel and PPA match-centre stat sets.

Sources read: PLAN.md, BACKLOG.md (all rows), PROGRESS.md (every racket "Check" / "Not done"), the six per-sport audits, scorer-ux-audit*.md, DEVLOG top; code in `src/sports/{tennis,badminton,tabletennis,squash,padel,pickleball}/*`, `rallyEngine.ts`, `rallyCore.tsx`, `courtCues.ts`, `conduct.ts`, `pointDetail.ts`, `rallyStats.ts`, `boxSources.ts`, `PointButtons.tsx`, `src/data/{teamTie,standings,bracket,lineContext}.ts`, `components/TeamTieView.tsx`, `TieSetup.tsx`; guides `website/guides/score-*.md`, `run-team-ties.md`.

Legend. **Priority:** P0 = wrong result / data loss / dead end; P1 = a real organiser or scorer will hit it soon; P2 = depth or polish. **Size:** S / M / L. **Source:** a rule reference, "known: PROGRESS SD-xx" (from a Not-done / Check list), or "scorer-ux" (from scorer-ux-audit-sports.md, still open). "verify" = I could not confirm the rule text.

**Headline:** no P0 found. The six racket sports are close to federation standard on scoring, match stats, careers and leaders. What is left is (a) tournament structure (no double-elimination / consolation draws), (b) team-tie operations (settlement, lineups, dead rubbers), (c) a few court-procedure gaps (pickleball ends, the pickleball rally-doubles server, squash decisions), and (d) depth polish.

---

## 0. Shared across all six (rallyCore / serve / PointButtons / bracket / team ties)

| # | Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|---|
| R-1 | P1 | Team/tournament | There are no double-elimination, consolation, plate or feed-in draws. A knockout here means single elimination plus a 3rd-place match and a play-in. Pickleball events are usually pools then double elimination. School badminton, TT and tennis events usually run a plate or consolation draw for first-round losers. | `src/data/bracket.ts:23-26,295`; no "consolation / double elim / plate" anywhere in `src/` | Add a losers-bracket generator (double elim, with a grand final and an optional reset) and a plate draw seeded from first-round losers. Both go in the structure editor. | L | USA Pickleball tournament practice; BWF/ITTF junior events (verify) |
| R-2 | P1 | Team ties | A tie may not settle when a non-host scorer finishes the deciding rubber, because `settleTie` is RLS-blocked. It settles only when the host opens the tie page. Until then the group table and the knockout winner are stale. | known | Settle in a SECURITY DEFINER RPC or an edge function on rubber completion. | M | known: PROGRESS SD-48 |
| R-3 | P1 | Team ties | Only the host can enter lineups. Captains can't submit their own order (ITTF ABC/XYZ, Davis Cup nominations are a captain's job). | known | Captain lineup entry: RLS on the rubber `format` keys for the team's captain, hidden until both are in (as today). | M | known: PROGRESS SD-48 |
| R-4 | P1 | Team ties | Dead rubbers default to **Stop** on the Thomas/Uber, Sudirman, Davis Cup and Finals presets. BWF group play (and Davis Cup Finals groups) plays every rubber, and the group tie-breaks are rubbers / games / points difference. A group run with the default ranks 3-way ties on fewer rubbers than the federation would. | `src/data/teamTie.ts:95-107` (`dead: 'stop'`); `components/TieSetup.tsx:101-106` | Pick the default from the stage: groups → Play dead rubbers, knockouts → Stop (the scorer can still change it). | S | BWF GCR team-event regs (verify); known: PROGRESS SD-48 Check "dead rubbers in groups" |
| R-5 | P1 | Team ties | Until `notify-followers` is redeployed, followers get a "Full time" push for every rubber instead of one tie result. | known | Redeploy the edge function (founder live step). | S | known: PROGRESS SD-48 |
| R-6 | P2 | Team ties | Team-page averages leave out rubber lines. The home feed lists rubbers one by one. Team-page records don't read `state.matchRecords`. | known | Group the rubbers in the feed under the tie card, and include rubber lines in team averages. | M | known: PROGRESS SD-48 |
| R-7 | P2 | Team ties | The lineup check only warns when someone plays two singles. It doesn't catch the same pair playing both doubles (Thomas/Uber), the Sudirman per-player event cap, the XD gender mix, or a Davis Cup reverse-singles substitution limit. | `src/data/teamTie.ts:275-298` | Add per-preset eligibility rules as warnings, never blocks. | S | BWF Thomas/Uber/Sudirman regs; ITF Davis Cup regs (verify) |
| R-8 | P1 | Scorer UX | Match stats "Total points won" counts rallies only, so a penalty point is missing and the total ≠ the score. The conduct tile remembers the last side, so a second penalty can go to the wrong player. | known | Count penalty points in the total (with their own row), and reset the conduct side after each use. | S | known: PROGRESS SD-53 |
| R-9 | P2 | Tournament / player | There are no ranking points by round reached, no seeding from ranking, and no doubles seeding by the sum of both players' points. Seeding is manual. | not found (GEN-08 parked) | Per-tournament points table → a season ranking → seeding of the next draw. | M | PSA / FIP / BWF ranking regs; PLAN §6.2 |
| R-10 | P2 | Scorer UX | The point buttons tell the sides apart by team colour. Two sides with the same or similar colour (two houses on the default) get look-alike buttons, and only the name tells them apart. | `src/sports/PointButtons.tsx:63,80-93` (no clash check) | When the colours are close, use `theme.colors.away` for the away button and add an "A/B" side letter. | S | scorer-ux row 1 intent |
| R-11 | P2 | Player | A mixed-doubles split appears only on team-tie XD rubbers. Ordinary matches have no `category` format field, so a mixed match is counted as doubles. | `src/data/lineContext.ts:182-185`; `teamTie.ts:208` | Add a "Doubles / Mixed doubles" choice to the racket format when playersPerSide = 2. | S | BWF/ITTF/ITF event categories |
| R-12 | P2 | Scorer UX (375 px) | The Win % tile truncates. Long double-fault rows truncate in the timeline editor. The pressure chip and Undo use short side names. | known | Wrap the tile label, use a two-line DF row, and use full names in the chip. | S | known: PROGRESS SD-19, SD-24, SD-115 |
| R-13 | P2 | Docs | Racket guides run over the 900-word house limit (`score-table-tennis` 953, `run-team-ties` 954, `score-tennis` 947, `racket-conduct-and-timeouts` 945, `score-padel` 945). | `wc -w website/guides/*.md` | Trim them in the next docs pass. | S | house guideline |

---

## 1. Tennis (ITF)

**Strengths:** the full ITF scoring set is covered: advantage / no-ad, set tiebreak, Fast4 sudden death at 4-4, pro set, a 10-point match tiebreak, and the Grand Slam 10-point tiebreak at 6-6. Serve rotation is correct, including the doubles tiebreak order and a per-set serving order. ATP-style serve / return stats come from the log. 1st/2nd serve and point detail are optional. The career covers sets, games, tiebreaks, deciders, holds, breaks and break points. Leaders and the Player of the Tournament rank by results. Standings follow the ATP / ITF round-robin rules. Davis Cup and BJK Cup ties are in.

| # | Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|---|
| TN-a | P1 | Scoring | There is no ITF / ATP doubles preset (two no-ad sets plus a 10-point match tiebreak). It is the standard doubles format, and today it's reachable only through Custom (noAd + deciding set = 10-pt match TB). | `src/sports/tennis/index.tsx:176-198` | Add a "Doubles (no-ad + match TB)" preset, and default to it when Players = Doubles in a tournament. | S | ITF Appendix V; scorer-ux (P2 there) |
| TN-b | P1 | Box score | The DF column in the match box score never fills. `tennisBox` doesn't read the `df` marker, so the schema column is hidden as untracked. Double faults show only on profiles. | `src/sports/boxSources.ts:507-510`; `src/sports/tennis/stats.ts:32` | Count `df` point events per faulting server in `pointBox` (aces are already counted there). | S | known: PROGRESS SD-107 |
| TN-c | P2 | Match stats | The timeline reads "Game home / away" with no Hold / Break or names. Padel got `gameLabels`, tennis didn't. | `src/sports/tennis/engine.ts:181`; `gameLabels.ts` imported by padel only | Call `setSportGameLabels` from tennis. | S | known: PROGRESS SD-62 entry |
| TN-d | P2 | Scoring | An "advantage final set" with tiebreaks in the other sets can't be expressed, because `setTiebreak` covers the whole match. Older Olympic / Davis Cup and some club formats use it. | `src/sports/tennis/engine.ts:93-103` | Add a "Deciding set: advantage (no tiebreak)" option. | S | ITF Rule 7 / Appendix V |
| TN-e | P2 | Scoring | Doubles: no receiving order per set, and no prompt at a no-ad deciding point that the receiving pair chooses who receives (in mixed, the same gender as the server). | `tennis/index.tsx:72-77` (serve picker only) | Add a receiver pick at set start and a no-ad banner line. | S | ITF Rule 14, Appendix V (no-ad) |
| TN-f | P2 | Match stats | Lets on serve, Hawk-Eye challenges (left / upheld), net approaches and retirement reasons aren't recorded. | — | Optional timeline markers with no score effect, plus challenge counters per set. | S | known: PROGRESS SD-107 follow-ups; scorer-ux |
| TN-g | P2 | Player | The career has no straight-set wins or comebacks from a set down (`matchRecords` stores comebacks per match only). History rows can read "0 aces". | known | Derive comeback and straight-set keys in `tennisTotals`, and hide zero counters in history rows. | S | ATP player stats; known: PROGRESS SD-19 |
| TN-h | P2 | Team/tournament | The Davis Cup Finals group tie-breaks (rubbers % → sets % → games %) were coded from memory. | `src/data/teamTie.ts:505-506` | Check against the 2026 ITF Davis Cup regulations. | S | known: PROGRESS SD-48 Check (verify) |

---

## 2. Badminton (BWF)

**Strengths:** BWF 21 × 3 with the 30-cap golden point, plus 5×11 and 15-point presets. Serve court and the doubles server / receiver are named by Law 11. Intervals at 11 and changes of ends come from courtCues. The fast "Rally won" buttons are there. Serve / receive stats, runs and game points saved come from the log. BWF cluster tie-breaks are in, so are Thomas / Uber / Sudirman ties, misconduct and the point detail. Careers and results-based leaders are complete.

| # | Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|---|
| BD-a | P1 | Team ties | Thomas / Uber / Sudirman group play defaults to stopping dead rubbers (see R-4). | `src/data/teamTie.ts:95-100` | Use the stage-aware default (R-4). | S | known: PROGRESS SD-48 Check |
| BD-b | P2 | Scoring | The "15-point" preset (cap 21, best of 3) plays the BWF 3×15 format, but it isn't named as such. Whether and when BWF adopts 3×15 for sanctioned play needs checking. | `src/sports/badminton/index.tsx:179` | Relabel as "3×15 (BWF trial)" once the status is confirmed. | S | BWF Council 3×15 proposal (verify) |
| BD-c | P2 | Match stats | The match panel doesn't show the score at the 11-point interval. | known | Add a per-game "At interval" row to the stats panel. | S | known: PROGRESS SD-22 Not built |
| BD-d | P2 | Match stats | Lets and shuttle changes aren't recorded. | — | Optional marker in Quick options (no score effect). | S | scorer-ux; BWF Law 15 |
| BD-e | P2 | Scoring | Cards were built per side. BWF Law 16.7 gives them per player, and that wasn't checked. | `src/sports/conduct.ts` badminton schedule | Check, and if needed key the escalation by player. | S | known: PROGRESS SD-53 Check (verify) |

At standard for scoring rules, the doubles service order, standings, careers and leaders. Nothing else to add.

---

## 3. Table tennis (ITTF)

**Strengths:** ITTF 2.13 service order is replay-validated (2 each, 1 each from deuce, 21-point legacy). The doubles A→X→B→Y order is named, with the receiver switch at 5 in the deciding game. The change-ends cue and a "2nd serve of 2" hint are shown. The timeout is 1 per match and the yellow / red penalty ladder is in. ITTF 3.7.5 group ranking among the tied (with restart) and ITTF team ranking are both in. Swaythling, Corbillon and Olympic ties are in with ABC/XYZ lineups. Careers, H2H and the point detail are complete.

| # | Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|---|
| TT-a | P2 | Scoring | The expedite system isn't implemented (after 10 minutes, service alternates every point for the rest of the match). | no `EXPEDITE` in `src/sports/` (TT-09 parked) | An EXPEDITE toggle in Quick options. `ttServer` then alternates every point, with a timeline marker. | S | ITTF Law 2.15; scorer-ux |
| TT-b | P2 | Match stats | Edge and net-cord points can't be tagged (they are neither a winner nor an error), and lets (re-serves) aren't recorded. | `src/sports/pointDetail.ts:111` (TT list) | Add an "Edge / net" how, plus a let marker. | S | scorer-ux |
| TT-c | P2 | Match stats | The stats panel has no deuce-games count. | known | Add deuce games played / won per side. | S | known: PROGRESS SD-22 Not built |
| TT-d | P2 | Scoring | Whether a second penalty point carries into the next game wasn't checked against ITTF 3.5.2.2. | `src/sports/conduct.ts` TT schedule | Check the rule and adjust the carry-over. | S | known: PROGRESS SD-53 Check (verify) |
| TT-e | P2 | Team ties | The ITTF team-ranking clauses were coded from memory (2 / 1 match points, then individual-matches ratio → games → points). | `src/data/teamTie.ts:497-498` | Check against ITTF Handbook 3.7.5 (team events). | S | known: PROGRESS SD-48 Check (verify) |

At standard for scoring, service order, standings, careers and leaders.

---

## 4. Squash (WSF / PSA)

**Strengths:** PAR-11 best of 5, PARS-15, short and English hand-out scoring, all replay-tested (PSA final, 1993 British Open). There is a no-default first-server picker, a Let button, the WSF conduct ladder (warning / stroke / game / match) and match / game durations. The point editor handles hand-outs. The game line is everywhere. WSF round-robin tie-breaks and 3-rubber team ties are in. Careers and leaders rank by results.

| # | Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|---|
| SQ-a | P1 | Scoring / stats | Stroke and No let can only be entered through the optional Point-detail row, which is off by default. Let has its own button. The referee's decision count is squash's signature stat, so with detail off it is never captured. | `src/sports/rallyCore.tsx:98` (letRow = Let only); `pointDetail.ts:112-116` | Put "Stroke → X" and "No let → X" next to Let. Each scores the point and records the decision whether or not detail is on. | S | WSF Rule 8; known: PROGRESS SD-53 Not done |
| SQ-b | P2 | Scorer UX | There is no 90-second between-games cue and no warm-up timer. courtCues has no squash rule and rallyCore mounts only the TT cue. | `src/sports/courtCues.ts` (no squash); `rallyCore.tsx:246,315` | Add a derived "90 s interval" banner after each game. | S | WSF Rule 7; known: PROGRESS SD-117 remaining "squash cues" |
| SQ-c | P2 | Scoring | In English scoring, the receiver's 8-all choice (play to 9 or 10) is missing. The "Club English" preset is a hard cap at 9 (winBy 1). | `src/sports/squash/index.tsx:36` | SET_GAME_TARGET {9 or 10}, valid only at 8-8 (SQ-07). | S | English rules; SD-14 todo test |
| SQ-d | P2 | Scoring | Doubles server names aren't shown (PAR doubles). | known | Name the server from a per-hand pick (as in TT / badminton). | S | WSF Doubles; known: PROGRESS SD-62 Not done |
| SQ-e | P2 | Match stats | No PSA video review (1 per player per game, upheld or not), no injury categories (self-inflicted / contributed / opponent-inflicted, with their time limits), and no service box (R/L) on screen. | — | Optional REVIEW and INJURY markers, and a "Serve from the right box" hint. | S | WSF Rule 15/16; PSA regs; scorer-ux |
| SQ-f | P2 | Scoring | Conduct escalates one level at a time, but WSF Rule 15 leaves the level to the referee. | `src/sports/conduct.ts:125` | Let the referee pick any level (the suggestion stays). | S | known: PROGRESS SD-53 Check |
| SQ-g | P2 | Team ties | Team order (order of merit) isn't checked against ranking or rating. | `src/data/teamTie.ts:109-111` | A warning when No.2 outranks No.1 (once R-9 ratings exist). | S | known: PROGRESS SD-48 Check (verify) |

---

## 5. Padel (FIP)

**Strengths:** advantage, golden point and Star Point (FIP 2026). Short sets and a match tiebreak, with [10-7] on every surface. Serve rotation includes the doubles tiebreak order and per-set order. One-tap Ace and Double fault for the server. Hold / Break timeline labels and change-ends cues. Premier-style holds / breaks / golden / star points come from the log. FIP tie-breaks (set diff → games diff), Americano, padel team ties, and a per-partner career.

| # | Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|---|
| PD-a | P1 | Player stats | A single padel Ace marks the whole match as point-detail tracked, so winners and errors are written as 0 instead of "not tracked". Careers and the "winners per match" leaders take in false zeros. | known | Count an ace-only match as serve-tracked, not detail-tracked, and write detail keys only when the detail mode was on. | S | known: PROGRESS SD-117 |
| PD-b | P2 | Match stats | 1st-serve % isn't tracked: there is no Fault / 2nd-serve option for padel (`hasServeDetail` is tennis only). | `src/sports/pointDetail.ts:120` | Extend the tennis 1st/2nd serve toggle to padel. | S | Premier Padel stats; scorer-ux |
| PD-c | P2 | Scorer UX | The golden-point banner doesn't say the receiving pair chooses the receiver. The Star point banner does. | `src/sports/padel/index.tsx:87` | Add that line to the golden-point banner. | S | FIP Rules; known: PROGRESS SD-117 remaining |
| PD-d | P2 | Scoring | The default preset is still "Golden point (WPT style)" although FIP / Premier Padel moved to Star Point for 2026. The FIP 2026 text hasn't been read directly. | `src/sports/padel/index.tsx:203-205` | After checking the FIP 2026 regs, make Star Point the tournament default. Also check that short sets go to a tiebreak at 4-4. | S | FIP Rules 2026 (verify); known: PROGRESS SD-64 Check |
| PD-e | P2 | Scoring | No medical time-out or timeouts for padel (`kinds: []`), and the FIP code-violation ladder is unverified. | `src/sports/conduct.ts:107,213` | Add the FIP medical-timeout marker and check the ladder. | S | known: PROGRESS SD-53 Not done / Check |
| PD-f | P2 | Tournament | No Mexicano (pairing by current standings each round). | not found (PD-12 parked) | Mexicano next to Americano. | M | club format |

---

## 6. Pickleball (USA Pickleball / UPA, MLP)

**Strengths:** side-out tournament presets (best of 3 to 11, single games to 15 and 21, a best-of-5 medal match). The 0-0-2 start and the three-number call as the headline. Server named by court position, with a right-court pick that can be fixed mid-game. First serve alternates by game (5.B.1). Timeouts 2 / 3 per game plus a medical timeout. Technical warnings and fouls. Kitchen and foot faults in the point detail. Pool play by point differential. Side-out and per-turn stats come from the log. Careers, per-partner record, and ties of 2 doubles + mixed.

| # | Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|---|
| PB-a | P1 | Scorer UX / rules | There's no switch-ends prompt: none between games, and none at 6 / 8 / 11 in the deciding game. SD-54 listed it, but courtCues has no pickleball rule and rallyCore mounts only the TT cue. | `src/sports/courtCues.ts` (tennis/padel/badminton/TT only); `rallyCore.tsx:246,315` | Add `pickleballCue` (ends after each game; at half the target, rounded up, in the deciding game) as a banner plus a timeline marker. | S | USA Pickleball 4.A / 10.A (verify numbers) |
| PB-b | P1 | Scoring (server identity) | Rally-scoring doubles is the rec default. There, `serveSpot` puts the server in the right court every time and names the starter whenever the team score is even. Under MLP / USAP rally rules the server goes right on an even score and left on an odd one. Players switch only after winning a point on their own serve, so the same player keeps serving. The engine names the partner every other point. That puts the wrong name on the board and skews per-server serve stats. The score is unaffected. | `src/sports/rallyEngine.ts:280-287` | Track positions as side-out does: switch only on a serving-side point, and serve from the court that matches the score's parity. Add replay tests. | S | MLP rally-scoring rules; USAP provisional rally rule (verify) |
| PB-c | P1 | Tournament | Pools then double elimination, the usual pickleball format, can't be run (R-1). | `src/data/bracket.ts` | See R-1. | L | USA Pickleball tournament practice |
| PB-d | P2 | Scoring | There's no MLP freeze at 20. The preset was renamed "Rally to 21", so nothing is mis-scored. The DreamBreaker rotation isn't tracked. | `src/sports/pickleball/index.tsx:43-49` | Add a `freezeAt` config and a real MLP preset. | S | MLP rules; known: PB-09 parked, PROGRESS SD-117 |
| PB-e | P2 | Team ties | There's no MLP team format (women's doubles, men's doubles, 2 mixed, DreamBreaker at 2-2). | `src/data/teamTie.ts:126-128` | Add an MLP preset whose DreamBreaker rubber is created only at 2-2. | M | MLP; PB-13 parked |
| PB-f | P2 | Scoring | The technical foul in side-out (point to the receiver?), escalation to forfeit, and the medical timeout per side vs per player weren't checked. | `src/sports/conduct.ts` pickleball schedule | Check against USAP 13.G and 10.C. | S | known: PROGRESS SD-53 Check (verify) |
| PB-g | P2 | Scorer UX | Voice "rally home" doesn't credit the right side in side-out mode. | known | Map a voice rally to the rally winner (POINT side = winner). | S | known: PROGRESS SD-06 Not done |
| PB-h | P2 | Player | There's no rating (a DUPR-style number). | — | Note only. Possible later as a generic Elo (R-9). | M | — |

---

## Counts

| | P0 | P1 | P2 |
|---|---|---|---|
| Shared (R-) | 0 | 6 | 7 |
| Tennis | 0 | 2 | 6 |
| Badminton | 0 | 1 | 4 |
| Table tennis | 0 | 0 | 5 |
| Squash | 0 | 1 | 6 |
| Padel | 0 | 1 | 5 |
| Pickleball | 0 | 3 | 5 |
| **Total** | **0** | **14** | **38** |

(BD-a and PB-c are the shared R-4 / R-1 applied to one sport. They count in their sport's row as well.)

## Top 5 to build next (racket group)

1. **Double-elimination + consolation / plate draws** (R-1, PB-c): the biggest format gap for pickleball pools and school racket events. L.
2. **Team-tie operations** (R-2, R-3, R-4, R-5): settle a tie server-side on the deciding rubber, let captains enter lineups, set the dead-rubber default by stage, and redeploy `notify-followers`. M.
3. **Pickleball court correctness** (PB-a, PB-b): a switch-ends cue, and rally-doubles server position by parity, with players switching only on a serving point. S.
4. **Squash referee decisions always on** (SQ-a): Stroke and No let beside the Let button, scored and counted without detail mode, plus the 90 s interval cue (SQ-b). S.
5. **Serve-stat completeness for tennis and padel** (TN-a, TN-b, PD-a, PD-b): an ITF doubles preset, the DF box column, no false zeros from a padel Ace, and padel 1st-serve tracking. S.
