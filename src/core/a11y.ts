/**
 * SD-155 — accessibility plumbing shared by every screen (WCAG 2.1 AA).
 *
 *   • announce(msg)            — say something to the screen reader now
 *                                (iOS VoiceOver + Android TalkBack via
 *                                AccessibilityInfo; web via an aria-live region).
 *   • installWebA11y()         — web only, once at start-up: a visible keyboard
 *                                focus ring (2.4.7), Enter/Space on role=button
 *                                text links (2.1.1), and the polite/assertive
 *                                live regions announce() writes into (4.1.3).
 *   • useReducedMotion()       — the OS / browser "reduce motion" setting.
 *   • toggleA11y(selected, …)  — accessibilityState for native + aria-pressed /
 *                                aria-disabled for react-native-web (which
 *                                ignores accessibilityState).
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { theme } from './theme';

const isWeb = Platform.OS === 'web' && typeof document !== 'undefined';

// ── web live regions ──────────────────────────────────────────────────────────
// Visually hidden but read by screen readers (the standard "sr-only" clip).
const SR_ONLY = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';
let regions: { polite: HTMLElement; assertive: HTMLElement } | null = null;

function ensureRegions(): typeof regions {
  if (!isWeb) return null;
  if (regions && document.body.contains(regions.polite)) return regions;
  const make = (live: 'polite' | 'assertive') => {
    const el = document.createElement('div');
    el.setAttribute('aria-live', live);
    el.setAttribute('aria-atomic', 'true');
    el.setAttribute('role', live === 'assertive' ? 'alert' : 'status');
    el.setAttribute('data-a11y-announcer', live);
    el.style.cssText = SR_ONLY;
    document.body.appendChild(el);
    return el;
  };
  regions = { polite: make('polite'), assertive: make('assertive') };
  return regions;
}

let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Speak `message` through the platform screen reader. Safe to call anywhere;
 *  a no-op when there's nothing to say. `assertive` interrupts (errors only). */
export function announce(message: string | null | undefined, opts: { assertive?: boolean } = {}): void {
  const msg = (message ?? '').trim();
  if (!msg) return;
  if (isWeb) {
    const r = ensureRegions();
    if (!r) return;
    const el = opts.assertive ? r.assertive : r.polite;
    // Clear first so the same text twice ("Point to A" … "Point to A") is re-read.
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 30);
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { el.textContent = ''; }, 7000);
    return;
  }
  try { AccessibilityInfo.announceForAccessibility(msg); } catch { /* old runtime */ }
}

// ── web start-up ──────────────────────────────────────────────────────────────
let installed = false;

/** The CSS for the web focus ring (exported for tests). Offset so the ring sits
 *  on the dark page, where the amber has ≥10:1 contrast, not on the control. */
export const WEB_FOCUS_CSS = [
  `[role="button"]:focus-visible,[role="link"]:focus-visible,[role="tab"]:focus-visible,[role="checkbox"]:focus-visible,`,
  `[role="radio"]:focus-visible,[role="switch"]:focus-visible,[role="menuitem"]:focus-visible,[tabindex="0"]:focus-visible,`,
  `a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible`,
  `{outline:3px solid ${theme.colors.focus} !important;outline-offset:2px !important;}`,
  // Text inputs: ring hugs the field.
  `input:focus-visible,textarea:focus-visible{outline-offset:0 !important;}`,
  // Respect the OS "reduce motion" setting for any CSS transition/animation.
  `@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important;}}`,
].join('');

/** Web only, call once before the app renders. Idempotent. */
export function installWebA11y(): void {
  if (!isWeb || installed) return;
  installed = true;
  const style = document.createElement('style');
  style.setAttribute('data-a11y', 'focus');
  style.textContent = WEB_FOCUS_CSS;
  document.head.appendChild(style);
  if (!document.documentElement.lang) document.documentElement.lang = 'en';

  // react-native-web gives <Text onPress accessibilityRole="button"> a tab stop
  // but only wires onClick, so Enter/Space did nothing on those links. Touchables
  // handle their own keys (and stop the event), so anything reaching the
  // document here is an unhandled role=button/link/tab/checkbox → click it.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const space = e.key === ' ' || e.key === 'Spacebar';
    if (e.key !== 'Enter' && !space) return;
    const t = e.target as HTMLElement | null;
    if (!t || typeof t.getAttribute !== 'function') return;
    const tag = t.tagName;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
    const role = t.getAttribute('role');
    if (!role || !['button', 'link', 'tab', 'checkbox', 'radio', 'switch', 'menuitem'].includes(role)) return;
    if (space && role === 'link') return; // links activate on Enter only
    if (t.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault();
    t.click();
  });

  // Create the live regions once the body exists.
  if (document.body) ensureRegions();
  else document.addEventListener('DOMContentLoaded', () => ensureRegions(), { once: true });
}

// ── reduced motion ────────────────────────────────────────────────────────────
let reduceMotion = false;
let reduceMotionKnown = false;

/** True when the user asked the OS / browser to minimise motion. */
export function useReducedMotion(): boolean {
  const [on, setOn] = useState(reduceMotion);
  useEffect(() => {
    let live = true;
    if (!reduceMotionKnown) {
      AccessibilityInfo.isReduceMotionEnabled?.()
        .then((v) => { reduceMotion = !!v; reduceMotionKnown = true; if (live) setOn(!!v); })
        .catch(() => {});
    }
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
      reduceMotion = !!v;
      if (live) setOn(!!v);
    });
    return () => { live = false; sub?.remove?.(); };
  }, []);
  return on;
}

// ── toggle / state props ──────────────────────────────────────────────────────
type A11yStateProps = {
  accessibilityState: { selected?: boolean; disabled?: boolean; checked?: boolean };
};

/** State props for a toggle-like control: VoiceOver / TalkBack read
 *  "selected"/"dimmed" from accessibilityState; react-native-web ignores that
 *  prop, so the web also gets aria-pressed / aria-disabled. */
export function toggleA11y(selected: boolean | undefined, disabled?: boolean): A11yStateProps {
  const props: A11yStateProps & Record<string, unknown> = {
    accessibilityState: { ...(selected != null ? { selected } : {}), ...(disabled != null ? { disabled } : {}) },
  };
  if (Platform.OS === 'web') {
    if (selected != null) props['aria-pressed'] = selected;
    if (disabled) props['aria-disabled'] = true;
  }
  return props;
}
