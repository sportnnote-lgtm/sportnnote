-- 0018: Clubs — the multi-sport "team".
--
-- A club is one real-world team that can play many sports (the UI just calls it a
-- "Team"). It is the parent of the existing per-sport `teams` rows: each sport a
-- club plays has its own `teams` row (its "sport profile") carrying that sport's
-- captain/vice-captain, roster and now player roles. This keeps every existing
-- match/tournament FK to `teams` intact while adding one identity above them.
--
-- Model:
--   clubs               — the parent identity (name, logo, city, contact…)
--   club_members        — team-level membership (admin | member); first = admin
--   teams.club_id       — back-ref linking a per-sport team row to its club
--   team_player_roles   — sport-specific player roles, keyed to the per-sport row
--
-- Sport-specific leadership (captain/vice-captain) and squad already live on the
-- per-sport `teams` row (captain_id / vice_captain_id / roster), so a club's
-- sport profile reuses them — no new columns needed for that.

create table if not exists clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  logo_url text,
  color_hex text,
  city text,
  about text,
  contact_phone text,
  contact_email text,
  org_id uuid references organizations(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists club_members (
  club_id uuid not null references clubs(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, player_id)
);
create index if not exists club_members_player_idx on club_members(player_id);

-- Link each per-sport team row back to its club. Nullable: standalone / legacy /
-- ad-hoc teams have no club. On club delete the sport rows survive (set null), so
-- their match history is never lost.
alter table teams add column if not exists club_id uuid references clubs(id) on delete set null;
create index if not exists teams_club_idx on teams(club_id);

-- Sport-specific player roles (e.g. cricket {Wicketkeeper,Batter}). Keyed to the
-- per-sport team row, so a player's role in one sport is independent of another.
create table if not exists team_player_roles (
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  roles text[] not null default '{}',
  primary key (team_id, player_id)
);
create index if not exists team_player_roles_player_idx on team_player_roles(player_id);

-- RLS: mirror the teams/team_members hardening — public read, authenticated write.
alter table clubs enable row level security;
alter table club_members enable row level security;
alter table team_player_roles enable row level security;

do $$
declare t text;
begin
  foreach t in array array['clubs','club_members','team_player_roles'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format(
      'create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t || '_write', t
    );
  end loop;
end $$;
