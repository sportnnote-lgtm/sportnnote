/** SD-15 — carrom's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema } from '../statSchema.ts';
import { POINTS } from '../sharedStats.ts';

export const carromStats: SportStatSchema<'carrom'> = {
  sport: 'carrom',
  /** SD-25 — career split chips (line context) */
  splits: ['discipline', 'tournament', 'season', 'opponent'],
  stats: [
    { ...POINTS, group: 'scoring', weight: 1 },
    { key: 'boards', label: 'Boards', short: 'boards', one: 'board', group: 'scoring', weight: 1, matchSummary: true },
    { key: 'queens', label: 'Queens', short: 'queens', one: 'queen', group: 'scoring', weight: 2, matchSummary: true },
  ],
  sections: [{ id: 'scoring', title: 'Scoring', rows: [{ stat: 'points' }, { stat: 'boards' }, { stat: 'queens' }] }],
  careerView: 'totals',
  box: [{ columns: ['points', 'boards', 'queens'] }],
  compare: ['points', 'boards', 'queens'],
  leaders: ['points', 'queens'],
  headline: ['points', 'boards', 'queens'],
  awards: [
    { stat: 'points', icon: '🎱', label: 'Top scorer' },
    { stat: 'queens', icon: '👑', label: 'Queens' },
  ],
};
