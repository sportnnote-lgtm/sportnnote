/** SD-94 — swimming's stat schema (see ../statSchema.ts). PURE. Results come
 *  from the results engine; a closed round writes one stat line per swimmer
 *  (data/results/athletics.ts `phaseLines`, shared with athletics): races /
 *  relays, place, the time, and the LEGAL time under `m_sw_<event>_<lc|sc>` —
 *  long and short course are separate events for PBs and records (World
 *  Aquatics SW 12.1 / 12.2) — plus finals, medals and position points. The
 *  profile renders the measured career (careerView 'measured'). */
import type { StatLine } from '../../core/types';
import type { MeasuredEventDef, SportStatSchema, StatDef } from '../statSchema.ts';

/** Individual swimming events (results engine keys without 'swim.'). */
export const SWIM_EVENTS: { key: string; label: string }[] = [
  ...['50', '100', '200', '400', '800', '1500'].map((d) => ({ key: `${d}free`, label: `${d} m freestyle` })),
  ...(['back', 'breast', 'fly'] as const).flatMap((s) => ['50', '100', '200'].map((d) => ({ key: `${d}${s}`, label: `${d} m ${s === 'back' ? 'backstroke' : s === 'breast' ? 'breaststroke' : 'butterfly'}` }))),
  { key: '100im', label: '100 m IM' }, { key: '200im', label: '200 m IM' }, { key: '400im', label: '400 m IM' },
];
const COURSES = [{ k: 'lc', label: 'LC' }, { k: 'sc', label: 'SC' }] as const;

const timeFmt = { unit: 'time' as const, dp: 2 };
const fmtTime = (v: number) => {
  const total = Math.round(v * 100);
  const m = Math.floor(total / 6000), rest = total % 6000;
  const s = Math.floor(rest / 100), cc = rest % 100;
  return m ? `${m}:${String(s).padStart(2, '0')}.${String(cc).padStart(2, '0')}` : `${s}.${String(cc).padStart(2, '0')}`;
};
const both = SWIM_EVENTS.flatMap((e) => COURSES.map((c) => ({ key: `sw_${e.key}_${c.k}`, label: `${e.label} (${c.label})` })));

const markStats: StatDef[] = both.map((e) => ({ key: `m_${e.key}`, label: e.label, short: e.label, group: 'marks', format: timeFmt }));
const pbStats: StatDef[] = both.map((e) => ({
  key: `pb_${e.key}`, label: `${e.label} PB`, leaderLabel: `Fastest ${e.label}`, source: 'derived', group: 'bests', format: timeFmt,
  agg: { kind: 'best', over: `m_${e.key}`, by: [{ key: `m_${e.key}`, better: 'lower' }], render: (s) => fmtTime(s[`m_${e.key}`] ?? 0) },
}));

export const swimmingStats: SportStatSchema<'swimming'> = {
  sport: 'swimming',
  events: SWIM_EVENTS.map((e): MeasuredEventDef => ({ key: `swim.${e.key}`, label: e.label, format: timeFmt })),
  filters: Object.fromEntries(both.map((e) => [`m_${e.key}`, (l: StatLine) => l.stats?.[`m_${e.key}`] != null])),
  stats: [
    { key: 'races', label: 'Races', short: 'races', one: 'race', group: 'racing' },
    { key: 'relays', label: 'Relay legs', short: 'relay legs', one: 'relay leg', group: 'racing' },
    { key: 'finals', label: 'Finals', short: 'finals', one: 'final', group: 'racing' },
    { key: 'qualified', label: 'Rounds qualified from', short: 'qualified', group: 'racing' },
    { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', group: 'medals', weight: 3 },
    { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', group: 'medals', weight: 2 },
    { key: 'bronzes', label: 'Bronzes', short: 'bronzes', one: 'bronze', group: 'medals', weight: 1 },
    { key: 'posPoints', label: 'Position points', short: 'position pts', one: 'position pt', group: 'medals', format: { unit: 'points', dp: 1 } },
    { key: 'place', label: 'Place', short: 'place', group: 'line', format: { unit: 'count', better: 'lower' }, agg: { kind: 'min' } },
    { key: 'mark', label: 'Mark', short: 'mark', group: 'line', format: timeFmt, agg: { kind: 'min' } },
    { key: 'hand', label: 'Hand-timed', short: 'hand-timed', group: 'line' }, // manual timing (SW 11.3) — same key / label as athletics
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
  leaders: ['posPoints', 'golds', 'pb_sw_50free_lc', 'pb_sw_50free_sc', 'pb_sw_100free_lc'],
  mvp: { stat: 'posPoints', tieBreak: [{ key: 'golds', better: 'higher' }, { key: 'silvers', better: 'higher' }], howRanked: 'Position points from individual finals (8-7-6-5-4-3-2-1 by default), then golds, then silvers. You choose the winner.' },
  headline: ['races', 'golds', 'finals'],
  awards: [
    { stat: 'posPoints', icon: '🏅', label: 'Best swimmer', tournamentLabel: 'Best swimmer (points)', match: false },
    { stat: 'golds', icon: '🥇', label: 'Most golds', match: false },
  ],
};
