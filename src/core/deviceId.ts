/**
 * A stable id for this device (AsyncStorage `sportfolio.deviceId`) — the scoring
 * lock names a player AND a device, so the same person on a second phone is
 * asked before taking over. On the web each browser TAB gets its own suffix
 * (sessionStorage): two tabs would otherwise share one id and both "hold" it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY = 'sportfolio.deviceId';
const TAB_KEY = 'sportfolio.tabId';
let cached: string | null = null;

const rand = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

/** A random UUID v4 (event client ids). */
export function newUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function tabSuffix(): string {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  try {
    let t = window.sessionStorage.getItem(TAB_KEY);
    if (!t) { t = rand().slice(0, 6); window.sessionStorage.setItem(TAB_KEY, t); }
    return `:${t}`;
  } catch { return ''; }
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let base: string | null = null;
  try { base = await AsyncStorage.getItem(KEY); } catch { /* storage off */ }
  if (!base) {
    base = rand();
    try { await AsyncStorage.setItem(KEY, base); } catch { /* storage off */ }
  }
  cached = base + tabSuffix();
  return cached;
}
