/**
 * SD-151 — the ONE place the app's public addresses live.
 *
 * Every link the app writes (share messages, invites, QR codes, install links,
 * "Scored on SportnNote — sportnnote.in" footers) reads its host from here, so
 * moving to a .com is a config change (EXPO_PUBLIC_* at build/OTA time), not a
 * code hunt. Defaults are today's .in hosts, so nothing changes until the
 * founder sets the env values (docs/international/domain-move-com.md).
 *
 * The .in hosts are PERMANENT: they are printed on QR posters and sit in old
 * WhatsApp chats, so they always stay in the deep-link prefixes even after the
 * default flips to .com. (The `@phone.sportnnote.in` placeholder emails used by
 * phone login are an internal identity key and must never change — they are
 * not a link and don't come from here.)
 *
 * Pure (no React Native) so it's unit-tested. `process.env.EXPO_PUBLIC_*` must be
 * read with static member access — Expo inlines those at build time.
 */

const clean = (v: string | undefined): string | undefined => {
  const s = (v ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+$/i.test(s) ? s : undefined;
};

/** The .in hosts we own today — accepted forever (printed QRs, old chats). */
export const KEEP_IN_ORIGINS = ['https://sportnnote.in', 'https://www.sportnnote.in', 'https://app.sportnnote.in'] as const;
/** The .com hosts we plan to use once the domain is bought. NOT live yet — only
 *  used when the build sets them through EXPO_PUBLIC_EXTRA_LINK_ORIGINS (or as
 *  EXPO_PUBLIC_SITE_URL / EXPO_PUBLIC_APP_URL). Listed here for the docs/tests. */
export const PLANNED_COM_ORIGINS = ['https://sportnnote.com', 'https://www.sportnnote.com', 'https://app.sportnnote.com'] as const;

export interface HostConfig {
  /** The marketing website (guides, Get the app, legal pages). */
  siteUrl: string;
  /** The web app — where share/invite links open (…/m/<id>, /t/<id>, /i/<id>). */
  appUrl: string;
  /** Extra origins to accept as incoming deep links (e.g. the .com hosts). */
  extraOrigins: string[];
}

/** Build a host config from raw env values (exported for tests). */
export function hostConfig(env: { site?: string; app?: string; extra?: string }): HostConfig {
  return {
    siteUrl: clean(env.site) ?? 'https://sportnnote.in',
    appUrl: clean(env.app) ?? 'https://app.sportnnote.in',
    extraOrigins: (env.extra ?? '').split(',').map((s) => clean(s)).filter((s): s is string => !!s),
  };
}

const ENV: HostConfig = hostConfig({
  site: process.env.EXPO_PUBLIC_SITE_URL,
  app: process.env.EXPO_PUBLIC_APP_URL,
  extra: process.env.EXPO_PUBLIC_EXTRA_LINK_ORIGINS,
});

/** https://sportnnote.in today. */
export const SITE_URL = ENV.siteUrl;
/** https://app.sportnnote.in today. */
export const APP_URL = ENV.appUrl;
/** "sportnnote.in" — the bare host, for footers and spoken/printed copy. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//i, '');
/** "app.sportnnote.in" — the web app's bare host (join links in copy). */
export const APP_HOST = APP_URL.replace(/^https?:\/\//i, '');
/** The website's "Get the app" section (Android download + iPhone steps). */
export const INSTALL_PAGE_URL = `${SITE_URL}/#get`;
/** The public account-deletion page (Play requires a web URL). */
export const DELETE_ACCOUNT_URL = `${SITE_URL}/delete-account/`;
/** The public support / contact page. */
export const SUPPORT_PAGE_URL = `${SITE_URL}/support/`;

/** Prefixes React Navigation accepts as deep links into the app. Always the
 *  app scheme + every .in host; plus the configured site/app hosts and any extra
 *  origins (the .com hosts once they are live). No duplicates. */
export function linkPrefixes(cfg: HostConfig = ENV): string[] {
  const out = ['sportnnote://', ...KEEP_IN_ORIGINS, cfg.siteUrl, cfg.appUrl, ...cfg.extraOrigins];
  return out.filter((p, i) => out.indexOf(p) === i);
}

/* ------------------------------ support contact ------------------------------ */

const cleanEmail = (v: string | undefined): string | undefined => {
  const s = (v ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : undefined;
};

/** Where support email goes. Today's inbox until the company mailbox
 *  (support@<domain>) exists — then set EXPO_PUBLIC_SUPPORT_EMAIL. */
export const SUPPORT_EMAIL = cleanEmail(process.env.EXPO_PUBLIC_SUPPORT_EMAIL) ?? 'sportnnote@gmail.com';
/** Published support hours, always with the time zone spelled out (users are
 *  in several countries). Mirrors website/config.json → supportHours. */
export const SUPPORT_HOURS = 'Monday to Saturday, 10:00–18:00 India time (UTC+5:30)';
/** The response promise, matching the privacy policy ("We reply within 7 days"). */
export const SUPPORT_REPLY = 'We read every message and reply within 7 days.';
