/**
 * SD-24 (GEN-11) — the shared career framework: every sport but golf renders
 * a sectioned career from its stat schema (SD-15) through the SD-16 aggregate
 * engine; rows nobody tracked are hidden (D8); the racket career (match-play
 * W-L and won %, serve / return rates, singles / doubles W-L, per-partner
 * record paired by match + side); titles / finals from knockout finals; best
 * winning run; history key stats (no zero / record keys, correct plurals);
 * the Win % tile; SD-25 filters re-run every section; cricket unchanged.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, SportId, StatLine, Team } from '../src/core/types.ts';
import {
  careerSections, recordFigure, winPctText, tileValueIsLong, bestWinRun, titlesAndFinals,
  disciplineRecords, partnerRecords, doublesMatchIds, historyStats, wlText,
} from '../src/data/career.ts';
import { contextsFor, filterLines } from '../src/data/lineContext.ts';
import { careerFromSchema, validateSchema } from '../src/sports/statSchema.ts';
import { STAT_SCHEMAS, STAT_SPORTS, statSchema } from '../src/sports/statSchemas.ts';
import { aggregate } from '../src/data/stats.ts';

const team = (id: string, name: string, sport: SportId, roster?: string[]): Team => ({ id, name, shortName: name.slice(0, 3), sport, roster });
let mseq = 0;
const M = (sport: SportId, o: Partial<Match> & { home?: Team; away?: Team } = {}): Match => {
  mseq += 1;
  const { home, away, ...rest } = o;
  return {
    id: `m${mseq}`, sport, status: 'completed', startsAt: `2026-05-${String(mseq % 28 + 1).padStart(2, '0')}T10:00:00Z`,
    homeTeam: home ?? team('h', 'Reds', sport), awayTeam: away ?? team('a', 'Blues', sport), state: {}, ...rest,
  } as Match;
};
let lseq = 0;
/** a line for `playerId` on `side` of match `m` (opponent label = the other side) */
const L = (m: Match, stats: Record<string, number>, extra: Partial<StatLine> & { side?: 'home' | 'away' } = {}): StatLine => {
  lseq += 1;
  const { side = 'home', ...rest } = extra;
  return {
    id: `l${lseq}`, matchId: m.id, playerId: 'p1', sport: m.sport, stats, won: rest.result === 'W', result: 'W',
    opponent: side === 'home' ? m.awayTeam.name : m.homeTeam.name, date: m.startsAt, ...rest,
  };
};
const rowsOf = (sport: SportId, lines: StatLine[]) =>
  Object.fromEntries(careerSections(statSchema(sport)!, lines).map((s) => [s.id, Object.fromEntries(s.rows.map((r) => [r.label, r.value]))]));

describe('SD-24 — every sport renders sections (golf stays custom)', () => {
  test('careerView', () => {
    for (const sp of STAT_SPORTS) {
      assert.equal(statSchema(sp)?.careerView, sp === 'golf' ? 'custom' : sp === 'athletics' || sp === 'swimming' || sp === 'weightlifting' || sp === 'shooting' || sp === 'archery' || sp === 'rowing' || sp === 'canoe' || sp === 'cycling' ? 'measured' : 'sections', sp); // SD-90 / SD-94: athletics and swimming render a measured career
      assert.deepEqual(validateSchema(STAT_SCHEMAS[sp]), [], sp);
    }
  });
  test('no lines, or legacy lines without the keys: no rows, no throw (D8: never a false 0)', () => {
    for (const sp of STAT_SPORTS) {
      if (sp === 'golf' || sp === 'cricket') continue;
      assert.deepEqual(careerSections(statSchema(sp)!, []), [], sp);
      const m = M(sp);
      assert.doesNotThrow(() => careerSections(statSchema(sp)!, [L(m, { apps: 1 })]), sp);
      assert.deepEqual(careerSections(statSchema(sp)!, [L(m, { apps: 1 })]), [], sp);
    }
  });
});

describe('SD-24 — per-sport sections from fixture lines', () => {
  test('basketball: per game, FT %, totals, career highs, double-doubles (BK-06)', () => {
    const ls = [
      L(M('basketball'), { points: 20, rebounds: 10, assists: 4, steals: 2, blocks: 1, turnovers: 3, fouls: 2, freeThrowsMade: 4, freeThrowsAtt: 5, minutes: 30 }),
      L(M('basketball'), { points: 10, rebounds: 4, assists: 10, steals: 0, blocks: 1, turnovers: 1, fouls: 1, freeThrowsMade: 2, freeThrowsAtt: 5 }),
    ];
    const c = rowsOf('basketball', ls);
    assert.deepEqual(c.averages, {
      'Points per game': '15.0', 'Rebounds per game': '7.0', 'Assists per game': '7.0', 'Steals per game': '1.0',
      'Blocks per game': '1.0', 'Efficiency per game': '27.0', 'Turnovers per game': '2.0', 'Minutes per game': '30.0',
    }); // SD-44: EFF/G in the career
    assert.deepEqual(c.shooting, { 'Free throws made': '6', 'Free throws attempted': '10', 'Free throw %': '60%' });
    assert.deepEqual(c.bests, { Points: '20', Rebounds: '10', Assists: '10', 'Double-doubles': '2' }); // no triple-double: hidden
    assert.equal(c.totals.Minutes, '30');
    assert.equal(c.totals['Plus / minus'], undefined); // never on a line → hidden
    assert.deepEqual(c.discipline, { Fouls: '3' });
  });
  test('football outfield: goals per game / per 90, accuracy, conversion, hat-tricks; no keeper section', () => {
    const tracked = ['goals', 'assists', 'shots', 'shotsOnTarget'];
    const ls = [
      L(M('football'), { goals: 3, assists: 1, shots: 6, shotsOnTarget: 4, minutes: 90 }, { tracked }),
      L(M('football'), { goals: 0, assists: 0, shots: 2, shotsOnTarget: 0, minutes: 45 }, { tracked }),
      L(M('football'), { goals: 1, assists: 0 }, { tracked: ['goals', 'assists'] }), // shots not tracked, no minutes
    ];
    const c = rowsOf('football', ls);
    assert.equal(c.attack.Goals, '4');
    assert.equal(c.attack['Goals per game'], '1.33');
    assert.equal(c.attack['Goals per 90'], '2.00'); // 3 goals in 135 min
    assert.equal(c.attack['Shots on target %'], '50%'); // 4 / 8, the untracked game left out
    assert.equal(c.attack['Shot conversion %'], '38%'); // 3 / 8 — the goal without shots tracked isn't in it
    assert.equal(c.attack.Shots, '8');
    assert.ok(c.attack.Shots && c.attack.Tackles === undefined);
    assert.deepEqual(c.bests, { 'Most goals (match)': '3', 'Hat-tricks': '1' });
    assert.equal(c.goalkeeping, undefined);
    assert.equal(c.playing.Minutes, '135');
  });
  test('football keeper figures match SD-09 (clean sheets, conceded; save % = saves ÷ (saves + conceded))', () => {
    const tracked = ['goals', 'assists', 'cleanSheets', 'saves'];
    const ls = [
      L(M('football'), { cleanSheets: 1, goalsConceded: 0, saves: 4, minutes: 90 }, { tracked }),
      L(M('football'), { cleanSheets: 0, goalsConceded: 2, saves: 6, minutes: 90 }, { tracked }),
      L(M('football'), { cleanSheets: 0, goalsConceded: 1, minutes: 90 }, { tracked: ['goals', 'cleanSheets'] }), // saves off
    ];
    const c = rowsOf('football', ls);
    // SD-39: games in goal and conceded per 90 (3 in 270 minutes)
    assert.deepEqual(c.goalkeeping, { 'Games in goal': '3', 'Clean sheets': '1', Saves: '10', 'Goals conceded': '3', 'Save %': '83%', 'Conceded per game': '1.00', 'Conceded per 90': '1.00' });
  });
  test('volleyball: per-set figures over sets played, sets W-L (VB-08)', () => {
    const ls = [
      L(M('volleyball'), { points: 12, attackPoints: 9, aces: 2, blocks: 1, setsWon: 3, setsLost: 1, setsPlayed: 4 }),
      L(M('volleyball'), { points: 6, attackPoints: 5, aces: 0, blocks: 1, setsWon: 1, setsLost: 3, setsPlayed: 2 }),
    ];
    const c = rowsOf('volleyball', ls);
    assert.deepEqual(c.attack, { Points: '18', 'Points per set': '3.00', 'Attack pts': '14', 'Most points in a match': '12' });
    assert.deepEqual(c.serve, { Aces: '2', 'Aces per set': '0.33' });
    assert.deepEqual(c.block, { Blocks: '2', 'Blocks per set': '0.33' });
    assert.deepEqual(c.record, { 'Sets played': '6', 'Sets W-L': '4-4', 'Sets won %': '50%' });
  });
  test('volleyball: statTotals set keys count even when the line\'s tracked list leaves them out', () => {
    const c = rowsOf('volleyball', [L(M('volleyball'), { points: 1, setsWon: 2, setsPlayed: 2 }, { tracked: ['points'] })]);
    assert.deepEqual(c.record, { 'Sets played': '2', 'Sets W-L': '2-0', 'Sets won %': '100%' });
  });
  test('kabaddi: total, per match, Super 10s, High 5s, best match (KB-04)', () => {
    const ls = [L(M('kabaddi'), { raidPoints: 11, tacklePoints: 1 }), L(M('kabaddi'), { raidPoints: 3, tacklePoints: 5 })];
    const c = rowsOf('kabaddi', ls);
    // SD-82: the best match is by total points; the raid high reads "Most in a match"
    assert.deepEqual(c.overall, { 'Total points': '20', 'Points per match': '10.0', 'Best match': '12' });
    assert.deepEqual(c.raiding, { 'Raid pts': '14', 'Raid pts per match': '7.0', 'Most in a match': '11', 'Super 10s': '1' });
    assert.deepEqual(c.defending, { 'Tackle pts': '6', 'Tackle pts per match': '3.0', 'High 5s': '1' });
  });
  test('chess: score (W + ½D) and score % (CH-05)', () => {
    const ls = [
      L(M('chess'), { games: 1, wins: 1 }), L(M('chess'), { games: 1, draws: 1 }, { result: 'D' }),
      L(M('chess'), { games: 1, wins: 1 }), L(M('chess'), { games: 1, losses: 1 }, { result: 'L' }),
    ];
    assert.deepEqual(rowsOf('chess', ls).results, { Games: '4', Score: '2.5', 'Score %': '63%', Wins: '2', Draws: '1', Losses: '1' });
  });
  test('chess: a line carries only its outcome key — no losses is 0 losses, not "not tracked"', () => {
    const ls = [L(M('chess'), { games: 1, wins: 1 }), L(M('chess'), { games: 1, draws: 1 }, { result: 'D' })];
    assert.equal(rowsOf('chess', ls).results.Losses, '0');
  });
  test('a rate with nothing to divide by is hidden, not "–" (a keeper with no shots faced)', () => {
    const c = rowsOf('football', [L(M('football'), { cleanSheets: 1, goalsConceded: 0, minutes: 61 })]);
    assert.deepEqual(c.goalkeeping, { 'Games in goal': '1', 'Clean sheets': '1', 'Goals conceded': '0', 'Conceded per game': '0.00', 'Conceded per 90': '0.00' });
  });
  test('carrom: points per match and best match', () => {
    const c = rowsOf('carrom', [L(M('carrom'), { points: 25, queens: 1 }), L(M('carrom'), { points: 13, queens: 0 })]);
    assert.deepEqual(c.scoring, { Points: '38', 'Points per match': '19.0', Queens: '1', 'Best match': '25' });
  });
  test('tennis: match play W-L and won %, serve / return rates; a doubles line without the server keys stays out', () => {
    const ls = [
      L(M('tennis'), {
        points: 30, aces: 3, doubleFaults: 1, setsWon: 2, setsLost: 1, gamesWon: 15, gamesLost: 12, ptsWon: 90, ptsLost: 80,
        decidersPlayed: 1, decidersWon: 1, tiebreaksPlayed: 1, tiebreaksWon: 0,
        srvPts: 80, srvPtsWon: 52, rcvPts: 90, rcvPtsWon: 38, svcGames: 14, svcHeld: 12, rtnGames: 13, breaks: 3, bpFaced: 4, bpSaved: 2, bpOpps: 6, bpWon: 3,
      }),
      L(M('tennis'), { points: 10, aces: 0, setsWon: 0, setsLost: 2, gamesWon: 5, gamesLost: 12, ptsWon: 40, ptsLost: 60, decidersPlayed: 0, decidersWon: 0, tiebreaksPlayed: 0, tiebreaksWon: 0, rcvPts: 50, rcvPtsWon: 12 }, { result: 'L' }),
    ];
    const c = rowsOf('tennis', ls);
    assert.deepEqual(c.match, {
      'Sets W-L': '2-3', 'Sets won %': '40%', 'Games W-L': '20-24', 'Games won %': '45%', 'Points W-L': '130-140', 'Points won %': '48%',
      'Deciders W-L': '1-0', 'Tiebreaks W-L': '0-1',
    });
    assert.deepEqual(c.serve, {
      Aces: '3', 'Double faults': '1', 'Service points won %': '65%', 'Return points won %': '36%',
      'Service games held %': '86%', 'Return games won %': '23%', 'Break points saved %': '50%', 'Break points converted %': '50%',
    });
    assert.deepEqual(c.points, { 'Points scored': '40' });
  });
  test('badminton (rally): games, points, deciders — no sets / tiebreak rows', () => {
    const c = rowsOf('badminton', [L(M('badminton'), { points: 5, gamesWon: 2, gamesLost: 1, ptsWon: 60, ptsLost: 50, decidersPlayed: 1, decidersWon: 1 })]);
    assert.deepEqual(c.match, { 'Games W-L': '2-1', 'Games won %': '67%', 'Points W-L': '60-50', 'Points won %': '55%', 'Deciders W-L': '1-0' });
  });
});

describe('SD-24 — doubles: singles / doubles W-L and the per-partner record', () => {
  const sp: SportId = 'badminton';
  const pair = (id: string, name: string, roster: string[]) => team(id, name, sp, roster);
  const ms = [
    M(sp, { home: pair('t1', 'Asha/Bina', ['p1', 'p2']), away: pair('t2', 'Cy/Dev', ['p3', 'p4']), state: { doubles: true } }),
    M(sp, { home: pair('t3', 'Eve/Fay', ['p5', 'p6']), away: pair('t4', 'Asha/Gita', ['p1', 'p7']), state: { doubles: true } }),
    M(sp, { home: pair('t1', 'Asha/Bina', ['p1', 'p2']), away: pair('t5', 'Hari/Ivan', ['p8', 'p9']), state: { doubles: true } }),
    M(sp, { home: team('s1', 'Asha', sp, ['p1']), away: team('s2', 'Jo', sp, ['p10']), state: { doubles: false } }),
  ];
  const mine = [
    L(ms[0], { points: 4 }, { result: 'W' }),
    L(ms[1], { points: 3 }, { result: 'L', side: 'away' }),
    L(ms[2], { points: 6 }, { result: 'W' }),
    L(ms[3], { points: 9 }, { result: 'L' }),
  ];
  // the partner's lines of the same match + side, and an opponent line (other side)
  const others = [
    L(ms[0], { points: 2 }, { playerId: 'p2' }), L(ms[0], { points: 1 }, { playerId: 'p3', side: 'away' }),
    L(ms[1], { points: 1 }, { playerId: 'p7', side: 'away' }),
    // match 3: no partner line → the side's two-player roster
  ];
  const byId = new Map(ms.map((m) => [m.id, m]));
  const ctx = contextsFor(mine, byId, new Map());
  test('singles / doubles W-L from the line context', () => {
    assert.deepEqual(disciplineRecords(mine, ctx).map((d) => [d.label, wlText(d.record)]), [['Singles', '0-1'], ['Doubles', '2-1']]);
    assert.deepEqual(doublesMatchIds(mine, ctx).sort(), [ms[0].id, ms[1].id, ms[2].id].sort());
  });
  test('partner = the other line of the same match + side; else the side\'s 2-player roster; singles never count', () => {
    const recs = partnerRecords(mine, [...mine, ...others], byId, ctx);
    assert.deepEqual(recs.map((r) => [r.partnerId, r.played, wlText(r)]), [['p2', 2, '2-0'], ['p7', 1, '0-1']]);
  });
  test('filters re-run it (SD-25): doubles only', () => {
    const dbl = filterLines(mine, ctx, { discipline: 'doubles' });
    assert.equal(dbl.length, 3);
    assert.deepEqual(rowsOf(sp, dbl), rowsOf(sp, dbl)); // deterministic
    assert.equal(partnerRecords(filterLines(mine, ctx, { discipline: 'singles' }), others, byId, ctx).length, 0);
  });
});

describe('SD-118 — Partners only for doubles formats of racket sports', () => {
  test('a team sport\'s 2-player team is not a pair (kabaddi, football, basketball)', () => {
    for (const sp of ['kabaddi', 'football', 'basketball', 'volleyball'] as SportId[]) {
      const m = M(sp, { home: team('h2', 'Duo', sp, ['p1', 'p2']), away: team('a2', 'Rivals', sp, ['p3', 'p4']) });
      const mine = [L(m, { points: 3 }, { result: 'W' })];
      const mate = [L(m, { points: 1 }, { playerId: 'p2' })];
      const byId = new Map([[m.id, m]]);
      const ctx = contextsFor(mine, byId, new Map());
      assert.equal(partnerRecords(mine, [...mine, ...mate], byId, ctx).length, 0, sp);
      // without the line context there is no discipline either
      assert.equal(partnerRecords(mine, [...mine, ...mate], byId).length, 0, sp);
    }
  });
  test('racket doubles still pair; a racket singles match with a 2-name roster does not', () => {
    const dbl = M('tennis', { home: team('h3', 'A/B', 'tennis', ['p1', 'p2']), away: team('a3', 'C/D', 'tennis', ['p3', 'p4']), state: { doubles: true } });
    const sgl = M('tennis', { home: team('h4', 'A', 'tennis', ['p1', 'p9']), away: team('a4', 'C', 'tennis', ['p3']), state: { doubles: false } });
    const mine = [L(dbl, {}, { result: 'W' }), L(sgl, {}, { result: 'W' })];
    const byId = new Map([dbl, sgl].map((m) => [m.id, m]));
    const ctx = contextsFor(mine, byId, new Map());
    assert.deepEqual(partnerRecords(mine, mine, byId, ctx).map((r) => r.partnerId), ['p2']);
  });
});

describe('SD-24 — titles / finals, best run, record and Win %', () => {
  test('a won final is a title; a lost final is a final reached; group / semi-final matches are neither', () => {
    const f1 = M('tennis', { stage: 'final', tournamentId: 't' });
    const f2 = M('tennis', { stage: 'final', tournamentId: 't2' });
    const sf = M('tennis', { stage: 'sf', tournamentId: 't' });
    const byId = new Map([f1, f2, sf].map((m) => [m.id, m]));
    const ls = [L(f1, {}, { result: 'W' }), L(f2, {}, { result: 'L' }), L(sf, {}, { result: 'W' })];
    assert.deepEqual(titlesAndFinals(ls, byId), { titles: 1, finals: 2 });
    assert.deepEqual(titlesAndFinals([{ ...ls[0], pending: true, result: undefined }], byId), { titles: 0, finals: 0 });
  });
  test('best winning run (oldest → newest; a no result neither extends nor breaks it)', () => {
    const r = ['W', 'W', 'L', 'W', 'NR', 'W', 'W', 'D'] as const;
    const ls = r.map((x, i) => L(M('chess'), {}, { result: x, date: `2026-01-${String(i + 1).padStart(2, '0')}` }));
    assert.equal(bestWinRun(ls), 3); // W · NR · W W
    assert.equal(bestWinRun([]), 0);
  });
  test('W-L where the sport has no draws; W-D-L otherwise', () => {
    const r = aggregate([L(M('tennis'), {}, { result: 'W' }), L(M('tennis'), {}, { result: 'L' })]).bySport[0];
    assert.deepEqual(recordFigure('tennis', r), { label: 'W-L', value: '1-1' });
    assert.deepEqual(recordFigure('football', r), { label: 'W-D-L', value: '1-0-1' });
  });
  test('Win %: "100%" uses the smaller tile font (fits 375 px); 2-3 characters keep the big one', () => {
    const all = aggregate([L(M('tennis'), {}, { result: 'W' })]);
    assert.equal(winPctText(all), '100%');
    assert.equal(tileValueIsLong('100%'), true);
    assert.equal(tileValueIsLong('67%'), false);
    assert.equal(tileValueIsLong('0%'), false);
    assert.equal(tileValueIsLong('3-0-1'), true);
    assert.equal(winPctText(aggregate([L(M('tennis'), {}, { result: 'NR' })])), '0%');
    assert.equal(winPctText(aggregate([L(M('tennis'), {}, { result: 'W' }), L(M('tennis'), {}, { result: 'L' }), L(M('tennis'), {}, { result: 'L' })])), '33%');
  });
});

describe('SD-24 — match history key stats', () => {
  test('no zero keys, no record keys, correct plurals', () => {
    const t = L(M('tennis'), { points: 12, aces: 0, gamesWon: 6, gamesLost: 2, ptsWon: 30, ptsLost: 20, srvPts: 20 });
    assert.equal(historyStats(t), '12 pts');
    assert.equal(historyStats({ ...t, stats: { points: 12, aces: 1 } }), '12 pts · 1 ace');
    assert.equal(historyStats({ ...t, stats: { points: 0, aces: 2 } }), '2 aces');
    assert.equal(historyStats(L(M('volleyball'), { points: 1, aces: 1 })), '1 pt · 1 ace');
    assert.equal(historyStats(L(M('kabaddi'), { raidPoints: 1, tacklePoints: 2 })), '1 raid pt · 2 tackle pts');
    const fb = L(M('football'), { goals: 1, assists: 2, shotsOnTarget: 0, minutes: 90, apps: 1, starts: 1 });
    assert.equal(historyStats(fb), '1 goal · 2 assists');
  });
  test('chess shows colour · time control, never "1 draws · 1 games"', () => {
    const m = M('chess', { state: { timeControl: 'rapid', white: 'away' } });
    const l = L(m, { games: 1, draws: 1 }, { result: 'D', side: 'away' });
    const ctx = contextsFor([l], new Map([[m.id, m]]), new Map()).get(l.id);
    assert.equal(historyStats(l, ctx), 'White · Rapid');
    assert.equal(historyStats(l), '');
  });
});

describe('SD-24 — cricket is unchanged (golden)', () => {
  test('cricket sections equal careerFromSchema, every section kept (even empty)', () => {
    const s = statSchema('cricket')!;
    const ls = [
      L(M('cricket'), { runs: 54, ballsFaced: 40, innings: 1, fours: 6, sixes: 2, catches: 1 }),
      L(M('cricket'), { runs: 12, ballsFaced: 15, innings: 1, notOut: 1, balls: 24, wickets: 3, runsConceded: 18 }),
    ];
    const want = careerFromSchema(s, ls);
    const got = careerSections(s, ls);
    assert.deepEqual(got.map((x) => x.id), (s.sections ?? []).map((x) => x.id));
    for (const sec of got) assert.deepEqual(sec.rows, want[sec.id]);
    assert.deepEqual(careerSections(s, []).map((x) => x.rows), (s.sections ?? []).map((x) => careerFromSchema(s, [])[x.id]));
  });
});
