-- Release: migration 0047 (alert choices per follow + match start/result alerts — CricHeroes parity #23).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
-- After running: store the Vault secrets named in the header below (notify_followers_url,
-- webhook_secret, optionally functions_anon_key) and deploy notify-followers + notify-upcoming.
begin;
-- 0047 — Alert choices per follow + match start/result alerts (CricHeroes parity #23).
--
-- 1. follows.prefs jsonb — only the OFF switches, e.g. {"scores":false}; null
--    means every alert is on, so existing rows need no backfill. Keys:
--    reminder | start | result | scores (| award, reserved for #21's fan-out).
--    Written through the existing "manage own follows" policy (for all, own
--    rows only). An unfollow deletes the row, so a re-follow starts all-on.
-- 2. match_status_notify — an AFTER UPDATE OF status trigger that fires only when
--    matches.status actually changes and posts {type:'match_status', record,
--    old_record:{status}} to the notify-followers edge function via pg_net.
--    A plain `matches` UPDATE webhook would fire on every scored ball (each ball
--    rewrites matches.state), so this is deliberately NOT a webhook.
--    The URL and secret come from Vault (same mechanism as the reminders cron):
--      notify_followers_url  e.g. https://<ref>.supabase.co/functions/v1/notify-followers
--      webhook_secret        the same value as the function's WEBHOOK_SECRET
--      functions_anon_key    optional — the public anon key, sent as the
--                            Bearer to pass the functions gateway's JWT check
--    If the URL or the secret is unset (or Vault/pg_net is unavailable) the
--    trigger returns without posting; it can never block a status change.
-- Idempotent — safe to re-run.

alter table follows add column if not exists prefs jsonb;
comment on column follows.prefs is 'Alert choices — only OFF switches, e.g. {"scores":false}; null = all on (parity #23)';

create extension if not exists pg_net;

create or replace function notify_match_status() returns trigger
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
      -- state is the sport's whole live snapshot; the function doesn't need it.
      body    := jsonb_build_object(
        'type', 'match_status',
        'record', to_jsonb(new) - 'state',
        'old_record', jsonb_build_object('status', old.status)));
  exception when others then
    null;  -- an alert must never fail the scorer's status write
  end;
  return new;
end $$;

revoke all on function notify_match_status() from public, anon, authenticated;

drop trigger if exists match_status_notify on matches;
create trigger match_status_notify after update of status on matches
  for each row when (old.status is distinct from new.status)
  execute function notify_match_status();
commit;
