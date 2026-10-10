/**
 * SD-90 — athletics track on the results engine: the D9 programme by category,
 * World Athletics round presets by entry count, seeding and the lane draw,
 * Q / q progression into the final, medals and position points into the
 * house / medal table, PB / SB / MR / SR (hand-timed meets), the stat lines a
 * round writes and the measured career (PB per event, SB, medals, finals).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankByHeat, rankEntries, qualify, withQualification, nextRound, seedHeats, laneOrder, withRecordFlags, categoryKey,
  trackEventsFor, eligibleFor, hurdleHeight, recommendedRounds, roundPresets, describePlan, heatsSemisFinal,
  seedOrder, seededRng, moveLane, digitsToTime, handTime, handConversion, reactionFalseStart, startListText, resultsText,
  phaseLines, athleticsCareer, groupMeet, eventStatus, meetFieldResults, eventLeaders, topAthletes, deriveRecordBook, meetSettings, markKey,
  type DisciplineDef, type ResultEntry, type EntryResult, type MeetPhase, type PhaseFormat, type PhaseInfo, type Category,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { athleticsStats } from '../src/sports/athletics/stats.ts';
import { STAT_SPORTS, statSchema } from '../src/sports/statSchemas.ts';
import { validateSchema, careerFromSchema } from '../src/sports/statSchema.ts';
import type { StatLine } from '../src/core/types.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const M100 = D('ath.100m'), M800 = D('ath.800m'), M1500 = D('ath.1500m'), R4 = D('ath.4x100'), H80 = D('ath.80mh');
const U14B: Category = { age: 'U14', gender: 'M' };
const HOUSES = ['Red', 'Blue', 'Green', 'Gold'];

const athlete = (i: number, result: EntryResult = {}, heat = 1): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Runner ${i}`, heat, result, team: { name: `${HOUSES[i % 4]} House` } });

/* ------------------------------- programme ------------------------------- */

describe('programme: the D9 track events by category', () => {
  test('U14 boys: sprints, 800 / 1500, 80 m hurdles, both relays — no 3000 m', () => {
    const keys = trackEventsFor(U14B).map((e) => e.discipline);
    assert.deepEqual(keys, ['ath.100m', 'ath.200m', 'ath.400m', 'ath.800m', 'ath.1500m', 'ath.80mh', 'ath.4x100', 'ath.4x400']);
  });
  test('U10: 100 / 200 m and the 4 × 100 m only', () => {
    assert.deepEqual(trackEventsFor({ age: 'U10', gender: 'F' }).map((e) => e.discipline), ['ath.100m', 'ath.200m', 'ath.4x100']);
  });
  test('hurdles by age and gender (U16: girls 80 mH, boys 100 mH; U18+: 100 mH / 110 mH, 400 mH)', () => {
    const h = (c: Category) => trackEventsFor(c).filter((e) => e.group === 'hurdles').map((e) => e.discipline);
    assert.deepEqual(h({ age: 'U16', gender: 'F' }), ['ath.80mh', 'ath.300mh']);
    assert.deepEqual(h({ age: 'U16', gender: 'M' }), ['ath.100mh', 'ath.300mh']);
    assert.deepEqual(h({ age: 'U18', gender: 'F' }), ['ath.100mh', 'ath.400mh']);
    assert.deepEqual(h({ age: 'Open', gender: 'M' }), ['ath.110mh', 'ath.400mh']);
    assert.ok(trackEventsFor({ age: 'U16', gender: 'M' }).some((e) => e.discipline === 'ath.3000m'));
  });
  test('World Athletics hurdle heights for U18 / U20 / senior; none for younger groups', () => {
    assert.equal(hurdleHeight('ath.110mh', { age: 'Open', gender: 'M' }), '1.067 m');
    assert.equal(hurdleHeight('ath.110mh', { age: 'U18', gender: 'M' }), '0.914 m');
    assert.equal(hurdleHeight('ath.100mh', { age: 'U18', gender: 'F' }), '0.762 m');
    assert.equal(hurdleHeight('ath.80mh', U14B), undefined);
  });
  test('eligibility: a known mismatch excludes, unknown never does', () => {
    assert.equal(eligibleFor(U14B, { gender: 'Female', age: 12 }), false);
    assert.equal(eligibleFor(U14B, { gender: 'male', age: 14 }), false); // U14 = under 14
    assert.equal(eligibleFor(U14B, { gender: 'Male', age: 13 }), true);
    assert.equal(eligibleFor(U14B, {}), true);
    assert.equal(eligibleFor({ age: 'Open', gender: 'X' }, { gender: 'f', age: 40 }), true);
  });
  test('meet settings from the tournament format', () => {
    assert.deepEqual(meetSettings(undefined), { positionPoints: [8, 7, 6, 5, 4, 3, 2, 1], relayFactor: 1, handTimed: false, reaction: false });
    assert.deepEqual(meetSettings({ pointsScheme: '5,3,1', relayFactor: 2, handTimed: true }).positionPoints, [5, 3, 1]);
  });
});

/* -------------------------------- rounds --------------------------------- */

describe('rounds: World Athletics presets by entry count', () => {
  test('lane races: straight final up to 8; 12 → 2 heats (3 Q + 2 q) → final', () => {
    assert.deepEqual(recommendedRounds(M100, 8), [{ phase: 'final', heats: 1 }]);
    assert.deepEqual(recommendedRounds(M100, 12), [{ phase: 'heat', heats: 2, progression: { byPlace: 3, byMark: 2 } }, { phase: 'final', heats: 1 }]);
    assert.deepEqual(recommendedRounds(M100, 20)[0], { phase: 'heat', heats: 3, progression: { byPlace: 2, byMark: 2 } });
  });
  test('25–32 → 4 heats (3 + 4) → 2 semis (4 + 0) → final; 33–40 → 5 heats → 3 semis', () => {
    const p = recommendedRounds(M100, 30);
    assert.deepEqual(p.map((x) => [x.phase, x.heats, x.progression?.byPlace ?? 0, x.progression?.byMark ?? 0]), [['heat', 4, 3, 4], ['semi', 2, 4, 0], ['final', 1, 0, 0]]);
    assert.deepEqual(recommendedRounds(M100, 38).map((x) => x.heats), [5, 3, 1]);
  });
  test('every preset fills the next round exactly (Q·heats + q = lanes)', () => {
    for (let n = 9; n <= 64; n++) {
      const plan = recommendedRounds(M100, n);
      for (let i = 0; i < plan.length - 1; i++) {
        const pr = plan[i].progression!, next = plan[i + 1];
        const size = pr.byPlace! * plan[i].heats + (pr.byMark ?? 0);
        assert.equal(size, next.phase === 'final' ? 8 : next.heats * 8, `n=${n} round ${i + 1}`);
      }
      assert.ok(plan[0].heats * 8 >= n, `n=${n} fits the lanes`);
    }
  });
  test('1500 m: no lanes — straight final to 15, heats of a 12-runner final beyond', () => {
    assert.deepEqual(recommendedRounds(M1500, 15), [{ phase: 'final', heats: 1 }]);
    assert.deepEqual(recommendedRounds(M1500, 24)[0], { phase: 'heat', heats: 2, progression: { byPlace: 5, byMark: 2 } });
  });
  test('presets offered: recommended, heats → final, and semis for big fields; no straight final over the lanes', () => {
    const keys = (n: number) => roundPresets(M100, n).map((p) => p.key);
    assert.deepEqual(keys(6), ['wa', 'heats']);
    assert.deepEqual(keys(12), ['wa']); // heats → final is the recommended plan
    assert.deepEqual(keys(20), ['wa', 'semis']);
    assert.equal(heatsSemisFinal(M100, 20)[1].heats, 2);
    assert.equal(describePlan(recommendedRounds(M100, 12)), '2 heats (first 3 + 2 fastest) → Final');
  });
});

/* --------------------------- seeding and lanes --------------------------- */

describe('seeding and the lane draw', () => {
  test('seeds best first (times: fastest); unseeded after, drawn with a seed', () => {
    const list = [{ id: 'a' }, { id: 'b', seed: 12.1 }, { id: 'c', seed: 11.8 }, { id: 'd' }];
    assert.deepEqual(seedOrder(list, M100).map((x) => x.id), ['c', 'b', 'a', 'd']);
    const drawn = seedOrder(list, M100, seededRng(7)).map((x) => x.id);
    assert.deepEqual(drawn.slice(0, 2), ['c', 'b']);
    assert.deepEqual(new Set(drawn.slice(2)), new Set(['a', 'd']));
  });
  test('12 seeded athletes → 2 heats of 6, serpentine (1, 4, 5, 8, 9, 12 in heat 1)', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `s${i + 1}`);
    const s = seedHeats(ids, 2, M100);
    assert.deepEqual(s.filter((x) => x.heat === 1).map((x) => x.id), ['s1', 's4', 's5', 's8', 's9', 's12']);
    assert.deepEqual(s.filter((x) => x.heat === 1).map((x) => x.lane), [4, 5, 3, 6, 7, 8]); // seeded: best in lane 4
  });
  test('first round draw (TR 20.4.3): lanes drawn among the heat’s lanes, reproducible', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `s${i + 1}`);
    const a = seedHeats(ids, 2, M100, seededRng(42), { drawAll: true });
    const b = seedHeats(ids, 2, M100, seededRng(42), { drawAll: true });
    assert.deepEqual(a, b);
    for (const h of [1, 2]) assert.deepEqual(a.filter((x) => x.heat === h).map((x) => x.lane).sort(), [3, 4, 5, 6, 7, 8]);
    assert.notDeepEqual(a.filter((x) => x.heat === 1).map((x) => x.lane), [4, 5, 3, 6, 7, 8]);
  });
  test('later rounds: ranking groups — 800 m draws 1–5 into lanes 3–7, 6–8 into 1, 2, 8', () => {
    assert.deepEqual(laneOrder(8, undefined, 'ath.800m'), [4, 5, 3, 6, 7, 2, 1, 8]);
    const drawn = laneOrder(8, seededRng(3), 'ath.800m');
    assert.deepEqual(drawn.slice(0, 5).sort(), [3, 4, 5, 6, 7]);
    assert.deepEqual(drawn.slice(5).sort(), [1, 2, 8]);
    assert.deepEqual(laneOrder(8, seededRng(3)).slice(0, 4).sort(), [3, 4, 5, 6]);
    void M800;
  });
  test('manual override: moving into a taken lane swaps the two athletes', () => {
    const rows = [{ id: 'a', heat: 1, lane: 4 }, { id: 'b', heat: 1, lane: 5 }, { id: 'c', heat: 2, lane: 3 }];
    assert.deepEqual(moveLane(rows, 'a', 1, 5), [{ id: 'a', heat: 1, lane: 5 }, { id: 'b', heat: 1, lane: 4 }]);
    assert.deepEqual(moveLane(rows, 'c', 1, 8), [{ id: 'c', heat: 1, lane: 8 }]); // a free lane in another heat
    assert.deepEqual(moveLane(rows, 'a', 1, 4), []);
  });
});

/* ------------------------------- time entry ------------------------------ */

describe('time keypad, hand timing and reaction time', () => {
  test('digits fill from the right', () => {
    assert.equal(digitsToTime('1085'), 10.85);
    assert.equal(digitsToTime('985'), 9.85);
    assert.equal(digitsToTime('15234'), 112.34);
    assert.equal(digitsToTime('1020345'), 3723.45);
    assert.equal(digitsToTime('17500'), null); // 75 seconds isn't a time
    assert.equal(digitsToTime(''), null);
    assert.equal(digitsToTime('000'), null);
  });
  test('hand times go to the next tenth (TR 19.21); conversion is statistics only', () => {
    assert.equal(handTime(11.12), 11.2);
    assert.equal(handTime(11.2), 11.2);
    assert.equal(handTime(11.0), 11);
    assert.equal(handConversion('ath.100m'), 0.24);
    assert.equal(handConversion('ath.400m'), 0.14);
    assert.equal(handConversion('ath.1500m'), undefined);
  });
  test('reaction under 0.100 s flags a false start', () => {
    assert.equal(reactionFalseStart(0.099), true);
    assert.equal(reactionFalseStart(0.1), false);
    assert.equal(reactionFalseStart(undefined), false);
  });
});

/* --------------------- a sports day, end to end (pure) -------------------- */

const fmt = (phase: PhaseFormat['phase'], phaseNo: number, extra: Partial<PhaseFormat> = {}): PhaseFormat =>
  ({ discipline: 'ath.100m', category: U14B, phase, phaseNo, heats: phase === 'final' ? 1 : 2, eventKey: 'rev-100', eventTitle: '100 m U14 Boys', plan: recommendedRounds(M100, 12), ...extra });

// 12 boys, heat times: heat 1 = runners 0..5, heat 2 = 6..11
const HEAT_TIMES = [12.31, 12.05, 12.48, 12.9, 13.2, 12.6, 12.2, 12.11, 12.4, 12.7, 13.05, 12.55];
const heatEntries = (): ResultEntry[] => HEAT_TIMES.map((t, i) => athlete(i, { mark: t, wind: i < 6 ? 1.1 : 2.4, lane: (i % 6) + 3 }, i < 6 ? 1 : 2));

describe('U14 Boys 100 m: 12 entrants → 2 heats → final', () => {
  const plan = recommendedRounds(M100, 12);
  const byHeat = rankByHeat(heatEntries(), M100);
  const q = qualify(byHeat, M100, plan[0].progression!);
  test('first 3 per heat Q, next 2 fastest q', () => {
    const Q = [...q.marks].filter(([, m]) => m === 'Q').map(([id]) => id).sort();
    const qq = [...q.marks].filter(([, m]) => m === 'q').map(([id]) => id).sort();
    assert.deepEqual(Q, ['e0', 'e1', 'e2', 'e6', 'e7', 'e8']);
    assert.deepEqual(qq, ['e11', 'e5']); // 12.55 and 12.60
  });
  test('the final is seeded from the qualifiers into 8 lanes', () => {
    const fin = nextRound(byHeat, M100, q, 1);
    assert.equal(fin.length, 8);
    assert.deepEqual(fin.map((s) => s.lane).sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  });
  test('heat stat lines: races, place, Q, the legal mark only (heat 2 is wind-aided)', () => {
    const ranked = [...byHeat.values()].flatMap((rows) => withQualification(rows, q));
    const lines = phaseLines(fmt('heat', 1), ranked);
    const l1 = lines.find((l) => l.playerId === 'p1')!;
    assert.deepEqual(l1.stats, { place: 1, qualified: 1, races: 1, mark: 12.05, [markKey('ath.100m')]: 12.05, wind: 1.1 });
    const l7 = lines.find((l) => l.playerId === 'p7')!;
    assert.equal(l7.stats.m_100m, undefined); // +2.4 → not legal, no PB
    assert.equal(l7.stats.mark, 12.11);
  });
});

/* ------------------------------ the whole meet ---------------------------- */

const finalEntries: ResultEntry[] = [
  athlete(1, { mark: 11.98, wind: 0.8 }), athlete(7, { mark: 12.02, wind: 0.8 }), athlete(6, { mark: 12.02, wind: 0.8 }),
  athlete(0, { mark: 12.3, wind: 0.8 }), athlete(8, { mark: 12.33, wind: 0.8 }), athlete(2, { mark: 12.41, wind: 0.8 }),
  athlete(11, { status: 'DNF' }), athlete(5, { status: 'DNS' }),
];
const relayTeams: ResultEntry[] = HOUSES.map((h, i) => ({
  id: `r${i}`, name: `${h} House`, heat: 1, team: { name: `${h} House` },
  result: { mark: [52.1, 51.4, 53.0, 52.6][i], name: `${h} House`, members: [0, 1, 2, 3].map((k) => ({ playerId: `g${i}${k}`, name: `Girl ${i}${k}` })) },
}));
const phase = (id: string, f: PhaseFormat, entries: ResultEntry[], status: MeetPhase['status'] = 'completed', date = '2026-10-11T09:00:00Z'): MeetPhase => ({ id, format: f, status, date, entries });
const meetPhases = (): MeetPhase[] => [
  phase('h100', fmt('heat', 1), heatEntries()),
  phase('f100', fmt('final', 2), finalEntries),
  phase('f4x1', { discipline: 'ath.4x100', category: { age: 'U14', gender: 'F' }, phase: 'final', phaseNo: 1, heats: 1, eventKey: 'rev-4x1', eventTitle: '4 × 100 m relay U14 Girls' }, relayTeams),
];

describe('medals and points into the house table', () => {
  const events = groupMeet(meetPhases());
  test('events are grouped with their rounds in order', () => {
    assert.equal(events.length, 2);
    assert.deepEqual(events[0].phases.map((p) => p.id), ['h100', 'f100']);
    assert.equal(eventStatus(events[0]).done, true);
  });
  test('a tie for 2nd: two silvers, no bronze; the 2nd + 3rd place points are shared', () => {
    const r = meetFieldResults(events)[0];
    assert.deepEqual(r.awards.slice(0, 4).map((a) => [a.name, a.position, a.medal ?? '-', a.points]), [
      ['Runner 1', 1, 'gold', 8], ['Runner 6', 2, 'silver', 6.5], ['Runner 7', 2, 'silver', 6.5], ['Runner 0', 4, '-', 5],
    ]);
  });
  test('the medal table sums athletes’ and relays’ points by house (relays × 2 here)', () => {
    const fr = meetFieldResults(events, { positionPoints: [8, 7, 6, 5, 4, 3, 2, 1], relayFactor: 2 });
    const table = medalStandings([], [], { mode: 'position' }, undefined, fr);
    const row = (n: string) => table.find((t) => t.name === n)!;
    // 100 m: Blue (Runner 1) 8 · Gold (Runner 7) 6.5 · Green (Runner 6) 6.5 · Red (Runner 0) 5 · Red (Runner 8) 4 · Green (Runner 2) 3
    // relay ×2: Blue 16 · Red 14 · Gold 12 · Green 10
    assert.equal(row('Blue House').total, 24);
    assert.equal(row('Red House').total, 23);
    assert.equal(row('Green House').total, 19.5);
    assert.equal(row('Gold House').total, 18.5);
    assert.equal(table[0].name, 'Blue House');
    assert.equal(row('Blue House').golds, 2);
    assert.equal(row('Blue House').perEvent?.length, 2);
  });
  test('leaders: fastest per event (any round), best athletes by points from individual finals', () => {
    const lead = eventLeaders(events);
    assert.deepEqual(lead.map((l) => [l.title, l.name, l.text]), [['100 m U14 Boys', 'Runner 1', '11.98'], ['4 × 100 m relay U14 Girls', 'Blue House', '51.40']]);
    const top = topAthletes(events);
    assert.deepEqual(top.slice(0, 3).map((t) => [t.name, t.points]), [['Runner 1', 8], ['Runner 6', 6.5], ['Runner 7', 6.5]]);
    assert.ok(!top.some((t) => t.athleteId.startsWith('g'))); // relays score for the house
  });
});

describe('PB / SB / records', () => {
  test('a hand-timed meet: hand times count (flagged h); otherwise they never set a PB', () => {
    const e = [athlete(1, { mark: 12.0, hand: true })];
    const ctx = { history: [{ athleteId: 'p1', discipline: 'ath.100m', value: 12.3, date: '2025-05-01' }], records: [], category: categoryKey(U14B), seasonFrom: '2026-01-01' };
    assert.deepEqual(withRecordFlags(rankEntries(e, M100), M100, ctx)[0].flags, ['h']);
    assert.deepEqual(withRecordFlags(rankEntries(e, M100, { handLegal: true }), M100, ctx)[0].flags, ['h', 'PB']); // no gauge at a hand-timed meet
    const aided = [athlete(1, { mark: 12.0, hand: true, wind: 2.6 })];
    assert.ok(!withRecordFlags(rankEntries(aided, M100, { handLegal: true }), M100, ctx)[0].flags.includes('PB')); // a reading over +2.0 still doesn't count
  });
  test('the school record book is derived from the organisation’s earlier meets; a faster time is SR', () => {
    const older = groupMeet([phase('old', { ...fmt('final', 1), eventKey: 'rev-old' }, [athlete(20, { mark: 12.1, wind: 0.5 }), athlete(21, { mark: 12.4, wind: 0.5 })], 'completed', '2025-10-10T09:00:00Z')]);
    const book = deriveRecordBook(older, 'SR');
    assert.deepEqual(book.map((r) => [r.scope, r.discipline, r.category, r.value, r.holder]), [['SR', 'ath.100m', 'U14-M', 12.1, 'Runner 20']]);
    const flags = withRecordFlags(rankEntries(finalEntries, M100), M100, { history: [], records: book, category: 'U14-M', seasonFrom: '2026-01-01' });
    assert.ok(flags[0].flags.includes('SR'));
    assert.ok(!flags[1].flags.includes('SR'));
  });
  test('a wind-aided mark never sets a record', () => {
    const book = deriveRecordBook(groupMeet([phase('w', fmt('final', 1), [athlete(1, { mark: 11.5, wind: 3.0 })])]), 'MR');
    assert.deepEqual(book, []);
  });
});

/* ------------------------------ career / profile -------------------------- */

describe('career: PBs per event, SB, medals, finals', () => {
  const info = (id: string, phaseKind: PhaseInfo['phase'], date: string, discipline = 'ath.100m', category: Category = U14B): [string, PhaseInfo] =>
    [id, { discipline, category, phase: phaseKind, title: `${id} title`, date }];
  const line = (eventId: string, stats: Record<string, number>, date: string): StatLine =>
    ({ id: `l-${eventId}`, matchId: '', eventId, playerId: 'p1', sport: 'athletics', stats, won: !!stats.golds, date });
  const lines = [
    line('a', { races: 1, place: 2, mark: 12.4, m_100m: 12.4 }, '2025-09-01'),
    line('b', { races: 1, place: 1, mark: 12.05, m_100m: 12.05, qualified: 1 }, '2026-10-11T09:00'),
    line('c', { races: 1, place: 1, mark: 11.98, m_100m: 11.98, finals: 1, golds: 1, posPoints: 8 }, '2026-10-11T15:00'),
    line('d', { races: 1, place: 3, mark: 14.9, m_80mh: 14.9, finals: 1, bronzes: 1, posPoints: 6 }, '2026-10-11T16:00'),
    line('e', { relays: 1, finals: 1, golds: 1 }, '2026-10-11T17:00'),
    line('f', { races: 1, place: 1, mark: 11.7 }, '2026-10-12'), // wind-aided: no legal key
  ];
  const infos = new Map([info('a', 'final', '2025-09-01'), info('b', 'heat', '2026-10-11'), info('c', 'final', '2026-10-11'), info('d', 'final', '2026-10-11', 'ath.80mh'), info('e', 'final', '2026-10-11', 'ath.4x100', { age: 'U14', gender: 'X' }), info('f', 'final', '2026-10-12')]);
  const c = athleticsCareer(lines, infos, '2026-01-01');
  test('totals: races, relays, finals, medals, points', () => {
    assert.deepEqual([c.races, c.relays, c.finals, c.golds, c.silvers, c.bronzes, c.points], [5, 1, 3, 2, 0, 1, 14]);
  });
  test('PB / SB per event; hurdles keyed by category; a wind-aided 11.70 is not a PB', () => {
    assert.deepEqual(c.bests.map((b) => [b.label, b.pb.text, b.sb?.text]), [['100 m', '11.98', '11.98'], ['80 m hurdles (U14 Boys)', '14.90', '14.90']]);
    const old = athleticsCareer(lines.slice(0, 1), infos, '2026-01-01');
    assert.equal(old.bests[0].sb, undefined); // no 2026 mark yet
  });
  test('history newest first, with PB flags at the time and medals', () => {
    assert.equal(c.history[0].eventId, 'f');
    const final = c.history.find((h) => h.eventId === 'c')!;
    assert.equal(final.medal, 'gold');
    assert.ok(final.flags.includes('PB'));
    assert.equal(c.history.find((h) => h.eventId === 'b')!.flags.join(), 'PB,Q');
    assert.equal(c.history.find((h) => h.eventId === 'a')!.flags.length, 0); // the first mark isn't a "PB" flag
  });
});

describe('the athletics stat schema is registered', () => {
  test('valid, live, measured career, PB derived from the legal mark key', () => {
    assert.deepEqual(validateSchema(athleticsStats), []);
    assert.ok(STAT_SPORTS.includes('athletics'));
    assert.equal(statSchema('athletics')?.careerView, 'measured');
    const lines = [{ stats: { m_100m: 12.4 } }, { stats: { m_100m: 11.98 } }, { stats: { golds: 1 } }].map((l, i) => ({ id: `${i}`, matchId: '', playerId: 'p', sport: 'athletics', won: false, ...l })) as StatLine[];
    const cr = careerFromSchema(athleticsStats, lines);
    assert.equal(cr.bests.find((r) => r.key === 'pb_100m')?.value, '11.98');
    assert.equal(cr.medals.find((r) => r.key === 'golds')?.value, '1');
  });
});

describe('share text', () => {
  test('start list and results read well on WhatsApp', () => {
    const rows = [{ heat: 1, lane: 4, name: 'A', team: 'Red' }, { heat: 1, lane: 3, name: 'B' }, { heat: 2, lane: 5, name: 'C' }];
    assert.equal(startListText('100 m U14 Boys — Heats', rows, 'https://x/r/1'), '🏃 START LIST · 100 m U14 Boys — Heats\n\nHeat 1\nL3 B\nL4 A (Red)\n\nHeat 2\nL5 C\n\nLive results: https://x/r/1');
    assert.equal(resultsText('100 m U14 Boys — Final', [{ heat: 1, name: 'A', mark: '11.98', place: '1', flags: ['MR'] }], true), '🏃 RESULTS · 100 m U14 Boys — Final\nA 11.98 MR'.replace('\nA', '\n1. A'));
  });
});

void R4; void H80;
