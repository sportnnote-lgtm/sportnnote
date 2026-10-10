# Cricket — depth audit

Standard sources:
- ICC Playing Conditions (Men's T20I / ODI, 2023–24 editions), especially the **Net Run Rate** clause in the ICC Playing Handbook / event Standard Playing Conditions: a side bowled out is charged its full quota of overs. In a match decided under DLS, Team 1 is credited with *(revised target − 1)* off the overs Team 2 was allotted. A no-result is excluded.
- ICC event points tables (CWC 2023, T20 WC 2024): P / W / L / T / NR / Pts / NRR, then tie-breaks per the event regulations (most wins → NRR → h2h → …).
- ESPNcricinfo / Statsguru stat sets:
  - **Batting:** Mat, Inns, NO, Runs, HS, Ave, BF, SR, 100, 50, 0, 4s, 6s.
  - **Bowling:** Mat, Inns, Balls/Overs, Mdns, Runs, Wkts, BBI, BBM, Ave, Econ, SR, 4w, 5w (10w for Tests).
  - **Fielding:** Ct, St, wicket-keeper dismissals (Dis = Ct + St as keeper).
  - **Captaincy:** Mat, W, L, T, NR, W/L %.
  - Every table can be filtered by format (Test / ODI / T20I / FC / List A / T20) and by opposition, season and tournament.
- ESPNcricinfo **tournament records page**:
  - Most runs, most wickets, highest scores, best bowling figures, best averages (qualifier), best strike rates (qualifier, e.g. ≥ 50 balls), best economy (qualifier, e.g. ≥ 10 overs).
  - Most 100s / 50s, most 6s / 4s, most catches, most dismissals (keeper).
  - Highest partnerships (overall and by wicket), highest and lowest team totals, largest victories.
- The CricHeroes app's player and leaderboard sets serve as the consumer-app benchmark (leather vs tennis-ball split, by-format filters).

Summary: Cricket's **match level** is deep after the parity queue. Live coverage spans 25 action types, a full scorecard with FoW, partnerships, Manhattan/worm, maidens, extras and fielding notes, absolute `statTotals` sync, corrections, DLS and ticker. The **points table** is close to ICC: W/L/T/NR, NRR with the all-out = full quota rule, organiser NR points, adjustments and h2h. The **player career** has the core Statsguru line, except **Mat (true appearances), ducks, 4w/5w and BF**. It has **no format split** (T20 / ODI / T10 / box / tennis ball all sum together) and **no captaincy or wicket-keeper record**. **Tournament records are the weakest area.** The leaders rail has only *Runs, Wickets, Catches*, because the leaderboard engine can only *sum* a key. It cannot rank highest score, best figures, SR, economy or average, and it cannot apply qualifiers. Partnership and team-total records are not kept beyond the match: the ball log is dropped from the snapshot. At **team level**, cricket shows no top performers (`SPORT_AWARDS.cricket = []`), shows ties as "D", leaves NR out, and has no season NRR or team records. Two NRR edge rules are missing: DLS crediting, and an "all out" caused by a retired-hurt batter who can't resume.

## 1. Match level   (brief: parity covered it; only ICC gaps that remain)

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Ball-by-ball, all extras, all 10+ dismissal modes, penalty runs, retired hurt/out, timed out | Core | 25 action types, `src/sports/cricket/engine.ts:237-239` dismissal kinds | ✅ | parity #14–#20 |
| Scorecard: bat/bowl cards, extras, FoW, partnerships, over history | Core | `src/sports/cricket/scorecard.ts:39-197` | ✅ | `log` only after replay (`scorecard.ts:16`) |
| Maidens / wides / no-balls per bowler | Core | `bowlerSplits` `scorecard.ts:196-221` | ✅ | |
| DLS Standard Edition table | Core | `dls.ts`, `dlsV=2`; full ICC table pending founder research (#18 decision) | ⚠️ | already queued (`dlsV=3`) |
| Super Over (excluded from careers) | Core | `scorecard.ts:224-226`, engine `superOver` | ✅ | |
| Multi-innings match (Test / 2-day school game): two innings each, declaration, follow-on, innings victory | Core (long format) | "Test / timeless" preset = one innings each, 999 overs (`index.tsx:1952`) | ❌ | no `DECLARE` / 2nd-innings structure. School 2-day fixtures can't be captured as played |
| Bowling over-quota & consecutive-over check | Core | `bowlerMaxOvers` `engine.ts:90,254-259`; `editOvers.ts:501` | ✅ | |
| In-match over-rate penalty (fielder inside circle) | Adv | not modelled | ❌ | P2; affects fielding only, not stats |
| Wagon wheel / pitch map | Adv | `rules.ts:22` "reserved — no UI yet" | ❌ | one-phone feasible (tap a zone); P2 |
| Batting position recorded per innings | Core | BatCard order is implicit in insertion; not emitted in `statTotals` | ⚠️ | needed for "runs at No. 3" style splits; P2 |

## 2. Team level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Mat / W / L | Core | `computeTeamStats` `src/data/teamStats.ts:37-66` | ✅ | |
| Tied | Core | tie = `winner:'draw'` → shown as **D / "Drew"** (`teamStats.ts:31`, `TeamProfileScreen.tsx:189-192`) | ⚠️ | cricket has no draws in limited-overs; label must read "T" |
| No result | Core | `resultFor` returns null for NR → **dropped from Played** (`teamStats.ts:29-30`) | ❌ | ICC record is Mat incl. NR. Team page Played ≠ table P |
| Season / all-time NRR | Core | only inside a tournament table (`standings.ts:225-228`) | ❌ | the team page shows "Runs for / against / Difference" (`TeamProfileScreen.tsx:199-201`), and a raw run difference means nothing in cricket |
| Head-to-head | Core | P/W/D/L + runs for–against (`teamStats.ts:62-66`) | ⚠️ | uses D for tie; no NR column; runs aggregate not meaningful |
| Form (last 5) | Core | ✅ `teamStats.ts:59` | ✅ | |
| Top performers (most runs / wickets for the team) | Core | `awardsBySport` = `SPORT_AWARDS`, and `SPORT_AWARDS.cricket = []` (`ratings.ts:98`) → **none** (only "Most games") | ❌ | quick fix: feed cricket stat slots |
| Highest / lowest team total, largest win (runs / wkts) | Core | not computed | ❌ | needs innings totals per match (have `m.score`) and the margin (`outcome`) |
| Batting first vs chasing record, toss record | Adv | `state.toss` exists (`engine.ts:98-100`) but not aggregated | ❌ | P2 |
| Captaincy record per captain | Core | `state.captains` (`engine.ts:95-96`) never leaves the match | ❌ | see CK-04 |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Points table P/W/L/T/NR/Pts/NRR | Core | `teamStandings` `standings.ts:182-252`; NR column + NRR column `StandingsScreen.tsx:258-300` | ⚠️ | the tie column is headed **D** (`StandingsScreen.tsx:149,297`). The compact `LeagueTable` shows "W D L · runs for:against (diff)" (`LeagueTable.tsx:39`), and a run difference is not a cricket table figure |
| Points: 2/1/0, NR points configurable | Core | `defaultStandingsConfig` `standings.ts:90-104`; `noResultPoints` `:106-108` | ✅ | |
| Tie-break order (h2h, NRR, runs for; editable) | Core | `standings.ts:102,111-114`; `PointsEditor` | ⚠️ | ICC events rank **most wins** before NRR (CWC 2023 / T20 WC). `wins` exists as a TieBreaker but isn't offered for cricket (`availableTieBreakers` `:111-115`) |
| NRR all-out = full quota | Core | `nrrOvers` `engine.ts:492-496` | ✅ | uses `s.oversLimit`, which a rain reduction rewrites. Team 1 bowled out before a cut to Team 2's overs gets charged the *revised* quota. Edge case |
| NRR in a DLS-decided match | Core | runs from `m.result.score ?? m.score` (`standings.ts:215`), overs from `nrrOvers` | ❌ | ICC: Team 1 = (revised target − 1) off Team 2's allotted overs. Needs a plugin `standingsScore` hook |
| NRR when innings closed with < wicketsLimit (retired hurt cannot resume / absent) | Core | `inn.wickets >= s.wicketsLimit` only (`engine.ts:494`) | ⚠️ | ICC treats "no batters left" as all out → full quota |
| NRR for manual result (count in NRR, all overs) | Core | `manualNrrOvers` `engine.ts:499-500` | ✅ | |
| Super Over excluded from NRR | Core | `result()` uses `s.scores` regulation runs (`index.tsx:1901-1906`) | ✅ | |
| Cross-group "best 3rd place" seeding by NRR | Core | `seedCmp` `groups.ts:33-42` | ✅ | (see cross-sport bug for other sports) |
| Most runs / wickets / catches | Core | `STAT_CATEGORIES.cricket` `standings.ts:398-402` | ✅ | |
| Highest individual score | Core | — (`highestScore()` exists for a career, `cricketCareer.ts:41`, never used as a leaderboard) | ❌ | needs "max-of-line" leaderboard |
| Best bowling figures (BBI) | Core | — (`bestBowling()` `cricketCareer.ts:30`) | ❌ | needs "best figure" comparator (w desc, r asc) |
| Best batting average / strike rate (qualified) | Core | Avg/SR only appear in the award *detail* string (`ratings.ts:258-265`) | ❌ | needs rate leaderboards + qualifiers (min balls / inns) |
| Best economy / bowling SR / bowling average (qualified) | Core | — | ❌ | same |
| Most 4s / 6s / 50s / 100s / ducks | Core | 4s/6s keys exist on lines; not categories | ❌ | 4s/6s are a 2-line change; 50s/100s need per-line threshold count |
| Most maidens / dot balls | Adv | keys exist (`scorecard.ts:226-232`) | ❌ | add categories |
| Most dismissals (keeper) | Core | stumpings key only; catches not split keeper/fielder | ❌ | see CK-04 |
| Highest partnerships (overall / per wicket) | Core | `partnerships()` per match from `state.log` only, and `snapshot` drops the log (`types.ts:366-368`) | ❌ | needs a persisted per-match records block |
| Highest / lowest team totals, biggest wins | Core | — | ❌ | from `m.score` + `outcome` |
| Awards: Player of Tournament, best batter, best bowler | Core | `EXTRA_SLOTS.cricket` `ratings.ts:191-195`; MVP weights runs 1 / wkt 18 / ct 8 `ratings.ts:28` | ✅ | no best fielder / keeper / emerging slot (custom award possible) |
| MVP weighting | Adv | a flat linear sum, with no SR / economy impact | ⚠️ | per-match cricket MVP is richer (`index.tsx:1295-1364`). The tournament one is cruder, so the two disagree |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Mat (appearances) | Core | `bySport.matches` = number of stat lines (`stats.ts:45-48`). A line exists only when a player batted, bowled, fielded or had a note (`scorecard.ts:247-299`; inserts in `repos.ts:2658`) | ⚠️ | an XI player who did none of those has no match. Statsguru Mat counts every appearance |
| Inns / NO / Runs / HS / Ave / SR / 4s / 6s / 50 / 100 | Core | `cricketCareer.ts:51-80` | ✅ | 50s = 50–99 correctly (`:58,77-78`); legacy lines handled |
| Balls faced (BF) shown | Core | used for SR, not shown | ⚠️ | 1-line add |
| Ducks (0) | Core | derivable (innings 1, runs 0, notOut 0); not shown | ❌ | |
| Bowling: Overs, Wkts, Runs, Mdns, Econ, Ave, SR, Best, Dots | Core | `cricketCareer.ts:82-95` | ✅ | `careerOvers` hard-codes 6-ball overs (`:23`). Hundred / 8-ball matches read wrong. Store balls and show overs per bpo, or show balls |
| Bowling innings | Core | — | ❌ | count lines with `ballsBowled > 0` |
| 4w / 5w hauls | Core | — | ❌ | per-line threshold count |
| BBI vs BBM | Core | `bestBowling` per line = per match (= BBI for one-innings games) | ⚠️ | becomes BBM once multi-innings exists |
| Fielding: Ct, St, RO, drops, runs saved/missed | Core/Adv | `cricketCareer.ts:96-103` | ✅ | |
| Keeper catches vs fielder catches; keeper dismissals | Core | `state.keepers` known (`engine.ts:97`), not emitted | ❌ | CK-04 |
| Captaincy (Mat, W/L/T/NR, W%) | Core | `state.captains` known, not emitted | ❌ | CK-04 |
| Split by format (T20 / ODI / T10 / Hundred / box / Test-like) and ball (leather / tennis) | Core | none; every cricket line sums together. `matches.config` carries `preset`, `overs`, `ballType` (`index.tsx:1944-1966`) | ❌ | CK-03, the headline credibility gap: a box-cricket 6-ball-50 inflates a "T20" SR |
| Split by season / tournament / opposition | Core | history list only; `opponent` text on line | ❌ | filter chips over the same lines |
| Per-match history line | Core | `cricketMatchLine` `cricketCareer.ts:105-116` | ✅ | WON/LOST pill shows a tie / NR as **LOST** (`SportProfileScreen.tsx:293`) |
| Win % | Core | `wins / matches` (`SportProfileScreen.tsx:177-179`), where a tie or NR counts as a non-win | ⚠️ | |

## 5. Out of scope (needs tracking / extra spotters)

- Ball speed, line and length / pitch-map accuracy, beehive and release-point analytics: need Hawk-Eye or a second spotter.
- Control % / false-shot % (CricViz): need an analyst per ball.
- The wagon wheel is **in scope** (one tap per scoring shot); listed as P2 above.

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| CK-01 | **Records leaderboards**: highest score, best figures, best Ave / SR / Econ (with organiser-set qualifiers, default ≥ 30 balls / ≥ 6 overs for T20), most 4s / 6s / 50s / 100s / maidens / dots / ducks. Built on GEN-02 aggregate kinds (`max`, `best`, `rate+qualifier`, `count-if`) | P0 | M | Tournament, Player | none (all from existing line keys) | no | yes (GEN-02) |
| CK-02 | **Team page + table labels for cricket**: tie shows "T" (not D) on the team page, `StandingsScreen` and `LeagueTable`; NR counted in Mat with an NR column; season NRR replaces "Difference"; top run-scorer / wicket-taker (fill the empty `SPORT_AWARDS.cricket` for the team view); highest / lowest totals; biggest wins | P0 | S | Team | none | no | partly (GEN-04 result kinds) |
| CK-03 | **Career by format**: classify each line by its match's `config` → T20 (≤ 20 ov), One-day (21–50), T10 / Sixes / box (≤ 10 ov or < 11-a-side), Hundred (bpo 10), Long (multi-innings / 999). Plus ball type (leather / tennis). Filter chips on the sport profile, leaders and awards. Read-time join with `matches` (`useLeagueData` already loads them) | P0 | M | Player, Tournament | none | no (optional `stat_lines.format` text column later for server-side queries) | yes (GEN-05 line context) |
| CK-04 | **Captain & keeper flags in `statTotals`**: emit `capt:1`, `wk:1`, `wkCatches`, `byesConceded` (keeper) from `state.captains` / `state.keepers` and the dismissal list. The career gets a Captaincy section (Mat, W/L/T/NR, W%) and keeper dismissals | P1 | S | Player, Team | none. Derived from the existing SET_CAPTAIN / SET_KEEPER; old matches gain the keys only on a re-sync (backfill replay script) | no | no |
| CK-05 | **NRR completeness**: (a) a `standingsScore` plugin hook. In a DLS-decided match, Team 1 = target − 1 off Team 2's allotted overs (`inn2Overs`). (b) "all out" also when the innings closed with no batter available (retired hurt / absent). (c) Keep the original quota for Team 1 when the cut only hit Team 2. Gate on `dlsV` so legacy tables don't move unless the organiser re-computes | P0 | S | Tournament | none (read-side). Must leave `dlsV`-less matches identical | no | the hook is generic (`standingsScore?`) |
| CK-06 | **"Most wins" tie-break offered for cricket** (ICC event order: Pts → wins → NRR → h2h) | P1 | S | Tournament | none | no | yes |
| CK-07 | **Persisted per-match records block**: `snapshot()` keeps a compact `records` object (partnerships top 3 per side with wkt no., team totals, FoW). This feeds tournament partnership and total records without replaying every log | P1 | M | Tournament, Team | none (derived on snapshot). Old matches backfilled by a one-off replay | no (rides `matches.state` jsonb) | yes (GEN-06 match-records hook) |
| CK-08 | **True appearances (Mat)**: at completion, write a zero-stat line (`{apps:1}`) for every matchday-squad player without one (lineup known: `lineup.ts`). Also shows BF, ducks, bowling innings and 4w/5w in the career | P1 | S | Player | none | no | yes (GEN-03) |
| CK-09 | **Multi-innings format** (2 innings each, `DECLARE`, follow-on, innings victory, BBM). For school 2-day games | P2 | L | Match → all | new `DECLARE`, `ENFORCE_FOLLOW_ON` actions; new `inningsNo` on BallRec. Old logs (one innings) replay unchanged | no | no |
| CK-10 | **Overs display per balls-per-over** in the career (Hundred / 8-ball) — or show balls for non-6-ball formats once CK-03 splits them | P2 | S | Player | none | no | no |
| CK-11 | **Wagon wheel** (the reserved toggle `rules.ts:22`): an optional zone tap on scoring shots → per-batter scoring zones | P2 | M | Match, Player | optional `zone` payload key on RUNS. Absent = no zone; replay unaffected | no | no |
| CK-12 | **Tournament MVP aligned to the per-match model** (SR / economy impact) or documented formula | P2 | S | Tournament | none | no | partly (GEN-07) |
