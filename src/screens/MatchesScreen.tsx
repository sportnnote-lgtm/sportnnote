/** Matches — every game across every sport, split into Upcoming and Completed.
 *  Completed matches open the same full page as a live game (final score, info,
 *  lineups, summary) so the app keeps a browsable history of every game. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, LoadingState, ScreenTitle, SelectChip, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { useScopedMatches } from '../data/hooks';
import { getMyPlayerId, getOrganizations, getTournaments } from '../data/repos';
import { canScoreMatch } from '../core/scoringAccess';
import { tournamentHostPlayerIds } from '../core/org';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import { SPORT_LIST } from '../sports/registry';
import type { Match, SportId } from '../core/types';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TABS = [
  { key: 'live', label: '🔴 Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function MatchesScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabParamList, 'Matches'>>();
  const { profile } = useAuth();
  const [tab, setTab] = useParamState<Tab>('tab', params?.initialTab ?? 'upcoming');
  const [filter, setFilter] = useState<SportId | 'all'>(params?.initialSport ?? 'all');
  // A "See all" link can re-open this tab with a different section/sport.
  useEffect(() => {
    if (params?.initialTab) setTab(params.initialTab);
    if (params?.initialSport) setFilter(params.initialSport);
  }, [params?.initialTab, params?.initialSport]);
  // The Matches tab is only YOUR games — ones you play in, or organize/score.
  const { mine, loading } = useScopedMatches(profile?.id);
  const matches = filter === 'all' ? mine : mine.filter((m) => m.sport === filter);
  const canScore = canScoreByRole(profile?.role);
  // Which of these I can score (scorer or host) → a "▶ Start scoring" shortcut on the card.
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void getMyPlayerId(profile?.id).then((id) => on && setMyPlayerId(id));
    return () => { on = false; };
  }, [profile?.id]);
  // Tournament hosts (incl. an org-hosted event's Owner/Admin/Organizer) score its matches too.
  const [tourHosts, setTourHosts] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let on = true;
    void Promise.all([getTournaments(), getOrganizations()]).then(([ts, orgs]) => {
      if (on) setTourHosts(Object.fromEntries(ts.map((t) => [t.id, tournamentHostPlayerIds(t, orgs)])));
    }).catch(() => {});
    return () => { on = false; };
  }, [profile?.id]);
  // Listed scorers AND hosts get the shortcut — hosts score by default.
  const iScore = (m: Match) => canScoreMatch({
    myPlayerId, scorerIds: m.scorerIds, scorerId: m.scorerId, hostIds: m.hostIds,
    tournamentHostIds: m.tournamentId ? tourHosts[m.tournamentId] : undefined,
  });

  // Live = in progress; Upcoming = scheduled (soonest first); Completed = most recent first.
  // Postponed / cancelled games are still pre-match, so they stay under Upcoming
  // (badged) — otherwise the host loses sight of them and can't restore them.
  const live = matches
    .filter((m) => m.status === 'live')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = matches
    .filter((m) => m.status === 'scheduled' || m.status === 'postponed' || m.status === 'cancelled')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const completed = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const list = tab === 'live' ? live : tab === 'upcoming' ? upcoming : completed;
  const countFor = (key: Tab) => (key === 'live' ? live : key === 'upcoming' ? upcoming : completed).length;

  const open = (m: Match, tab?: string) =>
    nav.navigate('LiveScoring', {
      matchId: m.id,
      sport: m.sport,
      homeName: m.homeTeam.shortName,
      awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name,
      awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex,
      awayColor: m.awayTeam.colorHex,
      canScore,
      ...(tab ? { tab } : {}),
    });

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Matches" subtitle="Games you play, organize or score" />

        <View style={st.segment}>
          {TABS.map((t) => {
            const n = countFor(t.key);
            const on = tab === t.key;
            return (
              <TouchableOpacity accessibilityRole="button"
                key={t.key}
                style={[st.segBtn, on && st.segBtnActive]}
                activeOpacity={0.8}
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.label}, ${n} ${n === 1 ? 'match' : 'matches'}`}
                onPress={() => setTab(t.key)}
              >
                <Text style={[st.segText, on && st.segTextActive]} numberOfLines={1}>
                  {t.label}{n > 0 ? ` ${n}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filters}>
          <SelectChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          {SPORT_LIST.map((s) => (
            <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={filter === s.id} onPress={() => setFilter(s.id)} />
          ))}
        </ScrollView>

        {loading ? (
          <LoadingState label="Loading matches…" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={tab === 'live' ? '📡' : tab === 'upcoming' ? '📅' : '🏁'}
            title={tab === 'live' ? 'No matches are live right now' : tab === 'upcoming' ? 'No upcoming matches' : 'No completed matches yet'}
            hint={tab === 'live' ? 'Live games will show here the moment scoring starts.' : tab === 'upcoming' ? 'Scheduled games will appear here.' : 'Finished games land here once scored.'}
          />
        ) : (
          list.map((m) => (
            <MatchCard key={m.id} match={m} onPress={() => open(m)} onStart={iScore(m) ? () => open(m, 'scoring') : undefined} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  segment: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  segBtn: { flex: 1, paddingVertical: theme.spacing(2), borderRadius: theme.radius.pill, alignItems: 'center' },
  segBtnActive: { backgroundColor: theme.colors.primary },
  segText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  segTextActive: { color: '#06120D', fontWeight: '800' },
  filters: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
});
