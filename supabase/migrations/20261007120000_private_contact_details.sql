-- ============================================================================
--  Sportfolio · migration 0026 — Private contact details + privacy settings
--  Delta on top of migrations 0001–0025. Idempotent — safe to re-run.
--  PREREQUISITE: 0025 (security hardening) — uses its helpers.
--
--  Why: players / profiles were readable by anyone holding the app's anon key,
--  including phone, email, date of birth and guardian contacts — mostly school
--  children's. Under the DPDP Act 2023 children's data needs strict handling.
--
--  The talent-scouting side of the product stays public: name, photo, sports,
--  city, school/house, bio, stats and an AGE (years, derived) remain visible to
--  everyone. What becomes private:
--    phone, email, dob, guardian (contact), verification (beyond its status)
--  visible only to:
--    • the person themselves (and the creator of a still-unclaimed provisional
--      player, who entered the details), and SportnNote support;
--    • for an unclaimed provisional player, the managers of a team it's on (they
--      need the number to send the WhatsApp/SMS install invite);
--    • anyone, for phone/email the person has CHOSEN to show (show_phone /
--      show_email) — adults only; it never applies to under-18s.
--
--  Mechanism (one table, no data move):
--    1. Column privileges: clients can no longer SELECT the private columns of
--       players / profiles at all. Writes are unchanged.
--    2. players_view: the read model the app uses. It returns every public column
--       plus the private ones filled in only when the viewer is allowed (else
--       null), and derived public fields (age; guardian present/verified flags;
--       verification status) so eligibility checks still work for organizers.
--    3. RPCs for the lookups that used to filter on private columns:
--       find_player_by_phone / find_player_by_email (exact match, returns only
--       id + name, rate-limited), my_claimable_player(), my_profile_private().
-- ============================================================================

-- ---------- 1. Privacy settings (default: hidden) ---------------------------
alter table players add column if not exists show_phone boolean not null default false;
alter table players add column if not exists show_email boolean not null default false;


-- ---------- 2. Who may see a player's private details -----------------------

-- Full private access: self, creator of an unclaimed provisional, support.
create or replace function can_view_player_private(p_profile uuid, p_created_by uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
       p_profile = auth.uid()
    or (p_profile is null and p_created_by = auth.uid())
    or is_support()
  );
$$;

-- The phone of an UNCLAIMED provisional player, for whoever runs a team it's on
-- (captain / organizer / match scorer) — needed to send the install invite.
create or replace function can_contact_provisional(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from teams t
    where t.roster ? p_player::text and can_edit_team_roster(t.id)
  );
$$;


-- ---------- 3. players_view: the app's read model ----------------------------
-- Runs with the owner's rights (so it can read the private columns) and decides
-- per row what to reveal. security_barrier stops filter push-down from leaking
-- hidden values through clever WHERE clauses.
-- Drop + recreate (not CREATE OR REPLACE) so re-running any of 0026/0027 in any
-- order works; nothing depends on the view.
drop view if exists players_view;
create view players_view with (security_barrier = true) as
select
  p.id, p.profile_id, p.full_name, p.jersey_no, p.sports, p.house_name, p.house_color,
  p.city, p.school_id, p.phone_verified, p.email_verified, p.photo_url, p.sport_details,
  p.created_at, p.updated_at, p.invited, p.gender, p.bio, p.reported_at, p.created_by,
  p.show_phone, p.show_email,
  a.age,
  case when a.priv or a.provisional_contact or (p.show_phone and a.adult) then p.phone end as phone,
  case when a.priv or (p.show_email and a.adult) then p.email end as email,
  case when a.priv then p.dob end as dob,
  case when a.priv then p.guardian
       when p.guardian is null then null
       else jsonb_build_object(
              'hidden', true,
              'present', coalesce(p.guardian->>'name', '') <> '',
              'phoneVerified', coalesce((p.guardian->>'phoneVerified')::boolean, false),
              'emailVerified', coalesce((p.guardian->>'emailVerified')::boolean, false))
  end as guardian,
  case when a.priv then p.verification
       when p.verification is null then null
       else jsonb_strip_nulls(jsonb_build_object('status', p.verification->>'status'))
  end as verification
from players p
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    case when p.profile_id is null then can_contact_provisional(p.id) else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    coalesce(p.dob <= (current_date - interval '18 years')::date, false) as adult
) a;

grant select on players_view to anon, authenticated;


-- ---------- 4. Lock the private columns on the base tables -------------------
-- Table-level SELECT is replaced by a column list. NOTE for future migrations:
-- a NEW public column on players/profiles must be added to these grants (and to
-- players_view) or clients won't be able to read it.
revoke select on players from anon, authenticated;
grant select (
  id, profile_id, full_name, jersey_no, sports, house_name, house_color, city, school_id,
  phone_verified, email_verified, photo_url, sport_details, created_at, updated_at,
  invited, gender, bio, reported_at, created_by, show_phone, show_email
) on players to anon, authenticated;

revoke select on profiles from anon, authenticated;
grant select (id, full_name, handle, avatar_url, role, school_id, created_at, time_zone)
  on profiles to anon, authenticated;


-- ---------- 5. Lookups that used to read private columns ---------------------

-- "Is this number already someone?" — the phone = one-person dedupe used when
-- adding/inviting by number. Exact match only; returns no contact details.
create or replace function find_player_by_phone(p_phone text)
  returns table (id uuid, full_name text, claimed boolean)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if phone_key(p_phone) is null or length(phone_key(p_phone)) < 10 then return; end if;
  if not rate_limit_hit('contact-lookup', auth.uid()::text, 60, 3600) then
    raise exception 'Too many lookups — try again in an hour' using errcode = '54000';
  end if;
  return query
    select p.id, p.full_name, p.profile_id is not null
    from players p where phone_key(p.phone) = phone_key(p_phone)
    order by (p.profile_id is not null) desc, p.created_at
    limit 1;
end $$;

create or replace function find_player_by_email(p_email text)
  returns table (id uuid, full_name text, claimed boolean)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if coalesce(trim(p_email), '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then return; end if;
  if not rate_limit_hit('contact-lookup', auth.uid()::text, 60, 3600) then
    raise exception 'Too many lookups — try again in an hour' using errcode = '54000';
  end if;
  return query
    select p.id, p.full_name, p.profile_id is not null
    from players p where lower(p.email) = lower(trim(p_email))
    order by (p.profile_id is not null) desc, p.created_at
    limit 1;
end $$;

-- The provisional player waiting for ME — matched on my own profile number (or
-- confirmed sign-in email), never on a value the caller passes in.
create or replace function my_claimable_player()
  returns uuid language sql stable security definer set search_path = public as $$
  select p.id from players p
  where p.profile_id is null and p.reported_at is null
    and (
      (phone_key(p.phone) is not null
        and phone_key(p.phone) = phone_key((select phone from profiles where id = auth.uid())))
      or (p.email is not null and exists (
            select 1 from auth.users u
            where u.id = auth.uid() and u.email_confirmed_at is not null
              and lower(u.email) = lower(p.email)))
    )
  order by p.created_at
  limit 1;
$$;

-- My own profile's private fields (sign-up number, DOB, guardian).
create or replace function my_profile_private()
  returns table (phone text, dob date, guardian jsonb)
  language sql stable security definer set search_path = public as $$
  select pr.phone, pr.dob, pr.guardian from profiles pr where pr.id = auth.uid();
$$;

revoke all on function find_player_by_phone(text), find_player_by_email(text),
                       my_claimable_player(), my_profile_private()
  from public, anon;
grant execute on function find_player_by_phone(text), find_player_by_email(text),
                          my_claimable_player(), my_profile_private()
  to authenticated;
