-- ============================================================================
--  Sportfolio · migration 0002 — Grouped tournaments
--  Delta on top of schema.sql + migration 0001. Idempotent — safe to re-run.
--
--  Adds the group-stage / knockout-phase tags a match carries in a grouped
--  tournament (league phase split into groups → seeded knockout). Both are
--  nullable and unused by flat league/knockout/friendly matches, so this is a
--  purely additive change — existing rows and reads are unaffected.
--    · group_label — the group a group-stage match belongs to (e.g. 'A','B').
--                    (named group_label, not "group", to dodge the SQL keyword.)
--    · stage       — the tournament phase: 'group' | 'r16' | 'qf' | 'sf' | 'final'.
-- ============================================================================

alter table matches add column if not exists group_label text;
alter table matches add column if not exists stage text;

-- Group tables and the knockout bracket both filter a tournament's matches by
-- these, so index the common (tournament, stage) lookup.
create index if not exists matches_tournament_stage_idx on matches (tournament_id, stage);
