/** One sport's settings, on its own page — everything specific to that sport and
 *  nothing that isn't. Cricket shows overs / players / powerplay and its own tie
 *  rule; football shows halves / players / subs and extra-time-or-penalties; a
 *  racket sport shows neither. Plus the structure (league / knockout / groups)
 *  and points & tie-breakers for that sport. Edits the shared tournament draft,
 *  which the Create / Edit form reads back. */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { SportFormatEditor } from '../components/FormatEditor';
import { StructureEditor } from '../components/StructureEditor';
import { PointsEditor } from '../components/PointsEditor';
import { getSport } from '../sports/registry';
import { structureFromFormat, mergeStructure, shapeForStructure } from '../data/structureConfig';
import { tournamentDraft } from '../data/tournamentDraft';
import { useTournamentById } from '../data/hooks';
import { patchTournamentFormat, formatDiff, getTournaments, updateTournament } from '../data/repos';
import { migrateFormatsForSettings, coarseStructureFrom } from '../components/SportSettingsButtons';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Val = number | string | boolean;

export default function SportSettingsScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SportSettings'>>();
  const sport = params.sport;
  const plugin = getSport(sport);

  // Opened from a tournament's admin hub (parity #08): seed the draft from the
  // saved tournament and SAVE this sport directly — only the keys changed here,
  // merged into a fresh read (so points adjustments added meanwhile survive).
  const tournament = useTournamentById(params.tournamentId);
  const [seeded, setSeeded] = useState<Record<string, unknown> | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!params.tournamentId || !tournament || seeded) return;
    const fm = migrateFormatsForSettings(tournament);
    tournamentDraft.seed(fm);
    // The baseline is what's SAVED — the migrated draft already fills in defaults
    // (e.g. the structure), which then must count as changes on Save.
    setSeeded({ ...((tournament.formats?.[sport] as Record<string, unknown>) ?? {}) });
  }, [params.tournamentId, tournament, seeded, sport]);
  const saveDirect = async () => {
    if (!params.tournamentId || !tournament) return;
    setSaving(true); setSaveErr(null);
    try {
      // Saving with the format shown (League by default) records it, even when
      // nothing was tapped — that's the organiser accepting it.
      const draft = { ...(tournamentDraft.get(sport) as Record<string, unknown>) };
      const shownCfg = structureFromFormat(draft) ?? { shape: shapeForStructure(tournament.structure), groupCount: 4, advanceTopN: 2, advanceBest: 0, doubleRound: false, superPhase: false, manualStandings: false, swissRounds: 5 };
      const withShape = structureFromFormat(draft) ? draft : mergeStructure(draft as never, shownCfg as never) as Record<string, unknown>;
      await patchTournamentFormat(params.tournamentId, sport, formatDiff(seeded, withShape));
      const fresh = (await getTournaments()).find((t) => t.id === params.tournamentId);
      if (fresh) await updateTournament(params.tournamentId, { structure: coarseStructureFrom((fresh.formats ?? {}) as never, fresh.sports) });
      nav.goBack();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Couldn’t save.');
    } finally {
      setSaving(false);
    }
  };

  // Re-render whenever the draft changes (edits happen through it).
  useSyncExternalStore(tournamentDraft.subscribe, tournamentDraft.getVersion);
  const value = tournamentDraft.get(sport) as Record<string, Val>;
  const set = (key: string, val: Val) => tournamentDraft.setField(sport, key, val);

  const cfg = structureFromFormat(value);
  const hasKnockout = !cfg || cfg.shape === 'knockout' || cfg.shape === 'groups';
  const isFootball = sport === 'football';
  const decider = (value.decider as string) ?? 'extra_time';
  const etMinutes = typeof value.extraTimeMinutes === 'number' ? value.extraTimeMinutes : 15;
  const etSubs = typeof value.extraTimeSubs === 'number' ? value.extraTimeSubs : 1;

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={`${plugin.name} settings`} subtitle="Just this sport — nothing that doesn’t apply to it" />

        <StructureEditor value={value} onChange={set} sport={sport} />

        {(plugin.formatFields ?? []).length > 0 && (
          // Football's tie-decider is shown by the dedicated knockout card below, so
          // don't render it a second time (with a different option set) here.
          <SportFormatEditor sport={sport} heading="format" value={value} onChange={set}
            omitKeys={isFootball ? ['decider', 'extraTimeMinutes', 'extraTimeSubs'] : undefined} />
        )}

        {/* Football's knockout tie-decider — extra time or straight penalties. Only
            football has this; cricket carries its own tie rule in its format. */}
        {isFootball && hasKnockout && (
          <View style={st.card}>
            <FieldLabel>If a knockout tie is level</FieldLabel>
            <View style={st.chips}>
              <SelectChip label="Extra time, then penalties" active={decider === 'extra_time'} onPress={() => set('decider', 'extra_time')} />
              <SelectChip label="Straight to penalties" active={decider === 'penalties'} onPress={() => set('decider', 'penalties')} />
            </View>
            {decider === 'extra_time' && (
              <>
                <FieldLabel>Extra-time half length</FieldLabel>
                <View style={st.chips}>
                  {[5, 7, 10, 15].map((m) => <SelectChip key={m} label={`${m} min`} active={etMinutes === m} onPress={() => set('extraTimeMinutes', m)} />)}
                </View>
                <FieldLabel>Extra-time substitutions</FieldLabel>
                <View style={st.chips}>
                  {[0, 1, 2, 3].map((n) => <SelectChip key={n} label={String(n)} active={etSubs === n} onPress={() => set('extraTimeSubs', n)} />)}
                </View>
              </>
            )}
          </View>
        )}

        <PointsEditor sport={sport} value={value} onChange={set} />

        <Text style={textStyles.muted}>These apply only to {plugin.name} in this tournament.</Text>
        {params.tournamentId ? (
          <>
            <FormError message={saveErr} />
            <Button label={saving ? 'Saving…' : 'Save'} onPress={() => void saveDirect()} disabled={saving || !seeded} />
          </>
        ) : (
          <Button label="Done" onPress={() => nav.goBack()} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4) },
  card: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
