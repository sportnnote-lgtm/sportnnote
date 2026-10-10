/**
 * SD-117b — volleyball & kabaddi scorer follow-ups (scorer-ux-audit-sports.md).
 *  Volleyball: serving side derived from the rallies, set / match point chip,
 *  "Opp. fault" type + erring opponent (→ `errors`, keyed coverage), beach
 *  timeouts + technical timeout, switch-sides cue.
 *  Kabaddi: clock PAUSE / RESUME, team timeouts, substituted player returns
 *  (format flag), tackle type, expected raider, who is out.
 * Every reducer change is a new action / optional key: old logs keep their shape.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as vb from '../src/sports/volleyball/engine.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { volleyballStats } from '../src/sports/volleyball/stats.ts';
import { pointInputs, correctionActions, type PointInput } from '../src/sports/rallyEdit.ts';
import { pointPressure } from '../src/sports/pointStatus.ts';
import { trackedIn } from '../src/sports/statSchema.ts';
import * as kb from '../src/sports/kabaddi/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const A = { id: 'h1', fullName: 'Asha' };
const B = { id: 'a1', fullName: 'Bela' };
const vplay = (acts: ScoreAction[], cfg?: Record<string, unknown>) => acts.reduce(vb.reducer, vb.init(cfg));
const pts = (side: Side, n: number, kind: vb.VbOutcome = 'attack'): ScoreAction[] => Array.from({ length: n }, () => vb.outcomeAction(kind, side));

describe('SD-117b volleyball — format keys', () => {
  test('init adds nothing for an indoor format without the key (old states keep their shape)', () => {
    const s = vb.init({ setsToWin: 2, pointsPerSet: 21 });
    assert.equal('timeoutsPerSet' in s, false);
    assert.equal('beach' in s, false);
    assert.equal(vb.timeoutsPerSet(s), 2);
  });
  test('Beach preset: 1 timeout per set and beach rules; explicit key wins', () => {
    const b = vb.init({ preset: 'beach', playersPerSide: 2, timeoutsPerSet: 1 });
    assert.equal(b.timeoutsPerSet, 1);
    assert.equal(b.beach, true);
    assert.equal(vb.init({ preset: 'beach' }).timeoutsPerSet, 1); // older beach config, no key
    assert.equal(vb.init({ timeoutsPerSet: 3 }).timeoutsPerSet, 3);
  });
});

describe('SD-117b volleyball — serving side', () => {
  test('unknown at the start; the rally winner serves next', () => {
    let s = vb.init();
    assert.equal(vb.servingSide(s), null);
    s = vplay([...pts('home', 1), ...pts('away', 1)]);
    assert.equal(vb.servingSide(s), 'away');
  });
  test('set 2 opens with the side that received first in set 1 (known from an ace)', () => {
    const s = vplay([vb.outcomeAction('ace', 'home'), ...pts('home', 24)]);
    assert.equal(s.sets.length, 1);
    assert.equal(vb.servingSide(s), 'away');
    // known from a serve error: the side that got the point received
    const t = vplay([vb.outcomeAction('serveerror', 'away'), ...pts('home', 25)]);
    assert.equal(vb.servingSide(t), 'away');
  });
  test('the decider is a fresh toss', () => {
    const s = vplay([vb.outcomeAction('ace', 'home'), ...pts('home', 24), ...pts('away', 25)]);
    assert.equal(vb.isDecider(s), true);
    assert.equal(vb.servingSide(s), null);
  });
});

describe('SD-117b volleyball — set / match point', () => {
  test('pointPressure flags SET POINT then MATCH POINT', () => {
    const s = vplay(pts('home', 24));
    assert.deepEqual(pointPressure(vb.reducer, s, { unit: 'set' }), [{ side: 'home', kind: 'SET POINT' }]);
    const m = vplay([...pts('home', 25), ...pts('home', 24)]);
    assert.deepEqual(pointPressure(vb.reducer, m, { unit: 'set' }), [{ side: 'home', kind: 'MATCH POINT' }]);
  });
});

describe('SD-117b volleyball — "Opp. fault" detail', () => {
  test('type + erring opponent ride on the event; the opponent is charged one error', () => {
    const a = vb.outcomeAction('opperror', 'home', undefined, { err: 'net', by: B });
    assert.deepEqual(a.payload, { err: 'net' });
    assert.deepEqual(a.attribution2, { playerId: 'a1', stat: 'errors', playerName: 'Bela' });
    assert.equal(a.attribution, undefined);
    const s = vplay([a]);
    const e = s.events[0];
    assert.equal(e.kind, 'opperror');
    assert.deepEqual(e.oe, { type: 'net', playerName: 'Bela', playerId: 'a1' });
    assert.equal(e.playerName, undefined); // nobody on the scoring side is credited
    assert.match(e.detail ?? '', /Net touch · Bela/);
  });
  test('a plain fault (no detail) logs exactly as before', () => {
    const s = vplay([vb.outcomeAction('opperror', 'home')]);
    assert.equal('oe' in s.events[0], false);
    assert.equal(s.events[0].detail, '1-0');
  });
  test('the replayed log form (_attr2 in the payload) reads the same', () => {
    const s = vplay([{ type: 'OPP_ERROR', side: 'home', payload: { err: 'foot', _attr2: { playerId: 'a1', stat: 'errors', playerName: 'Bela' } } }]);
    assert.deepEqual(s.events[0].oe, { type: 'foot', playerName: 'Bela', playerId: 'a1' });
  });
  test('statTotals: errors on every line of a match that named one; absent otherwise', () => {
    const ctx = { players: { home: [{ id: 'h1', name: 'Asha' }], away: [{ id: 'a1', name: 'Bela' }, { id: 'a2', name: 'Cara' }] } };
    const s = vplay([vb.outcomeAction('attack', 'home', A), vb.outcomeAction('opperror', 'home', undefined, { by: B }), vb.outcomeAction('attack', 'away', { id: 'a2', fullName: 'Cara' })]);
    const t = volleyballStatTotals(s, ctx);
    assert.equal(t.a1.stats.errors, 1);
    assert.equal(t.a1.side, 'away');
    assert.equal(t.h1.stats.errors, 0);
    assert.equal(t.a2.stats.errors, 0);
    const plain = volleyballStatTotals(vplay([vb.outcomeAction('attack', 'home', A), vb.outcomeAction('opperror', 'home')]), ctx);
    assert.equal(Object.values(plain).some((l) => 'errors' in l.stats), false);
  });
  test('coverage: errors is keyed — an old line reads "not tracked"', () => {
    assert.equal(trackedIn(volleyballStats, { stats: { points: 3 } } as never, 'errors'), false);
    assert.equal(trackedIn(volleyballStats, { stats: { points: 3, errors: 0 } } as never, 'errors'), true);
  });
  test('a timeline correction keeps the fault detail and reconciles errors', () => {
    const s = vplay([vb.outcomeAction('opperror', 'home', undefined, { err: 'rotation', by: B }), ...pts('away', 2)]);
    const list = pointInputs(s.events);
    assert.deepEqual(list[0].oe, { type: 'rotation', playerName: 'Bela', playerId: 'a1' });
    // remove one of the away points: the fault survives the replay
    const edited: PointInput[] = [list[0], list[1]];
    const [edit, ...adj] = correctionActions(list, edited, () => undefined, vb.volleyballCredits);
    const r = vb.reducer(s, edit);
    assert.deepEqual(r.events[0].oe, { type: 'rotation', playerName: 'Bela', playerId: 'a1' });
    assert.deepEqual(adj, []);
    // drop the fault: Bela's error is taken back
    const [, ...adj2] = correctionActions(list, [list[1], list[2]], () => undefined, vb.volleyballCredits);
    assert.deepEqual(adj2.map((a) => [a.attribution?.playerId, a.attribution?.stat, a.attribution?.by]), [['a1', 'errors', -1]]);
  });
});

describe('SD-117b volleyball — cues', () => {
  test('beach: switch sides every 7 points (5 in the decider), technical timeout at 21', () => {
    const cfg = { preset: 'beach', setsToWin: 2, pointsPerSet: 21 };
    assert.match(vb.switchSidesDue(vplay([...pts('home', 4), ...pts('away', 3)], cfg)) ?? '', /7 points/);
    assert.equal(vb.switchSidesDue(vplay(pts('home', 6), cfg)), null);
    const s21 = vplay([...pts('home', 11), ...pts('away', 10)], cfg);
    assert.equal(vb.technicalTimeoutDue(s21), true);
    assert.equal(vb.technicalTimeoutDue(vplay(pts('home', 20), cfg)), false);
    const dec = vplay([...pts('home', 21), ...pts('away', 21), ...pts('home', 5)], cfg);
    assert.equal(vb.isDecider(dec), true);
    assert.match(vb.switchSidesDue(dec) ?? '', /5 points/);
  });
  test('indoor: only in the decider, when a side reaches 8', () => {
    const cfg = { setsToWin: 2 };
    assert.equal(vb.switchSidesDue(vplay(pts('home', 8), cfg)), null);
    const base = [...pts('home', 25), ...pts('away', 25)];
    assert.match(vb.switchSidesDue(vplay([...base, ...pts('away', 3), ...pts('home', 8)], cfg)) ?? '', /8 points/);
    assert.equal(vb.switchSidesDue(vplay([...base, ...pts('home', 8), ...pts('away', 1)], cfg)), null);
  });
});

// ---------------------------------------------------------------- kabaddi
const CFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, substitutes: 3 };
const kplay = (acts: ScoreAction[], cfg: Record<string, unknown> = CFG) => acts.reduce(kb.reducer, kb.init(cfg));
const raid = (side: Side, o: Partial<kb.RaidForm> = {}, s?: kb.KabaddiState): ScoreAction =>
  kb.raidActions(s ?? kb.init(CFG), { side, touches: 0, bonus: false, tackled: false, ...o }).find((a) => a.type === 'RAID_OUTCOME')!;

describe('SD-117b kabaddi — clock pause / resume', () => {
  test('a paused clock holds; resume carries on from the pause', () => {
    const t0 = Date.now() - 10 * 60000; // kicked off 10 minutes ago
    let s = kplay([{ type: 'KICKOFF', payload: { at: t0 } }, { type: 'PAUSE', payload: { at: t0 + 4 * 60000 } }]);
    assert.equal(kb.clockPaused(s), true);
    assert.equal(kb.currentMinute(s), 4);
    s = kb.reducer(s, { type: 'RESUME', payload: { at: t0 + 9 * 60000 } }); // 5 minutes stopped
    assert.equal(kb.clockPaused(s), false);
    assert.equal('pausedAt' in s, false);
    assert.equal(s.startedAt, t0 + 5 * 60000);
    assert.equal(kb.currentMinute(s), 5);
  });
  test('half time / full time clear the pause; a double PAUSE is a no-op', () => {
    let s = kplay([{ type: 'KICKOFF', payload: { at: 1 } }, { type: 'PAUSE', payload: { at: 2 } }]);
    assert.equal(kb.reducer(s, { type: 'PAUSE', payload: { at: 9 } }), s);
    s = kb.reducer(s, { type: 'NEXT_HALF' });
    assert.equal('pausedAt' in s, false);
    assert.equal(s.startedAt, undefined);
  });
  test('old logs never touch the new key', () => {
    const s = kplay([{ type: 'KICKOFF', payload: { at: 1 } }, raid('home', { touches: 1 }), { type: 'NEXT_HALF' }, { type: 'END' }]);
    assert.equal('pausedAt' in s, false);
    assert.equal('subReturn' in kb.init(CFG), false);
  });
});

describe('SD-117b kabaddi — team timeouts', () => {
  test('2 per team per half, a non-scoring timeline marker; removable', () => {
    const to = (side: Side): ScoreAction => ({ type: 'TIMEOUT', side, payload: { minute: 5, half: 1 } });
    const s = kplay([to('home'), to('home'), to('home'), to('away')]);
    assert.equal(kb.timeoutsUsed(s, 'home'), 2);
    assert.equal(kb.timeoutsUsed(s, 'away'), 1);
    assert.equal(s.home + s.away, 0);
    const r = kb.reducer(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: s.events[0].id, v: 2 } });
    assert.equal(kb.timeoutsUsed(r, 'home'), 1);
  });
});

describe('SD-117b kabaddi — a substituted player may return (format flag)', () => {
  const sub = (off: string, on: string): ScoreAction => ({ type: 'SUB', side: 'home', payload: { offName: off, onName: on } });
  test('flag on: back on within the limit; can score again; undo sends them back off', () => {
    const cfg = { ...CFG, subReturn: true };
    let s = kplay([sub('Ravi', 'Dev'), sub('Dev', 'Ravi')], cfg);
    assert.deepEqual(s.subbedOff.home, ['Dev']);
    assert.equal(s.subsUsed.home, 2);
    assert.match(s.events[1].label, /returns/);
    s = kb.reducer(s, { type: 'RAID', side: 'home', attribution: { playerId: 'h1', stat: 'raidPoints', playerName: 'Ravi' } });
    assert.equal(s.home, 1);
    const undone = kb.reducer(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: 2, v: 2 } });
    assert.deepEqual([...undone.subbedOff.home].sort(), ['Ravi']);
  });
  test('flag off (older formats): takes no further part, as before', () => {
    const s = kplay([sub('Ravi', 'Dev'), sub('Dev', 'Ravi')]);
    assert.deepEqual(s.subbedOff.home, ['Ravi', 'Dev']);
  });
});

describe('SD-117b kabaddi — tackle type, expected raider, who is out', () => {
  test('tackle type rides on a tackled raid only and labels the tackle line', () => {
    const a = raid('home', { tackled: true, tackleType: 'ankle', raider: { id: 'h1', fullName: 'Ravi' } });
    assert.equal(a.payload?.tackleType, 'ankle');
    const s = kplay([a]);
    const t = s.events.find((e) => e.kind === 'tackle')!;
    assert.match(t.label, /Tackle \+1 \(ankle hold\)/);
    assert.equal(raid('home', { tackled: false, tackleType: 'ankle' }).payload?.tackleType, undefined);
    assert.equal('tackleType' in kplay([raid('home', { tackled: true })]).events.find((e) => e.kind === 'tackle')!, false);
  });
  test('raids alternate; the next half opens with the other side', () => {
    let s = kb.init(CFG);
    assert.equal(kb.expectedRaider(s), null);
    s = kb.reducer(s, { ...raid('home'), payload: { ...raid('home').payload, minute: 1, half: 1 } });
    assert.equal(kb.expectedRaider(s), 'away');
    s = kb.reducer(s, { type: 'NEXT_HALF' });
    assert.equal(kb.expectedRaider(s), 'away');
  });
  test('a tackled raider is out until revived (first out, first in)', () => {
    let s = kb.init(CFG);
    s = kb.reducer(s, raid('home', { tackled: true, raider: { id: 'h1', fullName: 'Ravi' } }, s));
    assert.deepEqual(kb.outPlayers(s).home, ['Ravi']);
    s = kb.reducer(s, raid('home', { touches: 1, raider: { id: 'h2', fullName: 'Dev' } }, s)); // revives Ravi
    assert.deepEqual(kb.outPlayers(s).home, []);
  });
});
