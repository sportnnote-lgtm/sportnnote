/** SD-90 — add a track event to a meet's programme: category (age group ×
 *  gender), the event (D9 school-meet catalogue), entrants from the
 *  tournament's teams / houses (or any player), relay teams with their legs,
 *  seeds (entry mark, or PB / SB from earlier results), rounds (World Athletics
 *  presets by entry count) and lanes (drawn or seeded). Creates the first
 *  round's start list and opens it. */
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
  type Category, type RoundsPreset,
} from '../data/results';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** A team / house athletes can be entered from. */
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }
interface Pick { playerId: string; seed: string }
interface Relay { key: string; source: Source; label: string; members: string[] }

const GROUP_TITLE: Record<string, string> = { sprint: 'Sprints', distance: 'Middle & long distance', hurdles: 'Hurdles', relay: 'Relays' };

export default function AthleticsEventSetupScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AthleticsEventSetup'>>();
  const tournamentId = params?.tournamentId;
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const meet = meetSettings(tournament?.formats?.athletics as Record<string, unknown> | undefined);

  const [age, setAge] = useState<string>('U14');
  const [gender, setGender] = useState<'M' | 'F' | 'X'>('M');
  const cat: Category = { age, gender };
  const events = useMemo(() => trackEventsFor({ age, gender }), [age, gender]);
  const [discipline, setDiscipline] = useState('ath.100m');
  const def = disciplineOf(discipline)!;
  const relay = !!def.teamSize;
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
    if (/[.:,]/.test(t)) return parseMark(t, def)?.mark;
    return digitsToTime(t) ?? undefined;
  };
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const fillSeeds = async (kind: 'pb' | 'sb') => {
    const hist = await getMarkHistory(def, picks.map((p) => p.playerId), '');
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
    if (relay && relays.some((r) => r.members.length < 4)) { setError('Each relay team needs its 4 runners (up to 2 reserves) — tap the team to pick them.'); return; }
    const badSeed = !relay && picks.find((p) => p.seed.trim() && readSeed(p.seed) == null);
    if (badSeed) { setError(`Can't read the entry mark for ${playerById.get(badSeed.playerId)?.fullName ?? 'an athlete'}.`); return; }
    setBusy(true);
    try {
      const ev = await createResultsEvent({
        discipline: def.key, category: cat, tournamentId, entrants, plan: preset?.plan, lanes: def.lanes ? lanes : 'seeded',
        startsAt: new Date().toISOString(), handTimed: meet.handTimed, reaction: meet.reaction,
      });
      nav.replace('ResultsEvent', { phaseId: ev.id, tab: 'sheet' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🏃 New track event" subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Category</Text>
          <View style={st.wrap}>{AGE_GROUPS.map((a) => <SelectChip key={a} label={a} active={age === a} onPress={() => setAge(a)} />)}</View>
          <View style={st.wrap}>
            <SelectChip label="Boys" active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label="Girls" active={gender === 'F'} onPress={() => setGender('F')} />
            <SelectChip label="Mixed" active={gender === 'X'} onPress={() => setGender('X')} />
          </View>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · Event</Text>
          {(['sprint', 'distance', 'hurdles', 'relay'] as const).map((g) => {
            const list = events.filter((e) => e.group === g);
            if (!list.length) return null;
            return (
              <View key={g} style={{ gap: theme.spacing(1) }}>
                <Text style={st.label}>{GROUP_TITLE[g]}</Text>
                <View style={st.wrap}>{list.map((e) => <SelectChip key={e.discipline} label={e.label} active={discipline === e.discipline} onPress={() => setDiscipline(e.discipline)} />)}</View>
              </View>
            );
          })}
          <Text style={textStyles.muted}>
            {def.label} {categoryLabel(cat)}{def.wind ? ' · wind gauge' : ''}{def.lanes ? ' · in lanes' : ' · no lanes'}{hurdles ? ` · hurdles ${hurdles}` : ''}
          </Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · {relay ? 'Relay teams' : 'Athletes'} ({n})</Text>
          {relay ? (
            <>
              <Text style={textStyles.muted}>Add a team per house; tap it to pick its runners in leg order (4, plus up to 2 reserves).</Text>
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
                    {r.members.length > 0 && <Text style={textStyles.muted} numberOfLines={2}>{r.members.map((id, i) => `${i < 4 ? `Leg ${i + 1}` : 'Res'}: ${playerById.get(id)?.fullName.split(' ')[0] ?? ''}`).join(' · ')}</Text>}
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
                {!pool.length && <Text style={textStyles.muted}>No athletes match. Players without a gender or date of birth are always shown.</Text>}
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
                      <TextInput style={[st.input, { width: 92 }]} value={p.seed} placeholder="1185" placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad"
                        accessibilityLabel={`Entry mark for ${playerById.get(p.playerId)?.fullName}`} onChangeText={(t) => setPicks((ps) => ps.map((x) => (x.playerId === p.playerId ? { ...x, seed: t } : x)))} />
                      <Text style={st.remove} onPress={() => toggle(p.playerId)}>✕</Text>
                    </View>
                  ))}
                  <Text style={textStyles.muted}>Digits fill from the right: 1185 = 11.85, 25034 = 2:50.34. Seeded athletes are spread across the heats (fastest first); the rest are drawn.</Text>
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
            <Text style={textStyles.muted}>Q = first places in each heat; q = the fastest of the rest. You can close each round when its results are in — the next one is seeded for you.</Text>
          </Card>
        )}

        {n > 0 && def.lanes ? (
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

        {meet.handTimed ? <Text style={textStyles.muted}>This meet is hand-timed (Athletics settings): times are read to the tenth and count for meet records.</Text> : null}
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
