-- ============================================================================
--  Sportfolio · migration 0004 — Play-in byes
--  Delta on top of schema.sql + migrations 0001–0003. Idempotent — safe to re-run.
--
--  A play-in round trims an odd field (e.g. 12 qualifiers) to a clean bracket:
--  the bottom seeds play, the top seeds *bye* straight into the next round. We
--  record those bye team ids on the play-in matches so the bracket can advance
--  a play-in → a clean main round (winners + byes) without inventing phantom
--  "bye" match records. Nullable & unused by every other match, so purely
--  additive — existing rows and reads are unaffected.
-- ============================================================================

alter table matches add column if not exists byes uuid[];
