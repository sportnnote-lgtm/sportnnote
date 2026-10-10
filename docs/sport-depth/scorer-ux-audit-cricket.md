# Scorer UX audit: cricket

From the SD-109 audit (2026-10-11), read-only. End innings / End match confirms are covered by SD-106.

Tap counts:
- **1 tap:** dot / 1 / 4 / 6.
- **2 taps:** wide / no-ball / bye.
- **3 taps:** bowled.
- **4 taps:** caught.
- **Up to 8 taps:** run out.

| # | Pri | Category | Finding | Where | Fix | Size |
| --- | --- | --- | --- | --- | --- | --- |
| A3 / R1 | P1 | Accident + rule | Dead end: when no batter is left (short squad, subs, retired hurt can't resume) and the wicket isn't the last one by `wicketsLimit`, the wicket can't be confirmed. The innings never closes on "no batter left" | index.tsx ~839–845; engine.ts ~268, ~610–612 (NRR already handles it ~491–497) | "Confirm wicket — innings closed" when no batter is available; a roster-aware no-batter-left check in `inningsComplete` | S |
| A1 | P1 | Accident | Concussion and Impact sub buttons sit in the main scoring column; the last tap commits with no recap and permanently marks the player ⚡ unavailable | index.tsx ~1192–1197, 884, 1184 | Move them to the cricket QuickOptions sheet; add a "X off → Y on. Confirm?" step | S |
| A2 | P1 | Accident | The FREE HIT banner shifts the run pad up and down between taps | index.tsx ~947–951 | Fixed slot, or a tint on the pad | S |
| F1 | P1 | Flow | The Wide / No ball panel opens far above the buttons, so the scorer has to scroll | index.tsx ~1040–1089 vs ~1201 | Render the panel under the button row | S |
| F2 | P1 | Flow | The run pad and Wkt / Wd / Nb are split by up to 11 bowler chips (shown even mid-over) plus Impact / Concussion | index.tsx ~1131–1139, 1199 | Mid-over, collapse to "Bowling: X · change"; one pad block | M |
| F3 | P1 | Flow | A run out takes up to 8 taps; the 2nd fielder and "broken at" steps are mandatory | index.tsx ~700–705, 800–830 | 2nd fielder optional; combine who's out + which end into one choice | M |
| A4 | P2 | Accident | Penalty applies +5 with defaults pre-filled | index.tsx ~387–425 | Require a reason or side before Apply | S |
| A5 | P2 | Accident | ⇄ Swap flips strike silently (no timeline event) | index.tsx ~931; engine ~1358 | Log "Strike changed" / a toast with Undo | S |
| A6 | P2 | Accident | Tapping a "Next batsman" chip commits the wicket immediately | index.tsx ~842 | Select first, then "Confirm wicket" with a recap | S |
| A7 | P2 | Accident | The over editor's ↺ target is tiny | OverEditor.tsx ~169, 319 | A ≥44 px "Remove" button | S |
| F4 | P2 | Flow | No "c & b" shortcut | index.tsx ~793 | A "c & b (bowler)" chip first | S |
| F5 | P2 | Flow | A resuming retired-hurt batter isn't labelled | index.tsx ~841 | "(resumes, 23*)" | S |
| F6 | P2 | Flow | A past ball can't become a wide / no-ball / wicket in the editor | editOvers.ts | Insert an extra and re-flow the over | L |
| F7 | P2 | Flow | No start-to-finish score-cricket guide | website/guides | Write `score-cricket.md` linking the 8 topic guides | S |
| D1 | P2 | Detail | Shot type on runs and dismissals (optional detail mode, like SD-107) | RUNS payload | Optional `shot` key | M |
| D2 | P2 | Detail | No-ball / wide reason (front foot, beamer, leg side…) | index.tsx ~1040–1089 | Optional reason chip | S |
| D3 | P2 | Detail | Bowling type (pace / spin types) per player | sportProfileFields.ts ~23–26 | A profile field + tags on chips | S |
| D4 | P2 | Detail | Minutes batted | — | Derive from event timestamps | S |
| D5 | P2 | Detail | Direct-hit run outs | index.tsx ~800–810 | Optional chip | S |
| D6 | P2 | Detail | Delivery variation (bouncer count practical; the rest needs a spotter) | — | Bouncer flag | M |
| R2 | P1 | Rule | A Law 28 / 41 penalty on a delivery can't be entered as one ball | index.tsx ~450 | A "+5 penalty (reason)" toggle on the pad | M |
| R3 | P2 | Rule | Dangerous / unfair bowling warnings → suspension (Law 41.6–41.8) | index.tsx ~1146–1169 | Beamer reason + warning count | S |
| R4 | P2 | Rule | Bouncers per over (ICC 1 T20I / 2 ODI) | — | Format field + count + prompt | S |
| R5 | P2 | Rule | Timed out hidden during a free hit | index.tsx ~203 | Add it to FREE_HIT_DISMISSALS | S |
| R6 | P2 | Rule | Free-hit dismissal limits are UI-only (voice / edits bypass) | index.tsx ~202 | Reducer check, v-gated | S |
| R7 | P2 | Rule | Only one powerplay band (ODI P2 / P3 missing) | engine.ts ~307; index ~926 | Powerplay phases | S |
| R8 | P2 | Rule | No "last man stands" local rule (common in box cricket) | rules.ts ~147–156 | Local-rule toggle | M |
| R9 | P2 | Rule | DRS reviews per side not tracked | — | Optional review counter | S |

Out of scope (needs a second spotter or tracking): line / length pitch maps, beaten / edged %, speed. Already planned: wagon wheel (CK-11), keeper and captaincy stats (SD-69), multi-innings (CK-09).
