/**
 * SD-154 (international I-2b): units (swimming SCY, feet and inches, pounds,
 * miles), meet timetables / prints in the venue's zone, default kickoffs in the
 * tournament zone, weekly fixtures across a term, team levels, feeder
 * tournaments and CSV roster import.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFeetInches, parseFeetInches, metresToFeetInches, formatLb, kgText, formatMiles, distanceText,
  fieldUnitsOf, massUnitsOf, distanceUnitsOf, regionFormatDefaults, looksImperial,
} from '../src/core/units.ts';
import {
  formatMark, parseMark, disciplineOf, phaseDiscipline, swimEventsFor, swimMeetSettings, courseShort, courseLabel, swimLabel,
  markKey, markKeyDiscipline, markRange, rangeCheck, splitsText, COURSES,
  dayKey, hhmm, atOf, sessionOf, setMeetZone, suggestRounds, timetableDays, nextFreeSlot, nextDayKey, sheetDoc,
} from '../src/data/results/index.ts';
import { weeklyTimes, matchDays, parseSkipDates, readTime, defaultKickoff, weekdayOf, addDaysKey, minutesApartTimes } from '../src/data/fixtureSchedule.ts';
import { teamLabel, levelRank, levelSuggestions } from '../src/core/teamLevels.ts';
import { feederQualifiers, knockoutPlaces, readQualifiesTo, qualifiesLine } from '../src/data/feeders.ts';
import { parseCsv, mapHeaders, parseRoster, importable, ageOn, ROSTER_TEMPLATE } from '../src/data/rosterImport.ts';
import { teamStandings } from '../src/data/standings.ts';
import type { Match, Team } from '../src/core/types.ts';

describe('units', () => {
  test('feet and inches round-trip through centimetres', () => {
    assert.equal(formatFeetInches(6.51), `21' 4¼"`);
    assert.equal(formatFeetInches(1.83), `6' 0"`);
    for (const m of [1.2, 1.83, 4.05, 5.12, 6.51, 7.33, 12.4, 18.91, 55.55, 70.01]) {
      assert.equal(parseFeetInches(formatFeetInches(m)), m, `round-trip ${m}`);
    }
    assert.deepEqual(metresToFeetInches(0.0254 * 13), { feet: 1, inches: 1 });
  });
  test('typed feet-and-inches forms', () => {
    assert.equal(parseFeetInches(`21' 4.25"`), 6.51);
    assert.equal(parseFeetInches(`21'4¼"`), 6.51);
    assert.equal(parseFeetInches('21-04.25'), 6.51);
    assert.equal(parseFeetInches('21 ft 4 in'), 6.5);
    assert.equal(parseFeetInches('6-02'), 1.88);
    assert.equal(parseFeetInches(`6'`), 1.83);
    assert.equal(parseFeetInches('21-13'), null, 'inches ≥ 12');
    assert.equal(parseFeetInches('abc'), null);
    assert.ok(looksImperial('16-09.25') && looksImperial(`5'`) && !looksImperial('6.45'));
  });
  test('pounds and miles are display only', () => {
    assert.equal(formatLb(105), '231.5 lb');
    assert.equal(formatLb(100), '220.5 lb');
    assert.equal(kgText(105, 'kg+lb'), '105 kg (231.5 lb)');
    assert.equal(kgText(105), '105 kg');
    assert.equal(formatMiles(5000), '3.1 mi');
    assert.equal(formatMiles(42195), '26.2 mi');
    assert.equal(distanceText(10000, 'mi'), '10 km (6.2 mi)');
    assert.equal(distanceText(10000), '10 km');
  });
  test('meet setting wins, else the viewer region; India stays metric', () => {
    assert.equal(fieldUnitsOf(undefined, 'metric'), 'metric');
    assert.equal(fieldUnitsOf(undefined, 'us'), 'imperial');
    assert.equal(fieldUnitsOf({ fieldUnits: 'auto' }, 'us'), 'imperial');
    assert.equal(fieldUnitsOf({ fieldUnits: 'metric' }, 'us'), 'metric');
    assert.equal(fieldUnitsOf({ fieldUnits: 'imperial' }, 'metric'), 'imperial');
    assert.equal(massUnitsOf(undefined, 'metric'), 'kg');
    assert.equal(massUnitsOf({ massUnits: 'kg+lb' }), 'kg+lb');
    assert.equal(distanceUnitsOf(undefined, 'us'), 'mi');
    assert.deepEqual(regionFormatDefaults('swimming', 'metric'), {});
    assert.deepEqual(regionFormatDefaults('swimming', 'us'), { course: 'SCY' });
    assert.deepEqual(regionFormatDefaults('athletics', 'us'), { fieldUnits: 'imperial', distanceUnits: 'mi' });
    assert.deepEqual(regionFormatDefaults('football', 'us'), {});
  });
  test('field marks in a US meet: shown in ft-in, stored in metres', () => {
    const lj = { ...disciplineOf('ath.lj')!, displayUnits: 'imperial' as const };
    assert.equal(formatMark(6.51, lj), `21' 4¼"`);
    assert.equal(formatMark(6.51, disciplineOf('ath.lj')!), '6.51', 'metric meets unchanged');
    assert.deepEqual(parseMark('21-04.25', lj), { mark: 6.51 });
    assert.deepEqual(parseMark('6.45', lj), { mark: 6.45 }, 'metres still accepted');
    assert.deepEqual(parseMark(`6' 2"`, disciplineOf('ath.hj')!), { mark: 1.88 }, 'ft-in accepted in any meet');
    assert.equal(parseMark('21-04', disciplineOf('ath.100m')!), null, 'never for a time');
  });
});

describe('swimming short course yards (SCY)', () => {
  test('course setting, labels and short names', () => {
    assert.equal(swimMeetSettings({ course: 'SCY' }).course, 'SCY');
    assert.equal(swimMeetSettings({}).course, 'LCM', 'existing meets stay long course');
    assert.equal(courseShort('SCY'), 'SCY');
    assert.match(courseLabel('SCY'), /25 yd/);
    assert.equal(COURSES.length, 3);
    assert.equal(swimLabel('4 × 50 m freestyle relay', 'SCY'), '4 × 50 yd freestyle relay');
    assert.equal(swimLabel('50 m freestyle', 'LCM'), '50 m freestyle');
    const d = phaseDiscipline(disciplineOf('swim.100fly')!, { category: { course: 'SCY' } });
    assert.equal(d.label, '100 yd butterfly');
    assert.equal(phaseDiscipline(disciplineOf('swim.100fly')!, { category: { course: 'SCM' } }).label, '100 m butterfly');
  });
  test('the yards programme: 500 / 1000 / 1650 free, no 400 / 800 / 1500', () => {
    const keys = swimEventsFor({ age: 'Open', gender: 'F' }, 'SCY').map((e) => e.discipline);
    for (const k of ['swim.50free', 'swim.500free', 'swim.1000free', 'swim.1650free', 'swim.100im', 'swim.400im', 'swim.4x100medley']) assert.ok(keys.includes(k), k);
    for (const k of ['swim.400free', 'swim.800free', 'swim.1500free']) assert.ok(!keys.includes(k), k);
    assert.ok(swimEventsFor({ age: 'Open', gender: 'F' }, 'SCY').every((e) => !/\d m\b/.test(e.label)), 'labels in yards');
    const lcm = swimEventsFor({ age: 'Open', gender: 'F' }, 'LCM').map((e) => e.discipline);
    assert.ok(!lcm.includes('swim.500free') && lcm.includes('swim.1500free'));
    assert.equal(disciplineOf('swim.1650free')!.label, '1650 yd freestyle');
  });
  test('records and PBs kept apart from metres', () => {
    assert.equal(markKey('swim.100free', 'SCY'), 'm_sw_100free_yd');
    assert.deepEqual(markKeyDiscipline('m_sw_100free_yd'), { discipline: 'swim.100free', course: 'SCY' });
    assert.deepEqual(markKeyDiscipline('m_sw_100free_sc'), { discipline: 'swim.100free', course: 'SCM' });
    assert.equal(markKey('swim.100free', 'LCM'), 'm_sw_100free_lc');
  });
  test('plausible ranges per course', () => {
    const r = markRange('swim.100free', 'SCY')!;
    assert.ok(r.min < markRange('swim.100free', 'SCM')!.min);
    assert.ok(markRange('swim.1650free', 'SCY'));
    assert.equal(markRange('swim.1650free', 'LCM'), null);
    const def = disciplineOf('swim.50free')!;
    assert.equal(rangeCheck(def, 21.5, 'SCY'), null);
    assert.ok(rangeCheck(def, 15, 'SCY'));
  });
  test('splits read in yards', () => {
    assert.equal(splitsText([25.1, 52.3], (v) => v.toFixed(2), 'swim.200free', 'SCY'), '50 yd 25.10 · 100 yd 52.30 (27.20)');
    assert.equal(splitsText([25.1], (v) => v.toFixed(2), 'swim.200free'), '50 m 25.10');
  });
});

describe('meet timetable in the venue zone', () => {
  afterEach(() => setMeetZone(undefined));
  test('days, times and sessions follow the meet zone, not the device', () => {
    setMeetZone('Asia/Dubai');
    const at = '2026-11-12T05:30:00.000Z'; // 09:30 in Dubai
    assert.equal(dayKey(at), '2026-11-12');
    assert.equal(hhmm(at), '09:30');
    assert.equal(sessionOf(at), 'AM');
    assert.equal(atOf('2026-11-12', '09:30'), at);
    setMeetZone('America/Los_Angeles');
    const late = '2026-11-13T04:00:00.000Z'; // 20:00 on the 12th in LA
    assert.equal(dayKey(late), '2026-11-12');
    assert.equal(hhmm(late), '20:00');
    assert.equal(sessionOf(late), 'EVE');
    assert.equal(atOf('2026-11-12', '20:00'), late);
  });
  test('suggested slots and free slots are venue time', () => {
    setMeetZone('Australia/Sydney');
    const first = atOf('2026-11-12', '10:00')!;
    const [, fin] = suggestRounds(first, [{ phase: 'heat', heats: 2 }, { phase: 'final', heats: 1 }]);
    assert.equal(hhmm(fin), '15:00');
    assert.equal(dayKey(fin), '2026-11-12');
    assert.equal(hhmm(nextFreeSlot([], '2026-11-13', 'Track')), '09:00');
    assert.equal(dayKey(nextFreeSlot([], '2026-11-13', 'Track')), '2026-11-13');
    const days = timetableDays([], { start: '2026-11-12', end: '2026-11-14' });
    assert.deepEqual(days.map((d) => d.day), ['2026-11-12', '2026-11-13', '2026-11-14']);
    assert.equal(nextDayKey('2026-12-31'), '2027-01-01');
  });
  test('printed footer names the zone', () => {
    setMeetZone('Asia/Dubai');
    const html = sheetDoc({ title: 'T', header: { name: 'Meet' }, sheets: ['<p>x</p>'], printedAt: new Date('2026-11-12T05:30:00Z') });
    assert.match(html, /Printed Thu 12 Nov 2026 09:30 (GST|GMT\+4)/);
  });
});

describe('fixture timing', () => {
  test('default kickoff is tomorrow 10:00 in the tournament zone', () => {
    const now = new Date('2026-10-11T22:00:00Z'); // already the 12th in Dubai
    const iso = defaultKickoff('Asia/Dubai', { now });
    assert.equal(iso, '2026-10-13T06:00:00.000Z');
    assert.equal(defaultKickoff('Asia/Kolkata', { now: new Date('2026-10-11T06:00:00Z'), time: '14:00' }), '2026-10-12T08:30:00.000Z');
  });
  test('weekly across a term: one round per match day, holidays skipped', () => {
    assert.equal(weekdayOf('2026-09-09'), 3);
    const skip = parseSkipDates('26/10/2026 - 30/10/2026\n18/11/2026', 'DMY');
    assert.equal(skip.days.length, 6);
    assert.deepEqual(skip.bad, []);
    const plan = { weekdays: [3], time: '15:30', termStart: '2026-10-14', termEnd: '2026-12-16', skip: skip.days, gapMin: 0 };
    const pairs = [{ round: 1 }, { round: 1 }, { round: 2 }, { round: 3 }, { round: 4 }];
    const res = weeklyTimes(pairs, plan, 'Europe/London');
    assert.deepEqual([...res.roundDays.values()], ['2026-10-14', '2026-10-21', '2026-11-04', '2026-11-11']);
    assert.equal(res.times[0], '2026-10-14T14:30:00.000Z', '15:30 BST');
    assert.equal(res.times[1], res.times[0], 'gap 0: same time');
    assert.equal(res.times[3], '2026-11-04T15:30:00.000Z', '15:30 GMT after the clocks change');
    assert.deepEqual(res.skipped, ['2026-10-28']);
    assert.equal(res.overflow, 0);
    const staggered = weeklyTimes(pairs, { ...plan, gapMin: 60 }, 'Europe/London');
    assert.equal(staggered.times[1], '2026-10-14T15:30:00.000Z');
  });
  test('two match days a week (US Tue/Fri), term overflow', () => {
    assert.deepEqual(matchDays({ weekdays: [2, 5], time: '16:00', termStart: '2026-09-01' }, 4), ['2026-09-01', '2026-09-04', '2026-09-08', '2026-09-11']);
    const res = weeklyTimes([{ round: 1 }, { round: 2 }, { round: 3 }], { weekdays: [3], time: '16:00', termStart: '2026-09-01', termEnd: '2026-09-10' }, 'America/New_York');
    assert.equal(res.overflow, 1);
    assert.equal(res.times[2], undefined);
  });
  test('typed times and dates', () => {
    assert.equal(readTime('3:30 pm'), '15:30');
    assert.equal(readTime('1530'), '15:30');
    assert.equal(readTime('12 am'), '00:00');
    assert.equal(readTime('25:00'), null);
    assert.deepEqual(parseSkipDates('10/26/2026', 'MDY').days, ['2026-10-26']);
    assert.deepEqual(parseSkipDates('nonsense').bad, ['nonsense']);
    assert.equal(addDaysKey('2026-02-28', 1), '2026-03-01');
    assert.deepEqual(minutesApartTimes(2, '2026-10-12T10:00:00.000Z', 90), ['2026-10-12T10:00:00.000Z', '2026-10-12T11:30:00.000Z']);
  });
});

const team = (id: string, name: string, level?: string): Team => ({ id, name, shortName: name.slice(0, 3).toUpperCase(), sport: 'football', ...(level ? { level } : {}) });
let mid = 0;
const match = (h: Team, a: Team, hs: number, as: number, extra: Partial<Match> = {}): Match => ({
  id: `m${++mid}`, tournamentId: 't1', sport: 'football', homeTeam: h, awayTeam: a, status: 'completed', startsAt: '2026-10-01T10:00:00Z',
  score: { home: hs, away: as }, winner: hs > as ? 'home' : hs < as ? 'away' : 'draw', ...extra,
} as Match);

describe('team levels', () => {
  test('label, already-named teams, order', () => {
    assert.equal(teamLabel({ name: 'Greenwood', level: 'JV' }), 'Greenwood JV');
    assert.equal(teamLabel({ name: 'Greenwood JV', level: 'JV' }), 'Greenwood JV');
    assert.equal(teamLabel({ name: 'Greenwood' }), 'Greenwood');
    assert.ok(levelRank('Varsity') < levelRank('JV') && levelRank('A') < levelRank('B') && levelRank(undefined) === 0);
    assert.equal(levelSuggestions('US')[0], 'Varsity');
    assert.equal(levelSuggestions('GB')[0], 'A');
  });
  test('tables show the level', () => {
    const v = team('v', 'Greenwood', 'Varsity'), j = team('j', 'Greenwood', 'JV');
    const rows = teamStandings([match(v, j, 2, 1)], 'football');
    assert.deepEqual(rows.map((r) => r.name).sort(), ['Greenwood JV', 'Greenwood Varsity']);
  });
});

describe('feeder tournaments', () => {
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((x) => team(x, `School ${x}`));
  test('top N of each group', () => {
    const ms = [match(a, b, 2, 0, { group: 'A' }), match(c, d, 0, 1, { group: 'B' })];
    const r = feederQualifiers(ms, 'football', { topN: 1, per: 'group' });
    assert.deepEqual(r.qualifiers.map((q) => [q.teamId, q.how]), [['A', 'Group A 1st'], ['D', 'Group B 1st']]);
    assert.equal(r.provisional, false);
    const p = feederQualifiers([...ms, match(a, b, 0, 0, { group: 'A', status: 'scheduled', winner: undefined })], 'football', { topN: 1, per: 'group' });
    assert.equal(p.provisional, true);
  });
  test('final places from the knockout', () => {
    const ms = [match(a, b, 1, 0, { stage: 'sf' }), match(c, d, 3, 1, { stage: 'sf' }), match(a, c, 0, 2, { stage: 'final' })];
    assert.deepEqual(knockoutPlaces(ms).map((q) => [q.teamId, q.rank]), [['C', 1], ['A', 2], ['B', 3], ['D', 3]]);
    assert.deepEqual(feederQualifiers(ms, 'football', { topN: 2, per: 'overall' }).qualifiers.map((q) => q.teamId), ['C', 'A']);
    assert.deepEqual(feederQualifiers(ms, 'football', { topN: 3, per: 'group' }).qualifiers.map((q) => q.teamId), ['C', 'A', 'B', 'D'], 'no groups → final places; shared 3rd both go');
  });
  test('league table when no knockout', () => {
    const ms = [match(a, b, 2, 0), match(c, d, 2, 1), match(a, c, 1, 0)];
    assert.deepEqual(feederQualifiers(ms, 'football', { topN: 2, per: 'overall' }).qualifiers.map((q) => q.teamId), ['A', 'C']);
  });
  test('stored links', () => {
    assert.equal(readQualifiesTo(null), undefined);
    assert.equal(readQualifiesTo({ tournamentId: 'x', topN: 0 }), undefined);
    assert.deepEqual(readQualifiesTo({ tournamentId: 'x', topN: 2, per: 'weird' }), { tournamentId: 'x', topN: 2, per: 'group' });
    assert.equal(qualifiesLine({ tournamentId: 'x', tournamentName: 'National Finals', topN: 2, per: 'group' }), 'Top 2 of each group go through to National Finals');
  });
});

describe('CSV roster import', () => {
  const today = new Date('2026-10-12T00:00:00Z');
  test('CSV parsing: quotes, semicolons, tabs, BOM', () => {
    assert.deepEqual(parseCsv('﻿Name,House\n"Rao, Asha",Red\r\n'), [['Name', 'House'], ['Rao, Asha', 'Red']]);
    assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
    assert.deepEqual(parseCsv('a\tb\n"x ""y"""\t2'), [['a', 'b'], ['x "y"', '2']]);
  });
  test('MIS-style headers map', () => {
    const m = mapHeaders(['Legal Surname', 'Preferred Forename', 'Date of Birth', 'Sex', 'Reg Group', 'House', 'Primary Contact Email', 'Primary Contact Phone']);
    assert.deepEqual(m, { last: 0, first: 1, dob: 2, gender: 3, standard: 4, house: 5, guardianEmail: 6, guardianPhone: 7 });
  });
  test('rows, guardian contact in E.164, warnings, errors', () => {
    const csv = ROSTER_TEMPLATE('DMY') + 'Ben Ali,31/02/2012,M,Year 8,Blue,,,,not-an-email,\nCara Lee,14/01/2013,girl,Year 7,Green,,x,,,07400 123456\n';
    const r = parseRoster(csv, { order: 'DMY', country: 'GB', today });
    assert.equal(r.rows.length, 3);
    const [asha, ben, cara] = r.rows;
    assert.equal(asha.dob, '2012-03-05');
    assert.equal(asha.gender, 'Female');
    assert.deepEqual(asha.guardian, { name: 'Meera Rao', email: 'meera@example.com', phone: '+447400123456' });
    assert.equal(asha.jersey, 7);
    assert.ok(ben.errors.some((e) => /date of birth/.test(e)) && ben.errors.some((e) => /email/.test(e)));
    assert.equal(cara.guardian?.phone, '+447400123456', 'local number in the region country');
    assert.ok(cara.warnings.some((w) => /Jersey/.test(w)));
    assert.equal(importable(r.rows).length, 2);
    assert.equal(ageOn('2012-03-05', today), 14);
  });
  test('US month-first, proven by the file, and ambiguity', () => {
    const us = parseRoster('Name,DOB\nAmy,03/25/2012\nBo,04/05/2012', { order: 'MDY', country: 'US', today });
    assert.equal(us.rows[1].dob, '2012-04-05');
    assert.equal(us.ambiguousDates, false);
    const proved = parseRoster('Name,DOB\nAmy,03/25/2012', { order: 'DMY', today });
    assert.equal(proved.rows[0].dob, '2012-03-25');
    assert.equal(proved.orderFromFile, 'MDY');
    const amb = parseRoster('Name,DOB\nAmy,04/05/2012', { order: 'DMY', today });
    assert.equal(amb.ambiguousDates, true);
    assert.equal(amb.rows[0].dob, '2012-05-04');
    assert.equal(parseRoster('Name,DOB\nAmy,04/05/2012', { order: 'DMY', forceOrder: 'MDY', today }).rows[0].dob, '2012-04-05');
  });
  test('duplicates: in the file and already in the school', () => {
    const r = parseRoster('Name,DOB\nAsha Rao,05/03/2012\nasha  rao,05/03/2012\nZed,01/01/2012', {
      order: 'DMY', today, existing: [{ id: 'p1', fullName: 'Zed', dob: '2012-01-01' }],
    });
    assert.equal(r.rows[1].dupInFile, 2);
    assert.equal(r.rows[2].duplicateOf?.id, 'p1');
    assert.deepEqual(importable(r.rows).map((x) => x.fullName), ['Asha Rao']);
    assert.equal(importable(r.rows, true).length, 2);
  });
  test('no header: name, dob, gender, class, house', () => {
    const r = parseRoster('Asha Rao,05/03/2012,F,Year 8,Red', { order: 'DMY', today });
    assert.equal(r.rows[0].house, 'Red');
    assert.equal(r.rows[0].standard, 'Year 8');
    assert.ok(r.rows[0].warnings.some((w) => /guardian/.test(w)), 'under 18 without a guardian contact');
  });
});
