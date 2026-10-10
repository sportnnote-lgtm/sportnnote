# Sport depth backlog: build in this order

The research session adds items and reorders them over time. The coding session updates only **Status** and **Notes**. The plan, GEN definitions and dependencies are in `PLAN.md`. The audits are the per-sport files in this folder.

Priority logic:
- **Wave 0:** fix the numbers that are wrong today.
- **Wave 1:** shared foundations, designed from day one to cover the new sports too (timed/measured events, hockey, handball). The racket sports reach their P0 depth here.
- **Wave 2:** per-sport P0, round-robin by sport so no sport waits behind another.
- **Wave 3:** P1, generic items first, then per-sport round-robin.
- **Wave 4:** new sports, each "born deep" on the foundations. Wave 4 can run alongside Waves 2–3 once Wave 1 lands (founder, 2026-10-10).

P2 items are parked (PLAN.md §6.2).

**Founder approved PLAN.md and the recommended defaults for D1–D9 on 2026-10-10.** Every item is READY; build in queue order, one at a time.

| # | Item | Scope | Source | Status | Notes |
|---|---|---|---|---|---|
| SD-01 | Final score after the match ends: sets/games won + set/game scores, not "0–0" (result alert, ticker, MiniScore, CorrectMatch) | tennis, badminton, TT, squash, pickleball, carrom | TN-00, BD-01, TT-01, CR-01 | DONE | 326857f · Wave 0 · S · no migration |
| SD-02 | Tennis scoreline: tiebreak score 7-6(4) kept per set; Grand Slam deciding set (10-pt TB at 6-6) and a fixed `gs5` preset | tennis | TN-04, TN-08 | DONE | 326857f · Wave 0 · S · no migration |
| SD-03 | Kabaddi raid/tackle attribution: raider credited with actual raid points; tackle point on the defending side; remove/edit ordinal; draw/shootout winner; voice super tackle = 2 | kabaddi | KB-01 | DONE | c4dd6fd · Wave 0 · M · no migration · past lines heal via SD-33 (D2) |
| SD-04 | Volleyball point credit: Opp. error / Serve error capture; ACE and BLOCK count as points; MVP weights | volleyball | VB-01, VB-02 | DONE | 1ee96f2 · Wave 0 · M · no migration · new OPP_ERROR / SERVE_ERROR · past lines heal via SD-32 |
| SD-05 | Basketball FIBA rules: bonus from the 5th foul, technicals as team fouls (FIBA flag), OT fouls carry over, default win 2 / loss 1, full-court +1 → FT flow | basketball | BK-01, BK-02 (points), BK-03 (+1) | DONE | b6f8dfd · Wave 0 · S · no migration · config keys; absent = legacy |
| SD-06 | Pickleball real presets (side-out tournament default; rally preset renamed "Rec") + right-court server identity | pickleball | PB-01, PB-02 | DONE | b6f8dfd · Wave 0 · M · no migration · D4 · new SET_START_RIGHT |
| SD-07 | Golf: missed-cut players labelled MC and ranked below the cut; best round from 18-hole rounds only; putts/round over tracked rounds; countback only on complete cards | golf | GF-01, GF-03, GF-12 (countback) | DONE | 29649b3 · Wave 0 · M · no migration · litmus test via buildLeaderboard |
| SD-08 | Football 45+2' minute notation and timeline order; a blocked shot is not on target (blocker credited) | football | FB-03, FB-05 | DONE | 29649b3 · Wave 0 · S · no migration |
| SD-09 | Football clean sheets: GK with the most minutes on the pitch, every completion path incl. pens, re-evaluated on correction; minutes derivation; Golden Glove GK-only | football | FB-04, FB-02 (derivation), FB-11 (GK) | DONE | 29649b3 · Wave 0 · M · no migration |
| SD-10 | Chess Swiss bye point (default 1; ½ / 0 option), unplayed in tie-breaks; forfeits out of SB and played stats | chess | CH-01, CH-08 (forfeits) | DONE | 29649b3 · Wave 0 · S · no migration · D7 |
| SD-11 | Every player who played gets a line (apps / starts) with result W/D/L/T/NR; profile pill, win %, W-D-L | all sports | GEN-01; FB-01, FB-07, CK-08 (apps), CR-02 (lines); cross-sport X3, X6 | DONE | 4994c8d · Wave 0 · M · **migration 0050** (`stat_lines.result` + backfill) |
| SD-12 | Standings and team-record bugs: overall house table uses organiser points; cross-group seeding uses the sport's tie-breakers; NR counted in team Played; cricket tie "T" + NR column, no run difference | generic + cricket labels | cross-sport X1, X2, X4; CK-02 (labels) | DONE | 4994c8d · Wave 0 · S · no migration |
| SD-13 | Cricket NRR completeness: DLS crediting (target − 1 off allotted overs), "no batter left" = all out, Team 1's original quota | cricket | CK-05 | DONE | 4994c8d · Wave 0 · S · no migration · gated on dlsV |
| SD-14 | Engine replay tests: squash (PSA final + English), pickleball (PPA side-out doubles, rally 21, singles), padel (Premier final, short sets, serve rotation) | squash, pickleball, padel | SQ-12, PB-12, PD-10 | DONE | 0872473 · Wave 1 · S · safety net before SD-19 to SD-22 · 3 engine gaps logged as todo tests |
| SD-103 | Doubles tiebreak serving order: a pair's second turn in a tiebreak goes to the partner (ITF/FIP: h0, a0, a0, h1, h1, a1, a1 — the engine keeps h0/a0 fixed); affects the named server, not the score | padel, tennis (doubles) | SD-14 todo test (src/sports/serve.ts `serveInfo`) | DONE | db8fcb2 · Found by SD-14 · bug · S · no migration · do before SD-22 |
| SD-104 | Racket fixes from the guide writer: TT 21-point serve switch at 20-20 (not 10-10); ace offered only for the server's side; squash and TT first-server picker on the scoring screen; squash serving-line icon (🏓 hard-coded); badminton serve dot on the board; doubles serving-order picker (tennis / padel) instead of list order; tennis "Double fault" row wording; double-fault count follows point corrections | tennis, badminton, TT, squash, padel | guide-writer feedback 2026-10-10 | DONE | b3fbe7e · Found writing score-* guides · bugs + UX · S/M · no migration |
| SD-15 | Per-sport stat schema: one definition drives the box score, career, leaders, awards, MVP and labels; replaces the 6+ maps; cricket as the proof spec | generic | GEN-02 (cross-sport GEN-01) | DONE | a5086ef · Wave 1 · L · no migration |
| SD-16 | Aggregate engine: max / best / rate with qualifier / per-game / per-set / count-if, coverage denominators, tie-break chains | generic | GEN-03 (cross-sport GEN-02) | DONE | acb7669 · Wave 1 · M · needs SD-15 |
| SD-17 | Standings rule kit: margin-aware points (FIVB 3-3-2-1, PKL 5-3-1, FIBA 2-1), h2hDiff / h2hFor / setRatio / pointRatio / gamesDiff / pointsDiff / setsPct / gamesPct / played / fairPlay / explicit lots, BWF cluster branching, standingsPoints providers, per-sport defaults | generic | GEN-04; BK-02, VB-04, KB-07, FB-10, TN-07, BD-03, SQ-05, PD-04, PB-07, CR-06, CK-06 | DONE | b39381c · Wave 1 · M–L · no migration · D1 |
| SD-18 | Standings columns per sport (PF/PA/±, SD, GD, Sets/SR/PR, G±/P±, Pts + TB columns; "Player" header) | generic | GEN-05; CH-04, KB-08, BK-02, CR-06 | DONE | a232b7b · Wave 1 · S · needs SD-17 |
| SD-19 | Absolute statTotals: shared contract + test harness + rally/racket implementation (games/sets/points W-L, deciders, tiebreaks, partner) | generic + racket sports | GEN-06; SQ-02, PD-03, PB-06, TN-06, BD-04, TT-08 (keys) | DONE | 3ad046a · Wave 1 · M · no migration · partner id derived, not stored (needs a column) |
| SD-20 | Game/set score line on card, result, share and history ("3-1 (11-7 9-11 …)", "[10-7]", "7-6(4)", "ret."); LineScoreboard in rallyCore | generic (set/game sports) | GEN-07; SQ-01, PD-01, PB-04, TT-02, TN-11 | DONE | a845a64 · Wave 1 · M · padel stores match-TB points in the set entry |
| SD-21 | Point editor for rally-engine sports and padel (EDIT_LOG / STAT_ADJUST; `rally` kind with `wonBy`) | TT, squash, pickleball, padel | GEN-08; TT-03, SQ-08, PB-10, PD-06 | DONE | 2dc58ff · Wave 1 · M · needs SD-14 |
| SD-22 | Rally-stats engine from serve replay: serve/receive points, holds/breaks/BP, golden points, side-outs, longest run, game/match points saved; per-set match-stats panel | tennis, badminton, TT, squash, padel, pickleball (+ volleyball after SD-58) | GEN-09; TN-03, BD-02, TT-04, PD-02, PB-03 | DONE | ba10433 · Wave 1 · M · no migration |
| SD-23 | Shared box score (schema-driven, period toggle, sticky name, team totals) + team comparison panel | generic | GEN-10; BK-04, VB-07, FB-09, KB-03 (components) | DONE | ba10433 · Wave 1 · M · needs SD-15 |
| SD-24 | Shared career framework + racket career spec (singles/doubles W-L, sets/games/points %, deciders, tiebreaks, best run, titles/finals, per-partner record, history with scoreline) | generic + racket sports | GEN-11; TN-06, BD-04, TT-08, SQ-02, PD-03, PB-06 | DONE | b3fbe7e · Wave 1 · M · needs SD-11, SD-15, SD-16, SD-19 |
| SD-25 | Line context and splits: format, ball type, singles/doubles, tournament, season, opponent, colour, time control as filter chips | generic | GEN-12 | DONE | 9eaf301 · Wave 1 · M · no migration (optional column later) |
| SD-26 | Swiss done properly: Buchholz / Cut-1 / Median / Progressive (C.07 unplayed rules); colour-aware score-group pairing writes White | chess (any Swiss) | GEN-13; CH-02, CH-03 | DONE | a845a64 · Wave 1 · M · D7 · optional fixture key `white` |
| SD-27 | Leaderboards and award slots from the schema: rank by average with minimums, best-figure / rate slots, sport-correct slots (no "Top scorer" in racket sports), schema MVP weights | generic | GEN-14; BK-07, TN-10, BD-07, TT-12, SQ-13, KB-08, VB-08 (awards), FB-11 | DONE | 526d50e · Wave 1 · M · needs SD-16 |
| SD-28 | Results engine for timed / measured events (generalises golf's field-competition model): events with heats/rounds/finals, start lists, lanes/order, attempts with best-of, units and ordering (lower/higher is better), ties and countback per sport, wind/legal-mark flags, DNF/DNS/DQ/NM, Q/q qualification, PB/SB and meet/school records, relay teams, medal-table integration; one official enters results on a phone; heat sheets | generic (athletics, swimming, archery, shooting, weightlifting, cycling, rowing, canoe; golf moves onto it) | GEN-27 (founder 2026-10-10); golf GEN-18 / GF-07 team link | DONE | ff88a73 · Wave 1 · L · **migration** (provisional 0051: `field_entries.team_id` for relays/teams, shared with GF-07; round/heat structure prefers jsonb, confirm at spec) |
| SD-29 | Time-on-field / on-court tracker: minutes, +/-, starters, sets played, timed suspensions | football, basketball, volleyball, kabaddi, hockey, handball | GEN-19; BK-10, FB-02 (display) | DONE | 3ad046a · Wave 1 · M · builds on SD-09 · includes timed suspensions (hockey green/yellow, handball 2-min, kabaddi yellow) |
| SD-30 | Football statTotals (goals by type, assists, shots/SoT/blocked, saves, cards, apps/starts/minutes, CS, GA, OG, pens); player ids on payloads | football | FB-06 | READY | Wave 2 R1 · M · needs SD-19 |
| SD-31 | Basketball missed FG capture (Miss 2 / Miss 3), FG/3P extras, "Track missed shots" coverage toggle | basketball | BK-03 | READY | Wave 2 R1 · M · new MISS action · D8 |
| SD-32 | Volleyball statTotals (points, attack/block points, aces, serve errors, errors, sets played) | volleyball | VB-03 | READY | Wave 2 R1 · M · heals SD-04 history (D2) |
| SD-33 | Kabaddi statTotals from raids[] (raid/touch/bonus/tackle points, raids, successful/empty/out, super raids/tackles, do-or-die) | kabaddi | KB-02 | READY | Wave 2 R1 · M · heals SD-03 history (D2) |
| SD-34 | Tennis double fault as a first-class point kind + one-tap Ace / DF for the current server | tennis | TN-01, TN-02 | READY | Wave 2 R1 · S · replay test for relabelled DFs |
| SD-35 | Golf entry admin: WD / DQ / DNS, edit handicap, remove | golf | GF-04 | READY | Wave 2 R1 · S · no migration |
| SD-36 | Chess career: score %, W/D/L by colour and time control, wins by method, unbeaten streak | chess | CH-05 | READY | Wave 2 R1 · M · needs SD-24, SD-25 |
| SD-37 | Carrom statTotals: games W/L, boards won/played, capped points, Queens, both doubles partners | carrom | CR-02 | READY | Wave 2 R1 · M · needs SD-19 |
| SD-38 | Cricket records leaderboards: HS, BBI, Ave/SR/Econ with qualifiers, 4s/6s/50s/100s/maidens/dots/ducks | cricket | CK-01 | READY | Wave 2 R1 · M · needs SD-16, SD-27 |
| SD-39 | Football career spec (outfield / GK / discipline / bests, per-90 rates, hat-tricks, history line) | football | FB-08 | READY | Wave 2 R2 · M · needs SD-24, SD-30 |
| SD-40 | Basketball FIBA box score spec + basketball statTotals (FG/3P/FT M-A, OREB/DREB, +/-, EFF, team fouls per period) | basketball | BK-04, BK-05 | READY | Wave 2 R2 · M · needs SD-23, SD-31 |
| SD-41 | Kabaddi PKL match-centre panel (raid/tackle/all-out/extras, strike rates, super raids/tackles; all-outs on the timeline) | kabaddi | KB-03 | READY | Wave 2 R2 · M · needs SD-23, SD-33 |
| SD-42 | Golf pro leaderboard columns: total, R1–R4, "F", "–" before tee-off, cut line, card drill-down | golf | GF-05 | READY | Wave 2 R2 · M · no migration |
| SD-43 | Cricket career by format and ball type (T20 / One-day / T10-box / Hundred / Long; leather / tennis) | cricket | CK-03 | READY | Wave 2 R2 · M · needs SD-25 |
| SD-44 | Basketball career spec (per-game averages, FG/3P/FT %, career highs, double-doubles, EFF/game) | basketball | BK-06 | READY | Wave 2 R3 · M · needs SD-24, SD-40 |
| SD-45 | Golf per-hole stats row (fairway L/✓/R, penalties, bunker; GIR, scrambling and sand saves derived) | golf | GF-02 | READY | Wave 2 R3 · M · D8 · optional card arrays |
| SD-46 | Team stats and records from the schema (per-game team averages, unit and difference label, T/NR, team leaders, records block) | generic | GEN-15; BK-08, VB-09, FB-15, CK-02 (rest) | READY | Wave 3a · M |
| SD-47 | Individual head-to-head and form (player vs player) | generic (individual sports) | GEN-16; SQ-11 | READY | Wave 3a · M |
| SD-48 | Team ties: one fixture of N rubbers, lineups/order, stop at majority, ½-point rubbers, tie-aware group standings | TT, chess, carrom, badminton, tennis, squash | GEN-17; TT-05, CH-11, CR-08, BD-09 | READY | Wave 3a · L · migration TBD at spec (prefer formats jsonb) |
| SD-49 | Field results in tournament leaders, awards and the medal table (golf categories) | golf (+ future field sports) | GEN-18; GF-08 | READY | Wave 3a · M · needs SD-07, SD-42, SD-28 · golf onto the results engine's leaders/medal path |
| SD-50 | Game-flow stats: biggest lead, lead changes, times tied, largest run, bench points | basketball, football, kabaddi | GEN-20; BK-09 | READY | Wave 3a · S |
| SD-51 | Match-records hook persisted in the snapshot (partnerships, team totals, team highs) → tournament Records card | generic | GEN-21; CK-07 | READY | Wave 3a · M · one-off backfill replay |
| SD-52 | Optional point-outcome tag (winner / forced / unforced / fault / kitchen / smash) with coverage | racket sports | GEN-22; PD-05, PB-05 (P1); TN-12, BD-06, TT-11, SQ-10 (P2) | READY | Wave 3a · M · D8 · optional `how` payload |
| SD-53 | Conduct, cards and penalties (warning → point → game → match; AWARD_GAME) | squash (+ tennis, TT, badminton, volleyball) | GEN-23; SQ-04 | READY | Wave 3a · M · additive actions |
| SD-54 | Rally timeouts (TT 1 per match; pickleball 2/3 per game + switch-ends prompt) and match/game duration | TT, pickleball, squash (+ others P2) | GEN-24; TT-06, PB-08, SQ-09 | READY | Wave 3a · S · new TIMEOUT action |
| SD-55 | Atomic stat increment RPC (optional) | generic | GEN-25; cross-sport X5 | READY | Wave 3a · S · **migration** (provisional 0052) · drop if statTotals covers all drift |
| SD-56 | Football box score spec + HT score | football | FB-09 | READY | Wave 3b R1 · M · needs SD-23 |
| SD-57 | Basketball FIBA timeouts per half; draw only where the format allows | basketball | BK-11 | READY | Wave 3b R1 · S |
| SD-58 | Volleyball serve tracking (first server, rotation) → pre-fills Ace / Serve error, feeds SD-22 | volleyball | VB-05 | READY | Wave 3b R1 · M · new SET_SERVE / SET_ROTATION |
| SD-59 | Kabaddi technical points and line-outs | kabaddi | KB-05 | READY | Wave 3b R1 · S · new TECH_POINT |
| SD-60 | Tennis 1st-serve tracking (Fault button) → 1st serve %, 1st/2nd serve points won | tennis | TN-05 | READY | Wave 3b R1 · M · new FAULT · D8 |
| SD-61 | Badminton fast doubles scoring (two "Rally won" buttons; credit optional) | badminton | BD-08 | READY | Wave 3b R1 · S |
| SD-62 | Table tennis doubles service/receive order by name; change-ends cue | table tennis | TT-07 | READY | Wave 3b R1 · M |
| SD-63 | Squash Let / Stroke / No Let decisions | squash | SQ-03 | READY | Wave 3b R1 · M |
| SD-64 | Padel Star Point deuce option | padel | PD-07 | READY | Wave 3b R1 · S · D5 (verify FIP 2026 text) |
| SD-65 | "Serves first" exposed for squash and pickleball; verify pickleball's game-2 first server | squash, pickleball | SQ-06, PB-11 | READY | Wave 3b R1 · S |
| SD-66 | Golf gross and net boards side by side (Best Gross / Best Net) | golf | GF-06 | READY | Wave 3b R1 · S |
| SD-67 | Chess more results (double forfeit, dead position, adjudication, arbiter decision); name in "has White"; exact time control | chess | CH-08 | READY | Wave 3b R1 · S |
| SD-68 | Carrom ICF score sheet (breaker, running total, penalty boards) | carrom | CR-03 | READY | Wave 3b R1 · S |
| SD-69 | Cricket captain and keeper flags → Captaincy section, keeper dismissals | cricket | CK-04 | READY | Wave 3b R1 · S · backfill replay script |
| SD-70 | Football discipline table + suspension rule | football | FB-12 | READY | Wave 3b R2 · M |
| SD-71 | Volleyball substitutions + libero → sets played | volleyball | VB-06 | READY | Wave 3b R2 · M · needs SD-29 · new SUB |
| SD-72 | Kabaddi cards (green / yellow 2-min suspension / red) | kabaddi | KB-06 | READY | Wave 3b R2 · M · needs SD-59 |
| SD-73 | Doubles serving order chosen per set (tennis ITF Rule 14; padel server naming) | tennis, padel | TN-09, PD-08 | READY | Wave 3b R2 · S |
| SD-74 | Badminton doubles server and receiver by name (Law 11) | badminton | BD-05 | READY | Wave 3b R2 · M |
| SD-75 | Padel timeline labels: Game / Break / Hold with team names | padel | PD-09 | READY | Wave 3b R2 · S |
| SD-76 | Golf team stroke play, best N of M | golf | GF-07 | READY | Wave 3b R2 · M · uses SD-28's `field_entries.team_id` (no separate migration) |
| SD-77 | Chess wall chart / crosstable | chess | CH-06 | READY | Wave 3b R2 · M · needs SD-26 |
| SD-78 | Carrom break and White/Black Slams | carrom | CR-04 | READY | Wave 3b R2 · S |
| SD-79 | Cricket career shows BF, ducks, bowling innings, 4w/5w | cricket | CK-08 (rest) | READY | Wave 3b R2 · S |
| SD-80 | Football own goals credited + shootout takers/keepers | football | FB-13, FB-14 | READY | Wave 3b R3 · S |
| SD-81 | Volleyball box score spec + career with per-set rates + FIVB awards | volleyball | VB-07, VB-08 | READY | Wave 3b R3 · M · needs SD-71 |
| SD-82 | Kabaddi career spec (strike %, Super 10s, High 5s, best match) | kabaddi | KB-04 | READY | Wave 3b R3 · M |
| SD-83 | Kabaddi rule check: touches when the raider is caught | kabaddi | KB-11 | READY | Wave 3b R3 · S · D6 · new matches only (v2) |
| SD-84 | Golf Handicap Index field, trend, unofficial differential | golf | GF-09 | READY | Wave 3b R3 · M |
| SD-85 | Chess ratings (FIDE ID, per time control), rating-seeded R1, ARO, performance rating | chess | CH-07 | READY | Wave 3b R3 · M |
| SD-86 | Carrom career spec (board %, points/board, slams, 25-0 games) | carrom | CR-05 | READY | Wave 3b R3 · M |
| SD-87 | Golf match play with strokes (handicap dots, holes 10–18) | golf | GF-10 | READY | Wave 3b R4 · M |
| SD-88 | Golf proper scorecard view | golf | GF-11 | READY | Wave 3b R4 · S |
| SD-89 | Golf playoff tie-break option | golf | GF-12 (playoff) | READY | Wave 3b R4 · S |
| SD-90 | Athletics: track (sprints, hurdles, middle/long distance, steeplechase, relays): heats → semis → final with Q/q, lanes, times to 0.01 (hand times flagged), wind for 100/200/hurdles; DNS/DNF/DQ with rule ref; PB/SB/records; relay teams | athletics | World Athletics Technical Rules / Competition Rules | READY | Wave 4 · L · needs SD-28 · D9 picks the first event list |
| SD-91 | Athletics: field (LJ, TJ, HJ, PV, SP, discus, hammer, javelin): attempt cards (3 + 3 for top 8), best mark with countback on the next best, height progression with O/X/– and jump-off, wind for horizontal jumps, NM | athletics | World Athletics Technical Rules (field events) | READY | Wave 4 · L · needs SD-28 |
| SD-92 | Athletics: road and cross-country (marathon/half/10 km, race walks, XC), team scoring by placings | athletics | World Athletics road / XC rules | READY | Wave 4 · M · needs SD-28 |
| SD-93 | Athletics: combined events (heptathlon / decathlon / school pentathlon) with World Athletics scoring tables | athletics | World Athletics Scoring Tables for Combined Events | READY | Wave 4 · M · needs SD-90, SD-91 |
| SD-94 | Swimming: heats/semis/finals by time, lanes, splits, relays (takeover DQ), DQ codes, records | swimming | World Aquatics Swimming Rules (SW) | READY | Wave 4 · L · needs SD-28 |
| SD-95 | Archery: ranking round (ends × arrows, X/10 count tie-breaks), set-system match play (recurve), cumulative (compound), shoot-off | archery | World Archery Rulebook | READY | Wave 4 · L · needs SD-28 (+ bracket) |
| SD-96 | Shooting: qualification series (decimal / integer scoring), finals elimination format, inner-ten tie-breaks | shooting | ISSF General Technical Rules | READY | Wave 4 · M · needs SD-28 |
| SD-97 | Weightlifting: snatch + clean & jerk, 3 attempts each, total, bodyweight categories, tie goes to the athlete who reached the total first | weightlifting | IWF Technical & Competition Rules | READY | Wave 4 · M · needs SD-28 |
| SD-98 | Cycling: road (mass start, time trial, GC by time) and track (sprint, keirin, pursuit, points / scratch races) | cycling | UCI Regulations (Part 2 road, Part 3 track) | READY | Wave 4 · L · needs SD-28 |
| SD-99 | Rowing: heats → repechage → finals by time, crews and boat classes, progression system | rowing | World Rowing Rules of Racing | READY | Wave 4 · M · needs SD-28 |
| SD-100 | Canoe / kayak sprint (K1/C1 … K4, heats → semis → finals by time); slalom optional later | canoe / kayak | ICF Canoe Sprint Competition Rules | READY | Wave 4 · M · needs SD-28 |
| SD-101 | Hockey (FIH): 4 × 15-min quarters, goals (field / penalty corner / stroke), penalty corners won/converted, green/yellow/red cards with timed suspensions, shoot-out, box score, career (GK saves %), FIH points 3-1-0 + shoot-out bonus variants, FIH tie-breakers, leaderboards, awards, public guide | hockey | FIH Rules of Hockey; FIH tournament regulations | READY | Wave 4 · L · needs SD-11, SD-15–SD-19, SD-23, SD-24, SD-27, SD-29 |
| SD-102 | Handball (IHF): 2 × 30-min halves, goals/shots by type, 7-metre throws, 2-minute suspensions, yellow/red/blue, GK saves %, timeouts, penalty shoot-out, box score, career, IHF points 2-1-0 + IHF tie-breakers, leaderboards, awards, public guide | handball | IHF Rules of the Game; IHF regulations | READY | Wave 4 · L · needs SD-11, SD-15–SD-19, SD-23, SD-24, SD-27, SD-29 |
| — | P2 items (PLAN.md §6.2): FB-16–19, BK-12/13, VB-10/11, KB-09/10, TN-12–14, BD-06/10–12, TT-09–11/13, SQ-07/10, PD-11/12, PB-09/13, GF-13–17, CH-09/10/12, CR-07/09, CK-09–12, GEN-26, ranking points, ratings | — | — | PARKED | Promote into the queue when a wave clears |
