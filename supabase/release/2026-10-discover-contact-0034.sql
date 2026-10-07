-- Release 2026-10: migration 0034 (Discover: find a player by exact phone/email; 'let people find me' setting).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0034 — Discover: find a player by their exact mobile number or email.
--
-- Privacy: contact details stay hidden; an exact number/email only returns WHO it
-- is (id), and only for a player who
--   • has an account (claimed — they agreed to the privacy policy),
--   • is 18+ (never children), and
--   • hasn't turned off "Let people find me by my phone or email"
--     (players.findable_by_contact, default on).
-- Signed-in users only; shares the contact-lookup rate limit (60/hour).

alter table players add column if not exists findable_by_contact boolean not null default true;

-- New public column → column grant + players_view (see 0026 note).
grant select (findable_by_contact) on players to anon, authenticated;
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
  end as verification,
  p.guardian_profile_id is not null as guardian_linked,
  p.findable_by_contact
from players p
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    case when p.profile_id is null then can_contact_provisional(p.id) else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    coalesce(p.dob <= (current_date - interval '18 years')::date, false) as adult
) a;
grant select on players_view to anon, authenticated;

create or replace function discover_player_by_contact(p_query text)
  returns table (id uuid)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  q text := trim(coalesce(p_query, ''));
  is_email boolean := q ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not is_email and (phone_key(q) is null or length(phone_key(q)) < 10) then return; end if;
  if not rate_limit_hit('contact-lookup', auth.uid()::text, 60, 3600) then
    raise exception 'Too many lookups — try again in an hour' using errcode = '54000';
  end if;
  return query
    select p.id from players p
    where p.profile_id is not null
      and p.findable_by_contact
      and p.dob is not null and p.dob <= (current_date - interval '18 years')::date
      and (case when is_email then lower(p.email) = lower(q) else phone_key(p.phone) = phone_key(q) end)
    order by p.created_at
    limit 1;
end $$;
revoke all on function discover_player_by_contact(text) from public, anon;
grant execute on function discover_player_by_contact(text) to authenticated;

commit;
