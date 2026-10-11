/**
 * Sign in / sign up with a mobile number (web) — Firebase sends the SMS code
 * (firebasePhone.ts); the phone-login edge function (migration 0035) turns the
 * proven number into a SportnNote session.
 */
import { supabase } from './supabase';
import { fnPath } from './functionPath';
import { firebasePhoneAvailable, sendPhoneCode as sendFirebaseCode, confirmPhoneCode, prewarmPhoneSdk, prewarmPhoneCode, releasePrewarmedPhoneCode } from './firebasePhone';
import { LEGAL_VERSION } from '../data/legal';
import type { GuardianContact, Role } from './types';

export const phoneLoginAvailable = (): boolean => !!supabase && firebasePhoneAvailable();

export { prewarmPhoneSdk, prewarmPhoneCode, releasePrewarmedPhoneCode };

/** Perf F-02: `phone-login` is rarely called, so it is nearly always cold
 *  (2–2.6 s measured). While the person reads the SMS, poke it with a GET — it
 *  answers 405 before touching the database — so the real call lands on a warm
 *  worker. Fire-and-forget; any failure is ignored. */
export function warmPhoneLogin(): void {
  if (!supabase) return;
  try {
    void Promise.resolve(supabase.functions.invoke(fnPath('phone-login'), { method: 'GET' })).catch(() => undefined);
  } catch { /* never let a warm-up break sign-in */ }
}

/** Step 1: text the code to `phone` (Firebase), then warm up the sign-in function. */
export async function sendPhoneCode(phone: string): Promise<void> {
  await sendFirebaseCode(phone);
  warmPhoneLogin();
}

export interface PhoneSignup {
  fullName: string;
  dob: string;
  role: Role;
  guardian?: Pick<GuardianContact, 'name' | 'phone' | 'email'> & { consent: boolean };
  agreed: boolean;
}

export type PhoneLoginResult =
  | { status: 'signed-in' }
  | { status: 'new' }                       // show the short sign-up form
  | { status: 'unverified'; reason: string };

/** The proven number's Firebase token, kept while the sign-up form is filled in. */
let pendingToken: string | null = null;

async function callPhoneLogin(idToken: string, signup?: PhoneSignup): Promise<PhoneLoginResult> {
  const { data, error } = await supabase!.functions.invoke(fnPath('phone-login'), {
    body: { idToken, ...(signup ? { signup: { ...signup, legalVersion: LEGAL_VERSION } } : {}) },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error((body as { error?: string } | null)?.error ?? 'Couldn’t sign in just now — try again.');
  }
  if (data?.status === 'ok' && data.tokenHash) {
    // Exchange the one-time token for a normal session (nothing is emailed).
    const { error: vErr } = await supabase!.auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' });
    if (vErr) throw new Error('Couldn’t complete sign-in — try again.');
    pendingToken = null;
    return { status: 'signed-in' };
  }
  if (data?.status === 'new') return { status: 'new' };
  if (data?.status === 'unverified') return { status: 'unverified', reason: String(data.reason ?? '') };
  throw new Error(String(data?.error ?? 'Couldn’t sign in just now — try again.'));
}

/** Step 2: the SMS code → signed in, or "new" (then call completePhoneSignup). */
export async function confirmPhoneLogin(code: string): Promise<PhoneLoginResult> {
  const token = await confirmPhoneCode(code);
  pendingToken = token;
  return callPhoneLogin(token);
}

/** Step 3 (new numbers): create the account with the sign-up details. */
export async function completePhoneSignup(signup: PhoneSignup): Promise<PhoneLoginResult> {
  if (!pendingToken) throw new Error('Your code has expired — send a new one.');
  return callPhoneLogin(pendingToken, signup);
}
