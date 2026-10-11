/** SD-90 / SD-91 — athletics' stat schema (see ../statSchema.ts). PURE. Results come
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
  { key: '800m', label: '800 m' }, { key: '1000m', label: '1000 m' }, { key: '1500m', label: '1500 m' }, { key: '3000m', label: '3000 m' },
  { key: '80mh', label: '80 m hurdles' }, { key: '100mh', label: '100 m hurdles' }, { key: '110mh', label: '110 m hurdles' },
  { key: '300mh', label: '300 m hurdles' }, { key: '400mh', label: '400 m hurdles' },
  // SD-93: the indoor combined-event races (credited to the athlete's PBs)
  { key: '60m', label: '60 m' }, { key: '60mh', label: '60 m hurdles' },
];

/** SD-91 — the field disciplines (distance / height, higher is better). */
export const FIELD_EVENTS: { key: string; label: string; unit: 'distance' | 'height' }[] = [
  { key: 'lj', label: 'Long jump', unit: 'distance' }, { key: 'tj', label: 'Triple jump', unit: 'distance' },
  { key: 'hj', label: 'High jump', unit: 'height' }, { key: 'pv', label: 'Pole vault', unit: 'height' },
  { key: 'sp', label: 'Shot put', unit: 'distance' }, { key: 'dt', label: 'Discus throw', unit: 'distance' },
  { key: 'jt', label: 'Javelin throw', unit: 'distance' }, { key: 'ht', label: 'Hammer throw', unit: 'distance' },
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

/** SD-92 — road races and race walks (standard distances; times to the whole
 *  second, a track walk to 1/100). Cross-country keeps places, not times. */
export const ROAD_STAT_EVENTS: { key: string; disc: string; label: string }[] = [
  { key: 'road_5000', disc: 'ath.road.5000', label: '5 km road' }, { key: 'road_10000', disc: 'ath.road.10000', label: '10 km road' },
  { key: 'road_15000', disc: 'ath.road.15000', label: '15 km road' }, { key: 'road_hm', disc: 'ath.road.hm', label: 'Half marathon' },
  { key: 'road_mar', disc: 'ath.road.mar', label: 'Marathon' },
  { key: 'walk_t3000', disc: 'ath.walk.t3000', label: '3000 m walk' }, { key: 'walk_t5000', disc: 'ath.walk.t5000', label: '5000 m walk' },
  { key: 'walk_t10000', disc: 'ath.walk.t10000', label: '10,000 m walk' },
  { key: 'walk_5000', disc: 'ath.walk.5000', label: '5 km walk' }, { key: 'walk_10000', disc: 'ath.walk.10000', label: '10 km walk' },
  { key: 'walk_20000', disc: 'ath.walk.20000', label: '20 km walk' },
];
const roadFmt = (k: string) => ({ unit: 'time' as const, dp: k.startsWith('walk_t') ? 2 : 0 });
const roadMarkStats: StatDef[] = ROAD_STAT_EVENTS.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: roadFmt(e.key) }));
const roadPbStats: StatDef[] = ROAD_STAT_EVENTS.map((e) => ({
  key: `pb_${e.key}`, label: `${e.label} PB`, leaderLabel: `Fastest ${e.label}`, source: 'derived', group: 'bests', format: roadFmt(e.key),
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'lower' }], render: (s) => fmtRoad(s[`m_${e.key}`] ?? 0, e.key) },
}));
function fmtRoad(v: number, key: string): string {
  if (key.startsWith('walk_t')) return fmtTime(v);
  const t = Math.round(v), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** SD-93 — combined events: the total (points) per event — decathlon, heptathlon,
 *  indoor heptathlon / pentathlon, school pentathlon / tetrathlon. A house's own
 *  list keeps its own key (m_ce_x_…) and shows on the measured career only. */
export const COMBINED_STAT_EVENTS: { key: string; disc: string; label: string }[] = [
  { key: 'ce_dec', disc: 'ath.ce_dec', label: 'Decathlon' }, { key: 'ce_hep', disc: 'ath.ce_hep', label: 'Heptathlon' },
  { key: 'ce_ihep', disc: 'ath.ce_ihep', label: 'Indoor heptathlon' }, { key: 'ce_ipen', disc: 'ath.ce_ipen', label: 'Indoor pentathlon' },
  { key: 'ce_pen', disc: 'ath.ce_pen', label: 'Pentathlon' }, { key: 'ce_tet', disc: 'ath.ce_tet', label: 'Tetrathlon' },
];
const ceFmt = { unit: 'points' as const, dp: 0, better: 'higher' as const };
const ceMarkStats: StatDef[] = COMBINED_STAT_EVENTS.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: ceFmt }));
const cePbStats: StatDef[] = COMBINED_STAT_EVENTS.map((e) => ({
  key: `pb_${e.key}`, label: `${e.label} PB`, leaderLabel: `Best ${e.label.toLowerCase()}`, source: 'derived', group: 'bests', format: ceFmt,
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'higher' }], render: (s) => `${s[`m_${e.key}`] ?? 0} pts` },
}));

const fieldFmt = (unit: 'distance' | 'height') => ({ unit, dp: 2, better: 'higher' as const });
const fieldMarkStats: StatDef[] = FIELD_EVENTS.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: fieldFmt(e.unit) }));
const fieldPbStats: StatDef[] = FIELD_EVENTS.map((e) => ({
  key: `pb_${e.key}`, label: `${e.label} PB`, leaderLabel: `${e.unit === 'height' ? 'Highest' : 'Longest'} ${e.label.toLowerCase()}`, source: 'derived', group: 'bests', format: fieldFmt(e.unit),
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'higher' }], render: (s) => (s[`m_${e.key}`] ?? 0).toFixed(2) },
}));

export const athleticsStats: SportStatSchema<'athletics'> = {
  sport: 'athletics',
  events: [
    ...TRACK_EVENTS.map((e): MeasuredEventDef => ({ key: `ath.${e.key}`, label: e.label, format: timeFmt })),
    ...FIELD_EVENTS.map((e): MeasuredEventDef => ({ key: `ath.${e.key}`, label: e.label, format: fieldFmt(e.unit), ...(e.unit === 'distance' ? { attempts: 6 } : {}) })),
    ...ROAD_STAT_EVENTS.map((e): MeasuredEventDef => ({ key: e.disc, label: e.label, format: roadFmt(e.key) })),
    ...COMBINED_STAT_EVENTS.map((e): MeasuredEventDef => ({ key: e.disc, label: e.label, format: ceFmt })),
  ],
  filters: Object.fromEntries([...TRACK_EVENTS, ...FIELD_EVENTS, ...ROAD_STAT_EVENTS, ...COMBINED_STAT_EVENTS].map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
  stats: [
    { key: 'races', label: 'Races', short: 'races', one: 'race', group: 'racing' },
    { key: 'field', label: 'Field events', short: 'field events', one: 'field event', group: 'racing' },
    { key: 'relays', label: 'Relay legs', short: 'relay legs', one: 'relay leg', group: 'racing' },
    // SD-92: road races, race walks, cross-country; team scoring by placings
    { key: 'road', label: 'Road races', short: 'road races', one: 'road race', group: 'racing' },
    { key: 'walks', label: 'Race walks', short: 'race walks', one: 'race walk', group: 'racing' },
    { key: 'xc', label: 'Cross-country races', short: 'XC races', one: 'XC race', group: 'racing' },
    { key: 'teamScorer', label: 'Scored for the team', short: 'team scorer', group: 'racing' },
    { key: 'teamPlace', label: 'Team place', short: 'team place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'teamGolds', label: 'Team golds', short: 'team golds', one: 'team gold', group: 'medals' },
    { key: 'teamSilvers', label: 'Team silvers', short: 'team silvers', one: 'team silver', group: 'medals' },
    { key: 'teamBronzes', label: 'Team bronzes', short: 'team bronzes', one: 'team bronze', group: 'medals' },
    { key: 'walkCards', label: 'Red cards (race walk)', short: 'walk red cards', one: 'walk red card', group: 'line', format: { unit: 'count', better: 'lower' } },
    // SD-93: combined events — totals completed, events inside them, their points
    { key: 'combined', label: 'Combined events', short: 'combined events', one: 'combined event', group: 'racing' },
    { key: 'ceEvent', label: 'Combined-event events', short: 'CE events', one: 'CE event', group: 'racing' },
    { key: 'cePts', label: 'Combined-event points', short: 'CE pts', one: 'CE pt', group: 'line', format: { unit: 'points', dp: 0 }, agg: { kind: 'max' } },
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
    ...fieldMarkStats,
    ...fieldPbStats,
    ...roadMarkStats,
    ...roadPbStats,
    ...ceMarkStats,
    ...cePbStats,
  ],
  sections: [
    { id: 'bests', title: 'Personal bests', rows: [...pbStats, ...fieldPbStats, ...roadPbStats, ...cePbStats].map((s) => ({ stat: s.key, hideZero: true })) },
    { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }, { stat: 'silvers' }, { stat: 'bronzes' }, { stat: 'finals' }, { stat: 'teamGolds', hideZero: true }, { stat: 'teamSilvers', hideZero: true }, { stat: 'teamBronzes', hideZero: true }] },
  ],
  careerView: 'measured',
  history: ['golds', 'silvers', 'bronzes'],
  leaders: ['posPoints', 'golds', ...pbStats.slice(0, 3).map((s) => s.key)],
  mvp: { stat: 'posPoints', tieBreak: [{ key: 'golds', better: 'higher' }, { key: 'silvers', better: 'higher' }], howRanked: 'Position points from individual finals (8-7-6-5-4-3-2-1 by default), then golds, then silvers. You choose the winner.' },
  headline: ['races', 'field', 'golds', 'finals'],
  awards: [
    { stat: 'posPoints', icon: '🏅', label: 'Best athlete', tournamentLabel: 'Best athlete (points)', match: false },
    { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
  ],
};
