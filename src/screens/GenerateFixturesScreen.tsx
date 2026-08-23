/** Bulk fixture generation — the OPTIONAL companion to the manual "Schedule a
 *  match" flow. The organizer picks teams + a structure, we generate the pairings
 *  (round-robin or knockout round 1), they review/adjust times, then we create
 *  every match at once. Manual scheduling is untouched; this is an extra path. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Button, TextField, SelectChip, ScreenTitle, FormError, textStyles } from '../components/ui';
import { DateTimeField } from '../components/DateTimeField';
import { getSport } from '../sports/registry';
import { useTeams, useTournamentById, useLeagueData, useTournamentTeams, useDivisions } from '../data/hooks';
import { DivisionTabs } from '../components/DivisionTabs';
import { createMatch, getMyPlayerId } from '../data/repos';
import { roundRobin, knockoutFirstRound, groupStage, drawGroups, type GeneratedPairing } from '../data/fixtures';
import { groupTables, advancement, seedKnockout, knockoutRoundLabel, qualifiersFromSelection, superPhaseLabel, matchesInDivision, type GroupTable } from '../data/groups';
import { teamStandings } from '../data/standings';
import { stageForTeams, planKnockout, seedPlayIn, KO_STAGE_LABEL } from '../data/bracket';
import { useAuth } from '../core/auth';
import type { SportId } from '../core/types';
import type { FormatField } from '../sports/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Structure = 'league' | 'knockout' | 'groups' | 'advance';

const defaultsFor = (fields: FormatField[]) => Object.fromEntries(fields.map((f) => [f.key, f.default]));

interface Draft extends GeneratedPairing { when: Date; group?: string; stage?: string; byes?: string[] }

// Human labels for the knockout stages seedKnockout/knockoutRoundLabel emit.
const STAGE_LABEL: Record<string, string> = { final: 'Final', sf: 'Semi-final', qf: 'Quarter-final', r16: 'Round of 16', r32: 'Round of 32' };

export default function GenerateFixturesScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'GenerateFixtures'>>();
  const { profile } = useAuth();
  const tournament = useTournamentById(params.tournamentId);
  const tourSports = tournament?.sports ?? [];

  const [sport, setSport] = useState<SportId>(params.sport ?? tourSports[0] ?? 'football');
  const teams = useTeams(sport);
  const participants = useTournamentTeams(params.tournamentId, sport);
  const { matches: tourMatches } = useLeagueData(params.tournamentId);
  // Divisions: generate fixtures within one division (its rostered teams only).
  const { categories: divisions, entries, activeCat, setActiveCat } = useDivisions(params.tournamentId);
  const divTeamIds = useMemo(
    () => (activeCat ? new Set(entries.filter((e) => e.categoryId === activeCat).map((e) => e.team.id)) : null),
    [entries, activeCat],
  );
  const pickTeams = useMemo(() => (divTeamIds ? teams.filter((t) => divTeamIds.has(t.id)) : teams), [teams, divTeamIds]);
  // Name lookup for draft cards: the pickable team list, plus the team ids
  // embedded in this tournament's matches (advance-mode brackets seed from
  // those, whose ids can differ from the team-list ids).
  const teamName = useMemo(() => {
    const m: Record<string, string> = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    for (const mt of tourMatches) { m[mt.homeTeam.id] ??= mt.homeTeam.name; m[mt.awayTeam.id] ??= mt.awayTeam.name; }
    return m;
  }, [teams, tourMatches]);

  const [selected, setSelected] = useState<string[]>([]);
  // Once the organizer edits the selection we stop auto-seeding it from the
  // registered participants (so a background refetch can't clobber their edits).
  const [touchedSel, setTouchedSel] = useState(false);
  const [structure, setStructure] = useState<Structure>(tournament?.structure === 'knockout' ? 'knockout' : 'league');
  const [doubleRound, setDoubleRound] = useState(false);
  const [numGroups, setNumGroups] = useState('4');
  const [topK, setTopK] = useState('2');
  const [bestPlaced, setBestPlaced] = useState('0');
  // Custom-control: override who advances (advance-to-knockout mode).
  const [manualAdvance, setManualAdvance] = useState(false);
  const [manualSel, setManualSel] = useState<string[]>([]);
  // Custom-control: add a play-in round to size an odd field to a clean bracket.
  const [playIn, setPlayIn] = useState(false);
  // Advance target when coming from the group stage: a knockout, or a Super
  // round-robin phase (Asia-Cup style). From a Super phase it's always knockout.
  const [advanceTo, setAdvanceTo] = useState<'knockout' | 'super'>('knockout');
  const [start, setStart] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; });
  const [gapMin, setGapMin] = useState('90');
  const [venue, setVenue] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep the sport valid once the tournament resolves (single-sport meets skip the picker).
  useEffect(() => {
    if (tourSports.length && !tourSports.includes(sport)) {
      setSport(params.sport && tourSports.includes(params.sport) ? params.sport : tourSports[0]);
      setSelected([]); setTouchedSel(false); setDrafts(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  // Default the team picker to the registered participants of the active division
  // — the organizer sets "who's in" once, then generates without re-picking.
  const divParticipants = useMemo(
    () => (divTeamIds ? participants.filter((t) => divTeamIds.has(t.id)) : participants),
    [participants, divTeamIds],
  );
  useEffect(() => {
    if (!touchedSel && divParticipants.length) setSelected(divParticipants.map((t) => t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divParticipants, touchedSel]);

  const invalidate = () => setDrafts(null);
  const pickSport = (s: SportId) => { setSport(s); setSelected([]); setTouchedSel(false); setManualAdvance(false); setManualSel([]); setPlayIn(false); setAdvanceTo('knockout'); invalidate(); };
  const pickCategory = (id: string) => { setActiveCat(id); setSelected([]); setTouchedSel(false); setManualAdvance(false); setManualSel([]); invalidate(); };
  const toggleTeam = (id: string) => { invalidate(); setTouchedSel(true); setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); };
  const allSelected = pickTeams.length > 0 && selected.length === pickTeams.length;

  const groupCount = Math.max(2, Math.min(parseInt(numGroups, 10) || 2, Math.floor(selected.length / 2) || 2));
  // Preview the group split (sizes) once enough teams are picked.
  const groupSizes = useMemo(
    () => (structure === 'groups' && selected.length >= 2 ? drawGroups(selected, groupCount).map((g) => g.teamIds.length) : []),
    [structure, selected, groupCount],
  );

  // ── Advance: derive qualifiers from a finished phase — the group stage, or a
  //    Super round-robin phase (Super Four/Six) if one exists. Offered once the
  //    tournament actually has a phase to advance from.
  // Advance-mode tables are scoped to the active division too (so a division's
  // group stage advances only its own teams).
  const scopedTourMatches = useMemo(() => matchesInDivision(tourMatches, entries, activeCat), [tourMatches, entries, activeCat]);
  const gtables = useMemo(() => groupTables(scopedTourMatches, sport), [scopedTourMatches, sport]);
  const hasGroups = gtables.length > 0;
  const groupMatches = scopedTourMatches.filter((m) => m.stage === 'group' && m.sport === sport);
  // Super phase (a second round-robin among group qualifiers) — a single league table.
  const superMatches = scopedTourMatches.filter((m) => m.stage === 'super' && m.sport === sport);
  const hasSuper = superMatches.length > 0;
  const superTable = useMemo<GroupTable[]>(
    () => (hasSuper ? [{ name: superPhaseLabel(new Set(superMatches.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])).size), rows: teamStandings(superMatches, sport) }] : []),
    [hasSuper, superMatches, sport],
  );
  // Advance from the *latest* phase that exists: the Super phase once it's there,
  // else the group stage.
  const advanceFromSuper = hasSuper;
  const sourceTables = advanceFromSuper ? superTable : gtables;
  const sourceMatches = advanceFromSuper ? superMatches : groupMatches;
  const sourceDone = sourceMatches.length > 0 && sourceMatches.every((m) => m.status === 'completed');
  // What the advance produces: a knockout bracket, or (from the group stage only)
  // a Super round-robin phase. Advancing from a Super phase always goes to knockout.
  const target: 'knockout' | 'super' = advanceFromSuper ? 'knockout' : advanceTo;
  const qualifiers = useMemo(
    () => (sourceTables.length ? advancement(sourceTables, Math.max(1, parseInt(topK, 10) || 1), Math.max(0, parseInt(bestPlaced, 10) || 0)) : []),
    [sourceTables, topK, bestPlaced],
  );
  // Custom control: the organizer overrides who advances (an off-app tie-break,
  // or to fill an awkward field). `manualSel` is the chosen team ids; the
  // effective qualifiers are theirs when customizing, else the rule-based set.
  const effectiveQualifiers = useMemo(
    () => (manualAdvance ? qualifiersFromSelection(sourceTables, manualSel) : qualifiers),
    [manualAdvance, sourceTables, manualSel, qualifiers],
  );
  // Seed the manual picks from the rule-based qualifiers the first time the
  // organizer opens the override (so they start from the natural result).
  const toggleManualAdvance = () => {
    invalidate();
    setManualAdvance((on) => {
      if (!on) setManualSel(qualifiers.map((q) => q.teamId));
      return !on;
    });
  };
  const toggleAdvanceTeam = (id: string) => {
    invalidate();
    setManualSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  // The seed-ordered knockout field, and how it plans out (clean vs play-in). In
  // advance mode the seeds are the qualifiers; in knockout mode, the picked teams.
  const koFieldIds = useMemo(
    () => (structure === 'advance' ? effectiveQualifiers.map((q) => q.teamId) : structure === 'knockout' ? selected : []),
    [structure, effectiveQualifiers, selected],
  );
  const koPlan = useMemo(() => planKnockout(koFieldIds.length), [koFieldIds.length]);
  const byeNames = (ids: string[]) => ids.map((id) => teamName[id] ?? id).join(', ');

  function generate() {
    const gap0 = Math.max(0, parseInt(gapMin, 10) || 0);
    const at = (i: number) => new Date(start.getTime() + i * gap0 * 60000);
    if (structure === 'advance') {
      if (effectiveQualifiers.length < 2) return setError(manualAdvance ? 'Pick at least two teams to advance.' : 'Not enough matches finished yet to advance.');
      setError(null);
      if (target === 'super') {
        // Advance the qualifiers into a second round-robin phase (Super Four/Six).
        const rr = roundRobin(effectiveQualifiers.map((q) => q.teamId), doubleRound);
        setDrafts(rr.map((p, i) => ({ ...p, stage: 'super', when: at(i) })));
        return;
      }
      if (playIn && !koPlan.clean) {
        const pi = seedPlayIn(koFieldIds);
        setDrafts(pi.ties.map((t, i) => ({ round: 1, homeId: t.homeId, awayId: t.awayId, stage: pi.playInStage, byes: pi.byeIds, when: at(i) })));
        return;
      }
      const stage = knockoutRoundLabel(effectiveQualifiers.length);
      setDrafts(seedKnockout(effectiveQualifiers).map((p, i) => ({ ...p, stage, when: at(i) })));
      return;
    }
    if (selected.length < 2) return setError('Pick at least two teams.');
    setError(null);
    if (structure === 'knockout' && playIn && !koPlan.clean) {
      const pi = seedPlayIn(selected);
      setDrafts(pi.ties.map((t, i) => ({ round: 1, homeId: t.homeId, awayId: t.awayId, stage: pi.playInStage, byes: pi.byeIds, when: at(i) })));
      return;
    }
    const pairings: (GeneratedPairing & { group?: string })[] =
      structure === 'knockout' ? knockoutFirstRound(selected)
        : structure === 'groups' ? groupStage(selected, groupCount, doubleRound)
        : roundRobin(selected, doubleRound);
    // Tag a plain knockout's round 1 with its stage (r16/qf/…) so the bracket
    // renders it as a real round and can advance winners to the next one.
    const koStage = structure === 'knockout' ? stageForTeams(selected.length) : undefined;
    setDrafts(pairings.map((p, i) => ({ ...p, stage: koStage, when: at(i) })));
  }

  async function create() {
    if (!drafts?.length) return;
    setError(null); setBusy(true);
    try {
      const myId = await getMyPlayerId(profile?.id);
      let format = tournament?.formats?.[sport] ?? defaultsFor(getSport(sport).formatFields ?? []);
      // Knockout fixtures inherit the tournament's tie-breaker (football only —
      // the decider is football's). League/group/super fixtures keep the default
      // (draws allowed) — only real knockout ties carry a stage that isn't group/super.
      const kf = tournament?.knockoutFormat;
      const koLike = drafts.every((d) => d.stage && d.stage !== 'group' && d.stage !== 'super');
      if (koLike && sport === 'football' && kf) {
        format = {
          ...format,
          decider: kf.decider, // 'extra_time' | 'penalties'
          ...(kf.extraTimeMinutes != null ? { extraTimeMinutes: kf.extraTimeMinutes } : {}),
          ...(kf.extraTimeSubs != null ? { extraTimeSubs: kf.extraTimeSubs } : {}),
        };
      }
      for (const d of drafts) {
        await createMatch({
          tournamentId: params.tournamentId, sport,
          group: d.group, stage: d.stage ?? (d.group ? 'group' : undefined), byes: d.byes,
          homeTeamId: d.homeId, awayTeamId: d.awayId,
          startsAt: d.when.toISOString(),
          venueName: venue.trim() || undefined,
          hostIds: myId ? [myId] : [],
          format,
        });
      }
      nav.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the matches');
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Auto-generate fixtures" subtitle={tournament?.name ?? 'Bulk-schedule matches'} />

        {tourSports.length > 1 && (
          <>
            <Text style={textStyles.muted}>Sport</Text>
            <View style={st.chips}>
              {tourSports.map((s) => (
                <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}`} active={sport === s} onPress={() => pickSport(s)} />
              ))}
            </View>
          </>
        )}

        <DivisionTabs categories={divisions} activeCat={activeCat} onChange={pickCategory} />

        {structure !== 'advance' && (
          <>
            <View style={st.rowBetween}>
              <Text style={textStyles.muted}>Teams · {selected.length} selected</Text>
              {pickTeams.length >= 2 && (
                <Text style={st.link} onPress={() => { invalidate(); setTouchedSel(true); setSelected(allSelected ? [] : pickTeams.map((t) => t.id)); }}>
                  {allSelected ? 'Clear' : 'Select all'}
                </Text>
              )}
            </View>
            {pickTeams.length < 2 ? (
              <Text style={textStyles.muted}>
                {activeCat ? 'Add at least two teams to this division under “Participating teams” first.' : `Add at least two ${getSport(sport).name} teams under “Manage teams” first.`}
              </Text>
            ) : (
              <View style={st.chips}>
                {pickTeams.map((t) => (
                  <SelectChip key={t.id} label={t.name} active={selected.includes(t.id)} onPress={() => toggleTeam(t.id)} />
                ))}
              </View>
            )}
          </>
        )}

        <Text style={textStyles.muted}>Format</Text>
        <View style={st.chips}>
          <SelectChip label="🔁 Round-robin (league)" active={structure === 'league'} onPress={() => { setStructure('league'); invalidate(); }} />
          <SelectChip label="👥 Group stage" active={structure === 'groups'} onPress={() => { setStructure('groups'); invalidate(); }} />
          <SelectChip label="🏆 Knockout (round 1)" active={structure === 'knockout'} onPress={() => { setStructure('knockout'); invalidate(); }} />
          {(hasGroups || hasSuper) && (
            <SelectChip label={advanceFromSuper ? '🏅 Advance Super phase' : '🏅 Advance groups'} active={structure === 'advance'} onPress={() => { setStructure('advance'); invalidate(); }} />
          )}
        </View>
        {(structure === 'league' || structure === 'groups') && (
          <View style={st.chips}>
            <SelectChip label="Single — each pair once" active={!doubleRound} onPress={() => { setDoubleRound(false); invalidate(); }} />
            <SelectChip label="Double — home & away" active={doubleRound} onPress={() => { setDoubleRound(true); invalidate(); }} />
          </View>
        )}
        {structure === 'groups' && (
          <>
            <View style={st.row}>
              <View style={st.flex}><TextField label="Number of groups" value={numGroups} onChange={(t) => { setNumGroups(t.replace(/[^0-9]/g, '')); invalidate(); }} autoCapitalize="none" /></View>
              <View style={st.flex} />
            </View>
            {groupSizes.length > 0 && (
              <Text style={textStyles.muted}>
                {selected.length} teams → {groupSizes.length} groups (A–{String.fromCharCode(64 + groupSizes.length)}) of {groupSizes.join(', ')}. Round-robin within each; the top finishers advance to a knockout (from the tournament page) once the groups finish.
              </Text>
            )}
          </>
        )}
        {structure === 'advance' && (
          <>
            {/* What the advance produces — a knockout, or (from the group stage) a
                Super round-robin phase. Advancing from a Super phase is always a knockout. */}
            {!advanceFromSuper && (
              <View style={st.chips}>
                <SelectChip label="🏆 To knockout" active={advanceTo === 'knockout'} onPress={() => { setAdvanceTo('knockout'); invalidate(); }} />
                <SelectChip label="🔁 To Super round-robin" active={advanceTo === 'super'} onPress={() => { setAdvanceTo('super'); invalidate(); }} />
              </View>
            )}

            {/* How who-advances is decided: by the standings rules, or hand-picked. */}
            <View style={st.chips}>
              <SelectChip label="⚙️ By standings" active={!manualAdvance} onPress={() => { if (manualAdvance) toggleManualAdvance(); }} />
              <SelectChip label="✏️ Pick manually" active={manualAdvance} onPress={() => { if (!manualAdvance) toggleManualAdvance(); }} />
            </View>

            {!manualAdvance ? (
              <View style={st.row}>
                <View style={st.flex}><TextField label={advanceFromSuper ? 'Advance (top N)' : 'Advance per group'} value={topK} onChange={(t) => { setTopK(t.replace(/[^0-9]/g, '')); invalidate(); }} autoCapitalize="none" /></View>
                {!advanceFromSuper && <View style={st.flex}><TextField label="Best-placed wildcards" value={bestPlaced} onChange={(t) => { setBestPlaced(t.replace(/[^0-9]/g, '')); invalidate(); }} autoCapitalize="none" /></View>}
              </View>
            ) : (
              <>
                <Text style={textStyles.muted}>Tap the teams that advance — ordered by standing (1 = top). {manualSel.length} selected.</Text>
                {sourceTables.map((g) => (
                  <View key={g.name} style={{ gap: theme.spacing(1) }}>
                    <Text style={st.groupHead}>{advanceFromSuper ? g.name : `GROUP ${g.name}`}</Text>
                    <View style={st.chips}>
                      {g.rows.map((r, i) => (
                        <SelectChip key={r.teamId} label={`${i + 1}. ${r.name} · ${r.points}pt`} active={manualSel.includes(r.teamId)} onPress={() => toggleAdvanceTeam(r.teamId)} />
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}

            {!sourceDone && sourceMatches.length > 0 && (
              <Text style={[textStyles.muted, { color: theme.colors.accent }]}>
                ⚠️ {sourceMatches.filter((m) => m.status === 'completed').length}/{sourceMatches.length} {advanceFromSuper ? 'Super-phase' : 'group'} matches finished — finishing all of them first makes the standings final. You can still preview now.
              </Text>
            )}
            {effectiveQualifiers.length > 0 ? (
              <Text style={textStyles.muted}>
                {target === 'super'
                  ? `${effectiveQualifiers.length} advance → ${superPhaseLabel(effectiveQualifiers.length)} · round-robin, ${doubleRound ? effectiveQualifiers.length * (effectiveQualifiers.length - 1) : (effectiveQualifiers.length * (effectiveQualifiers.length - 1)) / 2} games`
                  : `${effectiveQualifiers.length} qualify → ${knockoutRoundLabel(effectiveQualifiers.length)}${manualAdvance ? ' · hand-picked' : advanceFromSuper ? ` · top ${Math.max(1, parseInt(topK, 10) || 1)} of the ${sourceTables[0]?.name ?? 'Super phase'}` : ` · top ${Math.max(1, parseInt(topK, 10) || 1)} from each of ${gtables.length} groups${(parseInt(bestPlaced, 10) || 0) > 0 ? ` + ${parseInt(bestPlaced, 10)} best-placed` : ''}`}`}
                : {effectiveQualifiers.map((q) => `${q.name}${q.via === 'best' ? '*' : ''}`).join(', ')}.
              </Text>
            ) : (
              <Text style={textStyles.muted}>{manualAdvance ? 'Pick the teams that advance above.' : 'Nothing to advance yet — the standings need at least some results.'}</Text>
            )}
          </>
        )}
        {/* Play-in round — offered when the knockout field isn't a clean power of two. */}
        {(structure === 'knockout' || (structure === 'advance' && target === 'knockout')) && koFieldIds.length >= 3 && !koPlan.clean && (
          <View style={{ gap: theme.spacing(2) }}>
            <View style={st.chips}>
              <SelectChip label="⚖️ Play-in round" active={playIn} onPress={() => { setPlayIn((v) => !v); invalidate(); }} />
            </View>
            <Text style={[textStyles.muted, !playIn && { color: theme.colors.accent }]}>
              {playIn
                ? `Play-in: bottom ${koPlan.playInTies * 2} seeds play ${koPlan.playInTies} tie${koPlan.playInTies === 1 ? '' : 's'}; top ${koPlan.byes} bye → ${koPlan.mainSize} for the ${KO_STAGE_LABEL[koPlan.mainStage]}. Byes: ${byeNames(seedPlayIn(koFieldIds).byeIds)}.`
                : `⚠️ ${koFieldIds.length} teams isn't a clean bracket. Turn on a play-in to trim to ${koPlan.mainSize} (${KO_STAGE_LABEL[koPlan.mainStage]}) with top seeds byeing — or generate as-is (everyone plays round 1).`}
            </Text>
          </View>
        )}
        {/* Show which tie-breaker these knockout fixtures will inherit from the tournament. */}
        {(structure === 'knockout' || (structure === 'advance' && target === 'knockout')) && sport === 'football' && (
          <Text style={textStyles.muted}>
            {tournament?.knockoutFormat
              ? `⚖️ If level at full time: ${tournament.knockoutFormat.decider === 'extra_time'
                  ? `extra time (2×${tournament.knockoutFormat.extraTimeMinutes ?? 15}′), then penalties`
                  : 'penalties straightaway'} — from the tournament's knockout format.`
              : '⚖️ No knockout format set on this tournament — level games will stand as a draw. Set it in the tournament to add extra time / penalties.'}
          </Text>
        )}

        <DateTimeField label="First match kickoff" value={start} onChange={setStart} />
        <View style={st.row}>
          <View style={st.flex}><TextField label="Gap between matches (min)" value={gapMin} onChange={setGapMin} autoCapitalize="none" /></View>
          <View style={st.flex}><TextField label="Venue (optional)" value={venue} onChange={setVenue} placeholder="Main ground" /></View>
        </View>

        <Button label="⚡ Generate preview" variant="ghost" onPress={generate} />
        <FormError message={error} />

        {drafts && (
          drafts.length === 0 ? (
            <EmptyState icon="📋" title="No matches generated" hint="Pick more teams to build the fixtures." compact />
          ) : (
            <View style={{ gap: theme.spacing(2), marginTop: theme.spacing(2) }}>
              <Text style={textStyles.h3}>{drafts.length} match{drafts.length === 1 ? '' : 'es'} — review &amp; adjust</Text>
              {drafts.map((d, i) => (
                <View key={i} style={st.draftCard}>
                  <View style={st.rowBetween}>
                    <Text style={textStyles.body}>{teamName[d.homeId] ?? d.homeId} vs {teamName[d.awayId] ?? d.awayId}</Text>
                    <Text style={st.remove} onPress={() => setDrafts((ds) => (ds ? ds.filter((_, ix) => ix !== i) : ds))}>✕</Text>
                  </View>
                  <DateTimeField label={d.stage === 'super' ? `Super · Round ${d.round}` : d.stage && d.stage !== 'group' ? STAGE_LABEL[d.stage] ?? d.stage.toUpperCase() : `${d.group ? `Group ${d.group} · ` : ''}Round ${d.round}`} value={d.when} onChange={(w) => setDrafts((ds) => (ds ? ds.map((x, ix) => (ix === i ? { ...x, when: w } : x)) : ds))} />
                </View>
              ))}
              <Button label={busy ? 'Creating…' : `✅ Create ${drafts.length} match${drafts.length === 1 ? '' : 'es'}`} onPress={create} disabled={busy} />
            </View>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  draftCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(2) },
  remove: { color: theme.colors.danger, fontSize: theme.font.h3, fontWeight: '800', paddingHorizontal: theme.spacing(2) },
  groupHead: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
});
