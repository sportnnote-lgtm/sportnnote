/**
 * SD-116 — one-tap match-deciding actions now ask first (scorer-ux-audit-sports.md):
 * chess Record result (+ colour committed only at Record, arbiter-style 1-0 /
 * ½-½ / 0-1), golf Concede match / stroke-play Pick up = NR / Clear, carrom
 * coins-left with no default + "wins Game N" on the Record button, hockey Full
 * time locked until the last period starts (H1), basketball Eject confirmed and
 * the picked scorer cleared after each shot (B1/B2).
 *
 * Pure parts are tested directly; the wiring is checked with source guards.
 * No reducer changed, so old logs replay identically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { confirmCopy, type MatchAction } from '../src/core/matchSafety.ts';
import { init as chessInit, reducer as chessReducer, resultSentence, scoreFor, resultString } from '../src/sports/chess/engine.ts';
import { init as carromInit, reducer as carromReducer, boardCloses } from '../src/sports/carrom/engine.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

describe('confirm copy for the new actions', () => {
  const NEW: MatchAction[] = ['recordResult', 'concede', 'pickUp', 'clearHole', 'eject'];
  test('question title, "Yes, …" / "No, …", one line', () => {
    for (const a of NEW) {
      const c = confirmCopy(a, { what: 'X', winner: 'Y' });
      assert.match(c.title, /\?$/, a);
      assert.match(c.yesLabel, /^Yes, /, a);
      assert.match(c.noLabel, /^No, /, a);
      assert.ok(c.message.length > 0 && !c.message.includes('\n'), a);
    }
  });
  test('chess: the result sentence is the title', () => {
    assert.equal(confirmCopy('recordResult', { what: '1-0: Anand beat Carlsen by Resignation' }).title, 'Record 1-0: Anand beat Carlsen by Resignation?');
    assert.equal(confirmCopy('recordResult').tone, 'danger');
  });
  test('golf: concede names both sides; pick up warns NR; clear is caution', () => {
    const c = confirmCopy('concede', { what: 'Rory', winner: 'Jon' });
    assert.equal(c.title, 'Rory concedes the match?');
    assert.match(c.message, /^Jon wins the match/);
    assert.match(confirmCopy('pickUp', { what: 'Rory on hole 7' }).message, /no return \(NR\)/);
    assert.match(confirmCopy('pickUp').yesLabel, /NR/);
    assert.equal(confirmCopy('clearHole').tone, 'caution');
  });
  test('basketball: eject names the player', () => {
    assert.equal(confirmCopy('eject', { what: 'Rahul' }).title, 'Eject Rahul?');
  });
});

describe('chess: arbiter-style result, White first', () => {
  test('scoreFor follows the colour, not home/away', () => {
    assert.equal(scoreFor('home', 'home'), '1-0');
    assert.equal(scoreFor('away', 'home'), '0-1');
    assert.equal(scoreFor('away', 'away'), '1-0');
    assert.equal(scoreFor('home', 'draw'), '½-½');
  });
  test('resultSentence', () => {
    assert.equal(resultSentence('home', 'home', 'Anand', 'Carlsen', 'resignation'), '1-0: Anand beat Carlsen by Resignation');
    assert.equal(resultSentence('home', 'away', 'Anand', 'Carlsen', 'checkmate'), '0-1: Carlsen beat Anand by Checkmate');
    assert.equal(resultSentence('home', 'away', 'Anand', 'Carlsen', 'time'), '0-1: Carlsen beat Anand on time');
    assert.equal(resultSentence('home', 'draw', 'Anand', 'Carlsen', 'stalemate'), '½-½: Anand drew with Carlsen (Stalemate)');
    assert.equal(resultSentence('away', 'away', 'Carlsen', 'Anand'), '1-0: Carlsen beat Anand');
  });
  test('the pending sentence matches what the reducer records', () => {
    // paired colour: away has White (config.white), Black (home) wins
    let s = chessInit({ white: 'away' });
    s = chessReducer(s, { type: 'RESULT', side: 'home', payload: { winner: 'home', method: 'resignation' } });
    assert.equal(resultString(s), scoreFor('away', 'home'));
    // a colour change is committed with the result (SET_WHITE then RESULT)
    let t = chessInit({ white: 'away' });
    t = chessReducer(t, { type: 'SET_WHITE', payload: { side: 'home' } });
    t = chessReducer(t, { type: 'RESULT', side: 'home', payload: { winner: 'home' } });
    assert.equal(resultString(t), '1-0');
  });
  test('controls: Record asks first; the White chips only set a draft', () => {
    const c = src('sports/chess/index.tsx');
    assert.ok(/askConfirm\(confirmCopy\('recordResult'/.test(c));
    assert.ok(!/onPress=\{\(\) => dispatch\(\{ type: 'SET_WHITE'/.test(c), 'no SET_WHITE straight from a chip');
    assert.ok(/if \(white !== s\.white\) dispatch\(\{ type: 'SET_WHITE'/.test(c));
    assert.ok(c.includes("'1-0', 'White wins'") && c.includes("'0-1', 'Black wins'") && c.includes("'½-½', 'Draw'"));
  });
});

describe('carrom: Record says when it closes a game', () => {
  const s0 = carromInit({});
  test('a board that reaches 25 wins the game; not before', () => {
    let s = s0;
    for (let i = 0; i < 2; i++) s = carromReducer(s, { type: 'BOARD', side: 'home', payload: { coins: 9, queen: true } }); // 12 + 12 = 24? (queen counts under 22)
    assert.equal(boardCloses(s0, 'home', 5, false), null);
    const c = boardCloses(s, 'home', 1, false);
    assert.deepEqual(c, { kind: 'game', game: 1, winner: 'home' });
  });
  test('the match-winning board says the match', () => {
    let s = { ...s0, gamesWon: { home: 1, away: 0 }, games: [[25, 10]] as Array<[number, number]>, current: { home: 24, away: 0 } };
    assert.deepEqual(boardCloses(s, 'home', 3, false), { kind: 'match', game: 2, winner: 'home' });
    s = { ...s, ended: true };
    assert.equal(boardCloses(s, 'home', 3, false), null);
  });
  test('after the board limit the game can go to the side that lost the board', () => {
    const s = { ...s0, boardsInGame: 7, current: { home: 20, away: 10 } };
    assert.deepEqual(boardCloses(s, 'away', 2, false), { kind: 'game', game: 1, winner: 'home' });
  });
  test('controls: no coin default; Record disabled until picked', () => {
    const c = src('sports/carrom/index.tsx');
    assert.ok(/useState<number \| null>\(null\)/.test(c));
    assert.ok(/disabled=\{coins == null\}/.test(c));
    assert.ok(/boardCloses\(s, winner, coins, queen\)/.test(c));
  });
});

describe('golf / hockey / basketball wiring', () => {
  test('golf match play: Concede match… goes through the sheet, after the hole buttons', () => {
    const g = src('sports/golf/index.tsx');
    assert.ok(!/onPress=\{\(\) => dispatch\(\{ type: 'CONCEDE'/.test(g));
    assert.ok(/askConfirm\(confirmCopy\('concede'/.test(g));
    assert.ok(g.indexOf('Concede match…') > g.indexOf('wins hole ${holeNo}'));
  });
  test('golf round: stroke-play Pick up and Clear ask first', () => {
    const r = src('screens/GolfRoundScreen.tsx');
    assert.ok(/confirmMatchAction\('pickUp'/.test(r));
    assert.ok(/confirmMatchAction\('clearHole'/.test(r));
    assert.ok(!/label="Clear" active=\{false\} onPress=\{\(\) => canMark && set\(null\)\}/.test(r));
  });
  test('hockey H1: Full time is disabled until the last period has started', () => {
    const h = src('sports/hockey/index.tsx');
    assert.ok(/label="🏁 Full time" variant="danger" disabled=\{!periodStarted\(s\)\}/.test(h));
  });
  test('basketball: Eject confirms; the scorer clears after each shot', () => {
    const b = src('sports/basketball/index.tsx');
    assert.ok(/confirmMatchAction\('eject'/.test(b));
    assert.ok(!/onPress=\{\(\) => \{ fire\(\{ type: 'EJECT'/.test(b));
    assert.ok(/clearSel\(side\);\n    fire\(\{\n      type: 'SCORE'/.test(b));
  });
});
