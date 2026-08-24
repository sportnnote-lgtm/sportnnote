/**
 * Series / ties (tournament gap #3): several matches between the same two teams
 * resolve to one winner — best-of-X (majority of wins), two-legged aggregate
 * (combined score, then away-goals / 2nd-leg result), and rubbers (most wins).
 * Series are derived by grouping matches that share a __seriesId on their format.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSeries,
  resolveSeries,
  seriesWinnerId,
  seriesLegFormat,
  readSeriesMeta,
  clinchTarget,
  type SeriesFormat,
} from '../src/data/series.ts';
import type { Match } from '../src/core/types.ts';

const TEAM = (id: string, short: string) => ({ id, name: short + ' FC', shortName: short, sport: 'football' as const });
const A = TEAM('t-a', 'AAA');
const B = TEAM('t-b', 'BBB');

/** Build one leg. `homeA` puts A at home; result via winner + score. */
function leg(opts: {
  id: string; seriesId: string; fmt: SeriesFormat; legs: number; legNo: number;
  homeA?: boolean; status?: Match['status']; winner?: 'home' | 'away' | 'draw';
  score?: { home: number; away: number }; awayGoals?: boolean; name?: string;
}): Match {
  const homeA = opts.homeA ?? true;
  return {
    id: opts.id,
    sport: 'football',
    status: opts.status ?? 'scheduled',
    startsAt: `2026-08-2${opts.legNo}T10:00:00Z`,
    homeTeam: homeA ? A : B,
    awayTeam: homeA ? B : A,
    winner: opts.winner,
    score: opts.score,
    format: seriesLegFormat({ id: opts.seriesId, format: opts.fmt, legs: opts.legs, leg: opts.legNo, teamAId: A.id, name: opts.name, awayGoals: opts.awayGoals }),
    state: null,
  } as unknown as Match;
}

const only = (ms: Match[]) => { const s = deriveSeries(ms); assert.equal(s.length, 1); return s[0]; };

describe('series metadata round-trips', () => {
  test('seriesLegFormat → readSeriesMeta', () => {
    const m = leg({ id: 'm1', seriesId: 's1', fmt: 'best_of', legs: 3, legNo: 1, name: 'IND v AUS' });
    const meta = readSeriesMeta(m);
    assert.ok(meta);
    assert.equal(meta!.id, 's1');
    assert.equal(meta!.format, 'best_of');
    assert.equal(meta!.legs, 3);
    assert.equal(meta!.leg, 1);
    assert.equal(meta!.teamAId, 't-a');
    assert.equal(meta!.name, 'IND v AUS');
  });
  test('a plain match has no series meta', () => {
    const plain = { id: 'x', sport: 'football', status: 'scheduled', startsAt: '', homeTeam: A, awayTeam: B, format: { overs: 5 }, state: null } as unknown as Match;
    assert.equal(readSeriesMeta(plain), null);
    assert.equal(deriveSeries([plain]).length, 0);
  });
  test('clinchTarget: best-of-3 → 2, best-of-5 → 3, best-of-7 → 4', () => {
    assert.equal(clinchTarget(3), 2);
    assert.equal(clinchTarget(5), 3);
    assert.equal(clinchTarget(7), 4);
  });
});

describe('best_of', () => {
  const S = (legs: Match[]) => resolveSeries(only(legs));

  test('leader shown before clinch', () => {
    const st = S([
      leg({ id: '1', seriesId: 'b', fmt: 'best_of', legs: 3, legNo: 1, status: 'completed', winner: 'home' }), // A
      leg({ id: '2', seriesId: 'b', fmt: 'best_of', legs: 3, legNo: 2, status: 'scheduled' }),
      leg({ id: '3', seriesId: 'b', fmt: 'best_of', legs: 3, legNo: 3, status: 'scheduled' }),
    ]);
    assert.equal(st.winsA, 1);
    assert.equal(st.decided, false);
    assert.match(st.summary, /AAA lead 1–0/);
  });

  test('clinches at a majority, remaining legs are dead rubbers', () => {
    const s = only([
      leg({ id: '1', seriesId: 'b', fmt: 'best_of', legs: 3, legNo: 1, status: 'completed', winner: 'home' }), // A
      leg({ id: '2', seriesId: 'b', fmt: 'best_of', legs: 3, legNo: 2, homeA: false, status: 'completed', winner: 'away' }), // A away → A
      leg({ id: '3', seriesId: 'b', fmt: 'best_of', legs: 3, legNo: 3, status: 'scheduled' }),
    ]);
    const st = resolveSeries(s);
    assert.equal(st.winsA, 2);
    assert.equal(st.decided, true);
    assert.equal(st.winnerId, 't-a');
    assert.equal(seriesWinnerId(s), 't-a');
    assert.ok(st.gamesLeft >= 1); // dead rubber still scheduled
    assert.match(st.summary, /AAA win the series 2–0/);
  });

  test('best-of-7 to B, 4–3', () => {
    const legs: Match[] = [];
    // A wins 1,2,3 ; B wins 4,5,6,7
    const outcomes: ('home' | 'away')[] = ['home', 'home', 'home', 'away', 'away', 'away', 'away'];
    outcomes.forEach((w, i) => legs.push(leg({ id: 'g' + i, seriesId: 'b7', fmt: 'best_of', legs: 7, legNo: i + 1, status: 'completed', winner: w })));
    const st = S(legs);
    assert.equal(st.winsA, 3);
    assert.equal(st.winsB, 4);
    assert.equal(st.winnerId, 't-b');
    assert.match(st.summary, /BBB win the series 4–3/);
  });
});

describe('aggregate (two-legged)', () => {
  const S = (legs: Match[]) => resolveSeries(only(legs));

  test('not decided until both legs complete', () => {
    const st = S([
      leg({ id: '1', seriesId: 'g', fmt: 'aggregate', legs: 2, legNo: 1, status: 'completed', winner: 'home', score: { home: 2, away: 1 } }),
      leg({ id: '2', seriesId: 'g', fmt: 'aggregate', legs: 2, legNo: 2, homeA: false, status: 'scheduled' }),
    ]);
    assert.equal(st.decided, false);
    assert.match(st.summary, /agg/);
  });

  test('higher aggregate wins', () => {
    // Leg1: A(home) 2–1 B. Leg2: B(home) 1–1 A  → agg A 3, B 2.
    const s = only([
      leg({ id: '1', seriesId: 'g', fmt: 'aggregate', legs: 2, legNo: 1, status: 'completed', winner: 'home', score: { home: 2, away: 1 } }),
      leg({ id: '2', seriesId: 'g', fmt: 'aggregate', legs: 2, legNo: 2, homeA: false, status: 'completed', winner: 'draw', score: { home: 1, away: 1 } }),
    ]);
    const st = resolveSeries(s);
    assert.equal(st.aggA, 3);
    assert.equal(st.aggB, 2);
    assert.equal(st.winnerId, 't-a');
    assert.match(st.summary, /AAA win 3–2 agg/);
  });

  test('level aggregate → away-goals when enabled', () => {
    // Leg1: A(home) 2–1 B. Leg2: B(home) 2–1 A → agg 3–3; A scored 1 away, B scored 1 away → level away too.
    // Make B score 2 away instead: Leg1 A(home) 1–2 B, Leg2 B(home) 1–0 A → agg 1–3? recompute.
    // Simpler: agg level 2–2, A away goals 2 vs B away goals 1.
    // Leg1: A home 0–1 B (A away goals 0 for A; B away 1). Leg2: B home 1–2 A (A away 2).  agg A=2,B=2; awayA=2,awayB=1.
    const s = only([
      leg({ id: '1', seriesId: 'ag', fmt: 'aggregate', legs: 2, legNo: 1, status: 'completed', winner: 'away', score: { home: 0, away: 1 }, awayGoals: true }),
      leg({ id: '2', seriesId: 'ag', fmt: 'aggregate', legs: 2, legNo: 2, homeA: false, status: 'completed', winner: 'away', score: { home: 1, away: 2 }, awayGoals: true }),
    ]);
    const st = resolveSeries(s);
    assert.equal(st.aggA, 2);
    assert.equal(st.aggB, 2);
    assert.equal(st.winnerId, 't-a'); // A won on away goals
  });

  test('level aggregate, no away-goals → 2nd-leg result (ET/pens) breaks it', () => {
    // agg 2–2; 2nd leg winner = A (as if after penalties).
    const s = only([
      leg({ id: '1', seriesId: 'ag2', fmt: 'aggregate', legs: 2, legNo: 1, status: 'completed', winner: 'home', score: { home: 1, away: 1 } }),
      leg({ id: '2', seriesId: 'ag2', fmt: 'aggregate', legs: 2, legNo: 2, homeA: false, status: 'completed', winner: 'away', score: { home: 1, away: 1 } }),
    ]);
    const st = resolveSeries(s);
    assert.equal(st.aggA, 2);
    assert.equal(st.aggB, 2);
    assert.equal(st.winnerId, 't-a'); // leg 2 away winner = A
  });
});

describe('rubbers (team tie)', () => {
  const S = (legs: Match[]) => resolveSeries(only(legs));
  test('most wins takes the tie', () => {
    // 5 rubbers: A wins 3, B wins 2.
    const outcomes: ('home' | 'away')[] = ['home', 'away', 'home', 'home', 'away'];
    // legNo alternates home team but keep A home for simplicity; winner 'home' = A, 'away' = B.
    const legs = outcomes.map((w, i) => leg({ id: 'r' + i, seriesId: 'dc', fmt: 'rubbers', legs: 5, legNo: i + 1, status: 'completed', winner: w }));
    const st = S(legs);
    assert.equal(st.winsA, 3);
    assert.equal(st.winsB, 2);
    assert.equal(st.winnerId, 't-a');
  });
  test('an even set tied after all games → drawn', () => {
    const outcomes: ('home' | 'away')[] = ['home', 'away'];
    const legs = outcomes.map((w, i) => leg({ id: 'e' + i, seriesId: 'ev', fmt: 'rubbers', legs: 2, legNo: i + 1, status: 'completed', winner: w }));
    const st = S(legs);
    assert.equal(st.winsA, 1);
    assert.equal(st.winsB, 1);
    assert.equal(st.drawn, true);
    assert.equal(st.decided, true);
    assert.equal(st.winnerId, undefined);
  });
});

describe('deriveSeries grouping', () => {
  test('groups by id, orders legs, exposes A/B teams', () => {
    const ms = [
      leg({ id: 'x2', seriesId: 's', fmt: 'best_of', legs: 3, legNo: 2, homeA: false }),
      leg({ id: 'x1', seriesId: 's', fmt: 'best_of', legs: 3, legNo: 1 }),
      { id: 'plain', sport: 'football', status: 'scheduled', startsAt: '', homeTeam: A, awayTeam: B, format: {}, state: null } as unknown as Match,
    ];
    const series = deriveSeries(ms);
    assert.equal(series.length, 1);
    assert.deepEqual(series[0].legs.map((l) => l.id), ['x1', 'x2']);
    assert.equal(series[0].teamA?.id, 't-a');
    assert.equal(series[0].teamB?.id, 't-b');
  });
});
