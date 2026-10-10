# Carrom — depth audit

Standard sources:
- International Carrom Federation (ICF) Laws of Carrom: board scoring (1 point per opponent's coin left; Queen 3 when the board winner covered it, only while their score is 21 or less); a game to 25 points or 8 boards, with an extra board when level; a best-of-3-games match; the break and the toss; fouls and "due" coins; the penalty board; singles and doubles.
- ICF/AICF championship score sheets and records: board-by-board sheet with breaker, points and running total; **White Slam** (the breaker finishes the board in their first turn) and **Black Slam** (the non-breaker finishes it in their first turn); 25-0 games.
- The earlier replay: `docs/sport-coverage/replay-validation.md` (Carrom World Cup 2018 / 2025).

Summary: the **scoring engine is correct to ICF**, and replay-checked (`src/sports/carrom/engine.ts`):
- the board value;
- the Queen counting only up to 21 and only when the winner covered it;
- the game recorded at 25;
- the 8-board limit with tie-break boards;
- best of 3.

**The statistics around it are thin:**
- **Board record:** each board stores only the winner, coins and Queen. There is no breaker and no record of slams.
- **Match view:** a list of boards with no running-total score sheet.
- **After the match:** the live scoreboard falls back to **0 : 0** (the current-game score resets).
- **Losing players:** they get no stat line, so career Matches and Win rate are wrong (every carrom player has a 100% win rate).
- **Doubles:** only the "finisher" gets credit.
- **Standings:** they can't use points difference, because the match score is games won.

Player stats are limited to board points, boards won and Queens.

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Board result: winner, opponent's coins left (0–9), Queen covered by the winner | Core | `BOARD` (`engine.ts:51-60`), controls (`index.tsx:41-71`) | ✅ | A Queen covered by the **loser** (nobody scores the 3) isn't recorded. That matters only for Queen-count stats. |
| Board points, Queen only while 21 or less | Core | `boardPoints` (`engine.ts:45-48`), cut-off at 22 | ✅ | |
| Game to 25 / 8 boards / tie-break board; recorded at 25 | Core | `engine.ts:62-71` | ✅ | |
| Match best of 3 / single game | Core | `gamesToWin` (`engine.ts:72-74`, `index.tsx:133-139`) | ✅ | |
| Live score after the match | Core | `summary.homeScore = current` (`index.tsx:106-108`). `current` resets to 0-0 when each game ends (`engine.ts:74`). | ❌ | The final scoreboard reads **0 : 0 · Match Over**. The games score (2:1) is only in the detail line. |
| Score sheet: board #, breaker, points, running total per player, per game | Core (ICF sheet) | `LiveExtras` lists "G1 · X +7 (4 coins + 👑)" newest first, with no running total and no breaker (`index.tsx:75-94`) | ⚠️ | |
| Who broke each board (toss, then alternating) | Core | — | ❌ | One tap at the toss, then automatic alternation. Needed for slams. |
| White Slam / Black Slam | Core (records) | — | ❌ | One chip on the board form ("finished in first turn"); the breaker decides white or black. |
| Penalty board (loses the board by 3) | Core | Entered as a board with coins = 3 (replay-validation known gap) | ⚠️ | No marker, so it counts as a real board win in player stats. |
| Fouls / dues per board | Adv | — | ❌ | Stroke-level. See §5. Only a per-board foul count is practical (P2). |
| Doubles: who finished the board | Core | "Finished by" picker (`index.tsx:53-60`) | ⚠️ | Only that player gets credit. |
| Time limit / abandoned game | Adv | Generic manual end | ✅ | |

## 2. Team level

Carrom "teams" are the sides in doubles, or clubs and states in team championships, where a tie is several singles and doubles matches.

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Record W/L, form, head-to-head | Core | `computeTeamStats` (generic). No carrom unit in `teamStats.ts:25`. | ✅ | The score shown is games won. |
| Team championship tie (e.g. 3 singles + 1 doubles), ranked by ties won, then matches | Core (ICF/AICF team events) | — (one match per fixture) | ❌ | GEN-06. |
| Doubles pair as a unit (pair record) | Core | The side is the pair, so W/L is right at side level | ✅ | |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| League table, 2-0 points per match | Core | Default 2-1-0, order `h2h, diff, for` (`standings.ts:99-101`) | ✅ | No draws in carrom; the draw points are harmless. |
| Tie-break by games difference | Core | `diff` works on games won (the match score = `gamesWon`, `engine.ts:77-80`) | ✅ | |
| Tie-break by **points difference / ratio** (board points over all games) | Core | Carrom has no `standingsPoints` provider (`types.ts:297`), and no overall points-ratio tie-break exists (`h2hPoints` is among-tied only) | ❌ | The usual third criterion in carrom leagues. Confirm the exact order against AICF/ICF tournament regulations. |
| Columns: games won-lost, points difference | Core | `StandingsScreen.tsx:272-279` shows P W L Pts | ⚠️ | GEN-03. |
| Leaderboards: points, Queens | Core | `STAT_CATEGORIES.carrom` (`standings.ts:423`), awards (`ratings.ts:104`) | ⚠️ | "Points" is board points, credited only to the finisher. |
| Leaderboards: slams, boards won, games won, 25-0 games | Core (records) | — | ❌ | |
| Knockout bracket, groups → KO | Core | Generic | ✅ | |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches played, won, lost, win % | Core | Only the board winner's player gets a stat line (`index.tsx:33-37`) | ❌ | A player who loses without winning a board has no line, so the loss isn't counted (GEN-01). A loser who won some boards has lines, but they only get `won=false` at completion if a line exists. |
| Games won / lost | Core | — | ❌ | |
| Boards won / boards played, board win % | Core | `boards` +1 per board won | ⚠️ | No boards played. |
| Board points scored, points per board | Core | `points` (`index.tsx:36`) | ⚠️ | On the winning board it's the uncapped value, so career points can exceed the game totals (a game recorded 25 at `engine.ts:70`). Points conceded aren't stored. |
| Queens covered | Core | `queens` +1 when the winner covered it | ✅ | Credits the winning side's finisher, which is right for singles. |
| White Slams / Black Slams | Core (records) | — | ❌ | |
| 25-0 games ("clean sweeps") | Adv | — | ❌ | |
| Doubles: both partners credited for boards and games won | Core | Only the finisher | ⚠️ | |
| Striking hand | Adv | `sportProfileFields.ts:51` | ✅ | |
| Labels | — | `boards`, `queens` aren't in SportProfile LABELS (`SportProfileScreen.tsx:25-37`), so they render as raw keys | ⚠️ | Cosmetic. |

## 5. Out of scope (needs tracking or extra spotters)

- Stroke-by-stroke logging: every pocket, every foul and due coin, turns per board, pocketing %, cut / rebound / thumb-shot types. The scorer would have to tap after every stroke while also umpiring. Only a per-board summary is practical.
- Time per turn.

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| CR-01 | **Final score after the match:** once ended, the summary and scoreboard show the games (2–1) and the last game's score (e.g. "25-18"), not the reset 0 : 0. | P0 | S | Match | None (summary projection only) | No | No |
| CR-02 | **Every player gets a match line:** both sides, including the loser and both doubles partners. Matches, wins, losses and games won/lost are written absolute at completion via a carrom `statTotals` (from `boards[]` and `games`). | P0 | M | Player, Tournament | None for old logs. `statTotals` derives from state; player ids come from the matchday squad. | No | GEN-01 / GEN-02 |
| CR-03 | **Score sheet view:** per game, a table of board # · breaker · winner · coins · Queen · running total. Game results as chips. Penalty boards marked. | P1 | S | Match | None | No | No |
| CR-04 | **Break and slams:** toss / first breaker at the start, then alternating automatically (singles; the doubles rotation of 4). An optional "finished in first turn" chip on the board gives a White or Black Slam. Slam counts go on the player line and leaderboards. | P1 | S | Match, Player, Tournament | New optional action `FIRST_BREAK {side}` and optional `slam:true` key on `BOARD`. Old logs: breaker unknown, slams 0. | No | No |
| CR-05 | **Carrom career:** matches W/L, games W/L, boards won / played and %, points per board, Queens, slams, 25-0 games, best game. Fix the LABELS. | P1 | M | Player | Optional keys via CR-02's `statTotals` | No | GEN-02 |
| CR-06 | **Points-difference tie-break:** a carrom `standingsPoints` (board points for and against over all games) and a new overall `pointsDiff` / `pointsRatio` TieBreaker; show G± and P± columns. | P1 | S | Tournament | None | No | GEN-03 |
| CR-07 | **Penalty board as its own action** (`BOARD` with `penalty:true`): scores 3 to the opponent without counting as a board won, a Queen, or a slam. | P2 | S | Match, Player | Optional key; old logs unchanged | No | No |
| CR-08 | **Team championship tie** (N singles + doubles rubbers → tie result). | P1 | L | Team, Tournament | New fixture shape (GEN-06) | Likely | GEN-06 |
| CR-09 | Optional per-board foul count (for the record, no score effect). Record a Queen covered by the loser so Queen counts are complete. | P2 | S | Match, Player | Optional keys on `BOARD` | No | No |

**GEN- candidates from carrom:**
- GEN-01: appearance and result lines for every player who took part, which fixes the 100% win rates.
- GEN-02: a career framework with absolute `statTotals` for non-cricket sports.
- GEN-03: tie-break columns, plus an overall points-difference tie-break fed by `standingsPoints`.
- GEN-06: team ties made of individual rubbers.
