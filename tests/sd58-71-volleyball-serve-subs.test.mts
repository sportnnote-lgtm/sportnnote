/**
 * SD-58 serve tracking (toss, rotation, server named, ace / serve error
 * credited) + SD-71 substitutions & libero (FIVB 15.6, 15.7, 19.3) + the
 * serve-error part of SD-81. Every new action is optional: logs without them
 * replay to exactly their old state (the frozen-oracle tests cover that).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as vb from '../src/sports/volleyball/engine.ts';
import { trackCourt, checkSub, firstServer, liberoCue, rallyServers } from '../src/sports/volleyball/rotation.ts';
import { volleyballStatTotals } from '../src/sports/volleyball/totals.ts';
import { volleyballTotals } from '../src/sports/volleyball/fieldTime.ts';
import { volleyballStats } from '../src/sports/volleyball/stats.ts';
import { pointInputs, correctionActions } from '../src/sports/rallyEdit.ts';
import { serveStats, serveRows } from '../src/sports/serveStats.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const P = (id: string, name: string) => ({ id, name });
const H = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((id, i) => P(id, ['Rohan', 'Asha', 'Dev', 'Isha', 'Kiran', 'Meera'][i]));
const A = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id, i) => P(id, ['Priya', 'Arjun', 'Bela', 'Chirag', 'Dia', 'Esha'][i]));
const HB = P('h7', 'Nikhil'); // home bench
const HB2 = P('h8', 'Omar');
const HL = P('h9', 'Lata'); // home libero
const play = (acts: ScoreAction[], cfg?: Record<string, unknown>) => acts.reduce(vb.reducer, vb.init(cfg));
const pt = (side: Side, kind: vb.VbOutcome = 'attack'): ScoreAction => vb.outcomeAction(kind, side);
const pts = (side: Side, n: number) => Array.from({ length: n }, () => pt(side));
const fp = (p: { id: string; name: string }) => ({ id: p.id, fullName: p.name });
const setup: ScoreAction[] = [
  { type: 'LINEUP', payload: { team: 'home', players: H } },
  { type: 'LINEUP', payload: { team: 'away', players: A } },
  { type: 'SET_SERVE', payload: { side: 'home' } },
  { type: 'SET_ROTATION', payload: { team: 'home', players: H, liberos: [HL] } },
  { type: 'SET_ROTATION', payload: { team: 'away', players: A } },
];

describe('SD-58 — old logs are untouched', () => {
  test('init has no serve / rotation / subs keys; a log without the new actions tracks nothing', () => {
    const s = play(pts('home', 3));
    for (const k of ['serve', 'rotation', 'liberos', 'subs']) assert.equal(k in s, false, k);
    const t = trackCourt(s);
    assert.ok(t.rallies.every((r) => r.side === null || r.serverId === undefined));
    assert.equal(serveStats('volleyball', s), null); // no toss → no serve panel
    assert.equal(vb.servingSide(s), 'home'); // the SD-117b derived fallback
  });
  test('an unknown action type is ignored', () => {
    const s = play(pts('home', 2));
    assert.equal(vb.reducer(s, { type: 'NOPE', side: 'home' }), s);
  });
});

describe('SD-58 — toss and first server per set (FIVB 7.1)', () => {
  test('the toss names the first server; set 2 flips; the decider needs a new toss', () => {
    let s = play([{ type: 'SET_SERVE', payload: { side: 'away' } }], { setsToWin: 2 });
    assert.equal(vb.servingSide(s), 'away');
    s = [...pts('home', 25)].reduce(vb.reducer, s);
    assert.equal(firstServer(s, 2), 'home');
    assert.equal(vb.servingSide(s), 'home');
    s = [...pts('away', 25)].reduce(vb.reducer, s);
    assert.equal(vb.isDecider(s), true);
    assert.equal(vb.servingSide(s), null);
    s = vb.reducer(s, { type: 'SET_SERVE', payload: { side: 'away' } });
    assert.equal(vb.servingSide(s), 'away');
    assert.deepEqual(s.serve, { 1: 'away', 3: 'away' });
  });
  test('the rally winner serves next', () => {
    const s = play([{ type: 'SET_SERVE', payload: { side: 'home' } }, pt('away')]);
    assert.equal(vb.servingSide(s), 'away');
  });
});

describe('SD-58 — rotation and the named server', () => {
  test('position I serves; a side-out rotates the team that wins the serve back', () => {
    let s = play(setup);
    assert.equal(trackCourt(s).server?.name, 'Rohan');
    s = vb.reducer(s, pt('home')); // home holds serve: Rohan again
    assert.equal(trackCourt(s).server?.name, 'Rohan');
    s = vb.reducer(s, pt('away')); // side-out: away rotates, Arjun (II → I) serves
    let t = trackCourt(s);
    assert.equal(t.serving, 'away');
    assert.equal(t.server?.name, 'Arjun');
    assert.deepEqual(t.court.away!.map((p) => p.id), ['a2', 'a3', 'a4', 'a5', 'a6', 'a1']);
    s = vb.reducer(s, pt('home')); // side-out: home rotates, Asha serves
    t = trackCourt(s);
    assert.equal(t.server?.name, 'Asha');
    assert.deepEqual(rallyServers(s).map((r) => r.serverName), ['Rohan', 'Rohan', 'Arjun']);
  });
  test('a rotation set mid-set is the court as it stands now (no replayed rotations)', () => {
    let s = play([{ type: 'SET_SERVE', payload: { side: 'home' } }, pt('away'), pt('home'), pt('away')]);
    s = vb.reducer(s, { type: 'SET_ROTATION', payload: { team: 'away', players: A } });
    assert.equal(s.rotation![1].awayAt, 3);
    assert.equal(trackCourt(s).server?.name, 'Priya'); // away serves now; I = Priya
    s = vb.reducer(s, pt('home'));
    s = vb.reducer(s, pt('away')); // side-out → away rotates once
    assert.equal(trackCourt(s).server?.name, 'Arjun');
  });
  test('the stamps survive a timeline correction (EDIT_LOG)', () => {
    const s = play([...setup, pt('home'), pt('away'), pt('home')]);
    const fixed = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(fixed, s);
  });
});

describe('SD-58 / SD-81 — ace and serve error credited to the server', () => {
  test('ace pre-filled with the server credits aces + points', () => {
    const s = play(setup);
    const srv = trackCourt(s).server!;
    const a = vb.outcomeAction('ace', 'home', fp(srv));
    assert.equal(a.attribution?.playerId, 'h1');
    assert.equal(a.attribution?.stat, 'aces');
  });
  test('a missed serve charges the opponent server serveErrors (keyed), survives a correction', () => {
    let s = play([...setup, pt('away')]); // away serves: Arjun
    const opp = trackCourt(s).server!;
    assert.equal(opp.name, 'Arjun');
    const a = vb.outcomeAction('serveerror', 'home', undefined, { by: fp(opp) });
    assert.deepEqual(a.attribution2, { playerId: 'a2', stat: 'serveErrors', playerName: 'Arjun', side: 'away' }); // SD-119: the server's side
    s = vb.reducer(s, a);
    const e = s.events[s.events.length - 1];
    assert.equal(e.kind, 'serveerror');
    assert.deepEqual(e.oe, { playerName: 'Arjun', playerId: 'a2' });
    const t = volleyballStatTotals(s);
    assert.equal(t.a2.stats.serveErrors, 1);
    assert.equal(t.h1.stats.serveErrors, 0); // every line of a match that tracked it
    // replay keeps the server
    const r = vb.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(r, s);
    // removing that point in the editor reverses the charge
    const old = pointInputs(s.events);
    const acts = correctionActions(old, old.slice(0, -1), () => undefined);
    assert.ok(acts.some((x) => x.type === 'STAT_ADJUST' && x.attribution?.stat === 'serveErrors' && x.attribution.by === -1));
  });
  test('an old match never writes serveErrors (not tracked, never 0)', () => {
    const s = play([{ type: 'LINEUP', payload: { team: 'home', players: H } }, pt('home', 'serveerror'), pt('home')]);
    for (const l of Object.values(volleyballStatTotals(s))) assert.equal(l.stats.serveErrors, undefined);
  });
  test('schema: serveErrors is a keyed line stat in the Serve section', () => {
    const d = volleyballStats.stats.find((x) => x.key === 'serveErrors')!;
    assert.equal(d.coverage, 'keyed');
    assert.equal(d.source, undefined);
    assert.ok(volleyballStats.sections!.find((x) => x.id === 'serve')!.rows.some((r) => r.stat === 'serveErrors'));
  });
});

describe('SD-58 — serve stats panel (SD-22 engine)', () => {
  test('side-out %, points on serve, serve errors and per-server figures', () => {
    const s = play([
      ...setup,
      pt('home'), // Rohan serves, won
      pt('away'), // Rohan serves, side-out
      pt('away', 'ace'), // Arjun serves, ace
      vb.outcomeAction('serveerror', 'home', undefined, { by: fp(A[1]) }), // Arjun misses
    ]);
    const st = serveStats('volleyball', s, { home: H.map((p) => p.id), away: A.map((p) => p.id) })!;
    assert.ok(st && st.consistent);
    assert.equal(st.match.home.srvPlayed, 2);
    assert.equal(st.match.home.srvWon, 1);
    assert.equal(st.match.away.srvPlayed, 2);
    assert.equal(st.match.away.dfs, 1);
    assert.equal(st.match.away.aces, 1);
    assert.equal(st.match.home.rcvWon, 1);
    assert.equal(st.match.players.h1.srvPlayed, 2);
    assert.equal(st.match.players.a2.srvPlayed, 2);
    const rows = serveRows(st, st.match).map((r) => r.key);
    assert.deepEqual(rows.slice(0, 5), ['tot', 'srv', 'rcv', 'aces', 'se']);
  });
});

describe('SD-71 — substitutions (FIVB 15.6 / 15.7)', () => {
  test('a sub swaps the player in the same position and counts toward 6', () => {
    let s = play([...setup, pt('home'), pt('home')]);
    s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: H[2], on: HB } });
    const t = trackCourt(s);
    assert.equal(t.court.home![2].id, 'h7');
    assert.equal(t.subsUsed.home, 1);
    assert.deepEqual(s.subs![0], { set: 1, at: 2, side: 'home', off: H[2], on: HB, kind: 'regular' });
  });
  test('a starter may come back only for his substitute, once (15.6.1); a substitute only once (15.6.2)', () => {
    let s = play([...setup, { type: 'SUB', side: 'home', payload: { off: H[2], on: HB } }]);
    // Dev back for Nikhil: legal
    assert.deepEqual(checkSub(s, 'home', HB, H[2]).issues, []);
    // Dev back for someone else: flagged
    assert.match(checkSub(s, 'home', H[3], H[2]).issues.join(' '), /only come back for Nikhil/);
    // Nikhil replaced by someone other than Dev: flagged
    assert.match(checkSub(s, 'home', HB, HB2).issues.join(' '), /only be replaced by Dev/);
    s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: HB, on: H[2] } });
    assert.equal(trackCourt(s).court.home![2].id, 'h3'); // back in his own position
    // Dev can't leave again this set; Nikhil can't come on again
    assert.match(checkSub(s, 'home', H[2], HB2).issues.join(' '), /already left/);
    assert.match(checkSub(s, 'home', H[0], HB).issues.join(' '), /already come on once/);
  });
  test('the 7th regular sub is over the limit → offered as exceptional (15.7), which does not count', () => {
    const bench = Array.from({ length: 7 }, (_, i) => P(`b${i}`, `Bench ${i}`));
    let s = play(setup);
    for (let i = 0; i < 6; i++) s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: H[i], on: bench[i] } });
    const c = checkSub(s, 'home', bench[0], bench[6]);
    assert.equal(c.overLimit, true);
    assert.equal(c.used, 6);
    s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: bench[0], on: bench[6], kind: 'exceptional' } });
    assert.equal(trackCourt(s).subsUsed.home, 6);
    // a new set resets the count
    s = [...pts('home', 25)].reduce(vb.reducer, s);
    assert.equal(trackCourt(s).subsUsed.home, 0);
  });
  test('libero replacements are not substitutions; front-row and back-to-back replacements are flagged (19.3)', () => {
    let s = play([...setup, pt('home')]);
    // Kiran is at V (back row): fine
    assert.deepEqual(checkSub(s, 'home', H[4], HL).issues, []);
    assert.equal(checkSub(s, 'home', H[4], HL).kind, 'libero');
    // Isha at IV (front row): flagged
    assert.match(checkSub(s, 'home', H[3], HL).issues.join(' '), /front-row/);
    s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: H[4], on: HL, kind: 'libero' } });
    assert.equal(trackCourt(s).subsUsed.home, 0);
    // libero out straight away: needs a completed rally; and only for Kiran
    assert.match(checkSub(s, 'home', HL, H[4]).issues.join(' '), /completed rally/);
    s = vb.reducer(s, pt('home'));
    assert.deepEqual(checkSub(s, 'home', HL, H[4]).issues, []);
    assert.match(checkSub(s, 'home', HL, HB).issues.join(' '), /only be replaced by Kiran/);
  });
  test('the libero cue: front row after rotation', () => {
    // libero in at VI (index 5); two home side-outs move it to IV
    let s = play([...setup, { type: 'SUB', side: 'home', payload: { off: H[5], on: HL, kind: 'libero' } }]);
    assert.equal(liberoCue(s, 'home'), null);
    s = [pt('away'), pt('home'), pt('away'), pt('home')].reduce(vb.reducer, s); // home rotates twice: VI → V → IV
    assert.match(liberoCue(s, 'home') ?? '', /front row \(IV\) — bring Meera back/);
  });
});

describe('SD-71 — sets played follow the court', () => {
  test('a sub who came on and a libero both played the set; the starter subbed off too', () => {
    let s = play([...setup, pt('home')]);
    s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: H[2], on: HB } });
    s = vb.reducer(s, { type: 'SUB', side: 'home', payload: { off: H[4], on: HL, kind: 'libero' } });
    s = [...pts('home', 24)].reduce(vb.reducer, s); // set 1 won 25-0
    s = vb.reducer(s, pt('away')); // set 2 under way (same rotation stamp → Dev back, Nikhil off)
    const t = volleyballTotals(s);
    assert.equal(t.h7.stats.setsPlayed, 1); // Nikhil: set 1 only
    assert.equal(t.h9.stats.setsPlayed, 1); // Lata: set 1 only
    assert.equal(t.h3.stats.setsPlayed, 2); // Dev: started both
    assert.equal(t.a1.stats.setsPlayed, 2);
  });
  test('a new set rotation with a different six moves sets played', () => {
    let s = play([...setup, ...pts('home', 25)]);
    s = vb.reducer(s, { type: 'SET_ROTATION', payload: { team: 'home', players: [HB, ...H.slice(1)] } });
    s = vb.reducer(s, pt('home'));
    const t = volleyballTotals(s);
    assert.equal(t.h1.stats.setsPlayed, 1);
    assert.equal(t.h7.stats.setsPlayed, 1);
    assert.equal(t.h2.stats.setsPlayed, 2);
  });
});
