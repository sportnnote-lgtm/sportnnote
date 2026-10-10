/**
 * SD-07 — golf cut, countback and profile figures.
 *   - Missed cut (through buildLeaderboard): MC below the line, two cut stages,
 *     WD keeps its own label, a single round never produces MC.
 *   - Countback only settles ties between complete cards; partial cards read "T".
 *   - Profile: best round compares 18 with 18 (best 9 apart); putts/round only
 *     over holes where putts were entered.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  standardPar72, rankLeaderboard, roundStats, golfProfileSummary,
  type GolfCard, type RankInput,
} from '../src/sports/golf/engine.ts';
import { buildLeaderboard } from '../src/data/golfLeaderboard.ts';
import type { FieldEntry, FieldEntryStatus, FieldEvent, GolfCourse } from '../src/core/types.ts';

const H = standardPar72();
const zeros = H.map(() => 0);
/** A card from per-hole deltas to par; `null` = not yet played. */
const card = (deltas: (number | null)[]): GolfCard => ({ strokes: H.map((h, i) => (deltas[i] == null ? null : h.par + (deltas[i] as number))) });
const even = (over = 0, holes = 18): GolfCard => card(H.map((_, i) => (i < holes ? (i < over ? 1 : 0) : null)));

const course: GolfCourse = { id: 'c1', name: 'Club', holes: H, tees: [{ name: 'White' }] };
const ev = (n: number): FieldEvent => ({ id: `r${n}`, sport: 'golf', title: `Round ${n}`, roundNo: n, startsAt: `2026-10-0${n}T08:00:00Z`, status: 'completed', format: { competition: 'stroke', holes: '18', courseId: 'c1' } });
const en = (pid: string, n: number, c: GolfCard, status: FieldEntryStatus = 'finished'): FieldEntry => ({ id: `${pid}-${n}`, eventId: `r${n}`, playerId: pid, groupNo: 1, result: c, status });

describe('missed cut through buildLeaderboard', () => {
  test('a single round never has MC', () => {
    const rows = buildLeaderboard([ev(1)], [en('a', 1, even(0)), en('b', 1, even(5))], [course]);
    assert.deepEqual(rows.map((r) => r.positionLabel), ['1', '2']);
    assert.ok(rows.every((r) => !r.missedCut));
  });

  test('36-hole and 54-hole cuts: field, then 54-hole MC, then 36-hole MC, then WD', () => {
    const entries = [
      // a, b, c play all three rounds; d missed the 54-hole cut; e and f the 36-hole cut.
      en('a', 1, even(3)), en('a', 2, even(3)), en('a', 3, even(3)), // +9
      en('b', 1, even(1)), en('b', 2, even(1)), en('b', 3, even(9)), // +11
      en('c', 1, even(2)), en('c', 2, even(2)), en('c', 3, even(2)), // +6
      en('d', 1, even(4)), en('d', 2, even(4)), // +8, then not entered in round 3
      en('e', 1, even(1)), // +1 — a great R1 but not entered in R2 → missed the first cut
      en('f', 1, even(6)),
      en('w', 1, even(0)), en('w', 2, even(0), 'wd'),
    ];
    // Stages: e, f stop after round 1; d and w after round 2; a, b, c play round 3.
    const rows = buildLeaderboard([ev(1), ev(2), ev(3)], entries, [course]);
    assert.deepEqual(rows.map((r) => `${r.id}:${r.positionLabel}`), ['c:1', 'a:2', 'b:3', 'd:MC', 'e:MC', 'f:MC', 'w:WD']);
    const d = rows.find((r) => r.id === 'd')!;
    assert.equal(d.total, 8); // their total over the rounds they played
    assert.equal(d.position, null);
    // e's +1 is lower than every weekend total, yet e is never ranked above them.
    assert.equal(rows.find((r) => r.id === 'e')!.total, 1);
    assert.ok(rows.filter((r) => r.missedCut).every((r) => r.position == null));
  });

  test('the moment the next round is set up, cut players drop below the line', () => {
    const entries = [en('a', 1, even(0)), en('b', 1, even(2)), en('c', 1, even(8)), en('a', 2, { strokes: H.map(() => null) }), en('b', 2, { strokes: H.map(() => null) })];
    const rows = buildLeaderboard([ev(1), { ...ev(2), status: 'scheduled' }], entries, [course]);
    assert.deepEqual(rows.map((r) => `${r.id}:${r.positionLabel}`), ['a:1', 'b:2', 'c:MC']);
  });
});

describe('countback only on complete cards', () => {
  const opts = { scoring: 'stroke' as const, net: false, tieBreak: 'countback' as const };
  const input = (id: string, c: GolfCard): RankInput => ({ id, status: 'playing', rounds: [{ card: c, holes: H, received: zeros }] });
  // Same +2 total: x bogeyed holes 1–2 (front nine); y bogeyed holes 17–18 (back nine).
  const x = card(H.map((_, i) => (i < 2 ? 1 : 0)));
  const y = card(H.map((_, i) => (i >= 16 ? 1 : 0)));

  test('complete cards: countback separates the tie (better back nine wins)', () => {
    const rows = rankLeaderboard([input('y', y), input('x', x)], opts);
    assert.deepEqual(rows.map((r) => `${r.id}:${r.positionLabel}`), ['x:1', 'y:2']);
  });

  test('a card still in play: equal totals share the place ("T")', () => {
    // z is +2 thru 10 — same total as x, but the card is not complete.
    const z = card(H.map((_, i) => (i < 10 ? (i < 2 ? 1 : 0) : null)));
    const rows = rankLeaderboard([input('x', x), input('y', y), input('z', z)], opts);
    assert.deepEqual(rows.map((r) => r.positionLabel), ['T1', 'T1', 'T1']);
  });

  test('a partial card at a different total does not stop countback elsewhere', () => {
    const z = card(H.map((_, i) => (i < 10 ? (i < 5 ? 1 : 0) : null))); // +5 thru 10
    const rows = rankLeaderboard([input('y', y), input('z', z), input('x', x)], opts);
    assert.deepEqual(rows.map((r) => `${r.id}:${r.positionLabel}`), ['x:1', 'y:2', 'z:3']);
  });
});

describe('profile: like-for-like best round, putts over tracked holes', () => {
  test('roundStats counts the holes with putts entered', () => {
    const c: GolfCard = { ...even(0), putts: H.map((_, i) => (i < 9 ? 2 : null)) };
    const s = roundStats(c, H, zeros);
    assert.equal(s.putts, 18);
    assert.equal(s.puttHoles, 9);
  });

  test('a 9-hole 37 is not the best round; it is the best 9', () => {
    const nine = H.slice(0, 9);
    const lines = [
      { stats: roundStats(even(4), H, zeros) },                  // 76 over 18
      { stats: roundStats(even(2), H, zeros) },                  // 74 over 18
      { stats: roundStats({ strokes: nine.map((h) => h.par + (h.n === 1 ? 1 : 0)) }, nine, nine.map(() => 0)) }, // 37 over 9
      { stats: roundStats(even(0, 12), H, zeros) },              // incomplete — never a best
    ];
    const g = golfProfileSummary(lines);
    assert.equal(g.best18, 74);
    assert.equal(g.best9, 37);
  });

  test('putts/round ignores rounds (and holes) without putts; old lines still count', () => {
    const tracked = roundStats({ ...even(0), putts: H.map(() => 2) }, H, zeros); // 36 putts over 18
    const untracked = roundStats(even(0), H, zeros);                              // no putts
    const old = { holes: 18, putts: 30, rounds: 1 };                               // pre-SD-07 line, no puttHoles
    const g = golfProfileSummary([{ stats: tracked }, { stats: untracked }, { stats: old }]);
    assert.equal(g.puttsPerRound, 33); // (36 + 30) / 36 holes × 18 — the untracked round is not a 0
    assert.equal(golfProfileSummary([{ stats: untracked }]).puttsPerRound, null);
  });
});
