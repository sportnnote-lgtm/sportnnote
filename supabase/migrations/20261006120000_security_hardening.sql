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
     and (new.dob is distinct from old.dob or new.guardian is distinct from old.guardian)
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
