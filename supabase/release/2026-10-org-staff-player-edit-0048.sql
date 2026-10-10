-- Release: migration 0048 (school staff fix each other's unclaimed players — CricHeroes parity #12 follow-up).
-- Paste into the Supabase SQL editor and Run. Safe to re-run. Needs 0044 (admin edits player) first.
begin;
-- 0048 — School staff fix each other's players (CricHeroes parity #12 follow-up).
--
-- Founder decision: staff of the same school can fix an unclaimed player's
-- details even when a colleague added the player and a third colleague built
-- the team. Example: Ms Rao built "Red House" in the school's organisation,
-- Mr Iyer typed in the students, Mr Khan is an Admin of the organisation —
-- Mr Khan may now fix a misspelt name (before: only Mr Iyer could).
--
-- can_admin_player(p_player) keeps every arm of 0044 unchanged and gains one:
-- the caller may also edit an UNCLAIMED, UNREPORTED player P when there is an
-- organisation O such that
--   • P is on a team T with T.org_id = O — on T's roster, or (house-derived
--     team, no roster) T's name is P's house_name;
--   • the caller is an active Owner or Admin of O (has_org_role);
--   • T's creator is an active member of O (any role) — teams.org_id can be
--     set without org authority through the club path of teams_insert
--     ("org_id is null or club_id is not null or has_org_role(…)"), so a
--     stranger could otherwise create "Fake XI" inside the school's org;
--   • P's creator is an active member of O who joined BY CHOICE: they created
--     O, or their own join request to O was accepted. Owners/Admins can add
--     anyone as a member directly (guard_org_member allows an admin INSERT
--     without the person's consent), so plain membership would let anyone
--     create an org, add another school's coach to it and edit that coach's
--     players. Invites are not counted: an admin can mark an invite 'accepted'
--     themselves (guard_org_request's admin branch), so it proves nothing.
-- Membership = an org_members row (player_id → players.profile_id) with
-- until IS NULL; pending invites / join requests live in org_requests and
-- create no org_members row, so they never count.
--
-- guard_player_write is unchanged: its non-creator branch calls
-- can_admin_player and keeps identity and privacy locked (set phone / email,
-- house_name, show_phone, show_email, findable_by_contact, verification), so
-- org staff get the same locks as other admins. can_edit_player is unchanged
-- (it calls can_admin_player).
-- Idempotent — safe to re-run.

-- Did this person (a PROFILE id) join the org of their own accord, and are they
-- still an active member? Internal helper for can_admin_player.
create or replace function org_member_by_choice(p_org uuid, p_profile uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select p_org is not null and p_profile is not null and exists (
    select 1 from org_members m
    join players pl on pl.id = m.player_id
    where m.org_id = p_org and m.until is null and pl.profile_id = p_profile
      and ( exists (select 1 from organizations o where o.id = p_org and o.created_by = p_profile)
         or exists (select 1 from org_requests q
                    where q.org_id = p_org and q.player_id = m.player_id
                      and q.direction = 'request' and q.status = 'accepted') )
  );
$$;
revoke all on function org_member_by_choice(uuid, uuid) from public, anon, authenticated;

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
      -- 0048: Owner/Admin of the organisation the team belongs to, for players
      -- added by a colleague who joined that organisation by choice.
      or exists (select 1 from teams t
                 where t.org_id is not null
                   and ( t.roster ? p.id::text
                      or ( (t.roster is null or t.roster = '[]'::jsonb)
                           and p.house_name is not null and t.name = p.house_name ) )
                   and has_org_role(t.org_id, array['Owner','Admin'])
                   and exists (select 1 from org_members tm join players tp on tp.id = tm.player_id
                               where tm.org_id = t.org_id and tm.until is null
                                 and tp.profile_id = t.created_by)
                   and org_member_by_choice(t.org_id, p.created_by))
    )
  );
$$;
revoke all on function can_admin_player(uuid) from public, anon;
grant execute on function can_admin_player(uuid) to authenticated;
commit;
