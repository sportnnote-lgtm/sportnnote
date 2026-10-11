/** SD-90 — an athlete's athletics career (careerView 'measured'): races,
 *  finals and medals; personal and season bests per event (hurdles per
 *  category — the barrier height differs); and the results history, each row
 *  opening that round's results. Built from the athlete's stat lines (one per
 *  round) and the rounds they came from. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Card, Pill, textStyles } from '../ui';
import { formatDay } from '../../core/dates';
import { getPhaseInfos } from '../../data/resultsStore';
import { athleticsCareer, ordSuffix, type PhaseInfo } from '../../data/results';
import type { StatLine } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' } as const;

export function AthleticsCareer({ lines }: { lines: StatLine[] }) {
  const nav = useNavigation<Nav>();
  // SD-94: the same career for swimmers (PBs per event per pool length)
  const swim = lines.length > 0 && lines.every((l) => l.sport === 'swimming');
  const [infos, setInfos] = useState<Map<string, PhaseInfo>>(new Map());
  const key = lines.map((l) => l.eventId ?? '').join(',');
  useEffect(() => {
    let on = true;
    void getPhaseInfos(lines.map((l) => l.eventId ?? '')).then((m) => on && setInfos(m)).catch(() => {});
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const season = `${new Date().getFullYear()}-01-01`;
  const c = useMemo(() => athleticsCareer(lines, infos, season), [lines, infos, season]);

  return (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={st.grid}>
        <Tile value={String(c.races + c.relays + c.field)} label={c.field ? 'Events' : 'Races'} />
        <Tile value={String(c.finals)} label={c.finals === 1 ? 'Final' : 'Finals'} />
        <Tile value={String(c.golds + c.silvers + c.bronzes)} label="Medals" />
      </View>
      {(c.golds + c.silvers + c.bronzes > 0 || c.points > 0) && (
        <Text style={st.medals}>{c.golds} 🥇  {c.silvers} 🥈  {c.bronzes} 🥉{c.points ? `  ·  ${c.points} points` : ''}</Text>
      )}

      {/* SD-92: road races, race walks, cross-country (places and team medals) */}
      {c.road + c.walks + c.xc > 0 && (
        <Card style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.body}>{[c.road ? `${c.road} road race${c.road === 1 ? '' : 's'}` : '', c.walks ? `${c.walks} race walk${c.walks === 1 ? '' : 's'}` : '', c.xc ? `${c.xc} cross-country` : ''].filter(Boolean).join(' · ')}</Text>
          {c.bestXc ? <Text style={textStyles.muted}>Best cross-country place: {c.bestXc.place}{ordSuffix(c.bestXc.place)} — {c.bestXc.title}</Text> : null}
          {c.teamGolds + c.teamSilvers + c.teamBronzes + c.teamScored > 0 ? (
            <Text style={textStyles.muted}>Team: {c.teamGolds} 🥇  {c.teamSilvers} 🥈  {c.teamBronzes} 🥉{c.teamScored ? ` · scored for the team ${c.teamScored}×` : ''}</Text>
          ) : null}
        </Card>
      )}

      <Text style={st.section}>Personal bests</Text>
      {c.bests.length === 0 ? (
        <Text style={textStyles.muted}>{swim ? 'No times yet (25 m and 50 m pool bests are kept apart).' : 'No legal marks yet (wind-aided and, at fully-timed meets, hand times don’t count).'}</Text>
      ) : (
        <Card style={{ gap: theme.spacing(2) }}>
          <View style={st.bestRow}>
            <Text style={[st.head, { flex: 1 }]}>Event</Text>
            <Text style={[st.head, st.col]}>PB</Text>
            <Text style={[st.head, st.col]}>SB {new Date().getFullYear()}</Text>
          </View>
          {c.bests.map((b) => (
            <TouchableOpacity key={b.key} accessibilityRole="button" onPress={() => b.pb.eventId && nav.navigate('ResultsEvent', { phaseId: b.pb.eventId, tab: 'sheet' })}>
              <View style={st.bestRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={textStyles.body} numberOfLines={1}>{b.label}</Text>
                  <Text style={textStyles.muted} numberOfLines={1}>{[b.pb.category, b.pb.wind != null && /ath\.(lj|tj)/.test(b.pb.discipline) ? `wind ${b.pb.wind > 0 ? '+' : ''}${b.pb.wind.toFixed(1)}` : '', b.pb.date ? formatDay(b.pb.date) : ''].filter(Boolean).join(' · ')}</Text>
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
                  <Text style={textStyles.body} numberOfLines={1}>{h.discipline?.startsWith('ath.xc.') ? '🌳' : h.discipline?.startsWith('ath.walk.') ? '🚶' : h.discipline && /^ath\.(lj|tj|hj|pv)$/.test(h.discipline) ? '🦘' : h.discipline && /^ath\.(sp|dt|jt|ht)$/.test(h.discipline) ? '🥏' : h.discipline?.startsWith('swim.') || swim ? '🏊' : '🏃'} {h.title}{h.date ? <Text style={st.date}>  ·  {formatDay(h.date)}</Text> : null}</Text>
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
        <Text style={textStyles.muted}>{label}</Text>
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
