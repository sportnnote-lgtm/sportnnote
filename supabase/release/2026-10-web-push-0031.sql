-- Release 2026-10: migration 0031 (web push subscriptions — iPhone Home Screen notifications).
-- Paste the whole file into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0031 — Web push subscriptions (iPhone Home Screen web app + Android/desktop web).
--
-- iOS 16.4+ delivers push to web apps added to the Home Screen. The browser
-- hands the app a subscription (endpoint + keys); we store it per profile and
-- the edge functions send to it with our VAPID key (functions/_shared/webpush.ts).
--
-- Writes go through RPCs: one browser endpoint belongs to whoever subscribed it
-- LAST (a shared phone switching accounts moves the endpoint, never duplicates).

create table if not exists web_push_subscriptions (
  endpoint     text primary key check (endpoint ~ '^https://'),
  profile_id   uuid not null references profiles(id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_ok_at   timestamptz
);
create index if not exists web_push_subscriptions_profile_idx on web_push_subscriptions (profile_id);
alter table web_push_subscriptions enable row level security;
revoke all on web_push_subscriptions from anon, authenticated;
-- A user may see their own subscriptions (the app shows "notifications on").
drop policy if exists web_push_own_read on web_push_subscriptions;
create policy web_push_own_read on web_push_subscriptions for select to authenticated using (profile_id = auth.uid());
grant select on web_push_subscriptions to authenticated;

create or replace function save_web_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
  returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if not rate_limit_hit('web_push_save', auth.uid()::text, 20, 3600) then return false; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or length(p_p256dh) > 200
     or coalesce(p_auth, '') = '' or length(p_auth) > 100 then
    raise exception 'invalid subscription' using errcode = '22023';
  end if;
  insert into web_push_subscriptions (endpoint, profile_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
  return true;
end $$;
revoke all on function save_web_push_subscription(text, text, text, text) from public, anon;
grant execute on function save_web_push_subscription(text, text, text, text) to authenticated;

create or replace function remove_web_push_subscription(p_endpoint text)
  returns void language sql security definer set search_path = public as $$
  delete from web_push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
$$;
revoke all on function remove_web_push_subscription(text) from public, anon;
grant execute on function remove_web_push_subscription(text) to authenticated;

-- Account deletion (0030) also removes web push subscriptions.
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
  delete from web_push_subscriptions where profile_id = p_profile;
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

commit;
