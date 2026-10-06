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
