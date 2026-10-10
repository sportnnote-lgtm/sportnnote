/** SD-15 — basketball's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema } from '../statSchema.ts';
import { ASSISTS, BLOCKS, FOULS, HIGH_POINTS, POINTS } from '../sharedStats.ts';

export const basketballStats: SportStatSchema<'basketball'> = {
  sport: 'basketball',
  /** SD-25 — career split chips (line context) */
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    { ...POINTS, group: 'scoring', weight: 1 },
    { key: 'rebounds', label: 'Rebounds', short: 'reb', abbr: 'REB', group: 'defence', weight: 1.5, matchSummary: true },
    { ...ASSISTS, group: 'scoring', weight: 2 },
    { ...FOULS, group: 'discipline', weight: -1 },
    { key: 'steals', label: 'Steals', short: 'steals', one: 'steal', abbr: 'STL', group: 'defence' },
    { ...BLOCKS, group: 'defence' },
    { key: 'turnovers', label: 'Turnovers', short: 'turnovers', one: 'turnover', abbr: 'TO', group: 'discipline', format: { unit: 'count', better: 'lower' } },
    { key: 'freeThrowsMade', label: 'Free throws made', short: 'FT made', abbr: 'FTM', group: 'scoring' },
    { key: 'freeThrowsAtt', label: 'Free throws attempted', short: 'FT att', abbr: 'FTA', group: 'scoring' },
    { key: 'ejections', label: 'Ejections', short: 'ejections', one: 'ejection', group: 'discipline' },
    // SD-29 (BK-10): from the starting five + subs (only when the five was set)
    { key: 'minutes', label: 'Minutes', short: 'mins', abbr: 'MIN', group: 'scoring', format: { unit: 'minutes' } },
    { key: 'plusMinus', label: 'Plus / minus', short: '+/-', abbr: '+/-', group: 'scoring', format: { unit: 'count' } },
    // SD-16 — per-game averages and double-doubles (data only: the career /
    // leaders that show them are SD-44 / SD-27; FIBA's minimum to rank is SD-27)
    { key: 'ppg', label: 'Points per game', abbr: 'PPG', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'points', dp: 1 } },
    { key: 'rpg', label: 'Rebounds per game', abbr: 'RPG', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'rebounds', dp: 1 } },
    { key: 'apg', label: 'Assists per game', abbr: 'APG', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'assists', dp: 1 } },
    // SD-23 — the team comparison's FT% (a rate recomputed over the side)
    { key: 'freeThrowPct', label: 'Free throw %', abbr: 'FT%', source: 'derived', group: 'scoring', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'rate', num: 'freeThrowsMade', den: 'freeThrowsAtt', scale: 100, dp: 0 } },
    // SD-24 (BK-06) — the rest of the per-game line, career highs, triple-doubles
    { key: 'spg', label: 'Steals per game', abbr: 'SPG', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'steals', dp: 1 } },
    { key: 'bpg', label: 'Blocks per game', abbr: 'BPG', source: 'derived', group: 'defence', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'blocks', dp: 1 } },
    { key: 'topg', label: 'Turnovers per game', abbr: 'TOPG', source: 'derived', group: 'discipline', format: { unit: 'decimal', dp: 1, better: 'lower' }, agg: { kind: 'perGame', key: 'turnovers', dp: 1 } },
    { key: 'mpg', label: 'Minutes per game', abbr: 'MPG', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'minutes', dp: 1, over: 'withMinutes' } },
    { ...HIGH_POINTS },
    { key: 'highRebounds', label: 'Most rebounds in a match', short: 'most rebounds', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'rebounds' } },
    { key: 'highAssists', label: 'Most assists in a match', short: 'most assists', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'assists' } },
    { key: 'tripleDoubles', label: 'Triple-doubles', short: 'triple-doubles', one: 'triple-double', abbr: 'TD', source: 'derived', group: 'scoring',
      agg: { kind: 'countIf', keys: ['points', 'rebounds', 'assists', 'steals', 'blocks'], atLeast: 3, gte: 10 } },
    { key: 'doubleDoubles', label: 'Double-doubles', short: 'double-doubles', one: 'double-double', abbr: 'DD', source: 'derived', group: 'scoring',
      agg: { kind: 'countIf', keys: ['points', 'rebounds', 'assists', 'steals', 'blocks'], atLeast: 2, gte: 10 } },
  ],
  filters: { withMinutes: (l) => l.stats?.minutes != null },
  // SD-24 (BK-06) — FG / 3P splits arrive with SD-40 (not on the line yet)
  sections: [
    { id: 'averages', title: 'Per game', rows: ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'topg', 'mpg'].map((stat) => ({ stat })) },
    { id: 'shooting', title: 'Shooting', rows: [{ stat: 'freeThrowsMade' }, { stat: 'freeThrowsAtt' }, { stat: 'freeThrowPct' }] },
    { id: 'totals', title: 'Totals', rows: ['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'minutes', 'plusMinus'].map((stat) => ({ stat })) },
    { id: 'bests', title: 'Career highs', rows: [
      { stat: 'highPoints', label: 'Points' }, { stat: 'highRebounds', label: 'Rebounds' }, { stat: 'highAssists', label: 'Assists' },
      { stat: 'doubleDoubles', hideZero: true }, { stat: 'tripleDoubles', hideZero: true },
    ] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'fouls' }, { stat: 'ejections' }] },
  ],
  careerView: 'sections',
  // SD-23 — the shared box score's columns (FG / 3P / FT splits, OREB / DREB
  // and EFF come with SD-40). MIN and +/- only once the five was set (SD-29),
  // and only on the Overall view.
  box: [{ columns: [
    { key: 'minutes', overallOnly: true },
    'points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fouls',
    { key: 'plusMinus', signed: true, total: false, overallOnly: true },
  ] }],
  compare: ['rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fouls', 'freeThrowPct'],
  leaders: ['points', 'rebounds', 'assists', 'steals', 'blocks'],
  headline: ['points', 'rebounds', 'assists'],
  awards: [
    { stat: 'points', icon: '🏀', label: 'Top scorer' },
    { stat: 'rebounds', icon: '💪', label: 'Rebounds' },
    { stat: 'assists', icon: '🎯', label: 'Playmaker' },
  ],
  scoreUnit: 'points',
};
