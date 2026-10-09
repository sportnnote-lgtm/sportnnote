/**
 * Score overlay URL params (parity #25) — `/o/<matchId>?t=bar&pos=bottom&sp=…`.
 * Everything the overlay needs lives in the link (no DB row, no migration), so a
 * theme change means re-pasting the link in OBS. Pure, unit-tested.
 */
import { mediaPublicUrl } from './imageUrl.ts';

export type OverlayTheme = 'bar' | 'pill' | 'corner';
export type OverlayPos = 'bottom' | 'top';
export const OVERLAY_THEMES: OverlayTheme[] = ['bar', 'pill', 'corner'];

export interface OverlayParams {
  theme: OverlayTheme;
  pos: OverlayPos;
  /** false when `flash=0` */
  flash: boolean;
  /** the accepted `media` bucket path of the sponsor logo */
  sponsorPath?: string;
  /** its public URL (needs the Supabase URL; absent in demo) */
  sponsorUrl?: string;
}

/** Only our own uploads: `<uid>/sponsor-logo/<file>.png|jpg|jpeg|webp` — never
 *  a full URL, `..` or another folder, so the link can't point the overlay at
 *  someone else's image. */
export const SPONSOR_PATH_RE = /^[0-9a-f-]{36}\/sponsor-logo\/[\w.-]+\.(png|jpe?g|webp)$/;

export const isSponsorPath = (p?: string | null): p is string => !!p && SPONSOR_PATH_RE.test(p) && !p.includes('..');

export function parseOverlayParams(search: string, supabaseUrl?: string): OverlayParams {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const t = q.get('t');
  const theme: OverlayTheme = (OVERLAY_THEMES as string[]).includes(t ?? '') ? (t as OverlayTheme) : 'bar';
  const pos: OverlayPos = q.get('pos') === 'top' ? 'top' : 'bottom';
  const flash = q.get('flash') !== '0';
  const sp = q.get('sp');
  const out: OverlayParams = { theme, pos, flash };
  if (isSponsorPath(sp)) {
    out.sponsorPath = sp;
    if (supabaseUrl) out.sponsorUrl = mediaPublicUrl(supabaseUrl, sp);
  }
  return out;
}
