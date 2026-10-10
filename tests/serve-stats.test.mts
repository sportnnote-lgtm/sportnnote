/**
 * SD-22 (GEN-09) — the rally-stats engine (src/sports/serveStats.ts): serve /
 * return figures replayed from the point log. Counts below are HAND-VERIFIED
 * on the SD-14 real-match logs (tests/racketLogs.mts; sources in
 * tests/replay-racket.test.mts) and the SD-01 tennis match with breaks and a
 * deciding-set tiebreak. The working is in the comments.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs, type RallyState } from '../src/sports/rallyEngine.ts';
import { pointInputs, type PointInput } from '../src/sports/rallyEdit.ts';
import { serveStats, serveRows, serveCareerKeys, type ServeStats } from '../src/sports/serveStats.ts';
import { tennisTotals, badmintonTotals, rallyTotals } from '../src/sports/racketTotals.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const R1 = { home: ['h1'], away: ['a1'] };
const R2 = { home: ['h1', 'h2'], away: ['a1', 'a2'] };
const SQUASH = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
const TT = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const playR = (e: typeof SQUASH, cfg: Record<string, unknown>, log: ScoreAction[]) => log.reduce(e.reducer, e.init(cfg));
const pick = (o: object, keys: string[]) => Object.fromEntries(keys.map((k) => [k, (o as Record<string, number>)[k]]));

// ------------------------------------------------------------------ tennis --

describe('tennis — 6-4, 3-6, 7-6(4) (SD-01 log): holds, breaks, BP, tiebreak', () => {
  // Every game is a love game; home serves game 1, serve alternates by game.
  // Set 1 H A H A H A H A H H: home holds 5, away holds 4, home breaks g9.
  // Set 2 H A H A H A A A A (home serves g10..g18): home holds 3, away holds 4, away breaks g16, g18.
  // Set 3: 31 games before it, so away serves g19 — all 12 games are breaks (6 each).
  // Tiebreak (away serves pt 1, then 2 each): H(ace) H H A A A A H H H H → 7-4.
  const s = L.TENNIS_BO3.reduce(tennis.reducer, tennis.init({}));
  const st = serveStats('tennis', s, R1)!;

  test('replay reproduces the score; every server named', () => {
    assert.equal(st.consistent, true);
    assert.equal(st.serverKnown, true);
    assert.equal(st.match.rallies, 135);
    assert.equal(st.periods.length, 3);
  });
  test('service / return games: holds and breaks', () => {
    assert.deepEqual(pick(st.match.home, ['svcGames', 'held', 'rtnGames', 'breaks']), { svcGames: 16, held: 8, rtnGames: 15, breaks: 7 });
    assert.deepEqual(pick(st.match.away, ['svcGames', 'held', 'rtnGames', 'breaks']), { svcGames: 15, held: 8, rtnGames: 16, breaks: 8 });
    assert.deepEqual(pick(st.periods[0].home, ['held', 'breaks']), { held: 5, breaks: 1 });
    assert.deepEqual(pick(st.periods[1].away, ['held', 'breaks']), { held: 4, breaks: 2 });
    // the tiebreak is not a service game
    assert.equal(st.periods[2].home.svcGames + st.periods[2].away.svcGames, 12);
  });
  test('break points: a love break = one BP (0-40), converted; none saved', () => {
    assert.deepEqual(pick(st.match.home, ['bpOpps', 'bpWon', 'bpFaced', 'bpSaved']), { bpOpps: 7, bpWon: 7, bpFaced: 8, bpSaved: 0 });
    assert.deepEqual(pick(st.match.away, ['bpOpps', 'bpWon', 'bpFaced', 'bpSaved']), { bpOpps: 8, bpWon: 8, bpFaced: 7, bpSaved: 0 });
  });
  test('service points: 16 games x4 + 6 tiebreak serves (home), 15x4 + 5 (away)', () => {
    assert.deepEqual(pick(st.match.home, ['srvPlayed', 'srvWon', 'rcvPlayed', 'rcvWon', 'won']), { srvPlayed: 70, srvWon: 36, rcvPlayed: 65, rcvWon: 31, won: 67 });
    assert.deepEqual(pick(st.match.away, ['srvPlayed', 'srvWon', 'rcvPlayed', 'rcvWon', 'won']), { srvPlayed: 65, srvWon: 34, rcvPlayed: 70, rcvWon: 34, won: 68 });
    assert.equal(st.match.home.aces, 1);
  });
  test('set / match points; runs; biggest lead in games', () => {
    // home: set point at 0-40 in g9 (set 1) and 6-4 in the tiebreak (= match point)
    assert.deepEqual(pick(st.match.home, ['spOpps', 'spWon', 'mpOpps', 'mpWon']), { spOpps: 2, spWon: 2, mpOpps: 1, mpWon: 1 });
    assert.deepEqual(pick(st.match.away, ['spOpps', 'spWon', 'mpFaced', 'mpSaved']), { spOpps: 1, spWon: 1, mpFaced: 1, mpSaved: 0 });
    // home: g8, g9 (set 1) + g10 → 12 points; away: g15..g18 → 16
    assert.equal(st.match.home.run, 12);
    assert.equal(st.match.away.run, 16);
    assert.equal(st.match.home.maxLead, 2); // 6-4
    assert.equal(st.match.away.maxLead, 3); // 3-6
  });
  test('panel rows (ATP order) for a set', () => {
    const rows = serveRows(st, st.periods[0]);
    // 'sps': away faced home's set point at 0-40 in g9 (only rows that apply are shown)
    assert.deepEqual(rows.map((r) => r.key), ['aces', 'srv', 'rcv', 'tot', 'held', 'brk', 'bps', 'bpc', 'sps', 'run', 'lead']);
    const held = rows.find((r) => r.key === 'held')!;
    assert.equal(held.home, '5/5 (100%)');
    assert.equal(held.away, '4/5 (80%)');
    // match points saved shows only when one was faced
    assert.ok(serveRows(st, st.match).some((r) => r.key === 'mps'));
  });
});

describe('tennis doubles — serving player by slot, incl. the SD-103 tiebreak rotation', () => {
  const s = L.TENNIS_BO3.reduce(tennis.reducer, tennis.init({ playersPerSide: 2 }));
  const st = serveStats('tennis', s, R2)!;
  test('per-player service points and games', () => {
    // Games: home even games alternate h1/h2 (8 each); away odd games a1 8, a2 7.
    // Tiebreak (G = 31): a2 pt 1 · h1 2-3 · a1 4-5 · h2 6-7 · a2 8-9 · h1 10-11.
    const p = st.match.players;
    assert.deepEqual([p.h1.srvPlayed, p.h2.srvPlayed, p.a1.srvPlayed, p.a2.srvPlayed], [36, 34, 34, 31]);
    // held: h1 g0 g4 g8 g12 · h2 g2 g6 g10 g14 · a1 g1 g5 g13 g17 · a2 g3 g7 g11 g15
    assert.deepEqual([p.h1.srvWon, p.h2.srvWon, p.a1.srvWon, p.a2.srvWon], [20, 16, 18, 16]);
    assert.deepEqual([p.h1.svcGames, p.h1.held, p.h2.svcGames, p.h2.held], [8, 4, 8, 4]);
    assert.deepEqual([p.a1.svcGames, p.a1.held, p.a2.svcGames, p.a2.held], [8, 4, 7, 4]);
  });
  test('the tiebreak alone: h2 serves points 6-7 (the partner takes the pair’s 2nd turn)', () => {
    const tb = L.TENNIS_BO3.slice(0, L.TENNIS_BO3.length - 11).reduce(tennis.reducer, tennis.init({ playersPerSide: 2 }));
    const before = serveStats('tennis', tb, R2)!.match.players;
    const d = (id: string) => st.match.players[id].srvPlayed - before[id].srvPlayed;
    assert.deepEqual([d('a2'), d('h1'), d('a1'), d('h2')], [3, 4, 2, 2]);
  });
  test('a career line: server keys from the player, return keys from the side', () => {
    assert.deepEqual(serveCareerKeys(st, 'home', 'h2'), {
      rcvPts: 65, rcvPtsWon: 31, rtnGames: 15, breaks: 7, bpOpps: 7, bpWon: 7,
      srvPts: 34, srvPtsWon: 16, svcGames: 8, svcHeld: 4, bpFaced: 4, bpSaved: 0,
    });
  });
});

describe('tennis — a correction re-derives (EDIT_LOG)', () => {
  test('flipping a point that turns a hold into deuce, then a break, equals the clean replay', () => {
    const s = L.TENNIS_BO3.reduce(tennis.reducer, tennis.init({}));
    const pts = pointInputs(s.events);
    // game 1 (home serves, 4 straight points): make it 40-40 then two away points
    const edited: PointInput[] = [P('home'), P('home'), P('home'), P('away'), P('away'), P('away'), P('away'), P('away')]
      .map((a) => ({ side: a.side!, kind: 'point' as const }))
      .concat(pts.slice(4));
    const fixed = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: edited } });
    const clean = edited.reduce((x, p) => tennis.reducer(x, { type: p.kind === 'ace' ? 'ACE' : 'POINT', side: p.side }), tennis.init({}));
    const a = serveStats('tennis', fixed, R1)!;
    const b = serveStats('tennis', clean, R1)!;
    assert.deepEqual(a.match, b.match);
    // game 1 is now broken from 40-0: deuce, AD away (the only BP), away wins
    assert.equal(a.periods[0].away.breaks, 1);
    assert.equal(a.periods[0].home.bpFaced, 1);
    assert.notDeepEqual(a.match.home, serveStats('tennis', s, R1)!.match.home);
  });
});

// ------------------------------------------------------------------- padel --

describe('padel — Valencia P1 2026 final (golden point, tiebreaks, serve rotation)', () => {
  const s = L.PADEL_VALENCIA.log.reduce(padel.reducer, padel.init(L.PADEL_VALENCIA.cfg));
  const st = serveStats('padel', s, R2)!;
  test('golden points: two in set 1 (one each), one in set 3 (home)', () => {
    assert.equal(st.golden, true);
    assert.deepEqual([st.periods[0].home.golden, st.periods[0].home.goldenWon, st.periods[0].away.goldenWon], [2, 1, 1]);
    assert.deepEqual([st.periods[2].home.golden, st.periods[2].home.goldenWon], [1, 1]);
    assert.ok(serveRows(st, st.match).some((r) => r.key === 'gold' && r.label === 'Golden points won'));
  });
  test('set 1: all 12 games held; BPs only in the golden games', () => {
    // g4 'h' (home serves): away BP only at 3-3. g7 'a' (away serves): home BP at 3-2 (40-30), saved, and 3-3, saved.
    const b = st.periods[0];
    assert.deepEqual(pick(b.home, ['svcGames', 'held', 'bpFaced', 'bpSaved', 'bpOpps', 'bpWon']), { svcGames: 6, held: 6, bpFaced: 1, bpSaved: 1, bpOpps: 2, bpWon: 0 });
    assert.deepEqual(pick(b.away, ['svcGames', 'held', 'bpFaced', 'bpSaved']), { svcGames: 6, held: 6, bpFaced: 2, bpSaved: 2 });
  });
  test('set 2 (6-1): 13 games played before it, so away serves first → home breaks 3 times', () => {
    const b = st.periods[1];
    assert.deepEqual(pick(b.home, ['held', 'svcGames', 'breaks', 'run']), { held: 3, svcGames: 3, breaks: 3, run: 16 });
    assert.deepEqual(pick(b.away, ['held', 'svcGames']), { held: 1, svcGames: 4 });
  });
  test('match: per-player serving lines add up to the side', () => {
    for (const side of ['home', 'away'] as Side[]) {
      const ps = Object.values(st.match.players).filter((p) => p.side === side);
      assert.equal(ps.reduce((n, p) => n + p.srvPlayed, 0), st.match[side].srvPlayed);
      assert.equal(ps.reduce((n, p) => n + p.svcGames, 0), st.match[side].svcGames);
    }
    assert.equal(st.match.rallies, L.PADEL_VALENCIA.log.length);
  });
});

// --------------------------------------------------------------- badminton --

describe('badminton — 21-18, 19-21, 21-15: the rally winner serves', () => {
  const s = L.BADMINTON_LOG.reduce(badminton.reducer, badminton.init({}));
  test('game 1 (alternating to 18-18, then 3 home): the server loses every alternating rally', () => {
    // rally 0: home serves + wins; rallies 1..35 alternate (server = last winner → loses);
    // rally 36 home wins on receive; 37, 38 home serves and wins.
    const st = serveStats('badminton', s, R1)!;
    const g = st.periods[0];
    assert.deepEqual(pick(g.home, ['srvPlayed', 'srvWon', 'rcvPlayed', 'rcvWon', 'won']), { srvPlayed: 21, srvWon: 3, rcvPlayed: 18, rcvWon: 18, won: 21 });
    assert.deepEqual(pick(g.away, ['srvPlayed', 'srvWon']), { srvPlayed: 18, srvWon: 0 });
    assert.equal(g.home.run, 3);
    assert.equal(g.home.gpOpps, 1); // 20-18
    assert.deepEqual(serveRows(st, g).map((r) => r.key), ['tot', 'srv', 'rcv', 'run', 'lead', 'gps']);
  });
  test('doubles: the serving player is not named (BD-05) → career server keys left out', () => {
    const d = L.BADMINTON_LOG.reduce(badminton.reducer, badminton.init({ playersPerSide: 2 }));
    const st = serveStats('badminton', d, R2)!;
    assert.equal(st.serverKnown, false);
    const t = badmintonTotals(d, L.ctxOf(R2));
    assert.equal('srvPts' in t.h1.stats, false);
    assert.equal(t.h1.stats.rcvPts, st.match.home.rcvPlayed);
    // singles: named
    const one = badmintonTotals(s, L.ctxOf(R1));
    assert.equal(one.h1.stats.srvPts, serveStats('badminton', s, R1)!.match.home.srvPlayed);
  });
});

// ------------------------------------------------------------ table tennis --

describe('table tennis — ITTF service order (2 each; opening server alternates by game)', () => {
  const s = playR(TT, {}, L.TT_LOG);
  const st = serveStats('tabletennis', s, R1)!;
  test('game 1 (11-7): home serves rallies 0-1, 4-5, … 16-17', () => {
    // home serves i ∈ {0,1,4,5,8,9,12,13,16,17}: wins 0,4,8,12,16,17 → 6/10;
    // away serves {2,3,6,7,10,11,14,15}: wins 3,7,11 → 3/8.
    assert.deepEqual(pick(st.periods[0].home, ['srvPlayed', 'srvWon']), { srvPlayed: 10, srvWon: 6 });
    assert.deepEqual(pick(st.periods[0].away, ['srvPlayed', 'srvWon']), { srvPlayed: 8, srvWon: 3 });
  });
  test('game 4 goes to deuce (13-11): one serve each from 10-10; game points both ways', () => {
    const g = st.periods[3];
    assert.equal(g.home.srvPlayed + g.away.srvPlayed, 24);
    // home leads every pair: GP at 10-9 and 11-10 (both saved), then 12-11 → 13-11
    assert.deepEqual(pick(g.home, ['gpOpps', 'gpWon', 'mpOpps', 'mpWon']), { gpOpps: 3, gpWon: 1, mpOpps: 3, mpWon: 1 });
    assert.deepEqual(pick(g.away, ['gpOpps', 'gpSaved', 'mpSaved']), { gpOpps: 0, gpSaved: 2, mpSaved: 2 });
    assert.equal(st.consistent, true);
  });
  test('statTotals carries the keys only with the sport (the rule is the sport’s)', () => {
    const withRule = rallyTotals(s, L.ctxOf(R1), 'tabletennis');
    assert.equal(withRule.h1.stats.srvPts, st.match.home.srvPlayed);
    assert.equal('srvPts' in rallyTotals(s, L.ctxOf(R1)).h1.stats, false);
  });
});

// ------------------------------------------------------------------ squash --

describe('squash PSA — Asal bt Farag (PAR, rally winner serves)', () => {
  const s = playR(SQUASH, L.SQUASH_PSA.cfg, L.SQUASH_PSA.log);
  const st = serveStats('squash', s, R1)!;
  test('game 1 (11-3): rallies H H A H H H H A A H H H H H', () => {
    // home serves 1,2,3,5,6,7,8,11..14 (11) wins 9; away serves 4,9,10 wins 1
    assert.deepEqual(pick(st.periods[0].home, ['srvPlayed', 'srvWon', 'rcvPlayed', 'rcvWon', 'run', 'maxLead']), { srvPlayed: 11, srvWon: 9, rcvPlayed: 3, rcvWon: 2, run: 5, maxLead: 8 });
    assert.deepEqual(pick(st.periods[0].away, ['srvPlayed', 'srvWon']), { srvPlayed: 3, srvWon: 1 });
  });
  test('game 2 (13-11): home game points at 10-8, 10-9, 11-10, 12-11 — Farag saves 3', () => {
    assert.deepEqual(pick(st.periods[1].home, ['gpOpps', 'gpWon']), { gpOpps: 4, gpWon: 1 });
    assert.deepEqual(pick(st.periods[1].away, ['gpFaced', 'gpSaved']), { gpFaced: 4, gpSaved: 3 });
  });
  test('match: one match point (10-8 in game 4), converted', () => {
    assert.deepEqual(pick(st.match.home, ['mpOpps', 'mpWon', 'won']), { mpOpps: 1, mpWon: 1, won: 40 });
    assert.equal(st.match.rallies, 73);
    assert.equal(st.sideOut, false);
  });
});

describe('squash English — Jansher bt Dittmar 1993 (hand-out scoring)', () => {
  const s = playR(SQUASH, L.SQUASH_ENGLISH.cfg, L.SQUASH_ENGLISH.log);
  const st = serveStats('squash', s, R1)!;
  test('game 1 (9-6): turns H2 A1 H0 A3 H3 A2 H4', () => {
    const g = st.periods[0];
    assert.deepEqual(pick(g.home, ['srvPlayed', 'srvWon', 'scored', 'won', 'turns', 'sideOuts', 'run', 'maxLead']),
      { srvPlayed: 12, srvWon: 9, scored: 9, won: 12, turns: 4, sideOuts: 3, run: 4, maxLead: 3 });
    assert.deepEqual(pick(g.away, ['srvPlayed', 'srvWon', 'turns', 'sideOuts', 'run', 'maxLead']),
      { srvPlayed: 9, srvWon: 6, turns: 3, sideOuts: 3, run: 4, maxLead: 2 });
  });
  test('only the server scores: points = rallies won on serve; hand-out rows', () => {
    for (const side of ['home', 'away'] as Side[]) assert.equal(st.match[side].scored, st.match[side].srvWon);
    const keys = serveRows(st, st.match).map((r) => r.label);
    assert.ok(keys.includes('Hand-outs won') && keys.includes('Hand-ins (service turns)'));
    assert.equal(st.match.home.scored, 9 + 9 + 6 + 9);
  });
});

// -------------------------------------------------------------- pickleball --

describe('pickleball side-out doubles — Johns bt McGuffin / Martinez Vich (PPA)', () => {
  const s = playR(PICKLE, L.PICKLE_SIDEOUT_DOUBLES.cfg, L.PICKLE_SIDEOUT_DOUBLES.log);
  const st = serveStats('pickleball', s, R2)!;
  test('game 1 (7-11): turns, side-outs, 2nd-server handovers', () => {
    // home turns [1] [0,2] [2,0] [1,1] = 2+4+4+4 rallies; away [2,0] [3,1] [0,2] [2,1]
    const g = st.periods[0];
    assert.deepEqual(pick(g.home, ['srvPlayed', 'srvWon', 'turns', 'sideOuts', 'handovers']), { srvPlayed: 14, srvWon: 7, turns: 4, sideOuts: 3, handovers: 3 });
    assert.deepEqual(pick(g.away, ['srvPlayed', 'srvWon', 'turns', 'sideOuts', 'handovers', 'gpOpps', 'gpWon']), { srvPlayed: 18, srvWon: 11, turns: 4, sideOuts: 4, handovers: 4, gpOpps: 2, gpWon: 1 });
  });
  test('serving player by court position (USA Pickleball): h1 serves 8, h2 6 in game 1', () => {
    // h1 starts right: 0-0-2 (2 rallies); at odd scores the partner h2 is server 1:
    // turn [0,2] h2 1 · h1 3; [2,0] h2 3 · h1 1; [1,1] h2 2 · h1 2.
    const p = st.periods[0].players;
    assert.deepEqual([p.h1.srvPlayed, p.h2.srvPlayed], [8, 6]);
    assert.equal(st.serverKnown, true);
    const tot = Object.values(st.match.players).reduce((n, x) => n + x.srvPlayed, 0);
    assert.equal(tot, st.match.rallies);
  });
  test('a rally-editor flip re-derives the same as a clean log', () => {
    const rallies = rallyInputs(s.events);
    const edited = rallies.map((p, i) => (i === 5 ? { side: (p.side === 'home' ? 'away' : 'home') as Side, kind: 'rally' as const } : p));
    const fixed = PICKLE.reducer(s, { type: 'EDIT_LOG', payload: { points: edited } });
    const clean = playR(PICKLE, L.PICKLE_SIDEOUT_DOUBLES.cfg, edited.map((p) => P(p.side)));
    assert.deepEqual(serveStats('pickleball', fixed, R2)!.match, serveStats('pickleball', clean, R2)!.match);
  });
});

describe('pickleball rally to 21 — MLP DreamBreaker 21-15 and singles side-out', () => {
  test('rally: one game, one match point, converted; the rally winner serves', () => {
    const s = playR(PICKLE, L.PICKLE_RALLY21.cfg, L.PICKLE_RALLY21.log);
    const st = serveStats('pickleball', s, R1)!;
    // runs 4-0 → 4-3 → 9-3 → 9-8 → 14-8 → 14-12 → 18-12 → 18-15 → 21-15:
    // each run's first rally is won on receive (8 turns of the lead), the rest on serve.
    assert.deepEqual(pick(st.match.home, ['srvPlayed', 'srvWon', 'rcvWon', 'run', 'maxLead', 'mpOpps', 'mpWon']), { srvPlayed: 21, srvWon: 17, rcvWon: 4, run: 5, maxLead: 6, mpOpps: 1, mpWon: 1 });
    assert.equal(st.sideOut, false);
  });
  test('singles side-out (Haworth bt Staksrud): points = rallies won on serve', () => {
    const s = playR(PICKLE, L.PICKLE_SIDEOUT_SINGLES.cfg, L.PICKLE_SIDEOUT_SINGLES.log);
    const st = serveStats('pickleball', s, R1)!;
    assert.deepEqual([st.match.home.scored, st.match.away.scored], [9 + 11 + 11, 11 + 5 + 7]);
    for (const side of ['home', 'away'] as Side[]) assert.equal(st.match[side].scored, st.match[side].srvWon);
    // game 3 [3,1,2,1,2,5,4] from home: 4 home turns
    assert.equal(st.periods[2].home.turns, 4);
    assert.equal(serveRows(st, st.match).some((r) => r.key === 'ho'), false); // singles: no 2nd server
  });
});

// ------------------------------------------------------------- live / misc --

describe('live matches and old states', () => {
  test('a live prefix: only the periods played so far; the next game at 0-0 is not listed', () => {
    const s = L.BADMINTON_LOG.slice(0, 39).reduce(badminton.reducer, badminton.init({}));
    const st = serveStats('badminton', s, R1) as ServeStats;
    assert.equal(st.periods.length, 1);
    assert.equal(st.match.rallies, 39);
  });
  test('no points / not a match → empty or null', () => {
    assert.equal(serveStats('tennis', tennis.init({}), R1)!.match.rallies, 0);
    assert.equal(serveStats('tennis', null), null);
  });
  test('tennis statTotals: every line gets the serve keys (singles)', () => {
    const s = L.TENNIS_BO3.reduce(tennis.reducer, tennis.init({}));
    const t = tennisTotals(s, L.ctxOf(R1));
    assert.deepEqual(pick(t.h1.stats, ['srvPts', 'srvPtsWon', 'svcHeld', 'breaks', 'bpWon']), { srvPts: 70, srvPtsWon: 36, svcHeld: 8, breaks: 7, bpWon: 7 });
  });
  test('rally state of a side-out match with old (pre-SD-21) 🔁 events still replays', () => {
    const s = playR(SQUASH, L.SQUASH_ENGLISH.cfg, L.SQUASH_ENGLISH.log) as RallyState;
    const legacy = { ...s, events: s.events.map((e) => (e.kind === 'rally' ? { ...e, kind: undefined, wonBy: undefined } : e)) };
    assert.deepEqual(serveStats('squash', legacy, R1)!.match, serveStats('squash', s, R1)!.match);
  });
});
