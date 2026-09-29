-- 0022: School Houses as a first-class, per-school list + per-student House timeline.
-- Houses are a school-level managed list ({name, colorHex}); each student's House
-- over time is a stint timeline on their membership (mirrors the class/grades
-- timeline), so a past tournament shows the House the student was in at that date.
-- Houses are independent of class and team membership (spec §20–21).

alter table organizations add column if not exists houses jsonb not null default '[]';
alter table org_members  add column if not exists houses jsonb not null default '[]';
