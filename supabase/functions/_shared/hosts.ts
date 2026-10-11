/**
 * SD-151 — public hosts for edge functions (mirror of src/core/hosts.ts).
 *
 * Secrets (all optional; defaults are today's .in hosts):
 *   APP_URL            the web app origin — where invite/reminder links open
 *   SITE_URL           the marketing website origin
 *   EXTRA_LINK_ORIGINS comma-separated extra origins accepted in invite links,
 *                      e.g. "https://sportnnote.com,https://app.sportnnote.com"
 *
 * The .in hosts stay accepted forever (printed QR codes, old chats). The
 * `@phone.sportnnote.in` placeholder emails (phone-login) are NOT links and
 * must never change — they don't come from here.
 */

const clean = (v: string | undefined | null): string | undefined => {
  const s = (v ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+$/i.test(s) ? s : undefined;
};
const env = (k: string): string | undefined => {
  try { return Deno.env.get(k) ?? undefined; } catch { return undefined; }
};

export const KEEP_IN_ORIGINS = ['https://sportnnote.in', 'https://www.sportnnote.in', 'https://app.sportnnote.in'];

export const APP_URL = clean(env('APP_URL')) ?? 'https://app.sportnnote.in';
export const SITE_URL = clean(env('SITE_URL')) ?? 'https://sportnnote.in';
export const EXTRA_LINK_ORIGINS = (env('EXTRA_LINK_ORIGINS') ?? '')
  .split(',').map((s) => clean(s)).filter((s): s is string => !!s);

/** Link prefixes allowed in a server-sent invite: our functions URL, the app
 *  scheme, every .in host, the configured app/site hosts and any extra origins
 *  (the .com hosts once live). Each origin ends in "/" so "https://sportnnote.in.evil"
 *  can't slip through. */
export function inviteLinkPrefixes(supabaseUrl: string): string[] {
  const origins = [...KEEP_IN_ORIGINS, APP_URL, SITE_URL, ...EXTRA_LINK_ORIGINS];
  const out = [`${supabaseUrl}/functions/v1/`, 'sportnnote://', ...origins.map((o) => `${o}/`)];
  return out.filter((p, i) => out.indexOf(p) === i);
}
