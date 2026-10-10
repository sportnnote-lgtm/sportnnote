/** SD-15 — the stat schema shared by the point-only racket sports (badminton,
 *  pickleball, padel, squash, table tennis): one `points` stat today. Rally
 *  stats (serve points, runs, game points) come with SD-19 / SD-22. PURE. */
import type { SportId } from '../core/types';
import type { SportStatSchema } from './statSchema.ts';
import { POINTS } from './sharedStats.ts';

export function rallyStats<S extends SportId>(sport: S, icon: string): SportStatSchema<S> {
  return {
    sport,
    stats: [{ ...POINTS, group: 'points', weight: 1 }],
    sections: [{ id: 'points', title: 'Points', rows: [{ stat: 'points' }] }],
    careerView: 'totals',
    box: [{ columns: ['points'] }],
    leaders: ['points'],
    headline: ['points'],
    awards: [{ stat: 'points', icon, label: 'Top scorer' }],
  };
}
