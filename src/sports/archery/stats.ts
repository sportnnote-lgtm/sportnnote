/** SD-95 — archery's stat schema (see ../statSchema.ts). PURE. Results come
 *  from the results engine; a closed phase writes one stat line per archer
 *  (data/results/archery.ts `archLines`): the ranking round — competitions,
 *  arrows and points (average arrow), 10s (X included) and X, a complete
 *  round's score (`m_ar_r70`, `m_ar_c50`, `m_ar_r18i` …), the ranking place —
 *  and match play — matches won / lost, set points, the place — with medals and
 *  position points. The profile renders the archery career. */
import type { StatLine } from '../../core/types';
import type { MeasuredEventDef, SportStatSchema, StatDef } from '../statSchema.ts';
import { ARCH_ROUNDS } from '../../data/results/archeryDefs.ts';

const fmt = { unit: 'points' as const, dp: 0, better: 'higher' as const };
const ROUNDS = ARCH_ROUNDS.map((r) => ({ key: `ar_${r.key.slice(5)}`, label: r.label }));

const markStats: StatDef[] = ROUNDS.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: fmt }));
const pbStats: StatDef[] = ROUNDS.map((e) => ({
  key: `pb_${e.key}`, label: `Best ${e.label}`, leaderLabel: `Best ${e.label}`, source: 'derived', group: 'bests', format: fmt,
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'higher' }], render: (s) => `${s[`m_${e.key}`] ?? 0}` },
}));

export const archeryStats: SportStatSchema<'archery'> = {
  sport: 'archery',
  events: ARCH_ROUNDS.map((r) => ({ key: r.key, label: r.label, format: fmt })) satisfies MeasuredEventDef[],
  filters: Object.fromEntries(ROUNDS.map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
  stats: [
    { key: 'comps', label: 'Competitions', short: 'competitions', one: 'competition', group: 'archery' },
    { key: 'arrows', label: 'Arrows', short: 'arrows', one: 'arrow', group: 'archery' },
    { key: 'pts', label: 'Points', short: 'points', one: 'point', group: 'archery' },
    { key: 'tens', label: '10s (incl. X)', short: '10s', one: '10', group: 'archery' },
    { key: 'xs', label: 'Inner tens', short: 'inner tens', one: 'inner ten', group: 'archery' },
    { key: 'avgArrow', label: 'Average arrow', short: 'avg arrow', source: 'derived', group: 'archery', format: { unit: 'points', dp: 2 }, agg: { kind: 'rate', num: 'pts', den: 'arrows', dp: 2, qualifier: { den: 36 } } },
    { key: 'tenRate', label: '10 + X rate', short: '10+X %', source: 'derived', group: 'archery', format: { unit: 'percent', dp: 1 }, agg: { kind: 'rate', num: 'tens', den: 'arrows', scale: 100, dp: 1, qualifier: { den: 36 } } },
    { key: 'brackets', label: 'Match-play events', short: 'match-play events', one: 'match-play event', group: 'matches' },
    { key: 'mW', label: 'Matches won', short: 'matches won', one: 'match won', group: 'matches' },
    { key: 'mL', label: 'Matches lost', short: 'matches lost', one: 'match lost', group: 'matches' },
    { key: 'sp', label: 'Set points won', short: 'set points', one: 'set point', group: 'matches' },
    { key: 'spA', label: 'Set points against', short: 'set points against', one: 'set point against', group: 'matches' },
    { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', group: 'medals', weight: 3 },
    { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', group: 'medals', weight: 2 },
    { key: 'bronzes', label: 'Bronzes', short: 'bronzes', one: 'bronze', group: 'medals', weight: 1 },
    { key: 'posPoints', label: 'Position points', short: 'position pts', one: 'position pt', group: 'medals', format: { unit: 'points', dp: 1 } },
    { key: 'place', label: 'Place', short: 'place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'rPlace', label: 'Ranking-round place', short: 'ranking place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'seeded', label: 'Seeded into match play', short: 'seeded', group: 'line' },
    { key: 'dq', label: 'Disqualified', short: 'DQ', group: 'line', format: { unit: 'count', better: 'lower' } },
    ...markStats,
    ...pbStats,
  ],
  sections: [
    { id: 'bests', title: 'Personal bests', rows: pbStats.map((s) => ({ stat: s.key, hideZero: true })) },
    { id: 'archery', title: 'Archery', rows: [{ stat: 'comps' }, { stat: 'arrows' }, { stat: 'avgArrow' }, { stat: 'tenRate' }] },
    { id: 'matches', title: 'Match play', rows: [{ stat: 'mW' }, { stat: 'mL' }, { stat: 'sp' }] },
    { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }, { stat: 'silvers' }, { stat: 'bronzes' }] },
  ],
  careerView: 'measured',
  history: ['golds', 'silvers', 'bronzes'],
  leaders: ['posPoints', 'golds', 'mW', 'pb_ar_r70', 'pb_ar_c50', 'avgArrow', 'tenRate'],
  mvp: { stat: 'posPoints', tieBreak: [{ key: 'golds', better: 'higher' }, { key: 'silvers', better: 'higher' }], howRanked: 'Position points from each event (8-7-6-5-4-3-2-1 by default), then golds, then silvers. You choose the winner.' },
  headline: ['comps', 'golds', 'mW'],
  awards: [
    { stat: 'posPoints', icon: '🏅', label: 'Best archer', tournamentLabel: 'Best archer (points)', match: false },
    { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
  ],
};
