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

## Gaps — status (Tier 1+2 SHIPPED)

**Tier 1 — real capture failures — ✅ FIXED:**
1. ✅ **Free throws** — dedicated FT flow: pick shooter, tap ✅ Made / ❌ Miss per
   attempt (1 for and-one, 2 for shooting foul, 3 from the arc). Made FT scores 1 and
   credits points + FTM/FTA; misses log the attempt.
2. ✅ **Foul types** — Personal / Shooting / Technical / Flagrant / Offensive. Shooting/
   technical/flagrant flow straight into the opponent's free throws. Technicals excluded
   from the team-foul bonus.
3. ✅ **Substitutions** — record off→on; optional "set the five on court" enables a live
   on-court list that follows every sub.

**Tier 2 — expected stats — ✅ FIXED:**
4. ✅ **Steal / block / turnover** buttons + stats → BoxScore gains STL / BLK / TO;
   steals & blocks added to profile leaderboards; voice recognises them.
5. ✅ Offensive / defensive **rebound split** (rebound → Off/Def).
6. ✅ **Timeouts** — per-team limit (by format), button shows remaining, disables at 0.

**Tier 3 — deferred (non-essential for manual scoring):**
7. Missed FG attempts / shooting %. 8. **Live shot-clock enforcement** (countdown +
   violations) — heavier real-time build, and the referee's call; shot clock stays a
   reference setting. 9. Game-clock countdown / auto-end, jump ball.

**Engineering:** pure core extracted to `engine.ts` (like cricket/kabaddi) → 13 unit
tests in `tests/basketball.test.mts`.

## Replay log
_Next: drive a real box score / play-by-play through the app together (acceptance test)._
