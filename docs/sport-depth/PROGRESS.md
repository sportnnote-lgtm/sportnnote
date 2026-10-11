# Sport depth: progress (coding session → founder)

Newest at the top. One entry per item: what was built, files, migration (if any), tests, commit, open questions.

## SD-38 / SD-43 / SD-69 / SD-79 cricket stats — DONE (67849fa, 2026-10-11)
- See DEVLOG. Founder action (optional): run `await __sportnnoteAdmin.backfillCricketCaptainKeeper({ dryRun: true })` in the live web console, then without dryRun, to flag captains/keepers on past matches. Visual check of chips / Captaincy / keeper rows still needed on a real cricket match with captains set. Keeper flag = final keeper only after a mid-match change.

## SD-57 basketball timeouts, SD-50 game flow — DONE (72950ce, 2026-10-11)
- See DEVLOG. Check: FIBA OBR Art. 18.2.5 (timeouts) and 8.7 (overtime) numbers vs the 2024 edition; 3x3 Art. 11; NBA limits from memory; "last 2 minutes" approximate (count-up minute). Not done: NCAA carry-over, game flow on football's own Stats tab, bench goals for hockey/handball, player-level flow.

## SD-99 rowing, SD-100 canoe, SD-56/70/80 football — DONE (6ab6a1a, 2026-10-11)
- See DEVLOG. No migration.
- **Rowing/canoe — check:** World Rowing progression tables (13–18 crews) and ICF 10–18 boat table from memory; ICF 9-lane order may be mirrored; ICF official times are 1/1000 (app shows 1/100, keeps thousandths for order); ranges approximate. Not built: quarter-finals, lightweight weigh-in, para canoe, slalom, marathon, 5000 m mass start; "Best rowers (points)" counts singles only.
- **Football — confirm:** default ban rule (red 1, 2 yellows 1) applies to existing tournaments as a warning; second-yellow red fixed at 1; any completed match / walkover serves a ban; officials never suspended (FIFA would); name→id matching within team for old logs. Not done: shootout panel after the winner is decided doesn't show (screen goes to Match complete); finished shootout card says "Full time" without the pens; demo "Julián Álvarez" accent duplicate; fixture team search can pick a different team id (suspension warning then missing).

## SD-59 / SD-72 / SD-83 kabaddi discipline — DONE (3e2bc8d, 2026-10-11)
- See DEVLOG. AKFI rulebook unreachable — secondary sources only (no rule numbers). Check: touches lost when caught under both AKFI and PKL (no difference found → flag is a house-rule switch); whether the bonus survives a tackle; yellow = +1 technical point? (optional, off); all-out while a player is suspended; yellow while out starts at the side's next revival (approximate); defender line-out credited as an extra point; lobby not modelled.
- Not done: voice for cards/tech points, cards in team comparison, live (non-completion) card stat writes, reducer enforcement of red-carded raiders (UI only).

## SD-53 / SD-54 racket conduct + timeouts, SD-63 let — DONE (133422a, 2026-10-11)
- See DEVLOG. Check: pickleball technical foul in side-out (point to receiver?), further foul = forfeit?, medical timeout per side vs per player (USAP 13.G / 10.C); TT second penalty point carrying into the next game (ITTF 3.5.2.2); tennis default is suggested never (Referee's call); squash escalation one level at a time (WSF 15 leaves it to the referee); padel FIP schedule unverified; badminton cards per player (BWF 16.7).
- Not done: Stroke / No let still only in the point-detail row; Match stats "Total points won" counts rallies (excludes penalty points); conduct tile remembers last side; volleyball conduct, padel/squash timeouts, voice.

## SD-95 archery — DONE (df28288, 2026-10-11)
- See DEVLOG. Check vs World Archery Book 3 (from memory): tie order 10s→X for compound (inner-10 ring), shared =5/=9 places, X vs 10 in shoot-offs left to the judge + repeat shoot-off arrow, ranking-round shoot-offs only for the last bracket place. Not built: team/mixed team, end-total-only entry, points below a small bracket cut, shoot-off distances, >64 brackets untested.

## SD-58 / SD-71 volleyball serve, rotation, subs + libero — DONE (a4b28ee, 2026-10-11)
- See DEVLOG. Check: libero clause numbers (19.3.x, from memory of 2025–28 numbering); exceptional-sub eligibility not checked (15.7); expulsion/disqualification subs (15.8) not modelled; national "libero may serve" variants not modelled.
- Not done: per-player SE column in the live box; libero digs; SD-81 detailed attack mode; libero not auto-forced off at the front row (cue only); subs not drawn on the point timeline; 9-a-side rotation.

## SD-96 shooting, SD-35/42/45/66/89 golf, SD-118 — DONE (fc9f370, 2026-10-11)
- See DEVLOG. No migration.
- **Shooting — check with ISSF GTR (PDF unreadable):** decimal series countback on decimal vs integer series totals; 3P tie order (positions vs X); 3P final 40→45 per 2022+ rules; smaller finals scaling (house); shoot-off for medal places with no final (house); 50% low-series threshold (house). Not built: 25 m / shotgun / mixed-team medal-match finals, relays, clocks, decimal per-shot inner-ten count.
- **Golf — confirm:** gross/net prize places = 1 per 4 players (1–3); carrom doubles still shows Partners. Not built: projected cut line; WD/DQ after a finished round doesn't rewrite that round's stat lines.

## SD-102 handball, SD-97 weightlifting — DONE (73317eb, 2026-10-11)
- Two new live sports (see DEVLOG). No migration.
- **Handball — check with an IHF source:** sudden-death 7 m order (same team first?), 1 time-out in the last 5 min and limits for youth halves (2:10), clock not stopped for 7 m (2:9), 3rd suspension = 2′ + disqualification in stats (16:3/16:6d/16:8), team warning limit only a hint (16:2). House minimums: save % 20 shots, shooting % 20 attempts, 7 m % 5 throws, per-game 2 matches. Not built: voice, beach handball, passive play, empty-goal, shot zones, per-thrower shoot-out keeper credit, demo seed.
- **Weightlifting — check with IWF TCRR (rulebook PDF unreadable; 2020 numbers from memory):** calling order steps after weight/attempt (6.6.6), lot as last tie-break (6.8), category bounds (6.4); 2025 categories from IWF/USAW news; Sinclair uses 2021–24 coefficients. Not built: competition clock, bar-loading chart, team classification, A/B groups, moving a lifter between categories.
- Existing bug found: a 2-player team shows a "Partners" row on profiles for any team sport (shared doubles code) → SD-118.

## SD-117 per-sport follow-ups — DONE (114d76d, 2026-10-11)
- Slices a (football/hockey/basketball, f50d7a9), b (volleyball/kabaddi, ab68663), c (carrom/chess/golf/racket cues, 114d76d). See DEVLOG.
- Remaining (move to own rows when picked up): chess mini-match/Armageddon; carrom penalty board (SD-68); golf SD-35/45/87/89; pickleball MLP freeze (PB-09); padel golden-point receiver prompt; squash cues; volleyball SD-58/71, kabaddi SD-59/72/83; football/hockey/basketball P2s listed under SD-117a. Note: one padel Ace marks the match as point-detail tracked (winners/errors written as 0).

## SD-117b volleyball + kabaddi follow-ups — DONE (2026-10-11)
- See DEVLOG. Caveats: ✎ edit of a volleyball fault row drops its type/player (stats stay consistent via STAT_ADJUST); Undo label is plain "Undo" for kabaddi PAUSE/RESUME/TIMEOUT; volleyball with no lineup shows the whole squad. Remaining: SD-58 rotation + serve-error credit, SD-59, SD-71, SD-72, SD-83.

## SD-117a football / hockey / basketball follow-ups — DONE (f50d7a9, 2026-10-11)
- P1 rows F10, F12, F13, H6, H7, B3, B6, B8, B9, B10, B12 + P2 F7, H5, B11 (FT prefill). See DEVLOG.
- Remaining (SD-117): F6, F8, F9, F11, F14, F15, H3, H4, H8–H12, B5, B7, B13–B15, B11 sub-required banner + Q time-up nudge. Team-official cards excluded from fair play (agent's call, easy to flip). Hockey Goal → From PC isn't linked to the open corner (only the PC panel links). Football "added time is up — end the match" nudge wording in a level knockout.
- Next SD-117 slices: volleyball/kabaddi, carrom/chess/golf, racket cues (change ends, intervals).

## SD-110 + SD-111 scoring comfort + held result — DONE (cb98189, 2026-10-11)
- SD-110: screen stays awake while scoring (LiveScoring when the scorer has a started, unfinished match; results entry; live golf scorecard) — web Wake Lock API (re-acquired on visibilitychange), phone expo-keep-awake looked up lazily. Light buzz on each scoring tap, double on Undo (web navigator.vibrate; phone expo-haptics, lazy). Settings → Buzz on scoring taps (per device). Phone parts need a new APK.
- SD-111: the deciding tap holds `status = completed` (follower "Full time" push via match_status_notify + winner/W-L/standings write-back) for 60 s; note "Result sent to followers in 0:58 · Undo · Send now". Undo cancels; leaving the screen / backgrounding sends at once; a killed app sends on next open (pendingResults, flushed on sign-in). No edge-function or migration change.
- Tests: tests/result-hold.test.mts (8). Demo (static export of 8093 build): hold → status live; Undo → never completed; 60 s → completed + winner; next-open flush → completed.

## SD-113 cricket scoring safety + flow — DONE (28944cc, 2026-10-11)
- All P1 rows of scorer-ux-audit-cricket.md + A4, A6, F4, F5, R5. See DEVLOG.
- Remaining P2: A5 swap toast, A7 over-editor target, F6 past ball → extra, D1–D6 detail, R3 beamer warnings, R4 bouncer limit, R6 free-hit limits in the reducer, R7 powerplay phases, R8 last man stands, R9 DRS counter. Cricket has no frozen-oracle legacy reducer test (legacy-path tests added in the new file).

## SD-116 one-tap match deciders — DONE (3e93e03, 2026-10-11)
- Chess record-result confirm + colour lock + 1-0/½-½/0-1 tiles; golf Concede match… / Pick up (NR) / Clear… confirms; carrom no default coins; hockey Full time locked until the last period; basketball Eject confirm + scorer clears. New score-chess guide.
- Left out: Armageddon draw rule, carrom board editor, other golf/hockey/basketball P1–P2 (→ SD-117). Chess colour lock applies to every game (plugin can't see config.white).

## SD-115 racket point-entry safety — DONE (6f7a8f3, 2026-10-11)
- Big team-coloured side buttons in all racket sports, no default server (fixable mid-match, v:2), pressure chip, named Undo (all sports but cricket), Fast4 sudden death. See DEVLOG.
- Not done: true 2-a-side doubles not demoed (multi-player rosters used); padel/TT tests only; chip/Undo use short side names; haptics/keep-awake (SD-110), match-point confirm (SD-111), tennis change-ends banner (SD-117).

## SD-114 live scoring bugs — DONE (e6213e3, 2026-10-11)
- Football double goal + goal lost on Cancel fixed; ✕ confirm + edit-cancel keeps the event across football/hockey/basketball/kabaddi/rally editor; backfill bar; second-yellow red follows its yellow; kabaddi touch cap (v:2). See DEVLOG.
- Not demoed: hockey, basketball, second-yellow (tests only). Racket guides get the ✕/insert notes with SD-115.

## SD-112 results-entry safety — DONE (fad0696, 2026-10-11)
- P0 + P1 rows of scorer-ux-audit-events.md built (see DEVLOG). Range sheet confirms, never rejects; reopen round/final with record rollback.
- Remaining: finish-order entry mode (P1 flow); P2 rows (confirm on clear, wind > 9.9, DQ reason, lap counters…); three guides are 1,000–1,200 words (over the 900 limit); `reopenPhase`/`completeFinal` have no direct unit test (store not node-runnable); range message shows hand marks at 2 decimals.

## SD-107 racket point detail — DONE (cef440d, 2026-10-11)
- Optional "How was the point won?" in all six racket sports + tennis 1st/2nd serve; stats keyed so untracked matches show "not tracked". See DEVLOG.
- Follow-ups noticed (not built): tennis box DF column never filled (tennisBox lacks doubleFaults); lets on serve; code/time violations + penalty ladders (→ SD-53); medical timeouts/retirement reasons; challenge counts; squash plain Let (SD-63 remainder); padel/pickleball 1st/2nd serve; return stats; net approaches; MLP freeze (PB-09). Apply toast says "next ball" for racket sports.

## SD-106 match controls + confirm sheet — DONE (83ba1a5, 2026-10-11)
- End / Restart / Not started? Cancel moved to a red Match controls card at the bottom of Scoring; every destructive action (incl. walkover, discard, delete/reset, period ends, golf finish, results lock) goes through `ConfirmSheet` (green No on top, red/amber Yes). Undo unchanged, next to the scoring buttons.
- Open: voice "full time"/"end half" still end with no sheet; demo Restart never shows after the first score (demo events lack created_at); native not run.

## SD-108 invite share — DONE (8051bd2, 2026-10-11)
- Invite texts say "Team …" / "Tournament …"; the QR PNG is shared with the message (web now; Android app after a new APK — `react-native-share`); Android web join pages offer "Open in the SportnNote app" with a website fallback.
- "Hrudhay Organizer" is the account's own profile name — edit the profile.
- **Founder steps for true one-tap App Links (not done):** (1) a host that doesn't redirect (app.sportnnote.in 301s to sportnnote.expo.app today) — serve directly or use sportnnote.in; (2) `eas credentials -p android` → release SHA-256; (3) serve `/.well-known/assetlinks.json` (200, application/json, no redirect) with package `in.sportnnote.app` + that fingerprint; (4) `android.intentFilters` autoVerify for /join-club and /join-tournament in app.json + the https prefix in RootNavigator linking; (5) point SHARE_BASE at that host; (6) new APK, check `adb shell pm get-app-links in.sportnnote.app`. iPhone stays on the web app.
- Not verified: native image share, real WhatsApp caption on iOS, a real intent handoff.

## SD-101 hockey, SD-94 swimming, SD-37/86 carrom — DONE (68dd087, 2026-10-11)
- **Hockey:** a live sport (see DEVLOG).
  - To verify against FIH: clock stops for PCs and after goals, yellow 5–10′, Hockey5s 2×10 with no PCs, the tie-break order.
  - House choices: 2-match minimum for per-game leaders, 10 shots faced for save %, top-scorer tie-break goals → field goals → assists → fewer minutes. The shoot-out bonus forces shoot-outs on draws in that tournament.
  - Not built: voice, a second-green rule, shoot-out keeper credit.
- **Swimming:** a live sport on the shared event-sport layer; timed finals now also work for athletics.
  - To confirm: the school programme by age group (a house choice).
  - Not built: relay exchange times, relay lead-off as an individual PB, per-leg stroke DQ checks, 800 / 1500 lane 0 / 9 tie rule.
- **Carrom:** doubles credit, 25-point cap, slams, statTotals, career.
  - Not verified in the demo: doubles and the career page (unit-tested).
  - Not built: breaker tracking (SD-78).
- **Shared limit:** the main profile header shows Apps / W-D-L for athletes and swimmers.
- No migration. Tests green · demo 8093 (the shared demo store is last-writer-wins across tabs).

## SD-91: athletics field events — DONE (3e6ea63, 2026-10-11)
- **Built:** `results/field.ts` (programme by age, implement specs, TJ boards, round presets, attempt flow, bar progression / TR 26.4 check, jump-off, trial clock); the attempt card and HeightCard / HeightGrid / JumpOffCard UI; field stat lines and careers (PBs per implement).
- **Engine fixes:** `levelKeys` groups by all earlier tie keys; attempt order reverses after rounds 3 and 5 (TR 25.6).
- No migration. Tests: 30 new · 1705 total · demo 8093 (U14 Girls LJ with a tie at 8th, U14 Boys HJ with a jump-off).
- **Founder / research to verify:** U12–U16 implement weights are labelled "check yours" (not checked against AFI / SGFI). TR 25.5 / 25.17 / 25.22 / 26.4 / 26.8–26.9 details were implemented from memory (the WA PDF was unreachable).
- **Left:** road / XC, walks, combined (SD-92 / 93), steeplechase, 60 mH, per-athlete TJ board, vertical qualification stops, a historic school record book.

## SD-32: volleyball statTotals — DONE (8a9462b, 2026-10-11)
- **Built:** `volleyball/totals.ts` makes points, attackPoints, blocks and aces absolute, merged with setsPlayed and sets W-L. Errors stay team-level (never player-attributed). The unresolved-name safeguard is in place, and the D2 resync heals pre-SD-04 aces and blocks into points.
- Tests: 12 new · 1675 total · demo 8093.
- **Note:** the demo localStorage is last-writer-wins across tabs (parallel demo checks can overwrite each other's demo data; live is unaffected).

## SD-30: football statTotals — DONE (1bb66b4, 2026-10-11)
- **Built:** `football/totals.ts` makes every live-credited key owned and absolute (merged with the minutes / keeper totals). `pid` is now on goal, assist, card and own-goal payloads. Own goals go to `ownGoals` (never goals). `headedGoals` is shown. Unresolved names drop the whole group (SD-40 pattern), so the D2 resync heals old lines where the names resolve.
- **Bug fixed:** the voice "refine goal type" path double-counted the scorer's goal on their live line.
- Tests: 12 new + contract · demo 8093.
- **Not done:** shoot-out taker stats (FB-14 needs UI). One goal with two assists keeps only the latest in totals.

## SD-90 athletics track; SD-31/40/44 basketball shooting; SD-33/41/82 kabaddi depth — DONE (665c38f, 2026-10-11)
- **SD-90:** athletics registered; event setup, round presets, lane draws, relays; results with keypad / hand times / reaction; stat lines; medal table; MR / SR; careers; hub; public `/r/`. No migration.
  - Limits: the main profile header still shows Apps / W-D-L / Win % for athlete-only users; same-team athletes aren't split across heats; no timed finals; no historic (pre-app) school records.
  - Left for SD-91–93: field events, road / XC, combined events, steeplechase, walks, 60 mH.
- **SD-31/40/44:** basketball misses (toggle), the FIBA box score, statTotals, career FG% / 3P%, EFF with misses.
  - **Choice:** after a mid-match "Track missed shots" switch-on, every make counts as an attempt; live lines lag until the completion sync. The alternative is to count only makes after the switch.
- **SD-33/41/82:** kabaddi statTotals, match centre, career rates.
  - **Choices:** a failed do-or-die point counts as "Extra pts"; tackle strike rate = tackles ÷ (tackles + opposing raids that scored and returned).
  - Tackle % isn't built (no failed-tackle capture).
- No migration. Tests all green · demo 8093.

## SD-105: racket team top performers — DONE (6ad1171, 2026-10-11)
- **Built:** team pages for the 6 racket sports show "Most wins" and "Best win %" (min 3 decided matches) from the schema leaders, counting team members only. Other sports are unchanged (golden; volleyball also shows SD-27's Blocks award).
- Tests: 17 new · demo 8093 (`sd105-*` badminton ties added to demo data).

## SD-27: leaderboards and award slots from the schema — DONE (526d50e, 2026-10-10) · **Wave 1 complete**
- **Built:** a `result` agg kind (W/L), qualifier units, the `leaderMins` per-tournament overrides UI (`LeaderMinimums`), `rankAwardCandidates` / `awardFormula` generated from the schema, per-sport categories and award slots (see the SD-27 report table in DEVLOG), and new POTM weights for racket sports and chess.
- No migration. Tests: 32 new · 1529 total · demo 8093.
- **Founder / research:** the default minimums are house choices, not from a rulebook. Confirm or adjust: basketball 2 games, volleyball 5 sets, racket 3 matches / 30 service points / 6 service games / 5 BP chances, football 180 minutes / 10 shots faced, kabaddi and carrom 2 matches.
- **Regression to fix (queued as SD-105):** team pages for badminton, TT, squash, padel and pickleball no longer show top performers (they came from the removed per-match "Top scorer").
- Not built: volleyball attack efficiency (needs attempts); chess performance rating (needs ratings).

## SD-24 + SD-104: career framework; racket rule/UX fixes — DONE (b3fbe7e, 2026-10-10)
- **SD-24:**
  - Built: `career.ts` with schema-driven sections for all sports but golf; best run, titles / finals (stage-tagged finals), singles / doubles split, partner records; history key stats; Win % tile fix.
  - Not shown yet: kabaddi raid strike % (needs SD-33 attempts), carrom slams (SD-86), basketball FG / 3P (SD-40), comebacks.
  - Titles need finals tagged `stage: 'final'`.
- **SD-104:** TT serve rule by target; tennis ace / DF only for the server; DF corrections via a `df` marker; first-server picker (squash / TT); squash icon; badminton serve dot; the doubles serving-order picker (tennis / padel).
- **Limits:** long double-fault rows are truncated at 375 px in the timeline editor; pickleball accepts `SET_FIRST_SERVER` but has no picker.
- No migration. Tests: 45 new · 1497 total · fingerprints unchanged · demo 8093.

## SD-22 + SD-23: serve/return stats; shared box score — DONE (ba10433, 2026-10-10)
- **SD-22:**
  - Built: pure `serveStats.ts`, which replays the point list through each reducer. It gives service and return points; game, set and match points converted / saved; longest run and biggest lead; holds / breaks / BP and golden points (tennis, padel); side-outs / hand-outs; and per serving player where the server is named.
  - `MatchStatsPanel` (Match / Set N) on the Score tab.
  - Career serve keys go into racket statTotals, coverage-aware (rates render with SD-24).
  - Not built: double faults in the panel (not in the point log), badminton "11-point interval", TT deuce-games count. Volleyball waits for SD-58.
- **SD-23:**
  - Built: pure `boxScore.ts` and `boxSources.ts`, plus `components/BoxScore.tsx` (MatchBoxScore + TeamComparison). Columns come from the schema `box`; there's a totals row, team / opponent-error rows so totals equal the score, period chips, pinned names, the bench on request, and untracked columns hidden.
  - 11 sports migrated; cricket keeps InningsCard. The old per-sport BoxScore components were deleted. Golden tests: identical cells per sport and period.
  - The Summary tab gains a Box score section for every sport. Football gets a per-player table (FB-09).
  - Left for SD-40: basketball FG/3P/FT made-attempted, OREB/DREB, EFF. Carrom has a comparison only (boards aren't credited to players).
- No migration. Tests: 62 new · 1454 total · demo 8093 (basketball, football, kabaddi, volleyball, tennis; tennis and badminton stats panels).
- **Guides:** the basketball, volleyball, football, kabaddi and pickleball guides are over 900 words (954–1260). Trim them in a later docs pass.

## SD-26: Swiss done properly — DONE (a845a64, 2026-10-10)
- **Built:** C.07-2023 tie-breaks (BH / C1 / M1, SB / C1, PS / C1, BPG, BWG, WIN, WON) as standings columns; FIDE Swiss and FIDE round robin chess presets; the Dutch-style pairing with colour allocation; `white` stored per fixture; the not-FIDE-certified label.
- **Default order:** BH-C1, BH, SB, PS, h2h, wins, BWG. Source: C.02 §13.16.4, read via a library quoting the handbook. C.07 itself leaves the order to the organiser.
- No migration. Tests: 24 new · values match the FIDE Arbiters' Commission tie-break exercise crosstable · 200 simulated events.
- **Displayed changes on existing chess data:**
  - Swiss SB includes your own bye or forfeit as a dummy contribution;
  - in round robins, forfeits now count in SB (C.07 15.2, reversing the SD-10 choice);
  - the settings row reads "FIDE round robin" where nothing was saved.
- **Pairing limits:** the full C.04.3 quality criteria (float history, top-scorer exception, accelerated pairings, requested byes) are not built. Near-complete round robins may need a flagged relaxation.

## SD-20: game/set score line everywhere; ret. / def. / w/o / abandoned; LineScoreboard for every set/game sport — DONE (a845a64, 2026-10-10)
- **Built:**
  - `scoreline.ts`: the line score as data (`LineScore`, `plugin.lineScore` on tennis / padel / badminton / TT / squash / pickleball / carrom / volleyball); `lineText` (completed sets = the SD-01 `scoreLine`, byte-identical; `partial` adds the unfinished set); `resultMark` + `markedLine` + `matchScoreLine` ("6-4, 3-2 ret.", "21-15, 8-3 def.", "w/o", "11-4 abandoned"); `finalBoard` (sets won + marked line); `lineGrid` (the board model); `compactResult`, `bracketCellText`.
  - `matchLine.ts` (registry-aware): `matchLine(m)`, `matchLineFor(m, teamId)`, `resultWords`.
  - `SetLineBoard.tsx`: the shared LineScoreboard. Tennis / badminton / volleyball moved onto it; **new** boards for table tennis, squash, pickleball (rallyCore, serve dot by ITTF rotation / side-out / last rally), padel (POINTS + games, match tiebreak as a "TB" column) and carrom. A match closed by hand renders final: "Match Over · Retired", no highlight, winner's trophy.
  - Surfaces: share text (sets won + marked line, never "40"), MatchCard, bracket cells (staged match: scoreline between the sides) and series legs, SeriesScreen legs, SportHub results, Calendar, team head-to-head (latest meeting: "Last: L 0–1 · 4-6, 2-3 ret.") and form chips, profile history, Correct match, ticker / OBS overlay, the End-match preview.
  - **Racket wording** (`retireTerms`): End-match chips **Retired** (= conceded, "ret.") and **Default** (= awarded, "def."); "Asha won — Bina retired (Injury)", "Asha won by default — …". A retirement before any point reads "w/o". The legacy `retireMatch` (awarded + reason "Retired") reads "ret.". Volleyball / carrom keep Conceded / Awarded with plain words ("25-20, 10-8 awarded").
  - **Padel:** the match tiebreak's points now stored in its set entry ([10-7], as tennis); old snapshots (0-0 + `tb`) display the same. Tennis/padel set chips showed "10-8(8)" for a match tiebreak — fixed via `cellText`.
  - **Manual end score:** a set/game sport now stores sets/games won as `result.score` (before: the live points, e.g. 30-15).
- **Choices:**
  - no_result in racket sports reads "abandoned" (ITF has no "no result").
  - The match-tiebreak column is labelled "TB" (tennis used the set number before).
  - Fixtures print/PDF lists upcoming matches only (its Result column is for writing in) — left unchanged.
  - No push notification on a manual end (none existed); the natural full-time alert already used the line.
- No migration. Tests: `tests/scoreline-everywhere.test.mts` 24 new; padel pins updated (match-TB set entry, 2 fingerprints in final-score / replay-racket). tsc clean; `npm test` 1387 pass, 3 fail — all in `chess-swiss.test.mts`, the parallel SD-26 work in progress.
- **Demo 8093 (375 px), local ad-hoc matches only (no demo data written):** table tennis live board (GAMES + per-game columns, live game highlighted, serve dot) and final after End match → Retired: "MATCH OVER · RETIRED", 1 / 11 5 vs 0 / 7 3, summary "11-7, 5-3 ret.", share text "🏓 RESULT / Asha 1 / Bina 0 / 🏁 Asha won — Bina retired (Injury) / Match Over · 11-7, 5-3 ret."; tennis 6-4, 3-2 (30-15) retired → board "Match Over · Retired · best of 3", "6-4, 3-2 ret." in preview/summary/share; volleyball results list shows the set line.
- **Not verified in the demo:** bracket cell / series leg / team H2H rows (no racket knockout or H2H data in the demo store; unit-tested), the OBS overlay for a closed match (unit-tested via `buildTicker`), padel / carrom boards (typechecked, same component).
- **Guides:** end-a-match-early (racket Retired / Default + score-line marks; now ~1030 words, over the 900 guideline), live-score-overlay ([10-7], "ret."). `npm run website:build` OK.

## SD-19 + SD-29: absolute racket statTotals with the D2 backfill tool; on-field tracker — DONE (3ad046a, 2026-10-10)
- **SD-29:**
  - Built: `onField.ts` (minutes, starts, +/-, sets played, timed suspensions, short-handed count), football minutes for all and an optional sin-bin, basketball MIN / +/-, volleyball setsPlayed.
  - Hockey and handball rules are tested ahead of their plugins.
  - Limits: name-only legacy subs get no minutes; basketball MIN is approximate (whole-minute clock); volleyball without a lineup counts the whole squad as on court.
- **SD-19:**
  - Built: the statTotals contract and harness; `racketTotals.ts` for tennis / badminton / TT / squash / padel / pickleball (+ volleyball sets W-L).
  - `doubleFaults` stays on live increments (partial).
  - `partnerId` is derived but **not stored** — it needs a column or SD-24 pairing.
- **D2 backfill (founder, when you want past matches healed):** open the live web app signed in as an organiser/host, then in the devtools console run `await __sportnnoteAdmin.resyncSportLines('tennis', undefined, { dryRun: true })` to preview and `await __sportnnoteAdmin.resyncSportLines('tennis')` to write. Repeat per sport. Only rows your account can update (RLS) are written.
- No migration. Tests: 75 new · 1342 total · demo 8093.
- **Small issues noted:**
  - tennis history rows read "0 aces";
  - the Win % tile truncates at 375 px;
  - the demo localStorage store is last-writer-wins across tabs (affects parallel demo checks only).

## 2026-10-10: migrations 0050 + 0051 run live (founder); Wave 0 + Wave 1 so far pushed
- Verified read-only: `stat_lines.result` + check exist (live has 0 stat lines, so the backfill had nothing to do); `field_entries.team_id` exists, `player_id` is nullable, and the marker rule is golf-only.
- Pushed to GitHub and `main` (the website redeploys). The app publish (web + OTA) waits until SD-19 and SD-29 are committed, since builds use the working tree.

## SD-19: absolute statTotals — contract, harness, racket implementation, D2 backfill — DONE (3ad046a, 2026-10-10)
- **Contract** (documented on `SportPlugin.statTotals`, `src/sports/types.ts`): pure; owned live keys equal the sum of live increments (attribution / extra / attribution2, STAT_ADJUST incl.) per player, zeros included; survives EDIT_LOG, AMEND and undo (every prefix); a missing owned key reads 0; derived keys ≥ 0; a non-partial plugin owns every live key. New optional `ctx` (`StatTotalsContext`: each side's players) and `statTotalsNeedsPlayers`; entries may carry a derived `partnerId`.
- **Harness:** `tests/statTotalsHarness.mts` (`assertContract`, `assertSameAsClean`, `amendRecord`, `toRecords`, `liveSums`) — later items add a case to `tests/stat-totals-contract.test.mts`.
- **Racket implementation:** one `src/sports/racketTotals.ts` for tennis, padel, badminton and the rally engine (table tennis, squash, pickleball). Point events now keep the credited `playerId` (and `pointRows` carries it into EDIT_LOG lists); old logs resolve names through ctx. Wired as `statTotals` + `statTotalsPartial` + `statTotalsNeedsPlayers` on all six plugins; schema keys declared (`racketRecordStats`, group `record`, hidden from the history row).
- **Keys per player:**
  - all six: `points` (existing), `ptsWon` / `ptsLost` (side's rally points), `gamesWon` / `gamesLost`, `decidersPlayed` / `decidersWon` (deciding game, or set for tennis / padel);
  - tennis / padel also: `setsWon` / `setsLost`, `tiebreaksPlayed` / `tiebreaksWon` (set + match tiebreaks; a match tiebreak counts as 1 game, as SD-17);
  - tennis also: `aces`. `doubleFaults` stays on increments (partial) — an EDIT_LOG point list can't carry it;
  - volleyball: `setsWon` / `setsLost` (merged with SD-29's `setsPlayed`).
  - Singles / doubles = the SD-25 line context (no key). **Partner:** `partnerId` on the totals entry only — `stat_lines` has no column and `stats` is numbers-only, so storing it needs a migration (or SD-24 pairs lines by match + side).
- **Wiring:** `repos.matchStatTotals` (loads `statTotalsContext`: squad starters, else a ≤ 2-player entry roster, with names) used by useLiveMatch completion / correction and `publishAmendment`. Cricket / football unchanged (no ctx, no extra reads).
- **D2 backfill — `repos.resyncSportLines(sport, matchIds?, { dryRun? })`**: replays each completed match's stored log (AMENDs applied; tournament format merged; snapshot fallback when there is no log), recomputes the totals and writes only changed `stat_lines` rows (dispute-mapped). Never touches the match row, snapshot, tournament settings or awards. Not run automatically. **How to run (founder):** open the web app signed in as an account allowed to update those stat lines, open devtools → Console:
  - `await __sportnnoteAdmin.resyncSportLines('tennis', undefined, { dryRun: true })` — reports rows it would write;
  - `await __sportnnoteAdmin.resyncSportLines('tennis')` — writes; repeat per sport (`badminton`, `padel`, `tabletennis`, `squash`, `pickleball`, `volleyball`; also `cricket` / `football` to heal past lines); pass `['<matchId>', …]` to limit it. A second run writes 0.
- No migration. Tests: 33 new (18 contract + 15 racket) · 1343 total · tsc clean.
- **Demo 8093 (375 px):** badminton doubles (3-1, 0-3, 3-1) — Sana Iyer's profile: Points 3, Points won 6 / lost 5, Games 2-1, Deciders 1 / won 1; tennis Fast4 (4-0, 3-4(2), 4-0) — Wren Kapoor: Sets 1-2, Games 4-11, Points 17 won / 46 lost, Tiebreaks 1 / won 1, Deciders 1 / won 0. Backfill dry-run on a finished match: 0 rows (already absolute).
- **Notes / not verified:** live Supabase path and RLS for the founder's backfill account; the history row now shows "0 aces" for a tennis line without aces (totals write the zero); Win % still truncates "100%" at 375 px (SD-25 note); the console handle is set at module load (a Fast Refresh in dev can leave it pointing at a fresh demo store — reload first).

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
