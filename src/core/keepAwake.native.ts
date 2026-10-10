/** SD-110 — keep the screen on while scoring (PHONE APP build; the web build uses
 *  keepAwake.ts). expo-keep-awake is a native module: an APK built before it was
 *  added doesn't have it, so we look for the native side first and silently do
 *  nothing without it (the phone just sleeps as before). */
import { useEffect, useRef } from 'react';
import { requireOptionalNativeModule } from 'expo';

type KeepAwakeApi = typeof import('expo-keep-awake');
let mod: KeepAwakeApi | null | undefined;
function keepAwake(): KeepAwakeApi | null {
  if (mod !== undefined) return mod;
  mod = null;
  try {
    if (requireOptionalNativeModule('ExpoKeepAwake')) mod = require('expo-keep-awake') as KeepAwakeApi;
  } catch { mod = null; }
  return mod;
}

let seq = 0;
export function useKeepAwakeWhile(active: boolean): void {
  const tag = useRef(`sportnnote-scoring-${++seq}`).current;
  useEffect(() => {
    if (!active) return;
    const k = keepAwake();
    if (!k) return;
    void k.activateKeepAwakeAsync(tag).catch(() => {});
    return () => { void k.deactivateKeepAwake(tag).catch(() => {}); };
  }, [active, tag]);
}

export const wakeLockSupported = () => !!keepAwake();
