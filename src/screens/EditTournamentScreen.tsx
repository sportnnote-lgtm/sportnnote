/** Edit an existing tournament: name, dates, sports (add/remove), structure,
 *  knockout format, and per-sport formats. Host/co-hosts, divisions and reminders
 *  are managed on the tournament page; those aren't repeated here. */
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, LoadingState, textStyles } from '../components/ui';
import { DateField } from '../components/DateTimeField';
import { SportFormatEditor } from '../components/FormatEditor';
import { PointsEditor } from '../components/PointsEditor';
import { SPORT_LIST, getSport } from '../sports/registry';
import { updateTournament } from '../data/repos';
import { useTournamentById } from '../data/hooks';
import type { SportId, TournamentStructure } from '../core/types';
import type { FormatField } from '../sports/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FormatVal = number | string | boolean;
type FormatMap = Partial<Record<SportId, Record<string, FormatVal>>>;

const STRUCTURES: { value: TournamentStructure; label: string; hint: string }[] = [
  { value: 'league', label: 'League', hint: 'everyone plays everyone' },
  { value: 'knockout', label: 'Knockout', hint: 'single elimination (byes for odd counts)' },
  { value: 'league_knockout', label: 'League + Knockout', hint: 'group stage then knockouts' },
];

const defaultsFor = (fields: FormatField[]) => Object.fromEntries(fields.map((f) => [f.key, f.default]));
const isValidISODate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  const pad = (n: number) => String(n).padStart(2, '0');
  return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === s;
};

export default function EditTournamentScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'EditTournament'>>();
  const tournament = useTournamentById(params.tournamentId);

  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [sports, setSports] = useState<SportId[]>([]);
  const [structure, setStructure] = useState<TournamentStructure>('league_knockout');
  const [koDecider, setKoDecider] = useState<'extra_time' | 'penalties'>('extra_time');
  const [etMinutes, setEtMinutes] = useState(15);
  const [etSubs, setEtSubs] = useState(1);
  const [formats, setFormats] = useState<FormatMap>({});
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasKnockout = structure !== 'league';

  // Seed the form from the tournament once it loads (then leave edits alone).
  useEffect(() => {
    if (!tournament || loaded) return;
    setName(tournament.name);
    setStart(tournament.startDate);
    setEnd(tournament.endDate);
    setSports(tournament.sports);
    setStructure(tournament.structure ?? 'league_knockout');
    setKoDecider(tournament.knockoutFormat?.decider ?? 'extra_time');
    setEtMinutes(tournament.knockoutFormat?.extraTimeMinutes ?? 15);
    setEtSubs(tournament.knockoutFormat?.extraTimeSubs ?? 1);
    setFormats((tournament.formats ?? {}) as FormatMap);
    setIsOpen(!!tournament.isOpen);
    setLoaded(true);
  }, [tournament, loaded]);

  useEffect(() => { nav.setOptions({ title: 'Edit Tournament' }); }, [nav]);

  const toggleSport = (s: SportId) =>
    setSports((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      const fields = getSport(s).formatFields ?? [];
      if (fields.length) setFormats((f) => ({ ...f, [s]: f[s] ?? defaultsFor(fields) }));
      return [...prev, s];
    });
  const setField = (sport: SportId, key: string, value: FormatVal) =>
    setFormats((f) => ({ ...f, [sport]: { ...(f[sport] ?? {}), [key]: value } }));

  async function save() {
    if (!name.trim()) return setError('Give the tournament a name.');
    if (sports.length === 0) return setError('Pick at least one sport.');
    const s = start.trim(), e = end.trim();
    if (!isValidISODate(s)) return setError('Enter a valid start date as YYYY-MM-DD.');
    if (!isValidISODate(e)) return setError('Enter a valid end date as YYYY-MM-DD.');
    if (e < s) return setError('End date can’t be before the start date.');
    setBusy(true); setError(null);
    try {
      await updateTournament(params.tournamentId, {
        name: name.trim(),
        sports,
        startDate: s,
        endDate: e,
        structure,
        knockoutFormat: hasKnockout
          ? { decider: koDecider, ...(koDecider === 'extra_time' ? { extraTimeMinutes: etMinutes, extraTimeSubs: etSubs } : {}) }
          : undefined,
        formats,
        isOpen,
      });
      nav.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setBusy(false);
    }
  }

  if (!tournament) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><LoadingState label="Loading tournament…" /></SafeAreaView>;
  }

  const removed = tournament.sports.filter((sp) => !sports.includes(sp));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Edit tournament" subtitle={tournament.name} />

        <TextField label="Name" value={name} onChange={setName} placeholder="Annual Sports Meet 2026" />

        <View style={st.row}>
          <View style={st.flex}><DateField label="Start date" value={start} onChange={setStart} /></View>
          <View style={st.flex}><DateField label="End date" value={end} onChange={setEnd} /></View>
        </View>

        <FieldLabel>Sports</FieldLabel>
        <View style={st.chips}>
          {SPORT_LIST.map((sp) => (
            <SelectChip key={sp.id} label={`${sp.icon} ${sp.name}`} active={sports.includes(sp.id)} onPress={() => toggleSport(sp.id)} />
          ))}
        </View>
        {removed.length > 0 && (
          <Text style={st.warn}>Removing {removed.map((sp) => getSport(sp).name).join(', ')} hides it here — games already scheduled in it are kept, not deleted.</Text>
        )}

        <FieldLabel>Structure</FieldLabel>
        <View style={st.chips}>
          {STRUCTURES.map((x) => (
            <SelectChip key={x.value} label={x.label} active={structure === x.value} onPress={() => setStructure(x.value)} />
          ))}
        </View>
        <Text style={st.hint}>{STRUCTURES.find((x) => x.value === structure)?.hint}</Text>

        {hasKnockout && (
          <>
            <FieldLabel>Format for knockouts</FieldLabel>
            <View style={st.chips}>
              <SelectChip label="Extra time + Penalties" active={koDecider === 'extra_time'} onPress={() => setKoDecider('extra_time')} />
              <SelectChip label="Direct Penalties" active={koDecider === 'penalties'} onPress={() => setKoDecider('penalties')} />
            </View>
            {koDecider === 'extra_time' && (
              <View style={st.fmtCard}>
                <FieldLabel>Extra-time half length</FieldLabel>
                <View style={st.chips}>
                  {[5, 7, 10, 15].map((m) => (
                    <SelectChip key={m} label={`${m} min`} active={etMinutes === m} onPress={() => setEtMinutes(m)} />
                  ))}
                </View>
                <FieldLabel>Extra-time substitutions</FieldLabel>
                <View style={st.chips}>
                  {[0, 1, 2, 3].map((n) => (
                    <SelectChip key={n} label={String(n)} active={etSubs === n} onPress={() => setEtSubs(n)} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {sports.map((sp) => (
          <View key={sp} style={{ gap: theme.spacing(3) }}>
            <SportFormatEditor sport={sp} heading="format" value={formats[sp] ?? {}} onChange={(k, v) => setField(sp, k, v)} />
            <PointsEditor sport={sp} value={formats[sp] ?? {}} onChange={(k, v) => setField(sp, k, v)} />
          </View>
        ))}

        <FieldLabel>Registration</FieldLabel>
        <View style={st.chips}>
          <SelectChip label="🔓 Open — teams can find & request to join" active={isOpen} onPress={() => setIsOpen(true)} />
          <SelectChip label="🔒 Invite only" active={!isOpen} onPress={() => setIsOpen(false)} />
        </View>

        <FormError message={error} />
        <Button label={busy ? 'Saving…' : 'Save changes'} onPress={save} disabled={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  hint: { color: theme.colors.textMuted, fontSize: theme.font.small },
  warn: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '600' },
  fmtCard: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
});
