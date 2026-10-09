/**
 * Cricket local rules (parity #14): wide / no-ball values and legality, free
 * hit, byes, "normal rules in the last N overs", SET_RULES mid-match (applies
 * from the next ball, past balls intact), the generic live-settings decisions,
 * and #06's editBall pass-through. Logs are recorded the way the live UI records
 * them (every ball stamps the current striker / bowler).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import {
  STANDARD_RULES, LOCAL_RULE_DEFAULTS, CRICKET_LIVE_SETTINGS, rulesFromConfig, rulesToConfig, effectiveRules,
  cricketBeforeStart, rulesChip,
} from '../src/sports/cricket/rules.ts';
import { planLiveApply, liveSettingsAccess, customCount } from '../src/sports/liveSettings.ts';
import { editBall, applyOps, replayCricket, recordToAction, editableOvers } from '../src/sports/cricket/editOvers.ts';
import { CRICKET_MATCH_EVENTS, CRICKET_SEED_EXPECT, CRICKET_LIVE_EVENTS, LIVE } from '../src/data/cricketSeed.ts';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const CFG = { overs: 5, playersPerSide: 11 };

/** Records a log as the live screen would; names a fresh bowler each over. */
class Rec {
  log: MatchEventRecord[] = [];
  s: CricketState;
  private bowlers = ['x', 'y'];
  constructor(cfg: Record<string, unknown> = CFG) {
    this.s = init(cfg);
    this.push({ type: 'SET_STRIKER', payload: { id: 'a', name: 'A' } });
    this.push({ type: 'SET_NONSTRIKER', payload: { id: 'b', name: 'B' } });
  }
  push(a: ScoreAction): this {
    const rec: MatchEventRecord = { seq: this.log.length + 1, type: a.type };
    if (a.side) rec.side = a.side;
    if (a.payload) rec.payload = a.payload;
    this.log.push(rec);
    this.s = reducer(this.s, a);
    return this;
  }
  private bowl() {
    if (!this.s.bowlerId && !this.s.superOver) {
      const id = this.bowlers.find((b) => b !== this.s.lastOverBowlerId)!;
      this.push({ type: 'SET_BOWLER', payload: { id, name: id.toUpperCase() } });
    }
  }
  ball(type: string, payload: Record<string, unknown> = {}): this {
    this.bowl();
    return this.push({ type, side: this.s.battingSide, payload: { ...payload, strikerId: this.s.strikerId, strikerName: this.s.strikerName, bowlerId: this.s.bowlerId, bowlerName: this.s.bowlerName } });
  }
  dots(n: number): this { for (let i = 0; i < n; i++) this.ball('RUNS', { runs: 0 }); return this; }
  wide(runs = 0): this { return this.ball('EXTRA', { kind: 'Wide', runs }); }
  noBall(runs = 0): this { return this.ball('EXTRA', { kind: 'No ball', runs }); }
  rules(patch: Record<string, unknown>): this { return this.push({ type: 'SET_RULES', payload: patch }); }
  get inn() { return this.s.scores[this.s.battingSide]; }
}

const replay = (log: MatchEventRecord[], cfg: Record<string, unknown> = CFG) => replayCricket(log, cfg);

describe('standard rules = today', () => {
  test('seed and live demo logs replay identically with explicit standard local rules', () => {
    for (const e of CRICKET_SEED_EXPECT) {
      const cfg = { overs: e.overs, playersPerSide: e.players };
      assert.deepEqual(replay(CRICKET_MATCH_EVENTS[e.id], { ...cfg, ...LOCAL_RULE_DEFAULTS }), replay(CRICKET_MATCH_EVENTS[e.id], cfg));
    }
    const cfg = { overs: LIVE.overs, playersPerSide: LIVE.players };
    assert.deepEqual(replay(CRICKET_LIVE_EVENTS[LIVE.id], { ...cfg, ...LOCAL_RULE_DEFAULTS }), replay(CRICKET_LIVE_EVENTS[LIVE.id], cfg));
  });
  test('init carries standard rules; wide/no-ball are +1 and not a ball; a no-ball gives a free hit', () => {
    const r = new Rec();
    assert.deepEqual(r.s.rules, STANDARD_RULES);
    r.wide();
    assert.deepEqual([r.inn.runs, r.inn.balls, r.inn.extras], [1, 0, 1]);
    r.noBall(2);
    assert.deepEqual([r.inn.runs, r.inn.balls], [4, 0]);
    assert.equal(r.s.freeHit, true);
    assert.match(r.s.events.at(-1)!.label, /^No ball \+ 2 — free hit$/);
  });
  test('a SET_RULES that changes nothing is a no-op (no timeline line)', () => {
    const r = new Rec().dots(2);
    const before = r.s;
    r.rules({ wideRuns: 1, byesAllowed: true });
    assert.equal(r.s, before);
  });
});

describe('wide runs', () => {
  test('wide = 0 adds nothing but is still not a ball', () => {
    const r = new Rec({ ...CFG, wideRuns: 0 }).wide();
    assert.deepEqual([r.inn.runs, r.inn.balls, r.inn.extras], [0, 0, 0]);
    assert.deepEqual(r.s.thisOver, ['wd']);
  });
  test('wide = 2 adds 2 (plus any runs run, charged to the bowler)', () => {
    const r = new Rec({ ...CFG, wideRuns: 2 }).wide();
    assert.equal(r.inn.runs, 2);
    r.wide(1);
    assert.equal(r.inn.runs, 5);
    assert.equal(r.s.bowling.x.runs, 5);
    assert.equal(r.s.bowling.x.extras, 5);
    assert.equal(r.s.strikerId, 'b', 'one run run swaps strike');
    assert.equal(r.s.events.at(-1)!.label, 'Wide (2 runs) + 1');
  });
  test('the scorer prompt reads the effective penalty', () => {
    assert.equal(effectiveRules(init({ ...CFG, wideRuns: 2 })).wideRuns, 2);
    assert.equal(rulesChip(rulesFromConfig({ wideRuns: 2, noBallLegal: true })), 'Wd 2 · NB = ball');
  });
});

describe('wide counts as a ball', () => {
  test('a 6th-ball wide ends the over and swaps strike; the batter faces no ball', () => {
    const r = new Rec({ ...CFG, wideLegal: true }).dots(5);
    assert.equal(r.s.strikerId, 'a');
    const aBalls = r.s.batting.a.balls;
    r.wide();
    assert.equal(r.inn.balls, 6);
    assert.equal(r.inn.runs, 1);
    assert.equal(r.s.ballsInOver, 6);
    assert.equal(r.s.bowlerId, undefined, 'over over — new bowler needed');
    assert.equal(r.s.lastOverBowlerId, 'x');
    assert.equal(r.s.bowling.x.balls, 6);
    assert.equal(r.s.strikerId, 'b', 'over-end swap');
    assert.equal(r.s.batting.a.balls, aBalls, 'a wide is never a ball faced');
    assert.deepEqual(r.s.thisOver, ['0', '0', '0', '0', '0', 'wd']);
  });
});

describe('no-ball counts as a ball + free hit', () => {
  test('a legal no-ball advances the over and still gives a free hit', () => {
    const r = new Rec({ ...CFG, noBallLegal: true }).noBall(1);
    assert.deepEqual([r.inn.balls, r.inn.runs], [1, 2]);
    assert.equal(r.s.ballsInOver, 1);
    assert.equal(r.s.freeHit, true);
    assert.equal(r.s.batting.a.balls, 1, 'one ball faced, not two');
    assert.equal(r.s.strikerId, 'b');
    r.dots(1);
    assert.equal(r.s.freeHit, false, 'the next legal ball uses it');
  });
  test('a legal no-ball on the 6th ball ends the over and carries the free hit', () => {
    const r = new Rec({ ...CFG, noBallLegal: true }).dots(5).noBall();
    assert.equal(r.inn.balls, 6);
    assert.equal(r.s.bowlerId, undefined);
    assert.equal(r.s.freeHit, true);
  });
  test('free hit off → none, and the label drops "free hit"', () => {
    const r = new Rec({ ...CFG, freeHit: false }).noBall();
    assert.equal(r.s.freeHit, false);
    assert.equal(r.s.events.at(-1)!.label, 'No ball');
  });
  test('no-ball = 2 runs is charged as the penalty', () => {
    const r = new Rec({ ...CFG, noBallRuns: 2 }).noBall(4);
    assert.equal(r.inn.runs, 6);
    assert.equal(r.inn.extras, 2);
    assert.equal(r.s.bowling.x.runs, 6);
    assert.equal(r.s.bowling.x.extras, 2);
  });
});

describe('normal rules in the last N overs', () => {
  test('stdLastOvers = 2 in a 5-over innings: overs 4–5 are standard', () => {
    const r = new Rec({ ...CFG, wideRuns: 2, wideLegal: true, stdLastOvers: 2 });
    r.dots(12);
    r.wide(); // over 3, local: +2 and a ball
    assert.deepEqual([r.inn.runs, r.inn.balls], [2, 13]);
    r.dots(5); // 18 balls = 3 overs done
    assert.equal(effectiveRules(r.s).wideRuns, 1);
    r.wide(); // over 4: standard — +1, not a ball
    assert.deepEqual([r.inn.runs, r.inn.balls], [3, 18]);
    r.dots(6).wide(); // over 5: standard too
    assert.deepEqual([r.inn.runs, r.inn.balls], [4, 24]);
    assert.equal(r.s.rules!.wideRuns, 2, 'the rules themselves are unchanged');
  });
});

describe('SET_RULES mid-match', () => {
  test('after over 2 it leaves overs 1–2 unchanged on replay; the next wide adds 2', () => {
    const r = new Rec().dots(3).wide().dots(3).wide().dots(6);
    const atChange = r.s;
    assert.equal(r.inn.runs, 2);
    r.rules({ wideRuns: 2, wideLegal: true });
    const ev = r.s.events.at(-1)!;
    assert.equal(ev.icon, '⚙️');
    assert.equal(ev.detail, 'Wide 2 runs · counts as a ball');
    r.wide();
    assert.deepEqual([r.inn.runs, r.inn.balls], [4, 13]);
    const full = replay(r.log);
    assert.deepEqual(full, r.s);
    assert.deepEqual(full.events.slice(0, atChange.events.length), atChange.events, 'past balls keep their rules');
    assert.deepEqual(full.events.filter((e) => e.label.startsWith('Wide')).map((e) => e.label), ['Wide', 'Wide', 'Wide (2 runs)']);
  });
  test('ignored once the match has ended', () => {
    const r = new Rec().push({ type: 'END' });
    const s = r.s;
    r.rules({ wideRuns: 3 });
    assert.equal(r.s, s);
  });
  test('values are sanitised (clamped 0–5, unknown keys dropped)', () => {
    const r = new Rec().rules({ wideRuns: 9, noBallRuns: -2, overs: 50 });
    assert.equal(r.s.rules!.wideRuns, 5);
    assert.equal(r.s.rules!.noBallRuns, 0);
    assert.equal(r.s.oversLimit, 5);
  });
  test('undoing SET_RULES (replay without it) restores the previous rules', () => {
    const r = new Rec({ ...CFG, wideRuns: 2 }).dots(2);
    const before = r.s.rules;
    r.rules({ wideRuns: 4, byesAllowed: false });
    assert.notDeepEqual(r.s.rules, before);
    assert.deepEqual(replay(r.log.slice(0, -1), { ...CFG, wideRuns: 2 }).rules, before);
  });
});

describe('byes and run-outs off extras', () => {
  test('a disabled BYES is ignored by the reducer (voice can’t bypass it); leg byes still work', () => {
    const r = new Rec({ ...CFG, byesAllowed: false }).dots(1);
    const s = r.s;
    r.ball('BYES', { runs: 2 });
    assert.equal(r.s, s);
    r.ball('LEGBYES', { runs: 1 });
    assert.equal(r.inn.runs, 1);
  });
  test('disabled LEGBYES is ignored', () => {
    const r = new Rec({ ...CFG, legByesAllowed: false }).dots(1);
    const s = r.s;
    r.ball('LEGBYES', { runs: 1 });
    assert.equal(r.s, s);
  });
  test('a run-out off a wide uses the wide penalty', () => {
    const r = new Rec({ ...CFG, wideRuns: 2 }).ball('EXTRA', { kind: 'Wide', runout: true, runs: 1, batterOut: 'striker', newBatId: 'c', newBatName: 'C' });
    assert.deepEqual([r.inn.runs, r.inn.wickets, r.inn.balls, r.inn.extras], [3, 1, 0, 3]);
  });
  test('a run-out off a legal no-ball counts the ball', () => {
    const r = new Rec({ ...CFG, noBallLegal: true, noBallRuns: 2 }).ball('EXTRA', { kind: 'No ball', runout: true, runs: 0, batterOut: 'nonstriker', newBatId: 'c', newBatName: 'C' });
    assert.deepEqual([r.inn.runs, r.inn.wickets, r.inn.balls], [2, 1, 1]);
    assert.equal(r.s.freeHit, true);
  });
});

describe('Super Over', () => {
  test('ignores custom rules; SET_RULES during it changes the parent only', () => {
    const cfg = { overs: 1, playersPerSide: 11, wideRuns: 3 };
    const r = new Rec(cfg).dots(6).dots(6);
    assert.equal(r.s.pendingTie, true);
    r.push({ type: 'START_SUPER_OVER' });
    r.push({ type: 'EXTRA', side: r.s.superOver!.state.battingSide, payload: { kind: 'Wide', runs: 0 } });
    const so = r.s.superOver!.state;
    assert.equal(so.scores[so.battingSide].runs, 1, 'standard +1 in the Super Over');
    r.rules({ noBallRuns: 2 });
    assert.equal(r.s.rules!.noBallRuns, 2);
    assert.deepEqual(r.s.superOver!.state.rules, STANDARD_RULES);
  });
});

describe('config ⇄ rules key mapping', () => {
  test('byesAllowed:false → rules.byes false, and back via rulesToConfig', () => {
    const r = rulesFromConfig({ byesAllowed: false, legByesAllowed: false });
    assert.equal(r.byes, false);
    assert.equal(r.legByes, false);
    const c = rulesToConfig(r);
    assert.equal(c.byesAllowed, false);
    assert.equal(c.legByesAllowed, false);
    assert.equal('byes' in c, false);
    assert.deepEqual(rulesFromConfig(rulesToConfig(r)), r);
    assert.equal(init({ byesAllowed: false }).rules!.byes, false);
    assert.equal(new Rec().rules({ legByesAllowed: false }).s.rules!.legByes, false);
  });
});

describe('live settings Apply (generic card decisions)', () => {
  const LS = CRICKET_LIVE_SETTINGS;
  test('after the toss but before ball 1, Apply patches matches.format (not a SET_RULES event)', () => {
    let s = init(CFG);
    for (const a of [
      { type: 'SET_TOSS', payload: { winner: 'away', decision: 'bat' } },
      { type: 'SET_CAPTAIN', payload: { side: 'home', id: 'h1', name: 'H' } },
      { type: 'SET_STRIKER', payload: { id: 'a', name: 'A' } },
      { type: 'SET_BOWLER', payload: { id: 'x', name: 'X' } },
    ] as ScoreAction[]) s = reducer(s, a);
    assert.equal(cricketBeforeStart(s), true);
    const cur = LS.read(s);
    const plan = planLiveApply(LS, s, 4, cur, { ...cur, wideRuns: 2 });
    assert.deepEqual(plan, { kind: 'format', patch: { wideRuns: 2 } });
  });
  test('after a ball (or an extra), Apply dispatches SET_RULES with the changed keys', () => {
    const r = new Rec({ ...CFG, wideRuns: 0 }).wide(); // 0-run wide: no runs, but play has started
    assert.equal(cricketBeforeStart(r.s), false);
    const cur = LS.read(r.s);
    assert.deepEqual(planLiveApply(LS, r.s, r.log.length, cur, { ...cur, wideRuns: 2, byesAllowed: false }),
      { kind: 'event', action: { type: 'SET_RULES', payload: { wideRuns: 2, byesAllowed: false } } });
    assert.deepEqual(planLiveApply(LS, r.s, r.log.length, cur, cur), { kind: 'none' });
  });
  test('Standard / N custom pill', () => {
    assert.equal(customCount(LS, LS.read(init(CFG))), 0);
    assert.equal(customCount(LS, LS.read(init({ ...CFG, wideRuns: 2, freeHit: false }))), 2);
  });
  test('who can edit: scorer only while live; scorer or manager before play', () => {
    assert.deepEqual(liveSettingsAccess({ mode: 'event', beforeStart: false, canScore: false, canManage: true, complete: false }),
      { editable: false, note: 'Only scorers and hosts can change rules during play.' });
    assert.equal(liveSettingsAccess({ mode: 'event', beforeStart: false, canScore: true, canManage: false, complete: false }).editable, true);
    assert.equal(liveSettingsAccess({ mode: 'event', beforeStart: true, canScore: false, canManage: true, complete: false }).editable, true);
    assert.equal(liveSettingsAccess({ mode: 'event', beforeStart: true, canScore: false, canManage: false, complete: false }).editable, false);
    assert.equal(liveSettingsAccess({ mode: 'event', beforeStart: false, canScore: true, canManage: true, complete: true }).editable, false);
  });
});

describe('#06 editBall with SET_RULES in the log', () => {
  test('editing a ball after SET_RULES keeps the record intact; SET_RULES passes through unchanged', () => {
    const r = new Rec().dots(6).rules({ wideRuns: 2 }).dots(1).wide();
    const setRules = r.log.find((e) => e.type === 'SET_RULES')!;
    assert.deepEqual(editBall(setRules, { runs: 4 }), recordToAction(setRules));
    const target = r.log.filter((e) => e.type === 'RUNS').at(-1)!; // the ball after the change
    const edited = editBall(target, { runs: 4 }) as ScoreAction;
    assert.equal(edited.payload!.runs, 4);
    assert.equal(edited.payload!.strikerId, target.payload!.strikerId);
    const eff = applyOps(r.log, [{ op: 'replace', seq: target.seq, action: edited }]);
    assert.deepEqual(eff.find((e) => e.seq === setRules.seq), setRules);
    const s = replay(eff);
    assert.equal(s.rules!.wideRuns, 2);
    assert.equal(s.scores.home.runs, 4 + 2, 'edited four + the 2-run wide');
  });
});

describe('#06 over editor symbols follow local rules', () => {
  test('a run wide under Wide = 2 reads like the live strip (3wd), before the change 2wd', () => {
    const r = new Rec().wide(1).dots(6).rules({ wideRuns: 2 }).wide(1);
    const syms = editableOvers(r.log, CFG).flatMap((i) => i.overs).flatMap((o) => o.balls).map((b) => b.sym);
    assert.ok(syms.includes('2wd'), syms.join(','));
    assert.ok(syms.includes('3wd'), syms.join(','));
  });
});
