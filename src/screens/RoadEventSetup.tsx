/** SD-92 — add an athletics road race, race walk or cross-country race to a
 *  meet: the distance (road 5 km … marathon or any distance; walks on the
 *  track or the road; cross-country by age group), the course (certified for
 *  records) and timing (gun / chip), walk rules (Penalty Zone), the age group
 *  and gender, the runners from the tournament's teams / houses (all of a
 *  house in one tap) with bibs, and team scoring by placings (first N of up to
 *  M, how places are counted, team points). One race (mass start), start list
 *  by bib. Rendered by AthleticsEventSetupScreen for `mode: 'road'`. */
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
  AGE_GROUPS, categoryLabel, eligibleFor, meetSettings, roadKey, roadEventOf, xcDistance, defaultTeamScoring, describeTeamScoring, penaltyMinutes,
  ROAD_METRES, WALK_ROAD_METRES, WALK_TRACK_METRES, XC_METRES, HALF, MARATHON,
  type Category, type RoadKind, type RoadFormat, type TeamBasis,
} from '../data/results';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }

const KIND_NOTE: Record<RoadKind, string> = {
  road: 'Mass start on the road (World Athletics TR 55). The order of finish decides; times to the whole second, gun time official.',
  walk: 'Race walking (TR 54): judges show yellow paddles and send red cards; 3 red cards from different judges disqualify.',
  xc: 'Cross-country (TR 56): a mass start over grass / trails; the order of finish decides. Houses / schools score as teams by their runners’ places.',
};
const BASIS_LABEL: Record<TeamBasis, string> = { teams: 'Complete teams only (displace)', overall: 'Overall places', scorers: 'Scorers only' };
const kmLabel = (m: number) => (m === HALF ? 'Half marathon' : m === MARATHON ? 'Marathon' : m >= 1000 ? `${m / 1000} km` : `${m} m`);

export function RoadEventSetup({ tournamentId }: { tournamentId?: string }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const meet = meetSettings(tournament?.formats?.athletics as Record<string, unknown> | undefined);
  const [kind, setKind] = useState<RoadKind>('xc');
  const [age, setAge] = useState<string>('U14');
  const [gender, setGender] = useState<'M' | 'F' | 'X'>('M');
  const cat: Category = { age, gender };
  const [metres, setMetres] = useState<number>(xcDistance('U14', 'M'));
  const [custom, setCustom] = useState('');
  const [trackWalk, setTrackWalk] = useState(true);
  const [certified, setCertified] = useState(false);
  const [timing, setTiming] = useState<'gun' | 'chip'>('gun');
  const [penaltyZone, setPenaltyZone] = useState(false);
  // a new kind / age: the usual distance (XC by age group)
  useEffect(() => {
    setCustom('');
    if (kind === 'xc') setMetres(xcDistance(age, gender));
    else if (kind === 'road') setMetres((m) => (ROAD_METRES.includes(m) ? m : 5000));
    else setMetres((m) => ((trackWalk ? WALK_TRACK_METRES : WALK_ROAD_METRES).includes(m) ? m : trackWalk ? 3000 : 10000));
  }, [kind, age, gender, trackWalk]);
  const customM = Math.round(Number(custom.replace(',', '.')) * 1000);
  const dist = custom.trim() && customM >= 400 ? customM : metres;
  const key = roadKey(kind, dist, kind === 'walk' && trackWalk);
  const ev = roadEventOf(key);

  // team scoring: on for cross-country, off for the road (a house choice)
  const [teamOn, setTeamOn] = useState(true);
  useEffect(() => { setTeamOn(kind === 'xc'); }, [kind]);
  const [scorers, setScorers] = useState(defaultTeamScoring('U14').scorers);
  const [size, setSize] = useState<number | null>(6);
  const [basis, setBasis] = useState<TeamBasis>('teams');
  const [teamPts, setTeamPts] = useState(true);
  useEffect(() => { setScorers(defaultTeamScoring(age).scorers); }, [age]);

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
    const base = src ? src.playerIds.map((id) => playerById.get(id)) : q ? players : sources.flatMap((s) => s.playerIds.map((id) => playerById.get(id)));
    const uniq = [...new Map(base.filter((p): p is Player => !!p).map((p) => [p.id, p])).values()];
    return uniq.filter((p) => p.fullName && fits(p) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query, sources, players, playerById, eligibleOnly, gender, age]);
  const toggle = (pid: string) => setPicks((ps) => (ps.includes(pid) ? ps.filter((x) => x !== pid) : [...ps, pid]));
  /** every eligible runner of a house in one tap (up to the team size + 2 — the rest one by one) */
  const addHouse = (s: Source) => {
    const ids = s.playerIds.map((id) => playerById.get(id)).filter((p): p is Player => !!p && !!p.fullName && fits(p)).map((p) => p.id);
    setPicks((ps) => [...ps, ...ids.filter((id) => !ps.includes(id))]);
  };
  const nameOf = (pid: string) => playerById.get(pid)?.fullName ?? 'Runner';
  const n = picks.length;
  const [bibFrom, setBibFrom] = useState('101');

  const road: RoadFormat = {
    kind,
    ...(kind === 'road' || (kind === 'walk' && !trackWalk) ? { certified } : {}),
    ...(kind === 'road' && timing === 'chip' ? { timing: 'chip' as const } : {}),
    ...(kind === 'walk' && penaltyZone ? { penaltyZone: true } : {}),
    ...(teamOn ? { team: { scorers, ...(size ? { size } : {}), basis, points: teamPts } } : {}),
  };

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setError(null);
    if (!ev) { setError('Pick a distance (at least 0.4 km).'); return; }
    if (!n) { setError('Add at least one runner.'); return; }
    if (teamOn && size && size < scorers) { setError('The team size can’t be smaller than the number of scorers.'); return; }
    // bibs in house order, then by name — the start list reads by bib
    const first = Math.max(1, Number(bibFrom) || 1);
    const sorted = [...picks].sort((a, b) => (teamOf(a)?.name ?? '~').localeCompare(teamOf(b)?.name ?? '~') || nameOf(a).localeCompare(nameOf(b)));
    const list: NewEntrant[] = sorted.map((pid, i) => ({ playerId: pid, name: nameOf(pid), team: teamOf(pid), bib: String(first + i) }));
    setBusy(true);
    try {
      const evt = await createResultsEvent({
        discipline: ev.key, category: cat, tournamentId, entrants: list, plan: [{ phase: 'final', heats: 1 }], road,
        handTimed: meet.handTimed, lanes: 'seeded', title: `${ev.label} ${categoryLabel(cat)}`, startsAt: new Date().toISOString(),
      });
      nav.replace('ResultsEvent', { phaseId: evt.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const distances = kind === 'road' ? ROAD_METRES : kind === 'walk' ? (trackWalk ? WALK_TRACK_METRES : WALK_ROAD_METRES) : XC_METRES;
  const houseCounts = sources.map((s) => ({ s, n: picks.filter((p) => s.playerIds.includes(p)).length })).filter((x) => x.n > 0);
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🏃 New road / cross-country race" subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Race</Text>
          <View style={st.wrap}>
            <SelectChip label="🌳 Cross-country" active={kind === 'xc'} onPress={() => setKind('xc')} />
            <SelectChip label="🏃 Road race" active={kind === 'road'} onPress={() => setKind('road')} />
            <SelectChip label="🚶 Race walk" active={kind === 'walk'} onPress={() => setKind('walk')} />
          </View>
          <Text style={textStyles.muted}>{KIND_NOTE[kind]}</Text>
          {kind === 'walk' && (
            <View style={st.wrap}>
              <SelectChip label="On the track" active={trackWalk} onPress={() => setTrackWalk(true)} />
              <SelectChip label="On the road" active={!trackWalk} onPress={() => setTrackWalk(false)} />
            </View>
          )}
          <Text style={st.label}>Distance</Text>
          <View style={st.wrap}>
            {distances.map((m) => <SelectChip key={m} label={kind === 'walk' && trackWalk ? `${m} m` : kmLabel(m)} active={!custom.trim() && metres === m} onPress={() => { setCustom(''); setMetres(m); }} />)}
          </View>
          <TextInput style={st.input} value={custom} onChangeText={setCustom} placeholder="Other distance in km (e.g. 2.5)" placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" accessibilityLabel="Other distance in km" />
          {kind === 'xc' ? <Text style={textStyles.muted}>Usual for {categoryLabel(cat)}: {kmLabel(xcDistance(age, gender))} (school presets for U10–U16; World Cross Country pattern from U18). Cross-country keeps no records or PBs — every course is different; places and team medals go on profiles.</Text> : null}
          {(kind === 'road' || (kind === 'walk' && !trackWalk)) && (
            <>
              <SelectChip label={certified ? '✓ Certified, measured course' : 'Course not certified'} active={certified} onPress={() => setCertified(!certified)} />
              <Text style={textStyles.muted}>Only a course measured by an accredited measurer (World Athletics / AIMS) can set a meet or school record. PBs count on any course.</Text>
            </>
          )}
          {kind === 'road' && (
            <View style={st.wrap}>
              <SelectChip label="Gun time (official)" active={timing === 'gun'} onPress={() => setTiming('gun')} />
              <SelectChip label="Chip (net) time" active={timing === 'chip'} onPress={() => setTiming('chip')} />
            </View>
          )}
          {kind === 'walk' && (
            <>
              <SelectChip label={penaltyZone ? '✓ Penalty Zone rule' : 'Penalty Zone rule (off)'} active={penaltyZone} onPress={() => setPenaltyZone(!penaltyZone)} />
              <Text style={textStyles.muted}>{penaltyZone ? `3 red cards: ${penaltyMinutes(dist)} min in the penalty zone; the 4th red card disqualifies (TR 54.7.3).` : '3 red cards from different judges disqualify (TR 54.7.1).'}</Text>
            </>
          )}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · Category</Text>
          <View style={st.wrap}>{AGE_GROUPS.map((a) => <SelectChip key={a} label={a} active={age === a} onPress={() => setAge(a)} />)}</View>
          <View style={st.wrap}>
            <SelectChip label="Boys" active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label="Girls" active={gender === 'F'} onPress={() => setGender('F')} />
            <SelectChip label="Mixed" active={gender === 'X'} onPress={() => setGender('X')} />
          </View>
          <Text style={textStyles.muted}>Event: {ev ? `${ev.label} ${categoryLabel(cat)}` : '—'}.</Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · Runners ({n})</Text>
          {sources.length > 0 && (
            <>
              <Text style={st.label}>Add a whole house</Text>
              <View style={st.wrap}>
                {sources.map((s) => <SelectChip key={`all${s.key}`} label={`＋ All ${s.name}`} dotColor={s.colorHex} active={false} onPress={() => addHouse(s)} />)}
              </View>
            </>
          )}
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
            {!pool.length && <Text style={textStyles.muted}>No runners match. Players without a gender or date of birth are always shown.</Text>}
          </View>
          {houseCounts.length > 0 ? <Text style={textStyles.muted}>{houseCounts.map((x) => `${x.s.name} ${x.n}`).join(' · ')}</Text> : null}
          <View style={st.row}>
            <Text style={st.label}>Bibs from</Text>
            <TextInput style={[st.input, { width: 90 }]} value={bibFrom} onChangeText={setBibFrom} keyboardType="number-pad" accessibilityLabel="First bib number" />
            <Text style={[textStyles.muted, { flex: 1 }]}>numbered by house, then name</Text>
          </View>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>4 · Team scoring</Text>
          <SelectChip label={teamOn ? '✓ Score teams by placings' : 'No team score'} active={teamOn} onPress={() => setTeamOn(!teamOn)} />
          {teamOn && (
            <>
              <Text style={st.label}>Scorers per team</Text>
              <View style={st.wrap}>{[3, 4, 5, 6].map((k) => <SelectChip key={k} label={`First ${k}`} active={scorers === k} onPress={() => setScorers(k)} />)}</View>
              <Text style={st.label}>Team size (runners who count for the team)</Text>
              <View style={st.wrap}>
                {[4, 5, 6, 7, 8].map((k) => <SelectChip key={k} label={`Up to ${k}`} active={size === k} disabled={k < scorers} onPress={() => setSize(k)} />)}
                <SelectChip label="No limit" active={size == null} onPress={() => setSize(null)} />
              </View>
              <Text style={st.label}>How places count</Text>
              <View style={st.wrap}>{(['teams', 'overall', 'scorers'] as TeamBasis[]).map((b) => <SelectChip key={b} label={BASIS_LABEL[b]} active={basis === b} onPress={() => setBasis(b)} />)}</View>
              <Text style={textStyles.muted}>{describeTeamScoring({ scorers, basis, ...(size ? { size } : {}) })}</Text>
              <SelectChip label={teamPts ? '✓ Team places earn house points + medals' : 'Team places: no house points'} active={teamPts} onPress={() => setTeamPts(!teamPts)} />
            </>
          )}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
});
