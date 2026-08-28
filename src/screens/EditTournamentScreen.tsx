/** Edit an existing tournament: name, dates, sports (add/remove), structure,
 *  knockout format, and per-sport formats. Host/co-hosts, divisions and reminders
 *  are managed on the tournament page; those aren't repeated here. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, LoadingState, textStyles } from '../components/ui';
import { DateField, DateTimeField } from '../components/DateTimeField';
import { MedalScoringEditor } from '../components/MedalScoringEditor';
import { SportSettingsButtons, coarseStructureFrom, migrateFormatsForSettings } from '../components/SportSettingsButtons';
import { tournamentDraft } from '../data/tournamentDraft';
import { defaultsFor } from '../components/FormatEditor';
import { SPORT_LIST, getSport } from '../sports/registry';
import { updateTournament } from '../data/repos';
import { useTournamentById } from '../data/hooks';
import type { SportId, TournamentScoring } from '../core/types';
import type { FormatField } from '../sports/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FormatVal = number | string | boolean;
type FormatMap = Partial<Record<SportId, Record<string, FormatVal>>>;

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
  const [formats, setFormats] = useState<FormatMap>({});
  const [isOpen, setIsOpen] = useState(false);
  const [regDeadline, setRegDeadline] = useState<Date | null>(null);
  const [minTeams, setMinTeams] = useState(0); // 0 = unset
  const [maxTeams, setMaxTeams] = useState(0); // 0 = no cap
  const [scoring, setScoring] = useState<TournamentScoring | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed the form from the tournament once it loads (then leave edits alone).
  // Per-sport settings live on their own screens via the shared draft, seeded here
  // with the old tournament-wide structure/decider folded into each sport.
  useEffect(() => {
    if (!tournament || loaded) return;
    setName(tournament.name);
    setStart(tournament.startDate);
    setEnd(tournament.endDate);
    setSports(tournament.sports);
    const migrated = migrateFormatsForSettings(tournament);
    setFormats(migrated as FormatMap);
    tournamentDraft.seed(migrated);
    setIsOpen(!!tournament.isOpen);
    setRegDeadline(tournament.registrationDeadline ? new Date(tournament.registrationDeadline) : null);
    setMinTeams(tournament.minTeams ?? 0);
    setMaxTeams(tournament.maxTeams ?? 0);
    setScoring(tournament.scoring);
    setLoaded(true);
  }, [tournament, loaded]);

  useEffect(() => { nav.setOptions({ title: 'Edit Tournament' }); }, [nav]);

  // Returning from a sport's settings page — pull the edited formats back in.
  useFocusEffect(useCallback(() => { if (loaded) setFormats(tournamentDraft.all() as FormatMap); }, [loaded]));

  const toggleSport = (s: SportId) =>
    setSports((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      const fields = getSport(s).formatFields ?? [];
      const seeded = fields.length ? defaultsFor(fields) : {};
      setFormats((f) => (f[s] ? f : { ...f, [s]: seeded }));
      if (!tournamentDraft.get(s) || Object.keys(tournamentDraft.get(s)).length === 0) tournamentDraft.setFormat(s, seeded);
      return [...prev, s];
    });

  async function save() {
    if (!name.trim()) return setError('Give the tournament a name.');
    if (sports.length === 0) return setError('Pick at least one sport.');
    const s = start.trim(), e = end.trim();
    if (!isValidISODate(s)) return setError('Enter a valid start date as YYYY-MM-DD.');
    if (!isValidISODate(e)) return setError('Enter a valid end date as YYYY-MM-DD.');
    if (e < s) return setError('End date can’t be before the start date.');
    setBusy(true); setError(null);
    try {
      // Per-sport formats are the source of truth now; the coarse structure label
      // is derived from them (and the football tie-decider lives in formats.football).
      const finalFormats = { ...tournamentDraft.all() } as FormatMap;
      await updateTournament(params.tournamentId, {
        name: name.trim(),
        sports,
        startDate: s,
        endDate: e,
        structure: coarseStructureFrom(finalFormats, sports),
        formats: finalFormats,
        isOpen,
        registrationDeadline: isOpen && regDeadline ? regDeadline.toISOString() : null,
        minTeams: minTeams > 0 ? minTeams : null,
        maxTeams: maxTeams > 0 ? maxTeams : null,
        scoring: sports.length > 1 ? scoring ?? null : null,
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

        {sports.length > 1 && <MedalScoringEditor sports={sports} value={scoring} onChange={setScoring} />}

        <SportSettingsButtons sports={sports} />

        <FieldLabel>Registration</FieldLabel>
        <View style={st.chips}>
          <SelectChip label="🔓 Open — teams can find & request to join" active={isOpen} onPress={() => setIsOpen(true)} />
          <SelectChip label="🔒 Invite only" active={!isOpen} onPress={() => setIsOpen(false)} />
        </View>

        {isOpen && (
          <View style={{ gap: theme.spacing(3) }}>
            {regDeadline ? (
              <View style={{ gap: theme.spacing(2) }}>
                <DateTimeField label="Registration deadline" value={regDeadline} onChange={setRegDeadline} />
                <Text style={st.linkText} onPress={() => setRegDeadline(null)}>Remove deadline</Text>
              </View>
            ) : (
              <SelectChip label="＋ Add a registration deadline" active={false} onPress={() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 0, 0); setRegDeadline(d); }} />
            )}
            <View style={st.capRow}>
              <View style={st.capCell}>
                <FieldLabel>Min teams</FieldLabel>
                <NumberStepper value={minTeams} min={0} max={128} onChange={setMinTeams} zeroLabel="—" />
              </View>
              <View style={st.capCell}>
                <FieldLabel>Max teams (cap)</FieldLabel>
                <NumberStepper value={maxTeams} min={0} max={128} onChange={setMaxTeams} zeroLabel="∞" />
              </View>
            </View>
            <Text style={textStyles.muted}>Below the minimum is just a heads-up; the maximum caps public sign-ups (you can still add teams yourself).</Text>
          </View>
        )}

        <FormError message={error} />
        <Button label={busy ? 'Saving…' : 'Save changes'} onPress={save} disabled={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** A small −/+ counter; `zeroLabel` renders when the value is 0 (e.g. "∞", "—"). */
function NumberStepper({ value, min, max, onChange, zeroLabel }: { value: number; min: number; max: number; onChange: (v: number) => void; zeroLabel?: string }) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <View style={st.stepper}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fewer" style={st.stepBtn} onPress={() => onChange(clamp(value - 1))}><Text style={st.stepTxt}>−</Text></TouchableOpacity>
      <Text style={st.stepVal}>{value === 0 && zeroLabel ? zeroLabel : value}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="More" style={st.stepBtn} onPress={() => onChange(clamp(value + 1))}><Text style={st.stepTxt}>+</Text></TouchableOpacity>
    </View>
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
  linkText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  capRow: { flexDirection: 'row', gap: theme.spacing(4) },
  capCell: { gap: theme.spacing(2) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  stepBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  stepTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.body },
  stepVal: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.h3, minWidth: 28, textAlign: 'center' },
});
