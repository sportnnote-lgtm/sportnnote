/**
 * Let calls that start at (almost) the same moment share one read (perf audit
 * F-09: Home's feed and tournament switcher both asked for every tournament at
 * once). A call shares the read already in flight only if that read started
 * less than `windowMs` ago — the same answer two parallel requests would get.
 * Anything later reads afresh, so nothing is ever served from a cache. Pure.
 */
export function shareInflight<T>(load: () => Promise<T>, windowMs: number, now: () => number = Date.now): () => Promise<T> {
  let current: { at: number; promise: Promise<T> } | null = null;
  return () => {
    const t = now();
    if (current && t - current.at < windowMs) return current.promise;
    const promise = load();
    const entry = { at: t, promise };
    current = entry;
    const done = () => { if (current === entry) current = null; };
    promise.then(done, done);
    return promise;
  };
}
