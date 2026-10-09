/**
 * Parity #20 — cricket penalty runs to either side, bonus / negative runs
 * (ADJUST), and fielding notes (FIELD_NOTE: dropped catch, runs saved / missed).
 * Old PENALTY events (no `against`) replay exactly as before (REVIEW Decision 8);
 * ADJUST / FIELD_NOTE are new types. Undo = replay without the last event.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, involvedPlayerIds, lastBall, type CricketState } from '../src/sports/cricket/engine.ts';
import {
  extrasBreakdown, overHistory, partnerships, fallOfWickets, statTotals, adjustmentsText, fieldingNotesText,
} from '../src/sports/cricket/scorecard.ts';
import { editBall, editableOvers, applyOps, replayCricket, recordToAction } from '../src/sports/cricket/editOvers.ts';
import { cricketCareer } from '../src/data/cricketCareer.ts';
import { planStatSync, applyStatWrites, type ExistingStatLine } from '../src/data/statSync.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const CFG = { overs: 5, playersPerSide: 11 };

/** Records a log the way the live screen does and keeps the state alongside. */
class Rec {
  log: MatchEventRecord[] = [];
  s: CricketState;
  constructor(cfg: Record<string, unknown> = CFG) { this.s = init(cfg); }
  push(a: ScoreAction): this {
    const rec: MatchEventRecord = { seq: this.log.length + 1, type: a.type };
    if (a.side) rec.side = a.side;
    if (a.payload) rec.payload = a.payload;
    if (a.attribution) rec.attribution = a.attribution;
    this.log.push(rec);
    this.s = reducer(this.s, a);
    return this;
  }
  ball(type: string, payload: Record<string, unknown> = {}): this {
    const s = this.s;
    return this.push({ type, side: s.battingSide, payload: { strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName, ...payload } });
  }
  runs(r: number) { return this.ball('RUNS', { runs: r }); }
  bowler(id: string) { return this.push({ type: 'SET_BOWLER', payload: { id, name: id } }); }
  open(a = 'A', b = 'B') {
    return this.push({ type: 'SET_STRIKER', payload: { id: a, name: a } }).push({ type: 'SET_NONSTRIKER', payload: { id: b, name: b } });
  }
  replay(n = this.log.length, cfg: Record<string, unknown> = CFG) { return replayCricket(this.log.slice(0, n), cfg); }
}

const pen = (runs: number | undefined, against?: 'batting' | 'fielding', extra: Record<string, unknown> = {}): ScoreAction =>
  ({ type: 'PENALTY', payload: { ...(runs !== undefined ? { runs } : {}), ...(against ? { against } : {}), ...extra } });
const adjust = (side: 'home' | 'away', runs: number, reason?: string): ScoreAction =>
  ({ type: 'ADJUST', side, payload: { side, runs, ...(reason ? { reason } : {}) } });
const note = (kind: 'drop' | 'saved' | 'missed', fielderId: string, runs?: number): ScoreAction =>
  ({ type: 'FIELD_NOTE', payload: { kind, fielderId, fielderName: fielderId, ...(runs ? { runs } : {}) }, attribution: { playerId: fielderId, stat: kind === 'drop' ? 'dropped' : kind === 'saved' ? 'runsSaved' : 'runsMissed', by: kind === 'drop' ? 1 : runs ?? 0 } });

/** Name the next bowler when an over has just ended (X and Y alternate). */
const keepBowling = (r: Rec) => { if (!r.s.bowlerId) r.bowler(r.s.lastOverBowlerId === 'X' ? 'Y' : 'X'); return r; };

/** Innings 1: home makes `target1 − 1` off the bat, ends it; innings 2 opened (P & Q v M). */
function chase(target1: number, cfg: Record<string, unknown> = CFG): Rec {
  const r = new Rec(cfg).open().bowler('X');
  for (let left = target1 - 1; left > 0;) { const n = Math.min(6, left); keepBowling(r.runs(n)); left -= n; }
  r.push({ type: 'END_INNINGS' });
  r.open('P', 'Q').bowler('M');
  return r;
}

describe('#20 — PENALTY to either side', () => {
  test('PENALTY {runs:5} (legacy payload) → +5 extras to the batting side, same event as before', () => {
    const r = new Rec().open().bowler('X').push(pen(5));
    assert.equal(r.s.scores.home.runs, 5);
    assert.equal(r.s.scores.home.extras, 5);
    assert.equal(r.s.scores.home.balls, 0);
    assert.equal(r.s.events.at(-1)!.label, 'Penalty — 5 runs');
    assert.equal(r.s.events.at(-1)!.icon, '➕');
    // no `runs` at all → 5 (as today)
    assert.equal(reducer(new Rec().open().bowler('X').s, pen(undefined)).scores.home.runs, 5);
  });

  test('at 17/7 in innings 1, a penalty against the batting side → fielding side 5/0, batting side stays 17', () => {
    const r = new Rec().open().bowler('X');
    const ids = ['C', 'D', 'E', 'F', 'G', 'H', 'I'];
    for (const n of [6, 6, 4, 1]) keepBowling(r.runs(n));
    for (const id of ids) keepBowling(r.ball('WICKET', { kind: 'bowled', newBatId: id, newBatName: id }));
    assert.equal(r.s.scores.home.runs, 17);
    assert.equal(r.s.scores.home.wickets, 7);
    r.push(pen(5, 'batting', { reason: 'Short run', teamName: 'Red House' }));
    assert.equal(r.s.scores.home.runs, 17);
    assert.deepEqual({ runs: r.s.scores.away.runs, wickets: r.s.scores.away.wickets, extras: r.s.scores.away.extras }, { runs: 5, wickets: 0, extras: 5 });
    assert.equal(r.s.innings, 1);
    assert.equal(r.s.events.at(-1)!.label, '5 penalty runs to Red House — Short run');
    assert.equal(r.s.events.at(-1)!.side, 'away');
    // #19 extras breakdown: pen on the RECEIVING side only
    assert.equal(extrasBreakdown(r.s, 'away').pen, 5);
    assert.equal(extrasBreakdown(r.s, 'home').pen, 0);
    // the away innings starts at 5 when it bats; its over history / worm agree
    const ov = overHistory(r.s, 'away');
    assert.equal(ov.reduce((a, o) => a + o.runs, 0), 5);
    assert.equal(ov.at(-1)!.cum, 5);
    assert.deepEqual(partnerships(r.s, 'away'), []);
    // home's own scorecard is untouched
    assert.equal(overHistory(r.s, 'home').at(-1)!.cum, 17);
    assert.equal(fallOfWickets(r.s, 'home').length, 7);
  });

  test('innings 2, target 151: a penalty against the batting side → team 1 +5, target 156', () => {
    const r = chase(151);
    assert.equal(r.s.innings, 2);
    assert.equal(r.s.target, 151);
    const t1 = r.s.scores.home.runs;
    r.runs(2).push(pen(5, 'batting', { reason: 'Damaging pitch' }));
    assert.equal(r.s.scores.home.runs, t1 + 5);
    assert.equal(r.s.scores.away.runs, 2);
    assert.equal(r.s.target, 156);
    assert.equal(r.s.ended, false);
    assert.equal(extrasBreakdown(r.s, 'home').pen, 5);
    // team 1's worm ends on its new total
    assert.equal(overHistory(r.s, 'home').at(-1)!.cum, t1 + 5);
  });

  test('a penalty against the fielding side in the chase can win it', () => {
    const r = chase(10);
    r.runs(4).runs(1); // 5/0 chasing 10
    r.push(pen(5, 'fielding', { reason: 'Ball hit helmet' }));
    assert.equal(r.s.scores.away.runs, 10);
    assert.equal(r.s.ended, true);
  });

  test('raises the target even after a #18 manual revision', () => {
    const r = chase(40);
    r.push({ type: 'SET_TARGET', payload: { runs: 30, overs: 4, v: 2 } });
    assert.equal(r.s.target, 30);
    r.push(pen(5, 'batting'));
    assert.equal(r.s.target, 35);
  });
});

describe('#20 — ADJUST (bonus / negative runs)', () => {
  test('+2 at 6/0 → 8/0, then −5 → 3/0; not extras; own line', () => {
    const r = new Rec().open().bowler('X').runs(6);
    r.push(adjust('home', 2, 'hit the net'));
    assert.equal(r.s.scores.home.runs, 8);
    assert.equal(r.s.scores.home.wickets, 0);
    assert.equal(r.s.scores.home.extras, 0);
    r.push(adjust('home', -5, 'out-of-arena'));
    assert.equal(r.s.scores.home.runs, 3);
    assert.equal(r.s.scores.home.extras, 0);
    assert.equal(r.s.adj!.length, 2);
    assert.equal(adjustmentsText(r.s, 'home'), '+2, −5 (hit the net; out-of-arena)');
    assert.equal(r.s.events.at(-2)!.label, 'Bonus 2 — the batting side (hit the net)');
    assert.equal(r.s.events.at(-1)!.label, '5 deducted — the batting side (out-of-arena)');
    // the striker didn't score them; over history still sums to the total
    assert.equal(r.s.batting.A.runs, 6);
    const ov = overHistory(r.s, 'home');
    assert.equal(ov[0].runs, 3);
    assert.equal(ov[0].cum, 3);
    assert.equal(extrasBreakdown(r.s, 'home').pen, 0);
    assert.equal(partnerships(r.s, 'home')[0].runs, 6); // bonus isn't partnership runs
  });

  test('a deduction can take a total below zero', () => {
    const r = new Rec().open().bowler('X').push(adjust('home', -2));
    assert.equal(r.s.scores.home.runs, -2);
  });

  test('zero / missing side are rejected', () => {
    const s = new Rec().open().bowler('X').s;
    assert.equal(reducer(s, adjust('home', 0)), s);
    assert.equal(reducer(s, { type: 'ADJUST', payload: { runs: 3 } }), s);
  });

  test('a bonus that reaches the target ends the match', () => {
    const r = chase(10);
    r.runs(6).runs(2);
    assert.equal(r.s.ended, false);
    r.push(adjust('away', 2, 'hit the net'));
    assert.equal(r.s.scores.away.runs, 10);
    assert.equal(r.s.ended, true);
  });

  test('a bonus to the side that batted first raises the target (a minus lowers it)', () => {
    const r = chase(20);
    r.push(adjust('home', 3));
    assert.equal(r.s.target, 23);
    r.push(adjust('home', -5));
    assert.equal(r.s.target, 18);
  });
});

describe('#20 — FIELD_NOTE', () => {
  test('drop: score and balls unchanged; batter = last ball\'s striker; `dropped` attributed', () => {
    const r = new Rec().open().bowler('V').push({ type: 'SET_KEEPER', payload: { side: 'away', id: 'K', name: 'K' } });
    r.runs(1); // A faces, now B on strike
    const before = { ...r.s.scores.home };
    r.push(note('drop', 'Ravi'));
    assert.deepEqual(r.s.scores.home, before);
    assert.equal(r.s.ballsInOver, 1);
    const n = r.s.fieldNotes!.at(-1)!;
    assert.equal(n.batterId, 'A'); // the striker of the last ball, not the current one (B)
    assert.equal(n.bowlerId, 'V');
    assert.equal(n.side, 'away');
    assert.equal(n.at, '0.1');
    assert.equal(r.s.events.at(-1)!.label, 'Dropped — Ravi (A off V)');
    assert.equal(r.log.at(-1)!.attribution!.stat, 'dropped');
    const t = statTotals(r.s);
    assert.equal(t.Ravi.stats.dropped, 1);
    assert.equal(t.Ravi.stats.runsSaved, 0);
    assert.equal(t.Ravi.side, 'away');
    assert.ok(involvedPlayerIds(r.s).includes('Ravi'));
  });

  test('saved / missed credit the runs; fielding line on the scorecard', () => {
    const r = new Rec().open().bowler('V').runs(0);
    r.push(note('drop', 'Ravi')).push(note('saved', 'Asha', 6)).push(note('missed', 'Veer', 4));
    assert.equal(r.s.events.at(-2)!.label, '6 runs saved — Asha');
    const t = statTotals(r.s);
    assert.equal(t.Asha.stats.runsSaved, 6);
    assert.equal(t.Veer.stats.runsMissed, 4);
    assert.equal(fieldingNotesText(r.s, 'home'), 'Ravi 1 drop · Asha 6 saved · Veer 4 missed');
    assert.equal(fieldingNotesText(r.s, 'away'), '');
    // saved / missed need runs
    assert.equal(reducer(r.s, note('saved', 'Asha')), r.s);
  });

  test('no ball log → falls back to the crease', () => {
    const s0 = new Rec().open().bowler('V').s;
    const { log: _l, ...noLog } = s0;
    const s = reducer(noLog as CricketState, note('drop', 'Ravi'));
    assert.equal(s.fieldNotes![0].batterId, 'A');
    assert.equal(s.fieldNotes![0].bowlerId, 'V');
    assert.equal(lastBall(s0), null);
  });

  test('absolute sync and the attribution increments agree', () => {
    const r = new Rec().open().bowler('V').runs(0).push(note('drop', 'Ravi')).push(note('saved', 'Ravi', 3));
    // what live increments wrote
    const lines: ExistingStatLine[] = [{ id: 'l1', playerId: 'Ravi', stats: { dropped: 1, runsSaved: 3 } }];
    const t = statTotals(r.s);
    const w = planStatSync(lines, { Ravi: t.Ravi }, (id) => id);
    applyStatWrites(lines, w, (x) => ({ id: 'n', playerId: x.playerId, stats: x.stats }));
    assert.equal(lines[0].stats.dropped, 1);
    assert.equal(lines[0].stats.runsSaved, 3);
    assert.equal(lines[0].stats.runsMissed, 0);
  });

  test('career Fielding section: Drops / Runs saved / Runs missed', () => {
    const c = cricketCareer([{ id: 'l1', matchId: 'm1', playerId: 'p', sport: 'cricket', won: false, stats: { dropped: 1, runsSaved: 6, runsMissed: 4 } }] as never);
    const val = (k: string) => c.fielding.find((x) => x.key === k)?.value;
    assert.equal(c.fielding.find((x) => x.key === 'dropped')!.label, 'Drops');
    assert.equal(val('dropped'), '1');
    assert.equal(val('runsSaved'), '6');
    assert.equal(val('runsMissed'), '4');
  });
});

describe('#20 — undo reverses each new action', () => {
  test('PENALTY (either side), ADJUST, FIELD_NOTE — replay without the last event', () => {
    const r = chase(30);
    r.runs(2);
    const steps: ScoreAction[] = [pen(5, 'batting'), pen(5, 'fielding'), adjust('away', 2), adjust('home', -3), note('drop', 'Z')];
    for (const a of steps) {
      const before = r.replay();
      r.push(a);
      const undone = r.replay(r.log.length - 1);
      assert.deepEqual(undone.scores, before.scores, a.type);
      assert.equal(undone.target, before.target, a.type);
      assert.deepEqual(undone.adj, before.adj);
      assert.deepEqual(undone.fieldNotes, before.fieldNotes);
      assert.deepEqual(undone.log, before.log);
    }
  });
});

describe('#20 — #06 editBall / editableOvers pass the new actions through', () => {
  test('PENALTY / ADJUST / FIELD_NOTE records come back unchanged', () => {
    for (const rec of [
      { seq: 1, type: 'PENALTY', side: 'away', payload: { runs: 5, against: 'batting', reason: 'Short run' } },
      { seq: 2, type: 'ADJUST', side: 'home', payload: { side: 'home', runs: -5, reason: 'out-of-arena' } },
      { seq: 3, type: 'FIELD_NOTE', payload: { kind: 'drop', fielderId: 'Ravi', fielderName: 'Ravi' }, attribution: { playerId: 'Ravi', stat: 'dropped', by: 1 } },
    ] as MatchEventRecord[]) {
      assert.deepEqual(editBall(rec, { runs: 3 }), recordToAction(rec));
    }
  });

  test('editing a ball before an ADJUST keeps the adjustment on replay; not listed as balls', () => {
    const r = new Rec().open().bowler('X').runs(1).runs(2);
    r.push(adjust('home', 2, 'hit the net')).push(pen(5, 'batting')).push(note('drop', 'F'));
    r.runs(4);
    const before = r.s.scores.home.runs; // 1 + 2 + 2 + 4 = 9
    assert.equal(before, 9);
    const inns = editableOvers(r.log, CFG);
    const listed = inns.flatMap((i) => i.overs.flatMap((o) => o.balls.map((b) => b.action.type)));
    assert.deepEqual(listed.filter((t) => t !== 'RUNS'), []);
    const first = r.log.find((e) => e.type === 'RUNS')!;
    const edited = editBall(first, { runs: 3 }) as ScoreAction;
    const after = replayCricket(applyOps(r.log, [{ op: 'replace', seq: first.seq, action: edited }]), CFG);
    assert.equal(after.scores.home.runs, 11);
    assert.equal(after.adj!.length, 1);
    assert.equal(after.scores.away.runs, 5);
    assert.equal(after.fieldNotes!.length, 1);
  });
});
