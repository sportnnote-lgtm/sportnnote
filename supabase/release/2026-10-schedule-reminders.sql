-- Schedule match reminders (notify-upcoming) every 5 minutes.
-- Paste into Supabase → SQL editor → Run. Safe to re-run (same job name = update).
-- Uses the 'cron_secret' already stored in Vault by the weekly-report setup; the
-- Bearer below is the PUBLIC anon key (it's in every copy of the app), needed only
-- to pass the functions gateway — the function itself checks x-cron-secret.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('notify-upcoming', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://mpgbvbylmkwasjgupsbq.supabase.co/functions/v1/notify-upcoming',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZ2J2YnlsbWt3YXNqZ3Vwc2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjIxNDQsImV4cCI6MjEwMTU5ODE0NH0.NV7ryMBv-qAc7OzHZVPPxXY2J3agtlHRbvS55R6sWXw',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
$job$);

select jobname, schedule, active from cron.job order by jobname;
