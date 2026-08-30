/**
 * Tennis serve rotation — who serves is derived from the first-server choice and
 * the number of games played (tiebreak-aware), so undo/replay stay correct.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, serveInfo, gamesPlayed, type TennisState } from '../src/sports/tennis/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const point = (side: 'home' | 'away'): ScoreAction => ({ type: 'POINT', side });
const run = (s: TennisState, ...as: ScoreAction[]) => as.reduce(reducer, s);
/** Win one game love-to-love for `side` (4 straight points). */
const winGame = (s: TennisState, side: 'home' | 'away') => run(s, point(side), point(side), point(side), point(side));

describe('tennis serve — side alternates every game', () => {
  test('defaults to home serving first, before any play', () => {
    const s = init();
    assert.equal(s.firstServer, 'home');
    assert.equal(serveInfo(s).side, 'home');
  });

  test('SET_FIRST_SERVER picks the opener; locked once play starts', () => {
    let s = reducer(init(), { type: 'SET_FIRST_SERVER', payload: { side: 'away' } });
    assert.equal(serveInfo(s).side, 'away');
    s = run(s, point('home')); // play starts
    const after = reducer(s, { type: 'SET_FIRST_SERVER', payload: { side: 'home' } });
    assert.equal(after.firstServer, 'away'); // unchanged
  });

  test('serve flips each completed game', () => {
    let s = init(); // home serves game 1
    assert.equal(serveInfo(s).side, 'home');
    s = winGame(s, 'home'); // 1 game done
    assert.equal(gamesPlayed(s), 1);
    assert.equal(serveInfo(s).side, 'away'); // game 2 → away serves
    s = winGame(s, 'away'); // 2 games done
    assert.equal(serveInfo(s).side, 'home'); // game 3 → home again
  });
});

describe('tennis serve — doubles pair rotation', () => {
  test('each side alternates its two servers across its service games', () => {
    // Doubles, home serves first. Home serves games 1,3,5,7 (indices 0,2,4,6):
    // its two players take slots 0,1,0,1.
    let s = init({ playersPerSide: 2 }); // firstServer home
    assert.equal(s.doubles, true);
    assert.equal(serveInfo(s).slot, 0); // home game 1 → player A
    s = winGame(s, 'home'); s = winGame(s, 'away'); // 2 games → home to serve game 3
    assert.equal(serveInfo(s).side, 'home');
    assert.equal(serveInfo(s).slot, 1); // home's 2nd service game → player B
    s = winGame(s, 'home'); s = winGame(s, 'away'); // → home game 5
    assert.equal(serveInfo(s).slot, 0); // back to player A
  });
});

describe('tennis serve — tiebreak point rotation', () => {
  test('in a set tiebreak the serve passes after the 1st point, then every two', () => {
    // Drive a set to 6-6 (12 games) so the next point is the tiebreak.
    let s = init(); // best of 3, tiebreak at 6-6
    for (let g = 0; g < 6; g++) { s = winGame(s, 'home'); s = winGame(s, 'away'); }
    assert.deepEqual([s.games.home, s.games.away], [6, 6]);
    const first = serveInfo(s).side; // whoever serves the 1st tiebreak point
    s = run(s, point('home')); // 1 point played
    assert.equal(serveInfo(s).side, first === 'home' ? 'away' : 'home'); // passes after pt 1
    s = run(s, point('home')); // 2 points
    assert.notEqual(serveInfo(s).side, first); // still the other side (pairs of two)
    s = run(s, point('home')); // 3 points → passes back
    assert.equal(serveInfo(s).side, first);
  });
});
