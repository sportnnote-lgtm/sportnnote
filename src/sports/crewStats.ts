/** SD-99 / SD-100 — the stat schema rowing and canoe sprint share (one per
 *  sport, same keys). Shared keys (races, finals, medals, place, mark, hand,
 *  dnf, dq, posPoints) carry exactly swimming's labels (stat-schema rule). PURE. */
import type { StatLine } from '../core/types';
import type { MeasuredEventDef, SportStatSchema, StatDef } from './statSchema.ts';
import { CREW_EVENTS, type CrewSport } from '../data/results/crewDefs.ts';

const timeFmt = { unit: 'time' as const, dp: 2 };
const fmtTime = (v: number) => {
  const total = Math.round(v * 100);
  const m = Math.floor(total / 6000), rest = total % 6000;
  const s = Math.floor(rest / 100), cc = rest % 100;
  return m ? `${m}:${String(s).padStart(2, '0')}.${String(cc).padStart(2, '0')}` : `${s}.${String(cc).padStart(2, '0')}`;
};

export function crewStats<S extends CrewSport>(sport: S): SportStatSchema<S> {
  const events = CREW_EVENTS.filter((e) => e.sport === sport).map((e) => ({ key: e.key.replace(/\./g, '_'), disc: e.key, label: `${e.label} (${e.boat.label.toLowerCase()})` }));
  const markStats: StatDef[] = events.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: timeFmt }));
  const pbStats: StatDef[] = events.map((e) => ({
    key: `pb_${e.key}`, label: `${e.label} PB`, leaderLabel: `Fastest ${e.label}`, source: 'derived', group: 'bests', format: timeFmt,
    agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'lower' }], render: (s) => fmtTime(s[`m_${e.key}`] ?? 0) },
  }));
  const rowing = sport === 'rowing';
  const first = rowing ? ['row_1x_2000', 'row_8p_2000', 'row_1x_1000'] : ['cs_k1_200', 'cs_k1_500', 'cs_k1_1000'];
  return {
    sport,
    events: events.map((e): MeasuredEventDef => ({ key: e.disc, label: e.label, format: timeFmt })),
    filters: Object.fromEntries(events.map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
    stats: [
      { key: 'races', label: 'Races', short: 'races', one: 'race', group: 'racing' },
      { key: 'finals', label: 'Finals', short: 'finals', one: 'final', group: 'racing' },
      { key: 'finalsA', label: 'A finals', short: 'A finals', one: 'A final', group: 'racing' },
      ...(rowing ? [{ key: 'cox', label: 'Races as cox', short: 'as cox', one: 'race as cox', group: 'racing' }] : []),
      { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', group: 'medals', weight: 3 },
      { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', group: 'medals', weight: 2 },
      { key: 'bronzes', label: 'Bronzes', short: 'bronzes', one: 'bronze', group: 'medals', weight: 1 },
      { key: 'posPoints', label: 'Position points', short: 'position pts', one: 'position pt', group: 'medals', format: { unit: 'points', dp: 1 } },
      { key: 'place', label: 'Place', short: 'place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
      { key: 'mark', label: 'Mark', short: 'mark', group: 'line', format: timeFmt, agg: { kind: 'min' } },
      { key: 'seat', label: 'Seat (1 = bow / front)', short: 'seat', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
      { key: 'hand', label: 'Hand-timed', short: 'hand-timed', group: 'line' },
      { key: 'dnf', label: 'Did not finish', short: 'DNF', group: 'line', format: { unit: 'count', better: 'lower' } },
      { key: 'dq', label: 'Disqualified', short: 'DQ', group: 'line', format: { unit: 'count', better: 'lower' } },
      ...markStats,
      ...pbStats,
    ],
    sections: [
      { id: 'bests', title: 'Personal bests', rows: pbStats.map((s) => ({ stat: s.key, hideZero: true })) },
      { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }, { stat: 'silvers' }, { stat: 'bronzes' }, { stat: 'finalsA' }] },
    ],
    careerView: 'measured',
    history: ['golds', 'silvers', 'bronzes'],
    leaders: ['golds', 'finalsA', ...first.map((k) => `pb_${k}`)],
    mvp: { stat: 'golds', tieBreak: [{ key: 'silvers', better: 'higher' }, { key: 'bronzes', better: 'higher' }], howRanked: `Golds, then silvers, then bronzes${rowing ? ' (every rower and the cox of a medal crew is credited)' : ' (every paddler of a medal boat is credited)'}. You choose the winner.` },
    headline: ['races', 'golds', 'finalsA'],
    awards: [
      { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
      { stat: 'finalsA', icon: '🏁', label: 'Most A finals', match: false },
    ],
  };
}
