-- ============================================================================
--  Sportfolio · migration 0016 — Age/ID verification backend
--  Delta on top of schema.sql + migrations 0001–0015. Idempotent — safe to re-run.
--
--  Makes the age/ID verification workflow real end-to-end. Before this, the
--  document the user picked was discarded (only its filename was stored), nothing
--  was emailed, and in live mode a support reviewer's approve/reject write was
--  blocked by the self-scoped players RLS (migration 0010).
--
--  This adds:
--    1. a private Storage bucket for the actual proof documents,
--    2. Storage RLS so a user uploads into their own folder and the owner + any
--       support reviewer can read,
--    3. a players UPDATE policy for the support role (the reviewer console write).
--
--  Companion pieces (deployed separately, not SQL):
--    • edge function  verification-submit  — emails SUPPORT_EMAIL a signed link
--      to the uploaded document when a user submits (see supabase/functions/).
--    • client upload  data/repos.ts submitVerificationDoc — uploads the bytes.
-- ============================================================================

-- 1) Private bucket for age/ID proof documents (images / PDFs). Not public —
--    reads go through short-lived signed URLs only.
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

-- 2) Storage RLS on the objects in that bucket.
--    Path convention: "<auth.uid()>/<playerId>/<timestamp>.<ext>", so the first
--    folder is the uploader's auth id — that's what these policies key off.

-- INSERT: a user may only upload into their own folder.
drop policy if exists "verif docs insert own" on storage.objects;
create policy "verif docs insert own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: the owner may overwrite / re-submit their own file.
drop policy if exists "verif docs update own" on storage.objects;
create policy "verif docs update own" on storage.objects for update to authenticated
  using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- SELECT: the owner OR any support reviewer can read (the reviewer console makes
-- a signed URL to view the proof; the owner can re-check what they submitted).
drop policy if exists "verif docs read own or support" on storage.objects;
create policy "verif docs read own or support" on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'support')
    )
  );

-- 3) Reviewer write: a support user may UPDATE any player row — needed so the
--    verification-review console can record approve/reject on someone else's row.
--    Postgres OR-combines permissive policies, so this ADDS to the self-scoped
--    "players update scoped" policy from migration 0010 (that one still governs
--    ordinary users editing their own profile).
drop policy if exists "players update by support" on players;
create policy "players update by support" on players for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'support'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'support'));

-- 4) Granting the support role to a real reviewer account (there is no in-app
--    admin-granting UI yet; run this once against the reviewer's account):
--
--      update public.profiles set role = 'support' where handle = '<their-handle>';
--
--    After that, the account sees the "Verification review" console in Settings.
