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
