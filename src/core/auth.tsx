/**
 * Auth context. When Supabase is configured it manages a real session
 * (email/password) and loads the user's profile. When it isn't, it hands back
 * a demo user so the whole app stays explorable offline.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { setReminderPrefsUser } from '../data/reminderPrefs';
import { normalizePhone } from './phone';
import { LEGAL_VERSION } from '../data/legal';
import type { GuardianContact, Profile, Role } from './types';

/** Turn a raw Supabase/network error into a plain, actionable message. Users
 *  should never see a stack trace or an internal error string. */
export function friendlyAuthError(raw?: string): string {
  const m = (raw ?? '').toLowerCase();
  if (!m) return 'Something went wrong. Please try again.';
  if (/(fetch|network|resolve host|failed to fetch|timeout|timed out|connection|econn|unreachable|offline)/.test(m))
    return "Can't reach the server. Check your internet connection and try again.";
  if (m.includes('email not confirmed')) return 'Please confirm your email first — open the link we sent to your inbox (check spam), then sign in.';
  if (/(invalid login|invalid credentials|invalid password)/.test(m)) return 'Wrong email or password. Try again, or reset your password.';
  if (/(already registered|already exists|user already)/.test(m)) return 'An account with this email already exists — try signing in instead.';
  if (/(rate limit|too many|429)/.test(m)) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('password') && (m.includes('6') || m.includes('short') || m.includes('at least'))) return 'Password must be at least 6 characters.';
  if (/(expired|invalid token|otp|incorrect code|token has)/.test(m)) return 'That code is incorrect or has expired. Request a new one.';
  if (/(invalid email|unable to validate email|valid email)/.test(m)) return 'Enter a valid email address.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Sign-ups are currently disabled. Please contact support.';
  return 'Something went wrong. Please try again.';
}

/** Is this error the "email not yet confirmed" case? Drives the resend prompt. */
const isUnconfirmed = (raw?: string) => (raw ?? '').toLowerCase().includes('email not confirmed');

/** Bridge the auth login email → the player's contact email. A confirmed sign-in
 *  email is already proven, so it counts as a verified contact email — no need to
 *  re-verify it in the profile, and the eligibility gate credits the channel the
 *  user logged in with. Runs on login; idempotent; never overwrites a different,
 *  user-set contact email. */
async function syncConfirmedEmailToPlayer(profileId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { data: authData } = await supabase.auth.getUser();
    const email = authData.user?.email;
    if (!email || !authData.user?.email_confirmed_at) return;
    const { data: pl } = await supabase
      .from('players_view') // email is a private column — read our own via the view
      .select('id, email, email_verified')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (!pl) return; // player row not created yet — createMyPlayer seeds it there
    if (!pl.email || (pl.email === email && !pl.email_verified)) {
      await supabase.from('players').update({ email, email_verified: true }).eq('id', pl.id);
    }
  } catch {
    /* non-fatal — verification still works from the profile */
  }
}

interface AuthState {
  loading: boolean;
  /** true when signed in OR in demo mode */
  authed: boolean;
  demo: boolean;
  profile: Profile | null;
  /** needsConfirm: sign-in failed only because the email isn't confirmed yet —
   *  the UI offers a "resend confirmation" action. */
  signIn: (email: string, password: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  /** Re-send the sign-up confirmation email (when it never arrived / expired). */
  resendConfirmation: (email: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: Role,
    dob: string,
    guardian?: GuardianContact,
    /** the user's mobile — their primary identity key (mandatory at sign-up) */
    phone?: string
    /** needsEmailConfirm: account created but no session yet — user must confirm
     *  their email before signing in (only when "Confirm email" is ON). */
  ) => Promise<{ error?: string; needsEmailConfirm?: boolean }>;
  signOut: () => Promise<void>;
  /** Passwordless sign-in: email a 6-digit code to an EXISTING user. */
  sendSignInOtp: (email: string) => Promise<{ error?: string }>;
  /** Verify the 6-digit sign-in code; success establishes a session. */
  verifySignInOtp: (email: string, token: string) => Promise<{ error?: string }>;
  /** Passwordless sign-in: SMS a 6-digit code to an EXISTING user's mobile. */
  sendPhoneOtp: (phone: string) => Promise<{ error?: string }>;
  /** Verify the 6-digit SMS code; success establishes a session. */
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error?: string }>;
  /** Email a password-reset code (recovery OTP) to the account. */
  sendPasswordReset: (email: string) => Promise<{ error?: string }>;
  /** Verify the reset code, then set the new password; success signs you in. */
  confirmPasswordReset: (email: string, token: string, newPassword: string) => Promise<{ error?: string }>;
}

const DEMO_PROFILE: Profile = {
  id: 'demo-user',
  fullName: 'Demo User',
  handle: 'demo',
  // demo user is support/admin (a superset of organizer) so the whole app —
  // including the verification review console — is explorable.
  role: 'support',
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(
    isSupabaseConfigured ? null : DEMO_PROFILE
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    // Hydrate any existing session, then react to future auth changes.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) loadProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
        void setReminderPrefsUser(null); // stop cross-device sync on sign-out
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, handle, avatar_url, role, school_id')
      .eq('id', userId)
      .single();
    if (data) {
      setProfile({
        id: data.id,
        fullName: data.full_name,
        handle: data.handle,
        avatarUrl: data.avatar_url ?? undefined,
        role: data.role,
        schoolId: data.school_id ?? undefined,
      });
      void setReminderPrefsUser(data.id); // pull this user's reminder timers across devices
      void syncConfirmedEmailToPlayer(data.id); // confirmed login email ⇒ verified contact email
    }
    setLoading(false);
  }

  const value: AuthState = {
    loading,
    authed: isSupabaseConfigured ? !!profile : true,
    demo: !isSupabaseConfigured,
    profile,
    signIn: async (email, password) => {
      if (!supabase) return {};
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) return {};
        return { error: friendlyAuthError(error.message), needsConfirm: isUnconfirmed(error.message) };
      } catch (e) {
        return { error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
      }
    },
    resendConfirmation: async (email) => {
      if (!supabase) return {};
      try {
        const { error } = await supabase.auth.resend({ type: 'signup', email });
        return error ? { error: friendlyAuthError(error.message) } : {};
      } catch (e) {
        return { error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
      }
    },
    signUp: async (email, password, fullName, role, dob, guardian, phone) => {
      if (!supabase) return {};
      try {
        const normPhone = phone ? normalizePhone(phone) : null;
        // Pass the profile fields as user metadata so the DB trigger (migration
        // 0011) can create the profile row — this works with OR without a session,
        // so it's correct whether or not "Confirm email" is on. (dob is mandatory;
        // phone is the primary identity key; guardian carries under-18 consent.)
        // legal_accepted: which Terms/Privacy version they agreed to, and when (consent record).
        const meta = { full_name: fullName, role, dob, phone: normPhone, ...(guardian ? { guardian } : {}), legal_accepted: { version: LEGAL_VERSION, at: new Date().toISOString() } };
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: meta } });
        if (error) return { error: friendlyAuthError(error.message) };

        if (data.session && data.user) {
          // We have a session (Confirm email OFF, or the trigger isn't deployed):
          // ensure the profile row exists. Idempotent — a harmless no-op when the
          // trigger already created it. This is the fallback that keeps sign-up
          // working on deployments where 0011 hasn't been applied yet.
          const handle = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
          const { error: pErr } = await supabase
            .from('profiles')
            .upsert(
              { id: data.user.id, full_name: fullName, handle, role, dob, phone: normPhone, guardian: guardian ?? null },
              { onConflict: 'id', ignoreDuplicates: true }
            );
          if (pErr) return { error: friendlyAuthError(pErr.message) };
          return {}; // session fires onAuthStateChange → loadProfile → signed in
        }

        // No session → Confirm email is ON. The DB trigger has already created the
        // profile; the user must confirm via the emailed link before signing in.
        return { needsEmailConfirm: true };
      } catch (e) {
        return { error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
      }
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut();
    },
    // Passwordless sign-in via a 6-digit email code (no deep-link redirect needed).
    // shouldCreateUser:false so this only signs in existing accounts — sign-up
    // stays the explicit password flow that also captures identity/guardian data.
    sendSignInOtp: async (email) => {
      if (!supabase) return {};
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      return error ? { error: friendlyAuthError(error.message) } : {};
    },
    verifySignInOtp: async (email, token) => {
      if (!supabase) return {};
      // On success the session fires onAuthStateChange → loadProfile → signed in.
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      return error ? { error: friendlyAuthError(error.message) } : {};
    },
    // Phone/SMS variant — mobile is the app's primary identity key, so a texted
    // code is the most natural passwordless path. Normalize so it matches the
    // stored number regardless of how the user typed it.
    sendPhoneOtp: async (phone) => {
      if (!supabase) return {};
      const { error } = await supabase.auth.signInWithOtp({ phone: normalizePhone(phone), options: { shouldCreateUser: false } });
      return error ? { error: friendlyAuthError(error.message) } : {};
    },
    verifyPhoneOtp: async (phone, token) => {
      if (!supabase) return {};
      const { error } = await supabase.auth.verifyOtp({ phone: normalizePhone(phone), token, type: 'sms' });
      return error ? { error: friendlyAuthError(error.message) } : {};
    },
    // Password reset via the recovery-OTP code flow: email a code, verify it to
    // get a recovery session, then set the new password on that session.
    sendPasswordReset: async (email) => {
      if (!supabase) return {};
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      return error ? { error: friendlyAuthError(error.message) } : {};
    },
    confirmPasswordReset: async (email, token, newPassword) => {
      if (!supabase) return {};
      const { error: vErr } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
      if (vErr) return { error: friendlyAuthError(vErr.message) };
      const { error: uErr } = await supabase.auth.updateUser({ password: newPassword });
      return uErr ? { error: friendlyAuthError(uErr.message) } : {};
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
