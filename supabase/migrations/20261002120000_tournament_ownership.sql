-- 0021: Tournament ownership — retain the creator, and audit ownership transfers.
--
-- Ownership (individual via host_ids vs organization via host_org_id) already
-- exists. This adds: the CREATOR (retained across transfers) and an audit trail of
-- who transferred ownership from/to whom and when.

alter table tournaments add column if not exists created_by uuid references players(id) on delete set null;

-- Backfill created_by from the legacy organizer_id where it points at a player.
update tournaments t
set created_by = p.id
from players p
where t.created_by is null and t.organizer_id is not null and p.id = t.organizer_id;

create table if not exists tournament_ownership_events (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  action        text not null check (action in ('created','transferred')),
  from_kind     text check (from_kind in ('individual','org')),
  from_name     text,
  to_kind       text check (to_kind in ('individual','org')),
  to_name       text,
  by_player_id  uuid references players(id) on delete set null,
  by_name       text,
  at            timestamptz not null default now()
);
create index if not exists tournament_ownership_events_idx on tournament_ownership_events(tournament_id, at);

alter table tournament_ownership_events enable row level security;
do $$ begin
  drop policy if exists toe_read on tournament_ownership_events;
  create policy toe_read on tournament_ownership_events for select using (true);
  drop policy if exists toe_write on tournament_ownership_events;
  create policy toe_write on tournament_ownership_events
    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
end $$;
