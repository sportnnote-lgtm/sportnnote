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
  // A private storage ref needs a signed URL first (useImageUri does that).
  if (isPrivateImageRef(u)) return undefined;
  return u;
}

/** Player photos live in the PRIVATE `player-photos` bucket (migration
 *  protect_minors): the row stores `private://player-photos/<path>` and viewers
 *  get a short-lived signed URL — the storage policy only signs it for people
 *  allowed to see that player's full card (an under-18's photo is never public). */
export const PRIVATE_IMAGE_PREFIX = 'private://';
export const PLAYER_PHOTO_BUCKET = 'player-photos';

export function isPrivateImageRef(u?: string | null): boolean {
  return !!u && u.startsWith(PRIVATE_IMAGE_PREFIX);
}

export function privateImageRef(bucket: string, path: string): string {
  return `${PRIVATE_IMAGE_PREFIX}${bucket}/${path}`;
}

/** `private://<bucket>/<path>` → { bucket, path }, else undefined. */
export function parsePrivateImageRef(u?: string | null): { bucket: string; path: string } | undefined {
  if (!isPrivateImageRef(u)) return undefined;
  const rest = u!.slice(PRIVATE_IMAGE_PREFIX.length);
  const i = rest.indexOf('/');
  if (i <= 0 || i === rest.length - 1) return undefined;
  return { bucket: rest.slice(0, i), path: rest.slice(i + 1) };
}

/** Which bucket an upload goes to: player photos private, logos/banners public. */
export const isPrivateImageKind = (kind: ImageKind): boolean => kind === 'player-photo';

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
