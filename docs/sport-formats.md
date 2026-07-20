# Sportfolio — Sport formats & rules ledger

A living, per-sport record of **which formats and rules the app supports** and, just as
importantly, **which we've deliberately left out (and why)**. Built up sport by sport with the
product owner; each decision is captured so nothing is ambiguous later.

**How to read it**
- **✅ Included** — selectable in the app today (via a sport's *Format* preset or its detailed options).
- **🚫 Not added** — a real variant/rule we considered and chose **not** to build, with the reason.
- **≈ Note** — an approximation or limitation worth knowing.

> The full *official* option set for every sport (presets, scoring, tie-breakers) was built in the
> 2026-07-10 "all sports" pass — see `DEVLOG.md`. This ledger records the **curation decisions**
> (what to include vs. explicitly exclude) made sport by sport after that.

---

## 🏏 Cricket  ·  *curated 2026-07-10*

**Scope decided with owner:** professional cricket + box cricket only. No gully/street rules.

### ✅ Included
| Format / rule | Notes |
|---|---|
| **T20 · ODI · T10** | Standard limited-overs presets (overs, powerplay, 6-ball overs). |
| **Test / timeless** | Effectively unlimited overs (ends on wickets); tie = shared. |
| **The Hundred** | 100 balls as **10-ball overs**. Balls-per-over is now engine-configurable. |
| **The Sixes** (6-a-side · 6 overs) | A short-form preset. |
| **Box cricket** | Preset defaults to tennis ball; **player count is fully selectable** (not fixed at 6). |
| **Ball type** | New choice — **Leather (match ball)** vs **Tennis ball**. Recorded on the match. |
| **Tie-break** | Super Over (built) **or** tie stands / shared. |
| **Powerplay, Impact Player, substitutes** | Existing options retained. |
| **DLS (rain-revised targets)** | Toggle (on for limited-overs presets). A **☔ Rain — reduce overs** control cuts the overs; in the chase the **target auto-revises** by resources lost. |

### 🚫 Not added
| Item | Reason |
|---|---|
| **Pair cricket** (schools) | Out of the "professional + box only" scope agreed for cricket. |
| **Last-man-bats** | Gully rule — owner asked to keep cricket free of gully aspects. |
| **One-hand-one-bounce out / auto-out zones** | Gully rule — excluded. |
| **Bowl-out tie-break** | Gully/alternative tie-break — excluded (Super Over covers it). |

### ≈ Notes / approximations
- **DLS** uses an **approximate** resource model (exponential curve calibrated to the canonical
  0-wicket points: 50 ov = 100 %, 25 ov ≈ 66 %, 10 ov ≈ 32 %), not the exact ICC Standard Edition
  tables. Verified sensible: *team 1 250, chase cut to 25 overs at 0 down → target 165* (official ≈ 166).
  The exact ICC tables can be dropped into `src/sports/cricket/dls.ts` later with no caller changes.
- **The Hundred**: the 5/10-ball **bowler-set** rotation rule isn't enforced (the scorer picks the
  bowler); the ball count and innings length are correct.
- **The Sixes**: the signature **auto-retire-at-31** rule isn't enforced (scored as a 6-over game).

---

## ⚽ Football  ·  *curated 2026-07-10*

**Scope decided with owner:** the existing set is enough — no street/variant additions this round.

### ✅ Included
| Format / rule | Notes |
|---|---|
| **11-a-side · 7s · 5s turf · Futsal** presets | Players, half length and subs per format. |
| **"If level at full time" decider** | Draw stands · Extra time then penalties · Penalties straightaway. |
| **Extra-time half length + ET substitutions** | Used by the extra-time decider. |
| **Rolling / fixed substitutions** | |

### 🚫 Not added
| Item | Reason |
|---|---|
| **First-to-N goals** (street/box ending) | Owner: existing is good enough. |
| **Golden goal in extra time** | Owner: existing is good enough. |
| **Beach soccer** (3×12 periods) | Owner: existing is good enough (also needs a periods rework). |
| **Futsal accumulated-foul penalties** | Owner: existing is good enough. |

---

## 🏀 Basketball  ·  *curated 2026-07-10*

**Scope decided with owner:** existing set is enough; **add pickup player-count options**.

### ✅ Included
| Format / rule | Notes |
|---|---|
| **FIBA · NBA · NCAA (halves) · School** presets | Quarters or halves, period length, fouls, bonus, OT. |
| **3×3 (first to 21)** · **2v2 (first to 15)** · **1v1 (first to 11)** | Single-period, first-to-N pickup games. |
| **First-to-N + win-by** | Any target/margin (street/timed). |
| **Shot clock, foul-out, team-foul bonus, OT length** | |

### 🚫 Not added
| Item | Reason |
|---|---|
| **"21" individual game** | Owner: existing is enough. |
| **Make-it-take-it possession** | Owner: existing is enough (also needs possession tracking). |
| **Technical / flagrant foul type** | Owner: existing is enough. |

---

## 🤼 Kabaddi  ·  *curated + built 2026-07-10*

Owner chose the **guided raid outcome** flow (per raid: raider · defenders touched · bonus? · tackled?).

### ✅ Included
| Format / rule | Notes |
|---|---|
| **Standard/Pro · Circle · School** presets | Players, half length, ET length. |
| **Revival style — Sanjeevani / Amar / Gaminee** | Sanjeevani revives one player per opponent put out + all-out revive; Amar = points only (no one leaves); Gaminee = all-out **ends** the match. |
| **Guided raid engine** (`src/sports/kabaddi/rules.ts`) | Per raid → points, **out-count on the mat**, revival, **super tackle** (+2 when ≤3 defenders), **do-or-die** (3rd empty raid auto-outs), **all-out** (+2). Replay-based, so **undo reverses everything correctly**. |
| **Pro rules toggle** | Turns do-or-die / super tackle / bonus on or off. |
| **Decider** | Draw stands · Extra time then Golden Raid · Golden Raid straightaway. |
| **Live "on mat" indicator + do-or-die warning** | Shown in the scorer. |

### 🚫 Not added
| Item | Reason |
|---|---|
| **Circle / Punjabi kabaddi scoring** | Owner didn't select it this round. |

### ≈ Notes
- **Verified end-to-end** in the demo: RA raids, 3 touched → *3:0, opponent 4/7 on mat*; **undo** → *0:0, 7/7* (out-counts restored). Core engine unit-verified in Node across all-out, super tackle, revival, do-or-die, Gaminee. Backward-compatible (old kabaddi state defaults safely).

### 🚫 Not added
| Item | Reason |
|---|---|
| **Circle / Punjabi kabaddi scoring** | Owner didn't select it this round. |

---

## 🎾 Tennis  ·  *curated 2026-07-10*

**Scope decided with owner:** already complete — no additions this round.

### ✅ Included
Best-of-3 / Best-of-5 · **Grand Slam** (10-pt final-set tiebreak) · **Fast4** · **Pro set** · **Match
tiebreak** presets; plus games-per-set, no-ad deuce, set-tiebreak on/off, tiebreak points, and the
deciding-set (full set vs 10-pt match tiebreak) options.

### 🚫 Not added
| Item | Reason |
|---|---|
| **College dual-match preset** (no-ad + 3rd-set 10-pt TB) | Owner: tennis is complete. |
| **Timed / first-to-N games social** | Owner: tennis is complete. |

---

## 🏸 Badminton  ·  *curated 2026-07-10*

### ✅ Included
BWF 21-rally · 5×11 · 15-point · single-game presets; points-per-game, cap, match length; **NEW — "At the
cap": Golden point (next wins) vs Win by 2 (no golden point).**

### 🚫 Not added
| Item | Reason |
|---|---|
| **Classic side-out service scoring** (pre-2006 15/11 hand-in/hand-out) | A different scoring engine (only the server scores); owner didn't select it. |

---

## 🏐 Volleyball  ·  *curated 2026-07-10*

### ✅ Included
Indoor (25/15) · Beach (21/15) · **NEW 9-a-side (21 · best of 3)** · single-set presets; players, sets,
points-per-set, decider-set points; **NEW "Set ending": Win by 2 (standard) vs First to target (win by 1).**

*(Nothing excluded — both owner requests built.)*

---

## 🥒 Pickleball · 🟡 Padel · ⚫ Squash  ·  *curated 2026-07-10*

Already the most complete; owner added a few named presets.

### ✅ Included
| Sport | Added |
|---|---|
| **🥒 Pickleball** | **NEW "Rec quick (11 · win by 1)"** preset (+ existing Rec / Tournament / Traditional, rally/side-out, points, win-by, best-of). |
| **⚫ Squash** | **NEW "American (PARS 15)"** preset (+ existing PSA 11 / Club English 9 / Short, PAR/English, win-by, best-of). |
| **🟡 Padel** | **"Premier Padel / WPT"** preset label clarified (+ existing Classic / Short, golden point, games/set, deciding-set match tiebreak). |

*(Nothing excluded.)*

---

## ✅ Curation pass complete

All 10 sports curated with the owner (2026-07-10): **Cricket · Football · Basketball · Kabaddi · Tennis ·
Badminton · Volleyball · Pickleball · Padel · Squash**. Each sport's Included / Not-added decisions are
recorded above; deferred items are captured with their reasons so they can be revisited deliberately.

*(Each will get its own ✅ Included / 🚫 Not added section here as we go through it.)*
