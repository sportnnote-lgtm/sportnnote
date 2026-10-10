# Sport depth: progress (coding session → founder)

Newest at the top. One entry per item: what was built, files, migration (if any), tests, commit, open questions.

## 2026-10-10: migrations 0050 + 0051 run live (founder); Wave 0 + Wave 1 so far pushed
- Verified read-only: `stat_lines.result` + check exist (live has 0 stat lines, so the backfill had nothing to do); `field_entries.team_id` exists, `player_id` is nullable, and the marker rule is golf-only.
- Pushed to GitHub and `main` (the website redeploys). The app publish (web + OTA) waits until SD-19 and SD-29 are committed, since builds use the working tree.

## SD-18: standings columns per sport — DONE (a232b7b, 2026-10-10)
- **Built:** pure `standingsColumns.ts` (`tableColumns`, `columnsConfig`, `tieBreakNote`); PhaseTable rebuilt on it; a "Player" / "Pair" / "Team" header; on phones, a fixed name column with scrolling numbers below 64 px of name width; a column key and tie-break note under the table; the compact LeagueTable gains an extras line.
- **Columns:**
  - football / hockey / handball: GD (+ FP);
  - basketball: PF PA ±;
  - volleyball: Sets SR PR;
  - kabaddi: T SD (+ PF);
  - games sports: G± P±;
  - tennis / padel: S± G± (+ S% G%);
  - cricket: NRR (always shown now);
  - chess: SB (+ registered tie-break columns such as BH).
- **Kabaddi** tables now say T, not D.
- No migration. Tests: 25 new · 1269 total · demo 8093.
- Not verified: a badminton singles event with results (no demo data); cricket for non-managers.

## SD-25: line context and career splits — DONE (9eaf301, 2026-10-10)
- **Built:** pure `lineContext` (cricket format from the preset or overs / ball / players, singles / doubles, tournament vs friendly, season, opponent, chess colour and time control, venue, home/away). Schema `splits`. Profile filter chips that recompute career, record and history with no extra network calls.
- No migration. Tests: 19 new · 1244 total · demo 8093 (cricket by format, badminton singles / doubles, chess by colour).
- **Noted for SD-24:**
  - the Win % tile truncates "100%" at 375 px;
  - chess history reads "1 draws · 1 games" (plural).
- Leaders and awards splits are not done (profile only).
- Demo data added: `sd25-*` matches and lines.

## SD-17: standings rule kit — DONE (b39381c, 2026-10-10)
- **Built:**
  - **Presets for new tournaments (D1):** FIFA/UEFA 3-1-0 (+ "goal difference first"), FIBA 2-1, FIVB 3-3-2-1, PKL 5-3-1 with the ≤7 losing bonus, BWF, ATP/ITF RR, FIP, pool play, WSF, ITTF 2-1, carrom, ICC, FIH (+ shoot-out bonus), IHF, plus "Simple 2-1-0" / "Simple 3-1-0".
  - **Tie-breaker library:** h2h mini-league with restart rules, set / point / games ratios and diffs, sets % / games %, played, FIFA fair play, explicit lots (‡ "Drawn by lot").
  - **Other:** BWF 2-way vs 3-way branching, a `standingsUnits` plugin hook, `registerTieBreaker` (for SD-26), and the PointsEditor preset chips with an advanced reorder.
- **Unchanged:** old tables — a stored format without the new keys equals `defaultStandingsConfig` (tested for 10 sports).
- No migration. Tests: 34 new · 1224 total · demo 8093 (FIVB point-ratio ordering, PKL losing bonus).
- **To check against current rulebooks:** PKL and FIH tie-break order; the volleyball best-of-3 points adaptation.
- **Known gap:** the end-match preview still shows a flat "+win". The advanced editor edits only the 3+ chain.
- **Choice:** badminton and tennis keep 2 points per win (house tables sum points; the order is identical).

## SD-28: results engine for timed / measured events — DONE (ff88a73, 2026-10-10)
- **Built:** `src/data/results/*`:
  - mark parsing and formatting, ranking with discipline tie rules (photo, stands, countback, vertical, lifted-first, inner-count);
  - Q/q progression, serpentine seeding, World Athletics lanes, field finalists and attempt order;
  - PB / SB / MR / SR records (legal marks only), medals and position points with ties.
- **Also:** `resultsStore` on `field_events` / `field_entries` with the offline outbox; the `ResultsEvent` screen (enter + sheet); a hidden `/ResultsLab` dev entry; the medal table accepts field results. Golf's positions and cut now come from the engine, identical on 9000 randomised leaderboards.
- **Founder to run:** migration 0051 — `supabase/release/2026-10-field-results-0051.sql`:
  - `field_entries.team_id` (relay / crew / house rows; `player_id` nullable with a check; unique per event + team);
  - **security fix:** 0028's `can_mark_field_entry` let anyone in the same group edit another entry (golf's marker rule). In a heat, that let a sprinter edit rivals' times. It is now golf-only, and markers can't change `team_id`.
  - Without 0051, individual results still save, but relay inserts show "needs the latest database update".
- Tests: 43 new · 1224 total · PGlite fieldresults 21/21, golf 28/28 · demo 8093 (100 m heats → final with wind, FS/DNS/DNF/DQ, Q/q, lanes, tie for 3rd, MR; long jump with countback and top-8 + ties; high jump, relay, swim).
- **Wave 4 still needs per sport:** registering each sport, event setup screens, discipline-specific UIs (lane draw, jump-off, splits, end-by-end archery and series entry, weigh-in), road / combined scoring, career PB / SB on profiles, the medal-table loader wiring, an org-level school record book, and a public results link.
- Not verified: the live Supabase path; real typing beyond 100 m heat 1; native.

## SD-16: aggregate engine — DONE (acb7669, 2026-10-10)
- **Built:** `aggregateValue` / `rankPlayers` for every agg kind, with coverage ("not tracked" → undefined), qualifiers (overridable), and tie chains (value, then best-figure `by`, then the stat's `tieBreak`, then stable order).
- **Cricket records leaders in the Stats tab:** Highest score, Best bowling, Best batting average (min 3 innings), Best strike rate (min 30 balls), Best economy (min 10 overs), Most 50s / 100s.
- **Declared, data only:** basketball PPG / RPG / APG and double-doubles; volleyball per-set figures (show "–" until SD-19 writes set counts).
- No migration. Tests: 21 new · 1147 total · golden values still equal · demo 8093.
- **Note:** demo cricket lines are old-style (runs/wickets only), so rate leaders appear only after full matches are scored.

## SD-21: point editor for TT, squash, pickleball, padel — DONE (2dc58ff, 2026-10-10)
- **Built:** a `rally` kind with `wonBy` for side-out sports; rallyEngine and padel engine handle EDIT_LOG and STAT_ADJUST; `RallyPointEditor` gains `rowsOf`/`normalize`; `correctionActions`; the editor is mounted for table tennis, squash, pickleball and padel. Old side-out logs are inferred from their 🔁 events.
- No migration. Tests: 21 new · an edited match equals the same match scored live · pinned fingerprints unchanged · demo 8093 (pickleball side-out flip, TT change and delete).
- **Limits:**
  - player names on later points aren't re-attributed when an edit changes the server (noted in the guide);
  - after an edit moves play into an earlier game, the server display uses the latest start-right pick;
  - squash and padel are tested by unit tests only;
  - the pickleball guide is ~1100 words.

## SD-15: per-sport stat schema — DONE (a5086ef, 2026-10-10)
- **Built:** `statSchema.ts` (types), `statSchemas.ts` (an RN-free registry and lookups), one `<sport>/stats.ts` per sport, `rallyStats.ts` and `sharedStats.ts`. Every plugin now carries `statSchema`.
- **What it replaces:** the old maps (`STAT_WEIGHTS`, `STAT_LABELS`, `SPORT_AWARDS`, `TOURNAMENT_AWARD_SLOTS`, `STAT_CATEGORIES`, the headline order, profile labels, the team unit). Their exports and signatures are kept. Cricket's career is computed from the schema (`careerFromSchema`) and renders identically.
- **Tests:** 30 new (golden equality with the pre-refactor values, a scan for undeclared keys, hockey/handball/athletics expressiveness samples) · 1126 total.
- **Deliberate label fixes:**
  - correct singular forms ("1 win", "1 foul", …);
  - real labels for keys that used to show raw names (e.g. "1 yellow card").
- **Still bespoke, by design:**
  - golf profile (until SD-28);
  - other sports' career grid (SD-24);
  - box score components (SD-23);
  - max/min/perGame/perSet/qualifier aggregation (SD-16);
  - hand-written award prose.

## SD-103: doubles tiebreak serving order — DONE (db8fcb2, 2026-10-10)
- **Fix:** padel and doubles tennis tiebreaks (set and match) now rotate partners: h0, a0, a0, h1, h1, a1, a1… Before, it was h0, a0, a0, h0, h0, a0, a0.
- **Unchanged:** the next-set first server already followed ITF 5(b). Scores and fingerprints are unchanged (the server is display-only).
- **Not supported:** a pair choosing afresh which partner serves first in a new set (needs a stored per-set choice); the engine continues the rotation by game count.

## SD-14: racket replay safety net — DONE (0872473, 2026-10-10)
- **Built:** `tests/replay-racket.test.mts` (39 tests: 36 pass, 3 todo). It replays reconstructed real matches with pinned fingerprints:
  - squash: PSA 2024 Egyptian Open final, 1993 British Open (English scoring);
  - pickleball: PPA LA Open 2024 side-out doubles, MLP 2024 rally 21, PPA OC Cup 2024 singles;
  - padel: Premier Padel Valencia P1 2026, and a synthetic short-sets match.
- No public point-by-point data exists, so the logs reproduce the published game scores, plus in-game scores where published.
- **Engine gaps found (as todo tests):**
  1. **Doubles tiebreak serve order (padel/tennis) — a real bug,** now queued as **SD-103**.
  2. English squash "set one / set two" at 8-all (SQ-07).
  3. MLP freeze at 20 (PB-09).
- Also noted: pickleball game-2 first server (PB-11); padel Star Point (PD-07).

## SD-11 to SD-13: player results and appearances; standings fixes; cricket NRR — DONE (4994c8d, 2026-10-10) · Wave 0 complete
- **Founder to run:** migration 0050 — `supabase/release/2026-10-stat-line-result-0050.sql` (adds `stat_lines.result` and a conservative backfill: W/L only when the side is certain, no row inserts). The app works before it runs.
- Tests: 54 new · 1032 total · PGlite statlineresult 39/39 + bundle re-run · demo 8093 (football draw, carrom loser, profiles; standings meet with custom points, cricket tie / NR / DLS).
- **Displayed changes (bug fixes):**
  - profiles show draws, ties and NR correctly, with Win % over decided matches only;
  - overall house tables with custom points;
  - team pages count NR in Played;
  - cricket ties show T;
  - cricket NRR moves where an innings ended with no batter left, or the target was revised;
  - best-placed seeding for table tennis and chess (new knockouts only).
- **Gaps / notes:**
  - after `resetMatch`, existing lines stay as empty lines (pre-existing);
  - the roster fallback uses current rosters;
  - basketball and kabaddi subs are matched by name (unit-tested only);
  - "absent" batters aren't modelled for no-batter-left;
  - the team page's record-by-sport uses default points;
  - the cricket-rain-and-dls guide is ~1050 words (over the 900 limit).

## SD-07 to SD-10: golf missed cut / profile / countback; football minutes, blocked shots and keeper clean sheets; chess Swiss bye — DONE (29649b3, 2026-10-10)
- **Built:**
  - Golf: MC below the cut line, cut saved on the round, like-for-like best round, tracked putts, countback only on complete cards.
  - Football: FIFA 45+2' and ordinal minutes, blocked shots, keeper clean sheets incl. shootouts and corrections (partial `statTotals`), a goalkeeper-only Golden Glove and leaders.
  - Chess: the Swiss bye point (1 / ½ / 0); byes and forfeits out of played stats and Sonneborn-Berger.
- No migration. Tests: about 90 new · 978 total · legacy replays identical · demo 8093.
- **Guides:** `golf-scoring-and-leaderboard`, `score-football`, `run-a-chess-tournament`.
- **Displayed changes on existing data (bug fixes):**
  - golf 9-hole bests no longer count as "Best round";
  - golf putts/round goes up where putts weren't tracked;
  - golf ties with an incomplete card show T;
  - existing Swiss chess events with odd fields gain the missing bye points;
  - chess forfeits leave P/W/L and Sonneborn-Berger.
- **Old football matches:** their defender clean sheets and on-target blocked shots stay in stored lines until the D2 backfill (it needs each match's lineup).
- **Noted for Wave 1:**
  - Sonneborn-Berger still uses opponents' totals including their bye points;
  - round-1 bye goes to the middle seed (FIDE: the lowest);
  - football `minutes` are written for keepers only (all players with SD-11 / the tracker).
- Not verified: live Supabase, a #05 correction through the UI, a keeper red card in the UI.

## SD-05 + SD-06: basketball FIBA rules; pickleball presets and right-court server — DONE (b6f8dfd, 2026-10-10)
- **Basketball:**
  - Built: bonus threshold fix in every preset, FIBA technicals as team fouls, OT foul carry-over, team-foul and BONUS lines, a one-tap "+1 FT", new tournaments at 2-1 (loss 1) plus the "Simple 2-1-0" preset.
  - Not modelled: NBA 3 team fouls in OT, forfeit 0 points.
  - Editing a pre-change match's format mid-game picks up the new defaults (existing app pattern).
  - Bug noticed, not fixed: the play-by-play labels OT events "Q5" (`Timeline.tsx`).
- **Pickleball:**
  - Built: side-out tournament presets (D4), tournament default, start-right pick at 0-0, server derived from court position, correct call and credit, a court shown in rally mode.
  - Not done: who serves first in game 2+ (PB-11), MLP freeze at 20 (PB-09), voice "rally home" credit in side-out mode.
- No migration. Tests: 32 new · 914 total · legacy replays identical · demo 8093.
- **Guides:** `score-basketball`, `score-pickleball`.
- Demo data from these checks was left in the demo store.

## SD-04: volleyball point outcomes — DONE (1ee96f2, 2026-10-10)
- **Built:** the Attack / Block / Ace / Opp. error / Opp. serve error panel, a pure volleyball engine, aces and blocks counting as points, editor point kinds, voice, and an MVP weight rebalance.
- **Guide:** `score-volleyball`.
- No migration. Tests: 17 new · 882 total · legacy replay identical · demo 8093.
- Not verified in the UI: the no-roster layout, undo of an attack, leaders in a real tournament, and voice.
- **Choices:**
  - errors don't name the opponent who erred (keeps it to one tap; `errors` / `serveErrors` are for a later detailed mode);
  - the kill stat key is `attackPoints`;
  - Attack resets after each point;
  - old stat lines without a `tracked` list count as tracked (existing app behaviour).

## Kabaddi feedback from the guide writer (2026-10-10), for KB items later in the queue
These are small kabaddi issues the guide writer found. Each is listed with what it means for us.
- **"Pro rules (do-or-die, super tackle, bonus)" toggle:** the label suggests the bonus depends on Pro rules, but it doesn't (bonus needs 6+ defenders either way). Relabel it.
- **Touches still score when the raider is tackled:** this is open item KB-11 / D6, to align with the AKFI rule. It needs v:2.
- **No toss / first-raid choice:** add one with KB items.
- **Two close "Edit" controls in "Correct the timeline":** the **Edit**/**Done** toggle and each row's **✎ Edit**.
- **Do-or-die warning:** it only shows on new raids, and a void bonus counts as an empty raid toward do-or-die. Make both clear in the UI.

## SD-03: kabaddi raid/tackle attribution — DONE (c4dd6fd, 2026-10-10)
- **Built:** a pure kabaddi engine with correct raider/tackler credit, separate tackle, do-or-die stop and all-out lines, per-half columns that add up, edit-in-place of a raid, whole-raid remove with credit reversal, and the voice super tackle.
- No migration. Tests: 18 new · 865 total · 400×40 randomised legacy replays identical vs the frozen old reducer · demo 8093 m4.
- **Event log:** `RAID_OUTCOME` needs no gate (old team scores were right). The remove-ordinal fix is gated on `REMOVE_EVENT v:2` because old removes could drop a different raid.
- Not verified: real live kabaddi logs, stat-line writes on Supabase, native.
- **Choices:**
  - raid-form score preview;
  - chips wrap at 375 px;
  - an edit may keep a raider who has since been subbed off;
  - touches still count when the raider is caught (that rule is KB-11, which needs v:2).
- **Guide:** no kabaddi scoring guide exists yet; one is being written alongside SD-04.

## SD-01 + SD-02: final scores; tennis tiebreaks and Grand Slam deciding set — DONE (326857f, 2026-10-10)
- **Built:** `scoreline.ts`, used on every result surface for 8 set/game sports (volleyball and padel included); tennis tiebreak scores and the `gs5` deciding-set tiebreak at 6-6 (`finalSetTBAt`).
- No migration. Tests: 31 new · 847 total · legacy replay identical · demo 8093.
- Not verified: the full-time alert firing (code path read; in the demo it fires only for followed teams); the Slam deciding set in the UI (unit-tested).
- **Choices:**
  - live detail lines include completed sets ("Games — 1:0 (21-18)");
  - a naturally ended match's manual-end/correction score is now sets won (agrees with `result()`);
  - old `gs5` matches keep the whole-set tiebreak, now shown as [10-8].
- **Guide updated:** live-score-overlay.

## 2026-10-10: plan approved
- The founder approved PLAN.md (102 items, Waves 0–4) and all the recommended defaults for D1–D9.
- Build order: Wave 0 (live correctness bugs) → Wave 1 (foundations) → Waves 2–3 (per-sport depth), with Wave 4 (new sports) able to run alongside them once Wave 1 lands.
- Protocol (same as the parity queue), for each item:
  - mark it IN-PROGRESS, build it and add tests;
  - run `npm run check`;
  - check it in the demo on 8093 (never 8091);
  - update the public guide(s), DEVLOG and this file;
  - make one local commit and mark the item DONE.
- Never push, deploy or run migrations without asking. Migrations are written as files.
