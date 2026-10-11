/**
 * SD-152 — which privacy rules apply where. Pure (no React Native) so it's
 * unit-tested (tests/privacy-region.test.mts).
 *
 * NOT LEGAL ADVICE: these are the founder's product defaults, drafted for a
 * lawyer's review (docs/international/legal-draft.md).
 *
 *   • Analytics: in the UK and anywhere under the GDPR (EEA, Switzerland) we ASK
 *     before any usage analytics ("Essential only" / "Allow analytics"). Elsewhere
 *     — India (DPDP), the Gulf, Singapore, Malaysia, Australia, the US — analytics
 *     is on with a notice, and can be switched off in Settings → Your data.
 *   • Under-18s: India keeps today's flow (the guardian ticks consent at sign-up).
 *     Everywhere else the guardian confirms from their own email before the
 *     account is fully on. Mirrors guardian_confirm_required() in SQL.
 *   • US under-13s can't sign up themselves (COPPA) until a verification vendor is
 *     contracted; a parent adds them as a player instead.
 *
 * The country comes from the device's time zone (where the phone is), never the
 * language setting (many Indian phones are set to "English (US)"). Unknown → India,
 * so Indian users see no change. The region-settings work (SD-150) can call
 * setPrivacyCountry() once the user picks a country.
 */

/** UK GDPR / EU GDPR markets: consent before analytics. */
const EEA = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT',
  'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
]);
export const CONSENT_FIRST_COUNTRIES = new Set<string>(['GB', 'CH', 'EU', ...EEA]);

const US_ZONES = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Adak|Boise|Detroit|Juneau|Sitka|Nome|Yakutat|Metlakatla|Menominee|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu|US\/.+)$/;

const ZONE_COUNTRY: Record<string, string> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA', 'Asia/Riyadh': 'SA', 'Asia/Bahrain': 'BH', 'Asia/Kuwait': 'KW', 'Asia/Muscat': 'OM',
  'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP',
  'Pacific/Auckland': 'NZ',
  'Europe/London': 'GB', 'Europe/Belfast': 'GB', 'Europe/Guernsey': 'GB', 'Europe/Jersey': 'GB', 'Europe/Isle_of_Man': 'GB',
  'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Lisbon': 'PT', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Athens': 'GR', 'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG',
  'Europe/Zagreb': 'HR', 'Europe/Ljubljana': 'SI', 'Europe/Bratislava': 'SK', 'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV',
  'Europe/Tallinn': 'EE', 'Europe/Luxembourg': 'LU', 'Europe/Malta': 'MT', 'Asia/Nicosia': 'CY', 'Europe/Nicosia': 'CY',
  'Atlantic/Reykjavik': 'IS', 'Europe/Vaduz': 'LI', 'Atlantic/Canary': 'ES', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
};

/** Country (ISO 3166 alpha-2) for an IANA time zone; 'EU' for any other European
 *  zone (treated as GDPR); undefined when we can't tell. */
export function countryFromTimeZone(tz: string | undefined | null): string | undefined {
  const z = (tz ?? '').trim();
  if (!z) return undefined;
  if (ZONE_COUNTRY[z]) return ZONE_COUNTRY[z];
  if (z.startsWith('Australia/')) return 'AU';
  if (US_ZONES.test(z)) return 'US';
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal)$/.test(z)) return 'CA';
  if (z.startsWith('Europe/')) return 'EU';
  return undefined;
}

let override: string | undefined;

/** Set by the region settings (SD-150) once the user has chosen a country. */
export function setPrivacyCountry(cc: string | undefined | null): void {
  const c = (cc ?? '').trim().toUpperCase();
  override = /^[A-Z]{2}$/.test(c) ? c : undefined;
}

function deviceTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
}

/** The country privacy rules use: the chosen country, else the device's time
 *  zone, else India. */
export function privacyCountry(tz: string | undefined = deviceTimeZone()): string {
  return override ?? countryFromTimeZone(tz) ?? 'IN';
}

/** Ask before analytics (UK / GDPR)? */
export const analyticsNeedsConsent = (cc: string): boolean => CONSENT_FIRST_COUNTRIES.has(cc.toUpperCase());

/** Must the guardian confirm from their own email (vs. the sign-up checkbox)? */
export const guardianConfirmRequired = (cc: string | undefined): boolean => !!cc && cc.toUpperCase() !== 'IN';

/** US under-13: no self sign-up (COPPA). */
export const usUnder13Blocked = (cc: string | undefined, age: number | undefined): boolean =>
  (cc ?? '').toUpperCase() === 'US' && age !== undefined && age < 13;

export const US_UNDER_13_MESSAGE =
  'In the US, children under 13 can’t create their own account. A parent or guardian can add them as a player from the parent’s own account instead.';

export type AnalyticsChoice = 'granted' | 'denied';
export type AnalyticsDecision = 'allowed' | 'denied' | 'undecided';

/** What telemetry may do now: a saved choice wins; with none, consent-first
 *  countries wait (nothing is sent or stored), the rest are on with a notice. */
export function analyticsDecision(choice: AnalyticsChoice | null | undefined, cc: string): AnalyticsDecision {
  if (choice === 'granted') return 'allowed';
  if (choice === 'denied') return 'denied';
  return analyticsNeedsConsent(cc) ? 'undecided' : 'allowed';
}

/** Which privacy policy text applies: India keeps its DPDP policy unchanged. */
export const policyRegion = (cc: string): 'india' | 'international' => (cc.toUpperCase() === 'IN' ? 'india' : 'international');
