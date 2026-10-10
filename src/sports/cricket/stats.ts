/**
 * SD-15 — cricket's stat schema, the proof spec: the profile's Batting /
 * Bowling / Fielding career (cricketCareer.ts), leaders, awards and labels all
 * render from this. PURE (no React Native).
 *
 * Lines from before parity #19 carry only `runs` / `wickets` (live
 * increments). They count in the totals, but the rates (Avg, SR, Econ, Best)
 * use only lines that carry their inputs (the `full` / `bowled` /
 * `bowlFigures` filters), so an old line never fakes a 400 strike rate.
 */
import type { StatLine } from '../../core/types';
import { hasKey, type SportStatSchema } from '../statSchema.ts';

const n = (l: StatLine, k: string) => Number(l.stats?.[k] ?? 0) || 0;
/** Did the player bat in this match? (#19 lines say so; an older line with a
 *  `runs` key was credited at least one ball faced.) */
export const batted = (l: StatLine): boolean => (hasKey(l, 'innings') ? n(l, 'innings') > 0 : hasKey(l, 'runs'));

/**
 * SD-16 — minimums before a rate ranks on a tournament leaderboard (careers
 * always show the figure). Sized for school cricket, where a T20 bowler has 4
 * overs and a tournament is 3–5 matches:
 *   - batting average: 3 completed-data innings (and at least one dismissal —
 *     an average needs outs);
 *   - strike rate: 30 balls faced (≈ 2–3 innings of a middle-order batter);
 *   - economy: 10 overs = 60 balls (≈ 3 full T20 spells).
 * The ICC uses bigger numbers for internationals; an organiser override is
 * SD-38.
 */
export const QUALIFIERS = {
  avg: { games: 3, note: 'min 3 innings' },
  sr: { den: 30, note: 'min 30 balls' },
  econ: { den: 60, note: 'min 10 overs' },
} as const;

export const cricketStats: SportStatSchema<'cricket'> = {
  sport: 'cricket',
  filters: {
    batted,
    /** #19 lines: innings / notOut / ballsFaced known */
    full: (l) => batted(l) && hasKey(l, 'innings'),
    bowled: (l) => hasKey(l, 'ballsBowled'),
    bowlFigures: (l) => hasKey(l, 'runsConceded'),
  },
  stats: [
    // ── batting
    { key: 'runs', label: 'Runs', short: 'runs', one: 'run', abbr: 'R', group: 'batting', weight: 1, matchSummary: true },
    // an older line that batted without an innings key counts one innings
    { key: 'innings', label: 'Innings', short: 'innings', group: 'batting', agg: { kind: 'sum', over: 'batted', missing: 1 } },
    { key: 'notOut', label: 'Not out', short: 'not out', group: 'batting', agg: { kind: 'sum', over: 'full' } },
    { key: 'ballsFaced', label: 'Balls faced', short: 'balls faced', one: 'ball faced', abbr: 'B', group: 'batting' },
    { key: 'fours', label: '4s', abbr: '4s', group: 'batting' },
    { key: 'sixes', label: '6s', abbr: '6s', group: 'batting' },
    { key: 'highest', label: 'Highest', leaderLabel: 'Highest score', abbr: 'HS', source: 'derived', group: 'batting', format: { unit: 'figure' },
      agg: { kind: 'best', over: 'batted', by: [{ key: 'runs', better: 'higher' }, { key: 'notOut', better: 'higher' }], render: (s) => `${Number(s.runs ?? 0) || 0}${(Number(s.notOut ?? 0) || 0) > 0 ? '*' : ''}` } },
    { key: 'avg', label: 'Batting average', leaderLabel: 'Best batting average', abbr: 'Avg', source: 'derived', group: 'batting', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'rate', num: 'runs', den: ['innings', '-notOut'], over: 'full', qualifier: QUALIFIERS.avg }, tieBreak: [{ key: 'runs', better: 'higher' }] },
    { key: 'sr', label: 'Strike rate', leaderLabel: 'Best strike rate', abbr: 'SR', source: 'derived', group: 'batting', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'rate', num: 'runs', den: 'ballsFaced', scale: 100, over: 'full', qualifier: QUALIFIERS.sr }, tieBreak: [{ key: 'runs', better: 'higher' }] },
    { key: 'fifties', label: '50s', leaderLabel: 'Most 50s', source: 'derived', group: 'batting', agg: { kind: 'countIf', key: 'runs', gte: 50, lt: 100, over: 'batted' }, tieBreak: [{ key: 'runs', better: 'higher' }] },
    { key: 'hundreds', label: '100s', leaderLabel: 'Most 100s', source: 'derived', group: 'batting', agg: { kind: 'countIf', key: 'runs', gte: 100, over: 'batted' }, tieBreak: [{ key: 'runs', better: 'higher' }] },
    // ── bowling
    { key: 'wickets', label: 'Wickets', short: 'wkts', abbr: 'W', group: 'bowling', weight: 18, matchSummary: true },
    { key: 'ballsBowled', label: 'Balls bowled', short: 'balls bowled', one: 'ball bowled', group: 'bowling', agg: { kind: 'sum', over: 'bowled' } },
    { key: 'overs', label: 'Overs', abbr: 'O', source: 'derived', group: 'bowling', format: { unit: 'overs' }, agg: { kind: 'sum', key: 'ballsBowled', over: 'bowled' } },
    { key: 'runsConceded', label: 'Runs conceded', short: 'runs conceded', one: 'run conceded', abbr: 'R', group: 'bowling', format: { unit: 'count', better: 'lower' }, agg: { kind: 'sum', over: 'bowled' } },
    { key: 'maidens', label: 'Maidens', short: 'maidens', one: 'maiden', abbr: 'M', group: 'bowling' },
    { key: 'dots', label: 'Dots', short: 'dots', one: 'dot', group: 'bowling' },
    { key: 'wides', label: 'Wides', short: 'wides', one: 'wide', group: 'bowling' },
    { key: 'noBalls', label: 'No balls', short: 'no balls', one: 'no ball', group: 'bowling' },
    { key: 'econ', label: 'Economy', leaderLabel: 'Best economy', abbr: 'Econ', source: 'derived', group: 'bowling', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: 'runsConceded', den: 'ballsBowled', scale: 6, over: 'bowled', qualifier: QUALIFIERS.econ }, tieBreak: [{ key: 'ballsBowled', better: 'higher' }] },
    { key: 'bowlAvg', label: 'Bowling average', abbr: 'Avg', source: 'derived', group: 'bowling', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: 'runsConceded', den: 'wickets', over: 'bowled' } },
    { key: 'bowlSr', label: 'Bowling strike rate', abbr: 'SR', source: 'derived', group: 'bowling', format: { unit: 'decimal', dp: 1, better: 'lower' },
      agg: { kind: 'rate', num: 'ballsBowled', den: 'wickets', dp: 1, over: 'bowled' } },
    { key: 'best', label: 'Best bowling', leaderLabel: 'Best bowling', abbr: 'BBI', source: 'derived', group: 'bowling', format: { unit: 'figure' },
      agg: { kind: 'best', over: 'bowlFigures', by: [{ key: 'wickets', better: 'higher' }, { key: 'runsConceded', better: 'lower' }], render: (s) => `${Number(s.wickets ?? 0) || 0}/${Number(s.runsConceded ?? 0) || 0}` } },
    // ── fielding
    { key: 'catches', label: 'Catches', short: 'catches', one: 'catch', abbr: 'Ct', group: 'fielding', weight: 8, matchSummary: true },
    { key: 'stumpings', label: 'Stumpings', short: 'stumpings', one: 'stumping', abbr: 'St', group: 'fielding' },
    { key: 'runouts', label: 'Run outs', short: 'run outs', one: 'run out', abbr: 'RO', group: 'fielding' },
    // parity #20 — fielding notes
    { key: 'dropped', label: 'Drops', short: 'drops', one: 'drop', group: 'fielding' },
    { key: 'runsSaved', label: 'Runs saved', short: 'runs saved', group: 'fielding' },
    { key: 'runsMissed', label: 'Runs missed', short: 'runs missed', group: 'fielding' },
  ],
  sections: [
    { id: 'batting', title: 'Batting', rows: [
      { stat: 'runs' }, { stat: 'innings' }, { stat: 'notOut' }, { stat: 'highest' }, { stat: 'avg', label: 'Avg' }, { stat: 'sr', label: 'SR' },
      { stat: 'fours' }, { stat: 'sixes' }, { stat: 'fifties' }, { stat: 'hundreds' },
    ] },
    { id: 'bowling', title: 'Bowling', rows: [
      { stat: 'overs' }, { stat: 'wickets' }, { stat: 'runsConceded', label: 'Runs' }, { stat: 'maidens' }, { stat: 'dots' },
      { stat: 'econ', label: 'Econ' }, { stat: 'bowlAvg', label: 'Avg' }, { stat: 'bowlSr', label: 'SR' }, { stat: 'best', label: 'Best' },
    ] },
    { id: 'fielding', title: 'Fielding', rows: ['catches', 'stumpings', 'runouts', 'dropped', 'runsSaved', 'runsMissed'].map((stat) => ({ stat })) },
  ],
  careerView: 'sections',
  box: [
    { title: 'Batting', columns: ['runs', 'ballsFaced', 'fours', 'sixes', 'sr'] },
    { title: 'Bowling', columns: ['overs', 'maidens', 'runsConceded', 'wickets', 'econ'] },
  ],
  // SD-16: records leaders after the original three (CK-01; the full set —
  // 4s / 6s / maidens / dots / ducks, organiser minimums — is SD-38)
  leaders: ['runs', 'wickets', 'catches', 'highest', 'best', 'avg', 'sr', 'econ', 'fifties', 'hundreds'],
  headline: ['runs', 'wickets'],
  // cricket ships its own richer per-match summary: tournament slots only
  awards: [
    { stat: 'runs', icon: '🏏', label: 'Best batter', match: false },
    { stat: 'wickets', icon: '🎯', label: 'Best bowler', match: false },
  ],
  scoreUnit: 'runs',
};
