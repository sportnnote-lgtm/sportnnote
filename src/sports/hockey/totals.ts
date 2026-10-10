/**
 * SD-101 — hockey on the time-on-field tracker (../onField.ts) and its
 * absolute statTotals (SD-19). PURE.
 *
 * The field log runs on the GAME clock in minutes (`sec / 60`): playing time
 * only, so a green card's 2 minutes stop while the umpires stop the clock
 * (FIH). Cards follow the schema's `suspension` declarations via
 * `suspensionEvent` (green 2', yellow 5–10', red = the rest of the match).
 *
 * statTotals owns the WHOLE line (not partial): every live key is the sum of
 * `eventCredits` over the state (the controls credit exactly that), plus the
 * derived keys only the state can know — `minutes` (sides with a line-up),
 * `suspensionMinutes` (minutes the cards carried), and the keepers'
 * `goalsConceded` / `cleanSheets` (shoot-out kicks excluded).
 */
import { trackField, suspensionEvent, timeLeft, type FieldEvent, type FieldLog, type FieldResult, type Who } from '../onField.ts';
import { eventCredits, CARD_MINUTES, keeperAt, matchSec, LIVE_KEYS, type HockeyState, type Side } from './engine.ts';

const stamped = (s: HockeyState, side: Side): boolean => !!s.xi?.[side]?.players?.length;

/** The hockey field log, up to `upTo` game minutes (default: now / the end). */
export function hockeyFieldLog(s: HockeyState, upTo?: number): FieldLog {
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
    else if (e.type === 'sub' && stamped(s, e.side)) events.push({ kind: 'sub', t, side: e.side, off: { id: e.playerId, name: e.playerName }, on: { id: e.secondId, name: e.secondName } });
    else if (e.type === 'card' && (e.playerId || e.playerName)) {
      const fe = suspensionEvent(CARD_MINUTES[e.card ?? 'green'], { t, side: e.side, who: { id: e.playerId, name: e.playerName } }, { minutes: e.minutes });
      if (fe) events.push(fe);
    }
  }
  const last = events.reduce((m, e) => Math.max(m, e.t), 0);
  // `upTo` = the field at that moment (later events ignored); else the match so far
  return { starters, events, people, end: upTo ?? Math.max(matchSec(s) / 60, last) };
}

export const hockeyField = (s: HockeyState, upTo?: number): FieldResult => trackField(hockeyFieldLog(s, upTo));

/** For the live banner: who is suspended (time left on the game clock) and,
 *  when a side is short, how many each side has on the field. */
export function hockeyLiveField(s: HockeyState, nowMs: number): {
  suspended: { side: Side; name: string; left: string; id?: string }[];
  onField: { home: number; away: number };
  short: { home: number; away: number };
} {
  const now = matchSec(s, nowMs) / 60;
  const r = hockeyField(s, now);
  const suspended = s.ended ? [] : r.suspended.map((x) => ({ side: x.side, name: x.name ?? 'Player', left: timeLeft(x.until, now), ...(x.id ? { id: x.id } : {}) }));
  const count = (side: Side) => (stamped(s, side) ? r.onField[side].length : Math.max(0, s.playersPerSide - r.short[side]));
  return { suspended, onField: { home: count('home'), away: count('away') }, short: r.short };
}

/** Players sent off (red) or serving a suspension now, by side → ids + names. */
export function unavailable(s: HockeyState, nowMs: number): { home: Set<string>; away: Set<string> } {
  const out = { home: new Set<string>(), away: new Set<string>() };
  const r = hockeyField(s, matchSec(s, nowMs) / 60);
  for (const p of r.players) if (p.sentOff) { if (p.id) out[p.side].add(p.id); if (p.name) out[p.side].add(p.name); }
  for (const x of r.suspended) { if (x.id) out[x.side].add(x.id); if (x.name) out[x.side].add(x.name); }
  return out;
}

/** Keeper spells per side on the game clock (for clean sheets and GA). */
function keeperSpells(s: HockeyState): Map<string, { side: Side; id?: string; name?: string; secs: number; conceded: number; from: number }> {
  const out = new Map<string, { side: Side; id?: string; name?: string; secs: number; conceded: number; from: number }>();
  const end = matchSec(s);
  for (const side of ['home', 'away'] as const) {
    if (!s.xi?.[side]?.gk) continue;
    let cur = keeperAt(s, side, 0);
    let since = 0;
    const key = (w?: Who) => (w?.id ? w.id : w?.name ? `name:${w.name}` : '');
    const close = (at: number) => {
      const k = key(cur);
      if (!k) return;
      const r = out.get(k) ?? { side, ...(cur?.id ? { id: cur.id } : {}), ...(cur?.name ? { name: cur.name } : {}), secs: 0, conceded: 0, from: since };
      r.secs += Math.max(0, at - since);
      out.set(k, r);
    };
    for (let i = 0; i < s.events.length; i++) {
      const e = s.events[i];
      if (e.type === 'goal' && e.side !== side) {
        const k = key(cur);
        if (k) { close(e.sec); since = e.sec; out.get(k)!.conceded += 1; }
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
export function hockeyTotals(s: HockeyState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const line = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const add = (id: string, side: Side, stats: Record<string, number>) => {
    const l = line(id, side);
    for (const [k, v] of Object.entries(stats)) l.stats[k] = (l.stats[k] ?? 0) + v;
  };
  // every credit is to a player of the event's side (the assister is a
  // team-mate; a save is the keeper's own event)
  for (const e of s.events) {
    const c = eventCredits(e);
    if (c.first) add(c.first.playerId, e.side, c.first.stats);
    if (c.second) add(c.second.playerId, e.side, c.second.stats);
    if (e.type === 'card' && e.playerId) add(e.playerId, e.side, { suspensionMinutes: e.minutes ?? 0 });
  }
  for (const side of ['home', 'away'] as const) {
    for (const k of s.shootout?.[side] ?? []) if (k.playerId) add(k.playerId, side, { soTaken: 1, soGoals: k.scored ? 1 : 0 });
  }
  // minutes: every player of a side with a line-up who took the field
  for (const p of hockeyField(s).players) {
    if (!p.played || !p.id || !stamped(s, p.side)) continue;
    line(p.id, p.side).stats.minutes = Math.round(p.minutes);
  }
  // keepers: goals conceded; the clean sheet to the longest-serving keeper of
  // a side that let in no goal (shoot-out excluded)
  const spells = [...keeperSpells(s).values()];
  for (const side of ['home', 'away'] as const) {
    const mine = spells.filter((k) => k.side === side && k.id);
    if (!mine.length) continue;
    const against = side === 'home' ? s.away : s.home;
    const best = [...mine].sort((a, b) => b.secs - a.secs || a.from - b.from)[0];
    for (const k of mine) {
      const l = line(k.id!, side).stats;
      l.goalsConceded = k.conceded;
      l.cleanSheets = s.ended && against === 0 && k === best ? 1 : 0;
    }
  }
  // the core keys read 0 rather than "missing" on every line we write
  for (const l of Object.values(out)) {
    for (const k of ['goals', 'assists', 'shots', 'shotsOnGoal', 'greenCards', 'yellowCards', 'redCards'] as const) l.stats[k] ??= 0;
  }
  return out;
}

/** The keys statTotals owns that no live action credits (contract rule 5). */
export const DERIVED_KEYS = ['minutes', 'suspensionMinutes', 'goalsConceded', 'cleanSheets'] as const;
export const OWNED_LIVE_KEYS = LIVE_KEYS;
