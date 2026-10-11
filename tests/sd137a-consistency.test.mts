/**
 * SD-137a — the live-scoring consistency sweep:
 *   • voice for hockey, handball, carrom, golf match play (+ kabaddi cards /
 *     technical points), the same actions and credits as the buttons;
 *   • every voice call that ends a period / the match is flagged for the
 *     ConfirmSheet (sport `ends`, or any call that would complete the match);
 *   • hockey backfill: a past-minute stamp lands at that minute, clock untouched;
 *   • carrom + golf match-play records hooks;
 *   • leaderboard split chips for every match sport, keyed per format.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Player, Match, StatLine, SportId } from '../src/core/types.ts';
import type { ScoreAction, VoiceContext } from '../src/sports/types.ts';
import {
  hockeyVoice, hockeyVoiceEnds, handballVoice, handballVoiceEnds, carromVoice, carromVoiceEnds, golfMatchVoice, kabaddiVoice,
} from '../src/sports/voiceParsers.ts';
import { completesMatch, numbersFromText, voiceEnding, withoutTeams } from '../src/sports/voiceMatch.ts';
import * as hockey from '../src/sports/hockey/engine.ts';
import * as handball from '../src/sports/handball/engine.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import * as kabaddi from '../src/sports/kabaddi/engine.ts';
import { initGolfMatch, golfMatchReducer, type GolfMatchState } from '../src/sports/golf/match.ts';
import { setupMatchStrokes } from '../src/sports/golf/matchStrokes.ts';
import { standardPar72 } from '../src/sports/golf/engine.ts';
import { carromMatchRecords, golfMatchRecords, MATCH_RECORD_HOOKS } from '../src/sports/matchRecordHooks.ts';
import { MATCH_RECORD_TYPES } from '../src/sports/matchRecords.ts';
import { tournamentRecords } from '../src/data/tournamentRecords.ts';
import { statSchema } from '../src/sports/statSchemas.ts';
import { contextsFor, scopeBySplits } from '../src/data/lineContext.ts';

const P = (id: string, fullName: string, jerseyNo?: number) => ({ id, fullName, sports: [], ...(jerseyNo ? { jerseyNo } : {}) }) as unknown as Player;
const HOME = [P('h1', 'Asha Rao', 7), P('h2', 'Meera Khan', 9), P('hk', 'Tara Iyer', 1)];
const AWAY = [P('a1', 'Divya Nair', 10), P('a2', 'Leela Menon', 4), P('ak', 'Kavya Das', 1)];
const ctxOf = (state: unknown, now = 1_000_000, names = { homeName: 'Red House', awayName: 'Blue House' }): VoiceContext =>
  ({ state, ...names, homeRoster: HOME, awayRoster: AWAY, now });
const run = <S,>(reducer: (s: S, a: ScoreAction) => S, s: S, acts: ScoreAction[] | null) => (acts ?? []).reduce(reducer, s);

/* ------------------------------------------------------------------ helpers */

describe('voice helpers', () => {
  test('numbersFromText reads digits and words in order', () => {
    assert.deepEqual(numbersFromText('Rao 4 Khan five'), [4, 5]);
    assert.deepEqual(numbersFromText('strokes four 5'), [4, 5]);
    assert.deepEqual(numbersFromText('no numbers here'), []);
  });
  test('withoutTeams: a house called Red / Yellow is never a card colour', () => {
    assert.equal(withoutTeams('Red House shot Rao', { homeName: 'Red House', awayName: 'Blue House' }), 'shot rao');
  });
  test('voiceEnding: the sport first, else a call that completes the match', () => {
    const v = { ends: () => ({ action: 'endPeriod' as const, period: 'Q1' }) };
    assert.deepEqual(voiceEnding(v, [], null), { action: 'endPeriod', period: 'Q1' });
    assert.deepEqual(voiceEnding({}, [], null, () => true), { action: 'fullTime' });
    assert.equal(voiceEnding({}, [], null, () => false), null);
    assert.equal(voiceEnding({ ends: () => { throw new Error('x'); } }, [], null), null);
  });
});

/* ------------------------------------------------------------------- hockey */

describe('hockey voice', () => {
  const live = () => {
    let s = hockey.init({ periods: 4, periodMinutes: 15 });
    s = hockey.reducer(s, { type: 'CLOCK', payload: { run: true, at: 1_000_000 - 300_000 } }); // 5 min played
    return s;
  };
  test('goal + assist, stamped at the heard game-clock second', () => {
    const s = live();
    const acts = hockeyVoice('PC goal Rao assist Khan', ctxOf(s))!;
    assert.equal(acts.length, 1);
    const a = acts[0];
    assert.equal(a.type, 'GOAL');
    assert.equal(a.side, 'home');
    assert.equal(a.payload?.goalType, 'pc');
    assert.equal(a.payload?.sec, 300);
    assert.equal(a.attribution?.playerId, 'h1');
    assert.equal(a.attribution2?.playerId, 'h2');
    const after = run(hockey.reducer, s, acts);
    assert.equal(after.home, 1);
    assert.equal(after.events.at(-1)?.sec, 300);
  });
  test('shot saved → shot on goal + the other keeper\'s linked save; shot alone is off target', () => {
    const s = live();
    const acts = hockeyVoice('shot saved Nair', ctxOf(s))!;
    assert.deepEqual(acts.map((a) => [a.type, a.side]), [['SHOT', 'away'], ['SAVE', 'home']]);
    assert.equal(acts[1].payload?.ref, acts[0].payload?.uid);
    assert.equal(hockeyVoice('shot Nair', ctxOf(s))![0].payload?.onGoal, false);
  });
  test('cards: green 2′, yellow 5′ / 10′, red; a house called Red is not a card', () => {
    const s = live();
    assert.equal(hockeyVoice('green card Rao', ctxOf(s))![0].payload?.minutes, 2);
    assert.equal(hockeyVoice('yellow card ten Rao', ctxOf(s))![0].payload?.minutes, 10);
    assert.equal(hockeyVoice('yellow card Rao', ctxOf(s))![0].payload?.minutes, 5);
    assert.equal(hockeyVoice('red card Nair', ctxOf(s))![0].payload?.card, 'red');
    const redHouse = hockeyVoice('Red House shot', ctxOf(s))!;
    assert.equal(redHouse[0].type, 'SHOT');
  });
  test('penalty corner, circle entry; nothing before the push-back', () => {
    const s = live();
    assert.equal(hockeyVoice('penalty corner home', ctxOf(s))![0].type, 'PC');
    assert.equal(hockeyVoice('circle away', ctxOf(s))![0].type, 'CIRCLE');
    assert.equal(hockeyVoice('goal Rao', ctxOf(hockey.init({}))), null);
  });
  test('end quarter asks (period); "full time" only in the last period, as full time', () => {
    const s = live();
    const end = hockeyVoice('end quarter', ctxOf(s))!;
    assert.equal(end[0].type, 'END_PERIOD');
    assert.deepEqual(hockeyVoiceEnds(end, s), { action: 'endPeriod', period: hockey.periodName(s, 1), score: '0-0' });
    assert.equal(hockeyVoice('full time', ctxOf(s)), null);
    const q4 = { ...s, period: 4 };
    assert.equal(hockeyVoiceEnds(hockeyVoice('full time', ctxOf(q4))!, q4)?.action, 'fullTime');
    assert.equal(hockeyVoiceEnds([{ type: 'GOAL', side: 'home' }], s), null);
  });
  test('backfill: an event stamped at a past minute lands there and never stops the clock', () => {
    let s = live();
    s = hockey.reducer(s, { type: 'GOAL', side: 'away', payload: { goalType: 'field', uid: 'bf1', at: 1_000_000, sec: 150, period: 1, edit: true } });
    assert.equal(s.away, 1);
    assert.equal(s.events.at(-1)?.sec, 150);
    assert.ok(hockey.running(s), 'the clock keeps running');
  });
});

/* ----------------------------------------------------------------- handball */

describe('handball voice', () => {
  const live = () => handball.reducer(handball.init({ periods: 2, periodMinutes: 30 }), { type: 'CLOCK', payload: { run: true, at: 1_000_000 - 600_000 } });
  test('goal types: wing + assist, 7 m (no assist), default 9 m', () => {
    const s = live();
    const w = handballVoice('wing goal Rao assist Khan', ctxOf(s))![0];
    assert.equal(w.payload?.shotType, 'wing');
    assert.equal(w.attribution2?.playerId, 'h2');
    const seven = handballVoice('7 m goal Rao assist Khan', ctxOf(s))![0];
    assert.equal(seven.payload?.shotType, 'sevenM');
    assert.equal(seven.attribution2, undefined);
    assert.equal(handballVoice('goal Nair', ctxOf(s))![0].payload?.shotType, 'nineM');
    assert.equal(run(handball.reducer, s, handballVoice('goal Nair', ctxOf(s))).away, 1);
  });
  test('a saved 7 m → the miss + the other keeper\'s save, linked', () => {
    const s = live();
    const acts = handballVoice('7 m saved Rao', ctxOf(s))!;
    assert.deepEqual(acts.map((a) => [a.type, a.side, a.payload?.result ?? null]), [['MISS', 'home', 'saved'], ['SAVE', 'away', null]]);
    assert.equal(acts[1].payload?.ref, acts[0].payload?.uid);
  });
  test('sanctions: yellow, two minutes (third = red), red; time-out; turnover', () => {
    let s = live();
    assert.equal(handballVoice('yellow Rao', ctxOf(s))![0].payload?.card, 'yellow');
    for (let i = 0; i < 2; i++) s = run(handball.reducer, s, handballVoice('two minutes Rao', ctxOf(s)));
    assert.equal(handballVoice('two minutes Rao', ctxOf(s))![0].payload?.third, true);
    assert.equal(handballVoice('time out home', ctxOf(s))![0].type, 'TIMEOUT');
    assert.equal(handballVoice('turnover Nair', ctxOf(s))![0].type, 'TURNOVER');
  });
  test('end half / full time — as the button (level with extra time to play = a period end)', () => {
    const s = live();
    assert.deepEqual(handballVoiceEnds(handballVoice('end half', ctxOf(s))!, s)?.action, 'endPeriod');
    assert.equal(handballVoice('full time', ctxOf(s)), null);
    const h2 = { ...s, period: 2, home: 20, away: 18 };
    assert.equal(handballVoiceEnds(handballVoice('full time', ctxOf(h2))!, h2)?.action, 'fullTime');
    const level = { ...h2, away: 20, decider: 'et' as const };
    assert.equal(handballVoice('full time', ctxOf(level)), null, 'level with extra time → not full time');
    assert.equal(handballVoiceEnds(handballVoice('end half', ctxOf(level))!, level)?.action, 'endPeriod');
  });
});

/* ------------------------------------------------------------------- carrom */

describe('carrom voice', () => {
  const s0 = () => carrom.reducer(carrom.init({}), { type: 'FIRST_BREAK', payload: { side: 'home' } });
  test('board: coins must be said; queen; credit capped like the buttons', () => {
    const s = s0();
    assert.equal(carromVoice('board home', ctxOf(s)), null, 'no coins → nothing');
    const a = carromVoice('board home 5 queen', ctxOf(s))![0];
    assert.deepEqual([a.type, a.side, a.payload?.coins, a.payload?.queen], ['BOARD', 'home', 5, true]);
    assert.equal(a.attribution?.playerId, 'h1');
    assert.equal(a.attribution?.by, 8);
    assert.equal(run(carrom.reducer, s, [a]).current.home, 8);
  });
  test('slam colour from who broke; penalty board', () => {
    const s = s0();
    assert.equal(carromVoice('board home 9 slam', ctxOf(s))![0].payload?.slam, 'white');
    assert.equal(carromVoice('board away 9 slam', ctxOf(s))![0].payload?.slam, 'black');
    const pen = carromVoice('penalty away', ctxOf(s))![0];
    assert.equal(pen.payload?.penalty, true);
    assert.equal(pen.attribution?.by, carrom.PENALTY_POINTS);
  });
  test('a board that closes a game / the match is flagged', () => {
    let s = carrom.init({ target: 25, gamesToWin: 2 });
    s = { ...s, current: { home: 22, away: 0 } };
    const close = carromVoice('board home 5', ctxOf(s))!;
    assert.deepEqual(carromVoiceEnds(close, s), { action: 'endPeriod', period: 'game 1' });
    const last = { ...s, gamesWon: { home: 1, away: 0 }, games: [[25, 3]] as Array<[number, number]> };
    assert.equal(carromVoiceEnds(carromVoice('board home 5', ctxOf(last))!, last)?.action, 'fullTime');
    assert.equal(carromVoiceEnds(carromVoice('board home 1', ctxOf(carrom.init({})))!, carrom.init({})), null);
  });
});

/* ---------------------------------------------------------- golf match play */

describe('golf match-play voice', () => {
  const ctx = (s: GolfMatchState) => ({ ...ctxOf(s), homeName: 'Asha Rao', awayName: 'Divya Nair', homeRoster: [HOME[0]], awayRoster: [AWAY[0]] });
  test('hole won / halved', () => {
    const s = initGolfMatch({ holes: '18' });
    const w = golfMatchVoice('Rao wins the hole', ctx(s))!;
    assert.deepEqual([w[0].type, w[0].payload?.winner, w[0].attribution?.stat], ['HOLE', 'home', 'holesWon']);
    assert.equal(golfMatchVoice('halved', ctx(s))![0].payload?.winner, 'halved');
    assert.equal(golfMatchVoice('Rao', ctx(s)), null, 'a bare name is not a hole');
  });
  test('strokes entered with handicap strokes set up — the net winner, birdie credited', () => {
    let s = initGolfMatch({ holes: '18' });
    s = golfMatchReducer(s, { type: 'SET_STROKES', payload: { strokes: setupMatchStrokes({ holes: standardPar72() }) } });
    const a = golfMatchVoice('Nair 3 Rao 4', ctx(s))![0];
    assert.deepEqual([a.payload?.home, a.payload?.away, a.payload?.winner], [4, 3, 'away']);
    assert.equal(a.attribution2?.stat, 'holesWon');
  });
  test('a hole that closes the match completes it (the panel asks first)', () => {
    let s = initGolfMatch({ holes: '9' });
    for (let i = 0; i < 4; i++) s = golfMatchReducer(s, { type: 'HOLE', payload: { winner: 'home' } });
    const plugin = { reducer: golfMatchReducer as never, isComplete: (x: GolfMatchState) => x.ended };
    assert.equal(completesMatch(plugin, s, golfMatchVoice('hole home', ctx(s))!), true, '5 up with 4 to play');
    assert.equal(completesMatch(plugin, s, golfMatchVoice('halved', ctx(s))!), false);
  });
});

/* ------------------------------------------------------------ kabaddi extras */

describe('kabaddi voice — cards and technical points', () => {
  test('green / yellow card with the player; technical point; red stays on the button', () => {
    const s = kabaddi.init({});
    const g = kabaddiVoice('green card Rao', ctxOf(s))![0];
    assert.deepEqual([g.type, g.side, g.payload?.card, g.payload?.playerId], ['CARD', 'home', 'green', 'h1']);
    assert.equal(kabaddiVoice('technical point away', ctxOf(s))![0].type, 'TECH_POINT');
    assert.equal(kabaddiVoice('red card Rao', ctxOf(s)), null);
    assert.equal(kabaddiVoice('raid Rao', ctxOf(s))![0].type, 'RAID_OUTCOME', 'raids unchanged');
  });
});

/* ------------------------------------------------------------------ records */

describe('records hooks — carrom and golf match play', () => {
  test('carrom: biggest game win, most boards in a row (penalties break a run), slams', () => {
    let s = carrom.reducer(carrom.init({ target: 25, gamesToWin: 1 }), { type: 'FIRST_BREAK', payload: { side: 'home' } });
    const B = (side: 'home' | 'away', coins: number, extra: Record<string, unknown> = {}): ScoreAction =>
      ({ type: 'BOARD', side, payload: { coins, queen: false, ...extra }, attribution: { playerId: side === 'home' ? 'h1' : 'a1', playerName: 'X', stat: 'points', by: coins } });
    for (const a of [B('home', 9, { slam: 'white' }), B('home', 2), B('away', 3), { type: 'BOARD', side: 'away', payload: { penalty: true } } as ScoreAction, B('home', 4), B('home', 9), B('home', 5)]) s = carrom.reducer(s, a);
    assert.ok(s.ended);
    const r = carromMatchRecords(s)!;
    const of = (t: string) => r.items.filter((i) => i.type === t);
    assert.equal(of('biggestWin')[0].side, 'home');
    assert.equal(of('biggestWin')[0].text, '25–6');
    assert.deepEqual(of('boardRun').map((i) => [i.value, i.side]), [[3, 'home']]);
    assert.deepEqual(of('slam').map((i) => [i.text, i.side, i.playerId]), [['White slam', 'home', 'h1']]);
    assert.equal(carromMatchRecords(carrom.init({})), null, 'an open match has none');
  });
  test('golf: 5&4 beats 4&3; holes won; birdies only with hole scores; a conceded match has no margin', () => {
    const play = (wins: ('home' | 'away' | 'halved')[]) => wins.reduce((s, w) => golfMatchReducer(s, { type: 'HOLE', payload: { winner: w } }), initGolfMatch({ holes: '18' }));
    const big = play(Array(14).fill('home').map((w, i) => (i < 9 ? 'home' : i < 13 ? 'halved' : 'home')) as never);
    const r = golfMatchRecords(big)!;
    const margin = r.items.find((i) => i.type === 'biggestMargin')!;
    assert.equal(margin.side, 'home');
    assert.match(margin.text, /&/);
    const small = golfMatchRecords(play([...Array(4).fill('home'), ...Array(11).fill('halved')] as never))!.items.find((i) => i.type === 'biggestMargin')!;
    assert.ok(margin.value > small.value, `${margin.text} > ${small.text}`);
    assert.ok(r.items.some((i) => i.type === 'holesWon' && i.side === 'home'));
    assert.ok(!r.items.some((i) => i.type === 'birdies'));
    const conceded = golfMatchReducer(play(['home', 'away']), { type: 'CONCEDE', side: 'away' });
    assert.ok(!(golfMatchRecords(conceded)?.items ?? []).some((i) => i.type === 'biggestMargin'));
    // with strokes: a birdie (3 on a par 4)
    let st = golfMatchReducer(initGolfMatch({ holes: '9' }), { type: 'SET_STROKES', payload: { strokes: setupMatchStrokes({ holes: standardPar72().slice(0, 9) }) } });
    st = golfMatchReducer(st, { type: 'HOLE', payload: { winner: 'home', home: 3, away: 4 } });
    for (let i = 0; i < 5; i++) st = golfMatchReducer(st, { type: 'HOLE', payload: { winner: 'home' } });
    assert.ok(st.ended);
    assert.deepEqual(golfMatchRecords(st)!.items.filter((i) => i.type === 'birdies').map((i) => [i.side, i.value]), [['home', 1]]);
  });
  test('stroke-play state has no hook output; the hooks + types are registered; tournament ranking works', () => {
    assert.equal(golfMatchRecords({ field: true } as never), null);
    assert.equal(MATCH_RECORD_HOOKS.carrom, carromMatchRecords);
    assert.ok(MATCH_RECORD_TYPES.golf?.some((t) => t.key === 'biggestMargin'));
    const won = ['home', 'home', 'home', 'home', 'home', 'home', 'home', 'home', 'home', 'home'].reduce((s, w) => golfMatchReducer(s, { type: 'HOLE', payload: { winner: w } }), initGolfMatch({ holes: '18' }));
    const m = { id: 'g1', sport: 'golf', status: 'completed', startsAt: '2026-10-11T08:00:00Z', homeTeam: { id: 't1', name: 'Asha Rao' }, awayTeam: { id: 't2', name: 'Divya Nair' }, state: won } as unknown as Match;
    const out = tournamentRecords('golf', [m], { derive: (x) => golfMatchRecords(x.state as GolfMatchState) });
    assert.equal(out.find((x) => x.type.key === 'biggestMargin')?.rows[0].item.text, '10&8');
  });
});

/* ----------------------------------------------------------- leader splits */

describe('leaderboard split chips beyond cricket', () => {
  test('every match sport declares sensible leader splits', () => {
    const want: Partial<Record<SportId, string[]>> = {
      cricket: ['format', 'ball'], football: ['format'], hockey: ['format'], handball: ['format'], basketball: ['format'],
      volleyball: ['format'], kabaddi: ['format'], tennis: ['discipline', 'format'], badminton: ['discipline', 'format'],
      tabletennis: ['discipline', 'format'], squash: ['discipline', 'format'], padel: ['discipline', 'format'],
      pickleball: ['discipline', 'format'], chess: ['timeControl'], carrom: ['discipline'],
    };
    for (const [sp, dims] of Object.entries(want)) assert.deepEqual(statSchema(sp as SportId)?.leaderSplits, dims, sp);
  });

  const matchOf = (id: string, sport: SportId, format: Record<string, unknown>, state: Record<string, unknown> = {}) =>
    ({ id, sport, status: 'completed', startsAt: '2026-10-01T10:00:00Z', homeTeam: { id: 'H', name: 'Red House', roster: ['p1'] }, awayTeam: { id: 'A', name: 'Blue House', roster: ['p2'] }, format, state } as unknown as Match);
  const lineOf = (id: string, sport: SportId, matchId: string) =>
    ({ id, sport, matchId, playerId: 'p1', opponent: 'Blue House', date: '2026-10-01', stats: { goals: 1 } } as unknown as StatLine);
  const keysFor = (sport: SportId, formats: [Record<string, unknown>, Record<string, unknown>?][]) => {
    const ms = formats.map(([f, st], i) => matchOf(`m${i}`, sport, f, st ?? {}));
    const ls = ms.map((m, i) => lineOf(`l${i}`, sport, m.id));
    const ctx = contextsFor(ls, new Map(ms.map((m) => [m.id, m])), new Map());
    const scope = scopeBySplits(ls, ctx, sport, statSchema(sport)?.leaderSplits ?? [], {});
    return Object.fromEntries(scope.options.map((o) => [o.dim, o.values.map((v) => v.key).sort()]));
  };

  test('keyed coverage per sport (each split value is a chip with its line count)', () => {
    assert.deepEqual(keysFor('football', [[{ playersPerSide: 11 }], [{ playersPerSide: 7 }], [{ playersPerSide: 5, futsal: true }], [{ playersPerSide: 5 }]]),
      { format: ['11aside', '5aside', '7aside', 'futsal'] });
    assert.deepEqual(keysFor('basketball', [[{ playersPerSide: 5 }], [{ playersPerSide: 3 }]]), { format: ['3x3', '5v5'] });
    assert.deepEqual(keysFor('volleyball', [[{ preset: 'indoor' }], [{ preset: 'beach' }]]), { format: ['beach', 'indoor'] });
    assert.deepEqual(keysFor('hockey', [[{ playersPerSide: 11 }], [{ playersPerSide: 5 }]]), { format: ['11aside', '5s'] });
    assert.deepEqual(keysFor('handball', [[{ periodMinutes: 30 }], [{ periodMinutes: 25 }]]), { format: ['2x25', '2x30'] });
    assert.deepEqual(keysFor('kabaddi', [[{ style: 'pro' }], [{ style: 'circle' }]]), { format: ['circle', 'pro'] });
    assert.deepEqual(keysFor('badminton', [[{ playersPerSide: 1, gamesToWin: 2 }], [{ playersPerSide: 2, gamesToWin: 2 }]]), { discipline: ['doubles', 'singles'] });
    assert.deepEqual(keysFor('chess', [[{}, { timeControl: 'rapid' }], [{}, { timeControl: 'blitz' }]]), { timeControl: ['blitz', 'rapid'] });
    assert.deepEqual(keysFor('carrom', [[{ playersPerSide: 1 }], [{ playersPerSide: 2 }]]), { discipline: ['doubles', 'singles'] });
  });
  test('one format only → no chip; filtering keeps other sports\' lines', () => {
    assert.deepEqual(keysFor('football', [[{ playersPerSide: 11 }], [{ playersPerSide: 11 }]]), {});
    const ms = [matchOf('a', 'football', { playersPerSide: 11 }), matchOf('b', 'football', { playersPerSide: 7 })];
    const ls = [lineOf('x', 'football', 'a'), lineOf('y', 'football', 'b'), lineOf('z', 'hockey', 'zz')];
    const ctx = contextsFor(ls, new Map(ms.map((m) => [m.id, m])), new Map());
    const scope = scopeBySplits(ls, ctx, 'football', ['format'], { format: '7aside' });
    assert.deepEqual(scope.lines.map((l) => l.id), ['y', 'z']);
    assert.equal(scope.label, '7-a-side');
  });
});
