/**
 * User-configurable reminder lead times. A small store (mirrors followStore)
 * holding the player's reminder timers as minutes-before-kickoff — any value, so
 * the user can set "45 minutes before", "2 hours before", etc. Per-tournament
 * overrides live on `Tournament.reminderLeadMinutes`.
 *
 * Offline-first: always cached in AsyncStorage (works logged-out / in demo). When
 * a signed-in profile is known (see `setReminderPrefsUser`, called from the auth
 * provider), the `user_reminder_prefs` cloud row becomes the cross-device source
 * of truth — hydrated on login and upserted on every change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../core/supabase';

export interface LeadOption { minutes: number; key: string; label: string; short: string }

/** Fixed presets used by the per-tournament override chips (organizer-facing). */
export const LEAD_OPTIONS: LeadOption[] = [
  { minutes: 1440, key: '1d', label: '1 day before', short: 'tomorrow' },
  { minutes: 60, key: '1h', label: '1 hour before', short: 'in 1 hour' },
  { minutes: 15, key: '15m', label: '15 minutes before', short: 'in 15 min' },
];

/** One-tap timers the notifications screen offers (minutes). */
export const LEAD_PRESETS = [5, 15, 30, 60, 120, 180, 1440];

/** Default: a day-before heads-up, an hour-before nudge, and a final 15-min alert. */
export const DEFAULT_LEAD_MINUTES = [1440, 60, 15];

/** Human "N units before" for any lead time, e.g. 90 → "1h 30m before". */
export function formatLead(m: number): string {
  if (m % 1440 === 0) { const d = m / 1440; return `${d} day${d > 1 ? 's' : ''} before`; }
  if (m % 60 === 0) { const h = m / 60; return `${h} hour${h > 1 ? 's' : ''} before`; }
  if (m > 60) { const h = Math.floor(m / 60); return `${h}h ${m % 60}m before`; }
  return `${m} min before`;
}

/** Friendly "starts <x>" label for a reminder body (handles any value). */
export const shortByMinutes = (m: number): string => {
  if (m % 1440 === 0) { const d = m / 1440; return d === 1 ? 'tomorrow' : `in ${d} days`; }
  if (m % 60 === 0) { const h = m / 60; return `in ${h} hour${h > 1 ? 's' : ''}`; }
  if (m > 60) { const h = Math.floor(m / 60); return `in ${h}h ${m % 60}m`; }
  return `in ${m} min`;
};

const PREFS_KEY = 'sportfolio.reminderPrefs.v1';
const sortedDesc = (xs: number[]) => [...new Set(xs)].sort((a, b) => b - a);

let leadMinutes = [...DEFAULT_LEAD_MINUTES];
const listeners = new Set<() => void>();
let snapshot: number[] = sortedDesc(leadMinutes);
// The signed-in user's profile id, when known — enables cross-device cloud sync.
let currentProfileId: string | null = null;

/** Best-effort upsert of the current timers to the user's cloud row. */
function pushCloud() {
  if (!isSupabaseConfigured || !supabase || !currentProfileId) return;
  void supabase
    .from('user_reminder_prefs')
    .upsert({ profile_id: currentProfileId, lead_minutes: leadMinutes, updated_at: new Date().toISOString() })
    .then(undefined, () => {}); // never let a sync failure break the UI
}

/** Apply timers received FROM the cloud: update local state + cache, notify —
 *  but do NOT push back (avoids an echo write on hydrate). */
function applyFromCloud(minutes: number[]) {
  leadMinutes = minutes;
  snapshot = sortedDesc(leadMinutes);
  void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(leadMinutes)).catch(() => {});
  listeners.forEach((l) => l());
}

function emit() {
  snapshot = sortedDesc(leadMinutes);
  void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(leadMinutes)).catch(() => {});
  pushCloud();
  listeners.forEach((l) => l());
}

/** Load saved timers from storage (call once at startup). */
export async function hydrateReminderPrefs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) { leadMinutes = JSON.parse(raw) as number[]; snapshot = sortedDesc(leadMinutes); listeners.forEach((l) => l()); }
  } catch {
    // keep the defaults
  }
}

/** Bind (or unbind, with null) the store to a signed-in user for cross-device
 *  sync. Called from the auth provider on login / logout. On bind we pull the
 *  cloud row if it exists (it wins), otherwise we seed it from the local cache. */
export async function setReminderPrefsUser(profileId: string | null): Promise<void> {
  currentProfileId = profileId;
  if (!profileId || !isSupabaseConfigured || !supabase) return;
  try {
    const { data } = await supabase
      .from('user_reminder_prefs')
      .select('lead_minutes')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (data && Array.isArray(data.lead_minutes)) {
      applyFromCloud(data.lead_minutes as number[]); // cloud is the cross-device source of truth
    } else {
      pushCloud(); // first time on this account — seed the cloud from the local cache
    }
  } catch {
    // offline or table missing — keep the local cache, sync will retry on next change
  }
}

export const reminderPrefsStore = {
  /** current lead times (minutes), longest first */
  get: () => snapshot,
  has: (m: number) => leadMinutes.includes(m),
  add(m: number) {
    if (m > 0 && !leadMinutes.includes(m)) { leadMinutes = [...leadMinutes, m]; emit(); }
  },
  remove(m: number) {
    leadMinutes = leadMinutes.filter((x) => x !== m);
    emit();
  },
  toggle(m: number) {
    leadMinutes = leadMinutes.includes(m) ? leadMinutes.filter((x) => x !== m) : [...leadMinutes, m];
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => snapshot,
};
