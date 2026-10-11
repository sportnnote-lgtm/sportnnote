/**
 * SD-130 — record-book integrity (operations merged like the server does,
 * concurrent finals keep both records, reopen restores, historic board paste),
 * age on the meet's cut-off day, and the category / individual champions.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, groupMeet, updateRecords, rankEntries, withRecordFlags, applyRecordOps, recordOpsFor, historicRecord, parseRecordBoard,
  parseCategory, findDiscipline, bestRecords, categoryChampions, champKey, houseTable, championsText, champTieOf, eligibleFor, formatMark, recordLine,
  type DisciplineDef, type EntryResult, type MeetPhase, type PhaseFormat, type RecordMark, type ResultEntry, type Category,
} from '../src/data/results/index.ts';
import { ageOn, ageCutoff, cutoffLabel, meetAgeOf } from '../src/core/age.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const M100 = D('ath.100m'), LJ = D('ath.lj');
const rec = (v: number, holder: string, extra: Partial<RecordMark> = {}): RecordMark => ({ scope: 'MR', discipline: 'ath.100m', category: 'U14-M', value: v, holder, ...extra });

describe('record book as operations (no lost writes)', () => {
  test('two finals locked at once, each from the same stale book, both keep their record', () => {
    const stale: RecordMark[] = [];
    const sprint = updateRecords(rankEntries([{ id: 'a', athleteId: 'p1', name: 'Asha', heat: 1, result: { mark: 12.5, wind: 0.5 } }], M100), M100, 'U14-M', stale, '2026-11-20', ['MR'], 'ev100');
    const jump = updateRecords(rankEntries([{ id: 'b', athleteId: 'p2', name: 'Ravi', heat: 1, result: { attempts: [{ mark: 5.1, wind: 0.5 }] } }], LJ), LJ, 'U14-M', stale, '2026-11-20', ['MR'], 'evLJ');
    // the old write: whole book → the second write erased the first
    assert.equal(jump.length, 1);
    // the new write: each final sends only its operations, merged on the current book
    let server: RecordMark[] = [];
    server = applyRecordOps(server, recordOpsFor(stale, sprint));
    server = applyRecordOps(server, recordOpsFor(stale, jump));
    assert.deepEqual(server.map((r) => r.holder).sort(), ['Asha', 'Ravi']);
  });
  test('"better" keeps a record set meanwhile when it is still better (lower time / higher mark)', () => {
    const book = [rec(12.4, 'Fast')];
    const after = applyRecordOps(book, [{ op: 'better', rec: rec(12.5, 'Slower', { eventKey: 'x' }), better: 'lower' }]);
    assert.equal(after[0].holder, 'Fast');
    const lj = applyRecordOps([{ ...rec(5.2, 'Long'), discipline: 'ath.lj' }], [{ op: 'better', rec: { ...rec(5.3, 'Longer'), discipline: 'ath.lj' }, better: 'higher' }]);
    assert.equal(lj[0].holder, 'Longer');
    assert.deepEqual(recordOpsFor(book, book), []);
  });
  test('set / remove / restore', () => {
    let b = applyRecordOps([], [{ op: 'set', rec: rec(12.6, 'Old Champ', { historic: true, year: 2009 }) }]);
    b = applyRecordOps(b, [{ op: 'better', rec: rec(12.5, 'Asha', { eventKey: 'ev1' }), better: 'lower' }]);
    assert.equal(b[0].holder, 'Asha');
    b = applyRecordOps(b, [{ op: 'restore', discipline: 'ath.100m', category: 'U14-M', eventKey: 'ev1', before: [rec(12.6, 'Old Champ', { historic: true, year: 2009 })] }]);
    assert.deepEqual(b.map((r) => [r.holder, r.year]), [['Old Champ', 2009]]);
    b = applyRecordOps(b, [{ op: 'remove', scope: 'MR', discipline: 'ath.100m', category: 'U14-M' }]);
    assert.deepEqual(b, []);
  });
  test('a historic record on the board means the first final does not automatically set a record', () => {
    const board = [historicRecord({ scope: 'MR', discipline: 'ath.100m', category: { age: 'U14', gender: 'M' }, mark: '12.20', holder: 'K. Menon', year: 2004 }).rec!];
    const rows = rankEntries([{ id: 'a', athleteId: 'p1', name: 'Asha', heat: 1, result: { mark: 12.5, wind: 0.5 } }], M100);
    assert.deepEqual(recordOpsFor(board, updateRecords(rows, M100, 'U14-M', board, '2026-11-20')), []); // nothing to write
    assert.ok(!withRecordFlags(rows, M100, { history: [], records: board, category: 'U14-M', seasonFrom: '2026-01-01' })[0].flags.includes('MR'));
    const faster = rankEntries([{ id: 'a', athleteId: 'p1', name: 'Asha', heat: 1, result: { mark: 12.1, wind: 0.5 } }], M100);
    assert.ok(withRecordFlags(faster, M100, { history: [], records: board, category: 'U14-M', seasonFrom: '2026-01-01' })[0].flags.includes('MR'));
  });
});

describe('the historic record board', () => {
  test('one record by hand: mark parsed per event, holder and year checked', () => {
    const r = historicRecord({ scope: 'SR', discipline: 'ath.800m', category: { age: 'U17', gender: 'F' }, mark: '2:31.4', holder: ' Meera ', team: 'Blue House', year: 1998 });
    assert.deepEqual([r.rec?.value, r.rec?.holder, r.rec?.team, r.rec?.category, r.rec?.date, r.rec?.historic], [151.4, 'Meera', 'Blue House', 'U17-F', '1998', true]);
    assert.match(historicRecord({ scope: 'MR', discipline: 'ath.100m', category: {}, mark: 'fast', holder: 'X' }).error!, /time/);
    assert.match(historicRecord({ scope: 'MR', discipline: 'ath.100m', category: {}, mark: '12.1', holder: '' }).error!, /name/);
    assert.match(historicRecord({ scope: 'MR', discipline: 'ath.100m', category: {}, mark: '12.1', holder: 'X', year: 3000 }).error!, /year/);
  });
  test('paste a board: commas or tabs, header skipped, bad lines reported with their line number', () => {
    const text = 'Event, Category, Mark, Holder, House, Year\n100 m, U14 Boys, 12.84, Asha Rao, Red House, 2009\nLong jump\tU-17 girls\t4.92\tMeera\t\t1998\nshot put, Open Men, 12.1, Arjun\n200 m, U14 Wizards, 25.1, Z\nHammer, U14 Boys, 30, Q';
    const out = parseRecordBoard(text, 'athletics', 'MR');
    const ok = out.filter((r) => r.rec);
    assert.deepEqual(ok.map((r) => [r.rec!.discipline, r.rec!.category, r.rec!.value, r.rec!.holder, r.rec!.team ?? '', r.rec!.year ?? 0]), [
      ['ath.100m', 'U14-M', 12.84, 'Asha Rao', 'Red House', 2009],
      ['ath.lj', 'U17-F', 4.92, 'Meera', '', 1998],
      ['ath.sp', 'Open-M', 12.1, 'Arjun', '', 0],
      ['ath.ht', 'U14-M', 30, 'Q', '', 0],
    ]);
    assert.deepEqual(out.filter((r) => r.error).map((r) => r.line), [5]);
    assert.equal(out.find((r) => r.line === 6)?.rec?.discipline, 'ath.ht'); // "Hammer" → Hammer throw
  });
  test('categories and events are read loosely', () => {
    assert.deepEqual(parseCategory('U-14 Girls'), { age: 'U14', gender: 'F' });
    assert.deepEqual(parseCategory('open'), { age: 'Open' });
    assert.equal(parseCategory('wizards'), null);
    assert.equal(findDiscipline('athletics', '4x100m')?.key, 'ath.4x100');
    assert.equal(findDiscipline('swimming', '50 m freestyle')?.key, 'swim.50free');
    assert.equal(recordLine(rec(12.84, 'Asha', { team: 'Red House', year: 2009 }), formatMark), '100 m U14 Boys — 12.84 Asha (Red House) 2009');
  });
  test('the school book: best of derived marks and the historic board', () => {
    const derived = [{ ...rec(12.4, 'Recent'), scope: 'SR' as const }];
    const historic = [{ ...rec(12.2, 'Legend', { historic: true, year: 1990 }), scope: 'SR' as const }, { ...rec(5.1, 'Jumper'), scope: 'SR' as const, discipline: 'ath.lj' }];
    assert.deepEqual(bestRecords(derived, historic).map((r) => r.holder).sort(), ['Jumper', 'Legend']);
  });
});

describe('age on the meet’s cut-off day', () => {
  test('ageOn counts whole years on the day', () => {
    assert.equal(ageOn('2012-06-15', '2026-12-31'), 14);
    assert.equal(ageOn('2012-06-15', '2026-06-14'), 13);
    assert.equal(ageOn('2012-06-15', '2026-06-15'), 14);
    assert.equal(ageOn(undefined, '2026-12-31'), undefined);
  });
  test('cut-off by basis (default 31 Dec of the meet year)', () => {
    assert.equal(ageCutoff(undefined, '2026-11-20'), '2026-12-31');
    assert.equal(ageCutoff('jan1', '2026-11-20'), '2026-01-01');
    assert.equal(ageCutoff('meet', '2026-11-20T09:00:00Z'), '2026-11-20');
    assert.equal(ageCutoff('2026-10-01', '2026-11-20'), '2026-10-01');
    assert.equal(cutoffLabel('2026-12-31'), '31 Dec 2026');
  });
  test('near a birthday: U14 on 31 Dec, not by age today', () => {
    const kid = { id: 'k', dob: '2012-12-20' }; // 13 in November, 14 on 31 Dec
    const u14: Category = { age: 'U14', gender: 'M' };
    assert.equal(eligibleFor(u14, { gender: 'M', age: ageOn(kid.dob, '2026-11-20') }), true);
    assert.equal(eligibleFor(u14, { gender: 'M', age: meetAgeOf(kid, ageCutoff('dec31', '2026-11-20')) }), false);
    // no DOB visible: the server's age on the day, else the age today
    assert.equal(meetAgeOf({ id: 'x', age: 13 }, '2026-12-31', new Map([['x', 14]])), 14);
    assert.equal(meetAgeOf({ id: 'y', age: 13 }, '2026-12-31', new Map()), 13);
  });
});

/* ------------------------------- champions ------------------------------- */

const HOUSE = (i: number) => ({ name: ['Red', 'Blue', 'Green'][i % 3] + ' House' });
const ath = (i: number, mark: number): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat: 1, result: { mark, wind: 0.5 }, team: HOUSE(i) });
const fin = (key: string, discipline: string, cat: Category, entries: ResultEntry[]): MeetPhase => ({
  id: key, status: 'completed', date: '2026-11-20T09:00:00Z', entries,
  format: { discipline, category: cat, phase: 'final', phaseNo: 1, heats: 1, eventKey: key, eventTitle: key } as PhaseFormat,
});
const U14B: Category = { age: 'U14', gender: 'M' }, U14G: Category = { age: 'U14', gender: 'F' };

describe('category champions and the individual champion', () => {
  const events = groupMeet([
    // U14 boys: athlete 0 wins the 100 m and 200 m; athlete 3 is 2nd twice
    fin('b100', 'ath.100m', U14B, [ath(0, 12.1), ath(3, 12.3), ath(1, 12.5)]),
    fin('b200', 'ath.200m', U14B, [ath(0, 25.1), ath(3, 25.3), ath(4, 25.6)]),
    // U14 girls: 5 and 7 level on points (one win, one second each)
    fin('g100', 'ath.100m', U14G, [ath(5, 13.1), ath(7, 13.3), ath(8, 13.6)]),
    fin('g200', 'ath.200m', U14G, [ath(7, 27.1), ath(5, 27.3), ath(8, 27.6)]),
  ]);
  test('a table per category; boys and girls apart', () => {
    const c = categoryChampions(events, { positionPoints: [5, 3, 1] });
    assert.deepEqual(c.map((x) => [x.key, x.label, x.finals]), [['U14-F', 'U14 Girls', 2], ['U14-M', 'U14 Boys', 2]]);
    const boys = c.find((x) => x.key === 'U14-M')!;
    assert.deepEqual(boys.houses.map((h) => [h.team, h.points]), [['Red House', 16], ['Blue House', 2]]); // 0 and 3 are Red; 1 and 4 Blue
    assert.equal(boys.houseChampions[0].team, 'Red House');
    assert.deepEqual(boys.champions.map((a) => [a.name, a.points]), [['Athlete 0', 10]]);
    assert.equal(boys.tieNote, undefined);
  });
  test('level on points: both have one gold → joint champions; "share" says so straight away', () => {
    const girls = categoryChampions(events, { positionPoints: [5, 3, 1] }).find((x) => x.key === 'U14-G' || x.key === 'U14-F')!;
    assert.deepEqual(girls.champions.map((a) => a.name).sort(), ['Athlete 5', 'Athlete 7']);
    assert.match(girls.tieNote!, /joint/);
    const shared = categoryChampions(events, { positionPoints: [5, 3, 1] }, 'share').find((x) => x.key === 'U14-F')!;
    assert.match(shared.tieNote!, /joint champions/);
  });
  test('level on points, more golds wins', () => {
    const ev = groupMeet([
      fin('a', 'ath.100m', U14B, [ath(0, 12.1), ath(1, 12.2), ath(2, 12.3), ath(3, 12.4)]),       // 0: 5, 3: 0
      fin('b', 'ath.200m', U14B, [ath(3, 25.0), ath(9, 25.2), ath(10, 25.3), ath(0, 25.4)]),     // 3: 5, 0: 0
      fin('c', 'ath.800m', U14B, [ath(11, 130), ath(3, 131), ath(0, 132)]),                      // 3: 3, 0: 1
      fin('d', 'ath.lj', U14B, [{ ...ath(0, 0), result: { attempts: [{ mark: 5.0, wind: 0.5 }] } }, { ...ath(12, 0), result: { attempts: [{ mark: 4.9, wind: 0.5 }] } }]), // 0: 5
    ]);
    const c = categoryChampions(ev, { positionPoints: [5, 3, 1] })[0];
    assert.equal(c.champions[0].name, 'Athlete 0');
    assert.equal(champKey({ age: 'U14', gender: 'M', weightClass: '61 kg' }), 'U14-M');
    assert.equal(champTieOf({ champTie: 'share' }), 'share');
    assert.equal(champTieOf(undefined), 'medals');
  });
  test('golds break a points tie', () => {
    const ev = groupMeet([
      fin('a', 'ath.100m', U14B, [ath(0, 12.1), ath(1, 12.2)]),   // 0 gold 5, 1 silver 3
      fin('b', 'ath.200m', U14B, [ath(2, 25.0), ath(1, 25.2)]),   // 1 silver 3
      fin('c', 'ath.400m', U14B, [ath(4, 60.0), ath(5, 61.0), ath(0, 62.0)]), // 0 bronze 1
    ]);
    // 0: 6 pts (1 gold); 1: 6 pts (0 golds) → 0 is champion on golds
    const c = categoryChampions(ev, { positionPoints: [5, 3, 1] })[0];
    assert.deepEqual(c.athletes.slice(0, 2).map((a) => [a.name, a.points]), [['Athlete 0', 6], ['Athlete 1', 6]]);
    assert.deepEqual(c.champions.map((a) => a.name), ['Athlete 0']);
    assert.match(c.tieNote!, /golds/);
  });
  test('relays score for the house, not an individual; share text', () => {
    const relay: ResultEntry = { id: 'r1', name: 'Red House', heat: 1, result: { mark: 52.1, members: [{ name: 'a' }] }, team: { name: 'Red House' } };
    const ev = groupMeet([fin('r', 'ath.4x100', U14B, [relay]), fin('a', 'ath.100m', U14B, [ath(1, 12.1)])]);
    const c = categoryChampions(ev, { positionPoints: [5, 3, 1] })[0];
    assert.deepEqual(houseTable(ev, { positionPoints: [5, 3, 1] }).map((h) => [h.team, h.points]), [['Red House', 5], ['Blue House', 5]].sort((a, b) => (a[0] as string).localeCompare(b[0] as string)));
    assert.deepEqual(c.athletes.map((a) => a.name), ['Athlete 1']);
    assert.match(championsText([c], 'Sports Day'), /U14 Boys — Champion house: .* · Individual champion: Athlete 1 \(Blue House\) 5 pts/);
  });
});

void ({} as EntryResult);

// Founder privacy rule: a board cut-off must be the 1st or last day of a month
import { isBoardCutoff, ageCutoff as _ageCutoff } from '../src/core/age.ts';
import { test as _t } from 'node:test';
import _assert from 'node:assert/strict';
_t('board cut-off: only the 1st or the last day of a month', () => {
  _assert.equal(isBoardCutoff('2026-12-31'), true);
  _assert.equal(isBoardCutoff('2026-10-01'), true);
  _assert.equal(isBoardCutoff('2028-02-29'), true);
  _assert.equal(isBoardCutoff('2026-02-28'), true);
  _assert.equal(isBoardCutoff('2026-06-17'), false);
  _assert.equal(_ageCutoff('2026-06-17', '2026-11-20'), '2026-12-31');
  _assert.equal(_ageCutoff('2026-10-01', '2026-11-20'), '2026-10-01');
});
