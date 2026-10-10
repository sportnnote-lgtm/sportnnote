/**
 * SD-29 (BK-10) — basketball on the generic time-on-court tracker
 * (../onField.ts). PURE.
 *
 * Only when the scorer set the starting five (`state.onCourt`): the five, every
 * SUB, and a player fouling out or ejected (replaced at once — the side never
 * plays short). +/- = the team's points minus the opponent's while the player
 * was on court (FIBA box score). MIN is approximate: events carry the scorer
 * clock's whole minute within the period (`minute`), so a sub is placed at
 * that minute; a first-to-N game (3×3 to 21) has no clock, so it gets +/- only.
 */
import { trackField, type FieldEvent, type FieldLog, type FieldResult, type Side } from '../onField.ts';
import { currentMinute, type BasketballState } from './engine.ts';
import { pointsOf } from './events.ts';

/** Minutes before period `q` starts (regulation periods, then overtime). */
const periodStart = (s: BasketballState, q: number): number =>
  q <= s.regPeriods + 1 ? (q - 1) * s.periodMinutes : s.regPeriods * s.periodMinutes + (q - 1 - s.regPeriods) * s.overtimeMinutes;
const periodLen = (s: BasketballState, q: number): number => (q <= s.regPeriods ? s.periodMinutes : s.overtimeMinutes);

/** Has this side's five been set? (+/- and MIN only then — BK-10.) */
export const fiveSet = (s: BasketballState, side: Side): boolean => !!s.onCourt?.[side]?.length;

/** The basketball field log; `live` = up to the current minute of play. */
export function basketballFieldLog(s: BasketballState, live = false): FieldLog | null {
  if (!s.onCourt || (!fiveSet(s, 'home') && !fiveSet(s, 'away'))) return null;
  const ids = s.ids ?? {};
  const who = (name?: string) => ({ ...(name && ids[name] ? { id: ids[name] } : {}), ...(name ? { name } : {}) });
  const at = (q: number, minute: number) => periodStart(s, q) + Math.min(Math.max(0, minute ?? 0), periodLen(s, q));
  const starters = {
    home: fiveSet(s, 'home') ? s.onCourt.home.map(who) : [],
    away: fiveSet(s, 'away') ? s.onCourt.away.map(who) : [],
  };
  const events: FieldEvent[] = [];
  const fouls = new Map<string, number>();
  let q = 1;
  for (const e of s.events) {
    while (e.quarter > q) { q += 1; events.push({ kind: 'period', t: periodStart(s, q), period: q }); }
    const t = at(e.quarter, e.minute);
    const pts = pointsOf(e);
    if (pts > 0) events.push({ kind: 'score', t, side: e.side, points: pts });
    if (!fiveSet(s, e.side)) continue;
    if (e.type === 'sub') events.push({ kind: 'sub', t, side: e.side, off: who(e.playerName), on: who(e.onName) });
    else if (e.type === 'eject' && e.playerName) events.push({ kind: 'off', t, side: e.side, who: who(e.playerName), shortFor: 0 });
    else if (e.type === 'foul' && e.playerName) {
      const n = (fouls.get(e.playerName) ?? 0) + 1;
      fouls.set(e.playerName, n);
      if (s.foulOutLimit > 0 && n === s.foulOutLimit) events.push({ kind: 'off', t, side: e.side, who: who(e.playerName), shortFor: 0 });
    }
  }
  const now = live && !s.ended ? at(s.quarter, currentMinute(s)) : periodStart(s, s.quarter) + periodLen(s, s.quarter);
  const last = events.reduce((m, e) => Math.max(m, e.t), 0);
  return { starters, events, end: Math.max(now, last), people: Object.entries(ids).map(([name, id]) => ({ id, name })) };
}

export function basketballField(s: BasketballState, live = false): FieldResult | null {
  const log = basketballFieldLog(s, live);
  return log ? trackField(log) : null;
}

/** Minutes are meaningful only on a timed game (not first-to-N). */
export const timedGame = (s: BasketballState): boolean => !(s.targetPoints > 0);

/** Per player name: MIN (rounded), +/- and on court now — the box score's columns. */
export function boxFieldByName(s: BasketballState): Map<string, { min?: number; pm: number; on: boolean }> {
  const out = new Map<string, { min?: number; pm: number; on: boolean }>();
  const r = basketballField(s, true);
  if (!r) return out;
  const onNow = new Set([...r.onField.home, ...r.onField.away].map((p) => p.key));
  for (const p of r.players) {
    if (!p.played || !p.name || !fiveSet(s, p.side)) continue;
    out.set(p.name, { ...(timedGame(s) ? { min: Math.round(p.minutes) } : {}), pm: p.plusMinus, on: !s.ended && onNow.has(p.key) });
  }
  return out;
}

/** SD-29: basketball's partial `statTotals` — `minutes` (timed games) and
 *  `plusMinus` for every player of a side whose five was set and whose id is
 *  known. Nothing at all for a game without a five (older logs). */
export function basketballTotals(s: BasketballState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const r = basketballField(s);
  if (!r) return out;
  for (const p of r.players) {
    if (!p.played || !p.id || !fiveSet(s, p.side)) continue;
    out[p.id] = { side: p.side, stats: { ...(timedGame(s) ? { minutes: Math.round(p.minutes) } : {}), plusMinus: p.plusMinus } };
  }
  return out;
}
