/** SD-110 — keep the screen on while scoring (WEB build; the phone app uses
 *  keepAwake.native.ts). Uses the Screen Wake Lock API where the browser has it.
 *  The browser drops the lock whenever the tab is hidden, so it is asked for
 *  again when the page becomes visible. Unsupported browsers: nothing happens. */
import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void>; released?: boolean; addEventListener?: (t: string, f: () => void) => void };
type WakeLockNav = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

export function useKeepAwakeWhile(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || typeof document === 'undefined') return;
    const wl = (navigator as WakeLockNav).wakeLock;
    if (!wl) return;
    let lock: Sentinel | null = null;
    let on = true;
    const acquire = async () => {
      if (!on || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const l = await wl.request('screen');
        if (!on) { void l.release().catch(() => {}); return; }
        lock = l;
      } catch { /* refused (battery saver, not visible…) — try again on the next visibility change */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') void acquire(); };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      on = false;
      document.removeEventListener('visibilitychange', onVis);
      if (lock) void lock.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}

/** For the demo/inspection: is a wake lock held right now? (web only) */
export const wakeLockSupported = () => typeof navigator !== 'undefined' && !!(navigator as WakeLockNav).wakeLock;
