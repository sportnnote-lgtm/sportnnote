-- ============================================================================
--  Sportfolio · SD-131 — follower alerts for event results and golf rounds
--  Delta on top of 0028 (field_events) and 0047 (follow_prefs: notify_match_status,
--  Vault-configured notify-followers). Idempotent — safe to re-run.
--
--  Until now the only result push was `match_status_notify` on `matches`, so a
--  parent following an athlete heard nothing when an athletics / swimming /
--  weightlifting / shooting / archery / rowing / canoe / cycling FINAL was locked
--  or a golf stroke-play round was finished.
--
--  1. field_event_status_notify — AFTER UPDATE OF status on field_events, only
--     when status really changes to 'completed'. Posts
--       { type: 'field_status', record: {id, sport, tournament_id, title, round_no, status},
--         old_record: { status } }
--     to notify-followers with the same Vault URL / secret / anon key as 0047.
--     The function decides whether it is a final (a heat or semi-final closing
--     is a 'completed' round too, and is skipped there), builds
--     "🥇 Asha Rao won U14 Girls 100 m in 13.42 — meet record", and sends it to
--     followers of the athletes, their teams / houses and the tournament.
--     Unconfigured Vault / pg_net → returns quietly; it can never block a lock.
--
--  2. reminder_sends — the existing dedup ledger now also takes field events:
--     event_id (nullable) next to match_id (now nullable), exactly one of them
--     set. The old primary key (match_id, lead_key, recipient_id, kind) becomes
--     a plain unique index on the same columns, so every existing upsert
--     (`onConflict: 'match_id,lead_key,recipient_id,kind'`, notify-upcoming and
--     notify-followers) keeps working unchanged; field events use the twin index
--     (event_id, lead_key, recipient_id, kind). lead_key 'final' | 'round'.
--     A final reopened and locked again therefore never pushes twice.
-- ============================================================================

-- ---------- 1. Ledger: event rows ---------------------------------------------

alter table reminder_sends add column if not exists event_id uuid references field_events(id) on delete cascade;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'reminder_sends_pkey' and conrelid = 'reminder_sends'::regclass) then
    alter table reminder_sends drop constraint reminder_sends_pkey;
  end if;
end $$;
alter table reminder_sends alter column match_id drop not null;

create unique index if not exists reminder_sends_match_key
  on reminder_sends (match_id, lead_key, recipient_id, kind);
create unique index if not exists reminder_sends_event_key
  on reminder_sends (event_id, lead_key, recipient_id, kind);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reminder_sends_one_target') then
    alter table reminder_sends add constraint reminder_sends_one_target
      check ((match_id is not null) <> (event_id is not null));
  end if;
end $$;


-- ---------- 2. Trigger: a field event locked → notify-followers ------------------

create extension if not exists pg_net;

create or replace function notify_field_event_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
  v_anon   text;
  v_headers jsonb;
begin
  begin
    select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notify_followers_url' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret'       limit 1;
    select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'functions_anon_key'   limit 1;
  exception when others then
    return new;  -- no Vault → not configured
  end;
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret);
  if coalesce(v_anon, '') <> '' then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_anon);
  end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := v_headers,
      -- the format (heats, plan, records snapshot) can be large; the function re-reads the row
      body    := jsonb_build_object(
        'type', 'field_status',
        'record', jsonb_build_object('id', new.id, 'sport', new.sport, 'tournament_id', new.tournament_id,
                                     'title', new.title, 'round_no', new.round_no, 'status', new.status),
        'old_record', jsonb_build_object('status', old.status)));
  exception when others then
    null;  -- an alert must never fail the official's lock
  end;
  return new;
end $$;

revoke all on function notify_field_event_status() from public, anon, authenticated;

drop trigger if exists field_event_status_notify on field_events;
create trigger field_event_status_notify after update of status on field_events
  for each row when (old.status is distinct from new.status and new.status = 'completed')
  execute function notify_field_event_status();
