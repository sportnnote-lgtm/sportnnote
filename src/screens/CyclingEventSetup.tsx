/** SD-98 — add a cycling race to a meet: road (individual time trial, road
 *  race, stage race) or track (individual pursuit, time trial, sprint, keirin,
 *  scratch, points race, elimination race); the distance / laps / sprints /
 *  start interval / stages; the age group and gender; the riders from the
 *  tournament's teams / houses or any player; and the rounds (pursuit
 *  qualifying → finals, sprint qualifying → match play, keirin heats → final).
 *  Start order is drawn. Rendered by AthleticsEventSetupScreen for sport 'cycling'. */
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
import { createResultsEvent, type NewEntrant } from '../data/resultsStore';
import {
  CYC_EVENTS, categoryLabel, eligibleFor, cycPlan, describeCycPlan, sprintFields, defaultSprintField, sprintCount, cycMeetSettings,
  type CycKind, type Category, type CycFormat,
} from '../data/results';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }

const AGES: { key: string; label: string; note: string }[] = [
  { key: 'U12', label: 'U12', note: 'school' },
  { key: 'U14', label: 'U14', note: 'school (UCI has no category under 17 — the national federation / school board sets gears and distances)' },
  { key: 'U16', label: 'U16', note: 'school / national youth' },
  { key: 'Junior', label: 'Junior (U19)', note: 'UCI Junior: 17–18 in the year' },
  { key: 'U23', label: 'U23', note: 'UCI under 23' },
  { key: 'Senior', label: 'Elite', note: 'UCI elite (open age)' },
  { key: 'Masters', label: 'Masters', note: 'UCI masters (30+)' },
];
const ROAD: CycKind[] = ['itt', 'rr', 'stage'];
const TRACK: CycKind[] = ['ip', 'tt', 'sprint', 'keirin', 'scratch', 'points', 'elim'];
const KIND_LABEL: Record<CycKind, string> = {
  itt: 'Time trial (ITT)', rr: 'Road race', stage: 'Stage race', ip: 'Individual pursuit', tt: 'Time trial (500 m / kilo)', sprint: 'Sprint',
  keirin: 'Keirin', scratch: 'Scratch race', points: 'Points race', elim: 'Elimination race',
};
const KIND_NOTE: Record<CycKind, string> = {
  itt: 'Riders start alone at intervals; the fastest time wins (to 1/100, a transponder / photo reading to 1/1000 splits a tie).',
  rr: 'Mass start; the order on the line decides. Riders finishing in a group get the group’s time (s.t.); a gap of 1 s or more starts a new group.',
  stage: 'One race over several stages (road stages and time trials); the general classification (GC) is the cumulative time, minus time bonuses.',
  ip: 'Two riders start on opposite sides of the track. Qualifying on time; the two fastest ride for gold, 3rd and 4th for bronze. A catch ends the race.',
  tt: 'One rider at a time from a standing start; the fastest time wins (to 1/1000).',
  sprint: 'A flying 200 m time seeds the riders; then match play — best of three heats, first to two goes through; the semi-final losers race for bronze.',
  keirin: 'Riders follow a pacer for the first laps, then sprint; the order on the line decides. More than 7 riders: heats, then a final.',
  scratch: 'Everyone starts together; first over the line after the set laps wins. A rider who gains a lap ranks ahead of the bunch.',
  points: 'Sprints every N laps score 5-3-2-1 (the finish double: 10-6-4-2); a lap gained +20, a lap lost −20. Most points wins.',
  elim: 'Every second lap the last rider over the line is out, until two sprint for the win.',
};

export function CyclingEventSetup({ tournamentId }: { tournamentId?: string }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const [setting, setSetting] = useState<'road' | 'track'>('road');
  const [kind, setKind] = useState<CycKind>('itt');
  useEffect(() => { setKind(setting === 'road' ? 'itt' : 'ip'); }, [setting]);
  const [dist, setDist] = useState<Record<string, number>>({ itt: 10, ip: 3000, tt: 1000 });
  const [km, setKm] = useState('');
  const [laps, setLaps] = useState('');
  const [every, setEvery] = useState('');
  const [interval, setStartGap] = useState(60);
  const [stages, setStages] = useState<('road' | 'itt')[]>(['road', 'itt', 'road']);
  const [bo, setBo] = useState<1 | 3>(3);
  const [age, setAge] = useState('U16');
  const [gender, setGender] = useState<'M' | 'F' | 'X'>('M');
  const cat: Category = { age, gender };
  const adult = ['Junior', 'U23', 'Senior', 'Masters'].includes(age);

  const ev = CYC_EVENTS.find((e) => e.kind === kind && (e.metres == null || kind === 'sprint' || e.metres === (kind === 'itt' ? (dist.itt ?? 10) * 1000 : dist[kind]))) ?? CYC_EVENTS.find((e) => e.kind === kind)!;

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
  const pool = useMemo(() => {
    const src = filter ? sources.find((s) => s.key === filter) : undefined;
    const q = query.trim().toLowerCase();
    const base = src ? src.playerIds.map((id) => playerById.get(id)) : q ? players : sources.flatMap((s) => s.playerIds.map((id) => playerById.get(id)));
    const uniq = [...new Map(base.filter((p): p is Player => !!p).map((p) => [p.id, p])).values()];
    return uniq.filter((p) => p.fullName && (!eligibleOnly || eligibleFor(cat, { gender: p.gender, age: ageOf(p) })) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query, sources, players, playerById, eligibleOnly, gender, age]);
  const toggle = (pid: string) => setPicks((ps) => (ps.includes(pid) ? ps.filter((x) => x !== pid) : [...ps, pid]));
  const nameOf = (pid: string) => playerById.get(pid)?.fullName ?? 'Rider';
  const n = picks.length;

  const [field, setField] = useState<number | null>(null);
  const sprintField = Math.min(field ?? defaultSprintField(n), Math.max(n, 2));
  const plan = cycPlan(kind, n, { field: sprintField, stages });
  const lapsN = Number(laps) || (kind === 'points' ? 40 : kind === 'scratch' ? 20 : undefined);
  const everyN = Number(every) || 10;
  const handTimed = cycMeetSettings(tournament?.formats?.cycling as Record<string, unknown> | undefined).handTimed;

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setError(null);
    if (!n) { setError('Add at least one rider.'); return; }
    if (kind === 'sprint' && n < 2) { setError('A sprint needs at least two riders.'); return; }
    if (kind === 'points' && lapsN && everyN > lapsN) { setError('The sprint interval is longer than the race.'); return; }
    const list: NewEntrant[] = picks.map((pid) => ({ playerId: pid, name: nameOf(pid), team: teamOf(pid) }));
    const cyc: CycFormat = {
      ...(kind === 'itt' ? { interval } : {}),
      ...(kind === 'points' || kind === 'scratch' ? { laps: lapsN } : {}),
      ...(kind === 'points' ? { sprintEvery: everyN } : {}),
      ...(kind === 'sprint' ? { bo } : {}),
      ...(kind === 'stage' ? { stages, interval } : {}),
      ...((kind === 'rr' || kind === 'stage') && Number(km) ? { km: Number(km) } : {}),
    };
    const kmText = (kind === 'rr' || kind === 'stage') && Number(km) ? ` ${Number(km)} km` : '';
    setBusy(true);
    try {
      const evt = await createResultsEvent({
        discipline: ev.key, category: cat, tournamentId, entrants: list, plan, cyc, handTimed,
        // the start order is drawn (a time trial's start list, a pursuit's pairs)
        lanes: 'draw', title: `${ev.label}${kmText} ${categoryLabel(cat)}`, startsAt: new Date().toISOString(),
      });
      nav.replace('ResultsEvent', { phaseId: evt.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const S = sprintCount(lapsN, everyN);
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🚴 New cycling race" subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Race</Text>
          <View style={st.wrap}>
            <SelectChip label="Road" active={setting === 'road'} onPress={() => setSetting('road')} />
            <SelectChip label="Track (velodrome)" active={setting === 'track'} onPress={() => setSetting('track')} />
          </View>
          <View style={st.wrap}>
            {(setting === 'road' ? ROAD : TRACK).map((k) => <SelectChip key={k} label={KIND_LABEL[k]} active={kind === k} onPress={() => setKind(k)} />)}
          </View>
          <Text style={textStyles.muted}>{KIND_NOTE[kind]}</Text>
          {kind === 'itt' && (
            <>
              <Text style={st.label}>Distance</Text>
              <View style={st.wrap}>{CYC_EVENTS.filter((e) => e.kind === 'itt').map((e) => <SelectChip key={e.key} label={`${(e.metres ?? 0) / 1000} km`} active={ev.key === e.key} onPress={() => setDist({ ...dist, itt: (e.metres ?? 0) / 1000 })} />)}</View>
            </>
          )}
          {(kind === 'ip' || kind === 'tt') && (
            <>
              <Text style={st.label}>Distance</Text>
              <View style={st.wrap}>{CYC_EVENTS.filter((e) => e.kind === kind).map((e) => <SelectChip key={e.key} label={`${e.metres} m`} active={ev.key === e.key} onPress={() => setDist({ ...dist, [kind]: e.metres ?? 0 })} />)}</View>
              <Text style={textStyles.muted}>{kind === 'ip' ? 'UCI: 4000 m elite and U23, 3000 m juniors (men) / 2000 m junior women; schools often ride 2000 m.' : 'UCI: 1000 m (the kilo) for men, 500 m for women and juniors.'} Each distance keeps its own records and PBs.</Text>
            </>
          )}
          {(kind === 'itt' || kind === 'stage') && (
            <>
              <Text style={st.label}>Start interval{kind === 'stage' ? ' (time-trial stages)' : ''}</Text>
              <View style={st.wrap}>{[30, 60, 120].map((s) => <SelectChip key={s} label={s < 60 ? `${s} s` : `${s / 60} min`} active={interval === s} onPress={() => setStartGap(s)} />)}</View>
            </>
          )}
          {(kind === 'rr' || kind === 'stage') && (
            <TextInput style={st.input} value={km} onChangeText={setKm} placeholder={kind === 'stage' ? 'Total distance in km (optional)' : 'Distance in km (optional, e.g. 40)'} placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" accessibilityLabel="Distance in km" />
          )}
          {kind === 'stage' && (
            <>
              <Text style={st.label}>Stages ({stages.length})</Text>
              <View style={st.wrap}>
                {stages.map((t, i) => <SelectChip key={i} label={`${i + 1}: ${t === 'itt' ? 'time trial' : 'road'}`} active={false} onPress={() => setStages(stages.map((x, j) => (j === i ? (x === 'road' ? 'itt' : 'road') : x)))} />)}
              </View>
              <View style={st.wrap}>
                <SelectChip label="＋ Road stage" active={false} onPress={() => setStages([...stages, 'road'])} />
                <SelectChip label="＋ Time-trial stage" active={false} onPress={() => setStages([...stages, 'itt'])} />
                {stages.length > 1 ? <SelectChip label="− Last stage" active={false} onPress={() => setStages(stages.slice(0, -1))} /> : null}
              </View>
              <Text style={textStyles.muted}>Tap a stage to switch road / time trial. Riders who don’t finish a stage (DNF) or finish outside the time limit (OTL) are out of the race.</Text>
            </>
          )}
          {(kind === 'points' || kind === 'scratch') && (
            <View style={st.wrap}>
              <TextInput style={[st.input, { width: 120 }]} value={laps} onChangeText={setLaps} placeholder={`Laps (${kind === 'points' ? 40 : 20})`} placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" accessibilityLabel="Laps" />
              {kind === 'points' && <TextInput style={[st.input, { width: 150 }]} value={every} onChangeText={setEvery} placeholder="Sprint every (10) laps" placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" accessibilityLabel="Sprint every N laps" />}
            </View>
          )}
          {kind === 'points' && <Text style={textStyles.muted}>{S} sprint{S === 1 ? '' : 's'} — the last one is the finish (double points).</Text>}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · Category</Text>
          <View style={st.wrap}>{AGES.map((a) => <SelectChip key={a.key} label={a.label} active={age === a.key} onPress={() => setAge(a.key)} />)}</View>
          <Text style={textStyles.muted}>{AGES.find((a) => a.key === age)?.note}.</Text>
          <View style={st.wrap}>
            <SelectChip label={adult ? 'Men' : 'Boys'} active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label={adult ? 'Women' : 'Girls'} active={gender === 'F'} onPress={() => setGender('F')} />
            <SelectChip label="Mixed" active={gender === 'X'} onPress={() => setGender('X')} />
          </View>
          <Text style={textStyles.muted}>Event: {ev.label} {categoryLabel(cat)}.</Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · Riders ({n})</Text>
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
            {!pool.length && <Text style={textStyles.muted}>No riders match. Players without a gender or date of birth are always shown.</Text>}
          </View>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>4 · Rounds</Text>
          {kind === 'sprint' && n >= 2 && (
            <>
              <Text style={st.label}>Match play field</Text>
              <View style={st.wrap}>{sprintFields(n).map((k) => <SelectChip key={k} label={k === n && (k & (k - 1)) !== 0 ? `All ${k} (byes)` : `Top ${k}`} active={sprintField === k} onPress={() => setField(k)} />)}</View>
              <View style={st.wrap}>
                <SelectChip label="Best of three heats" active={bo === 3} onPress={() => setBo(3)} />
                <SelectChip label="One heat per match" active={bo === 1} onPress={() => setBo(1)} />
              </View>
            </>
          )}
          <Text style={textStyles.muted}>{n ? describeCycPlan(kind, plan, stages) : 'Add riders to see the rounds.'}</Text>
          {kind === 'ip' && n > 0 && n < 4 ? <Text style={textStyles.muted}>Fewer than 4 riders: one race on time, no finals.</Text> : null}
          {handTimed ? <Text style={textStyles.muted}>Hand timing is on for this meet (Points & timing).</Text> : null}
        </Card>

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create race & start list'} onPress={() => void create()} disabled={busy || !n} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(12) },
  card: { gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
});
