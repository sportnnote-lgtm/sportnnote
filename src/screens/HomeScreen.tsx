/** Home — a lean, personalized feed. The header carries the app wordmark, a
 *  profile shortcut and the notification bell. A tournament switcher (scoped to
 *  the tournaments the user plays in or follows) filters the live & upcoming
 *  matches below, and a sport row jumps into each sport's section (schedule,
 *  organize, standings & stats). Deep standings/stats live on those pages. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, LoadingState, Pill, SelectChip, textStyles, plural } from '../components/ui';
import { formatDayShort } from '../core/dates';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { VoiceNav } from '../components/VoiceNav';
import { SPORT_LIST, getSport } from '../sports/registry';
import { tournamentStatus, matchProgress } from '../core/tournament';
import { isSupabaseConfigured } from '../core/supabase';
import { useMyTournaments, useScopedMatches, useNotifications, usePlayerProfile } from '../data/hooks';
import { getMyPlayerId } from '../data/repos';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import type { Match, SportId, Tournament } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const tournaments = useMyTournaments(profile?.id);
  // Home is a personal feed: matches from what you follow (players/teams/
  // tournaments) plus your own — not every match app-wide.
  const { feed, loading } = useScopedMatches(profile?.id);
  const { unread } = useNotifications();

  // Selected tournament (null = "All"). Default to the first once loaded.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Quick actions (voice / friendly / calendar) collapse under one toggle so the
  // wordmark keeps its line; notifications stays always-visible.
  const [actionsOpen, setActionsOpen] = useState(false);
  useEffect(() => {
    if (selectedId === null && tournaments.length === 1) setSelectedId(tournaments[0].id);
  }, [tournaments, selectedId]);
  const selected: Tournament | undefined = tournaments.find((t) => t.id === selectedId);

  const scoped = selectedId ? feed.filter((m) => m.tournamentId === selectedId) : feed;
  const live = scoped.filter((m) => m.status === 'live');
  const upcoming = scoped.filter((m) => m.status === 'scheduled');

  // "Explore a sport" = the sports the user has signed up for (their profile's
  // declared sports); the rest are offered under "Try a new sport".
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
  const { player } = usePlayerProfile(playerId);
  const allSports = SPORT_LIST.map((s) => s.id);
  const mySports = (player?.sports ?? []).filter((s): s is SportId => allSports.includes(s as SportId));
  const newSports = allSports.filter((s) => !mySports.includes(s));

  const canScore = canScoreByRole(profile?.role);
  const openScorer = (m: Match) =>
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore,
    });

  // "See all" opens the full Matches browser at the matching section.
  const seeAll = (initialTab: 'live' | 'upcoming') => nav.navigate('Tabs', { screen: 'Matches', params: { initialTab } });

  const openSport = (sport: Match['sport']) => {
    // A specific tournament is needed for a sport section; default to the first
    // tournament that actually features the sport when "All" is selected.
    const t = selected ?? tournaments.find((x) => x.sports.includes(sport)) ?? tournaments[0];
    if (t) nav.navigate('SportHub', { tournamentId: t.id, sport, tournamentName: t.name });
  };

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content}>
        {/* Header: wordmark · notifications · quick-actions toggle */}
        <View style={st.header}>
          <View style={st.brand}>
            <Text style={st.wordmark} numberOfLines={1}>Sport<Text style={st.wordmarkAccent}>nNote</Text></Text>
            <Text style={textStyles.muted} numberOfLines={1}>Play a Sport, Make a Note.</Text>
          </View>
          <TouchableOpacity
            style={st.iconBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            onPress={() => nav.navigate('Notifications')}
          >
            <Text style={st.icon}>🔔</Text>
            {unread > 0 && (
              <View style={st.badge}>
                <Text style={st.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={st.iconBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ expanded: actionsOpen }}
            accessibilityLabel="Quick actions"
            onPress={() => setActionsOpen((v) => !v)}
          >
            <Text style={st.icon}>{actionsOpen ? '✕' : '⋯'}</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions, revealed inline so they don't crowd the wordmark. */}
        {actionsOpen && (
          <View style={st.quickActions}>
            <VoiceNav matches={feed} onOpenMatch={openScorer} />
            {canScore && (
              <TouchableOpacity style={st.quickAction} activeOpacity={0.8} accessibilityRole="button"
                onPress={() => { setActionsOpen(false); nav.navigate('ScheduleMatch', {}); }}>
                <Text style={st.icon}>🤝</Text><Text style={st.quickLabel}>Start a friendly</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={st.quickAction} activeOpacity={0.8} accessibilityRole="button"
              onPress={() => { setActionsOpen(false); nav.navigate('Calendar'); }}>
              <Text style={st.icon}>📅</Text><Text style={st.quickLabel}>Calendar</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isSupabaseConfigured && (
          <Card style={st.demo}>
            <Text style={textStyles.body}>🧪 Demo mode</Text>
            <Text style={textStyles.muted}>
              Running on local sample data. Tap any match to open the live scorer — it works fully offline.
            </Text>
          </Card>
        )}

        {/* Tournament switcher */}
        {tournaments.length > 0 && (
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={st.eyebrow}>Tournament</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
              {tournaments.length > 1 && (
                <SelectChip label="All" active={selectedId === null} onPress={() => setSelectedId(null)} />
              )}
              {tournaments.map((t) => (
                <SelectChip key={t.id} label={t.name} active={selectedId === t.id} onPress={() => setSelectedId(t.id)} />
              ))}
            </ScrollView>
            {selected && (
              <TouchableOpacity
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Open ${selected.name}`}
                onPress={() => nav.navigate('Tournament', { tournamentId: selected.id })}
              >
                <Card style={st.tourCard}>
                  <View style={{ flex: 1, gap: theme.spacing(1) }}>
                    <Text style={textStyles.body}>{selected.name}</Text>
                    <Text style={textStyles.muted}>
                      {selected.hostName} · {plural(selected.sports.length, 'sport')} · {formatDayShort(selected.startDate)} → {formatDayShort(selected.endDate)}
                    </Text>
                    {(() => {
                      const s = tournamentStatus(selected, matchProgress(feed.filter((m) => m.tournamentId === selected.id)));
                      return <View style={st.statusRow}><Pill label={s.label} color={s.color + '22'} textColor={s.color} /></View>;
                    })()}
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Live now — top 5, "See all" opens the full live list */}
        <SectionHeader title="🔴 Live now" count={live.length} onSeeAll={live.length > SECTION_CAP ? () => seeAll('live') : undefined} />
        {loading ? (
          <LoadingState label="Loading matches…" />
        ) : live.length ? (
          live.slice(0, SECTION_CAP).map((m) => <MatchCard key={m.id} match={m} onPress={() => openScorer(m)} />)
        ) : (
          <EmptyState icon="📡" title="No live matches right now" hint="Live games appear here the moment scoring starts." compact />
        )}

        {/* Up next — top 5, "See all" opens the full upcoming list */}
        <SectionHeader title="📅 Up next" count={upcoming.length} onSeeAll={upcoming.length > SECTION_CAP ? () => seeAll('upcoming') : undefined} />
        {loading ? (
          <LoadingState label="Loading…" />
        ) : upcoming.length ? (
          upcoming.slice(0, SECTION_CAP).map((m) => <MatchCard key={m.id} match={m} onPress={() => openScorer(m)} />)
        ) : (
          <EmptyState icon="📅" title="Nothing scheduled" hint="Upcoming matches will show up here." compact />
        )}

        {/* Explore a sport — the sports the user has signed up for, plus a path
            into the ones they haven't. */}
        <SectionHeader title="🎯 Explore a sport" />
        <Text style={textStyles.muted}>
          {mySports.length ? 'Your sports — schedule, standings & stats.' : 'Sports you sign up for will show up here.'}
        </Text>
        <View style={st.sportGrid}>
          {mySports.map((s) => (
            <TouchableOpacity
              key={s}
              activeOpacity={0.85}
              style={st.sportTile}
              accessibilityRole="button"
              accessibilityLabel={`Open ${getSport(s).name}`}
              onPress={() => openSport(s)}
            >
              <Text style={st.sportIcon}>{getSport(s).icon}</Text>
              <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{getSport(s).name}</Text>
              <Text style={st.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
        {newSports.length > 0 && (
          <TouchableOpacity accessibilityRole="button"
            activeOpacity={0.85}
            style={st.tryTile}
            onPress={() => nav.navigate('TryNewSport', { sports: newSports })}
          >
            <Text style={st.sportIcon}>✨</Text>
            <View style={{ flex: 1 }}>
              <Text style={[textStyles.body, { fontWeight: '700' }]}>Try a new sport</Text>
              <Text style={textStyles.muted}>{newSports.map((s) => getSport(s).icon).join(' ')} · {newSports.length} to explore</Text>
            </View>
            <Text style={st.chevron}>›</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  brand: { flex: 1, gap: theme.spacing(1) },
  wordmark: { color: theme.colors.text, fontSize: theme.font.h1, fontWeight: '900', letterSpacing: -0.5 },
  wordmarkAccent: { color: theme.colors.primary },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
  },
  icon: { fontSize: 20 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(3) },
  quickAction: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3) },
  quickLabel: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.colors.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: theme.colors.bg,
  },
  badgeText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '800' },
  demo: { backgroundColor: theme.colors.surfaceAlt, gap: theme.spacing(1) },
  eyebrow: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  tourCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  statusRow: { flexDirection: 'row', marginTop: theme.spacing(1) },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  sportTile: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3),
    width: '48%',
  },
  sportIcon: { fontSize: 22 },
  tryTile: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.primary,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4),
  },
});
