/** Friendly date formatting for the UI (day headers, date ranges). Pure — no
 *  Date.now()/locale surprises: parses a `YYYY-MM-DD` string directly. A full
 *  timestamp is first turned into its day IN THE APP'S ZONE (SD-150), not the
 *  UTC slice. */
import { localDay, timeZoneStore } from './time.ts';

const dayOf = (iso: string, zone?: string): string => (iso.length > 10 ? localDay(iso, zone ?? timeZoneStore.get()) : iso);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-07-27" → "Mon, 27 Jul" — friendly single-day form (headers). */
export function formatDay(iso: string, zone?: string): string {
  // Accept a full timestamp too ("2026-10-05T20:22:04Z") — its day in the zone.
  const [y, m, d] = dayOf(iso, zone).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "2026-07-27" → "27 Jul" — weekday-less form, for date ranges. */
export function formatDayShort(iso: string, zone?: string): string {
  const [, m, d] = dayOf(iso, zone).slice(0, 10).split('-').map(Number);
  return !m || !d ? iso : `${d} ${MONTHS_SHORT[m - 1]}`;
}
