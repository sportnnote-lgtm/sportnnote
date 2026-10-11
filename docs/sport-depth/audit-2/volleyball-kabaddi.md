# Audit 2: net-court group (volleyball indoor, beach and 9-a-side; kabaddi)

Read-only gap audit, 2026-10-11. This is the state after today's depth programme, measured against FIVB (Official Volleyball Rules 2025–28, Sports Regulations, VIS stats, beach rules) and AKFI/IKF (with the PKL preset, per D6).

Inputs: PLAN.md, BACKLOG.md, PROGRESS.md (Check / Not-done lists), volleyball.md, kabaddi.md, scorer-ux-audit-sports.md, DEVLOG top. Code read: `src/sports/volleyball/*`, `src/sports/kabaddi/*`, `src/sports/voiceParsers.ts`, `src/data/standings.ts`, `src/data/repos.ts` (manual end).

Every first-audit P0 (VB-01..04, KB-01..03) is DONE, and so are the scorer-ux-audit rows for these sports. The gaps left are format edge cases, rule presets, and depth.

Legend:
- **Priority:** P0 = wrong result, data loss or dead end. P1 = an organiser or scorer will hit it soon. P2 = depth or polish.
- **Size:** S / M / L.
- **Source:** "known: …" means the gap came from a PROGRESS Not-done or Check list. "new" means this audit found it.
- **verify** means the rule detail isn't confirmed against a primary rulebook.

---

## Volleyball (indoor, beach, 9-a-side)

**Strengths:**
- Scoring engine: rally scoring 25/21, decider 15, win-by-2, Bo5/Bo3/single set.
- Point outcomes: Attack / Block / Ace / Opp. fault (typed, optional opponent) / Opp. missed serve, with aces and blocks counted as points.
- Serve and rotation: toss, positions I–VI, side-out rotation, server pre-filled for Ace and serve error.
- Substitutions: FIVB 15.6 checks, exceptional subs, and libero replacement with 19.3 cues.
- Cues: beach timeouts, the technical timeout at 21, switch-sides cues, SET POINT / MATCH POINT banner.
- Stats: absolute statTotals (points, attack, blocks, aces, errors, serve errors, sets played, sets W-L), and an optional Detailed mode (attack attempts → efficiency / success %, reception grades).
- Standings and awards: FIVB 3-3-2-1 preset ranked by wins → match points → set ratio → point ratio → h2h, with Sets/SR/PR columns. FIVB per-set awards (Best Scorer / Server / Blocker / Attacker).

### 1. Scoring & rules

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Rules | **9-a-side is only a 6-a-side with 9 names.** The rotation picker is always 6 slots (2 on beach). The mini-court, the front-row set and the libero checks assume positions I–VI. The 9-a-side preset rules themselves (21 points, Bo3, 3 subs, does it rotate?) are unconfirmed. | `volleyball/ServePanel.tsx:96` (`size={s.beach ? 2 : 6}`), `:122`; `rotation.ts:49-51`; preset `index.tsx:350` | Confirm the 9-a-side rules. Then either take the rotation size from `playersPerSide` (with a 9-position court), or hide rotation/libero for 9-a-side and keep serve-by-side only. | M | known: PROGRESS SD-58/71 "9-a-side rotation"; verify |
| P1 | Rules | **The sub limit ignores the format.** The counter and the warning are hard-coded to 6 per set, while the preset's `substitutes` (3 for 9-a-side, 0 for beach) is never read. A beach squad with a registered reserve shows "🔁 Sub" (FIVB beach allows no subs). | `rotation.ts:47` `SUBS_PER_SET = 6`; `ServePanel.tsx:106`, `:203` | Stamp the format's `substitutes` into state and read it in `checkSub` and the label. Hide Sub when the limit is 0. | S | new |
| P2 | Rules | **No sanctions** (FIVB 21: penalty = point + serve to the opponent; expulsion; disqualification; delay warning/penalty). Today a penalty point has to be logged as an "Opp. fault", which shows up as an error. Expulsion/disqualification subs (15.8) aren't modelled. | not found (no CONDUCT in `volleyball/`) | Reuse the SD-53 `conduct.ts` (`CONDUCT` action; a penalty scores for the opponent) with a sanction-ladder hint. | M | known: PROGRESS SD-53 "volleyball conduct"; SD-58 Check (15.8) |
| P2 | Rules | No golden set (CEV two-leg ties). There's no optional indoor technical timeouts at 8/16 (FIVB world-level events). | not found | Add a `goldenSet` format flag (one set to 15 after a tied two-leg aggregate) and an optional TTO cue. | S | new; verify |
| P2 | Rules | The libero isn't forced off in the front row (it's only a cue). Exceptional-sub eligibility (15.7) isn't checked. National "libero may serve" variants aren't modelled. | `rotation.ts:301-315` | Keep the cue. Add a format toggle for "libero may serve". | S | known: PROGRESS SD-58/71 |

### 2. Match stats & box score

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Box | No block assists: a two-man block point credits one blocker (VIS keeps block points per player; NCAA keeps assists). | `engine.ts:184-197` (single attribution) | Add an optional second blocker chip that credits `blockAssists` (½ in totals). | S | known: scorer-ux-audit-sports.md (volleyball P2) |
| P2 | Box | Digs and setter "excellent sets" aren't tracked, so the FIVB Best Setter / Libero / Digger / Receiver awards are custom-only. | not found (`grep digs` empty) | Extend Detailed mode with optional Dig and Set chips (keyed coverage). | M | volleyball.md §5 (out of scope by default) |
| P2 | Box | Subs aren't drawn on the point timeline (they're listed separately). Editing a fault row (✎) drops its type and player. Stats stay consistent through STAT_ADJUST. | `index.tsx:268-273`; PROGRESS | Put a sub marker on the timeline and keep `err` / `attribution2` through the editor. | S | known: PROGRESS SD-58/71, SD-117b caveat |
| P2 | Box | Without a lineup, the whole squad counts as on court for every set. That inflates `setsPlayed` for bench players, which feeds the per-set rates. | `index.tsx:242-247`; `fieldTime.ts` | Stamp only players who were credited or subbed in when there's no lineup, or prompt for the six before the first point. | S | known: PROGRESS SD-29 limits |

Match stats are otherwise at the VIS-lite standard: points by kind, opponent errors, serve errors, per-set toggle, and the serve/side-out panel.

### 3. Player career & leaders/awards

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Awards | No Best Receiver award, although Detailed mode captures reception % (an FIVB award). | `volleyball/stats.ts:98-104` | Add an award slot ranked by `receptionPositivePct`, with a minimum number of receptions. | S | new |
| P2 | Career | Efficiency counts a blocked attack against the attacker. The 10-attempt and 5-set minimums are house choices. | `stats.ts:8-12` | Founder confirms, or uses VIS (blocked listed separately). | S | known: PROGRESS SD-39 Check, SD-24 founder note |

Career is otherwise at standard: points, attack, aces, blocks per set, best match, sets W-L, serve errors and errors keyed.

### 4. Team/tournament

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Standings | **Forfeits and incomplete teams aren't handled the FIVB way.** A match closed by hand ("conceded/awarded") keeps its partial sets and points. With the FIVB set-points table, a 1-0 set score won by the other side finds no key and falls back to 3/0, and the set and point ratios use the partial score. FIVB 6.4 / Sports Regs: the defaulting team loses 0-3 (0-25 per missing set), with the remaining points/sets awarded. A walkover has no units at all (`forfeitLoss` isn't in the FIVB preset). | `data/standings.ts:729-736`, `:337`, `:355`; `data/repos.ts:2577-2619` | For sport `volleyball`, a walkover or awarded result in `matchUnits` adds the missing sets at target-points (and 0-3 / 0-75 for a forfeit). Add `forfeitLossPoints: 0` to the FIVB preset. | S | new; verify (FIVB Sports Regs) |
| P1 | Standings | **No beach preset.** A beach pool gets the indoor 3-3-2-1 table (2-1 → 2/1). FIVB Beach pools use 2 points for a win and 1 for a loss (0 for a forfeit), with h2h and point ratio. The best-of-3 adaptation of 3-3-2-1 is unverified. | `standings.ts:337`, `:353-356` | Add a "FIVB Beach (2-1-0)" preset, the default when the format preset is `beach`. Confirm the indoor best-of-3 mapping. | S | new + known: PROGRESS SD-17 "volleyball best-of-3 points adaptation"; verify |
| P2 | Team | There's no results-by-set-score breakdown (3-0 / 3-1 / 3-2 / 2-3 …), which FIVB tables and team pages show. | not found | Add a derived team row from the stored set lines (`scoreline.ts`). | S | volleyball.md §2 (VB-09 remainder) |
| P2 | Tournament | Beach pool play (pool of 4 with winners/losers matches) and the pool → seeded KO path aren't confirmed as expressible. | not verified | Check the existing double-chance/structure tools against a Beach Pro Tour pool. | S | new; verify |

### 5. Scorer UX & safety

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Voice | Voice has no "opponent error" / "missed serve" phrase. "Point home" logs a legacy `POINT` (unknown outcome, credited as a plain point). Detailed mode has no format-level default. | `voiceParsers.ts:79-88` | Add the phrases `error {side}` and `missed serve {side}`, and a tournament-level "Detailed stats on" default. | S | known: PROGRESS SD-39 Not done |
| P2 | Flow | Each libero swap is a manual Sub → libero entry. Scorers at school pace will skip it, which weakens the libero cues and sets played. | `ServePanel.tsx` SubPicker | Add a one-tap "⇄ Libero" chip per side that swaps with the last replaced player, pre-filled. | S | new |
| P2 | 375 px | The panel stack is tall: Serve panel, two side panels (4 outcome chips plus up to 8 player chips each), detail row, timeouts, editor. The receiving side's panel is still fully expanded. | `index.tsx:176-215` | Collapse the panel of the side that isn't serving to its one-tap chips, behind a "＋ more" toggle. | S | new |

---

## Kabaddi (AKFI/IKF rules, PKL preset)

**Strengths:**
- Replay engine: touches, bonus (6+ defenders), Sanjeevani / Amar / Gaminee, all-out +2, super tackle, do-or-die.
- Rules: caught raider's touches void (v2), touches capped to defenders on the mat, line-outs, technical points, cards (green, yellow 2-min suspension timed on the clock, red), subs with return.
- Clock and controls: clock pause/resume, 2 timeouts per half, expected-raider highlight, extra time, Golden Raid, 5-raid shootout. Correct raider/tackler credit, edit-in-place, confirmed removes.
- Stats: absolute statTotals (raids, successful/empty/out, touch/bonus/tackle points, super raids/tackles, do-or-die). PKL match centre comparison.
- Career, standings, records: career rates (strike %, not-out %), Super 10 / High 5. PKL 5-3-1 with the ≤7 losing bonus and an SD column. Match records.

### 1. Scoring & rules

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Scoring | **A raid can't record more than 5 touches.** The chips are 0–5. With 6–7 defenders on the mat, a 6- or 7-touch raid (PKL has 6-touch / 8-point raids) can't be entered. The workaround (5 touches plus a technical point) leaves the out-count and all-out wrong. | `kabaddi/index.tsx:377` | Build the chips from 0 to `onMat` (up to 7). The engine already caps v2 touches. | S | new |
| P1 | Rules | **The School and Circle presets turn off `proRules`, which also removes super tackles.** The super tackle (≤3 defenders, +1 bonus) is an AKFI/IKF rule, not only PKL; do-or-die is in current AKFI rules too. The toggle is labelled "do-or-die, super tackle, bonus", but the bonus isn't gated by it (the engine always applies bonus eligibility). | `index.tsx:767-768`, `:789`; `rules.ts:289`, `:308`, bonus `:276` | Split the toggle into `superTackle` (default on) and `doOrDie`. Fix the label. Confirm against the AKFI book which rules apply to school/sub-junior play. | S | new; verify (D6 AKFI) |
| P2 | Rules | **The "Circle style" preset is misnamed.** Circle kabaddi is a different game (one-on-one raids, stoppers, other scoring). Here the preset is standard 7-a-side over 2×15. There's no AKFI women/junior (2×15) preset and no beach kabaddi (Asian Beach Games) preset. | `index.tsx:767` | Rename the preset to "Women / Junior (2×15)". Add a beach kabaddi preset once its rules are confirmed. Leave circle kabaddi out (sports policy). | S | new; verify |
| P2 | Rules | Rule checks still open: does the bonus survive a tackle? Is a yellow card a +1 technical point (an option that's off)? An all-out while a player is suspended; a yellow while out starting at revival (approximate); a defender line-out credited as an extra point. The lobby isn't modelled. | `rules.ts:225-262`, `:276-300` | Resolve with the AKFI rulebook (PROGRESS: unreachable, secondary sources only). | S | known: PROGRESS SD-59/72/83 Check |
| P2 | Rules | The reducer doesn't stop a red-carded player from raiding (only the UI does). A raid edit may keep a raider who has since been subbed off. | `engine.ts:615-623` | Reject in the reducer when the raider is sent off (v-gated). Warn on edit. | S | known: PROGRESS SD-59/72 Not done, SD-03 caveat |
| P2 | Rules | No 30-second raid clock or cant cue, no toss / first-raid choice (expected raider is unknown until the first raid), and the Golden Raid doesn't treat the baulk line as the bonus line. | `engine.ts:232-240`; not found | Add a toss step (`SET_FIRST_RAID`), an optional raid timer chip, and a `gr` → bonus always eligible (verify). | M | known: PROGRESS guide-writer feedback (toss); new; verify |

### 2. Match stats & box score

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Box | The per-player box is only RAID / TKL / PTS. The PKL match centre shows raids, successful raids, super raids, tackles and super tackles per player, and cards. | `kabaddi/stats.ts:76` | Add `raids`, `successfulRaids`, `superRaids`, `tackles` and `superTackles` columns (hidden when not present). | S | new (KB-03 player side) |
| P2 | Team | Cards aren't in the team comparison. Card stat lines are written only at completion, not live. | `stats.ts:78-82` | Add `yellowCards` / `redCards` / `techPointsConceded` to `compare`, and write cards live like points. | S | known: PROGRESS SD-59/72 Not done |
| P2 | Box | Tackle strike % per defender and named revival order need the touched defenders named. | `engine.ts:243-249` | KB-10, an optional "who was touched" multi-select. | M | known: BACKLOG PARKED KB-10 |

### 3. Player career & leaders/awards

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Leaders | Leaders lack super raids, super tackles, successful tackles and raid strike rate (with a minimum number of raids), all asked for in KB-08. The keys exist in the schema. | `kabaddi/stats.ts:84` | Add them to `leaders`, with a `raids ≥ N` qualifier on strike rate. | S | kabaddi.md KB-08 remainder |
| P2 | Awards | There's no Young Player or Do-or-die specialist slot. MVP uses generic weights (raid 2, tackle 2, cards negative). | `stats.ts:86-89` | Optionally add PKL-style "Best do-or-die raider" (do-or-die points). Leave MVP as is. | S | new |

Career is otherwise at PKL standard: total/raid/tackle points and per-match figures, strike %, not-out %, Super 10s, High 5s, best match, discipline.

### 4. Team/tournament

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Standings | The PKL tie-break order (SD → wins → h2h) hasn't been checked against the current PKL regulation. There's no AKFI championship preset (the national-level points system is unconfirmed). | `standings.ts:357-360` | Verify. Add an "AKFI" preset if it differs from Simple 2-1-0. | S | known: PROGRESS SD-17 "PKL tie-break order"; verify |
| P2 | Team | Team season averages cover the comparison keys (SD-46), but there's no "all-outs inflicted vs conceded" pair or per-season super-tackle count on the team page. | `teamRecords.ts` (generic) | Add the source-'team' keys to the team averages with an against figure. | S | kabaddi.md KB-09 (PARKED) |

The rest is at standard: the PKL 5-3-1 / ≤7 bonus preset, the SD/PF column, extra time, Golden Raid and shootout for knockouts, ties ("T"), and records (Super 10s / High 5s).

### 5. Scorer UX & safety

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Voice | Voice raids are un-versioned (no `v:2`, so not capped) and always 1 touch. Voice can't log an empty raid, a bonus, 2+ touches, cards or technical points, so a voice-only scorer breaks the do-or-die count. | `voiceParsers.ts:95-113` | Parse "empty raid", "raid 2 bonus", "card yellow {name}" and "technical {side}", and stamp `v:2`. | S | known: PROGRESS SD-59/72 Not done (voice); new |
| P2 | Clarity | The do-or-die warning shows only on new raids, and a void bonus (under 6 defenders) counts as an empty raid toward do-or-die without saying so. The Undo label is plain "Undo" for PAUSE / RESUME / TIMEOUT. | `index.tsx:346-348`, `:437` | Show "bonus void, counts as empty" in the preview, and add undo labels. | S | known: PROGRESS guide feedback, SD-117b caveat |
| P2 | 375 px | The raid panel is tall: raider chips, touches, line-out, three toggles, tackler chips, tackle type, preview, then Record. "✓ Record raid" sits below the fold on a phone when the tackled branch is open. | `index.tsx:340-445` | Pin the preview and the Record button in a sticky footer inside the panel. | S | new |
| P2 | Docs | The kabaddi and volleyball guides are over 900 words. | PROGRESS SD-24 | Trim them in the docs pass. | S | known: PROGRESS |

Not verified on device: real live kabaddi logs, stat-line writes on Supabase, native (known: PROGRESS SD-03).

---

## Top 5 to build next (group)

1. **Volleyball forfeits / incomplete teams in standings** (P1, S): FIVB 0-3 / 0-25 completion in units and ratios, and `forfeitLoss` in the FIVB preset. Today a conceded match ranks on partial sets and points.
2. **Kabaddi touches up to the defenders on the mat** (P1, S): chips from 0 to `onMat` (up to 7), so a 6- or 7-touch raid can be recorded without breaking the out-count.
3. **Kabaddi rule presets** (P1, S): split `proRules` into super tackle (default on, an AKFI rule) and do-or-die, fix the label, rename "Circle style" to Women/Junior, and verify school rules against AKFI.
4. **Volleyball format-driven court size and sub limit** (P1, M): read `playersPerSide` / `substitutes` (9-a-side, beach) in the rotation picker, `checkSub` and the Sub button, after confirming the 9-a-side rules.
5. **FIVB Beach standings preset** (P1, S): 2-1-0 with point ratio, the default for beach formats. Confirm the indoor best-of-3 3-3-2-1 mapping at the same time.

## Counts

| Sport | P0 | P1 | P2 |
|---|---|---|---|
| Volleyball | 0 | 4 | 14 |
| Kabaddi | 0 | 2 | 15 |
| **Group** | **0** | **6** | **29** |
