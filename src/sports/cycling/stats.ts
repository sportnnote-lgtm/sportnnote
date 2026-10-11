/** SD-98 — cycling's stat schema (see ../statSchema.ts). PURE. Results come
 *  from the results engine; a closed phase writes one stat line per rider
 *  (data/results/cycling.ts `cycLines`): races, place, wins, finals, medals,
 *  position points, DNF / OTL / DQ; a timed event's time and its LEGAL time
 *  under `m_cyc_<event>` (ITT per distance, pursuit / time trial per distance,
 *  the sprint's flying 200 m); points-race points and laps gained; sprint
 *  matches won / lost; stage-race stages and stage wins. Shared keys (races,
 *  finals, medals, place, mark, hand, dnf, dq, posPoints) carry exactly the
 *  crew sports' labels (stat-schema rule). The profile renders the cycling
 *  career (careerView 'measured'). */
import type { StatLine } from '../../core/types';
import type { MeasuredEventDef, SportStatSchema, StatDef } from '../statSchema.ts';
import { CYC_EVENTS } from '../../data/results/cyclingDefs.ts';

const fmtFor = (dp: number) => ({ unit: 'time' as const, dp });
const fmtTime = (v: number, dp: number) => {
  const scale = 10 ** dp;
  const total = Math.round(v * scale);
  const m = Math.floor(total / (60 * scale)), rest = total % (60 * scale);
  const s = Math.floor(rest / scale), f = rest % scale;
  const frac = dp ? `.${String(f).padStart(dp, '0')}` : '';
  return m ? `${m}:${String(s).padStart(2, '0')}${frac}` : `${s}${frac}`;
};
const TIMED = CYC_EVENTS.filter((e) => e.timed).map((e) => ({
  key: e.key.replace(/\./g, '_'), disc: e.key, dp: e.setting === 'track' ? 3 : 2,
  label: e.kind === 'sprint' ? 'Flying 200 m' : e.short,
}));
const markStats: StatDef[] = TIMED.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: fmtFor(e.dp) }));
const pbStats: StatDef[] = TIMED.map((e) => ({
  key: `pb_${e.key}`, label: `${e.label} PB`, leaderLabel: `Fastest ${e.label}`, source: 'derived', group: 'bests', format: fmtFor(e.dp),
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'lower' }], render: (s) => fmtTime(s[`m_${e.key}`] ?? 0, e.dp) },
}));

export const cyclingStats: SportStatSchema<'cycling'> = {
  sport: 'cycling',
  events: TIMED.map((e): MeasuredEventDef => ({ key: e.disc, label: e.label, format: fmtFor(e.dp) })),
  filters: Object.fromEntries(TIMED.map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
  stats: [
    { key: 'races', label: 'Races', short: 'races', one: 'race', group: 'racing' },
    { key: 'raceWins', label: 'Race wins', short: 'wins', one: 'win', group: 'racing', weight: 3 },
    { key: 'finals', label: 'Finals', short: 'finals', one: 'final', group: 'racing' },
    { key: 'stages', label: 'Stages ridden', short: 'stages', one: 'stage', group: 'road' },
    { key: 'stageWins', label: 'Stage wins', short: 'stage wins', one: 'stage win', group: 'road' },
    { key: 'stagePlace', label: 'Stage place', short: 'stage place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'prPts', label: 'Points-race points', short: 'points-race pts', one: 'points-race pt', group: 'track' },
    { key: 'lapsGained', label: 'Laps gained', short: 'laps gained', one: 'lap gained', group: 'track' },
    { key: 'sprintW', label: 'Sprint matches won', short: 'sprint wins', one: 'sprint win', group: 'track' },
    { key: 'sprintL', label: 'Sprint matches lost', short: 'sprint losses', one: 'sprint loss', group: 'track' },
    { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', group: 'medals', weight: 3 },
    { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', group: 'medals', weight: 2 },
    { key: 'bronzes', label: 'Bronzes', short: 'bronzes', one: 'bronze', group: 'medals', weight: 1 },
    { key: 'posPoints', label: 'Position points', short: 'position pts', one: 'position pt', group: 'medals', format: { unit: 'points', dp: 1 } },
    { key: 'place', label: 'Place', short: 'place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'mark', label: 'Mark', short: 'mark', group: 'line', format: fmtFor(2), agg: { kind: 'min' } },
    { key: 'hand', label: 'Hand-timed', short: 'hand-timed', group: 'line' },
    { key: 'dnf', label: 'Did not finish', short: 'DNF', group: 'line', format: { unit: 'count', better: 'lower' } },
    { key: 'otl', label: 'Outside the time limit', short: 'OTL', group: 'line', format: { unit: 'count', better: 'lower' } },
    { key: 'dq', label: 'Disqualified', short: 'DQ', group: 'line', format: { unit: 'count', better: 'lower' } },
    ...markStats,
    ...pbStats,
  ],
  sections: [
    { id: 'bests', title: 'Personal bests', rows: pbStats.map((s) => ({ stat: s.key, hideZero: true })) },
    { id: 'racing', title: 'Racing', rows: [{ stat: 'races' }, { stat: 'raceWins' }, { stat: 'stageWins' }, { stat: 'sprintW' }, { stat: 'prPts' }] },
    { id: 'medals', title: 'Medals', rows: [{ stat: 'golds' }, { stat: 'silvers' }, { stat: 'bronzes' }] },
  ],
  careerView: 'measured',
  history: ['golds', 'silvers', 'bronzes'],
  leaders: ['posPoints', 'golds', 'raceWins', 'pb_cyc_itt_10', 'pb_cyc_ip_3000', 'pb_cyc_sprint'],
  mvp: { stat: 'posPoints', tieBreak: [{ key: 'golds', better: 'higher' }, { key: 'raceWins', better: 'higher' }], howRanked: 'Position points from each event (8-7-6-5-4-3-2-1 by default), then golds, then race wins. You choose the winner.' },
  headline: ['races', 'raceWins', 'golds'],
  awards: [
    { stat: 'posPoints', icon: '🏅', label: 'Best rider', tournamentLabel: 'Best rider (points)', match: false },
    { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
  ],
};
