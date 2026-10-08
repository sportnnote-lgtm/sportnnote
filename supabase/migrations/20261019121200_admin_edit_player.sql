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
