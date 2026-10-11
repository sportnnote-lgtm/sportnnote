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
import { trackCourt } from './rotation.ts';

const CREDITED = new Set(['point', 'attack', 'ace', 'block']);

export function volleyballFieldLog(s: VolleyballState): FieldLog | null {
  const lu = s.lineup;
  // SD-58: a starting rotation is the court too (older logs: the stamp only)
  const hasRot = !!s.rotation && Object.keys(s.rotation).length > 0;
  if ((!lu || (!lu.home?.length && !lu.away?.length)) && !hasRot) return null;
  const t = hasRot || s.subs?.length ? trackCourt(s) : null;
  const first = t?.sets[0]?.start;
  const starters = { home: first?.home ?? lu?.home ?? [], away: first?.away ?? lu?.away ?? [] };
  const events: FieldEvent[] = [];
  let set = 1;
  const periodAt = new Map<number, number>();
  s.events.forEach((e, i) => {
    if (e.set && e.set > set) { set = e.set; events.push({ kind: 'period', t: i + 1, period: set }); periodAt.set(set, i + 1); }
  });
  if (t) {
    // SD-71: subs (regular, exceptional, libero) at their rally, and a new
    // set's rotation that changes the six (off / on at the set's start).
    const ptsOf = (n: number) => s.events.map((e, i) => ({ e, i })).filter(({ e }) => e.set === n && SCORED.has(e.kind ?? '') && e.side).map(({ i }) => i);
    const extra: FieldEvent[] = [];
    for (const sc of t.sets) {
      const idx = ptsOf(sc.n);
      let start = periodAt.get(sc.n) ?? (sc.n === 1 ? 0.5 : undefined);
      if (start === undefined) {
        // a set under way with no point yet: open its period at the end of the log
        start = s.events.length + 0.25;
        extra.push({ kind: 'period', t: start, period: sc.n });
      }
      if (sc.n > 1) {
        const prev = t.sets.find((x) => x.n === sc.n - 1);
        for (const side of ['home', 'away'] as const) {
          const a = prev?.end[side], b = sc.start[side];
          if (!a || !b) continue;
          const offs = a.filter((p) => !b.some((q) => q.id === p.id));
          const ons = b.filter((p) => !a.some((q) => q.id === p.id));
          // off just before the set starts (no credit for it), on with its start
          for (const p of offs) extra.push({ kind: 'sub', t: start - 0.1, side, off: p });
          for (const p of ons) extra.push({ kind: 'sub', t: start, side, on: p });
        }
      }
      for (const x of (s.subs ?? []).filter((y) => y.set === sc.n)) {
        const at = x.at < idx.length ? idx[x.at] + 0.5 : idx.length ? idx[idx.length - 1] + 1.5 : start;
        extra.push({ kind: 'sub', t: at, side: x.side, off: x.off, on: x.on });
      }
    }
    events.push(...extra);
    events.sort((a, b) => a.t - b.t);
  }
  const people = [...starters.home, ...starters.away, ...(s.subs ?? []).flatMap((x) => [x.off, x.on])];
  return { starters, events, end: s.events.length + 1, people };
}
const SCORED = new Set(['point', 'attack', 'block', 'ace', 'opperror', 'serveerror']);

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
    if (!p.played || !p.id || !(s.lineup?.[p.side]?.length || r.players.some((q) => q.side === p.side && q.started))) continue;
    out[p.id] = { side: p.side, stats: { setsPlayed: p.periods.filter((n) => n <= played).length } };
  }
  return out;
}
