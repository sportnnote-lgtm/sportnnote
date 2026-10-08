import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTeams } from '../src/core/teamSearch.ts';

const teams = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, name: `Team ${String(i).padStart(2, '0')}`, shortName: `T${i}` }))
  .concat([
    { id: 'red', name: 'Red House', shortName: 'RED' },
    { id: 'redw', name: 'Redwood School', shortName: 'RWS' },
    { id: 'fred', name: 'St Fred', shortName: 'SFD' },
    { id: 'blue', name: 'Blue House', shortName: 'BLU' },
  ]);

test('filterTeams: "red" matches name case-insensitively', () => {
  assert.deepEqual(filterTeams(teams, 'red', []).map((t) => t.id), ['red', 'redw', 'fred']);
  assert.deepEqual(filterTeams(teams, 'RED', []).map((t) => t.id), ['red', 'redw', 'fred']);
});

test('filterTeams: matches short name', () => {
  assert.deepEqual(filterTeams(teams, 'blu', []).map((t) => t.id), ['blue']);
  assert.deepEqual(filterTeams(teams, 'rws', []).map((t) => t.id), ['redw']);
});

test('filterTeams: selected first, then alphabetical', () => {
  assert.deepEqual(filterTeams(teams, 'red', ['fred']).map((t) => t.id), ['fred', 'red', 'redw']);
  const all = filterTeams(teams, '  ', ['blue', 't59']);
  assert.equal(all.length, 64);
  assert.deepEqual(all.slice(0, 3).map((t) => t.id), ['blue', 't59', 'red']);
});

test('filterTeams: does not mutate input; no hits → empty', () => {
  const copy = [...teams];
  filterTeams(teams, 'x', ['t1']);
  assert.deepEqual(teams, copy);
  assert.deepEqual(filterTeams(teams, 'zzz', []), []);
});
