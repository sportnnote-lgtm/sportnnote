-- 0045 — Delete a played match (CricHeroes parity #13).
--
-- Replaces the pre-match-only "delete match" policy (20260827120000):
--   1. Pre-match (scheduled / postponed / cancelled): any match manager
--      (can_manage_match) — unchanged.
--   2. Live, or completed less than 30 minutes ago (last scoring event, else
--      updated_at): the match's HOSTS only, never a mere scorer — and only for
--      friendlies. A played tournament fixture is reset in the app instead, so
--      the fixture list / bracket never gets a hole.
-- matches has no created_by column, so "the creator" is covered by host_ids
-- (createMatch adds the creator's player id to host_ids).
-- Child rows go by ON DELETE CASCADE, as before.
-- Idempotent — safe to re-run.

drop policy if exists "delete match" on matches;
create policy "delete match" on matches for delete using (
  (can_manage_match(id) and status in ('scheduled', 'postponed', 'cancelled'))
  or (host_ids && auth_player_ids()
      and tournament_id is null
      and (
        status = 'live'
        or (status = 'completed' and coalesce(
              (select max(e.created_at) from match_events e where e.match_id = matches.id),
              updated_at) > now() - interval '30 minutes')))
);
