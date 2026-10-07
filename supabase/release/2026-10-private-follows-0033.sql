-- Release 2026-10: migration 0033 (follows are private — needed for public share pages).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0033 — Follows are private: nobody (signed in or not) can list who follows
-- whom. The app only ever reads the signed-in user's own follows (covered by
-- "manage own follows"); notify-* edge functions read with the service role.
-- Needed now that shared pages are open to logged-out visitors.
drop policy if exists "read follows" on follows;

commit;
