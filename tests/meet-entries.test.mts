/**
 * SD-128 — meet entries: late entry (verdict + placement into a heat / lane /
 * new heat, or last in a flight), scratch (DNS with a reason; never seeded into
 * a later round), delete-event checks, the entries matrix (cells, caps,
 * override), bulk add (paste parsing, DOB / age group, events, duplicates by
 * name + DOB), and source checks that every organiser action is confirmed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  disciplineOf, phaseDiscipline, rankByHeat, qualify, nextRound, continuing,
  lateAddVerdict, placeLateEntry, lateLanePreference, freeLanes, scratchVerdict, scratchResult, reinstateResult, isScratched, deleteCheck,
  parseEntriesDoc, emptyEntries, slotKey, toggleTick, setOverride, cellState, entryCount, capState, wouldExceed, capsText, shortLabel,
  ageGroupFor, inGroup, parseBulk, readDob, readEvent, findDuplicates, normName, matchTeam, yearsOn, entryEvents, tickedFor,
  type DisciplineDef, type EntryResult, type ResultEntry, type PhaseFormat, type EntryEvent,
} from '../src/data/results/index.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const M100 = D('ath.100m'), M1500 = D('ath.1500m'), LJ = D('ath.lj'), R4 = D('ath.4x100'), F50 = D('swim.50free');
const row = (i: number, result: EntryResult = {}, heat = 1): ResultEntry => ({ id: `e${i}`, athleteId: `p${i}`, name: `Runner ${i}`, heat, result });
const TODAY = new Date(2026, 9, 11);

describe('late entry', () => {
  const f1 = { phaseNo: 1 } as Pick<PhaseFormat, 'phaseNo' | 'combined'>;
  test('only an open first round takes a late entry', () => {
    assert.deepEqual(lateAddVerdict(f1, 'scheduled', []), { ok: true });
    assert.deepEqual(lateAddVerdict(f1, 'live', [{ result: { mark: 12.3 } }]), { ok: true });
    assert.equal(lateAddVerdict(f1, 'completed', []).ok, false);
    assert.equal(lateAddVerdict({ phaseNo: 2 }, 'scheduled', []).ok, false);
    assert.equal(lateAddVerdict({ phaseNo: 1 }, 'live', [{ result: { mp: {} } }]).ok, false, 'a drawn bracket');
    assert.equal(lateAddVerdict({ phaseNo: 1 }, 'live', [{ result: { fshots: [] } }]).ok, false, 'a shooting final');
    const ce = (index: number) => ({ phaseNo: index + 1, combined: { key: 'ath.ce_pen', table: 'M', events: ['ath.100mh', 'ath.hj'], index } as never });
    assert.equal(lateAddVerdict(ce(0), 'scheduled', []).ok, true, 'a combined event: its first event');
    assert.equal(lateAddVerdict(ce(1), 'scheduled', []).ok, false);
  });

  test('a free lane in the heat with fewest entrants — the outside lane first', () => {
    // heat 1 full (8), heat 2 has 6 in lanes 2-7
    const rows = [...[1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({ heat: 1, lane: l })), ...[2, 3, 4, 5, 6, 7].map((l) => ({ heat: 2, lane: l }))];
    const p = placeLateEntry(rows, M100, { heats: 2 });
    assert.equal(p.heat, 2);
    assert.ok([1, 8].includes(p.lane!), `outside lane, got ${p.lane}`);
    assert.equal(p.newHeat, false);
    // the preference ends with the centre lanes
    const pref = lateLanePreference(8, 'ath.100m');
    assert.deepEqual(pref.slice(-4).sort(), [3, 4, 5, 6]);
    assert.equal(pref.length, 8);
  });

  test('every heat full → a new heat; a forced heat; a forced new heat', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({ heat: 1, lane: l }));
    const p = placeLateEntry(rows, M100, { heats: 1 });
    assert.deepEqual([p.heat, p.newHeat, p.order], [2, true, 1]);
    assert.equal(p.lane, 4, 'alone in a new heat: a centre lane');
    const two = [...rows, { heat: 2, lane: 4 }];
    assert.equal(placeLateEntry(two, M100, { heats: 2, heat: 2 }).heat, 2);
    assert.equal(placeLateEntry(two, M100, { heats: 2, heat: 'new' }).heat, 3);
    assert.deepEqual(freeLanes(two, 8, 2), [1, 2, 3, 5, 6, 7, 8]);
  });

  test('a 10-lane pool numbers 0-9', () => {
    const def = phaseDiscipline(F50, { lanes: 10 });
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({ heat: 1, lane: l }));
    const p = placeLateEntry(rows, def, { heats: 1 });
    assert.ok([0, 9].includes(p.lane!), `lane ${p.lane}`);
  });

  test('no lanes: last in the smallest flight; a road race appends to the whole list', () => {
    const rows = [{ heat: 1, order: 1 }, { heat: 1, order: 2 }, { heat: 2, order: 1 }];
    assert.deepEqual(placeLateEntry(rows, LJ, { heats: 2 }), { heat: 2, order: 2, newHeat: false });
    assert.deepEqual(placeLateEntry([{ heat: 1, order: 1 }, { heat: 1, order: 2 }], M1500, { heats: 1 }), { heat: 1, order: 3, newHeat: false });
    const road = D('ath.road.10000');
    assert.equal(placeLateEntry([{ heat: 1, order: 7 }, { heat: 1, order: 3 }], road, { heats: 1 }).order, 8);
  });
});

describe('scratch', () => {
  test('before a result only; DNS with the reason; reinstate', () => {
    assert.equal(scratchVerdict('scheduled', {}).ok, true);
    assert.equal(scratchVerdict('completed', {}).ok, false);
    assert.equal(scratchVerdict('live', { mark: 11.2 }).ok, false);
    assert.equal(scratchVerdict('live', { attempts: [{ mark: 4.1 }] } as EntryResult).ok, false);
    assert.equal(scratchVerdict('live', { lane: 3 }, [{ result: { mp: {} } }]).ok, false, 'match play: a walkover instead');
    const r = scratchResult({ lane: 5, bib: '12' }, 'Injured', '2026-10-11T08:00:00Z');
    assert.deepEqual(r, { lane: 5, bib: '12', status: 'DNS', scratch: { reason: 'Injured', at: '2026-10-11T08:00:00Z' } });
    assert.ok(isScratched(r));
    assert.equal(scratchVerdict('live', r).ok, false, 'already scratched');
    assert.deepEqual(reinstateResult(r), { lane: 5, bib: '12', status: undefined });
    assert.equal(scratchResult({}, '  ').scratch!.reason, 'Scratched');
  });

  test('a scratched athlete keeps the lane empty and is never seeded into the next round', () => {
    const res = [row(1, { lane: 4, mark: 11.0 }), row(2, { lane: 5, mark: 11.2 }), row(3, scratchResult({ lane: 3 }, 'Absent')), row(4, { lane: 6, mark: 11.5 })];
    const byHeat = rankByHeat(res, M100);
    const q = qualify(byHeat, M100, { byPlace: 4 });
    assert.equal(q.marks.has('e3'), false);
    assert.equal(q.marks.size, 3);
    const seeded = nextRound(byHeat, M100, q, 1);
    assert.equal(seeded.some((s) => s.id === 'e3'), false);
  });

  test('a combined event: a scratch (DNS) is out of the next event (TR 39.10)', () => {
    const f = { discipline: 'ath.100mh', phaseNo: 1, heats: 1, eventKey: 'k', phase: 'final', combined: { key: 'ath.ce_pen', table: 'F', events: ['ath.100mh', 'ath.hj'], index: 0 } } as unknown as PhaseFormat;
    const out = continuing([row(1, { mark: 15.2 }), row(2, scratchResult({}, 'Unwell'))], f);
    assert.deepEqual(out.map((e) => e.id), ['e1']);
  });
});

describe('delete event', () => {
  test('a start list only — no results; a scratch is not a result', () => {
    const c = deleteCheck([{ status: 'scheduled', results: [{ lane: 1 }, scratchResult({ lane: 2 }, 'Absent')] }]);
    assert.deepEqual(c, { hasResults: false, finished: false, phases: 1, entries: 2 });
  });
  test('marks, a closed round or a finished final are results', () => {
    assert.equal(deleteCheck([{ status: 'live', results: [{ mark: 12 }] }]).hasResults, true);
    assert.equal(deleteCheck([{ status: 'completed', results: [{}] }, { status: 'scheduled', results: [] }]).hasResults, true);
    const fin = deleteCheck([{ status: 'completed', results: [{ mark: 1 }] }, { status: 'completed', results: [{ mark: 1 }] }]);
    assert.equal(fin.finished, true);
    assert.equal(fin.phases, 2);
  });
});

describe('entries document and matrix', () => {
  test('parse is tolerant (old tournaments have none)', () => {
    assert.deepEqual(parseEntriesDoc(undefined), emptyEntries());
    assert.deepEqual(parseEntriesDoc('not json'), emptyEntries());
    const d = parseEntriesDoc(JSON.stringify({ v: 1, caps: { individual: 3, relay: 1 }, ticks: { p1: ['ath.100m@U14-M'] } }));
    assert.deepEqual(d.caps, { individual: 3, relay: 1 });
    assert.deepEqual(d.ticks, { p1: ['ath.100m@U14-M'] });
  });

  test('ticks, cells and counts across start lists and planned events', () => {
    const u14 = { age: 'U14', gender: 'M' as const };
    let doc = emptyEntries();
    doc = toggleTick(doc, 'p1', slotKey('ath.200m', u14));
    doc = toggleTick(doc, 'p1', slotKey('ath.lj', u14));
    doc = toggleTick(doc, 'p1', slotKey('ath.4x100', u14));
    assert.deepEqual(tickedFor(doc, slotKey('ath.lj', u14)), ['p1']);
    const listed: EntryEvent = { slot: slotKey('ath.100m', u14), discipline: 'ath.100m', category: u14, label: '100 m', relay: false, eventKey: 'k1', phaseId: 'ph1', phaseStatus: 'scheduled', entries: [row(1, { lane: 4 }), row(2, scratchResult({ lane: 5 }, 'Injured'))] };
    const relayEv: EntryEvent = { slot: slotKey('ath.4x400', u14), discipline: 'ath.4x400', category: u14, label: '4x400', relay: true, eventKey: 'k2', phaseId: 'ph2', phaseStatus: 'scheduled', entries: [{ id: 'r1', name: 'Red', heat: 1, result: { members: [{ playerId: 'p1', name: 'A' }, { playerId: 'p3', name: 'C' }] } }] };
    const planned = (k: string): EntryEvent => ({ slot: slotKey(k, u14), discipline: k, category: u14, label: k, relay: !!disciplineOf(k)?.teamSize });
    const evs = [listed, relayEv, planned('ath.200m'), planned('ath.lj'), planned('ath.4x100')];
    assert.equal(cellState('p1', listed, doc), 'entered');
    assert.equal(cellState('p2', listed, doc), 'scratched');
    assert.equal(cellState('p1', relayEv, doc), 'member');
    assert.equal(cellState('p1', planned('ath.200m'), doc), 'ticked');
    assert.equal(cellState('p9', planned('ath.200m'), doc), 'none');
    // p1: 100 m + 200 m + LJ = 3 individual, 4x400 (member) + 4x100 (ticked) = 2 relays
    assert.deepEqual(entryCount('p1', evs, doc), { individual: 3, relay: 2 });
    assert.deepEqual(entryCount('p2', evs, doc), { individual: 0, relay: 0 }, 'a scratch does not count');
    // a tick in another age group still counts
    const d2 = toggleTick(doc, 'p1', slotKey('ath.sp', { age: 'U16', gender: 'M' }));
    assert.deepEqual(entryCount('p1', evs, d2), { individual: 4, relay: 2 });
    // untick
    assert.deepEqual(toggleTick(toggleTick(emptyEntries(), 'p5', 'x'), 'p5', 'x').ticks, {});
  });

  test('caps: "max 3 individual + 1 relay", warnings and the organiser override', () => {
    const caps = { individual: 3, relay: 1 };
    assert.equal(wouldExceed({ individual: 2, relay: 0 }, false, caps), null);
    assert.match(wouldExceed({ individual: 3, relay: 0 }, false, caps)!, /cap of 3 individual events/);
    assert.match(wouldExceed({ individual: 0, relay: 1 }, true, caps)!, /cap of 1 relay /);
    assert.equal(wouldExceed({ individual: 9, relay: 9 }, false, undefined), null, 'no caps — no limit');
    const st = capState({ individual: 4, relay: 1 }, caps);
    assert.deepEqual(st, { over: true, overridden: false, text: '4/3 + 1/1R' });
    assert.equal(capState({ individual: 4, relay: 1 }, caps, true).overridden, true);
    assert.equal(capState({ individual: 2, relay: 0 }, undefined).text, '2');
    assert.equal(capsText(caps), 'Max 3 individual events + 1 relay per athlete');
    assert.equal(capsText(undefined), 'No limit on events per athlete');
    const d = setOverride(emptyEntries(), 'p1', true);
    assert.deepEqual(d.overrides, ['p1']);
    assert.deepEqual(setOverride(d, 'p1', false).overrides, []);
  });

  test('columns: the group\'s start lists, then the programme still to set up', () => {
    const meet = [{ eventKey: 'k1', title: '100 m U14 Boys', discipline: 'ath.100m', category: { age: 'U14', gender: 'M' as const }, phases: [{ id: 'ph2', status: 'scheduled', format: { phaseNo: 2 }, entries: [] }, { id: 'ph1', status: 'live', format: { phaseNo: 1 }, entries: [row(1)] }] },
      { eventKey: 'k2', title: '100 m U16 Boys', discipline: 'ath.100m', category: { age: 'U16', gender: 'M' as const }, phases: [] }];
    const cols = entryEvents('athletics', meet, { age: 'U14', gender: 'M' });
    assert.equal(cols[0].eventKey, 'k1');
    assert.equal(cols[0].phaseId, 'ph1', 'late entries go to the first phase');
    assert.equal(cols.filter((c) => c.discipline === 'ath.100m').length, 1, 'no duplicate planned 100 m');
    assert.ok(cols.some((c) => c.discipline === 'ath.lj' && !c.eventKey));
    assert.ok(cols.some((c) => c.discipline === 'ath.4x100' && c.relay));
    // a non-catalogue sport shows its start lists only
    assert.deepEqual(entryEvents('shooting', [], { age: 'U14', gender: 'M' }), []);
    // swimming keys carry the pool length
    assert.match(entryEvents('swimming', [], { age: 'U12', gender: 'F', course: 'SCM' })[0].slot, /SCM/);
  });

  test('short column labels', () => {
    assert.deepEqual(['ath.100m', 'ath.80mh', 'ath.lj', 'ath.4x100', 'swim.50free', 'swim.4x100medley', 'swim.200im'].map(shortLabel), ['100', '80H', 'LJ', '4×100', '50 Fr', '4×100 Med', '200 IM']);
  });

  test('age groups and who is in a group', () => {
    assert.equal(ageGroupFor(11), 'U12');
    assert.equal(ageGroupFor(12), 'U14');
    assert.equal(ageGroupFor(13), 'U14');
    assert.equal(ageGroupFor(25), 'Open');
    assert.equal(ageGroupFor(undefined), undefined);
    assert.equal(inGroup({ gender: 'Male', age: 13 }, { age: 'U14', gender: 'M' }), true);
    assert.equal(inGroup({ gender: 'Female', age: 13 }, { age: 'U14', gender: 'M' }), false);
    assert.equal(inGroup({ gender: 'M', ageGroup: 'U14' }, { age: 'U14', gender: 'M' }), true);
    assert.equal(inGroup({ gender: 'M', ageGroup: 'U16' }, { age: 'U14', gender: 'M' }), false, 'a typed age group must match');
    assert.equal(inGroup({ gender: 'M', age: 11 }, { age: 'U14', gender: 'M' }, true), false, 'exact: an U12 is not listed under U14');
  });
});

describe('bulk add', () => {
  test('a pasted list: fields by shape, DOB day first, age group, bib, events, header skipped', () => {
    const rows = parseBulk([
      'Name, House, Gender, DOB, Bib, Events',
      'Aarav Nair, Red House, B, 05/03/2012, 101, 100m; LJ',
      'Diya Menon\tBlue House\tGirl\tU14\t102\t200 m',
      'Kabir Rao, Green, M, 2013-11-30',
      'Isha, Yellow, F, 31/02/2012',
      '',
    ].join('\n'), 'athletics', TODAY);
    assert.equal(rows.length, 4);
    assert.deepEqual({ ...rows[0], line: 0 }, { line: 0, name: 'Aarav Nair', house: 'Red House', gender: 'M', dob: '2012-03-05', bib: '101', events: ['ath.100m', 'ath.lj'], unknown: [] });
    assert.deepEqual([rows[1].name, rows[1].house, rows[1].gender, rows[1].age, rows[1].bib, rows[1].events], ['Diya Menon', 'Blue House', 'F', 'U14', '102', ['ath.200m']]);
    assert.equal(rows[2].dob, '2013-11-30');
    assert.match(rows[3].error ?? '', /Date of birth/, 'an impossible date is flagged, not guessed');
  });

  test('dates and events', () => {
    assert.equal(readDob('5-3-2012', TODAY), '2012-03-05');
    assert.equal(readDob('05.03.12', TODAY), '2012-03-05');
    assert.equal(readDob('01/01/2030', TODAY), undefined, 'not in the future');
    assert.equal(readEvent('100 m'), 'ath.100m');
    assert.equal(readEvent('Long Jump'), 'ath.lj');
    assert.equal(readEvent('4x100'), 'ath.4x100');
    assert.equal(readEvent('80mH'), 'ath.80mh');
    assert.equal(readEvent('Red House'), null);
    assert.equal(readEvent('50 free', 'swimming'), 'swim.50free');
    assert.equal(readEvent('100 back', 'swimming'), 'swim.100back');
    assert.equal(readEvent('4x100 medley', 'swimming'), 'swim.4x100medley');
    assert.equal(readEvent('200 IM', 'swimming'), 'swim.200im');
    assert.equal(yearsOn('2012-10-12', TODAY), 13);
    assert.equal(yearsOn('2012-10-11', TODAY), 14);
  });

  test('duplicates by name + date of birth', () => {
    const players = [
      { id: 'a', fullName: 'Aarav  Nair', dob: '2012-03-05' },
      { id: 'b', fullName: 'Rahul Sharma', dob: '2011-01-01' },
      { id: 'c', fullName: 'Meera Iyer', age: 13 }, // DOB private (another organiser's player)
    ];
    const rows = parseBulk('aarav nair, Red, B, 05/03/2012\nRahul Sharma, Blue, B, 02/02/2012\nMeera Iyer, Blue, G, 14/02/2013\nAarav Nair, Red, B, 05/03/2012\nNew Kid, Red, B, U12', 'athletics', TODAY);
    const d = findDuplicates(rows, players, TODAY);
    assert.deepEqual(d.find((x) => x.line === 1), { line: 1, kind: 'same', playerId: 'a', name: 'Aarav  Nair' });
    assert.equal(d.find((x) => x.line === 2), undefined, 'same name, different DOB: a different person');
    assert.equal(d.find((x) => x.line === 3)?.kind, 'likely');
    assert.equal(d.find((x) => x.line === 4)?.kind, 'inList');
    assert.equal(d.find((x) => x.line === 5), undefined);
    assert.equal(normName("D'Souza  R."), 'dsouza r');
  });

  test('a pasted house finds the meet\'s team', () => {
    const teams = [{ name: 'Red' }, { name: 'Blue House' }];
    assert.equal(matchTeam('red house', teams)?.name, 'Red');
    assert.equal(matchTeam('Blue', teams)?.name, 'Blue House');
    assert.equal(matchTeam('Green', teams), undefined);
  });
});

describe('every organiser action is confirmed (source checks)', () => {
  const panel = readFileSync(new URL('../src/components/results/EntriesPanel.tsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../src/screens/MeetEntriesScreen.tsx', import.meta.url), 'utf8');
  test('late entry, scratch, remove, reinstate and delete event ask first', () => {
    for (const [src, calls] of [[panel, ['lateAddEntry(', 'scratchEntry(', 'removeEntry(', 'reinstateEntry(', 'deleteResultsEvent(']], [screen, ['lateAddEntry(', 'scratchEntry(', 'reinstateEntry(']]] as const) {
      for (const c of calls) {
        const i = src.indexOf(`await ${c}`);
        assert.ok(i > 0, c);
        assert.ok(src.lastIndexOf('askConfirm(', i) > 0, `${c} after a confirm`);
      }
    }
    assert.match(panel, /Yes, delete event and results/);
  });
  test('the event page shows the panel to organisers only', () => {
    const ev = readFileSync(new URL('../src/screens/ResultsEventScreen.tsx', import.meta.url), 'utf8');
    assert.match(ev, /\{canManage && <EntriesPanel /);
  });
});
