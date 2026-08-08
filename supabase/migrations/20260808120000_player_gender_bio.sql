-- ============================================================================
--  Sportfolio · migration 0005 — Player gender + bio
--  Delta on top of schema.sql + migrations 0001–0004. Idempotent — safe to re-run.
--
--  Two optional profile fields a player fills in on their own profile:
--    · gender — self-described (free text; the UI offers common options).
--    · bio    — a short "about me".
--  Both nullable and unused elsewhere, so purely additive.
-- ============================================================================

alter table players add column if not exists gender text;
alter table players add column if not exists bio    text;
