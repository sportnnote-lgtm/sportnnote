# Sports expansion plan

*2026-10-06. Pilot context: Hyderabad, adult friends who play **open tournaments across
multiple sports**.*

**How sports were picked:**
1. How much of an existing engine they reuse — that's the cost.
2. How common open/amateur tournaments are in Hyderabad and India — that's the pilot value.
3. Whether the tournament engine (round robin, knockout, Swiss, groups) already fits them.

> **Rule (founder, 2026-10-06): only sports played at international level** — an
> international federation plus world championships or multi-sport games
> (Olympics / Asian Games / Commonwealth Games). Throwball fails this rule and was removed.
> Every sport in Waves 3–4 passes.

**What exists today:** 10 sports — football, cricket, basketball, kabaddi, tennis, badminton,
volleyball, pickleball, padel, squash.

**Engines available to reuse:**
- the rally core (pickleball, squash);
- the volleyball set engine;
- the football goal-time engine;
- the basketball period engine;
- the tennis engine;
- the Swiss pairing engine;
- soon, the field-event core (from Golf).

## Wave 1 — head-to-head quick wins · ✅ SHIPPED 2026-10-06

Table tennis, chess and carrom were added. Futsal already existed as a football preset.
Throwball was built and then **removed on 2026-10-06** under the founder's rule below.
- **Verification:** 14 new engine tests; tsc clean; 306/306 tests; scored in the offline demo
  (chess result, carrom boards, table-tennis serve rotation).
- **Fixed along the way:** in individual sports, a player's entry wasn't linked to their
  profile ("me", new players and search were team-name-only). Now you can search real
  people, "me" is your profile, and new players are real player records. Results and stats
  reach profiles.

### Original Wave 1 plan (about 1 day each)

| Sport | Engine | Why now | Format presets |
|---|---|---|---|
| 🏓 **Table tennis** | Rally core (rally scoring) plus a serve-rotation display (2 serves each; 1 each at deuce) | Very common club and open events in Hyderabad | ITTF best of 5 to 11; best of 7; best of 3; legacy to 21 |
| ♟️ **Chess** | New small "result" engine (win/draw/loss + how: checkmate, resignation, time, agreement, stalemate) | Open chess tournaments are everywhere. The **Swiss engine already exists** — the perfect fit. | Classical / Rapid / Blitz / Bullet (time controls for reference); 1–½–0 scoring |
| 🎯 **Carrom** | New small board engine (points per board = opponent's coins left + queen bonus, game to 25/29 over a set number of boards) | Hugely popular in Indian open/club tournaments | ICF singles/doubles to 25 (8 boards); casual to 29 |
| 🏐 **Throwball** | Volleyball set engine with a different preset | India-specific, common in corporate and open tournaments | Best of 3 to 25; deciding set to 15 |
| ⚽ **Futsal** | Football engine preset (5-a-side, 20-minute halves, rolling subs) | Turf tournaments in Hyderabad | Already close to the 5s preset; make it explicit |

## Wave 2 — Golf (field-event core) — see `GOLF_DESIGN.md`. About 2–3 weeks.

## Wave 3 — engine extensions (about 2–4 days each)

| Sport | Work |
|---|---|
| 🏑 **Hockey** (field) | Football engine gains a **quarters** period structure (4×15), green/yellow/red cards, penalty corners; shoot-out decider |
| 🤾 **Handball** | Football engine plus 2-minute suspensions, 7 players, 30-minute halves |
| 🏀 **Netball** | Basketball period engine with 1-point goals (2-point super shot option), positions |
| 🏃 **Kho-kho** | New turn-based chase engine (innings, points per touch) — India traditional, school/open |
| 🥊 **Boxing / wrestling / judo** | New "bout" engine (rounds, judges' points, method of victory) |

## Wave 4 — field-event sports on the Golf core (about 3–5 days each once the core exists)

| Sport | Field shape |
|---|---|
| 🏃 **Athletics: track** | Heats → final; result = time; lanes; qualification by place + fastest losers |
| 🏃 **Running events / marathons** | One mass event; chip/manual times; age categories (popular Hyderabad open events) |
| 🥏 **Athletics: field** | Attempts (3–6); best mark; heights with fails (high jump, pole vault) |
| 🏊 **Swimming** | Heats → final; times; strokes and distances |
| 🏹 **Archery** | Ranking round (ends of 3/6 arrows) → head-to-head set-system matches (hybrid) |
| 🎯 **Shooting** | Series scores; final rounds |
| 🚴 **Cycling** | Time trials, mass start |

## Sequencing

1. **Wave 1 now.** Five sports in about a week, all useful to the pilot group. No migrations:
   the database has no sport whitelist.
2. **Golf next** (Wave 2), building the field core properly.
3. **Wave 3 and Wave 4** after the pilot starts, prioritised by which sports the pilot
   friends actually play. Track this as a pilot KPI: matches per sport.

**Done means**, for every sport added:
- engine + plugin;
- format presets;
- registry, profile fields, stat labels, ratings and schedule durations;
- reducer unit tests;
- tournament formats verified (round robin / knockout / Swiss where relevant);
- a click-through in the offline demo.
