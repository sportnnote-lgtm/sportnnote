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
**✅ Fixed:**
1. ✅ **Defender / super-tackle points now credit the defender** — the guided raid
   asks "Who made the tackle?" when the raider is out, and credits that defender
   their tackle point (2 for a super-tackle) via the `attribution2` channel. Shows
   on the tacklePoints leaderboard.
2. ✅ **Voice routes through the RAID_OUTCOME engine** — "raid" = a 1-touch raid,
   "tackle" = the named side tackled the opponent's raider; both advance the
   out-count / all-out / do-or-die state instead of the old score-only +1.

**Deferred (Tier 3):**
3. **Technical points** (line-out, technical, all-out-technical) — no event type; rare.
- The in-plugin raid *editor's* remove/re-enter doesn't reverse a defender's tackle
  stat (the global "↶ Undo" bar does, via the stashed `attribution2`). Minor.

`tests/kabaddi.test.mts` covers raid / tackle / super-tackle / do-or-die scoring.

## Replay log
_(after fixes — drive a real Pro Kabaddi match through the app.)_
