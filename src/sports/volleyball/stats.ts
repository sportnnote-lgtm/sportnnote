/** SD-15 — volleyball's stat schema (see ../statSchema.ts). PURE. `points`
 *  includes aces and blocks (SD-04), so their weights are the bonus on top. */
import type { SportStatSchema } from '../statSchema.ts';
import { ACES, BLOCKS, POINTS } from '../sharedStats.ts';

export const volleyballStats: SportStatSchema<'volleyball'> = {
  sport: 'volleyball',
  /** SD-25 — career split chips (line context) */
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    { ...POINTS, group: 'attack', weight: 1 },
    { ...ACES, group: 'serve', weight: 2 },
    { ...BLOCKS, group: 'block', weight: 1 },
    { key: 'attackPoints', label: 'Attack pts', short: 'attack pts', abbr: 'ATK', group: 'attack', matchSummary: true },
    // SD-16 — sets played comes from the absolute statTotals (SD-19), which
    // writes setsWon / setsLost on each line; until then a line without them
    // stays out of the per-set denominator (FIVB ranks attack / block / serve
    // per set). Display is SD-27.
    { key: 'setsWon', label: 'Sets won', short: 'sets won', one: 'set won', group: 'record' },
    { key: 'setsLost', label: 'Sets lost', short: 'sets lost', one: 'set lost', group: 'record' },
    { key: 'pointsPerSet', label: 'Points per set', abbr: 'PTS/S', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'points', dp: 2 } },
    { key: 'acesPerSet', label: 'Aces per set', abbr: 'ACE/S', source: 'derived', group: 'serve', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'aces', dp: 2 } },
    { key: 'blocksPerSet', label: 'Blocks per set', abbr: 'BLK/S', source: 'derived', group: 'block', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'blocks', dp: 2 } },
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
