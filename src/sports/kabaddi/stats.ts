/** SD-15 — kabaddi's stat schema (see ../statSchema.ts). PURE. Raid / tackle
 *  points come from the guided raid (SD-03); raid splits come with SD-33. */
import type { SportStatSchema } from '../statSchema.ts';

export const kabaddiStats: SportStatSchema<'kabaddi'> = {
  sport: 'kabaddi',
  /** SD-25 — career split chips (line context) */
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    { key: 'raidPoints', label: 'Raid pts', short: 'raid pts', abbr: 'RAID', group: 'raiding', weight: 2, matchSummary: true },
    { key: 'tacklePoints', label: 'Tackle pts', short: 'tackle pts', abbr: 'TKL', group: 'defending', weight: 2, matchSummary: true },
    // SD-24 (KB-04) — totals, per-match figures and milestones. Raid strike %,
    // not-out % and tackle % need per-player raid / tackle attempts (SD-33).
    { key: 'matchPoints', label: 'Total points', short: 'total pts', source: 'derived', group: 'overall', agg: { kind: 'sum', keys: ['raidPoints', 'tacklePoints'] } },
    { key: 'ptsPerMatch', label: 'Points per match', source: 'derived', group: 'overall', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: ['raidPoints', 'tacklePoints'], dp: 1 } },
    { key: 'raidPerMatch', label: 'Raid pts per match', source: 'derived', group: 'raiding', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'raidPoints', dp: 1 } },
    { key: 'tacklePerMatch', label: 'Tackle pts per match', source: 'derived', group: 'defending', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'tacklePoints', dp: 1 } },
    { key: 'super10s', label: 'Super 10s', short: 'super 10s', one: 'super 10', source: 'derived', group: 'raiding', agg: { kind: 'countIf', key: 'raidPoints', gte: 10 } },
    { key: 'high5s', label: 'High 5s', short: 'high 5s', one: 'high 5', source: 'derived', group: 'defending', agg: { kind: 'countIf', key: 'tacklePoints', gte: 5 } },
    { key: 'highRaid', label: 'Most raid pts in a match', short: 'most raid pts', source: 'derived', group: 'raiding', agg: { kind: 'max', key: 'raidPoints' } },
    // SD-23 — team-level (the comparison panel; the full PKL match centre is SD-41)
    { key: 'allOutPoints', label: 'All-out pts', short: 'all-out pts', source: 'team' },
    { key: 'raids', label: 'Raids', short: 'raids', one: 'raid', source: 'team' },
  ],
  sections: [
    { id: 'overall', title: 'Overall', rows: [{ stat: 'matchPoints' }, { stat: 'ptsPerMatch' }] },
    { id: 'raiding', title: 'Raiding', rows: [{ stat: 'raidPoints' }, { stat: 'raidPerMatch' }, { stat: 'highRaid', label: 'Best match' }, { stat: 'super10s', hideZero: true }] },
    { id: 'defending', title: 'Defending', rows: [{ stat: 'tacklePoints' }, { stat: 'tacklePerMatch' }, { stat: 'high5s', hideZero: true }] },
  ],
  careerView: 'sections',
  box: [{ columns: ['raidPoints', 'tacklePoints', { key: 'totalPoints', abbr: 'PTS', label: 'Points', sum: ['raidPoints', 'tacklePoints'], emphasis: true }] }],
  compare: ['raidPoints', 'tacklePoints', 'allOutPoints', 'raids'],
  leaders: ['raidPoints', 'tacklePoints'],
  headline: ['raidPoints', 'tacklePoints'],
  awards: [
    { stat: 'raidPoints', icon: '🤼', label: 'Top raider' },
    { stat: 'tacklePoints', icon: '🛡️', label: 'Top defender' },
  ],
  scoreUnit: 'points',
};
