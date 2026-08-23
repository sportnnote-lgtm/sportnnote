# Cricket — coverage matrix

Litmus: *a scorer can capture a real innings ball-by-ball without hitting a wall.*

## Settings — strong
Presets (T20/ODI/T10/Hundred/Sixes/Box/Test/custom), players-a-side, ball type,
overs, balls-per-over (6/10), powerplay, DLS toggle, tie-break (super over/shared),
impact player. ✅ Rich. `substitutes` field exists but is **not wired** to any action.

## In-match actions
| Action | Needs | App | Verdict |
|---|---|---|---|
| Runs 0/1/2/3/4/6 | ✔ | run pad | ✅ (no `5` button — rare but legal) ⚠️ |
| Wide | ✔ | fixed +1 | ⚠️ no wide+runs / wide+byes / run-out off wide |
| No-ball (+ off-bat runs, free hit) | ✔ | ✔ | ✅ |
| Bye / leg-bye | ✔ | ✔ | ✅ (but not off a no-ball) ⚠️ |
| Wicket: bowled/caught/lbw/stumped/run-out/hit-wicket | ✔ | ✔ (fielder, keeper, batter-out captured) | ✅ |
| Retired hurt / timed out | ✔ | ✔ | ✅ |
| Retired out / obstructing / handled / hit-twice | rare | — | ⚠️ (rare) |
| Penalty runs (5), overthrows, dead ball | ✔ | — | ❌ |
| Striker/non-striker/bowler/keeper/captain setup | ✔ | ✔ | ✅ |
| Impact player sub | ✔ | ✔ | ✅ |
| **Undo / edit / remove a delivery** | ✔ **core** | **NONE** | ❌ **headline gap** |

## Lifecycle
2 innings, auto strike rotation, auto over/innings end, chase auto-settle, DLS
revised target, super over. ✅ Strong. **isComplete** on `ended`.

## Player stats
Only `runs` (striker) + `wickets` (bowler) emitted as attribution; batting/bowling
cards, dismissals, catches, economy computed inside the reducer (not external
stat-lines). ⚠️ Fielding (catches/stumpings/run-outs) not credited to profiles.

## Gaps — prioritised
**Tier 1 — real capture failure:**
1. **No undo / edit / remove of ANY delivery.** Once a ball is tapped it is
   permanent — a mis-tap (wrong runs, wrong wicket) cannot be corrected. Football,
   basketball, kabaddi all have a timeline editor; cricket, the hardest sport to
   score, has none. **Highest-severity gap in the whole app.** Run-out strike-
   crossing is also only "approximated" (scorer can't pick who's on strike after).

**Tier 2 — real but less frequent:**
2. Wide/no-ball combos: byes off a wide, run-out off a wide/no-ball, wide+runs.
3. Penalty runs (5-run), overthrows as runs, dead ball.
4. Fielding stats to profiles (catches/stumpings/run-outs credited).

**Tier 3:** `5` run button; rare dismissals (retired-out, obstructing); DRS.

## Replay log
_(after fixes — drive a real T20 scorecard through the app ball-by-ball.)_
