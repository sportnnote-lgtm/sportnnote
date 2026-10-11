/**
 * Signed-URL cache for private images (pure — no React Native / Supabase
 * imports, so node tests can load it). Player photos are stored as
 * `private://player-photos/<path>`; every viewer needs a short-lived signed URL,
 * and a squad list can show dozens at once. This cache:
 *  • batches the refs asked for in the same tick into one sign request per bucket,
 *  • reuses a URL until shortly before it expires,
 *  • remembers a refusal (the viewer may not see that photo) for a while, so a
 *    list doesn't re-ask on every render — the placeholder shows instead.
 */
import { parsePrivateImageRef } from './imageUrl.ts';

/** Sign these paths in one bucket; returns path → URL (missing/null = refused). */
export type SignFn = (bucket: string, paths: string[], expiresInSec: number) => Promise<Record<string, string | null>>;

export interface SignedImageCache {
  /** The signed URL for a private ref (null when refused or not a private ref). */
  resolve(ref: string): Promise<string | null>;
  /** A cached, still-valid URL without asking (for a first render). */
  peek(ref: string): string | null | undefined;
  clear(): void;
}

export function createSignedImageCache(sign: SignFn, opts: { ttlSec?: number; now?: () => number; refusedForMs?: number } = {}): SignedImageCache {
  const ttlSec = opts.ttlSec ?? 3600;
  const now = opts.now ?? (() => Date.now());
  const refusedForMs = opts.refusedForMs ?? 5 * 60_000;
  // Renew 5 minutes (or 10% of a short TTL) before expiry.
  const margin = Math.min(5 * 60_000, ttlSec * 100);
  const cache = new Map<string, { url: string | null; until: number }>();
  const inflight = new Map<string, Promise<string | null>>();
  let queue: { bucket: string; path: string; ref: string; done: (u: string | null) => void }[] = [];
  let scheduled = false;

  const flush = async () => {
    scheduled = false;
    const batch = queue;
    queue = [];
    const byBucket = new Map<string, typeof batch>();
    for (const q of batch) byBucket.set(q.bucket, [...(byBucket.get(q.bucket) ?? []), q]);
    await Promise.all([...byBucket.entries()].map(async ([bucket, items]) => {
      let urls: Record<string, string | null> = {};
      try { urls = await sign(bucket, [...new Set(items.map((i) => i.path))], ttlSec); } catch { urls = {}; }
      for (const it of items) {
        const url = urls[it.path] ?? null;
        cache.set(it.ref, { url, until: url ? now() + ttlSec * 1000 - margin : now() + refusedForMs });
        inflight.delete(it.ref);
        it.done(url);
      }
    }));
  };

  const peek = (ref: string) => {
    const hit = cache.get(ref);
    return hit && hit.until > now() ? hit.url : undefined;
  };

  return {
    peek,
    resolve(ref) {
      const parsed = parsePrivateImageRef(ref);
      if (!parsed) return Promise.resolve(null);
      const hit = peek(ref);
      if (hit !== undefined) return Promise.resolve(hit);
      const pending = inflight.get(ref);
      if (pending) return pending;
      const p = new Promise<string | null>((done) => {
        queue.push({ ...parsed, ref, done });
        if (!scheduled) { scheduled = true; Promise.resolve().then(flush); }
      });
      inflight.set(ref, p);
      return p;
    },
    clear() { cache.clear(); },
  };
}
