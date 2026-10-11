/**
 * SD-119 — every stat line names the side its player did NOT play for.
 *
 * Before: the live layer labelled every credit of an action with the opponent
 * of `action.side` (the winner / the side that scored), so a chess result
 * (both players credited) named Kabir as Kabir's own opponent, a draw / double
 * forfeit did it on both lines, and a double fault, a volleyball opponent's
 * error, a kabaddi tackle or a cricket bowler's wicket did the same.
 * Plus the `__sportnnoteAdmin.repairOpponents` planner for past lines.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionLineCredits, creditedSide, matchSideOf, planOpponentRepair, rosterSide,
  type LineCredit, type SideRosters,
} from '../src/data/lineOpponent.ts';
import { chessResultCredit } from '../src/sports/chess/stats.ts';
import { tennisVoice, kabaddiVoice } from '../src/sports/voiceParsers.ts';
import { wicketAttribution } from '../src/sports/cricket/engine.ts';
import { outcomeAction } from '../src/sports/volleyball/engine.ts';
import type { ScoreAction } from '../src/sports/types.ts';

type Side = 'home' | 'away';
/** player id → the opponent label of every line credit the action writes */
const opponents = (credits: LineCredit[]) => {
  const out: Record<string, string | undefined> = {};
  for (const c of credits) {
    if (c.playerId in out) assert.equal(out[c.playerId], c.opponent, `${c.playerId}: one label per player`);
    out[c.playerId] = c.opponent;
  }
  return out;
};

/* --------------------------------- chess --------------------------------- */
describe('SD-119 chess — each player\'s line names the OTHER player', () => {
  const names = { home: 'Kabir Rao', away: 'Meera Iyer' };
  const kabir = { id: 'kabir', fullName: 'Kabir Rao' }, meera = { id: 'meera', fullName: 'Meera Iyer' };
  const rosters: SideRosters = { home: ['kabir'], away: ['meera'] };
  const result = (winner: Side | 'draw', method?: string, dff = false): ScoreAction => ({
    type: 'RESULT', side: winner === 'draw' ? undefined : winner,
    attribution: chessResultCredit('home', kabir, winner, method, dff),
    attribution2: chessResultCredit('away', meera, winner, method, dff),
  });
  for (const r of [rosters, undefined]) {
    const how = r ? 'with rosters' : 'credit side only';
    test(`home win (${how})`, () => {
      assert.deepEqual(opponents(actionLineCredits(result('home', 'checkmate'), names, r)), { kabir: 'Meera Iyer', meera: 'Kabir Rao' });
    });
    test(`away win — the loser's line was "vs Kabir Rao" on Kabir (${how})`, () => {
      assert.deepEqual(opponents(actionLineCredits(result('away', 'resignation'), names, r)), { kabir: 'Meera Iyer', meera: 'Kabir Rao' });
    });
    test(`draw — no action side at all (${how})`, () => {
      assert.deepEqual(opponents(actionLineCredits(result('draw', 'agreement'), names, r)), { kabir: 'Meera Iyer', meera: 'Kabir Rao' });
    });
    test(`double forfeit (${how})`, () => {
      assert.deepEqual(opponents(actionLineCredits(result('draw', 'double-forfeit', true), names, r)), { kabir: 'Meera Iyer', meera: 'Kabir Rao' });
    });
    test(`forfeit win (${how})`, () => {
      assert.deepEqual(opponents(actionLineCredits(result('away', 'forfeit'), names, r)), { kabir: 'Meera Iyer', meera: 'Kabir Rao' });
    });
  }
  test('the credits themselves are unchanged (stats as before)', () => {
    const c = actionLineCredits(result('home', 'checkmate'), names, rosters);
    assert.deepEqual(c.map((x) => [x.playerId, x.stat, x.by]), [
      ['kabir', 'games', 1], ['kabir', 'wins', 1], ['kabir', 'winsMate', 1],
      ['meera', 'games', 1], ['meera', 'losses', 1],
    ]);
    assert.deepEqual(chessResultCredit('home', kabir, 'draw', null, true), { playerId: 'kabir', playerName: 'Kabir Rao', by: 1, side: 'home', stat: 'forfeitLosses' });
    assert.deepEqual(chessResultCredit('away', meera, 'home', 'forfeit', false), { playerId: 'meera', playerName: 'Meera Iyer', by: 1, side: 'away', stat: 'forfeitLosses' });
  });
});

/* ----------------------------- tennis singles ----------------------------- */
describe('SD-119 tennis singles — a double fault labels the SERVER\'s line', () => {
  const names = { home: 'Hana', away: 'Ava' };
  const ctx = { state: undefined, homeName: 'Hana', awayName: 'Ava', homeRoster: [{ id: 'h1', fullName: 'Hana' }], awayRoster: [{ id: 'a1', fullName: 'Ava' }] } as never;
  test('a point won by the home player', () => {
    const a: ScoreAction = { type: 'POINT', side: 'home', attribution: { playerId: 'h1', stat: 'points', playerName: 'Hana' } };
    assert.deepEqual(opponents(actionLineCredits(a, names)), { h1: 'Ava' });
  });
  test('double fault: point to the receiver, fault on the server — server\'s opponent is the receiver', () => {
    const [a] = tennisVoice('double fault Hana', ctx)!;
    assert.equal(a.side, 'away'); // the point
    assert.equal(a.attribution2?.side, 'home'); // the server
    assert.deepEqual(opponents(actionLineCredits(a, names)), { h1: 'Ava' });
    // the screen's double fault (tennis/index.tsx) has the same shape, and rosters alone also fix it
    const bare: ScoreAction = { type: 'POINT', side: 'away', payload: { df: true }, attribution2: { playerId: 'h1', stat: 'doubleFaults' } };
    assert.deepEqual(opponents(actionLineCredits(bare, names, { home: ['h1'], away: ['a1'] })), { h1: 'Ava' });
    // without either, the old rule (the action's side) is all there is
    assert.deepEqual(opponents(actionLineCredits(bare, names)), { h1: 'Hana' });
  });
});

/* ---------------------------- badminton doubles --------------------------- */
describe('SD-119 badminton doubles — the opposing PAIR\'s label', () => {
  const names = { home: 'Sindhu / Gopi', away: 'Saina / Jwala' };
  const rosters: SideRosters = { home: ['sin', 'gop'], away: ['sai', 'jwa'] };
  test('points by each partner, either pair', () => {
    const pts: ScoreAction[] = [
      { type: 'POINT', side: 'home', attribution: { playerId: 'sin', stat: 'points' } },
      { type: 'POINT', side: 'home', attribution: { playerId: 'gop', stat: 'points' } },
      { type: 'POINT', side: 'away', attribution: { playerId: 'sai', stat: 'points' } },
      { type: 'POINT', side: 'away', attribution: { playerId: 'jwa', stat: 'points' } },
    ];
    assert.deepEqual(opponents(pts.flatMap((a) => actionLineCredits(a, names, rosters))), {
      sin: 'Saina / Jwala', gop: 'Saina / Jwala', sai: 'Sindhu / Gopi', jwa: 'Sindhu / Gopi',
    });
  });
  test('an opponent\'s fault (attribution2, other side) via rosters', () => {
    const a: ScoreAction = { type: 'OPP_ERROR', side: 'home', attribution2: { playerId: 'jwa', stat: 'errors' } };
    assert.deepEqual(opponents(actionLineCredits(a, names, rosters)), { jwa: 'Sindhu / Gopi' });
  });
});

/* ------------------------------- team sports ------------------------------ */
describe('SD-119 team sports — the other team', () => {
  const names = { home: 'Reds', away: 'Blues' };
  test('football goal + extras: one label, the other team', () => {
    const a: ScoreAction = { type: 'GOAL', side: 'away', attribution: { playerId: 'b9', stat: 'goals', extra: { shots: 1, shotsOnTarget: 1 } } };
    const c = actionLineCredits(a, names, { home: ['r1'], away: ['b9'] });
    assert.equal(c.length, 3);
    assert.deepEqual(opponents(c), { b9: 'Reds' });
    assert.ok(c.every((x) => x.primary));
  });
  test('volleyball opponent error: the erring player is on the other side', () => {
    const a = outcomeAction('opperror', 'home', undefined, { err: 'net', by: { id: 'b4', fullName: 'Bela' } });
    assert.deepEqual(opponents(actionLineCredits(a, names)), { b4: 'Reds' });
  });
  test('kabaddi voice tackle: the tackler defends', () => {
    const ctx = { state: undefined, homeName: 'Reds', awayName: 'Blues', homeRoster: [{ id: 'r1', fullName: 'Ravi' }], awayRoster: [{ id: 'b1', fullName: 'Bhim' }] } as never;
    const [a] = kabaddiVoice('tackle Bhim', ctx)!;
    assert.equal(a.side, 'home'); // the raiding side
    assert.deepEqual(opponents(actionLineCredits(a, names)), { b1: 'Reds' });
  });
});

/* ------------------------- cricket same-side credit ------------------------ */
describe('SD-119 cricket — bowler + fielder share the FIELDING side; opponent = batting team', () => {
  const names = { home: 'Mumbai', away: 'Chennai' };
  // Mumbai bat (home): the action's side is the batting side
  const caught = wicketAttribution({
    kind: 'caught', bowler: { id: 'bowl', name: 'Bowler' }, fielder: { id: 'fld', name: 'Fielder' }, battingSide: 'home',
  });
  test('caught: both credits on the fielding side, both name the batting team', () => {
    assert.equal(caught.attribution?.side, 'away');
    assert.equal(caught.attribution2?.side, 'away');
    const a: ScoreAction = { type: 'WICKET', side: 'home', ...caught };
    assert.deepEqual(opponents(actionLineCredits(a, names)), { bowl: 'Mumbai', fld: 'Mumbai' });
  });
  test('a substitute fielder off both rosters still gets the batting team (credit side)', () => {
    const a: ScoreAction = { type: 'WICKET', side: 'home', ...caught };
    assert.deepEqual(opponents(actionLineCredits(a, names, { home: ['bat1'], away: ['bowl'] })), { bowl: 'Mumbai', fld: 'Mumbai' });
  });
  test('run out with completed runs: the fielder fields, the striker bats', () => {
    const ro = wicketAttribution({
      kind: 'runout', fielder: { id: 'fld', name: 'Fielder' }, striker: { id: 'bat1', name: 'Batter' }, runs: 2, battingSide: 'home',
    });
    const a: ScoreAction = { type: 'WICKET', side: 'home', ...ro };
    assert.deepEqual(opponents(actionLineCredits(a, names)), { fld: 'Mumbai', bat1: 'Chennai' });
  });
  test('the ball editor (no battingSide) is unchanged — no side stamped', () => {
    const c = wicketAttribution({ kind: 'caught', bowler: { id: 'bowl' }, fielder: { id: 'fld' } });
    assert.equal(c.attribution?.side, undefined);
    assert.equal(c.attribution2?.side, undefined);
  });
  test('runs off the bat: the striker\'s line names the fielding team', () => {
    const a: ScoreAction = { type: 'RUNS', side: 'home', attribution: { playerId: 'bat1', stat: 'runs', by: 4 } };
    assert.deepEqual(opponents(actionLineCredits(a, names)), { bat1: 'Chennai' });
  });
});

/* --------------------------------- golf ---------------------------------- */
describe('SD-119 golf match play — both players credited on a hole', () => {
  test('each line names the other player (golf/index.tsx credit shape)', () => {
    const names = { home: 'Aditi', away: 'Tvesa' };
    const a: ScoreAction = {
      type: 'HOLE', side: 'home',
      attribution: { playerId: 'adi', stat: 'holesWon', by: 1, extra: { birdies: 1 }, side: 'home' },
      attribution2: { playerId: 'tve', stat: 'pars', by: 1, side: 'away' },
    };
    assert.deepEqual(opponents(actionLineCredits(a, names)), { adi: 'Tvesa', tve: 'Aditi' });
  });
});

/* ------------------------------ side precedence ---------------------------- */
describe('SD-119 creditedSide — credit side > roster > action side', () => {
  test('precedence', () => {
    const r: SideRosters = { home: ['x', 'both'], away: ['y', 'both'] };
    assert.equal(creditedSide({ playerId: 'x', side: 'away' }, 'home', r), 'away');
    assert.equal(creditedSide({ playerId: 'y' }, 'home', r), 'away');
    assert.equal(creditedSide({ playerId: 'both' }, 'home', r), 'home'); // on both rosters → the action
    assert.equal(creditedSide({ playerId: 'nobody' }, undefined, r), undefined);
    assert.equal(rosterSide('both', r), undefined);
  });
  test('unknown side → no label rather than a wrong one', () => {
    const c = actionLineCredits({ type: 'RESULT', attribution: { playerId: 'q', stat: 'games' } }, { home: 'A', away: 'B' });
    assert.equal(c[0].opponent, undefined);
  });
});

/* ------------------------------ repair dry run ----------------------------- */
describe('SD-119 repairOpponents — the planner (dry-run diff)', () => {
  const names = { home: 'Kabir Rao', away: 'Meera Iyer' };
  test('a broken chess match: only the wrong labels change, to the other player', () => {
    const lines = [
      { id: 'l1', playerId: 'kabir', opponent: 'Kabir Rao' }, // self
      { id: 'l2', playerId: 'meera', opponent: 'Kabir Rao' }, // right
      { id: 'l3', playerId: 'ghost', opponent: 'Kabir Rao' }, // side unknown → left alone
    ];
    const sideOf = matchSideOf({ rosters: { home: ['kabir'], away: ['meera'] } });
    const { writes, unknown } = planOpponentRepair(lines, sideOf, names);
    assert.deepEqual(writes, [{ id: 'l1', playerId: 'kabir', from: 'Kabir Rao', to: 'Meera Iyer' }]);
    assert.equal(unknown, 1);
    // idempotent: applied, a second plan is empty
    const fixed = lines.map((l) => ({ ...l, opponent: writes.find((w) => w.id === l.id)?.to ?? l.opponent }));
    assert.deepEqual(planOpponentRepair(fixed, sideOf, names).writes, []);
  });
  test('a missing label is filled; same-named teams are skipped entirely', () => {
    const sideOf = matchSideOf({ rosters: { home: ['a'], away: ['b'] } });
    assert.deepEqual(planOpponentRepair([{ id: 'l', playerId: 'b', opponent: null }], sideOf, { home: 'X', away: 'Y' }).writes,
      [{ id: 'l', playerId: 'b', from: null, to: 'X' }]);
    assert.deepEqual(planOpponentRepair([{ id: 'l', playerId: 'b', opponent: 'X' }], sideOf, { home: 'X', away: 'X' }), { writes: [], unknown: 1 });
  });
  test('side sources: totals > squad / lineup > roster; disputes mapped; both-sides falls through', () => {
    const sideOf = matchSideOf({
      totals: { t1: { side: 'away' }, old: { side: 'home' } },
      squads: { home: { starters: ['t1', 's1'], subs: [] }, away: { starters: ['s2'], subs: [] } },
      lineup: { home: [{ playerId: 'lu1' }], away: [] },
      rosters: { home: ['s2', 'r1', 'dup'], away: ['dup'] },
      mapId: (id) => (id === 'old' ? 'new' : id),
    });
    assert.equal(sideOf('t1'), 'away'); // totals beat the squad
    assert.equal(sideOf('s2'), 'away'); // squad beats the roster
    assert.equal(sideOf('lu1'), 'home');
    assert.equal(sideOf('r1'), 'home');
    assert.equal(sideOf('new'), 'home'); // the disputed player's line moved to 'new'
    assert.equal(sideOf('dup'), undefined);
  });
  test('cricket: a bowler wrongly labelled with their own team is fixed from the totals', () => {
    const names2 = { home: 'Mumbai', away: 'Chennai' };
    const sideOf = matchSideOf({ totals: { bat1: { side: 'home' }, bowl: { side: 'away' }, fld: { side: 'away' } } });
    const { writes } = planOpponentRepair([
      { id: 'a', playerId: 'bat1', opponent: 'Chennai' },
      { id: 'b', playerId: 'bowl', opponent: 'Chennai' }, // was the batting side's opponent
      { id: 'c', playerId: 'fld', opponent: 'Mumbai' },
    ], sideOf, names2);
    assert.deepEqual(writes, [{ id: 'b', playerId: 'bowl', from: 'Chennai', to: 'Mumbai' }]);
  });
});
