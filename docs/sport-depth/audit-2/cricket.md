# Audit 2: cricket (all formats)

Read-only gap audit, 2026-10-11, after the depth programme (SD-11/12/13, SD-15/16/25/27, SD-38/43/69/79, SD-51, SD-113) and the CricHeroes parity queue (#01–#25, all DONE).

**Standard:** ICC Men's T20I / ODI Playing Conditions, MCC Laws of Cricket (2022 code), ICC event points-table regulations, ESPNcricinfo Statsguru and tournament records pages, and CricHeroes as the consumer-app bar. Clause numbers marked "verify" were quoted from memory.

**Sources read:**
- `docs/sport-depth/{PLAN,BACKLOG,PROGRESS}.md`, `cricket.md` and `scorer-ux-audit-cricket.md`.
- `docs/cricheroes-parity/{BACKLOG,PROGRESS,REVIEW}.md`, and the top of `DEVLOG.md`.
- `src/sports/cricket/*` (engine, rules, dls, scorecard, stats, index).
- `src/sports/matchRecords.ts` and `matchRecordHooks.ts`.
- `src/data/{standings,teamRecords,teamStats,tournamentRecords,bracket,repos}.ts`.
- `website/guides/cricket-*.md` and `score-cricket.md`.

**Strengths:** this is the deepest sport in the app.
- **Scoring:** 25+ action types; every dismissal mode including Mankad, hit twice, obstructing and timed out; Law 18.11 (the new batter faces after a catch); free hit carries over a wide; local rules (wide/no-ball value and legality, byes, "normal last N overs"); penalty runs, including one riding on a delivery; bonus and negative runs; per-bowler quota with consecutive-over checks and mid-over replacement; Impact and concussion subs; repeated Super Overs.
- **Rain and results:** Standard-Edition DLS (v2) with par-based margins; ICC NRR, including DLS crediting, all-out = full quota, and no batter left = all out.
- **Scorecard:** FoW, partnerships, Manhattan/worm, maidens and a ball editor.
- **Career:** a Statsguru-grade career (BF, ducks, 50s/100s, 4w/5w, BBI, Ave/SR/Econ, keeper dismissals, captaincy) split by format, ball, season, tournament and opponent. Qualified records leaders and a tournament Records card (totals, partnerships, best innings and figures, biggest wins).
- **Help:** 9 guides.

The gaps that remain are the **rain endgame**, the **knockout tie** path, the **stat sync after a hand-ended match**, and **CricHeroes-style shot data**.

---

## 1. Scoring & rules

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| **P0** | Rules / result | **A chase ended by rain can't be decided on DLS par.** The guide says to record a no result or abandoned. Under ICC rules, once the chase has faced the minimum overs (T20 5, ODI 20), the result goes to par at the moment play stops. The only workaround is "Awarded" with a typed reason. That gives no "(DLS)" margin, and NRR charges both sides their full overs, which is wrong. | `website/guides/cricket-rain-and-dls.md:75-76`; no par code in `index.tsx` / `engine.ts` (only a final-ball `par` in `outcome`, `engine.ts:1708`); `ResultKind` has no DLS-par kind (`core/types.ts:820`); `manualNrrOvers` charges full quotas (`engine.ts:559`) | A "Rain — no more play" action in innings 2: if the chase faced at least the minimum overs (a format field, defaulted per preset), take par from `resourcePct` at the stopping ball. The result reads "Won by N runs (DLS)" or a tie; otherwise NR. NRR credits team 1 with par off the overs team 2 faced (`standingsScore` / `standingsRate` hooks). Fix the guide | M | ICC T20I/ODI PC cl. 12–13 + NRR appendix (verify clause nos.) |
| **P0** | Rules / dead end | **A tied knockout can be closed as a tie, and the bracket then stalls.** Under the "Tie stands / shared" setting (and the Test preset's default), no Super Over is offered. "Accept the tie & end the match" shows in every case, because the cricket plugin doesn't know the stage. The bracket's advancer ignores `winner === 'draw'`. The generic End-match sheet hides Tie in knockouts, but this cricket button bypasses it | `cricket/index.tsx:85,91`; `data/bracket.ts:285,291`; contrast `LiveScoringScreen.tsx:916-925` | Pass `knockout` to ScoringControls. In a knockout, always offer the Super Over and hide "accept the tie" (or require picking who goes through, as the generic sheet does). Verify there is a post-completion recovery path | S | ICC PC Super Over appendix (ties in knockouts) |
| P1 | Rules / DLS | **Innings 1 can't be ended by rain at the ball play stopped.** RAIN needs `newOvers × bpo > balls bowled`, so the lost part-over is never booked. Pressing End innings with no prior cut sets the target to runs + 1 with no revision | `engine.ts:715` (`rainV2` guard), `engine.ts:694-697` (`chaseStart`) | Let RAIN in innings 1 cut to exactly the balls bowled (fractional overs), book the loss, then close the innings. One "Innings ended by rain" button | S | DLS Standard Edition practice (verify) |
| P1 | Rules / DLS | **No live DLS par score in the chase.** Umpires, captains and spectators need "par now" at every ball once rain threatens | not found (`grep par` in `index.tsx`) | Add a "DLS par: X" chip under the chase equation when `dls` is on in innings 2 (reuse `resourcePct` / `dlsResources`) | S | ICC PC (par score table to umpires) |
| P1 | Rules / DLS | **The full Standard Edition table is still pending (`dlsV = 3`).** The current wicket-row interpolation is not monotonic for 6–9 wickets down (up to 0.26 resource points) | `dls.ts:20-77`; known: cricheroes PROGRESS #18 research request + spec-maths note | Founder sources the 51×10 table; drop it in behind `dlsV = 3` (v2 replays unchanged) | M | known: cricheroes-parity PROGRESS #18 |
| P2 | Rules / DLS | One G50 (245) is used for every format and level. ICC uses a lower G50 below international level / for women (verify). It matters when team 1 is cut (r2 > r1) | `dls.ts:107` | Add a G50 format field with level presets | S | DLS SE (verify) |
| P2 | Rules | The minimum overs that make a match (T20 5, ODI 20) are neither warned nor used | `engine.ts:715-716` accepts any cut ≥ 1 | Add a per-preset min-overs field; warn on RAIN below it; feeds the P0 par rule | S | ICC PC cl. 12.x (verify) |
| P2 | Rules | The powerplay is not pro-rated when overs are cut, and only one band exists (no ODI P2/P3) | `rainV2` leaves `powerplayOvers` alone (`engine.ts:716`); `engine.ts:312` | Use the ICC reduced-powerplay table, plus P1/P2/P3 bands for ODI | S | known: PROGRESS SD-113 (R7) + ICC PC 28.7 (verify) |
| P2 | Rules / format | **The Hundred** is modelled as 10 × 10-ball overs. Real Hundred rules: 5-ball sets (5 or 10 in a row, ends change every 10), a 25-ball powerplay (the preset gives 30), and a Super Five. Here a bowler change after 5 needs a mid-over "replacement" reason, and the Super Over is always 6 balls | `index.tsx:2048`; `engine.ts:1666` (`init({ overs: 1, … })`, bpo 6) | A Hundred mode: 5-ball sets with a free change at 5, a 25-ball powerplay, Super Five | M | ECB Hundred playing conditions (verify) |
| P2 | Rules | Super Over eligibility isn't enforced: a batter dismissed in the previous Super Over can't bat in the next, and the previous Super Over's bowler can't bowl the next | `startSuperOver` builds a fresh `init` (`engine.ts:1659-1672`) | Carry `barredBowlers` and the dismissed batters into round N+1 | S | ICC PC Super Over appendix (verify) |
| P2 | Rules / format | No multi-innings match (2-day school / Test): no declaration, follow-on, innings win, or **Draw** result. Cricket's manual end offers only "Tie" | `engine.ts:69` (`innings: 1 \| 2`); `index.tsx:2009` (`drawLabel: 'Tie'`) | CK-09 (parked, D3). Meanwhile, offer "Draw" for time-limited one-innings games | L | known: PLAN D3 / CK-09 |
| P2 | Rules / local | Missing common school and box rules: **retire at N runs** (very common in Indian school cricket; Hong Kong Sixes 31), **last man stands**. The Sixes preset is 6 overs (HK Sixes is 5; verify) | `rules.ts:13-24` has neither; `index.tsx:2049` | A retire-at-N toggle (auto prompts "retired, not out", who may return); a last-man-stands toggle | M | known: PROGRESS SD-113 (R8); local practice |
| P2 | Rules | Known open items from SD-113: beamer / dangerous-bowling warnings leading to suspension (R3), bouncers per over (R4), free-hit dismissal limits enforced only in the UI so voice and edits bypass them (R6), DRS review counter (R9). Also the ICC stop-clock (2024) and the in-match over-rate fielder penalty | `index.tsx:204` ("UI-only — the engine doesn't police it") | One reducer-gated (`v:2`) rule each, as optional format fields | S each | known: PROGRESS SD-113; ICC PC 41.x (verify) |

## 2. Match stats & box score

The scorecard meets broadcaster standard: batting and bowling cards, extras breakdown, FoW, partnerships, over history, Manhattan/worm, maidens, Wd/Nb per bowler, fielding notes, ticker / OBS overlay.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Box score / parity | **No wagon wheel or shot type.** This is CricHeroes' signature match graphic, and its player insights depend on it. A toggle is reserved but has no UI | `rules.ts:22` ("reserved — no UI yet") | CK-11: an optional zone tap on scoring shots (`zone` payload key) and an optional `shot` key (D1). Show a per-batter wagon wheel on the scorecard | M | known: CK-11 (parked), SD-113 D1; CricHeroes |
| P2 | Box score | Batting position isn't stored per innings, so there are no "runs at No. 3" or batting-order splits | `scorecard.ts:243-247` (no `pos` key) | Emit `batPos` from the BatCard insertion order | S | Statsguru |
| P2 | Box score | Keeper byes conceded (planned in CK-04), minutes batted (D4), and how-out per line (no dismissal-type career breakdown) are missing | `CRICKET_TOTAL_KEYS` `scorecard.ts:190-199` | Add `byesConceded` (keeper), `howOut` code and minutes from event stamps | S | Statsguru / CricHeroes insights |
| P2 | Box score | Detail capture: bowling type (D3), wide / no-ball reason (D2), direct-hit run outs (D5), bouncer flag (D6) | — | Optional chips, as in SD-107 | S–M | known: PROGRESS SD-113 |

## 3. Player career & leaders / awards

Mostly at Statsguru standard: Mat (appearances, SD-11), Inns / NO / Runs / HS / Ave / BF / SR / 50 / 100 / 0 / 4s / 6s, bowling Inns / O / M / R / W / BBI / Ave / Econ / SR / 4w / 5w, Ct / St / RO / keeper dismissals, Captaincy W-L-T. Filters cover format, ball, season, tournament and opponent. Leaders include HS, BBI, and qualified Ave / SR / Econ.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P1 | Career / data | **A match ended by hand gets no absolute stat sync.** This covers an abandoned rain-hit game with play, an awarded game, a conceded game, and any NR after balls. Its lines keep only the live increments (runs, wickets, catches), with no innings / BF / ballsBowled / runsConceded / maidens. Those innings then drop out of Inns, Ave, SR and Econ, although ICC and Statsguru count them | `repos.ts:2577-2614` (`endMatchManually`: flagWinners + appearances only); `useLiveMatch.ts:196` (sync only when `isComplete`) | Run the `matchStatTotals` → `syncMatchStatLines` path from `endMatchManually` whenever the match has events (cricket first, then all `statTotals` sports) | S | known: cricheroes PROGRESS #19 follow-up (3) |
| P2 | Career | Career overs are always shown as 6-ball overs, so Hundred / 10-ball lines read wrong | `statSchema.ts:37,377` | CK-10: show balls for 10-ball formats, or overs per bpo | S | known: CK-10 (parked) |
| P2 | Leaders | No bowling average, bowling strike rate or most run-outs leaders (Cricinfo publishes them) | `cricket/stats.ts` `leaders` list | Add `bowlAvg` / `bowlSr` with a min-wickets qualifier, plus `runouts` | S | Cricinfo records page |
| P2 | Awards | Only Best batter and Best bowler slots exist. There is no best fielder, best keeper or emerging player (custom awards only). The tournament MVP is a flat runs×1 / wkts×18 / ct×8, unlike the richer per-match model | `cricket/stats.ts` `awards`, weights | Add fielder and keeper slots; CK-12 (align the MVP or publish its formula) | S | known: CK-12 (parked) |
| P2 | Career | After a change of gloves, only the final keeper gets the `wk` flag and keeper catches. The captain/keeper backfill hasn't run live, and the Captaincy chips haven't been checked visually | `scorecard.ts` SD-69 block | Track the keeper per ball (`log`) → per-keeper flags; founder runs `backfillCricketCaptainKeeper` | S | known: PROGRESS SD-38/43/69/79 |
| P2 | Career | No batting vs pace / spin split (needs D3 bowling type) | — | After D3 | S | CricHeroes insights |

## 4. Team / tournament

At ICC standard: P / W / L / T / NR / Pts / NRR, with NR points configurable, an ICC preset (wins → NRR → h2h → lots), adjustments, groups / Super Four / double-chance, cross-group seeding by NRR, a Records card, and team pages that show T / NR and season NRR.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | Standings | The legacy read-time default is h2h → NRR → runs for, but the ICC order is wins → NRR → h2h. New tournaments get the ICC preset (D1), so this affects old tables only | `standings.ts:304` vs `:389-391` | Show "Switch to ICC order" on legacy cricket tables | S | ICC event regulations |
| P2 | Team | Team pages don't read `state.matchRecords`. Cricket shows only highest and lowest totals: no biggest win, no top partnership | `teamRecords.ts:227-241` | Read the stored block and add the cricket margin and partnership records | S | known: PROGRESS SD-48 Not done |
| P2 | Team | No batting-first vs chasing record, and no toss win/loss record | `state.toss` `engine.ts:98` is never aggregated | Use the stored toss and innings order → team page splits | S | known: cricket.md §2 (P2) |
| P2 | Records | "Lowest total" includes a first innings cut short by rain or still unfinished. Cricinfo lists completed innings | `matchRecordHooks.ts:67` (`ranItsCourse` = batting first) | Count only all-out or full-quota innings, or tag "(reduced)" | S | Cricinfo records (verify) |
| P2 | Tournament | In knockouts, a washout (no NR available) must be "Awarded" with a typed reason. There's no "higher group finisher goes through" helper | `LiveScoringScreen.tsx:925` | A one-tap "Washout: higher seed advances" in knockouts | S | ICC event regs (semi-final washout) |
| P2 | Standings | No bonus-point systems: run-rate batting bonus (Australian / NZ domestic), first-innings-lead points (Ranji-style, needs multi-innings) | presets `standings.ts:389-391` | A bonus-point rule in the standings kit | M | domestic PCs (verify) |

## 5. Scorer UX & safety

SD-113 closed every P1 from `scorer-ux-audit-cricket.md`: the no-batter-left dead end, subs moved behind a confirm, a fixed free-hit slot, the extras panel, the one-pad block, a shorter run out, a penalty on a ball, and the guide. SD-106 added confirm sheets for End innings / End match / accepting a tie.

| Pri | Area | Gap | Evidence | Fix | Size | Source |
|---|---|---|---|---|---|---|
| P2 | UX | The Undo bar is unnamed for cricket. Every other sport says what it undoes | `DEVLOG.md:218` (`undoLabel.ts`, "except cricket") | "↶ Undo: FOUR — Rohit (4.3)" from the last BallRec | S | known: DEVLOG SD-115 |
| P2 | UX / flow | Scoring is locked until both captains and both keepers are named. That slows box / friendly games | `index.tsx:626` | "Skip — set later" (stumpings then ask for the keeper) | S | CricHeroes flow |
| P2 | UX | SD-113 leftovers: ⇄ Swap gives no toast or timeline entry (A5); the over editor's ↺ target is too small (A7); a past ball can't be turned into a wide / no-ball / wicket (F6, L) | `OverEditor.tsx ~169,319`; `editOvers.ts` | As in the audit | S / S / L | known: PROGRESS SD-113 |
| P2 | Safety | Cricket has no frozen-oracle legacy reducer test, unlike the racket sports. A future rule change could silently re-score stored matches | known: PROGRESS SD-113 | Pin seed / replay fingerprints (as SD-14 did) | S | known: PROGRESS SD-113 |
| P2 | UX | The Hundred: changing bowler after 5 balls asks for a replacement reason (see §1) | `index.tsx` bowler replacement panel | Free change in Hundred mode | S | see §1 |

---

## Top 5 to build next (cricket)

1. **Result on DLS par when rain ends the chase**, with ICC NRR crediting, a min-overs field and a guide fix. P0, M.
2. **Knockout tie guard**: always a Super Over and never "accept the tie" in knockouts, so the bracket can't stall. P0, S.
3. **Stat sync for matches ended by hand**, so abandoned or awarded games count in Inns / Ave / SR / Econ. P1, S.
4. **DLS endgame set**: "Innings ended by rain" in innings 1, a live par chip, and the `dlsV = 3` full table once the founder sources it. P1, S+S+M.
5. **Wagon wheel + shot type** (CK-11 / D1), for CricHeroes parity. P1, M.

**Counts:** P0 2 · P1 5 · P2 27.
