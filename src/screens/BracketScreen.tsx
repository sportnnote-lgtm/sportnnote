/** Knockout bracket for a sport. Two modes, chosen automatically:
 *  • Staged (real) — when the tournament has stage-tagged knockout matches
 *    (r32…final), render the actual matches round by round with scores/results,
 *    and let an organizer advance the winners into the next round.
 *  • Computed (preview) — otherwise, seed the participating teams into a draw
 *    (byes for non-power-of-two) as a preview. Group-stage matches are excluded
 *    from both, so a grouped tournament's bracket shows only its knockout. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { SelectChip, Button, ScreenTitle, FormError, textStyles } from '../components/ui';
import { PODIUM } from '../components/Rank';
import { getSport } from '../sports/registry';
import { useAuth } from '../core/auth';
import { useTournament, useTournamentById, useLeagueData, useOrganizations, useTeams } from '../data/hooks';
import { getMyPlayerId, createMatch } from '../data/repos';
import { canManageTournament } from '../core/org';
import {
  knockoutBracket, bracketChampion, type BracketSlot, type BracketMatch, type DecideFn,
  knockoutStageRounds, nextRoundPairs, matchWinnerId, stageChampionId, KO_STAGE_LABEL,
} from '../data/bracket';
import type { Match, SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type SlotState = 'won' | 'lost' | 'neutral';

function Slot({ slot, state = 'neutral' }: { slot: BracketSlot; state?: SlotState }) {
  const dim = slot.bye || slot.tbd || state === 'lost';
  return (
    <View style={st.slot}>
      {slot.color ? <View style={[st.dot, { backgroundColor: slot.color }]} /> : <View style={st.dotGap} />}
      <Text style={[st.slotName, dim && st.muted, state === 'won' && st.winnerName]} numberOfLines={1}>{slot.name}</Text>
      {state === 'won' && <Text style={st.check}>✓</Text>}
    </View>
  );
}

/** A real staged match: team + colour + score, winner emphasised, loser dimmed. */
function StagedSide({ name, color, score, state }: { name: string; color?: string; score?: number; state: SlotState }) {
  return (
    <View style={st.slot}>
      {color ? <View style={[st.dot, { backgroundColor: color }]} /> : <View style={st.dotGap} />}
      <Text style={[st.slotName, state === 'lost' && st.muted, state === 'won' && st.winnerName]} numberOfLines={1}>{name}</Text>
      {score != null && <Text style={[st.score, state === 'won' && st.winnerName, state === 'lost' && st.muted]}>{score}</Text>}
      {state === 'won' && <Text style={st.check}>✓</Text>}
    </View>
  );
}

export default function BracketScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Bracket'>>();
  const { profile } = useAuth();
  // Scope to the tournament we were opened from. Fall back to the app's selected
  // tournament only when no id was passed (e.g. an old deep link).
  const byId = useTournamentById(params?.tournamentId);
  const fallback = useTournament();
  const tournament = byId ?? fallback;
  const tournamentId = params?.tournamentId ?? fallback?.id;
  const sports = tournament?.sports ?? [];
  const [sport, setSport] = useState<SportId>(params?.sport ?? 'football');
  // Clamp the shown sport to one this tournament actually has.
  const activeSport = sports.includes(sport) ? sport : sports[0] ?? sport;

  const [nonce, setNonce] = useState(0); // bump to refetch after creating a round
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { matches } = useLeagueData(tournamentId, nonce);
  const sportMatches = useMemo(() => matches.filter((m) => m.sport === activeSport), [matches, activeSport]);

  const orgs = useOrganizations();
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    getMyPlayerId(profile?.id).then((id) => on && setMyId(id));
    return () => { on = false; };
  }, [profile?.id]);
  const canManage = tournament ? canManageTournament(tournament, orgs, myId) : false;

  useEffect(() => {
    if (tournament) nav.setOptions({ title: tournament.name });
  }, [nav, tournament?.name]);

  // ── Staged (real) bracket: actual knockout matches, grouped by stage.
  const koRounds = useMemo(() => knockoutStageRounds(sportMatches), [sportMatches]);
  const isStaged = koRounds.length > 0;
  // Names/colours for every team — including bye teams that played no match, so
  // the "byes to next round" line resolves their names, not raw ids.
  const allTeams = useTeams(activeSport);
  const nameColor = useMemo(() => {
    const m = new Map<string, { name: string; color?: string }>();
    for (const t of allTeams) m.set(t.id, { name: t.name, color: t.colorHex });
    for (const x of sportMatches) {
      m.set(x.homeTeam.id, { name: x.homeTeam.name, color: x.homeTeam.colorHex });
      m.set(x.awayTeam.id, { name: x.awayTeam.name, color: x.awayTeam.colorHex });
    }
    return m;
  }, [allTeams, sportMatches]);
  const stagedChampionId = useMemo(() => stageChampionId(koRounds), [koRounds]);

  // The next round to create: winners of the furthest completed round, if that
  // round is done and its next stage doesn't exist yet.
  const lastRound = koRounds[koRounds.length - 1];
  const pendingNext = useMemo(() => (lastRound ? nextRoundPairs(lastRound) : null), [lastRound]);

  async function createNextRound() {
    if (!pendingNext || !tournamentId) return;
    setError(null); setBusy(true);
    try {
      // Kick the next round off after the last match of the current one.
      const base = Math.max(...lastRound.matches.map((m) => new Date(m.startsAt ?? Date.now()).getTime()));
      const format = tournament?.formats?.[activeSport] ?? {};
      for (let i = 0; i < pendingNext.length; i++) {
        const p = pendingNext[i];
        await createMatch({
          tournamentId, sport: activeSport, stage: p.stage,
          homeTeamId: p.homeId, awayTeamId: p.awayId,
          startsAt: new Date(base + (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
          hostIds: myId ? [myId] : [], format,
        });
      }
      setNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the next round');
    } finally { setBusy(false); }
  }

  // ── Computed (preview) bracket fallback: seed the non-group teams into a draw.
  const previewTeams = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    for (const m of sportMatches) {
      if (m.stage === 'group') continue; // group games aren't part of the bracket
      map.set(m.homeTeam.id, { name: m.homeTeam.name, color: m.homeTeam.colorHex });
      map.set(m.awayTeam.id, { name: m.awayTeam.name, color: m.awayTeam.colorHex });
    }
    return [...map.values()];
  }, [sportMatches]);
  const decide = useMemo<DecideFn>(() => {
    return (a, b) => {
      const m = sportMatches.find(
        (x) => x.status === 'completed' && x.winner && x.winner !== 'draw' &&
          ((x.homeTeam.name === a && x.awayTeam.name === b) || (x.homeTeam.name === b && x.awayTeam.name === a)),
      );
      return m ? (m.winner === 'home' ? m.homeTeam.name : m.awayTeam.name) : undefined;
    };
  }, [sportMatches]);
  const previewRounds = useMemo(() => (isStaged ? [] : knockoutBracket(previewTeams, decide)), [isStaged, previewTeams, decide]);
  const previewChampion = useMemo(() => (isStaged ? undefined : bracketChampion(previewRounds, decide)), [isStaged, previewRounds, decide]);
  const previewWinner = (m: BracketMatch): string | undefined => {
    const { home, away } = m;
    if (home.bye || away.bye || home.tbd || away.tbd) return undefined;
    return decide(home.name, away.name);
  };
  const slotState = (winner: string | undefined, name: string): SlotState => (!winner ? 'neutral' : winner === name ? 'won' : 'lost');

  const champName = stagedChampionId ? nameColor.get(stagedChampionId)?.name : previewChampion?.name;
  const champColor = stagedChampionId ? nameColor.get(stagedChampionId)?.color : previewChampion?.color;
  const subtitle = isStaged ? `${koRounds.reduce((n, r) => n + r.matches.length, 0)} knockout matches` : `${previewTeams.length} teams`;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Knockout bracket" subtitle={subtitle} />

        {sports.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {sports.map((s) => (
              <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={activeSport === s} onPress={() => setSport(s)} />
            ))}
          </ScrollView>
        )}

        {champName && (
          <View style={st.champ}>
            {champColor ? <View style={[st.dot, { backgroundColor: champColor }]} /> : null}
            <Text style={st.champText}>🏆 Champion: {champName}</Text>
          </View>
        )}

        {isStaged ? (
          <>
            {koRounds.map((round) => {
              const roundByes = [...new Set(round.matches.flatMap((m) => m.byes ?? []))];
              return (
                <View key={round.stage} style={{ gap: theme.spacing(2) }}>
                  <Text style={textStyles.h3}>{round.label}</Text>
                  {round.matches.map((m) => <StagedMatchCard key={m.id} m={m} />)}
                  {roundByes.length > 0 && (
                    <Text style={textStyles.muted}>
                      ⏭️ Byes to the next round: {roundByes.map((id) => nameColor.get(id)?.name ?? id).join(', ')}
                    </Text>
                  )}
                </View>
              );
            })}
            {canManage && pendingNext && pendingNext.length > 0 && (
              <Button
                label={busy ? 'Creating…' : `▶ Create ${KO_STAGE_LABEL[pendingNext[0].stage]} (${pendingNext.length} tie${pendingNext.length === 1 ? '' : 's'})`}
                onPress={createNextRound}
                disabled={busy}
              />
            )}
            {canManage && lastRound && lastRound.matches.length > 1 && !pendingNext && (
              <Text style={textStyles.muted}>Finish every {lastRound.label} tie to unlock the next round.</Text>
            )}
            <FormError message={error} />
          </>
        ) : previewRounds.length === 0 ? (
          <Text style={textStyles.muted}>No knockout matches yet. Schedule them, or auto-generate a knockout / advance a group stage.</Text>
        ) : (
          <>
            <Text style={textStyles.muted}>Preview draw from the participating teams — schedule the ties (or advance a group stage) to make it real.</Text>
            {previewRounds.map((round, ri) => (
              <View key={ri} style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>{round.name}</Text>
                {round.matches.map((m, mi) => {
                  const winner = previewWinner(m);
                  return (
                    <View key={mi} style={st.matchCard}>
                      <Slot slot={m.home} state={slotState(winner, m.home.name)} />
                      <View style={st.vsRow}><Text style={st.vs}>vs</Text></View>
                      <Slot slot={m.away} state={slotState(winner, m.away.name)} />
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A real, scheduled knockout tie: both sides with scores + result. */
function StagedMatchCard({ m }: { m: Match }) {
  const winnerId = matchWinnerId(m);
  const state = (id: string): SlotState => (!winnerId ? 'neutral' : winnerId === id ? 'won' : 'lost');
  const live = m.status === 'live';
  return (
    <View style={[st.matchCard, live && st.matchCardLive]}>
      <StagedSide name={m.homeTeam.name} color={m.homeTeam.colorHex} score={m.score?.home} state={state(m.homeTeam.id)} />
      <View style={st.vsRow}><Text style={st.vs}>{live ? '● LIVE' : winnerId ? '' : 'vs'}</Text></View>
      <StagedSide name={m.awayTeam.name} color={m.awayTeam.colorHex} score={m.score?.away} state={state(m.awayTeam.id)} />
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  matchCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2),
  },
  matchCardLive: { borderColor: theme.colors.danger + '99' },
  slot: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotGap: { width: 12, height: 12 },
  slotName: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  winnerName: { color: theme.colors.text, fontWeight: '800' },
  score: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', minWidth: 18, textAlign: 'right' },
  check: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800' },
  muted: { color: theme.colors.textMuted, fontWeight: '400' },
  vsRow: { alignItems: 'center' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  champ: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: PODIUM[0] + '1F', borderRadius: theme.radius.md, padding: theme.spacing(3),
    borderWidth: 1, borderColor: PODIUM[0] + '66',
  },
  champText: { color: PODIUM[0], fontSize: theme.font.body, fontWeight: '800' },
});
