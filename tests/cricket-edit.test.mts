/**
 * Cricket: edit a specific past ball (parity #06) — the pure editor engine.
 * Logs are recorded the way the live UI records them (ball() stamps the current
 * striker/bowler), then edited via AMEND ops and replayed through the real
 * reducer with #05's effectiveLog.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { effectiveLog, statDeltas, type AmendOp } from '../src/sports/amend.ts';
import {
  editableOvers, editBall, remapPlayer, changeBowlerOps, swapBattersOps, applyOps, replayCricket,
  recordToAction, ballDiffLine, bowlerDiffLine, swapDiffLine, chipLabel, overSymbolTone, ballRuns, CATEGORY_HINT,
  type EditableInnings,
} from '../src/sports/cricket/editOvers.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const CFG = { overs: 5, playersPerSide: 11 };
const P = {
  ravi: { id: 'ravi', name: 'Ravi' }, dev: { id: 'dev', name: 'Dev' }, sam: { id: 'sam', name: 'Sam' },
  arjun: { id: 'arjun', name: 'Arjun' }, kabir: { id: 'kabir', name: 'Kabir' }, mo: { id: 'mo', name: 'Mo' },
  fin: { id: 'fin', name: 'Fin' },
};

/** Records a log exactly as the live screen would (state-stamped payloads). */
class Recorder {
  log: MatchEventRecord[] = [];
  s: CricketState;
  constructor(cfg: Record<string, unknown> = CFG) { this.s = init(cfg); }
  push(a: ScoreAction): this {
    const rec: MatchEventRecord = { seq: this.log.length + 1, type: a.type };
    if (a.side) rec.side = a.side;
    const payload = a.attribution2 ? { ...(a.payload ?? {}), _attr2: a.attribution2 } : a.payload;
    if (payload) rec.payload = payload;
    if (a.attribution) rec.attribution = a.attribution;
    this.log.push(rec);
    this.s = reducer(this.s, a);
    return this;
  }
  setup(): this {
    return this
      .push({ type: 'SET_CAPTAIN', payload: { side: 'home', id: 'ravi', name: 'Ravi' } })
      .push({ type: 'SET_KEEPER', payload: { side: 'away', id: 'fin', name: 'Fin' } })
      .push({ type: 'SET_STRIKER', payload: P.ravi })
      .push({ type: 'SET_NONSTRIKER', payload: P.dev })
      .push({ type: 'SET_BOWLER', payload: P.arjun });
  }
  stamp(extra: Record<string, unknown> = {}) {
    const s = this.s;
    return { ...extra, strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName };
  }
  runs(r: number, extra: Record<string, unknown> = {}): this {
    return this.push({ type: 'RUNS', side: this.s.battingSide, payload: this.stamp({ runs: r, ...extra }), attribution: { playerId: this.s.strikerId!, stat: 'runs', by: r, playerName: this.s.strikerName } });
  }
  bye(r: number, leg = false): this {
    return this.push({ type: leg ? 'LEGBYES' : 'BYES', side: this.s.battingSide, payload: this.stamp({ runs: r }) });
  }
  extra(kind: 'Wide' | 'No ball', runs = 0): this {
    return this.push({ type: 'EXTRA', side: this.s.battingSide, payload: this.stamp({ kind, runs }) });
  }
  caught(fielder: { id: string; name: string }, newBat: { id: string; name: string }): this {
    const s = this.s;
    return this.push({
      type: 'WICKET', side: s.battingSide,
      payload: this.stamp({ kind: 'caught', fielderId: fielder.id, fielderName: fielder.name, batterOut: 'striker', runs: 0, newBatId: newBat.id, newBatName: newBat.name }),
      attribution: { playerId: s.bowlerId!, stat: 'wickets', by: 1, playerName: s.bowlerName },
      attribution2: { playerId: fielder.id, stat: 'catches', playerName: fielder.name },
    });
  }
  bowler(b: { id: string; name: string }): this { return this.push({ type: 'SET_BOWLER', payload: b }); }
}

const recAt = (log: MatchEventRecord[], seq: number) => log.find((e) => e.seq === seq)!;
const ballSeqs = (log: MatchEventRecord[]) => log.filter((e) => ['RUNS', 'BYES', 'LEGBYES', 'WICKET', 'EXTRA'].includes(e.type)).map((e) => e.seq);
const replace = (seq: number, a: ScoreAction | { error: string }): AmendOp => {
  assert.ok(!('error' in a), `unexpected error: ${(a as { error: string }).error}`);
  return { op: 'replace', seq, action: a as ScoreAction };
};

describe('engine fix — alignCrease', () => {
  test('a ball whose recorded striker is at the non-striker end swaps ends first; byes credit the recorded striker', () => {
    let s = init(CFG);
    s = reducer(s, { type: 'SET_STRIKER', payload: P.ravi });
    s = reducer(s, { type: 'SET_NONSTRIKER', payload: P.dev });
    s = reducer(s, { type: 'SET_BOWLER', payload: P.arjun });
    s = reducer(s, { type: 'BYES', payload: { runs: 2, strikerId: 'dev', strikerName: 'Dev', bowlerId: 'arjun', bowlerName: 'Arjun' } });
    assert.equal(s.batting.dev.balls, 1);
    assert.equal(s.batting.ravi.balls, 0);
    assert.equal(s.strikerId, 'dev'); // 2 runs, no rotation after the alignment
  });
  test('a ball with no recorded striker still uses the crease', () => {
    let s = init(CFG);
    s = reducer(s, { type: 'SET_STRIKER', payload: P.ravi });
    s = reducer(s, { type: 'SET_NONSTRIKER', payload: P.dev });
    s = reducer(s, { type: 'BYES', payload: { runs: 1 } });
    assert.equal(s.batting.ravi.balls, 1);
    assert.equal(s.strikerId, 'dev');
  });
});

describe('editBall — payload & pass-through', () => {
  test('preserves unknown payload keys (boundary, runsAs, v)', () => {
    const rec: MatchEventRecord = { seq: 9, type: 'RUNS', side: 'home', payload: { runs: 4, boundary: true, runsAs: 'overthrow', v: 2, strikerId: 'ravi', strikerName: 'Ravi', bowlerId: 'arjun', bowlerName: 'Arjun' } };
    const a = editBall(rec, { runs: 6 }) as ScoreAction;
    assert.equal(a.type, 'RUNS');
    assert.equal(a.payload!.runs, 6);
    assert.equal(a.payload!.boundary, true);
    assert.equal(a.payload!.runsAs, 'overthrow');
    assert.equal(a.payload!.v, 2);
    assert.deepEqual(a.attribution, { playerId: 'ravi', stat: 'runs', by: 6, playerName: 'Ravi' });
    const w: MatchEventRecord = { seq: 10, type: 'WICKET', payload: { kind: 'bowled', v: 2, end: 'pavilion', strikerId: 'ravi', bowlerId: 'arjun', bowlerName: 'Arjun' } };
    const wa = editBall(w, { kind: 'lbw' }) as ScoreAction;
    assert.equal(wa.payload!.v, 2);
    assert.equal(wa.payload!.end, 'pavilion');
    assert.equal(wa.payload!.kind, 'lbw');
  });
  test('passes SET_RULES / ADJUST / SET_BOWLER / PENALTY through untouched', () => {
    for (const rec of [
      { seq: 1, type: 'SET_RULES', payload: { overs: 10, v: 2 } },
      { seq: 2, type: 'ADJUST', side: 'home', payload: { runs: -1, reason: 'miscount' } },
      { seq: 3, type: 'SET_BOWLER', payload: { id: 'arjun', name: 'Arjun' } },
      { seq: 4, type: 'PENALTY', side: 'away', payload: { runs: 5 } },
    ] as MatchEventRecord[]) {
      assert.deepEqual(editBall(rec, { runs: 3 }), recordToAction(rec));
    }
  });
  test('rejects a category change', () => {
    const legal: MatchEventRecord = { seq: 1, type: 'RUNS', payload: { runs: 1, strikerId: 'ravi', bowlerId: 'arjun' } };
    assert.deepEqual(editBall(legal, { kind: 'bowled' }), { error: CATEGORY_HINT });
    assert.deepEqual(editBall(legal, { extraKind: 'wide' }), { error: CATEGORY_HINT });
    const wkt: MatchEventRecord = { seq: 2, type: 'WICKET', payload: { kind: 'bowled', strikerId: 'ravi', bowlerId: 'arjun' } };
    assert.deepEqual(editBall(wkt, { type: 'bat' }), { error: CATEGORY_HINT });
    assert.deepEqual(editBall(wkt, { extraKind: 'noball' }), { error: CATEGORY_HINT });
    assert.ok('error' in editBall(wkt, { kind: 'retired' }));
    const wd: MatchEventRecord = { seq: 3, type: 'EXTRA', payload: { kind: 'Wide', runs: 0 } };
    assert.deepEqual(editBall(wd, { type: 'bat' }), { error: CATEGORY_HINT });
    assert.deepEqual(editBall(wd, { kind: 'caught' }), { error: CATEGORY_HINT });
  });
  test('Wide ⇄ No ball, runs 0–4', () => {
    const wd: MatchEventRecord = { seq: 3, type: 'EXTRA', payload: { kind: 'Wide', runs: 0, strikerId: 'ravi', bowlerId: 'arjun' } };
    const nb = editBall(wd, { extraKind: 'noball', extraRuns: 4 }) as ScoreAction;
    assert.equal(nb.payload!.kind, 'No ball');
    assert.equal(nb.payload!.runs, 4);
    assert.ok('error' in editBall(wd, { extraRuns: 5 }));
  });
});

describe('editing a ball replays the rest of the innings', () => {
  // over 1: Ravi 1 · Dev 0 · Dev 1 · Ravi 4 · Ravi 0 · Ravi 1 (→ end of over)
  const rec = new Recorder().setup().runs(1).runs(0).runs(1).runs(4).runs(0).runs(1);
  const log = rec.log;
  const balls = ballSeqs(log);

  test('1 → 2 runs: total +1, striker +1, later balls credited to their recorded batter', () => {
    const before = replayCricket(log, CFG);
    const eff = applyOps(log, [replace(balls[0], editBall(recAt(log, balls[0]), { runs: 2 }))]);
    const after = replayCricket(eff, CFG);
    assert.equal(after.scores.home.runs, before.scores.home.runs + 1);
    assert.equal(after.batting.ravi.runs, before.batting.ravi.runs + 1);
    assert.equal(after.batting.dev.runs, before.batting.dev.runs);
    assert.equal(after.batting.dev.balls, before.batting.dev.balls);
    assert.equal(after.batting.ravi.balls, before.batting.ravi.balls);
    assert.equal(after.bowling.arjun.runs, before.bowling.arjun.runs + 1);
    // later balls align to the recorded striker — the crease after the last ball is unchanged
    assert.equal(after.strikerId, before.strikerId);
    // statDeltas: Ravi's runs +1 only
    assert.deepEqual(statDeltas(log, eff), [{ playerId: 'ravi', stat: 'runs', by: 1 }]);
  });

  test('editing the LAST ball 1 → 2 swaps the final crease', () => {
    const last = balls[balls.length - 1];
    const before = replayCricket(log, CFG);
    const after = replayCricket(applyOps(log, [replace(last, editBall(recAt(log, last), { runs: 2 }))]), CFG);
    assert.equal(after.scores.home.runs, before.scores.home.runs + 1);
    assert.equal(after.strikerId, before.nonStrikerId);
    assert.equal(after.nonStrikerId, before.strikerId);
  });

  test('Bye ⇄ Off bat moves runs between extras and the batter', () => {
    const before = replayCricket(log, CFG);
    const seq = balls[3]; // Ravi 4
    const asBye = applyOps(log, [replace(seq, editBall(recAt(log, seq), { type: 'bye' }))]);
    const s1 = replayCricket(asBye, CFG);
    assert.equal(s1.scores.home.runs, before.scores.home.runs);
    assert.equal(s1.scores.home.extras, before.scores.home.extras + 4);
    assert.equal(s1.batting.ravi.runs, before.batting.ravi.runs - 4);
    assert.equal(s1.batting.ravi.fours, before.batting.ravi.fours - 1);
    assert.equal(s1.batting.ravi.balls, before.batting.ravi.balls); // still faced it
    assert.equal(s1.bowling.arjun.runs, before.bowling.arjun.runs - 4);
    assert.deepEqual(statDeltas(log, asBye), [{ playerId: 'ravi', stat: 'runs', by: -4 }]);
    // and back again: a bye record → off the bat
    const byeLog = new Recorder().setup().bye(2).runs(1).log;
    const bseq = ballSeqs(byeLog)[0];
    const s2 = replayCricket(applyOps(byeLog, [replace(bseq, editBall(recAt(byeLog, bseq), { type: 'bat' }))]), CFG);
    assert.equal(s2.scores.home.extras, 0);
    assert.equal(s2.batting.ravi.runs, 3); // 2 off the bat + the later single
  });

  test('"Who faced?" moves the ball to the other batter', () => {
    const seq = balls[1]; // Dev 0
    const r = recAt(log, seq);
    const a = editBall(r, { strikerId: 'ravi', strikerName: 'Ravi' }) as ScoreAction;
    assert.equal(a.payload!.strikerId, 'ravi');
    const before = replayCricket(log, CFG);
    const after = replayCricket(applyOps(log, [replace(seq, a)]), CFG);
    assert.equal(after.batting.ravi.balls, before.batting.ravi.balls + 1);
    assert.equal(after.batting.dev.balls, before.batting.dev.balls - 1);
  });
});

describe('wickets', () => {
  const rec = new Recorder().setup().runs(0).caught(P.mo, P.sam).runs(1);
  const log = rec.log;
  const wseq = log.find((e) => e.type === 'WICKET')!.seq;

  test('Caught → Bowled removes the catch (statDeltas) and rewrites the dismissal', () => {
    const a = editBall(recAt(log, wseq), { kind: 'bowled' }) as ScoreAction;
    assert.equal(a.payload!.fielderId, undefined);
    assert.equal(a.attribution2, undefined);
    assert.deepEqual(a.attribution, { playerId: 'arjun', stat: 'wickets', by: 1, playerName: 'Arjun' });
    assert.equal(a.payload!.newBatId, 'sam'); // kept from the original
    const eff = applyOps(log, [replace(wseq, a)]);
    assert.deepEqual(statDeltas(log, eff), [{ playerId: 'mo', stat: 'catches', by: -1 }]);
    const s = replayCricket(eff, CFG);
    assert.equal(s.batting.ravi.dismissal, 'b Arjun');
    assert.equal(s.bowling.arjun.wickets, 1);
  });

  test('Bowled → Caught credits the new fielder; Stumped uses the keeper context', () => {
    const c = editBall(recAt(log, wseq), { fielderId: 'kabir', fielderName: 'Kabir' }) as ScoreAction;
    assert.deepEqual(c.attribution2, { playerId: 'kabir', stat: 'catches', playerName: 'Kabir' });
    const st = editBall(recAt(log, wseq), { kind: 'stumped' }, { keeper: P.fin }) as ScoreAction;
    assert.deepEqual(st.attribution2, { playerId: 'fin', stat: 'stumpings', playerName: 'Fin' });
    const ro = editBall(recAt(log, wseq), { kind: 'runout', fielderId: 'kabir', fielderName: 'Kabir', runs: 1, batterOut: 'nonStriker' }) as ScoreAction;
    assert.equal(ro.payload!.batterOut, 'nonstriker');
    assert.deepEqual(ro.attribution, { playerId: 'kabir', stat: 'runouts', playerName: 'Kabir' });
    // Parity #16 (REVIEW Decision 6): a run-out's completed runs off the bat are
    // credited to the striker as the 2nd attribution (was: none).
    assert.deepEqual(ro.attribution2, { playerId: 'ravi', stat: 'runs', by: 1, playerName: 'Ravi' });
  });
});

describe('editableOvers', () => {
  // over 1: 1 · wd · 0 · 4 · 2wd(1 run) · lb · 6 · 0   over 2: 1 · nb · 0
  const rec = new Recorder().setup().runs(1).extra('Wide').runs(0).runs(4).extra('Wide', 1).bye(1, true).runs(6).runs(0);
  const over1Strip = [...rec.s.thisOver];
  rec.bowler(P.kabir).runs(1).extra('No ball').runs(0);
  const log = rec.log;

  test('stamps and symbols match thisOver across an over boundary', () => {
    const [inn] = editableOvers(log, CFG);
    assert.equal(inn.side, 'home');
    assert.equal(inn.inningsIx, 0);
    assert.deepEqual(inn.overs.map((o) => o.n), [2, 1]); // newest first
    const [o2, o1] = inn.overs;
    assert.deepEqual(o1.balls.map((b) => b.sym), over1Strip);
    assert.deepEqual(o2.balls.map((b) => b.sym), rec.s.thisOver);
    assert.deepEqual(o1.balls.map((b) => b.stamp), ['0.1', '0.2', '0.2', '0.3', '0.4', '0.4', '0.5', '0.6']);
    assert.deepEqual(o2.balls.map((b) => b.stamp), ['1.1', '1.2', '1.2']);
    assert.deepEqual(o1.balls.map((b) => b.category), ['legal', 'wide', 'legal', 'legal', 'wide', 'legal', 'legal', 'legal']);
    assert.equal(o2.balls[1].category, 'noball');
    assert.deepEqual(o1.bowler, P.arjun);
    assert.deepEqual(o2.bowler, P.kabir);
    assert.equal(recAt(log, o2.setBowlerSeq!).type, 'SET_BOWLER');
    assert.equal(recAt(log, o1.setBowlerSeq!).payload!.id, 'arjun');
    assert.deepEqual(o1.balls[0].crease, ['ravi', 'dev']);
    assert.deepEqual(o1.balls[2].crease, ['dev', 'ravi']);
    assert.deepEqual(o1.batters.map((b) => b.id), ['ravi', 'dev']);
    const s = rec.s.scores.home;
    assert.equal(inn.header, `${s.runs}/${s.wickets} (1.${s.balls - 6})`);
  });

  test('chip helpers mirror index.tsx', () => {
    assert.equal(chipLabel('0'), '·');
    assert.equal(overSymbolTone('4'), 'boundary');
    assert.equal(overSymbolTone('1+W'), 'wicket');
    assert.equal(overSymbolTone('lb'), 'extra');
    assert.equal(overSymbolTone('2'), 'plain');
    assert.equal(ballRuns('2nb'), 3);
  });

  test('second innings listed first; PENALTY and Super Over balls skipped', () => {
    const r = new Recorder({ overs: 1, playersPerSide: 11 }).setup().runs(1).runs(1).runs(1).runs(1).runs(1).runs(1);
    // innings 2
    r.push({ type: 'SET_STRIKER', payload: P.mo }).push({ type: 'SET_NONSTRIKER', payload: P.kabir }).push({ type: 'SET_BOWLER', payload: P.ravi });
    r.push({ type: 'PENALTY', side: 'away', payload: { runs: 5 } });
    r.runs(0).runs(0).runs(0).runs(0).runs(0).runs(1); // 6 — tied → pendingTie
    assert.equal(r.s.pendingTie, true);
    r.push({ type: 'START_SUPER_OVER' })
      .push({ type: 'SET_STRIKER', payload: P.mo }).push({ type: 'SET_NONSTRIKER', payload: P.kabir }).push({ type: 'SET_BOWLER', payload: P.ravi });
    r.runs(6);
    const inns = editableOvers(r.log, { overs: 1, playersPerSide: 11 });
    assert.deepEqual(inns.map((i) => i.inningsIx), [1, 0]);
    assert.deepEqual(inns.map((i) => i.side), ['away', 'home']);
    assert.equal(inns[0].overs.length, 1);
    assert.equal(inns[0].overs[0].balls.length, 6);
    assert.ok(inns[0].overs[0].balls.every((b) => b.action.type === 'RUNS'));
    assert.equal(inns[0].header, '6/0 (1.0)');
    assert.equal(inns[1].header, '6/0 (1.0)');
  });
});

describe('changeBowlerOps', () => {
  // overs: 1 Arjun, 2 Kabir, 3 Arjun, 4 Mo
  const r = new Recorder().setup();
  const over = (n: number) => { for (let i = 0; i < 6; i++) r.runs(n === 3 && i === 0 ? 4 : 0); };
  over(1); r.bowler(P.kabir); over(2); r.bowler(P.arjun); over(3); r.bowler(P.mo); over(4);
  const log = r.log;
  const inn = (): EditableInnings => editableOvers(log, CFG)[0];

  test('consecutive-over error', () => {
    assert.deepEqual(changeBowlerOps(inn(), 3, P.mo, 'over', log), { error: "Mo bowled over 4 — can't bowl consecutive overs." });
    assert.deepEqual(changeBowlerOps(inn(), 3, P.kabir, 'over', log), { error: "Kabir bowled over 2 — can't bowl consecutive overs." });
    assert.deepEqual(changeBowlerOps(inn(), 1, P.kabir, 'all', log), { error: "Kabir bowled over 2 — can't bowl consecutive overs." });
  });

  test('"This over" vs "All overs" move figures', () => {
    const before = replayCricket(log, CFG);
    assert.equal(before.bowling.arjun.balls, 12);
    // Sam replaces Arjun for over 3 only
    const one = changeBowlerOps(inn(), 3, P.sam, 'over', log) as AmendOp[];
    assert.equal(one.length, 7); // SET_BOWLER + 6 balls
    const s1 = replayCricket(applyOps(log, one), CFG);
    assert.equal(s1.bowling.arjun.balls, 6);
    assert.equal(s1.bowling.arjun.runs, 0);
    assert.equal(s1.bowling.sam.balls, 6);
    assert.equal(s1.bowling.sam.runs, 4);
    assert.equal(s1.scores.home.runs, before.scores.home.runs);
    // all of Arjun's overs
    const all = changeBowlerOps(inn(), 3, P.sam, 'all', log) as AmendOp[];
    assert.equal(all.length, 14);
    const s2 = replayCricket(applyOps(log, all), CFG);
    assert.equal(s2.bowling.arjun?.balls ?? 0, 0);
    assert.equal(s2.bowling.sam.balls, 12);
    // a legacy SET_BOWLER keeps its keys (no v added)
    const sb = all.find((o) => o.op === 'replace' && o.action.type === 'SET_BOWLER') as Extract<AmendOp, { op: 'replace' }>;
    assert.deepEqual(sb.action.payload, { id: 'sam', name: 'Sam' });
    assert.equal(bowlerDiffLine([3, 1], 'Arjun', 'Sam'), 'Overs 1, 3 bowler: Arjun → Sam');
    assert.equal(bowlerDiffLine(3, 'Arjun', 'Kabir'), 'Over 3 bowler: Arjun → Kabir');
  });

  test('a wicket moves with the bowler', () => {
    const w = new Recorder().setup().runs(0).caught(P.mo, P.sam);
    const ops = changeBowlerOps(editableOvers(w.log, CFG)[0], 1, P.kabir, 'over', w.log) as AmendOp[];
    const eff = applyOps(w.log, ops);
    const s = replayCricket(eff, CFG);
    assert.equal(s.bowling.kabir.wickets, 1);
    assert.equal(s.batting.ravi.dismissal, 'c Mo b Kabir');
    assert.deepEqual(statDeltas(w.log, eff), [
      { playerId: 'arjun', stat: 'wickets', by: -1 },
      { playerId: 'kabir', stat: 'wickets', by: 1 },
    ]);
  });
});

describe('swapBattersOps', () => {
  test('swaps runs, balls and the dismissal', () => {
    const r = new Recorder().setup().runs(4).runs(1).runs(2).runs(0).caught(P.mo, P.sam).runs(1);
    const log = r.log;
    const before = replayCricket(log, CFG);
    const ops = swapBattersOps(log, 0, P.ravi, P.dev, CFG);
    assert.ok(ops.length > 0);
    const after = replayCricket(effectiveLog([...log, { seq: 999, type: 'AMEND', payload: { ops } }]), CFG);
    for (const k of ['runs', 'balls', 'fours', 'out', 'dismissal'] as const) {
      assert.deepEqual(after.batting.ravi[k], before.batting.dev[k], `ravi.${k}`);
      assert.deepEqual(after.batting.dev[k], before.batting.ravi[k], `dev.${k}`);
    }
    assert.equal(after.scores.home.runs, before.scores.home.runs);
    assert.equal(after.batting.ravi.name, 'Ravi');
    assert.equal(swapDiffLine('Ravi', 'Dev'), 'Swapped records: Ravi ⇄ Dev');
  });
});

describe('remapPlayer & diff lines', () => {
  test('rewrites ids/names, attribution and _attr2; keeps v', () => {
    const a: ScoreAction = {
      type: 'WICKET', payload: { kind: 'caught', strikerId: 'ravi', strikerName: 'Ravi', bowlerId: 'arjun', bowlerName: 'Arjun', fielderId: 'arjun', fielderName: 'Arjun', v: 2, _attr2: { playerId: 'arjun', stat: 'catches', playerName: 'Arjun' } },
      attribution: { playerId: 'arjun', stat: 'wickets', by: 1, playerName: 'Arjun' },
      attribution2: { playerId: 'arjun', stat: 'catches', playerName: 'Arjun' },
    };
    const b = remapPlayer(a, 'arjun', 'kabir', 'Kabir');
    assert.equal(b.payload!.bowlerId, 'kabir');
    assert.equal(b.payload!.bowlerName, 'Kabir');
    assert.equal(b.payload!.fielderId, 'kabir');
    assert.equal(b.payload!.strikerId, 'ravi');
    assert.equal(b.payload!.v, 2);
    assert.equal((b.payload!._attr2 as { playerId: string }).playerId, 'kabir');
    assert.equal(b.attribution!.playerId, 'kabir');
    assert.equal(b.attribution2!.playerName, 'Kabir');
    const sb = remapPlayer({ type: 'SET_BOWLER', payload: { id: 'arjun', name: 'Arjun', v: 2 } }, 'arjun', 'kabir', 'Kabir');
    assert.deepEqual(sb.payload, { id: 'kabir', name: 'Kabir', v: 2 });
  });
  test('ball line', () => {
    assert.equal(ballDiffLine('2.3', { type: 'RUNS', payload: { runs: 1 } }, { type: 'RUNS', payload: { runs: 4 } }), 'Ball 2.3: 1 run → 4 runs');
    assert.equal(ballDiffLine('0.4', { type: 'RUNS', payload: { runs: 4 } }, { type: 'BYES', payload: { runs: 4 } }), 'Ball 0.4: 4 runs → 4 byes');
    assert.equal(ballDiffLine('1.1', { type: 'WICKET', payload: { kind: 'caught', fielderName: 'Mo' } }, { type: 'WICKET', payload: { kind: 'bowled' } }), 'Ball 1.1: Caught (Mo) → Bowled');
    assert.equal(ballDiffLine('1.2', { type: 'RUNS', payload: { runs: 1, strikerId: 'a', strikerName: 'Ravi' } }, { type: 'RUNS', payload: { runs: 1, strikerId: 'b', strikerName: 'Dev' } }), 'Ball 1.2: 1 run (Ravi) → 1 run (Dev)');
  });
});
