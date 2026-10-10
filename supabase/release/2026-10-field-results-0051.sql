-- Release: migration 0051 (field_entries.team_id for relays / crews / team scoring,
-- and the golf-only marker rule; sport-depth SD-28 results engine). Paste into the
-- Supabase SQL editor and Run. Safe to re-run: the column, constraint and indexes are
-- added only if missing; the two functions and the trigger are replaced in place.
-- No rows are inserted, deleted or backfilled. Needs 0028 (field_events) first.
--
-- OPTIONAL read-only check (run separately, after):
--
--   select column_name, is_nullable from information_schema.columns
--   where table_name = 'field_entries' and column_name in ('player_id', 'team_id');
--
begin;
-- ============================================================================
--  Sportfolio · migration 0051 — field results: team / relay entries
--  (sport-depth SD-28 / GEN-27, the results engine for timed / measured events)
--  Delta on top of 0028 (field_events / field_entries). Idempotent — safe to re-run.
--
--  The results engine reuses golf's field core: one PHASE (heats, final, field
--  qualification …) = one field_events row (format.results holds the phase:
--  discipline, category, heats, progression, bar heights); one entry = one
--  field_entries row (group_no = heat, result jsonb = marks / attempts / status
--  / lane). Rounds, heats, lanes, attempts and records all ride jsonb. Only two
--  things need the schema:
--
--   1. field_entries.team_id — the team an entry scores for:
--        • a relay team / rowing or canoe crew (player_id NULL, members in result);
--        • an individual's school / house / contingent (medal & points tables);
--        • golf team stroke play (GF-07 / SD-76, best N of M).
--      player_id becomes nullable; every row still names a player or a team
--      (a relay row also keeps a snapshot of its team in result.team, so if the
--      team is later deleted, team_id goes NULL and the result sheet survives).
--      One relay / crew per team per phase.
--
--   2. Who may write results. 0028 lets any player in the same group "mark"
--      another entry — golf's playing-partner marker convention. In athletics or
--      swimming the group is a HEAT, so that rule would let a competitor edit
--      rivals' times. The marker rule now applies to golf only; every other field
--      sport is entered by the event's managers (creator, hosts, tournament
--      managers) — the "one official on a phone" model. Markers also may not
--      change team_id.
--
--  RLS otherwise mirrors 0028 exactly: public read; managers insert / update /
--  delete. Nothing is backfilled: existing golf rows keep player_id and get a
--  NULL team_id.
--
--  Before this runs the app still works: individual results save as before;
--  relay / crew entries (no player) and team links are refused with the
--  "needs the latest database update" notice.
-- ============================================================================

-- ---------- 1. team_id + nullable player_id -----------------------------------

alter table field_entries add column if not exists team_id uuid references teams(id) on delete set null;
alter table field_entries alter column player_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'field_entries_player_or_team') then
    alter table field_entries add constraint field_entries_player_or_team
      check (player_id is not null or team_id is not null or coalesce(result ? 'team', false));
  end if;
end $$;

-- One relay / crew row per team per phase (individuals of the same school share
-- a team_id, so the rule only covers team-only rows).
create unique index if not exists field_entries_team_entry_uniq
  on field_entries (event_id, team_id) where player_id is null;
create index if not exists field_entries_team_idx on field_entries (team_id) where team_id is not null;


-- ---------- 2. Marker rule: golf only ------------------------------------------

create or replace function can_mark_field_entry(p_entry uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from field_entries target
    join field_events e on e.id = target.event_id and e.sport = 'golf'
    join field_entries mine on mine.event_id = target.event_id and mine.group_no = target.group_no
    where target.id = p_entry and mine.player_id = any(auth_player_ids())
  );
$$;

-- Same guard as 0028, plus team_id among the columns a marker can't touch.
create or replace function guard_field_entry()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if can_manage_field_event(old.event_id) then return new; end if;
  if (new.event_id, new.player_id, new.team_id, new.group_no, new.tee_time, new.start_hole, new.handicap_index)
     is distinct from (old.event_id, old.player_id, old.team_id, old.group_no, old.tee_time, old.start_hole, old.handicap_index)
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
commit;
