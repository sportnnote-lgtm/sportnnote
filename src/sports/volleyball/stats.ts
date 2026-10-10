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
    // SD-16 — the team's sets won / lost on a line (SD-19's set counts).
    { key: 'setsWon', label: 'Sets won', short: 'sets won', one: 'set won', group: 'record' },
    { key: 'setsLost', label: 'Sets lost', short: 'sets lost', one: 'set lost', group: 'record' },
    // SD-29 — sets the PLAYER was on court in (the on-court tracker, written
    // absolutely by statTotals): FIVB's per-set denominator. A line without it
    // (older matches) stays out of the per-set figures. Display is SD-27 / SD-81.
    { key: 'setsPlayed', label: 'Sets played', short: 'sets', one: 'set', abbr: 'SP', group: 'record' },
    { key: 'pointsPerSet', label: 'Points per set', abbr: 'PTS/S', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'points', sets: 'setsPlayed', dp: 2 } },
    { key: 'acesPerSet', label: 'Aces per set', abbr: 'ACE/S', source: 'derived', group: 'serve', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'aces', sets: 'setsPlayed', dp: 2 } },
    { key: 'blocksPerSet', label: 'Blocks per set', abbr: 'BLK/S', source: 'derived', group: 'block', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'blocks', sets: 'setsPlayed', dp: 2 } },
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
