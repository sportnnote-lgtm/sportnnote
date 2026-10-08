import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLiveTournament, inlineFieldKeys, categoryFromOrgType, venueOptions, addGround } from '../src/data/tournamentForm.ts';

test('inline basics = presets + onCreate fields', () => {
  const fields = [
    { key: 'preset', type: 'preset' }, { key: 'overs', type: 'number' },
    { key: 'ballType', type: 'choice', onCreate: true }, { key: 'pitchType', type: 'choice', onCreate: true },
    { key: 'freeHit', type: 'toggle' },
  ];
  assert.deepEqual(inlineFieldKeys(fields), ['preset', 'ballType', 'pitchType']);
  assert.deepEqual(inlineFieldKeys([{ key: 'rounds', type: 'number' }]), []); // chess-like: none
  assert.deepEqual(inlineFieldKeys(undefined), []);
});

test('category prefill from org type', () => {
  assert.equal(categoryFromOrgType('School'), 'school');
  assert.equal(categoryFromOrgType('College'), 'college');
  assert.equal(categoryFromOrgType('University'), 'university');
  assert.equal(categoryFromOrgType('Company'), 'corporate');
  assert.equal(categoryFromOrgType('Residents club'), 'community');
  assert.equal(categoryFromOrgType(''), undefined);
  assert.equal(categoryFromOrgType('Something else'), undefined);
});

test('grounds lead and dedupe the venue list', () => {
  assert.deepEqual(venueOptions(['Main Ground', 'Turf B'], ['turf b', 'Old Field', 'main ground']), ['Main Ground', 'Turf B', 'Old Field']);
  assert.deepEqual(venueOptions(undefined, ['A', 'a']), ['A']);
  assert.deepEqual(addGround(['Main'], ' main '), ['Main']);
  assert.deepEqual(addGround(['Main'], 'Back field'), ['Main', 'Back field']);
  assert.deepEqual(addGround([], '  '), []);
});

test('deletedAt filter', () => {
  assert.equal(isLiveTournament({}), true);
  assert.equal(isLiveTournament({ deletedAt: '2026-10-09T10:00:00Z' }), false);
  assert.equal(isLiveTournament(null), false);
});
