# Football (soccer) — depth audit

Standard sources: IFAB Laws of the Game 2025/26 (Law 7 duration and added time, Law 10 outcome, Law 12 cautions and send-offs, Law 3 substitutions); FIFA official match report and post-match summary (scorers with minute in `45+2'` form, cards, subs, shootout takers); FIFA/Opta core team box score (goals, shots, shots on target, blocked shots, possession, fouls, yellow/red, offsides, corners, saves); Opta/StatsBomb player box score (minutes, goals, assists, shots, on target, saves, goals conceded, cards); FIFA World Cup 2026 Regulations art. 13 and UEFA competition regulations (group tie-breakers: head-to-head points, head-to-head goal difference, head-to-head goals scored, overall GD, overall GF, fair-play points, lots); FIFA Golden Boot (goals, then assists, then fewer minutes), Golden Glove (goalkeeper; clean sheets, saves), Golden Ball (vote); club-site player career pages (Apps / Starts / Mins / Goals / Assists / G per 90 / cards / clean sheets).

Builds on `docs/sport-coverage/football.md` (capture is "ground-ready"). Not repeated here: header as goal type, throw-in/goal-kick events, voice intents, disallowed goals/VAR.

**Summary.** Football has the richest capture of any non-cricket sport: 15 stat kinds plus goal, own goal, card, sub and penalty flows, a FIFA-style Stats tab with a period split, a timeline and lineups. Depth falls away after the final whistle. Five problems are visible to coaches and parents. (1) Appearances and minutes are never recorded. A player who plays 90 minutes without logging a stat has no stat line, so "Matches" undercounts and there are no Apps, Starts or Minutes anywhere. (2) Draws show as **LOST** on the player history, and a player's W/D/L record doesn't exist. (3) Added-time goals show as `47'` instead of `45+2'`, and they are sorted among second-half events. (4) Clean sheets are wrong in three ways: they are never awarded in a 0–0 knockout decided on penalties, they go only to starting defenders (not the goalkeeper who actually finished the match), and they are not re-evaluated after a correction. (5) A blocked shot is counted as **on target**. There is no football career page like `cricketCareer.ts`, which leaves no rates (goals per game, conversion, save %), bests (hat-tricks) or splits. League tables lack FIFA/UEFA head-to-head goal difference and goals scored, and fair-play points. Tournament leaderboards lack a Golden Boot tie-break, a goalkeeper-only Golden Glove and a discipline table.

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Score, scorers with minute | Core | GOAL / OWN_GOAL reducer `engine.ts:280-290`; ticker scorer line `ticker.ts:12-21`; timeline `Timeline.tsx` | ✅ | |
| Minute notation `45+2'` for added time | Core | Clock shows `45+2` live (`engine.ts:194-198`), but events store the absolute minute and the timeline prints `{it.minute}'` (`Timeline.tsx:133`), so a goal at 45+2 reads `47'` | ❌ | Display-only fix: the event already carries `half`, and `halfBase` can be derived from the format |
| Timeline order across halves | Core | Sorted by minute only (`Timeline.tsx:109`): a first-half `47'` sorts above a second-half `46'` | ❌ | Sort by (half, minute, id) |
| Minute convention (goal at 10:30 = `11'`) | Core | `currentMinute` = floor(elapsed) (`engine.ts:180-185`), so events read one minute early and kickoff events read `0'` | ⚠️ | Needs care: backfilled minutes were typed by scorers in the ordinal sense. Gate on a state flag (see FB-03) |
| Half-time score | Core | Not shown; derivable from `events[].half` | ❌ | FIFA reports show "(HT 1–0)" |
| Goal type and body part | Core | `GOAL_TYPES` open/penalty/freekick `index.tsx:73`; body part `events.ts:7` | ✅ | (Header as a type: see coverage audit) |
| Assists | Core | ASSIST attaches to the last goal `engine.ts:291-303` | ✅ | |
| Own goal credited to the player | Core | OWN_GOAL stores the name only; no attribution, so no `ownGoals` stat (`index.tsx:268-271`) | ⚠️ | Opta and FIFA list OGs per player |
| Shots / on target / off target | Core | Shot flow on/off `index.tsx:789-794`; team totals add goals as shots on target `engine.ts:425` | ✅ | |
| Blocked shots | Core | "Blocked" sits under the **On target** branch and records `onTarget:true` (`index.tsx:777-779`), which inflates shots on target. The blocker gets a generic `defenceContribution` | ❌ | Opta: shots = on + off + blocked; a blocked shot is never on target |
| Saves (auto-credited to the GK) | Core | `gkOf` + Saved button `index.tsx:774-775` | ✅ | |
| Corners, fouls (fouler→victim), offsides, handball | Core | STAT kinds `events.ts:55-74`; foul flow `index.tsx:338-345` | ✅ | Corners are team-only (no `STAT_KEY` entry, `index.tsx:189`). Offsides and handballs are credited to players, but `handballs` has no profile label |
| Possession % | Core | Time-based manual toggle with auto hand-over `engine.ts:214-227`, `index.tsx:200-205` | ⚠️ | Practical for one phone only as an estimate; keep it optional (already toggleable) |
| Passes and pass accuracy | Adv | `pass` with `complete`, off by default `engine.ts:81` | ⚠️ | One scorer can't count every pass; fine as optional |
| Crosses, dribbles, tackles, interceptions | Adv | Present `events.ts:60-69` | ✅ | `crosses`, `dribbles` and `handball` are missing from the live-settings toggles (`engine.ts:95-100`) and from `trackedKeys` (`index.tsx:161-173`) |
| Yellow, red, second yellow | Core | `recordCard` auto 2Y→R `index.tsx:179-187` | ✅ | Credits yellowCards 2 + redCards 1, which matches Opta |
| Substitutions with minute | Core | SUB `engine.ts:314-326`; shown in lineups `LineupView.tsx:41-60` | ✅ | No player id is stored, only names |
| Penalty in play (won, taken, scored/saved/missed) | Core | `finishPenalty` `index.tsx:338-348` | ✅ | |
| Shootout: kick sequence and score | Core | `PEN` scored/missed `engine.ts:367-372`; dots UI `index.tsx:1000-1035` | ⚠️ | No taker or goalkeeper per kick, so no FIFA-style shootout listing, and missed vs saved can't be told apart |
| Team stats panel (FIFA-style compare) | Core | `StatsComparison` with Overall/1H/2H/ET split `index.tsx:1106-1178` | ✅ | Missing rows: blocked shots, goals conceded per GK |
| Player box score for the match | Core | `footballStats().players` is computed (`engine.ts:392-436`) but **never rendered**, and its `goals` field is never incremented (dead). The generic `MatchSummary` shows ratings and the top-6 stats per player only | ⚠️ | Need a per-team table: player · mins · G · A · Sh(OT) · cards (+ saves for GK) |
| Minutes played per player | Core | Not computed. Derivable from lineup + `sub` + `red` events + match length | ❌ | Zero extra taps |
| Player of the Match | Core | Generic `MatchSummary` → `matchRatings` + stored override (`ratings.ts:122-158`); football has no `Summary`/`autoPotm` | ✅ | |
| Clean sheet (match) | Core | `endMatch` dispatches CLEAN_SHEET to **starting** lineup slots in `DEFENSIVE_POSITIONS` (`index.tsx:352-361`, `formation.ts:239`). No reducer case. Not awarded on the level-knockout path (`index.tsx:954-962` → END only; the shootout never awards) | ❌ | 0–0 then penalties → nobody gets a clean sheet. A starting GK who went off injured gets one, his replacement doesn't. Without a lineup, nobody gets one. A post-match correction never revisits it |
| Absolute stat sync (`statTotals`) | Core (data integrity) | Football does not implement `statTotals` (`types.ts` contract; plugin `index.tsx:1249-1325`), so profile lines rely on live +/- increments | ⚠️ | Cricket pattern (parity #19) |

## 2. Team level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| P W D L, GF, GA | Core | `computeTeamStats` `teamStats.ts:37-67` | ✅ | |
| Goal difference | Core | Not surfaced on the team page (scored/conceded only) | ⚠️ | Trivial |
| Form (last 5) | Core | `teamStats.ts:59` | ✅ | |
| Head-to-head vs each opponent | Core | `teamStats.ts:63-69` | ✅ | |
| Team clean sheets / failed to score | Core | ❌ | ❌ | Derivable from `m.score` |
| Biggest win / defeat, unbeaten run | Adv | ❌ | ❌ | Records section |
| Home/away (or neutral) split | Adv | ❌ | ❌ | School meets are mostly neutral, so P2 |
| Average team match stats (shots, possession, corners per game) | Adv | ❌ | ❌ | Needs per-match state aggregation |
| Discipline (team cards) | Core | ❌ | ❌ | Feeds fair play |
| Top performers | Core | Leaders from `SPORT_AWARDS` goals/assists/cleanSheets `teamStats.ts:84-95`, `ratings.ts:75-79` | ✅ | |
| Appearances | Core | `playedFor` = matchday squad (starters+subs) or the whole squad `TeamProfileScreen.tsx:72-84` | ⚠️ | Counts unused subs as appearances and has no Starts/Mins |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Points 3-1-0 | Core | `defaultStandingsConfig` `standings.ts:99` | ✅ | |
| Table columns P W D L GF:GA (GD) Pts | Core | `LeagueTable.tsx:39` | ✅ | Form column absent (P2) |
| Tie-break: head-to-head points | Core | `h2h` `standings.ts:300-315` | ✅ | |
| Tie-break: H2H goal difference, H2H goals scored | Core | ❌ Football offers only `h2h, diff, for` (`standings.ts:111-115`); `h2hRatio` is a ratio (ITTF), not a difference | ❌ | FIFA WC 2026 / UEFA order: H2H pts → H2H GD → H2H GF → GD → GF → fair play → lots |
| Tie-break: fair-play (disciplinary) points | Core | ❌ | ❌ | Y −1, 2Y→R −3, direct R −4, Y + direct R −5; all derivable from `events` |
| Tie-break: drawing of lots | Core | Falls back to name order `standings.ts:328` | ⚠️ | Should be explicit ("level — organiser decides") |
| Best third-placed teams across groups | Core (48-team WC) | Not found in `groups.ts` | ⚠️ | Outside this audit; flagged to the tournament track |
| Knockout result shown with pens ("1–1, 4–3 pens") | Core | `summary.statusLine` `index.tsx:1270-1276` | ✅ | |
| Golden Boot leaderboard | Core | `categoryLeaders` goals `standings.ts:376-391`, sorted by value only `leadersByKey` `standings.ts:447-466` | ⚠️ | Ties are arbitrary. FIFA order: goals → assists → fewer minutes |
| Golden Glove | Core | `SPORT_AWARDS` "Clean sheet" over all defensive-position lines `ratings.ts:78` | ❌ | Can go to a centre-back; should be GK only (clean sheets, then saves, then fewer goals conceded) |
| Player of the Tournament | Core | `rankAwardCandidates('mvp')` weighted sum `ratings.ts:239-303` | ✅ | |
| POTM count per player | Adv | ❌ | ❌ | Cheap and visible |
| Discipline table / suspensions (accumulated yellows) | Core (organiser) | ❌ No cards category in `STAT_CATEGORIES` | ❌ | School organisers do enforce "2 yellows = miss next match" |
| Team leaderboards (most goals, fewest conceded, clean sheets) | Adv | ❌ | ❌ | |
| Assists / clean sheets / saves leaderboards | Core | Present as categories `standings.ts:376-391` | ✅ | Coverage flag via `trackedGames` ✅ |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Appearances (Apps), Starts, Sub apps | Core | "Matches" = number of stat lines (`stats.ts:32-61`); a line exists only if the player was credited something (`demoStore.ts:1466-1493`) | ❌ | A defender with no logged action "didn't play" |
| Minutes played | Core | ❌ | ❌ | Depends on FB-02 |
| W / D / L record | Core | Matches, Wins, Win rate only `SportProfileScreen.tsx:176-180`; `StatLine` has only `won` (`core/types.ts:324-344`) | ❌ | Draw shown as **LOST** pill `SportProfileScreen.tsx:293` |
| Goals, assists, penalties, free kicks, open play | Core | Raw totals grid `SportProfileScreen.tsx:199-219` | ✅ | Unordered raw-key grid, not a curated career layout |
| Goals per game / mins per goal / G+A | Core | ❌ | ❌ | |
| Shot conversion %, shots on target % | Core | ❌ (inputs exist) | ❌ | Use coverage-aware denominators (only lines that tracked shots) |
| Goalkeeper: saves, goals conceded, save %, clean sheets | Core | saves ✅, cleanSheets ⚠️ (wrong attribution), goals conceded ❌ | ⚠️ | Conceded per GK derivable from GK-on-pitch intervals |
| Cards (Y / R) | Core | Totals ✅ | ✅ | |
| Own goals, penalties won/missed | Core | penaltiesWon/Missed recorded (`index.tsx:189`), but no profile labels in `SportProfileScreen.tsx:25-40`; own goals ❌ | ⚠️ | |
| Bests: hat-tricks, most goals in a match, longest scoring run | Core | ❌ | ❌ | `cricketCareer.ts` HS/BBI pattern |
| Per-match line in history | Core | Raw `k v` join `SportProfileScreen.tsx:289` | ⚠️ | Want "2 G · 1 A · 78'" (like `cricketMatchLine`) |
| Season / tournament / team splits | Adv | Official/friendly scope only | ⚠️ | P2 |
| Position-aware career (GK vs outfield sections) | Core | ❌ | ❌ | Like cricket's batting/bowling/fielding sections |

## 5. Out of scope (needs tracking / extra spotters)

xG / xA, big chances; distance covered, sprints, heatmaps, average positions; full pass counts and pass maps, progressive passes, key passes as a complete set; touches, duels and aerials won (both players per contest); pressures; GK distribution accuracy; offside lines / VAR. Possession stays an optional estimate (time toggle), not a tracked figure.

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| FB-01 | **Appearances on completion**: every matchday-squad player who took the field (starters + subs who came on) gets a stat line with `apps:1`, `starts:0/1`; unused subs get none | P0 | M | Player, Team | None. Derived from lineup + `sub` events at completion via `statTotals` | No (stat_lines.stats is JSON) | **GEN-** (any team sport with a lineup) |
| FB-02 | **Minutes played**: derive per player from lineup, `sub` events, `red` events, halves played (+ET, +signalled added time optional); write `minutes` in `statTotals`; show in the box score and career | P0 | M | Match, Player, Tournament (Golden Boot tie-break) | None (pure derivation; old logs replay identically) | No | GEN- framework (time-on-court for basketball/kabaddi/hockey-style sports) |
| FB-03 | **Minute notation**: show `45+2'` / `90+4'` from (`half`, `minute`) in timeline, ticker, lineups and goal flash; sort timeline by (half, minute, id). Ordinal minute (+1) only behind a new `state.minuteOrdinal` flag set by new matches (old logs unchanged) | P0 | S | Match | Optional new init flag only | No | Football-only |
| FB-04 | **Clean sheets fixed**: compute in `statTotals` (not live dispatch): GK on the pitch for the most minutes when the opponent scored 0 (incl. ET; penalty shootout goals excluded) gets `cleanSheets`, defenders optionally `defCleanSheets` (≥60 min). Award on every completion path (incl. pens). Stop dispatching `CLEAN_SHEET` for new matches; ignore it in old logs once `statTotals` owns the key | P0 | M | Match, Player, Tournament | `CLEAN_SHEET` becomes ignored by sync (absolute totals override); no new types | No | No |
| FB-05 | **Blocked shots**: move "Blocked" out of the on-target branch; record `shot` with `blocked:true, onTarget:false`; add `blockedShots` team row and `blocks` player credit for the blocker (replacing the generic `defenceContribution`) | P0 | S | Match, Player | New payload key `blocked`; old logs keep `onTarget:true` (replay identical; document) | No | No |
| FB-06 | **Football `statTotals`** (absolute sync, parity #19 pattern): goals by type, assists, shots/SoT, saves, cards, minutes, apps, cleanSheets, goalsConceded (GK), ownGoals, penalties won/missed/scored, from state alone | P0 | M | Player, Tournament | Needs player ids on events: add `playerId`/`secondId` to goal/card/sub/owngoal payloads (new key, names kept for old logs; old logs resolve by name) | No | Uses the GEN framework |
| FB-07 | **W/D/L on player lines**: add `drawn` (or a `result: 'W'|'D'|'L'` field) set at completion; profile shows W-D-L and "DRAW" pill instead of LOST | P0 | S | Player | None | Probably (column `result` on stat_lines), or store `drawn:1` in stats JSON with no migration | **GEN-** (football, cricket ties, chess, hockey) |
| FB-08 | **Football career module** `footballCareer.ts` (copy `cricketCareer.ts`): Outfield section (Apps/Starts/Mins/G/A/G+A/G per 90/mins per goal/shots/SoT%/conversion%/pens), Goalkeeper section (Apps/CS/conceded/saves/save%/GA per 90), Discipline (Y/R), Bests (hat-tricks, most goals in a match); coverage-aware denominators; curated per-match history line | P0 | M | Player | None | No | Pattern **GEN-** (a shared "career sections" renderer; each sport supplies a pure career fn) |
| FB-09 | **Match box score**: per-team player table (No · Name · Min · G · A · Sh(OT) · YC/RC; GK row adds Saves/GA) on the Stats tab + HT score in the status/detail line; drop dead `PlayerStatLine.goals` | P1 | M | Match | None | No | GEN- candidate (shared box-score table component fed by `statTotals`) |
| FB-10 | **FIFA/UEFA tie-breakers**: add `h2hDiff`, `h2hFor` (mini-league goal difference / goals among the tied cluster), `fairPlay` (from cards in match state), explicit "lots" (flag as unresolved); default football order `h2h, h2hDiff, h2hFor, diff, for, fairPlay` with a FIFA-2022-style preset `diff, for, h2h…` | P1 | M | Tournament | None (reads states) | No | h2hDiff/h2hFor/fair-play are GEN-usable (hockey, handball, kabaddi) |
| FB-11 | **Golden Boot / Golden Glove**: leaderboard tie-break goals → assists → fewer minutes; Golden Glove = GK-only clean sheets → saves → fewer conceded; Golden Ball keeps MVP | P1 | S | Tournament | None | No | Tie-break chain per category is GEN- (`leadersByKey` comparator) |
| FB-12 | **Discipline table and suspensions**: player and team cards leaderboard; organiser rule "N yellows / 1 red = suspended next match" with a warning on the squad picker | P1 | M | Tournament, Team | None | Maybe (rule in `formats` JSON → no) | GEN- (cards exist in hockey, kabaddi, basketball fouls-out) |
| FB-13 | **Own goals credited**: attribute `ownGoals` to the player (shown under Discipline/misc, not goals) | P1 | S | Match, Player | Attribution on OWN_GOAL (side-channel only; reducer unchanged) | No | No |
| FB-14 | **Shootout takers**: optional taker (and keeper) per kick, outcome scored/saved/missed; FIFA-style shootout list; `shootoutGoals`/`shootoutSaves` kept separate from match goals | P1 | S | Match, Player | New optional payload keys `takerId`, `outcome` on `PEN` (old `scored` still read) | No | No |
| FB-15 | **Team records**: GD, clean sheets, failed to score, biggest win/defeat, unbeaten run, goals per game on the team page | P1 | S | Team | None | No | GEN- (records block driven by score; "clean sheet" = opponent scored 0 is football/hockey only) |
| FB-16 | **POTM count** on the career page and the Player of the Tournament candidate detail | P2 | S | Player, Tournament | None | No | GEN- |
| FB-17 | Live-settings parity: add crosses/dribbles/handball toggles to `TRACKABLE`, add `crosses`/`dribbles`/`offsides`/`handballs`/`penaltiesWon` to `trackedKeys`, add profile labels for penalties won/missed and handballs | P2 | S | Match, Player | None | No | No |
| FB-18 | Team average match stats (shots, possession, corners per game) and a form column in the league table | P2 | M | Team, Tournament | None | No | Form column GEN- |
| FB-19 | Futsal accumulated fouls per half (6th foul → 10 m kick) indicator for the futsal preset | P2 | S | Match | None (count of `foul` stats per half) | No | No |

**GEN- candidates (for PLAN.md):**
- **GEN-apps/minutes** (FB-01, FB-02): every lineup sport should write an appearance line at completion so "Matches" means matches played, not "matches with a logged stat". Time-on-field derivation from lineup + sub events is reusable by basketball, kabaddi and hockey.
- **GEN-draws** (FB-07): `StatLine.won` can't express a draw. Every sport with draws/ties shows them as LOST today (`SportProfileScreen.tsx:293`).
- **GEN-career framework** (FB-08): a shared career-sections renderer plus per-sport pure `xCareer(lines)` functions, generalising `cricketCareer.ts`. Today non-cricket sports get the raw key grid.
- **GEN-box score** (FB-09): a shared per-player match table fed by `plugin.statTotals`.
- **GEN-tie-breakers** (FB-10): head-to-head mini-league difference and goals-for, plus fair-play from cards; explicit "drawing of lots" instead of the silent alphabetical fallback.
- **GEN-leaderboard tie-break chains** (FB-11) and **GEN-discipline/suspensions** (FB-12).
- **GEN-statTotals adoption** (FB-06): sports relying on live increments drift after corrections. Football is the clearest case (clean sheets).
