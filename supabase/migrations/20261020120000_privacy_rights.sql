-- ============================================================================
--  SD-152 · Privacy rights for international markets (legal audit L4, L9, L10,
--  L11, L14, L21). Idempotent — safe to re-run. Needs 0025 (is_client_request,
--  rate_limit_hit), 0027 (guardian link), 0029/0030 (analytics), and works with
--  or without 20261019124600_protect_minors.
--
--  NOT LEGAL ADVICE. The rules below are the founder's product defaults, drafted
--  for a lawyer's review (docs/international/legal-draft.md).
--
--  INDIA IS UNCHANGED. Everything that limits an account keys off the sign-up
--  country the app sends (device setting). India — and any sign-up with no
--  country (older app builds) — keeps today's flow: the guardian's consent is the
--  checkbox at sign-up ('self_declared'), and nothing is limited.
--
--  1. profiles gains: signup_country, analytics_opt_out, guardian_consent
--     ('self_declared' | 'pending' | 'confirmed' | 'withdrawn'), guardian_consent_at,
--     guardian_consent_method, consent_withdrawn_at. Clients can't write the
--     consent columns (only the RPCs below).
--  2. Sign-up (BEFORE INSERT on profiles — independent of handle_new_user()):
--       • US + under 13 → refused (no self sign-up until a COPPA verification
--         vendor is contracted; a parent adds the child instead). A sign-up with
--         no country but a +1 mobile is treated as US for this rule.
--       • under 18 outside India → 'pending' until the guardian confirms.
--  3. Guardian confirmation: a one-time code/link emailed to the guardian (edge
--     function guardian-consent). guardian_consent_preview / _decide work
--     without an account. Approving while signed in to an adult account also
--     links that account as the guardian.
--  4. Limited state (pending or withdrawn, while under 18): nobody can follow the
--     child, the child can't follow anyone, and no messages about the child are
--     sent. Hooks minor_account_limited() / player_account_limited() are there for
--     the visibility rules (players_view) to use as well.
--  5. Guardian rights (linked guardian account): list children, view + export
--     their data, confirm, withdraw consent (locks; deleted after 30 days unless
--     re-confirmed), and delete (via the delete-account edge function).
--  6. "Download my data": export_my_data() — JSON of the account, players, stat
--     lines, messages sent, follows, memberships, consents.
--  7. ID-proof retention: due_verification_docs() / mark_verification_doc_deleted()
--     for the privacy-retention edge function (daily cron): documents are removed
--     30 days after the review decision; only "verified on <date> by <reviewer>"
--     is kept.
--  8. Analytics consent: set_analytics_consent(); analytics_actor() returns null
--     for anyone who chose "Essential only" (their actions count anonymously).
-- ============================================================================


-- ---------- 1. Columns + consent log ------------------------------------------

alter table profiles add column if not exists signup_country text;
alter table profiles add column if not exists analytics_opt_out boolean not null default false;
alter table profiles add column if not exists guardian_consent text;
alter table profiles add column if not exists guardian_consent_at timestamptz;
alter table profiles add column if not exists guardian_consent_method text;
alter table profiles add column if not exists consent_withdrawn_at timestamptz;

alter table profiles drop constraint if exists profiles_guardian_consent_check;
alter table profiles add constraint profiles_guardian_consent_check
  check (guardian_consent is null or guardian_consent in ('self_declared', 'pending', 'confirmed', 'withdrawn'));

-- Every consent decision, append-only (shown in the data export; evidence for
-- regulators). No client access — read through export_my_data().
create table if not exists consent_log (
  id               bigint generated always as identity primary key,
  profile_id       uuid references profiles(id) on delete cascade,
  player_id        uuid references players(id) on delete set null,
  kind             text not null check (kind in ('guardian_consent', 'analytics')),
  event            text not null,
  method           text,
  actor_profile_id uuid references profiles(id) on delete set null,
  at               timestamptz not null default now()
);
create index if not exists consent_log_profile_idx on consent_log (profile_id, at);
alter table consent_log enable row level security;
revoke all on consent_log from anon, authenticated;

-- One open guardian-confirmation code per child account (hashed; 7 days).
create table if not exists guardian_consent_requests (
  profile_id   uuid primary key references profiles(id) on delete cascade,
  code_hash    text not null unique,
  target_email text not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
alter table guardian_consent_requests enable row level security;
revoke all on guardian_consent_requests from anon, authenticated;


-- ---------- 2. Region rules -----------------------------------------------------

-- Mirrors src/core/privacyRegion.ts → guardianConfirmRequired(). India (and an
-- unknown country = older app builds, all Indian today) keeps the sign-up checkbox.
create or replace function guardian_confirm_required(p_country text)
  returns boolean language sql immutable set search_path = public as $$
  select p_country is not null and upper(p_country) <> 'IN';
$$;

-- Under 18 by sign-up DOB (unknown DOB → not treated as limited here; the
-- visibility rules already treat unknown ages as possible minors).
create or replace function profile_is_minor(p_dob date)
  returns boolean language sql stable set search_path = public as $$
  select p_dob is not null and p_dob > (current_date - interval '18 years')::date;
$$;

-- Is this ACCOUNT in the limited state (guardian hasn't confirmed / withdrew)?
-- Lifts automatically at 18.
create or replace function minor_account_limited(p_profile uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select pr.guardian_consent in ('pending', 'withdrawn') and profile_is_minor(pr.dob)
      from profiles pr where pr.id = p_profile), false);
$$;
revoke all on function minor_account_limited(uuid) from public, anon;
grant execute on function minor_account_limited(uuid) to authenticated;  -- used in a follows policy

-- …for a player row (its linked account).
create or replace function player_account_limited(p_player uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select minor_account_limited(p.profile_id) from players p
     where p.id = p_player and p.profile_id is not null), false);
$$;
revoke all on function player_account_limited(uuid) from public, anon;
grant execute on function player_account_limited(uuid) to authenticated;  -- used in a follows policy


-- ---------- 3. Sign-up rules + column guard -------------------------------------

create or replace function privacy_on_new_profile()
  returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  meta jsonb;
  cc   text;
  nanp boolean;
  ph   text;
  yrs  int;
begin
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into meta from auth.users u where u.id = new.id;
  meta := coalesce(meta, '{}'::jsonb);

  -- Consent state is never taken from a client.
  new.guardian_consent := null; new.guardian_consent_at := null;
  new.guardian_consent_method := null; new.consent_withdrawn_at := null;

  cc := upper(coalesce(nullif(meta->>'country', ''), ''));
  if cc !~ '^[A-Z]{2}$' then cc := null; end if;
  -- No country sent (older build, or phone sign-up): read it from an
  -- international mobile number. +1 is shared by the US and Canada, so it isn't
  -- stored as a country, but the US under-13 rule still applies (conservative).
  ph := coalesce(nullif(meta->>'phone', ''), new.phone, '');
  if cc is null then
    cc := case when ph ~ '^\+91' then 'IN' when ph ~ '^\+44' then 'GB' when ph ~ '^\+971' then 'AE'
               when ph ~ '^\+974' then 'QA' when ph ~ '^\+65' then 'SG' when ph ~ '^\+60' then 'MY'
               when ph ~ '^\+61' then 'AU' end;
    nanp := cc is null and ph ~ '^\+1\d{10}$';
  else
    nanp := false;
  end if;
  new.signup_country := cc;
  -- "Essential only" chosen on the device before signing up.
  if meta->>'analytics' = 'denied' then new.analytics_opt_out := true; end if;

  if new.dob is not null then
    yrs := extract(year from age(current_date, new.dob))::int;
    if yrs < 13 and (cc = 'US' or nanp) then
      raise exception 'US_UNDER_13: In the US, children under 13 can''t create their own account. A parent or guardian can add them as a player from the parent''s account.'
        using errcode = '42501';
    end if;
    if yrs < 18 then
      if guardian_confirm_required(cc) or nanp then
        new.guardian_consent := 'pending';
      else
        new.guardian_consent := 'self_declared';
        new.guardian_consent_at := now();
        new.guardian_consent_method := 'signup_checkbox';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists privacy_on_new_profile on profiles;
create trigger privacy_on_new_profile before insert on profiles
  for each row execute function privacy_on_new_profile();

-- Log the sign-up consent once the profile exists.
create or replace function privacy_log_new_profile()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.guardian_consent is not null then
    insert into consent_log (profile_id, kind, event, method)
    values (new.id, 'guardian_consent', new.guardian_consent, coalesce(new.guardian_consent_method, 'signup'));
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists privacy_log_new_profile on profiles;
create trigger privacy_log_new_profile after insert on profiles
  for each row execute function privacy_log_new_profile();

-- Clients can't change the consent columns or the sign-up country by UPDATE.
create or replace function guard_privacy_columns()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  new.signup_country := old.signup_country;
  new.guardian_consent := old.guardian_consent;
  new.guardian_consent_at := old.guardian_consent_at;
  new.guardian_consent_method := old.guardian_consent_method;
  new.consent_withdrawn_at := old.consent_withdrawn_at;
  return new;
end $$;
drop trigger if exists guard_privacy_columns on profiles;
create trigger guard_privacy_columns before update on profiles
  for each row execute function guard_privacy_columns();


-- ---------- 4. Limited state: follows + messages --------------------------------

drop policy if exists "guardian pending: no follows" on follows;
create policy "guardian pending: no follows" on follows as restrictive for insert to authenticated
  with check (not minor_account_limited(auth.uid())
              and (target_type <> 'player' or not player_account_limited(target_id)));

create or replace function guard_message_limited_minor()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  subj uuid;
begin
  select subject_player_id into subj from message_threads where id = new.thread_id;
  if subj is not null and player_account_limited(subj) then
    raise exception 'This player''s account is waiting for a parent or guardian to confirm it, so messages are off for now.'
      using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_message_limited_minor on messages;
create trigger guard_message_limited_minor before insert on messages
  for each row execute function guard_message_limited_minor();


-- ---------- 5. My privacy status --------------------------------------------------

create or replace function my_privacy_status()
  returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'country', pr.signup_country,
      'minor', profile_is_minor(pr.dob),
      'guardianConsent', pr.guardian_consent,
      'guardianConsentAt', pr.guardian_consent_at,
      'limited', minor_account_limited(pr.id),
      'analyticsOptOut', pr.analytics_opt_out,
      -- a masked hint so the child knows where the email went (a***@gmail.com)
      'guardianEmailHint', (select regexp_replace(e, '^(.)[^@]*', '\1***')
                              from (select coalesce((select p.guardian->>'email' from players p where p.profile_id = pr.id
                                        and coalesce(p.guardian->>'email', '') <> '' order by p.created_at limit 1),
                                      nullif(pr.guardian->>'email', '')) as e) x
                             where e is not null),
      'pendingRequestSentAt', (select created_at from guardian_consent_requests r where r.profile_id = pr.id),
      -- players an organiser created before this person joined (notice + rights)
      'addedBy', coalesce((
        select jsonb_agg(jsonb_build_object('playerId', p.id, 'addedAt', p.created_at,
                                            'addedByName', coalesce(ap.full_name, 'An organiser')))
          from players p left join profiles ap on ap.id = p.created_by
         where p.profile_id = pr.id and p.created_by is not null and p.created_by <> pr.id), '[]'::jsonb),
      'guardianOf', (select count(*) from players p where p.guardian_profile_id = pr.id)
    ) from profiles pr where pr.id = auth.uid()) end;
$$;
revoke all on function my_privacy_status() from public, anon;
grant execute on function my_privacy_status() to authenticated;


-- ---------- 6. Guardian confirmation (email code / link) -------------------------

-- Service role (guardian-consent edge function): mint a code for a pending child
-- account; returns { code, email, childName } once.
create or replace function create_guardian_consent_code(p_profile uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18];
  code text := '';
  i int;
  pr profiles;
  email text;
begin
  select * into pr from profiles where id = p_profile;
  if pr.id is null then raise exception 'no profile'; end if;
  if pr.guardian_consent is distinct from 'pending' and pr.guardian_consent is distinct from 'withdrawn' then
    raise exception 'No guardian confirmation is needed for this account.';
  end if;
  -- The player profile's guardian (editable in Edit profile) wins over the
  -- sign-up copy on the account.
  email := coalesce((select p.guardian->>'email' from players p where p.profile_id = pr.id
                      and coalesce(p.guardian->>'email', '') <> '' order by p.created_at limit 1),
                    nullif(pr.guardian->>'email', ''));
  if coalesce(email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Add your parent or guardian''s email first.';
  end if;
  foreach i in array idx loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  insert into guardian_consent_requests (profile_id, code_hash, target_email, expires_at)
  values (p_profile, encode(sha256(convert_to(code, 'UTF8')), 'hex'), lower(email), now() + interval '7 days')
  on conflict (profile_id) do update
    set code_hash = excluded.code_hash, target_email = excluded.target_email,
        expires_at = excluded.expires_at, created_at = now();
  insert into consent_log (profile_id, kind, event, method) values (p_profile, 'guardian_consent', 'requested', 'email_link');
  return jsonb_build_object('code', code, 'email', lower(email), 'childName', pr.full_name);
end $$;
revoke all on function create_guardian_consent_code(uuid) from public, anon, authenticated;
grant execute on function create_guardian_consent_code(uuid) to service_role;

create or replace function guardian_consent_lookup(p_code text)
  returns guardian_consent_requests language sql stable security definer set search_path = public as $$
  select * from guardian_consent_requests
   where code_hash = encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex')
     and expires_at > now();
$$;
revoke all on function guardian_consent_lookup(text) from public, anon, authenticated;

-- Anyone holding the code (the guardian, no account needed): what is being asked.
-- Only the child's first name and an age band — nothing else.
create or replace function guardian_consent_preview(p_code text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r guardian_consent_requests;
  pr profiles;
  yrs int;
begin
  r := guardian_consent_lookup(p_code);
  if r.profile_id is null then raise exception 'That link or code isn''t valid or has expired. Ask your child to send a new one from the app.'; end if;
  select * into pr from profiles where id = r.profile_id;
  yrs := case when pr.dob is null then null else extract(year from age(current_date, pr.dob))::int end;
  return jsonb_build_object(
    'childFirstName', split_part(trim(pr.full_name), ' ', 1),
    'ageBand', case when yrs is null then null when yrs < 13 then 'under 13' else '13 to 17' end,
    'status', pr.guardian_consent,
    'expiresAt', r.expires_at);
end $$;
revoke all on function guardian_consent_preview(text) from public;
grant execute on function guardian_consent_preview(text) to anon, authenticated;

-- The guardian's decision. Approve → 'confirmed' (account unlocked). Decline →
-- 'withdrawn' (locked; deleted after 30 days by the privacy-retention job).
-- If the guardian is signed in to their own adult account, approving also links
-- it as the child's guardian account (messages about the child go there).
create or replace function guardian_consent_decide(p_code text, p_approve boolean, p_guardian_name text default null)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r guardian_consent_requests;
  me uuid := auth.uid();
  linked boolean := false;
  a int;
  gname text := left(trim(coalesce(p_guardian_name, '')), 80);
begin
  -- Codes are 16 characters (80 bits), so guessing is hopeless; signed-in callers
  -- are still capped.
  if me is not null and not rate_limit_hit('guardian-consent-decide', me::text, 20, 3600) then
    raise exception 'Too many attempts — try again in an hour' using errcode = '54000';
  end if;
  r := guardian_consent_lookup(p_code);
  if r.profile_id is null then raise exception 'That link or code isn''t valid or has expired. Ask your child to send a new one from the app.'; end if;
  if me = r.profile_id then
    raise exception 'This has to be done by your parent or guardian, not from your own account.' using errcode = '42501';
  end if;

  perform set_config('app.trusted_rpc', 'on', true);
  if p_approve then
    update profiles set guardian_consent = 'confirmed', guardian_consent_at = now(),
           guardian_consent_method = 'email_link', consent_withdrawn_at = null,
           guardian = coalesce(guardian, '{}'::jsonb)
                      || jsonb_build_object('confirmedAt', now(), 'emailVerified', true)
                      || case when gname <> '' then jsonb_build_object('confirmedName', gname) else '{}'::jsonb end
     where id = r.profile_id;
    -- The code reached the guardian email on file → it's verified.
    update players set guardian = coalesce(guardian, '{}'::jsonb) || '{"emailVerified": true}'::jsonb
     where profile_id = r.profile_id and lower(coalesce(guardian->>'email', '')) = r.target_email;
    if me is not null then
      a := profile_age(me);
      if a is null or a >= 18 then
        update players set guardian_profile_id = me
         where profile_id = r.profile_id and lower(coalesce(guardian->>'email', '')) = r.target_email;
        update message_threads t set recipient_profile_id = me
          from players p where p.id = t.subject_player_id and p.profile_id = r.profile_id and t.via_guardian;
        linked := exists (select 1 from players where profile_id = r.profile_id and guardian_profile_id = me);
      end if;
    end if;
  else
    update profiles set guardian_consent = 'withdrawn', consent_withdrawn_at = now(),
           guardian_consent_method = 'email_link'
     where id = r.profile_id;
  end if;
  perform set_config('app.trusted_rpc', 'off', true);

  insert into consent_log (profile_id, kind, event, method, actor_profile_id)
  values (r.profile_id, 'guardian_consent', case when p_approve then 'confirmed' else 'declined' end, 'email_link', me);
  delete from guardian_consent_requests where profile_id = r.profile_id;
  return jsonb_build_object('status', case when p_approve then 'confirmed' else 'withdrawn' end, 'linked', linked);
end $$;
revoke all on function guardian_consent_decide(text, boolean, text) from public;
grant execute on function guardian_consent_decide(text, boolean, text) to anon, authenticated;


-- ---------- 7. Data export --------------------------------------------------------

-- Everything we hold about one account, as JSON. Internal: export_my_data() and
-- guardian_export_child() decide who may call it.
create or replace function export_profile_data(p_profile uuid)
  returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare
  my_players uuid[];
  out jsonb;
begin
  select coalesce(array_agg(id), '{}') into my_players from players where profile_id = p_profile;
  select jsonb_build_object(
    'format', 'sportnnote-export-v1',
    'exportedAt', now(),
    'account', (select to_jsonb(pr) from profiles pr where pr.id = p_profile),
    'login', (select jsonb_build_object(
                'email', case when u.email like '%@phone.sportnnote.in' then null else u.email end,
                'emailConfirmedAt', u.email_confirmed_at,
                'legalAccepted', u.raw_user_meta_data->'legal_accepted')
                from auth.users u where u.id = p_profile),
    'players', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from players p where p.id = any(my_players)), '[]'::jsonb),
    'statLines', coalesce((select jsonb_agg(to_jsonb(s)) from (
                   select * from stat_lines where player_id = any(my_players) order by recorded_at limit 5000) s), '[]'::jsonb),
    'messagesSent', coalesce((select jsonb_agg(jsonb_build_object('threadId', m.thread_id, 'body', m.body, 'at', m.created_at) order by m.created_at)
                     from messages m where m.sender_profile_id = p_profile), '[]'::jsonb),
    'follows', coalesce((select jsonb_agg(jsonb_build_object('type', f.target_type, 'id', f.target_id, 'since', f.created_at))
                from follows f where f.follower_id = p_profile), '[]'::jsonb),
    'memberships', coalesce((select jsonb_agg(to_jsonb(om)) from org_members om where om.player_id = any(my_players)), '[]'::jsonb),
    'guardianOf', coalesce((select jsonb_agg(jsonb_build_object('playerId', p.id, 'name', p.full_name))
                   from players p where p.guardian_profile_id = p_profile), '[]'::jsonb),
    'consents', jsonb_build_object(
      'legalAccepted', (select u.raw_user_meta_data->'legal_accepted' from auth.users u where u.id = p_profile),
      'guardianConsent', (select pr.guardian_consent from profiles pr where pr.id = p_profile),
      'analyticsOptOut', (select pr.analytics_opt_out from profiles pr where pr.id = p_profile),
      'log', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'event', c.event, 'method', c.method, 'at', c.at) order by c.at)
                from consent_log c where c.profile_id = p_profile), '[]'::jsonb))
  ) into out;
  return out;
end $$;
revoke all on function export_profile_data(uuid) from public, anon, authenticated;

create or replace function export_my_data()
  returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not rate_limit_hit('export-my-data', auth.uid()::text, 10, 3600) then
    raise exception 'Too many downloads — try again in an hour' using errcode = '54000';
  end if;
  return export_profile_data(auth.uid());
end $$;
revoke all on function export_my_data() from public, anon;
grant execute on function export_my_data() to authenticated;


-- ---------- 8. Guardian rights (linked guardian account) --------------------------

create or replace function guardian_children()
  returns table (player_id uuid, full_name text, has_account boolean, consent text, limited boolean, age int)
  language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.profile_id is not null, pr.guardian_consent,
         coalesce(minor_account_limited(p.profile_id), false),
         case when coalesce(p.dob, pr.dob) is null then null
              else extract(year from age(current_date, coalesce(p.dob, pr.dob)))::int end
    from players p left join profiles pr on pr.id = p.profile_id
   where auth.uid() is not null and p.guardian_profile_id = auth.uid()
   order by p.full_name;
$$;
revoke all on function guardian_children() from public, anon;
grant execute on function guardian_children() to authenticated;

-- The child's player row, if the caller is its linked guardian.
create or replace function guardian_child_or_raise(p_player uuid)
  returns players language plpgsql stable security definer set search_path = public as $$
declare
  pl players;
begin
  select * into pl from players where id = p_player;
  if pl.id is null or auth.uid() is null or pl.guardian_profile_id is distinct from auth.uid() then
    raise exception 'Only the linked parent or guardian can do this.' using errcode = '42501';
  end if;
  return pl;
end $$;
revoke all on function guardian_child_or_raise(uuid) from public, anon, authenticated;

create or replace function guardian_export_child(p_player uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pl players := guardian_child_or_raise(p_player);
begin
  if not rate_limit_hit('guardian-export', auth.uid()::text, 20, 3600) then
    raise exception 'Too many downloads — try again in an hour' using errcode = '54000';
  end if;
  if pl.profile_id is not null then return export_profile_data(pl.profile_id); end if;
  -- No account yet (added by an organiser): the player record and its stats.
  return jsonb_build_object('format', 'sportnnote-export-v1', 'exportedAt', now(),
    'players', jsonb_build_array(to_jsonb(pl)),
    'statLines', coalesce((select jsonb_agg(to_jsonb(s)) from (
                   select * from stat_lines where player_id = pl.id order by recorded_at limit 5000) s), '[]'::jsonb));
end $$;
revoke all on function guardian_export_child(uuid) from public, anon;
grant execute on function guardian_export_child(uuid) to authenticated;

create or replace function guardian_set_consent(p_player uuid, p_confirm boolean)
  returns text language plpgsql security definer set search_path = public as $$
declare
  pl players := guardian_child_or_raise(p_player);
  st text := case when p_confirm then 'confirmed' else 'withdrawn' end;
begin
  if pl.profile_id is null then
    raise exception 'Your child doesn''t have their own account yet — there is nothing to confirm. You can remove their data instead.';
  end if;
  perform set_config('app.trusted_rpc', 'on', true);
  update profiles set guardian_consent = st, guardian_consent_at = now(),
         guardian_consent_method = 'linked_guardian_account',
         consent_withdrawn_at = case when p_confirm then null else now() end
   where id = pl.profile_id;
  perform set_config('app.trusted_rpc', 'off', true);
  insert into consent_log (profile_id, player_id, kind, event, method, actor_profile_id)
  values (pl.profile_id, pl.id, 'guardian_consent', st, 'linked_guardian_account', auth.uid());
  delete from guardian_consent_requests where profile_id = pl.profile_id;
  return st;
end $$;
revoke all on function guardian_set_consent(uuid, boolean) from public, anon;
grant execute on function guardian_set_consent(uuid, boolean) to authenticated;

-- Service role (delete-account edge function): who to delete when a guardian
-- asks to delete their child's data. Returns {profileId|null, playerId}.
create or replace function guardian_delete_target(p_guardian uuid, p_player uuid)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  pl players;
begin
  select * into pl from players where id = p_player;
  if pl.id is null or p_guardian is null or pl.guardian_profile_id is distinct from p_guardian then
    raise exception 'Only the linked parent or guardian can do this.' using errcode = '42501';
  end if;
  return jsonb_build_object('profileId', pl.profile_id, 'playerId', pl.id);
end $$;
revoke all on function guardian_delete_target(uuid, uuid) from public, anon, authenticated;
grant execute on function guardian_delete_target(uuid, uuid) to service_role;

-- Service role: scrub a player record that has no account (a child an organiser
-- added). Sporting results stay as "Deleted player", like account deletion.
create or replace function scrub_player_personal_data(p_player uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  update players set
    full_name = 'Deleted player', phone = null, email = null, dob = null, guardian = null,
    bio = null, photo_url = null, city = null, gender = null, sport_details = null,
    verification = null, phone_verified = false, email_verified = false,
    show_phone = false, show_email = false, guardian_profile_id = null,
    jersey_no = null, house_name = null, house_color = null
  where id = p_player and profile_id is null;
  delete from guardian_link_codes where player_id = p_player;
  delete from contact_otps where player_id = p_player;
  delete from org_members where player_id = p_player;
  delete from follows where target_type = 'player' and target_id = p_player;
end $$;
revoke all on function scrub_player_personal_data(uuid) from public, anon, authenticated;
grant execute on function scrub_player_personal_data(uuid) to service_role;

-- Service role, after delete_account_data(): drop open consent codes (they hold
-- the guardian's email) and the consent state.
create or replace function privacy_after_delete(p_profile uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  delete from guardian_consent_requests where profile_id = p_profile;
  update profiles set signup_country = null, guardian_consent = null, guardian_consent_at = null,
         guardian_consent_method = null, consent_withdrawn_at = null
   where id = p_profile;
end $$;
revoke all on function privacy_after_delete(uuid) from public, anon, authenticated;
grant execute on function privacy_after_delete(uuid) to service_role;


-- ---------- 9. Retention (privacy-retention edge function, daily) ---------------

-- Reviewed ID proofs whose grace period is over. reviewedAt is stored by the app
-- in milliseconds since 1970.
create or replace function due_verification_docs(p_grace_days int default 30)
  returns table (player_id uuid, doc_path text)
  language sql stable security definer set search_path = public as $$
  select p.id, p.verification->>'docPath'
    from players p
   where p.verification->>'status' in ('approved', 'rejected')
     and coalesce(p.verification->>'docPath', '') <> ''
     and (p.verification->>'reviewedAt') ~ '^\d+$'
     and to_timestamp((p.verification->>'reviewedAt')::bigint / 1000.0) < now() - make_interval(days => greatest(p_grace_days, 0))
   limit 500;
$$;
revoke all on function due_verification_docs(int) from public, anon, authenticated;
grant execute on function due_verification_docs(int) to service_role;

-- After the files are removed: keep only the outcome (status, when, by whom, doc
-- type) and strip file names/paths, including from the history.
create or replace function mark_verification_doc_deleted(p_player uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.trusted_rpc', 'on', true);
  update players set verification =
    (verification - 'docPath' - 'docName')
    || jsonb_build_object('docDeletedAt', (extract(epoch from now()) * 1000)::bigint)
    || jsonb_build_object('history',
         coalesce((select jsonb_agg(h - 'docName') from jsonb_array_elements(
                     case when jsonb_typeof(verification->'history') = 'array' then verification->'history' else '[]'::jsonb end) h), '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object('action', 'doc_deleted', 'at', (extract(epoch from now()) * 1000)::bigint)))
   where id = p_player and verification is not null;
  perform set_config('app.trusted_rpc', 'off', true);
end $$;
revoke all on function mark_verification_doc_deleted(uuid) from public, anon, authenticated;
grant execute on function mark_verification_doc_deleted(uuid) to service_role;

-- Child accounts whose guardian declined or withdrew consent more than N days
-- ago and didn't re-confirm: deleted by the job (account deletion as usual).
create or replace function due_withdrawn_accounts(p_grace_days int default 30)
  returns table (profile_id uuid)
  language sql stable security definer set search_path = public as $$
  select pr.id from profiles pr
   where pr.guardian_consent = 'withdrawn'
     and pr.consent_withdrawn_at < now() - make_interval(days => greatest(p_grace_days, 0))
   limit 100;
$$;
revoke all on function due_withdrawn_accounts(int) from public, anon, authenticated;
grant execute on function due_withdrawn_accounts(int) to service_role;


-- ---------- 10. Analytics consent ------------------------------------------------

create or replace function set_analytics_consent(p_allow boolean)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update profiles set analytics_opt_out = not coalesce(p_allow, false) where id = auth.uid();
  insert into consent_log (profile_id, kind, event, method)
  values (auth.uid(), 'analytics', case when p_allow then 'granted' else 'denied' end, 'settings');
end $$;
revoke all on function set_analytics_consent(boolean) from public, anon;
grant execute on function set_analytics_consent(boolean) to authenticated;

-- 0030's rule plus: nothing is linked to anyone who chose "Essential only".
create or replace function analytics_actor(p uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select case when p is not null and exists (
    select 1 from profiles where id = p and dob is not null and dob <= (current_date - interval '18 years')
      and not coalesce(analytics_opt_out, false)
  ) then p end
$$;
revoke all on function analytics_actor(uuid) from public, anon, authenticated;

-- Error reports from people who chose "Essential only" (or haven't chosen yet in
-- the UK/EU) carry no device id. Rate-limit them per app session instead of one
-- shared "anon" bucket. Otherwise the same as 0030.
create or replace function report_client_error(p_message text, p_stack text, p_fatal boolean,
                                               p_screen text, p_anon_id uuid, p_session_id uuid,
                                               p_platform text, p_app_version text)
  returns boolean language plpgsql security definer set search_path = public as $$
declare
  subject text := coalesce(auth.uid()::text, p_anon_id::text, 'session:' || p_session_id::text, 'anon');
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
