/**
 * Litmus test — "can the engine schedule a real international tournament as-is?"
 * Drives the actual fixtures/groups/bracket engine end-to-end at full scale for
 * two real formats, asserting the structure at every phase:
 *   • FIFA World Cup 2026 — 48 teams → 12 groups of 4 → top 2 + 8 best 3rd = 32
 *     → R32 → R16 → QF → SF → Final.
 *   • Asia Cup (cricket) — 6 teams → 2 groups of 3 → top 2 = 4 → Super Four
 *     (a second round-robin) → top 2 → Final.
 * This is the acceptance test behind the tournament-organization work; if the
 * engine can build these, the options exist. Gaps found are noted inline.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { drawGroups, groupStage, roundRobin } from '../src/data/fixtures.ts';
import { groupTables, advancement, seedKnockout } from '../src/data/groups.ts';
import { teamStandings } from '../src/data/standings.ts';
import { stageForTeams, knockoutStageRounds, nextRoundPairs, stageChampionId, type KoStage } from '../src/data/bracket.ts';
import type { Match } from '../src/core/types.ts';

const ids = (n: number, p = 't') => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
const team = (id: string) => ({ id, name: id, shortName: id, sport: 'football' as const });

// A completed group match, home hs–as away, tagged with its group.
const gm = (group: string, homeId: string, awayId: string, hs: number, as: number): Match =>
  ({ id: `${group}:${homeId}-${awayId}`, sport: 'football', status: 'completed', group, stage: 'group', startsAt: '',
    score: { home: hs, away: as }, winner: hs > as ? 'home' : hs < as ? 'away' : 'draw',
    homeTeam: team(homeId), awayTeam: team(awayId), state: null }) as unknown as Match;

// A completed knockout match at a stage — home always wins (deterministic walk).
const koM = (stage: KoStage, homeId: string, awayId: string, i: number): Match =>
  ({ id: `${stage}:${i}`, sport: 'football', status: 'completed', stage, startsAt: `2026-08-08T${String(10 + i).padStart(2, '0')}:00:00`,
    score: { home: 1, away: 0 }, winner: 'home', homeTeam: team(homeId), awayTeam: team(awayId), state: null }) as unknown as Match;

/** Play a group's round-robin so finishing order is deterministic: within a
 *  group, a lower team index beats a higher one (so g[0] wins the group, etc.). */
function playGroups(teamIds: string[], numGroups: number): Match[] {
  const groups = drawGroups(teamIds, numGroups);
  const rankIn = new Map<string, number>();
  groups.forEach((g) => g.teamIds.forEach((t, i) => rankIn.set(t, i)));
  return groupStage(teamIds, numGroups).map((p) => {
    const better = (rankIn.get(p.homeId) ?? 0) <= (rankIn.get(p.awayId) ?? 0);
    return gm(p.group!, p.homeId, p.awayId, better ? 2 : 0, better ? 0 : 2);
  });
}

/** Walk a seeded first round to a champion, home-always-wins, via nextRoundPairs.
 *  Returns the [stage, tie-count] of every round played. */
function walkBracket(firstPairs: { homeId: string; awayId: string }[], firstStage: KoStage) {
  const rounds: { stage: KoStage; ties: number }[] = [];
  let pairs = firstPairs;
  let stage = firstStage;
  for (let guard = 0; guard < 12; guard++) {
    const matches = pairs.map((p, i) => koM(stage, p.homeId, p.awayId, i));
    rounds.push({ stage, ties: matches.length });
    const next = nextRoundPairs({ stage, label: stage, matches });
    if (!next) break;
    pairs = next.map((p) => ({ homeId: p.homeId, awayId: p.awayId }));
    stage = next[0].stage;
  }
  return rounds;
}

describe('LITMUS · FIFA World Cup 2026 (48 → 12 groups → 32 → knockout)', () => {
  const TEAMS = ids(48);
  const groupMatches = playGroups(TEAMS, 12);

  test('group stage: 12 groups of 4, 72 round-robin matches', () => {
    const groups = drawGroups(TEAMS, 12);
    assert.equal(groups.length, 12);
    assert.deepEqual([...new Set(groups.map((g) => g.teamIds.length))], [4]);
    assert.equal(groupMatches.length, 72); // C(4,2)=6 × 12
  });

  test('advancement: top 2 of each group + 8 best third-placed = 32', () => {
    const tables = groupTables(groupMatches, 'football');
    assert.equal(tables.length, 12);
    const q = advancement(tables, 2, 8);
    assert.equal(q.length, 32);
    assert.equal(q.filter((x) => x.via === 'direct').length, 24); // 12 × top 2
    assert.equal(q.filter((x) => x.via === 'best').length, 8);    // 8 best 3rd-placed
    assert.equal(new Set(q.map((x) => x.teamId)).size, 32);       // no dupes
  });

  test('32 qualifiers is a clean bracket → R32 → R16 → QF → SF → Final', () => {
    const q = advancement(groupTables(groupMatches, 'football'), 2, 8);
    const first = seedKnockout(q); // 16 ties
    assert.equal(first.length, 16);
    assert.equal(stageForTeams(q.length), 'r32');
    const rounds = walkBracket(first, 'r32');
    assert.deepEqual(rounds, [
      { stage: 'r32', ties: 16 },
      { stage: 'r16', ties: 8 },
      { stage: 'qf', ties: 4 },
      { stage: 'sf', ties: 2 },
      { stage: 'final', ties: 1 },
    ]);
  });

  test('the bracket resolves to a single champion', () => {
    const q = advancement(groupTables(groupMatches, 'football'), 2, 8);
    // Build every knockout round as real staged matches, then read the champion.
    let pairs = seedKnockout(q).map((p) => ({ homeId: p.homeId, awayId: p.awayId }));
    let stage: KoStage = 'r32';
    const all: Match[] = [];
    for (let g = 0; g < 12; g++) {
      const matches = pairs.map((p, i) => koM(stage, p.homeId, p.awayId, all.length + i));
      all.push(...matches);
      const next = nextRoundPairs({ stage, label: stage, matches });
      if (!next) break;
      pairs = next.map((p) => ({ homeId: p.homeId, awayId: p.awayId }));
      stage = next[0].stage;
    }
    const champ = stageChampionId(knockoutStageRounds(all));
    assert.ok(champ, 'a champion is decided');
  });

  // GAP: a 3rd-place playoff (the two SF losers) is a real WC fixture the engine
  // does not currently generate — it would need a "losers of stage X" pairing.
});

describe('LITMUS · Asia Cup (6 → 2 groups → Super Four → Final)', () => {
  const TEAMS = ids(6, 'c');
  const groupMatches = playGroups(TEAMS, 2);

  test('group stage: 2 groups of 3, 6 round-robin matches → 4 qualifiers', () => {
    assert.equal(groupMatches.length, 6); // C(3,2)=3 × 2
    const q = advancement(groupTables(groupMatches, 'football'), 2);
    assert.equal(q.length, 4);
  });

  test('Super Four is a second round-robin of the 4 qualifiers (6 games)', () => {
    const q = advancement(groupTables(groupMatches, 'football'), 2);
    const superFour = roundRobin(q.map((x) => x.teamId));
    assert.equal(superFour.length, 6); // C(4,2) — every qualifier plays every other once
    // …and its table then yields a top 2 for the final.
    const s4Matches = superFour.map((p, i) => gm('S4', p.homeId, p.awayId, i % 2 === 0 ? 2 : 0, i % 2 === 0 ? 0 : 2));
    const s4Table = teamStandings(s4Matches, 'football');
    assert.equal(s4Table.length, 4);
    const final = seedKnockout(
      s4Table.slice(0, 2).map((r, i) => ({ teamId: r.teamId, name: r.name, group: 'S4', rank: i + 1, via: 'direct' as const })),
    );
    assert.equal(final.length, 1); // top 2 → the final
  });

  // Super Four is now wired in-app: Auto-generate → Advance groups → "To Super
  // round-robin" creates the stage:'super' games; the tournament shows the Super
  // table; and "Advance Super phase" → knockout produces the final. (This test
  // proves the underlying engine; the UI chain is verified in the demo pass.)
});
