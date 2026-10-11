-- ============================================================================
--  Sportfolio · protect minors at the data layer (legal audit L3, L15, L16)
--  Idempotent — safe to re-run. Needs 0026 (players_view), 0027 (guardian link),
--  0038 (media bucket), 0042 (teams.admin_ids), 0051 (field_entries.team_id).
--
--  Before this, the "members only" rule for under-18 profiles lived only in the
--  app screen. Anyone holding the anon key could list every player, children
--  included, with name, photo URL, city, school and house; photo URLs worked
--  without signing in; and any signed-in adult could see a child's full card,
--  follow them and get match-time and venue alerts.
--
--  WHO COUNTS AS A POSSIBLE MINOR
--    Everyone whose age we can't prove is 18+. A player is a KNOWN ADULT only when
--    their date of birth (on the player row, else the sign-up DOB of the linked
--    account) is at least 18 years ago. No DOB ⇒ treated as a possible minor:
--    most players with no DOB are provisional entries a coach typed in (a school
--    squad), which is exactly the case to protect. An adult with no DOB loses
--    nothing but their public card, and adding a DOB restores it.
--
--  WHO SEES A POSSIBLE MINOR'S FULL CARD (photo, city, school, bio)
--    • the player themselves; the creator of a still-unclaimed entry; support;
--    • their linked guardian (players.guardian_profile_id);
--    • their CIRCLE: people who share a team (squad, captain/vice, team admin,
--      coach/staff, club), a tournament (organiser, host, official, or a player
--      or manager of any team or entry in it), a match they score or host, or an
--      organisation (active members of the same org).
--    Everyone else signed in gets the REDUCED card: name, jersey, sports,
--    house/team colours, age and gender (eligibility checks need these), no
--    photo, city, school or bio. Logged-out visitors get initials ("A. K."),
--    jersey, sports and house only.
--
--  WHAT CHANGES
--    1. players_view redacts per viewer (above) and gains `restricted`.
--    2. Base table `players`: logged-out reads return KNOWN ADULTS only (RLS for
--       role anon); photo_url / city / school_id / bio can no longer be read from
--       the base table by any client (the view decides).
--    3. profiles: a minor's profile row is readable only by them and support.
--    4. Player photos go to a new PRIVATE bucket `player-photos`. The row stores
--       `private://player-photos/<path>`; the app asks for a signed URL, and the
--       storage policy grants it only to viewers who may see that player's full
--       card. A possible minor's photo can no longer be set to a public URL.
--    5. Following a possible minor: only their circle, guardian or support. Old
--       follows are kept (not deleted) but alert senders skip any that no longer
--       qualify (allowed_player_follows, used by notify-followers/notify-upcoming).
-- ============================================================================


-- ---------- 1. Helpers --------------------------------------------------------

-- 18+ by DOB (the player's, else the linked account's sign-up DOB).
create or replace function player_is_known_adult(p_dob date, p_profile uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    coalesce(p_dob, (select pr.dob from profiles pr where pr.id = p_profile))
      <= (current_date - interval '18 years')::date,
    false);
$$;

-- "Aarav Kumar" → "A. K."; empty → "Player". For logged-out views of minors.
create or replace function name_initials(p_name text)
  returns text language sql immutable set search_path = public as $$
  select coalesce(nullif((
    select string_agg(upper(left(w, 1)) || '.', ' ' order by n)
      from regexp_split_to_table(trim(coalesce(p_name, '')), '\s+') with ordinality as t(w, n)
     where w <> ''), ''), 'Player');
$$;

-- The players a signed-in person (a PROFILE id) shares a team, tournament, match,
-- club or organisation with — plus their own players, wards and the provisional
-- players they entered. Internal: never callable by clients for someone else.
create or replace function player_circle_of(p_profile uuid)
  returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  me uuid[];
  me_txt text[];
  my_houses text[];
  my_teams uuid[];
  my_tours uuid[];
  circle_teams uuid[];
  my_clubs uuid[];
  result uuid[];
begin
  if p_profile is null then return '{}'::uuid[]; end if;
  select coalesce(array_agg(id), '{}'), coalesce(array_agg(id::text), '{}'),
         coalesce(array_agg(house_name) filter (where house_name is not null), '{}')
    into me, me_txt, my_houses
    from players where profile_id = p_profile;

  -- Clubs I belong to.
  select coalesce(array_agg(distinct club_id), '{}') into my_clubs
    from club_members where player_id = any(me);

  -- Teams I'm on or run.
  select coalesce(array_agg(distinct t.id), '{}') into my_teams
    from teams t
   where t.created_by = p_profile
      or t.captain_id = any(me) or t.vice_captain_id = any(me)
      or coalesce(t.admin_ids, '{}') && me
      or (jsonb_typeof(t.roster) = 'array' and t.roster ?| me_txt)
      or ((t.roster is null or jsonb_typeof(t.roster) <> 'array' or jsonb_array_length(t.roster) = 0)
          and t.name = any(my_houses)
          and exists (select 1 from players p where p.profile_id = p_profile and p.house_name = t.name and t.sport = any(p.sports)))
      or (t.club_id is not null and t.club_id = any(my_clubs))
      or exists (select 1 from team_members m where m.team_id = t.id and m.player_id = any(me))
      or exists (select 1 from team_player_roles r where r.team_id = t.id and r.player_id = any(me))
      or exists (select 1 from team_staff s where s.team_id = t.id and s.profile_id = p_profile);

  -- Tournaments I run, officiate, score in, or play in.
  select coalesce(array_agg(distinct x), '{}') into my_tours from (
    select t.id as x from tournaments t
     where t.organizer_id = p_profile
        or coalesce(t.host_ids, '{}') && me
        or t.created_by = any(me)
        or (t.host_org_id is not null and exists (
              select 1 from org_members om
               where om.org_id = t.host_org_id and om.player_id = any(me)
                 and (om.until is null or om.until >= current_date)
                 and om.role in ('Owner', 'Admin', 'Organizer')))
    union select tournament_id from tournament_officials where player_id = any(me)
    union select tournament_id from tournament_teams where team_id = any(my_teams)
    union select tournament_id from matches
           where tournament_id is not null
             and (home_team_id = any(my_teams) or away_team_id = any(my_teams)
                  or coalesce(scorer_ids, '{}') && me or coalesce(host_ids, '{}') && me)
    union select e.tournament_id from field_events e
           where e.tournament_id is not null
             and (coalesce(e.host_ids, '{}') && me or e.created_by = p_profile
                  or exists (select 1 from field_entries fe where fe.event_id = e.id and fe.player_id = any(me)))
  ) s where x is not null;

  -- Every team in those tournaments + both sides of any match I score/host.
  select coalesce(array_agg(distinct x), '{}') into circle_teams from (
    select unnest(my_teams) as x
    union select team_id from tournament_teams where tournament_id = any(my_tours)
    union select unnest(array[home_team_id, away_team_id]) from matches
           where tournament_id = any(my_tours)
              or coalesce(scorer_ids, '{}') && me or coalesce(host_ids, '{}') && me
    union select fe.team_id from field_entries fe join field_events e on e.id = fe.event_id
           where e.tournament_id = any(my_tours)
  ) s where x is not null;

  select coalesce(array_agg(distinct x), '{}') into result from (
    select unnest(me) as x
    -- members of the circle's teams
    union select r.v::uuid from teams t
           cross join lateral jsonb_array_elements_text(
             case when jsonb_typeof(t.roster) = 'array' then t.roster else '[]'::jsonb end) as r(v)
           where t.id = any(circle_teams)
             and r.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    union select player_id from team_members where team_id = any(circle_teams)
    union select player_id from team_player_roles where team_id = any(circle_teams)
    union select unnest(array[captain_id, vice_captain_id]) from teams where id = any(circle_teams)
    union select unnest(coalesce(admin_ids, '{}')) from teams where id = any(circle_teams)
    -- school house teams with no explicit roster: the house's players of that sport
    union select p.id from teams t join players p on p.house_name = t.name and t.sport = any(p.sports)
           where t.id = any(circle_teams)
             and (t.roster is null or jsonb_typeof(t.roster) <> 'array' or jsonb_array_length(t.roster) = 0)
    -- my clubs (a club is one real team across sports)
    union select player_id from club_members where club_id = any(my_clubs)
    -- individual entries (golf, athletics, swimming …) in my tournaments / events I host
    union select fe.player_id from field_entries fe join field_events e on e.id = fe.event_id
           where e.tournament_id = any(my_tours) or coalesce(e.host_ids, '{}') && me or e.created_by = p_profile
    -- active members of my organisations
    union select om2.player_id from org_members om join org_members om2 on om2.org_id = om.org_id
           where om.player_id = any(me)
             and (om.until is null or om.until >= current_date)
             and (om2.until is null or om2.until >= current_date)
    -- my wards and the provisional players I entered
    union select id from players where guardian_profile_id = p_profile
    union select id from players where created_by = p_profile
  ) s where x is not null;

  return result;
end $$;
revoke all on function player_circle_of(uuid) from public, anon, authenticated;

-- The caller's own circle (empty when logged out). players_view uses it once per
-- query; it only ever reveals people the caller already plays/organises with.
create or replace function my_player_circle()
  returns uuid[] language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then '{}'::uuid[] else player_circle_of(auth.uid()) end;
$$;
revoke all on function my_player_circle() from public;
grant execute on function my_player_circle() to anon, authenticated;

-- May this signed-in person (profile) see this player's full card?
create or replace function player_full_visible_to(p_profile uuid, p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from players p
     where p.id = p_player
       and ( player_is_known_adult(p.dob, p.profile_id)
          or (p_profile is not null and (
                 p.profile_id = p_profile
              or p.guardian_profile_id = p_profile
              or (p.profile_id is null and p.created_by = p_profile)
              or exists (select 1 from profiles pr where pr.id = p_profile and pr.role in ('support', 'admin'))
              or p.id = any(player_circle_of(p_profile))))));
$$;
revoke all on function player_full_visible_to(uuid, uuid) from public, anon, authenticated;

-- …the caller (anon → known adults only).
create or replace function player_full_visible(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select player_full_visible_to(auth.uid(), p_player);
$$;
revoke all on function player_full_visible(uuid) from public;
grant execute on function player_full_visible(uuid) to anon, authenticated;

-- Following a player: anyone may follow a known adult; a possible minor only by
-- their circle, guardian, themselves or support.
create or replace function can_follow_player(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and player_full_visible_to(auth.uid(), p_player);
$$;
revoke all on function can_follow_player(uuid) from public, anon;
grant execute on function can_follow_player(uuid) to authenticated;


-- ---------- 2. players_view: redact per viewer --------------------------------
-- Same columns and order as 0034 (+ `restricted` appended). Drop + recreate so
-- re-running this or 0026/0027/0034 in any order works; nothing depends on it.
drop view if exists players_view;
create view players_view with (security_barrier = true) as
select
  p.id, p.profile_id,
  case when v.full or not me.anon then p.full_name else name_initials(p.full_name) end as full_name,
  p.jersey_no, p.sports, p.house_name, p.house_color,
  case when v.full then p.city end as city,
  case when v.full then p.school_id end as school_id,
  p.phone_verified, p.email_verified,
  case when v.full then p.photo_url end as photo_url,
  case when v.full or not me.anon then p.sport_details end as sport_details,
  p.created_at, p.updated_at, p.invited,
  case when v.full or not me.anon then p.gender end as gender,
  case when v.full then p.bio end as bio,
  p.reported_at,
  case when v.full or not me.anon then p.created_by end as created_by,
  p.show_phone, p.show_email,
  case when v.full or not me.anon then a.age end as age,
  case when a.priv or a.provisional_contact or (p.show_phone and a.adult) then p.phone end as phone,
  case when a.priv or (p.show_email and a.adult) then p.email end as email,
  case when a.priv then p.dob end as dob,
  case when a.priv then p.guardian
       when p.guardian is null or (me.anon and not v.full) then null
       else jsonb_build_object(
              'hidden', true,
              'present', coalesce(p.guardian->>'name', '') <> '',
              'phoneVerified', coalesce((p.guardian->>'phoneVerified')::boolean, false),
              'emailVerified', coalesce((p.guardian->>'emailVerified')::boolean, false))
  end as guardian,
  case when a.priv then p.verification
       when p.verification is null or (me.anon and not v.full) then null
       else jsonb_strip_nulls(jsonb_build_object('status', p.verification->>'status'))
  end as verification,
  case when v.full or not me.anon then p.guardian_profile_id is not null end as guardian_linked,
  p.findable_by_contact,
  not v.full as restricted
from players p
-- Uncorrelated → evaluated once per query, not per row.
cross join (select auth.uid() is null as anon, auth.uid() as uid, my_player_circle() as circle) me
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    case when p.profile_id is null then can_contact_provisional(p.id) else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    player_is_known_adult(p.dob, p.profile_id) as adult
) a
cross join lateral (
  select coalesce(a.adult or a.priv
        or (not me.anon and (p.guardian_profile_id = me.uid or p.id = any(me.circle))), false) as full
) v;
grant select on players_view to anon, authenticated;


-- ---------- 3. Base table: logged-out = known adults; sensitive columns via the view
drop policy if exists "read players" on players;
create policy "read players" on players for select to authenticated using (true);
drop policy if exists "read adult players (logged out)" on players;
create policy "read adult players (logged out)" on players for select to anon
  using (player_is_known_adult(dob, profile_id));

-- photo_url / city / school_id / bio: only through players_view (which redacts).
-- NOTE for future migrations: a new public column must be added to this list.
revoke select on players from anon, authenticated;
revoke select (photo_url, city, school_id, bio) on players from anon, authenticated;
grant select (
  id, profile_id, full_name, jersey_no, sports, house_name, house_color,
  phone_verified, email_verified, sport_details, created_at, updated_at,
  invited, gender, reported_at, created_by, show_phone, show_email, findable_by_contact
) on players to anon, authenticated;


-- ---------- 4. profiles: a minor's row is theirs (and support's) only ----------
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select using (
  id = auth.uid() or player_is_known_adult(null, id) or is_support()
);


-- ---------- 5. Private player photos -------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists players_private_photo_idx on players (photo_url)
  where photo_url like 'private://%';

-- A photo object is readable when every player row using it is fully visible to
-- the caller (so a ref copied onto another row can't widen who sees it).
create or replace function can_view_player_photo(p_name text)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players p where p.photo_url = 'private://player-photos/' || p_name)
     and not exists (select 1 from players p
                      where p.photo_url = 'private://player-photos/' || p_name
                        and not player_full_visible_to(auth.uid(), p.id));
$$;
revoke all on function can_view_player_photo(text) from public;
grant execute on function can_view_player_photo(text) to anon, authenticated;

drop policy if exists "player photos insert own" on storage.objects;
create policy "player photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "player photos delete own" on storage.objects;
create policy "player photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Uploader (preview before saving) or anyone who may see the player's full card.
drop policy if exists "player photos read" on storage.objects;
create policy "player photos read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'player-photos'
         and ((auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text)
              or can_view_player_photo(name)));

-- Clients: a private ref must be your own upload; a possible minor's photo must be
-- private (old app builds upload to the public bucket → asked to update).
create or replace function guard_player_photo()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref text := new.photo_url;
begin
  if not is_client_request() or is_support() then return new; end if;
  if ref is null or ref = '' then return new; end if;
  if tg_op = 'UPDATE' and ref is not distinct from old.photo_url then return new; end if;
  if ref like 'private://%' then
    if ref not like 'private://player-photos/%'
       or split_part(substr(ref, length('private://player-photos/') + 1), '/', 1) <> coalesce(auth.uid()::text, '-') then
      raise exception 'That photo wasn’t uploaded from this account — pick it again' using errcode = '42501';
    end if;
    return new;
  end if;
  if not player_is_known_adult(new.dob, new.profile_id) then
    raise exception 'Update SportnNote to add a photo for a player under 18 (or with no date of birth)' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_player_photo on players;
create trigger guard_player_photo before insert or update of photo_url on players
  for each row execute function guard_player_photo();


-- ---------- 6. Follows ----------------------------------------------------------
drop policy if exists "follow minors: circle only" on follows;
create policy "follow minors: circle only" on follows as restrictive for insert to authenticated
  with check (target_type <> 'player' or can_follow_player(target_id));
drop policy if exists "follow minors: circle only (update)" on follows;
create policy "follow minors: circle only (update)" on follows as restrictive for update to authenticated
  using (true) with check (target_type <> 'player' or can_follow_player(target_id));

-- For the alert senders (service role): the follows of these players that may
-- still get alerts. Existing follows are kept; any that no longer qualify (a
-- minor who left the team, a follow made before this migration) are skipped.
create or replace function allowed_player_follows(p_player_ids uuid[])
  returns table (follower_id uuid, target_id uuid)
  language sql stable security definer set search_path = public as $$
  select f.follower_id, f.target_id
    from follows f
   where f.target_type = 'player' and f.target_id = any(p_player_ids)
     and player_full_visible_to(f.follower_id, f.target_id);
$$;
revoke all on function allowed_player_follows(uuid[]) from public, anon, authenticated;
grant execute on function allowed_player_follows(uuid[]) to service_role;
