# Racket & net sports — coverage matrix (badminton, tennis, volleyball, padel, pickleball, squash)

Litmus: *a scorer can capture a real match without hitting a wall.* These sports
share a rally/point core, so they're audited together; the scoring **systems**
(sets/games/deuce/golden point/side-out) are all correctly modelled — the gaps are
in **corrections (undo), stats, and serve tracking**, not the score math.

## Scoring systems — ✅ correct across the board
- **Badminton**: 21-point rally, cap 30, golden point at 29-29, bo3/bo5/single. ✅
- **Tennis**: 0/15/30/40/deuce/ad, no-ad, set tiebreak + champions' 10-pt match TB,
  bo3/bo5, deciding-set rules, pro-set. ✅ (has ACE action + stat)
- **Volleyball**: bo5, 25/decider-15, win-by-2, indoor/beach/9s. ✅ (has ACE)
- **Padel**: advantage/golden point (WPT), 6/4 games, match-TB decider. ✅
- **Pickleball**: rally OR side-out scoring, serve 1/2 handout, to 11/15/21. ✅
- **Squash**: PAR-11 / English hand-out to 9, bo5/bo3. ✅

## Gaps by theme

### 1. Undo / timeline editor — the split that matters
> **Correction (2026-08-24):** every sport has the global "↶ Undo" bar
> (LiveScoringScreen) that pops the last event and replays — so padel/pickleball/
> squash CAN undo a mis-tap. The split below is about the richer *surgical*
> in-plugin editor (edit/insert an arbitrary past point), not undo.

| Sport | Global undo | Surgical `RallyPointEditor` |
|---|---|---|
| Badminton, Tennis, Volleyball | ✅ | ✅ remove/edit/insert |
| **Padel, Pickleball, Squash** | ✅ | ❌ (rallyCore ignores `EDIT_LOG`/`STAT_ADJUST`) |

**Tier 2 fix (downgraded from Tier 1):** wire `RallyPointEditor` into padel/
pickleball/squash (rallyCore) for parity — arbitrary-point edit. Undo already works,
so this is polish, not a capture failure.

### 2. Per-player box score
Badminton/tennis/volleyball emit `kind`/`set`/`points` → box score. **Padel,
pickleball, squash emit none → no per-player stats at all.** Tier 2.

### 3. Aces / faults / errors
- ACE exists only in **tennis & volleyball** (buttons). But **`pointVoice` always
  emits `POINT`** — so even there, a spoken "ace" logs as a plain point, and the
  ace button is the only way. Tier 2: make voice emit ACE where it exists.
- **Double faults** (tennis) — no action/stat. **Blocks/errors** (volleyball) —
  none. **Kitchen faults** (pickleball), **lets/strokes** (squash) — none. Tier 2/3.

### 4. Serve / rotation tracking
- Serve tracked only in rallyCore **side-out/English** mode (pickleball/squash).
- Tennis/badminton/volleyball/padel track **no server** → so tennis **break points
  can't be detected**, badminton has no service-court, volleyball no rotation/libero,
  no timeouts anywhere. Tier 2/3 (serve tracking is a bigger build; not capture-
  blocking for a basic scorer).

## Prioritised — status
**✅ SHIPPED (this pass):**
- **Voice → ACE** for tennis & volleyball (a spoken "ace" was logged as a plain
  point, losing the stat). Volleyball voice also does "block".
- **Volleyball blocks** — a `🧱 Block` capture (a winning block = a point + a block
  stat); new BLK box-score column + leaderboard. The point-editor + EDIT_LOG replay
  were taught the `block` kind so a block survives an unrelated correction (guarded
  by `tests/rallyEdit.test.mts`).

**Deferred:**
- **Tennis double faults** — a DF scores the *opponent*, which breaks the rally-
  editor's "a point's side is who won it" invariant (would double-count on replay).
  Needs serve tracking or a model change; deferred rather than ship a replay bug.
- **Box scores** for padel/pickleball/squash (points already reach profiles via
  stat lines — polish).
- **Surgical point-editor** for padel/pickleball/squash (global undo already covers
  corrections).
- Serve/rotation tracking, timeouts, libero, lets/strokes, kitchen faults (Tier 3).

## Replay log
_(after fixes — one real match per sport from a published scorecard.)_
