/** SD-90 — athletics inside a tournament: the programme (events by category,
 *  each with its current round), the house table from finished finals, the
 *  fastest mark per event, the best athletes by points, and the meet / school
 *  record books. Organisers add events from here. */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../core/theme';
import { Button, Card, EmptyState, Pill, textStyles } from '../ui';
import { SectionHeader } from '../SectionHeader';
import { MedalTable } from '../MedalTable';
import { useMeet } from '../../data/useAthletics';
import { medalStandings } from '../../data/medalStandings';
import {
  categoryKey, categoryLabel, disciplineOf, eventLeaders, eventStatus, formatMark, meetFieldResults, meetSettings, topAthletes,
  type MeetEvent, type RecordMark,
} from '../../data/results';
import type { Tournament } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const AGE_ORDER = ['U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Open'];

export function AthleticsHub({ tournament, canOrganize }: { tournament: Tournament; canOrganize: boolean }) {
  const nav = useNavigation<Nav>();
  const { events, records, schoolRecords, loading } = useMeet(tournament.id, tournament.hostOrgId);
  const settings = meetSettings(tournament.formats?.athletics as Record<string, unknown> | undefined);
  const points = { positionPoints: settings.positionPoints, relayFactor: settings.relayFactor };
  const table = useMemo(() => medalStandings([], [], { mode: 'position' }, undefined, meetFieldResults(events, points)), [events, settings.positionPoints.join(), settings.relayFactor]); // eslint-disable-line react-hooks/exhaustive-deps
  const leaders = useMemo(() => eventLeaders(events), [events]);
  const top = useMemo(() => topAthletes(events, points).slice(0, 5), [events, settings.positionPoints.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Programme by category (age, then Boys / Girls / Mixed).
  const byCat = useMemo(() => {
    const m = new Map<string, { label: string; sort: string; events: MeetEvent[] }>();
    for (const e of events) {
      const k = categoryKey(e.category);
      const sort = `${String(AGE_ORDER.indexOf(e.category?.age ?? 'Open')).padStart(2, '0')}${e.category?.gender ?? 'X'}`;
      const g = m.get(k) ?? { label: categoryLabel(e.category), sort, events: [] };
      g.events.push(e);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [events]);

  const open = (e: MeetEvent) => {
    const cur = [...e.phases].reverse().find((p) => p.status !== 'completed') ?? e.phases[e.phases.length - 1];
    if (cur) nav.navigate('ResultsEvent', { phaseId: cur.id, ...(cur.status === 'completed' ? { tab: 'sheet' as const } : {}) });
  };

  return (
    <View style={{ gap: theme.spacing(3) }}>
      {canOrganize && (
        <View style={{ gap: theme.spacing(2) }}>
          <Button label="＋ Add a track event" onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId: tournament.id })} />
          <Button label="⚙ Points & timing" variant="ghost" onPress={() => nav.navigate('SportSettings', { sport: 'athletics', tournamentId: tournament.id })} />
        </View>
      )}

      <SectionHeader title="📋 Programme" count={events.length} />
      {loading ? <Text style={textStyles.muted}>Loading…</Text> : events.length === 0 ? (
        <EmptyState icon="🏃" title="No events yet" compact />
      ) : byCat.map((g) => (
        <View key={g.label} style={{ gap: theme.spacing(2) }}>
          <Text style={st.cat}>{g.label}</Text>
          {g.events.map((e) => {
            const s = eventStatus(e);
            const first = e.phases[0];
            return (
              <TouchableOpacity key={e.eventKey} accessibilityRole="button" activeOpacity={0.85} onPress={() => open(e)}>
                <View style={st.row}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[textStyles.body, st.bold]} numberOfLines={1}>{e.title}</Text>
                    <Text style={textStyles.muted} numberOfLines={1}>{s.label} · {first?.entries.length ?? 0} {disciplineOf(e.discipline)?.teamSize ? 'teams' : 'athletes'}</Text>
                  </View>
                  <Pill label={s.done ? 'FINAL' : s.live ? 'LIVE' : e.phases.length > 1 ? `ROUND ${e.phases.length}` : 'START LIST'}
                    color={s.live ? theme.colors.danger : theme.colors.surfaceAlt} textColor={s.live ? '#fff' : theme.colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <SectionHeader title="🏅 House table" count={table.length} />
      <Text style={textStyles.muted}>{settings.positionPoints.join('-')} points per final{settings.relayFactor !== 1 ? `, relays ×${settings.relayFactor}` : ''}; tied places share.</Text>
      <MedalTable rows={table} emptyLabel="No final has finished yet." />

      {leaders.length > 0 && (
        <>
          <SectionHeader title="⚡ Fastest by event" count={leaders.length} />
          <Card style={{ gap: theme.spacing(2) }}>
            {leaders.map((l) => (
              <TouchableOpacity key={l.eventKey} accessibilityRole="button" disabled={!l.athleteId} onPress={() => l.athleteId && nav.navigate('PlayerProfile', { playerId: l.athleteId })}>
                <View style={st.lead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={textStyles.muted} numberOfLines={1}>{l.title}</Text>
                    <Text style={textStyles.body} numberOfLines={1}>{l.name}{l.team && l.team !== l.name ? <Text style={textStyles.muted}>  {l.team}</Text> : null}</Text>
                  </View>
                  <Text style={st.mark}>{l.text}{l.flags.length ? ` ${l.flags.join(' ')}` : ''}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      )}

      {top.length > 0 && (
        <>
          <SectionHeader title="🌟 Best athletes (points)" count={top.length} />
          <Card style={{ gap: theme.spacing(2) }}>
            {top.map((a, i) => (
              <TouchableOpacity key={a.athleteId} accessibilityRole="button" onPress={() => nav.navigate('PlayerProfile', { playerId: a.athleteId })}>
                <View style={st.lead}>
                  <Text style={st.rank}>{i + 1}</Text>
                  <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{a.name}{a.team ? <Text style={textStyles.muted}>  {a.team}</Text> : null}</Text>
                  <Text style={textStyles.muted}>{a.golds}🥇 {a.silvers}🥈 {a.bronzes}🥉</Text>
                  <Text style={st.mark}>{a.points}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={textStyles.muted}>Position points from individual finals; relays count for the house.</Text>
          </Card>
        </>
      )}

      <RecordBook title="📖 Meet records" list={records} empty="Set by the first final of each event." />
      {tournament.hostOrgId ? <RecordBook title="🏫 School records" list={schoolRecords} empty="Best marks from this organisation's earlier meets appear here." /> : null}
    </View>
  );
}

function RecordBook({ title, list, empty }: { title: string; list: RecordMark[]; empty: string }) {
  const rows = [...list].filter((r) => r.discipline.startsWith('ath.')).sort((a, b) => a.category.localeCompare(b.category) || a.discipline.localeCompare(b.discipline));
  return (
    <>
      <SectionHeader title={title} count={rows.length} />
      {rows.length === 0 ? <Text style={textStyles.muted}>{empty}</Text> : (
        <Card style={{ gap: theme.spacing(2) }}>
          {rows.map((r) => {
            const def = disciplineOf(r.discipline);
            const [age, g] = r.category.split('-');
            return (
              <View key={`${r.scope}${r.discipline}${r.category}`} style={st.lead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={textStyles.muted} numberOfLines={1}>{def?.label} {categoryLabel({ age: age === 'open' ? 'Open' : age, gender: g as 'M' | 'F' | 'X' })}{r.date ? ` · ${r.date}` : ''}</Text>
                  <Text style={textStyles.body} numberOfLines={1}>{r.holder}{r.team && r.team !== r.holder ? <Text style={textStyles.muted}>  {r.team}</Text> : null}</Text>
                </View>
                <Text style={st.mark}>{def ? formatMark(r.value, def) : r.value}</Text>
              </View>
            );
          })}
        </Card>
      )}
    </>
  );
}

const st = StyleSheet.create({
  cat: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  bold: { fontWeight: '800' },
  lead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  mark: { color: theme.colors.text, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 48, textAlign: 'right' },
  rank: { width: 18, color: theme.colors.textMuted, fontWeight: '800' },
});
