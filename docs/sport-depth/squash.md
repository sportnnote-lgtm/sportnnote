# Squash — depth audit
Standard sources: World Squash (WSF) *Rules of Singles Squash* 2020 rev. (PAR-11, two clear points at 10-all, best of 5; Rule 8 Interference: Let / Stroke / No Let; Rule 15 Conduct: warning, conduct stroke, conduct game, conduct match; retirements/injury categories); WSF Doubles rules (PAR-15 doubles); PSA World Tour match centre / SquashTV stats (game scores, match and per-game duration, points won, winners, errors, strokes/lets/no-lets awarded, conduct); PSA World Rankings (points by round reached, averaged over events); PSA World Team Championships (best-of-3 rubbers); WSF World Junior / school formats (best of 5 PAR-11, sometimes best of 3).

Summary: the **scoring** is correct and covers both systems — PAR-11 best of 5 with win-by-2 is the default preset (`src/sports/squash/index.tsx:31-37`), English hand-out to 9 and American PARS-15 are presets, and serve passes to the rally winner. Undo, retirement, walkover and the post-match correction list are shared. But the **statistics** stop at "points per player" (`PointBoxScore.tsx:16-26`) and matches/wins/win-rate on the profile (`SportProfileScreen.tsx:177-179`). The thing that makes squash squash, the **referee decision** (let / stroke / no let) and **conduct penalties**, cannot be recorded at all. Per-game scores are never shown off the live screen: match cards and profiles read "3-1" (`MatchCard.tsx:93-95`), history rows read "34 pts" (`SportProfileScreen.tsx:289`). There are no games won/lost, no game-win %, no player H2H and no duration. The English "set one / set two" choice at 8-all is missing. The rally engine has **no squash test** (only table tennis is replayed: `tests/replay-wave1.test.mts:192`). The biggest P0 gaps: (1) game-by-game scores on cards, history and the result; (2) a career line of games won-lost and game % (W/L only today); (3) let/stroke/no-let decisions plus conduct warnings.

## 1. Match level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| PAR-11, 2 clear at 10-all, best of 5 | Core | PSA preset default (`squash/index.tsx:31-33`); `gameWinner` (`rallyEngine.ts:38-42`) | ✅ | |
| Best of 3 / single game; PARS-15; English to 9 | Core (club/junior) | Presets `short`, `american`, `english` (`squash/index.tsx:34-36`) | ✅ | |
| English hand-out scoring (only server scores) | Core (legacy) | `sideOut` path (`rallyEngine.ts:75-86`) | ✅ | |
| English "set one / set two" at 8-all (receiver chooses to 9 or 10) | Core (English) | Hard cap: `english` preset is `winBy: 1` to 9 (`squash/index.tsx:35`) | ❌ | 8-all can't be played to 10 |
| Server = previous rally winner; game winner serves next game | Core | Last `point` event's side (`rallyCore.tsx:92-95`); `serving: winner` (`rallyEngine.ts:104`) | ✅ | |
| First server by racket spin | Core | Engine reads `config.firstServe` (`rallyEngine.ts:62`) but squash has no format field (table tennis does: `tabletennis/index.tsx:38-39`) | ⚠️ | Always home serves first |
| Service box (R/L), hand-out indicator | Adv | Not shown | ⚠️ | Display only; not needed for stats |
| Doubles (WSF PAR-15 doubles) | Core (doubles events) | `playersPerSide: 2` + points to 15 | ⚠️ | No doubles service order. Low priority for schools |
| Let / Stroke / No Let decisions | Core (the sport's signature) | None. Only `POINT` (`rallyCore.tsx:57-58`) | ❌ | Stroke = point to the appellant; Let = replay, no score; No Let = point to the opponent |
| Conduct: warning / conduct stroke / conduct game / conduct match | Core (referee sheet) | None | ❌ | A conduct game/match changes the score, so the engine must support awarding a game |
| Retirement (injury / bleeding / self-inflicted) | Core | Generic retire + walkover (`LiveScoringScreen.tsx:180-190`) | ✅ | No injury category. Fine |
| Per-player box score | Core | `PointBoxScore` PTS per player, per-game toggle (`PointBoxScore.tsx:51-88`) | ⚠️ | In singles, PTS = the game score, so it adds little |
| Game scores line (11-7, 9-11, 11-5, 11-8) | Core | Live screen only (`rallyCore.tsx:125-131`, `detailLine` 160-162) | ⚠️ | Not on the match card (`MatchCard.tsx:93-95` = games won), the result or share text |
| Rally log / timeline | Core | `LiveTimeline` (`rallyCore.tsx:135-136`) | ✅ | |
| Mid-match point edit (surgical) | Core (scorer UX) | `RallyPointEditor` is wired only into tennis and volleyball (`tennis/index.tsx:72`, `volleyball/index.tsx:146`) | ⚠️ | Undo and post-match correction work. The English side-out events aren't `kind:'point'` (`rallyEngine.ts:81,84`), so `pointInputs` (`rallyEdit.ts:40-43`) would drop them |
| Match duration, per-game duration | Core (PSA) | Events have `created_at` (`core/types.ts:784`) but nothing is derived | ❌ | Derivable, no new capture |
| Winners / errors (forced, unforced) per player | Adv (PSA/SquashTV) | None | ❌ | Practical as an optional "how" tap after each rally |
| Longest run of points, game-ball / match-ball saved | Adv | None | ❌ | Derivable from the log |
| Player of the match | Core-ish | Generic MVP by `points` (`ratings.ts:32,101`, labelled "Top scorer") | ⚠️ | "Top scorer" reads oddly for a 1-v-1 sport. The winner should be the default |
| Engine test coverage | — | No squash replay test. The engine is only tested via table tennis (`tests/replay-wave1.test.mts:192`) | ⚠️ | Add a PSA final replay plus an English-scoring test |

## 2. Team level
(For singles, the "team" is the player. For doubles, it's the pair. Team-squash ties, such as the PSA World Teams, are series of rubbers.)
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Season record W-L | Core | `teamStats` form/record (`TeamProfileScreen.tsx:185-191`, `teamStats.ts:15-19`) | ✅ | Pairs and houses |
| Form guide | Core | ✅ (`TeamProfileScreen.tsx:189-195`) | ✅ | |
| Head-to-head | Core | ✅ for teams (`TeamProfileScreen.tsx:224-230`) | ✅ | Not for singles players: see Player |
| Games won-lost, points won-lost | Core | "scored/conceded" = games won (`result()` returns games: `rallyCore.tsx:150`) | ⚠️ | No rally-points aggregate |
| Team tie (best-of-3/5 rubbers, house vs house) | Core | `series.ts` (`series.ts:12` mentions team squash) | ✅ | Rubber-count tie-breaks not audited here |

## 3. Tournament level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Group standings: match points, then games ratio, then points ratio (WSF/PSA round robins, as in ITTF) | Core | Default `win 2, draw 1, loss 0`, tie-break `h2h → diff → for` (`standings.ts:100-103`); `h2hRatio`/`h2hPoints` offered only for table tennis (`standings.ts:111-115`) | ⚠️ | `standingsPoints` already exists for rally sports (`rallyCore.tsx:152-155`), so squash could use the TT order. Config change only |
| League table columns: games for:against | Core | `for:against (diff)` = games (`LeagueTable.tsx:39`) | ✅ | Points ratio not shown |
| Knockout draw / brackets, seeding, 3rd/4th, consolation plate | Core | Shared bracket + structure editor | ✅ | Shared |
| Leaderboards | Core | `STAT_CATEGORIES.squash = points` only (`standings.ts:420`) | ⚠️ | Standard leaders are wins, game % and games won, not rally points |
| Awards | Core | Generic `TournamentAwardsTab` | ✅ | |
| Ranking points by round reached (PSA-style) | Adv | None | ❌ | Generic across racket sports (GEN) |

## 4. Player level
| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches, wins, win % | Core | `SportProfileScreen.tsx:177-179` | ✅ | |
| Games won-lost, game-win % | Core | Not recorded on the stat line (only `points` + `won`: `stats.ts:113-115`) | ❌ | Needs `statTotals` (`types.ts` parity #19 hook) on rallyCore |
| Points won-lost, points % | Core | `points` only counted when the scorer taps a player chip | ⚠️ | Rally-points-against never stored |
| Match history with score line (3-1: 11-7 9-11 11-5 11-8) | Core | Row shows `34 pts` + WON/LOST (`SportProfileScreen.tsx:289`) | ❌ | P0 credibility |
| Form (last 5) and player H2H vs an opponent | Core | Team only. Nothing for singles players | ❌ | GEN with tennis, badminton and TT |
| Deciding-game record (5th-game W-L), comebacks from 0-2 | Adv | None | ❌ | Derivable from game list |
| Strokes/lets won, conduct record | Adv | None | ❌ | Follows SQ-03 |
| Ranking / rating | Adv | None | ❌ | Note only (GEN rating) |

## 5. Out of scope (needs tracking / extra spotters)
- Shot-type mix (drive, boast, drop, lob) and T-position / court coverage heatmaps (SquashTV tracking).
- Rally length in shots (needs a dedicated counter. Rally *duration* from timestamps is in scope).
- Ball speed, distance covered.

## 6. Proposed build items
| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| SQ-01 | **Game-score line everywhere**: store per-game scores in the result (e.g. `result.periods: [[11,7],[9,11],…]`) and show "3-1 (11-7 9-11 11-5 11-8)" on the match card, result banner, share text and history row | P0 | M | Match, Player | None. Derived from state at completion | No (rides in `matches.state`/result jsonb) | **GEN-** all set/game sports (tennis, badminton, TT, padel, pickleball, volleyball) |
| SQ-02 | **Racket career line**: `statTotals` on rallyCore writes per-player `gamesWon`, `gamesLost`, `ptsWon`, `ptsLost`, `decidersWon/Played`. Profile shows W-L, game %, point %, 5th-game record | P0 | M | Player, Tournament (leaders) | None. Absolute totals via the existing `statTotals`/`syncMatchStatLines` path, names resolved through the roster | No (stat jsonb) | **GEN-** racket career framework (copy the `cricketCareer.ts` pattern) |
| SQ-03 | **Referee decisions**: an optional strip under "Rally won": `Stroke → X` (scores a point, kind `stroke`), `Let` (no score, kind `let`), `No let → X` (point, kind `nolet`). Counts in the box score and on the profile | P1 | M | Match, Player | New action `DECISION` {decision:'let'\|'stroke'\|'nolet'} or `POINT.payload.how`. A let is a timeline-only event. Old logs replay unchanged (no `how` = plain point) | No | Partly. The "point with a `how`" payload is GEN-02 |
| SQ-04 | **Conduct**: warning / conduct stroke / conduct game / conduct match per player, with reason. The engine supports awarding a game (`AWARD_GAME`) and the match | P1 | M | Match, Player | New actions `CONDUCT` {level, side, player, reason} and `AWARD_GAME`. Replay-safe (additive) | No | **GEN-** conduct/cards across racket sports (tennis code violations, TT yellow/red, badminton faults) |
| SQ-05 | Standings default to the WSF/ITTF order: match points, then games ratio, then points ratio among the tied (`h2h, h2hRatio, h2hPoints`, restart) and offer them in `availableTieBreakers` | P1 | S | Tournament | None | No | Same change for pickleball/badminton (GEN-04) |
| SQ-06 | Expose "Serves first (racket spin)" (`firstServe`) like table tennis | P1 | S | Match | None (config key already read) | No | Shared with pickleball |
| SQ-07 | English scoring: "set one / set two" choice at 8-all (receiver chooses 9 or 10) | P2 | S | Match | New action `SET_GAME_TARGET` {target} valid only at 8-8. Replay-safe | No | No |
| SQ-08 | Wire `RallyPointEditor` into rallyCore, adding a `rally` kind so hand-outs and 2nd-server events replay. Careful: the 2nd-server event's `side` is the *serving* (losing) side (`rallyEngine.ts:81`) | P1 | M | Match | `EDIT_LOG` support in rallyCore. Side-out events need an explicit `wonBy` key going forward; old logs inferable | No | **GEN-** shared with pickleball |
| SQ-09 | Match and per-game duration from event `created_at` | P1 | S | Match, Player (avg match length) | None | No | **GEN-03** every timed-by-log sport |
| SQ-10 | Winners / unforced errors / forced errors as an optional "how" tap after each rally (off by default, a "Stats captured" live setting) | P2 | M | Match, Player | `POINT.payload.how` + `attribution2` for the erring player | No | **GEN-02** rally-stats engine |
| SQ-11 | Player form + H2H for individuals (singles), mirroring team H2H | P1 | M | Player | None | No | **GEN-05** |
| SQ-12 | Squash replay tests: a PSA final (best of 5 PAR-11 with 12-10 games) and an English-scoring club game with hand-outs | P1 | S | Match | None | No | No |
| SQ-13 | MVP/POTM label "Top scorer" → "Player of the match" defaulting to the winner for 1-v-1 sports | P2 | S | Match | None | No | GEN with TT/tennis/badminton singles |

GEN candidates raised: **GEN-01** game/set score line on results (SQ-01). **GEN-02** a rally-stats "how was the point won" payload plus derived box score (SQ-03/SQ-10). **GEN-03** match/game duration from timestamps (SQ-09). **GEN-04** racket-sport tie-break defaults: games ratio and points ratio (SQ-05). **GEN-05** individual form + H2H (SQ-11). **GEN-06** racket career framework via `statTotals` (SQ-02). **GEN-07** conduct/penalty events (SQ-04). **GEN-08** ranking points by round reached (Tournament).
