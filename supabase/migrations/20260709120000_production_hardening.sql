-- ============================================================================
--  Sportfolio · migration 0001 — Production hardening
--  Delta on top of supabase/schema.sql. On a fresh project: run schema.sql,
--  then this. On an existing one: run this. Idempotent — safe to re-run.
--
--  Closes the demo → live gaps from docs/backend-readiness.md §2–§3:
--    1. profiles.role CHECK — add the internal 'support' (+ 'admin') role
--    2. RLS enabled on EVERY table (8 were wide open with RLS off)
--    3. Scoring writes scoped to the assigned scorer / match+tournament hosts,
--       and the write paths that RLS silently blocked today are unblocked:
--         · matches / tournaments had no INSERT policy → create-* was denied
--         · match_events had no DELETE policy → undo (pop) was denied
--    4. updated_at auto-maintained by trigger
--
--  Pilot posture: the public catalog is read-all; personal rows are owner-only;
--  scoring is manager-scoped; a few management writes (create team/org, edit
--  lineups) stay at "authenticated" and get tightened post-pilot (backend-
--  readiness.md §8). service_role (edge functions) bypasses RLS throughout.
-- ============================================================================

-- ---------- 1. Role constraint: allow the internal support/admin roles ------
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('organizer','scorer','player','parent','fan','support','admin'));

-- Invite-to-install: an organizer-added player is "invited" (pending on the team
-- sheet) until they register & claim the record. (App: Player.invited)
alter table players add column if not exists invited boolean not null default false;

-- Phone = the primary identity key across the platform (one number ⇒ one person).
-- Stored normalised (digits) by the app; unique so a number never yields two names.
alter table profiles add column if not exists phone text;
create unique index if not exists uq_players_phone on players(phone) where phone is not null;
create unique index if not exists uq_profiles_phone on profiles(phone) where phone is not null;

-- Knockout tie-break format for a tournament (extra time + penalties / direct
-- penalties, with ET half length & extra subs). App: Tournament.knockoutFormat.
alter table tournaments add column if not exists knockout_format jsonb;

-- Each user's display timezone (IANA id, e.g. 'Asia/Kolkata') — match times render
-- in the viewer's own zone. Cross-device source of truth once signed in.
alter table profiles add column if not exists time_zone text;

-- ---------- 2. Authority helpers -------------------------------------------
-- security definer so a policy can consult players/matches/tournaments without
-- being re-filtered by their own RLS (and without recursion).

-- The player id(s) the current auth user owns (host_ids hold PLAYER ids).
create or replace function auth_player_ids()
  returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}')::uuid[] from players where profile_id = auth.uid();
$$;

-- May the current user manage this match? Its assigned scorer, a match host, or
-- a host/organizer of its tournament. scorer_id & tournaments.organizer_id are
-- PROFILE ids (= auth.uid()); host_ids are PLAYER ids (→ auth_player_ids()).
create or replace function can_manage_match(p_match_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    left join tournaments t on t.id = m.tournament_id
    where m.id = p_match_id
      and ( m.scorer_id = auth.uid()
         or m.host_ids && auth_player_ids()
         or t.organizer_id = auth.uid()
         or t.host_ids && auth_player_ids() )
  );
$$;

-- ---------- 3. updated_at auto-maintenance ---------------------------------
create or replace function set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'matches','match_lineups','organizations','tournaments','teams','players','listings','stat_lines'
  ] loop
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists trg_set_updated_at on %I', t);
    execute format('create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------- 4. Enable RLS on every table that was still open ----------------
alter table schools        enable row level security;
alter table profiles       enable row level security;
alter table players        enable row level security;
alter table teams          enable row level security;
alter table team_members   enable row level security;
alter table venues         enable row level security;
alter table match_disputes enable row level security;
alter table reminder_sends enable row level security;

-- ---------- 5. Policies for the newly-secured tables -----------------------

-- profiles: anyone reads; a user writes only their own row (id = auth.uid()).
drop policy if exists "read profiles"    on profiles;
drop policy if exists "insert own profile" on profiles;
drop policy if exists "update own profile" on profiles;
create policy "read profiles"      on profiles for select using (true);
create policy "insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "update own profile" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Public catalog (read-all, authed writes for the pilot): players, teams,
-- team_members, schools, venues.
do $$
declare tbl text;
begin
  foreach tbl in array array['players','teams','team_members','schools','venues'] loop
    execute format('drop policy if exists "read %1$s" on %1$s', tbl);
    execute format('drop policy if exists "authed write %1$s" on %1$s', tbl);
    execute format('create policy "read %1$s" on %1$s for select using (true)', tbl);
    execute format($f$create policy "authed write %1$s" on %1$s for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')$f$, tbl);
  end loop;
end $$;

-- match_disputes: read all; any signed-in user may raise / confirm / resolve
-- (captain & organizer scoping stays in app code for the pilot).
drop policy if exists "read disputes"  on match_disputes;
drop policy if exists "authed write disputes" on match_disputes;
create policy "read disputes"  on match_disputes for select using (true);
create policy "authed write disputes" on match_disputes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- reminder_sends: server-only cron ledger. RLS on with NO client policy denies
-- all client access; the notify-* edge functions use service_role (bypasses RLS).

-- ---------- 6. Fix write paths RLS was silently blocking --------------------

-- tournaments: had only a read policy → creation/edits were denied. Add them.
drop policy if exists "authed create tourneys" on tournaments;
drop policy if exists "manage tourneys" on tournaments;
create policy "authed create tourneys" on tournaments for insert
  with check (auth.role() = 'authenticated');
create policy "manage tourneys" on tournaments for update
  using (organizer_id = auth.uid() or host_ids && auth_player_ids())
  with check (organizer_id = auth.uid() or host_ids && auth_player_ids());

-- matches: had no INSERT policy → create-match was denied. Add it.
drop policy if exists "authed create match" on matches;
create policy "authed create match" on matches for insert
  with check (auth.role() = 'authenticated');

-- ---------- 7. Scorer/host-scoped scoring (replaces the pilot policies) ------

-- matches UPDATE: only a match's managers (scorer / host / tournament host).
drop policy if exists "authed writes match" on matches;   -- old pilot policy
drop policy if exists "manage match"        on matches;
create policy "manage match" on matches for update
  using (can_manage_match(id)) with check (can_manage_match(id));

-- match_events: managers insert; managers delete (undo pops the last event).
-- created_by is defaulted to auth.uid() for audit (the app doesn't set it).
alter table match_events alter column created_by set default auth.uid();
drop policy if exists "authed writes events" on match_events;  -- old pilot policy
drop policy if exists "insert events" on match_events;
drop policy if exists "delete events" on match_events;
create policy "insert events" on match_events for insert
  with check (can_manage_match(match_id));
create policy "delete events" on match_events for delete
  using (can_manage_match(match_id));

-- stat_lines: scope writes to the match's managers (replaces authed-any).
drop policy if exists "authed insert stats" on stat_lines;
drop policy if exists "authed update stats" on stat_lines;
drop policy if exists "insert stats" on stat_lines;
drop policy if exists "update stats" on stat_lines;
create policy "insert stats" on stat_lines for insert with check (can_manage_match(match_id));
create policy "update stats" on stat_lines for update
  using (can_manage_match(match_id)) with check (can_manage_match(match_id));

-- ---------- 8. Scale: an index the manager-scoped scoring policies lean on ---
-- can_manage_match() filters events/stats by match; ensure the parent lookups
-- are indexed (matches PK already; add host_ids GIN for the array-overlap test).
create index if not exists idx_matches_host_ids on matches using gin (host_ids);
create index if not exists idx_tournaments_host_ids on tournaments using gin (host_ids);

-- ============================================================================
--  End migration 0001. Verify: docs/backend-readiness.md §3 checklist.
--  Still to do before production (tracked there): real auth (OTP + guardian
--  consent), verification write-path audit, backups (Pro tier), edge-function
--  deploy + cron, and post-pilot tightening of the "authed write" catalog
--  policies to can_manage_* / org-admin scoping.
-- ============================================================================
