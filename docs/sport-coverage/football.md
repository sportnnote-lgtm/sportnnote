# Football — coverage matrix

Litmus: *a scorer can capture a real match without hitting a wall.*

## Settings — strong
Presets (11-a-side/7s/5s/futsal/custom), players-a-side, half length, subs +
rolling/fixed, decider (draw/ET/pens), ET length + extra subs. Plus per-match
**TrackConfig** toggles (which stat buttons show: shots/possession/fouls/cards/
offsides/corners/tackles/interceptions/saves/passes/crosses/dribbles/handball). ✅

## In-match actions — very rich
Goals (scorer→type open/pen/freekick→body part→assist), team goal, own goal,
penalty flow (won-by/taker/scored-saved-missed), shots (on/off/blocked/saved),
crosses, dribbles, corners, passes (complete/misplaced), tackles, interceptions,
saves, attacking/defensive plays, fouls (fouler→victim), offside, handball,
yellow/red (auto 2nd-yellow→red), subs, possession toggle, stoppage time, extra
time, shootout. Voice grammar covers most flows. ✅ Best-covered sport.

## Lifecycle — strong
Halves + ET, manual clock + stoppage, auto clean-sheet award, shootout best-of-5
+ sudden death. **Undo/edit: rich** — UNDO_GOAL, REMOVE_EVENT (event/stat),
backfill, timeline editor. ✅

## Gaps — mostly minor (this sport is in good shape)
**Tier 2:**
1. **Header not offered as a goal type** (`GOAL_TYPES` = open/penalty/freekick);
   headers only captured via body-part, and `GOAL_STAT.header`→openPlayGoals. Minor
   data-quality nit.
2. No throw-in / goal-kick / free-kick-awarded event (corner exists) — possession
   is a manual toggle, so not blocking, but no set-piece count for those.
3. Penalty flow, cross, dribble, handball, possession, stoppage have **no voice
   intent** (buttons only).
4. `CLEAN_SHEET` is dispatched but has no reducer case (no-op; attribution-only).

**Tier 3:** disallowed/offside-ruled-out goal, VAR/review, shootout order.

**Verdict:** football is essentially ground-ready. Low priority for deep work;
revisit headers-as-goal-type + voice-penalty as polish.

## Replay log
_(after fixes — drive a real match report through the app.)_
