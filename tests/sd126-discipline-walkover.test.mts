/**
 * SD-126 — discipline + suspensions for every team sport with cards (hockey,
 * handball, basketball, kabaddi; football's SD-70 unchanged) and walkover /
 * forfeit scores per federation in the points table (FIFA 3-0, FIBA 20-0 /
 * Art. 21, FIVB 6.4 sets and points, FIH / IHF defaults), with the tournament
 * override; older results without a `forfeit` block rank exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Match, SportId } from '../src/core/types.ts';
import {
  sportDisciplineTable, sportSuspensionsFor, sportRuleText, hasDiscipline, readSportRule, DISCIPLINE_SPECS, type DisciplineMatch,
} from '../src/sports/discipline.ts';
import * as football from '../src/sports/football/discipline.ts';
import { walkoverRuleFor, forfeitFor, volleyballCompletion, walkoverRuleText, forfeitNote } from '../src/data/walkover.ts';
import { teamStandings, standingsConfigFromFormat, matchPoints, standingsPresets, matchUnits } from '../src/data/standings.ts';
import { init as vbInit } from '../src/sports/volleyball/engine.ts';

type Side = 'home' | 'away';
let n = 0;
const A = { id: 'A', name: 'Aravali' };
const B = { id: 'B', name: 'Nilgiri' };
const C = { id: 'C', name: 'Shivalik' };
const dm = (sport: SportId, home: { id: string; name: string }, away: { id: string; name: string }, day: number, state: unknown, o: Partial<DisciplineMatch> = {}): DisciplineMatch =>
  ({ id: `m${++n}`, sport, status: 'completed', startsAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`, homeTeam: home, awayTeam: away, state, ...o }) as DisciplineMatch;
const upcoming = (sport: SportId, home: typeof A, away: typeof A, day: number) => dm(sport, home, away, day, null, { status: 'scheduled' });

/* -------------------------------- hockey -------------------------------- */
const hCard = (side: Side, card: 'green' | 'yellow' | 'red', name: string) => ({ id: `e${++n}`, type: 'card', side, sec: 60, period: 1, card, playerId: name.toLowerCase(), playerName: name });

describe('SD-126 · hockey discipline', () => {
  test('a red card = 1 match out (FIH default); green / yellow are served in the match', () => {
    const m1 = dm('hockey', A, B, 1, { events: [hCard('home', 'red', 'Kiran'), hCard('home', 'green', 'Dev'), hCard('away', 'yellow', 'Om')] });
    const next = upcoming('hockey', A, C, 2);
    const t = sportDisciplineTable('hockey', [m1, next])!;
    const kiran = t.rows.find((r) => r.name === 'Kiran')!;
    assert.equal(kiran.suspended, true);
    assert.equal(kiran.banReason, 'red card');
    assert.equal(t.rows.find((r) => r.name === 'Dev')!.suspended, false);
    assert.equal(t.rows.find((r) => r.name === 'Om')!.suspended, false);
    assert.deepEqual(sportSuspensionsFor(next, [m1, next]).home.map((s) => [s.playerId, s.reason]), [['kiran', 'red card']]);
    // served once the team's next match is played
    const played = { ...next, status: 'completed' as const, state: { events: [] } };
    const later = upcoming('hockey', A, B, 3);
    assert.deepEqual(sportSuspensionsFor(later, [m1, played, later]).home, []);
  });
  test('yellow cards add up only when the organiser turns it on; red = 0 turns the ban off', () => {
    const m1 = dm('hockey', A, B, 1, { events: [hCard('home', 'yellow', 'Kiran')] });
    const m2 = dm('hockey', A, C, 2, { events: [hCard('home', 'yellow', 'Kiran')] });
    const next = upcoming('hockey', A, B, 3);
    assert.deepEqual(sportSuspensionsFor(next, [m1, m2, next]).home, []);
    assert.deepEqual(sportSuspensionsFor(next, [m1, m2, next], { banYellows: 2 }).home.map((s) => s.reason), ['2 yellow cards']);
    const r = dm('hockey', A, B, 1, { events: [hCard('home', 'red', 'Kiran')] });
    assert.deepEqual(sportSuspensionsFor(next, [r, next], { banRed: 0 }).home, []);
    assert.equal(sportRuleText('hockey', { banRed: 2, banYellows: 2, yellowReset: 'groups' }), 'Red card = 2 matches out · 2 yellow cards = 1 match out · wiped when the knockouts start');
  });
});

/* -------------------------------- handball ------------------------------- */
const hb = (side: Side, card: 'yellow' | 'twoMin' | 'red', name: string, x: { third?: boolean; blue?: boolean; official?: string } = {}) =>
  ({ id: `e${++n}`, type: 'card', side, sec: 60, period: 1, card, ...(x.official ? { official: x.official, playerName: x.official } : { playerId: name.toLowerCase(), playerName: name }), ...(x.third ? { third: true } : {}), ...(x.blue ? { blue: true } : {}) });

describe('SD-126 · handball discipline (IHF Rule 16)', () => {
  test('a red card without a report ends with the match; a blue card (report) = 1 match; 3rd 2′ is a red', () => {
    const m1 = dm('handball', A, B, 1, { events: [
      hb('home', 'red', 'Arjun'),
      hb('home', 'red', 'Bala', { blue: true }),
      hb('home', 'twoMin', 'Chetan'), hb('home', 'twoMin', 'Chetan'), hb('home', 'twoMin', 'Chetan', { third: true }),
      hb('away', 'yellow', 'Dinesh', { official: 'Coach Rao' }),
    ] });
    const next = upcoming('handball', A, C, 2);
    const t = sportDisciplineTable('handball', [m1, next])!;
    const row = (nm: string) => t.rows.find((r) => r.name === nm)!;
    assert.equal(row('Arjun').suspended, false);
    assert.equal(row('Bala').suspended, true);
    assert.equal(row('Bala').banReason, 'blue card (report)');
    assert.deepEqual(row('Bala').counts, { red: 1, blue: 1 });
    assert.deepEqual(row('Chetan').counts, { twoMin: 3, red: 1 });
    assert.equal(row('Chetan').suspended, false);
    assert.deepEqual(t.officials.map((o) => [o.name, o.counts]), [['Coach Rao', { yellow: 1 }]]);
    assert.deepEqual(sportSuspensionsFor(next, [m1, next]).home.map((s) => s.name), ['Bala']);
    // the organiser's own rule: every red = 1 match
    assert.deepEqual(sportSuspensionsFor(next, [m1, next], { banRed: 1 }).home.map((s) => s.name).sort(), ['Arjun', 'Bala', 'Chetan']);
  });
});

/* ------------------------------- basketball ------------------------------ */
const bb = (side: Side, type: string, name: string, x: Record<string, unknown> = {}) => ({ quarter: 1, minute: 3, type, side, playerName: name, pid: name.toLowerCase(), ...x });

describe('SD-126 · basketball discipline (FIBA)', () => {
  test('a D foul / ejection = 1 game; a 2 U disqualification = no further ban by default; foul-outs never', () => {
    const m1 = dm('basketball', A, B, 1, { events: [
      bb('home', 'foul', 'Ishaan', { foulType: 'disqualifying' }), bb('home', 'eject', 'Ishaan', { reason: 'D' }),
      bb('home', 'foul', 'Jai', { foulType: 'unsportsmanlike' }), bb('home', 'foul', 'Jai', { foulType: 'unsportsmanlike' }), bb('home', 'eject', 'Jai', { reason: '2U' }),
      ...Array.from({ length: 5 }, () => bb('away', 'foul', 'Kabir', { foulType: 'personal' })),
      bb('away', 'eject', 'Lalit'),
    ] });
    const next = upcoming('basketball', A, B, 2);
    const t = sportDisciplineTable('basketball', [m1, next])!;
    const row = (nm: string) => t.rows.find((r) => r.name === nm);
    assert.equal(row('Ishaan')!.suspended, true);
    assert.deepEqual(row('Ishaan')!.counts, { D: 1, DQ: 1 });
    assert.equal(row('Jai')!.suspended, false);
    assert.deepEqual(row('Jai')!.counts, { U: 2, DQ: 1 });
    assert.equal(row('Kabir'), undefined, 'fouling out is not discipline');
    assert.equal(row('Lalit')!.suspended, true, "the scorer's own ejection (fighting) = 1 game");
    const s = sportSuspensionsFor(next, [m1, next], { banEject: 1 });
    assert.deepEqual(s.home.map((x) => x.name).sort(), ['Ishaan', 'Jai']);
    assert.deepEqual(s.away.map((x) => x.name), ['Lalit']);
  });
  test('two same-named players on opposite sides are kept apart', () => {
    const m1 = dm('basketball', A, B, 1, { events: [bb('home', 'eject', 'Rahul', { pid: 'r1' }), bb('away', 'foul', 'Rahul', { pid: 'r2', foulType: 'technical' })] });
    const next = upcoming('basketball', A, B, 2);
    const s = sportSuspensionsFor(next, [m1, next]);
    assert.deepEqual(s.home.map((x) => x.playerId), ['r1']);
    assert.deepEqual(s.away, []);
  });
});

/* -------------------------------- kabaddi -------------------------------- */
const kc = (side: Side, card: 'green' | 'yellow' | 'red', name: string, official = false) =>
  ({ eid: ++n, x: 'card', side, card, ...(official ? { official: true, playerName: name } : { player: true, playerId: name.toLowerCase(), playerName: name }) });

describe('SD-126 · kabaddi discipline (SD-72 cards)', () => {
  test('a red card = 1 match out by default; coaches are listed, never suspended', () => {
    const m1 = dm('kabaddi', A, B, 1, { raids: [], extras: [kc('away', 'red', 'Pawan'), kc('away', 'yellow', 'Rohit'), kc('home', 'green', 'Coach Iyer', true)] });
    const next = upcoming('kabaddi', C, B, 2);
    const t = sportDisciplineTable('kabaddi', [m1, next])!;
    assert.equal(t.rows[0].name, 'Pawan');
    assert.equal(t.rows[0].suspended, true);
    assert.deepEqual(t.officials.map((o) => o.name), ['Coach Iyer']);
    assert.deepEqual(sportSuspensionsFor(next, [m1, next]).away.map((s) => s.name), ['Pawan']);
  });
});

/* --------------------------- shared behaviour ---------------------------- */
describe('SD-126 · shared rule', () => {
  test('sports with cards have a table; volleyball / cricket / racket sports do not', () => {
    for (const s of ['football', 'hockey', 'handball', 'basketball', 'kabaddi']) assert.equal(hasDiscipline(s), true, s);
    for (const s of ['volleyball', 'cricket', 'tennis', 'chess']) assert.equal(hasDiscipline(s), false, s);
    assert.equal(sportDisciplineTable('volleyball', []), null);
  });
  test('defaults per sport, organiser keys win', () => {
    assert.deepEqual(readSportRule(DISCIPLINE_SPECS.handball!, {}), { bans: { banRed: 0, banBlue: 1 }, banYellows: 0, yellowReset: 'never' });
    assert.deepEqual(readSportRule(DISCIPLINE_SPECS.basketball!, { banRed: 2, banYellows: 3, yellowReset: 'qf' }), { bans: { banRed: 2, banEject: 0 }, banYellows: 3, yellowReset: 'qf' });
  });
  test('football still goes through SD-70, figures unchanged', () => {
    const fe = (side: Side, type: 'yellow' | 'red', name: string) => ({ id: `e${++n}`, type, side, minute: 10, half: 1, playerId: name.toLowerCase(), playerName: name });
    const m1 = dm('football', A, B, 1, { events: [fe('home', 'red', 'Ravi'), fe('away', 'yellow', 'Sam')] });
    const next = upcoming('football', A, B, 2);
    const g = sportDisciplineTable('football', [m1, next])!;
    const f = football.disciplineTable([m1, next]);
    assert.deepEqual(g.rows.map((r) => [r.name, r.counts.yellow, r.counts.red, r.suspended]), f.rows.map((r) => [r.name, r.yellows, r.reds, r.suspended]));
    assert.deepEqual(sportSuspensionsFor(next, [m1, next]), football.suspensionsFor(next, [m1, next]));
  });
  test('a match with an unreadable state is skipped, not thrown', () => {
    const bad = dm('hockey', A, B, 1, { events: 'oops' });
    assert.deepEqual(sportDisciplineTable('hockey', [bad])!.rows, []);
  });
});

/* -------------------------------- walkovers ------------------------------ */
const wm = (sport: string, h: typeof A, a: typeof A, winner: Side, o: Partial<Match> = {}): Match =>
  ({ id: `w${++n}`, sport, status: 'completed', startsAt: '', homeTeam: h, awayTeam: a, winner, state: null, ...o }) as unknown as Match;
const played = (sport: string, h: typeof A, a: typeof A, hs: number, as: number): Match =>
  ({ id: `p${++n}`, sport, status: 'completed', startsAt: '', homeTeam: h, awayTeam: a, score: { home: hs, away: as }, winner: hs > as ? 'home' : as > hs ? 'away' : 'draw', state: null }) as unknown as Match;

describe('SD-126 · walkover scores per federation', () => {
  test('defaults: FIFA 3-0, FIBA 20-0, FIVB 3-0, FIH 5-0 / IHF 10-0 (verify); none for the rest', () => {
    assert.deepEqual([walkoverRuleFor('football')?.win, walkoverRuleFor('basketball')?.win, walkoverRuleFor('volleyball')?.win, walkoverRuleFor('hockey')?.win, walkoverRuleFor('handball')?.win], [3, 20, 3, 5, 10]);
    assert.equal(walkoverRuleFor('hockey')?.verify, true);
    assert.equal(walkoverRuleFor('kabaddi'), null);
    assert.equal(walkoverRuleFor('tennis'), null);
    assert.equal(walkoverRuleFor('football', { walkoverScore: 'off' }), null);
    assert.deepEqual(walkoverRuleFor('kabaddi', { walkoverScore: '10-0' }), { win: 10, loss: 0, source: 'tournament', custom: true });
    assert.equal(walkoverRuleFor('football', { walkoverScore: '0-3' })?.win, 3, 'a nonsense override falls back to the default');
    assert.equal(walkoverRuleText('football', walkoverRuleFor('football')), '3-0 (FIFA)');
  });
  test('a walkover counts the rule score for the winner', () => {
    assert.deepEqual(forfeitFor({ sport: 'football', kind: 'walkover', winner: 'away' })?.score, { home: 0, away: 3 });
    assert.deepEqual(forfeitFor({ sport: 'basketball', kind: 'walkover', winner: 'home' })?.score, { home: 20, away: 0 });
    assert.equal(forfeitFor({ sport: 'football', kind: 'walkover', winner: 'home', format: { walkoverScore: 'off' } }), undefined);
    assert.equal(forfeitFor({ sport: 'tennis', kind: 'walkover', winner: 'home' }), undefined);
  });
  test('conceded during play: a bigger margin on the board stands (FIFA); basketball default = Art. 21', () => {
    assert.deepEqual(forfeitFor({ sport: 'football', kind: 'conceded', winner: 'home', board: { home: 1, away: 0 } })?.score, { home: 3, away: 0 });
    assert.equal(forfeitFor({ sport: 'football', kind: 'conceded', winner: 'home', board: { home: 4, away: 1 } }), undefined);
    assert.deepEqual(forfeitFor({ sport: 'football', kind: 'awarded', winner: 'away', board: { home: 2, away: 1 } })?.score, { home: 0, away: 3 });
    assert.equal(forfeitFor({ sport: 'basketball', kind: 'conceded', winner: 'home', board: { home: 40, away: 38 } }), undefined);
    assert.deepEqual(forfeitFor({ sport: 'basketball', kind: 'conceded', winner: 'home', board: { home: 30, away: 38 } })?.score, { home: 2, away: 0 });
  });
  test('volleyball walkover: sets-to-win – 0 and target-0 a set (FIVB 6.4.1); beach 2-0, 21-0', () => {
    const f = forfeitFor({ sport: 'volleyball', kind: 'walkover', winner: 'home', format: { setsToWin: 3 } })!;
    assert.deepEqual([f.score, f.sets, f.points], [{ home: 3, away: 0 }, { home: 3, away: 0 }, { home: 75, away: 0 }]);
    // no setsToWin stored = the app's best of 3
    assert.deepEqual(forfeitFor({ sport: 'volleyball', kind: 'walkover', winner: 'home' })!.points, { home: 50, away: 0 });
    const b = forfeitFor({ sport: 'volleyball', kind: 'walkover', winner: 'away', format: { setsToWin: 2, pointsPerSet: 21 } })!;
    assert.deepEqual([b.sets, b.points], [{ home: 0, away: 2 }, { home: 0, away: 42 }]);
  });
  test('volleyball conceded mid-match: the incomplete team keeps its sets and points (FIVB 6.4.3)', () => {
    // home won set 1 25-20, leads set 2 10-8, then concedes
    const s = { ...vbInit({ setsToWin: 3 }), sets: [[25, 20]] as Array<[number, number]>, setsWon: { home: 1, away: 0 }, current: { home: 10, away: 8 } };
    const c = volleyballCompletion(s, 'away')!;
    // set 2: away 25 (needs 25), home keeps 10; set 3 + 4: 25-0 each → 1-3
    assert.deepEqual(c.sets, { home: 1, away: 3 });
    assert.deepEqual(c.points, { home: 25 + 10, away: 20 + 25 + 25 + 25 });
    // at 24-24 in set 2, the winner needs 26 (win by 2)
    const d = volleyballCompletion({ ...s, current: { home: 24, away: 24 } }, 'away')!;
    assert.equal(d.points.away, 20 + 26 + 50);
    // a deciding set goes to 15
    const e = volleyballCompletion({ ...s, sets: [[25, 20], [20, 25], [25, 20], [20, 25]], setsWon: { home: 2, away: 2 }, current: { home: 3, away: 1 } }, 'away')!;
    assert.deepEqual(e.sets, { home: 2, away: 3 });
    assert.equal(e.points.away, 90 + 15);
    const f = forfeitFor({ sport: 'volleyball', kind: 'conceded', winner: 'away', board: { home: 1, away: 0 }, state: s })!;
    assert.deepEqual(f.score, { home: 1, away: 3 });
  });
});

describe('SD-126 · walkover scores in the table', () => {
  const cfg = (sport: string, fmt?: Record<string, unknown>) => standingsConfigFromFormat(sport as SportId, fmt);
  test('legacy walkovers (no forfeit block) still add 0-0; new ones add the federation score', () => {
    const legacy = wm('football', A, B, 'home', { walkover: true, result: { kind: 'conceded', winner: 'home', reason: 'Walkover', at: '' } });
    const t0 = teamStandings([legacy, played('football', B, C, 1, 0)], 'football', cfg('football'));
    assert.deepEqual(t0.find((r) => r.teamId === 'A')!.diff, 0);
    assert.deepEqual(t0.find((r) => r.teamId === 'B')!.diff, 1);
    const fresh = wm('football', A, B, 'home', { walkover: true, result: { kind: 'conceded', winner: 'home', reason: 'Walkover', at: '', forfeit: forfeitFor({ sport: 'football', kind: 'walkover', winner: 'home' }) } });
    const t1 = teamStandings([fresh, played('football', B, C, 1, 0)], 'football', cfg('football'));
    const a = t1.find((r) => r.teamId === 'A')!;
    assert.deepEqual([a.for, a.against, a.diff, a.points], [3, 0, 3, 3]);
    assert.equal(t1.find((r) => r.teamId === 'B')!.diff, -2);
  });
  test('a conceded match keeps its board score on the card, the table counts the forfeit', () => {
    const m = wm('football', A, B, 'home', { score: { home: 1, away: 0 }, result: { kind: 'conceded', winner: 'home', reason: 'B walked off', at: '', score: { home: 1, away: 0 }, forfeit: forfeitFor({ sport: 'football', kind: 'conceded', winner: 'home', board: { home: 1, away: 0 } }) } });
    assert.deepEqual(m.result!.score, { home: 1, away: 0 });
    assert.equal(teamStandings([m], 'football', cfg('football')).find((r) => r.teamId === 'A')!.diff, 3);
    assert.equal(forfeitNote(m.result, 'Aravali', 'Nilgiri'), 'Counted Aravali 3-0 Nilgiri in the table · FIFA 3-0 (forfeit)');
  });
  test('FIBA: 20-0 in the difference and 0 points for the forfeiting team', () => {
    const fiba = standingsPresets('basketball').find((p) => p.id === 'fiba')!.set as Record<string, unknown>;
    const m = wm('basketball', A, B, 'away', { walkover: true, result: { kind: 'conceded', winner: 'away', reason: 'Walkover', at: '', forfeit: forfeitFor({ sport: 'basketball', kind: 'walkover', winner: 'away' }) } });
    const t = teamStandings([m], 'basketball', cfg('basketball', fiba));
    const a = t.find((r) => r.teamId === 'A')!, b = t.find((r) => r.teamId === 'B')!;
    assert.deepEqual([a.points, a.diff, b.points, b.diff], [0, -20, 2, 20]);
  });
  test('FIVB: the forfeit counts in set and point ratios; the preset stores forfeit 0', () => {
    const fivb = standingsPresets('volleyball').find((p) => p.id === 'fivb')!.set as Record<string, unknown>;
    assert.equal(fivb.forfeitLossPoints, 0);
    const c = cfg('volleyball', fivb);
    const wo = wm('volleyball', A, B, 'home', { walkover: true, result: { kind: 'conceded', winner: 'home', reason: 'Walkover', at: '', forfeit: forfeitFor({ sport: 'volleyball', kind: 'walkover', winner: 'home', format: { setsToWin: 3 } }) } });
    assert.deepEqual(matchUnits(wo), { sets: { home: 3, away: 0 }, points: { home: 75, away: 0 } });
    assert.deepEqual(matchPoints(wo, c), { home: 3, away: 0 });
    const st = { ...vbInit({ setsToWin: 3 }), sets: [[25, 20]] as Array<[number, number]>, setsWon: { home: 1, away: 0 }, current: { home: 10, away: 8 } };
    const conceded = wm('volleyball', A, C, 'away', { state: st, result: { kind: 'conceded', winner: 'away', reason: 'injuries', at: '', score: { home: 1, away: 0 }, forfeit: forfeitFor({ sport: 'volleyball', kind: 'conceded', winner: 'away', board: { home: 1, away: 0 }, state: st }) } });
    assert.deepEqual(matchUnits(conceded).sets, { home: 1, away: 3 });
    assert.deepEqual(matchPoints(conceded, c), { home: 0, away: 3 }, '1-3 → 3 points to the winner (no fallback to the partial 1-0)');
    // the same match before SD-126 (no forfeit block) is read as it always was
    const old = { ...conceded, result: { ...conceded.result!, forfeit: undefined } } as Match;
    assert.deepEqual(matchUnits(old).sets, { home: 1, away: 0 });
  });
});
