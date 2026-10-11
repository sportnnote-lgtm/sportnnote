/** Golf inside a tournament (stroke play / Stableford): its rounds and the
 *  cumulative leaderboard across them, plus "set up a round". Match-play golf
 *  tournaments use the normal matches/bracket hub instead. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Button, Pill, SelectChip, textStyles } from '../ui';
import { SectionHeader } from '../SectionHeader';
import { GolfLeaderboard, type LeaderboardCard } from './GolfLeaderboard';
import { GolfTeamBoard } from './GolfTeamBoard';
import { golfTeamFormatOf } from '../../data/golfTeams';
import { useGolfRounds } from '../../data/useGolf';
import { buildLeaderboard, golfFormatOf, roundCells, roundContext, cardOf } from '../../data/golf';
import type { RootStackParamList } from '../../navigation/types';
import type { StatLine } from '../../core/types';
import { StatLeaderRail } from '../StatLeaderRail';
import { getAllStatLines } from '../../data/repos';
import { categoryLeaders } from '../../data/standings';
import { readLeaderMins } from '../../data/leaderMinimums';
import { golfLeaderCategories } from '../../data/golfLeaders';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GolfTournamentHub({ tournamentId, format, canOrganize }: { tournamentId: string; format?: Record<string, unknown>; canOrganize: boolean }) {
  const nav = useNavigation<Nav>();
  const { events, entries, courses, players, teams, loading } = useGolfRounds({ tournamentId });
  const rows = useMemo(() => buildLeaderboard(events, entries, courses), [events, entries, courses]);
  const scoring = events.length ? golfFormatOf(events[events.length - 1]).scoring : (format?.competition === 'stableford' ? 'stableford' : 'stroke');
  const last = events[events.length - 1];
  const nameOf = (pid: string) => players.get(pid)?.fullName ?? 'Player';
  // SD-42 — R1–R4 + "F" / thru N / "–", and a card drill-down per round
  const cells = useMemo(() => roundCells(events, entries, courses), [events, entries, courses]);
  const [pick, setPick] = useState<number | null>(null);
  const cardEv = events[pick ?? events.length - 1];
  const cards = useMemo(() => {
    const m = new Map<string, LeaderboardCard>();
    const course = cardEv && courses.find((c) => c.id === golfFormatOf(cardEv).courseId);
    if (!cardEv || !course) return m;
    for (const en of entries.filter((e) => e.eventId === cardEv.id)) {
      const ctx = roundContext(cardEv, course, en);
      m.set(en.playerId, { holes: ctx.holes, card: cardOf(en, ctx.holes.length), received: ctx.received });
    }
    return m;
  }, [cardEv, courses, entries]);

  // SD-49 (GF-08) — leaders from the finished rounds' stat lines (low round,
  // scoring average, birdies, eagles, putts, greens); a live round has no line yet
  const done = events.filter((e) => e.status === 'completed').map((e) => e.id).join(',');
  const [lines, setLines] = useState<StatLine[]>([]);
  useEffect(() => {
    let on = true;
    if (!done) { setLines([]); return; }
    const ids = new Set(done.split(','));
    void getAllStatLines()
      .then((ls) => on && setLines(ls.filter((l) => l.sport === 'golf' && !!l.eventId && ids.has(l.eventId))))
      .catch(() => {});
    return () => { on = false; };
  }, [done]);
  const categories = useMemo(
    () => golfLeaderCategories(categoryLeaders(lines, [...players.values()], 'golf', { mins: readLeaderMins(format) }), format),
    [lines, players, format],
  );

  return (
    <View style={{ gap: theme.spacing(3) }}>
      {canOrganize && (
        last && last.status === 'completed'
          ? <Button label={`＋ Set up round ${last.roundNo + 1}`} variant="ghost" onPress={() => nav.navigate('GolfRoundSetup', { tournamentId, nextOf: last.id })} />
          : !last && <Button label="⛳ Set up round 1" onPress={() => nav.navigate('GolfRoundSetup', { tournamentId, competition: String(format?.competition ?? 'stroke'), holes: String(format?.holes ?? '18') })} />
      )}

      <SectionHeader title="⛳ Rounds" count={events.length} />
      {loading ? <Text style={textStyles.muted}>Loading…</Text> : events.length === 0 ? (
        <Text style={textStyles.muted}>No rounds yet.</Text>
      ) : events.map((e) => (
        <TouchableOpacity key={e.id} accessibilityRole="button" activeOpacity={0.85} onPress={() => nav.navigate('GolfRound', { eventId: e.id })}>
          <View style={st.round}>
            <View style={{ flex: 1 }}>
              <Text style={[textStyles.body, st.bold]}>{e.title}</Text>
              <Text style={textStyles.muted}>{new Date(e.startsAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {entries.filter((x) => x.eventId === e.id).length} players</Text>
            </View>
            <Pill
              label={e.status === 'live' ? 'LIVE' : e.status === 'completed' ? 'FINAL' : 'UPCOMING'}
              color={e.status === 'live' ? theme.colors.danger : theme.colors.surfaceAlt}
              textColor={e.status === 'live' ? '#fff' : theme.colors.textMuted}
            />
          </View>
        </TouchableOpacity>
      ))}

      <SectionHeader title={events.length > 1 ? '🏆 Leaderboard (all rounds)' : '🏆 Leaderboard'} count={rows.length} />
      {events.length > 1 && (
        <View style={st.chips}>
          <Text style={textStyles.muted}>Cards:</Text>
          {events.map((e, i) => (
            <SelectChip key={e.id} label={`R${e.roundNo}`} active={cardEv?.id === e.id} onPress={() => setPick(i)} />
          ))}
        </View>
      )}
      <GolfLeaderboard rows={rows} scoring={scoring} nameOf={nameOf} roundCols={cells} cards={cards}
        cardTitle={cardEv ? `Round ${cardEv.roundNo} card` : undefined} />
      {rows.length > 0 && <Text style={textStyles.muted}>Tap a player for their card{events.length > 1 ? ' (pick the round above)' : ''}. F = round finished · – = not teed off.</Text>}
      {/* SD-76 — team stroke play: best N of M across the rounds */}
      {last && golfTeamFormatOf(last) && (
        <>
          <SectionHeader title="👥 Team leaderboard" count={new Set(entries.filter((e) => e.teamId).map((e) => e.teamId)).size} />
          <GolfTeamBoard events={events} entries={entries} courses={courses} nameOf={nameOf} teamName={(id) => teams.get(id)?.name ?? 'Team'} />
        </>
      )}
      {categories.length > 0 && (
        <>
          <SectionHeader title="📊 Leaders" count={categories.length} />
          <Text style={textStyles.muted}>From finished rounds. Swipe for more →</Text>
          <StatLeaderRail categories={categories} onPlayer={(id) => nav.navigate('PlayerProfile', { playerId: id })} />
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  round: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  bold: { fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
});
