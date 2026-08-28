/** Contingents for a multi-sport meet — the teams / houses / nations that
 *  compete across every sport. Add one here and it's entered into all the meet's
 *  sports at once (sharing name + colour, so the medal table merges it). Each
 *  contingent can be marked out of a sport it doesn't field — its fixtures there
 *  then become walkovers for its opponents. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { useTournamentById } from '../data/hooks';
import { getContingents, addContingent, setContingentParticipation, type Contingent } from '../data/repos';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const PALETTE = ['#FF5C5C', '#4DA3FF', '#4CD964', '#FFD60A', '#BF5AF2', '#FF9F0A', '#5AC8FA', '#FF375F', '#30D158', '#64D2FF'];

export default function ContingentsScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Contingents'>>();
  const tournament = useTournamentById(params.tournamentId);
  const sports = tournament?.sports ?? [];

  const [contingents, setContingents] = useState<Contingent[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useFocusEffect(useCallback(() => {
    let on = true;
    if (sports.length) getContingents(params.tournamentId, sports).then((c) => on && setContingents(c));
    return () => { on = false; };
  }, [params.tournamentId, sports.join(','), tick]));

  async function add() {
    const nm = name.trim();
    if (!nm) return;
    if (contingents.some((c) => c.name.trim().toLowerCase() === nm.toLowerCase())) return setError('That contingent is already in.');
    setBusy(true); setError(null);
    try {
      const color = PALETTE[contingents.length % PALETTE.length];
      await addContingent(params.tournamentId, nm, color, sports);
      setName('');
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the contingent.');
    } finally { setBusy(false); }
  }

  async function toggle(c: Contingent, sport: SportId) {
    const present = c.sports.includes(sport);
    setBusy(true); setError(null);
    try {
      await setContingentParticipation(params.tournamentId, c.name, sport, !present);
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update participation.');
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Contingents" subtitle={`${contingents.length} across ${sports.length} sport${sports.length === 1 ? '' : 's'}`} />

        <Card style={{ gap: theme.spacing(2) }}>
          <FieldLabel>Add a contingent</FieldLabel>
          <TextField label="" value={name} onChange={setName} placeholder="e.g. Red House, India, Class 10-A" />
          <Text style={textStyles.muted}>Enters {sports.map((s) => getSport(s).name).join(', ')} at once.</Text>
          <Button label={busy ? 'Adding…' : '＋ Add to every sport'} onPress={add} disabled={busy || !name.trim()} />
        </Card>

        <FormError message={error} />

        {contingents.map((c) => (
          <Card key={c.name} style={{ gap: theme.spacing(2) }}>
            <View style={st.row}>
              <View style={[st.dot, { backgroundColor: c.colorHex ?? theme.colors.surfaceAlt }]} />
              <Text style={st.name} numberOfLines={1}>{c.name}</Text>
            </View>
            <Text style={textStyles.muted}>Tap a sport to add or sit it out (a sat-out sport becomes walkovers for opponents).</Text>
            <View style={st.chips}>
              {sports.map((s) => {
                const inIt = c.sports.includes(s);
                return <SelectChip key={s} label={`${getSport(s).icon} ${getSport(s).name}${inIt ? '' : ' · out'}`} active={inIt} onPress={() => toggle(c, s)} />;
              })}
            </View>
          </Card>
        ))}

        {contingents.length === 0 && <Text style={textStyles.muted}>No contingents yet — add the teams that will compete across the meet.</Text>}
        <Button label="Done" variant="ghost" onPress={() => nav.goBack()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
