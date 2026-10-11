/** SD-146 — netball's stat schema (see ../statSchema.ts). PURE. Built from the
 *  World Netball / elite-league match statistics: goals and attempts (only GS
 *  and GA shoot), shooting %, goal assists and feeds, intercepts, deflections,
 *  rebounds, general-play turnovers, penalties (contact / obstruction), and
 *  the sanctions (warning, suspension, ordering off). The career shows where a
 *  player played: quarters at each position (GS … GK). Every line key is
 *  absolute — `statTotals` (./totals.ts) owns the whole line. */
import type { Qualifier, SportStatSchema, StatDef } from '../statSchema.ts';
import { POSITIONS, POS_LONG } from './engine.ts';

/** House minimums (not from World Netball): 2 matches for a per-match figure,
 *  20 attempts for shooting %. Organisers can change them (leaderMins). */
const q2: Qualifier = { games: 2, unit: { label: 'matches', one: 'match' } };

const posStats: StatDef[] = POSITIONS.map((p) => ({
  key: `q${p}`, label: `Quarters at ${p}`, short: `quarters at ${p}`, one: `quarter at ${p}`, group: 'positions',
  format: { unit: 'count' as const }, coverage: 'present' as const, abbr: p,
}));

export const netballStats: SportStatSchema<'netball'> = {
  sport: 'netball',
  splits: ['format', 'tournament', 'season', 'opponent'],
  /** tournament / hub leaderboard + awards chips (4 × 15 / 4 × 10 / 2 × 20) */
  leaderSplits: ['format'],
  stats: [
    // Top scorer: goals, then shooting accuracy (fewer attempts), then goal assists
    { key: 'goals', label: 'Goals', short: 'goals', one: 'goal', group: 'shooting', weight: 2, matchSummary: true, abbr: 'G',
      tieBreak: [{ key: 'attempts', better: 'lower' }, { key: 'goalAssists', better: 'higher' }] },
    { key: 'attempts', label: 'Attempts', short: 'attempts', one: 'attempt', group: 'shooting', weight: 0, abbr: 'ATT' },
    { key: 'goalAssists', label: 'Goal assists', short: 'goal assists', one: 'goal assist', group: 'attack', weight: 2, abbr: 'GA' },
    { key: 'feeds', label: 'Feeds', short: 'feeds', one: 'feed', group: 'attack', weight: 0.5, abbr: 'FD' },
    { key: 'intercepts', label: 'Intercepts', short: 'intercepts', one: 'intercept', group: 'defence', weight: 4, abbr: 'INT' },
    { key: 'deflections', label: 'Deflections', short: 'deflections', one: 'deflection', group: 'defence', weight: 2, abbr: 'DEF' },
    { key: 'rebounds', label: 'Rebounds', short: 'reb', abbr: 'REB', group: 'defence', weight: 2 },
    { key: 'turnovers', label: 'Turnovers', short: 'turnovers', one: 'turnover', abbr: 'TO', group: 'defence', format: { unit: 'count', better: 'lower' }, weight: -2 },
    { key: 'penaltiesConceded', label: 'Penalties', short: 'penalties', one: 'penalty', abbr: 'PEN', group: 'discipline', format: { unit: 'count', better: 'lower' }, weight: -0.5 },
    { key: 'contacts', label: 'Contacts', short: 'contacts', one: 'contact', group: 'discipline', format: { unit: 'count', better: 'lower' } },
    { key: 'obstructions', label: 'Obstructions', short: 'obstructions', one: 'obstruction', group: 'discipline', format: { unit: 'count', better: 'lower' } },
    { key: 'warnings', label: 'Warnings', short: 'warnings', one: 'warning', abbr: 'W', group: 'discipline', weight: -2 },
    { key: 'suspensions', label: 'Suspensions', short: 'suspensions', one: 'suspension', abbr: 'S', group: 'discipline', weight: -4, suspension: { minutes: 2 } },
    { key: 'orderedOff', label: 'Ordered off', short: 'times ordered off', one: 'ordered off', abbr: 'OFF', group: 'discipline', weight: -8, suspension: { permanent: true } },
    { key: 'suspensionMinutes', label: 'Minutes suspended', short: 'mins suspended', group: 'discipline', format: { unit: 'minutes', better: 'lower' }, coverage: 'present' },
    // statTotals-only: playing time and positions
    { key: 'minutes', label: 'Minutes', short: 'mins', group: 'playing', format: { unit: 'minutes' }, coverage: 'present', abbr: 'MIN' },
    { key: 'quarters', label: 'Quarters played', short: 'quarters', one: 'quarter', group: 'playing', format: { unit: 'count' }, coverage: 'present', abbr: 'Q' },
    ...posStats,
    // career rates and bests
    { key: 'shotPct', label: 'Shooting %', source: 'derived', group: 'shooting', format: { unit: 'percent', dp: 0 }, abbr: '%',
      agg: { kind: 'rate', num: 'goals', den: 'attempts', scale: 100, dp: 0, qualifier: { den: 20, unit: { label: 'attempts', one: 'attempt' } } },
      tieBreak: [{ key: 'goals', better: 'higher' }] },
    { key: 'goalsPerGame', label: 'Goals per game', short: 'goals per game', source: 'derived', group: 'shooting', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'perGame', key: 'goals', dp: 1, qualifier: q2 }, tieBreak: [{ key: 'goals', better: 'higher' }] },
    { key: 'interceptsPerGame', label: 'Intercepts per game', short: 'intercepts per game', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'perGame', key: 'intercepts', dp: 1, qualifier: q2 }, tieBreak: [{ key: 'intercepts', better: 'higher' }] },
    { key: 'mostGoals', label: 'Most goals in a match', short: 'most goals', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'goals' } },
    { key: 'mostIntercepts', label: 'Most intercepts in a match', short: 'most intercepts', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'intercepts' } },
    // team-level match figures (the comparison panel), never on a player line
    { key: 'centrePasses', label: 'Centre passes', short: 'centre passes', one: 'centre pass', source: 'team' },
    { key: 'cpGoals', label: 'Centre-pass goals', short: 'centre-pass goals', one: 'centre-pass goal', source: 'team' },
    { key: 'gainGoals', label: 'Goals from gains', short: 'goals from gains', one: 'goal from a gain', source: 'team' },
    { key: 'timeouts', label: 'Team time-outs', short: 'team time-outs', one: 'team time-out', source: 'team' },
  ],
  sections: [
    { id: 'shooting', title: 'Shooting', rows: [{ stat: 'goals' }, { stat: 'attempts' }, { stat: 'shotPct' }, { stat: 'goalsPerGame' }] },
    { id: 'attack', title: 'Attack', rows: [{ stat: 'goalAssists' }, { stat: 'feeds' }] },
    { id: 'defence', title: 'Defence & ball', rows: [{ stat: 'intercepts' }, { stat: 'interceptsPerGame' }, { stat: 'deflections' }, { stat: 'rebounds' }, { stat: 'turnovers' }] },
    { id: 'positions', title: 'Positions played', rows: [{ stat: 'quarters' }, ...POSITIONS.map((p) => ({ stat: `q${p}`, label: `${p} · ${POS_LONG[p]}`, hideZero: true }))] },
    { id: 'playing', title: 'Playing time', rows: [{ stat: 'minutes' }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostGoals', label: 'Most goals (match)', hideZero: true }, { stat: 'mostIntercepts', label: 'Most intercepts (match)', hideZero: true }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'penaltiesConceded' }, { stat: 'contacts', hideZero: true }, { stat: 'obstructions', hideZero: true }, { stat: 'warnings' }, { stat: 'suspensions' }, { stat: 'orderedOff', hideZero: true }, { stat: 'suspensionMinutes', hideZero: true }] },
  ],
  careerView: 'sections',
  history: ['goals', 'intercepts', 'goalAssists', 'rebounds'],
  box: [{ columns: [
    { key: 'quarters', abbr: 'Q', overallOnly: true },
    { key: 'goals', abbr: 'G', emphasis: true },
    { key: 'shooting', abbr: 'G/A', label: 'Goals / attempts', pair: ['goals', 'attempts'] },
    'shotPct',
    { key: 'goalAssists', abbr: 'GA' },
    { key: 'feeds', abbr: 'FD' },
    { key: 'intercepts', abbr: 'INT' },
    { key: 'deflections', abbr: 'DEF' },
    { key: 'rebounds', abbr: 'REB' },
    { key: 'turnovers', abbr: 'TO' },
    { key: 'penaltiesConceded', abbr: 'PEN' },
    { key: 'warnings', abbr: 'W', occasional: true },
    { key: 'suspensions', abbr: 'S', occasional: true },
  ] }],
  compare: [
    'attempts', 'shotPct', 'centrePasses', 'cpGoals', 'gainGoals', 'goalAssists', 'feeds', 'intercepts', 'deflections', 'rebounds', 'turnovers',
    'penaltiesConceded', 'contacts', 'obstructions', 'warnings', 'suspensions', 'timeouts',
  ],
  leaders: ['goals', 'shotPct', 'goalsPerGame', 'goalAssists', 'intercepts', 'deflections', 'rebounds', 'feeds'],
  headline: ['goals', 'intercepts', 'goalAssists', 'rebounds'],
  awards: [
    { stat: 'goals', icon: '🥅', label: 'Top shooter', tieBreak: [{ key: 'shotPct', better: 'higher' }] },
    { stat: 'shotPct', icon: '🎯', label: 'Best shooting %', match: false,
      howRanked: 'Shooters with at least 20 attempts in these matches (the organiser can change the minimum). Best goals ÷ attempts, then most goals. You choose the winner.' },
    { stat: 'intercepts', icon: '🖐', label: 'Top interceptor', tieBreak: [{ key: 'deflections', better: 'higher' }] },
  ],
  scoreUnit: 'goals',
};
