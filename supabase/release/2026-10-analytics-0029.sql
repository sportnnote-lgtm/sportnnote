-- Release 2026-10 analytics: migration 0029 (first-party analytics + crash reporting).
-- Paste the whole file into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0029 — First-party product analytics + crash reporting.
--
-- Why first-party (not PostHog/Sentry yet): it ships to installed apps by OTA
-- update (no native module), works on web, costs nothing, and no third party
-- receives data about users — several of whom are minors (DPDP 2023).
--
-- Privacy rules:
--   * No names, phones, emails or free text in events. The actor is the
--     pseudonymous profile id, stamped server-side (never client-supplied).
--   * Clients can only WRITE, through validated RPCs; nothing is readable by
--     anon/authenticated. KPIs are read by staff (SQL editor / service role).
--   * Raw rows are kept 13 months, then purged.
--
-- Two sources of events:
--   1. Database triggers record the core actions (match created / started /
--      completed, tournament created, golf round, message sent, sign-up,
--      phone verified). These fire however the write arrives — web, any APK
--      version, offline outbox — so the KPIs don't depend on app instrumentation.
--   2. The app sends a small allow-listed set (app_open, screen_view, …) and
--      error reports via track_events() / report_client_error().

-- ---------- tables ----------------------------------------------------------

create table if not exists analytics_events (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  name        text not null,
  profile_id  uuid,              -- auth.uid() of the actor; null when signed out
  anon_id     uuid,              -- random per-install id (client events only)
  session_id  uuid,
  source      text not null check (source in ('server', 'client')),
  platform    text,              -- ios | android | web
  app_version text,
  props       jsonb not null default '{}'::jsonb
);
create index if not exists analytics_events_at_idx on analytics_events (at);
create index if not exists analytics_events_name_at_idx on analytics_events (name, at);
create index if not exists analytics_events_profile_idx on analytics_events (profile_id, at);

create table if not exists client_errors (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  profile_id  uuid,
  anon_id     uuid,
  session_id  uuid,
  platform    text,
  app_version text,
  fatal       boolean not null default false,
  screen      text,
  message     text not null,
  stack       text,
  fingerprint text not null       -- groups identical errors
);
create index if not exists client_errors_at_idx on client_errors (at);
create index if not exists client_errors_fp_idx on client_errors (fingerprint, at);

alter table analytics_events enable row level security;
alter table client_errors enable row level security;
-- No policies: clients cannot read or write these tables directly.
revoke all on analytics_events, client_errors from anon, authenticated;
revoke all on sequence analytics_events_id_seq, client_errors_id_seq from anon, authenticated;

-- ---------- helpers ---------------------------------------------------------

-- Keep only short, non-identifying scalar props: ≤ 12 keys, keys a-z0-9_,
-- strings clipped to 64 chars, and nothing whose key suggests personal data.
create or replace function analytics_clean_props(p jsonb)
  returns jsonb language plpgsql immutable set search_path = public as $$
declare
  out jsonb := '{}'::jsonb;
  k text; v jsonb; n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return out; end if;
  for k, v in select * from jsonb_each(p) loop
    exit when n >= 12;
    continue when k !~ '^[a-z][a-z0-9_]{0,31}$';
    continue when k ~ '(name|phone|email|mail|address|dob|birth|message|body|text|token|code|password)';
    if jsonb_typeof(v) = 'string' then
      out := out || jsonb_build_object(k, left(v #>> '{}', 64));
    elsif jsonb_typeof(v) in ('number', 'boolean') then
      out := out || jsonb_build_object(k, v);
    else
      continue;
    end if;
    n := n + 1;
  end loop;
  return out;
end $$;

create or replace function analytics_log(p_name text, p_props jsonb default '{}'::jsonb)
  returns void language plpgsql security definer set search_path = public as $$
begin
  insert into analytics_events (name, profile_id, source, props)
  values (p_name, auth.uid(), 'server', analytics_clean_props(p_props));
exception when others then
  -- Analytics must never break the write that triggered it.
  null;
end $$;
revoke all on function analytics_log(text, jsonb) from public, anon, authenticated;

-- ---------- server-side event triggers --------------------------------------

create or replace function analytics_on_match()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  kind text := case when new.tournament_id is null then 'friendly' else 'tournament' end;
begin
  if tg_op = 'INSERT' then
    perform analytics_log('match_created', jsonb_build_object('sport', new.sport, 'kind', kind, 'match_id', new.id::text));
  elsif new.status is distinct from old.status then
    if new.status = 'live' and old.status = 'scheduled' then
      perform analytics_log('match_started', jsonb_build_object('sport', new.sport, 'kind', kind, 'match_id', new.id::text));
    elsif new.status = 'completed' then
      perform analytics_log('match_completed', jsonb_build_object('sport', new.sport, 'kind', kind, 'match_id', new.id::text));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists analytics_match on matches;
create trigger analytics_match after insert or update of status on matches
  for each row execute function analytics_on_match();

create or replace function analytics_on_tournament()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform analytics_log('tournament_created', jsonb_build_object(
    'sports', array_to_string(new.sports, ','), 'org_hosted', new.host_org_id is not null,
    'tournament_id', new.id::text));
  return new;
end $$;
drop trigger if exists analytics_tournament on tournaments;
create trigger analytics_tournament after insert on tournaments
  for each row execute function analytics_on_tournament();

create or replace function analytics_on_field_event()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  kind text := case when new.tournament_id is null then 'friendly' else 'tournament' end;
begin
  if tg_op = 'INSERT' then
    perform analytics_log('round_created', jsonb_build_object('sport', new.sport, 'kind', kind, 'event_id', new.id::text));
  elsif new.status is distinct from old.status and new.status = 'completed' then
    perform analytics_log('round_completed', jsonb_build_object('sport', new.sport, 'kind', kind, 'event_id', new.id::text));
  end if;
  return new;
end $$;
drop trigger if exists analytics_field_event on field_events;
create trigger analytics_field_event after insert or update of status on field_events
  for each row execute function analytics_on_field_event();

create or replace function analytics_on_message()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform analytics_log('message_sent', '{}'::jsonb);
  return new;
end $$;
drop trigger if exists analytics_message on messages;
create trigger analytics_message after insert on messages
  for each row execute function analytics_on_message();

create or replace function analytics_on_profile()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The actor of a sign-up is the new profile itself.
  insert into analytics_events (name, profile_id, source, props)
  values ('signed_up', new.id, 'server', '{}'::jsonb);
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists analytics_profile on profiles;
create trigger analytics_profile after insert on profiles
  for each row execute function analytics_on_profile();

create or replace function analytics_on_player_verify()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone_verified and not coalesce(old.phone_verified, false) then
    perform analytics_log('phone_verified', '{}'::jsonb);
  end if;
  if new.email_verified and not coalesce(old.email_verified, false) then
    perform analytics_log('email_verified', '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists analytics_player_verify on players;
create trigger analytics_player_verify after update of phone_verified, email_verified on players
  for each row execute function analytics_on_player_verify();

-- ---------- client RPCs -----------------------------------------------------

-- Batch of client events. Only allow-listed names; profile id is stamped from
-- the JWT. Silently drops anything invalid (analytics never errors the app).
create or replace function track_events(p_events jsonb, p_anon_id uuid, p_session_id uuid,
                                        p_platform text, p_app_version text)
  returns int language plpgsql security definer set search_path = public as $$
declare
  e jsonb; n int := 0;
  subject text := coalesce(auth.uid()::text, p_anon_id::text, 'anon');
  plat text := case when p_platform in ('ios', 'android', 'web') then p_platform else null end;
  ver text := left(p_app_version, 32);
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  if not rate_limit_hit('track_events', subject, 120, 3600) then return 0; end if;
  for e in select * from jsonb_array_elements(p_events) limit 50 loop
    continue when jsonb_typeof(e) <> 'object';
    continue when coalesce(e->>'name', '') not in
      ('app_open', 'screen_view', 'share_link', 'install_prompt', 'sign_in', 'sign_out', 'onboarding_step');
    insert into analytics_events (at, name, profile_id, anon_id, session_id, source, platform, app_version, props)
    values (
      -- Accept the client timestamp only if it's plausible (queued offline ≤ 7 days).
      coalesce(case when (e->>'at') ~ '^\d{4}-\d{2}-\d{2}T'
                     and (e->>'at')::timestamptz between now() - interval '7 days' and now() + interval '5 minutes'
                    then (e->>'at')::timestamptz end, now()),
      e->>'name', auth.uid(), p_anon_id, p_session_id, 'client', plat, ver,
      analytics_clean_props(e->'props'));
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

-- One error report. Messages/stacks are clipped; emails and long digit runs
-- (phone numbers) are masked in case an error message echoed user input.
create or replace function report_client_error(p_message text, p_stack text, p_fatal boolean,
                                               p_screen text, p_anon_id uuid, p_session_id uuid,
                                               p_platform text, p_app_version text)
  returns boolean language plpgsql security definer set search_path = public as $$
declare
  subject text := coalesce(auth.uid()::text, p_anon_id::text, 'anon');
  msg text; stk text;
begin
  if coalesce(p_message, '') = '' then return false; end if;
  if not rate_limit_hit('client_errors', subject, 30, 3600) then return false; end if;
  msg := regexp_replace(regexp_replace(left(p_message, 500),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g'), '\d{7,}', '<num>', 'g');
  stk := regexp_replace(regexp_replace(left(p_stack, 4000),
           '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '<email>', 'g'), '\d{7,}', '<num>', 'g');
  insert into client_errors (profile_id, anon_id, session_id, platform, app_version, fatal, screen, message, stack, fingerprint)
  values (auth.uid(), p_anon_id, p_session_id,
          case when p_platform in ('ios', 'android', 'web') then p_platform else null end,
          left(p_app_version, 32), coalesce(p_fatal, false), left(p_screen, 64), msg, stk,
          -- Same message + top stack frame (numbers stripped) = same error.
          md5(regexp_replace(msg || '|' || coalesce(split_part(stk, E'\n', 2), ''), '\d+', '#', 'g')));
  return true;
exception when others then
  return false;
end $$;
revoke all on function report_client_error(text, text, boolean, text, uuid, uuid, text, text) from public;
grant execute on function report_client_error(text, text, boolean, text, uuid, uuid, text, text) to anon, authenticated;

-- ---------- KPI views (staff only: SQL editor / service role) ----------------

-- Weekly pilot KPIs (weeks start Monday, IST).
create or replace view kpi_weekly as
with ev as (
  select date_trunc('week', at at time zone 'Asia/Kolkata')::date as week, name, profile_id, props
  from analytics_events
)
select week,
  count(distinct profile_id) filter (where name in ('app_open', 'screen_view'))            as active_users,
  count(distinct profile_id) filter (where name in ('tournament_created', 'match_created', 'round_created')) as active_organisers,
  count(distinct profile_id) filter (where name in ('match_started', 'match_completed', 'round_completed')) as active_scorers,
  count(*) filter (where name = 'signed_up')                                               as sign_ups,
  count(*) filter (where name = 'match_completed')                                         as matches_completed,
  count(*) filter (where name = 'round_completed')                                         as golf_rounds_completed,
  count(*) filter (where name = 'tournament_created')                                      as tournaments_created,
  count(*) filter (where name = 'message_sent')                                            as messages_sent
from ev group by week order by week desc;

-- Matches completed per sport per week (pilot KPI: which sports friends play).
create or replace view kpi_sport_weekly as
select date_trunc('week', at at time zone 'Asia/Kolkata')::date as week, props->>'sport' as sport,
  count(*) filter (where name = 'match_completed') as matches_completed,
  count(*) filter (where name = 'round_completed') as rounds_completed
from analytics_events
where name in ('match_completed', 'round_completed')
group by 1, 2 order by 1 desc, 3 desc;

-- Activation: of each sign-up week, how many scored (started/completed) a
-- match or round within 7 days.
create or replace view kpi_activation as
with s as (
  select profile_id, min(at) as signed_up_at from analytics_events where name = 'signed_up' group by profile_id
)
select date_trunc('week', s.signed_up_at at time zone 'Asia/Kolkata')::date as signup_week,
  count(*) as sign_ups,
  count(*) filter (where exists (
    select 1 from analytics_events e
    where e.profile_id = s.profile_id
      and e.name in ('match_started', 'match_completed', 'round_completed')
      and e.at between s.signed_up_at and s.signed_up_at + interval '7 days')) as activated_7d
from s group by 1 order by 1 desc;

-- 4-week scorer retention: of people who first scored in week W, how many
-- scored again in week W+4.
create or replace view kpi_scorer_retention as
with sc as (
  select profile_id, date_trunc('week', at at time zone 'Asia/Kolkata')::date as week
  from analytics_events
  where profile_id is not null and name in ('match_started', 'match_completed', 'round_completed')
  group by 1, 2
), first_week as (
  select profile_id, min(week) as cohort from sc group by profile_id
)
select f.cohort, count(*) as scorers,
  count(*) filter (where exists (select 1 from sc where sc.profile_id = f.profile_id and sc.week = f.cohort + 28)) as retained_week4
from first_week f group by f.cohort order by f.cohort desc;

-- Crash-free sessions per day (a session = an app_open session id).
create or replace view kpi_crash_free as
with sessions as (
  select (at at time zone 'Asia/Kolkata')::date as day, session_id, platform
  from analytics_events where name = 'app_open' and session_id is not null
), crashed as (
  select distinct session_id from client_errors where fatal and session_id is not null
)
select day, platform, count(*) as sessions,
  count(*) filter (where session_id in (select session_id from crashed)) as crashed,
  round(100.0 * (1 - count(*) filter (where session_id in (select session_id from crashed))::numeric / greatest(count(*), 1)), 2) as crash_free_pct
from sessions group by day, platform order by day desc, platform;

-- Top errors in the last 14 days.
create or replace view errors_top as
select fingerprint, max(message) as message, count(*) as occurrences,
  count(distinct coalesce(profile_id, anon_id)) as users,
  bool_or(fatal) as any_fatal, max(at) as last_seen,
  string_agg(distinct platform, ',') as platforms, max(app_version) as latest_version,
  (array_agg(stack order by at desc))[1] as sample_stack,
  (array_agg(screen order by at desc))[1] as last_screen
from client_errors
where at > now() - interval '14 days'
group by fingerprint order by occurrences desc;

revoke all on kpi_weekly, kpi_sport_weekly, kpi_activation, kpi_scorer_retention, kpi_crash_free, errors_top
  from public, anon, authenticated;
grant select on kpi_weekly, kpi_sport_weekly, kpi_activation, kpi_scorer_retention, kpi_crash_free, errors_top
  to service_role;

commit;
