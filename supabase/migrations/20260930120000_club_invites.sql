-- 0019: Club invites — a shareable token someone redeems to JOIN a club as a
-- member (distinct from team_invites, which is a captain/coach claim of a per-sport
-- team). Mirrors that table's shape + RLS.

create table if not exists club_invites (
  token       text primary key,
  club_id     uuid references clubs(id) on delete cascade,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table club_invites enable row level security;

do $$ begin
  drop policy if exists club_invites_read on club_invites;
  create policy club_invites_read on club_invites for select using (true);
  drop policy if exists club_invites_write on club_invites;
  create policy club_invites_write on club_invites
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
end $$;
