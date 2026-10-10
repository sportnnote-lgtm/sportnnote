/** SD-15 — basketball's stat schema (see ../statSchema.ts). PURE. */
import type { Qualifier, SportStatSchema } from '../statSchema.ts';

/** SD-27 (BK-07) — FIBA ranks tournament leaders by per-game average, among
 *  players who played enough of their team's games. A school event is 3–5
 *  games, so the default minimum is 2 games; organisers can change it. */
export const BASKETBALL_MIN_GAMES: Qualifier = { games: 2, unit: { label: 'games', one: 'game' } };
const q = BASKETBALL_MIN_GAMES;
/** FIBA efficiency: PTS + REB + AST + STL + BLK − TO − missed FT − missed FG.
 *  SD-40: missed field goals (`fgMissed`) are on the line only for games that
 *  tracked missed shots (D8) — elsewhere they are 0, never guessed. */
const EFF_KEYS = ['points', 'rebounds', 'assists', 'steals', 'blocks', '-turnovers', 'freeThrowsMade', '-freeThrowsAtt', '-fgMissed'];
import { ASSISTS, BLOCKS, FOULS, HIGH_POINTS, POINTS } from '../sharedStats.ts';
import { hasKey } from '../statSchema.ts';

/** SD-31 (D8): FGA / 3PA / FG% count only games that tracked missed shots —
 *  those lines carry `fgAtt` (statTotals writes it, 0 included, for every
 *  player of such a game). Older and untracked games are left out of the
 *  rates instead of reading as a false 100%. */
const SHOTS = { coverage: 'optional' as const, mode: 'trackMisses' };

export const basketballStats: SportStatSchema<'basketball'> = {
  sport: 'basketball',
  /** SD-25 — career split chips (line context) */
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    // SD-27 (BK-07): the match rating / MVP weights are FIBA efficiency (EFF)
    { ...POINTS, group: 'scoring', weight: 1 },
    { key: 'rebounds', label: 'Rebounds', short: 'reb', abbr: 'REB', group: 'defence', weight: 1, matchSummary: true },
    { ...ASSISTS, group: 'scoring', weight: 1 },
    { ...FOULS, group: 'discipline' },
    { key: 'steals', label: 'Steals', short: 'steals', one: 'steal', abbr: 'STL', group: 'defence', weight: 1 },
    { ...BLOCKS, group: 'defence', weight: 1 },
    { key: 'turnovers', label: 'Turnovers', short: 'turnovers', one: 'turnover', abbr: 'TO', group: 'discipline', format: { unit: 'count', better: 'lower' }, weight: -1 },
    { key: 'freeThrowsMade', label: 'Free throws made', short: 'FT made', abbr: 'FTM', group: 'scoring', weight: 1 },
    { key: 'freeThrowsAtt', label: 'Free throws attempted', short: 'FT att', abbr: 'FTA', group: 'scoring', weight: -1 },
    // SD-31 / SD-40 (BK-03, BK-05): field goals, threes, misses, OREB / DREB
    { key: 'fgMissed', label: 'Missed field goals', short: 'missed FG', abbr: 'FGX', group: 'scoring', format: { unit: 'count', better: 'lower' }, weight: -1 },
    { key: 'fgMade', label: 'Field goals made', short: 'FG made', abbr: 'FGM', group: 'scoring' },
    { key: 'fgAtt', label: 'Field goals attempted', short: 'FG att', abbr: 'FGA', group: 'scoring', ...SHOTS },
    { key: 'threesMade', label: '3-pointers made', short: '3s', one: '3', abbr: '3PM', group: 'scoring' },
    { key: 'threesAtt', label: '3-pointers attempted', short: '3P att', abbr: '3PA', group: 'scoring', ...SHOTS },
    { key: 'oreb', label: 'Offensive rebounds', short: 'off. reb', abbr: 'OREB', group: 'defence' },
    { key: 'dreb', label: 'Defensive rebounds', short: 'def. reb', abbr: 'DREB', group: 'defence' },
    { key: 'ejections', label: 'Ejections', short: 'ejections', one: 'ejection', group: 'discipline' },
    // SD-29 (BK-10): from the starting five + subs (only when the five was set)
    { key: 'minutes', label: 'Minutes', short: 'mins', abbr: 'MIN', group: 'scoring', format: { unit: 'minutes' } },
    { key: 'plusMinus', label: 'Plus / minus', short: '+/-', abbr: '+/-', group: 'scoring', format: { unit: 'count' } },
    // SD-16 — per-game averages and double-doubles (data only: the career /
    // leaders that show them are SD-44 / SD-27; FIBA's minimum to rank is SD-27)
    { key: 'ppg', label: 'Points per game', abbr: 'PPG', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'points', dp: 1, qualifier: q }, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'rpg', label: 'Rebounds per game', abbr: 'RPG', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'rebounds', dp: 1, qualifier: q }, tieBreak: [{ key: 'rebounds', better: 'higher' }] },
    { key: 'apg', label: 'Assists per game', abbr: 'APG', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'assists', dp: 1, qualifier: q }, tieBreak: [{ key: 'assists', better: 'higher' }] },
    // SD-23 — the team comparison's FT% (a rate recomputed over the side)
    { key: 'freeThrowPct', label: 'Free throw %', abbr: 'FT%', source: 'derived', group: 'scoring', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'freeThrowsMade', den: 'freeThrowsAtt', scale: 100, dp: 0 } },
    // SD-40 / SD-44 — shooting over the games that tracked missed shots only
    { key: 'fgPct', label: 'Field goal %', abbr: 'FG%', source: 'derived', group: 'scoring', format: { unit: 'percent', dp: 0 }, ...SHOTS,
      agg: { kind: 'rate', num: 'fgMade', den: 'fgAtt', scale: 100, dp: 0, over: 'shotsTracked' } },
    { key: 'threePct', label: '3-point %', abbr: '3P%', source: 'derived', group: 'scoring', format: { unit: 'percent', dp: 0 }, ...SHOTS,
      agg: { kind: 'rate', num: 'threesMade', den: 'threesAtt', scale: 100, dp: 0, over: 'shotsTracked' } },
    { key: 'fgMA', label: 'Field goals (made-attempted)', abbr: 'FGM-A', source: 'derived', group: 'scoring', ...SHOTS,
      agg: { kind: 'pair', a: 'fgMade', b: 'fgAtt', over: 'shotsTracked' } },
    { key: 'threesMA', label: '3-pointers (made-attempted)', abbr: '3PM-A', source: 'derived', group: 'scoring', ...SHOTS,
      agg: { kind: 'pair', a: 'threesMade', b: 'threesAtt', over: 'shotsTracked' } },
    // SD-24 (BK-06) — the rest of the per-game line, career highs, triple-doubles
    { key: 'spg', label: 'Steals per game', abbr: 'SPG', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'steals', dp: 1, qualifier: q }, tieBreak: [{ key: 'steals', better: 'higher' }] },
    { key: 'bpg', label: 'Blocks per game', abbr: 'BPG', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'blocks', dp: 1, qualifier: q }, tieBreak: [{ key: 'blocks', better: 'higher' }] },
    // SD-27 — efficiency (total and per game: the Player of the Tournament)
    { key: 'eff', label: 'Efficiency', abbr: 'EFF', source: 'derived', group: 'scoring', format: { unit: 'count' }, agg: { kind: 'sum', keys: EFF_KEYS } },
    { key: 'effPg', label: 'Efficiency per game', leaderLabel: 'Efficiency per game', abbr: 'EFF/G', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 },
      agg: { kind: 'perGame', key: EFF_KEYS, dp: 1, qualifier: q }, tieBreak: [{ key: 'eff', better: 'higher' }] },
    { key: 'topg', label: 'Turnovers per game', abbr: 'TOPG', source: 'derived', group: 'discipline', format: { unit: 'decimal', dp: 1, better: 'lower' }, agg: { kind: 'perGame', key: 'turnovers', dp: 1 } },
    { key: 'mpg', label: 'Minutes per game', abbr: 'MPG', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'minutes', dp: 1, over: 'withMinutes' } },
    { ...HIGH_POINTS },
    { key: 'highRebounds', label: 'Most rebounds in a match', short: 'most rebounds', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'rebounds' } },
    { key: 'highAssists', label: 'Most assists in a match', short: 'most assists', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'assists' } },
    // SD-44 — shooting career highs
    { key: 'highFgMade', label: 'Most field goals in a match', short: 'most field goals', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'fgMade' } },
    { key: 'highThrees', label: 'Most 3-pointers in a match', short: 'most 3s', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'threesMade' } },
    { key: 'tripleDoubles', label: 'Triple-doubles', short: 'triple-doubles', one: 'triple-double', abbr: 'TD', source: 'derived', group: 'scoring',
      agg: { kind: 'countIf', keys: ['points', 'rebounds', 'assists', 'steals', 'blocks'], atLeast: 3, gte: 10 } },
    { key: 'doubleDoubles', label: 'Double-doubles', short: 'double-doubles', one: 'double-double', abbr: 'DD', source: 'derived', group: 'scoring',
      agg: { kind: 'countIf', keys: ['points', 'rebounds', 'assists', 'steals', 'blocks'], atLeast: 2, gte: 10 } },
  ],
  filters: { withMinutes: (l) => l.stats?.minutes != null, shotsTracked: (l) => hasKey(l, 'fgAtt') },
  // SD-24 (BK-06) + SD-44: FG / 3P made-attempted and % over the games that
  // tracked missed shots (D8), EFF per game
  sections: [
    { id: 'averages', title: 'Per game', rows: ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'effPg', 'topg', 'mpg'].map((stat) => ({ stat })) },
    { id: 'shooting', title: 'Shooting', rows: [
      { stat: 'fgMA', label: 'Field goals' }, { stat: 'fgPct' }, { stat: 'threesMA', label: '3-pointers' }, { stat: 'threePct' },
      { stat: 'threesMade' }, { stat: 'freeThrowsMade' }, { stat: 'freeThrowsAtt' }, { stat: 'freeThrowPct' },
    ] },
    { id: 'totals', title: 'Totals', rows: ['points', 'rebounds', 'oreb', 'dreb', 'assists', 'steals', 'blocks', 'turnovers', 'minutes', 'plusMinus'].map((stat) => ({ stat })) },
    { id: 'bests', title: 'Career highs', rows: [
      { stat: 'highPoints', label: 'Points' }, { stat: 'highRebounds', label: 'Rebounds' }, { stat: 'highAssists', label: 'Assists' },
      { stat: 'highFgMade', label: 'Field goals made', hideZero: true }, { stat: 'highThrees', label: '3-pointers', hideZero: true },
      { stat: 'doubleDoubles', hideZero: true }, { stat: 'tripleDoubles', hideZero: true },
    ] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'fouls' }, { stat: 'ejections' }] },
  ],
  careerView: 'sections',
  // SD-23 / SD-40 (BK-04) — the FIBA box score. MIN and +/- only once the five
  // was set (SD-29), Overall view only; FGM-A / 3PM-A / FG% / 3P% only when
  // the match tracked missed shots (D8: hidden, never a false %); OREB / DREB
  // once a rebound was typed off / def.
  box: [{ columns: [
    { key: 'minutes', overallOnly: true },
    'points',
    { key: 'fg', abbr: 'FGM-A', label: 'Field goals made-attempted', pair: ['fgMade', 'fgAtt'] }, 'fgPct',
    { key: 'three', abbr: '3PM-A', label: '3-pointers made-attempted', pair: ['threesMade', 'threesAtt'] }, 'threePct',
    { key: 'ft', abbr: 'FTM-A', label: 'Free throws made-attempted', pair: ['freeThrowsMade', 'freeThrowsAtt'] }, 'freeThrowPct',
    'oreb', 'dreb', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fouls',
    { key: 'plusMinus', signed: true, total: false, overallOnly: true },
    'eff',
  ] }],
  compare: ['rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fouls', 'fgPct', 'threePct', 'freeThrowPct'],
  // SD-27 (BK-07): per-game averages lead (min games, FIBA style), then totals
  leaders: ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'effPg', 'points', 'rebounds', 'assists', 'doubleDoubles'],
  // SD-27 — the Player of the Tournament: efficiency per game (min games)
  mvp: {
    stat: 'effPg', tieBreak: [{ key: 'eff', better: 'higher' }],
    howRanked: 'Efficiency per game (EFF), among players with at least {min}: points + rebounds + assists + steals + blocks − turnovers − missed free throws − missed field goals, divided by games played. Missed field goals count in games where the scorer tracked missed shots. Ties: higher total efficiency, then by name. You choose the winner.',
  },
  headline: ['points', 'rebounds', 'assists'],
  awards: [
    // tournament slots rank by the per-game average (FIBA); the slot keys stay
    { stat: 'points', icon: '🏀', label: 'Top scorer', rankBy: 'ppg' },
    { stat: 'rebounds', icon: '💪', label: 'Rebounds', tournamentLabel: 'Top rebounder', rankBy: 'rpg' },
    { stat: 'assists', icon: '🎯', label: 'Playmaker', rankBy: 'apg' },
  ],
  scoreUnit: 'points',
};
