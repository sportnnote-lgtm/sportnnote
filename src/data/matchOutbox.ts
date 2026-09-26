/**
 * Durable outbox for live-scoring events. Every tap the scorer makes is written
 * here FIRST (persisted to AsyncStorage), then synced to the backend (demo store
 * or Supabase). If the sync fails or the device is offline, the event stays
 * queued and re-flushes automatically — on reconnect, on an interval, and on the
 * next app launch — so a scorer's work is never lost to a dropped connection or a
 * closed tab.
 *
 * The event log stays the source of truth: queued (unsynced) events are merged
 * into replay on load, so the scoreboard/timeline are complete even after a crash
 * mid-match. Once an event is confirmed by the backend it's dropped from the queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appendMatchEvent } from './repos';
import type { MatchEventRecord } from '../core/types';

const keyFor = (matchId: string) => `sportfolio.outbox.${matchId}`;

// Per-match queues of events not yet confirmed by the backend, kept in memory
// (mirrored to AsyncStorage) so the UI can read counts synchronously.
const queues = new Map<string, MatchEventRecord[]>();
const hydrated = new Set<string>();
const flushing = new Set<string>();

// Consecutive failed sync attempts per match, and the last error seen. A dropped
// connection and a backend that keeps REJECTING an event look identical at the
// call site, but they need opposite messages: the first resolves itself, the
// second never will. After this many failures while the device still reports a
// working network, we stop calling it "offline" and say sync is stuck.
const failures = new Map<string, number>();
const lastError = new Map<string, string>();
const STUCK_AFTER = 3;

// On the web we get real online/offline events; on native we probe instead.
const hasOnlineEvents =
  typeof window !== 'undefined' && typeof window.addEventListener === 'function' && 'ononline' in window;
let online = hasOnlineEvents && typeof navigator !== 'undefined' ? navigator.onLine : true;

const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version++;
  listeners.forEach((l) => l());
}

async function persist(matchId: string) {
  const q = queues.get(matchId) ?? [];
  try {
    if (q.length) await AsyncStorage.setItem(keyFor(matchId), JSON.stringify(q));
    else await AsyncStorage.removeItem(keyFor(matchId));
  } catch {
    // storage unavailable — in-memory queue still protects the current session
  }
}

/** What the platform itself reports, independent of our own sync outcomes. */
const deviceOnline = () => (hasOnlineEvents && typeof navigator !== 'undefined' ? navigator.onLine : true);

export const matchOutbox = {
  isOnline: () => online,
  /** True when syncing keeps failing even though the device has a network — the
   *  queue is safe on this device but will NOT drain on its own. */
  isStuck: (matchId: string) => (failures.get(matchId) ?? 0) >= STUCK_AFTER && deviceOnline(),
  /** The last sync error for a match, for display/support. */
  syncError: (matchId: string) => lastError.get(matchId) ?? null,
  pendingCount: (matchId: string) => queues.get(matchId)?.length ?? 0,
  getPending: (matchId: string) => queues.get(matchId) ?? [],

  /** Load a match's persisted queue into memory (once). Returns the pending events. */
  async hydrate(matchId: string): Promise<MatchEventRecord[]> {
    if (!hydrated.has(matchId)) {
      hydrated.add(matchId);
      try {
        const raw = await AsyncStorage.getItem(keyFor(matchId));
        if (raw) queues.set(matchId, JSON.parse(raw) as MatchEventRecord[]);
      } catch {
        // ignore — start with an empty queue
      }
      emit();
    }
    return this.getPending(matchId);
  },

  /** Durably record an event, then try to sync it. */
  enqueue(matchId: string, rec: MatchEventRecord) {
    const q = queues.get(matchId) ?? [];
    q.push(rec);
    queues.set(matchId, q);
    void persist(matchId);
    emit();
    void this.flush(matchId);
  },

  /** Remove and return the last queued event — used to undo an unsynced tap. */
  popLast(matchId: string): MatchEventRecord | null {
    const q = queues.get(matchId);
    if (!q?.length) return null;
    const removed = q.pop()!;
    void persist(matchId);
    emit();
    return removed;
  },

  /** Drop all queued (unsynced) events for a match — used when resetting a match
   *  that was started by mistake, so nothing pending re-appears on rebuild. */
  clear(matchId: string) {
    queues.set(matchId, []);
    void persist(matchId);
    emit();
  },

  /** Try to sync a match's queue to the backend, oldest first. */
  async flush(matchId: string, force = false): Promise<void> {
    if (flushing.has(matchId)) return;
    if (force) failures.delete(matchId); // a manual retry gets a clean slate
    if (!online && !force) return; // known offline — wait for reconnect
    const q = queues.get(matchId);
    if (!q?.length) return;
    flushing.add(matchId);
    try {
      // Copy so undo/enqueue during the await can't corrupt our cursor.
      while (q.length) {
        const rec = q[0];
        try {
          await appendMatchEvent(matchId, rec);
        } catch (e) {
          const n = (failures.get(matchId) ?? 0) + 1;
          failures.set(matchId, n);
          lastError.set(matchId, e instanceof Error ? e.message : 'Sync failed');
          // Only claim we're offline while the device agrees. If the network is
          // up and the backend keeps refusing, keep everything queued but let
          // the UI say so instead of promising an automatic recovery.
          if (!deviceOnline()) online = false;
          emit();
          return;
        }
        if (q[0] === rec) q.shift(); // still the head (not undone mid-flush) → confirmed
        online = true;
        failures.delete(matchId);
        lastError.delete(matchId);
        await persist(matchId);
        emit();
      }
    } finally {
      flushing.delete(matchId);
    }
  },

  /** Flush every match with a pending queue (reconnect / interval / manual retry). */
  async flushAll(force = false): Promise<void> {
    await Promise.all([...queues.keys()].map((id) => this.flush(id, force)));
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => version,
};

// React to connectivity + retry periodically. On the web we trust online/offline
// events; on native (no such events) the interval force-probes to detect recovery.
if (hasOnlineEvents) {
  window.addEventListener('online', () => { online = true; emit(); void matchOutbox.flushAll(); });
  window.addEventListener('offline', () => { online = false; emit(); });
}
if (typeof setInterval === 'function') {
  setInterval(() => { void matchOutbox.flushAll(!hasOnlineEvents); }, 20_000);
}

// Test/inspection hook (parity with __sportfolioReminders): drive the offline
// simulation and read queue state deterministically from the web preview.
(globalThis as unknown as Record<string, unknown>).__sportfolioOutbox = {
  pendingCount: (id: string) => matchOutbox.pendingCount(id),
  isOnline: () => matchOutbox.isOnline(),
  getPending: (id: string) => matchOutbox.getPending(id),
  flushAll: (force?: boolean) => matchOutbox.flushAll(!!force),
  setOnline: (v: boolean) => { online = !!v; emit(); if (v) void matchOutbox.flushAll(); },
};
