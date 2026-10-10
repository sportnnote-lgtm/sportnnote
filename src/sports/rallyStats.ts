/** SD-15 — the stat schema shared by the point-only racket sports (badminton,
 *  pickleball, padel, squash, table tennis): the credited `points`, plus the
 *  SD-19 match record every line carries from the absolute `statTotals`
 *  (src/sports/racketTotals.ts), plus the SD-22 serve / return keys replayed
 *  from the point log (src/sports/serveStats.ts). PURE. */
import type { SportId } from '../core/types';
import type { AwardDef, MvpDef, Qualifier, SectionDef, SportStatSchema, StatDef } from './statSchema.ts';
import { POINTS } from './sharedStats.ts';

// 'present' (SD-24): absolute statTotals keys, tracked wherever they're on the line
const rec = (key: string, label: string, short: string, one: string): StatDef =>
  ({ key, label, short, one, group: 'record', coverage: 'present' });

/** SD-19 — the record keys `statTotals` writes on every racket line (group
 *  'record': career totals, never the per-match history line). `sets` adds the
 *  set + tiebreak keys (tennis, padel). Display beyond totals is SD-24. */
export function racketRecordStats(sets: boolean, weighted = false): StatDef[] {
  // SD-27 — `weighted`: the per-match Player of the Match favours the side that
  // won (games ×2, sets ×4) over whoever was credited the most rally points
  const w = (d: StatDef, weight: number): StatDef => (weighted ? { ...d, weight } : d);
  return [
    rec('ptsWon', 'Points won', 'points won', 'point won'),
    rec('ptsLost', 'Points lost', 'points lost', 'point lost'),
    w({ ...rec('gamesWon', 'Games won', 'games won', 'game won'), leaderLabel: 'Most games won' }, 2),
    rec('gamesLost', 'Games lost', 'games lost', 'game lost'),
    ...(sets ? [
      w({ ...rec('setsWon', 'Sets won', 'sets won', 'set won'), leaderLabel: 'Most sets won' }, 4),
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

const rate = (key: string, label: string, num: string | string[], den: string | string[], extra: { qualifier?: Qualifier; leaderLabel?: string; tieBreak?: StatDef['tieBreak'] } = {}): StatDef => ({
  key, label, source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 },
  agg: { kind: 'rate', num, den, scale: 100, dp: 0, ...(extra.qualifier ? { qualifier: extra.qualifier } : {}) },
  ...(extra.leaderLabel ? { leaderLabel: extra.leaderLabel } : {}),
  ...(extra.tieBreak ? { tieBreak: extra.tieBreak } : {}),
});

/**
 * SD-27 — leaderboard minimums for racket rates (organisers can change them
 * per tournament). Sized for a school event of 3–6 matches:
 *   - win % / games won %: 3 matches;
 *   - service points won %: 30 service points (≈ one badminton match);
 *   - service games held %: 6 service games; break points converted %: 5 chances.
 */
export const RACKET_MINIMUMS = {
  matches: { games: 3, unit: { label: 'matches', one: 'match' } } as Qualifier,
  srvPts: { den: 30, unit: { label: 'service points', one: 'service point' } } as Qualifier,
  svcGames: { den: 6, unit: { label: 'service games', one: 'service game' } } as Qualifier,
  bpOpps: { den: 5, unit: { label: 'break point chances', one: 'break point chance' } } as Qualifier,
};

/** SD-27 — the match record as leaderboard stats: matches won (ranks the
 *  Player of the Tournament) and win % over decided matches (min matches).
 *  `share` = the record share that breaks a tie last (sets won % for tennis /
 *  padel, games won % otherwise) — the set / game ratio's order. */
export function racketResultStats(share: 'setsPct' | 'gamesPct'): StatDef[] {
  return [
    { key: 'matchesWon', label: 'Matches won', short: 'wins', one: 'win', leaderLabel: 'Most wins', source: 'derived', group: 'record',
      agg: { kind: 'result', count: ['W'] }, tieBreak: [{ key: 'winPct', better: 'higher' }, { key: share, better: 'higher' }] },
    { key: 'winPct', label: 'Win %', leaderLabel: 'Best win %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 },
      agg: { kind: 'result', count: ['W'], of: ['W', 'L', 'D', 'T'], scale: 100, dp: 0, qualifier: RACKET_MINIMUMS.matches },
      tieBreak: [{ key: 'matchesWon', better: 'higher' }, { key: share, better: 'higher' }] },
  ];
}

/** SD-27 — racket leaderboard categories (by results, never rally points). */
export function racketLeaders(sets: boolean, extra: string[] = []): string[] {
  return ['matchesWon', 'winPct', ...(sets ? ['setsWon'] : []), 'gamesWon', ...(sets ? [] : ['gamesPct']), ...extra, 'srvPtsPct', ...(sets ? ['holdPct', 'bpWonPct'] : [])];
}

/** SD-27 — the racket Player of the Tournament: most matches won, then the
 *  best win %, then the set ratio (games ratio where there are no sets). */
export function racketMvp(sets: boolean): MvpDef {
  return { stat: 'matchesWon', tieBreak: [{ key: 'winPct', better: 'higher' }, { key: sets ? 'setsPct' : 'gamesPct', better: 'higher' }] };
}

/** SD-27 — the racket tournament slot after the Player of the Tournament:
 *  the best service points won % (min service points). Tournament only. */
export const BEST_SERVER: AwardDef = {
  stat: 'srvPtsPct', icon: '🎯', label: 'Best server', match: false, tieBreak: [{ key: 'srvPtsWon', better: 'higher' }],
};
const pair = (key: string, label: string, a: string | string[], b: string | string[]): StatDef => ({
  key, label, source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a, b },
});

/** SD-24 — the racket career's match-play figures over the SD-19 record keys:
 *  W-L pairs and won %. `sets` adds sets and tiebreaks (tennis, padel). */
export function racketCareerStats(sets: boolean): StatDef[] {
  return [
    ...(sets ? [
      pair('setsWL', 'Sets W-L', 'setsWon', 'setsLost'),
      rate('setsPct', 'Sets won %', 'setsWon', ['setsWon', 'setsLost']),
    ] : []),
    pair('gamesWL', 'Games W-L', 'gamesWon', 'gamesLost'),
    rate('gamesPct', 'Games won %', 'gamesWon', ['gamesWon', 'gamesLost'], { qualifier: RACKET_MINIMUMS.matches, leaderLabel: 'Best games won %', tieBreak: [{ key: 'gamesWon', better: 'higher' }] }),
    pair('ptsWL', 'Points W-L', 'ptsWon', 'ptsLost'),
    rate('ptsPct', 'Points won %', 'ptsWon', ['ptsWon', 'ptsLost']),
    pair('decidersWL', 'Deciders W-L', 'decidersWon', ['decidersPlayed', '-decidersWon']),
    ...(sets ? [pair('tiebreaksWL', 'Tiebreaks W-L', 'tiebreaksWon', ['tiebreaksPlayed', '-tiebreaksWon'])] : []),
  ];
}

/** SD-24 — the racket career sections (the record / partner / titles block
 *  above them is the shared framework's, src/data/career.ts). `serveFirst`
 *  rows (tennis aces / double faults) lead the serve section. */
export function racketSections(sets: boolean, serveFirst: { stat: string }[] = []): SectionDef[] {
  return [
    { id: 'match', title: 'Match play', rows: [
      ...(sets ? [{ stat: 'setsWL' }, { stat: 'setsPct' }] : []),
      { stat: 'gamesWL' }, { stat: 'gamesPct' }, { stat: 'ptsWL' }, { stat: 'ptsPct' },
      { stat: 'decidersWL' }, ...(sets ? [{ stat: 'tiebreaksWL' }] : []),
    ] },
    { id: 'serve', title: 'Serve & return', rows: [
      ...serveFirst,
      { stat: 'srvPtsPct' }, { stat: 'rcvPtsPct' },
      ...(sets ? [{ stat: 'holdPct' }, { stat: 'breakPct' }, { stat: 'bpSavedPct' }, { stat: 'bpWonPct' }] : []),
    ] },
    { id: 'points', title: 'Scoring', rows: [{ stat: 'points', label: 'Points scored' }] },
  ];
}

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
    rate('srvPtsPct', 'Service points won %', 'srvPtsWon', 'srvPts', { qualifier: RACKET_MINIMUMS.srvPts, leaderLabel: 'Service points won %', tieBreak: [{ key: 'srvPtsWon', better: 'higher' }] }),
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
      rate('holdPct', 'Service games held %', 'svcHeld', 'svcGames', { qualifier: RACKET_MINIMUMS.svcGames, leaderLabel: 'Service games held %', tieBreak: [{ key: 'svcHeld', better: 'higher' }] }),
      rate('breakPct', 'Return games won %', 'breaks', 'rtnGames'),
      rate('bpSavedPct', 'Break points saved %', 'bpSaved', 'bpFaced'),
      rate('bpWonPct', 'Break points converted %', 'bpWon', 'bpOpps', { qualifier: RACKET_MINIMUMS.bpOpps, leaderLabel: 'BP converted %', tieBreak: [{ key: 'bpWon', better: 'higher' }] }),
    ] : []),
  ];
}

export function rallyStats<S extends SportId>(sport: S, icon: string, opts: { sets?: boolean } = {}): SportStatSchema<S> {
  return {
    sport,
    /** SD-25 — career split chips (line context) */
    splits: ['discipline', 'format', 'tournament', 'season', 'opponent'],
    stats: [
      { ...POINTS, group: 'points', weight: 1 },
      ...racketRecordStats(!!opts.sets, true), ...racketServeStats(!!opts.sets), ...racketCareerStats(!!opts.sets),
      ...racketResultStats(opts.sets ? 'setsPct' : 'gamesPct'),
    ],
    sections: racketSections(!!opts.sets),
    careerView: 'sections',
    box: [{ columns: ['points'] }],
    // SD-27 (GEN-14): racket leaders and awards rank by results, not rally
    // points; "Top scorer" is retired (kept so published awards keep their icon)
    leaders: racketLeaders(!!opts.sets),
    mvp: racketMvp(!!opts.sets),
    headline: ['points'],
    awards: [{ stat: 'points', icon, label: 'Top scorer', match: false, tournament: false }, BEST_SERVER],
  };
}
