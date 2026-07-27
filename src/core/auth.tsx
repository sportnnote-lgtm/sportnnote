/**
 * Auth context. When Supabase is configured it manages a real session
 * (email/password) and loads the user's profile. When it isn't, it hands back
 * a demo user so the whole app stays explorable offline.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { setReminderPrefsUser } from '../data/reminderPrefs';
import { normalizePhone } from './phone';
import type { GuardianContact, Profile, Role } from './types';

interface AuthState {
  loading: boolean;
  /** true when signed in OR in demo mode */
  authed: boolean;
  demo: boolean;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: Role,
    dob: string,
    guardian?: GuardianContact,
    /** the user's mobile — their primary identity key (mandatory at sign-up) */
    phone?: string
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Passwordless sign-in: email a 6-digit code to an EXISTING user. */
  sendSignInOtp: (email: string) => Promise<{ error?: string }>;
  /** Verify the 6-digit sign-in code; success establishes a session. */
  verifySignInOtp: (email: string, token: string) => Promise<{ error?: string }>;
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: error.message } : {};
    },
    signUp: async (email, password, fullName, role, dob, guardian, phone) => {
      if (!supabase) return {};
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      if (data.user) {
        const handle = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        // dob is captured at sign-up (mandatory); phone is the primary identity key;
        // the guardian (for under-18) is carried so the player profile picks it up.
        const { error: pErr } = await supabase
          .from('profiles')
          .insert({ id: data.user.id, full_name: fullName, handle, role, dob, phone: phone ? normalizePhone(phone) : null, guardian: guardian ?? null });
        if (pErr) return { error: pErr.message };
      }
      return {};
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
      return error ? { error: error.message } : {};
    },
    verifySignInOtp: async (email, token) => {
      if (!supabase) return {};
      // On success the session fires onAuthStateChange → loadProfile → signed in.
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      return error ? { error: error.message } : {};
    },
    // Password reset via the recovery-OTP code flow: email a code, verify it to
    // get a recovery session, then set the new password on that session.
    sendPasswordReset: async (email) => {
      if (!supabase) return {};
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      return error ? { error: error.message } : {};
    },
    confirmPasswordReset: async (email, token, newPassword) => {
      if (!supabase) return {};
      const { error: vErr } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
      if (vErr) return { error: vErr.message };
      const { error: uErr } = await supabase.auth.updateUser({ password: newPassword });
      return uErr ? { error: uErr.message } : {};
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
