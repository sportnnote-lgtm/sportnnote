-- 0011 — Create the profile row from a DB trigger on sign-up.
--
-- Why: sign-up used to create the auth user and then, from the CLIENT, insert
-- the profiles row. That only works while "Confirm email" is OFF (the client
-- gets a session immediately). The moment you turn email verification ON, the
-- client has NO session right after signUp, so the RLS-guarded profile insert
-- fails (auth.uid() is null) — sign-up errors even though the account exists.
--
-- This trigger makes the profile the moment the auth user is created, running as
-- the database (SECURITY DEFINER), so it works with OR without a session. The
-- app now also passes the sign-up fields as user metadata (raw_user_meta_data)
-- for the trigger to read. The client keeps an idempotent upsert as a fallback
-- for deployments where this migration hasn't been applied yet.
--
-- ORDERING (important): run THIS migration BEFORE you flip Authentication →
-- Email → "Confirm email" to ON. With confirm-email ON and no trigger, sign-up
-- creates an auth user with no profile. See docs/email-verification.md.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base_handle text;
  new_handle  text;
  n           int := 0;
begin
  -- Unique handle derived from the email local-part (append a counter on clash).
  base_handle := nullif(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]', '', 'g'), '');
  base_handle := coalesce(base_handle, 'user');
  new_handle := base_handle;
  while exists (select 1 from public.profiles where handle = new_handle) loop
    n := n + 1;
    new_handle := base_handle || n::text;
  end loop;

  insert into public.profiles (id, full_name, handle, role, dob, phone, guardian)
  values (
    new.id,
    coalesce(nullif(meta->>'full_name', ''), 'Player'),
    new_handle,
    coalesce(nullif(meta->>'role', ''), 'fan'),
    nullif(meta->>'dob', '')::date,
    nullif(meta->>'phone', ''),
    case when meta ? 'guardian' and jsonb_typeof(meta->'guardian') = 'object' then meta->'guardian' else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
