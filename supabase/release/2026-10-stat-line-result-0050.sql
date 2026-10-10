-- Release: migration 0050 (stat_lines.result — each player's W / D / L / T / NR from
-- their side; sport-depth SD-11). Paste into the Supabase SQL editor and Run. Safe to
-- re-run: the column / check are added only if missing, and the backfill only fills
-- rows whose result is still null. No rows are inserted or deleted; no policy changes.
-- Runs before or after 0040 (matches.result is read via to_jsonb).
--
-- OPTIONAL read-only check (run separately, after): how many match lines got a result,
-- and how many stayed null (the app derives those from the match at read time).
--
--   select coalesce(result, 'null') as result, count(*)
--   from stat_lines where match_id is not null
--   group by 1 order by 1;
--
begin;
-- 0050 — Per-player match result on stat lines (sport-depth SD-11 / GEN-01).
--
-- `stat_lines.won` is a boolean, so every draw, tie and no-result read as LOST
-- on profiles and in win rates. `result` is the player's result from THEIR side:
--   'W' win · 'D' draw · 'L' loss · 'T' tie · 'NR' no result / abandoned.
-- Nullable: null = not known (a line written before this migration that the
-- backfill below could not place, a field-event / golf line, a live match).
-- The app writes it at completion (with the appearance lines SD-11 adds) and,
-- while it is null, derives it at read time from the match. `won` stays
-- (= result 'W') for back-compat.
--
-- RLS: no change. The existing "insert stats" / "update stats" policies
-- (can_manage_match(match_id)) and "insert/update event stats" cover every
-- column of the row, so the match's scorers / hosts can write `result` and
-- nobody else can. Reads stay public ("read stats").
--
-- BACKFILL (idempotent: it only ever fills `result IS NULL`, so a re-run, or a
-- run after the app has written results, changes nothing it already set).
-- It touches ONLY lines with a match (match_id not null); golf / field-event
-- lines stay null. Per match, the outcome is:
--   • result.kind 'no_result' / 'abandoned', or status 'cancelled'   → every line 'NR'
--     ('cancelled' + lines only happens for a pre-0040 hand-closed no-result:
--      a scheduled match can't be cancelled once played)
--   • otherwise only COMPLETED matches:
--     result.kind 'tie' → every line 'T';  result.kind 'draw' → every line 'D'
--     result.kind 'awarded' / 'conceded' → the winning side from result.winner
--       (else matches.winner)
--     matches.winner 'draw' → every line 'D' ('T' for cricket — a level
--       limited-overs finish is a tie)
--     matches.winner 'home' / 'away' → decided (below)
--   • anything else (scheduled, live, completed without a winner) → untouched.
-- For a DECIDED match a line gets W / L only when its player's side is certain:
--   side = the matchday squad / pitch lineup side (match_squads, match_lineups)
--          when the player is in exactly one side's;
--          if the line's `opponent` label names one team, it must agree, else
--          the line is left null;
--        else the `opponent` label (the other team's name, written on the line);
--        else the current team roster (teams.roster / team_members), exactly
--          one side, and only when it agrees with the `won` flag.
--   'W' when side = winner; 'L' when side = loser — but a line flagged won=true
--   on the losing side is left null. With no side at all, won=true → 'W'
--   (the app set that flag from the winner's roster at the time); won=false → null.
-- No rows are inserted: appearance lines for past matches are the D2
-- backfill, later.

alter table stat_lines add column if not exists result text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stat_lines_result_check' and conrelid = 'stat_lines'::regclass
  ) then
    alter table stat_lines add constraint stat_lines_result_check
      check (result in ('W', 'D', 'L', 'T', 'NR'));
  end if;
end $$;

comment on column stat_lines.result is
  'SD-11: this player''s result from their side — W / D / L / T / NR; null = unknown (derive from the match)';

-- `matches.result` (0040) is read through to_jsonb(m) so this also runs on a
-- database where 0040 hasn't been applied yet (the key is then simply absent).
with mo as (
  select m.id as match_id, m.home_team_id, m.away_team_id,
         ht.name as home_name, awt.name as away_name,
         case
           when (to_jsonb(m) -> 'result' ->> 'kind') in ('no_result', 'abandoned') then 'NR'
           when m.status = 'cancelled' then 'NR'
           when m.status is distinct from 'completed' then null
           when (to_jsonb(m) -> 'result' ->> 'kind') = 'tie' then 'T'
           when (to_jsonb(m) -> 'result' ->> 'kind') = 'draw' then 'D'
           when (to_jsonb(m) -> 'result' ->> 'kind') in ('awarded', 'conceded') then
             case coalesce(to_jsonb(m) -> 'result' ->> 'winner', m.winner)
               when 'home' then 'home' when 'away' then 'away' end
           when m.winner = 'draw' then case when m.sport = 'cricket' then 'T' else 'D' end
           when m.winner in ('home', 'away') then m.winner
         end as outcome
  from matches m
  left join teams ht on ht.id = m.home_team_id
  left join teams awt on awt.id = m.away_team_id
)
update stat_lines sl
set result = mo.outcome
from mo
where sl.match_id = mo.match_id
  and sl.result is null
  and mo.outcome in ('NR', 'T', 'D');

with mo as (
  select m.id as match_id, m.home_team_id, m.away_team_id,
         ht.name as home_name, awt.name as away_name,
         case
           when (to_jsonb(m) -> 'result' ->> 'kind') in ('no_result', 'abandoned', 'tie', 'draw') then null
           when m.status is distinct from 'completed' then null
           when (to_jsonb(m) -> 'result' ->> 'kind') in ('awarded', 'conceded') then
             case coalesce(to_jsonb(m) -> 'result' ->> 'winner', m.winner)
               when 'home' then 'home' when 'away' then 'away' end
           when m.winner in ('home', 'away') then m.winner
         end as win_side
  from matches m
  left join teams ht on ht.id = m.home_team_id
  left join teams awt on awt.id = m.away_team_id
),
membership as (
  select sl.id, sl.won, mo.win_side,
    -- matchday squad / pitch lineup (per match)
    exists (select 1 from match_squads q where q.match_id = sl.match_id and q.side = 'home'
              and (q.starters @> jsonb_build_array(sl.player_id::text) or q.subs @> jsonb_build_array(sl.player_id::text)))
      or exists (select 1 from match_lineups l where l.match_id = sl.match_id
              and l.home @> jsonb_build_array(jsonb_build_object('playerId', sl.player_id::text))) as sq_home,
    exists (select 1 from match_squads q where q.match_id = sl.match_id and q.side = 'away'
              and (q.starters @> jsonb_build_array(sl.player_id::text) or q.subs @> jsonb_build_array(sl.player_id::text)))
      or exists (select 1 from match_lineups l where l.match_id = sl.match_id
              and l.away @> jsonb_build_array(jsonb_build_object('playerId', sl.player_id::text))) as sq_away,
    -- current team roster
    exists (select 1 from teams t where t.id = mo.home_team_id and t.roster @> jsonb_build_array(sl.player_id::text))
      or exists (select 1 from team_members tm where tm.team_id = mo.home_team_id and tm.player_id = sl.player_id) as ro_home,
    exists (select 1 from teams t where t.id = mo.away_team_id and t.roster @> jsonb_build_array(sl.player_id::text))
      or exists (select 1 from team_members tm where tm.team_id = mo.away_team_id and tm.player_id = sl.player_id) as ro_away,
    case when sl.opponent is not null and mo.home_name is distinct from mo.away_name then
      case sl.opponent when mo.away_name then 'home' when mo.home_name then 'away' end
    end as opp_side
  from stat_lines sl
  join mo on mo.match_id = sl.match_id
  where sl.result is null and mo.win_side is not null
),
sided as (
  select id, won, win_side, opp_side,
    case when sq_home and not sq_away then 'home' when sq_away and not sq_home then 'away' end as sq_side,
    case when ro_home and not ro_away then 'home' when ro_away and not ro_home then 'away' end as ro_side
  from membership
),
decided as (
  select id,
    case
      -- squad / lineup side, cross-checked with the opponent label
      when sq_side is not null then
        case
          when opp_side is not null and opp_side <> sq_side then null
          when sq_side = win_side then 'W'
          when won then null
          else 'L'
        end
      -- the opponent label
      when opp_side is not null then
        case when opp_side = win_side then 'W' when won then null else 'L' end
      -- the current roster, only where the old won flag agrees
      when ro_side is not null then
        case when ro_side = win_side and won then 'W' when ro_side <> win_side and not won then 'L' end
      -- no side at all: trust a won=true flag only
      when won then 'W'
    end as r
  from sided
)
update stat_lines sl
set result = d.r
from decided d
where sl.id = d.id
  and sl.result is null
  and d.r is not null;
commit;
