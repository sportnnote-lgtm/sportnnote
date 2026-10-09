/**
 * In-memory set of things the user follows, keyed by `"<type>:<id>"` so a
 * player, team and tournament can't collide. Subscribe API powers
 * useSyncExternalStore; `hydrate()` fills it from the backend on load and
 * `toggle()` updates optimistically (the repo persists in live mode).
 *
 * Alongside it: per-follow alert choices (#23) — only OFF switches are kept, and
 * an unfollow drops them so a re-follow starts with every alert on.
 */
import { normalizePrefs, wants as wantsAlert, type AlertKey, type FollowPrefs } from './followPrefs.ts';

export type FollowType = 'player' | 'team' | 'tournament';

const followed = new Set<string>();
const prefs = new Map<string, FollowPrefs>();
const listeners = new Set<() => void>();
let snapshot: string[] = [];

const keyOf = (type: FollowType, id: string) => `${type}:${id}`;

function emit() {
  // A new array each time — the prefs version rides along so useSyncExternalStore
  // re-renders bells when only the alert choices change.
  snapshot = [...followed];
  listeners.forEach((l) => l());
}

export const followStore = {
  has: (type: FollowType, id: string) => followed.has(keyOf(type, id)),
  hydrate(keys: string[], prefsByKey: Record<string, FollowPrefs> = {}) {
    followed.clear();
    prefs.clear();
    keys.forEach((k) => followed.add(k));
    for (const [k, p] of Object.entries(prefsByKey)) {
      const n = normalizePrefs(p);
      if (followed.has(k) && Object.keys(n).length) prefs.set(k, n);
    }
    emit();
  },
  toggle(type: FollowType, id: string) {
    const k = keyOf(type, id);
    if (followed.has(k)) {
      followed.delete(k);
      prefs.delete(k); // unfollow resets the alert choices
    } else followed.add(k);
    emit();
  },
  /** Alert choices for a follow ({} = all on). */
  prefsOf: (type: FollowType, id: string): FollowPrefs => prefs.get(keyOf(type, id)) ?? {},
  setPrefs(type: FollowType, id: string, p: FollowPrefs) {
    const k = keyOf(type, id);
    const n = normalizePrefs(p);
    if (Object.keys(n).length) prefs.set(k, n);
    else prefs.delete(k);
    emit();
  },
  /** Followed AND wants this alert. */
  wants: (type: FollowType, id: string, key: AlertKey): boolean =>
    followed.has(keyOf(type, id)) && wantsAlert(prefs.get(keyOf(type, id)), key),
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => snapshot,
};
