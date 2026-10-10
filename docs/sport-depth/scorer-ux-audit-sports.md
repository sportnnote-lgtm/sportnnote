# Scorer UX audit: per sport

From the SD-109 audit (2026-10-11), read-only. Cricket is in `scorer-ux-audit-cricket.md`; athletics and swimming in `scorer-ux-audit-events.md`; the shared screen in `scorer-ux-audit.md`. End / Restart / Reset / Delete are covered by SD-106; racket point detail by SD-107.

# Racket sports

I audited live scoring for the six racket sports without editing any files. I left out SD-106 and SD-107 (the founder asks in progress) and SD-61 (two big "Rally won" buttons for badminton doubles, already queued). For other items the backlog already covers I give the backlog ID and say "promote" or "extend" instead of proposing them again. Cat = 1 accidental-action risk, 2 scorer detail, 3 flow friction, 4 rule coverage. Unless a row says otherwise, paths are under `src/`. I checked every file:line cited.

## All racket sports (shared: rallyCore, RallyPointEditor, serve, LiveScoringScreen)
| Cat | Pri | Finding | file:line | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | **P0** | The point buttons are small grey pills when players are listed (tennis, badminton, padel, and table tennis / squash / pickleball under rally scoring). Home and away look the same, they sit one above the other, and only a text label above each row says which side it is. This is the main wrong-side risk. | sports/rallyCore.tsx:176-194; tennis/index.tsx:26-35,79-80; badminton/index.tsx:24-35,63-64; padel/index.tsx:33-43,77-78 | Two large side-by-side buttons in team colours, about 64pt tall with a gap between them. Singles credits the only player automatically. Doubles uses the side buttons, with player credit optional (long-press). This extends SD-61 from badminton to every racket sport. | M |
| 1 | **P0** | The match-winning point completes the match straight away. It pushes "Full time" to followers and writes the result back. Undo can roll the score back, but the notification has already gone out. | data/useLiveMatch.ts:292-297; screens/LiveScoringScreen.tsx:371 | On a match point, show a "Confirm: X wins 6-4 7-5?" sheet, or hold the result push and write-back for about 10 seconds so it can be undone. | S |
| 1 | P1 | The timeline editor's ✕ deletes a point with one tap and no confirmation. ✕, ✎ and ＋ are tiny text targets (4px padding) right next to each other. | sports/RallyPointEditor.tsx:110,217-219,243-245 | Ask before removing a point; make each target at least 44pt and space them out. | S |
| 1 | P1 | The Undo bar says only "Undo last update", so a scorer undoes without knowing what goes. It sits between the scoreboard and the point buttons. | screens/LiveScoringScreen.tsx:874-879,2136 | Name the event: "↶ Undo: point to Federer (30-15)". | S |
| 1 | P1 | "Who serves first?" already shows Home as selected, so a scorer who never taps it gets a silent default. The choice locks after the first point, and the hold/break and serve stats are then wrong for the whole match. | rallyCore.tsx:120; tennis/index.tsx:69; badminton/index.tsx:56; padel/index.tsx:65 | Start with nothing selected and keep the point buttons disabled until a server is picked. | S |
| 3 | P1 | There is no way to fix who served first, or the doubles serving order, after the first point. Serve is only derived, so changing it would not change the score. | tennis/engine.ts:185-187; badminton/engine.ts:89-93; rallyEngine.ts:112; serve.ts:74-75 | Allow a "Fix server" correction mid-match and re-derive the serve stats. | S |
| 3 | P1 | Nothing marks game, set, match or break point, so the scorer does not know the next tap ends a game or the match. | sports/SetLineBoard.tsx:37 (status) | Add a status chip: "SET POINT Nadal", "MATCH POINT", "BREAK POINT". | S |
| 3 | P1 | No haptic or toast after a point tap, so a wrong-side tap goes unnoticed. The screen also goes to sleep during long rallies (no keep-awake anywhere in `src`). | screens/LiveScoringScreen.tsx:1229 | Use expo-haptics plus a short "Point → Away · 30-15" toast, and expo-keep-awake while scoring. | S |
| 3 | P2 | The add/invite-player panel and the correction bars render between the scoreboard and the point buttons, pushing the buttons down mid-match. | screens/LiveScoringScreen.tsx:2136-2149 | Put the point controls directly under the board and fold the rest into Quick options. | S |
| 3 | P2 | "Insert a missed point" always starts with Home as the side. | sports/RallyPointEditor.tsx:139 | Start with no side selected and require a choice. | S |

## Tennis
| Cat | Pri | Finding | file:line | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | **P0** | With no player list, the two point buttons are identical uncoloured outline buttons stacked vertically. | tennis/index.tsx:32,79-80 | Use the team-coloured side-by-side buttons (shared row 1). | S |
| 1 | P1 | "🎯 Ace" is the only solid, team-coloured button on screen, so it draws taps meant as a normal point to the server and inflates aces. | tennis/index.tsx:82 | Make Ace and Double fault secondary (outline, smaller) and below the point buttons. | S |
| 2 | P2 | Hawk-Eye challenges (left per set, upheld or overturned) are not recorded. Practical for one scorer. | — | Optional CHALLENGE timeline event per side. | S |
| 2 | P2 | Lets on serve and medical / toilet timeouts are not recorded. Practical for one scorer. | — | Timeline markers with no score effect (sits alongside SD-54). | S |
| 2 | P2 | Rally length and net approaches won are not tracked. Needs a second spotter. | — | Leave to an optional detail mode. | M |
| 3 | P1 | No "change ends" prompt after odd games or every 6 points in a tiebreak, and no 90s/120s changeover cue. | tennis/engine.ts:156-163 | Derived "Change ends" banner and timeline marker. | S |
| 3 | P2 | No in-controls banner says a tiebreak has started or what it is played to. Padel has one; tennis does not. The status shows only "Tiebreak" even for the 10-point Slam decider. | tennis/index.tsx:74; padel/index.tsx:75 | "Tiebreak to 7 (10 in the decider) · X serves 1 point". | S |
| 3 | P2 | The timeline says "Game home" / "Game away" instead of the team or player name, and does not say Hold or Break. | tennis/engine.ts:157 | Extend SD-75 (padel labels) to tennis. | S |
| 4 | P1 | **Fast4 tiebreak is wrong.** ITF Fast4 plays to 5 with sudden death at 4-4; the engine always requires win by 2. | tennis/engine.ts:147; preset :175 | Add a `tbSuddenDeathAt` setting (4 for Fast4). | S |
| 4 | P2 | No ITF doubles preset (2 no-ad sets plus a 10-point match tiebreak). It is only reachable through Custom. | tennis/index.tsx:169-178 | Add a "Doubles (no-ad + MTB10)" preset. | S |

## Badminton
| Cat | Pri | Finding | file:line | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | **P0** | Singles uses the same grey player pills for the point buttons (SD-61 only fixes doubles). | badminton/index.tsx:24-35,63-64 | Covered by shared row 1 (auto-credit the singles player). | S |
| 2 | P2 | Lets, rally length and shuttle changes are not recorded. Lets are practical; rally length needs a second spotter. | — | Optional timeline markers. | S |
| 3 | P1 | No interval cue at 11, no 2-minute break between games, and no change of ends at 11 in the decider. | badminton/engine.ts:105-115 | Promote BD-10 (parked P2) to P1: derived banners and timeline markers. | S |
| 3 | P2 | In doubles the serve banner gives the court ("right court") but only the side's name, so it reads like a player cue it isn't. | badminton/index.tsx:47,61 | Until SD-74 lands, say "Home serves · right court". | S |
| 4 | — | Doubles server/receiver (SD-74), misconduct (SD-53) and the timeline outcome tag (SD-52) are queued, and I found no other BWF Laws gap. | — | — | — |

## Table tennis
| Cat | Pri | Finding | file:line | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | **P0** | Under rally scoring with a player list, the point buttons are grey pills stacked one above the other. | rallyCore.tsx:176-194 | Shared row 1. | S |
| 2 | P2 | Edge and net-cord points are not tagged. They are TT-specific, neither a winner nor an error, and practical for one scorer. | — | Optional "Edge/Net" tag, or add it to SD-107's TT list. | S |
| 2 | P2 | Lets (re-serves) and rally length are not recorded. Lets are practical; rally length needs a second spotter. | — | Optional marker / count. | S |
| 3 | P2 | "Serves first" is asked twice: in the format setup and on the scoring screen, both defaulting to Home. | tabletennis/index.tsx:25,38-45 | Drop the format field and keep only the screen picker, with no default. | S |
| 3 | P2 | Nothing tells the scorer when service changes (2 each, 1 each from 10-10). The banner only names the next server. | rallyCore.tsx:169-171,191 | Add a "2nd serve of 2" hint and flag the switch at deuce. | S |
| 4 | P2 | Expedite rule (Law 2.15) is not implemented. It is parked as TT-09, not done. | rallyCore.tsx:169-171 | Promote TT-09: an EXPEDITE toggle, then serve alternates every point. | S |
| 4 | — | Doubles order, change-ends cue (SD-62), timeouts (SD-54) and cards (SD-53) are queued. | — | — | — |

## Squash
| Cat | Pri | Finding | file:line | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | **P0** | PAR (default) uses grey player-pill point buttons; English scoring uses big "Rally won" buttons. The same sport has two different layouts. | rallyCore.tsx:156-159 vs 176-194 | Shared row 1: one layout for both scoring systems. | S |
| 2 | P2 | PSA video review (1 per player per game; upheld or not) is not recorded. Practical for one scorer. | — | Optional REVIEW marker; pair it with SD-63 decisions. | S |
| 2 | P2 | Injury breaks are not recorded (self-inflicted, contributed, opponent-inflicted, with their time limits). Practical for one scorer. | — | Timeline marker with a category; outcomes go through SD-53 AWARD_GAME. | S |
| 2 | P2 | Rally length and tin errors per player are not tracked. Rally length needs a second spotter; tin errors fit SD-107. | — | — | — |
| 3 | P2 | The screen does not show which service box (right or left) the server should use. | rallyCore.tsx:148-150,191 | "Serve from the right box": choose at each hand-in, then alternate. | S |
| 3 | P2 | No 90-second between-games cue and no warm-up timer. | — | Derived banner after a game ends. | S |
| 4 | P2 | English scoring: at 8-all the receiver should choose to play to 9 or 10. Parked as SQ-07, still open. | rallyEngine.ts:144 | Promote SQ-07: SET_GAME_TARGET, allowed only at 8-8. | S |
| 4 | — | Let / Stroke / No let (SD-63) and conduct (SD-53) are queued. | — | — | — |

## Padel
| Cat | Pri | Finding | file:line | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | **P0** | Doubles is the default, so every point means choosing one of 4 grey pills. With no player list, the buttons are uncoloured outlines. | padel/index.tsx:33-43,77-78 | Shared row 1 (side buttons, player credit optional). | S |
| 2 | P1 | No one-tap Ace or Double fault for the current server, unlike tennis (SD-104). Practical for one scorer. | padel/index.tsx:77-84 | Reuse the tennis server-only Ace / Double fault, unless SD-107 already adds it. | S |
| 2 | P2 | First-serve % is not tracked. Practical for one scorer. | — | Extend SD-60 (tennis Fault button) to padel. | S |
| 3 | P1 | No "change ends" cue after odd games or every 6 points in a tiebreak. | padel/engine.ts:124 | Use the same derived banner as tennis. | S |
| 3 | P2 | At golden point there is no prompt for the receiving pair to choose which player receives. | padel/index.tsx:76 | Add "Receiving pair chooses the receiver" to the golden-point banner. | S |
| 4 | P2 | Time and code violations: SD-53's scope leaves out padel. | — | Extend SD-53 to padel (FIP warning, then point). | S |
| 4 | — | Star Point (SD-64) and timeline labels (SD-75) are queued. | — | — | — |

## Pickleball
| Cat | Pri | Finding | file:line | Proposed fix | Size |
|---|---|---|---|---|---|
| 1 | **P0** | Rally scoring (the rec default) uses grey player pills for points; side-out scoring uses big buttons. | rallyCore.tsx:176-194 | Shared row 1. | S |
| 1 | P1 | "Who starts on the right?" can only be fixed at 0-0. A wrong pick found later means undoing back to 0-0 and re-entering every rally (the scoring guide, `website/guides/score-pickleball.md`, line 75, tells users to do this). | rallyEngine.ts:102 | Allow SET_START_RIGHT at any point in the game. Server identity is only derived, so the score is unaffected. | S |
| 2 | P2 | Medical timeouts and technical warnings / fouls are not recorded. SD-53 leaves out pickleball. Practical for one scorer. | — | Extend SD-53 to pickleball (USA Pickleball technical warnings and fouls). | S |
| 2 | P2 | Third-shot drop success and rally length are not tracked. Needs a second spotter. | — | Leave to an optional detail mode. | M |
| 3 | P2 | The score call ("4-2-1") shows only in side-out scoring. Rally scoring has no spoken-call format. | rallyEngine.ts:262 | Show "Serving 4-2" in rally scoring too. | S |
| 4 | P1 | The "MLP (rally · 1 game to 21)" preset is named after MLP but plays without MLP's freeze at 20, so results at 20+ differ from real MLP play. | pickleball/index.tsx:43-45 | Promote PB-09 (freeze), or rename the preset "Rally to 21" until it ships. | S |
| 4 | — | Timeouts and switch-ends (SD-54), serves-first and the game-2 first-server check (SD-65), and kitchen / fault reasons (SD-52 / SD-107) are queued. | — | — | — |

# Football, hockey, basketball

All paths are relative to `/Users/macbookpro/Desktop/rudy/sportfolio/`. FB = `src/sports/football/index.tsx`, HK = `src/sports/hockey/index.tsx`, BB = `src/sports/basketball/index.tsx`. The global Undo bar (LiveScoringScreen.tsx:874) exists for all three sports, so "no undo" findings only cover cases it doesn't fix. I left out the SD-106 items (End match / Restart / Reset / Delete) and anything already in the backlog (FB-12/13/14/17/19, BK-10/11/12/13, SD-50/56/57/70/80). The doc "out of scope" lists already park xG, big chances, shot charts and exact basketball seconds.

**Two real bugs to fix first:**
1. **Football goals counted twice:** Shot → On target → Goal → type → body adds the goal twice.
2. **Football goals lost on Cancel:** Cancel on the assist screen drops the goal entirely.

## Football

**1. Accidental-action risk**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| F1 | **P0** | **Bug: double goal.** In Shot → On target → ⚽ Goal → type → body, the body step calls `recordGoal` and then opens the assist step without `logged:true`. `finish()` then records the goal a second time (+2 on the score and on the player). | FB:829, 711, 723 | Set `logged: true` in the body step's `setFlow`, or have it go straight to assist without recording. | S |
| F2 | P1 | On the button path the goal is only recorded when the scorer picks an assister or taps "No assist". The header Cancel discards it silently, and the hint "Assist? (optional)" invites skipping. | FB:685, 663, 737-740 | Record the goal on the scorer tap (`logged:true`) and attach the assist later. Cancel then just closes. | S |
| F3 | P1 | Timeline ✕ is a small Text with no confirm, right next to ✎ Edit. Edit removes the event first, so cancelling the re-entry deletes it. | FB:988-989, 341-350, 171-173 | Confirm on ✕, make the targets ≥44pt, and on Edit cancel restore the event (or remove it only on commit). | S |
| F4 | P1 | Removing or editing a yellow that triggered the auto second-yellow red leaves the RED in place. Re-entering it as yellow adds another red. | FB:196-203, 316-331 | When removing a yellow, also remove the paired `secondYellow` red, and offer to restore it. | S |
| F5 | P1 | Backfill mode is sticky. Its banner only shows in the Backfill section far down the panel, so live taps get stamped at the past minute if the scorer forgets "Back to live". | FB:938-966, 160-167 | Pin a "⏪ Backfilling at 12' — Back to live" bar at the top of the controls. | S |
| F6 | P2 | "⏸️ Stoppage / injury" logs a public timeline row in one tap, with the side taken from possession. | FB:899 | Ask for the reason/side, or show a toast with undo. | S |
| F7 | P2 | Once added time is set, the +1…+8 chips disappear, so the scorer can't change it if the 4th official adds more. | FB:1004-1020 | Add a "Change" link that shows the chips again (`SET_STOPPAGE` already overwrites). | S |

**2. Scorer-detail gaps**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| F8 | P2 | Shots have no inside/outside-box tag (practical, one person can do it). | FB:847-856 | Optional "In box / Outside" chip on the shot step. | S |
| F9 | P2 | Cards have no reason (dissent, DOGSO, SPA…). Practical, and useful for discipline reports. | FB:866-873 | Optional reason chips after the colour. | S |

**3. Flow friction**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| F10 | P1 | A foul has to name the victim (no skip), and then there's no card follow-up. Foul plus card takes about 8 taps. | FB:764-766, 360-367 | Add "Skip victim", and after a foul show "🟨 / 🟥 for {fouler}?" chips. | S |
| F11 | P2 | A shot takes 5 taps (Shot → team → player → on target → outcome). Offside also forces a player pick with no skip. | FB:798-821, 234 | Per-side Shot buttons like Goal. Make the offside player optional. | S |

**4. Rule coverage (IFAB, not in backlog)**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| F12 | P1 | The penalty shootout always starts with home (no toss for who kicks first, Law 10). Hockey already asks. | FB:1091 | Add a "Who kicks first?" step to `START_SHOOTOUT`. | S |
| F13 | P1 | Team officials can't be carded (Law 12). The card flow only offers on-field players. | FB:812-821 | Add a "Team official" option to the card player step. | S |
| F14 | P2 | Fixed subs ignore the substitution windows (3 + half-time) and the permanent concussion substitutes. | FB:569-598 | Count sub windows. Add a "Concussion sub" toggle that doesn't use up a sub. | M |
| F15 | P2 | The futsal preset uses a running clock with no timeouts (futsal uses a stopped clock and 1 timeout per half). FB-19 only covers fouls. | FB:1256 | Futsal: stoppable clock (reuse the hockey CLOCK) plus timeouts. | M |

## Hockey (FIH)

**1. Accidental-action risk**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| H1 | P1 | "🏁 Full time" is enabled in the last period before it has started (`disabled={!periodStarted && !last}`). In a 2-half match it's live during half-time, next to Set clock, and credits a full unplayed half. | HK:427-428 | Disable it until the last period has started. | S |
| H2 | P1 | Timeline ✕ is a small Text with no confirm. Edit removes the event before re-entry, so Cancel deletes it. | HK:476, 192-203, 93 | Confirm, bigger targets, restore the event on cancel. | S |
| H3 | P2 | 🚩 PC logs and stops the clock in one tap, right under 🏑 Goal, with no side confirmation. | HK:401 | Short toast with undo, or a confirm in the PC panel. | S |
| H4 | P2 | Cancel and "🧤 Set keeper ›" are small Text links. | HK:296, 407 | Make them buttons ≥44pt. | S |
| H5 | P2 | After a goal or PC the clock auto-stops, and the only cue to restart is the button label. A forgotten Resume drifts the clock and the suspension timers. | HK:424 | Banner: "Clock stopped (goal) — ▶ Resume at the centre pass". | S |

**2. Scorer-detail gaps**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| H6 | P1 | PC outcome is just goal / shot / "No goal". Shots from the PC panel aren't linked to the PC, and there's no "stroke awarded" or "PC re-awarded". | HK:441-449 | PC outcome chips (goal / saved / wide / defended / stroke / re-awarded) with `ref` = PC id. Practical. | M |
| H7 | P1 | Circle entries aren't tracked (a core FIH stat). | HK:394-412 | One-tap "⭕ Circle entry" per side. Practical. | S |
| H8 | P2 | "Off target / blocked" are lumped together. Shoot-out misses don't credit a keeper save, and there's no keeper per attempt. | HK:328, 257-259 | Split "Blocked". Credit the save from `currentKeeper` on a shoot-out miss. Practical. | S |

**3. Flow friction**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| H9 | P2 | A goal takes 4 taps (Goal → type → scorer → assist), and the type step is forced even though most goals are field goals. | HK:301-322 | Start at the scorer, with field goal preselected and PC/Stroke chips on the same panel. | S |
| H10 | P2 | There's no interval timer for the quarter or half-time breaks, and no "time up" prompt unless the clock is running. | HK:438 | Break countdown after END_PERIOD, then a "Start Q2" nudge. | S |

**4. Rule coverage (FIH, not in backlog)**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| H11 | P2 | No prompt to escalate repeat cards (2nd green → yellow, 2nd yellow → longer/red). | HK:353-371 | Warn when that player already has a card of that colour. | S |
| H12 | P2 | Video referrals aren't tracked (FIH tournaments: one per team, kept if successful). | HK:394-412 | "📺 Referral" per side with upheld/lost. Timeline only. | S |

## Basketball

**1. Accidental-action risk**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| B1 | P1 | The selected scorer stays selected after a basket, so the next +2/+3 goes to the previous player if the scorer doesn't re-pick. With nobody selected it silently logs a team basket. | BB:93-100, 398-417 | Clear `sel` after each make, or show "+2 for {name}" on the button. | S |
| B2 | P1 | "🟥 Eject {player}" is a danger button directly under the foul-type chips, acts in one tap, and has no confirm. | BB:255-256 | Confirm sheet, and move it away from the chips. | S |
| B3 | P1 | Assist, steal, block and turnover log in one tap on a name, across about 12 stacked rows of identical chips. A wrong-row tap logs the wrong stat. | BB:458-469 | Pick the player first, then the action, or show a toast with undo per tap. | M |
| B4 | P1 | Timeline ✕ has no confirm. Edit removes the play first, so Cancel deletes it. Backfill mode is sticky, and its banner is far below the controls. | BB:546, 121, 364, 510-529 | Confirm, restore on cancel, and pin a backfill banner at the top. | S |
| B5 | P2 | "End Qn →" and Timeout act in one tap. | BB:555, 473-474 | Light confirm or toast with undo. | S |

**2. Scorer-detail gaps**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| B6 | P1 | The assist isn't attached to the make. It's a separate row. | BB:93-100, 460-461 | After +2/+3, show "Assist?" chips for the on-court teammates, plus Skip. Practical. | S |
| B7 | P2 | A steal doesn't log the opponent's turnover, an offensive foul isn't counted as a turnover, a block isn't linked to a miss, and there's no team rebound. | BB:462-467, 250 | Paired auto-events and a "Team" rebounder chip. Practical. | S |

**3. Flow friction**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| B8 | P1 | A personal foul while the other side is in the bonus doesn't open free throws (only shooting/technical/flagrant do). | BB:145-149 | If `inBonus(opp)` and the foul isn't offensive, open the FT flow with 2 shots. | S |
| B9 | P1 | Every row shows the full roster even when the on-court five is tracked, which makes for a very long scroll. | BB:402-408, 458-469 | Filter to `onCourtNames` when it's set. | S |
| B10 | P1 | And-one is hard-coded to +2, so a 3+1 needs a workaround. | BB:428-429 | And-one +2 and +3 options. | S |
| B11 | P2 | The FT count isn't prefilled (technical 1, unsportsmanlike 2, shooting 2/3). A fouled-out player stays in the five with no sub prompt. The minute cap is silent, with no "Q time up" nudge. | BB:147-148, 323, engine.ts:147-153 | Prefill the count. Show a "Sub required" banner. Show a time-up nudge. | S |

**4. Rule coverage (FIBA, not in backlog)**
| # | P | Finding | file:line | Fix | Size |
|---|---|---|---|---|---|
| B12 | P1 | Foul types use NBA "Flagrant". FIBA Unsportsmanlike (U) and Disqualifying (D) fouls are missing, and there's no auto-ejection on 2U, 2T or T+U. | events.ts:20, BB:250, engine.ts:231-234 | Add U/D types. Auto-EJECT on those combinations. | M |
| B13 | P2 | Coach and bench technicals (C/B) aren't supported, and there's no coach disqualification on 2C or 3 B/C. | BB:232-261 | Add a "Coach/Bench" fouler option. | M |
| B14 | P2 | No alternating-possession arrow. | — | One-tap arrow toggle shown on the board. | S |
| B15 | P2 | 3×3 is incomplete: no 10-minute limit win, no "first to 2" overtime (`overtimeMinutes: 0`), and team-foul penalties (7th–9th / 10th+) aren't modelled. | BB:681 (3x3 preset) | 3×3 rules branch. | M |

# Volleyball, kabaddi, carrom, chess, golf

## Live-scoring UX audit: volleyball, kabaddi, carrom, chess, golf (read-only)

The biggest problem applies to several sports. The tap that decides a match completes it immediately. `useLiveMatch.ts:292` sends the "Full time" push to followers. `LiveScoringScreen.tsx:1167` then swaps the controls for "Match complete", so the in-match Undo no longer applies. This matters most for chess and golf concede (below). The in-panel End Match buttons are left out because SD-106 covers them.

Legend: Practical = one phone scorer can capture it. Spotter = needs a 2nd spotter.

### Volleyball

**(1) Accidental-action risk**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | A player chip scores the point the moment it is tapped. The list is the whole squad (12+ chips), not the six on court. Home and away panels are stacked with identical chips, so a wrong-side or wrong-player tap is easy. | `src/sports/volleyball/index.tsx:50`, `:87-88` | Show the court six first and fold the bench away. Tint each side's chips in its team colour. | S |
| P1 | ✕ Remove in "Correct the timeline" has no confirm. It is a tiny text button (4px padding) right next to ✎ and ＋. | `src/sports/RallyPointEditor.tsx:217-219`, `:258` | Give it a 44px target and an inline "Remove? Yes/No". | S |
| P2 | The set- or match-winning point closes the set or match with no "set point / match point" cue. | `src/sports/volleyball/engine.ts:182-190` | Add a "SET POINT / MATCH POINT — {team}" banner above the panels. | S |

**(2) Scorer-detail gaps**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | "Opp. error" credits nobody. There is no optional error type (net touch, foot fault, rotation, double/4 hits, attack out, block out) and no option to name the erring opponent. Practical. | `src/sports/volleyball/engine.ts:93-95` | Add an optional second-row chip for the error type, plus an optional opponent player. | S |
| P1 | "Opp. serve error" doesn't record which server erred, so there is no serve-error column. Practical once serve tracking (SD-58) exists. | `src/sports/volleyball/engine.ts:94` | Pre-fill the server from SD-58 and credit `serveErrors` to the opponent. | S |
| P2 | Reception quality (#/+/-/error), digs and set assists are not tracked. Spotter. | (none) | Add them to the SD-81 detailed mode. Off by default. | M |
| P2 | Block assists are not tracked (multi-player block point). Practical. | `src/sports/volleyball/index.tsx:50` | Allow a second blocker chip, crediting `blockAssists`. | S |

**(3) Flow friction**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | No serving-team or rotation indicator, so Ace has to be picked by hand on the correct side (SD-58 is still READY). | `src/sports/volleyball/index.tsx:87-88` | Add a 🏐 dot on the serving side and offer Ace only on that side. | M |
| P2 | Both error chips use the same 🎁 icon and look alike. | `src/sports/volleyball/engine.ts:93-94` | Use distinct icons and labels ("Opp. fault" vs "Opp. missed serve"). | S |

**(4) Rule coverage (FIVB) still open**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | Timeouts are hard-coded at 2 per set for every preset. Beach is 1 per team per set, plus the technical timeout at 21 points in sets 1–2. | `src/sports/volleyball/index.tsx:122` | Add a `timeoutsPerSet` format key; set the Beach preset to 1. | S |
| P2 | No court-switch prompt: beach every 7 points (every 5 in the decider), indoor at 8 in the decider (VB-10, parked). | `src/sports/volleyball/engine.ts:179-183` | Show a non-blocking "Switch sides" toast. | S |
| P1 | Substitutions (6 per set) and libero (SD-71), and sanctions where a red card awards a point (SD-53), are still READY. | (none) | Build per the backlog. | M |

### Kabaddi

**(1) Accidental-action risk**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P0 | Backfill mode is sticky: every raid is stamped at the past minute until the scorer taps "Back to live". If they forget, every later live raid is mis-stamped, and the halves and timeline go wrong. | `src/sports/kabaddi/index.tsx:316-334`, `:63` | Return to live automatically after one recorded raid, or show a red "BACKFILLING 12'" banner inside the raid panel. | S |
| P1 | The touch chips (0–5) aren't capped at the defenders on the mat. Points use raw touches (`rules.ts:103`) while outs are clamped, so "5 touches" with 2 defenders left scores 5. | `src/sports/kabaddi/index.tsx:266`; `src/sports/kabaddi/rules.ts:103`, `:113` | Disable chips above (teamSize − out[def]) and clamp in the engine (v2-gated). | S |
| P1 | Timeline ✕ removes a raid together with its tackle and all-out lines in one tap, with no confirm and a small text target. | `src/sports/kabaddi/index.tsx:353` | Confirm with "Removes raid +N, tackle, all-out +2". | S |
| P2 | "End 1st Half →" is a primary button just below the correction list, with no confirm. It stops the clock. Skip if SD-106 already covers half-ends. | `src/sports/kabaddi/index.tsx:364-366` | Put it behind the SD-106 confirm sheet. | S |

**(2) Scorer-detail gaps**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P2 | Tackle type (ankle/thigh hold, dash, block, chain) is not captured. Practical as one optional chip. | `src/sports/kabaddi/index.tsx:275-289` | Add an optional `tackleType` on RAID_OUTCOME. | S |
| P2 | The defenders touched aren't named (KB-10, parked), so there is no revival order and no "times out" per defender. Practical but slows each raid. | `src/sports/kabaddi/index.tsx:264-269` | Add an optional multi-select of defenders (sets the touch count). | M |
| P2 | Unsuccessful tackle attempts and the 30-second raid timer aren't captured. Spotter. | (none) | Leave out of scope, or auto-start a 30s timer on "X raiding". | S |

**(3) Flow friction**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | Raids alternate, but both "X raiding" buttons look the same, so a raid can be logged for the wrong team. Do-or-die only shows after the panel opens. | `src/sports/kabaddi/index.tsx:240-243`, `:251` | Highlight the expected raiding side and show a ⚠ DoD badge on its button. | S |
| P1 | The clock can't be paused (timeouts, injury, review), so the minute drifts. KICKOFF only sets `startedAt`. | `src/sports/kabaddi/engine.ts:113-121`, `:263` | Add PAUSE/RESUME actions (accumulated elapsed time). | M |
| P2 | The Raider chip can't be deselected, and its list includes players who are currently out. | `src/sports/kabaddi/index.tsx:259` | Make the chip a toggle; dim players who are out (needs KB-10). | S |

**(4) Rule coverage (PKL / AKFI) still open**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | A substituted player "takes no further part". AKFI/PKL allow a substituted player to come back on (within the substitution limit). | `src/sports/kabaddi/index.tsx:121-123`, `:151` | Return the off player to the eligible pool after a later sub (format flag). | S |
| P2 | Team timeouts (2 per half, 30s) aren't tracked. | (none) | Add a TIMEOUT marker with a counter, as in volleyball. | S |
| P1 | Still READY: technical points and line-outs (SD-59), cards and the 2-minute suspension (SD-72), touches when the raider is caught (SD-83). | (none) | Build per the backlog. | S/M |

### Carrom

**(1) Accidental-action risk**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | "Opponent's coins left" starts preselected at 0, so Record can log a +0 (or Queen-only) board without a coin pick. A won board almost always leaves at least 1 coin. | `src/sports/carrom/index.tsx:28`, `:81`, `:92` | No default; disable Record until a coin count is picked. | S |
| P1 | There is no board editor. Fixing board 3 of 7 means undoing every board after it. | `src/sports/carrom/index.tsx:114-121` | Add ✎/✕ per board row (EDIT_LOG replay, as in RallyPointEditor). | M |
| P2 | The game-winning board closes the game or match on the same tap; the only hint is "(game at 25)". | `src/sports/carrom/index.tsx:92` | Relabel to "✓ Record board · wins Game 2" with a stronger style. | S |

**(2) Scorer-detail gaps**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | Breaker per board is not recorded (SD-68 / CR-04 READY). Practical. | `src/sports/carrom/index.tsx:60` | Add FIRST_BREAK with auto-alternation; show "{name} to break". | S |
| P2 | Fouls and dues per player per board are not counted (CR-09, parked). Practical as a stepper. | (none) | Add an optional `fouls` per side on BOARD. | S |
| P2 | A Queen pocketed or covered by the loser is not recorded. Practical. | `src/sports/carrom/index.tsx:84` | Add a three-way Queen chip: winner / loser / not covered. | S |
| P2 | Shot type (cut, thumb, rebound) and pocketing % are not tracked. Spotter. | (none) | Out of scope. | (n/a) |

**(3) Flow friction**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P2 | The slam chip asks "broke / didn't break" by hand, though the breaker could be known. | `src/sports/carrom/index.tsx:86-90` | Derive White/Black from the breaker (after CR-04); a single "Slam" chip is enough. | S |

**(4) Rule coverage (ICF) still open**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P2 | No penalty board (3 to the opponent, not counted as a won board) (CR-07, parked; SD-68 READY). | `src/sports/carrom/engine.ts:121-145` | Add `BOARD {penalty:true}`. | S |
| P1 | No toss or choice of break and side at the start (CR-04). | (none) | One-time picker before board 1. | S |

### Chess

**(1) Accidental-action risk**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P0 | "✓ Record result" ends the game in one tap. The match completes, standings and pairings update, and the "Full time" push goes out (`useLiveMatch.ts:292`). There is no in-panel undo after that. | `src/sports/chess/index.tsx:96`; `src/data/useLiveMatch.ts:292` | Add a confirm sheet: "Record 1-0: {White} beat {Black} by Resignation?" | S |
| P1 | The White-pieces chips dispatch SET_WHITE on every tap, with no lock. A stray tap overrides the Swiss-paired colour (`config.white`) and corrupts colour history. | `src/sports/chess/index.tsx:67-68`; `src/sports/chess/engine.ts:37` | Lock it when the fixture has a paired colour, or only commit at Record. | S |

**(2) Scorer-detail gaps**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P2 | No move list or PGN (CH-09, parked). Pasting PGN after the game is practical; live move entry needs a spotter or e-board. | `src/sports/chess/index.tsx:85-93` | Add an optional PGN paste field; show moves read-only. | M |
| P2 | Clock times left at the end aren't captured. Practical (2 numbers). | `src/sports/chess/index.tsx:85-93` | Add optional "White/Black time left" fields. | S |

**(3) Flow friction**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | Result chips say "{name} won" rather than the arbiter's 1-0 / 0-1 written White-first, so the wrong side is easy to pick. "Home has White" doesn't name the player (SD-67). | `src/sports/chess/index.tsx:74-76`, `:123` | Label "1-0 (White wins)", "½-½", "0-1", with names underneath. | S |

**(4) Rule coverage (FIDE) still open**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | No mini-match or tie-break games (2 classical games, then rapid/blitz, then Armageddon with draw odds for Black). These are needed for knockout events (World Cup format). | `src/sports/chess/engine.ts:43-58` | Add a `games: N` format with tiebreak stages; Armageddon draw = Black wins. | M |
| P2 | Missing methods: illegal move (Art. 7.5.5 / A.4), timeout vs insufficient material = draw (Art. 6.9), 5-fold / 75-move draws. Dead position, double forfeit and arbiter decision are already in SD-67. | `src/sports/chess/engine.ts:11-12` | Extend DECISIVE and DRAWN. | S |
| P1 | A forfeit still credits `games: 1` played (still open under CH-08 / SD-67). | `src/sports/chess/index.tsx:51` | Skip `games` when the method is forfeit. | S |

### Golf (match-play panel + `GolfRoundScreen` stroke play)

**(1) Accidental-action risk**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P0 | "{name} concedes" ends the match in one tap with no confirm, right under the hole buttons. It also reads like conceding a hole. | `src/sports/golf/index.tsx:77-80` | Relabel "Concede match…" and add a confirm sheet; move it to the bottom (with SD-106). | S |
| P0 | In stroke play, "Pick up" makes the whole card a No Return (`engine.ts:210-213`), with no warning. It sits next to "Par". | `src/screens/GolfRoundScreen.tsx:233` | In stroke play: confirm "Pick up = no return (NR)", or hide it unless a max-score rule applies. | S |
| P1 | "Clear" wipes the hole score in one tap, next to Par and Pick up. The round screen has no undo. | `src/screens/GolfRoundScreen.tsx:234` | Drop Clear (the − button already exists) or make it a long-press. | S |

**(2) Scorer-detail gaps**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | Fairway L/✓/R, GIR, penalty strokes and sand saves are not captured (SD-45 READY). Practical for the marker. | `src/screens/GolfRoundScreen.tsx:236-243` | Build SD-45 inside the putts row toggle. | M |
| P2 | Putts allow 0–4 only, and putts can exceed strokes (changing strokes keeps the old putts). | `src/screens/GolfRoundScreen.tsx:238-242`, `:110-114` | Allow 5+ and clamp putts to strokes − 1 (allow putts = strokes for chip-ins). | S |
| P2 | Match play records only the hole winner. No strokes, so no birdie or other stats (SD-87). | `src/sports/golf/index.tsx:74-76` | Add optional strokes per hole for both sides. | M |

**(3) Flow friction**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P2 | Strokes are capped at 15 (rare, but a real score can be higher). | `src/screens/GolfRoundScreen.tsx:227` | Raise the cap to 20 or allow typed entry. | S |
| P2 | No auto-advance once every player in the group has a score for the hole. | `src/screens/GolfRoundScreen.tsx:249` | Advance automatically after a short delay, or pulse "Next". | S |
| P2 | A Back-9 match is numbered holes 1–9 (SD-87). | `src/sports/golf/index.tsx:30`, `:71` | Offset hole numbers for back9. | S |

**(4) Rule coverage (R&A / USGA) still open**
| P | Finding | file:line | Fix | Size |
|---|---|---|---|---|
| P1 | No marker certification or player sign-off (Rule 3.3b). The host's "Finish the round" locks every card. | `src/screens/GolfRoundScreen.tsx:128`, `:250` | Add a per-card "Marker ✓ / Player ✓" before Finish; flag unsigned cards. | M |
| P1 | WD / DQ / DNS and NR handling (SD-35) and playoff tie-break (SD-89) are still READY. | (none) | Build per the backlog. | S |
| P2 | A conceded match records 1-0 with no margin (e.g. "conceded, 3 down thru 12"). | `src/sports/golf/index.tsx:46-48`, `:112` | Keep the hole state on CONCEDE and show it in the result line. | S |
