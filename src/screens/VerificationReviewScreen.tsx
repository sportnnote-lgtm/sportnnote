/** Internal support console: review the age / parent-guardian verification
 *  documents players have submitted, and approve or reject them. In a real
 *  build the document image/PDF arrives by email (see SUPPORT_EMAIL) and only
 *  the support team can open this; here it's reachable in the demo for review. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, Pill, TextField, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { getPendingVerifications, reviewVerification, SUPPORT_EMAIL } from '../data/repos';
import { notify } from '../core/notifications';
import { ageFromDob } from '../core/age';
import { isSupport } from '../core/roles';
import { useAuth } from '../core/auth';
import type { Player } from '../core/types';

export default function VerificationReviewScreen() {
  const { profile } = useAuth();
  const support = isSupport(profile?.role);
  const [pending, setPending] = useState<Player[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showPending, setShowPending] = useState(false);

  const load = useCallback(() => {
    if (!support) return;
    getPendingVerifications().then(setPending);
  }, [support]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const review = async (p: Player, status: 'approved' | 'rejected') => {
    setBusy(p.id);
    const note = status === 'rejected' ? (notes[p.id]?.trim() || undefined) : undefined;
    await reviewVerification(p.id, status, note, { id: profile?.id, name: profile?.fullName });
    // Notify with a clear follow-up: what's done and what (if anything) to do next.
    const minor = (ageFromDob(p.dob) ?? 99) < 18;
    const guardianContactsDone = !!(p.guardian?.phoneVerified && p.guardian?.emailVerified);
    const approvedBody = minor && !guardianContactsDone
      ? 'Your age & guardian are approved. Next: verify your guardian\'s mobile & email on your profile — then you can join teams, tournaments & matches.'
      : 'Verified ✓ You can now be added to teams, tournaments and matches.';
    void notify({
      title: status === 'approved' ? '☑️ Verification approved' : '✗ Verification needs attention',
      body: status === 'approved'
        ? approvedBody
        : `Rejected${note ? `: ${note}` : ''}. Please re-submit a clearer proof of date of birth on your profile.`,
      playerId: p.id,
    });
    setPending((list) => list.filter((x) => x.id !== p.id));
    setBusy(null);
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="🛡️ Verification review" subtitle="Support · age & guardian documents" />

        {!support ? (
          <Card><Text style={textStyles.body}>🔒 Restricted</Text><Text style={textStyles.muted}>This console is only available to the support team.</Text></Card>
        ) : (
        <>
        <Text style={textStyles.muted}>
          Submitted documents are routed to {SUPPORT_EMAIL}. Open each one, confirm the date of birth (and, for under-18 players, the parent/guardian), then approve or reject.
        </Text>

        {pending.length > 0 && (
          <SectionHeader title="Pending submissions" count={pending.length} onSeeAll={pending.length > SECTION_CAP ? () => setShowPending((v) => !v) : undefined} expanded={showPending} />
        )}
        {pending.length === 0 ? (
          <Card><Text style={textStyles.muted}>No pending submissions. 🎉</Text></Card>
        ) : (
          (showPending ? pending : pending.slice(0, SECTION_CAP)).map((p) => {
            const age = ageFromDob(p.dob);
            return (
              <Card key={p.id} style={{ gap: theme.spacing(2) }}>
                <View style={st.head}>
                  <Text style={[textStyles.body, { fontWeight: '800', flex: 1 }]}>{p.fullName}</Text>
                  <Pill label="⏳ Pending" color={theme.colors.surfaceAlt} textColor={theme.colors.accent} />
                </View>
                <Row label="Date of birth" value={`${p.dob ?? '—'}${age !== undefined ? `  ·  ${age} yrs${age < 18 ? ' (minor)' : ''}` : ''}`} />
                {p.guardian ? (
                  <Row label="Parent / Guardian" value={`${p.guardian.name}${p.guardian.phone ? `  ·  ${p.guardian.phone}` : ''}`} />
                ) : null}
                <Row label="Document" value={p.verification?.docName ?? '—'} />
                {p.verification?.submittedAt ? (
                  <Row label="Submitted" value={new Date(p.verification.submittedAt).toLocaleString()} />
                ) : null}

                <TextField
                  label="Reason (if rejecting)"
                  value={notes[p.id] ?? ''}
                  onChange={(v) => setNotes((n) => ({ ...n, [p.id]: v }))}
                  placeholder="e.g. Document is unclear / DOB doesn't match"
                />
                <View style={st.actions}>
                  <Button label="✗ Reject" variant="danger" style={st.flex} onPress={() => review(p, 'rejected')} disabled={busy === p.id} />
                  <Button label={busy === p.id ? '…' : '☑️ Approve'} style={st.flex} onPress={() => review(p, 'approved')} disabled={busy === p.id} />
                </View>
              </Card>
            );
          })
        )}
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.row}>
      <Text style={textStyles.muted}>{label}</Text>
      <Text style={[textStyles.body, { flex: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(3) },
  actions: { flexDirection: 'row', gap: theme.spacing(3), marginTop: theme.spacing(1) },
  flex: { flex: 1 },
});
