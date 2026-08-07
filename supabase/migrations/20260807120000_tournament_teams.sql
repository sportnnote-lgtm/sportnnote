-- ============================================================================
--  Sportfolio · migration 0003 — Tournament participants
--  Delta on top of schema.sql + migrations 0001–0002. Idempotent — safe to re-run.
--
--  Gives a tournament an explicit list of participating teams — the roster the
--  organizer registers up front. Until now "who's in a tournament" was only
--  implied by its matches; you can't decide a format (groups, bracket size)
--  without first knowing how many teams are in. This is the foundation for the
--  format planner + custom knockout seeding.
--
--  A pure join table (tournament ↔ team), additive and independent of every
--  existing table — nothing else changes, so existing tournaments keep working
--  (they simply have no explicit participants until the organizer registers any).
-- ============================================================================

create table if not exists tournament_teams (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  team_id       uuid not null references teams(id)        on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (tournament_id, team_id)
);

-- The common lookups: "teams in this tournament" (PK prefix covers it) and the
-- reverse "tournaments this team is in".
create index if not exists tournament_teams_team_idx on tournament_teams (team_id);

alter table tournament_teams enable row level security;
create policy "read tournament teams" on tournament_teams for select using (true);
create policy "authed write tournament teams" on tournament_teams for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
