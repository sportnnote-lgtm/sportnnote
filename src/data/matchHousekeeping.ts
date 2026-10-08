/**
 * Match housekeeping (parity #13) — pure helpers for clone, delete/reset and
 * breaks. No I/O: the repos and screens call these.
 */
import { mergeMatchConfig, stripInternal, type Format } from '../core/matchConfig.ts';
import type { Match, MatchStatus, SportId } from '../core/types';

/* ---------------------------------- Clone --------------------------------- */

export interface CloneDraft {
  sport: SportId;
  homeTeamId: string;
  awayTeamId: string;
  venueName?: string;
  venueMapsUrl?: string;
  streamUrl?: string;
  /** the EFFECTIVE rules (tournament format merged with the match's override),
   *  minus internal `__*` keys — so a clone of a tournament match keeps its overs. */
  format?: Format;
}

/** What a "Clone match" form is pre-filled with. Always a friendly: no
 *  tournament, stage, officials, result or POTM — and the toss is re-done. */
export function cloneDraft(
  match: Pick<Match, 'sport' | 'homeTeam' | 'awayTeam' | 'venueName' | 'venueMapsUrl' | 'streamUrl' | 'format'>,
  tourFormat?: Format | null,
): CloneDraft {
  const merged = stripInternal(mergeMatchConfig(tourFormat, match.format as Format | undefined));
  return {
    sport: match.sport,
    homeTeamId: match.homeTeam.id,
    awayTeamId: match.awayTeam.id,
    venueName: match.venueName,
    venueMapsUrl: match.venueMapsUrl,
    streamUrl: match.streamUrl,
    format: Object.keys(merged).length ? merged : undefined,
  };
}

/* --------------------------------- Breaks --------------------------------- */

export const BREAK_KINDS = ['drinks', 'rain', 'interval', 'bad_light', 'injury', 'stumps', 'other'] as const;
export type BreakKind = (typeof BREAK_KINDS)[number];

export const BREAK_LABELS: Record<BreakKind, string> = {
  drinks: 'Drinks', rain: 'Rain', interval: 'Interval', bad_light: 'Bad light', injury: 'Injury', stumps: 'Stumps', other: 'Other',
};

export interface MatchBreak { kind: BreakKind; note?: string; since: string }

/** Read `format.__break` defensively (an unknown kind reads as "other"). */
export function readBreak(format?: Record<string, unknown> | null): MatchBreak | undefined {
  const b = format?.__break as Partial<MatchBreak> | null | undefined;
  if (!b || typeof b !== 'object' || !b.since) return undefined;
  const kind = (BREAK_KINDS as readonly string[]).includes(String(b.kind)) ? (b.kind as BreakKind) : 'other';
  return { kind, note: b.note ? String(b.note) : undefined, since: String(b.since) };
}

/** "Rain break" / "Stumps" / "Other: power cut". */
export function breakLabel(b: MatchBreak): string {
  if (b.kind === 'other') return b.note ? b.note : 'Break';
  if (b.kind === 'stumps') return 'Stumps';
  return `${BREAK_LABELS[b.kind]} break`;
}

/* ----------------------------- Delete / reset ----------------------------- */

/** How long after the last scoring event a completed friendly can still be deleted. */
export const DELETE_WINDOW_MIN = 30;
const PRE_MATCH: MatchStatus[] = ['scheduled', 'postponed', 'cancelled'];

export interface DeleteVerdict {
  verdict: 'delete' | 'reset' | 'none';
  /** minutes left in the played-match window (undefined when no window applies) */
  minutesLeft?: number;
}

/** What the Danger zone offers. Mirrors the "delete match" RLS policy
 *  (20261019121300): pre-match → delete; a live friendly → delete; a friendly
 *  completed < 30 min ago → delete; a played tournament fixture → reset (never a
 *  hole in the fixtures / bracket); otherwise nothing. */
export function deleteVerdict(
  m: { status: MatchStatus; tournamentId?: string | null; lastActivityAt?: number | string | null },
  now: number = Date.now(),
): DeleteVerdict {
  if (PRE_MATCH.includes(m.status)) return { verdict: 'delete' };
  const played = m.tournamentId ? 'reset' : 'delete';
  if (m.status === 'live') return { verdict: played };
  if (m.status === 'completed') {
    const at = m.lastActivityAt == null ? NaN : typeof m.lastActivityAt === 'number' ? m.lastActivityAt : new Date(m.lastActivityAt).getTime();
    if (!Number.isFinite(at)) return { verdict: 'none' };
    const left = DELETE_WINDOW_MIN - (now - at) / 60000;
    if (left > 0) return { verdict: played, minutesLeft: Math.max(1, Math.ceil(left)) };
  }
  return { verdict: 'none' };
}
