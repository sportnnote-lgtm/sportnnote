/** SD-15 — chess's stat schema (see ../statSchema.ts). PURE. One line per
 *  game: `games` + the outcome key (so the results are 'core': a line without
 *  `losses` is 0 losses, never "not tracked" — SD-24). */
import type { SportStatSchema } from '../statSchema.ts';

export const chessStats: SportStatSchema<'chess'> = {
  sport: 'chess',
  /** SD-25 — career split chips (line context) */
  splits: ['colour', 'timeControl', 'tournament', 'season', 'opponent'],
  stats: [
    { key: 'wins', label: 'Wins', short: 'wins', one: 'win', group: 'results', weight: 3, matchSummary: true, coverage: 'core' },
    { key: 'draws', label: 'Draws', short: 'draws', one: 'draw', group: 'results', weight: 1, matchSummary: true, coverage: 'core' },
    { key: 'games', label: 'Games', short: 'games', one: 'game', group: 'results', matchSummary: true, coverage: 'core' },
    { key: 'losses', label: 'Losses', short: 'losses', one: 'loss', group: 'results', matchSummary: true, coverage: 'core' },
    // SD-24 (CH-05) — score (W + ½D) and score %; by colour / time control
    // through the SD-25 split chips
    { key: 'score', label: 'Score', short: 'score', source: 'derived', group: 'results', format: { unit: 'points' }, agg: { kind: 'sum', keys: ['wins', 'wins', 'draws'], scale: 0.5 } },
    { key: 'scorePct', label: 'Score %', source: 'derived', group: 'results', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: ['wins', 'wins', 'draws'], den: ['games', 'games'], scale: 100, dp: 0 } },
  ],
  sections: [{ id: 'results', title: 'Results', rows: [{ stat: 'games' }, { stat: 'score' }, { stat: 'scorePct' }, { stat: 'wins' }, { stat: 'draws' }, { stat: 'losses' }] }],
  careerView: 'sections',
  // the result is the row's pill; the row shows colour · time control instead
  history: [],
  leaders: ['wins', 'draws'],
  headline: ['wins', 'draws', 'games'],
  // one result per game — no in-game role award; a tournament "Most wins" slot
  awards: [{ stat: 'wins', icon: '♟️', label: 'Most wins', match: false }],
};
