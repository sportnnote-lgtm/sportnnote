/** Team (house) profile: stats (form, scored/conceded, top performers,
 *  head-to-head), record per sport, squad, matches — and a follow toggle. */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, Pill, Button, LoadingState, ScreenTitle, SelectChip, textStyles } from '../components/ui';
import { useParamState } from '../navigation/useParamState';
import { MatchCard } from '../components/MatchCard';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { canScoreByRole } from '../core/roles';
import { useTeamSummary, useMatches, usePlayers, useFollow } from '../data/hooks';
import { getRoster, getMatchStatLines, getMatchSquads } from '../data/repos';
import { computeTeamStats, resultFor, type Result } from '../data/teamStats';
import { SPORT_AWARDS, statLabel } from '../data/ratings';
import type { Player, SportId, StatLine } from '../core/types';
import { teamStandings } from '../data/standings';
import type { RootStackParamList } from '../navigation/types';
import { RemindInstall } from '../components/RemindInstall';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function TeamProfileScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Team'>>();
  const { teamId } = params;
  const { profile } = useAuth();
  const { team, loading } = useTeamSummary(teamId);
  const { matches } = useMatches();
  const players = usePlayers();
  const { isFollowing, toggle } = useFollow(profile?.id);
  const [showSquad, setShowSquad] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [squad, setSquad] = useState<Player[]>([]);
  const [lines, setLines] = useState<StatLine[]>([]);
  const [playedFor, setPlayedFor] = useState<Record<string, string[]>>({});
  // Stats are per sport (goals and runs don't add up) — a multi-sport team picks one.
  const [statSport, setStatSport] = useParamState<string>('sport', '');
  const scrollRef = useRef<ScrollView>(null);
  const [statsY, setStatsY] = useState(0);

  // The team's real squad (the same roster the match screens use).
  useEffect(() => {
    if (!team) return;
    let on = true;
    Promise.all(team.sports.map((sp) => getRoster(team.name, sp, team.id))).then((lists) => {
      const seen = new Map<string, Player>();
      for (const p of lists.flat()) seen.set(p.id, p);
      if (on) setSquad([...seen.values()]);
    });
    return () => { on = false; };
  }, [team?.id, team?.name]);

  // Who played for THIS team in each finished match (its matchday squad, else its
  // squad) + those matches' stat lines → top performers.
  const finished = matches.filter((m) => team && (m.homeTeam.id === team.id || m.awayTeam.id === team.id) && resultFor(m, team.id));
  const sportsPlayed = [...new Set(finished.map((m) => m.sport))]
    .sort((a, b) => finished.filter((m) => m.sport === b).length - finished.filter((m) => m.sport === a).length);
  const sport = (sportsPlayed.includes(statSport as SportId) ? statSport : sportsPlayed[0]) as SportId | undefined;
  const doneIds = finished
    .filter((m) => m.sport === sport)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 40).map((m) => m.id);
  const doneKey = doneIds.join(',');
  useEffect(() => {
    if (!team || !doneIds.length) { setLines([]); setPlayedFor({}); return; }
    let on = true;
    const squadIds = squad.map((p) => p.id);
    Promise.all(doneIds.map(async (id) => {
      const m = matches.find((x) => x.id === id)!;
      const side = m.homeTeam.id === team.id ? 'home' : 'away';
      const [ls, sq] = await Promise.all([getMatchStatLines(id).catch(() => []), getMatchSquads(id).catch(() => null)]);
      const picked = sq ? [...sq[side].starters, ...sq[side].subs] : [];
      return { id, ls, who: picked.length ? picked : squadIds };
    })).then((rows) => {
      if (!on) return;
      setLines(rows.flatMap((r) => r.ls));
      setPlayedFor(Object.fromEntries(rows.map((r) => [r.id, r.who])));
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, doneKey, squad.length]);

  // Title the nav bar after the team, not a generic "Team" (breadcrumb).
  useEffect(() => {
    if (team) nav.setOptions({ title: team.name });
  }, [nav, team?.name]);

  if (loading) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <LoadingState label="Loading team…" />
      </SafeAreaView>
    );
  }

  // Resolved, but there's no such team — say so instead of spinning forever.
  if (!team) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={{ padding: theme.spacing(4), gap: theme.spacing(3) }}>
          <Text style={textStyles.h3}>Team not found</Text>
          <Text style={textStyles.muted}>This team may have been removed, or the link is out of date.</Text>
          <Button label="← Go back" variant="ghost" onPress={() => nav.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const following = isFollowing('team', team.id);
  const stats = computeTeamStats(team.id, matches.filter((m) => m.sport === sport), lines, playedFor, SPORT_AWARDS);
  const nameOf = (id: string) => squad.find((p) => p.id === id)?.fullName ?? players.find((p) => p.id === id)?.fullName ?? 'Player';
  const openMatch = (m: (typeof matches)[number]) => nav.navigate('LiveScoring', {
    matchId: m.id, sport: m.sport,
    homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
    homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
    homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
    canScore: canScoreByRole(profile?.role),
  });
  const teamMatches = matches.filter((m) => m.homeTeam.id === team.id || m.awayTeam.id === team.id);
  const records = team.sports
    .map((sp) => ({ sport: sp, row: teamStandings(matches, sp).find((t) => t.teamId === team.id) }))
    .filter((r) => r.row);
  // Aggregate record across every sport, for the at-a-glance headline (mirrors
  // the player profile's Matches / Wins / Win-rate tiles).
  const totalPlayed = records.reduce((n, r) => n + r.row!.played, 0);
  const totalWon = records.reduce((n, r) => n + r.row!.won, 0);
  const teamWinRate = totalPlayed ? Math.round((totalWon / totalPlayed) * 100) : 0;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={st.content}>
        <View style={st.headerRow}>
          <View style={[st.crest, { backgroundColor: (team.colorHex ?? theme.colors.surfaceAlt) + '33', borderColor: team.colorHex ?? theme.colors.border }]}>
            <Text style={[st.crestText, { color: team.colorHex ?? theme.colors.text }]}>
              {team.name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={textStyles.h2}>{team.name}</Text>
            <View style={st.tags}>
              {team.sports.map((s) => (
                <Pill key={s} label={`${getSport(s).icon} ${getSport(s).name}`} />
              ))}
            </View>
          </View>
        </View>

        <Button
          label={following ? '✓ Following' : '+ Follow team'}
          variant={following ? 'ghost' : 'primary'}
          onPress={() => toggle('team', team.id)}
        />
        <View style={st.actions}>
          <View style={{ flex: 1 }}><Button label="📊 Stats" variant="ghost" onPress={() => scrollRef.current?.scrollTo({ y: statsY, animated: true })} /></View>
          <View style={{ flex: 1 }}><Button label="👥 Squad · ＋ Add" variant="ghost" onPress={() => nav.navigate('Squad', { teamId: team.id })} /></View>
        </View>

        {/* ── Stats ── */}
        <View onLayout={(e) => setStatsY(e.nativeEvent.layout.y)} style={{ gap: theme.spacing(3) }}>
          <Text style={[textStyles.h3, st.section]}>Stats{sport && sportsPlayed.length === 1 ? ` · ${getSport(sport).icon} ${getSport(sport).name}` : ''}</Text>
          {sportsPlayed.length > 1 && (
            <View style={st.tags}>
              {sportsPlayed.map((sp) => (
                <SelectChip key={sp} label={`${getSport(sp).icon} ${getSport(sp).name}`} active={sp === sport} onPress={() => setStatSport(sp)} />
              ))}
            </View>
          )}
          {stats.played === 0 ? (
            <EmptyState icon="📊" title="No results yet" hint="Stats appear here after this team’s first finished match." compact />
          ) : (
            <>
              <View style={st.statGrid}>
                <Stat value={String(stats.played)} label="Played" />
                <Stat value={String(stats.won)} label="Won" />
                <Stat value={`${Math.round((stats.won / stats.played) * 100)}%`} label="Win rate" />
              </View>
              <Card style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.muted}>Form · latest first  ·  {stats.won}W {stats.drawn}D {stats.lost}L</Text>
                <View style={st.formRow}>
                  {stats.form.map((f) => (
                    <TouchableOpacity key={f.matchId} accessibilityRole="button" accessibilityLabel={`${f.result === 'W' ? 'Won' : f.result === 'D' ? 'Drew' : 'Lost'} vs ${f.opponentName}`} onPress={() => { const m = matches.find((x) => x.id === f.matchId); if (m) openMatch(m); }}>
                      <View style={[st.formChip, { backgroundColor: FORM_COLOR[f.result] }]}><Text style={st.formText}>{f.result}</Text></View>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
              <View style={st.statGrid}>
                <Stat value={String(stats.scored)} label={stats.unit ? `${cap(stats.unit)} for` : 'Scored'} />
                <Stat value={String(stats.conceded)} label={stats.unit ? `${cap(stats.unit)} against` : 'Conceded'} />
                <Stat value={`${stats.scored - stats.conceded >= 0 ? '+' : ''}${stats.scored - stats.conceded}`} label="Difference" />
              </View>
              {(stats.leaders.length > 0 || stats.appearances.length > 0) && (
                <Card style={{ gap: theme.spacing(2) }}>
                  <Text style={textStyles.muted}>Top performers</Text>
                  {stats.leaders.map((l) => (
                    <TouchableOpacity key={l.stat} accessibilityRole="button" style={st.leaderRow} onPress={() => nav.navigate('PlayerProfile', { playerId: l.playerId })}>
                      <Text style={st.leaderIcon}>{l.icon}</Text>
                      <Text style={[textStyles.muted, { width: 96 }]}>{l.label}</Text>
                      <Text style={st.leaderName} numberOfLines={1}>{nameOf(l.playerId)}</Text>
                      <Text style={st.leaderVal}>{l.total} {statLabel(l.stat, l.total)}</Text>
                    </TouchableOpacity>
                  ))}
                  {stats.appearances[0] && (
                    <TouchableOpacity accessibilityRole="button" style={st.leaderRow} onPress={() => nav.navigate('PlayerProfile', { playerId: stats.appearances[0].playerId })}>
                      <Text style={st.leaderIcon}>👟</Text>
                      <Text style={[textStyles.muted, { width: 96 }]}>Most games</Text>
                      <Text style={st.leaderName} numberOfLines={1}>{nameOf(stats.appearances[0].playerId)}</Text>
                      <Text style={st.leaderVal}>{stats.appearances[0].matches}</Text>
                    </TouchableOpacity>
                  )}
                </Card>
              )}
              {stats.headToHead.length > 0 && (
                <Card style={{ gap: theme.spacing(2) }}>
                  <Text style={textStyles.muted}>Head-to-head</Text>
                  {stats.headToHead.map((h) => (
                    <TouchableOpacity key={h.opponentId} accessibilityRole="button" style={st.leaderRow} onPress={() => nav.push('Team', { teamId: h.opponentId })}>
                      <Text style={st.leaderName} numberOfLines={1}>vs {h.opponentName}</Text>
                      <Text style={textStyles.muted}>{h.played}P · {h.won}W {h.drawn}D {h.lost}L</Text>
                      <Text style={st.leaderVal}>{h.for}–{h.against}</Text>
                    </TouchableOpacity>
                  ))}
                </Card>
              )}
            </>
          )}
        </View>

        {records.length > 0 && (
          <>
            <Text style={[textStyles.h3, st.section]}>Record by sport</Text>
            {records.map(({ sport, row }) => (
              <Card key={sport} style={st.recordRow}>
                <Text style={st.recordIcon}>{getSport(sport).icon}</Text>
                <Text style={[textStyles.body, { flex: 1 }]}>{getSport(sport).name}</Text>
                <Text style={textStyles.muted}>{row!.won}W {row!.lost}L {row!.drawn}D</Text>
                <Text style={st.recordPts}>{row!.points} pts</Text>
              </Card>
            ))}
          </>
        )}

        <SectionHeader
          title={`Squad (${squad.length})`}
          count={squad.length}
          onSeeAll={squad.length > SECTION_CAP ? () => setShowSquad((v) => !v) : undefined}
          expanded={showSquad}
        />
        {squad.length === 0 ? (
          <EmptyState icon="👥" title="No players listed for this team" compact />
        ) : (
          (showSquad ? squad : squad.slice(0, SECTION_CAP)).map((p) => (
            <TouchableOpacity accessibilityRole="button" key={p.id} activeOpacity={0.85} onPress={() => nav.navigate('PlayerProfile', { playerId: p.id })}>
              <Card style={st.playerRow}>
                <View style={[st.avatar, { backgroundColor: (team.colorHex ?? theme.colors.surfaceAlt) + '33' }]}>
                  <Text style={[st.avatarText, { color: team.colorHex ?? theme.colors.primary }]}>
                    {p.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={textStyles.body}>{p.fullName}{p.jerseyNo ? ` · #${p.jerseyNo}` : ''}{p.invited ? '  ⏳' : ''}</Text>
                  <Text style={textStyles.muted}>{p.invited ? 'Invited · hasn’t joined yet' : p.sports.map((s) => getSport(s).icon).join(' ')}</Text>
                  {p.invited && p.phone ? <RemindInstall playerId={p.id} name={p.fullName} phone={p.phone} teamName={team.name} /> : null}
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}

        {teamMatches.length > 0 && (
          <>
            <SectionHeader
              title="Matches"
              count={teamMatches.length}
              onSeeAll={teamMatches.length > SECTION_CAP ? () => setShowMatches((v) => !v) : undefined}
              expanded={showMatches}
            />
            {(showMatches ? teamMatches : teamMatches.slice(0, SECTION_CAP)).map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onPress={() => openMatch(m)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** One headline record tile (Played / Won / Win rate) — same treatment as the
 *  player profile, so a team's record reads at a glance and the two pages match. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={st.statCard}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={textStyles.muted}>{label}</Text>
    </Card>
  );
}

const FORM_COLOR: Record<Result, string> = { W: theme.colors.primary, D: theme.colors.textMuted, L: theme.colors.danger };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const st = StyleSheet.create({
  actions: { flexDirection: 'row', gap: theme.spacing(3) },
  formRow: { flexDirection: 'row', gap: theme.spacing(2) },
  formChip: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  formText: { color: '#06120D', fontWeight: '900', fontSize: theme.font.body },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  leaderIcon: { fontSize: 18, width: 24 },
  leaderName: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', flex: 1 },
  leaderVal: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  headerRow: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  statCard: { width: '30%', alignItems: 'center', gap: theme.spacing(1), flexGrow: 1 },
  statValue: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  crest: { width: 64, height: 64, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', ...theme.shadow.card },
  crestText: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  tags: { flexDirection: 'row', gap: theme.spacing(2), flexWrap: 'wrap', marginTop: theme.spacing(2) },
  section: { marginTop: theme.spacing(2) },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  recordIcon: { fontSize: 22 },
  recordPts: { color: theme.colors.primary, fontSize: theme.font.h3, fontWeight: '900' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
});
