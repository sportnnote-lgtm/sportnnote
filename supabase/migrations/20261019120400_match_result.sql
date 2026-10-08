-- 0040 — Manual match results (CricHeroes parity #04).
--
-- A match closed by hand — abandoned, no result, draw/tie, conceded, awarded —
-- keeps HOW it ended and WHY. Status stays 'completed'; the kind lives here.
-- This is the only result store (never matches.format). Updates are already
-- covered by the "manage match" policy.
alter table matches add column if not exists result jsonb;
comment on column matches.result is 'Manual result {kind,winner,reason,countNrr,score,byId,byName,at}';
