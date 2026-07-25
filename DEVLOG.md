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
- **Reset demo to a clean seed:** clear `localStorage['sportfolio.demo.v1']` and reload.
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

### 2026-07-25 — UI design pass, batch 4: empty & loading states app-wide (workstream C) · SHIPPED + VERIFIED

Across the app, "nothing here yet" was a lone grey sentence — which reads as broken, not empty.
Made one shared component and swept every list.

- **Shared `EmptyState`** (`components/ui.tsx`, sits next to `LoadingState`): an icon, a primary
  line, and an optional hint about when the section will fill in; a `compact` variant for use inside
  cards/tables. Standings' local copy was removed in favour of it.
- **Swept ~25 sites** across ~18 files to the shared component with a contextual icon + hint:
  Matches (live/upcoming/completed), Home upcoming, Notifications, Calendar (day + agenda),
  Discover players, Team/Squad/MatchSquad/CricketLineup/LineupEditor squads, Tournament matches,
  OrganizerDashboard fixtures, SportProfile stats, TryNewSport, GenerateFixtures, the Verification
  console ("🎉 all caught up"), Organization teams/players/events, and the shared components
  LeagueTable, StatLeaderRail, HostsCard, ConnectBoard. Small inline instructional hints
  (mid-builder guidance like "tap players below") were intentionally left as text.
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
