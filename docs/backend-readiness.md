# Backend & Data-Model Readiness

*Design-pass audit for the demo → live cutover. Living doc — update as the model changes.*
*Last updated: 2026-07-27 (live-path coverage audit, §8). Owner: (you). Companion to `supabase/schema.sql`, `src/data/repos.ts`, `DEVLOG.md`.*

---

## TL;DR — you're ~90% there, and it's the good kind of work left

The data layer is **far more built than a demo usually is.** `supabase/schema.sql` (23 tables) is a
genuinely production-shaped model: an append-only event log as the scoring source of truth, realtime
already wired, sensible indexes, and starter row-level-security policies with the *production* versions
already written as comments. `src/data/repos.ts` is a **complete demo↔live seam** — all 77 repo
functions branch on `isSupabaseConfigured`, and ~40 mutations already have real Supabase writes
(`createTournament`, `createMatch`, `appendMatchEvent`, `recordStatLine`, `raiseDispute`, …). Two edge
functions (`notify-followers`, `notify-upcoming`) exist for push.

**So the work is not "build the backend." It's "harden and operate it."** That's the difference between a
demo that talks to Supabase and a product you can trust real schools' data on. This doc is the checklist
to close that gap — and the conventions that keep further demo work migration-ready (answering your
sequencing question: keep improving the demo, but under §6).

---

## 1. What already exists

| Layer | State |
|---|---|
| **Schema** | `supabase/schema.sql` — 23 tables, idempotent (`create table if not exists` + inline `alter … if not exists` migration hints). |
| **Scoring model** | `match_events` append-only log (`unique(match_id, seq)`, `replica identity full` so undo/DELETE carries the old row); `matches.state` jsonb snapshot; `stat_lines` per-player rollups. Pure reducers replay the log — same logic client + server. |
| **Data seam** | `src/data/repos.ts` — every read/write branches demo vs live; live paths use real `supabase.from(...)`. |
| **Realtime** | `matches` + `match_events` on the `supabase_realtime` publication → viewers get live scores. |
| **Indexes** | matches by tournament & status; events by `(match_id, seq)`; stat_lines by player + a unique `(match_id, player_id, sport)`; listings by `(sport, created_at)`; disputes by match. |
| **RLS** | Enabled on ~14 tables with starter policies; the production scorer-scoped write policy is written as a comment, ready to switch on. |
| **Functions** | `supabase/functions/notify-followers`, `notify-upcoming` (pre-match reminder cron, with a `reminder_sends` dedup ledger). |
| **Auth** | `profiles` extends `auth.users` 1:1 — real Supabase Auth is the intended path; the app currently runs demo auth. |

**Core model in one line:** sport-agnostic platform tables (identity, communities, teams, tournaments,
matches) + a per-match **append-only event log** + derived **stat lines**; all per-sport scoring detail
lives in `matches.state` jsonb owned by the sport plugins — never in core columns.

---

## 2. Drift & gaps audit

Ranked. 🔴 must-fix before production · 🟠 fix during hardening · 🟡 watch / plan.

1. **🔴 RLS not enabled on every table.** Enabled on matches, match_events, tournaments, stat_lines,
   organizations, listings, lineups, squads, sport-profiles, invites, staff, follows, push_tokens,
   reminder_prefs. **Missing on: `players`, `teams`, `team_members`, `schools`, `venues`,
   `match_disputes`, `reminder_sends`.** In Supabase, a table with RLS *off* is fully open to anyone
   holding the anon key. Enable RLS + explicit policies on **all** tables (read-all where appropriate,
   scoped writes) before launch.

2. **🔴 RLS is pilot-grade for scoring.** Current policy: *any* authenticated user can update any match
   / insert any event. The scorer-scoped production policy is already written as a comment in
   `schema.sql` (`using (auth.uid() = scorer_id)`). Switch it on, and add host/organizer scoping for
   management writes (tournaments, orgs, lineups currently allow "any authed user").

3. **🔴 `profiles.role` CHECK omits `support`.** The DB constraint allows
   `organizer/scorer/player/parent/fan`, but the app's `Role` type (and the verification-review console)
   uses `support`. Inserting a support user will fail the check. Migration: extend the CHECK (and decide
   if an `admin` role is also needed).

4. **🟠 No versioned migrations.** Today it's one `schema.sql` + inline `alter … if not exists` hints —
   fine for solo prototyping, but it won't give repeatable local→staging→prod deploys or a clean history
   as the team grows. Adopt `supabase/migrations/*.sql` (`supabase migration new …`) from the next change
   on; treat `schema.sql` as the current-state snapshot.

5. **🟠 `updated_at` isn't auto-maintained.** `matches.updated_at` exists but nothing bumps it on write
   (the app sets it via snapshot updates). Add a generic `set_updated_at` trigger on mutable tables so
   it's reliable regardless of the write path.

6. **🟠 Verification mutation paths need a live-path check.** `verifyGuardianContact`,
   `submitVerificationDoc`, `reviewVerification`, `getPendingVerifications` should be confirmed to write
   to `players.verification` (jsonb) via a live Supabase path, not demo-only. Guardian consent is
   compliance-critical (minors) — this path must be real and audited.

7. **🟠 Auth flow — partially built.** *(Re-audited 2026-07-27; the earlier "stand-in" note understated
   it.)* On Supabase Auth already: **email/password sign-in & sign-up**, **session hydration +
   `onAuthStateChange`**, **profile load** (`core/auth.tsx`), and at sign-up (`AuthScreen`) mandatory
   **mobile + DOB**, minor detection, **guardian contact**, and now an explicit **guardian-consent
   affirmation** (`GuardianContact.consentedAt`, stamped at sign-up → `profiles`/`players` guardian jsonb).
   **Remaining:** **email/phone OTP** (passwordless) and **password reset** (`resetPasswordForEmail` +
   deep-link redirect). Both are bounded but need a live project to exercise, so build + verify them
   against staging.

8. **🟡 Backups depend on tier.** Supabase free tier has limited/no point-in-time recovery. For real
   schools' data, budget the Pro tier (~$25/mo) for daily backups + PITR **at the point you take real
   data** (not necessarily Day 1) — this is the one place to spend, given "don't compromise on not losing
   data."

9. **🟡 Realtime scope.** Only `matches` + `match_events` broadcast. Decide whether **live player ratings**
   (`stat_lines`) or **disputes** need realtime; if the viewers don't need them live, leave them off (less
   fan-out = cheaper at scale).

10. **🟡 `match_events` grows globally unbounded.** It's the correct trade (append-only = cheap writes,
    replayable truth) and `bigint identity` + the `(match_id, seq)` index carry it a very long way. Plan
    — not now — to **archive finished matches** (the `state` snapshot is enough for history; old raw
    events can move to cold storage) and consider partitioning only if volume ever demands it.

---

## 3. Production hardening checklist

Everything that must be true before real users' data lands. Maps to the launch plan's Track B / P0–P1.
**Items 1–5 are done in `supabase/migrations/20260709120000_production_hardening.sql`** (migration 0001).

- [x] **RLS on every table**, with read/write policies scoped by ownership. — *migration 0001*
- [x] **Scorer/host-scoped scoring writes** via `can_manage_match()`; also fixed 3 write paths RLS was silently blocking (matches/tournaments INSERT, events DELETE/undo). — *migration 0001*
- [x] **Fix `profiles.role` CHECK** to include `support` (+ `admin`). — *migration 0001*
- [x] **`set_updated_at` triggers** on mutable tables. — *migration 0001*
- [x] **Versioned migrations** adopted (`supabase/migrations/`) — this is the first one. Still to do: staging + prod projects.
- [~] **Real auth** — email/password sign-in/up, sessions, minor **guardian-consent capture** all built
  (`core/auth.tsx`, `AuthScreen`); **remaining: email/phone OTP + password reset** (build against staging).
- [x] **Verification write path** confirmed live + audited (compliance) — all four mutations
  (`verifyContact`, `verifyGuardianContact`, `submitVerificationDoc`, `reviewVerification`) route through
  `updatePlayer`'s live Supabase write (`players.verification`/`guardian` jsonb + `phone_verified`/
  `email_verified`); `getPendingVerifications` queries `players` live. — *audit 2026-07-27.* Residual
  (🟠): the append-only `verification.history` is updated read-modify-write on the jsonb column, so
  concurrent support actions can drop history entries — harden with a server-side atomic append (RPC)
  before scale.
- [ ] **Edge functions deployed** + reminder cron scheduled; push credentials (APNs/FCM) set.
- [ ] **Backups**: Pro tier + PITR enabled before real data.
- [~] **Index review** — migration 0001 added GIN indexes on `host_ids` (the scoping policies use them); finish against real hot queries before the beta load test.
- [ ] **Secrets/env**: `EXPO_PUBLIC_SUPABASE_URL` / `ANON_KEY` per environment; service-role key server-side only.
- [ ] **Thin vertical slice** proven first: sign in → score one live match → it syncs to a second device under production RLS.

> ⚠️ **Sequencing note:** migration 0001 turns RLS *on* everywhere. Run it only against a project that
> also has **real Supabase Auth wired** — with RLS on and no signed-in user, all writes are denied by
> design. The demo path (`isSupabaseConfigured = false`) is unaffected; this only bites the moment you
> point the app at a live project, which is exactly when auth must already be in place.

---

## 4. Data model — the shape to hold in your head

**Identity & membership**
`schools` · `profiles` (↔ auth.users) · `players` (a sporting identity; may exist before a login claims it
via `profile_id`) · `organizations` (members as jsonb: role + since/until + class-history) · `teams`
(→ org, roster, captain/vice) · `team_members` · `team_staff` · `team_invites`.

**Scheduling**
`venues` · `tournaments` (host_ids[], formats jsonb, structure) · `matches` (→ tournament, home/away team,
scorer_id, host_ids[], `format` jsonb, `state` jsonb).

**Scoring (the core primitive)**
`match_events` (append-only log — the truth) → replayed by pure reducers → `matches.state` (snapshot) +
`stat_lines` (per-player, per-match rollups; incrementally maintained by `recordStatLine`, reversed on
undo/edit — **not** rebuilt from the log). `match_lineups` · `match_squads` · `match_disputes` (identity
objections, captain-confirmed reassignment, jsonb audit trail).

**Social & ops**
`follows` (polymorphic: player/team/tournament) · `listings` (Connect noticeboard) ·
`player_sport_profiles` · `push_tokens` · `user_reminder_prefs` · `reminder_sends` (cron dedup ledger).

**The invariant that makes it scale & stay sport-agnostic:** core tables never gain per-sport columns.
A new sport adds a plugin (reducer + controls); its data rides in `matches.state` and the `match_events`
payloads. Adding athletics, deepening tennis — none of it touches the schema.

---

## 5. Scale posture (bootstrapped, but built for year-one growth)

The architecture is already the cheap-to-scale one; protect it with discipline, not spend.

- **Writes are appends.** Scoring = insert one `match_events` row. No hot-row contention; scales linearly.
- **Reads are paginated.** Keep every list query bounded (`.range()` / cursor on `created_at`/`starts_at`).
  The **"top-5 + See all"** UI we just shipped is the client half of this — the server half is `.range()`,
  never a full-table fetch. This is the single most important habit for cheap data growth.
- **Derived, not recomputed.** `stat_lines` and `matches.state` are maintained incrementally, so profile
  totals and leaderboards never scan the whole event log.
- **Archive the tail.** Finished matches keep their `state` snapshot; their raw events can age out to cold
  storage later. Nothing to do now — just don't design against it.
- **Cost curve:** near-zero at pilot scale on the free tier; upgrade to Pro (~$25/mo) when you take real
  data (for backups) and scale compute only when metrics say so. No re-platforming on this path.

---

## 6. Conventions — the guardrails for continued demo work

*This is what makes "keep improving the demo" safe: follow these and the eventual cutover stays mechanical.*

1. **IDs are opaque.** The DB assigns `uuid` defaults; the demo uses readable strings (`p-aarav`). Never
   assume an id's format or that demo ids map to prod. New live entities get server uuids; demo data is
   not migrated.
2. **Paginate everything.** No unbounded list fetch, client or server. New lists ship with a limit + a
   "See all" (which becomes server pagination). Never `select *` a growing table without a bound.
3. **Scoring stays in the log + `state`.** Per-sport data goes in `match_events.payload` /
   `matches.state`, never new core columns. The append-only log is the source of truth; snapshots derive.
4. **Stat lines are incremental.** Maintain them via `recordStatLine` (and reverse on undo/edit) — never
   rebuild from the whole log. Preserve this invariant when adding sports.
5. **Populate scope keys on writes.** `tournament_id`, `org_id`, `host_ids`, `scorer_id`,
   `created_by` — these are how RLS will enforce authority. Keep them set even in demo so live just works.
6. **Schema changes → a migration file.** From the next change on, add `supabase/migrations/NNNN_*.sql`;
   don't hand-edit the monolith. Keep `types.ts` and the SQL in lockstep (the types already say they mirror
   the tables — keep that true).
7. **Timestamps on everything.** `created_at` on insert; `updated_at` (trigger-maintained) on mutable rows.
8. **Keep a clean subscription seam.** Monetization is deferred, but leave an obvious `org`/`subscription`
   boundary (billing attaches to organizations later) — don't entangle it with scoring or identity now.

---

## 7. Cutover plan (demo → live)

> **Step-by-step operational runbook: [`docs/staging-setup.md`](staging-setup.md)** — the concrete
> commands for everything below (create project, run schema+migration, wire env, deploy functions,
> schedule cron, the vertical-slice test, backups, rollback). This section is the summary.

1. Create a Supabase project (free tier); run `schema.sql`.
2. Apply the **drift migration** (§2.1–2.5): RLS on all tables, scorer/host-scoped policies, `role` CHECK
   fix, `updated_at` triggers — as the **first entries** in `supabase/migrations/`.
3. Wire **real Auth** (email/phone OTP + guardian consent for minors).
4. Seed **real reference data** (sport formats), *not* the demo houses — `seed.sql` is test-only.
5. Set env (`EXPO_PUBLIC_SUPABASE_URL` / `ANON_KEY`) → `isSupabaseConfigured` flips true; the app uses live
   paths with zero UI changes (the seam already handles it).
6. Deploy **edge functions**; schedule the reminder cron; set push credentials.
7. **Thin vertical slice test** (auth → score one live match → second device sees it under prod RLS), then
   full E2E and the closed beta.

---

## 8. Open audit items

### Live-path coverage audit — done 2026-07-27

Went through **all 82 repo functions** in `src/data/repos.ts` (a coverage pass: does each mutation
actually write to Supabase on the live path, or silently no-op / lose data?). **Result: no demo-only
mutation would lose data against a live backend.** Every write either has a real `supabase.…(insert|
update|upsert|delete)` (or `.rpc`), or delegates to one that does (`joinOrg`/`leaveOrg` → `setOrgMembers`;
the verification fns → `updatePlayer`; `getTeamSummaries`/`getTeamSummary` are derived reads over
`getMatches()`). Two functions are intentional live no-ops/degradations, both now handled:

- **`getLastSquadForTeam`** — *fixed.* Was demo-only (live returned `null`, so "Copy last match's XI"
  offered nothing once pointed at Supabase). Now composed from `getMatches()` + `getMatchSquads()`,
  which each own the demo↔live split, so it works in both modes with no new SQL.
- **`markPlayerRegistered`** — live is a deliberate no-op (real Auth claims the player record via
  `profile_id`; there's nothing to simulate). Correct by design; ties to the Auth work below.

### Still open

- **Server-side integrity for org membership (🟠).** `joinOrg`/`leaveOrg` *do* write live (via
  `setOrgMembers`), but the one-active-membership + sole-admin rules are enforced in **app code** — two
  concurrent joins, or a direct `setOrgMembers` call, could bypass them and orphan a community. Enforce
  via a DB trigger / `join_org` RPC for production integrity (pilot-safe as-is).
- **Verification history atomicity (🟠).** See §3 — move the append-only `verification.history` write to a
  server-side atomic append (RPC) so concurrent support decisions can't drop trail entries.
- **Realtime scope** for `stat_lines` (live ratings) and `match_disputes` — decide before enabling.
- **Hot-query/index review** per screen to finalize composite indexes before the beta load test.
- **Real Auth (the one from-scratch code piece, §3).** email/phone OTP + sessions + guardian-consent
  capture on Supabase Auth; `markPlayerRegistered`'s live no-op assumes it. This is the largest remaining
  in-repo build.
