/** A series / tie in full: the two teams, the running standing (wins or
 *  aggregate), the decided winner, and every leg as a tappable card that opens
 *  the normal live-scoring screen. The standing recomputes from the legs' results
 *  each time it's opened, so scoring a leg and coming back updates the series. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { ScreenTitle, LoadingState, Button, FieldLabel, FormError, textStyles } from '../components/ui';
import { PODIUM } from '../components/Rank';
import { formatShort, useUserTimeZone } from '../core/time';
import { useAuth } from '../core/auth';
import { useMatches } from '../data/hooks';
import { getMyPlayerId, deleteSeries } from '../data/repos';
import { deriveSeries, resolveSeries, type SeriesFormat } from '../data/series';
import type { Match } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FORMAT_LABEL: Record<SeriesFormat, (n: number) => string> = {
  best_of: (n) => `Best of ${n}`,
  aggregate: () => 'Two legs · aggregate',
  rubbers: (n) => `${n} rubbers`,
};

export default function SeriesScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Series'>>();
  const tz = useUserTimeZone();
  const { profile } = useAuth();
  const { matches, loading } = useMatches('all');

  const series = useMemo(() => deriveSeries(matches).find((s) => s.id === params.seriesId), [matches, params.seriesId]);
  const standing = useMemo(() => (series ? resolveSeries(series) : null), [series]);

  const [myId, setMyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let on = true; getMyPlayerId(profile?.id).then((id) => on && setMyId(id)); return () => { on = false; }; }, [profile?.id]);

  // Host of the tie = host of any of its legs. Deletable only while every leg is
  // still pre-match (nothing scored to lose).
  const canManage = !!myId && !!series && series.legs.some((m) => (m.hostIds ?? []).includes(myId));
  const allPreMatch = !!series && series.legs.every((m) => m.status !== 'live' && m.status !== 'completed');

  async function removeSeries() {
    setBusy(true); setError(null);
    try {
      await deleteSeries(params.seriesId);
      nav.popToTop();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the series.');
      setBusy(false);
    }
  }

  if (loading && !series) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><LoadingState label="Loading series…" /></SafeAreaView>;
  }
  if (!series || !standing) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><Text style={st.note}>Series not found.</Text></SafeAreaView>;
  }

  const isAgg = series.format === 'aggregate';
  const scoreA = isAgg ? standing.aggA : standing.winsA;
  const scoreB = isAgg ? standing.aggB : standing.winsB;
  const winId = standing.winnerId;
  const teamAName = series.teamA?.name ?? 'Team A';
  const teamBName = series.teamB?.name ?? 'Team B';
  const winnerName = winId === series.teamA?.id ? teamAName : winId === series.teamB?.id ? teamBName : null;

  const openLeg = (m: Match) =>
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore: false,
    });

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title={series.name || `${teamAName} v ${teamBName}`} subtitle={FORMAT_LABEL[series.format](series.legsPlanned)} />

        {/* Standing */}
        <View style={st.board}>
          <View style={st.side}>
            {series.teamA?.colorHex ? <View style={[st.dot, { backgroundColor: series.teamA.colorHex }]} /> : null}
            <Text style={[st.team, winId === series.teamA?.id && st.winner]} numberOfLines={1}>{teamAName}</Text>
          </View>
          <View style={st.scoreWrap}>
            <Text style={[st.score, winId === series.teamA?.id && st.winner]}>{scoreA}</Text>
            <Text style={st.scoreSep}>–</Text>
            <Text style={[st.score, winId === series.teamB?.id && st.winner]}>{scoreB}</Text>
          </View>
          <View style={st.side}>
            {series.teamB?.colorHex ? <View style={[st.dot, { backgroundColor: series.teamB.colorHex }]} /> : null}
            <Text style={[st.team, winId === series.teamB?.id && st.winner]} numberOfLines={1}>{teamBName}</Text>
          </View>
        </View>
        <Text style={st.summary}>{isAgg ? 'aggregate' : 'wins'} · {standing.summary}</Text>

        {winnerName && (
          <View style={st.champ}>
            <Text style={st.champText}>🏆 {winnerName} win the tie</Text>
          </View>
        )}

        {/* Legs */}
        <Text style={textStyles.h3}>Matches</Text>
        {series.legs.map((m, i) => {
          const live = m.status === 'live';
          const done = m.status === 'completed';
          const wId = done && m.winner && m.winner !== 'draw' ? (m.winner === 'home' ? m.homeTeam.id : m.awayTeam.id) : undefined;
          return (
            <TouchableOpacity accessibilityRole="button" key={m.id} activeOpacity={0.85} style={[st.leg, live && st.legLive]} onPress={() => openLeg(m)}>
              <View style={st.legTop}>
                <Text style={st.legNo}>Leg {i + 1}</Text>
                <Text style={[st.legStatus, live && st.legStatusLive]}>{live ? '● LIVE' : done ? 'FT' : formatShort(m.startsAt, tz)}</Text>
              </View>
              <View style={st.legRow}>
                <Text style={[st.legTeam, wId === m.homeTeam.id && st.winner]} numberOfLines={1}>{m.homeTeam.name}</Text>
                {m.score ? <Text style={st.legScore}>{m.score.home}–{m.score.away}</Text> : <Text style={st.legVs}>vs</Text>}
                <Text style={[st.legTeam, st.legTeamRight, wId === m.awayTeam.id && st.winner]} numberOfLines={1}>{m.awayTeam.name}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {standing.decided && standing.gamesLeft > 0 && (
          <Text style={textStyles.muted}>The tie is decided — remaining matches are dead rubbers.</Text>
        )}

        {/* Host-only delete — offered only while no leg has been played. */}
        {canManage && (
          <View style={st.danger}>
            <FieldLabel>Danger zone</FieldLabel>
            {!allPreMatch ? (
              <Text style={textStyles.muted}>Some matches have already started, so this series can no longer be deleted.</Text>
            ) : !confirmDelete ? (
              <Button label={`🗑 Delete series (${series.legs.length} matches)`} variant="danger" disabled={busy} onPress={() => setConfirmDelete(true)} />
            ) : (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={st.confirmText}>Delete this series and all {series.legs.length} of its matches? This can’t be undone.</Text>
                <View style={st.confirmRow}>
                  <Button label="Keep" variant="ghost" style={st.flex} disabled={busy} onPress={() => setConfirmDelete(false)} />
                  <Button label={busy ? 'Deleting…' : 'Delete'} variant="danger" style={st.flex} disabled={busy} onPress={removeSeries} />
                </View>
              </View>
            )}
            <FormError message={error} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  note: { color: theme.colors.textMuted, fontSize: theme.font.body, padding: theme.spacing(4) },
  board: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing(4),
  },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  team: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', flexShrink: 1 },
  winner: { color: theme.colors.text, fontWeight: '900' },
  scoreWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  score: { color: theme.colors.text, fontSize: 30, fontWeight: '800', minWidth: 22, textAlign: 'center' },
  scoreSep: { color: theme.colors.textMuted, fontSize: theme.font.h3 },
  summary: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
  champ: { backgroundColor: PODIUM[0] + '1F', borderRadius: theme.radius.md, padding: theme.spacing(3), borderWidth: 1, borderColor: PODIUM[0] + '66' },
  champText: { color: PODIUM[0], fontSize: theme.font.body, fontWeight: '800', textAlign: 'center' },
  leg: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  legLive: { borderColor: theme.colors.danger + '99' },
  legTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legNo: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  legStatus: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  legStatusLive: { color: theme.colors.danger },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  legTeam: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  legTeamRight: { textAlign: 'right' },
  legScore: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  legVs: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  danger: { gap: theme.spacing(2), marginTop: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing(4) },
  confirmText: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  confirmRow: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
});
