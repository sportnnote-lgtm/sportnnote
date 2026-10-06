# Analytics and crash reporting

*Built 2026-10-07 — migration 0029 (`supabase/migrations/20261010120000_analytics.sql`),
`src/core/telemetry.ts`, `src/components/ErrorBoundary.tsx`.*

## How it works

- **First-party:** everything is stored in our own Supabase database. No third party
  receives data about users, several of whom are minors (DPDP 2023). It costs nothing and
  ships to installed apps by OTA update, because there's no native code.
- **Core events come from the database:** triggers record them whenever the row is
  written — web, any APK version, or the offline outbox syncing later.
  - `signed_up`
  - `match_created` / `match_started` / `match_completed` (with `sport` and `kind` =
    friendly/tournament)
  - `tournament_created`
  - `round_created` / `round_completed` (golf)
  - `message_sent` (never the text)
  - `phone_verified` / `email_verified`
- **The app sends only:**
  - `app_open` (with `standalone` = launched from the home-screen icon);
  - `screen_view` (route name only, never parameters);
  - error reports: uncaught JS errors, unhandled promise rejections, and render crashes.
    The error screen shows a Reload button.
- **Privacy:**
  - Users are identified by their pseudonymous profile id, stamped by the server.
  - Props are short scalars only; keys that look like personal data are dropped.
  - Emails and phone numbers in error messages are masked.
  - Users can't read any of it.
  - Raw rows are kept for 13 months.
- **Abuse limits:** 120 event batches and 30 error reports per user (or install) per hour.

## Reading the numbers

Supabase → SQL editor (runs as an admin), for example `select * from kpi_weekly;`

| View | What it answers |
|---|---|
| `kpi_weekly` | Per week: active users, active organisers, active scorers, sign-ups, matches completed, golf rounds, tournaments, messages |
| `kpi_sport_weekly` | Matches and rounds completed per sport per week (which sports the pilot plays) |
| `kpi_activation` | Of each week's sign-ups, how many scored a match or round within 7 days |
| `kpi_scorer_retention` | 4-week scorer retention: first scored in week W, scored again in week W+4 |
| `kpi_crash_free` | Crash-free sessions % per day and platform |
| `errors_top` | Top errors over the last 14 days: count, users, fatal?, last seen, sample stack, screen |

**Pilot KPIs** (MASTER_ROADMAP decision C) map to:
- weekly active organisers → `kpi_weekly.active_organisers`;
- matches scored per week → `kpi_weekly.matches_completed` (+ `golf_rounds_completed`);
- 4-week scorer retention → `kpi_scorer_retention`.

## Later

- **Sentry** with the next native build, for native-level crashes (out-of-memory, native
  module faults) that JS can't catch. Needs a Sentry account (free tier).
- **A KPI dashboard page** that the agents read (roadmap 4-18).
- **Privacy policy line:** "We record how the app is used (screens opened, matches scored)
  and error reports to improve it. These aren't shared with anyone."
