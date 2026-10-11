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
import { CompetitionRulesCard } from '../components/results/CompetitionRulesCard';
import { ScheduleCard, useSchedule } from '../components/results/ScheduleCard';
import { Button, Card, FormError, SelectChip, ScreenTitle, textStyles } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';
import { usePlayers, useTournamentById } from '../data/hooks';
import { EventOfficials } from '../components/results/EventOfficials';
import { getTournamentTeams, getTeamRosters } from '../data/repos';
import { createResultsEvent, teamSourceEvents, memberScoresFrom, type NewEntrant } from '../data/resultsStore';
import {
  SHOOT_EVENTS, SHOOT_AGES, categoryLabel, eligibleFor, defaultShots, defaultFinalists, seriesCount, finalSchedule,
  shootTeamKey, fillFromIndividuals, bestOfHouse, SHOOT_MATCH_TEAMS, scoreText,
  type Category, type ShootAge, type PlannedPhase, type MemberScore,
} from '../data/results';
import { TeamBuilder, newTeamDraft, type TeamDraft } from '../components/results/TeamBuilder';
import { sportRule } from '../data/results/competitionRules';
import { ageOf } from '../core/age';
import type { Player } from '../core/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
interface Source { key: string; name: string; colorHex?: string; teamId?: string; playerIds: string[] }

export function ShootingEventSetup({ tournamentId }: { tournamentId?: string }) {
  const nav = useNavigation<Nav>();
  const tournament = useTournamentById(tournamentId);
  const players = usePlayers();
  const [officials, setOfficials] = useState<string[]>([]); // SD-130: event officials (host_ids)
  const [evKey, setEvKey] = useState(SHOOT_EVENTS[0].key);
  const ev = SHOOT_EVENTS.find((e) => e.key === evKey)!;
  const team = !!ev.teamSize;
  // SD-137b: a team of 3 on an individual event (the members' match scores added)
  const [of3, setOf3] = useState(false);
  const team3 = of3 && !team;
  const [age, setAge] = useState<ShootAge>('Junior');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [shots, setShots] = useState<number>(defaultShots(ev, 'Junior'));
  useEffect(() => { setShots(defaultShots(ev, age)); }, [evKey, age]); // eslint-disable-line react-hooks/exhaustive-deps
  const adult = age === 'Senior' || age === 'Junior';
  const cat: Category = { age, gender: team ? 'X' : gender, ...(shots !== ev.shots ? { shots } : {}) };
  const discipline = team3 ? shootTeamKey(ev.key) : ev.key;

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

  /* ---------------------------- SD-137b: teams of 3 ---------------------------- */
  const shootFmt = tournament?.formats?.shooting as Record<string, unknown> | undefined;
  const [srcEvents, setSrcEvents] = useState<{ eventKey: string; title: string; category?: Category }[]>([]);
  const [srcPicked, setSrcPicked] = useState<string[] | null>(null);
  const [lookup, setLookup] = useState<Map<string, MemberScore>>(new Map());
  const [teams, setTeams] = useState<TeamDraft[]>([]);
  useEffect(() => {
    let on = true;
    if (!team3) { setSrcEvents([]); return; }
    // the individual matches of this event, age group, gender and match length
    void teamSourceEvents(tournamentId, ev.key).then((list) => {
      if (!on) return;
      setSrcEvents(list.filter((e) => (e.category?.age ?? age) === age && (e.category?.gender ?? gender) === gender && (e.category?.shots ?? ev.shots) === shots));
      setSrcPicked(null);
    }).catch(() => {});
    return () => { on = false; };
  }, [team3, tournamentId, ev.key, age, gender, shots, ev.shots]);
  const srcKeys = srcPicked ?? srcEvents.map((e) => e.eventKey);
  useEffect(() => {
    let on = true;
    if (!srcKeys.length) { setLookup(new Map()); return; }
    void memberScoresFrom(srcKeys).then((m) => on && setLookup(m)).catch(() => {});
    return () => { on = false; };
  }, [srcKeys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = useMemo(() => bestOfHouse(sources.flatMap((s) => s.playerIds.map((pid) => ({ playerId: pid, teamKey: s.key, mark: lookup.get(pid)?.mark }))), 3), [sources, lookup]);
  const suggest = (src: { playerIds: string[] }) => [...src.playerIds].filter((pid) => lookup.get(pid)?.mark != null).sort((a, b) => (lookup.get(b)!.mark ?? 0) - (lookup.get(a)!.mark ?? 0));
  const fillAll = () => setTeams(sources.filter((s) => best.has(s.key)).map((s) => newTeamDraft(s, [], 3, best.get(s.key))));
  useEffect(() => { if (team3 && !teams.length && best.size && sportRule(shootFmt, 'teamPick') === 'best') fillAll(); }, [best]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTeams([]); }, [team3, gender, evKey]);
  const entrants = team3 ? teams.length : team ? pairs.length : picks.length;
  // SD-137b: ISSF mixed team medal matches (the best 4 teams; the meet may rank on the total instead)
  const [matchesPick, setMatchesPick] = useState<boolean | null>(null);
  const medalMatches = team && entrants >= SHOOT_MATCH_TEAMS && (matchesPick ?? sportRule(shootFmt, 'shootMixedFinal') === 'matches');

  const [mode, setMode] = useState<'series' | 'shot'>('series');
  const [finalists, setFinalists] = useState<number | null>(null);
  // SD-141: the meet's final size (Competition rules) when it fits, else by entries
  const ruleFin = sportRule(tournament?.formats?.shooting as Record<string, unknown> | undefined, 'shootFinal');
  const ruleDefault = ruleFin === 'auto' ? defaultFinalists(ev, entrants) : Number(ruleFin) === 0 ? 0 : Number(ruleFin) < entrants ? Number(ruleFin) : defaultFinalists(ev, entrants);
  const fin = ev.final && !team && !team3 ? (finalists ?? ruleDefault) : 0;
  const finalOk = fin >= 3 && fin < entrants;

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const schedule = useSchedule(); // SD-129
  const create = async () => {
    setError(null);
    if (!entrants) { setError(team3 ? 'Add at least one team of 3.' : team ? 'Add the shooters in pairs (a team is two).' : 'Add at least one shooter.'); return; }
    if (team && picks.length % 2) { setError(`${nameOf(picks[picks.length - 1])} has no partner yet — a mixed team is two shooters.`); return; }
    if (team3) {
      const open = teams.find((t) => t.seats.some((x) => !x));
      if (open) { setError(`${open.name}: pick all three shooters.`); return; }
      const twice = teams.flatMap((t) => t.seats).find((x, i, all) => all.indexOf(x) !== i);
      if (twice) { setError(`${nameOf(twice)} is in two teams.`); return; }
    }
    const list: NewEntrant[] = team3
      ? teams.map((t) => {
        const src = sources.find((s) => s.key === t.source) ?? sources.find((s) => s.playerIds.includes(t.seats[0]!));
        const members = t.seats.map((pid) => ({ playerId: pid!, name: nameOf(pid!) }));
        const filled = fillFromIndividuals({ members }, lookup, discipline).result;
        return { name: t.name.trim() || src?.name || 'Team', team: src ? { id: src.teamId, name: src.name, colorHex: src.colorHex } : undefined, members, start: { ms: filled.ms, mark: filled.mark, xs: filled.xs, series: filled.series } };
      })
      : team
      ? pairs.map(([a, b]) => {
        const t = teamOf(a) ?? teamOf(b);
        return { name: `${t?.name ? `${t.name} · ` : ''}${nameOf(a).split(' ')[0]} / ${nameOf(b).split(' ')[0]}`, team: t, members: [{ playerId: a, name: nameOf(a) }, { playerId: b, name: nameOf(b) }] };
      })
      : picks.map((pid) => ({ playerId: pid, name: nameOf(pid), team: teamOf(pid) }));
    const withFinal = !!ev.final && !team && !team3 && finalOk;
    const plan: PlannedPhase[] = withFinal
      ? [{ phase: 'qualification', heats: 1, progression: { fillTo: fin } }, { phase: 'final', heats: 1 }]
      : medalMatches ? [{ phase: 'qualification', heats: 1, progression: { fillTo: SHOOT_MATCH_TEAMS } }, { phase: 'final', heats: 1 }]
      : [{ phase: 'final', heats: 1 }];
    setBusy(true);
    try {
      const evt = await createResultsEvent({
        hostIds: officials,
        discipline, category: cat, tournamentId, entrants: list, plan,
        // firing points are drawn (start list order)
        lanes: 'draw', title: `${ev.label}${team3 ? ' Team' : ''} ${categoryLabel(cat)}`, startsAt: schedule.startsAt, sched: schedule.value,
        shootEntry: mode, ...(withFinal ? { shootFinal: true } : {}), ...(medalMatches ? { shootMatch: true } : {}),
        ...(team3 && srcKeys.length ? { teamFrom: { eventKeys: srcKeys } } : {}),
      });
      nav.replace('ResultsEvent', { phaseId: evt.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const n = seriesCount(ev, shots);
  const finalChoices = ev.final && !team && !team3 ? [0, 4, 6, 8].filter((k) => k === 0 || k < entrants || k === ev.final!.finalists) : [];
  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="🎯 New shooting event" subtitle={tournament?.name} />
        {/* SD-141: the meet's competition rules, checked before the meet starts */}
        <CompetitionRulesCard tournament={tournament} sport={'shooting'} />

        <Card style={st.card}>
          <Text style={textStyles.h3}>1 · Event</Text>
          <View style={st.wrap}>{SHOOT_EVENTS.map((e) => <SelectChip key={e.key} label={e.label} active={evKey === e.key} onPress={() => { setEvKey(e.key); setPicks([]); setFinalists(null); }} />)}</View>
          <Text style={textStyles.muted}>{ev.rules}.</Text>
          {!team ? (
            <View style={st.wrap}>
              <SelectChip label="Individual" active={!of3} onPress={() => setOf3(false)} />
              <SelectChip label="Team of 3" active={of3} onPress={() => setOf3(true)} />
            </View>
          ) : null}
          {team3 ? <Text style={textStyles.muted}>Team of 3: each team’s score is its three shooters’ {ev.label} match scores added (no separate team firing). Ties: {ev.scoring === 'integer' ? 'inner tens, then ' : ''}the last series of all three added, back series by series.</Text> : null}
          <View style={st.wrap}>{SHOOT_AGES.map((a) => <SelectChip key={a.key} label={a.label} active={age === a.key} onPress={() => setAge(a.key)} />)}</View>
          <Text style={textStyles.muted}>{SHOOT_AGES.find((a) => a.key === age)?.note}.</Text>
          {!team ? (
            <View style={st.wrap}>
              <SelectChip label={adult ? 'Men' : 'Boys'} active={gender === 'M'} onPress={() => setGender('M')} />
              <SelectChip label={adult ? 'Women' : 'Girls'} active={gender === 'F'} onPress={() => setGender('F')} />
            </View>
          ) : <Text style={textStyles.muted}>Mixed team: a man and a woman, 30 shots each — the team total ranks{medalMatches ? '; the best 4 teams shoot the medal matches' : ''}.</Text>}
          <Text style={st.label}>Match</Text>
          <View style={st.wrap}>
            {ev.shotOptions.map((k) => <SelectChip key={k} label={`${k} ${ev.scoring === 'hits' ? 'targets' : 'shots'}${k === ev.shots ? ' (ISSF)' : ''}`} active={shots === k} onPress={() => setShots(k)} />)}
          </View>
          <Text style={textStyles.muted}>{n} series of {ev.seriesOf}{ev.positions ? ` — ${ev.positions.length === 3 ? 'kneeling, prone, standing' : ''}` : ''}. {shots !== ev.shots ? 'A shorter match keeps its own records and PBs.' : ''} Event: {ev.label} {categoryLabel(cat)}.</Text>
        </Card>

        {team3 ? (
          <Card style={st.card}>
            <Text style={textStyles.h3}>2 · Teams ({teams.length})</Text>
            <Text style={st.label}>Scores from the individual match{srcEvents.length !== 1 ? 'es' : ''}</Text>
            {srcEvents.length ? (
              <View style={st.wrap}>
                {srcEvents.map((e) => {
                  const on = srcKeys.includes(e.eventKey);
                  return <SelectChip key={e.eventKey} label={`${on ? '✓ ' : ''}${e.title}`} active={on} onPress={() => setSrcPicked(on ? srcKeys.filter((k) => k !== e.eventKey) : [...srcKeys, e.eventKey])} />;
                })}
              </View>
            ) : <Text style={textStyles.muted}>No {ev.label} {categoryLabel(cat)} match in this meet yet — add the individual event first, or type each member’s score on the team sheet.</Text>}
            {best.size ? <SelectChip label="Fill every house’s team with its best 3" active={false} onPress={fillAll} /> : null}
            <TeamBuilder sources={sources} playerById={playerById} players={players} seatNames={['Shooter 1', 'Shooter 2', 'Shooter 3']}
              fits={(p) => !eligibleOnly || eligibleFor({ gender }, { gender: p.gender, age: ageOf(p) })} teams={teams} onChange={setTeams} suggest={lookup.size ? suggest : undefined} />
            {lookup.size ? <Text style={textStyles.muted}>Best first: {[...lookup.values()].filter((m) => m.mark != null).length} shooters have a {ev.label} score ({scoreText([...lookup.values()].reduce((a, m) => Math.max(a, m.mark ?? 0), 0), ev.scoring)} top).</Text> : null}
          </Card>
        ) : null}

        {!team3 ? <Card style={st.card}>
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
        </Card> : null}

        <Card style={st.card}>
          <Text style={textStyles.h3}>3 · Scoring & {team ? 'medals' : 'final'}</Text>
          {!team3 ? <View style={st.wrap}>
            <SelectChip label={ev.scoring === 'integer' ? 'By series (total + X)' : 'By series'} active={mode === 'series'} onPress={() => setMode('series')} />
            {ev.scoring !== 'hits' && <SelectChip label="Shot by shot" active={mode === 'shot'} onPress={() => setMode('shot')} />}
          </View> : null}
          <Text style={textStyles.muted}>{team3 ? 'The team sheet takes each member’s score from the individual match (or the official types it).' : mode === 'series' ? `Enter each series total${ev.scoring === 'integer' ? ' and its inner tens (X)' : ''} as the range scores it.` : `Type each series' shots in one line${ev.scoring === 'decimal' ? ' (10.4 10.2 …)' : ' (10 9 X … — X is an inner ten)'}; shot-by-shot also breaks the last ties.`}</Text>
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
            <>
            {team && entrants >= SHOOT_MATCH_TEAMS ? (
              <View style={st.wrap}>
                <SelectChip label="Medal matches (ISSF)" active={medalMatches} onPress={() => setMatchesPick(true)} />
                <SelectChip label="The total decides" active={!medalMatches} onPress={() => setMatchesPick(false)} />
              </View>
            ) : null}
            <Text style={textStyles.muted}>{team3 ? 'Team of 3: no final — the added scores decide the medals (equal medal places: a shoot-off).' : team ? (medalMatches ? 'Mixed team: the best 4 teams after the qualification shoot the medal matches — 1st v 2nd for gold, 3rd v 4th for bronze; one shot per athlete a series, 2 points for the higher series, first to 16.' : `Mixed team: ranked on the team total${entrants < SHOOT_MATCH_TEAMS ? ' (medal matches need 4 teams)' : ''}.`) : ev.scoring === 'hits' ? 'Qualification only: the match decides the medals (equal medal places: a shoot-off).' : 'The 25 m hit-scored final is not run here: the match decides the medals.'}</Text>
            </>
          )}
          <Text style={textStyles.muted}>Ties (ISSF): {ev.scoring === 'integer' ? 'more inner tens, then ' : ''}{ev.positions ? 'standing, kneeling, prone totals, then ' : ''}the higher last {ev.scoring === 'hits' ? 'round' : '10-shot series'}, back series by series{ev.scoring !== 'hits' ? ', then shot by shot when shots are entered' : ''}.</Text>
        </Card>

        <ScheduleCard state={schedule} tournamentId={tournamentId} discipline={discipline} plan={(!!ev.final && !team && !team3 && finalOk) || medalMatches ? [{ phase: 'qualification', heats: 1 }, { phase: 'final', heats: 1 }] : undefined} athleteIds={team3 ? teams.flatMap((t) => t.seats.filter((x): x is string => !!x)) : picks} />
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
