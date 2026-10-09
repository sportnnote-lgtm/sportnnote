import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVsQuery, orSafe, rankByName, nameTier, filterByName, capIds, collapseTeams, liveOnly, selectMatchHits,
  narrowBySports, orderSections, isSearchable, SEARCH_ID_CAP,
} from '../src/data/search.ts';

test('parseVsQuery splits a match query on vs / v / v/s / x', () => {
  assert.deepEqual(parseVsQuery('Red vs Blue'), ['Red', 'Blue']);
  assert.deepEqual(parseVsQuery('red v blue'), ['red', 'blue']);
  assert.deepEqual(parseVsQuery('RED'), ['RED']);
  assert.deepEqual(parseVsQuery('a x b'), ['a', 'b']);
  assert.deepEqual(parseVsQuery('India v/s Pakistan'), ['India', 'Pakistan']);
  assert.deepEqual(parseVsQuery('  Red House  VS.  Blue House '), ['Red House', 'Blue House']);
  // a word that merely contains v / x is not a separator
  assert.deepEqual(parseVsQuery('Vasant Valley'), ['Vasant Valley']);
  assert.deepEqual(parseVsQuery('Max Xavier'), ['Max Xavier']);
  // a dangling separator keeps the whole query
  assert.deepEqual(parseVsQuery('Red vs'), ['Red vs']);
});

test('orSafe strips PostgREST or() syntax and wildcards', () => {
  assert.equal(orSafe("St. Mary's (U14), 100%"), "St. Mary's U14 100");
  assert.equal(orSafe('a*b\\c'), 'a b c');
  assert.equal(orSafe(' ,() '), '');
  assert.equal(orSafe('Red House'), 'Red House');
});

test('nameTier: exact < starts with < word starts with < contains < none', () => {
  assert.equal(nameTier('Red', 'red'), 0);
  assert.equal(nameTier('Red House', 'red'), 1);
  assert.equal(nameTier('St Fred Red', 're'), 2);
  assert.equal(nameTier('Fred', 'red'), 3);
  assert.equal(nameTier('Blue', 'red'), 4);
  assert.equal(nameTier("St. Mary's", 'mary'), 2);
  assert.equal(nameTier('Red', '  '), 4);
});

test('rankByName orders exact, starts-with, word, contains; ties keep input order', () => {
  const items = ['Bored Kids', 'Fred', 'Redwood', 'Blue', 'Red', 'Red House', 'The Reds'];
  assert.deepEqual(rankByName(items, 'red', (s) => s), ['Red', 'Redwood', 'Red House', 'The Reds', 'Bored Kids', 'Fred', 'Blue']);
  // best of several names (name + short name)
  const teams = [{ n: 'Alpha', s: 'ALP' }, { n: 'Bravo Red', s: 'RED' }];
  assert.deepEqual(rankByName(teams, 'red', (t) => [t.n, t.s]).map((t) => t.n), ['Bravo Red', 'Alpha']);
  // does not mutate
  assert.deepEqual(items[0], 'Bored Kids');
  assert.deepEqual(filterByName(items, 'red', (s) => s), ['Red', 'Redwood', 'Red House', 'The Reds', 'Bored Kids', 'Fred']);
});

test('isSearchable: 2+ letters, or a whole phone / email', () => {
  assert.equal(isSearchable('r'), false);
  assert.equal(isSearchable(' re '), true);
  assert.equal(isSearchable('9876543210'), true);
  assert.equal(isSearchable('a@b.co'), true);
});

test('capIds keeps the first 50 distinct ids (best-ranked first)', () => {
  const ids = Array.from({ length: 80 }, (_, i) => `t${i}`);
  const capped = capIds(['t0', ...ids, null, undefined]);
  assert.equal(capped.length, SEARCH_ID_CAP);
  assert.equal(SEARCH_ID_CAP, 50);
  assert.deepEqual(capped.slice(0, 2), ['t0', 't1']);
  assert.equal(capped.at(-1), 't49');
  assert.deepEqual(capIds(['a', 'a', 'b']), ['a', 'b']);
});

const team = (id: string, name: string, sport = 'football', clubId?: string) =>
  ({ id, name, shortName: name.slice(0, 3).toUpperCase(), sport, clubId }) as any;

test('collapseTeams: one hit per club, listing every sport and row id', () => {
  const hits = collapseTeams([
    team('r-fb', 'Red House', 'football', 'club-red'),
    team('rw', 'Redwood'),
    team('r-cr', 'Red House', 'cricket', 'club-red'),
    team('r-fb2', 'Red House', 'football', 'club-red'),
  ]);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].team.id, 'r-fb');
  assert.deepEqual(hits[0].sports, ['football', 'cricket']);
  assert.deepEqual(hits[0].teamIds, ['r-fb', 'r-cr', 'r-fb2']);
  assert.deepEqual(hits[1].teamIds, ['rw']);
});

const match = (id: string, home: string, away: string, tournamentId: string | undefined, startsAt: string, sport = 'football') =>
  ({ id, sport, status: 'completed', startsAt, tournamentId, homeTeam: team(home, home), awayTeam: team(away, away) }) as any;

const MATCHES = [
  match('m1', 'red', 'blue', 'T1', '2026-01-01'),
  match('m2', 'blue', 'red', 'T1', '2026-03-01'),
  match('m3', 'red', 'green', 'T2', '2026-02-01'),
  match('m4', 'green', 'gold', 'T2', '2026-04-01'),
  match('m5', 'red', 'blue', 'DEL', '2026-05-01'), // finished, but its tournament was deleted
  match('m6', 'gold', 'blue', undefined, '2026-06-01'),
];

test('selectMatchHits: "Red vs Blue" keeps only Red–Blue matches, either way round, newest first', () => {
  const hits = selectMatchHits(MATCHES, { a: ['red'], b: ['blue'], deletedTournamentIds: ['DEL'] });
  assert.deepEqual(hits.map((m) => m.id), ['m2', 'm1']);
});

test('selectMatchHits: a team or tournament query; deleted tournaments drop ALL their matches', () => {
  assert.deepEqual(selectMatchHits(MATCHES, { a: ['red'], deletedTournamentIds: ['DEL'] }).map((m) => m.id), ['m2', 'm3', 'm1']);
  assert.deepEqual(selectMatchHits(MATCHES, { a: [], tournamentIds: ['T2'] }).map((m) => m.id), ['m4', 'm3']);
  // without the delete list the deleted tournament's (completed) match would show
  assert.ok(selectMatchHits(MATCHES, { a: ['red'] }).some((m) => m.id === 'm5'));
  assert.ok(!selectMatchHits(MATCHES, { a: ['red'], tournamentIds: ['DEL'], deletedTournamentIds: ['DEL'] }).some((m) => m.id === 'm5'));
});

test('liveOnly excludes a soft-deleted tournament', () => {
  const ts = [{ id: 'a', name: 'Annual Meet' }, { id: 'b', name: 'Annual Cup', deletedAt: '2026-10-01T00:00:00Z' }] as any[];
  assert.deepEqual(liveOnly(ts).map((t) => t.id), ['a']);
});

test('narrowBySports narrows teams, matches and tournaments (not players)', () => {
  const r = {
    players: [{ id: 'p' }],
    teams: [{ team: team('a', 'A'), sports: ['football', 'cricket'], teamIds: ['a'] }, { team: team('b', 'B'), sports: ['chess'], teamIds: ['b'] }],
    matches: [match('m1', 'a', 'b', undefined, '2026-01-01', 'cricket'), match('m2', 'a', 'b', undefined, '2026-01-01', 'chess')],
    tournaments: [{ id: 't1', sports: ['cricket'] }, { id: 't2', sports: ['chess'] }],
  } as any;
  const n = narrowBySports(r, ['cricket'] as any);
  assert.equal(n.players.length, 1);
  assert.deepEqual(n.teams.map((t: any) => t.team.id), ['a']);
  assert.deepEqual(n.matches.map((m: any) => m.id), ['m1']);
  assert.deepEqual(n.tournaments.map((t: any) => t.id), ['t1']);
  assert.equal(narrowBySports(r, []), r);
});

test('orderSections: exact-name types first, empty types dropped', () => {
  const counts = { players: 3, teams: 2, matches: 0, tournaments: 1 };
  assert.deepEqual(orderSections({}, counts), ['players', 'teams', 'tournaments']);
  assert.deepEqual(orderSections({ tournaments: true }, counts), ['tournaments', 'players', 'teams']);
  assert.deepEqual(orderSections({ matches: true }, counts), ['players', 'teams', 'tournaments']);
});
