/** SD-15 — the stat schema shared by the point-only racket sports (badminton,
 *  pickleball, padel, squash, table tennis): the credited `points`, plus the
 *  SD-19 match record every line carries from the absolute `statTotals`
 *  (src/sports/racketTotals.ts). Rally stats (serve points, runs, game points)
 *  come with SD-22. PURE. */
import type { SportId } from '../core/types';
import type { SportStatSchema, StatDef } from './statSchema.ts';
import { POINTS } from './sharedStats.ts';

const rec = (key: string, label: string, short: string, one: string): StatDef =>
  ({ key, label, short, one, group: 'record' });

/** SD-19 — the record keys `statTotals` writes on every racket line (group
 *  'record': career totals, never the per-match history line). `sets` adds the
 *  set + tiebreak keys (tennis, padel). Display beyond totals is SD-24. */
export function racketRecordStats(sets: boolean): StatDef[] {
  return [
    rec('ptsWon', 'Points won', 'points won', 'point won'),
    rec('ptsLost', 'Points lost', 'points lost', 'point lost'),
    rec('gamesWon', 'Games won', 'games won', 'game won'),
    rec('gamesLost', 'Games lost', 'games lost', 'game lost'),
    ...(sets ? [
      rec('setsWon', 'Sets won', 'sets won', 'set won'),
      rec('setsLost', 'Sets lost', 'sets lost', 'set lost'),
    ] : []),
    // the deciding set (tennis / padel) or game — one label for every sport
    rec('decidersPlayed', 'Deciders', 'deciders', 'decider'),
    rec('decidersWon', 'Deciders won', 'deciders won', 'decider won'),
    ...(sets ? [
      rec('tiebreaksPlayed', 'Tiebreaks', 'tiebreaks', 'tiebreak'),
      rec('tiebreaksWon', 'Tiebreaks won', 'tiebreaks won', 'tiebreak won'),
    ] : []),
  ];
}

export function rallyStats<S extends SportId>(sport: S, icon: string, opts: { sets?: boolean } = {}): SportStatSchema<S> {
  return {
    sport,
    /** SD-25 — career split chips (line context) */
    splits: ['discipline', 'format', 'tournament', 'season', 'opponent'],
    stats: [{ ...POINTS, group: 'points', weight: 1 }, ...racketRecordStats(!!opts.sets)],
    sections: [{ id: 'points', title: 'Points', rows: [{ stat: 'points' }] }],
    careerView: 'totals',
    box: [{ columns: ['points'] }],
    leaders: ['points'],
    headline: ['points'],
    awards: [{ stat: 'points', icon, label: 'Top scorer' }],
  };
}
