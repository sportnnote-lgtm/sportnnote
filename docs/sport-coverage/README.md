# Sport coverage audit — can we capture a real match, as-is?

A per-sport completeness audit of the scoring engine. The litmus test:

> **A scorer standing at the ground can capture everything that happens in a real
> match without hitting a wall, and an organizer can configure the match the way
> it is actually played.**

## Method (hybrid)

1. **Specialist source-of-truth** — for each sport, the canonical list of settings,
   in-match actions, lifecycle steps, and player stats a real match requires
   (domain knowledge; the `Needs` column below).
2. **App inventory** — what the plugin actually supports today (`App` column).
3. **Diff → gaps** — every ❌ / ⚠️ is a fix, prioritised.
4. **Replay acceptance test** — once gaps are fixed, drive the app through a real
   match's published scorecard / play-by-play; anything that can't be reproduced
   is a new gap. Confirms the matrix didn't miss an interaction.

Status legend: ✅ present & correct · ⚠️ partial / awkward · ❌ missing.

## Order (pilot-priority: Indian school/college meets)

basketball → football → cricket → kabaddi → volleyball → badminton → tennis →
padel → pickleball → squash.

One file per sport in this folder. Each ends with a **Gaps** section (the fix
list) and, after fixes, a **Replay log** section (what the acceptance test found).
