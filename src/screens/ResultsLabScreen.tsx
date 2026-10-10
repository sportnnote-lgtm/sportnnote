/** Dev entry point for the results engine (SD-28) — hidden: reachable only by
 *  URL (/ResultsLab). Creates sample events from the demo players (athletics
 *  100 m heats → final, long jump, high jump, 4 × 100 m relay, swimming 50 m)
 *  and lists every results event. Athletics / swimming are NOT live sports yet
 *  (Wave 4 registers them); this screen exists so the generic entry screen and
 *  results sheet can be exercised end to end. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, textStyles } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { getPlayers } from '../data/repos';
import type { FieldEvent, Player } from '../core/types';
import { createResultsEvent, getResultsPhases, type NewEntrant } from '../data/resultsStore';
import { phaseOf, phaseLabel, categoryLabel, type Category } from '../data/results';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const team = (p: Player) => (p.houseName ? { name: p.houseName, colorHex: p.houseColor } : undefined);
const athletes = (ps: Player[], n: number, from = 0): NewEntrant[] => ps.slice(from, from + n).map((p, i) => ({ playerId: p.id, name: p.fullName, team: team(p), seed: 11.2 + i * 0.07 }));

const SAMPLES: { key: string; label: string; make: (ps: Player[]) => { discipline: string; category: Category; entrants: NewEntrant[] } }[] = [
  { key: '100', label: '100 m U14 Boys — 12 athletes, 2 heats → final', make: (ps) => ({ discipline: 'ath.100m', category: { age: 'U14', gender: 'M' }, entrants: athletes(ps, 12) }) },
  { key: 'lj', label: 'Long jump U14 Boys — 10 athletes, 3 + 3', make: (ps) => ({ discipline: 'ath.lj', category: { age: 'U14', gender: 'M' }, entrants: athletes(ps, 10, 2).map((e) => ({ ...e, seed: undefined })) }) },
  { key: 'hj', label: 'High jump U17 Girls — 6 athletes', make: (ps) => ({ discipline: 'ath.hj', category: { age: 'U17', gender: 'F' }, entrants: athletes(ps, 6, 4).map((e) => ({ ...e, seed: undefined })) }) },
  {
    key: 'relay', label: '4 × 100 m relay U17 — houses', make: (ps) => {
      const houses = [...new Set(ps.map((p) => p.houseName).filter((h): h is string => !!h))].slice(0, 4);
      return {
        discipline: 'ath.4x100', category: { age: 'U17', gender: 'X' },
        entrants: houses.map((h) => {
          const ms = ps.filter((p) => p.houseName === h).slice(0, 4);
          return { name: `${h} A`, team: { name: h, colorHex: ms[0]?.houseColor }, members: ms.map((m) => ({ playerId: m.id, name: m.fullName })) };
        }),
      };
    },
  },
  { key: 'swim', label: 'Swimming 50 m freestyle Open — 8 swimmers', make: (ps) => ({ discipline: 'swim.50free', category: { age: 'Open', gender: 'X' }, entrants: athletes(ps, 8, 1).map((e, i) => ({ ...e, seed: 28 + i * 0.3 })) }) },
];

export default function ResultsLabScreen() {
  const nav = useNavigation<Nav>();
  const [events, setEvents] = useState<FieldEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => setEvents(await getResultsPhases()), []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const create = async (s: (typeof SAMPLES)[number]) => {
    setBusy(s.key); setError(null);
    try {
      const ps = (await getPlayers()).filter((p) => !!p.fullName);
      const ev = await createResultsEvent({ ...s.make(ps), startsAt: new Date().toISOString() });
      nav.navigate('ResultsEvent', { phaseId: ev.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <View>
          <Text style={textStyles.h2}>Results lab</Text>
          <Text style={textStyles.muted}>Developer preview of the timed / measured results engine. Athletics meets use the tournament's Athletics page (SD-90).</Text>
        </View>
        <FormError message={error} />
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.h3}>New sample event</Text>
          {SAMPLES.map((s) => <Button key={s.key} variant="ghost" label={busy === s.key ? 'Creating…' : s.label} disabled={!!busy} onPress={() => void create(s)} />)}
        </Card>
        <Text style={textStyles.h3}>Events</Text>
        {!events.length && <Text style={textStyles.muted}>None yet.</Text>}
        {events.map((e) => {
          const f = phaseOf(e)!;
          return (
            <TouchableOpacity key={e.id} accessibilityRole="button" onPress={() => nav.navigate('ResultsEvent', { phaseId: e.id })}>
              <Card style={st.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.title} numberOfLines={1}>{f.eventTitle}</Text>
                  <Text style={textStyles.muted}>{phaseLabel(f.phase)} · {categoryLabel(f.category)} · {e.status}</Text>
                </View>
                <Text style={st.chev}>›</Text>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(12) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(3) },
  title: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  chev: { color: theme.colors.textMuted, fontSize: 22 },
});
