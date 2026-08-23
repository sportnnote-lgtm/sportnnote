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
