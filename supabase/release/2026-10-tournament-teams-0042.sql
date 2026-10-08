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
