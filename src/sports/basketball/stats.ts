/** SD-15 — basketball's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema } from '../statSchema.ts';
import { ASSISTS, BLOCKS, FOULS, POINTS } from '../sharedStats.ts';

export const basketballStats: SportStatSchema<'basketball'> = {
  sport: 'basketball',
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
  ],
  sections: [
    { id: 'scoring', title: 'Scoring', rows: [{ stat: 'points' }, { stat: 'assists' }, { stat: 'freeThrowsMade' }, { stat: 'freeThrowsAtt' }] },
    { id: 'defence', title: 'Defence', rows: [{ stat: 'rebounds' }, { stat: 'steals' }, { stat: 'blocks' }] },
    { id: 'discipline', title: 'Discipline', rows: [{ stat: 'fouls' }, { stat: 'turnovers' }, { stat: 'ejections' }] },
  ],
  careerView: 'totals',
  // today's BoxScore.tsx columns (FG / 3P / FT splits come with SD-40)
  box: [{ columns: ['points', 'rebounds', 'assists', 'fouls'] }],
  leaders: ['points', 'rebounds', 'assists', 'steals', 'blocks'],
  headline: ['points', 'rebounds', 'assists'],
  awards: [
    { stat: 'points', icon: '🏀', label: 'Top scorer' },
    { stat: 'rebounds', icon: '💪', label: 'Rebounds' },
    { stat: 'assists', icon: '🎯', label: 'Playmaker' },
  ],
  scoreUnit: 'points',
};
