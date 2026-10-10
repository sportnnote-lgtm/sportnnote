/** The public text for a match closed by hand (parity #04). Pure. */
import type { MatchResult } from './types';

/** `retireTerms` (racket sports, SD-20): Conceded reads as a retirement and
 *  Awarded as a default — "Asha won — Bina retired", "Asha won by default". */
export function manualResultLine(r: MatchResult, home: string, away: string, opts: { retireTerms?: boolean } = {}): string {
  const reason = r.reason?.trim();
  if (opts.retireTerms && (r.kind === 'conceded' || r.kind === 'awarded')) {
    const w = r.winner === 'home' ? home : away;
    const l = r.winner === 'home' ? away : home;
    const retired = r.kind === 'conceded' || /retir/i.test(reason ?? '');
    if (retired) return `${w} won — ${l} retired${reason && !/^retired?$/i.test(reason) ? ` (${reason})` : ''}`;
    return `${w} won by default${reason ? ` — ${reason}` : ''}`;
  }
  const winner = r.winner === 'home' ? home : r.winner === 'away' ? away : '';
  const loser = r.winner === 'home' ? away : r.winner === 'away' ? home : '';
  switch (r.kind) {
    case 'no_result': return `No result${reason ? ` — ${reason}` : ''}`;
    case 'abandoned': return `Match abandoned${reason ? ` — ${reason}` : ''}`;
    case 'draw': return 'Match drawn';
    case 'tie': return 'Match tied';
    case 'conceded': return `${winner} won — ${loser} conceded`;
    case 'awarded': return `${winner} awarded the match${reason ? ` — ${reason}` : ''}`;
  }
}

/** Abandoned / no result: nobody won, and it doesn't count as a normal game. */
export const isNoResult = (r?: MatchResult | null) => !!r && (r.kind === 'no_result' || r.kind === 'abandoned');

/** What a live-state snapshot may write to a match. A match closed by hand keeps
 *  its result: it stays completed (never back to live) and its winner / won
 *  flags are not re-derived — whatever `completed` the caller says (a #05
 *  correction, or a stale second device). */
export function snapshotOutcome(result: MatchResult | null | undefined, completed: boolean): { status: 'completed' | 'live'; rederive: boolean } {
  if (result) return { status: 'completed', rederive: false };
  return { status: completed ? 'completed' : 'live', rederive: completed };
}
