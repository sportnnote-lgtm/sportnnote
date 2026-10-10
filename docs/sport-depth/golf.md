# Golf — depth audit

Standard sources: R&A / USGA Rules of Golf (2023) and the Committee Procedures (countback, cut and playoff practice); World Handicap System (WHS 2024): Course Handicap, Playing Handicap allowances, stroke-index allocation, net double bogey, Score Differential; DP World Tour / PGA Tour leaderboard and ShotLink stat definitions (to par, thru, today, R1–R4, T-ties, MC/WD/DQ, GIR, fairways, putts, scrambling, sand saves, scoring average, birdie average); the Indian Golf Union's junior and inter-school team formats (best N of M scores count).

Golf is a field competition, so the four levels are adapted:
- **match** = one round or scorecard (plus match play, which is head-to-head);
- **team** = team formats (best-N-of-M team stroke play, four-ball, scramble, Ryder-Cup-style match play);
- **tournament** = the leaderboard (stroke, Stableford, net/gross, cut, ties and playoffs) and awards;
- **player** = career stats, handicap index and its trend.

**Summary.** The rules engine is the strongest part of golf. `src/sports/golf/engine.ts` correctly implements:
- WHS course and playing handicaps (including 9-hole and plus handicaps);
- stroke-index allocation;
- Stableford and net double bogey;
- countback, "T" ties, the cut and match-play state.

Capture and presentation are much thinner than the data model. Problems at each level:
- **Scorecard:** it captures **strokes and putts only**. Fairways, GIR and penalties exist in the card type and the stat line, but no screen captures them, so the profile's "Fairways" and "Greens (GIR)" tiles always show "–".
- **Multi-round leaderboard:** it has a credibility bug. Players who **missed the cut stay ranked among those who made it**, on fewer rounds, with no "MC" label. The next-round setup also re-proposes them.
- **Leaderboard columns:** no total-strokes column, no per-round (R1–R4) columns, no gross/net dual board, no cut line, and no card drill-down in the tournament hub.
- **Withdrawals:** WD and DQ cannot be set from any screen.
- **Tournament stats:** golf stat lines are dropped from tournament leaders and awards, because they have no `matchId`.
- **Player profile:** the "best round" mixes 9- and 18-hole rounds. There is no handicap index on the profile, no handicap trend, no score differentials and no to-par or Stableford averages.
- **Team golf:** absent; it is planned for v2.
- **Match play:** the scorer taps a hole winner only. The engine's net-stroke helpers (`holeWinner`, `matchPlayStrokes`) are unused, so handicap match play has to be worked out in the scorer's head, and match play produces no stroke stats.

Legend: ✅ done · ⚠️ partial · ❌ missing.

---

## 1. Match level (round / scorecard)

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Strokes per hole, gross total | Core | `GolfRoundScreen.tsx:219-230`. Each row starts at par with −/+ and a "Par" chip. `summarize()` in `engine.ts:200-226`. | ✅ | Fast, one phone per group. Cap of 15 at `GolfRoundScreen.tsx:227`. |
| To par (running), "E"/−3/+2 | Core | `toParLabel` in `engine.ts:229`; running label at `GolfRoundScreen.tsx:210` | ✅ | |
| Score name per hole (eagle/birdie/par/bogey/double) | Core | `GolfRoundScreen.tsx:225` | ✅ | No "albatross" or "hole in one" label. |
| Pick-up / no return (NR) | Core | `'P'` in `engine.ts:135`; NR becomes DNF in stroke play at `engine.ts:308` | ✅ | |
| Net score with strokes by stroke index | Core | `courseHandicap`, `playingHandicap`, `strokesReceived` in `engine.ts:81-130`; dots on the row at `GolfRoundScreen.tsx:216` | ✅ | WHS-correct, including 9-hole and plus handicaps. |
| Stableford points per hole and total | Core | `stablefordPoints` in `engine.ts:166-170` | ✅ | Running total only; per-hole points are not on the card view. |
| Adjusted gross (net double bogey / par+N) | Core (WHS) | `holeCap` and `adjustedGross` in `engine.ts:174-218` | ⚠️ | Computed, but never stored: `roundStats` in `engine.ts:453-482` drops it. So the `maxScore` format option has no visible effect. |
| Putts per hole | Core | Session-only "Track putts" toggle, 0–4 chips, at `GolfRoundScreen.tsx:43,236-248` | ⚠️ | The toggle is not remembered and resets on every open. Putts can only be entered after strokes. |
| Fairway hit (par 4/5), miss direction L/R | Core | `fir[]` in the card type (`engine.ts:142`) and stats (`engine.ts:476`) | ❌ | **No capture UI.** The profile tile is permanently "–". |
| Green in regulation | Core | `gir[]` in the card type (`engine.ts:144`) | ❌ | **No capture UI.** It could be **derived**: GIR ⇔ strokes − putts ≤ par − 2. |
| Penalty strokes | Core | `penalties[]` in the card type and stats (`engine.ts:479`) | ❌ | No capture UI. |
| Scrambling / up-and-down | Core (Tour) | — | ❌ | Derivable: missed GIR and score ≤ par. Needs GIR, which putts already give. |
| Sand saves | Core (Tour) | — | ❌ | Needs a one-tap "bunker" flag per hole. |
| Scorecard grid with Out / In / Total, birdie circles and bogey squares | Core | `CardDetail` (`GolfLeaderboard.tsx:62-78`) is a flat strip of cells coloured under/over | ⚠️ | No OUT/IN subtotals, no net or points row, no putts row. |
| Shotgun start (start hole) | Core (club) | `startHole` in the schema (`golf.ts:150`). The setup never sets it, and `autoGroups` (`golf.ts:335-341`) gives tee times only. | ⚠️ | The scorecard always opens on hole 1 (`GolfRoundScreen.tsx:42`). |
| Marker / attest (player signs the card) | Core (R&A 3.3b) | Group players and the host can write cards (`GolfRoundScreen.tsx:55`) | ⚠️ | No "card returned / attested" step. P2. |
| Offline-safe entry | — | Outbox in `golf.ts:179-227` | ✅ | |
| **Match play:** hole won/halved/lost, UP/AS/Dormie/3&2, extra holes, concede | Core | Plugin at `index.tsx:37-83`; `matchState` at `engine.ts:400-431` | ✅ | |
| Match play: per-hole strokes and handicap strokes applied | Core | The scorer only taps the winner (`index.tsx:61-65`). `holeWinner` and `matchPlayStrokes` (`engine.ts:373-448`) are unused by the UI. | ❌ | In handicap match play the marker has to work out net in their head. No stroke stats come out of match play. |
| Match play: hole numbering for the back 9 | Core | Shows "Hole 1 of 9" (`index.tsx:71`) | ⚠️ | Should show 10–18. |
| Concede a single hole | Core | Use "X wins hole" | ✅ | Acceptable. |

## 2. Team level (team formats)

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Team stroke play: best N of M scores count (inter-school, inter-club) | Core (school golf) | — (v2 in `GOLF_DESIGN.md:183`) | ❌ | **The** school format. `field_entries` has no team link. |
| Four-ball better-ball / foursomes / greensomes | Core | — (v2, `GOLF_DESIGN.md:180`) | ❌ | |
| Scramble / Texas scramble | Core (social) | — | ❌ | P2 for this audience. |
| Ryder-Cup-style team match play (½ point per halved match) | Core | The series `rubbers` model (`src/data/series.ts:9-12`) is generic. The golf plugin returns 0.5/0.5 for a halved match (`index.tsx:115`). | ⚠️ | Not verified for golf: `participantKind: 'individual'` (`index.tsx:106`), and series rubbers count "most wins", not ½ points. |
| Team season record / team stats for golf | Core | Nothing reads golf lines per team | ❌ | Depends on GF-07. |
| Golf in the multi-sport medal table (position points) | Core (sports day) | `medalStandings.ts:41-80` is fed by match standings only. Field events never reach it. | ❌ | GEN candidate. |

## 3. Tournament level (leaderboard)

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Position with "T" ties | Core | `rankLeaderboard` at `engine.ts:296-343` | ✅ | |
| Total to par, Today, Thru, "F" | Core | `GolfLeaderboard.tsx:30-51` | ⚠️ | The tournament hub does not pass `holesInRound` (`GolfTournamentHub.tsx:54`), so it shows "18", not "F". "Today" shows "E" for a player who has not teed off in the current round. |
| Total strokes column (e.g. 268) | Core | `grossTotal` is computed (`engine.ts:255,337`) but never rendered | ❌ | |
| Per-round scores R1/R2/R3/R4 | Core | — | ❌ | |
| **Missed cut (MC) players separated and labelled** | Core | `buildLeaderboard` (`golf.ts:275-295`) merges every round a player has. MC players keep their R1–R2 total and are ranked among those who made the cut. | ❌ **Bug** | Litmus tests miss this because they rank only the players who made the cut (`tests/golf-litmus.test.mts:42-44`). |
| Cut: top N and ties | Core | `makesCut` (`engine.ts:351-364`); setup at `GolfRoundSetupScreen.tsx:166-173` | ⚠️ | The cut is computed on the polluted board above. The next-round picks come from all ranked rows, MC players included (`GolfRoundSetupScreen.tsx:102-107`). |
| Cut: within X of the lead | Core (amateur) | The engine supports it (`engine.ts:359-363`) | ⚠️ | No UI: only "Top N" (`GolfRoundSetupScreen.tsx:266-267`). |
| Projected cut line drawn | Core | `cutAfter` prop (`GolfLeaderboard.tsx:40`) | ❌ | Never passed by any caller. |
| Gross and net boards (Best Gross / Best Net prizes) | Core (club / Indian amateur) | One measure per round (`golf.ts:39`, `engine.ts:269-272`) | ⚠️ | Design §6 promised a gross/net toggle; it is not built. |
| Stableford (individual, net) | Core | `engine.ts:270` | ✅ | |
| Countback (last 9/6/3/1, handicap fraction for net) | Core (amateur) | `engine.ts:278-292` | ⚠️ | Correct on finished cards. Applied **live** on partial cards (`engine.ts:315-322`), where it can break ties that should read "T". |
| Playoff (sudden death) for the winner | Core (pro) | — | ❌ | Design §4 says "flagged for a playoff"; there is no option or field. |
| WD / DQ / DNS status | Core | Status handling at `engine.ts:294,339-341` and `updateFieldEntry` (`golf.ts:230`) | ❌ | **No screen calls `updateFieldEntry`.** WD/DQ cannot be set, and handicaps cannot be edited after the draw. |
| Tap player → their card (all rounds) | Core | Single round: yes (`GolfRoundScreen.tsx:140-144,256`) | ⚠️ | Tournament hub: no `cards` passed (`GolfTournamentHub.tsx:54`). Only the latest round is shown. |
| Tournament stat leaders / awards (low round, most birdies, fewest putts) | Core | `useLeagueData` drops lines without a `matchId` in the tournament (`hooks.ts:137-138`). The golf hub returns early, before leaders (`SportHubScreen.tsx:70-78`). | ❌ | `STAT_CATEGORIES.golf` (`standings.ts:424`) also lists "holes won", which stroke play never produces. |
| Match-play bracket | Core | Existing bracket engine (`index.tsx:5`) | ✅ | |
| Live "Live now" card with leader | — | `LiveGolfCards.tsx:23-36` | ✅ | |

## 4. Player level (career / handicap)

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Rounds played | Core | `SportProfileScreen.tsx:157` | ✅ | |
| Scoring average (18-hole equivalent) | Core | `engine.ts:461,485`; `SportProfileScreen.tsx:151` | ✅ | Excludes NR rounds. |
| Best round | Core | `Math.min(strokes)` over complete rounds (`SportProfileScreen.tsx:152-153`) | ⚠️ **Bug** | Mixes 9- and 18-hole rounds: a 9-hole 42 beats an 18-hole 76. No course or date shown, and no to-par. |
| Score distribution (eagles+/birdies/pars/bogeys/doubles+) | Core | Stats at `engine.ts:466-470`; profile shows eagles, birdies and pars only (`SportProfileScreen.tsx:163-165`) | ⚠️ | Bogeys and doubles are hidden. No per-round averages (birdies/round, the Tour "birdie average"). |
| Hole-in-one / albatross count | Core (record) | Folded into `eagles` (`engine.ts:466`) | ❌ | |
| Putts per round | Core | `SportProfileScreen.tsx:167` | ⚠️ | Divides by **all** rounds, including rounds where putts were not tracked. It needs a tracked-holes denominator (as GIR/FIR already have). |
| GIR % / Fairways % | Core | `SportProfileScreen.tsx:168-169` | ⚠️ | Correct maths, but always "–" (no capture; see §1). |
| Scrambling %, sand save %, penalties per round | Core (Tour) | — | ❌ | |
| Scoring average to par, and by par-3/4/5 | Core / Adv | — | ❌ | Derivable from stored cards. Par-3/4/5 averages are P2. |
| Stableford average / best Stableford | Core (amateur) | Shown per round in history only (`SportProfileScreen.tsx:276`) | ⚠️ | |
| Handicap Index on the profile | Core | Free-text bio hint only (`sportProfileFields.ts:69`). The index is typed per round at setup and pre-filled only for round 2+ (`GolfRoundSetupScreen.tsx:106`). | ❌ | |
| Handicap trend | Core | Per-entry snapshots exist (`field_entries.handicap_index`, `golf.ts:101`) | ❌ | Snapshots exist, so the trend can be drawn with no new data. |
| Score differential per round (estimated, labelled unofficial) | Core (WHS) | — | ❌ | (113/Slope) × (AGS − CR). Adjusted gross is computed but not stored. |
| Wins / top finishes | Core | `won` = shared 1st (`golf.ts:305`) | ⚠️ | No top-3 / top-10 count, no event history with finishing position. |
| Round history list | Core | `SportProfileScreen.tsx:271-301`: strokes (to par), points, birdies, putts | ✅ | |
| Match-play record (W–L–H) | Core | Counted in `bySport.wins` with stroke-play firsts | ⚠️ | Not shown separately. |

## 5. Out of scope (needs tracking / extra spotters)

- **Strokes Gained** (off-the-tee / approach / around-the-green / putting): needs a shot-by-shot distance from the hole. ShotLink-class tracking.
- **Driving distance, proximity to hole, putt length made**: needs a measuring device or GPS per shot.
- **Per-shot club and lie log**: too slow for a marker scoring four players. A player could self-log on their own card later (P2+), but it is not in scope.
- **Tee-to-green ball tracking and shot maps.**

(Fairway hit/miss, GIR, putts, penalties and bunker flags are all one-tap-per-hole facts a marker or the player can enter, so they **are** in scope.)

## 6. Proposed build items

Golf results are **card snapshots on `field_entries.result`, not an event log** (`GOLF_DESIGN.md:110-113`). "Event-log impact" therefore means new optional card arrays, with absent arrays read as "not tracked". Old cards stay byte-identical and recompute the same. Match play does use the event log (the `HOLE` / `CONCEDE` actions).

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| GF-01 | **Missed-cut handling.** Store the cut rule on the next round's `format`, for example `{ cutAfterRound, cut: {type, n} }` in the jsonb. `buildLeaderboard` treats players absent from rounds after the cut as **MC**: they rank below the players who made the cut, are labelled "MC" and show their 36-hole total. Next-round picks use only players who made the cut. Add a litmus test through `buildLeaderboard`, not `rankLeaderboard`. | P0 | M | Tournament | None (format jsonb key) | No (MC derived; not a new status value) | — |
| GF-02 | **Per-hole stats on the scorecard.** A remembered per-round "Stats" toggle that shows a compact row per player: Fairway (◀ L · ✓ · R ▶) on par 4/5, putts (already there), penalty +1 stepper, bunker toggle. Derive GIR from strokes − putts ≤ par − 2 (no tap needed). Derive scrambling and sand saves. Let each player keep their own stats on their phone; RLS already allows own-card writes. | P0 | M | Match, Player | New optional card arrays: `firDir[]` ('L'/'R'/'hit'), `bunker[]`. Existing `fir/gir/penalties` start being filled. Missing = not tracked. | No | Pattern: "optional per-unit detail row" |
| GF-03 | **Fix profile best round and rates.** Best round only among complete 18-hole rounds (show best 9 separately), with to-par, course and date. Putts/round over putt-tracked rounds only (add `puttHoles`). Show bogeys and doubles+, birdies/round, to-par scoring average, best Stableford. | P0 | S | Player | Stat-line keys `puttHoles`, `holesPlayed18` (backfill by recomputing on re-finish) | No | Uses the GEN career framework |
| GF-04 | **Entry admin: WD / DQ / DNS, edit handicap, remove.** A host-only long-press on a leaderboard or card row that calls the existing `updateFieldEntry` / `removeFieldEntry`. | P0 | S | Tournament | `status` already exists | No | **GEN-** field-entry status admin |
| GF-05 | **Pro-style leaderboard columns.** Total strokes, R1–R4 columns (horizontal scroll), "F" in the hub, "–" for Today before tee-off, the cut line wired (`cutAfter`), card drill-down in the tournament hub with a round picker. | P0 | M | Tournament | None | No | Partly: a GEN field leaderboard component |
| GF-06 | **Gross + net boards side by side** (Best Gross / Best Net). One player can't take both prizes when the organiser chooses that (common club rule). | P1 | S | Tournament | Format key `prizes: 'both'` | No | — |
| GF-07 | **Team stroke play, best N of M.** Link entries to a team or school. The team leaderboard sums the best N per round, with countback on the discarded score. Team page shows golf results. | P1 | M | Team, Tournament | Card unchanged | **Yes**: `field_entries.team_id` | **GEN-** team aggregation of individual field results (athletics, swimming) |
| GF-08 | **Field events in tournament leaders, awards and the medal table.** Include lines whose `eventId` belongs to the tournament's field events (`hooks.ts:137`). Golf categories: low round, birdies, eagles, fewest putts/round, GIR%. Drop "holes won" for stroke play. Final positions feed `medalStandings` position points. | P1 | M | Tournament, Team | None | No | **GEN-** field results into leaders, medals and awards |
| GF-09 | **Handicap Index on the golf profile and its trend.** A numeric HI field that pre-fills round setup. A trend chart from `field_entries.handicap_index` snapshots. An "estimated score differential" per completed round, clearly labelled unofficial (we never issue an index). | P1 | M | Player | Stat-line keys `adjGross`, `differential` (needs CR/slope; else omitted) | No (sport-profile jsonb; verify) | **GEN-** rating/index trend chart (chess Elo, ratings) |
| GF-10 | **Match play with strokes.** Optional per-hole stroke entry for both sides. The winner is computed by `holeWinner` with `matchPlayStrokes` dots ("A gets a shot here"). Feeds birdies and the like to stats. Number back-9 holes 10–18. | P1 | M | Match, Player | `HOLE` payload adds optional `{ home, away }` strokes; the reducer still keys on `winner`, so old logs replay identically | No | — |
| GF-11 | **Proper scorecard view.** Out / In / Total, par row, strokes-received dots, net row, Stableford-points row, putts row, birdie ○ and bogey □ glyphs. Used on the leaderboard drill-down and the profile history. | P1 | S | Match | None | No | — |
| GF-12 | **Countback only on complete cards; playoff option.** While cards are incomplete, ties show "T". Add a tie-break option "Playoff" that marks T1 as "Playoff pending" and lets the host record the playoff winner. | P1 | S | Tournament | Format key `tieBreak: 'playoff'`; event `format.playoffWinner` | No | — |
| GF-13 | **"Within X of the lead" cut** in the next-round setup (the engine already supports it). | P2 | S | Tournament | Format key | No | — |
| GF-14 | **Hole-in-one and albatross** as distinct stats and a profile badge. A 🎯 flash on the live card. | P2 | S | Match, Player | Stat-line keys `aces`, `albatrosses` | No | — |
| GF-15 | **Shotgun start.** Assign start holes per group in setup; the scorecard opens on the group's start hole and wraps around. | P2 | S | Match | None (`start_hole` exists) | No | — |
| GF-16 | **Four-ball better-ball and foursomes** (pairs as entries), and Ryder-Cup ½-point rubbers verified for golf. | P2 | L | Team, Match | New pair-entry card shape | Likely (pair entries) | Shares series rubbers ½-point with chess |
| GF-17 | **Par-3/4/5 scoring averages, top-10 count, match-play W–L–H** split on the profile. | P2 | S | Player | Stat keys `p3n/p3s`… | No | Uses the GEN career framework |

### GEN- candidates flagged

- **GEN: field results into the tournament** (from GF-08): tournament leaders, awards and the medal table read field-event stat lines and positions, not just match lines. Needed for every future field sport (athletics, swimming, archery).
- **GEN: field-entry status admin** (from GF-04): WD / DQ / DNS / MC, editing an entry and removing it.
- **GEN: team aggregation of individual field results** (from GF-07): best N of M per team, with a `team_id` on entries.
- **GEN: career-stats framework** (the `cricketCareer.ts` pattern), used by GF-03, GF-09 and GF-17. Covers bests normalised by format (9 vs 18 holes), per-tracked-denominator rates, top-N finishes and a history with positions.
- **GEN: rating/index trend chart** (from GF-09): handicap index, chess Elo, any rating over time.
- **GEN: optional per-unit detail row** (from GF-02): a remembered "stats mode" with a tracked-denominator convention, so partial tracking never shows false zeros.
