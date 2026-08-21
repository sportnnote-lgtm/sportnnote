-- ============================================================================
--  Sportfolio · migration 0008 — Tournament categories / divisions
--  Delta on top of schema.sql + migrations 0001–0007. Idempotent — safe to re-run.
--
--  School & college sport is organised by division: age group × gender
--  (U14 Boys, U16 Girls, Open Mixed…). One meet runs many divisions at once, and
--  a club/school enters a separate team into each. This adds:
--    - tournament_categories: the divisions a tournament defines
--    - tournament_teams.category_id: which division a team entry belongs to
--
--  A SEPARATE table (not a tournaments column) on purpose: reads are isolated, so
--  adding this never affects the main tournament fetch. Categories are optional —
--  a tournament with none behaves exactly as before (a single implicit division).
-- ============================================================================

create table if not exists tournament_categories (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  label         text not null,              -- display, e.g. 'U14 Boys' (always set)
  age_group     text,                       -- structured, e.g. 'U14' (null for custom)
  gender        text check (gender in ('boys', 'girls', 'mixed')),  -- null for custom
  sort          int  not null default 0,    -- display order
  created_at    timestamptz not null default now()
);

create index if not exists tournament_categories_tid_idx on tournament_categories (tournament_id);

alter table tournament_categories enable row level security;
drop policy if exists "read tournament categories" on tournament_categories;
create policy "read tournament categories" on tournament_categories for select using (true);
drop policy if exists "authed write tournament categories" on tournament_categories;
create policy "authed write tournament categories" on tournament_categories for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Which division a team entry is in. Null = the tournament's single/implicit
-- division (or a tournament with no categories at all). On delete of a category,
-- its entries fall back to null rather than disappearing.
alter table tournament_teams
  add column if not exists category_id uuid references tournament_categories(id) on delete set null;
