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
| Sport | Editor? |
|---|---|
| Badminton, Tennis, Volleyball | ✅ full `RallyPointEditor` (remove/edit/insert) |
| **Padel, Pickleball, Squash** | ❌ **none** — no undo, no correction |

**Tier 1 fix:** wire `RallyPointEditor` into padel/pickleball/squash (rallyCore).
A mis-tapped point is currently uncorrectable in those three. rallyCore's reducer
ignores `EDIT_LOG`/`STAT_ADJUST` — needs the same replay path the others use.

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

## Prioritised
**Tier 1:** undo/timeline editor for **padel, pickleball, squash** (parity with the
other three — uncorrectable mis-taps today).
**Tier 2:** box scores for padel/pickleball/squash; voice→ACE for tennis/volleyball;
double-faults (tennis); blocks (volleyball).
**Tier 3:** serve/rotation tracking, timeouts, libero, lets/strokes, kitchen faults.

## Replay log
_(after fixes — one real match per sport from a published scorecard.)_
