/** Discover at scale — two modes in one tab: "Search" (route key `people`, kept
 *  for saved URLs) is one box over players, teams, matches and tournaments, with
 *  browse content for an empty query; "Connect" is the noticeboard where players
 *  find teams and teams find players, opponents and grounds. */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, LoadingState, Pill, SelectChip, ScreenTitle, textStyles, plural } from '../components/ui';
import { MatchCard } from '../components/MatchCard';
import { ConnectBoard } from '../components/ConnectBoard';
import { PlayerFilters, activeFilterCount, type PlayerFilterState } from '../components/PlayerFilters';
import { looksLikeContact } from '../data/repos';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { SPORT_LIST, getSport } from '../sports/registry';
import { usePlayerSearch, useCities, useTeamSummaries, useFollow, useOpenTournaments, useGlobalSearch, type PlayerSummary } from '../data/hooks';
import { bestTier, matchNames, parseVsQuery, orderSections, MIN_QUERY, type SearchKind } from '../data/search';
import { tournamentStatus } from '../core/tournament';
import { useAuth } from '../core/auth';
import { headline, sportSummary, hasPartialCoverage } from '../data/stats';
import type { SportId, Tournament } from '../core/types';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';
import { openMatchViewer } from '../navigation/openMatch';

const MODES = [
  { key: 'connect', label: '🤝 Connect' },
  { key: 'people', label: '🔍 Search' },
] as const;
type Mode = (typeof MODES)[number]['key'];
type ResultTab = 'all' | SearchKind;
const KIND_LABEL: Record<SearchKind, string> = { players: 'Players', teams: 'Teams', matches: 'Matches', tournaments: 'Tournaments' };
/** Hits per type on the "All" tab — "See all" opens that type's tab. */
const ALL_CAP = 3;

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function DiscoverScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const route = useRoute<RouteProp<TabParamList, 'Discover'>>();
  const [mode, setMode] = useParamState<Mode>('mode', 'connect');
  const [tab, setTab] = useParamState<ResultTab>('in', 'all');
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  // Home 🔍 navigates here with { mode: 'people', focus: true } — also when the
  // tab is already mounted, so follow the params rather than only the first ones.
  const pMode = route.params?.mode;
  const pFocus = !!route.params?.focus;
  useEffect(() => {
    if (pMode && pMode !== mode) setMode(pMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pMode]);
  useEffect(() => {
    if (!pFocus) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      // One-shot: don't steal focus again on a relaunch / reload of this URL.
      (nav.setParams as unknown as (p: object) => void)({ focus: undefined });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pFocus]);
  const [filters, setFilters] = useState<PlayerFilterState>({});
  const fSports = filters.sports ?? [];
  // The focused sport for each player's stat line: the only one picked, else their main one.
  const sport: SportId | 'all' = fSports.length === 1 ? fSports[0] : 'all';
  const [showAllResults, setShowAllResults] = useState(false);
  const [showAllOpenTours, setShowAllOpenTours] = useState(false);
  const [showAllTeams, setShowAllTeams] = useState(false);

  const cities = useCities();
  const { types: _types, ...playerFilters } = filters;
  const search = useGlobalSearch(query, playerFilters);
  const q = query.trim();
  // Browse content (empty / 1-letter query): players ranked by activity.
  const { results, loading: searching, error: searchError } = usePlayerSearch({ query: '', ...playerFilters });
  const contactSearch = looksLikeContact(query);
  const teams = useTeamSummaries().filter((t) => !fSports.length || t.sports.some((s) => fSports.includes(s)));
  const { isFollowing, toggle } = useFollow(profile?.id);
  const openTournaments = useOpenTournaments().filter((t) => !fSports.length || t.sports.some((s) => fSports.includes(s)));
  const filtering = activeFilterCount(filters) > 0;

  const hits = search.results;
  const counts: Record<SearchKind, number> = {
    players: hits.players.length, teams: hits.teams.length, matches: hits.matches.length, tournaments: hits.tournaments.length,
  };
  const total = counts.players + counts.teams + counts.matches + counts.tournaments;
  const [vsA] = parseVsQuery(q);
  // A type whose best hit is the exact name moves to the top of "All".
  const sections = orderSections({
    players: !!hits.players[0] && bestTier(hits.players[0].player.fullName, q) === 0,
    teams: !!hits.teams[0] && bestTier([hits.teams[0].team.name, hits.teams[0].team.shortName], q) === 0,
    matches: !!hits.matches[0] && bestTier(matchNames(hits.matches[0]), vsA) === 0,
    tournaments: !!hits.tournaments[0] && bestTier(hits.tournaments[0].name, q) === 0,
  }, counts);
  const firstLoad = search.loading && total === 0;

  const renderPlayer = ({ player, stats }: PlayerSummary, rank?: number, flagUnclaimed = false) => (
    <TouchableOpacity accessibilityRole="button" key={player.id} activeOpacity={0.85} onPress={() => nav.navigate('PlayerProfile', { playerId: player.id })}>
      <Card style={st.playerCard}>
        {rank != null ? <Text style={st.rank}>{rank}</Text> : null}
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
            {/* Added by an organiser, no account yet — so they can't be messaged or claim stats. */}
            {flagUnclaimed && !player.profileId ? <Pill label="Not on app yet" /> : null}
          </View>
        </View>
        <Pill label={headline(stats)} color={theme.colors.surfaceAlt} textColor={theme.colors.accent} />
      </Card>
    </TouchableOpacity>
  );

  const renderTeam = (t: { id: string; name: string; colorHex?: string; sports: SportId[] }) => {
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
  };

  const renderTournament = (t: Tournament, withStatus = false) => {
    const status = withStatus ? tournamentStatus(t) : null;
    return (
      <TouchableOpacity accessibilityRole="button" key={t.id} activeOpacity={0.85} onPress={() => nav.navigate('Tournament', { tournamentId: t.id })}>
        <Card style={st.teamRow}>
          <Text style={st.sportIcon}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={textStyles.body} numberOfLines={1}>{t.name}</Text>
            <Text style={textStyles.muted} numberOfLines={1}>
              {t.hostName} · {t.sports.map((s) => getSport(s).icon).join(' ')} · {t.startDate}
            </Text>
          </View>
          {status ? <Pill label={status.label} textColor={status.color} /> : <Text style={st.chevron}>›</Text>}
        </Card>
      </TouchableOpacity>
    );
  };

  const renderHits = (kind: SearchKind, cap?: number) => {
    const slice = <T,>(xs: T[]) => (cap ? xs.slice(0, cap) : xs);
    switch (kind) {
      case 'players': return slice(hits.players).map((p) => renderPlayer(p, undefined, true));
      case 'teams': return slice(hits.teams).map((h) => renderTeam({ id: h.team.id, name: h.team.name, colorHex: h.team.colorHex, sports: h.sports }));
      case 'matches': return slice(hits.matches).map((m) => <MatchCard key={m.id} match={m} onPress={() => openMatchViewer(nav, m)} />);
      case 'tournaments': return slice(hits.tournaments).map((t) => renderTournament(t, true));
    }
  };

  const tabEmptyHint = (kind: SearchKind) =>
    contactSearch ? (kind === 'players' ? 'No one with that number or email has allowed being found by it.' : 'A mobile number or email only finds players.')
      : kind === 'players' && filtering ? 'Try removing a filter.'
      : kind === 'matches' ? 'Search a team or tournament, or a match as “Red vs Blue”.'
      : 'Try fewer letters or a different spelling.';

  const sportNote = fSports.length > 0 && tab !== 'players' ? (
    <Text style={textStyles.muted}>
      Only {fSports.map((s) => getSport(s).icon).join(' ')} {fSports.length === 1 ? getSport(fSports[0]).name : 'these sports'} ·{' '}
      <Text style={st.link} accessibilityRole="button" onPress={() => setFilters({ ...filters, sports: [] })}>show all sports</Text>
    </Text>
  ) : null;

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
        <View style={st.searchBox}>
          <Text style={st.searchGlyph}>🔍</Text>
          <TextInput
            ref={inputRef}
            style={st.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Players, teams, matches, tournaments…"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={pFocus}
            returnKeyType="search"
            accessibilityLabel="Search players, teams, matches and tournaments"
          />
          {query ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" style={st.clearBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { setQuery(''); inputRef.current?.focus(); }}>
              <Text style={st.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {contactSearch && (
          <Text style={textStyles.muted}>
            Searching for an exact {contactSearch === 'phone' ? 'mobile number' : 'email'} — only adults who allow it can be found this way.
          </Text>
        )}

        {search.active ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips} keyboardShouldPersistTaps="handled">
              <SelectChip label="All" active={tab === 'all'} onPress={() => setTab('all')} />
              {(['players', 'teams', 'matches', 'tournaments'] as SearchKind[]).map((k) => (
                <SelectChip key={k} label={`${KIND_LABEL[k]} ${search.loading && total === 0 ? '…' : counts[k]}`} active={tab === k} onPress={() => setTab(k)} />
              ))}
            </ScrollView>

            {tab === 'players' && <PlayerFilters value={filters} onChange={setFilters} cities={cities} />}
            {sportNote}

            {firstLoad ? <LoadingState label="Searching…" /> : tab === 'all' ? (
              total === 0 ? (
                Object.keys(search.errors).length === 4
                  ? <EmptyState icon="⚠️" title="Search didn’t work" hint="Check your connection and try again." />
                  : <EmptyState icon="🔍" title={`Nothing matches “${q}”`} hint={contactSearch ? tabEmptyHint('players') : 'Try fewer letters, or search a match as ‘Red vs Blue’.'} />
              ) : (
                <>
                  {sections.map((k) => (
                    <React.Fragment key={k}>
                      <SectionHeader
                        title={KIND_LABEL[k]}
                        count={counts[k]}
                        onSeeAll={counts[k] > ALL_CAP ? () => setTab(k) : undefined}
                      />
                      {renderHits(k, ALL_CAP)}
                    </React.Fragment>
                  ))}
                  {Object.keys(search.errors).length > 0 && (
                    <Text style={textStyles.muted}>
                      {(Object.keys(search.errors) as SearchKind[]).map((k) => KIND_LABEL[k]).join(', ')} couldn’t load just now — showing the rest.
                    </Text>
                  )}
                </>
              )
            ) : (
              <>
                <Text style={textStyles.muted}>
                  {plural(counts[tab], KIND_LABEL[tab].toLowerCase().replace(/s$/, ''))} found{search.loading ? ' · updating…' : ''}
                </Text>
                {search.errors[tab] ? <EmptyState icon="⚠️" title="Search didn’t work" hint={search.errors[tab]} />
                  : counts[tab] === 0 ? <EmptyState icon="🔍" title={`No ${KIND_LABEL[tab].toLowerCase()} match “${q}”`} hint={tabEmptyHint(tab)} />
                  : renderHits(tab)}
              </>
            )}
          </>
        ) : (
          <>
        {q.length > 0 && q.length < MIN_QUERY && (
          <Text style={textStyles.muted}>Type one more letter to search.</Text>
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

        {searching ? <LoadingState label="Loading players…" />
          : searchError ? <EmptyState icon="⚠️" title="Players didn’t load" hint={searchError} />
          : results.length === 0 ? <EmptyState icon="🔍" title="No players match" hint={activeFilterCount(filters) ? 'Try removing a filter.' : 'No players yet.'} /> : null}

        {(showAllResults ? results : results.slice(0, SECTION_CAP)).map((r, i) => renderPlayer(r, filtering ? undefined : i + 1))}

        {openTournaments.length > 0 && (
          <>
            <SectionHeader
              title="🔓 Open tournaments"
              count={openTournaments.length}
              onSeeAll={openTournaments.length > SECTION_CAP ? () => setShowAllOpenTours((v) => !v) : undefined}
              expanded={showAllOpenTours}
            />
            <Text style={textStyles.muted}>Accepting team registrations — tap to view & request to join.</Text>
            {(showAllOpenTours ? openTournaments : openTournaments.slice(0, SECTION_CAP)).map((t) => renderTournament(t))}
          </>
        )}

        <SectionHeader
          title={`Teams ${sport !== 'all' ? `· ${getSport(sport).name}` : ''}`}
          count={teams.length}
          onSeeAll={teams.length > SECTION_CAP ? () => setShowAllTeams((v) => !v) : undefined}
          expanded={showAllTeams}
        />
        <Text style={textStyles.muted}>Tap a team for its profile, or follow to track them.</Text>
        {(showAllTeams ? teams : teams.slice(0, SECTION_CAP)).map(renderTeam)}
          </>
        )}
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
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing(3),
  },
  searchGlyph: { fontSize: 14 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: theme.spacing(3), color: theme.colors.text, fontSize: theme.font.body },
  clearBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt },
  clearText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  link: { color: theme.colors.primary, fontWeight: '800' },
});
