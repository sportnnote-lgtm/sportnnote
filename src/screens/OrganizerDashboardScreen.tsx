/** Organizer dashboard — a command center answering "what's left to run?" across
 *  every tournament you manage: how much is scored, what still needs a scorer,
 *  what has no fixtures yet, and what's ready to close. Read-only + tap-through. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, Button, Pill, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { useAuth } from '../core/auth';
import { useMatches } from '../data/hooks';
import { getMyPlayerId, getTournaments, getOrganizations } from '../data/repos';
import { canManageTournament } from '../core/org';
import { tournamentStatus } from '../core/tournament';
import { computeOrganizerDashboard, type TournamentDash } from '../data/organizerStats';
import type { RootStackParamList } from '../navigation/types';
import type { Tournament } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function OrganizerDashboardScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const { matches } = useMatches('all');
  const [hosted, setHosted] = useState<Tournament[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAllTournaments, setShowAllTournaments] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      Promise.all([getMyPlayerId(profile?.id), getTournaments(), getOrganizations()]).then(([myId, all, orgs]) => {
        if (!on) return;
        setHosted(all.filter((t) => canManageTournament(t, orgs, myId)));
        setLoaded(true);
      });
      return () => { on = false; };
    }, [profile?.id])
  );

  const { perTournament, totals } = computeOrganizerDashboard(hosted, matches);
  const pct = Math.round(totals.scoredPct * 100);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Organizer dashboard" subtitle="What's left to run, across your tournaments" />

        {loaded && hosted.length === 0 ? (
          <Card>
            <Text style={textStyles.muted}>You're not running any tournaments yet. Create one from the Organize tab and it'll show up here.</Text>
          </Card>
        ) : (
          <>
            {/* Top rollup */}
            <Card style={{ gap: theme.spacing(3) }}>
              <View style={st.statRow}>
                <Metric value={String(totals.tournaments)} label="Tournaments" />
                <Metric value={String(totals.matches)} label="Matches" />
                <Metric value={`${pct}%`} label="Scored" />
              </View>
              <ProgressBar pct={totals.scoredPct} />
              <View style={st.chipRow}>
                {totals.live > 0 && <Pill label={`🔴 ${totals.live} live now`} color={theme.colors.danger + '22'} textColor={theme.colors.danger} />}
                {totals.noScorer > 0 && <Pill label={`⏳ ${totals.noScorer} need a scorer`} color={theme.colors.accent + '22'} textColor={theme.colors.accent} />}
              </View>
            </Card>

            <SectionHeader
              title="Tournaments"
              count={perTournament.length}
              onSeeAll={perTournament.length > SECTION_CAP ? () => setShowAllTournaments((v) => !v) : undefined}
              expanded={showAllTournaments}
            />
            {(showAllTournaments ? perTournament : perTournament.slice(0, SECTION_CAP)).map((d) => (
              <TournamentRow key={d.tournament.id} d={d} onOpen={() => nav.navigate('Tournament', { tournamentId: d.tournament.id })}
                onGenerate={() => nav.navigate('GenerateFixtures', { tournamentId: d.tournament.id })} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TournamentRow({ d, onOpen, onGenerate }: { d: TournamentDash; onOpen: () => void; onGenerate: () => void }) {
  const status = tournamentStatus(d.tournament, { total: d.total, live: d.live, completed: d.completed });
  return (
    <Card style={{ gap: theme.spacing(3) }}>
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={onOpen}>
        <View style={st.headRow}>
          <Text style={[textStyles.h3, { flex: 1 }]} numberOfLines={1}>{d.tournament.name}</Text>
          <Pill label={status.label} color={status.color + '22'} textColor={status.color} />
        </View>
      </TouchableOpacity>

      {d.hasFixtures ? (
        <>
          <Text style={textStyles.muted}>{d.completed} / {d.total} matches scored</Text>
          <ProgressBar pct={d.scoredPct} />
          <View style={st.chipRow}>
            {d.live > 0 && <Pill label={`🔴 ${d.live} live`} color={theme.colors.danger + '22'} textColor={theme.colors.danger} />}
            {d.noScorer > 0 && <Pill label={`⏳ ${d.noScorer} need a scorer`} color={theme.colors.accent + '22'} textColor={theme.colors.accent} />}
            {d.readyToClose && <Pill label="✅ Ready to close" color={theme.colors.primary + '22'} textColor={theme.colors.primary} />}
            {d.scheduled > 0 && d.noScorer === 0 && <Pill label={`📅 ${d.scheduled} upcoming`} color={theme.colors.surfaceAlt} textColor={theme.colors.textMuted} />}
          </View>
        </>
      ) : (
        <View style={{ gap: theme.spacing(2) }}>
          <EmptyState icon="⚡" title="No fixtures yet" hint="Nothing scheduled — generate them to get started." compact />
          <Button label="⚡ Auto-generate fixtures" variant="ghost" onPress={onGenerate} />
        </View>
      )}
    </Card>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={st.metric}>
      <Text style={st.metricValue}>{value}</Text>
      <Text style={textStyles.muted}>{label}</Text>
    </View>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <View style={st.barTrack}>
      <View style={[st.barFill, { width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%` }]} />
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { alignItems: 'center', flex: 1, gap: theme.spacing(1) },
  metricValue: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: theme.colors.primary },
});
