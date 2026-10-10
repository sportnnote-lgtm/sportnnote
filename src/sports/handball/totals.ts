/**
 * SD-102 — handball on the time-on-field tracker (../onField.ts) and its
 * absolute statTotals (SD-19). PURE.
 *
 * The field log runs on the GAME clock in minutes (`sec / 60`), so a 2-minute
 * suspension's time stops while the timekeeper stops the clock (IHF 2:9).
 *  - 2-minute suspension → `suspend` 2'; the team plays a player short.
 *  - disqualification (red, blue, or the 3rd suspension, 16:6d) → `off` with
 *    `shortFor: 2` (16:8): out for good, the team short for 2 minutes, then a
 *    team-mate may come on (a SUB with no one going off).
 *  - a team official's suspension / disqualification: the team plays short for
 *    2 minutes (16:3, 16:8) — logged against the official (never a player).
 *
 * statTotals owns the WHOLE line: every live key is the sum of `eventCredits`
 * over the state, plus the derived keys only the state can know — `minutes`
 * (sides with a line-up), `suspensionMinutes` and the keepers' `goalsConceded`
 * / `sevenMConceded` (7-metre shoot-out throws excluded).
 */
import { trackField, timeLeft, type FieldEvent, type FieldLog, type FieldResult, type Who } from '../onField.ts';
import { eventCredits, keeperAt, matchSec, LIVE_KEYS, SUSPENSION_MINUTES, type HandballEvent, type HandballState, type Side } from './engine.ts';

const stamped = (s: HandballState, side: Side): boolean => !!s.xi?.[side]?.players?.length;
/** an official's pseudo-person on the field log (never a player) */
const officialWho = (e: HandballEvent): Who => ({ name: `official:${e.official ?? 'Team official'}` });
/** does this sanction disqualify (red / blue / the 3rd suspension)? */
export const disqualifies = (e: HandballEvent): boolean => e.type === 'card' && (e.card === 'red' || (e.card === 'twoMin' && !!e.third));

/** The handball field log, up to `upTo` game minutes (default: now / the end). */
export function handballFieldLog(s: HandballState, upTo?: number): FieldLog {
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
    if (e.type === 'goal') events.push({ kind: 'score', t, side: e.side, points: 1 });
    else if (e.type === 'sub' && stamped(s, e.side)) {
      if (e.playerId || e.playerName) events.push({ kind: 'sub', t, side: e.side, off: { id: e.playerId, name: e.playerName }, on: { id: e.secondId, name: e.secondName } });
      else events.push({ kind: 'enter', t, side: e.side, who: { id: e.secondId, name: e.secondName } });
    } else if (e.type === 'card' && e.card !== 'yellow') {
      const who: Who = e.official ? officialWho(e) : { id: e.playerId, name: e.playerName };
      if (!who.id && !who.name) continue;
      if (disqualifies(e)) events.push({ kind: 'off', t, side: e.side, who, shortFor: SUSPENSION_MINUTES });
      else events.push({ kind: 'suspend', t, side: e.side, who, minutes: SUSPENSION_MINUTES });
    }
  }
  const last = events.reduce((m, e) => Math.max(m, e.t), 0);
  return { starters, events, people, end: upTo ?? Math.max(matchSec(s) / 60, last) };
}

export const handballField = (s: HandballState, upTo?: number): FieldResult => trackField(handballFieldLog(s, upTo));

const isOfficial = (name?: string) => !!name && name.startsWith('official:');
const display = (name?: string) => (isOfficial(name) ? `${name!.slice(9)} (official)` : name ?? 'Player');

/** For the live banner: who is suspended (time left on the game clock) and
 *  how many court players each side has. */
export function handballLiveField(s: HandballState, nowMs: number): {
  suspended: { side: Side; name: string; left: string; id?: string }[];
  onField: { home: number; away: number };
  short: { home: number; away: number };
} {
  const now = matchSec(s, nowMs) / 60;
  const r = handballField(s, now);
  const suspended = s.ended ? [] : r.suspended.map((x) => ({ side: x.side, name: display(x.name), left: timeLeft(x.until, now), ...(x.id ? { id: x.id } : {}) }));
  // a disqualified player's side is short only 2 minutes, then may refill: the
  // count is the smaller of who is on court and what the rules allow
  const count = (side: Side) => {
    const allowed = Math.max(0, s.playersPerSide - r.short[side]);
    return stamped(s, side) ? Math.min(r.onField[side].length, allowed) : allowed;
  };
  const onField = { home: count('home'), away: count('away') };
  return { suspended, onField, short: { home: s.playersPerSide - onField.home, away: s.playersPerSide - onField.away } };
}

/** Players disqualified or serving a suspension now, by side → ids + names. */
export function unavailable(s: HandballState, nowMs: number): { home: Set<string>; away: Set<string> } {
  const out = { home: new Set<string>(), away: new Set<string>() };
  const r = handballField(s, matchSec(s, nowMs) / 60);
  for (const p of r.players) if (p.sentOff) { if (p.id) out[p.side].add(p.id); if (p.name) out[p.side].add(p.name); }
  for (const x of r.suspended) { if (x.id) out[x.side].add(x.id); if (x.name) out[x.side].add(x.name); }
  return out;
}

/** Keeper spells per side on the game clock: goals and 7-m goals conceded. */
function keeperSpells(s: HandballState): Map<string, { side: Side; id?: string; name?: string; secs: number; conceded: number; conceded7: number }> {
  const out = new Map<string, { side: Side; id?: string; name?: string; secs: number; conceded: number; conceded7: number }>();
  const end = matchSec(s);
  for (const side of ['home', 'away'] as const) {
    if (!s.xi?.[side]?.gk) continue;
    let cur = keeperAt(s, side, 0);
    let since = 0;
    const key = (w?: Who) => (w?.id ? w.id : w?.name ? `name:${w.name}` : '');
    const get = () => {
      const k = key(cur);
      if (!k) return undefined;
      let r = out.get(k);
      if (!r) { r = { side, ...(cur?.id ? { id: cur.id } : {}), ...(cur?.name ? { name: cur.name } : {}), secs: 0, conceded: 0, conceded7: 0 }; out.set(k, r); }
      return r;
    };
    const close = (at: number) => { const r = get(); if (r) r.secs += Math.max(0, at - since); };
    for (let i = 0; i < s.events.length; i++) {
      const e = s.events[i];
      if (e.type === 'goal' && e.side !== side) {
        const r = get();
        if (r) { r.conceded += 1; if (e.shotType === 'sevenM') r.conceded7 += 1; }
        continue;
      }
      if (e.side !== side || (e.type !== 'gk' && e.type !== 'sub')) continue;
      const next = keeperAt(s, side, i + 1);
      if (key(next) !== key(cur)) { close(e.sec); cur = next; since = e.sec; }
    }
    close(Math.max(end, since));
  }
  return out;
}

/** SD-19 statTotals: the whole line per player id. */
export function handballTotals(s: HandballState): Record<string, { side: Side; stats: Record<string, number> }> {
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
    // a suspension (incl. the 3rd, which disqualifies) carries its 2 minutes
    if (e.type === 'card' && e.card === 'twoMin' && e.playerId && !e.official) add(e.playerId, e.side, { suspensionMinutes: SUSPENSION_MINUTES });
  }
  for (const side of ['home', 'away'] as const) {
    for (const k of s.shootout?.[side] ?? []) if (k.playerId) add(k.playerId, side, { soTaken: 1, soGoals: k.scored ? 1 : 0 });
  }
  for (const p of handballField(s).players) {
    if (!p.played || !p.id || !stamped(s, p.side)) continue;
    line(p.id, p.side).stats.minutes = Math.round(p.minutes);
  }
  for (const k of keeperSpells(s).values()) {
    if (!k.id) continue;
    const l = line(k.id, k.side).stats;
    l.goalsConceded = k.conceded;
    l.sevenMConceded = k.conceded7;
  }
  for (const l of Object.values(out)) {
    for (const k of ['goals', 'shots', 'assists', 'yellowCards', 'twoMinutes', 'redCards'] as const) l.stats[k] ??= 0;
  }
  return out;
}

/** The keys statTotals owns that no live action credits (contract rule 5). */
export const DERIVED_KEYS = ['minutes', 'suspensionMinutes', 'goalsConceded', 'sevenMConceded'] as const;
export const OWNED_LIVE_KEYS = LIVE_KEYS;
