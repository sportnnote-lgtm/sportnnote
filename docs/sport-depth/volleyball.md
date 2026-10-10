# Volleyball — depth audit

Standard sources: **FIVB Official Volleyball Rules 2025-2028** (rally scoring, 25/15 win-by-2, timeouts 2 per set, 6 substitutions per set, libero); **FIVB VIS (Volleyball Information System)** match statistics as published for VNL / World Championships (per player and team: attack points / errors / attempts and efficiency, block points, serve aces / errors / attempts, reception excellent / errors / attempts, digs, sets (excellent), opponent errors, total points); **FIVB Sports Regulations** league ranking (3-0 or 3-1 win = 3 match points to the winner, 0 to the loser; 3-2 = 2 to the winner, 1 to the loser; ranking by matches won → match points → set ratio → point ratio → result of the last match between the tied teams); FIVB individual awards (Best Scorer = attack + block + serve points; Best Attacker = attack efficiency; Best Blocker = blocks per set; Best Server = aces per set; Best Setter / Libero / Receiver / Digger). Beach: FIVB Beach rules (21, decider 15, no subs).

Builds on `docs/sport-coverage/racket-and-net.md` (scoring systems ✅, ACE + Block capture shipped, voice→ACE/Block shipped, timeouts 2/set shipped). Not repeated here.

Summary: the score engine is right (25/15, win-by-2, best-of-5/3, per-set line score, 2 timeouts/set, surgical point editor). The stats are shallow and, in two places, **wrong**. (1) With a roster loaded, every point must be credited to a player — there is no "opponent error / team point" option (`src/sports/volleyball/index.tsx:108-117`), so roughly a third of all points (opponent errors) are booked as some player's kill and Best Scorer is fiction. (2) An ace or block credits only `aces`/`blocks` on the stat line, never `points` (`index.tsx:124-133`), so the profile's and tournament's "Points" and the "Top scorer" award exclude aces and blocks while the live box score includes them (`BoxScore.tsx:26`). The league table uses 2-1-0 with set difference — **FIVB 3/3/2/1/0 by set score, set ratio and point ratio are not expressible** (`src/data/standings.ts:99-101`, `:111-114`; volleyball has no `standingsPoints`). There is no serve tracking, no subs, no libero, no sets-played count, so no per-set rates (the FIVB award basis).

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Rally scoring, 25 / decider 15, win by 2, Bo5/Bo3 | Core | `reducer` `index.tsx:68-106`, `isDecider` `:57-58` | ✅ | |
| Set scores line + sets won | Core | `VolleyballScoreboard` `index.tsx:185-203` | ✅ | |
| Point log (who, score after) | Core | events `index.tsx:92`, `LiveTimeline` | ✅ | |
| Timeouts 2 per set | Core | `index.tsx:73-78`, `:134-145` | ✅ | |
| **How the point ended**: attack kill / block / ace / **opponent error** | Core | POINT / ACE / BLOCK only; with a roster the POINT row is chips-only, no unattributed or "opponent error" option (`index.tsx:108-117`) | ❌ | **Credibility bug.** Add an "Opp. error" capture (optionally which opponent: serve error / attack error / net-fault). |
| Attack points (kills) per player | Core | "Point — player" is the de-facto kill, but mixed with opponent errors | ⚠️ | Becomes clean once opponent errors are separate. |
| Block points per player | Core | `BLOCK` (`index.tsx:132-133`), BLK column (`BoxScore.tsx:28`) | ✅ | |
| Serve aces per player | Core | `ACE` (`index.tsx:130-131`) | ✅ | |
| Serve errors per player | Core | not captured | ❌ | One tap — "Serve error" credits the point to the other side and an error to the server. With serve tracking (VB-05) the server is pre-filled. |
| Attack errors / block-outs | Core | not captured | ❌ | As part of "Opp. error" detail (optional player). |
| Attack attempts / attack efficiency | Core (VIS) | — | Out of scope (default) | Every attack must be logged; see §5. Optional "detailed mode" P2. |
| Reception excellent / errors, digs, sets | Core (VIS) | — | Out of scope | Every touch; needs a statistician. Reception error = ace against — derivable as "aces conceded" by team. |
| Total points per player (attack + block + serve) | Core | live box score counts all kinds (`BoxScore.tsx:26`) | ⚠️ | Box OK; stat lines inconsistent (see Player level). |
| Team totals row (attack / block / serve points, opponent errors) | Core | no totals (`BoxScore.tsx:44-55`) | ❌ | |
| Per-set box score | Core | set toggle (`BoxScore.tsx:80-87`) | ✅ | |
| Serving team / server rotation | Core | not tracked (`racket-and-net.md` §4) | ❌ | Derivable: side that won the rally serves next; needs only the first server + the six in rotation order. |
| Substitutions (6 per set), libero replacements | Core | `substitutes` setting only (`index.tsx:238`), no SUB action | ❌ | P1 for subs (needed for sets-played); libero P2. |
| Sanctions (yellow / red = point to opponent) | Core | — | ❌ | P2; a red card awards a point, so it must be a scoring action. |
| Side switch at 8 in the decider | rule | — | ⚠️ | P2 prompt only. |
| Video challenge | Adv | — | Out of scope | |
| Set duration / match duration | Core (VIS) | — | ❌ | Event timestamps exist on records; derivable. P2. |
| Match rating / MVP | Core | weights `{points 1, aces 3, blocks 2}` (`src/data/ratings.ts:23`) | ⚠️ | Workable only because `points` excludes aces/blocks; must change together with VB-02. |
| Per-match awards | Core | Top scorer, Aces (`ratings.ts:85-88`) | ⚠️ | No Best Blocker; "Top scorer" excludes aces and blocks. |

## 2. Team level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| W-L record, form | Core | `computeTeamStats` `src/data/teamStats.ts:39-70` | ✅ | |
| Sets for / against | Core | unit "sets" (`teamStats.ts:25`) | ✅ | |
| Points for / against, point ratio | Core | not computed — `m.score` is sets (`index.tsx:213`) | ❌ | Needs a `standingsPoints` hook (rally points per side). |
| Set ratio | Core | — | ❌ | sets won ÷ sets lost. |
| Results by set score (3-0 / 3-1 / 3-2 / 2-3 …) | Core | — | ❌ | The breakdown FIVB tables show. |
| Team attack / block / serve points per set, opp. errors | Core | — | ❌ | After VB-01. |
| Head-to-head | Core | generic (`teamStats.ts:59-64`) | ✅ | for/against are sets. |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Match points 3-0/3-1 → 3-0, 3-2 → 2-1 | Core | config is win/draw/loss only (`standings.ts:66-73`, `:216-221`); default 2-1-0 (`:99-101`) | ❌ | Needs score-dependent points (`pointsBySetScore`) — not expressible today, even by the organiser. |
| Rank: matches won → match points → set ratio → point ratio → h2h | Core | tie-breakers available h2h / diff / for (`standings.ts:111-114`); `diff` = **set difference**, not ratio; `h2hPoints` needs `standingsPoints`, which volleyball lacks (only rallyCore has it, `src/sports/rallyCore.tsx:152`) | ❌ | Add `wins` first, `setRatio`, `pointRatio` (overall). |
| Table columns: W, L, Pts, sets W-L, set ratio, point ratio | Core | P W L Pts (`StandingsScreen.tsx:270-280`) | ❌ | |
| Leaders: points, aces, blocks | Core | `STAT_CATEGORIES.volleyball` (`standings.ts:409-413`), **totals**; `points` excludes aces/blocks | ⚠️ | |
| FIVB awards: Best Scorer, Best Attacker, Best Blocker (blocks/set), Best Server (aces/set) | Core | MVP + Top scorer + Aces (`ratings.ts:200-205`) | ⚠️ | No Best Blocker; no per-set rates (no sets-played). Best Attacker (efficiency) out of scope without attempts — offer "Most attack points". Setter/Libero/Receiver/Digger = organiser-chosen custom awards (already supported generically). |
| Brackets / pools | Core | generic | ✅ | |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches, wins, win% | Core | `SportProfileScreen.tsx:175-180` | ✅ | |
| Total points (attack + block + serve) | Core | `points` stat counts only plain points; ACE → `aces` only, BLOCK → `blocks` only (`index.tsx:124-133`, `src/sports/rallyEdit.ts:66`) | ❌ | **Profile Points ≠ box-score PTS.** |
| Attack points / block points / aces / serve errors | Core | aces ✅, blocks ✅ (label missing in `SportProfileScreen.tsx:25-40` → raw "blocks"), kills mixed with opp. errors, serve errors ❌ | ⚠️ | |
| Sets played | Core | not tracked | ❌ | Base for every FIVB per-set rate. Default = all sets of a match for the match squad; refined by subs (VB-06). |
| Points / set, blocks / set, aces / set | Core | — | ❌ | |
| Best match (most points) | Core | — | ❌ | Max over per-match lines. |
| Game log line | Core | raw `key value` (`SportProfileScreen.tsx:289`) | ⚠️ | "14 pts (10 att · 2 blk · 2 ace) · 3-1 W". |
| Reception %, attack efficiency | Core (VIS) | — | Out of scope | §5. |

## 5. Out of scope (needs tracking / extra spotters)

- Attack attempts and attack efficiency ((kills − errors) ÷ attempts) — every swing logged; VIS uses a dedicated statistician. A P2 optional "detailed mode" could log attempts for coaches who want it, but it is not proposed as default.
- Reception quality (excellent / positive / error), digs, setter "excellent sets" — every touch.
- Attack zones / rotation-by-rotation efficiency, serve speed, heat maps.
- Libero-specific touch stats.

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| VB-01 | **Point outcome capture**: per rally, "Kill (player) · Block (player) · Ace (server) · Opp. error (optional: serve error / attack error / net-fault + optional opponent player)". A team-only point is always one tap. New kinds `oppError` (point to side, `errorBy` = opponent player/kind) and `serveError`. Extend `PointKind` + `isPointKind` + `ACTION_OF` in `rallyEdit.ts:23-66` so the surgical editor and EDIT_LOG replay keep them. | P0 | M | Match, Player, Tournament | New action types `OPP_ERROR`, `SERVE_ERROR` (both score a point for `side`); old logs contain none → identical replay. Plain `POINT` keeps meaning "point" (legacy = unknown outcome). | No | **GEN** — "how the point ended" (winner / forced / unforced error / ace / double fault) is the same shape for tennis, badminton, TT, padel, pickleball, squash |
| VB-02 | **Fix points credit**: ACE and BLOCK attributions add `extra: {points: 1}` (stat stays aces/blocks); `rallyEdit.statOf` replay mirrors it. Back-fill via VB-03 absolute totals. | P0 | S | Player, Tournament, Match (awards) | New `extra` on ACE/BLOCK attribution; replay of old logs unchanged (attribution is a side channel); totals corrected by VB-03. | No | No |
| VB-03 | **Volleyball `statTotals`** (parity #19): absolute per-match lines `{points, attackPoints, blockPoints, aces, serveErrors, errors, setsPlayed}` derived from the point log, so old matches heal on next sync and edits never drift. | P0 | M | Player, Team, Tournament | None (derivation) | No | **GEN** (same as BK-05) |
| VB-04 | **FIVB standings**: score-dependent match points (`pointsBySetScore`, e.g. `3-0:3/0, 3-1:3/0, 3-2:2/1`) as a format option + volleyball default; tie-breakers `wins`, `setRatio`, `pointRatio` (overall) with a `standingsPoints` hook on volleyball; columns W · L · Pts · Sets · SR · PR. | P0 | M | Tournament, Team | None | No (format JSON) | **GEN** — score-dependent points + set/point ratio serve badminton/TT/tennis team leagues and beach volleyball; reuse `rallyCore.standingsPoints` shape |
| VB-05 | **Serve tracking**: pick first server (and optional six in rotation order); serving side follows rally winner; server derived from rotation. Pre-fills Ace / Serve error. Shows serving team on the scoreboard. | P1 | M | Match | New one-off `SET_SERVE` / `SET_ROTATION` actions; old logs have none → no serve shown. | No | **GEN** — shared `serve.ts` already exists for rallyCore; extend to rotation sports |
| VB-06 | **Substitutions + sets played**: SUB (off→on, max 6/set counter) and libero swap (no counter); sets played per player = sets in which they were on court. | P1 | M | Match, Player | New `SUB` action (non-scoring timeline marker, like TIMEOUT `index.tsx:73-78`) | No | **GEN** — a shared sub/on-court tracker (basketball has one in `engine.ts:80-90`; football/kabaddi too) |
| VB-07 | **Volleyball box score**: PTS · Att · Blk · Ace · SE · Err per player + team totals row incl. opponent errors; per-set toggle kept. | P1 | S | Match | None | No | **GEN** (shared box-score table, BK-04) |
| VB-08 | **Career + per-set rates**: points/set, aces/set, blocks/set, best match, game-log line; labels for new keys. FIVB awards: Best Scorer (att+blk+ace), Best Blocker (blk/set), Best Server (ace/set), Most attack points; match MVP weights updated after VB-02. | P1 | M | Player, Tournament | None | No | **GEN** (career framework, BK-06; per-unit rates generalise "per game") |
| VB-09 | **Team volleyball stats**: points for/against, point ratio, set ratio, results by set score, team att/blk/ace per set, opponent errors received. | P1 | S | Team | None | No | Partly GEN (team per-game) |
| VB-10 | **Sanctions** (yellow; red = point to opponent) and decider side-switch prompt at 8; set/match duration from event timestamps. | P2 | S | Match | New `SANCTION` action (red scores for the other side) | No | No |
| VB-11 | **Optional detailed mode** — attack attempts → attack efficiency, reception errors → reception %. Off by default; stamped in `tracked` so coverage shows. | P2 | M | Match, Player | New `ATTACK_ATTEMPT` (non-scoring) | No | No |

GEN- candidates from this sport: point-outcome capture for all rally sports (VB-01), `statTotals` for every event-log sport (VB-03), score-dependent match points + set/point-ratio tie-breakers (VB-04), serve/rotation tracking (VB-05), shared substitution / on-court tracker (VB-06), shared box-score table (VB-07), career framework with per-unit rates (VB-08), and the single stat-label registry (labels missing for `blocks`, `steals`, `turnovers`, `freeThrowsAtt` in `SportProfileScreen.tsx:25-40`).
