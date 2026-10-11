/** SD-99 / SD-100 — a rower's / paddler's career (careerView 'measured'):
 *  races, A finals and medals (every crew member and the cox is credited),
 *  the best time per boat class and distance (personal and season bests) and
 *  the results history with the seat raced, each row opening that race's
 *  results. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Card, Pill, textStyles } from '../ui';
import { formatDay } from '../../core/dates';
import { getPhaseInfos } from '../../data/resultsStore';
import { crewCareer, type PhaseInfo } from '../../data/results';
import type { StatLine } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' } as const;

export function CrewCareer({ lines, sport }: { lines: StatLine[]; sport: 'rowing' | 'canoe' }) {
  const nav = useNavigation<Nav>();
  const [infos, setInfos] = useState<Map<string, PhaseInfo>>(new Map());
  const key = lines.map((l) => l.eventId ?? '').join(',');
  useEffect(() => {
    let on = true;
    void getPhaseInfos(lines.map((l) => l.eventId ?? '')).then((m) => on && setInfos(m)).catch(() => {});
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const season = `${new Date().getFullYear()}-01-01`;
  const c = useMemo(() => crewCareer(lines, infos, season), [lines, infos, season]);
  const medals = c.golds + c.silvers + c.bronzes;
  const icon = sport === 'rowing' ? '🚣' : '🛶';
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={st.grid}>
        <Tile value={String(c.races)} label={c.races === 1 ? 'Race' : 'Races'} />
        <Tile value={String(c.finalsA)} label={`A final${c.finalsA === 1 ? '' : 's'}${c.finals > c.finalsA ? ` (${c.finals} finals)` : ''}`} />
        <Tile value={String(medals)} label="Medals" />
      </View>
      {(medals > 0 || c.points > 0) && (
        <Text style={st.medals}>{c.golds} 🥇  {c.silvers} 🥈  {c.bronzes} 🥉{c.points ? `  ·  ${c.points} points` : ''}</Text>
      )}
      {c.coxed > 0 && <Text style={textStyles.muted}>Coxed {c.coxed} race{c.coxed === 1 ? '' : 's'}.</Text>}

      <Text style={st.section}>Best times</Text>
      {c.bests.length === 0 ? <Text style={textStyles.muted}>No times yet — each boat class and distance keeps its own best.</Text> : (
        <Card style={{ gap: theme.spacing(2) }}>
          <View style={st.bestRow}>
            <Text style={[st.head, { flex: 1 }]}>Boat · distance</Text>
            <Text style={[st.head, st.col]}>PB</Text>
            <Text style={[st.head, st.col]}>SB {new Date().getFullYear()}</Text>
          </View>
          {c.bests.map((b) => (
            <TouchableOpacity key={b.key} accessibilityRole="button" onPress={() => b.pb.eventId && nav.navigate('ResultsEvent', { phaseId: b.pb.eventId, tab: 'sheet' })}>
              <View style={st.bestRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={textStyles.body} numberOfLines={1}>{b.label}</Text>
                  <Text style={textStyles.muted} numberOfLines={1}>{[b.pb.category, b.pb.date ? formatDay(b.pb.date) : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={[st.mark, st.col]}>{b.pb.text}</Text>
                <Text style={[st.markSb, st.col]}>{b.sb?.text ?? '–'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      {c.history.length > 0 && (
        <>
          <Text style={st.section}>Results</Text>
          {c.history.map((h, i) => (
            <TouchableOpacity key={`${h.eventId}${i}`} accessibilityRole="button" activeOpacity={0.85} disabled={!h.eventId} onPress={() => nav.navigate('ResultsEvent', { phaseId: h.eventId, tab: 'sheet' })}>
              <Card style={[st.hist, { borderLeftWidth: 3, borderLeftColor: h.medal ? theme.colors.accent : theme.colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={textStyles.body} numberOfLines={1}>{icon} {h.title}{h.date ? <Text style={st.date}>  ·  {formatDay(h.date)}</Text> : null}</Text>
                  <Text style={textStyles.muted}>{[h.text, ...h.flags].filter(Boolean).join(' · ')}</Text>
                </View>
                {h.medal ? <Text style={{ fontSize: 20 }}>{MEDAL[h.medal]}</Text> : h.place ? <Pill label={`${h.place}`} /> : null}
                <Text style={st.chev}>›</Text>
              </Card>
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ width: '30%', flexGrow: 1 }}>
      <Card style={{ alignItems: 'center', gap: theme.spacing(1) }}>
        <Text style={st.tile}>{value}</Text>
        <Text style={[textStyles.muted, { textAlign: 'center' }]}>{label}</Text>
      </Card>
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  tile: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  medals: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', textAlign: 'center' },
  section: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing(1) },
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  col: { width: 72, textAlign: 'right' },
  mark: { color: theme.colors.text, fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: theme.font.body },
  markSb: { color: theme.colors.textMuted, fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: theme.font.body },
  hist: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  date: { color: theme.colors.textMuted, fontWeight: '400' },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
});
