# Scorer UX audit: athletics and swimming (results entry)

From the SD-109 audit (2026-10-11), read-only. The shared screen is covered in `scorer-ux-audit.md`; the other sports are in `scorer-ux-audit-sports.md`. End / Restart / Reset / Delete are covered by SD-106.

**Shared basis:** `ResultsEventScreen.tsx` has no reopen, no delete-event, and no way to add or scratch an entrant. `resultsStore.ts` `advancePhase` (~245–292) and `completeFinal` (~294) are irreversible, so every lock, and every record written at finish, is permanent.

## Athletics

| Pri | Category | Finding | Where | Fix | Size |
| --- | --- | --- | --- | --- | --- |
| P0 | Accident | The keypad fills from the hundredths, so a hand time "1:05.3" typed as "1053" saves as 10.53. There is no plausibility check per event: an 800 m typed "2153" saves as 21.53 and is flagged as a PB / meet record. | ResultsEventScreen ~513–531; results/athletics.ts ~268–280 | Plausible range per event (e.g. 100 m 9–40 s) with a confirm outside it; in hand mode the last digit means tenths | S |
| P1 | Accident | Close round doesn't count blank rows: athletes with no result silently drop out, and the round can't be reopened | ResultsEventScreen ~188–197; resultsStore ~252–290 | Show "N athletes have no result" in the confirm; organiser "Reopen round" while the next round has no marks | M |
| P1 | Accident | Finish & lock writes records and medal points with no blank warning and no reopen, so a mistyped mark becomes a permanent MR | ResultsEventScreen ~198–210; resultsStore ~294–306 | Warn about blank rows and any new MR; "Reopen final" rolls back the records | M |
| P1 | Accident | Turning on the Hand chip after a time is entered rounds it (10.53 → 10.6) and drops the thousandths; turning it off doesn't restore them | ResultsEventScreen ~534 | Keep the raw mark and derive the hand time, or ask "Re-enter as hand time?" | S |
| P1 | Accident | The DNS / DNF / FS / DQ pills are about 26 pt, right under the time box | ResultsEventScreen ~667–673 | 44 pt targets, or behind a "⋯ Status" chip | S |
| P1 | Accident | Field marks have no plausibility check ("512" in long jump saves 512.00 m). X foul / – pass save in one tap with no undo | ResultsEventScreen ~864–898; marks.ts ~66–70 | Range per event; a 5 s Undo snackbar | S |
| P2 | Accident | One-tap "Reset the jump-off", "They share 1st", and X / – overwriting a valid mark under Edit round | ResultsEventScreen ~1023, 1003, 731 | Confirm sheet | S |
| P2 | Accident | Clearing a time box deletes the mark silently; a heat wind of "12" saves as 12 m/s | ResultsEventScreen ~520, 461 | Confirm when clearing; reject wind > 9.9 ("did you mean 1.2?") | S |
| P1 | Detail | Photo-finish thousandths can't be typed: the number-pad has no "." on iOS, and "10853" reads as 1:08.53 | ResultsEventScreen ~532 | A ".000" chip, or decimal-pad when the meet has photo-finish timing | S |
| P2 | Detail | No lap counter / bell for 800 m+, no splits | — | Lap counter chip; optional leader splits | M |
| P2 | Detail | Foul reason isn't recorded | ResultsEventScreen ~897 | Long-press X to pick a reason (`Attempt.reason`) | S |
| P2 | Detail | No warning when field wind is left blank; reaction time is shown for 800 m+ | ResultsEventScreen ~890, 413 | Hint; reaction time only for races ≤ 400 m | S |
| P1 | Flow | No return key on the iOS keypad, no auto-move to the next lane, no "Next heat" | ResultsEventScreen ~531, 318 | "Next ›" accessory; "Next heat →" button | S |
| P1 | Flow | No finish-order mode (school meets place first, time only some) | ResultsEventScreen ~376–428 | "Enter by finish order" mode, times optional | M |
| P2 | Flow | Can't add a late entrant or scratch after setup; can't delete an event | AthleticsHub ~64–82 | "＋ Add athlete" at the start-list stage; "Delete event" behind a confirm | M |
| P2 | Flow | Ties at the Q/q line all go through, with no lanes warning; the swim-off UI exists only for swimming | progression.ts ~36–54 | Warn when qualifiers exceed lanes; "Draw lots" (TR 21.3) | S |
| P1 | Rules | Road / XC with team scoring; combined events | SD-92, SD-93 | — | M |
| P2 | Rules | Steeplechase, 60 mH, race walks; per-athlete TJ board; vertical qualification stops; heats split by team; historic school records | PROGRESS | — | S–M |

## Swimming

| Pri | Category | Finding | Where | Fix | Size |
| --- | --- | --- | --- | --- | --- |
| P0 | Accident | Same keypad and range issue: "5832" saves as 58.32, and a 200 m typed "2153" saves as 21.53 with an MR flag | ResultsEventScreen ~513–526 | Plausible range per event and course, with a confirm outside it | S |
| P1 | Accident | Close / finish don't warn about blank rows and can't be reopened | ResultsEventScreen ~188–210; resultsStore ~245–306 | As athletics | M |
| P1 | Accident | Watches and the time box both set the mark; watches silently overwrite a typed time | ResultsEventScreen ~407–409, 563–567 | With manual timing on, watches are the only input and the official time is read-only | S |
| P2 | Accident | DNS / DQ pills are ~26 pt; DQ can be saved without a reason | ResultsEventScreen ~618–640 | 44 pt; require a reason (or flag "DQ – no reason") | S |
| P2 | Accident | One bad split blocks saving all of them; leaving the screen loses them | ResultsEventScreen ~584–587 | Save the valid prefix, mark the bad box | S |
| P2 | Detail | Short course has only 50 m splits (no 25 m) | results/swimming.ts ~346–352 | 25 m splits for SCM (optional) | S |
| P2 | Detail | No relay exchange times; lead-off leg not credited as a PB | PROGRESS | Exchange field per leg when reaction times are on; credit the lead-off | M |
| P2 | Detail | No lap board for 800 / 1500 m | — | "Laps left" chip | S |
| P2 | Detail | No hint on a negative reaction time | ResultsEventScreen ~551 | Suggest DQ SW 4.4 | S |
| P1 | Flow | Splits on by default: a 1500 m card shows 29 boxes per swimmer | sports/swimming/index.tsx ~64 | Default off, or collapse behind "＋ Splits" | S |
| P1 | Flow | Same iOS keypad / next-lane friction as athletics | ResultsEventScreen ~531 | As athletics | S |
| P2 | Flow | No late add / scratch, no delete event | AthleticsHub ~64 | As athletics | M |
| P2 | Rules | Per-leg stroke DQ check, 800 / 1500 lane 0 / 9 ties, school programme to confirm | PROGRESS | — | S |
