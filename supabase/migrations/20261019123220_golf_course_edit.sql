-- ============================================================================
--  Sportfolio · SD-122 — golf course editing keeps finished rounds as played
--  Idempotent — safe to re-run. PREREQUISITE: 20261009120000_golf_field_events.
--
--  Courses can already be edited by their creator (and support) — policy
--  golf_courses_update in the golf migration; no policy change here. Courses
--  aren't tied to an organisation, so there is no "org admin" rule to add.
--
--  What this adds: when a course's holes (par / stroke index) or tees
--  (rating / slope / par) change, every FINISHED golf round on it that has no
--  copy of the course yet gets one (field_events.format.courseSnap = the course
--  as it was). The app scores a finished round on its copy, so an edit never
--  silently changes a recorded result; open rounds use the edited course.
--  The organiser's "Recompute finished rounds" replaces the copy on purpose.
--  New rounds also store their copy as they finish (app side), so this
--  trigger matters for rounds finished before SD-122 and for rounds the
--  course's creator doesn't manage.
-- ============================================================================

create or replace function freeze_golf_rounds_on_course_edit()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.holes_data is distinct from old.holes_data or new.tees is distinct from old.tees then
    update field_events e
       set format = e.format || jsonb_build_object('courseSnap', jsonb_build_object('holes', old.holes_data, 'tees', old.tees))
     where e.sport = 'golf'
       and e.status = 'completed'
       and e.format ->> 'courseId' = old.id::text
       and not (e.format ? 'courseSnap');
  end if;
  return new;
end $$;

drop trigger if exists freeze_golf_rounds_on_course_edit on golf_courses;
create trigger freeze_golf_rounds_on_course_edit before update on golf_courses
  for each row execute function freeze_golf_rounds_on_course_edit();
