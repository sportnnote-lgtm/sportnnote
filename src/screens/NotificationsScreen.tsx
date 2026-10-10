/** In-app notification inbox. Lists alerts fired while the app is open (e.g. a
 *  followed player scoring), plus a roll-up of recent activity from players you
 *  follow. Opening the screen marks everything read. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, Pill, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { useAuth } from '../core/auth';
import { useNotifications, useFollow, usePlayerSummaries } from '../data/hooks';
import { notifyStore } from '../data/notifyStore';
import { getMatch } from '../data/repos';
import { getSport } from '../sports/registry';
import { statLabelShort, APPEARANCE_KEYS } from '../data/stats';
import { lineResult, RESULT_PILL } from '../data/appearances';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function timeAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/** Notification titles carry their own leading emoji (📄, 📝, 🔴…). Pull it out
 *  so it can sit in a proper icon badge instead of colliding with a hardcoded 🔔
 *  in the text ("🔔 📄 …"). Falls back to 🔔 when the title has no emoji. */
function splitLeadingEmoji(title: string): { icon: string; rest: string } {
  const chars = Array.from(title.trimStart());
  // Emoji & pictographic symbols live well above the Latin/punctuation range.
  if (chars[0] && (chars[0].codePointAt(0) ?? 0) > 0x2190) {
    const take = chars[1] === '️' ? 2 : 1; // keep a trailing variation selector
    return { icon: chars.slice(0, take).join(''), rest: chars.slice(take).join('').trimStart() };
  }
  return { icon: '🔔', rest: title };
}

/** A round icon chip leading each row, so the inbox reads as a consistent list. */
function IconBadge({ icon }: { icon: string }) {
  return (
    <View style={st.badge}>
      <Text style={st.badgeIcon}>{icon}</Text>
    </View>
  );
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
            <EmptyState
              icon="🔔"
              title="No alerts yet"
              hint="Follow a player from their profile, then you’ll be notified when they score."
              compact
            />
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
              const { icon, rest } = splitLeadingEmoji(n.title);
              return (
                <TouchableOpacity accessibilityRole="button"
                  key={n.id}
                  activeOpacity={actionable ? 0.85 : 1}
                  disabled={!actionable}
                  onPress={() => openAlert(n)}
                >
                  <Card style={st.row}>
                    <IconBadge icon={icon} />
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>{rest}</Text>
                      <Text style={textStyles.muted}>{n.body}</Text>
                    </View>
                    <Text style={st.time}>{timeAgo(n.at)}</Text>
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
                {/* Same results-board language as the SportProfile match history:
                    green left-edge + WON/LOST pill so form is scannable. */}
                <Card style={[st.row, { borderLeftWidth: 3, borderLeftColor: lineResult(l) === 'W' ? theme.colors.primary : theme.colors.border }]}>
                  <IconBadge icon={getSport(l.sport).icon} />
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body} numberOfLines={1}>{player.fullName} vs {l.opponent ?? 'TBD'}</Text>
                    <Text style={textStyles.muted} numberOfLines={1}>
                      {Object.entries(l.stats).filter(([k, v]) => v !== 0 && !APPEARANCE_KEYS.has(k)).map(([k, v]) => `${v} ${statLabelShort(k, v)}`).join(' · ')}
                    </Text>
                  </View>
                  <Pill
                    label={RESULT_PILL[lineResult(l) ?? 'L']}
                    color={lineResult(l) === 'W' ? theme.colors.primary + '22' : theme.colors.surfaceAlt}
                    textColor={lineResult(l) === 'W' ? theme.colors.primary : theme.colors.textMuted}
                  />
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
  badge: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeIcon: { fontSize: 20 },
  time: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
});
