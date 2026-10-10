/**
 * SD-31 / SD-40 — what each basketball play credits to a player's stat line.
 * PURE. ONE table used three ways, so they can never disagree:
 *   - the live attribution the controls (and voice) dispatch,
 *   - the reversal a timeline Remove dispatches (the same credits, negated),
 *   - `statTotals` (fieldTime.ts), which sums these over the event log.
 *
 * Keys (BK-03 / BK-05):
 *   points, freeThrowsMade / freeThrowsAtt, rebounds (+ oreb / dreb when the
 *   rebound was typed), assists, steals, blocks, turnovers, fouls, ejections;
 *   fgMade (every made field goal) and threesMade (made 3s); and only when
 *   "Track missed shots" is on (D8): fgAtt / threesAtt (a make logged with
 *   `fga`, and every miss) and fgMissed (every miss — FIBA EFF subtracts it).
 * A full-court "+1" is a free throw (SD-05), so a 1-point basket is a field
 * goal only in a half-court (first-to-N) game; in 3×3 the 2-pointer is the
 * arc shot, but 3P keys stay for real 3-point shots only.
 */
import type { Attribution } from '../types';
import type { BBEvent } from './events.ts';

export type Credits = Record<string, number>;

/** Is a made basket worth `points` a field goal? (Full court: a +1 is a FT.) */
export const isFieldGoal = (points: number, halfCourt: boolean): boolean => points >= 2 || (halfCourt && points === 1);

/** A made basket. `fga` = logged while misses were tracked (counts an attempt). */
export function makeCredits(points: number, halfCourt: boolean, fga = false): Credits {
  const c: Credits = { points };
  if (!isFieldGoal(points, halfCourt)) return c;
  c.fgMade = 1;
  if (fga) c.fgAtt = 1;
  if (points === 3) {
    c.threesMade = 1;
    if (fga) c.threesAtt = 1;
  }
  return c;
}

/** A missed field goal (always a tracked attempt). */
export function missCredits(points: number): Credits {
  return points === 3 ? { fgMissed: 1, fgAtt: 1, threesAtt: 1 } : { fgMissed: 1, fgAtt: 1 };
}

/** A free throw — the credits the controls always sent. */
export const ftCredits = (made: boolean): Credits => (made ? { points: 1, freeThrowsMade: 1, freeThrowsAtt: 1 } : { freeThrowsAtt: 1 });

/** A rebound; the off / def split only when the scorer picked it. */
export const reboundCredits = (type?: 'off' | 'def'): Credits =>
  type === 'off' ? { rebounds: 1, oreb: 1 } : type === 'def' ? { rebounds: 1, dreb: 1 } : { rebounds: 1 };

const SIMPLE: Partial<Record<BBEvent['type'], string>> = {
  assist: 'assists', steal: 'steals', block: 'blocks', turnover: 'turnovers', foul: 'fouls', eject: 'ejections',
};

/** What one logged event credits its player ({} = nothing: a sub, a timeout).
 *  `tracked` = the match tracks missed shots (totals.ts `shotsTracked`): then
 *  every made field goal is an attempt too — also one logged before the
 *  scorer switched tracking on mid-match (FGA is never below FGM). */
export function eventCredits(e: BBEvent, halfCourt: boolean, tracked = e.fga === true): Credits {
  switch (e.type) {
    case 'score': return makeCredits(e.points ?? 0, halfCourt, tracked);
    case 'miss': return missCredits(e.points ?? 2);
    case 'freethrow': return ftCredits(e.made === true);
    case 'rebound': return reboundCredits(e.reboundType);
    default: {
      const k = SIMPLE[e.type];
      return k ? { [k]: 1 } : {};
    }
  }
}

/** Credits as an attribution: the first key is the stat (`by`), the rest ride
 *  in `extra` — exactly how useLiveMatch writes them. `sign` −1 = a reversal. */
export function creditAttribution(playerId: string, playerName: string | undefined, c: Credits, sign: 1 | -1 = 1): Attribution | undefined {
  const entries = Object.entries(c).filter(([, v]) => v !== 0);
  if (!entries.length) return undefined;
  const [[stat, by], ...rest] = entries;
  return {
    playerId, stat, by: sign * by, ...(playerName ? { playerName } : {}),
    ...(rest.length ? { extra: Object.fromEntries(rest.map(([k, v]) => [k, sign * v])) } : {}),
  };
}
