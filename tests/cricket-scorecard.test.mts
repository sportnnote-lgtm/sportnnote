/**
 * Parity #19 — cricket scorecard depth: the reducer's derived ball log and the
 * pure selectors over it (extras breakdown, fall of wickets, partnerships,
 * over history, maidens), `statTotals`, the persisted snapshot (no `log`), and
 * the absolute stat-line sync planner (idempotent; maps through disputes).
 * The log is derived, so the seed / cricket.test logs replay identically
 * (REVIEW Decision 8) — asserted here by replaying every seed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { init, reducer, snapshotState, type CricketState } from '../src/sports/cricket/engine.ts';
import {
  extrasBreakdown, extrasText, fallOfWickets, fowText, partnerships, overHistory, bowlerSplits, statTotals, hasLog,
} from '../src/sports/cricket/scorecard.ts';
import { planStatSync, applyStatWrites, type ExistingStatLine } from '../src/data/statSync.ts';
import { followDisputes } from '../src/data/eventLog.ts';
import { CRICKET_MATCH_EVENTS, CRICKET_SEED_EXPECT, CRICKET_LIVE_EVENTS } from '../src/data/cricketSeed.ts';
import type { ScoreAction } from '../src/sports/types.ts';

function opened(config: Record<string, unknown> = {}): CricketState {
  let s = init({ overs: 5, playersPerSide: 11, ...config });
  s = reducer(s, { type: 'SET_KEEPER', payload: { side: 'away', id: 'k', name: 'K' } });
  s = reducer(s, { type: 'SET_STRIKER', payload: { id: 'A', name: 'A' } });
  s = reducer(s, { type: 'SET_NONSTRIKER', payload: { id: 'B', name: 'B' } });
  return s;
}
const bowl = (s: CricketState, id: string): CricketState => reducer(s, { type: 'SET_BOWLER', payload: { id, name: id } });
const ball = (s: CricketState, type: string, payload: Record<string, unknown> = {}): CricketState =>
  reducer(s, { type, side: s.battingSide, payload: { strikerId: s.strikerId, strikerName: s.strikerName, bowlerId: s.bowlerId, bowlerName: s.bowlerName, ...payload } } as ScoreAction);
const runs = (s: CricketState, r: number, extra: Record<string, unknown> = {}) => ball(s, 'RUNS', { runs: r, ...extra });
const dots = (s: CricketState, n: number) => { for (let i = 0; i < n; i++) s = runs(s, 0); return s; };

/** The acceptance script: over 1 (X) `1, 4, wd, nb+2, lb1, W (A bowled), 0, 0`;
 *  over 2 (Y) six dots; over 3 (X) `0 0 lb1 0 0 0`. */
function script(): { s1: CricketState; s: CricketState } {
  let s = bowl(opened(), 'X');
  s = runs(s, 1);
  s = runs(s, 4, { boundary: true });
  s = ball(s, 'EXTRA', { kind: 'Wide' });
  s = ball(s, 'EXTRA', { kind: 'No ball', runs: 2, boundary: false });
  s = ball(s, 'LEGBYES', { runs: 1 });
  s = ball(s, 'WICKET', { kind: 'bowled', newBatId: 'C', newBatName: 'C' });
  s = dots(s, 2);
  const s1 = s;
  s = dots(bowl(s, 'Y'), 6);
  s = bowl(s, 'X');
  s = dots(s, 2);
  s = ball(s, 'LEGBYES', { runs: 1 });
  s = dots(s, 3);
  return { s1, s };
}

describe('#19 — ball log & selectors (acceptance script)', () => {
  test('over 1: 10/1, extras lb1 wd1 nb1, X 1.0-0-9-1, FoW 1-10 (A, 0.4 ov), partnership 10 (A 1, B 6)', () => {
    const { s1 } = script();
    assert.equal(s1.scores.home.runs, 10);
    assert.equal(s1.scores.home.wickets, 1);
    assert.deepEqual(extrasBreakdown(s1, 'home'), { b: 0, lb: 1, wd: 1, nb: 1, pen: 0 });
    assert.equal(extrasText(extrasBreakdown(s1, 'home')), 'lb 1, wd 1, nb 1');
    assert.equal(s1.bowling.X.balls, 6);
    assert.equal(s1.bowling.X.runs, 9);
    assert.equal(s1.bowling.X.wickets, 1);
    assert.equal(bowlerSplits(s1, 'home').X?.maidens ?? 0, 0);
    assert.equal(fowText(fallOfWickets(s1, 'home')), '1-10 (A, 0.4 ov)');
    const p = partnerships(s1, 'home');
    assert.equal(p[0].runs, 10);
    assert.equal(p[0].a.name, 'A'); assert.equal(p[0].a.runs, 1);
    assert.equal(p[0].b.name, 'B'); assert.equal(p[0].b.runs, 6);
    assert.equal(p[0].unbroken, false);
    assert.equal(p[0].balls, 4); // 1, 4, lb1, W (the wide and no-ball aren't legal)
    assert.equal(p[0].b.balls, 3); // B faced the 4, the no-ball and the leg bye (not the wide)
    assert.equal(p[1].unbroken, true);
    assert.equal(p[1].wkt, 2);
  });

  test('over 2 is Y\'s maiden; over 3 (lb1 only) is X\'s maiden; cum 10, 10, 11', () => {
    const { s } = script();
    const sp = bowlerSplits(s, 'home');
    assert.equal(sp.Y.maidens, 1);
    assert.equal(sp.X.maidens, 1);
    assert.equal(sp.X.wides, 1);
    assert.equal(sp.X.noBalls, 1);
    const ov = overHistory(s, 'home');
    assert.deepEqual(ov.map((o) => o.cum), [10, 10, 11]);
    assert.deepEqual(ov.map((o) => o.runs), [10, 0, 1]);
    assert.deepEqual(ov.map((o) => o.wkts), [1, 0, 0]);
    assert.deepEqual(ov.map((o) => o.bowlerName), ['X', 'Y', 'X']);
    assert.deepEqual(ov[0].syms, ['1', '4', 'wd', '2nb', 'lb', 'W', '0', '0']);
    // the log's chips are the live strip's
    assert.deepEqual(ov[2].syms, s.thisOver);
  });

  test('statTotals: B 6 runs; X 9 conceded off 12 balls with 1 maiden; fielding keys present', () => {
    const { s } = script();
    const t = statTotals(s);
    assert.equal(t.B.stats.runs, 6);
    assert.equal(t.B.side, 'home');
    assert.equal(t.A.stats.notOut, 0);
    assert.equal(t.A.stats.innings, 1);
    assert.equal(t.X.side, 'away');
    assert.equal(t.X.stats.runsConceded, 9);
    assert.equal(t.X.stats.ballsBowled, 12);
    assert.equal(t.X.stats.maidens, 1);
    assert.equal(t.X.stats.wickets, 1);
    assert.equal(t.X.stats.wides, 1);
    assert.equal(t.X.stats.noBalls, 1);
    assert.equal(t.Y.stats.dots, 6);
    assert.equal(t.X.stats.catches, 0);
  });
});

describe('#19 — statTotals edge cases', () => {
  test('a run-out with 1 completed run credits the striker (runsAs bat); as byes it does not', () => {
    const base = bowl(opened(), 'X');
    const bat = ball(base, 'WICKET', { kind: 'runout', runs: 1, fielderId: 'F', fielderName: 'F', batterOut: 'nonstriker', newBatId: 'C', newBatName: 'C' });
    assert.equal(statTotals(bat).A.stats.runs, 1);
    assert.equal(statTotals(bat).F.stats.runouts, 1);
    assert.equal(statTotals(bat).F.side, 'away');
    const bye = ball(base, 'WICKET', { kind: 'runout', runs: 1, runsAs: 'bye', fielderId: 'F', fielderName: 'F', batterOut: 'nonstriker', newBatId: 'C', newBatName: 'C' });
    assert.equal(statTotals(bye).A.stats.runs, 0);
    assert.deepEqual(extrasBreakdown(bye, 'home'), { b: 1, lb: 0, wd: 0, nb: 0, pen: 0 });
  });

  test('catches and stumpings go to the fielder / keeper', () => {
    let s = bowl(opened(), 'X');
    s = ball(s, 'WICKET', { kind: 'caught', fielderId: 'F', fielderName: 'F', newBatId: 'C', newBatName: 'C' });
    s = ball(s, 'WICKET', { kind: 'stumped', newBatId: 'D', newBatName: 'D' });
    const t = statTotals(s);
    assert.equal(t.F.stats.catches, 1);
    assert.equal(t.k.stats.stumpings, 1);
    assert.equal(t.X.stats.wickets, 2);
  });

  test('penalty runs are `pen` extras, never the bowler\'s; retired hurt breaks a partnership, not a wicket', () => {
    let s = bowl(opened(), 'X');
    s = runs(s, 2);
    s = ball(s, 'PENALTY', { runs: 5 });
    s = ball(s, 'WICKET', { kind: 'retired', newBatId: 'C', newBatName: 'C' });
    s = runs(s, 1);
    assert.equal(extrasBreakdown(s, 'home').pen, 5);
    assert.equal(s.bowling.X.runs, 3);
    assert.deepEqual(fallOfWickets(s, 'home'), []);
    const p = partnerships(s, 'home');
    assert.equal(p.length, 2);
    assert.equal(p[0].runs, 7);
    assert.equal(p[0].wkt, 1);
    assert.equal(p[1].wkt, 1); // still the 1st wicket — retired hurt isn't one
    assert.equal(overHistory(s, 'home')[0].runs, 8);
  });

  test('a legal wide (local rules) counts toward the over and spoils the maiden', () => {
    let s = bowl(opened({ wideLegal: true }), 'X');
    s = ball(s, 'EXTRA', { kind: 'Wide' });
    s = dots(s, 5);
    const r = s.log!.find((x) => x.ext === 'wd')!;
    assert.equal(r.legal, true);
    assert.equal(s.scores.home.balls, 6);
    assert.equal(bowlerSplits(s, 'home').X.maidens, 0);
    assert.equal(bowlerSplits(s, 'home').X.wides, 1);
  });

  test('an over shared after a mid-over replacement is no maiden for either bowler', () => {
    let s = bowl(opened(), 'X');
    s = dots(s, 3);
    s = reducer(s, { type: 'SET_BOWLER', payload: { id: 'Z', name: 'Z', reason: 'injury', v: 2 } });
    s = dots(s, 3);
    assert.equal(s.scores.home.balls, 6);
    const sp = bowlerSplits(s, 'home');
    assert.equal(sp.X?.maidens ?? 0, 0);
    assert.equal(sp.Z?.maidens ?? 0, 0);
    assert.equal(overHistory(s, 'home')[0].bowlerName, 'X / Z');
  });

  test('a Mankad is no delivery, a wicket for nobody, and a run-out for the bowler', () => {
    let s = bowl(opened(), 'X');
    s = ball(s, 'WICKET', { kind: 'mankad', newBatId: 'C', newBatName: 'C' });
    const r = s.log![0];
    assert.equal(r.legal, false);
    assert.equal(r.out?.id, 'B');
    assert.equal(statTotals(s).X.stats.runouts, 1);
    assert.equal(fowText(fallOfWickets(s, 'home')), '1-0 (B, 0.0 ov)');
  });
});

describe('#19 — snapshot & old states', () => {
  test('the persisted snapshot has no log (incl. a Super Over\'s); replay still has it', () => {
    const { s } = script();
    assert.ok(hasLog(s));
    const snap = snapshotState(s) as CricketState;
    assert.equal('log' in snap, false);
    const so = { ...s, superOver: { round: 1, battingFirst: 'home' as const, history: [], state: init({ overs: 1 }) } };
    const snap2 = snapshotState(so);
    assert.equal('log' in snap2.superOver!.state, false);
    // a Super Over keeps its own log while live
    assert.deepEqual(so.superOver.state.log, []);
  });

  test('a state without a log renders empty selectors and never starts a partial log', () => {
    const { s } = script();
    const old = snapshotState(s) as CricketState;
    assert.equal(hasLog(old), false);
    assert.deepEqual(fallOfWickets(old, 'home'), []);
    assert.deepEqual(partnerships(old, 'home'), []);
    assert.deepEqual(overHistory(old, 'home'), []);
    assert.deepEqual(bowlerSplits(old, 'home'), {});
    assert.equal(extrasText(extrasBreakdown(old, 'home')), '');
    const more = runs(old, 1);
    assert.equal(more.log, undefined);
    // statTotals degrades: no maidens / wides / no-balls keys (never zeroed)
    assert.equal('maidens' in statTotals(old).X.stats, false);
    assert.equal(statTotals(old).X.stats.runsConceded, 9);
  });
});

describe('#19 — seeds replay identically; the log agrees with the cards', () => {
  const replay = (events: { type: string; side?: unknown; payload?: unknown }[], config: Record<string, unknown>) =>
    events.reduce<CricketState>((st, e) => reducer(st, { type: e.type, side: e.side as never, payload: e.payload as never }), init(config));
  for (const e of CRICKET_SEED_EXPECT) {
    test(`${e.id}: totals unchanged, extras / FoW / overs / bowler runs consistent`, () => {
      const s = replay(CRICKET_MATCH_EVENTS[e.id], { overs: e.overs, playersPerSide: e.players });
      assert.equal(s.scores.home.runs, e.home);
      assert.equal(s.scores.away.runs, e.away);
      for (const side of ['home', 'away'] as const) {
        const x = extrasBreakdown(s, side);
        assert.equal(x.b + x.lb + x.wd + x.nb + x.pen, s.scores[side].extras);
        assert.equal(fallOfWickets(s, side).length, s.scores[side].wickets);
        const ov = overHistory(s, side);
        assert.equal(ov.reduce((a, o) => a + o.runs, 0), s.scores[side].runs);
        assert.equal(ov[ov.length - 1].cum, s.scores[side].runs);
        assert.equal(partnerships(s, side).reduce((a, p) => a + p.runs, 0), s.scores[side].runs);
      }
      for (const [id, b] of Object.entries(s.bowling)) {
        const charged = (s.log ?? []).filter((r) => r.bowlerId === id).reduce((a, r) => a + r.bat + r.wd + r.nb, 0);
        assert.equal(charged, b.runs, `${id} charged runs`);
      }
      for (const [id, c] of Object.entries(s.batting)) assert.equal(statTotals(s)[id].stats.runs, c.runs);
    });
  }
  test('live seeds replay without a crash and keep a log', () => {
    for (const [id, evs] of Object.entries(CRICKET_LIVE_EVENTS)) {
      const s = replay(evs, {});
      assert.ok(Array.isArray(s.log), id);
    }
  });
});

describe('#19 — absolute stat sync planner', () => {
  const totalsFor = () => statTotals(script().s);
  const makeLine = (lines: ExistingStatLine[]) => (w: { playerId: string; stats: Record<string, number> }) =>
    ({ id: `n${lines.length}`, playerId: w.playerId, stats: { ...w.stats } });

  test('running twice gives the same values, and the second run writes nothing', () => {
    // live increments so far: A 1, B 4 (the Nb+2 was never credited), X 1 wicket
    const lines: ExistingStatLine[] = [
      { id: 'l1', playerId: 'A', stats: { runs: 1 } },
      { id: 'l2', playerId: 'B', stats: { runs: 4 } },
      { id: 'l3', playerId: 'X', stats: { wickets: 1 } },
    ];
    const t = totalsFor();
    const w1 = planStatSync(lines, t, (id) => id, { home: 'Home XI', away: 'Away XI' });
    applyStatWrites(lines, w1, makeLine(lines));
    const snapshot = JSON.stringify(lines);
    assert.equal(lines.find((l) => l.playerId === 'B')!.stats.runs, 6);
    assert.ok(w1.some((w) => w.kind === 'insert' && w.playerId === 'Y' && w.opponent === 'Home XI'));
    assert.ok(w1.some((w) => w.kind === 'insert' && w.playerId === 'C' && w.opponent === 'Away XI'));
    const w2 = planStatSync(lines, t, (id) => id, { home: 'Home XI', away: 'Away XI' });
    assert.deepEqual(w2, []);
    applyStatWrites(lines, w2, makeLine(lines));
    assert.equal(JSON.stringify(lines), snapshot);
  });

  test('keeps keys it doesn\'t own; only changed rows are written', () => {
    const t = totalsFor();
    const lines: ExistingStatLine[] = [{ id: 'l1', playerId: 'A', stats: { ...t.A.stats, mvp: 1 } }];
    const w = planStatSync(lines, { A: t.A }, (id) => id);
    assert.deepEqual(w, []);
  });

  test('after a resolved dispute moved A\'s line to A2, the sync updates A2 and does not recreate A', () => {
    const disputes = [{ playerId: 'A', status: 'resolved', replacementId: 'A2' }];
    const lines: ExistingStatLine[] = [{ id: 'l1', playerId: 'A2', stats: { runs: 0 } }];
    const t = totalsFor();
    const w = planStatSync(lines, t, (id) => followDisputes(disputes, id));
    assert.equal(w.some((x) => x.playerId === 'A'), false);
    const upd = w.find((x) => x.playerId === 'A2');
    assert.ok(upd && upd.kind === 'update' && upd.id === 'l1');
    assert.equal(upd!.stats.runs, 1);
  });

  test('a line whose player left the totals (correction moved the catch) has the owned keys zeroed', () => {
    const lines: ExistingStatLine[] = [{ id: 'l9', playerId: 'OLD', stats: { catches: 1, mvp: 2 } }];
    const w = planStatSync(lines, totalsFor(), (id) => id);
    const z = w.find((x) => x.playerId === 'OLD');
    assert.ok(z && z.kind === 'update');
    assert.deepEqual(z!.stats, { catches: 0, mvp: 2 });
  });
});

describe('Leg byes off a no-ball (`runsAs: legbye` on the no-ball\'s byes)', () => {
  test('same total and strike as Nb+byes; scorecard splits nb + lb; label says leg byes', () => {
    const s0 = bowl(opened(), 'X');
    const asByes = ball(s0, 'EXTRA', { kind: 'No ball', byes: 2 });
    const asLeg = ball(s0, 'EXTRA', { kind: 'No ball', byes: 2, runsAs: 'legbye' });
    assert.equal(asLeg.scores.home.runs, asByes.scores.home.runs);
    assert.equal(asLeg.scores.home.extras, asByes.scores.home.extras);
    assert.equal(asLeg.strikerId, asByes.strikerId);
    assert.deepEqual(asLeg.bowling.X, asByes.bowling.X); // not charged to the bowler either way
    assert.deepEqual(extrasBreakdown(asByes, 'home'), { b: 2, lb: 0, wd: 0, nb: 1, pen: 0 });
    assert.deepEqual(extrasBreakdown(asLeg, 'home'), { b: 0, lb: 2, wd: 0, nb: 1, pen: 0 });
    assert.equal(asByes.events[asByes.events.length - 1].label, 'No ball + 2 byes — free hit');
    assert.equal(asLeg.events[asLeg.events.length - 1].label, 'No ball + 2 leg byes — free hit');
    assert.equal(asLeg.thisOver[asLeg.thisOver.length - 1], '2nb');
  });
});
