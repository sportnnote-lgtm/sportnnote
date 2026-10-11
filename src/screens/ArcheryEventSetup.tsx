/** SD-95 — add an archery event to a meet: the bow (recurve, compound,
 *  barebow), outdoor or indoor, the age group and gender, the round (the WA
 *  round for the age, or a shorter school / club preset), the archers from the
 *  tournament's teams / houses or any player, and match play (a seeded bracket
 *  of 4 … 64 with a bronze medal match, or none — the ranking round decides).
 *  Target order is drawn. Rendered by AthleticsEventSetupScreen when the
 *  route's sport is 'archery'. */
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
  ARCH_ROUNDS, ARCH_AGES, BOW_LABEL, categoryLabel, eligibleFor, defaultRound, defaultBracket, bracketSize, roundLine, matchFormatOf,
  type ArchAge, type Bow, type Category, type PlannedPhase,
} from '../data/results';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }

export function ArcheryEventSetup({ tournamentId }: { tournamentId?: string }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const [bow, setBow] = useState<Bow>('R');
  const [indoor, setIndoor] = useState(false);
  const [age, setAge] = useState<ArchAge>('U18');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [roundKey, setRoundKey] = useState(defaultRound('R', 'U18', false).key);
  useEffect(() => { setRoundKey(defaultRound(bow, age, indoor).key); }, [bow, age, indoor]);
  const round = ARCH_ROUNDS.find((r) => r.key === roundKey) ?? defaultRound(bow, age, indoor);
  const adult = age === 'Senior' || age === 'Junior';
  const cat: Category = { age, gender };

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
    return uniq.filter((p) => p.fullName && (!eligibleOnly || eligibleFor({ gender }, { gender: p.gender, age: ageOf(p) })) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 60);
  }, [filter, query, sources, players, playerById, eligibleOnly, gender]);
  const toggle = (pid: string) => setPicks((ps) => (ps.includes(pid) ? ps.filter((x) => x !== pid) : [...ps, pid]));
  const nameOf = (pid: string) => playerById.get(pid)?.fullName ?? 'Archer';
  const entrants = picks.length;

  const [bracketN, setBracketN] = useState<number | null>(null);
  const field = Math.min(bracketN ?? defaultBracket(entrants), entrants);
  const withMatches = field >= 2 && entrants >= 2;
  const choices = [...new Set([0, 4, 8, 16, 32, 64].filter((k) => k <= entrants).concat(entrants >= 3 && entrants <= 64 ? [entrants] : []))].sort((a, b) => a - b);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setError(null);
    if (!entrants) { setError('Add at least one archer.'); return; }
    const list: NewEntrant[] = picks.map((pid) => ({ playerId: pid, name: nameOf(pid), team: teamOf(pid) }));
    const plan: PlannedPhase[] = withMatches
      ? [{ phase: 'qualification', heats: 1, progression: { fillTo: field } }, { phase: 'final', heats: 1 }]
      : [{ phase: 'final', heats: 1 }];
    setBusy(true);
    try {
      const evt = await createResultsEvent({
        discipline: round.key, category: cat, tournamentId, entrants: list, plan,
        // target order is drawn (start list order)
        lanes: 'draw', title: `${round.label} ${categoryLabel(cat)}`, startsAt: new Date().toISOString(),
      });
      nav.replace('ResultsEvent', { phaseId: evt.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const rounds = ARCH_ROUNDS.filter((r) => r.bow === bow && r.indoor === indoor);
  const size = withMatches ? bracketSize(field) : 0;
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🏹 New archery event" subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Bow & round</Text>
          <View style={st.wrap}>{(['R', 'C', 'B'] as Bow[]).map((b) => <SelectChip key={b} label={BOW_LABEL[b]} active={bow === b} onPress={() => setBow(b)} />)}</View>
          <View style={st.wrap}>
            <SelectChip label="Outdoor (72 arrows)" active={!indoor} onPress={() => setIndoor(false)} />
            <SelectChip label="Indoor 18 m (60 arrows)" active={indoor} onPress={() => setIndoor(true)} />
          </View>
          <View style={st.wrap}>{ARCH_AGES.map((a) => <SelectChip key={a.key} label={a.label} active={age === a.key} onPress={() => setAge(a.key)} />)}</View>
          <Text style={textStyles.muted}>{ARCH_AGES.find((a) => a.key === age)?.note}.</Text>
          <View style={st.wrap}>
            <SelectChip label={adult ? 'Men' : 'Boys'} active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label={adult ? 'Women' : 'Girls'} active={gender === 'F'} onPress={() => setGender('F')} />
          </View>
          <Text style={st.label}>Round</Text>
          <View style={st.wrap}>
            {rounds.map((r) => <SelectChip key={r.key} label={`${r.distance} m${r.level === 'wa' ? ' (WA)' : ''}`} active={round.key === r.key} onPress={() => setRoundKey(r.key)} />)}
          </View>
          <Text style={textStyles.muted}>{roundLine(round)} — {round.note}. Each distance keeps its own records and PBs. Event: {round.label} {categoryLabel(cat)}.</Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · Archers ({picks.length})</Text>
          <View style={st.wrap}>
            <SelectChip label="All" active={filter == null} onPress={() => setFilter(null)} />
            {sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={filter === s.key} onPress={() => setFilter(s.key)} />)}
          </View>
          <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder="Search any player by name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search players" />
          <SelectChip label={eligibleOnly ? `✓ ${gender === 'M' ? (adult ? 'Men' : 'Boys') : (adult ? 'Women' : 'Girls')} only` : 'Showing everyone'} active={eligibleOnly} onPress={() => setEligibleOnly(!eligibleOnly)} />
          <View style={st.wrap}>
            {pool.map((p) => {
              const on = picks.includes(p.id);
              return <SelectChip key={p.id} label={`${on ? '✓ ' : ''}${p.fullName}`} dotColor={p.houseColor} active={on} onPress={() => toggle(p.id)} />;
            })}
            {!pool.length && <Text style={textStyles.muted}>No archers match. Players without a gender are always shown.</Text>}
          </View>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · Match play</Text>
          {choices.length > 1 ? (
            <View style={st.wrap}>
              {choices.map((k) => <SelectChip key={k} label={k ? (k === entrants && (k & (k - 1)) !== 0 ? `All ${k} (byes)` : `Top ${k}`) : 'No match play'} active={(withMatches ? field : 0) === k} onPress={() => setBracketN(k)} />)}
            </View>
          ) : null}
          <Text style={textStyles.muted}>
            {withMatches
              ? `The best ${field} after the ranking round are seeded into a bracket of ${size} (1 v ${size}, ${size / 2} v ${size / 2 + 1} …)${size > field ? `; the top ${size - field} seed${size - field === 1 ? '' : 's'} get a bye` : ''}. ${matchFormatOf(bow) === 'sets' ? 'Set system: ends of 3 arrows, 2 set points for the higher end, 1 each for a tie, first to 6; 5–5 → a one-arrow shoot-off.' : 'Compound: 5 ends of 3 arrows, the higher total wins; level → a one-arrow shoot-off.'} The semi-final losers shoot for bronze.`
              : 'No match play: the ranking round decides the medals (a tie for a medal: a shoot-off).'}
          </Text>
          <Text style={textStyles.muted}>Ranking ties (WA): the higher score, then more 10s (X included), then more X. Level for the last match-play place: a shoot-off; other equal ranks: a coin toss for the seed.</Text>
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
