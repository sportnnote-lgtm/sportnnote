/**
 * Match-driven (staged) knockout bracket — the real bracket a tournament shows:
 * its actual knockout matches grouped by `stage`, and the round-to-round
 * progression that seeds the next round from a completed one.
 * See src/data/bracket.ts (knockoutStageRounds / nextRoundPairs / …).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  knockoutStageRounds, nextRoundPairs, matchWinnerId, stageForTeams, stageChampionId,
  isKoStage, koStageRank, type KnockoutRound,
} from '../src/data/bracket.ts';
import type { Match } from '../src/core/types.ts';

// A knockout match: home vs away, tagged with its stage; `hs`/`as` decide the winner.
const km = (id: string, stage: string, homeId: string, awayId: string, hs?: number, as?: number, startsAt = ''): Match =>
  ({
    id, sport: 'football', stage, status: hs == null ? 'scheduled' : 'completed', startsAt,
    score: hs == null ? undefined : { home: hs, away: as }, winner: hs == null ? undefined : hs > as! ? 'home' : hs < as! ? 'away' : 'draw',
    homeTeam: { id: homeId, name: homeId }, awayTeam: { id: awayId, name: awayId }, state: null,
  }) as unknown as Match;

describe('stage helpers', () => {
  test('isKoStage accepts knockout stages, rejects group/none', () => {
    assert.ok(isKoStage('qf'));
    assert.ok(isKoStage('final'));
    assert.ok(!isKoStage('group'));
    assert.ok(!isKoStage(undefined));
  });
  test('stageForTeams maps a field size to its round', () => {
    assert.equal(stageForTeams(2), 'final');
    assert.equal(stageForTeams(4), 'sf');
    assert.equal(stageForTeams(8), 'qf');
    assert.equal(stageForTeams(16), 'r16');
    assert.equal(stageForTeams(32), 'r32');
  });
  test('koStageRank orders biggest field first, final last', () => {
    assert.ok(koStageRank('r32') < koStageRank('qf'));
    assert.ok(koStageRank('sf') < koStageRank('final'));
  });
});

describe('knockoutStageRounds', () => {
  const matches: Match[] = [
    km('f', 'final', 'A', 'B'),
    km('q1', 'qf', 'A', 'H', 2, 0), km('q2', 'qf', 'D', 'E', 1, 3),
    km('s1', 'sf', 'A', 'C'), km('s2', 'sf', 'F', 'B'),
    km('g1', 'group', 'X', 'Y', 1, 1), // ignored
    { id: 'l1', sport: 'football', status: 'completed', homeTeam: { id: 'X', name: 'X' }, awayTeam: { id: 'Y', name: 'Y' }, state: null } as unknown as Match, // league, no stage — ignored
  ];
  test('groups knockout matches by stage, ordered qf → sf → final, ignoring group/league', () => {
    const rounds = knockoutStageRounds(matches);
    assert.deepEqual(rounds.map((r) => r.stage), ['qf', 'sf', 'final']);
    assert.deepEqual(rounds.map((r) => r.matches.length), [2, 2, 1]);
    assert.equal(rounds[0].label, 'Quarter-finals');
  });
  test('empty when no knockout stages present', () => {
    assert.equal(knockoutStageRounds([km('g', 'group', 'X', 'Y', 1, 0)]).length, 0);
  });
});

describe('matchWinnerId', () => {
  test('winner id for a decided match; undefined for pending or draw', () => {
    assert.equal(matchWinnerId(km('m', 'qf', 'A', 'B', 2, 1)), 'A');
    assert.equal(matchWinnerId(km('m', 'qf', 'A', 'B', 0, 2)), 'B');
    assert.equal(matchWinnerId(km('m', 'qf', 'A', 'B')), undefined);
    assert.equal(matchWinnerId(km('m', 'qf', 'A', 'B', 1, 1)), undefined);
  });
});

describe('nextRoundPairs (progression)', () => {
  test('completed QF (4 matches) → 2 SF pairings of adjacent winners', () => {
    const qf: KnockoutRound = {
      stage: 'qf', label: 'Quarter-finals',
      matches: [km('1', 'qf', 'A', 'B', 2, 0), km('2', 'qf', 'C', 'D', 0, 1), km('3', 'qf', 'E', 'F', 3, 1), km('4', 'qf', 'G', 'H', 0, 2)],
    };
    const pairs = nextRoundPairs(qf);
    assert.ok(pairs);
    assert.deepEqual(pairs, [
      { homeId: 'A', awayId: 'D', stage: 'sf' },
      { homeId: 'E', awayId: 'H', stage: 'sf' },
    ]);
  });
  test('null until every match in the round is decided', () => {
    const qf: KnockoutRound = { stage: 'qf', label: 'QF', matches: [km('1', 'qf', 'A', 'B', 2, 0), km('2', 'qf', 'C', 'D')] };
    assert.equal(nextRoundPairs(qf), null);
  });
  test('null for the final (nothing after it)', () => {
    const fin: KnockoutRound = { stage: 'final', label: 'Final', matches: [km('f', 'final', 'A', 'B', 1, 0)] };
    assert.equal(nextRoundPairs(fin), null);
  });
});

describe('stageChampionId', () => {
  test('the final winner when decided; undefined otherwise', () => {
    const decided = knockoutStageRounds([km('f', 'final', 'A', 'B', 2, 1)]);
    assert.equal(stageChampionId(decided), 'A');
    const pending = knockoutStageRounds([km('f', 'final', 'A', 'B')]);
    assert.equal(stageChampionId(pending), undefined);
  });
});
