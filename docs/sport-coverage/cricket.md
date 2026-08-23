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
| **Undo a delivery** | ✔ **core** | ✅ global "↶ Undo last ball" bar (LiveScoringScreen) — pops the last event, reverses its stat line, replays the log; tap repeatedly to rewind | ✅ |
| Edit an arbitrary past ball in place | nice | undo walks back step-by-step (no surgical edit like football/basketball) | ⚠️ |

## Lifecycle
2 innings, auto strike rotation, auto over/innings end, chase auto-settle, DLS
revised target, super over. ✅ Strong. **isComplete** on `ended`.

## Player stats
Only `runs` (striker) + `wickets` (bowler) emitted as attribution; batting/bowling
cards, dismissals, catches, economy computed inside the reducer (not external
stat-lines). ⚠️ Fielding (catches/stumpings/run-outs) not credited to profiles.

> **Correction (2026-08-24):** the audit inventory (plugin files only) claimed
> cricket had NO undo. That was wrong — the global "↶ Undo last ball" bar in
> LiveScoringScreen pops the last event and replays for every sport, cricket
> included. Undo works; only surgical arbitrary-ball *editing* is absent (rare).

## Gaps — prioritised
**Tier 1 — real capture failures (wrong score on the board):**
1. ✅ **Wide + runs** (byes run on a wide / wide to the boundary) — SHIPPED. Was a
   fixed +1; now `Wide +1..+4`.
2. ✅ **Byes off a no-ball** (batsmen run without hitting) — SHIPPED. No-ball now
   captures off-bat runs AND byes separately.

**Tier 2 — SHIPPED:**
3. ✅ **Run-out off a wide / no-ball** — a wicket on a non-legal delivery: the over
   doesn't advance, the +1 penalty applies, completed runs count (extras on a wide,
   off-bat on a no-ball). Entry point in the Wide/No-ball panels ("…or a RUN OUT").
4. ✅ **Penalty runs** — a "⚖️ Penalty +5" button adds 5 to the batting side as extras.
5. ✅ **Fielding stats to profiles** — catches / stumpings / run-outs now credit the
   fielder (via a new 2nd-attribution channel, `attribution2`, reversed on undo).
   Catches added to the cricket leaderboards.

**Tier 3 (remaining):** overthrows as a distinct concept, dead ball; run-out
strike-crossing still "approximated" (scorer can't pick who ends on strike); `5`
run button; rare dismissals (retired-out, obstructing); DRS.

## Replay log
_(after fixes — drive a real T20 scorecard through the app ball-by-ball.)_
