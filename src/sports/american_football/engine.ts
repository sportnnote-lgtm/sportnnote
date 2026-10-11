/**
 * American football — the PURE scoring core (SD-147). No React / React Native,
 * so node tests, corrections (#05 AMEND replays) and the device all derive the
 * same game from the same log. Modelled on rugby (SD-143) / handball (SD-102).
 *
 * Two games share the engine:
 *  - FLAG football (IFAF 5-on-5, the international / school game; first
 *    preset): 2 × 20 min, no contact, a 50-yard field between the goal lines
 *    (10-yard end zones). Each possession starts on the offence's own 5-yard
 *    line and has 3 downs to cross midfield, then 3 downs to score. Scoring:
 *    touchdown 6, conversion 1 point from the 5-yard line or 2 points from the
 *    12, safety 2, a conversion intercepted and returned = 2 to the defence.
 *    No kicking game. A failed series = the opponent takes over on its own 5
 *    (organiser option: at the spot). [verify against the current IFAF Flag
 *    Football Rules — the 2017 / 2020+ books; timeouts default 2 per half.]
 *  - TACKLE 11-a-side: NFL (4 × 15), NCAA college (4 × 15), NFHS high school
 *    (4 × 12). Touchdown 6, field goal 3, safety 2, try: 1 (kick) or 2 (play);
 *    a try returned by the defence = 2. 4 downs to gain 10 yards on a
 *    100-yard field. 3 timeouts per half; NFL two-minute warning (option).
 *
 * Two scoring modes (organiser / live setting `mode`): 'score' (default —
 * just the scoring plays, quarters, clock and timeouts: fast for one scorer)
 * and 'pbp' (full play-by-play: possession, down & distance, ball spot and a
 * quick sheet of plays that feeds the box score — passing, rushing, receiving,
 * defence, kicking, first downs, total yards, turnovers, time of possession).
 *
 * Overtime (`decider`, organiser option):
 *  - 'nfl'     NFL regular season: one 10-min period, both teams get a
 *              possession, then sudden death; still level = a tie (2025 rule
 *              — verify);
 *  - 'nfl_playoff' the same with 15-min periods until someone wins;
 *  - 'kansas'  NFHS / NCAA: each team one possession from the opponent's 10
 *              (NFHS) / 25 (NCAA) per overtime, repeat until one leads after
 *              equal possessions (NCAA from the 3rd OT: 2-point plays only);
 *  - 'flag'    alternating conversion attempts (1 from the 5 / 2 from the
 *              12), one each per round, until one leads [verify IFAF];
 *  - 'none'    the tie stands. A possession in overtime ends on its try / a
 *              field goal / a safety / a turnover / "no score".
 *
 * Every credit a live action writes comes from `eventCredits` (the controls
 * build the attribution from it; `afTotals` sums it), so statTotals equal the
 * live increments (SD-19).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';

export type Side = 'home' | 'away';
export type Variant = 'flag' | 'tackle';
export type Ruleset = 'ifaf' | 'nfl' | 'ncaa' | 'nfhs';
export type Mode = 'score' | 'pbp';
export type Decider = 'none' | 'nfl' | 'nfl_playoff' | 'kansas' | 'flag';
export type PeriodKind = 'reg' | 'ot';
/** how a touchdown was scored */
export type TdHow = 'run' | 'pass' | 'int' | 'fumble' | 'punt' | 'kick' | 'other';
/** a try: a kick (1, tackle), a 1-point play (flag, from the 5) or a 2-point play */
export type TryKind = 'kick' | 'one' | 'two';
export type PlayKind = 'run' | 'pass' | 'inc' | 'sack' | 'int' | 'fumble' | 'punt' | 'kickoff' | 'penalty' | 'downs' | 'kneel';

export const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
export const TD_POINTS = 6;
export const FG_POINTS = 3;
export const SAFETY_POINTS = 2;
export const DEF_TRY_POINTS = 2;

export interface Who { id?: string; name?: string }

/** The ball: who has it, the down, where (yards from the offence's own goal
 *  line, 0 … field) and the line to gain (same scale). */
export interface Drive { off: Side; down: number; spot: number; line: number }

export interface AFEvent {
  /** stable id from the action (`payload.uid`) */
  id: string;
  type: 'td' | 'try' | 'defTry' | 'fg' | 'safety' | 'timeout' | 'play' | 'tackle' | 'possEnd' | 'eject';
  /** scoring plays: the scoring team; plays: the offence; tackle: the defence */
  side: Side;
  /** game seconds elapsed (the periods before at full length + this one) */
  sec: number;
  /** seconds elapsed in its period */
  psec: number;
  period: number;
  /** TD scorer / try scorer or kicker / FG kicker / safety: the defender /
   *  play: carrier, passer, punter, the player who fumbled / tackler */
  playerId?: string;
  playerName?: string;
  /** TD pass / pass play: the passer (TD) or the receiver (play); int /
   *  fumble / sack: the defender */
  secondId?: string;
  secondName?: string;
  how?: TdHow;
  yards?: number;
  kind?: TryKind;
  good?: boolean;
  play?: PlayKind;
  /** a turnover / punt / kickoff: where the new offence starts (own yards) */
  newSpot?: number;
  /** punt / kickoff return yards */
  ret?: number;
  foul?: string;
  /** penalty on this side */
  on?: Side;
  autoFirst?: boolean;
  lossOfDown?: boolean;
  /** recorded in play-by-play mode (rushing / passing credits) */
  pbp?: boolean;
  /** a try that wasn't attempted ("No try") */
  none?: boolean;
  /** play-by-play: the offence at the snap and the situation before the play */
  off?: Side;
  pre?: { down: number; toGo: number; spot: number };
  /** the play gained a first down */
  first?: boolean;
}

export interface XiStamp { players?: { id: string; name: string }[] }

export interface AFState {
  home: number;
  away: number;
  period: number;
  plan: PeriodKind[];
  periodMinutes: number;
  otMinutes: number;
  /** elapsed time of the period on the game clock (counts DOWN on screen) */
  clock: { ms: number; since?: number };
  played: number[];
  ended: boolean;
  events: AFEvent[];
  seq: number;
  variant: Variant;
  rules: Ruleset;
  playersPerSide: number;
  periods: number;
  timeoutsPerHalf: number;
  /** NFL two-minute warning: the clock stops at 2:00 of Q2 / Q4 */
  twoMinute: boolean;
  /** periods whose two-minute warning has been given */
  warned: number[];
  decider: Decider;
  /** Kansas OT: possessions start this many yards from the goal (NFHS 10, NCAA 25) */
  otSpot: number;
  mode: Mode;
  /** play-by-play: ask who made the tackle (flag pull) after a play */
  trackTackles: boolean;
  /** yards between the goal lines (tackle 100, flag 50) */
  field: number;
  /** downs per series (tackle 4, flag 3) */
  downs: number;
  /** flag: where a failed series / a new possession starts (own yard line) */
  flagStart: number;
  /** flag: after a failed series the opponent starts at its own 5 ('own5') or the dead-ball spot ('spot') */
  flagTurnover: 'own5' | 'spot';
  /** play-by-play: the ball (null = between possessions) */
  drive: Drive | null;
  /** tackle, play-by-play: a kickoff is due from this side */
  kickBy?: Side;
  /** a touchdown's try is due from this side */
  pendingTry?: Side;
  /** overtime: who has the ball first this OT period (coin toss) */
  otFirst?: Side;
  /** overtime: the offences whose possession closed this OT period, in order */
  otPoss: Side[];
  xi?: { home?: XiStamp; away?: XiStamp };
}

/* --------------------------------- format ---------------------------------- */

export const AF_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  flag: { label: 'Flag 5v5 (IFAF) · 2 × 20', set: { variant: 'flag', rules: 'ifaf', playersPerSide: 5, periods: 2, periodMinutes: 20, timeoutsPerHalf: 2, twoMinute: false, decider: 'flag' } },
  flagSchool: { label: 'Flag 5v5 school · 2 × 15', set: { variant: 'flag', rules: 'ifaf', playersPerSide: 5, periods: 2, periodMinutes: 15, timeoutsPerHalf: 1, twoMinute: false, decider: 'flag' } },
  nfl: { label: 'Tackle · NFL 4 × 15', set: { variant: 'tackle', rules: 'nfl', playersPerSide: 11, periods: 4, periodMinutes: 15, timeoutsPerHalf: 3, twoMinute: true, decider: 'nfl', otMinutes: 10 } },
  ncaa: { label: 'Tackle · College 4 × 15', set: { variant: 'tackle', rules: 'ncaa', playersPerSide: 11, periods: 4, periodMinutes: 15, timeoutsPerHalf: 3, twoMinute: false, decider: 'kansas', otSpot: 25 } },
  nfhs: { label: 'Tackle · High school (NFHS) 4 × 12', set: { variant: 'tackle', rules: 'nfhs', playersPerSide: 11, periods: 4, periodMinutes: 12, timeoutsPerHalf: 3, twoMinute: false, decider: 'kansas', otSpot: 10 } },
};

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);
const num = (v: unknown, d: number, min = 0) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : Math.max(min, n); };

export const variantOf = (c?: Record<string, unknown>): Variant =>
  c?.variant === 'tackle' ? 'tackle' : c?.variant === 'flag' ? 'flag' : Number(c?.playersPerSide) >= 8 ? 'tackle' : c?.rules && c.rules !== 'ifaf' ? 'tackle' : 'flag';
export const rulesOf = (c: Record<string, unknown> | undefined, v: Variant): Ruleset =>
  c?.rules === 'nfl' || c?.rules === 'ncaa' || c?.rules === 'nfhs' ? c.rules : v === 'flag' ? 'ifaf' : 'nfl';

/** 'standard' (the knockout default) → the rules' own overtime. */
export function resolveDecider(d: unknown, v: Variant, r: Ruleset): Decider {
  if (d === 'standard') return v === 'flag' ? 'flag' : r === 'nfl' ? 'nfl_playoff' : 'kansas';
  return d === 'nfl' || d === 'nfl_playoff' || d === 'kansas' || d === 'flag' ? d : 'none';
}

export const init = (cfg?: Record<string, unknown>): AFState => {
  // a format that names a preset gets its rules underneath its own keys
  // (no preset and no game named = IFAF flag, the first preset)
  const pk = typeof cfg?.preset === 'string' && AF_PRESETS[cfg.preset] ? cfg.preset : !cfg?.variant && !cfg?.rules ? 'flag' : undefined;
  const config: Record<string, unknown> = { ...(pk ? AF_PRESETS[pk].set : {}), ...(cfg ?? {}) };
  const variant = variantOf(config);
  const rules = rulesOf(config, variant);
  const flag = variant === 'flag';
  const periods = num(config?.periods, flag ? 2 : 4, 1) >= 4 ? 4 : 2;
  return {
    home: 0, away: 0, period: 1, plan: Array.from({ length: periods }, () => 'reg' as const),
    periodMinutes: num(config?.periodMinutes, flag ? 20 : rules === 'nfhs' ? 12 : 15, 1),
    otMinutes: num(config?.otMinutes, 10, 1),
    clock: { ms: 0 }, played: [], ended: false, events: [], seq: 0,
    variant, rules,
    playersPerSide: num(config?.playersPerSide, flag ? 5 : 11, 1),
    periods,
    timeoutsPerHalf: num(config?.timeoutsPerHalf, flag ? 2 : 3),
    twoMinute: bool(config?.twoMinute, !flag && rules === 'nfl'),
    warned: [],
    decider: resolveDecider(config?.decider, variant, rules),
    otSpot: num(config?.otSpot, rules === 'ncaa' ? 25 : 10, 1),
    mode: config?.mode === 'pbp' || config?.mode === true || config?.mode === 'true' ? 'pbp' : 'score',
    trackTackles: bool(config?.trackTackles, false),
    field: flag ? 50 : 100,
    downs: flag ? 3 : 4,
    flagStart: num(config?.flagStart, 5, 1),
    flagTurnover: config?.flagTurnover === 'spot' ? 'spot' : 'own5',
    drive: null,
    otPoss: [],
  };
};

/* ---------------------------------- clock ---------------------------------- */

export const isOT = (s: Pick<AFState, 'plan'>, p: number): boolean => s.plan[p - 1] === 'ot';
/** Kansas / flag overtime has no game clock. */
export const clockless = (s: Pick<AFState, 'plan' | 'decider'>, p: number): boolean => isOT(s, p) && (s.decider === 'kansas' || s.decider === 'flag');
export function periodLen(s: Pick<AFState, 'plan' | 'periodMinutes' | 'otMinutes' | 'decider'>, p: number): number {
  if (!isOT(s, p)) return s.periodMinutes * 60;
  if (clockless(s, p)) return 0;
  return (s.decider === 'nfl_playoff' ? 15 : s.otMinutes) * 60;
}
export function playedOffset(s: AFState, p = s.period): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += s.played[i - 1] ?? periodLen(s, i);
  return t;
}
/** Seconds elapsed in the current period at `now` (capped at its length). */
export function periodSec(s: AFState, now = 0): number {
  const ms = s.clock.ms + (s.clock.since && now ? Math.max(0, now - s.clock.since) : 0);
  const len = periodLen(s, s.period);
  return len ? Math.min(len, Math.floor(ms / 1000)) : Math.floor(ms / 1000);
}
export const remainingSec = (s: AFState, now = 0): number => Math.max(0, periodLen(s, s.period) - periodSec(s, now));
export const matchSec = (s: AFState, now = 0): number => playedOffset(s) + periodSec(s, now);
export const running = (s: AFState): boolean => !!s.clock.since && !s.ended;
export const periodStarted = (s: AFState): boolean => s.clock.ms > 0 || !!s.clock.since || clockless(s, s.period) || s.events.some((e) => e.period === s.period);
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** The scoreboard clock for period `p` at `psec` elapsed: time LEFT ("4:12"). */
export const clockAt = (s: Pick<AFState, 'plan' | 'periodMinutes' | 'otMinutes' | 'decider'>, p: number, psec: number): string =>
  clockless(s, p) ? '' : mmss(Math.max(0, periodLen(s, p) - psec));
export const clockFace = (s: AFState, now = 0): string => clockAt(s, s.period, periodSec(s, now));
export const totalPeriods = (s: Pick<AFState, 'plan'>): number => s.plan.length;
/** "Q1"…"Q4" / "H1" "H2" (flag) / "OT" / "OT1", "OT2"… */
export function periodName(s: Pick<AFState, 'plan' | 'periods'>, p: number): string {
  if (isOT(s, p)) {
    const n = s.plan.slice(0, p).filter((x) => x === 'ot').length;
    return s.plan.filter((x) => x === 'ot').length > 1 || n > 1 ? `OT${n}` : 'OT';
  }
  return s.periods === 4 ? `Q${p}` : `H${p}`;
}
const ORD = ['1st', '2nd', '3rd', '4th'];
export function periodLong(s: Pick<AFState, 'plan' | 'periods'>, p: number): string {
  if (isOT(s, p)) return `Overtime${periodName(s, p) === 'OT' ? '' : ` ${periodName(s, p).slice(2)}`}`;
  return `${ORD[p - 1] ?? `${p}th`} ${s.periods === 4 ? 'quarter' : 'half'}`;
}
/** "Q2 4:12" / "OT1" — where an event sits. */
export const eventWhen = (s: AFState, e: Pick<AFEvent, 'period' | 'psec'>): string => {
  const c = clockAt(s, e.period, e.psec);
  return c ? `${periodName(s, e.period)} ${c}` : periodName(s, e.period);
};
/** 1 or 2 — the half a period is in (timeouts are per half). */
export const halfOf = (s: Pick<AFState, 'periods'>, p: number): number => (s.periods === 4 ? (p <= 2 ? 1 : 2) : p);
/** Is the end of period `p` half-time (or full time)? */
const endsHalf = (s: AFState, p: number) => (s.periods === 4 ? p === 2 : p === 1);

const stopAt = (s: AFState, at: number): AFState['clock'] =>
  s.clock.since ? { ms: Math.min(Math.max(periodLen(s, s.period), 0) * 1000 || Infinity, s.clock.ms + Math.max(0, at - s.clock.since)) } : s.clock;

/* -------------------------------- timeouts --------------------------------- */

/** Overtime timeouts: NFL 2 per team; Kansas 1 per overtime; flag none. */
export const otTimeouts = (s: Pick<AFState, 'decider'>): number => (s.decider === 'nfl' || s.decider === 'nfl_playoff' ? 2 : s.decider === 'kansas' ? 1 : 0);
export function timeoutsLeft(s: AFState, side: Side, p = s.period): number {
  const used = s.events.filter((e) => e.type === 'timeout' && e.side === side && (isOT(s, p) ? e.period === p : !isOT(s, e.period) && halfOf(s, e.period) === halfOf(s, p))).length;
  return Math.max(0, (isOT(s, p) ? otTimeouts(s) : s.timeoutsPerHalf) - used);
}

/* ---------------------------------- field ---------------------------------- */

/** The line to gain from a spot: tackle 10 yards (goal to go inside the 10);
 *  flag: midfield, then the goal line. */
export function lineFor(s: Pick<AFState, 'variant' | 'field'>, spot: number): number {
  if (s.variant === 'flag') return spot < s.field / 2 ? s.field / 2 : s.field;
  return Math.min(s.field, spot + 10);
}
export const series = (s: Pick<AFState, 'variant' | 'field'>, off: Side, spot: number): Drive => {
  const sp = Math.max(1, Math.min(s.field - 1, Math.round(spot)));
  return { off, down: 1, spot: sp, line: lineFor(s, sp) };
};
export const toGo = (d: Drive): number => d.line - d.spot;
/** "Own 35" / "Opp 20" / "50" (tackle midfield) / "Midfield" (flag). */
export function spotText(s: Pick<AFState, 'field' | 'variant'>, spot: number): string {
  const half = s.field / 2;
  if (spot === half) return s.variant === 'flag' ? 'Midfield' : '50';
  return spot < half ? `Own ${spot}` : `Opp ${s.field - spot}`;
}
/** "3rd & 4" / "1st & Goal" / "2nd & 6 at Own 35". */
export function downText(s: Pick<AFState, 'field' | 'variant'>, d: Drive, at = false): string {
  const dist = d.line >= s.field ? 'Goal' : String(toGo(d));
  return `${ORD[d.down - 1] ?? `${d.down}th`} & ${dist}${at ? ` at ${spotText(s, d.spot)}` : ''}`;
}
/** Kickoff touchback (receiving team's own yard line): NFL 35 (2025), NCAA / NFHS 25 [verify]. */
export const touchback = (s: Pick<AFState, 'rules'>): number => (s.rules === 'nfl' ? 35 : 25);
/** The default spot a team takes over after a failed series. */
export const turnoverSpot = (s: Pick<AFState, 'variant' | 'field' | 'flagTurnover' | 'flagStart'>, deadSpot: number): number =>
  s.variant === 'flag' && s.flagTurnover === 'own5' ? s.flagStart : s.field - deadSpot;
/** A field goal's distance from the ball spot (snap 7 yards back + the 10-yard end zone). */
export const fgDistance = (s: Pick<AFState, 'field'>, spot: number): number => s.field - spot + 17;

/* --------------------------------- points ---------------------------------- */

export function pointsOf(e: Pick<AFEvent, 'type' | 'kind' | 'good'>): number {
  switch (e.type) {
    case 'td': return TD_POINTS;
    case 'try': return e.good ? (e.kind === 'two' ? 2 : 1) : 0;
    case 'defTry': return DEF_TRY_POINTS;
    case 'fg': return e.good ? FG_POINTS : 0;
    case 'safety': return SAFETY_POINTS;
    default: return 0;
  }
}

/* --------------------------------- credits --------------------------------- */

/** The scoring keys every match tracks (score-only mode too). */
export const SCORE_KEYS = [
  'points', 'touchdowns', 'rushTD', 'recTD', 'passTD', 'retTD', 'twoPt', 'onePt', 'patMade', 'patAtt', 'fgMade', 'fgAtt', 'safeties', 'ejections',
] as const;
/** The play-by-play keys (keyed: only matches scored play by play carry them). */
export const PBP_KEYS = [
  'passComp', 'passAtt', 'passYds', 'passInt', 'rushAtt', 'rushYds', 'rec', 'recYds', 'sacks', 'defInt', 'fumblesLost', 'fumRec', 'punts', 'puntYds',
] as const;
export const DETAIL_KEYS = ['tackles'] as const;
export const LIVE_KEYS = [...SCORE_KEYS, ...PBP_KEYS, ...DETAIL_KEYS] as const;

type Credit = { playerId: string; playerName?: string; stats: Record<string, number> };
type CreditEvent = Pick<AFEvent, 'type' | 'playerId' | 'playerName' | 'secondId' | 'secondName' | 'how' | 'yards' | 'kind' | 'good' | 'play' | 'pbp'>;

/** The stat-line credits one event writes: [primary player, second player]. */
export function eventCredits(e: CreditEvent): { first?: Credit; second?: Credit } {
  const p = (stats: Record<string, number>) => (e.playerId ? { playerId: e.playerId, playerName: e.playerName, stats } : undefined);
  const q = (stats: Record<string, number>) => (e.secondId ? { playerId: e.secondId, playerName: e.secondName, stats } : undefined);
  const y = Math.round(Number(e.yards) || 0);
  switch (e.type) {
    case 'td': {
      const base = { points: TD_POINTS, touchdowns: 1 };
      if (e.how === 'run') return { first: p({ ...base, rushTD: 1, ...(e.pbp ? { rushAtt: 1, rushYds: y } : {}) }) };
      if (e.how === 'pass') return {
        first: p({ ...base, recTD: 1, ...(e.pbp ? { rec: 1, recYds: y } : {}) }),
        second: q({ passTD: 1, ...(e.pbp ? { passComp: 1, passAtt: 1, passYds: y } : {}) }),
      };
      return { first: p({ ...base, retTD: 1 }) };
    }
    case 'try':
      if (e.kind === 'kick') return { first: p(e.good ? { points: 1, patMade: 1, patAtt: 1 } : { patAtt: 1 }) };
      if (!e.good) return {};
      return { first: p(e.kind === 'two' ? { points: 2, twoPt: 1 } : { points: 1, onePt: 1 }) };
    case 'defTry':
      return { first: p({ points: DEF_TRY_POINTS }) };
    case 'fg':
      return { first: p(e.good ? { points: FG_POINTS, fgMade: 1, fgAtt: 1 } : { fgAtt: 1 }) };
    case 'safety':
      return { first: p({ points: SAFETY_POINTS, safeties: 1 }) };
    case 'eject':
      return { first: p({ ejections: 1 }) };
    case 'tackle':
      return { first: p({ tackles: 1 }) };
    case 'play':
      switch (e.play) {
        case 'run': case 'kneel': return { first: p({ rushAtt: 1, rushYds: y }) };
        case 'pass': return { first: p({ passComp: 1, passAtt: 1, passYds: y }), second: q({ rec: 1, recYds: y }) };
        case 'inc': return { first: p({ passAtt: 1 }) };
        case 'sack': return { second: q({ sacks: 1 }) };
        case 'int': return { first: p({ passAtt: 1, passInt: 1 }), second: q({ defInt: 1 }) };
        case 'fumble': return { first: p({ fumblesLost: 1 }), second: q({ fumRec: 1 }) };
        case 'punt': return { first: p({ punts: 1, puntYds: y }) };
        default: return {};
      }
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
/** The tracked list a live credit carries (the score keys: always tracked). */
export const TRACKED: string[] = [...SCORE_KEYS];
/** An action's credits from the event it records. */
export function credit(e: CreditEvent, offence?: Side): { attribution?: Attribution; attribution2?: Attribution } {
  const cr = eventCredits(e);
  const a1 = creditAttribution(cr.first, 1, TRACKED);
  const a2 = creditAttribution(cr.second, 1, TRACKED);
  // a sack / interception / fumble recovery credits a DEFENDER (SD-119 side)
  if (a2 && offence && secondIsDefence(e)) a2.side = other(offence);
  return { ...(a1 ? { attribution: a1 } : {}), ...(a2 ? { attribution2: a2 } : {}) };
}
/** Is an event's second player on the other team (the defence)? */
export const secondIsDefence = (e: Pick<AFEvent, 'type' | 'play'>): boolean =>
  e.type === 'play' && (e.play === 'sack' || e.play === 'int' || e.play === 'fumble');

/* -------------------------- building a play (UI + voice) -------------------------- */

export interface PlayInput {
  play: PlayKind;
  /** gain (negative = loss); punt: gross yards */
  yards?: number;
  /** carrier / passer / punter / the player who fumbled */
  p1?: Who;
  /** receiver (pass) / defender (sack, interception, fumble recovery) */
  p2?: Who;
  /** turnover / punt / kickoff: where the new offence starts (own yards); punt / kickoff return yards */
  newSpot?: number;
  ret?: number;
  foul?: string; on?: Side; autoFirst?: boolean; lossOfDown?: boolean;
}

const who1 = (w?: Who) => (w?.id ? { playerId: w.id, ...(w.name ? { playerName: w.name } : {}) } : w?.name ? { playerName: w.name } : {});
const who2 = (w?: Who) => (w?.id ? { secondId: w.id, ...(w.name ? { secondName: w.name } : {}) } : w?.name ? { secondName: w.name } : {});

/** One play as the action to dispatch (play-by-play). A run / pass that
 *  reaches the goal line is a TOUCHDOWN action (carrier / receiver + passer);
 *  one that ends behind the offence's own goal line is a SAFETY for the
 *  defence. `side` is the offence (kickoff: the receiving team). */
export function buildPlay(s: AFState, side: Side, inp: PlayInput, stamp: Record<string, unknown> = {}): ScoreAction {
  const d = s.drive && s.drive.off === side ? s.drive : null;
  const y = Math.round(Number(inp.yards) || 0);
  if (d && (inp.play === 'run' || inp.play === 'pass') && d.spot + y >= s.field) {
    const yards = s.field - d.spot;
    const ev: CreditEvent = inp.play === 'run'
      ? { type: 'td', how: 'run', yards, pbp: true, ...who1(inp.p1) }
      : { type: 'td', how: 'pass', yards, pbp: true, ...who1(inp.p2), ...who2(inp.p1) };
    return { type: 'TD', side, payload: { how: ev.how, yards, pbp: true, ...stamp }, ...credit(ev) };
  }
  if (d && (inp.play === 'run' || inp.play === 'sack' || inp.play === 'kneel') && d.spot + y <= 0) {
    return { type: 'SAFETY', side: other(side), payload: { ...stamp }, ...credit({ type: 'safety', ...(inp.play === 'sack' ? who1(inp.p2) : {}) }) };
  }
  const ev: CreditEvent = { type: 'play', play: inp.play, yards: y, pbp: true, ...who1(inp.p1), ...who2(inp.p2) };
  return {
    type: 'PLAY', side,
    payload: {
      play: inp.play, yards: y, ...stamp,
      ...(inp.newSpot !== undefined ? { newSpot: inp.newSpot } : {}), ...(inp.ret !== undefined ? { ret: inp.ret } : {}),
      ...(inp.foul ? { foul: inp.foul } : {}), ...(inp.on ? { on: inp.on } : {}),
      ...(inp.autoFirst ? { autoFirst: true } : {}), ...(inp.lossOfDown ? { lossOfDown: true } : {}),
      ...(inp.p1 && !inp.p1.id && inp.p1.name ? { p1Name: inp.p1.name } : {}),
    },
    ...credit(ev, side),
  };
}

/* ------------------------------- penalties --------------------------------- */

export interface Foul { key: string; label: string; on: 'off' | 'def'; yards: number; autoFirst?: boolean; lossOfDown?: boolean }

/** A short list of common fouls (yards editable at the table). NFL / NCAA /
 *  NFHS differ on a few: NFHS defensive holding is 10 with no automatic first
 *  down and pass interference 15 without one; NFL defensive pass interference
 *  is a spot foul (we use 15). Flag yardages follow IFAF practice — verify. */
export function foulsFor(s: Pick<AFState, 'variant' | 'rules'>): Foul[] {
  if (s.variant === 'flag') return [
    { key: 'falseStart', label: 'False start / illegal motion', on: 'off', yards: 5 },
    { key: 'delay', label: 'Delay of game', on: 'off', yards: 5 },
    { key: 'flagGuard', label: 'Flag guarding', on: 'off', yards: 10 },
    { key: 'opi', label: 'Offensive pass interference', on: 'off', yards: 10, lossOfDown: true },
    { key: 'illegalPass', label: 'Illegal forward pass', on: 'off', yards: 5, lossOfDown: true },
    { key: 'offside', label: 'Offside', on: 'def', yards: 5 },
    { key: 'illegalRush', label: 'Illegal rush', on: 'def', yards: 10 },
    { key: 'illegalPull', label: 'Illegal flag pull', on: 'def', yards: 10, autoFirst: true },
    { key: 'contact', label: 'Illegal contact / holding', on: 'def', yards: 10, autoFirst: true },
    { key: 'dpi', label: 'Defensive pass interference', on: 'def', yards: 10, autoFirst: true },
    { key: 'unsOff', label: 'Unsportsmanlike (offence)', on: 'off', yards: 10 },
    { key: 'unsDef', label: 'Unsportsmanlike (defence)', on: 'def', yards: 10, autoFirst: true },
  ];
  const hs = s.rules === 'nfhs';
  const nfl = s.rules === 'nfl';
  return [
    { key: 'falseStart', label: 'False start', on: 'off', yards: 5 },
    { key: 'delay', label: 'Delay of game', on: 'off', yards: 5 },
    { key: 'formation', label: 'Illegal formation / motion', on: 'off', yards: 5 },
    { key: 'holdOff', label: 'Holding (offence)', on: 'off', yards: 10 },
    { key: 'opi', label: 'Offensive pass interference', on: 'off', yards: hs ? 15 : 10 },
    { key: 'grounding', label: 'Intentional grounding', on: 'off', yards: 10, lossOfDown: true },
    { key: 'illegalPass', label: 'Illegal forward pass', on: 'off', yards: 5, lossOfDown: true },
    { key: 'offside', label: 'Offside / encroachment', on: 'def', yards: 5 },
    { key: 'nzi', label: 'Neutral zone infraction', on: 'def', yards: 5 },
    { key: 'holdDef', label: 'Holding (defence)', on: 'def', yards: hs ? 10 : 5, autoFirst: !hs },
    { key: 'dpi', label: 'Defensive pass interference', on: 'def', yards: 15, autoFirst: !hs },
    { key: 'roughPasser', label: 'Roughing the passer', on: 'def', yards: 15, autoFirst: true },
    { key: 'facemask', label: 'Face mask', on: 'def', yards: 15, autoFirst: !hs },
    { key: 'pfOff', label: 'Personal foul (offence)', on: 'off', yards: 15 },
    { key: 'pfDef', label: 'Personal foul (defence)', on: 'def', yards: 15, autoFirst: !hs },
    { key: 'unsOff', label: 'Unsportsmanlike (offence)', on: 'off', yards: 15 },
    { key: 'unsDef', label: 'Unsportsmanlike (defence)', on: 'def', yards: 15, autoFirst: nfl },
  ];
}

/* --------------------------------- reducer --------------------------------- */

const advance = (s: AFState, d: Drive, gain: number): { drive: Drive; first: boolean; turnover: boolean } => {
  const ns = Math.max(1, Math.min(s.field - 1, d.spot + gain));
  if (ns >= d.line) return { drive: series(s, d.off, ns), first: true, turnover: false };
  if (d.down + 1 > s.downs) return { drive: series(s, other(d.off), turnoverSpot(s, ns)), first: false, turnover: true };
  return { drive: { ...d, spot: ns, down: d.down + 1 }, first: false, turnover: false };
};

/** After a score: tackle → a kickoff by `kicker`; flag → the other side's ball on its own 5. */
const afterScore = (s: AFState, kicker: Side): AFState => {
  if (s.mode !== 'pbp' || s.ended) return { ...s, drive: null, kickBy: undefined };
  if (s.variant === 'flag') return { ...s, drive: series(s, other(kicker), s.flagStart), kickBy: undefined };
  return { ...s, drive: null, kickBy: kicker };
};

/** Start overtime period `p` (Kansas: the ball on the opponent's `otSpot`). */
const otDrive = (s: AFState, off: Side | undefined): Drive | null =>
  s.mode === 'pbp' && off && s.decider === 'kansas' ? series(s, off, s.field - s.otSpot) : null;

const newOtPeriod = (s: AFState, first?: Side): AFState => ({
  ...s, plan: [...s.plan, 'ot'], period: s.period + 1, clock: { ms: 0 }, otPoss: [], otFirst: first, pendingTry: undefined,
  drive: otDrive(s, first), kickBy: undefined,
});

/** An overtime possession by `off` closed: decide the game or go on. */
function otClose(s: AFState, off: Side, at: number): AFState {
  if (s.ended || !isOT(s, s.period)) return s;
  const poss = [...s.otPoss, off];
  const st = { ...s, otPoss: poss };
  const level = st.home === st.away;
  const stop = () => ({ ...st, ended: true, clock: stopAt(st, at), played: [...st.played.slice(0, st.period - 1), periodSec(st, at)], drive: null, kickBy: undefined, pendingTry: undefined });
  if (st.decider === 'nfl' || st.decider === 'nfl_playoff') {
    // both teams have had the ball → sudden death
    return poss.length >= 2 && !level ? stop() : st;
  }
  if (poss.length % 2 === 1) return { ...st, drive: otDrive(st, other(off)) };
  if (!level) return stop();
  const played = [...st.played.slice(0, st.period - 1), 0];
  return newOtPeriod({ ...st, played }, st.otFirst ? other(st.otFirst) : undefined);
}

/** An overtime touchdown that decides the game at once (no try): the second
 *  team of a Kansas / flag round taking the lead, a defensive score, or any
 *  score once NFL sudden death has begun. */
function otTdEnds(s: AFState, side: Side, defensive: boolean): boolean {
  if (!isOT(s, s.period)) return false;
  if (defensive) return true;
  if (s.decider === 'nfl' || s.decider === 'nfl_playoff') return s.otPoss.length >= 2;
  return s.otPoss.length % 2 === 1 && s[side] > s[other(side)];
}

const ALWAYS = new Set(['CLOCK', 'SET_CLOCK', 'XI', 'STAT_ADJUST', 'REMOVE_EVENT', 'END', 'SET_DRIVE']);

export const reducer = (s: AFState, a: ScoreAction): AFState => {
  if (s.ended && !ALWAYS.has(a.type)) return s;
  const at = Number(a.payload?.at ?? 0);
  const psec = typeof a.payload?.psec === 'number' ? Math.max(0, a.payload.psec as number) : periodSec(s, at);
  const period = typeof a.payload?.period === 'number' ? (a.payload.period as number) : s.period;
  const sec = typeof a.payload?.sec === 'number' ? Math.max(0, a.payload.sec as number) : playedOffset(s, period) + psec;
  const uid = typeof a.payload?.uid === 'string' && a.payload.uid ? (a.payload.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const edit = !!a.payload?.edit;
  const p1 = a.attribution;
  const p2 = a.attribution2 ?? (a.payload?._attr2 as Attribution | undefined);
  const pname = p1?.playerName ?? (typeof a.payload?.playerName === 'string' ? (a.payload.playerName as string) : undefined);
  const w1 = p1?.playerId ? { playerId: p1.playerId, ...(pname ? { playerName: pname } : {}) } : pname ? { playerName: pname } : {};
  const w2 = p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {};
  const pbp = s.mode === 'pbp';
  const live = !edit;
  const situation = s.drive ? { off: s.drive.off, pre: { down: s.drive.down, toGo: toGo(s.drive), spot: s.drive.spot } } : {};
  const push = (st: AFState, e: Omit<AFEvent, 'id' | 'sec' | 'psec' | 'period'>): AFState =>
    ({ ...st, seq: st.seq + 1, events: [...st.events, { id: uid, sec, psec, period, ...e } as AFEvent] });
  const score = (st: AFState, sd: Side, pts: number) => ({ ...st, [sd]: st[sd] + pts }) as AFState;
  const yards = typeof a.payload?.yards === 'number' && Number.isFinite(a.payload.yards) ? Math.round(a.payload.yards as number) : undefined;
  switch (a.type) {
    case 'CLOCK': {
      if (a.payload?.run) return s.clock.since || s.ended ? s : { ...s, clock: { ms: s.clock.ms, since: at || 1 } };
      return { ...s, clock: stopAt(s, at) };
    }
    case 'SET_CLOCK': {
      const len = periodLen(s, s.period);
      const left = Math.max(0, Math.min(len, Number(a.payload?.remaining ?? len)));
      return { ...s, clock: { ms: (len - left) * 1000, ...(s.clock.since ? { since: at || s.clock.since } : {}) } };
    }
    case 'TWO_MIN': {
      // the clock stops at exactly 2:00 left (NFL two-minute warning)
      if (s.warned.includes(s.period)) return s;
      const len = periodLen(s, s.period);
      return { ...s, warned: [...s.warned, s.period], clock: { ms: Math.max(0, len - 120) * 1000 } };
    }
    case 'XI': {
      const team = a.payload?.team;
      if (team !== 'home' && team !== 'away') return s;
      const players = Array.isArray(a.payload?.players)
        ? (a.payload!.players as { id?: string; name?: string }[]).filter((x) => x?.id).map((x) => ({ id: String(x.id), name: String(x.name ?? '') }))
        : undefined;
      return { ...s, xi: { ...s.xi, [team]: players ? { players } : {} } };
    }
    case 'SET_DRIVE': {
      // the scorer places the ball (start of a half, after a kickoff, a fix)
      if (a.payload?.clear) return { ...s, drive: null, kickBy: undefined };
      const off = a.payload?.off === 'away' ? 'away' : a.payload?.off === 'home' ? 'home' : undefined;
      if (!off) return s;
      const spot = Math.max(1, Math.min(s.field - 1, Math.round(Number(a.payload?.spot ?? 25))));
      const down = Math.max(1, Math.min(s.downs, Math.round(Number(a.payload?.down ?? 1))));
      const line = a.payload?.toGo != null ? Math.min(s.field, spot + Math.max(1, Math.round(Number(a.payload.toGo)))) : lineFor(s, spot);
      return { ...s, drive: { off, down, spot, line }, kickBy: undefined };
    }
    case 'OT_FIRST': {
      const f = a.payload?.first;
      if (!isOT(s, s.period) || (f !== 'home' && f !== 'away')) return s;
      return { ...s, otFirst: f, drive: s.otPoss.length === 0 ? otDrive(s, f) ?? s.drive : s.drive };
    }
    case 'TD': {
      if (!side) return s;
      const how = (['run', 'pass', 'int', 'fumble', 'punt', 'kick', 'other'] as TdHow[]).includes(a.payload?.how as TdHow) ? (a.payload!.how as TdHow) : 'run';
      // whose possession it was: a return TD is the defence's (or the receiving team's)
      const defensive = how === 'int' || how === 'fumble';
      let st = push(score(s, side, TD_POINTS), { type: 'td', side, how, ...(yards !== undefined ? { yards } : {}), ...w1, ...w2, ...(a.payload?.pbp === true && (how === 'run' || how === 'pass') ? { pbp: true } : {}), ...situation });
      if (live && otTdEnds(st, side, defensive)) return { ...st, ended: true, clock: stopAt(st, at), played: [...st.played.slice(0, st.period - 1), periodSec(st, at)], drive: null, pendingTry: undefined };
      st = { ...st, pendingTry: side, drive: null, kickBy: undefined };
      return st;
    }
    case 'TRY': {
      if (!side) return s;
      const kind: TryKind = a.payload?.kind === 'two' ? 'two' : a.payload?.kind === 'one' ? 'one' : 'kick';
      const good = a.payload?.good === true;
      let st = push(good ? score(s, side, kind === 'two' ? 2 : 1) : s, { type: 'try', side, kind, good, ...w1, ...w2, ...(!good && a.payload?.none === true ? { none: true } : {}) });
      st = { ...st, pendingTry: undefined };
      if (!live) return st;
      st = afterScore(st, side);
      return isOT(st, st.period) ? otClose(st, side, at) : st;
    }
    case 'DEF_TRY': {
      // the defence returns a try (an interception / fumble / blocked kick) — 2 points
      if (!side) return s;
      let st = push(score(s, side, DEF_TRY_POINTS), { type: 'defTry', side, ...w1 });
      st = { ...st, pendingTry: undefined };
      if (!live) return st;
      st = afterScore(st, other(side));
      return isOT(st, st.period) ? otClose(st, other(side), at) : st;
    }
    case 'FG': {
      if (!side) return s;
      const good = a.payload?.good === true;
      let st = push(good ? score(s, side, FG_POINTS) : s, { type: 'fg', side, good, ...(yards !== undefined ? { yards } : {}), ...w1, ...situation, ...(pbp ? { off: side } : {}) });
      if (!live) return st;
      if (good) st = afterScore(st, side);
      else if (pbp) {
        const spot = typeof a.payload?.newSpot === 'number' ? (a.payload.newSpot as number) : Math.max(20, s.field - ((s.drive?.spot ?? s.field - 25) - 7));
        st = { ...st, drive: series(st, other(side), spot), kickBy: undefined };
      }
      return isOT(st, st.period) ? otClose(st, side, at) : st;
    }
    case 'SAFETY': {
      // `side` = the team that scores (the defence)
      if (!side) return s;
      let st = push(score(s, side, SAFETY_POINTS), { type: 'safety', side, ...w1, ...situation });
      if (!live) return st;
      // tackle: the team scored upon free-kicks from its own 20; flag: the scoring team's ball on its own 5 [verify]
      if (pbp && !st.ended) st = st.variant === 'flag' ? { ...st, drive: series(st, side, st.flagStart), kickBy: undefined } : { ...st, drive: null, kickBy: other(side) };
      if (isOT(st, st.period)) {
        // a safety in overtime ends it (the defence scored)
        return { ...st, ended: true, clock: stopAt(st, at), played: [...st.played.slice(0, st.period - 1), periodSec(st, at)], drive: null, kickBy: undefined };
      }
      return st;
    }
    case 'TIMEOUT': {
      if (!side) return s;
      if (live && timeoutsLeft(s, side) <= 0) return s;
      return { ...push(s, { type: 'timeout', side }), clock: stopAt(s, at) };
    }
    case 'TACKLE': {
      if (!side) return s;
      return push(s, { type: 'tackle', side, ...w1 });
    }
    case 'EJECT': {
      if (!side) return s;
      return push(s, { type: 'eject', side, ...w1 });
    }
    case 'POSS_END': {
      // overtime: a possession ended without a score (turnover, downs, missed kick)
      if (!side || !isOT(s, s.period)) return s;
      const st = push(s, { type: 'possEnd', side });
      return live ? otClose(st, side, at) : st;
    }
    case 'PLAY': {
      if (!side) return s;
      const play = a.payload?.play as PlayKind;
      if (!['run', 'pass', 'inc', 'sack', 'int', 'fumble', 'punt', 'kickoff', 'penalty', 'downs', 'kneel'].includes(play)) return s;
      const g = yards ?? 0;
      const newSpot = typeof a.payload?.newSpot === 'number' ? (a.payload.newSpot as number) : undefined;
      const on = a.payload?.on === 'home' || a.payload?.on === 'away' ? (a.payload.on as Side) : undefined;
      const base: Omit<AFEvent, 'id' | 'sec' | 'psec' | 'period'> = {
        type: 'play', side, play, yards: g, pbp: true, ...w1, ...w2, ...situation,
        ...(newSpot !== undefined ? { newSpot } : {}), ...(typeof a.payload?.ret === 'number' ? { ret: a.payload.ret as number } : {}),
        ...(typeof a.payload?.foul === 'string' ? { foul: a.payload.foul as string } : {}), ...(on ? { on } : {}),
        ...(a.payload?.autoFirst ? { autoFirst: true } : {}), ...(a.payload?.lossOfDown ? { lossOfDown: true } : {}),
        ...(!w1.playerName && typeof a.payload?.p1Name === 'string' ? { playerName: a.payload.p1Name as string } : {}),
      };
      const d = s.drive;
      let drive = d;
      let first = false;
      let closes = false;
      if (!live) return push(s, base);
      if (play === 'kickoff') {
        drive = series(s, side, newSpot ?? touchback(s));
      } else if (d && d.off === side) {
        if (play === 'run' || play === 'pass' || play === 'sack' || play === 'kneel' || play === 'inc') {
          const r = advance(s, d, play === 'inc' ? 0 : g);
          drive = r.drive; first = r.first; closes = r.turnover;
        } else if (play === 'int' || play === 'fumble') {
          drive = series(s, other(side), newSpot ?? s.field - d.spot); closes = true;
        } else if (play === 'punt') {
          const land = d.spot + g;
          drive = series(s, other(side), newSpot ?? (land >= s.field ? 20 : s.field - land + Number(a.payload?.ret ?? 0))); closes = true;
        } else if (play === 'downs') {
          drive = series(s, other(side), newSpot ?? turnoverSpot(s, d.spot)); closes = true;
        } else if (play === 'penalty') {
          const yds = Math.abs(g);
          if (on === side) {
            // on the offence: back, half the distance to its own goal at most; replay the down (or lose it)
            const ns = Math.max(1, d.spot - Math.min(yds, Math.floor(d.spot / 2)));
            const down = a.payload?.lossOfDown ? d.down + 1 : d.down;
            if (down > s.downs) { drive = series(s, other(side), turnoverSpot(s, ns)); closes = true; }
            else drive = { ...d, spot: ns, down };
          } else {
            const ns = Math.min(s.field - 1, d.spot + Math.min(yds, Math.floor((s.field - d.spot) / 2)));
            if (a.payload?.autoFirst || ns >= d.line) { drive = series(s, side, ns); first = true; }
            else drive = { ...d, spot: ns };
          }
        }
      }
      let st = push(s, { ...base, ...(first ? { first: true } : {}) });
      st = { ...st, drive, kickBy: play === 'kickoff' ? undefined : st.kickBy };
      return closes && isOT(st, st.period) ? otClose(st, side, at) : st;
    }
    case 'REMOVE_EVENT': {
      const id = String(a.payload?.id ?? '');
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e !== ev) };
      const pts = pointsOf(ev);
      return pts ? ({ ...next, [ev.side]: Math.max(0, next[ev.side] - pts) } as AFState) : next;
    }
    case 'END_PERIOD': {
      const clock = stopAt(s, at);
      const len = periodLen(s, s.period);
      const el = len ? Math.min(len, Math.floor(clock.ms / 1000)) || len : 0;
      const played = [...s.played.slice(0, s.period - 1), el];
      const base = { ...s, played, pendingTry: undefined };
      if (s.period < s.plan.length) {
        const half = endsHalf(s, s.period);
        return { ...base, period: s.period + 1, clock: { ms: 0 }, ...(half ? { drive: null, kickBy: undefined } : {}) };
      }
      const level = s.home === s.away;
      if (level && s.decider !== 'none') {
        if (!isOT(s, s.period) || s.decider !== 'nfl') {
          // regulation over (or another OT period: playoff / Kansas round)
          return { ...newOtPeriod(base, undefined), drive: null };
        }
      }
      return { ...base, clock: { ms: el * 1000 }, ended: true, drive: null, kickBy: undefined };
    }
    case 'END':
      return s.ended ? s : { ...s, ended: true, clock: stopAt(s, at), drive: null, kickBy: undefined, pendingTry: undefined };
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ----------------------------- derived figures ----------------------------- */

export const isComplete = (s: AFState): boolean => s.ended;

export function result(s: AFState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  return { winner: s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw', home: s.home, away: s.away };
}

/** Is the period in play the game's last (as the End-of-game button reads it)? */
export function isLast(s: AFState): boolean {
  if (s.period < s.plan.length) return false;
  if (s.home !== s.away || s.decider === 'none') return true;
  // level: ending regulation goes to overtime; NFL regular-season OT can end tied
  return isOT(s, s.period) && s.decider === 'nfl';
}

/** A side's team figures (comparison panel) over a period scope. */
export interface AFTeamFigures {
  points: number; touchdowns: number; fgMade: number; fgAtt: number;
  firstDowns: number; rushYds: number; passYds: number; sackYds: number; totalYards: number;
  plays: number; turnovers: number; penalties: number; penaltyYds: number; sacked: number;
  thirdConv: number; thirdAtt: number; timeouts: number; top: number;
}
export function teamFigures(s: AFState, side: Side, scope: 'all' | number = 'all', nowSec?: number): AFTeamFigures {
  const f: AFTeamFigures = {
    points: 0, touchdowns: 0, fgMade: 0, fgAtt: 0, firstDowns: 0, rushYds: 0, passYds: 0, sackYds: 0, totalYards: 0,
    plays: 0, turnovers: 0, penalties: 0, penaltyYds: 0, sacked: 0, thirdConv: 0, thirdAtt: 0, timeouts: 0, top: 0,
  };
  const inScope = (e: AFEvent) => scope === 'all' || e.period === scope;
  const evs = s.events;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    if (!inScope(e)) continue;
    if (e.side === side) f.points += pointsOf(e);
    if (e.type === 'td' && e.side === side) {
      f.touchdowns++;
      if (e.pbp && e.how === 'run') { f.rushYds += e.yards ?? 0; f.plays++; }
      if (e.pbp && e.how === 'pass') { f.passYds += e.yards ?? 0; f.plays++; }
      if (e.pre?.down === 3 && e.pbp) { f.thirdAtt++; f.thirdConv++; }
    }
    if (e.type === 'fg' && e.side === side) { f.fgAtt++; if (e.good) f.fgMade++; }
    if (e.type === 'timeout' && e.side === side) f.timeouts++;
    if (e.type === 'play') {
      if (e.play === 'penalty') { if (e.on === side) { f.penalties++; f.penaltyYds += Math.abs(e.yards ?? 0); } if (e.side === side && e.first) f.firstDowns++; continue; }
      if (e.side !== side) continue;
      if (e.first) f.firstDowns++;
      if (e.play === 'run' || e.play === 'kneel') { f.rushYds += e.yards ?? 0; f.plays++; }
      else if (e.play === 'pass') { f.passYds += e.yards ?? 0; f.plays++; }
      else if (e.play === 'inc') f.plays++;
      else if (e.play === 'sack') { f.sacked++; f.sackYds += Math.abs(e.yards ?? 0); f.plays++; }
      else if (e.play === 'int' || e.play === 'fumble') { f.turnovers++; f.plays++; }
      if (e.pre?.down === 3 && ['run', 'pass', 'inc', 'sack', 'int', 'fumble', 'kneel'].includes(e.play ?? '')) { f.thirdAtt++; if (e.first) f.thirdConv++; }
    }
  }
  f.totalYards = f.rushYds + f.passYds - f.sackYds;
  if (scope === 'all') f.top = possessionTime(s, nowSec)[side];
  return f;
}

/** Time of possession (seconds, play-by-play): the game time between plays
 *  credited to the offence at each snap. */
export function possessionTime(s: AFState, nowSec?: number): { home: number; away: number } {
  const t = { home: 0, away: 0 };
  const evs = s.events.filter((e) => e.off && (e.type === 'play' || e.type === 'td' || e.type === 'fg' || e.type === 'safety')).sort((x, y) => x.sec - y.sec);
  // the time after a play belongs to whoever has the ball next: the next snap's
  // offence, or (after the last play) the current drive
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const nx = evs[i + 1];
    const end = nx ? nx.sec : (s.ended ? playedOffset(s) + (s.played[s.period - 1] ?? 0) : nowSec ?? matchSec(s));
    const holder = nx ? nx.off! : s.drive?.off ?? e.off!;
    t[holder] += Math.max(0, end - e.sec);
  }
  return t;
}

/** SD-20 — the line under the score: the situation (play-by-play) or the OT round. */
export function afScoreLine(s: AFState, perspective?: Side): string {
  void perspective;
  if (!s || s.ended) return '';
  if (s.drive) return `${s.drive.off === 'home' ? '◀' : '▶'} ${downText(s, s.drive, true)}`;
  return '';
}

/* --------------------------- live settings (#14) --------------------------- */

export const AF_LIVE_SETTINGS: LiveSettings<AFState> = {
  title: '⚙️ Game settings',
  hint: 'Applies to this game only.',
  mode: 'config',
  fields: [
    { key: 'periodMinutes', label: 'Period length', type: 'number', default: 15, min: 1, max: 30, step: 1, hint: 'min / quarter or half' },
    { key: 'timeoutsPerHalf', label: 'Timeouts per half', type: 'number', default: 3, min: 0, max: 5, step: 1 },
    { key: 'mode', label: 'Play-by-play (downs, yards, player stats)', type: 'toggle', default: false, group: 'Detail' },
    { key: 'trackTackles', label: 'Ask who made the tackle / flag pull', type: 'toggle', default: false, group: 'Detail' },
  ] as FormatField[],
  read: (s) => ({ periodMinutes: s.periodMinutes, timeoutsPerHalf: s.timeoutsPerHalf, mode: s.mode === 'pbp', trackTackles: s.trackTackles }),
  defaults: { periodMinutes: 15, timeoutsPerHalf: 3, mode: false, trackTackles: false },
};
