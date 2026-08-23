/** Auth: email/password sign-in & sign-up, passwordless email-code (OTP) sign-in,
 *  and password reset. Only shown when Supabase is configured (live mode).
 *
 *  OTP + reset use the 6-digit CODE flow (`verifyOtp`), not magic links — so no
 *  deep-link redirect handling is needed. The Supabase email templates must
 *  expose `{{ .Token }}` (the defaults do) for the code to arrive.
 *
 *  NOTE: live-only — this screen never mounts in demo mode, so it can't be
 *  previewed against the demo build. Verify on a staging Supabase project. */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../core/theme';
import { Button, Card, SelectChip, FormError, textStyles } from '../components/ui';
import { DateField } from '../components/DateTimeField';
import { useAuth } from '../core/auth';
import { ageFromDob } from '../core/age';
import { isValidPhone } from '../core/phone';
import type { Role } from '../core/types';

const ROLES: Role[] = ['player', 'parent', 'scorer', 'organizer', 'fan'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// SMS login is coded (sendPhoneOtp/verifyPhoneOtp) but needs a Supabase SMS
// provider AND the phone to exist on auth.users — neither is set up yet, so the
// SMS code path can't actually deliver. Keep it OFF for the pilot: email code +
// password only. Flip to true once an SMS provider is configured on the live
// project. Kept behind a flag (not deleted) so re-enabling is one line.
const SMS_LOGIN_ENABLED = false;

type Mode = 'in' | 'up';
type Flow = 'password' | 'otp' | 'reset';

export default function AuthScreen() {
  const { signIn, signUp, sendSignInOtp, verifySignInOtp, sendPhoneOtp, verifyPhoneOtp, sendPasswordReset, confirmPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('in');
  const [flow, setFlow] = useState<Flow>('password'); // sign-in sub-flow
  const [sent, setSent] = useState(false);             // OTP/reset: has the code been requested?
  const [otpChannel, setOtpChannel] = useState<'email' | 'phone'>('email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('');
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [role, setRole] = useState<Role>('parent');
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const age = ageFromDob(dob.trim());
  const minor = age !== undefined && age < 18;

  const clearFlow = () => { setSent(false); setCode(''); setNewPassword(''); setNote(null); setError(null); setOtpChannel('email'); };
  const switchMode = (m: Mode) => { setMode(m); setFlow('password'); clearFlow(); };
  const switchFlow = (f: Flow) => { setFlow(f); clearFlow(); };

  /** Run an auth call with busy/error/note handling; onOk fires only on success. */
  async function run(fn: () => Promise<{ error?: string }>, okNote?: string, onOk?: () => void) {
    setBusy(true); setError(null); setNote(null);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (okNote) setNote(okNote);
    onOk?.();
  }

  // Password sign-up / sign-in — captures identity + guardian consent on sign-up.
  function submitPassword() {
    if (mode === 'up') {
      if (!isValidPhone(mobile)) return setError('Enter your mobile number — it’s your SportnNote identity.');
      if (!dob.trim() || age === undefined) return setError('Enter a valid date of birth (YYYY-MM-DD).');
      if (minor) {
        if (!gName.trim()) return setError('A parent/guardian name is required to create an under-18 account.');
        if (!gPhone.trim() && !gEmail.trim()) return setError("Add the guardian's mobile or email — under-18 accounts need a guardian contact.");
        if (!consent) return setError('Parent/guardian consent is required for an under-18 account.');
      }
    }
    const guardian = minor && gName.trim()
      ? { name: gName.trim(), phone: gPhone.trim() || undefined, email: gEmail.trim() || undefined, consentedAt: new Date().toISOString() }
      : undefined;
    void run(() =>
      mode === 'in'
        ? signIn(email.trim(), password)
        : signUp(email.trim(), password, fullName.trim() || 'Player', role, dob.trim(), guardian, mobile.trim())
    );
  }

  // Passwordless OTP sign-in — email or SMS code.
  const otpRequest = () => {
    if (otpChannel === 'phone') {
      if (!isValidPhone(mobile)) return setError('Enter your mobile number to get an SMS code.');
      return void run(() => sendPhoneOtp(mobile.trim()), `We texted a 6-digit code to ${mobile.trim()}.`, () => setSent(true));
    }
    if (!email.trim()) return setError('Enter your email to get a code.');
    void run(() => sendSignInOtp(email.trim()), `We emailed a 6-digit code to ${email.trim()}.`, () => setSent(true));
  };
  const otpVerify = () => {
    if (!code.trim()) return setError('Enter the code we sent you.');
    void run(() =>
      otpChannel === 'phone'
        ? verifyPhoneOtp(mobile.trim(), code.trim())
        : verifySignInOtp(email.trim(), code.trim())
    ); // success → onAuthStateChange signs you in
  };

  // Password reset (recovery code flow).
  const resetRequest = () => {
    if (!email.trim()) return setError('Enter your account email.');
    void run(() => sendPasswordReset(email.trim()), `We emailed a reset code to ${email.trim()}.`, () => setSent(true));
  };
  const resetConfirm = () => {
    if (!code.trim()) return setError('Enter the reset code from your email.');
    if (newPassword.length < 6) return setError('Choose a new password (at least 6 characters).');
    void run(() => confirmPasswordReset(email.trim(), code.trim(), newPassword)); // success → signed in
  };

  const showPassword = mode === 'up' || (mode === 'in' && flow === 'password');
  const codeFlow = mode === 'in' && (flow === 'otp' || flow === 'reset');
  const otpPhone = mode === 'in' && flow === 'otp' && otpChannel === 'phone';

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.brand}>
          <Text style={st.logo}>🏅 Sport<Text style={st.logoAccent}>nNote</Text></Text>
          <Text style={[textStyles.muted, st.tagline]}>Play a Sport, Make a Note.</Text>
        </View>

        <Card style={st.formCard}>
          <View style={st.tabs}>
            <SelectChip label="Sign in" active={mode === 'in'} onPress={() => switchMode('in')} />
            <SelectChip label="Create account" active={mode === 'up'} onPress={() => switchMode('up')} />
          </View>

          {mode === 'up' && <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Aarav Mehta" />}
          {mode === 'up' && <Field label="Mobile number" value={mobile} onChange={setMobile} placeholder="+91 98765 43210" />}
          {mode === 'up' && (
            <>
              <DateField label="Date of birth" value={dob} onChange={setDob} />
              {age !== undefined && <Text style={st.ageHint}>Age: {age} yrs{minor ? ' — a parent/guardian is required' : ''}</Text>}
            </>
          )}

          {SMS_LOGIN_ENABLED && mode === 'in' && flow === 'otp' && !sent && (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={textStyles.muted}>Send my code by…</Text>
              <View style={st.roles}>
                <SelectChip label="✉️ Email" active={otpChannel === 'email'} onPress={() => setOtpChannel('email')} />
                <SelectChip label="💬 SMS" active={otpChannel === 'phone'} onPress={() => setOtpChannel('phone')} />
              </View>
            </View>
          )}
          {!otpPhone && <Field label="Email" value={email} onChange={setEmail} placeholder="you@school.edu" keyboardType="email-address" />}
          {otpPhone && <Field label="Mobile number" value={mobile} onChange={setMobile} placeholder="+91 98765 43210" />}
          {showPassword && <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" secure />}

          {/* OTP / reset: the 6-digit code, plus a new password for reset. */}
          {codeFlow && sent && <Field label="6-digit code" value={code} onChange={setCode} placeholder="123456" keyboardType="number-pad" />}
          {mode === 'in' && flow === 'reset' && sent && <Field label="New password" value={newPassword} onChange={setNewPassword} placeholder="••••••••" secure />}

          {mode === 'up' && minor && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.muted}>👪 Parent / Guardian (required for under-18)</Text>
              <Field label="Guardian name" value={gName} onChange={setGName} placeholder="Priya Mehta" />
              <Field label="Guardian mobile" value={gPhone} onChange={setGPhone} placeholder="+91…" />
              <Field label="Guardian email" value={gEmail} onChange={setGEmail} placeholder="parent@email.com" keyboardType="email-address" />
              <TouchableOpacity
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
                activeOpacity={0.8}
                onPress={() => setConsent((c) => !c)}
                style={st.consentRow}
              >
                <Text style={[st.checkbox, consent && st.checkboxOn]}>{consent ? '☑' : '☐'}</Text>
                <Text style={st.consentText}>
                  I am {gName.trim() ? `${gName.trim()}’s ` : 'the '}parent/guardian and I consent to them creating and using a SportnNote account.
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {mode === 'up' && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.muted}>I am a…</Text>
              <View style={st.roles}>
                {ROLES.map((r) => (
                  <SelectChip key={r} label={cap(r)} active={role === r} onPress={() => setRole(r)} />
                ))}
              </View>
            </View>
          )}

          {note ? <Text style={st.note}>{note}</Text> : null}
          <FormError message={error} />

          {/* Primary action + flow switches */}
          {mode === 'up' && <Button label={busy ? 'Please wait…' : 'Create account'} onPress={submitPassword} />}

          {mode === 'in' && flow === 'password' && (
            <>
              <Button label={busy ? 'Please wait…' : 'Sign in'} onPress={submitPassword} />
              <View style={st.linkRow}>
                <Text style={st.link} accessibilityRole="button" onPress={() => switchFlow('otp')}>Sign in with a code</Text>
                <Text style={st.link} accessibilityRole="button" onPress={() => switchFlow('reset')}>Forgot password?</Text>
              </View>
            </>
          )}

          {mode === 'in' && flow === 'otp' && (
            <>
              <Button label={busy ? 'Please wait…' : sent ? 'Verify & sign in' : otpChannel === 'phone' ? 'Text me a code' : 'Email me a code'} onPress={sent ? otpVerify : otpRequest} />
              <View style={st.linkRow}>
                {sent && <Text style={st.link} accessibilityRole="button" onPress={otpRequest}>Resend code</Text>}
                <Text style={st.link} accessibilityRole="button" onPress={() => switchFlow('password')}>Use password instead</Text>
              </View>
            </>
          )}

          {mode === 'in' && flow === 'reset' && (
            <>
              <Button label={busy ? 'Please wait…' : sent ? 'Reset password & sign in' : 'Send reset code'} onPress={sent ? resetConfirm : resetRequest} />
              <View style={st.linkRow}>
                {sent && <Text style={st.link} accessibilityRole="button" onPress={resetRequest}>Resend code</Text>}
                <Text style={st.link} accessibilityRole="button" onPress={() => switchFlow('password')}>Back to sign in</Text>
              </View>
            </>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: 'email-address' | 'number-pad';
}) {
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <Text style={textStyles.muted}>{label}</Text>
      <TextInput
        style={st.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        secureTextEntry={secure}
        autoCapitalize="none"
        keyboardType={keyboardType}
      />
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(5), gap: theme.spacing(5), flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: theme.spacing(1) },
  logo: { color: theme.colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  logoAccent: { color: theme.colors.primary },
  tagline: { textAlign: 'center' },
  formCard: { gap: theme.spacing(4) },
  tabs: { flexDirection: 'row', gap: theme.spacing(2) },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(3),
    paddingHorizontal: theme.spacing(3),
    color: theme.colors.text,
    fontSize: theme.font.body,
  },
  ageHint: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700' },
  consentRow: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-start' },
  checkbox: { fontSize: 20, color: theme.colors.textMuted, lineHeight: 22 },
  checkboxOn: { color: theme.colors.primary },
  consentText: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.small, lineHeight: 18 },
  note: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '600' },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
});
