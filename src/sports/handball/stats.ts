/** SD-102 — handball's stat schema (see ../statSchema.ts). PURE. Built from the
 *  SD-15 sample (tests/stat-schema.test.mts): goals and attempts by type (6 m,
 *  9 m, wing, breakthrough, fast break, 7 m), assists, keeper saves and save %,
 *  technical faults, steals, blocks, warnings, 2-minute suspensions and
 *  disqualifications. Every line key is absolute — `statTotals` (./totals.ts)
 *  owns the whole line. A key shared with another sport keeps its labels. */
import type { Qualifier, SportStatSchema, StatDef } from '../statSchema.ts';
import { ASSISTS, BLOCKS, RED_CARDS, SAVES, YELLOW_CARDS } from '../sharedStats.ts';

/** House minimums (not from the IHF regulations): 2 matches for a per-match
 *  figure, 20 shots on goal faced for a keeper's save %, 20 attempts for
 *  shooting %, 5 throws for 7 m %. */
const q2: Qualifier = { games: 2, unit: { label: 'matches', one: 'match' } };

const TYPES: [string, string, string, string][] = [
  // key prefix, label, short, abbr
  ['sixM', '6 m', '6 m', '6M'],
  ['nineM', '9 m', '9 m', '9M'],
  ['wing', 'Wing', 'wing', 'WG'],
  ['breakthrough', 'Breakthrough', 'breakthrough', 'BT'],
  ['fastBreak', 'Fast break', 'fast break', 'FB'],
];
const typeStats: StatDef[] = TYPES.flatMap(([k, label, short, abbr]) => [
  { key: `${k}Goals`, label: `${label} goals`, short: `${short} goals`, one: `${short} goal`, group: 'types', abbr: `${abbr}G` },
  { key: `${k}Shots`, label: `${label} attempts`, short: `${short} attempts`, one: `${short} attempt`, group: 'types', abbr: `${abbr}S` },
  { key: `${k}Pct`, label: `${label} %`, source: 'derived' as const, group: 'types', format: { unit: 'percent' as const, dp: 0 },
    agg: { kind: 'rate' as const, num: `${k}Goals`, den: `${k}Shots`, scale: 100, dp: 0 } },
]);

export const handballStats: SportStatSchema<'handball'> = {
  sport: 'handball',
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    // Top scorer: goals, then fewer attempts (IHF statistics rank by goals;
    // the shooting tie-break is a house choice), then assists
    { key: 'goals', label: 'Goals', short: 'goals', one: 'goal', group: 'attack', weight: 5, matchSummary: true, abbr: 'G',
      tieBreak: [{ key: 'shots', better: 'lower' }, { key: 'assists', better: 'higher' }] },
    { ...ASSISTS, group: 'attack', weight: 3 },
    { key: 'shots', label: 'Shots', short: 'shots', one: 'shot', group: 'attack', weight: 0, matchSummary: true, abbr: 'SH' },
    { ...SAVES, group: 'goalkeeping', weight: 1.5, abbr: 'SV' },
    { key: 'sevenMGoals', label: '7 m goals', short: '7 m goals', one: '7 m goal', group: 'attack', abbr: '7MG' },
    { key: 'sevenMTaken', label: '7 m throws', short: '7 m throws', one: '7 m throw', group: 'attack', abbr: '7MS' },
    { key: 'steals', label: 'Steals', short: 'steals', one: 'steal', abbr: 'ST', group: 'defence', weight: 1.5 },
    { ...BLOCKS, abbr: 'BS', group: 'defence', weight: 1.5 },
    { key: 'technicalFaults', label: 'Technical faults', short: 'technical faults', one: 'technical fault', compact: 'tech. faults', compactOne: 'tech. fault', abbr: 'TF', group: 'defence', format: { unit: 'count', better: 'lower' }, weight: -1 },
    { key: 'sevenMSaves', label: '7 m saves', short: '7 m saves', one: '7 m save', group: 'goalkeeping', abbr: '7MSV' },
    ...typeStats,
    { ...YELLOW_CARDS, group: 'discipline', weight: -1, abbr: 'YC' },
    { key: 'twoMinutes', label: '2-minute suspensions', short: '2-min suspensions', one: '2-min suspension', compact: "2'", abbr: "2'", group: 'discipline', weight: -2, suspension: { minutes: 2 } },
    { ...RED_CARDS, group: 'discipline', weight: -6, abbr: 'D', suspension: { permanent: true } },
    { key: 'blueCards', label: 'Blue cards', short: 'blue cards', one: 'blue card', compact: 'blue', group: 'discipline', abbr: 'BC' },
    { key: 'suspensionMinutes', label: 'Minutes suspended', short: 'mins suspended', group: 'discipline', format: { unit: 'minutes', better: 'lower' }, coverage: 'present' },
    // statTotals-only: playing time and the keepers' figures
    { key: 'minutes', label: 'Minutes', short: 'mins', group: 'playing', format: { unit: 'minutes' }, coverage: 'present', abbr: 'MIN' },
    { key: 'goalsConceded', label: 'Goals conceded', short: 'conceded', group: 'goalkeeping', format: { unit: 'count', better: 'lower' }, coverage: 'present', abbr: 'GA' },
    { key: 'sevenMConceded', label: '7 m goals conceded', short: '7 m conceded', group: 'goalkeeping', format: { unit: 'count', better: 'lower' }, coverage: 'present' },
    // 7-metre shoot-out (never counted as goals)
    { key: 'soGoals', label: 'Shoot-out goals', short: 'shoot-out goals', one: 'shoot-out goal', group: 'shootout' },
    { key: 'soTaken', label: 'Shoot-out attempts', short: 'shoot-out attempts', one: 'shoot-out attempt', group: 'shootout' },
    // career rates and bests
    { key: 'goalsPerGame', label: 'Goals per game', short: 'goals per game', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'perGame', key: 'goals', dp: 2, qualifier: q2 }, tieBreak: [{ key: 'goals', better: 'higher' }] },
    { key: 'shotPct', label: 'Shooting %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 }, abbr: '%',
      agg: { kind: 'rate', num: 'goals', den: 'shots', scale: 100, dp: 0, qualifier: { den: 20, unit: { label: 'attempts', one: 'attempt' } } },
      tieBreak: [{ key: 'goals', better: 'higher' }] },
    { key: 'sevenMPct', label: '7 m %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'sevenMGoals', den: 'sevenMTaken', scale: 100, dp: 0, qualifier: { den: 5, unit: { label: '7 m throws', one: '7 m throw' } } },
      tieBreak: [{ key: 'sevenMGoals', better: 'higher' }] },
    { key: 'mostGoals', label: 'Most goals in a match', short: 'most goals', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'goals' } },
    { key: 'mostSaves', label: 'Most saves in a match', short: 'most saves', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'saves' } },
    { key: 'soConversion', label: 'Shoot-out %', source: 'derived', group: 'shootout', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'soGoals', den: 'soTaken', scale: 100, dp: 0 } },
    // keepers — save % = saves ÷ shots on goal faced (saves + goals conceded)
    { key: 'savePct', label: 'Save %', source: 'derived', group: 'goalkeeping', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'saves', den: ['saves', 'goalsConceded'], scale: 100, dp: 0, over: 'keeper', qualifier: { den: 20, unit: { label: 'shots faced', one: 'shot faced' } } },
      eligible: 'goalkeeper', tieBreak: [{ key: 'saves', better: 'higher' }] },
    { key: 'sevenMSavePct', label: '7 m save %', source: 'derived', group: 'goalkeeping', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'sevenMSaves', den: ['sevenMSaves', 'sevenMConceded'], scale: 100, dp: 0, over: 'keeper' } },
    { key: 'concededPerGame', label: 'Conceded per game', short: 'conceded per game', source: 'derived', group: 'goalkeeping', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'perGame', key: 'goalsConceded', dp: 2, over: 'keeper' } },
    // team-level match figures (the comparison panel), never on a player line
    { key: 'timeouts', label: 'Team time-outs', short: 'team time-outs', one: 'team time-out', source: 'team' },
  ],
  filters: {
    keeper: (l) => l.stats != null && 'goalsConceded' in l.stats,
  },
  sections: [
    { id: 'attack', title: 'Attack', rows: [
      { stat: 'goals' }, { stat: 'goalsPerGame' }, { stat: 'shots' }, { stat: 'shotPct' }, { stat: 'assists' },
      { stat: 'sevenMGoals' }, { stat: 'sevenMTaken' }, { stat: 'sevenMPct' },
    ] },
    { id: 'types', title: 'Goals by type', rows: TYPES.flatMap(([k]) => [{ stat: `${k}Goals`, hideZero: true }, { stat: `${k}Pct` }]) },
    { id: 'defence', title: 'Defence & ball', rows: [{ stat: 'steals' }, { stat: 'blocks' }, { stat: 'technicalFaults' }] },
    { id: 'playing', title: 'Playing time', rows: [{ stat: 'minutes' }] },
    { id: 'goalkeeping', title: 'Goalkeeping', rows: [{ stat: 'saves' }, { stat: 'goalsConceded' }, { stat: 'savePct' }, { stat: 'sevenMSaves' }, { stat: 'sevenMSavePct' }, { stat: 'concededPerGame' }] },
    { id: 'shootout', title: '7 m shoot-outs', rows: [{ stat: 'soGoals', hideZero: true }, { stat: 'soTaken', hideZero: true }, { stat: 'soConversion' }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostGoals', label: 'Most goals (match)', hideZero: true }, { stat: 'mostSaves', label: 'Most saves (match)', hideZero: true }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'yellowCards' }, { stat: 'twoMinutes' }, { stat: 'redCards', label: 'Disqualifications' }, { stat: 'blueCards', hideZero: true }, { stat: 'suspensionMinutes' }] },
  ],
  careerView: 'sections',
  history: ['goals', 'saves', 'assists', 'sevenMGoals'],
  // IHF match statistics: goals / attempts, 7 m, assists, TF, ST, BS, keeper, sanctions
  box: [{ columns: [
    { key: 'minutes', abbr: 'MIN', overallOnly: true },
    { key: 'goals', abbr: 'G', emphasis: true },
    { key: 'shots', abbr: 'SH' },
    { key: 'sevenM', abbr: '7M', label: '7 m goals-throws', pair: ['sevenMGoals', 'sevenMTaken'] },
    { key: 'assists', abbr: 'AS' },
    { key: 'technicalFaults', abbr: 'TF' },
    { key: 'steals', abbr: 'ST' },
    { key: 'blocks', abbr: 'BS' },
    { key: 'saves', abbr: 'SV' },
    { key: 'goalsConceded', abbr: 'GA', overallOnly: true },
    { key: 'yellowCards', abbr: 'YC', label: 'Warnings (yellow)' },
    { key: 'twoMinutes', abbr: "2'", label: '2-minute suspensions' },
    { key: 'redCards', abbr: 'D', label: 'Disqualifications' },
  ] }],
  compare: [
    'shots', 'shotPct', 'sixMGoals', 'nineMGoals', 'wingGoals', 'breakthroughGoals', 'fastBreakGoals', 'sevenMGoals', 'sevenMTaken',
    'saves', 'steals', 'blocks', 'technicalFaults', 'timeouts',
    { key: 'yellowCards', label: 'Warnings' }, { key: 'twoMinutes', label: '2-minute suspensions' }, { key: 'redCards', label: 'Disqualifications' },
  ],
  leaders: ['goals', 'sevenMGoals', 'assists', 'goalsPerGame', 'shotPct', 'saves', 'savePct', 'steals', 'blocks'],
  headline: ['goals', 'saves', 'assists', 'steals'],
  awards: [
    { stat: 'goals', icon: '🤾', label: 'Top scorer' },
    { stat: 'savePct', icon: '🧤', label: 'Best goalkeeper', tieBreak: [{ key: 'saves', better: 'higher' }],
      howRanked: 'Goalkeepers only (anyone who kept goal in these matches). Best save % (saves ÷ shots on goal faced, at least 20 faced), then most saves. 7 m shoot-outs don\'t count. You choose the winner.' },
  ],
  scoreUnit: 'goals',
};
