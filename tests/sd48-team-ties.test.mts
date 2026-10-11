/**
 * SD-48 (GEN-17) — team ties: one fixture of N rubbers. Presets (ITTF
 * Swaythling / Corbillon / Olympic, BWF Thomas / Sudirman, ITF Davis Cup,
 * team squash, chess boards), ABC v XYZ draw, lineups → rubber players, the
 * tie score with ½-point chess boards, stop at the majority (dead rubbers set
 * aside and restored), the one moment a rubber decides the tie, tie-aware
 * group standings per the federations' team rankings, the knockout board
 * count, and the tie-table columns.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, SportId, Team } from '../src/core/types.ts';
import {
  TIE_PRESETS, tiePresetsFor, specFromPreset, customSpec, rubberLabel, rubberFormat, rubberPositions, sideLetters,
  tieSpecFromFormat, isTieRubber, rubberPlayers, lineupProblems, boardsByRating, resolveTie, rubbersToStop, rubbersToRestore,
  decidedBy, tieResultText, collapseTies, isTieMatch, fmtPts, tournamentTieSpec, TIE_POINTS, TIE_KEYS, lineupOf,
  type TieSpec, type TieLineup,
} from '../src/data/teamTie.ts';
import { deriveSeries, seriesWinnerId, resolveSeries } from '../src/data/series.ts';
import {
  teamStandings, standingsConfigFromFormat, setStandingsPointsProvider, availableTieBreakers, standingsPresets,
  tieBreakerLabel, activePreset, defaultStandingsConfig,
} from '../src/data/standings.ts';
import { tableColumns, columnsConfig } from '../src/data/standingsColumns.ts';
import { groupTables } from '../src/data/groups.ts';

const T = (id: string, name: string, sport: SportId): Team => ({ id, name, shortName: name.slice(0, 3).toUpperCase(), sport });
const preset = (id: string) => TIE_PRESETS.find((p) => p.id === id)!;

let seq = 0;
/** All rubbers of a tie, team A at home, from the spec. `results[i]`: 'A' /
 *  'B' / 'D' (draw) / '-' (not played yet) / 'L' (live); `scores[i]` games. */
function tie(sport: SportId, A: Team, B: Team, spec: TieSpec, results: string, o: { scores?: [number, number][]; group?: string; stage?: string; points?: [number, number][] } = {}): Match[] {
  seq += 1;
  const sid = `tie-${seq}`;
  return spec.rubbers.map((_, i) => {
    const r = results[i] ?? '-';
    const done = r === 'A' || r === 'B' || r === 'D';
    const sc = o.scores?.[i] ?? (r === 'A' ? [3, 1] : r === 'B' ? [1, 3] : [0, 0]);
    return {
      id: `${sid}-r${i + 1}`, sport, status: done ? 'completed' : r === 'L' ? 'live' : 'scheduled',
      startsAt: `2026-10-${10 + seq}T10:0${i}:00Z`, homeTeam: A, awayTeam: B, group: o.group, stage: o.stage ?? (o.group ? 'group' : undefined),
      ...(done ? { score: { home: sc[0], away: sc[1] }, winner: r === 'A' ? 'home' : r === 'B' ? 'away' : 'draw' } : {}),
      format: rubberFormat(spec, i, { seriesId: sid, teamAId: A.id }),
      state: o.points?.[i] ? { points: o.points[i] } : null,
    } as Match;
  });
}
const seriesOf = (ms: Match[]) => deriveSeries(ms)[0];

describe('presets and labels', () => {
  test('every tie sport has a preset; ids are unique', () => {
    for (const sp of ['tabletennis', 'badminton', 'tennis', 'squash', 'chess', 'carrom', 'padel', 'pickleball'] as SportId[]) assert.ok(tiePresetsFor(sp).length > 0, sp);
    assert.equal(new Set(TIE_PRESETS.map((p) => p.id)).size, TIE_PRESETS.length);
  });
  test('Swaythling: A–X, B–Y, C–Z, A–Y, B–X; the ABC draw swaps the letters', () => {
    const s = specFromPreset(preset('tt-swaythling'));
    assert.deepEqual(s.rubbers.map((_, i) => rubberLabel(s, i)), ['A v X', 'B v Y', 'C v Z', 'A v Y', 'B v X']);
    const sw = { ...s, abc: 'away' as const };
    assert.deepEqual(sw.rubbers.map((_, i) => rubberLabel(sw, i)), ['X v A', 'Y v B', 'Z v C', 'Y v A', 'X v B']);
    assert.deepEqual(sideLetters(sw, 'home'), ['X', 'Y', 'Z']);
    assert.deepEqual(rubberPositions(sw, 3), { home: ['Y'], away: ['A'] });
  });
  test('Olympic opens with the B/C v Y/Z doubles; Davis Cup labels No.1 / No.2', () => {
    const o = specFromPreset(preset('tt-olympic'));
    assert.equal(rubberLabel(o, 0), 'B/C v Y/Z');
    const d = specFromPreset(preset('tn-davis5'));
    assert.equal(rubberLabel(d, 0), 'No.1 v No.2');
    assert.equal(rubberLabel(d, 2), 'Doubles');
    assert.equal(rubberLabel(d, 3), 'Reverse singles · No.1 v No.1');
  });
  test('rubber format: singles 1 a side, doubles 2, mixed category, chess colours alternate + ½', () => {
    const sud = specFromPreset(preset('bd-sudirman'));
    const f0 = rubberFormat(sud, 0, { seriesId: 's', teamAId: 'a' });
    assert.equal(f0.playersPerSide, 2); assert.equal(f0.category, 'mixed'); assert.equal(f0[TIE_KEYS.slot], 'Mixed doubles');
    assert.equal(rubberFormat(sud, 1, { seriesId: 's', teamAId: 'a' }).playersPerSide, 1);
    const ch = specFromPreset(preset('ch-4boards'));
    const w = ch.rubbers.map((_, i) => rubberFormat(ch, i, { seriesId: 's', teamAId: 'a' }).white);
    assert.deepEqual(w, ['home', 'away', 'home', 'away']);
    assert.equal(rubberFormat(ch, 0, { seriesId: 's', teamAId: 'a' })[TIE_KEYS.half], true);
    assert.equal(rubberFormat(sud, 0, { seriesId: 's', teamAId: 'a' })[TIE_KEYS.half], undefined);
    // spec round-trips off the format
    const back = tieSpecFromFormat(f0 as Record<string, unknown>);
    assert.equal(back?.preset, 'bd-sudirman');
    assert.equal(isTieRubber({ format: f0 }), true);
    assert.equal(isTieRubber({ format: { __seriesId: 'x' } }), false);
  });
  test('custom builder: numbered singles / doubles; chess custom = boards', () => {
    const c = customSpec('badminton', ['S', 'D', 'S', 'XD']);
    assert.deepEqual(c.rubbers.map((_, i) => rubberLabel(c, i)), ['1st singles', '1st doubles', '2nd singles', '1st mixed']);
    const ch = customSpec('chess', ['S', 'S', 'S']);
    assert.equal(ch.half, true); assert.equal(ch.boards, true); assert.equal(rubberLabel(ch, 2), 'Board 3');
  });
});

describe('lineups', () => {
  const s = specFromPreset(preset('tt-corbillon'));
  test('positions + a nominated doubles pair → each rubber’s players', () => {
    const home: TieLineup = { pos: { A: 'h1', B: 'h2' }, pairs: { 2: ['h1', 'h3'] } };
    const away: TieLineup = { pos: { X: 'a1', Y: 'a2' }, pairs: { 2: ['a2', 'a3'] } };
    assert.deepEqual(rubberPlayers(s, 0, 'home', home), ['h1']);
    assert.deepEqual(rubberPlayers(s, 0, 'away', away), ['a1']);
    assert.deepEqual(rubberPlayers(s, 2, 'home', home), ['h1', 'h3']);
    assert.deepEqual(rubberPlayers(s, 4, 'away', away), ['a1']); // B v X
    assert.equal(rubberPlayers(s, 0, 'home', null), undefined);
  });
  test('problems: missing positions and pairs block; the same player twice blocks', () => {
    const p = lineupProblems(s, 'home', { pos: { A: 'h1', B: 'h1' }, pairs: { 2: ['h3'] } });
    assert.ok(p.errors.some((e) => e.includes('different player')));
    assert.ok(p.errors.some((e) => e.includes('Doubles')));
    assert.equal(lineupProblems(s, 'home', { pos: { A: 'h1', B: 'h2' }, pairs: { 2: ['h1', 'h3'] } }).errors.length, 0);
  });
  test('Thomas Cup: two singles for one player is a warning, not a block', () => {
    const t = specFromPreset(preset('bd-thomas'));
    const l: TieLineup = { pos: {}, pairs: { 0: ['p1'], 1: ['p2', 'p3'], 2: ['p1'], 3: ['p4', 'p5'], 4: ['p6'] } };
    const p = lineupProblems(t, 'home', l);
    assert.equal(p.errors.length, 0);
    assert.equal(p.warnings.length, 1);
  });
  test('chess: boards by rating, unrated last', () => {
    const c = specFromPreset(preset('ch-4boards'));
    const r: Record<string, number> = { a: 1500, b: 1900, d: 1700 };
    assert.deepEqual(boardsByRating(c, 'home', ['a', 'b', 'c', 'd'], (id) => r[id]), { 1: 'b', 2: 'd', 3: 'a', 4: 'c' });
  });
  test('the lineup is read off any rubber', () => {
    const A = T('a', 'Alpha', 'tabletennis'), B = T('b', 'Beta', 'tabletennis');
    const ms = tie('tabletennis', A, B, s, '-----');
    ms[3].format = { ...ms[3].format, [TIE_KEYS.lineupA]: JSON.stringify({ pos: { X: 'x' }, pairs: {} }) };
    assert.equal(lineupOf(ms, 'away')?.pos.X, 'x');
    assert.equal(lineupOf(ms, 'home'), null);
  });
});

describe('the tie result', () => {
  const A = T('ra', 'Riverside', 'badminton'), B = T('hb', 'Hilltop', 'badminton');
  const sud = specFromPreset(preset('bd-sudirman'));
  test('stop at the majority: 3–0 decides; rubbers 4 and 5 are set aside', () => {
    const s = seriesOf(tie('badminton', A, B, sud, 'AAA--'));
    const t = resolveTie(s);
    assert.equal(t.decided, true); assert.equal(t.winnerId, 'ra'); assert.equal(t.needed, 3);
    assert.deepEqual(t.rubbers.map((r) => r.state), ['won', 'won', 'won', 'dead', 'dead']);
    assert.deepEqual(rubbersToStop(s, sud).map((m) => m.id.slice(-2)), ['r4', 'r5']);
    assert.equal(rubbersToStop(s, { ...sud, dead: 'play' }).length, 0);
    assert.equal(t.summary, 'RIV win 3–0');
  });
  test('only the deciding rubber announces the tie', () => {
    const ms = tie('badminton', A, B, sud, 'ABAA-');
    const s = seriesOf(ms);
    assert.equal(decidedBy(s, ms[3].id), true);
    assert.equal(decidedBy(s, ms[1].id), false); // the loss didn't decide it
    assert.equal(tieResultText(s), '🏆 Riverside beat Hilltop 3–1');
  });
  test('a dead rubber played later does not re-announce; the score counts it (4–1)', () => {
    const ms = tie('badminton', A, B, sud, 'ABAAA');
    const s = seriesOf(ms);
    assert.equal(decidedBy(s, ms[4].id), false);
    assert.equal(resolveTie(s).ptsA, 4);
  });
  test('a correction that undoes the decision brings set-aside rubbers back', () => {
    const ms = tie('badminton', A, B, sud, 'AB-');
    ms[3].status = 'cancelled'; ms[3].format = { ...ms[3].format, [TIE_KEYS.dead]: true };
    const s = seriesOf(ms);
    assert.deepEqual(rubbersToRestore(s).map((m) => m.id.slice(-2)), ['r4']);
    assert.equal(resolveTie(s).rubbers[3].state, 'unplayed');
  });
  test('live summary: leader and target', () => {
    assert.equal(resolveTie(seriesOf(tie('badminton', A, B, sud, 'ABBL-'))).summary, 'HIL lead 2–1 · first to 3');
  });
});

describe('chess ½ points', () => {
  const A = T('ka', 'Knights', 'chess'), B = T('rb', 'Rooks', 'chess');
  const c = specFromPreset(preset('ch-4boards'));
  test('2½–1½ wins (more than half of 4), 2–2 is a drawn match', () => {
    const w = resolveTie(seriesOf(tie('chess', A, B, c, 'ADAD')));
    // A wins b1, draws b2, wins b3, draws b4 → 3–1
    assert.equal(fmtPts(w.ptsA) + '-' + fmtPts(w.ptsB), '3-1');
    const s = resolveTie(seriesOf(tie('chess', A, B, c, 'ADBA')));
    assert.equal(s.ptsA, 2.5); assert.equal(s.decided, true); assert.equal(s.winnerId, 'ka');
    assert.equal(s.summary, 'KNI win 2½–1½');
    const d = resolveTie(seriesOf(tie('chess', A, B, c, 'ABDD')));
    assert.equal(d.drawn, true); assert.equal(d.winnerId, undefined);
  });
  test('2½ clinches before the last board ends', () => {
    const t = resolveTie(seriesOf(tie('chess', A, B, c, 'AADL')));
    assert.equal(t.decided, true); assert.equal(t.ptsA, 2.5);
  });
  test('a 0-0 double forfeit is worth nothing', () => {
    const ms = tie('chess', A, B, c, 'ABDD');
    ms[3].state = { method: 'double-forfeit' };
    const t = resolveTie(seriesOf(ms));
    assert.equal(t.ptsA, 1.5); assert.equal(t.ptsB, 1.5);
  });
  test('knockout: a 2–2 match goes to the board count; a group draw stays drawn', () => {
    const ko = seriesOf(tie('chess', A, B, c, 'ABDD', { stage: 'sf' })); // A won board 1
    assert.equal(seriesWinnerId(ko), 'ka');
    const grp = seriesOf(tie('chess', A, B, c, 'ABDD', { group: 'A' }));
    assert.equal(seriesWinnerId(grp), undefined);
    assert.equal(resolveSeries(grp).drawn, true);
  });
  test('fmtPts', () => {
    assert.equal(fmtPts(0.5), '½'); assert.equal(fmtPts(2.5), '2½'); assert.equal(fmtPts(3), '3');
  });
});

describe('one fixture, not N', () => {
  const A = T('a', 'Alpha', 'tabletennis'), B = T('b', 'Beta', 'tabletennis');
  const sw = specFromPreset(preset('tt-swaythling'));
  test('collapseTies: one synthetic match, team A home, score = rubbers', () => {
    const plain = { id: 'p', sport: 'tabletennis', status: 'scheduled', startsAt: '2026-10-01', homeTeam: A, awayTeam: B, state: null } as Match;
    const ms = [plain, ...tie('tabletennis', A, B, sw, 'ABAA-')];
    const out = collapseTies(ms);
    assert.equal(out.length, 2);
    const t = out[1];
    assert.ok(isTieMatch(t));
    assert.equal(t.status, 'completed'); assert.equal(t.winner, 'home'); assert.deepEqual(t.score, { home: 3, away: 1 });
    assert.equal(t.tieRubbers.length, 5);
    assert.equal(collapseTies([plain])[0], plain);
  });
  test('undecided tie is live; untouched tie scheduled with no score', () => {
    assert.equal(collapseTies(tie('tabletennis', A, B, sw, 'AL---'))[0].status, 'live');
    const s = collapseTies(tie('tabletennis', A, B, sw, '-----'))[0];
    assert.equal(s.status, 'scheduled'); assert.equal(s.score, undefined);
  });
});

describe('tie-aware group standings', () => {
  // Three TT teams, ITTF team ranking (tie won 2, lost 1; among the tied:
  // match points, rubbers ratio, games ratio, points ratio).
  const sw = specFromPreset(preset('tt-swaythling'));
  const ittf = standingsConfigFromFormat('tabletennis', { ...TIE_POINTS.tabletennis!.set });
  const X = T('x', 'Xavier House', 'tabletennis'), Y = T('y', 'Yamuna House', 'tabletennis'), Z = T('z', 'Zenith House', 'tabletennis');
  test('a tie counts once: P 2, W/L ties, points 2 / 1', () => {
    const ms = [
      ...tie('tabletennis', X, Y, sw, 'AAA--', { group: 'A' }),
      ...tie('tabletennis', Y, Z, sw, 'AABA-', { group: 'A' }),
      ...tie('tabletennis', Z, X, sw, 'ABAA-', { group: 'A' }),
    ];
    const rows = teamStandings(ms, 'tabletennis', ittf);
    assert.deepEqual(rows.map((r) => r.played), [2, 2, 2]);
    // all 1 win 1 loss → 3 pts each; among the tied (all three) rubbers ratio:
    // X 3+1 won / 0+3 lost = 4/3; Y 0+3 / 3+1 = 3/4; Z 1+3 / 3+1 = 1 → X, Z, Y
    assert.deepEqual(rows.map((r) => r.points), [3, 3, 3]);
    assert.deepEqual(rows.map((r) => r.teamId), ['x', 'z', 'y']);
    assert.deepEqual(rows.map((r) => [r.for, r.against]), [[4, 3], [4, 4], [3, 4]]);
  });
  test('level on rubbers → games ratio among the tied', () => {
    const sc = (a: number, b: number): [number, number] => [a, b];
    const ms = [
      ...tie('tabletennis', X, Y, sw, 'AAA--', { group: 'A', scores: [sc(3, 0), sc(3, 0), sc(3, 0)] }),
      ...tie('tabletennis', Y, Z, sw, 'AAA--', { group: 'A', scores: [sc(3, 2), sc(3, 2), sc(3, 2)] }),
      ...tie('tabletennis', Z, X, sw, 'AAA--', { group: 'A', scores: [sc(3, 1), sc(3, 1), sc(3, 1)] }),
    ];
    // rubbers 3-3 each; games: X 9+3 / 0+9 = 12/9; Y 0+9 / 9+6 = 9/15; Z 6+9 / 9+3 = 15/12
    const rows = teamStandings(ms, 'tabletennis', ittf);
    assert.deepEqual(rows.map((r) => r.teamId), ['x', 'z', 'y']);
  });
  test('BWF team: ties won, then (3+ level) rubbers difference', () => {
    const bwf = standingsConfigFromFormat('badminton', { ...TIE_POINTS.badminton!.set });
    const sud = { ...specFromPreset(preset('bd-sudirman')), dead: 'play' as const };
    const P = T('p', 'Peacock', 'badminton'), Q = T('q', 'Quail', 'badminton'), R = T('r', 'Robin', 'badminton');
    const ms = [
      ...tie('badminton', P, Q, sud, 'AAAAB', { group: 'A' }), // P 4-1
      ...tie('badminton', Q, R, sud, 'AAABB', { group: 'A' }), // Q 3-2
      ...tie('badminton', R, P, sud, 'AAABB', { group: 'A' }), // R 3-2
    ];
    const rows = teamStandings(ms, 'badminton', bwf);
    // ties won 1 each; rubbers diff: P (4-1)+(2-3) = +2; Q (1-4)+(3-2) = −2; R (2-3)+(3-2) = 0
    assert.deepEqual(rows.map((r) => r.teamId), ['p', 'r', 'q']);
    assert.deepEqual(rows.map((r) => r.diff), [2, 0, -2]);
    assert.deepEqual(rows.map((r) => r.points), [1, 1, 1]);
  });
  test('chess team: match points 2 / 1 / 0, then game points', () => {
    const fide = standingsConfigFromFormat('chess', { ...TIE_POINTS.chess!.set });
    const c = specFromPreset(preset('ch-4boards'));
    const K = T('k', 'Knights', 'chess'), R = T('r', 'Rooks', 'chess'), Bb = T('b', 'Bishops', 'chess');
    const ms = [
      ...tie('chess', K, R, c, 'ADBD', { group: 'A' }), // 2–2 draw
      ...tie('chess', R, Bb, c, 'AAAD', { group: 'A' }), // R 3½–½
      ...tie('chess', Bb, K, c, 'BBDD', { group: 'A' }), // K 3–1
    ];
    const rows = teamStandings(ms, 'chess', fide);
    // K: draw (1) + win (2) = 3, GP 2+3 = 5; R: 1 + 2 = 3, GP 2 + 3½ = 5½; B 0
    assert.deepEqual(rows.map((r) => r.teamId), ['r', 'k', 'b']);
    assert.deepEqual(rows.map((r) => r.points), [3, 3, 0]);
    assert.deepEqual(rows.map((r) => r.for), [5.5, 5, 1.5]);
  });
  test('rally points ratio among the tied via the points provider', () => {
    setStandingsPointsProvider((_sport, state) => (state && (state as { points?: [number, number] }).points ? { home: (state as { points: [number, number] }).points[0], away: (state as { points: [number, number] }).points[1] } : null));
    try {
      const ms = tie('tabletennis', X, Y, sw, 'AAA--', { group: 'A', points: [[33, 20], [33, 25], [33, 30]] });
      const t = collapseTies(ms)[0];
      assert.ok(isTieMatch(t));
      const rows = teamStandings(ms, 'tabletennis', standingsConfigFromFormat('tabletennis', { ...TIE_POINTS.tabletennis!.set, withUnits: true } as never));
      assert.equal(rows.find((r) => r.teamId === 'x')?.points, 2);
    } finally { setStandingsPointsProvider(null); }
  });
  test('groupTables ranks ties per group', () => {
    const ms = [...tie('tabletennis', X, Y, sw, 'AAA--', { group: 'B' })];
    const g = groupTables(ms, 'tabletennis', ittf);
    assert.equal(g.length, 1); assert.equal(g[0].rows[0].teamId, 'x'); assert.equal(g[0].rows[1].points, 1);
  });
  test('an individual table without ties is unchanged', () => {
    const a = T('a', 'A', 'tabletennis'), b = T('b', 'B', 'tabletennis');
    const m = { id: 'm', sport: 'tabletennis', status: 'completed', startsAt: '', homeTeam: a, awayTeam: b, score: { home: 3, away: 1 }, winner: 'home', state: null } as Match;
    const rows = teamStandings([m], 'tabletennis', defaultStandingsConfig('tabletennis'));
    assert.deepEqual(rows.map((r) => [r.points, r.for]), [[2, 3], [1, 1]]);
  });
});

describe('knockout advancement and settings', () => {
  test('a decided tie gives its pairing a winner; stop-mode cancelled rubbers don’t block it', () => {
    const A = T('a', 'Alpha', 'squash'), B = T('b', 'Beta', 'squash');
    const ms = tie('squash', A, B, specFromPreset(preset('sq-teams')), 'BB-', { stage: 'final' });
    ms[2].status = 'cancelled'; ms[2].format = { ...ms[2].format, [TIE_KEYS.dead]: true };
    assert.equal(seriesWinnerId(seriesOf(ms)), 'b');
  });
  test('the tournament remembers the tie format; points presets offer the team ranking first', () => {
    const spec = specFromPreset(preset('tt-swaythling'));
    const fmt = { teamTie: JSON.stringify(spec), ...TIE_POINTS.tabletennis!.set };
    assert.equal(tournamentTieSpec(fmt)?.preset, 'tt-swaythling');
    assert.equal(standingsPresets('tabletennis', fmt)[0].id, 'ittf-team');
    assert.equal(activePreset('tabletennis', fmt)?.id, 'ittf-team');
    assert.equal(standingsPresets('tabletennis')[0].id, 'ittf'); // individual events unchanged
    assert.ok(availableTieBreakers('badminton', true).includes('rubbersDiff'));
    assert.ok(!availableTieBreakers('badminton').includes('rubbersDiff'));
    assert.equal(tieBreakerLabel('rubbersRatio', 'tabletennis'), 'rubbers ratio (among tied)');
  });
  test('tie table columns: rubbers won-lost and R±; chess shows game points', () => {
    const cfg = columnsConfig('badminton', standingsConfigFromFormat('badminton', { ...TIE_POINTS.badminton!.set }));
    const labels = tableColumns('badminton', cfg).columns.map((c) => c.label);
    assert.deepEqual(labels.slice(0, 5), ['P', 'W', 'L', 'R', 'R±']);
    const tn = tableColumns('tennis', standingsConfigFromFormat('tennis', { ...TIE_POINTS.tennis!.set })).columns.map((c) => c.label);
    assert.ok(tn.includes('R%')); assert.ok(tn.includes('S%')); assert.ok(tn.includes('G%'));
    const ch = tableColumns('chess', standingsConfigFromFormat('chess', { ...TIE_POINTS.chess!.set })).columns.map((c) => c.label);
    assert.ok(ch.includes('GP'));
    // a tie table's rows are teams even in a singles sport
    assert.equal(tableColumns('tabletennis', standingsConfigFromFormat('tabletennis', { ...TIE_POINTS.tabletennis!.set }), 'both').nameHeader, 'Team');
  });
});
