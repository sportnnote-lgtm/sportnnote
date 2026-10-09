/**
 * Bulk schedule import (parity #24): spreadsheet text → validated match drafts.
 * Also the DST-safe wall-time helper and the extracted match-format rule.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDelimited, parseDelimitedLines, toRawRows, columnFor, parseDateCell, parseTimeCell,
  normName, matchTeam, stageFrom, validateImport, templateCsv, importFromText, importSummary,
  mostUsedVenue, slugify, type ImportContext, type RawRow,
} from '../src/data/scheduleImport.ts';
import { wallTimeToIso } from '../src/core/time.ts';
import { matchFormatFor } from '../src/data/matchFormat.ts';
import type { Match, Team, Tournament } from '../src/core/types.ts';

const team = (id: string, name: string, shortName = name.slice(0, 3).toUpperCase(), sport = 'football'): Team =>
  ({ id, name, shortName, sport }) as Team;
const RED = team('t-red', 'Red House', 'RED');
const BLUE = team('t-blue', 'Blue House', 'BLU');
const GREEN = team('t-green', 'Green House', 'GRN');
const YELLOW = team('t-yel', 'Yellow House', 'YEL');
const STJ = team('t-stj', "St. John's & Co", 'SJC');
const OUTSIDE = team('t-out', 'Riverside FC', 'RIV');
const CRICKET_RED = team('c-red', 'Red House', 'RED', 'cricket');
const CRICKET_BLUE = team('c-blue', 'Blue House', 'BLU', 'cricket');

const tour = { id: 'tour1', sports: ['football'], startDate: '2026-10-12', endDate: '2026-10-14', grounds: ['Main Ground', 'Back Field'] } as unknown as ImportContext['tournament'];
const SPORTS = [{ id: 'football', name: 'Football' }, { id: 'cricket', name: 'Cricket' }] as ImportContext['sports'];
const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  tournament: tour, sports: SPORTS,
  entered: [RED, BLUE, GREEN, YELLOW, STJ],
  allTeams: [RED, BLUE, GREEN, YELLOW, STJ, OUTSIDE, CRICKET_RED],
  existing: [], zone: 'Asia/Kolkata', ...over,
});
const row = (line: number, cells: RawRow['cells']): RawRow => ({ line, cells });
const base = { date: '12/10/2026', time: '4:30 pm', home_team: 'Red House', away_team: 'Blue House', venue: 'Main Ground' };

describe('parseDelimited', () => {
  test('quoted CSV: commas, doubled quotes and newlines inside quotes', () => {
    const csv = 'date,home_team,venue\n12/10/2026,"Red, House","He said ""hi"""\n13/10/2026,Blue,"Line 1\nLine 2"\n';
    assert.deepEqual(parseDelimited(csv), [
      ['date', 'home_team', 'venue'],
      ['12/10/2026', 'Red, House', 'He said "hi"'],
      ['13/10/2026', 'Blue', 'Line 1\nLine 2'],
    ]);
  });
  test('TSV (cells pasted from Excel / Sheets) wins over commas', () => {
    assert.deepEqual(parseDelimited('date\tvenue\n12/10/2026\tGround 1, North\n'), [['date', 'venue'], ['12/10/2026', 'Ground 1, North']]);
  });
  test('semicolons (European Excel)', () => {
    assert.deepEqual(parseDelimited('date;home\r\n12.10.2026;Red\r\n'), [['date', 'home'], ['12.10.2026', 'Red']]);
  });
  test('BOM stripped; blank and # lines dropped; line numbers kept', () => {
    const lines = parseDelimitedLines('﻿date,home\n\n# a comment, with commas\n12/10/2026,Red\n,\n"# quoted comment"\n13/10/2026,Blue');
    assert.deepEqual(lines.map((l) => [l.line, l.cells[0]]), [[1, 'date'], [4, '12/10/2026'], [7, '13/10/2026']]);
  });
  test('headers: case/space-insensitive with aliases; headerless rows use template order', () => {
    assert.equal(columnFor('Home Team'), 'home_team');
    assert.equal(columnFor('TEAM A'), 'home_team');
    assert.equal(columnFor('team 1'), 'home_team');
    assert.equal(columnFor('Ground'), 'venue');
    assert.equal(columnFor('Round'), 'stage');
    assert.equal(columnFor('Notes'), null);
    const withHeader = toRawRows(parseDelimitedLines('Team A,Team B,Date,Notes\nRed,Blue,12/10/2026,x'));
    assert.equal(withHeader.hasHeader, true);
    assert.deepEqual(withHeader.rows[0].cells, { home_team: 'Red', away_team: 'Blue', date: '12/10/2026' });
    assert.deepEqual(withHeader.unknownColumns, ['Notes']);
    const bare = toRawRows(parseDelimitedLines('12/10/2026\t16:30\tRed\tBlue'));
    assert.equal(bare.hasHeader, false);
    assert.deepEqual(bare.rows[0].cells, { date: '12/10/2026', time: '16:30', home_team: 'Red', away_team: 'Blue' });
  });
});

describe('dates and times', () => {
  test('dates: ISO, day-first numeric, month names, Excel serials', () => {
    assert.equal(parseDateCell('2026-10-12'), '2026-10-12');
    assert.equal(parseDateCell('12/10/2026'), '2026-10-12'); // day-first
    assert.equal(parseDateCell('12-10-26'), '2026-10-12');
    assert.equal(parseDateCell('12.10.2026'), '2026-10-12');
    assert.equal(parseDateCell('2/3/2026'), '2026-03-02');
    assert.equal(parseDateCell('12 Oct 2026'), '2026-10-12');
    assert.equal(parseDateCell('12-Oct-26'), '2026-10-12');
    assert.equal(parseDateCell('Oct 12, 2026'), '2026-10-12');
    assert.equal(parseDateCell('Mon, 12 October 2026'), '2026-10-12');
    assert.equal(parseDateCell('46307'), '2026-10-12');
    assert.equal(parseDateCell('46307.6875'), '2026-10-12');
    for (const bad of ['', '31/02/2026', '13/13/2026', 'next friday', '12/10', '123']) assert.equal(parseDateCell(bad), null, bad);
  });
  test('times: 24 h, seconds, am/pm, hhmm, Excel fractions', () => {
    assert.equal(parseTimeCell('14:30'), '14:30');
    assert.equal(parseTimeCell('14:30:00'), '14:30');
    assert.equal(parseTimeCell('9.05'), '09:05');
    assert.equal(parseTimeCell('2:30 pm'), '14:30');
    assert.equal(parseTimeCell('2 PM'), '14:00');
    assert.equal(parseTimeCell('12 am'), '00:00');
    assert.equal(parseTimeCell('12:15 p.m.'), '12:15');
    assert.equal(parseTimeCell('1430'), '14:30');
    assert.equal(parseTimeCell('930'), '09:30');
    assert.equal(parseTimeCell('0.6041666667'), '14:30');
    assert.equal(parseTimeCell('0.5'), '12:00');
    for (const bad of ['', '25:00', '13 pm', '14:75', 'noon']) assert.equal(parseTimeCell(bad), null, bad);
  });
  test('wallTimeToIso: IST and a DST zone', () => {
    assert.equal(wallTimeToIso('2026-10-12', '16:30', 'Asia/Kolkata'), '2026-10-12T11:00:00.000Z');
    // London: BST (UTC+1) before the 25 Oct 2026 switch, GMT after it.
    assert.equal(wallTimeToIso('2026-10-24', '15:00', 'Europe/London'), '2026-10-24T14:00:00.000Z');
    assert.equal(wallTimeToIso('2026-10-26', '15:00', 'Europe/London'), '2026-10-26T15:00:00.000Z');
    // New York spring-forward day: 10:00 is already EDT (UTC−4).
    assert.equal(wallTimeToIso('2026-03-08', '10:00', 'America/New_York'), '2026-03-08T14:00:00.000Z');
    // 02:30 doesn't exist that night → lands after the gap (03:30 EDT).
    assert.equal(wallTimeToIso('2026-03-08', '02:30', 'America/New_York'), '2026-03-08T07:30:00.000Z');
  });
});

describe('matchTeam', () => {
  const entered = [RED, BLUE, STJ];
  const all = [RED, BLUE, STJ, OUTSIDE, GREEN];
  test('normName folds case, &, punctuation and spaces', () => {
    assert.equal(normName("  St. John's & Co "), 'st john s and co');
  });
  test('ok: exact name or short name in the tournament', () => {
    assert.deepEqual(matchTeam('red house', entered, all), { status: 'ok', team: RED });
    assert.deepEqual(matchTeam('BLU', entered, all), { status: 'ok', team: BLUE });
    assert.deepEqual(matchTeam("St John's and Co", entered, all), { status: 'ok', team: STJ });
  });
  test('notEntered: exact among all teams of the sport', () => {
    assert.deepEqual(matchTeam('Riverside FC', entered, all), { status: 'notEntered', team: OUTSIDE });
  });
  test('suggest: unique substring or a near-miss spelling', () => {
    assert.deepEqual(matchTeam('Red Huose', entered, all), { status: 'suggest', team: RED, entered: true });
    assert.deepEqual(matchTeam('Blue', entered, all), { status: 'suggest', team: BLUE, entered: true });
    assert.deepEqual(matchTeam('Riverside', entered, all), { status: 'suggest', team: OUTSIDE, entered: false });
  });
  test('missing: nothing close, or an ambiguous substring', () => {
    assert.deepEqual(matchTeam('Purple Panthers', entered, all), { status: 'missing' });
    assert.deepEqual(matchTeam('House', entered, all), { status: 'missing' }); // Red/Blue both contain it
    assert.deepEqual(matchTeam('', entered, all), { status: 'missing' });
  });
});

test('stageFrom: group words, knockout ids, free text kept', () => {
  assert.equal(stageFrom('Group'), 'group');
  assert.equal(stageFrom('league'), 'group');
  assert.equal(stageFrom('Pool B'), 'group');
  assert.equal(stageFrom('R16'), 'r16');
  assert.equal(stageFrom('Round of 16'), 'r16');
  assert.equal(stageFrom('QF'), 'qf');
  assert.equal(stageFrom('Quarter-final'), 'qf');
  assert.equal(stageFrom('Semi Final'), 'sf');
  assert.equal(stageFrom('SF'), 'sf');
  assert.equal(stageFrom('Final'), 'final');
  assert.equal(stageFrom('Super Four'), 'super');
  assert.equal(stageFrom('Friendly round'), 'Friendly round');
  assert.equal(stageFrom(''), undefined);
});

describe('validateImport', () => {
  const existing = (over: Partial<Match>): Match => ({
    id: 'm-old', sport: 'football', status: 'scheduled', startsAt: wallTimeToIso('2026-10-13', '16:00', 'Asia/Kolkata'),
    venueName: 'Back Field', homeTeam: GREEN, awayTeam: YELLOW, ...over,
  }) as Match;

  test('a clean row is ok with an IST instant and the tournament spelling of the ground', () => {
    const [r] = validateImport([row(2, { ...base, venue: 'main ground', stage: 'QF' })], ctx());
    assert.equal(r.status, 'ok', JSON.stringify(r.issues));
    assert.equal(r.draft?.startsAt, '2026-10-12T11:00:00.000Z');
    assert.equal(r.draft?.venueName, 'Main Ground');
    assert.equal(r.draft?.stage, 'qf');
    assert.equal(r.draft?.home.id, RED.id);
  });
  test('home = away is an error', () => {
    const [r] = validateImport([row(2, { ...base, away_team: 'RED' })], ctx());
    assert.equal(r.status, 'error');
    assert.match(r.issues.map((i) => i.msg).join(), /can't play itself/);
  });
  test('a date outside start − 1 … end + 7 is an error; the edges are fine', () => {
    const out = validateImport([
      row(2, { ...base, date: '10/10/2026' }),
      row(3, { ...base, date: '11/10/2026' }),
      row(4, { ...base, date: '21/10/2026', home_team: 'Green House', away_team: 'Yellow House' }),
      row(5, { ...base, date: '22/10/2026' }),
    ], ctx());
    assert.deepEqual(out.map((r) => r.status), ['error', 'ok', 'ok', 'error']);
  });
  test('bad / missing date, unknown team, unknown sport → errors; blank time → warning', () => {
    const out = validateImport([
      row(2, { ...base, date: '31/02/2026' }),
      row(3, { ...base, date: '' }),
      row(4, { ...base, home_team: 'Purple Panthers' }),
      row(5, { ...base, sport: 'Quidditch' }),
      row(6, { ...base, sport: 'Cricket' }),
      row(7, { ...base, time: '' }),
    ], ctx());
    assert.deepEqual(out.map((r) => r.status), ['error', 'error', 'error', 'error', 'error', 'warn']);
    assert.equal(out[5].draft?.time, '09:00');
  });
  test('sport is required in a multi-sport tournament and picks that sport\'s teams', () => {
    const multi = { ...tour, sports: ['football', 'cricket'] } as unknown as ImportContext['tournament'];
    const c = ctx({ tournament: multi, entered: [RED, BLUE, CRICKET_RED, CRICKET_BLUE] });
    const [noSport, cricket] = validateImport([row(2, base), row(3, { ...base, sport: 'cricket', away_team: 'Green House' })], c);
    assert.equal(noSport.status, 'error');
    // cricket has only Red House; "Green House" is not a cricket team
    assert.equal(cricket.status, 'error');
    const [ok] = validateImport([row(2, { ...base, sport: 'Cricket', away_team: 'Red House' })], c);
    assert.equal(ok.status, 'error'); // Red v Red
    const [ok2] = validateImport([row(2, { ...base, sport: 'Cricket' })], c);
    assert.equal(ok2.draft?.home.id, 'c-red');
  });
  test('suggestions and not-entered teams warn, and the draft adds the team', () => {
    const [sug, out] = validateImport([
      row(2, { ...base, home_team: 'Red Huose' }),
      row(3, { ...base, date: '13/10/2026', away_team: 'Riverside FC' }),
    ], ctx());
    assert.equal(sug.status, 'warn');
    assert.equal(sug.issues[0].fix?.id, RED.id);
    assert.match(sug.issues[0].msg, /did you mean Red House/);
    // the row says outright what an unconfirmed suggestion imports as
    assert.match(sug.issues[0].msg, /Will import as Red House\./);
    assert.equal(sug.draft?.home.id, RED.id);
    assert.equal(out.status, 'warn');
    assert.deepEqual(out.draft?.addTeamIds, [OUTSIDE.id]);
  });
  test('a duplicate fixture (same teams, same day) against an existing match and an earlier row', () => {
    const c = ctx({ existing: [existing({ venueName: 'Elsewhere', startsAt: wallTimeToIso('2026-10-13', '09:00', 'Asia/Kolkata') })] });
    const out = validateImport([
      row(2, { ...base, date: '13/10/2026', home_team: 'Yellow House', away_team: 'Green House' }),
      row(3, base),
      row(4, { ...base, time: '8 pm', venue: 'Back Field', home_team: 'Blue House', away_team: 'Red House' }),
    ], c);
    assert.equal(out[0].status, 'warn');
    assert.match(out[0].issues.map((i) => i.msg).join(), /already scheduled/);
    assert.equal(out[1].status, 'ok');
    assert.equal(out[2].status, 'warn');
    assert.match(out[2].issues.map((i) => i.msg).join(), /Same fixture as row #3/);
  });
  test('a venue clash with an existing match and with an earlier row', () => {
    const c = ctx({ existing: [existing({})] }); // Back Field, 13 Oct 16:00
    const out = validateImport([
      row(2, { ...base, date: '13/10/2026', time: '17:00', venue: 'Back Field' }),
      row(3, base),
      row(4, { ...base, time: '5 pm', home_team: 'Green House', away_team: 'Yellow House' }),
      row(5, { ...base, date: '14/10/2026', venue: 'Main Ground' }),
    ], c);
    assert.equal(out[0].status, 'warn');
    assert.match(out[0].issues[0].msg, /Back Field is busy then \(Green House v Yellow House\)/);
    assert.equal(out[1].status, 'ok');
    assert.equal(out[2].status, 'warn');
    assert.match(out[2].issues[0].msg, /Main Ground is busy then \(row #3\)/);
    assert.equal(out[3].status, 'ok');
  });
  test('a skipped row no longer clashes with later rows', () => {
    const rows = [row(2, base), row(3, { ...base, home_team: 'Green House', away_team: 'Yellow House' })];
    assert.equal(validateImport(rows, ctx())[1].status, 'warn');
    assert.equal(validateImport(rows, ctx({ skipLines: new Set([2]) }))[1].status, 'ok');
  });
  test('the five-row demo paste: 2 ready / 2 to check / 1 won\'t import; the fix clears the warning', () => {
    const text = [
      'date\ttime\thome_team\taway_team\tvenue',
      '12/10/2026\t9:00 am\tRed House\tBlue House\tMain Ground',
      '12/10/2026\t4:30 pm\tGreen House\tYellow House\tMain Ground',
      '13/10/2026\t9:00 am\tRed Huose\tGreen House\tBack Field',
      '13/10/2026\t10:00 am\tBlue House\tYellow House\tBack Field',
      '32/10/2026\t9:00 am\tBlue House\tGreen House\tMain Ground',
    ].join('\n');
    const first = importFromText(text, ctx());
    // row #4's "Red Huose" will import as Red House unless fixed or skipped
    assert.deepEqual(importSummary(first.rows), { ok: 2, warn: 2, error: 1, guessed: 1 });
    const fixed = importFromText(text, ctx(), { 4: { home_team: 'Red House' } });
    assert.equal(fixed.rows.find((r) => r.line === 4)?.status, 'ok');
    assert.deepEqual(importSummary(fixed.rows, new Set([6])), { ok: 3, warn: 1, error: 0, guessed: 0 });
  });
});

describe('templateCsv', () => {
  test('header, two example rows from real teams, a # format note; round-trips with zero errors', () => {
    const matches = [{ venueName: 'Back Field' }, { venueName: 'back field' }, { venueName: 'Main Ground' }] as Match[];
    const csv = templateCsv(tour as unknown as Tournament, [RED, BLUE, GREEN, YELLOW], { matches, sportName: () => 'Football' });
    const lines = csv.trim().split('\r\n');
    assert.equal(lines[0], 'date,time,home_team,away_team,venue,group,stage,sport');
    assert.equal(lines[1], '12/10/2026,4:30 pm,Red House,Blue House,Back Field,A,Group,Football');
    assert.match(lines[3], /^"# One row per match\. Dates are DAY-FIRST/);
    const res = importFromText(csv, ctx());
    assert.equal(res.rows.length, 2);
    assert.equal(res.rows.filter((r) => r.status === 'error').length, 0, JSON.stringify(res.rows.map((r) => r.issues)));
  });
  test('mostUsedVenue prefers the busiest tournament ground; slugify', () => {
    assert.equal(mostUsedVenue(['A', 'B'], [{ venueName: 'b' }, { venueName: 'Z' }, { venueName: 'Z' }] as Match[]), 'B');
    assert.equal(mostUsedVenue([], [{ venueName: 'b' }, { venueName: 'Z' }, { venueName: 'Z' }] as Match[]), 'Z');
    assert.equal(mostUsedVenue(undefined, []), '');
    assert.equal(slugify('Inter-House Cup 2026!'), 'inter-house-cup-2026');
  });
});

describe('matchFormatFor (extracted from GenerateFixtures)', () => {
  // The rule exactly as GenerateFixtures had it inline before the extraction.
  function legacy(tournament: any, sport: string, koLike: boolean, defaults: Record<string, unknown>) {
    let format: Record<string, unknown> = tournament?.formats?.[sport] ?? defaults;
    if (sport === 'football') {
      if (koLike) {
        const kf = tournament?.knockoutFormat;
        if (format.decider == null && kf) {
          format = { ...format, decider: kf.decider,
            ...(kf.extraTimeMinutes != null ? { extraTimeMinutes: kf.extraTimeMinutes } : {}),
            ...(kf.extraTimeSubs != null ? { extraTimeSubs: kf.extraTimeSubs } : {}) };
        }
      } else {
        const { decider, extraTimeMinutes, extraTimeSubs, ...rest } = format;
        format = rest;
      }
    }
    return format;
  }
  const defaults = { halfMinutes: 45, playersPerSide: 11 };
  const tournaments = [
    null,
    {},
    { formats: { football: { halfMinutes: 30, decider: 'penalties' }, cricket: { overs: 20 } } },
    { formats: { football: { halfMinutes: 30 } }, knockoutFormat: { decider: 'extra_time', extraTimeMinutes: 15, extraTimeSubs: 1 } },
    { knockoutFormat: { decider: 'penalties' } },
  ];
  test('unchanged output for every sport / knockout / tournament combination', () => {
    for (const t of tournaments) for (const sport of ['football', 'cricket']) for (const ko of [true, false]) {
      assert.deepEqual(matchFormatFor(t as never, sport as never, ko, defaults), legacy(t, sport, ko, defaults), JSON.stringify({ t, sport, ko }));
    }
  });
  test('knockout football gets the decider; league football has it stripped', () => {
    const t = tournaments[3] as never;
    assert.deepEqual(matchFormatFor(t, 'football', true), { halfMinutes: 30, decider: 'extra_time', extraTimeMinutes: 15, extraTimeSubs: 1 });
    assert.deepEqual(matchFormatFor(tournaments[2] as never, 'football', false), { halfMinutes: 30 });
  });
});
