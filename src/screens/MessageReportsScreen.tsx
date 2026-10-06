/** Support: reported in-app messages (migration 0027). Each report keeps the text
 *  as it was when reported. Actions: dismiss · remove the message · remove it and
 *  turn off the sender's messaging (and lift that later). Resolving a report
 *  resolves every open report on the same message. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { confirmAction } from '../core/confirm';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, Pill, ScreenTitle, SelectChip, FormError, textStyles } from '../components/ui';
import { getMessageReports, resolveMessageReport, liftMessagingBan, type MessageReport, type ReportAction } from '../data/messages';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ACTION_COPY: Record<ReportAction, { title: string; body: string; done: string }> = {
  dismiss: { title: 'Dismiss this report?', body: 'Nothing changes for the sender.', done: 'Dismissed' },
  remove: { title: 'Remove this message?', body: 'Both people will see “removed by SportnNote” instead. The report keeps the original text.', done: 'Removed' },
  ban: { title: 'Remove + turn off their messaging?', body: 'The message is removed and this person can no longer send messages until you lift it.', done: 'Messaging turned off' },
};

export default function MessageReportsScreen() {
  const nav = useNavigation<Nav>();
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [reports, setReports] = useState<MessageReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setReports(await getMessageReports(filter)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load reports'); setReports([]); }
  }, [filter]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const act = async (r: MessageReport, action: ReportAction) => {
    const c = ACTION_COPY[action];
    if (!(await confirmAction(c.title, c.body, 'Confirm', action !== 'dismiss'))) return;
    setBusyId(r.reportId);
    try { await resolveMessageReport(r.reportId, action); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update the report'); }
    finally { setBusyId(null); }
  };
  const lift = async (r: MessageReport) => {
    setBusyId(r.reportId);
    try { await liftMessagingBan(r.reportId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not lift the restriction'); }
    finally { setBusyId(null); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Message reports" subtitle="Reported in-app messages" />
        <View style={st.chips}>
          <SelectChip label="Open" active={filter === 'open'} onPress={() => setFilter('open')} />
          <SelectChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        </View>
        <FormError message={error} />
        {reports && reports.length === 0 && (
          <Card><Text style={textStyles.muted}>{filter === 'open' ? 'No open reports. 🎉' : 'No reports yet.'}</Text></Card>
        )}
        {(reports ?? []).map((r) => {
          const busy = busyId === r.reportId;
          return (
            <Card key={r.reportId} style={{ gap: theme.spacing(2) }}>
              <View style={st.top}>
                <Text style={[textStyles.muted, { flex: 1 }]}>{new Date(r.createdAt).toLocaleString()}</Text>
                {r.status === 'open'
                  ? <Pill label="Open" color={theme.colors.accent} textColor="#06120D" />
                  : <Pill label={r.resolution ?? r.status} color={theme.colors.surfaceAlt} textColor={theme.colors.textMuted} />}
              </View>
              <Text style={st.quote}>“{r.messageBody ?? '(message no longer available)'}”</Text>
              <Text style={textStyles.body}>
                From <Text style={st.bold}>{r.senderName ?? 'unknown'}</Text>
                {r.reportCount > 1 ? <Text style={st.warn}>  · {r.reportCount} reports in total</Text> : null}
              </Text>
              <Text style={textStyles.muted}>
                Reported by {r.reporterName ?? 'unknown'}
                {r.subjectName ? ` · ${r.viaGuardian ? 'about under-18 ' : 'to '}${r.subjectName}` : ''}
              </Text>
              {r.reason ? <Text style={textStyles.muted}>Reason: {r.reason}</Text> : null}
              {r.senderBanned ? <Text style={st.warn}>Sender&apos;s messaging is turned off.</Text> : null}
              {r.messageRemoved ? <Text style={textStyles.muted}>Message removed.</Text> : null}

              {r.threadId ? (
                <Button label="View conversation" variant="ghost" onPress={() => nav.navigate('Conversation', { threadId: r.threadId, title: 'Reported conversation', readOnly: true })} />
              ) : null}
              {r.status === 'open' && (
                <View style={{ gap: theme.spacing(2) }}>
                  <Button label="Dismiss" variant="ghost" onPress={() => void act(r, 'dismiss')} disabled={busy} />
                  <Button label="Remove message" variant="ghost" onPress={() => void act(r, 'remove')} disabled={busy} />
                  <Button label="Remove + turn off their messaging" variant="danger" onPress={() => void act(r, 'ban')} disabled={busy} />
                </View>
              )}
              {r.senderBanned && r.status !== 'open' ? (
                <Button label="Turn their messaging back on" variant="ghost" onPress={() => lift(r)} disabled={busy} />
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', gap: theme.spacing(2) },
  top: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  quote: { color: theme.colors.text, fontSize: theme.font.body, fontStyle: 'italic', backgroundColor: theme.colors.surfaceAlt, padding: theme.spacing(3), borderRadius: 10 },
  bold: { fontWeight: '800' },
  warn: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
});
