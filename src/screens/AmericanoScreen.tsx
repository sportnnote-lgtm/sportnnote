/** Americano (padel/pickleball): individuals rotate partners each round; every point
 *  you win is added to your personal total. This screen lets the organizer add
 *  players, generate the rotation, enter each game's score, and see the live
 *  individual leaderboard. State rides the tournament's formats[sport] JSONB. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, SelectChip, ScreenTitle, EmptyState, TextField, Button, textStyles } from '../components/ui';
import { RankBadge } from '../components/Rank';
import { getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { canManageTournament } from '../core/org';
import { useTournamentById, useOrganizations } from '../data/hooks';
import { getMyPlayerId, updateTournament, patchTournamentFormat, formatDiff } from '../data/repos';
import {
  americanoSchedule, americanoStandings, suggestedAmericanoRounds, gameKey,
  readAmericano, writeAmericano, newAmericanoPlayer, type AmericanoState,
} from '../data/americano';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AmericanoScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Americano'>>();
  const { tournamentId, sport } = params;
  const tournament = useTournamentById(tournamentId);
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => { let on = true; getMyPlayerId(profile?.id).then((id) => on && setMyId(id)); return () => { on = false; }; }, [profile?.id]);
  const canManage = !!tournament && canManageTournament(tournament, orgs, myId);

  const [state, setState] = useState<AmericanoState>(() => readAmericano(tournament?.formats?.[sport]));
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // Reload from the tournament when it changes and we've no unsaved edits.
  useEffect(() => {
    if (!dirty) setState(readAmericano(tournament?.formats?.[sport]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id, tournament?.formats, sport]);

  useEffect(() => { if (tournament) nav.setOptions({ title: tournament.name }); }, [nav, tournament?.name]);

  const persist = async (next: AmericanoState) => {
    setState(next); setDirty(false);
    if (!tournament?.id) return;
    setBusy(true);
    const before = tournament.formats?.[sport] as Record<string, unknown> | undefined;
    await patchTournamentFormat(tournament.id, sport, formatDiff(before, writeAmericano(tournament.formats?.[sport], next) as Record<string, unknown>));
    setBusy(false);
  };

  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—';
  const standings = useMemo(() => americanoStandings(state.players, state.schedule, state.scores), [state]);
  const hasSchedule = state.schedule.length > 0;
  const suggested = suggestedAmericanoRounds(state.players.length);

  const addPlayer = () => {
    if (!name.trim()) return;
    void persist({ ...state, players: [...state.players, newAmericanoPlayer(name)] });
    setName('');
  };
  const removePlayer = (id: string) => void persist({ ...state, players: state.players.filter((p) => p.id !== id) });
  const setTarget = (t: number) => void persist({ ...state, target: t });
  const setRounds = (r: number) => void persist({ ...state, rounds: r });
  const generate = () => {
    const rounds = state.rounds || suggested;
    void persist({ ...state, rounds, schedule: americanoSchedule(state.players.map((p) => p.id), rounds), scores: {} });
  };
  const setScore = (key: string, side: 'a' | 'b', v: string) => {
    const n = Math.max(0, parseInt(v.replace(/[^0-9]/g, ''), 10) || 0);
    const cur = state.scores[key] ?? { a: 0, b: 0 };
    setState((s) => ({ ...s, scores: { ...s.scores, [key]: { ...cur, [side]: n } } }));
    setDirty(true);
  };
  const saveScores = () => void persist(state);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={`${getSport(sport).icon} Americano`} subtitle="Rotate partners each round · individual points" />

        {/* Leaderboard first — it's the point of Americano. */}
        <Text style={textStyles.h3}>🏅 Leaderboard</Text>
        <Card style={{ gap: theme.spacing(1) }}>
          <View style={[st.row, st.head]}>
            <View style={st.posCell}><Text style={st.headText}>#</Text></View>
            <Text style={[st.nameCol, st.headText]}>Player</Text>
            <Text style={[st.num, st.headText]}>GP</Text>
            <Text style={[st.num, st.headText]}>Pts</Text>
          </View>
          {standings.length === 0 ? (
            <EmptyState icon="🎾" title="No players yet" hint="Add players below to start." compact />
          ) : standings.map((r, i) => (
            <View key={r.id} style={[st.row, i > 0 && st.rowDivider]}>
              <RankBadge index={i} />
              <Text style={[st.nameCol, textStyles.body]} numberOfLines={1}>{r.name}</Text>
              <Text style={st.num}>{r.games}</Text>
              <Text style={[st.num, st.pts]}>{r.points}</Text>
            </View>
          ))}
        </Card>

        {canManage && (
          <>
            {/* Players */}
            <Text style={[textStyles.h3, st.section]}>Players · {state.players.length}</Text>
            <Card style={{ gap: theme.spacing(2) }}>
              {state.players.map((p) => (
                <View key={p.id} style={st.playerRow}>
                  <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={st.removeX} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} onPress={() => removePlayer(p.id)}>✕</Text>
                </View>
              ))}
              <View style={st.addRow}>
                <View style={{ flex: 1 }}><TextField label="" value={name} onChange={setName} placeholder="Add a player" /></View>
                <Button label="Add" onPress={addPlayer} />
              </View>
            </Card>

            {/* Setup */}
            <Text style={[textStyles.h3, st.section]}>Setup</Text>
            <Card style={{ gap: theme.spacing(3) }}>
              <View>
                <Text style={st.lbl}>Points per game</Text>
                <View style={st.chips}>
                  {[16, 21, 24, 32].map((t) => <SelectChip key={t} label={String(t)} active={state.target === t} onPress={() => setTarget(t)} />)}
                </View>
              </View>
              <View>
                <Text style={st.lbl}>Rounds ({state.players.length >= 4 ? `suggested ${suggested}` : 'need 4+ players'})</Text>
                <View style={st.chips}>
                  {[3, 4, 5, 6, 7, 8].map((r) => <SelectChip key={r} label={String(r)} active={(state.rounds || suggested) === r} onPress={() => setRounds(r)} />)}
                </View>
              </View>
              <Button
                label={hasSchedule ? 'Regenerate rounds (clears scores)' : 'Generate rounds'}
                variant={hasSchedule ? 'ghost' : 'primary'}
                disabled={state.players.length < 4 || busy}
                onPress={generate}
              />
              {state.players.length < 4 && <Text style={textStyles.muted}>Americano needs at least 4 players (a 2-v-2 game).</Text>}
            </Card>

            {/* Rounds + score entry */}
            {hasSchedule && (
              <>
                <Text style={[textStyles.h3, st.section]}>Rounds</Text>
                {state.schedule.map((rnd) => (
                  <Card key={rnd.round} style={{ gap: theme.spacing(2) }}>
                    <Text style={st.roundTitle}>Round {rnd.round}</Text>
                    {rnd.games.map((g) => {
                      const key = gameKey(g);
                      const sc = state.scores[key] ?? { a: 0, b: 0 };
                      return (
                        <View key={key} style={st.game}>
                          <View style={st.sideRow}>
                            <Text style={st.sideNames} numberOfLines={1}>{nameOf(g.a[0])} & {nameOf(g.a[1])}</Text>
                            <View style={st.scoreBox}><TextField label="" value={sc.a ? String(sc.a) : ''} onChange={(v) => setScore(key, 'a', v)} placeholder="0" autoCapitalize="none" /></View>
                          </View>
                          <View style={st.sideRow}>
                            <Text style={st.sideNames} numberOfLines={1}>{nameOf(g.b[0])} & {nameOf(g.b[1])}</Text>
                            <View style={st.scoreBox}><TextField label="" value={sc.b ? String(sc.b) : ''} onChange={(v) => setScore(key, 'b', v)} placeholder="0" autoCapitalize="none" /></View>
                          </View>
                        </View>
                      );
                    })}
                    {rnd.resting.length > 0 && <Text style={textStyles.muted}>Resting: {rnd.resting.map(nameOf).join(', ')}</Text>}
                  </Card>
                ))}
                {dirty && <Button label={busy ? 'Saving…' : 'Save scores'} onPress={saveScores} />}
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
  section: { marginTop: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1) },
  rowDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  head: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing(2) },
  headText: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  posCell: { width: 28, alignItems: 'center' },
  nameCol: { flex: 1 },
  num: { width: 40, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  pts: { fontWeight: '900', color: theme.colors.primary },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  removeX: { color: theme.colors.danger, fontSize: theme.font.body, fontWeight: '900', paddingHorizontal: theme.spacing(2) },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing(2) },
  lbl: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', marginBottom: theme.spacing(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  roundTitle: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body },
  game: { gap: theme.spacing(1), borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: theme.spacing(3) },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  sideNames: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  scoreBox: { width: 70 },
});
