# Sport depth: progress (coding session → founder)

Newest at the top. One entry per item: what was built, files, migration (if any), tests, commit, open questions.

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
