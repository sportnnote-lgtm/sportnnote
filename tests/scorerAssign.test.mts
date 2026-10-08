/** Parity #11 — bulk scorer planner. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planScorerAssignments, assignableMatches, type AssignableMatch } from '../src/data/scorerAssign.ts';

const S = ['s1', 's2', 's3', 's4'];
// 40 fixtures: 10 time slots × 4 simultaneous games on 4 grounds
const fixtures: AssignableMatch[] = Array.from({ length: 40 }, (_, i) => ({
  id: `m${String(i).padStart(2, '0')}`,
  status: 'scheduled',
  startsAt: new Date(Date.UTC(2026, 10, 1, 4 + Math.floor(i / 4))).toISOString(),
  venueName: `Ground ${(i % 4) + 1}`,
}));
const counts = (plan: Record<string, string[]>) => {
  const c: Record<string, number> = {};
  for (const v of Object.values(plan)) for (const s of v) c[s] = (c[s] ?? 0) + 1;
  return c;
};
const clashes = (plan: Record<string, string[]>, ms: AssignableMatch[]) => {
  const seen = new Set<string>(); let n = 0;
  for (const m of ms) for (const s of plan[m.id] ?? []) { const k = `${m.startsAt}|${s}`; if (seen.has(k)) n++; seen.add(k); }
  return n;
};

test('rotate: 40 fixtures / 4 scorers → 10 each, no same-time double-booking', () => {
  const plan = planScorerAssignments(fixtures, S, { mode: 'rotate' });
  assert.equal(Object.keys(plan).length, 40);
  assert.deepEqual(counts(plan), { s1: 10, s2: 10, s3: 10, s4: 10 });
  assert.equal(clashes(plan, fixtures), 0);
});

test('rotate: avoids clashes even when the balance would prefer one', () => {
  // 3 games at 10:00, 1 at 11:00 with 3 scorers — the clash-free split exists
  const ms: AssignableMatch[] = [
    { id: 'a', status: 'scheduled', startsAt: '2026-11-01T10:00:00Z' },
    { id: 'b', status: 'scheduled', startsAt: '2026-11-01T10:00:00Z' },
    { id: 'c', status: 'scheduled', startsAt: '2026-11-01T10:00:00Z' },
    { id: 'd', status: 'scheduled', startsAt: '2026-11-01T11:00:00Z' },
  ];
  const plan = planScorerAssignments(ms, ['x', 'y', 'z'], { mode: 'rotate' });
  assert.equal(clashes(plan, ms), 0);
  assert.equal(new Set(['a', 'b', 'c'].map((id) => plan[id][0])).size, 3);
  // an existing (kept) assignment counts as busy at that time
  const kept: AssignableMatch[] = [{ id: 'k', status: 'scheduled', startsAt: '2026-11-01T11:00:00Z', scorerIds: ['x'] }, ...ms];
  assert.notEqual(planScorerAssignments(kept, ['x', 'y', 'z'], { mode: 'rotate' }).d[0], 'x');
  // unavoidable: more simultaneous games than scorers → still all assigned
  const p2 = planScorerAssignments(ms, ['x'], { mode: 'rotate' });
  assert.equal(Object.keys(p2).length, 4);
});

test('byVenue: each ground gets its scorer; unmapped grounds use the pool', () => {
  const plan = planScorerAssignments(fixtures, S, {
    mode: 'byVenue',
    venueMap: { 'Ground 1': ['s4'], 'Ground 2': ['s3'], 'Ground 3': ['s2'] },
  });
  for (const m of fixtures) {
    const want = { 'Ground 1': 's4', 'Ground 2': 's3', 'Ground 3': 's2' }[m.venueName!];
    if (want) assert.deepEqual(plan[m.id], [want]);
    else assert.equal(plan[m.id].length, 1);
  }
  // Ground 4 shares out among those free at that time → s1 (the only free one)
  assert.ok(fixtures.filter((m) => m.venueName === 'Ground 4').every((m) => plan[m.id][0] === 's1'));
});

test('one: everyone gets the first scorer', () => {
  const plan = planScorerAssignments(fixtures.slice(0, 5), ['s2', 's1'], { mode: 'one' });
  assert.ok(Object.values(plan).every((v) => v[0] === 's2'));
});

test('onlyUnassigned (default) keeps existing scorers; off reassigns them', () => {
  const ms: AssignableMatch[] = [
    { id: 'a', status: 'scheduled', startsAt: '2026-11-01T10:00:00Z', scorerIds: ['old'] },
    { id: 'b', status: 'scheduled', startsAt: '2026-11-01T11:00:00Z' },
  ];
  assert.deepEqual(Object.keys(planScorerAssignments(ms, S, { mode: 'rotate' })), ['b']);
  assert.deepEqual(Object.keys(planScorerAssignments(ms, S, { mode: 'rotate', onlyUnassigned: false })).sort(), ['a', 'b']);
  assert.equal(assignableMatches(ms).length, 1);
  // a legacy single scorerId counts as assigned
  assert.equal(assignableMatches([{ id: 'l', status: 'scheduled', scorerId: 'old' }]).length, 0);
});

test('skips completed and cancelled; live and postponed are planned', () => {
  const ms: AssignableMatch[] = ['completed', 'cancelled', 'live', 'postponed', 'scheduled'].map((status, i) => ({ id: status, status, startsAt: `2026-11-0${i + 1}T10:00:00Z` }));
  assert.deepEqual(Object.keys(planScorerAssignments(ms, S, { mode: 'rotate', onlyUnassigned: false })).sort(), ['live', 'postponed', 'scheduled']);
});

test('empty pool → empty plan', () => {
  assert.deepEqual(planScorerAssignments(fixtures, [], { mode: 'rotate' }), {});
});
