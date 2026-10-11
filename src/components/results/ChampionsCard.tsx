/**
 * SD-130 — the championships of a school meet, per age group and gender
 * (U14 Boys, U17 Girls …): the champion house and its table, and the
 * individual champion (most position points from individual finals; ties by
 * golds, silvers, bronzes — or joint, a meet setting). Chips switch the
 * category; "Share" sends the whole list (assembly / notice board).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import { SectionHeader } from '../SectionHeader';
import { categoryChampions, championsText, type ChampTie, type MeetEvent, type PointsSettings } from '../../data/results';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ChampionsCard({ events, points, tie, title, athletesWord = 'athlete' }: {
  events: MeetEvent[];
  points: PointsSettings;
  tie: ChampTie;
  /** the meet's name (share text) */
  title?: string;
  athletesWord?: string;
}) {
  const nav = useNavigation<Nav>();
  const pk = JSON.stringify(points);
  const list = useMemo(() => categoryChampions(events, points, tie), [events, pk, tie]); // eslint-disable-line react-hooks/exhaustive-deps
  const [key, setKey] = useState<string | null>(null);
  if (!list.length) return null;
  const c = list.find((x) => x.key === key) ?? list[0];
  const share = () => { void Share.share({ message: championsText(list, title) }).catch(() => {}); };

  return (
    <>
      <SectionHeader title="🏆 Champions by category" count={list.length} />
      <View style={st.chips}>
        {list.map((x) => <SelectChip key={x.key} label={x.label} active={x.key === c.key} onPress={() => setKey(x.key)} />)}
      </View>
      <Card style={{ gap: theme.spacing(2) }}>
        <Text style={st.head}>{c.label} · {c.finals} final{c.finals === 1 ? '' : 's'}</Text>
        <View style={st.line}>
          <Text style={st.trophy}>🏠</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={textStyles.muted}>Champion house</Text>
            <Text style={[textStyles.body, st.bold]} numberOfLines={2}>{c.houseChampions.length ? c.houseChampions.map((h) => h.team).join(' & ') : '—'}</Text>
          </View>
          {c.houseChampions[0] ? <Text style={st.mark}>{c.houseChampions[0].points}</Text> : null}
        </View>
        <View style={st.line}>
          <Text style={st.trophy}>🥇</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={textStyles.muted}>Individual champion{c.champions.length > 1 ? 's' : ''}</Text>
            {c.champions.length ? c.champions.map((a) => (
              <TouchableOpacity key={a.athleteId} accessibilityRole="button" onPress={() => nav.navigate('PlayerProfile', { playerId: a.athleteId })}>
                <Text style={[textStyles.body, st.bold]} numberOfLines={1}>{a.name}{a.team ? <Text style={textStyles.muted}>  {a.team}</Text> : null}</Text>
              </TouchableOpacity>
            )) : <Text style={textStyles.body}>— (no individual final yet)</Text>}
          </View>
          {c.champions[0] ? <Text style={st.mark}>{c.champions[0].points}</Text> : null}
        </View>
        {c.tieNote ? <Text style={textStyles.muted}>{c.tieNote}</Text> : null}

        {c.houses.length > 1 && (
          <View style={st.block}>
            <Text style={st.sub}>Houses</Text>
            {c.houses.map((h, i) => (
              <View key={h.team} style={st.row}>
                <Text style={st.rank}>{i + 1}</Text>
                <View style={[st.dot, { backgroundColor: h.colorHex ?? theme.colors.surfaceAlt }]} />
                <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{h.team}</Text>
                <Text style={textStyles.muted}>{h.golds}🥇 {h.silvers}🥈 {h.bronzes}🥉</Text>
                <Text style={st.mark}>{h.points}</Text>
              </View>
            ))}
          </View>
        )}
        {c.athletes.length > 1 && (
          <View style={st.block}>
            <Text style={st.sub}>Best {athletesWord}s</Text>
            {c.athletes.slice(0, 5).map((a, i) => (
              <TouchableOpacity key={a.athleteId} accessibilityRole="button" onPress={() => nav.navigate('PlayerProfile', { playerId: a.athleteId })}>
                <View style={st.row}>
                  <Text style={st.rank}>{i + 1}</Text>
                  <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{a.name}{a.team ? <Text style={textStyles.muted}>  {a.team}</Text> : null}</Text>
                  <Text style={textStyles.muted}>{a.golds}🥇 {a.silvers}🥈 {a.bronzes}🥉</Text>
                  <Text style={st.mark}>{a.points}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={textStyles.muted}>Position points from this category’s finals; relays count for the house. {tie === 'share' ? 'Equal points make joint champions.' : 'Equal points: more golds, then silvers, then bronzes.'}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share the champions of every category" onPress={share}>
          <Text style={st.link}>↗ Share all champions</Text>
        </TouchableOpacity>
      </Card>
    </>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  head: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  trophy: { fontSize: 22, width: 28, textAlign: 'center' },
  bold: { fontWeight: '800' },
  block: { gap: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing(2) },
  sub: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  rank: { width: 18, color: theme.colors.textMuted, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mark: { color: theme.colors.text, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 40, textAlign: 'right' },
  link: { color: theme.colors.primary, fontWeight: '800' },
});
