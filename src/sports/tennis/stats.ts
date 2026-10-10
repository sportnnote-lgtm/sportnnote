/** SD-15 — tennis's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema } from '../statSchema.ts';
import { ACES, POINTS } from '../sharedStats.ts';
import { racketRecordStats, racketServeStats } from '../rallyStats.ts';

export const tennisStats: SportStatSchema<'tennis'> = {
  sport: 'tennis',
  /** SD-25 — career split chips (line context) */
  splits: ['discipline', 'format', 'tournament', 'season', 'opponent'],
  stats: [
    { ...POINTS, group: 'points', weight: 1 },
    { ...ACES, group: 'serve', weight: 2 },
    { key: 'doubleFaults', label: 'Double faults', short: 'double faults', one: 'double fault', abbr: 'DF', group: 'serve', format: { unit: 'count', better: 'lower' } },
    // SD-19 — the match record from the absolute statTotals (racketTotals.ts)
    ...racketRecordStats(true),
    // SD-22 — serve / return career keys replayed from the point log (serveStats.ts)
    ...racketServeStats(true),
  ],
  sections: [
    { id: 'serve', title: 'Serve', rows: [{ stat: 'aces' }, { stat: 'doubleFaults' }] },
    { id: 'points', title: 'Points', rows: [{ stat: 'points' }] },
  ],
  careerView: 'totals',
  box: [{ columns: ['points', 'aces', 'doubleFaults'] }],
  leaders: ['points', 'aces'],
  headline: ['points', 'aces'],
  awards: [
    { stat: 'points', icon: '🎾', label: 'Top scorer' },
    { stat: 'aces', icon: '💥', label: 'Aces' },
  ],
};
