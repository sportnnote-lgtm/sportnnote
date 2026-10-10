/** SD-110 — per-device switch for the scoring-tap buzz (Settings → Preferences).
 *  On by default; stored on this device only. */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sportfolio.hapticsOff';
let on = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function hydrateHapticsPref(): Promise<void> {
  try { if ((await AsyncStorage.getItem(KEY)) === '1') { on = false; emit(); } } catch { /* keep default */ }
}

export const hapticsPref = {
  get: () => on,
  set(v: boolean) {
    if (v === on) return;
    on = v;
    emit();
    void (v ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, '1')).catch(() => {});
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getSnapshot: () => on,
};

export const useHapticsOn = () => useSyncExternalStore(hapticsPref.subscribe, hapticsPref.getSnapshot, hapticsPref.getSnapshot);
