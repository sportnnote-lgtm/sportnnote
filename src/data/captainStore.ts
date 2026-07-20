/**
 * In-memory set of team ids the signed-in user captains (claimed via an invite).
 * Subscribe API powers useSyncExternalStore; hydrated on load, updated when an
 * invite is claimed. Gates squad editing alongside the organizer role.
 */
const captained = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: string[] = [];

function emit() {
  snapshot = [...captained];
  listeners.forEach((l) => l());
}

export const captainStore = {
  has: (teamId: string) => captained.has(teamId),
  hydrate(ids: string[]) {
    captained.clear();
    ids.forEach((i) => captained.add(i));
    emit();
  },
  add(teamId: string) {
    captained.add(teamId);
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => snapshot,
};
