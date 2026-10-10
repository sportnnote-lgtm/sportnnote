# Sport depth: progress (coding session → founder)

Newest at the top. One entry per item: what was built, files, migration (if any), tests, commit, open questions.

## SD-01 + SD-02: final scores; tennis tiebreaks and Grand Slam deciding set — DONE (326857f, 2026-10-10)
- **Built:** `scoreline.ts`, used on every result surface for 8 set/game sports (volleyball and padel included); tennis tiebreak scores and the `gs5` deciding-set tiebreak at 6-6 (`finalSetTBAt`).
- No migration. Tests: 31 new · 847 total · legacy replay identical · demo 8093.
- Not verified: the full-time alert firing (code path read; in the demo it fires only for followed teams); the Slam deciding set in the UI (unit-tested).
- **Choices:**
  - live detail lines include completed sets ("Games — 1:0 (21-18)");
  - a naturally ended match's manual-end/correction score is now sets won (agrees with `result()`);
  - old `gs5` matches keep the whole-set tiebreak, now shown as [10-8].
- **Guide updated:** live-score-overlay.

## 2026-10-10: plan approved
- The founder approved PLAN.md (102 items, Waves 0–4) and all the recommended defaults for D1–D9.
- Build order: Wave 0 (live correctness bugs) → Wave 1 (foundations) → Waves 2–3 (per-sport depth), with Wave 4 (new sports) able to run alongside them once Wave 1 lands.
- Protocol (same as the parity queue), for each item:
  - mark it IN-PROGRESS, build it and add tests;
  - run `npm run check`;
  - check it in the demo on 8093 (never 8091);
  - update the public guide(s), DEVLOG and this file;
  - make one local commit and mark the item DONE.
- Never push, deploy or run migrations without asking. Migrations are written as files.
