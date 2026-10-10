/**
 * SD-91 — athletics field events on the results engine: the programme and
 * implement specs by category, the attempt card's flow (3 trials, the top 8
 * and ties for 8th get 3 more in reverse order — the last after round 5),
 * countback, wind-legal bests, qualification (standard / fill to 12), the
 * high-jump bar (current height, rotation, three failures out, failures
 * tie-break, jump-off for 1st or a shared 1st), career PBs per implement,
 * stat lines and the medal table.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  disciplineOf, rankEntries, rankByHeat, qualify, attemptOrder, fieldFinalists, eventAwards, phaseLines, athleticsCareer,
  fieldEventsFor, implementSpec, implementNote, defaultBoard, fieldRoundPresets, roundPresets, describePlan, attemptNextUp, trialsFor, standing,
  minBarStep, barPlan, barProgressionError, verticalState, jumpOffStart, jumpOffStatus, jumpOffTry, trialSeconds, looseLegal,
  groupMeet, meetFieldResults, eventLeaders, isFieldDiscipline, defaultBar,
  type DisciplineDef, type ResultEntry, type EntryResult, type JumpOff, type MeetPhase, type PhaseInfo, type Category,
} from '../src/data/results/index.ts';
import { medalStandings } from '../src/data/medalStandings.ts';
import { athleticsStats } from '../src/sports/athletics/stats.ts';
import { validateSchema } from '../src/sports/statSchema.ts';

const D = (k: string): DisciplineDef => { const d = disciplineOf(k); assert.ok(d, k); return d!; };
const LJ = D('ath.lj'), TJ = D('ath.tj'), HJ = D('ath.hj'), PV = D('ath.pv'), SP = D('ath.sp'), HT = D('ath.ht');
const U14G: Category = { age: 'U14', gender: 'F' }, U14B: Category = { age: 'U14', gender: 'M' };
const HOUSES = ['Red', 'Blue', 'Green', 'Gold'];

const ath = (i: number, result: EntryResult = {}, heat = 1): ResultEntry =>
  ({ id: `e${i}`, athleteId: `p${i}`, name: `Athlete ${i}`, heat, result: { order: i, ...result }, team: { name: `${HOUSES[i % 4]} House` } });
const J = (...marks: (number | 'X' | '-')[]) =>
  marks.map((m) => (m === 'X' ? { foul: true } : m === '-' ? { pass: true } : { mark: m, wind: 1.0 }));
/** Play the attempt card: take `next` until it returns null, using `mark(entry, round)`. */
function play(entries: ResultEntry[], def: DisciplineDef, mark: (e: ResultEntry, round: number) => EntryResult['attempts'] extends (infer A)[] | undefined ? A : never, o: { phase?: 'final' | 'qualification'; standard?: number } = {}) {
  const log: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const up = attemptNextUp(entries, def, o);
    if (!up) break;
    log.push(`${up.round}:${up.entry.id}`);
    const e = entries.find((x) => x.id === up.entry.id)!;
    e.result = { ...e.result, attempts: [...(e.result.attempts ?? []), mark(e, up.round)] };
  }
  return log;
}

/* ------------------------------- programme ------------------------------- */

describe('programme and implements by category', () => {
  test('D9 school core first; pole vault and hammer optional from U16', () => {
    assert.deepEqual(fieldEventsFor({ age: 'U10', gender: 'M' }).map((e) => e.discipline), ['ath.lj']);
    assert.deepEqual(fieldEventsFor(U14G).map((e) => e.discipline), ['ath.lj', 'ath.hj', 'ath.sp', 'ath.dt', 'ath.jt']);
    const u16 = fieldEventsFor({ age: 'U16', gender: 'M' });
    assert.deepEqual(u16.map((e) => e.discipline), ['ath.lj', 'ath.hj', 'ath.tj', 'ath.pv', 'ath.sp', 'ath.dt', 'ath.jt', 'ath.ht']);
    assert.deepEqual(u16.filter((e) => e.optional).map((e) => e.discipline), ['ath.pv', 'ath.ht']);
    assert.ok(isFieldDiscipline(PV) && isFieldDiscipline(HT) && !isFieldDiscipline(D('ath.100m')));
  });

  test('World Athletics implements for U18 / U20 / senior', () => {
    const w = (d: string, age: string, g: 'M' | 'F') => implementSpec(d, { age, gender: g })?.text;
    assert.equal(w('ath.sp', 'Open', 'M'), '7.26 kg');
    assert.equal(w('ath.sp', 'U20', 'M'), '6 kg');
    assert.equal(w('ath.sp', 'U18', 'M'), '5 kg');
    assert.equal(w('ath.sp', 'U18', 'F'), '3 kg');
    assert.equal(w('ath.sp', 'Open', 'F'), '4 kg');
    assert.equal(w('ath.dt', 'Open', 'M'), '2 kg');
    assert.equal(w('ath.dt', 'U20', 'M'), '1.75 kg');
    assert.equal(w('ath.dt', 'U18', 'M'), '1.5 kg');
    assert.equal(w('ath.dt', 'U18', 'F'), '1 kg');
    assert.equal(w('ath.jt', 'U18', 'M'), '700 g');
    assert.equal(w('ath.jt', 'U20', 'M'), '800 g');
    assert.equal(w('ath.jt', 'Open', 'F'), '600 g');
    assert.equal(w('ath.jt', 'U18', 'F'), '500 g');
    assert.equal(w('ath.ht', 'U18', 'M'), '5 kg');
    assert.equal(w('ath.ht', 'U20', 'F'), '4 kg');
    assert.equal(implementSpec('ath.sp', { age: 'U18', gender: 'M' })?.source, 'wa');
  });

  test('younger groups: national practice, flagged; none for jumps or Mixed', () => {
    const s = implementSpec('ath.sp', U14B);
    assert.deepEqual(s, { text: '3 kg', source: 'national' });
    assert.match(implementNote(s, U14B), /check yours/);
    assert.equal(implementSpec('ath.sp', U14G)?.text, '2 kg');
    assert.equal(implementSpec('ath.lj', U14B), undefined);
    assert.equal(implementSpec('ath.sp', { age: 'U14', gender: 'X' }), undefined);
  });

  test('triple-jump board by category; field round presets', () => {
    assert.equal(defaultBoard({ age: 'Open', gender: 'M' }), 13);
    assert.equal(defaultBoard({ age: 'Open', gender: 'F' }), 11);
    assert.equal(defaultBoard({ age: 'U16', gender: 'F' }), 9);
    assert.deepEqual(fieldRoundPresets(10).map((p) => p.key), ['wa']);
    assert.deepEqual(roundPresets(LJ, 14).map((p) => p.key), ['wa', 'qual']);
    const big = roundPresets(LJ, 24);
    assert.equal(big[0].plan[0].phase, 'qualification');
    assert.equal(big[0].plan[0].heats, 2);
    assert.match(describePlan(big[0].plan), /^Qualification \(2 groups\) — best 12 → Final$/);
    assert.match(describePlan([{ phase: 'qualification', heats: 1, progression: { fillTo: 12, standard: 5.2 } }, { phase: 'final', heats: 1 }]), /standard 5.20 m or best 12/);
  });
});

/* ------------------------------ attempt flow ----------------------------- */

describe('attempt card: 3 + 3 for the top 8, reverse order, ties at 8th', () => {
  // 10 U14 girls in long jump. Best marks after 3: 1 > 2 > … ; 8 and 9 level even on countback.
  const best3: Record<string, (number | 'X')[]> = {
    e1: [4.80, 4.70, 4.60], e2: [4.75, 'X', 4.50], e3: [4.60, 4.55, 4.40], e4: [4.50, 4.40, 4.30], e5: [4.40, 4.30, 4.20],
    e6: [4.30, 4.20, 4.10], e7: [4.20, 4.10, 4.00], e8: [4.00, 3.90, 'X'], e9: [4.00, 3.90, 'X'], e10: ['X', 'X', 'X'],
  };
  const make = () => Array.from({ length: 10 }, (_, i) => ath(i + 1));
  const later: Record<string, number> = { e1: 4.81, e2: 4.90, e3: 4.62, e4: 4.51, e5: 4.41, e6: 4.31, e7: 4.21, e8: 4.01, e9: 3.80 };

  test('rounds 1–3 go in start order; then the 9 finalists (tie for 8th) in reverse; round 6 reverses the standings after 5', () => {
    const field = make();
    const log = play(field, LJ, (e, r) => {
      if (r <= 3) { const m = best3[e.id][r - 1]; return m === 'X' ? { foul: true } : { mark: m, wind: 1.2 }; }
      return r === 4 ? { mark: later[e.id], wind: 0.5 } : { foul: true };
    });
    // 30 trials in three rounds, in start order
    assert.deepEqual(log.slice(0, 10), Array.from({ length: 10 }, (_, i) => `1:e${i + 1}`));
    assert.deepEqual(log.slice(20, 30).map((x) => x.split(':')[1]), Array.from({ length: 10 }, (_, i) => `e${i + 1}`));
    // 8th place is tied after countback (4.00, 3.90 each) → 9 go through; e10 (NM) doesn't
    assert.deepEqual([...fieldFinalists(field, LJ)].sort(), ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9'].sort());
    const r4 = log.filter((x) => x.startsWith('4:')).map((x) => x.slice(2));
    assert.equal(r4.length, 9);
    assert.equal(r4[r4.length - 1], 'e1'); // the leader after 3 goes last
    assert.equal(r4[r4.length - 2], 'e2');
    assert.ok(!r4.includes('e10'));
    // after round 5 e2 (4.90) leads → goes last in round 6; e1 second-to-last
    const r6 = log.filter((x) => x.startsWith('6:')).map((x) => x.slice(2));
    assert.equal(r6.length, 9);
    assert.deepEqual(r6.slice(-2), ['e1', 'e2']);
    assert.deepEqual(attemptOrder(field, LJ, 6).map((e) => e.id).slice(-2), ['e1', 'e2']);
    assert.equal(log.length, 30 + 27);
    assert.equal(attemptNextUp(field, LJ), null);
    // the final ranking uses all six: e2 wins with 4.90
    const rows = rankEntries(field, LJ);
    assert.deepEqual(rows.slice(0, 2).map((r) => r.id), ['e2', 'e1']);
    assert.equal(rows.find((r) => r.id === 'e10')?.label, 'NM');
  });

  test('countback separates a tie at 8th — then only 8 go through', () => {
    const field = make();
    field.forEach((e) => { e.result.attempts = best3[e.id].map((m) => (m === 'X' ? { foul: true } : { mark: m })); });
    field[8].result.attempts = J(4.00, 3.95, 'X'); // e9's second-best now beats e8's 3.90
    const fin = fieldFinalists(field, LJ);
    assert.ok(fin.has('e9') && !fin.has('e8'));
    assert.equal(fin.size, 8);
  });

  test('8 or fewer athletes: everyone gets six trials, even with no valid mark', () => {
    const field = Array.from({ length: 6 }, (_, i) => ath(i + 1));
    const log = play(field, LJ, (e) => (e.id === 'e6' ? { foul: true } : { mark: 4 + Number(e.id.slice(1)) / 100, wind: 0 }));
    assert.equal(log.length, 36);
    assert.equal(field[5].result.attempts?.length, 6);
    assert.equal(trialsFor(LJ, 'final'), 6);
  });

  test('DNS athletes are skipped; standing shows place and leader', () => {
    const field = [ath(1, { attempts: J(5.1) }), ath(2, { status: 'DNS' }), ath(3, { attempts: J(4.9) })];
    assert.equal(attemptNextUp(field, LJ)?.entry.id, 'e1');
    assert.equal(attemptNextUp(field, LJ)?.round, 2);
    const s = standing(field, LJ, 'e3');
    assert.equal(s.label, '2');
    assert.equal(s.leader?.name, 'Athlete 1');
    assert.equal(s.leader?.text, '5.10');
  });

  test('qualification: 3 trials only; an athlete who reaches the standard stops', () => {
    const field = Array.from({ length: 4 }, (_, i) => ath(i + 1));
    const log = play(field, LJ, (e, r) => ({ mark: e.id === 'e1' ? 5.3 : 4 + r / 10, wind: 0 }), { phase: 'qualification', standard: 5.2 });
    assert.equal(field[0].result.attempts?.length, 1);
    assert.equal(field[1].result.attempts?.length, 3);
    assert.equal(log.length, 1 + 3 * 3);
    assert.equal(trialsFor(LJ, 'qualification'), 3);
  });

  test('qualification across two groups: standard → Q, filled to 12 with q (ties at 12th all go)', () => {
    const entries: ResultEntry[] = [];
    for (let i = 1; i <= 20; i++) entries.push(ath(i, { attempts: [{ mark: i <= 3 ? 5.3 : 5.0 - i * 0.02 }] }, i % 2 ? 1 : 2));
    // 3 reach the standard; 9 more fill to 12 — e12 and e13 are level for 12th (4.75)
    entries[11].result.attempts = [{ mark: 4.75 }]; entries[12].result.attempts = [{ mark: 4.75 }];
    const q = qualify(rankByHeat(entries, SP), SP, { standard: 5.2, fillTo: 12 });
    assert.deepEqual(['e1', 'e2', 'e3'].map((id) => q.marks.get(id)), ['Q', 'Q', 'Q']);
    assert.equal(q.marks.size, 13);
    assert.ok(q.marks.get('e12') === 'q' && q.marks.get('e13') === 'q' && !q.marks.has('e14'));
    assert.deepEqual(q.tieAtLine.sort(), ['e12', 'e13']);
  });
});

/* ------------------------------ countback / wind ------------------------- */

describe('countback and wind-legal bests', () => {
  test('countback: equal bests split on the second, then third mark', () => {
    const rows = rankEntries([
      ath(1, { attempts: J(5.00, 4.80, 4.70) }), ath(2, { attempts: J(5.00, 4.90, 'X') }), ath(3, { attempts: J(5.00, 4.80, 4.75) }),
    ], LJ);
    assert.deepEqual(rows.map((r) => `${r.label}:${r.id}`), ['1:e2', '2:e3', '3:e1']);
  });

  test('a wind-aided best ranks but the best legal mark is the PB / record mark', () => {
    const [r] = rankEntries([ath(1, { attempts: [{ mark: 11.20, wind: 2.6 }, { mark: 11.05, wind: 1.4 }, { foul: true }] })], TJ);
    assert.equal(r.bestText, '11.20');
    assert.ok(r.flags.includes('w'));
    assert.equal(r.bestLegal, 11.05);
  });

  test('no reading: not legal at a gauged pit; legal at a pit with no gauge (looseLegal)', () => {
    const e = ath(1, { attempts: [{ mark: 5.5 }, { mark: 5.4, wind: 2.1 }] });
    assert.equal(rankEntries([e], LJ)[0].bestLegal, null);
    assert.equal(looseLegal({ noWindGauge: true }), true);
    assert.equal(rankEntries([e], LJ, { handLegal: looseLegal({ noWindGauge: true }) })[0].bestLegal, 5.5);
    // a reading over +2.0 still never counts
    const aided = ath(2, { attempts: [{ mark: 5.6, wind: 2.4 }] });
    assert.equal(rankEntries([aided], LJ, { handLegal: true })[0].bestLegal, null);
    // throws have no gauge
    assert.equal(rankEntries([ath(3, { attempts: [{ mark: 9.87 }] })], SP)[0].bestLegal, 9.87);
  });
});

/* ------------------------------- high jump ------------------------------- */

const H = (...p: [number, string][]) => p.map(([height, tries]) => ({ height, tries }));

describe('high jump: bar progression, current height, failures, jump-off', () => {
  test('bar plan and TR 26.4 checks (≥ 2 cm HJ / 5 cm PV, raises never grow)', () => {
    assert.deepEqual(barPlan(1.10, 0.05, 1.25, 0.03, 7), [1.10, 1.15, 1.20, 1.25, 1.28, 1.31, 1.34]);
    assert.equal(barProgressionError([1.10, 1.15, 1.20, 1.23, 1.25], HJ), null);
    assert.match(barProgressionError([1.10, 1.11], HJ)!, /at least 2 cm/);
    assert.match(barProgressionError([1.10, 1.13, 1.18], HJ)!, /may not increase/);
    assert.equal(minBarStep(PV), 0.05);
    assert.match(barProgressionError([2.0, 2.03], PV)!, /at least 5 cm/);
    const d = defaultBar(HJ, U14B);
    assert.ok(d.start > 1 && d.step2 <= d.step);
  });

  test('current height: first tries go round, then second tries; passes; three failures in a row = out', () => {
    const bar = [1.10, 1.15, 1.20];
    const a = ath(1), b = ath(2), c = ath(3);
    let s = verticalState([a, b, c], bar);
    assert.deepEqual([s.height, s.up?.id, s.attempt], [1.10, 'e1', 1]);
    a.result.heights = H([1.10, 'X']);
    b.result.heights = H([1.10, 'O']);
    s = verticalState([a, b, c], bar);
    assert.equal(s.up?.id, 'e3'); // c still has a first try before a's second
    c.result.heights = H([1.10, '-']); // c passes 1.10
    s = verticalState([a, b, c], bar);
    assert.deepEqual([s.up?.id, s.attempt], ['e1', 2]);
    a.result.heights = H([1.10, 'XO']);
    s = verticalState([a, b, c], bar);
    assert.equal(s.height, 1.15);
    a.result.heights = H([1.10, 'XO'], [1.15, 'XXX']);
    b.result.heights = H([1.10, 'O'], [1.15, 'O']);
    c.result.heights = H([1.10, '-'], [1.15, 'XX-']);
    s = verticalState([a, b, c], bar);
    assert.equal(s.active.length, 2);
    assert.deepEqual([s.height, s.up?.id], [1.20, 'e2']);
    // c's X X at 1.15 + X at 1.20 = three in a row → out
    c.result.heights = H([1.10, '-'], [1.15, 'XX-'], [1.20, 'X']);
    b.result.heights = H([1.10, 'O'], [1.15, 'O'], [1.20, 'XXX']);
    s = verticalState([a, b, c], bar);
    assert.equal(s.active.length, 0);
    assert.equal(s.up, null);
    // b won on 1.15 (c: no clearance → NM)
    const rows = rankEntries([a, b, c], HJ);
    assert.deepEqual(rows.map((r) => `${r.label}:${r.id}`), ['1:e2', '2:e1', 'NM:e3']);
  });

  test('one athlete left: the bar is suggested higher', () => {
    const solo = ath(1, { heights: H([1.10, 'O'], [1.15, 'O']) });
    const s = verticalState([solo, ath(2, { heights: H([1.10, 'XXX']) })], [1.10, 1.15]);
    assert.equal(s.active.length, 1);
    assert.equal(s.suggestNext, 1.2);
  });

  test('failures tie-break (TR 26.8), then a jump-off for 1st (TR 26.9)', () => {
    const tied = [
      ath(1, { heights: H([1.30, 'O'], [1.35, 'XO'], [1.38, 'XXX']) }),
      ath(2, { heights: H([1.30, 'O'], [1.35, 'XO'], [1.38, 'XXX']) }),
      ath(3, { heights: H([1.30, 'XO'], [1.35, 'XO'], [1.38, 'XXX']) }), // more failures in total → 3rd
    ];
    let rows = rankEntries(tied, HJ);
    assert.deepEqual(rows.map((r) => r.label), ['=1', '=1', '3']);
    assert.ok(rows[0].needsDecider && rows[0].flags.includes('JO'));
    // jump-off starts at the next height of the progression above the tie (1.38)
    const bar = [1.30, 1.35, 1.38, 1.41];
    const start = jumpOffStart(bar, 1.35, HJ);
    assert.equal(start, 1.38);
    let jo: JumpOff = { athletes: ['e1', 'e2'], rounds: [] };
    let st = jumpOffStatus(jo, HJ, start);
    assert.deepEqual([st.height, st.up, st.decided], [1.38, 'e1', false]);
    // both fail → down 2 cm
    jo = jumpOffTry(jo, HJ, start, 'e1', 'X'); jo = jumpOffTry(jo, HJ, start, 'e2', 'X');
    st = jumpOffStatus(jo, HJ, start);
    assert.equal(st.height, 1.36);
    // both clear → up 2 cm
    jo = jumpOffTry(jo, HJ, start, 'e1', 'O'); jo = jumpOffTry(jo, HJ, start, 'e2', 'O');
    st = jumpOffStatus(jo, HJ, start);
    assert.equal(st.height, 1.38);
    // e2 clears, e1 fails → e2 wins
    jo = jumpOffTry(jo, HJ, start, 'e1', 'X'); jo = jumpOffTry(jo, HJ, start, 'e2', 'O');
    st = jumpOffStatus(jo, HJ, start);
    assert.equal(st.decided, true);
    assert.deepEqual([...st.places].sort(), [['e1', 2], ['e2', 1]]);
    assert.equal(jo.rounds.length, 3);
    // the places become deciders: e2 1st, e1 2nd; the jump-off heights are not marks
    tied[0].result.decider = st.places.get('e1'); tied[1].result.decider = st.places.get('e2');
    rows = rankEntries(tied, HJ);
    assert.deepEqual(rows.map((r) => `${r.label}:${r.id}`), ['1:e2', '2:e1', '3:e3']);
    assert.equal(rows[0].best, 1.35);
    assert.ok(!rows.some((r) => r.needsDecider));
  });

  test('a three-way jump-off: two clear, one fails → out (3rd), the other two go on', () => {
    let jo: JumpOff = { athletes: ['a', 'b', 'c'], rounds: [] };
    for (const [id, t] of [['a', 'O'], ['b', 'O'], ['c', 'X'], ['a', 'X'], ['b', 'O']] as const) jo = jumpOffTry(jo, PV, 3.0, id, t);
    const st = jumpOffStatus(jo, PV, 3.0);
    assert.equal(st.decided, true);
    assert.deepEqual(Object.fromEntries(st.places), { b: 1, a: 2, c: 3 });
    assert.equal(jo.rounds[1].height, 3.05); // PV raises 5 cm
  });

  test('athletes may agree to share 1st: equal deciders settle the tie (two golds)', () => {
    const shared = jumpOffStatus({ athletes: ['e1', 'e2'], shared: true, rounds: [] }, HJ, 1.4);
    assert.deepEqual(Object.fromEntries(shared.places), { e1: 1, e2: 1 });
    const rows = rankEntries([
      ath(1, { heights: H([1.35, 'O'], [1.40, 'XXX']), decider: 1 }),
      ath(2, { heights: H([1.35, 'O'], [1.40, 'XXX']), decider: 1 }),
      ath(3, { heights: H([1.30, 'O'], [1.35, 'XXX']) }),
    ], HJ);
    assert.deepEqual(rows.map((r) => r.label), ['=1', '=1', '3']);
    assert.ok(!rows[0].needsDecider && !rows[0].flags.includes('JO'));
    const aw = eventAwards(rows);
    assert.deepEqual(aw.map((a) => a.medal), ['gold', 'gold', 'bronze']);
    assert.deepEqual(aw.map((a) => a.points), [7.5, 7.5, 6]);
  });

  test('trial time limits (TR 25.17)', () => {
    assert.equal(trialSeconds(LJ, 12), 60);
    assert.equal(trialSeconds(HJ, 3), 90);
    assert.equal(trialSeconds(PV, 2), 120);
    assert.equal(trialSeconds(HJ, 1), 180);
    assert.equal(trialSeconds(PV, 1), 300);
    assert.equal(trialSeconds(HJ, 5, true), 120);
    assert.equal(trialSeconds(PV, 5, true), 180);
  });
});

/* ------------------------- careers, lines, medal table ------------------- */

describe('stat lines, career PBs per implement, meet views and medal table', () => {
  const f = (discipline: string, category: Category, implement?: string) => ({ discipline, phase: 'final' as const, category, implement });

  test('a field final writes field = 1, the mark, the legal mark key and the best jump wind', () => {
    const rows = rankEntries([ath(1, { attempts: [{ mark: 4.82, wind: 1.1 }] }), ath(2, { attempts: [{ mark: 4.90, wind: 2.5 }, { mark: 4.70, wind: 0.3 }] })], LJ);
    const lines = phaseLines(f('ath.lj', U14G), rows, eventAwards(rows));
    const l2 = lines.find((l) => l.playerId === 'p2')!;
    assert.equal(l2.stats.field, 1);
    assert.equal(l2.stats.races, undefined);
    assert.equal(l2.stats.mark, 4.9);
    assert.equal(l2.stats.m_lj, 4.7); // legal only
    assert.equal(l2.stats.wind, 2.5);
    assert.equal(l2.stats.golds, 1);
  });

  test('career: throws PB per implement weight; jumps one PB; history titles', () => {
    const infos = new Map<string, PhaseInfo>([
      ['ph1', { discipline: 'ath.sp', category: U14B, phase: 'final', title: 'Shot put U14 Boys — Final', date: '2025-11-02', implement: '3 kg' }],
      ['ph2', { discipline: 'ath.sp', category: { age: 'U16', gender: 'M' }, phase: 'final', title: 'Shot put U16 Boys — Final', date: '2026-08-02', implement: '4 kg' }],
      ['ph3', { discipline: 'ath.sp', category: U14B, phase: 'final', title: 'Shot put U14 Boys — Final', date: '2026-02-02', implement: '3 kg' }],
      ['ph4', { discipline: 'ath.hj', category: U14B, phase: 'final', title: 'High jump U14 Boys — Final', date: '2026-03-02' }],
    ]);
    const lines = [
      { eventId: 'ph1', date: '2025-11-02', stats: { field: 1, place: 1, golds: 1, mark: 9.1, m_sp: 9.1 } },
      { eventId: 'ph2', date: '2026-08-02', stats: { field: 1, place: 3, bronzes: 1, mark: 8.4, m_sp: 8.4 } },
      { eventId: 'ph3', date: '2026-02-02', stats: { field: 1, place: 2, silvers: 1, mark: 9.6, m_sp: 9.6 } },
      { eventId: 'ph4', date: '2026-03-02', stats: { field: 1, place: 1, golds: 1, mark: 1.42, m_hj: 1.42 } },
    ];
    const c = athleticsCareer(lines, infos, '2026-01-01');
    assert.equal(c.field, 4);
    assert.equal(c.races, 0);
    const sp3 = c.bests.find((b) => b.key === 'ath.sp|3 kg')!;
    const sp4 = c.bests.find((b) => b.key === 'ath.sp|4 kg')!;
    assert.equal(sp3.label, 'Shot put (3 kg)');
    assert.equal(sp3.pb.value, 9.6);
    assert.equal(sp3.sb?.value, 9.6);
    assert.equal(sp4.pb.value, 8.4); // a heavier shot is its own PB — not "worse than 9.6"
    assert.equal(sp4.pb.implement, '4 kg');
    assert.equal(c.bests.find((b) => b.key === 'ath.hj')?.pb.text, '1.42');
    assert.ok(c.history.find((h) => h.eventId === 'ph3')?.flags.includes('PB'));
  });

  test('medal / house table and "best by event" include field finals', () => {
    const ph = (id: string, discipline: string, entries: ResultEntry[], category = U14G): MeetPhase => ({
      id, status: 'completed', date: '2026-10-11T09:00:00Z', entries,
      format: { discipline, category, phase: 'final', phaseNo: 1, heats: 1, eventKey: `k-${id}`, eventTitle: `${disciplineOf(discipline)!.label} ${category.age}` },
    });
    const lj = ph('lj', 'ath.lj', [ath(1, { attempts: [{ mark: 4.5, wind: 0.2 }] }), ath(2, { attempts: [{ mark: 4.6, wind: 3.0 }] }), ath(3, { attempts: J('X', 'X', 'X') })]);
    const hj = ph('hj', 'ath.hj', [ath(4, { heights: H([1.2, 'O'], [1.25, 'XXX']) }), ath(5, { heights: H([1.2, 'XO'], [1.25, 'XXX']) })], U14B);
    const events = groupMeet([lj, hj]);
    const res = meetFieldResults(events, { positionPoints: [5, 3, 1] });
    assert.equal(res.length, 2);
    assert.deepEqual(res[0].awards.map((a) => [a.name, a.medal, a.points]), [['Athlete 2', 'gold', 5], ['Athlete 1', 'silver', 3]]);
    const table = medalStandings([], [], { mode: 'position' }, undefined, res);
    assert.ok(table.length >= 2);
    const leaders = eventLeaders(events);
    assert.deepEqual(leaders.map((l) => [l.text, l.flags]), [['4.60', ['w']], ['1.20', []]]);
  });

  test('stat schema declares the field marks and stays valid', () => {
    assert.deepEqual(validateSchema(athleticsStats), []);
    for (const k of ['m_lj', 'm_tj', 'm_hj', 'm_pv', 'm_sp', 'm_dt', 'm_jt', 'm_ht', 'pb_lj', 'field']) assert.ok(athleticsStats.stats.some((s) => s.key === k), k);
  });
});
