# Scorer UX audit (SD-109): partial, generic section only

Status: **PARTIAL.** Only the shared live-scoring screen has been audited so far. The per-sport sections were assigned to background audits that had not reported back when this file was written, so they still need to be done.

In progress elsewhere, not repeated here:
- **SD-106**: End, Restart, Reset and Delete move to the bottom of the screen, each behind a confirm sheet.
- **SD-107**: optional "how was the point won" detail for racket sports.

## Generic findings (every sport): src/screens/LiveScoringScreen.tsx, src/data/useLiveMatch.ts

| # | Cat | P | Finding | Cite | Proposed fix | Size |
|---|---|---|---|---|---|---|
| G1 | 1 | P0 (SD-106 scope) | Root cause of the tennis near-miss. The Undo bar, Edit-past-ball, strike card, Restart and End are all placed between the scoreboard and the scoring controls. Undo and Restart use the same tile style (`undoBtn` and `restartBtn` are identical apart from Restart's red border). | LiveScoringScreen.tsx:2136-2140, 2529-2541 | SD-106 handles this. Check that Undo stays next to the controls and that no tile shares its shape with a destructive one. | — |
| G2 | 1 | P1 | "↺ Not started? Cancel" wipes the match with one tap and no confirm, because nothing has been scored yet. It still resets the status and the kickoff time. | LiveScoringScreen.tsx:968-972 | Add it to the SD-106 confirm sheet, or make it a light confirm. | S |
| G3 | 1 | P1 | Walkover buttons act on the first tap. Tapping a team name in End → 🏳 Walkover, or on the Info tab, calls `walkoverMatch` and leaves the screen straight away, with no YES/NO step. | LiveScoringScreen.tsx:1009-1010, 1763-1764 | Pick the winner first, then confirm ("Award walkover to X?"), as SD-106 does. | S |
| G4 | 1 | P1 | The tap that wins the match finishes it at once and sends the "Full time" push to followers. Undo can rewind the score but cannot recall the push. The first scored tap also sends "is live". | useLiveMatch.ts:289-296 | When the last point would end the match, show a "Match point won: confirm result?" sheet, or hold the result push for about 60 s and cancel it if Undo is pressed. | M |
| G5 | 1 | P2 | "Discard" for rejected unsynced taps has no confirm. | LiveScoringScreen.tsx:2108-2110 | Confirm, and show the number of taps that will be lost. | S |
| G6 | 3 | P1 | Nothing keeps the screen awake while scoring: there is no `expo-keep-awake` in package.json or src. The phone locks between points or overs. | package.json | Call `useKeepAwake()` while `canScore && started && !complete`. | S |
| G7 | 3 | P2 | Scoring taps give no haptic feedback, so a scorer looking at the play cannot tell the tap registered. | package.json (no expo-haptics) | Add a light haptic on dispatch and a different pattern on Undo. | S |
| G8 | 3 | P2 | Quick options does not offer Undo or End. It is reached only by scrolling below the controls, which is acceptable once SD-106 lands. | QuickOptionsSheet.tsx:57-65 | Leave as is. Revisit after SD-106. | — |

## Per-sport sections: TODO

Cricket; football, hockey and basketball; volleyball, kabaddi, carrom, chess and golf; the racket sports (tennis, badminton, TT, squash, padel, pickleball); athletics and swimming. Each needs the four categories (accidental action, scorer detail, flow friction, rule coverage), with P0/P1/P2 ratings and file:line citations.

## Proposed BACKLOG rows (generic only, so far)

| # | Item | Scope | Size |
|---|---|---|---|
| SD-110 | Scoring safety extras beyond SD-106: confirm for "Not started? Cancel", walkover and Discard; screen stays awake while scoring; haptic on taps | generic (LiveScoringScreen.tsx, package.json) | S |
| SD-111 | Match-ending tap: a confirm sheet, or a delayed result push that Undo cancels | generic (useLiveMatch.ts, LiveScoringScreen.tsx) | M |
