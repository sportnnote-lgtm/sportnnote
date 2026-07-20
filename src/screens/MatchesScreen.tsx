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
import { ScreenTitle, textStyles } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { useMatches } from '../data/hooks';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import { SPORT_LIST } from '../sports/registry';
import type { Match, SportId } from '../core/types';
import type { RootStackParamList, TabParamList } from '../navigation/types';

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
  const [tab, setTab] = useState<Tab>(params?.initialTab ?? 'upcoming');
  const [filter, setFilter] = useState<SportId | 'all'>(params?.initialSport ?? 'all');
  // A "See all" link can re-open this tab with a different section/sport.
  useEffect(() => {
    if (params?.initialTab) setTab(params.initialTab);
    if (params?.initialSport) setFilter(params.initialSport);
  }, [params?.initialTab, params?.initialSport]);
  const { matches } = useMatches(filter);
  const canScore = canScoreByRole(profile?.role);

  // Live = in progress; Upcoming = scheduled (soonest first); Completed = most recent first.
  const live = matches
    .filter((m) => m.status === 'live')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = matches
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const completed = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const list = tab === 'live' ? live : tab === 'upcoming' ? upcoming : completed;

  const open = (m: Match) =>
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
    });

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Matches" subtitle="Every game across every sport" />

        <View style={st.segment}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[st.segBtn, tab === t.key && st.segBtnActive]}
              activeOpacity={0.8}
              onPress={() => setTab(t.key)}
            >
              <Text style={[st.segText, tab === t.key && st.segTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filters}>
          <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          {SPORT_LIST.map((s) => (
            <Chip key={s.id} label={`${s.icon} ${s.name}`} active={filter === s.id} onPress={() => setFilter(s.id)} />
          ))}
        </ScrollView>

        {list.length === 0 ? (
          <Text style={textStyles.muted}>
            {tab === 'live' ? 'No matches are live right now.' : tab === 'upcoming' ? 'No upcoming matches.' : 'No completed matches yet.'}
          </Text>
        ) : (
          list.map((m) => <MatchCard key={m.id} match={m} onPress={() => open(m)} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[st.chip, active && st.chipActive]} activeOpacity={0.8}>
      <Text style={[st.chipText, active && st.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  chip: {
    paddingVertical: theme.spacing(2),
    paddingHorizontal: theme.spacing(3.5),
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  chipTextActive: { color: '#06120D' },
});
