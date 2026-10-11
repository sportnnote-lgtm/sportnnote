/**
 * SD-129 — the meet timetable (rounds by day / session, planned finals, old
 * unscheduled events, now / next, "running late" shifts, athletes doubling up,
 * suggested slots) and the printable sheets (start list / heat sheet, field
 * card, results, house table, timetable, the A4 document).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimetable, timetableDays, unscheduled, nowNext, shiftSession, findClashes, clashesFor, suggestRounds, nextFreeSlot,
  atOf, hhmm, dayKey, sessionOf, estMinutes, defaultArea, withRound, plannedSlot, planLabels, timetableText,
  disciplineOf, rankByHeat, qualify, withQualification,
  sheetDoc, startListSheet, fieldCardSheet, resultsSheet, medalTableSheet, timetableSheet, esc,
  type MeetEvent, type MeetPhase, type PhaseFormat, type ResultEntry, type SchedRound,
} from '../src/data/results/index.ts';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString(); // Nov 2026, local time
const DAY1 = dayKey(at(12, 9));
const DAY2 = dayKey(at(13, 9));

const athlete = (id: string, name: string, heat = 1, extra: Partial<ResultEntry['result']> = {}): ResultEntry => ({ id: `e-${id}-${heat}-${Math.random()}`, athleteId: id, name, heat, team: { name: 'Red House', colorHex: '#d33' }, result: { ...extra } });

function phase(id: string, f: Partial<PhaseFormat> & { discipline: string; eventKey: string }, o: { status?: MeetPhase['status']; date?: string; entries?: ResultEntry[] } = {}): MeetPhase {
  const fmt: PhaseFormat = { phase: 'final', phaseNo: 1, heats: 1, ...f } as PhaseFormat;
  return { id, format: fmt, status: o.status ?? 'scheduled', date: o.date ?? at(1, 8), entries: o.entries ?? [] };
}
const event = (title: string, discipline: string, phases: MeetPhase[]): MeetEvent => ({ eventKey: phases[0].format.eventKey, title, discipline, phases });

// 100 m U14 Boys: heats 09:00 (Track) → final planned 15:00; long jump 09:20 (Jumps pit); an old 400 m (no sched)
const sched100: { rounds: SchedRound[] } = { rounds: [{ phaseNo: 1, at: at(12, 9), area: 'Track' }, { phaseNo: 2, at: at(12, 15), area: 'Track' }] };
const heats100 = phase('p100h', {
  discipline: 'ath.100m', eventKey: 'ev100', eventTitle: '100 m U14 Boys', phase: 'heat', heats: 2,
  plan: [{ phase: 'heat', heats: 2, progression: { byPlace: 3, byMark: 2 } }, { phase: 'final', heats: 1 }], progression: { byPlace: 3, byMark: 2 }, sched: sched100,
}, { date: at(12, 9), entries: [athlete('a1', 'Arjun Rao', 1, { lane: 4, bib: '101' }), athlete('a2', 'Kabir Shah', 2, { lane: 5, bib: '102' })] });
const lj = phase('plj', { discipline: 'ath.lj', eventKey: 'evlj', eventTitle: 'Long jump U14 Boys', sched: { rounds: [{ phaseNo: 1, at: at(12, 9, 20), area: 'Jumps pit' }] } },
  { date: at(12, 9, 20), entries: [athlete('a1', 'Arjun Rao', 1, { order: 1, bib: '101' }), athlete('a3', 'Dev Iyer', 1, { order: 2, bib: '103' })] });
const old400 = phase('p400', { discipline: 'ath.400m', eventKey: 'ev400', eventTitle: '400 m U14 Girls' }, { date: '2026-10-01T05:00:00.000Z' });
const hj = phase('phj', { discipline: 'ath.hj', eventKey: 'evhj', eventTitle: 'High jump U17 Girls', sched: { rounds: [{ phaseNo: 1, at: at(13, 10), area: 'High jump' }] } }, { date: at(13, 10), status: 'completed' });
const events = [event('100 m U14 Boys', 'ath.100m', [heats100]), event('Long jump U14 Boys', 'ath.lj', [lj]), event('400 m U14 Girls', 'ath.400m', [old400]), event('High jump U17 Girls', 'ath.hj', [hj])];

describe('SD-129 timetable', () => {
  const items = buildTimetable(events);

  test('existing rounds, the planned final, and old unscheduled events', () => {
    const keys = items.map((i) => i.key);
    assert.ok(keys.includes('ev100#1') && keys.includes('ev100#2'));
    const fin = items.find((i) => i.key === 'ev100#2')!;
    assert.equal(fin.status, 'planned');
    assert.equal(fin.phaseId, undefined);
    assert.equal(fin.lastPhaseId, 'p100h');
    assert.equal(fin.roundLabel, 'Final');
    assert.equal(hhmm(fin.at), '15:00');
    const h = items.find((i) => i.key === 'ev100#1')!;
    assert.equal(h.roundLabel, 'Heats');
    assert.equal(h.area, 'Track');
    assert.equal(h.session, 'AM');
    assert.deepEqual(h.athletes.map((a) => a.id).sort(), ['a1', 'a2']);
    const o = items.find((i) => i.key === 'ev400#1')!;
    assert.equal(o.set, false);
    assert.deepEqual(unscheduled(items).map((i) => i.key), ['ev400#1']);
  });

  test('days and sessions (with the tournament date range)', () => {
    const days = timetableDays(items, { start: '2026-11-12', end: '2026-11-14' });
    assert.deepEqual(days.map((d) => d.day), [DAY1, DAY2, dayKey(at(14, 9))]);
    assert.equal(days[0].label.startsWith('Day 1 · Thu 12 Nov'), true);
    assert.deepEqual(days[0].sessions.map((s) => s.session), ['AM', 'PM']);
    assert.deepEqual(days[0].sessions[0].items.map((i) => i.key), ['ev100#1', 'evlj#1']);
    assert.equal(days[2].sessions.length, 0);
    assert.ok(!days.some((d) => d.sessions.some((s) => s.items.some((i) => !i.set))), 'unscheduled phases stay out of the days');
    assert.match(timetableText('Inter-House Meet', days[0]), /09:00 {2}100 m U14 Boys — Heats · Track/);
  });

  test('now / next', () => {
    const n1 = nowNext(items, new Date(at(12, 9, 3)));
    assert.deepEqual(n1.now.map((i) => i.key), ['ev100#1']);
    assert.equal(n1.next?.key, 'evlj#1');
    const n2 = nowNext(items, new Date(at(12, 12)));
    assert.equal(n2.now.length, 0);
    assert.equal(n2.next?.key, 'ev100#2');
  });

  test('running late: the rest of the session moves, nothing else', () => {
    const from = items.find((i) => i.key === 'ev100#1')!;
    const ch = shiftSession(items, from, 10);
    assert.deepEqual(ch.map((c) => c.key), ['ev100#1', 'evlj#1']);
    assert.equal(hhmm(ch[0].at), '09:10');
    assert.equal(hhmm(ch[1].at), '09:30');
    assert.equal(ch[0].phaseId, 'p100h');
    // from the long jump on: the heats (earlier) don't move; the PM final is another session
    assert.deepEqual(shiftSession(items, items.find((i) => i.key === 'evlj#1')!, 15).map((c) => c.key), ['evlj#1']);
    // the planned final shifts with its own session (stored on the latest phase)
    const pm = shiftSession(items, items.find((i) => i.key === 'ev100#2')!, 30);
    assert.deepEqual(pm.map((c) => [c.key, c.phaseId, c.lastPhaseId, hhmm(c.at)]), [['ev100#2', undefined, 'p100h', '15:30']]);
  });

  test('clashes: an athlete in two events too close', () => {
    // 100 m heats: 2 heats × 5 min = ends 09:10; LJ at 09:20 → 10 min apart
    assert.equal(estMinutes(disciplineOf('ath.100m'), 2), 10);
    const c = findClashes(items, 30);
    assert.equal(c.length, 1);
    assert.equal(c[0].name, 'Arjun Rao');
    assert.equal(c[0].gap, 10);
    assert.equal(findClashes(items, 10).length, 0, 'at least 10 min apart is fine with a 10-min gap');
    // a finished round is not checked
    const done = buildTimetable([event('Long jump U14 Boys', 'ath.lj', [{ ...lj, status: 'completed' }]), events[0]]);
    assert.equal(findClashes(done, 30).length, 0);
    // before creating: Dev (in the LJ) at 09:00 for 10 min
    const pre = clashesFor([{ id: 'a3', name: 'Dev Iyer' }, { id: 'zz', name: 'Nobody' }], at(12, 9), 10, items, 30);
    assert.deepEqual(pre.map((x) => [x.name, x.other.key, x.gap]), [['Dev Iyer', 'evlj#1', 10]]);
  });

  test('suggested slots, next free slot, time parsing', () => {
    const am = suggestRounds(at(12, 9), [{ phase: 'heat', heats: 3 }, { phase: 'final', heats: 1 }]);
    assert.equal(hhmm(am[1]), '15:00');
    assert.equal(dayKey(am[1]), DAY1);
    const pm = suggestRounds(at(12, 14), [{ phase: 'heat', heats: 3 }, { phase: 'semi', heats: 2 }, { phase: 'final', heats: 1 }]);
    assert.equal(dayKey(pm[1]), DAY2);
    assert.equal(hhmm(pm[1]), '14:00');
    assert.equal(hhmm(pm[2]), '14:00', 'a next-day afternoon round goes the day after');
    const ce = suggestRounds(at(12, 9), [], { combined: { events: ['ath.100mh', 'ath.hj', 'ath.sp', 'ath.200m', 'ath.lj'], day2: 3 } });
    assert.deepEqual(ce.map(hhmm), ['09:00', '10:00', '12:00', '09:00', '10:00']);
    assert.equal(dayKey(ce[3]), DAY2);
    // the track is busy until 09:10 (+5) → 09:15; the pool is free → 09:00
    assert.equal(hhmm(nextFreeSlot(items, DAY1, 'Track')), '09:15');
    assert.equal(hhmm(nextFreeSlot(items, DAY1, 'Pool')), '09:00');
    assert.equal(hhmm(atOf(DAY1, '930')!), '09:30');
    assert.equal(hhmm(atOf(DAY1, '9.05')!), '09:05');
    assert.equal(hhmm(atOf(DAY1, '14')!), '14:00');
    assert.equal(atOf(DAY1, '25:00'), null);
    assert.equal(atOf(DAY1, 'soon'), null);
    assert.equal(sessionOf(at(12, 16, 59)), 'PM');
    assert.equal(sessionOf(at(12, 17)), 'EVE');
  });

  test('areas, plan labels and the stored plan of times', () => {
    assert.equal(defaultArea(disciplineOf('ath.100m')), 'Track');
    assert.equal(defaultArea(disciplineOf('ath.lj')), 'Jumps pit');
    assert.equal(defaultArea(disciplineOf('ath.sp')), 'Throws area');
    assert.equal(defaultArea(disciplineOf('swim.50free')), 'Pool');
    assert.deepEqual(planLabels('ath.100m', [{ phase: 'heat' }, { phase: 'semi' }, { phase: 'final' }]), ['Heats', 'Semi-finals', 'Final']);
    assert.deepEqual(planLabels('ath.ce_pen', undefined, ['ath.100mh', 'ath.hj']), ['1. 100 m hurdles', '2. High jump'].map((x, i) => (i === 0 ? `1. ${disciplineOf('ath.100mh')!.label}` : x)));
    const f = { sched: sched100 };
    assert.equal(plannedSlot(f, 2)?.at, at(12, 15));
    assert.equal(plannedSlot(f, 3), undefined);
    assert.equal(plannedSlot({}, 1), undefined, 'events made before SD-129 keep their start');
    const moved = withRound(f, { phaseNo: 2, at: at(12, 16), area: 'Track' });
    assert.deepEqual(moved.sched.rounds.map((r) => hhmm(r.at)), ['09:00', '16:00']);
    assert.equal(sched100.rounds[1].at, at(12, 15), 'not mutated');
  });
});

describe('SD-129 printable sheets', () => {
  const def100 = disciplineOf('ath.100m')!;
  const header = { name: 'Inter-House Meet <2026>', host: 'Green Valley School', logoUrl: 'https://example.com/logo.png' };

  test('start list / heat sheet: by heat, lane order, bibs, houses, blank columns; escaped', () => {
    const entries = [athlete('a2', 'Kabir Shah', 1, { lane: 5, bib: '102' }), athlete('a1', 'Arjun <b>Rao</b>', 1, { lane: 3, bib: '101' }), athlete('a4', 'Ira Nair', 2, { lane: 4, bib: '104' })];
    const html = startListSheet({ eventTitle: '100 m U14 Boys', roundLabel: 'Heats', def: def100, format: { category: { age: 'U14', gender: 'M' } }, at: at(12, 9), area: 'Track' }, entries);
    assert.match(html, /<h2>Heat 1 <span class="note">\(2\)<\/span><\/h2>/);
    assert.match(html, /<h2>Heat 2/);
    assert.ok(html.indexOf('Arjun') < html.indexOf('Kabir'), 'lane 3 before lane 5');
    assert.match(html, /<th class="c">Lane<\/th><th>Bib<\/th><th>Name<\/th><th>House \/ team<\/th><th>Time \/ mark<\/th><th class="c">Place<\/th>/);
    assert.match(html, /Arjun &lt;b&gt;Rao&lt;\/b&gt;/);
    assert.match(html, /U14 Boys · Thu 12 Nov 2026 09:00 · Track/);
    assert.match(html, /class="dot" style="background:#d33"/);
    assert.equal((html.match(/<td class="blank"><\/td>/g) ?? []).length, 3);
  });

  test('field cards: trial boxes (3 + 3), bar heights with three tries, lifts', () => {
    const lj = disciplineOf('ath.lj')!;
    const e = [athlete('a1', 'Arjun Rao', 1, { order: 2 }), athlete('a3', 'Dev Iyer', 1, { order: 1 })];
    const card = fieldCardSheet({ eventTitle: 'Long jump U14 Boys', roundLabel: 'Final', def: lj }, e);
    assert.equal((card.match(/<td class="box"/g) ?? []).length, 2 * 7, '6 trials + place per athlete');
    assert.match(card, /wind/);
    assert.ok(card.indexOf('Dev') < card.indexOf('Arjun'), 'in trial order');
    const hjd = disciplineOf('ath.hj')!;
    const hjCard = fieldCardSheet({ eventTitle: 'High jump', roundLabel: 'Final', def: hjd, format: { bar: [1.1, 1.15, 1.2] } }, e);
    assert.match(hjCard, /<th class="c">1\.10<\/th><th class="c">1\.15<\/th><th class="c">1\.20<\/th>/);
    assert.equal((hjCard.match(/<div class="tries">/g) ?? []).length, 6);
    const wl = fieldCardSheet({ eventTitle: '61 kg', roundLabel: 'Final', def: disciplineOf('wl.total')! }, e);
    assert.match(wl, /S1.*CJ3/);
  });

  test('results sheet: places, marks, Q / q, legend, unofficial until locked', () => {
    const rows = [athlete('a1', 'Arjun Rao', 1, { mark: 12.31, lane: 4 }), athlete('a2', 'Kabir Shah', 1, { mark: 12.05, lane: 5 }), athlete('a3', 'Dev Iyer', 2, { mark: 12.5, lane: 3 }), athlete('a4', 'Ira Nair', 2, { status: 'DNS', lane: 6 })];
    const byHeat = rankByHeat(rows, def100);
    const q = qualify(byHeat, def100, { byPlace: 1, byMark: 1 });
    const heats = new Map([...byHeat].map(([h, r]) => [h, withQualification(r, q)]));
    const html = resultsSheet({ eventTitle: '100 m U14 Boys', roundLabel: 'Heats', def: def100 }, heats, { official: false });
    assert.match(html, /\(unofficial\)/);
    assert.match(html, /<td class="c">1<\/td><td>Kabir Shah/);
    assert.match(html, /12\.05/);
    assert.match(html, /DNS/);
    assert.match(html, /Q = qualified by place/);
    assert.match(html, /q = qualified by mark/);
    const fin = resultsSheet({ eventTitle: '100 m', roundLabel: 'Final', def: def100 }, new Map([[0, [...heats.values()].flat()]]), { overall: true, official: true });
    assert.doesNotMatch(fin, /unofficial|<h2>Heat/);
  });

  test('house table, timetable and the A4 document', () => {
    const t = medalTableSheet([{ name: 'Red House', colorHex: '#d33', golds: 3, silvers: 1, bronzes: 0, total: 17.5 }, { name: 'Blue House', golds: 1, silvers: 2, bronzes: 2, total: 12 }]);
    assert.match(t, /<td class="c">1<\/td><td><span class="dot" style="background:#d33"><\/span>Red House<\/td><td class="num">3<\/td>/);
    assert.match(t, /<b>17\.5<\/b>/);
    assert.match(medalTableSheet([]), /No final has finished yet/);
    const items = buildTimetable(events);
    const tt = timetableSheet(timetableDays(items), { unscheduled: unscheduled(items) });
    assert.match(tt, /Morning/);
    assert.match(tt, /<td class="num">15:00<\/td><td>100 m U14 Boys<\/td><td>Final<\/td><td>Track<\/td>/);
    assert.match(tt, /Time to be announced.*400 m U14 Girls/);
    const doc = sheetDoc({ title: 'Start lists', header, sheets: ['<h1>A</h1>', '<h1>B</h1>'], printedAt: new Date(2026, 10, 12, 8, 30) });
    assert.match(doc, /^<!doctype html>/);
    assert.match(doc, /@page \{ size: A4 portrait; margin: 12mm; \}/);
    assert.equal((doc.match(/<section class="sheet page">/g) ?? []).length, 2);
    assert.equal((doc.match(/Inter-House Meet &lt;2026&gt;/g) ?? []).length, 2, 'the meet header on every sheet');
    assert.match(doc, /<img src="https:\/\/example\.com\/logo\.png"/);
    assert.match(doc, /window\.print\(\)/);
    assert.match(doc, /@media print \{ \.bar \{ display: none; \}/);
    assert.match(doc, /Printed .* 08:30/);
    const land = sheetDoc({ title: 'Cards', header: { name: 'M', logoUrl: 'javascript:alert(1)' }, sheets: [''], landscape: true, toolbar: false });
    assert.match(land, /size: A4 landscape/);
    assert.doesNotMatch(land, /<img|javascript:|class="bar"/);
    assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});
