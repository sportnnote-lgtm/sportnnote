/**
 * SD-146 — netball on the time-on-field tracker (../onField.ts) and its
 * absolute statTotals (SD-19). PURE.
 *
 * The field log runs on the GAME clock in minutes (`sec / 60`), so a
 * suspension's time stops while the umpires hold time.
 *  - suspension → `suspend` (the event's minutes); the team plays a player
 *    short and the position stays empty until the player is back.
 *  - ordering off → `off` for the rest of the match (not replaced).
 *  - a team official's sanction is listed only (never on the field).
 *
 * statTotals owns the WHOLE line: every live key is the sum of `eventCredits`
 * over the state, plus the derived keys only the state can know — `minutes`,
 * `quarters` and the quarters per position (`qGS` … `qGK`) for sides with a
 * line-up, and `suspensionMinutes`.
 */
import { trackField, timeLeft, type FieldEvent, type FieldLog, type FieldResult, type Who } from '../onField.ts';
import { eventCredits, lineupAt, matchSec, periodStarted, LIVE_KEYS, POSITIONS, type NetballState, type Pos, type Side } from './engine.ts';

const stamped = (s: NetballState, side: Side): boolean => !!s.xi?.[side] && Object.keys(s.xi[side]!.pos ?? {}).length > 0;

/** The netball field log, up to `upTo` game minutes (default: now / the end). */
export function netballFieldLog(s: NetballState, upTo?: number): FieldLog {
  const starters = { home: [] as Who[], away: [] as Who[] };
  const people: Who[] = [];
  for (const side of ['home', 'away'] as const) {
    if (!stamped(s, side)) continue;
    starters[side] = POSITIONS.map((p) => s.xi![side]!.pos[p]).filter((w): w is { id: string; name: string } => !!w).map((w) => ({ id: w.id, name: w.name }));
    people.push(...starters[side]);
  }
  const events: FieldEvent[] = [];
  for (const e of s.events) {
    if (!e.side) continue;
    const t = e.sec / 60;
    if (e.type === 'goal') events.push({ kind: 'score', t, side: e.side, points: 1 });
    else if (e.type === 'sub' && stamped(s, e.side)) {
      if (e.playerId || e.playerName) events.push({ kind: 'sub', t, side: e.side, off: { id: e.playerId, name: e.playerName }, on: { id: e.secondId, name: e.secondName } });
      else events.push({ kind: 'enter', t, side: e.side, who: { id: e.secondId, name: e.secondName } });
    } else if (e.type === 'sanction' && e.sanction !== 'warning' && !e.official) {
      const who: Who = { id: e.playerId, name: e.playerName };
      if (!who.id && !who.name) continue;
      if (e.sanction === 'off') events.push({ kind: 'off', t, side: e.side, who });
      else events.push({ kind: 'suspend', t, side: e.side, who, minutes: e.minutes ?? s.suspensionMinutes });
    }
  }
  const last = events.reduce((m, e) => Math.max(m, e.t), 0);
  return { starters, events, people, end: upTo ?? Math.max(matchSec(s) / 60, last) };
}

export const netballField = (s: NetballState, upTo?: number): FieldResult => trackField(netballFieldLog(s, upTo));

/** For the live banner: who is suspended (time left on the game clock), how
 *  many players each side has on court and how many short. */
export function netballLiveField(s: NetballState, nowMs: number): {
  suspended: { side: Side; name: string; left: string; id?: string }[];
  onField: { home: number; away: number };
  short: { home: number; away: number };
} {
  const now = matchSec(s, nowMs) / 60;
  const r = netballField(s, now);
  const suspended = s.ended ? [] : r.suspended.map((x) => ({ side: x.side, name: x.name ?? 'Player', left: timeLeft(x.until, now), ...(x.id ? { id: x.id } : {}) }));
  const short = { home: 0, away: 0 };
  for (const x of r.suspended) short[x.side]++;
  for (const p of r.players) if (p.sentOff) short[p.side]++;
  return { suspended, onField: { home: 7 - short.home, away: 7 - short.away }, short };
}

/** Players ordered off or serving a suspension now, by side → ids + names. */
export function unavailable(s: NetballState, nowMs: number): { home: Set<string>; away: Set<string> } {
  const out = { home: new Set<string>(), away: new Set<string>() };
  const r = netballField(s, matchSec(s, nowMs) / 60);
  for (const p of r.players) if (p.sentOff) { if (p.id) out[p.side].add(p.id); if (p.name) out[p.side].add(p.name); }
  for (const x of r.suspended) { if (x.id) out[x.side].add(x.id); if (x.name) out[x.side].add(x.name); }
  return out;
}

/** Each (player, period, position) a side's line-up used: the positions at the
 *  start of every period played, and every change during it. */
export function positionSpells(s: NetballState, side: Side): Map<string, { id?: string; name?: string; periods: Set<number>; byPos: Map<Pos, Set<number>> }> {
  const out = new Map<string, { id?: string; name?: string; periods: Set<number>; byPos: Map<Pos, Set<number>> }>();
  if (!stamped(s, side)) return out;
  const note = (w: Who | undefined, p: Pos, period: number) => {
    if (!w || (!w.id && !w.name)) return;
    const k = w.id ?? `name:${w.name}`;
    let r = out.get(k);
    if (!r) { r = { ...(w.id ? { id: w.id } : {}), ...(w.name ? { name: w.name } : {}), periods: new Set(), byPos: new Map() }; out.set(k, r); }
    r.periods.add(period);
    if (!r.byPos.has(p)) r.byPos.set(p, new Set());
    r.byPos.get(p)!.add(period);
  };
  // regular periods only (extra time isn't a quarter)
  const lastPeriod = Math.min(s.periods, s.ended || periodStarted(s) ? s.period : s.period - 1);
  for (let p = 1; p <= lastPeriod; p++) {
    // the line-up as the period starts (changes at the break are stamped with it)
    let i = 0;
    while (i < s.events.length && s.events[i].period < p) i++;
    let j = i;
    // changes logged before the period's first play (sec at the period start) count as the break's
    const start = s.events[i]?.period === p ? s.events[i].sec : Infinity;
    while (j < s.events.length && s.events[j].period === p && s.events[j].sec <= start && (s.events[j].type === 'sub' || s.events[j].type === 'pos')) j++;
    const atStart = lineupAt(s, side, j);
    for (const pos of POSITIONS) note(atStart[pos], pos, p);
    for (let k = j; k < s.events.length && s.events[k].period === p; k++) {
      const e = s.events[k];
      if (e.side !== side || (e.type !== 'sub' && e.type !== 'pos')) continue;
      const l = lineupAt(s, side, k + 1);
      for (const pos of POSITIONS) note(l[pos], pos, p);
    }
  }
  return out;
}

/** SD-19 statTotals: the whole line per player id. */
export function netballTotals(s: NetballState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const line = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const add = (id: string, side: Side, stats: Record<string, number>) => {
    const l = line(id, side);
    for (const [k, v] of Object.entries(stats)) l.stats[k] = (l.stats[k] ?? 0) + v;
  };
  for (const e of s.events) {
    if (!e.side) continue;
    const c = eventCredits(e);
    if (c.first) add(c.first.playerId, e.side, c.first.stats);
    if (c.second) add(c.second.playerId, e.side, c.second.stats);
    if (e.type === 'sanction' && e.sanction === 'suspension' && e.playerId && !e.official) add(e.playerId, e.side, { suspensionMinutes: e.minutes ?? s.suspensionMinutes });
  }
  for (const p of netballField(s).players) {
    if (!p.played || !p.id || !stamped(s, p.side)) continue;
    line(p.id, p.side).stats.minutes = Math.round(p.minutes);
  }
  for (const side of ['home', 'away'] as const) {
    for (const r of positionSpells(s, side).values()) {
      if (!r.id) continue;
      const l = line(r.id, side).stats;
      l.quarters = r.periods.size;
      for (const pos of POSITIONS) l[`q${pos}`] = r.byPos.get(pos)?.size ?? 0;
    }
  }
  for (const l of Object.values(out)) {
    for (const k of ['goals', 'attempts'] as const) l.stats[k] ??= 0;
  }
  return out;
}

/** The keys statTotals owns that no live action credits (contract rule 5). */
export const DERIVED_KEYS = ['minutes', 'quarters', ...POSITIONS.map((p) => `q${p}`), 'suspensionMinutes'] as const;
export const OWNED_LIVE_KEYS = LIVE_KEYS;
