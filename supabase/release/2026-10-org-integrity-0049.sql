-- Release: migration 0049 (organisation integrity — no planting teams/clubs in someone
-- else's organisation; only the invited person accepts an org invite).
-- Paste into the Supabase SQL editor and Run. Safe to re-run. Run AFTER 0048
-- (2026-10-org-staff-player-edit-0048.sql): this redefines 0048's org_member_by_choice.
--
-- Existing data is NOT changed. OPTIONAL read-only audit (run separately, before or
-- after): teams / clubs that sit in an organisation whose creator is not an active
-- member of that organisation — candidates for "planted" rows. Review by hand.
--
--   select 'team' as kind, t.id, t.name, t.sport, t.org_id, o.name as org_name,
--          t.club_id, t.created_by, pr.full_name as creator, t.created_at
--   from teams t
--   join organizations o on o.id = t.org_id
--   left join profiles pr on pr.id = t.created_by
--   where t.created_by is null
--      or not exists (select 1 from org_members m join players p on p.id = m.player_id
--                     where m.org_id = t.org_id and m.until is null
--                       and p.profile_id = t.created_by)
--   union all
--   select 'club', c.id, c.name, null, c.org_id, o.name, null, c.created_by,
--          pr.full_name, c.created_at
--   from clubs c
--   join organizations o on o.id = c.org_id
--   left join profiles pr on pr.id = c.created_by
--   where c.created_by is null
--      or not exists (select 1 from org_members m join players p on p.id = m.player_id
--                     where m.org_id = c.org_id and m.until is null
--                       and p.profile_id = c.created_by)
--   order by org_name, kind, name;
--
-- (created_by null = created before 0025 stamped creators; usually legitimate.)
begin;
-- 0049 — Organisation integrity: close two holes found while writing 0048.
--
-- A. Planting a team (or a club) inside someone else's organisation.
--    teams_insert (20261006120000_security_hardening.sql) allowed ANY org_id
--    whenever club_id was set ("org_id is null or club_id is not null or
--    has_org_role(…)"), so a stranger could create their own club, then a team
--    with club_id = their club and org_id = a school's org. The school's
--    Owners/Admins/Organizers then "managed" that stranger team through
--    can_manage_team. Also, clubs_update's WITH CHECK accepted
--    "can_manage_club(id)", so a club's creator could move their club into any
--    org (can_manage_club then hands that org's Owners/Admins the club).
--    Now:
--      • a new team's org_id must be null, OR the caller is an Owner / Admin /
--        Organizer of that org (unchanged rule for org teams), OR — club path —
--        org_id equals the club's OWN org_id and the caller may manage the club
--        (a club's per-sport row inherits the club's org: addClubSport).
--      • UPDATE of teams is unchanged (guard_team_write already demands
--        Owner/Admin/Organizer of the destination org) — stricter than insert.
--      • moving a CLUB into an org (clubs.org_id changes to a non-null value)
--        needs Owner/Admin/Organizer of that org — the same rule as clubs_insert.
--    Existing rows are NOT rewritten; the release bundle header has a read-only
--    audit query that lists teams / clubs whose creator isn't an active member
--    of the org they sit in.
--
-- B. An org admin "accepting" an invite on the invitee's behalf.
--    guard_org_request's admin branch returned NEW unchecked, so an Owner/Admin
--    could set an INVITE (direction 'invite') to 'accepted'. Now only the
--    invitee (the profile owning the invite's player) may move a pending invite
--    to 'accepted' or 'rejected'; admins still create, re-send (role/message)
--    and cancel invites, and still approve/reject/cancel JOIN REQUESTS exactly
--    as before. New column org_requests.accepted_by (a PROFILE id) is stamped
--    by the guard with auth.uid() when a row becomes 'accepted' and is never
--    client-settable (insert → null; otherwise kept / cleared by the guard).
--    org_member_by_choice (0048) now ALSO counts a member whose invite was
--    accepted by the invitee themselves (accepted_by = the invitee's profile).
--    Historic accepted invites (accepted_by null) still don't count.
--
-- App flows unchanged: invitee accepts/declines (respondToOrgRequest from
-- OrganizeScreen), admin approves/rejects a join request (OrganizationScreen),
-- admin cancels an invite, requester cancels their request, direct "+ Add
-- member" (an admin INSERT into org_members — allowed, but not "by choice"),
-- addClubSport (team org_id = club's org_id).
-- Idempotent — safe to re-run.

-- ---------- A. Teams / clubs inside an org --------------------------------------

-- May the caller put a NEW team into org p_org (optionally as a sport row of
-- club p_club)? Club authority itself is checked separately (teams_insert).
create or replace function can_place_team_in_org(p_org uuid, p_club uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_org is null
      or has_org_role(p_org, array['Owner','Admin','Organizer'])
      or ( p_club is not null
           and exists (select 1 from clubs c where c.id = p_club and c.org_id = p_org)
           and can_manage_club(p_club) );
$$;
revoke all on function can_place_team_in_org(uuid, uuid) from public, anon;
grant execute on function can_place_team_in_org(uuid, uuid) to authenticated;

drop policy if exists teams_insert on teams;
create policy teams_insert on teams for insert to authenticated
  with check (
    (club_id is null or can_manage_club(club_id))
    -- 0049: a club's sport row may only inherit the club's OWN org
    and can_place_team_in_org(org_id, club_id)
  );

-- Moving a club into an org needs authority over that org (as clubs_insert).
create or replace function guard_club_org()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if new.org_id is distinct from old.org_id and new.org_id is not null
     and not has_org_role(new.org_id, array['Owner','Admin','Organizer']) then
    raise exception 'You can''t move this team into that organization' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_club_org on clubs;
create trigger guard_club_org before update on clubs
  for each row execute function guard_club_org();


-- ---------- B. Only the invitee accepts an invite --------------------------------

alter table org_requests add column if not exists accepted_by uuid references profiles(id) on delete set null;

-- Latest body: 20261006120000_security_hardening.sql. Changes: accepted_by
-- stamping, and the admin branch may no longer accept/decline an INVITE unless
-- the admin is the invitee.
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
    new.accepted_by := null;   -- 0049: never client-settable
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
  -- 0049: accepted_by is stamped here — whoever moves the row to 'accepted'.
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.accepted_by := auth.uid();
  elsif new.status = 'accepted' then
    new.accepted_by := old.accepted_by;
  else
    new.accepted_by := null;
  end if;
  if is_admin then
    if new.role = 'Owner' and old.role <> 'Owner' and not is_owner then
      raise exception 'Only an owner can invite an owner' using errcode = '42501';
    end if;
    -- 0049: only the invited person answers an invite (an admin who IS the
    -- invitee — e.g. an Admin invited to become Owner — answers it as themselves).
    if old.direction = 'invite' and new.status is distinct from old.status
       and new.status in ('accepted', 'rejected')
       and not (is_self and old.status = 'pending') then
      raise exception 'Only the invited person can accept or decline an invite' using errcode = '42501';
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

-- Latest body: 20261019122600_org_staff_player_edit.sql (0048). Change: an
-- invite the invitee accepted THEMSELVES (accepted_by = their profile) counts.
create or replace function org_member_by_choice(p_org uuid, p_profile uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_org is not null and p_profile is not null and exists (
    select 1 from org_members m
    join players pl on pl.id = m.player_id
    where m.org_id = p_org and m.until is null and pl.profile_id = p_profile
      and ( exists (select 1 from organizations o where o.id = p_org and o.created_by = p_profile)
         or exists (select 1 from org_requests q
                    where q.org_id = p_org and q.player_id = m.player_id
                      and q.direction = 'request' and q.status = 'accepted')
         -- 0049: an invite the invitee accepted themselves
         or exists (select 1 from org_requests q
                    where q.org_id = p_org and q.player_id = m.player_id
                      and q.direction = 'invite' and q.status = 'accepted'
                      and q.accepted_by = pl.profile_id) )
  );
$$;
revoke all on function org_member_by_choice(uuid, uuid) from public, anon, authenticated;
commit;
