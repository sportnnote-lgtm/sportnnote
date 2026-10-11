/**
 * Auth context. When Supabase is configured it manages a real session
 * (email/password) and loads the user's profile. When it isn't, it hands back
 * a demo user so the whole app stays explorable offline.
 */
import { startProfileZoneSync, stopProfileZoneSync } from '../data/profileRegion';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { setReminderPrefsUser } from '../data/reminderPrefs';
import { normalizePhone, rememberCountryFromPhone } from './phone';
import { legalVersionFor } from '../data/legal';
import { privacyCountry, US_UNDER_13_MESSAGE } from './privacyRegion';
import { analyticsChoice } from './analyticsConsent';
import { planAuthEvent, profileFromSession, confirmedLoginEmail } from './authEvents';
import { clearMyPlayerIdCache } from '../data/myPlayerIdMemo';
import { clearReadCache } from '../data/readCache';
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
 *  user-set contact email. The address comes from the session (perf F-06: no
 *  `getUser()` round trip; mobile sign-ups' placeholder is skipped before any read). */
async function syncConfirmedEmailToPlayer(profileId: string, email: string): Promise<void> {
  if (!supabase) return;
  try {
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

  // Perf F-05/F-07: who is shown / loading, read from inside the auth listener
  // (its closure is created once). See core/authEvents.ts for the rules.
  const st = useRef({ userId: null as string | null, loadingProfile: false, seq: 0, bootDone: false });
  const profileRef = useRef<Profile | null>(profile);
  const setProf = (p: Profile | null) => { profileRef.current = p; setProfile(p); };
  // F-06: the confirmed login email is copied to the player once per user+address per app run.
  const emailSynced = useRef(new Set<string>());

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    // Hydrate any existing session, then react to future auth changes.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) onAuth('BOOT', data.session.user);
      else if (!st.current.userId) setLoading(false);
    }).catch(() => {
      // never leave the launch spinner up when storage / the network fails
      if (!st.current.userId) setLoading(false);
    }).finally(() => { st.current.bootDone = true; });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      onAuth(event, session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onAuth(event: string, user: User | null) {
    const s = st.current;
    const shown = profileRef.current;
    const plan = planAuthEvent(event, user?.id, {
      userId: s.userId,
      hasProfile: !!shown && shown.id === s.userId,
      loadingProfile: s.loadingProfile,
    });
    if (plan === 'ignore') return;
    if (plan === 'signed-out' || !user) {
      s.userId = null;
      s.loadingProfile = false;
      s.seq++; // drop any profile read still in flight
      clearMyPlayerIdCache(); // F-10: never hand the next account this one's player id
      clearReadCache(); // F-19: nothing read as one account is served to the next
      emailSynced.current.clear();
      setProf(null);
      setLoading(false);
      void setReminderPrefsUser(null); // stop cross-device sync on sign-out
      stopProfileZoneSync();
      return;
    }
    if (plan === 'switch') {
      s.userId = user.id;
      clearMyPlayerIdCache(); // a different account (or the first) — re-resolve its player
      clearReadCache(); // F-19: nothing read as one account is served to the next
      // F-05: a fresh sign-in renders Home at once from the sign-up metadata while
      // `profiles` loads. Launch (BOOT) keeps waiting for the stored profile.
      const quick = s.bootDone && event === 'SIGNED_IN' ? profileFromSession(user) : null;
      if (quick) { setProf(quick); setLoading(false); }
      else { setProf(null); setLoading(true); }
      void loadProfile(user, true);
      return;
    }
    if (plan === 'retry') {
      setLoading(true);
      void loadProfile(user, true);
      return;
    }
    void loadProfile(user, false); // 'silent' — same user, profile on screen: no spinner
  }

  async function loadProfile(user: User, blocking: boolean) {
    if (!supabase) return;
    const s = st.current;
    const seq = ++s.seq;
    if (blocking) s.loadingProfile = true;
    let data: { id: string; full_name: string; handle: string; avatar_url: string | null; role: Role; school_id: string | null; time_zone: string | null } | null = null;
    try {
      const res = await supabase
        .from('profiles')
        .select('id, full_name, handle, avatar_url, role, school_id, time_zone')
        .eq('id', user.id)
        .single();
      data = res.data;
    } catch { /* treated like "no row" below */ }
    if (seq !== s.seq || s.userId !== user.id) return; // superseded (sign-out / other account)
    if (blocking) s.loadingProfile = false;
    if (data) {
      setProf({
        id: data.id,
        fullName: data.full_name,
        handle: data.handle,
        avatarUrl: data.avatar_url ?? undefined,
        role: data.role,
        schoolId: data.school_id ?? undefined,
      });
      void setReminderPrefsUser(data.id); // pull this user's reminder timers across devices
      startProfileZoneSync(data.id, data.time_zone); // SD-150: reminder emails use the app's zone
      const email = confirmedLoginEmail(user);
      if (email && !emailSynced.current.has(`${data.id}|${email}`)) {
        emailSynced.current.add(`${data.id}|${email}`);
        void syncConfirmedEmailToPlayer(data.id, email); // confirmed login email ⇒ verified contact email
      }
      // Your own number's country becomes the default dial code for numbers you type.
      void Promise.resolve(supabase.rpc('my_profile_private'))
        .then(({ data: priv }) => rememberCountryFromPhone((priv as { phone?: string | null }[] | null)?.[0]?.phone))
        .catch(() => { /* default stays the device region */ });
    } else if (blocking) {
      // No profile row (or the read failed): same end state as before — signed-out
      // UI — rather than leaving the quick sign-up-metadata profile on screen.
      setProf(null);
    }
    if (blocking) setLoading(false);
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
        const normPhone = normalizePhone(phone) || null; // E.164 (+…) — the identity key
        // Pass the profile fields as user metadata so the DB trigger (migration
        // 0011) can create the profile row — this works with OR without a session,
        // so it's correct whether or not "Confirm email" is on. (dob is mandatory;
        // phone is the primary identity key; guardian carries under-18 consent.)
        // legal_accepted: which Terms/Privacy version they agreed to, and when (consent record).
        // SD-152: `country` (device / Settings → Region) drives the server's under-18
        // rules (migration 20261020120000): India keeps the sign-up checkbox; elsewhere
        // the guardian confirms by email; US under-13s can't self-sign-up.
        // `analytics: 'denied'` carries an "Essential only" choice made before sign-up.
        const country = privacyCountry();
        const meta = {
          full_name: fullName, role, dob, phone: normPhone, ...(guardian ? { guardian } : {}), country,
          ...(analyticsChoice() === 'denied' ? { analytics: 'denied' } : {}),
          legal_accepted: { version: legalVersionFor(country), at: new Date().toISOString() },
        };
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: meta } });
        if (error) {
          // The server refuses US under-13 self sign-up (the screen checks first).
          if (/US_UNDER_13/.test(error.message)) return { error: US_UNDER_13_MESSAGE };
          return { error: friendlyAuthError(error.message) };
        }

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
      clearMyPlayerIdCache();
      clearReadCache(); // F-19: nothing read as one account is served to the next
      if (supabase) await supabase.auth.signOut();
      // Web: wipe the offline copies of data the service worker kept (public/sw.js).
      try {
        if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage('clear-data');
      } catch { /* not a browser */ }
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
