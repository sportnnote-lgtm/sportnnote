/**
 * SD-21 — the point editor for the rally-engine sports (table tennis, squash,
 * pickleball rally + side-out) and padel. A correction is one EDIT_LOG with the
 * corrected rally list (each entry = who WON the rally) plus STAT_ADJUST deltas;
 * the engine replays the list, so score, games, server and side-outs re-derive.
 *
 * The core property: an edited match must equal the match as if it had been
 * scored that way from the start (same scoring state, server, scoreline and
 * timeline). Untouched logs keep their pinned fingerprints (racketLogs.mts /
 * replay-racket.test.mts) — EDIT_LOG of the unchanged list is a no-op.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import { makeRallyEngine, rallyInputs, rallyRows, rallyScoreLine, rallyServingSide, serveSpot, type RallyState } from '../src/sports/rallyEngine.ts';
import { ttServer } from '../src/sports/tabletennis/serve.ts';
import * as padel from '../src/sports/padel/engine.ts';
import { correctionActions, pointInputs, type PointInput } from '../src/sports/rallyEdit.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const P = (side: Side, playerName?: string): ScoreAction =>
  ({ type: 'POINT', side, attribution: playerName ? { playerId: `id-${playerName}`, stat: 'points', playerName } : undefined });

// The same engine options the plugins pass (src/sports/*/index.tsx).
const TT = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const SQUASH = makeRallyEngine({ icon: '⚫', sideOutValue: 'english', sideOutLabel: 'Hand-out', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
type Eng = typeof TT;
const play = (e: Eng, cfg: Record<string, unknown>, log: ScoreAction[]) => log.reduce(e.reducer, e.init(cfg));
const playPadel = (cfg: Record<string, unknown>, log: ScoreAction[]) => log.reduce(padel.reducer, padel.init(cfg));
const edit = <S,>(reducer: (s: S, a: ScoreAction) => S, s: S, pts: PointInput[]) => reducer(s, { type: 'EDIT_LOG', payload: { points: pts } });
/** The rally list as if scored that way live: one POINT per rally for its winner. */
const asLog = (pts: PointInput[]): ScoreAction[] => pts.map((p) => P(p.side, p.playerName));
const DERIVED: Array<keyof RallyState> = ['current', 'games', 'gamesWon', 'ended', 'serving', 'serverNo', 'srvStarter', 'opening'];
const view = (s: RallyState) => ({
  ...Object.fromEntries(DERIVED.map((k) => [k, s[k]])),
  line: rallyScoreLine(s),
  rows: s.events.map((e) => [e.stamp, e.label, e.detail, e.side, e.kind, e.wonBy, e.playerName]),
});
/** Edit ⇒ same as playing the corrected list from scratch. */
function assertEditEqualsReplay(e: Eng, cfg: Record<string, unknown>, s: RallyState, pts: PointInput[]) {
  const edited = edit(e.reducer, s, pts);
  assert.deepEqual(view(edited), view(play(e, cfg, asLog(pts))));
  return edited;
}
const flip = (pts: PointInput[], i: number): PointInput[] => pts.map((p, j) => (j === i ? { side: opp(p.side), kind: 'point' } : p));
const del = (pts: PointInput[], i: number) => pts.filter((_, j) => j !== i);
const ins = (pts: PointInput[], after: number, side: Side, playerName?: string) => {
  const n = [...pts];
  n.splice(after + 1, 0, { side, kind: 'point', playerName });
  return n;
};
const byName = (n?: string) => (n ? `id-${n}` : undefined);
const adjusts = (acts: ScoreAction[]) =>
  acts.filter((a) => a.type === 'STAT_ADJUST').map((a) => [a.attribution!.playerName, a.attribution!.stat, a.attribution!.by]).sort();

// ------------------------------------------------------------ table tennis --

describe('SD-21 table tennis (rally scoring, ITTF serve order)', () => {
  const CFG = { firstServe: 'away' };
  const full = play(TT, CFG, L.TT_LOG);

  test('EDIT_LOG of the unchanged list is a no-op (fingerprint pinned)', () => {
    const again = edit(TT.reducer, full, rallyInputs(full.events));
    assert.deepEqual(view(again), view(full));
    assert.equal(L.fingerprint(play(TT, {}, L.TT_LOG) as never, L.RALLY_KEYS), 'b7a2d20d7054');
    assert.equal(L.fingerprint(edit(TT.reducer, play(TT, {}, L.TT_LOG), rallyInputs(play(TT, {}, L.TT_LOG).events)) as never, L.RALLY_KEYS), 'b7a2d20d7054');
  });
  test('change a point’s winner mid-game → score, server and later games re-derive', () => {
    // Game 1 in progress at 5-3 (h,a,h,a,h,a,h,h). Flip rally 2 (home) to away → 4-4.
    const mid = play(TT, CFG, [P('home', 'Ana'), P('away', 'Bo'), P('home', 'Ana'), P('away', 'Bo'), P('home', 'Ana'), P('away', 'Bo'), P('home', 'Ana'), P('home', 'Ana')]);
    assert.deepEqual(mid.current, { home: 5, away: 3 });
    const pts = flip(rallyInputs(mid.events), 2);
    const e = assertEditEqualsReplay(TT, CFG, mid, pts);
    assert.deepEqual(e.current, { home: 4, away: 4 });
    assert.equal(ttServer(e.current.home, e.current.away, e.games.length, e.opening ?? 'home'), 'away'); // 8 points played → 5th pair → opener
    // whole match: flipping a game-1 rally cascades through every later game boundary
    assertEditEqualsReplay(TT, CFG, full, flip(rallyInputs(full.events), 17));
  });
  test('delete a point / insert a missed point', () => {
    const pts = rallyInputs(full.events);
    const d = assertEditEqualsReplay(TT, CFG, full, del(pts, 0));
    assert.notDeepEqual(d.games, full.games);
    assertEditEqualsReplay(TT, CFG, full, ins(pts, 40, 'away'));
    const mid = play(TT, CFG, L.rGame(4, 2));
    const i = assertEditEqualsReplay(TT, CFG, mid, ins(rallyInputs(mid.events), -1, 'away'));
    assert.deepEqual(i.current, { home: 4, away: 3 });
  });
  test('editing a finished match re-derives the SD-01 final scoreline', () => {
    // Last rally of game 4 (13-11) → away: 12-12, the match is no longer over.
    const pts = rallyInputs(full.events);
    const e = assertEditEqualsReplay(TT, CFG, full, flip(pts, pts.length - 1));
    assert.equal(e.ended, false);
    assert.equal(rallyScoreLine(e), '11-7, 9-11, 11-5');
    assert.deepEqual(e.current, { home: 12, away: 12 });
  });
  test('credits: flipping a credited point moves the credit; no change → no STAT_ADJUST', () => {
    const mid = play(TT, CFG, [P('home', 'Ana'), P('away', 'Bo'), P('home', 'Ana')]);
    const old = pointInputs(mid.events);
    assert.deepEqual(adjusts(correctionActions(old, old, byName)), []);
    const moved = old.map((p, i) => (i === 0 ? { side: 'away' as Side, kind: 'point' as const, playerName: 'Bo' } : p));
    const acts = correctionActions(old, moved, byName);
    assert.equal(acts[0].type, 'EDIT_LOG');
    assert.deepEqual(adjusts(acts), [['Ana', 'points', -1], ['Bo', 'points', 1]]);
    assert.deepEqual(adjusts(correctionActions(old, del(old, 1), byName)), [['Bo', 'points', -1]]);
  });
  test('undo: dropping the EDIT_LOG (+ its STAT_ADJUSTs) restores the original match', () => {
    const base = L.TT_LOG.slice(0, 30);
    const s0 = play(TT, CFG, base);
    const acts = correctionActions(rallyInputs(s0.events), del(rallyInputs(s0.events), 3), byName);
    const edited = [...base, ...acts].reduce(TT.reducer, TT.init(CFG));
    assert.notDeepEqual(view(edited), view(s0));
    assert.deepEqual(view(base.reduce(TT.reducer, TT.init(CFG))), view(s0));
    // and STAT_ADJUST alone never moves the score
    assert.deepEqual(TT.reducer(s0, { type: 'STAT_ADJUST', attribution: { playerId: 'x', stat: 'points', by: -1 } }), s0);
  });
});

// ------------------------------------------------------------------ squash --

/** Side-out SINGLES turns (as replay-racket.test.mts): points per hand-in, then a hand-out. */
function singlesTurns(first: Side, pts: number[]): ScoreAction[] {
  const out: ScoreAction[] = [];
  let srv = first;
  pts.forEach((n, i) => {
    for (let k = 0; k < n; k++) out.push(P(srv));
    if (i < pts.length - 1) out.push(P(opp(srv)));
    srv = opp(srv);
  });
  return out;
}

describe('SD-21 squash', () => {
  test('PAR: edit / delete / insert re-derive; untouched log keeps its fingerprint', () => {
    const CFG = { scoring: 'par' };
    const s = play(SQUASH, CFG, L.SQUASH_LOG);
    assert.equal(L.fingerprint(edit(SQUASH.reducer, s, rallyInputs(s.events)) as never, L.RALLY_KEYS), '1455ac3c99a7');
    const pts = rallyInputs(s.events);
    assertEditEqualsReplay(SQUASH, CFG, s, flip(pts, 5));
    assertEditEqualsReplay(SQUASH, CFG, s, del(pts, 20));
    assertEditEqualsReplay(SQUASH, CFG, s, ins(pts, 20, 'home'));
    const mid = play(SQUASH, CFG, L.rGame(3, 2)); // h,a,h,a,h → home served last
    const e = assertEditEqualsReplay(SQUASH, CFG, mid, flip(rallyInputs(mid.events), 4));
    assert.equal(rallyServingSide(e), 'away'); // the rally winner serves
  });

  // British Open 1993 final (English, hand-out to 9) — the replay-racket log.
  const T = [
    { first: 'home' as Side, pts: [2, 1, 0, 3, 3, 2, 4] },
    { first: 'home' as Side, pts: [1, 2, 3, 0, 2, 3, 3] },
    { first: 'home' as Side, pts: [2, 0, 1, 4, 3, 2, 0, 3] },
    { first: 'away' as Side, pts: [1, 4, 1, 5] },
  ];
  const LOG = T.flatMap((g) => singlesTurns(g.first, g.pts));
  const CFG = { scoring: 'english', pointsPerGame: 9, winBy: 1, gamesToWin: 3 };
  const s = play(SQUASH, CFG, LOG);

  test('English: hand-outs are editable rallies; unchanged list keeps the pinned fingerprint', () => {
    const rows = rallyRows(s.events);
    assert.equal(rows.length, LOG.length); // every rally, scoring or not
    assert.equal(rows.filter((r) => r.p.kind === 'rally').length, s.events.filter((e) => e.label === 'Hand-out').length);
    assert.deepEqual(rallyInputs(s.events).map((p) => p.side), LOG.map((a) => a.side));
    assert.equal(L.fingerprint(edit(SQUASH.reducer, s, rallyInputs(s.events)) as never, L.RALLY_KEYS), 'df14b53aafd6');
  });
  test('English: flip a hand-out into a point and a point into a hand-out', () => {
    // H2 → hand-out (rally 2, away won) → A1 …
    const opening = play(SQUASH, CFG, [P('home'), P('home'), P('away'), P('away')]);
    assert.deepEqual([opening.current, opening.serving], [{ home: 2, away: 1 }, 'away']);
    const pts = rallyInputs(opening.events);
    assert.equal(pts[2].kind, 'rally');
    const a = assertEditEqualsReplay(SQUASH, CFG, opening, flip(pts, 2)); // home wins rally 2 → 3-0, then away's rally is a hand-out
    assert.deepEqual([a.current, a.serving], [{ home: 3, away: 0 }, 'away']);
    const b = assertEditEqualsReplay(SQUASH, CFG, opening, flip(pts, 1)); // rally 1 → hand-out at 1-0; away then wins 2 on serve
    assert.deepEqual([b.current, b.serving], [{ home: 1, away: 2 }, 'away']);
    assert.deepEqual(rallyInputs(b.events).map((p) => p.kind), ['point', 'rally', 'point', 'point']);
    // whole match
    assertEditEqualsReplay(SQUASH, CFG, s, flip(rallyInputs(s.events), 30));
    assertEditEqualsReplay(SQUASH, CFG, s, del(rallyInputs(s.events), 9));
    assertEditEqualsReplay(SQUASH, CFG, s, ins(rallyInputs(s.events), 9, 'away'));
  });
});

// -------------------------------------------------------------- pickleball --

/** Side-out DOUBLES turns (as replay-racket.test.mts). */
function doublesTurns(first: Side, turns: number[][]): ScoreAction[] {
  const out: ScoreAction[] = [];
  let srv = first;
  turns.forEach((t, i) => {
    t.forEach((n, j) => {
      for (let k = 0; k < n; k++) out.push(P(srv));
      if (!(i === turns.length - 1 && j === t.length - 1)) out.push(P(opp(srv)));
    });
    srv = opp(srv);
  });
  return out;
}

describe('SD-21 pickleball', () => {
  test('rally scoring: edit / delete / insert; fingerprint of the untouched log', () => {
    const CFG = {};
    const s = play(PICKLE, CFG, L.PICKLEBALL_RALLY_LOG);
    assert.equal(L.fingerprint(edit(PICKLE.reducer, s, rallyInputs(s.events)) as never, L.RALLY_KEYS), '6da6172329ae');
    const pts = rallyInputs(s.events);
    assertEditEqualsReplay(PICKLE, CFG, s, flip(pts, 3));
    assertEditEqualsReplay(PICKLE, CFG, s, del(pts, 0));
    assertEditEqualsReplay(PICKLE, CFG, s, ins(pts, 10, 'away'));
  });

  // PPA LA Open 2024 men's doubles gold (side-out, bo5) — the replay-racket log.
  const G: Array<{ first: Side; turns: number[][] }> = [
    { first: 'home', turns: [[1], [2, 0], [0, 2], [3, 1], [2, 0], [0, 2], [1, 1], [2, 1]] },
    { first: 'away', turns: [[2], [1, 2], [0, 3], [3, 0], [1, 1], [0, 2], [2, 0], [1, 2]] },
    { first: 'home', turns: [[3], [1, 2], [0, 1], [2, 0], [2, 2], [1, 1], [0, 1], [2, 0], [1, 1]] },
    { first: 'home', turns: [[2], [3, 0], [1, 2], [0, 2], [2, 0], [2, 2], [0, 1], [1, 1]] },
    { first: 'away', turns: [[1], [2, 1], [0, 2], [3, 0], [1, 0], [2, 2], [2, 0], [1]] },
  ];
  const LOG = G.flatMap((g) => doublesTurns(g.first, g.turns));
  const CFG = { scoring: 'sideout', playersPerSide: 2, pointsPerGame: 11, winBy: 2, gamesToWin: 3 };
  const s = play(PICKLE, CFG, LOG);

  test('side-out doubles: every rally is a row; unchanged list keeps the pinned fingerprint', () => {
    assert.deepEqual(rallyInputs(s.events).map((p) => p.side), LOG.map((a) => a.side));
    assert.equal(L.fingerprint(edit(PICKLE.reducer, s, rallyInputs(s.events)) as never, L.RALLY_KEYS), 'b72315edd00d');
    // final-score.test.mts pins this one with its own engine options ('•', 'Side out').
    const FS = makeRallyEngine({ icon: '•', sideOutValue: 'sideout', sideOutLabel: 'Side out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });
    const so = play(FS, { scoring: 'sideout' }, L.PICKLEBALL_SIDEOUT_LOG);
    assert.equal(L.fingerprint(edit(FS.reducer, so, rallyInputs(so.events)) as never, L.RALLY_KEYS), '708ab706e90d');
  });
  test('flip a side-out into a point: the server keeps serving, the call re-derives', () => {
    // 0-0-2: home scores 3, then away wins a rally → side-out (A1), away scores 1.
    const m = play(PICKLE, CFG, [P('home', 'Ben'), P('home', 'Ben'), P('home', 'Ben'), P('away'), P('away', 'Tyson')]);
    assert.equal(serveSpot(m).call, '1-3-1');
    const pts = rallyInputs(m.events);
    assert.deepEqual(pts.map((p) => p.kind), ['point', 'point', 'point', 'rally', 'point']);
    const e = assertEditEqualsReplay(PICKLE, CFG, m, flip(pts, 3)); // home wins rally 4 → 4-0; away's rally is now the side-out
    assert.deepEqual([e.current, e.serving, e.serverNo], [{ home: 4, away: 0 }, 'away', 1]);
    assert.equal(serveSpot(e).call, '0-4-1');
  });
  test('flip a point into a side-out: later rallies re-derive (2nd server, side-outs)', () => {
    const m = play(PICKLE, CFG, [P('home', 'Ben'), P('home', 'Ben'), P('away'), P('away', 'Tyson'), P('home')]);
    // H2 1,2 → side-out → A1 1 → 2nd server (A2) at 1-2.
    assert.deepEqual([m.current, m.serving, m.serverNo], [{ home: 2, away: 1 }, 'away', 2]);
    const e = assertEditEqualsReplay(PICKLE, CFG, m, flip(rallyInputs(m.events), 1));
    // home 1 → away wins rally 2 = side-out (A1); rally 3 away = 1; rally 4 away = 2; rally 5 home → A2.
    assert.deepEqual([e.current, e.serving, e.serverNo], [{ home: 1, away: 2 }, 'away', 2]);
    assert.deepEqual(rallyInputs(e.events).map((p) => p.kind), ['point', 'rally', 'point', 'point', 'rally']);
  });
  test('whole match: change / delete / insert anywhere = scored that way live', () => {
    const pts = rallyInputs(s.events);
    for (const i of [0, 7, 40, 120, pts.length - 1]) assertEditEqualsReplay(PICKLE, CFG, s, flip(pts, i));
    for (const i of [1, 55, 150]) assertEditEqualsReplay(PICKLE, CFG, s, del(pts, i));
    for (const i of [-1, 33, 99]) assertEditEqualsReplay(PICKLE, CFG, s, ins(pts, i, 'away'));
    const end = assertEditEqualsReplay(PICKLE, CFG, s, del(pts, pts.length - 1));
    assert.equal(end.ended, false);
    assert.equal(rallyScoreLine(end), '7-11, 11-9, 11-9, 8-11');
  });
  test('legacy log (no kind / wonBy on 🔁 events) infers the same rallies', () => {
    const strip = (es: LiveEvent[]) => es.map(({ kind, wonBy, game, ...e }) => (e.icon === '🔁' ? e : { ...e, kind, wonBy, game }) as LiveEvent);
    const legacy = strip(s.events);
    assert.ok(legacy.every((e) => e.icon !== '🔁' || (!e.kind && !e.wonBy)));
    assert.deepEqual(rallyInputs(legacy), rallyInputs(s.events));
    assert.deepEqual(rallyRows(legacy).map((r) => r.e.game), rallyRows(s.events).map((r) => r.e.game));
    // the legacy 2nd-server event's `side` is the serving (losing) team
    const second = legacy.find((e) => e.label === '2nd server')!;
    const row = rallyRows(legacy).find((r) => r.e.id === second.id)!;
    assert.equal(row.p.side, opp(second.side!));
    assert.deepEqual(view(edit(PICKLE.reducer, { ...s, events: legacy }, rallyInputs(legacy))), view(s));
  });
  test('credits: normalize to the replay — a point that becomes a side-out loses its credit, no double count', () => {
    const m = play(PICKLE, CFG, [P('home', 'Ben'), P('home', 'Ben'), P('away'), P('away', 'Tyson'), P('away', 'Tyson')]);
    const old = rallyInputs(m.events);
    const normalize = (pts: PointInput[]) => rallyInputs(edit(PICKLE.reducer, m, pts).events);
    // Rally 2 → away: a side-out at 1-0 (Ben's 2nd point is gone). Away then serves
    // and scores rallies 3-5 (rally 3 had no player, so it's a team point).
    const flipped = flip(old, 1);
    const acts = correctionActions(old, flipped, byName, undefined, normalize);
    const replay = edit(PICKLE.reducer, m, acts[0].payload!.points as PointInput[]);
    assert.deepEqual(view(replay), view(play(PICKLE, CFG, asLog(flipped))));
    assert.deepEqual(adjusts(acts), [['Ben', 'points', -1]]);
    // A credited insert while the receiver is serving becomes a side-out → no credit.
    const ins1 = ins(old, 4, 'home', 'Ben'); // away serving at 2-2 → home wins = side-out
    const acts2 = correctionActions(old, ins1, byName, undefined, normalize);
    assert.deepEqual(adjusts(acts2), []);
    assert.equal((acts2[0].payload!.points as PointInput[])[5].kind, 'rally');
    // …and the same insert without normalize WOULD have credited Ben (the bug normalize prevents).
    assert.deepEqual(adjusts(correctionActions(old, ins1, byName)), [['Ben', 'points', 1]]);
    // Flip the side-out into a point and name the server → Ben credited once; home
    // keeps serving, so Tyson's next rally is now the side-out and his point is gone.
    const so = old.map((p, i) => (i === 2 ? { side: 'home' as Side, kind: 'point' as const, playerName: 'Ben' } : p));
    assert.deepEqual(adjusts(correctionActions(old, so, byName, undefined, normalize)), [['Ben', 'points', 1], ['Tyson', 'points', -1]]);
  });
});

// ------------------------------------------------------------------- padel --

/** Games from a string: H/A = a love game; h/a = a golden-point game. */
function padelGames(seq: string): ScoreAction[] {
  return [...seq].flatMap((c) => {
    const w: Side = c.toLowerCase() === 'h' ? 'home' : 'away';
    if (c === c.toUpperCase()) return L.tGame(w);
    return [P('home'), P('away'), P('home'), P('away'), P('home'), P('away'), P(w)];
  });
}
const padelView = (s: padel.PadelState) => ({
  pts: s.pts, games: s.games, sets: s.sets, setsWon: s.setsWon, tb: s.tb, ended: s.ended, firstServer: s.firstServer,
  serve: padel.serveInfo(s), line: padel.scoreLine(s), summary: padel.summary(s),
  rows: s.events.map((e) => [e.stamp, e.label, e.detail, e.side, e.kind, e.playerName]),
});

describe('SD-21 padel', () => {
  // Valencia P1 2026 final (replay-racket.test.mts): 6-7(4), 6-1, 7-6(5).
  const SET1 = 'HAHAhAHaHAHA';
  const TB1 = [P('home'), ...Array(5).fill(P('away')), P('home'), P('home'), P('home'), P('away'), P('away')];
  const SET2 = 'HHAHHHH';
  const SET3 = 'HAAHAAA' + 'HHh' + 'A' + 'H';
  const TB3 = [P('home'), ...Array(5).fill(P('away')), ...Array(6).fill(P('home'))];
  const LOG = [...padelGames(SET1), ...TB1, ...padelGames(SET2), ...padelGames(SET3), ...TB3];
  const CFG = { deuce: 'golden', gamesPerSet: 6, setsToWin: 2, decider: 'set', playersPerSide: 2, firstServer: 'away' };
  const s = playPadel(CFG, LOG);
  const editP = (pts: PointInput[]) => {
    const e = edit(padel.reducer, s, pts);
    assert.deepEqual(padelView(e), padelView(playPadel(CFG, asLog(pts))));
    return e;
  };

  test('unchanged list: no-op; the pinned fingerprint holds', () => {
    assert.deepEqual(padelView(edit(padel.reducer, s, pointInputs(s.events))), padelView(s));
    const pinned = playPadel({ ...CFG, firstServer: undefined }, LOG);
    assert.equal(L.fingerprint(edit(padel.reducer, pinned, pointInputs(pinned.events)) as never, L.TENNIS_KEYS), '3e04742b8a3f');
  });
  test('change a point’s winner, delete one, insert a missed one', () => {
    const pts = pointInputs(s.events);
    const f = editP(flip(pts, 2)); // 15-0 → 0-15 in game 1: set 1 changes from there on
    assert.notDeepEqual(f.sets, s.sets);
    editP(del(pts, 30));
    editP(ins(pts, 30, 'away'));
    // whole last rally flipped: the final tiebreak is back on, the match reopens
    const last = editP(flip(pts, pts.length - 1));
    assert.equal(last.ended, false);
    assert.equal(padel.scoreLine(last), '6-7(4), 6-1');
  });
  test('tiebreak edit keeps the SD-103 doubles serving rotation', () => {
    const pts = pointInputs(s.events);
    const tbStart = padelGames(SET1).length;
    // Flip the 3rd tiebreak point of set 1, then walk the breaker: each prefix's
    // server (side + slot) must equal the same prefix scored live.
    const edited = flip(pts, tbStart + 2);
    const e = editP(edited);
    for (let n = tbStart; n <= tbStart + TB1.length; n++) {
      const a = edit(padel.reducer, s, edited.slice(0, n));
      const b = playPadel(CFG, asLog(edited.slice(0, n)));
      assert.deepEqual(padel.serveInfo(a), padel.serveInfo(b));
    }
    // The breaker opener (away served first, so set-1 game 13 opener = away) then pairs: h,h,a,a,…
    const slots = Array.from({ length: 6 }, (_, i) => padel.serveInfo(edit(padel.reducer, s, edited.slice(0, tbStart + i))));
    assert.deepEqual(slots.map((x) => `${x.side[0]}${x.slot}`), ['a0', 'h0', 'h0', 'a1', 'a1', 'h1']);
    assert.equal(e.tb?.[0] != null, true);
  });
  test('match tiebreak decider: edit inside it re-derives the bracketed scoreline', () => {
    const C = { deuce: 'golden', gamesPerSet: 4, setsToWin: 2, decider: 'match10', playersPerSide: 2 };
    const log = [...L.tSet(4, 1), ...L.tSet(2, 4), ...Array(7).fill(P('home')), ...Array(5).fill(P('away')), ...Array(3).fill(P('home'))];
    const m = playPadel(C, log);
    assert.equal(padel.scoreLine(m), '4-1, 2-4, [10-5]');
    const pts = pointInputs(m.events);
    const e = edit(padel.reducer, m, flip(pts, pts.length - 3)); // a home MTB point (10-5 → 9-6) → away
    assert.deepEqual(padelView(e), padelView(playPadel(C, asLog(flip(pts, pts.length - 3)))));
    assert.equal(e.ended, false);
    assert.deepEqual(e.pts, { home: 9, away: 6 });
  });
  test('credits reconcile per player', () => {
    const m = playPadel(CFG, [P('home', 'Ale'), P('home', 'Ale'), P('away', 'Fede')]);
    const old = pointInputs(m.events);
    assert.deepEqual(adjusts(correctionActions(old, del(old, 0), byName)), [['Ale', 'points', -1]]);
    assert.deepEqual(adjusts(correctionActions(old, ins(old, 2, 'away', 'Fede'), byName)), [['Fede', 'points', 1]]);
  });
});
