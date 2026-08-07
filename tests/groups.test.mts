/**
 * Grouped-tournament engine — the pure logic behind "20 teams → 4 groups of 5 →
 * top 2 → quarter-finals" and the awkward "5 groups → top 3 + best 4th-placed →
 * Round of 16" format. Covers the group draw, per-group round-robins, per-group
 * tables, advancement (direct + best-placed by GD), and seeded knockout.
 * See src/data/fixtures.ts (drawGroups/groupStage) and src/data/groups.ts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { drawGroups, groupStage } from '../src/data/fixtures.ts';
import { groupTables, advancement, seedKnockout, knockoutRoundLabel, qualifiersFromSelection, type GroupTable } from '../src/data/groups.ts';
import { type TeamStanding } from '../src/data/standings.ts';
import type { Match } from '../src/core/types.ts';

const ids = (n: number, p = 't') => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);

// A completed group match: home hs–as away, tagged with its group.
const gm = (group: string, homeId: string, awayId: string, hs: number, as: number): Match =>
  ({
    id: `${group}-${homeId}-${awayId}`, sport: 'football', status: 'completed', group,
    startsAt: '', score: { home: hs, away: as }, winner: hs > as ? 'home' : hs < as ? 'away' : 'draw',
    homeTeam: { id: homeId, name: homeId }, awayTeam: { id: awayId, name: awayId }, state: null,
  }) as unknown as Match;

// A pre-ranked table row (only the ranking fields matter for advancement).
const row = (teamId: string, points: number, diff: number, forGoals: number): TeamStanding =>
  ({ teamId, name: teamId, played: 3, won: 0, lost: 0, drawn: 0, for: forGoals, against: forGoals - diff, diff, points });

describe('group draw', () => {
  test('20 teams / 4 groups → four groups of five, labelled A–D, all present', () => {
    const g = drawGroups(ids(20), 4);
    assert.equal(g.length, 4);
    assert.deepEqual(g.map((x) => x.name), ['A', 'B', 'C', 'D']);
    assert.deepEqual(g.map((x) => x.teamIds.length), [5, 5, 5, 5]);
    assert.equal(new Set(g.flatMap((x) => x.teamIds)).size, 20); // no dupes, none dropped
  });

  test('uneven counts spread as evenly as possible (22/4 → 6,6,5,5)', () => {
    assert.deepEqual(drawGroups(ids(22), 4).map((x) => x.teamIds.length), [6, 6, 5, 5]);
    assert.deepEqual(drawGroups(ids(25), 5).map((x) => x.teamIds.length), [5, 5, 5, 5, 5]);
  });

  test('never more groups than teams; dupes ignored', () => {
    assert.equal(drawGroups(ids(3), 5).length, 3);
    assert.equal(drawGroups(['a', 'a', 'b'], 2).flatMap((x) => x.teamIds).length, 2);
  });
});

describe('group stage fixtures', () => {
  const fx = groupStage(ids(20), 4);
  test('round-robin WITHIN each group only (no cross-group pairings)', () => {
    const groupOf = new Map<string, string>();
    drawGroups(ids(20), 4).forEach((grp) => grp.teamIds.forEach((t) => groupOf.set(t, grp.name)));
    for (const p of fx) {
      assert.equal(groupOf.get(p.homeId), p.group);
      assert.equal(groupOf.get(p.awayId), p.group); // both teams share the pairing's group
    }
  });
  test('correct total: C(5,2)=10 games per group × 4 groups = 40', () => {
    assert.equal(fx.length, 40);
    for (const name of ['A', 'B', 'C', 'D']) assert.equal(fx.filter((p) => p.group === name).length, 10);
  });
});

describe('per-group tables', () => {
  test('partitions matches by group and ranks each independently', () => {
    // Group A: a beats b and c; c beats b. Group B: separate.
    const matches = [
      gm('A', 'a', 'b', 3, 0), gm('A', 'a', 'c', 2, 1), gm('A', 'c', 'b', 1, 0),
      gm('B', 'd', 'e', 1, 1),
    ];
    const tables = groupTables(matches, 'football');
    assert.deepEqual(tables.map((t) => t.name), ['A', 'B']);
    assert.deepEqual(tables[0].rows.map((r) => r.teamId), ['a', 'c', 'b']); // a top, c 2nd, b last
    assert.equal(tables[1].rows.length, 2);
  });
});

describe('advancement', () => {
  // Four groups, ranked rows (winner first). Runners-up have varied records.
  const tables: GroupTable[] = [
    { name: 'A', rows: [row('A1', 9, 5, 8), row('A2', 6, 2, 5), row('A3', 3, -3, 3), row('A4', 0, -4, 1)] },
    { name: 'B', rows: [row('B1', 7, 4, 7), row('B2', 4, 1, 4), row('B3', 3, 0, 3), row('B4', 1, -5, 2)] },
    { name: 'C', rows: [row('C1', 9, 6, 9), row('C2', 5, 3, 6), row('C3', 2, -2, 2), row('C4', 1, -7, 1)] },
    { name: 'D', rows: [row('D1', 6, 2, 5), row('D2', 4, 0, 3), row('D3', 4, -1, 3), row('D4', 0, -1, 0)] },
  ];

  test('top 2 of four groups → 8 qualifiers, winners seeded above runners-up', () => {
    const q = advancement(tables, 2);
    assert.equal(q.length, 8);
    assert.equal(q.filter((x) => x.via === 'best').length, 0);
    // seed order: all rank-1s (by record) first, then all rank-2s
    assert.deepEqual(q.slice(0, 4).map((x) => x.rank), [1, 1, 1, 1]);
    assert.deepEqual(q.slice(4).map((x) => x.rank), [2, 2, 2, 2]);
    // best group winner (C1: 9 pts, +6) is the top seed
    assert.equal(q[0].teamId, 'C1');
  });

  test('top 1 + best 1 second-placed: wildcard is the best runner-up (points, then GD)', () => {
    const q = advancement(tables, 1, 1);
    assert.equal(q.length, 5); // 4 winners + 1 best-placed
    const best = q.find((x) => x.via === 'best');
    assert.ok(best);
    // best 2nd-placed by points-first: A2(6pts) > C2(5) > B2/D2(4) → A2
    assert.equal(best!.teamId, 'A2');
  });

  test('5 groups → top 3 (15) + best 4th-placed (1) = 16 for a Round of 16', () => {
    const five: GroupTable[] = ['A', 'B', 'C', 'D', 'E'].map((name, gi) => ({
      name,
      rows: [row(`${name}1`, 9, 6, 9), row(`${name}2`, 6, 2, 5), row(`${name}3`, 4, 0, 4),
        // group C's 4th-placed is unusually strong (should grab the wildcard)
        row(`${name}4`, gi === 2 ? 4 : 1, gi === 2 ? 3 : -5, gi === 2 ? 5 : 1)],
    }));
    const q = advancement(five, 3, 1);
    assert.equal(q.length, 16);
    assert.equal(q.filter((x) => x.via === 'best').length, 1);
    assert.equal(q.find((x) => x.via === 'best')!.teamId, 'C4');
  });
});

describe('qualifiersFromSelection (manual override)', () => {
  const tables: GroupTable[] = [
    { name: 'A', rows: [row('A1', 9, 5, 8), row('A2', 6, 2, 5), row('A3', 3, -3, 3)] },
    { name: 'B', rows: [row('B1', 7, 4, 7), row('B2', 4, 1, 4), row('B3', 3, 0, 3)] },
  ];
  test('builds qualifiers from an arbitrary pick, seeded winners-first then by record', () => {
    // Organizer overrides: takes A1, B1 (winners) and B2, A3 (a runner-up + a 3rd).
    const q = qualifiersFromSelection(tables, ['A3', 'B2', 'B1', 'A1']);
    assert.equal(q.length, 4);
    // ranks come from finishing position within the group
    assert.deepEqual(q.map((x) => [x.teamId, x.rank]), [['A1', 1], ['B1', 1], ['B2', 2], ['A3', 3]]);
    // seed order: all rank-1s first (A1 9pts before B1 7pts), then rank-2 (B2), then rank-3 (A3)
    assert.deepEqual(q.map((x) => x.teamId), ['A1', 'B1', 'B2', 'A3']);
    assert.ok(q.every((x) => x.via === 'direct'));
  });
  test('ignores ids not in any group table', () => {
    const q = qualifiersFromSelection(tables, ['A1', 'ZZ', 'B1']);
    assert.deepEqual(q.map((x) => x.teamId), ['A1', 'B1']);
  });
});

describe('seeded knockout', () => {
  test('8 seeds → 4 ties, 1v8 … 4v5', () => {
    const q = advancement(
      [
        { name: 'A', rows: [row('A1', 9, 9, 9), row('A2', 3, 1, 3)] },
        { name: 'B', rows: [row('B1', 8, 6, 8), row('B2', 4, 2, 4)] },
        { name: 'C', rows: [row('C1', 7, 4, 7), row('C2', 5, 3, 5)] },
        { name: 'D', rows: [row('D1', 6, 2, 6), row('D2', 6, 1, 6)] },
      ],
      2,
    );
    const ko = seedKnockout(q);
    assert.equal(ko.length, 4);
    // top seed (A1) meets bottom seed; a group's winner & runner-up are in
    // opposite halves, so no A1-vs-A2 style rematch in round one.
    for (const tie of ko) {
      assert.notEqual(tie.homeId.slice(0, 1), tie.awayId.slice(0, 1));
    }
    assert.equal(ko[0].homeId, 'A1');
  });

  test('odd qualifier count byes the top seed through', () => {
    const q = advancement([{ name: 'A', rows: [row('A1', 9, 9, 9), row('A2', 6, 6, 6), row('A3', 3, 3, 3)] }], 3);
    const ko = seedKnockout(q); // 3 teams → 1 tie, top seed A1 byes
    assert.equal(ko.length, 1);
    assert.equal(ko[0].homeId, 'A2');
    assert.equal(ko[0].awayId, 'A3');
  });

  test('round labels by field size', () => {
    assert.equal(knockoutRoundLabel(2), 'final');
    assert.equal(knockoutRoundLabel(4), 'sf');
    assert.equal(knockoutRoundLabel(8), 'qf');
    assert.equal(knockoutRoundLabel(16), 'r16');
  });
});
