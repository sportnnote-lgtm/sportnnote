/** Positional lineup editor for any sport with a court/pitch (football, plus the
 *  court sports — basketball, volleyball, kabaddi, badminton, tennis, pickleball,
 *  padel). The players placed in positions ARE the starters, plus a substitutes
 *  list. On save it writes the positional lineup AND the matchday squad (starters
 *  + subs) that feeds the scoring roster — so they never diverge. Only football
 *  has selectable formations; every other sport uses its fixed position set. */
import React, { useCallback, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { getSport } from '../sports/registry';
import { getLineup, setLineup, getRoster, getMatchSquads, setMatchSquad } from '../data/repos';
import { formationSlots, FORMATION_NAMES } from '../sports/football/formation';
import type { LineupSlot, MatchLineup, Player } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function LineupEditorScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'LineupEditor'>>();
  const { matchId, sport, homeTeamName, awayTeamName, homeColor, awayColor } = params;
  const Court = getSport(sport).Court;
  // Only football has multiple selectable formations; other court sports have a
  // fixed position set (from their court layout), so we hide the formation chips.
  const isFootball = sport === 'football';

  const [lineup, setLocal] = useState<MatchLineup | null>(null);
  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);
  const [subs, setSubs] = useState<{ home: string[]; away: string[] }>({ home: [], away: [] });
  const [side, setSide] = useState<'home' | 'away'>('home');
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let on = true;
      getLineup(matchId, sport).then((l) => on && setLocal(l));
      getRoster(homeTeamName, sport).then((r) => on && setHomeRoster(r));
      getRoster(awayTeamName, sport).then((r) => on && setAwayRoster(r));
      getMatchSquads(matchId).then((sq) => on && setSubs({ home: sq.home.subs, away: sq.away.subs }));
      return () => {
        on = false;
      };
    }, [matchId, homeTeamName, awayTeamName, sport])
  );

  if (!lineup) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <Text style={[textStyles.muted, { padding: theme.spacing(4) }]}>Loading lineup…</Text>
      </SafeAreaView>
    );
  }

  const slots = lineup[side];
  const roster = side === 'home' ? homeRoster : awayRoster;
  const assignedIds = new Set(slots.map((s) => s.playerId).filter(Boolean));

  const updateSlots = (next: LineupSlot[]) => setLocal({ ...lineup, [side]: next });

  const formationKey = side === 'home' ? 'homeFormation' : 'awayFormation';
  const formationName = (side === 'home' ? lineup.homeFormation : lineup.awayFormation) ?? '4-3-3';
  // Switch formation: re-lay the slots, carrying each placed player across by
  // index so the XI is preserved (only their position labels/coords change).
  const changeFormation = (name: string) => {
    const fresh = formationSlots(name);
    const next = fresh.map((slot, i) =>
      slots[i]?.playerId ? { ...slot, playerId: slots[i].playerId, playerName: slots[i].playerName } : slot
    );
    setLocal({ ...lineup, [side]: next, [formationKey]: name });
    setSelected(null);
  };

  const assign = (p: Player) => {
    if (selected == null) return;
    const next = slots.map((s, i) => {
      if (s.playerId === p.id) return { ...s, playerId: undefined, playerName: undefined }; // remove dup
      if (i === selected) return { ...s, playerId: p.id, playerName: p.fullName };
      return s;
    });
    updateSlots(next);
    // a starter can't also be a sub
    setSubs((sb) => ({ ...sb, [side]: sb[side].filter((id) => id !== p.id) }));
    setSelected(null);
  };

  const clearSlot = (i: number) =>
    updateSlots(slots.map((s, idx) => (idx === i ? { ...s, playerId: undefined, playerName: undefined } : s)));

  const toggleSub = (id: string) =>
    setSubs((sb) => ({ ...sb, [side]: sb[side].includes(id) ? sb[side].filter((x) => x !== id) : [...sb[side], id] }));

  const save = async () => {
    setBusy(true);
    await setLineup(matchId, lineup);
    // Starters = whoever is placed in a position; persist the matchday squad too.
    for (const sd of ['home', 'away'] as const) {
      const starters = lineup[sd].map((s) => s.playerId).filter((x): x is string => !!x);
      await setMatchSquad(matchId, sd, { starters, subs: subs[sd] });
    }
    setBusy(false);
    nav.goBack();
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content}>
        <ScreenTitle title="Edit lineup" subtitle="Assign players to positions" />

        <View style={st.tabs}>
          <SelectChip label={homeTeamName} active={side === 'home'} onPress={() => { setSide('home'); setSelected(null); }} dotColor={homeColor} />
          <SelectChip label={awayTeamName} active={side === 'away'} onPress={() => { setSide('away'); setSelected(null); }} dotColor={awayColor} />
        </View>

        {isFootball && (
          <>
            <Text style={textStyles.muted}>Formation</Text>
            <View style={st.chips}>
              {FORMATION_NAMES.map((f) => (
                <SelectChip key={f} label={f} active={formationName === f} onPress={() => changeFormation(f)} />
              ))}
            </View>
          </>
        )}

        {Court && (
          <Court
            homeLineup={side === 'home' ? lineup.home : []}
            awayLineup={side === 'away' ? lineup.away : []}
            homeColor={homeColor}
            awayColor={awayColor}
          />
        )}

        {selected != null && (
          <View style={st.pickBox}>
            <Text style={textStyles.muted}>Pick a player for {slots[selected].position}:</Text>
            <View style={st.chips}>
              {roster.length === 0 && <Text style={textStyles.muted}>No players for this team yet.</Text>}
              {roster.map((p) => (
                <SelectChip key={p.id} label={p.fullName} active={assignedIds.has(p.id)} onPress={() => assign(p)} />
              ))}
            </View>
          </View>
        )}

        <Text style={[textStyles.h3, { marginTop: theme.spacing(2) }]}>Positions</Text>
        {slots.map((s, i) => (
          <TouchableOpacity accessibilityRole="button"
            key={i}
            activeOpacity={0.85}
            onPress={() => setSelected(selected === i ? null : i)}
            style={[st.slotRow, selected === i && st.slotActive]}
          >
            <Text style={st.posTag}>{s.position}</Text>
            <Text style={[textStyles.body, { flex: 1 }]}>{s.playerName ?? 'Tap to assign'}</Text>
            {s.playerId ? (
              <Text style={st.clear} onPress={() => clearSlot(i)}>Clear</Text>
            ) : null}
          </TouchableOpacity>
        ))}

        <Text style={[textStyles.h3, { marginTop: theme.spacing(2) }]}>Substitutes</Text>
        <Text style={textStyles.muted}>Bench players (squad members not in the XI).</Text>
        <View style={st.chips}>
          {roster.filter((p) => !assignedIds.has(p.id)).length === 0 ? (
            <Text style={textStyles.muted}>Everyone is in the XI.</Text>
          ) : (
            roster
              .filter((p) => !assignedIds.has(p.id))
              .map((p) => (
                <SelectChip key={p.id} label={p.fullName} active={subs[side].includes(p.id)} onPress={() => toggleSub(p.id)} />
              ))
          )}
        </View>

        <Button label={busy ? 'Saving…' : 'Save lineup & squad'} onPress={save} style={{ marginTop: theme.spacing(2) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  tabs: { flexDirection: 'row', gap: theme.spacing(2) },
  pickBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  slotActive: { borderColor: theme.colors.primary },
  posTag: { color: theme.colors.accent, fontWeight: '800', width: 52, fontSize: theme.font.small },
  clear: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
});
