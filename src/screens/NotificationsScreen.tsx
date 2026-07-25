/** In-app notification inbox. Lists alerts fired while the app is open (e.g. a
 *  followed player scoring), plus a roll-up of recent activity from players you
 *  follow. Opening the screen marks everything read. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { useAuth } from '../core/auth';
import { useNotifications, useFollow, usePlayerSummaries } from '../data/hooks';
import { notifyStore } from '../data/notifyStore';
import { getMatch } from '../data/repos';
import { getSport } from '../sports/registry';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function timeAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function NotificationsScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const { items } = useNotifications();
  const { idsOfType } = useFollow(profile?.id);
  const followedIds = idsOfType('player');
  const summaries = usePlayerSummaries();
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);

  useEffect(() => {
    notifyStore.markAllRead();
  }, [items.length]);

  const followed = summaries.filter((s) => followedIds.includes(s.player.id));
  const followedRecent = followed.flatMap(({ player, stats }) =>
    stats.recent.map((l) => ({ player, l }))
  );

  // Open the page where the action happens: the match for match alerts, else the
  // player's profile.
  const openMatch = async (matchId: string) => {
    const m = await getMatch(matchId);
    if (!m) return;
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore: false,
    });
  };
  const openAlert = (n: { matchId?: string; playerId?: string }) => {
    if (n.matchId) void openMatch(n.matchId);
    else if (n.playerId) nav.navigate('PlayerProfile', { playerId: n.playerId });
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Notifications" subtitle="Alerts from players you follow" />

        {items.length === 0 && followed.length === 0 && (
          <Card>
            <Text style={textStyles.body}>No alerts yet.</Text>
            <Text style={textStyles.muted}>
              Follow a player from their profile, then you’ll be notified when they score.
            </Text>
          </Card>
        )}

        {items.length > 0 && (
          <>
            <SectionHeader
              title="Live alerts"
              count={items.length}
              onSeeAll={items.length > SECTION_CAP ? () => setShowAllAlerts((v) => !v) : undefined}
              expanded={showAllAlerts}
            />
            {(showAllAlerts ? items : items.slice(0, SECTION_CAP)).map((n) => {
              const actionable = !!(n.matchId || n.playerId);
              return (
                <TouchableOpacity accessibilityRole="button"
                  key={n.id}
                  activeOpacity={actionable ? 0.85 : 1}
                  disabled={!actionable}
                  onPress={() => openAlert(n)}
                >
                  <Card style={st.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>🔔 {n.title}</Text>
                      <Text style={textStyles.muted}>{n.body}</Text>
                    </View>
                    <Text style={textStyles.muted}>{timeAgo(n.at)}</Text>
                    {actionable && <Text style={st.chevron}>›</Text>}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {followed.length > 0 && (
          <>
            <SectionHeader
              title="Recent from players you follow"
              count={followedRecent.length}
              onSeeAll={followedRecent.length > SECTION_CAP ? () => setShowAllRecent((v) => !v) : undefined}
              expanded={showAllRecent}
            />
            {(showAllRecent ? followedRecent : followedRecent.slice(0, SECTION_CAP)).map(({ player, l }) => (
              <TouchableOpacity accessibilityRole="button"
                key={`${player.id}-${l.id}`}
                activeOpacity={0.85}
                onPress={() => nav.navigate('PlayerProfile', { playerId: player.id })}
              >
                <Card style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>
                      {getSport(l.sport).icon} {player.fullName} vs {l.opponent ?? 'TBD'}
                    </Text>
                    <Text style={textStyles.muted}>
                      {Object.entries(l.stats).map(([k, v]) => `${v} ${k}`).join(' · ')} · {l.won ? 'won' : 'lost'}
                    </Text>
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
});
