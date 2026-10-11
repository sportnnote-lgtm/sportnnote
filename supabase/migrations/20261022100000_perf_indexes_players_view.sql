-- ============================================================================
--  Speed: players(profile_id) index, players_view computes the viewer once,
--  foreign-key indexes on hot paths  (docs/perf/audit.md F-12 + F-18)
-- ============================================================================
--  Idempotent — safe to re-run (create index if not exists; create or replace
--  view with the same columns). Needs 20261019124600_protect_minors (the view,
--  my_player_circle, can_view_player_private, can_contact_provisional,
--  player_is_known_adult, name_initials).
--
--  1. players(profile_id): auth_player_ids() — used by nearly every RLS policy —
--     and getMyPlayerId both look players up by profile_id, and every one was a
--     sequential scan (145k on the live DB at audit time).
--
--  2. players_view: the planner pulled the `me` sub-select (auth.uid(),
--     my_player_circle()) up into the main query, so my_player_circle() — which
--     walks the caller's teams, tournaments, clubs and orgs — ran once PER ROW
--     for signed-in readers (106 ms mean for 19 players). It is now a
--     MATERIALIZED CTE: evaluated exactly once per query. Every output column,
--     its type, order and per-row rule (redaction for minors / logged-out
--     readers) is unchanged; only where `me` is computed moves.
--
--  3. Foreign keys with no index on hot paths (scaling fix; tables are small
--     today): matches home/away team, team_members by player, team captains,
--     tournament organiser and host org.
-- ============================================================================


-- ---------- 1. players(profile_id) --------------------------------------------
create index if not exists players_profile_id_idx on players (profile_id);


-- ---------- 2. players_view: the viewer, once per query ------------------------
-- Same columns, order, types and grants as 20261019124600_protect_minors.
-- CREATE OR REPLACE keeps the grants; they are repeated below anyway.
create or replace view players_view with (security_barrier = true) as
with me as materialized (
  -- Uncorrelated and MATERIALIZED → evaluated once per query, never per row.
  select auth.uid() is null as anon, auth.uid() as uid, my_player_circle() as circle
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
    case when p.profile_id is null then can_contact_provisional(p.id) else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    player_is_known_adult(p.dob, p.profile_id) as adult
) a
cross join lateral (
  select coalesce(a.adult or a.priv
        or (not me.anon and (p.guardian_profile_id = me.uid or p.id = any(me.circle))), false) as full
) v;
grant select on players_view to anon, authenticated;


-- ---------- 3. Foreign-key indexes on hot paths ------------------------------
create index if not exists matches_home_team_id_idx       on matches (home_team_id);
create index if not exists matches_away_team_id_idx       on matches (away_team_id);
create index if not exists team_members_player_id_idx     on team_members (player_id);
create index if not exists teams_captain_id_idx           on teams (captain_id);
create index if not exists teams_vice_captain_id_idx      on teams (vice_captain_id);
create index if not exists tournaments_organizer_id_idx   on tournaments (organizer_id);
create index if not exists tournaments_host_org_id_idx    on tournaments (host_org_id);
