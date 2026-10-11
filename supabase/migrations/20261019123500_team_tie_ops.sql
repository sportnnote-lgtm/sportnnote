-- SD-127 — team-tie operations (SD-48 ties: one fixture of N rubbers, each a
-- normal `matches` row sharing format->>'__seriesId', the tie spec in
-- format->>'__tie'; team A is always home). No change to `matches`.
--
-- 1. settle_team_tie(series): set aside the rubbers still to play once a side
--    has a majority ("stop" mode), or bring them back when a correction undid
--    the majority. Computed HERE from the stored results — the caller sends
--    only the series id, so a scorer can't cancel rubbers at will. Callable by
--    anyone who manages ANY rubber of the tie (its scorers, hosts, the
--    tournament's managers: can_manage_match), so the device that scored the
--    deciding rubber settles the tie, not only the host's. Idempotent.
--    Mirrors src/data/teamTie.ts tieSettlePlan / majorityIndex.
-- 2. Sealed, captain-entered lineups: tie_lineups keeps a side's lineup off
--    the public rubbers until BOTH are in (no RLS read policy — RPC only).
--    save_tie_lineup(series, side, lineup): the tie host (a rubber's host_ids
--    or the tournament's managers) for either side, or that side's team
--    managers (can_manage_team: captain / vice-captain / team admins / staff /
--    club or org admins). Once both are in, both lineups are written onto every
--    rubber (__tieLineupH / __tieLineupA, as before) and each unstarted rubber
--    gets its matchday squads. After the exchange only the host can change a
--    lineup; nobody can once that side's rubbers have started.
--    Mirrors teamTie.ts lineupEntryRule / rubberPlayers.
-- 3. get_tie_lineups(series): what the caller may see (both once exchanged;
--    before that a side's own managers and the host see it) and which sides
--    they may enter.
-- scorer_ids / host_ids / captain_id … are PLAYER ids → auth_player_ids().
-- Idempotent — safe to re-run.

create table if not exists tie_lineups (
  series_id    text not null,
  side         text not null check (side in ('home', 'away')),
  team_id      uuid references teams(id) on delete set null,
  lineup       jsonb not null,
  submitted_by uuid default auth.uid(),
  submitted_at timestamptz not null default now(),
  primary key (series_id, side)
);
alter table tie_lineups enable row level security;
-- no policies: read and written only through the functions below.
revoke all on tie_lineups from anon, authenticated;

-- Is the caller a HOST of this tie? A host of any of its rubbers, or a manager
-- of its tournament. (Scorers settle rubbers but don't enter lineups.)
create or replace function is_tie_host(p_series text)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    where m.format->>'__seriesId' = p_series and m.format ? '__tie'
      and ( m.host_ids && auth_player_ids()
         or (m.tournament_id is not null and can_manage_tournament(m.tournament_id)) )
  );
$$;

-- ---------- 1. settle ---------------------------------------------------------
create or replace function settle_team_tie(p_series text)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ids      uuid[];
  v_n        numeric;
  v_team_a   text;
  v_stop     boolean;
  v_a        numeric := 0;
  v_b        numeric := 0;
  v_at       int := -1;
  v_i        int := 0;
  r          record;
  v_stopped  int := 0;
  v_restored int := 0;
begin
  -- the tie's rubbers in order (leg, then start), locked so two scorers
  -- settling at once serialise
  select array_agg(id order by leg, starts_at) into v_ids from (
    select m.id, m.starts_at,
           case when m.format->>'__seriesLeg' ~ '^\d+$' then (m.format->>'__seriesLeg')::int else 0 end as leg
    from matches m
    where m.format->>'__seriesId' = p_series and m.format ? '__tie'
    for update
  ) x;
  if v_ids is null then
    return jsonb_build_object('stopped', 0, 'restored', 0, 'decided', false);
  end if;
  if not exists (select 1 from unnest(v_ids) i where can_manage_match(i)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select coalesce(max(case when m.format->>'__seriesN' ~ '^\d+$' then (m.format->>'__seriesN')::int end), count(*)),
         max(m.format->>'__seriesA')
    into v_n, v_team_a
    from matches m where m.id = any(v_ids);
  if v_n is null or v_n < 1 then v_n := 1; end if;
  -- the spec's dead-rubber mode (tieSpecFromFormat: anything but 'play' = stop)
  select coalesce(((m.format->>'__tie')::jsonb->>'dead'), 'stop') <> 'play' into v_stop
    from matches m where m.id = v_ids[1];

  -- walk the rubbers: the one that takes a side past half of all rubbers
  for r in select m.* from unnest(v_ids) with ordinality u(id, ord) join matches m on m.id = u.id order by u.ord loop
    if r.status = 'completed' then
      if r.winner = 'draw' then
        if r.format->'__tieHalf' = 'true'::jsonb
           and coalesce(r.result->>'kind', '') not in ('no_result', 'abandoned')
           and coalesce(r.state->>'method', '') <> 'double-forfeit' then
          v_a := v_a + 0.5; v_b := v_b + 0.5;
        end if;
      elsif r.winner in ('home', 'away') then
        if (r.winner = 'home') = (r.home_team_id::text = v_team_a) then v_a := v_a + 1; else v_b := v_b + 1; end if;
      end if;
    end if;
    if v_at < 0 and (v_a > v_n / 2 or v_b > v_n / 2) then v_at := v_i; end if;
    v_i := v_i + 1;
  end loop;

  if v_at >= 0 and v_stop then
    update matches m
       set status = 'cancelled', format = m.format || '{"__tieDead": true}'::jsonb, updated_at = now()
      from unnest(v_ids) with ordinality u(id, ord)
     where m.id = u.id and u.ord - 1 > v_at and m.status in ('scheduled', 'postponed');
    get diagnostics v_stopped = row_count;
  elsif v_at < 0 then
    update matches m
       set status = 'scheduled', format = m.format || '{"__tieDead": false}'::jsonb, updated_at = now()
     where m.id = any(v_ids) and m.status = 'cancelled' and m.format->'__tieDead' = 'true'::jsonb;
    get diagnostics v_restored = row_count;
  end if;
  return jsonb_build_object('stopped', v_stopped, 'restored', v_restored, 'decided', v_at >= 0);
end $$;

-- ---------- 2. lineups --------------------------------------------------------

-- A side's lineup: the sealed row, else one already on the rubbers (a tie whose
-- lineups were entered before this migration).
create or replace function tie_side_lineup(p_series text, p_side text)
  returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select l.lineup from tie_lineups l where l.series_id = p_series and l.side = p_side),
    (select (m.format->>(case when p_side = 'home' then '__tieLineupH' else '__tieLineupA' end))::jsonb
       from matches m
      where m.format->>'__seriesId' = p_series and m.format ? '__tie'
        and coalesce(m.format->>(case when p_side = 'home' then '__tieLineupH' else '__tieLineupA' end), '') <> ''
      limit 1));
$$;

-- The players a side fields in rubber p_i (0-based) — teamTie.ts rubberPlayers:
-- the side's positions (p for the ABC side, q for XYZ) looked up in lineup.pos,
-- or lineup.pairs[i] for a nominated rubber; null unless exactly 1 (singles) or
-- 2 (doubles) different players.
create or replace function tie_rubber_players(p_spec jsonb, p_i int, p_side text, p_lineup jsonb)
  returns jsonb language plpgsql immutable as $$
declare
  v_r    jsonb := p_spec->'rubbers'->p_i;
  v_abc  text := case when p_spec->>'abc' = 'away' then 'away' else 'home' end;
  v_pos  jsonb;
  v_ids  text[];
  v_want int;
begin
  if v_r is null or p_lineup is null then return null; end if;
  v_pos := case when p_side = v_abc then v_r->'p' else v_r->'q' end;
  if jsonb_typeof(v_pos) = 'array' and jsonb_array_length(v_pos) > 0 then
    select array_agg(p_lineup->'pos'->>(e #>> '{}') order by o) into v_ids
      from jsonb_array_elements(v_pos) with ordinality t(e, o);
  elsif jsonb_typeof(p_lineup->'pairs'->(p_i::text)) = 'array' then
    select array_agg(e #>> '{}' order by o) into v_ids
      from jsonb_array_elements(p_lineup->'pairs'->(p_i::text)) with ordinality t(e, o);
  end if;
  v_want := case when v_r->>'k' = 'S' then 1 else 2 end;
  select array_agg(x) into v_ids from unnest(v_ids) x where coalesce(x, '') <> '';
  if coalesce(array_length(v_ids, 1), 0) <> v_want
     or (select count(distinct x) from unnest(v_ids) x) <> v_want then
    return null;
  end if;
  return to_jsonb(v_ids);
end $$;

create or replace function save_tie_lineup(p_series text, p_side text, p_lineup jsonb)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_home    uuid;
  v_away    uuid;
  v_team    uuid;
  v_host    boolean;
  v_mgr     boolean;
  v_started boolean;
  v_side_in boolean;
  v_other_in boolean;
  v_clean   jsonb;
  v_h       jsonb;
  v_a       jsonb;
  r         record;
  v_spec    jsonb;
  v_pl      jsonb;
  v_s       text;
begin
  if p_side not in ('home', 'away') then raise exception 'bad_side' using errcode = '22023'; end if;
  select m.home_team_id, m.away_team_id into v_home, v_away
    from matches m where m.format->>'__seriesId' = p_series and m.format ? '__tie'
    order by m.starts_at limit 1;
  if not found then raise exception 'tie_not_found' using errcode = 'P0002'; end if;
  v_team := case when p_side = 'home' then v_home else v_away end;
  v_host := is_tie_host(p_series);
  v_mgr := v_team is not null and can_manage_team(v_team);
  -- the side's rubbers have started (lineupEntryRule: any rubber live / done)
  v_started := exists (select 1 from matches m where m.format->>'__seriesId' = p_series and m.format ? '__tie'
                        and m.status in ('live', 'completed'));
  v_side_in := tie_side_lineup(p_series, p_side) is not null;
  v_other_in := tie_side_lineup(p_series, case when p_side = 'home' then 'away' else 'home' end) is not null;
  if not v_host and not v_mgr then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_started and v_side_in then raise exception 'started' using errcode = '42501'; end if;
  if not v_host and v_side_in and v_other_in then raise exception 'exchanged' using errcode = '42501'; end if;

  -- shape: { pos: {letter: id}, pairs: {i: [id, id]} }, small
  if jsonb_typeof(p_lineup) <> 'object' or length(p_lineup::text) > 8000
     or jsonb_typeof(coalesce(p_lineup->'pos', '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_lineup->'pairs', '{}'::jsonb)) <> 'object' then
    raise exception 'bad_lineup' using errcode = '22023';
  end if;
  v_clean := jsonb_build_object('pos', coalesce(p_lineup->'pos', '{}'::jsonb), 'pairs', coalesce(p_lineup->'pairs', '{}'::jsonb),
                                'at', to_jsonb(now()));
  insert into tie_lineups (series_id, side, team_id, lineup, submitted_by, submitted_at)
       values (p_series, p_side, v_team, v_clean, auth.uid(), now())
  on conflict (series_id, side) do update
       set lineup = excluded.lineup, team_id = excluded.team_id, submitted_by = excluded.submitted_by, submitted_at = now();

  v_h := tie_side_lineup(p_series, 'home');
  v_a := tie_side_lineup(p_series, 'away');
  if v_h is null or v_a is null then
    return jsonb_build_object('both_in', false);
  end if;

  -- Both in: exchange them (onto every rubber, as JSON text like the app
  -- writes) and give each unstarted rubber its squads.
  for r in select m.id, m.format, m.status from matches m
            where m.format->>'__seriesId' = p_series and m.format ? '__tie' for update loop
    update matches set format = format || jsonb_build_object('__tieLineupH', v_h::text, '__tieLineupA', v_a::text)
     where id = r.id;
    if r.status in ('scheduled', 'postponed') then
      v_spec := (r.format->>'__tie')::jsonb;
      foreach v_s in array array['home', 'away'] loop
        v_pl := tie_rubber_players(v_spec,
                  (case when r.format->>'__seriesLeg' ~ '^\d+$' then (r.format->>'__seriesLeg')::int else 1 end) - 1,
                  v_s, case when v_s = 'home' then v_h else v_a end);
        if v_pl is not null then
          insert into match_squads (match_id, side, starters, subs) values (r.id, v_s, v_pl, '[]'::jsonb)
          on conflict (match_id, side) do update set starters = excluded.starters, subs = excluded.subs;
        end if;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('both_in', true);
end $$;

create or replace function get_tie_lineups(p_series text)
  returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_home uuid;
  v_away uuid;
  v_host boolean;
  v_h    jsonb;
  v_a    jsonb;
  v_ch   boolean;
  v_ca   boolean;
  v_both boolean;
begin
  select m.home_team_id, m.away_team_id into v_home, v_away
    from matches m where m.format->>'__seriesId' = p_series and m.format ? '__tie'
    order by m.starts_at limit 1;
  if not found then return null; end if;
  v_host := is_tie_host(p_series);
  v_h := tie_side_lineup(p_series, 'home');
  v_a := tie_side_lineup(p_series, 'away');
  v_both := v_h is not null and v_a is not null;
  v_ch := v_host or (v_home is not null and can_manage_team(v_home));
  v_ca := v_host or (v_away is not null and can_manage_team(v_away));
  return jsonb_build_object(
    'home', jsonb_build_object('in', v_h is not null, 'lineup', case when v_both or v_ch then v_h end),
    'away', jsonb_build_object('in', v_a is not null, 'lineup', case when v_both or v_ca then v_a end),
    'can', jsonb_build_object('home', v_ch, 'away', v_ca, 'host', v_host));
end $$;

revoke all on function is_tie_host(text), settle_team_tie(text), tie_side_lineup(text, text),
  tie_rubber_players(jsonb, int, text, jsonb), save_tie_lineup(text, text, jsonb), get_tie_lineups(text)
  from public, anon;
grant execute on function is_tie_host(text), settle_team_tie(text), save_tie_lineup(text, text, jsonb), get_tie_lineups(text)
  to authenticated;
