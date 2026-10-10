/**
 * SD-20 — the game/set score line everywhere a result appears, and for matches
 * closed by hand. Covers: the line score model (`lineScore` per engine) and its
 * text (completed sets = the SD-01 `scoreLine`, plus the unfinished set for a
 * retirement); the ITF / BWF / ITTF marks ("ret.", "def.", "w/o", "abandoned")
 * per sport; padel's match tiebreak stored in its set entry ([10-7], old
 * snapshots too); the share text; bracket cells and series legs; the team
 * head-to-head row; the ticker; and the LineScoreboard grid (columns, the live
 * highlight, tiebreak superscripts, the match-tiebreak column, a closed board).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from './racketLogs.mts';
import {
  lineText, lineGrid, cellText, resultMark, markedLine, matchScoreLine, finalBoard,
  compactResult, bracketCellText, sup, type LinePlugin,
} from '../src/sports/scoreline.ts';
import * as tennis from '../src/sports/tennis/engine.ts';
import * as padel from '../src/sports/padel/engine.ts';
import * as badminton from '../src/sports/badminton/engine.ts';
import * as carrom from '../src/sports/carrom/engine.ts';
import * as vb from '../src/sports/volleyball/engine.ts';
import { makeRallyEngine, rallyScoreLine, rallyLineScore, type RallyState } from '../src/sports/rallyEngine.ts';
import { matchShareText } from '../src/core/shareText.ts';
import { manualResultLine } from '../src/core/matchResult.ts';
import { computeTeamStats, h2hLastText } from '../src/data/teamStats.ts';
import { buildTicker } from '../src/sports/ticker.ts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Match, MatchResult } from '../src/core/types.ts';

type Eng<S> = { init: (c?: Record<string, unknown>) => S; reducer: (s: S, a: ScoreAction) => S };
const run = <S,>(e: Eng<S>, cfg: Record<string, unknown>, log: ScoreAction[]): S => log.reduce(e.reducer, e.init(cfg));
const P = (side: 'home' | 'away'): ScoreAction => ({ type: 'POINT', side });
const pts = (side: 'home' | 'away', n: number) => Array.from({ length: n }, () => P(side));

const rally = (d: { playersPerSide: number; target: number; winBy: number; gamesToWin: number }, sideOutValue = '__none__') =>
  makeRallyEngine({ icon: '•', sideOutValue, sideOutLabel: 'Side out', defaults: d });
const TT = rally({ playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 });
const SQUASH = rally({ playersPerSide: 1, target: 11, winBy: 2, gamesToWin: 3 }, 'english');
const PICKLE = rally({ playersPerSide: 2, target: 11, winBy: 2, gamesToWin: 2 }, 'sideout');

// The plugin surface the result helpers read (as the real plugins wire it).
const TENNIS: LinePlugin = { scoreLine: tennis.scoreLine as never, lineScore: tennis.lineScore as never, retireTerms: true };
const PADEL: LinePlugin = { scoreLine: padel.scoreLine as never, lineScore: padel.lineScore as never, retireTerms: true };
const BADMINTON: LinePlugin = { scoreLine: badminton.scoreLine as never, lineScore: badminton.lineScore as never, retireTerms: true };
const RALLY: LinePlugin = { scoreLine: rallyScoreLine as never, lineScore: rallyLineScore as never, retireTerms: true };
const CARROM: LinePlugin = { scoreLine: carrom.scoreLine as never, lineScore: carrom.lineScore as never };
const VOLLEY: LinePlugin = { scoreLine: ((s: vb.VolleyballState) => lineText(vb.lineScore(s))) as never, lineScore: vb.lineScore as never };

const res = (kind: MatchResult['kind'], winner?: 'home' | 'away', reason = 'Injury'): MatchResult =>
  ({ kind, ...(winner ? { winner } : {}), reason, at: '2026-10-10T10:00:00Z' });

// Tennis: 6-4, then 3-2 (and 30-15) when the away player retires.
const TENNIS_RET = [...L.tSet(6, 4), ...L.tGame('home'), ...L.tGame('away'), ...L.tGame('home'), ...L.tGame('away'), ...L.tGame('home'), P('home'), P('home'), P('away')];
// Padel (match10): 6-4, 3-6, then 5-3 in the match tiebreak.
const PADEL_MTB_LIVE = [...L.tSet(6, 4), ...L.tSet(3, 6), ...pts('home', 5), ...pts('away', 3)];

describe('line score model = SD-01 scoreLine for completed sets', () => {
  test('tennis, padel, badminton, rally sports, carrom: lineText(done) is the scoreLine', () => {
    const t = run(tennis, {}, L.TENNIS_BO3);
    assert.equal(lineText(tennis.lineScore(t)), tennis.scoreLine(t));
    assert.equal(lineText(tennis.lineScore(t), { perspective: 'away' }), tennis.scoreLine(t, 'away'));
    const p = run(padel, { decider: 'match10' }, [...L.PADEL_TWO_SETS, ...L.tbPts('away', 7), ...L.tbPts('home', 10)]);
    assert.equal(lineText(padel.lineScore(p)), padel.scoreLine(p));
    const b = run(badminton, {}, L.BADMINTON_LOG);
    assert.equal(lineText(badminton.lineScore(b)), '21-18, 19-21, 21-15');
    const tt = run(TT, {}, L.TT_LOG) as RallyState;
    assert.equal(lineText(rallyLineScore(tt)), rallyScoreLine(tt));
    const c = L.CARROM_BOARDS.reduce((s, [side, coins, queen]) => carrom.reducer(s, { type: 'BOARD', side, payload: { coins, queen } }), carrom.init());
    assert.equal(lineText(carrom.lineScore(c)), carrom.scoreLine(c));
  });
  test('an ended match has no set in play; a live one does', () => {
    const t = run(tennis, {}, L.TENNIS_BO3);
    assert.equal(tennis.lineScore(t)!.current, null);
    const live = run(tennis, {}, TENNIS_RET);
    assert.deepEqual(tennis.lineScore(live)!.current, { home: 3, away: 2 });
    assert.deepEqual(tennis.lineScore(live)!.won, { home: 1, away: 0 });
  });
});

describe('padel match tiebreak stored in the set entry → [10-7] everywhere', () => {
  test('the deciding set entry holds the tiebreak points', () => {
    const s = run(padel, { decider: 'match10' }, [...L.PADEL_TWO_SETS, ...L.tbPts('away', 7), ...L.tbPts('home', 10)]);
    assert.ok(s.ended);
    assert.deepEqual(s.sets[2], [10, 7]);
    assert.match(padel.scoreLine(s), /\[10-7\]$/);
    assert.match(padel.scoreLine(s, 'away'), /\[7-10\]$/);
    // ATP/FIP standings still count the match tiebreak as ONE game.
    const g = padel.standingsUnits(s)!.games;
    const plain = padel.standingsUnits(run(padel, { decider: 'match10' }, L.PADEL_TWO_SETS))!.games;
    assert.equal(g.home + g.away, plain.home + plain.away + 1);
  });
  test('an older snapshot (0-0 in the set, points only in tb) reads the same', () => {
    const old = { sets: [[6, 3], [3, 6], [0, 0]], tb: [null, null, [10, 7]], setsWon: { home: 2, away: 1 }, setsToWin: 2, matchTbDecider: true, games: { home: 0, away: 0 }, pts: { home: 0, away: 0 }, ended: true, events: [] } as unknown as padel.PadelState;
    assert.equal(padel.scoreLine(old), '6-3, 3-6, [10-7]');
    assert.equal(lineText(padel.lineScore(old)), '6-3, 3-6, [10-7]');
    assert.deepEqual(lineGrid(padel.lineScore(old)!).home, ['6', '3', '10']);
    assert.equal(cellText({ home: 0, away: 0, tb: [10, 7], matchTb: true }), '[10-7]');
  });
});

describe('result marks per sport (ITF / BWF / ITTF / WSF / FIP)', () => {
  test('resultMark: racket vs generic words', () => {
    assert.equal(resultMark({ result: res('conceded', 'home') }), 'ret.');
    assert.equal(resultMark({ result: res('awarded', 'home', 'Late arrival') }), 'def.');
    assert.equal(resultMark({ result: res('awarded', 'home', 'Retired') }), 'ret.'); // the old retireMatch path
    assert.equal(resultMark({ walkover: true }), 'w/o');
    assert.equal(resultMark({ result: res('abandoned') }), 'abandoned');
    assert.equal(resultMark({ result: res('no_result') }), 'abandoned');
    assert.equal(resultMark({ result: res('draw') }), null);
    assert.equal(resultMark({}), null);
    assert.equal(resultMark({ result: res('conceded', 'home') }, 'generic'), 'conceded');
    assert.equal(resultMark({ result: res('awarded', 'home') }, 'generic'), 'awarded');
    assert.equal(resultMark({ result: res('no_result') }, 'generic'), 'no result');
  });
  test('markedLine', () => {
    assert.equal(markedLine('6-4, 3-2', 'ret.'), '6-4, 3-2 ret.');
    assert.equal(markedLine('6-4', 'w/o'), 'w/o');
    assert.equal(markedLine('', 'abandoned'), 'abandoned');
    assert.equal(markedLine('6-4', null), '6-4');
  });
  test('tennis: "6-4, 3-2 ret." (the unfinished set, not its points)', () => {
    const s = run(tennis, {}, TENNIS_RET);
    assert.equal(matchScoreLine(TENNIS, s, { result: res('conceded', 'home') }), '6-4, 3-2 ret.');
    assert.equal(matchScoreLine(TENNIS, s, { result: res('conceded', 'home'), perspective: 'away' }), '4-6, 2-3 ret.');
    assert.equal(matchScoreLine(TENNIS, s, { result: res('awarded', 'home', 'Code violation') }), '6-4, 3-2 def.');
    assert.equal(matchScoreLine(TENNIS, s, { result: res('abandoned', undefined, 'Rain') }), '6-4, 3-2 abandoned');
    assert.equal(matchScoreLine(TENNIS, s, { walkover: true }), 'w/o');
    // a fresh set at 0-0 isn't written: "6-4 ret."
    const atSet = run(tennis, {}, L.tSet(6, 4));
    assert.equal(matchScoreLine(TENNIS, atSet, { result: res('conceded', 'home') }), '6-4 ret.');
    // retired before a point = a walkover
    assert.equal(matchScoreLine(TENNIS, tennis.init(), { result: res('conceded', 'home') }), 'w/o');
    // nothing played and abandoned
    assert.equal(matchScoreLine(TENNIS, tennis.init(), { result: res('abandoned') }), 'abandoned');
    // a normal finish: just the line
    assert.equal(matchScoreLine(TENNIS, run(tennis, {}, L.TENNIS_BO3)), '6-4, 3-6, 7-6(4)');
  });
  test('tennis retiring in a tiebreak keeps the 6-6 set; padel in a match tiebreak shows [5-3]', () => {
    const tb = run(tennis, {}, [...L.tSet(6, 4), ...L.tSet(6, 6), ...pts('home', 3)]);
    assert.equal(matchScoreLine(TENNIS, tb, { result: res('conceded', 'home') }), '6-4, 6-6 ret.');
    const p = run(padel, { decider: 'match10' }, PADEL_MTB_LIVE);
    assert.equal(padel.matchTbActive(p), true);
    assert.equal(matchScoreLine(PADEL, p, { result: res('conceded', 'home') }), '6-4, 3-6, [5-3] ret.');
  });
  test('badminton, table tennis, squash, pickleball: "… ret." with the game in play', () => {
    const b = run(badminton, {}, [...L.rGame(21, 15), ...pts('home', 8), ...pts('away', 3)]);
    assert.equal(matchScoreLine(BADMINTON, b, { result: res('conceded', 'home') }), '21-15, 8-3 ret.');
    const tt = run(TT, {}, [...L.rGame(11, 7), ...L.rGame(9, 11), ...pts('away', 4), ...pts('home', 2)]);
    assert.equal(matchScoreLine(RALLY, tt, { result: res('conceded', 'away') }), '11-7, 9-11, 2-4 ret.');
    const sq = run(SQUASH, {}, [...L.rGame(11, 9), ...pts('home', 5)]);
    assert.equal(matchScoreLine(RALLY, sq, { result: res('awarded', 'home', 'Conduct') }), '11-9, 5-0 def.');
    const pb = run(PICKLE, {}, L.PICKLEBALL_RALLY_LOG.slice(0, 15));
    assert.equal(matchScoreLine(RALLY, pb, { result: res('abandoned', undefined, 'Rain') }), '11-4 abandoned');
  });
  test('carrom and volleyball use plain words', () => {
    const c = carrom.reducer(carrom.init(), { type: 'BOARD', side: 'home', payload: { coins: 5, queen: true } });
    assert.equal(matchScoreLine(CARROM, c, { result: res('conceded', 'home') }), '8-0 conceded');
    let v = vb.init({});
    const alt = (n: number) => Array.from({ length: n }, () => ['home', 'away'] as const).flat();
    for (const a of [...alt(20), ...Array(5).fill('home'), ...alt(8), 'home', 'home'] as Array<'home' | 'away'>) v = vb.reducer(v, vb.outcomeAction('opperror', a));
    assert.equal(matchScoreLine(VOLLEY, v, { result: res('awarded', 'home', 'Team left') }), '25-20, 10-8 awarded');
  });
  test('the words: "won — retired" / "won by default" for racket sports', () => {
    assert.equal(manualResultLine(res('conceded', 'home', 'Injury'), 'Asha', 'Bina', { retireTerms: true }), 'Asha won — Bina retired (Injury)');
    assert.equal(manualResultLine(res('awarded', 'away', 'Late arrival'), 'Asha', 'Bina', { retireTerms: true }), 'Bina won by default — Late arrival');
    assert.equal(manualResultLine(res('awarded', 'home', 'Retired'), 'Asha', 'Bina', { retireTerms: true }), 'Asha won — Bina retired');
    assert.equal(manualResultLine(res('conceded', 'home', 'Injury'), 'Asha', 'Bina'), 'Asha won — Bina conceded'); // other sports unchanged
  });
});

describe('share text', () => {
  test('a tennis retirement shares sets won + "6-4, 3-2 ret.", never the live points', () => {
    const s = run(tennis, {}, TENNIS_RET);
    const r = res('conceded', 'home');
    const fb = finalBoard(TENNIS, s, { result: r })!;
    assert.deepEqual(fb, { homeScore: '1', awayScore: '0', line: '6-4, 3-2 ret.' });
    const text = matchShareText({
      sportIcon: '🎾', status: 'final', home: 'Asha', away: 'Bina', homeScore: fb.homeScore, awayScore: fb.awayScore,
      statusLine: 'Match Over', detailLine: fb.line, winner: 'home',
      resultLine: manualResultLine(r, 'Asha', 'Bina', { retireTerms: true }), matchId: 'm1',
    });
    assert.equal(text, [
      '🎾 RESULT', 'Asha 1', 'Bina 0', '🏁 Asha won — Bina retired (Injury)', 'Match Over · 6-4, 3-2 ret.', '',
      'Details on SportnNote: https://app.sportnnote.in/m/m1',
    ].join('\n'));
  });
  test('a natural finish shares the SD-01 line; a walkover has no score', () => {
    const t = run(tennis, {}, L.TENNIS_BO3);
    assert.deepEqual(finalBoard(TENNIS, t), { homeScore: '2', awayScore: '1', line: '6-4, 3-6, 7-6(4)' });
    const wo = finalBoard(TENNIS, tennis.init(), { walkover: true })!;
    assert.deepEqual(wo, { homeScore: '', awayScore: '', line: 'w/o' });
    const text = matchShareText({ sportIcon: '🏸', status: 'final', home: 'Asha', away: 'Bina', homeScore: wo.homeScore, awayScore: wo.awayScore, statusLine: 'Match Over', detailLine: wo.line, winner: 'away' });
    assert.match(text, /^🏸 RESULT\nAsha vs Bina\n🏆 Bina won\nMatch Over · w\/o\n/);
  });
});

describe('bracket cells and compact results', () => {
  test('bracketCellText', () => {
    assert.equal(bracketCellText({ live: true, decided: false, line: '' }), '● LIVE');
    assert.equal(bracketCellText({ live: false, decided: true, line: '6-4, 3-6, [10-7]' }), '6-4, 3-6, [10-7]');
    assert.equal(bracketCellText({ live: false, decided: true, line: '6-4, 3-2 ret.' }), '6-4, 3-2 ret.');
    assert.equal(bracketCellText({ live: false, decided: true, line: 'w/o' }), 'w/o');
    assert.equal(bracketCellText({ live: false, decided: true, line: '' }), ''); // football: the scores say it
    assert.equal(bracketCellText({ live: false, decided: false, line: '' }), 'vs');
  });
  test('compactResult (series legs)', () => {
    assert.equal(compactResult({ home: 2, away: 1 }, '6-4, 3-6, [10-7]'), '2–1 (6-4, 3-6, [10-7])');
    assert.equal(compactResult({ home: 3, away: 1 }, ''), '3–1');
    assert.equal(compactResult(null, 'w/o'), 'w/o');
    assert.equal(compactResult({ home: 1, away: 0 }, 'w/o'), 'w/o');
  });
});

describe('team head-to-head row', () => {
  const team = (id: string) => ({ id, name: id.toUpperCase(), sport: 'tennis', colorHex: '#000' });
  const m = (id: string, day: string, home: string, away: string, extra: Partial<Match>): Match => ({
    id, sport: 'tennis', status: 'completed', startsAt: `2026-10-${day}T10:00:00Z`, homeTeam: team(home), awayTeam: team(away), ...extra,
  } as unknown as Match);
  const lines: Record<string, Record<string, string>> = {
    m1: { a: '6-4, 3-6, 7-6(4)', b: '4-6, 6-3, 6-7(4)' },
    m2: { a: '4-6, 2-3 ret.', b: '6-4, 3-2 ret.' },
  };
  const lineOf = (x: Match) => (x.walkover ? 'w/o' : lines[x.id]?.a ?? '');
  test('latest meeting first, with its line from this team’s side', () => {
    const st = computeTeamStats('a', [
      m('m1', '01', 'a', 'b', { winner: 'home', score: { home: 2, away: 1 } }),
      m('m2', '05', 'b', 'a', { winner: 'home', score: { home: 1, away: 0 }, result: res('conceded', 'home') }),
      m('m3', '03', 'a', 'c', { winner: 'home', walkover: true }),
    ], [], {}, {}, lineOf);
    const vsB = st.headToHead.find((h) => h.opponentId === 'b')!;
    assert.deepEqual(vsB.last, { matchId: 'm2', result: 'L', for: 0, against: 1, line: '4-6, 2-3 ret.' });
    assert.equal(h2hLastText(vsB), 'Last: L 0–1 · 4-6, 2-3 ret.');
    const vsC = st.headToHead.find((h) => h.opponentId === 'c')!;
    assert.equal(h2hLastText(vsC), 'Last: W w/o');
    assert.equal(st.form[0].line, '4-6, 2-3 ret.');
    assert.equal(h2hLastText({}), '');
  });
  test('without lineOf the rows are as before', () => {
    const st = computeTeamStats('a', [m('m1', '01', 'a', 'b', { winner: 'home', score: { home: 2, away: 1 } })]);
    assert.equal(h2hLastText(st.headToHead[0]), 'Last: W 2–1');
    assert.equal(st.form[0].line, undefined);
  });
});

describe('ticker for a match closed by hand', () => {
  test('sets won + the marked line, not the live points', () => {
    const s = run(tennis, {}, TENNIS_RET);
    const plugin = { summary: tennis.summary, isComplete: (x: tennis.TennisState) => x.ended, ...TENNIS } as never;
    const r = res('conceded', 'home');
    const meta = { home: { name: 'Asha', short: 'ASH' }, away: { name: 'Bina', short: 'BIN' }, resultLine: 'Asha won — Bina retired', status: 'completed' };
    const m = buildTicker(plugin, s, { ...meta, result: r }, 50);
    assert.equal(m.home.score, '1');
    assert.equal(m.away.score, '0');
    assert.equal(m.detail, '6-4, 3-2 ret.');
    assert.equal(m.status, 'Asha won — Bina retired');
    // without the result (older callers): unchanged behaviour
    assert.equal(buildTicker(plugin, s, meta, 50).home.score, '30');
  });
});

describe('LineScoreboard grid (pure model)', () => {
  test('live tennis: a column per set, the current one highlighted', () => {
    const g = lineGrid(tennis.lineScore(run(tennis, {}, TENNIS_RET))!);
    assert.deepEqual(g.columns, [{ label: '1', highlight: false }, { label: '2', highlight: true }]);
    assert.deepEqual(g.home, ['6', '3']);
    assert.deepEqual(g.away, ['4', '2']);
    assert.equal(g.winner, null);
  });
  test('tiebreak superscript on the set loser; the winner trophy once ended', () => {
    const g = lineGrid(tennis.lineScore(run(tennis, {}, L.TENNIS_BO3))!);
    assert.deepEqual(g.columns.map((c) => c.highlight), [false, false, false]);
    assert.deepEqual(g.home, ['6', '3', '7']);
    assert.deepEqual(g.away, ['4', '6', `6${sup(4)}`]);
    assert.equal(g.away[2], '6⁴');
    assert.equal(g.winner, 'home');
  });
  test('padel: the match tiebreak is its own TB column (10 / 7), live and final', () => {
    const live = lineGrid(padel.lineScore(run(padel, { decider: 'match10' }, PADEL_MTB_LIVE))!);
    assert.deepEqual(live.columns, [{ label: '1', highlight: false }, { label: '2', highlight: false }, { label: 'TB', highlight: true }]);
    assert.deepEqual(live.home, ['6', '3', '5']);
    assert.deepEqual(live.away, ['4', '6', '3']);
    const done = lineGrid(padel.lineScore(run(padel, { decider: 'match10' }, [...L.PADEL_TWO_SETS, ...L.tbPts('away', 7), ...L.tbPts('home', 10)]))!);
    assert.equal(done.columns[2].label, 'TB');
    assert.deepEqual([done.home[2], done.away[2]], ['10', '7']);
  });
  test('rally sports: a fresh match is one live column at 0-0; games per column', () => {
    const fresh = lineGrid(rallyLineScore(TT.init({}) as RallyState)!);
    assert.deepEqual(fresh.columns, [{ label: '1', highlight: true }]);
    assert.deepEqual([fresh.home, fresh.away], [['0'], ['0']]);
    const tt = lineGrid(rallyLineScore(run(TT, {}, [...L.rGame(11, 7), ...pts('away', 4)]) as RallyState)!);
    assert.deepEqual(tt.columns.map((c) => c.highlight), [false, true]);
    assert.deepEqual([tt.home, tt.away], [['11', '0'], ['7', '4']]);
  });
  test('closed by hand: the unfinished set stays, nothing highlighted, the winner marked', () => {
    const ls = tennis.lineScore(run(tennis, {}, TENNIS_RET))!;
    const g = lineGrid(ls, { closed: { winner: 'home' } });
    assert.deepEqual(g.columns, [{ label: '1', highlight: false }, { label: '2', highlight: false }]);
    assert.deepEqual([g.home, g.away], [['6', '3'], ['4', '2']]);
    assert.equal(g.winner, 'home');
    const nothing = lineGrid(tennis.lineScore(tennis.init())!, { closed: { winner: 'away' } });
    assert.deepEqual(nothing.columns, [{ label: '1', highlight: false }]);
  });
  test('a broken snapshot never throws in the result helpers', () => {
    const bad: LinePlugin = { scoreLine: (() => { throw new Error('old'); }) as never, lineScore: (() => { throw new Error('old'); }) as never, retireTerms: true };
    assert.equal(matchScoreLine(bad, {}), '');
    assert.equal(matchScoreLine(bad, {}, { result: res('conceded', 'home') }), 'ret.');
    assert.equal(finalBoard(bad, {}), null);
    assert.equal(matchScoreLine({}, {}), '');
  });
});
