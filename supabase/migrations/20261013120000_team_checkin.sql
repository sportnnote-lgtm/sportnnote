-- 0032 — Match-day check-in for tournament entries: the organizer marks a team
-- (or player, in individual sports) as arrived at the venue. Organizer-only, via
-- the existing tournament_teams update policy + guard_tournament_team (0025).
alter table tournament_teams add column if not exists checked_in_at timestamptz;
