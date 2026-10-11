/**
 * Rugby union (World Rugby) — the PURE scoring core (SD-143). No React / React
 * Native, so node tests, corrections (#05 AMEND replays) and the device all
 * derive the same match from the same log. Modelled on handball (SD-102).
 *
 * Rules modelled (World Rugby Laws of the Game; sevens + age-grade variations):
 *  - Law 5 (Time): 2 halves of at most 40 minutes (15s). Sevens: 2 × 7 (a
 *    competition may play 2 × 10 in a final — verify against its rules).
 *    Age-grade halves are shorter (school presets, organiser-editable). The
 *    referee keeps time and stops the watch for stoppages, so the clock runs
 *    PAST 40:00 (the half ends when the ball next goes dead) — shown as
 *    "40:00 +1:12". Events carry the playing second of the match (`sec`, the
 *    sum of the halves as actually played) and of their half (`psec`), so a
 *    sin-bin runs on playing time across half-time.
 *  - Law 8 (Scoring): try 5, penalty try 7 (no conversion attempted),
 *    conversion 2, penalty goal 3, dropped goal 3. The kicker is credited
 *    with conversions / penalty goals / drop goals (made and attempted).
 *  - Law 9 (Foul play): yellow card = a temporary suspension of 10 minutes
 *    playing time (sevens 2 minutes — sevens variation); red card = off for
 *    the rest of the match, the team plays short. A second yellow to the same
 *    player = a red card. World Rugby's 20-minute red card global law trial
 *    (2025): an organiser option — the player is off for good, but the team
 *    may bring on a replacement after 20 minutes (two yellows then = a
 *    20-minute red). The referee can still give a full red.
 *  - Law 3 (Team): replacements (8 in senior 15s, 5 in sevens — organiser
 *    limit; 0 = unlimited), temporary replacements for a head injury
 *    assessment (HIA) or a blood injury, and rolling replacements as an
 *    age-grade option (a replaced player may come back on).
 *  - Knockouts: competition-specific — the organiser picks the decider.
 *    Standard 15s (Rugby World Cup 2023 rules): 2 × 10 min extra time, then
 *    10 min sudden death, then a kicking competition (5 kicks each, then one
 *    each). Standard sevens: sudden-death periods of 5 minutes until a team
 *    scores. In sudden death the first score wins (no conversion).
 *
 * Every credit a live action writes on a stat line comes from `eventCredits`
 * (the controls build the attribution from it, and `rugbyTotals` sums it over
 * the state), so the absolute statTotals equal the live increments (SD-19).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';
import { aggPriorFromConfig, aggregateText, levelForDecider, type AggPrior } from '../aggregate.ts';

export type Side = 'home' | 'away';
export type Variant = '15s' | '10s' | '7s';
export type KickKind = 'conv' | 'pen' | 'drop';
export type CardKind = 'yellow' | 'red';
/** what a level match does at full time (resolved — 'standard' is read from the variant) */
export type Decider = 'none' | 'et' | 'etKicks' | 'sd' | 'kicks';
export type PeriodKind = 'reg' | 'et' | 'sd';
/** optional detail (off by default, `trackDetail`) */
export type DetailKey = 'tackle' | 'missedTackle' | 'carry' | 'lineBreak' | 'turnoverWon' | 'penaltyConceded';
export type SetPiece = 'lineout' | 'scrum';

export const DETAIL_KEYS: DetailKey[] = ['tackle', 'missedTackle', 'carry', 'lineBreak', 'turnoverWon', 'penaltyConceded'];
export const DETAIL_STAT: Record<DetailKey, string> = {
  tackle: 'tackles', missedTackle: 'missedTackles', carry: 'carries', lineBreak: 'lineBreaks', turnoverWon: 'turnoversWon', penaltyConceded: 'penaltiesGivenAway',
};
export const DETAIL_LABEL: Record<DetailKey, string> = {
  tackle: 'Tackle', missedTackle: 'Missed tackle', carry: 'Carry', lineBreak: 'Line break', turnoverWon: 'Turnover won', penaltyConceded: 'Penalty conceded',
};
export const KICK_LABEL: Record<KickKind, string> = { conv: 'Conversion', pen: 'Penalty goal', drop: 'Drop goal' };
export const KICK_POINTS: Record<KickKind, number> = { conv: 2, pen: 3, drop: 3 };
export const TRY_POINTS = 5;
export const PENALTY_TRY_POINTS = 7;

export interface Who { id?: string; name?: string }

export interface RugbyEvent {
  /** stable id from the action (`payload.uid`) */
  id: string;
  type: 'try' | 'pentry' | 'kick' | 'card' | 'sub' | 'detail' | 'setpiece';
  side: Side;
  /** playing seconds since the kick-off (the halves as actually played) */
  sec: number;
  /** playing seconds into its period (past the nominal length = time added) */
  psec: number;
  period: number;
  /** try scorer / kicker / carded player / sub off / detail player */
  playerId?: string;
  playerName?: string;
  /** try assist / sub on */
  secondId?: string;
  secondName?: string;
  kick?: KickKind;
  made?: boolean;
  card?: CardKind;
  /** a red under the 20-minute red card trial (replaceable after 20') */
  red20?: boolean;
  /** a red for a second yellow */
  second?: boolean;
  /** a team official's card (name) */
  official?: string;
  /** sub: a temporary replacement (HIA / blood) */
  temp?: 'hia' | 'blood';
  /** sub: the temporarily replaced player coming back on */
  back?: boolean;
  detail?: DetailKey;
  piece?: SetPiece;
  won?: boolean;
}

export interface Kick { scored: boolean; playerId?: string; playerName?: string }
export interface XiStamp { players?: { id: string; name: string }[] }

export interface RugbyState {
  home: number;
  away: number;
  period: number;
  /** the periods so far / planned: 2 halves, then extra time / sudden death */
  plan: PeriodKind[];
  periodMinutes: number;
  etMinutes: number;
  sdMinutes: number;
  clock: { ms: number; since?: number };
  /** actual playing seconds of each finished period */
  played: number[];
  ended: boolean;
  events: RugbyEvent[];
  seq: number;
  variant: Variant;
  playersPerSide: number;
  decider: Decider;
  sinBinMinutes: number;
  /** 20-minute red card (World Rugby global law trial) offered to the scorer */
  red20: boolean;
  /** replacements allowed per team (0 = no limit) */
  maxSubs: number;
  /** rolling replacements (age-grade): a replaced player may come back on */
  rolling: boolean;
  /** optional detail: tackles, carries, line breaks, set pieces… */
  trackDetail: boolean;
  /** the kicking competition (`first` = the scorer's pick after the toss;
   *  `sdFirst` = who kicks first in sudden death, picked after 5 each) */
  shootout: { home: Kick[]; away: Kick[]; first: Side; sdFirst?: Side } | null;
  shootoutWinner?: Side;
  agg?: AggPrior;
  xi?: { home?: XiStamp; away?: XiStamp };
}

/* --------------------------------- format ---------------------------------- */

export const RUGBY_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  senior: { label: '15s · 2 × 40', set: { variant: '15s', playersPerSide: 15, periodMinutes: 40, sinBinMinutes: 10, maxSubs: 8, rolling: false, etMinutes: 10, sdMinutes: 10 } },
  u18: { label: 'U18 15s · 2 × 35', set: { variant: '15s', playersPerSide: 15, periodMinutes: 35, sinBinMinutes: 10, maxSubs: 8, rolling: false, etMinutes: 10, sdMinutes: 10 } },
  u16: { label: 'U16 15s · 2 × 30', set: { variant: '15s', playersPerSide: 15, periodMinutes: 30, sinBinMinutes: 10, maxSubs: 0, rolling: true, etMinutes: 10, sdMinutes: 10 } },
  u14: { label: 'U14 · 2 × 25, rolling subs', set: { variant: '15s', playersPerSide: 15, periodMinutes: 25, sinBinMinutes: 10, maxSubs: 0, rolling: true, etMinutes: 10, sdMinutes: 10 } },
  tens: { label: '10s · 2 × 10', set: { variant: '10s', playersPerSide: 10, periodMinutes: 10, sinBinMinutes: 2, maxSubs: 5, rolling: false, etMinutes: 5, sdMinutes: 5 } },
  sevens: { label: 'Sevens · 2 × 7', set: { variant: '7s', playersPerSide: 7, periodMinutes: 7, sinBinMinutes: 2, maxSubs: 5, rolling: false, etMinutes: 5, sdMinutes: 5 } },
  sevensFinal: { label: 'Sevens final · 2 × 10', set: { variant: '7s', playersPerSide: 7, periodMinutes: 10, sinBinMinutes: 2, maxSubs: 5, rolling: false, etMinutes: 5, sdMinutes: 5 } },
};

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);
const num = (v: unknown, d: number, min = 0) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : Math.max(min, n); };

export const variantOf = (config?: Record<string, unknown>): Variant => {
  const v = config?.variant;
  if (v === '7s' || v === '10s' || v === '15s') return v;
  const n = Number(config?.playersPerSide);
  return n === 7 ? '7s' : n === 10 ? '10s' : '15s';
};
/** 'standard' (the knockout default) → the variant's rule: sevens / tens
 *  sudden-death periods, 15s extra time + sudden death + kicks. */
export function resolveDecider(d: unknown, variant: Variant): Decider {
  if (d === 'standard') return variant === '15s' ? 'et' : 'sd';
  return d === 'et' || d === 'etKicks' || d === 'sd' || d === 'kicks' ? d : 'none';
}

export const init = (config?: Record<string, unknown>): RugbyState => {
  const variant = variantOf(config);
  const p7 = variant === '7s';
  const p10 = variant === '10s';
  return {
    home: 0, away: 0, period: 1, plan: ['reg', 'reg'],
    periodMinutes: num(config?.periodMinutes, p7 ? 7 : p10 ? 10 : 40, 1),
    etMinutes: num(config?.etMinutes, p7 || p10 ? 5 : 10, 1),
    sdMinutes: num(config?.sdMinutes, p7 || p10 ? 5 : 10, 1),
    clock: { ms: 0 }, played: [], ended: false, events: [], seq: 0,
    variant,
    playersPerSide: num(config?.playersPerSide, p7 ? 7 : p10 ? 10 : 15, 1),
    decider: resolveDecider(config?.decider, variant),
    sinBinMinutes: num(config?.sinBinMinutes, p7 || p10 ? 2 : 10, 1),
    red20: bool(config?.red20, false),
    maxSubs: num(config?.maxSubs, p7 || p10 ? 5 : 8),
    rolling: bool(config?.rolling, false),
    trackDetail: bool(config?.trackDetail, false),
    shootout: null,
    ...(aggPriorFromConfig(config) ? { agg: aggPriorFromConfig(config) } : {}),
  };
};

/* ---------------------------------- clock ---------------------------------- */

/** Nominal length (seconds) of period `p`. */
export function periodLen(s: Pick<RugbyState, 'plan' | 'periodMinutes' | 'etMinutes' | 'sdMinutes'>, p: number): number {
  const k = s.plan[p - 1] ?? 'reg';
  return (k === 'reg' ? s.periodMinutes : k === 'et' ? s.etMinutes : s.sdMinutes) * 60;
}
/** Nominal match time before period `p` (what the scoreboard clock shows at its start). */
export function nominalOffset(s: Pick<RugbyState, 'plan' | 'periodMinutes' | 'etMinutes' | 'sdMinutes'>, p: number): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += periodLen(s, i);
  return t;
}
/** Playing seconds before period `p`: the finished periods as played (nominal after). */
export function playedOffset(s: RugbyState, p = s.period): number {
  let t = 0;
  for (let i = 1; i < p; i++) t += s.played[i - 1] ?? periodLen(s, i);
  return t;
}
/** Seconds played in the current period at `now` (NOT capped — time added runs on). */
export function periodSec(s: RugbyState, now = 0): number {
  const ms = s.clock.ms + (s.clock.since && now ? Math.max(0, now - s.clock.since) : 0);
  return Math.floor(ms / 1000);
}
export const matchSec = (s: RugbyState, now = 0): number => playedOffset(s) + periodSec(s, now);
export const running = (s: RugbyState): boolean => !!s.clock.since && !s.ended;
export const periodStarted = (s: RugbyState): boolean => s.clock.ms > 0 || !!s.clock.since;
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** The scoreboard clock for period `p` at `psec`: "23:15", or "40:00 +1:12" in time added. */
export function clockAt(s: Pick<RugbyState, 'plan' | 'periodMinutes' | 'etMinutes' | 'sdMinutes'>, p: number, psec: number): string {
  const len = periodLen(s, p);
  const off = nominalOffset(s, p);
  if (psec <= len) return mmss(off + psec);
  const over = psec - len;
  return `${mmss(off + len)} +${Math.floor(over / 60)}:${String(Math.floor(over % 60)).padStart(2, '0')}`;
}
export const clockFace = (s: RugbyState, now = 0): string => clockAt(s, s.period, periodSec(s, now));
/** The minute as rugby reports it: "23'", "40+2'". */
export function minuteText(s: Pick<RugbyState, 'plan' | 'periodMinutes' | 'etMinutes' | 'sdMinutes'>, p: number, psec: number): string {
  const len = periodLen(s, p);
  const off = nominalOffset(s, p);
  if (psec <= len) return `${Math.max(1, Math.ceil((off + psec) / 60))}'`;
  return `${(off + len) / 60}+${Math.max(1, Math.ceil((psec - len) / 60))}'`;
}
export const totalPeriods = (s: Pick<RugbyState, 'plan'>): number => s.plan.length;
export const isExtraTime = (s: Pick<RugbyState, 'plan'>, p: number): boolean => (s.plan[p - 1] ?? 'reg') !== 'reg';
export const isSuddenDeath = (s: Pick<RugbyState, 'plan'>, p: number): boolean => s.plan[p - 1] === 'sd';
/** "H1" / "H2" / "ET1" / "ET2" / "SD" (sevens: "SD1", "SD2"…). */
export function periodName(s: Pick<RugbyState, 'plan'>, p: number): string {
  const k = s.plan[p - 1] ?? 'reg';
  const nth = s.plan.slice(0, p).filter((x) => x === k).length;
  if (k === 'reg') return `H${nth}`;
  if (k === 'et') return `ET${nth}`;
  return s.plan.filter((x) => x === 'sd').length > 1 ? `SD${nth}` : 'SD';
}
export function periodLong(s: Pick<RugbyState, 'plan'>, p: number): string {
  const k = s.plan[p - 1] ?? 'reg';
  const nth = s.plan.slice(0, p).filter((x) => x === k).length;
  if (k === 'reg') return nth === 1 ? '1st half' : '2nd half';
  if (k === 'et') return `Extra time · ${nth === 1 ? '1st' : '2nd'} half`;
  return `Sudden death${s.plan.filter((x) => x === 'sd').length > 1 ? ` ${nth}` : ''} · first score wins`;
}

const stopAt = (s: RugbyState, at: number): RugbyState['clock'] =>
  s.clock.since ? { ms: s.clock.ms + Math.max(0, at - s.clock.since) } : s.clock;

/** The periods a level match goes on to at the end of the current last period. */
export function nextPlan(s: Pick<RugbyState, 'plan' | 'decider'>): PeriodKind[] {
  const last = s.plan[s.plan.length - 1];
  if (last === 'reg') {
    if (s.decider === 'et' || s.decider === 'etKicks') return ['et', 'et'];
    if (s.decider === 'sd') return ['sd'];
    return [];
  }
  if (last === 'et') return s.decider === 'et' ? ['sd'] : [];
  if (last === 'sd') return s.decider === 'sd' ? ['sd'] : [];
  return [];
}
/** Does a level match need a kicking competition after the last period? */
export const kicksAfter = (d: Decider): boolean => d === 'et' || d === 'etKicks' || d === 'kicks';

/* --------------------------------- points ---------------------------------- */

export function pointsOf(e: Pick<RugbyEvent, 'type' | 'kick' | 'made'>): number {
  if (e.type === 'try') return TRY_POINTS;
  if (e.type === 'pentry') return PENALTY_TRY_POINTS;
  if (e.type === 'kick' && e.made) return KICK_POINTS[e.kick ?? 'pen'];
  return 0;
}
/** Tries per side (penalty tries included — Law 8). */
export function triesOf(s: Pick<RugbyState, 'events'>): { home: number; away: number } {
  const t = { home: 0, away: 0 };
  for (const e of s.events) if (e.type === 'try' || e.type === 'pentry') t[e.side] += 1;
  return t;
}

/* --------------------------------- credits --------------------------------- */

/** Every key a live rugby action credits (statTotals owns all of them). */
export const LIVE_KEYS = [
  'points', 'tries', 'tryAssists', 'conversions', 'conversionAttempts', 'penGoals', 'penGoalAttempts', 'dropGoals', 'dropGoalAttempts',
  'yellowCards', 'redCards', 'soTaken', 'soGoals',
] as const;
export const DETAIL_STATS = DETAIL_KEYS.map((k) => DETAIL_STAT[k]);
const MADE: Record<KickKind, [string, string]> = { conv: ['conversions', 'conversionAttempts'], pen: ['penGoals', 'penGoalAttempts'], drop: ['dropGoals', 'dropGoalAttempts'] };

type Credit = { playerId: string; playerName?: string; stats: Record<string, number> };

/** The stat-line credits one event writes: [primary player, second player]. */
export function eventCredits(e: Pick<RugbyEvent, 'type' | 'playerId' | 'playerName' | 'secondId' | 'secondName' | 'kick' | 'made' | 'card' | 'second' | 'official' | 'detail'>): { first?: Credit; second?: Credit } {
  const p = (stats: Record<string, number>) => (e.playerId && !e.official ? { playerId: e.playerId, playerName: e.playerName, stats } : undefined);
  const q = (stats: Record<string, number>) => (e.secondId ? { playerId: e.secondId, playerName: e.secondName, stats } : undefined);
  switch (e.type) {
    case 'try':
      return { first: p({ points: TRY_POINTS, tries: 1 }), second: q({ tryAssists: 1 }) };
    case 'kick': {
      const [m, a] = MADE[e.kick ?? 'pen'];
      return { first: p(e.made ? { points: KICK_POINTS[e.kick ?? 'pen'], [m]: 1, [a]: 1 } : { [a]: 1 }) };
    }
    case 'card':
      if (e.card === 'yellow') return { first: p({ yellowCards: 1 }) };
      return { first: p(e.second ? { redCards: 1, yellowCards: 1 } : { redCards: 1 }) };
    case 'detail':
      return e.detail ? { first: p({ [DETAIL_STAT[e.detail]]: 1 }) } : {};
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

const samePlayer = (e: RugbyEvent, who: Who) => (who.id && e.playerId === who.id) || (!who.id && !!who.name && e.playerName === who.name);
/** Yellow cards a player has had this match (the next one is a red). */
export const yellowsOf = (s: RugbyState, side: Side, who: Who): number =>
  s.events.filter((e) => e.type === 'card' && e.card === 'yellow' && e.side === side && !e.official && samePlayer(e, who)).length;
/** Permanent replacements a side has used (temporary HIA / blood ones and returns don't count). */
export const subsUsed = (s: RugbyState, side: Side): number =>
  s.events.filter((e) => e.type === 'sub' && e.side === side && !e.temp && !e.back && (e.playerId || e.playerName)).length;
/** Temporary replacements still open: the player off (HIA / blood) and who replaced them. */
export function openTemps(s: RugbyState, side: Side): { off: Who; on: Who; temp: 'hia' | 'blood'; sec: number; id: string }[] {
  const open: { off: Who; on: Who; temp: 'hia' | 'blood'; sec: number; id: string }[] = [];
  for (const e of s.events) {
    if (e.type !== 'sub' || e.side !== side) continue;
    if (e.temp) open.push({ off: { id: e.playerId, name: e.playerName }, on: { id: e.secondId, name: e.secondName }, temp: e.temp, sec: e.sec, id: e.id });
    else if (e.back) {
      const i = open.findIndex((o) => (o.off.id && o.off.id === e.secondId) || (!o.off.id && o.off.name === e.secondName));
      if (i >= 0) open.splice(i, 1);
    }
  }
  return open;
}

/* ---------------------------- kicking competition --------------------------- */

/** 5 kicks each alternately, decided as soon as a side can't catch up; then
 *  one each until a side leads after equal kicks (RWC 2023 rules). */
export function decideShootout(h: Kick[], a: Kick[]): Side | undefined {
  const hs = h.filter((k) => k.scored).length;
  const as = a.filter((k) => k.scored).length;
  if (h.length <= 5 && a.length <= 5) {
    if (hs > as + Math.max(0, 5 - a.length)) return 'home';
    if (as > hs + Math.max(0, 5 - h.length)) return 'away';
  }
  if (h.length === a.length && h.length >= 5 && hs !== as) return hs > as ? 'home' : 'away';
  return undefined;
}
export function nextKicker(so: NonNullable<RugbyState['shootout']>): Side {
  const n = so.home.length + so.away.length;
  const lead: Side = n >= 10 && so.sdFirst ? so.sdFirst : so.first;
  const other: Side = lead === 'home' ? 'away' : 'home';
  const behind: Side | undefined = so.home.length < so.away.length ? 'home' : so.away.length < so.home.length ? 'away' : undefined;
  return behind ?? (n % 2 === 0 ? lead : other);
}
export const needsSdPick = (s: Pick<RugbyState, 'shootout' | 'shootoutWinner'>): boolean =>
  !!s.shootout && !s.shootoutWinner && !s.shootout.sdFirst && s.shootout.home.length === 5 && s.shootout.away.length === 5;
export const soScore = (s: Pick<RugbyState, 'shootout'>) => ({
  home: s.shootout?.home.filter((k) => k.scored).length ?? 0,
  away: s.shootout?.away.filter((k) => k.scored).length ?? 0,
});

/* --------------------------------- reducer --------------------------------- */

const SO_ACTIONS = new Set(['START_SHOOTOUT', 'SO', 'SO_ORDER', 'XI', 'STAT_ADJUST', 'REMOVE_EVENT', 'END']);
const kickOf = (v: unknown): KickKind => (v === 'conv' || v === 'drop' ? v : 'pen');

/** A score in sudden death ends the match at once (no conversion). */
const sdEnd = (st: RugbyState, at: number, edit: boolean): RugbyState =>
  !edit && isSuddenDeath(st, st.period) && st.home !== st.away ? { ...st, ended: true, clock: stopAt(st, at), played: [...st.played.slice(0, st.period - 1), periodSec(st, at)] } : st;

export const reducer = (s: RugbyState, a: ScoreAction): RugbyState => {
  if (s.ended && !SO_ACTIONS.has(a.type)) return s;
  const at = Number(a.payload?.at ?? 0);
  const psec = typeof a.payload?.psec === 'number' ? Math.max(0, a.payload.psec as number) : periodSec(s, at);
  const period = typeof a.payload?.period === 'number' ? (a.payload.period as number) : s.period;
  const sec = typeof a.payload?.sec === 'number' ? Math.max(0, a.payload.sec as number) : playedOffset(s, period) + psec;
  const uid = typeof a.payload?.uid === 'string' && a.payload.uid ? (a.payload.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const p1 = a.attribution;
  const p2 = second(a);
  const edit = !!a.payload?.edit;
  const push = (st: RugbyState, e: Omit<RugbyEvent, 'id' | 'sec' | 'psec' | 'period'>): RugbyState =>
    ({ ...st, seq: st.seq + 1, events: [...st.events, { id: uid, sec, psec, period, ...e } as RugbyEvent] });
  const pid = p1?.playerId ?? (typeof a.payload?.playerId === 'string' ? (a.payload.playerId as string) : undefined);
  const pname = p1?.playerName ?? (typeof a.payload?.playerName === 'string' ? (a.payload.playerName as string) : undefined);
  const who1 = pid ? { playerId: pid, ...(pname ? { playerName: pname } : {}) } : pname ? { playerName: pname } : {};
  const who2 = p2?.playerId ? { secondId: p2.playerId, ...(p2.playerName ? { secondName: p2.playerName } : {}) } : {};
  const score = (st: RugbyState, sd: Side, pts: number) => ({ ...st, [sd]: st[sd] + pts }) as RugbyState;
  switch (a.type) {
    case 'CLOCK': {
      if (a.payload?.run) return s.clock.since ? s : { ...s, clock: { ms: s.clock.ms, since: at || 1 } };
      return { ...s, clock: stopAt(s, at) };
    }
    case 'SET_CLOCK': {
      const v = Math.max(0, Math.min(periodLen(s, s.period) + 1800, Number(a.payload?.periodSec ?? 0)));
      return { ...s, clock: { ms: v * 1000, ...(s.clock.since ? { since: at || s.clock.since } : {}) } };
    }
    case 'XI': {
      const team = a.payload?.team;
      if (team !== 'home' && team !== 'away') return s;
      const players = Array.isArray(a.payload?.players)
        ? (a.payload!.players as { id?: string; name?: string }[]).filter((x) => x?.id).map((x) => ({ id: String(x.id), name: String(x.name ?? '') }))
        : undefined;
      return { ...s, xi: { ...s.xi, [team]: players ? { players } : {} } };
    }
    case 'TRY': {
      if (!side) return s;
      return sdEnd(push(score(s, side, TRY_POINTS), { type: 'try', side, ...who1, ...who2 }), at, edit);
    }
    case 'PENALTY_TRY': {
      if (!side) return s;
      return sdEnd(push(score(s, side, PENALTY_TRY_POINTS), { type: 'pentry', side }), at, edit);
    }
    case 'KICK': {
      if (!side) return s;
      const kick = kickOf(a.payload?.kick);
      const made = a.payload?.made === true;
      const next = push(made ? score(s, side, KICK_POINTS[kick]) : s, { type: 'kick', side, kick, made, ...who1 });
      return made ? sdEnd(next, at, edit) : next;
    }
    case 'CARD': {
      if (!side) return s;
      const card: CardKind = a.payload?.card === 'red' ? 'red' : 'yellow';
      const official = typeof a.payload?.official === 'string' ? (a.payload.official as string) || 'Team official' : undefined;
      return push(s, {
        type: 'card', side, card, ...(official ? { official, playerName: official } : who1),
        ...(card === 'red' && a.payload?.red20 === true ? { red20: true } : {}),
        ...(card === 'red' && a.payload?.second === true && !official ? { second: true } : {}),
      });
    }
    case 'SUB': {
      if (!side) return s;
      const off = { id: a.payload?.offId as string | undefined, name: a.payload?.offName as string | undefined };
      const on = { id: a.payload?.onId as string | undefined, name: a.payload?.onName as string | undefined };
      if (!off.name && !on.name && !off.id && !on.id) return s;
      const temp = a.payload?.temp === 'hia' || a.payload?.temp === 'blood' ? a.payload.temp : undefined;
      return push(s, {
        type: 'sub', side,
        ...(off.id ? { playerId: off.id } : {}), ...(off.name ? { playerName: off.name } : {}),
        ...(on.id ? { secondId: on.id } : {}), ...(on.name ? { secondName: on.name } : {}),
        ...(temp ? { temp } : {}), ...(a.payload?.back === true ? { back: true } : {}),
      });
    }
    case 'DETAIL': {
      const d = a.payload?.detail as DetailKey;
      if (!side || !DETAIL_KEYS.includes(d)) return s;
      return push(s, { type: 'detail', side, detail: d, ...who1 });
    }
    case 'SET_PIECE': {
      // a lineout / scrum on the side's own throw / feed: won or lost
      const piece = a.payload?.piece === 'scrum' ? 'scrum' : 'lineout';
      if (!side) return s;
      return push(s, { type: 'setpiece', side, piece, won: a.payload?.won !== false });
    }
    case 'REMOVE_EVENT': {
      const id = String(a.payload?.id ?? '');
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      const next = { ...s, events: s.events.filter((e) => e !== ev) };
      const pts = pointsOf(ev);
      return pts ? ({ ...next, [ev.side]: Math.max(0, next[ev.side] - pts) } as RugbyState) : next;
    }
    case 'END_PERIOD': {
      const clock = stopAt(s, at);
      const len = clock.ms > 0 ? Math.floor(clock.ms / 1000) : periodLen(s, s.period);
      const played = [...s.played.slice(0, s.period - 1), len];
      if (s.period < s.plan.length) return { ...s, played, period: s.period + 1, clock: { ms: 0 } };
      const more = levelForDecider(s) ? nextPlan(s) : [];
      if (more.length) return { ...s, played, plan: [...s.plan, ...more], period: s.period + 1, clock: { ms: 0 } };
      return { ...s, played, clock: { ms: len * 1000 }, ended: true };
    }
    case 'END':
      return s.ended ? s : { ...s, ended: true, clock: stopAt(s, at) };
    case 'START_SHOOTOUT': {
      if (!s.ended || !levelForDecider(s) || s.shootout || !kicksAfter(s.decider)) return s;
      return { ...s, shootout: { home: [], away: [], first: a.payload?.first === 'away' ? 'away' : 'home' } };
    }
    case 'SO_ORDER': {
      const f = a.payload?.first;
      if (!needsSdPick(s) || (f !== 'home' && f !== 'away')) return s;
      return { ...s, shootout: { ...s.shootout!, sdFirst: f } };
    }
    case 'SO': {
      if (!s.shootout || s.shootoutWinner || !side) return s;
      const kick: Kick = { scored: a.payload?.scored === true, ...(p1?.playerId ? { playerId: p1.playerId } : {}), ...(p1?.playerName ? { playerName: p1.playerName } : {}) };
      const so = { ...s.shootout, [side]: [...s.shootout[side], kick] };
      return { ...s, shootout: so, shootoutWinner: decideShootout(so.home, so.away) };
    }
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ----------------------------- derived figures ----------------------------- */

export const levelAtEnd = (s: RugbyState): boolean => levelForDecider(s);
export const aggLine = (s: RugbyState): string | undefined => aggregateText(s);

export const isComplete = (s: RugbyState): boolean =>
  s.ended && (!levelForDecider(s) || !kicksAfter(s.decider) || s.shootoutWinner != null);

export function result(s: RugbyState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  const byPoints = s.home > s.away ? 'home' : s.away > s.home ? 'away' : undefined;
  const winner = s.agg ? (s.shootoutWinner ?? byPoints ?? 'draw') : (byPoints ?? s.shootoutWinner ?? 'draw');
  return { winner, home: s.home, away: s.away };
}

/** A side's team figures (comparison panel) over a period scope. */
export interface RugbyTeamFigures {
  points: number; tries: number; penaltyTries: number;
  conversions: number; conversionAttempts: number; penGoals: number; penGoalAttempts: number; dropGoals: number; dropGoalAttempts: number;
  yellowCards: number; redCards: number;
  lineoutsWon: number; lineoutsLost: number; scrumsWon: number; scrumsLost: number;
  detail: Record<string, number>;
}
export function teamFigures(s: RugbyState, side: Side, scope: 'all' | number = 'all'): RugbyTeamFigures {
  const f: RugbyTeamFigures = {
    points: 0, tries: 0, penaltyTries: 0, conversions: 0, conversionAttempts: 0, penGoals: 0, penGoalAttempts: 0, dropGoals: 0, dropGoalAttempts: 0,
    yellowCards: 0, redCards: 0, lineoutsWon: 0, lineoutsLost: 0, scrumsWon: 0, scrumsLost: 0, detail: {},
  };
  for (const e of s.events) {
    if (e.side !== side || (scope !== 'all' && e.period !== scope)) continue;
    f.points += pointsOf(e);
    if (e.type === 'try') f.tries++;
    else if (e.type === 'pentry') { f.tries++; f.penaltyTries++; }
    else if (e.type === 'kick') {
      const [m, att] = MADE[e.kick ?? 'pen'] as [keyof RugbyTeamFigures, keyof RugbyTeamFigures];
      (f[att] as number)++;
      if (e.made) (f[m] as number)++;
    } else if (e.type === 'card' && !e.official) {
      if (e.card === 'yellow') f.yellowCards++;
      else { f.redCards++; if (e.second) f.yellowCards++; }
    } else if (e.type === 'setpiece') {
      if (e.piece === 'scrum') { if (e.won) f.scrumsWon++; else f.scrumsLost++; } else if (e.won) f.lineoutsWon++; else f.lineoutsLost++;
    } else if (e.type === 'detail' && e.detail) f.detail[DETAIL_STAT[e.detail]] = (f.detail[DETAIL_STAT[e.detail]] ?? 0) + 1;
  }
  return f;
}

/** SD-20 — the line under the score: the kicking competition ("Kicks 4–3"). */
export function rugbyScoreLine(s: RugbyState, perspective?: Side): string {
  if (!s?.shootout) return '';
  const so = soScore(s);
  return perspective === 'away' ? `Kicks ${so.away}–${so.home}` : `Kicks ${so.home}–${so.away}`;
}

/** SD-17 standings units: tries per side (the try bonus and the tries tie-breaks). */
export const rugbyStandingsUnits = (s: RugbyState) => (s && Array.isArray(s.events) ? { tries: triesOf(s) } : null);

/* --------------------------- live settings (#14) --------------------------- */

export const RUGBY_LIVE_SETTINGS: LiveSettings<RugbyState> = {
  title: '⚙️ Match settings',
  hint: 'Applies to this match only.',
  mode: 'config',
  fields: [
    { key: 'periodMinutes', label: 'Half length', type: 'number', default: 40, min: 1, max: 40, step: 1, hint: 'min / half' },
    { key: 'sinBinMinutes', label: 'Sin-bin', type: 'number', default: 10, min: 1, max: 10, step: 1, hint: 'minutes' },
    { key: 'trackDetail', label: 'Tackles, carries, set pieces', type: 'toggle', default: false, group: 'Detail' },
  ] as FormatField[],
  read: (s) => ({ periodMinutes: s.periodMinutes, sinBinMinutes: s.sinBinMinutes, trackDetail: s.trackDetail }),
  defaults: { periodMinutes: 40, sinBinMinutes: 10, trackDetail: false },
};
