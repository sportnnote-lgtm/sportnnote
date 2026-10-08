/** Parity #11 — per-match officials: sport slots, normalising, the summary line. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotsFor, normalizeOfficials, officialsLine, isCommentarySlot, OFFICIAL_SLOTS } from '../src/data/matchOfficials.ts';

test('slotsFor: sport-specific slots', () => {
  assert.deepEqual(slotsFor('cricket').map((s) => s.label), ['Umpire 1', 'Umpire 2', 'Third umpire', 'Match referee', 'Commentator']);
  assert.deepEqual(slotsFor('football').map((s) => s.label), ['Referee', 'Assistant referee 1', 'Assistant referee 2', 'Fourth official', 'Commentator']);
  assert.deepEqual(slotsFor('basketball').map((s) => s.label), ['Crew chief', 'Umpire 1', 'Umpire 2', 'Table official', 'Commentator']);
  assert.deepEqual(slotsFor('kabaddi').map((s) => s.label), ['Referee', 'Umpire 1', 'Umpire 2', 'Commentator']);
  assert.deepEqual(slotsFor('volleyball').map((s) => s.label), ['1st referee', '2nd referee', 'Line judge', 'Commentator']);
});

test('slotsFor: fallback for other / unknown sports', () => {
  for (const s of ['badminton', 'tennis', 'chess', 'nope', undefined]) {
    assert.deepEqual(slotsFor(s as never).map((x) => x.label), ['Referee/Umpire', 'Commentator']);
  }
  for (const list of Object.values(OFFICIAL_SLOTS)) {
    assert.equal(new Set(list!.map((s) => s.key)).size, list!.length, 'unique keys');
    assert.equal(list!.at(-1)!.key, 'commentator');
  }
  assert.ok(isCommentarySlot('commentator'));
  assert.ok(!isCommentarySlot('umpire1'));
});

test('normalizeOfficials drops bad rows, unknown slots and duplicates', () => {
  assert.deepEqual(normalizeOfficials(null), []);
  assert.deepEqual(normalizeOfficials({ slot: 'umpire1' }), []);
  const raw = [
    'x', null, 42,
    { slot: 'umpire2', name: '  Mr Rao ' },
    { slot: 'umpire1', name: 'Ms Iyer', playerId: 'p1' },
    { slot: 'umpire1', name: 'Dup' },
    { slot: 'ar1', name: 'Football slot' },
    { slot: 'commentator', name: '' },
    { slot: 'commentator', name: 'Ravi', playerId: 7 },
    { name: 'No slot' },
  ];
  assert.deepEqual(normalizeOfficials(raw, 'cricket'), [
    { slot: 'umpire1', name: 'Ms Iyer', playerId: 'p1' },
    { slot: 'umpire2', name: 'Mr Rao' },
    { slot: 'commentator', name: 'Ravi' },
  ]);
  // without a sport, any known slot is kept
  assert.equal(normalizeOfficials(raw).some((o) => o.slot === 'ar1'), true);
  assert.equal(normalizeOfficials([{ slot: 'bogus', name: 'X' }]).length, 0);
});

test('officialsLine groups by role in slot order', () => {
  assert.equal(officialsLine([
    { slot: 'commentator', name: 'D' },
    { slot: 'umpire2', name: 'B' },
    { slot: 'match_referee', name: 'C' },
    { slot: 'umpire1', name: 'A' },
  ], 'cricket'), 'Umpires: A, B · Referee: C · Commentary: D');
  assert.equal(officialsLine([{ slot: 'umpire1', name: 'A' }], 'cricket'), 'Umpire: A');
  assert.equal(officialsLine([
    { slot: 'referee', name: 'R' }, { slot: 'ar1', name: 'X' }, { slot: 'ar2', name: 'Y' },
  ], 'football'), 'Referee: R · Assistant referees: X, Y');
  assert.equal(officialsLine([{ slot: 'referee', name: 'Z' }], 'badminton'), 'Referee: Z');
  assert.equal(officialsLine([], 'cricket'), '');
  assert.equal(officialsLine([{ slot: 'ar1', name: 'X' }], 'cricket'), '');
});
