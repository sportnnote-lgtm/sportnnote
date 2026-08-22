-- ============================================================================
--  Sportfolio · migration 0009 — Provisional-player "not me" report
--  Delta on top of schema.sql + migrations 0001–0008. Idempotent — safe to re-run.
--
--  Organizers can add people to teams by phone number before those people are on
--  SportnNote (a "provisional"/invited player — see invitePlayer). The WhatsApp
--  invite now also carries a "this isn't me" link that hits the public
--  `report-invite` edge function, which stamps `reported_at` here. A reported
--  provisional player is flagged to the organizer and blocked from further use;
--  until then they stay fully usable (rostered, scheduled, scored).
--
--  Only the service-role edge function writes this; the app just reads it (the
--  existing "read players" policy already allows that).
-- ============================================================================

alter table players
  add column if not exists reported_at timestamptz;   -- set when the person reports "not me"

-- Fast "any reported players?" checks for the organizer's team/squad views.
create index if not exists players_reported_idx on players (reported_at) where reported_at is not null;
