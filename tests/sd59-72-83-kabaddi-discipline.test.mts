/**
 * SD-59 (technical points + line-outs), SD-72 (green / yellow / red cards) and
 * SD-83 (a caught raider's touches, D6) — kabaddi.
 *  - line-outs ride on the raid (new optional keys `defOut` / `lineOut`);
 *  - TECH_POINT and CARD are new actions replayed with the raids (`extras[]`);
 *  - SD-83 is a format flag (`caughtTouches: 'void'`) that touches v2 raids only.
 * Every change is additive: logs without the new keys replay exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replayRaids, type RaidOutcome, type ExtraOutcome, type KabaddiCfg } from '../src/sports/kabaddi/rules.ts';
import * as kb from '../src/sports/kabaddi/engine.ts';
import { kabaddiTotals, kabaddiMatchCentre, kabaddiSuspended, kabaddiFieldLog } from '../src/sports/kabaddi/totals.ts';
import { kabaddiStats } from '../src/sports/kabaddi/stats.ts';
import { trackedIn } from '../src/sports/statSchema.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const cfg = (over: Partial<KabaddiCfg> = {}): KabaddiCfg => ({ teamSize: 7, style: 'sanjeevani', proRules: true, ...over });
const r = (side: Side, o: Partial<RaidOutcome> = {}, eid?: number): RaidOutcome => ({ side, touches: 0, bonus: false, raiderOut: false, ...o, ...(eid != null ? { eid } : null) });
const CFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, halfMinutes: 20 };
const NEW = { ...CFG, caughtTouches: 'void' };
const play = (acts: ScoreAction[], c: Record<string, unknown> = CFG) => acts.reduce(kb.reducer, kb.init(c));
const raid = (side: Side, f: Partial<kb.RaidForm> = {}, at?: number): ScoreAction => {
  const a = kb.raidActions(kb.init(CFG), { side, touches: 0, bonus: false, tackled: false, ...f }).at(-1)!;
  return { ...a, payload: { ...a.payload, minute: 1, half: 1, ...(at != null ? { at } : null) } };
};
const T0 = 1_000_000;
const KO: ScoreAction = { type: 'KICKOFF', payload: { at: T0 } };
const min = (m: number) => T0 + m * 60000;
const card = (side: Side, c: 'green' | 'yellow' | 'red', who?: string, at?: number, extra: Record<string, unknown> = {}): ScoreAction =>
  ({ type: 'CARD', side, payload: { card: c, ...(who ? { playerName: who, playerId: who.toLowerCase() } : null), minute: 1, half: 1, ...(at != null ? { at } : null), ...extra } });
const tech = (side: Side, reason = 'cant', by?: string): ScoreAction =>
  ({ type: 'TECH_POINT', side, payload: { reason, ...(by ? { playerName: by, playerId: by.toLowerCase() } : null), minute: 2, half: 1 } });

describe('SD-59 line-outs (rules)', () => {
  test('a defender steps out: out, +1 to the raiders (not a raid point), the raiding side revives', () => {
    const d = replayRaids([r('home', { raiderOut: true }), r('away', { defOut: 1 })], cfg());
    // home raider tackled (+1 away, home 1 out); away raid: a home defender steps out
    assert.equal(d.away, 2);
    assert.equal(d.out.home, 2);
    assert.equal(d.perRaid[1].raidPts, 0);
    assert.equal(d.perRaid[1].defOutPts, 1);
  });
  test('the raider steps out: out, +1 to the defence, no tackle, touches void', () => {
    const d = replayRaids([r('home', { touches: 2, lineOut: true, v: 2 })], cfg());
    assert.deepEqual([d.home, d.away, d.out.home, d.out.away], [0, 1, 1, 0]);
    const b = d.perRaid[0];
    assert.equal(b.raiderOut, true);
    assert.equal(b.tacklePts, 0);
    assert.equal(b.lineOut, true);
    assert.equal(b.doOrDieFail, false);
  });
  test('a defender line-out saves a do-or-die raid (not empty)', () => {
    const d = replayRaids([r('home'), r('home'), r('home', { defOut: 1 })], cfg());
    assert.equal(d.perRaid[2].doOrDie, true);
    assert.equal(d.perRaid[2].doOrDieFail, false);
    assert.equal(d.home, 1);
    assert.equal(d.emptyRaids.home, 0);
  });
  test('a line-out can complete an all-out', () => {
    const d = replayRaids([r('home', { touches: 6, v: 2 }), r('home', { defOut: 1 })], cfg());
    assert.equal(d.home, 6 + 1 + 2);
    assert.deepEqual(d.perRaid[1].allOuts, ['home']);
    assert.equal(d.out.away, 0);
  });
  test('raids without the keys replay exactly as before (no new breakdown keys)', () => {
    const d = replayRaids([r('home', { touches: 2 })], cfg());
    assert.equal('defOutPts' in d.perRaid[0], false);
    assert.equal('lineOut' in d.perRaid[0], false);
    assert.equal('touchesLost' in d.perRaid[0], false);
  });
});

describe('SD-83 caught raider (D6: AKFI / IKF, PKL alike)', () => {
  test('flag on + v2: touches lost, defenders stay in, the bonus still counts, tackle point', () => {
    const d = replayRaids([r('home', { touches: 2, bonus: true, raiderOut: true, v: 2 })], cfg({ caughtVoid: true }));
    assert.deepEqual([d.home, d.away, d.out.away, d.out.home], [1, 1, 0, 1]);
    assert.equal(d.perRaid[0].touchesLost, 2);
  });
  test('an un-versioned raid replays as it scored (touches count)', () => {
    const d = replayRaids([r('home', { touches: 2, raiderOut: true })], cfg({ caughtVoid: true }));
    assert.deepEqual([d.home, d.away], [2, 1]);
  });
  test('flag off (older formats / house rule): a v2 raid scores its touches as before', () => {
    const d = replayRaids([r('home', { touches: 2, raiderOut: true, v: 2 })], cfg());
    assert.deepEqual([d.home, d.away], [2, 1]);
  });
  test('init stamps the format key only when the format carries it', () => {
    assert.equal('caughtTouches' in kb.init(CFG), false);
    assert.equal(kb.init(NEW).caughtTouches, 'void');
    assert.equal(kb.init({ ...CFG, caughtTouches: 'count' }).caughtTouches, 'count');
    const s = play([raid('home', { touches: 2, tackled: true })], NEW);
    assert.deepEqual([s.home, s.away], [0, 1]);
    assert.match(s.events[0].label, /2 touches lost \(caught\)/);
  });
});

describe('SD-59 technical points', () => {
  test('a point to the side, nobody goes out; a timeline line; ✕ takes it back', () => {
    const s = play([tech('away', 'cant', 'Ravi')]);
    assert.deepEqual([s.home, s.away, s.out.home, s.out.away], [0, 1, 0, 0]);
    const line = s.events.find((e) => e.kind === 'tech')!;
    assert.match(line.label, /Technical point \+1 — cant late/i);
    assert.equal(line.detail, 'Ravi');
    assert.equal(kb.halfPoints(s, 'away', 1), 1);
    const back = kb.reducer(s, { type: 'REMOVE_EVENT', side: 'away', payload: { id: line.id, v: 2 } });
    assert.deepEqual([back.home, back.away, back.events.length], [0, 0, 0]);
  });
  test('extras order with raids by log order (a later raid sees the point)', () => {
    const s = play([raid('home', { touches: 1 }), tech('home', 'delay'), raid('away', { tackled: true })]);
    assert.deepEqual([s.home, s.away], [3, 0]);
    assert.equal(s.extras?.length, 1);
  });
  test('old logs never grow the extras key', () => {
    const s = play([raid('home', { touches: 1 }), { type: 'END' }]);
    assert.equal('extras' in s, false);
  });
});

describe('SD-72 cards', () => {
  test('green: a warning — no score, nobody off the mat', () => {
    const s = play([KO, card('home', 'green', 'Ravi', min(1))]);
    assert.deepEqual([s.home, s.away], [0, 0]);
    assert.equal(kb.matNow(s, 1.5).onMat.home, 7);
    assert.equal(s.events[0].card, 'green');
  });
  test('yellow: the side plays short for 2 minutes of match clock, then he is back', () => {
    const s = play([KO, card('home', 'yellow', 'Ravi', min(3))]);
    assert.equal(kb.matNow(s, 4).onMat.home, 6);
    assert.equal(kb.matNow(s, 4).short.home, 1);
    assert.equal(kb.matNow(s, 5).onMat.home, 7);
    assert.deepEqual(kb.unavailable(s, 4).home.map((x) => [x.name, x.why]), [['Ravi', 'yellow']]);
    assert.deepEqual(kb.unavailable(s, 5.1).home, []);
    assert.deepEqual(kabaddiSuspended(s, 4), [{ side: 'home', name: 'Ravi', left: '1:00' }]);
  });
  test('a suspension lowers the defenders on the mat: bonus line needs 6, super tackle at 3', () => {
    // away has 1 out + 1 suspended → 5 on the mat: the bonus is void
    const s = play([KO, raid('away', { tackled: true }, min(1)), card('away', 'yellow', 'Bela', min(2)), raid('home', { bonus: true }, min(2.5))]);
    assert.equal(s.home, 1); // the tackle point only (the bonus is void)
    assert.match(s.events.find((e) => e.kind === 'raid' && e.side === 'home')!.label, /bonus \(void/);
    // after the 2 minutes he is back: 6 on the mat, the bonus counts
    const t = kb.reducer(s, raid('home', { bonus: true }, min(4.5)));
    assert.equal(t.home, s.home + 1);
  });
  test('an all-out happens when the mat empties — a suspended player does not stop it', () => {
    const steps: ScoreAction[] = [KO, card('away', 'yellow', 'Bela', min(1)), raid('home', { touches: 5 }, min(1.5)), raid('home', { touches: 1 }, min(2))];
    const s = play(steps);
    // 6 on the mat, 5 + 1 touched → mat empty → all-out (+2); the 6 come back
    assert.equal(s.home, 5 + 1 + 2);
    assert.ok(s.events.some((e) => e.kind === 'allout' && e.side === 'home'));
    assert.equal(kb.matNow(s, 2.5).onMat.away, 6);
    assert.equal(kb.matNow(s, 3.5).onMat.away, 7);
  });
  test('a yellow for a player who is out starts when he is revived', () => {
    const s0 = play([KO, raid('home', { tackled: true, raider: { id: 'ravi', fullName: 'Ravi' } }, min(1)), card('home', 'yellow', 'Ravi', min(2), { wasOut: true })]);
    assert.equal(kb.unavailable(s0, 10).home[0].why, 'yellow'); // waiting for revival
    assert.match(s0.events.find((e) => e.kind === 'card')!.label, /from his revival/);
    // home touches one at 6' → the revival: he starts serving (still off the mat)
    const s = kb.reducer(s0, raid('home', { touches: 1 }, min(6)));
    const m = kb.matNow(s, 7);
    assert.deepEqual([m.out.home, m.short.home, m.onMat.home], [0, 1, 6]);
    assert.equal(kb.matNow(s, 8).onMat.home, 7);
  });
  test('red: off for the match, no substitute, +1 technical point; ✕ undoes it', () => {
    const s = play([KO, card('home', 'red', 'Ravi', min(2), { tp: 1 })]);
    assert.deepEqual([s.home, s.away], [0, 1]);
    assert.equal(kb.matNow(s, 30).onMat.home, 6);
    assert.equal(kb.matNow(s, 30).sentOff.home, 1);
    assert.deepEqual(kb.unavailable(s, 30).home, [{ name: 'Ravi', why: 'red' }]);
    assert.ok(s.events.some((e) => e.kind === 'tech' && e.side === 'away' && /red card/.test(e.label)));
    const head = s.events.find((e) => e.kind === 'card')!;
    const back = kb.reducer(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: head.id, v: 2 } });
    assert.deepEqual([back.away, back.events.length, kb.matNow(back, 30).onMat.home], [0, 0, 7]);
  });
  test('a red during his own suspension supersedes it (one player short, not two)', () => {
    const s = play([KO, card('home', 'yellow', 'Ravi', min(2)), card('home', 'red', 'Ravi', min(3))]);
    assert.equal(kb.matNow(s, 3.5).onMat.home, 6);
    assert.equal(kb.matNow(s, 10).onMat.home, 6);
  });
  test('a coach / team official card changes nothing on the mat', () => {
    const s = play([KO, card('home', 'yellow', undefined, min(2), { official: true, tp: 1 })]);
    assert.equal(kb.matNow(s, 3).onMat.home, 7);
    assert.equal(s.away, 1);
    assert.equal(s.events[0].detail, 'Team official');
  });
  test('escalation hint: two greens → yellow, two yellows → red', () => {
    assert.equal(kb.suggestedCard({ green: 2, yellow: 0, red: 0 }), 'yellow');
    assert.equal(kb.suggestedCard({ green: 0, yellow: 2, red: 0 }), 'red');
    assert.equal(kb.suggestedCard({ green: 1, yellow: 0, red: 0 }), null);
    const s = play([card('home', 'green', 'Ravi'), card('home', 'green', 'Ravi')]);
    assert.deepEqual(kb.cardsOf(s, 'home', { name: 'Ravi' }), { green: 2, yellow: 0, red: 0 });
  });
  test('a red card goes to the on-field tracker as a sending-off; a yellow as a 2-minute suspension', () => {
    const s = play([KO, card('home', 'yellow', 'Ravi', min(2)), card('away', 'red', 'Bela', min(3))]);
    const log = kabaddiFieldLog(s, 3);
    assert.deepEqual(log.events.map((e) => e.kind), ['suspend', 'off']);
  });
});

describe('SD-59 / SD-72 stats', () => {
  const ctx = { players: { home: [{ id: 'ravi', name: 'Ravi' }, { id: 'dev', name: 'Dev' }], away: [{ id: 'bela', name: 'Bela' }] } };
  test('cards and technical points conceded per player (keyed: only matches that track them)', () => {
    const s = play([raid('home', { touches: 1, raider: { id: 'dev', fullName: 'Dev' } }), card('home', 'yellow', 'Ravi'), tech('away', 'cant', 'Ravi'), card('away', 'green', 'Bela')]);
    const t = kabaddiTotals(s, ctx as never);
    assert.equal(t.ravi.stats.yellowCards, 1);
    assert.equal(t.ravi.stats.techPointsConceded, 1);
    assert.equal(t.bela.stats.greenCards, 1);
    assert.equal(t.dev.stats.redCards, 0);
    // a match with no card / technical point and an older format: no keys
    const old = kabaddiTotals(play([raid('home', { touches: 1, raider: { id: 'dev', fullName: 'Dev' } })]), ctx as never);
    assert.equal('yellowCards' in old.dev.stats, false);
    assert.equal(trackedIn(kabaddiStats, { stats: old.dev.stats } as never, 'yellowCards'), false);
    // a new-format match tracks them even with none given
    const fresh = kabaddiTotals(play([raid('home', { touches: 1, raider: { id: 'dev', fullName: 'Dev' } })], NEW), ctx as never);
    assert.equal(fresh.dev.stats.yellowCards, 0);
  });
  test('match centre: technical points and line-outs are extras; a raider line-out is no tackle', () => {
    const s = play([raid('home', { lineOut: true, raider: { id: 'dev', fullName: 'Dev' } }), raid('away', { defOut: 1 }), tech('home', 'coaching')]);
    const c = kabaddiMatchCentre(s);
    assert.equal(c.away.extraPoints, 2); // raider line-out + defender line-out
    assert.equal(c.home.extraPoints, 1);
    assert.equal(c.away.tackles, 0);
    assert.equal(c.home.raidsOut, 1);
    assert.equal(s.home + s.away, 3);
    const t = kabaddiTotals(s, ctx as never);
    assert.equal(t.dev.stats.raidsOut, 1);
  });
  test('schema: discipline keys declared with keyed coverage and a Discipline section', () => {
    for (const k of ['greenCards', 'yellowCards', 'redCards', 'techPointsConceded']) {
      assert.equal(kabaddiStats.stats.find((d) => d.key === k)?.coverage, 'keyed', k);
    }
    assert.ok(kabaddiStats.sections?.some((x) => x.id === 'discipline'));
  });
});

describe('form + edit', () => {
  test('the raid form logs line-outs; a raider line-out drops the tackle and its credit', () => {
    const a = kb.raidActions(kb.init(CFG), { side: 'home', touches: 2, bonus: false, tackled: true, lineOut: true, tackler: { id: 'b', fullName: 'Bela' } }).at(-1)!;
    assert.equal(a.payload?.lineOut, true);
    assert.equal(a.payload?.raiderOut, false);
    assert.equal(a.payload?.touches, 0);
    assert.equal(a.attribution2, undefined);
  });
  test('editing a raid can take a line-out away again', () => {
    const s = play([raid('home', { defOut: 1 })]);
    assert.equal(s.home, 1);
    const head = s.events.find((e) => e.kind === 'raid')!;
    const acts = kb.raidActions(s, { side: 'home', touches: 0, bonus: false, tackled: false, editOf: head.id });
    const t = acts.reduce(kb.reducer, s);
    assert.equal(t.home, 0);
    assert.equal(kb.previewRaid(s, kb.formOutcome({ side: 'home', touches: 0, bonus: false, tackled: false }), head.id)?.defOutPts, undefined);
  });
});

describe('rules: extras without a time never expire; the merged order', () => {
  test('a yellow with no clock stays until a timed entry passes it', () => {
    const ex: ExtraOutcome[] = [{ x: 'card', side: 'away', card: 'yellow', player: true, eid: 2, minute: 3 }];
    const d = replayRaids([r('home', { touches: 1 }, 1), r('home', { touches: 1, minute: 6 } as Partial<RaidOutcome>, 3)], cfg(), ex);
    assert.deepEqual(d.order, [['r', 0], ['x', 0], ['r', 1]]);
    assert.equal(d.short.away, 0); // expired by the 6' raid
    assert.equal(d.perExtra[0].suspUntil, 5);
  });
});
