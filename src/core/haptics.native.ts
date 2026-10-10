/** SD-110 — a light haptic when a scoring tap registers (PHONE APP build; the web
 *  build uses haptics.ts).
 *  expo-haptics is a native module: an APK built before it was added doesn't have
 *  it, so we look for the native side first and silently do nothing without it. */
import { requireOptionalNativeModule } from 'expo';
import { hapticsPref } from './hapticsPref';

type HapticsApi = typeof import('expo-haptics');
let mod: HapticsApi | null | undefined;
function haptics(): HapticsApi | null {
  if (mod !== undefined) return mod;
  mod = null;
  try {
    if (requireOptionalNativeModule('ExpoHaptics')) mod = require('expo-haptics') as HapticsApi;
  } catch { mod = null; }
  return mod;
}

/** A scoring tap went in. */
export function tapFeedback() {
  if (!hapticsPref.get()) return;
  const h = haptics();
  if (h) void h.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {});
}
/** Undo — a different pattern so it can be told apart by feel. */
export function undoFeedback() {
  if (!hapticsPref.get()) return;
  const h = haptics();
  if (h) void h.notificationAsync(h.NotificationFeedbackType.Warning).catch(() => {});
}
