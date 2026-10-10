/** SD-110 — a short buzz when a scoring tap registers (WEB build; the phone app
 *  uses haptics.native.ts). The Vibration API exists on Android browsers; iOS
 *  Safari and desktops don't have it, so this quietly does nothing there. */
import { hapticsPref } from './hapticsPref';

function vibrate(pattern: number | number[]) {
  if (!hapticsPref.get()) return;
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }) : null;
    nav?.vibrate?.(pattern);
  } catch { /* not allowed here — ignore */ }
}

/** A scoring tap went in. */
export const tapFeedback = () => vibrate(12);
/** Undo — a different, double pattern so it can be told apart by feel. */
export const undoFeedback = () => vibrate([18, 60, 18]);
