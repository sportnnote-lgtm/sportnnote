/** Manually-maintained standings ("Scorecard" mode) — rows the organizer edits by
 *  hand instead of the table being auto-computed from match results. Stored on the
 *  tournament's `formats[sport]` JSONB under a reserved key, keyed by division
 *  ('' = no division), so it's zero-migration like the structure config. Pure. */
import type { SportFormat } from '../core/types';

export interface ManualStandingRow {
  id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
}

// SportFormat values are scalars (string|number|boolean), so the per-division rows
// are stored JSON-encoded under this key and parsed back out.
const KEY = 'manualRows';

function allRows(fmt?: Record<string, unknown> | null): Record<string, ManualStandingRow[]> {
  const raw = fmt?.[KEY];
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ManualStandingRow[]>) : {};
  } catch {
    return {};
  }
}

/** The saved manual rows for a sport + division (empty array if none). */
export function manualRows(fmt?: Record<string, unknown> | null, division = ''): ManualStandingRow[] {
  const rows = allRows(fmt)[division];
  return Array.isArray(rows) ? rows : [];
}

/** Merge a new set of rows for one division into a sport's format (keeping the
 *  other divisions' rows and every other format key). */
export function withManualRows(fmt: SportFormat | undefined, division: string, rows: ManualStandingRow[]): SportFormat {
  const all = { ...allRows(fmt) };
  all[division] = rows;
  return { ...(fmt ?? {}), [KEY]: JSON.stringify(all) };
}

/** A blank row with a fresh id. */
export function blankManualRow(): ManualStandingRow {
  return { id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: '', played: 0, won: 0, drawn: 0, lost: 0, points: 0 };
}

/** Rank rows for display: points desc, then wins desc, then name. */
export function rankManualRows(rows: ManualStandingRow[]): ManualStandingRow[] {
  return [...rows].sort((a, b) => b.points - a.points || b.won - a.won || a.name.localeCompare(b.name));
}
