# Audit 2: mind and target sports (chess, carrom, golf)

Read-only gap audit, 2026-10-11, done after the depth programme shipped (SD-07/10, 26, 36, 37, 42, 45, 48, 49, 66–68, 76–78, 84–89, 116, 117c, 119).

**Sources read:**
- `docs/sport-depth/` (PLAN, BACKLOG, PROGRESS, chess.md / carrom.md / golf.md, scorer-ux-audit-sports.md) and the top of DEVLOG;
- the code in `src/sports/{chess,carrom,golf}/*`, `src/data/{swiss,swissField,swissTiebreaks,standings,series,teamTie,bracket,chessRatings,chessCrosstable,golf,golfLeaderboard,golfLeaders,golfTeams}.ts`, and `src/screens/{GenerateFixtures,GolfRoundSetup,GolfRound,Bracket}Screen.tsx`.

**Conventions:**
- **Priority:** P0 = wrong result, data loss or a dead end; P1 = a real organiser or scorer will hit it soon; P2 = depth or polish.
- **"known: PROGRESS SD-xx"** = the gap was already listed in a Check or Not-done list. It is collected here, not rediscovered.
- **"verify"** = a rule detail I could not confirm against the rulebook text.

---

## 1. Chess (FIDE Laws, C.04 Swiss, C.07 tie-breaks, B.02 ratings; decision D7)

**Strengths:**
- The result-only record covers 18 FIDE methods, including Art. 6.9, the 5-fold / 75-move rules, dead position, adjudication, the arbiter's decision and the 0-0 double forfeit. Each game also records colour, move count, clock time left and the exact time control.
- Recording a result needs a confirm sheet (1-0 / ½-½ / 0-1, White first), and the paired colour is locked.
- Swiss pairing is a colour-aware Dutch approximation.
- Tie-breaks follow C.07-2023: BH, Cut-1 and Median, SB, PS, BPG, BWG, WIN and WON, with unplayed-round rules.
- Bye points default to 1, with ½ or 0 as options.
- Players have a crosstable / wall chart, ratings, rating-seeded round 1, ARO / TPR, and a career with score %, colour and time-control splits, wins by method and unbeaten run.
- Team matches can be played as 4 or 6 boards with ½-point rubbers.

### 1.1 Scoring and rules

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| **P0** | Scoring / KO | **A drawn knockout game is a dead end.** A ½-½ result gives the match no winner, so the bracket never advances. There are no mini-match games, no rapid/blitz tie-break games, no Armageddon (where a draw counts as a win for Black), and no "arbiter: X advances" pick. The only workaround is a fake decisive result such as "Arbiter's decision" (verify whether scheduling a replay fixture in the same stage would pair). | `src/data/bracket.ts:285`, `src/screens/BracketScreen.tsx:196`, `src/sports/chess/engine.ts:109-123` | A chess KO tie made of N classical games, then tie-break stages, then Armageddon (draw = Black wins). Short term, add an arbiter "advances" pick on a drawn KO game. | M | known: PROGRESS SD-117 remaining ("chess mini-match/Armageddon"); FIDE World Cup regs |
| P1 | Scoring | **A drawn team KO (e.g. 2-2 on 4 boards) also has no winner.** The series is marked `drawn` and nothing decides it: no board-count tie-break and no Berger / board-elimination rule. | `src/data/series.ts:56-90` | Add a tie-break rule per tie spec (board count from board 1 down, then a blitz match), chosen by the organiser. | S | known: PROGRESS SD-48 ("chess KO board count is a house choice"); verify |
| P2 | Rules | The colour lock applies to every game, because the plugin can't see `config.white`. An unpaired friendly therefore still needs "Change…" to swap colours. | `src/sports/chess/index.tsx:65,109-121` | Pass `config.white` presence to the controls; lock only paired games. | S | known: PROGRESS SD-116 |

### 1.2 Match stats and box score

At the standard for a result-only sport: score, method, colour, moves, clock left and time control. A PGN / scoresheet attachment is the only missing item.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Match | No PGN paste, scoresheet photo, ECO code or opening name. | not found | Optional PGN paste after the game; read-only moves; ECO taken from the PGN. | M | CH-09 (parked) |
| P2 | Match | The share text still says "Home has White" instead of the player's name. | `src/sports/chess/index.tsx:196` (`summary.detailLine`) | Use `whiteLine()` names in the share text. | S | known: PROGRESS SD-85 |

### 1.3 Player career and leaders / awards

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Leaders | The leaders' "Score" and the Player of the Tournament count wins + ½ draws only. Forfeit wins and bye points are left out, so the MVP can disagree with the table (the copy admits this). | `src/sports/chess/stats.ts:62,89-93` | For chess, rank the MVP by standings points plus the event's tie-break chain. | S | C.07 (table = official rank) |
| P2 | Leaders | No Performance-rating leader and no TPR on the profile filter. A stale comment says ratings are "not stored yet". | `src/sports/chess/stats.ts:87-88` | Add a TPR leader (min games) and a TPR row per event on the career. | S | known: PROGRESS SD-85 |
| P2 | Awards | No category prizes inside one event: best U-9 / U-11 / U-13, best girl, best unrated, rating bands. These are standard in Indian open and school events. | not found (`src/core/divisions.ts` has AGE_GROUPS, unused here) | Add a prize-category filter on the rank list (age / gender / rating band) and award slots per category. | M | CH-12 remainder |
| P2 | Player | No estimated rating change per event (FIDE K-factor), and titles are not used in seeding. | `src/data/chessRatings.ts` (no Elo change); `src/screens/GenerateFixturesScreen.tsx:241-258` | Add an unofficial Δ-rating per event (B.02, K 40/20/10), and title-then-rating seeding. | S | known: PROGRESS SD-98 (titles in seeding); FIDE B.02 |
| P2 | Data | There is no SQL backfill for double forfeits. Re-running migration 0050 would mark them D/D. | migration 0050 backfill | Add a guard clause to the backfill (`method = 'double-forfeit'` → L/L). | S | known: PROGRESS SD-98 |

### 1.4 Team and tournament

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Swiss | **No withdrawals or absences.** The next round pairs everyone who ever appeared in the Swiss. A player who left is paired again and needs a forfeit each round. Removing a draft pairing (✕) leaves both players unpaired, with no re-pair. | `src/screens/GenerateFixturesScreen.tsx:234-237,307,651`; `src/data/swissField.ts:20-23` | Add a per-entrant "withdrawn" / "absent round N" list that the pairing skips. Record a zero-point bye, which `swissTiebreaks` already models as `absent`/`zpb`. | M | FIDE C.04.1, C.07 16 |
| P1 | Swiss | **No late entries after round 1.** The field is the set of ids already in Swiss fixtures, so a player who arrives late can't join round 2. | `src/data/swissField.ts:20-23`; `GenerateFixturesScreen.tsx:234-237` | "Add entrant" before round N, with 0 points (or organiser-set ½ for missed rounds counted as zpb / hpb). | S | C.04 (late entries) |
| P1 | Swiss | **A cancelled game blocks the next round.** `swissAllDone` requires every Swiss fixture, cancelled ones included, to be completed, while the field excludes cancelled games. | `src/screens/GenerateFixturesScreen.tsx:233` vs `swissField.ts:17` | Ignore `status === 'cancelled'` in `swissAllDone`. | S | code bug |
| P1 | Team Swiss | **Team Swiss loses its bye.** `createTeamTie` is called without `d.byes`, so the team sitting out gets no match points. Board colours are fixed by board index (W on 1 and 3), not by the team's Swiss colour preference. Whether `swissField` scores tie points or rubbers in a team Swiss is unverified. | `src/screens/GenerateFixturesScreen.tsx:341-347`; `src/data/teamTie.ts:209` | Pass the byes into the tie, allocate colour per team (C.04 team rules), and add a test of a 5-team Swiss of ties. | M | verify; FIDE Olympiad pairing rules |
| P1 | Swiss UX | **No round-results sheet.** In a 40-board open, the arbiter must open each game to enter 1-0 / ½ / 0-1. | not found | "Round N results": one row per board with 1-0 / ½ / 0-1 / +/− / 0-0 chips and one confirm, written through the same RESULT action. | M | practicality (arbiter workflow) |
| P2 | Swiss | No board numbers on the pairing list, and no shareable pairing sheet for the notice board. | `src/screens/GenerateFixturesScreen.tsx:638-652` | Number the boards (by score group, then rank) and add "Share pairings" text / image. | S | C.04 practice |
| P2 | Swiss | Requested ½-point and 0-point byes can't be recorded, though the tie-breaks support them. | `src/data/swissTiebreaks.ts:33-36,91-92` | Add a "requested bye" per entrant per round (organiser sets ½ or 0). | S | C.04.1, C.07 16.2 |
| P2 | Swiss | No accelerated (Baku) pairing and no full C.04.3 quality criteria (float history, top-scorer exceptions). | `src/data/swiss.ts:25-27` | Add Baku acceleration for fields of 60+. Full C.04.3 / TRF import stays under D7. | M | known: PROGRESS SD-26; CH-10 |
| P2 | Tie-breaks | **Round-robin default order (verify):** the app uses SB, wins, direct encounter. C.02 13.16.3 is believed to recommend DE, WIN, SB, Koya. Koya is not implemented, and ARO is not offered as a tie-break. | `src/data/standings.ts:412-413` | Confirm the order, add Koya and ARO as tie-breakers. | S | verify C.02 13.16.3; known: PROGRESS SD-98 (ARO) |
| P2 | Team | Team tie-breaks are simplified (no Olympiad-SB), and team page averages leave out rubber lines. | `src/data/teamTie.ts` | Add an Olympiad SB tie-breaker for team events. | S | known: PROGRESS SD-48 |

### 1.5 Scorer UX and safety

At the standard. The result needs a confirm sheet, the colour is a draft until Record, the 60-s held result has an Undo (SD-111), and the result tiles are 84 px tall in three columns at 375 px. The arbiter-side gaps are listed in 1.4: the round sheet and withdrawals.

---

## 2. Carrom (ICF Laws; AICF follows them)

**Strengths:**
- The ICF engine is replay-checked: 25 points or 8 boards, a tie-break board when level, the Queen worth +3 only below 22 and only when the winner covered it, and the game written at 25.
- The toss and the alternating break are recorded, and the slam (White or Black) is derived from the breaker.
- Optional records: the Queen three-way chip, penalty boards, and a board editor that replays the boards (EDIT_LOG) with STAT_ADJUST.
- No default coin count is selected (SD-116), and the Record button says when a board wins the game or the match.
- The ICF score sheet is shown, and every player has a line with `statTotals`.
- The career covers games W-L, board %, points per board, slams, 25-0 games, own-break win %, and Queens lost.
- Standings use the points-difference tie-break, and the team-tie preset exists.

### 2.1 Scoring and rules

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Rules | **Doubles break order per player is not modelled.** Only the side's break is tracked, not the 4-player rotation, and the slam / break credit can't say which partner broke. | `src/sports/carrom/engine.ts:249-254` | Record the first breaker per side and derive the A1 → B1 → A2 → B2 rotation; credit `boardBreaks` to that player. | S | known: PROGRESS SD-39 batch (Not done); ICF Laws doubles (verify rule no.) |
| P2 | Rules | **Penalty board placement (verify):** it counts toward the 8-board limit and moves the break. This is a house choice. | `src/sports/carrom/engine.ts:31-35,163-174` | Confirm against the ICF Laws and make it a format flag if it differs. | S | known: PROGRESS SD-39 batch (Check) |
| P2 | Formats | **The "Casual (to 29)" preset keeps the Queen cutoff at 22.** Under the older 29-point game the Queen is believed to stop counting at 24 or 25 (verify). No preset sets `queenCutoff`. | `src/sports/carrom/index.tsx` formatFields (`casual29`); `engine.ts:95` | Set `queenCutoff` in the casual29 preset, or expose it as an advanced field. | S | verify (old AICF 29-point rules) |
| P2 | Rules | No per-board foul / due count. It has no effect on the score but referees log it. | not found | Optional `fouls` per side on BOARD. | S | CR-09 (parked) |

### 2.2 Match stats and box score

At the standard for one-phone capture. The box score shows points, boards and Queens, and the score sheet is ICF-style (board · break · winner · coins · Queen · points · running total, plus PEN and slam marks). Stroke-level pocketing is out of scope.

### 2.3 Player career and leaders / awards

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Leaders | Leaders cover only points, boards, Queens and points per match. There is no slams, board-win %, own-break win % or 25-0 games category, and the award slots are only Top scorer and Queens. | `src/sports/carrom/stats.ts:56-60` | Add `slams`, `boardPct` (min boards) and `zeroGames` to leaders, and a "Most slams" award. | S | ICF record keeping (slams) |
| P2 | Verify | The doubles credit and the career page have only been unit-tested, not checked in the demo. Carrom doubles still shows the "Partners" label. | — | Check both in the demo, then fix the label. | S | known: PROGRESS SD-37/86, SD-96 |

### 2.4 Team and tournament

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Team | **The team-tie preset is generic** (2 singles + doubles, best of 3). ICF World Cup / AICF inter-state team ties are believed to use more rubbers (for example 4 singles + 1 doubles, or 3 + 2; verify), and there is no preset for them. | `src/data/teamTie.ts:121-123` | Add the ICF / AICF team presets once the rule is confirmed. | S | known: PROGRESS SD-48 ("carrom team format generic"); verify |
| P2 | Standings | The league tie-break chain is wins, then H2H, games difference and board-points difference. Not checked against ICF / AICF tournament regulations (points ratio vs difference). | `src/data/standings.ts:385-386` | Confirm the order and fix the preset. | S | verify |
| P2 | Team | Team page averages don't include rubber lines. | `src/data/teamTie.ts` | Include rubber lines in team averages. | S | known: PROGRESS SD-48 |

### 2.5 Scorer UX and safety

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | UX | **The board editor can't change a slam** (its header comment promises it), and it is hidden once the match ends (`Match over.`). A wrong final board can then be fixed only inside the 60-s hold Undo, or later in CorrectMatch. | `src/sports/carrom/index.tsx:45,167-170,219-244` | Add slam chips to the editor draft, and keep the editor reachable during the result hold. | S | scorer-ux-audit-sports (board editor) |

Otherwise at the standard. The coin count has no default and Record is disabled until it is picked, the button names the game or match it closes, the 0–9 chips wrap to two rows at 375 px, and the toss picker comes before board 1.

---

## 3. Golf (R&A / USGA Rules, WHS; stroke play, Stableford, match play, team)

**Strengths:**
- WHS is modelled: course handicap with CR / slope, 95% / 100% allowances, strokes by stroke index (including plus handicaps), net double bogey, an unofficial differential with a best-8-of-20 estimate, and a trend.
- Stroke and Stableford play are scored gross or net, with countback on the last 9 / 6 / 3 / 1 only for complete cards, a playoff option, the cut (top N plus ties, or within X) and MC.
- The leaderboard shows R1–R4 and total, with "F" and "–", WD / DQ / DNS admin, and Best Gross and Best Net side by side.
- Optional per-hole stats (FIR L/✓/R, putts, penalties, bunkers) give derived GIR, scrambling and sand saves.
- There is a proper scorecard, marker and player sign-off with a warning on Finish, and confirm sheets for Pick up (NR), Clear and Concede.
- Match play supports handicap dots, gross strokes, back-9 numbering, extra holes and a conceded-match line.
- Team stroke play counts the best N of M.
- Golf feeds leaders, awards and the medal table.
- Card saves go through an offline outbox.

### 3.1 Scoring and rules

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| **P0** | Course data | **A course can't be edited after it is created.** A mistyped par, stroke index, rating or slope makes to-par, net, Stableford and differentials wrong for every round on that course, and nothing in the app fixes it. | `src/data/golf.ts:34-55` (select / insert only); `src/screens/GolfRoundSetupScreen.tsx:161-171` | Add a course editor (creator or host) and recompute the open rounds after an edit. | M | wrong result, no recovery |
| P1 | Course data | **Quick-create makes one "Default" tee, and you can't add more.** The tee picker appears only when a course has 2 or more tees, which the UI can't create. Forward tees, girls' tees and their CR / slope can't be entered. | `src/screens/GolfRoundSetupScreen.tsx:166,269-271` | Let the editor hold several tees (name, CR, slope, optional par and gender). | M | WHS Rule 6.1 (course handicap per tee) |
| P1 | Handicaps | **One tee per round for every entrant.** Boys and girls (or seniors) who play different tees can't share a round. The WHS mixed-tees adjustment (add the CR − par difference) is not modelled. | `src/screens/GolfRoundSetupScreen.tsx:217` (`format.tee`); `src/sports/golf/engine.ts:82-102` | Add a tee per entry, and apply the WHS 6.2 adjustment when tees' par or CR differ. | M | WHS Rule 6.2 (verify clause no.) |
| P2 | Formats | **Only stroke play and Stableford are offered** (`GolfScoring = 'stroke' \| 'stableford'`). There is no Maximum Score competition (Rule 21.2) and no Par / Bogey (Rule 21.3). | `src/sports/golf/engine.ts:204-214` | Add a `maxScore` competition (rank by capped score, reusing `holeCap`), and add Par / Bogey (+ / − per hole vs net par). | M | R&A Rules 21.2, 21.3 |
| P2 | Formats | No four-ball, foursomes, greensomes or scramble, for stroke play or match play (Ryder-Cup-style ½-point team match play). The WHS team allowances (85% / 50% and so on) are not modelled either. | not found | Add pair entries (GF-16), reusing SD-48 ½-point ties for match play. | L | known: PROGRESS SD-98, SD-48 (GF-16); Rules 22–23; WHS App. C |
| P2 | Rules | **Not confirmed:** the team countback order (dropped scores first, then the last 9/6/3/1), differential rounding, and which stroke index extra holes use. | `src/data/golfTeams.ts`, `src/sports/golf/handicap.ts` | Check each against the R&A / WHS text. | S | known: PROGRESS SD-98 (confirm) |

### 3.2 Match stats and box score

At the standard for amateur and school golf. Strokes, putts, FIR L/R, GIR, scrambling, sand saves, penalties and putts per GIR are tracked, with "not tracked" shown where no data was entered. Strokes Gained, driving distance and proximity are out of scope.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Match | No hole-in-one or albatross as distinct stats; they are folded into `eagles` ("Eagles+"). There is no ace badge. | `src/sports/golf/stats.ts:32` | Add stat keys `aces` and `albatrosses`, and a profile badge. | S | GF-14 |

### 3.3 Player career and leaders / awards

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Career | **A WD / DQ after a finished round doesn't rewrite that round's stat lines.** A DQ'd round still counts toward the scoring average, low round and differential. | `src/data/golf.ts:251` (status admin) | Re-run `completeRound` for the entry on a status change (drop the line or mark it). | S | known: PROGRESS SD-96 |
| P2 | Career | No par-3 / par-4 / par-5 scoring averages, no top-10 finishes, and no match-play W-L-H split. | not found | Add stat keys `p3n/p3s…` at round completion, a top-N count from positions, and a match-play record from the lines. | S | GF-17; DP World Tour stats |
| P2 | Career | No scorecard in the profile history, no 9-hole differentials, past differentials are not backfilled, and the card can't be shared as an image. | `src/sports/golf/handicap.ts` | Build per the PROGRESS lists. | M | known: PROGRESS SD-98 |
| P2 | Awards | The Player of the Tournament is still a weighted score, and there is no UI for the position-points table. | `src/data/golfLeaders.ts:70` | For stroke play, the MVP should be the leaderboard winner; add a points-table editor. | S | known: PROGRESS SD-39 batch |

### 3.4 Team and tournament

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Tournament | **No divisions or categories on one leaderboard** (Boys U-12 / U-15 / U-18, Girls). School and IGU junior events play mixed groups but award per category. Today each category needs its own round. | not found in `src/data/golfLeaderboard.ts` / round screens | Add a category per entry, a filter chip on the leaderboard, and prize boards per category. | M | IGU junior events (practice) |
| P1 | Team | A player's team can't be changed after the round is created. | `src/data/golf.ts:235` (`updateFieldEntry` has no `teamId`) | Allow `teamId` in `updateFieldEntry`. | S | known: PROGRESS SD-98 |
| P2 | Tournament | No shotgun start: `start_hole` is stored, but no UI assigns it and the card always opens on hole 1. | `src/data/golf.ts:146-156`; `GolfRoundScreen.tsx` (no `startHole`) | Add start holes per group in setup, and open the card on that hole with wrap-around. | S | GF-15 |
| P2 | Tournament | No projected cut line during the round. | `src/data/golfLeaderboard.ts` | Draw the line at the projected top N plus ties. | S | known: PROGRESS SD-96 |

### 3.5 Scorer UX and safety

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Safety | **The marker can tick "Player ✓"** on the player's behalf from the same phone, so the Rule 3.3b attestation is cosmetic. | `src/screens/GolfRoundScreen.tsx:261-263,453-455` | Only the player's own login (or the host) can set `signed.player`. Otherwise label it "Player agreed (marker's phone)". | S | R&A Rule 3.3b |

Otherwise at the standard:
- Pick up (NR) and Clear ask first.
- Strokes go up to 20, and putts are clamped to the strokes.
- Concede match… sits behind a who-concedes step and a confirm.
- Finish flags unsigned and unfinished cards.
- The screen stays awake.
- The outbox works offline.

---

## Top 5 to build next (group)

1. **Chess KO tie-breaks (P0):** a mini-match of N games, then rapid / blitz, then Armageddon, plus an arbiter "advances" pick. Also covers drawn team KOs (series `drawn`). (M)
2. **Golf course editor with multiple tees (P0 + P1):** edit par / SI / CR / slope, add tees, set a tee per entry with the WHS mixed-tee adjustment, and recompute open rounds. (M)
3. **Swiss field management (P1):** withdrawals and absences, late entries, requested byes, the cancelled-game blocker fix, and the team-Swiss bye fix. (M)
4. **Chess round-results sheet plus numbered, shareable pairings (P1):** the arbiter's one-screen workflow for big opens. (M)
5. **Category leaderboards and prizes (P1):** golf divisions on one field (U-12 / U-15 / girls) and chess category prizes (U-age, girls, unrated) through a shared "prize category" filter. (M)

## Counts

| | P0 | P1 | P2 |
|---|---|---|---|
| Chess | 1 | 6 | 13 |
| Carrom | 0 | 2 | 8 |
| Golf | 1 | 5 | 10 |
| **Group** | **2** | **13** | **31** |
