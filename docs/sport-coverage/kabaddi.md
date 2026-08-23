# Kabaddi — coverage matrix

Litmus: *a scorer can capture a real match without hitting a wall.*

## Settings — strong
Rule-set presets (Pro 2×20 / Circle 2×15 / School 2×10 / custom), players-a-side,
revival style (Sanjeevani/Amar/Gaminee), decider (draw/extra-time+golden-raid/
golden-raid), pro-rules toggle (do-or-die, super-tackle, bonus), subs, half length,
ET length. ✅

## In-match actions — strong
Guided raid (raider → defenders touched 0–5 → bonus Y/N → raider tackled Y/N)
computing net points/outs/revival/super-tackle/all-out/do-or-die via a pure engine;
simple raid/tackle +1; substitutions; on-mat counts; do-or-die banner; golden raid;
timeline editor (edit/remove with raid-aware replay); backfill. ✅

## Gaps — prioritised
**Tier 2:**
1. **Defensive / super-tackle points not attributed to a defender** — added to the
   team score only, so a defender's tackle stats never credit their profile.
2. **Guided raid unreachable by voice** — voice fires only the *simple* +1 raid/
   tackle, which **bypass the out-count/revival engine**, so voice- or team-scored
   points don't advance all-out / do-or-die state. Either route voice through the
   guided outcome or warn that voice is simple-only.
3. **Technical points** (line-out, technical, all-out-technical) — no event type.

**Verdict:** kabaddi is in good shape structurally (the engine is the star). The
real fix is stat attribution for defenders + the voice/simple-raid inconsistency.

## Replay log
_(after fixes — drive a real Pro Kabaddi match through the app.)_
