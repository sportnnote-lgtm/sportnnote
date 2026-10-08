-- 0037 — Signing up with an invited number always claims the team spot.
--
-- A "not me" report used to block the claim (reported_at is null). But the old
-- report link recorded on a plain GET, so a chat app building a link preview could
-- flag someone who never tapped it — and their sign-up then skipped the team spot.
-- Proving the number with an SMS code settles it: claim the row and clear the flag.
create or replace function phone_login_attach_player(p_profile uuid, p_phone text)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr profiles%rowtype;
  pid uuid;
begin
  select * into pr from profiles where id = p_profile;
  if not found then raise exception 'no profile'; end if;
  select id into pid from players where profile_id = p_profile limit 1;
  if pid is not null then
    update players set phone_verified = true where id = pid and phone_key(phone) = phone_key(p_phone);
    return pid;
  end if;
  select id into pid from players
    where profile_id is null and phone_key(phone) = phone_key(p_phone)
    order by (reported_at is null) desc, created_at limit 1;
  if pid is not null then
    update players set profile_id = p_profile, full_name = pr.full_name, dob = pr.dob, guardian = pr.guardian,
                       phone_verified = true, reported_at = null
      where id = pid;
    return pid;
  end if;
  insert into players (profile_id, full_name, phone, dob, guardian, phone_verified, sports)
  values (p_profile, pr.full_name, p_phone, pr.dob, pr.guardian, true, '{}')
  returning id into pid;
  return pid;
end $$;

revoke all on function phone_login_attach_player(uuid, text) from public, anon, authenticated;
grant execute on function phone_login_attach_player(uuid, text) to service_role;
