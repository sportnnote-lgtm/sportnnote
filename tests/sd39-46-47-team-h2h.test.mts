/**
 * SD-39 football career remainder (G+A, minutes per goal, starts / off the
 * bench, minutes per game, games in goal, conceded per 90, keeper-first
 * sections); SD-46 team stats and records from the schema (per game for /
 * against / margin with the unit's difference label, per-game team averages,
 * team leaders, records, tournament / season filters); SD-47 head-to-head and
 * form (player vs player from line sides, partners excluded, opponents faced,
 * team vs team).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, SportId, StatLine, Team } from '../src/core/types.ts';
import { careerSections } from '../src/data/career.ts';
import { statSchema } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';
import {
  teamUnit, teamPerGame, teamAverages, teamLeaders, teamRecords, teamMatchFilters, filterTeamMatches,
} from '../src/data/teamRecords.ts';
import {
  playerForm, playerHeadToHead, opponentsFaced, teamHeadToHead, teamForm, h2hRecordText, meetingText,
} from '../src/data/headToHead.ts';

const team = (id: string, name: string, sport: SportId, roster?: string[]): Team => ({ id, name, shortName: name.slice(0, 3), sport, roster });
let mseq = 0;
const M = (sport: SportId, home: Team, away: Team, h: number, a: number, o: Partial<Match> = {}): Match => {
  mseq += 1;
  return {
    id: `m${mseq}`, sport, status: 'completed', startsAt: `2026-0${(mseq % 9) + 1}-10T10:00:00Z`, homeTeam: home, awayTeam: away,
    score: { home: h, away: a }, winner: h > a ? 'home' : h < a ? 'away' : 'draw', state: {}, ...o,
  } as Match;
};
let lseq = 0;
const L = (m: Match, playerId: string, side: 'home' | 'away', stats: Record<string, number>, extra: Partial<StatLine> = {}): StatLine => {
  lseq += 1;
  const r = m.winner === 'draw' ? 'D' : m.winner === side ? 'W' : 'L';
  return {
    id: `l${lseq}`, matchId: m.id, playerId, sport: m.sport, stats, won: r === 'W', result: r,
    opponent: side === 'home' ? m.awayTeam.name : m.homeTeam.name, date: m.startsAt, ...extra,
  };
};
const rows = (sport: SportId, ls: StatLine[]) =>
  Object.fromEntries(careerSections(statSchema(sport)!, ls).map((s) => [s.id, Object.fromEntries(s.rows.map((r) => [r.label, r.value]))]));

describe('SD-39 — football career remainder', () => {
  const A = team('a', 'Reds', 'football'), B = team('b', 'Blues', 'football');
  test('schema stays valid', () => assert.deepEqual(validateSchema(statSchema('football')!), []));
  test('G+A, minutes per goal, starts / off the bench, minutes per game', () => {
    const ls = [
      L(M('football', A, B, 2, 0), 'p', 'home', { goals: 2, assists: 1, minutes: 90, starts: 1 }),
      L(M('football', A, B, 1, 1), 'p', 'home', { goals: 1, assists: 0, minutes: 30, starts: 0 }),
      L(M('football', A, B, 0, 1), 'p', 'home', { goals: 0, assists: 2 }), // no line-up, no minutes
    ];
    const c = rows('football', ls);
    assert.equal(c.attack['Goals + assists'], '6');
    assert.equal(c.attack['Minutes per goal'], '40'); // 120 min ÷ 3 goals (games with minutes)
    assert.equal(c.playing.Starts, '1');
    assert.equal(c.playing['Off the bench'], '1');
    assert.equal(c.playing['Minutes per game'], '60');
    const starts = careerSections(statSchema('football')!, ls).find((s) => s.id === 'playing')!.rows.find((r) => r.key === 'started')!;
    assert.deepEqual(starts.coverage, { tracked: 2, total: 3 }); // the game without a line-up
  });
  test('no goals → no minutes per goal; no line-up anywhere → no Starts row', () => {
    const c = rows('football', [L(M('football', A, B, 0, 0), 'p', 'home', { goals: 0, minutes: 90 })]);
    assert.equal(c.attack['Minutes per goal'], undefined);
    assert.equal(c.playing.Starts, undefined);
    assert.equal(c.playing.Minutes, '90');
  });
  test('keeper: games in goal, conceded per 90 (keeper lines with minutes); Goalkeeping leads for a keeper', () => {
    const ls = [
      L(M('football', A, B, 1, 0), 'k', 'home', { cleanSheets: 1, goalsConceded: 0, saves: 3, minutes: 90 }),
      L(M('football', A, B, 1, 2), 'k', 'home', { cleanSheets: 0, goalsConceded: 2, saves: 5, minutes: 90 }),
      L(M('football', A, B, 1, 1), 'k', 'home', { goals: 1, minutes: 45 }), // outfield
    ];
    const secs = careerSections(statSchema('football')!, ls);
    assert.equal(secs[0].id, 'goalkeeping');
    const g = Object.fromEntries(secs[0].rows.map((r) => [r.label, r.value]));
    assert.equal(g['Games in goal'], '2');
    assert.equal(g['Conceded per 90'], '1.00');
    // an outfielder who kept goal once: Attack first
    const out = careerSections(statSchema('football')!, [ls[0], ls[2], L(M('football', A, B, 3, 0), 'k', 'home', { goals: 2, minutes: 90 })]);
    assert.equal(out[0].id, 'attack');
  });
});

describe('SD-46 — team stats and records', () => {
  const A = team('a', 'Reds', 'football'), B = team('b', 'Blues', 'football'), C = team('c', 'Greens', 'football');
  const ms = [
    M('football', A, B, 4, 0, { startsAt: '2025-11-01T10:00:00Z', tournamentId: 't1' }),
    M('football', C, A, 1, 2, { startsAt: '2026-02-01T10:00:00Z', tournamentId: 't1' }),
    M('football', A, C, 0, 0, { startsAt: '2026-03-01T10:00:00Z' }),
    M('football', B, A, 3, 1, { startsAt: '2026-04-01T10:00:00Z', tournamentId: 't2' }),
    M('football', A, B, 1, 0, { startsAt: '2026-05-01T10:00:00Z', tournamentId: 't2' }),
    M('football', A, B, 0, 0, { startsAt: '2026-06-01T10:00:00Z', status: 'scheduled', winner: undefined }),
  ];
  test('unit and difference label per sport', () => {
    assert.equal(teamUnit('football').diffLabel, 'Goal difference');
    assert.equal(teamUnit('basketball').diffLabel, 'Point difference');
    assert.equal(teamUnit('volleyball').diffLabel, 'Set difference');
    assert.equal(teamUnit('badminton').diffLabel, 'Game difference');
    assert.equal(teamUnit('cricket').word, 'runs');
  });
  test('per game for / against / margin', () => {
    const p = teamPerGame('football', 'a', ms)!;
    assert.deepEqual([p.games, p.forPg, p.againstPg, p.marginPg, p.diff], [5, '1.60', '0.80', '+0.80', '+4']);
  });
  test('records: biggest win, heaviest defeat, most goals, runs, clean sheets, failed to score', () => {
    const r = Object.fromEntries(teamRecords('football', 'a', ms).map((x) => [x.key, x.value]));
    assert.equal(r.biggestWin, '4–0');
    assert.equal(r.heaviestDefeat, '1–3');
    assert.equal(r.highest, '4');
    assert.equal(r.winRun, '2'); // W W (Nov, Feb)
    assert.equal(r.unbeatenRun, '3'); // W W D
    assert.equal(r.currentRun, 'W1');
    assert.equal(r.cleanSheets, '3');
    assert.equal(r.failedToScore, '1');
    const bw = teamRecords('football', 'a', ms).find((x) => x.key === 'biggestWin')!;
    assert.match(bw.detail!, /^vs Blues · 2025-11-01$/);
  });
  test('cricket: highest and lowest totals, no run-margin "biggest win"', () => {
    const X = team('x', 'Lions', 'cricket'), Y = team('y', 'Tigers', 'cricket');
    const cm = [M('cricket', X, Y, 180, 150), M('cricket', Y, X, 120, 98)];
    const keys = teamRecords('cricket', 'x', cm).map((r) => `${r.key}:${r.value}`);
    assert.ok(keys.includes('highest:180') && keys.includes('lowest:98'));
    assert.ok(!keys.some((k) => k.startsWith('biggestWin')));
    assert.equal(teamRecords('cricket', 'x', cm).find((r) => r.key === 'highest')!.label, 'Highest total');
  });
  test('sets sports: no "most sets in a match"', () => {
    const X = team('x', 'Spikers', 'volleyball'), Y = team('y', 'Blockers', 'volleyball');
    const keys = teamRecords('volleyball', 'x', [M('volleyball', X, Y, 3, 0), M('volleyball', X, Y, 3, 1)]).map((r) => r.key);
    assert.ok(keys.includes('biggestWin') && !keys.includes('highest') && !keys.includes('cleanSheets'));
  });
  test('per-game team averages from the comparison keys; untracked match not a 0; rates over all lines', () => {
    const X = team('x', 'Hoops', 'basketball'), Y = team('y', 'Dunks', 'basketball');
    const g1 = M('basketball', X, Y, 60, 50), g2 = M('basketball', Y, X, 40, 55);
    const lines = [
      L(g1, 'p1', 'home', { points: 30, rebounds: 8, freeThrowsMade: 3, freeThrowsAtt: 4 }),
      L(g1, 'p2', 'home', { points: 30, rebounds: 4, freeThrowsMade: 1, freeThrowsAtt: 4 }),
      L(g2, 'p1', 'away', { points: 55, freeThrowsMade: 2, freeThrowsAtt: 2 }, { tracked: ['points'] }),
      L(g2, 'z', 'home', { points: 40, rebounds: 30 }), // the other team
    ];
    const played = { [g1.id]: ['p1', 'p2'], [g2.id]: ['p1'] };
    const av = Object.fromEntries(teamAverages('basketball', 'x', [g1, g2], lines, played).map((a) => [a.key, a]));
    assert.equal(av.rebounds.value, '12.0'); // only g1 tracked rebounds
    assert.equal(av.rebounds.games, 1);
    assert.equal(av.freeThrowPct.value, '50%'); // 4 / 8 — g2 didn't track free throws (D8)
  });
  test('team leaders from the schema (team lines only, skips listed keys)', () => {
    const lines = [
      L(ms[0], 'p1', 'home', { goals: 3, assists: 0 }), L(ms[0], 'p2', 'home', { goals: 1, assists: 2 }),
      L(ms[0], 'z', 'away', { goals: 0, tackles: 9 }),
    ];
    const played = { [ms[0].id]: ['p1', 'p2'] };
    const ld = teamLeaders('football', 'a', ms, lines, played, ['assists']);
    assert.equal(ld[0].stat, 'goals');
    assert.equal(ld[0].playerId, 'p1');
    assert.equal(ld[0].display, '3 goals');
    assert.ok(!ld.some((l) => l.stat === 'assists' || l.stat === 'tackles'));
  });
  test('tournament / season filters', () => {
    const f = teamMatchFilters('a', ms, (id) => ({ t1: 'Winter Cup', t2: 'Summer League' })[id]);
    assert.deepEqual(f.tournaments.map((t) => `${t.label}:${t.count}`), ['Summer League:2', 'Winter Cup:2', 'Friendlies:1']);
    assert.deepEqual(f.seasons.map((s) => s.key), ['2026', '2025']);
    assert.equal(filterTeamMatches(ms, { tournament: 't1' }).length, 2);
    assert.equal(filterTeamMatches(ms, { tournament: 'friendly', season: '2026' }).length, 2); // + the scheduled one
    assert.equal(teamPerGame('football', 'a', filterTeamMatches(ms, { season: '2025' }))!.diff, '+4');
  });
});

describe('SD-47 — head-to-head and form', () => {
  const P = (id: string) => team(`t-${id}`, `Entry ${id}`, 'tennis', [id]);
  const a = P('a'), b = P('b'), c = P('c');
  const m1 = M('tennis', a, b, 2, 0, { startsAt: '2026-01-01T10:00:00Z' });
  const m2 = M('tennis', b, a, 2, 1, { startsAt: '2026-02-01T10:00:00Z' });
  const m3 = M('tennis', a, c, 2, 1, { startsAt: '2026-03-01T10:00:00Z' });
  const m4 = M('tennis', c, a, 0, 2, { startsAt: '2026-04-01T10:00:00Z' });
  const byId = new Map([m1, m2, m3, m4].map((m) => [m.id, m]));
  const lines = [
    L(m1, 'a', 'home', {}), L(m1, 'b', 'away', {}),
    L(m2, 'b', 'home', {}), L(m2, 'a', 'away', {}),
    L(m3, 'a', 'home', {}), L(m3, 'c', 'away', {}),
    L(m4, 'a', 'away', {}), // c's line missing: the singles roster tells
  ];
  test('player vs player: W-L, meetings newest first from a\'s side', () => {
    const h = playerHeadToHead('tennis', 'a', 'b', lines, byId, (m, side) => `line-${side}`);
    assert.deepEqual([h.played, h.won, h.lost], [2, 1, 1]);
    assert.deepEqual(h.meetings.map((x) => meetingText(x)), ['L 1–2 · line-away', 'W 2–0 · line-home']);
    assert.equal(h2hRecordText(h), '1W 1L');
    const r = playerHeadToHead('tennis', 'b', 'a', lines, byId);
    assert.deepEqual([r.won, r.lost], [1, 1]);
  });
  test('a missing line: the opponent\'s singles roster still counts the meeting', () => {
    const h = playerHeadToHead('tennis', 'a', 'c', lines, byId);
    assert.deepEqual([h.played, h.won], [2, 2]);
  });
  test('doubles partners are not opponents', () => {
    const X = team('x', 'Pair X', 'tennis', ['a', 'd']), Y = team('y', 'Pair Y', 'tennis', ['e', 'f']);
    const d = M('tennis', X, Y, 2, 0);
    const ls = [L(d, 'a', 'home', {}), L(d, 'd', 'home', {}), L(d, 'e', 'away', {}), L(d, 'f', 'away', {})];
    const map = new Map([[d.id, d]]);
    assert.equal(playerHeadToHead('tennis', 'a', 'd', ls, map).played, 0);
    assert.equal(playerHeadToHead('tennis', 'a', 'e', ls, map).played, 1);
    assert.deepEqual(opponentsFaced('tennis', 'a', ls, map).map((o) => o.playerId).sort(), ['e', 'f']);
  });
  test('opponents faced, most met first', () => {
    const o = opponentsFaced('tennis', 'a', lines, byId);
    assert.deepEqual(o.map((x) => `${x.playerId}:${x.played}:${x.won}-${x.lost}`), ['c:2:2-0', 'b:2:1-1']);
  });
  test('form: last results newest first, chess draw is D, a match in play is skipped', () => {
    const f = playerForm(lines.filter((l) => l.playerId === 'a'), byId, 'tennis');
    assert.deepEqual(f.map((x) => x.result), ['W', 'W', 'L', 'W']);
    const live = M('tennis', a, b, 0, 0, { status: 'live', winner: undefined, startsAt: '2026-09-01T10:00:00Z' });
    const map2 = new Map([...byId, [live.id, live]]);
    assert.equal(playerForm([...lines, { ...L(live, 'a', 'home', {}), result: undefined, pending: true }].filter((l) => l.playerId === 'a'), map2, 'tennis')[0].result, 'W');
  });
  test('team vs team + team form', () => {
    const A = team('a', 'Reds', 'football'), B = team('b', 'Blues', 'football');
    const ms = [M('football', A, B, 2, 2, { startsAt: '2026-01-01' }), M('football', B, A, 0, 1, { startsAt: '2026-02-01' })];
    const h = teamHeadToHead('a', 'b', ms);
    assert.deepEqual([h.played, h.won, h.drawn, h.lost], [2, 1, 1, 0]);
    assert.equal(meetingText(h.meetings[0]), 'W 1–0');
    assert.deepEqual(teamForm('b', ms).map((f) => f.result), ['L', 'D']);
  });
});

test('SD-47: a pre-SD-119 chess loser line naming its own side still counts as a meeting (results decide)', () => {
  const A = team('ta', 'Asha', 'chess', ['a']), B = team('tb', 'Bela', 'chess', ['b']);
  const m = M('chess', A, B, 1, 0);
  const la = L(m, 'a', 'home', {});
  const lb = { ...L(m, 'b', 'away', {}), opponent: 'Bela' }; // wrong label: names its own side
  const h = playerHeadToHead('chess', 'b', 'a', [la, lb], new Map([[m.id, m]]));
  assert.deepEqual([h.played, h.lost], [1, 1]);
  assert.equal(h.meetings[0].for, 0);
});
