/**
 * SD-136 — Wave D volleyball + kabaddi:
 *  - kabaddi touches up to the defenders on the mat (6- / 7-touch raids, out
 *    count + all-out right);
 *  - kabaddi presets: super tackle / do-or-die as their own format keys (super
 *    tackle kept in every preset — AKFI / IKF), "Circle style" renamed, older
 *    formats still replay on `proRules`;
 *  - volleyball court size + sub limit from the format (9-a-side, beach);
 *  - FIVB Beach standings preset (2-1-0) and the beach default;
 *  - volleyball sanctions (FIVB 16 / 21): penalty = point + serve.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replayRaids, type RaidOutcome, type KabaddiCfg } from '../src/sports/kabaddi/rules.ts';
import * as kb from '../src/sports/kabaddi/engine.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { trackCourt, checkSub, liberoCue, rallyServers, courtSize, subLimitOf } from '../src/sports/volleyball/rotation.ts';
import { suggestSanction, barredPlayers, sanctionsOf } from '../src/sports/volleyball/sanctions.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { serveStats } from '../src/sports/serveStats.ts';
import { withNewTournamentPoints, standingsPresets, standingsConfigFromFormat, matchPoints } from '../src/data/standings.ts';
import { undoLabel } from '../src/sports/undoLabel.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Match } from '../src/core/types.ts';

type Side = 'home' | 'away';

// ------------------------------------------------------------- kabaddi --
const kcfg = (over: Partial<KabaddiCfg> = {}): KabaddiCfg => ({ teamSize: 7, style: 'sanjeevani', proRules: true, ...over });
const r = (side: Side, o: Partial<RaidOutcome> = {}): RaidOutcome => ({ side, touches: 0, bonus: false, raiderOut: false, v: 2, ...o });

describe('SD-136 kabaddi — touches above 5', () => {
  test('a 7-touch raid on a full mat: 7 points + all-out 2, and the defence revives', () => {
    const d = replayRaids([r('home', { touches: 7 })], kcfg());
    assert.equal(d.home, 9);
    assert.deepEqual(d.perRaid[0].allOuts, ['home']);
    assert.equal(d.perRaid[0].touchPts, 7);
    assert.equal(d.out.away, 0); // all-out → the whole side comes back
  });
  test('a 6-touch raid: 6 points, one defender left, no all-out', () => {
    const d = replayRaids([r('home', { touches: 6 })], kcfg());
    assert.equal(d.home, 6);
    assert.equal(d.out.away, 6);
    assert.equal(d.perRaid[0].allOuts.length, 0);
  });
  test('v2 touches are still capped at the defenders on the mat', () => {
    const d = replayRaids([r('home', { touches: 4 }), r('home', { touches: 7 })], kcfg());
    assert.equal(d.perRaid[1].touchPts, 3);
  });
  test('the chips run to the team size (min 5), never past 11', () => {
    assert.deepEqual(kb.touchChips(7, 7), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(kb.touchChips(7, 2), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(kb.touchChips(5, 5), [0, 1, 2, 3, 4, 5]);
    assert.equal(kb.touchChips(30, 30).length, 12);
  });
  test('through the reducer: a 7-touch raid action scores 9', () => {
    const s0 = kb.init({ playersPerSide: 7, style: 'sanjeevani', proRules: true });
    const s = kb.raidActions(s0, { side: 'home', touches: 7, bonus: false, tackled: false }).reduce(kb.reducer, s0);
    assert.equal(s.home, 9);
  });
});

describe('SD-136 kabaddi — super tackle / do-or-die keys', () => {
  // home raids 4 (away down to 3 on the mat), then a home raider is tackled
  const st = [r('home', { touches: 4 }), r('home', { raiderOut: true })];
  test('legacy proRules:false — no super tackle (older formats unchanged)', () => {
    assert.equal(replayRaids(st, kcfg({ proRules: false })).perRaid[1].superTackle, false);
  });
  test('superTackle:true wins over proRules:false', () => {
    const d = replayRaids(st, kcfg({ proRules: false, superTackle: true }));
    assert.equal(d.perRaid[1].superTackle, true);
    assert.equal(d.perRaid[1].tacklePts, 2);
  });
  test('superTackle:false turns it off under proRules', () => {
    assert.equal(replayRaids(st, kcfg({ superTackle: false })).perRaid[1].superTackle, false);
  });
  test('doOrDie:false — a 3rd empty raid is just empty', () => {
    const three = [r('home'), r('home'), r('home')];
    assert.equal(replayRaids(three, kcfg()).perRaid[2].doOrDieFail, true);
    assert.equal(replayRaids(three, kcfg({ doOrDie: false })).perRaid[2].doOrDieFail, false);
    assert.equal(replayRaids(three, kcfg({ proRules: false, doOrDie: true })).perRaid[2].doOrDieFail, true);
  });
  test('init stamps the keys only when the format carries them', () => {
    const old = kb.init({ playersPerSide: 7, proRules: false });
    assert.equal('superTackle' in old, false);
    assert.equal('doOrDie' in old, false);
    const school = kb.init({ playersPerSide: 7, superTackle: true, doOrDie: false });
    assert.equal(school.superTackle, true);
    assert.equal(school.doOrDie, false);
    assert.deepEqual(kb.kabaddiCfg(school), { teamSize: 7, style: 'sanjeevani', proRules: true, superTackle: true, doOrDie: false });
  });
});

// ---------------------------------------------------------- volleyball --
const P = (id: string, name: string) => ({ id, name });
const nine = Array.from({ length: 9 }, (_, i) => P(`h${i + 1}`, `Home ${i + 1}`));
const nineA = Array.from({ length: 9 }, (_, i) => P(`a${i + 1}`, `Away ${i + 1}`));
const play = (acts: ScoreAction[], cfg?: Record<string, unknown>) => acts.reduce(vb.reducer, vb.init(cfg));
const pt = (side: Side, kind: vb.VbOutcome = 'attack'): ScoreAction => vb.outcomeAction(kind, side);
const pts = (side: Side, n: number) => Array.from({ length: n }, () => pt(side));
const INDOOR = { preset: 'indoor', playersPerSide: 6, substitutes: 6, setsToWin: 3, pointsPerSet: 25, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 2 };
const BEACH = { preset: 'beach', playersPerSide: 2, substitutes: 0, setsToWin: 2, pointsPerSet: 21, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 1 };
const NINE = { preset: 'nineaside', playersPerSide: 9, substitutes: 3, setsToWin: 2, pointsPerSet: 21, deciderPoints: 15, winByTwo: true, timeoutsPerSet: 2 };

describe('SD-136 volleyball — court size + sub limit from the format', () => {
  test('stamps only when not the indoor 6 / 6', () => {
    const i = vb.init(INDOOR);
    assert.equal('subLimit' in i, false);
    assert.equal('courtSize' in i, false);
    assert.equal('subLimit' in vb.init(), false);
    const b = vb.init(BEACH);
    assert.equal(b.subLimit, 0);
    assert.equal('courtSize' in b, false);
    assert.equal(courtSize(b), 2);
    const n = vb.init(NINE);
    assert.equal(n.courtSize, 9);
    assert.equal(subLimitOf(n), 3);
  });
  test('9-a-side: a serving order of 9 moves on every side-out; no libero cue', () => {
    const s = play([
      { type: 'SET_SERVE', payload: { side: 'home' } },
      { type: 'SET_ROTATION', payload: { team: 'home', players: nine } },
      { type: 'SET_ROTATION', payload: { team: 'away', players: nineA, liberos: [] } },
      pt('home'), pt('away'), pt('home'),
    ], NINE);
    const t = trackCourt(s);
    assert.equal(t.court.home!.length, 9);
    assert.equal(t.server?.id, 'h2'); // home won the serve back → the 2nd server
    assert.equal(liberoCue(s, 'home', t), null);
  });
  test('the 4th regular sub of a 3-sub format is over the limit', () => {
    let s = play([{ type: 'SET_SERVE', payload: { side: 'home' } }, { type: 'SET_ROTATION', payload: { team: 'home', players: nine } }], NINE);
    const bench = [P('b1', 'B1'), P('b2', 'B2'), P('b3', 'B3'), P('b4', 'B4')];
    for (let i = 0; i < 3; i++) s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: nine[i], on: bench[i] } });
    const c = checkSub(s, 'home', nine[3], bench[3]);
    assert.equal(c.overLimit, true);
    assert.match(c.issues[0], /only 3 per set \(this format\)/);
    // indoor still says FIVB 15.6 at 6
    assert.equal(checkSub(vb.init(INDOOR), 'home', nine[0], bench[0]).overLimit, false);
  });
});

describe('SD-136 volleyball — sanctions (FIVB 16 / 21)', () => {
  const H6 = Array.from({ length: 6 }, (_, i) => P(`h${i + 1}`, `Home ${i + 1}`));
  const A6 = Array.from({ length: 6 }, (_, i) => P(`a${i + 1}`, `Away ${i + 1}`));
  const tracked: ScoreAction[] = [
    { type: 'SET_SERVE', payload: { side: 'home' } },
    { type: 'SET_ROTATION', payload: { team: 'home', players: H6 } },
    { type: 'SET_ROTATION', payload: { team: 'away', players: A6 } },
  ];
  const conduct = (side: Side, level: string, extra: Record<string, unknown> = {}): ScoreAction => ({ type: 'CONDUCT', side, payload: { vb: level, ...extra } });

  test('a penalty gives the opponent the point and the serve (side-out rotation)', () => {
    const s = play([...tracked, pt('home'), conduct('home', 'penalty', { playerId: 'h3', playerName: 'Home 3', reason: 'Rude conduct' })]);
    assert.deepEqual(s.current, { home: 1, away: 1 });
    const e = s.events.at(-1)!;
    assert.equal(e.side, 'away');
    assert.equal(e.kind, 'point');
    assert.equal(e.playerName, undefined); // nobody on the scoring side is credited
    assert.equal(e.pen?.by, 'home');
    assert.equal(vb.servingSide(s), 'away');
    assert.equal(trackCourt(s).server?.id, 'a2'); // away rotated on winning the serve
  });
  test('warning / expulsion / delay warning: records only, no score', () => {
    const s = play([...tracked, conduct('away', 'warning'), conduct('home', 'expulsion', { playerId: 'h2', playerName: 'Home 2' }), conduct('home', 'delayWarning')]);
    assert.deepEqual(s.current, { home: 0, away: 0 });
    assert.deepEqual(s.events.map((e) => e.kind), ['conduct', 'conduct', 'conduct']);
    assert.equal(s.events[1].vs?.level, 'expulsion');
  });
  test('a delay penalty can win the set', () => {
    const s = play([...pts('home', 24), conduct('away', 'delayPenalty')], { setsToWin: 2 });
    assert.deepEqual(s.sets, [[25, 0]]);
    assert.equal(s.events.at(-1)!.label, 'Set 1 won');
  });
  test('the suggestion: delays warn then penalise; misconduct warning → penalty → expulsion → DQ', () => {
    let s = play([]);
    assert.equal(suggestSanction(s.events, 'home', 'delay'), 'delayWarning');
    s = vb.reducer(s, conduct('home', 'delayWarning'));
    assert.equal(suggestSanction(s.events, 'home', 'delay'), 'delayPenalty');
    assert.equal(suggestSanction(s.events, 'away', 'delay'), 'delayWarning');
    assert.equal(suggestSanction(s.events, 'home', 'misconduct'), 'warning');
    s = vb.reducer(s, conduct('home', 'warning'));
    assert.equal(suggestSanction(s.events, 'home', 'misconduct', 'h1'), 'penalty');
    s = vb.reducer(s, conduct('home', 'penalty', { playerId: 'h1', playerName: 'Home 1' }));
    assert.equal(suggestSanction(s.events, 'home', 'misconduct', 'h1'), 'expulsion');
    s = vb.reducer(s, conduct('home', 'expulsion', { playerId: 'h1', playerName: 'Home 1' }));
    assert.equal(suggestSanction(s.events, 'home', 'misconduct', 'h1'), 'disqualification');
  });
  test('expelled: barred for the set (checkSub warns); disqualified: for the match', () => {
    let s = play([...tracked, conduct('home', 'expulsion', { playerId: 'h2', playerName: 'Home 2' })]);
    assert.deepEqual(barredPlayers(s.events, 'home', 1).map((b) => b.id), ['h2']);
    s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: H6[1], on: P('h7', 'Bench') } });
    assert.match(checkSub(s, 'home', P('h7', 'Bench'), H6[1]).issues.join(' '), /expelled/);
    s = play([...pts('home', 25), conduct('away', 'disqualification', { playerId: 'a1', playerName: 'Away 1' })], { setsToWin: 2 });
    assert.equal(barredPlayers(s.events, 'away', 2)[0].why, 'disqualification');
    assert.equal(barredPlayers(s.events, 'away', 3).length, 1);
  });
  test('a timeline correction keeps the penalty a penalty and the records in place', () => {
    const s = play([...tracked, pt('home'), conduct('home', 'warning'), conduct('home', 'penalty', { playerId: 'h3', playerName: 'Home 3' }), pt('home')]);
    const fixed = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(fixed.current, s.current);
    assert.deepEqual(fixed.events.map((e) => [e.kind, e.label]), s.events.map((e) => [e.kind, e.label]));
    assert.equal(sanctionsOf(fixed.events).length, 2);
  });
  test('serve stats leave the penalty out of the rallies', () => {
    const s = play([...tracked, pt('home'), conduct('home', 'penalty'), pt('away')]);
    assert.equal(rallyServers(s).length, 2);
    const st = serveStats('volleyball', s);
    assert.equal(st?.match.rallies, 2);
  });
  test('Undo names the sanction', () => {
    const prev = play(tracked);
    const next = vb.reducer(prev, conduct('home', 'penalty', { playerName: 'Home 3' }));
    assert.match(undoLabel({ type: 'CONDUCT', prev, next }, { home: 'Hawks', away: 'Owls' }) ?? '', /sanction · penalty · Home 3/);
  });
  test('an older log has no sanction keys and EDIT_LOG is untouched', () => {
    const s = play([...pts('home', 3), { type: 'TIMEOUT', side: 'away' }, ...pts('away', 2)]);
    const fixed = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.equal(fixed.events.some((e) => e.kind === 'timeout'), false); // as before: a correction drops timeouts
    assert.equal(s.events.some((e) => e.vs || e.pen), false);
  });
});

describe('SD-136 standings — FIVB Beach (2-1-0)', () => {
  test('offered next to FIVB 3-3-2-1', () => {
    assert.deepEqual(standingsPresets('volleyball').map((p) => p.id).slice(0, 2), ['fivb', 'fivb-beach']);
  });
  test('a new beach tournament starts on the beach table; indoor keeps FIVB; an own pick stays', () => {
    const b = withNewTournamentPoints('volleyball', { preset: 'beach' } as Record<string, unknown>);
    assert.equal(b.winPoints, 2);
    assert.equal(b.lossPoints, 1);
    assert.equal(b.setPoints, '');
    assert.equal(withNewTournamentPoints('volleyball', { preset: 'indoor' } as Record<string, unknown>).winPoints, 3);
    const own = withNewTournamentPoints('volleyball', { preset: 'beach', winPoints: 3, drawPoints: 1, lossPoints: 0, tieBreak: 'h2h' } as Record<string, unknown>);
    assert.equal(own.winPoints, 3);
  });
  test('a 2-1 beach loss is worth 1, a walkover loss 0', () => {
    const cfg = standingsConfigFromFormat('volleyball', withNewTournamentPoints('volleyball', { preset: 'beach' } as Record<string, unknown>));
    const m = { sport: 'volleyball', winner: 'home', homeScore: 2, awayScore: 1, status: 'completed' } as unknown as Match;
    assert.deepEqual(matchPoints(m, cfg), { home: 2, away: 1 });
    assert.deepEqual(matchPoints({ ...m, walkover: true } as Match, cfg), { home: 2, away: 0 });
  });
});
