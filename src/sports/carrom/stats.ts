/** SD-15 — carrom's stat schema (see ../statSchema.ts). PURE. */
import type { SportStatSchema, StatDef } from '../statSchema.ts';
import { HIGH_POINTS, POINTS } from '../sharedStats.ts';

const rec = (key: string, label: string, short: string, one: string): StatDef =>
  ({ key, label, short, one, group: 'record', coverage: 'present' });

export const carromStats: SportStatSchema<'carrom'> = {
  sport: 'carrom',
  /** SD-25 — career split chips (line context) */
  splits: ['discipline', 'tournament', 'season', 'opponent'],
  stats: [
    // SD-27: level totals go to more boards, then more queens (and back)
    { ...POINTS, group: 'scoring', weight: 1, tieBreak: [{ key: 'boards', better: 'higher' }, { key: 'queens', better: 'higher' }] },
    { key: 'boards', label: 'Boards', short: 'boards', one: 'board', group: 'scoring', weight: 1, matchSummary: true, tieBreak: [{ key: 'points', better: 'higher' }] },
    { key: 'queens', label: 'Queens', short: 'queens', one: 'queen', group: 'scoring', weight: 2, matchSummary: true, tieBreak: [{ key: 'points', better: 'higher' }] },
    // SD-37 — the record keys carrom statTotals writes on every line (both
    // doubles partners alike; never credited live). 'present': tracked
    // wherever they're on the line, so older lines stay out of the rates.
    rec('gamesWon', 'Games won', 'games won', 'game won'),
    rec('gamesLost', 'Games lost', 'games lost', 'game lost'),
    rec('boardsPlayed', 'Boards played', 'boards played', 'board played'),
    rec('whiteSlams', 'White slams', 'white slams', 'white slam'),
    rec('blackSlams', 'Black slams', 'black slams', 'black slam'),
    rec('zeroGames', '25-0 games', '25-0 games', '25-0 game'),
    { key: 'pointsPerMatch', label: 'Points per match', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'perGame', key: 'points', dp: 1, qualifier: { games: 2, unit: { label: 'matches', one: 'match' } } },
      tieBreak: [{ key: 'points', better: 'higher' }] },
    { ...HIGH_POINTS },
    // SD-117c (CR-04) — the break, once the toss is recorded, and the Queen
    // covered by the side that lost the board ('keyed': only matches that
    // tracked them carry the keys; older lines read "not tracked")
    { key: 'boardBreaks', label: 'Boards broken', short: 'boards broken', one: 'board broken', group: 'record', coverage: 'keyed' },
    { key: 'boardBreaksWon', label: 'Won on own break', short: 'won on own break', one: 'won on own break', group: 'record', coverage: 'keyed' },
    { key: 'breakWinPct', label: 'Own-break win %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'boardBreaksWon', den: 'boardBreaks', scale: 100, dp: 0 } },
    { key: 'lostQueens', label: 'Queens covered, board lost', short: 'queens lost', one: 'queen lost', group: 'scoring', coverage: 'keyed' },
    // SD-86 (CR-05) — the career remainder over the SD-37 keys
    { key: 'gamesWL', label: 'Games W-L', source: 'derived', group: 'record', format: { unit: 'figure' }, agg: { kind: 'pair', a: 'gamesWon', b: 'gamesLost' } },
    { key: 'boardPct', label: 'Boards won %', source: 'derived', group: 'record', format: { unit: 'percent', dp: 0 }, agg: { kind: 'rate', num: 'boards', den: 'boardsPlayed', scale: 100, dp: 0, over: 'recorded' } },
    { key: 'pointsPerBoard', label: 'Points per board won', source: 'derived', group: 'scoring', format: { unit: 'decimal', dp: 1 }, agg: { kind: 'rate', num: 'points', den: 'boards', dp: 1, over: 'recorded' } },
    { key: 'slams', label: 'Slams', short: 'slams', one: 'slam', source: 'derived', group: 'record', agg: { kind: 'sum', keys: ['whiteSlams', 'blackSlams'] } },
  ],
  // SD-86: rates over lines statTotals wrote (capped points, boards played) —
  // an older line (finisher-only, uncapped) stays out of them
  filters: { recorded: (l) => typeof l.stats?.boardsPlayed === 'number' },
  sections: [
    { id: 'match', title: 'Match play', rows: [{ stat: 'gamesWL' }, { stat: 'boardPct' }, { stat: 'zeroGames' }, { stat: 'boardBreaks' }, { stat: 'breakWinPct' }] },
    { id: 'scoring', title: 'Scoring', rows: [
      { stat: 'points' }, { stat: 'pointsPerMatch' }, { stat: 'pointsPerBoard' }, { stat: 'boards', label: 'Boards won' }, { stat: 'queens' }, { stat: 'lostQueens' },
      { stat: 'whiteSlams' }, { stat: 'blackSlams' }, { stat: 'highPoints', label: 'Best match' },
    ] },
  ],
  careerView: 'sections',
  box: [{ columns: ['points', 'boards', 'queens'] }],
  compare: ['points', 'boards', 'queens'],
  // SD-27: boards and points per match (min matches) join points and queens
  leaders: ['points', 'boards', 'queens', 'pointsPerMatch'],
  headline: ['points', 'boards', 'queens'],
  awards: [
    { stat: 'points', icon: '🎱', label: 'Top scorer' },
    { stat: 'queens', icon: '👑', label: 'Queens' },
  ],
};
