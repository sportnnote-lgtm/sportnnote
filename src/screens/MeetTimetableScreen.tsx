/** SD-129 — a meet's timetable: day tabs, morning / afternoon / evening
 *  sessions with every round (heats, finals, flights) at its time and area,
 *  what's on now and next, "running late" for the rest of a session, athletes
 *  doubling up too close together, and the printable sheets (timetable, start
 *  lists / heat sheets, field cards, results, house table) for a day. */
import { useMeetZone } from '../data/useMeetZone';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, LoadingState, Pill, ScreenTitle, SelectChip, textStyles } from '../components/ui';
import { SectionHeader } from '../components/SectionHeader';
import { askConfirm } from '../components/ConfirmSheet';
import type { RootStackParamList } from '../navigation/types';
import { useAuth } from '../core/auth';
import { canOrganize } from '../core/roles';
import { canManageTournament } from '../core/org';
import { useTournamentById, useOrganizations } from '../data/hooks';
import { getPlayers, getMyPlayerId } from '../data/repos';
import { getMeet } from '../data/resultsStore';
import { applySlot, applySlots, saveTimetableSettings, timetableSettings } from '../data/timetableStore';
import { medalStandings } from '../data/medalStandings';
import {
  buildTimetable, timetableDays, unscheduled, nowNext, shiftSession, findClashes, hhmm, dayKey, atOf, SESSION_LABEL,
  timetableText, timetableSheet, medalTableSheet, meetFieldResults, eventMeetSettings, disciplineOf, phaseDiscipline, sessionOf,
  startListSheet, fieldCardSheet, resultsSheet, pointsLabel,
  type MeetEvent, type TimetableItem, type SlotChange,
} from '../data/results';
import { meetHeaderOf, printDoc, phasePrintInfo, hasCard, bookletRanking, bookletOk } from '../components/results/printPhase';
import { canPrint } from '../core/printSheet';
import { DayStepper } from '../components/results/ScheduleCard';
import { shareMessage } from '../core/share';
import { useParamState } from '../navigation/useParamState';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const CLASH_CHOICES = [0, 15, 30, 45, 60];
const LATE = [10, 15, 30];

export default function MeetTimetableScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'MeetTimetable'>>();
  const tournamentId = params?.tournamentId;
  const tournament = useTournamentById(tournamentId);
  // SD-154: the timetable reads in the venue's zone (the tournament's), not the phone's
  const mz = useMeetZone(tournament);
  const { profile } = useAuth();
  const orgs = useOrganizations();
  const [me, setMe] = useState<string | null>(null);
  const [events, setEvents] = useState<MeetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!tournamentId) { setLoading(false); return; }
    try {
      const ps = await getPlayers();
      const names = new Map(ps.map((p) => [p.id, p.fullName]));
      setEvents(await getMeet(tournamentId, (id) => names.get(id) ?? 'Athlete', 'all'));
      setNow(new Date());
      void getMyPlayerId(profile?.id).then(setMe).catch(() => {});
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [tournamentId, profile?.id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const canEdit = canOrganize(profile?.role) || (!!tournament && canManageTournament(tournament, orgs, me));
  const items = useMemo(() => buildTimetable(events), [events, mz.zone]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => timetableDays(items, tournament ? { start: tournament.startDate, end: tournament.endDate } : undefined), [items, tournament]);
  const tbd = useMemo(() => unscheduled(items), [items]);
  const today = dayKey(now);
  const [dayParam, setDay] = useParamState<string>('day', '');
  const day = days.find((d) => d.day === dayParam) ?? days.find((d) => d.day === today) ?? days[0];
  const nn = useMemo(() => nowNext(items, now), [items, now]);
  const settings = timetableSettings(tournament);
  const [clashMins, setClashMins] = useState<number | null>(null);
  const gap = clashMins ?? settings.clashMins;
  const clashes = useMemo(() => (gap > 0 ? findClashes(items, gap) : []), [items, gap]);
  const dayClashes = clashes.filter((c) => day && dayKey(c.a.at) === day.day);
  const header = meetHeaderOf(tournament);
  const [editing, setEditing] = useState<string | null>(null);

  const open = (i: TimetableItem) => { if (i.phaseId) nav.navigate('ResultsEvent', { phaseId: i.phaseId, ...(i.status === 'completed' ? { tab: 'sheet' as const } : {}) }); };

  const late = async (from: TimetableItem, mins: number) => {
    const changes = shiftSession(items, from, mins);
    if (!changes.length) return;
    const ok = await askConfirm({
      title: `Running late +${mins} min?`,
      message: `${changes.length} round${changes.length === 1 ? '' : 's'} from ${from.eventTitle} (${hhmm(from.at)}) to the end of the ${SESSION_LABEL[from.session].toLowerCase()} session move ${mins} min later.`,
      yesLabel: `Yes, move ${changes.length}`, noLabel: 'No, keep times', tone: 'caution',
    });
    if (!ok) return;
    try { await applySlots(changes); setNote(`Moved ${changes.length} round${changes.length === 1 ? '' : 's'} +${mins} min.`); await load(); } catch (e) { setError((e as Error).message); }
  };
  const saveSlot = async (c: SlotChange) => {
    try { await applySlot(c); setEditing(null); await load(); } catch (e) { setError((e as Error).message); }
  };
  const saveGap = async (m: number) => {
    setClashMins(m);
    if (tournamentId) await saveTimetableSettings(tournamentId, { clashMins: m }).catch((e) => setError((e as Error).message));
  };

  // ---- printing ----
  const say = (o: string) => { if (o === 'failed') setNote(canPrint() ? 'Could not open the print view.' : 'Printing needs the latest app — the sheet was not printed.'); };
  const dayPhases = (kind: 'start' | 'card' | 'results') => {
    if (!day) return [];
    const its = items.filter((i) => i.phaseId && i.set && dayKey(i.at) === day.day);
    return its.flatMap((i) => {
      const ev = events.find((e) => e.eventKey === i.eventKey);
      const p = ev?.phases.find((x) => x.id === i.phaseId);
      const info = p && phasePrintInfo(p, i.eventTitle, { at: i.at, area: i.area });
      if (!p || !info) return [];
      if (kind === 'card' && !hasCard(info.def)) return [];
      if (kind === 'results') {
        if (p.status === 'scheduled' || !bookletOk(p.format, info.def)) return [];
        const r = bookletRanking(p.format, info.def, p.entries);
        return [resultsSheet(info, r.heats, { overall: r.overall, official: p.status === 'completed' })];
      }
      return [kind === 'card' ? fieldCardSheet(info, p.entries) : startListSheet(info, p.entries)];
    });
  };
  const printDay = async (kind: 'start' | 'card' | 'results') => {
    const sheets = dayPhases(kind);
    if (!sheets.length) { setNote(kind === 'card' ? 'No field events with a start list on this day.' : kind === 'results' ? 'No results on this day yet.' : 'No start lists on this day yet.'); return; }
    const what = kind === 'start' ? 'Start lists' : kind === 'card' ? 'Field cards' : 'Results';
    say(await printDoc(`${what} — ${day?.label ?? ''}`, header, sheets, { landscape: kind === 'card' }));
  };
  const printTimetable = async () => {
    const o = await printDoc('Timetable', header, [timetableSheet(days, { unscheduled: tbd })]);
    if (o === 'failed' && day) void shareMessage(timetableText(header.name, day), 'tournament');
  };
  const printTable = async () => {
    const bySport = new Map<string, MeetEvent[]>();
    for (const e of events) { const s = disciplineOf(e.discipline)?.sport ?? 'athletics'; bySport.set(s, [...(bySport.get(s) ?? []), e]); }
    const inputs = [...bySport].flatMap(([s, evs]) => {
      const m = eventMeetSettings(s, tournament?.formats?.[s as never] as Record<string, unknown> | undefined);
      return meetFieldResults(evs, { positionPoints: m.positionPoints, relayFactor: m.relayFactor, liftMedals: m.liftMedals });
    });
    const rows = medalStandings([], [], { mode: 'position' }, undefined, inputs);
    const m = eventMeetSettings('athletics', tournament?.formats?.athletics as Record<string, unknown> | undefined);
    say(await printDoc('House table', header, [medalTableSheet(rows, { note: `${pointsLabel(m.positionPoints)} points per final; tied places share.` })]));
  };

  if (loading) return <LoadingState />;
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🗓 Timetable" subtitle={tournament?.name} />
        <Text style={textStyles.muted}>Times are {mz.short} — the venue's local time.</Text>

        {(nn.now.length > 0 || nn.next) && (
          <Card style={{ gap: theme.spacing(2) }}>
            {nn.now.map((i) => (
              <TouchableOpacity key={i.key} accessibilityRole="button" onPress={() => open(i)} style={st.nn}>
                <Pill label="NOW" color={theme.colors.danger} textColor="#fff" />
                <Text style={[textStyles.body, st.bold, { flex: 1 }]} numberOfLines={1}>{i.eventTitle} — {i.roundLabel}</Text>
                <Text style={textStyles.muted}>{i.area ?? ''}</Text>
              </TouchableOpacity>
            ))}
            {nn.next && (
              <TouchableOpacity accessibilityRole="button" onPress={() => open(nn.next!)} style={st.nn}>
                <Pill label={`NEXT ${hhmm(nn.next.at)}`} />
                <Text style={[textStyles.body, st.bold, { flex: 1 }]} numberOfLines={1}>{nn.next.eventTitle} — {nn.next.roundLabel}</Text>
                <Text style={textStyles.muted}>{nn.next.area ?? ''}</Text>
              </TouchableOpacity>
            )}
          </Card>
        )}

        {days.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabs}>
            {days.map((d) => <SelectChip key={d.day} label={`${d.label}${d.day === today ? ' · today' : ''}`} active={d.day === day?.day} onPress={() => setDay(d.day)} />)}
          </ScrollView>
        ) : null}
        <FormError message={error} />
        {note ? <Text style={textStyles.muted}>{note}</Text> : null}

        {!day || !day.sessions.length ? (
          <Text style={textStyles.muted}>{items.length ? 'Nothing is scheduled on this day.' : 'No events yet — add events from the meet page; each one asks for its day and time.'}</Text>
        ) : day.sessions.map((s) => {
          const first = s.items.find((i) => (i.status === 'scheduled' || i.status === 'planned') && i.at >= (dayKey(now) === day.day ? new Date(now.getTime() - 60 * 60000).toISOString() : '')) ?? s.items.find((i) => i.status === 'scheduled' || i.status === 'planned');
          return (
            <View key={s.session} style={{ gap: theme.spacing(2) }}>
              <SectionHeader title={`${s.session === 'AM' ? '🌅' : s.session === 'PM' ? '☀️' : '🌙'} ${SESSION_LABEL[s.session]}`} count={s.items.length} />
              {canEdit && first ? (
                <View style={st.wrap}>
                  <Text style={textStyles.muted}>Running late?</Text>
                  {LATE.map((m) => <SelectChip key={m} label={`+${m} min`} active={false} onPress={() => void late(first, m)} />)}
                </View>
              ) : null}
              {s.items.map((i) => (
                <View key={i.key}>
                  <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={() => open(i)} disabled={!i.phaseId}>
                    <View style={st.row}>
                      <Text style={st.time}>{hhmm(i.at)}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[textStyles.body, st.bold]} numberOfLines={1}>{i.eventTitle}</Text>
                        <Text style={textStyles.muted} numberOfLines={1}>{i.roundLabel}{i.heats > 1 ? ` · ${i.heats} ${i.phase === 'qualification' ? 'groups' : 'heats'}` : ''}{i.area ? ` · ${i.area}` : ''}{i.entries ? ` · ${i.entries}` : ''}</Text>
                      </View>
                      <Pill label={i.status === 'completed' ? 'DONE' : i.status === 'live' ? 'LIVE' : i.status === 'planned' ? 'PLANNED' : 'START LIST'}
                        color={i.status === 'live' ? theme.colors.danger : theme.colors.surfaceAlt} textColor={i.status === 'live' ? '#fff' : theme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                  {canEdit && i.status !== 'completed' ? (
                    editing === i.key ? <SlotEditor item={i} days={days.map((d) => d.day)} onCancel={() => setEditing(null)} onSave={(c) => void saveSlot(c)} />
                      : <Text style={st.link} onPress={() => setEditing(i.key)}>Change time / area</Text>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}

        {tbd.length > 0 && (
          <>
            <SectionHeader title="⏳ Time to be announced" count={tbd.length} />
            <Text style={textStyles.muted}>Events added before the timetable existed, or without a time.</Text>
            {tbd.map((i) => (
              <View key={i.key} style={{ gap: theme.spacing(1) }}>
                <TouchableOpacity accessibilityRole="button" onPress={() => open(i)}>
                  <View style={st.row}>
                    <Text style={st.time}>--:--</Text>
                    <Text style={[textStyles.body, st.bold, { flex: 1 }]} numberOfLines={1}>{i.eventTitle} — {i.roundLabel}</Text>
                  </View>
                </TouchableOpacity>
                {canEdit && i.status !== 'completed' ? (editing === i.key
                  ? <SlotEditor item={i} days={days.length ? days.map((d) => d.day) : [today]} onCancel={() => setEditing(null)} onSave={(c) => void saveSlot(c)} />
                  : <Text style={st.link} onPress={() => setEditing(i.key)}>Set time</Text>) : null}
              </View>
            ))}
          </>
        )}

        <SectionHeader title="⚠️ Doubling up" count={clashes.length} />
        {canEdit ? (
          <View style={st.wrap}>
            <Text style={textStyles.muted}>Warn below</Text>
            {CLASH_CHOICES.map((m) => <SelectChip key={m} label={m ? `${m} min` : 'Off'} active={gap === m} onPress={() => void saveGap(m)} />)}
          </View>
        ) : null}
        {gap === 0 ? <Text style={textStyles.muted}>Clash warnings are off.</Text> : !clashes.length ? <Text style={textStyles.muted}>No athlete has two events less than {gap} min apart.</Text> : (
          <Card style={{ gap: theme.spacing(2) }}>
            {(dayClashes.length ? dayClashes : clashes).slice(0, 30).map((c, k) => (
              <View key={`${c.athleteId}${c.a.key}${c.b.key}${k}`}>
                <Text style={[textStyles.body, st.bold]}>{c.name}</Text>
                <Text style={textStyles.muted}>{hhmm(c.a.at)} {c.a.eventTitle} {c.a.roundLabel} → {hhmm(c.b.at)} {c.b.eventTitle} {c.b.roundLabel} · {c.gap < 0 ? `overlaps by ${-c.gap} min` : `${c.gap} min between`}</Text>
              </View>
            ))}
            <Text style={textStyles.muted}>Times are from the end of the first event (estimated) to the start of the next. Field-event athletes may be excused to compete elsewhere (TR 25.17).</Text>
          </Card>
        )}

        <SectionHeader title="🖨 Print sheets" />
        <Card style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.muted}>A4, with the meet's name{tournament?.logoUrl ? ' and logo' : ''}. {canPrint() ? 'On a computer: Print, or "Save as PDF".' : 'Printing needs the latest app — until then the timetable is shared as text.'}</Text>
          <Button label="🗓 Timetable (all days)" variant="ghost" onPress={() => void printTimetable()} />
          {day ? (
            <>
              <Button label={`🏁 Start lists & heat sheets · Day ${day.index + 1}`} variant="ghost" onPress={() => void printDay('start')} />
              <Button label={`📝 Field-event cards · Day ${day.index + 1}`} variant="ghost" onPress={() => void printDay('card')} />
              <Button label={`📋 Results · Day ${day.index + 1}`} variant="ghost" onPress={() => void printDay('results')} />
            </>
          ) : null}
          <Button label="🏅 House table" variant="ghost" onPress={() => void printTable()} />
          {day ? <Button label="📤 Share this day's timetable" variant="ghost" onPress={() => void shareMessage(timetableText(header.name, day), 'tournament')} /> : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Change one round's day, time and area. */
function SlotEditor({ item, days, onSave, onCancel }: { item: TimetableItem; days: string[]; onSave: (c: SlotChange) => void; onCancel: () => void }) {
  const [day, setDay] = useState(item.set ? dayKey(item.at) : days[0]);
  const [time, setTime] = useState(item.set ? hhmm(item.at) : '09:00');
  const [area, setArea] = useState(item.area ?? '');
  const at = atOf(day, time);
  return (
    <Card style={{ gap: theme.spacing(2), marginTop: theme.spacing(1) }}>
      <DayStepper days={days} value={day} onChange={setDay} />
      <View style={st.wrap}>
        <TextInput style={[st.input, { width: 80 }]} value={time} onChangeText={setTime} placeholder="09:30" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Start time" keyboardType="numbers-and-punctuation" />
        <TextInput style={[st.input, { flex: 1, minWidth: 120 }]} value={area} onChangeText={setArea} placeholder="Area (Track, Pool…)" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Area" />
      </View>
      {!at ? <Text style={st.warn}>Type a time like 09:30.</Text> : <Text style={textStyles.muted}>{SESSION_LABEL[sessionOf(at)]} session</Text>}
      <View style={st.wrap}>
        <Button label="Save" disabled={!at} onPress={() => at && onSave({ key: item.key, phaseId: item.phaseId, lastPhaseId: item.lastPhaseId, eventKey: item.eventKey, phaseNo: item.phaseNo, at, ...(area.trim() ? { area: area.trim() } : {}) })} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(12) },
  tabs: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  nn: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  time: { color: theme.colors.text, fontWeight: '800', fontVariant: ['tabular-nums'], width: 48 },
  bold: { fontWeight: '800' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingVertical: theme.spacing(1), paddingLeft: theme.spacing(1) },
  warn: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
});
