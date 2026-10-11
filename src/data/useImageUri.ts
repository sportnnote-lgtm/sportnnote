/**
 * Render-ready image URIs. Public images (logos, banners, older adult photos)
 * pass straight through; a private player photo (`private://player-photos/…`)
 * is swapped for a signed URL — which the server only signs for viewers allowed
 * to see that player's full card (under-18s: their teams, tournaments, orgs and
 * guardian). Until it's signed, or if it's refused, callers get undefined and
 * show their initials placeholder.
 */
import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { displayableImage, isPrivateImageRef } from '../core/imageUrl';
import { createSignedImageCache } from '../core/signedImageCache';

const cache = createSignedImageCache(async (bucket, paths, expiresIn) => {
  if (!supabase) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error || !data) return {};
  const out: Record<string, string | null> = {};
  for (const r of data) if (r.path) out[r.path] = r.error ? null : r.signedUrl ?? null;
  return out;
});

// Who may see a photo depends on who is signed in — forget answers on a change.
supabase?.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') cache.clear();
});

/** Signed URL (or null) for a private ref; other URLs are returned unchanged. */
export async function resolveImageUri(u: string | null | undefined): Promise<string | null> {
  if (!u) return null;
  if (!isPrivateImageRef(u)) return u;
  return isSupabaseConfigured ? cache.resolve(u) : null;
}

/** displayableImage() + private-ref signing, as a hook. */
export function useImageUri(u: string | null | undefined, allowLocal = !isSupabaseConfigured): string | undefined {
  const priv = isPrivateImageRef(u);
  const [signed, setSigned] = useState<string | null | undefined>(() => (priv ? cache.peek(u!) : undefined));
  useEffect(() => {
    if (!priv) { setSigned(undefined); return; }
    let on = true;
    const hit = cache.peek(u!);
    if (hit !== undefined) { setSigned(hit); return; }
    setSigned(undefined);
    cache.resolve(u!).then((url) => { if (on) setSigned(url); });
    return () => { on = false; };
  }, [u, priv]);
  if (priv) return signed ?? undefined;
  return displayableImage(u, allowLocal);
}
