/** Create a series / tie — several matches between the same two teams that
 *  resolve to one winner: a best-of-X series (cricket bilateral, an NBA playoff),
 *  a two-legged aggregate tie (a UCL knockout), or a fixed set of rubbers (Davis
 *  Cup, Thomas/Uber Cup, team squash). Spins up the child matches; each is then
 *  scored like any normal game and the series standing updates automatically. */
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { DateTimeField } from '../components/DateTimeField';
import { SPORT_LIST, getSport } from '../sports/registry';
import { useTeams } from '../data/hooks';
import { createSeries, getMyPlayerId } from '../data/repos';
import { useAuth } from '../core/auth';
import type { SeriesFormat } from '../data/series';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FORMATS: { id: SeriesFormat; label: string; hint: string }[] = [
  { id: 'best_of', label: '🏆 Best of X', hint: 'First to a majority of wins takes the series (cricket series, NBA playoff).' },
  { id: 'aggregate', label: '🔁 Two legs (aggregate)', hint: 'Home & away; combined score decides it (a UCL knockout tie).' },
  { id: 'rubbers', label: '👥 Team tie (rubbers)', hint: 'A fixed set of sub-matches; most wins takes the tie (Davis Cup, Thomas Cup).' },
];
const ODD_LEGS = [3, 5, 7];

export default function CreateSeriesScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'CreateSeries'>>();
  const { profile } = useAuth();
  const tournamentId = route.params?.tournamentId;

  const [sport, setSport] = useState<SportId | null>(route.params?.sport ?? null);
  const teams = useTeams(sport ?? undefined);
  const [teamA, setTeamA] = useState<string | null>(null);
  const [teamB, setTeamB] = useState<string | null>(null);
  const [format, setFormat] = useState<SeriesFormat>('best_of');
  const [legs, setLegs] = useState(3);
  const [awayGoals, setAwayGoals] = useState(false);
  const [name, setName] = useState('');
  const [when, setWhen] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return d;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? '';
  const legsCount = format === 'aggregate' ? 2 : legs;

  function pickSport(s: SportId) { setSport(s); setTeamA(null); setTeamB(null); }

  async function submit() {
    if (!sport) return setError('Pick a sport.');
    if (!teamA || !teamB) return setError('Pick both teams.');
    if (teamA === teamB) return setError('The two teams must differ.');
    setError(null); setBusy(true);
    try {
      const myId = await getMyPlayerId(profile?.id);
      const { seriesId } = await createSeries({
        tournamentId, sport, teamAId: teamA, teamBId: teamB,
        format, legs: legsCount, name: name.trim() || undefined,
        awayGoals: format === 'aggregate' ? awayGoals : undefined,
        startsAt: when.toISOString(), hostIds: myId ? [myId] : [],
      });
      nav.replace('Series', { seriesId });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the series.');
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="New series / tie" subtitle="Several matches, one winner" />

        <Dropdown label="Sport" value={sport ? `${getSport(sport).icon}  ${getSport(sport).name}` : null} placeholder="Select a sport"
          options={SPORT_LIST.map((s) => ({ id: s.id, label: `${s.icon}  ${s.name}` }))} onPick={(id) => pickSport(id as SportId)} />

        {sport && (
          <>
            <Dropdown label="Team A (hosts leg 1)" value={teamName(teamA) || null} placeholder="Pick team A"
              options={teams.filter((t) => t.id !== teamB).map((t) => ({ id: t.id, label: t.name }))} onPick={setTeamA} />
            <Dropdown label="Team B" value={teamName(teamB) || null} placeholder="Pick team B"
              options={teams.filter((t) => t.id !== teamA).map((t) => ({ id: t.id, label: t.name }))} onPick={setTeamB} />

            <View style={{ gap: theme.spacing(2) }}>
              <FieldLabel>Format</FieldLabel>
              <View style={st.chips}>
                {FORMATS.map((f) => <SelectChip key={f.id} label={f.label} active={format === f.id} onPress={() => setFormat(f.id)} />)}
              </View>
              <Text style={textStyles.muted}>{FORMATS.find((f) => f.id === format)!.hint}</Text>
            </View>

            {format !== 'aggregate' && (
              <View style={{ gap: theme.spacing(2) }}>
                <FieldLabel>{format === 'best_of' ? 'Best of' : 'Rubbers'}</FieldLabel>
                <View style={st.chips}>
                  {ODD_LEGS.map((n) => <SelectChip key={n} label={`${n}`} active={legs === n} onPress={() => setLegs(n)} />)}
                  <Stepper value={legs} onChange={(v) => setLegs(Math.max(1, Math.min(15, v)))} />
                </View>
                <Text style={textStyles.muted}>
                  {format === 'best_of' ? `First to ${Math.floor(legs / 2) + 1} wins. Later games are dead rubbers once decided.` : `Most wins of ${legs} takes the tie.`}
                </Text>
              </View>
            )}

            {format === 'aggregate' && (
              <SelectChip label={awayGoals ? '✓ Away-goals tiebreak' : 'Away-goals tiebreak'} active={awayGoals} onPress={() => setAwayGoals((v) => !v)} />
            )}

            <TextField label="Series name (optional)" value={name} onChange={setName} placeholder="e.g. India tour of Australia" />
            <DateTimeField label="First match" value={when} onChange={setWhen} />
            <Text style={textStyles.muted}>
              {legsCount} match{legsCount === 1 ? '' : 'es'} will be created, three days apart, alternating home & away.
            </Text>
          </>
        )}

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : `Create series (${legsCount} match${legsCount === 1 ? '' : 'es'})`} onPress={submit} disabled={busy || !sport} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={st.stepper}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fewer" style={st.stepBtn} onPress={() => onChange(value - 2)}><Text style={st.stepTxt}>−2</Text></TouchableOpacity>
      <Text style={st.stepVal}>{value}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="More" style={st.stepBtn} onPress={() => onChange(value + 2)}><Text style={st.stepTxt}>+2</Text></TouchableOpacity>
    </View>
  );
}

/** A compact select field that opens an inline option list. */
function Dropdown({ label, value, placeholder, options, onPick }: {
  label: string; value: string | null; placeholder: string;
  options: { id: string; label: string }[]; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <FieldLabel>{label}</FieldLabel>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={value ? `${label}: ${value}` : placeholder} accessibilityState={{ expanded: open }}
        activeOpacity={0.8} style={st.field} onPress={() => setOpen((o) => !o)}>
        <Text style={[st.fieldValue, !value && st.fieldPlaceholder]} numberOfLines={1}>{value ?? placeholder}</Text>
        <Text style={st.caret}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={st.dropdown}>
          {options.length === 0 && <Text style={[textStyles.muted, { padding: theme.spacing(3) }]}>No teams for this sport yet.</Text>}
          {options.map((o) => (
            <TouchableOpacity accessibilityRole="button" key={o.id} activeOpacity={0.7} style={st.option} onPress={() => { onPick(o.id); setOpen(false); }}>
              <Text style={st.optionText} numberOfLines={1}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3),
  },
  fieldValue: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600', flex: 1 },
  fieldPlaceholder: { color: theme.colors.textMuted, fontWeight: '400' },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800' },
  dropdown: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', maxHeight: 260 },
  option: { paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  optionText: { color: theme.colors.text, fontSize: theme.font.body },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  stepBtn: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: theme.spacing(1.5), paddingHorizontal: theme.spacing(3) },
  stepTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  stepVal: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.h3, minWidth: 24, textAlign: 'center' },
});
