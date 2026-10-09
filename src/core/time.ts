/**
 * Timezone-aware time display.
 *
 * Platform rule: match times are STORED as an absolute instant (UTC ISO) and
 * DISPLAYED in the *viewer's* own timezone. So a London game shows in IST for a
 * viewer in India, and in London time for the Londoner — same instant, each sees
 * their own clock.
 *
 * The viewer picks their timezone (default India / IST for the launch, and they
 * can change it when they travel). It's cached locally so it follows the app
 * offline; a `profiles.time_zone` column (migration 0001) is the cross-device
 * source of truth once signed in.
 *
 * Formatting uses `Intl.DateTimeFormat` with a `timeZone`, which is fully
 * DST-correct on web and any engine with ICU. On React Native (Hermes) arbitrary
 * IANA zones need the `@formatjs/intl-datetimeformat` polyfill — added when we
 * scale past a single launch timezone; IST works via the fallback until then.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export interface TimeZoneOption { id: string; label: string }

/** Curated picker list — the launch zone first, then common ones. Extend freely;
 *  any IANA id works once the device has full Intl (or the polyfill). */
export const TIME_ZONES: TimeZoneOption[] = [
  { id: 'Asia/Kolkata', label: 'India — IST (GMT+5:30)' },
  { id: 'Asia/Dubai', label: 'UAE — Dubai (GMT+4)' },
  { id: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
  { id: 'Europe/London', label: 'UK — London' },
  { id: 'Europe/Berlin', label: 'Europe — Berlin' },
  { id: 'America/New_York', label: 'US East — New York' },
  { id: 'America/Los_Angeles', label: 'US West — Los Angeles' },
  { id: 'Australia/Sydney', label: 'Australia — Sydney' },
  { id: 'UTC', label: 'UTC' },
];

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata'; // India launch
const KEY = 'sportfolio.timeZone.v1';

let zone = DEFAULT_TIME_ZONE;
const listeners = new Set<() => void>();
const emit = () => { void AsyncStorage.setItem(KEY, zone).catch(() => {}); listeners.forEach((l) => l()); };

export async function hydrateTimeZone(): Promise<void> {
  try { const raw = await AsyncStorage.getItem(KEY); if (raw) { zone = raw; listeners.forEach((l) => l()); } } catch { /* keep default */ }
}

export const timeZoneStore = {
  get: () => zone,
  set(z: string) { if (z && z !== zone) { zone = z; emit(); } },
  subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  getSnapshot: () => zone,
};

/** Reactive current timezone — components re-render when the user changes it. */
export function useUserTimeZone(): string {
  return useSyncExternalStore(timeZoneStore.subscribe, timeZoneStore.getSnapshot, timeZoneStore.getSnapshot);
}

/** The label for the current (or a given) zone, for the picker/settings. */
export const zoneLabel = (z: string = zone): string => TIME_ZONES.find((o) => o.id === z)?.label ?? z;

// ---- Formatters: pass the UTC ISO instant; render it in the viewer's zone ----
function fmt(iso: string, z: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: z, ...opts }).format(d);
  } catch {
    // Engine without IANA timezone support → fall back to the device's local clock.
    return new Intl.DateTimeFormat('en-GB', opts).format(d);
  }
}

/** "Thu, 10 Jul, 21:00 GMT+5:30" — date, time and the viewer's zone, so it's
 *  unambiguous whose clock it is. */
export function formatDateTime(iso: string, z: string = zone): string {
  return fmt(iso, z, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}
/** Just the time in the viewer's zone, e.g. "21:00". */
export function formatTime(iso: string, z: string = zone): string {
  return fmt(iso, z, { hour: '2-digit', minute: '2-digit' });
}
/** Compact "Thu, 21:00" for cards — weekday + time in the viewer's zone. */
export function formatShort(iso: string, z: string = zone): string {
  return fmt(iso, z, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
/** Date only in the viewer's zone. */
export function formatDate(iso: string, z: string = zone): string {
  return fmt(iso, z, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
/** The short zone name for the current/given zone (e.g. "GMT+5:30"). */
export function zoneAbbrev(z: string = zone): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: z, timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? z;
  } catch { return z; }
}

/** The zone's UTC offset (ms, east positive) at a given instant, read off
 *  `formatToParts` — DST-aware wherever the engine has full Intl. */
function zoneOffsetMs(utcMs: number, z: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: z, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** A wall-clock date + time IN A ZONE ('2026-10-12', '16:30', 'Asia/Kolkata')
 *  → the absolute UTC ISO instant ('2026-10-12T11:00:00.000Z'). DST-safe: the
 *  offset is re-read at the candidate instant, so a time just after a switch
 *  lands on the right side of it. A wall time skipped by a spring-forward gap
 *  resolves to the instant after the gap. Engines without IANA zones fall back
 *  to the device clock. */
export function wallTimeToIso(date: string, time: string, z: string = zone): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  try {
    const off1 = zoneOffsetMs(wall, z);
    let t = wall - off1;
    const off2 = zoneOffsetMs(t, z);
    if (off2 !== off1) {
      const t2 = wall - off2;
      // Only accept the re-read when it round-trips (otherwise we're in a gap:
      // keep the earlier-offset reading, which falls after the gap).
      t = zoneOffsetMs(t2, z) === off2 ? t2 : t;
    }
    return new Date(t).toISOString();
  } catch {
    return new Date(y, mo - 1, d, h || 0, mi || 0).toISOString();
  }
}
