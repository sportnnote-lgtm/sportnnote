# SportnNote — Development Log

A running record of the product + engineering work done on SportnNote (the Expo/React
Native multi-sport scoring app — "CricHeroes for every sport", school/college sports
meets in India). Kept as a reference for what was built, why, where, and how it was
verified. **Maintained continuously — new work is appended here as it ships.**

> Convention: each entry notes the change, the key files, and its verification status.
> Dates are absolute. "Demo mode" = the in-memory/AsyncStorage build (no Supabase),
> which is how the app runs locally.
> **Note:** the product was renamed **Sportfolio → SportnNote** on 2026-08-10 (see that
> day's entry). Earlier entries below say "Sportfolio" — that was the name at the time.

---

### 2026-10-11 — SD-115 racket point-entry safety: big team-coloured buttons, no default server, pressure chip, named Undo, Fast4
- **Why:** audit P0 — racket point buttons were small identical grey pills stacked one above the other, the main wrong-side risk; "who serves first" silently defaulted to Home.
- **What:** `PointButtons.tsx` — every racket sport (tennis, badminton, table tennis, squash, padel, pickleball; all scoring systems) gets two side-by-side ≥64 pt buttons in team colours with a SERVING tag. Singles auto-credits; doubles scores the side, player credit optional (long-press / "credit a player"); SD-107 point detail still works. Point buttons stay disabled until "Who serves first?" (and pickleball "Who starts on the right?") is picked; "Fix who served first" mid-match (v:2 only; refused where the server decides scoring — squash English, pickleball side-out). Table tennis's duplicate toss field removed. MATCH / SET / BREAK / GAME POINT chip on the board (`pointStatus.ts`). The Undo bar names what it undoes — "↶ Undo: point to X (30-15)" — for every sport except cricket, falling back to plain "Undo" (`undoLabel.ts`, `useLiveMatch.lastStep`). Tennis Ace / Double fault are smaller outline buttons below. Fast4 set tiebreaks are sudden death at 4-4 (`tbSuddenDeathAt`; old Fast4 matches unchanged).
- **Verified:** `tests/racket-entry.test.mts` (13), fingerprints unchanged, suite green, tsc clean; demo 8093 375 px — badminton, tennis Fast4 + multi-player rosters, pickleball side-out doubles, squash English. Padel / TT: tests only. Guides: all six score-<racket> pages.

---

### 2026-10-11 — SD-114 live scoring bugs: football goals, safe timeline corrections, backfill bar, kabaddi touch cap
- **Football:** a goal via Shot → On target → Goal was counted twice — now once. The goal is recorded on the scorer tap; the assist step says "✓ Goal recorded (2-1). Assist? (optional)" and Close keeps it (Cancel used to drop the goal). Removing/editing either yellow of a second-yellow also removes the automatic red (re-entry restores it). No reducer change — old logs replay identically.
- **Timeline corrections (football, hockey, basketball, kabaddi, volleyball/racket editor):** ✕ asks first and says what goes with it ("X's assist goes with it", kabaddi "Raid +2, Tackle +1, All out +2", hockey "the keeper's save"); ✎ ✕ ＋ are 44 pt. Cancelling an ✎ Edit no longer deletes the event (removal is held until the re-entry commits; the committed log is the same as before). "Insert a missed point" starts with no side picked.
- **Backfill:** a "⏪ Backfilling at 12′ … ▶ Back to live" bar is pinned first in the controls (football, basketball, kabaddi) so live taps aren't stamped at a past minute.
- **Kabaddi:** touch chips above the defenders on the mat are disabled ("· N on the mat"); the engine caps touches for v:2 raids only.
- **Files:** `src/sports/TimelineControls.tsx`, `usePendingEdit.ts`, `src/core/matchSafety.ts` (`removeEvent` copy), football/hockey/basketball/kabaddi index + football/kabaddi engine + kabaddi rules, `RallyPointEditor.tsx`. Guides: score-football, -hockey, -basketball, -kabaddi, -volleyball.
- **Verified:** `tests/live-corrections.test.mts` (15), kabaddi-depth fixture updated (an impossible 3-touch raid with 1 defender), suite green, tsc clean; demo 8093 football/kabaddi/volleyball at 375 px. Hockey, basketball and the second-yellow case: tests only.

---

### 2026-10-11 — SD-112 athletics + swimming results-entry safety
- **Why:** audit P0 — a hand time "1053" saved as 10.53 and an 800 m "2153" saved as 21.53 and was flagged as a meet record; rounds and finals could never be reopened.
- **What:** plausible range per event and pool length (`src/data/results/safety.ts`; fast end just under the senior world record, generous slow end for U10–U19) — out-of-range marks are never rejected, they open a "Check this mark" sheet; unconfirmed ones lose PB/SB/MR/SR flags and can't set records. Hand mode: last digit = tenth ("1053" → 1:05.3h). Close round / Finish & lock list blank rows, unconfirmed marks and each new meet record ("was 10.88"). Organiser-only ↺ Reopen round (while the next round is empty) and ↺ Reopen final (rolls back records to the previous holder, drops medal points until relocked). Hand chip keeps the typed time; ".000" chip for photo-finish thousandths; 44 pt status pills; field marks range-checked + 5 s Undo for X / – / O; "Next ›" lane advance + "Next heat →". Swimming: manual watches are the only input when on; splits folded behind "＋ Splits".
- **Files:** `src/data/results/{safety,model,index}.ts`, `src/data/resultsStore.ts` (`reopenPhase`, `recordsBefore`), `src/screens/ResultsEventScreen.tsx`. No migration (JSON fields). Guides: run-athletics-track-events, run-athletics-field-events, run-a-swim-meet.
- **Verified:** `tests/results-safety.test.mts` (18), tsc clean, suite green; demo 8093 375 px — 100 m and long jump flows incl. reopen + record rollback. Not done: finish-order entry mode; swimming watches/splits checked in code only.

---

### 2026-10-11 — SD-107 optional "How was the point won?" for racket sports (+ tennis 1st/2nd serve)
- **Why:** founder — tennis scoring only knew who won the point, ace and double fault; scorers should be able to say *how* (forehand winner, backhand unforced error…), optionally.
- **What:** tennis, badminton, table tennis, squash, padel, pickleball. Off by default (one tap stays the default); turn on via "🔎 Point detail (optional)" under the scoring buttons or ⚙️ Scoring settings (`SET_DETAIL`, applies from the next point). After each point a "How was it won?" box annotates it (`POINT_DETAIL {pd, serve}`, no score effect; tap again to replace, Skip, Undo removes). Per-sport chips: winner ▸ stroke, forced error, unforced error ▸ type, service winner/fault, ace where it fits, squash Stroke/No let, padel smash out ×3/×4. Errors credit the erring opponent (auto in singles, optional "By:" in doubles). Tennis 1st/2nd serve toggle (TN-05). Timeline editor shows the same chips.
- **Stats:** winners / unforcedErrors / forcedErrors + per-stroke keys, serve 1/2 keys; derived winners & UE per match, W/UE ratio, 1st serve in %, 1st/2nd serve points won %. New `coverage: 'keyed'` in statSchema so untracked matches show "not tracked" (D8), not zeros. Match stats "Point detail" block, W/UE/FE box-score columns on tracked matches, career "Shot making" section, MVP weights (winners +1, UE −1…), leader "Most winners per match" (min 3).
- **Files:** `src/sports/pointDetail.ts`, `PointDetailRow.tsx`, `pointDetailSettings.ts`, rally/tennis/padel/badminton engines, serveStats, racketTotals, rallyStats, tennis/stats, statSchema, boxSources, MatchStatsPanel, LiveTimeline, RallyPointEditor, rallyCore, `src/data/career.ts`. Guides: all six score-<sport> pages.
- **Verified:** `tests/point-detail.test.mts` (23), full suite green, replay fingerprints unchanged (Decision 8); demo 8093 tennis + badminton clicked through, 375 px no overflow. Not clicked: padel/pickleball/TT/squash (unit tests only); live Supabase path; voice has no detail phrases.

---

### 2026-10-11 — SD-106 match controls at the bottom + coloured YES/NO confirm sheet
- **Why:** founder saw a tennis scorer with Restart / End match right under the scorecard — one stray tap from ending a live match.
- **What:** on the Scoring tab, ↺ Not started? Cancel, ↺ Restart match and 🏁 End match… now sit in a red "MATCH CONTROLS" card at the very bottom (below scoring controls and ☰ Quick options). Every one opens a bottom sheet: title, one line on what happens, green **No, keep scoring** on top and red **Yes, …** below (amber for period-level ends — half/quarter/innings). NO is default focus; backdrop/back = NO. Also now confirmed: walkover (names the winner), discard unsynced taps ("N taps will be lost"), Delete match / Reset fixture, football/basketball/kabaddi/hockey period ends + End match (with the final score), cricket End innings / End match / accept tie, hockey Full time (moved to the bottom, red), golf Finish round, athletics/swimming Close round + Finish & lock. ↶ Undo stays between the scoreboard and the scoring buttons and looks nothing like the bottom controls.
- **Files:** `src/core/matchSafety.ts` (placement model + confirm copy for 14 actions), `src/components/ConfirmSheet.tsx` (mounted once in `App.tsx`), `LiveScoringScreen.tsx`, sport `index.tsx` for football/cricket/basketball/kabaddi/hockey, `GolfRoundScreen.tsx`, `ResultsEventScreen.tsx`. Guides: end-a-match-early, match-quick-options.
- **Verified:** `tests/match-safety.test.mts` (16, incl. source checks that no sport dispatches END/period-end straight from a tap), tsc clean, full suite green; demo 8093 at 375 px — tennis, football, kabaddi, athletics sheets tapped (NO keeps playing, YES acts). Not tapped: cricket/hockey/basketball/golf sheets (same component); native not run. Voice "full time" still ends without the sheet.

---

### 2026-10-11 — SD-108 invite share: "Team …" prefix, QR image with the message, open-in-app join pages
- **Why:** founder report — the WhatsApp invite "Join L&H on SportnNote!" didn't say what L&H is, and the QR on screen couldn't be shared.
- **Text:** every invite now names the record type ("Join Team L&H…", "Enter your team in Tournament X…", scorer/host/co-host/manager lines), never doubled when the name already contains it. Builders in `src/core/inviteText.ts` (re-exported from `invite.ts`).
- **QR:** the QR (holds the same https join link) is rendered to a captioned PNG and shared with the text — web via `navigator.share({files,text})`, fallback = PNG download + text share; Android app via `react-native-share@12.3.1` (needs a new APK; current APK falls back to text). `InviteQrShare.tsx`; Team page Members → 🔗 Invite and the tournament "Teams can join by link" card. Scanner accepts tournament QRs.
- **Open in app:** on Android web, `/join-club/<code>` and `/join-tournament/<token>` show "📲 Open in the SportnNote app" (`intent://…;scheme=sportnnote;package=in.sportnnote.app;S.browser_fallback_url=sportnnote.in/#get`) plus "Continue on the web" (`OpenInAppBanner.tsx`). True App Links need assetlinks.json on a non-redirecting host + intentFilters + new APK (steps in docs/sport-depth/PROGRESS.md).
- "Hrudhay Organizer" is that account's profile name, not something the app appends.
- **Verified:** `tests/invite-share.test.mts` (10), tsc clean, demo 8093 at 375 px (share payload, QR decodes to the join link, fallback, join-page card). Guides: teams-join-a-tournament, who-can-edit-a-squad.

---

### 2026-10-11 — Hockey and swimming are live; carrom statTotals and career

- **Hockey (SD-101, FIH):**
  - pure engine with game-clock seconds (stops on goals / PCs);
  - goals by type (field, PC, stroke) with assists, PCs awarded / converted, shots and saves;
  - green / yellow / red cards via the SD-29 on-field tracker (banner, "10 v 11", auto-return);
  - shoot-out with sudden death;
  - presets FIH 4×15, School 2×25, Junior 4×10, Indoor, Hockey5s;
  - box score with MIN / GA, statTotals owning the whole line (contract incl. AMEND);
  - FIH 3-1-0 plus shoot-out bonus standings; career with GK save %, leaders, best-GK award;
  - guide score-hockey.
- **Swimming (SD-94, World Aquatics):**
  - shares the athletics setup / results / hub / career layer via `eventSports.ts`;
  - events by stroke and distance per age, gender and pool (LCM / SCM — records and PBs kept per
    pool length);
  - seeding and lanes per SW 3.1–3.2, timed finals (now also for athletics), swim-offs;
  - 3-watch manual timing, 50 m splits;
  - DQ codes incl. SW 10.13 early take-off;
  - relays, house table, careers, public results;
  - guide run-a-swim-meet.
- **Carrom (SD-37 / SD-86):**
  - doubles boards credit both partners; points capped at 25 a game (ICF); optional slam chip;
  - absolute statTotals (games W/L, boards played, slams, 25-0 games); career Match play
    section.
- **Tests:** tsc + all green (31 hockey, 32 swimming, 16 carrom).

---

---

### 2026-10-11 — Athletics track is live (first new sport); basketball shooting depth; kabaddi depth

- **Athletics track (SD-90):** athletics is a live sport (🏃).
  - **Setup:** a programme screen with age group × gender, the D9 event list, World Athletics round
    presets and lane draws, entrants from houses / teams, relay teams with ordered legs, PB / SB
    seeding.
  - **Results:** a stopwatch keypad (1085 → 10.85), hand-timed rules, reaction time, wind, Q/q
    progression, and closing a round writes stat lines.
  - **Outputs:** medals and position points feed the house / medal table; MR / SR records (school
    records derived from the organisation's meets); athlete careers with PB / SB per event and
    medals; a hub with fastest times and records; a public `/r/<phaseId>` results page.
  - No migration (relays use 0051, already live).
  - **Guide:** run-athletics-track-events.
- **Basketball (SD-31 / SD-40 / SD-44):**
  - optional "Track missed shots" (Miss 2 / Miss 3) with D8 "not tracked";
  - full FIBA box score (FGM-A, 3PM-A, FTM-A, %, OREB / DREB, EFF with missed FG) and team fouls
    per quarter;
  - one credit table for live / edit / totals; absolute basketball statTotals (contract-tested);
  - career FG% / 3P% over tracked games and EFF per game; leaders and POTM use EFF with misses.
- **Kabaddi (SD-33 / SD-41 / SD-82):**
  - absolute statTotals from the raid replay (heals old +1-per-raid lines via the D2 resync);
  - PKL match-centre panel (points split, raid / tackle strike rates, super raids / tackles,
    do-or-die);
  - career raid strike rate, not-out %, super raids / tackles, best match.
- **Tests:** tsc + all green.

---

---

### 2026-10-10 — Sport depth SD-27: leaderboards and awards from each sport's schema — Wave 1 complete

- **Leaders:** every sport's tournament leaders, sport-hub leaders, award slots, award ranking,
  per-match POTM weights and "How is this ranked?" text now come from its stat schema via
  `rankPlayers`.
- **Minimums:** averages carry minimums (basketball PPG etc. 2 games, volleyball per-set 5 sets,
  football goals per 90 180 minutes, racket win % 3 matches, service points 30). Organisers can
  change them per tournament (`leaderMins`).
- **Awards:**
  - Racket sports rank Player of the Tournament by wins → win % → sets / games won %; no "Top
    scorer" in racket sports.
  - Golden Boot: goals → assists → fewer minutes.
  - Kabaddi: best raider / defender. Chess: score %. Volleyball: best server / blocker.
  - Published awards are untouched.
- **Tests:** tsc + 1529. **Guide:** tournament-awards explains rankings and minimums.
- **Wave 1 (foundations) complete:** SD-14 … SD-29 plus SD-103 / SD-104.

---

---

### 2026-10-10 — Sport depth SD-24 + SD-104: a proper career for every sport; racket rule and UX fixes

- **SD-24 (career framework):** pure `src/data/career.ts` renders every sport's career sections from
  its schema (golf stays custom; cricket identical).
  - **Header:** Apps · W-L or W-D-L · Win % · best win run · titles / finals.
  - **Basketball:** per-game averages, FT %, career highs, double- and triple-doubles.
  - **Football:** goals per game and per 90, conversion, hat-tricks, keeper save %.
  - **Volleyball:** per-set rates and sets W-L.
  - **Kabaddi:** per-match points, Super 10s, High 5s.
  - **Racket:** match play, serve & return %, a singles/doubles split, partner records (paired by
    match and side).
  - **Chess:** score %. **Carrom:** boards and queens.
  - **History rows:** score line + up to 3 key stats with correct plurals.
  - **Fixed:** "100%" truncation, "0 aces", "1 draws".
- **SD-104 (racket fixes from the guide writer):**
  - **TT serve:** deuce at (target−1)-all, with 5 serves each in 21-point games (derived only;
    11-point games unchanged).
  - **Tennis Ace / Double fault:** only for the server ("⚠️ Double fault by X → point Y").
  - **Double-fault corrections:** new double faults carry `df`, so corrections adjust the count
    (old ones untouched).
  - **First server:** a "Who serves first?" picker for squash and table tennis.
  - **Serving icon:** squash's serving line uses its own icon.
  - **Badminton serve dot.**
  - **Doubles serving order:** per-set pick for tennis / padel (`SET_SERVE_ORDER`; tiebreak rotation
    and serve stats follow it).
- **Tests:** tsc + 1497.
- **Guides:** filter-career-stats rewritten; the 5 racket guides updated (pickers, buttons, new
  career sections).

---

### 2026-10-10 — Sport depth SD-22 + SD-23: serve/return stats for racket sports; one shared box score for 11 sports

- **Serve stats:** replaying each match's point list gives ATP/BWF-style serve and return stats —
  service and return points won, holds and breaks, break points saved / converted, golden points,
  game / set / match points saved, longest run, side-outs. They show in a per-set Match stats
  panel and feed careers. Old matches are included (derived, no new capture).
- **Shared box score:** a single schema-driven component (totals row, periods, pinned names, bench,
  team comparison) replaces six bespoke ones for basketball, volleyball, kabaddi, football, the
  racket sports and carrom. Football gains a per-player table. Values are identical to before
  (golden tests).
- **Tests:** tsc + 1454.

---

### 2026-10-10 — Sport depth SD-26: chess Swiss done properly (FIDE C.07 tie-breaks, Dutch-style pairing, colours)

- **Tie-breaks:** pure `swissTiebreaks.ts` gives BH, BH-C1, BH-M1, SB, SB-C1, PS, PS-C1, BPG,
  BWG, WIN and WON under FIDE C.07 (2023).
  - **Your own unplayed rounds** count as a dummy opponent on your final score.
  - **Opponents' byes** count at face value.
  - **A withdrawal's missing rounds** count as draws.
  - **Cut modifiers** cut voluntary unplayed rounds first.
  - **Round robins** treat a forfeit as a regular game.
  - Registered as standings columns.
  - **Default Swiss order** (C.02 §13.16.4): BH-C1, BH, SB, PS, direct encounter, wins, wins with
    Black.
  - **Checked against** the FIDE Arbiters' Commission tie-break exercises (16 players, 5 rounds).
- **Pairing:** `swiss.ts` is a Dutch approximation.
  - Score groups, S1 v S2 with transpositions and exchanges, floaters, no repeats.
  - Absolute / strong / mild colour preferences; the bye goes to the lowest-ranked player without
    one.
  - Round 1 by seed with a coin toss; relaxation only as a last resort, and flagged.
  - Fixtures store `white`; the game opens with that colour.
  - UI label: "In-app Swiss pairing — not FIDE-certified" (D7).
  - **Simulated:** 200 events of 9–20 players over 7–9 rounds — no repeats, colours within ±2.
- **Tests:** tsc + 1390. **Guide:** run-a-chess-tournament rewritten.

---

### 2026-10-10 — Sport depth SD-20: the game/set score line everywhere, retirements, LineScoreboard

- **One scoreline for every result surface** (`src/sports/scoreline.ts` `matchScoreLine`,
  `src/sports/matchLine.ts`): match cards, bracket cells and series legs, sport results lists,
  calendar, team head-to-head ("Last: W 2–1 · 6-4, 3-6, [10-7]") and form, profile history,
  Correct match, share text, the ticker / OBS overlay.
- **Retirements per ITF / BWF / ITTF:** racket End-match chips read **Retired** / **Default**; the line
  keeps the unfinished set and adds "ret." / "def." / "w/o" / "abandoned" ("6-4, 3-2 ret."). The
  board, summary and share show sets won (1–0), not the live points.
- **LineScoreboard for all set/game sports** (`src/sports/SetLineBoard.tsx`, pure `lineGrid`):
  new for table tennis, squash, pickleball, padel and carrom; tennis / badminton / volleyball moved
  onto it. Tiebreak superscripts (6⁴), padel / tennis match tiebreak as a "TB" column.
- **Padel:** match-tiebreak points stored in the set entry ([10-7]); older snapshots unchanged.
- **Tests:** `tests/scoreline-everywhere.test.mts` (24). Demo 8093 at 375 px (TT live + retired,
  tennis retired, share text). Guides: end-a-match-early, live-score-overlay.

### 2026-10-10 — Sport depth SD-19 + SD-29: absolute stats for racket sports; on-field time, minutes, +/-, sets played, timed suspensions

- **SD-29 (on-field tracker):** pure `src/sports/onField.ts` covers subs, permanent "off", timed
  suspensions (auto-return, consecutive, red supersedes) and `fieldAt` at any moment.
  - **Football:** `minutes` for every player who took the field (regulation; extra time +30), an
    optional sin-bin (`SUSPEND`) with a live banner and "10 v 11".
  - **Basketball:** MIN and +/- in the box score and statTotals; foul-out ends time.
  - **Volleyball:** a court `LINEUP` stamp gives `setsPlayed`, so per-set rates divide by sets
    played.
  - **Hockey / handball:** green / yellow / red, 2-minute and disqualification rules are modelled and
    tested ahead of their plugins; kabaddi yellow is a rule constant (its UI comes with SD-72).
- **SD-19 (absolute statTotals):**
  - **Contract** documented on `SportPlugin.statTotals`, with a reusable harness over cricket,
    football, volleyball and the 6 racket sports.
  - **Racket sports:** shared `racketTotals.ts` writes `ptsWon` / `ptsLost`, games, sets, deciders,
    tiebreaks and aces, absolute and written once at completion (no more lost or double increments).
    Volleyball gets setsWon / setsLost.
  - **Context:** squad-aware player context for totals.
  - **D2 backfill tool** (never automatic): `await __sportnnoteAdmin.resyncSportLines('<sport>',
    undefined, { dryRun: true })` in the signed-in web console, then without `dryRun` to write.
    It recomputes from stored logs and writes changed stat lines only.
- **Shared:** `statSync` zeroes a totals-owned key a player no longer has (e.g. an old defender
  clean sheet).
- **Tests:** tsc + 1342 (42 on-field, 18 contract, 15 racket-totals); legacy replays identical.
- **Guides updated:** football (minutes, sin-bin), basketball (MIN, +/-), volleyball (sets played).

---

### 2026-10-10 — Sport depth SD-18: each sport's standings columns

- **Per-sport columns:** standings now show each sport's own columns (GD; PF/PA/±; Sets/SR/PR; SD;
  G±/P±; S±/S%/G%; NRR; SB/Buchholz), with a "Player" header for singles.
- **On phones:** a fixed name column with scrolling numbers.
- **Under the table:** a key and the tie-break order in words.
- **Kabaddi** ties read "T".
- **Tests:** tsc + 1269.

---

### 2026-10-10 — Sport depth SD-25: split a player's career by format, singles/doubles, season, opponent…

- **Context per line:** each stat line gets a context derived from its match and tournament: cricket
  format (T20 / ODI / T10 / Box / Hundred / Long), ball, singles / doubles, tournament or friendly,
  season, opponent, chess colour and time control.
- **Profile filter chips** (only meaningful ones per sport) recompute the whole career locally.
- **New guide:** "filter-career-stats"; the cricket guide gains "Career by format".
- **Tests:** tsc + 1244.

---

### 2026-10-10 — Sport depth SD-17: every sport's official points and tie-break rules

- **Presets for new tournaments:** each sport's international points system and tie-break order
  (FIVB 3-3-2-1, PKL 5-3-1 incl. +1 for losing by 7 or fewer, FIBA 2-1 with an h2h mini-league,
  FIFA/UEFA h2h + fair play, BWF two-way vs three-way, ATP/ITF, FIP, WSF, ITTF, ICC, plus FIH and
  IHF ready for hockey and handball). Existing tables are unchanged.
- **Tie-breaker library:** set / point ratios, games diff / %, fair play, and explicit "Drawn by lot".
- **Points editor:** preset chips plus an advanced tie-break reorder.
- **Tests:** tsc + 1224. **Guide:** points-table-and-adjustments rewritten for systems and tie-breaks.

---

### 2026-10-10 — Sport depth SD-28: results engine for timed and measured events (foundation for athletics, swimming and the rest)

- **What it is:** a pure, sport-agnostic engine in `src/data/results/`.
- **Event structure:** phases (heat / semi / qualification / final) with Q/q progression, serpentine
  seeding and World Athletics lane groups.
- **Marks:** times, distances, heights (O/X/–), kg lifts, points; statuses NM / DNF / FS / DQ (rule
  ref) / WD / DNS; wind readings and legality.
- **Ties:** per-discipline tie rules.
- **Records:** PB / SB / MR / SR flags with a record book.
- **Medals and points:** medals and position points, and relays and crews.
- **Screens:** a results-entry screen and results sheet for one official on a phone (hidden
  `/ResultsLab` for now).
- **Golf** now shares its positions / cut code (identical results, 9000 randomised checks).
- **Migration 0051:** team rows for relays / houses, plus a security fix — marking another
  player's entry is now golf-only, so heat-mates can't edit each other's times.
- **Tests:** tsc + 1224.

---

### 2026-10-10 — Sport depth SD-16: aggregate engine and cricket records leaders

- **Engine:** the stat schema now computes every aggregate generically — single-match best (keeps
  the line it came from), best figure with an ordering chain, rates with minimums (qualifiers),
  per game / per set (appearance-aware), count-if (100s, double-doubles), coverage-aware.
  `rankPlayers` ranks any stat with direction, minimum and tie-break chain; `leadersByKey` uses it
  with identical outputs for existing categories.
- **Tournament Stats tab, cricket:** Highest score, Best bowling, Best average (min 3 innings),
  Best SR (min 30 balls), Best economy (min 10 overs), Most 50s / 100s, with "54*" and "3/12"
  display strings and the minimum shown.
- **Tests:** tsc + 1147.
- **Guide:** cricket-scorecard-and-stats gains a records-leaders section.

---

### 2026-10-10 — Sport depth SD-21: fix a past point in table tennis, squash, pickleball and padel

- **What's new:** these sports can edit, delete or insert a past point through the same
  "Correct the timeline" editor as tennis, badminton and volleyball. Score, server, side-outs,
  games and sets, the final scoreline and player credits all re-derive.
- **How:** side-out sports get a `rally` kind (`wonBy`, who won the rally). The engine decides
  whether that's a point or a side-out, and old logs infer it from their 🔁 events.
- **Tests:** tsc + 1126; edited match = the same match scored live; fingerprints unchanged.
- **Guide:** the pickleball guide gains "Fix a mistake".

---

### 2026-10-10 — Sport depth SD-15: one stat schema per sport (the shared foundation)

- **What it is:** each sport now has a single declarative stat schema in `src/sports/<sport>/stats.ts`,
  collected in `statSchemas.ts`. It defines keys, labels, formats (with lower/higher-is-better),
  aggregation, career sections, box-score columns, leaders, award slots (incl. goalkeeper-only
  eligibility), MVP weights, "optional / not tracked" coverage and suspension durations.
- **What it replaces:** the 6+ maps that disagreed (ratings, stats, standings, team stats,
  profile labels) are now derived from it, so existing callers are unchanged.
- **Cricket career** renders identically from the schema (golden tests).
- **Future sports:** sample hockey, handball and athletics schemas prove the shape covers them.
- **Labels:** correct singulars, and no more raw keys like "yellowCards" in notifications.
- **Tests:** tsc + 1126.

---

### 2026-10-10 — Sport depth SD-11 to SD-13: every player gets a W/D/L/T/NR line; standings bugs; cricket NRR per ICC — Wave 0 complete

- **Results and appearances (SD-11):**
  - **Who gets a line:** every player who took part gets a stat line at completion — starters and
    subs who came on (from squads/lineups), cricket involved players, and chess/carrom/racket
    entrants via a capped roster fallback.
  - **What it holds:** a `result` W/D/L/T/NR from the player's side, and `starts` where a lineup
    exists.
  - **Code:** pure `src/data/appearances.ts` (`planAppearances`, `sideResults`); repos
    `syncMatchAppearances` after `updateMatchSnapshot` and `endMatchManually`. It is idempotent,
    dispute-mapped and writes only changes.
  - **Profiles:** Apps, W-D-L, Win % (W / decided) and Starts; no more LOST for draws, ties or NR;
    sport rows read "3W 1D 1L".
  - **Migration 0050** `20261019122800_stat_line_result.sql` (bundle `2026-10-stat-line-result-0050.sql`,
    founder to run): `stat_lines.result` + check. A conservative backfill sets NR/T/D for level
    outcomes and W/L only when the side is certain; it inserts no rows.
  - **Before 0050 runs:** tolerant reads and writes, with the result derived at read time.
- **Standings (SD-12):**
  - the overall house table uses each sport's organiser points (X1);
  - cross-group seeding walks the sport's full tie-break chain (X2; TT ratios, chess SB);
  - NR counts in Played (X4);
  - cricket tables show T and an NR column, with NRR instead of run difference, on the table and
    the team page.
- **Cricket NRR (SD-13):**
  - a revised-target (DLS / manual) match credits the side batting first with target − 1 off the
    chase's overs (v2 only);
  - a side with no batter left counts as all out (legacy matches too — the bug fix);
  - Team 1's original quota;
  - credited runs come via a new `standingsScore` plugin hook.
- **Tests:** tsc + 1032 (24 appearances, 14 standings-sd12, 16 cricket-nrr); PGlite statlineresult 39/39.
- **Guides updated:** points-table-and-adjustments, cricket-rain-and-dls, cricket-scorecard-and-stats.

---

### 2026-10-10 — Sport depth SD-07 to SD-10: golf missed cut; football 45+2' and blocked shots; keeper clean sheets; chess Swiss bye

- **Golf (SD-07):**
  - **Missed cut:** derived from who is entered in the latest round. MC players drop below a
    "— cut —" line with no position (they used to be ranked among cut-makers on 36-hole totals)
    and are excluded from later round setup. The cut is saved on the round's format.
  - **Profile:** "Best round" uses complete 18-hole rounds only (+ "Best 9 holes"), and
    putts/round counts tracked holes only (`puttHoles`).
  - **Countback:** applies only when every tied card is complete; otherwise T.
  - **Code:** pure `src/data/golfLeaderboard.ts`.
- **Football (SD-08):**
  - **FIFA minute notation:** 45+2' / 90+3' and ordinal minutes (a goal at 10:30 = 11') for new
    matches, in the Timeline, lineup subs, the edit list and the ticker. Sorted by half, then
    minute, then log order.
  - **Shots:** On target / Off target / Blocked; a blocked shot is never on target and the blocker
    gets `blocks`.
  - **Old logs:** replay identically (frozen-engine oracle).
- **Football (SD-09):**
  - **Who gets the clean sheet:** the keeper on the pitch longest (`keepers.ts`: spells from the
    XI stamp, subs and red cards), also in a 0–0 shootout, recomputed after corrections.
  - **How it's synced:** football gets partial `statTotals` (keeper minutes / goalsConceded /
    cleanSheets). Corrections still apply deltas for other keys (`deltasBesideTotals`).
  - **Leaders:** the Golden Glove award and tournament leaders rank goalkeepers only.
- **Chess (SD-10):**
  - **Byes:** a Swiss bye is worth 1 by default (organiser ½ / 0, `byePoints`), credited once per
    round as soon as it's drawn.
  - **Byes and forfeits** stay out of P/W/D/L and Sonneborn-Berger; per-game records are kept for
    Wave 1's Buchholz.
  - **Display:** table and standings footnotes, plus the round preview naming the bye.
- **New public guides:** golf scoring & leaderboard, How to score a football match, Run a chess
  tournament.
- **Tests:** tsc + 978.
- **Demo 8093:** golf cut with MC, a 45+2' goal with a keeper sub and shootout clean sheet, a Swiss
  bye credited.

---

### 2026-10-10 — Sport depth SD-05 + SD-06: basketball FIBA rules; pickleball side-out tournaments and the right-court server

- **Basketball (SD-05):**
  - **Free throws one foul earlier:** presets now give free throws from the 5th team foul (FIBA,
    School, NBA = 4 before; NCAA and 3×3 = 6, the same off-by-one fixed).
  - **Technicals count as team fouls** (FIBA; not NBA).
  - **Overtime team fouls carry over** from Q4 (FIBA). Both are new advanced toggles plus presets.
  - **Live display:** a team-foul line per period and a BONUS line per side.
  - **"+1 FT":** in full-court games it logs a made free throw; voice "one" does the same.
  - **Standings:** new tournaments (and a sport newly added to one) store win 2 / loss 1 (D1), and
    the points editor offers "FIBA 2-1 (loss = 1)" / "Simple 2-1-0". Existing tables are unchanged
    (the default is still computed as 2-1-0 for a format with no keys).
  - **Old matches:** keep their stored `foulsForBonus` and have no flag keys, so they replay
    identically (≈14,000 steps vs a frozen engine).
- **Pickleball (SD-06):**
  - **Presets:** tournament presets are side-out (best of 3 to 11, 1 game to 15 / 21, medal match
    best of 5); MLP and rec presets stay rally. Tournaments default to side-out (new
    `FormatField.tournamentDefault`); friendlies default to rec.
  - **Doubles server:** the scorer picks who starts on the right per team at 0-0 (`SET_START_RIGHT`).
    The engine derives court positions through points, the second server and side-outs, so the
    call ("Bina Shah (right) · 0-0-2") and the point credit follow the real server. Singles uses
    even/odd sides.
  - **Old logs:** keep their recorded credit (fingerprints unchanged).
- **Tests:** tsc + 914 (18 basketball-fiba, 14 pickleball-server).
- **New public guides:** "How to score a basketball match", "How to score a pickleball match".
- **Demo 8093:**
  - a new tournament shows 2/1/1;
  - a FIBA match reached the bonus via a technical and carried fouls into OT;
  - a pickleball side-out doubles sequence gave the right server at every step.

---

### 2026-10-10 — Sport depth SD-04: volleyball points say how they were won; errors credit nobody; aces and blocks count as points

- **Bug:**
  - with a roster loaded every point had to go to a player (no "opponent error"), so about a
    third became fake kills and Best Scorer was wrong;
  - aces and blocks didn't add to a player's points.
- **Fix:** new pure `src/sports/volleyball/engine.ts` with `ATTACK` / `OPP_ERROR` / `SERVE_ERROR`
  (POINT / ACE / BLOCK unchanged).
  - **Scoring panel:** Attack (default, resets each point) / Block / Ace, then the player; **Opp.
    error** and **Opp. serve error** score in one tap and credit nobody.
  - **Credits:** attack = points + attackPoints; ace or block also add a point.
  - **Shared rally editor** gains point kinds and a credits function (tennis/badminton unchanged).
  - **MVP weights** rebalanced so an ace is still worth 3 and a block 2.
  - **Voice** matches the buttons.
- **Event log:** old logs deep-equal a frozen copy of the old reducer.
- **Tests:** tsc + 882 (17 new).
- **Demo 8093 (m10):** each outcome; box score = stat lines; Top scorer counts the block.
- **New public guide:** "How to score a volleyball match".
- Past aces and blocks without the matching point heal with the stat backfill (D2).

---

### 2026-10-10 — Sport depth SD-03: kabaddi raid and tackle points go to the right player and team

- **Bug:**
  - every guided raid credited the raider +1, whatever happened;
  - a tackle was logged as a raid point to the raiding side, so it went into the raider's column,
    TCKL stayed 0 and the per-half board credited the wrong team.
- **Fix:** pure `src/sports/kabaddi/engine.ts` (reducer, `previewRaid`, `raidActions`,
  `raidReversals`, `raidEvents`, `kabaddiWinner`, `halfPoints`).
  - **Raider** gets exactly the raid points (touches + bonus; 0 for an empty raid; "Super raid" for
    3+).
  - **Tackles** are a separate line for the defending side and the tackler (super tackle = 2).
  - **Failed do-or-die and all-out** are their own lines.
  - **Per-half columns** add up to the total; the box score splits RAID/TCKL by team; no winner
    mark on a draw; voice "tackle" credits 2 on a super tackle.
  - **Edit** reopens the raid form pre-filled and replaces the raid in place; Cancel now changes
    nothing.
  - **Remove** takes out the whole raid and reverses its credits.
- **Event log:**
  - Old team scores were already right (only the timeline lines were wrong), so `RAID_OUTCOME`
    replays unchanged.
  - The fixed remove ordinal applies only to `REMOVE_EVENT {v:2}`.
  - 400 random logs × 40 steps replay identically against a frozen copy of the old reducer.
- **Tests:** tsc + 865 (18 new kabaddi-attribution).
- **Demo 8093 (m4):** empty raid, 2-point raid, tackle, super tackle, remove, reload → halves add
  up and the box score is right.
- Past player stat lines heal in SD-33 (D2).

---

### 2026-10-10 — Sport depth SD-01/SD-02: real final scores everywhere; tennis tiebreak scores and Grand Slam deciding set

- **Bug:** finished set and game matches showed "0–0" in the full-time alert, ticker/overlay,
  correction screen and history, because `summary()` returned the reset current-game points.
- **Fix:** one shared `src/sports/scoreline.ts` (+ optional `SportPlugin.scoreLine`) gives sets or
  games won plus each set's score, e.g. "2–1 · 21-18, 19-21, 21-15" or "6-4, 7-6(4)".
  - **Sports:** tennis, padel, badminton, table tennis, squash, pickleball and carrom, plus
    volleyball (same bug).
  - **Surfaces:** the alert, ticker / `/o/`, MiniScore, the Summary tab, match cards (incl. their
    accessibility label), the Correct match screen and profile history (from the player's side).
- **Tennis:**
  - each set keeps its tiebreak score (derived state; old snapshots count it from the log);
  - the `gs5` preset plays the deciding set in games with a 10-point tiebreak at 6-6
    (`finalSetTBAt`), and Custom offers it as a choice;
  - matches already stored with the old preset keep their rule.
- **Padel** keeps tiebreak scores too.
- **Badminton and padel** engines moved into `engine.ts` files so tests can load them.
- **Tests:** tsc + 847 (31 new: final-score, tennis-scoreline). Legacy replay fingerprints for 12
  sample logs are identical vs HEAD.
- **Demo 8093:** tennis 6-4, 7-6(4) on board, Summary, card, `/o/`, Correct match and history;
  badminton 2–1.

---

### 2026-10-10 — Org integrity: no planting teams/clubs in another org; only the invitee accepts an invite (migration 0049)

- **Migration 0049** `20261019122700_org_integrity.sql` (bundle `2026-10-org-integrity-0049.sql`, run
  **after 0048**) — founder to run:
  - **Teams:** a new team may carry an `org_id` only if the caller has Owner/Admin/Organizer in
    that org, or it's created through a club of the same org that the caller manages
    (`can_place_team_in_org`).
  - **Clubs:** moving a club into an org needs authority in that org (new `guard_club_org`; this
    closed a third path, as `clubs_update` accepted any org).
  - **Invites:** only the invitee can accept or decline. New `org_requests.accepted_by`, stamped by
    the guard. Invites the invitee accepted themselves now count as joining by choice for 0048's
    staff rule; historic ones don't.
- **No app change needed:** admins only cancel invites in the UI; invitees answer their own.
- **Tests:** PGlite orgintegrity 69/69, plus every existing suite green (orgstaffedit 46/46: two
  club-path checks no longer apply). Re-run safe.
- The bundle header has a read-only audit query listing teams/clubs whose creator isn't a member of
  their org.

---

### 2026-10-10 — School staff can fix each other's players (migration 0048) + DLS decision

- **Founder decision (#12 follow-up):** same-school staff can edit an unclaimed player that a
  colleague added. Migration 0048 `20261019122600_org_staff_player_edit.sql` (bundle
  `2026-10-org-staff-player-edit-0048.sql`) — founder to run. It keeps every 0044 arm of
  `can_admin_player` and adds one: an org Owner/Admin may edit an unclaimed, unreported player on a
  team of that org when both of these hold:
  - the team's creator is an active member;
  - the player's creator joined the org by choice (created it, or their own join request was
    accepted). Direct "+ Add member" adds and invites don't count — admins can add anyone, or mark
    an invite accepted themselves, without consent.
- **Tests:** PGlite orgstaffedit 48/48 (control with the old function fails the 8 staff cases);
  admineditplayer 37/37. Guide `fix-a-players-details` updated ("Set your school up as a
  community", Request to join).
- **Pre-existing holes found (not fixed):**
  - `teams_insert` lets anyone create a team carrying another org's `org_id` through their own
    club;
  - an org admin can mark an invite as accepted without the invitee.
- **DLS (#18) decision:** keep today's method (error ≤ 1 run, only at 6–9 wickets down, never raises
  a target); research to source the full official Standard Edition table; drop it in later behind a
  new DLS version flag so matches already played replay unchanged.

---

### 2026-10-10 — Match start/result alerts verified on the live project (#23 staging check)

- **Test:** the founder ran a throwaway football match (no teams or followers; created and deleted
  in one SQL block). Responses were read from `net._http_response`.
- **Result:** three state-only updates, a same-status update and a post-live state update caused
  **0 calls**. scheduled → live → completed caused **exactly 2** (`start` and `result`), both 200.
- **Gotcha:**
  - **What happened:** the `functions_anon_key` Vault secret had been stored as the dashboard's
    *masked* value (ends in "••", no dots). The functions gateway answered 401
    `UNAUTHORIZED_INVALID_JWT_FORMAT`.
  - **Why pasting didn't fix it:** pasting the key from chat was masked again.
  - **Fix:** copy it inside SQL from the reminders cron job,
    `vault.update_secret(<id>, (select substring(command from 'Bearer ([A-Za-z0-9_.-]+)') from cron.job where jobname = 'notify-upcoming'))`.
- **Read-only checks:** `npx supabase db query --linked --project-ref mpgbvbylmkwasjgupsbq "<sql>"`
  works with the CLI login. Writes to live go through the founder.

---

### 2026-10-09 — Hosts can score and end matches by default; 20 wording/UX fixes from the guide writers

- **Hosts score by default (founder ask):** new `core/scoringAccess.ts` (`canScoreMatch`: a listed scorer, or a host of the match or its tournament; mirrors the server's `can_manage_match`). It drives the Scoring tab, End match, Take over, Quick options, live settings, POTM and Matches-card "Start scoring". Opening a match doesn't add a host as a scorer; claiming the lock does (as the RPC already did; mirrored in demo). Viewers stay read-only. **No migration**: PGlite hostscoring 26/26 (a host not in `scorer_ids` claims, appends, undoes, snapshots, writes stat lines and ends; a stranger is refused everything). Edge: a host account with several player rows may be recorded as scoring under its first player (`my_scoring_player`).
- **Wording / UX fixes (all 20 from PROGRESS):**
  - "Manage" for the tournament admin tab and its notices (old `tab=Settings` links still work);
  - 🏳 Walkover in the End match panel;
  - End-match chip "Awarded";
  - 🎯 Change scorer;
  - "Add logo" / "Add photo" everywhere;
  - join box hint mentions tournament T- codes;
  - computed setup count;
  - labelled "± Adjust" on the points table;
  - accurate "Before they play" hint;
  - import rows say "Will import as X" (+ warning count);
  - cricket: sentence-case dismissal names; edit-ball card "bowler to batter"; over editor 0–7, no-ball +0–6, Boundary vs All run, overthrows chip and clearing, no-ball off bat / byes / leg byes (and fixed a no-op re-save doubling no-ball byes); Nb + leg byes pad buttons; clearer penalty-reason hint; "(revised target)" everywhere; ⚡ legend; Timed out hint; "± Runs"; an upload-wait hint on Edit a past ball.
- In-app help and 19 public guides updated to match.
- **Verified:** tsc + 816 tests; website builds (25 guides); demo 8093 at 375 px.

---

### 2026-10-09 — Public feature guides on sportnnote.in/guides/ (25 guides) + web publish + APK 36

- **Ask:** every feature gets a public page explaining it, with a step-by-step guide, written by
  content and design agents in parallel with development.
- **Content contract:** `website/guides/README.md` defines the front matter (title, description,
  category, audience, sports, order, updated), the Markdown subset and the writing rules. Labels
  are grep-verified against `src/`, and the PROGRESS choices win over the specs.
- **Site:** `scripts/build-website.mjs` now builds `/guides/` and `/guides/<slug>/`.
  - **`/guides/` index:** category sections plus a filter box that works without JS.
  - **Article pages:** step cards, Tip / Note / Important callouts, "On this page" (a sticky
    sidebar on desktop, collapsible on phones), related guides, previous / next, and an Open
    SportnNote button.
  - **SEO:** guide URLs in the sitemap, HowTo and BreadcrumbList JSON-LD, and og tags.
  - **Strict validation:** a bad category or audience fails the build and names the file.
  - **Drafts:** files starting with `_` never ship.
  - "Guides" was added to the header, footer and home page.
- **Guides:** 25 in total (17 general, 8 cricket), one per parity feature.
- **Also live today:**
  - the web app is republished at sportnnote.expo.app;
  - Android APK versionCode 36 (contacts picker, new icon, parity 01–25), whose link is now the
    site's Android download.
- **Product feedback from the writers** (confusing wording, small gaps) is collected in
  `docs/cricheroes-parity/PROGRESS.md`.

---

### 2026-10-09 — LIVE: CricHeroes parity 01–25 shipped to Android

- Migrations 0038–0047 run by the founder (17/17 objects verified; runbook
  `supabase/release/2026-10-parity-0038-0047-RUNBOOK.md`).
- Vault secrets `notify_followers_url` / `webhook_secret` / `functions_anon_key` set;
  `WEBHOOK_SECRET` regenerated to match.
- `notify-followers` and `notify-upcoming` deployed; a call without the secret is refused (403).
- `git push --all` (branch + main at dbb0e21) and Android OTA to channel `preview`: update group
  `056ef4d3`. `expo-contacts` isn't in older APKs, but it's loaded optionally, so the OTA is safe
  there.
- Not yet: the staging alert-count check, the web publish, and a new APK (contacts picker, new icon).

---

### 2026-10-09 — Score ticker / OBS overlay page at a public URL (parity #25)

- **Ask (parity queue #25):** a college media club streams the inter-house final from OBS and
  viewers can't see the score; organisers need one free, no-login link that lays a live score bar
  over the video, for any sport.
- **Model (pure):** `sports/ticker.ts` `buildTicker` from each plugin's `summary()` (every sport works),
  optional `SportPlugin.tickerDetail?` / `tickerFlash?`; cricket (batters, bowler, this-over chips by
  `symbolTone`, Need/RRR · Innings break · CRR banner, "(DLS)" tag, Super Over state; flashes only on
  wickets and real boundaries — never penalties, adjustments, all-run 4s or overthrows) and football
  (scorers, "GOAL! Name 34'"). `core/overlayParams.ts` (theme / pos / flash / sponsor path whitelist),
  shareText `overlayLink`.
- **Route:** web `/o/<matchId>` short-circuits the navigator (no chrome, auth wait or banners) →
  `OverlayScreen` (transparent page, meta refresh 120 s, read-only `useLiveMatch` — no outbox flush,
  never writes). `useLiveMatch` gains `onRemoteEvent` on the realtime INSERT fast path only (no flash
  on load / reconnect / undo) and now bumps viewers' `eventCount` on inserts.
- **UI:** `components/overlay/ScoreOverlay.tsx` (bar / pill / corner at 1920×1080, pre / live / done,
  sponsor, 1.6 s flash); host-only `OverlayPanel` on Info (theme chips, live 16:9 preview, Test flash,
  sponsor logo via #01, Copy / Open link, OBS steps).
- **Verified:** tsc + 803 tests (25 new); cricket logs replay identically; demo 8093: panel host-only,
  live preview + Test flash, `/o/` transparent in all themes for football and cricket, corner clock,
  pre-match and not-found states, no flash on reload, `/m/` still routes. Not verified: cross-device
  realtime (demo has none), guest session, sponsor upload, OBS itself. No migration.

---

### 2026-10-09 — Bulk schedule import from CSV / pasted spreadsheet (parity #24)

- **Ask (parity queue #24):** a sports secretary with 40 fixtures in a spreadsheet had to retype
  them one by one.
- **Data (pure):** `data/scheduleImport.ts` — header aliases, `parseDelimited` (BOM, tab > comma >
  semicolon, quoted cells, `#` comments, line numbers kept), day-first `parseDateCell` (+ month names,
  Excel serials), `parseTimeCell` (am/pm, hhmm, Excel fractions), `matchTeam` (ok / not entered →
  auto-add / suggestion / missing; never creates teams), `stageFrom`, `validateImport` (home = away,
  out-of-window date, duplicates, venue/team clashes vs existing matches and earlier rows),
  `templateCsv`. `core/time.ts` `wallTimeToIso` (DST-safe), `core/download.ts` (factored out of
  ics.ts), `core/document.ts` `pickTextFile`, `data/matchFormat.ts` `matchFormatFor` (extracted from
  GenerateFixtures — output proven identical).
- **UI:** `ImportScheduleScreen` (route `ImportSchedule`) from a "📥 Import schedule (spreadsheet)"
  HubRow in #08's Matches group: template download with real team names, CSV pick (web) or paste
  from Excel / Sheets, preview with ✓ ready / ⚠ to check / ✕ won't import, one-tap "Use Red House"
  fixes, skip, sticky "Create n matches" (sequential, progress, partial failure without duplicates).
- **Verified:** tsc + 778 tests (28 new); demo 8093 on t7: template, 5 pasted rows → 2 / 2 / 1, chip
  fix → 3 / 1 / 1, 4 matches created at the right local times; 375 px. Not verified: partial-failure
  retry, real file dialog, native Share fallback. No migration.

---

### 2026-10-09 — Alert choices per followed player, team or tournament (🔔 bell sheet) (parity #23)

- **Ask (parity queue #23):** a parent wants "match starts" and "result" for the meet without a buzz
  for every tackle; the only way to quieten alerts was to unfollow.
- **Migration 0047** `20261019122300_follow_prefs.sql` (bundle `2026-10-follow-prefs-0047.sql`) —
  founder to run: `follows.prefs jsonb` (only OFF switches; null = all on); `pg_net` + security-definer
  `notify_match_status()` with a **status-only** trigger (`after update of status … when old.status
  is distinct from new.status`, REVIEW row 23) posting to notify-followers with Vault secrets
  (`notify_followers_url`, `webhook_secret`, optional `functions_anon_key`); no-ops if unset, never
  blocks a status write. PGlite followprefs 25/25 (+ all suites green; harness gained pg_net/vault stubs).
- **Data:** pure `data/followPrefs.ts` (`ALERTS` per type — player: before they play / starts /
  result / goals-wickets-big-moments; team & tournament: starts / result; no `award` until #21's
  fan-out exists), `followStore` prefs, repos get/set prefs, hydrated with follows; client gates in
  `reminders.ts` and `useLiveMatch.ts`.
- **Server (code only — founder deploys):** notify-followers `sendToProfiles` + `followersOf`
  (prefs-aware with fallback); stat branch keeps #05's headline diff and drops `scores:false`; new
  `match_status` branch (start/result to followers of both teams, the tournament and squad players,
  filtered, de-duped via `reminder_sends`). notify-upcoming skips `reminder:false`.
- **UI:** `FollowBell` (🔔 / 🔔• / 🔕, only while following) + `FollowAlertsSheet` on Following,
  player profile, team, tournament and Discover team rows; Notification settings card.
- **Fixed:** the scorer-device follower stat alert passed `playerId`, which `notify()` treats as the
  recipient — it pushed to the goal scorer instead of showing to the follower.
- **Verified:** tsc + 750 tests (10 new); Deno functions type-checked with shims; demo 8093: bell,
  untick scores → dot, the muted player's goal gives no alert while another's does, re-follow resets,
  team/tournament sheets show Start + Result only; 375 px.

---

### 2026-10-09 — Global search: players, teams, matches, tournaments (parity #22)

- **Ask (parity queue #22):** Discover could only search players by name; teams were an
  unsearchable list and matches/tournaments couldn't be searched at all.
- **Data:** pure `data/search.ts` (`parseVsQuery` "Red vs Blue", `orSafe`, `rankByName` exact →
  starts-with → word-start → contains, id-list cap at 50, deleted-tournament filtering); repos
  `searchTeams` (club teams collapse into one hit; `club_id` read tolerantly), `searchTournaments`
  (soft-deleted excluded), `searchMatches` (teams + tournaments, "A vs B" both sides either order,
  all matches of deleted tournaments dropped), `searchAll` (`Promise.allSettled` — a failed type
  shows a note, the rest render), demo branches; `useGlobalSearch` (debounced, keeps previous
  results). `teamSearch.filterTeams` shares the name matcher.
- **UI:** Discover "🔍 Search" mode — one box (✕, autofocus), count chips All · Players · Teams ·
  Matches · Tournaments, All tab with 3 per type (exact hit's section first, see all), "Not on app
  yet" pill, empty state, browse content when empty, sport chips narrow every type; Home 🔍 button;
  shared `navigation/openMatch.ts`.
- **Verified:** tsc + 740 tests (12 new); demo 8093 at 375 px: "re" counts, "Red vs Blue" only
  Red–Blue (11), hits open the right screens, Home 🔍 focuses, phone/email + filters work. Not
  verified: live PostgREST filters / partial-failure path. No migration.

---

### 2026-10-09 — Tournament awards (Awards tab) + change Player of the Match once (parity #21)

- **Ask (parity queue #21):** organisers worked out best player / top scorer / best bowler by hand
  at the closing ceremony; scorers couldn't correct an auto POTM when officials picked someone else.
- **Migration 0046** `20261019122100_awards_and_potm.sql` (bundle `2026-10-awards-potm-0046.sql`)
  — founder to run: `tournaments.awards jsonb`, `matches.potm jsonb` (existing RLS covers both;
  PGlite 11/11). Before it: suggestions render, Publish / Change show the migration notice.
- **Data:** `ratings.ts` `TOURNAMENT_AWARD_SLOTS` per sport, `rankAwardCandidates` (MVP-weighted or
  `leadersByKey`; cricket weights gain catches), `defaultAwards`, `resolvePotm` (stored override →
  legacy `s.potm` → computed MVP, so a #05 correction never replaces an official POTM — REVIEW
  Decision 10). repos get/save awards, get/set POTM ("once" via `by`), each in its own select.
- **UI:** Awards tab after Stats (hosts always; viewers once published) — pre-filled
  "Auto-suggested" slots, `AwardPickerSheet` (ranked, "How is this ranked?"), custom awards (Fair
  play…), publish confirm → activity log + notify new/changed winners, published cards + "📤 Share
  awards" (`awardsShareText`). Summary "Change Player of the Match" (every sport) → home/away picker
  → once-only confirm → "Chosen by officials". Cricket's old POTM chip picker removed (reducer kept).
- **Verified:** tsc + 728 tests (20 new); demo 8093: t1 suggestions, change slot, Fair play,
  publish, viewer gating on t5, POTM change on football f1 and cricket ck1 (survives reload); 375 px.
  Not verified: live pre/post-migration path, notification delivery.

---

### 2026-10-09 — Cricket penalty, bonus & minus runs to either side; dropped catches, runs saved/missed (parity #20)

- **Ask (parity queue #20):** local rules (bonus for hitting the net, −5 per dismissal) and umpire
  penalties against either side; only "Penalty +5" to the batting side existed, with no reason;
  coaches want to know who dropped catches.
- **Engine:** `PENALTY {against?, reason?, teamName?}` (default against the fielding side = old
  behaviour, old events replay identically); runs go to the other side as extras, raising the chase
  target when they go to the side that batted first (even after a #18 revision). New `ADJUST`
  (± runs, not extras, may go negative, can win a chase) and `FIELD_NOTE` (drop / saved / missed,
  tied to the last ball's batter and bowler via `lastBall()`). Ball log gains `adj` and `cross`
  records so extras, Manhattan and partnerships stay right; `statTotals` adds `dropped`,
  `runsSaved`, `runsMissed`.
- **UI:** "⚖️ Penalty" (who's penalised, Law-based reason chips, dead-ball hint), "± Bonus" (bonus /
  minus, team, runs, reason) and "🧤 Fielding" (caption "For ball 4.3 — Asha facing Varun") inline
  panels with reducer previews; scorecard "Bonus/deductions" and "Fielding:" lines; profile Drops /
  Runs saved / Runs missed.
- **Also:** demo store's stat-line id counter now moves past restored `sl-N` ids (a reload mid-match
  could reuse an id and silently drop a line).
- **Verified:** tsc + 708 tests (18 new cricket-penalty); legacy replay identical (20,690 steps vs
  HEAD); demo 8093 box preset: +2 / −5 previews = results, innings-2 penalty raises the target, drop
  in timeline, scorecard and profile ("Drops 1"); 375 px. No migration.

---

### 2026-10-09 — Cricket scorecard depth (FoW, partnerships, extras, maidens, overs) + complete profile stats (parity #19)

- **Ask (parity queue #19):** coaches want fall of wickets and partnerships, parents want strike
  rate and economy; profiles showed only runs and wickets, and Nb+n runs never reached them.
- **Engine:** derived `BallRec` log (one record per delivery / penalty, built from the change in
  totals so it can't disagree with the scorecard; local-rule legal wides, penalties, #16 kinds),
  never persisted — generic `SportPlugin.snapshot?` drops it from `matches.state`; the scorecard
  rebuilds it by replay. Pure `sports/cricket/scorecard.ts`: extras breakdown, FoW, partnerships,
  over history, bowler splits (maidens; a shared over is no maiden), `statTotals`.
- **Stat lines:** generic `SportPlugin.statTotals?`; pure `data/statSync.ts` `planStatSync` (maps
  through disputes via the shared `mapThroughDisputes`/`disputeMapper`, absolute values, writes only
  changed rows — REVIEW must-fixes); repos `syncMatchStatLines` (live + demo). `useLiveMatch` syncs
  on completion, undo and live amend (waiting for in-flight increments), then snapshots. For a
  finished match with `statTotals`, #05 corrections run the absolute sync instead of deltas (no
  double writes / pushes). `Nb+n` now credits the striker (pad, typed, voice, #06 edits).
- **UI:** InningsCard extras "(lb 1, wd 1, nb 1)", FoW line, bowling O M R W 0s Eco with "1wd 1nb",
  collapsible partnerships with bars, collapsible Manhattan (tap a bar → its ball chips);
  `data/cricketCareer.ts` + Sport profile Batting / Bowling / Fielding grids (Avg, SR, Econ, Best).
- **Verified:** tsc + 690 tests (27 new); demo 8093: the spec's over on m9 → 10/1, FoW "1-10 (Aarav
  Mehta, 0.4 ov)", 1.0-0-9-1, maiden, partnership 10; stat lines written once, undo/re-score not
  doubled; profile SR / Econ; 375 px. Not verified: live Supabase writes / pushes. No migration —
  but **#05's notify-followers diff must be deployed before this ships** (sync updates rows).

---

### 2026-10-09 — Cricket overs & target: change overs anytime, manual target, correct DLS, "(DLS)" result (parity #18)

- **Ask (parity queue #18):** overs could only be reduced and only with DLS on at setup; revised
  targets were wrong outside 50 overs (a T20 chase of 160 cut to 10 showed 122 — correct is 91);
  results never said "DLS".
- **dls.ts:** Standard Edition table (`Z0` 0-wicket column + 8 anchor rows, interpolated);
  old exponential fit kept as `resourcePctV1` for legacy replays.
- **Engine:** gate per REVIEW Decision 8 — the first `v: 2` RAIN (or any SET_OVERS / SET_TARGET)
  sets `dlsV = 2`; legacy RAIN replays byte-for-byte (1,500 fuzzed legacy matches + seeds identical
  vs HEAD). New `SET_OVERS` (up or down, any innings, no DLS needed; recomputes #17's auto quota),
  ball-accurate v2 RAIN, innings-switch target from both sides' resources, `SET_TARGET` (manual,
  locks DLS), `outcome(s)` (margin vs the revised par + " (DLS)" / " (revised target)") used by the
  result line, plugin result, summary winner and the tie check. A match already carrying a legacy
  rain cut stays on the legacy maths (no unit mixing for matches live across the update).
- **UI:** "⏱ Overs & target" card (Change overs / Rain (DLS) / Set target), previews run the
  reducer (no duplicated maths), clock "7.3 / 15 ov · DLS", "Target 113 (DLS)"; help guides
  rewritten.
- **Verified:** tsc + 663 tests (cricket-dls 18, cricket-overs 28); spec cases A–F exact; demo 8093:
  20 → 12 overs, manual target, rain preview "revised target 34 in 5 ov", banner "won by 15 runs (DLS)".
  Known: the spec's interpolation dips slightly (≤ 0.26 pts) in u for 6–9 wickets down; losses are
  clamped ≥ 0 so a target can't rise from it. No migration.

---

### 2026-10-09 — Cricket bowling rules: per-bowler quota, mid-over replacement, next-over rule (parity #17)

- **Ask (parity queue #17):** nothing stopped a star bowler's fifth over in a T20; an injured
  bowler's replacement was a silent chip tap, and the starter could then bowl the next over.
- **Engine:** `bowlerMaxOvers` format field (0 = auto: overs ÷ 5 rounded up, none for Test) on all
  presets; `autoQuota`, `recomputeQuota` (RAIN; #18 reuses it), `canBowl` (unavailable / suspended /
  last over / this over / quota), `touchBowler` on every delivery (part-overs count; starter AND
  finisher of an interrupted over sit out the next). SET_BOWLER's new rejections apply only to
  `v: 2` payloads (REVIEW Decision 8) — the new UI always sends it; `force` overrides only the
  quota ("Quota override"); a mid-over change with a reason logs "🚑 BOWLER REPLACED", suspended
  bars the bowler for the innings. #06 "change this over's bowler" corrections drop `v` so a fix
  is never re-judged by the live checks.
- **UI:** chips "Name · 1/2", "· last over", "· quota done", "· this over"; chips lock once the
  over has started; "🚑 Replace bowler mid-over" panel (Injured / Suspended / Other); "Everyone has
  bowled their quota" → Allow anyway.
- **Compat:** legacy logs identical vs HEAD (seed + 400 fuzzed logs, 42k states).
- **Verified:** tsc + 627 tests (20 new cricket-bowling); demo 8093 T10 m9: 0/2 → 1/2, replacement at
  2.1 splits 0.1 / 0.5, neither bowler offered next over, quota done disables. Not verified in UI:
  Allow anyway, Suspended. No migration.

---

### 2026-10-09 — Cricket dismissals: retired out, Mankad, hit twice, obstructing, stumped off a wide, run-out end/2nd fielder/byes (parity #16)

- **Ask (parity queue #16):** retired-out, Mankads and stumpings off wides couldn't be recorded;
  run-outs credited byes to the batter, had no 2nd fielder and misplaced the new batter.
- **Engine:** new kinds `retiredout`/`mankad`/`hittwice`/`obstruct` (none the bowler's wicket);
  `composeDismissal` with fielder 2 ("run out (A/B)", Mankad "run out (Bowler)"); `creaseAfterWicket`
  driven by "wicket broken at" (`end`); `runsAs` bye/leg-bye on run-outs and obstructions (bowler not
  charged, chips `2b+W`/`2lb+W`); EXTRA `wicket` (legacy `runout:true` still maps) with stumped / hit
  wicket off a wide (bowler's wicket, penalty in force from #14); shared `wicketAttribution` (the
  run-out striker credit lives only here — REVIEW Decision 6). `ballRuns` now decodes wicket chips
  with extras (`wd+W` used to count 0).
- **UI:** six main chips + "More ▾"; run-out/obstruct steps (runs were → runs → fielder 1 → optional
  2nd fielder → who's out → broken at → "Next ball: X faces"); off-a-wide / off-a-no-ball toggles;
  Mankad auto non-striker; free-hit kinds; extras pad opens only the wickets allowed there; over
  editor knows hit twice / obstructing.
- **Compat:** legacy logs identical vs HEAD (seed + live + 3,000 fuzzed games, ~120k actions).
- **Verified:** tsc + 607 tests (33 new cricket-dismissals); demo 8093 m8: Mankad, stumping off a
  wide, 2-fielder run-out off a bye, retired out, undo; fits 375 px. Not verified: free-hit panel in
  the demo; Mankad rating by test (lives in .tsx). No migration.

---

### 2026-10-09 — Cricket run entry: 5/7/custom, overthrows, all-run 4s, extras values (parity #15)

- **Ask (parity queue #15):** school grounds mean 1 + 4 overthrows, run 5s, all-run 4s, Wd+3 and
  Nb+5 — none enterable, so scorecards drifted from the paper book.
- **Engine** (no new action types): `clampRuns` (0–99) on every runs payload; RUNS / no-ball
  `boundary?` + `overthrows?` (missing flag = legacy, 4/6 count as boundaries, so old logs replay
  identically — checked against HEAD on 782 seed events × 4 configs); chips `'4r'` / `'5ot'`, labels
  "5 runs (incl. 4 overthrows)" / "4 runs (all run)"; exported `runSymbol`, `ballRuns`, `symbolTone`,
  `penalty(kind, rules)` (#14's value in force). #06's over editor reuses them.
- **UI:** run pad 4/6 send `boundary: true` + a `5·7·+` key → All run 4/5/7, an Overthrows builder
  ("= 5 to Sanjay · not a four"), a 0–99 input; bye/LB 1–5 + input; wide 0–4 labelled with the
  total (`Wd+3 (=4)`) + input; no-ball off-bat 0–6 + all-run input; over-strip ot/r captions. Voice
  accepts 0–7, "five"/"seven", "all run".
- **Verified:** tsc + 574 tests (19 new cricket-runs); demo 8093 on m8: overthrows, all-run 4, Wd+3,
  Nb+5 → scorecard runs/4s/extras/bowler right; undo walks each back; fits at 375 px. Not verified:
  native layout, voice at runtime. No migration.

---

### 2026-10-09 — Cricket local rules + generic live settings card (parity #14)

- **Ask (parity queue #14):** school/gully cricket plays wide = 2, no-ball counts as a ball, normal
  rules in the last 2 overs; scorers were fixing totals by hand, and umpires change rules mid-match.
- **Generic:** `SportPlugin.liveSettings` (`mode: 'event' | 'config'`, `beforeStart`, `FormatField.group`)
  + `components/LiveSettingsCard.tsx` (Info tab and #13's ⚙️ Quick options tile) — the only
  per-match settings mechanism (REVIEW Decision 2). Pure `sports/liveSettings.ts` (apply as format
  patch vs event, who can edit, "N custom" pill). Football's inline card moved onto it (mode config,
  same behaviour).
- **Cricket:** `sports/cricket/rules.ts` (`CricketRules`, `STANDARD_RULES`, `rulesFromConfig`/`rulesToConfig`
  with byesAllowed⇄byes mapping, `effectiveRules` incl. "standard in the last N overs",
  `LOCAL_RULE_FIELDS`); engine `SET_RULES` event (from the next ball; Super Over always standard;
  undo-able), wide/no-ball penalty and legality, free hit per rules, disabled byes rejected in the
  reducer. Before ball 1 (toss doesn't count) Apply patches `matches.format` instead. Pad hides
  disabled byes, prompts show the penalty, "⚙️ Local rules: Wd 2" chip. #06 over-editor symbols
  follow the rules in force.
- **Compat:** default rules replay every seed/live/synthetic log identically (902-action side-by-side
  check against HEAD); cricket, seed, replay-wave1, cricket-edit, amend tests green.
- **Verified:** tsc + 555 tests (28 new cricket-rules, 3 football); demo 8093: Wide = 2 mid-over on
  m8 (past wide stays +1, next +2, chip, timeline, second tab, undo, byes off), m9 pre-start format
  patch, football card unchanged. No migration.

---

### 2026-10-09 — Match housekeeping: clone, delete a played match, breaks, quick-options sheet (parity #13)

- **Ask (parity queue #13):** test matches couldn't be removed; rematches rebuilt by hand; breaks,
  keeper changes, squad fixes and the scorecard scattered mid-match.
- **Migration 0045** `20261019121300_match_delete_played.sql` (bundle `2026-10-match-delete-played-0045.sql`)
  — founder to run: the "delete match" policy keeps pre-match deletes for `can_manage_match`, and adds
  live / completed-within-30-min deletes for **friendly hosts only** (no `matches.created_by` column;
  the creator is a host). PGlite matchdelete 19/19.
- **Data:** pure `data/matchHousekeeping.ts` (`cloneDraft` on the merged config — no officials /
  result / potm / internal flags; `BREAK_KINDS`; `deleteVerdict` delete/reset/none + minutes left).
  repos: `getMatchLastActivityAt`, `deleteMatch(id,{played})`, `setMatchBreak` (`format.__break` →
  `Match.onBreak`), `resetMatch` also clears result, potm, `__break` and the scoring lock (each
  tolerant of a missing column). Cricket `SET_KEEPER` logs "🧤 NEW KEEPER" after ball 1 when the
  keeper changes (stumpings credit the new keeper); `involvedPlayerIds`.
- **UI:** Info "🔁 Clone match" (friendly, prefilled + squads copied) and Danger zone (delete with
  window countdown / tournament "Reset fixture"); break banner + "▶ Resume play", BREAK tag on cards;
  `QuickOptionsSheet` (break, squad, scorer, scorecard, cricket Change keeper); played players locked
  in squad editors; "▶ Start scoring" on Matches cards; uneven-squads soft warning.
- **Verified:** tsc + 524 tests; demo 8093 clone/tiles/keeper/break/lock/delete window/reset. Not
  verified: the uneven warning click-through, live Supabase, potm clear (#21). Match settings tile
  waits for #14.

---

### 2026-10-09 — Admin edits player details: name, shirt number, photo, roles (parity #12)

- **Ask (parity queue #12):** 200 students added by phone come out as "Invited (…4821)"; only the
  person who typed each one could fix it. Co-organisers and captains need to correct names, shirt
  numbers and sides before scorecards go public.
- **Migration 0044** `20261019121200_admin_edit_player.sql` (bundle `2026-10-admin-edit-player-0044.sql`)
  — founder to run: `can_admin_player` (unclaimed + unreported player on a team / house team / club /
  host-side tournament team the caller manages — **every arm also requires the team or club to have
  been created by the player's creator**, so nobody can build a roster around someone else's player
  id and gain edit rights; REVIEW row 12's house-name and entered-team holes closed);
  `can_edit_player` + `guard_player_write` re-copied from 0025 with the admin arm. Admins never
  change a set phone/email, house, privacy flags, verification or `profile_id`. PGlite 37/37.
- **Data:** pure `core/playerEditAccess.ts` (`editAccess`, `adminPatch`); repos
  `getPlayerEditAccess`; `updatePlayer` now `.select('id')` and throws the friendly "You can't edit
  this player any more…" on 0 rows (RLS-filtered updates used to "succeed").
- **UI:** `EditProfile {asAdmin}` — "Edit player details", photo (both modes), shirt number, DOB
  optional, phone/email "On file", guardian recommended, no privacy/bio; entry points Squad "✎ Edit
  details", Sport profile "Edit ›", Player profile "✎ Edit player details"; Squad role chips per team
  (team's own sport); claimed players show "Manages their own profile".
- **Verified:** tsc + 514 tests; demo 8093: renamed an invited cricket player with shirt #7 + city,
  shows on squad/profile/sport profile; cricket role chips persist. Not verified: photo upload via
  the native picker, live RLS. Follow-up: cricket `BatCard.name` snapshots keep the old name.

---

### 2026-10-09 — Scorers and officials: tournament scorer pool, bulk assign, self-join, match officials (parity #11)

- **Ask (parity queue #11):** a meet's scorers were set up on the tournament but never reached the
  match pickers; assigning 40 fixtures meant 40 trips; a scorer whose phone died couldn't hand on
  without the organiser; umpires/referees had nowhere to live.
- **Migration 0043** `20261019121100_match_officials.sql` (bundle `2026-10-match-officials-0043.sql`)
  — founder to run: `matches.officials jsonb` (own column, never `format` — REVIEW Decision 3);
  `join_match_as_scorer(p_match)` (security definer, authenticated only): a tournament scorer appends
  themself to `scorer_ids` of a scheduled/live match of that tournament, else 42501. PGlite 17/17;
  scenarios/privacy/scoringlock/tournamentteams still green.
- **Data:** pure `data/matchOfficials.ts` (per-sport `OFFICIAL_SLOTS`, `normalizeOfficials`,
  `officialsLine`) and `data/scorerAssign.ts` (`planScorerAssignments`: rotate / by ground / one,
  only-unassigned, no same-time double booking when avoidable; legacy `scorerId` counts as
  assigned). repos: official add/remove now throw; `getMatchOfficials` (separate tolerant select,
  `available:false` before 0043), `setMatchOfficials`, `joinMatchAsScorer` (missing RPC → "Ask the
  organiser…"), `bulkSetMatchScorers` via `setMatchScorers` (so the #03 lock clears correctly).
- **UI:** "🎽 Scorers & officials" panel (PersonPicker per role, "🎯 Assign scorers to fixtures · N
  without a scorer") → new `AssignScorersScreen`; Live scoring: "Tournament scorers" block first in
  the scorer picker, "🎯 Score this match" self-join, "Match officials" card (slots, referee chips,
  name-only entry; viewers see filled rows only), muted officials line under the Summary.
- **Verified:** tsc + 509 tests (11 new); demo 8093: pool add, even split 4/3/3 + chip cycling +
  "✓ 10 assigned", self-join on live kabaddi, cricket umpires + football referee, viewer line.
  Not verified: live RLS, pre-migration notice, push delivery to other scorers, "By ground" in UI.

---

### 2026-10-09 — Tournament teams: search, edit team, confirmed removals, team admins, join by link/code (parity #10)

- **Ask (parity queue #10):** 30–60 school teams in unsearchable chips; no way to fix a misspelt
  team; removals without "are you sure?"; captains should enter their own team from one link; a
  captain should share squad duties with an admin.
- **Migration 0042** `20261019121000_tournament_teams_admin.sql` (bundle
  `2026-10-tournament-teams-0042.sql`) — founder to run: `teams.logo_url / city / admin_ids`;
  `can_manage_team` + `guard_team_write` re-copied from their latest bodies with admins added
  (organiser still not a team manager — deliberate); `tournament_invites` (one live link per
  tournament) + RPCs `tournament_invite` (mint `T-XXXXXX` / turn off), `get_tournament_invite`
  (rate-limited, VOLATILE), `redeem_tournament_invite` (link on, you manage the team, sport
  matches, capacity/deadline; confirmed; a pending/invited entry is upgraded). PGlite 35/35;
  re-applying the bundle is idempotent.
- **Data (helper agent):** pure `teamSearch.filterTeams`, `tournamentInvite` (parse/link/message);
  `canManageTeamLocal` counts admins; repos `updateTeam`, `getTeamDetails`, `setTeamAdmins`,
  `getLiveTournamentInvite/setTournamentInvite/getTournamentInvite/redeemTournamentInvite`,
  `getTeamsSetup`, `deleteTeam` (zero matches only), `removeTournamentTeam` throws;
  `NeedsDbUpdateError` → UI shows "Needs the latest database update" and hides only that part.
- **UI (helper agent):** TournamentTeams — search (30 + "Show all"), "Teams can join by link"
  switch with code / WhatsApp / Copy link, next-step subtitles ("No captain yet"), Edit link,
  every decline/cancel/withdraw/remove/Save-that-drops confirms (suggests Withdraw when fixtures
  exist). New EditTeam (logo, name, short, colour, city, delete) and JoinTournament
  (`join-tournament/:token`, public screen → sign in and back; your teams + new team + division →
  Enter); JoinTeam forwards `T-` codes. Squad: "✎ Edit team", "Make admin" chip + Admin pill.
- Verified in demo (8093): search, confirms, rename Gold → Golden House, make admin (persists),
  link on → typed code → entered Blue House (Confirmed) → link off → "This link is turned off".
  Tests: teamSearch, tournamentInvite, team-permissions (+admin). 498 tests.

---

### 2026-10-09 — Tournament form: banner/logo, city, grounds, category, sport basics, contact, rules, delete (parity #09)

- **Ask (parity queue #09):** teams and parents ask where, what kind, who to call, what rules — none
  of it was on the form (it went on a WhatsApp poster); a test tournament couldn't be deleted.
- **Migration 0041** `20261019120900_tournament_profile.sql` (bundle `2026-10-tournament-profile-0041.sql`)
  — founder to run: `city, grounds text[], event_category, about, organiser_phone, organiser_email,
  deleted_at`. Reads try profile cols → registration cols → base; `saveTournamentDetails` returns
  false before the migration (logo still saved) → "Banner, grounds and contact will save after
  the server update." `createTournament` / `updateTournament` take the details and report
  `profileSaved`.
- **Soft delete:** `deleteTournament` (refused while a match is live; upcoming matches cancelled;
  completed kept; activity log). One predicate `tournamentForm.isLiveTournament`: `getTournaments`
  (unless `includeDeleted`), `getTournament`, and `getMatches` (a deleted tournament's unfinished
  matches drop out; results stay on profiles). The tournament page says "This tournament was
  deleted by the organiser."
- **Form (helper agent):** `TournamentDetailsFields` on Create and Edit — banner + overlapping logo
  (#01 uploads), City (from host org), Grounds chips (suggested from past venues), Category chips
  (prefilled from org type), "{Sport} basics" inline (`FormatField.onCreate` + presets via
  `SportFormatEditor onlyKeys`; cricket ball type + new pitch type; chess none), organiser
  phone/email, About & rules (≤4000). Edit: per-sport `patchTournamentFormat` kept (#07), sticky
  "Delete tournament" | "Save changes". **Info tab:** category pill, 📍 city + grounds (→ Maps),
  basics line, About & rules (Markdown), Contact organiser (Call / WhatsApp / Email). Schedule /
  Edit match venue chips lead with the tournament's grounds; one ground → prefilled.
- Verified in demo (8093): create cricket tournament with every field → Info shows it → Edit
  prefilled, saved round-trip → schedule a match lists grounds first → Delete confirms, hides it,
  deep link shows the notice. Tests: tournament-form (4). 488 tests.

---

### 2026-10-09 — Tournament admin hub + post-create setup checklist (parity #08)

- **Ask (parity queue #08):** after creating a meet the organiser landed back where she started;
  changing "3 points a win" was three levels deep; Settings was an unordered stack of buttons.
- **Checklist:** pure `data/setupChecklist` (teams ≥2 · format set for every sport or matches exist ·
  matches scheduled; "Add players" for individual events) + `SetupChecklist` card ("Tournament
  created — 3 quick steps" / "Finish setting up · 1 of 3", next step highlighted, Hide remembered
  per device in AsyncStorage `setupHidden:<id>`, gone when all done). Create now lands on
  `Tournament {tab: 'Settings'}`; Info shows "Setup 1/3 · Continue ›" for managers.
- **Hub** (Settings tab): grouped `HubRow`s — Tournament (Edit details · one "format & points" row
  per sport with `describeStructure` + W/D/L points · Points table), Teams, Matches (schedule /
  auto-generate or Americano · series · share/print), People (Scorers & referees inline · Hosts),
  More (Player reminders inline · Ownership & history inline); one panel open at a time
  (`useParamState('panel')`). Existing card bodies moved unchanged. "⚙ Manage" in the header for
  managers.
- **SportSettings direct save** (`{sport, tournamentId}`): seeds the draft from the tournament,
  "Save" = `patchTournamentFormat` with only the changed keys vs the SAVED format (#07, so
  adjustments survive), recording the shown default structure too; then the coarse structure label.
- GenerateFixtures: "Add at least 2 teams first" + "Add teams" when there are <2 participants.
  `useTournamentById` returns a fresh object on focus (demo updates in place → no re-render).
- Verified in demo (8093): create → Settings with 0/3 card + ⚙ Manage → format row → Save →
  "Single league … · 3/1/0", card 1/3 → reminders panel inline → Hide persists across reload.
  Tests: setupChecklist (5). 484 tests.

---

### 2026-10-09 — Points table: one table per phase, bonus/penalty adjustments (parity #07)

- **Ask (parity queue #07):** Standings mixed groups and knockouts in one flat table; a points
  deduction (late arrival) or bonus needed the hand-typed "Scorecard" mode.
- **Data (helper agent, no migration):** `formats[sport].pointsAdj` = JSON list of
  `PointsAdjustment {id, teamId, points (signed), reason, phase?, byName?, at}`;
  `standingsConfigFromFormat` parses it (bad JSON/rows ignored, key omitted when empty);
  `TeamStanding.adjust` added to points before ranking, per `phaseKey`; head-to-head ignores
  adjustments; SB uses points without them. `groups.standingsPhases` → league → Group A… → Super →
  Swiss, elimination stages dropped (#04's `isEliminationStage`); `groupTables` passes the phase so
  adjustments feed qualification; `useStandings` returns `phases`.
- **Every tournament-format write is now a fresh read → merge → write**: `repos.patchTournamentFormat`
  (+ pure `formatPatch.mergeSportFormat`, `formatDiff` so callers send only the keys THEY changed)
  — Edit tournament, Generate fixtures, Americano and manual Standings used to save a whole
  `formats` from a stale copy and would erase adjustments (REVIEW Decision 5).
  `savePointsAdjustments` + activity log `points.adjusted`.
- **UI:** StandingsScreen — one table per phase (P/W/D*/L/NR*/NRR*/Pts, `12*` when adjusted,
  public footnotes "Red House −2 · late arrival · by Priya, 12 Oct"); managers get ± per row → −/+
  stepper (±20), required public reason, Save; existing adjustments with ✕ (confirm). Tournament
  Stats tab and the sport hub use the same phases (no knockout rows). LeagueTable shows `*`.
- Verified in demo (8093): t1 football — Red House −4 "late arrival" → re-ranked 1st→3rd, footnote
  + `*`; ✕ confirms and restores. Group splits covered by tests (no grouped demo tournament).
  Tests: standings-phases (10). 479 tests.

---

### 2026-10-09 — Cricket: edit a specific past ball, bowler or batter (parity #06)

- **Ask (parity queue #06):** a 1 tapped for a 4 in over 3, noticed in over 7 — undo would wipe four
  overs. Fix that one ball (or an over's bowler, or a wrong batter) and have totals/figures/strike
  recompute.
- **Engine (helper agent):** `alignCrease` — each ball's RECORDED striker is the truth (swap ends
  first if the recorded striker is at the non-striker's end); byes/leg byes/wickets/extras now
  credit the recorded striker (they used the current crease). Live-recorded logs replay
  identically; the old seed generator didn't swap ends after a last-ball wicket, so some
  intermediate crease fields differ on seed replays (scores, cards, final states identical;
  existing cricket/seed/replay tests unchanged and green).
- **Pure `cricket/editOvers.ts`:** `editableOvers` (innings → overs newest first → ball chips with
  stamp/sym/category/crease), `editBall` (spreads the original payload, passes non-ball actions
  through, category fixed — REVIEW), `remapPlayer`, `changeBowlerOps` (this over / all overs,
  consecutive-over error), `swapBattersOps`, diff lines ("Ball 2.3: 1 run → 4 runs", "Over 3
  bowler: Arjun → Kabir", "Swapped records: Ravi ⇄ Dev"), `applyOps`.
- **UI `cricket/OverEditor.tsx`** = cricket's `CorrectionEditor` (#05 slot; cricket now
  `correctable`): collapsible innings, over rows (bowler + batters links, coloured chips, staged
  outline), inline Edit-ball card (runs · off bat/bye/leg bye · who faced; out type · fielder ·
  run-out runs/end; wide ⇄ no ball +0–4), replace bowler (this over / all overs), swap batters;
  unchanged saves aren't staged. **Live:** "✎ Edit a past ball" beside Undo for the lock holder
  (disabled while taps are unsynced — REVIEW) → inline editor → "Update score (n)" = one AMEND via
  the outbox (`useLiveMatch.amend`) → "Who's on strike now?" if the rebuilt crease changed.
  **Post-match:** inside #05's Correct match (Preview → Publish).
- Verified in demo (8093): live m8 ball 9.1 1→4 → 118/6 → 121/6, Undo reverts; 2nd-innings 6.3
  3→2 → 72/3 → 71/3 (no strike prompt: the demo log pins the final crease); ck1 Correct → ball
  9.2 1→4 → Preview 104/6 → 107/6 → Publish → Score edits. Tests: cricket-edit (new) + all
  cricket/seed/replay/amend green. 469 tests.

---

### 2026-10-09 — Correct a finished match: preview, publish, public "Score edits" (parity #05)

- **Ask (parity queue #05):** after full time a wrongly credited goal or a phantom point was frozen
  in — stats and the table stayed wrong.
- **Model (no migration):** a correction is ONE append-only `AMEND` event `{ops: replace|void by
  seq, lines, byName, deltas}`; these rows are the public log. Pure engine `sports/amend.ts`
  (helper agent): `effectiveLog` (ops applied, last write wins, void wins), `replayLog`,
  `attributionTotals`, `statDeltas`, `completedAt` (max of last scoring event and a #04 manual
  end), `eventSeqs`, `undoAmendDeltas`. `useLiveMatch` replays through `effectiveLog`, rebuilds on
  a realtime AMEND, and undoing an AMEND reverses its STORED deltas exactly (REVIEW).
- **Publish** (`data/amendments.ts`, standalone — post-match needs no offline queue):
  `planAmendment` → deltas mapped through the one shared `repos.mapThroughDisputes` (pure
  `eventLog.followDisputes`, REVIEW must-fix), only non-zero rows written; then the snapshot (a
  #04 manual result is kept by `updateMatchSnapshot`) and, for a manual result, its stored score
  refreshed via `endMatchManually` (the only result writer). `getScoreEdits` reads the log.
- **notify-followers** now diffs `old_record` and pushes only when a headline stat ROSE — a
  correction or rewrite pushes nothing (REVIEW must-fix). **Not deployed — founder deploys before
  corrections go live** (and ship an OTA first: older builds ignore AMEND rows).
- **UI:** Info → "✏️ Correct this match" (`canCorrectMatch`: scorers + match hosts for 24 h,
  tournament hosts anytime; "Open for 17 h 40 m more"; disabled "Waiting for unsynced taps to
  upload." while the outbox has events; hidden for sports with `correctable:false` — cricket until
  #06) → confirm → new `CorrectMatchScreen`: generic `EventCorrectionList` (team actions newest
  first, ✕ Remove / ✎ Player, staged by record seq) or a sport's `CorrectionEditor` → Preview
  (score + result before→after, per-player stat impact, changes; Publish blocked if the match
  would be unfinished) → Publish. Info shows the public **Score edits** card; the screen replays on
  return.
- Verified in demo (8093): football m1 (awarded) → remove Rohan's goal → preview 2–1→1–1, goals −1
  → publish → Score edits entry, scoreboard 1–1, result kept; cricket m8 has no button. Tests:
  amend (21), event-log (+1). 448 tests.

---

### 2026-10-09 — End a match by hand: abandoned, no result, draw/tie, conceded, awarded — with the reason (parity #04)

- **Ask (parity queue #04):** the only exit was "End early — retirement / walkover": it forced a
  winner, dropped the reason (`retireMatch(_, _, _reason)`), its banner was local state, and
  abandoned games couldn't share points.
- **Step 0 — live bug fixed first:** `LiveScoringScreen` replayed with `m.format ?? tour.formats[sport]`,
  so ANY per-match format key (football settings card, `__walkover`) made a tournament match lose
  the tournament's overs/halves. New pure `core/matchConfig` (`stripInternal`, `mergeMatchConfig`
  = tournament format + per-match keys, `__*` dropped), memoised by JSON.
- **Result model:** `MatchResult {kind: awarded|conceded|draw|tie|no_result|abandoned, winner?,
  reason, countNrr?, score?, byId, byName, at}` in `matches.result` — the ONLY result store (REVIEW
  Decision 1); status stays `completed`. **Migration 0040** `20261019120400_match_result.sql`
  (bundle `2026-10-match-result-0040.sql`) — founder to run. Reads go through `withMatchCols`
  (retries without `result`); `endMatchManually` returns `'legacy'` before the migration (outcome
  saved the old way — NR/abandoned → `cancelled` by direct update — plus a notice). It clears the
  scoring lock (#03) and re-flags `won` via extracted `flagWinners`. `retireMatch` wraps it
  (awarded); `walkoverMatch` also writes `{conceded, 'Walkover'}`. `toMatch`: the manual result's
  winner/score win. **`updateMatchSnapshot` never overwrites a manual result** (stays completed,
  winner/won untouched) — pure `snapshotOutcome` (REVIEW must-fix; covers #05 AMEND + stale devices).
- **Text:** `core/matchResult.manualResultLine` ("Match abandoned — Rain", "Blue won — Red
  conceded", "Red awarded the match — Injury", "No result — …", "Match drawn/tied") on the
  MatchCard footer, share text, a saved banner on Scoring/Info/Summary, and cricket's Summary
  (`SummaryProps.manualResultLine`, no LIVE card for a match ended early).
- **Standings (helper agent):** `noResultPoints(sport, cfg)` (cricket 1, others 0; `nrPoints`),
  NR/abandoned → played+1, nr+1, +points, no for/against/rate; `countNrr:false` keeps points but
  not runs/rate; cricket `manualRate` charges both sides full overs (registry passes `manual`);
  head-to-head gives each side NR points (was an away win) and SB/ratio skip NR; LeagueTable NR
  column when any; PointsEditor "No result" 0–3; teamStats skips NR. `isEliminationStage` in
  bracket.ts (KO stages + third/q1/q2/eliminator/play-in).
- **UI:** "🏁 End match…" (scorers + hosts, once started): How did it end? (Win · Conceded ·
  Draw|Tie · No result · Abandoned; knockouts only Win/Conceded — "Knockout: pick who goes
  through."), Who wins?, reason (required, chips Rain · Bad light · Ground unfit · Time up · Injury
  · Team left), cricket "Count in NRR (all overs)", live preview incl. points-table effect.
- Verified in demo (8093): cricket m8 Abandoned/Rain → banner, card "Match abandoned — Rain",
  Stats table 1NR each (+1, runs excluded); football m1 Win/Time up → "+3". Tests:
  match-result (5) + match-result-standings (13); standings/tiebreakers unchanged. 426 tests.

---

### 2026-10-09 — One active scorer: scoring lock, take over, hand over, server-ordered events (parity #03)

- **Ask (parity queue #03):** two scorers tapping the same match overwrote each other (each phone
  numbered events locally; `mergeBySeq` de-duped by seq), undo removed the other phone's ball,
  and `appendMatchEvent` IGNORED insert errors — a collision or RLS denial counted as synced and
  the outbox dropped the tap.
- **Server (migration 0039 `20261019120300_scoring_lock.sql`, founder to run):** `matches.active_scorer_id /
  _device / _at`, `match_events.client_id` (unique per match). RPCs `claim_scoring` (free, mine,
  or `takeover`), `handover_scoring` (+ activity_log in tournaments), `release_scoring`,
  `append_match_event` (can_manage_match AND lock holder; server assigns seq; a retried client_id
  returns its seq; first tap on a free match takes the lock), `pop_match_event` (atomic, holder
  only). Trigger `guard_match_event_write` blocks direct client writes by non-holders. Per REVIEW
  the lock only applies while the match is scheduled/live: `clear_scoring_lock` drops it on
  completed/cancelled/postponed, reset (live→scheduled or state wiped) and when the holder leaves
  `scorer_ids`; afterwards managers can still write (post-match corrections). PGlite suite
  `scoringlock.mjs` 27/27.
- **Client:** `core/deviceId` (per device; web adds a per-tab sessionStorage suffix — REVIEW),
  pure `core/scoringLock.lockStatus` (unsupported/free/mine/mine-other-device/other) and
  `data/eventLog` (`mergeLog` by clientId, `eventKey`, `statReversals`, `isRejection`).
  `appendMatchEvent` now THROWS on any error (stuck, never lost); uses the RPCs, falling back to
  the old insert before the migration. `getMatchEvents` reads `client_id` tolerantly.
  `matchOutbox`: refused taps → `isRejected`, no retries, `discard()`. `useLiveMatch` gives each
  tap a clientId, gates writes on the lock, and `discardRejected()` reverses the stat lines those
  taps credited (REVIEW must-fix). Demo: in-memory locks + `__sportfolioScoring.takeover(id,
  name)`.
- **UI (LiveScoringScreen):** lock read on focus + every 15 s on Scoring; an allowed scorer
  auto-claims a free lock. Someone else scoring → card "**X** is scoring right now (last update…).
  One person scores at a time." + Take over (confirm) / Watch live. Losing the lock → banner
  "Scoring moved to X" + "N unsynced taps weren't saved" + Discard. Scorer list: "SCORING NOW" on
  the holder, "Hand over" (confirm → handover + push to them).
- Verified in demo (8093): football (auto-claim, takeover card + banner, queued tap rejected →
  Discard, Take over, Hand over moves SCORING NOW), cricket and badminton cards. Tests:
  scoring-lock (2), event-log (7), match-outbox (+2). 408 tests.

---

### 2026-10-09 — Squad permission gates + honest errors on captain/roster/role changes (parity #02)

- **Ask (parity queue #02):** every viewer of a team squad saw "Make captain", "Generate invite
  link" and the add box; a refused change looked saved, then quietly reverted.
- **Fix:** `repos.canManageTeam(teamId, ctx)` asks the server (`rpc can_manage_team`), falling back
  to the pure `core/teamPermissions.canManageTeamLocal` (organiser/support, captain/VC, captain
  store, club admin) in demo or on RPC error. `useTeamPermission(teamId)` → `{canManage|null,
  refresh}` (dev: `__sportfolioPerm.as('player')` previews as a viewer). `setTeamLeaders`,
  `setTeamRoster`, `setTeamPlayerRoles` now `.select()` and throw `TeamPermissionError` on 42501 or
  0 rows (deletes: error only). invitePlayer's auto-captain swallows a refusal (the add still
  works).
- **SquadScreen:** non-managers get a read-only squad (C/VC pills kept) + "Only the captain,
  vice-captain or team admins can edit this squad."; add box, leader buttons, Invite again and
  the invite card only for managers. `assignLeader` uses pure `nextLeaders`, confirms when a
  captain is replaced or you step down yourself, reverts + notice on failure.
  **ClubSportScreen:** captains/VCs can manage too; squad/captain/role changes revert + notice
  on failure. **TeamProfile:** "👥 Squad · ＋ Add" only for managers. OrganizationScreen roster
  errors surface.
- No migration (server rules already exist).
- Verified in demo (8093): support sees all controls; `as('player')` hides them with the hint;
  replacing a captain asks first, Cancel changes nothing, OK applies. `tests/team-permissions`
  (5). 397 tests.

---

### 2026-10-09 — Real image uploads: logos, banners, player photos (CricHeroes parity #01)

- **Ask (parity queue #01):** logos/photos were saved as device-local URIs (`file://`, `blob:`) —
  only the uploader's device could show them, and on web they vanished after a reload.
- **Fix:** `repos.uploadImage(img, kind)` uploads to a public `media` bucket at
  `<uid>/<kind>/<ts>-<rand>.<ext>` (ArrayBuffer — Blob uploads 0 bytes on Android; 5 MB cap) and
  returns the public URL; demo returns the local URI. `core/imageUrl.ts` (pure):
  `isLocalImageUri`, `displayableImage`, `mediaPath`, `extForMime`. `core/photo.ts` `pickImage()`
  (quality 0.6, aspect) → `{uri,mimeType,fileSize}`; `pickPhoto` kept for verification docs.
- `LogoPicker` (`kind`, `shape` square/circle/banner, async `onPick`): dimmed preview + spinner →
  upload → save; on any error it reverts and shows a notice. Callers await their repo call:
  match logo, tournament logo, **new tournament banner** (3:1, slim "＋ Add banner" strip for
  hosts, `setTournamentBanner` / tolerant `getTournamentBanner`), club logo (home + create), org
  logo. `ProfileView` photo uploads the same way. `setMatchLogo` / `setTournamentLogo` /
  `setOrgLogo` / `updateClub` now `.select('id')` and throw on error or 0 rows (RLS denial);
  `assertPersistable` refuses local URIs in live mode (also `updatePlayer.photoUrl`, `createClub`).
  Legacy `file://` rows render the placeholder/initials (ProfileView, ClubsScreen, LineupView).
- `delete-account` edge fn also clears the person's own photos `media/<uid>/player-photo/` — not
  logos they uploaded for shared tournaments/clubs (REVIEW) — not deployed, on request.
- **Migration 0038** `20261019120100_media_storage.sql` (bundle
  `supabase/release/2026-10-media-storage-0038.sql`) — **founder to run**: `media` bucket +
  uid-folder insert/delete policies + `tournaments.banner_url`. Until then uploads say "Photo
  uploads aren't switched on yet" and nothing local is saved.
- Verified in demo (8093, offline): banner, tournament logo and profile photo show immediately
  from a picked file, no network calls, no console errors. `tests/image-url.test.mts` (5).
  392 tests.

---

### 2026-10-08 — "📤 Invite again" next to everyone who hasn't joined; rosters by team id

- **Founder ask:** the first invite can go unsent (WhatsApp closed before Send) — there was no
  way to re-share it.
- **`RemindInstall` → "📤 Invite again"** pill → *WhatsApp · SMS · Share / Copy* (Share sheet;
  desktop web copies to clipboard; Share/Copy works even without a visible number). Shown for
  every pending (invited) person: the add box's pending list, match Info squad rows (managers
  only), matchday squad picker, team squad page, team profile squad, invited **scorers** and
  **hosts** (match + tournament; scorer/host get their own invite text). `HostsCard` gained
  `renderExtra`.
- Squad cards on match Info **open automatically for an empty team** you can fill, and stay
  open after adding. Confirmations never say "Invited Invited (…9401)"; a number invited earlier
  reads "Invited earlier — hasn't joined yet" (not "already on SportnNote").
- **Bug fixed — rosters looked up by team NAME:** two teams with the same name showed each
  other's players. `getRoster(name, sport, teamId?)` now uses the id wherever known (live match,
  matchday squad, squad page, team page; cricket batting order + pitch editor via the match).
- Verified in demo: invite a number → row shows "⏳ / 📤 Invite again" → WhatsApp opens with the
  new invite (+91, "Hi there!", app.sportnnote.in/i/… link). No console errors. 387 tests.

---

### 2026-10-08 — Invite links land on a sign-up page; "Not me" needs a confirm; placeholder names never greeted

- **Founder report:** a friend invited by number got "Hi Invited (…9401)!" and a link to a
  plain-text page ("ask the person who invited you for the download link") — no way to sign up.
- **Cause:** `*.supabase.co/functions` serves text/plain only (no buttons/links), and the
  greeting used the placeholder name.
- **Invite page** `app.sportnnote.in/i/<playerId>` (`InviteScreen`, public): "You've been added
  to <team> 🏆" + **phone sign-up right there** (PhoneLoginCard; sign-up claims the provisional
  player → placed in the team with their real name); Android download link; signed-in view
  ("✓ You're in <team>" → Open team). `joinLink`/`reportLink`/`clubJoinLink` now point at the
  app. Message: "Tap the link and sign up with this mobile number (1 minute, no password)";
  `realName()` never greets "Invited (…1234)".
- **Edge functions (deployed):** `join` GET → 302 to the invite page (old messages keep
  working), `?format=json` → `{team, teamId, claimed}` (teams.roster is jsonb → JSON contains).
  `report-invite` GET → 302 to the page's "Not you?" step (**records nothing** — link previews
  used to be able to flag people); POST `{p}` records (only unclaimed rows).
- **Migration 0037** (`20261018120000_claim_reported_invite.sql`): signing up with the invited
  number claims the spot even if it was reported, and clears the report (SMS code proves the
  number). PGlite phonelogin suite +2 tests (15/15).
- Verified live: both old links 302 to the page; JSON returns the Fnatic team; page renders with
  sign-up on a phone-size guest session; POST validates ids.

---

### 2026-10-08 — Team stats page; tap team/player names in a match to open their profiles

- **Founder report:** the team page had no stats section; in a match, team and player names
  weren't tappable; the team page showed "Squad (0)" for a squad built by number.
- **Team page** (`TeamProfileScreen`): header actions **📊 Stats** (scrolls to it) and
  **👥 Squad · ＋ Add**. **Stats** section, per sport (chip switch for multi-sport teams —
  goals and runs don't add up): played / won / win rate, **form** (last 5, tap → match),
  **for / against / difference** in the sport's unit, **top performers** (sport awards from
  `ratings.SPORT_AWARDS` + most games; tap → player), **head-to-head** per opponent (tap →
  that team). Squad now reads the real roster (`getRoster`).
- `data/teamStats.ts` (pure, `tests/teamStats.test.mts`, 4 tests): only stats a player made
  *for this team* count (matchday squad of that match, else squad) — right for shared
  friendly pools.
- **Tappable names in a match:** `MatchHeader` team names → team page ("Team profile ›"
  hint; singles → the player's profile). Matchday-squad names on Info → player. Every
  sport's live views (lineups/pitch/bench, timelines, box scores, cricket scorecard) link
  player names via `onPlayer` on `LiveExtrasProps` + `sports/playerLink.ts`; scoring controls
  untouched. Events that store only a name resolve the id against the rosters.
- Verified in demo (mobile size): match → "Red House" → team page with football stats;
  Lineups → Neil Kapoor → his profile; Timeline names are links. No console errors. 387 tests.

---

### 2026-10-08 — Adding players: one way everywhere, by number / name / email / contacts

- **Founder report:** hard to find where to add players to a new team; the team squad page
  added players by **name + jersey only** (anyone could type anything); wants phone contacts.
- **One add-player box everywhere** (`AddInvitePlayer`): live match (Info → Matchday squads),
  matchday squad picker, and now the team's **Squad** page. One field — *mobile number, name or
  email*: names/emails find people already on SportnNote (tap ＋ Add); a NEW person can only be
  added by full mobile number (name + jersey optional, "Invited (…1234)" placeholder) → invited +
  WhatsApp/SMS invite. People already on the team aren't offered again. Opens expanded when
  the team is empty.
- **Phone contacts** (`core/pickContact.ts`): Android app → native picker (`expo-contacts`,
  `Contact.presentPicker()`, SDK 56 class API; READ only — WRITE_CONTACTS blocked; needs a new
  APK, older installs simply don't show the button); Android Chrome web → Contact Picker API;
  iPhone web (no contact access in Safari) → **📋 Paste number**.
- `invitePlayer` takes `player` (an existing person found by name/email) or `phone` (new
  person), plus optional `jerseyNo`.
- **Bug fixed:** a team with no matches had no profile/squad page ("Loading…" forever) —
  `getTeamSummary` now falls back to the team record. New teams (Organize → Teams) go straight
  to their Squad page; team page button renamed **Squad · ＋ Add players**. Squad page lists the
  real roster (`getRoster`), not just house-name members. Help guide updated.
- Verified in demo: create team → lands on Squad → name search adds Aarav (made captain) → new
  number shows invite form (name/jersey optional) → WhatsApp opens with +91 number; unknown
  email / partial number give clear hints; no console errors.
- Open question: WhatsApp's desktop preview shows the invite emoji as "�" (wa.me and
  api.whatsapp.com alike) — founder to check how it looks on the phone.

---

### 2026-10-08 — SportnNote logo: the "S:N" scoreline

- **Founder pick:** concept A, colour option 1 — green **S**, amber colon, white **N** on the
  app's dark `#0E1116` (reads like a live score "2 : 1").
- **One source:** `scripts/build-icons.mjs` draws the mark and writes the masters
  (`assets/brand/sportnnote-logo.svg`, `-icon-square.svg`, `-mark.svg`, `-logo-512.png`) and
  every PNG, sized to each platform's safe zone: `assets/icon.png` (native/iOS, website,
  og:image), Android adaptive background/foreground/monochrome (themed icons + notification
  icon), `splash-icon.png`, `favicon.png`, and the web app's `apple-touch-icon` / `icon-192` /
  `icon-512` (maskable). Re-run: `npm i --no-save @resvg/resvg-js@2.6.2 && node scripts/build-icons.mjs`.
- `app.json`: adaptive-icon background `#0E1116`, notification colour `#3DDC97`.
- In-app: `components/Logo.tsx` (react-native-svg) beside the Home wordmark and on sign-in
  (replaces the 🏅).
- **Reaches:** web app + website on publish/push; the Android **home-screen icon needs a new
  APK** (an OTA can't change an installed app's icon). iPhone Home Screen icons are copied
  when added — re-add to see the new one.

---

### 2026-10-08 — Friendlies: one shared pool of players in both teams; one side per match

- **Founder ask:** friends often have one 20–30 player pool split into two teams on the day,
  so the same person must be addable to both teams; the playing five differs per match.
- **Squads:** `conflictTeamsForAdd` now returns nothing for a friendly (no tournament) — the
  "can't play for two teams" block applies to tournaments only (message reworded).
- **On the day, one side per match:**
  - `MatchSquadScreen`: anyone in the other side's matchday squad shows "Playing for <team>
    in this match" and can't be picked (also skipped by Fill starters / Copy last XI); the
    other side is re-read right before saving, so two phones can't both pick someone.
  - `LiveScoringScreen.applySquad`: a side without a matchday squad plays from its full
    squad minus anyone the other side picked.
  - `CricketLineupScreen` (batting order) and `LineupEditorScreen` (pitch): same rule.
- Verified in demo: friendly Pool A vs Pool B → Aarav added to both → starter for Pool A →
  Pool B's picker shows him as "Playing for Pool A", not selectable. No console errors.

---

### 2026-10-08 — Minimise keeps your place, close starts fresh; lookups never hang

- **Founder report:** a closed-and-reopened app still came back on the old page (wrong — only
  minimise should), and Add players sat on "Checking this number…" forever.
- **Restore rule now matches every mainstream app:** minimise → same screen; close → Home.
  iPhone web app: nav state in **sessionStorage** (survives iOS's background unload/reload,
  wiped when the app is swiped away) instead of localStorage; old key removed on load.
  Android: no storage restore at all (the OS keeps a minimised app in memory; a closed app
  starts fresh) — the AsyncStorage restore from the previous entry is reverted.
  Verified: same-tab reload → back on tournament Stats tab; new tab → Home.
- **Lookups:** `find_player_by_phone/email` + `discover_player_by_contact` calls time out
  after 8 s (`withTimeout`), so no screen waits forever; the squad add-player box then lets you
  type a name and invite. Root cause of the failures is migration 0036 (previous entry).

---

### 2026-10-08 — Fix "Couldn't check that number"; consistent people pickers; every tab survives an unload

- **Founder report:** typing a mobile number in Add scorer / Add host always showed
  "Couldn't check that number just now."
- **Root cause (server):** `find_player_by_phone`, `find_player_by_email` and
  `discover_player_by_contact` were declared `STABLE` but record a rate-limit hit (an INSERT).
  PostgREST runs STABLE rpc calls in a READ ONLY transaction → every live call failed with
  "cannot execute INSERT in a read-only transaction". Affected: Add scorer/host, the team
  squad's add-player box (stuck on "checking"), name+number search (`lookupPeople`, silently),
  Discover search by phone/email, and the duplicate check in `invitePerson`.
  **Migration 0036** (`20261017120000_contact_lookup_volatile.sql`) marks them VOLATILE.
  New PGlite suite `readonly.mjs` mimics PostgREST and audits that no STABLE/IMMUTABLE
  function writes (only these three did).
- **Consistency:**
  - Tournament hosts now use the same `PersonPicker` as match scorer/host (number or name,
    add & invite on WhatsApp/SMS with the tournament link, name optional).
  - `CoHostPicker` (new tournament): name optional (placeholder "Invited (…1234)").
  - Lookup failures are reported to telemetry and never hang; PersonPicker still offers
    add & invite when the check fails.
  - `openWhatsApp` / `openSms`: if Safari blocks the new window (opened after an await),
    open in place. Fixes invites from co-host / team / tournament-team forms on iPhone.
- **Unload-proof screens everywhere:** new `useParamState` hook keeps a screen's tab/view in
  route params (saved + restored with the nav state). Used by Live scoring (tab, Add scorer
  panel), Tournament, Golf round, Organization, Matches, Calendar, Discover. (An Android
  AsyncStorage restore added here was reverted in the next entry.)
  Verified in demo: tournament on Teams + match on Info → reload "/" → both restored.

---

### 2026-10-08 — iPhone resume also keeps the match tab + open "Add scorer" panel

- **Founder report:** after minimising on the match's Info tab, the app came back on the right
  match but on the **Scoring** tab (the default for a scorer). The tab and the "Add scorer"
  panel were in-memory state, so the restored nav state didn't carry them.
- **Fix:** `LiveScoringScreen` keeps both in route params (`tab`, `addScorer`) via
  `navigation.setParams`, and starts from them — so the saved nav state restores them too.
  Verified in demo: Info + open Add scorer → reload "/" → same tab, panel open.

---

### 2026-10-08 — iPhone resume keeps your screen; add scorer/host by number with WhatsApp/SMS invite

- **Founder report:** minimising the Home Screen app on iPhone (even for seconds) brought
  them back to a default page.
  - Cause: iOS unloads standalone web apps and relaunches them at `start_url`.
  - **Fix:** `RootNavigator` saves the navigation state on every change (web) and restores
    it when the app opens at "/" within 30 minutes (`initialState`). Shared links still win.
  - Verified: open a match → reload "/" → back on the match.
- **`PersonPicker`** (match scorer and host): one box, "Mobile number or name".
  - A full number on SportnNote → "✓ Name — Add as scorer/host".
  - Not on it → "Add & invite on WhatsApp / by SMS" or "Just add". A pending player is
    named "Invited (…1234)" (name optional; they enter their own when they join, and the
    phone sign-up claim takes over the row).
  - The invite says who added them, the role, the match, the time, and
    `app.sportnnote.in/m/<id>`.
  - Name search → members. Partial numbers show nothing (privacy).
  - WhatsApp/SMS open inside the tap (iOS blocks opening apps after an await).
- **Before this, the match scorer/host forms required a name and sent no invite at all.**
  The name is no longer required. HostsCard takes `addPicker`.
- **`core/connect` fixes (all invite flows):**
  - WhatsApp/SMS now add 91 to a bare 10-digit number (wa.me needs the country code).
  - iOS SMS body uses `&body=`.
- Verified in the demo:
  - partial-number hint;
  - unknown number → invite;
  - wa.me/919988776655 with the correct message;
  - "Invited (…6655)" listed as scorer;
  - no console errors.
- 383 tests.

---

### 2026-10-08 — Phone sign-in, offline web app, daily digest, post-publish crash fix

- **Sign in / up with a mobile number (web):** `PhoneLoginCard` on the sign-in screen.
  - Firebase SMS code → the `phone-login` edge function (migration 0035, 13 PGlite
    tests).
  - It signs into the account whose own player **verified** that number. An account that
    only typed the number is refused, with guidance (no takeover).
  - New numbers: a short form (name, DOB, role, guardian for under-18s, terms). The
    account gets an internal `@phone.sportnnote.in` placeholder email, which is never
    mailed (guard `sendEmail`, `createMyPlayer` and the email sync skip it).
  - The new account claims any organiser-added player with that number.
  - The session comes from a one-time magic-link token hash (`verifyOtp`).
  - Shared `_shared/firebaseToken.ts` (verify-phone-firebase refactored onto it).
  - The native APK stays on email (Firebase JS phone auth is web-only).
- **Opens on poor signal (`public/sw.js`):**
  - Pages: network-first with a saved-page fallback. The main bundle and every script
    in the HTML are saved at install and on each navigation.
  - Hashed code: cache-first. Supabase REST GETs: network-first with the last copy as a
    fallback. Wiped on sign-out.
  - **Verified:** server stopped → reload → the app renders fully. (The first attempt
    showed a blank page because the main bundle wasn't cached; fixed.)
- **Daily digest:** `weekly-report` `{period:'day'}` — last 24 h: sign-ups, active
  users, opens, matches by sport, rounds, tournaments, shares, top errors, feedback.
  Scheduled 21:00 IST by the release SQL.
- **The digest's first run found real crashes on production:**
  - "Requiring unknown module" (12) and a burst of `Unexpected token '<'` (19). Cause:
    lazy screen chunks plus frequent publishes (an old open app fetching files the new
    deploy doesn't have).
  - **Fix:** `core/staleVersion` (matcher tested) reloads once on version-mismatch
    errors — from the lazy loader, `window.onerror` and the ErrorBoundary — never more
    than once per 60 s. The service worker cache also keeps each version's chunks.
  - Also: **localhost dev/test copies no longer send telemetry**. My live-keyed
    previews had polluted the live errors; the old rows are left to age out.
- 383 tests.
- **LIVE 2026-10-08:**
  - The founder ran 0035 plus the daily-digest schedule (anon is refused on
    `phone_login_lookup`).
  - Deployed phone-login, verify-phone-firebase, send-invite, support-escalate,
    guardian-link, verification-submit, message-notify, send-contact-otp,
    notify-upcoming and push-send.
  - phone-login guards: 400 without a token, 401 with a bad token.
  - Web published; OTA `dbc4f362`.
  - **Founder test:** the second "Send code" failed with a generic message (reCAPTCHA host
    reused) → fixed (fresh host each send; unknown Firebase codes are shown and reported).
    Retest: code received, and a new number reaches the sign-up form ✅.

---

### 2026-10-07 — Discover: search by phone/email + a clean filter panel

- **Search box:** a name, or an exact mobile number or email (`core/contactQuery.ts`,
  tested).
  - Contact search uses `discover_player_by_contact` (migration 0034, 10 PGlite tests).
  - It returns only the player id, and only for **claimed adult accounts that allow
    it**: new `players.findable_by_contact` (default on), an Edit profile switch "Let
    people find me by my phone or email", never under-18s.
  - Signed-in only; 60 lookups per hour.
- **Filters** (`components/PlayerFilters.tsx`): one "⚙ Filters" button expands a panel:
  - sports multi-select as a wrapped grid (no sideways scroll);
  - city type-to-search over real player cities, most common first, with
    case/spacing variants merged (`getCities`);
  - gender; age band (U14/U16/U18/18–34/35+); verified only.
  - Active filters appear as removable chips, with "Clear all".
  - Search is debounced at 300 ms.
- **Server-side filters:** `overlaps(sports)`, city `ilike` OR, age range on
  `players_view.age`, `verification->>status`.
- **Verified in the demo:**
  - 345 → 45 (Kabaddi/Tennis) → 1 (+U18);
  - city "arg" → Argentina;
  - phone search → exact match;
  - fixed an empty-text-node render warning.
- **Release:** 0034 run by the founder (`findable_by_contact` → 200), then web and OTA
  published.
- **Connect tab** uses the same panel (`sections` and `typeOptions` props): post type,
  sports, city (cities taken from the posts). It filters on the device, replacing two
  sideways chip rows.

---

### 2026-10-07 — Public share pages (no login) + shareable player profiles

- **Guest mode:** match (`/m`), tournament (`/t`), golf round (`/g`) and player profile
  (`/p/<id>`, new) open without an account.
  - Shared `publicScreens` are registered in both navigator branches.
  - The `GuestBar` (Sign in / Join free) sits under every guest page.
  - Members-only actions (follow, message, anything only members can reach via
    `onUnhandledAction`) go through `promptSignIn()`, which opens Create account and
    returns to the same page after sign-in (`takePendingRoute`).
  - `Auth` takes `{mode}`.
- **Privacy (DPDP):**
  - Under-18 or unknown-age profiles and sport stats are members-only for guests.
  - App pages are `noindex`.
  - Follows are now private (migration 0033 drops "read follows"; 4 PGlite tests).
  - The privacy policy's "What is public" section is updated.
- **Share profile:** "📤 Share profile / Share my profile" (`useProfileShare`,
  `profileShareText`) — record, a line per sport, and the `/p` link. Only adults' profiles
  can be shared by others; anyone can share their own.
- **Leak fixed:** the verification card ("Pending review") showed on anyone's profile.
  It now shows only to the owner and support; others see just the ☑️ tick.
- **Bug fixed:** tournaments were saved with host name "You" (placeholder); new ones save
  the real name, and old ones display "Organiser".
- **LIVE 2026-10-07:**
  - 0033 run: anon `follows` → [].
  - Web published; the production HTML (`noindex` + new bundle) was served about 5 minutes
    after deploy (HTML edge cache).
  - Android OTA `75d3bdeb`.
- **Verified against the live DB as a logged-out guest** (local `sportfolio-live-guest`
  preview):
  - a match page as viewer, with the guest bar;
  - an adult profile without the verification card;
  - Follow → Create account;
  - a tournament page.
- 381 tests.

---

### 2026-10-07 — Share, guided first run, iPhone web push, organiser extras, faster web

- **Share (#2):**
  - Share buttons on match, tournament and golf screens (`core/share.ts`,
    `core/shareText.ts`).
  - The message carries the live score, result or upcoming time, plus a short link
    (`app.sportnnote.in/m|t|g/<id>`; `MatchLinkScreen` resolves `/m`).
  - Web falls back to wa.me; shares are tracked (`share_link`).
- **Guided first run (#5):** the first-run picker in `OnboardingOverlay` (Score a match /
  Run a tournament / Find players / Show me around) goes straight to the right screen;
  choices tracked as `onboarding_step`.
- **Web push (#3):**
  - PWA set-up: `public/index.html` (manifest, apple-touch-icon, SW registration),
    `manifest.json`, icons, `sw.js`.
  - Migration 0031 `web_push_subscriptions` + save/remove RPCs (10 PGlite tests).
  - `_shared/webpush.ts` (npm:web-push, VAPID secrets set; verified encryption and send
    in Deno → 201) wired into notify-upcoming, push-send, notify-followers and
    message-notify (all deployed).
  - Client: `core/webPush.ts` + `WebPushCard` (Match reminders screen; Home nudge;
    iPhone "Add to Home Screen first").
- **Organiser extras (#6):**
  - Share fixtures on WhatsApp (grouped by day, IST);
  - Print fixtures / save PDF on the web (with a result column);
  - Match-day check-in on the participants screen (migration 0032, organiser-only,
    4 PGlite tests).
- **Faster web (#4):** 54 non-tab screens load on demand with a background prefetch.
  The main bundle went from 2.63 MB to 1.90 MB (−28%).
  - Next lever: lazy sport UIs plus the demo data (~400 KB), which needs registry rework.
- **LIVE 2026-10-07:**
  - The founder ran 0031+0032. Checks: `checked_in_at` → 200; anon is refused on
    `web_push_subscriptions` and the save RPC (42501).
  - Web republished: manifest, `sw.js` and the VAPID key are in the bundle; `/m` and `/t`
    links serve.
  - Android OTA `59cf9d9b`.
  - New APK with FCM: build `cd76a7b6` (link on sportnnote.in and in
    `docs/share/HOW_TO_SHARE.md`).
  - **iPhone web push verified end to end:** the founder's Home Screen app subscribed
    (web.push.apple.com). A one-off test sender (deployed, used, deleted) returned
    `sent: 1`.
- 380 tests.
- **Parked by the founder:** public no-login match/tournament pages.

---

### 2026-10-07 — sportnnote.in live on Cloudflare

- **The website** is served by a Cloudflare Worker (static assets, `wrangler.jsonc`,
  builds from `main`), at `sportnnote.in` and `www`.
- **DNS moved** from GoDaddy to Cloudflare.
  - Records carried over: Resend MX/DKIM/DMARC.
  - SPF rewritten to `include:amazonses.com`, since GoDaddy's `_spfm` macro wouldn't
    survive the move.
- **Redirect rules:** `app.sportnnote.in` → `sportnnote.expo.app` with path and query
  (invite links keep working); HTTP→HTTPS.
- **Verified with curl:** 200 for the site pages; 301s for http, app, and
  `app/join/abc?x=1` → `sportnnote.expo.app/join/abc?x=1`.

---

### 2026-10-07 — Wave-1 sports validated against real events; official tie-breaks

- **Replays:** 23 tests in `tests/replay-wave1.test.mts`, all passing:
  - FIDE Candidates 2024 and Tata Steel 2024 (full crosstables, SB values, official order);
  - 2024 Masters (Scheffler hole by hole, top 5 with T3);
  - 2023 Ryder Cup (Rahm v Scheffler, every hole);
  - Paris 2024 table tennis finals;
  - Carrom World Cup 2018 and 2025 game scores.
- **Fixed:**
  - **Chess tie-breaks:** SB → wins → direct encounter (`sb`, `wins`).
  - **ITTF group ranking:** 2/1 match points, among-the-tied games and points ratios,
    restart (`h2hRatio`, `h2hPoints`, `restart`, rally `standingsPoints`).
  - **Table tennis:** a "Serves first (toss)" setting.
  - **Carrom:** the game score caps at 25; queen toggle wording.
  - The points editor offers ½ for a chess draw and the new tie-breakers.
- **Refactor:** pure `src/sports/rallyEngine.ts` (rallyCore now builds on it).
- **Details and remaining gaps:** `docs/sport-coverage/replay-validation.md`.
- 371 tests pass.

---

### 2026-10-07 — Match reminders: email channel, user preferences, schedule

- **`notify-upcoming`** (deployed):
  - **Email:** players and scorers get one email per match, the day before, or the hour
    before for matches set up at short notice. Web/iPhone users can't receive push, so
    email is their reminder.
    - Content: date and time in the recipient's time zone (default IST), venue, event
      name, app link, and how to stop reminders.
    - Sent from `no-reply@sportnnote.in`.
  - **Preferences:** respects `user_reminder_prefs` — an empty list means off (no push,
    no email); push only fires for the 1d/1h/15m windows the user kept.
  - **One push per person per reminder:** priority scorer > player > follower (a dry run
    on live data showed one person would otherwise get three pushes for one match).
  - The ledger records every kind, plus `lead_key='email'`, so nothing re-fires.
  - **Dry run:** `{dry:true, now:ISO}` lists the targets without sending or recording.
    Verified on live data at three simulated times (1d, 1h, short notice).
- The reminder settings screen explains email and "off".
- **Schedule:** `supabase/release/2026-10-schedule-reminders.sql` (pg_cron every 5 min,
  reuses the Vault `cron_secret`). The founder runs it.
- **Android push** still needs FCM: a Firebase Android app + `google-services.json` in a
  new APK + the FCM V1 key uploaded to EAS.

---

### 2026-10-07 — Website (sportnnote.in) + weekly pilot report

- **Website:**
  - `website/` + `scripts/build-website.mjs` (`npm run website:build` → `website/dist`).
  - Plain HTML/CSS: home (hero, features, the 14 sports, organiser steps, iPhone/Android
    install, contact), `/privacy/` and `/terms/` (rendered from `src/data/legal.ts`), 404,
    robots and sitemap.
  - `website/config.json` holds the APK link.
  - Checked at 375 px and 1280 px: no horizontal overflow, no console errors.
  - Hosting plan: `docs/website.md` (Cloudflare Pages from the private GitHub repo; the
    founder signs up).
- **Weekly report:** `supabase/functions/weekly-report`, deployed.
  - Emails the founder the last week's KPIs with week-on-week deltas, sports, activation,
    retention, crash-free %, top errors and all feedback.
  - Auth: `CRON_SECRET` (newly set) or the service key.
  - Live dry run OK; no secret → 403.
  - The schedule (pg_cron Mon 09:00 IST, secret in Vault) is **active**; the founder ran
    the one-time SQL on 2026-10-07.
  - The Resend key was invalid (401); the founder replaced it. Mail now sends as
    `no-reply@sportnnote.in` (verified domain), and a test report was delivered.

---

### 2026-10-07 — First over-the-air Android update; `npm run android:ota`

- **The native layer hasn't changed since the 2 Oct APK** (only the JS `firebase` dep was
  added), so an EAS Update on channel `preview`, runtime 1.0.0, reaches every installed
  test APK. This fixes the old APK broken by 0026 and ships all the work up to `a972b9f`.
  Update group `3721bc3f`.
- **Gotcha:** the macOS `hermesc` binary had vanished from
  `node_modules/hermes-compiler/hermesc/osx-bin/` (empty since 22 Aug), so Android bundling
  failed with "Cannot find the hermesc executable". Restored from the pinned npm tarball;
  the sha512 matched package-lock.
- **`scripts/publish-android-ota.sh`** (`npm run android:ota -- "msg"`):
  - loads the live keys;
  - checks hermesc;
  - `expo export --platform android --clear`;
  - aborts unless the Hermes bundle contains the live Supabase host;
  - `eas update --skip-bundler`.

---

### 2026-10-07 — Pilot readiness pack: legal, feedback, account deletion, children's analytics (0030)

- **Privacy Policy + Terms** (`src/data/legal.ts`, `LegalScreen`):
  - written for DPDP (children, guardian consent, processors, retention, rights,
    grievance);
  - in Settings → Privacy & legal, and publicly at `/privacy` and `/terms`, signed in or
    out;
  - sign-up now requires ticking "I agree", and the accepted version is recorded in auth
    metadata `legal_accepted`;
  - needs lawyer review, and the legal name after incorporation.
- **Send feedback** (`FeedbackScreen`, Settings → Help):
  - kinds: bug / idea / confusing / love;
  - attaches the last screens visited (telemetry `recentScreens`), the version and the
    platform;
  - reuses `support-escalate` (support_cases + email to the founder), with a mailto
    fallback.
- **Delete my account** (`DeleteAccountScreen`, the `delete-account` edge function,
  migration 0030 `delete_account_data`):
  - wipes personal data and soft-deletes the login;
  - removes verification docs from storage;
  - blanks the text of sent messages;
  - keeps sporting records as "Deleted player" so standings stay correct;
  - service-role only.
  - Required by DPDP erasure and the App Store / Play.
- **Children's analytics (DPDP §9):** `analytics_actor()` means under-18 (or unknown-age)
  users are never linked in analytics or error reports — no profile, device or session ids.
  Existing rows are detached too.
- **Pilot guide:** `docs/share/PILOT_GUIDE.md` (forwardable message + how-tos, labels
  checked against the UI).
- **Not done (founder's call):** cleaning the test tournaments on live; left as is.
- **Verified:**
  - 21 PGlite scenarios for deletion and minors' analytics;
  - all earlier suites still pass (102/27/70/28/33);
  - the bundle applies on 0029 and re-runs;
  - deno check;
  - 338 app tests; tsc;
  - the demo click-through: Settings rows, the Privacy/Terms pages, the `/terms` URL, the
    Feedback and Delete screens, no console errors.
  - `delete-account` deployed; anonymous calls → 401.
- **Pending:** the founder runs `supabase/release/2026-10-readiness-0030.sql`, then republish
  the web app.

---

### 2026-10-07 — Analytics + crash reporting (migration 0029); new APK; sharing guide

- **First-party, in our own Supabase** (not PostHog/Sentry yet): ships to installed APKs
  by OTA (no native module), no third-party processor for minors' data, free.
  - The database records the core KPI events with triggers, so they're captured from any
    client or outbox.
  - The app sends only `app_open`, `screen_view` and errors.
  - Details: `docs/analytics.md`.
- **Files:**
  - `supabase/migrations/20261010120000_analytics.sql`
  - `src/core/telemetry.ts`
  - `src/components/ErrorBoundary.tsx`
  - `App.tsx` (startTelemetry and the boundary)
  - `RootNavigator` (screen tracking via navRef)
  - release bundle `supabase/release/2026-10-analytics-0029.sql`
- **KPI views:** `kpi_weekly`, `kpi_sport_weekly`, `kpi_activation`,
  `kpi_scorer_retention`, `kpi_crash_free`, `errors_top` (service role / SQL editor only).
- **Verified:**
  - 33 PGlite scenarios: triggers, allow-list, PII filtering and masking, rate limits, no
    client reads, an analytics failure never blocks the write, KPI maths.
  - The bundle applies on top of 0028 and re-runs cleanly.
  - 338 app tests; tsc; the demo app loads with no console errors.
- **Sharing:** `docs/share/HOW_TO_SHARE.md` (iPhone = web app; Android = APK or web; store
  path after company formation); web QR `docs/share/sportnnote-web-qr.png`.
- **APK:** preview build `d0f3aedd` (includes telemetry and all of 0026–0028's client
  changes).
- **LIVE 2026-10-07:** the founder ran the 0029 bundle; anon `track_events` → 1, tables 401,
  `kpi_weekly` 42501. Web republished; the live site's first `track_events` call → 200.

---

### 2026-10-07 — LIVE: migrations 0012–0028, 12 edge functions, web app published

- **Database:** the founder ran `supabase/release/2026-10-pilot-migrations-0012-0028.sql`
  (one transaction). Verified via REST: `players_view` OK, `players.phone` → 42501
  (private), the golf and messaging tables exist.
- **Fixed before running:** a latent bug in 0018 `clubs.sql` (its drop-policy used
  `%I_read` → `clubs_read_read`, so a re-run would fail). Proven: all of 12–28 re-apply
  cleanly in Postgres.
- **Edge functions:** deployed push-send, support-assistant, support-escalate,
  send-invite, verification-submit, notify-followers, notify-upcoming, message-notify,
  guardian-link, send-contact-otp, verify-contact-otp, verify-phone-firebase.
  - `WEBHOOK_SECRET` set (value not retained; regenerate when the webhook is created).
  - Smoke test: anonymous calls → 401, cron/webhook → 403, firebase → 503 (not
    configured).
  - First deployment ever of notify-* and support-assistant.
- **Web app:** live at https://sportnnote.expo.app (forward: app.sportnnote.in, set up in
  GoDaddy).
  - Gotcha: Metro's cache ignores env changes, so the first prod publish shipped in demo
    mode. `publish-web.sh` now uses `--clear` and refuses to deploy unless the live
    Supabase URL is in the bundle.
  - Also fixed the bash 3.2 `source <(…)` bug.
- **Auth URLs:** Supabase Site URL + redirect `https://sportnnote.expo.app/**` set.
- **Founder smoke test on iPhone passed** (sign-up, match, golf round, messaging).
- **Firebase SMS:** project `sportnnote-5c5e7` web app registered, `FIREBASE_PROJECT_ID`
  secret set (verify-phone-firebase 503 → 401 for anonymous), web republished with the config.
- Firebase console: Phone provider enabled, Blaze billing, SMS region = India only (probe now fails only on the fake reCAPTCHA, i.e. config complete).
- **Founder SMS test passed** (code received, number verified).
- **iPhone fix:** Safari zoomed in when a text box under 16px got focus, pushing the
  Confirm button off-screen. `index.ts` now forces 16px inputs on touch screens (pinch zoom
  kept); the code row in `ContactCard` shrinks the input instead of overflowing. Republished.
- **Pending:** new Android APK.

---

### 2026-10-06 — Web pilot hosting + Firebase SMS phone verification · READY (needs ops)

- **Web pilot on EAS Hosting:** free; the project's dev domain is `sportnnote`, so
  production will be https://sportnnote.expo.app. `app.json` gained `web.output: single`,
  name and theme colours.
  - `scripts/publish-web.sh` (`npm run web:publish`) builds against the live keys from
    `.env.local` / `.env.local.bak` without printing them, then deploys
    (`--preview` for a throwaway URL).
  - A demo-data preview is live at https://sportnnote--hfy8phv5cd.expo.app. Verified there
    that hosting serves deep pages (`/Settings` loads directly).
- **Firebase SMS phone verification (web):**
  - `core/firebasePhone.ts`: Firebase JS SDK 12, invisible reCAPTCHA, E.164 `+91`,
    friendly errors; signs out of Firebase immediately.
  - Repos route phone and guardian-phone verification through it when configured on web
    (`via: 'sms'`); the ContactCard copy follows.
  - New edge function `verify-phone-firebase`: verifies Google's RS256 signature (jose +
    Google JWKS), issuer/audience = our project, `auth_time` ≤ 10 min, caller owns the
    player, and the token's number matches the profile/guardian number. Only then does it
    set the verified flag (service role). Rate-limited.
  - No DLT needed (Google sends). Cost ≈ $0.07/SMS on Blaze.
  - Setup: `docs/firebase-phone-setup.md`. Native Android keeps the WhatsApp path.
- **Ordered launch checklist:** `docs/web-pilot-launch.md`. Blocked on the founder: Supabase
  CLI login, running migrations 0012–0028, Auth URL config, Firebase setup.
- **Verified:** tsc clean; 338/338 tests; `deno check` passes on the new function; web
  export OK. **Not yet exercised:** a real SMS end to end — that needs the Firebase project.

---

### 2026-10-06 — Golf v1 (field-event core) + web-readiness fixes · CODE DONE (needs migration 0028)

Golf is a complete sport (design: `docs/sports/GOLF_DESIGN.md`). Stroke play and Stableford
are FIELD events — N players on one leaderboard — built as a new core alongside matches, with
no change to existing sports. Match play reuses the match/bracket engine.

- **Rules engine** (`sports/golf/engine.ts`):
  - WHS course and playing handicap; strokes received by stroke index, including plus
    handicaps and 9-hole play.
  - Gross, net, to-par, Stableford and net-double-bogey adjusted gross.
  - Ranking with ties (T3); countback on the last 9/6/3/1 (net uses handicap fractions);
    pickup = NR.
  - Multi-round totals; cut (top N and ties / within X).
  - Match-play state (UP/AS/dormie/3&2/extra holes).
  - Per-round stats and scoring average.
- **Data** (`data/golf.ts`):
  - Courses (quick-create from the scorecard, validated), field events and entries.
  - An offline card outbox (latest card per player persisted; retried).
  - Leaderboard across rounds; `completeRound` writes stat lines (`event_id`).
  - Auto groups and tee times.
- **Screens:**
  - Round setup: course, tees, format, players with Handicap Index (plus allowed), groups,
    and "next round" with a cut.
  - Round scorecard: one hole at a time for the group, par = 1 tap, −/+, pickup, putts,
    hole dots, sync banner. Plus a live leaderboard with expandable cards, and
    start/finish/next round.
  - Tournament hub (rounds + cumulative leaderboard).
  - Home "Live now" golf cards; profile golf totals (rounds, average, best, GIR/FIR%,
    putts/round) and golf history rows that open the round.
  - Friendly flow routes stroke/Stableford to round setup; match play stays head-to-head.
- **Database** (migration 0028):
  - `golf_courses`, `field_events`, `field_entries`, `stat_lines.event_id`.
  - Permissions: managers (creator/hosts/tournament managers) control rounds; markers in
    the same group may only change cards; scores lock when the round finishes; event stat
    lines are managers-only.
  - Realtime on `field_entries`.
- **Also:**
  - Throwball removed under the founder's international-only rule.
  - **Web fixes for the iPhone web pilot:**
    - Refreshing or deep-linking any page no longer crashes to Home. React Navigation 7 with
      a partial linking config calls `resetRoot(undefined)`; fixed with a
      `getStateFromPath` fallback covering 51 stack screens.
    - `Alert.alert` is a no-op on web; added `core/confirm.ts`
      (`confirmAction` / `notice`) and used it everywhere.
    - `formatDay` now accepts timestamps (live-mode history dates showed raw ISO).
    - Casual golf rounds count as friendly on profiles.
- **Verified:**
  - 338/338 tests, including golf 30 + litmus.
  - tsc clean.
  - 28 golf database scenarios, plus 102/27/70 still passing.
  - Offline demo: set up a round (HI 18 and +1.2), score holes, leaderboard −1 vs +1,
    survives reload, appears in Home "Live now", finish → FINAL, Ishaan's golf profile
    shows the round. `/Settings` and `/GolfRound?eventId=…` now reload in place.

---

### 2026-10-06 — Wave 1 sports: table tennis, chess, carrom · SHIPPED + VERIFIED

> **Update, same day:** throwball was built and then **removed**. The founder's rule is
> *international-level sports only*; throwball fails it (South Asia only; not in the
> Olympics, Asian Games or Commonwealth Games). The volleyball controls factory stays.

Part of the sports expansion (`docs/sports/SPORTS_EXPANSION.md`). The Golf design is in
`docs/sports/GOLF_DESIGN.md` (it needs a new field-event core; not built yet).

**New sports:**
- **🏓 Table tennis:** rally core plus the ITTF service order (`tabletennis/serve.ts`: 2
  serves each, 1 each from 10-10, opening server alternates by game). Presets: best of
  5/7/3 to 11, legacy to 21. Singles or doubles.
- **♟️ Chess:** new `result` scoring type (`chess/engine.ts`). Records winner or draw, how
  (method must be consistent with the outcome), optional move count, who has White. Scores
  1/½/0 and reads "1-0 / 0-1 / ½-½". League tables default to 1/½/0. Credits both players a
  game plus a win/draw/loss via `attribution` + `attribution2`.
- **🎱 Carrom:** ICF boards (`carrom/engine.ts`). Opponent's coins left, +3 for the Queen
  while under 22; game to 25 or after 8 boards; tie-break boards; best of 3. Credits
  points, boards and queens.
- **🤾 Throwball:** volleyball set engine. Volleyball's controls became
  `makeSetScoringControls` (optional blocks and timeouts); throwball has no blocks, 9-a-side,
  1 timeout per set.
- Futsal was already a football preset.

**Profile linking in individual sports:**
- Schedule Match player search now lists real people.
- "Me" resolves to your own player.
- "New player" creates a real player.
- All of these create or reuse a one-person entry with `roster: [playerId]`, so results and
  stats reach profiles.

**Other:**
- Chess and carrom buttons show full names instead of team codes.
- Every per-sport table is filled in for the new sports (ratings, leaders, profile fields,
  position hints, standings columns, schedule durations, headline stats and labels).
- No migration needed: there's no sport whitelist in the database.

**Verified:**
- `tests/wave1-sports.test.mts` (14 tests); tsc clean; 306/306 tests.
- Offline demo: chess friendly recorded as 0-1 · Resignation and final; carrom +8 board;
  table-tennis serve switched to the opponent after 2 points; the new matches appear in Home
  "Live now".
- **Seen during testing:** a react-navigation `resetRoot` error after browser-back/URL
  navigation in the web preview. It doesn't come from this work; to investigate.

---

### 2026-10-06 — In-app messaging + guardian accounts (migration 0027) · CODE DONE (needs migration + deploy + APK)

People can reach a player without seeing their number. Per the user's decision, messages
about under-18s go to their parent/guardian, never to the child.

**Database** (`20261008120000_messaging.sql`):
- **Tables:** `message_threads` (one per player + sender; the inbox is the player's or the
  linked guardian's), `messages`, `message_blocks`, `message_reports`.
- **Server functions only:** `send_message` (adult-only sender, routes minors to the
  guardian, checks blocks, rate limits), `reply_message`, `mark_thread_read`,
  `block_thread_sender`, `report_message`, `my_threads` (display names never reveal the
  guardian) and `my_thread_for_player`.
- **Guardian accounts:** `players.guardian_profile_id` + hashed `guardian_link_codes`.
  `create_guardian_link_code` (service role) and `claim_guardian_link` (guardian's own
  adult account; not the child's) link the guardian, verify their email server-side and
  move pending threads into their inbox. A trigger stops the app from setting the guardian
  link or verified flags; changing the guardian email drops the link.
- **Other:** `players_view.guardian_linked`.
- **Fix in 0025:** a guardian change now only voids a verification approval when the
  guardian's identity changes, not the flags.

**Edge functions:**
- `message-notify`: delivers each message once (push, or the guardian email with a link
  code).
- `guardian-link`: the child invites their guardian.
- `_shared/guard.ts` gained `sendEmail`, `pushToProfiles` and `guardianLinkSteps`.

**App:**
- `data/messages.ts` handles live and demo (in-memory).
- `MessagesScreen` (inbox + unread), `ConversationScreen` (send/reply, long-press to
  report, block) and `GuardianLinkScreen` (enter code, see linked children).
- Profile button "💬 Message", or "💬 Message their parent/guardian" for minors.
- Guardian link card on a minor's own profile.
- Settings rows "Messages" (unread count) and "Link as a parent/guardian".
- Guardian ContactCard hides the device-side Verify in live.
- Offline demo launch config `sportfolio-offline-demo` (port 8093, `EXPO_NO_DOTENV=1`).

**Verified:**
- 51 messaging scenarios in PGlite: who may send, routing, privacy of threads, block,
  report, guardian linking incl. a child/minor trying to link, email-change unlink and
  rate limits. The 27 privacy and 102 security scenarios also pass.
- `tsc` is clean, 292/292 tests pass, and `deno check` passes on the new functions.
- UI clicked through in offline demo: minor profile → "Message their parent/guardian" →
  sent → inbox shows "Parent/guardian of Aarav Mehta · Emailed to their parent/guardian";
  Edit Profile privacy card for an under-18.

**Follow-ups, same day, all built:**
- **Support report review:** `MessageReportsScreen` (Settings → Support tools). Reports
  keep a text snapshot. Support can dismiss, remove the message, or remove and turn off the
  sender's messaging (`messaging_bans`, which can be lifted). There's a read-only
  conversation view.
- **Unblock:** "🚫 Blocked" section in Messages (`my_blocks` / `unblock_message_sender`).
  Blocks are labelled as the blocker saw them; the account id is never exposed.
- **Live updates:** `messages` is added to the realtime publication, and
  `subscribeToThread` runs while a conversation is open.
- **Server-side guardian phone verification:** `guardian_phone` OTP channel in
  send/verify-contact-otp, plus CSPRNG codes and a send cap. Delivery waits on WhatsApp OTP
  (Meta Business Verification).
- **Fix:** live mode no longer shows fake on-screen codes, which would have shown
  "verified" while the server ignored it.
- **Verified:** 70 messaging + 27 privacy + 102 security scenarios, `tsc` clean, 292/292
  tests, `deno check`, and the UI clicked through in offline demo.

---

### 2026-10-06 — Private contact details + privacy settings (migration 0026) · CODE DONE (needs migration + APK)

Section 1 of the security review. The user's direction:
- Keep performance public, because talent scouting needs it.
- Hide contact details by default, and let adults opt in to show them.
- Follow the DPDP Act 2023 for children's data.
- In-app messaging comes next, and messages to under-18s are routed to their guardian.

**Database** (`20261007120000_private_contact_details.sql`):
- **Locked columns.** Clients can't read `phone`, `email`, `dob`, `guardian` or
  `verification` on `players`, or `phone`, `dob`, `guardian` on `profiles`. Writes are
  unchanged.
- **`players_view` is the new read model.** It returns private fields only to:
  - the person themselves, support, and the creator of a provisional player;
  - for a provisional player's phone, whoever runs a team the player is on;
  - anyone, for an adult's opted-in phone/email (`show_phone` / `show_email`, default off).

  Everyone else gets the derived `age`, guardian present/verified flags and the
  verification status.
- **Rate-limited RPCs** replace the private-column filters: `find_player_by_phone` /
  `find_player_by_email` (id + name only), `my_claimable_player` (matches on the caller's
  own number or confirmed email) and `my_profile_private`.

**App:**
- **Reads:** player reads use the view. Phone/email dedupe and the sign-up claim use the
  RPCs; inserts re-read through the view.
- **Age:** eligibility, reminders and the profile header use `ageOf(p)` (DOB if visible,
  else the server-derived age). The guardian check accepts the `present` flag.
- **Edit Profile:** new "Who can see your contact details" card. Under-18s see that it's
  hidden and that scouts reach them through their guardian; adults get two toggles.
- **Other people's profiles** show a Contact card only when contact details came back.
- **Error handling:** people search tolerates lookup rate limits, and `updatePlayer` now
  throws on a server error instead of failing silently.

**Verified:**
- 27 privacy scenarios plus the 102 security scenarios pass in PGlite.
- `tsc` is clean and 292/292 tests pass.
- Not checked in the browser: the preview points at live Supabase, where 0026 isn't
  applied.

**Follow-ups found:**
- Guardian phone/email "verified" flags are still set on the device (no server-side
  guardian OTP).
- Own-phone verification can't complete on live until WhatsApp OTP works.

---

### 2026-10-05 — Security hardening: scoped writes + edge-function guards (migration 0025) · CODE DONE (needs migration + deploy)

The security review found that, because the anon key ships in the APK, "any signed-in user"
policies were open to anyone. Sections 2 (blanket writes) and 3 (edge functions) are now
fixed. Section 1 (personal-data visibility) is still pending a design decision.

**Database** (`supabase/migrations/20261006120000_security_hardening.sql`):
- **Privilege escalation closed.** Clients can no longer get `support`/`admin`, either via
  sign-up metadata or by updating their own profile.
- **Player verification flags are server/reviewer-only.** A DOB or guardian change voids an
  approval. Claiming a provisional player needs a matching phone number or confirmed email,
  and only the creator can edit an unclaimed provisional player.
- **New authority helpers:** `has_org_role`, `can_manage_tournament` (now includes
  org-hosted events — previously broken), `can_manage_team/club/match_side`,
  `can_edit_player`.
- **Every catalog/org/club/tournament table's policies were rewritten.** BEFORE triggers
  handle the column-transition rules: org membership lifecycle (Owner never zero), entry
  accept-only, dispute sides, lineup sides, team roster-only edits by scorers.
- **Invites:** random server-minted tokens, rate-limited `get_*`/`claim_*` RPCs, and
  captain invites are single-use.
- **Audit trails** are insert-only with the actor stamped server-side. Ownership transfer
  is an atomic RPC that also clears the old owner's `organizer_id` control.
- **Other:** `rate_limit_hit()` ledger; `push_allowed_targets()` relationship check.

**Edge functions** (`_shared/guard.ts` added):
- `push-send`: sign-in required, relationship-checked recipients, caps and link-stripping.
- `support-assistant`, `support-escalate`, `verification-submit`: sign-in required and
  rate-limited. `verification-submit` also checks ownership.
- `send-invite`: the server composes the email and only SportnNote links are allowed.
- `notify-followers`: requires `x-webhook-secret`. `notify-upcoming`: cron auth only.

**App:**
- Invite create/resolve/claim now use the RPCs, and the join screens surface server errors.
- `setOrgMembers` writes only the changed rows; the org console rolls back and explains a
  refused change.
- Ownership transfer uses the RPC.
- `sendInviteEmail` sends structured fields.
- Fixed a pre-existing bug: `createOrgRequest` upserted against a partial unique index,
  which Postgres rejects. Verified, so every org invite and join request would have failed
  on live.

**Verified:**
- Schema + all 25 migrations load into a real Postgres (PGlite).
- 102 attacker/legitimate scenarios pass.
- The migration is idempotent.
- `tsc` is clean and 292/292 tests pass.
- The changed edge functions pass `deno check`.

Deploy steps are in `docs/security-hardening.md`.
**Pending:** run 0025 on live (after 0012–0024), set `WEBHOOK_SECRET`, deploy 7 functions,
ship the APK.

---

### 2026-09-29 — Individuals · Orgs · Membership · Roles · Ownership (M1) · SHIPPED

Foundational refactor of the person↔organization↔role model (a big multi-stage spec).
Approach: **extend, don't duplicate** — a person is already one identity (Profile=login +
Player=sport); org ownership was already first-class (hostOrgId vs hostIds). What was
missing: a real membership store, an Owner role + safeguards, a Referee role, and an
invite/join-request lifecycle. Chosen model: **full join-table refactor** at the DB layer
while the data layer re-assembles `Organization.members` on read, so `org.ts` (~30 helpers),
the academic grade timeline and the 49KB org console keep working unchanged.

**M1a — data + roles** (migration **0020**): `org_members` join table (role/since/until/
grades) + `org_requests` (invite|request; pending/accepted/rejected/cancelled/expired).
One-time copy of the JSONB `organizations.members` → rows; guarantees ≥1 Owner per org.
Roles gain **Owner** (top; never zero — enforced in `setOrgMembers` so no path can violate
it) and **Referee** (assignable eligibility). `org.ts`: isOrgOwner/canManageOwners/
activeOwners/isSoleActiveOwner; canManageOrg, canOrganizeEvents, tournamentHostPlayerIds
include Owner; creator becomes Owner. repos: getOrganization(s) assemble members from the
table; setOrgMembers upserts+deletes rows; lifecycle fns inviteToOrg / requestToJoinOrg /
getOrgRequests / getMyOrgRequests / respondToOrgRequest / cancelOrgRequest. Demo seed
promotes an Owner per org (withSeedOwners).

**M1b — org console**: Owner/Referee member sections; role editor with guards (only Owners
manage Owners; last Owner can't be demoted/removed; any manager can bootstrap the first
Owner when none exists); pending requests (Accept/Decline) + sent invites (Cancel).

**M1c — user side**: `DiscoverOrgsScreen` (search discoverable orgs → Request to join;
"Requested" once pending) + Organize entry "🔎 Find a community"; Organize Invitations card
(accept/decline invites to you) + outgoing-request status. Joining is never automatic.

Verified in demo end-to-end (promote → Owner + "Only owner" guard; request to BPL Football
→ "Requested" + awaiting-approval surface). Clean tsc; 292 tests pass. **Migration 0020
must be run for live.** Next: M2 context switcher, M3 ownership/transfer, M4 school
structure, M5 audit.

### 2026-09-29 — Context switcher (M2) · SHIPPED

"Acting as" context (spec §17–18): one identity, acting as Personal or as one org you
belong to. New `OrgContextProvider` (src/core/orgContext.tsx) holds the active org id,
persisted per device via AsyncStorage, self-healing to Personal if you no longer belong to
the stored org; `useActiveOrg()` resolves it against your active memberships. New
`ContextSwitcher` component (header chip → sheet listing Personal + your orgs; hidden when
you have none), added to the Organize hub. Organize is now context-aware: Personal shows
what you personally host (excludes org-owned), an org context shows that org's tournaments +
a "🏛️ Manage <org>" shortcut, and "New tournament" defaults to organizing as that org
(CreateTournament already reads the orgId param). App root wraps with OrgContextProvider.
Clean tsc; 292 tests. (Visual walk pending — Browser pane was hidden at build time.)

### 2026-09-29 — Tournament ownership: creator + transfer + audit (M3) · SHIPPED

Spec §12–13, §27. Ownership (individual `host_ids` vs org `host_org_id`) was already
first-class; added: **createdBy** retained separately (Tournament.createdBy, player id,
set at create, backfilled from organizer_id; shown as "Created by"); **transfer**
individual⇄org via `transferTournamentOwnership()` (flips host_org_id/host_ids + host_name,
so an org-owned event survives the creator leaving; permissions recompute from the new
owner); **audit** `tournament_ownership_events` (created/transferred, snapshotted names) +
`getOwnershipEvents()`. Migration **0021** (+ schema.sql). UI: Info shows "Organized by … ·
Created by …"; Settings has a 🔑 Ownership card (transfer to yourself or an org you organize
for + history). Demo mirrors via demo.ownershipEvents. Clean tsc; 292 tests. **Migration
0021 needed for live.** (Visual walk pending pane visibility.) Next: M4 school structure, M5 audit.

### 2026-09-29 — School structure: Houses + participation rules (M4) · SHIPPED

**M4a — Houses first-class** (spec §20–21, §24): schools now manage their own House
list (was only global `Player.houseName` strings). types: House{name,colorHex},
HouseStint (timeline like GradeStint), Organization.houses, OrgMember.houses. org.ts:
housesOf/houseAt/currentHouse/assignHouse/houseColorOf — independent of class & teams,
history-preserving (a past tournament shows the House at that date). migration **0022**
(organizations.houses + org_members.houses jsonb) with graceful pre-migration fallback
(withOrgCols + member-cols retry); repos setOrgHouses. Console: 🏠 Houses manager (add/
remove) + per-student House picker; current House on the member row.

**M4b — participation rules** (spec §25): Tournament.participation (open | inter_house |
school_team | individual). migration **0023** (tournaments.participation). Create screen
"Contested by" chooser; shown on the tournament page. `enterOrgHousesAsTeams()` — for an
inter-house event hosted by a school, one tap enters each House as a team of that sport
(bridges first-class Houses → the existing house-team/medal mechanics). Team flexibility
(§22) already covered: a Club with zero sports is a general (non-sport) team.

Clean tsc; 292 tests. **Migrations 0022 + 0023 needed for live.** (Visual walk pending
pane.) Remaining: M5 audit/history + end-to-end; §9 per-tournament Scorer/Referee
assignment still open.

### 2026-09-29 — Officials assignment + audit trail (M5, + §9) · SHIPPED — EPIC COMPLETE

**§9 per-tournament officials**: org Scorer/Referee role is eligibility; a new
`tournament_officials` table records the actual per-event assignment. repos
get/assign/unassignTournamentOfficial (audited). Tournament Settings → 🎽 "Scorers &
referees" card assigns from the host org's eligible members (role Scorer/Referee), or the
hosts for an individual tournament.

**§27 audit trail**: `activity_log` + `logActivity`/`getActivity`. Membership joins, leaves
and role changes are recorded (joinOrg/leaveOrg + new `changeOrgMemberRole`, all now
carrying the actor), plus official assign/unassign. Org console shows a 🕓 History section.
migration **0024** (tournament_officials + activity_log). Demo mirrors.

**Epic complete**: M1 roles+membership lifecycle · M2 context switcher · M3 ownership+transfer
· M4 school structure · M5 officials+audit. **Live migrations to run: 0020–0024.** Clean
tsc; 292 tests. (M2–M5 visual walk still pending Browser-pane visibility.)

---

### 2026-09-29 — Multi-sport Teams (Clubs): data model + create/manage flow · IN PROGRESS

Building the Team Creation & Management system: one real-world team that plays MANY
sports, each sport with its own captain, squad and player roles — the interface stays
simple (create → pick sports → add teammates → manage), complexity hidden behind it.

**Architecture** — a new parent entity **Club** (shown in the UI as "Team") sits *above*
the existing per-sport `teams` rows rather than replacing them. Each per-sport `teams`
row becomes that sport's "profile" (it already carried captain_id / vice_captain_id /
roster), linked back by `teams.club_id`. So every existing match/tournament FK to
`teams` stays intact; the Club is a grouping + membership layer on top. (Option B —
ripping `sport` out of Team — was rejected: it would break every match/tournament FK.)

Mapping to the spec: Club = the team; `club_members.role` (admin|member, first member
auto-admin) = team administration; the per-sport `teams` row = sport profile; its
captain/VC + roster = sport leadership + squad; new `team_player_roles` = sport-specific
player roles (cricket WK/Bat/Bowl/AR, football GK/DEF/MID/FWD, etc — no universal list).

**Phase 1 (data, SHIPPED commit)**: types (Club/NewClub/ClubMember(+View)/ClubMemberRole/
TeamPlayerRoles + Team.clubId); migration **0018** + schema.sql (clubs, club_members,
teams.club_id, team_player_roles; public-read/authed-write RLS); `data/teamRoles.ts`
(per-sport role catalogue); repos.ts full data layer (createClub/get/list/update; member
add/remove/role with first-member-auto-admin; club sports add/remove + per-sport team
resolution; team player roles get/set) across demo + live.

**Phase 2 (screens, this commit)**: `ClubsScreen` (my teams + create), `CreateClubScreen`
(name/short/city/colour + multi-select sports + "add myself" → admin), `ClubHomeScreen`
(dashboard: member/admin/sport counts, sports add/remove, members list with promote/
demote/remove + add-by-phone), `ClubSportScreen` (one sport's captain/VC, squad pick,
per-player roles — all independent per sport). Routes Clubs/CreateClub/ClubHome/ClubSport
registered; Organize screen gains a "🛡️ My teams" entry (the old per-sport admin is now
"Manage houses"). Clean `tsc`; demo bundle healthy (authed UI drive deferred — preview
was on the live-env build and the checkout is shared with a concurrent session).

**Phase 5 (game/tournament integration, §16)**: `getClubsForPlayer`; new
`ClubQuickPick` "Your teams" chip row in TournamentTeamsScreen + ScheduleMatchScreen —
picking a club resolves its per-sport team (minting the sport profile on the fly if the
club doesn't play it yet); its captain + squad come with it, so scoring/squad/lineup wire
up downstream for free (the row already carries roster + leaders).

**Phase 3 (invite/add members, §10)**: (A) dashboard "Add member" now has **search
existing players** (name/phone) + add-by-phone, both fully working demo + live. (B) club
join links: migration **0019** `club_invites` + `createClubInvite`/`getClubInvite`/
`claimClubInvite`; `JoinClubScreen` + route + deep link `sportnnote://join-club/:token`;
dashboard "🔗 Invite" opens the native Share sheet with a code + message; Teams list has
"Have an invite code? Join a team". Graphical QR deferred (needs a QR dep — offered).
Also fixed a pre-existing structureConfig test (missing manualStandings/swissRounds in
the expected). All 292 pure-engine tests pass; clean tsc.

**Logo + QR (this commit)**: team logo upload via the existing `LogoPicker`/`pickPhoto`
— on the create form (72px) and the dashboard header (admins tap to change → updateClub),
shown in the Teams list too. Real scannable **QR code** in the invite card
(`react-native-qrcode-svg` + `react-native-svg`, added via `expo install` for SDK-56
compatibility) encoding `sportnnote://join-club/<token>`, with the code + Share link.

**Verified end-to-end in demo mode (2026-09-29)**: created "Hyderabad Warriors"
(cricket+basketball+football), dashboard counts, add-member search (Rohan Nair → member),
cricket profile (Aarav → Captain + Wicketkeeper/Batter), sport independence (football
empty, GK/DEF/MID/FWD catalogue), §16 "Your teams" quick-pick fills the match Home slot,
invite QR renders + code JOIN-1001, logo "Add logo" affordance present. All screens clean.

**Club QR scanner + https redirect (shipped)**: new **`join-club` edge function**
(public, browser landing page for `?c=<code>` showing the team name + redeem steps);
`clubJoinLink` now targets it when a backend URL is set, and the invite QR encodes that
https link so any phone camera opens it. In-app **QR scanner** (`ScanQRScreen`,
expo-camera) reads a team QR → `parseClubToken` (deep link / https / bare code) → JoinClub;
web + no-permission fallbacks; reached from "📷 Scan a team QR"; app.json camera permission
added. **Deploy step for user**: `npx supabase functions deploy join-club --no-verify-jwt`.

**Migrations 0018 + 0019 run by user 2026-09-29.** New native deps for the Oct 1 build:
react-native-svg, react-native-qrcode-svg (QR), expo-camera (scanner).

### 2026-09-29 — Tournament page split into tabs · SHIPPED

The tournament profile had become one very long scroll. Split into a persistent header
(logo, name, dates, status) + a tab bar: **Info · Settings · Matches · Stats · Teams**
(Settings hidden for non-managers). Info = enter-a-team / sport links / follow / format /
hosts / classes; Settings = participating teams / schedule / auto-fixtures / series / edit
/ reminders; Matches = upcoming|completed + per-sport filter; Stats = standings & bracket
links + medal/overall tables + by-sport tables & leaders; Teams = participating list.
Content scroll resets to top on tab switch. `TournamentProfileScreen.tsx`; verified in demo
across Info/Settings/Matches/Stats. Clean tsc.

---

### 2026-09-26 — Always-available "remind to install" (WhatsApp/SMS) · SHIPPED (build pending EAS quota)

Re-sharing the install invite is now one tap wherever a not-yet-registered player
shows. Extracted `provisionalInviteMessage()` into core/invite (single source for the
invite wording + join/report links); new reusable `<RemindInstall>` (WhatsApp + SMS
quick-send, renders nothing without a phone); Team **Squad** screen shows it on each
invited/pending row with an "Invited · not registered yet" status; `AddInvitePlayer`
now uses the shared builder. Ships with the next build (see quota note below).

### 2026-09-26 — One-person-one-team guard + remove player · SHIPPED (build pending EAS quota)

Two squad basics. (1) One person can't play for two teams in the same game/tournament:
`invitePlayer` now takes `matchId`; `conflictTeamsForAdd()` derives the opponent (from
the match) + every other team in the same tournament+sport, and adding a known person
(by phone) already rostered on one is rejected with a clear message (a brand-new number
can't clash). matchId wired through `AddInvitePlayer` everywhere; the message surfaces in
the add form. (2) `removePlayerFromTeam(teamId, playerId, matchId?)` drops a
mistakenly-added player from the roster (leaves squad picker + scoring roster), clears
their captaincy, and strips them from that match's saved squad + lineup — exposed as
"Remove" on each pending invitee (targets the player's real team even with the toggle)
and "✕" on each MatchSquad roster row. Verified in demo (opponent add blocked; remove
drops the row). **Not yet in an APK** — EAS free Android build quota exhausted for the
month (resets 2026-10-01); last built APK is versionCode 27. Ships in the next build.

---

### 2026-09-29 — Tournament organize: audit polish + Singles/Doubles up front · SHIPPED + VERIFIED

Closed the tournament-organize audit items. **Create screen**: registration deadline +
Min/Max teams now live on Create (shown when Open), not only Edit; racket sports get a
prominent **Singles / Doubles (pairs)** chooser up front (writes playersPerSide to the
draft) so participant structure isn't buried in per-sport settings. **PointsEditor**:
draw points, loss points, and a "break ties first by" picker are now editable (was
points-per-win only). **SportSettings**: football tie-decider no longer rendered twice —
the format-field copy is omitted, leaving only the dedicated "If a knockout tie is level"
card. **TournamentProfile**: added a "🔁 New series / tie" manager action (previously
unreachable from a tournament). Verified in demo (Tennis Singles/Doubles; Open →
deadline + min/max; football knockout single decider; points/draw/loss/tie-break
editable). Ships in the Oct 1 build.

### 2026-09-29 — Tournament format: Americano (padel/pickleball) · SHIPPED + VERIFIED

Full individual Americano: entrants rotate partners each round; every point you win is
added to your personal total; ranked on an individual leaderboard (no bracket). Padel &
pickleball only. `americano.ts` (pure + unit-tested): circle-method partner rotation →
2-v-2 games (byes/rests for non-4-multiples), per-player points standings,
suggestedAmericanoRounds; state (players/target/schedule/scores) JSON-encoded in
formats[sport] (zero-migration). 'americano' StructureShape → coarse 'league'.
StructureEditor Americano chip (padel/pickleball only). New AmericanoScreen (add
players, set points/rounds, generate rotation, enter scores, live leaderboard;
manager-gated) + route; TournamentProfile shows "Americano — manage" instead of
schedule/auto-generate; GenerateFixtures skips it. Verified in demo (4 players/3 rounds
→ correct rotation; 24–18 → winners 24/losers 18). `tests/americano.test.mts`. Ships in
the Oct 1 build.

### 2026-09-28 — Tournament formats: Manual standings / Scorecard + Swiss · SHIPPED + VERIFIED

New tournament format work (keep the existing flow, add options), demo-verified.

**Manual standings + Scorecard.** New per-sport structure "📋 Scorecard (manual table)":
the organizer maintains the standings by hand instead of auto-computing from results —
for sports we don't auto-score or quick offline meets. `structureConfig.manualStandings`
(reserved `structManual`, zero-migration on formats JSONB; `structureFromFormat` treats
manual-only as a valid config). Rows stored JSON-encoded in `formats[sport].manualRows`
keyed by division (`manualStandings.ts`). `StandingsScreen`: managers get an editable
grid (name + P/W/D/L/Pts, add/remove/Save via `updateTournament`), others see it ranked
read-only. Verified: Scorecard tournament → add/save a row.

**Swiss system.** New "🇨🇭 Swiss" structure: fixed rounds, no elimination, table-ranked
(coarse 'league' → no bracket). `swiss.ts` (pure, unit-tested): `swissRound1` (seeded
top-vs-bottom), `swissNextRound` (pairs on live standings, avoids rematches, fair byes).
`structureConfig` adds shape + `swissRounds`; StructureEditor Swiss chip + Rounds
stepper; `GenerateFixtures` generates round 1 then each next round from standings
(matches tagged swiss1/2/…; football decider stripped, draws allowed). Verified: 6 teams
→ round 1 seeded pairings created, standings shown, no bracket. `tests/swiss.test.mts`.

Chore: gitignore the Firebase service-account key + env backups. Both ship in the next
build (EAS quota resets 2026-10-01). Next: Americano; then the Singles/Doubles-up-front
polish + earlier audit batch.

---

### 2026-09-26 — Fix broken invite/join flow (404 link + no claim on register) · SHIPPED

A tester invited a captain; the recipient's link 404'd. Two bugs: (1) `joinLink` pointed
at `https://sportnnote.in/join/<id>` — the GoDaddy marketing site, no such route; (2)
even reaching the app, registering ran `createMyPlayer` which always INSERTED a new
player, never claiming the provisional row they were invited as (and the JoinTeam
screen's `claimInvite` uses `team_invites` tokens, unrelated to the add-by-phone
player-id links). Net: invitees could never actually take their slot.

Fixes:
- `createMyPlayer` now CLAIMS an unclaimed, unreported provisional player whose phone
  matches the registrant (UPDATE profile_id on that row) before falling back to INSERT.
  So installing + registering with the invited number drops them into the exact
  team/captain slot, and no two players share a number. RLS "players update scoped"
  already allows claiming (`profile_id is null` -> `= auth.uid()`).
- `joinLink` now targets the `join` edge function on `*.supabase.co` (like
  report-invite), not sportnnote.in. New `join` function: public, text/plain (the
  functions domain forbids HTML), personalized with the team name, detects
  already-claimed. Deploy: `npx supabase functions deploy join --no-verify-jwt`.

Proper universal-link-opens-app (App Links on a hosted web build) is a launch-time
follow-up; phone-claim makes the pilot flow work now. Build versionCode 27.

---

### 2026-09-26 — SMS fallback for player invites · SHIPPED + VERIFIED

Inviting a not-yet-on-app player only opened a WhatsApp click-to-chat (`wa.me`), which
is useless if they don't use WhatsApp — and it's unrelated to the blocked WABA/OTP
(that's automated verification, not invites). Added SMS as an equal channel via the
existing `openSms`/`Linking` (device messaging app; no gateway/WABA): after adding, a
"Send invite via: WhatsApp / SMS" row; each pending invitee row gets WA / SMS resend
links (invite text rebuilt from join+report links); button/copy made channel-neutral.
Verified in demo. Build versionCode 26. (Fully automated system-sent invites would
still need an SMS gateway or the production WABA — not set up.)

---

### 2026-09-26 — Restart a match started by mistake (first 5 min) · SHIPPED + VERIFIED

A scorer/host who starts or scores a game by accident can now wipe it back to "not
started" — but only while nothing is scored yet, or within 5 minutes of the first
event; after that it's committed (use End early / play on). `useLiveMatch.reset()`
clears unsynced taps (`matchOutbox.clear`), deletes the backend event log, blanks stat
lines (no delete policy → `stats:{}`), resets the match row to scheduled
(`repos.resetMatch`), then rebuilds. Window gated by `getMatchKickoffAt()` (first
event's `created_at`; `getMatchEvents` now selects it, demo stamps it). UI: a
"Restart match" bar with an inline confirm (matching End early) + a lighter "Not
started? Cancel" at 0 events; a 20s tick closes the window; cached `meta.status`
reset so the header drops LIVE. Verified in demo both paths. Build versionCode 25.

---

### 2026-09-26 — Background / remote push for app events · SHIPPED (needs ops to deliver)

Notifications only appeared when the app was open. Root causes: (1) no FCM credentials
in EAS → Expo can't deliver to a closed Android app; (2) no `expo-notifications` plugin
/ Android notification channel → background notifications don't display; (3) `notify()`
only fired on the *actor's* device — app events (scorer assigned, captain invited, squad
needed, tournament invite, verification decision) never pushed to the target user.

Code (this build, versionCode 24):
- `notify()` now routes a message addressed to another user → remote Expo push via the
  new `push-send` edge function; messages for me / untargeted stay local. RootNavigator
  sets the current player id on login (`setCurrentPlayerId`) so the two are distinguished.
- `push-send` edge fn: auth-required; player ids → profiles → push_tokens (service role,
  RLS hides others' tokens) → Expo `/push/send`. `repos.pushToPlayers()` invokes it.
- Android channel `default` (HIGH) created on register + before local notifications.
- `app.json`: `expo-notifications` plugin (icon/color + POST_NOTIFICATIONS for Android 13).
- `notify-upcoming` scorer targeting already fixed earlier (player→profile).

**Ops to actually deliver (user):** (a) upload **FCM V1** credentials to EAS (Firebase
project → service-account JSON → `eas credentials` → Android → FCM V1) — one-time, no
rebuild; without it `getExpoPushTokenAsync` returns null and nothing delivers on Android.
(b) `supabase functions deploy push-send` (and redeploy `notify-upcoming`). (c) Enable
the schedules: **notify-upcoming** cron (pg_cron / scheduled function) + **notify-followers**
DB webhook on `stat_lines`. (d) On device, grant the notification permission.
Push can only be tested on a real device after FCM; tsc clean + demo boots clean here.
Pilot note: `push-send` lets any authed user notify any player — tighten to a
match/team relationship check before scaling. See [[sportfolio-scorer-model]].

---

### 2026-09-26 — TESTING override: field unverified players · SHIPPED + VERIFIED  ⚠️ revert before go-live

Testers can't finish mobile/DOB verification yet, so the safeguarding gate blocked
picking any of them into a squad/onto the pitch — the lineup/formation flows couldn't be
exercised. The account owner deliberately relaxed the gate **for the testing phase only**
(reverses the earlier "even friendlies shouldn't bypass" rule). One switch:
`TESTING_ALLOW_UNVERIFIED = true` in `core/eligibility.ts` + `canFieldPlayer(p)` (=
override OR `matchEligibility(p).ok`). `matchEligibility()` is unchanged (screens still
show the true reason); only enforcement is relaxed — MatchSquad / LiveScoring /
CricketLineup now call `canFieldPlayer`. MatchSquad shows a persistent "⚠️ Testing mode:
eligibility checks are off" banner and marks each overridden player "· allowed (testing)".
Verified in demo (DOB-less player becomes Start/Bench-toggleable). **⚠️ Set
`TESTING_ALLOW_UNVERIFIED = false` before go-live** to re-arm the child-safeguarding gate;
tracked in [[sportfolio-golive-readiness]]. Build versionCode 23.

---

### 2026-09-26 — Edit formation & positions from the Lineups tab · SHIPPED + VERIFIED

Testers couldn't find how to set a team's formation / who-plays-where: the only path
was Info → Set matchday squad → Arrange on pitch, and the football **Lineups tab**
(`LineupView`) was read-only. Wired the long-declared-but-unused
`LiveExtrasProps.canEdit` / `onEditLineup(side)`: each team header on the Lineups tab
now shows a **"✎ Set/Edit lineup & formation ›"** button (managers / captains /
scorers via `canEditSquad`) that opens the squad → pitch editor for that side. Files:
`sports/types.ts` (signature now carries side), `LiveScoringScreen` (passes
`canEdit`/`onEditLineup` into LiveExtras), `football/index.tsx` (forwards),
`football/LineupView.tsx` (per-team button). Verified in demo: Lineups → Edit →
Arrange on pitch → assign GK → save → pitch shows the player at GK in 2-3-1. Build
versionCode 21.

**Per-side permissions (versionCode 22).** A captain/vice-captain may edit ONLY their
own team's squad/lineup/formation — never the opponent's; match runners (host/organizer
or scorer) keep both sides. `canEditHome`/`canEditAway` = run-match OR that side's
captain; `editSquad(side)` guards the wrong side; the Info-tab per-team entries, the
court "Edit" links and the Lineups-tab buttons all gate on the specific side; `MatchSquad`
+ `LineupEditor` take `editableSides` and the pitch editor hides and only-saves the
permitted side(s) (closes the home/away toggle leak). Coaches are names with no account
link, so per-side rights key off captaincy (a coach who needs edit is added as host or
captain). Verified: a match runner still sees both teams' buttons.

---

### 2026-09-26 — Scorer persistence bug (FK mismatch) + multiple scorers/hosts · SHIPPED

**Root-cause bug (live only): assigning a scorer never persisted.** A tester assigned
themselves, reopened, and the scorer was gone. Cause: the app stores/compares a
**PLAYER** id for the scorer (`canScore = scorer == my player id`; scorer picked from
the roster), but `matches.scorer_id` had a **FK to profiles(id)** and
`can_manage_match()` compared it to `auth.uid()` (a profile id). Writing a player id
violated the FK, and `setMatchScorer` never checked `error`, so the UPDATE was
**silently rejected** → column stayed null → "no scorer" on reload. Hosts persisted
because `host_ids` is a plain array with no FK. (Demo has no FK, so it "worked" there —
which masked it.)

**Fix + multi-scorer (migration `20260927120000_multi_scorer.sql`):**
- Repoint `matches.scorer_id` FK → `players(id) on delete set null` (it holds the
  PRIMARY scorer's player id, kept in sync for reminders/notifications).
- New `matches.scorer_ids uuid[]` (player ids) — **more than one person can score**.
  `can_manage_match()` now also grants any listed scorer (`scorer_ids && auth_player_ids()`).
- Backfill array from the old column; null out any stale non-player scorer_id first so
  the new FK validates. GIN index on scorer_ids. `schema.sql` updated to match.

**App:**
- `repos`: `Match.scorerIds`; `getMatch` selects/maps `scorer_ids`; new
  `setMatchScorers()` writes both columns and **throws on error**; `setMatchScorer`
  delegates; `setMatchHosts` now throws on error too (no more silent failures).
- `LiveScoringScreen`: `scorerId`→`scorerIds[]`; `canScore`/`iAmScorer` use `.includes`;
  the "Match scorer" card is now **"Match scorers"** — a removable list + "＋ Add
  scorer" (roster pick or by phone), editable **anytime, even mid-match**; write
  failures now surface an Alert and revert instead of looking saved. Hosts already
  supported multiple (`HostsCard`); verified add-by-phone → "Hosts · 2".

Verified in demo: two scorers added (Aarav + Rahul, each Removable), second host added
(Priya → Hosts · 2), Scoring tab present for a scorer. **Requires the user to run the
migration + install the new build (versionCode 20)** for the live persistence fix.

---

### 2026-09-26 — Match Info overhaul + size-aware lineups (7-a-side pitch) · SHIPPED + VERIFIED

Three fixes from live use, all verified in a demo 7-a-side friendly. Build: EAS
preview **versionCode 18** (`e92a8831`), live Supabase env.

**1. Editable Match Info + assign scorer/hosts by phone** (`LiveScoringScreen`,
`HostsCard`, new `DateTimeField`/`VenueField`/`SportFormatEditor` use). The Info tab
now shows "✏️ Edit date, venue & format" (canManage, pre-complete): date/time picker,
venue name + Maps URL, and the sport's own format editor (hidden once live). The
Match Scorer "+Assign" now works — pick any platform user or **add someone by mobile
number** (creates/invites them, then assigns); multiple scorers/hosts supported;
Hosts card gained an add-by-phone form. Format shows as e.g. "7-a-side · 5 subs".

**2. Add-players + captain** (carried from 2026-09-25): first player added to a
captain-less team auto-becomes captain and is notified; live roster now persists.
Verified: "Invited Rahul Sharma **as captain**".

**3. Size-aware pitch & formations** (`football/formation.ts`, `sports/types.ts`,
`repos.getLineup`, `MatchSquad`→`LineupEditor` param threading). A 7-a-side (or
5-a-side) match no longer shows an 11-slot 4-3-3. Added small-sided templates
(7: 2-3-1/3-2-1/3-1-2/2-2-2; 5: 1-2-1/2-2/2-1-1) + `perSide`-keyed helpers;
`getLineup(matchId, sport, perSide)` seeds the blank at the right size; captain/coach
edit formation + positions in the editor. **Bug found & fixed in verification:**
LiveScoring's lineup `useFocusEffect` was keyed only on `[matchId, sport]`, so it
seeded before `meta.config` loaded (perSide undefined → 11 slots); added `perSide`
to the deps. Verified: Lineups tab renders 7v7 with 2-3-1; editor offers the four
7-a-side formations and re-lays slots on switch (3-2-1 → GK,CB,CB,CB,CM,CM,ST).

**4. Scorer discoverability (found in live use).** A friendly *scheduled for later*
never got a scorer — only "Create & score now" assigned one — so reopening it showed
no **Scoring** tab (it's scorer-only: `canScore = myPlayerId === scorerId`) and the
creator had no obvious way to score their own match (tabs ended at Summary). Fixed
two ways: (a) `ScheduleMatchScreen` now assigns the creator as scorer for *all*
friendlies, not just immediate ones (changeable from Info; tournament matches stay
unassigned so organizers aren't force-assigned to games they won't score); (b) a
prominent "▶ Score this match" banner shows above the tabs whenever a host opens a
scorer-less match — one tap makes them the scorer and opens the controls. Verified in
demo by clearing the scorer (Scoring tab vanishes, banner appears) then tapping it
(Scoring tab returns, lands on "▶ Start the match"). Files: `ScheduleMatchScreen`,
`LiveScoringScreen` (`scoreThisMatch`, banner + styles). Rolled into build
versionCode 19 (`30778493`).

---

### 2026-08-31 — Verification review UX + pickleball/squash doubles

**Verification review from the profile + a discoverable queue.** In real use the
reviewer found the notification was the only way to a submission, and the profile
it opened had no actions. Now: a support reviewer viewing any profile gets 📄 View
document + a reason field + Approve/Reject inline on the verification card (records
the decision, notifies the submitter, updates their status/eligibility); and the
reviewer's own profile shows a "🛡️ Verification review · N pending" card that opens
the queue. Verified in demo (own profile "2 pending" → console; approving on
another player's profile flips them to Verified with history).

**Pickleball/squash doubles in rally/PAR.** Doubles was only visible in side-out /
English scoring (server 1/2 + hand-out from the roster); rally/PAR showed no serve
at all. Added a "Serving: <name>" banner there (rally winner serves next, from the
point log). No service court shown — that rule differs by sport. With the doubles
two-name capture, a pair now carries two real players and side-out names them.

---

### 2026-08-29 — Sport-aware setup + verification backends + settings Tiers 2–3

**Sport-settings Tier 2 (correctness bugs)** — from the 10-agent audit: kabaddi
bonus counts only with ≥6 defenders on the mat; basketball half-court games
(3×3/2v2/1v1) score 1s & 2s (no +3 button); football red-carded players leave the
XI and can't be subbed on; football rolling subs are unlimited (only fixed subs
cap); squash Club English (to 9) is win-by-1. (+5 tests.)

**Sport-settings Tier 3 (missing settings) — cricket toss.** Who bats first was
hardcoded to home; added `toss {winner, decision}` + `SET_TOSS` (bat ⇒ winner in,
bowl ⇒ other side), settable only before ball one, surfaced in match setup and on
the scorecard. (+4 tests.)

**Sport-aware match setup** (the big one). The app modelled every match as
team-vs-team, so Tennis Singles asked for two "Teams". Added `participantKind`
('team' | 'individual' | 'both') to SportPlugin — the 5 racket sports declare
'both' — and `participantMode(sport, format)` resolving a format to team /
individual (Singles) / pairs (Doubles). ScheduleMatchScreen now picks structure
first for racket sports, then shows Player 1/Player 2 (+ a "(me)" quick-pick) for
Singles or Pair 1/Pair 2 for Doubles — never "Team". All resolve to the existing
ad-hoc-team plumbing, so no Match-schema change. Verified in demo across Tennis
(Singles+Doubles) and Football (unchanged).

**Tennis serve tracking + doubles rotation.** Extracted tennis' pure logic into
`tennis/engine.ts` (RN-free, testable) and added serve: a `firstServer` +
`SET_FIRST_SERVER` "who serves first?" choice, and `serveInfo()` deriving the
serving side per game (tiebreak-aware) + which of a doubles pair serves. Scoring
controls show a serve banner; the scoreboard shows 🎾 next to the server. Verified
in demo (individual match, serve dot on the server). (+5 tests.)

**Individual tournament draws.** The participants screen now labels entries
players / pairs / teams by the selected sport's participantMode (a tennis draw
registers players, not teams; the team-only manager capture is hidden for
individuals). Bracket/fixture generation already pairs entry ids, so an
individual draw works with no schema change.

**Doubles two-name capture.** Creating a doubles pair now takes both partner
names and builds the side as a real two-player roster (serve order = roster
order), each carrying the pair name as their house so getRoster resolves them.
The serve banner then names the actual server — for *verified* players; the
safeguarding eligibility gate still filters unverified ad-hoc players, so casual
friendly pairs read "Server 1/2" until verified (gate working as designed).

**Serve for padel + badminton.** Extracted the game/set serve derivation into a
shared `src/sports/serve.ts` (tennis now uses it). Padel mirrors tennis (games/
sets) with a first-server chooser + "🟡 Serving: <name>" banner. Badminton, being
rally-scored, gets its own `serve()` — the rally winner serves next, service court
by score parity — with a "🏸 Serving: <side> · <court>" banner.

**Verification backends made real** (migration 0016 + edge fn `verification-submit`).
Age/ID: private `verification-docs` bucket + real file upload; Storage RLS
(own-folder write, owner/support read); players UPDATE policy for support (the
reviewer write, previously RLS-blocked); Resend email of a signed doc link to
sportnnote@gmail.com; a "View document" button in the review console. Phone OTP:
WhatsApp path is code-complete (Meta Cloud API) — only provisioning (token +
template + 2 secrets) is left, so the fallback copy now says "WhatsApp isn't set
up on this server yet" instead of "SMS coming soon". Needs: run migration 0016,
deploy the edge fn, set RESEND/SUPPORT secrets, grant one account the support role.

Preceded by 4 parallel read-only audits (game-creation flow, per-sport participant
structures, ID verification, phone/WhatsApp). `tsc` clean; 277 tests pass.

---

### 2026-08-25 — Sport-settings audit (10 expert agents) + Tier 1 fixes

Ran 10 parallel sport-expert agents (one per sport) auditing every sport's
settings for three gap classes: hidden-but-important, exists-but-not-wired, and
genuinely-missing (with downstream linkages). Two cross-cutting root causes fixed
in Tier 1:

- **Visibility** — game-defining settings were flagged `advanced:true` (hidden
  behind "⚙ Customize") across every sport. Surfaced the ones the experts flagged:
  football `halfMinutes`/`substitutes`/`subType`; basketball `regPeriods`/
  `periodMinutes`; cricket `overs`/`impactPlayer`; kabaddi `proRules`/`halfMinutes`;
  volleyball `setsToWin`/`pointsPerSet`/`deciderPoints`/`winByTwo`; badminton
  `gamesToWin`; tennis `noAd`; padel `deuce` (golden point); squash `gamesToWin`;
  pickleball `scoring`. (Directly resolves the two user-flagged gaps — football
  half length and cricket Impact Player, which was already fully wired, just
  hidden + off-by-default.)
- **Preset-seeding bug** — `defaultsFor` seeded each field's own default and
  ignored the selected preset's `set{}`, so e.g. a padel match labeled "Premier
  (golden point)" silently seeded *advantage*. Now applies the default preset's
  `set{}` on seed; deduped the 3 screen-local copies onto the one exported fn.

Tier 2 (bugs) and Tier 3 (missing settings + scoring wiring) follow. `tsc` clean;
268 tests pass.

---

### 2026-08-25 — Per-sport settings pages (fix sport-specific bifurcation)

**Why:** tournament settings weren't cleanly split by sport — the football
knockout decider ("Extra time + Penalties") showed tournament-wide, so a cricket
(or any non-football) meet saw options that don't apply to it. Structure was one
tournament-wide picker too, even though a meet may run football as groups→knockout
and badminton as a straight knockout.

**Shipped:**
- New **SportSettingsScreen** — one page per sport, showing ONLY that sport's
  Structure (league/knockout/groups), its format (cricket: overs/players/
  powerplay; football: halves/players/subs), the football-only tie-decider (extra
  time / penalties — cricket carries its own `tieBreak` in its format), and its
  points & tie-breakers. Reached from Create/Edit via one "⚙️ {sport} settings ›"
  button per chosen sport (`SportSettingsButtons`).
- A small **`tournamentDraft`** store carries the per-sport format map between the
  form and the per-sport pages (no callback-through-params).
- Removed the tournament-wide **Structure** picker and **"Format for knockouts"**
  section from Create/Edit. The coarse `tournament.structure` is now *derived*
  from the per-sport shapes on save; the football decider lives in
  `formats.football`. Old tournaments are migrated on open (`migrateFormatsForSettings`).
- **Regression guard:** football derives `knockout` from `decider !== 'none'`, so
  the decider must reach only knockout-stage football — `GenerateFixtures` strips
  it from league/group/super football (draws stand) and keeps it for knockouts
  (falling back to a pre-per-sport tournament's old `knockoutFormat`).

**Verified:** `tsc` clean; **268 tests pass**; bundle compiles, app loads with no
console errors. Live click-through pending a signed-in session (can't sign in).
Not yet rebuilt into an APK.

---

### 2026-08-25 — Multi-sport medal tournaments (Olympics / sports-day)

**Why:** organizers want an inter-school / Olympics-style meet — the same set of
teams competes across several sports, each sport awards points by finishing
position, and those sum into one overall ranking (with per-sport top tables too).

**Shipped:**
- `data/medalStandings.ts` — pure engine: each sport's league table gives a
  finishing position → configurable position points (optionally weighted per
  sport), merged by contingent name into one overall medal table (total +
  🥇/🥈/🥉 + per-sport placement breakdown). Reuses the sport's own tie-breakers.
  7 unit tests.
- `Tournament.scoring` config (`mode: 'match' | 'position'`, `positionPoints[]`,
  `sportWeights`) — migration `20260829120000_medal_scoring.sql` adds one `scoring`
  jsonb column (graceful pre-migration fallback like the registration columns).
- **Contingents** — `addContingent` enters a team into *every* sport at once
  (per-sport rows sharing name/colour); `getContingents` / `setContingentParticipation`.
  New **ContingentsScreen** (add once → all sports; per-sport in/out toggle).
- **Walkovers** (zero-migration, `__walkover` on match format): `walkoverMatch`;
  a host-only "🏳 Award a walkover" control on the match screen; and marking a
  contingent *out* of a sport auto-walkovers its scheduled fixtures there (the
  opponents take the win). MatchCard shows "W/O".
- `MedalScoringEditor` (Create + Edit Tournament, multi-sport only) — mode,
  ranked-position points table, per-sport weights. TournamentProfile shows the
  **🏅 Medal table** for a position-scored meet (per-sport tables unchanged).
  Player stats overall/per-sport are unchanged and keep working via the name-merge.

**Verified:** engine unit-tested end-to-end; `tsc` clean; **268 tests pass**; app
bundles clean (786 modules). Live UI click-through pending a signed-in session
(the shared live DB logged out on server restart; I can't sign in). **User runs
migration 0015.** Follow-up: auto-walkover at fixture-*generation* time for
teams already marked out before fixtures exist.

---

### 2026-08-25 — Double-chance playoff (gap #6, part B)

**Why:** the audit wanted double-elimination / the IPL "double-chance" playoff — a
second life for the top two. Full arbitrary double-elimination (a losers bracket
+ grand final) is a large engine rework; the concretely-named IPL format (top 4,
Q1/Eliminator/Q2/Final) is the common, bounded case, so that's what shipped. Full
double-elim is noted as a follow-up.

**Shipped:**
- `data/bracket.ts`: `doubleChanceOpeners` (Q1 = 1v2, Eliminator = 3v4),
  `doubleChanceNext` (Q2 = Q1-loser v Eliminator-winner, then Final = Q1-winner v
  Q2-winner), `doubleChanceChampion`. Stages `q1`/`eliminator`/`q2` sit outside
  the size-based KO_STAGES, so a straight knockout is untouched. 5 unit tests
  (incl. a beaten top-2 team winning the title via the second chance).
- **GenerateFixtures**: a "🎯 Double-chance playoff (top 4)" advance option,
  offered when exactly four teams qualify; generates the two openers.
- **BracketScreen**: a dedicated double-chance view (Qualifier 1 / Eliminator /
  Qualifier 2 / Final) that takes over when a Q1/Eliminator exists, with a
  "Create Qualifier 2 / Final" button as results come in, and the Final winner
  as champion.

**Verified:** engine unit-tested end-to-end; the normal bracket is unaffected
(the double-chance branch is gated on a Q1/Eliminator match). `tsc` clean; **261
tests pass**. (No migration needed — it rides on the existing `stage` column.)

---

### 2026-08-25 — Registration controls (gap #6, part A)

**Why:** the audit flagged open registration as all-or-nothing — no deadline, no
field-size bounds, and no way for a team to *withdraw* (only a hard remove that
erased its history).

**Shipped:**
- `core/registration.ts` — pure `registrationState` / `joinBlockReason` /
  `activeEntries` (confirmed + invited occupy a spot; pending/withdrawn don't).
  12 unit tests.
- New entry status **`withdrawn`** + tournament fields `registrationDeadline`,
  `minTeams`, `maxTeams`. `requestJoinTournament` now enforces the gate
  (closed / past deadline / full) — organizer adds still bypass it.
- **EditTournament**: registration deadline + min/max (cap) steppers, shown when
  Open. **TournamentTeams**: a `RegistrationBanner` (open / full / deadline /
  below-min) + per-team **Withdraw**, and a **Withdrawn** section
  (Reinstate / Remove). Withdrawn teams drop out of fixtures automatically
  (`getTournamentTeams` already filters to confirmed).
- Migration `20260828120000_registration_controls.sql`: widen the
  tournament_teams status check to allow 'withdrawn', add the three tournament
  columns. **Reads and writes degrade gracefully before it's applied** — the
  tournament select retries without the new columns, create omits them when
  unset, and update retries core-only — so nothing breaks pre-migration.

**Verified live:** the registration editor + banner + withdraw UI render;
tournament reads and an EditTournament save both work against the pre-0014 DB
(graceful fallback). `tsc` clean; **256 tests pass**. **User runs migration 0014**
for the controls to persist live.

---

### 2026-08-25 — Persistent tournament structure config (gap #5)

**Why:** the real structure (group count, how many advance, single/double
round-robin, Super phase) lived only in the transient auto-generate tool. The
tournament stored just a coarse `structure` label (league / knockout /
league_knockout) that could silently diverge from the fixtures — and the profile
dumped raw format values ("Football custom/none/rolling/20/3/0/5/0").

**Shipped (zero migration — config on `formats[sport]`):**
- `data/structureConfig.ts` — pure: `StructureConfig` (shape + groupCount +
  advanceTopN + advanceBest + doubleRound + superPhase), read/write helpers,
  `structureFieldFor`/`shapeForStructure` (keep the coarse label in step), and
  `describeStructure` → a plain-English one-liner. 10 unit tests.
- **GenerateFixtures**: pre-fills its form from the saved config (once per sport),
  and on generate **persists** the config back to the tournament + updates the
  coarse `structure` (never downgrading it in a multi-sport meet). So the tool
  remembers the shape and the tournament reflects reality.
- **StructureEditor** on Edit Tournament — group count, advance N, best-placed,
  double round-robin, Super phase, with a live summary. Its shape follows the
  tournament's Structure picker (no duplicate control); writes `structShape` in
  step so the saved config stays complete.
- **TournamentProfile**: replaced the raw format-value dump with the clean
  per-sport structure description (falls back to the coarse label when unset).

**Verified live:** edited Inter-School to "top 2 + 2 best-placed", saved → profile
shows *"4 groups (round-robin) → top 2 + the 2 best 3rd-placed advance to the
knockout"*; reopening the generator pre-filled Group stage / 4 groups / single
round-robin. `tsc` clean; **244 tests pass**.

---

### 2026-08-25 — League tie-breakers: configurable points, head-to-head, NRR (gap #4)

**Why:** the audit flagged the standings as too blunt — win was hardcoded to 2
points (football should be 3), and ties broke only on goal/point difference: no
head-to-head, no cricket Net Run Rate.

**Shipped (zero migration — overrides ride on `formats[sport]`):**
- `data/standings.ts` — `StandingsConfig` (win/draw/loss points + ordered
  tie-breakers), sensible per-sport defaults (**football 3-1-0**, cricket ranks by
  **NRR**, everyone gets **head-to-head** first). `teamStandings(matches, sport,
  cfg?)` stays back-compatible. New tie-break pipeline: rank by points, then break
  each still-tied cluster by the configured order — `h2h` runs a mini-league among
  just the tied teams (recursive, so partial ties fall through).
- **NRR without coupling:** standings is consumed by the pure test runner, so it
  can't import the sport registry (that'd pull in React Native). Instead a
  rate-provider is dependency-injected — `registry.ts` wires it lazily on first
  `getSport()` (not at module load, which crashed under Metro's import ordering).
  Cricket's `nrrOvers()` returns overs faced (a side bowled out counts its full
  quota — the standard NRR rule).
- `groups.ts` group tables + cross-group seeding honour the same config (no h2h
  across groups). Threaded the config through every standings view (StandingsScreen,
  TournamentProfile, SportHub, GenerateFixtures, the `useStandings` hook).
- `PointsEditor` on Edit Tournament (points-per-win 2/3 + a plain-language
  tie-break summary); `LeagueTable` shows NRR for cricket.
- 12 new unit tests (points / head-to-head / NRR via a stub provider / config
  parsing).

**Verified live:** the Points & tie-breakers editor renders with **3** selected for
football and "ties broken by head-to-head, then points difference, then points
scored". `tsc` clean; **234 tests pass**. (Also fixed a load-order crash the
rate-provider injection first introduced.)

---

### 2026-08-25 — Match & series deletion (fenced, safe-by-construction)

**Why:** organizers need to clean up fixtures created by mistake, but deletion is
destructive — a played match has events, stat lines and standings impact. Chosen
policy (with the user): **fenced in-app delete** — deletable only while a match is
still pre-match, so a played game's data can never be destroyed by a tap. A played
match can only be Cancelled (gap #1), never deleted.

**Shipped:**
- `repos.deleteMatch()` — pre-match only (scheduled/postponed/cancelled); the live
  path guards status in the WHERE clause and `.select()`s the deleted row so a
  zero-row result (RLS/permission) surfaces an error instead of a false success.
  Child rows cascade-delete. `deleteSeries()` — deletes all legs, but only when
  every leg is still pre-match.
- **EditMatchScreen** "Danger zone": host-only, two-step inline confirm (web-safe,
  not `Alert.alert`), with a note when the match is a series leg ("deleting removes
  just this leg").
- **SeriesScreen** "Danger zone": delete the whole tie (host-only, only while every
  leg is unplayed), two-step confirm.
- Migration `20260827120000_match_delete_policy.sql` — a **fenced DELETE RLS
  policy**: `can_manage_match(id) AND status in (scheduled,postponed,cancelled)`,
  so even a direct API call can't delete a played match or one you don't manage.
  (`matches` previously had no DELETE policy, so deletes silently affected 0 rows.)

**Verified live:** the danger zone + confirm render; the series-leg note shows;
deleting surfaced the guard-rail error (migration not yet applied) instead of a
false success. Demo-mode deletion works immediately. `tsc` clean; 222 tests pass.
**User must run migration 0013** for live deletion to take effect.

---

### 2026-08-25 — Series / ties wrapper, bracket-integrated (tournament gap #3)

**Why:** the audit's highest-leverage gap. A bracket "match" was always ONE game,
so nothing could model a best-of-X series (cricket bilateral, NBA playoff), a
two-legged aggregate knockout (UCL), or a team tie of rubbers (Davis/Thomas Cup).
One primitive — a tie that owns N child matches and resolves by most-wins or
aggregate — unlocks all three across 5 sports.

**Design (zero-migration):** a series has no table. Its config rides on each child
match's `format` jsonb under `__series*` keys, and a series is *derived* by
grouping matches with the same `__seriesId`. Works in demo + live immediately, and
lets the bracket treat a tie as one pairing just by grouping.

**Shipped:**
- `data/series.ts` — pure engine: `seriesLegFormat`/`readSeriesMeta`/`deriveSeries`,
  and `resolveSeries` → wins/aggregate, decided winner, dead-rubber & drawn-tie
  handling. `best_of`/`rubbers` = majority of wins; `aggregate` = combined score,
  then away-goals (optional), then the 2nd-leg result (ET/pens). 13 unit tests.
- **Bracket integration** (`data/bracket.ts`): a `KnockoutPairing` is a single
  match *or* a series; `knockoutStageRounds` collapses series legs into one
  pairing; `nextRoundPairs` / `thirdPlacePair` / `stageChampionId` advance by the
  *pairing* winner (a two-legged SF counts once, not twice). Back-compatible via a
  `roundPairings()` fallback. 5 new tests; `BracketScreen` renders a series card
  (wins/agg + each leg).
- `repos.createSeries()` — spins up the N child matches (alternating home/away, 3
  days apart), each carrying the series metadata + sport format.
- New **CreateSeriesScreen** (Organize → "🔁 New series / tie") and **SeriesScreen**
  (standing + tappable legs + winner). A "🔁 Leg X of N · View series" banner on
  each leg's live-scoring Info tab links back to the tie.
- **Fixed a latent bug:** the live match mapper (`toMatch`/`MATCH_SELECT`) never
  returned `format`, so per-match format overrides silently never round-tripped
  (and series metadata was invisible). Now mapped, with empty `{}` treated as
  absent so tournament-format inheritance is preserved.

**Verified live:** created a Best-of-3 (Cheetahs v Lions) from Organize → 3 legs
appeared (alternating home/away, 3 days apart); the leg's Info tab showed the
series banner; "View series" opened the standing with all three legs. `tsc` clean;
222 tests pass. (No match-deletion feature exists, so the 3 test legs remain in the
demo DB.)

**Follow-up (optional):** a "New series" entry from inside a tournament (tagging a
KO stage) so bracket-integrated ties are created without hand-tagging; match/series
deletion; per-sport leg durations in the series card.

---

### 2026-08-24 — Venue reuse + schedule-conflict detection (tournament gap #2)

**Why:** the tournament audit's #2 gap — an organizer could book one ground for
two overlapping games, or put a team in two places at once, with nothing to warn
them. Real fixture lists juggle a handful of grounds; a clash check is the point.

**Shipped (zero migration — the vestigial `venues` table stays unused; venues are
matched by name, which works identically in demo + live):**
- `data/scheduleConflicts.ts` — a pure, dependency-free engine:
  `findScheduleConflicts(candidate, others)` flags **venue** double-booking (same
  ground name, overlapping windows) and **team** double-booking (a team already
  playing in an overlapping game). Each sport has a nominal window
  (`matchDurationMinutes`, football 120 / kabaddi 60 / …) since matches carry only
  a kickoff; postponed/cancelled/completed games free their slot; a match never
  clashes with itself. `knownVenueNames()` derives the reuse pool. 16 unit tests.
- `components/VenueField.tsx` — venue input with one-tap "reuse" chips of grounds
  already used (consistent naming is what makes clash-detection meaningful).
- `components/ConflictNotice.tsx` — an amber, **non-blocking** ⚠️ banner ("Ground Z
  already hosts Cheetahs vs Tigers at Mon 21:33 — you can still save"). Advisory
  because organizers sometimes double-book knowingly.
- Wired into **ScheduleMatchScreen** and **EditMatchScreen**: both pull every
  fixture via `useMatches('all')`, offer venue reuse, and recompute conflicts
  reactively as the time/venue/teams change.

**Verified live:** reuse chip sets the venue on tap; rescheduling a second match
onto the same ground + overlapping time surfaced the clash banner reactively
(even mid-picker), correctly named the other fixture, and left Save enabled; the
notice cleared when the slot was freed. `tsc` clean; 205 tests pass. (Test data
written to the live DB during verification was reverted.)

**Follow-up (optional):** promote venues to a real FK-backed entity with a
per-tournament "manage grounds" screen (needs a migration) if organizers want to
pre-define grounds before any match uses them.

---

### 2026-08-24 — Match rescheduling & postpone (tournament gap #1)

**Why:** the tournament-organization audit flagged that a fixture could be *created*
but never *moved* — no way to change a scheduled match's date/venue or mark it
postponed/cancelled without deleting and recreating it (losing hosts, squads, the
whole row). This is the #1 real-organizer need (weather, venue clashes, no-shows).

**Shipped:**
- New `MatchStatus` adds `'postponed' | 'cancelled'` (`core/types.ts`); migration
  `20260826120000_match_status_postpone.sql` widens the `matches_status_check`
  constraint. **User must run migration 0012** before the live write is accepted
  (until then the DB rejects the new statuses — supabase-js returns the error
  without throwing, matching the repo's fire-and-forget update convention).
- `rescheduleMatch(id, {startsAt, venueName, venueMapsUrl})` and
  `setMatchStatus(id, status)` in `repos.ts` — both guarded to pre-match states
  (`.eq('status','scheduled')` / `.in('status',[scheduled,postponed,cancelled])`)
  so they can never clobber a live/completed game. Demo + live paths.
- New `EditMatchScreen` ("Reschedule Match" route): pre-fills kickoff + venue,
  saves via `rescheduleMatch`; Postpone / Cancel / Restore buttons per current
  status. Host-only entry from the LiveScoring Info tab ("🗓 Reschedule / postpone"),
  gated `canManage && status !== 'live'`; a postponed/cancelled banner shows to all
  viewers. `MatchCard` gains POSTPONED / CANCELLED badges.
- **List routing for the new states:** postponed/cancelled stay under **Upcoming**
  in the Matches tab (badged) so a host never loses sight of them; Home "Up next"
  and the SportHub upcoming list show postponed (badged) but drop cancelled; the
  reminder engine no longer nags about postponed/cancelled fixtures.

**Verified:** host-only entry renders (hidden for a viewer — gating confirmed live);
EditMatchScreen renders with pre-filled data and the correct per-status buttons;
navigation round-trips. Full write round-trip is pending migration 0012 on the live
DB. `tsc` clean; 189 tests pass.

---

### 2026-08-24 — Cricket extras + audit correction (undo already existed)

**Correction:** the audit's "cricket has NO undo" was wrong — it only read the
cricket plugin files. The global "↶ Undo last ball" bar in LiveScoringScreen pops
the last event and replays the truncated log for EVERY sport (cricket included).
Undo works; only surgical arbitrary-ball *editing* is absent (rare — undo walks
back step-by-step). `docs/sport-coverage/cricket.md` corrected.

**Cricket extras shipped:** wide + runs (byes on a wide / wide to the boundary —
was a fixed +1) and byes off a no-ball (no-ball now captures off-bat runs AND byes
separately, charged correctly: byes are team extras, not on the bowler or batter;
the striker still faces the ball + gets the free hit). Engine-local change in
`cricket/engine.ts` EXTRA case + a wide-runs picker and a no-ball-byes row in the
controls. 6 new tests in `tests/cricket.test.mts`. `tsc` clean; 160 tests.
Deferred (next cricket pass): run-out off a wide/no-ball, penalty runs, fielding
stat attribution to profiles.

---

### 2026-08-24 — Scoring QA Tier-3 (polish)

- **Volleyball timeouts** (`6aeab51`): TIMEOUT event + per-team buttons, 2/set, count shown.
- **Tennis double faults** (`6aeab51`): replay-safe — a DF scores the opponent a normal
  POINT (score + rally-editor stay correct) and credits the server via `attribution2`.
- **Box scores for padel / pickleball / squash** (`712bfae`): structured point events
  (kind/playerName/game|set/points) on rallyCore + padel + a shared `PointBoxScore`
  → parity with badminton/tennis/volleyball box scores.
- Remaining Tier-3 (deferred, lowest value): volleyball rotation/libero; tennis break
  points; squash let/stroke; basketball jump-ball/minutes/+-. 189 tests.

---

### 2026-08-24 — Scoring QA Tier-2 (ease-of-scoring + edge features)

Following the Tier-1 gap fixes: the ease-of-scoring wins + two edge features.
- **Football goal 5 taps → 3** (`78bfb2a`): scorer pick goes straight to one panel;
  open-play default; header/penalty/free-kick & assist optional; goal logged once
  on finish. Voice path unchanged. Closes the "header not a goal type" gap too.
- **Basketball free throws** (`8df27e9`): count-aware auto-close (pick 2/3/1, panel
  counts down, no "Done") + a one-tap `🔗 And-one` on the scorer row.
- **Kabaddi 5-raid shootout** (`51e4e2f`): START_SHOOTOUT + SHOOTOUT_RAID; five raids
  a side then sudden death, regulation score stays tied, result() returns the
  shootout winner; shootout panel + `decideRaidShootout`/`sum` in pure rules.ts.
- **Pickleball Dreambreaker** (`51e4e2f`): a preset for the rally single game to 21
  win-by-2 (rallyCore scores it exactly).
Remaining Tier-2: football woodwork + VAR flow; basketball missed-shot/FG%. 189 tests.

---

### 2026-08-24 — Deep scoring QA: 100 real matches across all 10 sports

Comprehensive scoring validation. Built a **test matrix** of 100 real matches (10
per sport, chosen for event variety) with reference links + fetchability tiers
(artifact "Scoring Test Matrix"). Ran it in two tracks: **feed** (football/
basketball/cricket — true event-by-event replay vs ESPN, cricket via the
espn.com mirror since Cricinfo/Cricbuzz 403) and **reconstruct** (7 sports — no
public point-by-point feed exists, so scorecard + structural coverage). Results
in the "Scoring QA Report" artifact.

Verdict: engine reproduces real matches across every sport + edge case; ease-of-
scoring strong (cricket 1-tap runs + auto strike; football goal/penalty 5 taps is
the one speed risk). **Tier-1 gaps (four real capture failures) fixed** (commit
`ff2f0f1`): retirement/walkover early-end (cross-sport, `retireMatch` + live
control), football in-play `STOPPAGE`, basketball player `EJECT`, cricket
`CONCUSSION_SUB`. Tier-2/3 (football goal-tap reduction, FT auto-advance, kabaddi
shootout, Dreambreaker, double faults, box scores) documented, not yet built.
186 tests.

---

### 2026-08-24 — Replay acceptance: reproduce real matches event-by-event

The end-to-end validation behind the whole engine — replay a real match's event
feed through the ACTUAL on-device reducer and reproduce the full match, not just
the final score. Method + results in `docs/sport-coverage/replay-validation.md`.

- **Football ✅** — extracted `football/engine.ts` (pure core, like basketball/
  cricket/kabaddi); `tests/football.test.mts` replays a REAL match (Newcastle 2-2
  Liverpool, ESPN 401879319) event-by-event: score after each goal, both sides'
  scorers in order, the 90+9' equaliser flagged as a penalty, per-side cards, subs,
  draw. Edge cases: VAR-disallowed goal reverts, own goal, 2nd yellow → red.
- **Cricket ✅** — Cricinfo/ESPN block automated fetch (403), so a realistic full
  over (FOUR·1·wide·SIX·bye·wicket·2) is replayed ball-by-ball and reproduces the
  scorecard: 15/1, extras, per-batter card splits, bowling figures (byes not
  charged), strike rotation, over completion. All delivery types already unit-tested.
- **Basketball ✅** — a real-game-style Q1 (3pt, shooting foul → 2 FTs, rebound/
  assist/steal, timeout, 2pt) reproduces the line score + per-player box points.

Every pure engine is now node-tested. `tsc` clean; **182 tests** (was 137 at the
audit's start). The scoring engine reproduces real matches across all three
reference sports.

---

### 2026-08-24 — Kabaddi: defender tackle credit + voice through the engine

- **Defenders now get their tackle points.** The guided raid asks "Who made the
  tackle?" when the raider is out and credits that defender (2 for a super-tackle,
  computed from defenders-on-mat) via the `attribution2` channel → shows on the
  tacklePoints leaderboard.
- **Voice routes through RAID_OUTCOME** — "raid" = a 1-touch raid, "tackle" = the
  named side tackled the opponent's raider. Both advance the out-count / all-out /
  do-or-die engine instead of the old score-only +1 that silently desynced the mat.
- `tests/kabaddi.test.mts` covers raid / tackle / super-tackle / do-or-die.
- Deferred (Tier 3): technical points; the in-plugin raid editor doesn't reverse a
  defender's tackle stat (the global undo bar does).

`tsc` clean; 170 tests. **Sport-coverage audit substantively complete** — all 10
sports swept; basketball & cricket fully overhauled; football essentially
ground-ready; remaining items are documented Tier-3 polish.

---

### 2026-08-24 — Racket/net sweep: voice aces, volleyball blocks

- **Voice → ACE** for tennis & volleyball (a spoken "ace" used to log a plain
  point, losing the stat). New `tennisVoice` / `volleyballVoice` parsers;
  volleyball voice also does "block".
- **Volleyball blocks** — a `🧱 Block` capture: a winning block scores a point +
  credits a `blocks` stat; new BLK box-score column + leaderboard.
- Taught the shared rally point-editor + `EDIT_LOG` replay (`rallyEdit.ts`) the
  `block` kind (new `PointKind` + `isPointKind`), so a block survives an unrelated
  timeline correction — guarded by `tests/rallyEdit.test.mts` (3 tests).
- **Deferred:** tennis double faults (a DF scores the opponent, breaking the
  editor's "point side = rally winner" invariant → would double-count on replay;
  needs serve tracking); box scores + surgical editors for padel/pickleball/squash
  (global undo already covers corrections; points already reach profiles).

`tsc` clean; 166 tests.

---

### 2026-08-24 — Cricket finished: run-outs off an extra, penalty runs, fielding stats

The deferred cricket items:
- **Run-out off a wide / no-ball** — a wicket on a non-legal delivery: the over
  doesn't advance, the +1 penalty applies, completed runs count (extras on a wide,
  off-bat on a no-ball), no bowler credit. Entry via "…or a RUN OUT" in the Wide/
  No-ball panels; reuses the wicket flow (runs→fielder→batter→new batsman).
- **Penalty runs** — a `PENALTY` action + "⚖️ Penalty +5" button (extras to the
  batting side).
- **Fielding stats to profiles** — added a 2nd-attribution channel `attribution2`
  to ScoreAction (persisted in the event payload, reversed on undo in useLiveMatch).
  A caught wicket now credits the bowler AND the fielder's catch; stumped→keeper;
  run-out→fielder. `catches` added to cricket leaderboards.

3 more engine tests (9 in tests/cricket.test.mts). `tsc` clean; 163 tests.

---

### 2026-08-24 — Per-sport capture audit + Basketball made ground-ready

New workstream: verify every sport captures a real match as-is (settings, every
scorer action, corrections). Built the mechanism in `docs/sport-coverage/` — a
matrix per sport (specialist "needs" vs app "does") → prioritised gap list →
replay acceptance test. Method is **hybrid**: spec-diff all 10 fast, fix, then a
real-match replay per sport.

Audit headlines (all 10 inventoried): **cricket has NO undo/edit of a delivery**
(highest severity — queued); basketball had no real free-throw capture;
padel/pickleball/squash lack the timeline editor the other rally sports have;
football is essentially ground-ready.

**Basketball — Tier 1+2 shipped (commit `0d2fda4`):** free throws (made/miss/
and-one/shooting-foul flow), foul types (personal/shooting/technical/flagrant/
offensive; technicals excluded from bonus), substitutions with optional on-court
five, steals/blocks/turnovers + STL/BLK/TO box score, off/def rebounds, timeouts
(per-format limit). Extracted the pure core to `basketball/engine.ts` (mirrors
cricket/kabaddi) → 13 unit tests. Shot-clock enforcement deferred (referee's
call). `tsc` clean; 154 tests. Order next: cricket (undo), then kabaddi/volleyball/
badminton/tennis, then padel/pickleball/squash.

---

### 2026-08-24 — Go-live blockers 3–7 cleared → all 7 SHIPPED

The rest of the pilot-blocker list from the readiness audit, in order:

- **#3 players-PII RLS** (`c...`/migration `20260824120000`) — replaced the blanket
  "authed write players FOR ALL" with scoped insert/update/delete (own claimed row
  `profile_id=auth.uid()` or unclaimed provisional `profile_id IS NULL`). User runs 0010.
- **#6 edit tournament** (`adbbb79`) — `updateTournament(id, patch)` + `EditTournamentScreen`
  (name/dates/sports/structure/knockout/formats/open) + "✎ Edit tournament" on the
  tournament page (hosts only). Pure code, no migration.
- **#7 cross-sport house merge** (`4e1c725`) — `overallStandings` keyed the merge by
  `teamId`, but a house is a separate single-sport team row per sport → a multi-sport
  house showed as several rows and never combined points. Fixed: merge by name
  (case/whitespace-insensitive). Added `tests/standings.test.mts`. Renders on
  multi-sport tournament pages.
- **#5 phone-OTP login** (`c5dc250`) — the SMS-code option was a silent dead-end (no
  SMS provider, phone not on auth.users). Gated behind `SMS_LOGIN_ENABLED=false` in
  `AuthScreen` → email-code + password only; phone code kept behind the flag.
- **#4 email verification** (`837ded4`) — Path A (pilot: confirm-email OFF, works today)
  + pre-built Path B so switching on later is a dashboard flip + one migration, no code:
  migration `20260825120000` (handle_new_user trigger makes the profile as the DB from
  user metadata; de-dupes handle), `signUp` passes `options.data` + idempotent upsert
  fallback + returns `needsEmailConfirm`, AuthScreen shows "check your email".
  Runbook `docs/email-verification.md` (ORDER: migrate before flipping confirm-email ON).

All: `tsc` clean, 141 tests. **User actions pending:** run migrations 0010 + 0011 in the
Supabase SQL editor (both safe to run now); confirm Authentication → Email → "Confirm
email" is OFF for the pilot.

---

### 2026-08-24 — Go-live audit + results write-back (blockers 1&2) · SHIPPED

Ran a 4-area go-live readiness audit (auth/security, spectating, tournament types,
career/stats) → 7 blockers, published as the "SportnNote Pilot Readiness" artifact.
Started on the #1 blocker: **the app scored games but never saved the result**, so
all standings/records/win-rates read empty for real play.

- New pure `SportPlugin.result(state) → {winner, home, away}` for all 10 sports
  (goals/points, games/sets won, football shootout, cricket chase/super-over) — the
  display summary is never parsed for winners.
- `toMatch` derives winner + score from stored state (fixes for/against + works
  retroactively; no migration).
- `updateMatchSnapshot` on completion persists `matches.winner` and sets each
  `stat_lines.won` for the winning side (live + demo). Unlocks team W/L/points,
  team records, player wins/win-rate, and correct match history.
- typecheck clean; 137 tests; app boots clean (read path safe on every match).
- Remaining blockers: 3 players-PII RLS, 4 email-verify flow, 5 phone-OTP,
  6 edit-tournament, 7 cross-sport house merge.

---

### 2026-08-24 — ③ Phase 2: per-division fixtures / standings / bracket · SHIPPED

Divisions (Phase 1) are now a real competition boundary, not just a roster tag.
- A match's division is **derived** from its teams' entry roster — no
  `matches.category_id` column (avoids another migration + the pre-migration read
  risk). `groups.matchesInDivision(matches, entries, categoryId)` is the shared
  filter; `useDivisions` hook + `DivisionTabs` component are the shared UI.
- **GenerateFixtures**: a Division selector scopes the team picker (and advance-
  mode group/super tables) to one division → fixtures generated within a division.
- **SportHub** + **Standings**: Division selector scopes the schedule + table.
- **Bracket**: Division selector scopes the knockout.
- Backward-compatible: no categories ⇒ everything shown as before. Leaders on
  Standings remain tournament-wide (follow-up). `tsc` clean; 137 tests (added
  `matchesInDivision`). Also this session: provisional-player "not me" report
  (report-invite fn) + WhatsApp phone OTP wired (pending Meta setup).

---

### 2026-08-18 — Categories, Home feed, mobile build, onboarding · SHIPPED

A big day. Migrations 0007 + 0008 are now live.

- **Team-entry ③ — categories/divisions.** Migration 0008 (`tournament_categories`
  + `tournament_teams.category_id`, separate table w/ backward-compat fallbacks).
  `DivisionsEditor` at tournament creation; a Division selector on the
  Participating-teams screen — teams rostered per division. Verified live.
- **Home = a follow feed; Matches = only your games.** `getScopedMatches` splits
  matches into `{ mine, feed }` (mine = play/organize/score; feed = mine + anyone
  you follow, a followed player resolving to their team's matches); `getTeamRosters`
  maps players↔teams; `useScopedMatches` hook. Home shows the feed, Matches shows
  mine. Verified live on-device.
- **Dev seeder.** `__DEV__`-only console hooks `__sportfolioSeedDemo()` /
  `__sportfolioSeedMatches()` populate the live backend with a realistic, user-owned
  demo (Inter-School Championship, U14 Boys / U16 Girls, teams, matches, and a
  searchable/followable "Aarav Mehta"). Clean-slate wipe in `docs/seed-and-wipe.md`.
- **Mobile build (EAS).** Bundle ids `in.sportnnote.app`, `eas.json` (preview =
  Android APK), EAS project `@sportnnote.in/sportnnote`, `expo-updates` (OTA).
  First Android APK built & installed. **Gotcha fixed:** EAS cloud builds don't get
  `.env.local`; set `EXPO_PUBLIC_SUPABASE_*` as EAS env vars on the `preview`
  environment or the app silently falls back to demo mode. `eas update` Hermes step
  can OOM locally — prefer a cloud rebuild.
- **First-run onboarding tour.** 7-step spotlight that dims the screen and rings the
  actual element each step describes (a bottom-tab, or the ••• button), card anchored
  beside it; captures touches; persists a seen-flag; **Replay app tour** in Settings.
- **Home header fix.** Wordmark no longer wraps ('SportnNo/te'); voice/friendly/
  calendar collapsed under a visible ••• quick-actions toggle beside notifications.

---

### 2026-08-16 — Team-entry overhaul ② Invite / self-register + lifecycle · BUILT (needs migration 0007)

Team participation is now a lifecycle, not a flat "in / not in": `confirmed`
(counts toward format + fixtures), `invited` (organizer invited, captain accepts),
`pending` (captain requested, organizer approves).

- **Migration 0007** (`20260816120000_tournament_entry_status.sql`): adds
  `tournament_teams.status` (default `confirmed`, checked enum) + a status index.
  RLS unchanged (0003 already lets any authed user write) so captain
  self-registration + organizer approvals both work. **Must be run on live.**
- **Data layer** (`repos.ts`): `getTournamentTeams` now returns confirmed-only;
  new `getTournamentEntries` (all statuses), `requestJoinTournament` (pending),
  `setTournamentTeamStatus`, and `addTournamentTeams(…, status)`. Hook
  `useTournamentEntries`. Demo store carries `status`.
- **Organizer** (`TournamentTeamsScreen`): a "Requests & invites" gate —
  Accept/Decline requests, Confirm/Cancel invites (captain notified either way) —
  plus an "Add directly / Invite (captain accepts)" mode toggle on the picker.
- **Captain** (`TournamentProfileScreen`): replaced the vague notify-only "Request
  to join" with a real "Enter a team" card — request to enter your captained team
  (→ pending, hosts notified) or Accept an invite (→ confirmed).
- **Backward-compatible rollout:** `getTournamentEntries` + `addTournamentTeams`
  fall back to a status-less read/write when the column is absent (pre-0007),
  treating rows as confirmed — so the existing participants feature keeps working
  before the migration. Verified live: confirmed adds persist ("Participating
  teams · 1") via the fallback with 0007 not yet applied. Invited/pending need 0007.
- Verified: `tsc` clean, 135 tests pass; ① + ② organizer/captain UI exercised on
  the live app in-browser. **Note:** localhost:8091 is the LIVE app (authenticated
  session), not demo — created throwaway test data (tournament "Test Cup (entry
  flow)", team "Red House", pending player "Ravi Kumar"); no messages were sent.

---

### 2026-08-16 — Team-entry overhaul ① Real team entry + contact · SHIPPED

The old "add teams" model assumed teams already existed on the app (created by
individuals) and the organizer just picked them; the on-the-fly "New team" form
made an orphan (name/short/colour — no owner, no contact, no squad). Real events
work the other way: the organizer brings teams in and each team is a real,
contactable entity. This is phase ① of a 3-part overhaul (② invite/self-register,
③ categories/divisions).

- `TournamentTeamsScreen`: the "New team" form now (a) attributes the team to the
  hosting community (`orgId = tournament.hostOrgId`) so it isn't an orphan, and
  (b) has an optional **team manager / captain** section (name + phone + email).
  When given, it finds/creates that person (`invitePerson`), sets them as captain
  (`setTeamLeaders`), mints a **team-claim invite** (`createInvite` → `join/:token`),
  and sends it: email auto-sends (`sendInviteEmail`, `role: 'manage'`); phone shows
  WhatsApp/SMS buttons. A post-add confirmation card shows the outcome + share CTA.
- `core/invite.ts`: generalized `inviteMessage` / `inviteSubject` / `sendInviteEmail`
  with an optional `role: 'co-host' | 'manage'` (defaults to co-host, so existing
  co-host callers are unchanged); "manage" wording points at claiming a team.
- Verified: `tsc` clean, bundle compiles, app boots with no console errors. Screen
  is behind login (user drives the end-to-end check).

---

### 2026-08-16 — Co-hosts on the tournament page · SHIPPED

The add/invite-a-host lookup previously only existed at tournament creation. Now the
same `CoHostPicker` (search existing users by name/phone/email, or invite someone new
by email/WhatsApp/SMS) is available on the tournament page itself, so hosts can be
added *after* a tournament exists.

- `CoHostPicker` gained two props: `label` (header text) and `hideList` (suppress its
  own selected-chips list when an outer component already renders the hosts).
- `TournamentProfileScreen`: the individual-host section now shows `HostsCard`
  (display + remove; `candidates={[]}` disables its old candidate-list add) with a
  `CoHostPicker` beneath it in `hideList` mode. Adds/invites persist straight to the
  tournament's `host_ids` via `setTournamentHosts`; invited pending players become
  active hosts once they register. Gated on `canManageHosts`.
- Verified: `tsc` clean, bundle compiles, app boots with no console errors. The
  tournament page is behind login (user drives the end-to-end check).

---

### 2026-08-10 — Rebrand: Sportfolio → SportnNote · SHIPPED + VERIFIED

"Sportfolio" was taken (existing company + app), so the product is now **SportnNote**,
tagline **"Play a Sport, Make a Note."** (dedicated inbox `sportnnote@gmail.com`).

- **Wordmark** is two-tone `Sport`(text)·`nNote`(accent) on the Auth + Home screens; both
  taglines now read "Play a Sport, Make a Note." Verified rendering on the live Auth screen.
- **User-facing text** everywhere (screens, help centre/KB, invite + verification + support
  email copy, iOS permission strings) → SportnNote.
- **Identifiers:** `app.json` name `SportnNote` / slug `sportnnote` / scheme `sportnnote`;
  `package.json` name; deep-link prefixes `sportnnote://` + `https://sportnnote.app`;
  calendar `.ics` PRODID/UIDs/filenames. Email sender name → `SportnNote <…>` (secret
  updated; support-escalate/send-invite/send-contact-otp redeployed).
- **Left intentionally unchanged** (internal, invisible, would wipe state or churn): the
  `__sportfolio*` debug hooks, localStorage keys (`sportfolio.demo.v33`, `.timeZone`,
  `.outbox`, `.reminderPrefs`), and the KB entry id `what-is-sportfolio`.
- **Domain:** the deep-link + email sender domain is now **`sportnnote.app`** (to be
  registered/verified — see [[sportfolio-repo]] email notes). 135 tests, typecheck clean.

---

## Quick reference

- **Run (web demo):** `npx expo start --web --port 8091` (demo mode = in-memory sample data).
- **Reset demo to a clean seed:** clear `localStorage['sportfolio.demo.v18']` and reload.
- **Repo / push:** git lives in `sportfolio/` (the parent `rudy/` dir is NOT a repo). `origin` = **private** GitHub `hrudhaypv-byte/sportfolio` (added 2026-08-01). **Verify the gh account before pushing** — `gh auth status` should show active `hrudhaypv-byte` (not `likhithareddy3399`). Main branch `feat/sport-formats-and-scoring` is **shared with the concurrent "Sportfolio demo screen" session** (it commits cricket work) — check `git log`/`git status` and stage only your own files before committing. Commit/push only when asked.
- **Primary user we optimize for:** the **organizer / scorer**.
- **Working rhythm:** propose-then-approve — bring a plan, get the green light, then build + verify in the running app.
- **Key paths:**
  - Sport plugins: `src/sports/<sport>/index.tsx` (contract in `src/sports/types.ts`).
  - Data layer: `src/data/repos.ts` (single gateway; demo vs Supabase split).
  - Demo seed/store: `src/data/demoStore.ts` (+ `worldCup*Seed.ts` for real-game seeds).
  - Live scoring screen: `src/screens/LiveScoringScreen.tsx`.
  - Ratings: `src/data/ratings.ts`. Reminders: `src/data/reminders.ts` / `reminderPrefs.ts`.
  - DB schema (deploy-time): `supabase/schema.sql`.
- **Verification note:** some RN-web `Button` touchables resist the test harness's synthetic
  clicks; where that blocked UI verification, actions were driven via the reliable
  voice-typed command box or `__sportfolio*` test hooks. Buttons work normally on device/Chrome.

---

### 2026-08-10 — Real email verification (OTP) + honest phone labelling · SHIPPED + VERIFIED

Contact "Verify" was a mock: the code was generated client-side and shown on-screen ("Demo code: …"),
nothing sent — so users tapped Verify and waited for an SMS/email that never came. Now **email is real**;
phone is clearly labelled as temporary until an SMS provider is added.

- **Real email OTP** for the player's own email: a server generates a 6-digit code, stores it **hashed**
  (10-min expiry, one per player+channel, 5-attempt cap), and **emails it via Resend**; verification is
  checked server-side and flips `email_verified`. Two edge functions — **`send-contact-otp`** and
  **`verify-contact-otp`** — both authenticate the caller (JWT) and confirm they own the player (the target
  address is read from the DB, never the client). Backed by **migration 0006** (`contact_otps` table,
  server-only RLS).
- **Graceful fallback:** if the function isn't deployed / no `RESEND_API_KEY`, email verification degrades
  to the on-screen code (labelled "Email delivery isn't set up here — use this code: …"). Phone always uses
  the on-screen code, now labelled **"📱 SMS codes are coming soon — for now, use this code: …"**.
- **Client:** `beginContactVerification` (invokes send-contact-otp for email; else returns an on-screen
  code) + `verifyContactOtp` (invokes verify-contact-otp). `ContactCard` rewired with a `real` mode +
  `emailOtp` prop (own card only — the guardian card keeps the on-screen code). `ProfileView` passes
  `emailOtp` on the own-contact card.
- **Files:** `src/data/repos.ts`, `src/components/ContactCard.tsx`, `src/components/ProfileView.tsx`,
  `supabase/functions/send-contact-otp/index.ts` + `verify-contact-otp/index.ts` (new),
  `supabase/migrations/20260810120000_contact_otps.sql` (new).
- **Verified (demo):** phone Verify shows the "SMS coming soon · use this code: NNN" label → entering it
  flips to ✓ Verified; the email-fallback label renders too. 135 tests, typecheck clean.
- **⚠️ For live email OTP:** run **migration 0006** and deploy the functions —
  `supabase functions deploy send-contact-otp && supabase functions deploy verify-contact-otp` (reuse
  `RESEND_API_KEY`). Until then, email uses the labelled on-screen fallback. Phone stays on-screen until an
  SMS provider (Twilio/MSG91) is wired.

### 2026-08-10 — Co-hosts: look up or invite people to co-host a tournament · SHIPPED + VERIFIED

Create Tournament only let you host as *yourself or an org* — no way to add another person as a co-host, and
no way to bring someone who isn't on the app yet. New end-to-end **co-host** flow.

- **`CoHostPicker`** (new, reusable component) in Create Tournament: a **"Co-hosts (optional)"** section with
  **+ Add co-host** → a lookup field (**name / phone / email**) showing matching users → tap **+ Add**. Added
  co-hosts show as removable chips.
- **Invite someone new** → for a person not on Sportfolio, an inline form (name + phone + email) with three
  channels: **📧 Email · 💬 WhatsApp · ✉️ SMS**. It creates a **pending player** (the existing invite-to-install
  model), adds them as an `· invited` co-host, and sends the invite with an install/register link
  (`https://sportfolio.app/join/:id`). They become an active host when they register.
- **Channels:** WhatsApp/SMS are client-side `Linking` (`openWhatsApp`/new `openSms`, `wa.me` / `sms:`) — no
  backend. **Email** goes through a **new `send-invite` edge function** (Resend, arbitrary recipient, modelled
  on support-escalate) with a **`mailto:` fallback** so it works even before that function is deployed.
- **Data:** `findPlayerByEmail`, `lookupPeople` (name + exact phone/email, merged), `invitePerson`
  (find-or-create pending, not team-bound); `NewTournament.coHostIds` → `createTournament` sets
  `host_ids = unique([creator, ...coHostIds])` on both paths. New `src/core/invite.ts` (install link + message
  + `sendInviteEmail`). No migration (reuses players/tournaments).
- **Files:** `src/data/repos.ts`, `src/core/connect.ts` (`openSms`), `src/core/invite.ts` (new),
  `src/components/CoHostPicker.tsx` (new), `src/screens/CreateTournamentScreen.tsx`,
  `supabase/functions/send-invite/index.ts` (new).
- **Verified (demo):** searched "Rohan" → added Rohan Nair (existing) → invited "Priya Coach" by email
  (pending player created + `· invited` chip + mailto fallback fired) → Created → tournament `host_ids` =
  [Aarav (creator), Rohan Nair, Priya Coach]. 135 tests, typecheck clean.
- **⚠️ For live email:** deploy the edge function — `supabase functions deploy send-invite` (reuses the
  existing `RESEND_API_KEY`; optional `INVITE_FROM`). Until then, email uses the `mailto:` fallback;
  WhatsApp/SMS work immediately. Later: swap WhatsApp/SMS from client-share to server-send if wanted.

### 2026-08-08 — Profile: setup flow, edit-info fields (gender/bio), visible sign-out · SHIPPED + VERIFIED

A freshly signed-up account has a `profiles` row but no `players` row, so the Profile tab was a dead-end
("No player profile found") with no way to create one, edit info, or sign out.

- **Actionable empty state** — the Profile tab now shows **✎ Set up your profile** (creates the account's
  player via `createMyPlayer`, seeded from sign-up name/phone/dob/guardian, then opens the editor) plus
  **Settings** and **Sign out**. The shared `ProfileView` keeps the neutral empty state when viewing
  *someone else* (owner-only actions gated on `onCreateProfile`/`onSignOut`).
- **Visible sign-out** — a **Sign out** button now sits on the Profile tab itself (it previously lived only
  inside Settings), in both the empty and populated states.
- **Edit-info fields** — `EditProfileScreen` gained **Gender** (Male / Female / Other / Prefer not to say)
  and **About you** (multiline bio). Existing fields cover name, location (city), DOB, contact number,
  email, guardian, and per-sport details. `ProfileView` shows gender in the subtitle and the bio in a card.
- **Data:** `Player` gained `gender?`/`bio?`; `repos` maps them (PlayerRow / toPlayer / PLAYER_SELECT /
  PlayerPatch / updatePlayer) + new `createMyPlayer`; **migration 0005** (`players.gender`, `players.bio`).
- **Files:** `src/core/types.ts`, `src/data/repos.ts`, `src/screens/ProfileScreen.tsx`,
  `src/screens/EditProfileScreen.tsx`, `src/components/ProfileView.tsx`,
  `supabase/migrations/20260808120000_player_gender_bio.sql` (new).
- **Verified (demo mode):** Profile shows the Sign-out button; Edit profile has Gender + About you; set
  Male + a bio → Save → profile subtitle shows "· Male ·" and the bio card renders. 135 tests, typecheck
  clean. (The create-from-empty flow is live-only — demo always has a seed player — verified by types/logic.)
- **⚠️ To use live:** run **migration 0005** (`supabase/migrations/20260808120000_player_gender_bio.sql`)
  before the live app reads players (it now selects `gender`/`bio`). Note: `first name / last name` are kept
  as a single **Full name** field (the app is built on `fullName`; splitting would ripple through display,
  initials & search — deferred unless wanted).

### 2026-08-07 — Super Four (multi-phase) + 3rd-place playoff · SHIPPED + VERIFIED

Closed the two litmus gaps. Both real formats — FIFA WC 2026 and an Asia Cup — are now schedulable in-app.

**Super Four / second group phase** (Asia-Cup style: group stage → a second round-robin among the
qualifiers → final):
- Auto-generate → Advance now has a **target** selector (from the group stage): **🏆 To knockout** or
  **🔁 To Super round-robin**. The latter runs `roundRobin(qualifiers)` tagged `stage:'super'` (a single
  league, no group).
- Advance is now phase-aware: once a Super phase exists it advances **from** it (chip reads "🏅 Advance
  Super phase"), forcing a knockout target — so Super Four → Final falls out naturally. `sourceTables`
  drives rule/manual qualifier selection uniformly for either phase.
- The tournament page renders the **Super table** (`🔁 Super Four/Six/Eight`, named by size via
  `superPhaseLabel`). Group tables and the knockout bracket ignore `stage:'super'`; the Super table is its
  own `teamStandings` of the super games. League-style draws are allowed (the knockout tie-break is applied
  only to real knockout drafts now).

**3rd-place playoff:**
- `BracketScreen` offers **🥉 Create 3rd-place playoff** once both semi-finals are decided — pairs the two
  SF losers (`thirdPlacePair`), tagged `stage:'third'` (`THIRD_PLACE_STAGE`), rendered in its own section.
  Not a size-based round, so it's handled outside `KO_STAGES`/progression.
- Engine (`bracket.ts`): `matchLoserId`, `thirdPlacePair`, `THIRD_PLACE_STAGE`. 3 new tests.

- **Files:** `src/data/bracket.ts`, `src/data/groups.ts` (`superPhaseLabel`), `src/screens/
  GenerateFixturesScreen.tsx`, `src/screens/BracketScreen.tsx`, `src/screens/TournamentProfileScreen.tsx`,
  `tests/bracket.test.mts`, `tests/litmus.test.mts` (comment).
- **Verified (demo mode):** Asia Cup (2 groups of 3) → Advance → To Super round-robin → "4 advance → Super
  Four · 6 games"; Super Test (completed super games) → tournament shows the Super Four table → Advance
  Super phase → "2 qualify → final · top 2 of the Super Four" → SP 1 v SP 2. Playoff Test (2 completed
  semis) → bracket → **🥉 Create 3rd-place playoff** → TP 2 v TP 3. 135 tests, typecheck clean.
- **No new migration** — reuses `stage` (`super`/`third` are just tags). Migrations 0002/0003 run live;
  **0004 (byes) still pending** before play-ins go live.

### 2026-08-07 — Litmus validation pass: can we schedule real tournaments as-is? · DONE

Put the tournament engine against the acceptance test — schedule two real international formats end-to-end.
Added `tests/litmus.test.mts` (6 tests, permanent regression guard) driving the *actual* engine at full
scale, plus a demo UI spot-check.

- **FIFA World Cup 2026 (48 teams) — ✅ schedulable.** Engine: `drawGroups(48,12)` → 12 groups of 4 → 72
  group games → `advancement(tables, 2, 8)` = **32** (24 top-2 + 8 best-3rd) → `planKnockout(32)` clean →
  `seedKnockout` → 16 R32 ties → `nextRoundPairs` chain walks **R32 → R16 → QF → SF → Final** to a single
  champion. UI spot-check: seeded 48 teams / 12 groups / 72 completed games → Advance (top 2 + 8 best-placed)
  read "32 qualify → r32" with the 8 wildcards marked → Generate → 16 R32 ties (Nation 1 v Nation 46 …).
- **Asia Cup cricket (6 teams) — ⚠️ partly.** Group stage → top 2 = 4 works. Super Four (a *second
  round-robin* of the 4 → top 2 → final) — the engine can build it (`roundRobin(4)` = 6 games → `teamStandings`
  → top 2 → final), but the app's "advance groups → …" only targets a **knockout**, not a second league
  phase. So Super Four isn't chainable in-app yet.
- **Confirmed remaining gaps (both known):**
  1. **Super Four / second group phase** — "advance groups → a new league phase" (needed for Asia Cup).
  2. **3rd-place playoff** — pair the two SF losers (a real WC fixture).
- **Files:** `tests/litmus.test.mts` (new). 132 tests, typecheck clean. No code/schema change — this is a
  validation pass; the spine (participants → groups → advance rule/manual → play-in → advancing bracket) held.

### 2026-08-07 — Custom-control (c): play-in rounds for odd fields · SHIPPED + VERIFIED

The last custom-control piece: size an odd knockout field to a clean bracket. Real qualifier counts rarely
land on 2/4/8/16 — 12 qualifiers, 6, 5… Now the generator plans it and a **play-in round** trims it.

- **Field planner** (`planKnockout(n)` in `bracket.ts`): when N isn't a power of two, the advance/knockout
  generator warns ("6 teams isn't a clean bracket") and offers a **⚖️ Play-in round** toggle — bottom
  `2·(N−P)` seeds play `N−P` ties, top `2P−N` **bye**, leaving P (largest power of two ≤ N) for the main
  round. The preview names the byes. E.g. 12 → 4 ties + 4 byes → QF; 6 → 2 ties + 2 byes → SF.
- **Byes without phantom matches**: the top-seed ids ride on the play-in matches as a typed `byes: string[]`
  (new nullable `byes uuid[]` column — **migration 0004**). No fake "bye" match records → match lists &
  standings untouched.
- **Bracket advances through the bye**: `nextRoundPairs` merges a play-in round's winners **and** its byes,
  spread by standard seeding (`seedOrder`) so each bye meets a play-in survivor (no bye-vs-bye). The bracket
  shows "⏭️ Byes to the next round: …" and "▶ Create [round]" builds the clean main round.
- **Engine** (`bracket.ts`, pure + tested): `planKnockout`, `seedPlayIn`, bye-aware `nextRoundPairs`. 6 new
  tests. Also: `BracketScreen` now resolves names from the team list (so byes that played no match still
  show their names).
- **Files:** `src/core/types.ts` (`Match.byes`), `src/data/bracket.ts`, `src/data/repos.ts`,
  `src/screens/GenerateFixturesScreen.tsx`, `src/screens/BracketScreen.tsx`,
  `supabase/migrations/20260807130000_match_byes.sql` (new), `tests/bracket.test.mts`.
- **Verified (demo mode):** (1) Gen Knockout (6 teams) → Knockout → "⚖️ Play-in round" → "bottom 4 play 2
  ties; top 2 bye → 4 for the Semi-finals. Byes: Team 1, Team 2" → drafts Team 3 v 6, Team 4 v 5 (QF). (2)
  Play-in Cup with 2 completed play-in ties (byes t1,t2) → bracket showed the QF + "Byes: Team 1, Team 2" →
  **Create Semi-finals** → **Team 1 v Team 4, Team 2 v Team 3** (each bye vs a winner). 126 tests, typecheck
  clean.
- **⚠️ To use live:** run **migration 0004** (`supabase/migrations/20260807130000_match_byes.sql`) before the
  live app reads matches (it now selects the `byes` column). Custom-control path (a→b→c) is complete.

### 2026-08-07 — Custom-control (b): organizer picks who advances · SHIPPED + VERIFIED

Advance-to-knockout was rule-only (top-K + best-placed by points→GD→GF). Real tournaments need an
override — to honour an off-app tie-break, or to hand-fill an awkward field. Advance mode now has a
**⚙️ By standings / ✏️ Pick manually** toggle.

- **Pick manually** shows every team from the group tables, grouped and ranked (`1. Team A1 · 4pt`),
  pre-selected with the rule-based qualifiers so the organizer starts from the natural result and just
  edits it. The running count + qualifier read-back update live; the generated bracket seeds from the
  hand-picked set (winners first, then runners-up, …) and still de-clashes group rematches.
- **Engine** (`src/data/groups.ts`, pure + tested): `qualifiersFromSelection(tables, selectedTeamIds)` —
  builds seed-ordered Qualifiers from an arbitrary pick, using each team's group finishing position.
  2 new tests.
- **Files:** `src/data/groups.ts`, `src/screens/GenerateFixturesScreen.tsx`, `tests/groups.test.mts`.
- **Verified (demo mode):** Groups Cup (3 groups of 3, all group games played) → Advance → Pick manually
  showed the checklist pre-selected with the rule top-2 (6 teams) → dropped Team C2, added Team A3 →
  preview "6 qualify → qf · hand-picked: A1, B1, C1, A2, B2, A3" → bracket **A1 v B2, B1 v A3, C1 v A2**
  (de-clashed, the natural A1-v-A3 swapped). 120 tests, typecheck clean. No new migration.
- **Next (custom-control c):** play-in / preliminary rounds to size an odd field to a clean bracket
  (the 12 → 8-or-16 case).

### 2026-08-07 — Custom-control (a): manual stage tagging + a real, advancing bracket · SHIPPED + VERIFIED

The knockout used to be display-only: auto-generate created *round 1* and the bracket screen
re-seeded a draw from every team in the tournament's matches (so a grouped tournament's bracket wrongly
included all group teams, matched by name). Now the bracket is **stage-driven** and it **progresses**.

- **Manual stage tagging** — "Schedule a match" (tournament matches only) gained a **Stage** picker:
  League / 👥 Group (+ a group-letter field) / Round of 128 → Final. An organizer can now hand-place any
  match — a group game or a specific knockout tie — so it lands in the right round of the bracket.
- **Auto-generate "knockout (round 1)"** now tags its ties with the round's stage (`stageForTeams(N)` →
  r16/qf/…), so a plain knockout is a real staged round too, not an untagged blob.
- **Stage-driven bracket** (`BracketScreen` rewrite) — when the tournament has stage-tagged knockout
  matches it renders the **actual matches** grouped by stage (r32 → … → final) with real scores +
  winners; group-stage matches are excluded (fixes the grouped-tournament bug). No staged matches → it
  falls back to the old computed preview draw (from non-group teams), so simple/legacy tournaments are
  unaffected.
- **Round progression** — when a round is fully decided, an organizer gets **"▶ Create [next round]"**,
  which seeds the next round's ties from the winners in bracket order and schedules them (stage-tagged).
  The bracket then shows the new round; the final's winner surfaces as 🏆 Champion.
- **Engine** (`src/data/bracket.ts`, pure + tested): `KO_STAGES`/`KO_STAGE_LABEL`/`isKoStage`/
  `koStageRank`/`stageForTeams`; `knockoutStageRounds(matches)`, `matchWinnerId`, `nextRoundPairs(round)`
  (null until the round is complete; adjacent-winner pairing), `stageChampionId`. 10 new tests
  (`tests/bracket.test.mts`).
- **Files:** `src/data/bracket.ts`, `src/screens/BracketScreen.tsx` (rewrite), `src/screens/
  ScheduleMatchScreen.tsx`, `src/screens/GenerateFixturesScreen.tsx`, `src/data/hooks.ts` (`useLeagueData`
  gained a refetch nonce), `tests/bracket.test.mts` (new).
- **Verified (demo mode):** seeded a Knockout Cup with 2 completed semi-finals → bracket showed the real
  Semi-finals (Falcons 2–0, Wolves 3–1, winners ticked) + "▶ Create Final (1 tie)" → tapped → **Final:
  Falcons vs Wolves** created & persisted with `stage:'final'`. Schedule screen's Stage picker + group
  field confirmed. 118 tests (108 + 10), typecheck clean.
- **Next (custom-control b, c):** organizer picks who advances (override the rule-based qualifiers), then
  play-in rounds to size an odd field to a clean bracket.

### 2026-08-07 — Tournament participants: register the teams that are in · SHIPPED + VERIFIED

The foundation for real tournament organization. Until now a tournament had **no team list** —
"who's in" was only implied by its matches, so you couldn't state a team count or decide a format
(groups, bracket size) from it. This is the litmus-test groundwork ([[sportfolio-tournament-vision]]):
you can't schedule a FIFA World Cup or an Asia Cup without first registering the participants.

- **New "Participating teams" screen** (`TournamentTeamsScreen.tsx`): reached from a tournament's
  organizer actions ("👥 Participating teams · N"). Multi-sport meets get a sport picker; pick from the
  sport's teams as toggle chips, add a new team inline (name/short/colour), then Save. Shows the live
  count and a one-tap "N teams already playing here aren't registered — add them" backfill for
  tournaments that already have fixtures.
- **Auto-generate fixtures** now **defaults its team picker to the registered participants** — set
  "who's in" once, then generate without re-picking (still fully editable; a `touchedSel` guard stops a
  background refetch from clobbering edits).
- **Data**: a `tournament_teams` join table (migration **0003**,
  `supabase/migrations/20260807120000_tournament_teams.sql`) — additive, RLS (public read / authed
  write), independent of every existing table. Demo mirror: `demo.tournamentTeams` + `addTournamentTeamsDemo`/
  `removeTournamentTeamDemo` (no `DEMO_KEY` bump — `applyDemo` keeps the default for absent keys).
  Repos: `getTournamentTeams` / `addTournamentTeams` (idempotent upsert) / `removeTournamentTeam`; hook
  `useTournamentTeams(tournamentId, sport?, nonce?)`.
- **Files:** `TournamentTeamsScreen.tsx` (new), `src/screens/TournamentProfileScreen.tsx`,
  `src/screens/GenerateFixturesScreen.tsx`, `src/data/repos.ts`, `src/data/hooks.ts`,
  `src/data/demoStore.ts`, `src/navigation/{types,RootNavigator}.tsx`, migration 0003 (new).
- **Verified (demo mode):** Annual Sports Meet → Participating teams → picked 4 (Red/Blue/Green/Gold
  House) → Save → tournament shows "👥 Participating teams · 4" → Auto-generate opens with those 4
  pre-selected. 108 tests, typecheck clean.
- **⚠️ To use live:** run migration 0003 in the Supabase SQL editor before the live app reads
  participants (it now selects from `tournament_teams`, which doesn't exist until the migration runs —
  reads fail-soft to empty, writes fail, until then).
- **Next (custom-control path):** manual knockout reconciliation — organizer picks who advances when
  qualifiers aren't a clean power of 2, play-in rounds to size the field, and manual stage tagging.

### 2026-08-07 — Grouped tournaments, Phase 2b: advance groups → seeded knockout · SHIPPED + VERIFIED

Closed the loop: once the group stage finishes, an organizer turns the final tables into a seeded bracket in one step.

- **Auto-generate fixtures** gained a **🏅 Advance groups → knockout** structure, shown *only* when the tournament
  already has group matches (`hasGroups`). It hides the team picker and instead reads this tournament's finished
  group tables (`groupTables(tourMatches, sport)` via `useLeagueData`).
- **Controls:** *Advance per group* (top-K) + *Best-placed wildcards* (the "5 groups → top 3 + best 4th" case).
  Live preview reads back the field size + seeds, e.g. "2 qualify → final · top 1 from each of 2 groups: Falcons,
  Wolves." A **⚠️ groups-incomplete** note shows the finished/total count but still lets you preview.
- **Generate** runs `advancement(tables, topK, bestPlaced)` → `seedKnockout` (1-v-last with a de-clash pass so no
  group rematch in round one) → drafts stamped with the stage label from `knockoutRoundLabel` (final/sf/qf/r16/r32).
- **Persistence**: `create()` writes `stage` on each tie; football ties inherit the tournament's knockout tie-break
  (extra time / penalties), same as the flat knockout path. The existing 🏆 bracket then auto-advances qf→sf→final.
- **Files:** `src/screens/GenerateFixturesScreen.tsx` (also: name lookup now merges the pickable team list with the
  team ids embedded in the tournament's matches, so advance-bracket cards resolve names).
- **Verified live (demo mode):** seeded a 2-group cup (Falcons/Sharks, Wolves/Bears) with finished group matches →
  Advance mode appeared → top-2 gave "4 qualify → sf" with a correctly de-clashed bracket (Falcons v Bears, Wolves
  v Sharks — no group rematch); top-1 gave "Falcons v Wolves — Final". Created → matches persisted with resolved
  teams + `stage:'final'`. 108 tests, typecheck clean.
- **Live-ready:** migration 0002 has been run in Supabase, so the `group_label`/`stage` columns exist; the app now
  boots to live (AuthScreen) with no schema/console errors. Grouped tournaments are fully usable end-to-end.

### 2026-08-01 — Grouped tournaments, Phase 2a: generate groups + per-group tables · SHIPPED + VERIFIED

Wired the Phase 1 engine into the app: an organizer can now generate a group stage and see per-group tables.

- **Auto-generate fixtures** gained a **👥 Group stage** structure: pick teams + number of groups → a live split
  preview ("8 teams → 2 groups (A–B) of 4, 4") → generates a round-robin *within* each group, every match tagged
  with its group (`group` + `stage:'group'`).
- **Tournament screen** renders a **table per group** (GROUP A, GROUP B…) via `groupTables` when the tournament
  has grouped matches, instead of one flat league table.
- **Persistence**: `NewMatch`/`createMatch` carry `group`/`stage` on both paths — demo (in-memory) and Supabase
  (new `group_label`/`stage` columns; `group` is a SQL keyword so the DB column is `group_label`, mapped to the
  app's `match.group`). Migration **0002** (`supabase/migrations/20260806120000_grouped_tournaments.sql`) adds the
  two nullable columns + a `(tournament_id, stage)` index. Additive & idempotent — flat league/knockout/friendly
  matches are unaffected.
- **Files:** `src/data/repos.ts`, `src/screens/GenerateFixturesScreen.tsx`, `src/screens/
  TournamentProfileScreen.tsx`, `supabase/migrations/20260806120000_grouped_tournaments.sql` (new).
- **Verified live (demo mode):** Karnataka State Cup → Auto-generate → Group stage, 8 teams, 2 groups → 12 matches
  labelled "Group A/B · Round N" (within-group only) → Create → tournament shows GROUP A + GROUP B tables. 108
  tests, typecheck clean.
- **⚠️ To use live:** run migration 0002 in the Supabase SQL editor **before** the live app reads matches (the app
  now selects `group_label`/`stage`, which don't exist until the migration runs).
- **Next (Phase 2b):** the "Advance to knockout" action — compute `advancement` from finished group tables →
  create the seeded bracket (stage r16/qf/…) → the existing 🏆 bracket auto-advances to the final.

### 2026-08-01 — Grouped tournaments, Phase 1: the advancement engine · SHIPPED + TESTED

Prioritised for the pilot (running real grouped tournaments): the pure logic to turn "N teams → G groups →
top-K advance → knockout" into fixtures + a seeded bracket. Phase 1 is the engine only — pure, fully unit-tested,
no schema/UI risk. (Phase 2 wires the UI + persistence + a migration.)

- **What's built:**
  - `fixtures.ts` — `drawGroups(teamIds, numGroups)` (even round-robin dealing: 20/4→5·5, 25/5→5·5, 22/4→6,6,5,5;
    labels A,B,C…) and `groupStage(...)` (a round-robin *within* each group, every pairing tagged with its group).
  - `groups.ts` (new) — `groupTables(matches, sport)` (per-group league tables), `advancement(tables, topPerGroup,
    bestPlacedSlots)` (direct top-K **plus** the best (K+1)-placed wildcards across groups, ranked points→GD→GF —
    the classic "5 groups → top 3 + best 4th = Round of 16"), `seedKnockout(qualified)` (1-v-last seeding **with a
    de-clash pass** so a group-stage rematch can't happen in round one → recovers the A1-vB2/B1-vA2 cross bracket),
    and `knockoutRoundLabel(n)`.
  - `Match` gained optional `group` / `stage` fields (the model foundation; demo-first, Supabase migration in P2).
- **Files:** `src/core/types.ts`, `src/data/fixtures.ts`, `src/data/groups.ts` (new), `tests/groups.test.mts` (new).
- **Tested:** 12 new cases (draw evenness, within-group-only fixtures, per-group ranking, top-2→8, top-1+best-1,
  5-groups→16, seeded no-rematch bracket, odd-count bye, round labels). 108 tests total, typecheck clean.
- **Next (Phase 2):** "Group stage" option in Auto-generate fixtures (pick teams + #groups + top-K), per-group
  tables on the tournament screen, an "Advance to knockout" action, repos writes for `group`/`stage`, migration 0002.

### 2026-08-01 — DOB calendar: fits the screen + month/year pick-lists · FIX + VERIFIED

Found during the live sign-up (staging cutover): the DOB date picker (`DateField` in `DateTimeField.tsx`) was
**unusable on a tablet/wide viewport** — the modal `sheet` had no width cap, so the backdrop stretched it nearly
full-width and the `flex:1 aspectRatio:1` day cells ballooned; the 6-row grid grew taller than the screen, so the
vertically-centred sheet pushed its **header (month/year + nav arrows) off the top** — no way to change month or
year. And even when visible, month-only stepping made a birth year (years back) impractical.

- **Change:**
  1. **Fits any screen** — cap the sheet (`maxWidth: 340`, `width: 100%`, `alignSelf: center`; backdrop
     `alignItems: center`) so it stays compact & centred with the header and Done always visible.
  2. **Arrows** — header is `« ‹ Month YYYY › »`: `«`/`»` step the year (new `stepYear`), `‹`/`›` step the month.
  3. **Pick-lists** (the real fix for a distant DOB) — the **month** and **year** in the header are now tappable
     (`pick` state `day|month|year`): month opens a 3×4 grid (Jan–Dec); year opens a **scrollable** grid
     (`now+5 … 1900`, newest first) — so a 2000-born taps *Year → scroll → 2000* instead of 26 arrow presses.
- **Files:** `src/components/DateTimeField.tsx`. Generic `DateField`, so match-date pickers benefit too.
- **Verified live (staging AuthScreen, 1280-wide):** picker opens compact & centred; tapped **Year** → scrolled →
  **2000** → returned to the Aug 2000 day grid; tapped **Month** → 3×4 grid with **Aug** highlighted. 96 tests,
  typecheck clean. (Inspected the picker only — no account created.)

---

### 2026-08-01 — Voice scoring: hands-free confirm/undo lane (auto-scoring foundation) · SHIPPED + VERIFIED

Groundwork for the "referee narrates → scorecard updates" vision. The recognizer already did **continuous,
hands-free** listening (`speech.ts` — `continuous: true`, auto-restart on `onend`, web + native adapter); the gap
was entirely in the consumer (`VoiceScorer`), which **applied every recognized phrase immediately** and discarded
the confidence signal — so a single mishear silently changed the scoreline. Rebuilt the panel around a
**confirm/undo lane** so any input source (typed, voice, or a future ML model) is safe.

- **Change:**
  - `speech.ts` now passes the recognizer **confidence** through `onResult(text, confidence?)` (web reads
    `result.confidence`; native/unknown ⇒ trusted). Backward-compatible — existing 1-arg callers unaffected
    (football's inline voice call-site adapted).
  - `VoiceScorer` rebuilt: a **Confirm ↔ Auto** toggle (default **Confirm**). Confirm mode proposes every call
    ("Call 'four' → 4 runs — RED" with ✓ Apply / ✕) — nothing hits the score until you tap. Auto mode applies
    **confident** calls immediately; low-confidence calls still fall back to confirm. A live **Recent calls** feed
    (last 6, with ✅/↩︎/🤔) plus a **↩ Undo last** wired to the screen's rewind (`onUndo` threaded from
    `LiveScoringScreen`). The parser/attribution work is unchanged — this is the safety + hands-free layer on top.
- **Files:** `src/core/speech.ts` (confidence), `src/sports/VoiceScorer.tsx` (rebuild), `src/screens/
  LiveScoringScreen.tsx` (pass `onUndo`), `src/sports/football/index.tsx` (call-site adapt).
- **Verified live (demo):** m9 cricket → Confirm mode: typed "four" → proposal shown, score stayed 0/0 → Apply →
  4/0 + feed "✅ 4 runs — RED". Flipped **Auto ON** → "six" applied directly → 10/0. **Undo last** → reverted to
  4/0. Demo mutated then localStorage cleared to restore the seed. 96 tests, typecheck clean.
- **Still ahead for full auto-scoring** (north-star, post-pilot): always-on capture device (mic/earpiece; Meta
  glasses lack an open live-audio SDK today), a cloud STT for stadium-noise accuracy, and — the moonshot —
  video-based event detection. The event-sourced architecture means each just emits the same `ScoreAction`.

---

### 2026-08-01 — Surgical timeline editor ported to the rally sports (volleyball · tennis · badminton) · SHIPPED + VERIFIED

The last open item from the cross-sport backlog: football/basketball/kabaddi had the full **🗓 Correct the
timeline** editor (remove / edit-in-place / backfill a missed moment), but the rally / running-point sports were
on step-by-step **Undo** only. Once the per-period sweep gave volleyball/tennis/badminton **player-attributed box
scores**, a mis-scored or mis-attributed rally 15 points ago could only be fixed by undoing 15 points — so those
three got the full editor.

- **Why rally sports needed a different mechanism:** football/basketball/kabaddi score is an order-independent
  sum, so a correction can be one compensating `REMOVE_EVENT`. A rally sport's score is **path-dependent** —
  removing/inserting one mid-match point shifts every downstream game/set boundary. So corrections here **replay**
  the corrected point list through the sport's own (tested) pure reducer, which recomputes running score, games/
  sets and box-score fields from scratch and can't drift. This is the same fold `useLiveMatch.rebuildFromLog`
  already uses to derive state from the event log — so an edit is just that fold from a cleared state.
- **How:** new shared `src/sports/rallyEdit.ts` — `pointInputs(events)` reconstructs the exact scoring sequence
  from the point log (valid because each point event's `side` IS who won the rally in these sports), `replayPoints()`
  folds it through the reducer, `reconcileStatActions()` emits +/- `STAT_ADJUST` deltas so **player-profile**
  tallies add up. New shared UI `src/sports/RallyPointEditor.tsx` (remove / edit / insert-at-position). Each plugin
  reducer got two cases: `EDIT_LOG` (replay a corrected list onto a `clearMatch(s)` that keeps the format) and a
  no-op `STAT_ADJUST` (the live layer records its stat line; the reducer ignores it, so replay never double-counts).
- **Event-sourced & durable:** `EDIT_LOG`/`STAT_ADJUST` are appended to the match log like any event, so corrections
  broadcast to viewers and survive reload — verified below.
- **Files:** `src/sports/rallyEdit.ts` (new), `src/sports/RallyPointEditor.tsx` (new), `src/sports/volleyball/index.tsx`,
  `src/sports/tennis/index.tsx`, `src/sports/badminton/index.tsx`, `tests/rally-edit.test.mts` (new, 10 tests).
- **Verified:** `npm run typecheck` clean; `node --test tests/*.test.mts` → **96/96** (+10 new covering replay
  re-derivation of score/sets on remove/insert/edit, match completion via replay, and profile reconciliation deltas).
  Live (demo, no console errors): **volleyball** m10 — removed a Set-2 point (BLU 21→20), edited a point's winner
  (BLU→RED, 19-20→20-19, re-attributed to Kiran Rao), inserted a missed point (BLU→20); **reloaded** and the match
  replayed the edits exactly (Set 2 RED 20–20), proving `EDIT_LOG` persists through `rebuildFromLog`. **Tennis** —
  scored 3 points (RED 40-0) then removed one → 30-0 (0/15/30/40 game-point replay correct). **Badminton** — scored
  2 (RED 2) then removed one → 1 (no Ace controls, as configured). Cricket keeps ball-by-ball undo; the other net/
  serve sports (squash/pickleball/padel) stay on undo. **Cross-sport backlog now complete.**

---

### 2026-08-01 — Top scoreboard: stop showing the "LIVE" dot on matches that haven't started · SHIPPED + VERIFIED

The top scoreboard node in `LiveScoringScreen` was passed `live={!complete}`. For an **upcoming / scheduled**
match (not started, not complete) `!complete` is `true`, so the top board lit up its red "live" dot / LIVE
treatment even though play hadn't begun — contradicting the match header, which correctly read **UPCOMING**.

- **Change:** pass `live={matchLive}` instead of `live={!complete}` to the `scoreboardNode`, on **both** branches
  (the `plugin.Scoreboard` custom board and the generic `<Scoreboard>`). `matchLive` already existed in the
  component: `const matchLive = !complete && (meta.status === 'live' || started)`. Affects the top board for every sport.
- **Files:** `src/screens/LiveScoringScreen.tsx` (scoreboardNode, ~L462–468).
- **Verified:** `npm run typecheck` clean; `node --test tests/*.test.mts` → 86/86 pass. In the running web app
  (demo): upcoming **Tennis** (custom board) and the match header both read UPCOMING with **no** live dot; live
  **Basketball** (custom board) and live **Football** (generic board) still show the red ● LIVE dot on the Info-tab
  top board. Both the `LineScoreboard` and generic `Scoreboard` `live` paths confirmed.

---

### 2026-08-01 — Cricket end-innings / end-match: confirm step with context · SHIPPED + VERIFIED

"End innings →" and "End match" dispatched immediately on tap — a big button at the bottom of the pad, easy to
mis-hit, ending an innings (or the whole match) with no confirmation and no context. Added a confirm step that
also states the key facts.

- **Change:** tapping End now arms an inline confirm (Cancel + the action) instead of firing. Innings 1 reads
  "End {batting}'s innings at {runs}/{wkts} ({overs} ov)? {bowling} will chase {runs+1}." (previewing the resulting
  target); the chase reads "End the match with {batting} on {runs}/{wkts}, chasing {target}?". The primary End
  button is now `ghost` for the innings break and `danger` for ending the match (matching severity). New
  `confirmEnd` state resets on either choice.
- **Files:** `src/sports/cricket/index.tsx` (`confirmEnd` state; end-innings/end-match confirm block; `confirmBox`
  / `confirmText` styles).
- **Verified live (demo):** m9 after setup → "End innings →" armed "End RED's innings at 0/0 (0.0 ov)? BLU will
  chase 1."; confirmed → innings 2; "End match" armed "End the match with BLU on 0/0, chasing 1?" (Cancel + red
  End match). Demo mutated then localStorage cleared to restore the seed. 96 tests, typecheck clean.

### 2026-08-01 — Cricket free hit: explained callout + honest WICKET button · SHIPPED + VERIFIED

After a no-ball the next delivery is a free hit (the batter can't be dismissed except run out), but the UI only
showed a bare "🟢 FREE HIT" text line — no explanation of the rule (unlike the POWERPLAY note right above it,
which spells its restriction out) — and the WICKET button still read "WICKET" even though it routed straight to
the run-out flow. Made the free-hit state clear.

- **Change:** the free-hit indicator is now a green-tinted bordered **callout** matching the powerplay/rain/
  over-complete cue language: "🟢 FREE HIT — {striker} can't be out (run out only)". The WICKET button relabels
  to **"RUN OUT"** while a free hit is live (it already forced `kind: 'runout'`), so the button is honest about
  what it does.
- **Files:** `src/sports/cricket/index.tsx` (free-hit note → callout; WICKET button label; `freeHitBox` /
  `freeHitText` styles).
- **Verified live (demo):** m9 after setup → bowled a No ball → the callout read "🟢 FREE HIT — Rohan Nair can't
  be out (run out only)" and the wicket button changed to "RUN OUT". Demo mutated then localStorage cleared to
  restore the seed. 96 tests, typecheck clean.

### 2026-08-01 — Cricket over-complete flow: clear over cue + over number · SHIPPED + VERIFIED

When an over finishes the reducer clears `bowlerId`, and the pad just relabelled to "New over — pick bowler" —
no over number, no clear "an over just ended" moment, and the disabled last-over bowler chip didn't say why it
was disabled. Made the over boundary a proper beat.

- **Change:** the bowler prompt now names the over ("**Over N of M — pick {team} bowler**"; the "of M" is hidden
  for timeless/Test). When an over has just completed (`!bowlerId` with a whole number of overs bowled) an amber
  **"✓ Over N complete — new bowler needed"** cue appears above it. The disabled last-over bowler's chip now reads
  "**{name} · last over**" so it's obvious why it can't be picked.
- **Files:** `src/sports/cricket/index.tsx` (derived `oversDone`/`nextOverNo`/`oversLabel`/`overJustDone`; bowler
  section header + cue + chip label; `overDone` / `overDoneText` styles).
- **Verified live (demo):** m9 after setup → opening prompt read "Over 1 of 10 — pick BLU bowler"; bowled 6 dots →
  "✓ Over 1 complete — new bowler needed" + "Over 2 of 10 — pick BLU bowler", the last bowler shown as "Ishaan
  Verma · last over" (disabled). Also confirmed strike rotates correctly at over-end. Demo mutated then localStorage
  cleared to restore the seed. 96 tests, typecheck clean.

### 2026-08-01 — Cricket voice scoring: credit the striker/bowler (stat parity) · FIX + VERIFIED

`cricketVoice` built its RUNS and WICKET actions **without `attribution`**, so voice-scored deliveries didn't
credit any player — voice-scored runs/wickets skipped the player stat lines that the tap flow records (its
`runs()` / `finishWicket()` pass attribution), and the shared `VoiceScorer` feedback couldn't name anyone
("✅ runs — Red House", no batter). A parity gap between voice and tap.

- **Change:** voice RUNS now carries `{playerId: strikerId, stat:'runs', by:r, playerName:strikerName}` and voice
  WICKET carries `{playerId: bowlerId, stat:'wickets', by:1, playerName:bowlerName}` **for bowler dismissals only**
  — run-outs (and extras: wide/bye/leg-bye/no-ball) stay unattributed, exactly matching the tap flow. So voice
  scoring now feeds player stats and the feedback line names the batter/bowler.
- **Files:** `src/sports/voiceParsers.ts` (`cricketVoice` RUNS + WICKET returns).
- **Verified (demo):** via the `__sportfolioVoice.cricketVoice` inspection hook — "four" → RUNS + striker
  attribution (by 4), "two runs" → RUNS (by 2), "bowled"/"caught" → WICKET + bowler attribution (by 1), "run out"
  → WICKET with **no** attribution, "wide" → EXTRA with **no** attribution. Pure-function check, no demo mutation.
  96 tests, typecheck clean.

### 2026-08-01 — Cricket rain/DLS box: validation + live target preview · SHIPPED + VERIFIED

The rain box (☔ reduce overs, shown when `state.dls`) had two gaps: **Apply silently no-op'd** on out-of-range
input (the reducer rejects overs ≤ bowled or ≥ current limit, and the button just did `if (n) dispatch` — so a bad
value did nothing with no explanation), and it gave **no preview** of the DLS effect the scorer is about to apply
— which for a rain rule is the whole point.

- **Change:** the input is now validated against the reducer's own bounds; **Apply is disabled** unless the value
  is a whole number in `(oversBowled, oversLimit)`. On invalid input a red hint spells out the range ("Enter a
  whole number between N and M"); on valid input a green preview shows the effect — innings 1 "Innings capped at N
  overs", the chase "New target X — need Y off the last N overs" — computed with the **same `resourcePct` /
  `revisedTarget` dls helpers the reducer uses** (single source of truth). The placeholder now shows the valid
  range too.
- **Also:** enabled `dls: true` on the demo IPL-style fixture **m9** (a limited-overs staple, and it makes rain
  demoable — no seeded match had DLS before).
- **Files:** `src/sports/cricket/index.tsx` (`import { resourcePct, revisedTarget } from './dls'`; hoisted
  `rainN`/`rainOversDone`/`rainValid`/`rainPreview`; rain-box JSX; `rainErr` / `rainPreview` styles);
  `src/core/mockData.ts` (m9 format `dls: true`).
- **Verified live (demo):** m9 after setup → typed 12 (over limit) → red "Enter a whole number between 1 and 9",
  Apply disabled; typed 5 → green "Innings capped at 5 overs", Apply enabled; ended innings 1 → innings-2 rain box
  showed "New target 1 — need 1 off the last 5 overs". Demo mutated then localStorage cleared to restore the seed.
  96 tests, typecheck clean.

### 2026-08-01 — Cricket Super Over / tie decision: broadcast tie board · SHIPPED + VERIFIED

The tie-break decision panel (`SuperOverDecision`, shown when a regulation match finishes level) rendered the
level scores as a plain concatenated muted string ("Red House 118/6 · Blue House 118/6") — underwhelming for what
is the most dramatic moment of a match. Gave it the broadcast result-board treatment the live/final banners use.

- **Change:** the scores now render as a two-column board — each side's `runs/wkts` **in the team colour, score
  over name** — with a centred amber **TIED** tag between them (mirrors the `MatchSummary`/final-banner
  `side`/`score`/`name` structure). `SuperOverDecision` now takes `homeColor`/`awayColor` (passed from
  `ScoringControls`, which already has them). The Super Over history, the "bat first · 1 over · 2 wickets" hint,
  and the Start-Super-Over / accept-the-tie actions are unchanged.
- **Files:** `src/sports/cricket/index.tsx` (`SuperOverDecision` props + tie board; call site; `tieBoard` /
  `tieSide` / `tieScore` / `tieName` / `tieTag` / `tieTagText` styles).
- **Verified live (demo):** engineered a real tie on m9 — ended innings 1 at 0, then bowled BLU all out for 0
  (7 wickets) — reaching the panel: "🔥 Scores level — it's a tie!" with **RED 0/0** (red) · **TIED** · **BLU 0/7**
  (blue). Also re-confirmed the wicket read-back on every dismissal + the all-out confirm path. Demo heavily
  mutated then localStorage cleared to restore the seed (dev server crashed on rebuild mid-run; restarted via the
  launch config, seed reloaded clean). 96 tests, typecheck clean.

### 2026-08-01 — Cricket Impact Player flow: substitution read-back · SHIPPED + VERIFIED

The Impact Player wizard (who makes way → who comes in) carried the "who's leaving" info only inside the second
step's prompt text — no persistent cue, unlike the wicket flow and setup panel which now show progress. Gave it a
matching recap strip.

- **Change:** once the outgoing player is chosen, an **accent-amber** recap strip (matching the ⚡ Impact Player
  theme, and mirroring the wicket flow's danger-red read-back) shows "⚡ {player} makes way". The second-step
  prompt is simplified to "Choose the Impact Player coming in" since the recap now carries the name (was "Impact
  Player coming in for {name}").
- **Files:** `src/sports/cricket/index.tsx` (`ScoringControls` `impact` branch; `impactRecap` / `impactRecapText`
  styles).
- **Verified live (demo):** started m9, full setup, ⚡ Bring in Impact Player — RED → "Who makes way?"; picked
  Vikram Rao → amber recap "⚡ Vikram Rao makes way" + "Choose the Impact Player coming in". Demo mutated to reach
  the flow, then localStorage cleared to restore the seed. 96 tests, typecheck clean.

### 2026-08-01 — Cricket wicket flow: live dismissal read-back · SHIPPED + VERIFIED

The wicket wizard (dismissal → runs → fielder → batter → next batsman) showed only the current step's prompt —
the scorer never saw the **dismissal building up**, so they confirmed a wicket without a read-back of what they'd
actually entered. Added a running recap strip that composes the dismissal in real scorecard notation as each step
is answered.

- **Change:** exported `composeDismissal` from the engine (the same helper that writes the scorecard's "c Veer b
  Ishaan" text) and reused it in `ScoringControls`' wicket panel. A danger-tinted recap strip now shows the
  dismissal forming — e.g. "Rohan Nair caught" → "Rohan Nair c Sanjay Menon b Ishaan Verma" — including the run-out
  runs tail ("· N runs") and the chosen out-batter, so the wicket reads back before the confirming tap.
- **Files:** `src/sports/cricket/engine.ts` (export `composeDismissal`); `src/sports/cricket/index.tsx` (import
  it; build `wktRecap` in the `wf` branch; `wktRecap` / `wktRecapText` styles).
- **Verified live (demo):** started m9, full setup, WICKET → CAUGHT → recap "Rohan Nair caught"; picked fielder →
  "Rohan Nair c Sanjay Menon b Ishaan Verma", flow advanced to "Next batsman in". Demo mutated to reach the flow,
  then localStorage cleared to restore the seed. 96 tests, typecheck clean.

### 2026-08-01 — Cricket setup panel: per-side readiness tags · SHIPPED + VERIFIED

The pre-match `SetupPanel` (tap players to assign captain/keeper) told the scorer "both are needed per side to
begin" but gave **no per-side progress cue** — nothing showed whether a side was done or what it still needed, so
the scorer had to eyeball the (c)/† chips. Added a status tag per team, in the app's status-tag language.

- **Change:** each side's header now carries a tag — amber **"Need captain & keeper"** → **"Need keeper"** (or
  "Need captain") as roles fill in, flipping to a green **"✓ Ready"** once both are set. Reactive: it recomputes
  from `state.captains`/`state.keepers` on every assignment.
- **Files:** `src/sports/cricket/index.tsx` (`SetupPanel` `side()` — header row + readiness tag; new `setupHead`
  / `readyTag` / `readyTagText` / `needTag` / `needTagText` styles).
- **Verified live (demo):** started m9 → both sides "Need captain & keeper"; set RED captain → "Need keeper"; set
  RED keeper → "✓ READY" (green) while BLU stayed amber. Demo mutated to reach setup, then localStorage cleared to
  restore the seed. 96 tests, typecheck clean.

### 2026-08-01 — Cricket scoring controls: run pad in the batting side's colour · FIX + VERIFIED

The cricket scorer's run buttons (0/1/2/3) were hardcoded `variant="home"`, which is a **fixed blue**
(`#4DA3FF`) regardless of who's batting — semantically meaningless (it reads as "home") and unrelated to the
batting side. `ScoringControls` already receives `homeColor`/`awayColor` (the screen passes them; the prop's
own doc says "so the scorer's controls match the teams") but cricket never used them.

- **Change:** the run-number buttons now render in the **batting side's kit colour** (`battingColor`), so the pad
  visually belongs to whoever's batting; boundaries (4/6) stay primary green. Applied consistently to all three
  run-value groups — the main 0–6 row, the bye/leg-bye values, and the no-ball off-the-bat runs.
- **Files:** `src/sports/cricket/index.tsx` (`ScoringControls` — destructure `homeColor`/`awayColor`, derive
  `battingColor`, swap `variant="home"` → `color={battingColor}` on the three run-value rows).
- **Verified live (demo):** started m9, completed setup to reach the pad → 0/1/2/3 render `rgb(255,92,92)` (Red
  House, the batting side) and 4/6 `rgb(61,220,151)` (green), where they were previously blue. Demo mutated to
  reach the pad, then localStorage cleared to restore the seed. 96 tests, typecheck clean.

### 2026-08-01 — Cricket Info tab: clearer, complete format line · FIX + VERIFIED

Reviewing the cricket Info tab: every surface (header, scorer, hosts, matchday squads, date/venue rows) is a
shared component already polished in the tab-by-tab sweep — the one cricket-specific piece is the **Format** row,
built by `formatLine`. It had three issues: it printed **"1 subs"** (bad grammar), showed the powerplay as the
cryptic **"PP 3"**, and never surfaced **balls-per-over**, so a non-standard over length (box cricket / The
Hundred, both supported by the engine's `ballsPerOver` config) was invisible.

- **Change:** substitutes now pluralise correctly (`1 sub` / `2 subs`) — a fix that benefits every sport; the
  cricket branch renders `${n}-over powerplay` instead of `PP ${n}`, and adds `${n} balls/over` whenever the
  format uses a non-6-ball over.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`formatLine`).
- **Verified live (demo):** m9 (IPL-style fixture I score) Info → Format reads **"10 overs · 8-a-side · 1 sub ·
  Impact Player · 3-over powerplay"** (balls/over correctly hidden at the standard 6). View-only. 86 tests, clean.

### 2026-08-01 — Cricket final result banner: broadcast result board · SHIPPED + VERIFIED

The **post-match** cricket result was a bare one-liner — `🏆 {resultLine}` — which showed only the margin
("Won by 14 runs") with **no winning team named and no scores**. (The live in-progress banner had just been given
a proper broadcast layout; the final view hadn't.) Replaced it with a result board matching the live banner's
container + the generic `MatchSummary` result treatment.

- **Change:** a **FINAL** tag, then both innings stacked (team name + `runs/wkts` + overs in the team colour), the
  **winner's row emphasised and the loser's dimmed** (0.45), a 🏆 on the winning row, and a green winner line that
  **names the side** — "RED won by 14 runs" (or "Match tied" when undecided). Winner side is derived locally
  (Super Over → chase-succeeded → margin), since `resultLine` only carries the margin phrase.
- **Files:** `src/sports/cricket/index.tsx` (`CricketSummary` post-match branch; `FinalSide` sub-component;
  `finalTag` / `finalScoreCol` / `finalSide` / `finalLost` / `finalTeam` / `finalScore` / `finalOvers` /
  `finalCrown` / `finalWinner` / `drawn` styles).
- **Verified live (demo):** completed cricket RED 118/5 vs GLD 104/6 → FINAL board with RED emphasised + 🏆, GLD
  dimmed, "RED won by 14 runs". View-only (opened an already-finished match). 86 tests, typecheck clean.

### 2026-08-01 — Cricket live result banner: structured broadcast layout · SHIPPED + VERIFIED

The live (in-progress) result banner at the top of the cricket Summary crammed everything into one run-on line —
"Innings 2 · BLU 72/3 (6.3) · RR 11.08 · chasing 119 · need 47 off 21 · RRR 13.43" — which wrapped to two lines
and was hard to scan. Restructured it into a proper broadcast banner.

- **Change:** a header row (**● LIVE · INNINGS N**), then the batting side's **score shown prominently in the team
  colour** (team name + big `runs/wkts` + overs), a muted **Run rate** sub-line, and — in a second-innings chase —
  a green-tinted **chase strip** that isolates the equation (**Need X off Y** bold, **Target · RRR** muted). The
  "scores level" tie state keeps its single-line treatment.
- **Files:** `src/sports/cricket/index.tsx` (`CricketSummary` live branch; new `liveHead` / `liveInnings` /
  `liveScoreRow` / `liveTeam` / `liveScore` / `liveOvers` / `liveRR` / `chaseStrip` / `chaseNeed` / `chaseMeta`
  styles; dropped the `chaseTail` string builder).
- **Verified live (demo):** cricket chase Summary → "● LIVE · INNINGS 2", "BLU 72/3 (6.3 ov)" in blue, "Run rate
  11.08", chase pill "Need 47 off 21 / Target 119 · RRR 13.43". View-only. 86 tests, typecheck clean.

### 2026-08-01 — Cricket top performers: player avatar + award badge · SHIPPED + VERIFIED

The cricket "Standouts so far" / post-match award cards (`CricketSummary`'s `Award` — Top performer, Top bat,
Top bowl) still led with a bare 24px emoji, the last award surface on the old language. Matched them to the
generic `MatchSummary` award pattern (avatar-first with the icon as a corner badge).

- **Change:** each award now leads with a **team-colour initials avatar** (`#06120D` text) and carries its icon
  (🔥/🏏/🎯 live, 🏅/🏏/🎯 post-match) as a small **corner badge**, instead of a standalone emoji. Label, name,
  detail line and the ★rating column are unchanged.
- **Files:** `src/sports/cricket/index.tsx` (`Award` component; `awardAvatar` / `awardAvatarText` / `awardBadge`
  styles replacing `awardIcon`).
- **Verified live (demo):** cricket chase Summary → Top performer & Top bat show NK (red) avatars, Top bowl shows
  KB (blue), each with its corner badge; consistent with the ratings avatars below. View-only. 86 tests, clean.

### 2026-08-01 — Cricket player ratings: initials avatars + stat detail line · SHIPPED + VERIFIED

The cricket-specific ratings list (`CricketSummary.ratingsBlock`, shared by the live "so far" and post-match
views) was the last ratings surface still on the **old** visual language — a plain 10px team-colour `dot` and a
thin rating **bar** under each name. Brought it in line with the generic `MatchSummary` rows.

- **Change:** each row now leads with a **team-colour initials avatar** (`#06120D` text, matching the app's
  avatar convention) instead of the dot, and the redundant rating bar (it duplicated the stars + number) is
  replaced with a **stat detail line** — the player's batting and/or bowling figures via the existing `mvpDetail`
  (e.g. all-rounder Deepak Shetty reads "13 (7) · 1-6 (1.0)", a pure bowler "2-27 (2.0)"). Rank medals, podium
  tints and the stars/number column are unchanged.
- **Files:** `src/sports/cricket/index.tsx` (`ratingsBlock` row; new `nameInitials` helper; `rateAvatar` /
  `rateAvatarText` / `rateDetail` styles; removed now-unused `dot` / `barTrack` / `barFill`).
- **Verified live (demo):** cricket chase Summary → ratings rows show NK/KB/DS/SM/IS/SP avatars in team colours
  with stat lines; Deepak Shetty (all-rounder) shows both disciplines. View-only. 86 tests, typecheck clean.

### 2026-08-01 — Cricket "This over" dots: contrast fix + dot-ball glyph + over-runs total · FIX + VERIFIED

The over strip's ball dots had a **dark-on-dark contrast bug**: neutral run balls (0–3) used a dark `surfaceAlt`
fill with near-black `#06120D` text, so those digits were barely legible (only the coloured 4/6/W/extra dots read
clearly). Fixed and enriched the strip.

- **Change:** neutral dots now use light text (`theme.colors.text`) + a subtle border so 0–3 read clearly, while
  boundary/wicket/extra dots keep the bright-fill + dark-text convention. A dot ball (`0`) renders as a `·` glyph
  (cricket convention). Added a running **"N runs"** total after the dots (decoded from the ball symbols via a new
  `ballRuns` helper — handles `4`/`6`, `2+W`, `wd`, `2nb`, `lb2`, etc.). Also folded byes-with-runs (`2nb`) into
  the extras colour, which the old check missed.
- **Files:** `src/sports/cricket/index.tsx` (`LiveExtras` over strip, `ballRuns` helper, `ballDotNeutral` /
  `ballSymNeutral` / `overRuns` styles).
- **Verified live (demo):** cricket chase, current over `2 · 4 · 3` → neutral 2/3 render light on bordered dots
  (computed color `rgb(245,247,250)`), the 4 is dark-on-green, and the strip totals **"9 runs"**. View-only.
  86 tests, typecheck clean.

### 2026-08-01 — Cricket scorecard: highlight the batters at the crease + current bowler · SHIPPED + VERIFIED

The batting card only flagged not-out batters with a trailing `*` — nothing showed **who is actually on strike**
right now, and the bowling card gave no cue for **who is currently bowling**. Added a broadcast-style live cue to
the `InningsCard` (only on the side that is currently batting, and only while the match is live).

- **Change:** the two at-crease batters (`strikerId` / `nonStrikerId`) get a subtle primary-tinted row, a bold
  green name and a green runs figure; the striker also gets a 🏏 marker. In the bowling table the current bowler
  (`bowlerId`) gets the same tinted row + 🎯 marker + green wicket count. A completed innings (not the batting
  side) shows no highlight, so a full-time scorecard stays neutral. Bowlers switched from `Object.values` to
  `Object.entries` so the row can match `bowlerId`.
- **Files:** `src/sports/cricket/index.tsx` (`InningsCard` batting/bowling rows + `atCrease` guard; new
  `trowLive` / `bNameLive` / `cNumLive` styles).
- **Verified live (demo):** cricket Red v Blue chase → BLU (batting) card shows **Sanjay Menon 🏏** (striker) and
  **Imran Sheikh** (non-striker) tinted green, dismissed batters plain; bowling shows **Suresh Pillai 🎯**
  highlighted; the completed RED innings shows no highlight. View-only (no demo mutation). 86 tests, typecheck clean.

### 2026-08-01 — Summary ratings note: context-aware, always shown · SHIPPED + VERIFIED

The note under the ratings header only appeared for **live** matches ("Updates live — final ratings lock…"); a
completed match had no note explaining how the 1–5 ratings are derived. Made it context-aware and shown whenever
there are ratings.

- **Change:** live → "⏱ Updates live — final ratings lock when the match ends."; completed → "★ Rated 1–5 from
  each player's recorded stats." (a completed match now gets a "how it's computed" line it lacked).
- **Files:** `src/components/MatchSummary.tsx` (ratings note branch).
- **Verified live (demo):** m1 football Summary → "⏱ Updates live — final ratings lock when the match ends."
  above the ratings list. 86 tests, typecheck clean.

### 2026-08-01 — Summary result label: no live dot on upcoming matches · FIX + VERIFIED

Follow-up to the result-label live dot: it keyed off `!complete`, so an *upcoming* match's summary showed a red
live dot even though its match header reads UPCOMING. `MatchSummary` only knew `complete`, not whether play had
started. Added a `live` prop.

- **Change:** the result-label dot now shows only when `live && !complete`; `LiveScoringScreen` passes
  `live={matchLive}` (which is `!complete && (status==='live' || started)`). Upcoming → no dot; live → dot.
- **Files:** `src/components/MatchSummary.tsx` (`live` prop + dot gate), `src/screens/LiveScoringScreen.tsx`.
- **Verified live (demo):** m7 tennis (upcoming) Summary → "SET 1 · BEST OF 3" with no dot (top board keeps its
  own). 86 tests, typecheck clean. (Noted separately: the top LineScoreboard still shows a dot on upcoming
  matches — pre-existing, all sports — left for a dedicated pass.)

### 2026-08-01 — Summary empty state: live/complete-aware copy · SHIPPED + VERIFIED

The ratings empty state showed one generic line ("No individual stats recorded for this match") for every case.
Made it context-aware with a helpful hint.

- **Change:** live/upcoming → "No player stats yet" + "Ratings build here as the scorer attributes goals, points
  and other actions to players."; completed → "No individual stats recorded" + "This match was scored at team
  level — no actions were attributed to players." (uses `EmptyState`'s existing `hint`.)
- **Files:** `src/components/MatchSummary.tsx` (empty-state branch).
- **Verified live (demo):** m7 tennis (upcoming, no stats) Summary → "📊 No player stats yet · Ratings build
  here as the scorer attributes…". 86 tests, typecheck clean.

### 2026-08-01 — Summary result label: live dot · SHIPPED + VERIFIED

The result block's top line was plain text — "Live · 1st Half" while live, "Full time" when done. Gave the live
state the app's red live dot instead of the text prefix.

- **Change:** live → a red dot + the uppercase status ("● 1ST HALF"); completed → the status alone
  ("FULL TIME"), no dot. Matches the top scoreboard / LIVE-pill cue used everywhere else.
- **Files:** `src/components/MatchSummary.tsx` (result label row + `resultLabelRow`/`liveDot` styles).
- **Verified live (demo):** m1 football Summary → "● 1ST HALF" with the red dot above the 2/RED : 1/BLU board.
  86 tests, typecheck clean.

### 2026-08-01 — Summary result score: score-over-name per side · SHIPPED + VERIFIED

The result block read "2 · RED · BLU · 1" — both team names squished in the middle, each score far from its team.
Restructured to a proper result board.

- **Change:** two columns — each side is its **score over its team name** (team-coloured), with a colon between,
  matching the top scoreboard. The loser-dim now applies to the whole losing side (score + name), and the winner
  line ("🏆 … won") / "Match drawn" stays below. Dropped the unused `vs` style.
- **Files:** `src/components/MatchSummary.tsx` (result score row + `side`/`sideName`/`colon` styles).
- **Verified live (demo):** m1 football Summary → "2 / RED  :  1 / BLU" with team-coloured names, no winner line
  (live). 86 tests, typecheck clean.

### 2026-08-01 — Summary stat awards: player avatar + stat badge · SHIPPED + VERIFIED

Applied the top-performer card's treatment to the stat-award grid (Top scorer, Top passer, …) so the whole
Summary tab shares one avatar language.

- **Change:** each award card now leads with the player's team-coloured **initials avatar** with its stat icon
  (⚽ etc.) as a corner badge, instead of a standalone stat emoji. Label / name / value unchanged. (`Award.player`
  is a `MatchRating`, so it carries `side` for the avatar colour.)
- **Files:** `src/components/MatchSummary.tsx` (award card + `awardAvatar`/`awardAvatarText`/`awardBadge` styles).
- **Verified live (demo):** m1 football Summary → TOP SCORER = red **AM** avatar with a ⚽ corner badge · Aarav
  Mehta · 1 goal, matching the TOP PERFORMER card and the ratings rows. 86 tests, typecheck clean.

### 2026-08-01 — Summary top-performer card: player avatar + award badge · SHIPPED + VERIFIED

The MVP / "Top performer" card led with a plain 🏅/🔥 emoji, not the player — inconsistent with the ratings rows
now using avatars. Made it a star-player card.

- **Change:** the card now leads with the player's team-coloured **initials avatar**, with the award emoji
  (🏅 complete · 🔥 live) as a small badge in the avatar's corner. Label / name / stat detail / ★rating unchanged.
  The stat-award grid below (Top scorer, etc.) keeps its stat icons — those are stat callouts, not person cards.
- **Files:** `src/components/MatchSummary.tsx` (MVP row + `mvpAvatar`/`mvpAvatarText`/`mvpBadge` styles).
- **Verified live (demo):** m1 football Summary → TOP PERFORMER = red **AM** avatar with a 🔥 corner badge · Aarav
  Mehta · 1 goal · ★5.0, above the avatar ratings list. 86 tests, typecheck clean.

### 2026-08-01 — Summary player ratings: initials avatars · SHIPPED + VERIFIED

The ratings list was the last person-list still using a tiny team-colour dot; every other list (scorer, hosts,
squad, manager, invited) now uses an initials avatar. Unified it.

- **Change:** each rating row's dot becomes a team-coloured **initials avatar** (dark text). Rank badges (🥇🥈🥉/
  number), podium-tinted top-3 rows, stat detail, stars and the rating number are all unchanged. Initials come
  from the masked display name, so a disputed player still shows "X".
- **Files:** `src/components/MatchSummary.tsx` (`initials` helper + avatar row + styles). Benefits every sport on
  the generic summary.
- **Verified live (demo):** m1 football Summary → 🥇 AM Aarav Mehta ★5.0, 🥈 IV Ishaan Verma 4.5 (blue avatar),
  🥉 RN Rohan Nair 4.0, 4 NK Neil Kapoor 1.0 — team-coloured avatars with podium tints. 86 tests, typecheck clean.

### 2026-08-01 — Match summary: winner line on the result · SHIPPED + VERIFIED

The generic `MatchSummary` (football + basketball/kabaddi/volleyball/badminton/tennis Summary tabs) dimmed the
loser's score once decided but never said who won. Added a result line matching the final scoreboard's treatment.

- **Change:** when a completed match is decided, show "🏆 {winner} won" (green) under the score; a completed tie
  shows "Match drawn". Live matches show nothing extra. Works wherever the summary reports the match result that
  persists at full time (football goals, basketball total); for set/game sports whose summary reports the
  in-progress sub-unit (0 after the final point), it simply stays hidden — no regression.
- **Files:** `src/components/MatchSummary.tsx` (result winner/drawn line + styles).
- **Verified live (demo):** m1 football live → no winner line; then ended m1 in-app (2–1) → Summary showed
  "🏆 RED won" + FINAL header + Player of the Match Aarav Mehta ★5.0. Cleared storage to restore. 86 tests,
  typecheck clean.

### 2026-07-31 — Football pitch: fuller markings (goal areas, spots) · SHIPPED + VERIFIED

The lineup pitch had only a halfway line, centre circle and two penalty boxes. Added the details that make it read
as a real football pitch: a **centre spot**, both **6-yard goal areas**, and both **penalty spots** — thin white
lines at the same rgba(255,255,255,0.25) as the rest.

- **Files:** `src/sports/football/LineupView.tsx` (the visible lineup pitch) and `src/sports/football/Pitch.tsx`
  (football's `Court`, used in the squad "arrange on pitch" editor) — kept identical so both pitches match. Pure
  view layer; players/markers unchanged.
- **Verified live (demo):** m1 Lineups pitch → the 6-yard goal area box now renders inside the penalty box, plus
  the faint centre/penalty spots. 86 tests, typecheck clean.

### 2026-07-31 — Football lineups: team-labelled bench columns · SHIPPED + VERIFIED

The FIFA-style LineupView (both XIs on a pitch with avatars, cards, goals, sub arrows, captain marks, formation
pills, legend) is already rich. One clarity gap: the bench was a single centred "Bench" title over two unlabelled
columns — you had to infer home-left / away-right.

- **Change:** each bench column now has a team-coloured header — "RED · 1", "BLU · 1" (name + sub count) — so
  each side's bench is labelled at a glance. Rest of the view unchanged.
- **Files:** `src/sports/football/LineupView.tsx` (`BenchList` header + `benchHead`/`benchColTitle` styles).
- **Verified live (demo):** m1 Lineups → pitch with RN Nair (yellow + goal) and VK Kamath (sub-off 30'), and the
  bench under it labelled "RED · 1" (Harsha Bhat ↑ 30') / "BLU · 1" (Aman Joshi). 86 tests, typecheck clean.

### 2026-07-31 — Football stats: hide untracked rows, list them in the footer · SHIPPED + VERIFIED

The team-stats comparison (bars + leader-highlighted values + the per-period toggle) was already strong, but it
padded the list with a "☁ not tracked" row for every stat this match isn't capturing — up to 18 rows, mostly
empty for a lightly-tracked game.

- **Change:** render only the **tracked** stats; collapse the rest into one footer line — "☁ Not tracked:
  Passes, Pass accuracy — turn on in Scoring settings (Info tab)" — which also names exactly what's missing
  (the old hint was generic).
- **Files:** `src/sports/football/index.tsx` (`StatsComparison` row filter + footer). Pure view layer;
  `StatRow`/bars/toggle unchanged.
- **Verified live (demo):** m1 Stats → Shots 5-2, Possession 70-30 etc. with comparison bars, Passes/Pass
  accuracy dropped from the list and named in the footer. 86 tests, typecheck clean.

### 2026-07-31 — Football timeline: LATEST + cap + outcome tones · SHIPPED + VERIFIED

Football's Timeline (its own component, merging events + tracked stats) already used the rail look but lagged the
others. Brought it fully in line.

- **LATEST** ring + tag on the newest event; a "＋ N earlier events" footer past a 60-row cap (was uncapped).
- **Outcome tones** (like cricket): goals/own-goals **green** (label too), red cards **red** (label too), yellow
  cards **amber** node; shots/fouls/subs/etc. keep the team colour.
- **Files:** `src/sports/football/Timeline.tsx` (`Item.tone`, `eventItem` mapping, render + `nodeHalo`/`latestTag`/
  `moreNote` styles).
- **Verified live (demo):** m1 Timeline → "Goal · Rohan Nair" green + newest ringed + **LATEST**; "Yellow card"
  amber node; shots/subs/fouls team-coloured; no footer (< cap). 86 tests, typecheck clean.

**Timeline sweep complete** — every sport's Score/Timeline feed now shares one rail-and-nodes style with the
LATEST marker and truncation footer; cricket and football add outcome tones (boundary/goal green, wicket/red-card
red, extra/yellow amber).

### 2026-07-31 — Cricket ball-by-ball: outcome-coloured balls · SHIPPED + VERIFIED

Cricket already used the shared `LiveTimeline` (so it got LATEST + the truncation footer), but every ball was
the same team colour. Made each ball read like a broadcast ball tracker — the outcome accents the node (and the
label for the big moments).

- **New `LiveEvent.tone`** ('boundary' | 'wicket' | 'extra'); the cricket engine stamps it per ball — FOUR/SIX →
  boundary, any wicket → wicket, wide/no-ball/byes → extra. `LiveTimeline` colours the node (and, for boundaries
  & wickets, the label) by tone: **green** boundary, **red** wicket, **amber** extra; plain runs keep the side
  colour. Other sports pass no tone → unchanged.
- **Files:** `src/sports/liveEvents.ts` (tone field), `src/sports/cricket/engine.ts` (5 ball events tagged),
  `src/sports/LiveTimeline.tsx` (tone → node/label colour). No totals change — the seed test still passes.
- **Verified live (demo):** m8 ball-by-ball → "FOUR"/"SIX" green with green nodes, "CAUGHT" red with a red node,
  regular runs in team colour, newest ball tagged LATEST. 86 tests, typecheck clean.

### 2026-07-31 — Basketball play-by-play: unified rail style + LATEST + cap · SHIPPED + VERIFIED

Basketball had its own timeline layout (quarter stamp + a right-side dot + bordered rows) and rendered **every**
play with no cap. Rebuilt it to share the other sports' rail-and-nodes look for a consistent timeline everywhere.

- **Rail spine** with a team-coloured node per play (was a trailing side-dot); the newest play gets a node ring +
  right-aligned **LATEST** tag; a "＋ N earlier plays" footer once past the 60-row cap (previously uncapped).
- Keeps the basketball specifics — the "Q2 6'" stamp, `BB_META` icons (🏀/🔁/🟨/Ⓐ), and the "+2 Player" detail.
- **Files:** `src/sports/basketball/Timeline.tsx` (rewritten to match `LiveTimeline`).
- **Verified live (demo):** cg7 Score → Play-by-play with the coloured rail, newest (Q2 6' Foul · Rohit Gowda)
  ringed and tagged **LATEST**; no footer (28 plays < cap). 86 tests, typecheck clean.

### 2026-07-31 — Score tab timeline: LATEST marker + truncation footer · SHIPPED + VERIFIED

The shared `LiveTimeline` (kabaddi / volleyball / badminton / tennis point-&-rally logs) capped at 60 rows and
silently dropped the rest. Two additions:

- **Truncation footer:** "＋ N earlier events" when the log is longer than the cap — no more silent drop.
- **Latest marker:** the newest (top) event gets a team-coloured ring around its node and a right-aligned
  **LATEST** tag, so the eye lands on what just happened.
- **Files:** `src/sports/LiveTimeline.tsx` (`hidden`/`latest` render + `nodeHalo`/`latestTag`/`moreNote` styles).
  Pure view layer; benefits every sport that uses it.
- **Verified live (demo):** tennis m12 point log → top event tagged **LATEST**, footer "＋ 34 earlier events"
  (94 total, 60 shown); rail nodes colour by player, with 🎯 Ace and ✅ Game markers intact. 86 tests, typecheck clean.

### 2026-07-31 — Court/lineups header: placed count + legend chips · SHIPPED + VERIFIED

Polished the wrapper around the positional court (the Lineups block on the Score tab, for sports with a
`plugin.Court` like basketball). The court map itself is unchanged.

- **Header** gains a placed count — "5 v 5 placed" — beside the Edit link.
- **Legend** is now two coloured team pills (dot + name) instead of a bare dots-and-muted-text row.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`courtNode` header/legend + `homePlaced`/`awayPlaced` +
  `legendChip`/`legendName`/`lineupHeadRight`/`lineupCount` styles). Pure view layer.
- **Verified live (demo):** cg7 Score tab → "Lineups · 5 v 5 placed · Edit ›", IND/KOR legend pills, and both
  teams' ten players placed on the court (Tej/Sahil/… and Vinay/Manoj/…). 86 tests, typecheck clean.

### 2026-07-31 — Info tab edit-squad button: action row + contextual label · SHIPPED + VERIFIED

The "✎ Edit matchday squad" affordance was a thin green text link — easy to miss next to the full-width
Add-player card. Made it a proper bordered action row (icon · label · ›) matching that card, and gave it a
contextual label: **Set matchday squad** when the squad is empty (a CTA), **Edit matchday squad** when it's set.

- **Files:** `src/screens/LiveScoringScreen.tsx` (squad-card edit affordance + `editSquadBtn`/`editSquadIcon`/
  `editSquadLabel`/`editSquadChevron` styles). Pure view layer; `editSquad` navigation unchanged.
- **Verified live (demo):** cg7 (squad set) → "✎ Edit matchday squad ›"; m7 (squads unset) → "＋ Set matchday
  squad ›". 86 tests, typecheck clean.

### 2026-07-31 — Info tab remind-captain button: sent-state feedback · SHIPPED + VERIFIED

The squad card's "🔔 Remind {captain} to set the squad" button fired the notification silently with no feedback.
Added a confirmed state.

- **After tapping:** the button becomes "✓ Reminder sent to {captain} & vice" (green) with a subtle **Remind
  again** link. Tracked per side (`remindedSides`), so reminding Red doesn't change Blue's button.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`remindCaptain` sets the flag; squad-card branch renders the
  sent state; `remindDone`/`remindDoneText`/`remindAgain` styles). View-layer + the existing notify path.
- **Verified live (demo):** m7 (scheduled, squads unset) Red House → tapped "Remind Aarav Mehta" → flipped to
  "✓ Reminder sent to Aarav Mehta & vice · Remind again"; Blue House's button stayed untapped. Cleared storage
  to drop the queued notification. 86 tests, typecheck clean.

### 2026-07-31 — Info tab calendar button: gated to upcoming + countdown hint · SHIPPED + VERIFIED

The "📅 Add to my calendar" button showed for every match with a start time — including live and finished ones,
where adding to a calendar is pointless. Gated it to **upcoming** matches only (`!started && !complete`) and
paired it with a countdown.

- **Countdown hint:** "⏱ Starts in 14h" / "in 3 days" / "in 20 min" above the button (accent, computed from
  `meta.startsAt` vs now), so a scheduled match reads how soon it is at a glance.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`startsIn` computation + gated button + `kickoffHint` style).
  Pure view layer; `addToCalendar`/`exportToCalendar` unchanged.
- **Verified live (demo):** scheduled tennis (m7) → "⏱ Starts in 14h" + Add-to-calendar button; live cg7 → the
  button and hint are gone. 86 tests, typecheck clean.

### 2026-07-31 — Info tab add-player card: pending count + avatar rows + tags · SHIPPED + VERIFIED

Brought the shared `AddInvitePlayer` card in line with the rest of the Info tab, and seeded a pending invite so
the state is demoable.

- **Header** gains an amber **N pending** pill (visible even collapsed) when there are unregistered invites.
- **Invited list:** each pending player is now an initials-avatar row — name + phone subline + an amber
  **PENDING** tag + a "Mark registered" link — instead of a flat "⏳ Name · phone". Section header carries the
  count ("Invited · N pending registration").
- **Seed:** added one organizer-invited prospect (Rehan Malik, Blue House, not in the matchday squad) so the
  pending list actually renders in the demo (the real invite flow opens WhatsApp, so it can't be exercised
  headlessly). `DEMO_KEY` v32→v33.
- **Files:** `src/components/AddInvitePlayer.tsx` (header count + avatar rows + `initials` helper + styles);
  `src/data/demoStore.ts` (seed + key). The card is also used on the scoring tab and squad cards → all benefit.
- **Verified live (demo):** m1 Blue House squad → "＋ Add another player · 1 pending"; expanded → INVITED · 1
  PENDING REGISTRATION, **RM** · Rehan Malik · +91 90000 12345 · amber PENDING · Mark registered. 86 tests,
  typecheck clean.

### 2026-07-31 — Info tab manager/coach field: person row + reveal-to-edit · SHIPPED + VERIFIED

The manager/coach field (inside each squad card) was an always-open text input for hosts, or a muted "🧑‍💼
Manager: X" line for viewers. Gave it the scorer/hosts person-row treatment.

- **Set:** an initials-avatar row — "Coach R. Menon · 🧑‍💼 Manager / coach" — with a **Change** link for hosts.
- **Editing:** Change (or "＋ Add manager / coach" when empty) reveals the labelled text field with a **Done** to
  collapse back. The reveal is explicit so live-binding the name doesn't flip the row mid-type.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`squadCard` manager block + `editingManager` state + mgr styles).
  View layer; `setManager` write path unchanged.
- **Verified live (demo):** m1 Red House squad → person row **CR** · "Coach R. Menon" · Manager / coach · Change;
  tapping Change revealed the prefilled field + Done. 86 tests, typecheck clean.

### 2026-07-31 — Info tab scoring-settings card: count + sections + cleaner stepper · SHIPPED + VERIFIED

Polished the football-only scoring-settings card to match the rest of the Info tab.

- **Header** gains an "N of 12 tracked" count on the right.
- **Section subheadings** — "Stats captured" over the toggle chips, "Match length" over the stepper (squad-card
  style). The active chips already highlight green, so the redundant "✓ " prefix on each label is dropped.
- **Stepper** reads "−5 · 45 min / half · +5" with a bigger, centred value.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`scoringSettingsCard` + `stepperRow`/`stepperVal` styles). View layer.
- **Verified live (demo):** m1 football Info → "⚙️ Scoring settings · 11 of 12 tracked", STATS CAPTURED chips
  (Passes off = the one untracked), MATCH LENGTH stepper at 45 min / half. 86 tests, typecheck clean.

### 2026-07-31 — Info tab disputes card: counts, sections, status tags · SHIPPED + VERIFIED

Brought the participation-disputes card in line with the rest of the Info tab.

- **Header** gains a red **N ACTIVE** pill (open + reported count).
- **Section subheadings** with counts for all three groups — "Reported N", "Under review N", "Resolved &
  dismissed N" (the first two had none before; matches the squad card's STARTING/SUBSTITUTES style).
- **Status tag** on each dispute box: amber **REPORTED**, red **UNDER REVIEW**, green **RESOLVED**, muted
  **DISMISSED** (a new `DisputeTag` helper) — replacing the ad-hoc ⚐/❌/✅ prefixes. Resolve/escalate/dismiss
  controls and the audit trail are unchanged.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`disputesCard` + `DisputeTag` + styles). Pure view layer.
- **Verified live (demo):** reported Neil Kapoor on m1 from the squad card → the disputes card showed "🚩
  Participation disputes · 1 ACTIVE", a "REPORTED 1" section, and the box "Neil Kapoor — RED" with an amber
  **REPORTED** tag + Escalate/Dismiss + audit trail. Cleared storage to restore the demo. 86 tests, typecheck clean.

### 2026-07-31 — Info tab format/date/venue rows: icon-led detail list · SHIPPED + VERIFIED

Turned the plain label/value rows into a consistent icon-led detail list, and unified all four through one
`InfoRow` (the venue/tournament rows were bespoke `View`s before).

- **`InfoRow`** gains an optional leading `icon` and an optional `onPress` (renders the value as a tappable
  link). Rows: **📋 Format**, **📅 Date**, **📍 Venue** (map link), **🏆 Tournament** (opens the tournament).
  Values right-aligned and single-line; the venue's 📍 moved from the value into the label icon.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`InfoRow` + the four call sites + styles). Pure view layer.
- **Verified live (demo):** cg7 Info → 📋 Format · 5-a-side · 5 subs · 5 fouls out, 📅 Date, 📍 Venue (Bengaluru
  Sports Hub, green link), 🏆 Tournament (Bengaluru City Games 2026 ›). 86 tests, typecheck clean.

### 2026-07-31 — Info tab live-stream card: connected state vs paste editor · SHIPPED + VERIFIED

The stream card showed a bare text field even when a stream was already set. Gave it two states:

- **Set:** a green **ON** pill in the header, the detected platform (▶️ YouTube / 🟣 Twitch / 🔗 Link) + the
  link (protocol stripped), "Pinned to the top of this match for everyone watching", and **Change** / **Remove**.
- **Empty / editing:** the paste editor (link field + Save), with a **Cancel** when editing an existing link.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`streamSettingsCard` + `editingStream` state + styles). View layer.
- **Verified live (demo):** cg7 Info → empty shows the paste editor; after saving `youtube.com/live/abc123` it
  shows "● ON · ▶️ YouTube · youtube.com/live/abc123 · Change/Remove"; Remove restores the editor (storage
  cleared to reset the demo). 86 tests, typecheck clean.

### 2026-07-31 — Info tab hosts card: avatar rows + count + "you" · SHIPPED + VERIFIED

Brought the shared `HostsCard` in line with the scorer/squad polish: each host row now shows an initials avatar
instead of the generic 🧑‍💼, the header carries a count ("Hosts · 1"), and the viewer's own row is highlighted
(green avatar + "· you") via a new optional `meId` prop. Add-host picker and Remove are unchanged.

- **Files:** `src/components/HostsCard.tsx` (avatar rows + count + `initials` helper + `meId`);
  `src/screens/LiveScoringScreen.tsx` passes `meId={myPlayerId}`. The component is also used on the tournament
  screen, which omits `meId` → neutral avatars + count there too. Pure view layer.
- **Verified live (demo):** cg7 Info → "Hosts · 1", green **AM** avatar · "Aarav Mehta · you" (Aarav is the
  viewer and the sole host). 86 tests, typecheck clean.

### 2026-07-31 — Info tab scorer card: person row with avatar + live state · SHIPPED + VERIFIED

Polished the "Match scorer" card from an icon + name line into a person row consistent with the squad sheet.

- **Avatar:** an initials circle — green (this-device highlight) when you're the scorer, neutral otherwise;
  a ➕ placeholder when unassigned.
- **Status sub-line:** "📱 Scoring from this device" (you), "Scoring from their device" (someone else),
  "Assigned scorer" (set but not underway), or "Set before kickoff" (unassigned).
- **LIVE pill** on the right while the match is underway and a scorer is set. The Change/Assign/Close control and
  the picker are unchanged.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`scorerCard` row + `scorerInitials` helper + styles). View layer.
- **Verified live (demo):** cg7 (you score) → green **AM** · "Scoring from this device" · ● LIVE · Change;
  m8 cricket (someone else) → neutral **IV** · "Ishaan Verma · Scoring from their device". 86 tests, typecheck clean.

### 2026-07-31 — Info tab squad cards: team-sheet layout · SHIPPED + VERIFIED

Polished the Info tab's matchday squad cards from a flat "· Name  #12" list into a proper team sheet.

- **Header** now shows the squad size — "✓ Squad set · 8".
- **Starting / Substitutes split:** the applied roster (ordered starters-then-subs) is partitioned back into two
  labelled sections ("STARTING 7", "SUBSTITUTES 1"); a team with no squad set still shows one flat list.
- **Rows:** each player gets a jersey-number badge (bordered in the team colour) instead of an inline "#12", plus
  a **C** (captain, amber) / **V** (vice) tag and a 🧤 for the keeper. The dispute/report/object links are
  unchanged.
- **Files:** `src/screens/LiveScoringScreen.tsx` (`squadCard` markup + styles). Pure view layer.
- **Verified live (demo):** cg7 → "Indiranagar United · ✓ Squad set · 5", STARTING 5 with jersey badges; m1
  football → STARTING 7 (Aarav **C**, Rohan **V**) + SUBSTITUTES 1 (Harsha Bhat). 86 tests, typecheck clean.

### 2026-07-31 — Scoring tab match header (all four tabs now share it) · SHIPPED + VERIFIED

Added the shared `MatchHeader` to the top of the Scoring tab too, so every tab (Info / Score-via-board /
Summary / Scoring) opens with the same match identity. Order on the scorer's tab: header → broadcast board →
undo/add-player → controls.

- **Files:** `src/screens/LiveScoringScreen.tsx` (one `<MatchHeader/>` at the top of the scoring branch). Pure
  view layer; the board and controls below are unchanged.
- **Verified live (demo):** cg7 Scoring tab → "🏀 BASKETBALL · ● LIVE", Indiranagar United VS Koramangala Kings,
  above the TOTAL·Q1·Q2 board and the scoring controls. 86 tests, typecheck clean.

### 2026-07-31 — Summary tab match header (shared `MatchHeader` component) · SHIPPED + VERIFIED

Give the Summary tab the same match-identity header the Info tab got, so both read consistently. Extracted the
header into a reusable `MatchHeader` component (sport + LIVE/FINAL/UPCOMING chip, then both full team names in
their colours over colour bars either side of a VS) and used it on both tabs.

- **Files:** new `src/components/MatchHeader.tsx`; `src/screens/LiveScoringScreen.tsx` — Info tab now renders
  `<MatchHeader/>` (its inline markup + `mh*` styles removed), and the Summary tab renders it in a card above the
  standouts/ratings. Pure view layer.
- **Verified live (demo):** cg7 Summary → "🏀 BASKETBALL · ● LIVE", Indiranagar United (orange) VS Koramangala
  Kings (blue), above the standouts; Info tab still renders the identical header. 86 tests, typecheck clean.

### 2026-07-31 — Info tab match header: teams-in-colours identity + status chip · SHIPPED + VERIFIED

The Info tab opened with a plain "IND vs BLU" text line beside a small logo. Since the broadcast board already
shows the score above the tabs, the Info header should establish match *identity* — who's playing. Rebuilt it as
a proper match header:

- **Top row:** the match logo (editable by hosts), the sport (🏀 BASKETBALL), and a status chip — **LIVE** (red,
  with a dot), **FINAL**, or **UPCOMING** (derived from `complete`/`started`/`meta.status`; distinct from the
  existing `live` = "synced to backend").
- **Teams row:** both **full** team names (`homeTeamName`/`awayTeamName`, not the RED/BLU codes) in their team
  colours, each over a colour bar, either side of a **VS**. The Format/Date/Venue/Tournament rows and calendar
  button stay below.
- **Files:** `src/screens/LiveScoringScreen.tsx` (header markup + styles + `matchLive`/`statusLabel`; dropped the
  now-unused `matchTitleRow` style). Pure view layer.
- **Verified live (demo):** cg7 → "🏀 BASKETBALL · ● LIVE", Indiranagar United (orange) VS Koramangala Kings
  (blue) with colour bars; scheduled tennis (m7) → "🎾 TENNIS · UPCOMING", Red House VS Blue House. 86 tests,
  typecheck clean.

### 2026-07-31 — Completed-match final scoreboard: broadcast board reads as a result · SHIPPED + VERIFIED

Follow-up to the broadcast boards: make a finished match read as a broadcast FINAL. Two parts —

- **Winner treatment on the line-score board.** `LineScoreboard` gains a `winner` prop: the winning row gets a
  🏆 and the losing row dims, so a completed match (which renders `plugin.Scoreboard` with `live=false`) reads as
  a result. Each of the 5 sports passes the winner when `ended`. Tennis also switches its headline from POINTS to
  **SETS** when ended (the current-game points are 0-0 after match point, so SETS is the number a fan reads).
- **A completed match that actually shows it.** All the demo's finished matches for these sports were archived
  (aggregate score only, no log → the plain fallback card). Gave the completed volleyball **m5** (Green 3–1 Red,
  best of 5) a full event log via the `vbEvents` generator (now roster-parameterised), so it replays to an ended
  state and renders the broadcast FINAL board — SETS + per-set columns + winner. `M5_SQUADS` + empty lineup added;
  m5 format set to `setsToWin: 3`; `DEMO_KEY` v31→v32. The archived fallback card (matches with no log) also gets
  a 🏆 on the winner line for consistency.
- **Files:** `src/components/LineScoreboard.tsx`, the 5 sport plugins, `src/data/demoStore.ts`,
  `src/core/mockData.ts`, `src/screens/LiveScoringScreen.tsx` (fallback card).
- **Verified live (demo):** completed the live volleyball (m10) in-app → board read **MATCH OVER · BEST OF 3**,
  RED 🏆 [2] 25 25 / BLU [0] 21 21 (loser dimmed) — the exact path m5 uses. Cleared storage to restore the demo.
  86 tests, typecheck clean.

### 2026-07-31 — Scoring tab shows the broadcast board (was a one-row MiniScore) · SHIPPED + VERIFIED

Follow-up to the broadcast boards: the scorer's tab still showed the compact one-line MiniScore. On the Scoring
tab, sports with a broadcast board now render that same line-score above the controls, so the scorer sees the
full per-period picture (not just the running total) while scoring — and it updates live as they score.

- **Change:** `LiveScoringScreen` — on the Scoring tab, render `plugin.Scoreboard` when present, else `MiniScore`.
  The top board is already suppressed on this tab, so there's no duplication. Football/cricket (no
  `plugin.Scoreboard`) keep the compact MiniScore.
- **Files:** `src/screens/LiveScoringScreen.tsx` (one render branch). No component/reducer/seed changes.
- **Verified live (demo):** cg7 basketball on the Scoring tab shows TOTAL·Q1·Q2 with the ticking clock; scoring
  +1 IND updated the board to 15 (Q2 7) live, Undo restored 14 (Q2 6). 86 tests, typecheck clean.

### 2026-07-31 — Broadcast-style scoreboards for the 5 non-cricket/football sports · SHIPPED + VERIFIED

Feedback: the live scoreboards should replicate the international/TV conventions users know (e.g. a tennis board
shows a POINTS column plus a column of games per set — 6-4, 5-7, 1-0 — current set highlighted), not a generic
`home : away` total. Cricket and football already read right and are untouched.

- **Shared `LineScoreboard`** (`src/components/LineScoreboard.tsx`): a leading emphasized column (the headline
  number) + one column per period, the live period highlighted; a `clock` node (a sport's `LiveClock`) can take
  the status row so running-total sports keep a ticking clock. Sports opt in via `plugin.Scoreboard`.
- **Per-sport boards:**
  - **Tennis** — `POINTS` (current game 0/15/30/40) + games per set. e.g. 30/15 · S1 6-4 · S2 3-2.
  - **Volleyball** — `SETS` won + points per set. e.g. 1/0 · 25-21 · 19-21.
  - **Badminton** — `GAMES` won + points per game. e.g. 1/0 · 21-17 · 14-16.
  - **Basketball** — `TOTAL` + points per quarter (from the event log). e.g. 14/11 · Q1 8-7 · Q2 6-4.
  - **Kabaddi** — `TOTAL` + points per half. e.g. 14/13 · H1 8-7 · H2 6-6.
- **Files:** `src/components/LineScoreboard.tsx` (new) + `Scoreboard` added to the tennis/volleyball/badminton/
  basketball/kabaddi plugins. Pure view layer — no reducers, seeds or `DEMO_KEY` touched. The generic
  `home : away` `<Scoreboard/>` still serves football; the scorer's compact MiniScore is unchanged.
- **Verified live (demo):** all five boards render their broadcast layout with the correct per-period splits and
  the current period highlighted (screenshots match the totals from the box scores). 86 tests, typecheck clean.

### 2026-07-31 — Tennis per-set player stats (new box score) + seeded live singles match · SHIPPED + VERIFIED

Tennis was the last sport in the per-period sweep and the most structurally complex (points → games → sets,
deuce/ad, tiebreaks). Its live view had only set-score chips and a point log — no per-player stats. Built the
per-set box score (Points + Aces, like volleyball's) and seeded a live singles match to demo it.

- **Data model:** the tennis reducer now stamps `kind`/`playerName`/`set`/`points` on each scored point (reusing
  the shared `LiveEvent.set` field). Previously the scorer only lived in the event's `detail` string.
- **New `TennisBoxScore`** (`src/sports/tennis/BoxScore.tsx`): **PTS + ACE** per player, one table per side, with
  an **Overall / Set 1 / Set 2 …** toggle. Shows once ≥2 sets exist. Works for singles (one row a side) and
  doubles. Wired into `LiveExtras` between Sets and the point log.
- **Seed:** new live match **m12** — Varun Kamath (Red) vs Sameer Das (Blue), best of 3. A deterministic
  generator (`tnEvents`) plays through the real points→games→sets reducer to exact scores: **Red 6–4 (set 1),
  3–2 · 30–15 (set 2 live)**. Each game is won on the winner's 4th point with the loser scoring 0–2 first, so
  **points won ≠ 4×games** (Red 45 total, not 24); aces land ~every 7th point per side. View-only (scored by a
  player) so it opens on the box score. `M12_SQUADS` + empty lineup; `mockData` m12 live; `DEMO_KEY` v30→v31.
  Existing m7 (singles, 6-6-tiebreak demo, scored by the demo user) is untouched.
- **Files:** `src/sports/tennis/index.tsx`, `src/sports/tennis/BoxScore.tsx`, `src/data/demoStore.ts`,
  `src/core/mockData.ts`.
- **Verified live (demo):** m12 (via Live → See all) opens onto the stats — scoreboard "SET 2 · BEST OF 3",
  30:15, "Games 3-2 · 6-4". Overall Varun 45/6 aces, Sameer 33/4; Set 1 = 28/21 (4/3 aces), Set 2 = 17/12 (2/1) —
  both points and aces sum exactly to Overall. 86 tests, typecheck clean.

**Sweep complete.** All seven event-log sports now demo a per-period player-stats breakdown on a live match:
basketball (quarter), kabaddi (half), football (period), cricket (innings), volleyball (set), badminton (game),
tennis (set).

### 2026-07-31 — Badminton per-game player stats (new box score) + seeded live doubles match · SHIPPED + VERIFIED

Badminton was the last event-log sport without per-player stats — like volleyball, its live view had only
game-score chips and a rally log. Built the per-game box score (the badminton analogue) and seeded a live
**doubles** match, where a per-player split is genuinely useful (which of a pair is carrying the rallies).

- **Data model:** added `game?: number` to the shared `LiveEvent`; the badminton reducer now stamps
  `kind`/`playerName`/`game`/`points` on each rally point (previously the scorer was only in the `detail` string).
- **New `BadmintonBoxScore`** (`src/sports/badminton/BoxScore.tsx`): **PTS** per player, one table per side, with
  an **Overall / Game 1 / Game 2 …** toggle that re-tallies over one game. Shows once ≥2 games exist — same rule
  as the other sports. Wired into `LiveExtras` between Games and the rally log.
- **Seed:** new live match **m11** — Red pair (Aanya Mehta / Divya Menon) vs Blue pair (Aisha Begum / Tina Dsa),
  best of 3. Deterministic generator (`bmEvents`, points rotate between each pair's two) replays to **Red 21–17
  (game 1), 14–16 (game 2 live)**, Red 1–0 on games. View-only (scored by a player) so it opens straight onto the
  box score. `M11_SQUADS` + empty lineup; `mockData` m11 live; `DEMO_KEY` v29→v30. The existing m3 (singles,
  single-game-to-11 demo, scored by the demo user) is untouched.
- **Files:** `src/sports/liveEvents.ts`, `src/sports/badminton/index.tsx`, `src/sports/badminton/BoxScore.tsx`,
  `src/data/demoStore.ts`, `src/core/mockData.ts`.
- **Verified live (demo):** m11 (via Live → See all — it's now the 7th live match, past the home feed's cap of 5)
  opens onto the stats — Overall Red 35 (Aanya 18, Divya 17) / Blue 33 (Aisha 17, Tina 16); Game 1 = 21/17,
  Game 2 = 14/16 (sums check). 86 tests, typecheck clean.

### 2026-07-31 — Volleyball per-set player stats (new box score) + seeded live 2-set match · SHIPPED + VERIFIED

Volleyball was the biggest gap of the per-period sweep: its live view had **no per-player stats at all** — just
set-score chips and a point log — and there was no live volleyball match to demo. Built the box score from
scratch (the volleyball analogue of the kabaddi build) and seeded a live match to show it.

- **Data model:** added `set?: number` to the shared `LiveEvent`, and the volleyball reducer now stamps
  `kind` ('point'|'ace'), `playerName`, `set` and `points` on each scored point (the timeline ignores them; the
  box score aggregates them). Previously the scorer was only ever kept in the `detail` string.
- **New `VolleyballBoxScore`** (`src/sports/volleyball/BoxScore.tsx`): **PTS + ACE** per player, one table per
  side, with an **Overall / Set 1 / Set 2 …** toggle that re-tallies over one set (an ace counts in both columns).
  Shows once ≥2 sets exist — same rule as basketball/kabaddi. Wired into `LiveExtras` between Sets and the point log.
- **Seed:** m10 promoted `scheduled` → **live** (still scored by the demo user). New `demo.matchEvents['m10']`
  from a deterministic generator (`vbEvents`) that replays to exact per-set scores — **Red 25–21 (set 1), Red
  19–21 (set 2 live)**, Red 1–0 on sets. Points rotate across each six; aces land ~every 5th point *per side*
  (a first cut put every ace on one team because strict home/away alternation aligned the global counter — fixed
  to a per-side counter). `M10_SQUADS` + empty lineup registered; `mockData` m10 live + score; `DEMO_KEY` v27→v29.
- **Files:** `src/sports/liveEvents.ts`, `src/sports/volleyball/index.tsx`, `src/sports/volleyball/BoxScore.tsx`,
  `src/data/demoStore.ts`, `src/core/mockData.ts`.
- **Verified live (demo):** m10 (via Live → See all) shows the new stats — Overall Red 44 / Blue 42 (8 aces each,
  spread unevenly across players), Set 1 = 25/21, Set 2 = 19/21 (sums check on both points and aces). 86 tests,
  typecheck clean.

### 2026-07-31 — Cricket per-innings: live 2nd-innings chase seed + viewer-facing chase equation · SHIPPED + VERIFIED

Cricket's per-innings breakdown is structural (two collapsible innings cards, not a toggle) and was already
demoable on the **completed** fixtures (ck1/ck2/s6/s7 replay full two-innings cards). But the **live** cricket
match (m8) was stuck mid-1st-innings, so a reviewer opening the live fixture saw only one populated card and
never the 2nd-innings chase experience — the same gap the other sports had (only one period of live data).

- **Seed:** m8 is now a live **2nd-innings chase**. Red bat their full 10 overs (the reducer auto-switches at the
  over limit — t1 cricket is `overs: 10`), then Blue's chase is seeded part-way: **Red 118/6 (10.0) · Blue 72/3
  (6.3), chasing 119 — need 47 off 21**. Rebuilt `cricketSeed.ts` (`buildLiveInnings` now = full 1st innings via
  the existing `buildInnings` + a new `buildPartialChase`), updated the seed test to assert the chase state
  (innings 2, both totals, `target = first + 1`, crease/bowler pinned), m8 score in `mockData.ts`, `DEMO_KEY`
  v26 → v27.
- **Fix surfaced by the seed:** the chase equation (target / runs needed / balls left / required rate) only ever
  rendered inside the **scorer's** controls (Super Over banner, DLS box) — a view-only spectator of a run chase
  saw none of it. Added it to the live status line in `CricketSummary`: for the 2nd innings the LIVE line now
  appends `· chasing {target} · need {N} off {M} · RRR {r}`.
- **Files:** `src/data/cricketSeed.ts`, `src/core/mockData.ts`, `src/sports/cricket/index.tsx`,
  `tests/cricket-seed.test.mts`.
- **Verified live (demo):** m8 opens onto a full two-innings scorecard — Red 118/6 (8 batters, dismissals, CRR
  11.80, 5 bowlers) and Blue 72/3 (Sanjay Menon 30*, "Yet to bat: Karan Bose, Ajay Kamath, Vivek Anand", Red's 5
  bowlers, Suresh Pillai mid-over 1.3). Summary LIVE line reads "Innings 2 · BLU 72/3 (6.3) · RR 11.08 · chasing
  119 · need 47 off 21 · RRR 13.43" (math exact). Standouts/ratings span both innings. 86 tests, typecheck clean.

### 2026-07-31 — Football per-period Stats: hide the toggle until a 2nd period exists · SHIPPED + VERIFIED

Reviewed football's per-period Stats split (the original the basketball/kabaddi ports copied). It was already
demoable and **correct** — verified on kc3 (Falcons v City Strikers, into the 2nd half): every Overall value =
1st half + 2nd half exactly (Shots 5/5 = 3/3 + 2/2, on-target 4/2, Fouls 2/2, Yellow 1/2, Offsides 1/1, Corners
2/2), and Possession correctly shows only in Overall scope. No seed change needed (unlike basketball/kabaddi,
football's seed already had a both-halves live match).

The review did surface one consistency wart: football **always** rendered the Overall/1st half/2nd half chips,
so a match still in the 1st half (m1, Red v Blue) showed a redundant toggle where "Overall" == "1st half" plus a
dead all-zeros "2nd half" filter — exactly the "two dead filters" the ET code already guarded against, but for
the half chips. Aligned it with the basketball/kabaddi rule: **show the period split only once `s.half >= 2`**,
and gate each ET chip on its own period (`ET 2` only at `half >= 4`, where before both ET chips appeared together
at ET 1). `active` falls back to Overall if the selected scope isn't among the shown periods.

- **Files:** `src/sports/football/index.tsx` (`StatsComparison` only — view layer, no reducer/seed change).
- **Verified live (demo):** m1 (1st half) → **no toggle**, plain table with Possession. kc3 (both halves) →
  **Overall / 1st half / 2nd half**, no dead ET chips, filtering still exact. 86 tests, typecheck clean.

### 2026-07-31 — Basketball per-quarter box score: made demoable in the seed · SHIPPED + VERIFIED

The per-quarter toggle (part 1 of the stats port) was view-only with no seed change, so it only showed after a
scorer manually ended Q1 — a reviewer opening cg7 cold saw the plain box score (all data sat in Q1). Same gap
the kabaddi seed closed for halves. Fix: split the existing cg7 event log across **Q1 → Q2** (added a
`NEXT_QUARTER` + Q2 `KICKOFF`, and a `quarter` arg on the `bbScore`/`bbStat` seed helpers) so both quarters
carry real data out of the box.

- **No score/stat drift:** final stays **14 · 11** and every player's Overall line is byte-for-byte the same —
  only the quarter each play lands in changed (Q1 8–7, Q2 6–4). The pre-seeded box-score `line()` entries and
  ratings are untouched.
- **Files:** `src/data/demoStore.ts` (cg7 event log + helper signatures), `DEMO_KEY` v25 → v26. No view/reducer
  change — the toggle from part 1 does the rest.
- **Verified live (demo):** cg7 opens at **Q2 · 5'**; play-by-play now shows real quarter stamps (Q2 6'… Q1…)
  instead of everything reading Q1. Box score toggle shows **Overall / Q1 / Q2** — Overall IND 14 (Tej 5, Akash
  5, Sahil 4) / KOR 11; Q1 filter = 8–7 (Tej 3, Akash 3, Sahil 2 / Vinay 3, Manoj 2, Rohit 2). 86 tests,
  typecheck clean.

### 2026-07-31 — Cross-sport stats port (2/2): kabaddi per-half player stats + seeded live m4 · SHIPPED + VERIFIED

Part 2 of the parked stats port. Kabaddi had **no per-player stats table at all** (its Score tab was just the
Timeline), so this was the bigger lift flagged in part 1: build the aggregator, then add the same per-half
toggle basketball/football have — and seed a live kabaddi match to demo it (the demo had none).

- **What changed:**
  - New `src/sports/kabaddi/BoxScore.tsx` — `KabaddiBoxScore` renders a **RAID / TCKL / PTS** table per side,
    derived from the LiveEvents timeline. `tally(events, side, scope)` sums raid vs tackle points, filtered by
    `e.half`; players sort by total, rows show only players with points. An **Overall / 1st half / 2nd half …**
    SelectChip toggle re-tallies over one half, appearing only once **≥2 halves** exist (mirrors basketball's
    per-quarter split; a circular import is avoided by passing precomputed `periods` labels as a prop).
  - `src/sports/kabaddi/index.tsx` — `LiveExtras` computes the halves played and renders **Player stats** +
    the table below the Timeline.
- **Seed (to demo it):** m4 (Blue House vs Gold House) promoted from `scheduled` to a **live** view-only match
  — new `demo.matchEvents['m4']` event log (KICKOFF → raids/tackles → NEXT_HALF → more), replayed to
  **Blue 14 · Gold 13** across two halves; `M4_SQUADS` (6 per house) so Info reads "✓ Squad set"; empty
  `demo.lineups['m4']` (kabaddi's positional court stays hidden — only 6 players/house). `mockData.ts` m4 →
  live + `score`, scorer `p-ishaan` (a player → view-only for the demo user, opens on the Score tab).
  `DEMO_KEY` v24 → v25.
- **Files:** `src/sports/kabaddi/BoxScore.tsx` (new), `src/sports/kabaddi/index.tsx`, `src/data/demoStore.ts`,
  `src/core/mockData.ts`.
- **Verified live (demo):** m4 opens on Score — HALF 2 · 33' · 14:13, timeline correct. Player stats:
  Overall BLU 14 (11 raid + 3 tackle) / GLD 13 (9 + 4) — both match the score. Toggle → **1st half**: BLU 8
  (Ishaan 3, Karan 2, Faisal 1, Rohit 1, Sameer 1) / GLD 7 (Imran 2, Naveen 2, Mahesh 2, Kiran 1); H2-only
  players correctly drop out. Matches the seed (H1 8-7 → H2 6-6). 86 tests, typecheck clean.

### 2026-07-30 — Cross-sport stats port (1/2): basketball per-quarter box score · SHIPPED + VERIFIED

Parked-backlog item — port football's per-period Stats split to the other event-log sports. Part 1: basketball.
Every `BBEvent` already carries `quarter` (incl. backfilled/edited via the scorer), so this is a pure
view-layer add — the analogue of football's `StatsComparison` Overall/1st-half/2nd-half toggle.

- **What changed:** `BoxScore.tally()` gains a `scope` param ('all' | quarter) that filters events by
  `e.quarter`; the box score renders an **Overall / Q1 / Q2 … (OT)** chip toggle (SelectChip) that re-tallies
  over the selected quarter. The toggle only appears once **≥2 periods** exist (a single-quarter game shows the
  plain box score, unchanged). `LiveExtras` passes the periods played (`periodLabel(i, regPeriods)`), so labels
  are Q/H/OT-aware. Both team tables share one scope.
- **Files:** `src/sports/basketball/BoxScore.tsx`, `src/sports/basketball/index.tsx`. View-only — no reducer,
  no seed, no `DEMO_KEY` bump.
- **Verified live (demo):** cg7 in Q1 shows **no** toggle (zero disruption to the reviewed tabs). Then via the
  scorer: End Q1 → Start Q2 → Tej Anand +2 → box score shows **Overall / Q1 / Q2**; Overall = Tej 7 (5+2), Q1 =
  Tej 5, Q2 = Tej 2 — filtering correct on both teams. Reloaded to restore the Q1 seed. 86 tests, typecheck,
  console clean.
- **Next (part 2):** kabaddi — bigger lift (it has no per-player stats table yet), so it needs an aggregator
  built first, then the same per-half toggle.

### 2026-07-30 — Cricket Summary MVP line drops the "· —" filler · SHIPPED + VERIFIED

Reviewing the live cricket (m8) Summary (the "standouts so far" view): it was otherwise correct — LIVE header,
top performer/bat/bowl, and the 10 contributing players rated "so far" (yet-to-bat correctly excluded). One
cosmetic nit: the **Top performer** line read "30 (17) · —" — the "· —" was a placeholder for Aarav's absent
bowling (the MVP detail hard-joined `batLine · bowlLine`).

- **What changed:** added a `mvpDetail(p)` helper in `CricketSummary` that joins only the disciplines the
  player actually featured in — a pure batter reads "30 (17)", a bowler "3-20 (4.0)", an all-rounder both.
  Used for the MVP award in both the live and post-match branches (the per-award Top bat / Top bowl lines were
  already discipline-specific).
- **Files:** `src/sports/cricket/index.tsx`.
- **Verified live (demo):** m8 Summary → "🔥 TOP PERFORMER Aarav Mehta 30 (17) · RED ★5.0" (was "30 (17) · —").
  Ratings list, headers, everything else unchanged. 86 tests, typecheck, console clean.

### 2026-07-30 — Cricket ball-by-ball uses standard delivery notation · SHIPPED + VERIFIED

Reviewing the live cricket (m8) Scorecard: the card math was all correct (batting 78 = bowling 78, 45 balls =
7.3 overs, 3 wkts, extras 0, 3 yet-to-bat for 8-a-side), but the **Ball-by-ball** labelled the 6th ball of
each over "N.0" (e.g. "1.0", "7.0") — because it stamped each delivery with `oversStr(balls)` (overs *bowled*
after the ball). A cricket fan expects delivery notation `0.1–0.6, 1.1–1.6, …`.

- **What changed:** added `ballStamp(balls, bpo)` to the cricket engine — `⌊(balls-1)/bpo⌋.((balls-1)%bpo)+1`
  — so the Nth delivery reads over.ball with ball 1–6 (the last ball of an over is "0.6", not "1.0"). Used it
  for the legal-ball events (runs, byes/leg-byes, wicket-off-delivery) and for wides/no-balls (the ball being
  re-bowled, `cur.balls+1`). Left `oversStr` for genuine over *counts* (totals, RR, bowling figures) and for
  the two non-delivery timeline markers (retired hurt, impact player). Events are regenerated on replay, so no
  seed/`DEMO_KEY` change.
- **Files:** `src/sports/cricket/engine.ts`, `tests/cricket-seed.test.mts` (+2 tests pinning ballStamp vs the
  unchanged oversStr).
- **Verified live (demo):** m8 Ball-by-ball now reads 7.3, 7.2, 7.1, **6.6**, 6.5 … (was …7.1, **7.0**, 6.5);
  6th balls across the innings read 0.6–6.6. "This over" pills (6·4·0) and all card figures unchanged. 86
  tests, typecheck, console clean.

### 2026-07-30 — Matchday-squad status: "Squad set" not "XI set" (size-agnostic) · SHIPPED + VERIFIED

The Info tab's per-team status read **"✓ XI set"** for *every* sport — but "XI" means eleven, so it was wrong
on 7-a-side football, basketball (5), cricket (8), etc. Made it size-agnostic.

- **What changed:** the shared squad-card status in `LiveScoringScreen` now reads **"✓ Squad set"** /
  **"Squad to be set"** (was "✓ XI set" / "XI not set"); the captain-reminder button now says "…to set the
  **squad**"; and the two "Squad needed" nudges (`LiveScoringScreen` notify + `reminders.ts`) now say "set
  your matchday **squad**" instead of "matchday XI & subs". Chose "Squad" over "Team" (it's the matchday
  selection, matching the "Matchday squads" header) and over "XI" (size-specific). Purely wording; no data
  change, so no `DEMO_KEY` bump. Stale code comments referencing the old string were updated too.
- **Files:** `src/screens/LiveScoringScreen.tsx`, `src/data/reminders.ts` (+ comment touch-ups in
  `demoStore.ts`/`cricketSeed.ts`).
- **Verified live (demo):** m1 (7-a-side) Info → both teams **"✓ Squad set"**; applies to every sport since
  it's the shared component. 84 tests, typecheck, console clean.
- **Follow-up (done — see next entry):** the editor screens' "XI" wording was swept in the change below.

### 2026-07-30 — Sweep "XI" out of the squad/lineup editor screens · SHIPPED + VERIFIED

Completed the terminology sweep across the remaining user-facing "XI" strings (all size-specific):

- **CricketLineupScreen:** "become the XI (batting 1–N)" → "form the batting order (1–N)"; the count header
  "{team} XI — n/N" → "{team} lineup — n/N".
- **LineupEditorScreen:** "squad members not in the XI" → "…not in the starting lineup"; "Everyone is in the
  XI." → "Everyone is in the starting lineup."
- **MatchSquadScreen:** the quick actions "Fill XI" → "Fill starters" and "Copy last match's XI" → "Copy last
  match's squad".
- **SquadScreen:** "Matchday XI & substitute selection…" → "Matchday squad & substitute selection…".
- **Help centre** (`supportKB` title + body, `supportGuides`): "playing XI / squad" title → "Set the matchday
  squad for a match"; "Copy last match's XI" → "…squad". Kept the "playing 11" / "starting five" search
  keywords (people still search those) — the support-KB search test still matches on them.
- **Files:** `CricketLineupScreen.tsx`, `LineupEditorScreen.tsx`, `MatchSquadScreen.tsx`, `SquadScreen.tsx`,
  `supportKB.ts`, `supportGuides.ts`. Remaining "XI" are code comments only (dev shorthand, not rendered).
- **Verified:** 84 tests (incl. the support-KB search test) + typecheck + console clean. Wording-only, no
  `DEMO_KEY` bump. The editor screens are gated behind manage/pre-match flows that aren't drivable in the web
  harness, so these strings were verified by code + typecheck + tests; the live-facing "✓ Squad set" label was
  screenshot-verified in the entry above.

### 2026-07-30 — m1 rebuilt as a clean 7-v-7 · SHIPPED + VERIFIED

Follow-up to the m1 squads fix: m1 is a **7-a-side** tie but fielded 6/5 on the 11-slot 4-3-3 template, so its
Lineups pitch showed ~5–6 bare empty position dots per side. Made it a real, full 7-v-7.

- **What changed:**
  - Extended three existing multi-sport Red/Blue House players to also play football (no invented people):
    **Rakesh Gowda** (Red), **Rohit Pillai** & **Vivek Shenoy** (Blue) — giving Red 8 and Blue 8 football
    players (7 starters + 1 sub each).
  - Rewrote `seedLineup` to a purpose-built **2-3-1** (`sevenASide()`: GK · 2 CB · LM/CM/RM · ST — 7 slots,
    no 11-slot template), placing a full XI each and tagging `homeFormation`/`awayFormation` = "2-3-1". The
    seeded 30' sub (Varun → Harsha) still holds (Varun starts LM, Harsha benched).
  - Updated `M1_SQUADS` to the full 7 starters each + the benched sub. `DEMO_KEY` v23 → v24.
- **Files:** `src/data/demoStore.ts`.
- **Verified live (demo):** m1 Lineups → clean **2-3-1** for both sides, **7 players each, zero empty slots**,
  "2-3-1" formation label, bench = Harsha / Aman. Info → both **✓ XI set**. Goal pickers: Blue shows all 7
  (incl. new Rohit Pillai & Vivek Shenoy); Red shows 6 — correctly excluding subbed-off Varun and
  pending-verification **Aarav** (a minor whose birth-certificate is "pending" — a *pre-existing*, by-design
  eligibility showcase, unchanged by this work). Clock reads a capped "33:19". 84 tests, typecheck, console
  clean.

### 2026-07-30 — Live house football (m1) reads "✓ XI set" · SHIPPED + VERIFIED

m1 (Red vs Blue House football) was the last live match still showing **"XI not set"** on Info — it had a
seeded *lineup* but no *matchSquads* (the same lineup-vs-squad seam fixed for cg7/kc3). Seeded it.

- **What changed:** added `M1_SQUADS` to `demo.matchSquads['m1']`, mirroring `seedLineup`'s fielded XI plus the
  benched player each side already has — Red starters (Neil/Nikhil/Kiran/Varun/Rohan/Aarav) + sub Harsha Bhat;
  Blue starters (Maya/Ishaan/Karan/Faisal/Sameer) + sub Aman Joshi. This matches the seeded 30' substitution
  (Varun → Harsha) and doesn't change the scoring roster (the squad already = every house football player).
  `DEMO_KEY` v22 → v23.
- **Files:** `src/data/demoStore.ts`.
- **Verified live (demo):** m1 Info → both squads **✓ XI set** (captains/vices shown). 84 tests, typecheck,
  console clean. All live matches now read "✓ XI set".
- **Follow-up (now done — see the entry above):** at the time, m1's lineup still fielded 6/5 on the 11-slot
  template (empty pitch slots). That was rebuilt into a clean 7-v-7 (2-3-1) in the next change.

### 2026-07-30 — Live clock: hold at the period end instead of drifting · SHIPPED + VERIFIED

The backlog item flagged repeatedly during the live-match reviews: the header clock counts from
`Date.now() − startedAt` with no cap, and the manual clock never auto-ends a period — so a long-open tab read
absurd values ("Q1 · 65'", "90+7:15" and climbing). Fixed by capping the derived minute at the period's end.

- **What changed:** the pure `currentMinute` in **basketball** (cap at `periodMinutes`, or `overtimeMinutes`
  in OT), **kabaddi** (cap at the half's end), and **football** (cap at `halfBase + stoppage[half]`), plus
  football's seconds display `clockTime` (same cap). The clock now ticks normally through the period, then
  **holds** at regulation-end; in football, signalling added time (the existing `SET_STOPPAGE` "+N" buttons)
  extends the cap to `90+N`, so it stays coherent with real injury time. Cricket is unaffected (its clock is
  overs, replayed from the log). Also caps the minute stamped on any new event, so a basket/goal logged after
  time can't land at "65'".
- **Files:** `src/sports/basketball/index.tsx`, `src/sports/kabaddi/index.tsx`, `src/sports/football/index.tsx`.
- **Verified:** a node check of the exact capped expressions (basketball 65'→10', OT→5'; kabaddi 40'→40';
  football 90'/90+3'; `clockTime` "90:00"/"90+3:00"/"33:20"). **Live:** the kc3 football clock, which had
  drifted past 90+7 earlier, now holds at **90:00** (HMR, no reload); basketball cg7 renders a clean "Q1 · 8'"
  on load and holds at the cap once elapsed passes 10'. 84 tests, typecheck, console all clean. No `DEMO_KEY`
  bump (code-only).
- **Note:** this is the pragmatic display fix (bounded, honest — the scorer still ends/advances the period);
  a full auto-advancing match engine remains a larger, separate follow-up.

### 2026-07-30 — Cup final (kc3) Lineups: named bench · SHIPPED + VERIFIED

Reviewing the Falcons vs City Strikers Lineups tab (after the full-XI expansion): both 4-3-3 pitches rendered
correctly with the right goalscorer/card badges — but the **Bench** section read "No bench listed" for both
teams, odd for a knockout final with rolling subs.

- **What changed:** added 3 named substitutes per club (`p-fal-12..14`, `p-str-12..14`, jerseys 12–14) and
  listed them in `KC3_SQUADS.subs`. The pitch still shows only the XI; the bench now names the subs.
  `DEMO_KEY` v21 → v22.
- **Files:** `src/data/demoStore.ts`.
- **Verified live (demo):** kc3 Lineups → both 4-3-3 XIs on the pitch (Sameer/SK shows goal + yellow, Bharat/BS
  a yellow), and a populated **Bench** — Falcons (pink) Deepak Shenoy / Manoj Verma / Sridhar Hegde, Strikers
  (blue) Nikhil Reddy / Arjun Bhat / Rohan Pai. Legend (Goal/Yellow/Red/2-yellows/Sub in/out) intact. 84
  tests, typecheck, console all clean.
- **Note:** the winger/full-back left–right placement is the football pitch renderer's standard convention
  (same for every football match), not specific to this seed.

### 2026-07-30 — Live cup final (kc3) fielded with full XIs · SHIPPED + VERIFIED

Reviewing the Falcons vs City Strikers Scoring tab: the tab itself was correct (team colours, working Goal
flow, the voice-placeholder fix applied), but the scorer/action pickers only listed **3 Falcons / 2 Strikers**
— the cup final's squads were near-empty next to the full house-match teams. Per the user's call, fleshed
both out to a real 11-a-side.

- **What changed:** added 8 Falcons and 9 City Strikers players (plausible names, jerseys 1–11, no jersey
  clashes), keeping the two existing goalscorers (Rahul Menon, Sameer Khan) up top. Seeded a **4-3-3** lineup
  (`seedCupLineup` via `emptyFormation` + the football `put()` pattern) and matchday squads (`KC3_SQUADS`) for
  `kc3`. New players are auto-verified by the existing eligibility loop, so they're match-eligible. `DEMO_KEY`
  v20 → v21.
- **Files:** `src/data/demoStore.ts` (17 roster rows, `seedCupLineup`, `KC3_SQUADS`, `kc3` in
  `demo.lineups`/`demo.matchSquads`).
- **Verified live (demo):** kc3 Scoring → "Who scored?" now lists all 11 Falcons in XI order; Lineups renders
  a full **4-3-3** for both sides (22 players, initials/number/last name, formation label, Aditya's yellow-card
  badge and Rahul's possession marker intact); Info → both squads **✓ XI set**; voice placeholder reads a real
  player ("Ravi"). Score stayed 1–1 (test goal cancelled). 84 tests, typecheck, console all clean.

### 2026-07-30 — Football voice bar: type-a-command example names a real player · SHIPPED + VERIFIED

Follow-up to the shared-VoiceScorer fix. Football has its own voice bar (not the shared panel), and its
type-a-command box hinted *(e.g. "goal", "Kane", "penalty")* — "Kane" being a stock name no one on the
teamsheet recognises.

- **What changed:** `ScoringControls` now builds the placeholder from a real match player (first home
  starter, else away) — e.g. *(e.g. "goal", "Rohan", "penalty")* — falling back to a name-free example
  *(e.g. "goal", "penalty")* if the roster is somehow empty (never reintroduces "Kane"). The spoken-hint line
  (goal / yellow card / corner / substitution / kick off) is player-agnostic and left as-is; the parser is
  untouched.
- **Files:** `src/sports/football/index.tsx`.
- **Verified live (demo):** Red House vs Blue House Scoring → placeholder reads *(e.g. "goal", "Rohan",
  "penalty")* (Rohan Nair, a Red House player). 84 tests, typecheck, console all clean.

### 2026-07-30 — Voice-scoring hints name a real player from the match · SHIPPED + VERIFIED

Reviewing the basketball Scoring tab: the shared voice panel read *"Say e.g. 'two Kiran', 'three Kiran',
'rebound Kiran'"* — but "Kiran" isn't in the match (a stock placeholder). Every sport using the shared
`VoiceScorer` hardcoded a placeholder name ("Kiran"; football's own bar uses "Kane"), so the example never
matched anyone on the teamsheet.

- **What changed:** introduced a `{name}` token in `voice.hints`; `VoiceScorer` substitutes it with a real
  player from the current match (first home starter, falling back to away, then "a player"). Converted the six
  sports that use the shared panel — basketball, volleyball, tennis, badminton, padel, kabaddi. Display-only:
  the parser already matches names against the actual roster, untouched.
- **Files:** `src/sports/VoiceScorer.tsx` (+ `{name}` substitution) and the six sport plugins' `voice.hints`.
- **Verified live (demo):** cg7 Scoring → *"Say e.g. 'two Tej', 'three Tej', 'rebound Tej'"* (Tej Anand, the
  first IND starter). Also functionally exercised the tab: tapping **Tej Anand → +2** took IND 14 → 16, and
  **Undo** restored 14 — score/roster/undo all correct. 84 tests, typecheck, console all clean.
- **Noted (logged, not fixed):** the header live clock still drifts past the quarter length on a long-open tab
  (perpetual-live demo) — the same backlog item flagged on the Score tab.

### 2026-07-30 — Live basketball (cg7) Info: "✓ XI set" + host/scorer names resolve · SHIPPED + VERIFIED

Reviewing the basketball Info tab surfaced two issues: (1) both matchday squads read **"XI not set"** even
though the match now has a seeded lineup (the court positions and the matchday squad are separate stores —
I'd seeded the lineup last change but not the squad); (2) the **Hosts** row showed a nameless **"🧑 Host"**
and the scorer read a generic **"Assigned scorer · this device"**.

- **What changed:**
  - `demoStore.ts` — added `CG7_SQUADS` (the same starting five as the lineup) to `demo.matchSquads['cg7']`,
    so both teams read "✓ XI set" like the other live matches. `DEMO_KEY` v19 → v20.
  - `LiveScoringScreen.tsx` — `nameOf` only searched the two team rosters, so a host/scorer/manager who
    isn't a squad member (here cg7's host & scorer is p-aarav, the current "you", a Red House player) couldn't
    be named. Broadened `nameOf` to also resolve from all players (one `getPlayers()` fetch). Hosts,
    referees and organizers now show their real name instead of a bare "Host".
- **Files:** `src/data/demoStore.ts`, `src/screens/LiveScoringScreen.tsx`.
- **Verified live (demo):** cg7 Info → Match scorer "🎯 Aarav Mehta · this device" (name now resolves), Hosts
  "🧑 Aarav Mehta" (was "Host"), Matchday squads both "✓ XI set"; the Scoring roster lists the five in squad
  order. 84 tests, typecheck, console all clean.

### 2026-07-30 — Live basketball (cg7) ships a proper lineup on the Score tab · SHIPPED + VERIFIED

Reviewing the live basketball Score tab: play-by-play and box score were correct, but the **Lineups court**
rendered five bare position labels ("PG/SG/SF/PF/C") with no players — the match had no seeded lineup, so
`getLineup` fell back to the sport's blank formation. Every seeded football live match already shows a
populated court, so basketball was the odd one out.

- **Root cause:** `demo.lineups` had no `cg7` entry, and each basketball team only had **4** basketball-eligible
  players in the roster (p-ind-2 Rohan Bhatt / p-kor-2 Deepak Nair were football/volleyball only) while the
  court expects a starting five.
- **Fix:** added `basketball` to Rohan Bhatt & Deepak Nair (the 5th starters), then seeded
  `demo.lineups['cg7']` via a new `seedBasketballLineup()` (uses `courtFormation('basketball')` + the same
  `put()` pattern as football's `seedLineup`): PG = the playmaker (Tej / Vinay), C = the rebounder (Nidhi /
  Priya), etc.
- **Files:** `src/data/demoStore.ts` (2 roster edits, `seedBasketballLineup()`, `cg7` in `demo.lineups`,
  `courtFormation`/`LineupSlot` imports; `DEMO_KEY` v18 → v19).
- **Verified live (demo):** Score → Lineups court shows all 10 players as initials + first names with white
  borders (TA Tej … NR Nidhi / VK Vinay … PS Priya); box score now lists five per team (the two new starters
  0/0/0/0, realistic mid-Q1) with team totals still IND 14 / KOR 11; play-by-play unchanged. 84 tests,
  typecheck, console all clean.
- **Noted (logged, not fixed):** the header live clock read "Q1 · 65'" after the tab sat open a while — the
  known perpetual-live drift (the demo match never advances quarters/ends); it resets to ~Q1 · 10' on reload.
  Left as a backlog item, not a Score-tab defect.

### 2026-07-30 — Scoreboard: 2-digit scores no longer clip to "1…" · SHIPPED + VERIFIED

Reviewing the live basketball Summary surfaced a real layout bug in the shared `Scoreboard`: the header
rendered IND's score as **"1…"** (an orange ellipsis, reading as "1••") instead of **14**, while KOR's "11"
was fine.

- **Root cause:** the `wrap` card uses `alignItems: 'center'`, so its child score `row` shrank to content
  width (~140px) instead of stretching. That squeezed each flex:1 `side` down to ~58px; the home score
  "14" needs 65px (scrollWidth) but its box was 58px (clientWidth), so `overflow:hidden` + `textOverflow:
  ellipsis` clipped it to "1…" (ellipsis inherits the orange score colour). Single digits and the narrower
  "11" happened to fit, which is why only "14" broke.
- **Fix:** `row` gets `alignSelf: 'stretch'` so it spans the full card width; each side now gets ~339px and
  scores render in full. Affects every sport that uses the generic scoreboard (basketball, volleyball,
  kabaddi, tennis, big football/handball totals, …).
- **Files:** `src/components/Scoreboard.tsx`.
- **Verified live (demo):** IND vs KOR header now shows **14 : 11** cleanly; DOM confirms clientWidth ==
  scrollWidth (no clip) and side width 58px → 339px. 84 tests, typecheck, console all clean.

### 2026-07-30 — Notifications feed + profile/discover stat labels pluralize ("1 goal") · SHIPPED + VERIFIED

Follow-up to the generic-Summary fix: the notifications "Recent from players you follow" rows and the
profile/Discover stat summaries share a *second* label map (`stats.ts`, separate from `ratings.ts`) that was
also hard-plural — a single-event line read "1 goals · 1 shots · 1 fouls".

- **What changed:**
  - `stats.ts` — `statLabelShort(key, count?)` is now count-aware (added a `STAT_LABEL_ONE` singular map;
    mass nouns/abbreviations like "pts", "wkts", "open-play" stay invariant; unknown keys still fall back to
    the raw key; calling with no count keeps the old plural for back-compat). `sportSummary` and `headline`
    now pass the count through.
  - `NotificationsScreen.tsx` — the per-match stat line uses `statLabelShort(k, v)` and now also filters
    `v !== 0`, so a "0 assists" counter no longer shows.
  - Added `tests/stat-labels.test.mts` (7 cases) covering both label helpers (`stats.ts` + `ratings.ts`):
    singular/plural, invariants, unknown-key fallback, back-compat, and a `sportSummary` render.
- **Files:** `src/data/stats.ts`, `src/screens/NotificationsScreen.tsx`, `tests/stat-labels.test.mts`.
- **Verified:** Discover → People list renders the shared helper live — e.g. Veer Chauhan's headline pill now
  reads **"1 goal"** (was "1 goals"), while multi-count summaries stay plural ("9 goals", "56 pts", "6 reb").
  Node check mirrors the exact notifications expression (incl. the zero-filter). 84 tests (77 + 7 new),
  typecheck, console all clean.
- **Harness note:** the notifications "Recent from players you follow" section is gated on follow state; the
  player **Follow** control is an RN `Pressable` (not an `<a>`), so the automated DOM-click that drives nav
  links doesn't fire its press handler — I couldn't populate that exact row in the web harness. It works on
  device; coverage is instead pinned by the unit test + the live Discover render of the same helper.

### 2026-07-30 — Generic (football/basketball/…) live Summary reads as provisional + fixes "1 goals" · SHIPPED + VERIFIED

Reviewing the live football Summary surfaced two issues in the shared `MatchSummary` (every non-cricket
sport): (1) a live, in-progress match already crowned a "🏅 Player of the Match" and headed the list
"Player ratings · out of 5" — presenting provisional numbers as final, and inconsistent with cricket's new
live "so far" treatment; (2) every stat detail was hard-plural, so a single event read "1 goals · 1 shots ·
1 fouls".

- **What changed:**
  - `ratings.ts` — added a count-aware `statLabel(stat, count)` (singular for 1, plural otherwise, with an
    invariant set for mass nouns/abbreviations like "on target", "yellow", "pts"). The per-player detail
    builder now uses it, so lines read "1 goal · 2 on target · 2 shots".
  - `MatchSummary.tsx` — while live (`!complete`): the MVP card shows "🔥 Top performer" instead of
    "🏅 Player of the Match", the section reads "Player ratings · so far" with a "final ratings lock when the
    match ends" note; awards use `statLabel` too. Completed matches are unchanged ("Player of the Match",
    "out of 5").
- **Files:** `src/data/ratings.ts`, `src/components/MatchSummary.tsx`.
- **Verified live (demo):** Red House 2–1 Blue House football Summary → "🔥 TOP PERFORMER Aarav Mehta 1 goal ·
  2 on target · 2 shots", "TOP SCORER … 1 goal", "Player ratings · so far" + note; ratings list correctly
  singular/plural ("1 goal", "1 foul", "1 shot" vs "2 shots"). 77 tests, typecheck, console all clean.
- **Noted (related, not touched):** the notifications feed builds its own detail via `statLabelShort` in
  `src/data/stats.ts` with the same hard-plural pattern — a candidate for the same count-aware treatment
  later.

### 2026-07-30 — Cricket Summary shows "standouts so far" while live · SHIPPED + VERIFIED

The cricket Summary tab was a dead end mid-match: a live match showed only a "come back once the match
ends" placeholder, while every other sport's generic `MatchSummary` already renders a live "so far" view
(result line + MVP + ratings). Brought cricket in line.

- **What changed:** `CricketSummary` now branches — before the first ball it keeps the gentle placeholder;
  once play is underway it shows a **LIVE** situation header (`Innings N · RED 78/3 (7.3) · RR 10.40`),
  **Standouts so far** (top performer / top bat / top bowl), and the full **Player ratings · so far** list
  (same podium/stars UI as the final card, labelled "updates every ball — final ratings lock when the match
  ends"). The ratings math (`matchRatings`) already ran off current state, so no engine change was needed.
  Also lifted `useMask()` and the ratings list above the early return to fix a latent hooks-order issue (the
  hook was previously skipped on the not-ended path).
- **Files:** `src/sports/cricket/index.tsx` (live branch + shared `ratingsBlock()` + `sum.liveResult`/`liveTag`
  styles).
- **Verified live (demo):** m8 Summary → LIVE · Innings 1 · RED 78/3 (7.3) · RR 10.40; Top performer Aarav
  Mehta 30 (17), Top bowl Karan Bose 1-16 (1.3); podium ratings list with team-coloured bars. Post-match view
  unchanged. 77 tests, typecheck, console all clean.

### 2026-07-30 — Cricket seeds use only match-eligible players · SHIPPED + VERIFIED

Follow-up to the m8 XI seed: the cricket seeds referenced three deliberately-unverified players
(`VERIFY_BLOCKED = p-farhan, p-tarun, p-gaurav`, kept unverified to showcase eligibility gating), so the
eligibility filter dropped Farhan from Red's "yet to bat" (showed 2 instead of 3) and surfaced blocked
players as Blue bowlers. Reconciled the seeds to use only eligible players.

- **What changed:** added three eligible Blue House cricket players (`p-bh-c1` Karan Bose, `p-bh-c2` Ajay
  Kamath, `p-bh-c3` Vivek Anand) to the roster; swapped Red's `p-farhan` → `p-rh-3` (Nikhil Shetty) and
  Blue's `p-gaurav`/`p-naveen`/`p-tarun` → the three new players in the seed batting/bowling arrays. The
  blocked/pending players stay in the roster (still showcase gating) but no longer appear in any seeded match.
- **Files:** `src/data/cricketSeed.ts` (RED/BLUE arrays + comment), `src/data/demoStore.ts` (new players;
  `DEMO_KEY` v17 → v18).
- **Verified live (demo):** m8 Scorecard "Yet to bat: Manoj Kumar, Deepak Shetty, Nikhil Shetty" (all 3);
  Blue bowlers Karan Bose / Ajay Kamath / Vivek Anand with matching dismissals (c Ajay Kamath b Karan Bose,
  c Rahul Dev b Vivek Anand); Info still shows both squads **✓ XI set**. Engine replay confirms 0 blocked-player
  attributions and 0 blocked squad members across all cricket seeds. 77 tests, typecheck clean, console clean.

### 2026-07-27 — Live cricket (m8) ships a matchday XI ("✓ XI set") · SHIPPED + VERIFIED

Follow-up to the m8 Info review: seeded m8's matchday XI so it reads "✓ XI set" (like the WC football
matches), instead of "XI not set". The XI is the 8 Red / 8 Blue players already in the seeded scorecard,
in batting order (`CRICKET_LIVE_SQUADS` reuses cricketSeed's `RED`/`BLUE` arrays).

- **Files:** `src/data/cricketSeed.ts` (export `CRICKET_LIVE_SQUADS`), `src/data/demoStore.ts` (merge into
  `matchSquads`; `DEMO_KEY` v16 → v17).
- **Verified live (demo):** m8 Info Matchday squads → **Red House ✓ XI set**, **Blue House ✓ XI set** (captains
  shown). Scorecard "Yet to bat" now correctly lists only XI players (Manoj, Deepak) — no more stray
  non-XI "Nikhil Shetty". 77 tests, console clean.
- **Noted (pre-existing, not this task):** the demo intentionally keeps three cricket players **unverified**
  (`VERIFY_BLOCKED = p-farhan, p-tarun, p-gaurav`) to showcase match-eligibility gating. Those players sit in
  the cricket seeds (Farhan in Red's XI; Gaurav/Tarun bowling for Blue in the m8 events), so the eligibility
  filter drops Farhan from "yet to bat" (shows 2, not 3), and two blocked players appear as bowlers. A clean
  reconciliation (use only eligible players in the cricket seeds, or exempt these three) is a broader change
  than the XI seed — flagged for a follow-up.

---

### 2026-07-27 — "Set the XI" reminder no longer nags on live/completed matches · SHIPPED + VERIFIED

The live cricket match (m8) Info tab prompted "🔔 Remind Aarav Mehta to set the XI" while the match was
already live at 78/3 — setting the XI is a *pre-match* task, so nagging mid-innings is incongruous. The
remind button showed on `!set && canManage && matchId` regardless of status. Gated it to pre-kickoff only
(`meta.status !== 'live' && !== 'completed'`); the "XI not set" indicator still shows (informational), just
without the pointless reminder. General fix — applies to any live/completed match without a seeded squad
(m1, m8, cg7, kc3, …).

- **Files:** `src/screens/LiveScoringScreen.tsx`. UI-only, no `DEMO_KEY` bump.
- **Verified live (demo):** m8 Info Matchday squads now read "XI not set · Captain … · Vice …" with **no
  remind button**. (Date "Fri 31 Jul" is today — the anchor day maps to today; not a future date.) Rest of
  the Info tab is correct (format 10 overs · 8-a-side, venue, tournament, scorer Ishaan Verma, hosts). 77 tests, console clean.

---

### 2026-07-27 — Football scorer controls use team kit colours · SHIPPED + VERIFIED

Reviewing the Argentina–Egypt **Scoring** tab: Egypt read **red** in the scoreboard (team colour) but the
scorer controls — Goal/Ball buttons and the possession bar — were **orange** (`theme.colors.away`), because
they used `<Button variant="home"/"away">`, which maps to the app's fixed home/away accents rather than the
team kit. Switched the team-representative controls to the actual team colours.

- Added an optional `color` prop to the shared `Button` (overrides the solid background; `ghost` stays
  transparent). Added `homeColor`/`awayColor` to `ScoringControlsProps`; `LiveScoringScreen` now passes them.
- Football `ScoringControls`: side-picker, Goal, and Ball buttons take `color={hc}`/`color={ac}`; the
  possession bar's fill/track use the team colours too. Generic flow actions (Scored, On target, Back to
  live…) and the ghost Sub buttons are unchanged — they're not home-vs-away team choices.
- Applies to **all** football matches (e.g. Red House's home button is now red, not theme-blue) — a strict
  improvement; no data change, so no `DEMO_KEY` bump.
- **Files:** `src/components/ui.tsx`, `src/sports/types.ts`, `src/screens/LiveScoringScreen.tsx`,
  `src/sports/football/index.tsx`.
- **Verified live (demo):** AE Scoring controls now render Goal/Ball — ARG celeste `#75AADB`, EGY red
  `#CE1126` (measured), and the possession bar is celeste + red — matching the scoreboard. 77 tests, console clean.

---

### 2026-07-27 — WC live matches (BN/PE/AE) start on the anchor day, not a future date · SHIPPED + VERIFIED

The Argentina–Egypt **Info** tab showed **Date "Tue 18 Aug"** — a future date on a match that's live *now*.
Cause: the demo shifts every seed date by `DEMO_DAY_SHIFT` (today − 2026-06-17 = +42d today). England–Croatia
was authored at the anchor `2026-06-17`, so it lands on today; Brazil–Norway/Portugal–Spain/Argentina–Egypt
kept their real WC fixture dates (Jul 5–7), which shift into mid-August. Moved all three to `2026-06-17`
(keeping kick-off times) so a LIVE match reads as today, matching m-eng-cro.

- **Files:** `worldCupBraNorSeed.ts`, `worldCupPorEspSeed.ts`, `worldCupArgEgySeed.ts` (startsAt → anchor day);
  `demoStore.ts` (`DEMO_KEY` v15 → v16).
- **Verified live (demo):** Argentina–Egypt Info Date now reads **"Wed 29 Jul, 21:30"** (today). Rest of the
  Info tab is clean — format 11-a-side, venue Atlanta Stadium, FIFA World Cup 2026, scorer/stream/settings,
  half length, hosts, both matchday squads (XI set, captains Messi & Salah). (Live list also re-sorts these
  matches up, since they now sort by a recent date.) 77 tests, console clean.

---

### 2026-07-27 — WC live seeds: goal/shot credits now all point to starting XI players · SHIPPED + VERIFIED

Reviewing the Argentina–Egypt **Lineups** exposed a data inconsistency in the WC live seeds: Salah's
assist was credited to **Omar Marmoush, who's on Egypt's bench** — a sub can't assist without coming on.
Audited every WC live seed's attributions against its starting XI and fixed all the bench credits:

- **m-arg-egy:** Salah's assist Marmoush (sub) → **Emam Ashour** (p-egy-9, starting CAM).
- **m-bra-nor:** Vinícius's assist Raphinha (sub) → **Bruno Guimarães** (p-bra-7, starting CM).
- **m-eng-cro:** the two shots I'd added for subs — Saka (p-eng-12) → **Madueke** (p-eng-10) and Kramarić
  (p-cro-12) → **Mario Pašalić** (p-cro-10) — both now starters.
- Portugal–Spain was already clean (Ronaldo + Bruno Fernandes both starters); scorers everywhere were fine
  — only these assist/shot credits pointed at subs.
- Each fix updates both the event log **and** the matching stat line. **Files:** `src/data/demoStore.ts`
  (`DEMO_KEY` v14 → v15).
- **Verified live (demo):** Argentina–Egypt Timeline now reads "Goal Salah (assist: Emam Ashour)" and the
  Lineups show **EA Ashour in Egypt's XI** (Marmoush stays benched, uncredited). Lineups otherwise render
  well — both formations, coaches, captains, ⚽ goal-markers on Messi & Salah, benches, legend. 77 tests, console clean.

---

### 2026-07-27 — Football Timeline: team-level fouls no longer read "TEAM (TEAM)" · SHIPPED + VERIFIED

Checking the Argentina–Egypt Timeline surfaced a small rendering bug: a foul with no player attribution
(a team-level tap) rendered as **"Foul ARG (ARG)"** — the team name doubled. `football/Timeline.tsx`'s
`statItem` built the foul detail as `` `${who} (${team})` `` where `who` falls back to the team when
there's no player. Fixed to show just the team when unattributed (`Player on Victim` → `Player (Team)` →
`Team`). Rendering-only (no re-seed / no DEMO_KEY bump); also tidies the team-level fouls in m1, kc3,
m-eng-cro, Brazil–Norway and Portugal–Spain.

- **Files:** `src/sports/football/Timeline.tsx`.
- **Verified live (demo):** Argentina–Egypt Timeline reads 13' Shot Álvarez → 12' Goal Salah (assist
  Marmoush) → **11' Foul ARG** → 10' Shot Salah → 8' Goal Messi (assist Álvarez) → 6' Corner ARG → 4'
  Shot Messi. 77 tests, console clean.

---

### 2026-07-27 — Argentina–Egypt opens 1–1 (Messi & Salah) · SHIPPED + VERIFIED

The fourth WC live tie (m-arg-egy), flagged in the previous entry as still a bare 0–0, now opens on a real
early game too — made it **1–1** for variety (the others are 1–0): Messi opens (assist Álvarez), Salah
equalises (assist Marmoush), plus a shot apiece, a corner, a foul and possession swings.

- Static `score` 0–0 → 1–1 (`worldCupArgEgySeed.ts`); event log + per-player stat lines added.
- **Files:** `src/data/demoStore.ts` (event log + stat lines; `DEMO_KEY` v13 → v14), `src/data/worldCupArgEgySeed.ts`.
- **Verified live (demo):** card reads 1–1; Stats show **Possession 53–47**, Shots 3–2; Summary rates both
  stars **★5.0** (Messi PotM, Salah level) with Álvarez/Marmoush 3.0 for the assists. 77 tests, console clean.
  All **four** WC live ties now present a real in-progress game.

---

### 2026-07-27 — Brazil–Norway & Portugal–Spain open on a real early game · SHIPPED + VERIFIED

The two pre-kickoff WC 0–0s were bare (lineups, no play). Seeded a lively ~12–13' opening for each so
tapping in shows a real early game instead of an empty 0–0:

- **Brazil 1–0 Norway** (m-bra-nor): Vinícius early goal (assist Raphinha), Haaland/Sørloth/Cunha shots, a
  corner, a foul, possession swings → **63–37**, Shots 3–2.
- **Portugal 1–0 Spain** (m-por-esp): Ronaldo goal (assist Bruno Fernandes), Yamal/Oyarzabal shots, corner,
  foul → **60–40**, Shots 2–2.
- Bumped each match's static `score` to `1–0` (in the WC seed files) to match the replay, and seeded
  per-player stat lines so the Summary shows ratings.
- **Files:** `src/data/demoStore.ts` (two event logs + stat lines; `DEMO_KEY` v12 → v13),
  `src/data/worldCupBraNorSeed.ts`, `src/data/worldCupPorEspSeed.ts` (score 0–0 → 1–0).
- **Verified live (demo):** both cards read 1–0; Stats show the possession split + a few shots each;
  Summaries show Player of the Match (Vinícius / Ronaldo) with awards + ratings. 77 tests, console clean.
- **Noted:** the WC group actually has **four** live ties, not three — **Argentina 0–0 Egypt** (m-arg-egy)
  is still a bare pre-kickoff 0–0 (not in this change's scope; same one-liner fix applies if wanted).

---

### 2026-07-27 — WC live spot-check → England–Croatia full stat sheet + possession fix · SHIPPED + VERIFIED

Spot-checked the three World Cup live ties. **Brazil–Norway** and **Portugal–Spain** ship rich lineups but no
event log — they're 0–0 "just kicked off" (empty Stats/Timeline, neutral 50–50 possession) by design.
**England–Croatia** (m-eng-cro, 3–2) had the same two gaps just fixed on kc3: **Possession 100%–0%** (no
POSSESSION events) and a goals-only Stats sheet — though its Summary already worked (seeded stat lines).

- Fleshed the tie out end-to-end (shots, corners, fouls, cards, offsides + possession swings), attributed to
  the real England/Croatia squads (Saka, Gordon, Modrić, Kramarić…). Possession now ≈ **54–46**.
- Updated the six existing m-eng-cro stat lines and added five more so the Summary reconciles with the fuller
  team totals: **Shots 7–7, on target 5–5, corners 3–2, fouls 3–3, yellows 1–2, offsides 1–1**.
- **Files:** `src/data/demoStore.ts` (m-eng-cro event log + stat lines; `DEMO_KEY` v11 → v12).
- **Verified live (demo):** Stats now Possession 54–46 with a full sheet; Summary lists **11 rated players**
  (Kane 5.0 MVP w/ 3 shots, Bellingham/Baturina/Musa 3.5 … booked Modrić/Gvardiol 1.0) + Top-scorer/Playmaker
  awards. 77 tests, console clean. (Brazil–Norway / Portugal–Spain left as-is — pre-kickoff 0–0s.)

---

### 2026-07-27 — Live cup tie (kc3, Falcons vs City Strikers) — full stat sheet + possession fix · SHIPPED + VERIFIED

The live cup tie kc3 (Falcons 1–1 City Strikers, 2nd half, seeded to demo the shootout) had only its two
goals logged, so:

- **Possession read 100%–0%.** Football possession is time-based (accrued ms per side from POSSESSION
  events); with none, home held the ball the whole match. Seeded KICKOFF `possSide` + POSSESSION swings in
  both halves (and gave NEXT_HALF an `at` so the 1st-half segment accrues) for a realistic **54%–46%** split.
  NB: stat events carrying `possSide` mutate possession *without* accruing (no `at`), so the seeded fouls
  deliberately omit `possSide` — the dedicated POSSESSION events own the split.
- **Stats/Timeline were near-empty; Summary had no ratings.** Fleshed the tie out end-to-end — shots (attributed
  to the 3 Falcons + 2 Strikers named players), corners, fouls, two-apiece yellows, offsides across ~80' — and
  seeded matching per-player stat lines. Team totals reconcile: FAL 5 shots/4 on target, STR 5/2, fouls 2–2,
  corners 2–2, yellows 1–2.
- **Files:** `src/data/demoStore.ts` (kc3 event log + kc3 stat lines; `DEMO_KEY` v10 → v11). Used existing
  cup-club players (Rahul Menon, Aditya Shetty, Dinesh Kamath / Sameer Khan, Bharat Singh) — no new records.
- **Verified live (demo):** Stats now Possession 54–46 with a full sheet; Timeline reads 23 events 78'→6';
  Summary shows Player of the Match Rahul Menon and podium ratings (Rahul 5.0, Sameer 3.5, others 1.0 — fouls/
  yellows flooring them, as the −1/−2 weights intend). 77 tests, console clean.

---

### 2026-07-27 — Live basketball (cg7) — box score + Summary ratings · SHIPPED + VERIFIED

Same pair of gaps as the live football match, on the live basketball fixture (cg7, Indiranagar 14–11
Koramangala). Its seed had only SCORE events, so:

- **Box score was points-only** — the PTS column was right (Tej 5, Akash 5, Sahil 4, Vinay 5, Rohit 4,
  Manoj 2) but REB/AST/PF were all zero, and the two bench players sat on 0/0/0/0. Added a `bbStat` helper
  and seeded rebounds/assists/fouls (with real Q1 minutes) so every player contributes and the play-by-play
  interleaves baskets 🏀, rebounds 🔁, assists 🅰️ and fouls 🟨. Nidhi Rao & Priya Shet now book 2 reb + 1 ast each.
- **Summary ratings were empty** — added per-player stat lines for cg7 (same pattern as m1 / England–Croatia),
  reconciling exactly with the box score and the basketball rating weights (`points 1 · rebounds 1.5 ·
  assists 2 · fouls −1`).
- **Files:** `src/data/demoStore.ts` (`bbStat` + cg7 rebound/assist/foul events + cg7 stat lines; `DEMO_KEY`
  v9 → v10).
- **Verified live (demo):** Score tab box score now reads Tej 5/1/1, Akash 5/1, Sahil 4/–/–/1, Nidhi 0/2/1;
  Vinay 5/–/1, Rohit 4/1/–/1, Manoj 2/–/–/1, Priya 0/2/1. Summary shows Player of the Match Tej Anand, the
  Top-scorer/Rebounds/Playmaker awards, and podium ratings for all 8 (🥇 Tej 5.0 … Manoj 2.0). 77 tests, console clean.

---

### 2026-07-27 — Live football (m1) — Timeline minutes + Summary ratings · SHIPPED + VERIFIED

Reviewing the live football match (m1, Red 2–1 Blue) surfaced two gaps against the richer World-Cup live
matches. Its Stats tab (the football "scorecard") was already solid (Shots 5–2, on-target 3–2, Possession
70–30, cards/fouls/corners), but:

- **Timeline: stat events all showed "0'".** The `fbStat` seed helper hard-coded `payload.minute: 0`, and
  the reducer stamps a stat with `payload.minute ?? currentMinute`, so every shot/corner/foul/offside sorted
  to 0' at the bottom while only goals/cards/subs had real minutes. Gave `fbStat` a `minute` and stamped
  each m1 stat event with a realistic minute (11', 15', 16', 22', 25', 28', 31') so they interleave with the
  goals (12/23/33'), cards (20/26') and sub (30'). Team stat totals are unchanged.
- **Summary: player ratings were empty.** Football's Summary reads per-match **stat lines** (a seeded replay
  doesn't create them), so it showed "No individual stats recorded" — whereas the live England–Croatia match
  seeds per-player lines for exactly this. Added the same for m1 (Aarav 1g/2sh, Rohan 1g/2sh/1yc, Neil
  1sh/1foul, Ishaan 1g/2sh/1yc), whose per-player shot totals reconcile to the 5–2 / 3–2 team stats.
- **Files:** `src/data/demoStore.ts` (`fbStat` + m1 events + m1 stat lines; `DEMO_KEY` v8 → v9).
- **Verified live (demo):** m1 Timeline now reads 33' Goal → 31' Shot → 30' Sub → 28' Offside → 26' Yellow →
  25' Foul → 23' Goal → 22' Shot → 20' Yellow → 16' Corner → 15' Shot → 12' Goal → 11' Shot. Summary shows
  Player of the Match & top scorer Aarav Mehta and the **podium ratings** (🥇 Aarav 5.0, 🥈 Ishaan 4.5,
  🥉 Rohan 4.0, Neil 1.0). 77 tests, console clean.

---

### 2026-07-27 — Live cricket fixture (m8) ships a mid-innings scorecard · SHIPPED + VERIFIED

The demo's live cricket match (m8, Red vs Blue) had no event log, so it opened on 0/0 — the live version
of the completed-match gap. Seeded a **mid-innings** ball-by-ball log so it opens on a real in-progress
card, the way the live football m1 shows a mid-game 2–1.

- New `buildLiveInnings` in `cricketSeed.ts` plays Red House ~7.3 overs of a 10-over innings to **78/3**,
  then **stops mid-over** and **pins the current striker/non-striker**. Unlike the completed builder it
  emits a `SET_BOWLER` per over so the live view has a current bowler mid-over. Exported as
  `CRICKET_LIVE_EVENTS` and merged into `demoStore.matchEvents`; `m8.score` set to `{ home: 78, away: 0 }`
  in `mockData.ts` (Blue yet to bat) so the match card shows a score — mirroring m1's static live score,
  and equal to what the seed replays to.
- **Test:** the replay asserts m8 is innings 1, **not ended**, 78/3 off 45 balls, Blue on 0, with a
  distinct not-out striker & non-striker and a bowler set.
- **Files:** `src/data/cricketSeed.ts`, `src/data/demoStore.ts` (`DEMO_KEY` v7 → v8), `src/core/mockData.ts`,
  `tests/cricket-seed.test.mts`. 8/8 seed tests, 77 total.
- **Verified live (demo):** Home card reads "🏏 Red House 78 – 0 Blue House · LIVE"; the match's
  **Scorecard** shows RED 🏏 78/3 (7.3), "This over 6 · 4 · 0", Vikram Rao 27* & Suresh Pillai 4* at the
  crease, three dismissed batters with real credits, "Yet to bat: Manoj Kumar, Deepak Shetty, Nikhil
  Shetty", five bowlers (Gaurav Joshi 1.3 mid-over), and BLU 0/0. Ball-by-ball reads naturally. Console clean.

---

### 2026-07-27 — Cricket seed: smooth the twos-vs-threes balance · SHIPPED + VERIFIED

Reviewing s6's ball-by-ball showed threes slightly out-numbering twos (14 twos / 18 threes across the
match) — the reverse of real cricket, an artifact of the exact-total correction pass nudging some 2s up
to 3s. Fixed two ways: nudged the sampler weights (`p2` 0.16 → 0.18, `p3` 0.06 → 0.035), and added a
sum-preserving rebalance in `makeScores` that trades a three+single for two twos until 2s ≥ 3s. A test
assertion locks it in (`twos ≥ threes` per fixture). After: s6 reads 20 twos / 11 threes; all four
fixtures now have 2s ≥ 3s with singles still the plurality. `DEMO_KEY` v6 → v7. 75/75 tests.

---

### 2026-07-27 — Cricket demo: dial the two 10-over totals down to T10-realistic · SHIPPED + VERIFIED

With the natural run distribution in place, the remaining unreality was the *totals themselves*: 148–132
and 165–150 in 10 overs are ~15–16 RPO, which forces boundary-heavy innings and the odd 300+ strike rate
no matter how the runs are shaped. Dialled the two Annual-Sports-Meet cricket fixtures down to believable
strong-T10 scores (≈11–12 RPO): **ck1 148/132 → 118/104**, **ck2 165/150 → 124/110**. (The 15-over s6/s7
were already fine.)

- Changed in lockstep: the match `score` in `mockData.ts` (shown on cards/results/standings) **and** the
  seed target `runs` in `cricketSeed.ts` (what the ball-by-ball replays to) — they must stay equal or the
  card and the replayed scoreboard diverge. The replay test asserts the seed totals, so a mismatch there
  fails CI.
- **Files:** `src/core/mockData.ts`, `src/data/cricketSeed.ts`, `src/data/demoStore.ts` (`DEMO_KEY` v5 → v6).
- **Verified (engine replay + web reload):** ck1 now 118/5–104/6 (CRR 11.8), ck2 124/5–110/6 (CRR 12.4);
  the marquee knock is now Imran Pasha 37 (20) rather than 64 (26) w/ seven sixes. 75/75 tests; app
  rebundles and loads clean.

---

### 2026-07-27 — Demo fix: completed cricket fixtures now replay to an ENDED scorecard · SHIPPED + VERIFIED

Follow-up to batch 32. A cricket match's state (scorecard, ratings, result) is rebuilt by replaying its
append-only event log through the pure reducer — but the demo's *completed* cricket fixtures shipped **no**
log, so they replayed to the empty initial state (`ended: false`). Every completed cricket match therefore
showed the pre-match Summary placeholder despite reading FINAL — and the batch-32 podium was unreachable in
the demo. (The World Cup football matches show full state precisely because they ship seeded event logs.)

- **Generated ball-by-ball logs** for all four completed cricket fixtures (`ck1`, `ck2`, `s6`, `s7`). New
  `src/data/cricketSeed.ts` deterministically builds a coherent innings log (openers, strike rotation,
  wickets with real dismissals, bowler rotation) that replays — through the *actual* cricket reducer — to
  the exact final total with `ended: true`, a populated batting/bowling card, an MVP and player ratings.
  Only reducer-legal actions are emitted (`SET_STRIKER`/`SET_NONSTRIKER`/`RUNS`/`WICKET`); the reducer
  itself handles the innings switch, target and match end.
- **Engine extraction.** Split the pure core of the cricket plugin (state, `init`, the reducer and its
  helpers) out of the JSX `index.tsx` into `src/sports/cricket/engine.ts` — mirroring kabaddi's `rules.ts`
  and `dls.ts` — so it can be replay-tested under `node --test` (which can't type-strip a `.tsx`).
  `index.tsx` re-imports what it needs; no behaviour change (74/74 tests, typecheck clean).
- **Test guard.** `tests/cricket-seed.test.mts` replays every seed through the real engine and asserts the
  exact totals, wickets, `ended`, balls-per-innings and card size — so a reducer drift or bad script fails
  CI, never the demo. (`allowImportingTsExtensions` enabled + a `.ts` extension on engine's `dls` import so
  Node's test runner resolves it; tsc/bundler + Metro both accept it — verified in the running web build.)
- **Wiring.** `demoStore.matchEvents` seeds `CRICKET_MATCH_EVENTS`; `DEMO_KEY` bumped **v2 → v5** to
  re-seed existing saves (v3 shipped the logs; v4/v5 tuned their run distribution — see below).
- **Natural run distribution (v5).** Getting the shape right took two passes. The first cut hit the
  totals by upgrading singles to sixes (all-boundary innings, no dots); a second, algebraic split then
  over-corrected into a *wall of twos* with zero singles on the high-rate chases. The final `makeScores`
  samples each ball from a weighted menu (0/1/2/3/4/6) whose weights shift toward the boundary as the
  required run rate climbs — but the **single always stays the most common scoring shot** — using a
  seeded LCG for varied-but-reproducible innings, then nudges a few balls up/down the allowed ladder
  (never a 5) to land the exact total. A test guards it: singles out-number 2s and 3s, ≥5 distinct
  outcomes appear. Result: the ball-by-ball and cards read like real cricket — the 15-over games (s6/s7)
  are dot-and-single heavy with SRs ~100–165; the 10-over games (ck1/ck2) are aggressive but properly
  varied (dots, 1s, 2s, 3s, 4s, 6s interspersed). Totals unchanged, so match cards/standings are
  untouched.
- **Files:** `src/data/cricketSeed.ts` (new), `src/sports/cricket/engine.ts` (new), `tests/cricket-seed.test.mts`
  (new), `src/sports/cricket/index.tsx`, `src/data/demoStore.ts`, `tsconfig.json`.
- **Verified live (demo, mobile):** Matches → Completed → Cricket → Red House 148–132 Gold House →
  **Summary** now reads "🏆 Won by 16 runs", Player of the Match Imran Pasha 64 (26), Best Bat / Best Bowl
  (Manoj Kumar 2-20), and the **podium ratings** list with 🥇🥈🥉 on the top three. **Scorecard** shows the
  full card — RED 148/5 (10.0), GLD 132/6 (10.0), real dismissals ("c Vikram Rao b Farhan Khan"), SR, two
  not-out batters, CRR 13.20. Totals match the seed exactly across all four fixtures. Console clean.

---

### 2026-07-27 — UI design pass, batch 32: Cricket Summary — podium ratings (workstream C) · SHIPPED + MECHANISM-VERIFIED

Cricket ships its own richer, state-based Summary (result line, Player-of-the-Match / best-bat /
best-bowl awards, and a runs+wickets player-ratings leaderboard). Batch 31 gave the *generic* Summary
the shared podium language; this brings cricket's own ratings list in line.

- **Podium on the cricket ratings leaderboard.** The numeric rank is replaced with the shared
  `RankBadge` (gold/silver/bronze medals for the top three), and those rows get the same faint podium
  tint used in Standings, the stat-leader rail and the generic Summary — one ranking language across the
  whole app. The per-player rating bar, stars and score are unchanged. The result line (🏆 "… won by N
  wickets") is already winner-first prose, so no score-dimming is needed here.
- **Files:** `src/sports/cricket/index.tsx` (import `RankBadge`/`podiumColor`; podium row tint;
  `RankBadge` in place of the numeric `sum.rank`; removed the now-unused `rank` style).
- **Verification:** typecheck clean; 69/69 tests. The cricket Summary's ratings list lives behind the
  `s.ended` branch, which needs a fully-scored `CricketState` (per-ball batting/bowling). The demo has
  **no** such match — the world-cup seeds are football, and the completed cricket fixtures are
  score-only (`ended: false`), so their Summary correctly shows the "appears once the match ends"
  placeholder (verified live on Red House 148–132 Gold House). The podium treatment is therefore
  mechanism-verified: it reuses the exact `RankBadge`/`podiumColor` pattern shipped and verified live in
  batch 31. (Noted gap: a FINAL cricket fixture whose stored state isn't `ended` shows the pre-match
  placeholder — a demo-seed completeness issue, not a code defect.)

---

### 2026-07-27 — UI design pass, batch 31: Match Summary — podium ratings + winner emphasis (workstream C) · SHIPPED + VERIFIED

The generic post-match Summary (used by football and every sport without its own summary) showed the
result and a "Player ratings" leaderboard, but two of the app's established visual cues were missing
here: the **podium language** used elsewhere for ranked lists, and the **"green = win" results-board**
emphasis used on every other scoreboard.

- **Podium on the ratings leaderboard.** The numeric rank (`1`, `2`, `3`…) is replaced with the shared
  `RankBadge`, and the top-three rows get the same faint podium tint (gold/silver/bronze) used in
  Standings and the stat-leader rail — so the best performers read at a glance and the list speaks the
  same ranking language as the rest of the app.
- **Winner emphasis on the result.** Once a match is **decided** (complete, both scores numeric, not a
  draw), the **loser's score dims** (`opacity 0.45`) so the winner reads first — matching the
  results-board cue applied across SportHub, Calendar, Bracket, Standings and profile history. Draws and
  non-numeric results (pens/shootouts) keep both scores at full strength.
- **Files:** `src/components/MatchSummary.tsx` (import `RankBadge`/`podiumColor`; `decided`/`homeWon`/
  `awayWon` logic; `scoreLost` style; podium row tint; removed the now-unused numeric `rank` style).
- **Verified live (demo, mobile):** RED vs BLU → Summary renders the new "Player ratings · out of 5"
  heading and, for this stat-less live match, the correct `EmptyState` ("No individual stats recorded").
  Console clean. Typecheck clean; 69/69 tests. The podium tint (`players.length > 0`) and loser-dimming
  (`complete && decided`) are conditionally rendered off the verified logic above — the demo's reachable
  Summary is a live, stat-less match, so those two cues are mechanism-verified, consistent with the
  results-board cues shipped in earlier batches.

---

### 2026-07-27 — UI design pass, batch 30: LiveScoring Lineups — goal markers (workstream C) · SHIPPED + VERIFIED

The FIFA-style Lineups pitch marked cards, subs and captains on each player — but not **goal scorers**,
a notable gap for a lineup view.

- **Goal markers.** `deriveMarks` now counts each player's goals from the timeline; a **⚽ badge**
  renders on the scorer's avatar (bottom-right corner, so it never collides with the card/captain/sub
  markers in the other three corners), showing the count for a brace/hat-trick (⚽2). Own goals aren't
  credited to the scorer's badge. Applied on the pitch **and** the bench (a sub who came on and scored),
  and **⚽ Goal** added to the legend.
- **Files:** `src/sports/football/LineupView.tsx`.
- **Verified live (demo, mobile):** RED vs BLU → Lineups shows ⚽ on AM (Mehta, 12'), IV (Verma, 23' —
  alongside his yellow card), and RN (Nair, 33' — with his yellow), with the legend leading "⚽ Goal".
  Console clean. Typecheck clean; 69/69 tests.

---

### 2026-07-27 — UI design pass, batch 29: LiveScoring Stats — comparison bars (workstream C) · SHIPPED + VERIFIED

The football Stats tab was a home-vs-away table of plain numbers; comparing two values row-by-row is
slow to read.

- **Proportional comparison bar per stat** (the FotMob/ESPN pattern). Under each stat's numbers, a thin
  bar splits by each side's share in team colours — 5 shots vs 2 reads as a 5:2 split, 86% vs 14%
  possession as 86:14 — so the balance of play is scannable at a glance. A 0–0 stat shows a neutral
  muted bar (no misleading fill); an untracked stat shows no bar. The existing leading-cell highlight
  is preserved.
- **Files:** `src/sports/football/index.tsx` (`StatRow` + `statBlock`/`bar` styles; row padding moved to
  the block).
- **Verified live (demo, mobile):** RED vs BLU → Stats shows bars matching Shots 5–2, Shots on target
  3–2, Possession 86%–14%, Fouls/Corners 1–0 (full red), Offsides 0–1 (full blue), Yellow 1–1 (50/50),
  and neutral bars for the 0–0 rows; Passes/Pass-accuracy stay "not tracked" with no bar. Console clean.
  Typecheck clean; 69/69 tests.

---

### 2026-07-27 — UI design pass, batch 28: LiveScoring Timeline — the spine (workstream C) · SHIPPED + VERIFIED

The Timeline tab rendered as a flat list of rows with a redundant right-side dot — it didn't actually
*read* as a timeline.

- **Timeline spine.** Each event row now leads with a **continuous left rail + a team-coloured node**,
  so events thread down a vertical spine (red for home, blue for away). The rail line starts/ends at the
  first/last node (no dangling ends). Removed the now-redundant right side-dot. Applied to **both**
  timeline components — the shared `LiveTimeline` (net/raid sports) and football's richer `Timeline`
  (goals, cards, subs, fouls, corners…).
- **Files:** `src/sports/LiveTimeline.tsx`, `src/sports/football/Timeline.tsx`.
- **Verified live (demo, mobile):** RED vs BLU → Timeline shows the coloured spine threading 33' Goal /
  30' Substitution / 26' Yellow card / 23' Goal / 20' Yellow card / 12' Goal / 0' Offside, red/blue
  nodes matching each side, continuous rail. Console clean. Typecheck clean; 69/69 tests.

---

### 2026-07-27 — UI design pass, batch 27: LiveScoring Info tab — a11y (workstream C) · SHIPPED + VERIFIED

The Info tab (match details, scorer, hosts, matchday squads) was already well-structured — the gap was
accessibility: several interactive elements were bare `Text` with `onPress`, so screen readers didn't
announce them as buttons.

- Added `accessibilityRole="button"` (+ descriptive labels) to the **venue** link ("Open {venue} in
  maps"), the **tournament** link ("Open {tournament}"), the per-player **"🚩 Not me — object"** and
  **"⚐ Report"** links, the **"✎ Edit matchday squad"** link, and the **scorer Assign/Change/Close**
  toggle (with `accessibilityState.expanded`). The dispute count strings already verb-agreed
  ("1 dispute" / "N disputes"), so no plural fix needed.
- **Files:** `src/screens/LiveScoringScreen.tsx`.
- **Verified live (demo, mobile):** the RED vs BLU Info tab renders with the anchored date
  "Sun 26 Jul, 09:00 GMT+5:30" (recent + timezone-aware); the accessibility tree now shows the venue
  and tournament links as **buttons** ("Open Kanteerava Stadium in maps", "Open Annual Sports Meet
  2026"). Console clean. Typecheck clean; 69/69 tests.

---

### 2026-07-27 — UI design pass, batch 26: Home tournament card (workstream C) · SHIPPED + VERIFIED

A small Home polish (batch 1 did the scoreboard match cards; batch 6 the header/section hierarchy).

- **Tournament dates on the selected-tournament card.** The card showed name · host · N sports · status
  but never *when* the tournament runs. It now adds the friendly range via `formatDayShort`
  ("Greenwood High School · 7 sports · **23 Jul → 31 Jul**"), consistent with the Organize hub and
  Calendar — and meaningful now that the demo dates are anchored to today.
- **Pluralization.** The sports count used an inline `> 1 ? 's' : ''`; switched to the shared
  `plural()` ("7 sports", and correctly "1 sport").
- **Files:** `src/screens/HomeScreen.tsx`.
- **Verified live (demo, mobile):** selecting the Annual Sports Meet chip shows the card reading
  "Greenwood High School · 7 sports · 23 Jul → 31 Jul" + the "Live now" pill. Console clean. Typecheck
  clean; 69/69 tests.

---

### 2026-07-27 — UI design pass, batch 25: Standings page (workstream C) · SHIPPED + VERIFIED

Deepened the standings table (batch 3 made it a results board; batch 5 gave it the shared podium).

- **Draws (D) column.** The table showed **P / W / L / Pts** but no draws — so a football team with a
  draw had P ≠ W+L, reading as broken. Now a **D** column appears (between W and L) **only when any team
  has drawn** (`hasDraws`), so P = W+D+L for football/cricket while basketball/tennis/etc. stay
  uncluttered. The accessibility label includes "drawn N" when shown.
- **Sport clamp.** `sport` defaulted to `'football'`; a generic open (from the Home-selected tournament)
  could land on a sport the meet doesn't have. Now clamped to `activeSport = sports.includes(sport) ?
  sport : sports[0]` — the same fix as SportHub (batch 14) / Bracket. Used for the table, leaders, chips
  and empty-state copy.
- **Breadcrumb nav title** → the tournament name (was a generic "Standings"); dropped the now-redundant
  in-content subtitle, matching the SportHub pattern.
- **Files:** `src/screens/StandingsScreen.tsx`.
- **Verified live (demo, mobile):** Annual Sports Meet 2026 → Standings shows the nav title, football
  table with the **D column** (Red House P2 W1 D1 L0 Pts3, etc. — P=W+D+L), podium medals/tint, and the
  goals leaders. Console clean. Typecheck clean; 69/69 tests. *(The D-column hides for a no-draw sport —
  same boolean inverted — but the Basketball chip resisted the synthetic tap, so that case is
  mechanism-verified, not eyeballed.)*

---

### 2026-07-27 — UI design pass, batch 24: SportProfile match history — dates (workstream C) · SHIPPED + VERIFIED

Finished the per-sport match history (batch 7 added the win/loss result treatment; batch 11 the stat
hierarchy).

- **Each history row now shows when the match was played.** Rows read "vs {opponent}" + stats +
  WON/LOST but never *when*. Now the match date renders as a subtle muted suffix on the opponent line
  ("vs Green House **· Fri, 24 Jul**"), using the shared `formatDay` (core/dates). The list was already
  sorted most-recent-first (`stats.recent` by date desc), so it now reads as a proper dated timeline —
  and the dates are recent/meaningful thanks to the demo-date anchoring.
- **Files:** `src/screens/SportProfileScreen.tsx`.
- **Verified live (demo, mobile):** Aarav's Basketball history shows "vs Green House · Fri, 24 Jul"
  (LOST) and "vs Gold House · Thu, 23 Jul" (WON, green edge), newest first, dates muted. Console clean.
  Typecheck clean; 69/69 tests.

---

### 2026-07-27 — Demo data: anchor all seed dates to "today" · SHIPPED + VERIFIED

Fixed the demo-date staleness flagged in batch 23. The sample data was authored around a fixed
mid-June 2026 "now", but the demo `today` has since advanced past it — so date-gated views (the
Organize hub, Calendar agenda) drifted empty even though there's plenty of live data.

- **One whole-day shift, applied once at seed build** (`src/data/demoStore.ts`, the single point where
  mockData + the four World-Cup seeds are combined). `anchorDate()` shifts every `'YYYY-MM-DD'` /
  `'…THH:MM:SS'` string by `DEMO_DAY_SHIFT = round((now − 2026-06-17) / 1 day)` — tournaments'
  `startDate`/`endDate`, matches' `startsAt`, and stat-line `date`s. A whole-day shift **preserves
  every relative relationship** (which tournaments overlap, match orderings, how recent the history is);
  it just slides the whole window onto the current day.
- **`DEMO_KEY` bumped `v1` → `v2`** so an existing persisted save is discarded and re-anchored (no
  manual localStorage clear needed).
- Only touches the in-app demo store — `supabase/seed.sql` (the live seed) is unaffected.
- **Files:** `src/data/demoStore.ts`.
- **Verified live (demo, mobile):** Organize hub now lists **live** hosted tournaments (Annual Sports
  Meet "23 Jul → 31 Jul", Karnataka State Cup "25 Jul → 8 Aug") instead of the empty state; the
  Calendar clusters event dots around **today (27 Jul)** and "Today" shows the ongoing meet; the
  reminder badge climbs (matches are now near-term). This also retro-verifies batch 23's Organize-card
  changes (friendly ranges + icon sport pills). Console clean. Typecheck clean; 69/69 tests.

---

### 2026-07-27 — UI design pass, batch 23: Organize hub + shared date util (workstream C) · SHIPPED + VERIFIED

Polished the Organize hub and deduped the friendly-date helpers.

- **New `src/core/dates.ts`** — extracted `formatDay` ("Mon, 27 Jul") + `formatDayShort` ("27 Jul")
  from batch 21's local Calendar copies into one shared, pure module. `CalendarScreen` now imports them
  (removed its two local copies) — re-verified, no regression.
- **Organize hub — friendly dates.** Hosted-tournament cards showed raw ISO (`… · 2026-07-14 →
  2026-07-22`); now `formatDayShort` → "14 Jul → 22 Jul".
- **Organize hub — sport pills.** Cards labelled sports with a capitalised id (`cap('football')` →
  "Football"); now the app-standard `getSport(s).icon + name` ("⚽ Football"), matching Discover /
  Calendar / Tournament. Removed the now-unused `cap`.
- **Files:** `src/core/dates.ts` (new), `src/screens/CalendarScreen.tsx` (refactor),
  `src/screens/OrganizeScreen.tsx`.
- **Verified live (demo, mobile):** Calendar day cells still render "Tue, 14 Jul, has events" via the
  shared util (regression check clean); Organize renders its `EmptyState` cleanly, console clean.
  Typecheck clean; 69/69 tests. *(The hosted-tournament card changes couldn't be eyeballed: the demo
  seed's tournaments all end ~2026-07-22, now past the advanced demo "today" of 2026-07-27, so
  Organize's `statusOf !== 'completed'` filter hides them — see the demo-date-staleness note below.
  Both changes reuse patterns verified elsewhere — shared `formatDayShort` in Calendar; `getSport`
  pills app-wide.)*

> **Follow-up flagged:** the demo tournament seed uses fixed dates (~mid-July 2026) that the advancing
> demo "today" (now 2026-07-27) has moved past, so date-gated views (Organize hub, Calendar "upcoming")
> look emptier than intended. Worth anchoring the demo seed dates relative to today so the demo always
> looks populated. Out of scope for this style pass.

---

### 2026-07-27 — UI design pass, batch 22: Organizer dashboard (workstream C) · SHIPPED + VERIFIED

Polished the organizer command-center screen.

- **Grammar: "needs a scorer".** The count pill read "⏳ 1 need a scorer"; now verb-agrees —
  "1 **needs** a scorer" (singular) vs "N need a scorer" — on both the totals rollup and the per-
  tournament rows.
- **Empty-state consistency.** The top-level "no tournaments" case used a bare `Card` + muted text
  while the in-screen "No fixtures yet" already used the shared **`EmptyState`**; unified it
  (📋 "No tournaments to run yet").
- **No loading flash.** Before data loaded, `hosted` was empty so the rollup briefly rendered zeros;
  added a **`LoadingState`** for the pre-load frame (batch-4 consistency).
- **Files:** `src/screens/OrganizerDashboardScreen.tsx`.
- **Verified live (demo, mobile):** dashboard shows 6 Tournaments / 35 Matches / 54% Scored with the
  "🔴 7 live now" + "⏳ 3 need a scorer" (plural correct) pills and per-tournament progress; console
  clean. Typecheck clean; 69/69 tests. *(The singular "1 needs" and the loading/empty states use the
  same ternary / shared components verified elsewhere — this demo user hosts 6 tournaments, so those
  states weren't reachable here.)*

This completes the workstream-C screen sweep — every user-facing screen has now had a design pass.

---

### 2026-07-27 — UI design pass, batch 21: Calendar page (workstream C) · SHIPPED + VERIFIED

Polished the in-app calendar (month grid + agenda).

- **Friendly dates everywhere.** Headers and rows showed raw ISO (`2026-07-27`). New `formatDay`
  ("Mon, 27 Jul") for the selected-day + agenda-day headers, and `formatDayShort` ("14 Jul") for the
  tournament date ranges → "14 Jul → 22 Jul" instead of "2026-07-14 → 2026-07-22".
- **Results-board language on completed matches.** A finished match row now greens the **winning
  score** (nested Text, same "green = win" cue as SportHub Results / SportProfile history) instead of a
  flat "2–1".
- **a11y.** Day cells gained a descriptive `accessibilityLabel` ("Tue, 14 Jul, has events") +
  `accessibilityState.selected`; the bare-text buttons — month arrows ‹ ›, "Today", "Add to calendar",
  "Add all to calendar" — gained `accessibilityRole="button"` (+ "Previous/Next month" labels).
- **Files:** `src/screens/CalendarScreen.tsx`.
- **Verified live (demo, mobile):** month grid; selecting Sat 18 Jul shows the "Sat, 18 Jul" header and
  tournament rows reading "14 Jul → 22 Jul" / "17 Jun → 19 Jul"; day cells announce friendly labels in
  the a11y tree. Console clean. Typecheck clean; 69/69 tests. *(The completed-match green winner score
  reuses the verified SportHub nested-Text pattern; the past days sampled this session held tournaments
  + an upcoming match, so it wasn't caught on a completed row — mechanism-verified.)*

---

### 2026-07-27 — Demo→live lift: phone-SMS OTP sign-in · SHIPPED (live-only)

The last optional auth variant — SMS codes, the most natural passwordless path since mobile is the
app's primary identity key. **Auth is now feature-complete for launch.**

- **`core/auth.tsx`** — `sendPhoneOtp` (`signInWithOtp({ phone })`, `shouldCreateUser:false`, phone
  `normalizePhone`d) + `verifyPhoneOtp` (`verifyOtp({ phone, type: 'sms' })`). Same session→profile
  success path as the email variant; demo no-ops.
- **`AuthScreen`** — the "Sign in with a code" flow gains an **Email / SMS channel toggle**; picking SMS
  swaps the email field for a mobile field and the button to "Text me a code". Verify branches on the
  chosen channel. `otpChannel` resets to email when the flow/mode changes.
- **Docs:** `backend-readiness.md` §2.7/§3 now read **"auth feature-complete"** (email/password + email
  & SMS OTP + password reset + guardian consent; nothing left to build, only verify-on-staging +
  provider config); `staging-setup.md` step 4 notes SMS needs an SMS provider (Auth → Providers → Phone).
- **Files:** `src/core/auth.tsx`, `src/screens/AuthScreen.tsx`, `docs/backend-readiness.md`,
  `docs/staging-setup.md`.
- **Typecheck clean** (validates the `{phone, type:'sms'}` shapes); **69/69 tests.** *Live-only:* verify
  on staging with an SMS provider configured.

---

### 2026-07-27 — Demo→live lift: passwordless OTP sign-in + password reset · SHIPPED (live-only)

Built the last two app-side auth pieces (readiness §2.7), both via the 6-digit **code** flow — so **no
deep-link redirect handling**, which was the risky part.

- **`core/auth.tsx`** — four new context methods: `sendSignInOtp` (`signInWithOtp`,
  `shouldCreateUser:false` so it only signs in existing accounts), `verifySignInOtp` (`verifyOtp` type
  `email`), `sendPasswordReset` (`resetPasswordForEmail`), `confirmPasswordReset` (`verifyOtp` type
  `recovery` → `updateUser`). On success each fires the existing `onAuthStateChange` → `loadProfile`, so
  the user is signed straight in. Demo mode: all no-op (`return {}`), like `signIn`/`signUp`.
- **`AuthScreen`** — the Sign-in tab gains two sub-flows behind links: **"Email me a code"** (request →
  enter 6-digit code → verify) and **"Forgot password?"** (request → enter code + new password →
  reset). A small `flow`/`sent` state machine + a shared `run()` helper handle busy/error/"code sent"
  notes; "Resend code" / "Use password instead" escape hatches. Sign-up (identity + guardian consent)
  unchanged. `Field` keyboardType widened to allow `number-pad` for the code.
- **Docs:** `backend-readiness.md` §2.7/§3 updated (OTP + reset now built; phone-SMS OTP is the only
  optional remainder); `staging-setup.md` step 4 gains a code-flow smoke test + the `{{ .Token }}`
  email-template requirement.
- **Files:** `src/core/auth.tsx`, `src/screens/AuthScreen.tsx`, `docs/backend-readiness.md`,
  `docs/staging-setup.md`.
- **Typecheck clean** (also validates the Supabase auth call shapes against the SDK types); **69/69
  tests.** *Live-only, not preview-verifiable:* `AuthScreen` mounts only when Supabase is configured —
  verify the round-trips on staging (needs email delivery + `{{ .Token }}` in the templates).

---

### 2026-07-27 — Demo→live lift: staging stand-up runbook · DOC

Wrote the operational runbook for the cutover — the half that needs cloud access + a card (so it's the
user's to run), made concrete so it's a checklist, not a research task.

- **`docs/staging-setup.md` (new):** 10 steps + quick-reference — create the staging project; run
  `schema.sql` → migration 0001 → (staging-only) `seed.sql`; wire `.env.local`
  (`EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY`); flip to live + smoke-test the auth we just built; deploy the
  4 edge functions with the right secrets (service-role auto-injected; Anthropic/Resend for support;
  Expo Push for reminders); schedule the `notify-upcoming` cron (`*/5`); the **thin vertical slice**
  go/no-go (score on A → live on B → non-scorer rejected under RLS); Pro-tier backups+PITR before real
  data; instant **rollback to demo**; and a staging→prod checklist.
- Grounded in the actual repo (env names, the migration filename, the four functions + their exact
  `Deno.env` secrets, the function's own documented cron snippet, the `exp.host` push transport, the
  RLS-on sequencing warning). `backend-readiness.md` §7 now points at it.
- **Files:** `docs/staging-setup.md`, `docs/backend-readiness.md`.

---

### 2026-07-27 — Demo→live lift: guardian-consent capture for under-18 sign-up · SHIPPED (live-only)

Closed the clearest unbuilt auth gap from the readiness audit (§2.7). Re-auditing `core/auth.tsx` +
`AuthScreen` showed the flow is further along than the doc said — email/password sign-in/up, session
hydration + `onAuthStateChange`, profile load, and mandatory mobile/DOB + guardian-contact at sign-up
were all already wired. The one genuinely missing compliance piece was an explicit **guardian consent**.

- **`GuardianContact.consentedAt`** (new optional ISO field) — the compliance artifact for minors. It
  rides in the existing `guardian` jsonb on `profiles`/`players`, so **no schema migration**.
- **AuthScreen (under-18 path):** a required **consent checkbox** — "I am {name}'s parent/guardian and I
  consent to them creating and using a Sportfolio account" — blocks sign-up until ticked
  (`accessibilityRole="checkbox"`), and stamps `guardian.consentedAt = now` on submit. Non-minors
  unaffected.
- **Files:** `src/core/types.ts`, `src/screens/AuthScreen.tsx`. `signUp` already inserts the guardian
  jsonb, so consent persists with no `core/auth.tsx` change.
- **Doc:** `backend-readiness.md` §2.7/§3 corrected — auth is now "partially built" (email/password +
  sessions + guardian-consent done); **remaining auth = email/phone OTP + password reset**, to be built
  and verified against a staging project.
- **Typecheck clean; 69/69 tests.** *Live-only, not preview-verifiable:* `AuthScreen` only mounts when
  Supabase is configured (same as batch 9), so this can't render in the demo; verify on staging.

---

### 2026-07-27 — Demo→live lift: live-path coverage audit + close a demo-only gap · SHIPPED

Advancing the demo→live cutover (launch Track B). The lift is **~90% built** (schema hardened by
migration 0001; `repos.ts` is a complete demo↔live seam) — this pass is *hardening + de-risking*, the
in-repo half. (The operational half — create the Supabase project, Pro-tier backups/PITR, deploy edge
functions + cron, set per-env secrets — needs cloud access + a card and is the user's to run.)

- **Live-path coverage audit (all 82 repo functions).** Verified every mutation actually writes to
  Supabase on the live path (or delegates to one that does) — i.e. nothing silently no-ops or loses data
  once `isSupabaseConfigured` flips true. **Result: no demo-only mutation that loses data against live.**
- **Confirmed §2.6 (compliance-critical):** the four verification mutations are live-wired via
  `updatePlayer` (writes `players.verification`/`guardian` jsonb + verified flags); `getPendingVerifications`
  queries live. Noted one residual: the append-only `verification.history` is read-modify-write on jsonb —
  harden with a server-side atomic append (RPC) before scale.
- **Fixed a demo-only gap: `getLastSquadForTeam`.** Its live branch returned `null`, so "Copy last
  match's XI" would offer nothing once pointed at Supabase. Unified it to compose `getMatches()` +
  `getMatchSquads()` (each already owns the demo↔live split) — works in both modes, no new SQL, demo
  behaviour unchanged. `src/data/repos.ts`.
- **Doc:** `docs/backend-readiness.md` §2.6/§3 ticked; §8 rewritten with the coverage-audit result, the
  two intentional live no-ops (`getLastSquadForTeam` fixed; `markPlayerRegistered` correct-by-design),
  and the still-open items (org-membership + verification-history server enforcement, realtime scope,
  index review, **Real Auth** — the largest remaining in-repo build).
- **Typecheck clean; 69/69 tests.** Demo path unchanged (the refactor composes the same demo data), so
  nothing new to eyeball in the preview; the live path needs a live project to exercise.

---

### 2026-07-27 — UI design pass, batch 20: Cricket batting-order & Lineup editors (workstream C) · SHIPPED (mechanism-verified)

Polished the two lineup editors reached from a live match (cricket batting order; the positional
pitch/court editor for football + court sports).

- **Completion feedback (consistent with MatchSquad's counter).** Both editors now colour their
  count **green when complete**: CricketLineup's "{team} XI — n/N" greens once the XI is full;
  LineupEditor's "Positions" heading gains a "**n/N**" placed-count that greens when every position
  is filled. Same "you're done" cue as the Matchday-squad picker.
- **Form label + a11y.** LineupEditor's "Formation" label now uses the shared **`FieldLabel`** (bold,
  batch 10/18 convention). The bare text links — CricketLineup "Remove", LineupEditor "Clear" — gained
  `accessibilityRole="button"` + descriptive `accessibilityLabel`s so screen readers announce them.
- **Files:** `src/screens/CricketLineupScreen.tsx`, `src/screens/LineupEditorScreen.tsx`.
- **Typecheck clean; 69/69 tests.** _Not pixel-verified this session:_ both editors are behind the
  organizer/scorer **edit** flow (`editSquad` on the live match's squad section), and the demo opened
  the match in **viewer** mode (it showed "Remind … to set the XI" / "Report", not an edit CTA), so
  the editor screens weren't reachable. Changes are minimal, typecheck-clean, and reuse
  already-verified patterns (the green-count mirrors MatchSquad's verified counter; `FieldLabel` per
  batches 10/18). En route the batch-13 Matches plural was re-confirmed ("🔴 Live, 1 match").

---

### 2026-07-27 — UI design pass, batch 19: Match-reminders (NotificationPrefs) (workstream C) · SHIPPED + VERIFIED

Polished the reminder-timers preference screen.

- **Disambiguated the title.** The screen was titled "Notifications" — colliding with the separate
  notification **inbox** (also "Notifications"). Its only entry point is Settings → **Match
  reminders**, so both the nav-bar title and the in-content title now read **"Match reminders"**.
- **Consistent form-group labels.** "Quick add" and "Custom timer" were muted body text; they now
  use the shared **`FieldLabel`** (bold), matching the batch 10/18 form conventions so they stand out
  from the descriptive copy.
- **Digit-only custom input.** The custom-timer number field now strips non-digits on input (like
  the jersey fields), so a stray letter can't slip into the value.
- **Files:** `src/screens/NotificationPrefsScreen.tsx`, `src/navigation/RootNavigator.tsx`.
- **Verified live (demo, mobile):** Settings → Match reminders shows the nav + page title "Match
  reminders", green removable timer chips (1 day / 1 hour / 15 min before), and bold "Quick add" /
  "Custom timer" labels. Console clean. Typecheck clean; 69/69 tests.

---

### 2026-07-27 — UI design pass, batch 18: Edit-profile form (workstream C) · SHIPPED + VERIFIED

Tightened the edit-profile form and fixed a small correctness bug.

- **Fixed a misleading label.** The Parent/Guardian card always read "(optional)", but `save()`
  *requires* a guardian for under-18 players — so a minor saw "(optional)" yet couldn't save. It now
  reads **"· required"** with an accent note ("Required — this player is under 18…") whenever the
  entered DOB is under 18, and stays "(optional)" otherwise.
- **Consistent form-group labels.** The per-sport side-field labels ("Batting", "Bowling arm", etc.)
  and "Teams represented" were muted body text; they now use the shared **`FieldLabel`** (bold), so
  every group label reads as a form label — matching batch 10's form conventions.
- **a11y:** the "+ Add team" text link gained `accessibilityRole="button"`.
- **Files:** `src/screens/EditProfileScreen.tsx`.
- **Verified live (demo, mobile):** Aarav Mehta (16 yrs) → Edit profile shows "👪 Parent / Guardian
  · required" + the accent required note; the Football/Cricket cards show bold "Batting" /
  "Bowling arm" / "Teams represented" labels. Console clean. Typecheck clean; 69/69 tests.

---

### 2026-07-27 — UI design pass, batch 17: Squad & Matchday-squad pages (workstream C) · SHIPPED + VERIFIED

Polished the two squad screens (team roster management + matchday XI picker).

- **Captain / vice indicator → a Pill.** On the manage-squad roster, a player's leadership was a
  cramped inline "  (C)" / "(VC)" in the name text. It's now a proper trailing **Pill** — green
  "★ C" for the captain, an accent "VC" for the vice — matching the app's pill language.
- **Leader-assign buttons are now real buttons for a11y.** "Make captain" / "Make vice-captain" were
  bare `Text` with an `onPress` (screen readers didn't announce them as buttons); added
  `accessibilityRole="button"` + `accessibilityState={{ selected }}`.
- **Correct nav-bar title.** Manage-squad said a generic "Squad"; it now shows the **team name**
  (breadcrumb), matching batches 11–16. (Matchday-squad keeps its descriptive "Matchday Squad".)
- **Pluralization.** Switched the count strings to the shared `plural()` helper — "1 player" not
  "1 players" (manage-squad subtitle; matchday-squad's saved-squad note and the subs counter).
- **Files:** `src/screens/SquadScreen.tsx`, `src/screens/MatchSquadScreen.tsx`.
- **Verified live (demo, mobile):** Red House → Manage squad shows the nav title "Red House",
  subtitle "19 players", and Aarav Mehta's row with the green "★ C" pill + active "★ Captain" button.
  Console clean. Typecheck clean; 69/69 tests. (MatchSquad's two `plural()` swaps are trivial and
  typecheck-clean; not separately pixel-verified this session.)

---

### 2026-07-27 — Fix: knockout bracket wasn't scoped to its tournament · SHIPPED + VERIFIED

**Bug:** the "🏆 Knockout bracket" button on any tournament opened a bracket built from the app's
*default* tournament (`useTournament()` → `demo.tournaments[0]`) — and worse, its teams came from
`useTeamSummaries()` (every team in the app) and its matches from `useMatches()` (every match), so
the bracket **mixed teams from all tournaments**. Opening the World Cup's bracket showed a 20-team
draw with Red/Blue/Gold House, Rovers United and Titan Athletic in it.

**Fix:**
- `Bracket` route now carries `tournamentId`; `TournamentProfile` passes `tournament.id` when opening
  it. (`navigation/types.ts`, `TournamentProfileScreen.tsx`.)
- `BracketScreen` resolves that tournament via `useTournamentById(params.tournamentId)` (falling back
  to `useTournament()` only when no id is supplied, e.g. an old deep link), and now scopes its data
  through `useLeagueData(tournamentId)` — the same tournament-scoped hook SportHub/TournamentProfile
  use. **Participants are the distinct teams in this tournament's matches**; `decide()` only counts
  completed matches within this tournament. The shown sport is clamped to one the tournament has.
- **Files:** `src/navigation/types.ts`, `src/screens/TournamentProfileScreen.tsx`,
  `src/screens/BracketScreen.tsx`.
- **Verified live (demo, mobile):** FIFA World Cup 2026 → Knockout bracket now shows the nav title
  "FIFA World Cup 2026" and **"8 teams"** — Quarter-finals of exactly England/Egypt, Norway/Portugal,
  Croatia/Argentina, Brazil/Spain (no other tournament's teams), Semi-finals TBD. Console clean.
  Typecheck clean; 69/69 tests. (Winner-✓ emphasis still needs a *completed* pairing, which the demo
  seed's live-only WC matches don't yet provide — see batch 16.)

---

### 2026-07-25 — UI design pass, batch 16: Knockout bracket (workstream C) · SHIPPED (mostly verified)

Polished the knockout bracket view.

- **Winner emphasis (results-board language).** A decided real pairing now shows the winner **bold
  with a green ✓** and dims the loser — the same "green = win" language as SportHub Results and the
  SportProfile history. Byes and still-pending pairings stay neutral (a bye is a walkover, not a
  contest, so it gets no emphasis).
- **Fixed the match-card layout.** The "vs" was awkwardly indented with a hard-coded left margin;
  it's now a centred **"VS"** divider between the two slot rows, and slot names flex so a trailing ✓
  aligns right.
- **Gold champion banner.** The 🏆 Champion banner now uses the shared podium **gold** (`PODIUM[0]`)
  tint + border + text, tying it to the medal language used in Standings/leaderboards (was plain
  green on surfaceAlt).
- **Correct nav-bar title** → the tournament name (breadcrumb), matching batches 11–15.
- **Files:** `src/screens/BracketScreen.tsx` (imports shared `PODIUM` from `components/Rank`).
- **Verified live (demo, mobile):** Annual Sports Meet 2026 → Football bracket shows the nav title
  "Annual Sports Meet 2026", "Knockout bracket · 20 teams", the centred "VS" layout, bold real teams
  and muted BYEs, colour dots. Console clean. Typecheck clean; 69/69 tests.
  _Not pixel-verified:_ the winner-✓/dimmed-loser emphasis and the gold champion banner — **no demo
  bracket pairing currently coincides with a completed match** (all are byes or unplayed seeded
  pairings; the live World Cup matches aren't `completed`), so `decide()` returns no winner in demo.
  Both reuse the already-verified green=win + `PODIUM` gold patterns and typecheck clean.
  _Pre-existing quirk noted:_ the bracket reads the app's selected tournament (`useTournament()`), so
  the "Knockout bracket" button on a different tournament's page still shows the selected one — out
  of scope for this style pass.

---

### 2026-07-25 — UI design pass, batch 15: Notifications inbox (workstream C) · SHIPPED + VERIFIED

Polished the in-app notification inbox (live alerts + a roll-up of recent activity from players you
follow).

- **Fixed a doubled emoji.** Alert rows hardcoded a "🔔" prefix, but notification titles already
  carry their own emoji — so they rendered "🔔 🎂 You're 18 …". Now each row leads with a round
  **icon badge** showing the title's own emoji (extracted via `splitLeadingEmoji`, 🔔 fallback), and
  the title text is clean. Timestamps moved to a small muted style.
- **"Recent from players you follow" reads as results.** These rows are match-history lines but were
  rendered flat with raw stat keys ("raidPoints") and a lowercase "· won". Now they use the same
  **results-board language** as the SportProfile history — a green left-edge + a green **WON** pill
  (muted **LOST**), a leading sport-icon badge, and **readable stat labels** via a new shared
  `statLabelShort()` helper (exported from `data/stats.ts`, reusing its existing `STAT_LABEL` map).
- **Files:** `src/screens/NotificationsScreen.tsx`, `src/data/stats.ts` (export `statLabelShort`).
- **Verified live (demo, mobile):** Live alerts show the 🎂 badge with clean titles + "3m ago";
  after following a player, "Recent from players you follow" shows their matches across football /
  cricket / basketball with green-edged WON rows (green pill) and muted LOST rows, readable stats
  (54 runs · 0 wkts, 18 pts · 5 reb). Console clean. Typecheck clean; 69/69 tests.

---

### 2026-07-25 — UI design pass, batch 14: SportHub page (workstream C) · SHIPPED + VERIFIED

Polished the per-sport tournament hub (schedule, standings, stats, results).

- **Results read as results.** The completed-match rows were flat (team · score · team, all one
  colour). Now the **winner's name is bold and their score is green**, the loser stays muted, and a
  draw gets no emphasis — the same "green = win" language used in Standings, SportProfile history and
  MatchCard.
- **Correct nav-bar title.** SportHub said a generic "Sport"; it now titles the header with the
  **tournament name** (breadcrumb ⟨ Annual Sports Meet 2026 → the in-content title carries the
  sport), matching the batch 11–12 profile fixes.
- **Statistics block guarded.** The "📊 Statistics / Swipe for more leaderboards →" header + rail
  rendered even with zero leaderboards; it's now shown only when there are stat categories
  (empty-state hygiene, consistent with batch 4).
- **Files:** `src/screens/SportHubScreen.tsx`.
- **Verified live (demo, mobile):** Annual Sports Meet 2026 → Football hub shows the nav title
  "Annual Sports Meet 2026", Results with "**Red House** 3–1 Blue House" (bold + green winner) and a
  neutral "Red House 1–1 Green House" draw, and the Goals/Assists leaderboards. Console clean.
  Typecheck clean; 69/69 tests.

---

### 2026-07-25 — UI design pass, batch 13: Matches & Discover pages (workstream C) · SHIPPED + VERIFIED

Polished the two high-traffic browse tabs.

- **Matches tab counts.** The Live / Upcoming / Completed segmented control showed no numbers, so
  the organizer couldn't see the load at a glance. Each tab now shows its count (e.g. "🔴 Live 8 ·
  Upcoming 12 · Completed 31"), matching the tournament page's match tabs. Counts respect the sport
  filter (Football → "Live 6 · Upcoming 3 · Completed 17") and each has a full accessibility label
  ("🔴 Live, 8 matches").
- **Unified the filter chips.** Matches used a bespoke local `Chip`; it now uses the shared
  `SelectChip` like every other filter row (Discover, tournament, SportHub), so the sport filter
  looks identical app-wide. Removed the one-off component + its styles.
- **Discover pluralization.** The "N players" line used an inline plural; switched to the shared
  `plural()` helper (batch 11), so a single result reads "1 player".
- **Files:** `src/screens/MatchesScreen.tsx`, `src/screens/DiscoverScreen.tsx`.
- **Verified live (demo, mobile 375px):** Matches shows the three counts and they update when the
  Football filter is applied; the sport chips render in the shared style; Discover → People shows
  "318 players · ranked by activity". Console clean. Typecheck clean; 69/69 tests.

---

### 2026-07-25 — UI design pass, batch 12: Team & Tournament profiles depth (workstream C) · SHIPPED + VERIFIED

A second, deeper pass on the two profile pages (batch 5 did the shared podium + team crest).

- **Team profile gets a headline record.** The team page listed per-sport records but had no
  at-a-glance summary. Added a **Played / Won / Win-rate** tile row (aggregated across every sport),
  the same treatment players have — so the two profile types now read alike. The per-sport list is
  retitled **"Record by sport"** beneath it.
- **Correct nav-bar titles.** TeamProfile said a generic "Team", TournamentProfile said
  "Tournament". Both now set the header to the entity's name (breadcrumb), matching batch 11's
  Player/Sport fix (same `nav.setOptions({ title })` mechanism).
- **Files:** `src/screens/TeamProfileScreen.tsx`, `src/screens/TournamentProfileScreen.tsx`.
- **Verified live (demo, mobile 375px):** Green House team page shows the nav title "Green House",
  the headline **9 Played / 4 Won / 44% Win rate** (= its four sports' records summed), and the
  "Record by sport" breakdown; console clean. Typecheck clean; 69/69 tests.
  _Caveat:_ the Tournament page couldn't be re-opened this session — the browser pane's tab bar and
  tournament chips stopped responding to synthetic clicks and deep-links reset to Home, so every
  path to it was blocked. Its nav-title change is the identical, just-verified mechanism.

---

### 2026-07-25 — UI design pass, batch 11: Player & SportProfile depth (workstream C) · SHIPPED + VERIFIED

A second, deeper pass on the profile pages (batch 7 did the avatar ring + win/loss history).

- **Stat hierarchy on SportProfile.** The per-sport page rendered the *record* (Matches / Wins /
  Win rate) and every *counting total* (Goals, Assists, Shots…) as identical loud-green tiles, so
  the eye couldn't tell "how they did" from "what they tallied". Now the record stays green as the
  headline, and the counting stats sit under a **"TOTALS · THIS SPORT"** label with neutral-white
  numbers — a clear second tier. Partial-coverage clouds (☁) preserved.
- **Correct nav-bar titles.** SportProfile's header said a generic "Sport"; PlayerProfile said
  "Player". Both now set the header to the **player's name** (breadcrumb: ⟨ Aarav Mehta), and the
  now-redundant in-content subtitle on SportProfile was dropped (the big "⚽ Football" title stays).
- **Grammar: pluralization.** Added a tiny `plural(n, singular, plural?)` helper to `ui.tsx` and
  used it on the profile's by-sport line, so single-match sports read "**1 match · 1 win**" instead
  of "1 matches · 1 wins".
- **Files:** `src/components/ui.tsx` (new `plural`), `src/components/ProfileView.tsx`,
  `src/screens/SportProfileScreen.tsx`, `src/screens/PlayerProfileScreen.tsx`.
- **Verified live (demo, mobile 375px):** Aarav's profile shows "1 match · 1 win" for Badminton &
  Tennis; his Football SportProfile shows the green record row, the "TOTALS · THIS SPORT" divider,
  white counting tiles with coverage clouds, and the nav bar titled "Aarav Mehta". Typecheck clean;
  69/69 tests; console clean.

---

### 2026-07-25 — Onboarding content (D): wire the long-form guides into the app · SHIPPED + VERIFIED

The Help centre only served the short KB stubs; the fuller articles lived only in
`docs/`. Brought them in-app so a reader can go deeper without leaving the app (there's
no web host to link out to).

- **`src/data/supportGuides.ts` (new):** the canonical **in-app** long-form copy, keyed
  by the same article id as `supportKB.ts`. Covers all 18 KB topics. The `docs/onboarding/
  articles/*.md` set remains the publishing copy (blog / YouTube descriptions); this is
  what the app renders. `getGuide(id)` / `hasGuide(id)` accessors.
- **`src/components/Markdown.tsx` (new):** a tiny, dependency-free renderer for the small
  markdown subset the help copy uses — `##`/`###` headings, `-` bullets, `1.` numbered
  steps, `**bold**` inline. No lib added. Grouping is robust: a stray intro line above a
  list renders as its own paragraph (fixes the old stub renderer leaking literal "- ").
- **`src/screens/SupportScreen.tsx`:** every article now renders through `Markdown`; any
  article with a guide shows a **"📖 Read the full guide"** reveal under the short answer
  (toggles to "▴ Show less"). AI-answer rendering also moved to `Markdown`. Removed the
  bespoke `ArticleBody` renderer.
- **Tests:** +4 in `support-kb.test.mts` — guides map only to real articles (no orphans),
  `getGuide`/`hasGuide` agree and return substantial content, each guide is ≥ its stub,
  every category has at least one full guide. **69/69 pass, typecheck clean.**
- **Verified live (demo, mobile 375px):** Settings → Help & support → search "run a
  tournament" → "Create a tournament" shows the short answer + "📖 Read the full guide";
  tapping it reveals the long-form (bold, "Steps" heading, green numbered 1–4, closing
  paragraph) and flips to "Show less". Console clean.

---

### 2026-07-25 — Onboarding content (workstream D): 9 video scripts + full article set · SHIPPED

New-user content for the in-app Help section and a future YouTube channel, built from
one source of truth (`src/data/supportKB.ts`) so app, articles and videos stay
consistent. Lives under `docs/onboarding/` (`README.md` = content plan + status +
house style).

- **Video scripts (9/9):** `docs/onboarding/scripts/01…09`. Shot-by-shot (visual +
  voiceover table) so each can be recorded from a screen capture with a VO, plus a
  YouTube title/description/thumbnail per episode. Ordered by the new-user journey:
  what-is → score → undo/offline → **run a tournament (3-min flagship)** → squad →
  format → follow/reminders → Discover → profile/stats/verification. Every step
  checked against the real app; features not built are flagged, not scripted.
- **Long-form articles (all 18 KB topics):** `docs/onboarding/articles/` — six
  category guides (`getting-started`, `live-scoring`, `running-a-tournament`,
  `teams-and-players`, `following-and-alerts`, `account-and-profile`). Each KB id in
  `supportKB.ts` maps to a full section; README carries the article→KB coverage map.
  Fuller than the built-in KB stubs (intro + numbered steps + tips/edge cases +
  related links), same vocabulary (organizer/scorer, match, tournament, fixtures,
  squad).
- **Files:** `docs/onboarding/**` only — no app code touched; typecheck/tests
  unaffected (65/65). Content verified for accuracy against the demo app's screens
  and flows.
- **Next (publishing):** record + publish videos to YouTube; once an in-app video
  layer ships, embed each URL in the matching KB article.

---

### 2026-07-25 — Discover: fix nested-`<button>` DOM warning

- **What:** RN-web logged "`<button>` cannot contain a nested button" on the Discover
  **People** sub-tab. Cause: each Teams row was a `TouchableOpacity` (open-team) wrapping
  an inner `TouchableOpacity` (Follow) — RN-web renders both as `<button>`, so one nested
  in the other. Pre-existing; correctness/cleanliness only.
- **Fix** (`src/screens/DiscoverScreen.tsx`): the row is now a plain `Card` (View) with two
  **sibling** pressables — a `teamOpen` `TouchableOpacity` (dot + name/sports → navigates to
  Team) and the Follow `TouchableOpacity`. Added `st.teamOpen` (flex:1 row) to keep the
  layout identical. Player cards, Open-tournament rows, and all ConnectBoard rows were
  already fine (`Card`/`Pill` are plain Views).
- **Verified** (web demo, port 8097): DOM query → `0` nested `<button>`; console clean of the
  warning on both Connect and People sub-tabs; Follow toggles to ★ Following and the row-open
  navigates to the Team profile (which shows the persisted Following state).
- **Connect sub-tab re-verified** (the fix's sibling concern): renders fully — mode toggle,
  "Post a listing", kind + sport filter chips, and listing cards (WhatsApp action, phone,
  verified/unverified contact, timestamp); `0` nested `<button>` (55 buttons, 4 WhatsApp),
  no console errors, and the kind filter (e.g. "Opponent wanted") narrows the list correctly.

---

## Real-game demo matches (for live-scoring test drives)

Seeded under the **FIFA World Cup 2026** tournament (`t-wc`), all live, with the demo
user (`p-aarav`) as host + assigned scorer. Predicted lineups get corrected from the
official teamsheet once it's published.

| Match | id | File | Formation | Notes |
|---|---|---|---|---|
| England vs Croatia | `m-eng-cro` | `worldCupSeed.ts` | ENG 4-2-3-1 / CRO 3-4-2-1 | original seed; live at 3–2, continues |
| Brazil vs Norway | `m-bra-nor` | `worldCupBraNorSeed.ts` | both 4-1-2-3 | R16 (5 Jul); official numbers + captains (Marquinhos/Ødegaard) |
| Portugal vs Spain | `m-por-esp` | `worldCupPorEspSeed.ts` | POR 4-2-3-1 / ESP 4-1-2-3 | R16 (6 Jul, Dallas); **official teamsheet** — numbers, XIs (Félix starts; Porro+Olmo for Spain) + 15-man benches; captains Ronaldo/Rodri |
| Argentina vs Egypt | `m-arg-egy` | `worldCupArgEgySeed.ts` | ARG 4-1-3-2 / EGY 4-2-3-1 | R16 (7 Jul); teamsheet from screenshots — XIs + benches (ARG 15, EGY 13), captains Messi/Salah, coaches Scaloni/Hossam Hassan. Added the **4-1-3-2** formation template. Egypt GK #16 = Mahdy Soliman; R16 Match 95, Atlanta Stadium, KO 21:30 |

To score: open the match card → **Scoring** tab → **Start the match** → **Kick off**
(use the "current match minute" field if joining late).

---

## Changelog

### 2026-07-25 — Support system, phase 2: live AI + server email (workstream A) · CODE-COMPLETE (deploy-gated)

Wrote all the phase-2 server + client code so the AI-answer and server-email layers turn on the
moment the backend is stood up and the keys are added — no app rebuild, no endpoint URLs to paste.
The Anthropic key never ships in the app (same server-proxy principle as `voiceLLM`).

- **`supabase/functions/support-assistant` (new, Deno).** Forwards a question + the matched KB
  article text to Claude (`claude-opus-4-8`, per the API skill's default; haiku noted as a cheaper
  swap) and returns `{ answer, resolved }` via **structured output** (json_schema) so the client
  always gets a valid shape. System prompt grounds it strictly in the provided context — if the
  docs don't cover it, `resolved:false` and "a human will follow up". CORS + graceful 502 so the
  client falls back to the KB on any failure.
- **`supabase/functions/support-escalate` (new, Deno).** Records the case in a new `support_cases`
  table (service role) **and** emails a copy to `SUPPORT_EMAIL` via Resend. If `RESEND_API_KEY`
  isn't set it still records the case and returns `delivered:false` (client then opens the mailto).
- **`support_cases` table + RLS** in `supabase/schema.sql` (signed-in users can file; reads/updates
  are support-only via service role).
- **Client wiring, all degrading to demo:** `core/supportAI.ts` now calls
  `supabase.functions.invoke('support-assistant')` (enabled ⇔ Supabase configured); `data/repos.ts`
  gains `submitSupportCase()` → `support-escalate`; `SupportScreen` escalation tries the server
  first and shows "✅ Sent to support", falling back to the pre-filled email when not delivered.
- **`docs/support-setup.md` (new)** — the step-by-step you asked to be guided through: get a Claude
  API key (Anthropic Console + billing), get an email sender (Resend), `supabase secrets set …`,
  and `supabase functions deploy …`. Notes the Supabase-live prerequisite and how to swap the
  email provider or model.
- **Files:** `supabase/functions/support-assistant/index.ts`, `supabase/functions/support-escalate/index.ts`
  (new), `supabase/schema.sql`, `src/core/supportAI.ts`, `src/data/repos.ts`,
  `src/screens/SupportScreen.tsx`, `docs/support-setup.md` (new).
- **Status:** typecheck clean; 65/65 tests; app bundles with no console errors; demo behaviour
  unchanged (KB + mailto). The edge functions can't run in demo (no Supabase) and aren't unit-tested
  here — they're deploy-time code like the existing `notify-*` functions. Turns live via the guide.

### 2026-07-25 — UI design pass, batch 10: create/edit forms (workstream C) · SHIPPED + VERIFIED

The forms already shared the input components, but read as flat field stacks: field-group labels were
the same muted grey as hints, and validation errors were bare red text. Two shared primitives fix it
everywhere.

- **`FieldLabel` (new, in `ui.tsx`).** A proper form label — text-colour, bold, small — so labels
  stand out from italic hints/descriptions. Applied to the field groups in CreateTournament,
  ScheduleMatch, CreateCommunity and CreateListing.
- **`FormError` (new, in `ui.tsx`).** A red-tinted, bordered, `alert`-role banner (⚠ + message)
  replacing the bare `<Text>` error across **all eight forms** — CreateTournament, ScheduleMatch,
  EditProfile, CreateCommunity, CreateListing, Auth, GenerateFixtures, JoinTeam, Teams. Each screen's
  local `error` style was removed. (OrganizationScreen already had its own error card — left as-is.)
- **`TextField` label unified.** Its internal label now uses the same bold `FieldLabel` style (and
  renders nothing when the label is empty, e.g. bare search boxes), so input labels match the
  standalone group labels app-wide.
- **Files:** `src/components/ui.tsx` + the nine form screens above + DEVLOG.
- **Verified live (demo, mobile):** New Tournament shows bold field labels distinct from italic
  hints, the bold "Name" TextField label matches, and submitting empty renders the ⚠ FormError
  banner ("Give the tournament a name.") above the button; console clean. Typecheck clean; 65/65
  tests. The other forms use the same shared primitives.

### 2026-07-25 — UI design pass, batch 9: Auth screen (workstream C) · SHIPPED (not live-verifiable in demo)

Brought the sign-in / create-account screen — the app's first impression in live mode — onto the
design system. It was using one-off local components and a plain logo.

- **Branded wordmark.** "🏅 Sportfolio" → two-tone "🏅 Sport" + pitch-green "folio", centred with
  the tagline, matching the Home header.
- **Design-system components.** The custom `Tab` pills (sign-in/create toggle AND the role picker)
  are replaced with the shared `SelectChip` — consistent styling + built-in selected-state
  accessibility. The `Tab` component and its orphan styles were removed.
- **Form in a Card.** The floating fields are now grouped in an elevated `Card`, giving the auth
  form structure and depth instead of sitting loose on the background.
- Kept the local `Field` input (the shared `TextField` doesn't yet support `secure`/`keyboardType`);
  a future reusability pass could fold it in.
- **Files:** `src/screens/AuthScreen.tsx`.
- **Verification caveat:** `AuthScreen` only mounts when Supabase is configured (live mode); in the
  demo the user is auto-signed-in, so this screen **cannot be viewed on port 8091**. This batch is
  therefore typecheck-verified (clean) with 65/65 tests, and built entirely from components already
  verified live elsewhere (two-tone wordmark, SelectChip, Card, Button) — but it was **not**
  screenshot-verified like the other batches. Worth a visual check once a Supabase env is wired.

### 2026-07-25 — UI design pass, batch 8: Organize hub (workstream C) · SHIPPED + VERIFIED

Tidied the organizer's landing screen. Style/structure only.

- **Action hierarchy.** The primary "🏆 New tournament" (green) sat *below* the "Organizer
  dashboard" ghost button. Reordered so the main create action leads, then "🤝 Start a friendly",
  then "📊 Organizer dashboard" — primary-first.
- **Empty state.** "Tournaments you're hosting" was a bare `Card` of muted text (it slipped through
  the batch-4 sweep — its wording didn't match the grep). Now uses the shared `EmptyState`
  (🏆 + "You're not hosting any tournaments" + hint), matching the app-wide pattern.
- **Files:** `src/screens/OrganizeScreen.tsx`.
- **Verified live (demo, mobile):** New tournament leads; hosting empty state shows the shared
  card; console clean; typecheck clean; 65/65 tests.

_Also this session: confirmed the Discover nested-`<button>` fix is genuinely in the branch
(landed in `b331dae`) and verified it in a fresh browser tab — teams render with sibling Follow
buttons, 0 nested buttons, console clean. The earlier persistent warning was stale console buffer
in a long-open tab. The background "Fix nested-button warning on Discover" session was archived._

### 2026-07-25 — UI design pass, batch 7: Player & SportProfile pages (workstream C) · SHIPPED + VERIFIED

Extended the identity + results-board language to the player pages. Style-only.

- **Player avatar ring.** The avatar (in the shared `ProfileView`, used by the Profile tab and the
  PlayerProfile screen) is now ringed in the player's house colour — matching the team-crest
  identity treatment from batch 5, instead of a borderless circle.
- **SportProfile match history reads as results.** Every row looked identical; now a win shows a
  green left-edge accent + a green-tinted "WON" pill, a loss stays muted — so a player's form is
  scannable at a glance (green edges = wins), consistent with the standings/scoreboard language.
- **Files:** `src/components/ProfileView.tsx`, `src/screens/SportProfileScreen.tsx`.
- **Verified live (demo, mobile 375px):** Aarav Mehta's profile shows the red house-colour ring on
  the "AM" avatar; his Football SportProfile shows green-edged WON rows and a muted LOST row (vs
  Green House). Typecheck clean; 65/65 tests.

### 2026-07-25 — UI design pass, batch 6: Home header & section hierarchy (workstream C) · SHIPPED + VERIFIED

Polished the top of the app and made its section headers consistent.

- **Branded wordmark.** "Sportfolio" is now two-tone — white "Sport" + pitch-green "folio" — giving
  the header real product identity instead of plain white text.
- **Header layout.** Aligned the header to the top and let the full tagline show; a brief
  `numberOfLines={1}` experiment truncated it to "Your sporting world, …" which read as broken, so
  the established tagline stays intact with the icon row aligned top-right.
- **Consistent section headers.** "🎯 Explore a sport" was a raw `<Text h3>` with its own spacing;
  it now uses the shared `SectionHeader` like "🔴 Live now" and "📅 Up next", so all three sections
  share one title style and top-margin rhythm.
- **Files:** `src/screens/HomeScreen.tsx` only.
- **Verified live (demo, mobile 375px):** the two-tone wordmark renders; the tagline shows in full
  with icons aligned beside it; "Explore a sport" matches the other section headers. Typecheck
  clean; 65/65 tests.

### 2026-07-25 — UI design pass, batch 5: Tournament & Team profiles (workstream C) · SHIPPED + VERIFIED

Brought the two high-traffic profile pages into the design language. The big win was consistency:
three different standings tables across the app now render identically.

- **Shared podium (`components/Rank.tsx`).** Extracted the medal/tier logic batch 3 put inline in
  Standings into a shared `RankBadge` + `podiumColor`, so every standings table has one source of
  truth. Standings was refactored onto it (removing its local copy).
- **`LeagueTable` gets the podium** — medals 🥇🥈🥉, gold/silver/bronze tinted rows, bold leader.
  Because it's the shared table, this propagates to the tournament per-sport standings AND SportHub
  in one change.
- **Tournament "Overall standings"** (a hand-rolled table) now uses the same `RankBadge` + podium
  tint, so the cross-sport table matches the per-sport one right below it.
- **Team profile crest** now shows the team's initials in its colour (e.g. "GH" for Green House)
  with elevation, instead of a bare dot — real identity at the top of the page.
- **Files:** `components/Rank.tsx` (new), `components/LeagueTable.tsx`, `screens/StandingsScreen.tsx`
  (dedup), `screens/TournamentProfileScreen.tsx`, `screens/TeamProfileScreen.tsx`.
- **Verified live (demo, mobile 375px):** Annual Sports Meet 2026 → Overall standings shows Green
  House 🥇/Red 🥈/Blue 🥉/Gold #4; By-sport Football LeagueTable shows the same podium; Green House
  team page shows the "GH" crest, elevated Record cards and squad. Typecheck clean; 65/65 tests.
  (The nested-`<button>` console warning is the pre-existing Discover one, tracked separately.)

### 2026-07-25 — UI design pass, batch 4: empty & loading states app-wide (workstream C) · SHIPPED + VERIFIED

Across the app, "nothing here yet" was a lone grey sentence — which reads as broken, not empty.
Made one shared component and swept every list.

- **Shared `EmptyState`** (`components/ui.tsx`, sits next to `LoadingState`): an icon, a primary
  line, and an optional hint about when the section will fill in; a `compact` variant for use inside
  cards/tables. Standings' local copy was removed in favour of it.
- **Swept ~30 sites** across ~20 files to the shared component with a contextual icon + hint:
  Matches (live/upcoming/completed), Home (both live & upcoming sections), Notifications, Calendar
  (day + agenda), Discover players, SportHub schedule, Team/Squad/MatchSquad/CricketLineup/
  LineupEditor squads, Tournament matches, OrganizerDashboard fixtures, SportProfile stats,
  TryNewSport, GenerateFixtures, MatchSummary player ratings, the whole-profile "not found" state,
  the Verification console ("🎉 all caught up"), Organization teams/players/events, and the shared
  components LeagueTable, StatLeaderRail, HostsCard, ConnectBoard. Small inline instructional hints
  (mid-builder guidance like "tap players below", tiny field values like "No contact added") were
  intentionally left as text.
- **Verified live (demo, mobile 375px):** Discover → People → search "zzzzqqq" shows the shared
  empty state (🔍 · "No players match" · "Try a different name or spelling."). Typecheck clean;
  65/65 tests.
- **Noticed (pre-existing, flagged separately):** RN-web logs a nested-`<button>` hydration warning
  on Discover — a `TouchableOpacity` inside another `TouchableOpacity` in the tournament/Connect
  rows. Unrelated to this batch (EmptyState is View+Text); tracked as its own fix.

### 2026-07-25 — UI design pass, batch 3: Standings as a results board (workstream C) · SHIPPED + VERIFIED

The standings table worked but read flat — ranks 1–4 were identical grey, nothing celebrated the
leaders, and the empty states were bare one-line text. Turned it into a proper results board.
Render + styles only; the standings/leaders data is unchanged.

- **Podium for the top three.** Ranks 1–3 now show 🥇🥈🥉 with a gold/silver/bronze tinted row; the
  leader's name is bold. Ranks 4+ keep a plain number with a thin divider. The top of the table now
  reads as a podium at a glance.
- **Top performers get the same treatment** — medals for the top three, an emphasized #1, and a
  tier-coloured card border.
- **Warm empty states.** "No matches yet" / "No leaders yet" are now centred cards with an icon
  (🏁 / ⭐) and a second line explaining when they'll fill in, instead of a bare grey sentence.
- **Fuller accessibility labels** on each row (rank, team/player, points/value, P-W-L).
- **Files:** `src/screens/StandingsScreen.tsx` only.
- **Verified live (demo, mobile 375px):** the Karnataka State Cup football table shows the
  gold/silver/bronze podium (Falcons FC bold-gold, City Strikers silver, Titan Athletic bronze),
  Rovers United plain at 4; the goals-leaders empty state shows the ⭐ card; header aligns as
  "# Team"; no console errors. Typecheck clean; 65/65 tests.

### 2026-07-25 — UI design pass, batch 2: the Live Scoring screen (workstream C) · SHIPPED + VERIFIED

The scorer's cockpit — the most-used surface — but its hand-rolled surfaces predated the batch-1
depth tokens, so it read flatter than the rest of the app, and a couple of controls were clunky.
Style-only pass (no scoring logic touched).

- **Depth consistency.** Applied `theme.shadow.card` to the screen's own surfaces (`controls`,
  `infoCard`, `finalCard`) so the scoreboard, info cards and control panel lift like `Card` does
  everywhere else. The screen now reads as one system with Home.
- **Undo redesigned.** Was a tall two-line accent block with the title wrapping awkwardly and
  competing with primary actions. Now a compact single row — "↶ Undo" (in text colour, calmer) with
  "rewind step-by-step" muted on the right — and the "tap repeatedly" guidance moved to an
  `accessibilityHint`. Less shouty, tidier, still obvious.
- **Header de-jargoned.** The status pill "demo · local" / "live · synced" (developer-speak facing
  the scorer) is now a clean "Demo" (muted) / "Synced" (green tint).
- **Files:** `src/screens/LiveScoringScreen.tsx` (styles + undo JSX + header pill only).
- **Verified live (demo, mobile 375px):** scoreboard, undo, add-player and controls all lift
  consistently; undo is a clean one-liner; header shows "Demo"; Info tab shows the elevated
  scoreboard with the active tab clearly green and lifted info/scorer cards; no console errors.
  Typecheck clean; 65/65 tests.

### 2026-07-25 — UI design pass, batch 1: depth + scoreboard match cards (workstream C) · SHIPPED + VERIFIED

Standing UI-design mandate — make the whole app easier and more attractive. Started at the
foundations (which propagate everywhere), then the most-repeated, most-important unit.

- **Depth tokens.** The UI was flat — every surface was `surface` + a 1px border on one plane.
  Added `theme.shadow.card` (soft neutral elevation) and `theme.shadow.live` (red glow), applied
  to the shared `Card` and solid `Button`, so surfaces lift off the background app-wide from one
  change. `core/theme.ts`, `components/ui.tsx`.
- **Typography.** Headings got tighter tracking + line-height; body/muted got comfortable
  line-height. Reads more composed without touching the size scale. `components/ui.tsx`.
- **MatchCard → a scoreboard (`components/MatchCard.tsx`).** This is the app's whole point and its
  most-repeated card (Home, Matches, SportHub…), but a live game looked almost identical to a
  scheduled one and the score was buried as tiny grey text ("Live · RED 2–1 BLU"). Now:
  - Teams flank a **bold central score** — the result is legible at a glance; live scores render in
    pitch-green.
  - **Live matches are unmistakable:** red-tinted border + red glow + a **pulsing "LIVE" badge**
    (Animated opacity loop), and a green "tap to score ›" call-to-action.
  - Scheduled shows the kickoff time as an accent tag + "vs"; completed shows "FINAL" + "Full time".
  - Fuller accessibility label describing sport, teams, score and status.
- **Verified live (demo, mobile 375px + desktop):** live cards show the green score, glow and
  pulsing badge with "tap to score ›"; scheduled cards show the orange kickoff time + "vs";
  elevation lifts cards across Home; no console errors. Typecheck clean; 65/65 tests.

### 2026-07-25 — Support system, phase 1: AI-first help centre (workstream A) · SHIPPED + VERIFIED

Users need a way to reach support. Support is solo (one person) at first, so the design is
**AI/self-serve answers first, a human by email only when that fails**. Built the whole UX so it
works **today in demo with no backend or API key**, with the live AI + server email dropping in
behind the same seam later (phase 2). Follows the codebase's existing proxy pattern (`voiceLLM.ts`):
the Anthropic key never lives in the client.

Three layers, one screen:
- **Layer 1 — knowledge base (offline, no key).** `src/data/supportKB.ts`: 18 task-shaped help
  articles across 6 categories (Getting started, Live scoring, Tournaments, Teams & players,
  Following & alerts, Account) + a pure `searchArticles()` retrieval. Ranking weighs field
  position (title > keywords > summary > body) **and term rarity (IDF)**, so "my score won't sync"
  leads with the sync article, not every article that says "score". Doubles as the seed content
  for workstream D (articles/videos).
- **Layer 2 — AI answer (live, dormant until phase 2).** `src/core/supportAI.ts` mirrors
  `voiceLLM.ts`: `ENDPOINT` empty ⇒ `enabled()` false ⇒ KB only. When set, it POSTs the question +
  matched KB text to a Supabase edge function that forwards to Claude and returns
  `{ answer, resolved }`. Grounded in our own docs so it can't invent product behaviour.
- **Layer 3 — escalate to a human.** Pure `buildSupportMailto()` opens a pre-filled email to
  `SUPPORT_EMAIL` (kept as `hrudhaypvtemp@gmail.com` for now) carrying the question, what was
  already tried, the handle and app version — so a solo replier needs no back-and-forth. Phase 2
  upgrades this to a server-recorded case + auto-email.

UX: new `SupportScreen` — search box → instant guides (first auto-expanded, tap to expand others);
with no query it's a browsable help centre grouped by category; an "Email support" escalation card
is always reachable. Settings → **Help & support** now opens this screen (replaced the bare mailto).

- **Files:** `src/data/supportKB.ts`, `src/core/supportAI.ts`, `src/screens/SupportScreen.tsx`
  (all new), `src/screens/SettingsScreen.tsx`, `src/navigation/{types,RootNavigator}.tsx`,
  `tests/support-kb.test.mts` (new, 20 tests — search relevance on real phrasings, ranking hygiene,
  data integrity, mailto encoding).
- **Verified live (demo):** Settings → Help & support opens; browse shows all categories; searching
  "my score wont sync" returns 5 ranked guides with the sync article first; "Still stuck? → Email
  support" escalation card renders; no console errors. Typecheck clean; 65/65 tests.
- **Phase 2 (next, needs your inputs):** deploy `supabase/functions/support-assistant` (+ set the
  endpoint) to turn on the AI layer, and `support-escalate` for server-recorded cases + auto-email
  — plus a step-by-step guide to get the Claude API key and an email sender. Until then Layers 1 & 3
  are fully live.

### 2026-07-25 — Gap-hunt batch 3: Settings home (P5) · SHIPPED + VERIFIED

App/account controls (reminders, timezone, following, join-team, support console, sign out)
used to trail the **bottom of the Profile scroll**, below every stat/team/community — there was
no predictable "Settings" destination, and nowhere obvious to anchor Help & support.

- **New `SettingsScreen`** (`src/screens/SettingsScreen.tsx`), reached from a **⚙ Settings**
  button on the Profile header, registered as its own stack route. Grouped list:
  - **Preferences** — Match reminders (with live summary → NotificationPrefs), Time zone
    (inline expander, all 10 zones, current selection shown).
  - **Account** — Edit profile, Following, Join a team with a code.
  - **Support tools** — Review verifications (only for the `support` role).
  - **Help** — Contact support (opens a `mailto:` to `SUPPORT_EMAIL`, pre-filled with app
    version + handle). This is the anchor the upcoming AI-first support workstream will build on.
  - Footer shows `Sportfolio v<version>`; **Sign out** hidden in demo mode.
- **Profile slimmed to the player's record.** Removed the trailing settings block from
  `ProfileView` (and the now-dead `TimeZoneCard`/`ReminderPrefsCard` + orphan styles); it now
  ends with a single ⚙ Settings entry. `ProfileScreen` passes only profile-relevant props.
- **Files:** `src/screens/SettingsScreen.tsx` (new), `src/components/ProfileView.tsx`,
  `src/screens/ProfileScreen.tsx`, `src/navigation/{types,RootNavigator}.tsx`.
- **Verified live (demo):** Profile → ⚙ Settings opens the grouped screen; timezone expander
  shows all zones with IST selected; reminder summary reads "1 day · 1 hour · 15 min"; sign-out
  correctly hidden in demo; no console errors. Typecheck clean; 45/45 tests.

### 2026-07-25 — Gap-hunt batch 2: accessibility, honest sync errors, type safety · SHIPPED + VERIFIED

Two engineering audits (accessibility, error surfacing) plus the pile of latent **type errors**
they surfaced once `tsc` was actually run in the loop.

- **E4 — accessibility (was 1 label across 225 touchables).** Fixed at the source: `Button`,
  `SelectChip`, `TextField`, `ScreenTitle` (the shared primitives behind ~295 touch targets) now
  carry role/label/state, so most of the app is covered by four edits. Hand-labelled every
  icon-only control (Home's calendar/bell/handshake, the date-picker arrows & day cells, the
  live-scoring tabs & scorer picker) and gave toggles/segments an `accessibilityState` so
  voice-over announces "selected". **Verified live: 37/37 controls on Home expose a name.**
- **E3 — honest offline vs. stuck sync.** The live-scoring outbox treated *every* sync failure
  as "offline", so a backend that kept rejecting an event showed "saved — will sync when you
  reconnect" **forever** while the match silently failed to persist. `matchOutbox` now separates
  a real outage (device offline) from a stuck queue (failures on a working connection); after
  repeated failures the banner says **"Can't sync right now"**, shows the error, and offers
  **Retry**. Covered by `tests/match-outbox.test.mts` (6 tests). Files: `src/data/matchOutbox.ts`,
  `src/screens/LiveScoringScreen.tsx`.
- **Type safety — added `npm run typecheck` (+`check`); `tsc` had never run in the loop.** 14
  pre-existing errors had accumulated, **two of them real bugs**:
  - **Football added-time never appeared in extra time.** `stoppage` was keyed for halves 1–2
    only, but ET is halves 3 & 4 → `stoppage[3]` was `undefined`, so the "enter added minutes"
    prompt never showed in ET. Now keyed 1–4; event `half` widened to `1|2|3|4` end-to-end; the
    per-half stats filter, voice commands and end-of-half nudge all handle ET; stats screen gains
    **ET-1 / ET-2** chips once extra time is played.
  - **Referenced-but-undefined styles.** kabaddi `ctrl.row` and ScheduleMatch `fieldPlaceholder`
    were used but never defined — those rows lost their layout / the placeholder rendered at full
    strength. Both added.
  - Widened `FormatFieldOption.value` to allow `boolean` (tennis no-ad, badminton golden point,
    volleyball cap); `Button.style` → `StyleProp<ViewStyle>`; fixed a `void includes(undefined)`
    for friendlies with no tournament. `tests/` excluded from the app tsconfig (run by `node --test`).
- **Verified:** typecheck clean; 45/45 tests; app renders, no console errors.

### 2026-07-10 — Gap-hunt batch 1: tests, loading states, unreachable screens · SHIPPED + VERIFIED

First round of the standing **product + engineering gap hunt** (both hats in parallel). Audit found:
no test suite, no loading states, 31/53 silent catches, 1 a11y label across 225 touchables, an
unreachable Standings screen, a dead-end Teams screen, and no help/settings surface. Batch 1 closed
the top items.

- **E1 — test suite from zero.** Node 22+ runs TypeScript natively, so `node --test` needs **no new
  dependencies**. Added `npm test` + `tests/` with **39 tests** over the pure engines: kabaddi
  (touches/out-count, super tackle, do-or-die, all-out, all three revival styles, and *replay/undo
  integrity*), cricket DLS (curve anchors, monotonicity, revised targets), fixture generation
  (round-robin pairs-exactly-once incl. odd byes, knockout, no self-pairings) and phone identity.
  - **🐞 The tests immediately caught a real DLS bug:** the resource curves **crossed** — at 30 overs,
    losing your 1st wicket *increased* resources (74.7 → 74.9), because decay steepened faster than the
    asymptote fell. Fixed by deriving `DECAY` from `MAX` so both the asymptote and the initial slope are
    non-increasing in wickets; verified 0 monotonicity violations across all 50 overs × 10 wickets while
    keeping the calibrated anchors (100 / 66 / 32). Invariant documented in `dls.ts` + regression-tested.
- **E2 — loading states.** Hooks exposed `loading` but **no screen consumed it**, so lists flashed their
  *empty* state ("No matches yet") before data arrived. New shared `LoadingState` component; wired into
  Home, Matches, Discover and Team profile.
- **P1 — Standings was unreachable** (fully built, zero entry points). Added **"📊 Standings & leaders"**
  on the tournament page + a "see all" on the sport hub. Then found it **ignored `tournamentId`** and
  showed cross-tournament data under a tournament's name → `useStandings(sport, tournamentId?)` now
  scopes both the table and the leaders (via match-id filtered stat lines).
- **P2 — Teams screen was a dead end** (rows not tappable). Rows now open the team profile, with a
  chevron affordance and accessibility labels.
  - **🐞 Surfaced a pre-existing data bug:** two incompatible team id spaces — `getTeamSummaries()` keys
    by the raw match id (`red`) while `deriveTeams()` mints `${sport}-${shortName}` (`football-RED`), so
    the profile could never resolve and hung on "Loading team…" forever. `getTeamSummary` now resolves
    the alias, and `useTeamSummary` returns `loading` so a missing team shows a **"Team not found"**
    state instead of spinning forever.
- **VERIFIED** live: teams open their profile (Red House · 3W 0L 1D · 7 pts); Standings opens and reads
  "Karnataka State Cup 2026" scoped correctly; `npm test` 39/39 green; no console errors.
- **Still open (batch 2):** E3 surface errors (31 silent catches), E4 accessibility (1/225), P5 settings
  home; then P3 support + P4 onboarding as their own workstreams.

### 2026-07-10 — Light-sports curation: badminton / volleyball / pickleball / squash / padel · SHIPPED + VERIFIED

Closed out the sport-by-sport curation pass (all 10 sports now curated — see `docs/sport-formats.md`).
- **🎾 Tennis** — nothing added (owner: complete). *Not added:* college dual-match, timed/first-to-N.
- **🏸 Badminton** — new **"At the cap": Golden point vs Win by 2 (no golden point)** (`goldenPoint` flag
  threaded through `gameWinner`). *Not added:* classic side-out service scoring.
- **🏐 Volleyball** — new **9-a-side** preset + **"Set ending": Win by 2 vs First to target (win by 1)**
  (`winByTwo` flag).
- **🥒 Pickleball** — new **"Rec quick (11 · win by 1)"** preset. **⚫ Squash** — new **"American (PARS 15)"**
  preset. **🟡 Padel** — **"Premier Padel / WPT"** label clarified.
- **VERIFIED:** all changes compile clean (no console errors). Ledger + DEVLOG updated.

### 2026-07-10 — Kabaddi Pro-rules engine: revival styles, guided raid, super tackle, all-out · SHIPPED + VERIFIED

Sport-by-sport curation continued (basketball added 1v1/2v2; football nothing to add — both logged in
`docs/sport-formats.md`). The big one: **kabaddi's guided-raid scoring engine**.
- **`src/sports/kabaddi/rules.ts`** — pure, replay-based model. A raid outcome (touches / bonus / raider
  tackled) drives points **and the out-count on the mat**, with **revival styles** (Sanjeevani revive-one +
  all-out revive · Amar points-only · Gaminee all-out-ends), **super tackle** (+2 when ≤3 defenders),
  **do-or-die** (3rd empty raid auto-outs the raider) and **all-out** (+2). Unit-verified in Node.
- **Reducer/UI wired** into `src/sports/kabaddi/index.tsx`: new `RAID_OUTCOME` action applies the replayed
  delta (backward-compatible with pre-upgrade state via defaults); `REMOVE_EVENT`/undo drops the raid and
  **replays** so revival/all-out reverse correctly; a **guided raid panel** (raider · defenders touched ·
  bonus · tackled), a live **"on mat" indicator** and a **do-or-die warning**. New format fields: **Revival
  style** choice + **Pro rules** toggle; presets set them. ET / Golden Raid / subs / decider / timeline
  untouched.
- **VERIFIED live in the demo scorer — every Pro-Kabaddi mechanic, not just the unit tests** (Standard/Pro
  preset = Sanjeevani + pro rules, 7-a-side; no console errors throughout):
  - *Basic raid + out-count:* raider touches 3 → **3:0**, opponent **4/7 on mat**.
  - *Undo (replay):* undo → **0:0, 7/7** (out-counts restored).
  - *All-out (+2 & revival):* two 3-touch raids then a 1-touch raid put the 7th man out → score jumped
    **6 → 9** (1 + **2 all-out bonus**) and the emptied side **revived to 7/7** (Sanjeevani). **Undoing the
    all-out** un-revived them and stripped the +2 (two undos landed exactly on *3:0, 4/7*).
  - *Do-or-die:* two empty raids, then the 3rd raid's panel showed the **"⚠ DO-OR-DIE"** warning;
    recording it empty **auto-outed the raider** (**6/7**) and gave the defence **+1** (0:1) — no manual
    "tackled" tap needed.
  - *Super tackle:* with the defence reduced to **3 on the mat**, a tackle scored **+2 not +1** (opponent
    1 → 3), and the raider went out.
- **Not added (logged):** circle/Punjabi kabaddi scoring.

### 2026-07-10 — Cricket curation: The Hundred, Sixes, box, ball type, DLS · SHIPPED + VERIFIED

First **sport-by-sport curation** round (owner picks include/exclude; decisions logged in the new
`docs/sport-formats.md` ledger). Cricket scope: **professional + box only, no gully**.
- **The Hundred** — threaded a new **`ballsPerOver`** through the whole cricket engine (overs/ball
  notation, over-end, innings-end, run-rate, economy — ~15 sites; Super Over stays 6-ball). Preset sets
  10-ball overs. *Behaviour-preserving at the default 6.*
- **The Sixes** (6-a-side · 6 ov) + **Box cricket** relabelled with **selectable player count**.
- **Ball type** — new Leather / Tennis choice on the match.
- **DLS** — new `src/sports/cricket/dls.ts` (approximate Standard-edition resource model), a `dls` toggle
  (on for limited-overs presets), and a **☔ Rain — reduce overs** control: cuts the overs and, in the
  chase, **auto-revises the target** by resources lost. Verified in Node: *250 chased in a rain-cut 25
  overs at 0 down → target 165* (official ≈ 166).
- **Not added (documented):** pair cricket (out of scope), and all gully rules — last-man-bats,
  one-hand-one-bounce, bowl-out.
- **VERIFIED:** compiles clean (no console errors); cricket loads/scores with default config (ballsPerOver
  6 ≡ old behaviour); DLS math sanity-checked. Ledger + DEVLOG updated.

### 2026-07-10 — Sport formats & tie-breakers, all 10 sports (preset engine) · SHIPPED + VERIFIED

Rulebook-grounded pass across **every sport**: official formats + tie-breakers **and** unofficial/local
variants, exposed as selectable options (the football-decider pattern, generalized). Spec artifact:
https://claude.ai/code/artifact/acc6eb81-0ba4-4a5e-a39e-c19504d0aeab

**Preset engine (foundation).** New `FormatField` type `preset` + `FormatFieldOption.set` +
`advanced?` flag (`src/sports/types.ts`). `SportFormatEditor` (`FormatEditor.tsx`) now: leads with a
**Format** picklist that snaps every sibling field via the chosen option's `set` (each `onChange` composes
on the parent's functional setState), hides `advanced` fields until the preset is **Custom** or the
organizer taps **"⚙ Customize this format"**. `CreateTournamentScreen` refactored onto `SportFormatEditor`
(removed its duplicate local `FormatFieldEditor`) so presets work in tournament creation too.

**Per sport (presets + granular options; reducers parameterized, no new scoring engines):**
- **Tennis** (was thinnest) — new engine params: games-per-set, win-by-2 vs first-to-N, tiebreak-at-N,
  set tiebreak on/off, tiebreak points, **no-ad deuce**, **final-set match tiebreak**. Presets: Best-of-3/5,
  **Grand Slam** (final-set 10-pt TB), **Fast4**, **Pro set**, **Match tiebreak**, Custom.
- **Cricket** — presets T20 / ODI / T10 / **Test-timeless** / **Box (6-a-side)** / Custom; **tie-break
  decider** (Super Over vs tie-stands/shared) gating the existing Super Over. *(The Hundred's 10-ball over
  deferred — needs an over-notation rework.)*
- **Basketball** — configurable **period structure** (4 quarters / 2 halves / single) via `periodLabel`
  threading, period length, **first-to-N** auto-end (3×3 to 21), shot clock. Presets: FIBA / NBA /
  **NCAA halves** / **3×3** / School / Custom.
- **Kabaddi** — football-style **decider** (draw stands / extra time then Golden Raid / Golden Raid direct)
  gating the ET + Golden-Raid controls. Presets: Standard-Pro / Circle / School / Custom.
- **Badminton** — config-driven deuce **cap**; presets BWF 21 / 5×11 (cap 15) / 15-point / Single / Custom.
- **Volleyball** — config-driven **decider-set points**; presets Indoor (25/15) / Beach (21/15) / Single.
- **Football** — added **format presets** (11-a-side / 7s / 5s turf / Futsal / Custom) atop the shipped decider.
- **Pickleball / Padel / Squash** (already strong) — added preset rows (Rec/Tournament/Traditional ·
  Premier/Classic/Short · PSA/English/Short).

**VERIFIED:** engine compiles clean across all edits (no console errors, repeated). Preset snap + persist
proven end-to-end on two very different sports — **tennis Fast4** (stored `gamesPerSet:4, noAd:true,
setWinByTwo:false, tiebreakAt:3, tiebreakPoints:5`) and **basketball 3×3** (stored `regPeriods:1,
targetPoints:21, winBy:1, playersPerSide:3, foulsToFoulOut:0, shotClock:12`). Advanced-field reveal +
"⚙ Customize" verified; existing basketball & cricket live matches still load/score with default configs
(period-threading & tie-break additions safe). *(Ops: `sportfolio-web-demo` added to repo-root
`.claude/launch.json` in the prior entry so the preview relaunches on :8091.)*

### 2026-07-10 — Apply tournament knockout format to generated fixtures · SHIPPED + VERIFIED

**Gap:** `GenerateFixturesScreen` created every fixture with the sport's *default* format, so auto-generated
knockout matches ignored the tournament's `knockoutFormat` (decider) — they'd default to **draw stands**,
wrong for a knockout.

**Fix** (`create()` in `src/screens/GenerateFixturesScreen.tsx`): when the structure is **knockout** and the
sport is **football**, merge the tournament's `knockoutFormat` into the match format —
`decider` (`extra_time`/`penalties`) + `extraTimeMinutes` + `extraTimeSubs`. League fixtures keep the default
(draws allowed). Added a visible note on the screen so the organizer sees which tie-breaker the knockout
fixtures will inherit (or a prompt to set one if the tournament has none).

**VERIFIED** end-to-end: on a knockout football tournament with `knockoutFormat = {extra_time, 10′, 2 subs}`,
the fixtures screen showed *"⚖️ If level at full time: extra time (2×10′), then penalties — from the
tournament's knockout format"*; generating + creating produced 11 knockout matches, **all** stored
`format.decider: 'extra_time'` + `extraTimeMinutes: 10` + `extraTimeSubs: 2`. Combined with the football
decider work, those matches now go to ET-then-penalties at a level full time. No console errors. (Ops note:
added a `sportfolio-web-demo` entry to the repo-root `.claude/launch.json` — the preview tooling reads the
root config, so the demo can be relaunched on :8091 after a dev-server drop.)

### 2026-07-10 — Football tie-breaker: 3-way decider (draw / ET+pens / pens direct) · SHIPPED + VERIFIED

**Gap (user-reported):** the friendly football format only had a **Knockout on/off** toggle — on = extra
time then penalties, off = draw. No way for the organizer to say **"straight to penalties, no extra time."**

**Fix:** replaced the boolean `knockout` toggle with a 3-way **"If level at full time"** choice
(`decider` in `src/sports/football/index.tsx` formatFields):
- **Draw stands** — no extra time or penalties (default; a friendly can just end level).
- **Extra time, then penalties** — the old knockout=true behaviour.
- **Penalties straightaway (no extra time)** — new; jumps direct to the shootout.

Wiring: new `Decider = 'none'|'extra_time'|'penalties'` type + `state.decider`; `init` derives it from
`config.decider` with **back-compat** for old matches (`config.knockout` → `extra_time`/`none`), and keeps
`knockout = decider !== 'none'` so `isComplete`/shootout logic is unchanged. `START_EXTRA_TIME` now
requires `decider === 'extra_time'`; the full-time decision panel gates the extra-time controls on
`canET = half === 2 && decider === 'extra_time'`, so **penalties-direct shows only the shootout button**.

**VERIFIED** end-to-end: the friendly format shows the 3 mutually-exclusive options (selecting
"Penalties straightaway" activates only it); a created match saved `format.decider: 'penalties'`; played to
a level 0–0 full time, the panel read **"Full time — level · Decide it on penalties"** with a single
**"Penalty shootout →"** button and **no extra-time option**. No new console errors. (Bonus: the new match
minted `local-m-5` with no id collision — the counter fix from the prior entry holds.)

### 2026-07-10 — Simple "pick who plays" matchday picker (A+B) · SHIPPED + VERIFIED

**Gap (user-reported):** choosing the starting XI/5/etc. was clunky — football & court sports routed
straight into the **positional pitch editor**, forcing you to assign every player to an exact position
just to pick who plays. No easy "tick the starters + subs from the squad" flow.

**A — one simple picker for every sport (`MatchSquadScreen`, rewritten).** "✎ Edit matchday squad" now
opens a clean list of the team's **full saved squad** with **Start / Bench** toggles and a **pinned counter**
(*"Starting 5/7 · 1 sub"*) capped at the match's players-a-side. Extras: **Fill XI** (auto-start the first
eligible players up to the cap), **Clear**, ineligible players locked out (reuses `matchEligibility`),
invited/pending players flagged ⏳. Sticky Save footer.

**B — positions become optional, not the gate.** `editSquad` routing changed: football & the court sports
now open the simple picker first (cricket keeps its ordered-XI+keeper screen). For pitch sports:
- On **Save**, the chosen starters are **auto-placed into a positional lineup** (new `reconcilePositions`
  helper: keeps hand-placed starters, drops non-starters, fills empty slots in order) and written via
  `setLineup` — so the **Lineups tab & clean-sheet logic stay populated even if you never touch the pitch**.
- An optional **"⚽ Arrange on pitch (optional) ›"** button hands off to the existing `LineupEditor`,
  **pre-seeded** with the picked starters, for anyone who wants exact positions/formation.
- Route `MatchSquad` extended to carry `homeTeamName/awayTeamName/homeColor/awayColor` for that hand-off.

**VERIFIED** end-to-end in demo (Red House, 7-a-side): picker shows "Starting 0/7" + Start/Bench + Fill XI;
Aarav locked as "Not eligible"; Fill XI capped at the 6 eligible; benched one → "Starting 5/7 · 1 sub";
**Save persisted** `matchSquad.home` = those 5 starters + Harsha as sub, **and** the positional lineup
auto-updated to the 5 with **Aarav correctly dropped** from the pitch; Lineups tab rendered the 5;
reopening the picker showed "Starting 5/7" (persisted); "Arrange on pitch" opened LineupEditor pre-seeded
with the starters. No console errors.

### 2026-07-10 — Fix: demo id collisions across sessions · SHIPPED + VERIFIED

**Bug found while verifying part C** (a duplicate-key console error, `local-m-3`). Root cause: `demoStore`'s
`genId` counter (`let counter = 1`) resets on every app load but is **not** restored after hydration — so
newly-created matches/teams/players get `local-*` ids that **collide with ones persisted in earlier
sessions** (two matches ended up sharing `local-m-3` → React duplicate-key error + ambiguous lookups).
This sits right on the create-friendly path the user is exercising.

**Fix** (`applyDemo` in `demoStore.ts`): after restoring a save, (1) `bumpCounterPastRestored()` scans the
restored data for the highest `local-<prefix>-<n>` and advances `counter` past it, so fresh ids can never
collide; (2) `dedupeById()` drops any array rows already sharing an id (heals damage from before the fix),
keeping the first. **VERIFIED:** healing dropped the store from 53→52 matches (removed the dup Apex FC
friendly); re-rendering the previously-erroring match list produced **no new** duplicate-key errors.

### 2026-07-10 — Matchday picker part C: persistence surfaced + re-add · SHIPPED + VERIFIED

Builds on A+B. Makes the (already-real) squad persistence **visible** and adds fast re-use.
- **C1 — saved-squad indicator.** The picker header now shows *"💾 N players in {Team}'s saved squad —
  kept for every match."* so it's clear the squad carries across games (it always did on `team.roster`;
  now it's legible).
- **C2 — ＋ Add player on the picker.** Embedded the shared `AddInvitePlayer` (phone-first add/invite)
  directly on the picker, locked to this team; adds persist to the team's squad and refetch via a
  `rosterNonce`. **Refactor:** `AddInvitePlayer` was extracted from `LiveScoringScreen` into
  `src/components/AddInvitePlayer.tsx` and is now shared by both screens (dead styles/imports removed).
- **C3 — "↻ Copy last match's XI".** New `getLastSquadForTeam(teamName, sport, excludeMatchId)` repo
  (demo-complete; live is a post-pilot follow-up) finds the team's most recent *other* match squad; a
  one-tap button copies those starters/subs (filtered to who's still in the squad & eligible, capped at
  players-a-side). Route `MatchSquad` gained `teamId` for the add card.
- **VERIFIED** in demo: on m1 (Red House) the picker showed *"💾 7 players … kept for every match"* + the
  ＋Add card, and **no** Copy button (m1 is the only Red House match with a squad, and it excludes itself
  — correct). On a *different* Red House football fixture the button read **"↻ Copy last match's XI (6)"**
  and one tap populated **Starting 5/11 · 1 sub** — exactly m1's saved starters + bench, Aarav still
  correctly locked out. No new console errors from these screens.

### 2026-07-10 — Add players from the Info tab (empty-team dead-end fix) · SHIPPED + VERIFIED

**Gap (user-reported):** created a friendly between two brand-new empty teams (Apex FC / APX FC),
opened the match **Info** tab, and there was **no way to add players**. The only add-players entry was
the "＋ Add / invite a player" card on the **Scoring** tab, scorer-gated — so from Info, a fresh empty
team looked like a dead end. The user (correctly) looked at the team's squad card for it.

**Fix:** surfaced the add-players action **on each team's squad card in the Info tab**, where you'd expect it.
- `AddInvitePlayer` gained `fixedSide?: 'home' | 'away'` + `title?` props. When `fixedSide` is set it
  **hides the Home/Away toggle** and locks to that side — no way to add to the wrong team.
- Each Info squad card (`squadCard(sd)` in `LiveScoringScreen`) now embeds `<AddInvitePlayer fixedSide={sd} …>`
  for anyone who can edit the squad (`canEditSquad` = scorer / organizer / team leader), with a per-side
  invited-pending list. Title reads **"＋ Add players to this team"** when the squad is empty and
  **"＋ Add another player"** once it has players — so an empty team is never a dead end.
- The Scoring-tab card is unchanged (still available to the scorer with the full toggle).
- **VERIFIED** end-to-end in demo: reproduced the exact flow (Start a friendly → new teams Apex FC / APX FC
  → Score now → Info → expand Apex FC). Empty card showed "Squad not set." + "＋ Add players to this team";
  invited a new number (Karan Mehta, 9812340001) → he appears in the squad + "Invited — pending
  registration", and the WhatsApp text correctly reads **"added to Apex FC"** (home) — proving the
  side-lock routes to the right team. Title flipped to "＋ Add another player" after. No console errors.

### 2026-07-09 — Timezone foundation + calendar sync · SHIPPED + VERIFIED

The two deferred items from the form batch, now built (organizer flows, launch UX).

**Timezone — store UTC, show in the viewer's own clock.** New `src/core/time.ts` is the single
time-display layer:
- Match times are stored as an **absolute instant** (UTC ISO, via `toISOString()`) and **rendered in
  the viewer's timezone** — a London game shows in IST for an Indian viewer and in London time for the
  Londoner (same instant, each sees their own clock). This is the "follow a guy in London, his game
  shows in my time" requirement.
- Formatting via `Intl.DateTimeFormat({ timeZone })` (fully DST-correct on web/ICU). `formatDateTime`
  (adds `timeZoneName: 'short'` so it's unambiguous whose clock), `formatShort` (weekday+time for cards),
  `formatTime`, `formatDate`, `zoneAbbrev`.
- **User setting**: reactive `timeZoneStore` (`useSyncExternalStore`) + `useUserTimeZone()` hook, cached
  in AsyncStorage (`sportfolio.timeZone.v1`), **default `Asia/Kolkata` (IST)** for the India launch,
  changeable when travelling. `hydrateTimeZone()` wired into `App.tsx` startup. UI: a 🕑 **Time zone**
  card in `ProfileView` (Change › → curated `TIME_ZONES` list). Cross-device source of truth =
  `profiles.time_zone` (migration 0001) once signed in.
- **Applied at**: `MatchCard` (kickoff line), `LiveScoringScreen` Info tab (Date row). More surfaces
  adopt `core/time` incrementally.
- **Device note**: Hermes needs the `@formatjs/intl-datetimeformat` polyfill for *arbitrary* IANA zones;
  the code falls back to device-local if the zone isn't supported, so IST works before the polyfill lands.
- **VERIFIED** in demo: same match reads **"Mon 18:00" in IST → "Mon 13:30" in London"** (the exact
  4:30 IST→BST offset); Info-tab Date reads **"Mon 15 Jun, 09:00 GMT+5:30"**. No console errors.

**Calendar sync (pilot MVP) — one-tap "Add to my calendar".** Reuses the existing `.ics` infra
(`src/core/ics.ts`, `exportToCalendar`):
- A **📅 Add to my calendar** action on the match **Info** tab (`LiveScoringScreen`) exports a `CalEvent`
  built from the match (uid `match-<id>@sportfolio`, `Home vs Away`, UTC start, venue, sport · tournament).
- Because the `.ics` **DTSTART is UTC**, every calendar app renders the event in the viewer's *own* zone
  automatically — the same "London game lands in my calendar at my local time" guarantee, at the calendar
  layer.
- **VERIFIED** in demo: button fires a valid `.ics` — `DTSTART:20260615T033000Z` (= 09:00 IST, matches
  the displayed time), `+90 min` end, correct SUMMARY/LOCATION/DESCRIPTION. No console errors.
- **Live upgrade (post-pilot, noted):** true Google-Meet-style **auto-sync to all participants** needs
  server-side email `.ics` invites (or `expo-calendar` per-device write + permission) keyed off
  participant identity — deferred to live. The pilot ships the reliable one-tap add.

### 2026-07-09 — Schedule/tournament form polish + knockout format · SHIPPED + VERIFIED

Batch of form improvements (organizer flows).
- **Sport defaults to "Select a sport"** (`ScheduleMatchScreen`): `sport` is now nullable; the rest of
  the form (teams, time, format) is hidden until a sport is picked. Submit requires a sport.
- **Team pickers = search + New team only** — dropped the "Your teams" quick-chips (and the my-teams
  derivation) per the user; each picker is a search box (3+ letters) + ＋ New team.
- **Time picker rebuilt** (`DateTimeField`): the horizontal scroll-chip hours/minutes are replaced by a
  clean **HH : MM** editor — type the exact hour/minute, ▲▼ steppers, AM/PM toggle.
- **Tournament knockout format** (`CreateTournamentScreen`): the Structure picker (League / Knockout /
  League+Knockout) already existed; now when the structure **has knockouts**, a **"Format for knockouts"**
  choice appears — **Extra time + Penalties** or **Direct Penalties** — and Extra time reveals
  **ET half length** + **ET substitutions**. Stored on `Tournament.knockoutFormat` (types + repos +
  migration `tournaments.knockout_format jsonb`); to be applied to generated knockout matches next.
- **VERIFIED** in demo: sport shows "Select a sport" (form gated until picked); team pickers are just
  search + New team; time editor shows HH:MM + steppers + AM/PM; knockout section shows/hides correctly
  (League hides it; Direct Penalties hides the ET fields). No console errors.

**Deferred (larger / partly live-gated) — planned next:** (4) **timezone** — store UTC (already done),
display in each viewer's own timezone, a user tz setting (default IST, changeable when travelling),
cross-tz following; needs an Intl polyfill on device for arbitrary IANA zones. (5) **calendar sync** —
auto-add a created match to participants'/organizer's device calendars (like Google Meet→Calendar);
there's existing `exportToCalendar` infra to build on; needs calendar permissions + participant identity.

### 2026-07-09 — Phone = primary identity key (platform baseline) · SHIPPED + VERIFIED

Cross-cutting rule: a person is recognised by their **contact number first — one number ⇒ one
person**; the name is pulled from the number, never duplicated; the number is mandatory for every
profile.
- **`core/phone.ts`** (new): `normalizePhone` (digits, canonical), `phoneKey` (last-10 identity key),
  `isValidPhone`, `samePhone` — so "+91 98765 43210" / "9876543210" / "+919876543210" are one identity.
- **`repos.ts`**: new **`findPlayerByPhone()`** canonical lookup; every creation path routes through it —
  `invitePlayer` reuses whoever owns the number (name pulled up; pending→invited, confirmed→existing),
  `createPlayer` dedupes + merges the sport into the existing person rather than making a second record.
  Numbers are **stored normalised**; `NewPlayer` gained `phone`.
- **`AddInvitePlayer` is now phone-first** (LiveScoringScreen): enter the number → it's recognised and
  the known name is pulled up (name field hidden — no duplicate name possible); an unknown number
  reveals the name field + WhatsApp invite path.
- **Sign-up mandate**: AuthScreen gains a required **Mobile number**; threaded through `signUp`
  (`core/auth`) → stored on the profile (live). Schema/migration 0001: `profiles.phone` +
  **unique indexes on `players.phone` and `profiles.phone`** (one number ⇒ one row).
- **VERIFIED** in demo: typing Aarav's number pulled up "✓ Aarav Mehta — already on Sportfolio" (button
  "＋ Add Aarav Mehta", no name field); a new number revealed the name field + invite; inviting "Meera
  Iyer" then re-entering her number recognised her with **no duplicate created** (meeraCount stayed 1);
  phone stored normalised (919123456789). No console errors.

### 2026-07-09 — Friendly flow, B: add-player WhatsApp invite loop · SHIPPED + VERIFIED

The invite-to-install growth loop. In the live scorer, a scorer can **＋ Add / invite a player** by
name + mobile (`AddInvitePlayer` in `LiveScoringScreen.tsx`):
- **`invitePlayer()`** (`repos.ts`): if the number belongs to a registered player → added directly
  (confirmed); else creates a **pending player** (`Player.invited = true`, `phoneVerified false`) added
  to the team, and returns it. The UI then opens a **WhatsApp invite** via the existing
  `openWhatsApp()` (wa.me deep link) prefilled with an install/register link (`sportfolio.app/join/<id>`).
- Pending players show in an **"Invited — pending registration"** list (⏳ + phone) and are **kept out
  of scoring** automatically by the existing `matchEligibility` gate (unverified) — i.e. "confirmed on
  the team sheet only after they register", exactly as specified. **`markPlayerRegistered()`** (demo)
  simulates them completing registration → `invited=false` + verified + dob → eligible.
- **Roster-collapse bug found & fixed:** the demo `getRoster` returns an explicit roster *instead of*
  the houseName-derived one, so appending one player would drop everyone else. `invitePlayer` now
  **materializes** the derived squad before adding.
- Added `Player.invited` (types.ts) + `alter table players add invited` (migration 0001).
- **VERIFIED**: invited "Priya Nair" → pending row + correct wa.me URL (`wa.me/919000011111?text=…join/<id>`);
  roster intact (existing Red House XI all present, Priya excluded while pending); Mark-registered →
  store shows `invited:false` + verified + dob (eligible). No console errors.

Friendly-match rework (A+B+C) complete — ready for the user to test. Next: the tournament-organizing flow.

### 2026-07-09 — Friendly flow, A+C: pickers + team-only scoring · SHIPPED + VERIFIED

Track A, organizer flows — first two pieces of the friendly-match rework.
- **A · Better selection UI** (`ScheduleMatchScreen.tsx`): the sport row (10 chips) is now a compact
  **picklist** (`SportPicker` — field → inline dropdown w/ checkmark). The team pickers now lead with
  **"Your teams"** (only teams the user has played for — derived from houseName / sportDetails / roster
  membership) and fall back to a **search** (type 3+ letters → matching teams); **＋ New team** kept
  as-is. Replaces the 20-team flat chip wall. VERIFIED: sport dropdown opens; "Your teams" shows just
  Red House for p-aarav; typing "blu" surfaces Blue House.
- **C · Team-only scoring fallback** (`football/index.tsx`, `kabaddi/index.tsx`): a friendly whose
  players aren't on the app yet can still keep a correct scoreline. Football goal flow gains **"⚽ Team
  goal — no scorer"** (`recordTeamGoal` → GOAL with no attribution; label adds "(no players yet)" when
  the roster is empty). Kabaddi `Row` gains an **"＋ Team point"** chip (`teamPt` → RAID/TACKLE with no
  attribution; replaces the old "No roster set." dead-end). Basketball already scored team-only.
  Attribution can be backfilled later via the timeline editor once players register. VERIFIED on the
  live Red-vs-Blue match: Team goal → score 2→3, timeline shows "Goal — RED" (team, no scorer).
- Next in this thread: **B** — quick-add player as a WhatsApp invite-to-install loop (wa.me deep link);
  then the tournament-organizing flow.

### 2026-07-09 — Production-hardening migration (launch Track B) · SQL

First versioned migration: **`supabase/migrations/20260709120000_production_hardening.sql`** (0001).
Turns the audit into runnable SQL: (1) `profiles.role` CHECK now allows `support`/`admin`; (2) RLS
**enabled on all 8 tables that were open** (schools, profiles, players, teams, team_members, venues,
match_disputes, reminder_sends) with policies (own-row for profiles; read-all + authed-write catalog;
server-only reminder_sends); (3) **scorer/host-scoped scoring** via `can_manage_match()` +
`auth_player_ids()` helpers — and fixed 3 write paths RLS was silently blocking (matches/tournaments had
no INSERT policy, match_events had no DELETE → create-match/create-tournament/undo would all have failed
under RLS); `match_events.created_by` now defaults to `auth.uid()`; (4) `set_updated_at` trigger on the
mutable tables (+ `updated_at` column where missing); (5) GIN indexes on `host_ids` for the scoping
policies. Idempotent; demo path unaffected. ⚠️ Only run against a project that has real Auth wired (RLS
on + no user = all writes denied by design). Checklist status in `docs/backend-readiness.md §3`.

### 2026-07-09 — Backend & data-model readiness audit (launch Track B) · DOC

Design-pass for the demo → live cutover, written to **`docs/backend-readiness.md`** (new living doc).
Key finding: the backend is **~90% built, not scaffolded** — `supabase/schema.sql` is 23 production-shaped
tables (append-only `match_events` log, realtime, indexes, starter RLS with the production scorer-scoped
policy already drafted as a comment) and `src/data/repos.ts` is a **complete demo↔live seam** (all 77 repo
fns branch on `isSupabaseConfigured`; ~40 mutations already write to Supabase). So Track B is **harden +
operate**, not build. Documented: the drift/gaps (RLS missing on players/teams/team_members/schools/venues/
match_disputes/reminder_sends; pilot-grade scoring RLS; `profiles.role` CHECK omits `support`; no versioned
migrations; `updated_at` not trigger-maintained; verification write paths to confirm; real Auth still to
wire), a production-hardening checklist, the data model, scale posture, the conventions that keep further
demo work migration-ready, and the cutover plan. See [[sportfolio-launch-plan]].

### 2026-07-07 — "Top 5 + See all" section pattern · SHIPPED + VERIFIED (phase 1)

App-wide convention: every list section shows at most **5 records**, with an inline **"See all (N) ›"**
on the title row that opens the full list when more exist.

- **`components/SectionHeader.tsx`** (new): reusable `<SectionHeader title onSeeAll? count? />` +
  exported `SECTION_CAP = 5`. "See all" renders only when `onSeeAll` is passed (i.e. total > cap).
- **Home** (`HomeScreen.tsx`): 🔴 Live now & 📅 Up next capped to 5; See all → the **Matches** tab
  pre-set to Live / Upcoming. (Up next was previously a hard `.slice(0,4)`.)
- **SportHub** (`SportHubScreen.tsx`): 🔴 Live now, 📅 Schedule, ✅ Results capped to 5; See all →
  Matches filtered to that **sport + section**.
- **Matches** (`MatchesScreen.tsx`) is the "See all" destination — now accepts `initialTab` /
  `initialSport` params (used as initial state + synced via effect). Nav types: `Tabs` →
  `NavigatorScreenParams<TabParamList>`, `Matches` tab accepts the params; screens deep-link via
  `nav.navigate('Tabs', { screen: 'Matches', params: {...} })`.
- **VERIFIED** in the demo: Home shows exactly 5 cards under each section with **"See all (8) ›"** /
  **"See all (12) ›"**; tapping See all (live) opened Matches on the **Live** tab with the full list;
  SportHub renders the same pattern (See all appears only when a section > 5); no console errors.

**Phase 2 — SHIPPED + VERIFIED 2026-07-07:** rolled the pattern across every remaining browse/feed
section, app-wide. Sections without a natural full-screen destination use **inline expand**
(`SectionHeader` with `expanded` → label flips to "Show less"; caller keeps a `useState` and slices
the list to `SECTION_CAP`). Covered:
- **ProfileView** (player/own profile): By sport, Teams, Communities, Past communities
- **Discover**: player results, Open tournaments, Teams · **Following**: Tournaments, Teams, Players
- **Teams**: per-sport groups + Casual teams · **Notifications**: Live alerts, Recent-from-followed
- **Organizer dashboard**: hosted tournaments · **Team profile**: Squad, Matches
- **Try a new sport**: From-people-you-follow · **Standings**: Team standings, Top performers
- **Tournament profile**: Matches, Classes, Overall standings, Teams
- **Organization**: Current/Past events, member role groups, Past members, Teams tab
- **Organize** tab: Tournaments you're hosting, Communities · **Verification review**: Pending queue

Enhanced `SectionHeader` with an `expanded` prop (inline-expand label). Most per-screen edits were
fanned out to parallel subagents, then reconciled + verified. **Intentionally NOT capped** (need the
full list, or not a browse feed): filter chips / sport selectors / tabs, sport-selection grids, the
horizontal stat-leader rails (own paging), calendar/agenda + bracket (structural), and
management/selection screens where you must see everyone (SquadScreen roster editor, matchday-squad
picker, fixture generation). VERIFIED: full bundle compiles with **no console errors** (all screens
are statically imported, so a parse error would break the whole app); rendered Home, Discover,
Profile/ProfileView, Notifications, Tournament profile, Organize — all show the pattern and work.

### 2026-07-07 — Timeline editing ported to basketball & kabaddi · SHIPPED + VERIFIED

Ported football's flagship timeline-correction tools — **🗓 Correct the timeline** (remove /
edit a past moment in place) and **⏪ Backfill a missed moment** — to the two other
player-attributed event-log sports.

- **Basketball** (`basketball/index.tsx`, `events.ts`): reducer `REMOVE_EVENT` (removes a play,
  reverses the team score for a basket); `removeEvent`/`editEvent`/`commitEdit` in the controls
  (negative attribution reverses the player's tally). **Edit** = remove the old play + re-enter it
  (re-pick the scorer and the points for a basket; re-pick the player for a rebound/assist/foul)
  **stamped at the original quarter**. **Backfill** = pick an earlier quarter (chips) and every play
  logged is stamped there until "Back to live". VERIFIED (Green vs Gold): removed a +3 (5→2, scorer
  0), edited a +2→Bhavana +3 (score 3, points moved), backfilled a basket into Q1 while in Q2 —
  score & box-score tallies all re-adjust.
- **Kabaddi** (`kabaddi/index.tsx`, shared `liveEvents.ts` gained optional structured fields
  `kind/points/playerName/minute/half`): same three tools — reducer `REMOVE_EVENT` (reverses a
  raid/tackle point or a substitution), edit (re-pick the raider/tackler at the same minute),
  backfill by minute (its half derived, mirroring football). VERIFIED (Blue vs Gold): removed a raid
  (2→1), edited a raid Ishaan→Rohit (score held, tallies moved), backfilled a raid at 5' from the 0'
  clock. `LiveEvent` additions are optional, so the other net sports (tennis/badminton/volleyball)
  are unaffected.
- **Cricket** already has robust ball-by-ball correction (per-ball undo + derived scorecard); the
  racket/net sports are point-by-point where undo suffices — so neither was a target.

### 2026-07-07 — Kabaddi Extra Time + Golden Raid (tie-breaker) · SHIPPED + VERIFIED

Final sport tie-breaker — **the set is now complete across every sport that can end level.**
Kabaddi (Pro-Kabaddi rules): level after the 2nd half → **two extra-time halves**, still level →
**Golden Raid** (sudden death, next point wins).

- **Extra-time halves** (`kabaddi/index.tsx`): `half` widened to `1|2|3|4` (3/4 = ET); `currentMinute`
  rebased over ET; `halfLabel()` → 1st/2nd Half, Extra Time · 1st/2nd; new `extraTimeMinutes` state +
  format field (default 5). `NEXT_HALF` now handles 3→4; new `START_EXTRA_TIME` (guarded on a level
  half-2 game).
- **Golden Raid** (`goldenRaid` flag, `START_GOLDEN_RAID`): a sudden-death mode where the **next
  logged raid/tackle point ends the match** (`pushPt` sets `ended` when `goldenRaid`, tags the event
  ⚡/`GR`). The tip-off gate is bypassed in Golden Raid so the raid/tackle buttons show immediately;
  a prominent **⚡ GOLDEN RAID — SUDDEN DEATH** banner explains it; clock/summary read `⚡ GR` /
  `FT · GR` / `Full Time · Golden Raid`.
- **Score-aware end-of-period control** (no `pendingTie` needed — no auto-end): Half 1 → "End 1st
  Half"; ET1 → "End Extra Time · 1st half"; Half 2 or ET2 **level** → **Golden Raid** + (half 2 only)
  **Extra time** + **End as a tie**; **ahead** → "🏁 End Match".
- **VERIFIED end-to-end** (Blue vs Gold): 0–0 after 2nd half → decision (Golden Raid / Extra time /
  End tie) → took Extra Time → ET1 → ET2 → still level → decision now Golden Raid + End tie only
  (no ET) → Golden Raid → sudden-death banner + clock ⚡ GR → scored → **FULL TIME · GOLDEN RAID**,
  BLU 1–0, raid point attributed to the scorer (POTM). No console errors.

**Tie-breaker set COMPLETE:** football penalty shootout · cricket Super Over · basketball Overtime ·
kabaddi Extra Time + Golden Raid. Net/racket sports (tennis, badminton, squash, pickleball, padel,
volleyball) need none — their deciding-set/tiebreak scoring always forces a winner.

### 2026-07-07 — Basketball Overtime (tie-breaker) · SHIPPED + VERIFIED

Second sport tie-breaker. Basketball never draws — a level game after Q4 plays overtime,
repeated until decided. Unlike cricket's Super Over, the OT **score carries over**, so it's
just an extra period on the same running total (no nested state needed):

- **Periods extend past Q4** (`basketball/index.tsx`): `quarter` 5+ = overtime; new
  `periodLabel(q)` → `Q1..Q4`, then `OT`, `OT2`, `OT3…`. New `START_OVERTIME` reducer case
  (`quarter+1`, resets the clock) guarded to fire only when `home === away`.
- **No auto-end, so no `pendingTie` needed** — the end-of-period control just branches on the
  live score: at Q4+ **level → "🏀 Start Overtime (OT…)"** (primary) + **"End as a draw"**
  (ghost, for formats that allow one); **ahead → "🏁 End Match"**. Q1–Q3 unchanged
  ("End Q{n} →"). A 🏀 OVERTIME banner (round + "5-min period · score carries over") shows
  through the OT period; clock/summary read `OT`/`Final · OT`.
- New `overtimeMinutes` format field (default 5, informational — the clock counts up).
- **VERIFIED end-to-end in the demo** (Green vs Gold): played to Q4 → tied 0–0 shows the OT
  decision → scored 2–0 (flips to "End Match") → tied back 4–4 (OT decision returns) → Start
  Overtime (banner + "Tip off OT") → scored 7–4 in OT → **Final · OT**. Score-reactive branch
  and OT running total both correct; no console errors.
- Remaining tie-breaker: **kabaddi Extra-time / Golden-raid**.

### 2026-07-07 — Argentina vs Egypt seed (World Cup R16) · SHIPPED + VERIFIED

New scorable demo match `m-arg-egy` (`worldCupArgEgySeed.ts`), wired into `demoStore.ts`
(match, players, lineup, squads, `teamLeaders` arg→Messi/egy→Salah). Teamsheet from the
user's screenshots: **Argentina 4-1-3-2** (Scaloni; Messi ©) and **Egypt 4-2-3-1**
(Hossam Hassan; Salah ©), full XIs + benches (ARG 15 subs, EGY 13) with shirt numbers.
Added a **`4-1-3-2`** formation template to `formation.ts` (it didn't exist). VERIFIED in the
demo: card shows ARG 0–0 EGY, scorer = demo user, Lineups tab renders both XIs on the pitch
with correct formations, numbers, captains (C) and coaches; no console errors. Egypt GK
**#16** (`p-egy-13`) confirmed by the user as **Mahdy Soliman**; venue set generic (Round of 16).

### 2026-07-07 — Cricket Super Over (tie-breaker) · SHIPPED + VERIFIED

First sport-specific tie-breaker: when a limited-overs match ends **level**, cricket now
offers a **Super Over** instead of silently recording a 0-run "win".

- **Tie no longer force-ends the match** (`cricket/index.tsx` `settle`): a level 2nd innings sets
  a new `pendingTie` flag (not `ended`), so the scorer keeps control and sees a decision panel —
  **🔥 Start Super Over** or **Accept the tie & end the match** (a league tie stays legitimate).
- **Super Over = a nested mini-match through the same reducer** (`SuperOverState`, `startSuperOver`,
  `resolveSuperOver`): starting one freezes the parent match and spins up a fresh **1-over,
  2-wicket** innings (`isSuperOver` flag). Every scoring action is **routed into the nested match**
  by the reducer, so all the ball-by-ball logic (runs, wickets, extras, strike rotation, innings
  change, chase-ends-on-target) is reused for free — and the **main scorecard/ratings stay intact**
  (the SO has its own cards/events).
- **Correct rules**: the side that batted **2nd** in the match bats **first** in the Super Over;
  a **tied** Super Over triggers another, **alternating** who bats first, with prior rounds kept in
  `history`; captains/keepers carry over so setup isn't re-prompted.
- **UI**: the live scoring controls transparently operate on the nested innings (a `rootState` vs
  effective-`state` alias), topped by a **🔥 SUPER OVER** banner (round, innings, balls, "need N off
  M"); the scoreboard tags each side with its SO runs (`1/0 · SO 2`) and the result reads
  **"Won the Super Over by N run(s)"**.
- **VERIFIED** — reducer-level (exhaustive, via a temporary hook against the real reducer): tie
  detection, batting order, 1-over/2-wicket limits, innings transition, chase-ends-early, decided
  vs. repeated (tied→alternating) rounds. **Then end-to-end in the demo UI** on a real cricket match
  driven to a 1–1 tie: decision panel → Start Super Over → nested BLU innings → RED chase → match
  completed **"Won the Super Over by 1 run"**, with the main scorecard preserved.
- Net/racket sports (tennis, badminton, squash, pickleball, padel, volleyball) need no tie-breaker
  path — their deciding-set/tiebreak scoring already forces a winner. Remaining gaps: **basketball
  Overtime**, **kabaddi Extra-time/Golden-raid**.

### 2026-07-07 — In-place timeline editor (football) · SHIPPED + VERIFIED

The "remove a moment" feature grew into a **full in-place editor**. In "🗓 Correct the
timeline" each logged moment now has **✎ Edit** alongside **✕** (remove):

- **Edit = reverse the old + re-enter it in place** (`football/index.tsx` `editEvent`/`editStat`):
  editing removes the moment (reversing its score/subs *and* every stat line it credited) and
  reopens its normal flow, **stamped at the original minute** via a new `editMin` state. A banner
  — *"✎ Re-entering the N' moment — your pick replaces the old one"* — shows through the flow;
  `editMin` auto-clears when the flow closes.
- **Everything re-adjusts** — re-pick the **scorer, goal type, body part and assister** (or the
  carded/fouling/stat player) and the match score, per-player tallies and profile ratings all move
  to match. Fixed a latent gap: **removing/editing a goal now also reverses the assister's assist**
  (previously a phantom assist lingered, since the assist is a separate log entry).
- **VERIFIED on Portugal vs Spain:** logged Ronaldo open-play goal + Bruno Fernandes assist
  (Ronaldo goals/shots/on-target = 1, Bruno assists = 1). Edited it → João Félix, **free kick**,
  left foot, Vitinha assist. Result: Ronaldo → all 0, Bruno assist → 0, **Félix goals 1 +
  freekickGoals 1** (type moved off `openPlayGoals`), Vitinha assists 1; Timeline shows one goal
  *"Goal · Free kick · Left foot — João Félix (assist: Vitinha)"* at the original 0'. Everything
  adds up.
- **"Add a missed moment" — confirmed already covered by ⏪ Backfill an earlier moment:** the
  scorer enters a past minute and every action logged (full flow — scorer, type, assist) is stamped
  there, so a completely missed event is inserted with full attribution. No new work needed.

**Next (planned, needs sequencing):** sport-specific tie-breakers — **cricket Super Over**,
**basketball Overtime**, **kabaddi Extra-time/Golden-raid** (football penalty shootout already
done; net/racket sports resolve via their own deciding-set/tiebreak so they can't end level).
Then extend the football timeline learnings (edit past event, add missed event, per-period stats)
to the other event-log sports.

### 2026-07-06 — Football scoring, batch 2 (realised while scoring Portugal vs Spain) · Phase A

Second batch of football improvements. **Phase A shipped** (Phases B/C planned — see below).

- **Offside → pick the player** (`football/index.tsx`): offside now prompts for who was
  offside (records an `offsides` stat for them) instead of team-only.
- **Handball, Cross, Dribble** new actions (`events.ts` + `football/index.tsx` + `ratings.ts`):
  loggable, on the Timeline, in the Stats-tab totals, and weighted for ratings.
- **Coloured card buttons** (`football/index.tsx`): the Yellow button is yellow, the Red
  button is red.
- **Grouped scoring actions** (`football/index.tsx`): "Log an action" split into
  **⚡ Attacking** (shot/cross/dribble/corner/pass/att-play), **🛡️ Defensive**
  (tackle/interception/save/def-play), **🟨 Discipline** (foul/offside/handball/card).
- **Phase B — cards, SHIPPED** (`events.ts`, `football/index.tsx`, `Scoreboard.tsx`,
  `MiniScore.tsx`, `LineupView.tsx`, `sports/types.ts`): a player's **second yellow is now
  automatically a red** (send-off) via a shared `recordCard()` helper — shown on the lineup
  as a **red badge with a "2"** (vs a plain red for a straight red). The lumped yellow/red
  tally is off the scorecard; instead **red-card badges sit next to each team's name** on the
  big board + the mini strip (`ScoreSummary.homeReds/awayReds`, shared `RedBadges`).
- **Goal body part, SHIPPED** (`events.ts`, `football/index.tsx`, `Timeline.tsx`): the goal
  flow now asks **how it was won** (open / penalty / free kick) then **struck with** (left
  foot / right foot / head / chest); the body part shows on the Timeline ("Goal · Right foot").
- **Correct the timeline (surgical edit), SHIPPED** (`football/index.tsx` reducer
  `REMOVE_EVENT` + scorer "🗓 Correct the timeline" list): the scorer can **remove one
  specific past moment** (a wrong goal/card/sub/stat) instead of undoing everything back to
  it. The removal reverses that moment's score/subs (reducer) and its stat lines (negative
  attribution), and is logged so it replays cleanly. VERIFIED: removed one goal → score 1→0,
  goal off the timeline, scorer's rating gone — while an unrelated yellow stayed put.
  (Full in-place *edit* of a moment's details = remove + re-log for now; a dedicated editor
  is a possible follow-up.)
- **Phase C — knockout lifecycle, SHIPPED** (`football/index.tsx`): the state machine now models
  **extra time** — `half` widened to 1/2/3/4 (3/4 = ET halves), the clock rebased via
  `startOffset`/`halfBase` that account for ET, new `etMinutes`/`etExtraSubs` state. At full time
  of a **level knockout tie** the scorer picks **Extra time** (2 halves, ± duration, **+N ET
  subs** granted) or **straight to Penalties**; still level after ET → penalties (existing
  shootout). League / decided knockouts end at 90. Half length, knockout flag, ET length and ET
  subs are **organizer format fields**; Portugal vs Spain seeded as a knockout (R16). VERIFIED:
  FT→ET (clock 90:00, subs 5→6)→ET2→penalties→shootout controls.
- **Planned — in-place timeline editor (upgrade of the remove-a-moment feature):** re-pick a
  moment's player/type in place (not just remove + re-log), with match + player-profile stats
  re-adjusting so everything adds up. (User: "a must".)

### 2026-07-06 — Live-scoring polish (the "backlog" from watching Brazil vs Norway)

The user logged 10 gaps while live-scoring; all shipped and verified on the Brazil vs
Norway match. Detail also in the memory note `sportfolio-live-scoring-gaps.md`.

- **#1 Penalty flow** (`football/index.tsx`, `events.ts`, `ratings.ts`): new "🥅 Penalty"
  flow — which team → won by → taken by → **Scored / Saved / Missed**. Scored = penalty
  goal; Saved = penalty-missed (taker) + save (opp GK); Missed = penalty-missed. New
  `penaltyWon`/`penaltyMissed` stats + timeline rows + rating weights (won +2, missed −3).
- **#2 Every action → Timeline** (`Timeline.tsx`): shots, saves, tackles, interceptions,
  attacking/defensive plays now appear (were stat-only). Shots show on/off target; passes
  show completed/misplaced.
- **#3 Per-half stats** (`events.ts`, `football/index.tsx`): each event now carries its
  `half`; Stats tab got an **Overall / 1st half / 2nd half** toggle (Possession is
  Overall-only, being time-based).
- **#4 Scorecard strip** (`components/MiniScore.tsx`): reordered to status → clock → score;
  centred score with team names on the outer ends (`POR 0 : 0 ESP`); bigger fonts.
- **#5 Ratings from all actions** (`ratings.ts`): football weights expanded to include
  shots/on-target/saves/tackles/interceptions/att·def plays (positives) and fouls/cards
  (negatives); labels added so those players appear in the Summary.
- **#6 Join a game in progress + backfill** (`football/index.tsx`): kickoff can start the
  clock at a given minute; a "⏪ Backfill" mode stamps logged actions at a chosen past
  minute (works across every flow via `fire()`).
- **#7 Half-time subs** (`football/index.tsx`): the substitution UI now shows during the
  HT break (before the 2nd half starts).
- **#8 Sub limit** (`football/index.tsx`): the counter existed; added disable + "no subs
  left" at the cap.
- **#9 On-target shot → outcome** (`football/index.tsx`): on-target branches into Goal /
  Saved (GK save) / Blocked (defender's block) / on-target-only.
- **#10 Clean sheets** (`football/index.tsx`): removed the manual "(awards clean sheets)"
  button text — the award was already automatic from the final score (records via
  attribution regardless of the reducer).
- **Portugal vs Spain seed** added, then **corrected to the official teamsheet** — Portugal
  **4-2-3-1**, Spain **4-1-2-3**, real shirt numbers, actual XIs (João Félix starts over Leão;
  Pedro Porro + Dani Olmo start for Spain), and the full 15-man benches (see demo-matches table).

### 2026-07-05 — Cricket, score strip, schema hardening

- **Cricket voice scoring** (`sports/voiceParsers.ts` `cricketVoice`): ball-by-ball voice
  (runs/extras/wickets), reading striker/bowler/side from state — completes voice for all sports.
- **Cricket batting-order lineup** (`screens/CricketLineupScreen.tsx` + `sports/cricket/lineup.ts`):
  tap-to-order XI (1–11) + wicket-keeper; flows through the existing ordered `starters`
  so openers default to #1/#2 and the next batter is suggested in order. Keeper pre-fills
  the live match setup.
- **Scoring-tab live score strip** (`components/MiniScore.tsx`): compact score shown on the
  Scoring tab for every sport (the big board is suppressed there to avoid duplication);
  hosts the sport's running clock.
- **Football clock shows seconds** (`football/index.tsx` `clockTime`): mm:ss (and 45+2:14 in
  added time), ticking every second.
- **Live-persist demo-first fields** (`schema.sql`, `repos.ts`, `reminderPrefs.ts`, `auth.tsx`):
  squad `keeper_id`, `Tournament.reminderLeadMinutes`, and per-user `user_reminder_prefs`
  (offline-first cloud sync). Deploy-ready (not runnable in demo).
- **Full schema audit** (`schema.sql`): brought the DB schema in sync with the code — added
  missing tables (`organizations`, `listings`) and missing columns across players/matches/
  profiles/match_lineups/stat_lines/tournaments/teams. Table + column diffs now clean.
- **Sport-parity lineup UI (Part A)**: fixed the court sports' lineup editor (was showing
  football formations for every sport).
- **Notification preferences**: custom reminder timers (any "N min/hours before"), persisted.
- **Voice scoring for all sports**: pluggable `voice` on the sport contract; shared
  `voiceMatch.ts` + `voiceParsers.ts` + `VoiceScorer.tsx` (badminton/tennis/volleyball/
  padel/basketball/kabaddi/pickleball/squash).
- **Multi-device realtime sync — hardened**: undo propagation + reconnect catch-up via a
  shared `rebuildFromLog()`.
- **Official vs friendly stats split**: profile + per-sport pages show All / Official /
  Friendly toggles.
- **Demo persistence**: the in-memory demo store now autosaves to AsyncStorage and restores
  on reload.
- **Tournament-status fix**: status factors match completion (not just dates).
- **Dispute resolution — audit trail**: append-only history on disputes.
- **Brazil vs Norway seed** added (later corrected to official 4-1-2-3 + numbers + captains).

### 2026-07-03 — Foundation batch

- **Offline-safe live scoring** (`data/matchOutbox.ts`): durable AsyncStorage event queue,
  retry on reconnect, offline banner.
- **Bulk fixture generation** (`data/fixtures.ts` + `screens/GenerateFixturesScreen.tsx`):
  round-robin / knockout generators.
- **Organizer "what's left" dashboard** (`data/organizerStats.ts` + screen).
- **Ad-hoc friendly matches**: tournament-less matches; "Start a friendly" now-or-later.
- **Calendar + notifications epic (A–E)**: date pickers everywhere, role-aware calendar,
  player + follower pre-match reminders, on-device scheduling; deploy-ready cron push fn.
- **Tournament date defaults + validation** fixes.

---

## Live-scoring backlog status

All 10 items logged while watching Brazil vs Norway are **shipped** (see 2026-07-06 above
and `sportfolio-live-scoring-gaps.md`). New gaps get logged there as they're hit.

## Known limitations / follow-ups

- The live-scoring upgrades (#1–#10) are **football-specific**; extending the richer capture
  (per-half stats, penalty/shot outcome flows, all-actions timeline) to other sports is a
  planned expansion (deferred by the user).
- Several fields persist **demo-first** (in-memory/AsyncStorage); the Supabase columns exist
  in `schema.sql` but a real deploy + migration hasn't been run from here.
- Predicted lineups for not-yet-kicked-off games use best-guess shirt numbers — corrected
  from the official teamsheet when available.
- RN-web `Button` synthetic-click quirk in the test harness (see verification note above).
