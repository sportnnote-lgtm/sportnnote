-- 0030 — Account deletion (DPDP right to erasure; App Store / Play requirement)
--        + no per-user analytics for children (DPDP 2023 §9(3)).
--
-- 1. delete_account_data(profile): wipes a user's personal data. Called ONLY by
--    the `delete-account` edge function (service role), which then removes their
--    uploaded files and closes the login. Sporting records are kept so other
--    people's match histories and standings stay correct, but they show
--    "Deleted player" and no longer link to anyone.
--
-- 2. analytics_actor(): analytics never stores the profile id (or device/session
--    ids) of an under-18 user, or of anyone whose age is unknown. Their actions
--    still count in totals, anonymously. Replaces the stamping in 0029.

-- ---------- 1. account deletion --------------------------------------------

create or replace function delete_account_data(p_profile uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  my_players uuid[];
  n_players int;
begin
  if p_profile is null then raise exception 'profile required'; end if;
  select coalesce(array_agg(id), '{}') into my_players from players where profile_id = p_profile;
  n_players := cardinality(my_players);

  -- Sporting identities: keep the row (stats, lineups, results point at it),
  -- strip everything personal, unlink from the account.
  update players set
    full_name = 'Deleted player', phone = null, email = null, dob = null, guardian = null,
    bio = null, photo_url = null, city = null, gender = null, sport_details = null,
    verification = null, phone_verified = false, email_verified = false,
    show_phone = false, show_email = false, guardian_profile_id = null,
    jersey_no = null, house_name = null, house_color = null, profile_id = null
  where id = any(my_players);

  -- Children this user was the linked guardian of: unlink (their own account is untouched).
  update players set guardian_profile_id = null where guardian_profile_id = p_profile;

  -- Messages they sent: blank the text (threads stay coherent for the other person).
  update messages set body = '[deleted]' where sender_profile_id = p_profile;

  -- Personal settings, devices, follows, codes.
  delete from push_tokens where profile_id = p_profile;
  delete from follows where follower_id = p_profile;
  delete from user_reminder_prefs where profile_id = p_profile;
  delete from guardian_link_codes where player_id = any(my_players);
  delete from contact_otps where player_id = any(my_players);
  delete from org_members where player_id = any(my_players);

  -- Analytics: detach (rows stay as anonymous counts).
  update analytics_events set profile_id = null, anon_id = null, session_id = null where profile_id = p_profile;
  update client_errors set profile_id = null, anon_id = null, session_id = null where profile_id = p_profile;

  -- The account itself.
  update profiles set
    full_name = 'Deleted user', handle = 'deleted-' || replace(p_profile::text, '-', ''),
    avatar_url = null, dob = null, guardian = null, phone = null, time_zone = null
  where id = p_profile;

  insert into analytics_events (name, source) values ('account_deleted', 'server');
  return jsonb_build_object('players', n_players);
end $$;
revoke all on function delete_account_data(uuid) from public, anon, authenticated;
grant execute on function delete_account_data(uuid) to service_role;

-- ---------- 2. no per-user analytics for children ---------------------------

-- The profile id analytics may store for this user: null if they're under 18
-- or their age is unknown.
create or replace function analytics_actor(p uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select case when p is not null and exists (
    select 1 from profiles where id = p and dob is not null and dob <= (current_date - interval '18 years')
  ) then p end
$$;
revoke all on function analytics_actor(uuid) from public, anon, authenticated;

create or replace function analytics_log(p_name text, p_props jsonb default '{}'::jsonb)
  returns void language plpgsql security definer set search_path = public as $$
begin
  insert into analytics_events (name, profile_id, source, props)
  values (p_name, analytics_actor(auth.uid()), 'server', analytics_clean_props(p_props));
exception when others then
  null;
end $$;
revoke all on function analytics_log(text, jsonb) from public, anon, authenticated;

create or replace function analytics_on_profile()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into analytics_events (name, profile_id, source, props)
  values ('signed_up', analytics_actor(new.id), 'server', '{}'::jsonb);
  return new;
exception when others then
  return new;
end $$;
-- signed_up must see the new row's dob, so fire after insert (it already does);
-- the trigger from 0029 keeps pointing at this function.

create or replace function track_events(p_events jsonb, p_anon_id uuid, p_session_id uuid,
                                        p_platform text, p_app_version text)
  returns int language plpgsql security definer set search_path = public as $$
declare
  e jsonb; n int := 0;
  subject text := coalesce(auth.uid()::text, p_anon_id::text, 'anon');
  actor uuid := analytics_actor(auth.uid());
  -- A signed-in child (or unknown age): no device or session ids either.
  child boolean := auth.uid() is not null and analytics_actor(auth.uid()) is null;
  plat text := case when p_platform in ('ios', 'android', 'web') then p_platform else null end;
  ver text := left(p_app_version, 32);
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  if not rate_limit_hit('track_events', subject, 120, 3600) then return 0; end if;
  for e in select * from jsonb_array_elements(p_events) limit 50 loop
    continue when jsonb_typeof(e) <> 'object';
    continue when coalesce(e->>'name', '') not in
      ('app_open', 'screen_view', 'share_link', 'install_prompt', 'sign_in', 'sign_out', 'onboarding_step', 'feedback_sent');
    insert into analytics_events (at, name, profile_id, anon_id, session_id, source, platform, app_version, props)
    values (
      coalesce(case when (e->>'at') ~ '^\d{4}-\d{2}-\d{2}T'
                     and (e->>'at')::timestamptz between now() - interval '7 days' and now() + interval '5 minutes'
                    then (e->>'at')::timestamptz end, now()),
      e->>'name', actor,
      case when child then null else p_anon_id end,
      case when child then null else p_session_id end,
      'client', plat, ver, analytics_clean_props(e->'props'));
    n := n + 1;
  end loop;
  if random() < 0.001 then
    delete from analytics_events where at < now() - interval '13 months';
    delete from client_errors where at < now() - interval '13 months';
  end if;
  return n;
exception when others then
  return n;
end $$;
revoke all on function track_events(jsonb, uuid, uuid, text, text) from public;
grant execute on function track_events(jsonb, uuid, uuid, text, text) to anon, authenticated;

create or replace function report_client_error(p_message text, p_stack text, p_fatal boolean,
                                               p_screen text, p_anon_id uuid, p_session_id uuid,
                                               p_platform text, p_app_version text)
  returns boolean language plpgsql security definer set search_path = public as $$
declare
  subject text := coalesce(auth.uid()::text, p_anon_id::text, 'anon');
  actor uuid := analytics_actor(auth.uid());
  child boolean := auth.uid() is not null and analytics_actor(auth.uid()) is null;
  msg text; stk text;
begin
  if coalesce(p_message, '') = '' then return false; end if;
  if not rate_limit_hit('client_errors', subject, 30, 3600) then return false; end if;
  msg := regexp_replace(regexp_replace(left(p_message, 500),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g'), '\d{7,}', '<num>', 'g');
  stk := regexp_replace(regexp_replace(left(p_stack, 4000),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g'), '\d{7,}', '<num>', 'g');
  insert into client_errors (profile_id, anon_id, session_id, platform, app_version, fatal, screen, message, stack, fingerprint)
  values (actor,
          case when child then null else p_anon_id end,
          case when child then null else p_session_id end,
          case when p_platform in ('ios', 'android', 'web') then p_platform else null end,
          left(p_app_version, 32), coalesce(p_fatal, false), left(p_screen, 64), msg, stk,
          md5(regexp_replace(msg || '|' || coalesce(split_part(stk, E'\n', 2), ''), '\d+', '#', 'g')));
  return true;
exception when others then
  return false;
end $$;
revoke all on function report_client_error(text, text, boolean, text, uuid, uuid, text, text) from public;
grant execute on function report_client_error(text, text, boolean, text, uuid, uuid, text, text) to anon, authenticated;

-- Existing rows: detach any child / unknown-age profile ids recorded since 0029.
update analytics_events set profile_id = null, anon_id = null, session_id = null
  where profile_id is not null and analytics_actor(profile_id) is null;
update client_errors set profile_id = null, anon_id = null
  where profile_id is not null and analytics_actor(profile_id) is null;
