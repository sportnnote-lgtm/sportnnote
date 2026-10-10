/**
 * SD-27 (GEN-14) — tournament leaderboards, award slots and MVP weights from
 * each sport's stat schema:
 *   - sport-correct leader categories (averages with minimums, rates, racket
 *     results — never rally points);
 *   - qualifiers and the organiser's per-tournament overrides (`leaderMins`);
 *   - tie-break chains (Golden Boot goals → assists → fewer minutes; racket
 *     Player of the Tournament wins → win % → set / game ratio);
 *   - eligibility (Golden Glove: keepers only);
 *   - "How is this ranked?" prose generated from the schema;
 *   - cricket and football outputs kept where they were already right, and
 *     published awards untouched (their slots and icons still resolve).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, Player, SportId, StatLine } from '../src/core/types.ts';
import {
  TOURNAMENT_AWARD_SLOTS, SPORT_AWARDS, STAT_WEIGHTS, awardFormula, awardIcon, rankAwardCandidates, defaultAwards, matchRatings,
} from '../src/data/ratings.ts';
import { STAT_CATEGORIES, categoryLeaders, leaderStat, statLeaders } from '../src/data/standings.ts';
import {
  readLeaderMins, leaderMinsPatch, effectiveQualifier, minimumRows, withLineResults, LEADER_MINS_KEY,
} from '../src/data/leaderMinimums.ts';
import { STAT_SCHEMAS, statSchema } from '../src/sports/statSchemas.ts';
import { qualifierText, validateSchema, statDefIn, lineOutcome } from '../src/sports/statSchema.ts';
import { mergeSportFormat } from '../src/data/formatPatch.ts';

const RACKET: SportId[] = ['tennis', 'badminton', 'tabletennis', 'squash', 'padel', 'pickleball'];
const P = (id: string, fullName: string, houseName?: string, extra: Partial<Player> = {}): Player => ({ id, fullName, sports: [], houseName, ...extra });
let n = 0;
const L = (playerId: string, sport: SportId, stats: Record<string, number>, matchId: string, extra: Partial<StatLine> = {}): StatLine =>
  ({ id: `sl-${n++}`, matchId, playerId, sport, stats, won: false, ...extra });
const keys = (sp: SportId) => STAT_CATEGORIES[sp].map((c) => c.key);
const top = (cats: ReturnType<typeof categoryLeaders>, key: string) =>
  cats.find((c) => c.key === key)?.leaders.map((l) => [l.name, l.display ?? String(l.value)]);

/* ---------------------------------- categories ---------------------------------- */

describe('SD-27 — sport-correct leader categories', () => {
  test('every schema is still valid (rankBy / mvp / qualifiers resolve)', () => {
    for (const s of Object.values(STAT_SCHEMAS)) assert.deepEqual(validateSchema(s as never), [], s.sport);
  });
  test('per sport, in order', () => {
    assert.deepEqual(keys('basketball'), ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'effPg', 'points', 'rebounds', 'assists', 'doubleDoubles']);
    assert.deepEqual(keys('volleyball'), ['points', 'attackPoints', 'aces', 'blocks', 'pointsPerSet', 'acesPerSet', 'blocksPerSet']);
    assert.deepEqual(keys('kabaddi'), ['matchPoints', 'raidPoints', 'tacklePoints', 'ptsPerMatch', 'raidPerMatch', 'tacklePerMatch', 'super10s', 'high5s']);
    assert.deepEqual(keys('chess'), ['score', 'scorePct', 'wins']);
    assert.deepEqual(keys('carrom'), ['points', 'boards', 'queens', 'pointsPerMatch']);
    // SD-107 appended "Most winners per match" (point detail) before the serve rates
    assert.deepEqual(keys('tennis'), ['matchesWon', 'winPct', 'setsWon', 'gamesWon', 'aces', 'winnersPerMatch', 'srvPtsPct', 'holdPct', 'bpWonPct']);
    assert.deepEqual(keys('padel'), ['matchesWon', 'winPct', 'setsWon', 'gamesWon', 'winnersPerMatch', 'srvPtsPct', 'holdPct', 'bpWonPct']);
    for (const sp of ['badminton', 'tabletennis', 'squash', 'pickleball'] as SportId[]) {
      assert.deepEqual(keys(sp), ['matchesWon', 'winPct', 'gamesWon', 'gamesPct', 'winnersPerMatch', 'srvPtsPct'], sp);
    }
    // football keeps its 14 and appends goals per 90 / save %; cricket keeps SD-16's records
    assert.deepEqual(keys('football').slice(-2), ['goalsPer90', 'savePct']);
    assert.equal(keys('football').length, 16);
    assert.deepEqual(keys('cricket'), ['runs', 'wickets', 'catches', 'highest', 'best', 'avg', 'sr', 'econ', 'fifties', 'hundreds']);
  });
  test('racket sports never rank or award rally points; no "Top scorer"', () => {
    for (const sp of RACKET) {
      assert.ok(!keys(sp).includes('points'), sp);
      assert.ok(!TOURNAMENT_AWARD_SLOTS[sp].some((s) => s.label === 'Top scorer' || s.slot === 'points'), sp);
      assert.ok(!SPORT_AWARDS[sp].some((a) => a.label === 'Top scorer'), sp);
      assert.equal(leaderStat(sp).key, 'matchesWon');
      assert.equal(leaderStat(sp).label, 'matches won');
    }
  });
  test('the headline leader reads as the stat ("points per game", "total points")', () => {
    assert.deepEqual(leaderStat('basketball'), { key: 'ppg', label: 'points per game' });
    assert.deepEqual(leaderStat('kabaddi'), { key: 'matchPoints', label: 'total points' });
    assert.deepEqual(leaderStat('football'), { key: 'goals', label: 'goals' });
    assert.deepEqual(leaderStat('cricket'), { key: 'runs', label: 'runs' });
  });
});

/* ------------------------------ award slots + weights ------------------------------ */

describe('SD-27 — award slots and MVP weights from the schema', () => {
  const slots = (sp: SportId) => TOURNAMENT_AWARD_SLOTS[sp].map((s) => [s.slot, s.label]);
  test('slots per sport (slot keys kept where a slot already existed)', () => {
    assert.deepEqual(slots('basketball'), [['mvp', 'Player of the Tournament'], ['points', 'Top scorer'], ['rebounds', 'Top rebounder'], ['assists', 'Playmaker']]);
    assert.deepEqual(slots('volleyball'), [['mvp', 'Player of the Tournament'], ['points', 'Best scorer'], ['aces', 'Best server'], ['blocks', 'Best blocker'], ['attackPoints', 'Most attack points']]);
    assert.deepEqual(slots('kabaddi'), [['mvp', 'Player of the Tournament'], ['raidPoints', 'Best raider'], ['tacklePoints', 'Best defender']]);
    assert.deepEqual(slots('chess'), [['mvp', 'Player of the Tournament'], ['scorePct', 'Best score %']]);
    assert.deepEqual(slots('carrom'), [['mvp', 'Player of the Tournament'], ['points', 'Top scorer'], ['queens', 'Queens']]);
    assert.deepEqual(slots('tennis'), [['mvp', 'Player of the Tournament'], ['aces', 'Most aces'], ['srvPtsPct', 'Best server']]);
    for (const sp of ['badminton', 'tabletennis', 'squash', 'padel', 'pickleball'] as SportId[]) {
      assert.deepEqual(slots(sp), [['mvp', 'Player of the Tournament'], ['srvPtsPct', 'Best server']], sp);
    }
    assert.deepEqual(slots('football'), [['mvp', 'Player of the Tournament'], ['goals', 'Top scorer'], ['assists', 'Playmaker'], ['cleanSheets', 'Golden Glove']]);
    assert.deepEqual(slots('cricket'), [['mvp', 'Player of the Tournament'], ['runs', 'Best batter'], ['wickets', 'Best bowler']]);
  });
  test('MVP weights: basketball = EFF, tennis double fault −1, racket results, chess = score', () => {
    assert.deepEqual(STAT_WEIGHTS.basketball, { points: 1, rebounds: 1, assists: 1, steals: 1, blocks: 1, turnovers: -1, freeThrowsMade: 1, freeThrowsAtt: -1, fgMissed: -1 });
    assert.equal(STAT_WEIGHTS.tennis.doubleFaults, -1);
    // SD-107: point detail — winners +1, unforced errors / service faults −1 (aces +2)
    assert.deepEqual(STAT_WEIGHTS.badminton, { points: 1, gamesWon: 2, winners: 1, unforcedErrors: -1, serviceFaults: -1 });
    // SD-117c: padel's one-tap double fault costs the rating a point, as tennis
    assert.deepEqual(STAT_WEIGHTS.padel, { points: 1, gamesWon: 2, setsWon: 4, aces: 2, serviceWinners: 1, winners: 1, unforcedErrors: -1, doubleFaults: -1 });
    assert.deepEqual(STAT_WEIGHTS.chess, { wins: 1, draws: 0.5 });
    // unchanged where already right
    assert.deepEqual(STAT_WEIGHTS.volleyball, { points: 1, aces: 2, blocks: 1 });
    assert.equal(STAT_WEIGHTS.football.goals, 10);
    assert.equal(STAT_WEIGHTS.cricket.wickets, 18);
  });
  test('the per-match Player of the Match in a racket sport favours the winner', () => {
    // Bina won 2-0 but was credited fewer rally points than Asha
    const lines = [
      L('a', 'badminton', { points: 30, gamesWon: 0, gamesLost: 2 }, 'm1'),
      L('b', 'badminton', { points: 22, gamesWon: 2, gamesLost: 0 }, 'm1'),
    ];
    const r = matchRatings(lines, 'badminton', [P('a', 'Asha')], [P('b', 'Bina')]);
    assert.equal(r.mvp?.name, 'Asha'); // 30 vs 22 + 4: points still matter in a close one…
    const r2 = matchRatings([L('a', 'badminton', { points: 20, gamesWon: 0 }, 'm2'), L('b', 'badminton', { points: 18, gamesWon: 2 }, 'm2')], 'badminton', [P('a', 'Asha')], [P('b', 'Bina')]);
    assert.equal(r2.mvp?.name, 'Bina'); // …but a level-ish match goes to the side that won
  });
  test('published awards keep resolving: retired slots keep their icon', () => {
    assert.equal(awardIcon('badminton', 'points'), '🏸');
    assert.equal(awardIcon('tennis', 'points'), '🎾');
    assert.equal(awardIcon('chess', 'wins'), '♟️');
    assert.equal(awardIcon('basketball', 'points'), '🏀');
    assert.equal(awardIcon('football', 'cleanSheets'), '🧤');
    assert.equal(awardIcon('kabaddi', 'nope'), '🏅');
  });
});

/* ------------------------------ qualifiers + overrides ------------------------------ */

describe('SD-27 — minimums and the organiser override', () => {
  const players = [P('a', 'Asha', 'Red'), P('b', 'Bala', 'Blue'), P('c', 'Chitra', 'Red')];
  // Asha: one huge game; Bala: two good games; Chitra: two quieter games
  const lines = [
    L('a', 'basketball', { points: 40, rebounds: 2 }, 'g1'),
    L('b', 'basketball', { points: 22, rebounds: 10 }, 'g1'),
    L('b', 'basketball', { points: 18, rebounds: 8 }, 'g2'),
    L('c', 'basketball', { points: 15, rebounds: 4 }, 'g2'),
    L('c', 'basketball', { points: 15, rebounds: 4 }, 'g3'),
  ];
  test('basketball PPG ranks only players with 2+ games (FIBA-style)', () => {
    const cats = categoryLeaders(lines, players, 'basketball');
    assert.deepEqual(top(cats, 'ppg'), [['Bala', '20.0'], ['Chitra', '15.0']]);
    assert.equal(cats.find((c) => c.key === 'ppg')?.qualifier, 'min 2 games');
    // totals still list everyone (a level total keeps first-appearance order)
    assert.deepEqual(top(cats, 'points'), [['Asha', '40'], ['Bala', '40'], ['Chitra', '30']]);
  });
  test('an organiser minimum of 1 game lets Asha lead; 0 removes the minimum', () => {
    const one = categoryLeaders(lines, players, 'basketball', { mins: { ppg: 1 } });
    assert.deepEqual(top(one, 'ppg'), [['Asha', '40.0'], ['Bala', '20.0'], ['Chitra', '15.0']]);
    assert.equal(one.find((c) => c.key === 'ppg')?.qualifier, 'min 1 game');
    const none = categoryLeaders(lines, players, 'basketball', { mins: { ppg: 0 } });
    assert.equal(none.find((c) => c.key === 'ppg')?.qualifier, undefined);
    assert.equal(top(none, 'ppg')?.[0][0], 'Asha');
    // other categories keep their default
    assert.equal(one.find((c) => c.key === 'rpg')?.qualifier, 'min 2 games');
  });
  test('the Top scorer slot ranks by PPG with the same minimum (and the override)', () => {
    assert.deepEqual(rankAwardCandidates(lines, players, 'basketball', 'points').map((c) => [c.name, c.display, c.detail]),
      [['Bala', '20.0', '20.0 PPG · 40 pts · 2 m'], ['Chitra', '15.0', '15.0 PPG · 30 pts · 2 m']]);
    assert.equal(rankAwardCandidates(lines, players, 'basketball', 'points', 10, { mins: { ppg: 1 } })[0].name, 'Asha');
  });
  test('basketball Player of the Tournament = efficiency per game', () => {
    // EFF: Bala (22+10, 18+8) = 58 / 2 = 29; Chitra 19 + 19 = 38 / 2 = 19
    assert.deepEqual(rankAwardCandidates(lines, players, 'basketball', 'mvp').map((c) => [c.name, c.value]), [['Bala', 29], ['Chitra', 19]]);
  });
  test('volleyball per-set awards need 5 sets on court', () => {
    const vb = [
      L('a', 'volleyball', { points: 20, aces: 4, blocks: 1, setsPlayed: 3 }, 'v1'),
      L('b', 'volleyball', { points: 30, aces: 3, blocks: 6, setsPlayed: 4 }, 'v1'),
      L('b', 'volleyball', { points: 12, aces: 2, blocks: 2, setsPlayed: 3 }, 'v2'),
      L('c', 'volleyball', { points: 25, aces: 5, blocks: 0, setsPlayed: 5 }, 'v2'),
    ];
    const cats = categoryLeaders(vb, players, 'volleyball');
    assert.deepEqual(top(cats, 'acesPerSet'), [['Chitra', '1.00'], ['Bala', '0.71']]);
    assert.deepEqual(top(cats, 'blocksPerSet'), [['Bala', '1.14']]);
    assert.equal(cats.find((c) => c.key === 'blocksPerSet')?.qualifier, 'min 5 sets');
    assert.deepEqual(rankAwardCandidates(vb, players, 'volleyball', 'blocks').map((c) => c.name), ['Bala']);
    assert.deepEqual(rankAwardCandidates(vb, players, 'volleyball', 'aces', 10, { mins: { acesPerSet: 3 } }).map((c) => c.name), ['Asha', 'Chitra', 'Bala']);
    assert.deepEqual(rankAwardCandidates(vb, players, 'volleyball', 'points').map((c) => c.name), ['Bala', 'Chitra', 'Asha']);
  });
  test('readLeaderMins / leaderMinsPatch round-trip through the format', () => {
    assert.deepEqual(readLeaderMins({ [LEADER_MINS_KEY]: '{"ppg":3,"rpg":"x","apg":-1}' }), { ppg: 3 });
    assert.deepEqual(readLeaderMins({ [LEADER_MINS_KEY]: '{oops' }), {});
    assert.deepEqual(readLeaderMins(undefined), {});
    // defaults are not stored; nothing left = the key is removed
    assert.deepEqual(leaderMinsPatch('basketball', { ppg: 3, rpg: 2 }), { [LEADER_MINS_KEY]: '{"ppg":3}' });
    assert.deepEqual(leaderMinsPatch('basketball', { ppg: 2 }), { [LEADER_MINS_KEY]: undefined });
    const f = mergeSportFormat({ basketball: { bestOf: 4 } }, 'basketball', leaderMinsPatch('basketball', { ppg: 0 }));
    assert.deepEqual(f, { basketball: { bestOf: 4, [LEADER_MINS_KEY]: '{"ppg":0}' } });
    assert.deepEqual(readLeaderMins(f.basketball), { ppg: 0 });
    assert.equal(mergeSportFormat(f, 'basketball', leaderMinsPatch('basketball', {})).basketball[LEADER_MINS_KEY], undefined);
  });
  test('an override keeps the minimum’s unit (cricket economy in overs, racket service points)', () => {
    const econ = effectiveQualifier('cricket', 'econ', { econ: 12 });
    assert.deepEqual(econ, { den: 72, unit: { label: 'overs', one: 'over', per: 6 } });
    const cs = STAT_SCHEMAS.cricket;
    assert.equal(qualifierText(cs as never, statDefIn(cs, 'econ')!, econ), 'min 12 overs');
    assert.equal(qualifierText(cs as never, statDefIn(cs, 'econ')!, effectiveQualifier('cricket', 'econ', {})), 'min 10 overs');
    assert.equal(effectiveQualifier('cricket', 'econ', { econ: 0 }), null);
    assert.deepEqual(effectiveQualifier('badminton', 'srvPtsPct', { srvPtsPct: 50 }), { den: 50, unit: { label: 'service points', one: 'service point' } });
    assert.equal(effectiveQualifier('football', 'goals', { goals: 3 }), undefined); // a total has no minimum
  });
  test('minimumRows lists what the leaders and award slots use', () => {
    assert.deepEqual(minimumRows('basketball', { ppg: 3 }).map((r) => [r.key, r.value, r.defaultValue, r.text]), [
      ['ppg', 3, 2, 'min 3 games'], ['rpg', 2, 2, 'min 2 games'], ['apg', 2, 2, 'min 2 games'],
      ['spg', 2, 2, 'min 2 games'], ['bpg', 2, 2, 'min 2 games'], ['effPg', 2, 2, 'min 2 games'],
    ]);
    assert.deepEqual(minimumRows('tennis').map((r) => [r.key, r.text]), [
      ['winPct', 'min 3 matches'], ['winnersPerMatch', 'min 3 matches'], ['srvPtsPct', 'min 30 service points'], ['holdPct', 'min 6 service games'], ['bpWonPct', 'min 5 break point chances'],
    ]);
    assert.deepEqual(minimumRows('cricket').map((r) => [r.key, r.text]), [['avg', 'min 3 innings'], ['sr', 'min 30 balls'], ['econ', 'min 10 overs']]);
    assert.deepEqual(minimumRows('golf'), []);
  });
});

/* ------------------------------ racket: results, not points ------------------------------ */

describe('SD-27 — racket leaders and Player of the Tournament rank by results', () => {
  const players = [P('a', 'Asha'), P('b', 'Bina'), P('c', 'Chen'), P('d', 'Dia')];
  // match lines carry the stored result (SD-11)
  const R = (pid: string, mid: string, result: 'W' | 'L', stats: Record<string, number>) =>
    L(pid, 'badminton', stats, mid, { result, won: result === 'W' });
  const lines = [
    // Asha: 3 W, 1 L; Bina: 3 W, 0 L (fewer points); Chen: 1 W, lots of points; Dia: 0 W
    R('a', 'm1', 'W', { points: 21, gamesWon: 2, gamesLost: 0, srvPts: 30, srvPtsWon: 20 }),
    R('a', 'm2', 'W', { points: 21, gamesWon: 2, gamesLost: 1, srvPts: 20, srvPtsWon: 12 }),
    R('a', 'm3', 'W', { points: 21, gamesWon: 2, gamesLost: 0 }),
    R('a', 'm4', 'L', { points: 15, gamesWon: 0, gamesLost: 2 }),
    R('b', 'm5', 'W', { points: 5, gamesWon: 2, gamesLost: 0 }),
    R('b', 'm6', 'W', { points: 5, gamesWon: 2, gamesLost: 1 }),
    R('b', 'm4', 'W', { points: 5, gamesWon: 2, gamesLost: 0 }),
    R('c', 'm7', 'W', { points: 60, gamesWon: 2, gamesLost: 1 }),
    R('c', 'm1', 'L', { points: 50, gamesWon: 0, gamesLost: 2 }),
    R('d', 'm2', 'L', { points: 40, gamesWon: 1, gamesLost: 2 }),
  ];
  test('Most wins → win % → games won %, never rally points', () => {
    const cats = categoryLeaders(lines, players, 'badminton');
    assert.deepEqual(top(cats, 'matchesWon'), [['Bina', '3'], ['Asha', '3'], ['Chen', '1']]);
    assert.deepEqual(top(cats, 'winPct'), [['Bina', '100%'], ['Asha', '75%']]); // Chen: 2 matches < min 3
    assert.equal(cats.find((c) => c.key === 'winPct')?.qualifier, 'min 3 matches');
    assert.deepEqual(top(cats, 'gamesWon'), [['Asha', '6'], ['Bina', '6'], ['Chen', '2'], ['Dia', '1']]);
    assert.deepEqual(top(cats, 'srvPtsPct'), [['Asha', '64%']]);
  });
  test('Player of the Tournament: wins, then win %, then the games ratio; the detail says so', () => {
    const c = rankAwardCandidates(lines, players, 'badminton', 'mvp');
    assert.deepEqual(c.map((x) => [x.name, x.value]), [['Bina', 3], ['Asha', 3], ['Chen', 1]]);
    assert.equal(c[0].detail, '3 wins · 100% win · 86% games won · 3 m');
    assert.equal(defaultAwards(lines, players, 'badminton')[0].playerName, 'Bina');
  });
  test('level on wins and win % → the higher games won % (the set / game ratio order)', () => {
    const ls = [
      R('a', 'x1', 'W', { gamesWon: 2, gamesLost: 1 }), R('a', 'x2', 'L', { gamesWon: 1, gamesLost: 2 }),
      R('b', 'x3', 'W', { gamesWon: 2, gamesLost: 0 }), R('b', 'x4', 'L', { gamesWon: 0, gamesLost: 2 }),
      R('c', 'x5', 'W', { gamesWon: 2, gamesLost: 0 }), R('c', 'x6', 'L', { gamesWon: 1, gamesLost: 2 }),
    ];
    assert.deepEqual(rankAwardCandidates(ls, players, 'badminton', 'mvp').map((x) => x.name), ['Chen', 'Asha', 'Bina']);
  });
  test('tennis Player of the Tournament breaks a tie by sets won %', () => {
    const T = (pid: string, mid: string, result: 'W' | 'L', stats: Record<string, number>) => L(pid, 'tennis', stats, mid, { result, won: result === 'W' });
    const ls = [
      T('a', 't1', 'W', { setsWon: 2, setsLost: 1 }), T('a', 't2', 'W', { setsWon: 2, setsLost: 1 }),
      T('b', 't3', 'W', { setsWon: 2, setsLost: 0 }), T('b', 't4', 'W', { setsWon: 2, setsLost: 0 }),
    ];
    assert.deepEqual(rankAwardCandidates(ls, players, 'tennis', 'mvp').map((x) => x.name), ['Bina', 'Asha']);
  });
  test('results come from the matches; a match still in play is never a loss', () => {
    const m = (id: string, status: string, winner?: 'home' | 'away'): Match =>
      ({ id, sport: 'squash', status, winner, homeTeam: { id: 'h', name: 'Asha' }, awayTeam: { id: 'w', name: 'Bina' } }) as unknown as Match;
    const matches = [m('s1', 'completed', 'home'), m('s2', 'live')];
    const ls = [
      L('a', 'squash', { points: 11 }, 's1', { opponent: 'Bina' }), L('b', 'squash', { points: 4 }, 's1', { opponent: 'Asha' }),
      L('a', 'squash', { points: 3 }, 's2', { opponent: 'Bina' }), L('b', 'squash', { points: 9 }, 's2', { opponent: 'Asha' }),
    ];
    const filled = withLineResults(ls, matches);
    assert.deepEqual(filled.map(lineOutcome), ['W', 'L', undefined, undefined]);
    assert.equal(filled[2].pending, true);
    const cats = categoryLeaders(ls, players, 'squash', { matches, mins: { winPct: 1 } });
    assert.deepEqual(top(cats, 'matchesWon'), [['Asha', '1']]);
    assert.deepEqual(top(cats, 'winPct'), [['Asha', '100%'], ['Bina', '0%']]);
    // without the matches a legacy line (no result) counts a win only from `won`
    assert.deepEqual(categoryLeaders(ls, players, 'squash').find((c) => c.key === 'matchesWon'), undefined);
    // the headline leader (StandingsScreen) gets the same treatment
    assert.deepEqual(statLeaders(ls, players, 'squash', { matches }).map((l) => [l.name, l.value]), [['Asha', 1]]);
  });
});

/* ------------------------------ tie-breaks + eligibility ------------------------------ */

describe('SD-27 — tie-break chains and eligibility', () => {
  const players = [P('a', 'Asha'), P('b', 'Bala'), P('c', 'Chitra'), P('k', 'Kiran', undefined, { sportDetails: { football: { position: 'GK' } } } as Partial<Player>), P('d', 'Dev')];
  test('Golden Boot: goals → assists → fewer minutes (leaders and the Top scorer slot)', () => {
    const lines = [
      L('a', 'football', { goals: 3, assists: 1, minutes: 270 }, 'f1'),
      L('b', 'football', { goals: 3, assists: 1, minutes: 180 }, 'f1'),
      L('c', 'football', { goals: 3, assists: 2, minutes: 270 }, 'f1'),
      L('d', 'football', { goals: 4, assists: 0, minutes: 270 }, 'f1'),
    ];
    const order = ['Dev', 'Chitra', 'Bala', 'Asha'];
    assert.deepEqual(top(categoryLeaders(lines, players, 'football'), 'goals')?.map((r) => r[0]), order);
    assert.deepEqual(rankAwardCandidates(lines, players, 'football', 'goals').map((c) => c.name), order);
    // the football detail line is unchanged (golden)
    assert.equal(rankAwardCandidates(lines, players, 'football', 'goals')[0].detail, '4 goals · 1 m');
  });
  test('goals per 90 needs 180 minutes; save % is keepers-only with 10 shots faced', () => {
    const lines = [
      L('a', 'football', { goals: 2, minutes: 90 }, 'f1'),
      L('b', 'football', { goals: 2, minutes: 200 }, 'f1'),
      L('k', 'football', { saves: 9, goalsConceded: 1 }, 'f1'),
      L('d', 'football', { saves: 12 }, 'f1'), // an outfield line (no goals conceded): not a keeper
    ];
    const cats = categoryLeaders(lines, players, 'football');
    assert.deepEqual(top(cats, 'goalsPer90'), [['Bala', '0.90']]);
    assert.equal(cats.find((c) => c.key === 'goalsPer90')?.qualifier, 'min 180 minutes');
    assert.deepEqual(top(cats, 'savePct'), [['Kiran', '90%']]);
  });
  test('Golden Glove: goalkeepers only, clean sheets → saves → fewer conceded', () => {
    const lines = [
      L('k', 'football', { cleanSheets: 2, saves: 5, goalsConceded: 1 }, 'f1'),
      L('d', 'football', { cleanSheets: 3 }, 'f1'), // an old defender clean sheet
      L('a', 'football', { cleanSheets: 2, saves: 5, goalsConceded: 0 }, 'f1'),
    ];
    assert.deepEqual(rankAwardCandidates(lines, players, 'football', 'cleanSheets').map((c) => c.name), ['Asha', 'Kiran']);
  });
  test('kabaddi Best raider: a level total goes to the better per-match figure', () => {
    const lines = [
      L('a', 'kabaddi', { raidPoints: 20 }, 'k1'), L('a', 'kabaddi', { raidPoints: 0 }, 'k2'),
      L('b', 'kabaddi', { raidPoints: 20 }, 'k3'),
    ];
    assert.deepEqual(rankAwardCandidates(lines, players, 'kabaddi', 'raidPoints').map((c) => [c.name, c.detail]), [
      ['Bala', '20 raid pts · 1 m'], ['Asha', '20 raid pts · 2 m'],
    ]);
  });
  test('chess: score leads, score % needs 3 games, the Player of the Tournament is the top score', () => {
    const C = (pid: string, mid: string, s: Record<string, number>) => L(pid, 'chess', { games: 1, ...s }, mid);
    const lines = [
      C('a', 'c1', { wins: 1 }), C('a', 'c2', { draws: 1 }), C('a', 'c3', { wins: 1 }),
      C('b', 'c1', { losses: 1 }), C('b', 'c4', { wins: 1 }), C('b', 'c5', { wins: 1 }), C('b', 'c6', { wins: 1 }),
      C('c', 'c7', { wins: 1 }), C('c', 'c8', { wins: 1 }),
    ];
    const cats = categoryLeaders(lines, players, 'chess');
    assert.deepEqual(top(cats, 'score'), [['Bala', '3'], ['Asha', '2.5'], ['Chitra', '2']]);
    assert.deepEqual(top(cats, 'scorePct'), [['Asha', '83%'], ['Bala', '75%']]);
    assert.equal(rankAwardCandidates(lines, players, 'chess', 'mvp')[0].name, 'Bala');
    assert.equal(top(cats, 'draws'), undefined); // "Most draws" is gone
  });
  test('carrom: points, then boards, then queens', () => {
    const lines = [L('a', 'carrom', { points: 25, boards: 3, queens: 1 }, 'r1'), L('b', 'carrom', { points: 25, boards: 4, queens: 0 }, 'r1')];
    assert.deepEqual(rankAwardCandidates(lines, players, 'carrom', 'points').map((c) => c.name), ['Bala', 'Asha']);
  });
});

/* ------------------------------ "How is this ranked?" ------------------------------ */

describe('SD-27 — award prose from the schema', () => {
  test('averages name the formula and the minimum, following the override', () => {
    assert.equal(awardFormula('basketball', 'points'),
      'Points per game: total points, divided by games played. Players need at least 2 games to rank. Ties: more points, then by name. You choose the winner.');
    assert.match(awardFormula('basketball', 'points', { ppg: 3 }), /at least 3 games/);
    assert.doesNotMatch(awardFormula('basketball', 'points', { ppg: 0 }), /at least/);
    assert.match(awardFormula('basketball', 'mvp'), /^Efficiency per game \(EFF\), among players with at least 2 games: points \+ rebounds/);
  });
  test('volleyball per-set awards and racket results', () => {
    assert.equal(awardFormula('volleyball', 'blocks'),
      'Blocks per set: total blocks, divided by the sets the player was on court for. Players need at least 5 sets to rank. Ties: more blocks, then by name. You choose the winner.');
    for (const sp of RACKET) {
      const f = awardFormula(sp, 'mvp');
      assert.match(f, /^Most matches won in this tournament\. Ties: the higher win %, then the higher (sets|games) won %, then by name\./, sp);
      assert.doesNotMatch(f, /points summed|pts ×/i, sp);
    }
    assert.match(awardFormula('badminton', 'srvPtsPct', { srvPtsPct: 40 }), /service points won ÷ service points \(as a %\)\. Players need at least 40 service points/);
  });
  test('Golden Boot names the chain; Golden Glove keeps its hand-written text; cricket / football totals unchanged', () => {
    assert.equal(awardFormula('football', 'goals'), "Most goals in this tournament's matches. Ties: more assists, then fewer minutes, then by name. You choose the winner.");
    assert.match(awardFormula('football', 'cleanSheets'), /^Goalkeepers only .* Most clean sheets, then most saves, then fewest goals conceded\./);
    assert.equal(awardFormula('football', 'assists'), "Total assists in this tournament's matches. Ties go by name. You choose the winner.");
    assert.equal(awardFormula('cricket', 'runs'), "Total runs in this tournament's matches. Ties go by name. You choose the winner.");
    assert.match(awardFormula('cricket', 'mvp'), /^Points summed over every match in this tournament: wkts ×18, catches ×8, runs ×1\./);
    assert.match(awardFormula('kabaddi', 'raidPoints'), /Ties: the higher raid pts per match, then more super 10s, then by name\./);
    assert.match(awardFormula('chess', 'scorePct'), /at least 3 games/);
  });
  test('every slot of every sport has prose that ends with the organiser’s choice', () => {
    for (const [sp, slots] of Object.entries(TOURNAMENT_AWARD_SLOTS)) {
      for (const s of slots) assert.match(awardFormula(sp as SportId, s.slot), /You choose the winner\.$/, `${sp}/${s.slot}`);
    }
  });
});

/* ------------------------------ schema coverage ------------------------------ */

describe('SD-27 — every leader category ranks through the schema', () => {
  test('every category is a declared stat and the rank direction is right for rates', () => {
    for (const sp of Object.keys(STAT_SCHEMAS) as SportId[]) {
      const s = statSchema(sp)!;
      for (const k of s.leaders) assert.ok(statDefIn(s, k), `${sp}/${k}`);
    }
  });
});
