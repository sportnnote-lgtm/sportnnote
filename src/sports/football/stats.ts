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
    { key: 'goalsConceded', label: 'Goals conceded', short: 'conceded', group: 'goalkeeping', format: { unit: 'count', better: 'lower' } },
    // SD-29: minutes on the pitch for every player (statTotals; regulation
    // minutes — added time not counted, FIFA / Opta)
    { key: 'minutes', label: 'Minutes', short: 'mins', group: 'playing', format: { unit: 'minutes' } },
    // SD-29: optional grassroots sin-bin (format `sinBinMinutes`)
    { key: 'sinBins', label: 'Sin-bins', short: 'sin-bins', one: 'sin-bin', group: 'discipline' },
    // team-level match stat (match stats panel), never on a player line
    { key: 'corners', label: 'Corners', short: 'corners', one: 'corner', source: 'team' },
  ],
  sections: [
    { id: 'attack', title: 'Attack', rows: ['goals', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'assists', 'shots', 'shotsOnTarget', 'attackingContributions', 'crosses', 'dribbles', 'penaltiesWon', 'penaltiesMissed'].map((stat) => ({ stat })) },
    { id: 'passing', title: 'Passing', rows: [{ stat: 'passes' }, { stat: 'passesComplete' }] },
    { id: 'defence', title: 'Defence', rows: [{ stat: 'tackles' }, { stat: 'interceptions' }, { stat: 'blocks' }, { stat: 'defensiveContributions' }] },
    { id: 'playing', title: 'Playing time', rows: [{ stat: 'minutes' }] },
    { id: 'goalkeeping', title: 'Goalkeeping', rows: [{ stat: 'cleanSheets' }, { stat: 'saves' }, { stat: 'goalsConceded' }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'fouls' }, { stat: 'offsides' }, { stat: 'handballs' }, { stat: 'yellowCards' }, { stat: 'redCards' }, { stat: 'sinBins' }] },
  ],
  careerView: 'totals',
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
