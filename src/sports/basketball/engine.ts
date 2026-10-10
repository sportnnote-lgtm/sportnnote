/**
 * Basketball — the PURE scoring core (state, reducer, and rule helpers). No React
 * or React Native imports, so it runs in tests and (later) on the server exactly
 * as it does on-device. The UI (controls, box score, timeline) lives in index.tsx
 * and imports from here. Mirrors cricket's engine.ts / kabaddi's rules.ts.
 */
import type { ScoreAction } from '../types';
import { pointsOf, type BBEvent, type DqReason, type FoulType, type ReboundType } from './events.ts';

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
  /** team fouls in a period AFTER which every further foul gives the opponent
   *  free throws (format: foulsForBonus). FIBA/NBA = 4: the penalty starts with
   *  the 5th team foul. Old stored configs say 5 and keep replaying as they did. */
  foulsForBonus: number;
  /** FIBA (Art. 41.1.1): a player's technical foul is a team foul. NBA: it isn't.
   *  Format key `techIsTeamFoul`; absent = legacy (technicals don't count). Only
   *  put on the state when the stored config has the key, so old matches replay
   *  to exactly the same state shape. */
  techIsTeamFoul?: boolean;
  /** FIBA (Art. 41.1.2): team fouls in overtime count as if in the last
   *  regulation period, so they carry over instead of resetting. Format key
   *  `otFoulsCarry`; absent = legacy (each OT period starts from 0). */
  otFoulsCarry?: boolean;
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
  /** SD-29: player ids by name, from the SET_LINEUP / SUB payloads of newer
   *  logs (events carry names only) — so minutes and +/- reach the right stat
   *  line. Absent on older logs. */
  ids?: Record<string, string>;
  /** SD-31 (BK-03): "Track missed shots" (format key `trackMisses`) — the
   *  scorer logs Miss 2 / Miss 3, so FGA / FG% / missed FG in EFF are known.
   *  Only on the state when the stored config has the key (old matches keep
   *  their exact state shape); absent / false = not tracked (D8). */
  trackMisses?: boolean;
}

/** SD-29: merge name → id pairs into the state (only when a payload has any,
 *  so older logs keep exactly their state shape). */
const withIds = (s: BasketballState, pairs: [unknown, unknown][]): BasketballState => {
  const add = pairs.filter(([n, id]) => typeof n === 'string' && n && typeof id === 'string' && id) as [string, string][];
  if (!add.length) return s;
  return { ...s, ids: { ...(s.ids ?? {}), ...Object.fromEntries(add) } };
};

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
  // SD-05 rule flags — present only when the stored config carries them.
  ...(config?.techIsTeamFoul != null ? { techIsTeamFoul: config.techIsTeamFoul === true } : {}),
  ...(config?.otFoulsCarry != null ? { otFoulsCarry: config.otFoulsCarry === true } : {}),
  ...(config?.trackMisses != null ? { trackMisses: config.trackMisses === true } : {}),
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
/** Does this foul count as a team foul? Every foul does, except a technical
 *  when the format says technicals aren't team fouls (NBA, and legacy configs). */
const isTeamFoul = (s: BasketballState, e: BBEvent): boolean =>
  e.type === 'foul' && (e.foulType !== 'technical' || s.techIsTeamFoul === true);
/** Is a foul logged in period `q` part of the current team-foul count? The
 *  current period only — except in overtime under FIBA (`otFoulsCarry`), where
 *  every OT period counts together with the last regulation period. */
const inFoulPeriod = (s: BasketballState, q: number): boolean =>
  s.otFoulsCarry === true && s.quarter > s.regPeriods ? q >= s.regPeriods : q === s.quarter;
/** Team fouls committed by one side in the current period (see `isTeamFoul`
 *  for technicals and `inFoulPeriod` for overtime). */
export const teamFoulsThisQuarter = (s: BasketballState, side: 'home' | 'away'): number =>
  s.events.filter((e) => e.side === side && inFoulPeriod(s, e.quarter) && isTeamFoul(s, e)).length;
/** SD-40 — team fouls per period for one side (the FIBA box score's line):
 *  index 0 = period 1. Counts what `teamFoulsThisQuarter` counts (technicals
 *  per the format), period by period — the OT carry-over is a bonus rule, not
 *  a different tally. */
export const teamFoulsByPeriod = (s: BasketballState, side: 'home' | 'away'): number[] => {
  const n = Math.max(1, s.quarter, ...s.events.map((e) => e.quarter));
  const out = Array.from({ length: n }, () => 0);
  for (const e of s.events) if (e.side === side && isTeamFoul(s, e) && e.quarter >= 1) out[e.quarter - 1] += 1;
  return out;
};
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
const isDqReason = (r: unknown): r is DqReason => r === 'D' || r === '2T' || r === '2U' || r === 'T+U';

/** SD-117 (B12) — does this foul disqualify its player (FIBA Art. 36.2.3,
 *  37, 38)? A disqualifying foul does; so does a 2nd technical, a 2nd
 *  unsportsmanlike, or a technical + an unsportsmanlike. Counts the player's
 *  fouls already logged plus this one. */
export function disqualifyingFoul(s: BasketballState, name: string | undefined, type: FoulType): DqReason | undefined {
  if (!name) return undefined;
  if (type === 'disqualifying') return 'D';
  if (type !== 'technical' && type !== 'unsportsmanlike') return undefined;
  const mine = s.events.filter((e) => e.type === 'foul' && e.playerName === name);
  const t = mine.filter((e) => e.foulType === 'technical').length + (type === 'technical' ? 1 : 0);
  const u = mine.filter((e) => e.foulType === 'unsportsmanlike').length + (type === 'unsportsmanlike' ? 1 : 0);
  if (type === 'technical' && t >= 2) return '2T';
  if (type === 'unsportsmanlike' && u >= 2) return '2U';
  return t >= 1 && u >= 1 ? 'T+U' : undefined;
}

/** SD-117 (B8 / B11) — free throws a foul gives the other side, before the
 *  shooter's own count is known: technical 1 (FIBA), unsportsmanlike /
 *  disqualifying / flagrant 2, shooting 2 (3 on a three — the scorer can
 *  change it), any other non-offensive foul 2 once the fouling side is over
 *  the team-foul limit (the bonus). 0 = no free throws. */
export function freeThrowsFor(s: BasketballState, side: 'home' | 'away', type: FoulType): number {
  if (type === 'technical') return 1;
  if (type === 'unsportsmanlike' || type === 'disqualifying' || type === 'flagrant' || type === 'shooting') return 2;
  if (type === 'offensive') return 0;
  return inBonus(s, side === 'home' ? 'away' : 'home') ? 2 : 0;
}

/** A side is in the bonus (shoots free throws on every further foul) once the
 *  OTHER side has committed `foulsForBonus` team fouls this period. */
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

/** SD-40: newer controls put the credited player's id in `payload.pid` (events
 *  carry names only), so `statTotals` can key every line by id. Merged only
 *  when the play was logged — an older log (no pid) keeps its exact state. */
export const reducer = (s: BasketballState, a: ScoreAction): BasketballState => {
  const next = reduce(s, a);
  const pid = a.payload?.pid;
  const name = a.attribution?.playerName;
  return next !== s && typeof pid === 'string' && pid && name && next.ids?.[name] !== pid ? withIds(next, [[name, pid]]) : next;
};

const reduce = (s: BasketballState, a: ScoreAction): BasketballState => {
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
      return scorePoints(a.side, pts, { minute, type: 'score', side: a.side, playerName: name, points: pts, ...(a.payload?.fga === true ? { fga: true as const } : {}) });
    }
    case 'MISS': {
      // SD-31: a missed field goal (2 or 3; 3×3: 1 or 2) — logged for FGA /
      // FG% / EFF only; the score doesn't move.
      if (!a.side || isPlayerOut(s, name)) return s;
      const pts = Number(a.payload?.points ?? 2);
      return push(s, { minute, type: 'miss', side: a.side, playerName: name, points: pts }, quarter);
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
      // SD-117 (B12): a rule-forced ejection carries its reason (new logs only).
      return a.side && name && !isEjected(s, name)
        ? push(s, { minute, type: 'eject', side: a.side, playerName: name, ...(isDqReason(a.payload?.reason) ? { reason: a.payload.reason } : {}) }, quarter)
        : s;
    case 'SET_LINEUP': {
      const home = (a.payload?.home as string[] | undefined) ?? s.onCourt?.home ?? [];
      const away = (a.payload?.away as string[] | undefined) ?? s.onCourt?.away ?? [];
      const ids = a.payload?.ids as Record<string, string> | undefined;
      return withIds({ ...s, onCourt: { home, away } }, ids && typeof ids === 'object' ? Object.entries(ids) : []);
    }
    case 'SUB': {
      // Record a substitution (off → on). If a starting five is set, keep the
      // on-court list in sync via onCourtNames (derived, not stored per-sub).
      const offName = String(a.payload?.offName ?? '');
      const onName = String(a.payload?.onName ?? '');
      if (!a.side || !offName || !onName) return s;
      return withIds(push(s, { minute, type: 'sub', side: a.side, playerName: offName, onName }, quarter), [[offName, a.payload?.offId], [onName, a.payload?.onId]]);
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
