/**
 * Basketball — the PURE scoring core (state, reducer, and rule helpers). No React
 * or React Native imports, so it runs in tests and (later) on the server exactly
 * as it does on-device. The UI (controls, box score, timeline) lives in index.tsx
 * and imports from here. Mirrors cricket's engine.ts / kabaddi's rules.ts.
 */
import type { ScoreAction } from '../types';
import { pointsOf, type BBEvent, type FoulType, type ReboundType } from './events.ts';

export interface BasketballState {
  home: number;
  away: number;
  quarter: number; // 1..4
  startedAt?: number; // clock for the current quarter
  events: BBEvent[];
  seq: number;
  ended: boolean;
  /** personal fouls that disqualify a player (format: foulsToFoulOut) */
  foulOutLimit: number;
  /** team fouls in a quarter that put the opponent in the bonus (format: foulsForBonus) */
  foulsForBonus: number;
  /** overtime period length in minutes (informational — the clock counts up) */
  overtimeMinutes: number;
  /** regulation periods before overtime: 4 quarters (default) or 2 halves */
  regPeriods: number;
  /** minutes per regulation period (informational — the clock counts up) */
  periodMinutes: number;
  /** first-to-N scoring (3×3 = 21); 0 = timed game decided by the clock */
  targetPoints: number;
  /** margin needed to clinch a first-to-N game (3×3 = win by 2) */
  winBy: number;
  /** shot-clock seconds (informational — not enforced by the manual clock) */
  shotClock: number;
  /** timeouts each team gets (0 = untracked / unlimited) */
  timeouts: number;
  /** who is currently on court per side, once the scorer sets a starting five.
   *  Undefined until set — subs are still recordable without it. */
  onCourt?: { home: string[]; away: string[] };
}

export const init = (config?: Record<string, unknown>): BasketballState => ({
  home: 0, away: 0, quarter: 1, events: [], seq: 0, ended: false,
  foulOutLimit: Number(config?.foulsToFoulOut ?? 5),
  foulsForBonus: Number(config?.foulsForBonus ?? 5),
  overtimeMinutes: Number(config?.overtimeMinutes ?? 5),
  regPeriods: Number(config?.regPeriods ?? 4),
  periodMinutes: Number(config?.periodMinutes ?? 10),
  targetPoints: Number(config?.targetPoints ?? 0),
  winBy: Number(config?.winBy ?? 2),
  shotClock: Number(config?.shotClock ?? 24),
  timeouts: Number(config?.timeouts ?? 0),
});

/** Q1..Qn (or H1/H2 for a two-half game), then OT, OT2… for overtime periods. */
export const periodLabel = (q: number, regPeriods = 4): string =>
  q <= regPeriods ? `${regPeriods === 2 ? 'H' : 'Q'}${q}` : q === regPeriods + 1 ? 'OT' : `OT${q - regPeriods}`;

/** Fouls a player (by name) has committed so far — drives the foul-out rule. */
export const foulCount = (s: BasketballState, name?: string): number =>
  name ? s.events.filter((e) => e.type === 'foul' && e.playerName === name).length : 0;
/** A player is fouled out once they reach the limit. */
export const isFouledOut = (s: BasketballState, name?: string): boolean =>
  s.foulOutLimit > 0 && foulCount(s, name) >= s.foulOutLimit;
/** A player was ejected (removed for the rest of the game — e.g. 2 technicals or
 *  a flagrant-2), independent of the personal-foul limit. */
export const isEjected = (s: BasketballState, name?: string): boolean =>
  !!name && s.events.some((e) => e.type === 'eject' && e.playerName === name);
/** A player takes no further part — fouled out OR ejected. */
export const isPlayerOut = (s: BasketballState, name?: string): boolean =>
  isFouledOut(s, name) || isEjected(s, name);
/** Team fouls committed by one side in the current quarter (technical fouls don't
 *  count toward the team-foul bonus). */
export const teamFoulsThisQuarter = (s: BasketballState, side: 'home' | 'away'): number =>
  s.events.filter((e) => e.type === 'foul' && e.side === side && e.quarter === s.quarter && e.foulType !== 'technical').length;
/** Timeouts a side has used so far (whole game). */
export const timeoutsUsed = (s: BasketballState, side: 'home' | 'away'): number =>
  s.events.filter((e) => e.type === 'timeout' && e.side === side).length;
/** Who is on court for a side right now, given the set starting five and every
 *  substitution since (each sub swaps the player off for the one coming on). */
export const onCourtNames = (s: BasketballState, side: 'home' | 'away'): string[] => {
  if (!s.onCourt) return [];
  const court = [...s.onCourt[side]];
  for (const e of s.events) {
    if (e.type !== 'sub' || e.side !== side || !e.playerName || !e.onName) continue;
    const i = court.indexOf(e.playerName);
    if (i >= 0) court[i] = e.onName;
    else court.push(e.onName);
  }
  return court;
};
/** A side is in the bonus (shoots free throws) once the OTHER side hits the team-foul limit this quarter. */
export const inBonus = (s: BasketballState, side: 'home' | 'away'): boolean =>
  s.foulsForBonus > 0 && teamFoulsThisQuarter(s, side === 'home' ? 'away' : 'home') >= s.foulsForBonus;

export function currentMinute(s: BasketballState): number {
  if (!s.startedAt) return 0;
  // Hold at the period length rather than drift past it: the manual clock never
  // auto-ends a quarter, so without the cap a long-open tab reads "Q1 · 65'".
  const cap = s.quarter <= s.regPeriods ? s.periodMinutes : s.overtimeMinutes;
  return Math.min(Math.floor((Date.now() - s.startedAt) / 60000), cap);
}

const push = (s: BasketballState, e: Omit<BBEvent, 'id' | 'quarter'>, quarter: number): BasketballState => ({
  ...s,
  seq: s.seq + 1,
  events: [...s.events, { ...e, id: s.seq + 1, quarter }],
});

export const reducer = (s: BasketballState, a: ScoreAction): BasketballState => {
  if (s.ended && a.type !== 'END') return s;
  const minute = Number(a.payload?.minute ?? currentMinute(s));
  const quarter = Number(a.payload?.quarter ?? s.quarter);
  const name = a.attribution?.playerName;
  // Put points on the board + log the play; ends a first-to-N game on the clincher.
  const scorePoints = (side: 'home' | 'away', pts: number, ev: Omit<BBEvent, 'id' | 'quarter'>): BasketballState => {
    const scored = { ...s, [side]: s[side] + pts } as BasketballState;
    const logged = push(scored, ev, quarter);
    const opp = side === 'home' ? 'away' : 'home';
    if (pts > 0 && logged.targetPoints > 0 && logged[side] >= logged.targetPoints && logged[side] - logged[opp] >= logged.winBy) {
      return { ...logged, ended: true, startedAt: undefined };
    }
    return logged;
  };
  switch (a.type) {
    case 'KICKOFF':
      return { ...s, startedAt: Number(a.payload?.at) };
    case 'SCORE': {
      if (!a.side) return s;
      // a disqualified player takes no further part
      if (isPlayerOut(s, name)) return s;
      const pts = Number(a.payload?.points ?? 0);
      // First-to-N games (3×3 to 21, streetball) end the moment the target is
      // reached with the required margin.
      return scorePoints(a.side, pts, { minute, type: 'score', side: a.side, playerName: name, points: pts });
    }
    case 'FREE_THROW': {
      // One free-throw attempt. A make adds a point; a miss is logged for the
      // attempt count. A shooting/technical foul awards these to the OTHER team.
      if (!a.side || isPlayerOut(s, name)) return s;
      const made = a.payload?.made === true;
      return scorePoints(a.side, made ? 1 : 0, { minute, type: 'freethrow', side: a.side, playerName: name, made, points: made ? 1 : 0 });
    }
    case 'REBOUND':
      return a.side && !isPlayerOut(s, name)
        ? push(s, { minute, type: 'rebound', side: a.side, playerName: name, reboundType: a.payload?.reboundType as ReboundType | undefined }, quarter)
        : s;
    case 'ASSIST':
      return a.side && !isPlayerOut(s, name) ? push(s, { minute, type: 'assist', side: a.side, playerName: name }, quarter) : s;
    case 'STEAL':
      return a.side && !isPlayerOut(s, name) ? push(s, { minute, type: 'steal', side: a.side, playerName: name }, quarter) : s;
    case 'BLOCK':
      return a.side && !isPlayerOut(s, name) ? push(s, { minute, type: 'block', side: a.side, playerName: name }, quarter) : s;
    case 'TURNOVER':
      return a.side && !isPlayerOut(s, name) ? push(s, { minute, type: 'turnover', side: a.side, playerName: name }, quarter) : s;
    case 'FOUL':
      // count the foul, but never beyond the limit (already fouled out)
      return a.side && !isPlayerOut(s, name)
        ? push(s, { minute, type: 'foul', side: a.side, playerName: name, foulType: (a.payload?.foulType as FoulType | undefined) ?? 'personal' }, quarter)
        : s;
    case 'TIMEOUT':
      return a.side ? push(s, { minute, type: 'timeout', side: a.side }, quarter) : s;
    case 'EJECT':
      // Remove a player for the rest of the game (2 technicals / flagrant-2 /
      // fighting) — independent of the personal-foul limit. Blocks further credit.
      return a.side && name && !isEjected(s, name) ? push(s, { minute, type: 'eject', side: a.side, playerName: name }, quarter) : s;
    case 'SET_LINEUP': {
      const home = (a.payload?.home as string[] | undefined) ?? s.onCourt?.home ?? [];
      const away = (a.payload?.away as string[] | undefined) ?? s.onCourt?.away ?? [];
      return { ...s, onCourt: { home, away } };
    }
    case 'SUB': {
      // Record a substitution (off → on). If a starting five is set, keep the
      // on-court list in sync via onCourtNames (derived, not stored per-sub).
      const offName = String(a.payload?.offName ?? '');
      const onName = String(a.payload?.onName ?? '');
      if (!a.side || !offName || !onName) return s;
      return push(s, { minute, type: 'sub', side: a.side, playerName: offName, onName }, quarter);
    }
    case 'REMOVE_EVENT': {
      // Surgically remove one logged play, reversing its effect on the score.
      // Its stat line is reversed by the negative attribution on this action.
      const id = Number(a.payload?.id);
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e.id !== id) } as BasketballState;
      const scoreBack = pointsOf(ev);
      return scoreBack > 0 ? ({ ...next, [ev.side]: Math.max(0, next[ev.side] - scoreBack) } as BasketballState) : next;
    }
    case 'NEXT_QUARTER':
      return s.quarter < s.regPeriods ? { ...s, quarter: s.quarter + 1, startedAt: undefined } : s;
    case 'START_OVERTIME':
      // A game level at the end of regulation (or an OT period) plays another
      // overtime period; the running score carries over. Repeats until decided.
      return s.home === s.away ? { ...s, quarter: s.quarter + 1, startedAt: undefined } : s;
    case 'END':
      return { ...s, ended: true, startedAt: undefined };
    default:
      return s;
  }
};
