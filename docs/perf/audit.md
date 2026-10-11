# Performance audit: sign-in delay and launch lag

Audited 2026-10-12. This was a read-only audit: no app code was changed, and nothing was migrated, deployed or committed. Branch `feat/sport-formats-and-scoring` @ 09a7e7d.

What was measured:
- curl timings to the live edge functions, REST and Auth from Hyderabad;
- read-only queries on the live DB (`pg_stat_statements` since 2026-09-22, `pg_stat_user_tables`, `EXPLAIN ANALYZE`);
- `npx expo export` for Android and web with source maps, plus a per-module size breakdown;
- downloads of the production web bundle from `sportnnote.expo.app`.

What could not be measured: on-device Hermes evaluation time and the real Firebase SMS round trip. No SMS was sent and no data was created. Where a number is an estimate, it is labelled as one.

---

## 0. First, which app was it?

**Phone sign-in does not exist in the Android APK.** `firebasePhoneAvailable()` returns true only on the web (`src/core/firebasePhone.ts:30-31`, `Platform.OS === 'web'`). The APK's sign-in screen therefore shows email only: `SMS_LOGIN_ENABLED = false` (`src/screens/AuthScreen.tsx:37`) and `PhoneLoginCard` is hidden (`:190`). The OTA script also never loads `EXPO_PUBLIC_FIREBASE_*` (`scripts/publish-android-ota.sh:20`).

So the 5–10 s "send code" delay the founder saw on an Android phone was almost certainly the **web app in Chrome or the Home-screen icon** (sportnnote.expo.app, which app.sportnnote.in redirects to with a 301). Everything in §1 assumes that. The launch-lag findings in §2 apply to both the APK and the web app.

> **NEEDS FOUNDER OK / question Q1:** Were you signing in on the web app in Chrome (or the Home-screen icon), not the installed APK?

---

## Measurements

| What | Result |
|---|---|
| Edge function region | `x-sb-edge-region: ap-south-1` (Mumbai) on every call, via Cloudflare HYD. DB host is AWS ap-south-1 (IPv6 2406:da1a::/32). |
| Edge function **cold** start (OPTIONS, no DB work) | **2.0–2.6 s** (phone-login 2.48/2.24/2.12 s; verify-phone-firebase 2.26/1.85/2.21 s; guardian-link 2.57 s; message-notify 2.01/2.24 s; support-assistant 2.43 s; delete-account 2.31 s) |
| Edge function **warm** | **0.16–0.24 s** (phone-login ×6: 0.16–0.19 s). Stayed warm after idle gaps of 30, 90, 180 and 300 s (0.18–0.34 s). Two back-to-back calls can both be cold (separate instances). |
| Gateway floor (404 for an unknown function) | 0.08 s |
| REST / Auth round trip from Hyderabad | 0.03–0.06 s |
| Web first download (gzip) | main `index-*.js` **1.09 MB** (4.13 MB raw) + `__common` 117 KB. 0.57 s here on fibre; estimated 2–5 s on Indian 4G. |
| Web lazy chunks | 82 more files, 2.2 MB raw; the firebase/auth chunk is 215 KB raw |
| Android bundle | 7.2 MB JS → **12.0 MB Hermes bytecode** (single bundle) |
| `players_view` (live, pg_stat_statements) | **106 ms mean** over 619 calls, 416 ms mean in one variant. Only 19 players. |
| `push_allowed_targets()` RPC | **750 ms mean** over 216 calls, again on tiny tables |
| Seq scans on `players` | 145,222 (no `profile_id` index; every RLS check runs `auth_player_ids()`) |

---

## Findings

Each finding has its own ID (F-nn); their order within a section is a reading order and does not change the rank. Savings are per occurrence unless stated. "Visible?" says whether anything changes for the user.

### P0: the sign-in delay (web phone sign-in)

**Where the time goes today** (critical path, sequential; estimates for Indian 4G with 150–300 ms RTT):

*Tap "Send code" → code box*, `PhoneLoginCard.tsx:50-55` → `sendPhoneCode` (`firebasePhone.ts:62-90`):
1. `import('firebase/app')` and `import('firebase/auth')`: two lazy chunks downloaded the first time, about 280 KB raw (`:41-42`, `:66`). 0.3–1.0 s.
2. `getAuth()` initialises and reads IndexedDB persistence. About 0.1 s.
3. Firebase `signInWithPhoneNumber` (`:79`). Inside it, these run in sequence: the reCAPTCHA config lookup (identitytoolkit) → `getRecaptchaParams` (identitytoolkit) → the `recaptcha/api.js` loader → `recaptcha__en.js` (≈150 KB gzip) → the anchor iframe → the invisible challenge `execute` → `sendVerificationCode`. That is about 6–8 Google round trips plus about 200 KB of script. **2–6 s.** If reCAPTCHA decides to show an image puzzle, the delay is unbounded.
4. The code box appears only after step 3 resolves (`setStep('code')`, `:54`).

*Tap "Continue" → Home*, `PhoneLoginCard.tsx:57-63` → `confirmPhoneLogin` (`phoneLogin.ts:53-57`):
1. `confirmation.confirm()`: one or two Google round trips. 0.3–0.6 s (`firebasePhone.ts:97`).
2. `getIdToken()`, `authInstance()`, then `signOut()`, run in sequence. About 0.05–0.1 s (`:98-100`).
3. The `phone-login` edge function (`phoneLogin.ts:32`). **Cold start 2.0–2.6 s, measured.** This function is rarely called, so it is nearly always cold. Inside it, 6 sequential hops follow: rateLimit(ip) → the JWKS fetch from googleapis on a cold worker → rateLimit(phone) → `phone_login_lookup` → `getUserById` → `generateLink` (`supabase/functions/phone-login/index.ts:58,64,71,74,39,43`). 0.3–0.6 s.
4. `supabase.auth.verifyOtp()`: one round trip, 0.2–0.4 s (`phoneLogin.ts:42`).
5. `SIGNED_IN` → `loadProfile()` sets `loading=true` (`src/core/auth.tsx:143`). The whole navigator is swapped for a spinner (`RootNavigator.tsx:291`) until the `profiles` select returns, 0.2–0.4 s.
6. Home mounts and starts about 30–40 requests (see F-07/F-08). On Android Chrome these share HTTP/2. On the APK they queue 5 at a time (OkHttp's per-host limit). Feed spinner: 1.5–4 s.

Total: **about 3–8 s to the code box, and about 4–8 s from Continue to a filled Home.** This matches the report.

| ID | File:line | Cause | Est. saved | Fix (size) | Visible? |
|---|---|---|---|---|---|
| **F-01** | `src/core/firebasePhone.ts:40-45, 62-79`; `src/components/PhoneLoginCard.tsx:24` | Firebase SDK, auth init and reCAPTCHA are loaded only **after** the tap | **1.5–4 s** off "send code" | Pre-warm when `PhoneLoginCard` mounts (or when the number field is focused): start the `firebase/app` and `firebase/auth` imports, run `getAuth`, create the invisible `RecaptchaVerifier` and call `verifier.render()`. That loads the reCAPTCHA scripts and site key ahead of time. On tap, only `verify` and `sendVerificationCode` remain. Keep the "fresh host per send" rule by re-rendering after each use. Also add `<link rel="preconnect">` for `www.google.com`, `www.gstatic.com` and `identitytoolkit.googleapis.com`. **S** | No |
| **F-02** | `src/core/phoneLogin.ts:31-34`; `supabase/functions/phone-login/index.ts` | `phone-login` is cold on almost every sign-in (2.0–2.6 s measured) | **≈2 s** off "verify" | Fire-and-forget a warm-up `OPTIONS` (or a `GET`, which returns 405 without touching the DB) to `functions/v1/phone-login` when "Send code" succeeds. The user then spends 10–60 s reading the SMS, so the worker is warm (it stayed warm through 300 s idle in tests). **S** | No |
| **F-03** | `src/components/PhoneLoginCard.tsx:50-55` | The code box waits for Google to confirm the SMS was sent | **perceived 2–6 s** (actual SMS arrival unchanged) | Switch to the code step straight away with "Sending code…". Let `confirm` await the pending send promise, and show any send error on the code step with "Change number". **S** | **Yes — NEEDS FOUNDER OK (Q2)** |
| **F-04** | `supabase/functions/phone-login/index.ts:58-76, 38-50` | 6 sequential hops inside the function. `getUserById` runs only to read the email and ban state. | 0.1–0.3 s | Run `rateLimit(ip)` in parallel with `verifiedPhoneFromToken`. Make `phone_login_lookup` also return `email`, `deleted_at` and `banned_until` (security definer on `auth.users`) so `getUserById` can be dropped. Optionally fold both rate limits into one RPC. **S–M** (function plus a small migration) | No |
| **F-05** | `src/core/auth.tsx:141-167`; `src/navigation/RootNavigator.tsx:291-296` | After `verifyOtp`, `loadProfile` sets `loading=true` and the whole app becomes a spinner until `profiles` returns. Only after that does Home start its own fetches. | 0.2–0.4 s | Build a minimal profile from the session's `user_metadata` (name, role) so Home mounts at once, then fill in from `profiles`. Combine with F-06. **S** | No |
| **F-06** | `src/core/auth.tsx:160` → `:45` | Every `loadProfile` also calls `supabase.auth.getUser()` (a network round trip) plus a `players_view` read to sync the email, every time, even for phone accounts whose placeholder email is skipped *after* the round trip | 1 RTT off the network queue | Check the session's `user.email` and `email_confirmed_at` locally (the session already has them) and skip when the address ends in `@phone.sportnnote.in`. Run it once per user per app run. **S** | No |

### P0: launch lag (APK and web)

| ID | File:line | Cause | Est. saved | Fix (size) | Visible? |
|---|---|---|---|---|---|
| **F-07** | `src/core/auth.tsx:129-137, 141-143`; `src/navigation/RootNavigator.tsx:291` | **Every auth event reloads the profile behind a full-screen spinner.** `onAuthStateChange` calls `loadProfile` for *every* event. supabase-js 2.108 sends `INITIAL_SESSION` at start-up, which duplicates the `getSession()` call (so every profile query and side-effect runs twice at launch). It sends `TOKEN_REFRESHED` about hourly on native. **On the web it sends `SIGNED_IN` every time the tab or Home-screen app becomes visible again** (`GoTrueClient.js` `_onVisibilityChanged` → `_recoverAndRefresh` → `SIGNED_IN`, verified in node_modules). `loadProfile` sets `loading=true`, so RootNavigator unmounts the whole `NavigationContainer` and shows a spinner. Result: a spinner on every return to the web app; on native, an hourly reset to Home that loses the user's place (breaks "minimise keeps place"); and double start-up queries. | 0.3–1 s per resume, ×2 queries at launch, and no lost place | In `onAuthStateChange`, ignore `INITIAL_SESSION` (getSession already covers it) and `TOKEN_REFRESHED`. For `SIGNED_IN`/`USER_UPDATED`, reload *silently* (never set `loading=true`) when the user id has not changed. Set `loading=true` only when there is no profile yet. **S** | Yes, but only by removing a bug (no spinner flash, place kept). No OK needed. |
| **F-08** | `src/data/reminders.ts:303-324, 367-384`; `src/navigation/RootNavigator.tsx:215` | **The reminder engine floods the network at launch and every minute.** On mount, and then every 60 s, it runs `runReminderCheck` **and** `syncDeviceReminders`. Each calls `gatherReminderInputs` separately, and each of those runs: `getMatches` (2 sequential queries) + `getTournaments` + `getOrganizations` + **one `getTeamLeaders` per team in an upcoming match** + **one `getMatchSquads` per upcoming match** + `getPlayers` (the slow `players_view`, F-12). That is ≥ 2×(6 + 2N) requests per minute for as long as the app is open. At launch they compete with Home: the APK's OkHttp allows 5 requests per host at once, so Home's feed waits in the same queue. | **0.5–2 s** off the first Home paint today, growing with match count. Less battery and data use. | (a) One shared `gatherReminderInputs` per tick. (b) First tick about 10 s after launch, not at once. (c) Batch leaders and squads into one `in()` query each. (d) Read only *future scheduled* matches from the server (`gte('starts_at', now)`) instead of all. (e) Tick every 5 min, or on focus/AppState. a–d are **S–M**, no visible change. (e) changes reminder timing. | (a–d) No. (e) **Yes — NEEDS FOUNDER OK (Q3)** |
| **F-09** | `src/screens/HomeScreen.tsx:39, 42, 66-75`; `src/data/repos.ts:346-360, 373-391, 435-468`; `src/data/hooks.ts:88-103, 184-196, 571-613` | **Home downloads the whole app on every focus.** `useScopedMatches` fetches **all** matches, all tournaments, follows and my player id, then **rosters for every team in every match** (2 `in()` queries), and filters in the phone. `usePlayerProfile`, used only for `player.sports` and eligibility, fetches **all matches again** plus all field events, all stat lines and the player. `useMyTournaments` fetches all tournaments again plus host tournaments. `getMatches` itself runs 2 sequential queries (`deletedTournamentIds` then matches). In total about 15–20 requests, 2–3 RTT deep, every time Home gains focus. Unbounded reads will hit PostgREST's row cap as data grows. | **0.5–1.5 s** per Home open today; grows linearly with data | (1) On Home, swap `usePlayerProfile` for a light `getPlayer(playerId)`, since Home does not need stats (**S**). (2) Run `deletedTournamentIds` in parallel with the matches query, or filter with a `not.in`/join on the server (**S**). (3) Dedupe `getTournaments` between the two hooks (**S**). (4) Then add a `home_feed(profile)` security-definer RPC that returns the scoped feed, tournaments and my player id in one round trip, as already proposed in `docs/international/latency.md` step 2 (**M**, needs RLS review). | No |
| **F-10** | `src/data/repos.ts:3843-3848`; 62 call sites (`RootNavigator.tsx:256`, `orgContext.tsx:56`, `HomeScreen.tsx:69`, `reminders.ts:377`, `repos.ts:350,437`, …) | `getMyPlayerId` is a fresh network query every time, about 6–8 times at launch and again on every Home focus | 5–8 requests at launch | Memoise per `profileId` (an in-flight promise plus the value), and clear it on sign-out or `createMyPlayer`. **S** | No |
| **F-11** | `src/navigation/RootNavigator.tsx:275-279`; `src/navigation/lazyScreens.ts:24-31` | `prefetchScreens()` runs 2.5 s after launch **on native too**. There, every "lazy" screen is already in the single bundle, so the prefetch just **evaluates ~80 screen modules at once on the JS thread** and gains nothing (the comment at `lazyScreens.ts:5` says so). That lands just as the user starts tapping. | est. 0.2–0.8 s JS-thread stall on a mid-range Android | `if (Platform.OS !== 'web') return;` in `prefetchScreens`. On the web, start it after the Home feed has loaded or on `requestIdleCallback`, so the 2.2 MB of chunks does not compete with the first data. **S** | No |
| **F-12** | live view `public.players_view` (`supabase/migrations/20261019124600_protect_minors.sql:223+`); `auth_player_ids()` (`20260709120000_production_hardening.sql:49-52`) | `players_view` runs 3–4 security-definer functions **per row**. The planner inlines the `me` sub-select, so `my_player_circle()` (→ `player_circle_of`) is evaluated per row for signed-in users: **106 ms mean for 19 rows** (EXPLAIN as anon: 29 ms). That projects to seconds at 1,000 players. There is also **no index on `players(profile_id)`**: `auth_player_ids()`, used by nearly every RLS policy, seq-scans `players` (145k seq scans so far). | 0.1 s per players read today; avoids multi-second reads at scale | Migration: `create index on players(profile_id)`. Rewrite `players_view` so `my_player_circle()` and `auth.uid()` are computed once, for example `cross join (select … from (select my_player_circle() as circle) x offset 0) me` or a `MATERIALIZED` CTE. **S** (migration; founder runs it) | No |
| **F-13** | `public/sw.js:93-107` | The service worker writes each Supabase GET into the cache **before** handing the response to the app (`await c.put(...)`). Every data read on the web waits for the full body to download plus a cache write. | 10–50 ms per request; more on slow phones | `event.waitUntil(c.put(req, res.clone()))` and return `res` at once. **S** | No |
| **F-14** | `public/sw.js:62-76` | Page loads are network-first with **no timeout**. On weak signal at a ground ("lie-fi"), opening the Home-screen app waits for the HTML fetch to fail, which can take 10 s or more, before using the cached shell. | up to 5–20 s on bad signal | Race `fetch` against a 2.5–3 s timeout, then serve the cached `/`. The newer version still installs in the background. **S** | Only on bad signal: the app opens from cache sooner (the newest version arrives on the next open) |
| **F-15** | `src/sports/registry.ts:8-36`; `src/screens/HomeScreen.tsx:18` | **All 29 sport plugins are loaded eagerly**, engines and scorer UI together. Home imports `registry` for names and icons, so they all sit in the first web download (`src/sports` is about 1.4 MB raw of the 4.1 MB main chunk) and are all evaluated at native start-up (there are no inline requires). | Web: about −1.5 MB raw (≈ −400 KB gzip) on first visit, est. 1–2 s on 4G. Native: est. 150–400 ms less start-up evaluation. | Split `sportMeta.ts` (id, name, icon, participantKind) from the plugins. Load plugins through `getSportAsync(id)` (a lazy import per sport) in LiveScoring, standings and other screens. **L** (touches many screens; do it after the S items) | No |
| **F-16** | `src/core/auth.tsx:125-128` | A signed-in launch waits for `getSession()`, which **refreshes the token over the network** if the app was closed for more than about 1 h, and then for the `profiles` select, before anything renders. Only then does Home begin its fetches. | 0.3–1 s | Cache the last profile in AsyncStorage and render Home from it at once, then revalidate. Pre-start the Home feed request in parallel with profile loading (latency.md step 5). **S–M** | Barely: Home appears at once with the last known name and role, then refreshes. **NEEDS FOUNDER OK (Q4)** if the cached Home *feed* is shown too. |

### P1: smoothness and scaling

| ID | File:line | Cause | Est. saved | Fix (size) | Visible? |
|---|---|---|---|---|---|
| **F-17** | `push_allowed_targets()` (`supabase/migrations/20261006120000_security_hardening.sql:1111-1162`); called by `push-send` (`supabase/functions/push-send/index.ts:55`) | **750 ms mean** on tiny tables. It evaluates `can_manage_match`/`can_edit_team_roster` for every match and team, then several correlated `EXISTS` per target. Not on the scorer's tap path (`pushToPlayers` is fire-and-forget), but every notification costs about 1 s of DB CPU, and this grows with data. | 0.5–1 s per push now; many seconds later | Restrict `my_teams`/`my_matches` with indexed predicates first (team_members by player, matches by `host_ids`/`scorer_ids` GIN, teams by `captain_id`), and call `auth_player_ids()` once. **M** | No |
| **F-18** | live DB indexes | Foreign keys with no index on hot paths: `players.profile_id` (F-12), `matches.home_team_id`/`away_team_id`, `team_members.player_id`, `teams.captain_id`/`vice_captain_id`, `tournaments.organizer_id`/`host_org_id`, `stat_lines` by match is covered. Tables are tiny today (39 matches), so this is a scaling fix. | small now | One migration with these indexes. **S** | No |
| **F-19** | `src/data/hooks.ts` (every `use*` hook uses `useFocusEffect`) | Every hook refetches on every focus, with no cache or dedupe. Moving between tabs and screens repeats the same reads (getMatches by itself is called by about 8 hooks). | 0.2–1 s per navigation | A small shared cache (key → promise + timestamp; reuse within 15–30 s, invalidate on writes) in `repos.ts` for `getMatches`, `getTournaments`, `getOrganizations` and `getPlayers`. **M** | No (data at most 30 s old on a back-navigation, still refreshed on pull or write) |
| **F-20** | `src/screens/LiveScoringScreen.tsx` (2,766 lines, one component); `src/sports/cricket/index.tsx` (2,611 lines, 0 `useMemo`/`memo`), `football/index.tsx` (0) | Each scoring tap re-renders the whole screen, including the scoreboard, panels and a timeline of up to 60 rows (`LiveTimeline.tsx:16`) | est. 16–60 ms per tap on mid-range Android | `React.memo` on `Scoreboard`, `LiveTimeline` and the stats panels, keyed on the state slices they read. Memoise the per-sport derived summaries. **M** | No |
| **F-21** | `src/data/useLiveMatch.ts:213-240, 401-415` | Undo, reset and amend refetch the **whole event log** and replay it before the screen updates | 1 RTT + replay per undo | Pop locally and re-derive from the in-memory log, then reconcile in the background. **M** | No |
| **F-22** | not done: I-3 "pin edge functions to Mumbai" (`docs/international/latency.md:26`, `docs/international/audit/SUMMARY.md:82`) | No `region`/`x-region` anywhere in `src/` (14 `functions.invoke` calls). **Indian users are already served from ap-south-1** (measured), so this does not affect the founder's delay. It matters only for Gulf, UK and other international users. | 0 in India; about (hops − 1) × RTT abroad | As written in latency.md: `region: FunctionRegion.ApSouth1` on the chatty functions, including `phone-login`. **S** | No |
| **F-23** | DB: `SELECT name FROM pg_timezone_names` (188 calls, 598 ms mean) | This is PostgREST reloading its schema cache (about 190 reloads, one per migration or DDL). It does not affect normal requests. Note it because running many small migrations at busy times causes brief stalls. | — | Run migrations in quiet hours (no code change) | No |

### P2: bundle hygiene

| ID | File:line | Cause | Est. saved | Fix (size) | Visible? |
|---|---|---|---|---|---|
| **F-24** | `src/core/phone.ts:20-22` | `libphonenumber-js/max` metadata (153 KB) and the `mobile/examples` data are parsed at start-up; `auth.tsx` imports `phone.ts` | est. 20–60 ms start-up; −100 KB web | `libphonenumber-js/mobile` metadata, which still validates mobile numbers. Load `examples` lazily (placeholders only). **S** | Possibly slightly different validation for non-mobile number types. **NEEDS FOUNDER OK (Q6)** |
| **F-25** | `src/data/demoStore.ts:809+`; `src/navigation/RootNavigator.tsx:17-21` | In live builds, the demo seed (≈118 KB of seed files) is still built at module load, and 5 dev and demo seed registrars are imported | est. 20–50 ms start-up | Build `demo` lazily (a getter, or an `isSupabaseConfigured` guard), and import the seed registrars only in demo or dev builds. **S–M** | No |
| **F-26** | Android bundle: `@firebase/auth` RN build 105 KB | Bundled into the APK (from `firebasePhone.ts`'s dynamic import) but never used on native | −105 KB (size only, not evaluated) | Move it into `firebasePhone.web.ts` with a native stub. **S** | No |
| **F-27** | `react-native-svg` pulls in `css-tree` + `entities` (≈190 KB) | These come from svg's CSS support, which the app does not use | small | Leave it, or alias them away via `metro.config.js` (there is no metro config yet). **S** | No |
| **F-28** | no `metro.config.js` → `inlineRequires: false` (Expo default, `@expo/metro-config` ExpoMetroConfig.js:326) | The whole static import graph is evaluated before the first render on native | est. 100–300 ms (larger once F-15 is done) | Add `metro.config.js` with `inlineRequires: true`. It needs a full regression pass, because module side-effects such as seed registrars and `startTelemetry` ordering change. **M** | No (if tests pass) |

### Checked and found fine

- **OTA updates do not block launch.** No `updates.checkAutomatically`/`fallbackToCacheTimeout` is set, so the defaults apply: check on launch with `launchWaitMs = 0` (expo-updates `UpdatesConfiguration.kt:168`). The download runs in the background. Its only cost is bandwidth competing with first data right after an OTA publish.
- **Hermes is on** (the OTA ships `.hbc`). There are no custom fonts and no `expo-font` wait. The splash hides on first render, so the visible wait is RootNavigator's spinner (F-07/F-16).
- **Analytics and consent are off the critical path.** `startTelemetry()` queues `app_open` and flushes every 15 s. The `hydrate*` calls in `App.tsx:27-31` are fire-and-forget. The consent banner is UK/EU only.
- **Live scoring taps are optimistic**, going through the durable outbox (`useLiveMatch.ts`). `pushToPlayers` is fire-and-forget.
- **Play Integrity does not apply.** The web uses reCAPTCHA (F-01), and the APK has no phone sign-in.
- **Regions.** The DB and the edge functions both run in Mumbai.

---

## Founder questions (NEEDS FOUNDER OK)

1. **Q1:** Was the slow phone sign-in on the **web app** (Chrome or the Home-screen icon)? The APK has no phone sign-in; it is email only.
2. **Q2 (F-03):** May the code box appear **straight away** after "Send code" (showing "Sending code…"), instead of waiting until Google confirms?
3. **Q3 (F-08e):** May the in-app reminder check (the "no scorer yet" and prep nudges) run **every 5 minutes and when you open the app**, instead of every minute?
4. **Q4 (F-16):** May Home show **the last feed you saw** the moment the app opens, then refresh it a second later?
5. **Q5:** Do you want phone sign-in **inside the APK** too? It needs a native Firebase module, a new APK build, and Play Integrity set up in the Firebase console.
6. **Q6 (F-24):** OK to use the smaller "mobile numbers" phone-data set? It is slightly less strict about landline formats.

---

## Proposed wave plan

**Wave 1: quick wins, no visible change (S items, about 1–2 days, one OTA plus a web publish)**
F-01 pre-warm Firebase and reCAPTCHA · F-02 warm `phone-login` · F-05 render from session metadata · F-06 skip the redundant `getUser` · F-07 stop reloading the profile behind a spinner on auth events · F-08a–d one shared reminder gather, delayed and batched · F-10 memoise `getMyPlayerId` · F-11 no native prefetch · F-13/F-14 service-worker fixes · F-09(1–3) a lighter Home.
Founder runs one migration: F-12 (`players(profile_id)` index plus the `players_view` rewrite) and F-18 (FK indexes).
*Expected:* send code about 1.5–4 s faster; Continue → Home about 2.5–4 s faster; launch about 1–2 s faster; no spinner flash when returning to the web app.

**Wave 2: needs founder answers or medium work (about 3–5 days)**
F-03 instant code box (Q2) · F-08e reminder cadence (Q3) · F-16 cached profile and feed (Q4) · F-04 slimmer `phone-login` · F-09(4) `home_feed` RPC · F-17 `push_allowed_targets` rewrite · F-19 short-lived read cache · F-22 region pinning for international users.

**Wave 3: structural (about 1–2 weeks, full regression)**
F-15 split sport metadata from plugins, lazily · F-28 inline requires · F-20/F-21 scoring-screen memoisation and local undo · F-24–F-27 bundle trims · Q5 native phone sign-in (new APK).

### How to verify each wave
- Web: open Chrome DevTools on a "Fast 4G" profile and record the waterfall from tapping "Send code" to the code box, and from "Continue" to the Home feed. Do this before and after.
- APK: add a `t_first_feed_ms` and `t_signin_ms` to the `app_open` / `sign_in` analytics events (telemetry already exists). Compare p50/p95 week over week.
- DB: `select calls, mean_exec_time from pg_stat_statements where query like '%players_view%'` should drop below 10 ms after F-12.
- Edge: `curl -X OPTIONS …/functions/v1/phone-login` repeated after an idle period should stay at about 0.2 s while F-02 pings are in use.

## Founder answers (2026-10-13)

1. Q1: the slow phone sign-in was on the web app, opened from the Home-screen icon.
2. Q2: **no instant code box.** Keep waiting for Google to confirm. F-03 is dropped.
3. Q3: **yes.** The reminder check runs when the app opens, then every 5 minutes (F-08e, added to Wave 1).
4. Q4: **no cached feed on open.** F-16 is dropped.
5. Q5: no native phone sign-in in the APK.
6. Q6: keep the full phone-number metadata.

Wave 2 is therefore: F-04 slimmer `phone-login` · F-09(4) `home_feed` RPC · F-17 `push_allowed_targets` rewrite · F-19 short-lived read cache · F-22 region pinning.

7. Wave 2 read cache: **keep 10 seconds** (2026-10-13). Wave 2 migration run and `phone-login` deployed the same day; signed-in players_view 175 ms → about 25–35 ms on live.
8. **Wave 3 parked** by the founder (2026-10-13). Waves 1 and 2 are live. Resume when asked: F-15 lazy sports, F-28 inline requires, F-20/F-21 scoring screen, F-24–F-27 bundle trims (about half a day, no migration expected).
