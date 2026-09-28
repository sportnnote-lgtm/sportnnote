/** Join a team (Club) via an invite code/link (spec §10, option 1). A member enters
 *  the code (or deep-links in with it), we resolve it to a club, and on Join they're
 *  added to the club as a member and land on the team dashboard. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, ScreenTitle, FormError, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { getClubInvite, claimClubInvite, getMyPlayerId } from '../data/repos';
import type { ClubInvite } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function JoinClubScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'JoinClub'>>();
  const { profile } = useAuth();
  const [code, setCode] = useState(params?.token ?? '');
  const [invite, setInvite] = useState<ClubInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find(auto?: string) {
    const c = (auto ?? code).trim();
    setError(null); setInvite(null);
    if (!c) return setError('Enter an invite code.');
    setBusy(true);
    const inv = await getClubInvite(c);
    setBusy(false);
    if (!inv) return setError('That code isn’t valid.');
    setInvite(inv);
  }

  // Auto-resolve when arriving via a deep link with a token.
  useEffect(() => { if (params?.token) find(params.token); /* eslint-disable-next-line */ }, [params?.token]);

  async function join() {
    if (!invite) return;
    setBusy(true);
    try {
      const myId = await getMyPlayerId(profile?.id);
      if (!myId) { setError('Finish setting up your player profile first, then try again.'); return; }
      const clubId = await claimClubInvite(invite.token, myId);
      if (!clubId) { setError('Could not join — try again.'); return; }
      nav.navigate('ClubHome', { clubId });
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Join a team" subtitle="Enter the invite code you were sent" />
        <TextField label="Invite code" value={code} onChange={setCode} placeholder="JOIN-1001" autoCapitalize="characters" />
        <FormError message={error} />
        <Button label={busy ? 'Checking…' : 'Find team'} onPress={() => find()} disabled={busy} />

        {invite && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>{invite.clubName ?? 'Team'}</Text>
            <Text style={textStyles.muted}>You’ll join as a member. The team’s admins can set your sport squads and roles.</Text>
            <Button label={busy ? 'Joining…' : 'Join team'} onPress={join} disabled={busy} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
});
