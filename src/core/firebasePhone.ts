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
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';

// Expo inlines EXPO_PUBLIC_* only for direct `process.env.X` references.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebasePhoneAvailable = (): boolean =>
  Platform.OS === 'web' && typeof document !== 'undefined' && !!config.apiKey && !!config.projectId && !!config.authDomain;

/** A stored number → E.164 for Firebase. Indian 10-digit mobiles get +91. */
export function toE164(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10) return `+91${d}`;
  return `+${d}`;
}

let confirmation: ConfirmationResult | null = null;
let verifier: RecaptchaVerifier | null = null;

async function authInstance() {
  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app = getApps()[0] ?? initializeApp(config as Required<typeof config>);
  return getAuth(app);
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
    // The invisible reCAPTCHA needs a DOM node — a FRESH one each time: reusing a
    // node that already rendered a widget fails ("already been rendered"), which
    // broke a second "Send code" (e.g. after changing the number).
    try { verifier?.clear(); } catch { /* already gone */ }
    verifier = null;
    document.getElementById('sn-recaptcha')?.remove();
    const host = document.createElement('div');
    host.id = 'sn-recaptcha';
    document.body.appendChild(host);
    verifier = new Verifier(auth, host, { size: 'invisible' });
    confirmation = await signInWithPhoneNumber(auth, toE164(phone), verifier);
  } catch (e) {
    try { verifier?.clear(); } catch { /* ignore */ }
    verifier = null;
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
