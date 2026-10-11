/**
 * Short-lived in-memory read cache (perf audit F-19).
 *
 * Every screen hook refetches on focus, so moving between tabs repeated the
 * same big reads (all matches, all tournaments, players, organisations) many
 * times a minute. A read answered less than `ttlMs` ago is reused instead.
 *
 * Freshness rules — the user never sees stale data after their OWN actions:
 *  - ANY write through the Supabase client (insert / update / upsert / delete,
 *    a POST rpc, an edge function call, an upload) empties the cache when it
 *    starts AND when it finishes (`writeAwareFetch`, wired in core/supabase.ts),
 *    so a read racing the write can't keep the old answer either;
 *  - sign-out and account switch empty it (core/auth.tsx);
 *  - a read in flight when the cache is emptied is never stored, and later
 *    callers start a fresh read instead of joining it;
 *  - failed reads are never stored;
 *  - nothing is persisted: closing the app starts with an empty cache.
 * Other people's changes show up within `ttlMs` at most (it was "on the next
 * focus" before); live scoring has its own realtime channel and isn't cached.
 *
 * Pure — no imports — so it is unit-tested.
 */
export interface ReadCache {
  /** The cached answer for `key` if younger than the TTL (or still in flight), else `load()`. */
  get<T>(key: string, load: () => Promise<T>): Promise<T>;
  /** Forget everything (a write, sign-out, account switch). */
  invalidate(): void;
}

export const READ_CACHE_TTL_MS = 10_000;

export function createReadCache(ttlMs: number = READ_CACHE_TTL_MS, now: () => number = Date.now): ReadCache {
  let gen = 0;
  const entries = new Map<string, { gen: number; at: number; done: boolean; promise: Promise<unknown> }>();
  return {
    get<T>(key: string, load: () => Promise<T>): Promise<T> {
      const t = now();
      const hit = entries.get(key);
      // age counts from when the read STARTED, so an answer is never older than ttlMs
      if (hit && hit.gen === gen && (!hit.done || t - hit.at < ttlMs)) return hit.promise as Promise<T>;
      const promise = load();
      const entry = { gen, at: t, done: false, promise: promise as Promise<unknown> };
      entries.set(key, entry);
      promise.then(
        () => { entry.done = true; },
        () => { if (entries.get(key) === entry) entries.delete(key); },
      );
      return promise;
    },
    invalidate() {
      gen++;
      entries.clear();
    },
  };
}

/** Requests that only write analytics (telemetry.ts) — they change nothing any cached read returns. */
const ANALYTICS_ONLY = [/\/rest\/v1\/rpc\/track_events(?:\?|$)/, /\/rest\/v1\/rpc\/report_client_error(?:\?|$)/];

/** Does this request (possibly) change data? Everything but GET / HEAD / OPTIONS
 *  counts — erring on the side of emptying the cache — except analytics posts. */
export function isWriteRequest(method: string | undefined, url: string): boolean {
  const m = (method ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  return !ANALYTICS_ONLY.some((re) => re.test(url));
}

type FetchLike = (input: any, init?: any) => Promise<any>;

function requestParts(input: unknown, init?: { method?: string }): { method?: string; url: string } {
  if (typeof input === 'string') return { method: init?.method, url: input };
  const o = input as { href?: string; url?: string; method?: string } | null;
  const url = o?.href ?? o?.url ?? String(input);
  return { method: init?.method ?? o?.method, url };
}

/** Wrap a fetch so `onWrite` runs before and after every write request (see isWriteRequest). */
export function writeAwareFetch<F extends FetchLike>(base: F, onWrite: () => void): F {
  const wrapped = async (input: unknown, init?: { method?: string }) => {
    const { method, url } = requestParts(input, init);
    if (!isWriteRequest(method, url)) return base(input, init);
    onWrite();
    try {
      return await base(input, init);
    } finally {
      onWrite();
    }
  };
  return wrapped as unknown as F;
}

/** The app-wide cache used by data/repos.ts. */
export const readCache = createReadCache();

/** Empty the read cache (sign-out, account switch, a write outside the Supabase client). */
export function clearReadCache(): void {
  readCache.invalidate();
}
