-- ============================================================================
--  Sportfolio · SD-130 — record-book integrity, event officials, meet ages
--  Delta on top of 0028 (field_events) and 0051 (field_results). Idempotent —
--  safe to re-run.
--
--  1. merge_field_records() — the meet record book (tournaments.formats[sport]
--     .records, a JSON string) was written read-modify-write from the phone:
--     two officials locking finals at the same moment (the track and a field
--     pit) could overwrite each other's new records. The RPC takes the
--     CHANGES (operations), locks the tournament row, re-reads the book and
--     merges per scope + event + category inside one transaction:
--       better  — keep the mark only if it still beats the stored record
--       set     — a historic record from the school's board (organisers)
--       remove  — delete a record (organisers)
--       restore — "Reopen final": records the event set go back to the
--                 holders before it.
--     Why an RPC on the existing JSON rather than a records table: every
--     reader (hub, results sheet, public /r/ link, school book) already reads
--     formats[sport].records; nothing to backfill, and old app builds keep
--     reading the same place. The lock serialises the writers, which is the
--     whole problem.
--     Who may call: the tournament's managers (any op), and an EVENT HOST
--     (field_events.host_ids, PLAYER ids) for 'better' / 'restore' on the
--     event they run — so a teacher running the long-jump pit can lock a
--     final that sets a record (before this, the write was refused with
--     "You can't change this tournament" after the stat lines were saved).
--
--  2. Event hosts can run the whole event: they may create its next round
--     (heats → final) in the tournament, copying the event's officials. Only
--     the tournament's managers (or a casual event's creator) change who the
--     officials are (host_ids).
--
--  3. meet_ages() — age-group eligibility on the meet's cut-off day (31 Dec of
--     the meet year by default, World Athletics / World Aquatics; or 1 Jan,
--     the meet's first day, or a board's date — formats[sport].ageOn). Live
--     reads of other people carry their age TODAY, not their DOB (private);
--     this returns only the age on the cut-off, to the tournament's managers.
--
--  Before this runs the app still works: records fall back to the old
--  re-read-and-write (organisers only), hosts can't be given events, and ages
--  are counted today.
-- ============================================================================

-- ---------- 1. merge_field_records -------------------------------------------

create or replace function merge_field_records(p_tid uuid, p_sport text, p_ops jsonb, p_phase uuid default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fm      jsonb;
  book    jsonb;
  op      jsonb;
  rec     jsonb;
  cur     jsonb;
  prev    jsonb;
  removed jsonb;
  r       jsonb;
  kind    text;
  better  text;
  manager boolean;
  host_key text;   -- the eventKey of the phase a host runs (null = not a host)
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_sport is null or p_sport !~ '^[a-z_]{2,20}$' then raise exception 'Unknown sport' using errcode = '22023'; end if;
  if jsonb_typeof(p_ops) is distinct from 'array' then raise exception 'Expected a list of record changes' using errcode = '22023'; end if;

  manager := can_manage_tournament(p_tid);
  if p_phase is not null then
    select e.format->'results'->>'eventKey' into host_key
      from field_events e
     where e.id = p_phase and e.tournament_id = p_tid and e.sport = p_sport and can_manage_field_event(e.id);
  end if;
  if not manager and host_key is null then
    raise exception 'You can’t change this tournament’s records' using errcode = '42501';
  end if;

  -- One writer at a time per tournament: the rest wait here, then see the new book.
  select formats into fm from tournaments where id = p_tid for update;
  if not found then raise exception 'Tournament not found' using errcode = 'P0002'; end if;
  begin
    book := case jsonb_typeof(fm->p_sport->'records')
              when 'string' then (fm->p_sport->>'records')::jsonb
              when 'array' then fm->p_sport->'records'
              else '[]'::jsonb end;
  exception when others then book := '[]'::jsonb;
  end;
  if jsonb_typeof(book) is distinct from 'array' then book := '[]'::jsonb; end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    kind := op->>'op';
    if kind in ('set', 'remove') and not manager then
      raise exception 'Only the tournament’s organisers can edit the record board' using errcode = '42501';
    end if;

    if kind in ('better', 'set') then
      rec := op->'rec';
      if jsonb_typeof(rec) is distinct from 'object' or rec->>'scope' not in ('MR', 'SR')
         or coalesce(rec->>'discipline', '') = '' or coalesce(rec->>'category', '') = ''
         or jsonb_typeof(rec->'value') is distinct from 'number' or coalesce(rec->>'holder', '') = '' then
        raise exception 'A record needs a scope, event, category, mark and holder' using errcode = '22023';
      end if;
      -- a host only writes records their own event set
      if not manager and rec->>'eventKey' is distinct from host_key then
        raise exception 'You can only record what your event set' using errcode = '42501';
      end if;
      select x into cur from jsonb_array_elements(book) x
       where x->>'scope' = rec->>'scope' and x->>'discipline' = rec->>'discipline' and x->>'category' = rec->>'category'
       limit 1;
      if kind = 'better' and cur is not null then
        better := coalesce(op->>'better', 'lower');
        if jsonb_typeof(cur->'value') = 'number' and not (
             (better = 'higher' and (rec->>'value')::numeric > (cur->>'value')::numeric)
          or (better <> 'higher' and (rec->>'value')::numeric < (cur->>'value')::numeric)) then
          continue;   -- someone else's record still stands
        end if;
      end if;
      select coalesce(jsonb_agg(x), '[]'::jsonb) into book from jsonb_array_elements(book) x
       where not (x->>'scope' = rec->>'scope' and x->>'discipline' = rec->>'discipline' and x->>'category' = rec->>'category');
      book := book || jsonb_build_array(rec);

    elsif kind = 'remove' then
      select coalesce(jsonb_agg(x), '[]'::jsonb) into book from jsonb_array_elements(book) x
       where not (x->>'scope' = op->>'scope' and x->>'discipline' = op->>'discipline' and x->>'category' = op->>'category');

    elsif kind = 'restore' then
      if not manager and op->>'eventKey' is distinct from host_key then
        raise exception 'You can only reopen your own event' using errcode = '42501';
      end if;
      select coalesce(jsonb_agg(x), '[]'::jsonb) into removed from jsonb_array_elements(book) x
       where x->>'discipline' = op->>'discipline' and x->>'category' = op->>'category' and x->>'eventKey' = op->>'eventKey';
      select coalesce(jsonb_agg(x), '[]'::jsonb) into book from jsonb_array_elements(book) x
       where not (x->>'discipline' = op->>'discipline' and x->>'category' = op->>'category' and coalesce(x->>'eventKey', '') = coalesce(op->>'eventKey', ''));
      for r in select * from jsonb_array_elements(removed) loop
        select b into prev from jsonb_array_elements(coalesce(op->'before', '[]'::jsonb)) b
         where b->>'scope' = r->>'scope' and b->>'discipline' = op->>'discipline' and b->>'category' = op->>'category'
           and b->>'eventKey' is distinct from op->>'eventKey'
         limit 1;
        if prev is not null and not exists (
             select 1 from jsonb_array_elements(book) x
              where x->>'scope' = prev->>'scope' and x->>'discipline' = op->>'discipline' and x->>'category' = op->>'category') then
          book := book || jsonb_build_array(prev);
        end if;
      end loop;

    else
      raise exception 'Unknown record change "%"', kind using errcode = '22023';
    end if;
  end loop;

  update tournaments
     set formats = jsonb_set(coalesce(fm, '{}'::jsonb), array[p_sport],
                             coalesce(fm->p_sport, '{}'::jsonb) || jsonb_build_object('records', book::text))
   where id = p_tid;
  return book;
end $$;
revoke all on function merge_field_records(uuid, text, jsonb, uuid) from public, anon;
grant execute on function merge_field_records(uuid, text, jsonb, uuid) to authenticated;


-- ---------- 2. Event hosts run their event -----------------------------------

-- May the caller add a round to an existing results event? They host one of
-- its phases in this tournament, and the new round names no new officials.
create or replace function can_extend_results_event(p_tid uuid, p_format jsonb, p_hosts uuid[])
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_format->'results'->>'eventKey', '') <> '' and exists (
    select 1 from field_events e
    where e.tournament_id = p_tid
      and e.format->'results'->>'eventKey' = p_format->'results'->>'eventKey'
      and e.host_ids && auth_player_ids()
      and coalesce(p_hosts, '{}') <@ e.host_ids
  );
$$;

drop policy if exists field_events_insert on field_events;
create policy field_events_insert on field_events for insert to authenticated
  with check (tournament_id is null or can_manage_tournament(tournament_id)
              or can_extend_results_event(tournament_id, format, host_ids));

-- 0028's guard + who may change an event's officials.
create or replace function guard_field_event()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if new.tournament_id is distinct from old.tournament_id and new.tournament_id is not null
     and not can_manage_tournament(new.tournament_id) then
    raise exception 'You can only move a round into a tournament you manage' using errcode = '42501';
  end if;
  if new.host_ids is distinct from old.host_ids
     and not (case when old.tournament_id is not null then can_manage_tournament(old.tournament_id)
                   else old.created_by = auth.uid() end) then
    raise exception 'Only the organisers can change who runs this event' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_field_event on field_events;
create trigger guard_field_event before update on field_events
  for each row execute function guard_field_event();


-- ---------- 3. meet_ages -------------------------------------------------------

-- The meet's age cut-off: formats[sport].ageOn = 'dec31' (default) | 'jan1' |
-- 'meet' | 'today' | 'YYYY-MM-DD'. Mirrors core/age.ts ageCutoff().
create or replace function meet_age_cutoff(p_tid uuid, p_sport text)
  returns date language sql stable security definer set search_path = public as $$
  select case
    -- a board's date must be the 1st or the last day of a month (31 Dec, 1 Jan,
    -- 1 Oct…), so repeated changes can't be used to narrow down a child's birthday
    when b ~ '^\d{4}-\d{2}-\d{2}$' and (extract(day from b::date) = 1 or (b::date + 1) = date_trunc('month', b::date + 1)::date) then b::date
    when b = 'jan1'  then make_date(extract(year from s)::int, 1, 1)
    when b = 'meet'  then s
    when b = 'today' then current_date
    else make_date(extract(year from s)::int, 12, 31)
  end
  from (select coalesce(t.formats->p_sport->>'ageOn', 'dec31') as b, coalesce(t.start_date, current_date) as s
          from tournaments t where t.id = p_tid) x;
$$;

create or replace function meet_ages(p_tid uuid, p_sport text, p_ids uuid[])
  returns table (id uuid, age int)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  cut date;
begin
  if not can_manage_tournament(p_tid) then
    raise exception 'Only the tournament’s organisers can check ages' using errcode = '42501';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 2000 then raise exception 'Too many players' using errcode = '54000'; end if;
  cut := meet_age_cutoff(p_tid, p_sport);
  return query
    select p.id, extract(year from age(cut, p.dob))::int
      from players p
     where p.id = any(p_ids) and p.dob is not null and p.dob <= cut;
end $$;
revoke all on function meet_ages(uuid, text, uuid[]) from public, anon;
grant execute on function meet_ages(uuid, text, uuid[]) to authenticated;
revoke all on function meet_age_cutoff(uuid, text) from public, anon;
grant execute on function meet_age_cutoff(uuid, text) to authenticated;
