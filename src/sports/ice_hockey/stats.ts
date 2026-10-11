/** SD-145 — ice hockey's stat schema (see ../statSchema.ts). PURE.
 *  Skaters: goals, assists, points (G + A), +/- (when tracked), penalty
 *  minutes, shots on goal, power-play / short-handed / empty-net and
 *  game-winning goals. Goalies: saves, shots against, goals against, save %,
 *  goals-against average (per 60 minutes), shutouts, minutes in net. Every
 *  line key is absolute — `statTotals` (./totals.ts) owns the whole line.
 *  A key shared with another sport keeps its labels. */
import type { Qualifier, SportStatSchema, StatDef } from '../statSchema.ts';
import { ASSISTS, POINTS, SAVES } from '../sharedStats.ts';

/** House minimums (not from the IIHF / NHL rules): 2 games for a per-game
 *  figure, 30 shots faced for save %, 120 minutes in net for GAA (IIHF
 *  tournament goalie rankings use 40 % of the team's time — set your own). */
const q2: Qualifier = { games: 2, unit: { label: 'games', one: 'game' } };

const count = (key: string, label: string, short: string, one: string, abbr: string, group: string, extra: Partial<StatDef> = {}): StatDef =>
  ({ key, label, short, one, abbr, group, ...extra });

export const iceHockeyStats: SportStatSchema<'ice_hockey'> = {
  sport: 'ice_hockey',
  splits: ['format', 'tournament', 'season', 'opponent'],
  /** tournament / hub leaderboard + awards chips (IIHF / NHL / NFHS / youth) */
  leaderSplits: ['format'],
  stats: [
    // Points leader: points, then goals (IIHF / NHL scoring leaders)
    { ...POINTS, group: 'scoring', weight: 0, tieBreak: [{ key: 'goals', better: 'higher' }, { key: 'gwg', better: 'higher' }] },
    { key: 'goals', label: 'Goals', short: 'goals', one: 'goal', group: 'scoring', weight: 4, matchSummary: true, abbr: 'G',
      tieBreak: [{ key: 'points', better: 'higher' }, { key: 'shotsOnGoal', better: 'lower' }] },
    { ...ASSISTS, abbr: 'A', group: 'scoring', weight: 3, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'plusMinus', label: 'Plus / minus', short: '+/-', abbr: '+/-', group: 'scoring', format: { unit: 'count' }, coverage: 'present', weight: 0.5 },
    { key: 'shotsOnGoal', label: 'Shots on goal', short: 'shots on goal', one: 'shot on goal', compact: 'on goal', group: 'scoring', weight: 0.5, abbr: 'SOG' },
    count('ppGoals', 'Power-play goals', 'power-play goals', 'power-play goal', 'PPG', 'scoring'),
    count('shGoals', 'Short-handed goals', 'short-handed goals', 'short-handed goal', 'SHG', 'scoring', { weight: 1 }),
    count('enGoals', 'Empty-net goals', 'empty-net goals', 'empty-net goal', 'ENG', 'scoring'),
    count('gwg', 'Game-winning goals', 'game-winning goals', 'game-winning goal', 'GWG', 'scoring', { coverage: 'present' }),
    { key: 'penaltyMinutes', label: 'Penalty minutes', short: 'penalty minutes', compact: 'PIM', abbr: 'PIM', group: 'discipline', format: { unit: 'minutes', better: 'lower' }, weight: -0.5 },
    count('minors', 'Minor penalties', 'minor penalties', 'minor penalty', 'MIN2', 'discipline'),
    count('majors', 'Major penalties', 'major penalties', 'major penalty', 'MAJ', 'discipline', { weight: -2 }),
    count('misconducts', 'Misconducts', 'misconducts', 'misconduct', 'MIS', 'discipline'),
    count('gameMisconducts', 'Game misconducts', 'game misconducts', 'game misconduct', 'GM', 'discipline', { weight: -4, suspension: { permanent: true } }),
    count('matchPenalties', 'Match penalties', 'match penalties', 'match penalty', 'MP', 'discipline', { weight: -6, suspension: { permanent: true } }),
    // goalies (statTotals-only except saves)
    { ...SAVES, group: 'goalkeeping', weight: 0.3, abbr: 'SV' },
    { key: 'shotsAgainst', label: 'Shots against', short: 'shots against', one: 'shot against', group: 'goalkeeping', coverage: 'present', abbr: 'SA' },
    { key: 'goalsAgainst', label: 'Goals against', short: 'goals against', one: 'goal against', group: 'goalkeeping', format: { unit: 'count', better: 'lower' }, coverage: 'present', abbr: 'GA' },
    { key: 'shutouts', label: 'Shutouts', short: 'shutouts', one: 'shutout', group: 'goalkeeping', weight: 6, coverage: 'present', eligible: 'goalkeeper', abbr: 'SO' },
    { key: 'gkMinutes', label: 'Minutes in net', short: 'mins in net', group: 'goalkeeping', format: { unit: 'minutes' }, coverage: 'present', abbr: 'MIN' },
    { key: 'gkGames', label: 'Games in net', short: 'games in net', one: 'game in net', group: 'goalkeeping', coverage: 'present', abbr: 'GP' },
    // shoot-out (never counted as goals)
    { key: 'soGoals', label: 'Shoot-out goals', short: 'shoot-out goals', one: 'shoot-out goal', group: 'shootout' },
    { key: 'soTaken', label: 'Shoot-out attempts', short: 'shoot-out attempts', one: 'shoot-out attempt', group: 'shootout' },
    // career rates and bests
    { key: 'pointsPerGame', label: 'Points per game', short: 'points per game', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'perGame', key: 'points', dp: 2, qualifier: q2 }, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'goalsPerGame', label: 'Goals per game', short: 'goals per game', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 2 },
      agg: { kind: 'perGame', key: 'goals', dp: 2, qualifier: q2 }, tieBreak: [{ key: 'goals', better: 'higher' }] },
    { key: 'shotPct', label: 'Shooting %', source: 'derived', group: 'scoring', format: { unit: 'percent', dp: 0 }, abbr: '%',
      agg: { kind: 'rate', num: 'goals', den: 'shotsOnGoal', scale: 100, dp: 0, qualifier: { den: 20, unit: { label: 'shots on goal', one: 'shot on goal' } } },
      tieBreak: [{ key: 'goals', better: 'higher' }] },
    { key: 'mostGoals', label: 'Most goals in a match', short: 'most goals', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'goals' } },
    { key: 'mostSaves', label: 'Most saves in a match', short: 'most saves', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'saves' } },
    { key: 'hatTricks', label: 'Hat-tricks', short: 'hat-tricks', one: 'hat-trick', source: 'derived', group: 'bests', agg: { kind: 'countIf', key: 'goals', gte: 3 } },
    { key: 'soConversion', label: 'Shoot-out %', source: 'derived', group: 'shootout', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'soGoals', den: 'soTaken', scale: 100, dp: 0 } },
    // goalies — save % = saves ÷ shots against; GAA = goals against × 60 ÷ minutes in net
    { key: 'savePct', label: 'Save %', source: 'derived', group: 'goalkeeping', format: { unit: 'percent', dp: 1 }, abbr: 'SV%',
      agg: { kind: 'rate', num: 'saves', den: 'shotsAgainst', scale: 100, dp: 1, over: 'keeper', qualifier: { den: 30, unit: { label: 'shots faced', one: 'shot faced' } } },
      eligible: 'goalkeeper', tieBreak: [{ key: 'saves', better: 'higher' }] },
    { key: 'gaa', label: 'Goals-against average', short: 'GAA', source: 'derived', group: 'goalkeeping', format: { unit: 'decimal', dp: 2, better: 'lower' }, abbr: 'GAA',
      agg: { kind: 'rate', num: 'goalsAgainst', den: 'gkMinutes', scale: 60, dp: 2, over: 'keeper', qualifier: { den: 120, unit: { label: 'minutes in net', one: 'minute in net' } } },
      eligible: 'goalkeeper', tieBreak: [{ key: 'savePct', better: 'higher' }] },
    // team-level match figures (the comparison panel), never on a player line
    { key: 'ppChances', label: 'Power plays', short: 'power plays', one: 'power play', source: 'team' },
    { key: 'timeouts', label: 'Team time-outs', short: 'team time-outs', one: 'team time-out', source: 'team' },
  ],
  filters: {
    keeper: (l) => l.stats != null && 'shotsAgainst' in l.stats,
  },
  sections: [
    { id: 'scoring', title: 'Scoring', rows: [
      { stat: 'points' }, { stat: 'goals' }, { stat: 'assists' }, { stat: 'pointsPerGame' }, { stat: 'plusMinus' },
      { stat: 'shotsOnGoal' }, { stat: 'shotPct' }, { stat: 'ppGoals', hideZero: true }, { stat: 'shGoals', hideZero: true },
      { stat: 'enGoals', hideZero: true }, { stat: 'gwg', hideZero: true },
    ] },
    { id: 'goalkeeping', title: 'Goaltending', leadWhen: 'keeper', rows: [
      { stat: 'gkGames' }, { stat: 'gkMinutes' }, { stat: 'shotsAgainst' }, { stat: 'saves' }, { stat: 'goalsAgainst' },
      { stat: 'savePct' }, { stat: 'gaa' }, { stat: 'shutouts' },
    ] },
    { id: 'discipline', title: 'Penalties', rows: [
      { stat: 'penaltyMinutes' }, { stat: 'minors', hideZero: true }, { stat: 'majors', hideZero: true }, { stat: 'misconducts', hideZero: true },
      { stat: 'gameMisconducts', hideZero: true }, { stat: 'matchPenalties', hideZero: true },
    ] },
    { id: 'shootout', title: 'Shoot-outs', rows: [{ stat: 'soGoals', hideZero: true }, { stat: 'soTaken', hideZero: true }, { stat: 'soConversion' }] },
    { id: 'bests', title: 'Bests', rows: [
      { stat: 'mostGoals', label: 'Most goals (match)', hideZero: true }, { stat: 'hatTricks', hideZero: true }, { stat: 'mostSaves', label: 'Most saves (match)', hideZero: true },
    ] },
  ],
  careerView: 'sections',
  history: ['goals', 'assists', 'points', 'saves'],
  // the hockey box score: skaters G A PTS +/- PIM SOG; goalies SA SV SV% GA MIN
  box: [{ columns: [
    { key: 'goals', abbr: 'G', emphasis: true },
    { key: 'assists', abbr: 'A' },
    { key: 'points', abbr: 'PTS' },
    { key: 'plusMinus', abbr: '+/-', signed: true, total: false, overallOnly: true },
    { key: 'penaltyMinutes', abbr: 'PIM' },
    { key: 'shotsOnGoal', abbr: 'SOG' },
    { key: 'shotsAgainst', abbr: 'SA', overallOnly: true },
    { key: 'saves', abbr: 'SV' },
    { key: 'savePct', abbr: 'SV%', total: false, overallOnly: true },
    { key: 'goalsAgainst', abbr: 'GA', overallOnly: true },
    { key: 'gkMinutes', abbr: 'MIN', overallOnly: true },
  ] }],
  compare: [
    'shotsOnGoal', 'ppGoals', 'ppChances', 'shGoals', 'saves',
    { key: 'penaltyMinutes', label: 'Penalty minutes' }, 'timeouts',
  ],
  leaders: ['points', 'goals', 'assists', 'plusMinus', 'pointsPerGame', 'ppGoals', 'shotsOnGoal', 'savePct', 'gaa', 'shutouts', 'penaltyMinutes'],
  headline: ['points', 'goals', 'assists', 'saves'],
  awards: [
    { stat: 'points', icon: '🏒', label: 'Top scorer', tieBreak: [{ key: 'goals', better: 'higher' }] },
    { stat: 'savePct', icon: '🥅', label: 'Best goaltender', tieBreak: [{ key: 'saves', better: 'higher' }],
      howRanked: 'Goalies only (anyone who played in net in these games). Best save % (saves ÷ shots against, at least 30 faced), then most saves. Shoot-outs don\'t count. You choose the winner.' },
  ],
  scoreUnit: 'goals',
};
