# Basketball — depth audit

Standard sources: **FIBA Official Basketball Rules 2024** (team fouls Art. 41, timeouts Art. 18, overtime team fouls Art. 41.1.2, classification Art. D of the Official Basketball Rules "Classification of teams"); the **FIBA LiveStats / FIBA box score** as published on fiba.basketball (MIN, FGM-A, FG%, 2PM-A, 3PM-A, 3P%, FTM-A, FT%, OREB, DREB, REB, AST, TO, STL, BLK, PF, FD, +/-, EFF, PTS; team totals, team rebounds, bench points, points off turnovers, second-chance points, biggest lead, lead changes, times tied); FIBA tournament stat leaders (ranked by **per-game average**, PPG/RPG/APG/SPG/BPG, plus EFF). NBA/NCAA as a cross-check only.

Builds on `docs/sport-coverage/basketball.md` (capture audit: FT flow, foul types, subs, STL/BLK/TO, OREB/DREB, timeouts all shipped). That audit is not repeated here.

Summary: capture is now good (a scorer can log almost every FIBA box-score event except **missed field goals**), but the stats we *show* are a thin slice of what we capture. The live box score is PTS/REB/AST/STL/BLK/TO/PF only (`src/sports/basketball/BoxScore.tsx:13`, `:45-51`) — FT M-A and OREB/DREB are captured but never shown, there are no team totals, no shooting lines, no +/-. Stat lines only carry `points`, `rebounds`, `assists`, `steals`, `blocks`, `turnovers`, `fouls`, `freeThrowsMade/Att`, `ejections` — there is no FGM/3PM key, so 3-pointers made are lost the moment you leave the match. The player profile shows raw totals with half the labels as raw keys (`freeThrowsAtt`, `steals`, `turnovers`), no per-game averages, no %s, no career highs. The **league table defaults are wrong for FIBA** (a loss gives 0, FIBA gives 1; `src/data/standings.ts:99-101`) and FIBA's head-to-head tie-break chain is incomplete. Two rule bugs: the FIBA/NBA bonus fires one foul late, and technicals are wrongly excluded from FIBA team fouls; OT team fouls reset instead of carrying over from Q4.

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Line score by period + total | Core | `BasketballScoreboard` `index.tsx:585-604` | ✅ | OT columns included |
| Play-by-play | Core | `Timeline.tsx`, events `events.ts:2-13` | ✅ | |
| PTS per player | Core | `BoxScore.tsx:27` via `pointsOf` | ✅ | |
| FGM / FGA, FG% | Core | made FGs logged as `score` events (`engine.ts:127-135`); **no missed-FG action** | ❌ | FGA impossible without a "Miss 2 / Miss 3" tap. Practical for one scorer (same tap count as a make). |
| 2PM-A / 3PM-A, 3P% | Core | made 2s/3s derivable from `score.points` in the log; not tallied, not shown, not in stat lines | ⚠️ | Makes derivable today; attempts need the miss tap. |
| FTM / FTA, FT% | Core | captured (`engine.ts:136-142`, attribution `extra: {freeThrowsMade, freeThrowsAtt}` `index.tsx:128-133`) | ⚠️ | Captured and in stat lines, **not shown in the box score**. |
| "+1" button in full-court games | — | `pointValues = [1,2,3]` for timed games (`index.tsx:75`, `:394`) logs a 1-pt **field goal**, not a free throw | ⚠️ | A made FT entered via +1 skips FTM/FTA. Full-court +1 should route to the FT flow (3×3 keeps 1-pt FGs). |
| OREB / DREB / REB | Core | split captured (`ReboundType` `events.ts:19`, `engine.ts:143-146`) | ⚠️ | Box shows REB only; stat line has only `rebounds` (no split key). |
| AST, STL, BLK, TO | Core | ✅ captured + shown `BoxScore.tsx:28-32` | ✅ | |
| PF | Core | ✅ `BoxScore.tsx:33` | ✅ | Technicals counted as PF (correct for FIBA). |
| Fouls drawn (FD) | Adv | not captured | ❌ | P2 — one optional tap in the foul flow ("fouled player"). |
| MIN | Core | needs on-court tracking; `onCourtNames` exists (`engine.ts:80-90`) when the five is set, minutes stamped per event (`minute`) | ⚠️ | Approximate minutes derivable when "Set five" + subs are used; manual clock is count-up minutes only. P2. |
| +/- | Core (FIBA box) | not computed | ❌ | Fully derivable from score events × `onCourtNames` when the five is set. Hide when the five wasn't set. |
| EFF (FIBA efficiency) | Core (FIBA) | not computed | ❌ | PTS+REB+AST+STL+BLK − missed FG − missed FT − TO. Partial without FG misses. |
| Starters marked | Core | `SET_LINEUP` stored (`engine.ts:166-170`) but not shown | ⚠️ | |
| Team totals row | Core | absent — `BoxScore` renders players only (`BoxScore.tsx:53-68`) | ❌ | |
| Team fouls per period | Core | computed (`teamFoulsThisQuarter` `engine.ts:73-74`), shown only as a bonus banner (`index.tsx:411-415`) | ⚠️ | Show "Team fouls 3 / 4" per side per period. |
| Bonus threshold (FIBA/NBA: penalty from the 5th team foul) | Core rule | `inBonus` = fouls ≥ `foulsForBonus` (`engine.ts:92-93`); FIBA & NBA presets set `foulsForBonus: 5` (`index.tsx:629-630`) | ❌ | **Off by one**: bonus banner appears from the 6th foul. Should be 4 for FIBA/NBA. |
| Technicals count as team fouls (FIBA) | Core rule | excluded (`engine.ts:74`) | ❌ | FIBA Art. 41: a player technical **is** a team foul; NBA excludes. Needs a per-format flag. |
| OT team fouls carry from Q4 (FIBA Art. 41.1.2) | Core rule | reset each period (`e.quarter === s.quarter`, `engine.ts:74`) | ❌ | |
| Timeouts (FIBA 2 first half / 3 second half / 1 per OT) | Core | single whole-game pool (`timeoutsUsed` `engine.ts:76-77`, preset `timeouts: 5`) | ⚠️ | P1 — per-half pools. |
| Draw result | rule | "End as a draw" offered after regulation (`index.tsx:529`) | ⚠️ | FIBA has no draws; keep only for friendly/custom formats. |
| Biggest lead / lead changes / times tied | Core (FIBA team stats) | not computed | ❌ | Free — pure derivation from the event log. |
| Bench points | Core (FIBA) | not computed | ❌ | Derivable once the starting five is set. |
| Points off turnovers / second-chance points | Adv | not computed | ❌ | Heuristic derivation from event order (TO→opp score; OREB→same-side score). P2. |
| Points in paint / fast-break points | Adv | — | Out of scope | Needs per-shot tagging; see §5. |
| Match summary / MVP rating | Core | generic `matchRatings` with weights `{points 1, rebounds 1.5, assists 2, fouls −1}` (`src/data/ratings.ts:22`) | ⚠️ | Steals, blocks, turnovers ignored — should be FIBA EFF. |
| Per-match role awards | Core | Top scorer / Rebounds / Playmaker (`ratings.ts:80-84`) | ✅ | |

## 2. Team level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| W-L record, form (last 5) | Core | `computeTeamStats` `src/data/teamStats.ts:39-70` | ✅ | |
| Points for / against | Core | totals, unit "points" (`teamStats.ts:25`) | ✅ | |
| PPG / opp PPG / avg margin | Core | not computed — totals only (`TeamProfileScreen.tsx:199-200`) | ❌ | |
| Head-to-head per opponent | Core | `teamStats.ts:59-64`, shown `TeamProfileScreen.tsx:224-231` | ✅ | |
| Team per-game averages (REB, AST, TO, FT%, 3PM) | Core | — | ❌ | Needs team-side aggregation of stat lines (or of `statTotals`). |
| Home / away split, streak | Adv | — | ❌ | P2. |
| Top performers | Core | `teamStats.ts` leaders via `SPORT_AWARDS` | ✅ | Totals, not averages. |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Classification points: win 2, **loss 1**, forfeit 0 (FIBA) | Core | default `win 2 / draw 1 / loss 0` (`src/data/standings.ts:99-101`) | ❌ | Organiser can override via `lossPoints`, but the default is wrong for every basketball table. |
| Tie-break: h2h points among tied | Core | `h2h` (`standings.ts:301-315`) | ✅ | |
| Tie-break: h2h **point difference** among tied, then h2h points scored | Core | not available — `diff`/`for` are **overall** (`standings.ts:268-275`); `availableTieBreakers` = h2h/diff/for (`:111-114`) | ❌ | FIBA order: h2h pts → h2h diff → h2h scored → overall diff → overall scored. Needs `h2hDiff`, `h2hFor`; must re-apply among a still-tied subset (FIBA restarts, like ITTF's `restart`). |
| Table columns PF / PA / +/- | Core | StandingsScreen shows P W (D) L (NR) (NRR) Pts only (`src/screens/StandingsScreen.tsx:270-280`) | ❌ | `TeamStanding.for/against/diff` exist but aren't shown. `LeagueTable.tsx:39` shows them inline. |
| Forfeit = 20-0, 0 points | Core | walkovers exist generically | ⚠️ | Check walkover scores 20-0 for basketball (not verified). |
| Leaders (PTS/REB/AST/STL/BLK) | Core | `STAT_CATEGORIES.basketball` (`standings.ts:397-403`), **totals** | ⚠️ | FIBA ranks by per-game average with a min-games floor. Add TO, FT%, 3PM, EFF. |
| Awards: MVP + role awards | Core | `TOURNAMENT_AWARD_SLOTS` (`ratings.ts:200-205`), MVP = Σ weights | ⚠️ | MVP formula should be EFF/game. |
| Brackets / knockouts | Core | generic bracket | ✅ | |
| 3×3 classification (win %, then points scored avg) | Core (3×3) | not modelled | ❌ | P2 — FIBA 3×3 uses win % / h2h / avg points scored. |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| GP, W, win% | Core | `SportProfileScreen.tsx:175-180` | ✅ | |
| Career totals | Core | generic grid (`SportProfileScreen.tsx:201-218`) | ⚠️ | Labels missing for `steals`, `blocks`, `turnovers`, `freeThrowsMade`, `freeThrowsAtt`, `ejections` — rendered as raw keys (`LABELS` `SportProfileScreen.tsx:25-40`). |
| PPG / RPG / APG / SPG / BPG / TOPG | Core | only "ppg" in a list-row headline (`src/data/stats.ts:151-152`) | ❌ | |
| FG%, 3P%, FT% | Core | FT% computable (FTM/FTA in lines) but not shown; FG/3P not in lines | ❌ | |
| 3PM career | Core | lost — `SCORE` attribution is `stat: 'points'` only (`index.tsx:90`) | ❌ | Add `fgMade`/`threesMade` (and `fgAtt`/`threesAtt` with misses) as `extra` keys. |
| Career highs (PTS, REB, AST in a game) | Core | — | ❌ | Lines are per match → max over lines. |
| Double-doubles / triple-doubles | Core | — | ❌ | Derivable per line (≥10 in two of PTS/REB/AST/STL/BLK). |
| Per-match game log with box line | Core | history rows show raw `key value` pairs (`SportProfileScreen.tsx:289`) | ⚠️ | Format as "18 PTS · 7 REB · 4 AST · 3/4 FT". |
| EFF per game | Core (FIBA) | — | ❌ | |
| Season split | Adv | — | ❌ | P2, generic. |

## 5. Out of scope (needs tracking / extra spotters)

- Shot charts / shot location, points in the paint, fast-break points (need per-shot location tagging — a second spotter in practice).
- Exact seconds played (needs a running game clock with stoppages; ours is a manual count-up per period, `engine.ts:95-101`). Approximate MIN from event stamps is in scope (BK-10).
- Deflections, contested shots, screen assists, hustle stats.
- Shot-clock violations as a live countdown (already deferred in the coverage audit; the referee's call).

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| BK-01 | **Rule fixes**: FIBA/NBA presets `foulsForBonus: 4` (penalty from the 5th); new format flag `techIsTeamFoul` (FIBA true, NBA false) used in `teamFoulsThisQuarter`; OT fouls count with the last regulation period (FIBA). Old matches replay identically because the flag defaults to the old behaviour when absent from the stored config. | P0 | S | Match | None (config keys only; absent = legacy behaviour) | No | No |
| BK-02 | **FIBA classification defaults**: basketball `win 2 / loss 1`; add tie-breakers `h2hDiff`, `h2hFor` with restart-among-subset; default order h2h → h2hDiff → h2hFor → diff → for. Show PF / PA / +/- columns in StandingsScreen for points sports. | P0 | M | Tournament, Team | None | No (format JSON) | **GEN** — `h2hDiff/h2hFor` also fit football (FIFA h2h GD), kabaddi, handball-style sports |
| BK-03 | **Missed field goal capture**: "Miss 2" / "Miss 3" buttons next to the makes (1 tap, optional player). New action `MISS` → event `type: 'miss', points: 2|3`; `pointsOf` = 0. Stamp `extra: {fgAtt, threesAtt}`; makes add `extra: {fgMade, fgAtt, threesMade?, threesAtt?}`. Full-court "+1" routes to the FT flow. Per-match toggle "Track missed shots" (stamped in `tracked`) so profiles show coverage like football. | P0 | M | Match, Player, Tournament | New action `MISS`; new `extra` keys on `SCORE`. Old logs: no `MISS`, old `SCORE` has no extra → FG% shows "–" (coverage flag), score unchanged. | No | No |
| BK-04 | **FIBA box score**: columns PTS · FG M-A · 3P M-A · FT M-A · OREB · DREB · REB · AST · STL · BLK · TO · PF · +/- · EFF; starters marked; team totals row; team fouls per period. Horizontal scroll on phones, sticky name column. Derive everything from `events` (no new capture beyond BK-03). | P0 | M | Match | None (pure derivation) | No | **GEN** — a shared `BoxScoreTable` (columns spec + sticky name + totals row + period toggle) for basketball/volleyball/kabaddi/football |
| BK-05 | **Basketball `statTotals`** (parity #19 pattern): absolute per-match stat lines from the event log (`points, fgMade, fgAtt, threesMade, threesAtt, ftMade, ftAtt, oreb, dreb, rebounds, assists, steals, blocks, turnovers, fouls, plusMinus, eff, started`). Fixes drift from edits/removals and records OREB/DREB + 3PM that live increments miss. | P0 | M | Player, Team, Tournament | None (reads existing log; new stat keys only) | No | **GEN** — every event-log sport should ship `statTotals` |
| BK-06 | **Basketball career** (`basketballCareer.ts`, copy of `cricketCareer.ts`): GP, PPG/RPG/APG/SPG/BPG/TOPG, FG%/3P%/FT% (rates only over lines that carry the inputs), career highs, double-doubles/triple-doubles, EFF/game; game-log row "18 PTS · 7 REB · 3/4 FT". Add the missing labels. | P0 | M | Player | None | No | **GEN** — a shared `sportCareer` framework (sections of {label, total, perGame, rate, best}) driven by a per-sport spec |
| BK-07 | **Tournament leaders by average** (min-games floor, FIBA style) + categories TO, 3PM, FT%, EFF; MVP slot = EFF/game; match rating weights = EFF (`ratings.ts:22`). | P1 | S | Tournament, Match | None | No | **GEN** — "rank by per-game average" switch on `leadersByKey` |
| BK-08 | **Team per-game**: PPG / opp PPG / margin, team REB/AST/TO/FT% per game, streak, home/away. | P1 | S | Team | None | No | **GEN** (per-game team averages for any score-unit sport) |
| BK-09 | **Game flow stats**: biggest lead, lead changes, times tied, bench points, largest run (e.g. "12-0 run") — on the match summary. | P1 | S | Match | None | No | **GEN** for any running-score sport (football/kabaddi/handball-like) |
| BK-10 | **+/- and approximate MIN** from the starting five + subs (`onCourtNames`), shown only when the five was set; nudge the scorer to "Set five" at tip-off. | P1 | M | Match, Player | None (derivation); maybe stamp `minute` on SUB already present | No | No |
| BK-11 | **FIBA timeouts per half** (2 / 3 / 1 per OT) and "End as a draw" only for formats that allow it. | P1 | S | Match | None (config key `timeoutsByHalf`) | No | No |
| BK-12 | **Fouls drawn (FD)** — optional "fouled player" in the foul flow; **points off turnovers / second-chance points** derived. | P2 | S | Match, Player | Optional `payload.fouledName` on `FOUL` | No | No |
| BK-13 | **3×3 classification** (win %, h2h, avg points scored) as a standings preset. | P2 | S | Tournament | None | No | No |

GEN- candidates from this sport: shared box-score table (BK-04), `statTotals` for every event-log sport (BK-05), shared career framework with per-game/rates/bests (BK-06), leaders by average (BK-07), team per-game averages (BK-08), game-flow stats (BK-09), FIBA-style h2h-diff/h2h-for tie-breakers (BK-02), and a **single stat-label registry** (today three maps disagree: `stats.ts:76-84`, `ratings.ts:40-50`, `SportProfileScreen.tsx:25-40`).
