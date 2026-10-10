/** SD-15 — chess's stat schema (see ../statSchema.ts). PURE. One line per
 *  game: `games` + the outcome key. */
import type { SportStatSchema } from '../statSchema.ts';

export const chessStats: SportStatSchema<'chess'> = {
  sport: 'chess',
  stats: [
    { key: 'wins', label: 'Wins', short: 'wins', one: 'win', group: 'results', weight: 3, matchSummary: true },
    { key: 'draws', label: 'Draws', short: 'draws', one: 'draw', group: 'results', weight: 1, matchSummary: true },
    { key: 'games', label: 'Games', short: 'games', one: 'game', group: 'results', matchSummary: true },
    { key: 'losses', label: 'Losses', short: 'losses', one: 'loss', group: 'results', matchSummary: true },
  ],
  sections: [{ id: 'results', title: 'Results', rows: [{ stat: 'games' }, { stat: 'wins' }, { stat: 'draws' }, { stat: 'losses' }] }],
  careerView: 'totals',
  leaders: ['wins', 'draws'],
  headline: ['wins', 'draws', 'games'],
  // one result per game — no in-game role award; a tournament "Most wins" slot
  awards: [{ stat: 'wins', icon: '♟️', label: 'Most wins', match: false }],
};
