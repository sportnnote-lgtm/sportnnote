/**
 * Web push for the web app (migration 0031, public/sw.js). iPhones (iOS 16.4+)
 * deliver push only to a web app ADDED TO THE HOME SCREEN and opened from that
 * icon; Android/desktop browsers work in a normal tab. The permission prompt must
 * come from a tap, so `enableWebPush()` is called from a button.
 */
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';

const VAPID = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type WebPushStatus =
  | 'unsupported'    // native app (uses Expo push) or an old browser
  | 'needs-install'  // iPhone/iPad in Safari: add to Home Screen first
  | 'denied'         // the user blocked notifications for this site
  | 'off'            // available, not turned on yet
  | 'on';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';

function isIos(): boolean {
  const ua = navigator.userAgent || '';
  // iPadOS reports as Mac; touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function supported(): boolean {
  return isWeb() && !!VAPID && isSupabaseConfigured && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function webPushStatus(): Promise<WebPushStatus> {
  if (!isWeb()) return 'unsupported';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Ask permission, subscribe this browser and save it. Returns the new status,
 *  or throws an Error with a user-facing message. */
export async function enableWebPush(): Promise<WebPushStatus> {
  if (!supported()) throw new Error('Notifications aren’t available in this browser.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await supabase!.rpc('save_web_push_subscription', {
    p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw new Error('Couldn’t turn on notifications just now — try again.');
  return 'on';
}

export async function disableWebPush(): Promise<void> {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase!.rpc('remove_web_push_subscription', { p_endpoint: sub.endpoint }).then(() => undefined, () => undefined);
  await sub.unsubscribe().catch(() => false);
}
