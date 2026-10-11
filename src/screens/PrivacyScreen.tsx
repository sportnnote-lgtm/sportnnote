/**
 * SD-152 — Settings → "Your data & privacy".
 *
 *   • Under-18 outside India: "Waiting for your parent or guardian" + send the
 *     confirmation email (guardian-consent edge function).
 *   • Added by an organiser before you joined: who added you and when, and what
 *     you can do about it (see / correct / download / delete).
 *   • Download my data (JSON — export_my_data RPC).
 *   • Analytics: "Allow analytics" / "Essential only" (core/analyticsConsent).
 *   • Parent or guardian: manage your child's account.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, LoadingState, ScreenTitle, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { analyticsChoice, analyticsState, setAnalyticsChoice, subscribeAnalyticsConsent, syncAnalyticsChoiceToAccount } from '../core/analyticsConsent';
import { analyticsNeedsConsent, privacyCountry } from '../core/privacyRegion';
import { exportMyData, exportSummary, getMyPrivacyStatus, requestGuardianConsent, saveExport, type DataExport, type PrivacyStatus } from '../data/privacy';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function PrivacyScreen() {
  const nav = useNavigation<Nav>();
  const { demo } = useAuth();
  const [status, setStatus] = useState<PrivacyStatus | null | undefined>(undefined);
  const [consent, setConsent] = useState(analyticsState());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<DataExport | null>(null);

  const load = useCallback(() => getMyPrivacyStatus().then(setStatus).catch(() => setStatus(null)), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeAnalyticsConsent(() => setConsent(analyticsState())), []);
  // The account follows this device's choice (e.g. one made on the banner before signing in).
  useEffect(() => {
    if (status && analyticsChoice() && status.analyticsOptOut !== (analyticsChoice() === 'denied')) void syncAnalyticsChoiceToAccount();
  }, [status]);

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key); setError(null); setNote(null);
    try { const msg = await fn(); if (msg) setNote(msg); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(null); }
  };

  const sendGuardianEmail = () => run('guardian', async () => {
    const r = await requestGuardianConsent();
    if (!r.sent) throw new Error(r.reason ?? 'Couldn’t send the email — try again later.');
    await load();
    return `Sent. Ask your parent or guardian to open the email${r.email ? ` (to ${r.email})` : ''} and tap the link.`;
  });

  const download = () => run('export', async () => {
    const data = await exportMyData();
    setExported(data);
    const how = await saveExport(data);
    return how === 'downloaded' ? 'Downloaded — look for a .json file in your downloads.' : 'Choose where to save or send the file.';
  });

  const country = status?.country ?? privacyCountry();
  const askFirst = analyticsNeedsConsent(country);
  const deleteBy = status?.guardianConsent === 'withdrawn' && status.guardianConsentAt
    ? day(new Date(new Date(status.guardianConsentAt).getTime() + 30 * 864e5).toISOString()) : '';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Your data & privacy" subtitle="See, download and control what SportnNote keeps about you" />
        {status === undefined && <LoadingState />}

        {status?.limited && status.guardianConsent === 'pending' && (
          <Card style={[st.gap, st.warn]}>
            <Text style={textStyles.h3}>Waiting for your parent or guardian</Text>
            <Text style={textStyles.body}>
              Because you’re under 18, a parent or guardian needs to confirm your account. Until they do, other people can’t follow you or send messages about you, and only your own teams see your profile.
            </Text>
            <Text style={textStyles.muted}>
              {status.pendingRequestSentAt
                ? `We emailed ${status.guardianEmailHint ?? 'them'} on ${day(status.pendingRequestSentAt)}. The link works for 7 days.`
                : `We’ll email ${status.guardianEmailHint ?? 'the parent or guardian email you gave'} a link to confirm.`}
            </Text>
            <Button label={busy === 'guardian' ? 'Sending…' : status.pendingRequestSentAt ? 'Send the email again' : 'Send the confirmation email'}
              onPress={() => void sendGuardianEmail()} disabled={!!busy} />
            <Text style={textStyles.muted}>Wrong email? Change it in Edit profile → Parent / guardian, then send again.</Text>
          </Card>
        )}
        {status?.limited && status.guardianConsent === 'withdrawn' && (
          <Card style={[st.gap, st.warn]}>
            <Text style={textStyles.h3}>Your account is locked</Text>
            <Text style={textStyles.body}>
              Your parent or guardian said no, or withdrew their consent. Your profile is hidden and following and messages are off.
              {deleteBy ? ` Your account will be deleted on ${deleteBy} unless they confirm again.` : ''}
            </Text>
            <Button label={busy === 'guardian' ? 'Sending…' : 'Ask them again'} variant="ghost" onPress={() => void sendGuardianEmail()} disabled={!!busy} />
          </Card>
        )}

        {!!status?.addedBy.length && (
          <Card style={st.gap}>
            <Text style={textStyles.h3}>Details an organiser added</Text>
            {status.addedBy.map((a) => (
              <Text key={a.playerId} style={textStyles.body}>
                {a.addedByName} added your player details on {day(a.addedAt)}, before you joined.
              </Text>
            ))}
            <Text style={textStyles.muted}>
              That record is now yours. You can see everything we hold (Download my data), correct it in Edit profile, or delete it with your account. Organisers usually add players to run a school or club event; tell us if you didn’t expect it.
            </Text>
          </Card>
        )}

        <Card style={st.gap}>
          <Text style={textStyles.h3}>Download my data</Text>
          <Text style={textStyles.muted}>
            A file (JSON) with your account, player profile, match stats, messages you sent, who you follow, your memberships and your consent choices.
          </Text>
          <Button label={busy === 'export' ? 'Preparing…' : '⬇️ Download my data'} onPress={() => void download()} disabled={!!busy} />
          {exported && (
            <View style={st.summary}>
              {exportSummary(exported).map((r) => (
                <View key={r.label} style={st.sumRow}>
                  <Text style={textStyles.muted}>{r.label}</Text>
                  <Text style={textStyles.body}>{r.value}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Card style={st.gap}>
          <Text style={textStyles.h3}>Analytics</Text>
          <Text style={textStyles.body}>
            {consent === 'allowed' ? 'On — we count which screens are opened to improve the app.' : consent === 'denied' ? 'Off — essential only.' : 'Not chosen yet — nothing is collected until you choose.'}
          </Text>
          <Text style={textStyles.muted}>
            {askFirst
              ? 'Where you are, we ask before any analytics. '
              : 'Analytics is on unless you switch it off. '}
            We never record what you type, never sell data and show no ads. Crash reports are always anonymous. Under-18 accounts are never linked to analytics.
          </Text>
          <View style={st.row}>
            <Button label="Essential only" variant={consent === 'denied' ? 'primary' : 'ghost'} style={st.flex} onPress={() => void setAnalyticsChoice('denied')} />
            <Button label="Allow analytics" variant={consent === 'allowed' ? 'primary' : 'ghost'} style={st.flex} onPress={() => void setAnalyticsChoice('granted')} />
          </View>
        </Card>

        <Card style={st.gap}>
          <Text style={textStyles.h3}>Parent or guardian</Text>
          <Text style={textStyles.muted}>
            {status?.guardianOf
              ? `You’re the linked parent or guardian of ${status.guardianOf === 1 ? 'one child' : `${status.guardianOf} children`}. You can view, download or delete their data, and confirm or withdraw consent.`
              : 'If you’re a parent, link your own account to your child’s to manage their data and receive messages about them.'}
          </Text>
          <Button label={status?.guardianOf ? '👪 Manage my child’s account' : '👪 Link as a parent/guardian'} variant="ghost" onPress={() => nav.navigate('GuardianLink')} />
        </Card>

        <FormError message={error} />
        {note && <Text style={[textStyles.body, { color: theme.colors.primary }]}>{note}</Text>}

        <View style={st.gap}>
          <Button label="🔒 Privacy Policy" variant="ghost" onPress={() => nav.navigate('Legal', { doc: 'privacy' })} />
          {!demo && <Button label="🗑️ Delete my account" variant="ghost" onPress={() => nav.navigate('DeleteAccount')} />}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(10), maxWidth: 720, width: '100%', alignSelf: 'center' },
  gap: { gap: theme.spacing(2) },
  warn: { borderColor: theme.colors.accent },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  summary: { gap: theme.spacing(1), marginTop: theme.spacing(1) },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
});
