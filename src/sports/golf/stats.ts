/** SD-15 — golf's stat schema (see ../statSchema.ts). PURE. Match play
 *  credits `holesWon`; a stroke round writes an absolute line (roundStats in
 *  engine.ts). The profile keeps golf's own block (careerView 'custom') until
 *  golf moves onto the results engine (SD-28). */
import type { SportStatSchema } from '../statSchema.ts';

const opt = { coverage: 'optional' as const, mode: 'perHoleStats' };
/** SD-45 — written only by a card kept with the stats row (D8: a line
 *  without the key reads "not tracked", never 0). */
const keyed = { coverage: 'keyed' as const, mode: 'perHoleStats' };

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
    // SD-45 — the per-hole stats row (fairway side, greenside bunker; GIR from
    // strokes − putts ≤ par − 2)
    { key: 'firLeft', label: 'Fairways missed left', short: 'missed left', group: 'shots', format: { unit: 'count', better: 'lower' }, ...keyed },
    { key: 'firRight', label: 'Fairways missed right', short: 'missed right', group: 'shots', format: { unit: 'count', better: 'lower' }, ...keyed },
    { key: 'scrambles', label: 'Scrambles', short: 'scrambles', one: 'scramble', group: 'shots', ...keyed },
    { key: 'scrambleHoles', label: 'Greens missed', short: 'greens missed', group: 'shots', ...keyed },
    { key: 'sandSaves', label: 'Sand saves', short: 'sand saves', one: 'sand save', group: 'shots', ...keyed },
    { key: 'sandHoles', label: 'Greenside bunkers', short: 'bunkers', one: 'bunker', group: 'shots', ...keyed },
    { key: 'puttsGir', label: 'Putts on greens hit', short: 'putts on GIR', group: 'shots', format: { unit: 'count', better: 'lower' }, ...keyed },
    { key: 'girPutted', label: 'Greens hit with putts', short: 'greens with putts', group: 'shots', ...keyed },
    // derived figures (the profile's golf block computes these today)
    { key: 'scoringAvg', label: 'Scoring avg', source: 'derived', group: 'rounds', format: { unit: 'strokes', dp: 1 },
      agg: { kind: 'rate', num: 'completeStrokes', den: 'completeRounds', dp: 1 } },
    { key: 'girPct', label: 'Greens (GIR)', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'girHit', den: 'girHoles', scale: 100, dp: 0 } },
    { key: 'firPct', label: 'Fairways', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'firHit', den: 'firHoles', scale: 100, dp: 0 } },
    { key: 'scramblePct', label: 'Scrambling', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'scrambles', den: 'scrambleHoles', scale: 100, dp: 0 } },
    { key: 'sandSavePct', label: 'Sand saves', source: 'derived', group: 'shots', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'sandSaves', den: 'sandHoles', scale: 100, dp: 0 } },
    { key: 'puttsPerGir', label: 'Putts per GIR', source: 'derived', group: 'shots', format: { unit: 'count', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: 'puttsGir', den: 'girPutted', dp: 2 } },
  ],
  sections: [
    { id: 'rounds', title: 'Rounds', rows: [{ stat: 'rounds' }, { stat: 'scoringAvg' }] },
    { id: 'scoring', title: 'Scoring', rows: ['eagles', 'birdies', 'pars', 'bogeys', 'doubles'].map((stat) => ({ stat })) },
    { id: 'shots', title: 'Shots', rows: [{ stat: 'putts' }, { stat: 'girPct' }, { stat: 'firPct' }, { stat: 'scramblePct' }, { stat: 'sandSavePct' }, { stat: 'puttsPerGir' }] },
    { id: 'matchPlay', title: 'Match play', rows: [{ stat: 'holesWon' }] },
  ],
  careerView: 'custom',
  leaders: ['birdies', 'holesWon'],
  headline: ['rounds', 'birdies', 'eagles'],
  awards: [{ stat: 'birdies', icon: '🐦', label: 'Most birdies' }],
};
