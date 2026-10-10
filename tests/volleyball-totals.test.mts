/**
 * SD-32 (VB-03) — volleyball's absolute statTotals (src/sports/volleyball/totals.ts):
 * points / attackPoints / blocks / aces from the point log, merged with SD-29
 * setsPlayed and SD-19 setsWon / setsLost.
 *
 * Actions are built as the controls dispatch them (index.tsx: LINEUP stamp
 * before the first point, then `outcomeAction`), corrections as the rally
 * editor dispatches them (`correctionActions` with `volleyballCredits`). Covers:
 * clean logs = live increments on every undo prefix, every outcome, edits,
 * older logs without ids (names → ids), the unresolved-name safeguard, the
 * D2 heal of pre-SD-04 lines, and legacy replay identity.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assertContract, assertSameAsClean, toRecords, replay, liveSums, contractErrors, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { volleyballStatTotals, volleyballBoxTotals, VOLLEYBALL_DERIVED_KEYS, VOLLEYBALL_BOX_KEYS } from '../src/sports/volleyball/totals.ts';
import { readFileSync } from 'node:fs';
import { correctionActions, pointInputs, type PointInput } from '../src/sports/rallyEdit.ts';
import { planStatSync } from '../src/data/statSync.ts';
import { legacyReducer, legacyInit } from './volleyballLegacyReducer.mts';

type Side = 'home' | 'away';
const NAMES: Record<string, string> = { h1: 'Asha', h2: 'Bela', a1: 'Cara', a2: 'Dina' };
const P = (id: string) => ({ id, fullName: NAMES[id] });
const COURT = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const ctxOf = (c = COURT): StatTotalsContext => ({ players: { home: c.home.map((id) => ({ id, name: NAMES[id] })), away: c.away.map((id) => ({ id, name: NAMES[id] })) } });
const sp = (ctx?: StatTotalsContext, config?: Record<string, unknown>): TotalsSport<vb.VolleyballState> => ({
  name: 'volleyball', init: vb.init, reducer: vb.reducer, statTotals: volleyballStatTotals, partial: true,
  derived: VOLLEYBALL_DERIVED_KEYS, ctx, config,
});
const LINEUP: ScoreAction[] = (['home', 'away'] as const).map((team) => ({ type: 'LINEUP', payload: { team, players: COURT[team].map((id) => ({ id, name: NAMES[id] })) } }));

/** Every outcome, cycling scorers: one side's n points. */
const OUT: vb.VbOutcome[] = ['attack', 'block', 'ace', 'attack', 'opperror', 'serveerror', 'attack'];
let k = 0;
function pts(side: Side, n: number): ScoreAction[] {
  return Array.from({ length: n }, () => {
    const kind = OUT[k % OUT.length];
    const who = COURT[side][k++ % 2];
    // every 9th credited point is "No player"
    return vb.outcomeAction(kind, side, k % 9 === 0 ? undefined : P(who));
  });
}
/** A set h–a, alternating so it ends on the winner's point. */
function set(h: number, a: number): ScoreAction[] {
  const out: ScoreAction[] = [];
  const lo = Math.min(h, a);
  for (let i = 0; i < lo; i++) out.push(...pts('home', 1), ...pts('away', 1));
  out.push(...pts(h > a ? 'home' : 'away', Math.abs(h - a)));
  return out;
}
const match = (...sets: Array<[number, number]>) => { k = 0; return [...LINEUP, ...sets.flatMap(([h, a]) => set(h, a))]; };
/** A legacy point (pre-SD-04 dispatch: no `extra`, POINT / ACE / BLOCK only). */
const legacyPt = (type: 'POINT' | 'ACE' | 'BLOCK', side: Side, id: string): ScoreAction =>
  ({ type, side, attribution: { playerId: id, stat: type === 'ACE' ? 'aces' : type === 'BLOCK' ? 'blocks' : 'points', playerName: NAMES[id] } });

describe('SD-32 · clean logs and undo', () => {
  for (const [label, sets] of [
    ['home 2–0', [[25, 20], [25, 23]]],
    ['away 2–1 (decider to 15)', [[25, 20], [22, 25], [12, 15]]],
    ['home 2–1 extra points', [[27, 25], [20, 25], [16, 14]]],
  ] as Array<[string, Array<[number, number]>]>) {
    test(`${label}: owned box keys = live credits on every prefix`, () => {
      const acts = match(...sets);
      const recs = toRecords(acts);
      const t = assertContract(sp(ctxOf()), recs, { every: 1 });
      const live = liveSums(recs);
      for (const id of Object.keys(live)) for (const key of VOLLEYBALL_BOX_KEYS) assert.equal(t[id].stats[key], live[id][key] ?? 0, `${id}.${key}`);
      // every on-court player has sets played + the set record
      const s = replay(sp(), recs);
      for (const id of [...COURT.home, ...COURT.away]) {
        assert.equal(t[id].stats.setsPlayed, sets.length);
        const side = id.startsWith('h') ? 'home' : 'away';
        assert.equal(t[id].stats.setsWon, s.setsWon[side]);
      }
      // the outcome mix actually landed in every key
      const sum = (key: string) => Object.values(t).reduce((n, l) => n + (l.stats[key] ?? 0), 0);
      for (const key of VOLLEYBALL_BOX_KEYS) assert.ok(sum(key) > 0, key);
      // points = attack + block + ace credits (no legacy POINT here)
      assert.equal(sum('points'), sum('attackPoints') + sum('blocks') + sum('aces'));
    });
  }

  test('ids ride on the point events (court stamped); errors credit nobody', () => {
    const s = replay(sp(), toRecords(match([25, 20], [25, 20])));
    for (const e of s.events) {
      if (e.kind === 'opperror' || e.kind === 'serveerror') assert.equal(e.playerName, undefined);
      else if (e.playerName) assert.equal(e.playerId, Object.keys(NAMES).find((id) => NAMES[id] === e.playerName));
    }
  });

  test('the plugin uses these totals; serve errors / errors are not player keys', () => {
    const recs = toRecords(match([25, 20], [25, 20]));
    const s = replay(sp(), recs);
    // (the plugin is React Native — check its wiring by source)
    const src = readFileSync(new URL('../src/sports/volleyball/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /statTotals: volleyballStatTotals,/);
    assert.match(src, /statTotalsPartial: true/);
    for (const l of Object.values(volleyballStatTotals(s, ctxOf()))) {
      assert.equal(l.stats.serveErrors, undefined);
      assert.equal(l.stats.errors, undefined);
    }
  });
});

describe('SD-32 · corrections (rally editor)', () => {
  const rosterId = (name?: string) => Object.keys(NAMES).find((id) => NAMES[id] === name);
  /** Apply `edit` to the point list as the editor does: EDIT_LOG + STAT_ADJUSTs. */
  function corrected(acts: ScoreAction[], edit: (p: PointInput[]) => PointInput[]): { corrected: ScoreAction[]; clean: ScoreAction[] } {
    const s = acts.reduce(vb.reducer, vb.init());
    const old = pointInputs(s.events);
    const fix = correctionActions(old, edit(old.map((p) => ({ ...p }))), rosterId, vb.volleyballCredits);
    const edited = (fix[0].payload!.points as PointInput[]);
    const ACTION: Record<string, vb.VbOutcome | 'point'> = { attack: 'attack', block: 'block', ace: 'ace', opperror: 'opperror', serveerror: 'serveerror', point: 'point' };
    const clean = [...LINEUP, ...edited.map((p) => p.kind === 'point'
      ? ({ type: 'POINT', side: p.side, attribution: p.playerName ? vb.outcomeAttribution('point', { id: rosterId(p.playerName)!, fullName: p.playerName }) : undefined } as ScoreAction)
      : vb.outcomeAction(ACTION[p.kind] as vb.VbOutcome, p.side, p.playerName ? { id: rosterId(p.playerName)!, fullName: p.playerName } : undefined))];
    return { corrected: [...acts, ...fix], clean };
  }

  test('re-credit a kill to a team-mate, change an outcome, delete and insert points', () => {
    const acts = match([25, 20], [20, 25], [10, 5]);
    const { corrected: c, clean } = corrected(acts, (list) => {
      const i = list.findIndex((p) => p.kind === 'attack' && p.playerName === 'Asha');
      list[i] = { ...list[i], playerName: 'Bela', playerId: 'h2' };
      const j = list.findIndex((p) => p.kind === 'block');
      list[j] = { ...list[j], kind: 'ace' };
      const e = list.findIndex((p) => p.kind === 'opperror');
      list[e] = { ...list[e], kind: 'attack', playerName: list[e].side === 'home' ? 'Asha' : 'Cara' };
      list.splice(3, 1);
      list.splice(10, 0, { side: 'away', kind: 'block', playerName: 'Dina' });
      return list;
    });
    const recs = toRecords(c);
    assertSameAsClean(sp(ctxOf()), recs, toRecords(clean));
    // undo before the correction batch still holds
    assertContract(sp(ctxOf()), toRecords(acts), { every: 7 });
  });

  test('remove a credit (point → "No player") zeroes it absolutely', () => {
    const acts = match([25, 20]);
    const { corrected: c, clean } = corrected(acts, (list) => list.map((p) => (p.playerName === 'Dina' ? { side: p.side, kind: p.kind } : p)));
    const recs = toRecords(c);
    assertSameAsClean(sp(ctxOf()), recs, toRecords(clean));
    const t = volleyballStatTotals(replay(sp(), recs), ctxOf());
    assert.deepEqual(VOLLEYBALL_BOX_KEYS.map((key) => t.a2.stats[key] ?? 0), [0, 0, 0, 0]);
    assert.equal(liveSums(recs).a2?.points ?? 0, 0);
  });
});

describe('SD-32 · older logs: names → ids, the safeguard, the heal', () => {
  test('no court stamp (pre-SD-29): names resolve through ctx and equal the live sums', () => {
    const acts = match([25, 18], [25, 21]).slice(2); // drop LINEUP → no ids on events
    const recs = toRecords(acts);
    const s = replay(sp(), recs);
    assert.ok(s.events.every((e) => !e.playerId));
    const t = assertContract(sp(ctxOf()), recs, { every: 5 });
    assert.ok(t.h1.stats.points > 0 && t.a1.stats.points > 0);
    assert.equal(t.h1.stats.setsPlayed, undefined); // no court → no sets played (SD-29)
  });

  test('an unresolved name leaves every box key out (set record stays)', () => {
    const acts = [...match([25, 20], [20, 25]).slice(2), vb.outcomeAction('attack', 'home', { id: 'x9', fullName: 'Guest' })];
    const s = replay(sp(), toRecords(acts));
    assert.deepEqual(volleyballBoxTotals(s, ctxOf()), {});
    const t = volleyballStatTotals(s, ctxOf());
    for (const l of Object.values(t)) for (const key of VOLLEYBALL_BOX_KEYS) assert.equal(key in l.stats, false);
    assert.equal(t.h1.stats.setsWon, 1);
    // and nothing it does own disagrees with live
    assert.deepEqual(contractErrors(sp(ctxOf()), t, liveSums(toRecords(acts))), []);
  });

  test('a name used by two ids on one side is ambiguous → unresolved', () => {
    const acts = match([25, 20]).slice(2);
    const ctx = ctxOf();
    ctx.players!.home.push({ id: 'h3', name: 'Asha' });
    assert.deepEqual(volleyballBoxTotals(replay(sp(), toRecords(acts)), ctx), {});
    // the same name on the OTHER side is fine (resolution is per side)
    const ctx2 = ctxOf();
    ctx2.players!.away.push({ id: 'a3', name: 'Asha' });
    assert.equal(volleyballBoxTotals(replay(sp(), toRecords(acts)), ctx2).h1.side, 'home');
  });

  test('D2 heal: a pre-SD-04 line (ace / block without the point) is set to the log', () => {
    const acts: ScoreAction[] = [legacyPt('ACE', 'home', 'h1'), legacyPt('BLOCK', 'home', 'h1'), legacyPt('POINT', 'home', 'h2'), legacyPt('POINT', 'away', 'a1')];
    const recs = toRecords(acts);
    const live = liveSums(recs);
    assert.deepEqual(live.h1, { aces: 1, blocks: 1 }); // the old under-count
    const t = volleyballStatTotals(replay(sp(), recs), ctxOf());
    assert.deepEqual([t.h1.stats.points, t.h1.stats.aces, t.h1.stats.blocks, t.h1.stats.attackPoints], [2, 1, 1, 0]);
    const writes = planStatSync([
      { id: 'L1', playerId: 'h1', stats: { aces: 1, blocks: 1 } },
      { id: 'L2', playerId: 'h2', stats: { points: 1 } },
      { id: 'L3', playerId: 'a1', stats: { points: 1 } },
      { id: 'L4', playerId: 'a2', stats: { points: 3 } }, // stale: a2 scored nothing
    ], t, (id) => id);
    const by = Object.fromEntries(writes.map((w) => [w.playerId, w.stats]));
    assert.equal(by.h1.points, 2);
    assert.equal(by.a2.points, 0);
  });
});

describe('SD-32 · legacy identity', () => {
  test('old logs (POINT / ACE / BLOCK + EDIT_LOG) replay to exactly the old state', () => {
    const acts: ScoreAction[] = [];
    for (let i = 0; i < 60; i++) {
      const side: Side = i % 3 === 0 ? 'away' : 'home';
      const id = COURT[side][i % 2];
      acts.push(legacyPt((['POINT', 'ACE', 'BLOCK'] as const)[i % 3], side, id));
    }
    acts.push({ type: 'EDIT_LOG', payload: { points: [{ side: 'home', kind: 'ace', playerName: 'Asha' }, { side: 'away', kind: 'point', playerName: 'Cara' }] } });
    acts.push(legacyPt('POINT', 'home', 'h2'));
    for (let n = 0; n <= acts.length; n += 7) {
      const cur = acts.slice(0, n).reduce(vb.reducer, vb.init());
      const old = acts.slice(0, n).reduce(legacyReducer, legacyInit());
      assert.deepEqual(cur, old, `prefix ${n}`);
    }
    // and the totals of an old log read only what its events say
    const t = volleyballStatTotals(acts.reduce(vb.reducer, vb.init()), ctxOf());
    assert.deepEqual([t.h1.stats.aces, t.h1.stats.points, t.a1.stats.points], [1, 1, 1]);
  });
});
