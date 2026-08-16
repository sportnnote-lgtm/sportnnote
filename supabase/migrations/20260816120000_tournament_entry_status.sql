-- ============================================================================
--  Sportfolio · migration 0007 — Tournament entry status (lifecycle)
--  Delta on top of schema.sql + migrations 0001–0006. Idempotent — safe to re-run.
--
--  Team participation is no longer a flat "in / not in". Real events run on an
--  entry lifecycle: an organizer directly confirms a team, or invites one (the
--  captain accepts), or a captain self-registers and the organizer approves.
--  This adds a `status` to the tournament_teams join row:
--    - 'confirmed' : in the tournament (what every existing row means → default)
--    - 'invited'   : organizer invited the team; awaiting the captain's acceptance
--    - 'pending'   : captain requested to join; awaiting organizer approval
--
--  Only 'confirmed' entries count toward format planning + fixtures. Existing
--  rows default to 'confirmed', so nothing changes for current tournaments.
--  RLS is unchanged: migration 0003 already lets any authenticated user write
--  this table, so captain self-registration and organizer approvals both work.
-- ============================================================================

alter table tournament_teams
  add column if not exists status text not null default 'confirmed'
    check (status in ('confirmed', 'invited', 'pending'));

-- Fast "pending requests / invites for this tournament" lookups for the organizer.
create index if not exists tournament_teams_status_idx on tournament_teams (tournament_id, status);
