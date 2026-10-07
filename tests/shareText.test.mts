import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchShareText, tournamentShareText, golfShareText, matchLink } from '../src/core/shareText.ts';

describe('share messages', () => {
  test('live match: score, status, follow link', () => {
    const t = matchShareText({
      sportIcon: '🏏', status: 'live', home: 'Banjara XI', away: 'Strikers', homeScore: '142/4', awayScore: '',
      statusLine: '16.2 ov', detailLine: 'RR 8.69', tournamentName: 'Open T20 Cup', matchId: 'abc',
    });
    assert.equal(t, '🏏 LIVE · Open T20 Cup\nBanjara XI 142/4\nStrikers\n16.2 ov · RR 8.69\n\nFollow live on SportnNote: https://app.sportnnote.in/m/abc');
  });
  test('final names the winner (or a draw)', () => {
    const t = matchShareText({ sportIcon: '⚽', status: 'final', home: 'Red', away: 'Blue', homeScore: '2', awayScore: '1', winner: 'home', matchId: 'x' });
    assert.match(t, /^⚽ RESULT\nRed 2\nBlue 1\n🏆 Red won\n/);
    assert.match(t, /Details on SportnNote: https:\/\/app\.sportnnote\.in\/m\/x$/);
    assert.match(matchShareText({ sportIcon: '♟️', status: 'final', home: 'A', away: 'B', homeScore: '½', awayScore: '½', winner: 'draw' }), /🤝 Match drawn/);
  });
  test('upcoming: vs line with time and venue, no score', () => {
    const t = matchShareText({ sportIcon: '🏸', status: 'upcoming', home: 'R. Varma', away: 'S. Khan', homeScore: '0', awayScore: '0', when: 'Sat 12 Oct, 6:00 pm', venue: 'Gachibowli Stadium', matchId: 'q' });
    assert.match(t, /R\. Varma vs S\. Khan\n📅 Sat 12 Oct, 6:00 pm · Gachibowli Stadium/);
    assert.doesNotMatch(t, / 0\n/);
  });
  test('no match id (ad-hoc game) → no broken link', () => {
    assert.match(matchShareText({ sportIcon: '🎾', status: 'live', home: 'A', away: 'B', homeScore: '1', awayScore: '0' }), /sportnnote\.in$/);
  });
  test('tournament and golf', () => {
    assert.match(tournamentShareText({ name: 'Hyd Open', sportLine: '⚽ Football', tournamentId: 't1' }), /^🏆 Hyd Open\n⚽ Football\n\nFixtures, results & standings: https:\/\/app\.sportnnote\.in\/t\/t1$/);
    const g = golfShareText({ title: 'Sunday medal', final: false, eventId: 'e1', leaders: ['1. A −3 (thru 14)', 'T2. B −1 (thru 15)'] });
    assert.match(g, /^⛳ LIVE · Sunday medal\n1\. A −3 \(thru 14\)\nT2\. B −1/);
    assert.match(g, /Live leaderboard: https:\/\/app\.sportnnote\.in\/g\/e1$/);
  });
  test('short link shape', () => assert.equal(matchLink('m-1'), 'https://app.sportnnote.in/m/m-1'));
});

import { profileShareText } from '../src/core/shareText.ts';
test('profile: record across sports + link', () => {
  const t = profileShareText({ name: 'Hrudhay', matches: 20, wins: 13, sports: ['🏏 Cricket · 12 matches · 340 runs', '🏸 Badminton · 8 matches · 5 wins'], playerId: 'p1' });
  assert.equal(t, '🏅 Hrudhay on SportnNote\n20 matches · 13 wins (65%)\n\n🏏 Cricket · 12 matches · 340 runs\n🏸 Badminton · 8 matches · 5 wins\n\nFull stats: https://app.sportnnote.in/p/p1');
  assert.doesNotMatch(profileShareText({ name: 'New', matches: 0, wins: 0, sports: [], playerId: 'x' }), /NaN/);
});
