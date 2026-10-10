/**
 * SD-35 / SD-42 / SD-45 / SD-66 / SD-89 — golf entry admin, pro leaderboard
 * columns, the per-hole stats row, gross + net boards and the playoff option.
 *   - WD / DQ / DNS through buildLeaderboard: below the field, the reason as a
 *     note, a DNS stored as `wd` + card.admin (no migration); reinstating.
 *   - A handicap edit recomputes net (roundContext reads the entry's index).
 *   - Round cells: R1–R4, "F" / thru N / "–".
 *   - Stats row: GIR derived (strokes − putts ≤ par − 2), scrambling, sand
 *     saves, putts per GIR, fairway side; old cards byte-identical (D8).
 *   - Best Gross / Best Net (one prize each); playoff pending → winner 1, T2.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  standardPar72, roundStats, cardHasDetail, derivedGir, golfDetailSummary, type GolfCard,
} from '../src/sports/golf/engine.ts';
import {
  buildLeaderboard, entryStatusOf, entryAdminOf, withAdmin, adminLabel, roundCells, thruLabel, applyPlayoff,
  prizeBoards, golfFormatOf, parseIndex, showIndex,
} from '../src/data/golfLeaderboard.ts';
import { trackedIn } from '../src/sports/statSchema.ts';
import { statSchema } from '../src/sports/statSchemas.ts';
import type { FieldEntry, FieldEntryStatus, FieldEvent, GolfCourse, StatLine } from '../src/core/types.ts';

const H = standardPar72();
const zeros = H.map(() => 0);
const card = (deltas: (number | null)[]): GolfCard => ({ strokes: H.map((h, i) => (deltas[i] == null ? null : h.par + (deltas[i] as number))) });
const even = (over = 0, holes = 18): GolfCard => card(H.map((_, i) => (i < holes ? (i < over ? 1 : 0) : null)));
const course: GolfCourse = { id: 'c1', name: 'Club', holes: H, tees: [{ name: 'White' }] };
const ev = (n: number, format: Record<string, unknown> = {}): FieldEvent => ({
  id: `r${n}`, sport: 'golf', title: `Round ${n}`, roundNo: n, startsAt: `2026-10-0${n}T08:00:00Z`, status: 'live',
  format: { competition: 'stroke', holes: '18', courseId: 'c1', ...format },
});
const en = (pid: string, n: number, c: GolfCard, status: FieldEntryStatus = 'playing', hi?: number): FieldEntry =>
  ({ id: `${pid}-${n}`, eventId: `r${n}`, playerId: pid, groupNo: 1, result: c, status, handicapIndex: hi });
const label = (rows: { id: string; positionLabel: string }[]) => rows.map((r) => `${r.id}:${r.positionLabel}`);

describe('SD-35 — WD / DQ / DNS, reasons, reinstate', () => {
  test('withAdmin: DNS is stored as wd + admin; DQ as dq; null reinstates (finished once closed)', () => {
    const c = even(2, 9);
    const dns = withAdmin(even(0, 0), { status: 'dns', reason: '  No-show ' });
    assert.equal(dns.status, 'wd');
    assert.deepEqual(dns.card.admin, { status: 'dns', reason: 'No-show' });
    assert.equal(entryStatusOf({ status: dns.status, result: dns.card }), 'dns');
    const dq = withAdmin(c, { status: 'dq', reason: 'Wrong score signed (Rule 3.3b)' });
    assert.equal(dq.status, 'dq');
    const wd = withAdmin(c, { status: 'wd', reason: 'Injury', thru: 9 });
    assert.equal(adminLabel(wd.card.admin!), 'WD after 9 — Injury');
    assert.deepEqual(wd.card.strokes, c.strokes, 'the scores stay on the card');
    const back = withAdmin(wd.card, null);
    assert.equal(back.status, 'playing');
    assert.equal('admin' in back.card, false);
    assert.equal(withAdmin(wd.card, null, true).status, 'finished');
    // a plain wd (no admin note) stays wd — never mistaken for a DNS
    assert.equal(entryStatusOf({ status: 'wd', result: c }), 'wd');
    assert.equal(entryAdminOf({ status: 'wd', result: c }), undefined);
  });

  test('leaderboard: WD after starting returns no score; order field, WD, DQ, DNS; the reason rides on the row', () => {
    const rows = buildLeaderboard([ev(1)], [
      en('a', 1, even(2)),
      en('b', 1, even(0)),
      en('w', 1, withAdmin(even(0, 9), { status: 'wd', reason: 'Injury', thru: 9 }).card, 'wd'), // -0 thru 9: would lead
      en('q', 1, withAdmin(even(0), { status: 'dq', reason: 'Late on the tee (Rule 5.3)' }).card, 'dq'),
      en('n', 1, withAdmin(even(0, 0), { status: 'dns' }).card, 'wd'),
    ], [course]);
    assert.deepEqual(label(rows), ['b:1', 'a:2', 'w:WD', 'q:DQ', 'n:DNS']);
    assert.equal(rows.find((r) => r.id === 'w')!.position, null);
    assert.equal(rows.find((r) => r.id === 'w')!.note, 'Injury');
    assert.equal(rows.find((r) => r.id === 'q')!.note, 'Late on the tee (Rule 5.3)');
    assert.equal('note' in rows.find((r) => r.id === 'n')!, false, 'no reason → no note key');
    assert.ok(rows.filter((r) => r.position != null).every((r) => !('note' in r)), 'rows in the field are unchanged');
  });

  test('a handicap edit recomputes net (strokes received follow the entry\'s index)', () => {
    const e = ev(1, { net: true });
    const entries = [en('a', 1, even(6), 'finished', 0), en('b', 1, even(9), 'finished', 0)];
    assert.deepEqual(label(buildLeaderboard([e], entries, [course])), ['a:1', 'b:2']);
    entries[1] = { ...entries[1], handicapIndex: 6 }; // the organiser edits b's index: 6 strokes back
    const rows = buildLeaderboard([e], entries, [course]);
    assert.deepEqual(label(rows), ['b:1', 'a:2']);
    assert.equal(rows[0].total, 9 - 6);
  });

  test('parseIndex: one decimal, 0–54, plus handicaps to +10 (the DB range)', () => {
    assert.equal(parseIndex('12.44'), 12.4);
    assert.equal(parseIndex('+2.1'), -2.1);
    assert.equal(parseIndex('+12'), undefined);
    assert.equal(parseIndex('55'), undefined);
    assert.equal(parseIndex(''), undefined);
    assert.equal(showIndex(-2.1), '+2.1');
    assert.equal(showIndex(undefined), '');
  });
});

describe('SD-42 — round columns, F / thru / –', () => {
  test('R1–R3 cells per player; thru label', () => {
    const entries = [
      en('a', 1, even(2), 'finished'), en('a', 2, even(1), 'finished'), en('a', 3, even(0, 7)),
      en('b', 1, even(0), 'finished'), en('b', 2, even(0), 'finished'), en('b', 3, even(0, 0)),
      en('c', 1, even(9), 'finished'), // missed the cut
    ];
    const { rounds, byPlayer } = roundCells([ev(3), ev(1), ev(2)], entries, [course]);
    assert.deepEqual(rounds, [1, 2, 3]);
    const a = byPlayer.get('a')!;
    assert.equal(a[0]!.gross, 72 + 2);
    assert.equal(thruLabel(a[0]), 'F');
    assert.equal(thruLabel(a[2]), '7');
    assert.equal(thruLabel(byPlayer.get('b')![2]), '–', 'not teed off');
    assert.equal(byPlayer.get('c')![1], null, 'not in round 2');
    assert.equal(thruLabel(byPlayer.get('c')![2]), '–');
  });
});

describe('SD-45 — the per-hole stats row', () => {
  // hole 1 par 4: 4 strokes, 2 putts → GIR; FW hit
  // hole 2 par 4: 5 strokes, 2 putts → missed GIR, no scramble; FW left
  // hole 3 par 3: 3 strokes, 1 putt, greenside bunker → missed GIR, scramble, sand save
  // hole 4 par 5: 5 strokes, 2 putts → GIR (3 to the green); FW right; 1 penalty
  const base = (): GolfCard => ({ ...card([0, 1, 0, 0, ...new Array(14).fill(null)]) });
  const n = H.length;
  const arr = <T,>(vals: Record<number, T>) => H.map((_, i) => (i in vals ? vals[i] : null));

  test('an old card (no stats-row arrays) is byte-identical: no new keys, no derived GIR', () => {
    const old: GolfCard = { ...base(), putts: arr({ 0: 2, 1: 2, 2: 1, 3: 1 }) };
    const s = roundStats(old, H, zeros);
    assert.equal(cardHasDetail(old), false);
    assert.equal(s.girHoles, 0, 'GIR is not derived on a pre-stats-row card');
    for (const k of ['scrambles', 'scrambleHoles', 'sandSaves', 'sandHoles', 'puttsGir', 'girPutted', 'firLeft', 'firRight']) assert.equal(k in s, false, k);
    assert.deepEqual(Object.keys(s).sort(), ['birdies', 'bogeys', 'doubles', 'eagles', 'firHit', 'firHoles', 'girHit', 'girHoles', 'holes', 'pars', 'penalties', 'putts', 'puttHoles', 'rounds', 'stableford', 'strokes'].sort());
  });

  test('a stats-row card: GIR, fairways (par 4/5 only), scrambling, sand saves, putts per GIR, penalties', () => {
    const c: GolfCard = {
      ...base(),
      putts: arr({ 0: 2, 1: 2, 2: 1, 3: 2 }),
      firDir: arr<'L' | 'hit' | 'R'>({ 0: 'hit', 1: 'L', 2: 'hit' /* par 3: ignored */, 3: 'R' }),
      bunker: arr({ 2: true }),
      penalties: arr({ 3: 1 }),
    };
    assert.equal(c.firDir!.length, n);
    const s = roundStats(c, H, zeros);
    assert.equal(s.girHoles, 4); assert.equal(s.girHit, 2);
    assert.equal(s.firHoles, 3); assert.equal(s.firHit, 1);
    assert.equal(s.firLeft, 1); assert.equal(s.firRight, 1);
    assert.equal(s.scrambleHoles, 2); assert.equal(s.scrambles, 1);
    assert.equal(s.sandHoles, 1); assert.equal(s.sandSaves, 1);
    assert.equal(s.girPutted, 2); assert.equal(s.puttsGir, 4);
    assert.equal(s.penalties, 1);
    assert.equal(derivedGir(4, 2, 4), true);
    assert.equal(derivedGir(5, 2, 4), false);
    assert.equal(derivedGir(4, null, 4), null);
  });

  test('coverage "keyed": an old line reads "not tracked"; the profile summary counts only stats-row rounds', () => {
    const golf = statSchema('golf')!;
    const old = { id: 'l1', matchId: '', playerId: 'p', sport: 'golf', stats: roundStats(even(0), H, zeros) } as StatLine;
    const c: GolfCard = { ...base(), putts: arr({ 0: 2, 1: 2, 2: 1, 3: 1 }), bunker: arr({ 2: true }) };
    const fresh = { ...old, id: 'l2', stats: roundStats(c, H, zeros) } as StatLine;
    for (const k of ['scrambles', 'sandSaves', 'puttsGir']) {
      assert.equal(trackedIn(golf, old, k), false, k);
      assert.equal(trackedIn(golf, fresh, k), true, k);
    }
    const d = golfDetailSummary([old, fresh]);
    assert.deepEqual(d.sandSaves, { num: 1, den: 1, rounds: 1 });
    assert.equal(golfDetailSummary([old]).scrambling.rounds, 0);
  });
});

describe('SD-66 — Best Gross / Best Net', () => {
  test('two boards; one prize each leaves the gross winners off the net board', () => {
    const e = ev(1);
    const entries = [en('a', 1, even(1), 'finished', 0), en('b', 1, even(4), 'finished', 10), en('c', 1, even(8), 'finished', 18), en('d', 1, even(2), 'finished', 2)];
    const gross = buildLeaderboard([e], entries, [course], { net: false });
    const net = buildLeaderboard([e], entries, [course], { net: true });
    assert.deepEqual(label(gross), ['a:1', 'd:2', 'b:3', 'c:4']);
    assert.equal(net[0].id, 'c'); // +8 − 17 (95% of 18)
    const both = prizeBoards(gross, net, 2, 'both');
    const one = prizeBoards(gross, net, 2, 'one');
    assert.deepEqual(both.gross.map((r) => r.id), ['a', 'd']);
    assert.ok(one.net.every((r) => r.id !== 'a' && r.id !== 'd'));
    assert.equal(golfFormatOf(ev(1, { prizes: 'one' })).prizes, 'one');
    assert.equal(golfFormatOf(ev(1)).prizes, 'both');
  });
});

describe('SD-89 — playoff tie-break', () => {
  const entries = [en('a', 1, even(2), 'finished'), en('b', 1, even(2), 'finished'), en('c', 1, even(4), 'finished')];
  test('a tie for first reads "Playoff pending" (shared T1) until the winner is recorded', () => {
    const rows = buildLeaderboard([ev(1, { tieBreak: 'playoff' })], entries, [course]);
    assert.deepEqual(label(rows), ['a:T1', 'b:T1', 'c:3']);
    assert.deepEqual(rows.map((r) => r.playoff), ['pending', 'pending', undefined]);
  });
  test('the recorded winner is 1, the loser 2; three-way → T2', () => {
    const rows = buildLeaderboard([ev(1, { tieBreak: 'playoff', playoffWinner: 'b' })], entries, [course]);
    assert.deepEqual(label(rows), ['b:1', 'a:2', 'c:3']);
    assert.deepEqual(rows.map((r) => r.playoff), ['won', 'lost', undefined]);
    const three = applyPlayoff(buildLeaderboard([ev(1, { tieBreak: 'shared' })], [...entries.slice(0, 2), en('c', 1, even(2), 'finished')], [course]), 'c');
    assert.deepEqual(label(three), ['c:1', 'a:T2', 'b:T2']);
  });
  test('no playoff while the tied cards are still being played (or before tee-off)', () => {
    const rows = buildLeaderboard([ev(1, { tieBreak: 'playoff' })], [en('a', 1, even(0, 9)), en('b', 1, even(0, 9)), en('c', 1, even(0, 0))], [course]);
    assert.ok(rows.every((r) => !('playoff' in r)));
    const pb = prizeBoards(rows, rows, 3);
    assert.equal(prizeBoards(rows, rows).gross.length, 1, 'default: one place per four players');
    assert.deepEqual(pb.gross.map((r) => r.id), ['a', 'b'], 'not teed off → not on the prize boards');
  });
  test('countback and shared formats are unchanged (no playoff keys)', () => {
    const rows = buildLeaderboard([ev(1)], entries, [course]);
    assert.ok(rows.every((r) => !('playoff' in r)));
    assert.equal(golfFormatOf(ev(1, { tieBreak: 'playoff' })).tieBreak, 'playoff');
    assert.equal(golfFormatOf(ev(1)).tieBreak, 'countback');
  });
});
