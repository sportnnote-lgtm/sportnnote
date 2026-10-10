/** SD-96 — add a shooting event to a meet: the ISSF event (10 m Air Rifle,
 *  10 m Air Pistol, 50 m Rifle 3 Positions, 25 m Pistol / Rapid Fire, mixed
 *  team, trap / skeet), the age group and gender, the match length (60 shots,
 *  or a junior / school 40 …), the shooters (pairs for a mixed team) from the
 *  tournament's teams / houses or any player, how the range scores (by series
 *  or shot by shot), and the final (8, a smaller school final, or none).
 *  Firing points are drawn. Rendered by AthleticsEventSetupScreen when the
 *  route's sport is 'shooting'. */
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
  SHOOT_EVENTS, SHOOT_AGES, categoryLabel, eligibleFor, defaultShots, defaultFinalists, seriesCount, finalSchedule,
  type Category, type ShootAge, type PlannedPhase,
} from '../data/results';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }

export function ShootingEventSetup({ tournamentId }: { tournamentId?: string }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const [evKey, setEvKey] = useState(SHOOT_EVENTS[0].key);
  const ev = SHOOT_EVENTS.find((e) => e.key === evKey)!;
  const team = !!ev.teamSize;
  const [age, setAge] = useState<ShootAge>('Junior');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [shots, setShots] = useState<number>(defaultShots(ev, 'Junior'));
  useEffect(() => { setShots(defaultShots(ev, age)); }, [evKey, age]); // eslint-disable-line react-hooks/exhaustive-deps
  const adult = age === 'Senior' || age === 'Junior';
  const cat: Category = { age, gender: team ? 'X' : gender, ...(shots !== ev.shots ? { shots } : {}) };

  // Teams / houses (as the other event setups): the tournament's teams with
  // their rosters; before any are added, the houses from players' house names.
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
    return uniq.filter((p) => p.fullName && (team || !eligibleOnly || eligibleFor({ gender }, { gender: p.gender, age: ageOf(p) })) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 60);
  }, [filter, query, sources, players, playerById, eligibleOnly, gender, team]);
  const toggle = (pid: string) => setPicks((ps) => (ps.includes(pid) ? ps.filter((x) => x !== pid) : [...ps, pid]));
  const nameOf = (pid: string) => playerById.get(pid)?.fullName ?? 'Shooter';
  // mixed team: picks pair up in order (1 + 2, 3 + 4 …)
  const pairs = team ? Array.from({ length: Math.floor(picks.length / 2) }, (_, i) => [picks[2 * i], picks[2 * i + 1]]) : [];
  const entrants = team ? pairs.length : picks.length;

  const [mode, setMode] = useState<'series' | 'shot'>('series');
  const [finalists, setFinalists] = useState<number | null>(null);
  const fin = ev.final && !team ? (finalists ?? defaultFinalists(ev, entrants)) : 0;
  const finalOk = fin >= 3 && fin < entrants;

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setError(null);
    if (!entrants) { setError(team ? 'Add the shooters in pairs (a team is two).' : 'Add at least one shooter.'); return; }
    if (team && picks.length % 2) { setError(`${nameOf(picks[picks.length - 1])} has no partner yet — a mixed team is two shooters.`); return; }
    const list: NewEntrant[] = team
      ? pairs.map(([a, b]) => {
        const t = teamOf(a) ?? teamOf(b);
        return { name: `${t?.name ? `${t.name} · ` : ''}${nameOf(a).split(' ')[0]} / ${nameOf(b).split(' ')[0]}`, team: t, members: [{ playerId: a, name: nameOf(a) }, { playerId: b, name: nameOf(b) }] };
      })
      : picks.map((pid) => ({ playerId: pid, name: nameOf(pid), team: teamOf(pid) }));
    const withFinal = !!ev.final && !team && finalOk;
    const plan: PlannedPhase[] = withFinal
      ? [{ phase: 'qualification', heats: 1, progression: { fillTo: fin } }, { phase: 'final', heats: 1 }]
      : [{ phase: 'final', heats: 1 }];
    setBusy(true);
    try {
      const evt = await createResultsEvent({
        discipline: ev.key, category: cat, tournamentId, entrants: list, plan,
        // firing points are drawn (start list order)
        lanes: 'draw', title: `${ev.label} ${categoryLabel(cat)}`, startsAt: new Date().toISOString(),
        shootEntry: mode, ...(withFinal ? { shootFinal: true } : {}),
      });
      nav.replace('ResultsEvent', { phaseId: evt.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const n = seriesCount(ev, shots);
  const finalChoices = ev.final && !team ? [0, 4, 6, 8].filter((k) => k === 0 || k < entrants || k === ev.final!.finalists) : [];
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🎯 New shooting event" subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Event</Text>
          <View style={st.wrap}>{SHOOT_EVENTS.map((e) => <SelectChip key={e.key} label={e.label} active={evKey === e.key} onPress={() => { setEvKey(e.key); setPicks([]); setFinalists(null); }} />)}</View>
          <Text style={textStyles.muted}>{ev.rules}.</Text>
          <View style={st.wrap}>{SHOOT_AGES.map((a) => <SelectChip key={a.key} label={a.label} active={age === a.key} onPress={() => setAge(a.key)} />)}</View>
          <Text style={textStyles.muted}>{SHOOT_AGES.find((a) => a.key === age)?.note}.</Text>
          {!team ? (
            <View style={st.wrap}>
              <SelectChip label={adult ? 'Men' : 'Boys'} active={gender === 'M'} onPress={() => setGender('M')} />
              <SelectChip label={adult ? 'Women' : 'Girls'} active={gender === 'F'} onPress={() => setGender('F')} />
            </View>
          ) : <Text style={textStyles.muted}>Mixed team: a man and a woman, 30 shots each — the team total ranks.</Text>}
          <Text style={st.label}>Match</Text>
          <View style={st.wrap}>
            {ev.shotOptions.map((k) => <SelectChip key={k} label={`${k} ${ev.scoring === 'hits' ? 'targets' : 'shots'}${k === ev.shots ? ' (ISSF)' : ''}`} active={shots === k} onPress={() => setShots(k)} />)}
          </View>
          <Text style={textStyles.muted}>{n} series of {ev.seriesOf}{ev.positions ? ` — ${ev.positions.length === 3 ? 'kneeling, prone, standing' : ''}` : ''}. {shots !== ev.shots ? 'A shorter match keeps its own records and PBs.' : ''} Event: {ev.label} {categoryLabel(cat)}.</Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · {team ? `Teams (${pairs.length})` : `Shooters (${picks.length})`}</Text>
          <View style={st.wrap}>
            <SelectChip label="All" active={filter == null} onPress={() => setFilter(null)} />
            {sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={filter === s.key} onPress={() => setFilter(s.key)} />)}
          </View>
          <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder="Search any player by name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search players" />
          {!team && <SelectChip label={eligibleOnly ? `✓ ${gender === 'M' ? (adult ? 'Men' : 'Boys') : (adult ? 'Women' : 'Girls')} only` : 'Showing everyone'} active={eligibleOnly} onPress={() => setEligibleOnly(!eligibleOnly)} />}
          {team && <Text style={textStyles.muted}>Tap two shooters for each team, in order (a man and a woman).</Text>}
          <View style={st.wrap}>
            {pool.map((p) => {
              const on = picks.includes(p.id);
              return <SelectChip key={p.id} label={`${on ? '✓ ' : ''}${p.fullName}`} dotColor={p.houseColor} active={on} onPress={() => toggle(p.id)} />;
            })}
            {!pool.length && <Text style={textStyles.muted}>No shooters match. Players without a gender are always shown.</Text>}
          </View>
          {team && pairs.length > 0 && pairs.map(([a, b], i) => <Text key={i} style={textStyles.body}>Team {i + 1}: {nameOf(a)} + {nameOf(b)}</Text>)}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · Scoring & final</Text>
          <View style={st.wrap}>
            <SelectChip label={ev.scoring === 'integer' ? 'By series (total + X)' : 'By series'} active={mode === 'series'} onPress={() => setMode('series')} />
            {ev.scoring !== 'hits' && <SelectChip label="Shot by shot" active={mode === 'shot'} onPress={() => setMode('shot')} />}
          </View>
          <Text style={textStyles.muted}>{mode === 'series' ? `Enter each series total${ev.scoring === 'integer' ? ' and its inner tens (X)' : ''} as the range scores it.` : `Type each series' shots in one line${ev.scoring === 'decimal' ? ' (10.4 10.2 …)' : ' (10 9 X … — X is an inner ten)'}; shot-by-shot also breaks the last ties.`}</Text>
          {finalChoices.length > 0 ? (
            <>
              <Text style={st.label}>Final</Text>
              <View style={st.wrap}>
                {finalChoices.map((k) => <SelectChip key={k} label={k ? `Final of ${k}` : 'No final'} active={fin === k} disabled={k > 0 && k >= entrants} onPress={() => setFinalists(k)} />)}
              </View>
              <Text style={textStyles.muted}>
                {fin && finalOk
                  ? `The best ${fin} after the match shoot a final from zero: ${ev.final!.stage}. Eliminations after shot ${finalSchedule(ev.final!, fin).join(', ')}; shot ${ev.final!.last} decides gold. Equal lowest totals shoot off.`
                  : fin ? `A final of ${fin} needs more than ${fin} shooters.` : 'No final: the match decides the medals (equal medal places: a shoot-off).'}
              </Text>
            </>
          ) : (
            <Text style={textStyles.muted}>{team ? 'Mixed team: ranked on the team total (the ISSF medal matches are not run here).' : ev.scoring === 'hits' ? 'Qualification only: the match decides the medals (equal medal places: a shoot-off).' : 'The 25 m hit-scored final is not run here: the match decides the medals.'}</Text>
          )}
          <Text style={textStyles.muted}>Ties (ISSF): {ev.scoring === 'integer' ? 'more inner tens, then ' : ''}{ev.positions ? 'standing, kneeling, prone totals, then ' : ''}the higher last {ev.scoring === 'hits' ? 'round' : '10-shot series'}, back series by series{ev.scoring !== 'hits' ? ', then shot by shot when shots are entered' : ''}.</Text>
        </Card>

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create event & start list'} onPress={() => void create()} disabled={busy || !entrants} />
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
