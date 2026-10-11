/**
 * SD-53 / SD-54 / SD-63 — conduct, cards and penalties, timeouts, squash lets
 * and match / game durations for the six racket sports. PURE (no React Native).
 *
 * One generic action per thing, applied through each sport's own reducer, so
 * a penalty point is scored exactly like a point (game / set / match all
 * follow) and every older log replays identically (REVIEW Decision 8 — none of
 * these actions existed before):
 *
 *   CONDUCT  {side = the OFFENDER, payload {level, track?, reason?, playerId?, playerName?}}
 *     warning / fault / referee → a timeline record, no score effect
 *     point   → a penalty point to the opponent (the sport's own point path)
 *     point2  → two penalty points (table tennis, ITTF 3.5.2.2)
 *     game    → the opponent is awarded the game in play (penalty points until
 *               that game is over — so a tiebreak game awards the set)
 *     default → a record only: the screen ends the match by default (manual
 *               result "Default", with a confirm) — see RacketQuickOptions
 *   PENALTY_POINT {side = who it is awarded to, payload {pen}} — how a penalty
 *     point replays after a timeline correction (EDIT_LOG); never dispatched by
 *     a button.
 *   TIMEOUT  {side, payload {t: 'timeout' | 'medical' | 'toilet', playerId?, playerName?}}
 *     a marker; the sport's allowance is enforced (a timeout over it is ignored)
 *   LET      {side?} — squash: the rally is replayed, no point (WSF Rule 8)
 *
 * Escalation (`suggestLevel`) follows each body's schedule:
 *   tennis    ITF Point Penalty Schedule — warning → point → game (3rd and
 *             each later violation); a default is the Referee's call.
 *             Time violations (ITF Rule 29 / Code): warning, then a server
 *             loses a serve (fault) and a receiver a point.
 *   padel     FIP — warning → point → game (disqualification: referee).
 *   TT        ITTF 3.5.2 — yellow (warning) → yellow + red, 1 point → yellow +
 *             red, 2 points → referred to the referee.
 *   badminton BWF Law 16.7 — warning (yellow) → fault (red); disqualification
 *             (black) by the referee.
 *   squash    WSF Rule 15 — conduct warning / stroke / game / match (the
 *             referee may give any; the suggestion steps up one each time).
 *   pickleball USA Pickleball 13.G — technical warning → technical foul (a
 *             point to the opponent); a further foul → forfeit (ejection).
 *
 * Every new event that a scoring action adds is stamped with the action's
 * `payload.at` (the scorer's clock, sent by the racket controls) — match /
 * game / set durations are derived from those stamps (older events: none).
 */
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { isPointKind, replayPoints, type PointInput } from './rallyEdit.ts';

type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export type RacketSport = 'tennis' | 'padel' | 'badminton' | 'tabletennis' | 'squash' | 'pickleball';
export const RACKET_SPORTS: readonly RacketSport[] = ['tennis', 'padel', 'badminton', 'tabletennis', 'squash', 'pickleball'];
export type ConductLevel = 'warning' | 'point' | 'point2' | 'game' | 'default' | 'fault' | 'referee';
export type ConductTrack = 'code' | 'time';
export type TimeoutKind = 'timeout' | 'medical' | 'toilet';

/** What a conduct record / penalty point carries (LiveEvent.pen). */
export interface PenMark {
  level: ConductLevel;
  /** 'code' (default) or tennis 'time' violations — separate schedules */
  track?: ConductTrack;
  /** the offending side */
  by: Side;
  playerId?: string;
  playerName?: string;
  reason?: string;
  /** the offender's violation number on this track (1st, 2nd …) */
  n?: number;
  /** a follow-on point of one violation (the 2nd of two, a game penalty's
   *  points) — not a violation of its own */
  part?: true;
}

export interface LevelDef {
  level: ConductLevel;
  /** "Point penalty", "Yellow + red · 1 point" */
  label: string;
  icon: string;
  effect: 'none' | 'point' | 'point2' | 'game' | 'default';
}

export interface ConductRules {
  /** timeline / tile name: "Code violation", "Card", "Misconduct" … */
  title: string;
  /** the rule the schedule comes from */
  rule: string;
  levels: LevelDef[];
  /** the automatic schedule by violation number (last entry repeats) */
  ladder: ConductLevel[];
  /** violations counted per player (when one is named) rather than per side */
  perPlayer: boolean;
  reasons: string[];
  /** a short note shown with the levels */
  note?: string;
}

const L = (level: ConductLevel, label: string, icon: string, effect: LevelDef['effect']): LevelDef => ({ level, label, icon, effect });
const TENNIS_REASONS = ['Audible obscenity', 'Visible obscenity', 'Racket abuse', 'Ball abuse', 'Verbal abuse', 'Unsportsmanlike conduct', 'Coaching', 'Unreasonable delay'];

export const CONDUCT_RULES: Record<RacketSport, ConductRules> = {
  tennis: {
    title: 'Code violation', rule: 'ITF Code of Conduct — Point Penalty Schedule',
    levels: [L('warning', 'Warning', '⚠️', 'none'), L('point', 'Point penalty', '🟥', 'point'), L('game', 'Game penalty', '🟥', 'game'), L('default', 'Default', '⛔', 'default')],
    ladder: ['warning', 'point', 'game'], perPlayer: false, reasons: TENNIS_REASONS,
    note: 'After the 3rd violation each one is a game penalty — or a default, the Referee’s call.',
  },
  padel: {
    title: 'Code violation', rule: 'FIP Rules — code of conduct',
    levels: [L('warning', 'Warning', '⚠️', 'none'), L('point', 'Point penalty', '🟥', 'point'), L('game', 'Game penalty', '🟥', 'game'), L('default', 'Disqualification', '⛔', 'default')],
    ladder: ['warning', 'point', 'game'], perPlayer: false, reasons: TENNIS_REASONS,
  },
  tabletennis: {
    title: 'Card', rule: 'ITTF Handbook 3.5.2 (misbehaviour)',
    levels: [L('warning', 'Yellow card · warning', '🟨', 'none'), L('point', 'Yellow + red · 1 point', '🟥', 'point'), L('point2', 'Yellow + red · 2 points', '🟥', 'point2'), L('referee', 'Referred to the referee', '📣', 'none'), L('default', 'Disqualified (referee)', '⛔', 'default')],
    ladder: ['warning', 'point', 'point2', 'referee'], perPlayer: true,
    reasons: ['Bad language', 'Racket abuse', 'Ball abuse', 'Delaying play', 'Unsporting behaviour', 'Illegal advice'],
  },
  badminton: {
    title: 'Misconduct', rule: 'BWF Laws of Badminton 16.7',
    levels: [L('warning', 'Warning · yellow card', '🟨', 'none'), L('point', 'Fault · red card', '🟥', 'point'), L('default', 'Disqualified · black card', '⬛', 'default')],
    ladder: ['warning', 'point'], perPlayer: true,
    reasons: ['Delaying play', 'Changing the shuttle', 'Offensive behaviour', 'Coaching during a rally', 'Leaving the court'],
    note: 'Disqualification (black card) is the Referee’s decision.',
  },
  squash: {
    title: 'Conduct', rule: 'WSF Rules of Singles Squash, Rule 15',
    levels: [L('warning', 'Conduct warning', '⚠️', 'none'), L('point', 'Conduct stroke', '🟥', 'point'), L('game', 'Conduct game', '🟥', 'game'), L('default', 'Conduct match', '⛔', 'default')],
    ladder: ['warning', 'point', 'game', 'default'], perPlayer: true,
    reasons: ['Audible obscenity', 'Racket abuse', 'Dissent', 'Dangerous play', 'Time wasting', 'Unsportsmanlike conduct'],
    note: 'The referee may give any level; the suggestion steps up one each time.',
  },
  pickleball: {
    title: 'Technical', rule: 'USA Pickleball Official Rulebook 13.G',
    levels: [L('warning', 'Technical warning', '⚠️', 'none'), L('point', 'Technical foul · point', '🟥', 'point'), L('default', 'Forfeit · ejection', '⛔', 'default')],
    ladder: ['warning', 'point', 'default'], perPlayer: false,
    reasons: ['Profanity', 'Ball abuse', 'Paddle abuse', 'Arguing with an official', 'Unsportsmanlike conduct', 'Delay of game'],
  },
};

/** Tennis time violations (separate from the code schedule). */
export const TIME_VIOLATION: { title: string; rule: string; levels: LevelDef[] } = {
  title: 'Time violation', rule: 'ITF Rules of Tennis, Rule 29 · Code: time violations',
  levels: [L('warning', 'Warning', '⏱️', 'none'), L('fault', 'Fault · loss of serve', '⏱️', 'none'), L('point', 'Point penalty', '🟥', 'point')],
};

export function levelDef(sport: RacketSport, level: ConductLevel, track: ConductTrack = 'code'): LevelDef | undefined {
  const list = track === 'time' ? TIME_VIOLATION.levels : CONDUCT_RULES[sport].levels;
  return list.find((l) => l.level === level);
}

/** "Code violation · point penalty" — the timeline / undo label. */
export function conductLabel(sport: RacketSport, pen: Pick<PenMark, 'level' | 'track'>): string {
  const title = pen.track === 'time' ? TIME_VIOLATION.title : CONDUCT_RULES[sport].title;
  const d = levelDef(sport, pen.level, pen.track ?? 'code');
  return `${title} · ${(d?.label ?? pen.level).replace(/^./, (c) => c.toLowerCase())}`;
}

/** The offender's violations so far on a track (per player where the sport
 *  counts that way and a player is named, else per side). */
export function conductCount(sport: RacketSport, events: LiveEvent[], by: Side, track: ConductTrack = 'code', playerId?: string): number {
  const perPlayer = CONDUCT_RULES[sport].perPlayer && !!playerId;
  return (events ?? []).filter((e) => {
    const p = e.pen;
    if (!p || p.part || p.by !== by || (p.track ?? 'code') !== track) return false;
    return perPlayer ? p.playerId === playerId : true;
  }).length;
}

/** What the next violation should be. Tennis time violations: a warning
 *  first, then the server loses a serve (fault) and the receiver a point. */
export function suggestLevel(sport: RacketSport, events: LiveEvent[], by: Side, opts: { track?: ConductTrack; playerId?: string; serving?: boolean } = {}): ConductLevel {
  const track = opts.track ?? 'code';
  const n = conductCount(sport, events, by, track, opts.playerId);
  if (track === 'time') return n === 0 ? 'warning' : opts.serving ? 'fault' : 'point';
  const ladder = CONDUCT_RULES[sport].ladder;
  return ladder[Math.min(n, ladder.length - 1)];
}

const ORD = ['1st', '2nd', '3rd'];
export const ordinal = (n: number) => ORD[n - 1] ?? `${n}th`;

/** "2nd code violation → point penalty" */
export function suggestionText(sport: RacketSport, events: LiveEvent[], by: Side, opts: { track?: ConductTrack; playerId?: string; serving?: boolean } = {}): string {
  const track = opts.track ?? 'code';
  const n = conductCount(sport, events, by, track, opts.playerId) + 1;
  const lvl = suggestLevel(sport, events, by, opts);
  const title = track === 'time' ? TIME_VIOLATION.title : CONDUCT_RULES[sport].title;
  const d = levelDef(sport, lvl, track);
  return `${ordinal(n)} ${title.toLowerCase()} → ${(d?.label ?? lvl).toLowerCase()}`;
}

// ------------------------------------------------------------- timeouts --

export interface TimeoutRules {
  /** the kinds this sport offers */
  kinds: TimeoutKind[];
  /** team / player timeouts: per match (TT) or per game (pickleball) */
  perMatch?: number;
  perGame?: (target: number) => number;
  /** medical timeouts per side per match (absent = unlimited markers) */
  medicalPerMatch?: number;
  rule: string;
  /** "1 minute", shown on the tile */
  length?: string;
  note?: string;
}

export const TIMEOUT_RULES: Record<RacketSport, TimeoutRules> = {
  tabletennis: { kinds: ['timeout'], perMatch: 1, rule: 'ITTF 3.4.4.3', length: '1 minute' },
  pickleball: { kinds: ['timeout', 'medical'], perGame: (t) => (t >= 21 ? 3 : 2), medicalPerMatch: 1, rule: 'USA Pickleball 10.B (timeouts) · 10.C (medical)', length: '1 minute · medical up to 15 minutes' },
  tennis: { kinds: ['medical', 'toilet'], rule: 'ITF Code — medical time-out / toilet break', note: 'Markers only — no effect on the score.' },
  badminton: { kinds: [], rule: 'BWF Laws 16.2', note: 'Badminton has no timeouts — a 60 s interval at 11 and 120 s between games are the only breaks.' },
  padel: { kinds: [], rule: 'FIP Rules' },
  squash: { kinds: [], rule: 'WSF Rules' },
};

export const TIMEOUT_LABEL: Record<TimeoutKind, string> = { timeout: 'Timeout', medical: 'Medical timeout', toilet: 'Toilet break' };
export const TIMEOUT_ICON: Record<TimeoutKind, string> = { timeout: '⏱️', medical: '🩺', toilet: '🚻' };

/** Timeouts of a kind left for a side (null = no limit). `game` = the game in
 *  play (per-game allowances), `target` its points to win. */
export function timeoutsLeft(sport: RacketSport, events: LiveEvent[], side: Side, kind: TimeoutKind, at: { game?: number; target?: number } = {}): number | null {
  const r = TIMEOUT_RULES[sport];
  if (!r.kinds.includes(kind)) return 0;
  const mine = (events ?? []).filter((e) => e.kind === 'timeout' && e.tmo === kind && e.side === side);
  if (kind === 'medical') return r.medicalPerMatch == null ? null : Math.max(0, r.medicalPerMatch - mine.length);
  if (kind !== 'timeout') return null;
  if (r.perMatch != null) return Math.max(0, r.perMatch - mine.length);
  if (r.perGame) return Math.max(0, r.perGame(at.target ?? 11) - mine.filter((e) => e.game === at.game).length);
  return null;
}

// ------------------------------------------------- the generic reducer --

/** What a sport's reducer lends the generic conduct handler. */
export interface ConductOps<S> {
  sport: RacketSport;
  /** score one plain point for `side` (the sport's own point path) */
  point: (s: S, side: Side) => S;
  /** changes when the game in play is over (or the match ends) */
  gameKey: (s: S) => string;
  /** the timeline stamp + period fields for a marker now ("Game 2" / "Set 1") */
  where: (s: S) => Pick<LiveEvent, 'stamp' | 'game' | 'set'>;
  /** pickleball per-game allowance: the game's target */
  target?: (s: S) => number;
}

type Base = { events: LiveEvent[]; seq: number; ended: boolean };

const MARK_KINDS = new Set(['conduct', 'timeout', 'let']);
/** A timeline record with no score effect that a correction must keep. */
export const isMark = (e: LiveEvent): boolean => !!e.kind && MARK_KINDS.has(e.kind);

function push<S extends Base>(s: S, ev: Omit<LiveEvent, 'id'>): S {
  const id = s.seq + 1;
  return { ...s, seq: id, events: [...s.events, { id, ...ev }] };
}

/** Re-label the first event `next` added over `prev` (the penalty point). */
function tagFirst<S extends Base>(prev: S, next: S, patch: Partial<LiveEvent>): S {
  const i = prev.events.length;
  const e = next.events[i];
  if (!e) return next;
  const events = next.events.slice();
  events[i] = { ...e, ...patch };
  return { ...next, events };
}

function penaltyPoint<S extends Base>(s: S, ops: ConductOps<S>, to: Side, pen: PenMark): S {
  if (s.ended) return s;
  const next = ops.point(s, to);
  const added = next.events[s.events.length];
  const score = added?.detail && /^\d+-\d+/.test(added.detail) ? added.detail.split(' · ')[0] : undefined;
  const who = pen.playerName;
  const label = pen.part ? 'Penalty point' : conductLabel(ops.sport, pen);
  const detail = [pen.part ? undefined : pen.reason, who && !pen.part ? who : undefined, score].filter(Boolean).join(' · ') || undefined;
  return tagFirst(s, next, { icon: pen.part ? '🟥' : levelDef(ops.sport, pen.level, pen.track)?.icon ?? '🟥', label, detail, pen });
}

const LEVELS: readonly ConductLevel[] = ['warning', 'point', 'point2', 'game', 'default', 'fault', 'referee'];

/**
 * The CONDUCT / PENALTY_POINT / TIMEOUT / LET steps for a racket reducer.
 * Returns null when `a` is none of them (the sport handles it).
 */
export function applyRacketExtras<S extends Base>(s: S, a: ScoreAction, ops: ConductOps<S>): S | null {
  if (a.type === 'PENALTY_POINT') {
    // A penalty point replayed from a corrected list (side = who got it).
    const pen = a.payload?.pen as PenMark | undefined;
    if (!a.side || !pen) return s;
    return penaltyPoint(s, ops, a.side, pen);
  }
  if (a.type === 'CONDUCT') {
    const by = a.side;
    const p = a.payload ?? {};
    const level = p.level as ConductLevel;
    const track: ConductTrack = p.track === 'time' ? 'time' : 'code';
    if (s.ended || (by !== 'home' && by !== 'away') || !LEVELS.includes(level)) return s;
    const def = levelDef(ops.sport, level, track);
    if (!def) return s;
    const playerId = typeof p.playerId === 'string' && p.playerId ? p.playerId : undefined;
    const playerName = typeof p.playerName === 'string' && p.playerName ? p.playerName : undefined;
    const reason = typeof p.reason === 'string' && p.reason.trim() ? p.reason.trim().slice(0, 80) : undefined;
    const pen: PenMark = {
      level, ...(track === 'time' ? { track } : {}), by,
      ...(playerId ? { playerId } : {}), ...(playerName ? { playerName } : {}), ...(reason ? { reason } : {}),
      n: conductCount(ops.sport, s.events, by, track, playerId) + 1,
    };
    const to = opp(by);
    if (def.effect === 'point') return penaltyPoint(s, ops, to, pen);
    if (def.effect === 'point2') {
      const one = penaltyPoint(s, ops, to, pen);
      return penaltyPoint(one, ops, to, { ...pen, part: true });
    }
    const record = (x: S) => push(x, {
      ...ops.where(x), icon: def.icon, label: conductLabel(ops.sport, pen),
      detail: [reason, playerName].filter(Boolean).join(' · ') || undefined, side: by, kind: 'conduct', pen,
    });
    if (def.effect === 'game') {
      // The opponent is awarded the game in play: penalty points until it ends.
      let x = record(s);
      const key = ops.gameKey(x);
      for (let i = 0; i < 60 && !x.ended && ops.gameKey(x) === key; i++) x = penaltyPoint(x, ops, to, { ...pen, part: true });
      return x;
    }
    return record(s); // warning / fault / referee / default (the screen ends the match)
  }
  if (a.type === 'TIMEOUT') {
    const side = a.side;
    const t = a.payload?.t as TimeoutKind;
    if (s.ended || (side !== 'home' && side !== 'away') || !TIMEOUT_LABEL[t]) return s;
    const w = ops.where(s);
    const left = timeoutsLeft(ops.sport, s.events, side, t, { game: w.game, target: ops.target?.(s) });
    if (left === 0) return s;
    const playerName = typeof a.payload?.playerName === 'string' && a.payload.playerName ? a.payload.playerName : undefined;
    const playerId = typeof a.payload?.playerId === 'string' && a.payload.playerId ? a.payload.playerId : undefined;
    return push(s, { ...w, icon: TIMEOUT_ICON[t], label: TIMEOUT_LABEL[t], detail: playerName, side, kind: 'timeout', tmo: t, ...(playerId ? { playerId } : {}) });
  }
  if (a.type === 'LET') {
    if (s.ended || ops.sport !== 'squash') return s;
    const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
    return push(s, { ...ops.where(s), icon: '🔁', label: 'Let', detail: 'rally replayed · no point', ...(side ? { side } : {}), kind: 'let' });
  }
  return null;
}

// ----------------------------------------- corrections keep the records --

/**
 * An EDIT_LOG replay rebuilds the log from its points only; the conduct,
 * timeout and let records (no score effect) are put back where they were —
 * after the same number of points (anchors past the end go last). A log with
 * none of them (every older match) is untouched.
 */
export function keepMarks<S extends Base>(old: LiveEvent[], replayed: S): S {
  const marks: Array<{ anchor: number; e: LiveEvent }> = [];
  let n = 0;
  for (const e of old ?? []) {
    if (isMark(e)) marks.push({ anchor: n, e });
    else if (isPointKind(e.kind)) n += 1;
  }
  if (!marks.length) return replayed;
  let seq = replayed.seq;
  const out: LiveEvent[] = [];
  let k = 0;
  let m = 0;
  const flush = (upTo: number) => { while (m < marks.length && marks[m].anchor <= upTo) out.push({ ...marks[m++].e, id: ++seq }); };
  for (const e of replayed.events) {
    if (isPointKind(e.kind)) { flush(k); k += 1; }
    out.push(e);
  }
  flush(Number.POSITIVE_INFINITY);
  return { ...replayed, events: out, seq };
}

/** replayPoints + keepMarks — the EDIT_LOG step of every racket engine. */
export function replayKeepingMarks<S extends Base>(reducer: (s: S, a: ScoreAction) => S, cleared: S, points: PointInput[], old: LiveEvent[]): S {
  return keepMarks(old, replayPoints(reducer, cleared, points));
}

// ------------------------------------------------------------- stamps --

/** Stamp the events a step added with its `payload.at` (scorer clock, ms). */
export function stampAt<S extends Base>(prev: S, next: S, a: ScoreAction): S {
  const at = Number(a.payload?.at);
  if (!Number.isFinite(at) || at <= 0 || next === prev || a.type === 'EDIT_LOG') return next;
  const n0 = prev.events?.length ?? 0;
  if (!next.events || next.events.length <= n0) return next;
  if (n0 > 0 && next.events[n0 - 1]?.id !== prev.events[n0 - 1]?.id) return next;
  return { ...next, events: next.events.map((e, i) => (i >= n0 && e.at == null ? { ...e, at } : e)) };
}

/** Wrap a racket reducer so every step's new events carry its `at`. */
export const withStamps = <S extends Base>(core: (s: S, a: ScoreAction) => S) => (s: S, a: ScoreAction): S => stampAt(s, core(s, a), a);

/** The scorer clock on a racket action (the controls add it). */
export const stamped = (a: ScoreAction, now = Date.now()): ScoreAction => ({ ...a, payload: { ...(a.payload ?? {}), at: now } });
const STAMPED = new Set(['POINT', 'ACE', 'CONDUCT', 'TIMEOUT', 'LET']);
/** A dispatch that stamps the scoring steps (POINT / ACE / CONDUCT / TIMEOUT / LET). */
export const stampDispatch = (dispatch: (a: ScoreAction) => void) => (a: ScoreAction) => dispatch(STAMPED.has(a.type) && a.payload?.at == null ? stamped(a) : a);

// ----------------------------------------------------------- durations --

export interface Durations {
  /** first stamp → last stamp, ms (null = fewer than two stamps) */
  match: number | null;
  /** per game / set (1-based index - 1): the previous period's last stamp
   *  (or this period's first) → this period's last stamp */
  periods: Array<number | null>;
}

/** Match and game / set durations from the event stamps. */
export function durations(events: LiveEvent[]): Durations {
  let first: number | null = null;
  let last: number | null = null;
  const per = new Map<number, { min: number; max: number }>();
  let cur = 1;
  for (const e of events ?? []) {
    const p = e.game ?? e.set;
    if (typeof p === 'number' && p > 0) cur = p;
    if (typeof e.at !== 'number') continue;
    first = first == null ? e.at : Math.min(first, e.at);
    last = last == null ? e.at : Math.max(last, e.at);
    const b = per.get(cur);
    per.set(cur, b ? { min: Math.min(b.min, e.at), max: Math.max(b.max, e.at) } : { min: e.at, max: e.at });
  }
  const n = per.size ? Math.max(...per.keys()) : 0;
  const periods: Array<number | null> = [];
  for (let i = 1; i <= n; i++) {
    const b = per.get(i);
    if (!b) { periods.push(null); continue; }
    const prev = per.get(i - 1);
    const start = prev ? prev.max : b.min;
    periods.push(b.max > start ? b.max - start : null);
  }
  return { match: first != null && last != null && last > first ? last - first : null, periods };
}

/** "42 min", "1 h 05 min", "<1 min". */
export function fmtDuration(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** "⏱ 1 h 05 min · G1 21 min · G2 18 min" — null when nothing is stamped. */
export function durationLine(events: LiveEvent[], unit: 'G' | 'S'): string | null {
  const d = durations(events);
  const m = fmtDuration(d.match);
  if (!m) return null;
  const parts = d.periods.map((p, i) => { const t = fmtDuration(p); return t ? `${unit}${i + 1} ${t}` : null; }).filter(Boolean);
  return `⏱ ${m}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

/** Append the match duration to a finished match's summary detail line. */
export function withDuration<T extends { detailLine?: string }>(sum: T, events: LiveEvent[], ended: boolean): T {
  if (!ended) return sum;
  const m = fmtDuration(durations(events).match);
  return m ? { ...sum, detailLine: `${sum.detailLine ? `${sum.detailLine} · ` : ''}⏱ ${m}` } : sum;
}
