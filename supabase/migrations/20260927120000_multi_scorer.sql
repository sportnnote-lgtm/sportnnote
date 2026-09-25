-- Multiple scorers per match + fix the scorer_id type mismatch.
--
-- Bug this fixes: the app stores/compares a PLAYER id for the scorer (the scorer is
-- picked from the match roster, and `canScore` is `scorer == my player id`). But
-- matches.scorer_id had a FK to profiles(id) and can_manage_match() compared it to
-- auth.uid() (a PROFILE id). Writing a player id therefore violated the FK, the
-- UPDATE was rejected, and the app never checked the error — so assigning a scorer
-- silently did nothing and "no scorer" came back on reload. (host_ids has no FK, so
-- hosts persisted fine — which is why only the scorer kept vanishing.)
--
-- Fix: scorer is a PLAYER id everywhere; support more than one via scorer_ids[].

-- 1) The new multi-scorer column (player ids; no FK, like host_ids).
alter table matches add column if not exists scorer_ids uuid[] not null default '{}';

-- 2) Any legacy scorer_id that isn't a real player id is stale (e.g. a profile id
--    from the old, broken model) — clear it so the new FK can be added cleanly.
update matches set scorer_id = null
  where scorer_id is not null and scorer_id not in (select id from players);

-- 3) Seed the array from the (now validated) single column.
update matches set scorer_ids = array[scorer_id]
  where scorer_id is not null and scorer_ids = '{}';

-- 4) Point the legacy column's FK at players (it holds the PRIMARY scorer's player
--    id — kept in sync by the app so reminders/notifications keep working).
alter table matches drop constraint if exists matches_scorer_id_fkey;
alter table matches
  add constraint matches_scorer_id_fkey
  foreign key (scorer_id) references players(id) on delete set null;

create index if not exists idx_matches_scorer_ids on matches using gin (scorer_ids);

-- 5) A match's managers now include ANY assigned scorer (scorer_ids or the primary
--    scorer_id), plus the existing match-host / tournament-host branches. Every
--    branch is a PLAYER-id overlap via auth_player_ids() except the tournament
--    organizer (a profile id = auth.uid()).
create or replace function can_manage_match(p_match_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    left join tournaments t on t.id = m.tournament_id
    where m.id = p_match_id
      and ( m.scorer_ids && auth_player_ids()
         or m.scorer_id = any(auth_player_ids())
         or m.host_ids && auth_player_ids()
         or t.organizer_id = auth.uid()
         or t.host_ids && auth_player_ids() )
  );
$$;
