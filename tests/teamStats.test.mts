import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTeamStats } from '../src/data/teamStats.ts';

const T = (id: string, name: string) => ({ id, name, shortName: name.slice(0, 3), colorHex: '#fff', sport: 'football' }) as never;
const A = T('a', 'Fnatic 1'), B = T('b', 'Fnatic 2'), C = T('c', 'Others');
const m = (id: string, home: never, away: never, h: number, a: number, at: string, status = 'completed') => ({
  id, sport: 'football', status, startsAt: at, homeTeam: home, awayTeam: away, score: { home: h, away: a },
  winner: status !== 'completed' ? undefined : h > a ? 'home' : h < a ? 'away' : 'draw',
}) as never;
const matches = [
  m('1', A, B, 3, 1, '2026-10-01'), m('2', B, A, 2, 2, '2026-10-02'), m('3', A, C, 0, 1, '2026-10-03'),
  m('4', A, B, 5, 0, '2026-10-04', 'scheduled'),
];

test('record, form (latest first), for/against', () => {
  const s = computeTeamStats('a', matches);
  assert.deepEqual([s.played, s.won, s.drawn, s.lost], [3, 1, 1, 1]);
  assert.deepEqual(s.form.map((f) => f.result), ['L', 'D', 'W']);
  assert.equal(s.scored, 5); assert.equal(s.conceded, 4); assert.equal(s.unit, 'goals');
});

test('head-to-head per opponent, most played first', () => {
  const s = computeTeamStats('a', matches);
  assert.deepEqual(s.headToHead.map((h) => [h.opponentName, h.played, h.won, h.drawn, h.lost, h.for, h.against]),
    [['Fnatic 2', 2, 1, 1, 0, 5, 3], ['Others', 1, 0, 0, 1, 0, 1]]);
});

test('top scorer only counts goals scored FOR this team (shared friendly pools)', () => {
  const lines = [
    { id: 'l1', matchId: '1', playerId: 'p1', sport: 'football', stats: { goals: 2 }, won: true },
    { id: 'l2', matchId: '2', playerId: 'p1', sport: 'football', stats: { goals: 3 }, won: false }, // played for B that day
    { id: 'l3', matchId: '1', playerId: 'p2', sport: 'football', stats: { goals: 1, assists: 2 }, won: true },
  ] as never;
  const awards = { football: [{ icon: '⚽', label: 'Top scorer', stat: 'goals' }, { icon: '🅰️', label: 'Playmaker', stat: 'assists' }] };
  const s = computeTeamStats('a', matches, lines, { '1': ['p1', 'p2'], '2': ['p2'], '3': ['p2'] }, awards as never);
  const top = s.leaders.find((l) => l.stat === 'goals')!;
  assert.equal(top.playerId, 'p1'); assert.equal(top.total, 2);
  assert.equal(s.leaders.find((l) => l.stat === 'assists')!.playerId, 'p2');
  assert.deepEqual(s.appearances[0], { playerId: 'p2', matches: 3 });
});

test('no completed matches → empty stats', () => {
  const s = computeTeamStats('a', [matches[3]]);
  assert.equal(s.played, 0); assert.equal(s.form.length, 0); assert.equal(s.leaders.length, 0);
});
