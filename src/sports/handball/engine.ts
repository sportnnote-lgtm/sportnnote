/**
 * Handball (IHF) — the PURE scoring core (SD-102). No React / React Native, so
 * node tests, corrections (#05 AMEND replays) and the device all derive the
 * same match from the same log. Modelled on hockey (SD-101).
 *
 * Rules modelled (IHF Rules of the Game, indoor handball):
 *  - Rule 2:1 — 2 × 30 minutes (youth: 2 × 25 for 12–16, 2 × 20 for 8–12); a
 *    running game clock the timekeeper stops for time-outs (2:9). Handball
 *    clocks count UP over the whole match (31:15 = 1:15 into the 2nd half).
 *    Events carry the game-clock second (`sec`), so a 2-minute suspension runs
 *    on playing time.
 *  - Rule 2:2 — a match that must have a winner and is level after regular
 *    time goes to extra time, 2 × 5 minutes; level again → a second extra
 *    time (2 × 5); level again → 7-metre throwing (5 each, then one each
 *    until decided). The organiser picks how far that goes (`decider`).
 *  - Rule 2:10 — team time-out: 3 per team in regular time, at most 2 per
 *    half, at most 1 in the last 5 minutes, none in extra time. The clock stops.
 *  - Rule 16 — sanctions: warning (yellow, no time), 2-minute suspension (the
 *    team plays a player short for 2 minutes of playing time), the 3rd
 *    suspension of the same player = disqualification (16:6d), disqualification
 *    (red; the player is out, the team short for 2 minutes — 16:8), blue card =
 *    a disqualification with a written report (16:8 comment). Team officials can
 *    be warned, suspended (the team plays short 2 minutes) or disqualified.
 *  - Rule 14 — 7-metre throws: scored, saved (the keeper's save) or missed.
 *  - Shots by type (IHF match statistics): 6 m, 9 m, wing, breakthrough, fast
 *    break, 7 m; goals, saved / missed / blocked attempts, assists, technical
 *    faults, steals and blocks.
 *
 * Every credit a live action writes on a stat line comes from `eventCredits`
 * (the controls build the attribution from it, and `handballTotals` sums it
 * over the state), so the absolute statTotals equal the live increments (SD-19).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';

export type Side = 'home' | 'away';
export type ShotType = 'sixM' | 'nineM' | 'wing' | 'breakthrough' | 'fastBreak' | 'sevenM';
/** an attempt that didn't score: saved by the keeper, missed (wide / post /
 *  over), or blocked by a defender */
export type MissResult = 'saved' | 'missed' | 'blocked';
export type Sanction = 'yellow' | 'twoMin' | 'red';
/** what a level match does at the end of regular time (IHF 2:2) */
export type Decider = 'none' | 'shootout' | 'et' | 'et2';

export const SHOT_TYPES: ShotType[] = ['sixM', 'nineM', 'wing', 'breakthrough', 'fastBreak', 'sevenM'];
export const SHOT_LABEL: Record<ShotType, string> = {
  sixM: '6 m', nineM: '9 m', wing: 'Wing', breakthrough: 'Breakthrough', fastBreak: 'Fast break', sevenM: '7 m',
};

export interface Who { id?: string; name?: string }

export interface HandballEvent {
  /** stable id from the action (`payload.uid`) */
  id: string;
  type: 'goal' | 'miss' | 'save' | 'block' | 'turnover' | 'steal' | 'card' | 'timeout' | 'sub' | 'gk';
  side: Side;
  /** game-clock seconds since the start of the match (playing time) */
  sec: number;
  period: number;
  /** scorer / shooter / keeper / blocker / player at fault / stealer /
   *  sanctioned player / sub off / new keeper */
  playerId?: string;
  playerName?: string;
  /** assist (goal) / sub on */
  secondId?: string;
  secondName?: string;
  shotType?: ShotType;
  /** miss: how the attempt ended */
  result?: MissResult;
  card?: Sanction;
  /** a 2-minute suspension that is the player's 3rd → disqualification (16:6d) */
  third?: boolean;
  /** a disqualification with a written report (blue card, 16:8) */
  blue?: boolean;
  /** a team official's sanction (the name, or 'Team official') */
  official?: string;
  /** save / block / steal: the attempt or turnover (its id) it answers */
  ref?: string;
}

export interface SoThrow { scored: boolean; playerId?: string; playerName?: string }

export interface XiStamp {
  players?: { id: string; name: string }[];
  gk?: { id: string; name: string };
}

export interface HandballState {
  home: number;
  away: number;
  /** the period in play (1-based; extra-time halves follow the regular ones) */
  period: number;
  /** regular periods (2 halves) */
  periods: number;
  periodMinutes: number;
  /** extra-time half length (IHF: 5) */
  etMinutes: number;
  /** extra-time rounds started (each = 2 halves) */
  etRounds: number;
  clock: { ms: number; since?: number };
  played: number[];
  ended: boolean;
  events: HandballEvent[];
  seq: number;
  playersPerSide: number;
  decider: Decider;
  /** the clock stops by itself on a 2-minute suspension and a disqualification (2:9) */
  stopClock: boolean;
  shootout: { home: SoThrow[]; away: SoThrow[]; first: Side } | null;
  shootoutWinner?: Side;
  xi?: { home?: XiStamp; away?: XiStamp };
}

/* --------------------------------- format ---------------------------------- */

export const HANDBALL_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  senior: { label: 'Senior 2 × 30', set: { playersPerSide: 7, periodMinutes: 30 } },
  youth25: { label: 'Youth 2 × 25 (12–16)', set: { playersPerSide: 7, periodMinutes: 25 } },
  youth20: { label: 'Youth 2 × 20 (8–12)', set: { playersPerSide: 7, periodMinutes: 20 } },
};

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);

export const init = (config?: Record<string, unknown>): HandballState => {
  const d = config?.decider;
  const decider: Decider = d === 'shootout' || d === 'et' || d === 'et2' ? d : 'none';
  return {
    home: 0, away: 0, period: 1, periods: 2,
    periodMinutes: Math.max(1, Number(config?.periodMinutes ?? 30) || 30),
    etMinutes: Math.max(1, Number(config?.etMinutes ?? 5) || 5),
    etRounds: 0,
    clock: { ms: 0 }, played: [], ended: false, events: [], seq: 0,
    playersPerSide: Math.max(1, Number(config?.playersPerSide ?? 7) || 7),
    decider,
    stopClock: bool(config?.stopClock, true),
    shootout: null,
  };
};

/* ---------------------------------- clock ---------------------------------- */

/** Nominal length (seconds) of period `p`: a regular half or an extra-time half. */
export const periodLen = (s: Pick<HandballState, 'periods' | 'periodMinutes' | 'etMinutes'>, p: number): number =>
  (p <= s.periods ? s.periodMinutes : s.etMinutes) * 60;
/** Game seconds before period `p` starts (nominal lengths, as IHF reports count). */
export function periodOffset(s: HandballState, p = s.period): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += periodLen(s, i);
  return t;
}
/** Seconds played in the current period at `now` (held at the period's end). */
export function periodSec(s: HandballState, now = 0): number {
  const ms = s.clock.ms + (s.clock.since && now ? Math.max(0, now - s.clock.since) : 0);
  return Math.min(periodLen(s, s.period), Math.floor(ms / 1000));
}
export const matchSec = (s: HandballState, now = 0): number => periodOffset(s) + periodSec(s, now);
export const running = (s: HandballState): boolean => !!s.clock.since && !s.ended;
export const periodStarted = (s: HandballState): boolean => s.clock.ms > 0 || !!s.clock.since;
/** "mm:ss" of a game-clock second (handball counts up: 31:15). */
export const clockText = (sec: number): string => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** The clock face: elapsed MATCH time, as handball scoreboards show. */
export const clockFace = (s: HandballState, now = 0): string => clockText(matchSec(s, now));
/** Total periods so far (regular + the extra-time halves started). */
export const totalPeriods = (s: Pick<HandballState, 'periods' | 'etRounds'>): number => s.periods + 2 * s.etRounds;
export const isExtraTime = (s: Pick<HandballState, 'periods'>, p: number): boolean => p > s.periods;
/** "H1" / "H2" / "ET1" … (each extra time has two halves: ET1, ET2 = 1st extra time). */
export function periodName(s: Pick<HandballState, 'periods'>, p: number): string {
  return p <= s.periods ? (s.periods === 2 ? `H${p}` : `P${p}`) : `ET${p - s.periods}`;
}
export function periodLong(s: Pick<HandballState, 'periods'>, p: number): string {
  if (p <= s.periods) return s.periods === 2 ? (p === 1 ? '1st half' : '2nd half') : `Period ${p}`;
  const k = p - s.periods; // 1..4
  return `${k <= 2 ? '1st' : '2nd'} extra time · ${k % 2 === 1 ? '1st' : '2nd'} half`;
}

const stopAt = (s: HandballState, at: number): HandballState['clock'] =>
  s.clock.since ? { ms: s.clock.ms + Math.max(0, at - s.clock.since) } : s.clock;

/** How many extra-time rounds the decider allows (IHF 2:2). */
export const maxEtRounds = (d: Decider): number => (d === 'et2' ? 2 : d === 'et' ? 1 : 0);

/* ------------------------------- team time-out ------------------------------ */

/** IHF 2:10 — can `side` take a team time-out now? 3 in regular time, at most
 *  2 per half, at most 1 in the last 5 minutes of regular time, none in extra
 *  time. `used` counts the side's time-outs. */
export function timeoutCheck(s: HandballState, side: Side, now = 0): { ok: boolean; used: number; left: number; reason?: string } {
  const mine = s.events.filter((e) => e.type === 'timeout' && e.side === side);
  const used = mine.length;
  const left = Math.max(0, 3 - used);
  if (s.ended) return { ok: false, used, left, reason: 'The match is over.' };
  if (isExtraTime(s, s.period)) return { ok: false, used, left, reason: 'No team time-outs in extra time.' };
  if (used >= 3) return { ok: false, used, left, reason: 'All 3 team time-outs used.' };
  if (mine.filter((e) => e.period === s.period).length >= 2) return { ok: false, used, left, reason: 'At most 2 team time-outs a half.' };
  const regEnd = s.periods * s.periodMinutes * 60;
  const t = matchSec(s, now);
  if (s.period === s.periods && t >= regEnd - 300 && mine.some((e) => e.sec >= regEnd - 300)) {
    return { ok: false, used, left, reason: 'Only 1 team time-out in the last 5 minutes.' };
  }
  return { ok: true, used, left };
}

/* --------------------------------- credits --------------------------------- */

/** Goal / attempt keys per shot type (7 m: sevenMGoals / sevenMTaken). */
export const GOAL_KEY: Record<ShotType, string> = {
  sixM: 'sixMGoals', nineM: 'nineMGoals', wing: 'wingGoals', breakthrough: 'breakthroughGoals', fastBreak: 'fastBreakGoals', sevenM: 'sevenMGoals',
};
export const SHOT_KEY: Record<ShotType, string> = {
  sixM: 'sixMShots', nineM: 'nineMShots', wing: 'wingShots', breakthrough: 'breakthroughShots', fastBreak: 'fastBreakShots', sevenM: 'sevenMTaken',
};
/** IHF suspensions (SD-15 schema `suspension`; FIELD_RULES.handball). */
export const SUSPENSION_MINUTES = 2;
/** Every key a live handball action credits (statTotals owns all of them). */
export const LIVE_KEYS = [
  'goals', 'shots', ...Object.values(GOAL_KEY), ...Object.values(SHOT_KEY), 'assists', 'saves', 'sevenMSaves', 'blocks',
  'technicalFaults', 'steals', 'yellowCards', 'twoMinutes', 'redCards', 'blueCards', 'soTaken', 'soGoals',
] as const;

type Credit = { playerId: string; playerName?: string; stats: Record<string, number> };

/** The stat-line credits one event writes: [primary player, second player]. */
export function eventCredits(e: Pick<HandballEvent, 'type' | 'playerId' | 'playerName' | 'secondId' | 'secondName' | 'shotType' | 'result' | 'card' | 'third' | 'blue' | 'official'>): { first?: Credit; second?: Credit } {
  // every credit is to a player of the event's own side (a save, a block and a
  // steal are their own events on the defending side)
  const p = (stats: Record<string, number>) => (e.playerId && !e.official ? { playerId: e.playerId, playerName: e.playerName, stats } : undefined);
  const q = (stats: Record<string, number>) => (e.secondId ? { playerId: e.secondId, playerName: e.secondName, stats } : undefined);
  const t = e.shotType ?? 'nineM';
  switch (e.type) {
    case 'goal':
      return { first: p({ goals: 1, shots: 1, [GOAL_KEY[t]]: 1, [SHOT_KEY[t]]: 1 }), second: t === 'sevenM' ? undefined : q({ assists: 1 }) };
    case 'miss':
      return { first: p({ shots: 1, [SHOT_KEY[t]]: 1 }) };
    case 'save':
      return { first: p(t === 'sevenM' ? { saves: 1, sevenMSaves: 1 } : { saves: 1 }) };
    case 'block':
      return { first: p({ blocks: 1 }) };
    case 'turnover':
      return { first: p({ technicalFaults: 1 }) };
    case 'steal':
      return { first: p({ steals: 1 }) };
    case 'card':
      if (e.card === 'yellow') return { first: p({ yellowCards: 1 }) };
      if (e.card === 'red') return { first: p(e.blue ? { redCards: 1, blueCards: 1 } : { redCards: 1 }) };
      return { first: p(e.third ? { twoMinutes: 1, redCards: 1 } : { twoMinutes: 1 }) };
    default:
      return {};
  }
}

/** Credits → the action's `attribution` / `attribution2` (sign −1 reverses). */
export function creditAttribution(c: Credit | undefined, sign = 1, tracked?: string[]): Attribution | undefined {
  if (!c) return undefined;
  const entries = Object.entries(c.stats);
  if (!entries.length) return undefined;
  const [[stat, by], ...rest] = entries;
  return {
    playerId: c.playerId, stat, by: by * sign, ...(c.playerName ? { playerName: c.playerName } : {}),
    ...(rest.length ? { extra: Object.fromEntries(rest.map(([k, v]) => [k, v * sign])) } : {}),
    ...(tracked ? { tracked } : {}),
  };
}

const second = (a: ScoreAction): Attribution | undefined =>
  a.attribution2 ?? (a.payload?._attr2 as Attribution | undefined);

/** How many 2-minute suspensions a player already has (the next one's number − 1). */
export function suspensionsOf(s: HandballState, side: Side, who: Who): number {
  return s.events.filter((e) => e.type === 'card' && e.card === 'twoMin' && e.side === side && !e.official
    && ((who.id && e.playerId === who.id) || (!who.id && who.name && e.playerName === who.name))).length;
}
/** Has the player had a warning already (IHF: one yellow per player)? */
export const hasYellow = (s: HandballState, side: Side, who: Who): boolean =>
  s.events.some((e) => e.type === 'card' && e.card === 'yellow' && e.side === side && !e.official && ((who.id && e.playerId === who.id) || (!who.id && who.name && e.playerName === who.name)));
/** Warnings a team has had (IHF 16:2 comment: at most 3 for the players, 1 for the officials). */
export const teamYellows = (s: HandballState, side: Side, officials = false): number =>
  s.events.filter((e) => e.type === 'card' && e.card === 'yellow' && e.side === side && !!e.official === officials).length;

/* -------------------------------- shoot-out -------------------------------- */

/** IHF 2:2 — 7-metre throwing: 5 each alternately, decided as soon as a side
 *  can't catch up; then one each until a side leads after equal throws. */
export function decideShootout(h: SoThrow[], a: SoThrow[]): Side | undefined {
  const hs = h.filter((k) => k.scored).length;
  const as = a.filter((k) => k.scored).length;
  if (h.length <= 5 && a.length <= 5) {
    if (hs > as + Math.max(0, 5 - a.length)) return 'home';
    if (as > hs + Math.max(0, 5 - h.length)) return 'away';
  }
  if (h.length === a.length && h.length >= 5 && hs !== as) return hs > as ? 'home' : 'away';
  return undefined;
}
/** Whose throw: alternate, the team that won the toss first in every round. */
export function nextThrower(so: NonNullable<HandballState['shootout']>): Side {
  const n = so.home.length + so.away.length;
  const other: Side = so.first === 'home' ? 'away' : 'home';
  const behind: Side | undefined = so.home.length < so.away.length ? 'home' : so.away.length < so.home.length ? 'away' : undefined;
  return behind ?? (n % 2 === 0 ? so.first : other);
}
export const soScore = (s: Pick<HandballState, 'shootout'>) => ({
  home: s.shootout?.home.filter((k) => k.scored).length ?? 0,
  away: s.shootout?.away.filter((k) => k.scored).length ?? 0,
});

/* --------------------------------- reducer --------------------------------- */

const SO_ACTIONS = new Set(['START_SHOOTOUT', 'SO', 'XI', 'STAT_ADJUST', 'REMOVE_EVENT', 'END']);
const shotTypeOf = (v: unknown): ShotType => (SHOT_TYPES.includes(v as ShotType) ? (v as ShotType) : 'nineM');

export const reducer = (s: HandballState, a: ScoreAction): HandballState => {
  if (s.ended && !SO_ACTIONS.has(a.type)) return s;
  const at = Number(a.payload?.at ?? 0);
  const sec = typeof a.payload?.sec === 'number' ? Math.max(0, a.payload.sec as number) : matchSec(s, at);
  const period = typeof a.payload?.period === 'number' ? (a.payload.period as number) : s.period;
  const uid = typeof a.payload?.uid === 'string' && a.payload.uid ? (a.payload.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const p1 = a.attribution;
  const p2 = second(a);
  const push = (st: HandballState, e: Omit<HandballEvent, 'id' | 'sec' | 'period'>): HandballState =>
    ({ ...st, seq: st.seq + 1, events: [...st.events, { id: uid, sec, period, ...e } as HandballEvent] });
  // the player comes from the attribution, or (no stat credited) the payload
  const pid = p1?.playerId ?? (typeof a.payload?.playerId === 'string' ? (a.payload.playerId as string) : undefined);
  const pname = p1?.playerName ?? (typeof a.payload?.playerName === 'string' ? (a.payload.playerName as string) : undefined);
  const who1 = pid ? { playerId: pid, ...(pname ? { playerName: pname } : {}) } : pname ? { playerName: pname } : {};
  const who2 = p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {};
  const ref = typeof a.payload?.ref === 'string' && a.payload.ref ? { ref: a.payload.ref as string } : {};
  const edit = !!a.payload?.edit;
  switch (a.type) {
    case 'CLOCK': {
      if (a.payload?.run) return s.clock.since ? s : { ...s, clock: { ms: s.clock.ms, since: at || 1 } };
      return { ...s, clock: stopAt(s, at) };
    }
    case 'SET_CLOCK': {
      const v = Math.max(0, Math.min(periodLen(s, s.period), Number(a.payload?.periodSec ?? 0)));
      return { ...s, clock: { ms: v * 1000, ...(s.clock.since ? { since: at || s.clock.since } : {}) } };
    }
    case 'XI': {
      const team = a.payload?.team;
      if (team !== 'home' && team !== 'away') return s;
      const players = Array.isArray(a.payload?.players)
        ? (a.payload!.players as { id?: string; name?: string }[]).filter((x) => x?.id).map((x) => ({ id: String(x.id), name: String(x.name ?? '') }))
        : undefined;
      const gk = a.payload?.gk as { id?: string; name?: string } | undefined;
      const stamp: XiStamp = { ...(players ? { players } : {}), ...(gk?.id ? { gk: { id: String(gk.id), name: String(gk.name ?? '') } } : {}) };
      return { ...s, xi: { ...s.xi, [team]: stamp } };
    }
    case 'GOAL': {
      if (!side) return s;
      const shotType = shotTypeOf(a.payload?.shotType);
      const scored = { ...s, [side]: s[side] + 1 } as HandballState;
      return push(scored, { type: 'goal', side, shotType, ...who1, ...(shotType === 'sevenM' ? {} : who2) });
    }
    case 'MISS': {
      // an attempt that didn't score (the keeper's save / a block is its own action)
      if (!side) return s;
      const r = a.payload?.result;
      const result: MissResult = r === 'saved' || r === 'blocked' ? r : 'missed';
      return push(s, { type: 'miss', side, shotType: shotTypeOf(a.payload?.shotType), result, ...who1 });
    }
    case 'SAVE': {
      // the keeper's save (side = the keeper's team), linked to the attempt
      if (!side) return s;
      return push(s, { type: 'save', side, shotType: shotTypeOf(a.payload?.shotType), ...who1, ...ref });
    }
    case 'BLOCK': {
      if (!side) return s;
      return push(s, { type: 'block', side, ...who1, ...ref });
    }
    case 'TURNOVER': {
      if (!side) return s;
      return push(s, { type: 'turnover', side, ...who1 });
    }
    case 'STEAL': {
      if (!side) return s;
      return push(s, { type: 'steal', side, ...who1, ...ref });
    }
    case 'CARD': {
      if (!side) return s;
      const c = a.payload?.card;
      const card: Sanction = c === 'yellow' || c === 'red' ? c : 'twoMin';
      const official = typeof a.payload?.official === 'string' ? (a.payload.official as string) || 'Team official' : a.payload?.official === true ? 'Team official' : undefined;
      const next = push(s, {
        type: 'card', side, card, ...(official ? { official, playerName: official } : who1),
        // the 3rd suspension's flag is stored by the scorer's device (the credit
        // it wrote), so a replay after a correction credits the same
        ...(card === 'twoMin' && a.payload?.third === true && !official ? { third: true } : {}),
        ...(card === 'red' && a.payload?.blue === true ? { blue: true } : {}),
      });
      // IHF 2:9: time-out is mandatory for a suspension / disqualification
      return card !== 'yellow' && s.stopClock && !edit ? { ...next, clock: stopAt(next, at) } : next;
    }
    case 'TIMEOUT': {
      // a team time-out (2:10): the clock stops
      if (!side) return s;
      const next = push(s, { type: 'timeout', side });
      return edit ? next : { ...next, clock: stopAt(next, at) };
    }
    case 'SUB': {
      if (!side) return s;
      const off = { id: a.payload?.offId as string | undefined, name: a.payload?.offName as string | undefined };
      const on = { id: a.payload?.onId as string | undefined, name: a.payload?.onName as string | undefined };
      if (!off.name && !on.name && !off.id && !on.id) return s;
      return push(s, {
        type: 'sub', side,
        ...(off.id ? { playerId: off.id } : {}), ...(off.name ? { playerName: off.name } : {}),
        ...(on.id ? { secondId: on.id } : {}), ...(on.name ? { secondName: on.name } : {}),
      });
    }
    case 'GK': {
      if (!side || !a.payload?.id) return s;
      return push(s, { type: 'gk', side, playerId: String(a.payload.id), playerName: String(a.payload.name ?? '') });
    }
    case 'REMOVE_EVENT': {
      const id = String(a.payload?.id ?? '');
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e !== ev) };
      if (ev.type === 'goal') return { ...next, [ev.side]: Math.max(0, next[ev.side] - 1) } as HandballState;
      return next;
    }
    case 'END_PERIOD': {
      const clock = stopAt(s, at);
      const len = clock.ms > 0 ? Math.min(periodLen(s, s.period), Math.floor(clock.ms / 1000)) : periodLen(s, s.period);
      const played = [...s.played.slice(0, s.period - 1), len];
      if (s.period < totalPeriods(s)) return { ...s, played, period: s.period + 1, clock: { ms: 0 } };
      // the end of regular time / an extra time: level + a decider with
      // extra time left → the next extra time (IHF 2:2)
      if (s.home === s.away && s.etRounds < maxEtRounds(s.decider)) {
        return { ...s, played, etRounds: s.etRounds + 1, period: s.period + 1, clock: { ms: 0 } };
      }
      return { ...s, played, clock: { ms: periodLen(s, s.period) * 1000 }, ended: true };
    }
    case 'END':
      return s.ended ? s : { ...s, ended: true, clock: stopAt(s, at) };
    case 'START_SHOOTOUT': {
      if (!s.ended || s.home !== s.away || s.shootout || s.decider === 'none') return s;
      return { ...s, shootout: { home: [], away: [], first: a.payload?.first === 'away' ? 'away' : 'home' } };
    }
    case 'SO': {
      if (!s.shootout || s.shootoutWinner || !side) return s;
      const kick: SoThrow = { scored: a.payload?.scored === true, ...(p1?.playerId ? { playerId: p1.playerId } : {}), ...(p1?.playerName ? { playerName: p1.playerName } : {}) };
      const so = { ...s.shootout, [side]: [...s.shootout[side], kick] };
      return { ...s, shootout: so, shootoutWinner: decideShootout(so.home, so.away) };
    }
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ----------------------------- derived figures ----------------------------- */

export const isComplete = (s: HandballState): boolean =>
  s.ended && (s.home !== s.away || s.decider === 'none' || s.shootoutWinner != null);

export function result(s: HandballState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  const winner = s.home > s.away ? 'home' : s.away > s.home ? 'away' : (s.shootoutWinner ?? 'draw');
  return { winner, home: s.home, away: s.away };
}

/** The goalkeeper on duty for a side at each moment: the line-up's GK, then
 *  each GK change and each sub that took the keeper off (the player coming on
 *  goes in goal). */
export function keeperAt(s: HandballState, side: Side, uptoIndex = s.events.length): Who | undefined {
  let gk: Who | undefined = s.xi?.[side]?.gk ? { id: s.xi[side]!.gk!.id, name: s.xi[side]!.gk!.name } : undefined;
  for (let i = 0; i < uptoIndex && i < s.events.length; i++) {
    const e = s.events[i];
    if (e.side !== side) continue;
    if (e.type === 'gk') gk = { id: e.playerId, name: e.playerName };
    else if (e.type === 'sub' && gk && ((e.playerId && e.playerId === gk.id) || (!e.playerId && e.playerName && e.playerName === gk.name))) {
      gk = e.secondId || e.secondName ? { id: e.secondId, name: e.secondName } : undefined;
    }
  }
  return gk;
}
export const currentKeeper = (s: HandballState, side: Side) => keeperAt(s, side);

/** A side's team figures (comparison panel) over a period scope. */
export interface HandballTeamFigures {
  goals: number; shots: number; saves: number; blocks: number; technicalFaults: number; steals: number;
  sevenMGoals: number; sevenMTaken: number;
  yellowCards: number; twoMinutes: number; redCards: number; blueCards: number; timeouts: number;
  /** goals / attempts per shot type */
  byType: Record<ShotType, { goals: number; shots: number }>;
}
export function teamFigures(s: HandballState, side: Side, scope: 'all' | number = 'all'): HandballTeamFigures {
  const byType = Object.fromEntries(SHOT_TYPES.map((t) => [t, { goals: 0, shots: 0 }])) as HandballTeamFigures['byType'];
  const f: HandballTeamFigures = { goals: 0, shots: 0, saves: 0, blocks: 0, technicalFaults: 0, steals: 0, sevenMGoals: 0, sevenMTaken: 0, yellowCards: 0, twoMinutes: 0, redCards: 0, blueCards: 0, timeouts: 0, byType };
  for (const e of s.events) {
    if (e.side !== side || (scope !== 'all' && e.period !== scope)) continue;
    const t = e.shotType ?? 'nineM';
    if (e.type === 'goal') { f.goals++; f.shots++; byType[t].goals++; byType[t].shots++; }
    else if (e.type === 'miss') { f.shots++; byType[t].shots++; }
    else if (e.type === 'save') f.saves++;
    else if (e.type === 'block') f.blocks++;
    else if (e.type === 'turnover') f.technicalFaults++;
    else if (e.type === 'steal') f.steals++;
    else if (e.type === 'timeout') f.timeouts++;
    else if (e.type === 'card') {
      if (e.card === 'yellow') f.yellowCards++;
      else if (e.card === 'twoMin') { f.twoMinutes++; if (e.third) f.redCards++; }
      else { f.redCards++; if (e.blue) f.blueCards++; }
    }
  }
  f.sevenMGoals = byType.sevenM.goals;
  f.sevenMTaken = byType.sevenM.shots;
  return f;
}

/** SD-20 — the line under the score: the 7-metre shoot-out ("SO 4–3"), ''
 *  otherwise (`perspective: 'away'` reads it from the away side). */
export function handballScoreLine(s: HandballState, perspective?: Side): string {
  if (!s?.shootout) return '';
  const so = soScore(s);
  return perspective === 'away' ? `SO ${so.away}–${so.home}` : `SO ${so.home}–${so.away}`;
}

/* --------------------------- live settings (#14) --------------------------- */

export const HANDBALL_LIVE_SETTINGS: LiveSettings<HandballState> = {
  title: '⚙️ Match settings',
  hint: 'Applies to this match only.',
  mode: 'config',
  fields: [
    { key: 'periodMinutes', label: 'Half length', type: 'number', default: 30, min: 1, max: 45, step: 1, hint: 'min / half' },
    { key: 'stopClock', label: 'Stop clock on suspensions', type: 'toggle', default: true, group: 'Clock' },
  ] as FormatField[],
  read: (s) => ({ periodMinutes: s.periodMinutes, stopClock: s.stopClock }),
  defaults: { periodMinutes: 30, stopClock: true },
};
