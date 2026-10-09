-- 0046 — Tournament awards + change Player of the Match once (CricHeroes parity #21).
--
-- 1. tournaments.awards jsonb — {publishedAt?, items:[{id,slot,label,sport,
--    playerId,playerName,teamName?,value?,detail?}]}. One column holds the draft
--    and the published set together; the app hides a draft from non-hosts.
--    Written through the existing "manage tourneys" update policy (hosts /
--    hosting-org organisers); guard_tournament_write leaves it alone.
-- 2. matches.potm jsonb — the official Player of the Match override:
--    {playerId,name,auto:{playerId,name},by,at}. Written through the existing
--    "manage match" update policy (the match's hosts and scorers, and the
--    tournament's hosts). "Only once" is enforced by the app via potm.by — no
--    DB trigger at pilot scale (REVIEW 05/21).
-- Both are read in their own selects, so the app degrades without them.
-- Idempotent — safe to re-run.

alter table tournaments add column if not exists awards jsonb;
alter table matches     add column if not exists potm   jsonb;

comment on column tournaments.awards is 'Tournament awards {publishedAt?, items:[{id,slot,label,sport,playerId,playerName,teamName?,value?,detail?}]} (parity #21)';
comment on column matches.potm is 'Player of the Match override {playerId,name,auto:{playerId,name},by,at} — changeable once (parity #21)';
