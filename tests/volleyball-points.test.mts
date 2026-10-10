/**
 * SD-04 — volleyball point credit (VB-01, VB-02). Every rally is won by a side;
 * HOW decides who gets the credit: an opponent's error credits nobody, an attack
 * credits a kill + a point, and an ace or block is ALSO a point — so profile /
 * tournament Points and "Top scorer" match the live box score. Edits keep the
 * outcome, and old logs (POINT/ACE/BLOCK only) replay to exactly the same state.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  reducer, init, outcomeAction, outcomeAttribution, volleyballCredits, tally, type VolleyballState,
} from '../src/sports/volleyball/engine.ts';
import { pointInputs, reconcileStatActions, type PointInput } from '../src/sports/rallyEdit.ts';
import { statReversals } from '../src/data/eventLog.ts';
import { STAT_WEIGHTS } from '../src/data/ratings.ts';
import { legacyReducer, legacyInit } from './volleyballLegacyReducer.mts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const A = { id: 'p-a', fullName: 'Asha' };
const B = { id: 'p-b', fullName: 'Bela' };
const play = (actions: ScoreAction[], cfg?: Record<string, unknown>, r = reducer, i = init) => actions.reduce(r, i(cfg));

/** Profile stat lines the live-match layer would record (attribution + extra). */
function statLines(actions: ScoreAction[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const add = (id: string, k: string, v: number) => { (out[id] ??= {})[k] = (out[id][k] ?? 0) + v; };
  for (const a of actions) {
    if (!a.attribution) continue;
    add(a.attribution.playerId, a.attribution.stat, a.attribution.by ?? 1);
    for (const [k, v] of Object.entries(a.attribution.extra ?? {})) add(a.attribution.playerId, k, v);
  }
  return out;
}

describe('SD-04 — who a point credits', () => {
  test('opponent error / serve error: point to the side, nobody credited', () => {
    const acts = [outcomeAction('opperror', 'home', A), outcomeAction('serveerror', 'home', A)];
    for (const a of acts) assert.equal(a.attribution, undefined);
    const s = play(acts);
    assert.deepEqual(s.current, { home: 2, away: 0 });
    assert.deepEqual(s.events.map((e) => [e.kind, e.playerName]), [['opperror', undefined], ['serveerror', undefined]]);
    assert.deepEqual(tally(s.events, 'home'), []);
    assert.deepEqual(statLines(acts), {});
  });

  test('an error never carries a player, even if one is attached', () => {
    const s = reducer(init(), { type: 'OPP_ERROR', side: 'away', attribution: { playerId: 'p-a', stat: 'points', playerName: 'Asha' } });
    assert.equal(s.events[0].playerName, undefined);
    assert.equal(s.current.away, 1);
  });

  test('attack credits a kill (attackPoints) and a point', () => {
    const a = outcomeAction('attack', 'home', A);
    assert.equal(a.type, 'ATTACK');
    assert.deepEqual(statLines([a]), { 'p-a': { points: 1, attackPoints: 1 } });
    const s = play([a]);
    assert.equal(s.events[0].kind, 'attack');
    assert.deepEqual(tally(s.events, 'home'), [{ name: 'Asha', points: 1, aces: 0, blocks: 0 }]);
  });

  test('ace and block count as points too (profile = box score)', () => {
    const acts = [outcomeAction('ace', 'home', A), outcomeAction('block', 'home', A), outcomeAction('attack', 'home', A)];
    assert.deepEqual(statLines(acts), { 'p-a': { aces: 1, blocks: 1, points: 3, attackPoints: 1 } });
    const box = tally(play(acts).events, 'home')[0];
    assert.equal(box.points, statLines(acts)['p-a'].points);
    assert.equal(box.aces, 1);
    assert.equal(box.blocks, 1);
  });

  test('undo reverses the whole credit (statReversals reads extra)', () => {
    const a = outcomeAction('block', 'away', B);
    assert.deepEqual(
      statReversals({ attribution: a.attribution!, payload: null } as never).sort((x, y) => x.stat.localeCompare(y.stat)),
      [{ playerId: 'p-b', stat: 'blocks', by: -1 }, { playerId: 'p-b', stat: 'points', by: -1 }],
    );
  });

  test('a team point (no player) credits nobody', () => {
    assert.equal(outcomeAttribution('attack'), undefined);
    assert.equal(outcomeAction('ace', 'home').attribution, undefined);
  });

  test('MVP weights keep an ace worth 3 and a block 2 now that both include the point', () => {
    const w = STAT_WEIGHTS.volleyball;
    const value = (k: 'ace' | 'block' | 'attack') =>
      Object.entries(volleyballCredits(k)).reduce((t, [stat, n]) => t + (w[stat] ?? 0) * n, 0);
    assert.equal(value('ace'), 3);
    assert.equal(value('block'), 2);
    assert.equal(value('attack'), 1);
  });
});

describe('SD-04 — timeline edits keep the outcome', () => {
  const acts: ScoreAction[] = [
    outcomeAction('attack', 'home', A),
    outcomeAction('opperror', 'away'),
    outcomeAction('ace', 'home', A),
    outcomeAction('serveerror', 'home'),
    outcomeAction('block', 'away', B),
  ];

  test('pointInputs → EDIT_LOG replay reproduces the same state', () => {
    const s = play(acts);
    const replayed = reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(replayed, s);
  });

  test('editing one point (who scored) keeps every other outcome', () => {
    const s = play(acts);
    const pts = pointInputs(s.events);
    const next: PointInput[] = pts.map((p, i) => (i === 0 ? { ...p, playerName: 'Asha 2', playerId: 'p-a2' } : p));
    const edited = reducer(s, { type: 'EDIT_LOG', payload: { points: next } });
    assert.deepEqual(edited.events.map((e) => e.kind), ['attack', 'opperror', 'ace', 'serveerror', 'block']);
    assert.equal(edited.events[0].playerName, 'Asha 2');
    assert.deepEqual(edited.current, s.current);
  });

  test('reconcile moves the full credit (points too) and ignores errors', () => {
    const s = play(acts);
    const old = pointInputs(s.events);
    // ace → opp. error: Asha loses the ace AND its point; nobody gains.
    const next = old.map((p, i) => (i === 2 ? { side: p.side, kind: 'opperror' as const } : p));
    const ids: Record<string, string> = { Asha: 'p-a', Bela: 'p-b' };
    const adj = reconcileStatActions(old, next, (n) => (n ? ids[n] : undefined), volleyballCredits)
      .map((a) => [a.attribution!.playerId, a.attribution!.stat, a.attribution!.by]).sort();
    assert.deepEqual(adj, [['p-a', 'aces', -1], ['p-a', 'points', -1]]);
  });

  test('tennis/badminton default credits unchanged (ace → aces only)', () => {
    const old: PointInput[] = [{ side: 'home', kind: 'point', playerName: 'Asha' }];
    const next: PointInput[] = [{ side: 'home', kind: 'ace', playerName: 'Asha' }];
    const adj = reconcileStatActions(old, next, () => 'p-a').map((a) => [a.attribution!.stat, a.attribution!.by]).sort();
    assert.deepEqual(adj, [['aces', 1], ['points', -1]]);
  });
});

// ------------------------------------------------- legacy replay identity --

/** An old-style log: POINT/ACE/BLOCK with the attributions the old UI sent. */
function oldLog(sets: Array<[number, number]>, opts: { names?: boolean } = {}): ScoreAction[] {
  const out: ScoreAction[] = [];
  let n = 0;
  const emit = (side: Side) => {
    const k = n++;
    const type = k % 7 === 3 ? 'ACE' : k % 11 === 5 ? 'BLOCK' : 'POINT';
    const stat = type === 'ACE' ? 'aces' : type === 'BLOCK' ? 'blocks' : 'points';
    const p = side === 'home' ? A : B;
    out.push({ type, side, attribution: opts.names !== false && k % 4 !== 0 ? { playerId: p.id, stat, playerName: p.fullName } : undefined });
    if (k % 23 === 10) out.push({ type: 'TIMEOUT', side });
  };
  for (const [h, a] of sets) {
    const lo = Math.min(h, a);
    for (let i = 0; i < lo; i++) { emit('home'); emit('away'); }
    const w: Side = h > a ? 'home' : 'away';
    for (let i = 0; i < Math.abs(h - a); i++) emit(w);
  }
  return out;
}

const LEGACY_LOGS: Record<string, { log: ScoreAction[]; cfg?: Record<string, unknown> }> = {
  bo3: { log: oldLog([[25, 21], [23, 25], [15, 12]]) },
  bo5Decider: { log: oldLog([[25, 20], [22, 25], [25, 18], [20, 25], [15, 13]]), cfg: { setsToWin: 3 } },
  beachNoNames: { log: oldLog([[21, 18], [21, 19]], { names: false }), cfg: { setsToWin: 2, pointsPerSet: 21 } },
  winByOne: { log: oldLog([[25, 24]]), cfg: { setsToWin: 1, winByTwo: false } },
  // An old correction: EDIT_LOG with legacy kinds + STAT_ADJUST, then more play.
  withEdit: {
    log: [
      ...oldLog([[25, 20]]),
      { type: 'EDIT_LOG', payload: { points: [
        ...Array.from({ length: 25 }, (_, i): PointInput => ({ side: 'home', kind: i % 5 === 0 ? 'ace' : i % 6 === 0 ? 'block' : 'point', playerName: i % 2 ? 'Asha' : undefined })),
        ...Array.from({ length: 19 }, (): PointInput => ({ side: 'away', kind: 'point', playerName: 'Bela' })),
      ] } },
      { type: 'STAT_ADJUST', attribution: { playerId: 'p-b', stat: 'points', by: -1, playerName: 'Bela' } },
      ...oldLog([[10, 3]]),
    ],
  },
};

const fingerprint = (s: VolleyballState) => createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);

describe('SD-04 — old logs replay identically', () => {
  for (const [name, { log, cfg }] of Object.entries(LEGACY_LOGS)) {
    test(`${name}: same state as the pre-SD-04 reducer`, () => {
      assert.deepEqual(play(log, cfg), play(log, cfg, legacyReducer, legacyInit));
    });
  }

  test('pinned fingerprints (captured from the frozen pre-SD-04 reducer)', () => {
    const of = (r: typeof reducer, i: typeof init) =>
      Object.fromEntries(Object.entries(LEGACY_LOGS).map(([k, { log, cfg }]) => [k, fingerprint(play(log, cfg, r, i))]));
    assert.deepEqual(of(legacyReducer, legacyInit), PINNED); // the oracle hasn't drifted
    assert.deepEqual(of(reducer, init), PINNED);
  });
});

const PINNED: Record<string, string> = {
  bo3: '5eb6f2fe01ba3f83',
  bo5Decider: '43018b1889c07c2f',
  beachNoNames: 'cf558e83d5819231',
  winByOne: 'f8690e7f1c694895',
  withEdit: '290d2c3affaba7a0',
};
