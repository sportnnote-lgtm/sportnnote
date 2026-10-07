/** Discover at scale — two modes in one tab: "People" searches the whole
 *  community of players & teams; "Connect" is the noticeboard where players
 *  find teams and teams find players, opponents and grounds. */
import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, LoadingState, Pill, TextField, SelectChip, ScreenTitle, textStyles, plural } from '../components/ui';
import { ConnectBoard } from '../components/ConnectBoard';
import { PlayerFilters, activeFilterCount, type PlayerFilterState } from '../components/PlayerFilters';
import { looksLikeContact } from '../data/repos';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { SPORT_LIST, getSport } from '../sports/registry';
import { usePlayerSearch, useCities, useTeamSummaries, useFollow, useOpenTournaments } from '../data/hooks';
import { useAuth } from '../core/auth';
import { headline, sportSummary, hasPartialCoverage } from '../data/stats';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

const MODES = [
  { key: 'connect', label: '🤝 Connect' },
  { key: 'people', label: '🔍 People' },
] as const;
type Mode = (typeof MODES)[number]['key'];

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DiscoverScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const [mode, setMode] = useState<Mode>('connect');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<PlayerFilterState>({});
  const fSports = filters.sports ?? [];
  // The focused sport for each player's stat line: the only one picked, else their main one.
  const sport: SportId | 'all' = fSports.length === 1 ? fSports[0] : 'all';
  const [showAllResults, setShowAllResults] = useState(false);
  const [showAllOpenTours, setShowAllOpenTours] = useState(false);
  const [showAllTeams, setShowAllTeams] = useState(false);

  const cities = useCities();
  const { results, loading: searching, error: searchError } = usePlayerSearch({ query, ...filters });
  const contactSearch = looksLikeContact(query);
  const teams = useTeamSummaries().filter((t) => !fSports.length || t.sports.some((s) => fSports.includes(s)));
  const { isFollowing, toggle } = useFollow(profile?.id);
  const openTournaments = useOpenTournaments().filter((t) => !fSports.length || t.sports.some((s) => fSports.includes(s)));
  const filtering = query.trim() !== '' || activeFilterCount(filters) > 0;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Discover" subtitle="People & opportunities across the community" />

        <View style={st.segment}>
          {MODES.map((m) => (
            <TouchableOpacity accessibilityRole="button"
              key={m.key}
              style={[st.segBtn, mode === m.key && st.segBtnActive]}
              activeOpacity={0.8}
              accessibilityState={{ selected: mode === m.key }}
              onPress={() => setMode(m.key)}
            >
              <Text style={[st.segText, mode === m.key && st.segTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'connect' ? (
          <ConnectBoard />
        ) : (
          <>
        <TextField label="Search players" value={query} onChange={setQuery} placeholder="Name, mobile number or email…" autoCapitalize="none" />
        {contactSearch && (
          <Text style={textStyles.muted}>
            Searching for an exact {contactSearch === 'phone' ? 'mobile number' : 'email'} — only adults who allow it can be found this way.
          </Text>
        )}

        <PlayerFilters value={filters} onChange={setFilters} cities={cities} />

        <SectionHeader
          title="Players"
          count={results.length}
          onSeeAll={results.length > SECTION_CAP ? () => setShowAllResults((v) => !v) : undefined}
          expanded={showAllResults}
        />

        <Text style={textStyles.muted}>
          {plural(results.length, 'player')}
          {filtering ? ' found' : ' · ranked by activity'}
        </Text>

        {searching ? <LoadingState label="Searching players…" />
          : searchError ? <EmptyState icon="⚠️" title="Search didn’t work" hint={searchError} />
          : results.length === 0 ? <EmptyState icon="🔍" title="No players match" hint={contactSearch ? 'No one with that number or email has allowed being found by it.' : activeFilterCount(filters) ? 'Try removing a filter.' : 'Try a different name or spelling.'} /> : null}

        {(showAllResults ? results : results.slice(0, SECTION_CAP)).map(({ player, stats }, i) => (
          <TouchableOpacity accessibilityRole="button" key={player.id} activeOpacity={0.85} onPress={() => nav.navigate('PlayerProfile', { playerId: player.id })}>
            <Card style={st.playerCard}>
              {filtering ? null : <Text style={st.rank}>{i + 1}</Text>}
              <View style={[st.avatar, { backgroundColor: (player.houseColor ?? theme.colors.surfaceAlt) + '33' }]}>
                <Text style={[st.avatarText, { color: player.houseColor ?? theme.colors.primary }]}>
                  {player.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body}>{player.fullName}</Text>
                <Text style={textStyles.muted} numberOfLines={1}>
                  {player.houseName ?? 'Independent'}{player.city ? ` · ${player.city}` : ''} · {stats.matches} matches
                </Text>
                {(() => {
                  // granular stat line for the focused sport (or the player's main one)
                  const b = sport === 'all' ? stats.bySport[0] : stats.bySport.find((x) => x.sport === sport);
                  const summary = b ? sportSummary(b) : '';
                  if (!b || !summary) return null;
                  return (
                    <Text style={st.statLine} numberOfLines={1}>
                      {getSport(b.sport).icon} {summary}{hasPartialCoverage(stats.recent, b) ? ' ☁' : ''}
                    </Text>
                  );
                })()}
                <View style={st.sportDots}>
                  {player.sports.slice(0, 4).map((s) => (
                    <Text key={s} style={st.sportIcon}>{getSport(s).icon}</Text>
                  ))}
                </View>
              </View>
              <Pill label={headline(stats)} color={theme.colors.surfaceAlt} textColor={theme.colors.accent} />
            </Card>
          </TouchableOpacity>
        ))}

        {openTournaments.length > 0 && (
          <>
            <SectionHeader
              title="🔓 Open tournaments"
              count={openTournaments.length}
              onSeeAll={openTournaments.length > SECTION_CAP ? () => setShowAllOpenTours((v) => !v) : undefined}
              expanded={showAllOpenTours}
            />
            <Text style={textStyles.muted}>Accepting team registrations — tap to view & request to join.</Text>
            {(showAllOpenTours ? openTournaments : openTournaments.slice(0, SECTION_CAP)).map((t) => (
              <TouchableOpacity accessibilityRole="button" key={t.id} activeOpacity={0.85} onPress={() => nav.navigate('Tournament', { tournamentId: t.id })}>
                <Card style={st.teamRow}>
                  <Text style={st.sportIcon}>🏆</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body} numberOfLines={1}>{t.name}</Text>
                    <Text style={textStyles.muted} numberOfLines={1}>
                      {t.hostName} · {t.sports.map((s) => getSport(s).icon).join(' ')} · {t.startDate}
                    </Text>
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}

        <SectionHeader
          title={`Teams ${sport !== 'all' ? `· ${getSport(sport).name}` : ''}`}
          count={teams.length}
          onSeeAll={teams.length > SECTION_CAP ? () => setShowAllTeams((v) => !v) : undefined}
          expanded={showAllTeams}
        />
        <Text style={textStyles.muted}>Tap a team for its profile, or follow to track them.</Text>
        {(showAllTeams ? teams : teams.slice(0, SECTION_CAP)).map((t) => {
          const following = isFollowing('team', t.id);
          return (
            // Row is a plain Card (View), not a button, so the two pressables
            // below are siblings — RN-web won't nest one <button> in another.
            <Card key={t.id} style={st.teamRow}>
              <TouchableOpacity
                accessibilityRole="button"
                style={st.teamOpen}
                activeOpacity={0.85}
                onPress={() => nav.navigate('Team', { teamId: t.id })}
              >
                <View style={[st.teamDot, { backgroundColor: t.colorHex ?? theme.colors.surfaceAlt }]} />
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body}>{t.name}</Text>
                  <Text style={textStyles.muted}>{t.sports.map((s) => getSport(s).icon).join(' ')}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button"
                style={[st.followBtn, following && st.followBtnOn]}
                accessibilityState={{ selected: following }}
                onPress={() => toggle('team', t.id)}
                activeOpacity={0.8}
              >
                <Text style={[st.followText, following && st.followTextOn]}>{following ? '★ Following' : '☆ Follow'}</Text>
              </TouchableOpacity>
            </Card>
          );
        })}
          </>
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
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  playerCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  rank: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800', width: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
  statLine: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600', marginTop: 1 },
  sportDots: { flexDirection: 'row', gap: theme.spacing(1), marginTop: theme.spacing(1) },
  teamsHeader: { marginTop: theme.spacing(3) },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  teamOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  teamDot: { width: 14, height: 14, borderRadius: 7 },
  followBtn: {
    paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border,
  },
  followBtnOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  followText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  followTextOn: { color: '#06120D' },
  sportIcon: { fontSize: 14 },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
});
