/**
 * SD-29 (VB-06 base) — volleyball sets played on the generic on-court tracker
 * (../onField.ts). PURE.
 *
 * Volleyball has no playing clock, so the tracker's clock is the order of the
 * log; each set is a period. A player played a set when they were on court in
 * it: the court stamped before the first point (`state.lineup` — the lineup's
 * court six, else the matchday squad, the VB-06 default) and anyone credited
 * with a point in that set. Substitutions (SD-71) refine it by adding `sub`
 * field events here. Only sets actually played count (a stamped player of a
 * 3–0 win has 3, not 5).
 */
import { trackField, type FieldEvent, type FieldLog, type FieldResult, type Side } from '../onField.ts';
import type { VolleyballState } from './engine.ts';

const CREDITED = new Set(['point', 'attack', 'ace', 'block']);

export function volleyballFieldLog(s: VolleyballState): FieldLog | null {
  const lu = s.lineup;
  if (!lu || (!lu.home?.length && !lu.away?.length)) return null;
  const starters = { home: lu.home ?? [], away: lu.away ?? [] };
  const events: FieldEvent[] = [];
  let set = 1;
  s.events.forEach((e, i) => {
    if (e.set && e.set > set) { set = e.set; events.push({ kind: 'period', t: i + 1, period: set }); }
  });
  return { starters, events, end: s.events.length + 1, people: [...starters.home, ...starters.away] };
}

/** The court over the match, plus every player credited with a point — on
 *  court in THAT set (without substitutions logged, a credited bench player
 *  is not assumed to have stayed on). */
export function volleyballField(s: VolleyballState): FieldResult | null {
  const log = volleyballFieldLog(s);
  if (!log) return null;
  const r = trackField(log);
  const byKey = new Map(r.players.map((p) => [p.key, p]));
  const keyOf = (id?: string, name?: string) => id ?? log.people?.find((w) => w.name === name)?.id ?? (name ? `name:${name}` : undefined);
  for (const e of s.events) {
    if (!e.side || !e.playerName || !CREDITED.has(e.kind ?? '') || !log.starters[e.side].length) continue;
    const key = keyOf(e.playerId, e.playerName);
    if (!key) continue;
    let p = byKey.get(key);
    if (!p) {
      p = { key, ...(key.startsWith('name:') ? {} : { id: key }), name: e.playerName, side: e.side, started: false, played: true, minutes: 0, plusMinus: 0, periods: [], spells: [], sentOff: false, suspensions: 0, suspendedMinutes: 0 };
      byKey.set(key, p);
      r.players.push(p);
    }
    p.played = true;
    const n = e.set ?? 1;
    if (!p.periods.includes(n)) p.periods.push(n);
  }
  return r;
}

/** Sets that have been played so far (completed + one under way with a point). */
export const setsSoFar = (s: VolleyballState): number => {
  const current = (s.current?.home ?? 0) + (s.current?.away ?? 0) > 0 && !s.ended ? 1 : 0;
  return (s.sets?.length ?? 0) + current;
};

/** SD-29: volleyball's partial `statTotals` — `setsPlayed` for every player of
 *  a stamped side who was on court (ids only). */
export function volleyballTotals(s: VolleyballState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const r = volleyballField(s);
  if (!r) return out;
  const played = setsSoFar(s);
  for (const p of r.players) {
    if (!p.played || !p.id || !s.lineup?.[p.side]?.length) continue;
    out[p.id] = { side: p.side, stats: { setsPlayed: p.periods.filter((n) => n <= played).length } };
  }
  return out;
}
