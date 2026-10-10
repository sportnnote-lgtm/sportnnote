/** SD-15 — the stat schema shared by the point-only racket sports (badminton,
 *  pickleball, padel, squash, table tennis): the credited `points`, plus the
 *  SD-19 match record every line carries from the absolute `statTotals`
 *  (src/sports/racketTotals.ts), plus the SD-22 serve / return keys replayed
 *  from the point log (src/sports/serveStats.ts). PURE. */
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

const rate = (key: string, label: string, num: string, den: string): StatDef => ({
  key, label, source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 },
  agg: { kind: 'rate', num, den, scale: 100, dp: 0 },
});

/** SD-22 — the career serve / return keys every racket line gets from the
 *  replay (`serveCareerKeys`), and the rates built on them. Group 'record'
 *  (career, not the history row). Coverage-aware: a line without the server-
 *  side keys (doubles where the server isn't named) is left out of the rate's
 *  numerator AND denominator, never read as 0%. `sets` adds holds / breaks and
 *  break points (tennis, padel). */
export function racketServeStats(sets: boolean): StatDef[] {
  return [
    rec('srvPts', 'Service points', 'service points', 'service point'),
    rec('srvPtsWon', 'Service points won', 'service points won', 'service point won'),
    rec('rcvPts', 'Return points', 'return points', 'return point'),
    rec('rcvPtsWon', 'Return points won', 'return points won', 'return point won'),
    rate('srvPtsPct', 'Service points won %', 'srvPtsWon', 'srvPts'),
    rate('rcvPtsPct', 'Return points won %', 'rcvPtsWon', 'rcvPts'),
    ...(sets ? [
      rec('svcGames', 'Service games', 'service games', 'service game'),
      rec('svcHeld', 'Service games held', 'holds', 'hold'),
      rec('rtnGames', 'Return games', 'return games', 'return game'),
      rec('breaks', 'Breaks of serve', 'breaks', 'break'),
      rec('bpFaced', 'Break points faced', 'break points faced', 'break point faced'),
      rec('bpSaved', 'Break points saved', 'break points saved', 'break point saved'),
      rec('bpOpps', 'Break point chances', 'break point chances', 'break point chance'),
      rec('bpWon', 'Break points converted', 'break points converted', 'break point converted'),
      rate('holdPct', 'Service games held %', 'svcHeld', 'svcGames'),
      rate('breakPct', 'Return games won %', 'breaks', 'rtnGames'),
      rate('bpSavedPct', 'Break points saved %', 'bpSaved', 'bpFaced'),
      rate('bpWonPct', 'Break points converted %', 'bpWon', 'bpOpps'),
    ] : []),
  ];
}

export function rallyStats<S extends SportId>(sport: S, icon: string, opts: { sets?: boolean } = {}): SportStatSchema<S> {
  return {
    sport,
    /** SD-25 — career split chips (line context) */
    splits: ['discipline', 'format', 'tournament', 'season', 'opponent'],
    stats: [{ ...POINTS, group: 'points', weight: 1 }, ...racketRecordStats(!!opts.sets), ...racketServeStats(!!opts.sets)],
    sections: [{ id: 'points', title: 'Points', rows: [{ stat: 'points' }] }],
    careerView: 'totals',
    box: [{ columns: ['points'] }],
    leaders: ['points'],
    headline: ['points'],
    awards: [{ stat: 'points', icon, label: 'Top scorer' }],
  };
}
