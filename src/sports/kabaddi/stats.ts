/** SD-15 — kabaddi's stat schema (see ../statSchema.ts). PURE. Raid / tackle
 *  points come from the guided raid (SD-03); raid splits come with SD-33. */
import type { SportStatSchema } from '../statSchema.ts';

export const kabaddiStats: SportStatSchema<'kabaddi'> = {
  sport: 'kabaddi',
  stats: [
    { key: 'raidPoints', label: 'Raid pts', short: 'raid pts', abbr: 'RAID', group: 'raiding', weight: 2, matchSummary: true },
    { key: 'tacklePoints', label: 'Tackle pts', short: 'tackle pts', abbr: 'TKL', group: 'defending', weight: 2, matchSummary: true },
  ],
  sections: [
    { id: 'raiding', title: 'Raiding', rows: [{ stat: 'raidPoints' }] },
    { id: 'defending', title: 'Defending', rows: [{ stat: 'tacklePoints' }] },
  ],
  careerView: 'totals',
  box: [{ columns: ['raidPoints', 'tacklePoints'] }],
  leaders: ['raidPoints', 'tacklePoints'],
  headline: ['raidPoints', 'tacklePoints'],
  awards: [
    { stat: 'raidPoints', icon: '🤼', label: 'Top raider' },
    { stat: 'tacklePoints', icon: '🛡️', label: 'Top defender' },
  ],
  scoreUnit: 'points',
};
