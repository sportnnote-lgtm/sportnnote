/**
 * Score ticker / OBS overlay model (parity #25): the generic model from
 * summary(), cricket's cells (batters, bowler, this over, need/RRR, innings
 * break, Super Over) and flashes (wicket / four / six, never a single, a wide,
 * an all-run four or a penalty), football's goal flash and a volleyball model.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, type CricketState } from '../src/sports/cricket/engine.ts';
import { cricketTickerDetail, cricketTickerFlash } from '../src/sports/cricket/ticker.ts';
import * as football from '../src/sports/football/engine.ts';
import { footballTickerDetail, footballTickerFlash } from '../src/sports/football/ticker.ts';
import { buildTicker, shortName, type TickerMeta } from '../src/sports/ticker.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const meta: TickerMeta = {
  home: { name: 'Banjara XI', short: 'BAN', color: '#3366FF' },
  away: { name: 'Strikers', short: 'STR', color: '#FF6633' },
  startsLabel: '4:30 PM',
};

// A stand-in for cricket's summary() (index.tsx pulls in React Native).
const cricket = {
  summary: (s: CricketState) => ({
    homeScore: `${s.scores.home.runs}/${s.scores.home.wickets}`,
    awayScore: `${s.scores.away.runs}/${s.scores.away.wickets}`,
    statusLine: s.ended ? 'Result' : `Innings ${s.innings}`,
  }),
  isComplete: (s: CricketState) => s.ended,
  tickerDetail: cricketTickerDetail,
};

const ball = (s: CricketState, type: string, payload: Record<string, unknown> = {}): CricketState => {
  const x = s.superOver && !s.superOver.state.ended ? s.superOver.state : s;
  return reducer(s, { type, side: x.battingSide, payload: { ...payload, strikerId: x.strikerId, strikerName: x.strikerName, bowlerId: x.bowlerId, bowlerName: x.bowlerName } } as ScoreAction);
};
const crease = (s: CricketState, bat: [string, string][], bowler: [string, string]): CricketState => {
  s = reducer(s, { type: 'SET_STRIKER', payload: { id: bat[0][0], name: bat[0][1] } });
  s = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: bat[1][0], name: bat[1][1] } });
  return reducer(s, { type: 'SET_BOWLER', payload: { id: bowler[0], name: bowler[1] } });
};
const runs = (s: CricketState, r: number, extra: Record<string, unknown> = {}) => ball(s, 'RUNS', { runs: r, ...extra });

/** A 1-over match: home make 6 (1, 4, wide, then dots) — the chase is for 7. */
function firstInnings() {
  let s = init({ overs: 1, playersPerSide: 11 });
  s = crease(s, [['h1', 'Rahul Sharma'], ['h2', 'Dev Kumar']], ['a9', 'Sachin Kale']);
  s = runs(s, 1);
  s = runs(s, 4);
  s = ball(s, 'EXTRA', { kind: 'Wide' });
  return s;
}

describe('ticker — cricket', () => {
  test('innings 1: batters, bowler, this over, CRR, overs as the sub', () => {
    const s = firstInnings();
    const m = buildTicker(cricket, s, meta, 6);
    assert.equal(m.phase, 'live');
    assert.equal(m.home.score, '6/0');
    assert.equal(m.home.sub, '(0.2)');
    assert.equal(m.away.score, ''); // yet to bat
    assert.equal(m.batting, 'home');
    assert.deepEqual(m.left, ['Dev K.* 4 (1)', 'Rahul S. 1 (1)']);
    assert.deepEqual(m.right, ['Sachin K. 0-6 (0.2)']);
    assert.deepEqual(m.chips, [{ text: '1' }, { text: '4', tone: 'boundary' }, { text: 'wd', tone: 'extra' }]);
    assert.equal(m.banner, 'CRR 18.00');
    assert.equal(m.status, 'Innings 1');
  });

  test('pre-match: "HOME vs AWAY · Starts …", no cells', () => {
    const m = buildTicker(cricket, init({ overs: 20 }), meta, 0);
    assert.equal(m.phase, 'pre');
    assert.equal(m.status, 'BAN vs STR · Starts 4:30 PM');
    assert.equal(m.home.score, '');
    assert.equal(m.left, undefined);
    assert.equal(m.banner, undefined);
  });

  test('innings break shows the target; innings 2 shows need and RRR', () => {
    let s = firstInnings();
    for (let i = 0; i < 4; i++) s = runs(s, 0);
    assert.equal(s.innings, 2);
    let m = buildTicker(cricket, s, meta, 10);
    assert.equal(m.banner, 'Innings break · Target 7');
    assert.equal(m.left, undefined);
    assert.equal(m.away.score, '0/0');
    assert.equal(m.home.sub, '(1.0)');
    s = crease(s, [['a1', 'Virat'], ['a2', 'Rohit Raj']], ['h9', 'Jasprit B']);
    s = runs(s, 2);
    m = buildTicker(cricket, s, meta, 14);
    assert.equal(m.banner, 'Need 5 off 5 · RRR 6.00');
    assert.equal(m.batting, 'away');
    assert.deepEqual(m.left, ['Virat* 2 (1)', 'Rohit R. 0 (0)']);
    assert.deepEqual(m.right, ['Jasprit B. 0-2 (0.1)']);
  });

  test('a manual result (#04) beats the state: done, the result line, no cells', () => {
    const m = buildTicker(cricket, firstInnings(), { ...meta, resultLine: 'Match abandoned — Rain' }, 6);
    assert.equal(m.phase, 'done');
    assert.equal(m.status, 'Match abandoned — Rain');
    assert.equal(m.chips, undefined);
  });

  test('a break (#13) shows on the status', () => {
    const m = buildTicker(cricket, firstInnings(), { ...meta, breakLabel: 'Rain break' }, 6);
    assert.equal(m.status, '⏸ Rain break');
  });

  test('a decided match names the winner', () => {
    let s = firstInnings();
    for (let i = 0; i < 4; i++) s = runs(s, 0);
    s = crease(s, [['a1', 'Virat'], ['a2', 'Rohit']], ['h9', 'Jasprit']);
    s = runs(s, 6);
    s = runs(s, 1);
    assert.equal(s.ended, true);
    const m = buildTicker(cricket, s, meta, 15);
    assert.equal(m.phase, 'done');
    assert.equal(m.status, 'STR won by 10 wkts');
  });

  test('a Super Over drives the cells from its own innings', () => {
    let s = firstInnings();
    for (let i = 0; i < 4; i++) s = runs(s, 0);
    s = crease(s, [['a1', 'Virat'], ['a2', 'Rohit']], ['h9', 'Jasprit']);
    s = runs(s, 6);
    for (let i = 0; i < 5; i++) s = runs(s, 0);
    assert.equal(s.pendingTie, true);
    s = reducer(s, { type: 'START_SUPER_OVER' });
    assert.ok(s.superOver);
    s = crease(s, [['a1', 'Virat'], ['a2', 'Rohit']], ['h9', 'Jasprit']);
    s = runs(s, 4);
    const m = buildTicker(cricket, s, meta, 30);
    assert.equal(m.batting, s.superOver!.state.battingSide);
    const bat = s.superOver!.state.battingSide;
    assert.equal(m[bat].score, '4/0');
    assert.equal(m[bat].sub, 'SO (0.1)');
    assert.equal(m.banner, 'Super Over · CRR 24.00');
    assert.deepEqual(m.chips, [{ text: '4', tone: 'boundary' }]);
    assert.deepEqual(m.left, ['Virat* 4 (1)', 'Rohit 0 (0)']);
    // ... and a boundary inside the Super Over flashes
    assert.equal(cricketTickerFlash(s, runs(s, 6))?.kind, 'six');
    assert.equal(cricketTickerFlash(s, runs(s, 1)), null);
  });
});

describe('ticker — cricket flashes', () => {
  const s0 = firstInnings();
  test('wicket → WICKET!, with how', () => {
    const next = ball(s0, 'WICKET', { kind: 'bowled', newBatId: 'h3', newBatName: 'Ishaan' });
    const f = cricketTickerFlash(s0, next);
    assert.equal(f?.kind, 'wicket');
    assert.equal(f?.text, 'WICKET!');
    assert.match(f?.sub ?? '', /b Sachin/);
  });
  test('four and six → FOUR! / SIX! with the striker', () => {
    assert.deepEqual(cricketTickerFlash(s0, runs(s0, 4)), { kind: 'four', text: 'FOUR!', sub: 'Dev K.', side: 'home' });
    assert.equal(cricketTickerFlash(s0, runs(s0, 6))?.kind, 'six');
  });
  test('no flash on a single, a dot, a wide, an all-run four, overthrows or a penalty', () => {
    assert.equal(cricketTickerFlash(s0, runs(s0, 1)), null);
    assert.equal(cricketTickerFlash(s0, runs(s0, 0)), null);
    assert.equal(cricketTickerFlash(s0, ball(s0, 'EXTRA', { kind: 'Wide' })), null);
    assert.equal(cricketTickerFlash(s0, runs(s0, 4, { boundary: false })), null);
    assert.equal(cricketTickerFlash(s0, runs(s0, 5, { overthrows: 1 })), null);
    assert.equal(cricketTickerFlash(s0, reducer(s0, { type: 'PENALTY', payload: { runs: 5, to: 'home' } })), null);
  });
  test('the same state twice (a replayed / unchanged event) never flashes', () => {
    const next = runs(s0, 6);
    assert.equal(cricketTickerFlash(next, next), null);
  });
  test('retired hurt is not a wicket', () => {
    const next = ball(s0, 'WICKET', { kind: 'retired', newBatId: 'h3', newBatName: 'Ishaan' });
    assert.equal(cricketTickerFlash(s0, next), null);
  });
});

describe('ticker — football', () => {
  const kicked = () => {
    let s = football.init({});
    s = football.reducer(s, { type: 'KICKOFF', payload: { at: Date.now() } });
    return s;
  };
  test('a new goal flashes "GOAL! Name 34\'"; a card does not', () => {
    const s = kicked();
    const g = football.reducer(s, { type: 'GOAL', side: 'away', payload: { minute: 34 }, attribution: { playerId: 'p1', stat: 'goals', playerName: 'Sunil Chhetri' } });
    assert.deepEqual(footballTickerFlash(s, g), { kind: 'goal', text: "GOAL! Sunil C. 34'", side: 'away' });
    const y = football.reducer(g, { type: 'YELLOW', side: 'home', payload: { minute: 40 }, attribution: { playerId: 'p2', stat: 'yellow', playerName: 'X' } });
    assert.equal(footballTickerFlash(g, y), null);
    assert.equal(footballTickerFlash(g, g), null);
  });
  test('scorers per side as the cells', () => {
    let s = kicked();
    s = football.reducer(s, { type: 'GOAL', side: 'home', payload: { minute: 12 }, attribution: { playerId: 'p1', stat: 'goals', playerName: 'Anil Rao' } });
    s = football.reducer(s, { type: 'GOAL', side: 'home', payload: { minute: 67 }, attribution: { playerId: 'p1', stat: 'goals', playerName: 'Anil Rao' } });
    const d = footballTickerDetail(s, { home: 'BAN', away: 'STR' });
    assert.deepEqual(d.left, ["⚽ Anil R. 12', 67'"]);
    assert.equal(d.right, undefined);
    const m = buildTicker({ summary: (x: football.FootballState) => ({ homeScore: String(x.home), awayScore: String(x.away), statusLine: '1st Half' }), isComplete: (x: football.FootballState) => x.ended, tickerDetail: footballTickerDetail }, s, meta, 3);
    assert.equal(m.home.score, '2');
    assert.equal(m.status, '1st Half');
    assert.deepEqual(m.left, ["⚽ Anil R. 12', 67'"]);
  });
});

describe('ticker — any sport from summary() (volleyball)', () => {
  const vb = {
    summary: (s: { sets: number[]; pts: number[]; ended: boolean }) => ({
      homeScore: String(s.sets[0]), awayScore: String(s.sets[1]),
      statusLine: s.ended ? 'Final' : `Set ${s.sets[0] + s.sets[1] + 1} · ${s.pts[0]}–${s.pts[1]}`,
      detailLine: 'Sets: 25-21',
    }),
    isComplete: (s: { ended: boolean }) => s.ended,
  };
  test('live: score, status and detail; no cells or flash', () => {
    const m = buildTicker(vb, { sets: [1, 0], pts: [12, 9], ended: false }, meta, 40);
    assert.deepEqual(
      { phase: m.phase, home: m.home.score, away: m.away.score, status: m.status, detail: m.detail, chips: m.chips, banner: m.banner },
      { phase: 'live', home: '1', away: '0', status: 'Set 2 · 12–9', detail: 'Sets: 25-21', chips: undefined, banner: undefined },
    );
    assert.equal(m.home.color, '#3366FF');
  });
  test('done once complete', () => {
    const m = buildTicker(vb, { sets: [2, 0], pts: [0, 0], ended: true }, meta, 80);
    assert.equal(m.phase, 'done');
    assert.equal(m.status, 'Final');
  });
  test('completed status with no events is done, not pre', () => {
    assert.equal(buildTicker(vb, { sets: [0, 0], pts: [0, 0], ended: false }, { ...meta, status: 'completed' }, 0).phase, 'done');
  });
});

test('shortName', () => {
  assert.equal(shortName('Rahul Sharma'), 'Rahul S.');
  assert.equal(shortName('M S Dhoni'), 'M D.');
  assert.equal(shortName('Virat'), 'Virat');
  assert.equal(shortName(undefined), '');
});
