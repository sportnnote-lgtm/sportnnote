/**
 * Cricket bowling rules (parity #17): the per-bowler quota (overs ÷ 5 or the
 * format's `bowlerMaxOvers`), the mid-over replacement (injury / suspended /
 * other), and the next-over rule for an interrupted over (starter AND finisher
 * sit out). New rejections apply only to `v: 2` SET_BOWLERs (REVIEW Decision 8);
 * legacy logs and #06 bowler rewrites replay unchanged.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, autoQuota, recomputeQuota, canBowl, midOver, oversUsed, type CricketState } from '../src/sports/cricket/engine.ts';
import { editableOvers, editBall, changeBowlerOps, applyOps, replayCricket } from '../src/sports/cricket/editOvers.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { AmendOp } from '../src/sports/amend.ts';

const B = (id: string) => ({ id, name: id.toUpperCase() });

/** Records a log as the live screen would (each ball stamps striker + bowler). */
class Rec {
  log: MatchEventRecord[] = [];
  s: CricketState;
  cfg: Record<string, unknown>;
  constructor(cfg: Record<string, unknown> = { overs: 8, playersPerSide: 11 }) {
    this.cfg = cfg;
    this.s = init(cfg);
    this.push({ type: 'SET_STRIKER', payload: { id: 'x1', name: 'X1' } });
    this.push({ type: 'SET_NONSTRIKER', payload: { id: 'x2', name: 'X2' } });
  }
  push(a: ScoreAction): this {
    const rec: MatchEventRecord = { seq: this.log.length + 1, type: a.type };
    if (a.side) rec.side = a.side;
    if (a.payload) rec.payload = a.payload;
    this.log.push(rec);
    this.s = reducer(this.s, a);
    return this;
  }
  /** the new UI's pick (v: 2) */
  bowl(id: string, extra: Record<string, unknown> = {}): this { return this.push({ type: 'SET_BOWLER', payload: { ...B(id), v: 2, ...extra } }); }
  /** a legacy pick (no v) */
  legacy(id: string): this { return this.push({ type: 'SET_BOWLER', payload: B(id) }); }
  ball(type: string, payload: Record<string, unknown> = {}): this {
    const s = this.s;
    return this.push({ type, side: s.battingSide, payload: { ...payload, strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName } });
  }
  dots(n: number): this { for (let i = 0; i < n; i++) this.ball('RUNS', { runs: 0 }); return this; }
  over(id: string, pick: 'v2' | 'legacy' = 'v2'): this { return (pick === 'v2' ? this.bowl(id) : this.legacy(id)).dots(6); }
}

describe('quota', () => {
  test('auto quota from the overs; a fixed bowlerMaxOvers wins', () => {
    assert.equal(init({ overs: 20 }).bowlerQuota, 4);
    assert.equal(init({ overs: 50 }).bowlerQuota, 10);
    assert.equal(init({ overs: 5 }).bowlerQuota, 1);
    assert.equal(init({ overs: 999 }).bowlerQuota, 0);
    assert.equal(init({ overs: 10 }).bowlerQuota, 2); // T10 / Hundred
    assert.equal(init({ overs: 6 }).bowlerQuota, 2); // Sixes
    assert.equal(init({ overs: 20 }).bowlerQuotaAuto, true);
    const fixed = init({ overs: 20, bowlerMaxOvers: 3 });
    assert.equal(fixed.bowlerQuota, 3);
    assert.equal(fixed.bowlerQuotaAuto, false);
    assert.equal(init({ overs: 20, bowlerMaxOvers: 0 }).bowlerQuota, 4);
    assert.deepEqual([autoQuota(20), autoQuota(7), autoQuota(100)], [4, 2, 0]);
  });

  test('overs 8 (quota 2): A bowls overs 1 and 3, is rejected for over 5; force accepts and logs it', () => {
    const r = new Rec().over('a').over('b').over('a').over('b');
    assert.deepEqual(r.s.bowling.a.overs, [0, 2]);
    assert.equal(oversUsed(r.s, 'a'), 2);
    assert.deepEqual(canBowl(r.s, 'a'), { ok: false, reason: 'quota' });
    const before = r.s;
    r.bowl('a');
    assert.equal(r.s, before, 'v2 over the quota is rejected');
    assert.equal(r.s.bowlerId, undefined);
    r.bowl('a', { force: true });
    assert.equal(r.s.bowlerId, 'a');
    const ev = r.s.events.at(-1)!;
    assert.equal(ev.label, 'Quota override');
    r.dots(6);
    assert.deepEqual(r.s.bowling.a.overs, [0, 2, 4]);
  });

  test('force never overrides a non-quota block', () => {
    const r = new Rec().over('a').over('b').over('a');
    // A bowled the last over — force does not help
    r.bowl('a', { force: true });
    assert.equal(r.s.bowlerId, undefined);
  });

  test('the Super Over gets a quota of 1 automatically', () => {
    assert.equal(init({ overs: 1, playersPerSide: 3 }).bowlerQuota, 1);
  });

  test('RAIN 20 → 10 with an auto quota → 2; a fixed quota is kept', () => {
    const r = new Rec({ overs: 20, dls: true }).over('a');
    assert.equal(r.s.bowlerQuota, 4);
    r.push({ type: 'RAIN', payload: { overs: 10 } });
    assert.equal(r.s.oversLimit, 10);
    assert.equal(r.s.bowlerQuota, 2);
    const f = new Rec({ overs: 20, dls: true, bowlerMaxOvers: 5 }).over('a');
    f.push({ type: 'RAIN', payload: { overs: 10 } });
    assert.equal(f.s.bowlerQuota, 5);
    assert.equal(recomputeQuota({ ...f.s, bowlerQuotaAuto: true }, 13).bowlerQuota, 3);
  });
});

describe('mid-over replacement', () => {
  const injured = () => new Rec().over('a').bowl('b').dots(2).bowl('c', { reason: 'injury' }).dots(4);

  test('B bowls 2 balls of over 2, C (injury) finishes it: balls split, both overs include index 1, logged', () => {
    const r = injured();
    assert.equal(r.s.bowling.b.balls, 2);
    assert.equal(r.s.bowling.c.balls, 4);
    assert.ok(r.s.bowling.b.overs!.includes(1));
    assert.ok(r.s.bowling.c.overs!.includes(1));
    const ev = r.s.events.find((e) => e.icon === '🚑')!;
    assert.ok(ev, 'replacement logged');
    assert.equal(ev.detail, "C completes B's over (injury)");
    assert.equal(ev.stamp, '1.2');
    assert.equal(r.s.scores.home.balls, 12);
  });

  test('over 3: B and C are both rejected, D is accepted', () => {
    const r = injured();
    assert.deepEqual(r.s.lastOverBowlerIds!.sort(), ['b', 'c']);
    for (const id of ['b', 'c']) {
      r.bowl(id);
      assert.equal(r.s.bowlerId, undefined, `${id} sits out over 3`);
      assert.equal(canBowl(r.s, id).reason, 'last-over');
    }
    r.bowl('d');
    assert.equal(r.s.bowlerId, 'd');
  });

  test("B can't be set again during over 2 (this-over)", () => {
    const r = new Rec().over('a').bowl('b').dots(2).bowl('c', { reason: 'injury' }).dots(1);
    assert.ok(midOver(r.s));
    assert.deepEqual(canBowl(r.s, 'b'), { ok: false, reason: 'this-over' });
    r.bowl('b', { reason: 'other' });
    assert.equal(r.s.bowlerId, 'c');
  });

  test('suspended: B is barred for the rest of the innings', () => {
    const r = new Rec().over('a').bowl('b').dots(2).bowl('c', { reason: 'suspended' }).dots(4);
    assert.deepEqual(r.s.barredBowlers, ['b']);
    r.over('d').over('a').over('c');
    assert.deepEqual(canBowl(r.s, 'b'), { ok: false, reason: 'barred' });
    r.bowl('b');
    assert.equal(r.s.bowlerId, undefined);
    // a new innings clears it
    r.over('d').over('e').over('f');
    assert.equal(r.s.innings, 2);
    assert.deepEqual(r.s.barredBowlers, []);
  });

  test('injured / other do not bar', () => {
    const r = injured().over('d');
    assert.equal(canBowl(r.s, 'b').ok, true);
  });

  test('B bowls only a wide and is replaced: still sits out the next over and has used one over of quota', () => {
    const r = new Rec().over('a').bowl('b').ball('EXTRA', { kind: 'Wide' });
    assert.ok(midOver(r.s), 'a wide alone starts the over');
    r.bowl('c', { reason: 'injury' }).dots(6);
    assert.equal(r.s.bowling.b.balls, 0);
    assert.deepEqual(r.s.bowling.b.overs, [1]);
    assert.equal(oversUsed(r.s, 'b'), 1);
    assert.ok(r.s.lastOverBowlerIds!.includes('b'));
    r.bowl('b');
    assert.equal(r.s.bowlerId, undefined);
  });

  test('a wide that opens over 2 (ballsInOver still 6) is remembered', () => {
    const r = new Rec().over('a').bowl('b').ball('EXTRA', { kind: 'Wide' });
    assert.deepEqual(r.s.overBowlers, ['b']);
    r.dots(6);
    assert.deepEqual(r.s.lastOverBowlerIds, ['b']);
  });

  test('before the first delivery the pick can be fixed freely', () => {
    const r = new Rec().over('a').bowl('b');
    assert.equal(midOver(r.s), false);
    r.bowl('c');
    assert.equal(r.s.bowlerId, 'c');
    assert.equal(r.s.events.some((e) => e.icon === '🚑'), false);
    r.dots(6);
    assert.deepEqual(r.s.lastOverBowlerIds, ['c']);
    assert.equal(oversUsed(r.s, 'b'), 0, 'a pick that bowled nothing uses no quota');
  });

  test('a Mankad / retired out is no delivery — it does not start the over', () => {
    const r = new Rec().over('a').bowl('b');
    r.ball('WICKET', { kind: 'mankad', newBatId: 'x3', newBatName: 'X3' });
    assert.equal(midOver(r.s), false);
    r.bowl('c');
    assert.equal(r.s.bowlerId, 'c');
  });

  test('legacy mid-over SET_BOWLER (no reason, no v) still switches, silently', () => {
    const r = new Rec().over('a').bowl('b').dots(2);
    const n = r.s.events.length;
    r.legacy('c');
    assert.equal(r.s.bowlerId, 'c');
    assert.equal(r.s.events.length, n);
    r.dots(4);
    assert.deepEqual(r.s.lastOverBowlerIds!.sort(), ['b', 'c']);
  });
});

describe('legacy replay (REVIEW Decision 8)', () => {
  test('a SET_BOWLER without v that breaks the quota / this-over rule is accepted; with v: 2 it is rejected', () => {
    const q = new Rec().over('a', 'legacy').over('b', 'legacy').over('a', 'legacy').over('b', 'legacy');
    q.legacy('a');
    assert.equal(q.s.bowlerId, 'a', 'legacy quota break accepted');
    const q2 = new Rec().over('a').over('b').over('a').over('b').bowl('a');
    assert.equal(q2.s.bowlerId, undefined, 'v2 quota break rejected');

    const t = new Rec().over('a').bowl('b').dots(2).bowl('c', { reason: 'injury' }).dots(1);
    t.legacy('b');
    assert.equal(t.s.bowlerId, 'b', 'legacy this-over accepted');
    const t2 = new Rec().over('a').bowl('b').dots(2).bowl('c', { reason: 'injury' }).dots(1).bowl('b');
    assert.equal(t2.s.bowlerId, 'c', 'v2 this-over rejected');
  });

  test('a legacy log replays to the same bowling figures', () => {
    const r = new Rec().over('a', 'legacy').over('b', 'legacy').over('a', 'legacy').over('b', 'legacy').over('a', 'legacy');
    const s = replayCricket(r.log, r.cfg);
    assert.equal(s.bowling.a.balls, 18);
    assert.equal(s.bowling.b.balls, 12);
  });

  test("#06 changeBowlerOps / editBall on a legacy log keeps the rewritten SET_BOWLER (no v) and it isn't dropped", () => {
    // A bowls 1 & 3, B bowls 2 & 4, C bowls 5. Moving over 5 to A breaks A's quota.
    const r = new Rec().over('a', 'legacy').over('b', 'legacy').over('a', 'legacy').over('b', 'legacy').over('c', 'legacy');
    const inn = editableOvers(r.log, r.cfg)[0];
    const ops = changeBowlerOps(inn, 5, B('a'), 'over', r.log) as AmendOp[];
    assert.ok(Array.isArray(ops));
    const sb = ops.find((o) => o.op === 'replace' && o.action.type === 'SET_BOWLER') as Extract<AmendOp, { op: 'replace' }>;
    assert.deepEqual(sb.action.payload, { id: 'a', name: 'A' });
    const after = replayCricket(applyOps(r.log, ops), r.cfg);
    assert.equal(after.bowling.a.balls, 18);
    assert.equal(after.bowling.c?.balls ?? 0, 0);
    assert.deepEqual(after.bowling.a.overs, [0, 2, 4]);
    assert.equal(after.lastOverBowlerId, 'a', 'the rewritten SET_BOWLER was applied');
    // editBall passes a SET_BOWLER through untouched
    const rec = r.log.find((e) => e.type === 'SET_BOWLER')!;
    assert.deepEqual(editBall(rec, { runs: 4 }), { type: 'SET_BOWLER', payload: { id: 'a', name: 'A' } });
    // editing a ball in a legacy log replays fine
    const ballRec = r.log.filter((e) => e.type === 'RUNS').at(-1)!;
    const ed = editBall(ballRec, { runs: 2 }) as ScoreAction;
    const s2 = replayCricket(applyOps(r.log, [{ op: 'replace', seq: ballRec.seq, action: ed }]), r.cfg);
    assert.equal(s2.bowling.c.runs, 2);
    assert.equal(s2.bowling.c.balls, 6);
  });

  test('#06 changeBowlerOps on a v:2 log: the correction applies even past the quota (v dropped)', () => {
    const r = new Rec().over('a').over('b').over('a').over('b').over('c');
    const inn = editableOvers(r.log, r.cfg)[0];
    const ops = changeBowlerOps(inn, 5, B('a'), 'over', r.log) as AmendOp[];
    const sb = ops.find((o) => o.op === 'replace' && o.action.type === 'SET_BOWLER') as Extract<AmendOp, { op: 'replace' }>;
    assert.equal(sb.action.payload?.v, undefined);
    const after = replayCricket(applyOps(r.log, ops), r.cfg);
    assert.deepEqual(after.bowling.a.overs, [0, 2, 4]);
    assert.equal(after.lastOverBowlerId, 'a');
  });

  test('older saved states (no #17 keys) still answer canBowl from lastOverBowlerId', () => {
    const s = new Rec().over('a', 'legacy').s;
    const old = { ...s } as CricketState;
    delete old.lastOverBowlerIds; delete old.overBowlers; delete old.barredBowlers; delete old.bowlerQuota; delete old.bowlerQuotaAuto;
    assert.deepEqual(canBowl(old, 'a'), { ok: false, reason: 'last-over' });
    assert.deepEqual(canBowl(old, 'b'), { ok: true });
    assert.equal(midOver(old), false);
  });
});
