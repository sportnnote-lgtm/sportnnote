# Audit 2: measured sports (results engine)

**Date:** 2026-10-11. Read-only. Nothing was run against live, and the app was not opened, so 375 px layout claims come from code only.

**Scope:** athletics (track, field, road / XC / race walks, combined events), swimming, weightlifting, shooting, archery, rowing, canoe sprint and cycling (road and track). They share one engine: `src/data/results/*`, `src/data/resultsStore.ts`, `src/screens/ResultsEventScreen.tsx`, `src/components/athletics/AthleticsHub.tsx` (the hub for every event sport), and the `*EventSetup` screens.

**Inputs:** PLAN §3.3 / Wave 4, BACKLOG (SD-28, SD-90…SD-100, SD-112), PROGRESS "Check" / "Not done" lists (SD-28, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 112), scorer-ux-audit-events.md, DEVLOG, code.

**Columns:** **P0** = wrong result, data loss or a dead end. **P1** = a real organiser will hit it soon. **P2** = depth or polish. Size is S, M or L. "known: SD-xx" means the gap is already on that item's PROGRESS Not-done / Check list. "verify" means I couldn't confirm the rule detail from the rulebook.

---

## 0. Engine-wide: meet management (applies to every sport below)

What already works: phases on `field_events` with the offline outbox; Q/q progression; serpentine seeding; WA / SW lane orders; PB / SB / MR / SR; reopen with record rollback (SD-112); the house / medal table; the public `/r/` link; text share of start lists and results; keep-awake and haptics.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Team/tourn. | **No late entry, no scratch and no delete-event once a start list exists.** Every school meet has call-room scratches and late adds. Today the only workaround is DNS, and a wrong event can't be removed. | `resultsStore.ts` exports no add / remove entrant or delete-event (only the private `deletePhase` :525, used by reopen); `ResultsEventScreen.tsx` has no add control | "＋ Add athlete" and "Scratch" while the phase is `scheduled` or the round is unlocked, which re-seeds lanes if asked. "Delete event" goes behind a ConfirmSheet. | M | known: scorer-ux-audit-events P2 (raised: a dead end at real meets) |
| P1 | Team/tourn. | **No meet-level entries.** Entries are picked event by event from team rosters, with no "athlete × events" matrix. There's no per-athlete event limit (school boards usually cap 2–3 individual events plus relays), and doubling-up clashes aren't checked. | `AthleticsEventSetupScreen.tsx:130-160` (sources = team rosters / houses, per event) | An entries screen per meet: tick events per athlete, an event cap from meet settings, a clash warning from the timetable. Event setup then pre-fills from entries. | L | engine gap |
| P1 | Team/tourn. | **No bulk entry and no quick-add of unregistered athletes.** Entrants must already be players on a team roster, so you can't paste a school's Excel list. | `AthleticsEventSetupScreen.tsx:130-147`; no paste/CSV path in setup screens | Paste "name, DOB, gender, house" rows, which creates guest players (the team-entry overhaul pattern). Add CSV upload later. | M | engine gap |
| P1 | Team/tourn. | **No timetable and no multi-day meet.** Every phase gets `startsAt = now` when it's created, there's no session / day / call time, and the hub lists events by category, not by time. A record's date is the creation date, not the date of the race. | `AthleticsEventSetupScreen.tsx:238`, `CrewEventSetup.tsx:184`, `CyclingEventSetup.tsx:152`, `ShootingEventSetup.tsx:117`; `AthleticsHub.tsx:66-80` | Day, session and time per phase. Add a "Timetable" view in the hub (day tabs, now / next), a record date taken from the phase time, and a clash check that uses meet entries. | M | engine gap |
| P1 | Team/tourn. | **No printable start lists, heat sheets or result sheets.** Sharing is WhatsApp text only. Call rooms, lane judges and notice boards run on paper. | `ResultsEventScreen.tsx:528-540` (shareMessage text); no expo-print or `window.print` in src or package.json | A print / PDF view per phase (heat, lane, bib, name, house, seed mark, blank time column) and a results sheet with records. On web use `window.print` with a print stylesheet; on phone use expo-print (new APK). | M | engine gap |
| P1 | Team/tourn. | **No historic record book.** Meet and school records come only from finals run in the app, so a school's existing record board (often decades old) can't be entered, and every first final "sets a meet record". | `AthleticsHub.tsx:200-201` ("Set by the first final of each event"); `resultsStore.ts:409-419` | Organiser "＋ Add record" (event, category, mark, name, year, venue) into the meet and org books, plus state / national reference marks shown as "NR" targets. | M | known: SD-90 / SD-91 / SD-92 "historic school records" |
| P1 | Team/tourn. | **Champion tables per category are missing.** There's one house table for the whole meet. Indian school meets award an overall champion per age group and gender (boys' and girls' championship) and an **individual champion** (best athlete by points per category). | `AthleticsHub.tsx:137-139`, `:50` (`topAthletes` top 5 meet-wide only) | Split the house table by category (chips), plus an "Individual champion" table per category from the same position points, with a configurable tie-break. | S | engine gap |
| P1 | Safety | **Losing the race on the record book.** Records are a JSON string in `tournaments.formats[sport]`, written with read-modify-write. Two officials locking finals at the same moment (track plus a field pit, the normal case) can overwrite each other's new records. | `resultsStore.ts:416-419`; `repos.ts:4013-4016` | Move records to rows (`field_records`) or an RPC that merges inside one transaction. At minimum, re-read and merge just before the write and retry on conflict. | M | engine gap |
| P1 | Safety | **Stat lines can fail with no message.** If the stat-line delete or insert fails at lock time (offline, RLS), the error is swallowed. The final still locks, but careers, PBs and leaders are missing for that event, with nothing queued to retry. | `resultsStore.ts:583-590` (`catch {}`) | Queue lines in the outbox (golf pattern) or flag the phase "lines pending" with a retry. Show a toast. | S | engine gap |
| P1 | Team/tourn. | **No per-event official delegation.** `hostIds` exists, but no setup screen sets it, so only tournament managers can enter results. You can't hand the long-jump pit to a PE teacher. And if a host who isn't a manager locks a final that sets a record, the call throws when it writes the record (`patchTournamentFormat` → "You can't change this tournament"), *after* the stat lines are written. The final stays unlocked. | `ResultsEventScreen.tsx:140`; no `hostIds` in `*EventSetup*.tsx`; `resultsStore.ts:473-475`; `repos.ts:4018` | "Officials" picker per event (sets `host_ids`, as in golf). Records written by an RPC the event host is allowed to call. | M | engine gap (the throw is latent until hosts exist) |
| P1 | UX | **No follower alerts for event results.** A parent following an athlete gets nothing when a final is locked or a record is set (match sports push "Full time"). | no notify in `resultsStore.ts` / `ResultsEventScreen.tsx` | When `completeFinal` runs, notify followers of the medallists and anyone with a PB or record ("🥇 Asha won the U14 100 m, 12.84 MR"). | S | engine gap |
| P1 | UX | **The finish-order entry mode only exists for road, XC and cycling.** Track and swim officials at school meets place runners first and time only some of them. | `RoadPanel.tsx` / `CyclingPanel.tsx` have it; track uses the lane keypad (`ResultsEventScreen.tsx` ~376-428) | Reuse the `RoadFinishCard` tap-order mode for lane races, with times optional and places from the order. | M | known: SD-112 Remaining |
| P1 | Career | **Wrong profile headline for athletes.** The main profile header shows Apps / W-D-L / Win % for athletes, swimmers and lifters. | `ProfileView.tsx:254-256` | For an event-sport-only player, show "Events · Medals · PBs" (the sport page is already right: `SportProfileScreen.tsx:241-245`). | S | known: SD-90 / SD-94 "shared limit" |
| P1 | Rules | **Wrong age basis.** Category eligibility uses the athlete's age *today*. WA U18 / U20 and World Aquatics use age on 31 Dec of the competition year, and SGFI / CBSE use a board cut-off date. Near a birthday, athletes are wrongly hidden or allowed. | `athletics.ts:75-83` (`eligibleFor`, "years at the meet"); `core/age.ts:4-13` (age at `new Date()`) | Meet setting "age on: 31 Dec (WA) / meet date / custom cut-off", computed from DOB. | S | WA CR / SGFI rules (verify board cut-offs) |
| P2 | Team/tourn. | Leaders and awards for event sports sit only in the sport hub. There are no cross-meet season lists (an "AFI-style top list" per event, age and gender). | `TournamentProfileScreen.tsx:1041,1053` (leaders skip event sports); `AthleticsHub.tsx:50` | A season top list per discipline from stat lines (best legal mark per athlete), filterable by org. | M | engine gap |
| P2 | Safety | Two officials editing the same entry: the whole result JSON is written, so the last write wins (wind from one phone, time from another). | `golf.ts:226-231` (`saveFieldResult` whole card) | Merge per field on flush, or send a per-entry version and warn on conflict. | M | engine gap |
| P2 | Rules | Timing integration is "typed in" by design. There's no import of FinishLynx `.lif` / Meet Manager / Lenex files, and no export to federation formats. | PLAN §6 (parked); nothing in src | Results import for `.lif` / CSV per heat (lane, time), and a Lenex export for swimming. | M | PLAN parked |
| P2 | UX | Guides are over the 900-word limit (athletics track, swim and others). | known | Trim. | S | known: SD-92 / SD-112 |

---

## 1. Athletics: track (SD-90)

**Strengths:** WA TR 20 lane tables (9–64), Q/q with ties, drawn or seeded lanes, the 800 m lane groups, wind and hand-time rules, reaction time, FS / DQ with a TR ref, relays, timed finals, range checks plus reopen (SD-112), and the photo-finish thousandths chip.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Scoring | **Programme gaps:** no 5000 m or 10 000 m on the track, no steeplechase (2000 / 3000 m SC), no 4 × 200 m, no mixed 4 × 400 m, and no medley relay. 3000 m is the longest track race. | `model.ts:484-509` | Add the defs (steeple with water-jump hurdle heights per age; mixed relay with a 2 + 2 check like `swimming.ts:266`). | S | WA TR (programme); known: SD-91 "steeplechase" |
| P1 | Team/tourn. | Same-team athletes aren't spread across first-round heats, so a house can fill a heat. | `progression.ts:143-161` (serpentine only) | Swap within ranking bands to separate same-team entrants (WA practice: TR 20.3.3 "as far as possible"). | S | known: SD-90 |
| P2 | Rules | When ties at the Q/q line exceed the lanes there's no warning or "draw lots". The next round gets a 9th lane on an 8-lane track: `laneOrder(max(lanes, n))`. | `progression.ts:21-25, 152`; the only swim / crew / archery UI is `ResultsEventScreen.tsx:255-274, 745` | Warn when qualifiers exceed lanes; offer "Draw lots" (TR 21.3) or "Re-run". | S | known: scorer-ux-audit-events P2 |
| P2 | Rules | The default first-round lanes are "seeded", but TR 20.4.3 draws them. | `resultsStore.ts:73-75` (`lanes` default `'seeded'`) | Make WA "draw" the default for championship meets and keep "seeded" as the school preset (state it in setup). | S | WA TR 20.4.3 (verify) |
| P2 | Rules | No hurdle heights or spacings for U14 / U16 (80 mH, 100 mH, 300 mH). | `athletics.ts:136-146` | Show the AFI / SGFI table as "check yours". | S | verify AFI |
| P2 | Stats | No relay split or leg times, and no reaction-time hint for 800 m and above (shown for all). | known | Optional leg splits; hide reaction above 400 m. | S | known: scorer-ux-audit-events |
| P2 | UX | No confirm when clearing a time box. A heat wind of "12" is accepted (no "did you mean 1.2?" above 9.9). | known | As listed. | S | known: SD-112 Remaining |

Match stats / box score: at standard for a results sheet (place, lane, time, wind, reaction, Q/q, PB / SB / MR flags). Career: PB / SB per event, medals and finals are at standard.

## 2. Athletics: field (SD-91)

**Strengths:** 3 + 3 for the top 8 with ties, reverse order after rounds 3 and 5, countback, HJ / PV O / X / – with the TR 26.4 raise check, jump-off, TJ boards, implements by age, trial clock, a range check, and a 5 s undo.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Rules | U12–U16 implement weights are unverified ("check yours"). A wrong shot weight makes every mark and record wrong for that age. | `field.ts:61-70`; PROGRESS SD-91 | Verify against AFI / SGFI and lock the presets, with an organiser override. | S | known: SD-91 |
| P2 | Scoring | Qualification rounds don't stop vertical jumpers at the standard. | known | Stop at the standard: Q with no more trials. | S | known: SD-91 |
| P2 | Scoring | One TJ board per event, not per athlete (school meets use 7 / 9 / 11 m). | known | Board per entrant. | S | known: SD-91 |
| P2 | UX | Foul reason isn't recorded. There's no hint when wind is blank. One-tap "Reset the jump-off" and "They share 1st". | known | Long-press X for the reason; ConfirmSheet. | S | known: scorer-ux-audit-events P2 |
| P2 | Rules | TR 25.5 / 25.17 / 25.22 / 26.8-9 were implemented from memory. | PROGRESS SD-91 | Check against the current WA C&T Rules PDF. | S | known: SD-91 (verify) |

Stats, career and team: at standard (attempt card, best and series, PB per implement).

## 3. Athletics: road, race walks, cross-country (SD-92)

**Strengths:** bib or tap finish order, gun or chip time rounded up (TR 19.24), team scoring by first N of M with three counting modes, red-card DQ for walks, and records only on a certified course.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Scoring | Only one time per runner (gun *or* chip), not both. Road results publish both, with official = gun. | known | Store gun and chip; rank by gun and show chip. | S | known: SD-92 |
| P2 | Team/tourn. | No road relays or ekiden. No heats or waves for huge fields. "＋ All house" isn't capped at the team size. | known | As listed. | M | known: SD-92 |
| P2 | Rules | XC team tie-break uses the last scorer only. NFHS uses the 6th runner, which isn't offered. The default "displace" rule follows NFHS, while World XC uses overall places. | `road.ts:14`, `roadDefs.ts:33,119`; PROGRESS | Add the tie-break option; verify TR 56 / World XC. | S | known: SD-92 (verify) |
| P2 | Rules | No walk "Penalty Zone" times, and no check that the red cards came from different judges (TR 54.7). | known | Add the PZ timer and judge IDs on cards. | S | known: SD-92 (verify) |

Stats / career: at standard for school level (place, time PB per distance, best XC place, team medals).

## 4. Athletics: combined events (SD-93)

**Strengths:** official WA scoring-table coefficients (matches the world-record totals), hand-time conversion, uniform HJ / PV raises (TR 39.8), 3 trials, running totals and places, next event seeded by total, DNS = out (TR 39.10), and records on the total.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Team/tourn. | Organisers can't set heats or groups per event (field events in two pits, 100 m heats by the organiser). | known | Group editor per combined phase. | S | known: SD-93 |
| P2 | Scoring | No separate "Withdraw" button (only DNS). The combined-events false-start rule needs checking against the current TR 39.8.3. | known | Add a Withdraw (WD) action; verify the FS rule. | S | known: SD-93 (verify) |
| P2 | Scoring | No women's 60 m (no coefficients) for the indoor pentathlon. | known | Add if WA publishes it. | S | known: SD-93 |

## 5. Swimming (SD-94)

**Strengths:** SW 3.1 / 3.2 seeding (circle-seeded heats, centre lanes), timed finals, swim-offs, LCM / SCM records apart, DQ codes by stroke, three-watch manual timing, medley order, mixed-relay 2 + 2 check, and range checks.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Scoring | No relay exchange times, so there's no takeover-DQ check (SW 10.10: < –0.03 s). The relay lead-off time doesn't count as an individual PB. | known | Per-leg exchange times with the DQ prompt; lead-off line becomes the 100 m PB. | M | known: SD-94 |
| P1 | Team/tourn. | Entry times aren't converted between courses (a 25 m time seeds a 50 m meet as-is). No "NT" or bonus-time handling. | `AthleticsEventSetupScreen.tsx:367` (entry times typed raw) | Tag each seed time with its course; convert with a standard factor (house) or seed course-matched times first. | S | SW 3.1 practice (verify) |
| P2 | Scoring | No per-leg stroke DQ check for medley relays. No lane 0 / 9 tie rule for 800 m and 1500 m. | known | As listed. | S | known: SD-94 |
| P2 | Stats | No 25 m splits in SCM. One bad split blocks saving the rest. | known | Allow 25 m splits; keep the valid prefix. | S | known: scorer-ux-audit-events |
| P2 | Scoring | No para classes (S / SB / SM 1–14). No 25 m events for under-8s (school galas). | `model.ts:500-509` | Classes as categories; 25 m distances as a house preset. | M | WPS (verify) |
| P2 | UX | DQ can be saved without a reason; no hint on a negative reaction time. | known | Require a code or flag "DQ – no reason". | S | known: scorer-ux-audit-events |

Career / stats: at standard (PB / SB per course, splits, medals).

## 6. Weightlifting (SD-97)

**Strengths:** the 2025 IWF categories, a weigh-in check, declaration rules (+1 kg, never lighter), referee lights, calling order, bomb-out, ties to whoever lifted first, optional snatch / C&J medals, Sinclair, and records per lift with rollback.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | UX | **No competition clock** (1 min, or 2 min for consecutive attempts) and no "time's up" signal. The secretary needs it for every attempt. | known; nothing in `LiftingPanel.tsx` | A clock card linked to "Next: …", with 2 min when the same lifter follows himself, and a 30 s warning. | S | IWF TCRR (verify 6.6) |
| P1 | Team/tourn. | No A / B groups for big categories. A lifter can't be moved between categories (a weigh-in mismatch means re-creating the event). | known | Group field per entry; "Move to category" at weigh-in. | M | known: SD-97 |
| P2 | Rules | Declaration changes aren't limited (IWF allows 2 changes per attempt). There's no 20 kg rule check on the entry total. | `weightlifting.ts:156` | Count changes per attempt and warn on a third. | S | IWF TCRR (verify) |
| P2 | Team/tourn. | No team classification (IWF 28-25-23 points exist only as a house-table scheme, not a per-team result). | `weightlifting.ts:314-318` | Team ranking per gender from the best N lifters. | S | known: SD-97 |
| P2 | Stats | Sinclair uses the 2021–24 coefficients. There's no bar-loading chart. | known | Update the coefficients for 2025–28; loading helper. | S | known: SD-97 (verify) |

## 7. Shooting (SD-96)

**Strengths:** decimal and integer scoring, series or shot-by-shot entry, ISSF qualification countback, the 10 m elimination final with automatic shoot-offs, 3P 40 → 45, shotgun rounds, mixed-team qualification, records on qualification scores, and inner-ten rate.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Scoring | **The programme misses events Indian school and national meets run:** 50 m Rifle Prone, 25 m Standard Pistol, 25 m Center-Fire Pistol and 50 m Pistol (ISSF championship events), plus the national 10 m Peep Sight / Open Sight school classes. | `shootingDefs.ts:69-77` (9 events) | Add the ISSF defs; add peep / open sight as house categories. | S | ISSF GTR (programme); NRAI (verify) |
| P1 | Team/tourn. | **No team events.** A 3-member team total from the qualification scores, with team medals, is standard at every national and school championship. | known; no team ranking in `shootingRank.ts` | Teams by `team_id`: sum of the best 3, ties by inner 10s and then the last series. | S | ISSF GTR (team) |
| P1 | Scoring | No finals for 25 m pistol / rapid fire (hit-or-miss series) or for Trap / Skeet. Mixed-team medal matches aren't built either (first to 16). | known | Add these finals by type. | M | known: SD-96 |
| P2 | Rules | Decimal countback, the 3P tie order and smaller-final scaling are from memory. | known | Check against the GTR PDF. | S | known: SD-96 (verify) |
| P2 | Stats | No decimal per-shot inner-ten count; no series clocks. | known | As listed. | S | known: SD-96 |

## 8. Archery (SD-95)

**Strengths:** WA outdoor and indoor rounds plus school presets, X / 10 / M keypad with end auto-save and undo, ties 10s → X, a seeded 4–64 bracket, set system and cumulative scoring, shoot-off by distance to centre, bronze before gold, and protection against bracket-changing corrections.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Team/tourn. | **No team or mixed-team events.** That means no ranking by the sum of 3 and no team match play (4 sets of 6 arrows, 2 per archer; mixed 4 × 4). These are Olympic events and the norm at school meets. | known | Team ranking from the ranking round, plus a team bracket using the set system with team end sizes. | M | known: SD-95; WA Book 3 (verify) |
| P2 | Scoring | Only ends of arrows can be entered; there's no end-total-only mode for big school fields. Brackets larger than 64 are untested, and there are no shoot-off distances. | known | End-total mode with an optional 10 / X count. | S | known: SD-95 |
| P2 | Scoring | The compound 80 cm 6-ring face can't score 1–4, but the keypad allows them. | `archeryDefs.ts:76` (face) vs the 10…1 keypad | Limit the keypad to 5–10 / X / M for 6-ring faces. | S | WA Book 3 (verify) |
| P2 | Scoring | No Indian Round (bamboo bow): AAI / SGFI school events. | `archeryDefs.ts:68-81` | A house preset (national, not WA, so it's optional under the sports policy). | S | AAI (verify) |
| P2 | Team/tourn. | Points below a small bracket cut aren't awarded. | known | Award by ranking-round place. | S | known: SD-95 |

## 9. Rowing (SD-99)

**Strengths:** 1x–8+ with seats and cox, lightweight / para as categories, configurable heats → repechage → semis → Finals A / B / C, centre-out lanes, thousandths deciding the order, dead heats, splits, and records per boat.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Team/tourn. | No quarter-finals. The progression tables are unverified for 13–18 crews and absent above 18 (single-sculls fields at nationals). | known; `crews.ts:79-110` | Add the quarter-final shape and verify against the World Rowing progression tables. | M | known: SD-99 (verify) |
| P2 | Rules | No lightweight weigh-in (crew average and individual max). | known | Weigh-in card like weightlifting's. | S | known: SD-99 |
| P2 | Career | "Best rowers (points)" counts single boats only. | known | Credit crew points per seat. | S | known: SD-99 |
| P2 | Scoring | Coastal and indoor (ergometer) rowing aren't modelled. | not found | Ergo as a time event (school demand). | S | World Rowing (verify) |

## 10. Canoe sprint (SD-100)

**Strengths:** K1 / K2 / K4 and C1 / C2 / C4 over 200 / 500 / 1000 m, heats → semis → Finals A / B, photo thousandths, and crews by seat.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Rules | The ICF 9-lane order may be mirrored, and the 10–18-boat table is from memory. Official times are to 1/1000; the app shows 1/100. | known | Verify against the ICF CSR; show thousandths when photo timing is on. | S | known: SD-100 (verify) |
| P2 | Scoring | No 5000 m mass start, para canoe (VL / KL), slalom or marathon. | known | 5000 m via the road finish-order mode. | M | known: SD-100 |

## 11. Cycling: road and track (SD-98)

**Strengths:** ITT with start offsets, mass-start finish order with same-time groups, stage race GC with bonuses and points / KOM, track pursuit, kilo / 500 m TT, the sprint bracket, keirin, scratch, the points race (5-3-2-1, ±20 per lap) and elimination.

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Scoring | No team pursuit, team sprint, madison or omnium. These are Olympic track events and part of every national track championship. | known | Team events through `team_id` (TP / TS reuse the pursuit and TT engines; omnium = points across 4 races). | L | known: SD-98 |
| P1 | Scoring | No sprint or keirin repechages. No pursuit last-lap tie rule, no 3 km rule, no clock-time TT entry, no custom TT distances. | known | As listed (clock-time entry first: that's how a road ITT is timed). | M | known: SD-98 |
| P2 | Team/tourn. | Stage races have no team classification (sum of the best 3 per stage) and no youth classification. | `cyclingRank.ts:250-259` (pts / KOM only) | Add both classifications. | S | UCI 2.6 (verify) |
| P2 | Scoring | No criterium, TTT, MTB XCO or BMX racing (Olympic UCI disciplines). | `cyclingDefs.ts:53-61` | Criterium via the points-race engine; MTB / BMX later. | M | UCI Parts 4 / 6 (verify) |
| P2 | Rules | The 1 s group gap, GC ties and junior distances are from memory. | known | Verify against UCI 2.3.039 / 2.6.015. | S | known: SD-98 (verify) |

---

## Summary

**Ratings by area, for the group:**
- **Scoring and rules:** at federation standard for the individual events in each sport's core programme. The gaps are team events (archery, shooting, cycling, weightlifting team classification) and programme breadth.
- **Box score:** at standard.
- **Career:** at standard on the sport page; the main profile header is wrong.
- **Team / tournament:** the weakest area, because of meet management.
- **Scorer safety:** good after SD-112, apart from the concurrency problems in §0.

**Top 5 to build next:**
1. **Meet management core:** late add, scratch and delete-event; entries matrix with per-athlete event caps; bulk paste of guest athletes (§0, P1 × 3).
2. **Timetable and printable sheets:** day, session and time per phase, a hub "Timetable" view, and print / PDF start lists, heat sheets and results (§0).
3. **Record-book integrity and history:** server-side merge of records with no lost writes, a stat-line retry instead of the silent `catch {}`, and organiser-entered historic and state / national records (§0).
4. **Team events in the target / track sports:** archery team and mixed team, shooting 3-member teams plus the missing ISSF events, cycling team pursuit / team sprint / madison / omnium (§7, §8, §11).
5. **School-meet championship outputs:** category champion tables and an individual champion, the age-on-31-Dec eligibility basis, per-event officials (`host_ids`), and follower alerts on finals and records (§0).

**Counts:** P0 = 0 · P1 = 31 · P2 = 38.
