-- Release: migration 0041 (tournament details + soft delete — CricHeroes parity #09).
-- Paste into the Supabase SQL editor and Run. Safe to re-run.
begin;
-- 0041 — Tournament profile details + soft delete (CricHeroes parity #09).
--
-- What teams and parents ask the organiser — where (city, grounds), what kind of
-- event, who to call, the rules — now lives on the tournament instead of a
-- WhatsApp poster. Deleting a tournament is SOFT (deleted_at): stats survive and
-- it can be restored by SQL. The existing "manage tourneys" update policy covers
-- every column here (a soft delete is an update). banner_url comes from 0038.
alter table tournaments add column if not exists city text;
alter table tournaments add column if not exists grounds text[] not null default '{}';
alter table tournaments add column if not exists event_category text;   -- school|college|university|corporate|community|open|other
alter table tournaments add column if not exists about text;            -- ≤ 4000 chars (client-enforced)
alter table tournaments add column if not exists organiser_phone text;
alter table tournaments add column if not exists organiser_email text;
alter table tournaments add column if not exists deleted_at timestamptz;
commit;
