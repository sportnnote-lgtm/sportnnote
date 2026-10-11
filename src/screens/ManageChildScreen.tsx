/**
 * SD-152 — a linked parent/guardian manages their child's account: view and
 * download the child's data, confirm or withdraw consent, delete the account.
 * Reached from Settings → Link as a parent/guardian → Manage.
 * Server: guardian_children / guardian_export_child / guardian_set_consent RPCs
 * and the delete-account edge function ({ childPlayerId }).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, EmptyState, FormError, LoadingState, ScreenTitle, TextField, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import {
  exportSummary, getGuardianChildren, guardianDeleteChild, guardianExportChild, guardianSetConsent, saveExport,
  type DataExport, type GuardianChild,
} from '../data/privacy';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CONSENT_LABEL: Record<string, string> = {
  confirmed: 'Confirmed by you',
  self_declared: 'Given at sign-up',
  pending: 'Waiting for your confirmation',
  withdrawn: 'Withdrawn — account locked',
};

export default function ManageChildScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ManageChild'>>();
  const [child, setChild] = useState<GuardianChild | null | undefined>(undefined);
  const [data, setData] = useState<DataExport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  const load = useCallback(() => getGuardianChildren()
    .then((list) => setChild(list.find((c) => c.playerId === params.playerId) ?? null))
    .catch(() => setChild(null)), [params.playerId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key); setError(null); setNote(null);
    try { const m = await fn(); if (m) setNote(m); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong — try again.'); }
    finally { setBusy(null); }
  };

  if (child === undefined) return <SafeAreaView style={st.safe}><LoadingState /></SafeAreaView>;
  if (!child) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.content}>
          <EmptyState icon="👪" title="Not linked to this player" hint="Only the linked parent or guardian can manage a child’s account." />
        </View>
      </SafeAreaView>
    );
  }

  const view = () => run('view', async () => { setData(await guardianExportChild(child.playerId)); });
  const download = () => run('download', async () => {
    const d = data ?? await guardianExportChild(child.playerId);
    setData(d);
    const how = await saveExport(d, `sportnnote-${child.fullName.split(' ')[0].toLowerCase()}`);
    return how === 'downloaded' ? 'Downloaded — look for a .json file in your downloads.' : 'Choose where to save or send the file.';
  });
  const setConsent = (confirm: boolean) => run(confirm ? 'confirm' : 'withdraw', async () => {
    if (!confirm) {
      const ok = await askConfirm({
        title: `Withdraw consent for ${child.fullName}?`,
        message: 'Their account is locked straight away and deleted after 30 days unless you confirm again.',
        yesLabel: 'Yes, withdraw', noLabel: 'No, keep it', tone: 'danger',
      });
      if (!ok) return;
    }
    await guardianSetConsent(child.playerId, confirm);
    await load();
    return confirm ? 'Confirmed — their account is fully on.' : 'Withdrawn — their account is locked.';
  });
  const remove = () => run('delete', async () => {
    const ok = await askConfirm({
      title: `Delete ${child.fullName}’s data?`,
      message: child.hasAccount ? 'Their account, details, photos and ID proofs are deleted now. Match results stay as “Deleted player”.' : 'Their player details are deleted now. Match results stay as “Deleted player”.',
      yesLabel: 'Yes, delete', noLabel: 'No, keep it', tone: 'danger',
    });
    if (!ok) return;
    const err = await guardianDeleteChild(child.playerId);
    if (err) throw new Error(err);
    nav.goBack();
  });

  const consent = child.consent ? CONSENT_LABEL[child.consent] ?? child.consent : child.hasAccount ? 'Not needed (18 or over)' : 'No account yet — added by an organiser';

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={child.fullName} subtitle={`You’re their linked parent/guardian${child.age !== undefined ? ` · age ${child.age}` : ''}`} />

        <Card style={st.gap}>
          <Text style={textStyles.h3}>Consent</Text>
          <Text style={textStyles.body}>{consent}</Text>
          {child.limited && <Text style={textStyles.muted}>While it’s not confirmed, nobody can follow them or message about them, and only their teams see their profile.</Text>}
          {child.hasAccount && (child.consent === 'pending' || child.consent === 'withdrawn') && (
            <Button label={busy === 'confirm' ? 'Saving…' : '✅ Confirm consent'} onPress={() => void setConsent(true)} disabled={!!busy} />
          )}
          {child.hasAccount && (child.consent === 'confirmed' || child.consent === 'self_declared') && (
            <Button label={busy === 'withdraw' ? 'Saving…' : 'Withdraw consent'} variant="ghost" onPress={() => void setConsent(false)} disabled={!!busy} />
          )}
        </Card>

        <Card style={st.gap}>
          <Text style={textStyles.h3}>Their data</Text>
          <View style={st.row}>
            <Button label={busy === 'view' ? 'Loading…' : '👁️ View'} variant="ghost" style={st.flex} onPress={() => void view()} disabled={!!busy} />
            <Button label={busy === 'download' ? 'Preparing…' : '⬇️ Download'} variant="ghost" style={st.flex} onPress={() => void download()} disabled={!!busy} />
          </View>
          {data && (
            <View style={{ gap: theme.spacing(1) }}>
              {exportSummary(data).map((r) => (
                <View key={r.label} style={st.sumRow}>
                  <Text style={textStyles.muted}>{r.label}</Text>
                  <Text style={textStyles.body}>{r.value}</Text>
                </View>
              ))}
            </View>
          )}
          <Button label="Open their profile" variant="ghost" onPress={() => nav.navigate('PlayerProfile', { playerId: child.playerId })} />
        </Card>

        <Card style={st.gap}>
          <Text style={textStyles.h3}>Delete their data</Text>
          <Text style={textStyles.muted}>Deletes their {child.hasAccount ? 'account, ' : ''}personal details, photo and ID proofs. Scores of matches they played stay in other people’s histories as “Deleted player”.</Text>
          <TextField label="Type DELETE to confirm" value={typed} onChange={setTyped} placeholder="DELETE" autoCapitalize="characters" />
          <View style={{ opacity: typed.trim().toUpperCase() === 'DELETE' ? 1 : 0.5 }}>
            <Button label={busy === 'delete' ? 'Deleting…' : 'Delete their data'} variant="danger" onPress={() => void remove()} disabled={!!busy || typed.trim().toUpperCase() !== 'DELETE'} />
          </View>
        </Card>

        <FormError message={error} />
        {note && <Text style={[textStyles.body, { color: theme.colors.primary }]}>{note}</Text>}
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
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing(2) },
});
