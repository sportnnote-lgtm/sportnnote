/** Join a team via an invite code/link. The captain enters (or deep-links in
 *  with) a code, we resolve it to a team, and on claim they become its captain
 *  and can manage the squad. */
import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, ScreenTitle, FormError, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { getInvite, claimInvite } from '../data/repos';
import { captainStore } from '../data/captainStore';
import type { TeamInvite } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function JoinTeamScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'JoinTeam'>>();
  const { profile } = useAuth();
  const [code, setCode] = useState(params?.token ?? '');
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find() {
    setError(null);
    setInvite(null);
    if (!code.trim()) return setError('Enter an invite code.');
    setBusy(true);
    const inv = await getInvite(code);
    setBusy(false);
    if (!inv) return setError('That code isn’t valid.');
    setInvite(inv);
  }

  async function claim() {
    if (!invite) return;
    setBusy(true);
    const ok = await claimInvite(invite.token, profile?.id);
    setBusy(false);
    if (!ok) return setError('Could not claim — try again.');
    captainStore.add(invite.teamId);
    nav.navigate('Squad', { teamId: invite.teamId });
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Join a team" subtitle="Enter the invite code your organizer shared" />

        <TextField label="Invite code" value={code} onChange={setCode} placeholder="JOIN-1001" autoCapitalize="characters" />
        <FormError message={error} />
        <Button label={busy ? 'Checking…' : 'Find team'} onPress={find} />

        {invite && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.muted}>You’ve been invited to join</Text>
            <Text style={textStyles.h2}>{invite.teamName}</Text>
            <Text style={textStyles.muted}>as {invite.role}</Text>
            <Button label={busy ? 'Claiming…' : `Claim as ${invite.role}`} onPress={claim} />
          </Card>
        )}

        <Text style={st.note}>
          Opening a shared link (sportfolio.app/join/CODE) brings you here with the code filled in.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  note: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic', marginTop: theme.spacing(2) },
});
