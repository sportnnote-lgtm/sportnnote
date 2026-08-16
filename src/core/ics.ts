/** iCalendar (.ics) export — the portable way to push events into any device
 *  calendar (Apple / Google / Outlook). On web we download the file; on native
 *  we share it (the OS offers "Add to Calendar"). Dependency-free.
 *
 *  A first-class native integration could instead use expo-calendar to write
 *  directly into a chosen calendar; .ics keeps it cross-platform & verifiable. */
import { Platform, Share } from 'react-native';

export interface CalEvent {
  uid: string;
  title: string;
  /** ISO timestamp ("…T…") for a timed event, or "YYYY-MM-DD" for all-day. */
  start: string;
  /** same forms; optional. For all-day, treated as the last day (inclusive). */
  end?: string;
  location?: string;
  description?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const isDateOnly = (s: string) => !s.includes('T');

// UTC compact stamp, e.g. 20260618T103000Z
const stampUTC = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dateCompact = (ymd: string) => ymd.replace(/-/g, '');
const addDayCompact = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
};
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function vevent(e: CalEvent, dtstamp: string): string {
  const lines = [`BEGIN:VEVENT`, `UID:${e.uid}`, `DTSTAMP:${dtstamp}`, `SUMMARY:${esc(e.title)}`];
  if (isDateOnly(e.start)) {
    lines.push(`DTSTART;VALUE=DATE:${dateCompact(e.start)}`);
    // DTEND is exclusive for all-day events → day after the (inclusive) end.
    lines.push(`DTEND;VALUE=DATE:${addDayCompact(e.end ?? e.start)}`);
  } else {
    lines.push(`DTSTART:${stampUTC(new Date(e.start))}`);
    const end = e.end ? new Date(e.end) : new Date(new Date(e.start).getTime() + 90 * 60000);
    lines.push(`DTEND:${stampUTC(end)}`);
  }
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  lines.push(`END:VEVENT`);
  return lines.join('\r\n');
}

/** Build a VCALENDAR document from a list of events. */
export function buildICS(events: CalEvent[]): string {
  const dtstamp = stampUTC(new Date());
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SportnNote//Calendar//EN',
    'CALSCALE:GREGORIAN',
    ...events.map((e) => vevent(e, dtstamp)),
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Export events to the device calendar: download (.ics) on web, share on native. */
export async function exportToCalendar(filename: string, events: CalEvent[]): Promise<void> {
  if (events.length === 0) return;
  const ics = buildICS(events);
  if (Platform.OS === 'web') {
    // Use globals via `any` so we don't pull DOM types into the RN build.
    const g: any = globalThis;
    const blob = new g.Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = g.URL.createObjectURL(blob);
    const a = g.document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
    g.document.body.appendChild(a);
    a.click();
    a.remove();
    g.URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: filename, message: ics });
}
