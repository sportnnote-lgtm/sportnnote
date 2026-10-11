/** SD-147 — American football's stat schema (see ../statSchema.ts). PURE.
 *  Scoring (every game, score-only mode too): points, touchdowns (rushing /
 *  receiving / return), touchdown passes, 2-point and 1-point (flag)
 *  conversions, PAT kicks, field goals, safeties. Play by play (keyed: only
 *  games scored play by play carry them): passing C/ATT/YDS/INT, rushing
 *  ATT/YDS, receiving REC/YDS, sacks, interceptions, fumbles, punting, and
 *  tackles / flag pulls when tracked. Passer rating = the NFL formula.
 *  Every line key is absolute — `statTotals` (./totals.ts) owns the whole
 *  line. A key shared with another sport keeps its labels. */
import type { Qualifier, SportStatSchema, StatDef } from '../statSchema.ts';
import { POINTS } from '../sharedStats.ts';

/** House minimums (not from the NFL / NCAA / NFHS rules): 2 games for a
 *  per-game figure, 20 pass attempts for passer rating / completion %, 10
 *  carries for yards per carry, 5 field-goal attempts for FG %. */
const q2: Qualifier = { games: 2, unit: { label: 'games', one: 'game' } };

const count = (key: string, label: string, short: string, one: string, abbr: string, group: string, extra: Partial<StatDef> = {}): StatDef =>
  ({ key, label, short, one, abbr, group, ...extra });
const pbp = (d: StatDef): StatDef => ({ ...d, coverage: 'keyed' });

/** NFL passer rating: four parts each 0–2.375, averaged, × 100 (max 158.3). */
export function passerRating(t: Record<string, number>): number | undefined {
  const att = t.passAtt ?? 0;
  if (att <= 0) return undefined;
  const clamp = (x: number) => Math.max(0, Math.min(2.375, x));
  const a = clamp(((t.passComp ?? 0) / att - 0.3) * 5);
  const b = clamp(((t.passYds ?? 0) / att - 3) * 0.25);
  const c = clamp(((t.passTD ?? 0) / att) * 20);
  const d = clamp(2.375 - ((t.passInt ?? 0) / att) * 25);
  return Math.round(((a + b + c + d) / 6) * 1000) / 10;
}

export const americanFootballStats: SportStatSchema<'american_football'> = {
  sport: 'american_football',
  splits: ['format', 'tournament', 'season', 'opponent'],
  /** flag and tackle (and NFL / college / high-school rules) are different games */
  leaderSplits: ['format'],
  stats: [
    { ...POINTS, group: 'scoring', weight: 0.5, tieBreak: [{ key: 'touchdowns', better: 'higher' }] },
    count('touchdowns', 'Touchdowns', 'touchdowns', 'touchdown', 'TD', 'scoring', { weight: 3, tieBreak: [{ key: 'points', better: 'higher' }] }),
    count('rushTD', 'Rushing touchdowns', 'rushing TDs', 'rushing TD', 'RTD', 'rushing'),
    count('recTD', 'Receiving touchdowns', 'receiving TDs', 'receiving TD', 'RCTD', 'receiving'),
    count('passTD', 'Touchdown passes', 'TD passes', 'TD pass', 'PTD', 'passing', { weight: 2 }),
    count('retTD', 'Return touchdowns', 'return TDs', 'return TD', 'XTD', 'defence'),
    count('twoPt', '2-point conversions', '2-point conversions', '2-point conversion', '2PT', 'scoring'),
    count('onePt', '1-point conversions', '1-point conversions', '1-point conversion', '1PT', 'scoring'),
    count('patMade', 'Extra points made', 'extra points', 'extra point', 'XPM', 'kicking'),
    count('patAtt', 'Extra points attempted', 'extra point attempts', 'extra point attempt', 'XPA', 'kicking'),
    { key: 'fgMade', label: 'Field goals made', short: 'FG made', abbr: 'FGM', group: 'kicking', weight: 1 },
    { key: 'fgAtt', label: 'Field goals attempted', short: 'FG att', abbr: 'FGA', group: 'kicking' },
    { key: 'fgLong', label: 'Longest field goal', short: 'longest FG', abbr: 'LNG', group: 'kicking', format: { unit: 'count' }, agg: { kind: 'max' }, coverage: 'keyed' },
    count('safeties', 'Safeties', 'safeties', 'safety', 'SFTY', 'defence', { weight: 2 }),
    { key: 'ejections', label: 'Ejections', short: 'ejections', one: 'ejection', group: 'discipline', weight: -4, suspension: { permanent: true } },
    // play by play (keyed)
    pbp(count('passComp', 'Completions', 'completions', 'completion', 'CMP', 'passing')),
    pbp(count('passAtt', 'Pass attempts', 'pass attempts', 'pass attempt', 'ATT', 'passing')),
    pbp({ key: 'passYds', label: 'Passing yards', short: 'passing yards', one: 'passing yard', abbr: 'PYDS', group: 'passing', weight: 0.04 }),
    pbp(count('passInt', 'Interceptions thrown', 'interceptions thrown', 'interception thrown', 'INT', 'passing', { weight: -2, format: { unit: 'count', better: 'lower' } })),
    pbp(count('rushAtt', 'Carries', 'carries', 'carry', 'CAR', 'rushing')),
    pbp({ key: 'rushYds', label: 'Rushing yards', short: 'rushing yards', one: 'rushing yard', abbr: 'RYDS', group: 'rushing', weight: 0.1 }),
    pbp(count('rec', 'Receptions', 'receptions', 'reception', 'REC', 'receiving', { weight: 0.5 })),
    pbp({ key: 'recYds', label: 'Receiving yards', short: 'receiving yards', one: 'receiving yard', abbr: 'RCYDS', group: 'receiving', weight: 0.1 }),
    pbp(count('sacks', 'Sacks', 'sacks', 'sack', 'SCK', 'defence', { weight: 2 })),
    pbp(count('defInt', 'Interceptions (defence)', 'interceptions made', 'interception made', 'DINT', 'defence', { weight: 3 })),
    pbp(count('fumblesLost', 'Fumbles lost', 'fumbles lost', 'fumble lost', 'FUML', 'rushing', { weight: -2, format: { unit: 'count', better: 'lower' } })),
    pbp(count('fumRec', 'Fumble recoveries', 'fumble recoveries', 'fumble recovery', 'FR', 'defence', { weight: 2 })),
    pbp(count('punts', 'Punts', 'punts', 'punt', 'PUNT', 'kicking')),
    pbp({ key: 'puntYds', label: 'Punting yards', short: 'punting yards', one: 'punting yard', abbr: 'PNYDS', group: 'kicking' }),
    { key: 'tackles', label: 'Tackles', short: 'tackles', one: 'tackle', abbr: 'TKL', group: 'defence', weight: 0.5, coverage: 'keyed' },
    // career rates and bests
    { key: 'passerRating', label: 'Passer rating', short: 'passer rating', abbr: 'RTG', source: 'derived', group: 'passing', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'formula', keys: ['passComp', 'passAtt', 'passYds', 'passTD', 'passInt'], compute: passerRating, den: 'passAtt', dp: 1, qualifier: { den: 20, unit: { label: 'pass attempts', one: 'pass attempt' } } },
      tieBreak: [{ key: 'passYds', better: 'higher' }] },
    { key: 'compPct', label: 'Completion %', abbr: 'PCT', source: 'derived', group: 'passing', format: { unit: 'percent', dp: 1 },
      agg: { kind: 'rate', num: 'passComp', den: 'passAtt', scale: 100, dp: 1, qualifier: { den: 20, unit: { label: 'pass attempts', one: 'pass attempt' } } } },
    { key: 'rushAvg', label: 'Yards per carry', short: 'yards per carry', abbr: 'AVG', source: 'derived', group: 'rushing', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'rate', num: 'rushYds', den: 'rushAtt', dp: 1, qualifier: { den: 10, unit: { label: 'carries', one: 'carry' } } } },
    { key: 'recAvg', label: 'Yards per catch', short: 'yards per catch', source: 'derived', group: 'receiving', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'rate', num: 'recYds', den: 'rec', dp: 1, qualifier: { den: 5, unit: { label: 'receptions', one: 'reception' } } } },
    { key: 'fgPct', label: 'Field goal %', source: 'derived', group: 'kicking', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'fgMade', den: 'fgAtt', scale: 100, dp: 0, qualifier: { den: 5, unit: { label: 'field-goal attempts', one: 'field-goal attempt' } } } },
    { key: 'puntAvg', label: 'Punting average', short: 'punting average', source: 'derived', group: 'kicking', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'rate', num: 'puntYds', den: 'punts', dp: 1, qualifier: { den: 5, unit: { label: 'punts', one: 'punt' } } } },
    { key: 'pointsPerGame', label: 'Points per game', short: 'points per game', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'perGame', key: 'points', dp: 1, qualifier: q2 }, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'mostTD', label: 'Most touchdowns in a game', short: 'most TDs', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'touchdowns' } },
    { key: 'mostPoints', label: 'Most points in a match', short: 'most points', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'points' } },
    // team-level match figures (the comparison panel), never on a player line
    { key: 'firstDowns', label: 'First downs', short: 'first downs', one: 'first down', source: 'team' },
    { key: 'totalYards', label: 'Total yards (net)', short: 'total yards', one: 'total yard', source: 'team' },
    { key: 'teamRushYds', label: 'Rushing yards (team)', short: 'rushing yards (team)', source: 'team' },
    { key: 'teamPassYds', label: 'Passing yards (team)', short: 'passing yards (team)', source: 'team' },
    { key: 'turnovers', label: 'Turnovers', short: 'turnovers', one: 'turnover', source: 'team' },
    { key: 'penaltyCount', label: 'Penalties', short: 'penalties', one: 'penalty', source: 'team' },
    { key: 'penaltyYds', label: 'Penalty yards', short: 'penalty yards', one: 'penalty yard', source: 'team' },
    { key: 'sacksAllowed', label: 'Sacks allowed', short: 'sacks allowed', one: 'sack allowed', source: 'team' },
    { key: 'timeoutsUsed', label: 'Timeouts used', short: 'timeouts used', one: 'timeout used', source: 'team' },
  ],
  sections: [
    { id: 'scoring', title: 'Scoring', rows: [
      { stat: 'points' }, { stat: 'pointsPerGame' }, { stat: 'touchdowns' },
      { stat: 'twoPt', hideZero: true }, { stat: 'onePt', hideZero: true }, { stat: 'safeties', hideZero: true },
    ] },
    { id: 'passing', title: 'Passing', rows: [
      { stat: 'passComp' }, { stat: 'passAtt' }, { stat: 'compPct' }, { stat: 'passYds' }, { stat: 'passTD', hideZero: true }, { stat: 'passInt' }, { stat: 'passerRating' },
    ] },
    { id: 'rushing', title: 'Rushing', rows: [{ stat: 'rushAtt' }, { stat: 'rushYds' }, { stat: 'rushAvg' }, { stat: 'rushTD', hideZero: true }, { stat: 'fumblesLost', hideZero: true }] },
    { id: 'receiving', title: 'Receiving', rows: [{ stat: 'rec' }, { stat: 'recYds' }, { stat: 'recAvg' }, { stat: 'recTD', hideZero: true }] },
    { id: 'defence', title: 'Defence', rows: [
      { stat: 'tackles' }, { stat: 'sacks' }, { stat: 'defInt' }, { stat: 'fumRec', hideZero: true }, { stat: 'retTD', hideZero: true },
    ] },
    { id: 'kicking', title: 'Kicking', rows: [
      { stat: 'fgMade', hideZero: true }, { stat: 'fgAtt', hideZero: true }, { stat: 'fgPct' }, { stat: 'fgLong', hideZero: true },
      { stat: 'patMade', hideZero: true }, { stat: 'patAtt', hideZero: true }, { stat: 'punts', hideZero: true }, { stat: 'puntAvg' },
    ] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostTD', label: 'Most TDs (game)', hideZero: true }, { stat: 'mostPoints', label: 'Most points (game)', hideZero: true }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'ejections', hideZero: true }] },
  ],
  careerView: 'sections',
  history: ['touchdowns', 'passYds', 'rushYds', 'recYds', 'points'],
  box: [
    { title: 'Passing', columns: [
      { key: 'cmpAtt', abbr: 'C/ATT', label: 'Completions / attempts', pair: ['passComp', 'passAtt'] },
      { key: 'passYds', abbr: 'PYDS' }, { key: 'passTD', abbr: 'PTD' }, { key: 'passInt', abbr: 'INT' },
    ] },
    { title: 'Rushing', columns: [{ key: 'rushAtt', abbr: 'CAR' }, { key: 'rushYds', abbr: 'RYDS' }, { key: 'rushTD', abbr: 'RTD' }] },
    { title: 'Receiving', columns: [{ key: 'rec', abbr: 'REC' }, { key: 'recYds', abbr: 'RCYDS' }, { key: 'recTD', abbr: 'RCTD' }] },
    { title: 'Defence', columns: [{ key: 'tackles', abbr: 'TKL' }, { key: 'sacks', abbr: 'SCK' }, { key: 'defInt', abbr: 'DINT' }, { key: 'retTD', abbr: 'XTD', occasional: true }] },
    { title: 'Kicking', columns: [
      { key: 'fg', abbr: 'FG', label: 'Field goals made / attempted', pair: ['fgMade', 'fgAtt'] },
      { key: 'xp', abbr: 'XP', label: 'Extra points made / attempted', pair: ['patMade', 'patAtt'] },
      { key: 'twoPt', abbr: '2PT', occasional: true }, { key: 'onePt', abbr: '1PT', occasional: true },
    ] },
    { title: 'Scoring', columns: [{ key: 'touchdowns', abbr: 'TD' }, { key: 'points', abbr: 'PTS', emphasis: true }] },
  ],
  compare: [
    'firstDowns', 'totalYards', 'teamRushYds', 'teamPassYds', 'turnovers', 'sacksAllowed', 'penaltyCount', 'penaltyYds', 'touchdowns', 'fgMade', 'timeoutsUsed',
  ],
  leaders: ['touchdowns', 'passYds', 'rushYds', 'recYds', 'passerRating', 'points', 'passTD', 'sacks', 'defInt', 'tackles', 'fgMade', 'rushAvg'],
  headline: ['touchdowns', 'passYds', 'rushYds', 'points'],
  awards: [
    { stat: 'touchdowns', icon: '🏈', label: 'Top touchdown scorer', tieBreak: [{ key: 'points', better: 'higher' }] },
    { stat: 'passYds', icon: '🎯', label: 'Top passer', tieBreak: [{ key: 'passTD', better: 'higher' }] },
    { stat: 'defInt', icon: '🛡️', label: 'Top defender (interceptions)', tieBreak: [{ key: 'sacks', better: 'higher' }] },
  ],
  scoreUnit: 'points',
};
