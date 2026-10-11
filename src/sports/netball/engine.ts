/**
 * Netball (World Netball) — the PURE scoring core (SD-146). No React / React
 * Native, so node tests, corrections (#05 AMEND replays) and the device all
 * derive the same match from the same log. Modelled on handball (SD-102).
 *
 * Rules modelled (World Netball, Rules of Netball 2024 edition — the numbers
 * the scorer meets; anything we couldn't confirm is an organiser option with
 * the standard default, marked "verify"):
 *  - Duration: 4 quarters of 15 minutes (international); school / junior
 *    presets 4 × 10 and 2 × 20 (halves). A running clock the umpires stop
 *    ("time") for injury / illness, blood, a tactical change and sanctions.
 *    Stamps carry the game-clock second (`sec`), so a suspension runs on
 *    playing time.
 *  - Teams: 7 on court — GS, GA, WA, C, WD, GD, GK. Only GS and GA may score
 *    (from inside the goal circle). Substitutions at any time (2024 change,
 *    after a 2-year trial) and position changes ("tactical change", 2024) at
 *    breaks or when time is held.
 *  - Centre pass: taken alternately throughout the match, starting with the
 *    team that won the toss; a quarter starts with the centre pass that is due.
 *    A goal scored as time expires leaves the next centre owed to the next
 *    quarter. The scorer can correct the order ("Centre: X") at any time.
 *  - Sanctions (2024: cautions removed): warning, suspension (the team plays a
 *    player short — 2 minutes of playing time, organiser option, verify),
 *    ordering off (no further part, not replaced).
 *  - Penalties (contact / obstruction) and the usual player statistics
 *    (feeds, goal assists, intercepts, deflections, rebounds, turnovers) as
 *    optional detail.
 *  - Extra time (knockouts): two halves of 7 minutes (organiser: 5 or 7); if
 *    still level, play continues until a team leads by two goals (World
 *    Netball) — or the first goal (golden goal, a common league variant).
 *  - Team time-outs are NOT in the international rules (verify); leagues that
 *    use them (e.g. 2 per half) set `timeoutsPerHalf`.
 *
 * Every credit a live action writes on a stat line comes from `eventCredits`
 * (the controls build the attribution from it, and `netballTotals` sums it
 * over the state), so the absolute statTotals equal the live increments (SD-19).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';

export type Side = 'home' | 'away';
export const POSITIONS = ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'] as const;
export type Pos = (typeof POSITIONS)[number];
export const SHOOTERS: Pos[] = ['GS', 'GA'];
export const POS_LONG: Record<Pos, string> = {
  GS: 'Goal shooter', GA: 'Goal attack', WA: 'Wing attack', C: 'Centre', WD: 'Wing defence', GD: 'Goal defence', GK: 'Goal keeper',
};
/** where each position may go (World Netball playing areas, 1 = attacking
 *  third, 2 = centre third, 3 = defending third; c = the circle). Shown only. */
export const POS_AREAS: Record<Pos, string> = {
  GS: 'attacking third + circle', GA: 'attacking + centre thirds + circle', WA: 'attacking + centre thirds (no circle)',
  C: 'all thirds (no circles)', WD: 'centre + defending thirds (no circle)', GD: 'centre + defending thirds + circle', GK: 'defending third + circle',
};

export type StatKind = 'intercept' | 'deflection' | 'rebound' | 'turnover';
export type PenaltyKind = 'contact' | 'obstruction' | 'other';
export type Sanction = 'warning' | 'suspension' | 'off';
export type StopReason = 'injury' | 'blood' | 'tactical' | 'other';
/** what a level match does at the end of regular time */
export type Decider = 'none' | 'et';
/** after extra time, still level: a 2-goal lead (World Netball) or golden goal */
export type EtThen = 'twoGoal' | 'golden';

export interface Who { id?: string; name?: string }

export interface NetballEvent {
  /** stable id from the action (`payload.uid`) */
  id: string;
  type: 'goal' | 'miss' | 'stat' | 'penalty' | 'sanction' | 'timeout' | 'stop' | 'sub' | 'pos' | 'centre';
  side?: Side;
  /** game-clock seconds since the start of the match (playing time) */
  sec: number;
  period: number;
  /** shooter / player credited / penalised / sanctioned / sub off / player moved */
  playerId?: string;
  playerName?: string;
  /** feeder (goal, miss) / sub on */
  secondId?: string;
  secondName?: string;
  /** goal / miss: the shooter's position (GS / GA); sub: the position the
   *  player coming on takes; pos: the new position */
  pos?: Pos;
  stat?: StatKind;
  penalty?: PenaltyKind;
  sanction?: Sanction;
  /** a suspension's length (minutes of playing time) */
  minutes?: number;
  reason?: StopReason;
  /** rebound: the missed attempt it answers */
  ref?: string;
  /** sanction for a team official (never a player line) */
  official?: string;
}

export interface XiStamp { pos: Partial<Record<Pos, { id: string; name: string }>> }

export interface NetballState {
  home: number;
  away: number;
  /** the period in play (1-based; extra-time halves and the play-on follow) */
  period: number;
  /** regular periods (4 quarters or 2 halves) */
  periods: number;
  periodMinutes: number;
  etMinutes: number;
  decider: Decider;
  etThen: EtThen;
  /** extra time started (2 halves) */
  et: boolean;
  /** still level after extra time: playing on until the lead (no clock limit) */
  playOn: boolean;
  clock: { ms: number; since?: number };
  played: number[];
  ended: boolean;
  events: NetballEvent[];
  seq: number;
  /** who took the first centre pass (after the toss) */
  firstCentre?: Side;
  /** minutes of playing time a suspension lasts (World Netball: 2 — verify) */
  suspensionMinutes: number;
  /** team time-outs a half (0 = none, the international rules) */
  timeoutsPerHalf: number;
  /** the clock stops by itself on a suspension / ordering off */
  stopClock: boolean;
  /** detail mode: ask for the feeder after a goal / attempt and the rebound after a miss */
  detail: boolean;
  xi?: { home?: XiStamp; away?: XiStamp };
}

/* --------------------------------- format ---------------------------------- */

export const NETBALL_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  international: { label: 'International 4 × 15', set: { periods: 4, periodMinutes: 15 } },
  school: { label: 'School 4 × 10', set: { periods: 4, periodMinutes: 10 } },
  halves: { label: 'Halves 2 × 20', set: { periods: 2, periodMinutes: 20 } },
};

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);
const numOr = (v: unknown, d: number, min = 0) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v != null ? Math.max(min, n) : d; };

export const init = (config?: Record<string, unknown>): NetballState => {
  const periods = Number(config?.periods) === 2 ? 2 : 4;
  return {
    home: 0, away: 0, period: 1, periods,
    periodMinutes: numOr(config?.periodMinutes, periods === 2 ? 20 : 15, 1),
    etMinutes: numOr(config?.etMinutes, 7, 1),
    decider: config?.decider === 'et' ? 'et' : 'none',
    etThen: config?.etThen === 'golden' ? 'golden' : 'twoGoal',
    et: false, playOn: false,
    clock: { ms: 0 }, played: [], ended: false, events: [], seq: 0,
    suspensionMinutes: numOr(config?.suspensionMinutes, 2, 1),
    timeoutsPerHalf: Math.floor(numOr(config?.timeoutsPerHalf, 0)),
    stopClock: bool(config?.stopClock, true),
    detail: bool(config?.detail, false),
  };
};

/* ---------------------------------- clock ---------------------------------- */

/** Nominal length (seconds) of period `p`; 0 = open (the play-on after extra time). */
export function periodLen(s: Pick<NetballState, 'periods' | 'periodMinutes' | 'etMinutes'>, p: number): number {
  if (p <= s.periods) return s.periodMinutes * 60;
  if (p <= s.periods + 2) return s.etMinutes * 60;
  return 0;
}
export const isOpen = (s: NetballState, p = s.period): boolean => periodLen(s, p) === 0;
export function periodOffset(s: NetballState, p = s.period): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += s.played[i - 1] ?? periodLen(s, i);
  return t;
}
/** Seconds played in the current period at `now` (held at the period's end). */
export function periodSec(s: NetballState, now = 0): number {
  const ms = s.clock.ms + (s.clock.since && now ? Math.max(0, now - s.clock.since) : 0);
  const sec = Math.floor(ms / 1000);
  const len = periodLen(s, s.period);
  return len ? Math.min(len, sec) : sec;
}
export const matchSec = (s: NetballState, now = 0): number => periodOffset(s) + periodSec(s, now);
export const running = (s: NetballState): boolean => !!s.clock.since && !s.ended;
export const periodStarted = (s: NetballState): boolean => s.clock.ms > 0 || !!s.clock.since;
export const clockText = (sec: number): string => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** The clock face: time LEFT in the quarter (netball clocks count down); the
 *  play-on after extra time counts up. */
export function clockFace(s: NetballState, now = 0): string {
  const len = periodLen(s, s.period);
  return len ? clockText(Math.max(0, len - periodSec(s, now))) : `+${clockText(periodSec(s, now))}`;
}
export const timeUp = (s: NetballState, now = 0): boolean => { const len = periodLen(s, s.period); return !!len && periodSec(s, now) >= len; };
export const totalPeriods = (s: Pick<NetballState, 'periods' | 'et' | 'playOn'>): number => s.periods + (s.et ? 2 : 0) + (s.playOn ? 1 : 0);
export const isExtraTime = (s: Pick<NetballState, 'periods'>, p: number): boolean => p > s.periods;
/** "Q1" … "Q4" / "H1" "H2", "ET1" "ET2", "PO" (play-on). */
export function periodName(s: Pick<NetballState, 'periods'>, p: number): string {
  if (p <= s.periods) return s.periods === 2 ? `H${p}` : `Q${p}`;
  return p <= s.periods + 2 ? `ET${p - s.periods}` : 'PO';
}
export function periodLong(s: Pick<NetballState, 'periods' | 'etThen'>, p: number): string {
  if (p <= s.periods) return s.periods === 2 ? (p === 1 ? '1st half' : '2nd half') : `${['1st', '2nd', '3rd', '4th'][p - 1] ?? `${p}th`} quarter`;
  if (p <= s.periods + 2) return `Extra time · ${p - s.periods === 1 ? '1st' : '2nd'} half`;
  return s.etThen === 'golden' ? 'Golden goal' : 'Play on · 2-goal lead';
}
/** Seconds into its own period an event happened (for "Q2 07:32" stamps). */
export const secInPeriod = (s: NetballState, e: Pick<NetballEvent, 'sec' | 'period'>): number => Math.max(0, e.sec - periodOffset(s, e.period));

const stopAt = (s: NetballState, at: number): NetballState['clock'] =>
  s.clock.since ? { ms: s.clock.ms + Math.max(0, at - s.clock.since) } : s.clock;

/** The lead a play-on goal needs to end the match. */
export const playOnLead = (s: Pick<NetballState, 'etThen'>): number => (s.etThen === 'golden' ? 1 : 2);

/* ------------------------------- team time-out ------------------------------ */

/** Which half a period is in (quarters 1–2 = 1st half). */
const halfOf = (s: NetballState, p: number): number => (s.periods === 2 ? p : p <= 2 ? 1 : 2);

/** A league's team time-outs (`timeoutsPerHalf`; none in extra time). */
export function timeoutCheck(s: NetballState, side: Side): { ok: boolean; used: number; left: number; reason?: string } {
  const per = s.timeoutsPerHalf;
  const half = halfOf(s, s.period);
  const mine = s.events.filter((e) => e.type === 'timeout' && e.side === side && !isExtraTime(s, e.period) && halfOf(s, e.period) === half);
  const used = mine.length;
  const left = Math.max(0, per - used);
  if (per <= 0) return { ok: false, used, left, reason: 'No team time-outs in this format.' };
  if (s.ended) return { ok: false, used, left, reason: 'The match is over.' };
  if (isExtraTime(s, s.period)) return { ok: false, used, left, reason: 'No team time-outs in extra time.' };
  if (left <= 0) return { ok: false, used, left, reason: `${per} a half used.` };
  return { ok: true, used, left };
}

/* --------------------------------- positions -------------------------------- */

const same = (a: Who | undefined, b: Who | undefined): boolean =>
  !!a && !!b && ((!!a.id && a.id === b.id) || (!a.id && !b.id && !!a.name && a.name === b.name) || (!!a.id && !b.id && !!b.name && a.name === b.name) || (!a.id && !!b.id && !!a.name && a.name === b.name));

export type Lineup = Partial<Record<Pos, Who>>;
const posOf = (l: Lineup, w: Who): Pos | undefined => POSITIONS.find((p) => same(l[p], w));

/** Who plays where for a side after the first `upto` events: the line-up
 *  stamp, then subs (the player coming on takes the position), position
 *  changes (a swap when the new position is taken) and orderings off (the
 *  position stays empty). A suspended player keeps the position (the team
 *  plays without it until the player is back). */
export function lineupAt(s: NetballState, side: Side, upto = s.events.length): Lineup {
  const l: Lineup = {};
  for (const p of POSITIONS) { const w = s.xi?.[side]?.pos?.[p]; if (w) l[p] = { id: w.id, name: w.name }; }
  for (let i = 0; i < upto && i < s.events.length; i++) {
    const e = s.events[i];
    if (e.side !== side) continue;
    if (e.type === 'sub') {
      const off: Who | undefined = e.playerId || e.playerName ? { id: e.playerId, name: e.playerName } : undefined;
      const on: Who = { id: e.secondId, name: e.secondName };
      const from = off ? posOf(l, off) : undefined;
      const to = e.pos ?? from;
      if (from) delete l[from];
      if (to) {
        const occupant = l[to];
        if (occupant && from && from !== to) l[from] = occupant;
        l[to] = on;
      }
    } else if (e.type === 'pos' && e.pos) {
      const who: Who = { id: e.playerId, name: e.playerName };
      const from = posOf(l, who);
      const occupant = l[e.pos];
      if (from === e.pos) continue;
      if (from) delete l[from];
      if (occupant && from) l[from] = occupant;
      l[e.pos] = who;
    } else if (e.type === 'sanction' && e.sanction === 'off' && !e.official) {
      const p = posOf(l, { id: e.playerId, name: e.playerName });
      if (p) delete l[p];
    }
  }
  return l;
}
export const positionOf = (s: NetballState, side: Side, who: Who): Pos | undefined => posOf(lineupAt(s, side), who);

/* --------------------------------- credits --------------------------------- */

/** The stat key each event kind credits. */
export const STAT_KEY: Record<StatKind, string> = { intercept: 'intercepts', deflection: 'deflections', rebound: 'rebounds', turnover: 'turnovers' };
export const PENALTY_KEY: Record<PenaltyKind, string | undefined> = { contact: 'contacts', obstruction: 'obstructions', other: undefined };
export const SANCTION_KEY: Record<Sanction, string> = { warning: 'warnings', suspension: 'suspensions', off: 'orderedOff' };
/** Every key a live netball action credits (statTotals owns all of them). */
export const LIVE_KEYS = [
  'goals', 'attempts', 'goalAssists', 'feeds', 'intercepts', 'deflections', 'rebounds', 'turnovers',
  'penaltiesConceded', 'contacts', 'obstructions', 'warnings', 'suspensions', 'orderedOff',
] as const;

type Credit = { playerId: string; playerName?: string; stats: Record<string, number> };

/** The stat-line credits one event writes: [primary player, second player]. */
export function eventCredits(e: Pick<NetballEvent, 'type' | 'playerId' | 'playerName' | 'secondId' | 'secondName' | 'stat' | 'penalty' | 'sanction' | 'official'>): { first?: Credit; second?: Credit } {
  const p = (stats: Record<string, number>) => (e.playerId && !e.official ? { playerId: e.playerId, playerName: e.playerName, stats } : undefined);
  const q = (stats: Record<string, number>) => (e.secondId ? { playerId: e.secondId, playerName: e.secondName, stats } : undefined);
  switch (e.type) {
    case 'goal': return { first: p({ goals: 1, attempts: 1 }), second: q({ goalAssists: 1, feeds: 1 }) };
    case 'miss': return { first: p({ attempts: 1 }), second: q({ feeds: 1 }) };
    case 'stat': return e.stat ? { first: p({ [STAT_KEY[e.stat]]: 1 }) } : {};
    case 'penalty': {
      const k = PENALTY_KEY[e.penalty ?? 'other'];
      return { first: p(k ? { penaltiesConceded: 1, [k]: 1 } : { penaltiesConceded: 1 }) };
    }
    case 'sanction': return e.sanction ? { first: p({ [SANCTION_KEY[e.sanction]]: 1 }) } : {};
    default: return {};
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

const second = (a: ScoreAction): Attribution | undefined => a.attribution2 ?? (a.payload?._attr2 as Attribution | undefined);

/** Sanctions a player has had (the next one's escalation hint). */
export function sanctionsOf(s: NetballState, side: Side, who: Who): { warnings: number; suspensions: number } {
  const mine = s.events.filter((e) => e.type === 'sanction' && e.side === side && !e.official && same({ id: e.playerId, name: e.playerName }, who));
  return { warnings: mine.filter((e) => e.sanction === 'warning').length, suspensions: mine.filter((e) => e.sanction === 'suspension').length };
}

/* ------------------------------ centre pass --------------------------------- */

export const other = (x: Side): Side => (x === 'home' ? 'away' : 'home');

export interface CentreInfo {
  /** whose centre pass restarts play now (after the last goal / at the quarter start) */
  now?: Side;
  /** centre passes taken (incl. the one in play) */
  taken: { home: number; away: number };
  /** goals scored by the side whose centre it was (centre-pass conversion) */
  cpGoals: { home: number; away: number };
  /** goals scored against the centre (a gain / turnover goal) */
  gainGoals: { home: number; away: number };
}

/** World Netball: centre passes alternate through the match; a quarter starts
 *  with the one that is due. A goal at the buzzer leaves its centre owed to
 *  the next quarter (no centre was taken after it). A scorer's 'centre' event
 *  overrides the order from that point. */
export function centreInfo(s: NetballState): CentreInfo {
  const out: CentreInfo = { taken: { home: 0, away: 0 }, cpGoals: { home: 0, away: 0 }, gainGoals: { home: 0, away: 0 } };
  let due: Side | undefined = s.firstCentre;
  let owed = true;
  let last: Side | undefined;
  for (let p = 1; p <= s.period; p++) {
    if (p > 1 && !owed && last) { due = other(last); owed = true; }
    let lastGoal: NetballEvent | undefined;
    for (const e of s.events) {
      if (e.period !== p) continue;
      if (e.type === 'centre' && e.side) { due = e.side; owed = true; continue; }
      if (e.type !== 'goal' || !e.side) continue;
      lastGoal = e;
      if (due) {
        last = due; out.taken[due]++;
        if (e.side === due) out.cpGoals[due]++; else out.gainGoals[e.side]++;
        due = other(last);
      } else {
        // no toss recorded: the team that conceded restarts (the usual case)
        last = e.side; due = other(e.side);
      }
      owed = true;
    }
    const closed = p < s.period || s.ended;
    if (closed && owed && due) {
      const len = s.played[p - 1];
      const atBuzzer = !!lastGoal && len != null && secInPeriod(s, lastGoal) >= len - 1;
      if (!atBuzzer) { last = due; out.taken[due]++; owed = false; }
    }
  }
  if (!s.ended && due && owed && periodStarted(s)) out.taken[due]++;
  out.now = s.ended ? undefined : due;
  return out;
}

/* --------------------------------- reducer --------------------------------- */

const ENDED_OK = new Set(['STAT_ADJUST', 'REMOVE_EVENT', 'END', 'XI']);
const posIn = (v: unknown): Pos | undefined => (POSITIONS.includes(v as Pos) ? (v as Pos) : undefined);

export const reducer = (s: NetballState, a: ScoreAction): NetballState => {
  if (s.ended && !ENDED_OK.has(a.type)) return s;
  const at = Number(a.payload?.at ?? 0);
  const sec = typeof a.payload?.sec === 'number' ? Math.max(0, a.payload.sec as number) : matchSec(s, at);
  const period = typeof a.payload?.period === 'number' ? (a.payload.period as number) : s.period;
  const uid = typeof a.payload?.uid === 'string' && a.payload.uid ? (a.payload.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const p1 = a.attribution;
  const p2 = second(a);
  const push = (st: NetballState, e: Omit<NetballEvent, 'id' | 'sec' | 'period'>): NetballState =>
    ({ ...st, seq: st.seq + 1, events: [...st.events, { id: uid, sec, period, ...e } as NetballEvent] });
  const pid = p1?.playerId ?? (typeof a.payload?.playerId === 'string' ? (a.payload.playerId as string) : undefined);
  const pname = p1?.playerName ?? (typeof a.payload?.playerName === 'string' ? (a.payload.playerName as string) : undefined);
  const who1 = pid ? { playerId: pid, ...(pname ? { playerName: pname } : {}) } : pname ? { playerName: pname } : {};
  const who2 = p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {};
  const edit = !!a.payload?.edit;
  const pos = posIn(a.payload?.pos);
  switch (a.type) {
    case 'CLOCK': {
      if (a.payload?.run) return s.clock.since ? s : { ...s, clock: { ms: s.clock.ms, since: at || 1 } };
      return { ...s, clock: stopAt(s, at) };
    }
    case 'SET_CLOCK': {
      const len = periodLen(s, s.period);
      const v = Math.max(0, len ? Math.min(len, Number(a.payload?.periodSec ?? 0)) : Number(a.payload?.periodSec ?? 0));
      return { ...s, clock: { ms: v * 1000, ...(s.clock.since ? { since: at || s.clock.since } : {}) } };
    }
    case 'FIRST_CENTRE': {
      // the toss: who takes the first centre pass (before play only)
      if (!side || s.events.some((e) => e.type === 'goal')) return s;
      return { ...s, firstCentre: side };
    }
    case 'XI': {
      const team = a.payload?.team;
      if (team !== 'home' && team !== 'away') return s;
      const raw = (a.payload?.pos ?? {}) as Record<string, { id?: string; name?: string } | undefined>;
      const stamp: XiStamp = { pos: {} };
      for (const p of POSITIONS) { const w = raw[p]; if (w?.id) stamp.pos[p] = { id: String(w.id), name: String(w.name ?? '') }; }
      return { ...s, xi: { ...s.xi, [team]: stamp } };
    }
    case 'GOAL': {
      if (!side) return s;
      const scored = { ...s, [side]: s[side] + 1 } as NetballState;
      let next = push(scored, { type: 'goal', side, ...(pos ? { pos } : {}), ...who1, ...who2 });
      // the play-on after extra time ends on the lead (2 goals, or golden goal)
      if (next.playOn && next.period === totalPeriods(next) && Math.abs(next.home - next.away) >= playOnLead(next) && !edit) {
        const clock = stopAt(next, at);
        next = { ...next, clock, played: [...next.played.slice(0, next.period - 1), Math.floor(clock.ms / 1000)], ended: true };
      }
      return next;
    }
    case 'MISS': {
      if (!side) return s;
      return push(s, { type: 'miss', side, ...(pos ? { pos } : {}), ...who1, ...who2 });
    }
    case 'STAT': {
      const k = a.payload?.kind;
      if (!side || (k !== 'intercept' && k !== 'deflection' && k !== 'rebound' && k !== 'turnover')) return s;
      const ref = typeof a.payload?.ref === 'string' && a.payload.ref ? { ref: a.payload.ref as string } : {};
      return push(s, { type: 'stat', side, stat: k, ...who1, ...ref });
    }
    case 'PENALTY': {
      if (!side) return s;
      const k = a.payload?.penalty;
      return push(s, { type: 'penalty', side, penalty: k === 'contact' || k === 'obstruction' ? k : 'other', ...who1 });
    }
    case 'SANCTION': {
      if (!side) return s;
      const k = a.payload?.sanction;
      const sanction: Sanction = k === 'warning' || k === 'off' ? k : 'suspension';
      const official = typeof a.payload?.official === 'string' ? (a.payload.official as string) || 'Team official' : undefined;
      const next = push(s, {
        type: 'sanction', side, sanction, ...(official ? { official, playerName: official } : who1),
        ...(sanction === 'suspension' ? { minutes: Number(a.payload?.minutes) > 0 ? Number(a.payload!.minutes) : s.suspensionMinutes } : {}),
      });
      return sanction !== 'warning' && s.stopClock && !edit ? { ...next, clock: stopAt(next, at) } : next;
    }
    case 'TIMEOUT': {
      if (!side) return s;
      const next = push(s, { type: 'timeout', side });
      return edit ? next : { ...next, clock: stopAt(next, at) };
    }
    case 'STOP': {
      // the umpires hold time: injury / illness, blood, a tactical change, other
      const r = a.payload?.reason;
      const reason: StopReason = r === 'injury' || r === 'blood' || r === 'tactical' ? r : 'other';
      const next = push(s, { type: 'stop', ...(side ? { side } : {}), reason, ...who1 });
      return edit ? next : { ...next, clock: stopAt(next, at) };
    }
    case 'SUB': {
      if (!side) return s;
      const on = { id: a.payload?.onId as string | undefined, name: a.payload?.onName as string | undefined };
      if (!on.id && !on.name) return s;
      const off = { id: a.payload?.offId as string | undefined, name: a.payload?.offName as string | undefined };
      return push(s, {
        type: 'sub', side, ...(pos ? { pos } : {}),
        ...(off.id ? { playerId: off.id } : {}), ...(off.name ? { playerName: off.name } : {}),
        ...(on.id ? { secondId: on.id } : {}), ...(on.name ? { secondName: on.name } : {}),
      });
    }
    case 'POS': {
      if (!side || !pos || (!a.payload?.id && !a.payload?.name)) return s;
      return push(s, { type: 'pos', side, pos, ...(a.payload?.id ? { playerId: String(a.payload.id) } : {}), ...(a.payload?.name ? { playerName: String(a.payload.name) } : {}) });
    }
    case 'CENTRE': {
      // the scorer's correction of the centre-pass order
      if (!side) return s;
      return push(s, { type: 'centre', side });
    }
    case 'REMOVE_EVENT': {
      const id = String(a.payload?.id ?? '');
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e !== ev) };
      if (ev.type === 'goal' && ev.side) return { ...next, [ev.side]: Math.max(0, next[ev.side] - 1) } as NetballState;
      return next;
    }
    case 'END_PERIOD': {
      const clock = stopAt(s, at);
      const len = periodLen(s, s.period);
      const secs = Math.floor(clock.ms / 1000);
      const playedSec = len ? (clock.ms > 0 ? Math.min(len, secs) : len) : secs;
      const played = [...s.played.slice(0, s.period - 1), playedSec];
      if (s.period < totalPeriods(s)) return { ...s, played, period: s.period + 1, clock: { ms: 0 } };
      const level = s.home === s.away;
      // the end of regular time, level, in a knockout → extra time (2 halves)
      if (level && s.decider === 'et' && !s.et && s.period === s.periods) return { ...s, played, et: true, period: s.period + 1, clock: { ms: 0 } };
      // the end of extra time, still level → play on until the lead
      if (level && s.et && !s.playOn && s.period === s.periods + 2) return { ...s, played, playOn: true, period: s.period + 1, clock: { ms: 0 } };
      return { ...s, played, clock: { ms: playedSec * 1000 }, ended: true };
    }
    case 'END':
      return s.ended ? s : { ...s, ended: true, clock: stopAt(s, at) };
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ----------------------------- derived figures ----------------------------- */

/** Over: ended, and decided unless a draw may stand (a knockout's level score
 *  can only end by hand — the screen's End match). */
export const isComplete = (s: NetballState): boolean => s.ended && (s.home !== s.away || s.decider === 'none');

export function result(s: NetballState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  return { winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw', home: s.home, away: s.away };
}

/** A side's team figures (comparison panel) over a period scope. */
export interface NetballTeamFigures {
  goals: number; attempts: number; feeds: number; goalAssists: number; intercepts: number; deflections: number; rebounds: number; turnovers: number;
  penaltiesConceded: number; contacts: number; obstructions: number; warnings: number; suspensions: number; orderedOff: number; timeouts: number;
  byPos: Record<'GS' | 'GA', { goals: number; attempts: number }>;
}
export function teamFigures(s: NetballState, side: Side, scope: 'all' | number = 'all'): NetballTeamFigures {
  const f: NetballTeamFigures = {
    goals: 0, attempts: 0, feeds: 0, goalAssists: 0, intercepts: 0, deflections: 0, rebounds: 0, turnovers: 0,
    penaltiesConceded: 0, contacts: 0, obstructions: 0, warnings: 0, suspensions: 0, orderedOff: 0, timeouts: 0,
    byPos: { GS: { goals: 0, attempts: 0 }, GA: { goals: 0, attempts: 0 } },
  };
  for (const e of s.events) {
    if (e.side !== side || (scope !== 'all' && e.period !== scope)) continue;
    const bp = e.pos === 'GS' || e.pos === 'GA' ? f.byPos[e.pos] : undefined;
    if (e.type === 'goal') { f.goals++; f.attempts++; if (bp) { bp.goals++; bp.attempts++; } if (e.secondId || e.secondName) { f.goalAssists++; f.feeds++; } }
    else if (e.type === 'miss') { f.attempts++; if (bp) bp.attempts++; if (e.secondId || e.secondName) f.feeds++; }
    else if (e.type === 'stat' && e.stat) f[STAT_KEY[e.stat] as 'intercepts']++;
    else if (e.type === 'penalty') { f.penaltiesConceded++; if (e.penalty === 'contact') f.contacts++; else if (e.penalty === 'obstruction') f.obstructions++; }
    else if (e.type === 'sanction' && e.sanction) f[SANCTION_KEY[e.sanction] as 'warnings']++;
    else if (e.type === 'timeout') f.timeouts++;
  }
  return f;
}

/** Shooting % ("–" with no attempts). */
export const pctText = (g: number, a: number): string => (a > 0 ? `${Math.round((g / a) * 100)}%` : '–');

/** Goals per quarter for a side. */
export const goalsIn = (s: NetballState, side: Side, p: number): number => s.events.filter((e) => e.type === 'goal' && e.side === side && e.period === p).length;

/** SD-20 — the line under the score: '' (netball has no shoot-out). */
export const netballScoreLine = (): string => '';

/* --------------------------- live settings (#14) --------------------------- */

export const NETBALL_LIVE_SETTINGS: LiveSettings<NetballState> = {
  title: '⚙️ Match settings',
  hint: 'Applies to this match only.',
  mode: 'config',
  fields: [
    { key: 'periodMinutes', label: 'Quarter length', type: 'number', default: 15, min: 1, max: 20, step: 1, hint: 'min / period' },
    { key: 'detail', label: 'Feeds & rebounds', type: 'toggle', default: false, group: 'Detail' },
    { key: 'stopClock', label: 'Stop clock on suspensions', type: 'toggle', default: true, group: 'Clock' },
  ] as FormatField[],
  read: (s) => ({ periodMinutes: s.periodMinutes, detail: s.detail, stopClock: s.stopClock }),
  defaults: { periodMinutes: 15, detail: false, stopClock: true },
};
