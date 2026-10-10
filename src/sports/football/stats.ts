/** SD-15 — football's stat schema (see ../statSchema.ts). PURE. Stats with a
 *  weight keep the MVP weight order. Optional stats follow the scorer's
 *  per-game tracking toggles (`mode`), so a line that didn't track them reads
 *  "not tracked" (D8). */
import type { SportStatSchema } from '../statSchema.ts';
import { ASSISTS, BLOCKS, FOULS, RED_CARDS, SAVES, YELLOW_CARDS } from '../sharedStats.ts';

const opt = (mode: string) => ({ coverage: 'optional' as const, mode });

export const footballStats: SportStatSchema<'football'> = {
  sport: 'football',
  /** SD-25 — career split chips (line context) */
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    { key: 'goals', label: 'Goals', short: 'goals', one: 'goal', group: 'attack', weight: 10, matchSummary: true },
    { ...ASSISTS, group: 'attack', weight: 6 },
    { key: 'cleanSheets', label: 'Clean sheets', short: 'clean sheets', one: 'clean sheet', group: 'goalkeeping', weight: 8, matchSummary: true, eligible: 'goalkeeper' },
    { key: 'shotsOnTarget', label: 'Shots on target', short: 'shots on target', one: 'shot on target', compact: 'on target', group: 'attack', weight: 1.5, matchSummary: true, ...opt('shots') },
    { key: 'shots', label: 'Shots', short: 'shots', one: 'shot', group: 'attack', weight: 0.5, matchSummary: true, ...opt('shots') },
    { ...SAVES, group: 'goalkeeping', weight: 2, ...opt('saves') },
    { key: 'tackles', label: 'Tackles', short: 'tackles', one: 'tackle', group: 'defence', weight: 1, matchSummary: true, ...opt('tackles') },
    { key: 'interceptions', label: 'Interceptions', short: 'interceptions', one: 'interception', group: 'defence', weight: 1, matchSummary: true, ...opt('interceptions') },
    { key: 'attackingContributions', label: 'Attacking plays', short: 'attacking plays', one: 'attacking play', compact: 'att. plays', compactOne: 'att. play', group: 'attack', weight: 1, matchSummary: true, ...opt('attackContribution') },
    { key: 'defensiveContributions', label: 'Defensive plays', short: 'defensive plays', one: 'defensive play', compact: 'def. plays', compactOne: 'def. play', group: 'defence', weight: 1, matchSummary: true, ...opt('defenceContribution') },
    { key: 'passesComplete', label: 'Passes completed', short: 'passes completed', one: 'pass completed', compact: 'passes', compactOne: 'pass', group: 'passing', weight: 0.05, matchSummary: true, ...opt('passes') },
    { key: 'crosses', label: 'Crosses', short: 'crosses', one: 'cross', group: 'attack', weight: 0.5, matchSummary: true },
    { key: 'dribbles', label: 'Dribbles', short: 'dribbles', one: 'dribble', group: 'attack', weight: 0.5, matchSummary: true },
    // a block (SD-08) weighs what "defensive play" did
    { ...BLOCKS, group: 'defence', weight: 1, ...opt('shots') },
    { key: 'penaltiesWon', label: 'Penalties won', short: 'penalties won', one: 'penalty won', compact: 'pen won', group: 'attack', weight: 2, matchSummary: true },
    { key: 'penaltiesMissed', label: 'Penalties missed', short: 'penalties missed', one: 'penalty missed', compact: 'pen missed', group: 'attack', weight: -3, matchSummary: true },
    { ...FOULS, group: 'discipline', weight: -1, ...opt('fouls') },
    { key: 'offsides', label: 'Offsides', short: 'offsides', compact: 'offside', group: 'discipline', weight: -0.5, matchSummary: true },
    { key: 'handballs', label: 'Handballs', short: 'handballs', one: 'handball', compact: 'handball', group: 'discipline', weight: -1, matchSummary: true },
    { ...YELLOW_CARDS, group: 'discipline', weight: -2 },
    { ...RED_CARDS, group: 'discipline', weight: -6 },
    // goal types (credited with the goal)
    { key: 'openPlayGoals', label: 'Open-play goals', short: 'open-play', group: 'attack' },
    { key: 'penaltyGoals', label: 'Penalties', short: 'penalties', one: 'penalty', group: 'attack' },
    { key: 'freekickGoals', label: 'Free-kick goals', short: 'free-kick goals', one: 'free-kick goal', group: 'attack' },
    { key: 'passes', label: 'Passes', short: 'passes', one: 'pass', group: 'passing', ...opt('passes') },
    // SD-09 keeper lines (statTotals): goals let in
    { key: 'goalsConceded', label: 'Goals conceded', short: 'conceded', group: 'goalkeeping', format: { unit: 'count', better: 'lower' }, coverage: 'present' },
    // SD-29: minutes on the pitch for every player (statTotals; regulation
    // minutes — added time not counted, FIFA / Opta)
    { key: 'minutes', label: 'Minutes', short: 'mins', group: 'playing', format: { unit: 'minutes' }, coverage: 'present' },
    // SD-29: optional grassroots sin-bin (format `sinBinMinutes`)
    { key: 'sinBins', label: 'Sin-bins', short: 'sin-bins', one: 'sin-bin', group: 'discipline' },
    // SD-24 (FB-08) — rates and bests for the career
    { key: 'goalsPerGame', label: 'Goals per game', short: 'goals per game', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 }, agg: { kind: 'perGame', key: 'goals', dp: 2 } },
    { key: 'goalsPer90', label: 'Goals per 90', short: 'goals per 90', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'rate', num: 'goals', den: 'minutes', scale: 90, dp: 2, over: 'withMinutes' } },
    { key: 'shotAccuracy', label: 'Shots on target %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'shotsOnTarget', den: 'shots', scale: 100, dp: 0 } },
    { key: 'conversion', label: 'Shot conversion %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'goals', den: 'shots', scale: 100, dp: 0 } },
    { key: 'mostGoals', label: 'Most goals in a match', short: 'most goals', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'goals' } },
    { key: 'hatTricks', label: 'Hat-tricks', short: 'hat-tricks', one: 'hat-trick', source: 'derived', group: 'bests', agg: { kind: 'countIf', key: 'goals', gte: 3 } },
    // keepers (SD-09: a keeper line carries goalsConceded) — save % = saves ÷ shots on target faced
    { key: 'savePct', label: 'Save %', source: 'derived', group: 'goalkeeping', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'saves', den: ['saves', 'goalsConceded'], scale: 100, dp: 0, over: 'keeper' } },
    { key: 'concededPerGame', label: 'Conceded per game', short: 'conceded per game', source: 'derived', group: 'goalkeeping', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'perGame', key: 'goalsConceded', dp: 2, over: 'keeper' } },
    // team-level match stats (the comparison panel), never on a player line
    { key: 'corners', label: 'Corners', short: 'corners', one: 'corner', source: 'team' },
    { key: 'blockedShots', label: 'Blocked shots', short: 'blocked shots', one: 'blocked shot', source: 'team' },
    { key: 'possession', label: 'Possession', short: 'possession', source: 'team', format: { unit: 'percent' } },
    { key: 'passAccuracy', label: 'Pass accuracy', short: 'pass accuracy', source: 'team', format: { unit: 'percent' } },
  ],
  filters: {
    withMinutes: (l) => Number(l.stats?.minutes) > 0,
    keeper: (l) => l.stats != null && 'goalsConceded' in l.stats,
  },
  sections: [
    { id: 'attack', title: 'Attack', rows: ['goals', 'goalsPerGame', 'goalsPer90', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'assists', 'shots', 'shotsOnTarget', 'shotAccuracy', 'conversion', 'attackingContributions', 'crosses', 'dribbles', 'penaltiesWon', 'penaltiesMissed'].map((stat) => ({ stat })) },
    { id: 'passing', title: 'Passing', rows: [{ stat: 'passes' }, { stat: 'passesComplete' }] },
    { id: 'defence', title: 'Defence', rows: [{ stat: 'tackles' }, { stat: 'interceptions' }, { stat: 'blocks' }, { stat: 'defensiveContributions' }] },
    { id: 'playing', title: 'Playing time', rows: [{ stat: 'minutes' }] },
    { id: 'goalkeeping', title: 'Goalkeeping', rows: [{ stat: 'cleanSheets' }, { stat: 'saves' }, { stat: 'goalsConceded' }, { stat: 'savePct' }, { stat: 'concededPerGame' }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostGoals', label: 'Most goals (match)', hideZero: true }, { stat: 'hatTricks', hideZero: true }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'fouls' }, { stat: 'offsides' }, { stat: 'handballs' }, { stat: 'yellowCards' }, { stat: 'redCards' }, { stat: 'sinBins' }] },
  ],
  careerView: 'sections',
  // SD-23 (FB-09) — the per-player match table: Opta / FIFA match report order
  box: [{ columns: [
    { key: 'minutes', abbr: 'MIN', overallOnly: true },
    { key: 'goals', abbr: 'G', emphasis: true },
    { key: 'assists', abbr: 'A' },
    { key: 'shots', abbr: 'SH' },
    { key: 'shotsOnTarget', abbr: 'SOT' },
    { key: 'saves', abbr: 'SV' },
    { key: 'goalsConceded', abbr: 'GA', overallOnly: true },
    { key: 'fouls', abbr: 'FC', label: 'Fouls committed' },
    { key: 'yellowCards', abbr: 'YC', label: 'Yellow cards' },
    { key: 'redCards', abbr: 'RC', label: 'Red cards' },
  ] }],
  // the Stats tab's team comparison (labels as the match report reads them)
  compare: [
    'shots', 'shotsOnTarget', 'blockedShots', { key: 'possession', overallOnly: true }, 'passes', 'passAccuracy', 'fouls',
    { key: 'yellowCards', label: 'Yellow cards' }, { key: 'redCards', label: 'Red cards' }, 'offsides', 'corners', 'tackles',
    'interceptions', 'saves', 'crosses', 'dribbles', 'handballs', 'attackingContributions', 'defensiveContributions',
  ],
  leaders: ['goals', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'assists', 'cleanSheets', 'shots', 'shotsOnTarget', 'tackles', 'interceptions', 'saves', 'passes', 'attackingContributions', 'defensiveContributions'],
  headline: ['goals', 'assists', 'shotsOnTarget', 'tackles', 'saves', 'passes'],
  awards: [
    { stat: 'goals', icon: '⚽', label: 'Top scorer' },
    { stat: 'assists', icon: '🅰️', label: 'Playmaker' },
    // SD-09 / FB-11: goalkeepers only; more saves, then fewer conceded
    { stat: 'cleanSheets', icon: '🧤', label: 'Clean sheet', tournamentLabel: 'Golden Glove', tieBreak: [{ key: 'saves', better: 'higher' }, { key: 'goalsConceded', better: 'lower' }] },
  ],
  scoreUnit: 'goals',
};
