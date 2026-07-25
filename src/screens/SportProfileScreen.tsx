/** Deep per-sport profile for one player: that sport's stats, match history,
 *  and sport-specific details (e.g. football position/foot/teams, editable on
 *  your own profile). Reached by tapping a sport on the main profile. */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, Pill, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { usePlayerProfile, useMatches } from '../data/hooks';
import { statCoverage } from '../data/stats';
import { getMyPlayerId } from '../data/repos';
import { SPORT_SIDE_FIELDS } from '../data/sportProfileFields';
import type { RootStackParamList } from '../navigation/types';

const LABELS: Record<string, string> = {
  goals: 'Goals', openPlayGoals: 'Open-play goals', penaltyGoals: 'Penalties', freekickGoals: 'Free-kick goals',
  assists: 'Assists', runs: 'Runs', wickets: 'Wickets', cleanSheets: 'Clean sheets', yellowCards: 'Yellow', redCards: 'Red',
  points: 'Points', rebounds: 'Rebounds', fouls: 'Fouls', aces: 'Aces', raidPoints: 'Raid pts', tacklePoints: 'Tackle pts',
  golds: 'Golds', silvers: 'Silvers', games: 'Games',
  // football granular stats
  shots: 'Shots', shotsOnTarget: 'Shots on target', tackles: 'Tackles', interceptions: 'Interceptions',
  saves: 'Saves', passes: 'Passes', passesComplete: 'Passes completed', offsides: 'Offsides', corners: 'Corners',
  attackingContributions: 'Attacking plays', defensiveContributions: 'Defensive plays',
};
const label = (k: string) => LABELS[k] ?? k;

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SportProfileScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SportProfile'>>();
  const { playerId, sport } = params;
  const { profile } = useAuth();
  const { player, stats: allStats, official, friendly } = usePlayerProfile(playerId);
  const [scope, setScope] = useState<'all' | 'official' | 'friendly'>('all');
  const { matches } = useMatches();
  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const plugin = getSport(sport);

  const [canEdit, setCanEdit] = useState(false);
  const [openStat, setOpenStat] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getMyPlayerId(profile?.id).then((id) => on && setCanEdit(id === playerId));
      return () => {
        on = false;
      };
    }, [profile?.id, playerId])
  );

  if (!player || !allStats || !official || !friendly) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading…</Text>
      </SafeAreaView>
    );
  }

  // Scope the stats to official / friendly / all. The toggle shows whenever the
  // player has any matches in this sport (consistent placement); an empty scope
  // just says so.
  const countInSport = (s: typeof allStats) => s.bySport.find((b) => b.sport === sport)?.matches ?? 0;
  const hasSplit = countInSport(allStats) > 0;
  const stats = !hasSplit ? allStats : scope === 'official' ? official : scope === 'friendly' ? friendly : allStats;

  const bySport = stats.bySport.find((b) => b.sport === sport);
  const emptyMsg = hasSplit && scope === 'friendly' ? `No friendly ${plugin.name.toLowerCase()} matches yet.`
    : hasSplit && scope === 'official' ? `No official ${plugin.name.toLowerCase()} matches yet.`
    : `No ${plugin.name.toLowerCase()} matches recorded yet.`;
  const history = stats.recent.filter((l) => l.sport === sport);
  const detail = player.sportDetails?.[sport];

  // History rows open the full match page when they link to a real match.
  const openMatch = (matchId: string) => {
    const m = matchById.get(matchId);
    if (!m) return;
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore: false,
    });
  };
  const sideFields = SPORT_SIDE_FIELDS[sport];
  const hasDetails = !!(detail?.position || detail?.sides || detail?.teams?.length);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title={`${plugin.icon} ${plugin.name}`} subtitle={player.fullName} />

        {hasSplit && (
          <View style={st.scopeRow}>
            <SelectChip label={`All · ${countInSport(allStats)}`} active={scope === 'all'} onPress={() => setScope('all')} />
            <SelectChip label={`Official · ${countInSport(official)}`} active={scope === 'official'} onPress={() => setScope('official')} />
            <SelectChip label={`Friendly · ${countInSport(friendly)}`} active={scope === 'friendly'} onPress={() => setScope('friendly')} />
          </View>
        )}

        {!bySport ? (
          <EmptyState icon={plugin.icon} title={emptyMsg} compact />
        ) : (
          <View style={st.statGrid}>
            <Stat value={String(bySport.matches)} label="Matches" />
            <Stat value={String(bySport.wins)} label="Wins" />
            <Stat value={`${Math.round((bySport.wins / Math.max(1, bySport.matches)) * 100)}%`} label="Win rate" />
            {Object.entries(bySport.totals).map(([k, v]) => {
              const cov = statCoverage(stats.recent, sport, k);
              // only flag when this stat was tracked in fewer games than the player played
              const partial = cov.tracked < cov.total ? cov : undefined;
              return (
                <Stat
                  key={k} value={String(v)} label={label(k)}
                  coverage={partial} open={openStat === k}
                  onToggle={() => setOpenStat(openStat === k ? null : k)}
                />
              );
            })}
          </View>
        )}

        <Card style={{ gap: theme.spacing(2) }}>
          <View style={st.fbHeader}>
            <Text style={textStyles.h3}>Details</Text>
            {canEdit && (
              <Text style={st.editLink} onPress={() => nav.navigate('EditProfile', { playerId })}>Edit ›</Text>
            )}
          </View>
          {hasDetails ? (
            <>
              <View style={st.fbMeta}>
                {detail?.position ? <Pill label={`Position: ${detail.position}`} /> : null}
                {sideFields.map((f) =>
                  detail?.sides?.[f.key] ? <Pill key={f.key} label={`${f.label}: ${detail.sides[f.key]}`} /> : null
                )}
              </View>
              {detail?.teams?.length ? (
                <View style={{ gap: theme.spacing(1) }}>
                  <Text style={textStyles.muted}>Teams represented</Text>
                  {detail.teams.map((t, i) => {
                    const period = t.until
                      ? `${(t.since ?? '').slice(0, 4)}${t.since ? ' – ' : 'until '}${t.until.slice(0, 4)}`
                      : t.since
                      ? `since ${t.since.slice(0, 4)}`
                      : '';
                    return (
                      <Text key={i} style={textStyles.body}>
                        · {t.name}{t.jersey != null ? `  #${t.jersey}` : ''}
                        {period ? <Text style={textStyles.muted}>  · {period}</Text> : null}
                        {t.until ? <Text style={textStyles.muted}>  · past</Text> : null}
                      </Text>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={textStyles.muted}>
              {canEdit ? 'Add your position, dominant side and the teams you’ve represented.' : 'No details added yet.'}
            </Text>
          )}
        </Card>

        {history.length > 0 && (
          <>
            <Text style={[textStyles.h3, { marginTop: theme.spacing(2) }]}>Match history</Text>
            {history.map((l) => {
              const openable = matchById.has(l.matchId);
              const row = (
                <Card style={st.histRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>vs {l.opponent ?? 'TBD'}</Text>
                    <Text style={textStyles.muted}>
                      {Object.entries(l.stats).map(([k, v]) => `${v} ${label(k).toLowerCase()}`).join(' · ')}
                    </Text>
                  </View>
                  <Pill
                    label={l.won ? 'WON' : 'LOST'}
                    color={theme.colors.surfaceAlt}
                    textColor={l.won ? theme.colors.primary : theme.colors.textMuted}
                  />
                  {openable && <Text style={st.chevron}>›</Text>}
                </Card>
              );
              return openable ? (
                <TouchableOpacity accessibilityRole="button" key={l.id} activeOpacity={0.85} onPress={() => openMatch(l.matchId)}>{row}</TouchableOpacity>
              ) : (
                <View key={l.id}>{row}</View>
              );
            })}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  value, label, coverage, open, onToggle,
}: {
  value: string; label: string;
  coverage?: { tracked: number; total: number }; open?: boolean; onToggle?: () => void;
}) {
  const inner = (
    <Card style={st.statCardInner}>
      {coverage ? <Text style={st.cloud}>☁</Text> : null}
      <Text style={st.statValue}>{value}</Text>
      <Text style={textStyles.muted}>{label}</Text>
      {coverage && open ? (
        <Text style={st.coverageNote}>tracked in {coverage.tracked} of {coverage.total} games</Text>
      ) : null}
    </Card>
  );
  // A partial-coverage stat is tappable: the cloud opens the games it spans.
  return (
    <View style={st.statCardWrap}>
      {coverage ? <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={onToggle}>{inner}</TouchableOpacity> : inner}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  statCardInner: { width: '100%', alignItems: 'center', gap: theme.spacing(1) },
  statCardWrap: { width: '30%', flexGrow: 1 },
  statValue: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  cloud: { position: 'absolute', top: theme.spacing(2), right: theme.spacing(2), fontSize: 12, color: theme.colors.accent },
  coverageNote: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', textAlign: 'center' },
  fbHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fbMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  editLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
});
