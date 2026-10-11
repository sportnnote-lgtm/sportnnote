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
import { SelectChip, Button, ScreenTitle, FormError, TextField, textStyles } from '../components/ui';
import { askConfirm } from '../components/ConfirmSheet';
import { defaultsFor } from '../components/FormatEditor';
import { PODIUM } from '../components/Rank';
import { getSport } from '../sports/registry';
import { matchLine } from '../sports/matchLine';
import { bracketCellText, compactResult } from '../sports/scoreline';
import { useAuth } from '../core/auth';
import { useTournament, useTournamentById, useLeagueData, useOrganizations, useTeams, useDivisions } from '../data/hooks';
import { matchesInDivision } from '../data/groups';
import { DivisionTabs } from '../components/DivisionTabs';
import { getMyPlayerId, createMatch, createTeamTie, setMatchFormat, logActivity } from '../data/repos';
import { matchFormatFor } from '../data/matchFormat';
import { tournamentTieSpec } from '../data/teamTie';
import { canManageTournament } from '../core/org';
import {
  knockoutBracket, bracketChampion, type BracketSlot, type BracketMatch, type DecideFn,
  knockoutStageRounds, nextRoundPairs, matchWinnerId, stageChampionId, KO_STAGE_LABEL,
  thirdPlacePair, THIRD_PLACE_STAGE, pairingWinnerId, type KnockoutPairing, isEliminationStage,
  pairingNeedsOrganiser, advanceTargetMatch, pairingAdvanceOverride,
  isDoubleChanceStage, doubleChanceNext, doubleChanceChampion, DC_STAGE_LABEL, DOUBLE_CHANCE_STAGES, type DoubleChanceStage,
  stageLabel, KO_SLOT_KEY,
} from '../data/bracket';
import { doubleElimState, plateState, plateEntrants, plateOpeners, type DrawRound, type DrawNode, type DrawSide } from '../data/elimDraws';
import { structureFromFormat } from '../data/structureConfig';
import { resolveSeries, advancePatch, type SeriesFormat } from '../data/series';
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
  // Scope the bracket to the selected division (age × gender), if any.
  const { categories: divisions, entries, activeCat, setActiveCat } = useDivisions(tournamentId, nonce);
  const divMatches = useMemo(() => matchesInDivision(matches, entries, activeCat), [matches, entries, activeCat]);
  const sportMatches = useMemo(() => divMatches.filter((m) => m.sport === activeSport), [divMatches, activeSport]);

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

  // 3rd-place playoff — the two semi-final losers. Offered once both semis are
  // decided and it hasn't been created yet.
  const thirdMatch = useMemo(() => sportMatches.find((m) => m.stage === THIRD_PLACE_STAGE), [sportMatches]);
  const sfRound = useMemo(() => koRounds.find((r) => r.stage === 'sf'), [koRounds]);
  const pendingThird = useMemo(() => (sfRound && !thirdMatch ? thirdPlacePair(sfRound) : null), [sfRound, thirdMatch]);

  // Double-chance playoff (IPL-style) — detected by a Qualifier/Eliminator match.
  // Takes over the bracket view; its Final also carries stage 'final'.
  const dcActive = useMemo(() => sportMatches.some((m) => isDoubleChanceStage(m.stage)), [sportMatches]);
  const dcMatches = useMemo(
    () => DOUBLE_CHANCE_STAGES.map((s) => ({ stage: s as DoubleChanceStage, m: sportMatches.find((x) => x.stage === s) })),
    [sportMatches],
  );
  const dcNext = useMemo(() => (dcActive ? doubleChanceNext(sportMatches) : null), [dcActive, sportMatches]);
  const dcChampId = useMemo(() => (dcActive ? doubleChanceChampion(sportMatches) : undefined), [dcActive, sportMatches]);
  const createNextDc = () => {
    if (!dcNext) return;
    const base = Math.max(Date.now(), ...sportMatches.map((m) => new Date(m.startsAt ?? Date.now()).getTime()));
    return createRound(dcNext, base);
  };

  /** `slot` (SD-124) and `extra` (SD-125 draw keys) ride on each new match's format. */
  async function createRound(pairs: { homeId: string; awayId: string; stage: string; slot?: number; extra?: Record<string, string | number | boolean> }[], baseTimeMs: number) {
    if (!tournamentId) return;
    setError(null); setBusy(true);
    try {
      const rawFormat = tournament?.formats?.[activeSport] ?? {};
      // SD-48: a sport run as team ties gets its next round as ties too.
      const tieSpec = tournamentTieSpec(rawFormat as Record<string, unknown>);
      const sportDefaults = defaultsFor(getSport(activeSport).formatFields ?? [], 'tournament');
      for (let i = 0; i < pairs.length; i++) {
        // SD-120: a knockout round always resolves — the sport's decider is set.
        const baseFormat = tieSpec ? rawFormat : matchFormatFor(tournament, activeSport, isEliminationStage(pairs[i].stage), sportDefaults);
        const drawKeys = { ...(pairs[i].extra ?? {}), ...(pairs[i].slot !== undefined ? { [KO_SLOT_KEY]: pairs[i].slot } : {}) };
        const format = Object.keys(drawKeys).length ? { ...(baseFormat ?? {}), ...drawKeys } : baseFormat;
        if (tieSpec) {
          await createTeamTie({
            tournamentId, sport: activeSport, stage: pairs[i].stage, spec: tieSpec,
            teamAId: pairs[i].homeId, teamBId: pairs[i].awayId,
            startsAt: new Date(baseTimeMs + (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
            hostIds: myId ? [myId] : [], matchFormat: format,
          });
          continue;
        }
        await createMatch({
          tournamentId, sport: activeSport, stage: pairs[i].stage,
          homeTeamId: pairs[i].homeId, awayTeamId: pairs[i].awayId,
          startsAt: new Date(baseTimeMs + (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
          hostIds: myId ? [myId] : [], format,
        });
      }
      setNonce((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the matches');
    } finally { setBusy(false); }
  }

  // SD-120 — the organiser's "Advances: X" pick for a tie scoring can't settle.
  const recordAdvance = async (p: KnockoutPairing, teamId: string, reason: string): Promise<boolean> => {
    const target = advanceTargetMatch(p);
    if (!target || !tournamentId) return false;
    const winner = nameColor.get(teamId)?.name ?? 'This side';
    const loserId = teamId === p.homeId ? p.awayId : p.homeId;
    const loser = nameColor.get(loserId)?.name ?? 'the other side';
    const ok = await askConfirm({
      title: `${winner} advance?`,
      message: `${winner} go through and ${loser} are out. Your reason is saved on the match and in the tournament's activity log.`,
      yesLabel: `Yes, ${winner} advance`, noLabel: 'No, go back', tone: 'danger',
    });
    if (!ok) return false;
    setError(null); setBusy(true);
    try {
      await setMatchFormat(target.id, advancePatch(teamId, reason, profile?.fullName ?? undefined));
      await logActivity({
        scope: 'tournament', refId: tournamentId, action: 'knockout_advance',
        detail: `${winner} advance past ${loser} (${stageLabel(p.stage)}) — organiser decision: ${reason.trim()}`,
        byPlayerId: myId ?? undefined, byName: profile?.fullName ?? undefined,
      });
      setNonce((n) => n + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the decision');
      return false;
    } finally { setBusy(false); }
  };
  const nameOf = (id: string) => nameColor.get(id)?.name ?? id;
  const asPairing = (m: Match): KnockoutPairing => ({ key: m.id, stage: (m.stage ?? 'final') as KnockoutPairing['stage'], homeId: m.homeTeam.id, awayId: m.awayTeam.id, match: m });
  const pickerFor = (p: KnockoutPairing) => (
    <AdvanceNote p={p} canManage={canManage} busy={busy} nameOf={nameOf} onPick={(teamId, reason) => recordAdvance(p, teamId, reason)} />
  );

  const createNextRound = () => {
    if (!pendingNext || !lastRound) return;
    const base = Math.max(...lastRound.matches.map((m) => new Date(m.startsAt ?? Date.now()).getTime()));
    // SD-124: index i is the new round's bracket slot.
    return createRound(pendingNext.map((p, i) => ({ ...p, slot: i })), base);
  };

  // ── SD-125: double elimination (takes over the view) and the plate draw.
  const de = useMemo(() => doubleElimState(sportMatches), [sportMatches]);
  const plateSt = useMemo(() => plateState(sportMatches), [sportMatches]);
  const savedStruct = structureFromFormat(tournament?.formats?.[activeSport] as Record<string, unknown> | undefined);
  const plateFrom = useMemo(() => (!de && !plateSt && koRounds.length ? plateEntrants(koRounds[0]) : null), [de, plateSt, koRounds]);
  const latestStart = () => Math.max(Date.now(), ...sportMatches.map((m) => new Date(m.startsAt ?? Date.now()).getTime()));
  const createReady = (ready: { stage: string; slot: number; homeId: string; awayId: string }[]) => createRound(ready, latestStart());
  const createPlate = async () => {
    if (!plateFrom || plateFrom.length < 2) return;
    const ok = await askConfirm({
      title: 'Start the plate?',
      message: `The ${plateFrom.length} first-round losers play their own knockout. It gives no medals; the winner is named the plate winner.`,
      yesLabel: 'Yes, create the plate', noLabel: 'Not now', tone: 'caution',
    });
    if (ok) await createRound(plateOpeners(plateFrom), latestStart());
  };
  const sideName = (s: DrawSide) => (s.kind === 'team' ? nameOf(s.id) : s.kind === 'bye' ? 'Bye' : 'TBD');
  const sideColor = (s: DrawSide) => (s.kind === 'team' ? nameColor.get(s.id)?.color : undefined);
  const drawPickers = (rounds: DrawRound[]) => rounds.flatMap((r) => r.nodes
    .filter((n) => n.pairing && (pairingNeedsOrganiser(n.pairing) || pairingAdvanceOverride(n.pairing)))
    .map((n) => (
      <View key={`${n.stage}#${n.slot}`} style={{ gap: theme.spacing(1) }}>
        <Text style={st.pickHead}>{r.label}: {sideName(n.home)} v {sideName(n.away)}</Text>
        {pickerFor(n.pairing!)}
      </View>
    )));
  const createThirdPlace = () => {
    if (!pendingThird || !sfRound) return;
    const base = Math.max(...sfRound.matches.map((m) => new Date(m.startsAt ?? Date.now()).getTime()));
    return createRound([{ ...pendingThird, stage: THIRD_PLACE_STAGE }], base);
  };

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

  const champId = de ? de.championId : dcActive ? dcChampId : stagedChampionId;
  const champName = champId ? nameColor.get(champId)?.name : previewChampion?.name;
  const champColor = champId ? nameColor.get(champId)?.color : previewChampion?.color;
  const subtitle = de ? `Double elimination · ${de.seeds.length} entrants` : dcActive ? 'Double-chance playoff' : isStaged ? `${koRounds.reduce((n, r) => n + r.matches.length, 0)} knockout matches` : `${previewTeams.length} teams`;

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

        <DivisionTabs categories={divisions} activeCat={activeCat} onChange={setActiveCat} />

        {champName && (
          <View style={st.champ}>
            {champColor ? <View style={[st.dot, { backgroundColor: champColor }]} /> : null}
            <Text style={st.champText}>🏆 Champion: {champName}</Text>
          </View>
        )}

        {de ? (
          <>
            <Text style={textStyles.muted}>Lose twice and you're out. A first loss drops a team into the losers' bracket. Swipe sideways to see every round.</Text>
            <Text style={textStyles.h3}>Winners' bracket</Text>
            <DrawColumns rounds={de.winners} sideName={sideName} sideColor={sideColor} />
            {de.losers.length > 0 && <Text style={textStyles.h3}>Losers' bracket</Text>}
            {de.losers.length > 0 && <DrawColumns rounds={de.losers} sideName={sideName} sideColor={sideColor} />}
            <Text style={textStyles.h3}>Grand final</Text>
            <DrawColumns
              rounds={[{ stage: 'gf', label: 'Grand final', nodes: [de.final] }, ...(de.reset2 ? [{ stage: 'gf2', label: 'Grand final (reset)', nodes: [de.reset2] }] : [])]}
              sideName={sideName} sideColor={sideColor}
            />
            {de.reset && !de.reset2 && <Text style={textStyles.muted}>If the losers'-bracket team wins the grand final, a reset match decides it.</Text>}
            {drawPickers([...de.winners, ...de.losers, { stage: 'gf', label: 'Grand final', nodes: [de.final, ...(de.reset2 ? [de.reset2] : [])] }])}
            {canManage && de.ready.length > 0 && (
              <Button
                label={busy ? 'Creating…' : `▶ Create ${de.ready.length} match${de.ready.length === 1 ? '' : 'es'} ready to play`}
                onPress={() => createReady(de.ready)}
                disabled={busy}
              />
            )}
            <FormError message={error} />
          </>
        ) : dcActive ? (
          <>
            <Text style={textStyles.muted}>The top two get a second life: lose Qualifier 1 and you drop to Qualifier 2, not out.</Text>
            {dcMatches.map(({ stage, m }) => (
              <View key={stage} style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>{DC_STAGE_LABEL[stage]}</Text>
                {m ? <StagedMatchCard m={m} /> : <Text style={textStyles.muted}>Awaiting the earlier results…</Text>}
                {m ? pickerFor(asPairing(m)) : null}
              </View>
            ))}
            {canManage && dcNext && (
              <Button
                label={busy ? 'Creating…' : `▶ Create ${DC_STAGE_LABEL[dcNext[0].stage]}`}
                onPress={createNextDc}
                disabled={busy}
              />
            )}
            <FormError message={error} />
          </>
        ) : isStaged ? (
          <>
            {koRounds.map((round) => {
              const roundByes = [...new Set(round.matches.flatMap((m) => m.byes ?? []))];
              return (
                <View key={round.stage} style={{ gap: theme.spacing(2) }}>
                  <Text style={textStyles.h3}>{round.label}</Text>
                  {round.pairings.map((p) => (
                    <View key={p.key} style={{ gap: theme.spacing(2) }}>
                      <PairingCard p={p} />
                      {pickerFor(p)}
                    </View>
                  ))}
                  {roundByes.length > 0 && (
                    <Text style={textStyles.muted}>
                      ⏭️ Byes to the next round: {roundByes.map((id) => nameColor.get(id)?.name ?? id).join(', ')}
                    </Text>
                  )}
                </View>
              );
            })}
            {thirdMatch && (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>🥉 Third-place playoff</Text>
                <StagedMatchCard m={thirdMatch} />
                {pickerFor(asPairing(thirdMatch))}
              </View>
            )}
            {canManage && pendingNext && pendingNext.length > 0 && (
              <Button
                label={busy ? 'Creating…' : `▶ Create ${KO_STAGE_LABEL[pendingNext[0].stage]} (${pendingNext.length} tie${pendingNext.length === 1 ? '' : 's'})`}
                onPress={createNextRound}
                disabled={busy}
              />
            )}
            {canManage && pendingThird && (
              <Button
                label={busy ? 'Creating…' : '🥉 Create 3rd-place playoff'}
                variant="ghost"
                onPress={createThirdPlace}
                disabled={busy}
              />
            )}
            {canManage && lastRound && lastRound.pairings.length > 1 && !pendingNext && (
              <Text style={textStyles.muted}>Finish every {lastRound.label} tie to unlock the next round.</Text>
            )}
            {/* SD-125 — the plate: a consolation knockout for first-round losers (no medals). */}
            {plateSt && (
              <View style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>🍽️ Plate (first-round losers)</Text>
                {plateSt.winnerId && <Text style={st.plateWinner}>🍽️ Plate winner: {nameOf(plateSt.winnerId)}</Text>}
                <DrawColumns rounds={plateSt.rounds} sideName={sideName} sideColor={sideColor} />
                {drawPickers(plateSt.rounds)}
                {canManage && plateSt.ready.length > 0 && (
                  <Button
                    label={busy ? 'Creating…' : `▶ Create ${plateSt.ready.length} plate match${plateSt.ready.length === 1 ? '' : 'es'}`}
                    variant="ghost"
                    onPress={() => createReady(plateSt.ready)}
                    disabled={busy}
                  />
                )}
              </View>
            )}
            {canManage && savedStruct?.plate && plateFrom && plateFrom.length >= 2 && (
              <Button
                label={busy ? 'Creating…' : `🍽️ Create the plate (${plateFrom.length} first-round losers)`}
                variant="ghost"
                onPress={createPlate}
                disabled={busy}
              />
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

/** SD-120 — under a knockout pairing: the organiser's recorded decision, or
 *  (hosts only) the "Advances: X / Y" pick when every match is finished and
 *  scoring left no winner, so the bracket never stalls. */
function AdvanceNote({ p, canManage, busy, nameOf, onPick }: {
  p: KnockoutPairing; canManage: boolean; busy: boolean; nameOf: (id: string) => string;
  onPick: (teamId: string, reason: string) => Promise<boolean>;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const done = pairingAdvanceOverride(p);
  if (done) {
    return (
      <Text style={st.decision}>
        🧑‍⚖️ Organiser decision: {nameOf(done.teamId)} advance{done.reason ? ` — ${done.reason}` : ''}{done.by ? ` (${done.by})` : ''}
      </Text>
    );
  }
  if (!pairingNeedsOrganiser(p)) return null;
  if (!canManage) return <Text style={st.decision}>⏳ No winner from the scoring yet — the organiser will decide who advances.</Text>;
  return (
    <View style={st.pickBox}>
      <Text style={st.pickHead}>⚖️ No winner from the scoring</Text>
      <Text style={textStyles.muted}>Every match here is finished but nobody won it (drawn with no decider, abandoned or called off). Pick who goes through.</Text>
      <View style={st.pickRow}>
        {[p.homeId, p.awayId].map((id) => (
          <SelectChip key={id} label={`Advances: ${nameOf(id)}`} active={pick === id} onPress={() => setPick(id)} />
        ))}
      </View>
      <TextField label="Reason (shown with the result)" value={reason} onChange={setReason} placeholder="e.g. Won the toss after the floodlights failed" />
      <Button
        label={busy ? 'Saving…' : pick ? `Confirm: ${nameOf(pick)} advance` : 'Pick who advances'}
        variant="danger"
        disabled={busy || !pick || reason.trim().length < 3}
        onPress={() => { if (pick) void onPick(pick, reason).then((ok) => { if (ok) { setPick(null); setReason(''); } }); }}
      />
    </View>
  );
}

/** SD-125 — a draw as side-by-side round columns. Only this area scrolls
 *  sideways (the page stays put at 375 px). */
function DrawColumns({ rounds, sideName, sideColor }: {
  rounds: DrawRound[]; sideName: (s: DrawSide) => string; sideColor: (s: DrawSide) => string | undefined;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled contentContainerStyle={st.cols}>
      {rounds.map((r) => (
        <View key={r.stage} style={st.col}>
          <Text style={st.colHead} numberOfLines={1}>{r.label}</Text>
          <View style={st.colBody}>
            {r.nodes.map((n) => <DrawNodeCard key={n.slot} n={n} sideName={sideName} sideColor={sideColor} />)}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function DrawNodeCard({ n, sideName, sideColor }: { n: DrawNode; sideName: (s: DrawSide) => string; sideColor: (s: DrawSide) => string | undefined }) {
  if (n.pairing) return <PairingCard p={n.pairing} />;
  if (n.home.kind === 'bye' && n.away.kind === 'bye') return <View style={[st.matchCard, st.nodeEmpty]}><Text style={st.vs}>—</Text></View>;
  const bye = n.home.kind === 'bye' || n.away.kind === 'bye';
  return (
    <View style={[st.matchCard, bye && st.nodeEmpty]}>
      <Slot slot={{ name: sideName(n.home), color: sideColor(n.home), bye: n.home.kind === 'bye', tbd: n.home.kind === 'tbd' }} />
      <View style={st.vsRow}><Text style={st.vs}>{bye ? 'bye' : 'vs'}</Text></View>
      <Slot slot={{ name: sideName(n.away), color: sideColor(n.away), bye: n.away.kind === 'bye', tbd: n.away.kind === 'tbd' }} />
    </View>
  );
}

const SERIES_LABEL: Record<SeriesFormat, (n: number) => string> = {
  best_of: (n) => `Best of ${n}`,
  aggregate: () => 'Two legs · aggregate',
  rubbers: (n) => `${n} rubbers`,
};

/** A knockout pairing: a single match, or a multi-leg series/tie shown as one
 *  card (series score + result, with each leg listed beneath). */
function PairingCard({ p }: { p: KnockoutPairing }) {
  if (!p.series) return p.match ? <StagedMatchCard m={p.match} /> : null;
  const s = p.series;
  const st2 = resolveSeries(s);
  const winnerId = st2.winnerId;
  const state = (id?: string): SlotState => (!winnerId ? 'neutral' : winnerId === id ? 'won' : 'lost');
  const isAgg = s.format === 'aggregate';
  const scoreA = isAgg ? st2.aggA : st2.winsA;
  const scoreB = isAgg ? st2.aggB : st2.winsB;
  const anyLive = s.legs.some((m) => m.status === 'live');
  return (
    <View style={[st.matchCard, anyLive && st.matchCardLive]}>
      <View style={st.seriesHead}>
        <Text style={st.seriesTag}>{s.name || SERIES_LABEL[s.format](s.legsPlanned)}</Text>
        <Text style={st.seriesStatus}>{st2.decided ? 'DECIDED' : anyLive ? '● LIVE' : `${st2.played}/${s.legsPlanned}`}</Text>
      </View>
      <StagedSide name={s.teamA?.name ?? '—'} color={s.teamA?.colorHex} score={scoreA} state={state(s.teamA?.id)} />
      <View style={st.vsRow}><Text style={st.vs}>{isAgg ? 'agg' : 'wins'}</Text></View>
      <StagedSide name={s.teamB?.name ?? '—'} color={s.teamB?.colorHex} score={scoreB} state={state(s.teamB?.id)} />
      <Text style={st.seriesSummary}>{st2.summary}</Text>
      <View style={st.legList}>
        {s.legs.map((m, i) => {
          const w = matchWinnerId(m);
          // SD-20: set/game legs carry their line ("2–1 (6-4, 3-6, [10-7])").
          const res = m.score || m.walkover ? compactResult(m.walkover ? null : m.score, matchLine(m)) || '—' : m.status === 'live' ? 'live' : '—';
          return (
            <Text key={m.id} style={st.legRow} numberOfLines={1}>
              <Text style={st.legNo}>L{i + 1}  </Text>
              {m.homeTeam.shortName} <Text style={st.legScore}>{res}</Text> {m.awayTeam.shortName}
              {w ? `  · ${w === m.homeTeam.id ? m.homeTeam.shortName : m.awayTeam.shortName} won` : ''}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

/** A real, scheduled knockout tie: both sides with scores + result. */
function StagedMatchCard({ m }: { m: Match }) {
  const winnerId = matchWinnerId(m);
  const state = (id: string): SlotState => (!winnerId ? 'neutral' : winnerId === id ? 'won' : 'lost');
  const live = m.status === 'live';
  const line = matchLine(m);
  return (
    <View style={[st.matchCard, live && st.matchCardLive]}>
      <StagedSide name={m.homeTeam.name} color={m.homeTeam.colorHex} score={m.score?.home} state={state(m.homeTeam.id)} />
      {/* SD-20: the decided scoreline between the sides ("6-4, 3-2 ret.", "w/o"). */}
      <View style={st.vsRow}><Text style={[st.vs, !live && !!line && st.cellLine]} numberOfLines={1}>{bracketCellText({ live, decided: !!winnerId, line })}</Text></View>
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
  seriesHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seriesTag: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  seriesStatus: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  seriesSummary: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(1) },
  legList: { gap: 2, marginTop: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing(2) },
  legRow: { color: theme.colors.text, fontSize: theme.font.small },
  legNo: { color: theme.colors.textMuted, fontWeight: '800' },
  legScore: { fontWeight: '800' },
  cellLine: { color: theme.colors.text, fontSize: theme.font.small, textTransform: 'none', letterSpacing: 0, fontVariant: ['tabular-nums'] },
  champ: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: PODIUM[0] + '1F', borderRadius: theme.radius.md, padding: theme.spacing(3),
    borderWidth: 1, borderColor: PODIUM[0] + '66',
  },
  champText: { color: PODIUM[0], fontSize: theme.font.body, fontWeight: '800' },
  decision: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '600' },
  pickBox: {
    gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.accent + '99', backgroundColor: theme.colors.surface,
  },
  pickHead: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  cols: { gap: theme.spacing(3), paddingBottom: theme.spacing(2) },
  col: { width: 210, gap: theme.spacing(2) },
  colHead: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  colBody: { flex: 1, justifyContent: 'space-around', gap: theme.spacing(2) },
  nodeEmpty: { opacity: 0.6 },
  plateWinner: { color: theme.colors.accent, fontSize: theme.font.body, fontWeight: '800' },
});
