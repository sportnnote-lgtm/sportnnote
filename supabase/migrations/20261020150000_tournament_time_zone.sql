-- SD-150 (international I-1a): time zones that follow the venue.
--
-- 1. tournaments.time_zone — the venue's IANA zone (e.g. 'Asia/Dubai'). Kickoff
--    entry, fixture lists/prints and the tournament's "today" use it; NULL =
--    each viewer's own zone (every existing tournament keeps today's behaviour).
--    Set by the app when a tournament is created (default: the organiser's zone)
--    and editable under Edit tournament → Time zone. Readable like every other
--    tournament column (no column grants on tournaments).
-- 2. profiles.time_zone (exists since 0001) — the app now WRITES it (sign-in and
--    every change), and notify-upcoming words reminder emails in it. Add the
--    same shape check so a bad value can't break the email job.
--
-- Idempotent: safe to run twice.

alter table tournaments add column if not exists time_zone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tournaments_time_zone_shape') then
    alter table tournaments add constraint tournaments_time_zone_shape
      check (time_zone is null or (length(time_zone) between 1 and 64 and time_zone ~ '^[A-Za-z][A-Za-z0-9_+/-]*$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_time_zone_shape') then
    -- NOT VALID: existing rows (all NULL today) aren't re-checked; new writes are.
    alter table profiles add constraint profiles_time_zone_shape
      check (time_zone is null or (length(time_zone) between 1 and 64 and time_zone ~ '^[A-Za-z][A-Za-z0-9_+/-]*$')) not valid;
  end if;
end $$;

comment on column tournaments.time_zone is 'SD-150: venue IANA time zone; NULL = viewer''s own zone';
comment on column profiles.time_zone is 'Viewer''s IANA time zone, written by the app (SD-150); reminder emails use it';
