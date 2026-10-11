/**
 * SD-92 athletics road races, race walks and cross-country on the results
 * engine: the catalogue (standard + custom distances), finish-order ranking
 * with optional times, road-time entry (TR 19.24 whole seconds), team scoring
 * by placings (3 bases, incomplete teams, the last-scorer tie-break), race-walk
 * red cards (TR 54.7, Penalty Zone), records only on a certified course,
 * ranges, stat lines, the career, the medal / house table and the schema.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, roadEventOf, roadKey, ROAD_EVENTS, xcDistance, defaultTeamScoring, roadRange, markRange, rangeCheck,
  parseRoadTime, entryByBib, orderClash, walkCards, dqCards, penaltyMinutes, teamScores, teamAwards, teamLine, tieBrokenByLast, describeTeamScoring,
  roadLines, roadMarkKey, roadKeyDiscipline, markKey, markKeyDiscipline, roadRecordsAllowed, athleticsCareer, eventAwards, meetFieldResults, eventLeaders,
  deriveRecordBook, groupMeet, withRecordFlags, blankEntries, unconfirmedOutOfRange, performanceOf, placeOnLine, nextFin, phaseTeams, teamText, roadRowText,
  type DisciplineDef, type EntryResult, type ResultEntry, type MeetPhase, type PhaseFormat, type TeamScoring,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { STAT_SCHEMAS } from '../src/sports/statSchemas.ts';
import { validateSchema } from '../src/sports/statSchema.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const R10 = D('ath.road.10000'), XC = D('ath.xc.3000'), W3 = D('ath.walk.t3000'), W10 = D('ath.walk.10000');

/* ------------------------------ a school XC ------------------------------ */

const H = { R: 'Red House', B: 'Blue House', G: 'Green House', Y: 'Gold House' } as const;
type HK = keyof typeof H;
// team-place order among the complete teams (Red, Blue, Green: 6 each); Gold's 3 finishers slot in after the 3rd, 9th and 15th
const TEAM_ORDER: HK[] = ['R', 'B', 'G', 'B', 'R', 'G', 'G', 'R', 'B', 'B', 'R', 'G', 'R', 'B', 'G', 'R', 'B', 'G'];
function schoolXc(): ResultEntry[] {
  const line: HK[] = [];
  TEAM_ORDER.forEach((h, i) => { line.push(h); if (i === 2 || i === 8 || i === 14) line.push('Y'); });
  const out: ResultEntry[] = line.map((h, i) => ({ id: `x${i + 1}`, athleteId: `p${i + 1}`, name: `${h} runner ${i + 1}`, heat: 1, team: { id: `t${h}`, name: H[h] }, result: { order: i + 1, bib: String(100 + i + 1), fin: i + 1 } }));
  // Gold's other three: one DNF, one DNS, one still out on the course
  out.push({ id: 'y-dnf', athleteId: 'py1', name: 'Gold DNF', heat: 1, team: { id: 'tY', name: H.Y }, result: { order: 30, bib: '130', status: 'DNF' } });
  out.push({ id: 'y-dns', athleteId: 'py2', name: 'Gold DNS', heat: 1, team: { id: 'tY', name: H.Y }, result: { order: 31, bib: '131', status: 'DNS' } });
  out.push({ id: 'y-out', athleteId: 'py3', name: 'Gold Out', heat: 1, team: { id: 'tY', name: H.Y }, result: { order: 32, bib: '132' } });
  return out;
}
const TEAMS4: TeamScoring = { scorers: 4, size: 6, basis: 'teams' };

describe('catalogue', () => {
  test('standard road and walk distances, custom distances parsed on demand', () => {
    assert.equal(R10.label, '10 km road race');
    assert.equal(D('ath.road.hm').label, 'Half marathon');
    assert.equal(D('ath.road.mar').label, 'Marathon');
    assert.equal(D('ath.road.7500').label, '7.5 km road race');
    assert.equal(XC.label, 'Cross-country 3 km');
    assert.equal(W3.label, '3000 m race walk');
    assert.equal(W10.label, '10 km race walk');
    for (const d of [R10, XC, W3, W10]) { assert.equal(d.capture, 'order'); assert.equal(d.tie, 'road'); assert.equal(d.sport, 'athletics'); }
    assert.equal(R10.dp, 0); assert.equal(W3.dp, 2); // TR 19.24: road to the whole second, a track walk to 1/100
    assert.equal(roadKey('road', 21097.5), 'ath.road.hm');
    assert.equal(roadKey('walk', 3000, true), 'ath.walk.t3000');
    assert.equal(roadEventOf('ath.xc.hm'), null);
    assert.equal(roadEventOf('ath.100m'), null);
    assert.ok(ROAD_EVENTS.length >= 11);
  });
  test('XC distances by age group and the default team rule', () => {
    assert.equal(xcDistance('U10'), 1000);
    assert.equal(xcDistance('U14', 'M'), 3000);
    assert.equal(xcDistance('U14', 'F'), 2000);
    assert.equal(xcDistance('U20', 'M'), 8000);
    assert.equal(xcDistance('Open', 'F'), 10000);
    assert.deepEqual(defaultTeamScoring('U14'), { scorers: 4, size: 6, basis: 'teams', points: true });
    assert.equal(defaultTeamScoring('Open').scorers, 6);
  });
});

describe('finish order', () => {
  test('ranked by the order of finish; unplaced, then DNF, DNS', () => {
    const rows = rankEntries(schoolXc(), XC);
    assert.equal(rows[0].id, 'x1');
    assert.equal(rows[20].position, 21);
    assert.deepEqual(rows.slice(21).map((r) => r.label), ['', 'DNF', 'DNS']);
    assert.ok(rows.every((r) => r.bestLegal == null)); // cross-country: no PBs
  });
  test('times are optional — a typed time is the mark; tap order and move up reuse the cycling helpers', () => {
    const es: ResultEntry[] = [1, 2, 3].map((i) => ({ id: `r${i}`, athleteId: `a${i}`, name: `R${i}`, heat: 1, result: { order: i, bib: `${i}` } }));
    const p1 = placeOnLine(es, 'r2', nextFin(es)); es[1].result = p1[0].result;
    es[0].result = { ...es[0].result, fin: nextFin(es), mark: 1950 };
    const rows = rankEntries(es, R10);
    assert.deepEqual(rows.map((r) => [r.id, r.position, r.bestText]), [['r2', 1, ''], ['r1', 2, '32:30'], ['r3', null, '']]);
    assert.equal(rows[1].bestLegal, 1950);
    assert.equal(performanceOf(es[0], R10).bestLegal, 1950);
  });
  test('road times: digits fill from the right; fractions go to the next whole second (TR 19.24)', () => {
    assert.equal(parseRoadTime('3412', R10), 34 * 60 + 12);
    assert.equal(parseRoadTime('13405', R10), 3600 + 34 * 60 + 5);
    assert.equal(parseRoadTime('1:34:05', R10), 5645);
    assert.equal(parseRoadTime('34:12.31', R10), 34 * 60 + 13);
    assert.equal(parseRoadTime('13:05.421', W3), 785.43);
    assert.equal(parseRoadTime('3480', R10), null); // 80 s
    assert.equal(parseRoadTime('', R10), null);
  });
  test('bib lookup and order / time clashes', () => {
    const es = schoolXc();
    assert.equal(entryByBib(es, ' 105 ')?.id, 'x5');
    assert.equal(entryByBib(es, '999'), null);
    es[0].result.mark = 600; es[2].result.mark = 640;
    assert.match(orderClash(es, 'x2', 650) ?? '', /finished behind/);
    assert.match(orderClash(es, 'x2', 590) ?? '', /finished ahead/);
    assert.equal(orderClash(es, 'x2', 620), null);
  });
  test('blank rows: still to cross the line', () => {
    assert.deepEqual(blankEntries(schoolXc(), XC).map((e) => e.id), ['y-out']);
  });
});

describe('team scoring by placings', () => {
  test('complete teams re-placed; non-scorers displace; the tie goes to the better last scorer; incomplete not ranked', () => {
    const t = teamScores(rankEntries(schoolXc(), XC), TEAMS4);
    assert.deepEqual(t.map((x) => [x.name, x.label, x.total, x.last]), [
      ['Blue House', '1', 25, 10], ['Red House', '2', 25, 11], ['Green House', '3', 28, 12], ['Gold House', 'inc', null, undefined],
    ]);
    assert.deepEqual([...tieBrokenByLast(t)].sort(), ['id:tB', 'id:tR']);
    assert.equal(teamLine(t[0]), '2 + 4 + 9 + 10 = 25  (14, 17)');
    assert.equal(teamLine(t[3]), '3 finished — incomplete');
    // Red's non-scorers (13th, 16th team place) still took places from Green's 5th / 6th runners
    assert.deepEqual(t.find((x) => x.name === 'Green House')!.runners.map((r) => r.place), [3, 6, 7, 12, 15, 18]);
  });
  test("'overall' counts everyone's own place (the Gold runners too)", () => {
    const t = teamScores(rankEntries(schoolXc(), XC), { ...TEAMS4, basis: 'overall' });
    const red = t.find((x) => x.name === 'Red House')!;
    assert.deepEqual(red.runners.filter((r) => r.scoring).map((r) => r.place), [1, 6, 9, 13]);
    assert.equal(red.total, 29);
  });
  test("'scorers' — non-scorers don't displace", () => {
    const t = teamScores(rankEntries(schoolXc(), XC), { ...TEAMS4, basis: 'scorers' });
    // 12 scorers placed 1…12, nothing for the 5th / 6th runners
    assert.deepEqual(t.filter((x) => x.complete).map((x) => x.total).sort((a, b) => a! - b!), [25, 25, 28]);
    assert.ok(t.every((x) => x.runners.filter((r) => !r.scoring).every((r) => r.place == null)));
  });
  test('team size: later finishers run as individuals; 3-scorer school rule', () => {
    const t = teamScores(rankEntries(schoolXc(), XC), { scorers: 3, size: 4, basis: 'teams' });
    assert.equal(t.find((x) => x.name === 'Gold House')!.complete, true); // 3 finishers = complete with 3 scorers
    assert.ok(t.every((x) => x.runners.length <= 4));
    assert.match(describeTeamScoring({ scorers: 4, size: 6, basis: 'teams' }), /first 4 of up to 6.*displace.*last scorer/);
  });
  test('team awards share points on an exact tie; medals; the medal table gets houses from both tables', () => {
    const t = teamScores(rankEntries(schoolXc(), XC), TEAMS4);
    const a = teamAwards(t, { positionPoints: [10, 8, 6, 4] });
    assert.deepEqual(a.map((x) => [x.name, x.medal, x.points]), [['Blue House', 'gold', 10], ['Red House', 'silver', 8], ['Green House', 'bronze', 6]]);
    const exact = teamAwards([{ ...t[0], position: 1 }, { ...t[1], position: 1 }], { positionPoints: [10, 8] });
    assert.deepEqual(exact.map((x) => x.points), [9, 9]);
    const fmt: PhaseFormat = { discipline: XC.key, category: { age: 'U14', gender: 'M' }, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'ev1', eventTitle: 'Cross-country 3 km U14 Boys', road: { kind: 'xc', team: { ...TEAMS4, points: true } } };
    const phase: MeetPhase = { id: 'ph1', format: fmt, status: 'completed', date: '2026-10-11', entries: schoolXc() };
    const fr = meetFieldResults(groupMeet([phase]), { positionPoints: [8, 7, 6, 5, 4, 3, 2, 1] });
    assert.deepEqual(fr.map((x) => x.event), ['Cross-country 3 km U14 Boys', 'Cross-country 3 km U14 Boys — Team']);
    const table = medalStandings([], [], { mode: 'position' } as never, undefined, fr);
    const blue = table.find((r) => r.name === 'Blue House')!;
    // Blue: 2nd (7) and 5th (4) individually + team gold (8)
    assert.equal(blue.total, 19);
    assert.equal(blue.golds, 1);
    assert.match(teamText(phaseTeams(fmt, rankEntries(schoolXc(), XC))), /1\. Blue House 25 pts \(2\+4\+9\+10\)/);
    // team points off → no team row
    const off = meetFieldResults(groupMeet([{ ...phase, format: { ...fmt, road: { kind: 'xc', team: { ...TEAMS4, points: false } } } }]), {});
    assert.equal(off.length, 1);
  });
});

describe('race walks (TR 54.7)', () => {
  test('3 red cards disqualify; with the Penalty Zone rule 3 = zone, 4 = DQ', () => {
    assert.equal(dqCards(), 3); assert.equal(dqCards(true), 4);
    assert.deepEqual(walkCards({ rc: 2 }), { cards: 2, dq: false, penalty: false, text: '2 red cards' });
    assert.equal(walkCards({ rc: 3 }).dq, true);
    const pz = walkCards({ rc: 3 }, { kind: 'walk', penaltyZone: true }, 10000);
    assert.equal(pz.dq, false); assert.equal(pz.penalty, true); assert.match(pz.text, /penalty zone 1 min/);
    assert.equal(penaltyMinutes(5000), 0.5); assert.equal(penaltyMinutes(20000), 2);
    const row = rankEntries([{ id: 'w', athleteId: 'w', name: 'W', heat: 1, result: { fin: 1, bib: '7', rc: 2 } }], W10)[0];
    assert.equal(roadRowText(row, { discipline: W10.key, road: { kind: 'walk' } }), '2 red cards');
  });
});

describe('records, PBs and ranges', () => {
  test('records only on a certified course with gun timing; never cross-country', () => {
    assert.equal(roadRecordsAllowed({ discipline: R10.key, road: { kind: 'road', certified: true } }), true);
    assert.equal(roadRecordsAllowed({ discipline: R10.key, road: { kind: 'road' } }), false);
    assert.equal(roadRecordsAllowed({ discipline: R10.key, road: { kind: 'road', certified: true, timing: 'chip' } }), false);
    assert.equal(roadRecordsAllowed({ discipline: W3.key, road: { kind: 'walk' } }), true);
    assert.equal(roadRecordsAllowed({ discipline: XC.key, road: { kind: 'xc', certified: true } }), false);
    assert.equal(roadRecordsAllowed({ discipline: 'ath.100m' }), true);
    const mk = (id: string, certified: boolean, t: number): MeetPhase => ({
      id, status: 'completed', date: '2026-10-01', entries: [{ id: `${id}e`, athleteId: 'a', name: 'Asha', heat: 1, result: { fin: 1, mark: t } }],
      format: { discipline: R10.key, category: { age: 'Open', gender: 'F' }, phase: 'final', phaseNo: 1, heats: 1, eventKey: id, road: { kind: 'road', certified } },
    });
    const book = deriveRecordBook(groupMeet([mk('a', false, 2000), mk('b', true, 2100)]), 'SR');
    assert.deepEqual(book.map((r) => r.value), [2100]);
  });
  test('PB flags from earlier road times (any course); ranges by distance and age', () => {
    const rows = rankEntries([{ id: 'e', athleteId: 'a', name: 'Asha', heat: 1, result: { fin: 1, mark: 2400 } }], R10);
    const flagged = withRecordFlags(rows, R10, { history: [{ athleteId: 'a', discipline: R10.key, value: 2450, date: '2026-01-05' }], records: [], category: 'Open-F', seasonFrom: '2026-01-01' });
    assert.deepEqual(flagged[0].flags, ['PB']);
    assert.deepEqual(roadRange(R10.key), { min: 1500, max: 9000 });
    assert.deepEqual(roadRange(R10.key, 'U12'), { min: 1500, max: 10000 });
    assert.equal(roadRange('ath.road.mar')!.min, 7173);
    assert.equal(roadRange(W10.key)!.min, 2250);
    assert.ok(markRange(R10.key));
    assert.match(rangeCheck(R10, 1200)?.message ?? '', /too fast/);
    assert.equal(unconfirmedOutOfRange({ fin: 1, mark: 1200 }, R10), true);
    assert.equal(unconfirmedOutOfRange({ fin: 1, mark: 1200, rangeOk: true }, R10), false);
  });
  test('mark keys round-trip; leaders show the fastest road time', () => {
    assert.equal(roadMarkKey('ath.road.10000'), 'm_road_10000');
    assert.equal(markKey('ath.road.hm'), 'm_road_hm');
    assert.equal(markKey('ath.walk.t3000'), 'm_walk_t3000');
    assert.equal(roadKeyDiscipline('m_walk_t3000'), 'ath.walk.t3000');
    assert.deepEqual(markKeyDiscipline('m_road_7500'), { discipline: 'ath.road.7500' });
    assert.deepEqual(markKeyDiscipline('m_100m'), { discipline: 'ath.100m' });
    const p: MeetPhase = { id: 'p', status: 'live', date: '2026-10-11', entries: [{ id: 'e', athleteId: 'a', name: 'Asha', heat: 1, result: { fin: 1, mark: 2222 } }], format: { discipline: R10.key, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'k', eventTitle: '10 km' } };
    assert.equal(eventLeaders(groupMeet([p]))[0]?.text, '37:02');
  });
});

describe('stat lines and career', () => {
  test('XC lines: place, team place, team medals, scorer — no time key; road lines carry the PB key', () => {
    const ranked = rankEntries(schoolXc(), XC);
    const teams = teamScores(ranked, TEAMS4);
    const lines = roadLines({ discipline: XC.key, road: { kind: 'xc', team: TEAMS4 } }, ranked, eventAwards(ranked), teams, teamAwards(teams));
    const blue2 = lines.find((l) => l.playerId === 'p2')!;
    assert.deepEqual(blue2.stats, { races: 1, finals: 1, xc: 1, place: 2, silvers: 1, posPoints: 7, teamScorer: 1, teamPlace: 1, teamGolds: 1 });
    assert.ok(!lines.some((l) => l.playerId === 'py2')); // DNS writes nothing
    assert.deepEqual(lines.find((l) => l.playerId === 'py1')!.stats, { races: 1, finals: 1, xc: 1, dnf: 1 });
    const r10 = rankEntries([{ id: 'e', athleteId: 'a', name: 'Asha', heat: 1, result: { fin: 1, mark: 2400 } }], R10);
    assert.deepEqual(roadLines({ discipline: R10.key }, r10)[0].stats, { races: 1, finals: 1, road: 1, place: 1, mark: 2400, m_road_10000: 2400 });
    const w = rankEntries([{ id: 'e', athleteId: 'a', name: 'Asha', heat: 1, result: { fin: 1, mark: 800, rc: 1 } }], W3);
    assert.equal(roadLines({ discipline: W3.key }, w)[0].stats.walkCards, 1);
  });
  test('career: best time per distance, XC places, team medals', () => {
    const lines = [
      { eventId: 'a', date: '2026-02-01', stats: { races: 1, finals: 1, road: 1, place: 3, mark: 2500, m_road_10000: 2500 } },
      { eventId: 'b', date: '2026-05-01', stats: { races: 1, finals: 1, road: 1, place: 1, mark: 2440, m_road_10000: 2440, golds: 1 } },
      { eventId: 'c', date: '2026-09-01', stats: { races: 1, finals: 1, xc: 1, place: 4, teamPlace: 1, teamGolds: 1, teamScorer: 1 } },
      { eventId: 'd', date: '2026-10-01', stats: { races: 1, finals: 1, xc: 1, place: 2, teamPlace: 2, teamSilvers: 1, teamScorer: 1 } },
    ];
    const c = athleticsCareer(lines, new Map(), '2026-01-01');
    assert.equal(c.road, 2); assert.equal(c.xc, 2); assert.equal(c.teamGolds, 1); assert.equal(c.teamSilvers, 1); assert.equal(c.teamScored, 2);
    assert.equal(c.bests[0].label, '10 km road race');
    assert.equal(c.bests[0].pb.text, '40:40');
    assert.equal(c.bestXc?.place, 2);
    assert.match(c.history[1].text, /4th · team 1st 🥇/);
    assert.deepEqual(c.history[2].flags, ['PB']);
  });
  test('the athletics schema stays valid and declares the road keys', () => {
    assert.deepEqual(validateSchema(STAT_SCHEMAS.athletics), []);
    const keys = new Set(STAT_SCHEMAS.athletics.stats.map((s) => s.key));
    for (const k of ['road', 'walks', 'xc', 'teamScorer', 'teamPlace', 'teamGolds', 'teamSilvers', 'teamBronzes', 'walkCards', 'm_road_10000', 'pb_road_hm', 'm_walk_t3000']) assert.ok(keys.has(k), k);
  });
});

void ({} as EntryResult);
