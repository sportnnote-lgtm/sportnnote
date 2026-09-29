-- 0023: Tournament participation rule (spec §25). The tournament defines who it is
-- contested by, independent of the underlying team/house/student structure:
--   open (default) | inter_house | school_team | individual
alter table tournaments add column if not exists participation text
  check (participation in ('open','inter_house','school_team','individual'));
