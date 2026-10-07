-- Release 2026-10: migration 0035 (sign in with mobile number).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0035 — Sign in with mobile number (SMS code via Firebase, see phone-login).
--
-- Firebase proves the person holds the number; the phone-login edge function
-- (service role) then:
--   • signs them into the account whose OWN player has that number VERIFIED
--     (never one that merely typed the number in — no account takeover), or
--   • creates a new account (internal placeholder email @phone.sportnnote.in,
--     never emailed) and attaches a player: claiming an organiser-added
--     provisional player with that number (their earlier stats become theirs),
--     else a fresh one — phone marked verified either way.
-- Both helpers are service-role only.

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
begin
  -- Unique handle derived from the email local-part (append a counter on clash).
  -- Phone sign-ups get an internal placeholder email (@phone.sportnnote.in) —
  -- build their handle from the name instead of that random local-part.
  base_handle := nullif(regexp_replace(lower(
    case when new.email like '%@phone.sportnnote.in' then coalesce(meta->>'full_name', '') else split_part(new.email, '@', 1) end
  ), '[^a-z0-9]', '', 'g'), '');
  base_handle := left(base_handle, 20);
  base_handle := coalesce(base_handle, 'user');
  new_handle := base_handle;
  while exists (select 1 from public.profiles where handle = new_handle) loop
    n := n + 1;
    new_handle := base_handle || n::text;
  end loop;

  insert into public.profiles (id, full_name, handle, role, dob, phone, guardian)
  values (
    new.id,
    coalesce(nullif(meta->>'full_name', ''), 'Player'),
    new_handle,
    coalesce(nullif(meta->>'role', ''), 'fan'),
    nullif(meta->>'dob', '')::date,
    nullif(meta->>'phone', ''),
    case when meta ? 'guardian' and jsonb_typeof(meta->'guardian') = 'object' then meta->'guardian' else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- Who owns this number? Accounts whose own player has it (verified first), then
-- accounts that only typed it at sign-up (profile, no player yet).
create or replace function phone_login_lookup(p_phone text)
  returns table (profile_id uuid, verified boolean)
  language sql stable security definer set search_path = public as $$
  select * from (
    select p.profile_id, p.phone_verified as verified
    from players p
    where p.profile_id is not null and phone_key(p.phone) = phone_key(p_phone)
    union all
    select pr.id, false
    from profiles pr
    where phone_key(pr.phone) = phone_key(p_phone)
      and not exists (select 1 from players p2 where p2.profile_id = pr.id)
  ) x
  where phone_key(p_phone) is not null
  order by verified desc
  limit 1;
$$;

-- After a phone sign-up: claim the organiser-added player with this number, or
-- create one. Name / DOB / guardian come from the new profile (sign-up form).
create or replace function phone_login_attach_player(p_profile uuid, p_phone text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr profiles%rowtype;
  pid uuid;
begin
  select * into pr from profiles where id = p_profile;
  if not found then raise exception 'no profile'; end if;
  select id into pid from players where profile_id = p_profile limit 1;
  if pid is not null then
    update players set phone_verified = true where id = pid and phone_key(phone) = phone_key(p_phone);
    return pid;
  end if;
  select id into pid from players
    where profile_id is null and reported_at is null and phone_key(phone) = phone_key(p_phone)
    order by created_at limit 1;
  if pid is not null then
    update players set profile_id = p_profile, full_name = pr.full_name, dob = pr.dob, guardian = pr.guardian,
                       phone_verified = true
      where id = pid;
    return pid;
  end if;
  insert into players (profile_id, full_name, phone, dob, guardian, phone_verified, sports)
  values (p_profile, pr.full_name, p_phone, pr.dob, pr.guardian, true, '{}')
  returning id into pid;
  return pid;
end $$;

revoke all on function phone_login_lookup(text), phone_login_attach_player(uuid, text) from public, anon, authenticated;
grant execute on function phone_login_lookup(text), phone_login_attach_player(uuid, text) to service_role;

commit;
