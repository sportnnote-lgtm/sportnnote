/** SD-15 — volleyball's stat schema (see ../statSchema.ts). PURE. `points`
 *  includes aces and blocks (SD-04), so their weights are the bonus on top. */
import type { SportStatSchema } from '../statSchema.ts';
import { ACES, BLOCKS, HIGH_POINTS, POINTS } from '../sharedStats.ts';

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
    { key: 'setsWon', label: 'Sets won', short: 'sets won', one: 'set won', group: 'record', coverage: 'present' },
    { key: 'setsLost', label: 'Sets lost', short: 'sets lost', one: 'set lost', group: 'record', coverage: 'present' },
    // SD-29 — sets the PLAYER was on court in (the on-court tracker, written
    // absolutely by statTotals): FIVB's per-set denominator. A line without it
    // (older matches) stays out of the per-set figures. Display is SD-27 / SD-81.
    { key: 'setsPlayed', label: 'Sets played', short: 'sets', one: 'set', abbr: 'SP', group: 'record', coverage: 'present' },
    // SD-23 — team-level (the comparison panel): points the side got from the
    // opponent's errors, and its own service errors
    { key: 'oppErrors', label: 'Opp. errors', short: 'opp. errors', one: 'opp. error', source: 'team' },
    { key: 'serveErrors', label: 'Serve errors', short: 'serve errors', one: 'serve error', source: 'team', format: { unit: 'count', better: 'lower' } },
    { key: 'pointsPerSet', label: 'Points per set', abbr: 'PTS/S', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'points', sets: 'setsPlayed', dp: 2 } },
    { key: 'acesPerSet', label: 'Aces per set', abbr: 'ACE/S', source: 'derived', group: 'serve', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'aces', sets: 'setsPlayed', dp: 2 } },
    { key: 'blocksPerSet', label: 'Blocks per set', abbr: 'BLK/S', source: 'derived', group: 'block', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perSet', key: 'blocks', sets: 'setsPlayed', dp: 2 } },
    // SD-24 (VB-08) — the team's sets on the player's lines, and a best match
    { key: 'setsWL', label: 'Sets W-L', source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a: 'setsWon', b: 'setsLost' } },
    { key: 'setsPct', label: 'Sets won %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'setsWon', den: ['setsWon', 'setsLost'], scale: 100, dp: 0 } },
    { ...HIGH_POINTS },
  ],
  // SD-24 (VB-08) — FIVB per-set figures over the sets the player was on court
  sections: [
    { id: 'attack', title: 'Attack', rows: [{ stat: 'points' }, { stat: 'pointsPerSet' }, { stat: 'attackPoints' }, { stat: 'highPoints' }] },
    { id: 'serve', title: 'Serve', rows: [{ stat: 'aces' }, { stat: 'acesPerSet' }] },
    { id: 'block', title: 'Block', rows: [{ stat: 'blocks' }, { stat: 'blocksPerSet' }] },
    { id: 'record', title: 'Sets', rows: [{ stat: 'setsPlayed' }, { stat: 'setsWL' }, { stat: 'setsPct' }] },
  ],
  careerView: 'sections',
  box: [{ columns: [{ key: 'points', emphasis: true }, 'attackPoints', 'aces', 'blocks'] }],
  compare: ['points', 'attackPoints', 'blocks', 'aces', 'oppErrors', 'serveErrors'],
  leaders: ['points', 'aces', 'blocks'],
  headline: ['points', 'aces'],
  awards: [
    { stat: 'points', icon: '🏐', label: 'Top scorer' },
    { stat: 'aces', icon: '💥', label: 'Aces' },
  ],
  scoreUnit: 'sets',
};
