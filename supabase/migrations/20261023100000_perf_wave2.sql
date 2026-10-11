-- ============================================================================
--  Speed Wave 2 (docs/perf/audit.md F-04, F-09(4), F-17) + players_view
--  provisional-contact fix (live finding after 20261022100000)
-- ============================================================================
--  Idempotent — safe to re-run (create or replace / create index if not
--  exists; grants re-applied). Needs every earlier migration, in particular
--  20261016120000_phone_login + 20261020120100_phone_e164 (phone_login_lookup),
--  20261006120000_security_hardening (push_allowed_targets and the can_* /
--  has_org_role helpers it mirrors) and 20261021120000_team_levels_feeders
--  (teams.level, read by home_feed).
--
--  1. phone_login_lookup_account(p_phone)  (F-04)
--     phone_login_lookup() plus the auth.users fields the phone-login edge
--     function used to fetch with a separate admin getUserById call (email,
--     deleted_at, banned_until). Same owner rule (it wraps the existing lookup
--     unchanged); service role only. The edge function falls back to the old
--     two-step path when this function isn't there yet.
--
--  2. home_feed()  (F-09(4))
--     One read for Home: the caller's player id, every tournament they can
--     see (same columns as the app's tournaments read, newest first) and the
--     matches of their scoped feed (the app's getScopedMatches rule: their
--     own matches — hosted / scored / a team they're on / a tournament they
--     host — plus what they follow, directly or through a followed player's
--     team), with ids of the "mine" subset. SECURITY INVOKER: every table is
--     read through the caller's own RLS, exactly like the reads it replaces.
--     The app falls back to its old reads when this function isn't there.
--
--  3. push_allowed_targets(uuid[])  (F-17)
--     Same allowed-target set, same order, same security definer + grants.
--     The old body called can_edit_team_roster() for EVERY team (which called
--     can_manage_match() for every match of it, each recomputing
--     auth_player_ids()), and can_manage_match() for every match. The new body
--     computes the caller's player ids once, builds each "manages" set once
--     with indexable predicates, then runs the old per-target checks verbatim
--     against those sets. Support staff still get every target back without
--     any of the work. Plus the indexes those predicates use.
--
--  4. players_view: provisional_contact via my_roster_editable_team_ids(),
--     computed once per query instead of can_contact_provisional() per row
--     (new live finding after 20261022100000; see section 4).
-- ============================================================================


-- ---------- 1. phone-login: lookup + account state in one call ----------------
create or replace function phone_login_lookup_account(p_phone text)
  returns table (profile_id uuid, verified boolean, email text, deleted_at timestamptz, banned_until timestamptz)
  language sql stable security definer set search_path = public as $$
  select l.profile_id, l.verified, u.email::text, u.deleted_at, u.banned_until
  from phone_login_lookup(p_phone) l
  left join auth.users u on u.id = l.profile_id;
$$;
revoke all on function phone_login_lookup_account(text) from public, anon, authenticated;
grant execute on function phone_login_lookup_account(text) to service_role;


-- ---------- 2. home_feed -------------------------------------------------------
create or replace function home_feed()
  returns jsonb language sql stable security invoker set search_path = public as $$
  with
  -- getMyPlayerId: the one player row of this account (none, or several = null,
  -- like the app's .single() read)
  me as (
    select case when count(*) = 1 then (array_agg(p.id))[1] end as pid
    from players p where p.profile_id = auth.uid()
  ),
  fol as (select f.target_type, f.target_id from follows f where f.follower_id = auth.uid()),
  fol_players as (select coalesce(array_agg(target_id::text), '{}') as ids from fol where target_type = 'player'),
  tours as materialized (
    select t.id, t.name, t.host_name, t.host_org_id, t.logo_url, t.organizer_id, t.host_ids, t.is_open, t.sports,
           t.start_date, t.end_date, t.formats, t.structure, t.knockout_format, t.reminder_lead_minutes,
           t.registration_deadline, t.min_teams, t.max_teams, t.scoring, t.created_by, t.participation,
           t.banner_url, t.city, t.grounds, t.event_category, t.about, t.organiser_phone, t.organiser_email, t.deleted_at,
           t.time_zone, t.qualifies_to
    from tournaments t
  ),
  -- tournaments the caller hosts (live ones; hostIds falls back to organizer_id like the app)
  my_tours as (
    select t.id from tours t, me
    where t.deleted_at is null and me.pid is not null
      and me.pid = any(coalesce(t.host_ids, case when t.organizer_id is not null then array[t.organizer_id] end))
  ),
  -- every visible match except a deleted tournament's unfinished ones
  vis as materialized (
    select m.id, m.tournament_id, m.group_label, m.stage, m.byes, m.sport, m.status, m.starts_at, m.venue_id,
           m.venue_name, m.venue_maps_url, m.stream_url, m.winner, m.host_ids, m.logo_url, m.scorer_id, m.scorer_ids,
           m.format, m.state, m.result,
           ht.id as h_id, ht.roster as h_roster, at.id as a_id, at.roster as a_roster,
           case when ht.id is null then null else jsonb_build_object('id', ht.id, 'name', ht.name, 'short_name', ht.short_name,
             'sport', ht.sport, 'color_hex', ht.color_hex, 'level', ht.level) end as home_team,
           case when at.id is null then null else jsonb_build_object('id', at.id, 'name', at.name, 'short_name', at.short_name,
             'sport', at.sport, 'color_hex', at.color_hex, 'level', at.level) end as away_team
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    where not coalesce(m.tournament_id in (select id from tours where deleted_at is not null) and m.status is distinct from 'completed', false)
  ),
  flags as (
    select v.*,
      -- a team "has" a player when its roster lists them or team_members does
      (me.pid is not null and (
          me.pid = any(v.host_ids) or v.scorer_id = me.pid or me.pid = any(v.scorer_ids)
       or (v.h_id is not null and ((jsonb_typeof(v.h_roster) = 'array' and v.h_roster ? me.pid::text)
             or exists (select 1 from team_members tm where tm.team_id = v.h_id and tm.player_id = me.pid)))
       or (v.a_id is not null and ((jsonb_typeof(v.a_roster) = 'array' and v.a_roster ? me.pid::text)
             or exists (select 1 from team_members tm where tm.team_id = v.a_id and tm.player_id = me.pid)))
       or v.tournament_id in (select id from my_tours))) is true as mine,
      (  v.tournament_id in (select target_id from fol where target_type = 'tournament')
      or v.h_id in (select target_id from fol where target_type = 'team')
      or v.a_id in (select target_id from fol where target_type = 'team')
      or (v.h_id is not null and ((jsonb_typeof(v.h_roster) = 'array' and v.h_roster ?| fp.ids)
             or exists (select 1 from team_members tm where tm.team_id = v.h_id and tm.player_id::text = any(fp.ids))))
      or (v.a_id is not null and ((jsonb_typeof(v.a_roster) = 'array' and v.a_roster ?| fp.ids)
             or exists (select 1 from team_members tm where tm.team_id = v.a_id and tm.player_id::text = any(fp.ids))))
      ) is true as followed
    from vis v, me, fol_players fp
  )
  select jsonb_build_object(
    'player_id', (select pid from me),
    'tournaments', coalesce((select jsonb_agg(to_jsonb(t) order by t.start_date desc) from tours t), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(f) - array['h_id', 'h_roster', 'a_id', 'a_roster', 'mine', 'followed'] order by f.starts_at)
                         from flags f where f.mine or f.followed), '[]'::jsonb),
    'mine_ids', coalesce((select jsonb_agg(f.id order by f.starts_at) from flags f where f.mine), '[]'::jsonb)
  );
$$;
revoke all on function home_feed() from public, anon;
grant execute on function home_feed() to authenticated;


-- ---------- 3. push_allowed_targets, fast -------------------------------------
create index if not exists teams_created_by_idx on teams (created_by);
create index if not exists teams_admin_ids_gin on teams using gin (admin_ids);
create index if not exists teams_roster_gin on teams using gin (roster);
create index if not exists matches_scorer_id_idx on matches (scorer_id);
create index if not exists team_staff_profile_id_idx on team_staff (profile_id);
create index if not exists clubs_created_by_idx on clubs (created_by);

create or replace function push_allowed_targets(p_targets uuid[])
  returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_ids uuid[] := auth_player_ids();
  v_uid uuid := auth.uid();
begin
  -- Support staff may notify anyone (verification decisions): every target, as given.
  if is_support() then
    return (select coalesce(array_agg(x order by o), '{}') from unnest(p_targets) with ordinality u(x, o));
  end if;

  return (
    with
    -- orgs where the caller is an active Owner/Admin/Organizer (has_org_role)
    adm_orgs as materialized (
      select org_id from org_members
      where player_id = any(v_ids) and until is null and role in ('Owner', 'Admin', 'Organizer')
    ),
    oa_orgs as materialized (
      select org_id from org_members
      where player_id = any(v_ids) and until is null and role in ('Owner', 'Admin')
    ),
    -- can_manage_club
    m_clubs as materialized (
      select id from clubs where created_by = v_uid
      union select c.id from clubs c join oa_orgs o on o.org_id = c.org_id
      union select club_id from club_members where player_id = any(v_ids) and role = 'admin'
    ),
    -- can_manage_tournament
    m_tours as materialized (
      select id from tournaments where organizer_id = v_uid
      union select id from tournaments where host_ids && v_ids
      union select t.id from tournaments t join adm_orgs o on o.org_id = t.host_org_id
    ),
    -- can_manage_match
    m_matches as materialized (
      select id from matches where scorer_ids && v_ids
      union select id from matches where scorer_id = any(v_ids)
      union select id from matches where host_ids && v_ids
      union select m.id from matches m join m_tours t on t.id = m.tournament_id
    ),
    -- can_manage_team
    m_teams as materialized (
      select id from teams where created_by = v_uid
      union select id from teams where captain_id = any(v_ids)
      union select id from teams where vice_captain_id = any(v_ids)
      union select id from teams where admin_ids && v_ids
      union select t.id from teams t join m_clubs c on c.id = t.club_id
      union select t.id from teams t join adm_orgs o on o.org_id = t.org_id
      union select team_id from team_staff where profile_id = v_uid
    ),
    -- teams the caller manages, captains, plays on, or runs a live/scheduled match for
    my_teams as materialized (
      select t.id from teams t where t.id in (
        select id from m_teams                                   -- can_edit_team_roster: manages the team
        union select m.home_team_id from matches m join m_matches mm on mm.id = m.id
              where m.status in ('scheduled', 'live')            -- … or a live/scheduled match of it
        union select m.away_team_id from matches m join m_matches mm on mm.id = m.id
              where m.status in ('scheduled', 'live')
        union select id from teams where roster ?| (select array_agg(x::text) from unnest(v_ids) x)
        union select team_id from team_members where player_id = any(v_ids)
      )
    ),
    -- matches the caller manages or plays in
    my_matches as materialized (
      select id from m_matches
      union select id from matches where home_team_id in (select id from my_teams)
      union select id from matches where away_team_id in (select id from my_teams)
    ),
    -- tournaments the caller manages or has a team entered in
    my_tournaments as materialized (
      select id from m_tours
      union
      select tt.tournament_id from tournament_teams tt where tt.team_id in (select id from my_teams)
    )
    -- the per-target checks below are the old ones, unchanged
    select coalesce(array_agg(x order by o), '{}') from unnest(p_targets) with ordinality u(x, o)
    where x = any(v_ids)
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
                  where a.player_id = any(v_ids) and a.until is null
                    and b.player_id = x and b.until is null)
       -- a fellow member of a club
       or exists (select 1 from club_members a join club_members b on a.club_id = b.club_id
                  where a.player_id = any(v_ids) and b.player_id = x)
  );
end $$;
revoke all on function push_allowed_targets(uuid[]) from public, anon;
grant execute on function push_allowed_targets(uuid[]) to authenticated;


-- ---------- 4. players_view: provisional contact without per-row team scans ---
-- Measured live after 20261022100000: a signed-in players_view read was still
-- ~175 ms for 19 rows, ~109 ms of it in can_contact_provisional(p.id) — run for
-- every provisional player, scanning every team's roster and calling
-- can_edit_team_roster() (→ can_manage_team + can_manage_match per scheduled /
-- live match) for each match. Now the set of teams the caller may edit is
-- computed ONCE per query (my_roster_editable_team_ids — exactly the
-- can_edit_team_roster rule, set-based), and provisional_contact is a test
-- against those few teams with the same `roster ? id` operator. Columns, order,
-- types, grants and security_barrier are unchanged. can_contact_provisional()
-- itself is unchanged (no other live caller; older views that used it are
-- superseded).

-- can_edit_team_roster(t) for every team t, as one set:
--   can_manage_team(t)  — creator, captain, vice, admin, club manager, org
--                         Owner/Admin/Organizer, team staff
--   or a scheduled / live match of t that the caller can_manage_match()
--                       — scorer, host, or manager of its tournament
create or replace function my_roster_editable_team_ids()
  returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_ids uuid[] := auth_player_ids();
  v_uid uuid := auth.uid();
begin
  return (
    with
    adm_orgs as materialized (
      select org_id from org_members
      where player_id = any(v_ids) and until is null and role in ('Owner', 'Admin', 'Organizer')
    ),
    oa_orgs as materialized (
      select org_id from org_members
      where player_id = any(v_ids) and until is null and role in ('Owner', 'Admin')
    ),
    m_clubs as materialized (
      select id from clubs where created_by = v_uid
      union select c.id from clubs c join oa_orgs o on o.org_id = c.org_id
      union select club_id from club_members where player_id = any(v_ids) and role = 'admin'
    ),
    m_tours as materialized (
      select id from tournaments where organizer_id = v_uid
      union select id from tournaments where host_ids && v_ids
      union select t.id from tournaments t join adm_orgs o on o.org_id = t.host_org_id
    ),
    m_matches as materialized (
      select id from matches where scorer_ids && v_ids
      union select id from matches where scorer_id = any(v_ids)
      union select id from matches where host_ids && v_ids
      union select m.id from matches m join m_tours t on t.id = m.tournament_id
    )
    select coalesce(array_agg(t.id), '{}') from teams t where t.id in (
      select id from teams where created_by = v_uid
      union select id from teams where captain_id = any(v_ids)
      union select id from teams where vice_captain_id = any(v_ids)
      union select id from teams where admin_ids && v_ids
      union select t2.id from teams t2 join m_clubs c on c.id = t2.club_id
      union select t2.id from teams t2 join adm_orgs o on o.org_id = t2.org_id
      union select team_id from team_staff where profile_id = v_uid
      union select m.home_team_id from matches m join m_matches mm on mm.id = m.id where m.status in ('scheduled', 'live')
      union select m.away_team_id from matches m join m_matches mm on mm.id = m.id where m.status in ('scheduled', 'live')
    )
  );
end $$;
revoke all on function my_roster_editable_team_ids() from public;
grant execute on function my_roster_editable_team_ids() to anon, authenticated, service_role;

-- Same view as 20261022100000 except `me.editable`, provisional_contact, and
-- `offset 0` on the two per-row laterals: without it the planner pulled them up
-- and re-ran can_view_player_private / player_is_known_adult once per column
-- that reads them (~10 calls per row measured in PGlite instead of 1).
create or replace view players_view with (security_barrier = true) as
with me as materialized (
  -- Uncorrelated and MATERIALIZED → evaluated once per query, never per row.
  select auth.uid() is null as anon, auth.uid() as uid, my_player_circle() as circle,
         -- F-04b: the teams whose roster the caller may edit, once per query
         case when auth.uid() is null then '{}'::uuid[] else my_roster_editable_team_ids() end as editable
)
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
cross join me
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    -- = can_contact_provisional(p.id): signed in and on the roster of a team the caller may edit
    case when p.profile_id is null
         then not me.anon and exists (select 1 from teams t where t.id = any(me.editable) and t.roster ? p.id::text)
         else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    player_is_known_adult(p.dob, p.profile_id) as adult
  offset 0  -- evaluate once per row (else the planner copies each call into every column that uses it)
) a
cross join lateral (
  select coalesce(a.adult or a.priv
        or (not me.anon and (p.guardian_profile_id = me.uid or p.id = any(me.circle))), false) as full
  offset 0
) v;
grant select on players_view to anon, authenticated;

-- ============================================================================
--  End. After running: deploy the phone-login edge function (it uses
--  phone_login_lookup_account when present). push-send needs no change.
--  Don't re-run 20261022100000 or older players_view migrations after this
--  one: they recreate the slower view.
-- ============================================================================
