/**
 * SD-150 (international I-1a): the region model, zone-correct days, date order
 * for typed dates, school-year labels and the reminder-email wording.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIONS, COUNTRY_ORDER, regionFor, resolveCountry, effectiveRegion, countryOfZone,
  parseTypedDate, dateOrderOf, exampleDate, spelledDate, schoolYearLabel, seasonKeyOf,
  defaultSchoolYear, weekdayOrder, leadingBlanks,
} from '../src/core/region.ts';
import {
  localDay, todayIn, zoneShortName, formatDateTime, wallTimeToIso, isoToWall, initialTimeZone,
  intlZonesWork, eventZone, isValidTimeZone, zoneLabel, TIME_ZONES,
} from '../src/core/time.ts';
import { formatDay } from '../src/core/dates.ts';
import { academicYearLabel } from '../src/core/org.ts';
import { seasonOf } from '../src/data/lineContext.ts';
import { parseDateCell, checkDateOrder, importFromText, templateCsv, type ImportContext } from '../src/data/scheduleImport.ts';
import { readDob, parseBulk } from '../src/data/results/entries.ts';
import { emailWhen, emailZone, localeForZone, zoneName } from '../supabase/functions/_shared/localTime.ts';
import type { Team } from '../src/core/types.ts';

describe('region model', () => {
  test('India is the fallback and keeps today\'s behaviour', () => {
    const r = regionFor(undefined);
    assert.equal(r.country, 'IN');
    assert.equal(r.timeZone, 'Asia/Kolkata');
    assert.equal(r.dateOrder, 'DMY');
    assert.equal(r.hour12, false, 'cards stay 24-hour ("21:00")');
    assert.equal(r.entryHour12, true, 'the kickoff picker stays AM/PM');
    assert.equal(r.weekStart, 0, 'Sunday-first calendars');
    assert.equal(r.statsSeasonStartMonth, 1, 'stats seasons stay calendar years');
    assert.deepEqual(r.speechLangs, ['en-IN', 'en-US']);
    assert.equal(r.units, 'metric');
  });
  test('all eight launch markets exist with a valid main zone', () => {
    assert.deepEqual(COUNTRY_ORDER, ['IN', 'AE', 'QA', 'GB', 'SG', 'MY', 'AU', 'US']);
    for (const c of COUNTRY_ORDER) {
      assert.ok(isValidTimeZone(REGIONS[c].timeZone), c);
      assert.equal(REGIONS[c].zones[0].id, REGIONS[c].timeZone);
      for (const z of REGIONS[c].zones) assert.ok(isValidTimeZone(z.id), z.id);
    }
    assert.equal(REGIONS.US.dateOrder, 'MDY');
    assert.equal(REGIONS.US.units, 'us');
    assert.equal(REGIONS.GB.weekStart, 1);
    assert.equal(REGIONS.GB.ageCutoff, 'aug31');
    assert.equal(REGIONS.SG.schoolYearLabel, 'calendar');
    assert.equal(REGIONS.AU.schoolYearStartMonth, 1);
  });
  test('country: saved > device zone > locale (only without a zone) > India', () => {
    assert.equal(resolveCountry({ saved: 'GB', deviceZone: 'Asia/Dubai' }), 'GB');
    assert.equal(resolveCountry({ deviceZone: 'Asia/Dubai', deviceLocaleRegion: 'US' }), 'AE');
    // An Indian phone left on "English (US)" stays India.
    assert.equal(resolveCountry({ deviceZone: 'Asia/Kolkata', deviceLocaleRegion: 'US' }), 'IN');
    assert.equal(resolveCountry({ deviceZone: 'Asia/Calcutta' }), 'IN');
    assert.equal(resolveCountry({ deviceZone: 'Australia/Perth' }), 'AU');
    assert.equal(resolveCountry({ deviceZone: 'America/Chicago' }), 'US');
    assert.equal(resolveCountry({ deviceZone: 'Europe/Berlin', deviceLocaleRegion: 'GB' }), 'IN');
    assert.equal(resolveCountry({ deviceLocaleRegion: 'SG' }), 'SG');
    assert.equal(resolveCountry({ saved: 'XX' }), 'IN');
    assert.equal(countryOfZone('Asia/Qatar'), 'QA');
  });
  test('overrides sit on top of the country', () => {
    const r = effectiveRegion({ country: 'US', dateOrder: 'DMY', hour12: false, weekStart: 1, schoolYearStartMonth: 1 });
    assert.equal(r.dateOrder, 'DMY');
    assert.equal(r.hour12, false);
    assert.equal(r.entryHour12, false);
    assert.equal(r.weekStart, 1);
    assert.equal(r.schoolYearLabel, 'calendar');
    assert.equal(r.units, 'us', 'untouched fields keep the country default');
    assert.equal(effectiveRegion({}, { zone: 'Europe/London' }).country, 'GB');
  });
  test('week order helpers', () => {
    assert.deepEqual(weekdayOrder(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], 1), ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
    assert.equal(leadingBlanks(0, 1), 6, 'a Sunday 1st is the last column of a Monday-first week');
    assert.equal(leadingBlanks(3, 0), 3);
  });
});

describe('typed dates follow the region', () => {
  const TODAY = new Date('2026-10-11T00:00:00Z');
  test('DMY and MDY', () => {
    assert.equal(parseTypedDate('05/03/2012', 'DMY', TODAY), '2012-03-05');
    assert.equal(parseTypedDate('05/03/2012', 'MDY', TODAY), '2012-05-03');
    assert.equal(parseTypedDate('2012-03-05', 'MDY', TODAY), '2012-03-05', 'ISO is always year first');
    assert.equal(parseTypedDate('13/25/2012', 'MDY', TODAY), null);
    assert.equal(parseTypedDate('05-03-12', 'DMY', TODAY), '2012-03-05');
  });
  test('order detection: proven, ambiguous, mixed, none', () => {
    assert.equal(dateOrderOf(['25/10/2026', '01/11/2026']), 'DMY');
    assert.equal(dateOrderOf(['10/25/2026', '11/01/2026']), 'MDY');
    assert.equal(dateOrderOf(['05/03/2026', '06/03/2026']), 'ambiguous');
    assert.equal(dateOrderOf(['25/10/2026', '10/25/2026']), 'mixed');
    assert.equal(dateOrderOf(['12 Oct 2026', '2026-10-12', '']), 'none');
  });
  test('hints', () => {
    assert.equal(exampleDate('DMY'), '05/03/2012');
    assert.equal(exampleDate('MDY'), '03/05/2012');
    assert.equal(spelledDate('2012-03-05'), '5 Mar 2012');
  });
  test('bulk athlete DOBs read month-first in the US', () => {
    assert.equal(readDob('05/03/2012', TODAY), '2012-03-05', 'default unchanged (day first)');
    assert.equal(readDob('05/03/2012', TODAY, 'MDY'), '2012-05-03');
    assert.equal(readDob('03/25/2012', TODAY, 'MDY'), '2012-03-25');
    const [row] = parseBulk('Sam Lee, Red, B, 03/25/2012', 'athletics', TODAY, 'MDY');
    assert.equal(row.dob, '2012-03-25');
    const [bad] = parseBulk('Sam Lee, Red, B, 25/03/2012', 'athletics', TODAY, 'MDY');
    assert.match(bad.error ?? '', /month\/day\/year/);
  });
});

describe('schedule import date order', () => {
  const team = (id: string, name: string) => ({ id, name, shortName: name.slice(0, 3), sport: 'football' }) as Team;
  const RED = team('r', 'Red'), BLUE = team('b', 'Blue');
  const ctx = (dateOrder?: 'DMY' | 'MDY'): ImportContext => ({
    tournament: { id: 't', sports: ['football'], startDate: '2026-03-01', endDate: '2026-12-31' },
    sports: [{ id: 'football', name: 'Football' }], entered: [RED, BLUE], allTeams: [RED, BLUE], existing: [], zone: 'Asia/Kolkata', dateOrder,
  });
  test('parseDateCell honours the order', () => {
    assert.equal(parseDateCell('10/12/2026'), '2026-12-10', 'default day first (India unchanged)');
    assert.equal(parseDateCell('10/12/2026', 'MDY'), '2026-10-12');
    assert.equal(parseDateCell('Oct 12, 2026', 'DMY'), '2026-10-12');
  });
  test('an all-ambiguous US file is read month-first and flagged', () => {
    const r = importFromText('date,time,home_team,away_team\n10/05/2026,4 pm,Red,Blue', ctx('MDY'));
    assert.equal(r.dates.verdict, 'ambiguous');
    assert.equal(r.rows[0].draft?.date, '2026-10-05');
  });
  test('a file that proves the other order wins (and says so)', () => {
    const r = importFromText('date,time,home_team,away_team\n25/10/2026,4 pm,Red,Blue\n05/11/2026,4 pm,Blue,Red', ctx('MDY'));
    assert.equal(r.dates.verdict, 'proven');
    assert.equal(r.dates.order, 'DMY');
    assert.equal(r.dates.switched, true);
    assert.equal(r.rows[1].draft?.date, '2026-11-05');
  });
  test('the organiser\'s explicit choice wins', () => {
    const r = importFromText('date,time,home_team,away_team\n05/10/2026,4 pm,Red,Blue', ctx('DMY'), {}, 'MDY');
    assert.equal(r.rows[0].draft?.date, '2026-05-10');
  });
  test('checkDateOrder on raw rows', () => {
    assert.equal(checkDateOrder([{ line: 2, cells: { date: '13/01/2026' } }], 'MDY').order, 'DMY');
  });
  test('template examples follow the order', () => {
    const csv = templateCsv({ sports: ['football'], startDate: '2026-10-12' }, [RED, BLUE], { dateOrder: 'MDY' });
    assert.match(csv, /\n10\/12\/2026,/);
    assert.match(csv, /MONTH-FIRST/);
    assert.match(templateCsv({ sports: ['football'], startDate: '2026-10-12' }, [RED, BLUE]), /\n12\/10\/2026,.*DAY-FIRST/s);
  });
});

describe('days and today are computed in a zone', () => {
  test('a 9:00 Sydney match is on its Sydney day, not the UTC day', () => {
    const iso = wallTimeToIso('2026-10-12', '09:00', 'Australia/Sydney');
    assert.equal(iso.slice(0, 10), '2026-10-11', 'UTC slice would be wrong');
    assert.equal(localDay(iso, 'Australia/Sydney'), '2026-10-12');
    const ny = wallTimeToIso('2026-10-12', '20:00', 'America/New_York');
    assert.equal(ny.slice(0, 10), '2026-10-13');
    assert.equal(localDay(ny, 'America/New_York'), '2026-10-12');
    assert.equal(localDay('2026-10-12', 'America/New_York'), '2026-10-12', 'a bare day is already a day');
  });
  test('todayIn', () => {
    const at = Date.parse('2026-10-11T22:00:00Z');
    assert.equal(todayIn('Australia/Sydney', at), '2026-10-12');
    assert.equal(todayIn('America/Los_Angeles', at), '2026-10-11');
    assert.equal(todayIn('Asia/Kolkata', at), '2026-10-12');
  });
  test('isoToWall inverts wallTimeToIso (DST zones too)', () => {
    for (const [z, d, t] of [['Europe/London', '2026-07-01', '16:30'], ['Australia/Sydney', '2026-01-10', '07:15'], ['America/Denver', '2026-11-20', '18:00'], ['Asia/Dubai', '2026-10-12', '16:00']] as const) {
      assert.deepEqual(isoToWall(wallTimeToIso(d, t, z), z), { date: d, time: t }, z);
    }
  });
  test('formatDay of a timestamp uses the zone', () => {
    const iso = wallTimeToIso('2026-10-12', '09:00', 'Australia/Sydney');
    assert.equal(formatDay(iso, 'Australia/Sydney'), 'Mon, 12 Oct');
  });
  test('stats season counts the local day', () => {
    // 31 Dec 20:00 UTC is already 1 Jan in India.
    assert.equal(seasonOf('2026-12-31T20:00:00Z')?.key, '2027');
  });
  test('the engine formats arbitrary zones (Node/V8; verify on Hermes devices)', () => {
    assert.equal(intlZonesWork(), true);
  });
});

describe('zones: device seed, names, event zone', () => {
  test('first run uses the device zone, else IST', () => {
    assert.equal(initialTimeZone('Asia/Dubai'), 'Asia/Dubai');
    assert.equal(initialTimeZone(undefined), 'Asia/Kolkata');
    assert.equal(initialTimeZone('Not/AZone'), 'Asia/Kolkata');
    assert.equal(initialTimeZone('Asia/Calcutta'), 'Asia/Kolkata', 'old alias normalised');
  });
  test('proper short names, no GMT+5:30 hack', () => {
    const jan = '2026-01-15T12:00:00Z', jul = '2026-07-15T12:00:00Z';
    assert.equal(zoneShortName('Asia/Kolkata', jan), 'IST');
    assert.equal(zoneShortName('Asia/Dubai', jan), 'GST');
    assert.equal(zoneShortName('Asia/Qatar', jan), 'AST');
    assert.equal(zoneShortName('Europe/London', jan), 'GMT');
    assert.equal(zoneShortName('Europe/London', jul), 'BST');
    assert.equal(zoneShortName('Australia/Sydney', jan), 'AEDT');
    assert.equal(zoneShortName('Australia/Sydney', jul), 'AEST');
    assert.equal(zoneShortName('Australia/Brisbane', jan), 'AEST');
    assert.equal(zoneShortName('America/New_York', jul), 'EDT');
    assert.equal(zoneShortName('America/Phoenix', jul), 'MST');
    assert.equal(zoneShortName('Africa/Nairobi', jan), 'GMT+3');
    assert.equal(zoneShortName('Asia/Kathmandu', jan), 'GMT+5:45');
  });
  test('formatDateTime names the zone', () => {
    const s = formatDateTime('2026-10-12T11:00:00Z', 'Asia/Kolkata');
    assert.match(s, /16:30 IST$/);
    assert.doesNotMatch(s, /GMT/);
  });
  test('eventZone: tournament zone wins, else the viewer', () => {
    assert.equal(eventZone({ timeZone: 'Asia/Dubai' }, 'Asia/Kolkata'), 'Asia/Dubai');
    assert.equal(eventZone({}, 'Asia/Kolkata'), 'Asia/Kolkata');
    assert.equal(eventZone({ timeZone: 'bogus' }, 'Europe/London'), 'Europe/London');
    assert.equal(eventZone(undefined, 'Europe/London'), 'Europe/London');
  });
  test('picker list covers every market zone + labels', () => {
    for (const z of ['Asia/Qatar', 'Asia/Kuala_Lumpur', 'Australia/Perth', 'America/Chicago', 'America/Phoenix']) {
      assert.ok(TIME_ZONES.some((o) => o.id === z), z);
    }
    assert.match(zoneLabel('Africa/Nairobi'), /Nairobi \(GMT\+3\)/);
  });
});

describe('school-year labels', () => {
  test('calendar-year schools read "2026", not "2026–26"', () => {
    assert.equal(schoolYearLabel('2026-01-05', '2026-11-20'), '2026');
    assert.equal(academicYearLabel('2026-01-05', '2026-11-20'), '2026');
    assert.equal(academicYearLabel('2026-04-01', '2027-03-31'), '2026–27', 'India unchanged');
  });
  test('first academic year is seeded from the region', () => {
    assert.deepEqual(defaultSchoolYear(REGIONS.IN, '2026-10-11'), { start: '2026-04-01', end: '2027-03-31', label: '2026–27' });
    assert.deepEqual(defaultSchoolYear(REGIONS.GB, '2026-08-20'), { start: '2025-09-01', end: '2026-08-31', label: '2025–26' });
    assert.deepEqual(defaultSchoolYear(REGIONS.SG, '2026-10-11'), { start: '2026-01-01', end: '2026-12-31', label: '2026' });
    assert.equal(defaultSchoolYear(REGIONS.US, '2026-10-11').start, '2026-08-01');
  });
  test('season keys', () => {
    assert.deepEqual(seasonKeyOf('2026-10-11', 1), { key: '2026', label: '2026' });
    assert.deepEqual(seasonKeyOf('2026-10-11', 9), { key: '2026', label: '2026–27' });
    assert.deepEqual(seasonKeyOf('2026-03-11', 4), { key: '2025', label: '2025–26' });
  });
});

describe('reminder emails use the recipient\'s zone (notify-upcoming)', () => {
  test('zone: recipient → venue → India', () => {
    assert.equal(emailZone('Europe/London', 'Asia/Dubai'), 'Europe/London');
    assert.equal(emailZone(null, 'Asia/Dubai'), 'Asia/Dubai');
    assert.equal(emailZone(null, null), 'Asia/Kolkata');
    assert.equal(emailZone('junk', undefined), 'Asia/Kolkata');
  });
  test('wording per market', () => {
    const iso = '2026-10-12T11:00:00Z';
    assert.match(emailWhen(iso, 'Asia/Kolkata'), /12 Oct.*4:30\s?pm IST$/i);
    assert.match(emailWhen(iso, 'Asia/Dubai'), /12 Oct.*3:00\s?pm GST$/i);
    assert.match(emailWhen(iso, 'Europe/London'), /12:00\s?pm BST$|12:00 BST$/i);
    assert.match(emailWhen(iso, 'America/New_York'), /Oct 12.*7:00\s?AM ET$/i);
    assert.equal(localeForZone('Australia/Perth'), 'en-AU');
    assert.equal(zoneName('Australia/Sydney', Date.parse('2026-01-10T00:00:00Z')), 'AEDT');
  });
});
