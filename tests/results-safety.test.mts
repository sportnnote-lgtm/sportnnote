/**
 * SD-112 — results-entry safety for athletics + swimming: plausible ranges per
 * event / pool length (confirm, never reject), the hand-time and photo-finish
 * keypads, the Hand chip keeping the typed time, no PB / MR from an
 * unconfirmed out-of-range mark, the Close-round / Finish warnings, and the
 * organiser's Reopen round / Reopen final (records rolled back).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, groupMeet, meetFieldResults, withRecordFlags, updateRecords, categoryKey,
  markRange, rangeCheck, digitsToHandTime, digitsToPhotoTime, readDigits, toggleHand, unconfirmedOutOfRange, stripUnconfirmedFlags,
  rowsForRecords, blankEntries, newRecords, closeRoundDetail, finishDetail, hasAnyResult, reopenVerdict, recordsFor, rollbackRecords,
  type DisciplineDef, type EntryResult, type ResultEntry, type RecordMark,
} from '../src/data/results/index.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const M100 = D('ath.100m'), M800 = D('ath.800m'), LJ = D('ath.lj'), HJ = D('ath.hj'), F50 = D('swim.50free'), F200 = D('swim.200free'), R4 = D('ath.4x100');
const row = (i: number, result: EntryResult = {}, heat = 1): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Runner ${i}`, heat, result });

describe('plausible range per event (P0)', () => {
  test('every athletics and swimming discipline has a range', () => {
    for (const k of ['ath.100m', 'ath.200m', 'ath.400m', 'ath.800m', 'ath.1500m', 'ath.3000m', 'ath.80mh', 'ath.100mh', 'ath.110mh', 'ath.300mh', 'ath.400mh',
      'ath.4x100', 'ath.4x400', 'ath.lj', 'ath.tj', 'ath.sp', 'ath.dt', 'ath.jt', 'ath.ht', 'ath.hj', 'ath.pv']) assert.ok(markRange(k), k);
    for (const d of ['50free', '100free', '200free', '400free', '800free', '1500free', '50back', '100back', '200back', '50breast', '100breast', '200breast',
      '50fly', '100fly', '200fly', '100im', '200im', '400im', '4x50free', '4x100free', '4x200free', '4x50medley', '4x100medley']) assert.ok(markRange(`swim.${d}`), d);
    assert.equal(markRange('wl.total'), null);
  });

  test('the fast end sits just under the senior world record; school marks pass', () => {
    assert.equal(rangeCheck(M100, 9.58), null); // the world record itself
    assert.equal(rangeCheck(M100, 18.4), null); // a U10 sprinter
    assert.equal(rangeCheck(M800, 3 * 60 + 5.2), null);
    assert.equal(rangeCheck(LJ, 4.12), null);
    assert.equal(rangeCheck(HJ, 1.15), null);
    assert.equal(rangeCheck(F50, 41.3), null);
  });

  test('the audit cases ask first: an 800 m typed 2153, a long jump of 512, a 200 m swim typed 2153', () => {
    const a = rangeCheck(M800, 21.53);
    assert.equal(a?.side, 'low');
    assert.match(a!.message, /21\.53 looks too fast for the 800 m/);
    assert.match(a!.message, /1:38\.00 – 6:00\.00/);
    const b = rangeCheck(LJ, 512);
    assert.equal(b?.side, 'high');
    assert.match(b!.message, /512\.00 m looks too long/);
    assert.equal(rangeCheck(F200, 21.53)?.side, 'low');
    assert.equal(rangeCheck(M100, 105.3)?.side, 'high'); // "1053" read as 1:05.3 in a 100 m
  });

  test('a 25 m pool is quicker: its fast end is lower than the 50 m pool', () => {
    const lc = markRange('swim.50free', 'LCM')!, sc = markRange('swim.50free', 'SCM')!;
    assert.ok(sc.min < lc.min);
    assert.equal(rangeCheck(F50, 20.1, 'LCM')?.side, 'low');
    assert.equal(rangeCheck(F50, 20.1, 'SCM'), null);
  });
});

describe('the keypad (P0 hand tenths, P1 photo thousandths)', () => {
  test('hand mode: the last digit is the tenth', () => {
    assert.equal(digitsToHandTime('1053'), 65.3); // 1:05.3, not 10.53
    assert.equal(digitsToHandTime('108'), 10.8);
    assert.equal(digitsToHandTime('25307'), 25 * 60 + 30.7);
    assert.equal(digitsToHandTime('1'), null);
    assert.equal(digitsToHandTime('1703'), null); // 1:70.3 — no such time
    assert.deepEqual(readDigits('1053', 'hand'), { mark: 65.3 });
    assert.deepEqual(readDigits('1053', 'auto'), { mark: 10.53 });
  });

  test('photo mode: the last three digits are thousandths, rounded up to the hundredth', () => {
    assert.deepEqual(digitsToPhotoTime('10853'), { mark: 10.86, thousandths: 10.853 });
    assert.deepEqual(digitsToPhotoTime('10850'), { mark: 10.85, thousandths: 10.85 });
    assert.deepEqual(digitsToPhotoTime('152341'), { mark: 112.35, thousandths: 112.341 }); // 1:52.341
    assert.equal(digitsToPhotoTime('108'), null);
  });
});

describe('the Hand chip keeps the typed time (P1)', () => {
  test('on → hand time; off → the typed time with its thousandths', () => {
    const typed: EntryResult = { mark: 10.86, thousandths: 10.853 };
    const on = toggleHand(typed, true);
    assert.equal(on.mark, 10.9);
    assert.equal(on.hand, true);
    assert.equal(on.thousandths, undefined);
    assert.deepEqual(on.raw, { mark: 10.86, thousandths: 10.853 });
    const off = toggleHand(on, false);
    assert.equal(off.mark, 10.86);
    assert.equal(off.thousandths, 10.853);
    assert.equal(off.hand, false);
  });

  test('a swimming manual time stays at 1/100; no mark yet just flips the chip', () => {
    assert.equal(toggleHand({ mark: 32.47 }, true, true).mark, 32.47);
    assert.deepEqual(toggleHand({}, true), { hand: true });
  });
});

describe('no PB / MR from an unconfirmed out-of-range mark (P0)', () => {
  const cat = categoryKey({ age: 'U14', gender: 'M' });
  const book: RecordMark[] = [{ scope: 'MR', discipline: 'ath.800m', category: cat, value: 128.4, holder: 'Old Holder' }];
  const entries = [row(1, { mark: 21.53 }), row(2, { mark: 131.2 })];
  const ctx = { history: [{ athleteId: 'p1', discipline: 'ath.800m', value: 140, date: '2026-01-01' }], records: book, category: cat, seasonFrom: '2026-01-01' };

  test('unconfirmed: flags stripped, no record written', () => {
    assert.equal(unconfirmedOutOfRange(entries[0].result, M800), true);
    const rows = stripUnconfirmedFlags(withRecordFlags(rankEntries(entries, M800), M800, ctx), M800);
    assert.deepEqual(rows.find((r) => r.id === 'e1')!.flags, []);
    const after = updateRecords(rowsForRecords(rankEntries(entries, M800), M800), M800, cat, book, '2026-10-11');
    assert.deepEqual(after, book); // 1st's mark doesn't count; 2nd's 2:11.20 doesn't beat the record
  });

  test('confirmed by the official: the mark counts', () => {
    const ok = [row(1, { mark: 21.53, rangeOk: true }), row(2, { mark: 131.2 })];
    assert.equal(unconfirmedOutOfRange(ok[0].result, M800), false);
    const rows = stripUnconfirmedFlags(withRecordFlags(rankEntries(ok, M800), M800, ctx), M800);
    assert.ok(rows.find((r) => r.id === 'e1')!.flags.includes('MR'));
  });

  test('field attempts: one unconfirmed out-of-range trial blocks the flags', () => {
    assert.equal(unconfirmedOutOfRange({ attempts: [{ mark: 5.12 }, { mark: 512 }] }, LJ), true);
    assert.equal(unconfirmedOutOfRange({ attempts: [{ mark: 5.12 }, { mark: 9.4, rangeOk: true }, { foul: true }] }, LJ), false);
  });
});

describe('Close round / Finish & lock warnings (P1)', () => {
  test('blank rows: no mark and no status (DNS is not blank)', () => {
    const e = [row(1, { mark: 12.3 }), row(2, {}), row(3, { status: 'DNS' }), row(4, { lane: 5 })];
    assert.deepEqual(blankEntries(e, M100).map((x) => x.id), ['e2', 'e4']);
    assert.deepEqual(blankEntries([row(1, { attempts: [{ foul: true }] }), row(2, { attempts: [] })], LJ).map((x) => x.id), ['e2']);
    assert.deepEqual(blankEntries([row(1, { heights: [{ height: 1.1, tries: 'XO' }] }), row(2, {})], HJ).map((x) => x.id), ['e2']);
  });

  test('the close-round message names them and the reopen rule', () => {
    const msg = closeRoundDetail([row(2), row(4)], M100, 'final');
    assert.match(msg, /^2 athletes have no result \(Runner, Runner\)/);
    assert.match(msg, /seeded into the final/);
    assert.match(msg, /reopen this round until the final has results/);
    assert.doesNotMatch(closeRoundDetail([], M100, 'final'), /no result/);
    assert.match(closeRoundDetail([row(1)], R4, 'final'), /^1 team has no result/);
    assert.match(closeRoundDetail([row(1)], F50, 'final'), /^1 swimmer has no result/);
  });

  test('the finish message lists a new meet record with the old one', () => {
    const cat = categoryKey({ age: 'U14', gender: 'M' });
    const before: RecordMark[] = [{ scope: 'MR', discipline: 'ath.100m', category: cat, value: 12.4, holder: 'Old' }];
    const rows = rankEntries([row(1, { mark: 12.1, wind: 0.5 }), row(2, {})], M100);
    const after = updateRecords(rows, M100, cat, before, '2026-10-11', ['MR'], 'ev1');
    const recs = newRecords(before, after);
    assert.equal(recs.length, 1);
    assert.equal(recs[0].old?.value, 12.4);
    const msg = finishDetail({ blank: blankEntries([row(1, { mark: 12.1, wind: 0.5 }), row(2, {})], M100), def: M100, records: recs, unconfirmed: 1 });
    assert.match(msg, /1 athlete has no result/);
    assert.match(msg, /1 mark is outside the usual range and not confirmed/);
    assert.match(msg, /New meet record: 12\.10 by Runner 1 \(was 12\.40\)/);
    assert.match(msg, /An organiser can reopen the final/);
  });
});

describe('Reopen round / Reopen final (P1)', () => {
  test('a round reopens only while the next round has no results', () => {
    assert.deepEqual(reopenVerdict({ status: 'live' }, null, false), { ok: false, reason: 'This round is still open.' });
    assert.deepEqual(reopenVerdict({ status: 'completed' }, { status: 'scheduled', results: [{ lane: 4 }, { lane: 5 }] }, false), { ok: true, kind: 'round' });
    assert.equal(reopenVerdict({ status: 'completed' }, { status: 'live', results: [{ lane: 4, mark: 12.1 }] }, false).ok, false);
    assert.equal(reopenVerdict({ status: 'completed' }, { status: 'live', results: [{ status: 'DNS' }] }, false).ok, false);
    assert.equal(reopenVerdict({ status: 'completed' }, { status: 'completed', results: [] }, false).ok, false);
    assert.deepEqual(reopenVerdict({ status: 'completed' }, null, true), { ok: true, kind: 'final' });
    assert.equal(hasAnyResult([{ lane: 1, order: 2, bib: '12' }]), false);
    assert.equal(hasAnyResult([{ heights: [{ height: 1.1, tries: 'X' }] }]), true);
  });

  test('finish → reopen puts the record book back exactly', () => {
    const cat = categoryKey({ age: 'U14', gender: 'M' });
    const other: RecordMark = { scope: 'MR', discipline: 'ath.200m', category: cat, value: 25.1, holder: 'Z' };
    const old: RecordMark = { scope: 'MR', discipline: 'ath.100m', category: cat, value: 12.4, holder: 'Old', eventKey: 'ev0' };
    const book = [other, old];
    const snapshot = recordsFor(book, 'ath.100m', cat);
    const after = updateRecords(rankEntries([row(1, { mark: 12.1, wind: 0.5 })], M100), M100, cat, book, '2026-10-11', ['MR'], 'ev1');
    assert.ok(after.some((r) => r.eventKey === 'ev1' && r.value === 12.1));
    const back = rollbackRecords(after, 'ath.100m', cat, 'ev1', snapshot);
    assert.deepEqual(back.sort((a, b) => a.discipline.localeCompare(b.discipline)), [old, other].sort((a, b) => a.discipline.localeCompare(b.discipline)));
  });

  test('a first-ever record is simply removed; a later event’s record stays', () => {
    const cat = 'U14-M';
    const first = updateRecords(rankEntries([row(1, { mark: 12.1, wind: 0.5 })], M100), M100, cat, [], '2026-10-11', ['MR'], 'ev1');
    assert.deepEqual(rollbackRecords(first, 'ath.100m', cat, 'ev1', []), []);
    const later: RecordMark = { scope: 'MR', discipline: 'ath.100m', category: cat, value: 11.9, holder: 'Later', eventKey: 'ev2' };
    assert.deepEqual(rollbackRecords([later], 'ath.100m', cat, 'ev1', [{ ...later, value: 12.4, eventKey: 'ev0' }]), [later]);
  });

  test('a reopened final drops out of the medal table (only completed finals count)', () => {
    const fmt = { discipline: 'ath.100m', phase: 'final' as const, phaseNo: 1, heats: 1, eventKey: 'ev1', eventTitle: '100 m U14 Boys' };
    const entries = [{ ...row(1, { mark: 12.1, wind: 0.5 }), team: { name: 'Red' } }, { ...row(2, { mark: 12.3 }), team: { name: 'Blue' } }];
    const meet = (status: 'live' | 'completed') => groupMeet([{ id: 'f1', format: fmt, status, date: '2026-10-11', entries }]);
    assert.equal(meetFieldResults(meet('completed')).length, 1);
    assert.equal(meetFieldResults(meet('live')).length, 0);
  });
});
