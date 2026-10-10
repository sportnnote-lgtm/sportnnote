/** SD-96 — shooting's stat schema (see ../statSchema.ts). PURE. Results come
 *  from the results engine; a closed phase writes one stat line per shooter
 *  (data/results/shooting.ts `shootLines`): comps, place, the match score
 *  (`m_sh_10mar`, `m_sh_10mar_40` for a 40-shot match …), points and shots
 *  (average per series), inner tens and integer shots (inner-ten rate),
 *  finals reached, the final score, medals and position points. The profile
 *  renders the shooting career. */
import type { StatLine } from '../../core/types';
import type { MeasuredEventDef, SportStatSchema, StatDef } from '../statSchema.ts';
import { SHOOT_EVENTS } from '../../data/results/shootingDefs.ts';

const fmtOf = (dp: number) => ({ unit: 'points' as const, dp, better: 'higher' as const });
const EVENTS = SHOOT_EVENTS.map((e) => ({ key: `sh_${e.key.slice(6)}`, label: e.label, dp: e.scoring === 'decimal' ? 1 : 0 }));

const markStats: StatDef[] = EVENTS.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: fmtOf(e.dp) }));
const pbStats: StatDef[] = EVENTS.map((e) => ({
  key: `pb_${e.key}`, label: `Best ${e.label}`, leaderLabel: `Best ${e.label}`, source: 'derived', group: 'bests', format: fmtOf(e.dp),
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'higher' }], render: (s) => `${s[`m_${e.key}`] ?? 0}` },
}));

export const shootingStats: SportStatSchema<'shooting'> = {
  sport: 'shooting',
  events: SHOOT_EVENTS.map((e) => ({ key: e.key, label: e.label, format: fmtOf(e.scoring === 'decimal' ? 1 : 0) })) satisfies MeasuredEventDef[],
  filters: Object.fromEntries(EVENTS.map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
  stats: [
    { key: 'comps', label: 'Competitions', short: 'competitions', one: 'competition', group: 'shooting' },
    { key: 'finals', label: 'Finals', short: 'finals', one: 'final', group: 'shooting' },
    { key: 'shots', label: 'Shots', short: 'shots', one: 'shot', group: 'shooting' },
    { key: 'pts', label: 'Points', short: 'points', one: 'point', group: 'shooting', format: { unit: 'points', dp: 1 } },
    { key: 'xs', label: 'Inner tens', short: 'inner tens', one: 'inner ten', group: 'shooting' },
    { key: 'xShots', label: 'Shots (integer scoring)', short: 'integer shots', one: 'integer shot', group: 'shooting' },
    { key: 'innerRate', label: 'Inner-ten rate', short: 'inner-10 %', source: 'derived', group: 'shooting', format: { unit: 'percent', dp: 1 }, agg: { kind: 'rate', num: 'xs', den: 'xShots', scale: 100, dp: 1, qualifier: { den: 60 } } },
    { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', group: 'medals', weight: 3 },
    { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', group: 'medals', weight: 2 },
    { key: 'bronzes', label: 'Bronzes', short: 'bronzes', one: 'bronze', group: 'medals', weight: 1 },
    { key: 'posPoints', label: 'Position points', short: 'position pts', one: 'position pt', group: 'medals', format: { unit: 'points', dp: 1 } },
    { key: 'place', label: 'Place', short: 'place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'qPlace', label: 'Qualification place', short: 'qualification place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'qualified', label: 'Rounds qualified from', short: 'qualified', group: 'line' },
    { key: 'fpts', label: 'Final score', short: 'final score', group: 'line', format: { unit: 'points', dp: 1 }, agg: { kind: 'max' } },
    { key: 'dq', label: 'Disqualified', short: 'DQ', group: 'line', format: { unit: 'count', better: 'lower' } },
    ...markStats,
    ...pbStats,
  ],
  sections: [
    { id: 'bests', title: 'Personal bests', rows: pbStats.map((s) => ({ stat: s.key, hideZero: true })) },
    { id: 'shooting', title: 'Shooting', rows: [{ stat: 'comps' }, { stat: 'finals' }, { stat: 'shots' }, { stat: 'innerRate' }] },
    { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }, { stat: 'silvers' }, { stat: 'bronzes' }] },
  ],
  careerView: 'measured',
  history: ['golds', 'silvers', 'bronzes'],
  leaders: ['posPoints', 'golds', 'finals', 'pb_sh_10mar', 'pb_sh_10map', 'innerRate'],
  mvp: { stat: 'posPoints', tieBreak: [{ key: 'golds', better: 'higher' }, { key: 'silvers', better: 'higher' }], howRanked: 'Position points from each event (8-7-6-5-4-3-2-1 by default), then golds, then silvers. You choose the winner.' },
  headline: ['comps', 'golds', 'finals'],
  awards: [
    { stat: 'posPoints', icon: '🏅', label: 'Best shooter', tournamentLabel: 'Best shooter (points)', match: false },
    { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
  ],
};
