-- SD-153 (international I-2a): school-sport market presets.
--
-- 1. organizations.market — the community's school-sport market ('in',
--    'gulf-british', 'gulf-indian', 'uk', 'sg', 'my', 'au', 'us'; see
--    src/core/markets.ts). It sets the class names, the graduating-class
--    suggestion, the default age cut-off and age bands, and a few words.
--    NULL = India (every community created before this migration keeps today's
--    behaviour). Written by the app at creation (from the creator's region) and
--    under Edit community; covered by the existing orgs_update policy.
-- 2. meet_age_cutoff() learns the recurring school-year cut-offs, mirroring
--    core/age.ts ageCutoff():
--      'aug31' — 31 August at the start of the school year (England & Wales,
--                British-curriculum schools): the most recent 31 Aug on or
--                before the meet's first day (a June 2027 meet → 2026-08-31);
--      'sep1'  — 1 September at the start of the school year (likewise).
--    Both are the 1st / last day of a month, so the privacy rule (a cut-off
--    can't be used to narrow down a child's birthday) still holds. Everything
--    else is unchanged; the default stays 31 Dec.
--
-- Idempotent: safe to run twice. Grants on meet_age_cutoff are kept by
-- CREATE OR REPLACE (re-stated below anyway).

alter table organizations add column if not exists market text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_market_check') then
    alter table organizations add constraint organizations_market_check
      check (market is null or market in ('in', 'gulf-british', 'gulf-indian', 'uk', 'sg', 'my', 'au', 'us'));
  end if;
end $$;

comment on column organizations.market is 'SD-153: school-sport market preset (class names, graduating class, age cut-off/bands, terms); NULL = India';

create or replace function meet_age_cutoff(p_tid uuid, p_sport text)
  returns date language sql stable security definer set search_path = public as $$
  select case
    -- a board's date must be the 1st or the last day of a month (31 Dec, 1 Jan,
    -- 1 Oct…), so repeated changes can't be used to narrow down a child's birthday
    when b ~ '^\d{4}-\d{2}-\d{2}$' and (extract(day from b::date) = 1 or (b::date + 1) = date_trunc('month', b::date + 1)::date) then b::date
    when b = 'jan1'  then make_date(extract(year from s)::int, 1, 1)
    when b = 'meet'  then s
    when b = 'today' then current_date
    -- SD-153: the most recent 31 Aug / 1 Sep on or before the meet
    when b = 'aug31' then case when to_char(s, 'MM-DD') >= '08-31'
                               then make_date(extract(year from s)::int, 8, 31)
                               else make_date(extract(year from s)::int - 1, 8, 31) end
    when b = 'sep1'  then case when to_char(s, 'MM-DD') >= '09-01'
                               then make_date(extract(year from s)::int, 9, 1)
                               else make_date(extract(year from s)::int - 1, 9, 1) end
    else make_date(extract(year from s)::int, 12, 31)
  end
  from (select coalesce(t.formats->p_sport->>'ageOn', 'dec31') as b, coalesce(t.start_date, current_date) as s
          from tournaments t where t.id = p_tid) x;
$$;

revoke all on function meet_age_cutoff(uuid, text) from public, anon;
grant execute on function meet_age_cutoff(uuid, text) to authenticated;
