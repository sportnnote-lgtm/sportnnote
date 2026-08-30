import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { ProfileView } from '../components/ProfileView';
import { useAuth } from '../core/auth';
import { getMyPlayerId, createMyPlayer } from '../data/repos';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const nav = useNavigation<Nav>();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getMyPlayerId(profile?.id).then((id) => on && setPlayerId(id));
      return () => {
        on = false;
      };
    }, [profile?.id])
  );

  // First-time setup: create the account's own player profile, then open the
  // editor so they can fill in their details.
  const createProfile = async () => {
    if (!profile?.id || creating) return;
    setCreating(true);
    try {
      const id = await createMyPlayer(profile.id);
      setPlayerId(id);
      nav.navigate('EditProfile', { playerId: id });
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ProfileView
        playerId={playerId}
        onOpenSport={playerId ? (sport) => nav.navigate('SportProfile', { playerId, sport }) : undefined}
        onEditProfile={playerId ? () => nav.navigate('EditProfile', { playerId }) : undefined}
        onOpenOrg={(orgId) => nav.navigate('Organization', { orgId })}
        onOpenSettings={() => nav.navigate('Settings')}
        onOpenVerificationReview={() => nav.navigate('VerificationReview')}
        onCreateProfile={createProfile}
        creating={creating}
        onSignOut={signOut}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
});
