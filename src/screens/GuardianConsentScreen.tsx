/**
 * SD-152 — the page a parent/guardian opens from the confirmation email
 * (…/guardian-consent?c=CODE). Works without an account. Shows only the child's
 * first name and age band, what SportnNote keeps and shows, and two equal
 * choices. Signed in to their own adult account, agreeing also links it so they
 * can manage the child's data (GuardianLink → Manage).
 * Server: guardian_consent_preview / guardian_consent_decide (migration
 * 20261020120000_privacy_rights.sql).
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, LoadingState, ScreenTitle, TextField, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { decideGuardianConsent, previewGuardianConsent, type ConsentPreview } from '../data/privacy';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function GuardianConsentScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'GuardianConsent'>>();
  const { profile, demo } = useAuth();
  const signedIn = !!profile && !demo;
  const [code, setCode] = useState(params?.c ?? '');
  const [preview, setPreview] = useState<ConsentPreview | null>(null);
  const [checking, setChecking] = useState(!!params?.c);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string; linked: boolean } | null>(null);

  const check = async (c: string) => {
    setChecking(true); setError(null);
    try { setPreview(await previewGuardianConsent(c)); }
    catch (e) { setPreview(null); setError(e instanceof Error ? e.message : 'That code didn’t work.'); }
    finally { setChecking(false); }
  };
  useEffect(() => { if (params?.c) void check(params.c); }, [params?.c]);

  const decide = async (approve: boolean) => {
    setBusy(true); setError(null);
    try { setDone(await decideGuardianConsent(code, approve, name.trim() || undefined)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(false); }
  };

  const child = preview?.childFirstName || 'Your child';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Parent or guardian consent" subtitle="SportnNote — school and club sports scores" />

        {done ? (
          <Card style={st.gap}>
            <Text style={textStyles.h3}>{done.status === 'confirmed' ? `Thank you — ${child}’s account is confirmed` : `Done — ${child}’s account is locked`}</Text>
            <Text style={textStyles.body}>
              {done.status === 'confirmed'
                ? 'They can now use SportnNote fully. Messages from coaches or organisers about them come to you, not to them.'
                : 'Their profile is hidden and following and messages are off. The account and its data will be deleted in 30 days unless you change your mind (ask them to send a new link).'}
            </Text>
            {done.linked
              ? <Text style={textStyles.muted}>Your account is now linked as their parent/guardian. Manage their data any time in Settings → Link as a parent/guardian.</Text>
              : <Text style={textStyles.muted}>To view, download or delete their data later, sign in with your own SportnNote account and link it under Settings → Link as a parent/guardian.</Text>}
            <Button label="🔒 Read the Privacy Policy" variant="ghost" onPress={() => nav.navigate('Legal', { doc: 'privacy' })} />
          </Card>
        ) : checking ? (
          <LoadingState label="Checking the link…" />
        ) : preview ? (
          <>
            <Card style={st.gap}>
              <Text style={textStyles.h3}>{child}{preview.ageBand ? ` (${preview.ageBand})` : ''} wants to use SportnNote</Text>
              <Text style={textStyles.body}>You got this because {child} gave your email as their parent or guardian.</Text>
              <Text style={[textStyles.body, { fontWeight: '700' }]}>What SportnNote keeps</Text>
              <Text style={textStyles.muted}>• Name, date of birth, mobile or email, and your contact details as their guardian</Text>
              <Text style={textStyles.muted}>• Their sports profile, matches, scores and stats</Text>
              <Text style={[textStyles.body, { fontWeight: '700' }]}>Who sees it</Text>
              <Text style={textStyles.muted}>• Their full profile only to people on their teams and in their tournaments; others see a reduced card, and logged-out visitors only initials</Text>
              <Text style={textStyles.muted}>• Coaches and scouts can’t message them — messages about them come to you</Text>
              <Text style={textStyles.muted}>• No ads, no selling of data, and their activity is never linked to analytics</Text>
              <Text style={textStyles.muted}>Data is stored in India (Mumbai). You can view, download or delete it, or withdraw consent, at any time.</Text>
              <Button label="🔒 Read the Privacy Policy" variant="ghost" onPress={() => nav.navigate('Legal', { doc: 'privacy' })} />
            </Card>
            <TextField label="Your name (optional)" value={name} onChange={setName} placeholder="e.g. Meera Kapoor" />
            {signedIn && (
              <Text style={textStyles.muted}>You’re signed in as {profile?.fullName}. If you agree, this account is linked as {child}’s parent/guardian so you can manage their data.</Text>
            )}
            <FormError message={error} />
            <View style={st.row}>
              <Button label="I don’t agree" variant="ghost" style={st.flex} onPress={() => void decide(false)} disabled={busy} />
              <Button label={busy ? 'Saving…' : 'I agree'} style={st.flex} onPress={() => void decide(true)} disabled={busy} />
            </View>
            <Text style={textStyles.muted}>By agreeing you confirm you are {child}’s parent or legal guardian and agree to the Terms of Use and Privacy Policy on their behalf.</Text>
          </>
        ) : (
          <>
            <Text style={textStyles.body}>Enter the code from the email we sent you.</Text>
            <TextField label="Code" value={code} onChange={setCode} placeholder="e.g. 7KQ2-XH9M-…" autoCapitalize="characters" />
            <FormError message={error} />
            <Button label="Continue" onPress={() => void check(code)} disabled={!code.trim()} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10), maxWidth: 720, width: '100%', alignSelf: 'center' },
  gap: { gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
});
