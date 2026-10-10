/**
 * Hockey (FIH) — the PURE scoring core (SD-101). No React / React Native, so
 * node tests, corrections (#05 AMEND replays) and the device all derive the
 * same match from the same log.
 *
 * Rules modelled (FIH Rules of Hockey; FIH tournament regulations):
 *  - periods: 4 × 15 (FIH), or the organiser's preset (2 × 25 school,
 *    4 × 10 junior, indoor 2 × 20, Hockey5s 2 × 10); a STOPPABLE game clock
 *    the scorer starts / stops (umpires stop time for penalty corners, goals,
 *    injuries). Events carry the game-clock second (`sec`), so suspensions run
 *    on playing time: a stopped clock stops a green card's 2 minutes too.
 *  - goals by type: field goal / penalty corner / penalty stroke, scorer and
 *    optional assist; penalty corners awarded (and converted), strokes missed
 *    or saved, shots (on goal = saved by the keeper, or off target);
 *  - cards: green = 2 minutes, yellow = 5–10 minutes (umpire's choice), red =
 *    permanent — the side plays a player short; a timed suspension ends by
 *    itself (the on-field tracker, ../onField.ts);
 *  - rolling substitutions; the goalkeeper (from the line-up, a GK change, or
 *    a sub replacing the keeper) — saves, goals conceded and clean sheets;
 *  - shoot-out: 5 players a side alternating (8-second 1 v 1s), decided early
 *    when a side can't catch up, then sudden death with the order reversed.
 *
 * Every credit a live action writes on a stat line comes from `eventCredits`
 * (the controls build the attribution from it, and `hockeyTotals` sums it over
 * the state), so the absolute statTotals equal the live increments (SD-19).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';

export type Side = 'home' | 'away';
export type GoalType = 'field' | 'pc' | 'stroke';
export type CardColour = 'green' | 'yellow' | 'red';
export type Decider = 'none' | 'shootout';

export interface Who { id?: string; name?: string }

export interface HockeyEvent {
  /** stable id from the action (`payload.uid`), so a later REMOVE_EVENT still
   *  finds it after an earlier row is voided by a correction */
  id: string;
  type: 'goal' | 'pc' | 'stroke' | 'shot' | 'save' | 'card' | 'sub' | 'gk';
  side: Side;
  /** game-clock seconds since the start of the match (playing time) */
  sec: number;
  period: number;
  /** scorer / shooter / stroke taker / keeper who saved / carded player /
   *  sub off / new keeper */
  playerId?: string;
  playerName?: string;
  /** assist (goal) / sub on */
  secondId?: string;
  secondName?: string;
  goalType?: GoalType;
  /** shot: on goal (the keeper saved it) — false = off target / blocked */
  onGoal?: boolean;
  /** stroke not scored: saved by the keeper, or missed */
  outcome?: 'saved' | 'missed';
  card?: CardColour;
  /** a timed card's suspension (green 2, yellow 5–10) */
  minutes?: number;
  /** save: the shot / stroke (its id) the keeper saved */
  ref?: string;
}

export interface SoKick { scored: boolean; playerId?: string; playerName?: string }

export interface XiStamp {
  players?: { id: string; name: string }[];
  gk?: { id: string; name: string };
}

export interface HockeyState {
  home: number;
  away: number;
  /** the period in play (1-based) */
  period: number;
  periods: number;
  periodMinutes: number;
  /** current period's clock: ms accrued + running since (epoch ms) */
  clock: { ms: number; since?: number };
  /** game seconds each finished period actually lasted (information) */
  played: number[];
  ended: boolean;
  events: HockeyEvent[];
  seq: number;
  playersPerSide: number;
  decider: Decider;
  /** the clock stops by itself on a goal and a penalty corner award */
  stopClock: boolean;
  /** penalty corners exist in this format (not Hockey5s) */
  penaltyCorners: boolean;
  shootout: { home: SoKick[]; away: SoKick[]; first: Side } | null;
  shootoutWinner?: Side;
  /** who started (from the line-up), stamped at the first push-back / full time */
  xi?: { home?: XiStamp; away?: XiStamp };
}

/* --------------------------------- format ---------------------------------- */

export const HOCKEY_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  fih: { label: 'FIH 4 × 15', set: { playersPerSide: 11, periods: 4, periodMinutes: 15, stopClock: true, penaltyCorners: true } },
  school: { label: 'School 2 × 25', set: { playersPerSide: 11, periods: 2, periodMinutes: 25, stopClock: false, penaltyCorners: true } },
  junior: { label: 'Junior 4 × 10', set: { playersPerSide: 11, periods: 4, periodMinutes: 10, stopClock: false, penaltyCorners: true } },
  indoor: { label: 'Indoor 6-a-side', set: { playersPerSide: 6, periods: 2, periodMinutes: 20, stopClock: false, penaltyCorners: true } },
  fives: { label: 'Hockey5s', set: { playersPerSide: 5, periods: 2, periodMinutes: 10, stopClock: false, penaltyCorners: false } },
};

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);

export const init = (config?: Record<string, unknown>): HockeyState => {
  const periods = Math.max(1, Math.min(8, Number(config?.periods ?? 4) || 4));
  // A level match goes to a shoot-out when the organiser says so — and always
  // when the tournament plays the FIH shoot-out bonus (the "FIH + shoot-out"
  // preset stores soWinPoints in the same format object): a draw there must be
  // settled by a shoot-out for the 2 / 1 points.
  const decider: Decider = config?.decider === 'shootout' || Number(config?.soWinPoints) > 0 ? 'shootout' : 'none';
  return {
    home: 0, away: 0, period: 1, periods,
    periodMinutes: Math.max(1, Number(config?.periodMinutes ?? 15) || 15),
    clock: { ms: 0 }, played: [], ended: false, events: [], seq: 0,
    playersPerSide: Math.max(1, Number(config?.playersPerSide ?? 11) || 11),
    decider,
    stopClock: bool(config?.stopClock, true),
    penaltyCorners: bool(config?.penaltyCorners, true),
    shootout: null,
  };
};

/* ---------------------------------- clock ---------------------------------- */

const periodLen = (s: HockeyState) => s.periodMinutes * 60;

/** Seconds played in the current period at `now` (held at the period's end). */
export function periodSec(s: HockeyState, now = 0): number {
  const ms = s.clock.ms + (s.clock.since && now ? Math.max(0, now - s.clock.since) : 0);
  return Math.min(periodLen(s), Math.floor(ms / 1000));
}
/** Game seconds before a period starts: the NOMINAL period lengths (FIH match
 *  reports number minutes that way — the 2nd quarter is always 16'–30'), even
 *  when a period was ended a little early. `played` keeps the real lengths. */
export const periodOffset = (s: HockeyState, period = s.period): number => (period - 1) * s.periodMinutes * 60;
/** Game-clock seconds since the start of the match. */
export const matchSec = (s: HockeyState, now = 0): number => periodOffset(s) + periodSec(s, now);
export const running = (s: HockeyState): boolean => !!s.clock.since && !s.ended;
/** The clock face: time LEFT in the period ("07:48"), as hockey scoreboards show. */
export function clockFace(s: HockeyState, now = 0): string {
  const left = Math.max(0, periodLen(s) - periodSec(s, now));
  return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}
/** "Q2" / "H1" / "P3". */
export function periodName(s: Pick<HockeyState, 'periods'>, p: number): string {
  return s.periods === 4 ? `Q${p}` : s.periods === 2 ? `H${p}` : `P${p}`;
}
export function periodLong(s: Pick<HockeyState, 'periods'>, p: number): string {
  const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][p - 1] ?? `${p}th`;
  return s.periods === 4 ? `${ord} quarter` : s.periods === 2 ? `${ord} half` : `Period ${p}`;
}
/** FIH match-report minute: the minute being played ("1'" … "60'"). */
export const minuteOf = (sec: number): number => Math.max(1, Math.ceil(sec / 60));
export const minuteText = (sec: number): string => `${minuteOf(sec)}'`;
/** Has the current period started (any time on the clock, or running)? */
export const periodStarted = (s: HockeyState): boolean => s.clock.ms > 0 || !!s.clock.since;

const stopAt = (s: HockeyState, at: number): HockeyState['clock'] =>
  s.clock.since ? { ms: s.clock.ms + Math.max(0, at - s.clock.since) } : s.clock;

/* --------------------------------- credits --------------------------------- */

export const GOAL_KEY: Record<GoalType, string> = { field: 'fieldGoals', pc: 'pcGoals', stroke: 'strokeGoals' };
export const CARD_KEY: Record<CardColour, string> = { green: 'greenCards', yellow: 'yellowCards', red: 'redCards' };
/** FIH suspensions (SD-15 schema `suspension`; FIELD_RULES.hockey). */
export const CARD_MINUTES: Record<CardColour, { minutes?: number; maxMinutes?: number; permanent?: boolean }> = {
  green: { minutes: 2 },
  yellow: { minutes: 5, maxMinutes: 10 },
  red: { permanent: true },
};
/** Every key a live hockey action credits (statTotals owns all of them). */
export const LIVE_KEYS = ['goals', 'fieldGoals', 'pcGoals', 'strokeGoals', 'assists', 'shots', 'shotsOnGoal', 'saves', 'strokesMissed', 'greenCards', 'yellowCards', 'redCards', 'soTaken', 'soGoals'] as const;

type Credit = { playerId: string; playerName?: string; stats: Record<string, number> };

/** The stat-line credits one event writes: [primary player, second player]. */
export function eventCredits(e: Pick<HockeyEvent, 'type' | 'playerId' | 'playerName' | 'secondId' | 'secondName' | 'goalType' | 'onGoal' | 'outcome' | 'card'>): { first?: Credit; second?: Credit } {
  // Every credit belongs to a player of the event's own side (a keeper's save
  // is its own SAVE event on the keeper's side — the live layer writes a line
  // against the action's side, so one action never credits both teams).
  const p = (stats: Record<string, number>) => (e.playerId ? { playerId: e.playerId, playerName: e.playerName, stats } : undefined);
  const q = (stats: Record<string, number>) => (e.secondId ? { playerId: e.secondId, playerName: e.secondName, stats } : undefined);
  switch (e.type) {
    case 'goal':
      // a goal is a shot on goal (FIH match statistics count it as one)
      return { first: p({ goals: 1, [GOAL_KEY[e.goalType ?? 'field']]: 1, shots: 1, shotsOnGoal: 1 }), second: q({ assists: 1 }) };
    case 'shot':
      return { first: p(e.onGoal ? { shots: 1, shotsOnGoal: 1 } : { shots: 1 }) };
    case 'stroke':
      return { first: p({ strokesMissed: 1 }) };
    case 'save':
      return { first: p({ saves: 1 }) };
    case 'card':
      return { first: p({ [CARD_KEY[e.card ?? 'green']]: 1 }) };
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

/** The second player of an action: live `attribution2`, or on replay the copy
 *  stored in the payload (`_attr2`, see amend.ts / useLiveMatch). */
const second = (a: ScoreAction): Attribution | undefined =>
  a.attribution2 ?? (a.payload?._attr2 as Attribution | undefined);

/* -------------------------------- shoot-out -------------------------------- */

/** FIH shoot-out: 5 each, decided as soon as a side can't catch up; then
 *  sudden death — level attempts, one side ahead. */
export function decideShootout(h: SoKick[], a: SoKick[]): Side | undefined {
  const hs = h.filter((k) => k.scored).length;
  const as = a.filter((k) => k.scored).length;
  if (h.length <= 5 && a.length <= 5) {
    if (hs > as + Math.max(0, 5 - a.length)) return 'home';
    if (as > hs + Math.max(0, 5 - h.length)) return 'away';
  }
  if (h.length === a.length && h.length >= 5 && hs !== as) return hs > as ? 'home' : 'away';
  return undefined;
}
/** Whose turn: alternate within each round; the first five rounds start with
 *  `first`, sudden-death rounds with the other side (FIH). */
export function nextShooter(so: NonNullable<HockeyState['shootout']>): Side {
  const n = so.home.length + so.away.length;
  const round = Math.floor(n / 2);
  const other: Side = so.first === 'home' ? 'away' : 'home';
  const order: Side[] = round < 5 ? [so.first, other] : [other, so.first];
  const want = order[n % 2];
  // keep turns honest if one side was keyed twice in a row
  const behind: Side | undefined = so.home.length < so.away.length ? 'home' : so.away.length < so.home.length ? 'away' : undefined;
  return behind ?? want;
}
export const soScore = (s: Pick<HockeyState, 'shootout'>) => ({
  home: s.shootout?.home.filter((k) => k.scored).length ?? 0,
  away: s.shootout?.away.filter((k) => k.scored).length ?? 0,
});

/* --------------------------------- reducer --------------------------------- */

const SO_ACTIONS = new Set(['START_SHOOTOUT', 'SO', 'XI', 'STAT_ADJUST', 'REMOVE_EVENT', 'END']);

export const reducer = (s: HockeyState, a: ScoreAction): HockeyState => {
  if (s.ended && !SO_ACTIONS.has(a.type)) return s;
  const at = Number(a.payload?.at ?? 0);
  const sec = typeof a.payload?.sec === 'number' ? Math.max(0, a.payload.sec as number) : matchSec(s, at);
  const period = typeof a.payload?.period === 'number' ? (a.payload.period as number) : s.period;
  const uid = typeof a.payload?.uid === 'string' && a.payload.uid ? (a.payload.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const p1 = a.attribution;
  const p2 = second(a);
  const push = (st: HockeyState, e: Omit<HockeyEvent, 'id' | 'sec' | 'period'>): HockeyState =>
    ({ ...st, seq: st.seq + 1, events: [...st.events, { id: uid, sec, period, ...e } as HockeyEvent] });
  const who1 = p1?.playerId ? { playerId: p1.playerId, ...(p1.playerName ? { playerName: p1.playerName } : {}) } : {};
  const who2 = p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {};
  switch (a.type) {
    case 'CLOCK': {
      // start / stop the game clock (`run`), at epoch `at`
      if (a.payload?.run) return s.clock.since ? s : { ...s, clock: { ms: s.clock.ms, since: at || 1 } };
      return { ...s, clock: stopAt(s, at) };
    }
    case 'SET_CLOCK': {
      // correct the clock: `sec` played in this period (joining late, a slip)
      const v = Math.max(0, Math.min(periodLen(s), Number(a.payload?.periodSec ?? 0)));
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
      const goalType: GoalType = a.payload?.goalType === 'pc' || a.payload?.goalType === 'stroke' ? a.payload.goalType : 'field';
      const scored = { ...s, [side]: s[side] + 1 } as HockeyState;
      const next = push(scored, { type: 'goal', side, goalType, ...who1, ...who2 });
      return s.stopClock && !a.payload?.edit ? { ...next, clock: stopAt(next, at) } : next;
    }
    case 'PC': {
      if (!side) return s;
      const next = push(s, { type: 'pc', side });
      return s.stopClock && !a.payload?.edit ? { ...next, clock: stopAt(next, at) } : next;
    }
    case 'STROKE': {
      // a penalty stroke NOT scored (a scored stroke is a GOAL of type stroke)
      if (!side) return s;
      return push(s, { type: 'stroke', side, outcome: a.payload?.outcome === 'saved' ? 'saved' : 'missed', ...who1 });
    }
    case 'SHOT': {
      if (!side) return s;
      return push(s, { type: 'shot', side, onGoal: a.payload?.onGoal === true, ...who1 });
    }
    case 'SAVE': {
      // the keeper's save (side = the keeper's team), linked to the shot / stroke
      if (!side) return s;
      const ref = typeof a.payload?.ref === 'string' ? a.payload.ref : undefined;
      return push(s, { type: 'save', side, ...who1, ...(ref ? { ref } : {}) });
    }
    case 'CARD': {
      if (!side) return s;
      const card: CardColour = a.payload?.card === 'yellow' || a.payload?.card === 'red' ? a.payload.card : 'green';
      const d = CARD_MINUTES[card];
      const minutes = d.permanent ? undefined : Math.min(d.maxMinutes ?? d.minutes!, Math.max(d.minutes!, Number(a.payload?.minutes ?? d.minutes)));
      return push(s, { type: 'card', side, card, ...(minutes ? { minutes } : {}), ...who1 });
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
      // a new goalkeeper for the side (id + name in the payload)
      if (!side || !a.payload?.id) return s;
      return push(s, { type: 'gk', side, playerId: String(a.payload.id), playerName: String(a.payload.name ?? '') });
    }
    case 'REMOVE_EVENT': {
      const id = String(a.payload?.id ?? '');
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e !== ev) };
      if (ev.type === 'goal') return { ...next, [ev.side]: Math.max(0, next[ev.side] - 1) } as HockeyState;
      return next;
    }
    case 'END_PERIOD': {
      // the hooter: stop the clock, then the next period — or full time
      const clock = stopAt(s, at);
      // a period played without the clock counts its full length (so later
      // periods' minutes stay in their place)
      const len = clock.ms > 0 ? Math.min(periodLen(s), Math.floor(clock.ms / 1000)) : periodLen(s);
      // the final hooter: the last period is complete (its full length)
      if (s.period >= s.periods) return { ...s, clock: { ms: periodLen(s) * 1000 }, played: [...s.played.slice(0, s.period - 1), len], ended: true };
      return { ...s, played: [...s.played.slice(0, s.period - 1), len], period: s.period + 1, clock: { ms: 0 } };
    }
    case 'END':
      // full time called early (or confirmed); the clock stops
      return s.ended ? s : { ...s, ended: true, clock: stopAt(s, at) };
    case 'START_SHOOTOUT': {
      if (!s.ended || s.home !== s.away || s.shootout) return s;
      return { ...s, shootout: { home: [], away: [], first: a.payload?.first === 'away' ? 'away' : 'home' } };
    }
    case 'SO': {
      if (!s.shootout || s.shootoutWinner || !side) return s;
      const kick: SoKick = { scored: a.payload?.scored === true, ...(p1?.playerId ? { playerId: p1.playerId } : {}), ...(p1?.playerName ? { playerName: p1.playerName } : {}) };
      const so = { ...s.shootout, [side]: [...s.shootout[side], kick] };
      return { ...s, shootout: so, shootoutWinner: decideShootout(so.home, so.away) };
    }
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ----------------------------- derived figures ----------------------------- */

export const isComplete = (s: HockeyState): boolean =>
  s.ended && (s.home !== s.away || s.decider === 'none' || s.shootoutWinner != null);

export function result(s: HockeyState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  const winner = s.home > s.away ? 'home' : s.away > s.home ? 'away' : (s.shootoutWinner ?? 'draw');
  return { winner, home: s.home, away: s.away };
}

/** The keeper on duty for a side at each moment: the line-up's GK, then each
 *  GK change and each sub that took the keeper off (the player coming on goes
 *  in goal — a hockey keeper is replaced by a keeper). */
export function keeperAt(s: HockeyState, side: Side, uptoIndex = s.events.length): Who | undefined {
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
export const currentKeeper = (s: HockeyState, side: Side) => keeperAt(s, side);

/** A side's team figures (comparison panel) over a period scope. */
export interface HockeyTeamFigures {
  goals: number; fieldGoals: number; pcGoals: number; strokeGoals: number;
  shots: number; shotsOnGoal: number; pcs: number; strokes: number; saves: number;
  greenCards: number; yellowCards: number; redCards: number;
}
export function teamFigures(s: HockeyState, side: Side, scope: 'all' | number = 'all'): HockeyTeamFigures {
  const f: HockeyTeamFigures = { goals: 0, fieldGoals: 0, pcGoals: 0, strokeGoals: 0, shots: 0, shotsOnGoal: 0, pcs: 0, strokes: 0, saves: 0, greenCards: 0, yellowCards: 0, redCards: 0 };
  for (const e of s.events) {
    if (scope !== 'all' && e.period !== scope) continue;
    if (e.side === side) {
      if (e.type === 'goal') {
        f.goals++; f.shots++; f.shotsOnGoal++;
        if (e.goalType === 'pc') f.pcGoals++; else if (e.goalType === 'stroke') { f.strokeGoals++; f.strokes++; } else f.fieldGoals++;
      } else if (e.type === 'shot') { f.shots++; if (e.onGoal) f.shotsOnGoal++; }
      else if (e.type === 'pc') f.pcs++;
      else if (e.type === 'stroke') f.strokes++;
      else if (e.type === 'card') f[CARD_KEY[e.card ?? 'green'] as 'greenCards' | 'yellowCards' | 'redCards']++;
      else if (e.type === 'save') f.saves++;
    }
  }
  // a PC goal logged without its award still counts as a corner won
  f.pcs = Math.max(f.pcs, f.pcGoals);
  return f;
}
/** PC conversion % (goals from penalty corners ÷ corners won), or null. */
export const pcConversion = (f: HockeyTeamFigures): number | null => (f.pcs ? Math.round((f.pcGoals / f.pcs) * 100) : null);

/** SD-20 — the line under the score: the shoot-out ("SO 4–3"), '' otherwise
 *  (`perspective: 'away'` reads it from the away side). */
export function hockeyScoreLine(s: HockeyState, perspective?: Side): string {
  if (!s?.shootout) return '';
  const so = soScore(s);
  return perspective === 'away' ? `SO ${so.away}–${so.home}` : `SO ${so.home}–${so.away}`;
}

/* --------------------------- live settings (#14) --------------------------- */

export const HOCKEY_LIVE_SETTINGS: LiveSettings<HockeyState> = {
  title: '⚙️ Match settings',
  hint: 'Applies to this match only.',
  mode: 'config',
  fields: [
    { key: 'periodMinutes', label: 'Period length', type: 'number', default: 15, min: 1, max: 45, step: 1, hint: 'min / period' },
    { key: 'stopClock', label: 'Stop clock on goals & PCs', type: 'toggle', default: true, group: 'Clock' },
  ] as FormatField[],
  read: (s) => ({ periodMinutes: s.periodMinutes, stopClock: s.stopClock }),
  defaults: { periodMinutes: 15, stopClock: true },
};
