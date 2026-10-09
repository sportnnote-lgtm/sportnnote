/** Everything the user follows — players, teams and tournaments — in one place. */
import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Pill, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { FollowBell } from '../components/FollowBell';
import { useAuth } from '../core/auth';
import { useFollow, usePlayers, useTeams, useTournament } from '../data/hooks';
import { getSport } from '../sports/registry';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function FollowingScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const { idsOfType, toggle } = useFollow(profile?.id);
  const players = usePlayers();
  const teams = useTeams();
  const tournament = useTournament();

  const playerIds = idsOfType('player');
  const teamIds = idsOfType('team');
  const tournamentIds = idsOfType('tournament');

  const followedPlayers = players.filter((p) => playerIds.includes(p.id));
  const followedTeams = teams.filter((t) => teamIds.includes(t.id));
  const followedTournaments = tournament && tournamentIds.includes(tournament.id) ? [tournament] : [];
  const total = followedPlayers.length + followedTeams.length + followedTournaments.length;

  const [showAllTournaments, setShowAllTournaments] = React.useState(false);
  const [showAllTeams, setShowAllTeams] = React.useState(false);
  const [showAllPlayers, setShowAllPlayers] = React.useState(false);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Following" subtitle={`${total} followed`} />

        {total === 0 && (
          <Card>
            <Text style={textStyles.body}>You’re not following anything yet.</Text>
            <Text style={textStyles.muted}>Follow players, teams and tournaments to get their updates here.</Text>
          </Card>
        )}

        {followedTournaments.length > 0 && (
          <>
            <SectionHeader title="Tournaments" count={followedTournaments.length} onSeeAll={followedTournaments.length > SECTION_CAP ? () => setShowAllTournaments((v) => !v) : undefined} expanded={showAllTournaments} />
            {(showAllTournaments ? followedTournaments : followedTournaments.slice(0, SECTION_CAP)).map((t) => (
              <Card key={t.id} style={st.row}>
                <Text style={st.icon}>🏆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body}>{t.name}</Text>
                  <Text style={textStyles.muted}>{t.hostName}</Text>
                </View>
                <Unfollow onPress={() => toggle('tournament', t.id)} />
                <FollowBell type="tournament" id={t.id} name={t.name} />
              </Card>
            ))}
          </>
        )}

        {followedTeams.length > 0 && (
          <>
            <SectionHeader title="Teams" count={followedTeams.length} onSeeAll={followedTeams.length > SECTION_CAP ? () => setShowAllTeams((v) => !v) : undefined} expanded={showAllTeams} />
            {(showAllTeams ? followedTeams : followedTeams.slice(0, SECTION_CAP)).map((t) => (
              <Card key={t.id} style={st.row}>
                <View style={[st.dot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body}>{t.name}</Text>
                  <Text style={textStyles.muted}>{getSport(t.sport).icon} {getSport(t.sport).name}</Text>
                </View>
                <Unfollow onPress={() => toggle('team', t.id)} />
                <FollowBell type="team" id={t.id} name={t.name} />
              </Card>
            ))}
          </>
        )}

        {followedPlayers.length > 0 && (
          <>
            <SectionHeader title="Players" count={followedPlayers.length} onSeeAll={followedPlayers.length > SECTION_CAP ? () => setShowAllPlayers((v) => !v) : undefined} expanded={showAllPlayers} />
            {(showAllPlayers ? followedPlayers : followedPlayers.slice(0, SECTION_CAP)).map((p) => (
              <TouchableOpacity accessibilityRole="button" key={p.id} activeOpacity={0.85} onPress={() => nav.navigate('PlayerProfile', { playerId: p.id })}>
                <Card style={st.row}>
                  <View style={[st.avatar, { backgroundColor: (p.houseColor ?? theme.colors.surfaceAlt) + '33' }]}>
                    <Text style={[st.avatarText, { color: p.houseColor ?? theme.colors.primary }]}>
                      {p.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{p.fullName}</Text>
                    <Text style={textStyles.muted}>{p.houseName ?? 'Independent'}{p.city ? ` · ${p.city}` : ''}</Text>
                  </View>
                  <Unfollow onPress={() => toggle('player', p.id)} />
                  <FollowBell type="player" id={p.id} name={p.fullName} />
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Unfollow = ({ onPress }: { onPress: () => void }) => (
  <TouchableOpacity accessibilityRole="button" onPress={onPress} activeOpacity={0.8}>
    <Pill label="★ Following" color={theme.colors.primary} textColor="#06120D" />
  </TouchableOpacity>
);

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  section: { marginTop: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  icon: { fontSize: 24 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
});
