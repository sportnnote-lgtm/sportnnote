/**
 * SD-154: read a meet's timetable, schedule and print sheets in the venue's
 * time zone — the tournament's `time_zone` (SD-150), else the app zone. Sets the
 * results engine's meet zone (data/results/timetable.ts) for this render and
 * returns it, so callers can put it in memo deps and show "Times are GST".
 */
import { eventZone, useUserTimeZone, zoneShortName } from '../core/time';
import { setMeetZone } from './results/timetable';

export function useMeetZone(t: { timeZone?: string } | null | undefined): { zone: string; short: string } {
  const viewer = useUserTimeZone();
  const zone = eventZone(t, viewer);
  setMeetZone(zone);
  return { zone, short: zoneShortName(zone) };
}
