/**
 * Football end-to-end replay — a REAL match driven event-by-event and checked
 * against the reference source, not just the final score.
 *
 * Match: Newcastle United 2-2 Liverpool, 23 Aug 2026 (ESPN commentary,
 * gameId 401879319). home = Newcastle, away = Liverpool.
 *   5'      Goal — Anthony Elanga (Newcastle)
 *   55'     Goal — Cody Gakpo (Liverpool)
 *   57'     Goal — Joe Willock (Newcastle)
 *   65'     Yellow — Jacob Ramsey (Newcastle)
 *   70'     Sub — Liverpool (Jacquet → Araújo)
 *   76'     Sub ×2 — Newcastle
 *   79'     Yellow — Jacob Murphy (Newcastle)
 *   90'     Yellow — Virgil van Dijk (Liverpool)
 *   90'+9'  Goal (penalty) — Dominik Szoboszlai (Liverpool)
 *   FT      2-2
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, cardCount, type FootballState } from '../src/sports/football/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
const run = (s: FootballState, ...as: ScoreAction[]) => as.reduce(reducer, s);
const goal = (side: Side, minute: number, goalType: 'open' | 'penalty' | 'freekick', scorer: string): ScoreAction =>
  ({ type: 'GOAL', side, payload: { minute, goalType }, attribution: { playerId: scorer, stat: 'goals', playerName: scorer } });
const yellow = (side: Side, minute: number, player: string): ScoreAction =>
  ({ type: 'YELLOW', side, payload: { minute }, attribution: { playerId: player, stat: 'yellowCards', playerName: player } });
const sub = (side: Side, minute: number, offName: string, onName: string): ScoreAction =>
  ({ type: 'SUB', side, payload: { minute, offName, onName } });

const goalsOf = (s: FootballState, side: Side) => s.events.filter((e) => e.type === 'goal' && e.side === side);

describe('football — Newcastle 2-2 Liverpool, replayed event-by-event', () => {
  test('the score tracks every goal as it goes in', () => {
    let s = run(init(), { type: 'KICKOFF', payload: { at: 1 } });
    s = run(s, goal('home', 5, 'open', 'Anthony Elanga'));
    assert.deepEqual([s.home, s.away], [1, 0]); // 5' Newcastle lead

    s = run(s, { type: 'NEXT_HALF', payload: { at: 2 } });
    s = run(s, goal('away', 55, 'open', 'Cody Gakpo'));
    assert.deepEqual([s.home, s.away], [1, 1]); // 55' Liverpool level

    s = run(s, goal('home', 57, 'open', 'Joe Willock'));
    assert.deepEqual([s.home, s.away], [2, 1]); // 57' Newcastle back ahead

    // stoppage-time penalty equaliser
    s = run(s, { type: 'SET_STOPPAGE', payload: { minutes: 12 } }, goal('away', 99, 'penalty', 'Dominik Szoboszlai'));
    assert.deepEqual([s.home, s.away], [2, 2]); // 90+9' Liverpool level from the spot
  });

  test('final state matches the reference: score, scorers, penalty, cards, draw', () => {
    let s = run(init(), { type: 'KICKOFF', payload: { at: 1 } });
    s = run(s,
      goal('home', 5, 'open', 'Anthony Elanga'),
      { type: 'NEXT_HALF', payload: { at: 2 } },
      goal('away', 55, 'open', 'Cody Gakpo'),
      goal('home', 57, 'open', 'Joe Willock'),
      yellow('home', 65, 'Jacob Ramsey'),
      sub('away', 70, 'Jeremy Jacquet', 'Ronald Araújo'),
      sub('home', 76, 'Lewis Miley', 'Aladji Bamba'),
      sub('home', 76, 'Anthony Elanga', 'Jacob Murphy'),
      yellow('home', 79, 'Jacob Murphy'),
      yellow('away', 90, 'Virgil van Dijk'),
      { type: 'SET_STOPPAGE', payload: { minutes: 12 } },
      goal('away', 99, 'penalty', 'Dominik Szoboszlai'),
      { type: 'END', payload: { at: 3 } },
    );

    // Final score & result
    assert.deepEqual([s.home, s.away], [2, 2]);
    assert.equal(s.ended, true);
    assert.equal(s.home === s.away, true); // a draw

    // Goalscorers, in order, per side
    assert.deepEqual(goalsOf(s, 'home').map((e) => e.playerName), ['Anthony Elanga', 'Joe Willock']);
    assert.deepEqual(goalsOf(s, 'away').map((e) => e.playerName), ['Cody Gakpo', 'Dominik Szoboszlai']);

    // The equaliser is correctly recorded as a penalty (feeds penaltyGoals stats)
    const equaliser = goalsOf(s, 'away').at(-1)!;
    assert.equal(equaliser.goalType, 'penalty');
    assert.equal(equaliser.minute, 99); // shown as 90+9'

    // Cards
    assert.equal(cardCount(s.events, 'yellow', 'home'), 2); // Ramsey, Murphy
    assert.equal(cardCount(s.events, 'yellow', 'away'), 1); // van Dijk
    assert.equal(cardCount(s.events, 'red', 'home') + cardCount(s.events, 'red', 'away'), 0);

    // Substitutions counted per side (max not exceeded)
    assert.equal(s.subsUsed.home, 2);
    assert.equal(s.subsUsed.away, 1);
  });
});

describe('football — edge cases the commentary throws at a scorer', () => {
  test('VAR-disallowed goal: the goal is removed and the score reverts', () => {
    let s = run(init(), { type: 'KICKOFF', payload: { at: 1 } }, goal('home', 20, 'open', 'Striker'));
    assert.equal(s.home, 1);
    const goalId = s.events.find((e) => e.type === 'goal')!.id;
    s = reducer(s, { type: 'REMOVE_EVENT', side: 'home', payload: { id: goalId } });
    assert.equal(s.home, 0); // disallowed → back to 0
    assert.equal(goalsOf(s, 'home').length, 0);
  });

  test('own goal credits the team, not a scorer', () => {
    let s = run(init(), { type: 'KICKOFF', payload: { at: 1 } },
      { type: 'OWN_GOAL', side: 'home', payload: { minute: 30, scorerName: 'Defender X' } });
    assert.equal(s.home, 1);
    const og = s.events.find((e) => e.type === 'owngoal')!;
    assert.equal(og.side, 'home'); // team awarded the goal
    assert.equal(goalsOf(s, 'home').length, 0); // not a normal goal for any striker
  });

  test('second yellow becomes a red', () => {
    let s = run(init(), { type: 'KICKOFF', payload: { at: 1 } },
      yellow('away', 40, 'Hothead'),
      { type: 'RED', side: 'away', payload: { minute: 70, secondYellow: true }, attribution: { playerId: 'Hothead', stat: 'redCards', playerName: 'Hothead' } });
    assert.equal(cardCount(s.events, 'red', 'away'), 1);
    assert.equal(s.events.find((e) => e.type === 'red')!.secondYellow, true);
  });
});
