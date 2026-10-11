/** SD-95 — an archer's career (careerView 'measured'): competitions, match
 *  record (won–lost, set points), average arrow and 10 + X rate over the
 *  ranking rounds, medals, the best complete ranking round per round (PB / SB)
 *  with its average arrow, and the results history, each row opening that
 *  phase's results. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Card, Pill, textStyles } from '../ui';
import { formatDay } from '../../core/dates';
import { getPhaseInfos } from '../../data/resultsStore';
import { archeryCareer, type PhaseInfo } from '../../data/results';
import type { StatLine } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' } as const;

export function ArcheryCareer({ lines }: { lines: StatLine[] }) {
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
  const c = useMemo(() => archeryCareer(lines, infos, season), [lines, infos, season]);
  const medals = c.golds + c.silvers + c.bronzes;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={st.grid}>
        <Tile value={String(c.comps)} label={c.comps === 1 ? 'Competition' : 'Competitions'} />
        <Tile value={c.mW + c.mL ? `${c.mW}–${c.mL}` : '–'} label="Matches won–lost" />
        <Tile value={c.avgArrow != null ? c.avgArrow.toFixed(2) : '–'} label="Average arrow" />
        <Tile value={c.tenRate != null ? `${c.tenRate}%` : '–'} label={`10 + X${c.arrows ? ` (${c.tens}/${c.arrows})` : ''}`} />
        <Tile value={c.xRate != null ? `${c.xRate}%` : '–'} label={`X rate${c.arrows ? ` (${c.xs})` : ''}`} />
        <Tile value={c.sp || c.spA ? `${c.sp}–${c.spA}` : '–'} label="Set points for–against" />
      </View>
      {(medals > 0 || c.points > 0) && (
        <Text style={st.medals}>{c.golds} 🥇  {c.silvers} 🥈  {c.bronzes} 🥉{c.points ? `  ·  ${c.points} points` : ''}</Text>
      )}

      <Text style={st.section}>Personal bests (ranking round)</Text>
      {c.bests.length === 0 ? <Text style={textStyles.muted}>No complete ranking round yet.</Text> : (
        <Card style={{ gap: theme.spacing(2) }}>
          <View style={st.bestRow}>
            <Text style={[st.head, { flex: 1 }]}>Round</Text>
            <Text style={[st.head, st.col]}>PB</Text>
            <Text style={[st.head, st.col]}>SB {new Date().getFullYear()}</Text>
          </View>
          {c.bests.map((b) => (
            <TouchableOpacity key={b.key} accessibilityRole="button" onPress={() => b.pb.eventId && nav.navigate('ResultsEvent', { phaseId: b.pb.eventId, tab: 'sheet' })}>
              <View style={st.bestRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={textStyles.body} numberOfLines={1}>{b.label}</Text>
                  <Text style={textStyles.muted} numberOfLines={1}>{[`avg arrow ${b.avgArrow.toFixed(2)}`, b.pb.date ? formatDay(b.pb.date) : ''].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={[st.mark, st.col]}>{b.pb.value || '–'}</Text>
                <Text style={[st.markSb, st.col]}>{b.sb?.value ?? '–'}</Text>
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
                  <Text style={textStyles.body} numberOfLines={1}>🏹 {h.title}{h.date ? <Text style={st.date}>  ·  {formatDay(h.date)}</Text> : null}</Text>
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
  tile: { color: theme.colors.primary, fontSize: theme.font.h2, fontWeight: '900' },
  medals: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', textAlign: 'center' },
  section: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing(1) },
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  col: { width: 64, textAlign: 'right' },
  mark: { color: theme.colors.text, fontWeight: '900', fontVariant: ['tabular-nums'], fontSize: theme.font.body },
  markSb: { color: theme.colors.textMuted, fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: theme.font.body },
  hist: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  date: { color: theme.colors.textMuted, fontWeight: '400' },
  chev: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
});
