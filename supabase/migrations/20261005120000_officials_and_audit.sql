-- 0024: Per-tournament officials (§9) + a general activity/audit trail (§27).
--
-- tournament_officials: the org-level Scorer/Referee role is only eligibility; this
-- records who is actually assigned to officiate a specific tournament.
create table if not exists tournament_officials (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  role          text not null check (role in ('scorer','referee')),
  assigned_by   uuid references players(id) on delete set null,
  at            timestamptz not null default now(),
  primary key (tournament_id, player_id, role)
);
create index if not exists tournament_officials_idx on tournament_officials(tournament_id, role);

-- activity_log: a traceable record of meaningful org/tournament changes (member
-- joined/left/role-changed, official assigned, etc). Names are snapshotted in detail.
create table if not exists activity_log (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('org','tournament')),
  ref_id       uuid not null,
  action       text not null,
  detail       text,
  by_player_id uuid references players(id) on delete set null,
  by_name      text,
  at           timestamptz not null default now()
);
create index if not exists activity_log_ref_idx on activity_log(scope, ref_id, at);

alter table tournament_officials enable row level security;
alter table activity_log enable row level security;
do $$
declare t text;
begin
  foreach t in array array['tournament_officials','activity_log'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t || '_write', t);
  end loop;
end $$;
