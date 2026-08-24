-- 0012 — Allow matches to be postponed or cancelled.
--
-- Organizers need to move a match (new date/time/venue) or mark it postponed /
-- cancelled, without deleting and recreating it. The date/time/venue columns
-- already exist (starts_at, venue_name, venue_maps_url) and are now writable via
-- rescheduleMatch(); this migration just widens the status CHECK so 'postponed'
-- and 'cancelled' are valid states (previously only scheduled/live/completed).

alter table matches drop constraint if exists matches_status_check;
alter table matches add constraint matches_status_check
  check (status in ('scheduled', 'live', 'completed', 'postponed', 'cancelled'));
