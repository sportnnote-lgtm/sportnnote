/** SD-15 — padel's stat schema (points only today). PURE. */
import { rallyStats } from '../rallyStats.ts';

const base = rallyStats('padel', '🟡', { sets: true });

/** SD-117c — padel's one-tap Double fault (as tennis): credited live to the
 *  faulting server ('keyed': only lines that had one carry it — older padel
 *  lines read "not tracked"). Aces come through the point detail (`aces`). */
export const padelStats: typeof base = {
  ...base,
  stats: [
    ...base.stats,
    { key: 'doubleFaults', label: 'Double faults', short: 'double faults', one: 'double fault', abbr: 'DF', group: 'serve', format: { unit: 'count', better: 'lower' }, weight: -1, coverage: 'keyed' },
  ],
  sections: (base.sections ?? []).map((sec) => (sec.id === 'serve' ? { ...sec, rows: [{ stat: 'doubleFaults' }, ...sec.rows] } : sec)),
};
