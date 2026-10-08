-- 0039 — One active scorer at a time (CricHeroes parity #03).
--
-- scorer_ids stays the ALLOWED list; the lock names the one ACTIVE scorer
-- (player + device). Only the holder appends / undoes events, and the server
-- assigns `seq` (client_id makes retries idempotent), so two phones can no
-- longer overwrite each other's taps. The lock only matters while a match is
-- being played (scheduled/live): finishing, cancelling or resetting clears it,
-- and afterwards match managers can still write (post-match corrections).
alter table matches add column if not exists active_scorer_id uuid references players(id) on delete set null;
alter table matches add column if not exists active_scorer_device text;
alter table matches add column if not exists active_scorer_at timestamptz;
alter table match_events add column if not exists client_id uuid;
create unique index if not exists match_events_client_uidx on match_events(match_id, client_id) where client_id is not null;

-- Is the lock in force for this match row?
create or replace function scoring_lock_enforced(p_status text, p_holder uuid)
  returns boolean language sql immutable as $$
  select p_holder is not null and coalesce(p_status, 'scheduled') in ('scheduled', 'live');
$$;

-- Does the caller hold this match's lock (this device, or any device if unbound)?
create or replace function holds_scoring_lock(p_holder uuid, p_holder_device text, p_device text)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_holder = any(auth_player_ids()) and (p_holder_device is null or p_holder_device = p_device);
$$;

-- The caller's player id for this match: one already allowed to score, else their first.
create or replace function my_scoring_player(p_match uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select x from matches m, unnest(coalesce(m.scorer_ids, '{}'::uuid[]) || array[m.scorer_id]) x
      where m.id = p_match and x = any(auth_player_ids()) limit 1),
    (auth_player_ids())[1]);
$$;

create or replace function claim_scoring(p_match uuid, p_device text, p_takeover boolean default false)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  me uuid;
begin
  if not can_manage_match(p_match) then raise exception 'not_allowed' using errcode = '42501'; end if;
  me := my_scoring_player(p_match);
  if me is null then raise exception 'no_player' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
  if m.active_scorer_id is null
     or not scoring_lock_enforced(m.status, m.active_scorer_id)
     or (m.active_scorer_id = me and (m.active_scorer_device is null or m.active_scorer_device = p_device))
     or p_takeover then
    update matches set active_scorer_id = me, active_scorer_device = p_device, active_scorer_at = now(),
      scorer_ids = case when me = any(coalesce(scorer_ids, '{}')) then scorer_ids else coalesce(scorer_ids, '{}') || me end
      where id = p_match;
    return jsonb_build_object('ok', true, 'holder_id', me);
  end if;
  return jsonb_build_object('ok', false, 'holder_id', m.active_scorer_id,
    'holder_name', (select full_name from players where id = m.active_scorer_id), 'at', m.active_scorer_at);
end $$;

create or replace function handover_scoring(p_match uuid, p_to uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  old_name text;
begin
  if not can_manage_match(p_match) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
  old_name := (select full_name from players where id = m.active_scorer_id);
  update matches set active_scorer_id = p_to, active_scorer_device = null, active_scorer_at = now(),
    scorer_ids = case when p_to = any(coalesce(scorer_ids, '{}')) then scorer_ids else coalesce(scorer_ids, '{}') || p_to end
    where id = p_match;
  if m.tournament_id is not null then
    insert into activity_log (scope, ref_id, action, detail, by_player_id, by_name)
    values ('tournament', m.tournament_id, 'scoring.handover',
      coalesce(old_name, 'nobody') || ' → ' || coalesce((select full_name from players where id = p_to), 'someone'),
      my_scoring_player(p_match), (select full_name from players where id = my_scoring_player(p_match)));
  end if;
end $$;

create or replace function release_scoring(p_match uuid, p_device text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update matches set active_scorer_id = null, active_scorer_device = null, active_scorer_at = null
    where id = p_match and holds_scoring_lock(active_scorer_id, active_scorer_device, p_device);
end $$;

-- Append one scoring event. Allowed for match managers who hold the lock (or
-- when nobody does — then they take it). Returns the server-assigned seq; a
-- retried client_id returns its existing seq instead of duplicating.
create or replace function append_match_event(p_match uuid, p_device text, p_client_id uuid, p_type text,
                                              p_side text, p_payload jsonb, p_attribution jsonb)
  returns int language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  s int;
begin
  if not can_manage_match(p_match) then raise exception 'not_active_scorer' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
  if p_client_id is not null then
    select seq into s from match_events where match_id = p_match and client_id = p_client_id;
    if s is not null then return s; end if;
  end if;
  if scoring_lock_enforced(m.status, m.active_scorer_id) then
    if not holds_scoring_lock(m.active_scorer_id, m.active_scorer_device, p_device) then
      raise exception 'not_active_scorer' using errcode = '42501';
    end if;
    update matches set active_scorer_device = coalesce(active_scorer_device, p_device), active_scorer_at = now() where id = p_match;
  elsif coalesce(m.status, 'scheduled') in ('scheduled', 'live') then
    update matches set active_scorer_id = my_scoring_player(p_match), active_scorer_device = p_device, active_scorer_at = now() where id = p_match;
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  select coalesce(max(seq), 0) + 1 into s from match_events where match_id = p_match;
  insert into match_events (match_id, seq, type, side, payload, attribution, created_by, client_id)
  values (p_match, s, p_type, p_side, coalesce(p_payload, '{}'::jsonb), p_attribution, auth.uid(), p_client_id);
  perform set_config('app.trusted_rpc', 'off', true);
  return s;
end $$;

-- Undo: atomically remove and return the newest event (holder only while live).
create or replace function pop_match_event(p_match uuid, p_device text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m matches%rowtype;
  r match_events%rowtype;
begin
  if not can_manage_match(p_match) then raise exception 'not_active_scorer' using errcode = '42501'; end if;
  select * into m from matches where id = p_match for update;
  if scoring_lock_enforced(m.status, m.active_scorer_id)
     and not holds_scoring_lock(m.active_scorer_id, m.active_scorer_device, p_device) then
    raise exception 'not_active_scorer' using errcode = '42501';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  delete from match_events where id = (select id from match_events where match_id = p_match order by seq desc limit 1)
    returning * into r;
  perform set_config('app.trusted_rpc', 'off', true);
  if r.id is null then return null; end if;
  return jsonb_build_object('seq', r.seq, 'type', r.type, 'side', r.side, 'payload', r.payload,
                            'attribution', r.attribution, 'client_id', r.client_id);
end $$;

-- Direct client writes can't bypass the lock while a match is being played.
create or replace function guard_match_event_write()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  mid uuid := coalesce(new.match_id, old.match_id);
  m matches%rowtype;
begin
  if not is_client_request() then return coalesce(new, old); end if;
  select * into m from matches where id = mid;
  if scoring_lock_enforced(m.status, m.active_scorer_id)
     and not (m.active_scorer_id = any(auth_player_ids())) then
    raise exception 'not_active_scorer' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guard_match_event_write on match_events;
create trigger guard_match_event_write before insert or delete on match_events
  for each row execute function guard_match_event_write();

-- The lock ends with the game (finished / cancelled / postponed / reset to
-- not-started) and when its holder is taken off the scorer list.
create or replace function clear_scoring_lock()
  returns trigger language plpgsql as $$
begin
  if new.active_scorer_id is not null and (
       new.status in ('completed', 'cancelled', 'postponed')
    or (old.status = 'live' and new.status = 'scheduled')
    or (new.state = '{}'::jsonb and old.state is distinct from new.state)   -- resetMatch
    or (new.scorer_ids is distinct from old.scorer_ids
        and not coalesce(new.active_scorer_id = any(coalesce(new.scorer_ids, '{}')) or new.active_scorer_id = new.scorer_id, false))
  ) then
    new.active_scorer_id := null; new.active_scorer_device := null; new.active_scorer_at := null;
  end if;
  return new;
end $$;
drop trigger if exists clear_scoring_lock on matches;
create trigger clear_scoring_lock before update on matches
  for each row execute function clear_scoring_lock();

revoke all on function claim_scoring(uuid, text, boolean), handover_scoring(uuid, uuid), release_scoring(uuid, text),
  append_match_event(uuid, text, uuid, text, text, jsonb, jsonb), pop_match_event(uuid, text),
  my_scoring_player(uuid), holds_scoring_lock(uuid, text, text) from public, anon;
grant execute on function claim_scoring(uuid, text, boolean), handover_scoring(uuid, uuid), release_scoring(uuid, text),
  append_match_event(uuid, text, uuid, text, text, jsonb, jsonb), pop_match_event(uuid, text),
  my_scoring_player(uuid), holds_scoring_lock(uuid, text, text) to authenticated;
