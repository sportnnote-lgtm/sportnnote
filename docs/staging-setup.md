# Stand up a staging environment (demo → live)

*The operational runbook for the demo→live cutover. Companion to `docs/backend-readiness.md`
(the audit + §7 cutover plan) and `docs/support-setup.md` (the two support edge functions).*
*Last updated: 2026-07-27.*

The app ships in **demo mode** (in-memory / AsyncStorage sample data) until two env vars are set.
This runbook stands up a real Supabase **staging** project and flips the app onto it. The data seam
(`src/data/repos.ts`) already branches on `isSupabaseConfigured`, so **no app code changes** — the
whole UI uses live paths the moment the env is present.

> Do **staging first**, prove the vertical slice (step 7), *then* repeat for production. Never point
> the app at a project that doesn't yet have the schema + auth in place.

---

## 0. Prerequisites (one-time)

- A **Supabase account** (free tier is enough for staging).
- **Supabase CLI** for deploying edge functions:
  ```bash
  brew install supabase/tap/supabase
  supabase --version
  supabase login
  ```
- (Optional) API keys you already have: **Anthropic** (support AI) and **Resend** (support email) —
  only needed for the two support functions in step 5b. See `docs/support-setup.md`.

---

## 1. Create the staging project

1. Supabase Dashboard → **New project** → name it e.g. `sportfolio-staging`, pick a region near your
   users (India → Mumbai/Singapore), set a strong DB password (save it).
2. When it's provisioned, open **Settings → API** and copy:
   - **Project URL** → `https://<PROJECT_REF>.supabase.co`
   - **anon / public** key
   - **service_role** key ⚠️ (server-only — never in the app; used only for edge-function secrets)
3. Note the **Project ref** (the `<PROJECT_REF>` in the URL) — used by the CLI and cron.

---

## 2. Create the schema

Use the **Dashboard SQL editor** (simplest for a fresh project). Run these **in order**, each as its
own query:

1. **`supabase/schema.sql`** — creates the 23 base tables, indexes, realtime publication, starter RLS.
2. **`supabase/migrations/20260709120000_production_hardening.sql`** — migration 0001: turns RLS on
   for *every* table, the scorer/host-scoped write policies (`can_manage_match()`), the `profiles.role`
   CHECK fix (adds `support`/`admin`), and `set_updated_at` triggers.
3. *(staging only, optional)* **`supabase/seed.sql`** — demo-shaped sample rows (Greenwood High, houses,
   a meet) so a connected app looks populated. **Skip this for production** — production seeds real
   reference data, not the demo houses.

> ⚠️ **Sequencing (from backend-readiness §3):** migration 0001 turns RLS **on** everywhere. With RLS on
> and no signed-in user, **all writes are denied by design** — so you must create + sign in a user
> (step 4) before you can write anything. Reads of public data still work. This is expected, not a bug.

**CLI alternative:** `supabase link --project-ref <PROJECT_REF>` then run the three files against the
DB (e.g. via the SQL editor, or `psql "<connection-string>" -f supabase/schema.sql`). `supabase db push`
only applies files under `migrations/`, so it won't run `schema.sql` — run that one yourself first.

---

## 3. Point the app at staging

Create **`.env.local`** at the repo root (it's git-ignored by `.gitignore`'s `.env*.local`, and Expo
loads it automatically):

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
```

Both are `EXPO_PUBLIC_*`, so they're compiled into the client bundle — **that's fine, they're the
public keys.** The **service_role** key must *never* be an `EXPO_PUBLIC_` var or live in the app; it
only goes into edge-function secrets (step 5).

`src/core/supabase.ts` derives `isSupabaseConfigured = Boolean(url && anonKey)` from these — set, and
the app is live; unset, and it's back to demo (see step 9).

---

## 4. Flip to live & smoke-test auth

```bash
npx expo start --web --port 8091
```

With the env present, the app boots to the **AuthScreen** (only rendered when Supabase is configured):

1. **Create account** → enter full name, mobile, DOB, email, password. For an under-18 DOB the guardian
   fields + the **consent checkbox** appear and are required (the consent stamps
   `guardian.consentedAt`). Submit → a `profiles` row is inserted.
2. Confirm the email if you left Supabase's "Confirm email" on (**Auth → Providers → Email**); for fast
   staging you can toggle **"Confirm email" off** temporarily.
3. **Sign in** → you should land in the app with your profile loaded (`profiles` row → `useAuth`).
4. Check **Table editor → profiles** for your row (role, dob, guardian jsonb incl. `consentedAt`).

If sign-in works, RLS + auth are wired correctly.

---

## 5. Deploy the edge functions

Link once, then deploy the four functions:

```bash
supabase link --project-ref <PROJECT_REF>
supabase functions deploy notify-followers
supabase functions deploy notify-upcoming
supabase functions deploy support-assistant
supabase functions deploy support-escalate
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **injected automatically** into functions — you don't
set those.

**5a. Push (reminders + follower alerts).** `notify-followers` / `notify-upcoming` send via **Expo Push**
(`https://exp.host/--/api/v2/push/send`) using tokens the app saves to `push_tokens`. No extra secret
for the function. For real device delivery from a standalone build, configure push credentials via **EAS**
(`eas credentials`) — not needed to test the function logic on staging.

**5b. Support functions.** Set their secrets (see `docs/support-setup.md` for detail):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...       # support-assistant (Claude answers)
supabase secrets set RESEND_API_KEY=re_...              # support-escalate (email)
supabase secrets set SUPPORT_EMAIL=hrudhaypvtemp@gmail.com
supabase secrets set SUPPORT_FROM="Sportfolio Support <onboarding@resend.dev>"
```

Until these are set, in-app support gracefully falls back to the offline KB + a mailto (no crash).

---

## 6. Schedule the reminder cron

`notify-upcoming` must fire every ~5 minutes (a `reminder_sends` ledger makes it idempotent, so cadence
is forgiving). In the Dashboard → **Database → Cron** (or SQL editor with `pg_cron` + `pg_net` enabled):

```sql
select cron.schedule(
  'notify-upcoming', '*/5 * * * *',
  $$ select net.http_post(
       url     := 'https://<PROJECT_REF>.functions.supabase.co/notify-upcoming',
       headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
     ) $$
);
```

(`notify-followers` is invoked on-demand by scoring events, not on a cron.)

---

## 7. Thin vertical slice — the go/no-go test

This is the one test that proves the cutover (backend-readiness §3, §7.7):

1. **Device/tab A:** sign in as an organizer/scorer, open a scheduled match, **score a few events**
   (goal / run / point). Confirm they persist (`match_events` rows appear in the Table editor).
2. **Device/tab B:** open the same match as a viewer (a second browser/profile). The score should
   **update live** (realtime on `matches` + `match_events`).
3. Confirm a **non-scorer cannot** write to that match (RLS scorer-scoping) — e.g. a second account
   scoring the same match should be rejected.

Green on all three → staging is real. Then run a fuller E2E and, when ready, repeat steps 1–6 for a
**production** project.

---

## 8. Backups — before any real data (production)

Staging on the free tier is fine to lose. **Before production takes real schools' data**, upgrade that
project to **Pro (~$25/mo)** and enable **daily backups + PITR** (Dashboard → Database → Backups). This
is the one place backend-readiness says to spend — it directly serves "don't lose data."

---

## 9. Rollback — back to demo instantly

Delete or rename `.env.local` (or blank the two vars) and restart:

```bash
rm .env.local && npx expo start --web --port 8091
```

`isSupabaseConfigured` goes false → the app runs entirely on demo data again. Nothing to undo in the DB;
the demo path never touches Supabase.

---

## 10. Staging → production checklist

When the slice is proven on staging:

- [ ] New Supabase **prod** project; run `schema.sql` + migration 0001 (**not** `seed.sql`).
- [ ] Seed **real reference data** (venues/schools as needed) — no demo houses.
- [ ] Prod `.env.local` (or your build's env) with the **prod** URL + anon key.
- [ ] Redeploy the 4 functions + set their secrets against prod; schedule the cron.
- [ ] **Pro tier + PITR** enabled (step 8).
- [ ] Keep the **service_role** key out of the app and out of git; rotate if ever exposed.
- [ ] Turn **email confirmation back on** (and configure real SMTP/OTP) for prod.
- [ ] Remaining app-side auth to finish against staging first: **email/phone OTP + password reset**
      (backend-readiness §2.7).

---

### Quick reference

| Thing | Value |
|---|---|
| App env vars | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (in `.env.local`) |
| Live toggle | `isSupabaseConfigured` (auto-derived in `src/core/supabase.ts`) |
| Schema | `supabase/schema.sql` → `supabase/migrations/20260709120000_production_hardening.sql` → `seed.sql` (staging only) |
| Functions | `notify-followers`, `notify-upcoming`, `support-assistant`, `support-escalate` |
| Function secrets | auto: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; set: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SUPPORT_EMAIL`, `SUPPORT_FROM` |
| Cron | `notify-upcoming` every `*/5 * * * *` |
| Run | `npx expo start --web --port 8091` |
