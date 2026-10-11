/** SD-90 / SD-91 — add a track or field event to a meet's programme: category
 *  (age group × gender), the event (D9 school-meet catalogue; field events
 *  show their implement, triple-jump board, wind gauge and — HJ / PV — the bar
 *  progression), entrants from the
 *  tournament's teams / houses (or any player), relay teams with their legs,
 *  seeds (entry mark, or PB / SB from earlier results), rounds (World Athletics
 *  presets by entry count) and lanes (drawn or seeded). Creates the first
 *  round's start list and opens it.
 *  SD-94: the same screen sets up a swimming event (`sport: 'swimming'`): the
 *  pool length, events by stroke, medley-relay legs, World Aquatics seeding
 *  (SW 3.1 — no lane draw) and the timed-final / heats → final presets. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, FormError, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { usePlayers, useTournamentById } from '../data/hooks';
import { getTournamentTeams, getTeamRosters } from '../data/repos';
import { createResultsEvent, getMarkHistory, type NewEntrant } from '../data/resultsStore';
import {
  AGE_GROUPS, trackEventsFor, eligibleFor, roundPresets, describePlan, hurdleHeight, meetSettings, digitsToTime,
  disciplineOf, parseMark, formatMark, personalBests, categoryLabel,
  fieldEventsFor, isFieldDiscipline, implementSpec, implementNote, defaultBoard, TJ_BOARDS, defaultBar, barPlan, barProgressionError, minBarStep,
  swimMeetSettings, swimEventsFor, phaseDiscipline, legLabels, mixedRelayError, COURSES, courseLabel,
  type Category, type RoundsPreset, type PlannedPhase, type Course,
} from '../data/results';
import { ageOf } from '../core/age';
import { WeightliftingEventSetup } from './WeightliftingEventSetup';
import { ShootingEventSetup } from './ShootingEventSetup';
import { ArcheryEventSetup } from './ArcheryEventSetup';
import { CrewEventSetup } from './CrewEventSetup';
import { CyclingEventSetup } from './CyclingEventSetup';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** A team / house athletes can be entered from. */
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }
interface Pick { playerId: string; seed: string }
interface Relay { key: string; source: Source; label: string; members: string[] }

const GROUP_TITLE: Record<string, string> = {
  sprint: 'Sprints', distance: 'Middle & long distance', hurdles: 'Hurdles', relay: 'Relays', jumps: 'Jumps', throws: 'Throws',
  free: 'Freestyle', back: 'Backstroke', breast: 'Breaststroke', fly: 'Butterfly', im: 'Individual medley',
};
const ATH_GROUPS = ['sprint', 'distance', 'hurdles', 'relay', 'jumps', 'throws'] as const;
const SWIM_GROUPS = ['free', 'back', 'breast', 'fly', 'im', 'relay'] as const;
const cm = (v: number) => `${Math.round(v * 100)} cm`;

/** SD-97: weightlifting has its own setup (bodyweight categories, lifters, lots). */
export default function AthleticsEventSetupScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'AthleticsEventSetup'>>();
  if (params?.sport === 'shooting') return <ShootingEventSetup tournamentId={params.tournamentId} />; // SD-96
  if (params?.sport === 'archery') return <ArcheryEventSetup tournamentId={params.tournamentId} />; // SD-95
  if (params?.sport === 'rowing' || params?.sport === 'canoe') return <CrewEventSetup tournamentId={params.tournamentId} sport={params.sport} />; // SD-99 / SD-100
  if (params?.sport === 'cycling') return <CyclingEventSetup tournamentId={params.tournamentId} />; // SD-98
  return params?.sport === 'weightlifting' ? <WeightliftingEventSetup tournamentId={params.tournamentId} /> : <TrackSwimEventSetup />;
}

function TrackSwimEventSetup() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AthleticsEventSetup'>>();
  const tournamentId = params?.tournamentId;
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const sport = params?.sport ?? 'athletics';
  const swim = sport === 'swimming';
  const meet = meetSettings(tournament?.formats?.athletics as Record<string, unknown> | undefined);
  const sw = swimMeetSettings(tournament?.formats?.swimming as Record<string, unknown> | undefined);
  const [course, setCourse] = useState<Course>(sw.course);
  useEffect(() => { setCourse(sw.course); }, [sw.course]);
  const manual = swim ? sw.manual : meet.handTimed;

  const [age, setAge] = useState<string>(swim ? 'U12' : 'U14');
  const [gender, setGender] = useState<'M' | 'F' | 'X'>(swim ? 'F' : 'M');
  const cat: Category = swim ? { age, gender, course } : { age, gender };
  const events = useMemo(() => (swim
    ? swimEventsFor({ age, gender }, course).map((e) => ({ ...e, optional: false }))
    : [
      ...trackEventsFor({ age, gender }).map((e) => ({ ...e, optional: false })),
      ...fieldEventsFor({ age, gender }).map((e) => ({ ...e, optional: !!e.optional })),
    ]), [age, gender, swim, course]);
  const [discipline, setDiscipline] = useState(swim ? 'swim.50free' : 'ath.100m');
  // SD-94: the pool's lane count (a 6- or 10-lane pool) shapes heats and lanes
  const def = swim ? phaseDiscipline(disciplineOf(discipline)!, { lanes: sw.lanes }) : disciplineOf(discipline)!;
  const relay = !!def.teamSize;
  const field = isFieldDiscipline(def);
  const vertical = def.capture === 'heights';

  // SD-91 field settings: implement (throws), TJ board, wind gauge, bar progression.
  const spec = implementSpec(def.key, cat);
  const [implement, setImplement] = useState('');
  const [board, setBoard] = useState<number>(defaultBoard(cat));
  const [gauge, setGauge] = useState(!meet.handTimed);
  const [barStart, setBarStart] = useState('');
  const [barStep, setBarStep] = useState(0.05);
  const [barChange, setBarChange] = useState('');
  const [barStep2, setBarStep2] = useState(0.03);
  const [standard, setStandard] = useState('');
  useEffect(() => {
    setImplement(implementSpec(discipline, { age, gender })?.text ?? '');
    setBoard(defaultBoard({ age, gender }));
    const b = defaultBar(disciplineOf(discipline)!, { age, gender });
    setBarStart(b.start.toFixed(2)); setBarStep(b.step); setBarChange(b.changeAt.toFixed(2)); setBarStep2(b.step2);
  }, [discipline, age, gender]);
  const bar = useMemo(() => {
    const start = parseMark(barStart, def)?.mark, change = parseMark(barChange, def)?.mark;
    return vertical && start ? barPlan(start, barStep, change, barStep2) : [];
  }, [vertical, barStart, barChange, barStep, barStep2, def]);
  const barError = vertical ? (bar.length ? barProgressionError(bar, def) : 'Type the opening height (e.g. 1.10).') : null;
  const stepChoices = def.key === 'ath.pv' ? [0.2, 0.15, 0.1, 0.05] : [0.1, 0.05, 0.04, 0.03, 0.02];
  useEffect(() => { if (!events.some((e) => e.discipline === discipline)) setDiscipline(events[0].discipline); }, [events, discipline]);

  // Teams / houses: the tournament's participating teams (with their rosters);
  // before any are added, the houses from players' house names.
  const [sources, setSources] = useState<Source[]>([]);
  useEffect(() => {
    let on = true;
    void (async () => {
      const teams = tournamentId ? await getTournamentTeams(tournamentId) : [];
      const byName = new Map<string, Source>();
      const rosters = await getTeamRosters(teams.map((t) => t.id));
      for (const t of teams) {
        const k = t.name.trim().toLowerCase();
        const cur = byName.get(k);
        const ids = rosters.get(t.id) ?? [];
        if (cur) cur.playerIds = [...new Set([...cur.playerIds, ...ids])];
        else byName.set(k, { key: `t:${t.id}`, name: t.name, colorHex: t.colorHex, teamId: t.id, playerIds: ids });
      }
      // Houses from players' house names only when the meet has no teams yet.
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
  const sourceOf = (pid: string): Source | undefined => sources.find((s) => s.playerIds.includes(pid));
  const teamOf = (pid: string) => { const s = sourceOf(pid); return s ? { id: s.teamId, name: s.name, colorHex: s.colorHex } : undefined; };

  // ---- individual entrants ----
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [picks, setPicks] = useState<Pick[]>([]);
  const fits = (p: Player) => !eligibleOnly || eligibleFor(cat, { gender: p.gender, age: ageOf(p) });
  const pool = useMemo(() => {
    const src = filter ? sources.find((s) => s.key === filter) : undefined;
    const q = query.trim().toLowerCase();
    const base = src ? src.playerIds.map((id) => playerById.get(id)).filter((p): p is Player => !!p) : q ? players : sources.flatMap((s) => s.playerIds.map((id) => playerById.get(id))).filter((p): p is Player => !!p);
    const uniq = [...new Map(base.map((p) => [p.id, p])).values()];
    return uniq.filter((p) => p.fullName && fits(p) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query, sources, players, playerById, eligibleOnly, age, gender]);
  const toggle = (pid: string) => setPicks((ps) => (ps.some((x) => x.playerId === pid) ? ps.filter((x) => x.playerId !== pid) : [...ps, { playerId: pid, seed: '' }]));
  const readSeed = (t: string): number | undefined => {
    if (!t.trim()) return undefined;
    if (field || /[.:,]/.test(t)) return parseMark(t, def)?.mark;
    return digitsToTime(t) ?? undefined;
  };
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const fillSeeds = async (kind: 'pb' | 'sb') => {
    const hist = await getMarkHistory(def, picks.map((p) => p.playerId), '', swim ? course : undefined);
    const from = `${new Date().getFullYear()}-01-01`;
    let filled = 0;
    const next = picks.map((p) => {
      const b = personalBests(hist, p.playerId, def, from);
      const v = kind === 'pb' ? b.pb : b.sb;
      if (v == null) return p;
      filled += 1;
      return { ...p, seed: formatMark(v, def) };
    });
    setPicks(next);
    setSeedNote(filled ? `${filled} seed${filled === 1 ? '' : 's'} filled from ${kind === 'pb' ? 'personal' : 'season'} bests.` : `No earlier ${def.label} results for these athletes — type entry marks instead.`);
  };

  // ---- relay teams ----
  const [relays, setRelays] = useState<Relay[]>([]);
  const [openRelay, setOpenRelay] = useState<string | null>(null);
  const addRelay = (s: Source) => {
    const n = relays.filter((r) => r.source.key === s.key).length;
    const key = `${s.key}#${n}`;
    setRelays((rs) => [...rs, { key, source: s, label: n ? `${s.name} ${String.fromCharCode(65 + n)}` : s.name, members: [] }]);
    setOpenRelay(key);
  };
  const toggleLeg = (rk: string, pid: string) => setRelays((rs) => rs.map((r) => {
    if (r.key !== rk) return r;
    if (r.members.includes(pid)) return { ...r, members: r.members.filter((x) => x !== pid) };
    return r.members.length >= 6 ? r : { ...r, members: [...r.members, pid] };
  }));

  const entrants: NewEntrant[] = relay
    ? relays.map((r) => ({ name: r.label, team: { id: r.source.teamId, name: r.source.name, colorHex: r.source.colorHex }, members: r.members.map((id) => ({ playerId: id, name: playerById.get(id)?.fullName ?? 'Athlete' })) }))
    : picks.map((p) => ({ playerId: p.playerId, name: playerById.get(p.playerId)?.fullName ?? 'Athlete', team: teamOf(p.playerId), seed: readSeed(p.seed) }));
  const n = entrants.length;
  const presets: RoundsPreset[] = useMemo(() => (n ? roundPresets(def, n) : []), [def, n]);
  const [presetKey, setPresetKey] = useState<RoundsPreset['key']>('wa');
  const preset = presets.find((p) => p.key === presetKey) ?? presets[0];
  const [lanes, setLanes] = useState<'draw' | 'seeded'>('draw');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hurdles = hurdleHeight(def.key, cat);

  const create = async () => {
    setError(null);
    if (!n) { setError(relay ? 'Add at least one relay team.' : 'Add at least one athlete.'); return; }
    if (relay && relays.some((r) => r.members.length < 4)) { setError(`Each relay team needs its 4 ${swim ? 'swimmers' : 'runners'} (up to 2 reserves) — tap the team to pick them.`); return; }
    if (relay && swim && gender === 'X') {
      for (const r of relays) {
        const bad = mixedRelayError(r.members.slice(0, 4).map((id) => playerById.get(id)?.gender));
        if (bad) { setError(`${r.label}: ${bad}`); return; }
      }
    }
    const badSeed = !relay && picks.find((p) => p.seed.trim() && readSeed(p.seed) == null);
    if (badSeed) { setError(`Can't read the entry mark for ${playerById.get(badSeed.playerId)?.fullName ?? 'an athlete'}.`); return; }
    if (vertical && barError) { setError(barError); return; }
    const std = standard.trim() ? parseMark(standard, def)?.mark : undefined;
    if (standard.trim() && std == null) { setError("Can't read the qualifying standard."); return; }
    const plan: PlannedPhase[] | undefined = preset?.plan.map((p) => (p.phase === 'qualification' && std != null ? { ...p, progression: { ...p.progression, standard: std } } : p));
    setBusy(true);
    try {
      const ev = await createResultsEvent({
        discipline: def.key, category: cat, tournamentId, entrants, plan, lanes: !swim && (def.lanes || field) ? lanes : 'seeded',
        startsAt: new Date().toISOString(), handTimed: manual, reaction: swim ? sw.reaction : meet.reaction,
        ...(swim ? { venueLanes: sw.lanes, splits: sw.splits } : {}),
        ...(field ? {
          bar: vertical ? bar : undefined, implement: implement.trim() || undefined, board: def.key === 'ath.tj' ? board : undefined,
          noWindGauge: def.wind === 'attempt' && !gauge ? true : undefined,
        } : {}),
      });
      nav.replace('ResultsEvent', { phaseId: ev.id, tab: 'sheet' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={swim ? '🏊 New swimming event' : '🏃 New event'} subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Category</Text>
          <View style={st.wrap}>{AGE_GROUPS.map((a) => <SelectChip key={a} label={a} active={age === a} onPress={() => setAge(a)} />)}</View>
          <View style={st.wrap}>
            <SelectChip label="Boys" active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label="Girls" active={gender === 'F'} onPress={() => setGender('F')} />
            <SelectChip label={swim ? 'Mixed (relays)' : 'Mixed'} active={gender === 'X'} onPress={() => setGender('X')} />
          </View>
          {swim && (
            <>
              <View style={st.wrap}>{COURSES.map((c) => <SelectChip key={c.key} label={c.label} active={course === c.key} onPress={() => setCourse(c.key)} />)}</View>
              <Text style={textStyles.muted}>{sw.lanes} lanes{sw.lanes === 10 ? ' (0–9)' : ''}. Records and personal bests are kept per pool length. Mixed relays are 2 boys + 2 girls (SW 10.11).</Text>
            </>
          )}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · Event</Text>
          {(swim ? SWIM_GROUPS : ATH_GROUPS).map((g: string) => {
            const list = events.filter((e) => e.group === g);
            if (!list.length) return null;
            return (
              <View key={g} style={{ gap: theme.spacing(1) }}>
                <Text style={st.label}>{GROUP_TITLE[g]}</Text>
                <View style={st.wrap}>{list.map((e) => {
                  const imp = implementSpec(e.discipline, cat)?.text;
                  return <SelectChip key={e.discipline} label={`${e.label}${imp ? ` · ${imp}` : ''}${e.optional ? ' (optional)' : ''}`} active={discipline === e.discipline} onPress={() => setDiscipline(e.discipline)} />;
                })}</View>
              </View>
            );
          })}
          <Text style={textStyles.muted}>
            {def.label} {categoryLabel(cat)}
            {swim
              ? `${relay ? ` · ${legLabels(def.key).join(' → ')}` : ''} · ${courseLabel(course)} · ${def.lanes} lanes · seeded on entry times (World Aquatics SW 3.1)`
              : field
              ? `${vertical ? ' · bar heights, 3 tries a height' : ` · ${def.attempts?.count ?? 3} trials, then ${def.attempts?.extra ?? 3} more for the best ${def.attempts?.finalists ?? 8}`}${spec ? ` · ${implementNote(spec, cat)}` : ''}`
              : `${def.wind ? ' · wind gauge' : ''}${def.lanes ? ' · in lanes' : ' · no lanes'}${hurdles ? ` · hurdles ${hurdles}` : ''}`}
          </Text>
          {events.find((e) => e.discipline === discipline)?.optional ? <Text style={textStyles.muted}>Optional event: needs a {def.key === 'ath.pv' ? 'pole-vault landing bed and poles' : 'hammer cage'}.</Text> : null}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · {relay ? 'Relay teams' : swim ? 'Swimmers' : 'Athletes'} ({n})</Text>
          {relay ? (
            <>
              <Text style={textStyles.muted}>Add a team per house; tap it to pick its {swim ? 'swimmers in order' : 'runners in leg order'} (4, plus up to 2 reserves).{swim && gender === 'X' ? ' Mixed: 2 boys + 2 girls.' : ''}</Text>
              <SelectChip label={eligibleOnly ? `✓ ${categoryLabel(cat)} only` : 'Showing everyone'} active={eligibleOnly} onPress={() => setEligibleOnly(!eligibleOnly)} />
              <View style={st.wrap}>{sources.map((s) => <SelectChip key={s.key} label={`＋ ${s.name}`} dotColor={s.colorHex} active={false} onPress={() => addRelay(s)} />)}</View>
              {!sources.length && <Text style={textStyles.muted}>No teams or houses yet — add the houses as teams in the tournament first.</Text>}
              {relays.map((r) => {
                const open = openRelay === r.key;
                const cands = r.source.playerIds.map((id) => playerById.get(id)).filter((p): p is Player => !!p && (!eligibleOnly || eligibleFor(cat, { gender: p.gender, age: ageOf(p) })));
                return (
                  <View key={r.key} style={st.relay}>
                    <TouchableOpacity accessibilityRole="button" onPress={() => setOpenRelay(open ? null : r.key)} style={st.relayHead}>
                      <View style={[st.dot, { backgroundColor: r.source.colorHex ?? theme.colors.border }]} />
                      <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{r.label}</Text>
                      <Text style={textStyles.muted}>{r.members.length}/4{r.members.length > 4 ? `+${r.members.length - 4}` : ''}</Text>
                      <Text style={st.remove} onPress={() => setRelays((rs) => rs.filter((x) => x.key !== r.key))}>Remove</Text>
                    </TouchableOpacity>
                    {r.members.length > 0 && <Text style={textStyles.muted} numberOfLines={2}>{r.members.map((id, i) => `${i < 4 ? (swim ? legLabels(def.key)[i].replace('Backstroke', 'Back').replace('Breaststroke', 'Breast').replace('Butterfly', 'Fly').replace('Freestyle', 'Free') : `Leg ${i + 1}`) : 'Res'}: ${playerById.get(id)?.fullName.split(' ')[0] ?? ''}`).join(' · ')}</Text>}
                    {open && (
                      <View style={st.wrap}>
                        {cands.map((p) => {
                          const i = r.members.indexOf(p.id);
                          return <SelectChip key={p.id} label={`${i >= 0 ? `${i + 1}. ` : ''}${p.fullName}`} active={i >= 0} onPress={() => toggleLeg(r.key, p.id)} />;
                        })}
                        {!cands.length && <Text style={textStyles.muted}>No eligible athletes in {r.source.name} — tap “{categoryLabel(cat)} only” to show everyone.</Text>}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          ) : (
            <>
              <View style={st.wrap}>
                <SelectChip label="All" active={filter == null} onPress={() => setFilter(null)} />
                {sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={filter === s.key} onPress={() => setFilter(s.key)} />)}
              </View>
              <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder="Search any player by name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search players" />
              <SelectChip label={eligibleOnly ? `✓ ${categoryLabel(cat)} only` : `Showing everyone`} active={eligibleOnly} onPress={() => setEligibleOnly(!eligibleOnly)} />
              <View style={st.wrap}>
                {pool.map((p) => {
                  const on = picks.some((x) => x.playerId === p.id);
                  return <SelectChip key={p.id} label={`${on ? '✓ ' : ''}${p.fullName}`} dotColor={p.houseColor} active={on} onPress={() => toggle(p.id)} />;
                })}
                {!pool.length && <Text style={textStyles.muted}>No {swim ? 'swimmers' : 'athletes'} match. Players without a gender or date of birth are always shown.</Text>}
              </View>
              {picks.length > 0 && (
                <View style={{ gap: theme.spacing(2) }}>
                  <Text style={st.label}>Entry marks (seeding · optional)</Text>
                  <View style={st.wrap}>
                    <SelectChip label="Fill from PB" active={false} onPress={() => void fillSeeds('pb')} />
                    <SelectChip label="Fill from SB" active={false} onPress={() => void fillSeeds('sb')} />
                  </View>
                  {seedNote ? <Text style={textStyles.muted}>{seedNote}</Text> : null}
                  {picks.map((p) => (
                    <View key={p.playerId} style={st.pickRow}>
                      <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{playerById.get(p.playerId)?.fullName}</Text>
                      <TextInput style={[st.input, { width: 92 }]} value={p.seed} placeholder={field ? (vertical ? '1.35' : '5.12') : swim ? '3245' : '1185'} placeholderTextColor={theme.colors.textMuted} keyboardType={field ? 'decimal-pad' : 'number-pad'}
                        accessibilityLabel={`Entry mark for ${playerById.get(p.playerId)?.fullName}`} onChangeText={(t) => setPicks((ps) => ps.map((x) => (x.playerId === p.playerId ? { ...x, seed: t } : x)))} />
                      <Text style={st.remove} onPress={() => toggle(p.playerId)}>✕</Text>
                    </View>
                  ))}
                  <Text style={textStyles.muted}>{field
                    ? 'Entry marks in metres (5.12). They spread the best athletes over the qualification groups; the order of trials is drawn.'
                    : swim
                    ? 'Entry times — digits fill from the right: 3245 = 32.45, 11520 = 1:15.20. Swimmers without a time are seeded slowest (SW 3.1.1); ties and no-times are drawn.'
                    : 'Digits fill from the right: 1185 = 11.85, 25034 = 2:50.34. Seeded athletes are spread across the heats (fastest first); the rest are drawn.'}</Text>
                </View>
              )}
            </>
          )}
        </Card>

        {n > 0 && (
          <Card style={st.card}>
            <Text style={textStyles.h3}>4 · Rounds</Text>
            <View style={st.wrap}>{presets.map((p) => <SelectChip key={p.key} label={p.label} active={preset?.key === p.key} onPress={() => setPresetKey(p.key)} />)}</View>
            {preset && <Text style={textStyles.body}>{describePlan(preset.plan)}</Text>}
            {field && preset?.plan.some((p) => p.phase === 'qualification') && (
              <View style={st.pickRow}>
                <Text style={st.label}>Qualifying standard (optional)</Text>
                <TextInput style={[st.input, { width: 92 }]} value={standard} onChangeText={setStandard} placeholder={vertical ? '1.40' : '5.20'} placeholderTextColor={theme.colors.textMuted}
                  keyboardType="decimal-pad" accessibilityLabel="Qualifying standard in metres" />
              </View>
            )}
            <Text style={textStyles.muted}>{field
              ? `${vertical ? 'Final: up to 3 tries at each height; three failures in a row and the athlete is out.' : 'Final: every athlete has 3 trials, then the best 8 (and anyone tied for 8th) get 3 more — with 8 or fewer, everyone gets 6.'}${presets.some((p) => p.key === 'qual') ? ' Qualification: reaching the standard is Q; if fewer than 12 do, the best of the rest fill the final to 12 (q).' : ''}`
              : swim
              ? 'Timed final: every heat counts — places and medals come from the times across all heats. Heats → final: the fastest go through on time (equal times at the line: a swim-off, SW 3.2.3). Each next round is seeded for you.'
              : 'Q = first places in each heat; q = the fastest of the rest. A timed final ranks every heat together on time. You can close each round when its results are in — the next one is seeded for you.'}</Text>
          </Card>
        )}

        {n > 0 && field ? (
          <Card style={st.card}>
            <Text style={textStyles.h3}>5 · {vertical ? 'Bar heights' : 'Event settings'}</Text>
            {vertical ? (
              <>
                <View style={st.pickRow}>
                  <Text style={[st.label, { flex: 1 }]}>Opening height (m)</Text>
                  <TextInput style={[st.input, { width: 92 }]} value={barStart} onChangeText={setBarStart} keyboardType="decimal-pad" accessibilityLabel="Opening bar height" />
                </View>
                <Text style={st.label}>Raise by</Text>
                <View style={st.wrap}>{stepChoices.map((x) => <SelectChip key={x} label={cm(x)} active={Math.abs(barStep - x) < 1e-9} onPress={() => setBarStep(x)} />)}</View>
                <View style={st.pickRow}>
                  <Text style={[st.label, { flex: 1 }]}>From this height (m), raise by</Text>
                  <TextInput style={[st.input, { width: 92 }]} value={barChange} onChangeText={setBarChange} keyboardType="decimal-pad" accessibilityLabel="Height where the raise changes" />
                </View>
                <View style={st.wrap}>{stepChoices.filter((x) => x <= barStep + 1e-9).map((x) => <SelectChip key={x} label={cm(x)} active={Math.abs(barStep2 - x) < 1e-9} onPress={() => setBarStep2(x)} />)}</View>
                {bar.length ? <Text style={textStyles.body}>{bar.map((h) => h.toFixed(2)).join(' · ')}</Text> : null}
                {barError ? <Text style={st.remove}>{barError}</Text> : null}
                <Text style={textStyles.muted}>The bar never goes up by less than {cm(minBarStep(def))}, and the raise never grows (World Athletics TR 26.4). You can add heights during the event; athletes may start at any height.</Text>
              </>
            ) : (
              <>
                {['ath.sp', 'ath.dt', 'ath.jt', 'ath.ht'].includes(def.key) && (
                  <>
                    <View style={st.pickRow}>
                      <Text style={[st.label, { flex: 1 }]}>Implement</Text>
                      <TextInput style={[st.input, { width: 110 }]} value={implement} onChangeText={setImplement} placeholder="e.g. 4 kg" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Implement weight" />
                    </View>
                    <Text style={textStyles.muted}>{spec ? implementNote(spec, cat) : 'Type the weight your federation uses for this category.'}. Personal bests are kept per implement weight.</Text>
                  </>
                )}
                {def.key === 'ath.tj' && (
                  <>
                    <Text style={st.label}>Take-off board (m from the sand)</Text>
                    <View style={st.wrap}>{TJ_BOARDS.map((b) => <SelectChip key={b} label={`${b} m`} active={board === b} onPress={() => setBoard(b)} />)}</View>
                    <Text style={textStyles.muted}>World Athletics recommends at least 13 m (men) and 11 m (women) at international meets; school meets use shorter boards.</Text>
                  </>
                )}
                {def.wind === 'attempt' && (
                  <>
                    <SelectChip label={gauge ? '✓ Wind gauge at the pit' : 'No wind gauge'} active={gauge} onPress={() => setGauge(!gauge)} />
                    <Text style={textStyles.muted}>{gauge
                      ? 'Type the wind for each jump. Over +2.0 m/s is wind-aided: it counts for places, not for PBs or records.'
                      : 'Jumps without a wind reading count for PBs and meet records.'}</Text>
                  </>
                )}
              </>
            )}
          </Card>
        ) : null}

        {n > 0 && field ? (
          <Card style={st.card}>
            <Text style={textStyles.h3}>6 · Order of trials</Text>
            <View style={st.wrap}>
              <SelectChip label="Draw the order" active={lanes === 'draw'} onPress={() => setLanes('draw')} />
              <SelectChip label="Best entry mark last" active={lanes === 'seeded'} onPress={() => setLanes('seeded')} />
            </View>
            <Text style={textStyles.muted}>World Athletics draws the order (TR 25.5).{vertical ? ' The same order is kept at every height.' : ' After round 3 the best 8 go in reverse order of the standings, the leader last.'}</Text>
          </Card>
        ) : null}

        {n > 0 && swim ? (
          <Card style={st.card}>
            <Text style={textStyles.h3}>5 · Heats & lanes</Text>
            <Text style={textStyles.muted}>World Aquatics seeding: preliminary heats are circle-seeded — the fastest swimmers in the last heats (SW 3.1.1), at least three in the first heat; a timed final puts the fastest in the last heat. In each heat the fastest swims lane {sw.lanes === 6 ? 3 : 4}, the next on their left, then right and left (SW 3.1.2). You can still change lanes on the start list.</Text>
          </Card>
        ) : null}

        {n > 0 && def.lanes && !field && !swim ? (
          <Card style={st.card}>
            <Text style={textStyles.h3}>5 · Lanes</Text>
            <View style={st.wrap}>
              <SelectChip label="Draw lanes" active={lanes === 'draw'} onPress={() => setLanes('draw')} />
              <SelectChip label="Fastest in the middle" active={lanes === 'seeded'} onPress={() => setLanes('seeded')} />
            </View>
            <Text style={textStyles.muted}>
              {lanes === 'draw' ? 'World Athletics first round: heats are seeded, lanes drawn. Later rounds draw by ranking (top 4 → lanes 3–6).' : 'The best seed gets lane 4, then 5, 3, 6 …'} You can change any lane on the start list.
            </Text>
          </Card>
        ) : null}

        {!swim && meet.handTimed ? <Text style={textStyles.muted}>This meet is hand-timed (Athletics settings): times are read to the tenth and count for meet records.</Text> : null}
        {swim && sw.manual ? <Text style={textStyles.muted}>Manual timing (Swimming settings): times to 1/100 from the lane's watches (SW 11.3) count for meet records.</Text> : null}
        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create event & start list'} onPress={() => void create()} disabled={busy || !n} />
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
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  remove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(1) },
  relay: { gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  relayHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
