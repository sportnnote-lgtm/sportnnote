/**
 * Image URL helpers (pure — no React Native imports, so node tests can load it).
 * A picked image starts as a device-local URI (file:, blob:, content:, …) that
 * only the picking device can show; uploads turn it into a public https URL.
 */

export type ImageKind = 'tournament-logo' | 'tournament-banner' | 'match-logo' | 'club-logo' | 'org-logo' | 'player-photo' | 'sponsor-logo';

/** A URI only the device that picked it can open. */
export function isLocalImageUri(u?: string | null): boolean {
  return !!u && /^(file|blob|content|ph|assets-library):/i.test(u.trim());
}

/** The URI to render, or undefined: a device-local URI saved by an older build
 *  is useless on other devices (and after a web reload) — show the placeholder. */
export function displayableImage(u: string | null | undefined, allowLocal: boolean): string | undefined {
  if (!u) return undefined;
  if (!allowLocal && isLocalImageUri(u)) return undefined;
  return u;
}

/** Storage path `<uid>/<kind>/<now>-<rand>.<ext>` — the uid folder is what the
 *  bucket policy checks; the timestamp + random part make each upload unique. */
export function mediaPath(uid: string, kind: ImageKind, ext: string, now: number, rand: string): string {
  const e = (ext || 'jpg').toLowerCase().replace(/^\./, '').replace(/[^a-z0-9]/g, '') || 'jpg';
  return `${uid}/${kind}/${now}-${rand}.${e === 'jpeg' ? 'jpg' : e}`;
}

/** File extension for a MIME type (image/png → png); jpg when unknown. */
export function extForMime(mime?: string): string {
  const m = (mime ?? '').toLowerCase();
  if (m.endsWith('/png')) return 'png';
  if (m.endsWith('/webp')) return 'webp';
  if (m.endsWith('/gif')) return 'gif';
  return 'jpg';
}

/** Public URL of a `media` bucket object (parity #25's overlay sponsor `sp`). */
export function mediaPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/media/${path}`;
}

/** The bucket path inside a `media` public URL, or undefined (another host, a
 *  device-local URI, a demo upload). */
export function mediaPathFromUrl(url?: string | null): string | undefined {
  const m = /\/storage\/v1\/object\/public\/media\/([^?#]+)$/.exec(url ?? '');
  return m ? decodeURIComponent(m[1]) : undefined;
}
