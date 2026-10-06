# Golf — design (v1)

*Status: **v1 BUILT 2026-10-06** (G1–G6 done; uncommitted; migration 0028 to run on live).
Scope: stroke play (gross/net), Stableford and match play; 9/18 holes; multi-round with cut;
live leaderboard; self-entered WHS Handicap Index. Team formats in v2.*

**Where things are:**
- Rules engine: `src/sports/golf/engine.ts`.
- Match-play plugin: `src/sports/golf/index.tsx`.
- Data, outbox and leaderboard: `src/data/golf.ts`, `src/data/useGolf.ts`.
- Screens: `GolfRoundSetupScreen`, `GolfRoundScreen`, `components/golf/*` (leaderboard,
  tournament hub, live cards).
- Database: `supabase/migrations/20261009120000_golf_field_events.sql`.

**Tests:**
- `tests/golf.test.mts` (30) and `tests/golf-litmus.test.mts` (72-hole open with a 36-hole
  cut; club medal day).
- 28 database scenarios.
- Click-through in offline demo.

---

## 1. Why golf needs more than a plugin

Every sport today is a **head-to-head match**. The `Match` type, scoring screen, standings,
brackets and stat lines all assume `homeTeam` vs `awayTeam`. Even individual sports (tennis,
squash) are two sides.

Golf has two competition shapes:

| Shape | Golf formats | Fits today? |
|---|---|---|
| **Head-to-head** | Match play (singles; four-ball and foursomes in v2) | ✅ A normal `SportPlugin` on the existing match/bracket engine. |
| **Field event** — N players, one leaderboard | Stroke play, Stableford, multi-round events, cuts | ❌ New. |

**Decision:** add a **field-event core** *alongside* matches, not by changing `Match`.
- Zero risk to the 10 existing sports: no edits to their code paths, standings or brackets.
- The `measured` scoring type already reserved in `src/sports/types.ts` becomes real.
- The same core later carries **athletics, swimming, archery, shooting, running events and
  cycling**: anything ranked on a leaderboard.

---

## 2. What's common vs golf-specific

**Reused as-is:**
- tournaments (creation, hosts, officials, registration, ownership, audit);
- players and profiles;
- following and notifications;
- the Discover sport catalogue;
- organisations and clubs;
- privacy and messaging;
- the tournament sport hub page;
- offline-safe sync principles;
- format presets (`FormatField`);
- stat-line rollups (`aggregate`, `sportSummary`).

**New and generic (the field core, reusable by future sports):**
- `field_events` — a round, heat or session within a tournament, or a casual round with
  friends;
- `field_entries` — one per participant in that event, with group/tee time and a
  sport-specific result payload;
- a `FieldSportPlugin` contract: entry form, scorecard UI, ranking, per-entry stat line,
  leaderboard columns;
- a leaderboard component and a field-event screen (scorecard + leaderboard tabs);
- `FieldEventCard` for Home "Live now" and tournament lists;
- stat lines linked to an event instead of a match (`stat_lines.event_id`).

**Golf-specific:**
- courses (holes, par, stroke index, tees with course rating and slope);
- per-hole scoring;
- handicap maths;
- Stableford;
- countback;
- cut lines;
- match-play state (UP / dormie / 3&2);
- golf stats (GIR, fairways, putts, scoring average).

---

## 3. Data model

```
golf_courses
  id, name, city, holes (9|18),
  holes_data jsonb  -- [{ n, par, si }]  (stroke index 1..18, or 1..9 for 9-hole courses)
  tees jsonb        -- [{ name, colour, courseRating, slope, par, rating9F?, slope9F?, rating9B?, slope9B? }]
  created_by, created_at

field_events                                  -- one ROUND (or heat/session)
  id, tournament_id (null = casual round with friends),
  sport ('golf'), title, round_no, starts_at,
  status ('scheduled'|'live'|'completed'|'cancelled'),
  format jsonb      -- golf: { scoring:'stroke'|'stableford', holes:'18'|'front9'|'back9',
                    --         allowance: 95, maxScore:'none'|'ndb'|'par+N', courseId, tee }
  host_ids uuid[], created_by, created_at, updated_at

field_entries                                 -- one PLAYER in one round
  id, event_id, player_id,
  group_no, tee_time, start_hole,
  handicap_index numeric,                     -- snapshot of the self-entered WHS index
  result jsonb      -- golf: { strokes:[n|null|'P'...], putts:[...], fir:[...], gir:[...], pen:[...] }
  status ('playing'|'finished'|'dnf'|'wd'|'dq'),
  updated_by, updated_at

stat_lines + event_id uuid (nullable; match_id becomes nullable for field rows)
```

**Key choices:**
- **Results live on the entry, as a card snapshot**, not an event log. A golf card is small
  and edited per hole by one marker. Writes are last-writer-wins per entry, and the offline
  outbox keeps the newest snapshot per entry — simpler and more robust on a course with
  patchy signal.
- **A multi-round tournament is N `field_events` with the same `tournament_id`.** The
  leaderboard aggregates entries by player across rounds. The cut is applied when round N+1
  is created: only players who made the cut are entered.
- **Handicap index is a snapshot per entry,** so later index changes don't rewrite old
  results.

**Security** (same pattern as migration 0025):
- Tournament managers / event hosts manage events and entries.
- A player may write **their own** card and the cards of **their group** (the marker
  convention).
- Reads are public (leaderboards are public, like scores).

---

## 4. Rules and maths (pure, unit-tested — `src/sports/golf/engine.ts`)

**Handicap (WHS):**
- **Course Handicap** = round( HI × Slope / 113 + (CourseRating − Par) )
  - 9 holes: uses the 9-hole rating/slope and HI ÷ 2.
- **Playing Handicap** = round( CH × allowance% )
  - WHS recommended defaults: individual stroke play **95%**, Stableford **95%**, singles
    match play **100%**. The organiser can override.
- **Strokes received per hole:** distributed by stroke index — PH 20 → one on every hole,
  plus a second on SI 1–2.
- **Plus handicaps** give strokes back starting from SI 18.
- We **never issue an official index**; only authorised golf associations can. We may show
  an *estimate* later (v2), clearly labelled.

**Scoring:**
- **Gross** = sum of strokes.
- **To par** = Σ(strokes − par) over holes played. This drives "−3 thru 12".
- **Net** = gross − playing handicap; per-hole net uses strokes received.
- **Stableford points** per hole = max(0, 2 + par + strokes received − strokes). A pickup
  ("P") = 0 points. Highest total wins.
- **Max score (optional):** net double bogey, or par + N. Applied to an *adjusted* gross used
  for stats and handicap estimates, not to the competition result unless the format says so.

**Ranking:**
- Stroke play: lowest wins; Stableford: highest wins.
- Ties are shown as **T3**.
- **Winner ties:** countback on the last 9, last 6, last 3, last hole (standard amateur
  practice; for net, the handicap fraction is applied), or flagged for a playoff (organiser
  choice).
- **DNF/WD/DQ** rank below finishers.

**Cut:**
- Top N and ties, or "within X strokes of the lead", after round R.

**Match play (head-to-head plugin):**
- Hole won / halved / lost.
- State: "2 UP thru 11", "AS" (all square), **dormie**, **closed out** ("3&2"), conceded
  hole/match.
- Handicap: the difference between playing handicaps, allocated by stroke index.
- Extra holes when all square after 18 (knockout).

---

## 5. Competition types

| Type | v1 | Notes |
|---|---|---|
| Individual stroke play (gross + net) | ✅ | Medal round; most club and open events. |
| Individual Stableford | ✅ | The most common amateur format in Indian clubs. |
| Singles match play | ✅ | Bracket knockouts reuse the existing bracket engine. |
| Multi-round (36/54/72 holes) + cut | ✅ | Litmus: a 4-round event with a 36-hole cut (top 50 and ties). |
| 9-hole rounds (front/back) | ✅ | |
| Four-ball better-ball, foursomes, greensomes | v2 | Pairs as entries. |
| Scramble / Texas scramble | v2 | Team entry with one ball. |
| Skins, par/bogey competitions | v2 | |
| Team stroke (best N of M scores count) | v2 | Inter-club events. |
| Ryder-Cup-style team match play | v2 | Uses the existing **series** model. |

---

## 6. UX (organiser-first, fast scoring)

- **Create:**
  - *Tournament:* sport Golf → format preset (Stroke play / Stableford / Match play), number
    of rounds, holes, cut, allowance.
  - *Casual:* "⛳ Start a round" (no tournament) → course → players → go.
- **Course:**
  - Pick a saved course, or **quick-create** from the scorecard: name, par per hole and
    stroke index. A "Par 72 standard" template fills sensible defaults.
  - Tees: rating and slope, optional; without them, course handicap = index.
- **Draw:** add players (search or invite by phone, as in other sports), auto-group into 3- or
  4-balls, set tee times (start + interval) and optionally a shotgun start (start holes).
- **Scorecard (marker view):**
  - One hole at a time, the whole group on screen.
  - Each player row starts at **par**, with big **− / +** buttons. "Par" is one tap; a
    birdie is one tap.
  - Optional per-hole extras behind a toggle: putts, fairway, green in regulation, penalties.
  - Swipe or tap to the next hole; card thumbnails show progress.
  - Offline banner as in live scoring.
- **Leaderboard:**
  - Position, player, to-par/points, thru, today, total.
  - Gross/net toggle. Cut line drawn in.
  - Tap a row to open that player's card.
- **Profile:** a Golf section showing rounds, best round, scoring average, birdies, GIR%,
  putts/round, fairway%, handicap index (as entered).

---

## 7. Stats (per round → stat line)

```
rounds 1, holes, strokes, toPar, net, stableford,
eagles (or better), birdies, pars, bogeys, doubles (or worse),
putts, girHit, girHoles, firHit, firHoles, penalties
```

`won` = finished 1st (ties: shared 1st). Profile rollups:
- scoring average = strokes ÷ rounds (18-hole equivalent);
- GIR% and FIR% from hit / eligible holes.

---

## 8. Build plan and tests

| Step | What | Tests |
|---|---|---|
| G1 | `engine.ts`: handicap, Stableford, net, to-par, ranking with ties and countback, cut, match-play state, stat line | Pure unit tests (WHS worked examples, plus handicaps, 9-hole, countback, ties, dormie, 3&2) |
| G2 | Field core: types, demo store, repos (events/entries/courses), offline card outbox | Unit tests for leaderboard aggregation across rounds and the cut |
| G3 | Golf plugin (match play) registered like other sports, plus profile fields, stat labels, schedule durations | Plugin reducer tests |
| G4 | Screens: create round/tournament format, course quick-create, draw/groups, scorecard, leaderboard; SportHub golf view; Home "Live now" card | Click-through in offline demo |
| G5 | Migration 0028: `golf_courses`, `field_events`, `field_entries`, `stat_lines.event_id`, RLS + helpers | PGlite scenarios (host vs marker vs stranger) |
| G6 | Litmus: replicate a club medal round (3 groups × 4) and a 72-hole event with a 36-hole cut | `tests/litmus` |

**Effort:** about 2–3 focused weeks of engineering. G1–G3 are pure logic and land first.
