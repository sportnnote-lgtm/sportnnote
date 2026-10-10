/**
 * SD-33 / SD-41 / SD-82 — kabaddi depth.
 *  • SD-33 (KB-02): absolute statTotals from the raid replay (raid / tackle
 *    points + raid and tackle counts) pass the SD-19 contract harness, survive
 *    edits / removes / undo, heal pre-SD-03 lines, and are coverage-aware
 *    for old one-tap RAID / TACKLE logs.
 *  • SD-41 (KB-03): the PKL match centre (points split, raids, strike rates,
 *    super raids / tackles, do-or-die, all-outs) in the comparison panel.
 *  • SD-82 (KB-04): career raid strike rate, not-out %, super raids / tackles,
 *    successful tackles, best match by total points.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, raidActions, raidReversals, type KabaddiState, type RaidForm,
} from '../src/sports/kabaddi/engine.ts';
import { kabaddiTotals, kabaddiMatchCentre, KABADDI_COUNT_KEYS } from '../src/sports/kabaddi/totals.ts';
import { readFileSync } from 'node:fs';
import { kabaddiVoice } from '../src/sports/voiceParsers.ts';
import { kabaddiBox } from '../src/sports/boxSources.ts';
import { comparisonRows } from '../src/sports/boxScore.ts';
import { STAT_SCHEMAS, statSchema } from '../src/sports/statSchemas.ts';
import { aggregateValue, statDefIn, validateSchema } from '../src/sports/statSchema.ts';
import { careerSections } from '../src/data/career.ts';
import { planStatSync } from '../src/data/statSync.ts';
import { assertContract, assertSameAsClean, toRecords, replay, liveSums, type TotalsSport } from './statTotalsHarness.mts';
import type { ScoreAction, StatTotalsContext } from '../src/sports/types.ts';
import type { Match, StatLine } from '../src/core/types.ts';

type Side = 'home' | 'away';
const P = (id: string, fullName: string) => ({ id, fullName });
const H = [P('h1', 'Ravi'), P('h2', 'Dev'), P('h3', 'Sunil')];
const A = [P('a1', 'Arjun'), P('a2', 'Bhanu'), P('a3', 'Chetan')];
const CFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, substitutes: 2 };
const CTX: StatTotalsContext = { players: { home: H.map((p) => ({ id: p.id, name: p.fullName })), away: A.map((p) => ({ id: p.id, name: p.fullName })) } };

const SPORT: TotalsSport<KabaddiState> = {
  name: 'kabaddi', init, reducer, statTotals: kabaddiTotals, partial: true, config: CFG, ctx: CTX, derived: [...KABADDI_COUNT_KEYS],
};

/** Score a match through the guided raid form, collecting the dispatched actions (as stored). */
class Scorer {
  s: KabaddiState;
  actions: ScoreAction[] = [];
  constructor(cfg: Record<string, unknown> = CFG) { this.s = init(cfg); }
  push(a: ScoreAction) { this.s = reducer(this.s, a); this.actions.push(a); return this; }
  raid(f: Partial<RaidForm> & { side: Side }, minute = 3, half = 1) {
    for (const a of raidActions(this.s, { touches: 0, bonus: false, tackled: false, ...f })) {
      this.push(a.type === 'REMOVE_EVENT' ? a : { ...a, payload: { ...a.payload, minute, half } });
    }
    return this;
  }
  lastRaidId() { return this.s.raids[this.s.raids.length - 1].eid!; }
}

/** A full match: touches, bonus, empty raids → do-or-die (won and failed),
 *  tackles, a super tackle, an all-out, an unnamed raid, a voice tackle, a sub. */
function fullMatch(): Scorer {
  const m = new Scorer();
  m.push({ type: 'KICKOFF', payload: { at: 1 } });
  m.raid({ side: 'home', raider: H[2], touches: 1, bonus: true }, 1); // 1 touch + bonus (6 defenders left)
  m.raid({ side: 'away', raider: A[0], tackled: true, tackler: H[1] }, 2); // tackle +1 home
  m.raid({ side: 'home', raider: H[0], touches: 2 }, 3); // h: 2
  m.raid({ side: 'away', raider: A[1] }, 4); // empty
  m.raid({ side: 'away', raider: A[1] }, 5); // empty
  m.raid({ side: 'away', raider: A[2] }, 6); // do-or-die, nothing → raider out, defence +1 (no tackler)
  m.raid({ side: 'home', raider: H[0] }, 7); // empty
  m.raid({ side: 'home', raider: H[0] }, 8); // empty
  m.raid({ side: 'home', raider: H[0], touches: 1 }, 9); // do-or-die won
  m.raid({ side: 'home', raider: H[2], touches: 3 }, 10); // 3 touched, but only 1 defender left: SD-114 caps it at 1 → all-out
  m.push({ type: 'NEXT_HALF' });
  m.raid({ side: 'away', raider: A[0], touches: 2 }, 21, 2);
  m.raid({ side: 'home', touches: 1 }, 22, 2); // nobody named
  m.push({ type: 'SUB', side: 'away', payload: { offName: 'Bhanu', onName: 'Bala', minute: 23, half: 2 } });
  // voice: "tackle Ravi" → a tackled away raid, Ravi credited
  const voice = kabaddiVoice('tackle Ravi', { state: m.s, homeName: 'Reds', awayName: 'Blues', homeRoster: H as never, awayRoster: A as never } as never);
  assert.ok(voice?.length);
  for (const a of voice!) m.push({ ...a, payload: { ...a.payload, minute: 24, half: 2 } });
  m.raid({ side: 'home', raider: H[0], touches: 4 }, 25, 2); // super raid, more defenders out
  return m;
}

/** Mat squeezed: the away side down to 3 → a super tackle; then an all-out. */
function squeezeMatch(): Scorer {
  const m = new Scorer();
  m.raid({ side: 'home', raider: H[0], touches: 4 }, 1); // away 3 on the mat
  m.raid({ side: 'home', raider: H[1], tackled: true, tackler: A[0] }, 2); // super tackle (+2), revives 1
  m.raid({ side: 'home', raider: H[2], touches: 4 }, 3); // the last 4 away defenders out → all-out
  m.raid({ side: 'away', raider: A[1], touches: 1 }, 4);
  return m;
}

describe('SD-33 — statTotals pass the SD-19 contract', () => {
  test('a full match: clean log and every undo prefix', () => {
    const m = fullMatch();
    const t = assertContract(SPORT, toRecords(m.actions));
    // raid points are the actual points scored, not +1 per raid
    assert.equal(t.h1.stats.raidPoints, 2 + 1 + 4);
    assert.deepEqual(
      Object.fromEntries(['raids', 'successfulRaids', 'emptyRaids', 'raidsOut', 'touchPoints', 'bonusPoints', 'superRaids', 'doOrDieRaids', 'doOrDiePoints'].map((k) => [k, t.h1.stats[k]])),
      { raids: 5, successfulRaids: 3, emptyRaids: 2, raidsOut: 0, touchPoints: 7, bonusPoints: 0, superRaids: 1, doOrDieRaids: 1, doOrDiePoints: 1 },
    );
    assert.equal(t.h3.stats.bonusPoints, 1);
    assert.equal(t.h3.stats.superRaids, 0); // SD-114: the 3-touch raid on 1 defender scores 1
    // the failed do-or-die: the raider is out, nobody is credited a tackle
    assert.deepEqual([t.a3.stats.raids, t.a3.stats.raidsOut, t.a3.stats.doOrDieRaids, t.a3.stats.raidPoints], [1, 1, 1, 0]);
    // tacklers: Dev's form tackle, Ravi's voice tackle
    assert.deepEqual([t.h2.stats.tacklePoints, t.h2.stats.tackles], [1, 1]);
    assert.deepEqual([t.h1.stats.tacklePoints, t.h1.stats.tackles], [1, 1]);
    // every credited player carries every count key (a missing key would read "not tracked")
    for (const e of Object.values(t)) for (const k of KABADDI_COUNT_KEYS) assert.ok(k in e.stats, k);
    assert.equal(t.h1.side, 'home');
    assert.equal(t.a1.side, 'away');
  });

  test('super tackle and all-out', () => {
    const m = squeezeMatch();
    const t = assertContract(SPORT, toRecords(m.actions));
    assert.deepEqual([t.a1.stats.tacklePoints, t.a1.stats.tackles, t.a1.stats.superTackles], [2, 1, 1]);
    assert.equal(t.h2.stats.raidsOut, 1);
  });

  test('the plugin is wired: partial, needs players, owns raid / tackle points', () => {
    // (the plugin file imports React Native — check its wiring as text)
    const src = readFileSync(new URL('../src/sports/kabaddi/index.tsx', import.meta.url), 'utf8');
    assert.match(src, /statTotals: kabaddiTotals,\s*statTotalsPartial: true,\s*statTotalsNeedsPlayers: true,/);
  });
});

describe('SD-33 — corrections', () => {
  test('edit a raid (form re-entry): totals equal the same match scored cleanly', () => {
    const m = new Scorer();
    m.raid({ side: 'home', raider: H[0], touches: 1 }, 1);
    m.raid({ side: 'away', raider: A[0], touches: 1 }, 2);
    const id = m.lastRaidId();
    m.raid({ side: 'away', raider: A[1], tackled: true, tackler: H[1], editOf: id }, 2); // it was actually Bhanu, tackled by Dev
    const clean = new Scorer();
    clean.raid({ side: 'home', raider: H[0], touches: 1 }, 1);
    clean.raid({ side: 'away', raider: A[1], tackled: true, tackler: H[1] }, 2);
    assertSameAsClean(SPORT, toRecords(m.actions), toRecords(clean.actions), 'edit raid');
    // (the edit is one batch: carrier + re-entered raid — undo cuts around it)
    assertContract(SPORT, toRecords(m.actions), { every: 2 });
  });

  test('remove a raid (v:2 with its reversals): equals the clean log', () => {
    const m = new Scorer();
    m.raid({ side: 'home', raider: H[0], touches: 2 }, 1);
    m.raid({ side: 'away', raider: A[0], tackled: true, tackler: H[1] }, 2);
    const head = m.s.events.find((e) => e.id === m.lastRaidId())!;
    m.push({ type: 'REMOVE_EVENT', side: 'away', payload: { id: head.id, v: 2 }, ...raidReversals(m.s, head) });
    const clean = new Scorer();
    clean.raid({ side: 'home', raider: H[0], touches: 2 }, 1);
    assertSameAsClean(SPORT, toRecords(m.actions), toRecords(clean.actions), 'remove raid');
  });

  test('a removed early raid re-derives later raids: totals follow the replay (healed), not the stale credits', () => {
    // Removing raid 1 turns raid 4 from do-or-die to a normal raid: the totals
    // equal the clean match even though the live credits can't know that.
    const m = new Scorer();
    m.raid({ side: 'home', raider: H[0] }, 1);
    const first = m.lastRaidId();
    m.raid({ side: 'home', raider: H[0] }, 2);
    m.raid({ side: 'home', raider: H[0] }, 3); // do-or-die fail → out
    m.push({ type: 'REMOVE_EVENT', side: 'home', payload: { id: first, v: 2 } });
    const clean = new Scorer();
    clean.raid({ side: 'home', raider: H[0] }, 2);
    clean.raid({ side: 'home', raider: H[0] }, 3);
    const a = kabaddiTotals(replay(SPORT, toRecords(m.actions)), CTX);
    const b = kabaddiTotals(replay(SPORT, toRecords(clean.actions)), CTX);
    assert.deepEqual(a, b);
    assert.deepEqual([a.h1.stats.raids, a.h1.stats.raidsOut, a.h1.stats.doOrDieRaids], [2, 0, 0]);
  });
});

describe('SD-33 — old logs (Decision 8, D2 heal)', () => {
  const oldRaid = (side: Side, touches: number, raiderOut: boolean, minute: number, tacklerBy?: number): ScoreAction => ({
    type: 'RAID_OUTCOME', side,
    attribution: { playerId: side === 'home' ? 'h1' : 'a1', stat: 'raidPoints', playerName: side === 'home' ? 'Ravi' : 'Arjun' },
    ...(tacklerBy ? { attribution2: { playerId: side === 'home' ? 'a2' : 'h2', stat: 'tacklePoints', by: tacklerBy, playerName: side === 'home' ? 'Bhanu' : 'Dev' } } : null),
    payload: { touches, bonus: false, raiderOut, minute, half: 1 },
  });

  test('pre-SD-03 guided raids (+1 per raid live): the totals give the real raid points', () => {
    const log = [oldRaid('home', 3, false, 1), oldRaid('home', 0, false, 2), oldRaid('away', 0, true, 3, 1), oldRaid('home', 0, true, 4, 1)];
    const recs = toRecords(log);
    const live = liveSums(recs);
    assert.equal(live.h1.raidPoints, 3); // 3 raids × +1
    const t = kabaddiTotals(replay(SPORT, recs), CTX);
    assert.equal(t.h1.stats.raidPoints, 3); // 3 touches on raid 1, nothing on the others
    assert.deepEqual([t.h1.stats.raids, t.h1.stats.successfulRaids, t.h1.stats.emptyRaids, t.h1.stats.raidsOut], [3, 1, 1, 1]);
    assert.equal(live.a1.raidPoints, 1); // the tackled raid still credited +1 then
    assert.equal(t.a1.stats.raidPoints, 0);
    assert.equal(t.h2.stats.tacklePoints, 1);
    // the D2 sync rewrites the stale line
    const writes = planStatSync([{ id: 'L1', playerId: 'a1', stats: { raidPoints: 1 } }], t, (id) => id);
    assert.deepEqual(writes.find((w) => w.kind === 'update')?.stats.raidPoints, 0);
  });

  test('old one-tap RAID / TACKLE points: points credited, counts left out (not 0), centre marks them untracked', () => {
    const log: ScoreAction[] = [
      { type: 'RAID', side: 'home', payload: { points: 2, minute: 1, half: 1 }, attribution: { playerId: 'h1', stat: 'raidPoints', by: 2, playerName: 'Ravi' } },
      { type: 'TACKLE', side: 'away', payload: { points: 1, minute: 2, half: 1 }, attribution: { playerId: 'a2', stat: 'tacklePoints', by: 1, playerName: 'Bhanu' } },
      { type: 'RAID', side: 'away', payload: { points: 1, minute: 3, half: 1 }, attribution: { playerId: 'a1', stat: 'raidPoints', by: 1, playerName: 'Arjun' } },
    ];
    const recs = toRecords(log);
    const t = assertContract(SPORT, recs);
    assert.deepEqual(t.h1.stats, { raidPoints: 2, tacklePoints: 0 });
    assert.deepEqual(t.a2.stats, { raidPoints: 0, tacklePoints: 1 });
    // an old snapshot (events with names only) resolves through the squads
    const s = replay(SPORT, recs);
    const snap = { ...s, events: s.events.map(({ playerId: _drop, ...e }) => e) } as KabaddiState;
    assert.deepEqual(kabaddiTotals(snap, CTX), t);
    // … and a name nobody can resolve leaves the point keys to the live lines
    const noCtx = kabaddiTotals(snap);
    assert.deepEqual(noCtx, {});
    const cmp = comparisonRows(STAT_SCHEMAS.kabaddi, kabaddiBox(s).data('all'));
    assert.deepEqual(cmp.rows.map((r) => r.key), ['raidPoints', 'tacklePoints', 'allOutPoints', 'extraPoints']);
    assert.ok(cmp.untracked.includes('Raid strike rate'));
  });

  test('an unresolvable credited raider drops the point keys for everyone (the live lines stay)', () => {
    const m = new Scorer();
    m.raid({ side: 'home', raider: H[0], touches: 2 }, 1);
    const s = { ...m.s, raids: m.s.raids.map((r) => ({ ...r, raiderId: undefined, raider: 'Someone Else' })) } as KabaddiState;
    const t = kabaddiTotals(s, CTX);
    for (const e of Object.values(t)) { assert.ok(!('raidPoints' in e.stats)); assert.ok(!('tacklePoints' in e.stats)); }
  });
});

describe('SD-41 — PKL match centre', () => {
  test('points split adds up to the score; raids, strike rates, do-or-die', () => {
    const m = fullMatch();
    const c = kabaddiMatchCentre(m.s);
    for (const sd of ['home', 'away'] as Side[]) {
      const x = c[sd];
      assert.equal(x.raidPoints + x.tacklePoints + x.allOutPoints + x.extraPoints, m.s[sd], sd);
    }
    // the failed do-or-die gives home an extra point, not a tackle point
    assert.equal(c.home.extraPoints, 1);
    assert.equal(c.home.tacklePoints, 2);
    assert.equal(c.home.raids, 8);
    assert.equal(c.home.successfulRaids, 6);
    assert.equal(c.home.emptyRaids, 2);
    assert.equal(c.home.superRaids, 1);
    assert.equal(c.home.raidStrikeRate, 75);
    assert.deepEqual([c.home.doOrDieRaids, c.home.doOrDieWon, c.home.doOrDieRate], [1, 1, 100]);
    assert.deepEqual([c.away.doOrDieRaids, c.away.doOrDieWon, c.away.doOrDieRate], [1, 0, 0]);
    // home tackled 2 raiders; away raids that scored and got back = 1 failed attempt
    assert.deepEqual([c.home.tackles, c.home.tackleAttempts], [2, 3]);
    assert.ok(Math.abs(c.home.tackleStrikeRate! - 200 / 3) < 1e-9);
  });

  test('per half; super tackles and all-outs (inflicted / conceded)', () => {
    const m = squeezeMatch();
    const c = kabaddiMatchCentre(m.s);
    assert.equal(c.away.superTackles, 1);
    assert.ok(c.home.allOuts >= 1);
    assert.equal(c.away.allOutsConceded, c.home.allOuts);
    assert.equal(c.home.allOutPoints, 2 * c.home.allOuts);
    const f = fullMatch();
    const h1 = kabaddiMatchCentre(f.s, 1), h2 = kabaddiMatchCentre(f.s, 2), all = kabaddiMatchCentre(f.s);
    assert.equal(h1.home.raids + h2.home.raids, all.home.raids);
    assert.equal(h1.home.raidPoints + h2.home.raidPoints, all.home.raidPoints);
  });

  test('the comparison panel shows the PKL rows (raids incl. unnamed ones)', () => {
    const m = fullMatch();
    const cmp = comparisonRows(STAT_SCHEMAS.kabaddi, kabaddiBox(m.s).data('all'));
    assert.deepEqual(cmp.rows.map((r) => r.label), [
      'Raid pts', 'Tackle pts', 'All-out pts', 'Extra pts', 'Raids', 'Successful raids', 'Raid strike rate', 'Empty raids',
      'Unsuccessful raids', 'Super raids', 'Do-or-die raids', 'Do-or-die success', 'Successful tackles', 'Tackle strike rate', 'Super tackles', 'All-outs',
    ]);
    const row = (k: string) => cmp.rows.find((r) => r.key === k)!;
    assert.equal(row('raidStrikeRate').home, '75%');
    assert.equal(row('raids').home, '8');
    assert.equal(row('extraPoints').home, '1');
    assert.equal(row('tackleStrikeRate').home, '67%');
    // a side with no raids in a half: its strike rate is "–", not 0%
    const early = new Scorer();
    early.raid({ side: 'home', raider: H[0], touches: 1 }, 1);
    const e = comparisonRows(STAT_SCHEMAS.kabaddi, kabaddiBox(early.s).data('all'));
    assert.equal(e.rows.find((r) => r.key === 'raidStrikeRate')!.away, '–');
  });

  test('timeline marks super raids, super tackles, do-or-die and all-outs', () => {
    const m = squeezeMatch();
    const labels = m.s.events.map((e) => e.label);
    assert.ok(labels.some((l) => /^Super raid/.test(l)));
    assert.ok(labels.some((l) => /^Super tackle \+2/.test(l)));
    assert.ok(labels.some((l) => /^All out \+2/.test(l)));
    assert.ok(fullMatch().s.events.some((e) => /^Do-or-die/.test(e.label)));
  });
});

describe('SD-82 — kabaddi career rates', () => {
  let n = 0;
  const M = (): Match => ({ id: `km${++n}`, sport: 'kabaddi', status: 'completed', startsAt: `2026-06-${String(n).padStart(2, '0')}T10:00:00Z`, homeTeam: { id: 'h', name: 'Reds' }, awayTeam: { id: 'a', name: 'Blues' }, state: {} } as unknown as Match);
  const L = (stats: Record<string, number>): StatLine => { const m = M(); return { id: `kl${n}`, matchId: m.id, playerId: 'p1', sport: 'kabaddi', stats, result: 'W', won: true, date: m.startsAt } as StatLine; };
  const rows = (lines: StatLine[]) => Object.fromEntries(careerSections(statSchema('kabaddi')!, lines).map((s) => [s.id, Object.fromEntries(s.rows.map((r) => [r.label, r.value]))]));

  test('strike rate, not-out %, super raids / tackles, best match by total points', () => {
    const lines = [
      L({ raidPoints: 8, tacklePoints: 1, raids: 10, successfulRaids: 6, raidsOut: 2, emptyRaids: 2, superRaids: 1, tackles: 1, superTackles: 0 }),
      L({ raidPoints: 3, tacklePoints: 7, raids: 6, successfulRaids: 2, raidsOut: 1, emptyRaids: 3, superRaids: 0, tackles: 5, superTackles: 1 }),
      L({ raidPoints: 4, tacklePoints: 0 }), // a line from before SD-33: points only
    ];
    const c = rows(lines);
    assert.deepEqual(c.overall, { 'Total points': '23', 'Points per match': '7.7', 'Best match': '10' });
    assert.deepEqual(c.raiding, {
      'Raid pts': '15', 'Raid pts per match': '5.0', 'Most in a match': '8', Raids: '16',
      'Raid strike rate': '50%', 'Not-out %': '81%', 'Super raids': '1',
    });
    assert.deepEqual(c.defending, { 'Tackle pts': '8', 'Tackle pts per match': '2.7', 'Successful tackles': '6', 'Super tackles': '1', 'High 5s': '1' });
    // best match links to its line
    const best = aggregateValue(STAT_SCHEMAS.kabaddi, statDefIn(STAT_SCHEMAS.kabaddi, 'bestMatch')!, lines);
    assert.equal(best.line?.id, lines[1].id);
  });

  test('only old lines (no counts): no rate rows (D8 — never a false 0%)', () => {
    const c = rows([L({ raidPoints: 4, tacklePoints: 2 }), L({ raidPoints: 11, tacklePoints: 0 })]);
    assert.deepEqual(Object.keys(c.raiding), ['Raid pts', 'Raid pts per match', 'Most in a match', 'Super 10s']);
    assert.deepEqual(Object.keys(c.defending), ['Tackle pts', 'Tackle pts per match']);
    assert.equal(c.overall['Best match'], '11');
  });

  test('the schema validates (max over several keys)', () => {
    assert.deepEqual(validateSchema(STAT_SCHEMAS.kabaddi), []);
  });
});
