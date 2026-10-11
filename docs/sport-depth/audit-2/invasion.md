# Audit 2 — invasion sports (football / futsal, hockey / Hockey5s, handball, basketball / 3×3)

Read-only gap audit, 2026-10-11, after the sport-depth programme (SD-01 … SD-119). Sources read: `PLAN.md`, `BACKLOG.md`, `PROGRESS.md` (Check / Not-done lists), `football.md`, `basketball.md`, `scorer-ux-audit-sports.md`, top of `DEVLOG.md`, and the code in `src/sports/{football,hockey,handball,basketball}/*`, `src/data/{standings,series,matchFormat,bracket}.ts`, `src/screens/LiveScoringScreen.tsx`, `website/guides/score-*.md`.

Standards: IFAB Laws of the Game 2025/26 and FIFA competition regs; FIFA Futsal Laws; FIH Rules of Hockey, Hockey5s and indoor rules, FIH tournament regs; IHF Rules of the Game and IHF regs; FIBA Official Basketball Rules 2024, FIBA 3×3 rules, FIBA box score. Rule details I couldn't check against a current rulebook are marked **verify**.

Priority: **P0** = wrong result, data loss or dead end · **P1** = a real organiser or scorer will hit it soon · **P2** = depth or polish. Size S/M/L. "known: …" = taken from a PROGRESS Check/Not-done list or an open audit row, not found again here.

---

## Cross-cutting (all four sports)

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| **P0** | Team/tournament | **Two-legged (aggregate) ties pick the wrong winner.** When the aggregate is level and leg 2 was *not* drawn (e.g. 2-1 then 0-1), the leg cannot go to extra time or penalties, because its engine only offers that on a level *match* score. `series.ts` then takes "the 2nd leg's own winner", so the team that won leg 2 goes through. UEFA, EHF and FIBA play extra time / 7 m / OT in that case. | `data/series.ts:218-222`; football `engine.ts:525` (`START_EXTRA_TIME` needs `home === away`); same in hockey/handball `START_SHOOTOUT`, basketball `START_OVERTIME` `engine.ts:363`; no series awareness in any sport `index.tsx` | Pass the leg-1 score to the leg-2 match (`format.__aggPrior`). Make "level" mean the aggregate in each engine's decider check. Fall back to "organiser decides" rather than the leg-2 winner. | M | IFAB/UEFA reg; FIBA 2-game aggregate (verify) |
| P1 | Team/tournament | **Walkover/forfeit scores are 0-0 in the table.** FIFA awards 3-0 and FIBA 20-0. IHF and FIH also award a fixed score (**verify** 10-0 / 5-0). Today goal or points difference ignores forfeits, and that can change who goes through. | `repos.ts:5138-5148` (no score); `standings.ts:729` (points only) | Add a per-sport `forfeitScore` to the body preset and use it in `tableScore` for walkover matches. | S | FIFA reg; FIBA OBR Art. 20-21 |
| P1 | Team/tournament | **Discipline table and suspensions exist for football only.** Hockey red/yellow, a handball disqualification with report, and basketball D / 2U ejections can't be carried into a ban, and squad pickers don't flag them. | `data/useSuspensions.ts:16` (`sport !== 'football'`), `components/DisciplineTable.tsx:9` | Generalise SD-70 via the schema `suspension` flags: rule per sport, plus table and picker flag. | M | FIH/IHF/FIBA disciplinary regs (verify counts) |
| P2 | Team/tournament | No "team of the tournament" / FIBA All-Star Five / IHF All-Star Team, no Best Young Player and no Fair-Play team award. Only Top scorer, Best GK and MVP slots exist. | not found (`grep allStar / young player`) | Award slots with position (all-star) and age (DOB) filters, plus a fair-play team award from `fairPlay`. | M | FIFA/FIBA/IHF/FIH award lists |
| P2 | Team | Team page averages don't include corners or possession, and team records don't read `state.matchRecords`. | — | as listed | S | known: PROGRESS SD-46, SD-48/51 |
| P2 | Scorer UX | The public guides are over the 900-word limit: hockey 929, handball 946, football 946, basketball 924. | `website/guides/score-*.md` | Trim. | S | known: PROGRESS SD-23 (guide limit) |

---

## Football (11-a-side, futsal) — IFAB / FIFA

**Strengths:** this is the deepest non-cricket sport. It has FIFA minute notation, keeper-accurate clean sheets, full `statTotals`, a per-player box score with HT/FT lines, the FIFA/UEFA tie-break chain with fair play, Golden Boot and Golden Glove chains, discipline and suspensions, shoot-out takers with a Law 10 toss, team-official cards, safe timeline edits and game-flow stats.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Scoring & rules | **Futsal is only a 5-a-side running-clock preset.** It has no stopped clock, no 1 time-out per half, no accumulated fouls (6th → 10 m kick), no 2-minute red-card numerical disadvantage (ends early on a goal), and extra time stays 2×15 instead of 2×5. | `football/index.tsx:1473` (preset sets only players/halves/subs); `engine.ts:174` `etMinutes` default 15 | Futsal branch: reuse the hockey/handball stoppable clock, add `TIMEOUT` with per-half limits, accumulated-foul count and banner, a red = 2′ suspension via `onField` with an "ends on goal" rule, and preset `extraTimeMinutes: 5`. | M | Futsal Laws 7, 12, 13; known: F15, FB-19 |
| P1 | Scoring & rules | **The 11-a-side preset defaults to *rolling* substitutions** (unlimited, players return). IFAB competition football is fixed: 5 subs, 3 windows plus half-time, no return, plus permanent concussion subs. A FIFA/AIFF-style event gets wrong sub caps unless the organiser finds Advanced. | `index.tsx:1470` (`subType: 'rolling'`), `:1481` default | Add an "IFAB competition" preset (fixed, 5, windows counted) and make it the 11-a-side default for tournaments. Add a "Concussion sub" toggle that doesn't use a sub. | M | Law 3; known: F14 |
| P1 | Scoring & rules | Once the shoot-out winner is decided, the shoot-out panel disappears (the screen goes to Match complete). The finished card's status says "Home/Away win 4–3 on pens" (side words, not team names). After extra time it shows "Full Time" with no "a.e.t.". | `index.tsx:1441-1446` | Keep the shoot-out list on the Summary, use team names, and add "a.e.t." when `half ≥ 3`. | S | known: PROGRESS SD-56/70/80; FIFA match report |
| P2 | Scoring & rules | Fair play leaves out team officials' cards (the agent's call). Officials are never suspended. Discipline rule names map to ids within a team only. | `engine.ts:603` (`isPlayerCard`) | Confirm against FIFA WC regs Art. on fair play (**verify**). Make it a toggle. | S | known: PROGRESS SD-117a, SD-70 |
| P2 | Scoring & rules | No disallowed-goal / VAR marker. A goal can only be deleted, so it leaves no audit row. | not found | A "Goal disallowed (VAR/offside)" timeline row that reverses the goal. | S | Law 5 / VAR protocol |
| P2 | Match stats | No shot location (inside/outside the box) and no card reason (dissent, DOGSO, SPA). | `index.tsx` shot/card steps | Optional chips. | S | known: F8, F9 |
| P2 | Match stats | Crosses, dribbles and handballs are captured but can't be switched off in live settings. | `engine.ts:134-138` (`TRACKABLE` lacks them) | Add the three toggles. | S | known: FB-17 (parked) |
| P2 | Player career | No POTM count on the career page or the Player of the Tournament candidate list. Penalty conversion % isn't shown (inputs exist). Mixed outfield/keeper minutes in one match are not split. | `football/stats.ts` (no `potm`, no pen %) | Schema rows. | S | known: FB-16; PROGRESS SD-39 |
| P2 | Team/tournament | Fixture team search can pick a different team id, and then the suspension warning goes missing. | — | Search by team id within the tournament. | S | known: PROGRESS SD-56/70/80 |
| P2 | Scorer UX | Voice "full time" / "end half" ends the period with no confirm sheet. The 60 s result hold and Undo soften this. | `index.tsx:552-553` | Route voice ends through `confirmMatchAction`. | S | known: PROGRESS SD-106 |
| P2 | Scorer UX | A shot is 5 taps and offside forces a player pick. "Stoppage / injury" logs a public row in one tap. | `index.tsx` shot / offside / stoppage flows | Per-side Shot buttons, optional offside player, reason or undo toast for stoppages. | S | known: F6, F11 |

---

## Hockey (FIH outdoor, indoor, Hockey5s)

**Strengths:** a stoppable seconds clock, goals by type (FG/PC/PS), PC outcomes linked to the corner, circle entries, green/yellow/red cards with timed suspensions on playing time, a sudden-death shoot-out in reversed order, keeper GA / CS / save %, full `statTotals`, FIH 3-1-0 and the Pro League shoot-out bonus, a box score, career, leaders and a GK award.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| **P0** | Team/tournament | **The decider isn't stage-aware.** `matchFormatFor` strips the decider for league/group matches **only for football**. If a hockey tournament sets "shoot-out if level" so its knockouts are decided, group draws also go to a shoot-out, and the winner then takes a full 3-point win under the plain FIH preset (`matchPoints` gives shoot-out points only when `cfg.shootout` is set). Leave the decider at none, and a level knockout ends as a draw: the in-match flow offers no winner and only the manual "Awarded" path can advance the bracket. | `data/matchFormat.ts:22` (football only); `hockey/engine.ts:131`; `standings.ts:729-731`; `LiveScoringScreen.tsx:916` (knockout rule only on manual end) | Generalise `matchFormatFor`: strip `decider` outside elimination stages for hockey and handball, and force a shoot-out (hockey) or the organiser's ET/7 m chain (handball) inside them. | S | FIH tournament regs |
| P1 | Scoring & rules | Repeat cards don't escalate: there's no prompt that a 2nd green card for the same player means yellow, or a 2nd yellow means a longer suspension or red. Team officials can't be carded at all. | `hockey/index.tsx` card flow (no `official`, 0 grep hits) | Add a warning chip when the player already holds that colour, and a "Team official" target, as in football SD-117. | S | FIH Rules 14 (verify escalation); known: H11 |
| P1 | Scoring & rules | Hockey5s and indoor are presets only. Hockey5s has no circle (goals from anywhere) and its penalty corner is replaced (**verify**: shoot-out or penalty). Indoor has its own sanctions and a team time-out (**verify**). The app keeps outdoor rules and turns PCs off. | `hockey/engine.ts:112-118` | A rules branch per preset: Hockey5s penalty type, no circle-entry row; indoor time-outs. | M | FIH Hockey5s / Indoor rules (verify); known: PROGRESS SD-101 |
| P2 | Scoring & rules | Video referrals aren't tracked (one per team, kept if successful). | not found | "📺 Referral" per side with upheld / lost. | S | FIH tournament regs; known: H12 |
| P2 | Match stats | Shoot-out misses don't credit the keeper. "Off target" and "blocked" are lumped together. Goal → "From PC" isn't linked to the open corner (only the PC panel links it). | `hockey/engine.ts:409-414` (SO kick has no keeper) | Credit `currentKeeper` on a missed shoot-out attempt, split out Blocked, and link `pcRef` from the goal flow. | S | known: H8; PROGRESS SD-117a, SD-101 |
| P2 | Match stats | No possession % or time-in-the-attacking-25. FIH publishes possession. | not found | Reuse football's optional possession toggle. | S | FIH match stats (verify) |
| P2 | Team/tournament | The 2-match per-game minimum, the 10-shots-faced save % minimum and the top-scorer chain (goals → field goals → assists → minutes) are house choices. | `hockey/stats.ts:9-17` | Confirm with the founder. | S | known: PROGRESS SD-101 |
| P2 | Scorer UX | 🚩 PC logs and stops the clock in one tap. Cancel and "Set keeper" are small text links. A goal takes 4 taps with the type step forced. There's no break countdown and no "time up" prompt. No voice scoring. | `hockey/index.tsx:420`, 296, 407 | Undo toast, 44 pt buttons, scorer-first goal panel, break timer, voice later. | S–M | known: H3, H4, H9, H10; PROGRESS SD-101 |

---

## Handball (IHF indoor)

**Strengths:** a count-up seconds clock that stops for time-outs and suspensions; goals and attempts by IHF zone type with 7 m split out; keeper saves and 7 m saves; IHF time-out limits (3 / 2 per half / 1 in the last 5); warning → 2′ → 3rd 2′ = disqualification, red, blue and official sanctions with team-short timers; ET 1–2 rounds then 7 m throws; IHF 2-1-0 with the h2h mini-league; a box score, career, leaders and a GK award.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| **P0** | Team/tournament | **The decider isn't stage-aware** (as for hockey). A tournament-wide `decider` sends group draws into ET/7 m, where the winner takes 2 points instead of 1-1. Leaving it at none lets a knockout end level. | `data/matchFormat.ts:22`; `handball/engine.ts:124-125` | The same fix as hockey (stage-aware `matchFormatFor`). | S | IHF regs |
| P1 | Scoring & rules | **No empty goal / 7th court player.** Taking the keeper off for an extra court player makes the sub-on player the "keeper" (`keeperAt`), so saves and goals conceded go to an outfield player and empty-net goals count against him. | `handball/engine.ts:464-475` | An "Empty goal" toggle per side: no keeper on duty, conceded goals not charged, an `emptyGoalGoals` stat. | S | IHF 4:1, 4:4 (2016); known: PROGRESS SD-102 |
| P1 | Scoring & rules | Not yet checked against IHF: sudden-death 7 m throw order, the youth time-out limits, the clock not stopping for a 7 m, and whether the team-warning limit should be a hint or a block. | `handball/engine.ts:186-200`, `:308-314` | Check the IHF text and adjust the constants. | S | known: PROGRESS SD-102 (verify) |
| P2 | Scoring & rules | A disqualified player can still be credited with goals and saves (no `isOut` guard in the reducer). Passive play isn't recorded. | `handball/engine.ts:333-360` | Guard credits after a red or a 3rd 2′. Optional passive-warning marker. | S | IHF 16:6, 7:11; known: PROGRESS SD-102 |
| P2 | Match stats | Keeper saves aren't split by zone (only 7 m), so there's no IHF "saves / shots by position" keeper line. The 7 m shoot-out has no keeper credit. No shot-zone grid. | `handball/engine.ts:225-226` (save credits only `sevenMSaves`) | Credit `${type}Saves` from the save's `shotType`, plus a keeper box section. | S | IHF statistics sheet; known: PROGRESS SD-102 |
| P2 | Team/tournament | Beach handball (sets, golden goal, 2-point spin shots, shoot-out) isn't built. | not found | Separate preset branch (later). | L | IHF Beach rules; known: PROGRESS SD-102 |
| P2 | Scorer UX | No voice scoring and no demo seed. House minimums (20 shots faced, 20 attempts, 5 throws, 2 matches) need confirming. | — | — | S | known: PROGRESS SD-102 |

---

## Basketball (FIBA 5×5, 3×3)

**Strengths:** the full FIBA box score (MIN, FGM-A, 3PM-A, FTM-A, OREB/DREB, +/-, EFF) with optional missed-shot tracking; FIBA team fouls (technicals count, OT carry-over, bonus from the 5th); FIBA and NBA time-out windows; U/D fouls with auto-disqualification; bonus FTs; And-one +2/+3; player-first actions; assist on the make; per-game leaders with minimums; EFF/G for MVP; game flow; FIBA 2-1 standings with the h2h mini-league.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| **P0** | Scoring & rules | **Foul-out and ejection match by name across both teams.** `foulCount`, `isEjected` and `disqualifyingFoul` filter on `playerName` only, never `side`. If both teams have a "Rahul Sharma" and one fouls out, the other's baskets, rebounds and fouls are **silently refused** by the reducer (`isPlayerOut` guard), so the score is wrong. One player's fouls can also disqualify the other. | `basketball/engine.ts:105-116`, `:217-221`, guards at `:291-334`; UI `index.tsx:419` | Key by `side` + name (and id from `s.ids` where present) in all four helpers. Old logs replay the same unless a collision existed. | S | FIBA Art. 40-41 (code bug) |
| P1 | Scoring & rules | **No game clock — only wall-clock minutes from tip-off.** It can't stop on whistles, so a 10-minute FIBA quarter that takes 20 real minutes stamps everything after wall-minute 10 as "10′". MIN and +/- are approximate. The FIBA "last 2 minutes" time-out cap fires early. There's no countdown display. | `engine.ts:246-251` (`currentMinute` = wall time, capped); `index.tsx:738` | Reuse the hockey/handball `CLOCK` / `SET_CLOCK` stoppable seconds clock (countdown face). Stamp `sec` on events. Old logs keep their minutes. | M | FIBA Art. 49; known: PROGRESS SD-29 ("MIN approximate"), SD-57 ("last 2 minutes approximate") |
| P1 | Scoring & rules | **3×3 is incomplete.** It has no automatic end at 10:00 (the higher score wins), no OT "first to 2 points", no team-foul penalties (7–9 → 2 FTs; 10+ → 2 FTs + possession; FTs worth 1 point, 1 FT for an inside foul), and no 12-second shot clock. | `index.tsx:840` (preset `overtimeMinutes: 0`, `foulsForBonus: 6`) | A 3×3 rules branch: a time limit with the clock above, an OT target of +2, and a foul ladder in `freeThrowsFor`. | M | FIBA 3×3 Rules Art. 6, 11, 15 (verify); known: B15 |
| P1 | Team/tournament | No 3×3 standings preset (win %, h2h, average points scored). A 3×3 event ranks as 5×5 FIBA 2-1. | `standings.ts:349-352` (only `fiba`) | Add a `fiba3x3` body preset. | S | FIBA 3×3 Art. D (verify); known: BK-13 (parked) |
| P2 | Scoring & rules | No coach or bench technicals (C/B), so no coach disqualification on 2C or 3 B/C. No alternating-possession arrow. | `events.ts:20` (no coach fouler) | A "Coach/Bench" fouler option and an arrow toggle on the board. | M | FIBA Art. 36-37, 12; known: B13, B14 |
| P2 | Match stats | A steal doesn't log the opponent's turnover, an offensive foul isn't counted as a turnover, a block isn't linked to a miss, and there's no team rebound. Fouls drawn, points off turnovers and second-chance points are missing. No 2PM-A column (derivable). | `index.tsx` STEAL/FOUL; `stats.ts:108-117` | Paired auto-events, a "Team" rebounder chip, optional fouled player (FD), and a derived 2PM-A. | S–M | FIBA box score; known: B7, BK-12 (parked) |
| P2 | Match stats | "Track missed shots" is off in the FIBA preset, so FG% / 3P% are hidden by default on the international format. | `index.tsx:837` (no `trackMisses`) | Default it on for the FIBA preset in tournaments (D8 keeps old matches as they are). | S | FIBA box score |
| P2 | Scorer UX | Timeout is one tap. A fouled-out player stays in the five with no "Sub required" banner. No "Q time up" nudge. | `index.tsx:507` | Undo toast, a sub banner, a time-up nudge (with the clock above). | S | known: B5, B11 remainder |
| P2 | Scoring & rules | Non-FIBA presets are approximate: NBA's last-2-minutes foul rule, NCAA 1-and-1 / double bonus and NCAA timeout carry-over aren't modelled. | `index.tsx:838-839` | Label them "approximate" or model them later. | M | known: PROGRESS SD-05, SD-57 |

---

## Counts

| Sport | P0 | P1 | P2 |
|---|---|---|---|
| Cross-cutting | 1 | 2 | 3 |
| Football / futsal | 0 | 3 | 8 |
| Hockey | 1 | 2 | 5 |
| Handball | 1 | 2 | 4 |
| Basketball / 3×3 | 1 | 3 | 5 |
| **Total** | **4** | **12** | **25** |

## Top 5 to build next (invasion group)

1. **Stage-aware deciders for hockey and handball.** Generalise `matchFormatFor` so group matches never go to a shoot-out or ET and knockouts always produce a winner (P0, S).
2. **Aggregate two-legged ties.** Leg 2 knows the leg-1 score, so a level aggregate goes to ET/pens (football), 7 m (handball) or OT (basketball) instead of handing the tie to the leg-2 winner (P0, M).
3. **Basketball foul-out by side and id, not name.** Stops cross-team name collisions refusing baskets and wrongly disqualifying players (P0, S).
4. **A stoppable game clock for basketball, futsal and 3×3** (reuse hockey/handball `CLOCK`). It brings accurate MIN, +/-, FIBA late-game time-out caps, futsal time-outs and accumulated fouls, and the 3×3 10-minute limit with first-to-2 OT (P1, M).
5. **Discipline and suspensions plus forfeit scores for every invasion sport.** Generalise SD-70 to hockey, handball and basketball, and add the per-sport walkover score (3-0 / 20-0 / IHF / FIH) to goal difference (P1, M). Also: the IFAB competition preset (fixed 5 subs / 3 windows / concussion subs) and the handball empty-goal toggle as quick follow-ups.

Not verified: no app run (read-only). 375 px layout not checked by hand beyond the open audit rows. Rule numbers marked **verify** are from memory.
