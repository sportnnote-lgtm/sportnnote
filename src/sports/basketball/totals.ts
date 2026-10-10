/**
 * SD-40 (BK-05) — basketball's absolute `statTotals`: every per-match figure
 * the event log can give, keyed by player id. PURE.
 *
 *  - The box keys (credits.ts: points, FT, field goals, 3s, misses, rebounds
 *    incl. OREB / DREB, assists, steals, blocks, turnovers, fouls, ejections)
 *    are the sum of exactly what the controls credited live, play by play —
 *    so edits, removals and undos can't drift, and a second scorer or a
 *    retried upload can't double a line.
 *  - MIN and +/- come from SD-29's on-court tracker (fieldTime.ts), merged in.
 *
 * Ids: events carry names; newer controls send `payload.pid` (engine `ids`),
 * the starting five / subs carry theirs (SD-29). If ANY credited name can't be
 * resolved (an older log), the box keys are left out entirely and those lines
 * keep moving by live increments, as before — the sync zeroes owned keys for
 * players missing from the totals, so a partial guess would wipe real stats.
 *
 * FGA / 3PA are owned only when the match tracked missed shots (its config,
 * any miss, or a make logged with `fga`): an untracked game never gets a false
 * 0 attempts. In a tracked match every make is an attempt — one logged before
 * tracking was switched on mid-match too (its live line lacked that attempt;
 * the sync at completion sets the true figure).
 */
import type { StatTotalsEntry } from '../types';
import { mergeTotals } from '../racketTotals.ts';
import type { BasketballState } from './engine.ts';
import { eventCredits } from './credits.ts';
import { basketballTotals } from './fieldTime.ts';

/** Every box key the totals own (FGA / 3PA only on a tracked game). */
export const BASKETBALL_BOX_KEYS = [
  'points', 'fgMade', 'threesMade', 'fgMissed', 'freeThrowsMade', 'freeThrowsAtt',
  'rebounds', 'oreb', 'dreb', 'assists', 'steals', 'blocks', 'turnovers', 'fouls', 'ejections',
] as const;
export const BASKETBALL_ATTEMPT_KEYS = ['fgAtt', 'threesAtt'] as const;

/** Did this match track missed shots (D8 coverage for FGA / FG%)? */
export const shotsTracked = (s: BasketballState): boolean =>
  s.trackMisses === true || s.events.some((e) => e.type === 'miss' || e.fga === true);

/** The box keys per player id, or {} when a credited name has no id. */
export function basketballBoxTotals(s: BasketballState): Record<string, StatTotalsEntry> {
  const halfCourt = s.targetPoints > 0;
  const tracked = shotsTracked(s);
  const keys = [...BASKETBALL_BOX_KEYS, ...(tracked ? BASKETBALL_ATTEMPT_KEYS : [])];
  const out: Record<string, StatTotalsEntry> = {};
  for (const e of s.events) {
    if (!e.playerName) continue;
    const c = eventCredits(e, halfCourt, tracked);
    if (!Object.keys(c).length) continue; // a sub / timeout credits nobody
    const id = s.ids?.[e.playerName];
    if (!id) return {};
    const line = out[id] ?? (out[id] = { side: e.side, stats: Object.fromEntries(keys.map((k) => [k, 0])) });
    for (const [k, v] of Object.entries(c)) line.stats[k] = (line.stats[k] ?? 0) + v;
  }
  return out;
}

/** The plugin's `statTotals`: box keys + SD-29 MIN / +/-. */
export const basketballStatTotals = (s: BasketballState): Record<string, StatTotalsEntry> =>
  mergeTotals(basketballBoxTotals(s), basketballTotals(s));
