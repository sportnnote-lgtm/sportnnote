/**
 * SD-114 — live-scoring correction bugs from scorer-ux-audit-sports.md.
 *  - Football F1/F2: a goal is recorded exactly once, on the scorer tap; the
 *    assist attaches afterwards (Close keeps the goal).
 *  - Football F4: removing a yellow also removes the second-yellow red it made.
 *  - Edit holds its removal until the re-entry commits (usePendingEdit): the
 *    committed log is what the old remove-then-re-enter flow logged.
 *  - Kabaddi: v2 raids cap touches at the defenders on the mat; un-versioned
 *    raids replay their raw touches exactly as before (Decision 8).
 *  - The ✕ confirm copy and the shared ≥44pt row actions / backfill bar.
 * The React screens import React Native, so their wiring is checked as text.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fb from '../src/sports/football/engine.ts';
import * as kb from '../src/sports/kabaddi/engine.ts';
import { replayRaids } from '../src/sports/kabaddi/rules.ts';
import { confirmCopy } from '../src/core/matchSafety.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
type Side = 'home' | 'away';

describe('football — goal recorded once (F1) and kept on Close (F2)', () => {
  const fbSrc = src('sports/football/index.tsx');
  test('every path into the assist step has already logged the goal', () => {
    // the body step (Shot → On target → Goal → type → body) and the scorer tap
    assert.ok(!/logged: false/.test(fbSrc), 'no path opens the assist step with an unlogged goal');
    const body = fbSrc.slice(fbSrc.indexOf("flow.step === 'body'"), fbSrc.lastIndexOf('Consolidated fast panel'));
    assert.equal((body.match(/recordGoal\(/g) ?? []).length, 1);
    assert.match(body, /logged: true/);
    const scorer = fbSrc.slice(fbSrc.lastIndexOf("flow.step === 'scorer'"), fbSrc.lastIndexOf("flow.step === 'og'"));
    assert.match(scorer, /recordGoal\(flow\.side, p, 'open'\); setFlow\(\{[^}]*logged: true/);
  });
  test('a goal then its assist: score +1, the assist on that goal', () => {
    let s = fb.reducer(fb.init(), { type: 'KICKOFF', payload: { at: 1 } });
    s = fb.reducer(s, { type: 'GOAL', side: 'home', payload: { minute: 10, goalType: 'open', pid: 'p9' }, attribution: { playerId: 'p9', stat: 'goals', playerName: 'Nine' } });
    s = fb.reducer(s, { type: 'ASSIST', side: 'home', payload: { minute: 10, pid: 'p10' }, attribution: { playerId: 'p10', stat: 'assists', playerName: 'Ten' } });
    assert.equal(s.home, 1);
    assert.equal(s.events.filter((e) => e.type === 'goal').length, 1);
    assert.equal(s.events.find((e) => e.type === 'goal')!.secondName, 'Ten');
  });
});

describe('football — second-yellow red goes with its yellow (F4)', () => {
  const card = (type: 'YELLOW' | 'RED', side: Side, pid: string, minute: number, secondYellow = false): ScoreAction =>
    ({ type, side, payload: { minute, pid, ...(secondYellow ? { secondYellow: true } : {}) }, attribution: { playerId: pid, stat: type === 'RED' ? 'redCards' : 'yellowCards', playerName: pid } });
  const booked = () => [
    card('YELLOW', 'away', 'x', 20), card('YELLOW', 'home', 'y', 30),
    card('YELLOW', 'away', 'x', 60), card('RED', 'away', 'x', 60, true),
  ].reduce(fb.reducer, fb.reducer(fb.init(), { type: 'KICKOFF', payload: { at: 1 } }));
  test('either of the two yellows pairs with the red; others do not', () => {
    const s = booked();
    const [y1, yOther, y2, red] = s.events;
    assert.equal(fb.pairedSecondYellowRed(s.events, y1)?.id, red.id);
    assert.equal(fb.pairedSecondYellowRed(s.events, y2)?.id, red.id);
    assert.equal(fb.pairedSecondYellowRed(s.events, yOther), undefined);
    assert.equal(fb.pairedSecondYellowRed(s.events, red), undefined);
  });
  test('removing the yellow and its paired red leaves one yellow and no red', () => {
    let s = booked();
    const y2 = s.events[2];
    const red = fb.pairedSecondYellowRed(s.events, y2)!;
    for (const id of [y2.id, red.id]) s = fb.reducer(s, { type: 'REMOVE_EVENT', payload: { id, target: 'event' } });
    assert.deepEqual(s.events.filter((e) => e.side === 'away').map((e) => e.type), ['yellow']);
  });
  test('the timeline wires it: a removal takes the paired red', () => {
    const fbSrc = src('sports/football/index.tsx');
    assert.match(fbSrc, /const red = withPair \? pairedRed\(ev\) : undefined;\s*if \(red\) out\.push\(\.\.\.removalActions\(red, false\)\);/);
  });
});

describe('Edit holds its removal until the re-entry commits', () => {
  test('the held view equals the old remove-first state; Cancel sends nothing', () => {
    // the view the controls render from = removal applied by the pure reducer
    let s = fb.reducer(fb.init(), { type: 'KICKOFF', payload: { at: 1 } });
    s = fb.reducer(s, { type: 'GOAL', side: 'home', payload: { minute: 12, goalType: 'open' }, attribution: { playerId: 'a', stat: 'goals', playerName: 'A' } });
    const held: ScoreAction[] = [{ type: 'REMOVE_EVENT', payload: { id: s.events[0].id, target: 'event' } }];
    const view = held.reduce(fb.reducer, s);
    assert.equal(view.home, 0);
    assert.equal(s.home, 1, 'the live state is untouched until commit');
    // commit = held removal, then the re-entry — exactly the old log
    const reentry: ScoreAction = { type: 'GOAL', side: 'home', payload: { minute: 12, goalType: 'open' }, attribution: { playerId: 'b', stat: 'goals', playerName: 'B' } };
    const committed = [...held, reentry].reduce(fb.reducer, s);
    assert.equal(committed.home, 1);
    assert.equal(committed.events[0].playerName, 'B');
  });
  test('football, hockey and basketball edit through usePendingEdit; Cancel drops it', () => {
    for (const f of ['football', 'hockey', 'basketball']) {
      const t = src(`sports/${f}/index.tsx`);
      assert.match(t, /usePendingEdit\(liveState, rawDispatch, reducer\)/, f);
      assert.match(t, /holdRemoval\(/, f);
      assert.match(t, /dropHeldRemoval\(\)/, f);
    }
  });
});

describe('kabaddi — touches capped at the defenders on the mat (v2)', () => {
  const cfg = { teamSize: 7, style: 'sanjeevani' as const, proRules: true };
  // away down to 2 on the mat, then a "5 touches" raid
  const raids = (v?: 2) => [
    { side: 'home' as const, touches: 5, bonus: false, raiderOut: false },
    { side: 'home' as const, touches: 5, bonus: false, raiderOut: false, ...(v ? { v } : {}) },
  ];
  test('an un-versioned raid replays its raw touches exactly as before', () => {
    const r = replayRaids(raids(), cfg);
    assert.equal(r.perRaid[1].touchPts, 5);
    assert.equal(r.home, 5 + 5 + 2);
  });
  test('a v2 raid counts only the defenders on the mat', () => {
    const r = replayRaids(raids(2), cfg);
    assert.equal(r.perRaid[1].touchPts, 2);
    assert.equal(r.perRaid[1].raidPts, 2);
    assert.deepEqual(r.perRaid[1].allOuts, ['home']);
    assert.equal(r.home, 5 + 2 + 2);
  });
  test('the form sends v: 2, the reducer keeps it, and defendersOnMat feeds the chips', () => {
    let s = kb.reducer(kb.init({ playersPerSide: 7 }), { type: 'KICKOFF', payload: { at: 1 } });
    for (const a of kb.raidActions(s, { side: 'home', touches: 5, bonus: false, tackled: false })) s = kb.reducer(s, a);
    assert.equal(s.raids[0].v, 2);
    assert.equal(kb.defendersOnMat(s, 'home'), 2);
    assert.equal(kb.defendersOnMat(s, 'home', s.raids[0].eid), 7, 'editing the raid: the mat as it was before it');
    for (const a of kb.raidActions(s, { side: 'home', touches: 5, bonus: false, tackled: false })) s = kb.reducer(s, a);
    assert.equal(s.home, 5 + 2 + 2);
    // a legacy RAID_OUTCOME (no v) still scores its raw touches
    let old = kb.reducer(kb.init({ playersPerSide: 7 }), { type: 'KICKOFF', payload: { at: 1 } });
    for (let i = 0; i < 2; i++) old = kb.reducer(old, { type: 'RAID_OUTCOME', side: 'home', payload: { touches: 5, bonus: false, raiderOut: false } });
    assert.equal(old.home, 5 + 5 + 2);
    assert.equal(old.raids[0].v, undefined);
  });
  test('the raid form disables chips above the mat count', () => {
    assert.match(src('sports/kabaddi/index.tsx'), /disabled=\{n > onMat\}/);
  });
});

describe('timeline ✕ asks first; ≥44pt targets; sticky backfill bar', () => {
  test('removeEvent copy', () => {
    const c = confirmCopy('removeEvent', { what: 'Raid +3 (12\')', detail: 'Removes all of it: Raid +3, Tackle +1, All out +2.' });
    assert.equal(c.title, 'Remove Raid +3 (12\')?');
    assert.equal(c.message, 'Removes all of it: Raid +3, Tackle +1, All out +2.');
    assert.deepEqual([c.yesLabel, c.noLabel, c.tone], ['Yes, remove', 'No, keep it', 'danger']);
    assert.match(confirmCopy('removeEvent').message, /re-adjust/);
  });
  test('every correction list uses the shared confirm + row actions', () => {
    for (const f of ['sports/football/index.tsx', 'sports/hockey/index.tsx', 'sports/basketball/index.tsx', 'sports/kabaddi/index.tsx', 'sports/RallyPointEditor.tsx']) {
      const t = src(f);
      assert.match(t, /confirmRemove\(/, f);
      assert.match(t, /<RowAction label="✕"/, f);
      assert.ok(!/style=\{ctrl\.editRemove\}|style=\{c\.remove\}|style=\{st\.remove\}/.test(t), `${f}: no bare-text ✕`);
    }
    assert.match(src('sports/TimelineControls.tsx'), /minWidth: 44, minHeight: 44/);
  });
  test('backfill bar pinned first in football, basketball and kabaddi', () => {
    for (const f of ['football', 'basketball', 'kabaddi']) {
      const t = src(`sports/${f}/index.tsx`);
      assert.match(t, /<View style=\{\{ gap: theme\.spacing\(4\) \}\}>\s*\{backfillBar\}/, f);
    }
  });
  test('Insert a missed point starts with no side', () => {
    const t = src('sports/RallyPointEditor.tsx');
    assert.match(t, /mode: 'insert', index: afterIndex, side: undefined/);
    assert.match(t, /disabled=\{!draft\.side\}/);
  });
});
