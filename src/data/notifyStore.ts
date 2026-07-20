/**
 * In-memory notification feed (newest first) with a subscribe API. This backs
 * the in-app inbox + unread badge. The OS-level push notification is fired
 * separately in core/notifications.ts; both are driven from the same `push()`.
 */
import type { AppNotification } from '../core/types';

let items: AppNotification[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  listeners.forEach((l) => l());
}

export const notifyStore = {
  push(n: { title: string; body: string; at: number; playerId?: string; matchId?: string }) {
    items = [{ ...n, id: `n-${counter++}`, read: false }, ...items].slice(0, 100);
    emit();
  },
  markAllRead() {
    if (items.some((i) => !i.read)) {
      items = items.map((i) => (i.read ? i : { ...i, read: true }));
      emit();
    }
  },
  unreadCount: () => items.reduce((n, i) => n + (i.read ? 0 : 1), 0),
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => items,
};
