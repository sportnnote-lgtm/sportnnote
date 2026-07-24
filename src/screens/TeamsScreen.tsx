/** Manage teams/houses: list existing + add a new one (name, short code, sport,
 *  colour). Demo mode appends to the local store; live mode inserts to Supabase. */
import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { SPORT_LIST, getSport } from '../sports/registry';
import { useTeams } from '../data/hooks';
import { createTeam } from '../data/repos';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const PALETTE = ['#FF5C5C', '#4DA3FF', '#3DDC97', '#FFB454', '#B98AFF', '#FF8AC4'];

export default function TeamsScreen() {
  const nav = useNavigation<Nav>();
  const [tick, setTick] = useState(0); // bump to refetch after adding
  const teams = useTeams(undefined, tick);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [sport, setSport] = useState<SportId>('football');
  const [color, setColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTeams, setShowTeams] = useState(false); // shared show-all for grouped team lists
  const [showCasual, setShowCasual] = useState(false);

  async function add() {
    if (!name.trim() || !short.trim()) return setError('Name and short code are required.');
    setError(null);
    setBusy(true);
    try {
      await createTeam({ name: name.trim(), shortName: short.trim().toUpperCase(), sport, colorHex: color });
      setName('');
      setShort('');
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add team');
    } finally {
      setBusy(false);
    }
  }

  // Ad-hoc teams (created on the fly for friendlies) are kept but tucked into a
  // de-emphasised "Casual teams" section so they don't clutter the real houses/clubs.
  const managed = teams.filter((t) => !t.adhoc);
  const casual = teams.filter((t) => t.adhoc);
  const grouped = managed.reduce<Record<string, typeof teams>>((acc, t) => {
    (acc[t.sport] ??= []).push(t);
    return acc;
  }, {});

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Teams" subtitle="Houses & teams across sports" />

        <Card style={{ gap: theme.spacing(3) }}>
          <Text style={textStyles.h3}>Add a team</Text>
          <View style={st.row}>
            <View style={st.flex2}>
              <TextField label="Name" value={name} onChange={setName} placeholder="Red House" />
            </View>
            <View style={st.flex1}>
              <TextField label="Short" value={short} onChange={setShort} placeholder="RED" autoCapitalize="characters" />
            </View>
          </View>

          <Text style={textStyles.muted}>Sport</Text>
          <View style={st.chips}>
            {SPORT_LIST.map((s) => (
              <SelectChip key={s.id} label={`${s.icon} ${s.name}`} active={sport === s.id} onPress={() => setSport(s.id)} />
            ))}
          </View>

          <Text style={textStyles.muted}>Colour</Text>
          <View style={st.chips}>
            {PALETTE.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setColor(c)}
                style={[st.swatch, { backgroundColor: c }, color === c && st.swatchActive]}
              />
            ))}
          </View>

          {error && <Text style={st.error}>{error}</Text>}
          <Button label={busy ? 'Adding…' : 'Add team'} onPress={add} />
        </Card>

        {Object.entries(grouped).map(([sp, list]) => (
          <View key={sp} style={{ gap: theme.spacing(2) }}>
            <SectionHeader
              title={`${getSport(sp as SportId).icon} ${getSport(sp as SportId).name}`}
              count={list.length}
              onSeeAll={list.length > SECTION_CAP ? () => setShowTeams((v) => !v) : undefined}
              expanded={showTeams}
            />
            {(showTeams ? list : list.slice(0, SECTION_CAP)).map((t) => (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open ${t.name}`}
                onPress={() => nav.navigate('Team', { teamId: t.id })}
              >
                <Card style={st.teamRow}>
                  <View style={[st.dot, { backgroundColor: t.colorHex }]} />
                  <Text style={[textStyles.body, { flex: 1 }]}>{t.name}</Text>
                  <Text style={textStyles.muted}>{t.shortName}</Text>
                  <Text style={st.chev}>›</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {casual.length > 0 && (
          <View style={st.casual}>
            <SectionHeader
              title="🤝 Casual teams"
              count={casual.length}
              onSeeAll={casual.length > SECTION_CAP ? () => setShowCasual((v) => !v) : undefined}
              expanded={showCasual}
            />
            <Text style={textStyles.muted}>One-off sides created for friendlies. Kept for match history &amp; stats.</Text>
            {(showCasual ? casual : casual.slice(0, SECTION_CAP)).map((t) => (
              <TouchableOpacity
                key={t.id}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Open ${t.name}`}
                onPress={() => nav.navigate('Team', { teamId: t.id })}
              >
                <Card style={st.teamRow}>
                  <View style={[st.dot, { backgroundColor: t.colorHex }]} />
                  <Text style={[textStyles.body, { flex: 1 }]}>{t.name}</Text>
                  <Text style={textStyles.muted}>{getSport(t.sport as SportId).icon} {t.shortName}</Text>
                  <Text style={st.chev}>›</Text>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: theme.colors.text },
  casual: { gap: theme.spacing(2), marginTop: theme.spacing(2), opacity: 0.6 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '800' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  error: { color: theme.colors.danger, fontSize: theme.font.small },
});
