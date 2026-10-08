/** Bulk scorer assignment (parity #11): share the tournament's scorer pool across
 *  its fixtures in one tap, instead of adding a scorer on each match's Info tab.
 *  Modes: share out evenly (default), by ground, or one scorer for all. Tap a
 *  match's scorer chip to cycle through the pool before saving. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Button, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import { SectionHeader } from '../components/SectionHeader';
import { useLeagueData, useTournamentById } from '../data/hooks';
import { getTournamentOfficials, bulkSetMatchScorers, getPlayer } from '../data/repos';
import { planScorerAssignments, assignableMatches, venueKey, type AssignMode } from '../data/scorerAssign';
import { notify } from '../core/notifications';
import { formatDate, formatTime } from '../core/time';
import type { Match } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AssignScorersScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AssignScorers'>>();
  const tournament = useTournamentById(params.tournamentId);
  const [nonce, setNonce] = useState(0);
  const { matches, players, loading } = useLeagueData(params.tournamentId, nonce);

  const [pool, setPool] = useState<string[] | null>(null);
  useFocusEffect(useCallback(() => {
    let on = true;
    getTournamentOfficials(params.tournamentId)
      .then((list) => on && setPool([...new Set(list.filter((o) => o.role === 'scorer').map((o) => o.playerId))]))
      .catch(() => on && setPool([]));
    return () => { on = false; };
  }, [params.tournamentId]));

  // Names: loaded players, then a one-off lookup for anyone not in the list
  // (e.g. someone just added by mobile number).
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!pool) return;
    const missing = pool.filter((id) => !players.some((p) => p.id === id) && !extraNames[id]);
    if (!missing.length) return;
    let on = true;
    Promise.all(missing.map((id) => getPlayer(id).catch(() => null))).then((ps) => {
      if (!on) return;
      setExtraNames((m) => { const n = { ...m }; ps.forEach((p, i) => { n[missing[i]] = p?.fullName ?? 'Scorer'; }); return n; });
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, players]);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.fullName ?? extraNames[id] ?? 'Scorer';

  const [mode, setMode] = useState<AssignMode>('rotate');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [oneScorer, setOneScorer] = useState<string | null>(null);
  const [venueChoice, setVenueChoice] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: string[] } | null>(null);

  const scorers = pool ?? [];
  const todo = useMemo(
    () => assignableMatches(matches, onlyUnassigned)
      .slice()
      .sort((a, b) => (Date.parse(a.startsAt) || 0) - (Date.parse(b.startsAt) || 0)),
    [matches, onlyUnassigned],
  );
  const venues = useMemo(() => [...new Set(todo.map((m) => venueKey(m)).filter(Boolean))], [todo]);
  const byVenueOk = venues.length >= 2;
  const effMode: AssignMode = mode === 'byVenue' && !byVenueOk ? 'rotate' : mode;
  // Default ground → scorer: share the pool round the grounds.
  const venueMap = useMemo(() => {
    const out: Record<string, string[]> = {};
    venues.forEach((v, i) => {
      const pick = venueChoice[v] && scorers.includes(venueChoice[v]) ? venueChoice[v] : scorers[i % Math.max(1, scorers.length)];
      if (pick) out[v] = [pick];
    });
    return out;
  }, [venues, venueChoice, scorers]);
  const one = oneScorer && scorers.includes(oneScorer) ? oneScorer : scorers[0];

  const basePlan = useMemo(
    () => planScorerAssignments(todo, effMode === 'one' && one ? [one] : scorers, { mode: effMode, venueMap, onlyUnassigned }),
    [todo, scorers, effMode, one, venueMap, onlyUnassigned],
  );
  // Any change to the inputs drops the hand-picked swaps.
  useEffect(() => { setOverrides({}); }, [effMode, onlyUnassigned, one, venueMap]);
  const plan = useMemo(() => {
    const p: Record<string, string[]> = {};
    for (const [id, ids] of Object.entries(basePlan)) p[id] = overrides[id] ? [overrides[id]] : ids;
    return p;
  }, [basePlan, overrides]);
  const count = Object.keys(plan).length;

  const cycle = (m: Match) => {
    const cur = plan[m.id]?.[0];
    const i = scorers.indexOf(cur ?? '');
    const next = scorers[(i + 1) % scorers.length];
    if (next) setOverrides((o) => ({ ...o, [m.id]: next }));
  };

  async function save(which: Record<string, string[]>, isRetry = false) {
    if (!Object.keys(which).length) return;
    setBusy(true);
    const res = await bulkSetMatchScorers(which);
    // One message per scorer for the matches that actually saved.
    const per: Record<string, number> = {};
    for (const id of res.ok) for (const s of which[id] ?? []) per[s] = (per[s] ?? 0) + 1;
    const tName = tournament?.name ?? 'the tournament';
    await Promise.all(Object.entries(per).map(([pid, n]) => notify({
      title: '🎯 Scoring duty',
      body: `You're scoring ${n} match${n === 1 ? '' : 'es'} at ${tName}`,
      playerId: pid,
    }).catch(() => undefined)));
    setResult((prev) => ({ ok: res.ok.length + (isRetry && prev ? prev.ok : 0), failed: res.failed }));
    setOverrides({});
    setNonce((n) => n + 1);
    setBusy(false);
  }
  const retry = () => {
    if (!result?.failed.length) return;
    const again: Record<string, string[]> = {};
    for (const id of result.failed) {
      const m = matches.find((x) => x.id === id);
      const ids = plan[id] ?? (m ? planScorerAssignments([m], scorers, { mode: 'rotate', onlyUnassigned: false })[id] : undefined);
      if (ids) again[id] = ids;
    }
    void save(again, true);
  };

  // Group upcoming rows by day.
  const groups = useMemo(() => {
    const out: { day: string; rows: Match[] }[] = [];
    for (const m of todo) {
      const day = m.startsAt ? formatDate(m.startsAt) : 'No date';
      const g = out.find((x) => x.day === day);
      if (g) g.rows.push(m); else out.push({ day, rows: [m] });
    }
    return out;
  }, [todo]);

  if (pool === null || loading) {
    return <SafeAreaView style={st.safe} edges={['bottom']}><EmptyState title="Loading…" /></SafeAreaView>;
  }
  if (!scorers.length) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={st.body}>
          <ScreenTitle title="Assign scorers" subtitle={tournament?.name} />
          <EmptyState icon="🎽" title="Add scorers first" hint="Add the tournament’s scorers under Settings → Scorers & officials, then come back to share out the fixtures." />
          <Button label="Back to the tournament" variant="ghost" onPress={() => nav.goBack()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.body}>
        <ScreenTitle title="Assign scorers" subtitle={`${tournament?.name ?? ''} · ${scorers.length} scorer${scorers.length === 1 ? '' : 's'}`} />

        <View style={st.chips}>
          <SelectChip label="Share out evenly" active={effMode === 'rotate'} onPress={() => setMode('rotate')} />
          {byVenueOk && <SelectChip label="By ground" active={effMode === 'byVenue'} onPress={() => setMode('byVenue')} />}
          <SelectChip label="One scorer for all" active={effMode === 'one'} onPress={() => setMode('one')} />
        </View>
        <View style={st.chips}>
          <SelectChip label={`${onlyUnassigned ? '☑' : '☐'} Only matches without a scorer`} active={onlyUnassigned} onPress={() => setOnlyUnassigned((v) => !v)} />
        </View>

        {effMode === 'one' && (
          <View style={st.block}>
            <Text style={st.head}>Scorer</Text>
            <View style={st.chips}>
              {scorers.map((id) => <SelectChip key={id} label={nameOf(id)} active={one === id} onPress={() => setOneScorer(id)} />)}
            </View>
          </View>
        )}
        {effMode === 'byVenue' && venues.map((v) => (
          <View key={v} style={st.block}>
            <Text style={st.head}>{v}</Text>
            <View style={st.chips}>
              {scorers.map((id) => <SelectChip key={id} label={nameOf(id)} active={venueMap[v]?.[0] === id} onPress={() => setVenueChoice((c) => ({ ...c, [v]: id }))} />)}
            </View>
          </View>
        ))}

        {result && (
          <Text style={result.failed.length ? st.warn : st.done}>
            ✓ {result.ok} assigned{result.failed.length ? ` · ${result.failed.length} failed ` : ''}
            {result.failed.length ? <Text style={st.link} onPress={busy ? undefined : retry}>(retry)</Text> : null}
          </Text>
        )}

        {todo.length === 0 && (
          <EmptyState icon="✅" title={onlyUnassigned ? 'Every upcoming match has a scorer' : 'No upcoming matches'} hint={onlyUnassigned ? 'Turn off “Only matches without a scorer” to reassign them.' : undefined} />
        )}
        {groups.map((g) => (
          <View key={g.day}>
            <SectionHeader title={g.day} />
            {g.rows.map((m) => {
              const sid = plan[m.id]?.[0];
              const bits = [`${m.homeTeam?.name ?? 'TBD'} v ${m.awayTeam?.name ?? 'TBD'}`, m.startsAt ? formatTime(m.startsAt) : '', m.venueName ?? ''].filter(Boolean);
              return (
                <View key={m.id} style={st.row}>
                  <Text style={[textStyles.body, st.flex1]} numberOfLines={2}>{bits.join(' · ')}</Text>
                  {sid ? <SelectChip label={`🎯 ${nameOf(sid)}`} active onPress={() => cycle(m)} /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
      {count > 0 && (
        <View style={st.footer}>
          <Button label={busy ? 'Assigning…' : `Assign ${count} match${count === 1 ? '' : 'es'}`} onPress={() => void save(plan)} disabled={busy} />
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  body: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(24) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  block: { gap: theme.spacing(1) },
  head: { color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  flex1: { flex: 1 },
  footer: { padding: theme.spacing(4), borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.bg },
  done: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  warn: { color: theme.colors.danger, fontWeight: '700', fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontWeight: '800', textDecorationLine: 'underline' },
});
