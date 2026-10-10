/** SD-97 — add a weightlifting event (one bodyweight category's session) to a
 *  meet: the age group (IWF youth / junior / senior, or school), gender and
 *  bodyweight category (IWF categories from 1 June 2025), the lifters from the
 *  tournament's teams / houses (or any player) with optional opening
 *  declarations, and a drawn lot number for each. Bodyweights are taken at the
 *  weigh-in on the event page. Rendered by AthleticsEventSetupScreen when the
 *  route's sport is 'weightlifting'. */
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
import { askConfirm } from '../components/ConfirmSheet';
import {
  WL_AGES, weightClasses, categoryLabel, declareError, eligibleFor, wlMeetSettings, WL_RANGE,
  type Category, type WlAge, type LiftAttempt,
} from '../data/results';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }
interface Pick { playerId: string; sn: string; cj: string }

const kgOf = (t: string): number | undefined => { const v = Number(t.trim().replace(',', '.')); return t.trim() && Number.isFinite(v) ? v : undefined; };

export function WeightliftingEventSetup({ tournamentId }: { tournamentId?: string }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const settings = wlMeetSettings(tournament?.formats?.weightlifting as Record<string, unknown> | undefined);
  const [age, setAge] = useState<WlAge>('Senior');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const classes = useMemo(() => weightClasses(age, gender), [age, gender]);
  const [cls, setCls] = useState<string>(classes[3]);
  useEffect(() => { if (!classes.includes(cls)) setCls(classes[Math.min(3, classes.length - 1)]); }, [classes, cls]);
  const cat: Category = { age, gender, weightClass: cls };
  const adult = age === 'Senior' || age === 'Junior';

  // Teams / houses (as the athletics setup): the tournament's teams with their
  // rosters; before any are added, the houses from players' house names.
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
  const [picks, setPicks] = useState<Pick[]>([]);
  const pool = useMemo(() => {
    const src = filter ? sources.find((s) => s.key === filter) : undefined;
    const q = query.trim().toLowerCase();
    const base = src ? src.playerIds.map((id) => playerById.get(id)) : q ? players : sources.flatMap((s) => s.playerIds.map((id) => playerById.get(id)));
    const uniq = [...new Map(base.filter((p): p is Player => !!p).map((p) => [p.id, p])).values()];
    // gender only — IWF age groups go by year of birth and overlap (youth 13–17, junior 15–20)
    return uniq.filter((p) => p.fullName && (!eligibleOnly || eligibleFor({ gender }, { gender: p.gender, age: ageOf(p) })) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 60);
  }, [filter, query, sources, players, playerById, eligibleOnly, gender]);
  const toggle = (pid: string) => setPicks((ps) => (ps.some((x) => x.playerId === pid) ? ps.filter((x) => x.playerId !== pid) : [...ps, { playerId: pid, sn: '', cj: '' }]));

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setError(null);
    if (!picks.length) { setError('Add at least one lifter.'); return; }
    const entrants: NewEntrant[] = [];
    let odd = 0;
    for (const p of picks) {
      const name = playerById.get(p.playerId)?.fullName ?? 'Lifter';
      const lifts: { snatch?: LiftAttempt[]; cj?: LiftAttempt[] } = {};
      for (const [lift, text] of [['snatch', p.sn], ['cj', p.cj]] as const) {
        if (!text.trim()) continue;
        const kg = kgOf(text);
        const bad = kg == null ? 'Type the weight in kg.' : declareError([], 0, kg);
        if (bad) { setError(`${name} — ${lift === 'snatch' ? 'snatch' : 'C&J'} opening: ${bad}`); return; }
        const r = WL_RANGE[lift === 'snatch' ? 'wl.snatch' : 'wl.cj'];
        if (kg! < r.min || kg! > r.max) odd += 1;
        lifts[lift] = [{ kg: kg! }];
      }
      entrants.push({ playerId: p.playerId, name, team: teamOf(p.playerId), ...(lifts.snatch || lifts.cj ? { start: { lifts } } : {}) });
    }
    if (odd && !(await askConfirm({ title: 'Check the openings', message: `${odd} opening weight${odd === 1 ? ' is' : 's are'} outside the usual 5–280 kg. Create the event anyway?`, yesLabel: 'Yes, create', noLabel: 'No, fix them', tone: 'caution' }))) return;
    setBusy(true);
    try {
      const ev = await createResultsEvent({
        discipline: 'wl.total', category: cat, tournamentId, entrants, plan: [{ phase: 'final', heats: 1 }],
        // lot numbers are drawn (IWF): they set the order of weigh-in and of lifting at equal weights
        lanes: 'draw', title: categoryLabel(cat), startsAt: new Date().toISOString(),
      });
      nav.replace('ResultsEvent', { phaseId: ev.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🏋️ New weightlifting event" subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Category</Text>
          <View style={st.wrap}>{WL_AGES.map((a) => <SelectChip key={a.key} label={a.label} active={age === a.key} onPress={() => setAge(a.key)} />)}</View>
          <Text style={textStyles.muted}>{WL_AGES.find((a) => a.key === age)?.note}.</Text>
          <View style={st.wrap}>
            <SelectChip label={adult ? 'Men' : 'Boys'} active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label={adult ? 'Women' : 'Girls'} active={gender === 'F'} onPress={() => setGender('F')} />
          </View>
          <Text style={st.label}>Bodyweight category</Text>
          <View style={st.wrap}>{classes.map((c) => <SelectChip key={c} label={c} active={cls === c} onPress={() => setCls(c)} />)}</View>
          <Text style={textStyles.muted}>{age === 'School' ? 'School categories are a house choice — check them against your school board or federation.' : 'IWF bodyweight categories in force from 1 June 2025.'} One event per category: {categoryLabel(cat)}.</Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · Lifters ({picks.length})</Text>
          <View style={st.wrap}>
            <SelectChip label="All" active={filter == null} onPress={() => setFilter(null)} />
            {sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={filter === s.key} onPress={() => setFilter(s.key)} />)}
          </View>
          <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder="Search any player by name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search players" />
          <SelectChip label={eligibleOnly ? `✓ ${gender === 'M' ? (adult ? 'Men' : 'Boys') : (adult ? 'Women' : 'Girls')} only` : 'Showing everyone'} active={eligibleOnly} onPress={() => setEligibleOnly(!eligibleOnly)} />
          <View style={st.wrap}>
            {pool.map((p) => {
              const on = picks.some((x) => x.playerId === p.id);
              return <SelectChip key={p.id} label={`${on ? '✓ ' : ''}${p.fullName}`} dotColor={p.houseColor} active={on} onPress={() => toggle(p.id)} />;
            })}
            {!pool.length && <Text style={textStyles.muted}>No lifters match. Players without a gender are always shown.</Text>}
          </View>
          {picks.length > 0 && (
            <View style={{ gap: theme.spacing(2) }}>
              <Text style={st.label}>Opening weights (optional — or declare them at the weigh-in)</Text>
              <View style={st.pickRow}>
                <Text style={[st.head, { flex: 1 }]}>Lifter</Text>
                <Text style={[st.head, { width: 64, textAlign: 'center' }]}>Snatch</Text>
                <Text style={[st.head, { width: 64, textAlign: 'center' }]}>C&J</Text>
                <Text style={{ width: 18 }} />
              </View>
              {picks.map((p) => (
                <View key={p.playerId} style={st.pickRow}>
                  <Text style={[st.name, { flex: 1 }]} numberOfLines={1}>{playerById.get(p.playerId)?.fullName}</Text>
                  {(['sn', 'cj'] as const).map((k) => (
                    <TextInput key={k} style={[st.input, { width: 64 }]} value={p[k]} placeholder="kg" placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad"
                      accessibilityLabel={`${k === 'sn' ? 'Snatch' : 'Clean and jerk'} opening for ${playerById.get(p.playerId)?.fullName}`}
                      onChangeText={(t) => setPicks((ps) => ps.map((x) => (x.playerId === p.playerId ? { ...x, [k]: t } : x)))} />
                  ))}
                  <Text style={st.remove} onPress={() => toggle(p.playerId)}>✕</Text>
                </View>
              ))}
              <Text style={textStyles.muted}>Whole kilograms. Lot numbers are drawn when you create the event — they set the weigh-in order and who lifts first at equal weights.</Text>
            </View>
          )}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · How it runs</Text>
          <Text style={textStyles.muted}>
            Weigh-in, then the snatch and the clean & jerk — three attempts each. The bar only goes up: the lightest declared weight lifts next. Best snatch + best clean & jerk = the total; no good lift in either = no total. Equal totals: whoever lifted the total first ranks higher. {settings.liftMedals ? 'Medals for the snatch, the clean & jerk and the total (meet setting).' : 'Medals for the total (meet setting — turn on snatch and C&J medals in Weightlifting settings).'}
          </Text>
        </Card>

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create event & weigh-in list'} onPress={() => void create()} disabled={busy || !picks.length} />
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
  head: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  remove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(1) },
});
