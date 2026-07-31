/**
 * Surgical timeline editing for rally / running-point sports (volleyball, tennis,
 * badminton). The correctness that matters: removing, editing or inserting one
 * mid-match point must REPLAY through the sport's reducer so every downstream
 * game/set boundary re-derives — and player-profile tallies must reconcile to the
 * exact difference. See src/sports/rallyEdit.ts.
 *
 * The real reducers live in .tsx (JSX), which the node test loader can't import,
 * so this exercises the replay/reconcile contract against a faithful volleyball-
 * like reducer (first-to-target, win by 2, best-of sets). Live verification
 * covers the real plugin reducers end-to-end.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pointInputs, replayPoints, reconcileStatActions, type PointInput } from '../src/sports/rallyEdit.ts';
import type { ScoreAction } from '../src/sports/types.ts';

// ---- A faithful volleyball-shaped reducer (to `target`, win by 2, best-of) -----
interface MiniState {
  current: { home: number; away: number };
  setsWon: { home: number; away: number };
  sets: Array<[number, number]>;
  target: number;
  setsToWin: number;
  events: Array<{ kind: 'point' | 'ace'; side: 'home' | 'away'; set: number; playerName?: string }>;
  ended: boolean;
}
const init = (target = 5, setsToWin = 2): MiniState => ({
  current: { home: 0, away: 0 }, setsWon: { home: 0, away: 0 }, sets: [], target, setsToWin, events: [], ended: false,
});
const clear = (s: MiniState): MiniState => ({ ...s, current: { home: 0, away: 0 }, setsWon: { home: 0, away: 0 }, sets: [], events: [], ended: false });

const reducer = (s: MiniState, a: ScoreAction): MiniState => {
  if (a.type === 'STAT_ADJUST') return s;
  if (a.type === 'EDIT_LOG') return replayPoints(reducer, clear(s), (a.payload?.points as PointInput[]) ?? []);
  if (s.ended || !a.side || (a.type !== 'POINT' && a.type !== 'ACE')) return s;
  const side = a.side;
  const setNo = s.setsWon.home + s.setsWon.away + 1;
  const current = { ...s.current, [side]: s.current[side] + 1 };
  const events = [...s.events, { kind: a.type === 'ACE' ? 'ace' as const : 'point' as const, side, set: setNo, playerName: a.attribution?.playerName }];
  const h = current.home, v = current.away;
  const won = h >= s.target && h - v >= 2 ? 'home' : v >= s.target && v - h >= 2 ? 'away' : null;
  if (!won) return { ...s, current, events };
  const sets = [...s.sets, [h, v] as [number, number]];
  const setsWon = { ...s.setsWon, [won]: s.setsWon[won] + 1 };
  const ended = setsWon[won] >= s.setsToWin;
  return { ...s, current: { home: 0, away: 0 }, setsWon, sets, events, ended };
};

const P = (side: 'home' | 'away', playerName?: string, kind: 'point' | 'ace' = 'point'): PointInput => ({ side, kind, playerName });
const play = (pts: PointInput[]) => pts.reduce((s, p) => reducer(s, { type: p.kind === 'ace' ? 'ACE' : 'POINT', side: p.side, attribution: p.playerName ? { playerId: p.playerName, stat: 'points', playerName: p.playerName } : undefined }), init());
const editLog = (s: MiniState, pts: PointInput[]) => reducer(s, { type: 'EDIT_LOG', payload: { points: pts } });

describe('rallyEdit: pointInputs reconstruction', () => {
  test('keeps only scored points, in order, with side + kind + name', () => {
    const events = [
      { id: 1, stamp: 'Set 1', icon: '🏐', label: 'Point', side: 'home' as const, kind: 'point', playerName: 'Asha', set: 1, points: 1 },
      { id: 2, stamp: 'Set 1', icon: '🎯', label: 'Ace', side: 'away' as const, kind: 'ace', playerName: 'Ravi', set: 1, points: 1 },
      { id: 3, stamp: 'Set', icon: '🎉', label: 'Set 1 won', side: 'home' as const }, // banner row — ignored
    ];
    const got = pointInputs(events);
    assert.deepEqual(got, [ { side: 'home', kind: 'point', playerName: 'Asha' }, { side: 'away', kind: 'ace', playerName: 'Ravi' } ]);
  });
});

describe('rallyEdit: replay re-derives the score after an edit', () => {
  test('removing a mid-set point un-wins a set that was exactly complete', () => {
    // exactly one set: home wins 5-3, nothing trailing to backfill the gap
    const pts = [P('home'), P('home'), P('away'), P('home'), P('away'), P('home'), P('away'), P('home')];
    const s = play(pts);
    assert.deepEqual(s.sets, [[5, 3]]);
    assert.deepEqual(s.setsWon, { home: 1, away: 0 });
    // remove one of home's points → only 4 home points remain, so the set is no
    // longer won and the match rolls back into set 1 at 4-3
    const edited = editLog(s, pts.filter((_, i) => i !== 0));
    assert.deepEqual(edited.sets, [], 'set 1 should no longer be complete');
    assert.deepEqual(edited.setsWon, { home: 0, away: 0 });
    assert.deepEqual(edited.current, { home: 4, away: 3 });
    assert.equal(edited.ended, false);
  });

  test('inserting a missed point completes a set that was one short', () => {
    // home 4-3 in set 1 (no set won yet)
    const pts = [P('home'), P('home'), P('away'), P('home'), P('away'), P('home'), P('away')];
    const s = play(pts);
    assert.deepEqual(s.sets, []);
    assert.deepEqual(s.current, { home: 4, away: 3 });
    // insert a home point at the end → 5-3 wins the set
    const edited = editLog(s, [...pts, P('home')]);
    assert.deepEqual(edited.sets, [[5, 3]]);
    assert.deepEqual(edited.setsWon, { home: 1, away: 0 });
    assert.deepEqual(edited.current, { home: 0, away: 0 });
  });

  test('editing who won a point flips the running tally', () => {
    const pts = [P('home'), P('away'), P('home')];
    const s = play(pts);
    assert.deepEqual(s.current, { home: 2, away: 1 });
    const edited = editLog(s, pts.map((p, i) => (i === 0 ? P('away') : p)));
    assert.deepEqual(edited.current, { home: 1, away: 2 });
  });

  test('a full best-of-2 match ends via replay just as it did live', () => {
    const setHome = [P('home'), P('home'), P('home'), P('home'), P('home')]; // 5-0
    const s = editLog(init(), [...setHome, ...setHome]);
    assert.equal(s.ended, true);
    assert.deepEqual(s.setsWon, { home: 2, away: 0 });
  });
});

describe('rallyEdit: profile reconciliation adds up', () => {
  const id = (n?: string) => n; // player name doubles as id in these tests

  test('removing a point debits exactly that player, that stat', () => {
    const before = [P('home', 'Asha'), P('home', 'Asha'), P('away', 'Ravi')];
    const after = [P('home', 'Asha'), P('away', 'Ravi')]; // dropped one Asha point
    const acts = reconcileStatActions(before, after, id);
    assert.equal(acts.length, 1);
    assert.deepEqual(acts[0].attribution, { playerId: 'Asha', stat: 'points', by: -1, playerName: 'Asha' });
  });

  test('re-attributing a point moves +1/-1 between the two players', () => {
    const before = [P('home', 'Asha')];
    const after = [P('home', 'Bina')];
    const acts = reconcileStatActions(before, after, id).sort((a, b) => (a.attribution!.playerName! < b.attribution!.playerName! ? -1 : 1));
    assert.equal(acts.length, 2);
    assert.deepEqual(acts.map((a) => [a.attribution!.playerName, a.attribution!.by]), [ ['Asha', -1], ['Bina', 1] ]);
  });

  test('point↔ace change moves the credit between stats, not players', () => {
    const before = [P('home', 'Asha', 'point')];
    const after = [P('home', 'Asha', 'ace')];
    const acts = reconcileStatActions(before, after, id).sort((a, b) => (a.attribution!.stat < b.attribution!.stat ? -1 : 1));
    assert.deepEqual(acts.map((a) => [a.attribution!.stat, a.attribution!.by]), [ ['aces', 1], ['points', -1] ]);
  });

  test('players missing from the roster are skipped (no id to credit)', () => {
    const acts = reconcileStatActions([P('home', 'Ghost')], [], () => undefined);
    assert.equal(acts.length, 0);
  });

  test('an unchanged list reconciles to nothing', () => {
    const list = [P('home', 'Asha'), P('away', 'Ravi', 'ace')];
    assert.equal(reconcileStatActions(list, list, id).length, 0);
  });
});
