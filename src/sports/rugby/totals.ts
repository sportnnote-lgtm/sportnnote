/**
 * SD-143 — rugby on the time-on-field tracker (../onField.ts) and its absolute
 * statTotals (SD-19). PURE.
 *
 * The field log runs on PLAYING time in minutes (`sec / 60`: the halves as
 * actually played, time added included), so a sin-bin carries across
 * half-time exactly as the referee's watch does.
 *  - yellow card → `suspend` for the sin-bin minutes (10; sevens 2), back by
 *    himself;
 *  - red card → `off` for the rest of the match; a 20-minute red (World Rugby
 *    trial) → `off` with `shortFor: 20` (a replacement may then come on);
 *  - replacements, temporary (HIA / blood) replacements and returns → `sub`.
 *
 * statTotals owns the WHOLE line: every live key is the sum of `eventCredits`
 * over the state, plus `minutes` (sides with a line-up). The optional detail
 * keys are owned only when the match tracks detail.
 */
import { trackField, timeLeft, type FieldEvent, type FieldLog, type FieldResult, type Who } from '../onField.ts';
import { eventCredits, matchSec, pointsOf, DETAIL_STATS, type RugbyEvent, type RugbyState, type Side } from './engine.ts';

const stamped = (s: RugbyState, side: Side): boolean => !!s.xi?.[side]?.players?.length;
/** sent off (a red, a second yellow, a 20-minute red) */
export const sendsOff = (e: RugbyEvent): boolean => e.type === 'card' && e.card === 'red' && !e.official;
/** the 20-minute red trial: off for good, the side short 20 minutes */
export const RED20_MINUTES = 20;

export function rugbyFieldLog(s: RugbyState, upTo?: number): FieldLog {
  const starters = { home: [] as Who[], away: [] as Who[] };
  const people: Who[] = [];
  for (const side of ['home', 'away'] as const) {
    const st = s.xi?.[side];
    if (!st?.players?.length) continue;
    starters[side] = st.players.map((p) => ({ id: p.id, name: p.name }));
    people.push(...starters[side]);
  }
  const events: FieldEvent[] = [];
  for (const e of s.events) {
    const t = e.sec / 60;
    const pts = pointsOf(e);
    if (pts) events.push({ kind: 'score', t, side: e.side, points: pts });
    else if (e.type === 'sub' && stamped(s, e.side)) {
      if (e.playerId || e.playerName) events.push({ kind: 'sub', t, side: e.side, off: { id: e.playerId, name: e.playerName }, on: { id: e.secondId, name: e.secondName } });
      else events.push({ kind: 'enter', t, side: e.side, who: { id: e.secondId, name: e.secondName } });
    } else if (e.type === 'card' && !e.official) {
      const who: Who = { id: e.playerId, name: e.playerName };
      if (!who.id && !who.name) continue;
      if (e.card === 'yellow') events.push({ kind: 'suspend', t, side: e.side, who, minutes: s.sinBinMinutes });
      else events.push({ kind: 'off', t, side: e.side, who, ...(e.red20 ? { shortFor: RED20_MINUTES } : {}) });
    }
  }
  const last = events.reduce((m, e) => Math.max(m, e.t), 0);
  return { starters, events, people, end: upTo ?? Math.max(matchSec(s) / 60, last) };
}

export const rugbyField = (s: RugbyState, upTo?: number): FieldResult => trackField(rugbyFieldLog(s, upTo));

/** For the live banner: who is in the sin-bin (time left on the playing
 *  clock) and how many players each side has. */
export function rugbyLiveField(s: RugbyState, nowMs: number): {
  suspended: { side: Side; name: string; left: string; id?: string }[];
  onField: { home: number; away: number };
  short: { home: number; away: number };
} {
  const now = matchSec(s, nowMs) / 60;
  const r = rugbyField(s, now);
  const suspended = s.ended ? [] : r.suspended.map((x) => ({ side: x.side, name: x.name ?? 'Player', left: timeLeft(x.until, now), ...(x.id ? { id: x.id } : {}) }));
  const count = (side: Side) => {
    const allowed = Math.max(0, s.playersPerSide - r.short[side]);
    return stamped(s, side) ? Math.min(r.onField[side].length, allowed) : allowed;
  };
  const onField = { home: count('home'), away: count('away') };
  return { suspended, onField, short: { home: s.playersPerSide - onField.home, away: s.playersPerSide - onField.away } };
}

/** Players sent off or in the sin-bin now, by side → ids + names. */
export function unavailable(s: RugbyState, nowMs: number): { home: Set<string>; away: Set<string> } {
  const out = { home: new Set<string>(), away: new Set<string>() };
  const r = rugbyField(s, matchSec(s, nowMs) / 60);
  for (const p of r.players) if (p.sentOff) { if (p.id) out[p.side].add(p.id); if (p.name) out[p.side].add(p.name); }
  for (const x of r.suspended) { if (x.id) out[x.side].add(x.id); if (x.name) out[x.side].add(x.name); }
  return out;
}

/** SD-19 statTotals: the whole line per player id. */
export function rugbyTotals(s: RugbyState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const line = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const add = (id: string, side: Side, stats: Record<string, number>) => {
    const l = line(id, side);
    for (const [k, v] of Object.entries(stats)) l.stats[k] = (l.stats[k] ?? 0) + v;
  };
  for (const e of s.events) {
    const c = eventCredits(e);
    if (c.first) add(c.first.playerId, e.side, c.first.stats);
    if (c.second) add(c.second.playerId, e.side, c.second.stats);
  }
  for (const side of ['home', 'away'] as const) {
    for (const k of s.shootout?.[side] ?? []) if (k.playerId) add(k.playerId, side, { soTaken: 1, soGoals: k.scored ? 1 : 0 });
  }
  for (const p of rugbyField(s).players) {
    if (!p.played || !p.id || !stamped(s, p.side)) continue;
    line(p.id, p.side).stats.minutes = Math.round(p.minutes);
  }
  const detail = s.trackDetail || s.events.some((e) => e.type === 'detail');
  for (const l of Object.values(out)) {
    for (const k of ['points', 'tries', 'conversions', 'conversionAttempts', 'penGoals', 'penGoalAttempts', 'dropGoals', 'dropGoalAttempts', 'yellowCards', 'redCards'] as const) l.stats[k] ??= 0;
    if (detail) for (const k of DETAIL_STATS) l.stats[k] ??= 0;
  }
  return out;
}

/** The keys statTotals owns that no live action credits (contract rule 5). */
export const DERIVED_KEYS = ['minutes'] as const;
