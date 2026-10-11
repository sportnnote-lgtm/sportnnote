/**
 * Timezone-aware time display.
 *
 * Platform rule: match times are STORED as an absolute instant (UTC ISO) and
 * DISPLAYED in the *viewer's* own timezone. So a London game shows in IST for a
 * viewer in India, and in London time for the Londoner — same instant, each sees
 * their own clock.
 *
 * The app zone is seeded from the DEVICE on first run (SD-150) — falling back to
 * India / IST only when the device won't say — and the user can change it in
 * Settings → Region. It's cached locally so it follows the app offline, and
 * written to `profiles.time_zone` (data/profileRegion.ts) so reminder emails use
 * the same clock.
 *
 * Every "day" and "today" is computed IN A ZONE (`localDay`, `todayIn`), never
 * from the UTC slice of an ISO string. A tournament can carry its own venue zone
 * (`tournaments.time_zone`, see `eventZone`).
 *
 * Engine support: `Intl.DateTimeFormat` with a `timeZone` is DST-correct on web
 * and on Hermes (RN 0.85: Android via java.util.TimeZone/ICU, iOS via
 * NSTimeZone — both implement `timeZone`, `resolvedOptions().timeZone` and
 * `formatToParts`). No polyfill is bundled. Offsets are read with a
 * `format()`-string fallback in case an engine's `formatToParts` misbehaves,
 * and `intlZonesWork()` is a startup self-check (telemetry/diagnostics).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { COUNTRY_ORDER, REGIONS, deviceTimeZone, regionStore, type CountryCode } from './region.ts';

export interface TimeZoneOption { id: string; label: string }

/** Curated picker list — every zone of every supported country, then a few
 *  common others. Any IANA id works (Settings → Region → "Other…"). */
export const TIME_ZONES: TimeZoneOption[] = [
  ...COUNTRY_ORDER.flatMap((c) => REGIONS[c].zones.map((z) => ({ id: z.id, label: REGIONS[c].zones.length > 1 ? `${REGIONS[c].name} — ${z.label}` : `${REGIONS[c].name} (${z.label.replace(/^.*\(|\)$/g, '')})` }))),
  { id: 'Asia/Riyadh', label: 'Saudi Arabia (AST)' },
  { id: 'Asia/Bahrain', label: 'Bahrain (AST)' },
  { id: 'Asia/Kuwait', label: 'Kuwait (AST)' },
  { id: 'Asia/Muscat', label: 'Oman (GST)' },
  { id: 'Europe/Berlin', label: 'Europe — Berlin (CET)' },
  { id: 'UTC', label: 'UTC' },
];

/** Zones grouped by country for the picker (country order = launch order). */
export function zonesByCountry(): { country: CountryCode; name: string; flag: string; zones: TimeZoneOption[] }[] {
  return COUNTRY_ORDER.map((c) => ({ country: c, name: REGIONS[c].name, flag: REGIONS[c].flag, zones: REGIONS[c].zones }));
}

/** Every IANA zone the engine knows (web/V8; Hermes may not implement
 *  `Intl.supportedValuesOf` — then just the curated list). */
export function allTimeZones(): string[] {
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const list = f ? f('timeZone') : [];
    if (list.length) return list;
  } catch { /* not supported */ }
  return TIME_ZONES.map((z) => z.id);
}

/** True when `z` is a zone this engine can format in. */
export function isValidTimeZone(z: string | undefined | null): z is string {
  if (!z) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }).format(0); return true; } catch { return false; }
}

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata'; // fallback when the device won't say
const KEY = 'sportfolio.timeZone.v1';

let zone = DEFAULT_TIME_ZONE;
const listeners = new Set<() => void>();
const emit = () => { void AsyncStorage.setItem(KEY, zone).catch(() => {}); listeners.forEach((l) => l()); };

/** Old IANA aliases some devices still report → the current id (so the
 *  picker highlights the right chip). */
const ZONE_ALIASES: Record<string, string> = { 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Katmandu': 'Asia/Kathmandu', 'Etc/UTC': 'UTC', 'Etc/GMT': 'UTC' };
export const canonicalZone = (z: string): string => ZONE_ALIASES[z] ?? z;

/** The zone a fresh install starts in: the device's own (pass
 *  `deviceTimeZone()`; null/undefined = unknown), else IST. */
export function initialTimeZone(device: string | null | undefined): string {
  return isValidTimeZone(device) ? canonicalZone(device) : DEFAULT_TIME_ZONE;
}

export async function hydrateTimeZone(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) { zone = raw; listeners.forEach((l) => l()); return; }
    // First run: seed from the device and remember it (SD-150).
    zone = initialTimeZone(deviceTimeZone());
    emit();
  } catch { /* keep default */ }
}

export const timeZoneStore = {
  get: () => zone,
  set(z: string) { if (z && z !== zone) { zone = z; emit(); } },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getSnapshot: () => zone,
};

/** Reactive current timezone — components re-render when the user changes it. */
export function useUserTimeZone(): string {
  return useSyncExternalStore(timeZoneStore.subscribe, timeZoneStore.getSnapshot, timeZoneStore.getSnapshot);
}

/** The zone an event's times are entered and printed in: the tournament's own
 *  venue zone when it has one, else the viewer's. */
export const eventZone = (t: { timeZone?: string } | null | undefined, viewer: string = zone): string =>
  isValidTimeZone(t?.timeZone) ? t!.timeZone! : viewer;

/** The label for the current (or a given) zone, for the picker/settings. */
export const zoneLabel = (z: string = zone): string => {
  const known = TIME_ZONES.find((o) => o.id === z)?.label;
  if (known) return known;
  const short = zoneShortName(z);
  return short && short !== z ? `${z.replace(/_/g, ' ')} (${short})` : z.replace(/_/g, ' ');
};

// ---- Zone short names: "IST", "GST", "BST", "AEDT", "ET"… (no string hacks) ----

/** Short names engines don't give in English ("GMT+4" → "GST"). Values are
 *  [standard, daylight]; a zone without daylight saving repeats the first. */
const SHORT_NAMES: Record<string, [string, string]> = {
  'Asia/Kolkata': ['IST', 'IST'], 'Asia/Calcutta': ['IST', 'IST'],
  'Asia/Dubai': ['GST', 'GST'], 'Asia/Muscat': ['GST', 'GST'],
  'Asia/Qatar': ['AST', 'AST'], 'Asia/Riyadh': ['AST', 'AST'], 'Asia/Bahrain': ['AST', 'AST'], 'Asia/Kuwait': ['AST', 'AST'],
  'Europe/London': ['GMT', 'BST'],
  'Asia/Singapore': ['SGT', 'SGT'], 'Asia/Kuala_Lumpur': ['MYT', 'MYT'], 'Asia/Kuching': ['MYT', 'MYT'],
  'Australia/Sydney': ['AEST', 'AEDT'], 'Australia/Melbourne': ['AEST', 'AEDT'], 'Australia/Hobart': ['AEST', 'AEDT'],
  'Australia/Brisbane': ['AEST', 'AEST'], 'Australia/Adelaide': ['ACST', 'ACDT'], 'Australia/Darwin': ['ACST', 'ACST'],
  'Australia/Perth': ['AWST', 'AWST'],
  'America/New_York': ['EST', 'EDT'], 'America/Detroit': ['EST', 'EDT'], 'America/Chicago': ['CST', 'CDT'],
  'America/Denver': ['MST', 'MDT'], 'America/Phoenix': ['MST', 'MST'], 'America/Los_Angeles': ['PST', 'PDT'],
  'America/Anchorage': ['AKST', 'AKDT'], 'Pacific/Honolulu': ['HST', 'HST'],
  'Europe/Berlin': ['CET', 'CEST'], UTC: ['UTC', 'UTC'], 'Etc/UTC': ['UTC', 'UTC'],
};

/** "GMT+5:30" style offset label for a zone at an instant. */
function gmtLabel(offMs: number): string {
  if (!offMs) return 'GMT';
  const sign = offMs > 0 ? '+' : '-';
  const mins = Math.round(Math.abs(offMs) / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** The short name of a zone at an instant: IST, GST, BST/GMT, AEST/AEDT, EST/EDT…
 *  Daylight time is detected from the offset (the larger of January's and
 *  July's offsets). Unknown zones fall back to "GMT+x". */
export function zoneShortName(z: string = zone, at: string | number | Date = Date.now()): string {
  const t = new Date(at).getTime();
  let off: number;
  try { off = zoneOffsetMs(Number.isNaN(t) ? Date.now() : t, z); } catch { return z; }
  const names = SHORT_NAMES[z];
  if (!names) return gmtLabel(off);
  if (names[0] === names[1]) return names[0];
  const y = new Date(Number.isNaN(t) ? Date.now() : t).getUTCFullYear();
  const jan = zoneOffsetMs(Date.UTC(y, 0, 15), z), jul = zoneOffsetMs(Date.UTC(y, 6, 15), z);
  return off === Math.max(jan, jul) && jan !== jul ? names[1] : names[0];
}
/** @deprecated use zoneShortName — kept for callers that just want "the zone". */
export const zoneAbbrev = (z: string = zone): string => zoneShortName(z);

// ---- Formatters: pass the UTC ISO instant; render it in the viewer's zone ----
/** Times follow the region: 24-hour ("21:00") or 12-hour ("9:00 pm"). India
 *  stays 24-hour on cards, as before. */
const hourOpts = (): Intl.DateTimeFormatOptions => (regionStore.get().hour12 ? { hour: 'numeric', hour12: true } : { hour: '2-digit', hourCycle: 'h23' });

function fmt(iso: string, z: string, opts: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const o = 'hour' in opts ? { ...opts, ...hourOpts() } : opts;
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: z, ...o }).format(d);
  } catch {
    // Engine without IANA timezone support → fall back to the device's local clock.
    return new Intl.DateTimeFormat('en-GB', o).format(d);
  }
}

/** "Thu, 10 Jul, 21:00 IST" — date, time and the viewer's zone, so it's
 *  unambiguous whose clock it is. */
export function formatDateTime(iso: string, z: string = zone): string {
  const s = fmt(iso, z, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return s ? `${s} ${zoneShortName(z, iso)}` : '';
}
/** Just the time in the viewer's zone, e.g. "21:00" (or "9:00 pm"). */
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

// ---- Wall clock ↔ instant ----

interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number }

/** The wall-clock fields of an instant in a zone. Uses `formatToParts`, and
 *  falls back to parsing the en-US `format()` string ("10/12/2026, 16:30:00"). */
export function wallParts(utcMs: number, z: string): Wall {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: z, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const date = new Date(utcMs);
  try {
    const parts = f.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const w = { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
    if ([w.y, w.mo, w.d, w.h, w.mi, w.s].every(Number.isFinite) && w.y > 0) return w;
  } catch { /* fall through to format() */ }
  const m = /(\d{1,2})\D(\d{1,2})\D(\d{4})\D+(\d{1,2})\D(\d{2})\D(\d{2})/.exec(f.format(date));
  if (!m) throw new Error(`Cannot read wall time in ${z}`);
  return { y: +m[3], mo: +m[1], d: +m[2], h: +m[4] % 24, mi: +m[5], s: +m[6] };
}

/** The zone's UTC offset (ms, east positive) at a given instant — DST-aware
 *  wherever the engine has full Intl. */
function zoneOffsetMs(utcMs: number, z: string): number {
  const w = wallParts(utcMs, z);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
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

const pad2 = (n: number) => String(n).padStart(2, '0');

/** An instant → its wall date ('YYYY-MM-DD') and time ('HH:MM') in a zone —
 *  the inverse of wallTimeToIso, for pickers that edit in the event's zone. */
export function isoToWall(iso: string | number | Date, z: string = zone): { date: string; time: string } {
  const t = new Date(iso).getTime();
  try {
    const w = wallParts(t, z);
    return { date: `${w.y}-${pad2(w.mo)}-${pad2(w.d)}`, time: `${pad2(w.h)}:${pad2(w.mi)}` };
  } catch {
    const d = new Date(t);
    return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
  }
}

/** The wall-clock day of an instant in a zone ('YYYY-MM-DD'). A bare
 *  'YYYY-MM-DD' is already a day and is returned as is. */
export function localDay(iso: string, z: string = zone): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  return isoToWall(t, z).date;
}

/** Today's date in a zone ('YYYY-MM-DD') — never the UTC date. */
export function todayIn(z: string = zone, now: number | Date = Date.now()): string {
  return isoToWall(now, z).date;
}

/** Startup self-check: can this engine format in arbitrary IANA zones (DST
 *  included)? false → times silently show the device clock; worth a polyfill. */
export function intlZonesWork(): boolean {
  try {
    const dubai = isoToWall('2026-01-15T12:00:00Z', 'Asia/Dubai').time === '16:00';
    const londonSummer = isoToWall('2026-07-15T12:00:00Z', 'Europe/London').time === '13:00';
    const sydney = isoToWall('2026-01-15T12:00:00Z', 'Australia/Sydney').time === '23:00';
    return dubai && londonSummer && sydney;
  } catch { return false; }
}
