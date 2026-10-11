/**
 * Phone numbers — the ONE module that parses, formats and validates them.
 *
 * A phone number is SportnNote's identity key ("one number = one person"), so
 * it must be unambiguous worldwide. The canonical form is full E.164:
 * `+<country code><national number>`, e.g. `+919876543210`, `+447400123456`,
 * `+6591234567`. Everything we STORE is E.164, and identity matching compares
 * the WHOLE number — never "the last 10 digits" (that let +1 917 555 1234 sign
 * into the Indian account +91 91755 51234).
 *
 * Two kinds of input:
 *  • something a person typed / picked from contacts → `normalizePhone(raw, country)`
 *    parses it with libphonenumber-js. A number with `+` or `00` is international;
 *    a bare local number is read in `country` (default: `defaultPhoneCountry()`).
 *  • a value already stored in the database → `phoneKey(raw)`, an exact mirror of
 *    SQL `phone_key()` (migration 20261020120100_phone_e164.sql) and the edge
 *    functions' `_shared/phone.ts`. It understands the pre-E.164 rows (a bare
 *    10-digit number was always an Indian mobile) without guessing a country.
 */
import { parsePhoneNumberFromString, getCountryCallingCode, getCountries, getExampleNumber, isSupportedCountry } from 'libphonenumber-js/max';
import type { CountryCode, PhoneNumber } from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/mobile/examples';

export type { CountryCode };

// ---------------------------------------------------------------------------
// Default country for bare local numbers
// ---------------------------------------------------------------------------

/** Time zones of our markets (and neighbours) → country. The time zone is a
 *  better location signal than the locale: many phones in India run `en-US`. */
const TZ_COUNTRY: Record<string, CountryCode> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Riyadh': 'SA', 'Asia/Muscat': 'OM',
  'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH',
  'Europe/London': 'GB', 'Europe/Belfast': 'GB',
  'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY',
  'Asia/Colombo': 'LK', 'Asia/Dhaka': 'BD', 'Asia/Karachi': 'PK', 'Asia/Kathmandu': 'NP', 'Asia/Katmandu': 'NP',
  'Pacific/Auckland': 'NZ', 'Africa/Johannesburg': 'ZA', 'Africa/Nairobi': 'KE',
};

/** What a device tells us about where it is (time zone first, then locale region). */
export function deviceRegion(): CountryCode | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    if (tz.startsWith('Australia/')) return 'AU';
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    const region = /[-_]([A-Z]{2})\b/.exec(locale)?.[1];
    // A US locale outside an American time zone is just the phone's default
    // language setting — don't let it turn a local number into +1.
    if (region === 'US' && !tz.startsWith('America/') && !tz.startsWith('US/') && !tz.startsWith('Pacific/Honolulu')) return null;
    if (region && isSupportedCountry(region)) return region as CountryCode;
  } catch { /* no Intl */ }
  return null;
}

let picked: CountryCode | null = null;       // chosen in a phone field this session
let ownNumber: CountryCode | null = null;    // the country of the user's own number
let savedCountry: () => string | null | undefined = () => null; // Settings → Region

/** Remember the country the user last picked in a phone field (this session). */
export function setPreferredPhoneCountry(c?: string | null): void {
  if (c && isSupportedCountry(c)) picked = c as CountryCode;
}

/** Hook up the saved profile/region country (Settings → Region, core/region.ts).
 *  Injected so this module stays free of React Native imports (node tests). */
export function setSavedCountrySource(get: () => string | null | undefined): void {
  savedCountry = get;
}

/** Use the user's own (stored) number to set the default country. */
export function rememberCountryFromPhone(stored?: string | null): void {
  const key = phoneKey(stored ?? '');
  if (!key) return;
  const p = parsePhoneNumberFromString(key);
  if (p?.country) ownNumber = p.country;
}

/** Country a bare local number is read in: the one just picked in a phone field,
 *  else the saved Region setting, else the user's own number's country, else the
 *  device's region, else India (keeps today's behaviour for Indian users). */
export function defaultPhoneCountry(): CountryCode {
  if (picked) return picked;
  try {
    const s = savedCountry();
    if (s && isSupportedCountry(s)) return s as CountryCode;
  } catch { /* no saved setting */ }
  return ownNumber ?? deviceRegion() ?? 'IN';
}

// ---------------------------------------------------------------------------
// Parsing user input
// ---------------------------------------------------------------------------

function parse(raw: string | undefined, country?: CountryCode): PhoneNumber | undefined {
  const s = (raw ?? '').trim();
  if (!/\d/.test(s)) return undefined;
  // "00 971 …" is the international prefix most of the world dials.
  const intl = s.replace(/^\s*00(?=\s*[1-9])/, '+');
  try {
    return parsePhoneNumberFromString(intl, intl.startsWith('+') ? undefined : (country ?? defaultPhoneCountry()));
  } catch {
    return undefined;
  }
}

/** Typed/picked number → canonical E.164 (`+919876543210`), or '' when it
 *  isn't a valid number for that country. This is the form we store. */
export function normalizePhone(raw?: string, country?: CountryCode): string {
  const p = parse(raw, country);
  return p && p.isValid() ? p.number : '';
}

/** A usable number: valid for its country (by libphonenumber's metadata). */
export function isValidPhone(raw?: string, country?: CountryCode): boolean {
  return normalizePhone(raw, country) !== '';
}

/** The country a typed/stored number belongs to (for the dial-code chip). */
export function phoneCountry(raw?: string, country?: CountryCode): CountryCode | undefined {
  const s = (raw ?? '').trim();
  const p = s.startsWith('+') || s.startsWith('00') ? parse(s) : parse(phoneKey(s) || s, country);
  return p?.country;
}

// ---------------------------------------------------------------------------
// Identity key (stored values) — mirrors SQL phone_key() exactly
// ---------------------------------------------------------------------------

/**
 * The identity key for a number: `+` and its full international digits, or ''.
 *  • `+…` / `00…` → `+` + all digits (international form);
 *  • bare digits (rows saved before E.164): leading zeros dropped, then a
 *    10-digit number is an Indian mobile (`+91…`, what the app always assumed),
 *    11–15 digits already carry a country code, anything shorter is a local
 *    number with no country → '' (never matches anything);
 *  • fewer than 8 or more than 15 digits → ''.
 * Keep in step with supabase/functions/_shared/phone.ts and SQL phone_key().
 */
export function phoneKey(raw?: string): string {
  const s = (raw ?? '').trim();
  let d = s.replace(/\D/g, '');
  if (s.startsWith('+')) {
    // already international
  } else if (s.startsWith('00')) {
    d = d.slice(2);
  } else {
    d = d.replace(/^0+/, '');
    if (d.length === 10) d = `91${d}`;
    else if (d.length < 11) return '';
  }
  if (d.length < 8 || d.length > 15 || d.startsWith('0')) return '';
  return `+${d}`;
}

/** Same person? Both numbers resolve to the same full international number.
 *  Typed input is parsed in `country`; stored values fall back to phoneKey. */
export function samePhone(a?: string, b?: string, country?: CountryCode): boolean {
  const ka = normalizePhone(a, country) || phoneKey(a);
  return ka !== '' && ka === (normalizePhone(b, country) || phoneKey(b));
}

/** Best E.164 for any value (typed or stored), or ''. */
export function toE164(raw?: string, country?: CountryCode): string {
  const s = (raw ?? '').trim();
  // Stored-looking values (international, or legacy bare) first: no guessing.
  if (s.startsWith('+') || s.startsWith('00')) return normalizePhone(s) || phoneKey(s);
  return normalizePhone(s, country) || phoneKey(s);
}

/** Digits for wa.me / sms: (international number without '+'), or ''. */
export function intlDigits(raw?: string, country?: CountryCode): string {
  return toE164(raw, country).replace(/^\+/, '');
}

/** Human display: "+91 98765 43210", "+44 7400 123456". Falls back to the input. */
export function formatPhone(raw?: string): string {
  const e = toE164(raw);
  const p = e ? parsePhoneNumberFromString(e) : undefined;
  return p ? p.formatInternational() : (raw ?? '');
}

// ---------------------------------------------------------------------------
// Countries (for the dial-code picker)
// ---------------------------------------------------------------------------

/** Our markets first, in the order people pick them. */
const PRIORITY: CountryCode[] = ['IN', 'AE', 'QA', 'GB', 'SG', 'MY', 'AU', 'US', 'SA', 'OM', 'KW', 'BH', 'NZ', 'CA', 'LK', 'BD', 'NP', 'PK', 'ZA', 'KE'];
const NAMES: Partial<Record<CountryCode, string>> = {
  IN: 'India', AE: 'United Arab Emirates', QA: 'Qatar', GB: 'United Kingdom', SG: 'Singapore',
  MY: 'Malaysia', AU: 'Australia', US: 'United States', SA: 'Saudi Arabia', OM: 'Oman', KW: 'Kuwait',
  BH: 'Bahrain', NZ: 'New Zealand', CA: 'Canada', LK: 'Sri Lanka', BD: 'Bangladesh', NP: 'Nepal',
  PK: 'Pakistan', ZA: 'South Africa', KE: 'Kenya',
};

export function countryName(c: CountryCode): string {
  if (NAMES[c]) return NAMES[c]!;
  try {
    const dn = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: string }) => { of(c: string): string | undefined } }).DisplayNames;
    if (dn) return new dn(['en'], { type: 'region' }).of(c) ?? c;
  } catch { /* Hermes without DisplayNames */ }
  return c;
}

/** Regional-indicator flag emoji for a country code. */
export function countryFlag(c: string): string {
  return c.toUpperCase().replace(/[A-Z]/g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function dialCode(c: CountryCode): string {
  return `+${getCountryCallingCode(c)}`;
}

export interface PhoneCountry { code: CountryCode; name: string; dial: string; flag: string }

let cachedCountries: PhoneCountry[] | null = null;
/** Every country, our markets first then A–Z by name. */
export function phoneCountries(): PhoneCountry[] {
  if (cachedCountries) return cachedCountries;
  const mk = (code: CountryCode): PhoneCountry => ({ code, name: countryName(code), dial: dialCode(code), flag: countryFlag(code) });
  const rest = getCountries().filter((c) => !PRIORITY.includes(c)).map(mk).sort((a, b) => a.name.localeCompare(b.name));
  cachedCountries = [...PRIORITY.map(mk), ...rest];
  return cachedCountries;
}

/** A sample local mobile number for placeholders, e.g. "98765 43210" for IN. */
export function examplePhone(c: CountryCode): string {
  try {
    // Without the trunk 0 ("98765 43210", "7400 123456") — how people type it.
    return (getExampleNumber(c, examples)?.formatNational() ?? '').replace(/^0\s?/, '');
  } catch {
    return '';
  }
}

/** Split a value into (country, national digits as typed) for the phone field. */
export function splitPhone(raw?: string, fallback?: CountryCode): { country: CountryCode; national: string } {
  const country = fallback ?? defaultPhoneCountry();
  const s = (raw ?? '').trim();
  if (!s) return { country, national: '' };
  const e = toE164(s, country);
  const p = e ? parsePhoneNumberFromString(e) : undefined;
  if (p?.country) return { country: p.country, national: p.formatNational().replace(/^0\s?/, '') };
  // "+44 74" while typing: keep the dial code's main country and the rest.
  const m = /^\+(\d{1,3})\s*(.*)$/.exec(s);
  if (m) {
    const c = phoneCountries().find((x) => x.dial === `+${m[1]}`)?.code;
    if (c) return { country: c, national: m[2] };
  }
  return { country, national: s };
}

/** Join a dial-code choice and the typed local part into one value: E.164 when
 *  it's a valid number, else "+<code> <digits>" so it's never read as Indian. */
export function joinPhone(country: CountryCode, national: string): string {
  const t = national.trim();
  if (!/\d/.test(t)) return '';
  if (t.startsWith('+') || t.startsWith('00')) return normalizePhone(t) || t;
  return normalizePhone(t, country) || `${dialCode(country)} ${t.replace(/[^\d]/g, '').replace(/^0+/, '')}`;
}

/** Help line for a box that takes a number OR a name: how to type a number. */
export function phoneHelp(country: CountryCode = defaultPhoneCountry()): string {
  const ex = examplePhone(country);
  return `Enter the full mobile number${ex ? ` (e.g. ${ex})` : ''}. For a number outside ${countryName(country)}, start with + and the country code.`;
}
