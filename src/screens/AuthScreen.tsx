/** Email/password sign in & sign up. Only shown when Supabase is configured. */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
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

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('');
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gEmail, setGEmail] = useState('');
  const [role, setRole] = useState<Role>('parent');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const age = ageFromDob(dob.trim());
  const minor = age !== undefined && age < 18;

  async function submit() {
    if (mode === 'up') {
      // Your mobile number is your Sportfolio identity — mandatory, and unique to you.
      if (!isValidPhone(mobile)) return setError('Enter your mobile number — it’s your Sportfolio identity.');
      // DOB is mandatory at sign-up; under-18 accounts need a parent/guardian.
      if (!dob.trim() || age === undefined) return setError('Enter a valid date of birth (YYYY-MM-DD).');
      if (minor) {
        if (!gName.trim()) return setError('A parent/guardian name is required to create an under-18 account.');
        if (!gPhone.trim() && !gEmail.trim()) return setError("Add the guardian's mobile or email — under-18 accounts need a guardian contact.");
      }
    }
    setBusy(true);
    setError(null);
    const guardian = minor && gName.trim()
      ? { name: gName.trim(), phone: gPhone.trim() || undefined, email: gEmail.trim() || undefined }
      : undefined;
    const res =
      mode === 'in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, fullName.trim() || 'Player', role, dob.trim(), guardian, mobile.trim());
    if (res.error) setError(res.error);
    setBusy(false);
  }

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.brand}>
          <Text style={st.logo}>🏅 Sport<Text style={st.logoAccent}>folio</Text></Text>
          <Text style={[textStyles.muted, st.tagline]}>Track every sport, every match, every player.</Text>
        </View>

        <Card style={st.formCard}>
          <View style={st.tabs}>
            <SelectChip label="Sign in" active={mode === 'in'} onPress={() => setMode('in')} />
            <SelectChip label="Create account" active={mode === 'up'} onPress={() => setMode('up')} />
          </View>

          {mode === 'up' && (
            <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Aarav Mehta" />
          )}
          {mode === 'up' && (
            <Field label="Mobile number" value={mobile} onChange={setMobile} placeholder="+91 98765 43210" />
          )}
          {mode === 'up' && (
            <>
              <DateField label="Date of birth" value={dob} onChange={setDob} />
              {age !== undefined && <Text style={st.ageHint}>Age: {age} yrs{minor ? ' — a parent/guardian is required' : ''}</Text>}
            </>
          )}
          <Field label="Email" value={email} onChange={setEmail} placeholder="you@school.edu" keyboardType="email-address" />
          <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" secure />

          {mode === 'up' && minor && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.muted}>👪 Parent / Guardian (required for under-18)</Text>
              <Field label="Guardian name" value={gName} onChange={setGName} placeholder="Priya Mehta" />
              <Field label="Guardian mobile" value={gPhone} onChange={setGPhone} placeholder="+91…" />
              <Field label="Guardian email" value={gEmail} onChange={setGEmail} placeholder="parent@email.com" keyboardType="email-address" />
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

          <FormError message={error} />

          <Button label={busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} />
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
  keyboardType?: 'email-address';
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
});
