/** SD-93 — add an athletics combined event to a meet: the category (age group
 *  and Boys / Girls — the men's or women's scoring tables), the event
 *  (decathlon, heptathlon, women's decathlon, indoor heptathlon / pentathlon,
 *  a school pentathlon / tetrathlon, or the house's own list of scorable
 *  events), the order and the day split, the throws' implements, timing, and
 *  the athletes. Creates the first event's start list; each later event is
 *  seeded when the one before is closed. Rendered by AthleticsEventSetupScreen
 *  for `mode: 'combined'`. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { usePlayers, useTournamentById } from '../data/hooks';
import { getTournamentTeams, getTeamRosters } from '../data/repos';
import { createCombinedEvent, type NewEntrant } from '../data/resultsStore';
import {
  AGE_GROUPS, categoryLabel, eligibleFor, meetSettings, COMBINED_PRESETS, SCORABLE, shortName, combinedKey, disciplineOf, implementSpec, hurdleHeight,
  type Category, type CombinedKind, type CombinedTable,
} from '../data/results';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }
const THROWS = ['ath.sp', 'ath.dt', 'ath.jt'];

export function CombinedEventSetup({ tournamentId }: { tournamentId?: string }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const meet = meetSettings(tournament?.formats?.athletics as Record<string, unknown> | undefined);
  const [age, setAge] = useState<string>('U16');
  const [gender, setGender] = useState<CombinedTable>('F');
  const cat: Category = { age, gender };
  const presets = COMBINED_PRESETS.filter((p) => !!p.events[gender]);
  const [kind, setKind] = useState<CombinedKind | 'x'>('pen');
  const preset = kind === 'x' ? undefined : presets.find((p) => p.kind === kind);
  const [events, setEvents] = useState<string[]>([]);
  const [day2, setDay2] = useState<number | null>(null);
  // a new gender / preset: its event list and day split (a preset not offered for this gender → the first that is)
  useEffect(() => {
    if (kind !== 'x' && !presets.some((p) => p.kind === kind)) { setKind(presets[0]?.kind ?? 'x'); return; }
    if (kind === 'x') { setEvents((ev) => ev.filter((d) => SCORABLE[gender].includes(d))); setDay2(null); return; }
    const p = presets.find((x) => x.kind === kind)!;
    setEvents(p.events[gender] ?? []);
    setDay2(p.day2?.[gender] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, gender]);
  const custom = kind === 'x' || (!!preset && JSON.stringify(preset.events[gender]) !== JSON.stringify(events));
  const toggleEvent = (d: string) => setEvents((ev) => (ev.includes(d) ? ev.filter((x) => x !== d) : [...ev, d]));
  const moveUp = (i: number) => setEvents((ev) => { if (i <= 0) return ev; const a = [...ev]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; });
  const key = events.length >= 2 ? combinedKey(kind, gender, events) : null;
  const label = key ? disciplineOf(key)?.label ?? 'Combined event' : 'Combined event';

  // the throws' implements (World Athletics from U18; school / federation practice below — editable)
  const [impl, setImpl] = useState<Record<string, string>>({});
  useEffect(() => {
    setImpl(Object.fromEntries(THROWS.map((d) => [d, implementSpec(d, cat)?.text ?? ''])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [age, gender]);
  const [handTimed, setHandTimed] = useState(meet.handTimed);
  const [noGauge, setNoGauge] = useState(false);

  // Teams / houses (as the other event setups)
  const [sources, setSources] = useState<Source[]>([]);
  useEffect(() => {
    let on = true;
    void (async () => {
      const teams = tournamentId ? await getTournamentTeams(tournamentId) : [];
      const rosters = await getTeamRosters(teams.map((t) => t.id));
      const byName = new Map<string, Source>();
      for (const t of teams) {
        const k = t.name.trim().toLowerCase();
        const cur = byName.get(k);
        const ids = rosters.get(t.id) ?? [];
        if (cur) cur.playerIds = [...new Set([...cur.playerIds, ...ids])];
        else byName.set(k, { key: `t:${t.id}`, name: t.name, colorHex: t.colorHex, teamId: t.id, playerIds: ids });
      }
      for (const p of teams.length ? [] : players) {
        if (!p.houseName) continue;
        const k = p.houseName.trim().toLowerCase();
        const cur = byName.get(k) ?? { key: `h:${k}`, name: p.houseName, colorHex: p.houseColor, playerIds: [] };
        if (!cur.playerIds.includes(p.id)) cur.playerIds.push(p.id);
        byName.set(k, cur);
      }
      if (on) setSources([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => { on = false; };
  }, [tournamentId, players]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const teamOf = (pid: string) => { const s = sources.find((x) => x.playerIds.includes(pid)); return s ? { id: s.teamId, name: s.name, colorHex: s.colorHex } : undefined; };

  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [picks, setPicks] = useState<string[]>([]);
  const fits = (p: Player) => !eligibleOnly || eligibleFor(cat, { gender: p.gender, age: ageOf(p) });
  const pool = useMemo(() => {
    const src = filter ? sources.find((s) => s.key === filter) : undefined;
    const q = query.trim().toLowerCase();
    const base = src ? src.playerIds.map((id) => playerById.get(id)) : q ? players : sources.length ? sources.flatMap((s) => s.playerIds.map((id) => playerById.get(id))) : players;
    const uniq = [...new Map(base.filter((p): p is Player => !!p).map((p) => [p.id, p])).values()];
    return uniq.filter((p) => p.fullName && fits(p) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query, sources, players, playerById, eligibleOnly, gender, age]);
  const toggle = (pid: string) => setPicks((ps) => (ps.includes(pid) ? ps.filter((x) => x !== pid) : [...ps, pid]));
  const nameOf = (pid: string) => playerById.get(pid)?.fullName ?? 'Athlete';

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setError(null);
    if (events.length < 2) { setError('Pick at least two events.'); return; }
    if (!picks.length) { setError('Add at least one athlete.'); return; }
    const list: NewEntrant[] = picks.map((pid) => ({ playerId: pid, name: nameOf(pid), team: teamOf(pid) }));
    const implements_ = Object.fromEntries(Object.entries(impl).filter(([d, v]) => events.includes(d) && v.trim()).map(([d, v]) => [d, v.trim()]));
    setBusy(true);
    try {
      const ev = await createCombinedEvent({
        kind: custom ? 'x' : kind, table: gender, events, ...(day2 != null && day2 > 0 && day2 < events.length ? { day2 } : {}), category: cat,
        tournamentId, entrants: list, implements: implements_, handTimed, noWindGauge: noGauge, title: `${label} ${categoryLabel(cat)}`,
      });
      nav.replace('ResultsEvent', { phaseId: ev.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const hurdles = events.find((d) => /mh$/.test(d));
  const hh = hurdles ? hurdleHeight(hurdles, cat) : undefined;
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🏅 New combined event" subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Category</Text>
          <View style={st.wrap}>{AGE_GROUPS.map((a) => <SelectChip key={a} label={a} active={age === a} onPress={() => setAge(a)} />)}</View>
          <View style={st.wrap}>
            <SelectChip label="Boys / Men" active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label="Girls / Women" active={gender === 'F'} onPress={() => setGender('F')} />
          </View>
          <Text style={textStyles.muted}>Scored on the World Athletics {gender === 'M' ? 'men’s' : 'women’s'} Combined Events tables — the same tables at every age; younger groups use lighter implements and lower hurdles.</Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · Event</Text>
          <View style={st.wrap}>
            {presets.map((p) => <SelectChip key={p.kind} label={p.label} active={kind === p.kind} onPress={() => setKind(p.kind)} />)}
            <SelectChip label="✎ House’s own list" active={kind === 'x'} onPress={() => setKind('x')} />
          </View>
          {preset && kind !== 'x' ? <Text style={textStyles.muted}>{preset.note}</Text> : <Text style={textStyles.muted}>Tap events in the order they are held (2–10). Only events the scoring tables cover can be picked.</Text>}
          <Text style={st.label}>Order</Text>
          {events.length === 0 ? <Text style={textStyles.muted}>No events yet.</Text> : events.map((d, i) => (
            <View key={d} style={st.row}>
              <Text style={[textStyles.body, { flex: 1 }]}>{day2 != null && i === day2 ? '— Day 2 —\n' : ''}{i + 1}. {disciplineOf(d)?.label ?? shortName(d)}{THROWS.includes(d) && impl[d] ? ` (${impl[d]})` : ''}</Text>
              {i > 0 && <SelectChip label="↑" active={false} onPress={() => moveUp(i)} />}
              <SelectChip label="✕" active={false} onPress={() => toggleEvent(d)} />
            </View>
          ))}
          <Text style={st.label}>Add / remove events</Text>
          <View style={st.wrap}>
            {SCORABLE[gender].map((d) => <SelectChip key={d} label={`${events.includes(d) ? '✓ ' : ''}${shortName(d)}`} active={events.includes(d)} disabled={!events.includes(d) && events.length >= 10} onPress={() => toggleEvent(d)} />)}
          </View>
          {custom && events.length >= 2 ? <Text style={textStyles.muted}>Not the standard list — kept as “{label}” with its own records and bests.</Text> : null}
          <Text style={st.label}>Days</Text>
          <View style={st.wrap}>
            <SelectChip label="One day" active={day2 == null} onPress={() => setDay2(null)} />
            {events.length >= 4 && events.slice(1).map((_, i) => i + 1).filter((i) => i >= 2 && i <= events.length - 2).map((i) => (
              <SelectChip key={i} label={`Day 2 from ${i + 1}. ${shortName(events[i])}`} active={day2 === i} onPress={() => setDay2(i)} />
            ))}
          </View>
          <Text style={textStyles.muted}>TR 39: at least 30 minutes between one event and the next for each athlete; two-day events on consecutive days.</Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · Implements & timing</Text>
          {THROWS.filter((d) => events.includes(d)).map((d) => (
            <View key={d} style={st.row}>
              <Text style={[st.label, { width: 90 }]}>{shortName(d)}</Text>
              <TextInput style={[st.input, { flex: 1 }]} value={impl[d] ?? ''} onChangeText={(v) => setImpl((m) => ({ ...m, [d]: v }))} placeholder="e.g. 3 kg" placeholderTextColor={theme.colors.textMuted} accessibilityLabel={`${shortName(d)} implement`} />
            </View>
          ))}
          {THROWS.some((d) => events.includes(d)) ? <Text style={textStyles.muted}>{['U18', 'U20', 'Open'].includes(age) ? 'World Athletics implements for the category.' : 'School / federation practice for the category — check yours.'}</Text> : null}
          {hurdles ? <Text style={textStyles.muted}>{shortName(hurdles)}: {hh ? `hurdles ${hh} (World Athletics ${categoryLabel(cat)})` : 'hurdle height per your federation / school board'}.</Text> : null}
          <SelectChip label={handTimed ? '✓ Hand-timed meet (stopwatches)' : 'Fully automatic timing'} active={handTimed} onPress={() => setHandTimed(!handTimed)} />
          <Text style={textStyles.muted}>{handTimed ? 'Hand times are scored after the usual conversion (+0.24 s up to 200 m and the sprint hurdles, +0.14 s for 400 m).' : 'A time marked “hand” is converted before scoring and the total can’t be a record.'}</Text>
          <SelectChip label={noGauge ? '✓ No wind gauge' : 'Wind gauge in use'} active={noGauge} onPress={() => setNoGauge(!noGauge)} />
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>4 · Athletes ({picks.length})</Text>
          <View style={st.wrap}>
            <SelectChip label="All" active={filter == null} onPress={() => setFilter(null)} />
            {sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={filter === s.key} onPress={() => setFilter(s.key)} />)}
          </View>
          <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder="Search any player by name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search players" />
          <SelectChip label={eligibleOnly ? `✓ ${categoryLabel(cat)} only` : 'Showing everyone'} active={eligibleOnly} onPress={() => setEligibleOnly(!eligibleOnly)} />
          <View style={st.wrap}>
            {pool.map((p) => {
              const on = picks.includes(p.id);
              return <SelectChip key={p.id} label={`${on ? '✓ ' : ''}${p.fullName}`} dotColor={p.houseColor} active={on} onPress={() => toggle(p.id)} />;
            })}
            {!pool.length && <Text style={textStyles.muted}>No athletes match. Players without a gender or date of birth are always shown.</Text>}
          </View>
        </Card>

        <FormError message={error} />
        <Text style={textStyles.muted}>{events.length ? `${label} ${categoryLabel(cat)}: ${events.map(shortName).join(', ')}.` : ''} Each event is entered on the usual track / field screen; the running total and places update after every event.</Text>
        <Button label={busy ? 'Creating…' : `Create ${label.toLowerCase()} & first start list`} onPress={() => void create()} disabled={busy || !picks.length || events.length < 2} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(12) },
  card: { gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
});
