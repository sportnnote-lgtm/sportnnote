# Basketball — coverage matrix

Litmus: *a scorer at a school/college game can capture everything that happens.*
`Needs` = what a real game requires (specialist). `App` = what the plugin does today.

## Settings

| Setting | Needs | App | Verdict |
|---|---|---|---|
| Format presets (FIBA/NBA/NCAA/3×3/street/school) | ✔ | rich preset field | ✅ |
| Players per side | ✔ | count 1–11 | ✅ |
| Quarters vs halves + length | ✔ | `regPeriods` + `periodMinutes` | ✅ |
| Overtime length | ✔ | ✔ | ✅ |
| Fouls to foul out | ✔ | ✔ | ✅ |
| Team fouls → bonus | ✔ | ✔ | ✅ |
| Timeouts per team | ✔ | — | ❌ |
| Shot clock | reference ok | setting only, not enforced | ⚠️ (ok) |

## In-match actions

| Action | Needs | App | Verdict |
|---|---|---|---|
| Made 2 / made 3 | ✔ | `+2` / `+3` → SCORE | ✅ |
| **Free throw made / missed** | ✔ core | only a `+1` button in bonus, logged as a generic basket | ❌ **headline gap** |
| **And-one (basket + 1 FT)** | ✔ | — | ❌ |
| **Shooting foul → N free throws** | ✔ core | foul is generic, never opens an FT | ❌ |
| Personal (non-shooting) foul | ✔ | generic `FOUL` | ✅ |
| Technical foul (→ 1 FT + poss.) | ✔ | — | ❌ |
| Flagrant foul | ✔ | — | ❌ |
| Team-foul bonus / foul-out | ✔ | computed | ✅ |
| Rebound (off / def split) | ✔ | `REBOUND`, no split | ⚠️ |
| Assist | ✔ | ✔ | ✅ |
| Steal | ✔ | type exists, no button | ❌ |
| Block | ✔ | type exists, no button | ❌ |
| Turnover | ✔ | — | ❌ |
| Substitution (who's on court) | ✔ | `substitutes` setting but no sub action | ❌ |
| Timeout | ✔ | — | ❌ |
| Missed FG / shooting % | nice | — | ⚠️ (later) |
| Jump ball / possession arrow | minor | — | ⚠️ (later) |

## Lifecycle

| | Needs | App | Verdict |
|---|---|---|---|
| Start / advance period | ✔ | KICKOFF / NEXT_QUARTER | ✅ |
| Overtime / draw | ✔ | START_OVERTIME / END-draw | ✅ |
| Undo / remove event | ✔ | REMOVE_EVENT reverses score+stat | ✅ |
| Edit a past event | ✔ | remove-and-re-enter | ✅ |
| Backfill a missed play | ✔ | per-quarter backfill | ✅ |
| Game clock countdown / auto-end | expected | manual count-up only | ⚠️ (ok for manual) |

## Player stats
PTS / REB / AST / PF ✅ · STL / BLK / TO ❌ (scaffolding half-present).

## Gaps — prioritised

**Tier 1 — real capture failures (a scorer WILL hit these in a normal game):**
1. **Free throws.** No proper made/missed FT. A shooting foul (→2 FTs), an and-one
   (make + 1 FT), and technical FTs cannot be scored correctly. Today a made FT is
   indistinguishable from a field basket, and only appears in bonus. **This is the
   #1 fix** — free throws are routine, not an edge case.
2. **Foul types.** One generic foul can't distinguish a **shooting foul** (opens the
   FT flow) or a **technical/flagrant** (→ FTs + possession). Needed for #1 to work.
3. **Substitutions.** A `substitutes` setting exists but no way to record a sub or
   know who's on court. Real games sub constantly.

**Tier 2 — expected stats, not capture-blocking (cheap; scaffolding exists):**
4. **Steal / block / turnover** buttons + stats (`steal`/`block` types already in
   `BB_META`, just unwired) → BoxScore gains STL / BLK / TO.
5. Offensive / defensive **rebound split**.
6. **Timeouts** — track & show remaining per team.

**Tier 3 — polish (non-essential for manual scoring):**
7. Missed FG attempts / shooting %. 8. Shot-clock & game-clock countdown, jump ball.

## Replay log
_(to fill after fixes — drive a real box score / play-by-play through the app.)_
