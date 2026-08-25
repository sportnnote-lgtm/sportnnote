/**
 * Match-driven (staged) knockout bracket — the real bracket a tournament shows:
 * its actual knockout matches grouped by `stage`, and the round-to-round
 * progression that seeds the next round from a completed one.
 * See src/data/bracket.ts (knockoutStageRounds / nextRoundPairs / …).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  knockoutStageRounds, nextRoundPairs, matchWinnerId, matchLoserId, thirdPlacePair,
  stageForTeams, stageChampionId, isKoStage, koStageRank, planKnockout, seedPlayIn, type KnockoutRound,
  doubleChanceOpeners, doubleChanceNext, doubleChanceChampion,
} from '../src/data/bracket.ts';
import { seriesLegFormat } from '../src/data/series.ts';
import type { Match } from '../src/core/types.ts';

// A knockout match: home vs away, tagged with its stage; `hs`/`as` decide the winner.
const km = (id: string, stage: string, homeId: string, awayId: string, hs?: number, as?: number, startsAt = ''): Match =>
  ({
    id, sport: 'football', stage, status: hs == null ? 'scheduled' : 'completed', startsAt,
    score: hs == null ? undefined : { home: hs, away: as }, winner: hs == null ? undefined : hs > as! ? 'home' : hs < as! ? 'away' : 'draw',
    homeTeam: { id: homeId, name: homeId }, awayTeam: { id: awayId, name: awayId }, state: null,
  }) as unknown as Match;

// Build a real single-stage round (with series-collapsed pairings) from matches.
const roundOf = (...ms: Match[]): KnockoutRound => knockoutStageRounds(ms)[0];

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
    const qf = roundOf(km('1', 'qf', 'A', 'B', 2, 0), km('2', 'qf', 'C', 'D', 0, 1), km('3', 'qf', 'E', 'F', 3, 1), km('4', 'qf', 'G', 'H', 0, 2));
    const pairs = nextRoundPairs(qf);
    assert.ok(pairs);
    assert.deepEqual(pairs, [
      { homeId: 'A', awayId: 'D', stage: 'sf' },
      { homeId: 'E', awayId: 'H', stage: 'sf' },
    ]);
  });
  test('null until every match in the round is decided', () => {
    const qf = roundOf(km('1', 'qf', 'A', 'B', 2, 0), km('2', 'qf', 'C', 'D'));
    assert.equal(nextRoundPairs(qf), null);
  });
  test('null for the final (nothing after it)', () => {
    const fin = roundOf(km('f', 'final', 'A', 'B', 1, 0));
    assert.equal(nextRoundPairs(fin), null);
  });
});

describe('planKnockout (field sizing)', () => {
  test('a power-of-two field is clean — no play-in', () => {
    const p = planKnockout(8);
    assert.equal(p.clean, true);
    assert.equal(p.playInTies, 0);
    assert.equal(p.byes, 8); // n/a, but 2P−N = N here
  });
  test('12 → play-in of 4 ties (seeds 5–12), 4 byes → 8 for the QF', () => {
    const p = planKnockout(12);
    assert.deepEqual(
      [p.clean, p.mainSize, p.playInTies, p.byes, p.playInStage, p.mainStage],
      [false, 8, 4, 4, 'r16', 'qf'],
    );
  });
  test('6 → 2 ties + 2 byes → 4 for the SF; 5 → 1 tie + 3 byes → 4', () => {
    assert.deepEqual([planKnockout(6).playInTies, planKnockout(6).byes, planKnockout(6).mainStage], [2, 2, 'sf']);
    assert.deepEqual([planKnockout(5).playInTies, planKnockout(5).byes, planKnockout(5).mainStage], [1, 3, 'sf']);
  });
});

describe('seedPlayIn', () => {
  test('top seeds bye; the rest pair highest-vs-lowest', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `s${i + 1}`); // s1 best … s12 worst
    const pi = seedPlayIn(ids);
    assert.deepEqual(pi.byeIds, ['s1', 's2', 's3', 's4']);
    assert.equal(pi.ties.length, 4);
    // pool = s5..s12 → s5 v s12, s6 v s11, s7 v s10, s8 v s9
    assert.deepEqual(pi.ties[0], { homeId: 's5', awayId: 's12' });
    assert.deepEqual(pi.ties[3], { homeId: 's8', awayId: 's9' });
    assert.deepEqual([pi.playInStage, pi.mainStage], ['r16', 'qf']);
  });
});

describe('nextRoundPairs with play-in byes', () => {
  const kmBye = (id: string, h: string, a: string, hs: number, as: number, byes: string[]): Match =>
    ({ ...km(id, 'r16', h, a, hs, as), byes }) as Match;
  test('merges byes (top seeds) with play-in winners, spread by seeding', () => {
    // 4 play-in ties (r16), each tagged with the 4 byes b1–b4. Home wins each → w = home ids.
    const byes = ['b1', 'b2', 'b3', 'b4'];
    const round = roundOf(kmBye('1', 'w1', 'x1', 1, 0, byes), kmBye('2', 'w2', 'x2', 1, 0, byes), kmBye('3', 'w3', 'x3', 1, 0, byes), kmBye('4', 'w4', 'x4', 1, 0, byes));
    const pairs = nextRoundPairs(round);
    assert.ok(pairs);
    assert.ok(pairs!.every((p) => p.stage === 'qf'));
    // seeds [b1,b2,b3,b4,w1,w2,w3,w4] placed by seedOrder(8) → each bye meets a winner
    assert.deepEqual(pairs, [
      { homeId: 'b1', awayId: 'w4', stage: 'qf' },
      { homeId: 'b4', awayId: 'w1', stage: 'qf' },
      { homeId: 'b2', awayId: 'w3', stage: 'qf' },
      { homeId: 'b3', awayId: 'w2', stage: 'qf' },
    ]);
    // every quarter-final is a bye vs a play-in winner (no bye-vs-bye)
    assert.ok(pairs!.every((p) => (p.homeId.startsWith('b') ? p.awayId.startsWith('w') : p.homeId.startsWith('w') && p.awayId.startsWith('b'))));
  });
  test('a single play-in tie + 3 byes advances (does not read as a final)', () => {
    const round = roundOf(kmBye('1', 'w1', 'x1', 2, 1, ['b1', 'b2', 'b3']));
    const pairs = nextRoundPairs(round);
    assert.ok(pairs);
    assert.equal(pairs!.length, 2);
    assert.ok(pairs!.every((p) => p.stage === 'sf'));
  });
});

describe('3rd-place playoff', () => {
  test('matchLoserId is the beaten team; undefined if undecided', () => {
    assert.equal(matchLoserId(km('m', 'sf', 'A', 'B', 2, 1)), 'B');
    assert.equal(matchLoserId(km('m', 'sf', 'A', 'B', 1, 3)), 'A');
    assert.equal(matchLoserId(km('m', 'sf', 'A', 'B')), undefined);
  });
  test('pairs the two semi-final losers once both semis are decided', () => {
    const sf = roundOf(km('1', 'sf', 'A', 'B', 2, 0), km('2', 'sf', 'C', 'D', 0, 1));
    assert.deepEqual(thirdPlacePair(sf), { homeId: 'B', awayId: 'C' }); // losers of each semi
  });
  test('null until both semis are done, and only for a 2-match SF round', () => {
    const half = roundOf(km('1', 'sf', 'A', 'B', 2, 0), km('2', 'sf', 'C', 'D'));
    assert.equal(thirdPlacePair(half), null);
    const qf = roundOf(km('1', 'qf', 'A', 'B', 2, 0), km('2', 'qf', 'C', 'D', 1, 0));
    assert.equal(thirdPlacePair(qf), null);
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

describe('series-aware bracket (gap #3)', () => {
  // A knockout leg carrying series metadata (two-legged tie by default).
  const sLeg = (id: string, stage: string, seriesId: string, teamAId: string, home: string, away: string, legNo: number, hs?: number, as?: number): Match =>
    ({ ...km(id, stage, home, away, hs, as), format: seriesLegFormat({ id: seriesId, format: 'aggregate', legs: 2, leg: legNo, teamAId }) }) as Match;

  test('a two-legged tie counts as ONE pairing, resolved on aggregate', () => {
    // SF1: A vs B two legs → A win on aggregate (2-1, 1-1 → 3-2).
    const round = roundOf(
      sLeg('s1l1', 'sf', 'S1', 'A', 'A', 'B', 1, 2, 1),
      sLeg('s1l2', 'sf', 'S1', 'A', 'B', 'A', 2, 1, 1),
    );
    assert.equal(round.pairings.length, 1);        // one tie, not two matches
    assert.equal(round.matches.length, 2);         // both legs still present
    assert.equal(nextRoundPairs(round), null);     // a lone SF tie is the "final-1"? no — only 1 winner, nothing to pair
  });

  test('two two-legged semis advance the aggregate winners to the final', () => {
    const round = roundOf(
      // SF1: A beats B on aggregate (3-2)
      sLeg('a1', 'sf', 'S1', 'A', 'A', 'B', 1, 2, 1),
      sLeg('a2', 'sf', 'S1', 'A', 'B', 'A', 2, 1, 1),
      // SF2: C beats D on aggregate (0-0, 2-0 → 2-0)
      sLeg('b1', 'sf', 'S2', 'C', 'C', 'D', 1, 0, 0),
      sLeg('b2', 'sf', 'S2', 'C', 'D', 'C', 2, 0, 2),
    );
    assert.equal(round.pairings.length, 2);
    const pairs = nextRoundPairs(round);
    assert.ok(pairs);
    assert.deepEqual(pairs, [{ homeId: 'A', awayId: 'C', stage: 'final' }]);
  });

  test('the round does not advance until BOTH legs of a tie are done', () => {
    const round = roundOf(
      sLeg('a1', 'sf', 'S1', 'A', 'A', 'B', 1, 2, 1),
      sLeg('a2', 'sf', 'S1', 'A', 'B', 'A', 2),           // leg 2 unplayed
      sLeg('b1', 'sf', 'S2', 'C', 'C', 'D', 1, 1, 0),
      sLeg('b2', 'sf', 'S2', 'C', 'D', 'C', 2, 0, 2),
    );
    assert.equal(nextRoundPairs(round), null);
  });

  test('stageChampionId resolves a two-legged final on aggregate', () => {
    const rounds = knockoutStageRounds([
      sLeg('f1', 'final', 'F', 'A', 'A', 'B', 1, 1, 0),
      sLeg('f2', 'final', 'F', 'A', 'B', 'A', 2, 1, 3), // A wins 4-1 agg
    ]);
    assert.equal(stageChampionId(rounds), 'A');
  });
});

describe('double-chance playoff (IPL-style)', () => {
  test('openers seed 1v2 (Q1) and 3v4 (Eliminator)', () => {
    const o = doubleChanceOpeners(['s1', 's2', 's3', 's4']);
    assert.deepEqual(o, [
      { homeId: 's1', awayId: 's2', stage: 'q1' },
      { homeId: 's3', awayId: 's4', stage: 'eliminator' },
    ]);
    assert.deepEqual(doubleChanceOpeners(['s1', 's2', 's3']), []); // needs 4
  });

  test('Q2 pairs the Q1 loser with the Eliminator winner', () => {
    const ms = [km('q1', 'q1', 'A', 'B', 2, 1), km('el', 'eliminator', 'C', 'D', 0, 3)]; // A beats B, D beats C
    const next = doubleChanceNext(ms);
    assert.deepEqual(next, [{ homeId: 'B', awayId: 'D', stage: 'q2' }]); // Q1 loser B v Elim winner D
  });

  test('not ready until both openers are decided', () => {
    const ms = [km('q1', 'q1', 'A', 'B', 2, 1), km('el', 'eliminator', 'C', 'D')]; // eliminator unplayed
    assert.equal(doubleChanceNext(ms), null);
  });

  test('Final pairs the Q1 winner with the Q2 winner; champion resolves', () => {
    const ms = [
      km('q1', 'q1', 'A', 'B', 2, 1),          // A wins Q1
      km('el', 'eliminator', 'C', 'D', 0, 3),  // D wins Eliminator
      km('q2', 'q2', 'B', 'D', 4, 0),          // B wins Q2 (Q1 loser back through)
    ];
    assert.deepEqual(doubleChanceNext(ms), [{ homeId: 'A', awayId: 'B', stage: 'final' }]);
    assert.equal(doubleChanceChampion(ms), undefined); // final not created yet
    ms.push(km('f', 'final', 'A', 'B', 3, 2)); // A wins the final
    assert.equal(doubleChanceNext(ms), null);
    assert.equal(doubleChanceChampion(ms), 'A');
  });

  test('a beaten top-2 team can still win the title (second chance)', () => {
    // B loses Q1 but wins Q2 and the Final.
    const ms = [
      km('q1', 'q1', 'A', 'B', 0, 1),          // B... wait: home A away B, 0-1 → B wins. Make A win instead:
    ];
    ms.length = 0;
    ms.push(km('q1', 'q1', 'A', 'B', 3, 1));    // A wins Q1, B drops to Q2
    ms.push(km('el', 'eliminator', 'C', 'D', 2, 0)); // C wins Eliminator
    ms.push(km('q2', 'q2', 'B', 'C', 2, 1));    // B wins Q2
    ms.push(km('f', 'final', 'A', 'B', 0, 1));  // B wins the Final
    assert.equal(doubleChanceChampion(ms), 'B');
  });
});
