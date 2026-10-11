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
    // SD-27 (FB-11): the Golden Boot chain — goals, then assists, then fewer minutes
    { key: 'goals', label: 'Goals', short: 'goals', one: 'goal', group: 'attack', weight: 10, matchSummary: true,
      tieBreak: [{ key: 'assists', better: 'higher' }, { key: 'minutes', better: 'lower' }] },
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
    // SD-30: written only by statTotals (never a live tap): goals struck with
    // the head (when the scorer picked Header), and FB-13 own goals — credited
    // to the player who put it in his own net, never as a goal
    { key: 'headedGoals', label: 'Headed goals', short: 'headers', one: 'header', group: 'attack', coverage: 'present' },
    { key: 'ownGoals', label: 'Own goals', short: 'own goals', one: 'own goal', group: 'discipline', coverage: 'present' },
    { key: 'passes', label: 'Passes', short: 'passes', one: 'pass', group: 'passing', ...opt('passes') },
    // SD-80 (FB-14): penalty shootouts, apart from match goals / saves — keyed:
    // only a kick's taker / keeper carries them (written by statTotals)
    { key: 'penKicksTaken', label: 'Shootout kicks taken', short: 'shootout kicks', one: 'shootout kick', compact: 'SO kicks', group: 'attack', coverage: 'keyed' },
    { key: 'penKicksScored', label: 'Shootout kicks scored', short: 'shootout goals', one: 'shootout goal', compact: 'SO scored', group: 'attack', coverage: 'keyed' },
    { key: 'shootoutSaves', label: 'Shootout saves', short: 'shootout saves', one: 'shootout save', compact: 'SO saves', group: 'goalkeeping', coverage: 'keyed' },
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
      agg: { kind: 'rate', num: 'goals', den: 'minutes', scale: 90, dp: 2, over: 'withMinutes', qualifier: { den: 180, unit: { label: 'minutes', one: 'minute' } } },
      tieBreak: [{ key: 'goals', better: 'higher' }] },
    // SD-39 (FB-08) — G+A, minutes per goal (lower is better; the games with
    // minutes only), Playing time (starts / off the bench where a line-up was
    // set — SD-11 `starts` — and minutes per game), keepers' games in goal and
    // goals conceded per 90 (keeper lines with minutes)
    { key: 'goalsAssists', label: 'Goals + assists', short: 'G+A', abbr: 'G+A', source: 'derived', group: 'attack', agg: { kind: 'sum', keys: ['goals', 'assists'] } },
    { key: 'minutesPerGoal', label: 'Minutes per goal', short: 'mins per goal', source: 'derived', group: 'attack', format: { unit: 'decimal', dp: 0, better: 'lower' },
      agg: { kind: 'rate', num: 'minutes', den: 'goals', dp: 0, over: 'withMinutes' } },
    // the SD-11 appearance key (as SHARED_STATS) — read by `started` / `subApps`
    { key: 'starts', label: 'Starts', short: 'starts', one: 'start', agg: { kind: 'appearance' } },
    { key: 'started', label: 'Starts', short: 'starts', one: 'start', source: 'derived', group: 'playing', agg: { kind: 'sum', key: 'starts', over: 'lineupKnown' }, coverOf: 'appeared' },
    { key: 'subApps', label: 'Off the bench', short: 'sub apps', one: 'sub app', source: 'derived', group: 'playing', agg: { kind: 'countIf', key: 'starts', lt: 1, over: 'lineupKnown' }, coverOf: 'appeared' },
    { key: 'minutesPerGame', label: 'Minutes per game', short: 'mins per game', source: 'derived', group: 'playing', format: { unit: 'decimal', dp: 0 }, agg: { kind: 'perGame', key: 'minutes', dp: 0, over: 'withMinutes' } },
    { key: 'keeperApps', label: 'Games in goal', short: 'games in goal', one: 'game in goal', source: 'derived', group: 'goalkeeping', agg: { kind: 'countIf', key: 'goalsConceded', gte: 0, over: 'keeper' } },
    { key: 'concededPer90', label: 'Conceded per 90', short: 'conceded per 90', source: 'derived', group: 'goalkeeping', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: 'goalsConceded', den: 'minutes', scale: 90, dp: 2, over: 'keeperMinutes' } },
    { key: 'shotAccuracy', label: 'Shots on target %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'shotsOnTarget', den: 'shots', scale: 100, dp: 0 } },
    { key: 'conversion', label: 'Shot conversion %', source: 'derived', group: 'attack', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'goals', den: 'shots', scale: 100, dp: 0 } },
    { key: 'mostGoals', label: 'Most goals in a match', short: 'most goals', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'goals' } },
    { key: 'hatTricks', label: 'Hat-tricks', short: 'hat-tricks', one: 'hat-trick', source: 'derived', group: 'bests', agg: { kind: 'countIf', key: 'goals', gte: 3 } },
    // keepers (SD-09: a keeper line carries goalsConceded) — save % = saves ÷ shots on target faced
    { key: 'savePct', label: 'Save %', source: 'derived', group: 'goalkeeping', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'saves', den: ['saves', 'goalsConceded'], scale: 100, dp: 0, over: 'keeper', qualifier: { den: 10, unit: { label: 'shots faced', one: 'shot faced' } } },
      eligible: 'goalkeeper', tieBreak: [{ key: 'saves', better: 'higher' }] },
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
    // SD-39
    keeperMinutes: (l) => l.stats != null && 'goalsConceded' in l.stats && Number(l.stats.minutes) > 0,
    lineupKnown: (l) => typeof l.stats?.starts === 'number',
    appeared: () => true,
  },
  sections: [
    { id: 'attack', title: 'Attack', rows: ['goals', 'goalsPerGame', 'goalsPer90', 'minutesPerGoal', 'goalsAssists', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'headedGoals', 'assists', 'shots', 'shotsOnTarget', 'shotAccuracy', 'conversion', 'attackingContributions', 'crosses', 'dribbles', 'penaltiesWon', 'penaltiesMissed', 'penKicksTaken', 'penKicksScored']
      .map((stat) => (stat === 'headedGoals' || stat.startsWith('penKicks') ? { stat, hideZero: true } : { stat })) },
    { id: 'passing', title: 'Passing', rows: [{ stat: 'passes' }, { stat: 'passesComplete' }] },
    { id: 'defence', title: 'Defence', rows: [{ stat: 'tackles' }, { stat: 'interceptions' }, { stat: 'blocks' }, { stat: 'defensiveContributions' }] },
    { id: 'playing', title: 'Playing time', rows: [{ stat: 'started' }, { stat: 'subApps', hideZero: true }, { stat: 'minutes' }, { stat: 'minutesPerGame' }] },
    // SD-39 — leads the career when most of the player's games were in goal
    { id: 'goalkeeping', title: 'Goalkeeping', leadWhen: 'keeper', rows: [{ stat: 'keeperApps' }, { stat: 'cleanSheets' }, { stat: 'saves' }, { stat: 'goalsConceded' }, { stat: 'savePct' }, { stat: 'concededPerGame' }, { stat: 'concededPer90' }, { stat: 'shootoutSaves', hideZero: true }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostGoals', label: 'Most goals (match)', hideZero: true }, { stat: 'hatTricks', hideZero: true }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'fouls' }, { stat: 'offsides' }, { stat: 'handballs' }, { stat: 'yellowCards' }, { stat: 'redCards' }, { stat: 'sinBins' }, { stat: 'ownGoals', hideZero: true }] },
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
    // SD-80: only when the match had one (an own goal) / a shootout with takers
    { key: 'ownGoals', abbr: 'OG', label: 'Own goals', occasional: true },
    { key: 'penKicks', abbr: 'SO', label: 'Shootout kicks scored-taken', pair: ['penKicksScored', 'penKicksTaken'], overallOnly: true, occasional: true },
    { key: 'shootoutSaves', abbr: 'SOS', label: 'Shootout saves', overallOnly: true, occasional: true },
  ] }],
  // the Stats tab's team comparison (labels as the match report reads them)
  compare: [
    'shots', 'shotsOnTarget', 'blockedShots', { key: 'possession', overallOnly: true }, 'passes', 'passAccuracy', 'fouls',
    { key: 'yellowCards', label: 'Yellow cards' }, { key: 'redCards', label: 'Red cards' }, 'offsides', 'corners', 'tackles',
    'interceptions', 'saves', 'crosses', 'dribbles', 'handballs', 'attackingContributions', 'defensiveContributions',
  ],
  // SD-27: goals per 90 (min minutes) and keepers' save % (min shots faced)
  // follow the original categories
  leaders: ['goals', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'assists', 'cleanSheets', 'shots', 'shotsOnTarget', 'tackles', 'interceptions', 'saves', 'passes', 'attackingContributions', 'defensiveContributions', 'goalsPer90', 'savePct'],
  headline: ['goals', 'assists', 'shotsOnTarget', 'tackles', 'saves', 'passes'],
  awards: [
    { stat: 'goals', icon: '⚽', label: 'Top scorer' },
    { stat: 'assists', icon: '🅰️', label: 'Playmaker' },
    // SD-09 / FB-11: goalkeepers only; more saves, then fewer conceded
    { stat: 'cleanSheets', icon: '🧤', label: 'Clean sheet', tournamentLabel: 'Golden Glove', tieBreak: [{ key: 'saves', better: 'higher' }, { key: 'goalsConceded', better: 'lower' }],
      howRanked: 'Goalkeepers only (anyone who kept goal in these matches, or is listed as a GK). Most clean sheets, then most saves, then fewest goals conceded. A clean sheet goes to the keeper on the pitch longest when their team let in no goal (penalty shootouts don\'t count). You choose the winner.' },
  ],
  scoreUnit: 'goals',
};
