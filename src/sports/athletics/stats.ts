/** SD-90 — athletics' stat schema (see ../statSchema.ts). PURE. Results come
 *  from the results engine (field_events / field_entries); when a round is
 *  closed each athlete gets one stat line per round (data/results/athletics.ts
 *  `phaseLines`): races / relays, place, the mark, and the discipline's LEGAL
 *  mark under `m_<event>` (wind-aided and — unless the meet is hand-timed —
 *  hand times never count), plus finals, medals and position points (posPoints). The
 *  profile renders its own measured career (careerView 'measured'): PB / SB
 *  per event, medals, finals, results history. */
import type { StatLine } from '../../core/types';
import type { MeasuredEventDef, SportStatSchema, StatDef } from '../statSchema.ts';

/** The track disciplines (results engine keys without the 'ath.' prefix). */
export const TRACK_EVENTS: { key: string; label: string }[] = [
  { key: '100m', label: '100 m' }, { key: '200m', label: '200 m' }, { key: '400m', label: '400 m' },
  { key: '800m', label: '800 m' }, { key: '1500m', label: '1500 m' }, { key: '3000m', label: '3000 m' },
  { key: '80mh', label: '80 m hurdles' }, { key: '100mh', label: '100 m hurdles' }, { key: '110mh', label: '110 m hurdles' },
  { key: '300mh', label: '300 m hurdles' }, { key: '400mh', label: '400 m hurdles' },
];

const timeFmt = { unit: 'time' as const, dp: 2 };
const fmtTime = (v: number) => {
  const total = Math.round(v * 100);
  const m = Math.floor(total / 6000), rest = total % 6000;
  const s = Math.floor(rest / 100), cc = rest % 100;
  return m ? `${m}:${String(s).padStart(2, '0')}.${String(cc).padStart(2, '0')}` : `${s}.${String(cc).padStart(2, '0')}`;
};

const markStats: StatDef[] = TRACK_EVENTS.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: timeFmt }));
const pbStats: StatDef[] = TRACK_EVENTS.map((e) => ({
  key: `pb_${e.key}`, label: `${e.label} PB`, leaderLabel: `Fastest ${e.label}`, source: 'derived', group: 'bests', format: timeFmt,
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'lower' }], render: (s) => fmtTime(s[`m_${e.key}`] ?? 0) },
}));

export const athleticsStats: SportStatSchema<'athletics'> = {
  sport: 'athletics',
  events: TRACK_EVENTS.map((e): MeasuredEventDef => ({ key: `ath.${e.key}`, label: e.label, format: timeFmt })),
  filters: Object.fromEntries(TRACK_EVENTS.map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
  stats: [
    { key: 'races', label: 'Races', short: 'races', one: 'race', group: 'racing' },
    { key: 'relays', label: 'Relay legs', short: 'relay legs', one: 'relay leg', group: 'racing' },
    { key: 'finals', label: 'Finals', short: 'finals', one: 'final', group: 'racing' },
    { key: 'qualified', label: 'Rounds qualified from', short: 'qualified', group: 'racing' },
    // golds / silvers keep the shared labels (sharedStats.ts)
    { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', group: 'medals', weight: 3 },
    { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', group: 'medals', weight: 2 },
    { key: 'bronzes', label: 'Bronzes', short: 'bronzes', one: 'bronze', group: 'medals', weight: 1 },
    // not 'points' — that key means a match's points in basketball / volleyball / carrom
    { key: 'posPoints', label: 'Position points', short: 'position pts', one: 'position pt', group: 'medals', format: { unit: 'points', dp: 1 } },
    { key: 'place', label: 'Place', short: 'place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'mark', label: 'Mark', short: 'mark', group: 'line', format: timeFmt, agg: { kind: 'min' } },
    { key: 'wind', label: 'Wind (m/s)', short: 'wind', group: 'line', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'max' } },
    { key: 'hand', label: 'Hand-timed', short: 'hand-timed', group: 'line' },
    { key: 'dnf', label: 'Did not finish', short: 'DNF', group: 'line', format: { unit: 'count', better: 'lower' } },
    { key: 'dq', label: 'Disqualified', short: 'DQ', group: 'line', format: { unit: 'count', better: 'lower' } },
    ...markStats,
    ...pbStats,
  ],
  sections: [
    { id: 'bests', title: 'Personal bests', rows: pbStats.map((s) => ({ stat: s.key, hideZero: true })) },
    { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }, { stat: 'silvers' }, { stat: 'bronzes' }, { stat: 'finals' }] },
  ],
  careerView: 'measured',
  history: ['golds', 'silvers', 'bronzes'],
  leaders: ['posPoints', 'golds', ...pbStats.slice(0, 3).map((s) => s.key)],
  mvp: { stat: 'posPoints', tieBreak: [{ key: 'golds', better: 'higher' }, { key: 'silvers', better: 'higher' }], howRanked: 'Position points from individual finals (8-7-6-5-4-3-2-1 by default), then golds, then silvers. You choose the winner.' },
  headline: ['races', 'golds', 'finals'],
  awards: [
    { stat: 'posPoints', icon: '🏅', label: 'Best athlete', tournamentLabel: 'Best athlete (points)', match: false },
    { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
  ],
};
