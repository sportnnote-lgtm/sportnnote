/**
 * SD-26 — Swiss done properly (chess, any Swiss).
 *
 * 1. Tie-breaks (FIDE C.07, 2023 regulations): Buchholz, Buchholz Cut-1,
 *    Median-1, Sonneborn-Berger, progressive score, WIN / WON, games played /
 *    won with Black — checked against the published solutions of the FIDE
 *    Arbiters' Commission training paper "Exercises in tie-breaking"
 *    (IA Mario Held, rev. 2403220900, C.07-2023 — arbiters.fide.com,
 *    2024/04), §2.1 Swiss individual crosstable (16 players, 5 rounds, with
 *    half-point byes, pairing-allocated byes, forfeits, a zero-point bye and a
 *    withdrawal), exercises 1–8, 11–13 and 27–33.
 * 2. The unplayed-round rules through the app's own standings (byes, forfeits,
 *    a withdrawn opponent, an unfinished round).
 * 3. Pairing (Dutch approximation, "not FIDE-certified"): round 1 by seed with
 *    a coin toss; invariants over simulated 7–9 round events with 9–20 players
 *    (no repeat opponents, colour difference within ±2, never three of a
 *    colour in a row, at most one bye each and to the lowest eligible).
 * 4. The fixture's `white` drives the game, the standings colours and the
 *    profile's colour split.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fideTieBreaks, type XRound } from '../src/data/swissTiebreaks.ts';
import {
  teamStandings, standingsConfigFromFormat, FIDE_SWISS_ORDER, chessWhiteSide, availableTieBreakers, tieBreakerLabel,
  standingsPresets, activePreset, type TeamStanding, type StandingsConfig,
} from '../src/data/standings.ts';
import { tableColumns } from '../src/data/standingsColumns.ts';
import { swissPairRound, swissRound1, swissNextRound, colourPreference, allocateColours, pairKey, type SwissPlayer, type Colour } from '../src/data/swiss.ts';
import { swissField } from '../src/data/swissField.ts';
import { init as chessInit } from '../src/sports/chess/engine.ts';
import { mergeMatchConfig } from '../src/core/matchConfig.ts';
import type { Match } from '../src/core/types.ts';

// ── 1. The published crosstable ──────────────────────────────────────────────
// Pairing number → round 1..5 ("+W9" = beat #9 with White; "=BYE" half-point
// requested bye; "+BYE" pairing-allocated bye; "+F14"/"-F11" forfeit won /
// lost; "--" zero-point bye / withdrawn).
const CROSSTABLE: Record<number, string[]> = {
  1: ['+W9', '=B13', '=W2', '+B15', '=W4'],
  2: ['+B10', '+W7', '=B1', '+W16', '=B3'],
  3: ['=W11', '+B6', '+W8', '=B4', '=W2'],
  4: ['+B12', '=BYE', '+W13', '=W3', '=B1'],
  5: ['-W13', '-B15', '+W11', '=B7', '+W10'],
  6: ['-B14', '-W3', '+BYE', '+W10', '+B8'],
  7: ['+W15', '-B2', '-B16', '=W5', '-B11'],
  8: ['=B16', '+W14', '-B3', '+W13', '-W6'],
  9: ['-B1', '-W10', '=BYE', '-F11', '+BYE'],
  10: ['-W2', '+B9', '-W15', '-B6', '-B5'],
  11: ['=B3', '-W16', '-B5', '+F9', '+W7'],
  12: ['-W4', '+BYE', '+F14', '--', '--'],
  13: ['+B5', '=W1', '-B4', '-B8', '-W14'],
  14: ['+W6', '-B8', '-F12', '--', '+B13'],
  15: ['-B7', '+W5', '+B10', '-W1', '-B16'],
  16: ['=W8', '+B11', '+W7', '-B2', '+W15'],
};
function parseRound(code: string, round: number): XRound {
  if (code === '--') return { round, kind: 'zpb', points: 0, result: 'loss' };
  const result = code[0] === '+' ? 'win' : code[0] === '=' ? 'draw' : 'loss';
  const points = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const rest = code.slice(1);
  if (rest === 'BYE') return { round, kind: result === 'win' ? 'pab' : 'hpb', points, result };
  if (rest[0] === 'F') return { round, kind: result === 'win' ? 'forfeitWin' : 'forfeitLoss', opponentId: rest.slice(1), points, result };
  return { round, kind: 'played', opponentId: rest.slice(1), points, result, colour: rest[0] === 'W' ? 'white' : 'black' };
}
const records = new Map(Object.entries(CROSSTABLE).map(([id, rs]) => [id, rs.map((c, i) => parseRound(c, i + 1))]));
const TB = fideTieBreaks(records, { swiss: true, draw: 0.5 });
const tb = (id: number) => TB.get(String(id))!;
const each = (expected: Record<number, number>, pick: (id: number) => number, what: string) => {
  for (const [id, v] of Object.entries(expected)) assert.equal(pick(Number(id)), v, `${what} #${id}`);
};

describe('FIDE C.07 tie-breaks — published solutions (Held, "Exercises in tie-breaking", C.07-2023)', () => {
  test('Buchholz, every player (ex. 1–4, 9: opponents\' byes / forfeits at face value, a withdrawal\'s rounds as draws, own unplayed rounds = a dummy on own score)', () => {
    each({ 1: 12.5, 2: 13.0, 3: 15.5, 4: 15.0, 5: 8.5, 6: 12.0, 7: 14.5, 8: 13.5, 9: 9.0, 10: 13.0, 11: 13.5, 12: 11.5, 13: 14.0, 14: 11.0, 15: 12.0, 16: 12.5 },
      (id) => tb(id).bh, 'BH');
  });
  test('Buchholz Cut-1 (ex. 5–8: a voluntary unplayed round is cut first)', () => {
    each({ 1: 11.0, 3: 13.0, 4: 11.5, 5: 7.5, 7: 12.5, 8: 12.0, 9: 7.5, 11: 12.0, 12: 9.5, 13: 12.0, 14: 9.0, 15: 11.0, 16: 11.0 },
      (id) => tb(id).bhc1, 'BH-C1');
  });
  test('Sonneborn-Berger, every player (ex. 11–12: the half-point bye scores ½ × own score)', () => {
    each({ 1: 8.0, 2: 9.5, 3: 10.5, 4: 9.75, 5: 4.25, 6: 6.5, 7: 3.25, 8: 5.25, 9: 2.25, 10: 1.5, 11: 5.75, 12: 4.0, 13: 4.25, 14: 4.5, 15: 3.5, 16: 7.25 },
      (id) => tb(id).sb, 'SB');
  });
  test('Sonneborn-Berger Cut-1 (ex. 13: the larger of the lowest VUR contribution and the least significant opponent\'s is cut)', () => {
    each({ 1: 7.25, 2: 8.5, 3: 9.25, 4: 8.0, 6: 5.5, 8: 3.75, 11: 4.25, 12: 4.0, 14: 3.0, 16: 5.75 }, (id) => tb(id).sbc1, 'SB-C1');
  });
  test('progressive score and its Cut-1 (ex. 32–33)', () => {
    each({ 1: 11.0, 2: 13.0, 3: 11.0, 4: 11.5, 5: 5.0, 6: 6.0, 7: 6.0, 8: 8.5, 9: 2.5, 10: 4.0, 11: 5.5, 12: 7.0, 13: 7.0, 14: 6.0, 15: 7.0, 16: 10.5 },
      (id) => tb(id).ps, 'PS');
    each({ 1: 10.0, 2: 12.0, 3: 10.5, 4: 10.5, 5: 5.0, 6: 6.0, 7: 5.0, 8: 8.0, 9: 2.5, 10: 4.0, 11: 5.0, 12: 7.0, 13: 6.0, 14: 5.0, 15: 7.0, 16: 10.0 },
      (id) => tb(id).psc1, 'PS-C1');
  });
  test('WIN, WON, games played / won with Black (ex. 27–30)', () => {
    const win = { 1: 2, 2: 3, 3: 2, 4: 2, 5: 2, 6: 3, 7: 1, 8: 2, 9: 1, 10: 1, 11: 2, 12: 2, 13: 1, 14: 2, 15: 2, 16: 3 };
    const won = { 1: 2, 2: 3, 3: 2, 4: 2, 5: 2, 6: 2, 7: 1, 8: 2, 9: 0, 10: 1, 11: 1, 12: 0, 13: 1, 14: 2, 15: 2, 16: 3 };
    const bpg = { 1: 2, 2: 3, 3: 2, 4: 2, 5: 2, 6: 2, 7: 3, 8: 2, 9: 1, 10: 3, 11: 2, 12: 0, 13: 3, 14: 2, 15: 3, 16: 2 };
    const bwg = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 0, 6: 1, 7: 0, 8: 0, 9: 0, 10: 1, 11: 0, 12: 0, 13: 1, 14: 1, 15: 1, 16: 1 };
    each(win, (id) => tb(id).win, 'WIN');
    each(won, (id) => tb(id).won, 'WON');
    each(bpg, (id) => tb(id).bpg, 'BPG');
    each(bwg, (id) => tb(id).bwg, 'BWG');
  });
  test('Median-1 (cut the least, then the most significant) — worked by hand from the same crosstable', () => {
    // #2: 1.0 1.5 3.5 3.5 3.5 → drop 1.0 and one 3.5 = 8.5
    assert.equal(tb(2).bhm1, 8.5);
    // #4: #12 (3.0, withdrawal adjusted) · HPB dummy 3.5 (VUR, cut first) · #13 1.5 · #3 3.5 · #1 3.5 → drop the HPB, then a 3.5 = 8.0
    assert.equal(tb(4).bhm1, 8.0);
    // #12: #4 3.5 + four dummies on 2.0 (one ZPB cut first) → 3.5 2 2 2, drop 3.5 = 6.0
    assert.equal(tb(12).bhm1, 6.0);
  });
  test('round robin (C.07 15.2): forfeits are regular games — no dummy, no VUR cut', () => {
    const rr = new Map<string, XRound[]>([
      ['a', [{ round: 1, kind: 'played', opponentId: 'b', points: 1, result: 'win' }, { round: 2, kind: 'forfeitWin', opponentId: 'c', points: 1, result: 'win' }]],
      ['b', [{ round: 1, kind: 'played', opponentId: 'a', points: 0, result: 'loss' }, { round: 2, kind: 'played', opponentId: 'c', points: 0, result: 'loss' }]],
      ['c', [{ round: 1, kind: 'forfeitLoss', opponentId: 'a', points: 0, result: 'loss' }, { round: 2, kind: 'played', opponentId: 'b', points: 1, result: 'win' }]],
    ]);
    const t = fideTieBreaks(rr, { swiss: false, draw: 0.5 });
    assert.deepEqual([t.get('a')!.bh, t.get('a')!.sb, t.get('c')!.bhc1], [1, 1, 2], 'c: the lowest (b, 0) is cut, not the forfeit');
  });
});

// ── 2. Through the app's standings ──────────────────────────────────────────
let seq = 0;
/** A chess Swiss game; `white` = the fixture's colour key (absent = home). */
function g(round: number, home: string, away: string, r: 1 | 0 | 0.5 | 'pending', o: { byes?: string[]; white?: 'home' | 'away'; forfeit?: boolean } = {}): Match {
  return {
    id: `s${++seq}`, sport: 'chess', stage: `swiss${round}`, startsAt: '',
    status: r === 'pending' ? 'scheduled' : 'completed',
    ...(r === 'pending' ? {} : { winner: r === 1 ? 'home' : r === 0 ? 'away' : 'draw', score: { home: r, away: 1 - r } }),
    ...(o.forfeit ? { walkover: true } : {}),
    ...(o.byes ? { byes: o.byes } : {}),
    ...(o.white ? { format: { white: o.white } } : {}),
    homeTeam: { id: home, name: home.toUpperCase() }, awayTeam: { id: away, name: away.toUpperCase() },
    state: null,
  } as unknown as Match;
}
const row = (t: TeamStanding[], id: string) => t.find((x) => x.teamId === id)!;
const swissCfg = (extra: Record<string, unknown> = {}): StandingsConfig => standingsConfigFromFormat('chess', { tieBreak: FIDE_SWISS_ORDER.join(','), ...extra });

describe('unplayed rounds through teamStandings (C.07 Art. 16)', () => {
  // 5 players, 3 rounds. R1: e bye. R2: d bye. R3: b beats c by forfeit; a bye… (no: a plays e)
  const games = (): Match[] => [
    g(1, 'a', 'c', 1, { byes: ['e'] }), g(1, 'b', 'd', 0.5, { byes: ['e'], white: 'away' }),
    g(2, 'a', 'b', 0.5, { byes: ['d'] }), g(2, 'e', 'c', 1, { byes: ['d'] }),
    g(3, 'a', 'e', 0, { byes: ['c'] }), g(3, 'b', 'd', 1, { byes: ['c'], forfeit: true }),
  ];
  test('own bye / forfeit win = a dummy on own score; an opponent\'s bye counts at face value', () => {
    const t = teamStandings(games(), 'chess', swissCfg(), 'swiss');
    // scores: a 1.5, b 2 (½ + ½ + forfeit 1), c 1 (bye), d 1.5 (½ + bye 1), e 3 (bye + 2 wins)
    assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map((id) => row(t, id).points), [1.5, 2, 1, 1.5, 3]);
    // e: bye (dummy 3) + c 1 + a 1.5 → BH 5.5; SB 1×3 + 1×1 + 1×1.5 = 5.5
    assert.deepEqual([row(t, 'e').fide!.bh, row(t, 'e').sb], [5.5, 5.5]);
    // b: d 1.5 + a 1.5 + forfeit win (dummy 2) → BH 5; SB ½×1.5 + ½×1.5 + 1×2 = 3.5
    assert.deepEqual([row(t, 'b').fide!.bh, row(t, 'b').sb], [5, 3.5]);
    // d: b 2 + bye (dummy 1.5) + forfeit LOSS (dummy 1.5, VUR — cut first) → BH 5, Cut-1 3.5
    assert.deepEqual([row(t, 'd').fide!.bh, row(t, 'd').fide!.bhc1], [5, 3.5]);
    // a's opponents: c (1 incl. its bye at face value), b 2, e 3 → 6
    assert.equal(row(t, 'a').fide!.bh, 6);
  });
  test('a withdrawn opponent\'s missing rounds count as draws for the others (16.2.5); an unfinished round is not an absence', () => {
    // f plays round 1 then is never paired again (withdrew) — 3 rounds played.
    const ms = [
      g(1, 'a', 'f', 0), g(1, 'b', 'c', 1),
      g(2, 'a', 'b', 0.5), g(2, 'c', 'd', 0, { byes: [] }),
      g(3, 'a', 'c', 1), g(3, 'b', 'd', 'pending'),
    ];
    const t = teamStandings(ms, 'chess', swissCfg(), 'swiss');
    // f: 1 point, rounds 2–3 absent → seen by a as 1 + ½ + ½ = 2
    assert.equal(row(t, 'f').points, 1);
    assert.equal(row(t, 'a').fide!.bh, 2 + row(t, 'b').points + row(t, 'c').points);
    // b's round 3 is still being played: no absence, so the dummy isn't added
    assert.equal(row(t, 'b').fide!.bh, row(t, 'c').points + row(t, 'a').points);
  });
  test('colours from the fixture\'s `white` (else home) → games with Black', () => {
    const t = teamStandings(games(), 'chess', swissCfg(), 'swiss');
    // b v d in round 1 had White = away (d); a forfeit has no colour.
    const bg = row(t, 'b').games!;
    assert.equal(bg.find((x) => x.round === 1)!.colour, 'black');
    assert.equal(bg.find((x) => x.round === 3)!.colour, undefined);
    assert.equal(row(t, 'b').fide!.bpg, 2);
    assert.equal(row(t, 'd').fide!.bpg, 0);
  });
  test('the FIDE Swiss order ranks and shows its columns (SD-18 table)', () => {
    const t = teamStandings(games(), 'chess', swissCfg(), 'swiss');
    const cols = tableColumns('chess', swissCfg(), 'individual', t).columns.map((c) => c.label).join(' ');
    assert.equal(cols, 'P W-D-L Pts BH-C1 BH SB PS BWG');
    assert.deepEqual(FIDE_SWISS_ORDER, ['bhc1', 'bh', 'sb', 'ps', 'h2h', 'wins', 'bwg']);
    // 1.5 each: a (BH-C1) vs d
    const a = row(t, 'a'), d = row(t, 'd');
    assert.ok(t.indexOf(a) < t.indexOf(d) === a.fide!.bhc1 > d.fide!.bhc1 || a.fide!.bhc1 === d.fide!.bhc1);
  });
  test('the chess tie-break menu, labels and presets', () => {
    for (const k of ['bhc1', 'bh', 'bhm1', 'ps', 'bwg', 'bpg']) assert.ok(availableTieBreakers('chess').includes(k), k);
    assert.equal(tieBreakerLabel('bhc1', 'chess'), 'Buchholz Cut-1');
    assert.equal(tieBreakerLabel('h2h', 'chess'), 'direct encounter');
    assert.equal(tieBreakerLabel('h2h', 'football'), 'head-to-head');
    assert.equal(activePreset('chess', { tieBreak: FIDE_SWISS_ORDER.join(',') })?.id, 'fide-swiss');
    assert.equal(activePreset('chess', {})?.id, 'fide-rr', 'the legacy default is the round-robin order');
    assert.equal(standingsPresets('chess')[0].label, 'FIDE Swiss');
  });
  test('round robin and old tables unchanged: no `fide` unless the chain asks', () => {
    const t = teamStandings([g(1, 'a', 'b', 1)], 'chess', standingsConfigFromFormat('chess', { tieBreak: 'wins,h2h' }));
    assert.equal(row(t, 'a').fide, undefined);
  });
});

// ── 3. Pairing ──────────────────────────────────────────────────────────────
describe('Swiss pairing (Dutch approximation)', () => {
  test('round 1: seed order, top half v bottom half, coin-toss colour alternating by board', () => {
    const w = swissRound1(['1', '2', '3', '4', '5', '6', '7', '8'], 'W');
    assert.deepEqual(w.pairings.map((p) => [p.homeId, p.awayId, p.white]), [['1', '5', 'home'], ['2', '6', 'away'], ['3', '7', 'home'], ['4', '8', 'away']]);
    const b = swissRound1(['1', '2', '3', '4', '5', '6', '7', '8'], 'B');
    assert.deepEqual(b.pairings.map((p) => p.white), ['away', 'home', 'away', 'home']);
  });
  test('round 1, odd field: the lowest seed has the bye (FIDE)', () => {
    const r = swissRound1(['1', '2', '3', '4', '5', '6', '7'], 'W');
    assert.equal(r.byeId, '7');
    assert.deepEqual(r.pairings.map((p) => [p.homeId, p.awayId]), [['1', '4'], ['2', '5'], ['3', '6']]);
  });
  test('colour preferences: absolute / strong / mild', () => {
    assert.deepEqual(colourPreference([]), { strength: 0, diff: 0 });
    assert.equal(colourPreference(['W', 'W']).strength, 3);
    assert.equal(colourPreference(['W', 'W']).colour, 'B');
    assert.deepEqual([colourPreference(['W', 'B', 'W']).colour, colourPreference(['W', 'B', 'W']).strength], ['B', 2]);
    assert.deepEqual([colourPreference(['W', 'B']).colour, colourPreference(['W', 'B']).strength], ['W', 1]);
    assert.equal(colourPreference(['B', 'W', 'B', 'B']).strength, 3);
  });
  test('colour allocation: both granted; the stronger wins; then alternate to the last difference; then the higher-ranked', () => {
    const p = (id: string, rank: number, colours: Colour[]): SwissPlayer => ({ id, rank, score: 1, colours, opponents: new Set(), hadBye: false });
    assert.equal(allocateColours(p('a', 1, ['W']), p('b', 2, ['B']), 0, 'W'), 'b');
    assert.equal(allocateColours(p('a', 1, ['B', 'W', 'B']), p('b', 2, ['W', 'B']), 0, 'W'), 'a', 'strong beats mild');
    assert.equal(allocateColours(p('a', 1, ['W', 'B']), p('b', 2, ['B', 'B', 'W', 'W', 'B']), 0, 'W'), 'b', 'b: diff −1 strong');
    assert.equal(allocateColours(p('a', 1, ['B', 'W']), p('b', 2, ['W', 'W', 'B', 'W']), 0, 'W'), 'a', 'both want Black: b\'s is absolute (+2), so a gets White');
    // same strength: alternate to the last round their colours differed
    // both mild White: back to the last round their colours differed (round 2: a W, b B) → a Black
    assert.equal(allocateColours(p('a', 1, ['B', 'W', 'W', 'B']), p('b', 2, ['W', 'B', 'W', 'B']), 0, 'W'), 'b');
    // never differed: the higher-ranked player's preference
    assert.equal(allocateColours(p('a', 1, ['W', 'B']), p('b', 2, ['W', 'B']), 0, 'W'), 'a');
  });
  test('score groups: leaders meet leaders; an odd group floats its lowest down', () => {
    const p = (id: string, rank: number, score: number): SwissPlayer => ({ id, rank, score, colours: [], opponents: new Set(), hadBye: false });
    const r = swissPairRound([p('a', 1, 2), p('b', 2, 2), p('c', 3, 2), p('d', 4, 1), p('e', 5, 1), p('f', 6, 1)], 3);
    // 2-point group a b c: a v b, c floats to meet the best of the 1-pointers
    assert.deepEqual(r.pairings.map((x) => pairKey(x.homeId, x.awayId)), [pairKey('a', 'b'), pairKey('c', 'd'), pairKey('e', 'f')]);
  });
  test('legacy swissNextRound still avoids rematches and repeat byes', () => {
    const { pairings } = swissNextRound(['1', '2', '3', '4'], new Set([pairKey('1', '2'), pairKey('3', '4')]), 2);
    for (const x of pairings) assert.ok(![pairKey('1', '2'), pairKey('3', '4')].includes(pairKey(x.homeId, x.awayId)));
    assert.equal(swissNextRound(['1', '2', '3'], new Set(), 2, new Set(['3'])).byeId, '2');
  });

  /** Play a whole Swiss with a seeded RNG; returns the players. */
  function simulate(n: number, rounds: number, seed: number) {
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const ps: SwissPlayer[] = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, score: 0, rank: i + 1, opponents: new Set(), colours: [], hadBye: false }));
    const byes: string[] = [];
    let repeats = 0;
    let relaxed = 0;
    for (let r = 1; r <= rounds; r++) {
      const { pairings, byeId, relaxed: rx } = swissPairRound(ps, r, rnd() < 0.5 ? 'W' : 'B');
      if (rx) relaxed++;
      assert.equal(pairings.length, Math.floor(n / 2), `n${n} r${r}: everyone paired`);
      const inRound = new Set(pairings.flatMap((x) => [x.homeId, x.awayId]));
      assert.equal(inRound.size, pairings.length * 2, 'nobody twice in a round');
      if (byeId) {
        assert.ok(!inRound.has(byeId));
        // the bye goes to the lowest-ranked eligible player (or one just above, if pairing needs it)
        const eligible = [...ps].sort((x, y) => y.score - x.score || x.rank - y.rank).filter((x) => !x.hadBye);
        assert.ok(eligible.slice(-3).some((x) => x.id === byeId), `n${n} r${r}: bye near the bottom`);
        byes.push(byeId);
        const b = ps.find((x) => x.id === byeId)!; b.score += 1; b.hadBye = true;
      }
      for (const x of pairings) {
        const h = ps.find((q) => q.id === x.homeId)!, a = ps.find((q) => q.id === x.awayId)!;
        if (h.opponents.has(a.id)) repeats++;
        h.opponents.add(a.id); a.opponents.add(h.id);
        const [w, b] = x.white === 'home' ? [h, a] : [a, h];
        w.colours.push('W'); b.colours.push('B');
        const pw = 0.5 + (b.rank - w.rank) / (3 * n);
        const u = rnd();
        if (u < pw * 0.8) w.score += 1; else if (u < pw * 0.8 + 0.2) { w.score += 0.5; b.score += 0.5; } else b.score += 1;
      }
    }
    return { ps, byes, repeats, relaxed };
  }
  test('invariants over simulated 7–9 round events with 9–20 players (no repeats, colours ±2, no three in a row, one bye each)', () => {
    let events = 0;
    let relaxedEvents = 0;
    for (let n = 9; n <= 20; n++) for (const rounds of [7, 8, 9]) {
      // Keep to fields that a Swiss can finish without repeats (rounds ≤ n − 2,
      // and n − 3 for an even field — beyond that it is a round robin).
      if (rounds > n - 2 - (n % 2 === 0 ? 1 : 0)) continue;
      for (let rep = 0; rep < 6; rep++) {
        events++;
        const { ps, byes, repeats, relaxed } = simulate(n, rounds, 7919 * n + 31 * rounds + rep);
        assert.equal(repeats, 0, `n${n} r${rounds}: no repeat opponents`);
        assert.equal(new Set(byes).size, byes.length, 'nobody gets two byes');
        // "where avoidable": a round the engine had to relax (it says so) is
        // exempt — it must stay rare.
        if (relaxed) { relaxedEvents++; continue; }
        for (const p of ps) {
          const diff = p.colours.filter((c) => c === 'W').length - p.colours.filter((c) => c === 'B').length;
          assert.ok(Math.abs(diff) <= 2, `${p.id} colour difference ${diff}`);
          assert.ok(!/WWW|BBB/.test(p.colours.join('')), `${p.id} three in a row: ${p.colours.join('')}`);
        }
      }
    }
    assert.ok(events >= 150, `${events} events simulated`);
    assert.ok(relaxedEvents / events < 0.02, `${relaxedEvents} of ${events} events needed a relaxed round`);
  });
  test('a near-round-robin field still pairs everyone (a repeat only as the last resort)', () => {
    const { ps } = simulate(10, 9, 42);
    assert.ok(ps.every((p) => p.colours.length === 9));
  });
});

// ── 4. The fixture's White ──────────────────────────────────────────────────
describe('the fixture key `white`', () => {
  test('the game opens with the fixture\'s colour; old fixtures default to home', () => {
    assert.equal(chessInit(mergeMatchConfig({ timeControl: 'rapid' }, { white: 'away' })).white, 'away');
    assert.equal(chessInit({ timeControl: 'rapid' }).white, 'home');
    assert.equal(chessWhiteSide({ state: null, format: { white: 'away' } } as unknown as Match), 'away');
    assert.equal(chessWhiteSide({ state: { white: 'home' }, format: { white: 'away' } } as unknown as Match), 'home', 'the game (scorer\'s switch) wins');
    assert.equal(chessWhiteSide({ state: null } as unknown as Match), 'home');
  });
  test('swissField: scores, seed order, colour history from `white`, forfeit wins count as byes', () => {
    const ms = [
      g(1, 'a', 'c', 1, { byes: ['e'], white: 'away' }), g(1, 'b', 'd', 0.5, { byes: ['e'] }),
      g(2, 'a', 'b', 0.5, { byes: ['d'] }), g(2, 'e', 'c', 1, { byes: ['d'], forfeit: true }),
    ];
    const f = swissField(ms, 'chess', swissCfg(), ['a', 'b', 'c', 'd', 'e']);
    const by = (id: string) => f.find((x) => x.id === id)!;
    assert.deepEqual(f.map((x) => [x.id, x.rank, x.score]), [['a', 1, 1.5], ['b', 2, 1], ['c', 3, 0], ['d', 4, 1.5], ['e', 5, 2]]);
    assert.deepEqual(by('a').colours, ['B', 'W']);
    assert.deepEqual(by('c').colours, ['W'], 'the forfeit has no colour');
    assert.deepEqual([by('d').hadBye, by('e').hadBye, by('a').hadBye], [true, true, false]);
    assert.deepEqual([...by('e').opponents], ['c']);
    // next round: the bye can't go to d or e again
    const next = swissPairRound(f, 3);
    assert.ok(next.byeId && !['d', 'e'].includes(next.byeId));
    for (const x of next.pairings) assert.ok(!by(x.homeId).opponents.has(x.awayId), 'no rematch');
  });
});
