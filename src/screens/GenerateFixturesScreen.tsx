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
import { useTeams, useTournamentById, useLeagueData } from '../data/hooks';
import { createMatch, getMyPlayerId } from '../data/repos';
import { roundRobin, knockoutFirstRound, groupStage, drawGroups, type GeneratedPairing } from '../data/fixtures';
import { groupTables, advancement, seedKnockout, knockoutRoundLabel } from '../data/groups';
import { useAuth } from '../core/auth';
import type { SportId } from '../core/types';
import type { FormatField } from '../sports/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Structure = 'league' | 'knockout' | 'groups' | 'advance';

const defaultsFor = (fields: FormatField[]) => Object.fromEntries(fields.map((f) => [f.key, f.default]));

interface Draft extends GeneratedPairing { when: Date; group?: string; stage?: string }

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
  const { matches: tourMatches } = useLeagueData(params.tournamentId);
  // Name lookup for draft cards: the pickable team list, plus the team ids
  // embedded in this tournament's matches (advance-mode brackets seed from
  // those, whose ids can differ from the team-list ids).
  const teamName = useMemo(() => {
    const m: Record<string, string> = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    for (const mt of tourMatches) { m[mt.homeTeam.id] ??= mt.homeTeam.name; m[mt.awayTeam.id] ??= mt.awayTeam.name; }
    return m;
  }, [teams, tourMatches]);

  const [selected, setSelected] = useState<string[]>([]);
  const [structure, setStructure] = useState<Structure>(tournament?.structure === 'knockout' ? 'knockout' : 'league');
  const [doubleRound, setDoubleRound] = useState(false);
  const [numGroups, setNumGroups] = useState('4');
  const [topK, setTopK] = useState('2');
  const [bestPlaced, setBestPlaced] = useState('0');
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
      setSelected([]); setDrafts(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  const invalidate = () => setDrafts(null);
  const pickSport = (s: SportId) => { setSport(s); setSelected([]); invalidate(); };
  const toggleTeam = (id: string) => { invalidate(); setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); };
  const allSelected = teams.length > 0 && selected.length === teams.length;

  const groupCount = Math.max(2, Math.min(parseInt(numGroups, 10) || 2, Math.floor(selected.length / 2) || 2));
  // Preview the group split (sizes) once enough teams are picked.
  const groupSizes = useMemo(
    () => (structure === 'groups' && selected.length >= 2 ? drawGroups(selected, groupCount).map((g) => g.teamIds.length) : []),
    [structure, selected, groupCount],
  );

  // ── Advance-to-knockout: derive qualifiers from this tournament's finished
  //    group tables (only offered once the tournament actually has group matches).
  const gtables = useMemo(() => groupTables(tourMatches, sport), [tourMatches, sport]);
  const hasGroups = gtables.length > 0;
  const groupMatches = tourMatches.filter((m) => m.stage === 'group' && m.sport === sport);
  const groupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'completed');
  const qualifiers = useMemo(
    () => (hasGroups ? advancement(gtables, Math.max(1, parseInt(topK, 10) || 1), Math.max(0, parseInt(bestPlaced, 10) || 0)) : []),
    [gtables, hasGroups, topK, bestPlaced],
  );

  function generate() {
    const gap0 = Math.max(0, parseInt(gapMin, 10) || 0);
    if (structure === 'advance') {
      if (qualifiers.length < 2) return setError('Not enough qualifiers yet — finish the group matches first.');
      setError(null);
      const stage = knockoutRoundLabel(qualifiers.length);
      setDrafts(seedKnockout(qualifiers).map((p, i) => ({ ...p, stage, when: new Date(start.getTime() + i * gap0 * 60000) })));
      return;
    }
    if (selected.length < 2) return setError('Pick at least two teams.');
    setError(null);
    const pairings: (GeneratedPairing & { group?: string })[] =
      structure === 'knockout' ? knockoutFirstRound(selected)
        : structure === 'groups' ? groupStage(selected, groupCount, doubleRound)
        : roundRobin(selected, doubleRound);
    const gap = Math.max(0, parseInt(gapMin, 10) || 0);
    setDrafts(pairings.map((p, i) => ({ ...p, when: new Date(start.getTime() + i * gap * 60000) })));
  }

  async function create() {
    if (!drafts?.length) return;
    setError(null); setBusy(true);
    try {
      const myId = await getMyPlayerId(profile?.id);
      let format = tournament?.formats?.[sport] ?? defaultsFor(getSport(sport).formatFields ?? []);
      // Knockout fixtures inherit the tournament's tie-breaker (football only —
      // the decider is football's). League fixtures keep the default (draws allowed).
      const kf = tournament?.knockoutFormat;
      if ((structure === 'knockout' || structure === 'advance') && sport === 'football' && kf) {
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
          group: d.group, stage: d.stage ?? (d.group ? 'group' : undefined),
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

        {structure !== 'advance' && (
          <>
            <View style={st.rowBetween}>
              <Text style={textStyles.muted}>Teams · {selected.length} selected</Text>
              {teams.length >= 2 && (
                <Text style={st.link} onPress={() => { invalidate(); setSelected(allSelected ? [] : teams.map((t) => t.id)); }}>
                  {allSelected ? 'Clear' : 'Select all'}
                </Text>
              )}
            </View>
            {teams.length < 2 ? (
              <Text style={textStyles.muted}>Add at least two {getSport(sport).name} teams under “Manage teams” first.</Text>
            ) : (
              <View style={st.chips}>
                {teams.map((t) => (
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
          {hasGroups && (
            <SelectChip label="🏅 Advance groups → knockout" active={structure === 'advance'} onPress={() => { setStructure('advance'); invalidate(); }} />
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
            <View style={st.row}>
              <View style={st.flex}><TextField label="Advance per group" value={topK} onChange={(t) => { setTopK(t.replace(/[^0-9]/g, '')); invalidate(); }} autoCapitalize="none" /></View>
              <View style={st.flex}><TextField label="Best-placed wildcards" value={bestPlaced} onChange={(t) => { setBestPlaced(t.replace(/[^0-9]/g, '')); invalidate(); }} autoCapitalize="none" /></View>
            </View>
            {!groupsDone && (
              <Text style={[textStyles.muted, { color: theme.colors.accent }]}>
                ⚠️ {groupMatches.filter((m) => m.status === 'completed').length}/{groupMatches.length} group matches finished — finishing all of them first makes the standings final. You can still preview the bracket now.
              </Text>
            )}
            {qualifiers.length > 0 ? (
              <Text style={textStyles.muted}>
                {qualifiers.length} qualify → {knockoutRoundLabel(qualifiers.length)} · top {Math.max(1, parseInt(topK, 10) || 1)} from each of {gtables.length} groups
                {(parseInt(bestPlaced, 10) || 0) > 0 ? ` + ${parseInt(bestPlaced, 10)} best-placed` : ''}: {qualifiers.map((q) => `${q.name}${q.via === 'best' ? '*' : ''}`).join(', ')}.
              </Text>
            ) : (
              <Text style={textStyles.muted}>No qualifiers yet — the group tables need at least some results.</Text>
            )}
          </>
        )}
        {/* Show which tie-breaker these knockout fixtures will inherit from the tournament. */}
        {(structure === 'knockout' || structure === 'advance') && sport === 'football' && (
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
                  <DateTimeField label={d.stage && d.stage !== 'group' ? STAGE_LABEL[d.stage] ?? d.stage.toUpperCase() : `${d.group ? `Group ${d.group} · ` : ''}Round ${d.round}`} value={d.when} onChange={(w) => setDrafts((ds) => (ds ? ds.map((x, ix) => (ix === i ? { ...x, when: w } : x)) : ds))} />
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
});
