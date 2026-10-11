/**
 * SD-151 — which chat app to lead with, and which English to listen for, by the
 * DEVICE's region.
 *
 * NOTE: a tiny local helper. SD-150 is building the real region module
 * (src/core/region.ts, user/org country). When that lands, `deviceRegion()` here
 * should defer to it; the pure rules below (whatsappFirst / preferredChat /
 * speechLangs) stay as they are.
 *
 * India behaviour is unchanged: India (and any device whose region we can't read)
 * stays WhatsApp-first with Indian-English speech.
 *
 * Pure apart from `deviceRegion()`, which only reads Intl / navigator.
 */

/** Countries where WhatsApp is the everyday chat app (school parent groups,
 *  clubs). Elsewhere (US, Australia, Canada, …) people mostly text, so we lead
 *  with the share sheet / Messages and keep WhatsApp one tap away. */
const WHATSAPP_FIRST = new Set([
  'IN', // home market
  'AE', 'QA', 'SA', 'KW', 'BH', 'OM', // Gulf
  'MY', 'SG', // South-East Asia
  'GB', 'IE', // UK and Ireland: parent groups run on WhatsApp
  'PK', 'BD', 'LK', 'NP', 'ID', 'ZA', 'KE', 'NG',
]);

/** ISO-3166 alpha-2 from a BCP-47 tag ("en-GB" → "GB", "en_AU" → "AU"), else null. */
export function regionFromLocale(tag: string | undefined | null): string | null {
  const m = (tag ?? '').match(/[-_]([A-Za-z]{2})(?:[-_]|$)/);
  return m ? m[1].toUpperCase() : null;
}

/** Region from an IANA time zone, for the zones of our markets. The clock is a
 *  better "where am I" signal than the language: many phones in India run in
 *  "English (United States)", and they must keep India's behaviour. */
export function regionFromTimeZone(tz: string | undefined | null): string | null {
  const z = tz ?? '';
  if (/^Asia\/(Kolkata|Calcutta)$/.test(z)) return 'IN';
  if (z === 'Asia/Dubai') return 'AE';
  if (z === 'Asia/Qatar') return 'QA';
  if (z === 'Asia/Riyadh') return 'SA';
  if (z === 'Asia/Kuwait') return 'KW';
  if (z === 'Asia/Bahrain') return 'BH';
  if (z === 'Asia/Muscat') return 'OM';
  if (z === 'Asia/Singapore') return 'SG';
  if (/^Asia\/(Kuala_Lumpur|Kuching)$/.test(z)) return 'MY';
  if (/^Europe\/(London|Belfast)$/.test(z)) return 'GB';
  if (z === 'Europe/Dublin') return 'IE';
  if (/^Australia\//.test(z)) return 'AU';
  if (/^Pacific\/(Auckland|Chatham)$/.test(z)) return 'NZ';
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)$/.test(z) || z === 'Pacific/Honolulu') return 'US';
  if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina)$/.test(z)) return 'CA';
  return null;
}

/** The device's region, or null when it can't be read: the time zone first (a
 *  known market zone), then the language's region (web: the browser's language
 *  list; phone: the OS locale via Intl). */
export function deviceRegion(): string | null {
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    const byZone = regionFromTimeZone(opts.timeZone);
    if (byZone) return byZone;
    const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
    const tags = [...(nav?.languages ?? []), nav?.language, opts.locale];
    for (const t of tags) {
      const r = regionFromLocale(t);
      if (r) return r;
    }
  } catch { /* no Intl / navigator */ }
  return null;
}

/** True where WhatsApp is the norm. Unknown region → India's behaviour (true). */
export const whatsappFirst = (region: string | null = deviceRegion()): boolean =>
  !region || WHATSAPP_FIRST.has(region.toUpperCase());

/** The chat app to open first for a person-to-person invite to a number. */
export const preferredChat = (region: string | null = deviceRegion()): 'whatsapp' | 'sms' =>
  (whatsappFirst(region) ? 'whatsapp' : 'sms');

/** Speech-recognition languages, best first (later ones are fallbacks when the
 *  phone can't do the first). UK → British English, Australia → Australian,
 *  US/Canada → American; everyone else keeps Indian English (the default). */
export function speechLangs(region: string | null = deviceRegion()): string[] {
  switch ((region ?? '').toUpperCase()) {
    case 'GB': case 'IE': return ['en-GB', 'en-US'];
    case 'AU': case 'NZ': return ['en-AU', 'en-GB', 'en-US'];
    case 'US': case 'CA': return ['en-US'];
    default: return ['en-IN', 'en-US'];
  }
}
