-- ============================================================================
--  SD-152 · Sign-up can't grant staff roles (security fix — run this first)
--  Idempotent — safe to re-run.
--
--  Migration 0025 (security_hardening) made handle_new_user() keep only the
--  self-service roles from sign-up metadata. Migration 20261016120000_phone_login
--  later redefined handle_new_user() from the OLDER 0011 body, which dropped that
--  check. The sign-up trigger runs as the auth server (no client JWT), so the
--  guard_profile_role() trigger doesn't step in either. Result: an email sign-up
--  that sends {"role": "support"} in its metadata gets a support profile — the
--  verification console, i.e. every uploaded ID document (children included).
--
--  This adds a BEFORE INSERT trigger on profiles, independent of whichever
--  handle_new_user() body is live: a staff role ('support' / 'admin') that came
--  from the new user's sign-up metadata is turned into 'fan'. Staff roles granted
--  later by SQL (UPDATE) are unaffected.
--
--  Check on live after running:
--    select id, handle, role, created_at from profiles where role in ('support','admin');
--  and demote anything you didn't grant yourself.
-- ============================================================================

create or replace function guard_signup_role()
  returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  meta_role text;
begin
  if new.role not in ('support', 'admin') then return new; end if;
  select u.raw_user_meta_data->>'role' into meta_role from auth.users u where u.id = new.id;
  if meta_role is not null and meta_role = new.role then
    new.role := 'fan';
  end if;
  return new;
end $$;

drop trigger if exists guard_signup_role on profiles;
create trigger guard_signup_role before insert on profiles
  for each row execute function guard_signup_role();
