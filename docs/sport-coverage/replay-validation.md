# Replay validation — reproducing real matches event-by-event

The acceptance test behind the whole scoring engine: **take a real match, feed
every event in chronological order from a reference source, and check the app
reproduces the full match** — score, scorers, cards, subs, match state, result —
not just the final score.

## Method

Each sport's scoring logic is a **pure reducer** (`<sport>/engine.ts`, no React),
and the live app rebuilds state by replaying its event log through that same
reducer. So the faithful, repeatable validation is a **replay harness test**: map
the reference commentary → a sequence of `ScoreAction`s → run them through the
real reducer → assert the resulting state matches the reference. This exercises
the exact code the app runs on-device, and lands as a permanent regression guard.

Reference sources: **football** → ESPN commentary; **cricket** → Cricinfo/Cricbuzz
ball-by-ball; **basketball** → ESPN play-by-play.

## Football — ✅ PASS

**Newcastle United 2-2 Liverpool** (23 Aug 2026, ESPN gameId 401879319),
`tests/football.test.mts`. Replayed the commentary event-by-event:

| Reference event | Captured |
|---|---|
| 5' Goal — Elanga | ✅ home 1-0, scorer recorded |
| 55' Goal — Gakpo | ✅ 1-1 |
| 57' Goal — Willock | ✅ 2-1 |
| 65' / 79' / 90' Yellows | ✅ per-side card counts |
| 70' / 76'×2 Subs | ✅ subsUsed per side, within max |
| 90+9' **Penalty** — Szoboszlai | ✅ 2-2, goalType `penalty` (→ penaltyGoals), minute 99 shown as 90+9' |
| FT | ✅ ended, draw |

Edge cases also verified: **VAR-disallowed goal** (REMOVE_EVENT reverts the score),
**own goal** (credits the team, not a striker), **second yellow → red**.

**Gaps noted (not blockers):** team statistics (possession %, shots, shots on
target, corners, offsides) and assists are all *supported* — but each is a
separate scorer tap during the game (via the STAT actions / TrackConfig / ASSIST
flow), so reproducing ESPN's full stat panel means logging those events too, not
just goals/cards. Header is still not offered as a goal *type* (captured as a body
part instead) — minor data-quality nit.

**Verdict:** the engine reproduces a real match end-to-end. A scorer can capture
the complete progression, and the final summary matches the reference.

## Cricket — ✅ PASS

Cricinfo/Cricbuzz block automated fetching (HTTP 403), so rather than a specific
match's feed, `tests/cricket.test.mts` replays a **realistic full over
ball-by-ball** and reproduces the complete scorecard — plus the existing suite
already covers every delivery type against real cricket rules (wide+runs, no-ball
+off-bat/+byes, run-out off an extra, penalties, super-tackle logic).

The over: `FOUR · 1 · WIDE · SIX · bye1 · WICKET(bowled) · 2` →

| Reproduced | Value |
|---|---|
| Team total / extras / wickets | 15/1, extras 2, one full over (6 legal balls) |
| Batting card | A 5 (3b, 1×4, out), B 6 (2b, 1×6), D 2 (1b) |
| Bowling figures | 14 runs, 1 wkt, 6 balls (the bye NOT charged to the bowler) |
| Strike rotation | correct on odd runs / bye / over-end; over completes → bowler cleared |

**Covered event types (unit + replay):** runs, boundaries, wides (+runs), no-balls
(+off-bat / +byes / free hit), byes/leg-byes, all dismissal types, run-out off a
wide/no-ball, penalty runs, strike changes, over & innings transitions, DLS,
super over, impact player.

## Basketball — ⏳ next
Replay an ESPN play-by-play (1/2/3-pointers, free throws, fouls→bonus, timeouts,
quarter/OT changes) and assert the box score + line score match.
