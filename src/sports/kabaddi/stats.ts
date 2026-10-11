/** SD-15 — kabaddi's stat schema (see ../statSchema.ts). PURE. Raid / tackle
 *  points come from the guided raid (SD-03); the raid / tackle counts are
 *  absolute statTotals from the raid replay (SD-33, ./totals.ts). */
import type { Qualifier, SportStatSchema } from '../statSchema.ts';
import { YELLOW_CARDS, RED_CARDS } from '../sharedStats.ts';

/** SD-27 (KB-08) — minimum matches before a per-match figure ranks. */
export const KABADDI_MIN_MATCHES: Qualifier = { games: 2, unit: { label: 'matches', one: 'match' } };
const q = KABADDI_MIN_MATCHES;

export const kabaddiStats: SportStatSchema<'kabaddi'> = {
  sport: 'kabaddi',
  /** SD-25 — career split chips (line context) */
  splits: ['format', 'tournament', 'season', 'opponent'],
  stats: [
    // SD-27: a level total goes to the better per-match figure (fewer matches), then the milestones
    { key: 'raidPoints', label: 'Raid pts', short: 'raid pts', abbr: 'RAID', group: 'raiding', weight: 2, matchSummary: true,
      tieBreak: [{ key: 'raidPerMatch', better: 'higher' }, { key: 'super10s', better: 'higher' }] },
    { key: 'tacklePoints', label: 'Tackle pts', short: 'tackle pts', abbr: 'TKL', group: 'defending', weight: 2, matchSummary: true,
      tieBreak: [{ key: 'tacklePerMatch', better: 'higher' }, { key: 'high5s', better: 'higher' }] },
    // SD-24 (KB-04) — totals, per-match figures and milestones.
    { key: 'matchPoints', label: 'Total points', short: 'total pts', source: 'derived', group: 'overall', agg: { kind: 'sum', keys: ['raidPoints', 'tacklePoints'] },
      tieBreak: [{ key: 'ptsPerMatch', better: 'higher' }] },
    { key: 'ptsPerMatch', label: 'Points per match', source: 'derived', group: 'overall', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: ['raidPoints', 'tacklePoints'], dp: 1, qualifier: q }, tieBreak: [{ key: 'matchPoints', better: 'higher' }] },
    { key: 'raidPerMatch', label: 'Raid pts per match', source: 'derived', group: 'raiding', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'raidPoints', dp: 1, qualifier: q }, tieBreak: [{ key: 'raidPoints', better: 'higher' }] },
    { key: 'tacklePerMatch', label: 'Tackle pts per match', source: 'derived', group: 'defending', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'tacklePoints', dp: 1, qualifier: q }, tieBreak: [{ key: 'tacklePoints', better: 'higher' }] },
    { key: 'super10s', label: 'Super 10s', short: 'super 10s', one: 'super 10', source: 'derived', group: 'raiding', agg: { kind: 'countIf', key: 'raidPoints', gte: 10 }, tieBreak: [{ key: 'raidPoints', better: 'higher' }] },
    { key: 'high5s', label: 'High 5s', short: 'high 5s', one: 'high 5', source: 'derived', group: 'defending', agg: { kind: 'countIf', key: 'tacklePoints', gte: 5 }, tieBreak: [{ key: 'tacklePoints', better: 'higher' }] },
    { key: 'highRaid', label: 'Most raid pts in a match', short: 'most raid pts', source: 'derived', group: 'raiding', agg: { kind: 'max', key: 'raidPoints' } },
    // SD-82 — the best match by total points (links to that match)
    { key: 'bestMatch', label: 'Best match', leaderLabel: 'Most points in a match', short: 'best match', source: 'derived', group: 'overall', agg: { kind: 'max', keys: ['raidPoints', 'tacklePoints'] } },
    // SD-33 (KB-02) — absolute counts statTotals writes from the raid replay
    // ('present': a line written before SD-33 doesn't carry them — not a 0)
    { key: 'raids', label: 'Raids', short: 'raids', one: 'raid', group: 'raiding', coverage: 'present' },
    { key: 'successfulRaids', label: 'Successful raids', short: 'successful raids', one: 'successful raid', group: 'raiding', coverage: 'present' },
    { key: 'emptyRaids', label: 'Empty raids', short: 'empty raids', one: 'empty raid', group: 'raiding', coverage: 'present' },
    { key: 'raidsOut', label: 'Unsuccessful raids', short: 'unsuccessful raids', one: 'unsuccessful raid', group: 'raiding', coverage: 'present' },
    { key: 'touchPoints', label: 'Touch pts', short: 'touch pts', group: 'raiding', coverage: 'present' },
    { key: 'bonusPoints', label: 'Bonus pts', short: 'bonus pts', group: 'raiding', coverage: 'present' },
    { key: 'superRaids', label: 'Super raids', short: 'super raids', one: 'super raid', group: 'raiding', coverage: 'present' },
    { key: 'doOrDieRaids', label: 'Do-or-die raids', short: 'do-or-die raids', one: 'do-or-die raid', group: 'raiding', coverage: 'present' },
    { key: 'doOrDiePoints', label: 'Do-or-die pts', short: 'do-or-die pts', group: 'raiding', coverage: 'present' },
    { key: 'tackles', label: 'Tackles', short: 'tackles', one: 'tackle', group: 'defending', coverage: 'present' },
    { key: 'superTackles', label: 'Super tackles', short: 'super tackles', one: 'super tackle', group: 'defending', coverage: 'present' },
    // SD-82 (KB-04) — career rates from those counts. Tackle % needs failed
    // tackle attempts per defender, which one scorer can't capture (audit §5).
    { key: 'raidStrikeRate', label: 'Raid strike rate', short: 'raid strike rate', source: 'derived', group: 'raiding', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'successfulRaids', den: 'raids', scale: 100, dp: 0 } },
    { key: 'notOutRate', label: 'Not-out %', short: 'not out', source: 'derived', group: 'raiding', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: ['raids', '-raidsOut'], den: 'raids', scale: 100, dp: 0 } },
    // SD-59 / SD-72 — discipline (keyed: only matches that track cards /
    // technical points carry the keys; older matches read "not tracked")
    { key: 'greenCards', label: 'Green cards', short: 'green cards', one: 'green card', compact: 'green', group: 'discipline', weight: -1, abbr: 'GC', coverage: 'keyed' },
    { ...YELLOW_CARDS, group: 'discipline', weight: -2, abbr: 'YC', coverage: 'keyed', suspension: { minutes: 2 } },
    { ...RED_CARDS, group: 'discipline', weight: -5, abbr: 'RC', coverage: 'keyed', suspension: { permanent: true } },
    { key: 'techPointsConceded', label: 'Technical pts conceded', short: 'technical pts conceded', group: 'discipline', format: { unit: 'count', better: 'lower' }, coverage: 'keyed' },
    // SD-23 / SD-41 — team-level (the PKL match centre comparison panel)
    { key: 'allOutPoints', label: 'All-out pts', short: 'all-out pts', source: 'team' },
    { key: 'extraPoints', label: 'Extra pts', short: 'extra pts', source: 'team' },
    { key: 'tackleStrikeRate', label: 'Tackle strike rate', short: 'tackle strike rate', source: 'team', format: { unit: 'percent', dp: 0 } },
    { key: 'doOrDieRate', label: 'Do-or-die success', short: 'do-or-die success', source: 'team', format: { unit: 'percent', dp: 0 } },
    { key: 'allOuts', label: 'All-outs', short: 'all-outs', one: 'all-out', source: 'team' },
  ],
  sections: [
    { id: 'overall', title: 'Overall', rows: [{ stat: 'matchPoints' }, { stat: 'ptsPerMatch' }, { stat: 'bestMatch' }] },
    { id: 'raiding', title: 'Raiding', rows: [
      { stat: 'raidPoints' }, { stat: 'raidPerMatch' }, { stat: 'highRaid', label: 'Most in a match' }, { stat: 'raids' },
      { stat: 'raidStrikeRate' }, { stat: 'notOutRate' }, { stat: 'superRaids', hideZero: true }, { stat: 'super10s', hideZero: true },
    ] },
    { id: 'defending', title: 'Defending', rows: [
      { stat: 'tacklePoints' }, { stat: 'tacklePerMatch' }, { stat: 'tackles', label: 'Successful tackles' }, { stat: 'superTackles', hideZero: true }, { stat: 'high5s', hideZero: true },
    ] },
    { id: 'discipline', title: 'Discipline', rows: [
      { stat: 'greenCards', hideZero: true }, { stat: 'yellowCards', hideZero: true }, { stat: 'redCards', hideZero: true }, { stat: 'techPointsConceded', hideZero: true },
    ] },
  ],
  careerView: 'sections',
  box: [{ columns: ['raidPoints', 'tacklePoints', { key: 'totalPoints', abbr: 'PTS', label: 'Points', sum: ['raidPoints', 'tacklePoints'], emphasis: true }] }],
  // SD-41 (KB-03) — the PKL match centre: points split, then raiding, defending, all-outs
  compare: [
    'raidPoints', 'tacklePoints', 'allOutPoints', 'extraPoints',
    'raids', 'successfulRaids', 'raidStrikeRate', 'emptyRaids', 'raidsOut', 'superRaids', 'doOrDieRaids', 'doOrDieRate',
    { key: 'tackles', label: 'Successful tackles' }, 'tackleStrikeRate', 'superTackles', 'allOuts',
  ],
  // SD-27 (KB-08): total, raid and tackle points, per match (min matches), milestones
  leaders: ['matchPoints', 'raidPoints', 'tacklePoints', 'ptsPerMatch', 'raidPerMatch', 'tacklePerMatch', 'super10s', 'high5s'],
  headline: ['raidPoints', 'tacklePoints'],
  awards: [
    { stat: 'raidPoints', icon: '🤼', label: 'Top raider', tournamentLabel: 'Best raider' },
    { stat: 'tacklePoints', icon: '🛡️', label: 'Top defender', tournamentLabel: 'Best defender' },
  ],
  scoreUnit: 'points',
};
