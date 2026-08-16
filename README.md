# SportnNote

A multi-sport tracking & scoring app — "CricHeroes for every sport." First
target: a school/college **annual sports meet** (schedules, teams, live scores,
player profiles, stats) for students and parents, across 6 sports to start.

Mobile-first (iOS + Android) via **Expo / React Native + TypeScript**, with
**Supabase** (Postgres + Auth + Realtime + Storage) as the backend.

## Run it

```bash
cd sportfolio
npm install
npm run ios      # or: npm run android / npm run web
```

The app boots in **demo mode** against local sample data (no backend needed).
Open any match → the **live scorer** works fully offline.

### Going live with Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. SQL editor → run `supabase/schema.sql`, then `supabase/seed.sql`.
3. `cp .env.example .env` and fill in `EXPO_PUBLIC_SUPABASE_URL` +
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Settings → API).
4. Restart: `npm run ios`. The app now uses real auth + data, and the live
   scorer **persists every action and broadcasts it to all viewers in realtime**.

Sign up as an **organizer/scorer** to score matches; **parents/fans** get a
read-only live scoreboard. The pilot RLS policy lets any signed-in user score —
tighten to the assigned scorer before production (see the comment in
`schema.sql`).

## Architecture — shared core + sport plugins

The core platform knows nothing about how any sport is scored. Each sport is a
self-contained **plugin** implementing one contract (`src/sports/types.ts`):

```
createInitialState → reducer (pure scoring rules) → summary (scoreboard) → ScoringControls (UI)
```

The generic `LiveScoringScreen` looks up the plugin by `sport`, runs its reducer
in a `useReducer`, and renders the universal `<Scoreboard/>` + the plugin's own
controls. **Adding a sport never touches the core.**

```
src/
  core/        theme, domain types, supabase client, auth context, mock data
  data/        repos (Supabase ↔ demo fallback), demoStore, hooks, useLiveMatch
               (realtime), stats (player rollups), followStore, notifyStore
  core/        ...,notifications (Expo push + in-app feed)
  sports/      types.ts (the plugin contract), registry.ts, one folder/file per sport
  components/  Scoreboard, MatchCard, ui primitives (incl. form fields)
  screens/     Auth, Home, Schedule, Organize, Discover, Profile, LiveScoring,
               CreateTournament, Teams, ScheduleMatch
  navigation/  tabs + stack (auth-gated; Organize tab is organizer-only)
supabase/
  schema.sql   shared-core Postgres schema + RLS + realtime
  seed.sql     demo school meet (matches the in-app mock data)
```

### How live scoring stays in sync

`useLiveMatch` builds state by replaying the `match_events` log through the
sport plugin's **pure reducer**, then subscribes to realtime INSERTs. The scorer
applies actions optimistically and persists each as an event; every viewer
replays the same events and lands on the same scoreboard. No drift, plus undo
and audit come free from the log.

### Scoring archetypes implemented

| Archetype          | Sport(s)              |
|--------------------|-----------------------|
| goal / time        | Football              |
| running points     | Basketball, Volleyball|
| set → game → point | Badminton             |
| raid               | Kabaddi               |
| measured           | Athletics             |

### Add a new sport (e.g. cricket)

1. Create `src/sports/cricket/index.tsx` implementing `SportPlugin`.
2. Add it to `SPORTS` in `src/sports/registry.ts`.
3. Add `'cricket'` to `SportId` in `src/core/types.ts`.

That's it — schedule, scoreboard, navigation and profiles pick it up for free.

## Why the reducer is pure

Scoring is an **append-only event log** (`match_events`). The same pure reducer
runs on-device for instant updates and (later) on the server to validate the
authoritative state by replaying events — so client and server can never
disagree, and undo/audit come for free.

## Roadmap

- **Phase 1:** core + all 6 sports + live scorer. ✅
- **Phase 2:** Supabase auth/data/realtime + organizer flow (create tournament,
  manage teams, schedule matches). ✅
- **Phase 3:** data-driven player profiles + stat rollups + Discover. ✅
- **Phase 4:** live stat attribution — scorer tags who scored, profiles update
  straight from scoring (football wired; other sports adopt the same pattern). ✅
- **Phase 5:** follow players + notifications — in-app feed, unread badge, OS
  push on device, with a server-side fan-out scaffold for remote delivery. ✅
- **Football deep-dive:** full live event capture (goals + assists, yellow/red
  cards, subs, own goals), a running match clock + event timeline, auto clean
  sheets from the lineup at full time, a pitch map (organizer-editable lineups),
  and a football profile section (position, foot, teams, stats). Template for
  deepening any sport. ✅
- **Basketball deep-dive:** per-quarter game clock, play-by-play timeline,
  player-attributed baskets (1/2/3) + rebounds/assists/fouls, and a live box
  score (PTS/REB/AST/PF). ✅
- **Badminton / Tennis / Volleyball / Kabaddi depth:** added Tennis as a new
  sport; all four now have play-by-play timelines + player-attributed stats
  (kabaddi is timed, so it also has a clock). Athletics intentionally left
  lightweight. ✅
- **Event-log persistence:** every scoring action (with player attribution) is
  persisted to an append-only log — Supabase `match_events` live, or the demo
  store offline. Reopening a match replays the log to rebuild the full state
  (score, clock, timeline); live mode also broadcasts via realtime so viewers
  see the play-by-play build instantly. ✅
- **Open community profiles & discovery:** players exist across cities/clubs
  (not just one school); Discover is a search experience (by name) with sport &
  city filters and an activity-ranked list; anyone can create an open profile.
  ✅
- **Cricket:** full ball-by-ball, two-innings limited-overs engine — runs
  (credited to the striker), wickets (credited to the bowler), extras, an over
  clock, auto innings/match end, a live scorecard and ball-by-ball timeline.
  Athletics removed from the app for now. ✅
- **Richer cricket, search, follows:** cricket now shows a batting card, bowling
  card, run rate and the current over's dots; player discovery search is
  server-side (repo/DB filtered, not load-all); follows extended to teams &
  tournaments with a dedicated Following screen. ✅
- **Standings, team & tournament pages:** per-sport league tables + individual
  stat leaders (works for single-sport tournaments too); team profiles (per-sport
  record, squad, matches) and tournament profiles; notifications when a followed
  team's/tournament's match goes live or finishes. ✅
- **Formats, brackets, cricket POTM:** organizer picks per-sport format (cricket
  overs & players/side; football players/side, rolling-vs-fixed subs & max subs)
  + tournament structure (league / knockout / league+knockout); formats drive
  the live games. Knockout bracket generation + view. Cricket auto-commentary +
  Player of the Match. ✅
- **Bracket auto-advance + squad/venues (started):** bracket winners advance from
  byes and completed results (champion shown when the final is decided); matches
  carry a venue; teams have a squad-management screen (add players, invite
  links). ✅
- **Matchday XI + subs (all sports):** before a match, pick each team's starting
  XI (capped at the format's players-a-side) and substitutes from their squad;
  the live scorer then picks only from that matchday squad. ✅
- **Unified football lineup ↔ squad:** the football lineup editor is the single
  source of truth — the placed XI are the starters, plus a subs list; saving
  writes both the positional lineup (pitch) and the matchday squad (roster), so
  they can't diverge. ✅
- **Captain invite-link auth:** a team's squad screen generates an invite code +
  shareable link (`sportfolio.app/join/CODE`, also a `sportfolio://join/CODE`
  deep link); the invitee redeems it under Profile → "Join a team with a code",
  sees the team & role, and claims it. Claiming records captaincy (Supabase
  `team_staff` / demo store), persists across sessions, and unlocks squad
  management — the squad screen then shows "✓ You're the captain". ✅
- **Calendar scheduling + map-linked venues:** scheduling a match now uses a
  tap-to-open calendar (month grid + scrollable hour/minute chips) instead of a
  typed date string, and venues are tappable Google Maps links everywhere a
  match is shown — the organizer can paste a precise Maps link or we fall back to
  a Maps search by venue name. ✅
- **Per-sport positional layouts:** the visual lineup map is no longer
  football-only. Basketball, volleyball, kabaddi, badminton and tennis each get
  their own court (correct surface, markings and a real starting formation —
  e.g. PG/SG/SF/PF/C for basketball, Deuce/Ad for tennis), drawn by a shared
  `CourtMap`. Any sport with a layout uses the visual lineup editor (assign
  players to positions → saves the matchday squad too) and shows both teams on
  the court on the live page. Cricket keeps its batting/bowling cards (no
  symmetric two-team formation). ✅
- **Home redesign + tournament/sport hubs:** Home is now a lean, personalized
  feed — app wordmark + profile shortcut + bell, a tournament switcher scoped to
  the tournaments you play in or follow, and live-now / up-next matches that
  filter to the selected tournament, plus a sport row that jumps into each
  sport's section. The deep content lives where it belongs: the **tournament
  page** shows overall (cross-sport) standings, a per-sport league table and a
  swipeable statistics rail; the new **sport section** (SportHub) shows that
  sport's schedule, an organize shortcut, the league table and the stat rail.
  League tables are richer — two-line rows with P/W/D/L and goals/points
  for·against·difference — and statistics go deeper: a horizontal rail of
  leaderboards (Goals, Assists, Clean sheets, …) you swipe between. Single-sport
  tournaments skip the sport selector and show their table directly. ✅

### Football lineup = squad

For football, `LineupEditorScreen` sets positions (the placed players = the
starting XI) plus a substitutes picker; on save it writes `match_lineups`
(positions → pitch & clean sheets) **and** `match_squads` (starters + subs →
scoring roster). The live page's "RED XI / BLU XI" buttons open this editor for
football and the generic squad picker for other sports.

### Matchday squads

`match_squads` stores `{starters, subs}` per team per match (generic across
sports). The live page's "Matchday squad" entry opens a picker (Start/Sub
toggles, XI capped by the format); the scoring roster becomes starters + subs,
falling back to the full team squad when none is set.

### Brackets

`knockoutBracket(teams, decide?)` advances byes automatically and carries the
winner of any decided pairing (a completed match between those teams) into the
next round; `bracketChampion` resolves the title when the final is decided.

### Formats

Each sport plugin declares `formatFields` (number/choice options). The
tournament-creation form renders them generically; chosen values are stored on
the tournament (`formats` jsonb) and flow into `createInitialState(config)` so a
10-over / 8-a-side cricket or a 5-v-5 football plays by those rules (cricket
wickets = players−1; football enforces max subs and fixed-sub no-return). A
one-off game can override via `Match.format`.

### Standings & statistics

`src/data/standings.ts` computes, from completed match results and the stat-line
log: a league table (`teamStandings`, 2/1/0) and individual leaders
(`statLeaders`, ranked by each sport's headline stat). The Standings screen has
a sport selector (a single-sport tournament shows just that sport). Teams are
house-level (`TeamSummary`, ids consistent with matches) so follows, team
profiles, standings and team-follow notifications all line up.

### Following

Follows are keyed `"<type>:<id>"` (player/team/tournament) in one store + the
`follows` table. Follow buttons live on player profiles, the Home tournament
header, and each team in Discover; the **Following** screen (from Profile) lists
them all. Player-scoring still drives notifications; team/tournament alerts are
the next step.

### Server-side search

Discover's player search calls `searchPlayers({query, sport, city})` — a DB
`ilike`/filter query live, an in-memory filter in demo — so only the matched
set is hydrated (with stats fetched for just those ids), not the whole base.

### Cricket

`src/sports/cricket/` reconstructs the whole match from the ball-by-ball log:
overs (`balls/6`), the two-innings flow (target set after innings 1, chase ends
the instant the target is passed), and auto-end at the overs limit or 10
wickets. The scorer selects a striker (runs) and a bowler (wickets) so stats
flow to profiles; the over count shows via `LiveClock` and the scorecard +
timeline via `LiveExtras` — same plugin contract as every other sport.

### Discovery

`Player` carries a `city` and a club/house affiliation, so the community spans
schools. The Discover tab filters the player base by name + sport + city and
ranks by activity, each row linking to a profile. "+ Add" (or the Profile tab's
empty state) opens `CreatePlayerScreen` → `createPlayer` writes an open profile
to the demo store or Supabase. (At very large scale, swap the client-side filter
for a server-side `ilike`/full-text search — the repo boundary already isolates
this.)

### How the event log works

`useLiveMatch` loads the log via `getMatchEvents(matchId)` and replays it through
the sport's pure reducer to reconstruct state — including the timeline (with
who scored, since `attribution` is stored). Each dispatch appends a
`MatchEventRecord`; in live mode a realtime subscription applies new events to
every viewer. Stat-line writes and follower notifications fire only on the
scorer's dispatch, never on replay, so viewers never double-count.

### Live-event depth, per sport

Football & basketball have bespoke panels (pitch map, box score). The net/raid
sports share a generic `LiveEvent` + `<LiveTimeline/>` (`src/sports/liveEvents.ts`,
`LiveTimeline.tsx`): badminton/volleyball/tennis log every point (with the
point-winner) and surface a games/sets summary; kabaddi logs raids/tackles
stamped with the match minute and runs a clock. Each lives entirely in its own
`src/sports/<sport>/` folder — the generic screens never change.

### Profiles

The main profile is concise (header, overall stats, a tappable **By sport**
list). Tapping a sport opens `SportProfileScreen` — that sport's stats, match
history, and sport-specific details (football: position/foot/teams, editable on
your own profile). The live match clock renders inside the scoreboard via the
plugin's optional `LiveClock`; the pitch map / box score render via `LiveExtras`.

### Sport-specific depth (football as the template)

The plugin contract has an optional `LiveExtras` component (receives the live
`state`) — football renders a **running clock**, an **event timeline**
(`sports/football/Timeline.tsx`) and a **pitch map** (`sports/football/Pitch.tsx`)
there, visible to everyone on the live page. The clock is derived from a
`startedAt` set by a KICKOFF action, so every device shows the same minute;
because the reducer is pure, the controls stamp each event's minute via
`payload.minute`. Lineups (`match_lineups`) are set by an organizer in the
lineup editor; the same positions drive clean-sheet awards at full time.
Sport-specific profile data lives in `player_sport_profiles` (jsonb), surfaced
as the football card on the profile. Each sport opts into this depth without
touching the generic screens.

### Notifications

Follow a player from their profile. When a followed player is credited a stat
during live scoring, `notify()` fires an in-app feed entry (the bell badge on
Home) and, on a real device, an OS notification. For **remote** push (alerting a
parent whose app is closed), `supabase/functions/notify-followers` is a deploy-
ready Edge Function: a DB webhook on `stat_lines` looks up the player's
followers, gathers their Expo push tokens (`push_tokens` table) and posts a
batch to Expo's Push API.

### Player stats

`stat_lines` records one player's numeric contribution per match (e.g.
`{goals:2, assists:1}`). `src/data/stats.ts` rolls these up — pure functions —
into totals, per-sport breakdowns and win rate that drive the Profile and
Discover screens.

**Live attribution.** A scoring action may carry `attribution: {playerId, stat,
by}`. When the scorer taps a player (e.g. the goal-scorer), `useLiveMatch`
writes/increments that player's stat line for the match — so profiles update
automatically from live scoring. The reducer ignores attribution (it only
affects the scoreboard), keeping scoring rules and stat-keeping cleanly
separate. Football is wired; each sport opts in by adding player chips to its
controls and tagging dispatched actions.
