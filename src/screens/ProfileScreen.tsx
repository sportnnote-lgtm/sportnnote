import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { ProfileView } from '../components/ProfileView';
import { useAuth } from '../core/auth';
import { getMyPlayerId } from '../data/repos';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const { profile } = useAuth();
  const nav = useNavigation<Nav>();
  const [playerId, setPlayerId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getMyPlayerId(profile?.id).then((id) => on && setPlayerId(id));
      return () => {
        on = false;
      };
    }, [profile?.id])
  );

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ProfileView
        playerId={playerId}
        onOpenSport={playerId ? (sport) => nav.navigate('SportProfile', { playerId, sport }) : undefined}
        onEditProfile={playerId ? () => nav.navigate('EditProfile', { playerId }) : undefined}
        onOpenOrg={(orgId) => nav.navigate('Organization', { orgId })}
        onOpenSettings={() => nav.navigate('Settings')}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
});
