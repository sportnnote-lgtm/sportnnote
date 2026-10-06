/**
 * Delete my account — explains exactly what goes and what stays, then requires
 * typing DELETE. Server: delete-account edge function (migration 0030).
 */
import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../core/theme';
import { Button, Card, FormError, TextField, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { deleteMyAccount } from '../data/repos';

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed.trim().toUpperCase() === 'DELETE';

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const err = await deleteMyAccount();
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }
    await signOut(); // back to the sign-in screen
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Text style={textStyles.h2}>Delete my account</Text>
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={[textStyles.body, { fontWeight: '700' }]}>What’s deleted, permanently</Text>
          <Text style={textStyles.muted}>• Your name, mobile, email, date of birth, photo, bio and guardian details</Text>
          <Text style={textStyles.muted}>• Uploaded age/ID proofs</Text>
          <Text style={textStyles.muted}>• The text of messages you sent</Text>
          <Text style={textStyles.muted}>• Your follows, notification settings and team/club memberships</Text>
          <Text style={textStyles.muted}>• Your login — you won’t be able to sign in again</Text>
        </Card>
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={[textStyles.body, { fontWeight: '700' }]}>What stays</Text>
          <Text style={textStyles.muted}>Scores of matches you played stay in other people’s histories and standings, shown as “Deleted player” — no longer linked to you.</Text>
        </Card>
        <Text style={textStyles.muted}>This can’t be undone. Tournaments you organise stay up for their players.</Text>
        <TextField label="Type DELETE to confirm" value={typed} onChange={setTyped} placeholder="DELETE" autoCapitalize="characters" />
        <FormError message={error} />
        <View style={{ opacity: ready ? 1 : 0.5 }}>
          <Button label={busy ? 'Deleting…' : 'Delete my account'} variant="danger" onPress={() => void confirm()} disabled={!ready || busy} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4) },
});
