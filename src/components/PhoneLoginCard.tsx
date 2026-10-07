/**
 * "Continue with your mobile number" — the primary sign-in on the web app.
 * Number → SMS code → signed in. A new number gets a short sign-up form (name,
 * DOB, role, guardian for under-18s, terms). See core/phoneLogin.ts.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, SelectChip, TextField, textStyles } from './ui';
import { DateField } from './DateTimeField';
import { ageFromDob } from '../core/age';
import { isValidPhone } from '../core/phone';
import { completePhoneSignup, confirmPhoneLogin, sendPhoneCode } from '../core/phoneLogin';
import type { Role } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

const ROLES: Role[] = ['player', 'parent', 'scorer', 'organizer', 'fan'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
type Step = 'phone' | 'code' | 'details' | 'unverified';

export function PhoneLoginCard({ onUseEmail }: { onUseEmail?: () => void }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // new-account details
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const age = ageFromDob(dob.trim());
  const minor = age !== undefined && age < 18;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    setBusy(false);
  };

  const send = () => run(async () => {
    if (!isValidPhone(phone)) throw new Error('Enter your 10-digit mobile number.');
    await sendPhoneCode(phone);
    setCode('');
    setStep('code');
  });

  const confirm = () => run(async () => {
    if (code.trim().length < 6) throw new Error('Enter the 6-digit code from the SMS.');
    const r = await confirmPhoneLogin(code);
    if (r.status === 'new') setStep('details');
    else if (r.status === 'unverified') { setNote(r.reason); setStep('unverified'); }
    // 'signed-in' → the app switches to Home on its own.
  });

  const create = () => run(async () => {
    if (!fullName.trim()) throw new Error('Enter your name.');
    if (!dob.trim() || age === undefined) throw new Error('Enter your date of birth.');
    if (minor && (!gName.trim() || (!gPhone.trim() && !gEmail.trim()) || !consent)) {
      throw new Error('Under-18 accounts need a parent/guardian’s name, contact and consent.');
    }
    if (!agreed) throw new Error('Please agree to the Terms of Use and Privacy Policy.');
    const r = await completePhoneSignup({
      fullName: fullName.trim(), dob: dob.trim(), role, agreed,
      guardian: minor ? { name: gName.trim(), phone: gPhone.trim() || undefined, email: gEmail.trim() || undefined, consent } : undefined,
    });
    if (r.status === 'unverified') { setNote(r.reason); setStep('unverified'); }
  });

  const Check = ({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) => (
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: on }} activeOpacity={0.8} onPress={onPress} style={st.checkRow}>
      <Text style={[st.box, on && st.boxOn]}>{on ? '☑' : '☐'}</Text>
      <Text style={st.checkText}>{children}</Text>
    </TouchableOpacity>
  );

  return (
    <Card style={st.card}>
      <Text style={textStyles.h3}>📱 Continue with your mobile number</Text>

      {step === 'phone' && (
        <>
          <Text style={textStyles.muted}>We’ll text you a code — no password needed.</Text>
          <TextField label="Mobile number" value={phone} onChange={setPhone} placeholder="98765 43210" autoCapitalize="none" />
          <FormError message={error} />
          <Button label={busy ? 'Sending…' : 'Send code'} onPress={() => void send()} disabled={busy} />
        </>
      )}

      {step === 'code' && (
        <>
          <Text style={textStyles.muted}>Enter the 6-digit code we sent to {phone}.</Text>
          <TextField label="Code" value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" autoCapitalize="none" />
          <FormError message={error} />
          <Button label={busy ? 'Checking…' : 'Continue'} onPress={() => void confirm()} disabled={busy} />
          <View style={st.links}>
            <Text style={st.link} onPress={() => { setStep('phone'); setError(null); }}>Change number</Text>
            <Text style={st.link} onPress={() => void send()}>Resend code</Text>
          </View>
        </>
      )}

      {step === 'details' && (
        <>
          <Text style={textStyles.muted}>Welcome! A few details to set up your account.</Text>
          <TextField label="Full name" value={fullName} onChange={setFullName} placeholder="Aarav Mehta" autoCapitalize="words" />
          <DateField label="Date of birth" value={dob} onChange={setDob} />
          {age !== undefined && <Text style={textStyles.muted}>Age: {age} yrs{minor ? ' — a parent/guardian is required' : ''}</Text>}
          <Text style={textStyles.muted}>I am a…</Text>
          <View style={st.wrap}>
            {ROLES.map((r) => <SelectChip key={r} label={cap(r)} active={role === r} onPress={() => setRole(r)} />)}
          </View>
          {minor && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.muted}>👪 Parent / Guardian (required for under-18)</Text>
              <TextField label="Guardian name" value={gName} onChange={setGName} placeholder="Priya Mehta" autoCapitalize="words" />
              <TextField label="Guardian mobile" value={gPhone} onChange={setGPhone} placeholder="+91…" autoCapitalize="none" />
              <TextField label="Guardian email" value={gEmail} onChange={setGEmail} placeholder="parent@email.com" autoCapitalize="none" />
              <Check on={consent} onPress={() => setConsent((c) => !c)}>
                I am {gName.trim() ? `${gName.trim()}’s ` : 'the '}parent/guardian and I consent to them creating and using a SportnNote account.
              </Check>
            </View>
          )}
          <Check on={agreed} onPress={() => setAgreed((a) => !a)}>
            I agree to the{' '}
            <Text style={st.link} onPress={() => nav.navigate('Legal', { doc: 'terms' })}>Terms of Use</Text>
            {' '}and{' '}
            <Text style={st.link} onPress={() => nav.navigate('Legal', { doc: 'privacy' })}>Privacy Policy</Text>
            {minor ? ', and my parent/guardian agrees on my behalf.' : '.'}
          </Check>
          <FormError message={error} />
          <Button label={busy ? 'Creating…' : 'Create account'} onPress={() => void create()} disabled={busy} />
        </>
      )}

      {step === 'unverified' && (
        <>
          <Text style={textStyles.body}>{note}</Text>
          {onUseEmail && <Button label="Sign in with email" variant="ghost" onPress={onUseEmail} />}
          <Text style={st.link} onPress={() => { setStep('phone'); setNote(null); }}>Use a different number</Text>
        </>
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  card: { gap: theme.spacing(3) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: theme.colors.accent, fontWeight: '700', fontSize: theme.font.small },
  checkRow: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-start' },
  box: { fontSize: 20, color: theme.colors.textMuted, lineHeight: 22 },
  boxOn: { color: theme.colors.primary },
  checkText: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.small, lineHeight: 18 },
});
