import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { ProfileView } from '../components/ProfileView';
import { useAuth } from '../core/auth';
import { useFollow } from '../data/hooks';
import type { RootStackParamList } from '../navigation/types';

export default function PlayerProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PlayerProfile'>>();
  const { playerId } = route.params;
  const { profile } = useAuth();
  const { isFollowing, toggle } = useFollow(profile?.id);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ProfileView
        playerId={playerId}
        follow={{ following: isFollowing('player', playerId), onToggle: () => toggle('player', playerId) }}
        onOpenSport={(sport) => nav.navigate('SportProfile', { playerId, sport })}
        onOpenOrg={(orgId) => nav.navigate('Organization', { orgId })}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
});
