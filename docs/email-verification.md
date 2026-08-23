# Email verification — how to turn it on

**Status (pilot): OFF.** New accounts are usable immediately; emails are **not**
verified. This is deliberate for an *invited* pilot. The code and the DB trigger
below are already in place, so switching to verified email later is a
dashboard flip + one migration — **no app changes, no rebuild.**

## Why it's built this way

Sign-up creates the auth user, then the **profile row** must be created. Doing
that from the client only works while a session exists right after `signUp` —
i.e. while "Confirm email" is OFF. With it ON, there's no session yet, so a
client-side profile insert would fail (RLS: `auth.uid()` is null).

Migration `20260825120000_profile_on_signup.sql` fixes this: a
`handle_new_user()` trigger on `auth.users` creates the profile **as the
database**, so it works with or without a session. The app passes the sign-up
fields (name/role/dob/phone/guardian) as user metadata for the trigger to read,
and keeps an idempotent client upsert as a fallback for deployments where the
trigger isn't applied yet. `signUp` returns `needsEmailConfirm: true` when there's
no session, and `AuthScreen` shows "check your email, then sign in".

## To turn verified email ON (public launch)

Do these **in order** — the migration must land before the setting flips, or
sign-ups create an auth user with no profile:

1. **Run the migration.** In the Supabase SQL editor, run
   `supabase/migrations/20260825120000_profile_on_signup.sql`.
   Verify the trigger exists:
   ```sql
   select tgname from pg_trigger where tgname = 'on_auth_user_created';
   ```
2. **Check the email template exposes the code.** Authentication → Emails →
   "Confirm signup": the template must include `{{ .Token }}` (6-digit code) —
   the app's OTP/confirm flows use the code, not a magic link. (Supabase defaults
   include it.)
3. **Flip the setting.** Authentication → Providers → Email → turn **Confirm
   email ON**.
4. **Smoke-test on a throwaway email:** sign up → confirm you land on "check your
   email…" → the profile row already exists (trigger) → enter the emailed code /
   click the link → you're signed in.

## To keep it OFF (pilot, current)

Nothing to do. Optionally run migration 0011 anyway — it's safe with the setting
OFF (the trigger creates the row, the client upsert becomes a no-op) and gets it
out of the way before launch.

## Known follow-ups

- **Handle collisions across users** (two `aarav@…` emails): the trigger
  de-dupes by appending a counter; the client fallback does not. Only matters on
  deployments without the trigger.
- **Duplicate phone** at sign-up hits the `uq_profiles_phone` unique index and
  fails the sign-up (pre-existing). Decide whether phone must be globally unique.
