/** SD-15 — golf's stat schema (see ../statSchema.ts). PURE. Match play
 *  credits `holesWon`; a stroke round writes an absolute line (roundStats in
 *  engine.ts). The profile keeps golf's own block (careerView 'custom') until
 *  golf moves onto the results engine (SD-28). */
import type { SportStatSchema } from '../statSchema.ts';

const opt = { coverage: 'optional' as const, mode: 'perHoleStats' };

export const golfStats: SportStatSchema<'golf'> = {
  sport: 'golf',
  stats: [
    { key: 'holesWon', label: 'Holes won', short: 'holes won', one: 'hole won', group: 'matchPlay', weight: 1, matchSummary: true },
    { key: 'birdies', label: 'Birdies', short: 'birdies', one: 'birdie', group: 'scoring', weight: 3, matchSummary: true },
    { key: 'eagles', label: 'Eagles+', short: 'eagles', one: 'eagle', group: 'scoring', weight: 6, matchSummary: true },
    { key: 'rounds', label: 'Rounds', short: 'rounds', one: 'round', group: 'rounds', matchSummary: true },
    { key: 'holes', label: 'Holes', short: 'holes', one: 'hole', group: 'rounds' },
    { key: 'strokes', label: 'Strokes', short: 'strokes', one: 'stroke', group: 'rounds', format: { unit: 'strokes' } },
    { key: 'stableford', label: 'Stableford', short: 'stableford pts', group: 'rounds', format: { unit: 'points' } },
    { key: 'toPar', label: 'To par', short: 'to par', group: 'rounds', format: { unit: 'strokes' } },
    { key: 'completeRounds', label: 'Complete rounds', short: 'complete rounds', one: 'complete round', group: 'rounds' },
    { key: 'completeStrokes', label: 'Strokes (complete rounds, per 18)', short: 'strokes', group: 'rounds', format: { unit: 'strokes' } },
    { key: 'pars', label: 'Pars', short: 'pars', one: 'par', group: 'scoring' },
    { key: 'bogeys', label: 'Bogeys', short: 'bogeys', one: 'bogey', group: 'scoring', format: { unit: 'count', better: 'lower' } },
    { key: 'doubles', label: 'Double bogeys+', short: 'doubles', one: 'double', group: 'scoring', format: { unit: 'count', better: 'lower' } },
    { key: 'putts', label: 'Putts', short: 'putts', one: 'putt', group: 'shots', format: { unit: 'count', better: 'lower' }, ...opt },
    { key: 'puttHoles', label: 'Holes with putts', short: 'holes with putts', group: 'shots', ...opt },
    { key: 'girHit', label: 'Greens hit', short: 'greens', one: 'green', group: 'shots', ...opt },
    { key: 'girHoles', label: 'Greens tracked', short: 'greens tracked', group: 'shots', ...opt },
    { key: 'firHit', label: 'Fairways hit', short: 'fairways', one: 'fairway', group: 'shots', ...opt },
    { key: 'firHoles', label: 'Fairways tracked', short: 'fairways tracked', group: 'shots', ...opt },
    { key: 'penalties', label: 'Penalty strokes', short: 'penalty strokes', one: 'penalty stroke', group: 'shots', format: { unit: 'count', better: 'lower' }, ...opt },
    // derived figures (the profile's golf block computes these today)
    { key: 'scoringAvg', label: 'Scoring avg', source: 'derived', group: 'rounds', format: { unit: 'strokes', dp: 1 },
      agg: { kind: 'rate', num: 'completeStrokes', den: 'completeRounds', dp: 1 } },
    { key: 'girPct', label: 'Greens (GIR)', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'girHit', den: 'girHoles', scale: 100, dp: 0 } },
    { key: 'firPct', label: 'Fairways', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'firHit', den: 'firHoles', scale: 100, dp: 0 } },
  ],
  sections: [
    { id: 'rounds', title: 'Rounds', rows: [{ stat: 'rounds' }, { stat: 'scoringAvg' }] },
    { id: 'scoring', title: 'Scoring', rows: ['eagles', 'birdies', 'pars', 'bogeys', 'doubles'].map((stat) => ({ stat })) },
    { id: 'shots', title: 'Shots', rows: [{ stat: 'putts' }, { stat: 'girPct' }, { stat: 'firPct' }] },
    { id: 'matchPlay', title: 'Match play', rows: [{ stat: 'holesWon' }] },
  ],
  careerView: 'custom',
  leaders: ['birdies', 'holesWon'],
  headline: ['rounds', 'birdies', 'eagles'],
  awards: [{ stat: 'birdies', icon: '🐦', label: 'Most birdies' }],
};
