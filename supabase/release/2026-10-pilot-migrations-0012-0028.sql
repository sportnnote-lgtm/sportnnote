-- ============================================================================
--  SportnNote pilot release — migrations 0012 → 0028 in one transaction.
--  Paste the WHOLE file into Supabase → SQL editor → Run. All-or-nothing:
--  if any statement fails, nothing is applied. Safe to run even if some of
--  0012–0024 already ran (each migration is re-runnable; verified in Postgres).
--  Generated 2026-10-07 from supabase/migrations/ (do not edit here).
-- ============================================================================
begin;

-- >>>>>>>>>> 20260826120000_match_status_postpone.sql
-- 0012 — Allow matches to be postponed or cancelled.
--
-- Organizers need to move a match (new date/time/venue) or mark it postponed /
-- cancelled, without deleting and recreating it. The date/time/venue columns
-- already exist (starts_at, venue_name, venue_maps_url) and are now writable via
-- rescheduleMatch(); this migration just widens the status CHECK so 'postponed'
-- and 'cancelled' are valid states (previously only scheduled/live/completed).

alter table matches drop constraint if exists matches_status_check;
alter table matches add constraint matches_status_check
  check (status in ('scheduled', 'live', 'completed', 'postponed', 'cancelled'));

-- >>>>>>>>>> 20260827120000_match_delete_policy.sql
-- Match deletion — a fenced DELETE policy.
--
-- `matches` had SELECT / INSERT / UPDATE policies but no DELETE policy, so with
-- RLS on, a delete silently affected zero rows (PostgREST returns 204 and the
-- client thinks it succeeded). This adds deletion, but fences it two ways so a
-- played match's data can never be destroyed:
--   1. only a match's managers (scorer / host / tournament host) — same
--      `can_manage_match(id)` helper the UPDATE policy uses; and
--   2. only while the match is still pre-match (scheduled / postponed /
--      cancelled). A live or completed game has real scoring data (events, stat
--      lines, standings impact) and can only be Cancelled, never deleted.
--
-- Child rows (match_events, stat_lines, match_lineups, match_squads,
-- match_disputes, reminder_sends) are removed by ON DELETE CASCADE, which runs
-- as a referential action and is not itself subject to RLS — so no child delete
-- policies are needed.

drop policy if exists "delete match" on matches;
create policy "delete match" on matches for delete
  using (
    can_manage_match(id)
    and status in ('scheduled', 'postponed', 'cancelled')
  );

-- >>>>>>>>>> 20260828120000_registration_controls.sql
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

-- >>>>>>>>>> 20260829120000_medal_scoring.sql
-- Multi-sport medal scoring — a tournament-wide config for meets where each
-- sport awards points by finishing position (Olympics / inter-school style) and
-- those points sum into one overall table.
--
--   scoring = {
--     "mode": "position",              -- 'match' | 'position'
--     "positionPoints": [10,7,5,4,3,2,1],
--     "sportWeights": { "football": 2 }
--   }
--
-- Walkovers ride on the existing matches.format jsonb (__walkover flag), so no
-- column is needed for them.

alter table tournaments add column if not exists scoring jsonb;

-- >>>>>>>>>> 20260830120000_verification_backend.sql
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

-- >>>>>>>>>> 20260927120000_multi_scorer.sql
-- Multiple scorers per match + fix the scorer_id type mismatch.
--
-- Bug this fixes: the app stores/compares a PLAYER id for the scorer (the scorer is
-- picked from the match roster, and `canScore` is `scorer == my player id`). But
-- matches.scorer_id had a FK to profiles(id) and can_manage_match() compared it to
-- auth.uid() (a PROFILE id). Writing a player id therefore violated the FK, the
-- UPDATE was rejected, and the app never checked the error — so assigning a scorer
-- silently did nothing and "no scorer" came back on reload. (host_ids has no FK, so
-- hosts persisted fine — which is why only the scorer kept vanishing.)
--
-- Fix: scorer is a PLAYER id everywhere; support more than one via scorer_ids[].

-- 1) The new multi-scorer column (player ids; no FK, like host_ids).
alter table matches add column if not exists scorer_ids uuid[] not null default '{}';

-- 2) Any legacy scorer_id that isn't a real player id is stale (e.g. a profile id
--    from the old, broken model) — clear it so the new FK can be added cleanly.
update matches set scorer_id = null
  where scorer_id is not null and scorer_id not in (select id from players);

-- 3) Seed the array from the (now validated) single column.
update matches set scorer_ids = array[scorer_id]
  where scorer_id is not null and scorer_ids = '{}';

-- 4) Point the legacy column's FK at players (it holds the PRIMARY scorer's player
--    id — kept in sync by the app so reminders/notifications keep working).
alter table matches drop constraint if exists matches_scorer_id_fkey;
alter table matches
  add constraint matches_scorer_id_fkey
  foreign key (scorer_id) references players(id) on delete set null;

create index if not exists idx_matches_scorer_ids on matches using gin (scorer_ids);

-- 5) A match's managers now include ANY assigned scorer (scorer_ids or the primary
--    scorer_id), plus the existing match-host / tournament-host branches. Every
--    branch is a PLAYER-id overlap via auth_player_ids() except the tournament
--    organizer (a profile id = auth.uid()).
create or replace function can_manage_match(p_match_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    left join tournaments t on t.id = m.tournament_id
    where m.id = p_match_id
      and ( m.scorer_ids && auth_player_ids()
         or m.scorer_id = any(auth_player_ids())
         or m.host_ids && auth_player_ids()
         or t.organizer_id = auth.uid()
         or t.host_ids && auth_player_ids() )
  );
$$;

-- >>>>>>>>>> 20260929120000_clubs.sql
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

-- >>>>>>>>>> 20260930120000_club_invites.sql
-- 0019: Club invites — a shareable token someone redeems to JOIN a club as a
-- member (distinct from team_invites, which is a captain/coach claim of a per-sport
-- team). Mirrors that table's shape + RLS.

create table if not exists club_invites (
  token       text primary key,
  club_id     uuid references clubs(id) on delete cascade,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table club_invites enable row level security;

do $$ begin
  drop policy if exists club_invites_read on club_invites;
  create policy club_invites_read on club_invites for select using (true);
  drop policy if exists club_invites_write on club_invites;
  create policy club_invites_write on club_invites
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
end $$;

-- >>>>>>>>>> 20261001120000_org_membership.sql
-- 0020: Organization membership as a proper join table + a membership-request
-- lifecycle. Roles gain Owner (top role, never zero) and Referee.
--
-- Previously membership lived in organizations.members (jsonb), mutated wholesale.
-- We normalise it into org_members (one row per person per org, carrying role, the
-- active window since/until, and the academic grade timeline as jsonb). The data
-- layer re-assembles Organization.members from these rows, so app code that reads
-- org.members is unchanged. The jsonb column is left in place (vestigial) for a
-- safe transition and can be dropped in a later cleanup migration.

create table if not exists org_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  role       text not null default 'Member' check (role in ('Owner','Admin','Organizer','Scorer','Referee','Member')),
  since      date,
  until      date,                         -- absent = active member
  grades     jsonb not null default '[]',  -- academic class timeline (schools)
  primary key (org_id, player_id)
);
create index if not exists org_members_player_idx on org_members(player_id);

-- One-time copy of existing jsonb members -> rows. Each element is
-- {playerId, role, since?, until?, grades?}.
insert into org_members (org_id, player_id, role, since, until, grades)
select o.id,
       (m->>'playerId')::uuid,
       coalesce(nullif(m->>'role',''), 'Member'),
       nullif(m->>'since','')::date,
       nullif(m->>'until','')::date,
       coalesce(m->'grades', '[]'::jsonb)
from organizations o
cross join lateral jsonb_array_elements(coalesce(o.members, '[]'::jsonb)) as m
where (m->>'playerId') is not null
on conflict (org_id, player_id) do nothing;

-- Guarantee at least one Owner per org (Owner is new, so none exist yet): promote
-- the earliest-joined active Admin of each org to Owner, or the earliest active
-- member if the org has no admin.
with ranked as (
  select org_id, player_id,
         row_number() over (
           partition by org_id
           order by (role = 'Admin') desc, coalesce(since, '0001-01-01') asc, player_id
         ) as rn
  from org_members
  where until is null
)
update org_members om
set role = 'Owner'
from ranked r
where om.org_id = r.org_id and om.player_id = r.player_id and r.rn = 1
  and not exists (
    select 1 from org_members o2
    where o2.org_id = om.org_id and o2.role = 'Owner' and o2.until is null
  );

-- Membership requests: invites (org -> person) and join-requests (person -> org).
-- Membership is only created when a request is accepted.
create table if not exists org_requests (
  id          uuid primary key default gen_random_uuid(),
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
create index if not exists org_requests_org_idx on org_requests(org_id, status);
create index if not exists org_requests_player_idx on org_requests(player_id, status);
-- At most one pending request/invite per (org, person, direction).
create unique index if not exists org_requests_pending_uk
  on org_requests(org_id, player_id, direction) where status = 'pending';

-- RLS: mirror the existing org model (public read, authenticated write; role
-- enforcement stays in app code).
alter table org_members enable row level security;
alter table org_requests enable row level security;
do $$
declare t text;
begin
  foreach t in array array['org_members','org_requests'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format(
      'create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t || '_write', t
    );
  end loop;
end $$;

-- >>>>>>>>>> 20261002120000_tournament_ownership.sql
-- 0021: Tournament ownership — retain the creator, and audit ownership transfers.
--
-- Ownership (individual via host_ids vs organization via host_org_id) already
-- exists. This adds: the CREATOR (retained across transfers) and an audit trail of
-- who transferred ownership from/to whom and when.

alter table tournaments add column if not exists created_by uuid references players(id) on delete set null;

-- Backfill created_by from the legacy organizer_id where it points at a player.
update tournaments t
set created_by = p.id
from players p
where t.created_by is null and t.organizer_id is not null and p.id = t.organizer_id;

create table if not exists tournament_ownership_events (
  id            uuid primary key default gen_random_uuid(),
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
create index if not exists tournament_ownership_events_idx on tournament_ownership_events(tournament_id, at);

alter table tournament_ownership_events enable row level security;
do $$ begin
  drop policy if exists toe_read on tournament_ownership_events;
  create policy toe_read on tournament_ownership_events for select using (true);
  drop policy if exists toe_write on tournament_ownership_events;
  create policy toe_write on tournament_ownership_events
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
end $$;

-- >>>>>>>>>> 20261003120000_school_houses.sql
-- 0022: School Houses as a first-class, per-school list + per-student House timeline.
-- Houses are a school-level managed list ({name, colorHex}); each student's House
-- over time is a stint timeline on their membership (mirrors the class/grades
-- timeline), so a past tournament shows the House the student was in at that date.
-- Houses are independent of class and team membership (spec §20–21).

alter table organizations add column if not exists houses jsonb not null default '[]';
alter table org_members  add column if not exists houses jsonb not null default '[]';

-- >>>>>>>>>> 20261004120000_tournament_participation.sql
-- 0023: Tournament participation rule (spec §25). The tournament defines who it is
-- contested by, independent of the underlying team/house/student structure:
--   open (default) | inter_house | school_team | individual
alter table tournaments add column if not exists participation text
  check (participation in ('open','inter_house','school_team','individual'));

-- >>>>>>>>>> 20261005120000_officials_and_audit.sql
-- 0024: Per-tournament officials (§9) + a general activity/audit trail (§27).
--
-- tournament_officials: the org-level Scorer/Referee role is only eligibility; this
-- records who is actually assigned to officiate a specific tournament.
create table if not exists tournament_officials (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  role          text not null check (role in ('scorer','referee')),
  assigned_by   uuid references players(id) on delete set null,
  at            timestamptz not null default now(),
  primary key (tournament_id, player_id, role)
);
create index if not exists tournament_officials_idx on tournament_officials(tournament_id, role);

-- activity_log: a traceable record of meaningful org/tournament changes (member
-- joined/left/role-changed, official assigned, etc). Names are snapshotted in detail.
create table if not exists activity_log (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('org','tournament')),
  ref_id       uuid not null,
  action       text not null,
  detail       text,
  by_player_id uuid references players(id) on delete set null,
  by_name      text,
  at           timestamptz not null default now()
);
create index if not exists activity_log_ref_idx on activity_log(scope, ref_id, at);

alter table tournament_officials enable row level security;
alter table activity_log enable row level security;
do $$
declare t text;
begin
  foreach t in array array['tournament_officials','activity_log'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t || '_write', t);
  end loop;
end $$;

-- >>>>>>>>>> 20261006120000_security_hardening.sql
-- ============================================================================
--  Sportfolio · migration 0025 — Security hardening: scope every client write
--  Delta on top of schema.sql + migrations 0001–0024. Idempotent — safe to re-run.
--  PREREQUISITE: 0018–0024 (clubs, club invites, org membership, ownership,
--  houses, participation, officials/audit) must already be applied.
--
--  Why: the Supabase anon key ships inside the APK and anyone can sign up, so
--  `auth.role() = 'authenticated'` means "anyone on the internet". Many tables
--  still had a blanket "any signed-in user may write ANY row" policy, so a
--  stranger could make themselves Owner of any org, captain of any team, forge
--  the audit trail, or rewrite other people's tournaments. This migration:
--
--    1. Closes privilege escalation: profiles.role can no longer be set to
--       support/admin from the client (sign-up metadata or self-update).
--    2. Locks player verification flags: phone/email verified, verification
--       approval and reported_at are server/reviewer-only; claiming a
--       provisional player needs a matching phone/email; only the creator may
--       edit an unclaimed provisional player.
--    3. Adds authority helpers (has_org_role, can_manage_tournament/team/club…)
--       and rewrites every catalog/org/club/tournament policy to use them.
--       Column-transition rules RLS can't express (e.g. "a member may only END
--       their own membership", "the Owner can never drop to zero") live in
--       BEFORE triggers.
--    4. Invite tokens are minted server-side (random, unguessable) and redeemed
--       through rate-limited RPCs; team (captain/coach) invites are single-use.
--       Token tables are no longer readable by clients.
--    5. Audit tables (activity_log, tournament_ownership_events) are insert-only
--       and stamped with the real actor; ownership transfer is an atomic RPC.
--    6. Org-hosted tournaments: org Owners/Admins/Organizers can now actually
--       manage them (the old policies only knew organizer_id / host_ids).
--    7. A small rate-limit ledger for edge functions + RPCs.
--
--  service_role (edge functions) and the SQL editor bypass the client rules:
--  every trigger below short-circuits unless the request is a client request.
-- ============================================================================


-- ---------- 0a. Ownership columns (referenced by the helpers below) ---------
-- Who created a row (a PROFILE id, = auth.uid()). Existing rows stay null: they
-- remain manageable through their other authority paths (captain, org, club…).
alter table players add column if not exists created_by uuid references profiles(id) on delete set null;
alter table players alter column created_by set default auth.uid();
alter table teams add column if not exists created_by uuid references profiles(id) on delete set null;
alter table teams alter column created_by set default auth.uid();
alter table organizations add column if not exists created_by uuid references profiles(id) on delete set null;
alter table organizations alter column created_by set default auth.uid();
alter table team_invites alter column created_by set default auth.uid();
alter table club_invites alter column created_by set default auth.uid();


-- ---------- 0. Request-context + authority helpers -------------------------

-- True for requests made with a client JWT (anon / authenticated). Edge functions
-- (service_role), the dashboard SQL editor and our own trusted RPCs (which set
-- app.trusted_rpc for the duration of the call) are not client requests.
create or replace function is_client_request()
  returns boolean language sql stable as $$
  select coalesce(auth.role(), '') in ('anon', 'authenticated')
     and coalesce(current_setting('app.trusted_rpc', true), '') <> 'on';
$$;

-- SportnNote staff (verification reviewers / support console).
create or replace function is_support()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('support', 'admin'));
$$;

-- Is the caller an ACTIVE member of the org with one of these roles?
create or replace function has_org_role(p_org uuid, p_roles text[])
  returns boolean language sql stable security definer set search_path = public as $$
  select p_org is not null and exists (
    select 1 from org_members m
    where m.org_id = p_org
      and m.player_id = any(auth_player_ids())
      and m.until is null
      and m.role = any(p_roles)
  );
$$;

-- May the caller manage this tournament? Its creator (organizer_id, a PROFILE id),
-- a listed host (host_ids, PLAYER ids), or — for an org-hosted tournament — an
-- active Owner/Admin/Organizer of the hosting org (mirrors core/org.ts
-- tournamentHostPlayerIds / canManageTournament).
create or replace function can_manage_tournament(p_tid uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tournaments t
    where t.id = p_tid
      and ( t.organizer_id = auth.uid()
         or t.host_ids && auth_player_ids()
         or (t.host_org_id is not null and has_org_role(t.host_org_id, array['Owner','Admin','Organizer'])) )
  );
$$;

-- Match managers: any assigned scorer, a match host, or a manager of its
-- tournament (now including org-hosted tournaments).
create or replace function can_manage_match(p_match_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    where m.id = p_match_id
      and ( m.scorer_ids && auth_player_ids()
         or m.scorer_id = any(auth_player_ids())
         or m.host_ids && auth_player_ids()
         or (m.tournament_id is not null and can_manage_tournament(m.tournament_id)) )
  );
$$;

-- Club (multi-sport team) managers: its creator, a club admin, or an
-- Owner/Admin of the org that owns it.
create or replace function can_manage_club(p_club uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from clubs c
      where c.id = p_club
        and ( c.created_by = auth.uid()
           or (c.org_id is not null and has_org_role(c.org_id, array['Owner','Admin'])) )
    )
    or exists (
      select 1 from club_members cm
      where cm.club_id = p_club and cm.player_id = any(auth_player_ids()) and cm.role = 'admin'
    );
$$;

-- Per-sport team managers: the creator, captain / vice-captain, claimed staff
-- (team_staff), an admin of its club, or an Owner/Admin/Organizer of its org.
-- (Deliberately NOT "any organizer whose tournament it entered" — that would let
-- an organizer take over any team just by adding it to their tournament.)
create or replace function can_manage_team(p_team uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from teams t
      where t.id = p_team
        and ( t.created_by = auth.uid()
           or t.captain_id = any(auth_player_ids())
           or t.vice_captain_id = any(auth_player_ids())
           or (t.club_id is not null and can_manage_club(t.club_id))
           or (t.org_id is not null and has_org_role(t.org_id, array['Owner','Admin','Organizer'])) )
    )
    or exists (select 1 from team_staff s where s.team_id = p_team and s.profile_id = auth.uid());
$$;

-- A scorer/host running a scheduled or live match may add players to either
-- side's roster on the fly (AddInvitePlayer) — roster only, enforced by trigger.
create or replace function can_edit_team_roster(p_team uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_team(p_team) or exists (
    select 1 from matches m
    where (m.home_team_id = p_team or m.away_team_id = p_team)
      and m.status in ('scheduled', 'live')
      and can_manage_match(m.id)
  );
$$;

-- May the caller manage one side of a match (squad / lineup)? A match manager,
-- or a manager of that side's team.
create or replace function can_manage_match_side(p_match uuid, p_side text)
  returns boolean language sql stable security definer set search_path = public as $$
  select can_manage_match(p_match) or exists (
    select 1 from matches m
    where m.id = p_match
      and can_manage_team(case when p_side = 'home' then m.home_team_id else m.away_team_id end)
  );
$$;

-- May the caller edit this player's own data (sport profile etc.)? The claimed
-- owner, the creator of a still-unclaimed provisional player, or support.
create or replace function can_edit_player(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select is_support() or exists (
    select 1 from players p
    where p.id = p_player
      and ( p.profile_id = auth.uid()
         or (p.profile_id is null and p.created_by = auth.uid()) )
  );
$$;

-- Last 10 digits — the comparison key for Indian mobile numbers stored with or
-- without +91 (mirrors core/phone.ts phoneKey).
create or replace function phone_key(p text)
  returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '');
$$;


-- ---------- 1. Rate-limit ledger (edge functions + RPCs) --------------------
-- Fixed-window counter: one row per (bucket, subject, window). Clients have no
-- access (RLS on, no policies); edge functions call rate_limit_hit() with the
-- service role, and our SECURITY DEFINER RPCs call it directly.

create table if not exists rate_limit_hits (
  bucket       text not null,
  subject      text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (bucket, subject, window_start)
);
alter table rate_limit_hits enable row level security;

-- Count one hit; true while the subject is still within p_max hits per window.
create or replace function rate_limit_hit(p_bucket text, p_subject text, p_max int, p_window_seconds int)
  returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into rate_limit_hits as r (bucket, subject, window_start, hits)
  values (p_bucket, coalesce(p_subject, 'anon'), w, 1)
  on conflict (bucket, subject, window_start) do update set hits = r.hits + 1
  returning hits into n;
  -- Opportunistic cleanup so the ledger never grows unbounded.
  if random() < 0.01 then
    delete from rate_limit_hits where window_start < now() - interval '2 days';
  end if;
  return n <= p_max;
end $$;
revoke all on function rate_limit_hit(text, text, int, int) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, text, int, int) to service_role;


-- ---------- 2. Privilege escalation: profiles.role --------------------------
-- 'support' / 'admin' unlock the verification console (every uploaded ID
-- document) and edits to any player. They must only ever be granted by staff
-- (SQL editor / service role) — never chosen at sign-up or self-assigned.

create or replace function guard_profile_role()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if tg_op = 'INSERT' then
    if new.role in ('support', 'admin') then new.role := 'fan'; end if;
  elsif new.role is distinct from old.role
        and (new.role in ('support', 'admin') or old.role in ('support', 'admin')) then
    raise exception 'Only SportnNote staff can change this role' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_role on profiles;
create trigger guard_profile_role before insert or update on profiles
  for each row execute function guard_profile_role();

-- Sign-up trigger: same body as migration 0011, but the role from client-supplied
-- metadata is restricted to the self-service roles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base_handle text;
  new_handle  text;
  n           int := 0;
  safe_role   text;
begin
  base_handle := nullif(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]', '', 'g'), '');
  base_handle := coalesce(base_handle, 'user');
  new_handle := base_handle;
  while exists (select 1 from public.profiles where handle = new_handle) loop
    n := n + 1;
    new_handle := base_handle || n::text;
  end loop;

  safe_role := case when meta->>'role' in ('organizer','scorer','player','parent','fan')
                    then meta->>'role' else 'fan' end;

  insert into public.profiles (id, full_name, handle, role, dob, phone, guardian)
  values (
    new.id,
    coalesce(nullif(meta->>'full_name', ''), 'Player'),
    new_handle,
    safe_role,
    nullif(meta->>'dob', '')::date,
    nullif(meta->>'phone', ''),
    case when meta ? 'guardian' and jsonb_typeof(meta->'guardian') = 'object' then meta->'guardian' else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ---------- 3. Players: verification flags + provisional rows ---------------


create or replace function guard_player_write()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  my_email    text;
  my_email_ok boolean := false;
  my_phone    text;
begin
  if not is_client_request() or is_support() then return new; end if;

  select u.email, (u.email_confirmed_at is not null)
    into my_email, my_email_ok
    from auth.users u where u.id = auth.uid();
  my_email_ok := coalesce(my_email_ok, false);

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.phone_verified := false;               -- only verify-contact-otp sets this
    new.reported_at := null;
    new.email_verified := coalesce(new.email_verified, false)
      and new.profile_id = auth.uid() and my_email_ok
      and lower(coalesce(new.email, '')) = lower(coalesce(my_email, ''));
    if coalesce(new.verification->>'status', 'pending') <> 'pending' then
      new.verification := new.verification - 'status';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if old.profile_id is null and new.profile_id is not null then
    -- Claiming a provisional player: only for yourself, only one that matches
    -- your own number or confirmed email, never one flagged "not me".
    select phone into my_phone from profiles where id = auth.uid();
    if new.profile_id <> auth.uid()
       or old.reported_at is not null
       or not coalesce( (phone_key(old.phone) is not null and phone_key(old.phone) = phone_key(my_phone))
                     or (old.email is not null and my_email_ok and lower(old.email) = lower(my_email)), false) then
      raise exception 'You can only claim a profile that matches your own phone number or email'
        using errcode = '42501';
    end if;
  elsif old.profile_id is null and old.created_by is distinct from auth.uid() then
    raise exception 'Only the person who added this player can edit it' using errcode = '42501';
  end if;

  new.created_by := old.created_by;
  new.reported_at := old.reported_at;

  -- phone_verified: never set by the client; a changed number is unverified.
  new.phone_verified := case when phone_key(new.phone) is distinct from phone_key(old.phone)
                             then false else old.phone_verified end;

  -- email_verified: only true for your own confirmed sign-in email.
  if new.email is distinct from old.email or (new.email_verified and not old.email_verified) then
    new.email_verified := coalesce(new.email_verified, false)
      and new.profile_id = auth.uid() and my_email_ok
      and lower(coalesce(new.email, '')) = lower(coalesce(my_email, ''));
  else
    new.email_verified := old.email_verified;
  end if;

  -- verification: the owner may (re)submit → 'pending'; approve/reject is
  -- reviewer-only. Changing a verified DOB or guardian voids the approval.
  if (new.verification->>'status') is distinct from (old.verification->>'status')
     and coalesce(new.verification->>'status', 'pending') <> 'pending' then
    raise exception 'Only SportnNote reviewers can approve or reject verification' using errcode = '42501';
  end if;
  if (old.verification->>'status') = 'approved'
     and (new.dob is distinct from old.dob
          -- the guardian's identity, not bookkeeping flags inside the jsonb
          or (new.guardian->>'name', phone_key(new.guardian->>'phone'), lower(new.guardian->>'email'))
             is distinct from
             (old.guardian->>'name', phone_key(old.guardian->>'phone'), lower(old.guardian->>'email')))
     and (new.verification->>'status') = 'approved' then
    new.verification := new.verification - 'status';
  end if;

  return new;
end $$;

drop trigger if exists guard_player_write on players;
create trigger guard_player_write before insert or update on players
  for each row execute function guard_player_write();


-- ---------- 4. created_by stamping on catalog rows -------------------------


-- Stamp the real creator on client inserts (the client can't claim to be someone
-- else) and freeze it afterwards.
create or replace function stamp_created_by()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['teams','organizations','clubs','team_invites','club_invites'] loop
    execute format('drop trigger if exists stamp_created_by on %I', t);
    execute format('create trigger stamp_created_by before insert or update on %I
                    for each row execute function stamp_created_by()', t);
  end loop;
end $$;


-- ---------- 5. Drop every policy on the tables we fully redefine -------------

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'teams','team_members','team_staff','team_invites','schools','venues',
        'organizations','listings','match_lineups','match_squads','match_disputes',
        'player_sport_profiles','tournament_teams','tournament_categories',
        'clubs','club_members','team_player_roles','club_invites',
        'org_members','org_requests','tournament_officials','activity_log',
        'tournament_ownership_events'])
  loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- Every table here has RLS on already; re-assert for safety.
do $$
declare t text;
begin
  foreach t in array array[
    'teams','team_members','team_staff','team_invites','schools','venues',
    'organizations','listings','match_lineups','match_squads','match_disputes',
    'player_sport_profiles','tournament_teams','tournament_categories',
    'clubs','club_members','team_player_roles','club_invites',
    'org_members','org_requests','tournament_officials','activity_log',
    'tournament_ownership_events'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;


-- ---------- 6. Reference data: schools, venues (read-only to clients) --------
-- The app never writes these; seed/curate them from the dashboard.
create policy schools_read on schools for select using (true);
create policy venues_read  on venues  for select using (true);


-- ---------- 7. Teams + per-sport squads --------------------------------------

create policy teams_read on teams for select using (true);
create policy teams_insert on teams for insert to authenticated
  with check (
    (club_id is null or can_manage_club(club_id))
    -- a club's sport row inherits the club's org, so club authority suffices
    and (org_id is null or club_id is not null or has_org_role(org_id, array['Owner','Admin','Organizer']))
  );
create policy teams_update on teams for update to authenticated
  using (can_edit_team_roster(id)) with check (true);   -- column rules: guard_team_write
create policy teams_delete on teams for delete to authenticated
  using (can_manage_team(id));

create or replace function guard_team_write()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or tg_op <> 'UPDATE' then return new; end if;
  if not can_manage_team(old.id) then
    -- A match scorer/host: roster edits only, plus filling an EMPTY captain /
    -- vice-captain slot ("first player on a captain-less team becomes captain").
    if (new.name, new.short_name, new.sport, new.color_hex, new.school_id, new.org_id, new.club_id, new.adhoc)
       is distinct from (old.name, old.short_name, old.sport, old.color_hex, old.school_id, old.org_id, old.club_id, old.adhoc)
       or (new.captain_id is distinct from old.captain_id and old.captain_id is not null)
       or (new.vice_captain_id is distinct from old.vice_captain_id and old.vice_captain_id is not null) then
      raise exception 'You can only update the squad of this team' using errcode = '42501';
    end if;
  end if;
  -- Moving a team into an org / club needs authority over the destination.
  if new.org_id is distinct from old.org_id and new.org_id is not null
     and not has_org_role(new.org_id, array['Owner','Admin','Organizer']) then
    raise exception 'You can''t move this team into that organization' using errcode = '42501';
  end if;
  if new.club_id is distinct from old.club_id and new.club_id is not null
     and not can_manage_club(new.club_id) then
    raise exception 'You can''t move this team into that club' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_team_write on teams;
create trigger guard_team_write before update on teams
  for each row execute function guard_team_write();

create policy team_members_read on team_members for select using (true);
create policy team_members_write on team_members for all to authenticated
  using (can_manage_team(team_id)) with check (can_manage_team(team_id));

create policy team_player_roles_read on team_player_roles for select using (true);
create policy team_player_roles_write on team_player_roles for all to authenticated
  using (can_manage_team(team_id)) with check (can_manage_team(team_id));

-- team_staff: claimed via claim_team_invite(); a team manager may add/remove
-- staff; anyone may step down from their own staff row.
create policy team_staff_read on team_staff for select using (true);
create policy team_staff_insert on team_staff for insert to authenticated
  with check (can_manage_team(team_id));
create policy team_staff_update on team_staff for update to authenticated
  using (can_manage_team(team_id)) with check (can_manage_team(team_id));
create policy team_staff_delete on team_staff for delete to authenticated
  using (profile_id = auth.uid() or can_manage_team(team_id));


-- ---------- 8. Invites: server-minted tokens, rate-limited redemption -------
-- Tokens are no longer readable by clients (that allowed listing every token).
-- Managers mint them with create_*_invite(); invitees resolve/redeem them with
-- get_*_invite() / claim_*_invite(), which are rate-limited per user.

create policy team_invites_manage on team_invites for all to authenticated
  using (can_manage_team(team_id)) with check (can_manage_team(team_id));
create policy club_invites_manage on club_invites for all to authenticated
  using (can_manage_club(club_id)) with check (can_manage_club(club_id));

-- 50 bits of randomness (10 × 5-bit symbols from an unambiguous 32-char
-- alphabet), e.g. JOIN-7KQ2XH9MWD. gen_random_uuid() is CSPRNG-backed; bytes 6
-- and 8 carry the UUID version/variant bits, so only fully random bytes are used.
create or replace function new_invite_token()
  returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11];
  tok text := 'JOIN-';
  i int;
begin
  foreach i in array idx loop
    tok := tok || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return tok;
end $$;

create or replace function create_team_invite(p_team uuid, p_role text default 'captain')
  returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if auth.uid() is null or not can_manage_team(p_team) then
    raise exception 'Only this team''s managers can create an invite' using errcode = '42501';
  end if;
  if p_role not in ('captain', 'coach') then raise exception 'Invalid role'; end if;
  tok := new_invite_token();
  insert into team_invites (token, team_id, role, created_by) values (tok, p_team, p_role, auth.uid());
  return tok;
end $$;

create or replace function get_team_invite(p_token text)
  returns table (team_id uuid, role text) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in to use an invite code' using errcode = '42501'; end if;
  if not rate_limit_hit('invite-lookup', auth.uid()::text, 30, 3600) then
    raise exception 'Too many invite attempts — try again in an hour' using errcode = '54000';
  end if;
  return query select i.team_id, i.role from team_invites i where i.token = upper(trim(p_token));
end $$;

-- Single-use: a captain/coach invite is consumed when claimed.
create or replace function claim_team_invite(p_token text)
  returns table (team_id uuid, role text) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare inv team_invites;
begin
  if auth.uid() is null then raise exception 'Sign in to use an invite code' using errcode = '42501'; end if;
  if not rate_limit_hit('invite-lookup', auth.uid()::text, 30, 3600) then
    raise exception 'Too many invite attempts — try again in an hour' using errcode = '54000';
  end if;
  delete from team_invites i where i.token = upper(trim(p_token)) returning * into inv;
  if inv.token is null then return; end if;
  insert into team_staff (team_id, profile_id, role) values (inv.team_id, auth.uid(), inv.role)
    on conflict (team_id, profile_id) do update set role = excluded.role;
  return query select inv.team_id, inv.role;
end $$;

create or replace function create_club_invite(p_club uuid)
  returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if auth.uid() is null or not can_manage_club(p_club) then
    raise exception 'Only this team''s admins can create an invite' using errcode = '42501';
  end if;
  tok := new_invite_token();
  insert into club_invites (token, club_id, created_by) values (tok, p_club, auth.uid());
  return tok;
end $$;

create or replace function get_club_invite(p_token text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to use an invite code' using errcode = '42501'; end if;
  if not rate_limit_hit('invite-lookup', auth.uid()::text, 30, 3600) then
    raise exception 'Too many invite attempts — try again in an hour' using errcode = '54000';
  end if;
  select i.club_id into cid from club_invites i where i.token = upper(trim(p_token));
  return cid;
end $$;

-- Club join links are shared to whole groups, so they stay multi-use. Joins as a
-- plain member; an existing membership is left untouched.
create or replace function claim_club_invite(p_token text, p_player uuid)
  returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null or not coalesce(p_player = any(auth_player_ids()), false) then
    raise exception 'You can only join as yourself' using errcode = '42501';
  end if;
  cid := get_club_invite(p_token);
  if cid is null then return null; end if;
  insert into club_members (club_id, player_id, role) values (cid, p_player, 'member')
    on conflict (club_id, player_id) do nothing;
  return cid;
end $$;

revoke all on function create_team_invite(uuid, text), get_team_invite(text), claim_team_invite(text),
                       create_club_invite(uuid), get_club_invite(text), claim_club_invite(text, uuid)
  from public, anon;
grant execute on function create_team_invite(uuid, text), get_team_invite(text), claim_team_invite(text),
                          create_club_invite(uuid), get_club_invite(text), claim_club_invite(text, uuid)
  to authenticated;


-- ---------- 9. Clubs (multi-sport teams) -------------------------------------

create policy clubs_read on clubs for select using (true);
create policy clubs_insert on clubs for insert to authenticated
  with check (org_id is null or has_org_role(org_id, array['Owner','Admin','Organizer']));
create policy clubs_update on clubs for update to authenticated
  using (can_manage_club(id))
  with check (org_id is null or has_org_role(org_id, array['Owner','Admin','Organizer']) or can_manage_club(id));
create policy clubs_delete on clubs for delete to authenticated
  using (can_manage_club(id));

create policy club_members_read on club_members for select using (true);
create policy club_members_insert on club_members for insert to authenticated
  with check (can_manage_club(club_id));
create policy club_members_update on club_members for update to authenticated
  using (can_manage_club(club_id)) with check (can_manage_club(club_id));
create policy club_members_delete on club_members for delete to authenticated
  using (can_manage_club(club_id) or player_id = any(auth_player_ids()));


-- ---------- 10. Organizations + membership -----------------------------------

create policy orgs_read on organizations for select using (true);
create policy orgs_insert on organizations for insert to authenticated with check (true);
-- Owners/Admins edit; the creator can still edit an org that has no Owner yet
-- (the moment between creating it and becoming its first Owner).
create policy orgs_update on organizations for update to authenticated
  using ( has_org_role(id, array['Owner','Admin'])
       or (created_by = auth.uid()
           and not exists (select 1 from org_members m where m.org_id = id and m.role = 'Owner' and m.until is null)) )
  with check (true);
create policy orgs_delete on organizations for delete to authenticated
  using (has_org_role(id, array['Owner']));

-- org_members: readable (rosters are public); writes allowed at the RLS layer
-- but every row change is authorised by guard_org_member().
create policy org_members_read on org_members for select using (true);
create policy org_members_write on org_members for all to authenticated
  using (true) with check (true);

create or replace function guard_org_member()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  v_player uuid := case when tg_op = 'DELETE' then old.player_id else new.player_id end;
  old_owner boolean := tg_op <> 'INSERT' and old.role = 'Owner' and old.until is null;
  new_owner boolean := tg_op <> 'DELETE' and new.role = 'Owner' and new.until is null;
  is_owner boolean;
  is_admin boolean;
  is_self  boolean;
  other_owner boolean;
  invite_ok boolean := false;
  ok boolean := false;
begin
  if not is_client_request() then return coalesce(new, old); end if;

  -- Cascades from deleting the org or the player itself are always fine.
  if tg_op = 'DELETE' and (not exists (select 1 from organizations where id = v_org)
                           or not exists (select 1 from players where id = v_player)) then
    return old;
  end if;

  if tg_op = 'UPDATE' and (new.org_id <> old.org_id or new.player_id <> old.player_id) then
    raise exception 'Membership rows can''t be moved' using errcode = '42501';
  end if;

  is_owner := has_org_role(v_org, array['Owner']);
  is_admin := has_org_role(v_org, array['Owner','Admin']);
  is_self  := v_player = any(auth_player_ids());
  other_owner := exists (select 1 from org_members m where m.org_id = v_org and m.role = 'Owner'
                         and m.until is null and m.player_id <> v_player);
  if tg_op <> 'DELETE' and is_self then
    invite_ok := exists (select 1 from org_requests q
                         where q.org_id = v_org and q.player_id = v_player and q.direction = 'invite'
                           and q.status = 'pending' and q.role = new.role);
  end if;

  -- Never leave an org with zero active Owners.
  if old_owner and not new_owner and not other_owner then
    raise exception 'An organization must always have at least one owner. Make someone else an owner first.'
      using errcode = '42501';
  end if;

  -- Granting Owner: an Owner; or bootstrap (no other Owner) by an Admin or by the
  -- org's creator for themselves; or accepting an Owner invite.
  if new_owner and not old_owner then
    if not ( is_owner
          or (not other_owner and (is_admin
               or (is_self and exists (select 1 from organizations o where o.id = v_org and o.created_by = auth.uid()))))
          or invite_ok ) then
      raise exception 'Only an owner can make someone an owner' using errcode = '42501';
    end if;
    ok := true;   -- the Owner grant itself was authorised above
  end if;

  -- Removing / demoting another Owner needs an Owner (stepping down yourself is fine).
  if old_owner and not new_owner and not is_owner and not is_self then
    raise exception 'Only an owner can change another owner' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    ok := ok or is_admin or invite_ok;
  elsif tg_op = 'DELETE' then
    ok := is_admin;
  else
    if is_admin then
      ok := true;
    elsif is_self then
      -- leave: end your own active membership, nothing else changes
      ok := ok or ( old.until is null and new.until is not null
                    and new.role = old.role and new.since is not distinct from old.since
                    and new.grades is not distinct from old.grades
                    and new.houses is not distinct from old.houses )
              -- re-join via a pending invite (role taken from the invite)
              or (invite_ok and new.until is null);
    else
      -- Accepting someone's join request ends their active membership in another
      -- org of the SAME category (one-active-per-category rule in joinOrg).
      ok := old.until is null and new.until is not null
            and new.role = old.role and new.since is not distinct from old.since
            and new.grades is not distinct from old.grades
            and new.houses is not distinct from old.houses
            and exists (
              select 1 from org_requests q
              join organizations a on a.id = q.org_id
              join organizations b on b.id = v_org
              where q.player_id = v_player and q.direction = 'request' and q.status = 'pending'
                and a.type is not null and a.type = b.type
                and has_org_role(q.org_id, array['Owner','Admin']) );
    end if;
  end if;

  if not ok then
    raise exception 'You don''t have permission to change this membership' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists guard_org_member on org_members;
create trigger guard_org_member before insert or update or delete on org_members
  for each row execute function guard_org_member();

-- org_requests: visible to the person, the creator, and the org's Owners/Admins.
create policy org_requests_read on org_requests for select
  using ( player_id = any(auth_player_ids())
       or created_by = any(auth_player_ids())
       or has_org_role(org_id, array['Owner','Admin']) );
create policy org_requests_write on org_requests for all to authenticated
  using ( player_id = any(auth_player_ids())
       or created_by = any(auth_player_ids())
       or has_org_role(org_id, array['Owner','Admin']) )
  with check (true);   -- transitions: guard_org_request

create or replace function guard_org_request()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid := case when tg_op = 'DELETE' then old.org_id else new.org_id end;
  is_admin boolean := has_org_role(v_org, array['Owner','Admin']);
  is_owner boolean := has_org_role(v_org, array['Owner']);
  is_self  boolean := (case when tg_op = 'DELETE' then old.player_id else new.player_id end) = any(auth_player_ids());
begin
  if not is_client_request() then return coalesce(new, old); end if;

  if tg_op = 'DELETE' then
    if not is_admin then raise exception 'Requests can''t be deleted' using errcode = '42501'; end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is null or not (new.created_by = any(auth_player_ids())) then
      new.created_by := (auth_player_ids())[1];
    end if;
    new.status := 'pending'; new.decided_at := null; new.decided_by := null;
    if new.direction = 'request' then
      if not is_self then raise exception 'You can only ask to join for yourself' using errcode = '42501'; end if;
      new.role := 'Member';
    else
      if not is_admin then raise exception 'Only owners and admins can invite' using errcode = '42501'; end if;
      if new.role = 'Owner' and not is_owner then
        raise exception 'Only an owner can invite an owner' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if (new.org_id, new.player_id, new.direction) is distinct from (old.org_id, old.player_id, old.direction) then
    raise exception 'Requests can''t be moved' using errcode = '42501';
  end if;
  if is_admin then
    if new.role = 'Owner' and old.role <> 'Owner' and not is_owner then
      raise exception 'Only an owner can invite an owner' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role or new.created_by is distinct from old.created_by then
    raise exception 'You can''t change this request' using errcode = '42501';
  end if;
  if is_self and old.status = 'pending' and (
       (old.direction = 'invite'  and new.status in ('accepted', 'rejected'))
    or (old.direction = 'request' and new.status in ('cancelled', 'pending')) ) then
    return new;
  end if;
  raise exception 'You can''t change this request' using errcode = '42501';
end $$;

drop trigger if exists guard_org_request on org_requests;
create trigger guard_org_request before insert or update or delete on org_requests
  for each row execute function guard_org_request();


-- ---------- 11. Tournaments + matches ---------------------------------------

drop policy if exists "authed create tourneys" on tournaments;
drop policy if exists "manage tourneys" on tournaments;
create policy "authed create tourneys" on tournaments for insert to authenticated
  with check ( (host_org_id is null or has_org_role(host_org_id, array['Owner','Admin','Organizer']))
           and (organizer_id is null or organizer_id = auth.uid())
           and (created_by is null or created_by = any(auth_player_ids())) );
create policy "manage tourneys" on tournaments for update to authenticated
  using (can_manage_tournament(id)) with check (true);   -- column rules: guard_tournament_write

create or replace function guard_tournament_write()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  -- Ownership changes go through transfer_tournament_ownership() only.
  if new.organizer_id is distinct from old.organizer_id or new.created_by is distinct from old.created_by then
    raise exception 'Use "Transfer ownership" to change who owns this tournament' using errcode = '42501';
  end if;
  if new.host_org_id is distinct from old.host_org_id then
    raise exception 'Use "Transfer ownership" to change who owns this tournament' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_tournament_write on tournaments;
create trigger guard_tournament_write before update on tournaments
  for each row execute function guard_tournament_write();

-- Matches: you can only add a match to a tournament you manage.
drop policy if exists "authed create match" on matches;
create policy "authed create match" on matches for insert to authenticated
  with check (tournament_id is null or can_manage_tournament(tournament_id));

create or replace function guard_match_move()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_client_request() and new.tournament_id is distinct from old.tournament_id
     and new.tournament_id is not null and not can_manage_tournament(new.tournament_id) then
    raise exception 'You can only move a match into a tournament you manage' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_match_move on matches;
create trigger guard_match_move before update on matches
  for each row execute function guard_match_move();

-- Atomic ownership transfer (+ audit row). The previous owner's implicit
-- organizer_id control is cleared so a transfer really hands control over.
create or replace function transfer_tournament_ownership(
  p_tid uuid, p_org uuid, p_player_ids uuid[], p_host_name text,
  p_from_kind text, p_from_name text)
  returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := (auth_player_ids())[1];
  my_name text;
begin
  if auth.uid() is null or not can_manage_tournament(p_tid) then
    raise exception 'Only this tournament''s owners can transfer it' using errcode = '42501';
  end if;
  if p_org is not null and not has_org_role(p_org, array['Owner','Admin','Organizer']) then
    raise exception 'You can only transfer to an organization you help run' using errcode = '42501';
  end if;
  if p_org is null and coalesce(array_length(p_player_ids, 1), 0) = 0 then
    raise exception 'Pick who to transfer the tournament to';
  end if;
  select full_name into my_name from players where id = me;

  perform set_config('app.trusted_rpc', 'on', true);
  update tournaments
     set host_org_id = p_org,
         host_ids = case when p_org is null then p_player_ids else '{}'::uuid[] end,
         host_name = coalesce(nullif(trim(p_host_name), ''), host_name),
         organizer_id = null
   where id = p_tid;
  insert into tournament_ownership_events
    (tournament_id, action, from_kind, from_name, to_kind, to_name, by_player_id, by_name)
  values
    (p_tid, 'transferred', p_from_kind, p_from_name,
     case when p_org is null then 'individual' else 'org' end, p_host_name, me, my_name);
  perform set_config('app.trusted_rpc', 'off', true);
end $$;
revoke all on function transfer_tournament_ownership(uuid, uuid, uuid[], text, text, text) from public, anon;
grant execute on function transfer_tournament_ownership(uuid, uuid, uuid[], text, text, text) to authenticated;

-- Tournament participants: organizers add/manage; a team's managers may ask to
-- join an OPEN tournament (pending), accept an invite, or withdraw.
create policy tournament_teams_read on tournament_teams for select using (true);
create policy tournament_teams_insert on tournament_teams for insert to authenticated
  with check ( can_manage_tournament(tournament_id)
            or ( can_manage_team(team_id) and status = 'pending'
                 and exists (select 1 from tournaments t where t.id = tournament_id and t.is_open) ) );
create policy tournament_teams_update on tournament_teams for update to authenticated
  using (can_manage_tournament(tournament_id) or can_manage_team(team_id))
  with check (true);   -- transitions: guard_tournament_team
create policy tournament_teams_delete on tournament_teams for delete to authenticated
  using (can_manage_tournament(tournament_id) or can_manage_team(team_id));

create or replace function guard_tournament_team()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or can_manage_tournament(old.tournament_id) then return new; end if;
  -- A team manager may only accept an invite (invited → confirmed).
  if old.status = 'invited' and new.status = 'confirmed'
     and new.tournament_id = old.tournament_id and new.team_id = old.team_id
     and new.category_id is not distinct from old.category_id then
    return new;
  end if;
  raise exception 'Only the organizer can change this entry' using errcode = '42501';
end $$;
drop trigger if exists guard_tournament_team on tournament_teams;
create trigger guard_tournament_team before update on tournament_teams
  for each row execute function guard_tournament_team();

create policy tournament_categories_read on tournament_categories for select using (true);
create policy tournament_categories_write on tournament_categories for all to authenticated
  using (can_manage_tournament(tournament_id)) with check (can_manage_tournament(tournament_id));

create policy tournament_officials_read on tournament_officials for select using (true);
create policy tournament_officials_write on tournament_officials for all to authenticated
  using (can_manage_tournament(tournament_id)) with check (can_manage_tournament(tournament_id));


-- ---------- 12. Audit trails: insert-only, stamped with the real actor -------

create or replace function stamp_audit_actor()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if new.by_player_id is null or not (new.by_player_id = any(auth_player_ids())) then
    new.by_player_id := (auth_player_ids())[1];
  end if;
  new.by_name := (select full_name from players where id = new.by_player_id);
  new.at := now();
  return new;
end $$;

create policy activity_log_read on activity_log for select using (true);
create policy activity_log_insert on activity_log for insert to authenticated
  with check (
    (scope = 'org' and ( has_org_role(ref_id, array['Owner','Admin'])
                      or exists (select 1 from org_members m
                                 where m.org_id = ref_id and m.player_id = any(auth_player_ids())) ))
    or (scope = 'tournament' and can_manage_tournament(ref_id))
  );
drop trigger if exists stamp_audit_actor on activity_log;
create trigger stamp_audit_actor before insert on activity_log
  for each row execute function stamp_audit_actor();

create policy ownership_events_read on tournament_ownership_events for select using (true);
create policy ownership_events_insert on tournament_ownership_events for insert to authenticated
  with check (action = 'created' and can_manage_tournament(tournament_id));
drop trigger if exists stamp_audit_actor on tournament_ownership_events;
create trigger stamp_audit_actor before insert on tournament_ownership_events
  for each row execute function stamp_audit_actor();


-- ---------- 13. Match-day data: squads, lineups, disputes --------------------

create policy match_squads_read on match_squads for select using (true);
create policy match_squads_write on match_squads for all to authenticated
  using (can_manage_match_side(match_id, side)) with check (can_manage_match_side(match_id, side));

create policy match_lineups_read on match_lineups for select using (true);
create policy match_lineups_write on match_lineups for all to authenticated
  using (can_manage_match_side(match_id, 'home') or can_manage_match_side(match_id, 'away'))
  with check (can_manage_match_side(match_id, 'home') or can_manage_match_side(match_id, 'away'));

-- A team manager (not a match manager) may only change their own side.
create or replace function guard_lineup_side()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or can_manage_match(old.match_id) then return new; end if;
  if not can_manage_match_side(old.match_id, 'home')
     and (new.home, new.home_formation) is distinct from (old.home, old.home_formation) then
    raise exception 'You can only change your own team''s lineup' using errcode = '42501';
  end if;
  if not can_manage_match_side(old.match_id, 'away')
     and (new.away, new.away_formation) is distinct from (old.away, old.away_formation) then
    raise exception 'You can only change your own team''s lineup' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_lineup_side on match_lineups;
create trigger guard_lineup_side before update on match_lineups
  for each row execute function guard_lineup_side();

-- Disputes: anyone signed in may raise one (an objection only about yourself;
-- a report goes to the organizer to triage). Match managers run the process;
-- each side's team managers confirm for their side; the raiser can propose.
create policy match_disputes_read on match_disputes for select using (true);
create policy match_disputes_insert on match_disputes for insert to authenticated
  with check (raised_by = any(auth_player_ids()));
create policy match_disputes_update on match_disputes for update to authenticated
  using ( can_manage_match_side(match_id, 'home') or can_manage_match_side(match_id, 'away')
       or raised_by = any(auth_player_ids()) )
  with check (true);   -- transitions: guard_dispute

create or replace function guard_dispute()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  home_ok boolean;
  away_ok boolean;
begin
  if not is_client_request() then return new; end if;

  if tg_op = 'INSERT' then
    if new.kind = 'objection' then
      if not coalesce(new.player_id = any(auth_player_ids()), false) then
        raise exception 'You can only object to your own participation — report someone else instead'
          using errcode = '42501';
      end if;
      new.status := 'open';
    else
      new.status := 'reported';
    end if;
    new.home_captain_ok := false; new.away_captain_ok := false;
    new.replacement_id := null; new.replacement_name := null; new.resolved_at := null;
    return new;
  end if;

  if can_manage_match(old.match_id) then return new; end if;

  if (new.match_id, new.side, new.player_id, new.player_name, new.kind, new.status,
      new.raised_by, new.raised_by_name, new.raised_at, new.resolved_at)
     is distinct from
     (old.match_id, old.side, old.player_id, old.player_name, old.kind, old.status,
      old.raised_by, old.raised_by_name, old.raised_at, old.resolved_at) then
    raise exception 'Only the match organizer can change this dispute''s status' using errcode = '42501';
  end if;
  home_ok := can_manage_match_side(old.match_id, 'home');
  away_ok := can_manage_match_side(old.match_id, 'away');
  if new.home_captain_ok is distinct from old.home_captain_ok and not home_ok then
    raise exception 'Only the home side can confirm for the home side' using errcode = '42501';
  end if;
  if new.away_captain_ok is distinct from old.away_captain_ok and not away_ok then
    raise exception 'Only the away side can confirm for the away side' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_dispute on match_disputes;
create trigger guard_dispute before insert or update on match_disputes
  for each row execute function guard_dispute();


-- ---------- 14. Player sport profiles + listings -----------------------------

create policy sport_profiles_read on player_sport_profiles for select using (true);
create policy sport_profiles_write on player_sport_profiles for all to authenticated
  using (can_edit_player(player_id)) with check (can_edit_player(player_id));

create policy listings_read on listings for select using (true);
create policy listings_write on listings for all to authenticated
  using (author_id = any(auth_player_ids())) with check (author_id = any(auth_player_ids()));

-- The "verified contact" badge is computed, not claimed: true only when the
-- listing's number is the author's own verified number. The author name is the
-- author's real name.
create or replace function stamp_listing()
  returns trigger language plpgsql security definer set search_path = public as $$
declare p players;
begin
  if not is_client_request() then return new; end if;
  select * into p from players where id = new.author_id;
  new.author_name := coalesce(p.full_name, new.author_name);
  new.contact_verified := coalesce(p.phone_verified, false)
    and phone_key(new.contact_phone) is not null
    and phone_key(new.contact_phone) = phone_key(p.phone);
  return new;
end $$;
drop trigger if exists stamp_listing on listings;
create trigger stamp_listing before insert or update on listings
  for each row execute function stamp_listing();


-- ---------- 15. Push: who may notify whom -----------------------------------
-- Used by the push-send edge function (called with the CALLER's JWT, so
-- auth.uid() is the sender). Returns the subset of p_targets the caller has a
-- real relationship with. Support staff may notify anyone (verification
-- decisions).
create or replace function push_allowed_targets(p_targets uuid[])
  returns uuid[] language sql stable security definer set search_path = public as $$
  with me as (select auth_player_ids() as ids),
  -- teams the caller manages, captains, plays on, or runs a live/scheduled match for
  my_teams as (
    select t.id from teams t, me
    where can_edit_team_roster(t.id)
       or t.roster ?| (select array_agg(x::text) from unnest(me.ids) x)
       or exists (select 1 from team_members tm where tm.team_id = t.id and tm.player_id = any(me.ids))
  ),
  -- matches the caller manages or plays in
  my_matches as (
    select m.id from matches m
    where can_manage_match(m.id)
       or m.home_team_id in (select id from my_teams)
       or m.away_team_id in (select id from my_teams)
  ),
  -- tournaments the caller manages or has a team entered in
  my_tournaments as (
    select t.id from tournaments t where can_manage_tournament(t.id)
    union
    select tt.tournament_id from tournament_teams tt where tt.team_id in (select id from my_teams)
  )
  select coalesce(array_agg(x), '{}') from unnest(p_targets) x
  where is_support()
     or x = any(auth_player_ids())
     -- shares a team (captain / vice / roster / member)
     or exists (select 1 from teams t where t.id in (select id from my_teams)
                and (t.captain_id = x or t.vice_captain_id = x or t.roster ? x::text
                     or exists (select 1 from team_members tm where tm.team_id = t.id and tm.player_id = x)))
     -- a scorer / host / player of a match the caller is involved in
     or exists (select 1 from matches m where m.id in (select id from my_matches)
                and (x = any(m.scorer_ids) or x = any(m.host_ids) or m.scorer_id = x
                     or exists (select 1 from teams t where t.id in (m.home_team_id, m.away_team_id)
                                and (t.captain_id = x or t.vice_captain_id = x or t.roster ? x::text))))
     -- a host, or an entered team's captain, of a tournament the caller is in
     or exists (select 1 from tournaments t where t.id in (select id from my_tournaments)
                and (x = any(t.host_ids)
                     or exists (select 1 from org_members om where om.org_id = t.host_org_id
                                and om.player_id = x and om.until is null
                                and om.role in ('Owner','Admin','Organizer'))
                     or exists (select 1 from tournament_teams tt join teams tm on tm.id = tt.team_id
                                where tt.tournament_id = t.id
                                  and (tm.captain_id = x or tm.vice_captain_id = x))))
     -- a fellow member of an org the caller is in
     or exists (select 1 from org_members a join org_members b on a.org_id = b.org_id
                where a.player_id = any(auth_player_ids()) and a.until is null
                  and b.player_id = x and b.until is null)
     -- a fellow member of a club
     or exists (select 1 from club_members a join club_members b on a.club_id = b.club_id
                where a.player_id = any(auth_player_ids()) and b.player_id = x);
$$;
revoke all on function push_allowed_targets(uuid[]) from public, anon;
grant execute on function push_allowed_targets(uuid[]) to authenticated;

-- ============================================================================
--  End migration 0025. After running: redeploy the edge functions changed in
--  the same commit (push-send, support-assistant, support-escalate, send-invite,
--  verification-submit, notify-followers, notify-upcoming) — see
--  docs/security-hardening.md for the deploy + secrets checklist.
-- ============================================================================

-- >>>>>>>>>> 20261007120000_private_contact_details.sql
-- ============================================================================
--  Sportfolio · migration 0026 — Private contact details + privacy settings
--  Delta on top of migrations 0001–0025. Idempotent — safe to re-run.
--  PREREQUISITE: 0025 (security hardening) — uses its helpers.
--
--  Why: players / profiles were readable by anyone holding the app's anon key,
--  including phone, email, date of birth and guardian contacts — mostly school
--  children's. Under the DPDP Act 2023 children's data needs strict handling.
--
--  The talent-scouting side of the product stays public: name, photo, sports,
--  city, school/house, bio, stats and an AGE (years, derived) remain visible to
--  everyone. What becomes private:
--    phone, email, dob, guardian (contact), verification (beyond its status)
--  visible only to:
--    • the person themselves (and the creator of a still-unclaimed provisional
--      player, who entered the details), and SportnNote support;
--    • for an unclaimed provisional player, the managers of a team it's on (they
--      need the number to send the WhatsApp/SMS install invite);
--    • anyone, for phone/email the person has CHOSEN to show (show_phone /
--      show_email) — adults only; it never applies to under-18s.
--
--  Mechanism (one table, no data move):
--    1. Column privileges: clients can no longer SELECT the private columns of
--       players / profiles at all. Writes are unchanged.
--    2. players_view: the read model the app uses. It returns every public column
--       plus the private ones filled in only when the viewer is allowed (else
--       null), and derived public fields (age; guardian present/verified flags;
--       verification status) so eligibility checks still work for organizers.
--    3. RPCs for the lookups that used to filter on private columns:
--       find_player_by_phone / find_player_by_email (exact match, returns only
--       id + name, rate-limited), my_claimable_player(), my_profile_private().
-- ============================================================================

-- ---------- 1. Privacy settings (default: hidden) ---------------------------
alter table players add column if not exists show_phone boolean not null default false;
alter table players add column if not exists show_email boolean not null default false;


-- ---------- 2. Who may see a player's private details -----------------------

-- Full private access: self, creator of an unclaimed provisional, support.
create or replace function can_view_player_private(p_profile uuid, p_created_by uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
       p_profile = auth.uid()
    or (p_profile is null and p_created_by = auth.uid())
    or is_support()
  );
$$;

-- The phone of an UNCLAIMED provisional player, for whoever runs a team it's on
-- (captain / organizer / match scorer) — needed to send the install invite.
create or replace function can_contact_provisional(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from teams t
    where t.roster ? p_player::text and can_edit_team_roster(t.id)
  );
$$;


-- ---------- 3. players_view: the app's read model ----------------------------
-- Runs with the owner's rights (so it can read the private columns) and decides
-- per row what to reveal. security_barrier stops filter push-down from leaking
-- hidden values through clever WHERE clauses.
-- Drop + recreate (not CREATE OR REPLACE) so re-running any of 0026/0027 in any
-- order works; nothing depends on the view.
drop view if exists players_view;
create view players_view with (security_barrier = true) as
select
  p.id, p.profile_id, p.full_name, p.jersey_no, p.sports, p.house_name, p.house_color,
  p.city, p.school_id, p.phone_verified, p.email_verified, p.photo_url, p.sport_details,
  p.created_at, p.updated_at, p.invited, p.gender, p.bio, p.reported_at, p.created_by,
  p.show_phone, p.show_email,
  a.age,
  case when a.priv or a.provisional_contact or (p.show_phone and a.adult) then p.phone end as phone,
  case when a.priv or (p.show_email and a.adult) then p.email end as email,
  case when a.priv then p.dob end as dob,
  case when a.priv then p.guardian
       when p.guardian is null then null
       else jsonb_build_object(
              'hidden', true,
              'present', coalesce(p.guardian->>'name', '') <> '',
              'phoneVerified', coalesce((p.guardian->>'phoneVerified')::boolean, false),
              'emailVerified', coalesce((p.guardian->>'emailVerified')::boolean, false))
  end as guardian,
  case when a.priv then p.verification
       when p.verification is null then null
       else jsonb_strip_nulls(jsonb_build_object('status', p.verification->>'status'))
  end as verification
from players p
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    case when p.profile_id is null then can_contact_provisional(p.id) else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    coalesce(p.dob <= (current_date - interval '18 years')::date, false) as adult
) a;

grant select on players_view to anon, authenticated;


-- ---------- 4. Lock the private columns on the base tables -------------------
-- Table-level SELECT is replaced by a column list. NOTE for future migrations:
-- a NEW public column on players/profiles must be added to these grants (and to
-- players_view) or clients won't be able to read it.
revoke select on players from anon, authenticated;
grant select (
  id, profile_id, full_name, jersey_no, sports, house_name, house_color, city, school_id,
  phone_verified, email_verified, photo_url, sport_details, created_at, updated_at,
  invited, gender, bio, reported_at, created_by, show_phone, show_email
) on players to anon, authenticated;

revoke select on profiles from anon, authenticated;
grant select (id, full_name, handle, avatar_url, role, school_id, created_at, time_zone)
  on profiles to anon, authenticated;


-- ---------- 5. Lookups that used to read private columns ---------------------

-- "Is this number already someone?" — the phone = one-person dedupe used when
-- adding/inviting by number. Exact match only; returns no contact details.
create or replace function find_player_by_phone(p_phone text)
  returns table (id uuid, full_name text, claimed boolean)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if phone_key(p_phone) is null or length(phone_key(p_phone)) < 10 then return; end if;
  if not rate_limit_hit('contact-lookup', auth.uid()::text, 60, 3600) then
    raise exception 'Too many lookups — try again in an hour' using errcode = '54000';
  end if;
  return query
    select p.id, p.full_name, p.profile_id is not null
    from players p where phone_key(p.phone) = phone_key(p_phone)
    order by (p.profile_id is not null) desc, p.created_at
    limit 1;
end $$;

create or replace function find_player_by_email(p_email text)
  returns table (id uuid, full_name text, claimed boolean)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if coalesce(trim(p_email), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return; end if;
  if not rate_limit_hit('contact-lookup', auth.uid()::text, 60, 3600) then
    raise exception 'Too many lookups — try again in an hour' using errcode = '54000';
  end if;
  return query
    select p.id, p.full_name, p.profile_id is not null
    from players p where lower(p.email) = lower(trim(p_email))
    order by (p.profile_id is not null) desc, p.created_at
    limit 1;
end $$;

-- The provisional player waiting for ME — matched on my own profile number (or
-- confirmed sign-in email), never on a value the caller passes in.
create or replace function my_claimable_player()
  returns uuid language sql stable security definer set search_path = public as $$
  select p.id from players p
  where p.profile_id is null and p.reported_at is null
    and (
      (phone_key(p.phone) is not null
        and phone_key(p.phone) = phone_key((select phone from profiles where id = auth.uid())))
      or (p.email is not null and exists (
            select 1 from auth.users u
            where u.id = auth.uid() and u.email_confirmed_at is not null
              and lower(u.email) = lower(p.email)))
    )
  order by p.created_at
  limit 1;
$$;

-- My own profile's private fields (sign-up number, DOB, guardian).
create or replace function my_profile_private()
  returns table (phone text, dob date, guardian jsonb)
  language sql stable security definer set search_path = public as $$
  select pr.phone, pr.dob, pr.guardian from profiles pr where pr.id = auth.uid();
$$;

revoke all on function find_player_by_phone(text), find_player_by_email(text),
                       my_claimable_player(), my_profile_private()
  from public, anon;
grant execute on function find_player_by_phone(text), find_player_by_email(text),
                          my_claimable_player(), my_profile_private()
  to authenticated;

-- >>>>>>>>>> 20261008120000_messaging.sql
-- ============================================================================
--  Sportfolio · migration 0027 — In-app messaging (+ guardian accounts)
--  Delta on top of migrations 0001–0026. Idempotent — safe to re-run.
--  PREREQUISITE: 0025 + 0026 (uses their helpers, players_view, rate limiter).
--
--  Lets scouts / coaches / organizers reach a player WITHOUT seeing their number
--  (contact details are private since 0026). Child-safety rules (DPDP Act 2023):
--
--    • Messages about an UNDER-18 player go to their parent/guardian — never to
--      the child's own account. The child's account can't read those threads.
--    • A guardian gets an inbox by LINKING their own SportnNote account to the
--      child: they prove they own the guardian email on file by entering a code
--      we email there. Until linked, a message is delivered to that email (with
--      the code), so the guardian can still be reached.
--    • Only adults (18+) can send. Under-18 accounts can't message anyone.
--    • The sender never learns the guardian's name, email or account.
--    • Recipients can block a sender and report a message; new conversations and
--      messages are rate-limited per sender.
--
--  All writes go through SECURITY DEFINER RPCs (send_message, reply_message,
--  mark_thread_read, block_thread_sender, report_message, claim_guardian_link);
--  clients have read-only access to their own threads/messages. Push / email
--  delivery is done by the `message-notify` and `guardian-link` edge functions.
--
--  This also closes the "guardian verification is client-side" gap from 0026:
--  the guardian's emailVerified / phoneVerified flags and the account link can no
--  longer be set from the app — only by the server (link code / future OTP).
-- ============================================================================


-- ---------- 1. Guardian account link -----------------------------------------
-- The SportnNote account of a minor's parent/guardian (a PROFILE id). Private —
-- not in the client column grants; players_view only says whether one is linked.
alter table players add column if not exists guardian_profile_id uuid references profiles(id) on delete set null;
create index if not exists players_guardian_profile_idx on players (guardian_profile_id) where guardian_profile_id is not null;

-- One active link code per child (hashed; 7-day expiry; attempt cap). No client access.
create table if not exists guardian_link_codes (
  player_id    uuid primary key references players(id) on delete cascade,
  code_hash    text not null unique,
  target_email text not null,
  attempts     int not null default 0,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
alter table guardian_link_codes enable row level security;

-- Clients can't forge the guardian link or the guardian's verified flags; a
-- changed guardian email drops the link + email verification.
create or replace function guard_guardian_fields()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or is_support() then return new; end if;
  if tg_op = 'INSERT' then
    new.guardian_profile_id := null;
    if new.guardian is not null then
      new.guardian := new.guardian || '{"phoneVerified": false, "emailVerified": false}'::jsonb;
    end if;
    return new;
  end if;
  new.guardian_profile_id := old.guardian_profile_id;
  if new.guardian is not null then
    new.guardian := new.guardian || jsonb_build_object(
      'emailVerified', case when lower(coalesce(new.guardian->>'email', '')) = lower(coalesce(old.guardian->>'email', ''))
                            then coalesce((old.guardian->>'emailVerified')::boolean, false) else false end,
      'phoneVerified', case when phone_key(new.guardian->>'phone') is not distinct from phone_key(old.guardian->>'phone')
                            then coalesce((old.guardian->>'phoneVerified')::boolean, false) else false end);
  end if;
  if lower(coalesce(new.guardian->>'email', '')) is distinct from lower(coalesce(old.guardian->>'email', '')) then
    new.guardian_profile_id := null;
  end if;
  return new;
end $$;
drop trigger if exists guard_guardian_fields on players;
create trigger guard_guardian_fields before insert or update on players
  for each row execute function guard_guardian_fields();

-- players_view gains `guardian_linked` (appended — CREATE OR REPLACE VIEW can only
-- add columns at the end). Same body as 0026 otherwise.
-- Drop + recreate (not CREATE OR REPLACE) so re-running any of 0026/0027 in any
-- order works; nothing depends on the view.
drop view if exists players_view;
create view players_view with (security_barrier = true) as
select
  p.id, p.profile_id, p.full_name, p.jersey_no, p.sports, p.house_name, p.house_color,
  p.city, p.school_id, p.phone_verified, p.email_verified, p.photo_url, p.sport_details,
  p.created_at, p.updated_at, p.invited, p.gender, p.bio, p.reported_at, p.created_by,
  p.show_phone, p.show_email,
  a.age,
  case when a.priv or a.provisional_contact or (p.show_phone and a.adult) then p.phone end as phone,
  case when a.priv or (p.show_email and a.adult) then p.email end as email,
  case when a.priv then p.dob end as dob,
  case when a.priv then p.guardian
       when p.guardian is null then null
       else jsonb_build_object(
              'hidden', true,
              'present', coalesce(p.guardian->>'name', '') <> '',
              'phoneVerified', coalesce((p.guardian->>'phoneVerified')::boolean, false),
              'emailVerified', coalesce((p.guardian->>'emailVerified')::boolean, false))
  end as guardian,
  case when a.priv then p.verification
       when p.verification is null then null
       else jsonb_strip_nulls(jsonb_build_object('status', p.verification->>'status'))
  end as verification,
  p.guardian_profile_id is not null as guardian_linked
from players p
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    case when p.profile_id is null then can_contact_provisional(p.id) else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    coalesce(p.dob <= (current_date - interval '18 years')::date, false) as adult
) a;
grant select on players_view to anon, authenticated;


-- ---------- 2. Ages ------------------------------------------------------------

create or replace function player_age(p_player uuid)
  returns int language sql stable security definer set search_path = public as $$
  select extract(year from age(current_date, dob))::int from players where id = p_player and dob is not null;
$$;

-- A signed-in person's age: their own player's DOB, else the sign-up DOB.
create or replace function profile_age(p_profile uuid)
  returns int language sql stable security definer set search_path = public as $$
  select extract(year from age(current_date, coalesce(
           (select dob from players where profile_id = p_profile and dob is not null limit 1),
           (select dob from profiles where id = p_profile))))::int;
$$;


-- ---------- 3. Conversations ---------------------------------------------------

-- One thread per (player it's about, sender). The inbox owner (recipient) is the
-- player's own account, or — for an under-18 — their linked guardian; NULL while
-- the guardian hasn't linked yet (delivered by email meanwhile).
create table if not exists message_threads (
  id                   uuid primary key default gen_random_uuid(),
  subject_player_id    uuid not null references players(id) on delete cascade,
  sender_profile_id    uuid not null references profiles(id) on delete cascade,
  recipient_profile_id uuid references profiles(id) on delete set null,
  via_guardian         boolean not null default false,
  created_at           timestamptz not null default now(),
  last_message_at      timestamptz not null default now(),
  sender_read_at       timestamptz,
  recipient_read_at    timestamptz,
  unique (subject_player_id, sender_profile_id)
);
create index if not exists message_threads_sender_idx on message_threads (sender_profile_id, last_message_at desc);
create index if not exists message_threads_recipient_idx on message_threads (recipient_profile_id, last_message_at desc);

create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references message_threads(id) on delete cascade,
  sender_profile_id uuid not null references profiles(id) on delete cascade,
  body              text not null check (char_length(body) between 1 and 2000),
  created_at        timestamptz not null default now(),
  notified_at       timestamptz,           -- set by message-notify (deliver once)
  removed_at        timestamptz            -- removed by support (body replaced; evidence kept in the report)
);
create index if not exists messages_thread_idx on messages (thread_id, created_at);

create table if not exists message_blocks (
  id                 uuid not null default gen_random_uuid() unique,  -- opaque handle for unblocking
  blocker_profile_id uuid not null references profiles(id) on delete cascade,
  blocked_profile_id uuid not null references profiles(id) on delete cascade,
  label              text,                 -- who it was, as the blocker saw them (never a guardian's identity)
  created_at         timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id)
);

create table if not exists message_reports (
  id                  uuid primary key default gen_random_uuid(),
  message_id          uuid references messages(id) on delete set null,
  thread_id           uuid references message_threads(id) on delete set null,
  reporter_profile_id uuid not null references profiles(id) on delete cascade,
  sender_profile_id   uuid references profiles(id) on delete set null,
  message_body        text,                -- snapshot at report time (evidence survives removal)
  reason              text,
  status              text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution          text check (resolution in ('dismissed', 'removed', 'banned')),
  resolved_by         uuid references profiles(id) on delete set null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

-- People SportnNote support has barred from messaging (after a report).
create table if not exists messaging_bans (
  profile_id uuid primary key references profiles(id) on delete cascade,
  reason     text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table message_threads enable row level security;
alter table messages        enable row level security;
alter table message_blocks  enable row level security;
alter table message_reports enable row level security;
alter table messaging_bans  enable row level security;   -- no client policies

-- Read-only to participants (and support, for reports). All writes are RPCs.
drop policy if exists threads_read on message_threads;
create policy threads_read on message_threads for select to authenticated
  using (auth.uid() in (sender_profile_id, recipient_profile_id) or is_support());
drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated
  using (is_support() or exists (
    select 1 from message_threads t where t.id = thread_id
      and auth.uid() in (t.sender_profile_id, t.recipient_profile_id)));
-- Blocks: no direct client access (the blocked person's account id must not leak);
-- my_blocks() / unblock_message_sender() below.
drop policy if exists blocks_read on message_blocks;
drop policy if exists blocks_delete on message_blocks;
drop policy if exists reports_read on message_reports;
create policy reports_read on message_reports for select to authenticated
  using (is_support());


-- ---------- 4. Sending ----------------------------------------------------------

create or replace function assert_can_message()
  returns void language plpgsql stable security definer set search_path = public as $$
declare a int;
begin
  if auth.uid() is null then raise exception 'Sign in to send messages' using errcode = '42501'; end if;
  a := profile_age(auth.uid());
  if a is null then
    raise exception 'Add your date of birth to your profile to use messaging' using errcode = '42501';
  end if;
  if a < 18 then
    raise exception 'Messaging is for adults. Under-18 players are contacted through their parent/guardian.'
      using errcode = '42501';
  end if;
  if exists (select 1 from messaging_bans where profile_id = auth.uid()) then
    raise exception 'Your messaging has been turned off by SportnNote support. Contact support if you think this is a mistake.'
      using errcode = '42501';
  end if;
end $$;

-- Start (or continue) a conversation about a player. Returns the thread + the new
-- message id (the client then asks message-notify to deliver it).
create or replace function send_message(p_player uuid, p_body text)
  returns table (thread_id uuid, message_id uuid)
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me    uuid := auth.uid();
  body  text := trim(coalesce(p_body, ''));
  tgt   players;
  tage  int;
  recip uuid;
  via   boolean := false;
  th    uuid;
  mid   uuid;
begin
  perform assert_can_message();
  if body = '' or char_length(body) > 2000 then
    raise exception 'Write a message (up to 2000 characters)';
  end if;
  select * into tgt from players where id = p_player;
  if tgt.id is null then raise exception 'Player not found'; end if;
  if tgt.profile_id = me then raise exception 'You can''t message yourself'; end if;

  tage := player_age(p_player);
  if tage is null or tage < 18 then
    -- Under-18 (or age unknown — treated as a minor): the guardian's inbox.
    via := true;
    if tgt.guardian_profile_id is not null then
      recip := tgt.guardian_profile_id;
    elsif coalesce(tgt.guardian->>'email', '') ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      recip := null;   -- delivered by email (with a link code) until they link
    else
      raise exception 'This player''s parent/guardian can''t be reached on SportnNote yet.';
    end if;
  else
    if tgt.profile_id is null then
      raise exception '% isn''t on SportnNote yet.', tgt.full_name;
    end if;
    recip := tgt.profile_id;
  end if;
  if recip = me then raise exception 'You can''t message yourself'; end if;
  if recip is not null and exists (select 1 from message_blocks b
                                   where b.blocker_profile_id = recip and b.blocked_profile_id = me) then
    raise exception 'You can''t message this person.' using errcode = '42501';
  end if;

  select t.id into th from message_threads t where t.subject_player_id = p_player and t.sender_profile_id = me;
  if th is null then
    if not rate_limit_hit('msg-new-thread', me::text, 10, 86400) then
      raise exception 'You''ve started a lot of new conversations today — try again tomorrow.' using errcode = '54000';
    end if;
    insert into message_threads (subject_player_id, sender_profile_id, recipient_profile_id, via_guardian)
      values (p_player, me, recip, via) returning id into th;
  else
    update message_threads t set recipient_profile_id = recip, via_guardian = via where t.id = th;
  end if;
  if not rate_limit_hit('msg-send', me::text, 100, 86400) then
    raise exception 'Daily message limit reached — try again tomorrow.' using errcode = '54000';
  end if;
  insert into messages (thread_id, sender_profile_id, body) values (th, me, body) returning id into mid;
  update message_threads t set last_message_at = now(), sender_read_at = now() where t.id = th;
  return query select th, mid;
end $$;

-- Reply in an existing conversation (either side).
create or replace function reply_message(p_thread uuid, p_body text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  me   uuid := auth.uid();
  body text := trim(coalesce(p_body, ''));
  t    message_threads;
  other uuid;
  mid  uuid;
begin
  perform assert_can_message();
  if body = '' or char_length(body) > 2000 then
    raise exception 'Write a message (up to 2000 characters)';
  end if;
  select * into t from message_threads where id = p_thread;
  if t.id is null or me not in (t.sender_profile_id, coalesce(t.recipient_profile_id, t.sender_profile_id)) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  other := case when me = t.sender_profile_id then t.recipient_profile_id else t.sender_profile_id end;
  if other is not null and exists (select 1 from message_blocks b
       where (b.blocker_profile_id = other and b.blocked_profile_id = me)
          or (b.blocker_profile_id = me and b.blocked_profile_id = other)) then
    raise exception 'You can''t message this person.' using errcode = '42501';
  end if;
  if not rate_limit_hit('msg-send', me::text, 100, 86400) then
    raise exception 'Daily message limit reached — try again tomorrow.' using errcode = '54000';
  end if;
  insert into messages (thread_id, sender_profile_id, body) values (p_thread, me, body) returning id into mid;
  if me = t.sender_profile_id then
    update message_threads set last_message_at = now(), sender_read_at = now() where id = p_thread;
  else
    update message_threads set last_message_at = now(), recipient_read_at = now() where id = p_thread;
  end if;
  return mid;
end $$;

create or replace function mark_thread_read(p_thread uuid)
  returns void language sql security definer set search_path = public as $$
  update message_threads
     set sender_read_at    = case when sender_profile_id = auth.uid() then now() else sender_read_at end,
         recipient_read_at = case when recipient_profile_id = auth.uid() then now() else recipient_read_at end
   where id = p_thread and auth.uid() in (sender_profile_id, recipient_profile_id);
$$;

-- Block the other party of a conversation (without ever exposing their account id).
create or replace function block_thread_sender(p_thread uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare t message_threads; other uuid;
begin
  select * into t from message_threads where id = p_thread;
  if t.id is null or auth.uid() not in (t.sender_profile_id, t.recipient_profile_id) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  other := case when auth.uid() = t.sender_profile_id then t.recipient_profile_id else t.sender_profile_id end;
  if other is null then return; end if;
  insert into message_blocks (blocker_profile_id, blocked_profile_id, label)
  values (auth.uid(), other, (select other_name from my_threads() where thread_id = p_thread))
  on conflict do nothing;
end $$;

-- People I've blocked — label + opaque id only.
create or replace function my_blocks()
  returns table (id uuid, label text, created_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select b.id, coalesce(b.label, 'Someone'), b.created_at from message_blocks b
  where b.blocker_profile_id = auth.uid() order by b.created_at desc;
$$;

create or replace function unblock_message_sender(p_block uuid)
  returns void language sql security definer set search_path = public as $$
  delete from message_blocks where id = p_block and blocker_profile_id = auth.uid();
$$;

create or replace function report_message(p_message uuid, p_reason text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from messages m join message_threads t on t.id = m.thread_id
                 where m.id = p_message and auth.uid() in (t.sender_profile_id, t.recipient_profile_id)) then
    raise exception 'Message not found' using errcode = '42501';
  end if;
  if not rate_limit_hit('msg-report', auth.uid()::text, 20, 86400) then
    raise exception 'Too many reports today' using errcode = '54000';
  end if;
  insert into message_reports (message_id, thread_id, reporter_profile_id, sender_profile_id, message_body, reason)
  select m.id, m.thread_id, auth.uid(), m.sender_profile_id, m.body, left(trim(coalesce(p_reason, '')), 500)
  from messages m where m.id = p_message;
end $$;

-- ---------- 4b. Support moderation --------------------------------------------

-- The report queue (support only), with enough context to decide.
create or replace function support_message_reports(p_status text default 'open')
  returns table (
    report_id uuid, created_at timestamptz, status text, resolution text, reason text,
    message_id uuid, thread_id uuid, message_body text, message_removed boolean,
    reporter_name text, sender_name text, sender_banned boolean,
    subject_name text, via_guardian boolean, report_count int)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_support() then raise exception 'Support only' using errcode = '42501'; end if;
  return query
  select r.id, r.created_at, r.status, r.resolution, r.reason,
         r.message_id, r.thread_id, r.message_body, m.removed_at is not null,
         (select coalesce(pl.full_name, pr.full_name) from profiles pr
            left join players pl on pl.profile_id = pr.id where pr.id = r.reporter_profile_id limit 1),
         (select coalesce(pl.full_name, pr.full_name) from profiles pr
            left join players pl on pl.profile_id = pr.id where pr.id = r.sender_profile_id limit 1),
         exists (select 1 from messaging_bans b where b.profile_id = r.sender_profile_id),
         sp.full_name, coalesce(t.via_guardian, false),
         (select count(*)::int from message_reports r2 where r2.sender_profile_id = r.sender_profile_id)
  from message_reports r
  left join messages m on m.id = r.message_id
  left join message_threads t on t.id = r.thread_id
  left join players sp on sp.id = t.subject_player_id
  where p_status = 'all' or r.status = p_status
  order by r.created_at desc
  limit 200;
end $$;

-- Resolve a report: 'dismiss' | 'remove' (hide the message) | 'ban' (remove +
-- turn off the sender's messaging). Resolves every open report on that message.
create or replace function support_resolve_report(p_report uuid, p_action text)
  returns void language plpgsql security definer set search_path = public as $$
declare r message_reports;
begin
  if not is_support() then raise exception 'Support only' using errcode = '42501'; end if;
  if p_action not in ('dismiss', 'remove', 'ban') then raise exception 'Unknown action'; end if;
  select * into r from message_reports where id = p_report;
  if r.id is null then raise exception 'Report not found'; end if;
  if p_action in ('remove', 'ban') and r.message_id is not null then
    update messages set body = 'This message was removed by SportnNote.', removed_at = now()
     where id = r.message_id and removed_at is null;
  end if;
  if p_action = 'ban' and r.sender_profile_id is not null then
    insert into messaging_bans (profile_id, reason, created_by)
    values (r.sender_profile_id, 'Report ' || r.id, auth.uid())
    on conflict (profile_id) do nothing;
  end if;
  update message_reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         resolution = case p_action when 'dismiss' then 'dismissed' when 'remove' then 'removed' else 'banned' end,
         resolved_by = auth.uid(), resolved_at = now()
   where status = 'open' and (id = p_report or (r.message_id is not null and message_id = r.message_id));
end $$;

-- Lift a messaging ban (support).
create or replace function support_lift_messaging_ban(p_report uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_support() then raise exception 'Support only' using errcode = '42501'; end if;
  delete from messaging_bans where profile_id = (select sender_profile_id from message_reports where id = p_report);
end $$;

-- The inbox: my conversations with display names that never reveal a guardian.
create or replace function my_threads()
  returns table (
    thread_id uuid, subject_player_id uuid, subject_name text,
    other_name text, other_player_id uuid,
    i_started boolean, via_guardian boolean, awaiting_guardian boolean,
    last_message_at timestamptz, last_body text, last_from_me boolean, unread boolean)
  language sql stable security definer set search_path = public as $$
  select t.id, t.subject_player_id, sp.full_name,
         case when t.sender_profile_id = auth.uid()
              then case when t.via_guardian then 'Parent/guardian of ' || sp.full_name else sp.full_name end
              else coalesce(senderp.full_name, senderprof.full_name, 'SportnNote user') end,
         case when t.sender_profile_id = auth.uid() then t.subject_player_id else senderp.id end,
         t.sender_profile_id = auth.uid(), t.via_guardian, t.recipient_profile_id is null,
         t.last_message_at, lm.body, lm.sender_profile_id = auth.uid(),
         coalesce(lm.sender_profile_id <> auth.uid()
                  and lm.created_at > coalesce(case when t.sender_profile_id = auth.uid() then t.sender_read_at else t.recipient_read_at end, '-infinity'),
                  false)
  from message_threads t
  join players sp on sp.id = t.subject_player_id
  left join profiles senderprof on senderprof.id = t.sender_profile_id
  left join lateral (select id, full_name from players where profile_id = t.sender_profile_id limit 1) senderp on true
  left join lateral (select m.body, m.sender_profile_id, m.created_at from messages m
                     where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
  where auth.uid() in (t.sender_profile_id, t.recipient_profile_id)
  order by t.last_message_at desc;
$$;

-- An existing conversation I started about this player (to resume it).
create or replace function my_thread_for_player(p_player uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select id from message_threads where subject_player_id = p_player and sender_profile_id = auth.uid();
$$;


-- ---------- 5. Guardian linking ----------------------------------------------

-- Mint a link code for a child's guardian (service role only — the edge functions
-- email it to the guardian address on file). Returns the plaintext code once.
create or replace function create_guardian_link_code(p_player uuid)
  returns text language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 7, 9];
  code text := '';
  i int;
  email text;
begin
  select guardian->>'email' into email from players where id = p_player;
  if coalesce(email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'No guardian email on file';
  end if;
  foreach i in array idx loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  insert into guardian_link_codes (player_id, code_hash, target_email, attempts, expires_at)
  values (p_player, encode(sha256(convert_to(code, 'UTF8')), 'hex'), lower(email), 0, now() + interval '7 days')
  on conflict (player_id) do update
    set code_hash = excluded.code_hash, target_email = excluded.target_email,
        attempts = 0, expires_at = excluded.expires_at, created_at = now();
  return code;
end $$;
revoke all on function create_guardian_link_code(uuid) from public, anon, authenticated;
grant execute on function create_guardian_link_code(uuid) to service_role;

-- A parent/guardian, signed in with THEIR OWN account, enters the emailed code:
-- links them to the child, marks the guardian email verified, and moves any
-- pending messages about the child into their inbox. Returns the child's id.
create or replace function claim_guardian_link(p_code text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c  guardian_link_codes;
  pl players;
  a  int;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not rate_limit_hit('guardian-claim', me::text, 10, 3600) then
    raise exception 'Too many attempts — try again in an hour' using errcode = '54000';
  end if;
  select * into c from guardian_link_codes
   where code_hash = encode(sha256(convert_to(upper(trim(coalesce(p_code, ''))), 'UTF8')), 'hex');
  if c.player_id is null or c.expires_at < now() then
    raise exception 'That code isn''t valid or has expired — ask for a new one.';
  end if;
  select * into pl from players where id = c.player_id;
  if pl.profile_id = me then
    raise exception 'Sign in with the parent/guardian''s own account (not the player''s) to link.' using errcode = '42501';
  end if;
  a := profile_age(me);
  if a is not null and a < 18 then
    raise exception 'A parent/guardian account must belong to an adult.' using errcode = '42501';
  end if;
  if lower(coalesce(pl.guardian->>'email', '')) <> c.target_email then
    raise exception 'The guardian email on this profile changed — ask for a new code.';
  end if;

  perform set_config('app.trusted_rpc', 'on', true);
  update players
     set guardian_profile_id = me,
         guardian = coalesce(guardian, '{}'::jsonb) || '{"emailVerified": true}'::jsonb
   where id = pl.id;
  update message_threads set recipient_profile_id = me
   where subject_player_id = pl.id and via_guardian;
  perform set_config('app.trusted_rpc', 'off', true);
  delete from guardian_link_codes where player_id = pl.id;
  return pl.id;
end $$;

-- Children linked to me as their guardian (for the guardian's own UI).
create or replace function my_guarded_players()
  returns table (id uuid, full_name text)
  language sql stable security definer set search_path = public as $$
  select id, full_name from players where guardian_profile_id = auth.uid() order by full_name;
$$;

revoke all on function send_message(uuid, text), reply_message(uuid, text), mark_thread_read(uuid),
                       block_thread_sender(uuid), report_message(uuid, text), my_threads(),
                       my_thread_for_player(uuid), claim_guardian_link(text), my_guarded_players(),
                       assert_can_message(), player_age(uuid), profile_age(uuid)
  from public, anon;
grant execute on function send_message(uuid, text), reply_message(uuid, text), mark_thread_read(uuid),
                          block_thread_sender(uuid), report_message(uuid, text), my_threads(),
                          my_thread_for_player(uuid), claim_guardian_link(text), my_guarded_players(),
                          my_blocks(), unblock_message_sender(uuid),
                          support_message_reports(text), support_resolve_report(uuid, text),
                          support_lift_messaging_ban(uuid)
  to authenticated;
revoke all on function my_blocks(), unblock_message_sender(uuid), support_message_reports(text),
                       support_resolve_report(uuid, text), support_lift_messaging_ban(uuid)
  from public, anon;


-- ---------- 6. Live updates -----------------------------------------------------
-- An open conversation listens for new / removed messages over Supabase Realtime.
-- Realtime applies the messages_read policy per subscriber, so only participants
-- (and support) receive a thread's rows.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table messages;
  end if;
end $$;


-- ---------- 7. Guardian phone verification (server-side OTP) --------------------
-- send-contact-otp / verify-contact-otp gain a 'guardian_phone' channel: the code
-- goes to the guardian's number on file (WhatsApp), and only the server flips
-- guardian.phoneVerified. (Delivery needs the WhatsApp template — see
-- docs/whatsapp-otp-setup.md.)
alter table contact_otps drop constraint if exists contact_otps_channel_check;
alter table contact_otps add constraint contact_otps_channel_check
  check (channel in ('email', 'phone', 'guardian_phone'));

-- >>>>>>>>>> 20261009120000_golf_field_events.sql
-- ============================================================================
--  Sportfolio · migration 0028 — Golf + the field-event core
--  Delta on top of migrations 0001–0027. Idempotent — safe to re-run.
--  PREREQUISITE: 0025 (helpers: can_manage_tournament, auth_player_ids,
--  is_client_request, is_support, stamp_created_by).
--
--  Golf stroke play / Stableford is a FIELD event — N players, one leaderboard —
--  not a head-to-head match. This adds the generic field core (reused later by
--  athletics, swimming, archery…) next to `matches`, without touching it:
--    golf_courses  — holes (par + stroke index) and tees (rating + slope)
--    field_events  — one round / heat (tournament round, or a casual round)
--    field_entries — one player in one round; `result` = the golf card
--    stat_lines.event_id — profile stats from a round (match_id stays null)
--  Golf MATCH PLAY uses the existing matches/bracket engine (sport 'golf').
--  See docs/sports/GOLF_DESIGN.md.
--
--  Who may write:
--    • a round's managers: its creator, its hosts, or the tournament's managers
--      — create/start/finish the round, add/remove players, edit anything;
--    • a MARKER: any player in the same group (golf's playing-partner marker
--      convention) — may change cards (result) and mark a card finished, nothing
--      else;
--    • everyone may read (leaderboards are public, like scores).
-- ============================================================================

-- ---------- 1. Tables ---------------------------------------------------------

create table if not exists golf_courses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  holes_data  jsonb not null,               -- [{ n, par, si }]
  tees        jsonb not null default '[]',  -- [{ name, courseRating?, slope?, rating9F?, … }]
  created_by  uuid references profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (jsonb_typeof(holes_data) = 'array' and jsonb_array_length(holes_data) in (9, 18))
);

create table if not exists field_events (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  sport         text not null,
  title         text not null,
  round_no      int not null default 1 check (round_no >= 1),
  starts_at     timestamptz not null default now(),
  status        text not null default 'scheduled' check (status in ('scheduled', 'live', 'completed', 'cancelled')),
  format        jsonb not null default '{}',
  host_ids      uuid[] not null default '{}',   -- PLAYER ids
  created_by    uuid references profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists field_events_tournament_idx on field_events (tournament_id, round_no);
create index if not exists field_events_live_idx on field_events (sport, status);

create table if not exists field_entries (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references field_events(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  group_no       int not null default 1 check (group_no >= 1),
  tee_time       timestamptz,
  start_hole     int,
  handicap_index numeric(4,1) check (handicap_index is null or handicap_index between -10 and 54),
  result         jsonb,
  status         text not null default 'playing' check (status in ('playing', 'finished', 'dnf', 'wd', 'dq')),
  updated_by     uuid references profiles(id) on delete set null default auth.uid(),
  updated_at     timestamptz not null default now(),
  unique (event_id, player_id)
);
create index if not exists field_entries_event_idx on field_entries (event_id, group_no);
create index if not exists field_entries_player_idx on field_entries (player_id);

-- Profile stats from a round: a stat line tied to the event instead of a match.
alter table stat_lines add column if not exists event_id uuid references field_events(id) on delete cascade;
create index if not exists stat_lines_event_idx on stat_lines (event_id) where event_id is not null;


-- ---------- 2. Authority helpers ---------------------------------------------

create or replace function can_manage_field_event(p_event uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from field_events e
    where e.id = p_event
      and ( e.created_by = auth.uid()
         or e.host_ids && auth_player_ids()
         or (e.tournament_id is not null and can_manage_tournament(e.tournament_id)) )
  );
$$;

-- A marker: the caller plays in the same group of the same round.
create or replace function can_mark_field_entry(p_entry uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from field_entries target
    join field_entries mine on mine.event_id = target.event_id and mine.group_no = target.group_no
    where target.id = p_entry and mine.player_id = any(auth_player_ids())
  );
$$;


-- ---------- 3. Policies --------------------------------------------------------

alter table golf_courses  enable row level security;
alter table field_events  enable row level security;
alter table field_entries enable row level security;

drop policy if exists golf_courses_read on golf_courses;
create policy golf_courses_read on golf_courses for select using (true);
drop policy if exists golf_courses_insert on golf_courses;
create policy golf_courses_insert on golf_courses for insert to authenticated with check (true);
drop policy if exists golf_courses_update on golf_courses;
create policy golf_courses_update on golf_courses for update to authenticated
  using (created_by = auth.uid() or is_support()) with check (created_by = auth.uid() or is_support());
drop policy if exists golf_courses_delete on golf_courses;
create policy golf_courses_delete on golf_courses for delete to authenticated
  using (created_by = auth.uid() or is_support());

drop policy if exists field_events_read on field_events;
create policy field_events_read on field_events for select using (true);
drop policy if exists field_events_insert on field_events;
create policy field_events_insert on field_events for insert to authenticated
  with check (tournament_id is null or can_manage_tournament(tournament_id));
drop policy if exists field_events_update on field_events;
create policy field_events_update on field_events for update to authenticated
  using (can_manage_field_event(id)) with check (true);   -- column rules: guard_field_event
drop policy if exists field_events_delete on field_events;
create policy field_events_delete on field_events for delete to authenticated
  using (can_manage_field_event(id));

drop policy if exists field_entries_read on field_entries;
create policy field_entries_read on field_entries for select using (true);
drop policy if exists field_entries_insert on field_entries;
create policy field_entries_insert on field_entries for insert to authenticated
  with check (can_manage_field_event(event_id));
drop policy if exists field_entries_update on field_entries;
create policy field_entries_update on field_entries for update to authenticated
  using (can_manage_field_event(event_id) or can_mark_field_entry(id)) with check (true);  -- column rules: guard_field_entry
drop policy if exists field_entries_delete on field_entries;
create policy field_entries_delete on field_entries for delete to authenticated
  using (can_manage_field_event(event_id));

-- stat_lines for a round: written by the round's managers when it's finished.
drop policy if exists "insert event stats" on stat_lines;
create policy "insert event stats" on stat_lines for insert to authenticated
  with check (event_id is not null and match_id is null and can_manage_field_event(event_id));
drop policy if exists "update event stats" on stat_lines;
create policy "update event stats" on stat_lines for update to authenticated
  using (event_id is not null and can_manage_field_event(event_id))
  with check (event_id is not null and can_manage_field_event(event_id));
drop policy if exists "delete event stats" on stat_lines;
create policy "delete event stats" on stat_lines for delete to authenticated
  using (event_id is not null and can_manage_field_event(event_id));


-- ---------- 4. Column-transition guards ----------------------------------------

drop trigger if exists stamp_created_by on golf_courses;
create trigger stamp_created_by before insert or update on golf_courses
  for each row execute function stamp_created_by();
drop trigger if exists stamp_created_by on field_events;
create trigger stamp_created_by before insert or update on field_events
  for each row execute function stamp_created_by();

-- A round can't be moved into a tournament you don't manage.
create or replace function guard_field_event()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if new.tournament_id is distinct from old.tournament_id and new.tournament_id is not null
     and not can_manage_tournament(new.tournament_id) then
    raise exception 'You can only move a round into a tournament you manage' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_field_event on field_events;
create trigger guard_field_event before update on field_events
  for each row execute function guard_field_event();

-- A marker (not a manager) may only change the card and mark it finished.
create or replace function guard_field_entry()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if can_manage_field_event(old.event_id) then return new; end if;
  if (new.event_id, new.player_id, new.group_no, new.tee_time, new.start_hole, new.handicap_index)
     is distinct from (old.event_id, old.player_id, old.group_no, old.tee_time, old.start_hole, old.handicap_index)
     or (new.status is distinct from old.status and new.status not in ('playing', 'finished')) then
    raise exception 'Markers can only enter scores — ask the organizer for other changes' using errcode = '42501';
  end if;
  -- No scoring once the round is closed.
  if exists (select 1 from field_events e where e.id = old.event_id and e.status = 'completed') then
    raise exception 'This round is finished — scores are locked' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_field_entry on field_entries;
create trigger guard_field_entry before update on field_entries
  for each row execute function guard_field_entry();


-- ---------- 5. Live leaderboards ----------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'field_entries') then
    alter publication supabase_realtime add table field_entries;
  end if;
end $$;

commit;
