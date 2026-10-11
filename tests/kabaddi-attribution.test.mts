/**
 * SD-03 — kabaddi raid / tackle attribution. The raider is credited exactly the
 * raid points scored, the tackle point goes to the DEFENDING side and the tackler,
 * all-outs are their own +2 line, and old (pre-SD-03) logs replay to the same
 * team score and state as the frozen pre-SD-03 reducer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, reducer, raidActions, raidReversals, halfPoints, kabaddiWinner, isRaidHead, tally as tallyLines,
  type KabaddiState, type RaidForm,
} from '../src/sports/kabaddi/engine.ts';
import { kabaddiVoice } from '../src/sports/voiceParsers.ts';
import { legacyReducer } from './kabaddiLegacyReducer.mts';
import type { ScoreAction } from '../src/sports/types.ts';
import type { Player } from '../src/core/types.ts';

const P = (id: string, fullName: string) => ({ id, fullName });
const RAIDER = P('p-r', 'Ravi Raider');
const RAIDER2 = P('p-r2', 'Rahul Raider');
const DEF = P('p-d', 'Dev Defender');
const DEF2 = P('p-d2', 'Dinesh Defender');

const fresh = (cfg: Record<string, unknown> = {}) => init({ playersPerSide: 7, style: 'sanjeevani', proRules: true, ...cfg });
const stamp = (a: ScoreAction, minute = 3, half = 1): ScoreAction => ({ ...a, payload: { ...a.payload, minute, half } });
/** Run the guided raid form like the UI does; returns the new state and the actions. */
function raid(s: KabaddiState, f: Partial<RaidForm> & { side: 'home' | 'away' }, minute = 3, half = 1) {
  const actions = raidActions(s, { touches: 0, bonus: false, tackled: false, ...f });
  for (const a of actions) s = reducer(s, a.type === 'REMOVE_EVENT' ? a : stamp(a, minute, half));
  return { s, actions, outcome: actions[actions.length - 1] };
}
const heads = (s: KabaddiState) => s.events.filter(isRaidHead);

describe('SD-03 — raider credit = raid points actually scored', () => {
  test('empty raid: no raider credit, a 0-point raid line, no score', () => {
    const { s, outcome } = raid(fresh(), { side: 'home', raider: RAIDER });
    assert.equal(outcome.attribution, undefined); // was +1 before SD-03
    assert.equal(outcome.payload?.raiderName, RAIDER.fullName); // the raider is still named
    assert.equal(s.home + s.away, 0);
    const [h] = heads(s);
    assert.equal(h.points, 0);
    assert.equal(h.label, 'Empty raid');
    assert.equal(h.playerName, RAIDER.fullName);
  });

  test('touch points: 2 touches → raider +2, line +2 on the raiding side', () => {
    const { s, outcome } = raid(fresh(), { side: 'home', raider: RAIDER, touches: 2 });
    assert.deepEqual(outcome.attribution, { playerId: RAIDER.id, stat: 'raidPoints', by: 2, playerName: RAIDER.fullName });
    assert.equal(s.home, 2);
    assert.equal(heads(s)[0].points, 2);
    assert.equal(heads(s)[0].side, 'home');
  });

  test('bonus: 1 touch + bonus → raider +2; a void bonus (under 6 defenders) is not credited', () => {
    const a = raid(fresh(), { side: 'home', raider: RAIDER, touches: 1, bonus: true });
    assert.equal(a.outcome.attribution?.by, 2);
    assert.equal(a.s.home, 2);
    // Two touches put 2 away defenders out → 5 on the mat: the next bonus is void.
    let s = raid(fresh(), { side: 'home', touches: 2 }).s;
    const b = raid(s, { side: 'home', raider: RAIDER2, touches: 0, bonus: true });
    assert.equal(b.outcome.attribution, undefined);
    s = b.s;
    assert.equal(s.home, 2);
    assert.match(heads(s)[1].label, /void/);
  });

  test('super raid: 3 touches → raider +3, labelled Super raid', () => {
    const { s, outcome } = raid(fresh(), { side: 'away', raider: RAIDER, touches: 3 });
    assert.equal(outcome.attribution?.by, 3);
    assert.equal(s.away, 3);
    assert.match(heads(s)[0].label, /^Super raid \+3/);
  });
});

describe('SD-03 — tackle point on the defending side, credited to the tackler', () => {
  test('a tackled raider: raider 0, tackle +1 to the defence and the tackler', () => {
    const { s, outcome } = raid(fresh(), { side: 'home', raider: RAIDER, tackled: true, tackler: DEF });
    assert.equal(outcome.attribution, undefined);
    // SD-119: the tackler's own (defending) side rides on the credit
    assert.deepEqual(outcome.attribution2, { playerId: DEF.id, stat: 'tacklePoints', by: 1, playerName: DEF.fullName, side: 'away' });
    assert.equal(s.home, 0);
    assert.equal(s.away, 1);
    const tackle = s.events.find((e) => e.kind === 'tackle')!;
    assert.equal(tackle.side, 'away');
    assert.equal(tackle.points, 1);
    assert.equal(tackle.playerName, DEF.fullName);
    assert.equal(tackle.group, heads(s)[0].id); // tied to its raid
    // Per-half board: the point is in the DEFENDING team's column.
    assert.equal(halfPoints(s, 'home', 1), 0);
    assert.equal(halfPoints(s, 'away', 1), 1);
    // Box score: TCKL 1 for the tackler, no RAID point for the raider.
    assert.deepEqual(tallyLines(s.events, 'away'), [{ name: DEF.fullName, raid: 0, tackle: 1 }]);
    assert.deepEqual(tallyLines(s.events, 'home'), []);
  });

  test('super tackle (≤3 defenders) = 2 to the tackler', () => {
    let s = raid(fresh(), { side: 'home', touches: 4 }).s; // away down to 3 on the mat
    const r = raid(s, { side: 'home', raider: RAIDER, tackled: true, tackler: DEF2 });
    s = r.s;
    assert.equal(r.outcome.attribution2?.by, 2);
    assert.equal(s.away, 2);
    const tackle = s.events.find((e) => e.kind === 'tackle')!;
    assert.equal(tackle.label, 'Super tackle +2');
    assert.equal(tackle.points, 2);
  });

  test('a failed do-or-die raid gives the defence its point (no tackler)', () => {
    let s = fresh();
    s = raid(s, { side: 'home' }).s;
    s = raid(s, { side: 'home' }).s;
    s = raid(s, { side: 'home', raider: RAIDER }).s; // 3rd empty → out
    assert.equal(s.away, 1);
    const stop = s.events.find((e) => e.kind === 'tackle')!;
    assert.equal(stop.side, 'away');
    assert.equal(stop.label, 'Do-or-die stop +1');
    assert.equal(stop.playerName, undefined);
  });
});

describe('SD-03 — all-outs and the per-half board', () => {
  test('emptying the mat adds an All out +2 line for the side that did it', () => {
    let s = fresh();
    s = raid(s, { side: 'home', touches: 4 }).s;
    s = raid(s, { side: 'home', touches: 3, raider: RAIDER }).s; // 7 out → all out
    assert.equal(s.home, 9);
    const ao = s.events.filter((e) => e.kind === 'allout');
    assert.equal(ao.length, 1);
    assert.equal(ao[0].side, 'home');
    assert.equal(ao[0].points, 2);
    // the raider is credited the 3 raid points, not the all-out
    assert.deepEqual(tallyLines(s.events, 'home'), [{ name: RAIDER.fullName, raid: 3, tackle: 0 }]);
  });

  test('half columns add up to the total (raids, tackles, all-outs, both halves)', () => {
    let s = fresh();
    s = raid(s, { side: 'home', touches: 2, raider: RAIDER }, 2, 1).s;
    s = raid(s, { side: 'away', tackled: true, tackler: DEF, raider: RAIDER2 }, 4, 1).s;
    s = raid(s, { side: 'away', touches: 1, bonus: true }, 6, 1).s;
    s = reducer(s, { type: 'NEXT_HALF' });
    s = raid(s, { side: 'home', touches: 3 }, 22, 2).s;
    s = raid(s, { side: 'home', touches: 2 }, 24, 2).s; // all-out of away (7)
    s = raid(s, { side: 'away', tackled: true }, 25, 2).s;
    for (const side of ['home', 'away'] as const) assert.equal(halfPoints(s, side, 1) + halfPoints(s, side, 2), s[side], side);
  });
});

describe('SD-03 — remove / edit', () => {
  test('removing a raid\'s tackle line takes the whole raid out (v:2) and reverses both credits', () => {
    let s = raid(fresh(), { side: 'home', touches: 1, raider: RAIDER }).s;
    s = raid(s, { side: 'home', raider: RAIDER2, tackled: true, tackler: DEF }).s;
    const tackle = s.events.find((e) => e.kind === 'tackle')!;
    const rev = raidReversals(s, tackle);
    assert.equal(rev.attribution, undefined); // the raider scored nothing on it
    assert.equal(rev.attribution2?.by, -1);
    s = reducer(s, { type: 'REMOVE_EVENT', side: 'away', payload: { id: tackle.group, v: 2 }, ...rev });
    assert.equal(s.home, 1);
    assert.equal(s.away, 0);
    assert.equal(s.raids.length, 1);
    assert.equal(s.events.filter((e) => e.kind === 'tackle').length, 0);
  });

  test('ordinal fix: with a legacy point and a shootout-free mix, remove hits the tapped raid', () => {
    let s = fresh();
    s = reducer(s, stamp({ type: 'RAID', side: 'home', payload: { points: 1 } })); // legacy point (old Edit)
    s = raid(s, { side: 'home', touches: 2 }).s;
    s = raid(s, { side: 'away', touches: 1 }).s;
    const target = heads(s)[1]; // the away 1-touch raid
    s = reducer(s, { type: 'REMOVE_EVENT', side: 'away', payload: { id: target.id, v: 2 } });
    assert.deepEqual(s.raids.map((r) => [r.side, r.touches]), [['home', 2]]);
    assert.equal(s.home, 3);
    assert.equal(s.away, 0);
  });

  test('edit re-dispatches RAID_OUTCOME in place: same id and slot, credits swapped', () => {
    let s = raid(fresh(), { side: 'home', touches: 1, raider: RAIDER }, 2).s;
    s = raid(s, { side: 'away', touches: 1 }, 4).s;
    const first = heads(s)[0];
    const r = raid(s, { side: 'home', touches: 3, raider: RAIDER2, editOf: first.id }, 99);
    // reversal of the old +1, then the new +3
    assert.equal(r.actions[0].type, 'REMOVE_EVENT');
    assert.deepEqual(r.actions[0].attribution, { playerId: RAIDER.id, stat: 'raidPoints', by: -1, playerName: RAIDER.fullName });
    assert.equal(r.outcome.payload?.replaces, first.id);
    assert.equal(r.outcome.attribution?.by, 3);
    s = r.s;
    assert.equal(s.raids.length, 2);
    assert.equal(s.raids[0].touches, 3);
    assert.equal(heads(s)[0].id, first.id);
    assert.equal(heads(s)[0].playerName, RAIDER2.fullName);
    assert.equal(s.home, 3);
    assert.equal(s.away, 1);
  });
});

describe('SD-03 — winner on a draw / shootout', () => {
  test('a draw has no winner; a shootout winner wins a level match', () => {
    let s = raid(fresh({ decider: 'none' }), { side: 'home', touches: 1 }).s;
    s = raid(s, { side: 'away', touches: 1 }).s;
    assert.equal(kabaddiWinner(reducer(s, { type: 'END' })), 'draw');
    s = reducer(s, { type: 'START_SHOOTOUT' });
    for (const [side, p] of [['home', 1], ['away', 0], ['home', 1], ['away', 0], ['home', 1], ['away', 0]] as const) s = reducer(s, { type: 'SHOOTOUT_RAID', side, payload: { points: p } });
    assert.equal(s.ended, true);
    assert.equal(kabaddiWinner(s), 'home');
    // shootout raids aren't regulation points
    assert.equal(halfPoints(s, 'home', 1), 1);
  });
});

describe('SD-03 — voice', () => {
  const roster = (p: { id: string; fullName: string }) => [{ ...p, sports: ['kabaddi'] } as unknown as Player];
  test('"tackle <name>" on a super tackle credits 2', () => {
    let s = raid(fresh(), { side: 'home', touches: 4 }).s; // away has 3 on the mat
    const acts = kabaddiVoice('tackle Dinesh', { state: s, homeName: 'Home', awayName: 'Away', homeRoster: roster(RAIDER), awayRoster: roster(DEF2) })!;
    assert.equal(acts[0].attribution2?.by, 2);
    s = reducer(s, stamp(acts[0]));
    assert.equal(s.away, 2);
    assert.equal(s.events.find((e) => e.kind === 'tackle')?.playerName, DEF2.fullName);
  });
  test('"tackle <name>" with a full defence credits 1; "raid <name>" credits 1', () => {
    const ctx = { state: fresh(), homeName: 'Home', awayName: 'Away', homeRoster: roster(RAIDER), awayRoster: roster(DEF) };
    assert.equal(kabaddiVoice('tackle Dev', ctx)![0].attribution2?.by, 1);
    assert.equal(kabaddiVoice('raid Ravi', ctx)![0].attribution?.by, 1);
  });
});

// ---------------------------------------------------------------------------
// Legacy replay identity (Decision 8). Logs shaped exactly as the pre-SD-03 app
// wrote them replay to the same score / state through the new engine as through
// the frozen old reducer.
// ---------------------------------------------------------------------------
const OLD_CFG = { playersPerSide: 7, style: 'sanjeevani', proRules: true, substitutes: 2, decider: 'extra_time' };
const pick = (s: KabaddiState) => ({ home: s.home, away: s.away, out: s.out, emptyRaids: s.emptyRaids, ended: s.ended, half: s.half, goldenRaid: s.goldenRaid, shootout: s.shootout, subsUsed: s.subsUsed, raids: s.raids.map((r) => [r.side, r.touches, r.bonus, r.raiderOut]) });
/** Integer-id lines (what the old timeline held) — the legacy remove ordinal counts these. */
const oldIds = (s: KabaddiState) => s.events.filter((e) => e.group == null || isRaidHead(e)).map((e) => e.id);
function both(log: ScoreAction[], cfg: Record<string, unknown> = OLD_CFG) {
  let n = init(cfg), o = init(cfg);
  for (const a of log) { n = reducer(n, a); o = legacyReducer(o, a); }
  return { n, o };
}
/** The old UI's guided raid: raider credited with no `by` (= +1), tackler 1/2. */
const oldRaid = (side: 'home' | 'away', touches: number, bonus: boolean, raiderOut: boolean, minute: number, half = 1, tacklerBy?: number): ScoreAction => ({
  type: 'RAID_OUTCOME', side,
  attribution: { playerId: 'p-r', stat: 'raidPoints', playerName: 'Ravi Raider' },
  ...(tacklerBy ? { attribution2: { playerId: 'p-d', stat: 'tacklePoints', by: tacklerBy, playerName: 'Dev Defender' } } : null),
  payload: { touches, bonus, raiderOut, minute, half },
});

describe('SD-03 — legacy logs replay identically', () => {
  test('a recorded-style match: raids, tackles, super tackle, all-out, sub, golden raid', () => {
    const log: ScoreAction[] = [
      { type: 'KICKOFF', payload: { at: 1 } },
      oldRaid('home', 2, false, false, 1),
      oldRaid('away', 0, false, true, 2, 1, 1),
      oldRaid('away', 1, true, false, 3),
      oldRaid('home', 0, false, false, 4),
      oldRaid('home', 3, false, false, 5),
      oldRaid('home', 0, false, true, 6, 1, 2),
      { type: 'SUB', side: 'home', payload: { offName: 'Ravi Raider', onName: 'Ramu', minute: 7, half: 1 } },
      oldRaid('home', 1, false, false, 8), // subbed-off raider → rejected both ways
      { type: 'NEXT_HALF' },
      { type: 'KICKOFF', payload: { at: 2 } },
      { type: 'RAID', side: 'away', payload: { points: 1, minute: 21, half: 2 }, attribution: { playerId: 'p-x', stat: 'raidPoints', by: 1, playerName: 'X' } },
      { type: 'TACKLE', side: 'home', payload: { points: 1, minute: 22, half: 2 } },
      { type: 'RAID_OUTCOME', side: 'away', payload: { touches: 0, bonus: false, raiderOut: true, minute: 23, half: 2 }, attribution2: { playerId: 'p-d', stat: 'tacklePoints', playerName: 'Dev' } }, // old voice tackle
      oldRaid('away', 4, false, false, 24, 2),
      oldRaid('away', 3, false, false, 25, 2),
      { type: 'START_GOLDEN_RAID' },
      oldRaid('home', 1, false, false, 40, 2),
    ];
    const { n, o } = both(log);
    assert.deepEqual(pick(n), pick(o));
    assert.deepEqual(oldIds(n), o.events.map((e) => e.id));
  });

  test('old Edit (remove + legacy RAID) followed by a mis-ordinal remove: same score as then', () => {
    // Old Edit inserted a legacy RAID line; a later remove of a guided raid then
    // counted it in the ordinal and took a DIFFERENT raid out. The stored score came
    // from that, so an un-versioned remove must still do exactly the same.
    const log: ScoreAction[] = [
      oldRaid('home', 2, false, false, 1), // id 1
      oldRaid('away', 1, false, false, 2), // id 2
      { type: 'REMOVE_EVENT', side: 'home', payload: { id: 1 } }, // old edit: remove …
      { type: 'RAID', side: 'home', payload: { points: 2, minute: 1, half: 1 } }, // … re-enter as legacy RAID (id 3)
      oldRaid('home', 0, false, true, 4, 1, 1), // id 4
      oldRaid('away', 3, false, false, 5), // id 5
      { type: 'REMOVE_EVENT', side: 'away', payload: { id: 5 } }, // ordinal 3 → out of range → fallback
      { type: 'REMOVE_EVENT', side: 'home', payload: { id: 4 } }, // ordinal 2 → removes raids[2]
      { type: 'REMOVE_EVENT', side: 'home', payload: { id: 3 } }, // legacy RAID → raids[1]
      oldRaid('home', 1, true, false, 6),
    ];
    const { n, o } = both(log);
    assert.deepEqual(pick(n), pick(o));
    assert.deepEqual(oldIds(n), o.events.map((e) => e.id));
  });

  test('randomised differential replay vs the frozen pre-SD-03 reducer (400 logs)', () => {
    let seed = 20261010;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ri = (n: number) => Math.floor(rnd() * n);
    const styles = ['sanjeevani', 'amar', 'gaminee'];
    for (let t = 0; t < 400; t++) {
      const cfg = { playersPerSide: 5 + ri(3), style: styles[ri(3)], proRules: rnd() < 0.7, substitutes: 2, decider: 'extra_time' };
      let n = init(cfg), o = init(cfg);
      const log: ScoreAction[] = [];
      for (let k = 0; k < 40; k++) {
        const side = rnd() < 0.5 ? 'home' : 'away';
        const roll = rnd();
        let a: ScoreAction;
        if (roll < 0.6) a = oldRaid(side, ri(4) === 0 ? 0 : ri(4), rnd() < 0.2, rnd() < 0.3, k, 1, rnd() < 0.5 ? 1 : undefined);
        else if (roll < 0.7) a = { type: rnd() < 0.5 ? 'RAID' : 'TACKLE', side, payload: { points: 1 + ri(2), minute: k, half: 1 } };
        else if (roll < 0.9 && o.events.length) a = { type: 'REMOVE_EVENT', side, payload: { id: o.events[ri(o.events.length)].id } };
        else if (roll < 0.95) a = { type: 'SUB', side, payload: { offName: `P${ri(5)}`, onName: `Q${ri(5)}`, minute: k, half: 1 } };
        else a = { type: 'NEXT_HALF' };
        log.push(a);
        n = reducer(n, a); o = legacyReducer(o, a);
        assert.deepEqual(pick(n), pick(o), `log ${t} step ${k}: ${JSON.stringify(log)}`);
        assert.deepEqual(oldIds(n), o.events.map((e) => e.id), `ids, log ${t} step ${k}`);
      }
    }
  });
});
