-- SD-154 (international I-2b): school team levels and feeder tournaments.
--
-- 1. teams.level — a school squad's level ("Varsity", "JV", "A", "B", "U13 A"),
--    so one school / club fields several teams in a sport. Shown after the name
--    in fixtures and tables ("Greenwood JV"). NULL = the main / only team (every
--    existing team). Written by the team's managers under the existing teams
--    policies.
-- 2. tournaments.qualifies_to — a FEEDER link: this tournament's top N (per
--    group, or overall) go through to another tournament:
--      {"tournamentId": uuid, "tournamentName": text, "topN": int, "per": "group"|"overall", "sport": text}
--    NULL = not a feeder (every existing tournament). Organisers write it under
--    the existing tournaments policies.
-- 3. tournament_teams.qualified_from — the feeder an entry qualified from (the
--    "Qualified from X" badge). Only the RECEIVING tournament's organisers may
--    set or change it (a team asking to join can't claim a qualification).
--
-- Idempotent: safe to run twice.

alter table teams add column if not exists level text;
alter table tournaments add column if not exists qualifies_to jsonb;
alter table tournament_teams add column if not exists qualified_from uuid references tournaments(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_level_shape') then
    alter table teams add constraint teams_level_shape
      check (level is null or char_length(btrim(level)) between 1 and 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tournaments_qualifies_to_shape') then
    alter table tournaments add constraint tournaments_qualifies_to_shape
      check (qualifies_to is null or (
        jsonb_typeof(qualifies_to) = 'object'
        and jsonb_typeof(qualifies_to->'tournamentId') = 'string'
        and jsonb_typeof(qualifies_to->'topN') = 'number'
        and (qualifies_to->>'topN')::numeric between 1 and 64
        and coalesce(qualifies_to->>'per', 'group') in ('group', 'overall')
        and (qualifies_to->>'tournamentId') <> id::text
        and pg_column_size(qualifies_to) < 2000
      ));
  end if;
end $$;

-- The receiving tournament finds its feeders by the link's target.
create index if not exists tournaments_qualifies_to_target_idx
  on tournaments ((qualifies_to->>'tournamentId')) where qualifies_to is not null;

-- Only the receiving tournament's organisers set the badge.
create or replace function guard_qualified_from()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_client_request() then return new; end if;
  if tg_op = 'INSERT' then
    if new.qualified_from is not null and not can_manage_tournament(new.tournament_id) then
      new.qualified_from := null;
    end if;
  elsif new.qualified_from is distinct from old.qualified_from and not can_manage_tournament(old.tournament_id) then
    raise exception 'Only the organizer can change this entry' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_qualified_from on tournament_teams;
create trigger guard_qualified_from before insert or update on tournament_teams
  for each row execute function guard_qualified_from();

comment on column teams.level is 'SD-154: squad level (Varsity / JV / A / B / U13 A); NULL = main team';
comment on column tournaments.qualifies_to is 'SD-154: feeder link {tournamentId, tournamentName, topN, per, sport}; NULL = not a feeder';
comment on column tournament_teams.qualified_from is 'SD-154: the feeder tournament this entry qualified from';
