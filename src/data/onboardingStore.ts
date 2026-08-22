/** A tiny signal store so a "Replay tour" action can re-open the onboarding
 *  overlay on demand. The overlay subscribes to this; clearing the persisted
 *  "seen" flag alone wouldn't re-show it until the next app launch. */
let show = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const onboardingStore = {
  subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  getSnapshot() { return show; },
  /** Open the tour (idempotent). */
  request() { if (!show) { show = true; emit(); } },
  /** Close the tour. */
  done() { if (show) { show = false; emit(); } },
};
