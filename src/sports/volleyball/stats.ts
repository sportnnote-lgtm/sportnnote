/** SD-15 — volleyball's stat schema (see ../statSchema.ts). PURE. `points`
 *  includes aces and blocks (SD-04), so their weights are the bonus on top. */
import type { SportStatSchema } from '../statSchema.ts';
import { ACES, BLOCKS, POINTS } from '../sharedStats.ts';

export const volleyballStats: SportStatSchema<'volleyball'> = {
  sport: 'volleyball',
  stats: [
    { ...POINTS, group: 'attack', weight: 1 },
    { ...ACES, group: 'serve', weight: 2 },
    { ...BLOCKS, group: 'block', weight: 1 },
    { key: 'attackPoints', label: 'Attack pts', short: 'attack pts', abbr: 'ATK', group: 'attack', matchSummary: true },
  ],
  sections: [
    { id: 'attack', title: 'Attack', rows: [{ stat: 'points' }, { stat: 'attackPoints' }] },
    { id: 'serve', title: 'Serve', rows: [{ stat: 'aces' }] },
    { id: 'block', title: 'Block', rows: [{ stat: 'blocks' }] },
  ],
  careerView: 'totals',
  box: [{ columns: ['points', 'attackPoints', 'aces', 'blocks'] }],
  leaders: ['points', 'aces', 'blocks'],
  headline: ['points', 'aces'],
  awards: [
    { stat: 'points', icon: '🏐', label: 'Top scorer' },
    { stat: 'aces', icon: '💥', label: 'Aces' },
  ],
  scoreUnit: 'sets',
};
