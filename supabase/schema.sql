-- ============================================================================
--  Sportfolio — shared core schema (Postgres / Supabase)
--  This is the SPORT-AGNOSTIC platform. Per-sport scoring data lives in
--  matches.state (jsonb), whose shape is owned by each sport plugin in the app.
--  Run in the Supabase SQL editor, or via `supabase db push`.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------- Identity --------------------------------------------------------
create table if not exists schools (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- profiles extends Supabase auth.users 1:1
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  handle      text unique not null,
  avatar_url  text,
  role        text not null default 'fan'
              check (role in ('organizer','scorer','player','parent','fan')),
  school_id   uuid references schools(id),
  dob         date,        -- captured at sign-up (mandatory in the app)
  guardian    jsonb,       -- under-18: guardian contact captured at sign-up
  created_at  timestamptz not null default now()
);
-- Migration for existing deployments:
--   alter table profiles add column if not exists dob date;
--   alter table profiles add column if not exists guardian jsonb;

-- A player is a sporting identity; it may exist before a login claims it.
create table if not exists players (
  id          uuid primary key default uuid_generate_v4(),
  profile_id  uuid references profiles(id) on delete set null,
  full_name   text not null,
  jersey_no   int,
  sports      text[] not null default '{}',
  house_name  text,
  house_color text,
  city        text,
  school_id   uuid references schools(id),
  phone          text,
  email          text,
  phone_verified boolean not null default false,
  email_verified boolean not null default false,
  photo_url      text,
  dob            date,
  guardian       jsonb,   -- under-18 guardian contact (GuardianContact)
  sport_details  jsonb,   -- per-sport profile details (Player.sportDetails)
  verification   jsonb,   -- verification review state ({ status, … }); queried via verification->>status
  created_at  timestamptz not null default now()
);
-- Migration for existing deployments:
--   alter table players add column if not exists phone text;
--   alter table players add column if not exists email text;
--   alter table players add column if not exists phone_verified boolean not null default false;
--   alter table players add column if not exists email_verified boolean not null default false;
--   alter table players add column if not exists photo_url text;
--   alter table players add column if not exists dob date;
--   alter table players add column if not exists guardian jsonb;
--   alter table players add column if not exists sport_details jsonb;
--   alter table players add column if not exists verification jsonb;

-- ---------- Communities / Teams ---------------------------------------------
-- Communities/organizations (schools, colleges, clubs, companies). `members` is
-- a jsonb array of { playerId, role: 'Admin'|'Member'|…, since: 'YYYY-MM-DD',
-- until?: 'YYYY-MM-DD' } — the app enforces one active membership per category
-- and the sole-admin rule in code (see repos joinOrg/leaveOrg). `academic_years`
-- is a jsonb array of { label, start, end } for schools' class-rollover dates.
create table if not exists organizations (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  type                text,                          -- 'School' | 'Company' | … or a custom label
  logo_url            text,
  city                text,
  email               text,
  phone               text,
  bio                 text,
  members             jsonb not null default '[]'::jsonb,  -- LEGACY: membership now lives in org_members (migration 0020); kept vestigial for transition
  houses              jsonb not null default '[]',   -- schools: managed House list [{name, colorHex}] (migration 0022)
  academic_years      jsonb,                         -- schools/colleges only
  graduating_standard text,                          -- class after which students graduate
  created_at          timestamptz not null default now()
);

-- Organization membership (migration 0020): one row per person per org. Carries
-- role, the active window (until = left), and the academic grade timeline. The
-- data layer re-assembles Organization.members from these rows.
create table if not exists org_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  role       text not null default 'Member' check (role in ('Owner','Admin','Organizer','Scorer','Referee','Member')),
  since      date,
  until      date,
  grades     jsonb not null default '[]',
  houses     jsonb not null default '[]',   -- student's House timeline (migration 0022)
  primary key (org_id, player_id)
);

-- Membership requests: invites (org -> person) and join-requests (person -> org).
create table if not exists org_requests (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  direction   text not null check (direction in ('invite','request')),
  role        text not null default 'Member' check (role in ('Owner','Admin','Organizer','Scorer','Referee','Member')),
  status      text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled','expired')),
  created_by  uuid references players(id) on delete set null,
  message     text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references players(id) on delete set null
);

create table if not exists teams (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  short_name  text not null,
  sport       text not null,
  color_hex   text,
  school_id   uuid references schools(id),
  org_id      uuid references organizations(id) on delete set null,  -- community this team belongs to
  roster      jsonb,                                                  -- explicit player-id list (community teams); null ⇒ derive from team_members
  captain_id      uuid references players(id) on delete set null,
  vice_captain_id uuid references players(id) on delete set null,
  club_id     uuid,                                                   -- the multi-sport club this row is a sport profile of (FK added after clubs; migration 0018)
  -- created on the fly for a friendly (de-emphasised in Manage teams)
  adhoc       boolean not null default false,
  created_at  timestamptz not null default now()
);
-- Migration for existing deployments:
--   alter table teams add column if not exists org_id uuid references organizations(id) on delete set null;
--   alter table teams add column if not exists roster jsonb;
--   alter table teams add column if not exists captain_id uuid references players(id) on delete set null;
--   alter table teams add column if not exists vice_captain_id uuid references players(id) on delete set null;
--   alter table teams add column if not exists club_id uuid references clubs(id) on delete set null;

-- A club is one real-world "team" that can play many sports; each per-sport `teams`
-- row above is its sport profile (linked via teams.club_id). See migration 0018.
create table if not exists clubs (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  short_name    text not null,
  logo_url      text,
  color_hex     text,
  city          text,
  about         text,
  contact_phone text,
  contact_email text,
  org_id        uuid references organizations(id) on delete set null,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- teams.club_id FK, added now that clubs exists (the column is declared above so
-- the teams table can be created before clubs).
do $$ begin
  alter table teams add constraint teams_club_id_fkey
    foreign key (club_id) references clubs(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Team-level membership (sport-agnostic): admin | member. First member = admin.
create table if not exists club_members (
  club_id     uuid references clubs(id) on delete cascade,
  player_id   uuid references players(id) on delete cascade,
  role        text not null default 'member' check (role in ('admin','member')),
  joined_at   timestamptz not null default now(),
  primary key (club_id, player_id)
);

create table if not exists team_members (
  team_id     uuid references teams(id) on delete cascade,
  player_id   uuid references players(id) on delete cascade,
  primary key (team_id, player_id)
);

-- Sport-specific player roles, keyed to a per-sport team row (migration 0018).
create table if not exists team_player_roles (
  team_id     uuid references teams(id) on delete cascade,
  player_id   uuid references players(id) on delete cascade,
  roles       text[] not null default '{}',
  primary key (team_id, player_id)
);

-- Shareable invite to JOIN a club as a member (migration 0019).
create table if not exists club_invites (
  token       text primary key,
  club_id     uuid references clubs(id) on delete cascade,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Captains/coaches who have claimed a team (via an invite link).
create table if not exists team_staff (
  team_id     uuid references teams(id) on delete cascade,
  profile_id  uuid references profiles(id) on delete cascade,
  role        text not null default 'captain' check (role in ('captain','coach')),
  primary key (team_id, profile_id)
);

-- Shareable invites: a token a captain/coach redeems to claim a team.
create table if not exists team_invites (
  token       text primary key,
  team_id     uuid references teams(id) on delete cascade,
  role        text not null default 'captain' check (role in ('captain','coach')),
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- ---------- Venues / Tournaments / Schedule ---------------------------------
create table if not exists venues (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  location    text
);

create table if not exists tournaments (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  host_name   text not null,
  host_org_id uuid references organizations(id) on delete set null,  -- set when an org hosts
  logo_url    text,
  sports      text[] not null default '{}',
  start_date  date,
  end_date    date,
  -- per-sport format chosen by the organizer + how the tournament is decided
  formats     jsonb not null default '{}'::jsonb,
  structure   text,
  organizer_id uuid references profiles(id),
  host_ids    uuid[] not null default '{}',   -- multi-host: player ids that can manage this tournament
  created_by  uuid references players(id) on delete set null,  -- original creator, retained across ownership transfers (migration 0021)
  is_open     boolean not null default false, -- open for registration / discoverable
  reminder_lead_minutes int[],                -- organizer's per-tournament reminder lead times; null ⇒ players use their own
  created_at  timestamptz not null default now()
);

-- Ownership audit trail: created / transferred, with snapshotted names (migration 0021).
create table if not exists tournament_ownership_events (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  action        text not null check (action in ('created','transferred')),
  from_kind     text check (from_kind in ('individual','org')),
  from_name     text,
  to_kind       text check (to_kind in ('individual','org')),
  to_name       text,
  by_player_id  uuid references players(id) on delete set null,
  by_name       text,
  at            timestamptz not null default now()
);
-- Migration for existing deployments (these columns were used by the app before the DDL caught up):
--   alter table tournaments add column if not exists host_org_id uuid references organizations(id) on delete set null;
--   alter table tournaments add column if not exists logo_url text;
--   alter table tournaments add column if not exists host_ids uuid[] not null default '{}';
--   alter table tournaments add column if not exists is_open boolean not null default false;
--   alter table tournaments add column if not exists reminder_lead_minutes int[];

create table if not exists matches (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  sport         text not null,
  status        text not null default 'scheduled'
                check (status in ('scheduled','live','completed')),
  starts_at     timestamptz,
  venue_id      uuid references venues(id),
  venue_name    text,
  venue_maps_url text,
  winner        text check (winner in ('home','away','draw')),
  home_team_id  uuid references teams(id),
  away_team_id  uuid references teams(id),
  scorer_id     uuid references players(id) on delete set null,  -- PRIMARY scorer (a PLAYER id; kept = scorer_ids[0] for reminders)
  scorer_ids    uuid[] not null default '{}',   -- everyone allowed to score (player ids); see 20260927120000_multi_scorer.sql
  host_ids      uuid[] not null default '{}',   -- per-match hosts (in addition to the tournament's)
  logo_url      text,
  stream_url    text,                            -- optional live-stream link shown on the match page
  format        jsonb not null default '{}'::jsonb,  -- per-match format override (overs, players/side, …)
  managers      jsonb not null default '{}'::jsonb,  -- { home?: name, away?: name }
  -- Sport-specific live state. Shape is owned by the sport plugin in the app.
  state         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Migration for existing deployments:
--   alter table matches add column if not exists host_ids uuid[] not null default '{}';
--   alter table matches add column if not exists logo_url text;
--   alter table matches add column if not exists stream_url text;
--   alter table matches add column if not exists format jsonb not null default '{}'::jsonb;
--   alter table matches add column if not exists managers jsonb not null default '{}'::jsonb;

-- Append-only scoring events — the source of truth the reducer replays.
-- Enables undo, audit, and server-side validation of the same pure logic.
create table if not exists match_events (
  id          bigint generated always as identity primary key,
  match_id    uuid not null references matches(id) on delete cascade,
  seq         int not null,
  type        text not null,
  side        text check (side in ('home','away')),
  payload     jsonb not null default '{}'::jsonb,
  -- player attribution for this event (scorer/assister etc.) so viewers
  -- replaying the log see who did what, not just that it happened.
  attribution jsonb,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (match_id, seq)
);

-- Per-player, per-match stat rollups that feed profiles & leaderboards.
create table if not exists stat_lines (
  id          uuid primary key default uuid_generate_v4(),
  match_id    uuid references matches(id) on delete cascade,
  player_id   uuid references players(id) on delete cascade,
  sport       text not null,
  stats       jsonb not null default '{}'::jsonb,  -- e.g. {"goals":2,"cards":1}
  won         boolean not null default false,
  opponent    text,
  tracked     text[],   -- stat keys explicitly tracked for this line (vs derived)
  recorded_at timestamptz not null default now()
);
-- Migration for existing deployments:
--   alter table stat_lines add column if not exists tracked text[];

-- ---------- Social ----------------------------------------------------------
create table if not exists follows (
  follower_id uuid references profiles(id) on delete cascade,
  -- polymorphic target: a player, team, or tournament
  target_type text not null check (target_type in ('player','team','tournament')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (follower_id, target_type, target_id)
);

-- Football lineups per match (home/away arrays of {position,x,y,playerId,playerName}).
create table if not exists match_lineups (
  match_id       uuid primary key references matches(id) on delete cascade,
  home           jsonb not null default '[]'::jsonb,
  away           jsonb not null default '[]'::jsonb,
  home_formation text,   -- football: e.g. '4-3-3'
  away_formation text,
  updated_at     timestamptz not null default now()
);
-- Migration for existing deployments:
--   alter table match_lineups add column if not exists home_formation text;
--   alter table match_lineups add column if not exists away_formation text;

-- Matchday squads: starting XI + substitutes per team per match (all sports).
create table if not exists match_squads (
  match_id    uuid references matches(id) on delete cascade,
  side        text not null check (side in ('home','away')),
  starters    jsonb not null default '[]'::jsonb,   -- ordered player ids (cricket uses this as the batting order)
  subs        jsonb not null default '[]'::jsonb,
  keeper_id   uuid references players(id) on delete set null,  -- cricket: designated wicket-keeper
  primary key (match_id, side)
);
-- Migration for existing deployments:
--   alter table match_squads add column if not exists keeper_id uuid references players(id) on delete set null;

-- Participation disputes: a player's identity is flagged in a match (objection by
-- themselves, or a report by a peer). Goes through captain-confirmed reassignment
-- or is dismissed; `history` is the append-only audit trail (who did what, when).
create table if not exists match_disputes (
  id              uuid primary key default uuid_generate_v4(),
  match_id        uuid not null references matches(id) on delete cascade,
  side            text not null check (side in ('home','away')),
  player_id       uuid references players(id) on delete set null,
  player_name     text not null,
  reason          text,
  kind            text not null default 'objection' check (kind in ('objection','report')),
  status          text not null default 'open' check (status in ('open','reported','resolved','dismissed')),
  raised_by       uuid references players(id) on delete set null,
  raised_by_name  text,
  raised_at       timestamptz not null default now(),
  -- proposed correct player + both captains' confirmations before reassignment
  replacement_id  uuid references players(id) on delete set null,
  replacement_name text,
  home_captain_ok boolean not null default false,
  away_captain_ok boolean not null default false,
  resolved_at     timestamptz,
  history         jsonb not null default '[]'::jsonb
);
create index if not exists idx_match_disputes_match on match_disputes(match_id);

-- Sport-specific profile blobs (e.g. football: position, foot, teams, bio).
create table if not exists player_sport_profiles (
  player_id   uuid references players(id) on delete cascade,
  sport       text not null,
  data        jsonb not null default '{}'::jsonb,
  primary key (player_id, sport)
);

-- Expo push tokens per user device — the address a server pushes to.
create table if not exists push_tokens (
  profile_id  uuid references profiles(id) on delete cascade,
  token       text not null,
  updated_at  timestamptz not null default now(),
  primary key (profile_id, token)
);

-- Per-user reminder lead times (minutes before kickoff), so a user's timers
-- follow them across devices. Offline-first: the client also caches these in
-- AsyncStorage; this table is the cross-device source of truth when signed in.
create table if not exists user_reminder_prefs (
  profile_id   uuid primary key references profiles(id) on delete cascade,
  lead_minutes int[] not null default '{}',
  updated_at   timestamptz not null default now()
);

-- Dedup ledger for scheduled pre-match reminders (see functions/notify-upcoming):
-- one row per (match, lead time, recipient, kind) so each push fires exactly once
-- no matter how often the cron runs.
create table if not exists reminder_sends (
  match_id     uuid references matches(id) on delete cascade,
  lead_key     text not null,                       -- '1d' | '1h' | '15m'
  recipient_id uuid references profiles(id) on delete cascade,
  kind         text not null check (kind in ('player','follower','scorer')),
  sent_at      timestamptz not null default now(),
  primary key (match_id, lead_key, recipient_id, kind)
);

-- Discovery classifieds: players seeking teams, teams seeking players/opponents/
-- grounds. `preferred_date` is intentionally free-text ("this weekend", "Sat 6 PM").
create table if not exists listings (
  id               uuid primary key default uuid_generate_v4(),
  kind             text not null check (kind in ('player_seeking_team','team_seeking_player','team_seeking_opponent','team_seeking_ground')),
  sport            text not null,
  author_id        uuid references players(id) on delete set null,
  author_name      text not null,
  team_name        text,
  position         text,
  city             text,
  details          text not null,
  preferred_date   text,
  level            text,
  contact_phone    text,
  contact_verified boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Support cases: escalations from the in-app help centre when the knowledge base
-- (and, when configured, the AI assistant) couldn't resolve a question. Written
-- by the `support-escalate` edge function; `support-escalate` also emails a copy
-- to SUPPORT_EMAIL so a solo support person can reply from their inbox.
create table if not exists support_cases (
  id           uuid primary key default uuid_generate_v4(),
  question     text not null,
  tried        text,                 -- what the user already saw (KB titles / AI answer)
  handle       text,                 -- reporter's @handle, if signed in
  app_version  text,
  status       text not null default 'open' check (status in ('open','answered','closed')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_matches_tournament on matches(tournament_id);
create index if not exists idx_support_cases_status on support_cases(status, created_at desc);
create index if not exists idx_listings_sport on listings(sport, created_at desc);
create index if not exists idx_matches_status on matches(status);
create index if not exists idx_events_match on match_events(match_id, seq);
create index if not exists idx_stat_lines_player on stat_lines(player_id);
-- One stat line per (match, player, sport); live attribution increments it.
create unique index if not exists uq_stat_lines_match_player_sport
  on stat_lines(match_id, player_id, sport);

-- Realtime: broadcast match + event changes to viewers (live scores).
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table match_events;
-- DELETE payloads (a scorer's undo) must carry the full old row so viewers'
-- per-match realtime filter matches and they can re-derive the truncated log.
alter table match_events replica identity full;

-- ---------- Row Level Security (starter policies) ---------------------------
-- Tighten before production. Pattern: everyone reads; writers are scoped.
alter table matches       enable row level security;
alter table match_events  enable row level security;
alter table tournaments   enable row level security;
alter table stat_lines    enable row level security;

create policy "read matches"  on matches      for select using (true);
create policy "read events"   on match_events for select using (true);
create policy "read tourneys" on tournaments  for select using (true);
create policy "read stats"    on stat_lines   for select using (true);
create policy "authed insert stats" on stat_lines for insert with check (auth.role() = 'authenticated');
create policy "authed update stats" on stat_lines for update using (auth.role() = 'authenticated');

-- Communities: readable by all; any signed-in user can create/update. Admin-only
-- actions (member/role changes) are gated in app code via the `members` list.
alter table organizations enable row level security;
create policy "read orgs" on organizations for select using (true);
create policy "authed write orgs" on organizations for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Classifieds: readable by all; any signed-in user can post/remove (the app scopes
-- "my posts" removal by author in the UI).
alter table listings enable row level security;
create policy "read listings" on listings for select using (true);
create policy "authed write listings" on listings for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Lineups & sport profiles: readable by all, writable by signed-in organizers.
alter table match_lineups         enable row level security;
alter table player_sport_profiles enable row level security;
create policy "read lineups" on match_lineups for select using (true);
create policy "authed write lineups" on match_lineups for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "read sport profiles" on player_sport_profiles for select using (true);
create policy "authed write sport profiles" on player_sport_profiles for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
alter table match_squads enable row level security;
create policy "read squads" on match_squads for select using (true);
create policy "authed write squads" on match_squads for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Invites: anyone signed-in can read (token is the secret) & create; staff rows
-- are claimed by the user themselves.
alter table team_invites enable row level security;
alter table team_staff   enable row level security;
create policy "read invites" on team_invites for select using (auth.role() = 'authenticated');
create policy "authed create invites" on team_invites for insert with check (auth.role() = 'authenticated');
create policy "read staff" on team_staff for select using (true);
create policy "claim own staff" on team_staff for all
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- Follows & push tokens: a user manages only their own rows.
alter table follows      enable row level security;
alter table push_tokens  enable row level security;
create policy "manage own follows" on follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);
create policy "read follows" on follows for select using (true);
create policy "manage own tokens" on push_tokens
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- Reminder prefs: a user reads/writes only their own row.
alter table user_reminder_prefs enable row level security;
create policy "manage own reminder prefs" on user_reminder_prefs
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- PILOT policy: any signed-in user may score. Simple to test end-to-end.
-- BEFORE PRODUCTION, replace with the scorer-scoped version below so only the
-- assigned scorer can write:
--    using (auth.uid() = scorer_id)   /   with check (auth.uid() = created_by)
create policy "authed writes match"  on matches      for update using (auth.role() = 'authenticated');
create policy "authed writes events" on match_events for insert with check (auth.role() = 'authenticated');

-- Support cases: a signed-in user may file one (insert). Reads/updates are the
-- support team's job and go through the service-role key (edge function / console),
-- so no select/update policy is granted to regular users.
alter table support_cases enable row level security;
create policy "authed file support case" on support_cases
  for insert with check (auth.role() = 'authenticated');
