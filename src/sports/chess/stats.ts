/** SD-15 — chess's stat schema (see ../statSchema.ts). PURE. One line per
 *  game: `games` + the outcome key (so the results are 'core': a line without
 *  `losses` is 0 losses, never "not tracked" — SD-24). */
import type { SportStatSchema } from '../statSchema.ts';

export const chessStats: SportStatSchema<'chess'> = {
  sport: 'chess',
  /** SD-25 — career split chips (line context) */
  splits: ['colour', 'timeControl', 'tournament', 'season', 'opponent'],
  stats: [
    // SD-27: the rating weights are the game score (win 1, draw ½)
    { key: 'wins', label: 'Wins', short: 'wins', one: 'win', leaderLabel: 'Most wins', group: 'results', weight: 1, matchSummary: true, coverage: 'core',
      tieBreak: [{ key: 'score', better: 'higher' }] },
    { key: 'draws', label: 'Draws', short: 'draws', one: 'draw', group: 'results', weight: 0.5, matchSummary: true, coverage: 'core' },
    { key: 'games', label: 'Games', short: 'games', one: 'game', group: 'results', matchSummary: true, coverage: 'core' },
    { key: 'losses', label: 'Losses', short: 'losses', one: 'loss', group: 'results', matchSummary: true, coverage: 'core' },
    // SD-24 (CH-05) — score (W + ½D) and score %; by colour / time control
    // through the SD-25 split chips
    { key: 'score', label: 'Score', short: 'score', source: 'derived', group: 'results', format: { unit: 'points' }, agg: { kind: 'sum', keys: ['wins', 'wins', 'draws'], scale: 0.5 },
      tieBreak: [{ key: 'wins', better: 'higher' }] },
    { key: 'scorePct', label: 'Score %', source: 'derived', group: 'results', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: ['wins', 'wins', 'draws'], den: ['games', 'games'], scale: 100, dp: 0, qualifier: { games: 3, unit: { label: 'games', one: 'game' } } },
      leaderLabel: 'Best score %', tieBreak: [{ key: 'score', better: 'higher' }, { key: 'wins', better: 'higher' }] },
  ],
  sections: [{ id: 'results', title: 'Results', rows: [{ stat: 'games' }, { stat: 'score' }, { stat: 'scorePct' }, { stat: 'wins' }, { stat: 'draws' }, { stat: 'losses' }] }],
  careerView: 'sections',
  // the result is the row's pill; the row shows colour · time control instead
  history: [],
  // SD-27 (CH-12): score (1 / ½ / 0), score % (min games), wins — not "most draws".
  // Performance rating needs player ratings (not stored yet).
  leaders: ['score', 'scorePct', 'wins'],
  // the Player of the Tournament: most points, then most wins (FIDE's WIN)
  mvp: {
    stat: 'score', tieBreak: [{ key: 'wins', better: 'higher' }],
    howRanked: 'Most points in this tournament\'s games (1 for a win, ½ for a draw). Ties: more wins, then by name. The standings\' own tie-breaks (Buchholz, Sonneborn-Berger…) aren\'t applied here, so check the table when players are level. You choose the winner.',
  },
  headline: ['wins', 'draws', 'games'],
  // one result per game — no in-game role award; a tournament "Most wins" slot
  awards: [
    // retired by SD-27 (the score decides chess); kept for published awards' icon
    { stat: 'wins', icon: '♟️', label: 'Most wins', match: false, tournament: false },
    { stat: 'scorePct', icon: '📈', label: 'Best score %', match: false,
      howRanked: 'Score %: points (1 for a win, ½ for a draw) ÷ games played. Players need at least {min} to rank. Ties: the higher score, then more wins, then by name. You choose the winner.' },
  ],
};
