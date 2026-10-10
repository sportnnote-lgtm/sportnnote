# Sport depth audit: every sport to international standard

**Founder direction (2026-10-10):** every sport carries equal importance. Scoring depth must be similar across sports, and the statistics a user sees must be of international standard at four levels:

1. **Match:** live scoring options, the scorecard / box score, the timeline, the result.
2. **Team:** season record, team stats, head-to-head, form.
3. **Tournament:** standings / tie-breaks per the sport's rules, leaderboards, awards, brackets.
4. **Player (user):** a career profile and per-sport stat lines, averages and rates, bests and records.

Cricket, after the CricHeroes-parity queue (`docs/cricheroes-parity/`), is the depth benchmark.

The earlier audit `docs/sport-coverage/` asked "can a real match be captured as-is?". This audit asks "is it as deep as the official stats of that sport?".

## Method, per sport

1. **Standard.** Write down the canonical stat set from the sport's international body and its top competitions, and say where it comes from. Examples: FIFA/Opta match stats; the FIBA box score; FIVB VIS; Pro Kabaddi; ITF/ATP/WTA; BWF; ITTF; PSA; FIP/Premier Padel; PPA/USA Pickleball; R&A/DP World Tour; FIDE; the ICF carrom laws. Mark each item **Core** (shown in any official box score / profile) or **Advanced** (pro analytics).
2. **App inventory.** Read the plugin code in `src/sports/<sport>/`, plus shared code in `src/sports/` (`rallyEngine.ts`, `rallyCore.tsx`, `serve.ts`, `courts.tsx`, `liveEvents.ts`), `src/data/standings.ts`, `ratings.ts`, `stats.ts`, `groups.ts`, `src/screens/SportProfileScreen.tsx`, `TeamProfileScreen.tsx`, `TournamentProfileScreen.tsx`, `StandingsScreen.tsx`, and `src/data/cricketCareer.ts` (the pattern to copy). Record what is captured, computed and shown at each of the 4 levels.
3. **Diff.** One row per item, with status ✅ / ⚠️ / ❌. **Practicality filter:** a school scorer with one phone must be able to capture it. Stats that need a tracking camera or several spotters are listed but marked **Out of scope** — don't propose them.
4. **Proposed build items.** Group the gaps into buildable items, each with:
   - **Pri:** P0 (credibility; a coach or parent would notice), P1 (expected depth) or P2 (nice).
   - **Size:** S/M/L.
   - **Levels:** which of the 4 levels it touches.
   - **Event-log impact:** new action types or payload keys; must replay old logs identically (see REVIEW Decision 8 in `docs/cricheroes-parity/REVIEW.md`).
   - **Migration:** needed or not.
   - **Generic?** Reusable across sports (e.g. a shared career-stats framework, a shared box-score component, a shared rally-stats engine).

## Output file: `docs/sport-depth/<sport>.md`

```
# <Sport> — depth audit
Standard sources: …
Summary: one paragraph — how deep today vs standard, biggest gaps.

## 1. Match level   (table: Item | Core/Adv | App today | Status | Note)
## 2. Team level
## 3. Tournament level
## 4. Player level
## 5. Out of scope (needs tracking / extra spotters)
## 6. Proposed build items   (table: ID | Item | Pri | Size | Levels | Event-log impact | Migration | Generic?)
```

IDs look like `FB-01` (football), `BK-` (basketball), `VB-` (volleyball), `KB-` (kabaddi), `TN-` (tennis), `BD-` (badminton), `TT-` (table tennis), `SQ-` (squash), `PD-` (padel), `PB-` (pickleball), `GF-` (golf), `CH-` (chess), `CR-` (carrom), `CK-` (cricket), and `GEN-` for cross-sport items.

The synthesis lives in `docs/sport-depth/PLAN.md`: generic items first, then per-sport items in priority order. It feeds a build queue run the same way as the parity queue.
