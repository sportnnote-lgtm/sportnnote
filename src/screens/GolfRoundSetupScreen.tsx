/** Set up a golf round (stroke play / Stableford): course (pick or quick-create
 *  from the scorecard), format, players + their Handicap Index, and automatic
 *  groups/tee times. With `nextOf`, sets up the NEXT round of a tournament —
 *  same course/format, players carried over through an optional cut. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { Button, Card, TextField, SelectChip, ScreenTitle, FieldLabel, FormError, textStyles } from '../components/ui';
import { DateTimeField } from '../components/DateTimeField';
import { SportFormatEditor, defaultsFor, type FormatVal } from '../components/FormatEditor';
import { useAuth } from '../core/auth';
import { usePlayers } from '../data/hooks';
import { getMyPlayerId, createReplacementPlayer } from '../data/repos';
import {
  getGolfCourses, createGolfCourse, createFieldEvent, addFieldEntries, autoGroups, getFieldEvent, getFieldEvents,
  getFieldEntries, buildLeaderboard, golfFormatOf,
} from '../data/golf';
import { getSport } from '../sports/registry';
import { standardPar72, holesFor, makesCut, type CutRule, type Hole } from '../sports/golf/engine';
import type { GolfCourse } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Pick { playerId: string; name: string; index: string }

/** "12.4" → 12.4; "+2.1" (a plus handicap) → −2.1; '' → undefined. */
export const parseIndex = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const plus = t.startsWith('+');
  const n = Number(t.replace('+', ''));
  if (!Number.isFinite(n) || n < 0 || n > 54) return undefined;
  return plus ? -n : n;
};
const showIndex = (n?: number) => (n == null ? '' : n < 0 ? `+${Math.abs(n)}` : String(n));

export default function GolfRoundSetupScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'GolfRoundSetup'>>();
  const { profile } = useAuth();
  const allPlayers = usePlayers();
  const tournamentId = params?.tournamentId;

  const [title, setTitle] = useState(tournamentId ? 'Round 1' : 'Round with friends');
  const [roundNo, setRoundNo] = useState(1);
  const [courses, setCourses] = useState<GolfCourse[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [tee, setTee] = useState<string | undefined>(undefined);
  const [format, setFormat] = useState<Record<string, FormatVal>>(() => {
    const d = defaultsFor(getSport('golf').formatFields ?? []);
    const comp = params?.competition;
    return {
      ...d,
      ...(comp === 'stroke' || comp === 'stableford' ? { competition: comp, preset: comp } : {}),
      ...(params?.holes && ['18', 'front9', 'back9'].includes(params.holes) ? { holes: params.holes } : {}),
    };
  });
  const [when, setWhen] = useState(() => new Date());
  const [picks, setPicks] = useState<Pick[]>([]);
  const [query, setQuery] = useState('');
  const [groupSize, setGroupSize] = useState(4);
  const [interval, setIntervalMin] = useState(10);
  const [cutN, setCutN] = useState('');
  const [prev, setPrev] = useState<{ ids: string[]; ranked: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick-create course
  const [newCourse, setNewCourse] = useState(false);
  const [cName, setCName] = useState('');
  const [cCity, setCCity] = useState('');
  const [cHoles, setCHoles] = useState<Hole[]>(() => standardPar72());
  const [cNine, setCNine] = useState(false);
  const [cRating, setCRating] = useState('');
  const [cSlope, setCSlope] = useState('');

  useEffect(() => { getGolfCourses().then((cs) => { setCourses(cs); if (cs.length && !courseId) setCourseId(cs[0].id); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Next round of a tournament: carry course/format/players (through the cut).
  useEffect(() => {
    if (!params?.nextOf || !tournamentId) return;
    (async () => {
      const last = await getFieldEvent(params.nextOf!);
      if (!last) return;
      const evs = await getFieldEvents({ tournamentId, sport: 'golf' });
      const ens = await getFieldEntries(evs.map((e) => e.id));
      const cs = await getGolfCourses();
      const rows = buildLeaderboard(evs, ens, cs);
      const f = golfFormatOf(last);
      setCourseId(f.courseId);
      setTee(f.tee);
      setFormat((v) => ({ ...v, ...(last.format as Record<string, FormatVal>) }));
      const n = Math.max(...evs.map((e) => e.roundNo)) + 1;
      setRoundNo(n);
      setTitle(`Round ${n}`);
      const lastEntries = ens.filter((e) => e.eventId === last.id);
      setPrev({ ids: lastEntries.map((e) => e.playerId), ranked: rows.filter((r) => r.position != null).map((r) => r.id) });
      // Leaders tee off last (standard): reverse leaderboard order.
      const order = rows.filter((r) => r.position != null).map((r) => r.id).reverse();
      setPicks(order.map((pid) => {
        const en = lastEntries.find((e) => e.playerId === pid);
        return { playerId: pid, name: allPlayers.find((p) => p.id === pid)?.fullName ?? 'Player', index: showIndex(en?.handicapIndex) };
      }));
    })();
  }, [params?.nextOf, tournamentId, allPlayers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const course = courses.find((c) => c.id === courseId);
  const competition = String(format.competition ?? 'stroke');
  const q = query.trim().toLowerCase();
  const results = q.length >= 3 ? allPlayers.filter((p) => p.fullName.toLowerCase().includes(q) && !picks.some((x) => x.playerId === p.id)).slice(0, 12) : [];

  const addPlayer = (playerId: string, name: string, index?: number) =>
    setPicks((ps) => (ps.some((p) => p.playerId === playerId) ? ps : [...ps, { playerId, name, index: showIndex(index) }]));
  const addMe = async () => {
    const id = await getMyPlayerId(profile?.id);
    const p = id ? allPlayers.find((x) => x.id === id) : undefined;
    if (p) addPlayer(p.id, p.fullName);
  };
  const addNew = async () => {
    const name = query.trim();
    if (name.length < 2) return;
    try {
      const p = await createReplacementPlayer(name, 'golf');
      addPlayer(p.id, p.fullName);
      setQuery('');
    } catch { setError('Could not add that player.'); }
  };

  const saveCourse = async () => {
    setError(null);
    try {
      const holes = cNine ? cHoles.slice(0, 9).map((h, i) => ({ ...h, n: i + 1 })) : cHoles;
      const rating = Number(cRating), slope = Number(cSlope);
      const tees = [{ name: 'Default', ...(rating > 0 && slope > 0 ? { courseRating: rating, slope } : {}) }];
      const c = await createGolfCourse({ name: cName.trim() || 'My course', city: cCity.trim() || undefined, holes, tees });
      setCourses((cs) => [...cs, c]);
      setCourseId(c.id);
      setNewCourse(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the course'); }
  };
  const cyclePar = (i: number) => setCHoles((hs) => hs.map((h, j) => (j === i ? { ...h, par: h.par >= 5 ? 3 : h.par + 1 } : h)));
  const setSi = (i: number, v: string) => setCHoles((hs) => hs.map((h, j) => (j === i ? { ...h, si: Number(v.replace(/[^0-9]/g, '')) || 0 } : h)));

  const cutPreview = useMemo(() => {
    if (!prev || !cutN.trim()) return null;
    const n = Number(cutN);
    if (!Number.isFinite(n) || n < 1) return null;
    // Rank rows are only ids here — rebuild a minimal RankRow list for makesCut.
    return n;
  }, [prev, cutN]);

  const submit = async () => {
    setError(null);
    if (!course) return setError('Pick or add a course.');
    if (competition === 'match') return setError('Match play is head-to-head — use “Start a friendly” or the tournament bracket.');
    if (picks.length < 1) return setError('Add at least one player.');
    const bad = picks.find((p) => p.index.trim() && parseIndex(p.index) == null);
    if (bad) return setError(`${bad.name}: enter a Handicap Index like 12.4 (or +1.2), or leave it blank.`);
    setBusy(true);
    try {
      let chosen = picks;
      // The cut is recorded on the new round's format; an inherited one from the
      // previous round's format is dropped unless a cut is applied now.
      const { cutAfterRound: _ca, cut: _cut, ...baseFormat } = format as Record<string, unknown>;
      let cutKeys: Record<string, unknown> = {};
      if (prev && cutPreview) {
        // Cut: top N and ties on the cumulative leaderboard so far.
        const evs = await getFieldEvents({ tournamentId, sport: 'golf' });
        const ens = await getFieldEntries(evs.map((e) => e.id));
        const rows = buildLeaderboard(evs, ens, courses);
        const rule: CutRule = { type: 'top', n: cutPreview };
        const made = new Set(makesCut(rows, rule, competition === 'stableford' ? 'stableford' : 'stroke'));
        chosen = picks.filter((p) => made.has(p.playerId));
        cutKeys = { cutAfterRound: roundNo - 1, cut: rule };
      }
      const me = await getMyPlayerId(profile?.id);
      const holes = holesFor(course, String(format.holes ?? '18') as '18' | 'front9' | 'back9');
      const ev = await createFieldEvent({
        tournamentId, sport: 'golf', title: title.trim() || `Round ${roundNo}`, roundNo, startsAt: when.toISOString(),
        format: { ...baseFormat, ...cutKeys, courseId: course.id, tee: tee ?? course.tees[0]?.name, net: format.netScoring === 'net' },
        hostIds: me ? [me] : [],
      });
      const groups = autoGroups(chosen.map((p) => p.playerId), groupSize, when, interval);
      await addFieldEntries(ev.id, groups.map((g) => ({ ...g, handicapIndex: parseIndex(chosen.find((p) => p.playerId === g.playerId)?.index ?? '') })), holes.length);
      nav.replace('GolfRound', { eventId: ev.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the round');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={params?.nextOf ? `⛳ Round ${roundNo}` : '⛳ New golf round'} subtitle="Stroke play or Stableford — everyone on one leaderboard" />
        <TextField label="Round name" value={title} onChange={setTitle} placeholder="e.g. Sunday medal" />

        <FieldLabel>Course</FieldLabel>
        <View style={st.chips}>
          {courses.map((c) => <SelectChip key={c.id} label={`${c.name}${c.city ? ` · ${c.city}` : ''}`} active={c.id === courseId} onPress={() => { setCourseId(c.id); setTee(undefined); }} />)}
          <SelectChip label="＋ New course" active={newCourse} onPress={() => setNewCourse(!newCourse)} />
        </View>
        {newCourse && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.muted}>Copy pars and stroke indexes (SI) from the scorecard. Tap a par to change it. Starts from a standard par-72 layout.</Text>
            <TextField label="Course name" value={cName} onChange={setCName} placeholder="e.g. Boulder Hills Golf Club" />
            <TextField label="City (optional)" value={cCity} onChange={setCCity} placeholder="Hyderabad" />
            <View style={st.chips}>
              <SelectChip label="18 holes" active={!cNine} onPress={() => { setCNine(false); setCHoles(standardPar72()); }} />
              <SelectChip label="9 holes" active={cNine} onPress={() => { setCNine(true); setCHoles((hs) => hs.slice(0, 9).map((h, i) => ({ ...h, si: i + 1 }))); }} />
            </View>
            <View style={st.grid}>
              {(cNine ? cHoles.slice(0, 9) : cHoles).map((h, i) => (
                <View key={i} style={st.holeCell}>
                  <Text style={st.holeLbl}>{i + 1}</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Hole ${i + 1} par ${h.par}, tap to change`} onPress={() => cyclePar(i)} style={st.parBtn}>
                    <Text style={st.parTxt}>P{h.par}</Text>
                  </TouchableOpacity>
                  <TextInput style={st.siInput} value={h.si ? String(h.si) : ''} onChangeText={(v) => setSi(i, v)} keyboardType="number-pad" maxLength={2} accessibilityLabel={`Hole ${i + 1} stroke index`} placeholder="SI" placeholderTextColor={theme.colors.textMuted} />
                </View>
              ))}
            </View>
            <View style={st.row}>
              <View style={st.flex}><TextField label="Course rating (optional)" value={cRating} onChange={setCRating} placeholder="71.5" autoCapitalize="none" /></View>
              <View style={st.flex}><TextField label="Slope (optional)" value={cSlope} onChange={setCSlope} placeholder="128" autoCapitalize="none" /></View>
            </View>
            <Button label="Save course" onPress={saveCourse} />
          </Card>
        )}
        {course && course.tees.length > 1 && (
          <View style={st.chips}>
            {course.tees.map((t) => <SelectChip key={t.name} label={`${t.name} tees`} active={(tee ?? course.tees[0].name) === t.name} onPress={() => setTee(t.name)} />)}
          </View>
        )}

        <SportFormatEditor sport="golf" value={format} onChange={(k, v) => setFormat((f) => ({ ...f, [k]: v }))} heading="format" omitKeys={['extraHoles']} />
        {competition === 'match' && <Text style={st.warn}>Match play is head-to-head — set it up from “Start a friendly” or a tournament bracket.</Text>}

        <DateTimeField label="First tee time" value={when} onChange={setWhen} />

        <FieldLabel>Players · Handicap Index (optional)</FieldLabel>
        {picks.map((p) => (
          <View key={p.playerId} style={st.playerRow}>
            <Text style={[textStyles.body, st.flex]} numberOfLines={1}>{p.name}</Text>
            <TextInput
              style={st.idxInput}
              value={p.index}
              onChangeText={(v) => setPicks((ps) => ps.map((x) => (x.playerId === p.playerId ? { ...x, index: v } : x)))}
              placeholder="HI"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel={`${p.name} handicap index`}
              autoCapitalize="none"
            />
            <Text style={st.remove} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} onPress={() => setPicks((ps) => ps.filter((x) => x.playerId !== p.playerId))}>✕</Text>
          </View>
        ))}
        {!params?.nextOf && (
          <>
            <View style={st.chips}><SelectChip label="👤 Add me" active={false} onPress={() => void addMe()} /></View>
            <TextField label="" value={query} onChange={setQuery} placeholder="Search players (type 3+ letters)…" autoCapitalize="none" />
            {results.length > 0 && <View style={st.chips}>{results.map((p) => <SelectChip key={p.id} label={`👤 ${p.fullName}`} active={false} onPress={() => { addPlayer(p.id, p.fullName); setQuery(''); }} />)}</View>}
            {q.length >= 2 && <Text style={st.link} accessibilityRole="button" onPress={() => void addNew()}>＋ Add “{query.trim()}” as a new player</Text>}
          </>
        )}
        {prev && (
          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>✂️ Cut (optional)</Text>
            <Text style={textStyles.muted}>Keep the top N on the leaderboard so far, plus ties. Leave blank for no cut.</Text>
            <TextField label="Top N (and ties)" value={cutN} onChange={(v) => setCutN(v.replace(/[^0-9]/g, ''))} placeholder="e.g. 50" autoCapitalize="none" />
          </Card>
        )}

        <FieldLabel>Groups</FieldLabel>
        <View style={st.chips}>
          {[2, 3, 4].map((n) => <SelectChip key={n} label={`${n}-ball`} active={groupSize === n} onPress={() => setGroupSize(n)} />)}
          {[8, 10, 12].map((n) => <SelectChip key={`i${n}`} label={`every ${n} min`} active={interval === n} onPress={() => setIntervalMin(n)} />)}
        </View>
        <Text style={textStyles.muted}>{picks.length ? `${Math.ceil(picks.length / groupSize)} group(s), first tee ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'Add players to see the groups.'}</Text>

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : '⛳ Create round'} onPress={submit} disabled={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  holeCell: { width: 52, alignItems: 'center', gap: 2, padding: 4, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  holeLbl: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  parBtn: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: theme.colors.surface },
  parTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  siInput: { width: 40, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: 2 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  idxInput: { width: 64, textAlign: 'center', color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, borderRadius: 8, paddingVertical: 6, fontSize: theme.font.body },
  remove: { color: theme.colors.danger, fontSize: theme.font.h3, fontWeight: '800', paddingHorizontal: theme.spacing(2) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  warn: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
});
