/** SD-15 — tennis's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema } from '../statSchema.ts';
import { ACES, POINTS } from '../sharedStats.ts';
import { racketCareerStats, racketRecordStats, racketSections, racketServeStats } from '../rallyStats.ts';

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
    // SD-24 — W-L pairs and won % for the career's Match play section
    ...racketCareerStats(true),
  ],
  sections: racketSections(true, [{ stat: 'aces' }, { stat: 'doubleFaults' }]),
  careerView: 'sections',
  box: [{ columns: ['points', 'aces', 'doubleFaults'] }],
  leaders: ['points', 'aces'],
  headline: ['points', 'aces'],
  awards: [
    { stat: 'points', icon: '🎾', label: 'Top scorer' },
    { stat: 'aces', icon: '💥', label: 'Aces' },
  ],
};
