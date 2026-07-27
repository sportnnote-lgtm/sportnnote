/** Friendly date formatting for the UI (day headers, date ranges). Pure — no
 *  Date.now()/locale surprises: parses a `YYYY-MM-DD` string directly. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-07-27" → "Mon, 27 Jul" — friendly single-day form (headers). */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "2026-07-27" → "27 Jul" — weekday-less form, for date ranges. */
export function formatDayShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return !m || !d ? iso : `${d} ${MONTHS_SHORT[m - 1]}`;
}
