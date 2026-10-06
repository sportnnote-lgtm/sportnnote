import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { ProfileView } from '../components/ProfileView';
import { useAuth } from '../core/auth';
import { useFollow, usePlayerProfile } from '../data/hooks';
import { ageOf } from '../core/age';
import type { RootStackParamList } from '../navigation/types';

export default function PlayerProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PlayerProfile'>>();
  const { playerId } = route.params;
  const { profile } = useAuth();
  const { isFollowing, toggle } = useFollow(profile?.id);
  const { player } = usePlayerProfile(playerId);

  // Title the nav bar after the player, not a generic "Player".
  useEffect(() => {
    if (player) nav.setOptions({ title: player.fullName });
  }, [nav, player?.fullName]);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ProfileView
        playerId={playerId}
        follow={{ following: isFollowing('player', playerId), onToggle: () => toggle('player', playerId) }}
        onMessage={player && player.profileId !== profile?.id ? () => {
          const viaGuardian = (ageOf(player) ?? 0) < 18;
          nav.navigate('Conversation', {
            playerId,
            viaGuardian,
            title: viaGuardian ? `Parent/guardian of ${player.fullName}` : player.fullName,
          });
        } : undefined}
        onOpenSport={(sport) => nav.navigate('SportProfile', { playerId, sport })}
        onOpenOrg={(orgId) => nav.navigate('Organization', { orgId })}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
});
