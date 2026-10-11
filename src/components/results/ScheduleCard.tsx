/** SD-129 — "When & where" on an event-setup screen: the day and time of every
 *  round (heats → final, a combined event's disciplines, a stage race's
 *  stages) and the venue area. Defaults: the first free slot in that area on
 *  the chosen day, later rounds with the usual gaps (a morning round's final
 *  the same afternoon, a combined event's day 2 the next morning). Warns when
 *  a picked athlete is in another event too close to round 1. Only shown in a
 *  meet (a tournament); the organiser can switch it off ("time not set"). */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import { useMeet } from '../../data/useAthletics';
import { useTournamentById } from '../../data/hooks';
import { timetableSettings } from '../../data/timetableStore';
import {
  atOf, buildTimetable, clashesFor, dayKey, dayLabel, defaultArea, disciplineOf, estMinutes, fromDayKey, hhmm, nextFreeSlot,
  planLabels, sessionOf, suggestRounds, timetableDays, SESSION_LABEL, type PhaseKind, type PhaseSched,
} from '../../data/results';

export interface ScheduleState { value?: PhaseSched; startsAt: string; set: (s?: PhaseSched) => void }

/** The setup screen's schedule: pass `startsAt` and `sched: value` to createResultsEvent. */
export function useSchedule(): ScheduleState {
  const [value, set] = useState<PhaseSched | undefined>();
  const first = value?.rounds.find((r) => r.phaseNo === 1)?.at;
  return { value, startsAt: first ?? new Date().toISOString(), set };
}

interface Row { day: string; time: string }

export function ScheduleCard({ state, tournamentId, discipline, plan, combined, stage, athleteIds }: {
  state: ScheduleState;
  tournamentId?: string;
  discipline: string;
  plan?: { phase: PhaseKind; heats: number }[];
  combined?: { events: string[]; day2?: number };
  stage?: boolean;
  athleteIds?: string[];
}) {
  const tournament = useTournamentById(tournamentId);
  const { events, loading } = useMeet(tournamentId, undefined, 'all');
  const items = useMemo(() => buildTimetable(events), [events]);
  const def = disciplineOf(combined?.events[0] ?? discipline);
  const labels = useMemo(() => planLabels(discipline, plan, combined?.events), [discipline, plan, combined?.events]);
  const n = labels.length;
  const clashMins = timetableSettings(tournament).clashMins;
  const days = useMemo(() => {
    const ds = timetableDays(items, tournament ? { start: tournament.startDate, end: tournament.endDate } : undefined).map((d) => d.day);
    const today = dayKey(new Date());
    if (!ds.length) ds.push(today);
    const after = fromDayKey(ds[ds.length - 1]); after.setDate(after.getDate() + 1);
    return [...ds, dayKey(after)];
  }, [items, tournament]);

  const [on, setOn] = useState(true);
  const [area, setArea] = useState(defaultArea(def));
  const [rows, setRows] = useState<Row[]>([]);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setArea(defaultArea(def)); }, [def?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggested slots (until the organiser edits one).
  const shape = `${n}|${(plan ?? []).map((p) => p.phase).join(',')}|${combined?.day2 ?? ''}|${stage ? 1 : 0}`;
  useEffect(() => {
    if (touched || loading || !tournamentId) return;
    const today = dayKey(new Date());
    const day = days.includes(today) ? today : days[0];
    const first = nextFreeSlot(items, day, area, estMinutes(def, plan?.[0]?.heats ?? 1, !!combined));
    const ats = suggestRounds(first, (plan?.length ? plan : [{ phase: 'final' as PhaseKind, heats: 1 }]).slice(0, n), {
      combined, stage, minutes: (plan ?? []).map((p) => estMinutes(def, p.heats)),
    });
    while (ats.length < n) ats.push(ats[ats.length - 1]);
    setRows(ats.slice(0, n).map((a) => ({ day: dayKey(a), time: hhmm(a) })));
  }, [shape, loading, tournamentId, area, items.length, days.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const ats = rows.map((r) => atOf(r.day, r.time));
  useEffect(() => {
    if (!on || !tournamentId || !rows.length) { state.set(undefined); return; }
    const rounds = ats.flatMap((at, i) => (at ? [{ phaseNo: i + 1, at, ...(area.trim() ? { area: area.trim() } : {}) }] : []));
    state.set(rounds.length ? { rounds } : undefined);
  }, [on, tournamentId, area, ats.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const athletes = useMemo(() => {
    const names = new Map(items.flatMap((i) => i.athletes.map((a) => [a.id, a.name] as const)));
    return (athleteIds ?? []).map((id) => ({ id, name: names.get(id) ?? 'Athlete' }));
  }, [athleteIds, items]);
  const clash = on && ats[0] ? clashesFor(athletes, ats[0], estMinutes(def, plan?.[0]?.heats ?? 1, !!combined), items, clashMins) : [];

  if (!tournamentId) return null;
  const edit = (i: number, patch: Partial<Row>) => { setTouched(true); setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); };
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>🗓 When & where</Text>
      <SelectChip label={on ? '✓ On the meet timetable' : 'Time not set yet'} active={on} onPress={() => setOn(!on)} />
      {on ? (
        <>
          <View style={st.row}>
            <Text style={[st.label, { flex: 1 }]}>Area</Text>
            <TextInput style={[st.input, { width: 170 }]} value={area} onChangeText={(t) => { setTouched(true); setArea(t); }} placeholder="Track, Jumps pit, Pool…" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Venue area" />
          </View>
          {rows.map((r, i) => {
            const at = ats[i];
            return (
              <View key={i} style={{ gap: theme.spacing(1) }}>
                <View style={st.row}>
                  <Text style={[st.label, { flex: 1 }]} numberOfLines={1}>{labels[i]}</Text>
                  <TextInput style={[st.input, { width: 76 }]} value={r.time} onChangeText={(t) => edit(i, { time: t })} placeholder="09:30" placeholderTextColor={theme.colors.textMuted}
                    keyboardType="numbers-and-punctuation" accessibilityLabel={`Start time for ${labels[i]}`} />
                </View>
                <DayStepper days={days} value={r.day} onChange={(d) => edit(i, { day: d })} />
                {at ? <Text style={textStyles.muted}>{SESSION_LABEL[sessionOf(at)]} session</Text> : <Text style={st.warn}>Type a time like 09:30.</Text>}
              </View>
            );
          })}
          {clash.length ? (
            <Text style={st.warn}>⚠ {clash.slice(0, 4).map((c) => `${c.name}: ${c.other.eventTitle} ${c.other.roundLabel} at ${hhmm(c.other.at)}${c.gap < 0 ? ' (overlaps)' : ` (${c.gap} min apart)`}`).join(' · ')}{clash.length > 4 ? ` · +${clash.length - 4} more` : ''} — less than {clashMins} min between events.</Text>
          ) : null}
          <Text style={textStyles.muted}>Suggested from the next free slot{area ? ` at the ${area.toLowerCase()}` : ''}; later rounds follow the usual gaps. Each round takes its time when it's created. Change any of it on the Timetable.</Text>
        </>
      ) : <Text style={textStyles.muted}>The event goes under “Time to be announced” on the timetable until you set its time there.</Text>}
    </Card>
  );
}

/** ‹ Day 2 · Fri 13 Nov › — one line however long the meet is. */
export function DayStepper({ days, value, onChange }: { days: string[]; value: string; onChange: (d: string) => void }) {
  const all = days.includes(value) ? days : [...days, value].sort();
  const i = all.indexOf(value);
  return (
    <View style={st.row}>
      <SelectChip label="‹" active={false} disabled={i <= 0} onPress={() => i > 0 && onChange(all[i - 1])} />
      <Text style={[st.label, { flex: 1, textAlign: 'center' }]} accessibilityLabel={`Day ${i + 1}, ${dayLabel(value)}`}>Day {i + 1} · {dayLabel(value)}</Text>
      <SelectChip label="›" active={false} disabled={i >= all.length - 1} onPress={() => i < all.length - 1 && onChange(all[i + 1])} />
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.5), alignItems: 'center' },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  warn: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
});
