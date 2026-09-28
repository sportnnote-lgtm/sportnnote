-- 0020: Organization membership as a proper join table + a membership-request
-- lifecycle. Roles gain Owner (top role, never zero) and Referee.
--
-- Previously membership lived in organizations.members (jsonb), mutated wholesale.
-- We normalise it into org_members (one row per person per org, carrying role, the
-- active window since/until, and the academic grade timeline as jsonb). The data
-- layer re-assembles Organization.members from these rows, so app code that reads
-- org.members is unchanged. The jsonb column is left in place (vestigial) for a
-- safe transition and can be dropped in a later cleanup migration.

create table if not exists org_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  role       text not null default 'Member' check (role in ('Owner','Admin','Organizer','Scorer','Referee','Member')),
  since      date,
  until      date,                         -- absent = active member
  grades     jsonb not null default '[]',  -- academic class timeline (schools)
  primary key (org_id, player_id)
);
create index if not exists org_members_player_idx on org_members(player_id);

-- One-time copy of existing jsonb members -> rows. Each element is
-- {playerId, role, since?, until?, grades?}.
insert into org_members (org_id, player_id, role, since, until, grades)
select o.id,
       (m->>'playerId')::uuid,
       coalesce(nullif(m->>'role',''), 'Member'),
       nullif(m->>'since','')::date,
       nullif(m->>'until','')::date,
       coalesce(m->'grades', '[]'::jsonb)
from organizations o
cross join lateral jsonb_array_elements(coalesce(o.members, '[]'::jsonb)) as m
where (m->>'playerId') is not null
on conflict (org_id, player_id) do nothing;

-- Guarantee at least one Owner per org (Owner is new, so none exist yet): promote
-- the earliest-joined active Admin of each org to Owner, or the earliest active
-- member if the org has no admin.
with ranked as (
  select org_id, player_id,
         row_number() over (
           partition by org_id
           order by (role = 'Admin') desc, coalesce(since, '0001-01-01') asc, player_id
         ) as rn
  from org_members
  where until is null
)
update org_members om
set role = 'Owner'
from ranked r
where om.org_id = r.org_id and om.player_id = r.player_id and r.rn = 1
  and not exists (
    select 1 from org_members o2
    where o2.org_id = om.org_id and o2.role = 'Owner' and o2.until is null
  );

-- Membership requests: invites (org -> person) and join-requests (person -> org).
-- Membership is only created when a request is accepted.
create table if not exists org_requests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  direction   text not null check (direction in ('invite','request')),
  role        text not null default 'Member' check (role in ('Owner','Admin','Organizer','Scorer','Referee','Member')),
  status      text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled','expired')),
  created_by  uuid references players(id) on delete set null,
  message     text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references players(id) on delete set null
);
create index if not exists org_requests_org_idx on org_requests(org_id, status);
create index if not exists org_requests_player_idx on org_requests(player_id, status);
-- At most one pending request/invite per (org, person, direction).
create unique index if not exists org_requests_pending_uk
  on org_requests(org_id, player_id, direction) where status = 'pending';

-- RLS: mirror the existing org model (public read, authenticated write; role
-- enforcement stays in app code).
alter table org_members enable row level security;
alter table org_requests enable row level security;
do $$
declare t text;
begin
  foreach t in array array['org_members','org_requests'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format(
      'create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t || '_write', t
    );
  end loop;
end $$;
