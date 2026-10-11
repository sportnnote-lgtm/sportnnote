/**
 * SD-123 — a match sport's medal places come from the tournament structure:
 * final W/L, 3rd-place match or shared bronze, the round each team went out in
 * (=5, =9 …), then group positions; league order only when there's no
 * knockout. Team ties count once; singles players credit their house; a
 * "medals first" order sits alongside the points table.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { medalStandings, compareMedalRows, houseContingent, type ContingentOf } from '../src/data/medalStandings.ts';
import { sportPlaces } from '../src/data/bracketPlaces.ts';
import { defaultStandingsConfig } from '../src/data/standings.ts';
import { seriesLegFormat } from '../src/data/series.ts';
import type { Match, SportId, TournamentScoring } from '../src/core/types.ts';

let n = 0;
let clock = 0;
function m(sport: SportId, home: string, away: string, hs: number, as: number, o: { stage?: string; group?: string; format?: Record<string, unknown>; status?: string } = {}): Match {
  clock += 1;
  return {
    id: `x${n++}`, sport, status: o.status ?? 'completed', startsAt: `2026-10-11T${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}:00Z`,
    ...(o.status && o.status !== 'completed' ? {} : { winner: hs > as ? 'home' : hs < as ? 'away' : 'draw', score: { home: hs, away: as } }),
    homeTeam: { id: `${sport}-${home}`, name: home }, awayTeam: { id: `${sport}-${away}`, name: away },
    stage: o.stage, group: o.group, format: o.format, state: null,
  } as unknown as Match;
}
const PTS: TournamentScoring = { mode: 'position', positionPoints: [10, 7, 5, 3, 2, 2, 1, 1] };
const place = (rows: ReturnType<typeof medalStandings>, name: string, sport: SportId = 'football') =>
  rows.find((r) => r.name === name)?.perSport.find((p) => p.sport === sport);

describe('groups → knockout', () => {
  // Group A: A wins all; Group B: E wins all. SF: A v F, E v B. Final: E beats A.
  const ms = [
    m('football', 'A', 'B', 3, 0, { group: 'A', stage: 'group' }), m('football', 'A', 'C', 3, 0, { group: 'A', stage: 'group' }),
    m('football', 'A', 'D', 3, 0, { group: 'A', stage: 'group' }), m('football', 'B', 'C', 1, 0, { group: 'A', stage: 'group' }),
    m('football', 'B', 'D', 1, 0, { group: 'A', stage: 'group' }), m('football', 'C', 'D', 1, 0, { group: 'A', stage: 'group' }),
    m('football', 'E', 'F', 1, 0, { group: 'B', stage: 'group' }), m('football', 'E', 'G', 1, 0, { group: 'B', stage: 'group' }),
    m('football', 'E', 'H', 1, 0, { group: 'B', stage: 'group' }), m('football', 'F', 'G', 1, 0, { group: 'B', stage: 'group' }),
    m('football', 'F', 'H', 1, 0, { group: 'B', stage: 'group' }), m('football', 'G', 'H', 1, 0, { group: 'B', stage: 'group' }),
    m('football', 'A', 'F', 2, 0, { stage: 'sf' }), m('football', 'E', 'B', 2, 1, { stage: 'sf' }),
    m('football', 'B', 'F', 1, 0, { stage: 'third' }),
    m('football', 'E', 'A', 1, 0, { stage: 'final' }),
  ];
  test('gold goes to the final winner, not the best group record', () => {
    const t = medalStandings(ms, ['football'], PTS);
    assert.equal(t[0].name, 'E');
    assert.equal(place(t, 'E')!.position, 1);
    assert.equal(place(t, 'A')!.position, 2);
    assert.equal(place(t, 'B')!.position, 3); // won the 3rd-place match
    assert.equal(place(t, 'F')!.position, 4);
    assert.equal(t.find((r) => r.name === 'A')!.silvers, 1);
  });
  test('group exits are banded by group position after the knockout places', () => {
    const t = medalStandings(ms, ['football'], PTS);
    // C and G finished 3rd in their groups → =5 (points of 5th + 6th split); D, H 4th → =7.
    assert.deepEqual([place(t, 'C')!.position, place(t, 'C')!.shared, place(t, 'C')!.points], [5, 2, 2]);
    assert.deepEqual([place(t, 'G')!.position, place(t, 'H')!.position, place(t, 'D')!.points], [5, 7, 1]);
  });
  test('no places yet while the final is unplayed — only the decided bands', () => {
    const open = ms.map((x) => (x.stage === 'final' || x.stage === 'third' ? { ...x, status: 'scheduled', winner: undefined } as Match : x));
    const p = sportPlaces(open, 'football', defaultStandingsConfig('football'));
    assert.equal(p.places.find((x) => x.teamId === 'football-E'), undefined);
    assert.equal(p.places.find((x) => x.teamId === 'football-B'), undefined); // 3rd-place match to come
    assert.equal(p.places.find((x) => x.teamId === 'football-C')!.position, 5);
  });
});

describe('straight knockout', () => {
  // QF: A>B, C>D, E>F, G>H; SF: A>C, E>G; no 3rd-place match; Final: A>E.
  const ms = [
    m('hockey', 'A', 'B', 2, 0, { stage: 'qf' }), m('hockey', 'C', 'D', 2, 0, { stage: 'qf' }),
    m('hockey', 'E', 'F', 2, 0, { stage: 'qf' }), m('hockey', 'G', 'H', 2, 0, { stage: 'qf' }),
    m('hockey', 'A', 'C', 1, 0, { stage: 'sf' }), m('hockey', 'E', 'G', 1, 0, { stage: 'sf' }),
    m('hockey', 'A', 'E', 3, 2, { stage: 'final' }),
  ];
  test('final W/L, shared bronze for both semi losers, QF losers =5', () => {
    const t = medalStandings(ms, ['hockey'], PTS);
    const h = (x: string) => place(t, x, 'hockey')!;
    assert.deepEqual([h('A').position, h('E').position, h('C').position, h('G').position, h('B').position], [1, 2, 3, 3, 5]);
    // joint 3rd splits 3rd + 4th points (5+3)/2; =5 of 4 splits 5th–8th (2+2+1+1)/4
    assert.equal(h('C').points, 4);
    assert.equal(h('B').points, 1.5);
    assert.equal(t.find((r) => r.name === 'C')!.bronzes, 1);
    assert.equal(t.find((r) => r.name === 'G')!.bronzes, 1);
  });
  test('QF losers are placed =5 before the semis are even played', () => {
    const p = sportPlaces(ms.slice(0, 4), 'hockey', defaultStandingsConfig('hockey'));
    assert.deepEqual(p.places.map((x) => [x.name, x.position, x.shared]), [['B', 5, 4], ['D', 5, 4], ['F', 5, 4], ['H', 5, 4]]);
  });
  test('shared bronze setting ignores a 3rd-place match', () => {
    const withThird = [...ms, m('hockey', 'C', 'G', 1, 0, { stage: 'third' })];
    const playoff = medalStandings(withThird, ['hockey'], PTS);
    assert.deepEqual([place(playoff, 'C', 'hockey')!.position, place(playoff, 'G', 'hockey')!.position], [3, 4]);
    const shared = medalStandings(withThird, ['hockey'], { ...PTS, sharedBronze: { hockey: true } });
    assert.deepEqual([place(shared, 'C', 'hockey')!.position, place(shared, 'G', 'hockey')!.position], [3, 3]);
    assert.equal(shared.find((r) => r.name === 'G')!.bronzes, 1);
  });
  test('a knockout sport with no knockout match yet has no places', () => {
    const groupsOnly = [m('hockey', 'A', 'B', 1, 0, { group: 'A', stage: 'group' })];
    const t = medalStandings(groupsOnly, ['hockey'], PTS, { hockey: { structShape: 'groups' } as never });
    assert.deepEqual(t, []);
  });
});

describe('league only', () => {
  test('league order (unchanged)', () => {
    const ms = [m('volleyball', 'A', 'B', 3, 0), m('volleyball', 'A', 'C', 3, 0), m('volleyball', 'B', 'C', 3, 1)];
    const t = medalStandings(ms, ['volleyball'], PTS);
    assert.deepEqual(t.map((r) => [r.name, r.total]), [['A', 10], ['B', 7], ['C', 5]]);
  });
  test('league + IPL playoff: final W/L, Q2 loser 3rd, Eliminator loser 4th, rest in league order', () => {
    const lg = [
      m('cricket', 'A', 'E', 9, 1), m('cricket', 'B', 'E', 9, 1), m('cricket', 'C', 'E', 9, 1), m('cricket', 'D', 'E', 9, 1),
      m('cricket', 'A', 'B', 9, 1), m('cricket', 'A', 'C', 9, 1), m('cricket', 'B', 'C', 9, 1), m('cricket', 'C', 'D', 9, 1), m('cricket', 'B', 'D', 9, 1), m('cricket', 'A', 'D', 9, 1),
      m('cricket', 'A', 'B', 9, 1, { stage: 'q1' }), m('cricket', 'C', 'D', 9, 1, { stage: 'eliminator' }),
      m('cricket', 'B', 'C', 1, 9, { stage: 'q2' }), m('cricket', 'C', 'A', 9, 1, { stage: 'final' }),
    ];
    const t = medalStandings(lg, ['cricket'], PTS);
    const c = (x: string) => place(t, x, 'cricket')!.position;
    assert.deepEqual([c('C'), c('A'), c('B'), c('D'), c('E')], [1, 2, 3, 4, 5]);
  });
});

describe('team ties count as one fixture', () => {
  // TT team final: Blue v Red, 3 rubbers, Red wins 2–1. Semis by single ties too.
  const tie = (A: string, B: string, res: string, stage: string): Match[] => {
    const id = `tie-${A}-${B}`;
    return [...res].map((r, i) => m('tabletennis', A, B, r === 'A' ? 3 : 1, r === 'A' ? 1 : 3, {
      stage, format: seriesLegFormat({ id, format: 'rubbers', legs: 3, leg: i + 1, teamAId: `tabletennis-${A}` }) as Record<string, unknown>,
    }));
  };
  test('the tie winner takes gold; rubbers are not counted as games', () => {
    const ms = [...tie('Blue', 'Gold', 'AAB', 'sf'), ...tie('Red', 'Green', 'ABA', 'sf'), ...tie('Blue', 'Red', 'ABB', 'final')];
    const t = medalStandings(ms, ['tabletennis'], PTS);
    const p = (x: string) => place(t, x, 'tabletennis')!;
    assert.deepEqual([p('Red').position, p('Blue').position, p('Gold').position, p('Green').position], [1, 2, 3, 3]);
    assert.equal(p('Red').played, 2); // two ties, not six rubbers
  });
});

describe('singles credit the player’s house', () => {
  test('both finalists from one house → that house gets gold and silver', () => {
    const ms = [
      m('badminton', 'Asha', 'Bina', 2, 0, { stage: 'sf' }), m('badminton', 'Chitra', 'Devi', 2, 1, { stage: 'sf' }),
      m('badminton', 'Asha', 'Chitra', 2, 1, { stage: 'final' }),
    ];
    const house: Record<string, string> = { Asha: 'Red House', Chitra: 'Red House', Bina: 'Blue House', Devi: 'Green House' };
    const contingentOf: ContingentOf = (e) => (house[e.name] ? { name: house[e.name] } : undefined);
    const t = medalStandings(ms, ['badminton'], PTS, undefined, undefined, contingentOf);
    const red = t.find((r) => r.name === 'Red House')!;
    assert.deepEqual([red.golds, red.silvers, red.total], [1, 1, 17]);
    assert.deepEqual(red.perSport.map((p) => p.entrant), ['Asha', 'Chitra']);
    assert.equal(t.find((r) => r.name === 'Asha'), undefined); // no player-named contingent
    assert.equal(t.find((r) => r.name === 'Blue House')!.bronzes, 1);
  });
});

describe('medals first', () => {
  test('golds beat a bigger points total', () => {
    const rows = [
      { name: 'Many', teamId: 'a', total: 40, golds: 0, silvers: 5, bronzes: 3, perSport: [] },
      { name: 'Gold', teamId: 'b', total: 10, golds: 1, silvers: 0, bronzes: 0, perSport: [] },
    ];
    assert.deepEqual(rows.slice().sort(compareMedalRows('medals')).map((r) => r.name), ['Gold', 'Many']);
    assert.deepEqual(rows.slice().sort(compareMedalRows('points')).map((r) => r.name), ['Many', 'Gold']);
  });
  test('medalStandings honours rankBy', () => {
    // football: A gold; cricket: B silver + C gold, A bronze (league orders)
    const fb = [m('football', 'A', 'B', 1, 0), m('football', 'A', 'C', 1, 0), m('football', 'B', 'C', 1, 0)];
    const ck = [m('cricket', 'C', 'B', 9, 1), m('cricket', 'C', 'A', 9, 1), m('cricket', 'B', 'A', 9, 1)];
    const pts: TournamentScoring = { mode: 'position', positionPoints: [5, 4, 3] };
    // points: A 5+3=8, B 4+4=8, C 3+5=8 → golds break: A, C (1 each, silvers A 0 C 0 bronzes A1 C1)...
    const medals = medalStandings([...fb, ...ck], ['football', 'cricket'], { ...pts, rankBy: 'medals' });
    assert.deepEqual(medals.map((r) => r.golds), [1, 1, 0]);
    assert.equal(medals[2].name, 'B');
  });
});

describe('houseContingent (singles → house)', () => {
  const players = [
    { id: 'p1', fullName: 'Asha Rao', houseName: 'Red House', houseColor: '#e11' },
    { id: 'p2', fullName: 'Bina Shah', houseName: 'Blue House' },
    { id: 'p3', fullName: 'Chitra Iyer', houseName: 'Red House' },
    { id: 'p4', fullName: 'Devi Nair' },
  ];
  const rosters = new Map([['t1', ['p1']], ['pairX', ['p1', 'p3']], ['pairY', ['p1', 'p2']]]);
  const of = houseContingent(new Set<SportId>(['badminton']), rosters, players);
  test('roster player → their house; name match when there is no roster', () => {
    assert.deepEqual(of({ id: 't1', name: 'Asha' }, 'badminton'), { name: 'Red House', colorHex: '#e11' });
    assert.equal(of({ id: 'tz', name: 'Bina Shah' }, 'badminton')!.name, 'Blue House');
  });
  test('a same-house pair scores for the house; a mixed pair or no house stays itself', () => {
    assert.equal(of({ id: 'pairX', name: 'Asha / Chitra' }, 'badminton')!.name, 'Red House');
    assert.equal(of({ id: 'pairY', name: 'Asha / Bina' }, 'badminton'), undefined);
    assert.equal(of({ id: 'tq', name: 'Devi Nair' }, 'badminton'), undefined);
  });
  test('team sports are untouched', () => {
    assert.equal(of({ id: 't1', name: 'Asha' }, 'football'), undefined);
  });
});
