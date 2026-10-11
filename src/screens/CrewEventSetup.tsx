/** SD-99 / SD-100 — add a rowing or canoe sprint race to a regatta: the boat
 *  class (1x … 8+ / K1 … C4) and distance, the category (age, gender;
 *  rowing: lightweight or para PR1–PR3), the crews — picked seat by seat from
 *  a team / house's members (bow … stroke, then the cox) or, in a single, the
 *  scullers / paddlers — the progression (World Rowing / ICF presets by the
 *  number of crews, or a custom rule) and the lanes. Heats and lanes are
 *  drawn. Rendered by AthleticsEventSetupScreen for sport 'rowing' / 'canoe'. */
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
  ROW_BOATS, CANOE_BOATS, ROW_DISTANCES, CANOE_DISTANCES, crewKey, crewEventOf, seatNames, crewError, crewRoundPresets, customCrewPlan,
  describeCrewPlan, crewMeetSettings, categoryLabel, eligibleFor, markRange, formatMark, disciplineOf,
  type Category, type CrewSport, type PlannedPhase,
} from '../data/results';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }
interface Crew { id: string; source?: string; name: string; seats: (string | null)[] }

const AGES = [
  { key: 'U14', label: 'U14' }, { key: 'U16', label: 'U16' }, { key: 'Junior', label: 'Junior (U19)' },
  { key: 'U23', label: 'U23' }, { key: 'Senior', label: 'Senior' }, { key: 'Masters', label: 'Masters' },
];
const ROW_CLASSES = ['Open', 'Lightweight', 'PR1', 'PR2', 'PR3'];
let seq = 0;

export function CrewEventSetup({ tournamentId, sport }: { tournamentId?: string; sport: CrewSport }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const rowing = sport === 'rowing';
  const meet = crewMeetSettings(sport, tournament?.formats?.[sport] as Record<string, unknown> | undefined);
  const boats = rowing ? ROW_BOATS : CANOE_BOATS;
  const [boat, setBoat] = useState(boats[0].code);
  const [distance, setDistance] = useState(rowing ? 2000 : 500);
  const [age, setAge] = useState('Senior');
  const [gender, setGender] = useState<'M' | 'F' | 'X'>('M');
  const [cls, setCls] = useState('Open');
  const ev = crewEventOf(crewKey(sport, boat, distance))!;
  const seats = seatNames(ev);
  const single = seats.length === 1;
  const adult = /^(Senior|Junior|U23|Masters)$/.test(age);
  const cat: Category = { age, gender, ...(rowing && cls !== 'Open' ? { weightClass: cls } : {}) };
  const range = markRange(ev.key);
  const def = disciplineOf(ev.key)!;

  // Teams / houses: the tournament's teams with their rosters; before any are
  // added, the houses from players' house names (as the other event setups).
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
  const sourceOf = (pid: string) => sources.find((x) => x.playerIds.includes(pid));
  const teamOf = (s?: Source) => (s ? { id: s.teamId, name: s.name, colorHex: s.colorHex } : undefined);
  const nameOf = (pid: string) => playerById.get(pid)?.fullName ?? 'Rower';
  // a mixed boat (canoe sprint X, rowing PR2 / PR3 mixed) takes anyone
  const fits = (p: Player) => gender === 'X' || eligibleFor({ gender }, { gender: p.gender, age: ageOf(p) });

  /* ------------------------------ entries ------------------------------ */
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [picks, setPicks] = useState<string[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [active, setActive] = useState<{ crew: string; seat: number } | null>(null);
  // a new boat class: crews get its seat count (members kept in order)
  useEffect(() => { setCrews((cs) => cs.map((c) => ({ ...c, seats: seats.map((_, i) => c.seats[i] ?? null) }))); setActive(null); }, [boat]); // eslint-disable-line react-hooks/exhaustive-deps
  const taken = useMemo(() => new Set(crews.flatMap((c) => c.seats.filter((x): x is string => !!x))), [crews]);
  const pool = (src?: Source) => {
    const q = query.trim().toLowerCase();
    const base = src ? src.playerIds.map((id) => playerById.get(id)) : q ? players : sources.flatMap((s) => s.playerIds.map((id) => playerById.get(id)));
    const uniq = [...new Map(base.filter((p): p is Player => !!p).map((p) => [p.id, p])).values()];
    return uniq.filter((p) => p.fullName && (!eligibleOnly || fits(p)) && (!q || p.fullName.toLowerCase().includes(q))).slice(0, 60);
  };
  const singlePool = useMemo(() => pool(filter ? sources.find((s) => s.key === filter) : undefined), [filter, query, sources, players, eligibleOnly, gender]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (pid: string) => setPicks((ps) => (ps.includes(pid) ? ps.filter((x) => x !== pid) : [...ps, pid]));

  const addCrew = (src?: Source) => {
    const n = crews.filter((c) => c.source === src?.key).length;
    const id = `c${++seq}`;
    const name = src ? `${src.name} ${String.fromCharCode(65 + n)}` : `Crew ${crews.length + 1}`;
    setCrews((cs) => [...cs, { id, source: src?.key, name, seats: seats.map(() => null) }]);
    setActive({ crew: id, seat: 0 });
  };
  /** Fill a crew's empty seats from its team's eligible members, in roster order. */
  const fillCrew = (id: string) => { setActive(null); fillSeats(id); };
  const fillSeats = (id: string) => setCrews((cs) => {
    const used = new Set(cs.flatMap((c) => c.seats.filter((x): x is string => !!x)));
    return cs.map((c) => {
      if (c.id !== id) return c;
      const src = sources.find((s) => s.key === c.source);
      const free = (src ? src.playerIds : []).map((x) => playerById.get(x)).filter((p): p is Player => !!p && fits(p) && !used.has(p.id)).map((p) => p.id);
      return { ...c, seats: c.seats.map((x) => x ?? free.shift() ?? null) };
    });
  });
  const assign = (pid: string) => {
    if (!active) return;
    setCrews((cs) => cs.map((c) => {
      if (c.id !== active.crew) return c;
      const next = [...c.seats];
      next[active.seat] = pid;
      return { ...c, seats: next };
    }));
    // on to the next empty seat of this crew
    const c = crews.find((x) => x.id === active.crew);
    const nxt = c ? c.seats.findIndex((x, i) => i > active.seat && !x) : -1;
    setActive(nxt >= 0 ? { crew: active.crew, seat: nxt } : null);
  };
  const clearSeat = (crew: string, seat: number) => {
    setCrews((cs) => cs.map((c) => (c.id === crew ? { ...c, seats: c.seats.map((x, i) => (i === seat ? null : x)) } : c)));
    setActive({ crew, seat });
  };
  const entrants = single ? picks.length : crews.length;

  /* ---------------------------- progression ---------------------------- */
  const [lanes, setLanes] = useState(meet.lanes);
  const presets = useMemo(() => crewRoundPresets(sport, entrants, lanes), [sport, entrants, lanes]);
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [custom, setCustom] = useState({ heats: 2, direct: 1, repechage: true, finalB: true });
  const preset = presets.find((p) => p.key === presetKey) ?? presets[0];
  const plan: PlannedPhase[] = presetKey === 'custom' ? customCrewPlan(entrants, lanes, custom) : preset?.plan ?? [{ phase: 'final', heats: 1 }];
  const overfull = plan[0] && Math.ceil(entrants / Math.max(1, plan[0].heats)) > lanes;
  const [splits, setSplits] = useState(meet.splits);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setError(null);
    if (!entrants) { setError(single ? `Add at least one ${rowing ? 'sculler' : 'paddler'}.` : 'Add at least one crew.'); return; }
    if (overfull) { setError(`More ${single ? 'boats' : 'crews'} per race than lanes (${lanes}) — add a heat or pick another progression.`); return; }
    let list: NewEntrant[];
    if (single) list = picks.map((pid) => ({ playerId: pid, name: nameOf(pid), team: teamOf(sourceOf(pid)) }));
    else {
      for (const c of crews) {
        const members = c.seats.map((pid, i) => (pid ? { playerId: pid, name: nameOf(pid), ...(ev.boat.cox && i === seats.length - 1 ? { cox: true } : {}) } : undefined));
        const err = crewError(ev.key, members);
        if (err) { setError(`${c.name}: ${err}`); return; }
      }
      list = crews.map((c) => {
        const src = sources.find((s) => s.key === c.source) ?? sourceOf(c.seats.find((x): x is string => !!x) ?? '');
        return {
          name: c.name, team: teamOf(src),
          members: c.seats.map((pid, i) => ({ playerId: pid!, name: nameOf(pid!), ...(ev.boat.cox && i === seats.length - 1 ? { cox: true } : {}) })),
        };
      });
    }
    setBusy(true);
    try {
      const created = await createResultsEvent({
        discipline: ev.key, category: cat, tournamentId, entrants: list, plan, lanes: 'draw', venueLanes: lanes,
        handTimed: meet.handTimed, splits, title: `${ev.label} ${categoryLabel(cat)}`, startsAt: new Date().toISOString(),
      });
      nav.replace('ResultsEvent', { phaseId: created.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const word = single ? (rowing ? 'Scullers' : 'Paddlers') : 'Crews';
  const distances = rowing ? ROW_DISTANCES : CANOE_DISTANCES;
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={rowing ? '🚣 New rowing race' : '🛶 New canoe sprint race'} subtitle={tournament?.name} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Boat & distance</Text>
          <View style={st.wrap}>{boats.map((b) => <SelectChip key={b.code} label={b.short} active={boat === b.code} onPress={() => setBoat(b.code)} />)}</View>
          <Text style={textStyles.muted}>{ev.boat.label}{ev.boat.cox ? ' (with a cox)' : ''} — {seats.join(', ')}.</Text>
          <View style={st.wrap}>{distances.map((d) => <SelectChip key={d} label={`${d} m`} active={distance === d} onPress={() => setDistance(d)} />)}</View>
          <Text style={textStyles.muted}>{rowing ? '2000 m is the championship distance; 1000 m for masters, 1500 / 1000 / 500 m for school and junior regattas.' : 'Olympic sprint distances are 200, 500 and 1000 m; 5000 m is the long-distance race (no lanes after the start).'}</Text>
          <View style={st.wrap}>{AGES.map((a) => <SelectChip key={a.key} label={a.label} active={age === a.key} onPress={() => setAge(a.key)} />)}</View>
          <View style={st.wrap}>
            <SelectChip label={adult ? 'Men' : 'Boys'} active={gender === 'M'} onPress={() => setGender('M')} />
            <SelectChip label={adult ? 'Women' : 'Girls'} active={gender === 'F'} onPress={() => setGender('F')} />
            {(!single || !rowing) && <SelectChip label="Mixed" active={gender === 'X'} onPress={() => setGender('X')} />}
          </View>
          {rowing && (
            <View style={st.wrap}>{ROW_CLASSES.map((c) => <SelectChip key={c} label={c} active={cls === c} onPress={() => setCls(c)} />)}</View>
          )}
          {rowing && cls !== 'Open' ? <Text style={textStyles.muted}>{cls === 'Lightweight' ? 'Lightweight: crews are weighed before racing (the weigh-in itself is not recorded here).' : `Para rowing ${cls}: classified athletes; para events race 2000 m.`} Records and bests stay apart from open boats.</Text> : null}
          <Text style={textStyles.muted}>Event: {ev.label} {categoryLabel(cat)}{range ? ` · usual times ${formatMark(range.min, def)} – ${formatMark(range.max, def)} (outside that asks to confirm)` : ''}.</Text>
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>2 · {word} ({entrants})</Text>
          <TextInput style={st.input} value={query} onChangeText={setQuery} placeholder="Search any player by name" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Search players" />
          <SelectChip label={eligibleOnly ? `✓ ${gender === 'X' ? 'Everyone (mixed)' : gender === 'M' ? (adult ? 'Men' : 'Boys') : (adult ? 'Women' : 'Girls')} only` : 'Showing everyone'} active={eligibleOnly} onPress={() => setEligibleOnly(!eligibleOnly)} />
          {single ? (
            <>
              <View style={st.wrap}>
                <SelectChip label="All" active={filter == null} onPress={() => setFilter(null)} />
                {sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={filter === s.key} onPress={() => setFilter(s.key)} />)}
              </View>
              <View style={st.wrap}>
                {singlePool.map((p) => {
                  const on = picks.includes(p.id);
                  return <SelectChip key={p.id} label={`${on ? '✓ ' : ''}${p.fullName}`} dotColor={p.houseColor} active={on} onPress={() => toggle(p.id)} />;
                })}
                {!singlePool.length && <Text style={textStyles.muted}>Nobody matches. Players without a gender are always shown.</Text>}
              </View>
            </>
          ) : (
            <>
              <Text style={st.label}>＋ Add a crew from</Text>
              <View style={st.wrap}>
                {sources.map((s) => <SelectChip key={s.key} label={s.name} dotColor={s.colorHex} active={false} onPress={() => addCrew(s)} />)}
                <SelectChip label="Any players" active={false} onPress={() => addCrew()} />
              </View>
              {crews.map((c) => {
                const src = sources.find((s) => s.key === c.source);
                const err = crewError(ev.key, c.seats.map((pid, i) => (pid ? { playerId: pid, name: nameOf(pid), ...(ev.boat.cox && i === seats.length - 1 ? { cox: true } : {}) } : undefined)));
                const open = active?.crew === c.id;
                return (
                  <View key={c.id} style={[st.crew, open && { borderColor: theme.colors.primary }]}>
                    <View style={st.crewHead}>
                      <TextInput style={[st.input, { flex: 1 }]} value={c.name} onChangeText={(t) => setCrews((cs) => cs.map((x) => (x.id === c.id ? { ...x, name: t } : x)))} accessibilityLabel="Crew name" />
                      <SelectChip label="✕" active={false} onPress={() => { setCrews((cs) => cs.filter((x) => x.id !== c.id)); if (open) setActive(null); }} />
                    </View>
                    <View style={st.wrap}>
                      {seats.map((sn, i) => {
                        const pid = c.seats[i];
                        const on = open && active?.seat === i;
                        return <SelectChip key={i} label={`${sn}: ${pid ? nameOf(pid).split(' ')[0] : '—'}`} active={on} onPress={() => (pid && !on ? clearSeat(c.id, i) : setActive({ crew: c.id, seat: i }))} />;
                      })}
                    </View>
                    {src && c.seats.some((x) => !x) ? <SelectChip label={`Fill empty seats from ${src.name}`} active={false} onPress={() => fillCrew(c.id)} /> : null}
                    {open ? (
                      <>
                        <Text style={textStyles.muted}>Tap a player for {seats[active!.seat]}{src ? ` (${src.name})` : ''}; tap a filled seat to clear it.</Text>
                        <View style={st.wrap}>
                          {pool(src).filter((p) => !taken.has(p.id)).map((p) => <SelectChip key={p.id} label={p.fullName} dotColor={p.houseColor} active={false} onPress={() => assign(p.id)} />)}
                        </View>
                      </>
                    ) : null}
                    {err ? <Text style={textStyles.muted}>{err}</Text> : <Text style={textStyles.muted}>✓ Crew complete.</Text>}
                  </View>
                );
              })}
              {!crews.length && <Text style={textStyles.muted}>Add a crew from a team or house, then pick its {rowing ? 'rowers seat by seat (bow first)' : 'paddlers seat by seat (front first)'}{ev.boat.cox ? ' and the cox' : ''} — or “Fill empty seats”.</Text>}
            </>
          )}
        </Card>

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · Lanes & progression</Text>
          <View style={st.wrap}>
            {(rowing ? [4, 5, 6, 8] : [5, 6, 8, 9]).map((n) => <SelectChip key={n} label={`${n} lanes`} active={lanes === n} onPress={() => setLanes(n)} />)}
          </View>
          {entrants > 0 ? (
            <>
              <View style={st.wrap}>
                {presets.map((p) => <SelectChip key={p.key} label={p.label} active={presetKey !== 'custom' && preset?.key === p.key} onPress={() => setPresetKey(p.key)} />)}
                {entrants > lanes && <SelectChip label="Custom rule" active={presetKey === 'custom'} onPress={() => setPresetKey('custom')} />}
              </View>
              {presetKey === 'custom' && (
                <View style={{ gap: theme.spacing(2) }}>
                  <View style={st.wrap}>
                    <Text style={st.label}>Heats</Text>
                    {[1, 2, 3, 4, 5, 6].map((h) => <SelectChip key={h} label={String(h)} active={custom.heats === h} onPress={() => setCustom({ ...custom, heats: h })} />)}
                  </View>
                  <View style={st.wrap}>
                    <Text style={st.label}>Straight to Final A per heat</Text>
                    {[1, 2, 3].map((d) => <SelectChip key={d} label={String(d)} active={custom.direct === d} onPress={() => setCustom({ ...custom, direct: d })} />)}
                  </View>
                  <View style={st.wrap}>
                    <SelectChip label="Rest → repechage" active={custom.repechage} onPress={() => setCustom({ ...custom, repechage: !custom.repechage })} />
                    <SelectChip label="Final B" active={custom.finalB} onPress={() => setCustom({ ...custom, finalB: !custom.finalB })} />
                  </View>
                </View>
              )}
              <Text style={textStyles.body}>{describeCrewPlan(plan)}</Text>
              {overfull ? <Text style={st.bad}>More {single ? 'boats' : 'crews'} per race than lanes — add a heat.</Text> : null}
              <Text style={textStyles.muted}>
                {rowing
                  ? 'World Rowing progression (Rules of Racing, progression-system tables): heat winners go straight on, the repechage fills the next round, the rest race the lower final. Finals A / B: Final B’s winner places after Final A’s last.'
                  : 'ICF progression (Canoe Sprint Competition Rules, heats / semi-finals / finals by number of boats): the best of the heats may go straight to Final A; the semi-finals fill it, the next go to Final B.'}
                {' '}Heats and lanes are drawn; later rounds put the best ranked in the centre lanes. A dead heat on a qualifying line: both go through unless a re-row / draw is entered.
              </Text>
            </>
          ) : <Text style={textStyles.muted}>Add {single ? (rowing ? 'scullers' : 'paddlers') : 'crews'} to see the progression.</Text>}
          {crewEventOfSplits(ev.key) ? <SelectChip label={splits ? `✓ ${rowing ? '500 m splits' : 'Intermediate times'}` : `${rowing ? '500 m splits' : 'Intermediate times'} off`} active={splits} onPress={() => setSplits(!splits)} /> : null}
          <Text style={textStyles.muted}>{meet.handTimed ? 'Hand timing (regatta setting): times to 1/100.' : 'Photo finish: type thousandths with the “.000” chip — they decide the order; the official time shows to 1/100.'}</Text>
        </Card>

        <FormError message={error} />
        <Button label={busy ? 'Creating…' : 'Create race & draw lanes'} onPress={() => void create()} disabled={busy || !entrants} />
      </ScrollView>
    </SafeAreaView>
  );
}

const crewEventOfSplits = (key: string) => (crewEventOf(key)?.distance ?? 0) > 200;

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(12) },
  card: { gap: theme.spacing(2) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  bad: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  crew: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.spacing(2.5), gap: theme.spacing(2) },
  crewHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
});
