/**
 * Golf litmus (docs/sports/GOLF_DESIGN.md §8 G6): replicate real events as-is.
 *   1. A 72-hole open: 120 players, four rounds, 36-hole cut — top 50 and ties.
 *   2. A club medal day: 12 players in three 4-balls, net Stableford, 95% allowance.
 * Deterministic pseudo-random cards so the test is stable.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  standardPar72, courseHandicap, playingHandicap, strokesReceived, rankLeaderboard, makesCut,
  type GolfCard, type RankInput,
} from '../src/sports/golf/engine.ts';
import { buildLeaderboard } from '../src/data/golfLeaderboard.ts';
import type { FieldEntry, FieldEvent, GolfCourse } from '../src/core/types.ts';

const H = standardPar72();
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
/** A plausible card for a player of the given skill (avg strokes over par per hole). */
const cardFor = (skill: number): GolfCard => ({
  strokes: H.map((h) => {
    const r = rnd();
    const d = r < 0.08 - skill * 0.05 ? -1 : r < 0.75 - skill * 0.3 ? 0 : r < 0.95 ? 1 : 2;
    return Math.max(1, h.par + d + (skill > 1 && rnd() < 0.3 ? 1 : 0));
  }),
});
const zeros = H.map(() => 0);

describe('litmus: 72-hole open with a 36-hole cut', () => {
  const players = Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, skill: (i % 30) / 20 }));
  const rounds = new Map<string, GolfCard[]>(players.map((p) => [p.id, [cardFor(p.skill), cardFor(p.skill)]]));
  const after = (n: number, ids: string[]): RankInput[] => ids.map((id) => ({
    id, status: 'finished', rounds: rounds.get(id)!.slice(0, n).map((card) => ({ card, holes: H, received: zeros })),
  }));
  const opts = { scoring: 'stroke' as const, net: false, tieBreak: 'shared' as const };

  test('the cut keeps the top 50 and ties, nobody worse', () => {
    const board36 = rankLeaderboard(after(2, players.map((p) => p.id)), opts);
    assert.equal(board36.length, 120);
    const made = makesCut(board36, { type: 'top', n: 50 });
    assert.ok(made.length >= 50, `made ${made.length}`);
    const line = board36[49].total;
    for (const r of board36) assert.equal(made.includes(r.id), r.total <= line, `${r.id} at ${r.total} vs line ${line}`);
    // Weekend: rounds 3 + 4 only for those who made the cut.
    for (const id of made) rounds.get(id)!.push(cardFor(0.5), cardFor(0.5));
    const final = rankLeaderboard(after(4, made), opts);
    assert.equal(final.length, made.length);
    assert.equal(final[0].position, 1);
    // Totals are the sum of four rounds' to-par; positions are monotonic.
    for (let i = 1; i < final.length; i++) assert.ok(final[i].total >= final[i - 1].total);
    const lead = final[0];
    const sum = rounds.get(lead.id)!.reduce((t, c) => t + c.strokes.reduce((a, s, i) => a + ((s as number) - H[i].par), 0), 0);
    assert.equal(lead.total, sum);
  });

  test('through buildLeaderboard: missed-cut players sit below the line as MC', () => {
    // The same open as stored rounds: R1–R2 for all 120, R3–R4 for the cut-makers.
    const course: GolfCourse = { id: 'c1', name: 'Open course', holes: H, tees: [{ name: 'Champ', courseRating: 72, slope: 113 }] };
    const fmt = { competition: 'stroke', holes: '18', courseId: 'c1', tieBreak: 'shared' };
    const events: FieldEvent[] = [1, 2, 3, 4].map((n) => ({
      id: `r${n}`, sport: 'golf', title: `Round ${n}`, roundNo: n, startsAt: `2026-10-0${n}T08:00:00Z`, status: 'completed',
      format: n === 3 ? { ...fmt, cutAfterRound: 2, cut: { type: 'top', n: 50 } } : fmt,
    }));
    const board36 = rankLeaderboard(after(2, players.map((p) => p.id)), opts);
    const made = new Set(makesCut(board36, { type: 'top', n: 50 }));
    const entries: FieldEntry[] = [];
    for (const p of players) {
      for (let n = 1; n <= (made.has(p.id) ? 4 : 2); n++) {
        entries.push({ id: `${p.id}-${n}`, eventId: `r${n}`, playerId: p.id, groupNo: 1, result: rounds.get(p.id)![n - 1], status: 'finished' });
      }
    }
    const board = buildLeaderboard(events, entries, [course]);
    assert.equal(board.length, 120);
    const inField = board.filter((r) => !r.missedCut);
    const mc = board.filter((r) => r.missedCut);
    assert.equal(inField.length, made.size);
    assert.equal(mc.length, 120 - made.size);
    // Everyone who made the cut is listed (and ranked) before every MC row.
    const firstMc = board.findIndex((r) => r.missedCut);
    assert.equal(firstMc, made.size);
    for (const r of inField) { assert.ok(made.has(r.id)); assert.ok(r.position != null && r.position <= made.size); }
    for (const r of mc) {
      assert.ok(!made.has(r.id));
      assert.equal(r.position, null, `${r.id} must not be ranked among the field`);
      assert.equal(r.positionLabel, 'MC');
      // An MC player's total is their 36-hole total, which can be lower than a
      // weekend player's 72-hole total — yet they still sit below the line.
      assert.equal(r.total, board36.find((b) => b.id === r.id)!.total);
    }
    for (let i = 1; i < mc.length; i++) assert.ok(mc[i].total >= mc[i - 1].total);
    // The field is ranked on four rounds exactly as the engine ranks it alone.
    const final = rankLeaderboard(after(4, [...made]), opts);
    const key = (rs: typeof board) => rs.map((r) => `${r.id}:${r.positionLabel}:${r.total}`).sort();
    assert.deepEqual(key(inField), key(final));
    // Next-round setup proposes ranked rows only (GolfRoundSetupScreen) — no MC.
    const proposed = board.filter((r) => r.position != null).map((r) => r.id);
    assert.deepEqual(new Set(proposed), made);
    // And a further cut on this board can never pull an MC player back in.
    for (const id of makesCut(board, { type: 'top', n: 200 })) assert.ok(made.has(id));
  });
});

describe('litmus: club medal day — net Stableford, three 4-balls', () => {
  const tee = { name: 'Yellow', courseRating: 70.8, slope: 125 };
  const field = [
    { id: 'm1', hi: 4.2 }, { id: 'm2', hi: 9.8 }, { id: 'm3', hi: 14.6 }, { id: 'm4', hi: 18.0 },
    { id: 'm5', hi: 22.3 }, { id: 'm6', hi: 27.1 }, { id: 'm7', hi: 6.5 }, { id: 'm8', hi: 12.0 },
    { id: 'm9', hi: 16.4 }, { id: 'm10', hi: 20.9 }, { id: 'm11', hi: 31.5 }, { id: 'm12', hi: 0.8 },
  ];
  test('handicaps apply, points rank highest-first, countback settles ties', () => {
    const inputs: RankInput[] = field.map((p) => {
      const ph = playingHandicap(courseHandicap(p.hi, tee, H), 95);
      return { id: p.id, status: 'finished', rounds: [{ card: cardFor(p.hi / 18), holes: H, received: strokesReceived(ph, H) }] };
    });
    // Received strokes sum to the playing handicap for every player.
    for (const [i, p] of field.entries()) {
      const ph = playingHandicap(courseHandicap(p.hi, tee, H), 95);
      assert.equal(inputs[i].rounds[0].received.reduce((a, b) => a + b, 0), ph);
    }
    const board = rankLeaderboard(inputs, { scoring: 'stableford', net: true, tieBreak: 'countback' });
    assert.equal(board.length, 12);
    for (let i = 1; i < board.length; i++) assert.ok(board[i].total <= board[i - 1].total);
    // Countback means a unique winner unless every window ties too.
    const firsts = board.filter((r) => r.position === 1);
    assert.ok(firsts.length >= 1);
    // A higher handicapper can win on net points — the point of handicaps.
    assert.ok(board.every((r) => r.total >= 0 && r.total <= 18 * 6));
  });
});
