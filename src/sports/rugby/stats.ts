/** SD-143 — rugby union's stat schema (see ../statSchema.ts). PURE. Points,
 *  tries, try assists, goal kicking (conversions, penalty goals, drop goals —
 *  made and attempted, success %), cards, minutes, the kicking competition,
 *  and the optional detail (tackles, missed tackles, carries, line breaks,
 *  turnovers won, penalties conceded — keyed: only matches that tracked
 *  them). Every line key is absolute — `statTotals` (./totals.ts) owns the
 *  whole line. A key shared with another sport keeps its labels. */
import type { Qualifier, SportStatSchema } from '../statSchema.ts';
import { POINTS, RED_CARDS, YELLOW_CARDS } from '../sharedStats.ts';

/** House minimums (not from World Rugby): 2 matches for a per-match figure,
 *  10 goal kicks for a kicking %. */
const q2: Qualifier = { games: 2, unit: { label: 'matches', one: 'match' } };
const q10: Qualifier = { den: 10, unit: { label: 'kicks at goal', one: 'kick at goal' } };

export const rugbyStats: SportStatSchema<'rugby'> = {
  sport: 'rugby',
  splits: ['format', 'tournament', 'season', 'opponent'],
  /** 15s / sevens / tens / age-grade halves are different games */
  leaderSplits: ['format'],
  stats: [
    { ...POINTS, group: 'scoring', weight: 1, tieBreak: [{ key: 'tries', better: 'higher' }] },
    { key: 'tries', label: 'Tries', short: 'tries', one: 'try', abbr: 'T', group: 'scoring', weight: 3,
      tieBreak: [{ key: 'tryAssists', better: 'higher' }] },
    { key: 'tryAssists', label: 'Try assists', short: 'try assists', one: 'try assist', abbr: 'TA', group: 'scoring', weight: 1.5 },
    { key: 'conversions', label: 'Conversions', short: 'conversions', one: 'conversion', abbr: 'C', group: 'kicking' },
    { key: 'conversionAttempts', label: 'Conversion attempts', short: 'conversion attempts', one: 'conversion attempt', group: 'kicking' },
    { key: 'penGoals', label: 'Penalty goals', short: 'penalty goals', one: 'penalty goal', abbr: 'PG', group: 'kicking' },
    { key: 'penGoalAttempts', label: 'Penalty goal attempts', short: 'penalty goal attempts', one: 'penalty goal attempt', group: 'kicking' },
    { key: 'dropGoals', label: 'Drop goals', short: 'drop goals', one: 'drop goal', abbr: 'DG', group: 'kicking' },
    { key: 'dropGoalAttempts', label: 'Drop goal attempts', short: 'drop goal attempts', one: 'drop goal attempt', group: 'kicking' },
    { ...YELLOW_CARDS, group: 'discipline', weight: -1, abbr: 'YC', suspension: { minutes: 10 } },
    { ...RED_CARDS, group: 'discipline', weight: -4, abbr: 'RC', suspension: { permanent: true } },
    { key: 'minutes', label: 'Minutes', short: 'mins', group: 'playing', format: { unit: 'minutes' }, coverage: 'present', abbr: 'MIN' },
    // optional detail (off by default; keyed — never a 0 for a match that didn't track it)
    { key: 'tackles', label: 'Tackles', short: 'tackles', one: 'tackle', group: 'defence', weight: 0.3, coverage: 'keyed', abbr: 'TK' },
    { key: 'missedTackles', label: 'Missed tackles', short: 'missed tackles', one: 'missed tackle', group: 'defence', coverage: 'keyed', abbr: 'MT', format: { unit: 'count', better: 'lower' } },
    { key: 'turnoversWon', label: 'Turnovers won', short: 'turnovers won', one: 'turnover won', group: 'defence', weight: 1, coverage: 'keyed', abbr: 'TW' },
    { key: 'carries', label: 'Carries', short: 'carries', one: 'carry', group: 'attack', weight: 0.2, coverage: 'keyed', abbr: 'CA' },
    { key: 'lineBreaks', label: 'Line breaks', short: 'line breaks', one: 'line break', group: 'attack', weight: 1, coverage: 'keyed', abbr: 'LB' },
    { key: 'penaltiesGivenAway', label: 'Penalties conceded', short: 'penalties conceded', one: 'penalty conceded', group: 'discipline', weight: -0.5, coverage: 'keyed', abbr: 'PC', format: { unit: 'count', better: 'lower' } },
    // kicking competition (never points)
    { key: 'soGoals', label: 'Shoot-out goals', short: 'shoot-out goals', one: 'shoot-out goal', group: 'shootout' },
    { key: 'soTaken', label: 'Shoot-out attempts', short: 'shoot-out attempts', one: 'shoot-out attempt', group: 'shootout' },
    // career rates and bests
    { key: 'pointsPerGame', label: 'Points per game', short: 'points per game', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'perGame', key: 'points', dp: 1, qualifier: q2 }, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'triesPerGame', label: 'Tries per game', short: 'tries per game', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'perGame', key: 'tries', dp: 2, qualifier: q2 }, tieBreak: [{ key: 'tries', better: 'higher' }] },
    { key: 'conversionPct', label: 'Conversion %', source: 'derived', group: 'kicking', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'conversions', den: 'conversionAttempts', scale: 100, dp: 0, qualifier: { den: 5, unit: { label: 'conversion attempts', one: 'conversion attempt' } } },
      tieBreak: [{ key: 'conversions', better: 'higher' }] },
    { key: 'goalKickPct', label: 'Goal-kicking %', source: 'derived', group: 'kicking', format: { unit: 'percent', dp: 0 }, abbr: 'GK%',
      agg: { kind: 'rate', num: ['conversions', 'penGoals'], den: ['conversionAttempts', 'penGoalAttempts'], scale: 100, dp: 0, qualifier: q10 },
      tieBreak: [{ key: 'penGoals', better: 'higher' }] },
    { key: 'tackleSuccessPct', label: 'Tackle success %', source: 'derived', group: 'defence', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'tackles', den: ['tackles', 'missedTackles'], scale: 100, dp: 0, qualifier: { den: 20, unit: { label: 'tackles', one: 'tackle' } } } },
    { key: 'mostTries', label: 'Most tries in a match', short: 'most tries', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'tries' } },
    { key: 'mostPoints', label: 'Most points in a match', short: 'most points', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'points' } },
    // team-level match figures (the comparison panel), never on a player line
    { key: 'penaltyTries', label: 'Penalty tries', short: 'penalty tries', one: 'penalty try', source: 'team' },
    { key: 'lineoutsWon', label: 'Lineouts won (own throw)', short: 'lineouts won', one: 'lineout won', source: 'team' },
    { key: 'lineoutsLost', label: 'Lineouts lost (own throw)', short: 'lineouts lost', one: 'lineout lost', source: 'team' },
    { key: 'scrumsWon', label: 'Scrums won (own feed)', short: 'scrums won', one: 'scrum won', source: 'team' },
    { key: 'scrumsLost', label: 'Scrums lost (own feed)', short: 'scrums lost', one: 'scrum lost', source: 'team' },
  ],
  sections: [
    { id: 'scoring', title: 'Scoring', rows: [{ stat: 'points' }, { stat: 'pointsPerGame' }, { stat: 'tries' }, { stat: 'triesPerGame' }, { stat: 'tryAssists' }] },
    { id: 'kicking', title: 'Goal kicking', rows: [
      { stat: 'conversions' }, { stat: 'conversionAttempts' }, { stat: 'conversionPct' },
      { stat: 'penGoals' }, { stat: 'penGoalAttempts' }, { stat: 'goalKickPct' },
      { stat: 'dropGoals', hideZero: true }, { stat: 'dropGoalAttempts', hideZero: true },
    ] },
    { id: 'attack', title: 'Attack', rows: [{ stat: 'carries' }, { stat: 'lineBreaks' }] },
    { id: 'defence', title: 'Defence', rows: [{ stat: 'tackles' }, { stat: 'missedTackles' }, { stat: 'tackleSuccessPct' }, { stat: 'turnoversWon' }] },
    { id: 'playing', title: 'Playing time', rows: [{ stat: 'minutes' }] },
    { id: 'shootout', title: 'Kicking competitions', rows: [{ stat: 'soGoals', hideZero: true }, { stat: 'soTaken', hideZero: true }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostTries', label: 'Most tries (match)', hideZero: true }, { stat: 'mostPoints', label: 'Most points (match)', hideZero: true }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'yellowCards' }, { stat: 'redCards' }, { stat: 'penaltiesGivenAway' }] },
  ],
  careerView: 'sections',
  history: ['points', 'tries', 'conversions', 'penGoals'],
  box: [{ columns: [
    { key: 'minutes', abbr: 'MIN', overallOnly: true },
    { key: 'tries', abbr: 'T' },
    { key: 'conv', abbr: 'C', label: 'Conversions made-attempted', pair: ['conversions', 'conversionAttempts'] },
    { key: 'pens', abbr: 'PG', label: 'Penalty goals made-attempted', pair: ['penGoals', 'penGoalAttempts'] },
    { key: 'drops', abbr: 'DG', label: 'Drop goals made-attempted', pair: ['dropGoals', 'dropGoalAttempts'] },
    { key: 'points', abbr: 'PTS', emphasis: true },
    { key: 'tryAssists', abbr: 'TA' },
    { key: 'tackles', abbr: 'TK' },
    { key: 'missedTackles', abbr: 'MT' },
    { key: 'carries', abbr: 'CA' },
    { key: 'lineBreaks', abbr: 'LB' },
    { key: 'turnoversWon', abbr: 'TW' },
    { key: 'penaltiesGivenAway', abbr: 'PC' },
    { key: 'yellowCards', abbr: 'YC', label: 'Yellow cards' },
    { key: 'redCards', abbr: 'RC', label: 'Red cards' },
  ] }],
  compare: [
    'tries', 'penaltyTries', 'conversions', 'conversionAttempts', 'penGoals', 'penGoalAttempts', 'dropGoals',
    'lineoutsWon', 'lineoutsLost', 'scrumsWon', 'scrumsLost', 'tackles', 'missedTackles', 'carries', 'lineBreaks', 'turnoversWon', 'penaltiesGivenAway',
    'yellowCards', 'redCards',
  ],
  leaders: ['points', 'tries', 'conversions', 'penGoals', 'goalKickPct', 'tryAssists', 'pointsPerGame', 'tackles', 'turnoversWon'],
  headline: ['points', 'tries', 'conversions', 'tryAssists'],
  awards: [
    { stat: 'tries', icon: '🏉', label: 'Top try scorer', tieBreak: [{ key: 'tryAssists', better: 'higher' }] },
    { stat: 'points', icon: '🎯', label: 'Top points scorer', tieBreak: [{ key: 'tries', better: 'higher' }] },
  ],
  scoreUnit: 'points',
};
