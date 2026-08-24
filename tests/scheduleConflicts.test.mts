/**
 * Schedule-conflict detection (tournament gap #2): a venue can't host two
 * overlapping games, and a team can't be in two places at once. Windows are the
 * sport's nominal length; postponed/cancelled/completed games free their slot.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  findScheduleConflicts,
  knownVenueNames,
  matchDurationMinutes,
  type ConflictCandidate,
} from '../src/data/scheduleConflicts.ts';
import type { Match } from '../src/core/types.ts';

// A minimal match record — only the fields the engine reads, cast to Match.
function m(over: Partial<Match> & { id: string; startsAt: string }): Match {
  return {
    sport: 'football',
    status: 'scheduled',
    homeTeam: { id: 'h', name: 'Home' },
    awayTeam: { id: 'a', name: 'Away' },
    ...over,
  } as unknown as Match;
}

const at = (h: number, min = 0) => new Date(2026, 7, 24, h, min, 0).toISOString();

// A candidate for Main Ground at 14:00, Lions (t-lions) vs Tigers (t-tigers).
const base: ConflictCandidate = {
  sport: 'football',
  startsAt: at(14),
  venueName: 'Main Ground',
  homeTeamId: 't-lions',
  awayTeamId: 't-tigers',
  homeTeamName: 'Lions',
  awayTeamName: 'Tigers',
};

describe('findScheduleConflicts — venue', () => {
  test('flags a same-venue overlap', () => {
    const others = [m({ id: 'x', startsAt: at(15), venueName: 'Main Ground', homeTeam: { id: 'p', name: 'Panthers' }, awayTeam: { id: 'c', name: 'Cheetahs' } })];
    const c = findScheduleConflicts(base, others);
    assert.equal(c.length, 1);
    assert.equal(c[0].kind, 'venue');
  });

  test('venue name match is case/space-insensitive', () => {
    const others = [m({ id: 'x', startsAt: at(14, 30), venueName: '  main GROUND ' })];
    const c = findScheduleConflicts({ ...base, homeTeamId: null, awayTeamId: null }, others);
    assert.equal(c.filter((k) => k.kind === 'venue').length, 1);
  });

  test('no clash when the windows only touch (back-to-back, same ground)', () => {
    // football = 120 min, so a 14:00 game ends exactly at 16:00.
    const others = [m({ id: 'x', startsAt: at(16), venueName: 'Main Ground' })];
    const c = findScheduleConflicts({ ...base, homeTeamId: null, awayTeamId: null }, others);
    assert.equal(c.length, 0);
  });

  test('no clash at a different ground', () => {
    const others = [m({ id: 'x', startsAt: at(14), venueName: 'Court 2' })];
    const c = findScheduleConflicts({ ...base, homeTeamId: null, awayTeamId: null }, others);
    assert.equal(c.length, 0);
  });

  test('a blank candidate venue never venue-clashes', () => {
    const others = [m({ id: 'x', startsAt: at(14), venueName: '' })];
    const c = findScheduleConflicts({ ...base, venueName: '', homeTeamId: null, awayTeamId: null }, others);
    assert.equal(c.length, 0);
  });
});

describe('findScheduleConflicts — team', () => {
  test('flags a team already playing (as home elsewhere)', () => {
    const others = [m({ id: 'x', startsAt: at(14, 30), venueName: 'Court 2', homeTeam: { id: 't-lions', name: 'Lions' }, awayTeam: { id: 'z', name: 'Zebras' } })];
    const c = findScheduleConflicts(base, others);
    const team = c.filter((k) => k.kind === 'team');
    assert.equal(team.length, 1);
    assert.equal((team[0] as { teamName: string }).teamName, 'Lions');
  });

  test('flags a team already playing (as away elsewhere)', () => {
    const others = [m({ id: 'x', startsAt: at(13, 30), venueName: 'Court 2', homeTeam: { id: 'z', name: 'Zebras' }, awayTeam: { id: 't-tigers', name: 'Tigers' } })];
    const team = findScheduleConflicts(base, others).filter((k) => k.kind === 'team');
    assert.equal(team.length, 1);
    assert.equal((team[0] as { teamName: string }).teamName, 'Tigers');
  });

  test('same ground AND same team → two separate conflicts, venue first', () => {
    const others = [m({ id: 'x', startsAt: at(14, 30), venueName: 'Main Ground', homeTeam: { id: 't-lions', name: 'Lions' }, awayTeam: { id: 'z', name: 'Zebras' } })];
    const c = findScheduleConflicts(base, others);
    assert.equal(c.length, 2);
    assert.equal(c[0].kind, 'venue');
    assert.equal(c[1].kind, 'team');
  });
});

describe('findScheduleConflicts — slot release & self', () => {
  for (const status of ['postponed', 'cancelled', 'completed'] as const) {
    test(`a ${status} match frees its slot`, () => {
      const others = [m({ id: 'x', status, startsAt: at(14), venueName: 'Main Ground', homeTeam: { id: 't-lions', name: 'Lions' }, awayTeam: { id: 'z', name: 'Z' } })];
      assert.equal(findScheduleConflicts(base, others).length, 0);
    });
  }

  test('a live match still occupies its slot', () => {
    const others = [m({ id: 'x', status: 'live', startsAt: at(14), venueName: 'Main Ground' })];
    assert.equal(findScheduleConflicts({ ...base, homeTeamId: null, awayTeamId: null }, others).length, 1);
  });

  test('a match never clashes with itself', () => {
    const others = [m({ id: 'me', startsAt: at(14), venueName: 'Main Ground', homeTeam: { id: 't-lions', name: 'Lions' }, awayTeam: { id: 't-tigers', name: 'Tigers' } })];
    assert.equal(findScheduleConflicts({ ...base, id: 'me' }, others).length, 0);
  });

  test('window length is per-sport (kabaddi 60 min vs football 120)', () => {
    assert.equal(matchDurationMinutes('kabaddi'), 60);
    assert.equal(matchDurationMinutes('football'), 120);
    const noVenue = (extra: Partial<ConflictCandidate>): ConflictCandidate =>
      ({ ...base, homeTeamId: null, awayTeamId: null, ...extra });

    // Two kabaddi games one hour apart on the same ground sit back-to-back
    // (14:00–15:00, then 15:00–16:00) → no clash.
    const kabAt2 = [m({ id: 'k', sport: 'kabaddi', startsAt: at(14), venueName: 'Main Ground' })];
    assert.equal(findScheduleConflicts(noVenue({ sport: 'kabaddi', startsAt: at(15) }), kabAt2).length, 0);

    // Two football games the same hour apart still overlap (14:00–16:00 vs
    // 15:00–17:00) → clash. Same gap, longer sport, different verdict.
    const fbAt2 = [m({ id: 'f', sport: 'football', startsAt: at(14), venueName: 'Main Ground' })];
    assert.equal(findScheduleConflicts(noVenue({ sport: 'football', startsAt: at(15) }), fbAt2).length, 1);
  });
});

describe('knownVenueNames', () => {
  test('distinct, most-recent-first, blanks dropped, dedup case-insensitively', () => {
    const ms = [
      m({ id: '1', startsAt: at(10), venueName: 'Main Ground' }),
      m({ id: '2', startsAt: at(12), venueName: 'Court 2' }),
      m({ id: '3', startsAt: at(16), venueName: 'main ground' }), // newest use of that ground
      m({ id: '4', startsAt: at(9), venueName: '' }),             // blank → dropped
    ];
    // Newest first: id3 'main ground' (16:00), id2 'Court 2' (12:00); id1 is the
    // same ground as id3 (deduped); id4 is blank.
    assert.deepEqual(knownVenueNames(ms), ['main ground', 'Court 2']);
  });

  test('returns the first-seen casing per venue, newest match first', () => {
    const ms = [
      m({ id: '1', startsAt: at(10), venueName: 'Main Ground' }),
      m({ id: '2', startsAt: at(16), venueName: 'Court 2' }),
    ];
    assert.deepEqual(knownVenueNames(ms), ['Court 2', 'Main Ground']);
  });
});
