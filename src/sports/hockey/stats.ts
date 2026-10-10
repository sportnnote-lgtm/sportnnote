/** SD-101 — hockey's stat schema (see ../statSchema.ts). PURE. Built from the
 *  SD-15 sample (tests/stat-schema.test.mts): goals by type, penalty corners,
 *  keeper save %, green / yellow / red cards with their FIH suspensions. Every
 *  line key is absolute — `statTotals` (./totals.ts) owns the whole line. A key
 *  shared with football keeps football's labels (tested). */
import type { Qualifier, SportStatSchema } from '../statSchema.ts';
import { ASSISTS, RED_CARDS, SAVES, YELLOW_CARDS } from '../sharedStats.ts';

/** House minimums (not from the FIH regulations): 2 matches for a per-match
 *  figure, 10 shots faced for a keeper's save %. */
const q2: Qualifier = { games: 2, unit: { label: 'matches', one: 'match' } };

export const hockeyStats: SportStatSchema<'hockey'> = {
  sport: 'hockey',
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    // Top scorer: goals, then field goals (open-play skill over set pieces),
    // then assists, then fewer minutes — a house chain (FIH names no order)
    { key: 'goals', label: 'Goals', short: 'goals', one: 'goal', group: 'attack', weight: 10, matchSummary: true, abbr: 'G',
      tieBreak: [{ key: 'fieldGoals', better: 'higher' }, { key: 'assists', better: 'higher' }, { key: 'minutes', better: 'lower' }] },
    { ...ASSISTS, group: 'attack', weight: 6 },
    { key: 'cleanSheets', label: 'Clean sheets', short: 'clean sheets', one: 'clean sheet', group: 'goalkeeping', weight: 8, matchSummary: true, eligible: 'goalkeeper', coverage: 'present' },
    { key: 'shotsOnGoal', label: 'Shots on goal', short: 'shots on goal', one: 'shot on goal', compact: 'on goal', group: 'attack', weight: 1.5, abbr: 'SOG' },
    { key: 'shots', label: 'Shots', short: 'shots', one: 'shot', group: 'attack', weight: 0.5, matchSummary: true, abbr: 'SH' },
    { ...SAVES, group: 'goalkeeping', weight: 2, abbr: 'SV' },
    // goal types (credited with the goal)
    { key: 'fieldGoals', label: 'Field goals', short: 'field goals', one: 'field goal', group: 'attack' },
    { key: 'pcGoals', label: 'Penalty-corner goals', short: 'PC goals', one: 'PC goal', group: 'attack', abbr: 'PCG' },
    { key: 'strokeGoals', label: 'Penalty-stroke goals', short: 'stroke goals', one: 'stroke goal', group: 'attack' },
    { key: 'strokesMissed', label: 'Penalty strokes missed', short: 'strokes missed', one: 'stroke missed', group: 'attack', format: { unit: 'count', better: 'lower' } },
    { ...YELLOW_CARDS, group: 'discipline', weight: -3, abbr: 'YC', suspension: { minutes: 5, maxMinutes: 10 } },
    { ...RED_CARDS, group: 'discipline', weight: -8, abbr: 'RC', suspension: { permanent: true } },
    { key: 'greenCards', label: 'Green cards', short: 'green cards', one: 'green card', compact: 'green', group: 'discipline', weight: -1, abbr: 'GC', suspension: { minutes: 2 } },
    { key: 'suspensionMinutes', label: 'Minutes suspended', short: 'mins suspended', group: 'discipline', format: { unit: 'minutes', better: 'lower' }, coverage: 'present' },
    // statTotals-only: playing time and the keepers' figures
    { key: 'minutes', label: 'Minutes', short: 'mins', group: 'playing', format: { unit: 'minutes' }, coverage: 'present', abbr: 'MIN' },
    { key: 'goalsConceded', label: 'Goals conceded', short: 'conceded', group: 'goalkeeping', format: { unit: 'count', better: 'lower' }, coverage: 'present', abbr: 'GA' },
    // shoot-out (never counted as goals)
    { key: 'soGoals', label: 'Shoot-out goals', short: 'shoot-out goals', one: 'shoot-out goal', group: 'shootout' },
    { key: 'soTaken', label: 'Shoot-out attempts', short: 'shoot-out attempts', one: 'shoot-out attempt', group: 'shootout' },
    // career rates and bests
    { key: 'goalsPerGame', label: 'Goals per game', short: 'goals per game', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'perGame', key: 'goals', dp: 2, qualifier: q2 }, tieBreak: [{ key: 'goals', better: 'higher' }] },
    { key: 'conversion', label: 'Shot conversion %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'goals', den: 'shots', scale: 100, dp: 0 } },
    { key: 'mostGoals', label: 'Most goals in a match', short: 'most goals', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'goals' } },
    { key: 'hatTricks', label: 'Hat-tricks', short: 'hat-tricks', one: 'hat-trick', source: 'derived', group: 'bests', agg: { kind: 'countIf', key: 'goals', gte: 3 } },
    { key: 'soConversion', label: 'Shoot-out %', source: 'derived', group: 'shootout', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'soGoals', den: 'soTaken', scale: 100, dp: 0 } },
    // keepers — save % = saves ÷ (saves + goals conceded)
    { key: 'savePct', label: 'Save %', source: 'derived', group: 'goalkeeping', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'saves', den: ['saves', 'goalsConceded'], scale: 100, dp: 0, over: 'keeper', qualifier: { den: 10, unit: { label: 'shots faced', one: 'shot faced' } } },
      eligible: 'goalkeeper', tieBreak: [{ key: 'saves', better: 'higher' }, { key: 'cleanSheets', better: 'higher' }] },
    { key: 'concededPerGame', label: 'Conceded per game', short: 'conceded per game', source: 'derived', group: 'goalkeeping', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'perGame', key: 'goalsConceded', dp: 2, over: 'keeper' } },
    // team-level match figures (the comparison panel), never on a player line
    { key: 'pcs', label: 'Penalty corners', short: 'penalty corners', one: 'penalty corner', source: 'team' },
    { key: 'pcConversion', label: 'PC conversion', short: 'PC conversion', source: 'team', format: { unit: 'percent', dp: 0 } },
    { key: 'strokesAwarded', label: 'Penalty strokes', short: 'penalty strokes', one: 'penalty stroke', source: 'team' },
  ],
  filters: {
    keeper: (l) => l.stats != null && 'goalsConceded' in l.stats,
  },
  sections: [
    { id: 'attack', title: 'Attack', rows: [
      { stat: 'goals' }, { stat: 'goalsPerGame' }, { stat: 'fieldGoals' }, { stat: 'pcGoals' }, { stat: 'strokeGoals' },
      { stat: 'assists' }, { stat: 'shots' }, { stat: 'shotsOnGoal' }, { stat: 'conversion' }, { stat: 'strokesMissed', hideZero: true },
    ] },
    { id: 'playing', title: 'Playing time', rows: [{ stat: 'minutes' }] },
    { id: 'goalkeeping', title: 'Goalkeeping', rows: [{ stat: 'cleanSheets' }, { stat: 'saves' }, { stat: 'goalsConceded' }, { stat: 'savePct' }, { stat: 'concededPerGame' }] },
    { id: 'shootout', title: 'Shoot-outs', rows: [{ stat: 'soGoals', hideZero: true }, { stat: 'soTaken', hideZero: true }, { stat: 'soConversion' }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostGoals', label: 'Most goals (match)', hideZero: true }, { stat: 'hatTricks', hideZero: true }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'greenCards' }, { stat: 'yellowCards' }, { stat: 'redCards' }, { stat: 'suspensionMinutes' }] },
  ],
  careerView: 'sections',
  history: ['goals', 'assists', 'saves', 'pcGoals'],
  // FIH match report order: goals, then attack, keeper, cards
  box: [{ columns: [
    { key: 'minutes', abbr: 'MIN', overallOnly: true },
    { key: 'goals', abbr: 'G', emphasis: true },
    { key: 'assists', abbr: 'A' },
    { key: 'shots', abbr: 'SH' },
    { key: 'shotsOnGoal', abbr: 'SOG' },
    { key: 'pcGoals', abbr: 'PCG', label: 'Penalty-corner goals' },
    { key: 'saves', abbr: 'SV' },
    { key: 'goalsConceded', abbr: 'GA', overallOnly: true },
    { key: 'greenCards', abbr: 'GC', label: 'Green cards' },
    { key: 'yellowCards', abbr: 'YC', label: 'Yellow cards' },
    { key: 'redCards', abbr: 'RC', label: 'Red cards' },
  ] }],
  compare: [
    'shots', 'shotsOnGoal', 'pcs', 'pcGoals', 'pcConversion', 'strokesAwarded', 'strokeGoals', 'fieldGoals', 'saves',
    { key: 'greenCards', label: 'Green cards' }, { key: 'yellowCards', label: 'Yellow cards' }, { key: 'redCards', label: 'Red cards' },
  ],
  leaders: ['goals', 'fieldGoals', 'pcGoals', 'strokeGoals', 'assists', 'shotsOnGoal', 'goalsPerGame', 'saves', 'cleanSheets', 'savePct'],
  headline: ['goals', 'assists', 'pcGoals', 'saves'],
  awards: [
    { stat: 'goals', icon: '🏑', label: 'Top scorer' },
    { stat: 'savePct', icon: '🧤', label: 'Best goalkeeper', tieBreak: [{ key: 'saves', better: 'higher' }, { key: 'cleanSheets', better: 'higher' }],
      howRanked: 'Goalkeepers only (anyone who kept goal in these matches). Best save % (saves ÷ shots on goal faced, at least 10 faced), then most saves, then most clean sheets. Shoot-outs don\'t count. You choose the winner.' },
  ],
  scoreUnit: 'goals',
};
