-- Registration controls — a deadline, a min/max field size, and a "withdrawn"
-- entry status so a team can pull out (or be removed) without deleting its row
-- and its history.
--
-- 1. Widen the tournament_teams.status check to allow 'withdrawn' (added in
--    20260816120000; withdrawn teams don't count toward the field or fixtures).
-- 2. Add the tournament-level registration fields.

alter table tournament_teams drop constraint if exists tournament_teams_status_check;
alter table tournament_teams add constraint tournament_teams_status_check
  check (status in ('confirmed', 'invited', 'pending', 'withdrawn'));

alter table tournaments add column if not exists registration_deadline timestamptz;
alter table tournaments add column if not exists min_teams int;
alter table tournaments add column if not exists max_teams int;
