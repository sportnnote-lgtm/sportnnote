/**
 * Notification service. `notify()` is the single entry point used across the
 * app: it always adds to the in-app feed (notifyStore) and, on a real device,
 * also fires an OS notification via expo-notifications. Everything native is
 * guarded so web/demo runs never crash.
 *
 * `registerForPush()` asks permission and returns an Expo push token — that
 * token is what a server uses to deliver remote pushes (see
 * supabase/functions/notify-followers). On web or a simulator it returns null.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { notifyStore } from '../data/notifyStore';

let notifModule: typeof import('expo-notifications') | null = null;
async function getNotif() {
  if (Platform.OS === 'web') return null;
  if (!notifModule) notifModule = await import('expo-notifications');
  return notifModule;
}

// The signed-in account's own player id, set on login (see RootNavigator). Lets
// notify() tell "a message for me" (show locally) from "a message for someone
// else" (deliver as a REMOTE push to their device, so it lands even when their
// app is closed). Null until known.
let currentPlayerId: string | null = null;
export function setCurrentPlayerId(id: string | null) {
  currentPlayerId = id;
}

export async function notify(input: { title: string; body: string; playerId?: string; matchId?: string }) {
  // Addressed to another user → send a remote push to their devices (works when
  // their app is closed / phone locked). It must NOT show on this (the sender's)
  // device or land in this device's in-app feed.
  if (input.playerId && currentPlayerId && input.playerId !== currentPlayerId) {
    try {
      const { pushToPlayers } = await import('../data/repos');
      await pushToPlayers([input.playerId], { title: input.title, body: input.body, matchId: input.matchId });
    } catch {
      // best-effort — a failed remote push shouldn't break the calling action
    }
    return;
  }

  // For me (or no specific target): in-app feed + an immediate local banner.
  notifyStore.push({ ...input, at: Date.now() });
  const N = await getNotif();
  if (!N) return;
  try {
    await ensureAndroidChannel(N);
    await N.scheduleNotificationAsync({
      content: { title: input.title, body: input.body },
      trigger: null, // deliver immediately
    });
  } catch {
    // notifications not available (e.g. simulator without entitlement) — ignore
  }
}

/** Android 8+ requires a channel or notifications silently don't show. Idempotent. */
let channelReady = false;
async function ensureAndroidChannel(N: NonNullable<typeof notifModule>) {
  if (channelReady || Platform.OS !== 'android') { channelReady = true; return; }
  try {
    await N.setNotificationChannelAsync('default', {
      name: 'Match alerts',
      importance: N.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1DB954',
    });
  } catch {
    // ignore — channel API unavailable
  }
  channelReady = true;
}

/** Prefixes of notification identifiers this app owns (so we only ever cancel
 *  our own scheduled reminders, never anything else on the device). */
const OWNED_PREFIXES = ['player:', 'follow:', 'scorer:'];

/**
 * Reconcile the set of future, dated local notifications with `desired` so
 * reminders fire even when the app is backgrounded/closed (Phase E). Idempotent:
 * schedules the new ones, cancels ours that are no longer wanted, leaves the rest.
 * No-ops on web/simulator (no OS scheduler / push).
 */
export async function syncScheduledLocal(
  desired: { id: string; fireAt: number; title: string; body: string; playerId?: string; matchId?: string }[]
): Promise<void> {
  const N = await getNotif();
  if (!N) return;
  try {
    const now = Date.now();
    const wanted = desired.filter((d) => d.fireAt > now);
    const wantedIds = new Set(wanted.map((d) => d.id));

    const existing = await N.getAllScheduledNotificationsAsync();
    const existingOurs = new Set<string>();
    for (const s of existing) {
      const id = s.identifier;
      if (!OWNED_PREFIXES.some((p) => id.startsWith(p))) continue; // not ours — leave it
      existingOurs.add(id);
      if (!wantedIds.has(id)) await N.cancelScheduledNotificationAsync(id); // stale — drop
    }

    for (const d of wanted) {
      if (existingOurs.has(d.id)) continue; // already scheduled at the right time
      await N.scheduleNotificationAsync({
        identifier: d.id,
        content: { title: d.title, body: d.body, data: { playerId: d.playerId, matchId: d.matchId } },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(d.fireAt) },
      });
    }
  } catch {
    // scheduler unavailable (e.g. simulator without entitlement) — ignore
  }
}

export async function registerForPush(): Promise<string | null> {
  const N = await getNotif();
  if (!N) return null;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    await ensureAndroidChannel(N); // remote pushes need a channel to display in
    const Device = await import('expo-device');
    if (!Device.isDevice) return null; // simulators can't get a push token
    const existing = await N.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    // Pass the EAS project id explicitly — required for Expo push tokens in
    // standalone (APK / store) builds.
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch {
    return null;
  }
}
