# Pickleball — depth audit
Standard sources: USA Pickleball *Official Rulebook* (2025/26). It covers side-out scoring, games to 11 (or 15/21) win by 2, the doubles "0-0-2" start, the three-number score call (server score, receiver score, server number), and server position by score parity (even = right court). It also covers the rally-scoring provisional rule, timeouts (2 per game to 11/15, 3 to 21), switching ends at 6/8/11, and faults (kitchen/non-volley-zone, foot fault, serve fault, out, net). PPA Tour and APP formats: side-out scoring; pro brackets best of 3 to 11, medal matches best of 3 or 5 to 11. MLP: rally scoring to 21 with a "freeze" at 20 (a team on 20 can only win the game on its own serve), and the DreamBreaker singles rotation tiebreaker. PPA/APP match stats: points won, points won on serve, side-outs, 3rd-shot success, unforced errors, kitchen faults. Ratings: DUPR (note only).

Summary: the plugin is 79 lines of options on the shared rally engine (`src/sports/pickleball/index.tsx`), and the core scoring is **correct**. That covers side-out scoring with the 0-0-2 start (`rallyEngine.ts:64`), the server-1 → server-2 → side-out handover (`rallyEngine.ts:75-86`) and the three-number call in the status line (`rallyCore.tsx:162`). It also has rally scoring, 11/15/21 and singles/doubles. But three things hurt credibility. (1) The **"Tournament" preset uses rally scoring** (`pickleball/index.tsx:31`), yet sanctioned USA Pickleball/PPA/APP play is side-out. A coach would notice immediately. (2) The **named server is always roster[0]/roster[1]** (`rallyCore.tsx:63-66`), not the player in the right-hand court. The call "4-2-1" can name the wrong person and credit their points to them. (3) There are **no stats beyond points per player**: no side-outs, no points-on-serve %, no faults, no game scores off the live screen, no games W-L on the profile. The MLP freeze rule and timeouts are missing. **There is no pickleball engine test.** The "Rally won" two-button UI for side-out is a good one-phone flow to build on.

## 1. Match level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Side-out scoring, only the server scores | Core (sanctioned) | `sideOut` (`rallyEngine.ts:60`, `:75-88`) | ✅ | |
| Doubles 0-0-2 start, server 1 → 2 → side-out | Core | `serverNo: 2` at game start (`rallyEngine.ts:64`, `:104`); handover (`:79-85`) | ✅ | |
| Score call "server-receiver-server#" | Core | `detailLine` "call 4-2-1" (`rallyCore.tsx:162`) | ✅ | Should be the headline in side-out mode, not the detail line |
| Server identity (right-court player at side-out; position by score parity) | Core | `rosterOf(t)[serverNo-1]` (`rallyCore.tsx:63-66`) | ⚠️ | Wrong name and wrong point credit whenever the right-court player isn't roster[0]. Derivable from one pick (who starts on the right) + team score parity |
| Who serves first (toss) | Core | Engine reads `config.firstServe` (`rallyEngine.ts:62`). No pickleball format field | ⚠️ | Always home |
| First serve in game 2+ | Core | Game winner serves next (`rallyEngine.ts:104`) | ⚠️ | Verify against the USA Pickleball rulebook (sanctioned play alternates the first-serving team by game) |
| Rally scoring (rec / USA provisional / MLP) | Core | `scoring: 'rally'`. Server = last rally winner (`rallyCore.tsx:92-95`) | ✅ | |
| MLP freeze at 20 (rally to 21: can only win the game on serve) | Core (MLP) | `dreambreaker` preset is plain rally to 21 (`pickleball/index.tsx:35`) | ❌ | |
| DreamBreaker 4-player singles rotation | Core (MLP) | Explicitly not tracked (`pickleball/index.tsx:34`) | ⚠️ | Score is fine; rotation P2 |
| Presets match real competitions | Core | "Tournament (best of 5)" = **rally** 11 (`:31`); "Traditional" = side-out bo3 (`:32`) | ❌ | Should be "USA Pickleball / PPA (side-out · best of 3 to 11)", "1 game to 15 / 21 (side-out)", "Medal match (side-out · bo3 or bo5, per event)", "MLP rally 21 (freeze)", "Rec rally 11" |
| Games to 11/15/21, win by 2/1, best of 1/3/5 | Core | `pickleball/index.tsx:54-77` | ✅ | |
| Timeouts (2 per game to 11/15, 3 to 21), medical timeout | Core | None | ❌ | Display + log only. Practical |
| Switch ends at 6 (to 11) / 8 (to 15) / 11 (to 21) in the deciding game | Core | None | ⚠️ | A prompt only |
| Faults: kitchen (NVZ), foot, serve, out, net | Core (PPA stats: kitchen faults, UE) | None. Only `POINT` (`rallyCore.tsx:57-58`) | ❌ | Practical as an optional "how" on the rally |
| Side-outs / 2nd-server events | Core | Logged as timeline events (`rallyEngine.ts:81,84`) | ⚠️ | Not counted or shown as a stat |
| Points on serve, side-out %, points per service turn, longest run | Core (PPA/APP) | None | ❌ | **Derivable from the existing log**, no new capture |
| Box score per player | Core | PTS per player (`PointBoxScore.tsx:16-26`). In side-out only the serving player gets credit (`rallyCore.tsx:67`) | ⚠️ | Points are team points in doubles. PTS-by-server only means something once server identity is fixed |
| Game scores line (11-7, 8-11, 11-9) | Core | Live screen only (`rallyCore.tsx:125-131`) | ⚠️ | Card shows games won (`MatchCard.tsx:93-95`) |
| Mid-match point edit | Core (scorer UX) | Not wired (only tennis/volleyball) | ⚠️ | Side-out events aren't `kind:'point'`, and the 2nd-server event's `side` is the *serving* side (`rallyEngine.ts:81`), so `pointInputs` (`rallyEdit.ts:40-43`) can't rebuild a side-out game |
| Retire / walkover / forfeit | Core | Generic (`LiveScoringScreen.tsx:180-190`) | ✅ | |
| Engine tests | — | None for pickleball (TT only: `tests/replay-wave1.test.mts:192`) | ⚠️ | |

## 2. Team level (team = pair; MLP / club team ties = series)
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Pair record, form, H2H | Core | `TeamProfileScreen.tsx:185-230` | ✅ | |
| Games won-lost, points won-lost | Core | `scored/conceded` = games (`rallyCore.tsx:150`) | ⚠️ | Point differential (the usual pickleball tie-break) isn't aggregated on the profile |
| Team events (MLP: 2 doubles + 2 mixed + DreamBreaker) | Core (MLP) | `series.ts` ties | ⚠️ | Series exists. MLP tie structure + DreamBreaker trigger at 2-2 not modelled. P2 |
| Americano / round-robin socials | Core (club) | `americano.ts`, `StructureEditor.tsx:26-27` | ✅ | |

## 3. Tournament level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Round-robin pools: wins, then H2H, then point differential (USA Pickleball tournament norm) | Core | `h2h → diff → for`, where diff = **games** (`standings.ts:100-103`, `LeagueTable.tsx:39`) | ⚠️ | Pickleball ranks by **point** differential. `standingsPoints` exists (`rallyCore.tsx:152-155`), but there's no "point diff" criterion (only `h2hPoints` ratio, offered for TT only: `standings.ts:111-115`) |
| Double elimination (common in pickleball) | Core | Bracket supports double chance (memory: tournament-org audit). Verify full double-elim | ⚠️ | |
| Leaderboards | Core | `points` only (`standings.ts:418`) | ⚠️ | Should be wins, point diff and side-out % |
| Medals / awards | Core | Generic | ✅ | |
| Skill-level / age divisions (3.0, 3.5, 4.0… / 19+, 50+) | Core | Categories/divisions exist (`useDivisions`, `StandingsScreen.tsx:45`) | ✅ | Labels are organiser-defined |

## 4. Player level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches, wins, win % | Core | `SportProfileScreen.tsx:177-179` | ✅ | |
| Games W-L, game %, point differential | Core | Not on stat line (`stats.ts:113`) | ❌ | GEN-06 |
| Points on serve, side-outs won, faults (kitchen, UE) | Core (PPA/APP) | None | ❌ | Follows PB-03/PB-05 |
| Record per partner, singles vs doubles vs mixed split | Core (pickleball-specific) | None | ❌ | Partner = teammate on the match roster. Mixed = from category |
| Match history with game scores | Core | "N pts" (`SportProfileScreen.tsx:289`) | ❌ | GEN-01 |
| Form / H2H as an individual | Core | None | ❌ | GEN-05 |
| DUPR-style rating | Adv | None | — | **Note only.** DUPR is proprietary. A self-contained Elo-style rating is a GEN-10 option, not proposed now |

## 5. Out of scope (needs tracking / extra spotters)
- Third-shot drop/drive success %, dink counts, rally length in shots, shot placement maps.
- Ball speed, "time at the kitchen line" (needs video tracking).

## 6. Proposed build items
| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| PB-01 | **Fix presets to real competition formats**: "USA Pickleball / PPA (side-out · bo3 to 11)", "1 game to 15 (side-out)", "1 game to 21 (side-out)", "Medal (side-out · bo5)", "MLP rally 21 (freeze)", "Rec (rally 11)". Default the format to side-out for tournaments. Rename the current rally "Tournament" preset | P0 | S | Match | None. Presets only snap config. Existing matches keep their stored format | No | No |
| PB-02 | **Correct server identity**: before serve, pick "who starts on the right" per team. Then right-court player = starter if the team score is even, else partner; server 1 at side-out = right-court player. Show "Serving: Asha (right) · 4-2-1" as the headline | P0 | M | Match, Player (fixes credit) | New action `SET_START_RIGHT` {side, playerId} (pre-serve, like padel's `SET_FIRST_SERVER`). Old logs without it fall back to roster order, so replay is identical | No | Shared side-out core (squash English doubles) |
| PB-03 | **Derived rally box score** (no new capture): rallies won, points on serve, side-outs forced, 2nd-server handovers, points per service turn, side-out %, longest run, per game and match | P0 | M | Match, Team, Player | None (derive from existing events: replay the reducer and count) | No | **GEN-02a** rally-sport deriver (squash English, badminton/TT rally runs) |
| PB-04 | **Game-score line** on card/result/history/share ("2-1: 11-7 8-11 11-9") | P0 | M | Match, Player | None | No | **GEN-01** |
| PB-05 | Optional fault reason on the losing side's rally: kitchen, foot fault, serve fault, out, net, unforced error, winner, with the player | P1 | M | Match, Player | `POINT.payload.how` + `attribution2`. Absent = plain rally, so replay is identical | No | **GEN-02** |
| PB-06 | Career line via `statTotals`: games W-L, point differential, points on serve, side-out %, per-partner record, singles/doubles/mixed split | P1 | M | Player, Tournament | None | No | **GEN-06** |
| PB-07 | Standings: add a `pointDiff` tie-breaker (overall + among tied) and default pickleball to `h2h, pointDiff` | P1 | S | Tournament | None | No | **GEN-04** (badminton/squash/TT can opt in) |
| PB-08 | Timeouts (2/3 per game) + "switch ends" prompt at 6/8/11 in the deciding game | P1 | S | Match | New action `TIMEOUT` {side} (timeline-only, reducer counts). Replay-safe | No | **GEN-11** timeouts across volleyball/badminton/TT/basketball-lite |
| PB-09 | MLP freeze at 20 (rally scoring: a point on the receiver's win at 20+ only transfers serve) | P2 | S | Match | Config key `freezeAt`. Additive | No | No |
| PB-10 | Wire the surgical point editor via rallyCore with a `rally` kind carrying `wonBy` (see SQ-08) | P1 | M | Match | `EDIT_LOG` + a `wonBy` key on side-out events going forward. Old events inferable (2nd-server event = serving side lost) | No | Shared with squash |
| PB-11 | Expose "Serves first (toss)" (`firstServe`) and verify the first serve in game 2+ against the USA Pickleball rule | P1 | S | Match | None | No | Shared with squash |
| PB-12 | Pickleball replay tests: a PPA side-out doubles game (0-0-2, handovers, 11-9), a rally game to 21, singles side-out | P1 | S | Match | None | No | No |
| PB-13 | MLP team tie (4 games, DreamBreaker at 2-2) as a series template | P2 | M | Team, Tournament | None | No | Series templates (GEN) |

GEN candidates raised: **GEN-01** game score line. **GEN-02/02a** point "how" + derived rally box score. **GEN-04** point-diff tie-breaker. **GEN-05** individual form/H2H. **GEN-06** racket career via `statTotals` (incl. per-partner record for doubles sports). **GEN-11** timeouts. DUPR-style rating stays a note.
