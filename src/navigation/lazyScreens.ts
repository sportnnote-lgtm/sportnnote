/**
 * On-demand screens (web performance). Only the tabs, sign-in and legal pages
 * are in the first download; every other screen is its own chunk, fetched when
 * opened — and prefetched in the background shortly after start-up, so
 * navigation stays instant. On native everything is in one bundle anyway.
 */
import React from 'react';
import { isStaleVersionError, reloadForNewVersion } from '../core/staleVersion';

const loaders: Array<() => Promise<unknown>> = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyScreen<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>): React.LazyExoticComponent<T> {
  loaders.push(load);
  return React.lazy(() => Promise.resolve(load()).catch((e: unknown) => {
    // Opened on an older version whose files are gone → fetch the newest app.
    if (isStaleVersionError(e) && reloadForNewVersion()) return new Promise<never>(() => undefined);
    throw e;
  }));
}

let prefetched = false;
/** Warm every lazy screen's chunk (idempotent; failures are retried on open). */
export function prefetchScreens(): void {
  if (prefetched) return;
  prefetched = true;
  // Metro's dev loader may hand back a bare thenable — normalise to a Promise.
  for (const load of loaders) {
    try { void Promise.resolve(load()).catch(() => undefined); } catch { /* retried on open */ }
  }
}
