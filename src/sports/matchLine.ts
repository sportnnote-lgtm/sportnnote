/**
 * SD-20 — the set/game scoreline for a stored match, for every result surface
 * outside the live screen (cards, bracket cells, series legs, results lists,
 * team head-to-head, profile history). One call: the sport's plugin + the
 * pure `matchScoreLine` (completed sets; "6-4, 3-2 ret." for a match closed by
 * hand; "w/o"). '' for sports without a line score or a match not finished.
 */
import type { Match } from '../core/types';
import { manualResultLine } from '../core/matchResult';
import { getSport } from './registry';
import { matchScoreLine, type Side } from './scoreline';

type MatchLike = Pick<Match, 'sport' | 'status' | 'state' | 'result' | 'walkover'>;

export function matchLine(m: MatchLike, perspective?: Side): string {
  if (m.status !== 'completed' && !m.walkover) return '';
  const plugin = getSport(m.sport);
  if (!plugin?.scoreLine) return '';
  return matchScoreLine(plugin, m.state, { result: m.result, walkover: m.walkover, perspective });
}

/** The line read from `teamId`'s side (history / head-to-head rows). */
export function matchLineFor(m: MatchLike & Pick<Match, 'homeTeam' | 'awayTeam'>, teamId: string): string {
  return matchLine(m, m.awayTeam.id === teamId ? 'away' : 'home');
}

/** "Asha won — Bina retired" (racket) / "X awarded the match" — the words for a
 *  match closed by hand, in the sport's own terms. */
export function resultWords(m: Pick<Match, 'sport'> & { result: NonNullable<Match['result']> }, home: string, away: string): string {
  return manualResultLine(m.result, home, away, { retireTerms: !!getSport(m.sport)?.retireTerms });
}
