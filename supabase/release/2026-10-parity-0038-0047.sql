-- Release: CricHeroes-parity migrations 0038–0047 in one paste (same SQL as the ten single files).
-- Paste into the Supabase SQL editor and Run. Each block is its own transaction and safe to re-run;
-- if one fails, fix it and re-run this whole file (earlier blocks are idempotent).

-- ════════════════════ 2026-10-media-storage-0038.sql ════════════════════
-- Release: migration 0038 (real image uploads — CricHeroes parity #01).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0038 — Real image uploads (CricHeroes parity #01).
--
-- Logos, banners and player photos used to be saved as device-local URIs
-- (file:// / blob:), so only the uploader's device could show them. They now go
-- to a public `media` bucket under the uploader's uid folder; the app stores the
-- public URL. Who may ATTACH an image is still decided by the table RLS on the
-- row update (tournaments/matches/clubs/organizations/players).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media insert own" on storage.objects;
create policy "media insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media delete own" on storage.objects;
create policy "media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

alter table tournaments add column if not exists banner_url text;
commit;

-- ════════════════════ 2026-10-scoring-lock-0039.sql ════════════════════
-- Release: migration 0039 (one active scorer — CricHeroes parity #03).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
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
commit;

-- ════════════════════ 2026-10-match-result-0040.sql ════════════════════
-- Release: migration 0040 (manual match results — CricHeroes parity #04).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0040 — Manual match results (CricHeroes parity #04).
--
-- A match closed by hand — abandoned, no result, draw/tie, conceded, awarded —
-- keeps HOW it ended and WHY. Status stays 'completed'; the kind lives here.
-- This is the only result store (never matches.format). Updates are already
-- covered by the "manage match" policy.
alter table matches add column if not exists result jsonb;
comment on column matches.result is 'Manual result {kind,winner,reason,countNrr,score,byId,byName,at}';
commit;

-- ════════════════════ 2026-10-tournament-profile-0041.sql ════════════════════
-- Release: migration 0041 (tournament details + soft delete — CricHeroes parity #09).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0041 — Tournament profile details + soft delete (CricHeroes parity #09).
--
-- What teams and parents ask the organiser — where (city, grounds), what kind of
-- event, who to call, the rules — now lives on the tournament instead of a
-- WhatsApp poster. Deleting a tournament is SOFT (deleted_at): stats survive and
-- it can be restored by SQL. The existing "manage tourneys" update policy covers
-- every column here (a soft delete is an update). banner_url comes from 0038.
alter table tournaments add column if not exists city text;
alter table tournaments add column if not exists grounds text[] not null default '{}';
alter table tournaments add column if not exists event_category text;   -- school|college|university|corporate|community|open|other
alter table tournaments add column if not exists about text;            -- ≤ 4000 chars (client-enforced)
alter table tournaments add column if not exists organiser_phone text;
alter table tournaments add column if not exists organiser_email text;
alter table tournaments add column if not exists deleted_at timestamptz;
commit;

-- ════════════════════ 2026-10-tournament-teams-0042.sql ════════════════════
-- Release: migration 0042 (teams in a tournament — logo/city/admins, join link — CricHeroes parity #10).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0042 — Teams in a tournament (CricHeroes parity #10).
--
-- 1. Teams get a logo, a city and team ADMINS (player ids, so an unclaimed
--    player can be made admin and gains the rights once they sign in). An admin
--    manages the team exactly like the captain / vice-captain.
-- 2. can_manage_team / guard_team_write are redefined from their latest bodies
--    (20261006120000_security_hardening.sql) — the only change is admin_ids in
--    the rule, and logo_url / city / admin_ids in the protected tuple (a match
--    scorer may edit the roster, never the team's identity or its admins).
--    The organiser is still deliberately NOT a team manager.
-- 3. One join link per tournament (tournament_invites). While it's ON, a team's
--    manager can enter their team with redeem_tournament_invite(); the entry is
--    confirmed at once (CricHeroes CURRENT). The organiser's controls are the
--    on/off switch, max_teams and registration_deadline.
-- Idempotent — safe to re-run.

alter table teams add column if not exists logo_url text;
alter table teams add column if not exists city text;
alter table teams add column if not exists admin_ids uuid[] not null default '{}';

-- Per-sport team managers: the creator, captain / vice-captain, a team admin,
-- claimed staff (team_staff), an admin of its club, or an Owner/Admin/Organizer
-- of its org. (Deliberately NOT "any organizer whose tournament it entered".)
create or replace function can_manage_team(p_team uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from teams t
      where t.id = p_team
        and ( t.created_by = auth.uid()
           or t.captain_id = any(auth_player_ids())
           or t.vice_captain_id = any(auth_player_ids())
           or t.admin_ids && auth_player_ids()
           or (t.club_id is not null and can_manage_club(t.club_id))
           or (t.org_id is not null and has_org_role(t.org_id, array['Owner','Admin','Organizer'])) )
    )
    or exists (select 1 from team_staff s where s.team_id = p_team and s.profile_id = auth.uid());
$$;

create or replace function guard_team_write()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or tg_op <> 'UPDATE' then return new; end if;
  if not can_manage_team(old.id) then
    -- A match scorer/host: roster edits only, plus filling an EMPTY captain /
    -- vice-captain slot ("first player on a captain-less team becomes captain").
    if (new.name, new.short_name, new.sport, new.color_hex, new.school_id, new.org_id, new.club_id, new.adhoc,
        new.logo_url, new.city, new.admin_ids)
       is distinct from (old.name, old.short_name, old.sport, old.color_hex, old.school_id, old.org_id, old.club_id, old.adhoc,
        old.logo_url, old.city, old.admin_ids)
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

-- ---------- Tournament join link ---------------------------------------------
create table if not exists tournament_invites (
  token         text primary key,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  active        boolean not null default true,
  created_by    uuid default auth.uid(),
  created_at    timestamptz default now()
);
create unique index if not exists tournament_invites_live on tournament_invites(tournament_id) where active;

alter table tournament_invites enable row level security;
drop policy if exists tournament_invites_manage on tournament_invites;
create policy tournament_invites_manage on tournament_invites for all to authenticated
  using (can_manage_tournament(tournament_id)) with check (can_manage_tournament(tournament_id));
revoke all on tournament_invites from anon;

-- 'T-' + 6 chars from the unambiguous 32-char alphabet (no 0/O/1/I).
create or replace function new_tournament_invite_token()
  returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5];
  tok text := 'T-';
  i int;
begin
  foreach i in array idx loop
    tok := tok || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return tok;
end $$;

-- ON: returns the live token (reuses it if one is already live, else mints).
-- OFF: deactivates the live token and returns null. Managers only.
create or replace function tournament_invite(p_tid uuid, p_on boolean)
  returns text language plpgsql volatile security definer set search_path = public as $$
declare tok text; tries int := 0;
begin
  if auth.uid() is null or not can_manage_tournament(p_tid) then
    raise exception 'Only the organiser can change the join link' using errcode = '42501';
  end if;
  if not coalesce(p_on, false) then
    update tournament_invites set active = false where tournament_id = p_tid and active;
    return null;
  end if;
  select i.token into tok from tournament_invites i where i.tournament_id = p_tid and i.active;
  if tok is not null then return tok; end if;
  loop
    tok := new_tournament_invite_token();
    begin
      insert into tournament_invites (token, tournament_id, active, created_by)
        values (tok, p_tid, true, auth.uid());
      return tok;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
end $$;

-- Resolve a code. Returns no row for an unknown code; `active` = false for a
-- link that has been turned off ("This link is turned off").
create or replace function get_tournament_invite(p_token text)
  returns table (tournament_id uuid, name text, sports text[], active boolean)
  language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in to use an invite code' using errcode = '42501'; end if;
  if not rate_limit_hit('invite-lookup', auth.uid()::text, 30, 3600) then
    raise exception 'Too many invite attempts — try again in an hour' using errcode = '54000';
  end if;
  return query
    select t.id, t.name, t.sports, i.active
    from tournament_invites i join tournaments t on t.id = i.tournament_id
    where i.token = upper(trim(p_token)) and t.deleted_at is null;
end $$;

-- Enter a team you manage through the tournament's live link. Confirmed at once.
-- Returns 'joined' (new / upgraded entry) or 'already' (it was already in).
create or replace function redeem_tournament_invite(p_token text, p_team uuid, p_category uuid default null)
  returns text language plpgsql volatile security definer set search_path = public as $$
declare
  inv tournament_invites;
  tr tournaments;
  tm teams;
  cur text;
  n int;
begin
  if auth.uid() is null then raise exception 'Sign in to use an invite code' using errcode = '42501'; end if;
  if not rate_limit_hit('invite-lookup', auth.uid()::text, 30, 3600) then
    raise exception 'Too many invite attempts — try again in an hour' using errcode = '54000';
  end if;
  select * into inv from tournament_invites i where i.token = upper(trim(p_token));
  if inv.token is null then raise exception 'This invite code isn''t valid' using errcode = 'P0002'; end if;
  if not inv.active then raise exception 'This link is turned off' using errcode = 'P0001'; end if;
  select * into tr from tournaments t where t.id = inv.tournament_id and t.deleted_at is null;
  if tr.id is null then raise exception 'This invite code isn''t valid' using errcode = 'P0002'; end if;
  select * into tm from teams t where t.id = p_team;
  if tm.id is null or not can_manage_team(p_team) then
    raise exception 'You can only enter a team you manage' using errcode = '42501';
  end if;
  if coalesce(array_length(tr.sports, 1), 0) > 0 and not (tm.sport = any(tr.sports)) then
    raise exception 'This team''s sport isn''t played in this tournament' using errcode = 'P0001';
  end if;
  if p_category is not null and not exists (
       select 1 from tournament_categories c where c.id = p_category and c.tournament_id = tr.id) then
    raise exception 'Pick a division of this tournament' using errcode = 'P0001';
  end if;

  select tt.status into cur from tournament_teams tt where tt.tournament_id = tr.id and tt.team_id = p_team;
  if cur = 'confirmed' then return 'already'; end if;
  if cur = 'withdrawn' then
    raise exception 'This team was withdrawn — ask the organiser to add it back' using errcode = 'P0001';
  end if;
  -- invited = a held slot (already counted); pending / new take a new slot.
  if cur is distinct from 'invited' then
    if tr.registration_deadline is not null and now() > tr.registration_deadline then
      raise exception 'Registration has closed — the deadline has passed.' using errcode = 'P0001';
    end if;
    if coalesce(tr.max_teams, 0) > 0 then
      select count(*) into n from tournament_teams tt
        where tt.tournament_id = tr.id and tt.status in ('confirmed', 'invited');
      if n >= tr.max_teams then raise exception 'This tournament is full.' using errcode = 'P0001'; end if;
    end if;
  end if;

  if cur is null then
    insert into tournament_teams (tournament_id, team_id, status, category_id)
      values (tr.id, p_team, 'confirmed', p_category)
      on conflict do nothing;
  else
    -- pending request / open invite → confirmed (the trigger is bypassed for a trusted RPC)
    perform set_config('app.trusted_rpc', 'on', true);
    update tournament_teams set status = 'confirmed', category_id = coalesce(p_category, category_id)
      where tournament_id = tr.id and team_id = p_team;
    perform set_config('app.trusted_rpc', 'off', true);
  end if;
  return 'joined';
end $$;

revoke all on function new_tournament_invite_token() from public, anon, authenticated;
revoke all on function tournament_invite(uuid, boolean), get_tournament_invite(text),
                       redeem_tournament_invite(text, uuid, uuid)
  from public, anon;
grant execute on function tournament_invite(uuid, boolean), get_tournament_invite(text),
                          redeem_tournament_invite(text, uuid, uuid)
  to authenticated;
commit;

-- ════════════════════ 2026-10-match-officials-0043.sql ════════════════════
-- Release: migration 0043 (match officials + tournament scorers self-join — CricHeroes parity #11).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0043 — Scorers and officials (CricHeroes parity #11).
--
-- 1. matches.officials: the per-match officials (umpires, referees,
--    commentator …) as a jsonb array of {slot, playerId?, name}. Kept in its
--    OWN column — never in matches.format, so a match keeps inheriting the
--    tournament's format (REVIEW Decision 3). Scorers and hosts write it
--    through the existing "manage match" update policy.
-- 2. join_match_as_scorer(p_match): a tournament's scorer (tournament_officials
--    role = 'scorer') adds themself to scorer_ids of one of that tournament's
--    scheduled / live matches ("my phone died — a colleague continues").
--    Tournament scorers get NO blanket write access: scorer_ids stays the
--    single source of "who's scoring" for reminders and the #03 lock.
-- Idempotent — safe to re-run.

alter table matches add column if not exists officials jsonb not null default '[]'::jsonb;

create or replace function join_match_as_scorer(p_match uuid)
  returns uuid language plpgsql volatile security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then
    raise exception 'Only this tournament''s scorers can do that' using errcode = '42501';
  end if;
  select o.player_id into pid
    from matches m
    join tournament_officials o on o.tournament_id = m.tournament_id and o.role = 'scorer'
    where m.id = p_match
      and m.status in ('scheduled', 'live')
      and o.player_id = any(auth_player_ids())
    limit 1;
  if pid is null then
    raise exception 'Only this tournament''s scorers can do that' using errcode = '42501';
  end if;
  update matches
     set scorer_ids = case when pid = any(scorer_ids) then scorer_ids else coalesce(scorer_ids, '{}') || pid end,
         scorer_id = coalesce(scorer_id, pid)
   where id = p_match;
  return pid;
end $$;

revoke all on function join_match_as_scorer(uuid) from public, anon;
grant execute on function join_match_as_scorer(uuid) to authenticated;
commit;

-- ════════════════════ 2026-10-admin-edit-player-0044.sql ════════════════════
-- Release: migration 0044 (admin edits unclaimed player details — CricHeroes parity #12).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0044 — Admin edits player details (CricHeroes parity #12).
--
-- A co-organiser or captain can fix the name, shirt number, photo, city, DOB,
-- sides etc. of an UNCLAIMED player on a team they run — not only the person
-- who typed it in. Claimed players stay owner-only; reported ("not me") rows
-- are excluded so a disputed identity can't be reassigned.
--
-- 1. can_admin_player(p_player): unclaimed, unreported, and
--    Every arm also requires the team / club to have been created by the
--    player's creator: rosters are writable by their managers (and match
--    scorers), so roster membership alone would let anyone build a team
--    around any unclaimed player id and edit it.
--    • on the explicit roster of a team the caller manages (can_manage_team), or
--    • a house-derived team (no roster) the caller manages, whose name matches
--      the player's house AND that was created by the player's creator
--      (otherwise anyone could create "Red House" and edit every Red House
--      player), or
--    • a member of a club the caller manages, or
--    • on a team of a tournament the caller manages — only teams owned by the
--      tournament's host org or created by the organiser / a host, never a
--      team merely entered (organisers may insert 'confirmed' entries).
-- 2. can_edit_player: latest body (20261006120000_security_hardening.sql) +
--    can_admin_player.
-- 3. guard_player_write: latest body (same file); the UPDATE refusal now lets
--    can_admin_player through. When the caller is not the creator (an admin),
--    identity and privacy stay as they were: a set phone / email, house_name,
--    show_phone, show_email, findable_by_contact and verification.
-- RLS needs no change: "players update scoped" (0010) already admits unclaimed
-- rows; the trigger is the gate.
-- Idempotent — safe to re-run.

create or replace function can_admin_player(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from players p
    where p.id = p_player and p.profile_id is null and p.reported_at is null and (
         exists (select 1 from teams t where t.roster ? p.id::text
                 and t.created_by = p.created_by and can_manage_team(t.id))
      or exists (select 1 from teams t
                 where (t.roster is null or t.roster = '[]'::jsonb)
                   and p.house_name is not null and t.name = p.house_name
                   and t.created_by = p.created_by and can_manage_team(t.id))
      or exists (select 1 from club_members cm join clubs c on c.id = cm.club_id
                 where cm.player_id = p.id and c.created_by = p.created_by and can_manage_club(cm.club_id))
      or exists (select 1 from tournament_teams tt
                 join teams t on t.id = tt.team_id
                 join tournaments tour on tour.id = tt.tournament_id
                 where t.created_by = p.created_by
                   and ( t.roster ? p.id::text
                      or ( (t.roster is null or t.roster = '[]'::jsonb)
                           and p.house_name is not null and t.name = p.house_name ) )
                   and can_manage_tournament(tt.tournament_id)
                   and ( (tour.host_org_id is not null and t.org_id = tour.host_org_id)
                      or t.created_by = tour.organizer_id
                      or t.created_by in (select h.profile_id from players h
                                          where h.id = any(tour.host_ids) and h.profile_id is not null) ))
    )
  );
$$;
revoke all on function can_admin_player(uuid) from public, anon;
grant execute on function can_admin_player(uuid) to authenticated;

-- May the caller edit this player's own data (sport profile etc.)? The claimed
-- owner, the creator of a still-unclaimed provisional player, an admin of an
-- unclaimed player (can_admin_player), or support.
create or replace function can_edit_player(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select is_support() or exists (
    select 1 from players p
    where p.id = p_player
      and ( p.profile_id = auth.uid()
         or (p.profile_id is null and p.created_by = auth.uid()) )
  ) or can_admin_player(p_player);
$$;

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
    -- Parity #12: a manager of a team / club / tournament this unclaimed player
    -- is on may edit it too — but never its identity or privacy choices.
    if not can_admin_player(old.id) then
      raise exception 'Only the person who added this player can edit it' using errcode = '42501';
    end if;
    new.profile_id := old.profile_id;
    if old.phone is not null then new.phone := old.phone; end if;
    if old.email is not null then new.email := old.email; end if;
    new.house_name := old.house_name;
    new.show_phone := old.show_phone;
    new.show_email := old.show_email;
    new.findable_by_contact := old.findable_by_contact;
    new.verification := old.verification;
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
commit;

-- ════════════════════ 2026-10-match-delete-played-0045.sql ════════════════════
-- Release: migration 0045 (delete a live / just-played friendly — CricHeroes parity #13).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0045 — Delete a played match (CricHeroes parity #13).
--
-- Replaces the pre-match-only "delete match" policy (20260827120000):
--   1. Pre-match (scheduled / postponed / cancelled): any match manager
--      (can_manage_match) — unchanged.
--   2. Live, or completed less than 30 minutes ago (last scoring event, else
--      updated_at): the match's HOSTS only, never a mere scorer — and only for
--      friendlies. A played tournament fixture is reset in the app instead, so
--      the fixture list / bracket never gets a hole.
-- matches has no created_by column, so "the creator" is covered by host_ids
-- (createMatch adds the creator's player id to host_ids).
-- Child rows go by ON DELETE CASCADE, as before.
-- Idempotent — safe to re-run.

drop policy if exists "delete match" on matches;
create policy "delete match" on matches for delete using (
  (can_manage_match(id) and status in ('scheduled', 'postponed', 'cancelled'))
  or (host_ids && auth_player_ids()
      and tournament_id is null
      and (
        status = 'live'
        or (status = 'completed' and coalesce(
              (select max(e.created_at) from match_events e where e.match_id = matches.id),
              updated_at) > now() - interval '30 minutes')))
);
commit;

-- ════════════════════ 2026-10-awards-potm-0046.sql ════════════════════
-- Release: migration 0046 (tournament awards + change Player of the Match once — CricHeroes parity #21).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0046 — Tournament awards + change Player of the Match once (CricHeroes parity #21).
--
-- 1. tournaments.awards jsonb — {publishedAt?, items:[{id,slot,label,sport,
--    playerId,playerName,teamName?,value?,detail?}]}. One column holds the draft
--    and the published set together; the app hides a draft from non-hosts.
--    Written through the existing "manage tourneys" update policy (hosts /
--    hosting-org organisers); guard_tournament_write leaves it alone.
-- 2. matches.potm jsonb — the official Player of the Match override:
--    {playerId,name,auto:{playerId,name},by,at}. Written through the existing
--    "manage match" update policy (the match's hosts and scorers, and the
--    tournament's hosts). "Only once" is enforced by the app via potm.by — no
--    DB trigger at pilot scale (REVIEW 05/21).
-- Both are read in their own selects, so the app degrades without them.
-- Idempotent — safe to re-run.

alter table tournaments add column if not exists awards jsonb;
alter table matches     add column if not exists potm   jsonb;

comment on column tournaments.awards is 'Tournament awards {publishedAt?, items:[{id,slot,label,sport,playerId,playerName,teamName?,value?,detail?}]} (parity #21)';
comment on column matches.potm is 'Player of the Match override {playerId,name,auto:{playerId,name},by,at} — changeable once (parity #21)';
commit;

-- ════════════════════ 2026-10-follow-prefs-0047.sql ════════════════════
-- Release: migration 0047 (alert choices per follow + match start/result alerts — CricHeroes parity #23).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
-- After running: store the Vault secrets named in the header below (notify_followers_url,
-- webhook_secret, optionally functions_anon_key) and deploy notify-followers + notify-upcoming.
begin;
-- 0047 — Alert choices per follow + match start/result alerts (CricHeroes parity #23).
--
-- 1. follows.prefs jsonb — only the OFF switches, e.g. {"scores":false}; null
--    means every alert is on, so existing rows need no backfill. Keys:
--    reminder | start | result | scores (| award, reserved for #21's fan-out).
--    Written through the existing "manage own follows" policy (for all, own
--    rows only). An unfollow deletes the row, so a re-follow starts all-on.
-- 2. match_status_notify — an AFTER UPDATE OF status trigger that fires only when
--    matches.status actually changes and posts {type:'match_status', record,
--    old_record:{status}} to the notify-followers edge function via pg_net.
--    A plain `matches` UPDATE webhook would fire on every scored ball (each ball
--    rewrites matches.state), so this is deliberately NOT a webhook.
--    The URL and secret come from Vault (same mechanism as the reminders cron):
--      notify_followers_url  e.g. https://<ref>.supabase.co/functions/v1/notify-followers
--      webhook_secret        the same value as the function's WEBHOOK_SECRET
--      functions_anon_key    optional — the public anon key, sent as the
--                            Bearer to pass the functions gateway's JWT check
--    If the URL or the secret is unset (or Vault/pg_net is unavailable) the
--    trigger returns without posting; it can never block a status change.
-- Idempotent — safe to re-run.

alter table follows add column if not exists prefs jsonb;
comment on column follows.prefs is 'Alert choices — only OFF switches, e.g. {"scores":false}; null = all on (parity #23)';

create extension if not exists pg_net;

create or replace function notify_match_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
  v_anon   text;
  v_headers jsonb;
begin
  begin
    select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_followers_url' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret'       limit 1;
    select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'functions_anon_key'   limit 1;
  exception when others then
    return new;  -- no Vault → not configured
  end;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret);
  if coalesce(v_anon, '') <> '' then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_anon);
  end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := v_headers,
      -- state is the sport's whole live snapshot; the function doesn't need it.
      body    := jsonb_build_object(
        'type', 'match_status',
        'record', to_jsonb(new) - 'state',
        'old_record', jsonb_build_object('status', old.status)));
  exception when others then
    null;  -- an alert must never fail the scorer's status write
  end;
  return new;
end $$;

revoke all on function notify_match_status() from public, anon, authenticated;

drop trigger if exists match_status_notify on matches;
create trigger match_status_notify after update of status on matches
  for each row when (old.status is distinct from new.status)
  execute function notify_match_status();
commit;
