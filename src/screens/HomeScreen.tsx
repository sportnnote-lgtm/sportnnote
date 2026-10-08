/** Home — a lean, personalized feed. The header carries the app wordmark, a
 *  profile shortcut and the notification bell. A tournament switcher (scoped to
 *  the tournaments the user plays in or follows) filters the live & upcoming
 *  matches below, and a sport row jumps into each sport's section (schedule,
 *  organize, standings & stats). Deep standings/stats live on those pages. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, LoadingState, Pill, SelectChip, textStyles, plural } from '../components/ui';
import { formatDayShort } from '../core/dates';
import { MatchCard } from '../components/MatchCard';
import { LiveGolfCards } from '../components/golf/LiveGolfCards';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { VoiceNav } from '../components/VoiceNav';
import { SPORT_LIST, getSport } from '../sports/registry';
import { tournamentStatus, matchProgress } from '../core/tournament';
import { isSupabaseConfigured } from '../core/supabase';
import { matchEligibility } from '../core/eligibility';
import { useMyTournaments, useScopedMatches, useNotifications, usePlayerProfile } from '../data/hooks';
import { getMyPlayerId } from '../data/repos';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import type { Match, SportId, Tournament } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { WebPushCard } from '../components/WebPushCard';
import { Logo } from '../components/Logo';

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
  // Quick actions (voice / friendly / calendar) live in a dropdown menu under one
  // toggle so the wordmark keeps its line; notifications stays always-visible.
  const [actionsOpen, setActionsOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (selectedId === null && tournaments.length === 1) setSelectedId(tournaments[0].id);
  }, [tournaments, selectedId]);
  const selected: Tournament | undefined = tournaments.find((t) => t.id === selectedId);

  const scoped = selectedId ? feed.filter((m) => m.tournamentId === selectedId) : feed;
  const live = scoped.filter((m) => m.status === 'live');
  // Postponed games still appear under "Up next" (badged) so followers learn of
  // the change; a cancelled game drops off the forward-looking feed.
  const upcoming = scoped.filter((m) => m.status === 'scheduled' || m.status === 'postponed');

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
  // Post-login nudge: prompt the user to finish verifying so they can be added to
  // matches (the eligibility gate needs a verified mobile + email; guardian for
  // minors). Email auto-verifies from the confirmed login; mobile is the usual
  // one left. Dismissible for the session; reappears until they're eligible.
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const elig = player ? matchEligibility(player) : { ok: true };
  const showVerify = isSupabaseConfigured && !!player && !elig.ok && !verifyDismissed;
  const verifyPrompt = (reason?: string): string => {
    const r = reason ?? '';
    if (r.includes('Mobile')) return 'Verify your mobile number to join matches & tournaments.';
    if (r.includes('Email')) return 'Verify your email to join matches & tournaments.';
    if (r.includes('Date of birth')) return 'Add your date of birth to join matches.';
    if (/guardian|Guardian|proof/.test(r)) return 'Complete parent/guardian verification to join matches.';
    return 'Finish verifying your account to join matches.';
  };
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
          <Logo size={40} />
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
            <Text style={st.toggleGlyph}>{actionsOpen ? '▴' : '▾'}</Text>
          </TouchableOpacity>
          {/* Voice panel opens from the menu; the built-in mic trigger is hidden. */}
          <VoiceNav matches={feed} onOpenMatch={openScorer} open={voiceOpen} onOpenChange={setVoiceOpen} hideTrigger />
        </View>

        {/* Quick actions as an anchored dropdown menu. */}
        <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
          <Pressable style={st.menuBackdrop} onPress={() => setActionsOpen(false)}>
            <View style={[st.menu, { top: insets.top + 60, right: theme.spacing(4) }]} onStartShouldSetResponder={() => true}>
              {[
                { icon: '🎙', label: 'Voice — find a game', onPress: () => setVoiceOpen(true) },
                ...(canScore ? [{ icon: '🤝', label: 'Start a friendly', onPress: () => nav.navigate('ScheduleMatch', {}) }] : []),
                { icon: '📅', label: 'Calendar', onPress: () => nav.navigate('Calendar') },
              ].map((item, idx) => (
                <React.Fragment key={item.label}>
                  {idx > 0 && <View style={st.menuDivider} />}
                  <TouchableOpacity
                    style={st.menuRow}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    onPress={() => { setActionsOpen(false); item.onPress(); }}
                  >
                    <Text style={st.menuIcon}>{item.icon}</Text>
                    <Text style={st.menuLabel}>{item.label}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          </Pressable>
        </Modal>

        {/* Web app: nudge to turn on notifications (iPhone: Add to Home Screen first). */}
        <WebPushCard compact />

        {!isSupabaseConfigured && (
          <Card style={st.demo}>
            <Text style={textStyles.body}>🧪 Demo mode</Text>
            <Text style={textStyles.muted}>
              Running on local sample data. Tap any match to open the live scorer — it works fully offline.
            </Text>
          </Card>
        )}

        {showVerify && (
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={() => nav.navigate('Tabs', { screen: 'Profile' })}>
            <Card style={st.verifyCard}>
              <View style={st.verifyRow}>
                <Text style={st.verifyTitle}>🔐 Finish setting up your account</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={(e) => { e.stopPropagation?.(); setVerifyDismissed(true); }}>
                  <Text style={st.verifyClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={textStyles.muted}>{verifyPrompt(elig.reason)} Tap to verify →</Text>
            </Card>
          </TouchableOpacity>
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
        <LiveGolfCards tournamentId={selectedId} />

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
  // The quick-actions toggle is a text glyph (not an emoji), so it needs an
  // explicit, high-contrast colour — the accent makes it clearly tappable.
  toggleGlyph: { fontSize: 16, color: theme.colors.primary, fontWeight: '900', lineHeight: 18 },
  menuBackdrop: { flex: 1 },
  menu: { position: 'absolute', minWidth: 232, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(1), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4) },
  menuIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  menuLabel: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  menuDivider: { height: 1, backgroundColor: theme.colors.border, marginHorizontal: theme.spacing(3) },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.colors.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: theme.colors.bg,
  },
  badgeText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '800' },
  demo: { backgroundColor: theme.colors.surfaceAlt, gap: theme.spacing(1) },
  verifyCard: { gap: theme.spacing(1), borderColor: theme.colors.accent, borderWidth: 1 },
  verifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  verifyTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flex: 1 },
  verifyClose: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800' },
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
