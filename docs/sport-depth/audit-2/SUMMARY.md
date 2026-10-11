# Audit 2 summary: remaining gaps across all 24 sports (2026-10-11)

Seven read-only auditors checked every sport against its federation's standard in five areas: scoring and rules, match stats, careers and leaders, tournaments, and scorer safety. A cross-sport auditor checked the shared platform. Known leftovers from PROGRESS "Not done" lists are folded in and tagged "known". Rule details the auditors couldn't confirm are marked "verify" in each file.

Priority:
- **P0:** wrong result, data loss or a dead end.
- **P1:** an organiser or scorer will hit it soon.
- **P2:** depth or polish.

| Group | File | P0 | P1 | P2 |
|---|---|---|---|---|
| Cricket | cricket.md | 2 | 5 | 27 |
| Football, hockey, handball, basketball | invasion.md | 4 | 12 | 25 |
| Volleyball, kabaddi | volleyball-kabaddi.md | 0 | 6 | 29 |
| Racket (6 sports) | racket.md | 0 | 14 | 38 |
| Chess, carrom, golf | chess-carrom-golf.md | 2 | 13 | 31 |
| Measured / timed (8 sports + meet engine) | measured.md | 0 | 31 | 38 |
| Cross-sport platform | cross-sport.md | 1 | 14 | 21 |
| **Total** | | **9** | **95** | **209** |

## Overall picture

- Scoring engines and match stats are at or close to federation standard in every sport. Cricket is the deepest; the racket sports, volleyball and kabaddi have no P0s.
- The P0s cluster in one place: what happens around a match at the edges of a tournament. That covers knockouts that end level, two-legged ties, deciders applied at the wrong stage, rain-shortened chases and medal placements.
- The measured sports score correctly. Their gaps are meet management: entries and scratches, timetables, printable sheets, record-book safety and team events.
- Event sports and golf stroke play are deep inside their own screens but sit outside the shared platform: follower result alerts, team pages, head-to-head and officials.

## The 9 P0s (8 fixes)

| # | Sport | Gap | Size |
|---|---|---|---|
| 1 | Hockey + handball | The decider isn't stage-aware. A tournament-wide shoot-out or extra-time decider also hits group draws, so the winner takes a full win. With no decider, a knockout can end level and stall. Football already strips the decider in groups; generalise it. | S |
| 2 | Football / handball / basketball | Two-legged aggregate ties: a level aggregate when leg 2 wasn't drawn gives the tie to the leg-2 winner. The fix is to send it to extra time and penalties (or 7 m, or overtime). | M |
| 3 | Basketball | Foul-out and ejection are matched by player name across both teams. Same-name players on opposite sides block each other's baskets and disqualifications. | S |
| 4 | Cricket | A chase stopped by rain after the minimum overs can't be decided on DLS par (ICC). The guide wrongly says to record a no result. | M |
| 5 | Cricket | A tied knockout can be closed as a tie with no Super Over, and the bracket stalls. | S |
| 6 | Chess | A drawn knockout game has no winner, so the bracket stalls. There is no mini-match, rapid/blitz or Armageddon tie-break, no arbiter pick, and a 2-2 team knockout also stalls. | M |
| 7 | Golf | A course can't be edited after creation. A wrong par, stroke index, rating or slope corrupts every round played on it. | M |
| 8 | Cross-sport | Medal table: a match sport's places come from one flat league over all matches, ignoring groups and the knockout, so gold can go to a team that lost the final. Take places from the bracket and groups, and add a "medals first" option. | M |

Common thread for #1, #5 and #6, plus the levels in #2: one shared rule is needed. "A knockout must produce a winner" should be enforced in every sport, with the bracket refusing to stall and offering an organiser "advances" pick as a last resort.

## Top P1s by theme

- **Brackets and seeding (cross-sport, racket):** standard seeding from groups (1 and 2 can't meet in the semis), seeded straight knockouts, best-placed qualifiers on a per-game basis for unequal groups, and double elimination with plate/consolation draws (pickleball, school racket events).
- **Meet management (measured):**
  - Entries: late add, scratch, delete event, a meet entries matrix with per-athlete caps, and bulk add.
  - Schedule and sheets: day/session/time timetable for multi-day meets, printable/PDF start lists and results.
  - Record book: safe concurrent writes, retry on failed stat-line saves, and loading a school's existing record board.
  - Eligibility and outputs: age on 31 Dec, category and individual champions, per-event officials (hostIds), and follower alerts for finals and records.
- **Event sports in the platform (cross-sport):** result alerts to followers, team/house pages, athlete profile header (not Apps / W-D-L), and team events (archery, shooting, cycling team pursuit/sprint, mixed relays).
- **Discipline + forfeits for every sport:** extend SD-70 suspensions beyond football; walkover scores per federation (FIFA 3-0, FIBA 20-0, FIVB 0-3 / 0-25; hockey and handball to verify); volleyball forfeits in standings.
- **Clocks:** a stoppable game clock for basketball, futsal and 3×3 (minutes, +/-, last-2-minutes timeout cap, futsal accumulated fouls, 3×3 10-minute limit).
- **Cricket:** stat sync for matches ended by hand; exact rain cut in innings 1; live DLS par in the chase; full DLS table (founder research); wagon wheel and shot type.
- **Chess:** Swiss withdrawals and late entries; a cancelled game blocks the next round; team-Swiss bye points; round results sheet; category prizes.
- **Golf:** course editor with several tees and the WHS mixed-tee adjustment; divisions within one field.
- **Racket:**
  - Team-tie dead-rubber default by stage, and captain-entered lineups (RLS).
  - Pickleball change-ends cue, and the rally-doubles server identity (verify).
  - Squash Stroke / No let outside point detail, plus the 90 s cue.
  - Tennis ITF doubles preset and the DF box column.
  - Padel false-zero detail and 1st-serve tracking.
- **Volleyball / kabaddi:** kabaddi touches above 5; kabaddi presets (super tackle under AKFI); volleyball 9-a-side court size and sub limit from the format; FIVB beach standings preset.
- **Live-scoring consistency:** hockey backfill bar; voice "full time" without a confirm (football); cricket Undo label; carrom and golf records hooks; leader splits beyond cricket; voice for hockey, handball, carrom and golf.

## Proposed waves (for founder approval)

- **Wave A, the 8 P0 fixes:**
  - one "knockout must produce a winner" rule across sports (#1, #2, #5, #6 plus an organiser override);
  - basketball side-aware fouls (#3);
  - cricket DLS par result (#4);
  - golf course editor (#7);
  - medal table from brackets (#8).
  - Size: about 3–4 parallel agents. Most are S/M.
- **Wave B, tournament correctness:** bracket seeding, double elimination and plate draws, discipline and forfeit scores for every sport, and team-tie defaults.
- **Wave C, meet management:** entries/scratch/late add, timetable plus printable PDFs, record-book integrity, championships and officials, and event sports in alerts, team pages and profiles.
- **Wave D, sport depth:** stoppable clocks, cricket rain and wagon wheel, chess Swiss operations and categories, golf tees and divisions, racket and volleyball/kabaddi P1s, and the consistency sweep.
- **Rest:** P2 depth, picked per sport after A–D.
