/** SD-15 — carrom's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema } from '../statSchema.ts';
import { HIGH_POINTS, POINTS } from '../sharedStats.ts';

export const carromStats: SportStatSchema<'carrom'> = {
  sport: 'carrom',
  /** SD-25 — career split chips (line context) */
  splits: ['discipline', 'tournament', 'season', 'opponent'],
  stats: [
    // SD-27: level totals go to more boards, then more queens (and back)
    { ...POINTS, group: 'scoring', weight: 1, tieBreak: [{ key: 'boards', better: 'higher' }, { key: 'queens', better: 'higher' }] },
    { key: 'boards', label: 'Boards', short: 'boards', one: 'board', group: 'scoring', weight: 1, matchSummary: true, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'queens', label: 'Queens', short: 'queens', one: 'queen', group: 'scoring', weight: 2, matchSummary: true, tieBreak: [{ key: 'points', better: 'higher' }] },
    // SD-24 (CR-05) — slams / 25-0 games need per-board lines (SD-86)
    { key: 'pointsPerMatch', label: 'Points per match', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'points', dp: 1, qualifier: { games: 2, unit: { label: 'matches', one: 'match' } } },
      tieBreak: [{ key: 'points', better: 'higher' }] },
    { ...HIGH_POINTS },
  ],
  sections: [{ id: 'scoring', title: 'Scoring', rows: [{ stat: 'points' }, { stat: 'pointsPerMatch' }, { stat: 'boards' }, { stat: 'queens' }, { stat: 'highPoints', label: 'Best match' }] }],
  careerView: 'sections',
  box: [{ columns: ['points', 'boards', 'queens'] }],
  compare: ['points', 'boards', 'queens'],
  // SD-27: boards and points per match (min matches) join points and queens
  leaders: ['points', 'boards', 'queens', 'pointsPerMatch'],
  headline: ['points', 'boards', 'queens'],
  awards: [
    { stat: 'points', icon: '🎱', label: 'Top scorer' },
    { stat: 'queens', icon: '👑', label: 'Queens' },
  ],
};
