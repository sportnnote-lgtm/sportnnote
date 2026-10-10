/**
 * SD-117c — carrom breaker / board editor / Queen chip, chess forfeits /
 * methods / clocks, golf certification / putts / conceded line, and the
 * racket "change ends" cues, TT serve hint, pickleball rally call and padel
 * one-tap Ace / Double fault. Old logs replay unchanged (Decision 8).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import { carromStatTotals } from '../src/sports/carrom/totals.ts';
import * as chess from '../src/sports/chess/engine.ts';
import { cardSigned, clampPutts, concededLine, MAX_HOLE_STROKES } from '../src/sports/golf/engine.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import { makeRallyEngine, rallyInputs, rallySummary } from '../src/sports/rallyEngine.ts';
import { cueMarkers, tableTennisCue } from '../src/sports/courtCues.ts';
import { ttServeHint, ttServeTurn } from '../src/sports/tabletennis/serve.ts';
import { pointInputs } from '../src/sports/rallyEdit.ts';
import { detailTracked } from '../src/sports/pointDetail.ts';

type Side = 'home' | 'away';
const P = (side: Side): ScoreAction => ({ type: 'POINT', side });
const game = (side: Side): ScoreAction[] => [P(side), P(side), P(side), P(side)];
const TT = makeRallyEngine({ icon: '🏓', sideOutValue: '__none__', sideOutLabel: 'Service', defaults: { playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 } });
const PICKLE = makeRallyEngine({ icon: '🥒', sideOutValue: 'sideout', sideOutLabel: 'Side-out', defaults: { playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 } });

// ------------------------------------------------------------- carrom --

const B = (side: Side, coins: number, extra: Record<string, unknown> = {}, id?: string): ScoreAction => ({
  type: 'BOARD', side, payload: { coins, queen: extra.queenBy === 'winner', ...extra },
  ...(id ? { attribution: { playerId: id, playerName: id.toUpperCase(), stat: 'points', by: 0 } } : {}),
});
const playC = (log: ScoreAction[]) => log.reduce(carrom.reducer as never, carrom.init()) as carrom.CarromState;

describe('SD-117c · carrom breaker, Queen chip and board editor', () => {
  test('the toss: the break alternates by board, and each game opens with the other side', () => {
    let s = carrom.reducer(carrom.init(), { type: 'FIRST_BREAK', payload: { side: 'away' } });
    assert.equal(carrom.nextBreaker(s), 'away');
    s = carrom.reducer(s, B('home', 9));
    assert.equal(carrom.nextBreaker(s), 'home');
    assert.equal(carrom.breakerAt(s, 2, 0), 'home'); // game 2 opens with the other side
    assert.equal(carrom.breakerAt(s, 3, 1), 'home');
    assert.deepEqual(carrom.boardBreakers(s), ['away']);
    assert.equal(carrom.slamFor('away', 'away'), 'white');
    assert.equal(carrom.slamFor('home', 'away'), 'black');
    assert.equal(carrom.slamFor('home', null), null);
    assert.equal(carrom.nextBreaker(carrom.init()), null);
  });

  test('legacy boards replay to the pinned fingerprint; FIRST_BREAK never changes the score', () => {
    const log = L.CARROM_BOARDS.map(([w, c, q]) => ({ type: 'BOARD', side: w, payload: { coins: c, queen: q } }) as ScoreAction);
    const plain = playC(log);
    const tossed = playC([{ type: 'FIRST_BREAK', payload: { side: 'home' } }, ...log]);
    assert.equal(L.fingerprint(plain as never, L.CARROM_KEYS), L.fingerprint(tossed as never, L.CARROM_KEYS));
    assert.equal(plain.boardBy, undefined);
  });

  test('Queen covered by the loser scores nothing; lostQueens is keyed', () => {
    const s = playC([B('home', 3, { queenBy: 'loser' }), B('away', 2, { queenBy: 'winner' })]);
    assert.deepEqual(s.current, { home: 3, away: 5 });
    assert.equal(s.boards[0].queen, false);
    assert.equal(s.boards[0].queenBy, 'loser');
    const t = carromStatTotals(s, { players: { home: [{ id: 'h1', name: 'H1' }], away: [{ id: 'a1', name: 'A1' }] } } as never);
    assert.equal(t.a1.stats.lostQueens, 1); // away covered the Queen on board 1 and lost it
    assert.equal(t.h1.stats.lostQueens, 0);
    assert.equal(t.a1.stats.queens, 1);
    assert.equal(t.h1.stats.boardBreaks, undefined); // no toss → not tracked
    const old = carromStatTotals(playC([B('home', 3)]), { players: { home: [{ id: 'h1', name: 'H1' }], away: [{ id: 'a1', name: 'A1' }] } } as never);
    assert.equal('lostQueens' in old.h1.stats, false);
  });

  test('boardBreaks / boardBreaksWon once the toss is recorded', () => {
    const s = playC([{ type: 'FIRST_BREAK', payload: { side: 'home' } }, B('home', 4), B('home', 2), B('away', 1)]);
    const t = carromStatTotals(s, { players: { home: [{ id: 'h1', name: 'H1' }], away: [{ id: 'a1', name: 'A1' }] } } as never);
    assert.equal(t.h1.stats.boardBreaks, 2); // boards 1 and 3
    assert.equal(t.h1.stats.boardBreaksWon, 1);
    assert.equal(t.a1.stats.boardBreaks, 1);
    assert.equal(t.a1.stats.boardBreaksWon, 0);
  });

  test('EDIT_LOG: the unchanged list is a no-op; removing / editing a board re-derives games and credits', () => {
    const log = [B('home', 9, { queenBy: 'winner' }, 'h1'), B('away', 9, {}, 'a1'), B('home', 9, {}, 'h1'), B('home', 4, {}, 'h1')];
    const s = playC(log);
    assert.equal(s.games.length, 1); // 12 + 9 + 4 = 25
    const same = carrom.reducer(s, { type: 'EDIT_LOG', payload: { boards: carrom.boardInputs(s) } });
    assert.equal(L.fingerprint(same as never, L.CARROM_KEYS), L.fingerprint(s as never, L.CARROM_KEYS));
    // remove board 3: home 12 + 4 = 16, the game is open again
    const edited = carrom.boardInputs(s).filter((_, i) => i !== 2);
    const acts = carrom.boardCorrection(s, edited);
    assert.equal(acts[0].type, 'EDIT_LOG');
    const next = acts.reduce((st, a) => carrom.reducer(st, a as never), s);
    assert.equal(next.games.length, 0);
    assert.deepEqual(next.current, { home: 16, away: 9 });
    // the STAT_ADJUSTs move h1's live line by exactly the board taken off
    const pts = acts.filter((a) => a.type === 'STAT_ADJUST' && a.attribution?.playerId === 'h1' && a.attribution.stat === 'points');
    assert.deepEqual(pts.map((a) => a.attribution!.by), [-9]);
    const t = carromStatTotals(next, undefined);
    assert.equal(t.h1.stats.points, 16);
    assert.equal(t.h1.stats.boards, 2);
  });
});

// -------------------------------------------------------------- chess --

describe('SD-117c · chess', () => {
  test('new FIDE methods: illegal move is decisive; timeout vs insufficient, 5-fold, 75-move are draws', () => {
    const r = (winner: string, method: string) => chess.reducer(chess.init(), { type: 'RESULT', payload: { winner, method } });
    assert.equal(r('home', 'illegal-move').ended, true);
    assert.equal(r('draw', 'illegal-move').ended, false);
    for (const m of ['time-insufficient', 'fivefold', 'seventy-five-move']) {
      assert.equal(r('draw', m).ended, true, m);
      assert.equal(r('home', m).ended, false, m);
    }
    assert.equal(chess.resultSentence('home', 'away', 'Anand', 'Carlsen', 'illegal-move'), '0-1: Carlsen beat Anand (illegal move)');
    assert.equal(chess.isForfeit('forfeit'), true);
  });

  test('clock times left: optional, parsed, and old results carry none', () => {
    assert.equal(chess.parseClock('4:07'), 247);
    assert.equal(chess.parseClock('1:05:30'), 3930);
    assert.equal(chess.parseClock('12'), 720);
    assert.equal(chess.parseClock('4:75'), null);
    assert.equal(chess.parseClock(''), null);
    assert.equal(chess.clockText(3930), '1:05:30');
    assert.equal(chess.clockText(42), '0:42');
    const s = chess.reducer(chess.init(), { type: 'RESULT', payload: { winner: 'home', method: 'time', clock: { white: 12, black: 0 } } });
    assert.deepEqual(s.clock, { white: 12, black: 0 });
    const old = chess.reducer(chess.init(), { type: 'RESULT', payload: { winner: 'home', method: 'time' } });
    assert.equal('clock' in old, false);
  });
});

// --------------------------------------------------------------- golf --

describe('SD-117c · golf', () => {
  test('certification, putts and the stroke cap', () => {
    assert.equal(cardSigned({ signed: { marker: true } }), false);
    assert.equal(cardSigned({ signed: { marker: true, player: true } }), true);
    assert.equal(cardSigned({}), false);
    assert.equal(clampPutts(5, 4), 4);
    assert.equal(clampPutts(6, 7), 6);
    assert.equal(clampPutts(2, 'P'), 2);
    assert.equal(clampPutts(null, 4), null);
    assert.equal(MAX_HOLE_STROKES, 20);
  });
  test('a conceded match keeps the hole state', () => {
    const holes = ['away', 'away', 'halved', 'away', 'home'] as const;
    assert.equal(concededLine([...holes], 'home'), 'conceded, 2 down thru 5');
    assert.equal(concededLine([...holes], 'away'), 'conceded, 2 up thru 5');
    assert.equal(concededLine(['home', 'away'], 'home'), 'conceded, all square thru 2');
    assert.equal(concededLine([], 'away'), 'conceded before hole 1');
  });
});

// ------------------------------------------------------- racket cues --

describe('SD-117c · change-ends cues (derived)', () => {
  const t0 = () => tennis.reducer(tennis.init(), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
  test('tennis: after odd games (counted through the match), none after even ones', () => {
    let s = [...game('home')].reduce(tennis.reducer, t0());
    assert.match(tennis.tennisCue(s)!.text, /Change ends · no rest/);
    s = [...game('away')].reduce(tennis.reducer, s);
    assert.equal(tennis.tennisCue(s), null);
    s = [...game('home')].reduce(tennis.reducer, s);
    assert.match(tennis.tennisCue(s)!.text, /90 s/);
    P('home'); // mid-game: nothing
    assert.equal(tennis.tennisCue(tennis.reducer(s, P('home'))), null);
    // a 6-3 set (9 games) → change at the set break; then none after game 1 of set 2
    let t = [...L.tSet(6, 3)].reduce(tennis.reducer, t0());
    assert.match(tennis.tennisCue(t)!.text, /set break/);
    t = game('away').reduce(tennis.reducer, t);
    assert.equal(tennis.tennisCue(t), null);
    // a 6-4 set (10 games) → set break without a change; change after game 1
    let u = [...L.tSet(6, 4)].reduce(tennis.reducer, t0());
    assert.equal(tennis.tennisCue(u)!.kind, 'interval');
    u = game('home').reduce(tennis.reducer, u);
    assert.equal(tennis.tennisCue(u)!.kind, 'ends');
  });

  test('tennis tiebreak: every 6 points, and the banner says what it is played to', () => {
    let s = L.tTiebreakSet(6, []).reduce(tennis.reducer, t0());
    assert.equal(tennis.inTiebreak(s), true);
    assert.match(tennis.tiebreakBanner(s)!, /^Tiebreak to 7, win by 2/);
    for (let i = 0; i < 5; i++) s = tennis.reducer(s, P(i % 2 ? 'home' : 'away'));
    assert.equal(tennis.tennisCue(s), null);
    s = tennis.reducer(s, P('home'));
    assert.match(tennis.tennisCue(s)!.text, /every 6 points/);
    const gs = L.tTiebreakSet(6, []).reduce(tennis.reducer, tennis.reducer(tennis.init({ finalSetTBAt: 6, setsToWin: 3 }), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } }));
    assert.match(tennis.tiebreakBanner(gs)!, /\(10 in the deciding set\)/);
    const f4 = tennis.init({ gamesPerSet: 4, setWinByTwo: false, tiebreakAt: 3, tiebreakPoints: 5, noAd: true, tbSuddenDeathAt: 4 });
    const f4s = L.tTiebreakSet(3, []).reduce(tennis.reducer, f4);
    assert.match(tennis.tiebreakBanner(f4s)!, /Tiebreak to 5, sudden death at 4-4/);
    const mtb = tennis.init({ setsToWin: 1, finalSetTiebreak: 10 });
    assert.match(tennis.tiebreakBanner(mtb)!, /^Match tiebreak to 10/);
  });

  test('timeline markers sit after the right point and never touch the score', () => {
    const s = [...game('home'), ...game('away'), ...game('home')].reduce(tennis.reducer, t0());
    const cleared = tennis.reducer(s, { type: 'EDIT_LOG', payload: { points: [] } });
    const m = cueMarkers(tennis.reducer, cleared, pointInputs(s.events), tennis.tennisCue, s.events);
    assert.equal(m.length, 2); // after games 1 and 3
    const g1 = s.events.find((e) => e.label === 'Game home')!;
    assert.equal(m[0].id, g1.id + 0.5);
    assert.equal(m[0].kind, undefined); // not an editable point
  });

  test('padel: same rule as tennis', () => {
    const s = game('home').reduce(padel.reducer, padel.reducer(padel.init(), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } }));
    assert.equal(padel.padelCue(s)!.kind, 'ends');
  });

  test('badminton: interval at 11, change of ends at 11 only in the decider, 120 s between games', () => {
    const pts = (h: number, a: number, s = badminton.init()) => {
      for (let i = 0; i < Math.max(h, a); i++) { if (i < h) s = badminton.reducer(s, P('home')); if (i < a) s = badminton.reducer(s, P('away')); }
      return s;
    };
    let s = pts(10, 8);
    assert.equal(badminton.badmintonCue(s), null);
    s = badminton.reducer(s, P('home'));
    assert.equal(badminton.badmintonCue(s)!.kind, 'interval');
    s = badminton.reducer(s, P('away'));
    assert.equal(badminton.badmintonCue(s), null); // 11-9: already passed
    const g = L.BADMINTON_LOG.slice(0, 39).reduce(badminton.reducer, badminton.init()); // game 1 done (21-18)
    assert.equal(g.games.length, 1);
    assert.match(badminton.badmintonCue(g)!.text, /120 s/);
    // the deciding game: change ends at 11
    const two = L.BADMINTON_LOG.slice(0, 79).reduce(badminton.reducer, badminton.init());
    assert.equal(two.games.length, 2);
    const dec = pts(11, 3, two);
    assert.match(badminton.badmintonCue(dec)!.text, /Change ends · interval at 11 in the deciding game/);
  });

  test('table tennis: ends after each game, at 5 in the deciding game; the serve hint', () => {
    const three = L.TT_LOG.slice(0, 18 + 20 + 16).reduce(TT.reducer, TT.init()); // 11-7, 9-11, 11-5
    assert.equal(three.games.length, 3);
    assert.match(tableTennisCue(three)!.text, /between games/);
    // a fresh decider: best of 3 at 1-1
    const bo3 = { pointsPerGame: 11, gamesToWin: 2 };
    let s = [...Array(11).fill(P('home')), ...Array(11).fill(P('away'))].reduce(TT.reducer, TT.init(bo3));
    assert.equal(s.games.length, 2);
    for (let i = 0; i < 4; i++) s = TT.reducer(s, P('home'));
    assert.equal(tableTennisCue(s), null);
    s = TT.reducer(s, P('home'));
    assert.match(tableTennisCue(s)!.text, /5 in the deciding game/);
    assert.equal(ttServeHint(0, 0), '1st serve of 2');
    assert.equal(ttServeHint(1, 0), '2nd serve of 2 · service changes after this point');
    assert.equal(ttServeHint(10, 10), 'Deuce at 10-10: service now alternates every point');
    assert.equal(ttServeHint(11, 10), 'Deuce: service alternates every point');
    assert.deepEqual(ttServeTurn(3, 3, 21), { n: 2, of: 5, deuce: false });
    // markers are display only: replaying the pinned log is unchanged
    const full = L.TT_LOG.reduce(TT.reducer, TT.init());
    assert.equal(L.fingerprint(full as never, L.RALLY_KEYS), 'b7a2d20d7054');
    const m = cueMarkers(TT.reducer, TT.reducer(full, { type: 'EDIT_LOG', payload: { points: [] } }), rallyInputs(full.events), tableTennisCue, full.events);
    assert.ok(m.length >= 3);
  });

  test('pickleball rally scoring shows the "Serving 4-2" call; side-out is unchanged', () => {
    let s = PICKLE.reducer(PICKLE.init({ scoring: 'rally', playersPerSide: 1 }), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    for (const x of ['home', 'home', 'home', 'home', 'away', 'away', 'home'] as Side[]) s = PICKLE.reducer(s, P(x));
    assert.equal(rallySummary(s, 'side-out', { rallyCall: true }).statusLine, 'Game 1 · Serving 5-2');
    assert.equal(rallySummary(s, 'side-out').statusLine, 'Game 1');
  });
});

describe('SD-117c · padel one-tap Ace / Double fault', () => {
  const start = () => padel.reducer(padel.init(), { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
  test('an Ace is the server point with the Ace detail; a double fault marks the receiver point', () => {
    let s = padel.reducer(start(), { type: 'POINT', side: 'home', payload: { pd: { how: 'ace' } }, attribution: { playerId: 'h1', playerName: 'H1', stat: 'points' } });
    assert.deepEqual(s.pts, { home: 1, away: 0 });
    assert.equal(s.events[0].pd?.how, 'ace');
    assert.equal(detailTracked(s), true);
    s = padel.reducer(s, { type: 'POINT', side: 'away', payload: { df: true }, attribution2: { playerId: 'h1', playerName: 'H1', stat: 'doubleFaults' } });
    assert.deepEqual(s.pts, { home: 1, away: 1 });
    assert.equal(s.events[1].df?.playerName, 'H1');
    assert.equal(s.events[1].playerName, undefined);
    // the editor replay keeps both
    const r = padel.reducer(s, { type: 'EDIT_LOG', payload: { points: pointInputs(s.events) } });
    assert.deepEqual(r.events.map((e) => [e.pd?.how, e.df?.playerName]), s.events.map((e) => [e.pd?.how, e.df?.playerName]));
  });
  test('old padel logs replay unchanged (no Ace / DF keys)', () => {
    const log = [...game('home'), ...game('away')];
    const a = log.reduce(padel.reducer, padel.init());
    assert.equal(a.events.some((e) => e.df || e.pd), false);
  });
});
