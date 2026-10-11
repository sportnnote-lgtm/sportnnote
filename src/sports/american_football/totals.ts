/**
 * SD-147 — American football's absolute statTotals (SD-19). PURE.
 *
 * statTotals owns the WHOLE line: every live key is the sum of `eventCredits`
 * over the state. The scoring keys are written for everyone credited (0 when
 * none); the play-by-play keys only in a match scored play by play (or one
 * that has such plays); tackles only when tackles were tracked. `fgLong`
 * (longest field goal made) is derived — no live action credits it.
 */
import { eventCredits, secondIsDefence, PBP_KEYS, SCORE_KEYS, type AFState, type Side } from './engine.ts';

export function afTotals(s: AFState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const line = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const add = (id: string, side: Side, stats: Record<string, number>) => {
    const l = line(id, side);
    for (const [k, v] of Object.entries(stats)) l.stats[k] = (l.stats[k] ?? 0) + v;
  };
  for (const e of s.events) {
    const c = eventCredits(e);
    // a play's second player is on the other side for defensive credits (sack / int / fumble recovery)
    const def = secondIsDefence(e);
    if (c.first) add(c.first.playerId, e.side, c.first.stats);
    if (c.second) add(c.second.playerId, def ? (e.side === 'home' ? 'away' : 'home') : e.side, c.second.stats);
    if (e.type === 'fg' && e.good && e.playerId && e.yards) {
      const l = line(e.playerId, e.side);
      l.stats.fgLong = Math.max(l.stats.fgLong ?? 0, e.yards);
    }
  }
  const pbp = s.mode === 'pbp' || s.events.some((e) => e.pbp);
  const tackles = s.trackTackles || s.events.some((e) => e.type === 'tackle');
  for (const l of Object.values(out)) {
    for (const k of SCORE_KEYS) l.stats[k] ??= 0;
    if (pbp) for (const k of PBP_KEYS) l.stats[k] ??= 0;
    if (tackles) l.stats.tackles ??= 0;
  }
  return out;
}

/** The keys statTotals owns that no live action credits (contract rule 5). */
export const DERIVED_KEYS = ['fgLong'] as const;
