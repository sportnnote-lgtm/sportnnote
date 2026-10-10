/** SD-15 — tennis's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema } from '../statSchema.ts';
import { ACES, POINTS } from '../sharedStats.ts';
import { BEST_SERVER, racketCareerStats, racketLeaders, racketMvp, racketRecordStats, racketResultStats, racketSections, racketServeStats } from '../rallyStats.ts';

export const tennisStats: SportStatSchema<'tennis'> = {
  sport: 'tennis',
  /** SD-25 — career split chips (line context) */
  splits: ['discipline', 'format', 'tournament', 'season', 'opponent'],
  stats: [
    { ...POINTS, group: 'points', weight: 1 },
    { ...ACES, group: 'serve', weight: 2 },
    // SD-27 (GEN-14): a double fault costs the match rating a point
    { key: 'doubleFaults', label: 'Double faults', short: 'double faults', one: 'double fault', abbr: 'DF', group: 'serve', format: { unit: 'count', better: 'lower' }, weight: -1 },
    // SD-19 — the match record from the absolute statTotals (racketTotals.ts)
    ...racketRecordStats(true, true),
    // SD-22 — serve / return career keys replayed from the point log (serveStats.ts)
    ...racketServeStats(true),
    // SD-24 — W-L pairs and won % for the career's Match play section
    ...racketCareerStats(true),
    // SD-27 — matches won / win % for the leaders and the Player of the Tournament
    ...racketResultStats('setsPct'),
  ],
  sections: racketSections(true, [{ stat: 'aces' }, { stat: 'doubleFaults' }]),
  careerView: 'sections',
  box: [{ columns: ['points', 'aces', 'doubleFaults'] }],
  // SD-27 (TN-10): results first, never rally points
  leaders: racketLeaders(true, ['aces']),
  mvp: racketMvp(true),
  headline: ['points', 'aces'],
  awards: [
    // retired: "Top scorer" isn't a tennis award (kept for published awards' icon)
    { stat: 'points', icon: '🎾', label: 'Top scorer', match: false, tournament: false },
    { stat: 'aces', icon: '💥', label: 'Aces', tournamentLabel: 'Most aces' },
    BEST_SERVER,
  ],
};
