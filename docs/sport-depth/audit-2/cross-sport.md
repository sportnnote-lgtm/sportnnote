# Audit 2: cross-sport platform (all 24 sports)

Read-only audit, 2026-10-11, after the depth programme (SD-01 to SD-119; SD-48 and SD-51 are the latest commit, cdf0168).

Scope: the shared layer every sport sits on:
- tournaments: formats, fixture generation, groups → knockouts, brackets, standings kit, team ties, medal table, contingents;
- the stats engine: schema, statTotals, coverage, careers, leaders, awards, records, team stats, head-to-head;
- the live scoring shell, notifications, sharing, offline, permissions;
- consistency across the 24 sports.

Method:
- I read PLAN, BACKLOG and PROGRESS (their "Check" and "Not done" lists, gathered here and marked **known**), the old `cross-sport.md`, the scorer-ux audits and the top of DEVLOG.
- I then checked the code: `registry.ts`, `types.ts`, every `<sport>/index.tsx` and `stats.ts` (schema counts were dumped with node), `standings.ts`, `standingsColumns.ts`, `groups.ts`, `fixtures.ts`, `bracket.ts`, `medalStandings.ts`, `teamTie.ts`, `matchRecordHooks.ts`, `LiveScoringScreen.tsx`, `ResultsEventScreen.tsx`, `TournamentProfileScreen.tsx`, `TeamProfileScreen.tsx` and `notify-followers`.

The 24 sports:
- **15 match sports:** football, cricket, basketball, volleyball, kabaddi, hockey, handball, tennis, badminton, table tennis, squash, padel, pickleball, chess, carrom.
- **Golf:** a field sport (stroke play) plus match play.
- **8 event sports on the results engine:** athletics, swimming, weightlifting, shooting, archery, rowing, canoe, cycling.

## Strengths

The old cross-sport audit's six root causes are all fixed:
1. **Stat schema:** one schema per sport, all 24 sports (`statSchemas.ts`).
2. **Aggregate engine:** handles max, best figure, rate, per-game and qualifiers.
3. **Result lines:** W/D/L/T/NR.
4. **statTotals:** absolute on every event-scored sport except chess.
5. **Standings:** a rule kit with each body's presets for 14 sports (`standings.ts:342-404`).
6. **Box score and career:** one shared component each, driven by the schema.

Also in place:
- **Team ties:** cover the 8 racket and board sports (`teamTie.ts:132`).
- **Match records:** a hook for 13 match sports.
- **Live shell safety:** ConfirmSheet, named Undo, a 60 s result hold, keep-awake and haptics. These also cover golf and the results-entry screens.
- **Offline outboxes:** for matches, golf cards and event results.
- **Medal table:** takes match sports, golf and all 8 event sports.

## 1. Sport × capability matrix

Legend:
- ✅ at standard
- ⚠️ partial or generic floor
- ❌ missing
- – not applicable

Column meanings:
- **Rec:** the SD-51 match-records hook (event sports: MR/SR records).
- **Tbl:** standings columns plus the body preset.
- **Team fmt:** team ties, relays or crews.
- **Abs:** absolute statTotals sync.
- **✕:** the timeline ✕ confirm.
- **Past:** backfill or insert a missed event.
- **End:** the match-ending confirm or result hold.
- **Undo:** named Undo.
- **Tick:** sport-specific ticker or overlay detail.
- **Team pg:** team page stats.
- **Push:** follower result push.

Leader and award splits exist only for cricket (`cricket/stats.ts:42`), so that column is left out.

| Sport | Guide | Box | Career | Leaders + awards | Rec | Tbl | Team fmt | Abs | ✕ | Past | End | Undo | Voice | Tick | Team pg | H2H | Push |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Football | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ FIFA | – | ✅ | ✅ | ✅ | ⚠️ voice FT skips the sheet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cricket | ✅ | ✅ | ✅ | ✅ (+splits) | ✅ | ✅ ICC/NRR | – | ✅ | ✅ staged | ⚠️ no insert/delete ball | ✅ | ❌ plain "Undo" | ✅ | ✅ | ✅ | ✅ | ✅ |
| Basketball | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ FIBA | – | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ generic | ✅ | ✅ | ✅ |
| Volleyball | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ FIVB | – | ✅ | ✅ | ✅ | ✅ hold | ✅ | ⚠️ no detail mode | ⚠️ | ✅ | ✅ | ✅ |
| Kabaddi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ PKL | – | ✅ | ✅ | ✅ | ✅ | ⚠️ PAUSE/TO plain | ⚠️ no cards | ⚠️ | ✅ | ✅ | ✅ |
| Hockey | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ FIH | – | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Handball | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ IHF | – | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Tennis | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ ATP | ✅ | ✅ | ✅ | ✅ | ✅ hold | ✅ | ✅ | ⚠️ line only | ✅ | ✅ | ✅ |
| Badminton | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ BWF | ✅ | ✅ | ✅ | ✅ | ✅ hold | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Table tennis | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ ITTF | ✅ | ✅ | ✅ | ✅ | ✅ hold | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Squash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ WSF | ✅ | ✅ | ✅ | ✅ | ✅ hold | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Padel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ FIP | ✅ | ✅ | ✅ | ✅ | ✅ hold | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Pickleball | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ pool play (house) | ✅ | ✅ | ✅ | ✅ | ✅ hold | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Chess | ✅ | – (crosstable) | ✅ | ✅ | ✅ | ✅ FIDE | ✅ | ⚠️ no statTotals | – | – | ✅ | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ |
| Carrom | ✅ | ⚠️ compare + sheet | ✅ | ✅ | ❌ | ⚠️ house preset | ✅ | ✅ | ✅ | ✅ | ✅ hold | ✅ | ❌ | ⚠️ | ✅ | ✅ | ✅ |
| Golf | ✅ | ✅ card | ⚠️ custom, no splits | ✅ | ❌ | – / ⚠️ no match-play preset | ⚠️ team stroke only (GF-16) | ✅ own path | ✅ | – | ✅ | – | ❌ | ❌ | ❌ | ⚠️ match play only | ❌ stroke play |
| Athletics | ✅ ×5 | – (sheet) | ✅ PB/SB | ✅ | ✅ MR/SR | – medal | ✅ relays, XC teams | ✅ | – | – | ✅ lock confirm | – | ❌ | ❌ | ❌ | ❌ | ❌ |
| Swimming | ✅ | – | ✅ | ✅ | ✅ | – | ✅ relays | ✅ | – | – | ✅ | – | ❌ | ❌ | ❌ | ❌ | ❌ |
| Weightlifting | ✅ | – | ✅ | ✅ | ✅ | – | ❌ team classification | ✅ | – | – | ✅ | – | ❌ | ❌ | ❌ | ❌ | ❌ |
| Shooting | ✅ | – | ✅ | ✅ | ✅ | – | ❌ team / mixed | ✅ | – | – | ✅ | – | ❌ | ❌ | ❌ | ❌ | ❌ |
| Archery | ✅ | – | ✅ | ✅ | ✅ | – | ❌ team / mixed | ✅ | – | – | ✅ | – | ❌ | ❌ | ❌ | ❌ | ❌ |
| Rowing | ✅ | – | ✅ crew | ✅ | ✅ | – | ✅ crews | ✅ | – | – | ✅ | – | ❌ | ❌ | ❌ | ❌ | ❌ |
| Canoe | ✅ | – | ✅ crew | ✅ | ✅ | – | ✅ crews (verify K4) | ✅ | – | – | ✅ | – | ❌ | ❌ | ❌ | ❌ | ❌ |
| Cycling | ✅ | – | ✅ | ✅ | ✅ | – | ❌ team pursuit / sprint / madison | ✅ | – | – | ✅ | – | ❌ | ❌ | ❌ | ❌ | ❌ |

**Reading the matrix:**
- The 15 match sports are close to uniform. The gaps are hockey (no backfill, no voice), handball and carrom (no voice), carrom and golf (no records hook), cricket (plain Undo), and every sport but cricket (no leader splits).
- The 8 event sports and golf stroke play are deep inside their own screens but missing from the shared platform around them: the team page, follower push, head-to-head, the overlay/ticker, and team events in four sports.

## 2. Gap table

Areas are capabilities. Evidence gives file:line, or "not found".

### Tournaments: formats, fixtures, brackets, medal table

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| **P0** | Medal table | A match sport's medal positions come from one flat league table over **every** completed match of the sport. Groups are merged and knockouts are ignored, so in a groups → knockout sport (or a straight knockout) gold goes to whoever has the most table points, not the final's winner. There is also no joint bronze for semi-final losers and no shared place on a level tie. | `medalStandings.ts:86-99` calls `teamStandings` with no stage filter; `standings.ts:787` takes all completed matches | Placement per sport: final W/L → 3rd-place match (or shared 3rd for the SF losers) → by round reached → group position for group exits; league only when the structure is a league. Shared position points on ties | M | Olympic / multi-sport practice; tournament-vision litmus |
| P1 | Medal table | Ranking is by total position points only. There is no "medals first" order (golds → silvers → bronzes), which Olympic-style and CWG tables use. | `types.ts:732-740` (`TournamentScoring` has no rank mode); `medalStandings.ts:116-118` | `rankBy: 'points' \| 'medals'` on `TournamentScoring`, with a chip on the meet settings | S | IOC medal table convention |
| P1 | Brackets | A clean knockout seeded from groups puts the top 2 seeds in the **same half**. `seedKnockout` emits [1v8, 2v7, 3v6, 4v5] in kickoff order, and `nextRoundPairs` pairs adjacent winners, so 1 and 2 meet in the semi-final. The 32-team litmus test (FIFA WC shape) has the same flaw (1 v 2 possible in the R16). | `groups.ts:145-161`; `bracket.ts:315-327`; `GenerateFixturesScreen.tsx:291-292`; `tests/litmus.test.mts:85-117` checks round counts only | Order round-1 ties by standard bracket positions (`seedOrder`: 1v8, 4v5, 3v6, 2v7). Add a halves test | S | Standard seeded draw (BWF / ITF / FIFA brackets) |
| P1 | Brackets | A straight knockout pairs entrants in **pick order** (1v2, 3v4), so picking in seed order sets the top seeds against each other in round 1. The play-in path does seed, so the two paths behave differently. | `fixtures.ts:70-77`; `GenerateFixturesScreen.tsx:323` | Treat the pick list as seeds and pair by `seedOrder`, plus a "Random draw" shuffle chip | S | Standard seeded draw |
| P1 | Groups → KO | Best-placed qualifiers are compared on raw points, but `drawGroups` makes uneven groups (22/4 → 6,6,5,5), so a 3rd place in a 6-team group carries an extra match. | `groups.ts:37-48` (`seedCmp`); `fixtures.ts:47-53` | When group sizes differ, drop results vs the bottom team(s) of the larger groups (FIFA/UEFA practice), or rank on points per game. Note the method under the table | S | FIFA/UEFA best-3rd rule (verify for the sport) |
| P2 | Groups → KO | Cross-group seeding ignores `rankBy: 'wins'` (FIVB ranks wins before points). | `groups.ts:39` | Compare `rankBy` first | S | FIVB pool ranking (verify) |
| P2 | Formats | No double elimination, consolation / plate, or repechage for match sports. School meets often run a plate for the first-round losers. | `structureConfig.ts:14` (league / knockout / groups / swiss / americano only) | Add a "Plate for round-1 losers" option first (reuses the knockout engine on the losers) | M | organiser practice |
| P2 | Fixtures | The group draw deals teams `i % g`, with no pots or same-school / same-club separation. | `fixtures.ts:47-53` | Optional pots (seed list) and an "avoid same school" pass | S | organiser practice |
| P2 | Standings kit | Rule details still to check against rulebooks: PKL and FIH tie-break order; the FIVB best-of-3 points adaptation; ITTF team ranking clauses; BWF team tie-breaks with dead rubbers; Davis Cup Finals tie-breaks; FIDE team tie-breaks (simplified). The end-match preview shows a flat "+win", and the advanced editor edits only the 3+ chain. | `standings.ts:342-404`; `teamTie.ts:493-520` | Rulebook pass, then fix the preview using the active preset's `pointsFor` | S | known: PROGRESS SD-17, SD-48 (verify) |
| P2 | Standings kit | Pickleball "pool play" and carrom "league" are house presets: there's no body table. Golf match play has no preset at all. | `standings.ts:378-389`; golf missing from `BODY_PRESETS` | Confirm or replace with USA Pickleball / ICF wording. Golf match play gets a 1-½-0 hole-match table | S | verify |

### Team ties (SD-48) and team events

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Team ties: notifications | Live step pending: `notify-followers` hasn't been redeployed, so every rubber still sends "Full time" to followers. | `supabase/functions/notify-followers/index.ts:146-183` | Founder: redeploy the edge function | S | known: PROGRESS SD-48 |
| P1 | Team ties: permissions | `settleTie` called by a non-host scorer may be blocked by RLS (it only settles when the host opens the tie page). Captains can't enter their own lineups. | not found (RLS) | A SECURITY DEFINER `settle_tie(series)` RPC, or settle in the rubber-completion trigger. A captain lineup policy on the series row | M | known: PROGRESS SD-48 |
| P2 | Team ties: surfaces | Team-page averages leave out rubber lines. Team-page records don't read `state.matchRecords`. The home feed lists each rubber. The live completion write of matchRecords isn't watched in the UI. | `teamRecords.ts`, home feed | Collapse rubbers in the feed. Read the stored block on the team page | S | known: PROGRESS SD-48 |
| P1 | Team events (event sports) | No team or mixed-team events in archery and shooting, no team classification in weightlifting, no team pursuit / team sprint / madison in cycling. Inter-school championships score these. | `ArcheryEventSetup`, `ShootingEventSetup`, `WeightliftingEventSetup`, `CyclingEventSetup` have no team mode | Reuse the crew/relay `team_id` entry (migration 0051) and the XC "first N of M" team scorer | L | known: PROGRESS SD-95/96/97/98 |
| P2 | Team events (golf) | Golf team match play (four-ball / foursomes, GF-16) isn't built; team stroke play is. | `teamTie.ts:132` has no golf | GF-16 | M | known: PROGRESS SD-48 |

### Stats engine: leaders, awards, records, team stats, head-to-head

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Team page (event sports, golf stroke) | A house or club page shows "No results yet" for athletics, swimming and the other 6 event sports, and for golf stroke play, because it reads matches only. No medals, points, PBs or entrants. | `TeamProfileScreen.tsx:238`; no `field_entries` read | A "Results" card from `field_entries.team_id` and the athlete's team: medals per sport, points, best marks, latest meet | M | consistency (every sport equal) |
| P1 | Player profile (event sports) | The profile header still shows Apps / W-D-L / Win % for athletes, swimmers and other event-only users. | `SportProfileScreen.tsx` (header) | Use the `careerView === 'measured'` header: events, medals, PBs | S | known: PROGRESS SD-90, SD-101 |
| P2 | Leaders / awards splits | Only cricket has leaderboard and award split chips (format / ball). Profiles have splits in every match sport, but tournament leaders don't. | `cricket/stats.ts:42`; no other `leaderSplits` | Add `leaderSplits` (singles/doubles for racket, age group for event sports, venue/season elsewhere) | S | known: PROGRESS SD-25 |
| P2 | Records hook | Carrom and golf have no `matchRecords` hook: no highest board, white slam, best match-play margin or hole-in-one. | `matchRecordHooks.ts:260-275` | Add carrom (slams, highest game, biggest win) and golf (aces, best round in the event, biggest match-play margin) hooks | S | GEN-21 consistency |
| P2 | Head-to-head (event sports) | There's no athlete-vs-athlete record for the 8 event sports (e.g. times beaten in the same race), and no golf stroke-play head-to-head. | `headToHead.ts` (match based) | "Same race" H2H from shared phases: who finished ahead | M | consistency |
| P2 | Absolute stats | Chess has no `statTotals`, so a corrected result relies on delta arithmetic (the SD-55 atomic RPC was dropped). Mid-match lines in every sport stay increment-based until completion, so live leaderboards can drift with two scorers. | `chess/index.tsx` (no `statTotals`); BACKLOG SD-55 DROPPED | Chess `statTotals` (W/D/L/colour from state). Optionally resync at period ends | S | known: BACKLOG SD-55 |
| P2 | Founder backfills | Live repair tools haven't been run: `resyncSportLines` per sport, `repairOpponents` (SD-119), `backfillMatchRecords` (SD-51), `backfillCricketCaptainKeeper`. Live had 0 stat lines on 2026-10-10, so check the live row counts first. | PROGRESS SD-19 / SD-38 / SD-51 / SD-119 | Dry-run each on live, then run | S | known: PROGRESS |
| P2 | House minimums | The leader minimums (basketball 2 games, volleyball 5 sets, racket 3 matches, football 180 min, handball 20 shots, hockey 10 shots faced…) are house choices, not body rules. | `leaderMinimums.ts` | Founder confirms; FIBA's per-game rule (verify) | S | known: PROGRESS SD-27, SD-101, SD-102 |

### Live scoring shell, voice, undo

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Backfill / insert past event | Hockey can't add a missed goal or card at a past minute. It can only edit or remove an existing row. Football, handball, basketball and kabaddi all have the ⏪ Backfill bar. | `hockey/index.tsx` (no `BackfillBar`); `handball/index.tsx` has one | Reuse handball's backfill (same clock model) | S | consistency; scorer-ux H2 |
| P1 | Match-ending confirm | Voice "full time" ends a football match with no ConfirmSheet (the button path asks). The 60 s result hold limits the damage, but the match is still closed. | `football/index.tsx:553` vs `:1168` | Route voice `fullTime` / `endHalf` through `confirmMatchAction` | S | known: PROGRESS SD-106 |
| P2 | Voice | No voice scoring for hockey, handball, carrom or golf. Kabaddi voice has no cards or technical points. The volleyball detailed mode has no voice. | `voiceParsers.ts` exports none for these; `hockey/index.tsx`, `handball/index.tsx` have no `voice:` | `pointVoice`-style parsers: goal / card / PC for hockey and handball; board winner + coins for carrom; strokes per hole for golf | M | known: PROGRESS SD-101, SD-102, SD-59, SD-81 |
| P2 | Undo label | Cricket's Undo isn't named (every other sport says "Undo: goal by …"). Kabaddi PAUSE / RESUME / TIMEOUT read plain "Undo". | `LiveScoringScreen.tsx:897` (`sport === 'cricket' ? null`); PROGRESS SD-117b | Cricket label from the last ball ("Undo: 4 by Kohli"); add the missing kabaddi kinds to `undoLabel.ts` | S | known: PROGRESS SD-115, SD-117b |
| P2 | Ticker / overlay | `tickerDetail` exists only for cricket, football, hockey and handball. Basketball (quarter, clock, team fouls / bonus), kabaddi (raid, all-out) and volleyball/racket (server, set point) fall back to the generic line. Event sports and golf have no overlay. | `football/index.tsx`, `hockey/index.tsx`, `handball/index.tsx`, `cricket/index.tsx` only | Schema-driven generic detail (GEN-11). An event-sport "latest results" overlay | M | GEN-11 (parked P2) |
| P2 | Native only | Keep-awake, haptics, the in-app QR image share and Android image share need the new APK. iOS stays web. | PROGRESS SD-110, SD-108 | Ship APK 37+, then test on a device | S | known |
| P2 | Accessibility at 375 px | Known truncations: long double-fault rows in the timeline editor, and the Win % tile (reported fixed in SD-24, re-reported in SD-19; verify). | PROGRESS SD-24, SD-19 | Check at 375 px | S | known (verify) |

### Notifications, sharing, permissions, offline

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Notifications | Followers get **no push** for any event-sport result (8 sports) or a golf stroke-play round or final. The only trigger is `match_status_notify` on `matches`. | `20261019122300_follow_prefs.sql:69`; `notify-followers/index.ts:302` (`match_status` only) | A trigger on `field_events.status → completed`. Push "🏃 U14 100 m final: Asha 1st 12.84" to followers of the athletes' teams / houses and of the tournament | M | consistency |
| P2 | Notifications | `notify-upcoming` reminders are match-only, so there's no "your heat starts in 30 min" for event sports or golf tee times. | `supabase/functions/notify-upcoming` (matches) | Include `field_events.starts_at` and tee times | S | consistency |
| P1 | Sharing | One-tap App Links aren't set up (non-redirecting host, assetlinks.json, intentFilters, SHARE_BASE). Invite links open the web join page first. | PROGRESS SD-108 founder steps 1–6 | Founder steps, then a new APK | M | known: PROGRESS SD-108 |
| P1 | Permissions (event sports) | Only organisers, the phase creator, tournament managers or `hostIds` can enter results, and no setup screen sets `hostIds`. A meet can't hand a field judge or timekeeper their own event the way match scorers are assigned. | `ResultsEventScreen.tsx:140-141`; `resultsStore.ts:164` (`hostIds: input.hostIds ?? []`; no UI found) | An "Officials" picker on event setup and the hub (reuse the tournament officials list) | S | verify |
| P2 | Offline | Outboxes exist for matches, golf cards and event results. Not checked: team-tie settlement and lineups offline, and the pending-results flush after a killed app on native. | `matchOutbox.ts`, `golf.ts:172`, `resultsStore.ts`, `pendingResults.ts` | A device test with airplane mode on a tie rubber | S | verify |

### Guides and docs

| P | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Guides | All 24 sports have a guide (athletics has 5). About 12 guides are over the 900-word limit (basketball, volleyball, football, kabaddi, pickleball, end-a-match-early, cricket-rain-and-dls, run-athletics-track-events and three results guides). There's no guide on running a multi-sport medal meet or contingents end to end. | `website/guides/`; PROGRESS SD-23, SD-20, SD-112, SD-93 | Trim pass, plus a new "run-a-multi-sport-meet" guide after the P0 fix | S | known |

## 3. Top 5 to build next (cross-sport)

1. **Medal table placements from the real structure (P0).** Placements should come from the bracket (final, 3rd-place match or shared bronze) and group positions, not the flat league table. Also add a "medals first" ranking option. `medalStandings.ts` plus a placement helper in `bracket.ts`/`groups.ts`. M.
2. **Correct seeded brackets.** Standard `seedOrder` placement for round 1 from groups (1 and 2 in opposite halves). Seed or randomly draw straight knockouts. Fair best-placed comparison across uneven groups. `groups.ts`, `fixtures.ts`, `GenerateFixturesScreen.tsx`. S–M.
3. **Event sports and golf on the shared platform.** Follower push on results, a team/house page results card, the measured profile header, and event officials (`hostIds`) on setup. M.
4. **Close out team ties live.** Redeploy `notify-followers`, a settle-tie RPC or trigger that a scorer can call, and captain-entered lineups. Then team events for archery, shooting, weightlifting and cycling on the relay/crew `team_id`. M–L.
5. **Live-shell consistency sweep.** Hockey backfill, a confirm sheet on voice "full time", named Undo for cricket and kabaddi, records hooks for carrom and golf, and leader splits beyond cricket. S each.

## 4. Counts

- **P0:** 1
- **P1:** 14
- **P2:** 21
