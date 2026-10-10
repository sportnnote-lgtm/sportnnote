/**
 * SD-11 (GEN-01) — appearance + result lines. Every player who took part gets a
 * line at completion (squad starters + subs who came on; a 1–2 player entry's
 * roster), each with W / D / L / T / NR from their side; profiles read the record.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  planAppearances, sideResults, subsCameOn, lineResult, sideFromOpponent,
  type AppearanceInput, type AppearanceWrite, type ExistingLine,
} from '../src/data/appearances.ts';
import { aggregate, winRateOf, recordText } from '../src/data/stats.ts';
import type { StatLine } from '../src/core/types.ts';

const names = { home: 'Reds', away: 'Blues' };
const base = (over: Partial<AppearanceInput>): AppearanceInput => ({
  sport: 'football', outcome: { home: 'D', away: 'D' }, names, rosters: { home: [], away: [] }, existing: [], ...over,
});
const inserts = (w: AppearanceWrite[]) => w.filter((x): x is Extract<AppearanceWrite, { kind: 'insert' }> => x.kind === 'insert');
const updates = (w: AppearanceWrite[]) => w.filter((x): x is Extract<AppearanceWrite, { kind: 'update' }> => x.kind === 'update');
const byPlayer = (w: AppearanceWrite[]) => new Map(inserts(w).map((x) => [x.playerId, x]));

describe('sideResults — each side’s result from the match', () => {
  const m = (o: Partial<Parameters<typeof sideResults>[0]>) => sideResults({ sport: 'football', status: 'completed', ...o });
  test('decided', () => {
    assert.deepEqual(m({ winner: 'home' }), { home: 'W', away: 'L' });
    assert.deepEqual(m({ winner: 'away' }), { home: 'L', away: 'W' });
  });
  test('football draw = D; cricket level = T', () => {
    assert.deepEqual(m({ winner: 'draw' }), { home: 'D', away: 'D' });
    assert.deepEqual(m({ sport: 'cricket', winner: 'draw' }), { home: 'T', away: 'T' });
  });
  test('manual results (#04)', () => {
    assert.deepEqual(m({ winner: 'draw', result: { kind: 'tie' } }), { home: 'T', away: 'T' });
    assert.deepEqual(m({ winner: 'draw', result: { kind: 'draw' } }), { home: 'D', away: 'D' });
    assert.deepEqual(m({ result: { kind: 'no_result' } }), { home: 'NR', away: 'NR' });
    assert.deepEqual(m({ result: { kind: 'abandoned' } }), { home: 'NR', away: 'NR' });
    assert.deepEqual(m({ winner: 'away', result: { kind: 'awarded', winner: 'away' } }), { home: 'L', away: 'W' });
    assert.deepEqual(m({ result: { kind: 'conceded', winner: 'home' } }), { home: 'W', away: 'L' });
    assert.equal(m({ result: { kind: 'awarded' } }), null);
  });
  test('legacy hand-closed no-result (status cancelled) = NR', () => {
    assert.deepEqual(m({ status: 'cancelled' }), { home: 'NR', away: 'NR' });
  });
  test('not decided → null', () => {
    assert.equal(m({ status: 'live', winner: 'home' }), null);
    assert.equal(m({ status: 'scheduled' }), null);
    assert.equal(m({ winner: null }), null);
  });
});

describe('planAppearances — who gets a line', () => {
  test('football draw: both squads’ starters get D lines (incl. a player with no stat), unused sub none, sub who came on gets starts 0', () => {
    const w = planAppearances(base({
      squads: { home: { starters: ['h1', 'h2'], subs: ['h3', 'h4'] }, away: { starters: ['a1', 'a2'], subs: ['a3'] } },
      cameOn: { ids: ['h3'], names: [] },
      existing: [{ id: 'L1', playerId: 'h1', stats: { goals: 1 }, won: false, opponent: 'Blues' }],
    }));
    const ins = byPlayer(w);
    assert.deepEqual([...ins.keys()].sort(), ['a1', 'a2', 'h2', 'h3']);
    assert.equal(ins.get('h2')!.result, 'D');
    assert.deepEqual(ins.get('h2')!.stats, { starts: 1 });
    assert.deepEqual(ins.get('h3')!.stats, { starts: 0 });
    assert.equal(ins.get('a1')!.opponent, 'Reds');
    assert.equal(ins.has('h4'), false, 'unused sub');
    const up = updates(w);
    assert.equal(up.length, 1);
    assert.deepEqual(up[0].patch, { result: 'D', stats: { goals: 1, starts: 1 } });
  });

  test('decided match: winners W + won, losers L', () => {
    const w = planAppearances(base({
      outcome: { home: 'L', away: 'W' },
      squads: { home: { starters: ['h1'], subs: [] }, away: { starters: ['a1'], subs: [] } },
      existing: [{ id: 'L1', playerId: 'h1', stats: {}, won: true }],
    }));
    const ins = byPlayer(w);
    assert.equal(ins.get('a1')!.result, 'W');
    assert.equal(ins.get('a1')!.won, true);
    assert.deepEqual(updates(w)[0].patch, { result: 'L', won: false, stats: { starts: 1 } });
  });

  test('pitch lineup counts as starters (no squad)', () => {
    const w = planAppearances(base({
      lineup: { home: [{ playerId: 'h1' }, {}], away: [{ playerId: 'a1' }] },
    }));
    assert.deepEqual([...byPlayer(w).keys()].sort(), ['a1', 'h1']);
  });

  test('basketball / kabaddi: name-only sub events matched to the bench', () => {
    const state = { events: [
      { type: 'sub', side: 'home', playerName: 'Off Guy', onName: 'Bench Ben' },
      { kind: 'sub', side: 'away', playerName: 'X', detail: 'Raider Ravi ⬆  X ⬇' },
    ] };
    const cameOn = subsCameOn(state);
    assert.deepEqual(cameOn.names, ['Bench Ben', 'Raider Ravi']);
    const w = planAppearances(base({
      sport: 'kabaddi',
      squads: { home: { starters: ['h1'], subs: ['hb', 'hc'] }, away: { starters: ['a1'], subs: ['ar'] } },
      cameOn, playerNames: { hb: 'Bench Ben', hc: 'Other', ar: 'Raider Ravi' },
    }));
    assert.deepEqual([...byPlayer(w).keys()].sort(), ['a1', 'ar', 'h1', 'hb']);
  });

  test('football sub events carry the id', () => {
    assert.deepEqual(subsCameOn({ events: [{ type: 'sub', playerName: 'A', secondName: 'B', secondId: 'pB' }, { type: 'goal', secondId: 'zz' }] }), { ids: ['pB'], names: ['B'] });
    assert.deepEqual(subsCameOn(null), { ids: [], names: [] });
  });

  test('cricket: the XI all get lines, no Starts; a bench fielder involved gets one', () => {
    const w = planAppearances(base({
      sport: 'cricket', outcome: { home: 'T', away: 'T' },
      squads: { home: { starters: ['h1', 'h2'], subs: ['h12'] }, away: { starters: ['a1'], subs: ['a12'] } },
      involved: ['h12'],
    }));
    const ins = byPlayer(w);
    assert.deepEqual([...ins.keys()].sort(), ['a1', 'h1', 'h12', 'h2']);
    for (const x of ins.values()) { assert.deepEqual(x.stats, {}); assert.equal(x.result, 'T'); }
  });

  test('carrom singles: the loser (no stat) gets an L line from the 1-player roster', () => {
    const w = planAppearances(base({
      sport: 'carrom', outcome: { home: 'W', away: 'L' },
      rosters: { home: ['p1'], away: ['p2'] },
      existing: [{ id: 'L1', playerId: 'p1', stats: { points: 25 }, won: true, result: 'W', opponent: 'Blues' }],
    }));
    assert.deepEqual(inserts(w).map((x) => [x.playerId, x.result, x.won]), [['p2', 'L', false]]);
    assert.deepEqual(inserts(w)[0].stats, {});
    assert.equal(updates(w).length, 0, 'winner already right');
  });

  test('doubles: both partners of both pairs (chess / racket / carrom)', () => {
    const w = planAppearances(base({
      sport: 'badminton', outcome: { home: 'L', away: 'W' },
      rosters: { home: ['h1', 'h2'], away: ['a1', 'a2'] },
    }));
    assert.deepEqual(inserts(w).map((x) => `${x.playerId}:${x.result}`).sort(), ['a1:W', 'a2:W', 'h1:L', 'h2:L']);
  });

  test('chess individual draw', () => {
    const w = planAppearances(base({ sport: 'chess', rosters: { home: ['w'], away: ['b'] } }));
    assert.deepEqual(inserts(w).map((x) => x.result), ['D', 'D']);
  });

  test('a big roster with no squad gives nobody an appearance (only credited lines get a result)', () => {
    const roster = Array.from({ length: 15 }, (_, i) => `h${i}`);
    const w = planAppearances(base({
      outcome: { home: 'W', away: 'L' }, rosters: { home: roster, away: ['a1', 'a2', 'a3'] }, perSide: 7,
      existing: [{ id: 'L1', playerId: 'h3', stats: { goals: 2 }, won: true }],
    }));
    assert.deepEqual(inserts(w).map((x) => x.playerId).sort(), ['a1', 'a2', 'a3'], 'away roster (3 ≤ 7) used');
    assert.deepEqual(updates(w)[0].patch, { result: 'W' }, 'credited h3 labelled from roster membership');
  });

  test('NR: everybody gets NR, nobody won', () => {
    const w = planAppearances(base({ outcome: { home: 'NR', away: 'NR' }, rosters: { home: ['h'], away: ['a'] } }));
    assert.deepEqual(inserts(w).map((x) => [x.result, x.won]), [['NR', false], ['NR', false]]);
  });

  test('outcome null (match still in play) → nothing', () => {
    assert.deepEqual(planAppearances(base({ outcome: null, rosters: { home: ['h'], away: ['a'] } })), []);
  });

  test('disputes: ids mapped to the replacement — no line for the disputed player', () => {
    const w = planAppearances(base({
      squads: { home: { starters: ['bad'], subs: [] }, away: { starters: ['a1'], subs: [] } },
      existing: [{ id: 'L1', playerId: 'good', stats: { goals: 1 }, won: false, opponent: 'Blues' }],
      mapId: (id) => (id === 'bad' ? 'good' : id),
    }));
    assert.deepEqual(inserts(w).map((x) => x.playerId), ['a1']);
    assert.deepEqual(updates(w)[0], { kind: 'update', id: 'L1', playerId: 'good', patch: { result: 'D', stats: { goals: 1, starts: 1 } } });
  });

  test('side of an existing line from its opponent label; unknown side on a decided match → untouched', () => {
    const existing: ExistingLine[] = [
      { id: 'L1', playerId: 'x', stats: { goals: 1 }, won: false, opponent: 'Reds' },
      { id: 'L2', playerId: 'y', stats: { goals: 1 }, won: false },
    ];
    const w = planAppearances(base({ outcome: { home: 'L', away: 'W' }, existing }));
    assert.deepEqual(updates(w), [{ kind: 'update', id: 'L1', playerId: 'x', patch: { result: 'W', won: true } }]);
  });

  test('a player listed on both sides is left alone', () => {
    const w = planAppearances(base({ outcome: { home: 'W', away: 'L' }, rosters: { home: ['p'], away: ['p'] } }));
    assert.deepEqual(w, []);
  });

  test('idempotent: applying the writes then planning again → nothing', () => {
    const input = base({
      outcome: { home: 'W', away: 'L' },
      squads: { home: { starters: ['h1', 'h2'], subs: ['h3'] }, away: { starters: ['a1'], subs: [] } },
      cameOn: { ids: ['h3'], names: [] },
      existing: [{ id: 'L1', playerId: 'h1', stats: { goals: 1 }, won: false }],
    });
    const lines: ExistingLine[] = input.existing.map((l) => ({ ...l, stats: { ...l.stats } }));
    let n = 0;
    for (const x of planAppearances(input)) {
      if (x.kind === 'insert') lines.push({ id: `n${n++}`, playerId: x.playerId, stats: x.stats, won: x.won, result: x.result, opponent: x.opponent });
      else { const l = lines.find((y) => y.id === x.id)!; if (x.patch.stats) l.stats = x.patch.stats; if (x.patch.result) l.result = x.patch.result; if (x.patch.won !== undefined) l.won = x.patch.won; }
    }
    assert.equal(lines.length, 4);
    assert.deepEqual(planAppearances({ ...input, existing: lines }), []);
  });
});

describe('read side — lineResult + aggregate', () => {
  const match = (o: object) => ({ sport: 'football', status: 'completed', homeTeam: { name: 'Reds' }, awayTeam: { name: 'Blues' }, ...o });
  test('stored result wins; else derived from the match (draw no longer LOST)', () => {
    assert.equal(lineResult({ won: false, result: 'T' }), 'T');
    assert.equal(lineResult({ won: false, opponent: 'Blues' }, match({ winner: 'draw' })), 'D');
    assert.equal(lineResult({ won: false, opponent: 'Reds' }, match({ winner: 'away' })), 'W');
    assert.equal(lineResult({ won: false }, match({ result: { kind: 'no_result' } })), 'NR');
    assert.equal(lineResult({ won: true }, match({ winner: 'home' })), 'W', 'side unknown → old flag');
    assert.equal(lineResult({ won: false }), 'L', 'no match → old flag');
    assert.equal(lineResult({ won: true, result: 'W' }, match({ status: 'live' })), undefined, 'back in play');
    assert.equal(lineResult({ won: true, eventId: 'g' }), undefined, 'golf round');
  });
  test('sideFromOpponent', () => {
    assert.equal(sideFromOpponent('Blues', names), 'home');
    assert.equal(sideFromOpponent('Reds', names), 'away');
    assert.equal(sideFromOpponent('Reds', { home: 'Reds', away: 'Reds' }), undefined);
  });
  test('aggregate: W-D-L-T-NR, Apps, Starts, win % without NR; starts kept out of totals', () => {
    const l = (result: StatLine['result'], stats: Record<string, number> = {}, won = result === 'W'): StatLine =>
      ({ id: Math.random().toString(), matchId: 'm', playerId: 'p', sport: 'football', stats, won, result });
    const s = aggregate([l('W', { goals: 1, starts: 1 }), l('D', { starts: 0 }), l('L'), l('T'), l('NR'), l(undefined, {}, false)]);
    assert.equal(s.matches, 6);
    assert.deepEqual([s.wins, s.draws, s.losses, s.ties, s.noResults], [1, 1, 2, 1, 1]);
    assert.equal(s.starts, 1);
    assert.equal(s.startsKnown, 2);
    assert.equal(s.winRate, 1 / 5);
    assert.equal(winRateOf(s.bySport[0]), 1 / 5);
    assert.deepEqual(s.totals, { goals: 1 });
    assert.equal(recordText(s), '1W 1D 2L 1T 1NR');
    assert.equal(recordText(aggregate([l('W')])), '1W 0D 0L');
    const live = aggregate([{ ...l('W'), pending: true }, l('L')]);
    assert.deepEqual([live.matches, live.wins, live.losses, live.winRate], [2, 0, 1, 0], 'a line of a match in play: app, no result');
  });
});
