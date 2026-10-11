/** SD-90 — athletics inside a tournament: the programme (events by category,
 *  each with its current round), the house table from finished finals, the
 *  best mark per event (fastest / longest / highest — SD-91 field events), the best athletes by points, and the meet / school
 *  record books. Organisers add events from here. SD-94: the same hub runs a
 *  swim meet (`sport="swimming"`: pool length and lanes, records per course). */
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
  swimMeetSettings, courseLabel, courseShort, eventMeetSettings, wlMeetSettings, sinclairTotal, summarizeLifts, fmtKg, SINCLAIR, pointsLabel,
  isCrewSport, crewMeetSettings,
  type MeetEvent, type RecordMark,
} from '../../data/results';
import { eventWords, eventPrefix, type EventSport } from '../../sports/eventSports';
import type { Tournament } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const AGE_ORDER = ['U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'Open', 'School', 'Youth', 'Junior', 'Senior'];
/** SD-97: records read snatch, C&J, total */
const LIFT_ORDER = ['wl.snatch', 'wl.cj', 'wl.total'];
/** SD-97: "+110 kg" after "110 kg" */
const classSort = (wc?: string) => { const m = /^(\+)?(\d+)/.exec(wc ?? ''); return m ? String(Number(m[2]) * 2 + (m[1] ? 1 : 0)).padStart(4, '0') : ''; };

export function AthleticsHub({ tournament, canOrganize, sport = 'athletics' }: { tournament: Tournament; canOrganize: boolean; sport?: EventSport }) {
  const nav = useNavigation<Nav>();
  const words = eventWords(sport);
  const swim = sport === 'swimming';
  const { events, records, schoolRecords, loading } = useMeet(tournament.id, tournament.hostOrgId, sport);
  const fmt = tournament.formats?.[sport] as Record<string, unknown> | undefined;
  const swimSettings = swim ? swimMeetSettings(fmt) : null;
  const wl = sport === 'weightlifting';
  const wlSettings = wl ? wlMeetSettings(fmt) : null;
  // SD-99 / SD-100: a regatta (rowing / canoe sprint) — lanes, points, crew-boat factor
  const crew = isCrewSport(sport);
  const crewSettings = crew ? crewMeetSettings(sport, fmt) : null;
  const settings = swimSettings ?? crewSettings ?? (wl ? eventMeetSettings(sport, fmt) : meetSettings(fmt));
  const points = { positionPoints: settings.positionPoints, relayFactor: settings.relayFactor, liftMedals: wlSettings?.liftMedals };
  const table = useMemo(() => medalStandings([], [], { mode: 'position' }, undefined, meetFieldResults(events, points)), [events, settings.positionPoints.join(), settings.relayFactor]); // eslint-disable-line react-hooks/exhaustive-deps
  const leaders = useMemo(() => eventLeaders(events), [events]);
  const top = useMemo(() => topAthletes(events, points).slice(0, 5), [events, settings.positionPoints.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  // SD-97: best lifters across bodyweight categories by Sinclair total (a meet setting)
  const sinclair = useMemo(() => {
    if (!wlSettings?.sinclair) return [];
    const out: { id: string; athleteId?: string; name: string; team?: string; total: number; bw: number; points: number; cat: string }[] = [];
    for (const e of events) {
      const fin = e.phases.find((p) => p.status === 'completed');
      for (const en of fin?.entries ?? []) {
        const total = summarizeLifts(en.result.lifts).total;
        const pts = sinclairTotal(total, en.result.bodyweight, e.category?.gender);
        if (pts != null && total != null) out.push({ id: en.id, athleteId: en.athleteId, name: en.name, team: en.team?.name, total, bw: en.result.bodyweight!, points: pts, cat: categoryLabel(e.category) });
      }
    }
    return out.sort((a, b) => b.points - a.points).slice(0, 5);
  }, [events, wlSettings?.sinclair]);

  // Programme by category (age, then Boys / Girls / Mixed).
  const byCat = useMemo(() => {
    const m = new Map<string, { label: string; sort: string; events: MeetEvent[] }>();
    for (const e of events) {
      const k = categoryKey(e.category);
      const sort = `${String(AGE_ORDER.indexOf(e.category?.age ?? 'Open')).padStart(2, '0')}${e.category?.gender ?? 'X'}${classSort(e.category?.weightClass)}`;
      // SD-97: weightlifting groups by age + gender (each event is one bodyweight category)
      const gk = wl ? `${e.category?.age ?? ''}-${e.category?.gender ?? ''}` : k;
      const g = m.get(gk) ?? { label: wl ? categoryLabel({ age: e.category?.age, gender: e.category?.gender, weightClass: e.category?.weightClass ? ' ' : undefined }).trim() : categoryLabel(e.category), sort, events: [] };
      g.events.push(e);
      m.set(gk, g);
    }
    for (const g of m.values()) g.events.sort((a, b) => classSort(a.category?.weightClass).localeCompare(classSort(b.category?.weightClass)));
    return [...m.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [events, wl]);

  const open = (e: MeetEvent) => {
    const cur = [...e.phases].reverse().find((p) => p.status !== 'completed') ?? e.phases[e.phases.length - 1];
    if (cur) nav.navigate('ResultsEvent', { phaseId: cur.id, ...(cur.status === 'completed' ? { tab: 'sheet' as const } : {}) });
  };

  return (
    <View style={{ gap: theme.spacing(3) }}>
      {canOrganize && (
        <View style={{ gap: theme.spacing(2) }}>
          <Button label={wl ? '＋ Add a bodyweight category' : sport === 'shooting' ? '＋ Add a shooting event' : sport === 'archery' ? '＋ Add an archery event' : crew || sport === 'cycling' ? '＋ Add a race' : '＋ Add an event'} onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId: tournament.id, ...(sport !== 'athletics' ? { sport } : {}) })} />
          {sport === 'athletics' && <Button label="🌳 ＋ Road race, race walk or cross-country" variant="ghost" onPress={() => nav.navigate('AthleticsEventSetup', { tournamentId: tournament.id, mode: 'road' })} />}
          <Button label={swim ? '⚙ Pool, points & timing' : wl ? '⚙ Medals & points' : sport === 'shooting' || sport === 'archery' ? '⚙ Points' : crew ? '⚙ Lanes, points & timing' : '⚙ Points & timing'} variant="ghost" onPress={() => nav.navigate('SportSettings', { sport, tournamentId: tournament.id })} />
        </View>
      )}
      {swimSettings ? (
        <Text style={textStyles.muted}>{courseLabel(swimSettings.course)} · {swimSettings.lanes} lanes{swimSettings.manual ? ' · manual timing' : ''} · World Aquatics seeding (fastest heat last, fastest in the centre lane).</Text>
      ) : null}
      {crewSettings ? (
        <Text style={textStyles.muted}>{crewSettings.lanes} lanes{crewSettings.handTimed ? ' · hand timing' : ' · photo finish (thousandths decide the order)'} · {sport === 'rowing' ? 'World Rowing progression: heats → repechage → (semi-finals →) Finals A / B' : 'ICF progression: heats → semi-finals → Finals A / B'}; places run on from Final A into Final B.</Text>
      ) : null}
      {sport === 'cycling' ? (
        <Text style={textStyles.muted}>UCI rules: time trials by the clock (track to 1/1000), road races by the order on the line with same-time groups, stage races by GC, track sprint in a seeded bracket. Records and PBs per event and distance.</Text>
      ) : null}
      {wlSettings ? (
        <Text style={textStyles.muted}>IWF rules: snatch then clean & jerk, 3 attempts each; equal totals go to whoever lifted the total first. Medals for {wlSettings.liftMedals ? 'the snatch, the clean & jerk and the total' : 'the total'}.</Text>
      ) : null}

      <SectionHeader title="📋 Programme" count={events.length} />
      {loading ? <Text style={textStyles.muted}>Loading…</Text> : events.length === 0 ? (
        <EmptyState icon={words.icon} title="No events yet" compact />
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
                    <Text style={textStyles.muted} numberOfLines={1}>{s.label} · {first?.entries.length ?? 0} {disciplineOf(e.discipline)?.teamSize ? 'teams' : words.athletes}{first?.format.implement ? ` · ${first.format.implement}` : ''}</Text>
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
      <Text style={textStyles.muted}>{pointsLabel(settings.positionPoints)} points per {wl ? `category${wlSettings?.liftMedals ? ' and per lift' : ''}` : 'final'}{settings.relayFactor !== 1 ? `, relays ×${settings.relayFactor}` : ''}; tied places share.</Text>
      <MedalTable rows={table} emptyLabel="No final has finished yet." />

      {leaders.length > 0 && (
        <>
          <SectionHeader title={wl ? '⚡ Best total by category' : sport === 'shooting' ? '⚡ Best match score by event' : sport === 'archery' ? '⚡ Best ranking round by event' : crew ? '⚡ Fastest by event' : '⚡ Best by event'} count={leaders.length} />
          <Card style={{ gap: theme.spacing(2) }}>
            {leaders.map((l) => (
              <TouchableOpacity key={l.eventKey} accessibilityRole="button" disabled={!l.athleteId} onPress={() => l.athleteId && nav.navigate('PlayerProfile', { playerId: l.athleteId })}>
                <View style={st.lead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={textStyles.muted} numberOfLines={1}>{l.title}</Text>
                    <Text style={textStyles.body} numberOfLines={1}>{l.name}{l.team && l.team !== l.name ? <Text style={textStyles.muted}>  {l.team}</Text> : null}</Text>
                  </View>
                  <Text style={st.mark}>{l.text}{wl ? ' kg' : ''}{l.flags.length ? ` ${l.flags.join(' ')}` : ''}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      )}

      {top.length > 0 && (
        <>
          <SectionHeader title={`🌟 Best ${words.athletes} (points)`} count={top.length} />
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
            <Text style={textStyles.muted}>{wl ? 'Position points from every category.' : sport === 'shooting' ? 'Position points from every event (the final, or the match where there is none).' : sport === 'archery' ? 'Position points from every event (match play, or the ranking round where there is none); archers out in the same round share a place.' : crew ? `Position points from single-boat finals (${sport === 'rowing' ? '1x' : 'K1 / C1'}); crew boats score for the house.` : 'Position points from individual finals; relays count for the house.'}</Text>
          </Card>
        </>
      )}

      {sinclair.length > 0 && (
        <>
          <SectionHeader title="⚖️ Best lifters (Sinclair)" count={sinclair.length} />
          <Card style={{ gap: theme.spacing(2) }}>
            {sinclair.map((a, i) => (
              <TouchableOpacity key={a.id} accessibilityRole="button" disabled={!a.athleteId} onPress={() => a.athleteId && nav.navigate('PlayerProfile', { playerId: a.athleteId })}>
                <View style={st.lead}>
                  <Text style={st.rank}>{i + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={textStyles.body} numberOfLines={1}>{a.name}{a.team ? <Text style={textStyles.muted}>  {a.team}</Text> : null}</Text>
                    <Text style={textStyles.muted} numberOfLines={1}>{a.cat} · {a.total} kg at {fmtKg(a.bw)} kg</Text>
                  </View>
                  <Text style={st.mark}>{a.points.toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={textStyles.muted}>Total × the IWF Sinclair coefficient for the bodyweight ({SINCLAIR.period} coefficients).</Text>
          </Card>
        </>
      )}

      <RecordBook title="📖 Meet records" list={records} prefix={eventPrefix(sport)} empty={swim ? 'Set by the first final of each event — 25 m and 50 m pools keep separate records.' : wl ? 'Set by the first session of each bodyweight category — snatch, clean & jerk and total.' : sport === 'shooting' ? 'Qualification / match scores, per event and match length (a final score is not a record).' : sport === 'archery' ? 'Complete ranking rounds, per bow and distance (a match is not a record).' : crew ? 'Set by the first final of each boat class and distance (lightweight and para categories kept apart).' : sport === 'cycling' ? 'Timed events only (time trials, pursuits, the sprint’s flying 200 m), per distance — a road race or bunch race sets no record.' : 'Set by the first final of each event.'} />
      {tournament.hostOrgId ? <RecordBook title="🏫 School records" list={schoolRecords} prefix={eventPrefix(sport)} empty={swim ? "Best times from this organisation's earlier meets appear here, per pool length." : "Best marks from this organisation's earlier meets appear here."} /> : null}
    </View>
  );
}

function RecordBook({ title, list, empty, prefix }: { title: string; list: RecordMark[]; empty: string; prefix: string }) {
  const rows = [...list].filter((r) => r.discipline.startsWith(prefix)).sort((a, b) => a.category.localeCompare(b.category) || LIFT_ORDER.indexOf(a.discipline) - LIFT_ORDER.indexOf(b.discipline) || a.discipline.localeCompare(b.discipline));
  return (
    <>
      <SectionHeader title={title} count={rows.length} />
      {rows.length === 0 ? <Text style={textStyles.muted}>{empty}</Text> : (
        <Card style={{ gap: theme.spacing(2) }}>
          {rows.map((r) => {
            const def = disciplineOf(r.discipline);
            const [age, g, extra] = r.category.split('-');
            const pool = extra === 'LCM' || extra === 'SCM' ? ` (${courseShort(extra)})` : '';
            // SD-97: a weightlifting record is per bodyweight category (and per lift)
            // SD-96: a shorter shooting match ('40sh') is part of the key
            const shotsN = extra && /^\d+sh$/.test(extra) ? Number(extra.slice(0, -2)) : undefined;
            const wc = extra && !pool && shotsN == null ? extra : undefined;
            const unit = def?.unit === 'mass' ? ' kg' : '';
            return (
              <View key={`${r.scope}${r.discipline}${r.category}`} style={st.lead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={textStyles.muted} numberOfLines={1}>{def?.label.replace('Weightlifting total', 'Total')}{pool} {categoryLabel({ age: age === 'open' ? 'Open' : age, gender: g as 'M' | 'F' | 'X', weightClass: wc, ...(shotsN ? { shots: shotsN } : {}) })}{r.date ? ` · ${r.date}` : ''}</Text>
                  <Text style={textStyles.body} numberOfLines={1}>{r.holder}{r.team && r.team !== r.holder ? <Text style={textStyles.muted}>  {r.team}</Text> : null}</Text>
                </View>
                <Text style={st.mark}>{def ? formatMark(r.value, def) : r.value}{unit}</Text>
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
