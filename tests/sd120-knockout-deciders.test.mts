/**
 * SD-120 — "a knockout must produce a winner", across sports:
 *   1. stage-aware deciders (league / group: the draw stands; knockout: the
 *      sport's decider is always set);
 *   2. two-legged aggregate ties: leg 2 plays its decider on AGGREGATE and a
 *      leg 2 merely won on goals no longer settles a level aggregate;
 *   3. the organiser's "Advances: X" pick so a bracket never stalls.
 * Old matches (no `aggregateLeg` on the format) replay exactly as before.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchFormatFor, stageAwareFormat, aggregateLegFormat, KO_DECIDER } from '../src/data/matchFormat.ts';
import { mergeMatchConfig } from '../src/core/matchConfig.ts';
import * as football from '../src/sports/football/engine.ts';
import * as hockey from '../src/sports/hockey/engine.ts';
import * as handball from '../src/sports/handball/engine.ts';
import * as kabaddi from '../src/sports/kabaddi/engine.ts';
import { init as legacyInit, reducer as legacyReducer } from './footballLegacyEngine.mts';
import { aggPriorFromConfig, levelForDecider, aggregateText } from '../src/sports/aggregate.ts';
import {
  seriesLegFormat, deriveSeries, resolveSeries, seriesWinnerId, advancePatch, advanceOverride, aggregatePriorFor,
} from '../src/data/series.ts';
import {
  knockoutStageRounds, nextRoundPairs, matchWinnerId, matchLoserId, pairingNeedsOrganiser, pairingAdvanceOverride,
  advanceTargetMatch, stageChampionId, type KnockoutPairing,
} from '../src/data/bracket.ts';
import type { Match } from '../src/core/types.ts';
import type { ScoreAction } from '../src/sports/types.ts';

const TEAM = (id: string) => ({ id, name: id.toUpperCase(), shortName: id.toUpperCase(), sport: 'football' as const });
const A = TEAM('a'), B = TEAM('b'), C = TEAM('c'), D = TEAM('d');

/* ------------------------------ 1. stage-aware ----------------------------- */

describe('stage-aware deciders (every sport with a decider)', () => {
  const tour = (sport: string, f: Record<string, unknown>) => ({ formats: { [sport]: f } }) as never;

  test('group / league matches never go to a decider — explicit "none"', () => {
    assert.equal(matchFormatFor(tour('hockey', { periods: 4, decider: 'shootout' }), 'hockey', false).decider, 'none');
    assert.equal(matchFormatFor(tour('handball', { decider: 'et2' }), 'handball', false).decider, 'none');
    assert.equal(matchFormatFor(tour('kabaddi', { decider: 'golden_raid' }), 'kabaddi', false).decider, 'none');
    assert.equal(matchFormatFor(tour('football', { decider: 'penalties' }), 'football', false).decider, 'none');
  });

  test('the tournament-wide decider can no longer leak into a group game through the merge', () => {
    const tourFmt = { periods: 4, decider: 'shootout' };
    const groupFmt = matchFormatFor(tour('hockey', tourFmt), 'hockey', false);
    const cfg = mergeMatchConfig(tourFmt, groupFmt);
    assert.equal(hockey.init(cfg).decider, 'none');
    // kabaddi's engine defaults an ABSENT decider to extra time — so it must be explicit
    const kab = mergeMatchConfig({ decider: 'extra_time' }, matchFormatFor(tour('kabaddi', { decider: 'extra_time' }), 'kabaddi', false));
    assert.equal(kabaddi.init(kab).decider, 'none');
  });

  test('FIH shoot-out bonus leagues keep their shoot-out (a league rule, not a knockout one)', () => {
    const f = matchFormatFor(tour('hockey', { soWinPoints: 2, decider: 'shootout' }), 'hockey', false);
    assert.equal(f.decider, 'none');
    assert.equal(hockey.init(f).decider, 'shootout'); // soWinPoints still forces it
  });

  test('knockouts always resolve: none → the sport default; an organiser choice is kept', () => {
    for (const sport of ['football', 'hockey', 'handball', 'kabaddi'] as const) {
      assert.equal(matchFormatFor(tour(sport, { decider: 'none' }), sport, true).decider, KO_DECIDER[sport], sport);
      assert.equal(matchFormatFor(null, sport, true, {}).decider, KO_DECIDER[sport], sport);
    }
    assert.equal(matchFormatFor(tour('football', { decider: 'penalties' }), 'football', true).decider, 'penalties');
    assert.equal(matchFormatFor(tour('handball', { decider: 'et' }), 'handball', true).decider, 'et');
    assert.equal(hockey.init(matchFormatFor(null, 'hockey', true)).decider, 'shootout');
    assert.equal(handball.init(matchFormatFor(null, 'handball', true)).decider, 'et2');
  });

  test('basketball: a knockout never allows a draw; a league may', () => {
    assert.equal(stageAwareFormat({ allowDraw: true }, 'basketball', true).allowDraw, false);
    assert.equal(stageAwareFormat({ allowDraw: true }, 'basketball', false).allowDraw, true);
  });

  test('sports without a decider pass through untouched', () => {
    assert.deepEqual(stageAwareFormat({ overs: 20 }, 'cricket', true), { overs: 20 });
    assert.deepEqual(stageAwareFormat({ gamesToWin: 3 }, 'badminton', false), { gamesToWin: 3 });
  });
});

/* ---------------------------- 2. aggregate ties ---------------------------- */

describe('two-legged tie formats', () => {
  test('leg 1: draw stands; leg 2: decider + aggregateLeg', () => {
    assert.equal(aggregateLegFormat({ decider: 'extra_time' }, 'football', 1).decider, 'none');
    const l2 = aggregateLegFormat({}, 'football', 2);
    assert.equal(l2.decider, 'extra_time');
    assert.equal(l2.aggregateLeg, 2);
    assert.equal(aggregateLegFormat({}, 'football', 2, true).aggAwayGoals, true);
    assert.equal(aggregateLegFormat({}, 'handball', 2).decider, 'shootout'); // EHF: straight to 7 m
    assert.equal(aggregateLegFormat({ decider: 'et' }, 'handball', 2).decider, 'et');
    assert.equal(aggregateLegFormat({}, 'hockey', 2).decider, 'shootout');
    assert.equal(aggregateLegFormat({}, 'basketball', 1).allowDraw, true); // FIBA: no OT after game 1
    assert.equal(aggregateLegFormat({}, 'kabaddi', 2).decider, 'none'); // no aggregate engine yet → organiser
    assert.deepEqual(aggregateLegFormat({ overs: 20 }, 'cricket', 2), { overs: 20 });
  });

  test('aggPriorFromConfig needs the leg-2 flag and both numbers', () => {
    assert.equal(aggPriorFromConfig({ aggPriorHome: 1, aggPriorAway: 2 }), undefined);
    assert.equal(aggPriorFromConfig({ aggregateLeg: 2 }), undefined);
    assert.deepEqual(aggPriorFromConfig({ aggregateLeg: 2, aggPriorHome: 1, aggPriorAway: 2 }), { home: 1, away: 2 });
    assert.equal(levelForDecider({ home: 1, away: 0, agg: { home: 1, away: 2 } }), true);
    assert.equal(levelForDecider({ home: 1, away: 1, agg: { home: 1, away: 2 } }), false);
    // away goals: leg-2 home side scored 1 away (in leg 1), leg-2 away side scores 0 away now
    assert.equal(levelForDecider({ home: 1, away: 0, agg: { home: 1, away: 2, awayGoals: true } }), false);
    assert.equal(aggregateText({ home: 1, away: 0, agg: { home: 1, away: 2 } }), 'Aggregate 2–2');
  });
});

const fb = (config: Record<string, unknown>, actions: ScoreAction[]) => actions.reduce(football.reducer, football.init(config));
const G = (side: 'home' | 'away', minute = 10): ScoreAction => ({ type: 'GOAL', side, payload: { minute } });
const toFullTime: ScoreAction[] = [{ type: 'NEXT_HALF', payload: { at: 1 } }, { type: 'END', payload: { at: 2 } }];

describe('football leg 2 plays its decider on aggregate', () => {
  // Leg 1: A 2-1 B. Leg 2: B at home → prior home (B) = 1, away (A) = 2.
  const leg2 = { decider: 'extra_time', aggregateLeg: 2, aggPriorHome: 1, aggPriorAway: 2 };

  test('leg 2 won 1-0 by B → aggregate 2-2 → extra time, then a shoot-out A wins', () => {
    let s = fb(leg2, [G('home'), ...toFullTime]);
    assert.equal(football.footballComplete(s), false);
    assert.equal(football.footballResult(s), null);
    assert.match(football.footballDetailLine(s) ?? '', /Aggregate 2–2/);
    s = football.reducer(s, { type: 'START_EXTRA_TIME', payload: { etMinutes: 15 } });
    assert.equal(s.half, 3);
    s = [{ type: 'NEXT_HALF', payload: { at: 3 } }, { type: 'END', payload: { at: 4 } }, { type: 'START_SHOOTOUT', payload: { first: 'home' } }].reduce(football.reducer, s);
    assert.ok(s.shootout);
    for (let i = 0; i < 3; i++) { s = football.reducer(s, { type: 'PEN', side: 'home', payload: { scored: false } }); s = football.reducer(s, { type: 'PEN', side: 'away', payload: { scored: true } }); }
    assert.equal(s.shootoutWinner, 'away');
    assert.deepEqual(football.footballResult(s), { winner: 'away', home: 1, away: 0 }); // A (away) through on pens
  });

  test('leg 2 drawn 1-1 but A ahead on aggregate → no extra time; full time stands', () => {
    let s = fb(leg2, [G('home'), G('away'), ...toFullTime]);
    assert.equal(football.footballComplete(s), true);
    assert.deepEqual(football.footballResult(s), { winner: 'draw', home: 1, away: 1 });
    s = football.reducer(s, { type: 'START_EXTRA_TIME', payload: {} });
    assert.equal(s.half, 2); // refused
    assert.equal(football.reducer(s, { type: 'START_SHOOTOUT', payload: {} }).shootout, null);
  });

  test('an old match (no aggregateLeg) replays exactly as the frozen engine', () => {
    const cfg = { decider: 'extra_time' };
    const log: ScoreAction[] = [G('home'), G('away'), ...toFullTime, { type: 'START_EXTRA_TIME', payload: { etMinutes: 15 } }, G('home', 100), { type: 'NEXT_HALF', payload: { at: 3 } }, { type: 'END', payload: { at: 4 } }];
    const now = log.reduce(football.reducer, football.init(cfg));
    const old = log.reduce(legacyReducer, legacyInit(cfg));
    assert.equal(now.home, old.home); assert.equal(now.away, old.away); assert.equal(now.half, old.half); assert.equal(now.ended, old.ended);
    assert.equal(now.agg, undefined);
    // stray aggPrior keys without the leg-2 flag change nothing either
    const stray = log.reduce(football.reducer, football.init({ ...cfg, aggPriorHome: 5, aggPriorAway: 0 }));
    assert.deepEqual({ ...stray }, { ...now });
  });
});

describe('hockey / handball leg 2 on aggregate', () => {
  test('hockey: leg 2 lost 0-1 at home after a 1-0 leg-1 win → aggregate 1-1 → shoot-out', () => {
    // leg 2 home side won leg 1 1-0 → prior home 1, away 0
    const cfg = { decider: 'shootout', aggregateLeg: 2, aggPriorHome: 1, aggPriorAway: 0 };
    let s = hockey.init(cfg);
    s = hockey.reducer(s, { type: 'GOAL', side: 'away', payload: { at: 0 } });
    s = hockey.reducer(s, { type: 'END', payload: { at: 0 } });
    assert.equal(hockey.levelAtEnd(s), true);
    assert.equal(hockey.isComplete(s), false);
    assert.equal(hockey.aggLine(s), 'Aggregate 1–1');
    s = hockey.reducer(s, { type: 'START_SHOOTOUT', payload: { first: 'home' } });
    assert.ok(s.shootout);
    for (let i = 0; i < 3; i++) { s = hockey.reducer(s, { type: 'SO', side: 'home', payload: { scored: true } }); s = hockey.reducer(s, { type: 'SO', side: 'away', payload: { scored: false } }); }
    assert.deepEqual(hockey.result(s), { winner: 'home', home: 0, away: 1 });
  });
  test('hockey: an old level match without the flag is unchanged', () => {
    let s = hockey.init({ decider: 'shootout', aggPriorHome: 3, aggPriorAway: 0 });
    s = hockey.reducer(s, { type: 'END', payload: { at: 0 } });
    assert.equal(s.agg, undefined);
    assert.equal(hockey.isComplete(s), false); // 0-0 → shoot-out as before
  });
  test('handball: leg 2 level on the day but not on aggregate → no extra time', () => {
    const cfg = { decider: 'et2', aggregateLeg: 2, aggPriorHome: 20, aggPriorAway: 25 };
    let s = handball.init(cfg);
    s = handball.reducer(s, { type: 'GOAL', side: 'home', payload: {} });
    s = handball.reducer(s, { type: 'GOAL', side: 'away', payload: {} });
    s = handball.reducer(s, { type: 'END_PERIOD', payload: { at: 0 } });
    s = handball.reducer(s, { type: 'END_PERIOD', payload: { at: 0 } });
    assert.equal(s.ended, true);
    assert.equal(s.etRounds, 0);
    assert.deepEqual(handball.result(s), { winner: 'draw', home: 1, away: 1 });
  });
  test('handball: leg 2 won by 5 levels the aggregate → extra time', () => {
    const cfg = { decider: 'et2', aggregateLeg: 2, aggPriorHome: 20, aggPriorAway: 25 };
    let s = handball.init(cfg);
    for (let i = 0; i < 5; i++) s = handball.reducer(s, { type: 'GOAL', side: 'home', payload: {} });
    s = handball.reducer(s, { type: 'END_PERIOD', payload: { at: 0 } });
    s = handball.reducer(s, { type: 'END_PERIOD', payload: { at: 0 } });
    assert.equal(s.ended, false);
    assert.equal(s.etRounds, 1);
  });
});

/* --------------------- series resolution + override ----------------------- */

function leg(opts: { id: string; sid: string; legNo: number; homeA: boolean; status?: Match['status']; winner?: Match['winner']; score?: { home: number; away: number }; state?: unknown; extra?: Record<string, unknown>; stage?: string }): Match {
  return {
    id: opts.id, sport: 'football', stage: opts.stage, status: opts.status ?? 'completed',
    startsAt: `2026-09-0${opts.legNo}T10:00:00Z`,
    homeTeam: opts.homeA ? A : B, awayTeam: opts.homeA ? B : A,
    winner: opts.winner, score: opts.score, state: opts.state ?? null,
    format: { ...seriesLegFormat({ id: opts.sid, format: 'aggregate', legs: 2, leg: opts.legNo, teamAId: A.id }), ...(opts.extra ?? {}) },
  } as unknown as Match;
}

describe('aggregate resolution (series.ts)', () => {
  test('2-1 then 0-1: leg 2 won on goals no longer hands B the tie — it waits for the organiser', () => {
    const legs = [
      leg({ id: 'l1', sid: 's', legNo: 1, homeA: true, winner: 'home', score: { home: 2, away: 1 } }),
      leg({ id: 'l2', sid: 's', legNo: 2, homeA: false, winner: 'home', score: { home: 1, away: 0 } }),
    ];
    const st = resolveSeries(deriveSeries(legs)[0]);
    assert.equal(st.aggA, 2); assert.equal(st.aggB, 2);
    assert.equal(st.winnerId, undefined);
    assert.equal(st.drawn, true);
  });
  test('…and a leg-2 shoot-out on aggregate decides it', () => {
    const legs = [
      leg({ id: 'l1', sid: 's', legNo: 1, homeA: true, winner: 'home', score: { home: 2, away: 1 } }),
      leg({ id: 'l2', sid: 's', legNo: 2, homeA: false, winner: 'away', score: { home: 1, away: 0 }, state: { shootoutWinner: 'away' } }),
    ];
    assert.equal(resolveSeries(deriveSeries(legs)[0]).winnerId, A.id);
  });
  test('organiser pick settles a stuck tie (on the last leg), marked as such', () => {
    const legs = [
      leg({ id: 'l1', sid: 's', legNo: 1, homeA: true, winner: 'home', score: { home: 2, away: 1 } }),
      leg({ id: 'l2', sid: 's', legNo: 2, homeA: false, winner: 'home', score: { home: 1, away: 0 }, extra: advancePatch(B.id, 'Agreed by both captains', 'Org', '2026-09-03T00:00:00Z') }),
    ];
    const s = deriveSeries(legs)[0];
    const st = resolveSeries(s);
    assert.equal(st.winnerId, B.id);
    assert.equal(st.byOrganiser, true);
    assert.match(st.summary, /organiser decision/);
    assert.equal(seriesWinnerId(s), B.id);
  });
  test('a pick naming neither side is ignored', () => {
    const legs = [
      leg({ id: 'l1', sid: 's', legNo: 1, homeA: true, winner: 'draw', score: { home: 0, away: 0 } }),
      leg({ id: 'l2', sid: 's', legNo: 2, homeA: false, winner: 'draw', score: { home: 0, away: 0 }, extra: advancePatch('zzz', 'typo') }),
    ];
    assert.equal(resolveSeries(deriveSeries(legs)[0]).winnerId, undefined);
  });
  test('aggregatePriorFor maps leg 1 onto leg 2\'s sides', () => {
    const l1 = leg({ id: 'l1', sid: 's', legNo: 1, homeA: true, winner: 'home', score: { home: 2, away: 1 } });
    const l2 = leg({ id: 'l2', sid: 's', legNo: 2, homeA: false, status: 'scheduled' });
    assert.deepEqual(aggregatePriorFor(l2, [l1, l2]), { home: 1, away: 2 }); // B (home in leg 2) scored 1 in leg 1
    assert.equal(aggregatePriorFor(l1, [l1, l2]), null);
    assert.equal(aggregatePriorFor(l2, [{ ...l1, status: 'live' } as Match, l2]), null);
  });
});

/* ------------------------- bracket never stalls ---------------------------- */

const ko = (id: string, home: typeof A, away: typeof A, stage: string, o: Partial<Match> = {}): Match =>
  ({ id, sport: 'football', stage, status: 'completed', startsAt: `2026-09-10T1${id.length}:00:00Z`, homeTeam: home, awayTeam: away, state: null, ...o }) as unknown as Match;

describe('organiser advance pick (bracket.ts, every sport)', () => {
  test('a drawn knockout match with no decider stalls the round until the organiser picks', () => {
    const sf1 = ko('s1', A, B, 'sf', { winner: 'draw', score: { home: 1, away: 1 } });
    const sf2 = ko('s22', C, D, 'sf', { winner: 'home', score: { home: 2, away: 0 } });
    let rounds = knockoutStageRounds([sf1, sf2]);
    assert.equal(nextRoundPairs(rounds[0]), null);
    const p = rounds[0].pairings.find((x) => x.key === 's1') as KnockoutPairing;
    assert.equal(pairingNeedsOrganiser(p), true);
    assert.equal(pairingNeedsOrganiser(rounds[0].pairings.find((x) => x.key === 's22')!), false);
    assert.equal(advanceTargetMatch(p)?.id, 's1');

    const picked = { ...sf1, format: advancePatch(B.id, 'Abandoned — floodlight failure; B led on corners', 'Organiser') } as Match;
    rounds = knockoutStageRounds([picked, sf2]);
    assert.equal(matchWinnerId(picked), B.id);
    assert.equal(matchLoserId(picked), A.id);
    assert.deepEqual(nextRoundPairs(rounds[0]), [{ homeId: B.id, awayId: C.id, stage: 'final' }]);
    const pp = rounds[0].pairings.find((x) => x.key === 's1')!;
    assert.equal(pairingNeedsOrganiser(pp), false);
    assert.equal(pairingAdvanceOverride(pp)?.reason, 'Abandoned — floodlight failure; B led on corners');
  });

  test('a cancelled final can be settled; a live / scheduled one cannot', () => {
    const fin = ko('f', A, B, 'final', { status: 'cancelled' });
    const rounds = knockoutStageRounds([fin]);
    assert.equal(pairingNeedsOrganiser(rounds[0].pairings[0]), true);
    assert.equal(pairingNeedsOrganiser(knockoutStageRounds([{ ...fin, status: 'live' } as Match])[0].pairings[0]), false);
    const won = { ...fin, format: advancePatch(A.id, 'B could not travel') } as Match;
    assert.equal(stageChampionId(knockoutStageRounds([won])), A.id);
    // the pick doesn't count while the match could still be played
    assert.equal(matchWinnerId({ ...won, status: 'scheduled' } as Match), undefined);
  });

  test('a real result always beats a stray pick', () => {
    const m = ko('m', A, B, 'qf', { winner: 'home', score: { home: 3, away: 0 }, format: advancePatch(B.id, 'old pick') });
    assert.equal(matchWinnerId(m), A.id);
    assert.equal(advanceOverride(m)?.teamId, B.id);
    assert.equal(pairingAdvanceOverride(knockoutStageRounds([m])[0].pairings[0]), undefined);
  });

  test('a decided match replays unchanged (no pick keys → old behaviour)', () => {
    const m = ko('m', A, B, 'qf', { winner: 'away', score: { home: 0, away: 1 } });
    assert.equal(matchWinnerId(m), B.id);
    const d = ko('d', A, B, 'qf', { winner: 'draw', score: { home: 0, away: 0 } });
    assert.equal(matchWinnerId(d), undefined);
  });
});
