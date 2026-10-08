-- 0043 — Scorers and officials (CricHeroes parity #11).
--
-- 1. matches.officials: the per-match officials (umpires, referees,
--    commentator …) as a jsonb array of {slot, playerId?, name}. Kept in its
--    OWN column — never in matches.format, so a match keeps inheriting the
--    tournament's format (REVIEW Decision 3). Scorers and hosts write it
--    through the existing "manage match" update policy.
-- 2. join_match_as_scorer(p_match): a tournament's scorer (tournament_officials
--    role = 'scorer') adds themself to scorer_ids of one of that tournament's
--    scheduled / live matches ("my phone died — a colleague continues").
--    Tournament scorers get NO blanket write access: scorer_ids stays the
--    single source of "who's scoring" for reminders and the #03 lock.
-- Idempotent — safe to re-run.

alter table matches add column if not exists officials jsonb not null default '[]'::jsonb;

create or replace function join_match_as_scorer(p_match uuid)
  returns uuid language plpgsql volatile security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then
    raise exception 'Only this tournament''s scorers can do that' using errcode = '42501';
  end if;
  select o.player_id into pid
    from matches m
    join tournament_officials o on o.tournament_id = m.tournament_id and o.role = 'scorer'
    where m.id = p_match
      and m.status in ('scheduled', 'live')
      and o.player_id = any(auth_player_ids())
    limit 1;
  if pid is null then
    raise exception 'Only this tournament''s scorers can do that' using errcode = '42501';
  end if;
  update matches
     set scorer_ids = case when pid = any(scorer_ids) then scorer_ids else coalesce(scorer_ids, '{}') || pid end,
         scorer_id = coalesce(scorer_id, pid)
   where id = p_match;
  return pid;
end $$;

revoke all on function join_match_as_scorer(uuid) from public, anon;
grant execute on function join_match_as_scorer(uuid) to authenticated;
