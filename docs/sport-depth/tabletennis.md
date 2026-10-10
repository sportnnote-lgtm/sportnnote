# Table tennis — depth audit

Standard sources: ITTF Handbook 2025. Laws: 2.11 (game to 11, win by 2), 2.12 (match best of an odd number of games), 2.13 (order of serving, receiving and ends; 2 serves each, 1 each from 10-all; change ends at 5 in the deciding game), 2.14 (doubles service/receiving order and the switch at 5 in the deciding game), 2.15 (expedite system). Regulations: 3.4.4.3 (one time-out per player/pair per individual match), 3.5.2 (yellow/red card, penalty points), 3.7.5 (group ranking: 2 match points a win, 1 a loss; ties among the tied only by match points → games ratio → points ratio; restart). Team-event formats: the WTTC / Swaythling-Corbillon team match (ABC v XYZ, 5 singles, best of 5 individual matches; the Corbillon variant has 4 singles + 1 doubles), the Olympic team format (1 doubles + up to 4 singles, best of 5 individual matches). WTT / ITTF match stats (points won, service and receive points won, max consecutive points, time-outs). ITTF player profiles (career W-L, titles, ranking).

Summary: table tennis is the **thinnest plugin**: 76 lines of config on the shared rally engine (`src/sports/tabletennis/index.tsx`). Scoring and the singles service order are correct and replay-validated against Paris 2024 and WTTC 2024 (`tabletennis/serve.ts`, `docs/sport-coverage/replay-validation.md:119-120`). The ITTF group ranking (3.7.5) is implemented faithfully (`standings.ts:98`, `:282-347`). Everything else is shallow:
- The box score is one PTS column (`PointBoxScore.tsx`).
- There is no per-game line scoreboard (no `Scoreboard` in `rallyCore.tsx`), and the finished-match summary reads "0–0" (`rallyCore.tsx:157`).
- There is no surgical point editor: `rallyEngine.ts:71` ignores `EDIT_LOG`.
- There are no time-outs, no doubles serve/receive order by name (`rallyCore.tsx:98`), no expedite and no cards.
- **Team matches** (the standard school and international TT format) can't be run as one fixture.
- The player profile has no games or points %, deciding-game record or titles.

As in tennis and badminton, the WTT-style serve and receive stats are **derivable from the existing log**, because the server of every point is `ttServer(score, gamesPlayed, opening)` (`tabletennis/serve.ts:12-17`). Shared core findings are in `tennis.md` § "Shared racket/net core".

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Game to 11, win by 2 (deuce) | Core | `gameWinner` (`rallyEngine.ts:38-42`); defaults (`index.tsx:23`) | ✅ | Replay-tested. |
| Best of 3 / 5 / 7; legacy 21 | Core | Presets (`index.tsx:30-33`) | ✅ | |
| Service order: 2 each, 1 each from 10-all; opening server alternates by game; toss | Core | `ttServer` (`serve.ts:12-17`); `firstServe` (`index.tsx:39-44`) | ✅ | |
| Doubles service/receive order (A1→X1→A2→X2; the receiver switch at 5 in the deciding game) | Core | Side only (`rallyCore.tsx:98`) | ⚠️ | No player names, and the doubles server rotation isn't modelled. |
| Change of ends at 5 in the deciding game | Core (procedure) | — | ❌ | A scorer cue, not a stat. |
| Time-out (1 per player/pair per match) | Core | — | ❌ | WTT stats list time-outs. |
| Expedite system (after 10 min; serve alternates every point; 13 returns) | Core (rule) | — | ❌ | Known gap (`replay-validation.md:137`). Rare in school play. |
| Yellow / red card, penalty points | Adv | — | ❌ | |
| Per-game line scoreboard (11-9, 8-11, …) | Core | Generic board + "Games" chips (`rallyCore.tsx:125-132`) | ⚠️ | No `Scoreboard`; tennis and badminton have `LineScoreboard`. |
| Result after the match | Core | `summary()` gives current points, "0–0" once ended (`rallyCore.tsx:157`) | ❌ | GEN-RES. |
| Points won per player | Core (doubles split) | `PointBoxScore` PTS + per-game toggle | ✅ | |
| Total points won (and %) | Core (WTT) | Not shown (only `standingsPoints`, `rallyCore.tsx:152`) | ⚠️ | |
| Service points won / receive points won | Core (WTT) | Derivable (`ttServer`) | ❌ | GEN-RS. |
| Max consecutive points | Core (WTT) | Derivable | ❌ | GEN-RS. |
| Game points saved, deuce games won, comebacks | Adv | Derivable | ❌ | GEN-RS. |
| Service aces / service faults | Adv | — | ❌ | Optional tag (GEN-PO). |
| Point timeline | Core | `LiveTimeline` (`rallyCore.tsx:136`) | ✅ | |
| Surgical point editor (edit / insert / remove a past point) | Core (scorer) | Global undo only. `rallyEngine.ts:71` returns state for anything but POINT. | ⚠️ | Coverage audit "Tier 2" (`racket-and-net.md`), still open. |
| Match duration | Core (WTT) | — | ❌ | Event timestamps (GEN). |

## 2. Team level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Played / W / L, form, head-to-head | Core | `teamStats.ts` | ✅ | for/against = games (no unit label). |
| **Team match as one fixture** (ABC v XYZ, 5 singles; Corbillon 4S+1D; Olympic 1D+4S; stop at 3 wins) | Core | `series.ts` "rubbers" only, and only in knockouts. No lineup order, no ABC/XYZ draw, and group tables count each rubber as a match. | ❌ | The standard team-event format at every level, school included. |
| Team-tie stats (ties W-L, individual matches W-L, games, points) | Core | — | ❌ | |
| Top performers | Core | `SPORT_AWARDS.tabletennis` = points (`ratings.ts:102`) | ⚠️ | Points don't rank TT players. Use wins. |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Group ranking ITTF 3.7.5 (2/1 match points; among the tied only; games ratio → points ratio; restart) | Core | `standings.ts:95-98,282-347` | ✅ | Validated on WTTC 2024 Group 5. |
| Team-event group ranking (match points from ties; then individual matches ratio → games → points) | Core | — | ❌ | Needs GEN-TIE. Known gap (`replay-validation.md:136`). |
| Draws / brackets / seeding; group → KO | Core | Generic | ✅ | |
| Leaderboards | Core | `points` only (`standings.ts:421`) | ⚠️ | Missing wins, win %, games %, points %. |
| Awards | Core | Points weight 1 (`ratings.ts:33`) | ⚠️ | |
| Champions per event (singles/doubles/team) | Core | `bracketChampion` | ⚠️ | Not written to profiles. |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches, W-L, win % | Core | `SportProfileScreen.tsx:177-179` | ⚠️ | Depends on an attributed stat line (shared core). |
| Singles / doubles / team-rubber split | Core | — | ❌ | |
| Games won-lost (%) | Core | — | ❌ | GEN-RC. |
| Points won-lost (%) | Core | Points won only | ⚠️ | |
| Deciding-game W-L, deuce-game W-L, comebacks | Core (ITTF profile/analytics) | — | ❌ | |
| Service / receive points won % | Core (WTT) | — | ❌ | GEN-RS + GEN-RC. |
| Titles / finals | Core | — | ❌ | |
| Match history with the game scores | Core | Counters only (`SportProfileScreen.tsx:289`) | ⚠️ | |
| H2H vs an opponent | Core | — | ❌ | GEN-H2H. |
| Hand / grip / style | Core | `sportProfileFields.ts:45-48` | ✅ | Good depth here. |
| Rating / ranking | Adv | — | Out of scope (P2) | A school Elo is possible later, as a generic item. |

## 5. Out of scope (needs tracking / extra spotters)
- Ball speed / spin, placement maps, rally length in strokes, stroke-type breakdown (forehand/backhand topspin etc.).
- The expedite "13 returns" counter is a second umpire's job; the app can support the expedite *serve rule* (TT-09) but not count returns reliably.

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| TT-01 | **Result after the match**: when ended, `rallyCore` `summary()` gives games won as the score and the game scores as the detail (fixes "0–0"). | P0 | S | Match | None | No | **GEN-RES** (also squash, pickleball) |
| TT-02 | **Per-game line scoreboard** in `rallyCore` (`LineScoreboard`: games won + a column per game, live game highlighted, serve dot from `ttServer`), with the scoreline on history and result. | P0 | S | Match, Player | None | No | GEN (rallyCore: squash/pickleball get it free) |
| TT-03 | **Surgical point editor**: teach `rallyEngine` `EDIT_LOG`/`STAT_ADJUST` via `replayPoints`, and mount `RallyPointEditor` in `rallyCore` controls. | P0 | S | Match | New `EDIT_LOG`/`STAT_ADJUST` handling in the rally engine (old logs never contain them, so they replay identically) | No | **GEN-ED** (squash, pickleball) |
| TT-04 | **Rally match-stats panel** (GEN-RS): total points won %, service points won, receive points won, max consecutive points, game points saved, deuce games. Per game and overall. | P0 | M | Match | None (server derived per point via `ttServer`) | No | **GEN-RS** |
| TT-05 | **Team match as one fixture**: pick a format (WTTC 5-singles ABC/XYZ, Corbillon 4S+1D, Olympic 1D+4S, custom N rubbers), lineups and order, auto-create the rubbers, stop at the majority. Group ranking per ITTF team rules (ties → individual-matches ratio → games → points). | P1 | L | Match, Team, Tournament | None for rubbers (each stays a normal match, with `__series*` keys + new `__seriesSlot` like "A-X") | No (format jsonb) | **GEN-TIE** (badminton, tennis Davis Cup, squash) |
| TT-06 | **Time-out** button (1 per side per match, disabled once used); shown in the timeline and the WTT stats. | P1 | S | Match | New action `TIMEOUT` (no score effect) | No | GEN (the rally engine for all) |
| TT-07 | **Doubles service/receive order by name** (Law 2.14): choose the first server per game; the first receiver then follows; switch at 5 in the deciding game; name both players. Plus a "change ends" cue at 5 in the decider. | P1 | M | Match | Optional `server` player id on a per-game `SET_GAME_SERVER`; absent = today's side-only display | No | No |
| TT-08 | **Table tennis career block** (GEN-RC): W-L by singles/doubles/team, games W-L %, points W-L %, deciding-game W-L, deuce games W-L, service/receive points %, titles, history with game scores. | P1 | M | Player | None (match-level keys at completion) | No | **GEN-RC** |
| TT-09 | **Expedite system**: an "Expedite" toggle (Law 2.15) that makes service alternate every point for the rest of the match; marked in the timeline. | P2 | S | Match | New action `EXPEDITE` (old logs: never set) | No | No |
| TT-10 | Yellow / red cards and penalty points (Reg 3.5.2); a penalty awards a point. | P2 | S | Match | New action `CARD` | No | GEN (with BD-11) |
| TT-11 | Optional point-outcome tag: service ace, service fault, winner, error. | P2 | M | Match, Player | Optional `outcome` payload | No | **GEN-PO** |
| TT-12 | TT leaderboards and awards: Wins, Win %, Games won %, Deciding games won. Replace points (`ratings.ts:102`, `standings.ts:421`). | P1 | S | Tournament | None | No | GEN (racket leaderboards) |
| TT-13 | Match duration from event timestamps | P2 | S | Match, Player | None | No | GEN |
