/**
 * SD-50 (BK-09 / GEN-20) — game-flow stats, derived from a match's event log:
 * biggest lead (and when), lead changes, times tied, the largest scoring run
 * per team ("12-0 run") and — basketball, once the starters are known — bench
 * points. Pure (no React / RN): one generic core over an ordered list of
 * scoring plays, plus a small adapter per running-score sport that reads its
 * stored state (basketball, football, hockey, handball, kabaddi). Derived only:
 * no reducer, no stored keys — works for old and corrected matches alike.
 *
 * Definitions (as box-score services count them):
 * - lead change: a side goes ahead after the OTHER side last led (a tie in
 *   between doesn't reset it; the first lead of the game is not a change);
 * - times tied: scoring plays after which the score is level (0-0 excluded);
 * - largest run: the most points one side scores in a row with the other side
 *   scoring none (goals sports: unanswered goals);
 * - bench points: points by players who did not start (unattributed points
 *   count for nobody).
 */
import { periodLabel, type BasketballState } from './basketball/engine.ts';
import { pointsOf } from './basketball/events.ts';

type Side = 'home' | 'away';

/** One scoring play, in match order. */
export interface FlowScore {
  side: Side;
  points: number;
  /** when it happened, as the sport reads it ("Q3 6'", "67'") */
  at?: string;
  /** the scorer (basketball bench points): id when known, else name */
  playerId?: string;
  playerName?: string;
}

export interface FlowMark { value: number; at?: string; home: number; away: number }
export interface GameFlow {
  unit: 'points' | 'goals';
  scores: number;
  biggestLead: Record<Side, FlowMark | null>;
  largestRun: Record<Side, FlowMark | null>;
  leadChanges: number;
  timesTied: number;
  /** basketball: bench points per side (absent when that side's starters aren't known) */
  bench?: Partial<Record<Side, number>>;
}

/** Starters per side (ids or names) — for bench points. */
export type Starters = Partial<Record<Side, { ids?: string[]; names?: string[] }>>;

export function computeGameFlow(plays: FlowScore[], unit: GameFlow['unit'] = 'points', starters?: Starters): GameFlow {
  let home = 0, away = 0;
  let leader: Side | null = null;
  let leadChanges = 0, timesTied = 0;
  const biggestLead: Record<Side, FlowMark | null> = { home: null, away: null };
  const largestRun: Record<Side, FlowMark | null> = { home: null, away: null };
  let run: { side: Side; value: number; at?: string; home: number; away: number } | null = null;
  const closeRun = () => {
    if (run && (!largestRun[run.side] || run.value > largestRun[run.side]!.value)) {
      largestRun[run.side] = { value: run.value, at: run.at, home: run.home, away: run.away };
    }
  };
  let scores = 0;
  for (const p of plays) {
    if (!(p.points > 0)) continue;
    scores += 1;
    if (p.side === 'home') home += p.points; else away += p.points;
    // run: extend, or close the other side's and start this one's
    if (run && run.side === p.side) { run.value += p.points; run.home = home; run.away = away; }
    else { closeRun(); run = { side: p.side, value: p.points, at: p.at, home, away }; }
    const margin = home - away;
    if (margin === 0) timesTied += 1;
    else {
      const ahead: Side = margin > 0 ? 'home' : 'away';
      if (leader && leader !== ahead) leadChanges += 1;
      leader = ahead;
      const lead = Math.abs(margin);
      if (!biggestLead[ahead] || lead > biggestLead[ahead]!.value) biggestLead[ahead] = { value: lead, at: p.at, home, away };
    }
  }
  closeRun();
  const out: GameFlow = { unit, scores, biggestLead, largestRun, leadChanges, timesTied };
  if (starters && (starters.home || starters.away)) {
    const bench: Partial<Record<Side, number>> = {};
    for (const side of ['home', 'away'] as const) {
      const st = starters[side];
      if (!st || (!st.ids?.length && !st.names?.length)) continue;
      const ids = new Set(st.ids ?? []);
      const names = new Set(st.names ?? []);
      bench[side] = plays
        .filter((p) => p.side === side && p.points > 0 && (p.playerId || p.playerName))
        .filter((p) => !(p.playerId && ids.has(p.playerId)) && !(p.playerName && names.has(p.playerName)))
        .reduce((a, p) => a + p.points, 0);
    }
    if (bench.home != null || bench.away != null) out.bench = bench;
  }
  return out;
}

/* ------------------------------ sport adapters ----------------------------- */

const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const byKeys = <T>(xs: T[], ...keys: ((x: T) => number)[]) =>
  xs.map((x, i) => ({ x, i })).sort((a, b) => {
    for (const k of keys) { const d = k(a.x) - k(b.x); if (d) return d; }
    return a.i - b.i;
  }).map(({ x }) => x);

/** Basketball: made field goals + made free throws, in period / minute / log order. */
function basketballPlays(s: BasketballState): FlowScore[] {
  const evs = byKeys(s.events.filter((e) => pointsOf(e) > 0), (e) => num(e.quarter, 1), (e) => num(e.minute), (e) => num(e.id));
  return evs.map((e) => ({
    side: e.side, points: pointsOf(e), at: `${periodLabel(e.quarter, s.regPeriods)} ${e.minute}'`,
    playerName: e.playerName, playerId: e.playerName ? s.ids?.[e.playerName] : undefined,
  }));
}

interface MinuteEvent { type?: string; kind?: string; side?: Side; minute?: number; half?: number; period?: number; sec?: number; id?: number | string; points?: number; stamp?: string }

/** Which sports have a game-flow block. */
export const GAME_FLOW_SPORTS = ['basketball', 'football', 'hockey', 'handball', 'kabaddi'] as const;

/** Game flow for a sport's stored state; null = not a running-score sport,
 *  or nothing scored yet (goals sports: fewer than 2 goals says nothing). */
export function gameFlowFor(sport: string, state: unknown, starters?: Starters): GameFlow | null {
  const s = state as { events?: MinuteEvent[] } | null;
  if (!s || !Array.isArray(s.events)) return null;
  const evs = s.events;
  let plays: FlowScore[];
  let unit: GameFlow['unit'] = 'goals';
  const goal = (e: MinuteEvent, at: string): FlowScore => ({ side: e.side as Side, points: 1, at });
  switch (sport) {
    case 'basketball': {
      unit = 'points';
      const bb = state as BasketballState;
      plays = basketballPlays(bb);
      // starters: the five set on court (SET_LINEUP), else the caller's lineup
      const five: Starters = bb.onCourt
        ? Object.fromEntries((['home', 'away'] as const).filter((sd) => bb.onCourt![sd]?.length).map((sd) => [sd, {
          names: bb.onCourt![sd], ids: bb.onCourt![sd].map((n) => bb.ids?.[n]).filter((x): x is string => !!x),
        }])) : {};
      const st: Starters = { home: five.home ?? starters?.home, away: five.away ?? starters?.away };
      const flow = computeGameFlow(plays, unit, st);
      return flow.scores > 0 ? flow : null;
    }
    case 'football':
      // goals and own goals (side = the team the goal counts for); shootout kicks aren't events
      plays = byKeys(evs.filter((e) => (e.type === 'goal' || e.type === 'owngoal') && e.side), (e) => num(e.half, 1), (e) => num(e.minute), (e) => num(e.sec), (e) => num(e.id as number))
        .map((e) => goal(e, `${num(e.minute)}'`));
      break;
    case 'hockey':
    case 'handball':
      plays = byKeys(evs.filter((e) => e.type === 'goal' && e.side), (e) => num(e.period, 1), (e) => num(e.sec))
        .map((e) => goal(e, `${Math.floor(num(e.sec) / 60)}'`));
      break;
    case 'kabaddi':
      unit = 'points';
      // every line that puts points on the board (raid / tackle / all out /
      // technical point / line-out); shootout raids ('SO') stay out
      plays = evs
        .filter((e) => e.side && e.stamp !== 'SO' && (e.kind === 'raid' || e.kind === 'tackle' || e.kind === 'allout' || e.kind === 'tech' || e.kind === 'lineout') && num(e.points) > 0)
        .map((e) => ({ side: e.side as Side, points: num(e.points), at: e.stamp ?? (e.minute != null ? `${e.minute}'` : undefined) }));
      break;
    default:
      return null;
  }
  const flow = computeGameFlow(plays, unit);
  return flow.scores >= (unit === 'goals' ? 2 : 1) ? flow : null;
}
