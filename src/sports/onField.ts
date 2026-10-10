/**
 * SD-29 (GEN-19) — the time-on-field / on-court tracker. PURE: no React, no
 * sport imports, so every sport (and node tests) derives the same figures from
 * its event log.
 *
 * A sport adapter turns its state into a `FieldLog`: the starters per side and
 * a list of field events on ONE match clock `t` (minutes for timed sports;
 * any increasing number — e.g. the point order — for set sports). The tracker
 * replays it and gives, per player:
 *   - `minutes` on the field (the adapter chooses the clock convention: football
 *     regulation minutes with added time counted as the end of its half,
 *     basketball period-clock minutes, hockey / handball game-clock minutes);
 *   - `started`, `plusMinus` (team points / goals for minus against while on);
 *   - `periods` they were on in (volleyball sets played);
 *   - sendings-off and suspensions;
 * and, for the live UI, who is on the field now, who is suspended (with the
 * time they return) and how many players each side is short.
 *
 * Events (processed in `t` order; equal `t` keeps log order):
 *   sub      off ⬇ / on ⬆ (either may be missing — older logs)
 *   enter    a player joins without replacing anyone (credited in a set)
 *   off      sent off for good: football / hockey red, handball
 *            disqualification, basketball foul-out / ejection. `shortFor` =
 *            how long the side plays a player down: undefined = the rest of the
 *            match (football / hockey red), a number = minutes (handball: 2,
 *            then a team-mate may come on), 0 = replaced at once (basketball)
 *   suspend  a timed suspension (hockey green 2' / yellow 5–10', handball 2',
 *            kabaddi yellow 2', a football sin-bin): the player is off and the
 *            side is short until `t + minutes`, then he is back AUTOMATICALLY
 *   score    `points` for a side (drives +/-)
 *   period   period / set `period` starts at `t`
 */
import type { Suspension } from './statSchema.ts';

export type Side = 'home' | 'away';
export interface Who { id?: string; name?: string }

export type FieldEvent =
  | { kind: 'sub'; t: number; side: Side; off?: Who; on?: Who }
  | { kind: 'enter'; t: number; side: Side; who: Who }
  | { kind: 'off'; t: number; side: Side; who: Who; shortFor?: number }
  | { kind: 'suspend'; t: number; side: Side; who: Who; minutes: number }
  | { kind: 'score'; t: number; side: Side; points: number }
  | { kind: 'period'; t: number; period: number };

export interface FieldLog {
  starters: { home: Who[]; away: Who[] };
  events: FieldEvent[];
  /** the match clock now (live) or at the end of the match */
  end: number;
  /** id ↔ name pairs, so name-only events (older logs) resolve to an id */
  people?: Who[];
  /** the period the match starts in (default 1) */
  firstPeriod?: number;
}

export interface PlayerField {
  /** the id when known, else `name:<name>` */
  key: string;
  id?: string;
  name?: string;
  side: Side;
  started: boolean;
  /** was on the field at some point (a starter, or came on — even at the
   *  final whistle). False = only named by an event (a red card on the bench) */
  played: boolean;
  /** raw clock time on the field (the adapter rounds per its convention) */
  minutes: number;
  plusMinus: number;
  /** periods / sets the player was on the field in */
  periods: number[];
  spells: { from: number; to: number }[];
  sentOff: boolean;
  suspensions: number;
  /** clock time spent suspended (up to `end`) */
  suspendedMinutes: number;
}

export interface ActiveSuspension {
  key: string;
  id?: string;
  name?: string;
  side: Side;
  from: number;
  until: number;
}

export interface FieldResult {
  players: PlayerField[];
  /** on the field at `end`, in the order they came on */
  onField: { home: PlayerField[]; away: PlayerField[] };
  /** suspensions still running at `end` */
  suspended: ActiveSuspension[];
  /** players each side is short at `end` (suspensions + sendings-off not yet served) */
  short: { home: number; away: number };
}

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** Replay a field log. */
export function trackField(log: FieldLog): FieldResult {
  // id ↔ name resolution: an id wins; a name maps to the id it was seen with.
  const idOfName = new Map<string, string>();
  const note = (w?: Who) => { if (w?.id && w.name && !idOfName.has(w.name)) idOfName.set(w.name, w.id); };
  for (const w of log.people ?? []) note(w);
  for (const w of [...log.starters.home, ...log.starters.away]) note(w);
  for (const e of log.events) {
    if (e.kind === 'sub') { note(e.off); note(e.on); }
    else if (e.kind === 'enter' || e.kind === 'off' || e.kind === 'suspend') note(e.who);
  }
  const keyOf = (w?: Who): string | undefined => {
    if (!w) return undefined;
    const id = w.id || (w.name ? idOfName.get(w.name) : undefined);
    return id ? id : w.name ? `name:${w.name}` : undefined;
  };

  const players = new Map<string, PlayerField>();
  const ensure = (w: Who, side: Side): PlayerField | undefined => {
    const key = keyOf(w);
    if (!key) return undefined;
    let p = players.get(key);
    if (!p) {
      const id = key.startsWith('name:') ? undefined : key;
      p = { key, ...(id ? { id } : {}), ...(w.name ? { name: w.name } : {}), side, started: false, played: false, minutes: 0, plusMinus: 0, periods: [], spells: [], sentOff: false, suspensions: 0, suspendedMinutes: 0 };
      players.set(key, p);
    } else if (!p.name && w.name) p.name = w.name;
    return p;
  };

  let period = log.firstPeriod ?? 1;
  const on: Record<Side, Map<string, number>> = { home: new Map(), away: new Map() }; // key → spell start
  const susp = new Map<string, ActiveSuspension>();
  const shortWin: Record<Side, { from: number; until: number }[]> = { home: [], away: [] };
  const addPeriod = (p: PlayerField) => { if (!p.periods.includes(period)) p.periods.push(period); };
  const open = (p: PlayerField, t: number) => {
    if (on[p.side].has(p.key)) return;
    on[p.side].set(p.key, t);
    p.played = true;
    addPeriod(p);
  };
  const close = (p: PlayerField, t: number) => {
    const from = on[p.side].get(p.key);
    if (from === undefined) return;
    on[p.side].delete(p.key);
    const to = Math.max(from, t);
    if (to > from) p.spells.push({ from, to });
    p.minutes += to - from;
  };
  const expire = (upTo: number, inclusive: boolean) => {
    const due = [...susp.values()].filter((x) => (inclusive ? x.until <= upTo : x.until < upTo)).sort((a, b) => a.until - b.until);
    for (const x of due) {
      susp.delete(x.key);
      const p = players.get(x.key);
      if (p && !p.sentOff) { p.suspendedMinutes += x.until - x.from; open(p, x.until); }
    }
  };

  for (const side of ['home', 'away'] as const) {
    for (const w of log.starters[side]) {
      const p = ensure(w, side);
      if (!p) continue;
      p.started = true;
      open(p, 0);
    }
  }

  const events = log.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.t <= log.end)
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map(({ e }) => e);

  for (const e of events) {
    // a suspension that has run out by now ends first (the player is back for
    // a goal scored at the very moment it expires)
    expire(e.t, true);
    switch (e.kind) {
      case 'period':
        period = e.period;
        for (const side of ['home', 'away'] as const) for (const k of on[side].keys()) addPeriod(players.get(k)!);
        break;
      case 'sub': {
        const off = e.off ? ensure(e.off, e.side) : undefined;
        if (off) close(off, e.t);
        const inn = e.on ? ensure(e.on, e.side) : undefined;
        if (inn && !inn.sentOff && !susp.has(inn.key)) open(inn, e.t);
        break;
      }
      case 'enter': {
        const p = ensure(e.who, e.side);
        if (p && !p.sentOff && !susp.has(p.key)) open(p, e.t);
        break;
      }
      case 'off': {
        const p = ensure(e.who, e.side);
        if (!p || p.sentOff) break;
        close(p, e.t);
        const running = susp.get(p.key);
        if (running) {
          // a red during a suspension: the suspension is superseded
          susp.delete(p.key);
          p.suspendedMinutes += e.t - running.from;
          const w = shortWin[p.side].find((x) => x.from === running.from && x.until === running.until);
          if (w) w.until = e.t;
        }
        p.sentOff = true;
        if (e.shortFor === undefined) shortWin[p.side].push({ from: e.t, until: Infinity });
        else if (e.shortFor > 0) shortWin[p.side].push({ from: e.t, until: e.t + e.shortFor });
        break;
      }
      case 'suspend': {
        const p = ensure(e.who, e.side);
        if (!p || p.sentOff || e.minutes <= 0) break;
        close(p, e.t);
        const prev = susp.get(p.key);
        // a second suspension while still off runs on from the first (served
        // consecutively); the side stays short for the extra time
        const from = prev ? prev.until : e.t;
        const until = from + e.minutes;
        if (prev) { prev.until = until; const w = shortWin[p.side].find((x) => x.from === prev.from); if (w) w.until = until; }
        else {
          susp.set(p.key, { key: p.key, ...(p.id ? { id: p.id } : {}), ...(p.name ? { name: p.name } : {}), side: p.side, from: e.t, until });
          shortWin[p.side].push({ from: e.t, until });
        }
        p.suspensions += 1;
        break;
      }
      case 'score': {
        if (!e.points) break;
        for (const k of on[e.side].keys()) players.get(k)!.plusMinus += e.points;
        for (const k of on[other(e.side)].keys()) players.get(k)!.plusMinus -= e.points;
        break;
      }
    }
  }
  expire(log.end, true);
  const onField = {
    home: [...on.home.keys()].map((k) => players.get(k)!),
    away: [...on.away.keys()].map((k) => players.get(k)!),
  };
  for (const side of ['home', 'away'] as const) for (const p of [...onField[side]]) close(p, log.end);
  const suspended = [...susp.values()].sort((a, b) => a.until - b.until);
  for (const x of suspended) { const p = players.get(x.key); if (p) p.suspendedMinutes += log.end - x.from; }
  const shortAt = (side: Side) => shortWin[side].filter((w) => w.from <= log.end && log.end < w.until).length;
  return { players: [...players.values()], onField, suspended, short: { home: shortAt('home'), away: shortAt('away') } };
}

/** The field at clock time `t` — `trackField` of the events up to `t`. */
export const fieldAt = (log: FieldLog, t: number): FieldResult => trackField({ ...log, end: t });

/* ---------------------------- rule conventions ---------------------------- */

/** The field event a card / foul with a schema `suspension` declaration
 *  produces (SD-15 `StatDef.suspension`): a timed suspension, or a sending-off
 *  (`permanent`). `minutes` = the umpire's choice for a ranged one (hockey
 *  yellow 5–10'), clamped to the declared range. */
export function suspensionEvent(
  decl: Suspension | undefined,
  at: { t: number; side: Side; who: Who },
  opts: { minutes?: number; shortFor?: number } = {},
): FieldEvent | undefined {
  if (!decl) return undefined;
  if (decl.permanent) return { kind: 'off', ...at, ...(opts.shortFor !== undefined ? { shortFor: opts.shortFor } : {}) };
  const min = decl.minutes ?? 0;
  const max = decl.maxMinutes ?? min;
  const m = Math.min(max, Math.max(min, opts.minutes ?? min));
  return m > 0 ? { kind: 'suspend', ...at, minutes: m } : undefined;
}

/**
 * Per-sport conventions the adapters follow (documented once, tested in
 * tests/on-field.test.mts):
 * - clock: what a minute means for `minutes`;
 * - suspensions: the timed / permanent removals the rules use, and how long a
 *   sending-off leaves the side short (`shortFor`, minutes; undefined = rest of
 *   the match; 0 = replaced at once).
 */
export const FIELD_RULES = {
  football: {
    clock: 'regulation minutes: 90 (+30 extra time); added time counts as the end of its half',
    red: { shortFor: undefined },
    /** optional grassroots sin-bin (format `sinBinMinutes`; IFAB trial: 10) */
    sinBin: { minutes: 10 },
  },
  basketball: {
    clock: 'period-clock minutes from the event stamps (approximate: the scorer clock counts whole minutes)',
    foulOut: { shortFor: 0 },
    ejection: { shortFor: 0 },
  },
  hockey: {
    clock: 'game-clock minutes, 4 × 15',
    green: { minutes: 2 },
    yellow: { minutes: 5, maxMinutes: 10 },
    red: { shortFor: undefined },
  },
  handball: {
    clock: 'game-clock minutes, 2 × 30',
    twoMinutes: { minutes: 2 },
    /** disqualification: the side plays short for 2 minutes, then may refill */
    red: { shortFor: 2 },
  },
  kabaddi: {
    clock: 'match minutes, 2 × 20',
    /** green = a warning only */
    yellow: { minutes: 2 },
    red: { shortFor: undefined },
  },
  volleyball: {
    clock: 'none — sets played (a player who was on court in a set)',
  },
} as const;

/** "1:24" — what's left of a suspension at clock time `now` (minutes). */
export function timeLeft(until: number, now: number): string {
  const sec = Math.max(0, Math.ceil(Math.round((until - now) * 60_000) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
