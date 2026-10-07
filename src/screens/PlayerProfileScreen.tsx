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
import { isGuestSession, promptSignIn } from '../core/guest';
import { useProfileShare } from '../data/useProfileShare';
import { View, Text } from 'react-native';
import { Button, Card, textStyles } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

export default function PlayerProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PlayerProfile'>>();
  const { playerId } = route.params;
  const { profile, authed } = useAuth();
  const { isFollowing, toggle } = useFollow(profile?.id);
  const { player } = usePlayerProfile(playerId);

  // Title the nav bar after the player, not a generic "Player".
  useEffect(() => {
    if (player) nav.setOptions({ title: player.fullName });
  }, [nav, player?.fullName]);

  const shareProfile = useProfileShare(playerId);
  const age = ageOf(player);
  // Logged-out visitors see adult profiles only (DPDP §9): an under-18 — or a
  // player whose age we don't know — is members-only.
  if (isGuestSession(authed) && player && (age === undefined || age < 18)) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.gate}>
          <Card style={{ gap: theme.spacing(3), alignItems: 'center' }}>
            <Text style={textStyles.h3}>🔒 Members only</Text>
            <Text style={[textStyles.muted, { textAlign: 'center' }]}>This player’s profile is visible to SportnNote members. Join free to see their stats and follow their matches.</Text>
            <Button label="Join free" onPress={() => promptSignIn('up')} />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ProfileView
        playerId={playerId}
        onShare={player && (age ?? 0) >= 18 || player?.profileId === profile?.id ? shareProfile : undefined}
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
  gate: { flex: 1, justifyContent: 'center', padding: theme.spacing(4) },
});
