# Tennis — depth audit

Standard sources: ITF Rules of Tennis (2025), incl. Appendix V alternative scoring (no-ad, short sets, match tiebreak); ITF Rule 14 (doubles order of service); ATP / WTA official match statistics (the Infosys ATP / WTA "Match Stats" panel); ATP / WTA player activity and career stats pages (W-L, titles, serve and return leaders); ATP Finals round-robin rules (ATP Rulebook, Nitto ATP Finals tie-breaking); Grand Slam rules (10-point match tiebreak at 6-6 in the final set, since 2022).

Summary: the **scoring system is international-grade**: 0/15/30/40, deuce/ad, no-ad, set tiebreak, 10-point match tiebreak, Fast4, pro set, and serve rotation including tiebreaks and doubles pairs (`src/sports/tennis/engine.ts`, `src/sports/serve.ts`). The **statistics are not**. A match captures points won per player, aces and double faults, nothing else. The box score shows only PTS and ACE (`tennis/BoxScore.tsx:40-41`). The double fault is recorded only on the profile and is invisible in the match. A tiebreak's score is dropped from the set score (`engine.ts:119`). A finished match's summary reads "0–0" in the result alert. Every Core ATP serve and return stat is missing: 1st serve %, 1st and 2nd serve points won, service games held, break points saved and converted, return points won, total points won. The good news is that **most of those can be derived from the existing log with no new capture**. Who served each point is a pure function of the state (`serve.ts:32`), so replaying the point log gives server + winner + score for every point. That is enough for serve and return points won, holds, breaks and break points. Only 1st serve % needs one new optional tap (a "Fault" button). The player profile is a generic Matches / Wins / Win rate plus raw counters, with no sets or games W-L, tiebreak record or titles. The biggest wins are **GEN-RS** (a shared rally-stats engine), **GEN-RC** (a racket career framework) and **TN-01..04** (double faults visible, one-tap ace/DF for the server, serve/return panel, tiebreak scoreline).

### Shared racket/net core (audited once; applies to badminton.md and tabletennis.md too)
- `rallyEngine.ts` (pure, table tennis / squash / pickleball). It handles only `POINT` (`rallyEngine.ts:71`). It ignores `EDIT_LOG` / `STAT_ADJUST`, so its sports have no surgical point editor. Each point event carries `kind:'point'`, `game`, `playerName` (`:93`). It doesn't carry the server, but the server is derivable.
- `rallyCore.tsx` builds the UI. Its only box score is `PointBoxScore` (one PTS column, `PointBoxScore.tsx:35`). It has no `Scoreboard`, so the plugin falls back to the generic board. `standingsPoints` exists only here (`rallyCore.tsx:152`), which is why only table tennis can use the rally-points tie-break.
- `rallyEdit.ts`: a point's `side` must be who won the rally (`:11-16`). Its `PointKind` = point | ace | block (`:23`). A double fault (`tennis/index.tsx:39-40`) is stored as a plain `POINT` for the receiver, with the DF only on `attribution2`. On an `EDIT_LOG` replay the DF is lost from the match (the event never carried it), and `reconcileStatActions` never adjusts `doubleFaults`, so deleting a DF point in the editor leaves the profile count wrong.
- `serve.ts`: the server is derived from games played. It is correct across tiebreaks (`:34-37`). The doubles slot rotates through roster order across the whole match (`:38-40`), so it can't represent a pair changing its serving order at a new set (ITF Rule 14).
- **Result summary bug (all three sports).** After the match ends, `summary().homeScore` is the current-game points: tennis `disp()` (`tennis/index.tsx:145`), badminton `current` (`badminton/index.tsx:233`), rally `current` (`rallyCore.tsx:157`), and all are reset to 0. The full-time follower alert is built from it (`useLiveMatch.ts:287-289`), and so are the ticker (`ticker.ts:92,101`), MiniScore and the CorrectMatch screen (`CorrectMatchScreen.tsx:72`). A finished 6-4 6-3 reads "0–0".
- **Player appearance depends on attribution.** A stat line is written only when a point is credited to a player (`useLiveMatch.ts:232-235`). `won` is then set only on existing rows (`repos.ts:2203-2206`). With the team "+1" fallback (no roster), or a doubles partner who was never credited, the player has no W-L for that match.

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Point / game / set / match scoring (0-15-30-40, deuce, ad) | Core | `engine.ts:81-135` | ✅ | |
| No-ad (deciding point) | Core | `noAd` (`engine.ts:123`) | ✅ | Receiver choosing the court isn't modelled (not a stat). |
| Set tiebreak (7 points, win by 2); advantage set option | Core | `engine.ts:73,114-121`; `setTiebreak` toggle | ✅ | |
| Deciding-set formats: 10-point match tiebreak / full set | Core | `finalSetTiebreak` (`engine.ts:71`), presets `gs5`, `match_tb` | ⚠️ | The Grand Slam rule is a 10-point tiebreak *at 6-6* in the final set. The `gs5` preset (`index.tsx:163`) plays the whole deciding set as a match tiebreak (champions' tiebreak), which is wrong for a Slam. A "final-set TB at 6-6 to 10" option is missing. |
| Fast4 / pro set / short sets | Core (alt. formats) | presets (`index.tsx:164-166`) | ✅ | |
| Serve tracking (who serves, tiebreak rotation) | Core | `serve.ts:32-42`; banner `index.tsx:64`; dot on the board `:118` | ✅ | Singles is exact. |
| Doubles serving order (can change each set; receiving order) | Core | Roster-order slot rotation (`serve.ts:38-40`) | ⚠️ | No "who serves first this set" choice and no receiving order. |
| Scoreline with tiebreak score, e.g. 7-6(4) | Core | `winSet` records games only (`engine.ts:119`); TB points live only in event labels (`:112`) | ❌ | Every published tennis result shows the tiebreak score. |
| Retired / walkover / default in the scoreline ("ret.", "w/o") | Core | Generic manual end (`repos.ts` endMatchManually) | ⚠️ | The winner is stored; there's no "ret." marker on the score line. |
| Result shown after the match | Core | `summary()` → "0–0" after the end (see the shared core above) | ❌ | Result alert, ticker and correction screen. |
| Aces | Core | ACE action + chips (`index.tsx:68-69`); voice (`voiceParsers.ts:53`); box-score ACE column | ⚠️ | Must pick side + player. Nothing checks that the ace went to the server, though the server is known (`serveInfo`). |
| Double faults | Core | `POINT` to the opponent + `attribution2` doubleFaults (`index.tsx:39-40`) | ⚠️ | Profile-only. The timeline shows a plain "Point" (`engine.ts:112`), there's no DF column in the box score, it's lost on an editor replay, and the profile label is the raw key "doubleFaults" (`SportProfileScreen.tsx:25-39` has no entry). |
| 1st serve in % | Core | — | ❌ | Needs a "Fault" tap on a missed 1st serve (practical: one tap, only on faults). |
| 1st serve points won % / 2nd serve points won % | Core | — | ❌ | Needs the 1st-serve flag plus a derived server (TN-05). |
| Service points won / return points won | Core | Derivable (server known per point) | ❌ | GEN-RS, no new capture. |
| Service games played / held (%) | Core | Derivable | ❌ | GEN-RS. |
| Break points saved / faced, converted / opportunities | Core | Derivable (receiver one point from the game, `pts` + `noAd`) | ❌ | GEN-RS. The headline credibility stat. |
| Total points won (and %) | Core | Points per player in the box score (`BoxScore.tsx:17-30`) | ⚠️ | No team total or %. In doubles it depends on who the scorer credited. |
| Winners / unforced errors / forced errors | Core (ATP) | — | ❌ | Practical only as an **optional** tag on the point (P2, GEN-PO). |
| Net points won / approached | Core (ATP) | — | ❌ | Optional tag (P2). |
| Max points in a row, games in a row | Adv | Derivable | ❌ | GEN-RS. |
| Per-set box score toggle | Core | `BoxScore.tsx:78-85` | ✅ | |
| Point-by-point timeline + surgical editor | Core | `LiveTimeline`, `RallyPointEditor` (`index.tsx:72-76`) | ✅ | Editor lacks a DF kind (see above). |
| Broadcast scoreboard (points + games per set, serve dot) | Core | `TennisScoreboard` (`index.tsx:106-131`) | ✅ | |
| Code violations / point penalty, time violations | Adv | — | ❌ | P2. |
| Match duration / set duration | Core (ATP) | — | ❌ | Event timestamps exist in `match_events.created_at`. Derivable (P2, GEN). |

## 2. Team level
(For tennis a "team" is a doubles pair, a school/house team, or a single-player entry.)

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Played / W / L, form (last 5) | Core | `teamStats.ts:49-66`, `TeamProfileScreen` | ✅ | |
| Head-to-head per opponent | Core | `teamStats.ts:63-66` | ✅ | for/against = sets (no unit label: `teamStats.ts:25` has no tennis). |
| Sets W-L, games W-L (and %) | Core | Only sets via `m.score`, shown as an unlabelled "Scored/Conceded" (`TeamProfileScreen.tsx:199-201`) | ⚠️ | Games aren't aggregated anywhere. |
| Tiebreak record, deciding-set record | Core (ATP) | — | ❌ | |
| Doubles pair record (same two players across teams) | Core | Only if the pair is the same team row | ⚠️ | No pair identity across events. |
| Team ties (Davis Cup / BJK Cup: singles + doubles rubbers) | Core | `series.ts` "rubbers" in knockouts (`series.ts:11-12`) | ⚠️ | Group tables count each rubber as a match (`standings.ts` has no series awareness). GEN-TIE. |
| Top performers | Core | `SPORT_AWARDS.tennis` points + aces (`ratings.ts:90`) | ⚠️ | "Top scorer by points" is meaningless in singles (it just tracks match length). Should be wins / aces / holds %. |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Knockout draw / brackets, seeding, byes | Core | Generic bracket (`data/bracket.ts`) | ✅ | |
| Round robin standings (W-L) | Core | `teamStandings` 2-0 (`standings.ts:99-101`) | ✅ | |
| ATP Finals tie-breaks: wins → matches played → H2H (2 tied) → % sets won → % games won (3 tied) | Core | `h2h, diff, for` (`standings.ts:100,114`); diff/for = sets | ⚠️ | Missing "matches played", sets % and games %. Games aren't available to standings (no tennis `standingsPoints`). |
| Leaderboards | Core | `STAT_CATEGORIES.tennis` = points, aces (`standings.ts:405-408`) | ⚠️ | Missing wins, aces/match, DF, service games held %, BP converted %. |
| Awards (player of the tournament) | Core | `ratings.ts:25` weights points 1, aces 2 | ⚠️ | DF isn't penalised and winning isn't weighted. |
| Champion / runner-up record per event | Core | `bracketChampion` (`bracket.ts:171`) | ⚠️ | Computed for the bracket, but never written to a player as a "title". |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches, W-L, win % | Core | `SportProfileScreen.tsx:177-179` | ⚠️ | Depends on the player having an attributed stat line (see the shared core above). |
| Singles vs doubles split | Core | — | ❌ | `playersPerSide` is in the match format; not split on the profile. |
| Sets won-lost, games won-lost (%) | Core | — | ❌ | GEN-RC: write match-level keys at completion. |
| Tiebreaks W-L, deciding-set W-L, straight-set wins, comebacks from a set down | Core (ATP) | — | ❌ | |
| Aces, double faults (total and per match) | Core | Totals as raw counters (`SportProfileScreen.tsx:203-218`) | ⚠️ | No per-match rate; "doubleFaults" shows unlabelled. |
| 1st serve %, 1st/2nd serve points won %, service games won %, BP saved % | Core (ATP serve leaders) | — | ❌ | After GEN-RS / TN-05. |
| Return points won %, return games won %, BP converted % | Core (ATP return leaders) | — | ❌ | GEN-RS. |
| Titles / finals | Core | — | ❌ | From the bracket champion. |
| Match history with the scoreline (6-4 3-6 7-6(5)) | Core | History rows list the counters only (`SportProfileScreen.tsx:289`) | ⚠️ | No score, no round. |
| Head-to-head vs a specific opponent | Core | — (team H2H only) | ❌ | GEN-H2H. |
| Surface / ranking points | Adv | — | Out of scope | School context; no surface field. |

## 5. Out of scope (needs tracking / extra spotters)
- Serve speed (fastest, average 1st/2nd serve), serve placement (wide/body/T), return depth, shot placement maps.
- Rally length (stroke counts per point). A single scorer can't count reliably; Hawk-Eye data in pro tennis.
- Distance run, spin rates, Hawk-Eye challenges.
- Full forehand/backhand winner-error split per stroke type (that needs a dedicated statistician; the optional winner/UE tag in TN-09 is the practical subset).

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| TN-00 | **Result after the match** (GEN-RES): once `s.ended`, `summary()` gives the sets won as the score and the set scores as the detail, so the result alert, ticker and MiniScore stop showing "0–0" | P0 | S | Match | None | No | **GEN-RES** (all racket sports) |
| TN-01 | **Double fault becomes a first-class point kind.** The reducer marks a `POINT` carrying `attribution2.stat==='doubleFaults'` (or a persisted `_attr2`) as `kind:'df'` with the server's name. It gets the label "Double fault" in the timeline, a DF column in the box score, and `df` in `PointKind`/`rallyEdit` (it replays as `POINT` + attribution2, and `reconcileStatActions` covers `doubleFaults`). Add "Double faults" labels in `SportProfileScreen` LABELS, `stats.ts` STAT_LABEL and `ratings.ts` (weight −1). | P0 | S | Match, Player | No new action. The existing DF `POINT`s are re-labelled on replay; the score is identical. Add a replay test. | No | Partly (rallyEdit kind) |
| TN-02 | **One-tap Ace / Double fault for the current server.** `serveInfo` already knows the side and the slot, so replace the 4 side×player chip rows (`index.tsx:68-71`) with two buttons "🎯 Ace" and "⚠️ Double fault" that credit the server. Reject an ACE for the receiver. | P0 | S | Match | Same actions (ACE / POINT + attribution2); just fewer taps | No | Pattern reused by BD/TT/PD |
| TN-03 | **Serve & return match-stats panel (ATP style)** from GEN-RS: service points won, return points won, total points won %, service games held, breaks, break points saved/faced and converted/opportunities, max points in a row. Shown per side and per set. | P0 | M | Match | None (derived by replaying the point log through the reducer) | No | **GEN-RS** |
| TN-04 | **Tiebreak score in the scoreline.** Keep `tb: Array<[h,a] \| null>` per set in state (set in `winSet` when the set ended in a tiebreak) and render 7-6(4) on the board, summary, result and history. | P0 | S | Match, Team, Player | None (state rebuilt on replay) | No | No |
| TN-05 | **1st-serve tracking ("Fault" button).** Tap Fault on a missed 1st serve, which puts the point on 2nd serve. A 2nd Fault is the DF (TN-01). This yields 1st serve in %, 1st serve points won %, 2nd serve points won %. Scorer setting "Track 1st serves" goes into `tracked[]`, so profiles show coverage. | P1 | M | Match, Player | New action `FAULT` (no score effect; old logs never contain it, so the stats show "not tracked") | No | GEN-RS input (padel uses it too) |
| TN-06 | **Tennis career block on SportProfile** (via GEN-RC): W-L (singles / doubles), sets and games W-L %, tiebreaks W-L, deciding sets W-L, aces & DF per match, service games held %, BP saved %, BP converted %, titles/finals, match history with the scoreline. | P1 | M | Player | None. Match-level keys are written to the stat line at completion. | No (stats jsonb) | **GEN-RC** |
| TN-07 | **Round-robin tie-breaks per ATP Finals / ITF.** New tie-breakers `played`, `setsPct`, `gamesPct`, plus a tennis `standingsPoints` returning games won. Default order: wins → H2H (2 tied) → sets % → games % → H2H. | P1 | S | Tournament | None | No | **GEN-TB** |
| TN-08 | **Grand Slam deciding set**: a final-set 10-point tiebreak *at 6-6* (distinct from the champions' tiebreak). Fix the `gs5` preset. | P1 | S | Match | New format value only (`finalSetTBAt`); old configs keep their meaning | No | No |
| TN-09 | **Doubles serving order per set** (ITF Rule 14): a "who serves first for this pair" chip at each set start, used by `serveInfo`. | P1 | S | Match | New `SET_SERVER_ORDER` payload, valid only at a set start; absent = the current roster rotation | No | Padel too |
| TN-10 | Tennis leaderboards and awards: Wins, Aces, Service games held %, BP converted %, Titles. Replace "Top scorer (points)" in `SPORT_AWARDS.tennis` and `STAT_CATEGORIES.tennis`. | P1 | S | Tournament | None | No | GEN (racket leaderboards) |
| TN-11 | Retired / walkover / default markers in the scoreline ("6-4 2-1 ret.") on the board, history and result. | P1 | S | Match, Player | Reads the existing manual-end result | No | GEN |
| TN-12 | **Optional point-outcome tag**: winner / unforced error / forced error, plus "at net", tagged to a player. An off-by-default "detailed stats" mode. | P2 | M | Match, Player | Optional payload `outcome` on POINT / ACE; absent on old logs | No | **GEN-PO** |
| TN-13 | Code / time violations (warning → point penalty → game penalty) | P2 | S | Match | New action `PENALTY` (awards a point/game) | No | No |
| TN-14 | Match / set duration from event timestamps | P2 | S | Match, Player | None | No | GEN |

GEN candidates raised here: **GEN-RS** (rally-stats engine), **GEN-RC** (racket career), **GEN-RES** (summary after the end shows sets/games, not 0–0), **GEN-TB** (sets % / games % / points-diff / played tie-breakers), **GEN-TIE** (team ties as one fixture in group tables), **GEN-PO** (optional point-outcome tag), **GEN-H2H** (player-vs-player H2H), **GEN-APP** (appearance stat lines from lineups at completion, so W-L doesn't depend on attribution).
