-- ============================================================================
--  Sportfolio · migration 0010 — Lock down player writes (go-live blocker #3)
--  Delta on top of schema.sql + migrations 0001–0009. Idempotent — safe to re-run.
--
--  The pilot policy left `players` with a single "authed write ... FOR ALL"
--  policy (migration 0002 / production_hardening), so ANY logged-in user could
--  update or delete ANYONE's player row — which holds phone, email, DOB and, for
--  minors, guardian contacts. This replaces that blanket write with scoped
--  insert / update / delete so a user can only touch:
--    • their own claimed player (profile_id = auth.uid()), or
--    • an UNCLAIMED provisional player (profile_id IS NULL) — the rows organizers
--      create when adding people by phone, which lock the moment they're claimed.
--
--  A registered user's row can no longer be edited or deleted by anyone else.
--  Service-role edge functions (verify-contact-otp, report-invite) bypass RLS and
--  are unaffected. Reads stay public (rosters/search/profiles need names+stats);
--  hiding PII *columns* from public reads is a separate follow-up (needs a
--  public-safe view — RLS is row-level, not column-level).
-- ============================================================================

-- Remove the blanket "any authenticated user may write everything" policy.
drop policy if exists "authed write players" on players;

-- INSERT: create your own player, or an unclaimed provisional one — never a row
-- pre-linked to someone else's account.
drop policy if exists "players insert scoped" on players;
create policy "players insert scoped" on players for insert to authenticated
  with check (profile_id = auth.uid() or profile_id is null);

-- UPDATE: only your own claimed row, or an unclaimed provisional row. The WITH
-- CHECK also allows claiming a provisional row (setting profile_id to yourself)
-- but never reassigning it to another account.
drop policy if exists "players update scoped" on players;
create policy "players update scoped" on players for update to authenticated
  using (profile_id = auth.uid() or profile_id is null)
  with check (profile_id = auth.uid() or profile_id is null);

-- DELETE: only your own player. Provisional cleanup is done server-side (SQL /
-- service role), never by an arbitrary client.
drop policy if exists "players delete scoped" on players;
create policy "players delete scoped" on players for delete to authenticated
  using (profile_id = auth.uid());

-- NOTE: the "read players" (SELECT using (true)) policy is intentionally left in
-- place — the app needs public reads for rosters, search and profiles. Tightening
-- which COLUMNS are public (phone/email/dob/guardian) is tracked as a follow-up.
