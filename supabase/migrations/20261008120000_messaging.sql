-- ============================================================================
--  Sportfolio · migration 0027 — In-app messaging (+ guardian accounts)
--  Delta on top of migrations 0001–0026. Idempotent — safe to re-run.
--  PREREQUISITE: 0025 + 0026 (uses their helpers, players_view, rate limiter).
--
--  Lets scouts / coaches / organizers reach a player WITHOUT seeing their number
--  (contact details are private since 0026). Child-safety rules (DPDP Act 2023):
--
--    • Messages about an UNDER-18 player go to their parent/guardian — never to
--      the child's own account. The child's account can't read those threads.
--    • A guardian gets an inbox by LINKING their own SportnNote account to the
--      child: they prove they own the guardian email on file by entering a code
--      we email there. Until linked, a message is delivered to that email (with
--      the code), so the guardian can still be reached.
--    • Only adults (18+) can send. Under-18 accounts can't message anyone.
--    • The sender never learns the guardian's name, email or account.
--    • Recipients can block a sender and report a message; new conversations and
--      messages are rate-limited per sender.
--
--  All writes go through SECURITY DEFINER RPCs (send_message, reply_message,
--  mark_thread_read, block_thread_sender, report_message, claim_guardian_link);
--  clients have read-only access to their own threads/messages. Push / email
--  delivery is done by the `message-notify` and `guardian-link` edge functions.
--
--  This also closes the "guardian verification is client-side" gap from 0026:
--  the guardian's emailVerified / phoneVerified flags and the account link can no
--  longer be set from the app — only by the server (link code / future OTP).
-- ============================================================================


-- ---------- 1. Guardian account link -----------------------------------------
-- The SportnNote account of a minor's parent/guardian (a PROFILE id). Private —
-- not in the client column grants; players_view only says whether one is linked.
alter table players add column if not exists guardian_profile_id uuid references profiles(id) on delete set null;
create index if not exists players_guardian_profile_idx on players (guardian_profile_id) where guardian_profile_id is not null;

-- One active link code per child (hashed; 7-day expiry; attempt cap). No client access.
create table if not exists guardian_link_codes (
  player_id    uuid primary key references players(id) on delete cascade,
  code_hash    text not null unique,
  target_email text not null,
  attempts     int not null default 0,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
alter table guardian_link_codes enable row level security;

-- Clients can't forge the guardian link or the guardian's verified flags; a
-- changed guardian email drops the link + email verification.
create or replace function guard_guardian_fields()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() or is_support() then return new; end if;
  if tg_op = 'INSERT' then
    new.guardian_profile_id := null;
    if new.guardian is not null then
      new.guardian := new.guardian || '{"phoneVerified": false, "emailVerified": false}'::jsonb;
    end if;
    return new;
  end if;
  new.guardian_profile_id := old.guardian_profile_id;
  if new.guardian is not null then
    new.guardian := new.guardian || jsonb_build_object(
      'emailVerified', case when lower(coalesce(new.guardian->>'email', '')) = lower(coalesce(old.guardian->>'email', ''))
                            then coalesce((old.guardian->>'emailVerified')::boolean, false) else false end,
      'phoneVerified', case when phone_key(new.guardian->>'phone') is not distinct from phone_key(old.guardian->>'phone')
                            then coalesce((old.guardian->>'phoneVerified')::boolean, false) else false end);
  end if;
  if lower(coalesce(new.guardian->>'email', '')) is distinct from lower(coalesce(old.guardian->>'email', '')) then
    new.guardian_profile_id := null;
  end if;
  return new;
end $$;
drop trigger if exists guard_guardian_fields on players;
create trigger guard_guardian_fields before insert or update on players
  for each row execute function guard_guardian_fields();

-- players_view gains `guardian_linked` (appended — CREATE OR REPLACE VIEW can only
-- add columns at the end). Same body as 0026 otherwise.
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
  end as verification,
  p.guardian_profile_id is not null as guardian_linked
from players p
cross join lateral (
  select
    can_view_player_private(p.profile_id, p.created_by) as priv,
    case when p.profile_id is null then can_contact_provisional(p.id) else false end as provisional_contact,
    case when p.dob is null then null else extract(year from age(current_date, p.dob))::int end as age,
    coalesce(p.dob <= (current_date - interval '18 years')::date, false) as adult
) a;
grant select on players_view to anon, authenticated;


-- ---------- 2. Ages ------------------------------------------------------------

create or replace function player_age(p_player uuid)
  returns int language sql stable security definer set search_path = public as $$
  select extract(year from age(current_date, dob))::int from players where id = p_player and dob is not null;
$$;

-- A signed-in person's age: their own player's DOB, else the sign-up DOB.
create or replace function profile_age(p_profile uuid)
  returns int language sql stable security definer set search_path = public as $$
  select extract(year from age(current_date, coalesce(
           (select dob from players where profile_id = p_profile and dob is not null limit 1),
           (select dob from profiles where id = p_profile))))::int;
$$;


-- ---------- 3. Conversations ---------------------------------------------------

-- One thread per (player it's about, sender). The inbox owner (recipient) is the
-- player's own account, or — for an under-18 — their linked guardian; NULL while
-- the guardian hasn't linked yet (delivered by email meanwhile).
create table if not exists message_threads (
  id                   uuid primary key default gen_random_uuid(),
  subject_player_id    uuid not null references players(id) on delete cascade,
  sender_profile_id    uuid not null references profiles(id) on delete cascade,
  recipient_profile_id uuid references profiles(id) on delete set null,
  via_guardian         boolean not null default false,
  created_at           timestamptz not null default now(),
  last_message_at      timestamptz not null default now(),
  sender_read_at       timestamptz,
  recipient_read_at    timestamptz,
  unique (subject_player_id, sender_profile_id)
);
create index if not exists message_threads_sender_idx on message_threads (sender_profile_id, last_message_at desc);
create index if not exists message_threads_recipient_idx on message_threads (recipient_profile_id, last_message_at desc);

create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references message_threads(id) on delete cascade,
  sender_profile_id uuid not null references profiles(id) on delete cascade,
  body              text not null check (char_length(body) between 1 and 2000),
  created_at        timestamptz not null default now(),
  notified_at       timestamptz,           -- set by message-notify (deliver once)
  removed_at        timestamptz            -- removed by support (body replaced; evidence kept in the report)
);
create index if not exists messages_thread_idx on messages (thread_id, created_at);

create table if not exists message_blocks (
  id                 uuid not null default gen_random_uuid() unique,  -- opaque handle for unblocking
  blocker_profile_id uuid not null references profiles(id) on delete cascade,
  blocked_profile_id uuid not null references profiles(id) on delete cascade,
  label              text,                 -- who it was, as the blocker saw them (never a guardian's identity)
  created_at         timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id)
);

create table if not exists message_reports (
  id                  uuid primary key default gen_random_uuid(),
  message_id          uuid references messages(id) on delete set null,
  thread_id           uuid references message_threads(id) on delete set null,
  reporter_profile_id uuid not null references profiles(id) on delete cascade,
  sender_profile_id   uuid references profiles(id) on delete set null,
  message_body        text,                -- snapshot at report time (evidence survives removal)
  reason              text,
  status              text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution          text check (resolution in ('dismissed', 'removed', 'banned')),
  resolved_by         uuid references profiles(id) on delete set null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

-- People SportnNote support has barred from messaging (after a report).
create table if not exists messaging_bans (
  profile_id uuid primary key references profiles(id) on delete cascade,
  reason     text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table message_threads enable row level security;
alter table messages        enable row level security;
alter table message_blocks  enable row level security;
alter table message_reports enable row level security;
alter table messaging_bans  enable row level security;   -- no client policies

-- Read-only to participants (and support, for reports). All writes are RPCs.
drop policy if exists threads_read on message_threads;
create policy threads_read on message_threads for select to authenticated
  using (auth.uid() in (sender_profile_id, recipient_profile_id) or is_support());
drop policy if exists messages_read on messages;
create policy messages_read on messages for select to authenticated
  using (is_support() or exists (
    select 1 from message_threads t where t.id = thread_id
      and auth.uid() in (t.sender_profile_id, t.recipient_profile_id)));
-- Blocks: no direct client access (the blocked person's account id must not leak);
-- my_blocks() / unblock_message_sender() below.
drop policy if exists blocks_read on message_blocks;
drop policy if exists blocks_delete on message_blocks;
drop policy if exists reports_read on message_reports;
create policy reports_read on message_reports for select to authenticated
  using (is_support());


-- ---------- 4. Sending ----------------------------------------------------------

create or replace function assert_can_message()
  returns void language plpgsql stable security definer set search_path = public as $$
declare a int;
begin
  if auth.uid() is null then raise exception 'Sign in to send messages' using errcode = '42501'; end if;
  a := profile_age(auth.uid());
  if a is null then
    raise exception 'Add your date of birth to your profile to use messaging' using errcode = '42501';
  end if;
  if a < 18 then
    raise exception 'Messaging is for adults. Under-18 players are contacted through their parent/guardian.'
      using errcode = '42501';
  end if;
  if exists (select 1 from messaging_bans where profile_id = auth.uid()) then
    raise exception 'Your messaging has been turned off by SportnNote support. Contact support if you think this is a mistake.'
      using errcode = '42501';
  end if;
end $$;

-- Start (or continue) a conversation about a player. Returns the thread + the new
-- message id (the client then asks message-notify to deliver it).
create or replace function send_message(p_player uuid, p_body text)
  returns table (thread_id uuid, message_id uuid)
  language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  me    uuid := auth.uid();
  body  text := trim(coalesce(p_body, ''));
  tgt   players;
  tage  int;
  recip uuid;
  via   boolean := false;
  th    uuid;
  mid   uuid;
begin
  perform assert_can_message();
  if body = '' or char_length(body) > 2000 then
    raise exception 'Write a message (up to 2000 characters)';
  end if;
  select * into tgt from players where id = p_player;
  if tgt.id is null then raise exception 'Player not found'; end if;
  if tgt.profile_id = me then raise exception 'You can''t message yourself'; end if;

  tage := player_age(p_player);
  if tage is null or tage < 18 then
    -- Under-18 (or age unknown — treated as a minor): the guardian's inbox.
    via := true;
    if tgt.guardian_profile_id is not null then
      recip := tgt.guardian_profile_id;
    elsif coalesce(tgt.guardian->>'email', '') ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      recip := null;   -- delivered by email (with a link code) until they link
    else
      raise exception 'This player''s parent/guardian can''t be reached on SportnNote yet.';
    end if;
  else
    if tgt.profile_id is null then
      raise exception '% isn''t on SportnNote yet.', tgt.full_name;
    end if;
    recip := tgt.profile_id;
  end if;
  if recip = me then raise exception 'You can''t message yourself'; end if;
  if recip is not null and exists (select 1 from message_blocks b
                                   where b.blocker_profile_id = recip and b.blocked_profile_id = me) then
    raise exception 'You can''t message this person.' using errcode = '42501';
  end if;

  select t.id into th from message_threads t where t.subject_player_id = p_player and t.sender_profile_id = me;
  if th is null then
    if not rate_limit_hit('msg-new-thread', me::text, 10, 86400) then
      raise exception 'You''ve started a lot of new conversations today — try again tomorrow.' using errcode = '54000';
    end if;
    insert into message_threads (subject_player_id, sender_profile_id, recipient_profile_id, via_guardian)
      values (p_player, me, recip, via) returning id into th;
  else
    update message_threads t set recipient_profile_id = recip, via_guardian = via where t.id = th;
  end if;
  if not rate_limit_hit('msg-send', me::text, 100, 86400) then
    raise exception 'Daily message limit reached — try again tomorrow.' using errcode = '54000';
  end if;
  insert into messages (thread_id, sender_profile_id, body) values (th, me, body) returning id into mid;
  update message_threads t set last_message_at = now(), sender_read_at = now() where t.id = th;
  return query select th, mid;
end $$;

-- Reply in an existing conversation (either side).
create or replace function reply_message(p_thread uuid, p_body text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  me   uuid := auth.uid();
  body text := trim(coalesce(p_body, ''));
  t    message_threads;
  other uuid;
  mid  uuid;
begin
  perform assert_can_message();
  if body = '' or char_length(body) > 2000 then
    raise exception 'Write a message (up to 2000 characters)';
  end if;
  select * into t from message_threads where id = p_thread;
  if t.id is null or me not in (t.sender_profile_id, coalesce(t.recipient_profile_id, t.sender_profile_id)) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  other := case when me = t.sender_profile_id then t.recipient_profile_id else t.sender_profile_id end;
  if other is not null and exists (select 1 from message_blocks b
       where (b.blocker_profile_id = other and b.blocked_profile_id = me)
          or (b.blocker_profile_id = me and b.blocked_profile_id = other)) then
    raise exception 'You can''t message this person.' using errcode = '42501';
  end if;
  if not rate_limit_hit('msg-send', me::text, 100, 86400) then
    raise exception 'Daily message limit reached — try again tomorrow.' using errcode = '54000';
  end if;
  insert into messages (thread_id, sender_profile_id, body) values (p_thread, me, body) returning id into mid;
  if me = t.sender_profile_id then
    update message_threads set last_message_at = now(), sender_read_at = now() where id = p_thread;
  else
    update message_threads set last_message_at = now(), recipient_read_at = now() where id = p_thread;
  end if;
  return mid;
end $$;

create or replace function mark_thread_read(p_thread uuid)
  returns void language sql security definer set search_path = public as $$
  update message_threads
     set sender_read_at    = case when sender_profile_id = auth.uid() then now() else sender_read_at end,
         recipient_read_at = case when recipient_profile_id = auth.uid() then now() else recipient_read_at end
   where id = p_thread and auth.uid() in (sender_profile_id, recipient_profile_id);
$$;

-- Block the other party of a conversation (without ever exposing their account id).
create or replace function block_thread_sender(p_thread uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare t message_threads; other uuid;
begin
  select * into t from message_threads where id = p_thread;
  if t.id is null or auth.uid() not in (t.sender_profile_id, t.recipient_profile_id) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  other := case when auth.uid() = t.sender_profile_id then t.recipient_profile_id else t.sender_profile_id end;
  if other is null then return; end if;
  insert into message_blocks (blocker_profile_id, blocked_profile_id, label)
  values (auth.uid(), other, (select other_name from my_threads() where thread_id = p_thread))
  on conflict do nothing;
end $$;

-- People I've blocked — label + opaque id only.
create or replace function my_blocks()
  returns table (id uuid, label text, created_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select b.id, coalesce(b.label, 'Someone'), b.created_at from message_blocks b
  where b.blocker_profile_id = auth.uid() order by b.created_at desc;
$$;

create or replace function unblock_message_sender(p_block uuid)
  returns void language sql security definer set search_path = public as $$
  delete from message_blocks where id = p_block and blocker_profile_id = auth.uid();
$$;

create or replace function report_message(p_message uuid, p_reason text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from messages m join message_threads t on t.id = m.thread_id
                 where m.id = p_message and auth.uid() in (t.sender_profile_id, t.recipient_profile_id)) then
    raise exception 'Message not found' using errcode = '42501';
  end if;
  if not rate_limit_hit('msg-report', auth.uid()::text, 20, 86400) then
    raise exception 'Too many reports today' using errcode = '54000';
  end if;
  insert into message_reports (message_id, thread_id, reporter_profile_id, sender_profile_id, message_body, reason)
  select m.id, m.thread_id, auth.uid(), m.sender_profile_id, m.body, left(trim(coalesce(p_reason, '')), 500)
  from messages m where m.id = p_message;
end $$;

-- ---------- 4b. Support moderation --------------------------------------------

-- The report queue (support only), with enough context to decide.
create or replace function support_message_reports(p_status text default 'open')
  returns table (
    report_id uuid, created_at timestamptz, status text, resolution text, reason text,
    message_id uuid, thread_id uuid, message_body text, message_removed boolean,
    reporter_name text, sender_name text, sender_banned boolean,
    subject_name text, via_guardian boolean, report_count int)
  language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_support() then raise exception 'Support only' using errcode = '42501'; end if;
  return query
  select r.id, r.created_at, r.status, r.resolution, r.reason,
         r.message_id, r.thread_id, r.message_body, m.removed_at is not null,
         (select coalesce(pl.full_name, pr.full_name) from profiles pr
            left join players pl on pl.profile_id = pr.id where pr.id = r.reporter_profile_id limit 1),
         (select coalesce(pl.full_name, pr.full_name) from profiles pr
            left join players pl on pl.profile_id = pr.id where pr.id = r.sender_profile_id limit 1),
         exists (select 1 from messaging_bans b where b.profile_id = r.sender_profile_id),
         sp.full_name, coalesce(t.via_guardian, false),
         (select count(*)::int from message_reports r2 where r2.sender_profile_id = r.sender_profile_id)
  from message_reports r
  left join messages m on m.id = r.message_id
  left join message_threads t on t.id = r.thread_id
  left join players sp on sp.id = t.subject_player_id
  where p_status = 'all' or r.status = p_status
  order by r.created_at desc
  limit 200;
end $$;

-- Resolve a report: 'dismiss' | 'remove' (hide the message) | 'ban' (remove +
-- turn off the sender's messaging). Resolves every open report on that message.
create or replace function support_resolve_report(p_report uuid, p_action text)
  returns void language plpgsql security definer set search_path = public as $$
declare r message_reports;
begin
  if not is_support() then raise exception 'Support only' using errcode = '42501'; end if;
  if p_action not in ('dismiss', 'remove', 'ban') then raise exception 'Unknown action'; end if;
  select * into r from message_reports where id = p_report;
  if r.id is null then raise exception 'Report not found'; end if;
  if p_action in ('remove', 'ban') and r.message_id is not null then
    update messages set body = 'This message was removed by SportnNote.', removed_at = now()
     where id = r.message_id and removed_at is null;
  end if;
  if p_action = 'ban' and r.sender_profile_id is not null then
    insert into messaging_bans (profile_id, reason, created_by)
    values (r.sender_profile_id, 'Report ' || r.id, auth.uid())
    on conflict (profile_id) do nothing;
  end if;
  update message_reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         resolution = case p_action when 'dismiss' then 'dismissed' when 'remove' then 'removed' else 'banned' end,
         resolved_by = auth.uid(), resolved_at = now()
   where status = 'open' and (id = p_report or (r.message_id is not null and message_id = r.message_id));
end $$;

-- Lift a messaging ban (support).
create or replace function support_lift_messaging_ban(p_report uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_support() then raise exception 'Support only' using errcode = '42501'; end if;
  delete from messaging_bans where profile_id = (select sender_profile_id from message_reports where id = p_report);
end $$;

-- The inbox: my conversations with display names that never reveal a guardian.
create or replace function my_threads()
  returns table (
    thread_id uuid, subject_player_id uuid, subject_name text,
    other_name text, other_player_id uuid,
    i_started boolean, via_guardian boolean, awaiting_guardian boolean,
    last_message_at timestamptz, last_body text, last_from_me boolean, unread boolean)
  language sql stable security definer set search_path = public as $$
  select t.id, t.subject_player_id, sp.full_name,
         case when t.sender_profile_id = auth.uid()
              then case when t.via_guardian then 'Parent/guardian of ' || sp.full_name else sp.full_name end
              else coalesce(senderp.full_name, senderprof.full_name, 'SportnNote user') end,
         case when t.sender_profile_id = auth.uid() then t.subject_player_id else senderp.id end,
         t.sender_profile_id = auth.uid(), t.via_guardian, t.recipient_profile_id is null,
         t.last_message_at, lm.body, lm.sender_profile_id = auth.uid(),
         coalesce(lm.sender_profile_id <> auth.uid()
                  and lm.created_at > coalesce(case when t.sender_profile_id = auth.uid() then t.sender_read_at else t.recipient_read_at end, '-infinity'),
                  false)
  from message_threads t
  join players sp on sp.id = t.subject_player_id
  left join profiles senderprof on senderprof.id = t.sender_profile_id
  left join lateral (select id, full_name from players where profile_id = t.sender_profile_id limit 1) senderp on true
  left join lateral (select m.body, m.sender_profile_id, m.created_at from messages m
                     where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
  where auth.uid() in (t.sender_profile_id, t.recipient_profile_id)
  order by t.last_message_at desc;
$$;

-- An existing conversation I started about this player (to resume it).
create or replace function my_thread_for_player(p_player uuid)
  returns uuid language sql stable security definer set search_path = public as $$
  select id from message_threads where subject_player_id = p_player and sender_profile_id = auth.uid();
$$;


-- ---------- 5. Guardian linking ----------------------------------------------

-- Mint a link code for a child's guardian (service role only — the edge functions
-- email it to the guardian address on file). Returns the plaintext code once.
create or replace function create_guardian_link_code(p_player uuid)
  returns text language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 7, 9];
  code text := '';
  i int;
  email text;
begin
  select guardian->>'email' into email from players where id = p_player;
  if coalesce(email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'No guardian email on file';
  end if;
  foreach i in array idx loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  insert into guardian_link_codes (player_id, code_hash, target_email, attempts, expires_at)
  values (p_player, encode(sha256(convert_to(code, 'UTF8')), 'hex'), lower(email), 0, now() + interval '7 days')
  on conflict (player_id) do update
    set code_hash = excluded.code_hash, target_email = excluded.target_email,
        attempts = 0, expires_at = excluded.expires_at, created_at = now();
  return code;
end $$;
revoke all on function create_guardian_link_code(uuid) from public, anon, authenticated;
grant execute on function create_guardian_link_code(uuid) to service_role;

-- A parent/guardian, signed in with THEIR OWN account, enters the emailed code:
-- links them to the child, marks the guardian email verified, and moves any
-- pending messages about the child into their inbox. Returns the child's id.
create or replace function claim_guardian_link(p_code text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c  guardian_link_codes;
  pl players;
  a  int;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not rate_limit_hit('guardian-claim', me::text, 10, 3600) then
    raise exception 'Too many attempts — try again in an hour' using errcode = '54000';
  end if;
  select * into c from guardian_link_codes
   where code_hash = encode(sha256(convert_to(upper(trim(coalesce(p_code, ''))), 'UTF8')), 'hex');
  if c.player_id is null or c.expires_at < now() then
    raise exception 'That code isn''t valid or has expired — ask for a new one.';
  end if;
  select * into pl from players where id = c.player_id;
  if pl.profile_id = me then
    raise exception 'Sign in with the parent/guardian''s own account (not the player''s) to link.' using errcode = '42501';
  end if;
  a := profile_age(me);
  if a is not null and a < 18 then
    raise exception 'A parent/guardian account must belong to an adult.' using errcode = '42501';
  end if;
  if lower(coalesce(pl.guardian->>'email', '')) <> c.target_email then
    raise exception 'The guardian email on this profile changed — ask for a new code.';
  end if;

  perform set_config('app.trusted_rpc', 'on', true);
  update players
     set guardian_profile_id = me,
         guardian = coalesce(guardian, '{}'::jsonb) || '{"emailVerified": true}'::jsonb
   where id = pl.id;
  update message_threads set recipient_profile_id = me
   where subject_player_id = pl.id and via_guardian;
  perform set_config('app.trusted_rpc', 'off', true);
  delete from guardian_link_codes where player_id = pl.id;
  return pl.id;
end $$;

-- Children linked to me as their guardian (for the guardian's own UI).
create or replace function my_guarded_players()
  returns table (id uuid, full_name text)
  language sql stable security definer set search_path = public as $$
  select id, full_name from players where guardian_profile_id = auth.uid() order by full_name;
$$;

revoke all on function send_message(uuid, text), reply_message(uuid, text), mark_thread_read(uuid),
                       block_thread_sender(uuid), report_message(uuid, text), my_threads(),
                       my_thread_for_player(uuid), claim_guardian_link(text), my_guarded_players(),
                       assert_can_message(), player_age(uuid), profile_age(uuid)
  from public, anon;
grant execute on function send_message(uuid, text), reply_message(uuid, text), mark_thread_read(uuid),
                          block_thread_sender(uuid), report_message(uuid, text), my_threads(),
                          my_thread_for_player(uuid), claim_guardian_link(text), my_guarded_players(),
                          my_blocks(), unblock_message_sender(uuid),
                          support_message_reports(text), support_resolve_report(uuid, text),
                          support_lift_messaging_ban(uuid)
  to authenticated;
revoke all on function my_blocks(), unblock_message_sender(uuid), support_message_reports(text),
                       support_resolve_report(uuid, text), support_lift_messaging_ban(uuid)
  from public, anon;


-- ---------- 6. Live updates -----------------------------------------------------
-- An open conversation listens for new / removed messages over Supabase Realtime.
-- Realtime applies the messages_read policy per subscriber, so only participants
-- (and support) receive a thread's rows.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table messages;
  end if;
end $$;


-- ---------- 7. Guardian phone verification (server-side OTP) --------------------
-- send-contact-otp / verify-contact-otp gain a 'guardian_phone' channel: the code
-- goes to the guardian's number on file (WhatsApp), and only the server flips
-- guardian.phoneVerified. (Delivery needs the WhatsApp template — see
-- docs/whatsapp-otp-setup.md.)
alter table contact_otps drop constraint if exists contact_otps_channel_check;
alter table contact_otps add constraint contact_otps_channel_check
  check (channel in ('email', 'phone', 'guardian_phone'));
