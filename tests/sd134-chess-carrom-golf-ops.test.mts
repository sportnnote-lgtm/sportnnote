/**
 * SD-134 — chess + carrom + golf operations:
 *  • Swiss field management (withdrawals, absences, requested byes with a
 *    limit, late entries) — FIDE C.04.1 / C.07 16;
 *  • a cancelled game no longer blocks the next round; team-Swiss byes;
 *  • the chess round results sheet + numbered pairings;
 *  • prize categories / golf divisions through one filter;
 *  • carrom doubles break order (A1 → B1 → A2 → B2).
 * Old data: no `swissOps` / `prizeCats` / `breakOrder` = exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  swissOpsOf, swissOpsPatch, withdraw, reinstate, setAbsent, setRequestedBye, addLate, setHpbLimit, unavailableIn, pairableIds,
  swissExtraRounds, halfByesOf, roundStatusText, swissRoundComplete, emptySwissOps, type SwissOps,
} from '../src/data/swissOps.ts';
import { teamStandings, standingsConfigFromFormat } from '../src/data/standings.ts';
import { swissField } from '../src/data/swissField.ts';
import { swissPairRound } from '../src/data/swiss.ts';
import { buildCrosstable } from '../src/data/chessCrosstable.ts';
import { collapseTies, rubberFormat, TIE_PRESETS } from '../src/data/teamTie.ts';
import { roundBoards, boardResultAction, pickOutcome, pairingsText, pairingsSheet, resultWhiteFirst, BOARD_KEY } from '../src/sports/chess/roundSheet.ts';
import { init as chessInit, reducer as chessReducer, points as chessPoints, resultString } from '../src/sports/chess/engine.ts';
import {
  genderOf, matchesRule, inCategory, categoryBoard, prizeAwards, unknownFor, prizeSetupOf, prizeSetupPatch, prizeCutoff, CHESS_PRESETS, GOLF_PRESETS,
  type PrizeSetup, type PrizeContext,
} from '../src/data/prizeCategories.ts';
import { init as carromInit, reducer as carromReducer, breakerPlayers, nextBreakerPlayer, boardBreakers, scoreSheet } from '../src/sports/carrom/engine.ts';
import { carromStatTotals } from '../src/sports/carrom/totals.ts';
import type { Match } from '../src/core/types.ts';

let seq = 0;
function chess(home: string, away: string, r: 1 | 0 | 0.5, extra: Partial<Match> = {}): Match {
  return {
    id: `g${++seq}`, sport: 'chess', status: 'completed', startsAt: '',
    winner: r === 1 ? 'home' : r === 0 ? 'away' : 'draw', score: { home: r, away: 1 - r },
    homeTeam: { id: home, name: home.toUpperCase() }, awayTeam: { id: away, name: away.toUpperCase() },
    state: { white: 'home', timeControl: 'rapid', winner: r === 1 ? 'home' : r === 0 ? 'away' : 'draw', ended: true, seq: 1 },
    ...extra,
  } as unknown as Match;
}
const row = (t: ReturnType<typeof teamStandings>, id: string) => t.find((r) => r.teamId === id)!;
const cfgWith = (ops: SwissOps, more: Record<string, unknown> = {}) => standingsConfigFromFormat('chess', { ...more, ...swissOpsPatch(ops) });

describe('Swiss ops — store and edits', () => {
  test('missing / broken value reads empty; round-trips through the format', () => {
    assert.deepEqual(swissOpsOf(undefined), { v: 1 });
    assert.deepEqual(swissOpsOf({ swissOps: '{bad' }), { v: 1 });
    const o = addLate(setRequestedBye(withdraw(emptySwissOps(), 'd', 3), 'a', 2, 0.5) as SwissOps, 'z', 3, 0.5, 'Zoya');
    assert.deepEqual(swissOpsOf(swissOpsPatch(o)), o);
  });
  test('withdrawn from round N: available before, not from N; reinstate brings back', () => {
    const o = withdraw(emptySwissOps(), 'd', 3);
    assert.equal(unavailableIn(o, 'd', 2), null);
    assert.equal(unavailableIn(o, 'd', 3), 'withdrawn');
    assert.equal(unavailableIn(o, 'd', 5), 'withdrawn');
    assert.equal(unavailableIn(reinstate(o, 'd'), 'd', 3), null);
  });
  test('absence and requested byes are per round and exclusive', () => {
    let o = setAbsent(emptySwissOps(), 'b', 2, true);
    assert.equal(unavailableIn(o, 'b', 2), 'absent');
    o = setRequestedBye(o, 'b', 2, 0.5) as SwissOps;
    assert.equal(unavailableIn(o, 'b', 2), 'bye');
    assert.equal(o.absent, undefined);
    assert.deepEqual(pairableIds(['a', 'b', 'c'], o, 2), ['a', 'c']);
    assert.deepEqual(pairableIds(['a', 'b', 'c'], o, 3), ['a', 'b', 'c']);
  });
  test('half-point bye limit (default 2) is enforced; 0-point byes are not limited', () => {
    let o: SwissOps = emptySwissOps();
    o = setRequestedBye(o, 'a', 1, 0.5) as SwissOps;
    o = setRequestedBye(o, 'a', 2, 0.5) as SwissOps;
    assert.equal(halfByesOf(o, 'a'), 2);
    assert.equal(setRequestedBye(o, 'a', 3, 0.5), 'limit');
    assert.notEqual(typeof setRequestedBye(o, 'a', 3, 0), 'string');
    o = setHpbLimit(o, 3);
    assert.notEqual(typeof setRequestedBye(o, 'a', 3, 0.5), 'string');
  });
  test('withdrawing clears later byes; a withdrawn player cannot request one', () => {
    let o = setRequestedBye(emptySwissOps(), 'a', 4, 0.5) as SwissOps;
    o = withdraw(o, 'a', 3);
    assert.equal(o.byes, undefined);
    assert.equal(setRequestedBye(o, 'a', 5, 0), 'withdrawn');
  });
  test('extras: requested byes + every missed round of a late entry', () => {
    const o = addLate(setRequestedBye(emptySwissOps(), 'a', 2, 0.5) as SwissOps, 'z', 3, 0.5, 'Zoya');
    assert.deepEqual(swissExtraRounds(o).map((x) => `${x.id}${x.round}:${x.points}:${x.kind}`), ['z1:0.5:hpb', 'a2:0.5:hpb', 'z2:0.5:hpb']);
    const zero = addLate(emptySwissOps(), 'y', 2, 0);
    assert.deepEqual(swissExtraRounds(zero).map((x) => `${x.id}${x.round}:${x.kind}`), ['y1:zpb']);
  });
  test('status text names who is not paired', () => {
    const o = setRequestedBye(withdraw(setAbsent(emptySwissOps(), 'b', 2, true), 'c', 2), 'd', 2, 0.5) as SwissOps;
    assert.equal(roundStatusText(o, ['a', 'b', 'c', 'd'], 2, (id) => id.toUpperCase()), 'Absent (0): B · Withdrawn: C · ½-point bye: D');
  });
});

describe('Swiss standings with requested byes and late entries', () => {
  const r1 = () => [chess('a', 'c', 1, { stage: 'swiss1' }), chess('b', 'd', 0.5, { stage: 'swiss1' })];
  test('a requested ½ bye scores once its round is drawn — not a game, not a PAB', () => {
    const o = setRequestedBye(emptySwissOps(), 'b', 2, 0.5) as SwissOps;
    const before = teamStandings(r1(), 'chess', cfgWith(o));
    assert.equal(row(before, 'b').points, 0.5, 'round 2 not drawn yet');
    const games = [...r1(), chess('a', 'd', 1, { stage: 'swiss2' }), chess('c', 'e', 1, { stage: 'swiss2' })];
    const t = teamStandings(games, 'chess', cfgWith(o));
    assert.equal(row(t, 'b').points, 1);
    assert.equal(row(t, 'b').played, 1);
    assert.equal(row(t, 'b').byes, undefined);
    const g = row(t, 'b').games!.find((x) => x.round === 2)!;
    assert.equal(g.requested, 'hpb');
  });
  test('the requested bye is a voluntary unplayed round: Buchholz Cut-1 cuts it first (C.07 16.5)', () => {
    const o = setRequestedBye(emptySwissOps(), 'b', 2, 0.5) as SwissOps;
    const games = [...r1(), chess('a', 'd', 1, { stage: 'swiss2' }), chess('c', 'e', 1, { stage: 'swiss2' })];
    const t = teamStandings(games, 'chess', cfgWith(o, { tieBreak: 'bhc1,bh' }));
    const b = row(t, 'b');
    // own score 1: the bye is a dummy at 1; d (opp) score 0.5 → BH 1.5; cut the VUR (1) → 0.5
    assert.equal(b.fide!.bh, 1.5);
    assert.equal(b.fide!.bhc1, 0.5);
  });
  test('organiser gives ½ only when asked; a 0-point bye shows as zpb', () => {
    const o = setRequestedBye(emptySwissOps(), 'b', 2, 0) as SwissOps;
    const games = [...r1(), chess('a', 'd', 1, { stage: 'swiss2' })];
    const t = teamStandings(games, 'chess', cfgWith(o));
    assert.equal(row(t, 'b').points, 0.5);
    assert.equal(row(t, 'b').games!.find((x) => x.round === 2)!.requested, 'zpb');
  });
  test('a late entrant appears with their missed-round points and the crosstable says "bye½"', () => {
    const o = addLate(emptySwissOps(), 'z', 2, 0.5, 'Zoya');
    const games = [...r1(), chess('z', 'a', 1, { stage: 'swiss2' })];
    const cfg = cfgWith(o);
    const t = teamStandings(games, 'chess', cfg);
    assert.equal(row(t, 'z').points, 1.5);
    assert.equal(row(t, 'z').played, 1);
    const x = buildCrosstable({ rows: t, cfg });
    const z = x.rows.find((r) => r.teamId === 'z')!;
    assert.equal(z.cells[0].text, 'bye½');
    assert.equal(z.cells[0].kind, 'bye');
  });
  test('a game in the round wins over a stale requested bye (no double credit)', () => {
    const o = setRequestedBye(emptySwissOps(), 'a', 1, 0.5) as SwissOps;
    const t = teamStandings(r1(), 'chess', cfgWith(o));
    assert.equal(row(t, 'a').points, 1);
  });
  test('a withdrawn player: missing rounds are absences (0) — nothing stored', () => {
    const o = withdraw(emptySwissOps(), 'd', 2);
    const games = [...r1(), chess('a', 'b', 1, { stage: 'swiss2' })];
    const t = teamStandings(games, 'chess', cfgWith(o, { tieBreak: 'bh' }));
    assert.equal(row(t, 'd').points, 0.5);
    const x = buildCrosstable({ rows: t, cfg: cfgWith(o, { tieBreak: 'bh' }) });
    assert.equal(x.rows.find((r) => r.teamId === 'd')!.cells[1].text, '–');
  });
  test('no swissOps key: the config is exactly as before', () => {
    const plain = standingsConfigFromFormat('chess', { byePoints: 1 });
    assert.equal('swissExtras' in plain, false);
  });
});

describe('Swiss pairing with the ops', () => {
  test('withdrawn / absent are left out; a late entrant joins the field', () => {
    const games = [chess('a', 'c', 1, { stage: 'swiss1' }), chess('b', 'd', 0.5, { stage: 'swiss1' })];
    let o = withdraw(emptySwissOps(), 'd', 2);
    o = addLate(o, 'z', 2, 0, 'Zoya');
    const field = swissField(games, 'chess', cfgWith(o), ['a', 'b', 'c', 'd'], undefined, o);
    assert.ok(field.some((p) => p.id === 'z'));
    const avail = field.filter((p) => unavailableIn(o, p.id, 2) === null);
    assert.deepEqual(avail.map((p) => p.id).sort(), ['a', 'b', 'c', 'z']);
    const r = swissPairRound(avail, 2);
    assert.equal(r.pairings.length, 2);
    assert.equal(r.byeId, undefined);
    const ids = r.pairings.flatMap((p) => [p.homeId, p.awayId]);
    assert.ok(!ids.includes('d'));
  });
  test('a requested bye is not a pairing-allocated bye: the player can still get the PAB later', () => {
    const games = [chess('a', 'b', 1, { stage: 'swiss1' })];
    const o = setRequestedBye(emptySwissOps(), 'c', 1, 0.5) as SwissOps;
    const field = swissField(games, 'chess', cfgWith(o), ['a', 'b', 'c'], undefined, o);
    assert.equal(field.find((p) => p.id === 'c')!.hadBye, false);
  });
  test('a cancelled game no longer blocks the next round', () => {
    assert.equal(swissRoundComplete([{ status: 'completed' }, { status: 'cancelled' }]), true);
    assert.equal(swissRoundComplete([{ status: 'completed' }, { status: 'scheduled' }]), false);
    assert.equal(swissRoundComplete([]), false);
  });
});

describe('Team Swiss bye', () => {
  test('the tie keeps the round bye, so the team sitting out scores', () => {
    const spec = TIE_PRESETS.find((p) => p.id === 'ch-4boards')!.spec;
    const rub = (i: number, r: 1 | 0): Match => ({
      ...chess('A', 'B', r, { stage: 'swiss1', byes: ['C'] }),
      format: rubberFormat(spec, i, { seriesId: 't1', teamAId: 'A' }),
    } as unknown as Match);
    const legs = [rub(0, 1), rub(1, 1), rub(2, 0), rub(3, 1)];
    const tm = collapseTies(legs);
    assert.equal(tm.length, 1);
    assert.deepEqual(tm[0].byes, ['C']);
    const t = teamStandings(legs, 'chess', standingsConfigFromFormat('chess', { winPoints: 2, drawPoints: 1, lossPoints: 0, byePoints: 2 }));
    assert.equal(row(t, 'C').points, 2);
    assert.equal(row(t, 'A').points, 2);
  });
});

describe('Round sheet', () => {
  const g = (id: string, h: string, a: string, extra: Partial<Match>) => ({
    id, sport: 'chess', stage: 'swiss2', status: 'scheduled', startsAt: '2026-10-12T10:00:00Z',
    homeTeam: { id: h, name: h.toUpperCase() }, awayTeam: { id: a, name: a.toUpperCase() }, ...extra,
  }) as unknown as Match;
  test('boards follow the saved board number; White first', () => {
    const ms = [g('m2', 'c', 'd', { format: { [BOARD_KEY]: 2, white: 'away' } }), g('m1', 'a', 'b', { format: { [BOARD_KEY]: 1 } })];
    const b = roundBoards(ms, 2);
    assert.deepEqual(b.map((x) => [x.no, x.whiteName, x.blackName]), [[1, 'A', 'B'], [2, 'D', 'C']]);
  });
  test('older games: higher pre-round score first', () => {
    const ms = [g('m1', 'a', 'b', {}), g('m2', 'c', 'd', {})];
    const pts: Record<string, number> = { a: 0, b: 0, c: 1, d: 1 };
    assert.deepEqual(roundBoards(ms, 2, (id) => pts[id]).map((x) => x.matchId), ['m2', 'm1']);
  });
  test('each pick is the same RESULT the game screen records, and replays to the right score', () => {
    for (const [pick, white, exp] of [
      ['1-0', 'home', '1-0'], ['0-1', 'home', '0-1'], ['½-½', 'away', '½-½'], ['1-0', 'away', '1-0'], ['0-0', 'home', '0-0'],
    ] as const) {
      const a = boardResultAction(pick, white, { home: { id: 'p1', fullName: 'Asha' }, away: { id: 'p2', fullName: 'Vikram' } });
      let s = chessInit({ white });
      s = chessReducer(s, a);
      assert.equal(s.ended, true);
      assert.equal(resultString(s), exp, `${pick} with ${white} White`);
    }
    const ff = boardResultAction('-/+', 'home');
    assert.deepEqual(ff.payload, { winner: 'away', method: 'forfeit' });
    const s = chessReducer(chessInit({}), ff);
    assert.deepEqual(chessPoints(s), { home: 0, away: 1 });
  });
  test('profile credits: games + outcome; forfeits as forfeit wins / losses', () => {
    const a = boardResultAction('1-0', 'away', { home: { id: 'h', fullName: 'H' }, away: { id: 'w', fullName: 'W' } });
    assert.equal(a.side, 'away');
    assert.deepEqual(a.attribution2?.extra, { wins: 1 });
    assert.deepEqual(a.attribution?.extra, { losses: 1 });
    const f = boardResultAction('+/-', 'home', { home: { id: 'h', fullName: 'H' }, away: { id: 'w', fullName: 'W' } });
    assert.equal(f.attribution?.stat, 'forfeitWins');
    assert.equal(f.attribution2?.stat, 'forfeitLosses');
    assert.deepEqual(pickOutcome('0-0', 'home'), { winner: 'draw', method: 'double-forfeit' });
  });
  test('results White first, FIDE style', () => {
    const base = { status: 'completed', format: { white: 'away' } } as unknown as Match;
    assert.equal(resultWhiteFirst({ ...base, winner: 'away', state: { white: 'away' } } as Match), '1-0');
    assert.equal(resultWhiteFirst({ ...base, winner: 'home', state: { white: 'away', method: 'forfeit' } } as Match), '−/+');
    assert.equal(resultWhiteFirst({ ...base, winner: 'draw', state: { method: 'double-forfeit' } } as Match), '0-0');
  });
  test('pairing sheet text and A4 table', () => {
    const boards = roundBoards([g('m1', 'a', 'b', { format: { [BOARD_KEY]: 1 } })], 2, () => 1.5);
    const t = pairingsText({ event: 'Open', round: 2, boards, byes: ['C'], notPaired: 'Withdrawn: D' });
    assert.match(t, /Round 2 pairings/);
    assert.match(t, /Bd 1\. A \(1½\) – B \(1½\)/);
    assert.match(t, /Bye: C/);
    assert.match(t, /Not paired — Withdrawn: D/);
    const h = pairingsSheet({ round: 2, boards: [{ ...boards[0], whiteName: '<x>' }] });
    assert.match(h, /&lt;x&gt;/);
  });
});

describe('Prize categories / golf divisions', () => {
  const people: Record<string, { gender?: string; dob?: string; age?: number }> = {
    a: { gender: 'Male', dob: '2015-03-01' }, b: { gender: 'female', dob: '2016-06-01' }, c: { gender: 'Girl', dob: '2010-01-01' },
    d: {}, e: { gender: 'M', age: 40 },
  };
  const ratings: Record<string, number> = { a: 1500, c: 1700 };
  const ctx: PrizeContext = { cutoff: '2027-01-01', personOf: (id) => people[id], ratingOf: (id) => ratings[id] };
  const rows = ['c', 'a', 'e', 'b', 'd'].map((id, i) => ({ id, position: i + 1 }));
  const setup = (cats: string[], more: Partial<PrizeSetup> = {}): PrizeSetup => ({ v: 1, cats: [...CHESS_PRESETS, ...GOLF_PRESETS].filter((c) => cats.includes(c.id)), ...more });
  test('gender words', () => {
    assert.equal(genderOf('Female'), 'F'); assert.equal(genderOf('girl'), 'F'); assert.equal(genderOf('woman'), 'F');
    assert.equal(genderOf('M'), 'M'); assert.equal(genderOf('Boy'), 'M'); assert.equal(genderOf('prefer not to say'), undefined);
  });
  test('age on the cut-off: U-11 on 1 Jan 2027 = born after 1 Jan 2016', () => {
    const u11 = CHESS_PRESETS.find((c) => c.id === 'u11')!;
    assert.equal(matchesRule(u11, 'a', ctx), false); // 11 on 1 Jan 2027
    assert.equal(matchesRule(u11, 'b', ctx), true); // 10
    assert.equal(matchesRule(u11, 'd', ctx), undefined); // no DOB
    assert.equal(prizeCutoff({ ageOn: 'jan1' }, 'chess', '2027-03-10'), '2027-01-01');
    assert.equal(prizeCutoff(null, 'golf', '2027-03-10'), '2027-12-31');
  });
  test('unrated and rating bands (below 1600 includes the unrated)', () => {
    const unr = CHESS_PRESETS.find((c) => c.id === 'unrated')!;
    const b16 = CHESS_PRESETS.find((c) => c.id === 'b1600')!;
    assert.equal(matchesRule(unr, 'a', ctx), false);
    assert.equal(matchesRule(unr, 'b', ctx), true, 'no rating = unrated');
    assert.equal(matchesRule(b16, 'b', ctx), true, 'below 1600 includes the unrated');
    assert.equal(matchesRule(b16, 'c', ctx), false);
  });
  test('category board keeps the overall order, renumbers, shares ties', () => {
    const s = setup(['girls']);
    const girls = s.cats[0];
    assert.deepEqual(categoryBoard(rows, s, girls, ctx).map((x) => [x.row.id, x.label]), [['c', '1'], ['b', '2']]);
    const tied = [{ id: 'c', position: 1 }, { id: 'b', position: 1 }];
    assert.deepEqual(categoryBoard(tied, s, girls, ctx).map((x) => x.label), ['T1', 'T1']);
  });
  test('hand edits: add a player the profile cannot place; drop one', () => {
    const s = setup(['girls'], { add: { girls: ['d'] }, drop: { girls: ['c'] } });
    assert.equal(inCategory(s, s.cats[0], 'd', ctx), true);
    assert.equal(inCategory(s, s.cats[0], 'c', ctx), false);
    assert.deepEqual(unknownFor(setup(['girls']), s.cats[0], ['a', 'b', 'd'], ctx), ['d']);
  });
  test('one prize per player: overall winners are passed over, next one moves up', () => {
    // categories are awarded in the setup's order (U-11 before Best girl)
    const s = setup(['girls', 'u11'], { places: 1, mainPlaces: 1 });
    const res = prizeAwards(rows, s, ctx);
    assert.deepEqual(res.main, ['c']);
    assert.deepEqual(res.byCat.get('u11')!.map((a) => a.id), ['b']);
    // c took the overall prize, b the U-11 prize → no other girl
    assert.deepEqual(res.byCat.get('girls')!.map((a) => a.id), []);
    const many = prizeAwards(rows, { ...s, onePrize: false }, ctx);
    assert.deepEqual(many.byCat.get('girls')!.map((a) => a.id), ['c']);
  });
  test('golf divisions: boys / girls by age', () => {
    const s = setup(['bu12', 'gu12']);
    assert.deepEqual(categoryBoard(rows, s, s.cats[0], ctx).map((x) => x.row.id), ['a']);
    assert.deepEqual(categoryBoard(rows, s, s.cats[1], ctx).map((x) => x.row.id), ['b']);
  });
  test('stored as JSON on the format; empty clears', () => {
    const s = setup(['girls', 'u9'], { places: 2, onePrize: false });
    assert.deepEqual(prizeSetupOf(prizeSetupPatch(s)), s);
    assert.equal(prizeSetupOf(prizeSetupPatch(null)), null);
    assert.equal(prizeSetupOf(undefined), null);
  });
});

describe('Carrom doubles break order', () => {
  const order = { home: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }], away: [{ id: 'b1', name: 'B1' }, { id: 'b2', name: 'B2' }] };
  const board = (side: 'home' | 'away', coins = 1) => ({ type: 'BOARD', side, payload: { coins, queen: false } });
  test('A1 → B1 → A2 → B2, then round again', () => {
    let s = carromInit({ playersPerSide: 2 });
    s = carromReducer(s, { type: 'FIRST_BREAK', payload: { side: 'home', order } });
    assert.equal(nextBreakerPlayer(s)?.id, 'a1');
    for (let i = 0; i < 5; i++) s = carromReducer(s, board(i % 2 ? 'away' : 'home'));
    assert.deepEqual(breakerPlayers(s).map((c) => c?.id), ['a1', 'b1', 'a2', 'b2', 'a1']);
    assert.equal(nextBreakerPlayer(s)?.id, 'b1');
    assert.deepEqual(scoreSheet(s)[0].rows.map((r) => r.breakerBy?.name), ['A1', 'B1', 'A2', 'B2', 'A1']);
  });
  test('each partner is credited their OWN breaks', () => {
    let s = carromInit({ playersPerSide: 2 });
    s = carromReducer(s, { type: 'FIRST_BREAK', payload: { side: 'home', order } });
    // a1 breaks b1, b1 breaks, a2 breaks, b2 breaks; home wins boards 1 and 3
    for (const w of ['home', 'away', 'home', 'home'] as const) s = carromReducer(s, board(w));
    const t = carromStatTotals(s, { players: { home: [{ id: 'a1' }, { id: 'a2' }], away: [{ id: 'b1' }, { id: 'b2' }] } } as never);
    assert.equal(t.a1.stats.boardBreaks, 1); assert.equal(t.a1.stats.boardBreaksWon, 1);
    assert.equal(t.a2.stats.boardBreaks, 1); assert.equal(t.a2.stats.boardBreaksWon, 1);
    assert.equal(t.b2.stats.boardBreaks, 1); assert.equal(t.b2.stats.boardBreaksWon, 0);
  });
  test('old logs (no order) replay exactly as before', () => {
    let s = carromInit({ playersPerSide: 2 });
    s = carromReducer(s, { type: 'FIRST_BREAK', payload: { side: 'away' } });
    for (const w of ['home', 'away'] as const) s = carromReducer(s, board(w));
    assert.equal(s.breakOrder, undefined);
    assert.deepEqual(breakerPlayers(s), [null, null]);
    assert.deepEqual(boardBreakers(s), ['away', 'home']);
    const t = carromStatTotals(s, { players: { home: [{ id: 'a1' }, { id: 'a2' }], away: [{ id: 'b1' }, { id: 'b2' }] } } as never);
    assert.equal(t.a1.stats.boardBreaks, 1); assert.equal(t.a2.stats.boardBreaks, 1);
  });
  test('fixing the toss keeps the order; a bad order is ignored', () => {
    let s = carromInit({ playersPerSide: 2 });
    s = carromReducer(s, { type: 'FIRST_BREAK', payload: { side: 'home', order } });
    s = carromReducer(s, { type: 'FIRST_BREAK', payload: { side: 'away' } });
    assert.equal(nextBreakerPlayer(s)?.id, 'b1');
    const bad = carromReducer(carromInit({}), { type: 'FIRST_BREAK', payload: { side: 'home', order: { home: [{ id: 'x' }] } } });
    assert.equal(bad.breakOrder, undefined);
  });
});
