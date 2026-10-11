/** "Link as a parent/guardian" — a parent signed in with THEIR OWN account enters
 *  the code emailed to the guardian address on their child's profile. From then
 *  on, messages about the child come to this account (the child never receives
 *  them), and the guardian email counts as verified. */
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, TextField, ScreenTitle, FormError, textStyles } from '../components/ui';
import { claimGuardianLink } from '../data/messages';
import { getGuardianChildren, type GuardianChild } from '../data/privacy';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function GuardianLinkScreen() {
  const nav = useNavigation<Nav>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [children, setChildren] = useState<GuardianChild[]>([]);

  // SD-152: with consent status, for the per-child Manage screen.
  const refresh = () => getGuardianChildren().then(setChildren).catch(() => {});
  useEffect(() => { void refresh(); }, []);

  const claim = async () => {
    setBusy(true); setError(null);
    try {
      await claimGuardianLink(code);
      setCode('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Link as a parent/guardian" subtitle="Receive messages about your child" />
        <Text style={textStyles.muted}>
          Coaches and scouts can&apos;t message players under 18 directly — their messages come to the parent/guardian. Enter the code we emailed you. Use your own account, not your child&apos;s.
        </Text>
        <TextField label="Code from the email" value={code} onChange={setCode} placeholder="e.g. 7KQ2XH9M" autoCapitalize="characters" />
        <FormError message={error} />
        <Button label={busy ? 'Linking…' : 'Link'} onPress={claim} disabled={busy || !code.trim()} />

        {children.length > 0 && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>You&apos;re the parent/guardian of</Text>
            {children.map((c) => (
              <View key={c.playerId} style={st.child}>
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body} accessibilityRole="link" onPress={() => nav.navigate('PlayerProfile', { playerId: c.playerId })}>👦 {c.fullName}</Text>
                  {c.consent === 'pending' && <Text style={[textStyles.muted, { color: theme.colors.accent }]}>Waiting for you to confirm</Text>}
                  {c.consent === 'withdrawn' && <Text style={[textStyles.muted, { color: theme.colors.danger }]}>Consent withdrawn — locked</Text>}
                </View>
                <Button label="Manage" variant="ghost" onPress={() => nav.navigate('ManageChild', { playerId: c.playerId })} />
              </View>
            ))}
            <Text style={textStyles.muted}>Manage: view, download or delete their data, and confirm or withdraw consent.</Text>
            <Button label="💬 Open messages" variant="ghost" onPress={() => nav.navigate('Messages')} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  child: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
});
