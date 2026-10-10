# Padel — depth audit
Standard sources: FIP *Reglamento de Juego* / Rules of Padel (tennis scoring; golden point "punto de oro" option; 6-game sets with a 7-point tiebreak at 6-all; super tiebreak to 10 in place of a deciding set; doubles serve order fixed per set; change of ends on odd games). Premier Padel / FIP Tour match stats (points won, service points won, break points won/saved, golden points won, games won on serve/return, winners, unforced errors, smashes incl. "por 3"/"por 4", match duration). FIP World Padel Championships (pair and national-team formats). FIP ranking: individual points by round reached, pairs seeded by the sum of the two players' points. Note: FIP announced a "Star Point" deuce rule for the 2026 tour (advantage twice, then a deciding point). Check the exact wording against the FIP 2026 regulations before building PD-07.

Summary: padel has its **own engine** (`src/sports/padel/index.tsx`), not the rally core, and the scoring is right. That covers advantage or golden point (`:129`), 6- or 4-game sets with a 7-point tiebreak at games-all (`:72-73`, `:118-125`), a match tiebreak to 10 as decider (`:70`), a first-server choice (`:143-148`), and derived serve rotation incl. doubles slot and tiebreak rotation (`serve.ts:32-41`). **Serve tracking already exists**, so the core Premier Padel numbers (service points won, break points converted/saved, holds, golden points won) are **derivable from the existing log with no new capture**, but none are computed. The box score is just PTS per player (`padel/index.tsx:215`, `PointBoxScore.tsx:16-26`). The scorer's player tap only means "credited to"; it has no winner/error meaning. In padel most points end on an error, so per-player "points" misleads. Match cards show only sets won (`MatchCard.tsx:93-95`). There's no surgical point editor, no games-difference tie-break, and no pair/player W-L in sets and games. **No padel engine test exists.** The biggest P0 gaps: (1) the set-score line on results, history and cards; (2) a derived serve/return box score (breaks, holds, golden points); (3) a sets/games career line for players and pairs.

## 1. Match level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Tennis scoring 0/15/30/40/Ad | Core | `disp()` (`padel/index.tsx:80-89`) | ✅ | |
| Golden point at 40-40 | Core (FIP/Premier) | `deuce: 'golden'` (`:57`, `:129`), banner (`:194`) | ✅ | |
| Star Point (FIP 2026: 2 advantages, then a deciding point) | Core (2026 tour) | None | ❌ | Verify rule text first |
| 6-game sets, 7-pt tiebreak at 6-6 → 7-6 | Core | `:72-73`, `:118-125` | ✅ | |
| Short sets to 4 (tiebreak at 4-4) | Core (amateur/junior) | `gamesPerSet: 4` (`:273-277`) | ✅ | |
| Super tiebreak to 10 as the deciding set | Core | `matchTbDecider` (`:58`, `:70`, `:124`) | ✅ | Recorded as 0-0 games plus a set win. Should display e.g. "[10-7]" |
| Best of 3 / single set / best of 5 | Core | `setsToWin` (`:280-286`) | ✅ | |
| Doubles default; singles allowed | Core | `participantKind: 'both'`, default 2 (`:227`, `:258-263`) | ✅ | FIP padel is doubles. Singles is a fringe variant |
| First server; serve alternates by game; tiebreak rotation; partner rotation | Core | `SET_FIRST_SERVER` (`:143-148`), `serve.ts:27-41` | ✅ | |
| Pair may change serving order at each set (FIP) | Core | Slot derived purely from games parity (`serve.ts:38-40`) | ⚠️ | Wrong server name shown if a pair switches who serves first in set 2. Needs a per-set "who serves first" pick |
| Change of ends (odd games) | Adv | Not shown | ⚠️ | Display only |
| Lets / service faults / double faults | Core-ish | None. Only `POINT` (`:150`) | ❌ | Double faults are a Premier stat. Practical with one tap |
| Box score per player | Core | PTS per player per set (`:214-215`) | ⚠️ | "PTS" = points the scorer credited to a player. No winner/error meaning |
| Service points won %, break points won/faced/saved, games held/broken | Core (Premier Padel stats) | Not computed. Server is derivable (`serveInfo`, `:77`) | ❌ | **Zero new capture.** Replay the log and tag each point with the server |
| Golden points won/played | Core (Premier) | Not computed | ❌ | Derivable: points played at 3-3 with `goldenPoint` |
| Tiebreaks won/played | Core | Timeline only | ⚠️ | Derivable |
| Winners / unforced errors / smashes (incl. por 3 / por 4) | Core (Premier) | None | ❌ | Practical as an optional "how" tap |
| Set-score line on results (6-4 3-6 [10-7]) | Core | Live-screen `detailLine` only (`:240`) | ⚠️ | Card shows sets won (`MatchCard.tsx:93-95`). History row shows "N pts" (`SportProfileScreen.tsx:289`) |
| Game-won timeline label | Core | `label: \`Game ${side === 'home' ? 'home' : 'away'}\`` (`:133`) | ⚠️ | Literal "Game home/away". Should use the team name, plus "Break" when the receiver wins |
| Mid-match point edit | Core (scorer UX) | No `EDIT_LOG` in padel's reducer (`:140-152`). Tennis has one (`tennis/index.tsx:72`, `tennis/engine.ts:9`) | ⚠️ | Undo and post-match correction cover it. Point events already carry `kind:'point'` + `set` (`:115`), so `replayPoints` can drive it directly |
| Match duration | Core (Premier) | Not derived (events have `created_at`) | ❌ | GEN-03 |
| Retirement / walkover | Core | Generic (`LiveScoringScreen.tsx:180-190`) | ✅ | |
| Engine tests | — | No padel test file | ⚠️ | Add golden-point, 7-6, match tiebreak and serve-rotation cases |

## 2. Team level (team = the pair; national / club team ties = series)
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Pair record W-L, form, H2H | Core | `TeamProfileScreen.tsx:185-230` via `teamStats.ts` | ✅ | |
| Sets won-lost, games won-lost | Core | `scored/conceded` = sets (`result()` returns sets: `padel/index.tsx:231`). Games never aggregated | ⚠️ | |
| Team ties (national team best-of-3 pairs, as in FIP Worlds) | Core | `series.ts` (`:12`) | ✅ | |
| Americano / Mexicano social formats | Core (club) | Americano (`data/americano.ts`, `StructureEditor.tsx:26-27`) | ✅ | Mexicano (pairing by standings) not supported. P2 |

## 3. Tournament level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Group table: wins, then H2H, then set difference, then game difference (FIP group stages) | Core | `h2h → diff → for` on **sets** (`standings.ts:100-103`). No `standingsPoints` on padel, so no games tie-break | ⚠️ | Add `standingsPoints` returning games won (each tiebreak counted as 1 game) and a `gamesDiff` criterion |
| Knockout draw with seeding, qualifying, consolation | Core | Shared bracket/structure | ✅ | |
| Leaderboards | Core | `points` only (`standings.ts:419`) | ⚠️ | Should be wins, set % and game %. Breaks and golden points once PD-02 lands |
| Awards | Core | Generic | ✅ | |
| FIP-style ranking points by round reached; pair seeding = sum of both players | Adv | None | ❌ | GEN-08 |

## 4. Player level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches, wins, win % | Core | `SportProfileScreen.tsx:177-179` | ✅ | |
| Sets W-L, games W-L, set %, game % | Core | Not on stat line (`stats.ts:114` = points) | ❌ | GEN-06 via `statTotals` |
| Service games held %, break points converted %, golden points won % | Core (Premier) | None | ❌ | Follows PD-02 |
| Partners played with (record per partner), side played (drive/revés) | Core (padel-specific) | Side is a free-text profile field (`sportProfileFields.ts:43,64`). No per-partner record | ❌ | Per-partner W-L is cheap: partner = teammate on the match roster |
| Match history with score line | Core | "N pts" + WON/LOST (`SportProfileScreen.tsx:289`) | ❌ | GEN-01 |
| Form / H2H as a player (not a pair) | Core | None | ❌ | GEN-05 |
| Ranking | Adv | None | ❌ | GEN-08, note |

## 5. Out of scope (needs tracking / extra spotters)
- Shot maps (bandeja / víbora / chiquita mix), glass/wall rebound usage, net-position %.
- Ball speed, distance covered, rally length in shots.

## 6. Proposed build items
| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| PD-01 | **Set-score line everywhere** ("6-4 3-6 [10-7]") on match card, result, share text and history. Show the match tiebreak as a bracketed score | P0 | M | Match, Player | None. Derived from `sets` (match-tiebreak points must be stored in the set entry: today `winSet` writes games 0-0 at `:124`) | No | **GEN-01** |
| PD-02 | **Derived serve/return box score**: replay the log through the reducer, tag each point with `serveInfo`, and compute service points won %, games held/broken, break points won/faced/saved, golden points won/played, tiebreaks, longest streak. Per pair, with per-player server lines | P0 | M | Match, Team, Player | None (pure derivation, old logs included) | No | **GEN-09** serve-stats deriver shared with tennis (same `serve.ts`) |
| PD-03 | **Sets/games career + per-partner record**: `statTotals` writes `setsWon/Lost`, `gamesWon/Lost`, `breaksWon`, `holds`, `goldenWon/Played`. Profile shows set %, game %, break %, golden-point %, and record with each partner | P0 | M | Player, Tournament (leaders) | None (absolute totals) | No | **GEN-06** |
| PD-04 | Group tie-breaks per FIP: add `standingsPoints` (games) and offer `h2h, diff (sets), games diff` | P1 | S | Tournament | None | No | **GEN-04** (tennis too) |
| PD-05 | Point "how" (optional): winner / unforced error / forced error / double fault / smash winner (incl. por 3 / por 4), with the player | P1 | M | Match, Player | `POINT.payload.how` + `attribution2` for the error-maker. Absent = plain point, so old logs replay identically | No | **GEN-02** |
| PD-06 | Wire `RallyPointEditor` + `EDIT_LOG` into padel (events already carry `kind`/`set`), as tennis does | P1 | S | Match | `EDIT_LOG` (existing type) | No | Shared component |
| PD-07 | Star Point deuce option (FIP 2026) alongside advantage / golden point | P1 | S | Match | Config key `deuce: 'star'`. The engine counts deuces in the current game. Replay-safe | No | Same in tennis? No (padel-specific) |
| PD-08 | Per-set "who serves first" for the pair (fixes server naming after a switch) | P2 | S | Match | New action `SET_SET_SERVER` {slot}, valid at 0-0 of a set | No | Tennis doubles same, GEN-ish |
| PD-09 | Timeline polish: "Game {team}" / "Break {team}" / "Hold" instead of "Game home" (`:133`) | P1 | S | Match | Label-only (labels are rebuilt on replay) | No | Tennis same |
| PD-10 | Padel engine tests: Premier Padel final replay (golden points, a 7-6 set), short-set + match tiebreak, serve rotation in doubles | P1 | S | Match | None | No | No |
| PD-11 | Match duration from timestamps | P2 | S | Match | None | No | **GEN-03** |
| PD-12 | Mexicano (pair by current standings each round) next to Americano | P2 | M | Tournament | None | No | Pickleball too |

GEN candidates raised: **GEN-01** set/game score line. **GEN-02** point "how". **GEN-03** duration. **GEN-04** games-ratio tie-breaks. **GEN-05** individual form/H2H. **GEN-06** racket career via `statTotals`. **GEN-08** ranking points by round reached. **GEN-09** derived serve/return stats from `serve.ts` (padel + tennis).
