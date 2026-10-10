# Sport depth: progress (coding session → founder)

Newest at the top. One entry per item: what was built, files, migration (if any), tests, commit, open questions.

## SD-05 + SD-06: basketball FIBA rules; pickleball presets and right-court server — DONE (b6f8dfd, 2026-10-10)
- **Basketball:**
  - Built: bonus threshold fix in every preset, FIBA technicals as team fouls, OT foul carry-over, team-foul and BONUS lines, a one-tap "+1 FT", new tournaments at 2-1 (loss 1) plus the "Simple 2-1-0" preset.
  - Not modelled: NBA 3 team fouls in OT, forfeit 0 points.
  - Editing a pre-change match's format mid-game picks up the new defaults (existing app pattern).
  - Bug noticed, not fixed: the play-by-play labels OT events "Q5" (`Timeline.tsx`).
- **Pickleball:**
  - Built: side-out tournament presets (D4), tournament default, start-right pick at 0-0, server derived from court position, correct call and credit, a court shown in rally mode.
  - Not done: who serves first in game 2+ (PB-11), MLP freeze at 20 (PB-09), voice "rally home" credit in side-out mode.
- No migration. Tests: 32 new · 914 total · legacy replays identical · demo 8093.
- **Guides:** `score-basketball`, `score-pickleball`.
- Demo data from these checks was left in the demo store.

## SD-04: volleyball point outcomes — DONE (1ee96f2, 2026-10-10)
- **Built:** the Attack / Block / Ace / Opp. error / Opp. serve error panel, a pure volleyball engine, aces and blocks counting as points, editor point kinds, voice, and an MVP weight rebalance.
- **Guide:** `score-volleyball`.
- No migration. Tests: 17 new · 882 total · legacy replay identical · demo 8093.
- Not verified in the UI: the no-roster layout, undo of an attack, leaders in a real tournament, and voice.
- **Choices:**
  - errors don't name the opponent who erred (keeps it to one tap; `errors` / `serveErrors` are for a later detailed mode);
  - the kill stat key is `attackPoints`;
  - Attack resets after each point;
  - old stat lines without a `tracked` list count as tracked (existing app behaviour).

## Kabaddi feedback from the guide writer (2026-10-10), for KB items later in the queue
These are small kabaddi issues the guide writer found. Each is listed with what it means for us.
- **"Pro rules (do-or-die, super tackle, bonus)" toggle:** the label suggests the bonus depends on Pro rules, but it doesn't (bonus needs 6+ defenders either way). Relabel it.
- **Touches still score when the raider is tackled:** this is open item KB-11 / D6, to align with the AKFI rule. It needs v:2.
- **No toss / first-raid choice:** add one with KB items.
- **Two close "Edit" controls in "Correct the timeline":** the **Edit**/**Done** toggle and each row's **✎ Edit**.
- **Do-or-die warning:** it only shows on new raids, and a void bonus counts as an empty raid toward do-or-die. Make both clear in the UI.

## SD-03: kabaddi raid/tackle attribution — DONE (c4dd6fd, 2026-10-10)
- **Built:** a pure kabaddi engine with correct raider/tackler credit, separate tackle, do-or-die stop and all-out lines, per-half columns that add up, edit-in-place of a raid, whole-raid remove with credit reversal, and the voice super tackle.
- No migration. Tests: 18 new · 865 total · 400×40 randomised legacy replays identical vs the frozen old reducer · demo 8093 m4.
- **Event log:** `RAID_OUTCOME` needs no gate (old team scores were right). The remove-ordinal fix is gated on `REMOVE_EVENT v:2` because old removes could drop a different raid.
- Not verified: real live kabaddi logs, stat-line writes on Supabase, native.
- **Choices:**
  - raid-form score preview;
  - chips wrap at 375 px;
  - an edit may keep a raider who has since been subbed off;
  - touches still count when the raider is caught (that rule is KB-11, which needs v:2).
- **Guide:** no kabaddi scoring guide exists yet; one is being written alongside SD-04.

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
