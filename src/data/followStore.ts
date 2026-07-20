/**
 * In-memory set of things the user follows, keyed by `"<type>:<id>"` so a
 * player, team and tournament can't collide. Subscribe API powers
 * useSyncExternalStore; `hydrate()` fills it from the backend on load and
 * `toggle()` updates optimistically (the repo persists in live mode).
 */
export type FollowType = 'player' | 'team' | 'tournament';

const followed = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: string[] = [];

const keyOf = (type: FollowType, id: string) => `${type}:${id}`;

function emit() {
  snapshot = [...followed];
  listeners.forEach((l) => l());
}

export const followStore = {
  has: (type: FollowType, id: string) => followed.has(keyOf(type, id)),
  hydrate(keys: string[]) {
    followed.clear();
    keys.forEach((k) => followed.add(k));
    emit();
  },
  toggle(type: FollowType, id: string) {
    const k = keyOf(type, id);
    if (followed.has(k)) followed.delete(k);
    else followed.add(k);
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => snapshot,
};
