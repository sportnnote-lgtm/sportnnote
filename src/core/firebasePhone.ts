/**
 * Phone verification by SMS through Firebase Authentication (web).
 *
 * Why Firebase: sending OTP SMS in India needs TRAI DLT registration, which
 * needs a registered business. Firebase sends the SMS under Google's own
 * registration, so we can verify numbers now (≈ $0.07/SMS, Blaze plan).
 *
 * How it fits: Firebase is used ONLY to prove the user holds the number — it
 * never becomes our login. After the code is confirmed we take Firebase's signed
 * ID token (which carries the verified phone_number), hand it to our
 * `verify-phone-firebase` edge function — which checks Google's signature and that
 * the number matches the profile — and sign straight back out of Firebase.
 *
 * Web only for now: Firebase's JS SDK needs a (invisible) reCAPTCHA, which only
 * exists in a browser. The native app keeps its existing path (WhatsApp OTP once
 * that's live). Configure with EXPO_PUBLIC_FIREBASE_* — see docs/firebase-phone-setup.md.
 */
import { Platform } from 'react-native';
import type { Auth, ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { toE164 } from './phone';

// Expo inlines EXPO_PUBLIC_* only for direct `process.env.X` references.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebasePhoneAvailable = (): boolean =>
  Platform.OS === 'web' && typeof document !== 'undefined' && !!config.apiKey && !!config.projectId && !!config.authDomain;

/** A stored or typed number → E.164 for Firebase (core/phone.ts — no +91 guessing
 *  beyond the pre-E.164 rows, which were always Indian). */
export { toE164 };

let confirmation: ConfirmationResult | null = null;

/** An invisible reCAPTCHA and the DOM node it lives in. */
interface Captcha { v: RecaptchaVerifier; host: HTMLElement }
/** The verifier used by the latest send. */
let active: Captcha | null = null;
/** A verifier rendered ahead of time (perf F-01), never used yet. */
let warm: Captcha | null = null;
let warming: Promise<void> | null = null;

let authP: Promise<Auth> | null = null;
/** Firebase app + auth, initialised once (the SDK chunks load on first call). */
function authInstance(): Promise<Auth> {
  if (!authP) {
    authP = (async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getAuth } = await import('firebase/auth');
      const app = getApps()[0] ?? initializeApp(config as Required<typeof config>);
      return getAuth(app);
    })();
    authP.catch(() => { authP = null; }); // a failed chunk download is retried next time
  }
  return authP;
}

/** The invisible reCAPTCHA needs a DOM node — a FRESH one each time: reusing a
 *  node that already rendered a widget fails ("already been rendered"), which
 *  broke a second "Send code" (e.g. after changing the number). */
function newCaptcha(Verifier: typeof RecaptchaVerifier, auth: Auth): Captcha {
  const host = document.createElement('div');
  host.setAttribute('data-sn-recaptcha', '');
  document.body.appendChild(host);
  return { v: new Verifier(auth, host, { size: 'invisible' }), host };
}

function dispose(c: Captcha | null): void {
  if (!c) return;
  try { c.v.clear(); } catch { /* already gone */ }
  try { c.host.remove(); } catch { /* already gone */ }
}

/** Open connections to Google's sign-in hosts early (idempotent). */
function preconnect(): void {
  if (document.querySelector('link[data-sn-preconnect]')) return;
  for (const [href, cors] of [
    ['https://www.google.com', false],
    ['https://www.gstatic.com', false],
    ['https://identitytoolkit.googleapis.com', true],
  ] as const) {
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = href;
    if (cors) l.crossOrigin = 'anonymous';
    l.setAttribute('data-sn-preconnect', '');
    document.head.appendChild(l);
  }
}

/**
 * Perf F-01, step 1 (when the phone card appears): load the Firebase SDK chunks,
 * initialise auth and open connections to Google — nothing visible changes.
 */
export function prewarmPhoneSdk(): void {
  if (!firebasePhoneAvailable()) return;
  try { preconnect(); } catch { /* no <head> — fine */ }
  void Promise.all([authInstance(), import('firebase/auth')]).catch(() => undefined);
}

/**
 * Perf F-01, step 2 (once the person starts typing their number): render the
 * invisible reCAPTCHA ahead of time (its scripts and site key loaded), so the
 * "Send code" tap only runs the challenge and sends the SMS. Rendering is what
 * shows Google's small reCAPTCHA badge, so it waits for the phone flow to be
 * chosen rather than appearing on the sign-in page at once. Safe to call
 * repeatedly; a failure is silent and the send does the work itself, as before.
 */
export function prewarmPhoneCode(): void {
  if (!firebasePhoneAvailable() || warm || warming) return;
  try { preconnect(); } catch { /* no <head> — fine */ }
  const run = async (): Promise<void> => {
    const auth = await authInstance();
    const { RecaptchaVerifier: Verifier } = await import('firebase/auth');
    const c = newCaptcha(Verifier, auth);
    try {
      await c.v.render();
    } catch (e) {
      dispose(c);
      throw e;
    }
    if (warming === p) warm = c; // still wanted
    else dispose(c);             // released while it was loading
  };
  const p: Promise<void> = Promise.resolve().then(run);
  warming = p;
  p.catch(() => undefined).then(() => { if (warming === p) warming = null; });
}

/** Drop the pre-rendered reCAPTCHA if it was never used (the card went away). */
export function releasePrewarmedPhoneCode(): void {
  warming = null;
  dispose(warm);
  warm = null;
}

/** The pre-rendered verifier, if one is ready (or becomes ready within a few seconds). */
async function takeWarm(): Promise<Captcha | null> {
  if (!warm && warming) {
    await Promise.race([warming.catch(() => undefined), new Promise((r) => setTimeout(r, 5000))]);
  }
  const c = warm;
  warm = null;
  return c;
}

/** Friendly text for Firebase error codes. */
function explain(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('invalid-phone-number')) return 'That mobile number doesn’t look valid — check it on your profile.';
  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) return 'Too many codes requested — try again in a while.';
  if (code.includes('billing-not-enabled') || code.includes('operation-not-allowed')) return 'SMS verification isn’t switched on yet — please try later.';
  if (code.includes('invalid-verification-code')) return 'That code isn’t right — check the SMS and try again.';
  if (code.includes('code-expired')) return 'That code has expired — tap Verify to get a new one.';
  if (code.includes('captcha')) return 'Couldn’t confirm you’re not a robot — reload the page and try again.';
  if (code.includes('network-request-failed')) return 'No connection — check your internet and try again.';
  // Unknown: show Firebase's code so a screenshot tells us what happened.
  return `Couldn’t send the SMS just now — try again later.${code ? ` (${code})` : ''}`;
}

/** Send the SMS code to `phone`. Throws an Error with a user-facing message. */
export async function sendPhoneCode(phone: string): Promise<void> {
  if (!firebasePhoneAvailable()) throw new Error('SMS verification isn’t available here.');
  try {
    const auth = await authInstance();
    const { RecaptchaVerifier: Verifier, signInWithPhoneNumber } = await import('firebase/auth');
    // Every send uses a verifier that has never been used: the pre-rendered one
    // (F-01) if it's ready, otherwise a fresh one on a fresh node, as before.
    dispose(active);
    active = null;
    active = (await takeWarm()) ?? newCaptcha(Verifier, auth);
    const e164 = toE164(phone);
    if (!e164) throw Object.assign(new Error('invalid'), { code: 'auth/invalid-phone-number' });
    confirmation = await signInWithPhoneNumber(auth, e164, active.v);
  } catch (e) {
    dispose(active);
    active = null;
    // Unexpected Firebase failures go to our error reports (with the code).
    const code = (e as { code?: string })?.code ?? '';
    if (!/invalid-phone-number|too-many-requests|quota-exceeded|network-request-failed/.test(code)) {
      void import('./telemetry').then((t) => t.reportError(e)).catch(() => undefined);
    }
    throw new Error(explain(e));
  }
}

/** Confirm the SMS code; returns Firebase's signed ID token (carries the
 *  verified phone_number) and signs out of Firebase again. */
export async function confirmPhoneCode(code: string): Promise<string> {
  if (!confirmation) throw new Error('Tap Verify to get a code first.');
  try {
    const cred = await confirmation.confirm(code.trim());
    const token = await cred.user.getIdToken();
    const auth = await authInstance();
    await auth.signOut();
    confirmation = null;
    return token;
  } catch (e) {
    throw new Error(explain(e));
  }
}
