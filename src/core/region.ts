/**
 * Region settings (SD-150, international I-1a): the per-country defaults that
 * decide how dates, times, school years, units and speech work for a user.
 *
 * One record per supported country. The user's country comes from their saved
 * setting (Settings → Region), else the device (time zone first, then the
 * locale's region), else India. Every value can be overridden one by one.
 *
 * INDIA IS THE FALLBACK AND ITS VALUES EQUAL TODAY'S BEHAVIOUR: 24-hour times on
 * cards, a 12-hour AM/PM picker, Sunday-first calendars, day-first typed dates,
 * April school years ("2026–27"), calendar-year stats seasons, metric, en-IN
 * speech. Nothing moves for existing Indian users.
 *
 * The pure helpers (regionFor, resolveCountry, effectiveRegion, parseTypedDate,
 * dateOrderOf, schoolYearLabel, seasonKeyOf, defaultSchoolYear…) have no RN
 * imports so node tests and later market presets (SD-153) can build on them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type CountryCode = 'IN' | 'AE' | 'QA' | 'GB' | 'SG' | 'MY' | 'AU' | 'US';
/** How a typed numeric date reads: 05/03/2012 = 5 March (DMY) or May 3 (MDY). */
export type DateOrder = 'DMY' | 'MDY' | 'YMD';
/** Default age-group basis for meets (core/age.ts presets build on this). */
export type AgeCutoff = 'dec31' | 'aug31' | 'sep1';
export type UnitSystem = 'metric' | 'us';
/** 0 = Sunday, 1 = Monday, 6 = Saturday. */
export type WeekStart = 0 | 1 | 6;

export interface ZoneOption { id: string; label: string }

export interface RegionSettings {
  country: CountryCode;
  name: string;
  flag: string;
  /** the country's main zone (used when the device zone is unknown) */
  timeZone: string;
  /** every zone a user in this country may pick, main first */
  zones: ZoneOption[];
  dateOrder: DateOrder;
  /** times on cards, Live, emails: true = "4:30 pm", false = "16:30" */
  hour12: boolean;
  /** the kickoff picker: AM/PM wheel (true) or a 0–23 hour (false) */
  entryHour12: boolean;
  weekStart: WeekStart;
  /** month (1–12) a school/academic year starts — seeds the first academic year */
  schoolYearStartMonth: number;
  /** "2026–27" (a year that spans two calendar years) or "2026" (calendar year) */
  schoolYearLabel: 'span' | 'calendar';
  /** month the player-stats "Season" split starts (1 = calendar years) */
  statsSeasonStartMonth: number;
  ageCutoff: AgeCutoff;
  /** display only — everything is stored metric */
  units: UnitSystem;
  /** speech-recognition locales, best first (SD-151 wires these into voice) */
  speechLangs: string[];
  /** an Intl locale whose conventions suit this country (for number/date words) */
  locale: string;
}

export const REGIONS: Record<CountryCode, RegionSettings> = {
  IN: {
    country: 'IN', name: 'India', flag: '🇮🇳', timeZone: 'Asia/Kolkata',
    zones: [{ id: 'Asia/Kolkata', label: 'India (IST)' }],
    dateOrder: 'DMY', hour12: false, entryHour12: true, weekStart: 0,
    schoolYearStartMonth: 4, schoolYearLabel: 'span', statsSeasonStartMonth: 1,
    ageCutoff: 'dec31', units: 'metric', speechLangs: ['en-IN', 'en-US'], locale: 'en-IN',
  },
  AE: {
    country: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', timeZone: 'Asia/Dubai',
    zones: [{ id: 'Asia/Dubai', label: 'UAE (GST)' }],
    // Indian-curriculum schools (most of our Gulf pilots) run April–March;
    // British/IB schools run September–June — set the organisation's own years.
    dateOrder: 'DMY', hour12: true, entryHour12: true, weekStart: 1,
    schoolYearStartMonth: 4, schoolYearLabel: 'span', statsSeasonStartMonth: 1,
    ageCutoff: 'dec31', units: 'metric', speechLangs: ['en-IN', 'en-GB'], locale: 'en-AE',
  },
  QA: {
    country: 'QA', name: 'Qatar', flag: '🇶🇦', timeZone: 'Asia/Qatar',
    zones: [{ id: 'Asia/Qatar', label: 'Qatar (AST)' }],
    dateOrder: 'DMY', hour12: true, entryHour12: true, weekStart: 0,
    schoolYearStartMonth: 9, schoolYearLabel: 'span', statsSeasonStartMonth: 1,
    ageCutoff: 'dec31', units: 'metric', speechLangs: ['en-GB', 'en-IN'], locale: 'en-AE',
  },
  GB: {
    country: 'GB', name: 'United Kingdom', flag: '🇬🇧', timeZone: 'Europe/London',
    zones: [{ id: 'Europe/London', label: 'UK (GMT/BST)' }],
    dateOrder: 'DMY', hour12: false, entryHour12: false, weekStart: 1,
    schoolYearStartMonth: 9, schoolYearLabel: 'span', statsSeasonStartMonth: 9,
    ageCutoff: 'aug31', units: 'metric', speechLangs: ['en-GB', 'en-US'], locale: 'en-GB',
  },
  SG: {
    country: 'SG', name: 'Singapore', flag: '🇸🇬', timeZone: 'Asia/Singapore',
    zones: [{ id: 'Asia/Singapore', label: 'Singapore (SGT)' }],
    dateOrder: 'DMY', hour12: true, entryHour12: true, weekStart: 1,
    schoolYearStartMonth: 1, schoolYearLabel: 'calendar', statsSeasonStartMonth: 1,
    ageCutoff: 'dec31', units: 'metric', speechLangs: ['en-SG', 'en-GB'], locale: 'en-SG',
  },
  MY: {
    country: 'MY', name: 'Malaysia', flag: '🇲🇾', timeZone: 'Asia/Kuala_Lumpur',
    zones: [{ id: 'Asia/Kuala_Lumpur', label: 'Malaysia (MYT)' }],
    dateOrder: 'DMY', hour12: true, entryHour12: true, weekStart: 1,
    schoolYearStartMonth: 1, schoolYearLabel: 'calendar', statsSeasonStartMonth: 1,
    ageCutoff: 'dec31', units: 'metric', speechLangs: ['en-SG', 'en-GB'], locale: 'en-MY',
  },
  AU: {
    country: 'AU', name: 'Australia', flag: '🇦🇺', timeZone: 'Australia/Sydney',
    zones: [
      { id: 'Australia/Sydney', label: 'Sydney, Canberra (AET)' },
      { id: 'Australia/Melbourne', label: 'Melbourne (AET)' },
      { id: 'Australia/Brisbane', label: 'Brisbane (AEST, no daylight saving)' },
      { id: 'Australia/Adelaide', label: 'Adelaide (ACT)' },
      { id: 'Australia/Darwin', label: 'Darwin (ACST)' },
      { id: 'Australia/Hobart', label: 'Hobart (AET)' },
      { id: 'Australia/Perth', label: 'Perth (AWST)' },
    ],
    dateOrder: 'DMY', hour12: true, entryHour12: true, weekStart: 1,
    schoolYearStartMonth: 1, schoolYearLabel: 'calendar', statsSeasonStartMonth: 1,
    ageCutoff: 'dec31', units: 'metric', speechLangs: ['en-AU', 'en-GB'], locale: 'en-AU',
  },
  US: {
    country: 'US', name: 'United States', flag: '🇺🇸', timeZone: 'America/New_York',
    zones: [
      { id: 'America/New_York', label: 'Eastern (ET)' },
      { id: 'America/Chicago', label: 'Central (CT)' },
      { id: 'America/Denver', label: 'Mountain (MT)' },
      { id: 'America/Phoenix', label: 'Arizona (MST, no daylight saving)' },
      { id: 'America/Los_Angeles', label: 'Pacific (PT)' },
      { id: 'America/Anchorage', label: 'Alaska (AKT)' },
      { id: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
    ],
    // State associations set their own age rules — the meet can pick a custom date.
    dateOrder: 'MDY', hour12: true, entryHour12: true, weekStart: 0,
    schoolYearStartMonth: 8, schoolYearLabel: 'span', statsSeasonStartMonth: 8,
    ageCutoff: 'sep1', units: 'us', speechLangs: ['en-US'], locale: 'en-US',
  },
};

export const COUNTRY_ORDER: CountryCode[] = ['IN', 'AE', 'QA', 'GB', 'SG', 'MY', 'AU', 'US'];
export const FALLBACK_COUNTRY: CountryCode = 'IN';

export const isCountry = (c: unknown): c is CountryCode => typeof c === 'string' && c in REGIONS;
export const regionFor = (c: string | undefined | null): RegionSettings => REGIONS[isCountry(c) ? c : FALLBACK_COUNTRY];

/* ------------------------------ Device reading ------------------------------ */

/** Zones that unambiguously mean one of our countries. */
const ZONE_COUNTRY: Record<string, CountryCode> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Europe/London': 'GB', 'Europe/Belfast': 'GB',
  'Asia/Singapore': 'SG', 'Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Phoenix': 'US',
  'America/Los_Angeles': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Detroit': 'US',
  'America/Boise': 'US', 'America/Indiana/Indianapolis': 'US', 'America/Kentucky/Louisville': 'US',
  'US/Eastern': 'US', 'US/Central': 'US', 'US/Mountain': 'US', 'US/Pacific': 'US',
};

/** The country a time zone implies, if it's one of ours. */
export function countryOfZone(zone: string | undefined | null): CountryCode | undefined {
  if (!zone) return undefined;
  if (ZONE_COUNTRY[zone]) return ZONE_COUNTRY[zone];
  if (zone.startsWith('Australia/')) return 'AU';
  return undefined;
}

/** The device's IANA zone ("Asia/Dubai"), or undefined when the engine won't say.
 *  `Intl…resolvedOptions().timeZone` works on Hermes (iOS + Android) and web. */
export function deviceTimeZone(): string | undefined {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof z === 'string' && z.length > 1 ? z : undefined;
  } catch { return undefined; }
}

/** The device locale's region subtag ("en-AE" → "AE"), from the browser's
 *  languages first, then Intl. */
export function deviceLocaleRegion(): string | undefined {
  const tags: string[] = [];
  try {
    const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
    if (nav?.languages?.length) tags.push(...nav.languages);
    else if (nav?.language) tags.push(nav.language);
  } catch { /* not a browser */ }
  try { tags.push(Intl.DateTimeFormat().resolvedOptions().locale); } catch { /* no Intl */ }
  for (const t of tags) {
    const m = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Z]{2})\b/i.exec(t ?? '');
    if (m) return m[1].toUpperCase();
  }
  return undefined;
}

/**
 * The user's country: their saved choice, else the device ZONE (an Indian phone
 * left on "English (US)" is still on Asia/Kolkata — the zone wins so India never
 * flips to US dates), else the device locale's region when the zone says
 * nothing, else India.
 */
export function resolveCountry(input: { saved?: string | null; deviceZone?: string; deviceLocaleRegion?: string }): CountryCode {
  if (isCountry(input.saved)) return input.saved;
  const byZone = countryOfZone(input.deviceZone);
  if (byZone) return byZone;
  // The zone is known but isn't one of ours (e.g. Europe/Berlin): India defaults.
  // Only trust the locale when there's no usable zone.
  if (!input.deviceZone && isCountry(input.deviceLocaleRegion)) return input.deviceLocaleRegion;
  return FALLBACK_COUNTRY;
}

/* ------------------------------- Preferences -------------------------------- */

/** What the user saved. Every field is optional: absent = the country default. */
export interface RegionPrefs {
  country?: CountryCode;
  dateOrder?: DateOrder;
  hour12?: boolean;
  weekStart?: WeekStart;
  schoolYearStartMonth?: number;
  units?: UnitSystem;
}
export type RegionOverrideKey = Exclude<keyof RegionPrefs, 'country'>;

/** The settings in force: the country's record with the user's overrides on top. */
export function effectiveRegion(prefs: RegionPrefs, device: { zone?: string; localeRegion?: string } = {}): RegionSettings {
  const base = regionFor(resolveCountry({ saved: prefs.country, deviceZone: device.zone, deviceLocaleRegion: device.localeRegion }));
  const out: RegionSettings = { ...base };
  if (prefs.dateOrder) out.dateOrder = prefs.dateOrder;
  // An explicit 12/24-hour choice applies to display and the picker alike.
  if (typeof prefs.hour12 === 'boolean') { out.hour12 = prefs.hour12; out.entryHour12 = prefs.hour12; }
  if (prefs.weekStart === 0 || prefs.weekStart === 1 || prefs.weekStart === 6) out.weekStart = prefs.weekStart;
  if (prefs.schoolYearStartMonth && prefs.schoolYearStartMonth >= 1 && prefs.schoolYearStartMonth <= 12) {
    out.schoolYearStartMonth = prefs.schoolYearStartMonth;
    out.schoolYearLabel = prefs.schoolYearStartMonth === 1 ? 'calendar' : 'span';
  }
  if (prefs.units) out.units = prefs.units;
  return out;
}

const KEY = 'sportfolio.region.v1';
let prefs: RegionPrefs = {};
let current: RegionSettings = effectiveRegion({}, { zone: deviceTimeZone(), localeRegion: deviceLocaleRegion() });
const listeners = new Set<() => void>();
const recompute = () => {
  current = effectiveRegion(prefs, { zone: deviceTimeZone(), localeRegion: deviceLocaleRegion() });
  listeners.forEach((l) => l());
};

export async function hydrateRegion(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) { prefs = JSON.parse(raw) as RegionPrefs; recompute(); }
  } catch { /* keep device defaults */ }
}

export const regionStore = {
  get: (): RegionSettings => current,
  prefs: (): RegionPrefs => prefs,
  /** Save the country (clears per-field overrides so the new country's defaults apply). */
  setCountry(c: CountryCode) { prefs = { country: c }; void AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {}); recompute(); },
  /** Override one field; `undefined` returns it to the country default. */
  setOverride<K extends RegionOverrideKey>(k: K, v: RegionPrefs[K] | undefined) {
    prefs = { ...prefs, country: prefs.country ?? current.country };
    if (v === undefined) delete prefs[k]; else prefs[k] = v;
    void AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
    recompute();
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getSnapshot: (): RegionSettings => current,
};

/** Reactive region — components re-render when the user changes it. */
export function useRegion(): RegionSettings {
  return useSyncExternalStore(regionStore.subscribe, regionStore.getSnapshot, regionStore.getSnapshot);
}

/* ------------------------------- Typed dates -------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** A real calendar date → 'YYYY-MM-DD', else null (31/02, month 13…). */
export function ymdOf(y: number, m: number, d: number): string | null {
  if (!m || m > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const NUMERIC = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/;

/**
 * A typed numeric date in the region's order → 'YYYY-MM-DD', or null. ISO
 * (2012-03-05) always reads year-month-day. Two-digit years: `pivot` picks the
 * century (default: 2000s unless that lands after `today`, as for DOBs).
 */
export function parseTypedDate(text: string, order: DateOrder = 'DMY', today: Date = new Date()): string | null {
  const s = (text ?? '').trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (iso) return ymdOf(+iso[1], +iso[2], +iso[3]);
  const m = NUMERIC.exec(s);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  let y = +m[3];
  if (m[3].length === 2) y += y + 2000 > today.getFullYear() ? 1900 : 2000;
  return order === 'MDY' ? ymdOf(y, a, b) : ymdOf(y, b, a);
}

/** What a set of typed dates says about their order: 'DMY' / 'MDY' when some
 *  date proves it (a part above 12), 'ambiguous' when every numeric date fits
 *  both ways, 'none' when there are no numeric day/month dates at all. */
export function dateOrderOf(texts: readonly (string | undefined | null)[]): 'DMY' | 'MDY' | 'ambiguous' | 'none' | 'mixed' {
  let dmy = false, mdy = false, any = false;
  for (const t of texts) {
    const m = NUMERIC.exec((t ?? '').trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '').replace(/\s.*$/, ''));
    if (!m) continue;
    any = true;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dmy = true;
    if (b > 12 && a <= 12) mdy = true;
  }
  if (dmy && mdy) return 'mixed';
  if (dmy) return 'DMY';
  if (mdy) return 'MDY';
  return any ? 'ambiguous' : 'none';
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD' → "5 Mar 2012" — unambiguous in every market, for previews. */
export function spelledDate(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return y && m && d ? `${d} ${MONTHS_SHORT[m - 1]} ${y}` : ymd;
}

/** An example of a typed date in this order, e.g. "05/03/2012" or "03/05/2012"
 *  (both 5 March 2012) — for hints and error messages. */
export function exampleDate(order: DateOrder, ymd = '2012-03-05'): string {
  const [y, m, d] = [ymd.slice(0, 4), ymd.slice(5, 7), ymd.slice(8, 10)];
  return order === 'MDY' ? `${m}/${d}/${y}` : order === 'YMD' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
}
/** "day/month/year" or "month/day/year" — for hint text. */
export const dateOrderWords = (order: DateOrder): string =>
  order === 'MDY' ? 'month/day/year' : order === 'YMD' ? 'year-month-day' : 'day/month/year';

/* ---------------------------- School / season years ---------------------------- */

/** A school/academic year's label: "2026" when it sits in one calendar year
 *  (SG, MY, AU), else "2026–27". */
export function schoolYearLabel(start: string, end: string): string {
  const ys = start.slice(0, 4), ye = end.slice(0, 4);
  return !ye || ys === ye ? ys : `${ys}–${ye.slice(2, 4)}`;
}

/** The season a local date ('YYYY-MM-DD') falls in, for a season starting in
 *  `startMonth`: key "2026", label "2026" (January) or "2026–27". */
export function seasonKeyOf(date: string, startMonth = 1): { key: string; label: string } | undefined {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !y || !m) return undefined;
  if (startMonth <= 1) return { key: String(y), label: String(y) };
  const start = m >= startMonth ? y : y - 1;
  return { key: String(start), label: `${start}–${String(start + 1).slice(2)}` };
}

/** The school year containing `today` for a region — the seed for an
 *  organisation's first academic year (start = 1st of the start month, end =
 *  the day before the next start). */
export function defaultSchoolYear(region: Pick<RegionSettings, 'schoolYearStartMonth'>, today: string): { start: string; end: string; label: string } {
  const sm = region.schoolYearStartMonth;
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const sy = m >= sm ? y : y - 1;
  const start = `${sy}-${pad(sm)}-01`;
  const endD = new Date(Date.UTC(sy + 1, sm - 1, 1) - 86_400_000);
  const end = `${endD.getUTCFullYear()}-${pad(endD.getUTCMonth() + 1)}-${pad(endD.getUTCDate())}`;
  return { start, end, label: schoolYearLabel(start, end) };
}

/** Weekday headers starting on the region's first day ("Mo Tu …" for Monday). */
export function weekdayOrder<T>(names: readonly T[], weekStart: WeekStart): T[] {
  return [...names.slice(weekStart), ...names.slice(0, weekStart)];
}
/** Blank cells before day 1 of a month whose first weekday (0 = Sunday) is
 *  `firstWeekday`, for a grid starting on `weekStart`. */
export const leadingBlanks = (firstWeekday: number, weekStart: WeekStart): number => (firstWeekday - weekStart + 7) % 7;
