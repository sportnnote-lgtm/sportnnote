/**
 * Parity #07 — points table: per-phase standings (league / groups / Super /
 * Swiss, knockouts excluded), organiser points adjustments scoped by phase, and
 * the per-sport `formats` merge every settings write goes through.
 * See src/data/groups.ts (standingsPhases), src/data/standings.ts, src/data/formatPatch.ts.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { standingsPhases, groupTables, advancement } from '../src/data/groups.ts';
import { teamStandings, standingsConfigFromFormat, defaultStandingsConfig, type PointsAdjustment } from '../src/data/standings.ts';
import { mergeSportFormat } from '../src/data/formatPatch.ts';
import type { Match } from '../src/core/types.ts';

// A completed football match home hs–as away, optionally group/stage-tagged.
const fm = (homeId: string, awayId: string, hs: number, as: number, tag: { group?: string; stage?: string } = {}): Match =>
  ({
    id: `${tag.stage ?? ''}${tag.group ?? ''}-${homeId}-${awayId}`, sport: 'football', status: 'completed', ...tag,
    startsAt: '', score: { home: hs, away: as }, winner: hs > as ? 'home' : hs < as ? 'away' : 'draw',
    homeTeam: { id: homeId, name: homeId }, awayTeam: { id: awayId, name: awayId }, state: null,
  }) as unknown as Match;

const adj = (teamId: string, points: number, phase?: string): PointsAdjustment =>
  ({ id: `a-${teamId}-${points}-${phase ?? 'all'}`, teamId, points, reason: 'test', at: '2026-10-09T00:00:00Z', ...(phase ? { phase } : {}) });

const cfgWith = (adjustments: PointsAdjustment[]) => standingsConfigFromFormat('football', { pointsAdj: JSON.stringify(adjustments) });

// Two groups, then a SF + final (knockouts must never reach a table).
const grouped: Match[] = [
  fm('a1', 'a2', 2, 0, { group: 'A', stage: 'group' }),
  fm('a2', 'a3', 1, 0, { group: 'A', stage: 'group' }),
  fm('a1', 'a3', 1, 1, { group: 'A', stage: 'group' }),
  fm('b1', 'b2', 0, 3, { group: 'B', stage: 'group' }),
  fm('b2', 'b3', 2, 2, { group: 'B', stage: 'group' }),
  fm('a1', 'b2', 4, 0, { stage: 'sf' }),
  fm('a1', 'a2', 1, 0, { stage: 'final' }),
];

describe('standingsPhases', () => {
  test('phase split: one table per group, in order, titled "Group X"', () => {
    const ph = standingsPhases(grouped, 'football', defaultStandingsConfig('football'));
    assert.deepEqual(ph.map((p) => [p.key, p.title]), [['group:A', 'Group A'], ['group:B', 'Group B']]);
    assert.deepEqual(ph[0].rows.map((r) => r.teamId), ['a1', 'a2', 'a3']);
    assert.deepEqual(ph[1].rows.map((r) => r.teamId), ['b2', 'b3', 'b1']);
  });

  test('knockout results are excluded from every table', () => {
    const ph = standingsPhases(grouped, 'football', defaultStandingsConfig('football'));
    const a1 = ph[0].rows.find((r) => r.teamId === 'a1')!;
    assert.equal(a1.played, 2); // not the SF or final
    assert.equal(a1.points, 4);
    assert.ok(!ph.some((p) => p.rows.some((r) => r.played > 2)));
  });

  test('league (untagged) first, then groups, super, swiss; third/q1/eliminator excluded', () => {
    const ms = [
      fm('l1', 'l2', 1, 0),
      fm('g1', 'g2', 1, 0, { group: 'A', stage: 'group' }),
      fm('s1', 's2', 1, 0, { stage: 'super' }),
      fm('s3', 's4', 1, 0, { stage: 'super' }),
      fm('w1', 'w2', 1, 0, { stage: 'swiss1' }),
      fm('w1', 'w3', 1, 0, { stage: 'swiss2' }),
      fm('x1', 'x2', 1, 0, { stage: 'third' }),
      fm('x3', 'x4', 1, 0, { stage: 'q1' }),
      fm('x5', 'x6', 1, 0, { stage: 'eliminator' }),
      fm('x7', 'x8', 1, 0, { stage: 'qf' }),
    ];
    const ph = standingsPhases(ms, 'football', defaultStandingsConfig('football'));
    assert.deepEqual(ph.map((p) => [p.key, p.title]), [['league', 'League'], ['group:A', 'Group A'], ['super', 'Super Four'], ['swiss', 'Swiss']]);
    assert.equal(ph[3].rows.find((r) => r.teamId === 'w1')!.played, 2); // swiss1 + swiss2 in one table
    assert.ok(!ph.some((p) => p.rows.some((r) => r.teamId.startsWith('x'))));
  });

  test('only knockouts / no matches → []', () => {
    assert.deepEqual(standingsPhases([fm('a', 'b', 1, 0, { stage: 'final' })], 'football'), []);
    assert.deepEqual(standingsPhases([], 'football'), []);
    // other sports' matches don't make a phase
    assert.deepEqual(standingsPhases(grouped, 'cricket'), []);
  });
});

describe('points adjustments', () => {
  test('adjustment by phase: only its own table; phase-less applies everywhere', () => {
    const cfg = cfgWith([adj('a1', -2, 'group:A'), adj('b2', -1, 'group:A'), adj('a2', 1)]);
    const ph = standingsPhases(grouped, 'football', cfg);
    const a1 = ph[0].rows.find((r) => r.teamId === 'a1')!;
    assert.equal(a1.adjust, -2);
    assert.equal(a1.points, 2);
    const a2 = ph[0].rows.find((r) => r.teamId === 'a2')!;
    assert.equal(a2.adjust, 1); // phase-less
    const b2 = ph[1].rows.find((r) => r.teamId === 'b2')!;
    assert.equal(b2.adjust, 0); // tagged group:A, not B
    assert.equal(b2.points, 4);
    // no phaseKey = every adjustment
    const flat = teamStandings(grouped, 'football', cfg);
    assert.equal(flat.find((r) => r.teamId === 'b2')!.adjust, -1);
  });

  test('adjust re-ranks the table (and qualification)', () => {
    const base = standingsPhases(grouped, 'football', defaultStandingsConfig('football'));
    assert.equal(base[0].rows[0].teamId, 'a1');
    const cfg = cfgWith([adj('a1', -3, 'group:A')]);
    const ph = standingsPhases(grouped, 'football', cfg);
    assert.deepEqual(ph[0].rows.map((r) => r.teamId), ['a2', 'a1', 'a3']);
    assert.equal(ph[0].rows[1].points, 1);
    const q = advancement(groupTables(grouped, 'football', cfg), 1, 0, cfg);
    assert.equal(q.find((x) => x.group === 'A')!.teamId, 'a2');
  });

  test('a team with no row in the phase is not added by an adjustment', () => {
    const ph = standingsPhases(grouped, 'football', cfgWith([adj('zz', 5)]));
    assert.ok(!ph.some((p) => p.rows.some((r) => r.teamId === 'zz')));
  });

  test('bad pointsAdj JSON / bad rows are ignored; no adjustments ⇒ key omitted', () => {
    assert.deepEqual(standingsConfigFromFormat('football', { pointsAdj: '{nope' }), defaultStandingsConfig('football'));
    assert.deepEqual(standingsConfigFromFormat('football', { pointsAdj: '{"a":1}' }), defaultStandingsConfig('football'));
    assert.deepEqual(standingsConfigFromFormat('football', { pointsAdj: '[]' }), defaultStandingsConfig('football'));
    const good = adj('a1', -2, 'group:A');
    const cfg = standingsConfigFromFormat('football', { pointsAdj: JSON.stringify([good, { teamId: 'x' }, null, 7, { ...good, id: 'b', points: 'two' }]) });
    assert.deepEqual(cfg.adjustments, [good]);
  });
});

describe('mergeSportFormat', () => {
  test('merges one sport without touching other sports or keys; undefined deletes', () => {
    const formats = { football: { winPoints: 3, manualRows: '{}' }, cricket: { overs: 20, pointsAdj: '[]' } };
    const out = mergeSportFormat(formats, 'cricket', { pointsAdj: '[{"x":1}]', nrPoints: 1 });
    assert.deepEqual(out, { football: { winPoints: 3, manualRows: '{}' }, cricket: { overs: 20, pointsAdj: '[{"x":1}]', nrPoints: 1 } });
    assert.equal(out.football, formats.football); // untouched sport kept as-is
    assert.deepEqual(formats.cricket, { overs: 20, pointsAdj: '[]' }); // no mutation
    assert.deepEqual(mergeSportFormat(out, 'cricket', { nrPoints: undefined }).cricket, { overs: 20, pointsAdj: '[{"x":1}]' });
  });

  test('null formats / new sport', () => {
    assert.deepEqual(mergeSportFormat(null, 'chess', { tieBreak: 'sb' }), { chess: { tieBreak: 'sb' } });
    assert.deepEqual(mergeSportFormat(undefined, 'chess', {}), { chess: {} });
  });
});
