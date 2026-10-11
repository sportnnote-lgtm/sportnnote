/** SD-144 — baseball / softball stat schema (see ../statSchema.ts). PURE.
 *  Built from the official scorer's figures (OBR 9.00 / WBSC scoring rules):
 *  batting PA AB R H 2B 3B HR RBI BB HBP SO SF SH GDP SB CS and the rates AVG
 *  OBP SLG OPS; pitching IP (outs) H R ER BB SO HR BF pitches, W-L-SV and ERA
 *  / WHIP; fielding PO A E from the scorer's notation (optional). Every line
 *  key is absolute — `statTotals` (./totals.ts) owns the whole line.
 *
 *  ERA reads `erN` (earned runs × the format's innings) so a 7-inning softball
 *  ERA and a 9-inning baseball ERA each come out on their own scale. */
import type { Qualifier, SportStatSchema } from '../statSchema.ts';

/** House minimums (organisers can change them, leaderMins): 10 at bats for
 *  AVG / SLG, 10 plate appearances for OBP / OPS, 3 innings for ERA / WHIP. */
const ab10: Qualifier = { den: 10, unit: { label: 'at bats', one: 'at bat' } };
const pa10: Qualifier = { den: 10, unit: { label: 'plate appearances', one: 'plate appearance' } };
const ip3: Qualifier = { den: 9, unit: { label: 'innings pitched', one: 'inning pitched', per: 3 } };

const OBP_NUM = ['hits', 'baseOnBalls', 'hitByPitch'];
const OBP_DEN = ['atBats', 'baseOnBalls', 'hitByPitch', 'sacFlies'];
/** total bases: H + 2B + 2×3B + 3×HR */
const TB = ['hits', 'twoB', 'threeB', 'threeB', 'homeRuns', 'homeRuns', 'homeRuns'];
const sum = (t: Record<string, number>, ks: string[]) => ks.reduce((a, k) => a + (t[k] ?? 0), 0);

export const baseballStats: SportStatSchema<'baseball'> = {
  sport: 'baseball',
  splits: ['format', 'tournament', 'season', 'opponent'],
  /** baseball / softball / slow pitch / youth on separate boards */
  leaderSplits: ['format'],
  stats: [
    // batting
    { key: 'plateAppearances', label: 'Plate appearances', short: 'plate appearances', one: 'plate appearance', abbr: 'PA', group: 'batting', weight: 0 },
    { key: 'atBats', label: 'At bats', short: 'at bats', one: 'at bat', abbr: 'AB', group: 'batting', weight: 0 },
    { key: 'runs', label: 'Runs', one: 'run', abbr: 'R', group: 'batting', weight: 2, coverage: 'present' },
    { key: 'hits', label: 'Hits', matchSummary: true, short: 'hits', one: 'hit', abbr: 'H', group: 'batting', weight: 3, tieBreak: [{ key: 'atBats', better: 'lower' }] },
    { key: 'twoB', label: 'Doubles (2B)', short: 'doubles', one: 'double', abbr: '2B', group: 'batting', weight: 1 },
    { key: 'threeB', label: 'Triples (3B)', short: 'triples', one: 'triple', abbr: '3B', group: 'batting', weight: 2 },
    { key: 'homeRuns', label: 'Home runs', matchSummary: true, short: 'home runs', one: 'home run', abbr: 'HR', group: 'batting', weight: 4, tieBreak: [{ key: 'rbi', better: 'higher' }] },
    { key: 'rbi', label: 'Runs batted in', matchSummary: true, short: 'RBI', abbr: 'RBI', group: 'batting', weight: 2, tieBreak: [{ key: 'homeRuns', better: 'higher' }] },
    { key: 'baseOnBalls', label: 'Walks (BB)', short: 'walks', one: 'walk', abbr: 'BB', group: 'batting', weight: 1 },
    { key: 'hitByPitch', label: 'Hit by pitch', short: 'hit by pitch', abbr: 'HBP', group: 'batting', weight: 1 },
    { key: 'strikeouts', label: 'Strikeouts (batting)', short: 'strikeouts', one: 'strikeout', abbr: 'SO', group: 'batting', format: { unit: 'count', better: 'lower' }, weight: -0.5 },
    { key: 'sacFlies', label: 'Sacrifice flies', short: 'sacrifice flies', one: 'sacrifice fly', abbr: 'SF', group: 'batting', weight: 0.5 },
    { key: 'sacBunts', label: 'Sacrifice bunts', short: 'sacrifice bunts', one: 'sacrifice bunt', abbr: 'SH', group: 'batting', weight: 0.5 },
    { key: 'gidp', label: 'Grounded into double plays', short: 'GDP', abbr: 'GDP', group: 'batting', format: { unit: 'count', better: 'lower' }, weight: -1 },
    { key: 'stolenBases', label: 'Stolen bases', matchSummary: true, short: 'stolen bases', one: 'stolen base', abbr: 'SB', group: 'running', weight: 1.5 },
    { key: 'caughtStealing', label: 'Caught stealing', short: 'caught stealing', abbr: 'CS', group: 'running', format: { unit: 'count', better: 'lower' }, weight: -1 },
    // batting rates
    { key: 'battingAvg', label: 'Batting average (AVG)', short: 'AVG', abbr: 'AVG', source: 'derived', group: 'batting', format: { unit: 'avg', dp: 3 },
      agg: { kind: 'rate', num: 'hits', den: 'atBats', dp: 3, qualifier: ab10 }, tieBreak: [{ key: 'hits', better: 'higher' }] },
    { key: 'obp', label: 'On-base percentage (OBP)', short: 'OBP', abbr: 'OBP', source: 'derived', group: 'batting', format: { unit: 'avg', dp: 3 },
      agg: { kind: 'rate', num: OBP_NUM, den: OBP_DEN, dp: 3, qualifier: pa10 } },
    { key: 'slg', label: 'Slugging (SLG)', short: 'SLG', abbr: 'SLG', source: 'derived', group: 'batting', format: { unit: 'avg', dp: 3 },
      agg: { kind: 'rate', num: TB, den: 'atBats', dp: 3, qualifier: ab10 } },
    { key: 'ops', label: 'On-base plus slugging (OPS)', short: 'OPS', abbr: 'OPS', source: 'derived', group: 'batting', format: { unit: 'avg', dp: 3 },
      agg: {
        kind: 'formula', keys: ['atBats', 'hits', 'twoB', 'threeB', 'homeRuns', 'baseOnBalls', 'hitByPitch', 'sacFlies'], den: 'atBats', qualifier: ab10, dp: 3,
        compute: (t) => {
          const od = sum(t, OBP_DEN);
          if (!(od > 0) || !(t.atBats > 0)) return undefined;
          return sum(t, OBP_NUM) / od + sum(t, TB) / t.atBats;
        },
      }, tieBreak: [{ key: 'hits', better: 'higher' }] },
    { key: 'totalBases', label: 'Total bases', short: 'total bases', one: 'total base', abbr: 'TB', source: 'derived', group: 'batting', agg: { kind: 'sum', keys: TB } },
    // pitching
    { key: 'outsPitched', label: 'Innings pitched', short: 'innings pitched', abbr: 'IP', group: 'pitching', format: { unit: 'innings' }, weight: 1 },
    { key: 'gamesPitched', label: 'Games pitched', short: 'games pitched', one: 'game pitched', abbr: 'GP', group: 'pitching', coverage: 'present' },
    { key: 'battersFaced', label: 'Batters faced', short: 'batters faced', one: 'batter faced', abbr: 'BF', group: 'pitching' },
    { key: 'pitches', label: 'Pitches', short: 'pitches', one: 'pitch', abbr: 'NP', group: 'pitching', coverage: 'present' },
    { key: 'hitsAllowed', label: 'Hits allowed', short: 'hits allowed', one: 'hit allowed', abbr: 'H', group: 'pitching', format: { unit: 'count', better: 'lower' }, weight: -0.5 },
    { key: 'runsAllowed', label: 'Runs allowed', short: 'runs allowed', one: 'run allowed', abbr: 'R', group: 'pitching', format: { unit: 'count', better: 'lower' }, coverage: 'present' },
    { key: 'earnedRuns', label: 'Earned runs', short: 'earned runs', one: 'earned run', abbr: 'ER', group: 'pitching', format: { unit: 'count', better: 'lower' }, weight: -1, coverage: 'present' },
    { key: 'erN', label: 'Earned runs × innings (ERA basis)', short: 'ERA basis', abbr: 'ERN', group: 'pitching', coverage: 'present' },
    { key: 'bbAllowed', label: 'Walks allowed', short: 'walks allowed', one: 'walk allowed', abbr: 'BB', group: 'pitching', format: { unit: 'count', better: 'lower' }, weight: -0.5 },
    { key: 'hbpAllowed', label: 'Hit batters', short: 'hit batters', one: 'hit batter', abbr: 'HB', group: 'pitching', format: { unit: 'count', better: 'lower' } },
    { key: 'kPitched', label: 'Strikeouts (pitching)', matchSummary: true, short: 'strikeouts pitched', one: 'strikeout pitched', abbr: 'SO', group: 'pitching', weight: 1.5,
      tieBreak: [{ key: 'outsPitched', better: 'lower' }] },
    { key: 'hrAllowed', label: 'Home runs allowed', short: 'home runs allowed', one: 'home run allowed', abbr: 'HR', group: 'pitching', format: { unit: 'count', better: 'lower' } },
    { key: 'pitchWins', label: 'Wins (pitching)', short: 'pitching wins', one: 'pitching win', abbr: 'W', group: 'pitching', weight: 4, coverage: 'present',
      tieBreak: [{ key: 'pitchLosses', better: 'lower' }] },
    { key: 'pitchLosses', label: 'Losses (pitching)', short: 'pitching losses', one: 'pitching loss', abbr: 'L', group: 'pitching', format: { unit: 'count', better: 'lower' }, coverage: 'present' },
    { key: 'pitchSaves', label: 'Saves (pitching)', short: 'pitching saves', one: 'pitching save', abbr: 'SV', group: 'pitching', weight: 3, coverage: 'present' },
    { key: 'era', label: 'Earned run average (ERA)', short: 'ERA', abbr: 'ERA', source: 'derived', group: 'pitching', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: 'erN', den: 'outsPitched', scale: 3, dp: 2, qualifier: ip3 }, tieBreak: [{ key: 'outsPitched', better: 'higher' }] },
    { key: 'whip', label: 'Walks + hits per inning (WHIP)', short: 'WHIP', abbr: 'WHIP', source: 'derived', group: 'pitching', format: { unit: 'decimal', dp: 2, better: 'lower' },
      agg: { kind: 'rate', num: ['bbAllowed', 'hitsAllowed'], den: 'outsPitched', scale: 3, dp: 2, qualifier: ip3 }, tieBreak: [{ key: 'outsPitched', better: 'higher' }] },
    // fielding (from the scorer's notation, when asked)
    { key: 'putouts', label: 'Putouts', short: 'putouts', one: 'putout', abbr: 'PO', group: 'fielding', coverage: 'present', weight: 0.25 },
    { key: 'fieldAssists', label: 'Assists (fielding)', short: 'fielding assists', one: 'fielding assist', abbr: 'A', group: 'fielding', coverage: 'present', weight: 0.25 },
    { key: 'fieldErrors', label: 'Errors (fielding)', short: 'fielding errors', one: 'fielding error', abbr: 'E', group: 'fielding', format: { unit: 'count', better: 'lower' }, coverage: 'present', weight: -1 },
    // bests
    { key: 'mostHits', label: 'Most hits in a game', short: 'most hits', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'hits' } },
    { key: 'mostKPitched', label: 'Most strikeouts pitched in a game', short: 'most strikeouts pitched', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'kPitched' } },
    // team-level game figures (the comparison panel), never on a player line
    { key: 'teamErrors', label: 'Errors', short: 'errors', one: 'error', source: 'team' },
    { key: 'leftOnBase', label: 'Left on base', short: 'left on base', source: 'team' },
    { key: 'teamPitches', label: 'Pitches thrown', short: 'pitches thrown', one: 'pitch thrown', source: 'team' },
  ],
  sections: [
    { id: 'batting', title: 'Batting', rows: [
      { stat: 'plateAppearances' }, { stat: 'atBats' }, { stat: 'runs' }, { stat: 'hits' }, { stat: 'twoB', hideZero: true }, { stat: 'threeB', hideZero: true },
      { stat: 'homeRuns' }, { stat: 'rbi' }, { stat: 'baseOnBalls' }, { stat: 'hitByPitch', hideZero: true }, { stat: 'strikeouts' },
      { stat: 'sacFlies', hideZero: true }, { stat: 'sacBunts', hideZero: true }, { stat: 'gidp', hideZero: true },
      { stat: 'battingAvg', label: 'AVG' }, { stat: 'obp', label: 'OBP' }, { stat: 'slg', label: 'SLG' }, { stat: 'ops', label: 'OPS' }, { stat: 'totalBases' },
    ] },
    { id: 'running', title: 'Base running', rows: [{ stat: 'stolenBases' }, { stat: 'caughtStealing', hideZero: true }] },
    { id: 'pitching', title: 'Pitching', leadWhen: 'pitched', rows: [
      { stat: 'gamesPitched' }, { stat: 'pitchWins', label: 'W' }, { stat: 'pitchLosses', label: 'L' }, { stat: 'pitchSaves', label: 'SV', hideZero: true },
      { stat: 'outsPitched', label: 'IP' }, { stat: 'era', label: 'ERA' }, { stat: 'whip', label: 'WHIP' }, { stat: 'hitsAllowed' }, { stat: 'runsAllowed' }, { stat: 'earnedRuns' },
      { stat: 'bbAllowed' }, { stat: 'kPitched' }, { stat: 'hrAllowed' }, { stat: 'hbpAllowed', hideZero: true }, { stat: 'battersFaced' }, { stat: 'pitches' },
    ] },
    { id: 'fielding', title: 'Fielding', rows: [{ stat: 'putouts', hideZero: true }, { stat: 'fieldAssists', hideZero: true }, { stat: 'fieldErrors', hideZero: true }] },
    { id: 'bests', title: 'Bests', rows: [{ stat: 'mostHits', label: 'Most hits (game)', hideZero: true }, { stat: 'mostKPitched', label: 'Most strikeouts (game, pitching)', hideZero: true }] },
  ],
  filters: { pitched: (l) => Number(l.stats?.gamesPitched ?? 0) > 0 || Number(l.stats?.outsPitched ?? 0) > 0 },
  careerView: 'sections',
  history: ['hits', 'homeRuns', 'rbi', 'kPitched'],
  box: [
    { title: 'Batting', columns: [
      { key: 'atBats', abbr: 'AB' },
      { key: 'runs', abbr: 'R' },
      { key: 'hits', abbr: 'H', emphasis: true },
      { key: 'rbi', abbr: 'RBI' },
      { key: 'baseOnBalls', abbr: 'BB' },
      { key: 'strikeouts', abbr: 'SO' },
      { key: 'twoB', abbr: '2B', occasional: true },
      { key: 'threeB', abbr: '3B', occasional: true },
      { key: 'homeRuns', abbr: 'HR', occasional: true },
      { key: 'stolenBases', abbr: 'SB', occasional: true },
      { key: 'battingAvg', abbr: 'AVG' },
    ] },
  ],
  compare: [
    'hits', 'homeRuns', 'baseOnBalls', 'strikeouts', 'stolenBases', { key: 'teamErrors', label: 'Errors' }, { key: 'leftOnBase', label: 'Left on base' },
    'battingAvg', { key: 'teamPitches', label: 'Pitches thrown' },
  ],
  leaders: ['battingAvg', 'homeRuns', 'rbi', 'hits', 'ops', 'stolenBases', 'era', 'kPitched', 'whip', 'pitchWins', 'pitchSaves'],
  headline: ['hits', 'homeRuns', 'rbi', 'kPitched'],
  awards: [
    { stat: 'battingAvg', icon: '🏏', label: 'Batting champion', match: false,
      howRanked: 'Best batting average (hits ÷ at bats) among batters with at least {min}. Ties: more hits. You choose the winner.' },
    { stat: 'homeRuns', icon: '💥', label: 'Home run leader', tieBreak: [{ key: 'rbi', better: 'higher' }] },
    { stat: 'rbi', icon: '🏃', label: 'RBI leader', tieBreak: [{ key: 'homeRuns', better: 'higher' }] },
    { stat: 'era', icon: '⚾', label: 'Best ERA', match: false,
      howRanked: 'Lowest earned run average (earned runs × the innings of a game ÷ innings pitched) among pitchers with at least {min}. Ties: more innings. You choose the winner.' },
    { stat: 'kPitched', icon: '🔥', label: 'Strikeout leader', tieBreak: [{ key: 'outsPitched', better: 'lower' }] },
  ],
  scoreUnit: 'runs',
};

/** The pitching box (a second table under the batting one). */
export const baseballPitchingStats: SportStatSchema<'baseball'> = {
  ...baseballStats,
  box: [{ title: 'Pitching', columns: [
    { key: 'outsPitched', abbr: 'IP', emphasis: true },
    { key: 'hitsAllowed', abbr: 'H' },
    { key: 'runsAllowed', abbr: 'R' },
    { key: 'earnedRuns', abbr: 'ER' },
    { key: 'bbAllowed', abbr: 'BB' },
    { key: 'kPitched', abbr: 'SO' },
    { key: 'hrAllowed', abbr: 'HR', occasional: true },
    { key: 'pitches', abbr: 'NP' },
    { key: 'era', abbr: 'ERA' },
  ] }],
  compare: [],
};
