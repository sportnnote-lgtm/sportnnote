# Badminton — depth audit

Standard sources: BWF Laws of Badminton (2024): Law 7 (scoring 21, setting to 30, 29-all golden point), Law 8 (change of ends), Law 9–11 (service, service courts, doubles serving/receiving order), Law 16 (intervals at 11 and between games); BWF General Competition Regulations, Section 5.x "Group play": ranking by matches won; if two tied, head-to-head; if three or more tied, game difference, then point difference, then head-to-head for two remaining / draw; BWF Tournament Software / BWF World Tour match statistics (points won, points on serve and receive, max consecutive points, game/match points); BWF player profiles (career W-L, titles, prize money, ranking); Thomas / Uber / Sudirman Cup team-tie rules (3S+2D, 5 rubbers).

Summary: the **scoring is right**: 21 rally, win by 2, cap 30 with golden point, best of 3/5/single, plus 11/15-point presets (`badminton/index.tsx:46-124`). Serve side and service court are derived from the log (`index.tsx:68-75`). The **statistics are only "points per player"** (`badminton/BoxScore.tsx:13-26`). Profiles get `points` only (`ratings.ts:24`, `standings.ts:404`, `stats.ts:111`). Missing Core items: points won on serve / on receive, total points won %, longest run of points, game and match points saved, the interval score, and the game scoreline in history. All of these are **derivable from the existing point log**: the server is the last rally winner (`index.tsx:68-75`). The finished-match summary reads "0–0" (`index.tsx:233`; `current` is reset at `:123`). Group tie-breaks don't follow BWF: there is no point-difference criterion and no `standingsPoints` for badminton, and head-to-head runs before games difference even for 3+ tied (`standings.ts:100,114`). In doubles the server and court are named only by side (`index.tsx:147-149`), not by player. Shared core findings are in `tennis.md` § "Shared racket/net core".

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Rally scoring to 21, win by 2, setting to 30 (golden point at 29-all) | Core | `gameWinner` (`index.tsx:77-84`), cap/golden-point config | ✅ | |
| Best of 3 games; 5×11 trial format; single game | Core | Presets (`index.tsx:247-250`) | ✅ | |
| Serving side (rally winner serves) | Core | `serve()` derived from the log (`index.tsx:68-75`) | ✅ | |
| Service court (right/left by the server's score parity) | Core | `court` (`index.tsx:74`); banner `:163` | ✅ | |
| Doubles: which player serves / receives (Law 11) | Core | Side name only (`index.tsx:147-149`) | ⚠️ | Derivable from the initial server + receiver per game, because players swap courts only when their side wins a point on its own serve. |
| Interval at 11 / between games; change of ends in game 3 at 11 | Core (procedure) | — | ⚠️ | No cue; the timeline doesn't mark the 11-point interval. |
| Game scores line (21-17, 19-21, 21-15) | Core | `LineScoreboard` (`index.tsx:201-219`), game chips (`:188`) | ✅ | |
| Result after the match (games + scores) | Core | `summary()` gives current points, so "0–0" once ended (`index.tsx:233`) | ❌ | GEN-RES. |
| Points won per player | Core (doubles split) | Box score PTS (`BoxScore.tsx:16-26`) with a per-game toggle | ✅ | In doubles it needs a player chip per rally (slow; see BD-08). |
| Total points won (and %) per side | Core | Only implicitly (game scores) | ⚠️ | Not summed or shown. |
| Points won on serve / on receive | Core (BWF stats) | Derivable (server per point) | ❌ | GEN-RS. |
| Max consecutive points (longest run) | Core (BWF stats) | Derivable | ❌ | GEN-RS. |
| Game points / match points saved; comebacks | Core (broadcast) | Derivable (`target`, `cap`, `goldenPoint`) | ❌ | GEN-RS. |
| Biggest lead | Adv | Derivable | ❌ | GEN-RS. |
| Point timeline + surgical editor | Core | `LiveTimeline` + `RallyPointEditor` (`index.tsx:167-171`) | ✅ | |
| Service faults, lets | Adv | — | ❌ | A service fault is just a point to the receiver; an optional tag (BD-06). |
| Smash winners / net kills / unforced errors | Adv (practical, optional) | — | ❌ | Optional tag only (GEN-PO). |
| Misconduct cards (yellow / red / black) | Adv | — | ❌ | P2. A red card awards a point (Law 16.7). |
| Match / game duration | Core (BWF stats) | — | ❌ | Event timestamps (GEN). |

## 2. Team level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Played / W / L, form, head-to-head | Core | `teamStats.ts`, `TeamProfileScreen` | ✅ | for/against = games, unlabelled "Scored" (`teamStats.ts:25`). |
| Games W-L, points W-L | Core | Games only (via `m.score`) | ⚠️ | Points aren't aggregated. |
| Team ties (Thomas/Uber 3S+2D, Sudirman 5 events; school inter-house ties) | Core | `series.ts` rubbers (knockouts only) | ⚠️ | Group standings count each rubber as a match. GEN-TIE. |
| Doubles pair identity across events | Core | Only as the same team row | ⚠️ | |
| Top performers | Core | `SPORT_AWARDS.badminton` = points (`ratings.ts:89`) | ⚠️ | Points-based "Top scorer" doesn't fit a racket sport. Use wins / win %. |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Draws / brackets / seeding | Core | Generic bracket | ✅ | |
| Group ranking by matches won | Core | win 2 / loss 0 (`standings.ts:99-101`) | ✅ | |
| Two tied: head-to-head | Core | `h2h` first | ✅ | |
| 3+ tied: games difference → points difference → H2H | Core (BWF GCR) | Order `h2h, diff, for` (`standings.ts:100`); `diff` = games diff; no points difference (no badminton `standingsPoints`; only `rallyCore.tsx:152` defines it) | ⚠️ | A 3-way tie with an unequal mini-league is ranked by H2H, where BWF uses games difference. Points difference is impossible today. |
| Leaderboards | Core | `points` only (`standings.ts:404`) | ⚠️ | Missing wins, win %, games %, points %, longest run. |
| Awards | Core | Points weight 1 (`ratings.ts:24`) | ⚠️ | |
| Champions per event (MS/WS/MD/WD/XD) | Core | `bracketChampion` | ⚠️ | Not written to player profiles as titles. |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches, W-L, win % | Core | `SportProfileScreen.tsx:177-179` | ⚠️ | Depends on an attributed stat line (shared core). |
| Singles / doubles / mixed split | Core | — | ❌ | |
| Games won-lost (%) | Core | — | ❌ | GEN-RC. |
| Points won-lost (%) | Core | `points` total only (points *won* when credited) | ⚠️ | No points lost, so no %. |
| Three-game record, deciding-game W-L, comebacks | Core (BWF profile) | — | ❌ | |
| Points on serve / receive %, longest run (best) | Core | — | ❌ | GEN-RS + GEN-RC. |
| Titles / finals | Core | — | ❌ | |
| Match history with the game scores | Core | Counters only (`SportProfileScreen.tsx:289`) | ⚠️ | |
| Head-to-head vs an opponent | Core | — | ❌ | GEN-H2H. |
| Handedness | Core | `sportProfileFields.ts:35` | ✅ | |

## 5. Out of scope (needs tracking / extra spotters)
- Shuttle speed (smash speed), shot placement / heatmaps, rally length in shots (stroke counting is unreliable for one scorer), player movement / distance.
- A full stroke-type breakdown (clears/drops/drives/lifts) per rally.

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| BD-01 | **Result after the match**: when ended, `summary()` gives games won as the score and the game scores as the detail. Fixes "0–0" in the result alert, ticker and correction screen. | P0 | S | Match | None | No | **GEN-RES** |
| BD-02 | **Rally match-stats panel** from GEN-RS: total points won (%), points won on serve / receive, max consecutive points, biggest lead, game/match points saved, score at the 11-point interval. Per game and overall. | P0 | M | Match | None (derived from the point log; server = last rally winner) | No | **GEN-RS** |
| BD-03 | **BWF group tie-breaks**: add a badminton `standingsPoints` (sum of game points), a new `pointsDiff` tie-breaker, and a default that branches by cluster size: 2 tied → H2H; 3+ tied → games diff → points diff → (2 left) H2H. | P0 | S | Tournament | None | No | **GEN-TB** (points-diff also for squash, pickleball, volleyball) |
| BD-04 | **Badminton career block** (GEN-RC): W-L by singles/doubles, games W-L %, points W-L %, deciding-game W-L, comebacks, best run, titles/finals, history with game scores. | P1 | M | Player | None (match-level keys written at completion) | No | **GEN-RC** |
| BD-05 | **Doubles server & receiver by name** (Law 11): pick the initial server and receiver at each game start. Derive who serves from which court after every rally; show "Ravi serves from the right to Arjun". | P1 | M | Match | Optional `server`/`receiver` player ids on `SET_FIRST_SERVER` plus a per-game `SET_GAME_SERVER`; absent = today's side-only display | No | No |
| BD-06 | **Optional point-outcome tag** (off by default): smash winner, net kill, unforced error, service fault — credited to a player, with coverage via `tracked[]`. | P2 | M | Match, Player | Optional `outcome` payload on POINT; old logs = untagged | No | **GEN-PO** |
| BD-07 | Badminton leaderboards and awards: Wins, Win %, Games won %, Longest run. Replace "Top scorer (points)" (`ratings.ts:89`, `standings.ts:404`). | P1 | S | Tournament | None | No | GEN (racket leaderboards) |
| BD-08 | **Fast doubles scoring**: in doubles, default to two big "Rally won — side" buttons (player credit optional, as a long-press). Crediting a "point" to one doubles player is ambiguous and halves scoring speed. | P1 | S | Match | None (POINT without attribution, as the fallback already does) | No | GEN-UX (tennis/TT/padel doubles) |
| BD-09 | **Team ties as one fixture** (Thomas/Uber/Sudirman, school inter-house): a tie of N rubbers counts once in group standings (ties won, then rubbers, games, points). | P1 | M | Team, Tournament | None (uses the existing `__series*` format keys) | No | **GEN-TIE** |
| BD-10 | Interval cues (11 points, between games, change of ends at 11 in the decider) as timeline markers. | P2 | S | Match | None (derived banners) | No | No |
| BD-11 | Misconduct cards (warning / fault / disqualification); a fault awards a point. | P2 | S | Match | New action `CARD` (old logs never contain it) | No | GEN (TT, squash) |
| BD-12 | Match / game duration from event timestamps | P2 | S | Match, Player | None | No | GEN |
