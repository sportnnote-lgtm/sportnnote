/**
 * Tournament registration controls (gap #6): open flag, deadline, capacity
 * (min/max), and which entry statuses occupy a real spot. See
 * src/core/registration.ts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { registrationState, activeEntries, joinBlockReason } from '../src/core/registration.ts';
import type { Tournament, TournamentEntry } from '../src/core/types.ts';

const NOW = Date.parse('2026-08-25T12:00:00Z');
const entry = (id: string, status: TournamentEntry['status']): TournamentEntry =>
  ({ team: { id, name: id } as TournamentEntry['team'], status });
const T = (over: Partial<Tournament>): Tournament => ({ isOpen: true, ...over } as Tournament);

describe('activeEntries', () => {
  test('counts confirmed + invited, not pending/withdrawn', () => {
    const es = [entry('a', 'confirmed'), entry('b', 'invited'), entry('c', 'pending'), entry('d', 'withdrawn')];
    assert.deepEqual(activeEntries(es).map((e) => e.team.id), ['a', 'b']);
  });
});

describe('registrationState', () => {
  test('open with no limits', () => {
    const s = registrationState(T({}), 3, NOW);
    assert.equal(s.open, true);
    assert.equal(s.spotsLeft, undefined);
    assert.match(s.label, /Open for registration/);
  });
  test('closed when not open', () => {
    const s = registrationState(T({ isOpen: false }), 0, NOW);
    assert.equal(s.open, false);
    assert.equal(s.reason, 'not_open');
  });
  test('deadline in the past closes it', () => {
    const s = registrationState(T({ registrationDeadline: '2026-08-24T00:00:00Z' }), 0, NOW);
    assert.equal(s.open, false);
    assert.equal(s.reason, 'deadline_passed');
  });
  test('deadline in the future keeps it open', () => {
    const s = registrationState(T({ registrationDeadline: '2026-08-30T00:00:00Z' }), 0, NOW);
    assert.equal(s.open, true);
  });
  test('capacity: spots left, then full', () => {
    assert.equal(registrationState(T({ maxTeams: 8 }), 5, NOW).spotsLeft, 3);
    assert.match(registrationState(T({ maxTeams: 8 }), 5, NOW).label, /3 spots left/);
    assert.equal(registrationState(T({ maxTeams: 8 }), 7, NOW).spotsLeft, 1);
    assert.match(registrationState(T({ maxTeams: 8 }), 7, NOW).label, /1 spot left/);
    const full = registrationState(T({ maxTeams: 8 }), 8, NOW);
    assert.equal(full.open, false);
    assert.equal(full.reason, 'full');
  });
  test('belowMin flag', () => {
    assert.equal(registrationState(T({ minTeams: 6 }), 4, NOW).belowMin, true);
    assert.equal(registrationState(T({ minTeams: 6 }), 6, NOW).belowMin, false);
  });
  test('not_open takes priority over a would-be-open capacity', () => {
    const s = registrationState(T({ isOpen: false, maxTeams: 8 }), 2, NOW);
    assert.equal(s.reason, 'not_open');
  });
});

describe('joinBlockReason', () => {
  test('null when open with room', () => {
    assert.equal(joinBlockReason(T({ maxTeams: 8 }), [entry('a', 'confirmed')], NOW), null);
  });
  test('capacity counts entered (not pending) teams', () => {
    const entries = [entry('a', 'confirmed'), entry('b', 'invited'), entry('c', 'pending')];
    // 2 entered, cap 2 → full despite a pending request in the list.
    assert.match(joinBlockReason(T({ maxTeams: 2 }), entries, NOW)!, /full/);
  });
  test('deadline message', () => {
    assert.match(joinBlockReason(T({ registrationDeadline: '2026-08-24T00:00:00Z' }), [], NOW)!, /deadline/);
  });
  test('a withdrawn team frees its spot (can re-request)', () => {
    const entries = [entry('a', 'confirmed'), entry('b', 'withdrawn')];
    assert.equal(joinBlockReason(T({ maxTeams: 2 }), entries, NOW), null); // only 1 entered
  });
});
