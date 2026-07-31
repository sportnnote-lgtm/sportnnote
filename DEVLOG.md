# Sportfolio — Development Log

A running record of the product + engineering work done on Sportfolio (the Expo/React
Native multi-sport scoring app — "CricHeroes for every sport", school/college sports
meets in India). Kept as a reference for what was built, why, where, and how it was
verified. **Maintained continuously — new work is appended here as it ships.**

> Convention: each entry notes the change, the key files, and its verification status.
> Dates are absolute. "Demo mode" = the in-memory/AsyncStorage build (no Supabase),
> which is how the app runs locally.

---

## Quick reference

- **Run (web demo):** `npx expo start --web --port 8091` (demo mode = in-memory sample data).
- **Reset demo to a clean seed:** clear `localStorage['sportfolio.demo.v18']` and reload.
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
