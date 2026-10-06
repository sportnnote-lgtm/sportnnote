/** A tiny signal store so a "Replay tour" action can re-open the onboarding
 *  overlay on demand. The overlay subscribes to this; clearing the persisted
 *  "seen" flag alone wouldn't re-show it until the next app launch. */
let show = false;
/** 'pick' = first run: ask what they want to do first; 'tour' = the walkthrough. */
let mode: 'pick' | 'tour' = 'tour';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const onboardingStore = {
  subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  getSnapshot() { return show; },
  /** Open the walkthrough (idempotent) — e.g. Settings → Replay app tour. */
  request() { if (!show) { mode = 'tour'; show = true; emit(); } },
  /** First run: open with the "what do you want to do first?" picker. */
  requestFirstRun() { if (!show) { mode = 'pick'; show = true; emit(); } },
  mode() { return mode; },
  startTour() { mode = 'tour'; emit(); },
  /** Close the tour. */
  done() { if (show) { show = false; emit(); } },
};
