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
import { CompetitionRulesCard } from '../components/results/CompetitionRulesCard';
import { ScheduleCard, useSchedule } from '../components/results/ScheduleCard';
import { Button, Card, FormError, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { usePlayers, useTournamentById } from '../data/hooks';
import { EventOfficials } from '../components/results/EventOfficials';
import { getTournamentTeams, getTeamRosters } from '../data/repos';
import { createResultsEvent, teamSourceEvents, memberScoresFrom, type NewEntrant } from '../data/resultsStore';
import {
  ARCH_ROUNDS, ARCH_AGES, BOW_LABEL, categoryLabel, eligibleFor, defaultRound, defaultBracket, bracketSize, roundLine, matchFormatOf,
  archTeamKey, matchSpecOf, fillFromIndividuals, bestOfHouse,
  type ArchAge, type Bow, type Category, type PlannedPhase, type MemberScore,
} from '../data/results';
import { TeamBuilder, newTeamDraft, type TeamDraft } from '../components/results/TeamBuilder';
import { matchRuleText } from '../components/results/ArcheryPanel';
import { sportRule } from '../data/results/competitionRules';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }

export function ArcheryEventSetup({ tournamentId }: { tournamentId?: string }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const [officials, setOfficials] = useState<string[]>([]); // SD-130: event officials (host_ids)
  const [bow, setBow] = useState<Bow>('R');
  const [indoor, setIndoor] = useState(false);
  const [age, setAge] = useState<ArchAge>('U18');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  // SD-137b: an individual event, a team of 3 or a mixed team (a man and a woman)
  const [mode, setMode] = useState<'ind' | 'team' | 'mixed'>('ind');
  const teamMode = mode !== 'ind';
  const [roundKey, setRoundKey] = useState(defaultRound('R', 'U18', false).key);
  useEffect(() => { setRoundKey(defaultRound(bow, age, indoor).key); }, [bow, age, indoor]);
  const round = ARCH_ROUNDS.find((r) => r.key === roundKey) ?? defaultRound(bow, age, indoor);
  const adult = age === 'Senior' || age === 'Junior';
  const cat: Category = { age, gender: mode === 'mixed' ? 'X' : gender };
  const discipline = teamMode ? archTeamKey(round.key, mode as 'team' | 'mixed') : round.key;

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

  /* ---------------------- SD-137b: team / mixed team ---------------------- */
  const archFmt = tournament?.formats?.archery as Record<string, unknown> | undefined;
  const [srcEvents, setSrcEvents] = useState<{ eventKey: string; title: string; category?: Category; entries: number }[]>([]);
  const [srcPicked, setSrcPicked] = useState<string[] | null>(null);
  const [lookup, setLookup] = useState<Map<string, MemberScore>>(new Map());
  const [teams, setTeams] = useState<TeamDraft[]>([]);
  useEffect(() => {
    let on = true;
    if (!teamMode) { setSrcEvents([]); return; }
    // the individual ranking rounds of this round and age group (mixed: men's and women's)
    void teamSourceEvents(tournamentId, round.key).then((list) => {
      if (!on) return;
      setSrcEvents(list.filter((e) => (e.category?.age ?? age) === age && (mode === 'mixed' || (e.category?.gender ?? gender) === gender)));
      setSrcPicked(null);
    }).catch(() => {});
    return () => { on = false; };
  }, [teamMode, tournamentId, round.key, age, gender, mode]);
  const srcKeys = srcPicked ?? srcEvents.map((e) => e.eventKey);
  useEffect(() => {
    let on = true;
    if (!srcKeys.length) { setLookup(new Map()); return; }
    void memberScoresFrom(srcKeys).then((m) => on && setLookup(m)).catch(() => {});
    return () => { on = false; };
  }, [srcKeys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const seatNames = mode === 'mixed' ? ['Man', 'Woman'] : ['Archer 1', 'Archer 2', 'Archer 3'];
  const fitsSeat = (p: Player, i: number) => eligibleFor({ gender: mode === 'mixed' ? (i === 0 ? 'M' : 'F') : gender }, { gender: p.gender, age: ageOf(p) });
  const best = useMemo(() => bestOfHouse(sources.flatMap((s) => s.playerIds.map((pid) => ({ playerId: pid, teamKey: s.key, mark: lookup.get(pid)?.mark, gender: playerById.get(pid)?.gender }))), mode === 'mixed' ? 2 : 3, mode === 'mixed'), [sources, lookup, playerById, mode]);
  const suggest = (src: { key: string; playerIds: string[] }) => [...src.playerIds].filter((pid) => lookup.get(pid)?.mark != null).sort((a, b) => (lookup.get(b)!.mark ?? 0) - (lookup.get(a)!.mark ?? 0));
  const fillAll = () => setTeams(sources.filter((s) => best.has(s.key)).map((s) => newTeamDraft(s, [], seatNames.length, best.get(s.key))));
  // SD-141 "best scorers": every house's team is filled from the ranking round when it loads
  useEffect(() => { if (teamMode && !teams.length && best.size && sportRule(archFmt, 'teamPick') === 'best') fillAll(); }, [best]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTeams([]); }, [mode, gender]);
  const entrants = teamMode ? teams.length : picks.length;

  const [bracketN, setBracketN] = useState<number | null>(null);
  // SD-141: the meet's bracket size (Competition rules), else the biggest that fits
  const ruleN = sportRule(archFmt, teamMode ? 'archTeamBracket' : 'archBracket');
  const field = Math.min(bracketN ?? (ruleN === 'auto' ? Math.min(defaultBracket(entrants), teamMode ? 16 : 32) : Number(ruleN) || 0), entrants);
  const withMatches = field >= 2 && entrants >= 2;
  const choices = [...new Set([0, 4, 8, 16, 32, 64].filter((k) => k <= entrants).concat(entrants >= 3 && entrants <= 64 ? [entrants] : []))].sort((a, b) => a - b);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const schedule = useSchedule(); // SD-129
  const create = async () => {
    setError(null);
    if (!entrants) { setError(teamMode ? 'Add at least one team.' : 'Add at least one archer.'); return; }
    let list: NewEntrant[];
    if (teamMode) {
      const open = teams.find((t) => t.seats.some((x) => !x));
      if (open) { setError(`${open.name}: pick ${mode === 'mixed' ? 'a man and a woman' : 'all three archers'}.`); return; }
      const twice = teams.flatMap((t) => t.seats).find((x, i, all) => all.indexOf(x) !== i);
      if (twice) { setError(`${nameOf(twice)} is in two teams.`); return; }
      list = teams.map((t) => {
        const src = sources.find((s) => s.key === t.source) ?? sources.find((s) => s.playerIds.includes(t.seats[0]!));
        const members = t.seats.map((pid) => ({ playerId: pid!, name: nameOf(pid!) }));
        const filled = fillFromIndividuals({ members }, lookup, discipline).result;
        return { name: t.name.trim() || src?.name || 'Team', team: src ? { id: src.teamId, name: src.name, colorHex: src.colorHex } : undefined, members, start: { ms: filled.ms, mark: filled.mark, tens: filled.tens, xs: filled.xs } };
      });
    } else list = picks.map((pid) => ({ playerId: pid, name: nameOf(pid), team: teamOf(pid) }));
    const plan: PlannedPhase[] = withMatches
      ? [{ phase: 'qualification', heats: 1, progression: { fillTo: field } }, { phase: 'final', heats: 1 }]
      : [{ phase: 'final', heats: 1 }];
    setBusy(true);
    try {
      const evt = await createResultsEvent({
        hostIds: officials,
        discipline, category: cat, tournamentId, entrants: list, plan,
        // target order is drawn (start list order)
        lanes: 'draw', title: `${round.label}${teamMode ? (mode === 'mixed' ? ' mixed team' : ' team') : ''} ${categoryLabel(cat)}`, startsAt: schedule.startsAt, sched: schedule.value,
        ...(teamMode && srcKeys.length ? { teamFrom: { eventKeys: srcKeys } } : {}),
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
        {/* SD-141: the meet's competition rules, checked before the meet starts */}
        <CompetitionRulesCard tournament={tournament} sport={'archery'} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Bow & round</Text>
          <View style={st.wrap}>
            <SelectChip label="Individual" active={mode === 'ind'} onPress={() => setMode('ind')} />
            <SelectChip label="Team (3)" active={mode === 'team'} onPress={() => setMode('team')} />
            <SelectChip label="Mixed team (1 + 1)" active={mode === 'mixed'} onPress={() => setMode('mixed')} />
          </View>
          {teamMode ? <Text style={textStyles.muted}>{mode === 'team' ? 'Three archers of one gender' : 'A man and a woman'}: the team score is their ranking-round scores added; the best teams go to team match play — {matchRuleText(matchFormatOf(bow), matchSpecOf(discipline))}</Text> : null}
          <View style={st.wrap}>{(['R', 'C', 'B'] as Bow[]).map((b) => <SelectChip key={b} label={BOW_LABEL[b]} active={bow === b} onPress={() => setBow(b)} />)}</View>
          <View style={st.wrap}>
            <SelectChip label="Outdoor (72 arrows)" active={!indoor} onPress={() => setIndoor(false)} />
            <SelectChip label="Indoor 18 m (60 arrows)" active={indoor} onPress={() => setIndoor(true)} />
          </View>
          <View style={st.wrap}>{ARCH_AGES.map((a) => <SelectChip key={a.key} label={a.label} active={age === a.key} onPress={() => setAge(a.key)} />)}</View>
          <Text style={textStyles.muted}>{ARCH_AGES.find((a) => a.key === age)?.note}.</Text>
          {mode !== 'mixed' ? (
            <View style={st.wrap}>
              <SelectChip label={adult ? 'Men' : 'Boys'} active={gender === 'M'} onPress={() => setGender('M')} />
              <SelectChip label={adult ? 'Women' : 'Girls'} active={gender === 'F'} onPress={() => setGender('F')} />
            </View>
          ) : null}
          <Text style={st.label}>Round</Text>
          <View style={st.wrap}>
            {rounds.map((r) => <SelectChip key={r.key} label={`${r.distance} m${r.level === 'wa' ? ' (WA)' : ''}`} active={round.key === r.key} onPress={() => setRoundKey(r.key)} />)}
          </View>
          <Text style={textStyles.muted}>{roundLine(round)} — {round.note}. Each distance keeps its own records and PBs. Event: {round.label}{teamMode ? (mode === 'mixed' ? ' mixed team' : ' team') : ''} {categoryLabel(cat)}.</Text>
        </Card>

        {teamMode ? (
          <Card style={st.card}>
            <Text style={textStyles.h3}>2 · Teams ({teams.length})</Text>
            <Text style={st.label}>Scores from the ranking round{srcEvents.length !== 1 ? 's' : ''}</Text>
            {srcEvents.length ? (
              <View style={st.wrap}>
                {srcEvents.map((e) => {
                  const on = srcKeys.includes(e.eventKey);
                  return <SelectChip key={e.eventKey} label={`${on ? '✓ ' : ''}${e.title}`} active={on} onPress={() => setSrcPicked(on ? srcKeys.filter((k) => k !== e.eventKey) : [...srcKeys, e.eventKey])} />;
                })}
              </View>
            ) : <Text style={textStyles.muted}>No {round.label} {mode === 'mixed' ? '' : categoryLabel(cat)} ranking round in this meet yet — add the individual event first, or type each member’s score on the team ranking.</Text>}
            {best.size ? <SelectChip label={`Fill every house’s team with its best ${mode === 'mixed' ? 'man and woman' : '3'}`} active={false} onPress={fillAll} /> : null}
            <TeamBuilder sources={sources} playerById={playerById} players={players} seatNames={seatNames} fits={fitsSeat} teams={teams} onChange={setTeams}
              suggest={lookup.size ? suggest : undefined} hint={`Add a team from a house, then pick its ${mode === 'mixed' ? 'man and woman' : 'three archers'} — or “Fill”.`} />
          </Card>
        ) : null}

        {!teamMode ? <Card style={st.card}>
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
        </Card> : null}

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · Match play</Text>
          {choices.length > 1 ? (
            <View style={st.wrap}>
              {choices.filter((k) => !teamMode || k <= 16).map((k) => <SelectChip key={k} label={k ? (k === entrants && (k & (k - 1)) !== 0 ? `All ${k} (byes)` : `Top ${k}`) : 'No match play'} active={(withMatches ? field : 0) === k} onPress={() => setBracketN(k)} />)}
            </View>
          ) : null}
          <Text style={textStyles.muted}>
            {withMatches
              ? `The best ${field}${teamMode ? ' teams' : ''} after the ${teamMode ? 'team ranking' : 'ranking round'} are seeded into a bracket of ${size} (1 v ${size}, ${size / 2} v ${size / 2 + 1} …)${size > field ? `; the top ${size - field} seed${size - field === 1 ? '' : 's'} get a bye` : ''}. ${teamMode ? matchRuleText(matchFormatOf(bow), matchSpecOf(discipline)) : matchFormatOf(bow) === 'sets' ? 'Set system: ends of 3 arrows, 2 set points for the higher end, 1 each for a tie, first to 6; 5–5 → a one-arrow shoot-off.' : 'Compound: 5 ends of 3 arrows, the higher total wins; level → a one-arrow shoot-off.'} The semi-final losers shoot for bronze.`
              : `No match play: the ${teamMode ? 'team ranking' : 'ranking round'} decides the medals (a tie for a medal: a shoot-off).`}
          </Text>
          <Text style={textStyles.muted}>Ranking ties (WA): the higher score, then more 10s (X included), then more X. Level for the last match-play place: a shoot-off; other equal ranks: a coin toss for the seed.</Text>
        </Card>

        <ScheduleCard state={schedule} tournamentId={tournamentId} discipline={discipline} plan={withMatches ? [{ phase: 'qualification', heats: 1 }, { phase: 'final', heats: 1 }] : undefined} athleteIds={teamMode ? teams.flatMap((t) => t.seats.filter((x): x is string => !!x)) : picks} />
        <EventOfficials tournament={tournament} value={officials} onChange={setOfficials} />
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
