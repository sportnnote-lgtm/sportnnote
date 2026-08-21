# Demo data: seed now, clean slate before launch

The live backend (`mpgbvbylmkwasjgupsbq`) has **no real users yet**, so every row
in the content tables is disposable test data. The plan:

1. **Seed** a realistic dataset now, to test & enhance against the live backend.
2. Add more freely via the app while building.
3. **Wipe everything** just before go-live — one clean-slate script removes the
   seed *and* whatever was added later, leaving a pristine DB with your logins
   intact.

You never have to track what was added — the wipe is a full content reset.

---

## Seed (dev only)

Seeding goes through the app's repo layer as the signed-in user, so data is
correctly owned (RLS-valid) and uses real divisions (migration 0008). The hook is
guarded by `__DEV__` — it does **not** exist in a production (`eas build`) bundle.

In the running dev app's browser console:

```js
await __sportfolioSeedDemo()                 // idempotent by name
await __sportfolioSeedDemo({ hostName: 'Your Name' })
await __sportfolioSeedDemo({ force: true })   // add a second copy anyway
```

It creates **Inter-School Championship 2026** (football, League + Knockout) with
two divisions — **U14 Boys** (Lions, Tigers, Panthers, Cheetahs) and **U16 Girls**
(Falcons, Hawks) — each team rostered into its division with a captain. It appears
under Organize → *Tournaments you're hosting*.

> Needs migration 0008 for divisions to persist; without it the tournament is
> still created (as a single implicit division) and the hook says so.

---

## Clean slate (run before go-live)

Run in the Supabase SQL editor. This deletes **all content** but **keeps** auth
logins, their `profiles`, account-linked `players` (`profile_id` set), and
`user_reminder_prefs` — so you and any real accounts can still sign in.

```sql
begin;

-- match-level content
delete from match_events;
delete from match_lineups;
delete from match_squads;
delete from match_disputes;
delete from stat_lines;
delete from matches;

-- tournament structure
delete from tournament_teams;
delete from tournament_categories;
delete from tournaments;

-- teams
delete from team_invites;
delete from team_staff;
delete from team_members;
delete from teams;

-- sporting identities NOT tied to a real login (pending/test players).
-- Account-linked players (profile_id set) are kept so logins still resolve.
delete from players where profile_id is null;

-- orgs & other content
delete from organizations;
delete from schools;
delete from venues;
delete from listings;
delete from follows;
delete from contact_otps;
delete from reminder_sends;
delete from push_tokens;
delete from support_cases;
delete from player_sport_profiles;

commit;
```

### Variants

- **Also reset your own player identity** (fully blank): replace the players line
  with `delete from players;` (the app re-creates your player on next use).
- **Remove test *logins* too:** delete those users from **Authentication → Users**
  in the Supabase dashboard (that cascades their `profiles`). Keep the accounts
  you want to launch with.

> Preview first: run the `delete` lines as `select count(*) from …` to see how
> many rows each will remove before committing.
