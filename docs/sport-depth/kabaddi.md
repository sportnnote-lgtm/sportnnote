# Kabaddi — depth audit

Standard sources: Pro Kabaddi League (PKL) match centre and season stats (raid / tackle / all-out / extra points, successful and unsuccessful raids, raid and tackle strike rates, Super Raids, Super Tackles, Super 10, High 5, do-or-die raid points, points table W5 / T3 / L0 with +1 for a loss by 7 points or fewer, score difference). Rules from the Amateur Kabaddi Federation of India (AKFI) and the Asian Games / International Kabaddi Federation (IKF) rulebook: bonus line with 6 or more defenders, all-out +2, super tackle with 3 or fewer defenders, do-or-die third raid, technical points, green / yellow / red cards, revival order. The earlier capture audit is `docs/sport-coverage/kabaddi.md`.

Summary: the scoring engine is good. `src/sports/kabaddi/rules.ts` replays a raid list to get the score, the out-count, Sanjeevani revival, bonus eligibility, super tackles, do-or-die and all-outs, and the PKL tie-breakers (extra time, Golden Raid, 5-raid shootout) are there. **The statistics built on top of it are shallow, and some of them are wrong.**

- **Every guided raid credits the raider +1 raid point.** This happens whatever the raid's outcome: an empty raid, a 3-touch raid, a tackled raider. The tackle point goes into the raider's column in the box score, and is added to the raiding team's per-half total.
- **Only two stats exist:** raid points and tackle points.
- **Missing match stats:** raids attempted, success rates, Super Raids, Super 10s, High 5s, all-out points, extras, cards and technical points.
- **Player profile:** a generic two-number total.
- **Table:** the PKL points system can't be configured (the losing bonus point is missing), and no score-difference column is shown.
- **Appearances:** players who don't score have no stat line, so their appearances are lost.

## 1. Match level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Final score, half-by-half | Core | `KabaddiScoreboard` (`index.tsx:593-611`) shows the total plus a points column per half | ⚠️ | The per-half cells add up `e.points` by the event's `side` (`index.tsx:598-599`). A tackle point from a guided raid is stored on the **raiding** side's event (see next row), so it lands in the wrong team's column. The winner mark `s.home >= s.away ? 'home'` (`:606`) gives a draw to home and ignores a shootout winner. |
| Raid outcome → points (touch, bonus, tackle) | Core | Guided raid, raider → touches 0–5 → bonus → tackled (`index.tsx:400-466`). The engine is right on bonus with 6 or more defenders (`rules.ts:76-78`). | ⚠️ | The event written for a guided raid is wrong (`index.tsx:151`). It always has `kind:'raid'`, `side: raiding side` and `points: (homeΔ) \|\| (awayΔ)`, so an unsuccessful raid's tackle point is logged as a raid point to the raider. Touches combined with "raider tackled" score both sides (`rules.ts:86-101`); under the rules a raider caught before returning loses his touches. This needs a check against the AKFI rules, and probably a UI guard. |
| Raider's raid points (player) | Core | `attribution: {stat:'raidPoints'}` with **no `by`** (`index.tsx:459`), defaulting to `by = 1` (`useLiveMatch.ts:233`) | ❌ | Every raid credits +1, whatever the touches or bonus, and also on empty or failed raids. Career raid points and the POTM rating (`ratings.ts:26`) are wrong. |
| Tackle points (defender) | Core | `attribution2` tackler, 1 or 2 for a super tackle (`index.tsx:460`) | ⚠️ | The stat line is right, but the box score only counts `kind==='tackle'` events (`BoxScore.tsx:26-27`). Guided raids never produce one, so the TCKL column stays 0. Voice "tackle" always credits 1, even on a super tackle (`voiceParsers.ts:76-77`). |
| Touch points vs bonus points split | Core (PKL) | Captured in the payload (`touches`, `bonus`); the engine voids an ineligible bonus | ⚠️ | Not shown anywhere and not on the stat line. |
| Raids attempted / successful / unsuccessful / empty | Core | Derivable from `state.raids` (`rules.ts:21-29`), but `RaidOutcome` has no raider id | ❌ | Not shown. |
| Raid strike rate %, tackle strike rate % | Core | — | ❌ | Raid strike rate = successful raids ÷ raids. Tackle strike rate = successful tackles ÷ tackle attempts (team level is derivable). |
| Super Raid (raid worth 3 or more points) | Core | — | ❌ | Derivable from each raid's points. |
| Super Tackle | Core | Scored in `rules.ts:95-96`; the defender gets +2 | ⚠️ | Not counted as its own stat. |
| All-outs inflicted / conceded, all-out points | Core | Engine applies +2 (`rules.ts:107-116`) | ⚠️ | Not logged as an event (no timeline line), not counted, and missing from the team points breakdown. |
| Points breakdown: raid / tackle / all-out / extras | Core (PKL match centre) | — | ❌ | The standard four-line team comparison. |
| Do-or-die raids and their points | Core (PKL) | Banner and engine (`rules.ts:80-83`, `index.tsx:411-413`) | ⚠️ | Not counted. |
| Super 10 (10+ raid pts) / High 5 (5+ tackle pts) in a match | Core (PKL) | — | ❌ | Needs correct per-player figures first. |
| Players on mat / out-count | Core | `matRow` (`index.tsx:395-398`) | ✅ | Counts only, not names (see §5). |
| Revival order (named) | Adv | — | ❌ | P2. It needs the touched defenders named. |
| Technical points (line-out, raider out of bounds, time-wasting) | Core | No event (deferred in the coverage audit) | ❌ | A defender stepping out is common in school games. Today it is entered as a team "raid" point, which breaks the out-count. |
| Cards: green / yellow (2-min suspension) / red | Core | — | ❌ | A suspension changes the number on the mat. |
| Golden Raid / extra time / 5-raid shootout | Core | `index.tsx:194-218`, `rules.ts:50-59` | ✅ | Shootout raids have no attribution. That is correct, since PKL keeps them out of player stats. They are added to the current half's column (`:598`), so the half cells can add up to more than the total. |
| Substitutions | Core | `SUB` (`index.tsx:154-166`) | ✅ | |
| Timeline | Core | `LiveTimeline` (`index.tsx:584`) | ⚠️ | Readable, but tackled raids read "Raid — raider out" on the raiding side with +1. All-outs, super tackles and super raids aren't marked. |
| Box score per player | Core | `KabaddiBoxScore`: RAID / TCKL / PTS by half (`BoxScore.tsx`) | ⚠️ | Wrong for guided raids (see above). Missing: raids, successful raids, empty raids, super raids, tackles, super tackles, a "Super 10 / High 5" badge. |
| Correction / edit | Core | Remove reverses the raid by replay (`index.tsx:176-184`). Edit = remove, then a legacy `RAID`/`TACKLE` (`:276-280`). | ⚠️ | After an edit, the re-entered point is a legacy `RAID` event that isn't in `raids[]`. The out-count and do-or-die then drift. The "ordinal" match in REMOVE_EVENT (`:177`) also counts legacy and shootout `kind:'raid'` events, so a later remove can drop the wrong raid. |
| Player of the Match | Core | Generic ratings, `raidPoints ×2 + tacklePoints ×2` (`ratings.ts:26`) | ⚠️ | Picks the busiest raider because of the +1-per-raid bug. |

## 2. Team level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Season record W/D/L, form, head-to-head | Core | `computeTeamStats` (`teamStats.ts:37-`) with unit 'points' (`:25`) | ✅ | |
| Points for / against, score difference | Core | Scored/conceded in team stats | ✅ | |
| Team raid pts / tackle pts / all-out pts / extras per season | Core (PKL team stats) | — | ❌ | Derivable once each match stores the breakdown. |
| Team raid strike rate, tackle strike rate, super tackles, all-outs inflicted/conceded | Core (PKL) | — | ❌ | |
| Top raider / top defender of the team | Core | Team leaders from `SPORT_AWARDS.kabaddi` (`ratings.ts:94-97`) | ⚠️ | The ranking is right but the raid figures behind it are wrong. |

## 3. Tournament level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Points table, PKL W5 / T3 / L0 | Core | Default 2-1-0 (`standings.ts:99-101`). An organiser can set win/draw/loss points (`standingsConfigFromFormat`, `:143-153`). | ⚠️ | Can be configured, but there is no preset. |
| +1 for a loss by 7 points or fewer (PKL) | Core (PKL) | — | ❌ | `StandingsConfig` has no margin-based losing bonus. |
| Tie-break: score difference, wins, points for | Core | Default order `h2h, diff, for` (`standings.ts:100`) | ⚠️ | PKL ranks on score difference before head-to-head. Check the current PKL regulation; offer a "PKL" order. |
| Score-difference (SD) column on the table | Core | `StandingsScreen.tsx:272-279` shows P W D L NR NRR Pts only | ❌ | The tie-break that decides a tie isn't visible. Also a GEN- item. |
| Leaderboards: raid pts, tackle pts | Core | `STAT_CATEGORIES.kabaddi` (`standings.ts:414-417`) | ⚠️ | The raid-points board is wrong (the +1 bug). |
| Leaderboards: total pts, Super 10s, High 5s, super raids, super tackles, successful raids, raid strike rate (min. raids) | Core (PKL) | — | ❌ | |
| Awards: best raider / defender / MVP | Core | `TOURNAMENT_AWARD_SLOTS` (`ratings.ts:191-205`) | ⚠️ | The inputs are wrong. |

## 4. Player level

| Item | Core/Adv | App today | Status | Note |
|---|---|---|---|---|
| Matches played | Core | Count of stat lines (`stats.ts:33-58`) | ⚠️ | A player who scored nothing gets no stat line, so the match isn't counted. `won` is only set on existing lines (`repos.ts:2200-2207`). Defenders lose appearances and wins. |
| Total / raid / tackle points | Core | Generic totals grid (`SportProfileScreen.tsx:203-221`) | ⚠️ | Raid points are wrong. There's no total-points tile. |
| Points per match, raid pts/match, tackle pts/match | Core | — | ❌ | |
| Raids, successful raid %, empty raid %, not-out % | Core (PKL) | — | ❌ | |
| Super raids, Super 10s, High 5s, super tackles | Core (PKL) | — | ❌ | |
| Tackles, successful tackle %, do-or-die points | Core (PKL) | — | ❌ | Unsuccessful tackle attempts need the touched defenders named (P2). |
| Best match (most points) | Core | — | ❌ | |
| Role (Raider / Defender / All-rounder) | Core | Free text on the profile (`sportProfileFields.ts:62`), team roles (`teamRoles.ts:15`) | ✅ | |

## 5. Out of scope (needs tracking or extra spotters)

- Raid duration, raid zone heat maps, and the tackle skill used (ankle hold, thigh hold, dash, block, chain tackle) as PKL logs it. These need video or a dedicated spotter. Tackle *type* could be an optional chip later, but not a P-item now.
- Unsuccessful tackle attempts by every defender who tried. One scorer can capture only the touched defenders, not every attempt.
- Live revival order with names on every raid, at PKL pace. Feasible only as an optional "who was touched" tap (P2 below).

## 6. Proposed build items

| ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic? |
|---|---|---|---|---|---|---|---|
| KB-01 | **Fix guided-raid attribution and event.** Credit the raider `by = raid points actually scored` (touches + eligible bonus), and nothing on an empty or failed raid. Emit the tackle half of a raid as its own `kind:'tackle'` line on the defending side (or a `side`-correct split). The box score, half columns and timeline then read right. Fix REMOVE_EVENT's ordinal to count only guided raids, and make Edit re-dispatch a `RAID_OUTCOME` instead of a legacy `RAID`. Fix the scoreboard winner on a draw or shootout (`index.tsx:606`). | P0 | M | Match, Player, Tournament | The reducer derives the event display. Logged actions are unchanged, so old logs replay to the **same score/state**; only the derived LiveEvents change (intended). Past stat lines are wrong in the DB, so KB-02's absolute sync fixes them on re-completion. Add optional `raiderId`/`tacklerId` to the `RAID_OUTCOME` payload. | No | No |
| KB-02 | **Kabaddi `statTotals` (absolute per-match figures)** derived from `raids[]`: raidPoints, touchPoints, bonusPoints, tacklePoints, raids, successfulRaids, emptyRaids, raidsOut, superRaids, superTackles, doOrDieRaids/Points. `syncMatchStatLines` rewrites them at completion, like cricket #19. | P0 | M | Player, Tournament | Needs raider/tackler ids per raid. Use the KB-01 payload keys, with a fallback to `attribution.playerId` stored on the event row. Old logs without ids keep their live-increment lines. | No (stats jsonb) | Uses GEN-02 |
| KB-03 | **Match stats panel (PKL match centre):** for each team, raid / tackle / all-out / extra points; raids, successful, unsuccessful, empty; raid and tackle strike rate; super raids, super tackles; all-outs; do-or-die. Mark all-outs and super tackles/raids on the timeline. | P0 | M | Match | None (derived from `raids[]`). All-out timeline lines are derived on replay. | No | Uses GEN-05 |
| KB-04 | **Kabaddi career** (`kabaddiCareer.ts`, the pattern of `cricketCareer.ts`): matches, total pts, pts/match, raid/tackle split, raid strike %, not-out %, tackle %, super raids, Super 10s, High 5s, super tackles, best match. Shown on SportProfile. | P1 | M | Player | None | No | GEN-02 |
| KB-05 | **Technical points and line-outs:** "Defender out of bounds" (+1 to the raiding team, defender out); "Raider out of bounds" (+1 to the defence, raider out); "Technical point" (+1, reason). These feed `replayRaids` so the out-count stays right. | P1 | S | Match | New action `TECH_POINT {side, reason, outSide?}` folded into the raid replay as a non-raid entry. Optional, so old logs are unaffected. | No | No |
| KB-06 | **Cards:** green (warning), yellow (2-min suspension: the on-mat count drops, the player returns after the time), red (off for the match). Card counts on the player line. | P1 | M | Match, Player | New action `CARD {side, colour, playerId}`. The suspension is replayed in `replayRaids` from the match minute. | No | Card model possibly shared with football (check the football audit) |
| KB-07 | **PKL points preset and losing bonus:** a "PKL (5-3-0, +1 for a loss by ≤7)" preset in the points editor. A new `StandingsConfig.lossBonus {margin, points}`. A "PKL" tie-break order (SD first). | P1 | S | Tournament | None | No (formats jsonb) | GEN-04 |
| KB-08 | **Standings SD column, extended leaderboards:** total pts, Super 10s, High 5s, super raids, super tackles, raid strike rate (with a minimum number of raids). | P1 | S | Tournament | None | No | GEN-03 |
| KB-09 | **Team kabaddi season stats** (team totals from the per-match breakdown): raid/tackle/all-out pts, strike rates, all-outs inflicted/conceded. | P2 | S | Team | None | No | — |
| KB-10 | **Optional "who was touched" tap** in the guided raid, which names the defenders who go out. This allows named revival order, defenders' "times out", and unsuccessful-tackle counts. | P2 | M | Match, Player | Optional `touchedIds[]` on `RAID_OUTCOME`. | No | No |
| KB-11 | **Rule check: touches + raider tackled.** Confirm against AKFI/IKF that a caught raider's touches don't score. If so, the engine ignores touches when `raiderOut` and not "returned in struggle", and the UI disables the combination. | P1 | S | Match | **Changes replay semantics**, so gate it with `payload.v === 2`. | No | No |

**GEN- candidates from kabaddi:**
- GEN-01: an appearance line for every matchday-squad player at completion. Players who don't score get Matches and wins.
- GEN-02: a shared career framework that generalises `cricketCareer`: totals, rates with denominators, bests, milestone counts, plus `statTotals` absolute sync.
- GEN-03: standings tie-break columns: SD/GD/PD, SB, Buchholz.
- GEN-04: a margin-based losing bonus in `StandingsConfig`.
- GEN-05: a shared home-vs-away "team stats comparison" panel.
