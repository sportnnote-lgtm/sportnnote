/** One phase of a timed / measured event (results engine, SD-28): the official's
 *  phone screen. Start list by heat → enter marks / attempts / bar clearances /
 *  lifts / scores and statuses → live ranking with Q / q and PB / SB / MR
 *  flags → close the round (seeds the next one) or finish the final (records).
 *  Everything is driven by the discipline definition (unit, capture, tie rule,
 *  wind, attempts), so Wave 4 sports only add disciplines. Saves are offline-safe
 *  (the golf outbox). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { confirmAction } from '../core/confirm';
import { Button, Card, FormError, LoadingState, SelectChip, textStyles } from '../components/ui';
import { ResultsSheet, Flags, windText } from '../components/results/ResultsSheet';
import type { RootStackParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';
import { getPlayers, getMyPlayerId } from '../data/repos';
import type { FieldEntry, FieldEvent } from '../core/types';
import {
  getPhase, getResultsPhases, getPhaseEntries, saveEntryResult, patchPhaseFormat, setPhaseStatus, advancePhase,
  completeFinal, getMarkHistory, getRecordBook, getOrgRecordBook, moveEntry,
} from '../data/resultsStore';
import {
  disciplineOf, phaseOf, phaseLabel, toResultEntry, rankByHeat, qualify, withQualification, withRecordFlags,
  fieldFinalists, firstRoundsDone, attemptOrder, formatMark, parseMark, attemptText, summarizeHeights, addTry,
  eventAwards, categoryKey, categoryLabel, usesLanes,
  digitsToTime, handTime as handTimeTenth, handNote, reactionFalseStart, moveLane, startListText, resultsText, meetSettings, hurdleHeight,
  looseLegal, attemptNextUp, trialsFor, verticalState, jumpOffStatus, jumpOffTry, jumpOffStart, trialSeconds, barProgressionError,
  type DisciplineDef, type EntryResult, type MarkHistory, type RankedEntry, type RecordMark, type ResultStatus, type LiftAttempt,
  type ResultEntry, type JumpOff, type VerticalState, type Attempt,
  phaseDiscipline, laneNumbers, rankEntries, dqCodesFor, dqReason, officialManualTime, splitDistances, splitsError, swimMeetSettings,
  courseLabel, swimEventOf,
} from '../data/results';
import { isEventSport, eventWords } from '../sports/eventSports';
import { useAuth } from '../core/auth';
import { canOrganize } from '../core/roles';
import { canManageTournament } from '../core/org';
import { useTournamentById, useOrganizations } from '../data/hooks';
import { shareMessage } from '../core/share';
import { resultsLink } from '../core/shareText';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Change = (next: EntryResult) => void;

const STATUSES: ResultStatus[] = ['DNS', 'DNF', 'FS', 'DQ'];
// SD-94: in swimming a false start is a DQ (SW 4.4) and not finishing is a DQ (SW 10.2).
const statusesFor = (def: DisciplineDef): ResultStatus[] =>
  def.sport === 'swimming' ? ['DNS', 'DQ'] : def.capture === 'single' ? (def.unit === 'time' ? STATUSES : ['DNS', 'DQ']) : ['DNS', 'DQ', 'WD'];
const ruleHint = (def: DisciplineDef) => (def.sport === 'swimming' ? 'SW 7.6' : def.sport === 'athletics' ? 'TR 16.8' : 'rule');
/** The meet's points settings for an event sport (athletics / swimming). */
const pointsFor = (sport: string, fmt?: Record<string, unknown>) => (sport === 'swimming' ? swimMeetSettings(fmt) : meetSettings(fmt));
const num = (t: string) => { const v = Number(t.trim().replace(',', '.').replace('−', '-')); return t.trim() && Number.isFinite(v) ? v : undefined; };

export default function ResultsEventScreen() {
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'ResultsEvent'>>();
  const [tab, setTab] = useParamState<'enter' | 'sheet'>('tab', 'enter');
  const { profile } = useAuth();
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { void getMyPlayerId(profile?.id).then(setMe).catch(() => setMe(null)); }, [profile?.id]);
  const orgs = useOrganizations();
  const [lanesOpen, setLanesOpen] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [phase, setPhase] = useState<FieldEvent | null>(null);
  const [phases, setPhases] = useState<FieldEvent[]>([]);
  const [entries, setEntries] = useState<FieldEntry[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [history, setHistory] = useState<MarkHistory[]>([]);
  const [records, setRecords] = useState<RecordMark[]>([]);
  const [local, setLocal] = useState<Map<string, EntryResult>>(new Map());
  const [heat, setHeat] = useState(1);
  const [bar, setBar] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const f = phase ? phaseOf(phase) : null;
  // SD-94: as raced at this venue (a 6- / 10-lane pool)
  const baseDef = f ? disciplineOf(f.discipline) ?? null : null;
  const def = baseDef && f ? phaseDiscipline(baseDef, f) : null;
  const swim = def?.sport === 'swimming';
  // SD-94: a final run in several heats is a timed final — places on time across heats
  const timedFinal = !!f && f.phase === 'final' && f.heats > 1 && def?.capture === 'single';
  const tournament = useTournamentById(phase?.tournamentId);
  // Who may enter results: the event's creator / hosts, the tournament's
  // managers, or an organiser. Everyone else (a shared /r/ link) reads.
  const canEdit = !!phase && (canOrganize(profile?.role) || phase.createdBy === profile?.id || (!!me && (phase.hostIds ?? []).includes(me))
    || (!!tournament && canManageTournament(tournament, orgs, me)));
  const view = canEdit ? tab : 'sheet';

  const load = useCallback(async () => {
    const ev = await getPhase(params.phaseId);
    const pf = ev && phaseOf(ev);
    const d = pf && disciplineOf(pf.discipline);
    setPhase(ev);
    if (!ev || !pf || !d) { setLoading(false); return; }
    const [ens, ps, all, recs] = await Promise.all([getPhaseEntries([ev.id]), getPlayers(), getResultsPhases({ eventKey: pf.eventKey }), getRecordBook(ev.tournamentId, d.sport)]);
    setEntries(ens);
    const nm = new Map(ps.map((p) => [p.id, p.fullName]));
    setNames(nm);
    setPhases(all.sort((a, b) => a.roundNo - b.roundNo));
    // SD-90: + the school record (SR) — the best at the host organisation's other meets.
    setRecords(recs);
    setLocal(new Map());
    setHistory(await getMarkHistory(d, ens.map((e) => e.playerId), ev.id, pf.category?.course));
    setLoading(false);
  }, [params.phaseId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const nameOf = useCallback((id: string) => names.get(id) ?? 'Athlete', [names]);
  // SD-90: the school record book (SR), derived from the host organisation's other meets.
  const [srBook, setSrBook] = useState<RecordMark[]>([]);
  const hostOrgId = tournament?.hostOrgId;
  useEffect(() => {
    let on = true;
    if (!hostOrgId || !isEventSport(def?.sport)) { setSrBook([]); return; }
    void getOrgRecordBook(hostOrgId, tournament?.id, (id) => names.get(id) ?? 'Athlete', def!.sport).then((b) => on && setSrBook(b)).catch(() => {});
    return () => { on = false; };
  }, [hostOrgId, tournament?.id, def?.sport, names]);
  const merged = useMemo(() => entries.map((e) => (local.has(e.id) ? { ...e, result: local.get(e.id) } : e)), [entries, local]);
  const resEntries = useMemo(() => merged.map((e) => toResultEntry(e, nameOf)), [merged, nameOf]);

  // Ranking per heat with Q / q and PB / SB / MR flags.
  const ranked = useMemo(() => {
    if (!def || !f || !phase) return new Map<number, RankedEntry[]>();
    const ctx = { history, records: [...records, ...srBook], category: categoryKey(f.category), seasonFrom: `${phase.startsAt.slice(0, 4)}-01-01`, eventKey: f.eventKey };
    if (timedFinal) {
      // every heat ranked together; each heat's rows keep their overall place
      const all = withRecordFlags(rankEntries(resEntries, def, { handLegal: looseLegal(f) }), def, ctx);
      const hs = [...new Set(resEntries.map((e) => e.heat))].sort((a, b) => a - b);
      return new Map(hs.map((h) => [h, all.filter((r) => r.entry.heat === h)]));
    }
    const byHeat = rankByHeat(resEntries, def, { handLegal: looseLegal(f) });
    const q = f.progression ? qualify(byHeat, def, f.progression) : null;
    return new Map([...byHeat].map(([h, rows]) => [h, withRecordFlags(q ? withQualification(rows, q) : rows, def, ctx)]));
  }, [def, f, phase, resEntries, history, records, srBook, timedFinal]);
  // SD-94: the overall order of a timed final (the sheet / share), and the
  // swim-off a tie at the qualifying line needs (SW 3.2.3)
  const overall = useMemo(() => (timedFinal ? [...ranked.values()].flat().sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.status === 'ok' ? 0 : 1) - (b.status === 'ok' ? 0 : 1)) : null), [ranked, timedFinal]);
  const swimOff = useMemo(() => {
    if (!swim || !def || !f?.progression) return new Set<string>();
    const q = qualify(rankByHeat(resEntries, def, { handLegal: looseLegal(f) }), def, f.progression);
    return new Set(q.tieAtLine);
  }, [swim, def, f, resEntries]);

  const heats = useMemo(() => [...new Set(entries.map((e) => e.groupNo))].sort((a, b) => a - b), [entries]);
  const activeHeat = heats.includes(heat) ? heat : heats[0] ?? 1;
  const heatEntries = merged.filter((e) => e.groupNo === activeHeat);
  const editable = canEdit && phase?.status !== 'completed';
  const finalists = useMemo(() => (def?.capture === 'attempts' ? fieldFinalists(resEntries.filter((e) => e.heat === activeHeat), def) : new Set<string>()), [def, resEntries, activeHeat]);
  // SD-91: a qualification round has 3 trials only — no extra three.
  const extraOpen = def?.capture === 'attempts' && f?.phase !== 'qualification' && firstRoundsDone(resEntries.filter((e) => e.heat === activeHeat), def);
  const heatRes = useMemo(() => resEntries.filter((e) => e.heat === activeHeat), [resEntries, activeHeat]);
  const nextUp = useMemo(() => (def?.capture === 'attempts' ? attemptNextUp(heatRes, def, { phase: f?.phase, standard: f?.progression?.standard }) : null), [def, heatRes, f?.phase, f?.progression?.standard]);
  const vState = useMemo(() => (def?.capture === 'heights' ? verticalState(heatRes, f?.bar ?? []) : null), [def, heatRes, f?.bar]);
  const windByHeat = useMemo(() => new Map(heats.map((h) => [h, (merged.find((e) => e.groupNo === h && (e.result as EntryResult)?.wind != null)?.result as EntryResult | undefined)?.wind])), [heats, merged]);

  const save = async (entry: FieldEntry, next: EntryResult) => {
    setError(null);
    setLocal((m) => new Map(m).set(entry.id, next));
    try {
      setPending(await saveEntryResult(entry.id, next));
      if (phase?.status === 'scheduled') { await setPhaseStatus(phase.id, 'live'); setPhase({ ...phase, status: 'live' }); }
    } catch (e) { setError((e as Error).message); }
  };
  const resultOf = (e: FieldEntry): EntryResult => (local.get(e.id) ?? (e.result as EntryResult) ?? {});

  if (loading) return <LoadingState />;
  if (!phase || !f || !def) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, { padding: 16 }]}>This event isn't available.</Text></SafeAreaView>;

  const next = f.plan?.[f.phaseNo];
  const orderFor = (list: FieldEntry[]) => {
    if (def.capture === 'attempts') {
      const ids = attemptOrder(list.map((e) => toResultEntry(e, nameOf)), def, round).map((e) => e.id);
      const rest = list.filter((e) => !ids.includes(e.id));
      return [...ids.map((id) => list.find((e) => e.id === id)!), ...rest];
    }
    const key = (e: FieldEntry) => (resultOf(e).lane ?? resultOf(e).order ?? 99);
    return [...list].sort((a, b) => key(a) - key(b));
  };

  const advance = async () => {
    if (!next) return;
    const ok = await confirmAction(`Close ${phaseLabel(f.phase).toLowerCase()}?`, `The qualifiers (Q / q) are seeded into the ${phaseLabel(next.phase).toLowerCase()} and these results are locked.`, 'Close and seed');
    if (!ok) return;
    setBusy(true);
    try {
      const ev = await advancePhase(phase, merged, nameOf);
      nav.replace('ResultsEvent', { phaseId: ev.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const finish = async () => {
    const jo = [...ranked.values()].flat().some((r) => r.needsDecider && r.flags.includes('JO'));
    const ok = await confirmAction('Finish and lock the results?', `${jo ? 'The tie for 1st has no jump-off result — the athletes will share 1st. ' : ''}Places, medals and any new record are final. You can still view the sheet.`, 'Finish');
    if (!ok) return;
    setBusy(true);
    try {
      const pts = isEventSport(def.sport) ? pointsFor(def.sport, tournament?.formats?.[def.sport] as Record<string, unknown> | undefined) : undefined;
      const book = await completeFinal(phase, merged, nameOf, ['MR'], pts);
      const mine = book.filter((r) => r.discipline === def.key && r.category === categoryKey(f.category));
      setInfo(mine.length ? `Records: ${mine.map((r) => `${r.scope} ${formatMark(r.value, def)} (${r.holder})`).join(' · ')}` : null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const heatRows = ranked.get(activeHeat) ?? [];
  const meet = isEventSport(def.sport) ? pointsFor(def.sport, tournament?.formats?.[def.sport] as Record<string, unknown> | undefined) : undefined;
  // relays score × the meet's relay factor (as in the house table)
  const relayX = meet && def.teamSize && meet.relayFactor !== 1 ? meet.relayFactor : 1;
  const awards = (f.phase === 'final' ? eventAwards(overall ?? [...ranked.values()].flat(), meet ? { positionPoints: meet.positionPoints } : {}) : [])
    .map((a) => (relayX !== 1 ? { ...a, points: Math.round(a.points * relayX * 100) / 100 } : a));
  const anyMark = merged.some((e) => { const r = (e.result ?? {}) as EntryResult; return r.mark != null || (r.status ?? 'ok') !== 'ok' || !!r.attempts?.length || !!r.heights?.length; });
  const hurdles = hurdleHeight(def.key, f.category ?? {});
  // SD-91: the field event's set-up line (implement, board, wind gauge)
  const fieldNote = [f.implement ? `Implement ${f.implement}` : '', f.board ? `Take-off board ${f.board} m` : '', f.noWindGauge ? 'No wind gauge — jumps without a reading count for records' : ''].filter(Boolean).join(' · ');
  const curBar = def.capture === 'heights' ? (bar != null && (f.bar ?? []).includes(bar) ? bar : vState?.height ?? bar) : null;
  const saveAttempt = (id: string, round: number, a: Attempt) => {
    const e = merged.find((x) => x.id === id);
    if (!e) return;
    const r = resultOf(e);
    const list = [...(r.attempts ?? [])];
    if (list.length < round - 1) return;
    list[round - 1] = a;
    void save(e, { ...r, attempts: list });
  };
  const saveTry = (id: string, height: number, t: 'O' | 'X' | '-') => {
    const e = merged.find((x) => x.id === id);
    if (!e) return;
    const r = resultOf(e);
    const list = r.heights ?? [];
    const cur = list.find((h) => Math.abs(h.height - height) < 1e-9)?.tries ?? '';
    const next = addTry(cur, t);
    if (next === cur) return;
    void save(e, { ...r, heights: [...list.filter((h) => Math.abs(h.height - height) >= 1e-9), { height, tries: next }].sort((a, b) => a.height - b.height) });
  };
  const addBar = async (h: number) => {
    const list = [...new Set([...(f.bar ?? []), h])].sort((a, b) => a - b);
    await patchPhaseFormat(phase.id, { bar: list });
    setPhase({ ...phase, format: { ...phase.format, results: { ...f, bar: list } } });
    setBar(h);
  };
  // Jump-off for 1st (TR 26.9): stored on the phase; its places become each tied athlete's `decider`.
  const writeJumpOff = async (jo: JumpOff | undefined, places: Map<string, number>, ids: string[]) => {
    await patchPhaseFormat(phase.id, { jumpOff: jo });
    setPhase({ ...phase, format: { ...phase.format, results: { ...f, jumpOff: jo } } });
    for (const id of ids) {
      const e = merged.find((x) => x.id === id);
      if (!e) continue;
      const r = resultOf(e);
      const d = places.get(id);
      if (r.decider !== d) await save(e, { ...r, decider: d });
    }
  };

  // Share: the start list before anyone has a mark, the results after.
  const share = () => {
    // a timed final's start list is by heat; its results are one overall list
    const rows = (overall && anyMark ? [[0, overall] as const] : [...ranked]).flatMap(([h, rs]) => rs.map((r) => ({
      heat: h, lane: r.entry.result.lane, order: r.entry.result.order, name: r.entry.name, team: r.entry.team?.name,
      mark: (r.bestText ? r.bestText + (def.wind === 'attempt' && r.wind != null ? ` (${windText(r.wind)})` : '') : '') || (r.status !== 'ok' ? r.status : ''), place: r.label && r.position != null ? r.label : '', flags: r.flags.filter((x) => x !== 'w' && x !== 'h'),
    })));
    const title = `${f.eventTitle ?? def.label} — ${phaseLabel(f.phase)}`;
    const icon = eventWords(def.sport).icon;
    void shareMessage(anyMark ? resultsText(title, rows, phase.status === 'completed', resultsLink(phase.id), icon) : startListText(title, rows, resultsLink(phase.id), icon), 'results');
  };
  // Manual lane override (World Athletics lets the referee re-draw / move).
  const pickLane = async (entryId: string, heatNo: number, lane: number) => {
    const rows = merged.map((e) => ({ id: e.id, heat: e.groupNo, lane: ((e.result ?? {}) as EntryResult).lane }));
    const changes = moveLane(rows, entryId, heatNo, lane);
    setMoving(null);
    try {
      for (const c of changes) {
        const e = merged.find((x) => x.id === c.id)!;
        await moveEntry(c.id, c.heat, { ...((e.result ?? {}) as EntryResult), lane: c.lane });
      }
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={textStyles.h2}>{f.eventTitle ?? def.label}</Text>
          <Text style={textStyles.muted}>
            {phaseLabel(f.phase)} · {categoryLabel(f.category)} · {phase.status === 'completed' ? 'final results' : phase.status === 'live' ? 'in progress' : 'start list'}
            {pending ? `  ·  ${pending} waiting to sync` : ''}
          </Text>
        </View>
        {phases.length > 1 && (
          <View style={st.wrap}>
            {phases.map((p) => {
              const pf = phaseOf(p)!;
              return <SelectChip key={p.id} label={`${phaseLabel(pf.phase)}${p.status === 'completed' ? ' ✓' : ''}`} active={p.id === phase.id} onPress={() => p.id !== phase.id && nav.replace('ResultsEvent', { phaseId: p.id })} />;
            })}
          </View>
        )}
        <View style={st.wrap}>
          {canEdit && <SelectChip label="Enter results" active={view === 'enter'} onPress={() => setTab('enter')} />}
          <SelectChip label={anyMark ? 'Results sheet' : 'Start list'} active={view === 'sheet'} onPress={() => setTab('sheet')} />
          <SelectChip label="📤 Share" active={false} onPress={share} />
        </View>
        {hurdles ? <Text style={textStyles.muted}>Hurdle height {hurdles} (World Athletics, {categoryLabel(f.category)}).</Text> : null}
        {swim ? <Text style={textStyles.muted}>{courseLabel(f.category?.course)} · {def.lanes} lanes{f.handTimed ? ' · manual timing (SW 11.3)' : ''}{timedFinal ? ` · timed final: ${f.heats} heats, places on time across heats` : ''}</Text> : null}
        {!swim && timedFinal ? <Text style={textStyles.muted}>Timed final: {f.heats} heats, places on time across heats.</Text> : null}
        {fieldNote ? <Text style={textStyles.muted}>{fieldNote}</Text> : null}
        <FormError message={error} />
        {info ? <Text style={st.info}>{info}</Text> : null}

        {view === 'enter' && (
          <>
            {heats.length > 1 && (
              <View style={st.wrap}>
                {heats.map((h) => <SelectChip key={h} label={`Heat ${h}`} active={h === activeHeat} onPress={() => setHeat(h)} />)}
              </View>
            )}
            {f.progression && (
              <Text style={textStyles.muted}>
                Through: {f.progression.byPlace ? `first ${f.progression.byPlace} in each heat (Q)` : ''}{f.progression.byMark ? ` + ${f.progression.byMark} fastest / best (q)` : ''}{f.progression.standard != null ? `standard ${formatMark(f.progression.standard, def)} (Q)` : ''}
              </Text>
            )}

            {def.wind === 'race' && editable && (
              <WindField value={windByHeat.get(activeHeat)} onSave={(w) => { for (const e of heatEntries) void save(e, { ...resultOf(e), wind: w }); }} />
            )}

            {usesLanes(def) && editable && !anyMark && (
              <View style={{ gap: theme.spacing(2) }}>
                <SelectChip label={lanesOpen ? '✓ Done changing lanes' : '✎ Change lanes'} active={lanesOpen} onPress={() => { setLanesOpen(!lanesOpen); setMoving(null); }} />
                {lanesOpen && <Text style={textStyles.muted}>Tap an athlete, then the lane to move them to — whoever is in it swaps places.</Text>}
                {lanesOpen && moving && (
                  <View style={st.wrap}>
                    {heats.length > 1 && heats.map((h) => <SelectChip key={`h${h}`} label={`Heat ${h}`} active={h === activeHeat} onPress={() => setHeat(h)} />)}
                    {laneNumbers(def.lanes ?? 8).map((ln) => {
                      const who = merged.find((e) => e.groupNo === activeHeat && ((e.result ?? {}) as EntryResult).lane === ln);
                      return <SelectChip key={ln} label={`L${ln}${who ? ` · ${toResultEntry(who, nameOf).name.split(' ')[0]}` : ''}`} active={false} onPress={() => void pickLane(moving, activeHeat, ln)} />;
                    })}
                  </View>
                )}
              </View>
            )}

            {def.capture === 'attempts' && editable && (
              <AttemptCard def={def} up={nextUp} rows={heatRows} heatRes={heatRes} phaseKind={f.phase} onSave={saveAttempt} />
            )}
            {def.capture === 'heights' && editable && (
              <HeightCard def={def} vs={vState} bar={f.bar ?? []} onTry={saveTry} onAdd={(h) => void addBar(h)} />
            )}
            {def.capture === 'heights' && (
              <JumpOffCard def={def} rows={heatRows} vs={vState} bar={f.bar ?? []} jo={f.jumpOff} editable={editable} onWrite={(jo, places, ids) => void writeJumpOff(jo, places, ids).catch((e) => setError((e as Error).message))} />
            )}
            {def.capture === 'heights' && <HeightGrid def={def} entries={orderFor(heatEntries).map((e) => toResultEntry({ ...e, result: resultOf(e) }, nameOf))} current={curBar} />}

            {def.capture === 'attempts' && (
              <View style={st.wrap}>
                <Text style={textStyles.muted}>{editable ? 'Edit round' : 'Round'}</Text>
                {Array.from({ length: trialsFor(def, f.phase) }, (_, i) => i + 1).map((r) => (
                  <SelectChip key={r} label={String(r)} active={round === r} disabled={r > (def.attempts?.count ?? 3) && !extraOpen} onPress={() => setRound(r)} />
                ))}
              </View>
            )}
            {def.capture === 'attempts' && extraOpen && def.attempts?.extra ? (
              <Text style={textStyles.muted}>Top {def.attempts.finalists} after {def.attempts.count} rounds (★) take {def.attempts.extra} more, in reverse order.</Text>
            ) : null}

            {def.capture === 'heights' && (
              <BarHeights def={def} bar={f.bar ?? []} current={curBar} onPick={setBar} editable={editable} onAdd={addBar} />
            )}

            {orderFor(heatEntries).map((e) => {
              const r = resultOf(e);
              const re = toResultEntry({ ...e, result: r }, nameOf);
              const row = heatRows.find((x) => x.id === e.id);
              return (
                <Card key={e.id} style={[st.entryCard, moving === e.id && { borderColor: theme.colors.primary, borderWidth: 2 }]}>
                  {lanesOpen && editable && !anyMark ? (
                    <SelectChip label={moving === e.id ? 'Moving… pick a lane' : `Move ${re.name.split(' ')[0]}`} active={moving === e.id} onPress={() => setMoving(moving === e.id ? null : e.id)} />
                  ) : null}
                  <View style={st.headRow}>
                    <Text style={st.lane}>{usesLanes(def) ? `L${r.lane ?? '–'}` : `#${r.order ?? '–'}`}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.name} numberOfLines={1}>{finalists.has(e.id) && extraOpen ? '★ ' : ''}{re.name}</Text>
                      {re.team?.name ? <Text style={textStyles.muted} numberOfLines={1}>{[re.team.name !== re.name ? re.team.name : '', r.members?.length ? r.members.map((m) => m.name.split(' ')[0]).join(', ') : ''].filter(Boolean).join(' · ')}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={st.place}>{row?.label || ''}</Text>
                      {row ? <Flags flags={row.flags} /> : null}
                    </View>
                  </View>
                  {def.capture === 'single' || def.capture === 'target' ? (
                    def.unit === 'time'
                      ? <TimeField key={`${e.id}:${r.mark ?? ''}:${r.thousandths ?? ''}:${r.hand ? 'h' : ''}`} def={def} r={r} handMeet={!!f.handTimed} editable={editable && (r.status ?? 'ok') === 'ok'} onChange={(n) => void save(e, n)} />
                      : <MarkField key={`${e.id}:${r.mark ?? ''}:${r.thousandths ?? ''}`} def={def} r={r} editable={editable && (r.status ?? 'ok') === 'ok'} onChange={(n) => void save(e, n)} />
                  ) : null}
                  {def.capture === 'attempts' && (
                    <AttemptCells def={def} r={r} round={round} editable={editable && (r.status ?? 'ok') === 'ok'}
                      extraAllowed={extraOpen && finalists.has(e.id)} onChange={(n) => void save(e, n)} />
                  )}
                  {def.capture === 'heights' && <HeightRow def={def} r={r} bar={curBar} editable={editable && (r.status ?? 'ok') === 'ok'} onChange={(n) => void save(e, n)} />}
                  {def.capture === 'lifts' && <LiftCells r={r} editable={editable && (r.status ?? 'ok') === 'ok'} nextSeq={1 + Math.max(0, ...merged.flatMap((x) => [...((x.result as EntryResult)?.lifts?.snatch ?? []), ...((x.result as EntryResult)?.lifts?.cj ?? [])].map((l) => l.seq ?? 0)))} onChange={(n) => void save(e, n)} />}
                  {swim && editable && f.handTimed && (r.status ?? 'ok') === 'ok' && (
                    <WatchesField key={`${e.id}:w:${(r.watches ?? []).join(',')}`} def={def} r={r} onChange={(n) => void save(e, n)} />
                  )}
                  {swim && editable && (f.splits ?? true) && splitDistances(def.key).length > 0 && (
                    <SplitsField key={`${e.id}:s:${(r.splits ?? []).join(',')}`} def={def} r={r} onChange={(n) => void save(e, n)} />
                  )}
                  {f.reaction && def.unit === 'time' && editable && (
                    <ReactionField value={r.reaction} swim={swim} onSave={(v) => void save(e, { ...r, reaction: v })} />
                  )}
                  {swim && editable && swimOff.has(e.id) && (
                    <View style={{ gap: theme.spacing(1) }}>
                      <Text style={st.badTxt}>Equal time at the qualifying line — a swim-off decides who goes through (SW 3.2.3). Enter the swim-off place (1 = through), or leave it and all go through.</Text>
                      <DeciderField label="Swim-off place" value={r.decider} onSave={(d) => void save(e, { ...r, decider: d })} />
                    </View>
                  )}
                  {row?.needsDecider && editable && (
                    <DeciderField label={def.tie === 'vertical' ? 'Jump-off place' : 'Shoot-off place'} value={r.decider} onSave={(d) => void save(e, { ...r, decider: d })} />
                  )}
                  {editable && (swim ? <SwimStatusChips def={def} r={r} onChange={(n) => void save(e, n)} /> : <StatusChips def={def} r={r} onChange={(n) => void save(e, n)} />)}
                </Card>
              );
            })}

            <ResultsSheet def={def} title="Live ranking" subtitle={heats.length > 1 ? `Heat ${activeHeat}` : undefined} heats={new Map([[activeHeat, heatRows]])} wind={windByHeat} />

            {editable && next && <Button label={busy ? 'Seeding…' : `Close ${phaseLabel(f.phase).toLowerCase()} → seed the ${phaseLabel(next.phase).toLowerCase()}`} onPress={() => void advance()} disabled={busy} />}
            {editable && !next && <Button label={busy ? 'Finishing…' : '🏁 Finish & lock results'} onPress={() => void finish()} disabled={busy} />}
          </>
        )}

        {view === 'sheet' && (
          <>
            <ResultsSheet def={def} title={phase.title} subtitle={`${categoryLabel(f.category)}${swim ? ` · ${courseLabel(f.category?.course)}` : ''} · ${phase.startsAt.slice(0, 10)}`} heats={overall && anyMark ? new Map([[0, overall]]) : ranked} wind={windByHeat} overall={!!overall && anyMark} />
            {f.jumpOff ? <Text style={textStyles.muted}>{jumpOffText(f.jumpOff, def, resEntries)}</Text> : null}
            {awards.length > 0 && (
              <Card style={{ gap: theme.spacing(1) }}>
                <Text style={textStyles.h3}>Medals & points</Text>
                {awards.slice(0, 8).map((a) => (
                  <Text key={a.entryId} style={textStyles.body}>
                    {a.medal === 'gold' ? '🥇' : a.medal === 'silver' ? '🥈' : a.medal === 'bronze' ? '🥉' : `${a.position}.`} {a.name}{a.team?.name && a.team.name !== a.name ? ` (${a.team.name})` : ''} — {a.points} pts
                  </Text>
                ))}
                <Text style={textStyles.muted}>{meet ? meet.positionPoints.join('-') : 'Default 8-7-6-5-4-3-2-1'}; tied places share the points.{meet && meet.relayFactor !== 1 && def.teamSize ? ` Relays score ×${meet.relayFactor}.` : ''} These feed the meet's house / medal table.</Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* --------------------------------- inputs -------------------------------- */

function WindField({ value, onSave }: { value?: number; onSave: (w: number | undefined) => void }) {
  const [t, setT] = useState(value != null ? String(value) : '');
  useEffect(() => { setT(value != null ? String(value) : ''); }, [value]);
  return (
    <View style={st.inline}>
      <Text style={st.label}>Wind (m/s)</Text>
      <TextInput style={[st.input, { width: 90 }]} value={t} onChangeText={setT} placeholder="+1.2" placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation" accessibilityLabel="Race wind in metres per second" onBlur={() => onSave(num(t))} onSubmitEditing={() => onSave(num(t))} />
      <Text style={textStyles.muted}>{value != null ? (value > 2.0 ? 'wind-aided (w)' : 'legal') : 'no reading'}</Text>
    </View>
  );
}

function MarkField({ def, r, editable, onChange }: { def: DisciplineDef; r: EntryResult; editable: boolean; onChange: Change }) {
  const [t, setT] = useState(r.thousandths != null ? r.thousandths.toFixed(3) : formatMark(r.mark, def));
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (!t.trim()) { setBad(false); if (r.mark != null) onChange({ ...r, mark: undefined, thousandths: undefined }); return; }
    const p = parseMark(t, def);
    setBad(!p);
    if (p && (p.mark !== r.mark || p.thousandths !== r.thousandths)) onChange({ ...r, mark: p.mark, thousandths: p.thousandths });
  };
  const hint = def.unit === 'time' ? '10.85' : def.unit === 'points' ? 'score' : 'mark';
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.inline}>
        <TextInput style={[st.input, st.markInput, bad && st.bad]} value={t} onChangeText={setT} editable={editable} placeholder={hint}
          placeholderTextColor={theme.colors.textMuted} keyboardType="numbers-and-punctuation" accessibilityLabel={def.unit === 'time' ? 'Time' : 'Mark'}
          onBlur={commit} onSubmitEditing={commit} />
        {def.unit === 'time' && <SelectChip label="Hand" active={!!r.hand} disabled={!editable} onPress={() => onChange({ ...r, hand: !r.hand || undefined })} />}
        {bad && <Text style={st.badTxt}>Can't read that</Text>}
      </View>
      {def.capture === 'target' && (
        <View style={st.inline}>
          <SmallNum label="10s" value={r.tens} editable={editable} onSave={(v) => onChange({ ...r, tens: v })} />
          <SmallNum label="X / inner" value={r.xs} editable={editable} onSave={(v) => onChange({ ...r, xs: v })} />
        </View>
      )}
    </View>
  );
}

/** SD-90: the stopwatch keypad — type the digits only ("1085" → 10.85,
 *  "15234" → 1:52.34); a typed "10.85" / "1:52.34" / "10.853" (photo-finish
 *  thousandths) still works. Hand times go to the next tenth (TR 19.21). */
function TimeField({ def, r, editable, handMeet, onChange }: { def: DisciplineDef; r: EntryResult; editable: boolean; handMeet: boolean; onChange: Change }) {
  const [t, setT] = useState(r.thousandths != null ? r.thousandths.toFixed(3) : formatMark(r.mark, def));
  const [bad, setBad] = useState(false);
  const hand = r.hand ?? (handMeet && r.mark == null ? true : false);
  // SD-94: a swimming manual time stays at 1/100 (SW 11.3) — no rounding to the tenth.
  const swim = def.sport === 'swimming';
  const handTime = (v: number) => (swim ? v : handTimeTenth(v));
  const read = (text: string): { mark: number; thousandths?: number } | null => {
    if (/[.:,]/.test(text)) return parseMark(text, def);
    const v = digitsToTime(text);
    return v == null ? null : { mark: v };
  };
  const preview = t.trim() && !/[.:,]/.test(t) ? read(t) : null;
  const commit = (h = hand) => {
    if (!t.trim()) { setBad(false); if (r.mark != null) onChange({ ...r, mark: undefined, thousandths: undefined }); return; }
    const p = read(t);
    setBad(!p);
    if (!p) return;
    const mark = h ? handTime(p.mark) : p.mark;
    const next = { ...r, mark, thousandths: h ? undefined : p.thousandths, hand: h };
    if (next.mark !== r.mark || next.thousandths !== r.thousandths || !!next.hand !== !!r.hand) onChange(next);
  };
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={st.inline}>
        <TextInput style={[st.input, st.markInput, bad && st.bad]} value={t} onChangeText={setT} editable={editable} placeholder="1085 = 10.85"
          placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" accessibilityLabel="Time" selectTextOnFocus
          onBlur={() => commit()} onSubmitEditing={() => commit()} />
        <SelectChip label={swim ? 'Manual' : 'Hand'} active={hand} disabled={!editable} onPress={() => { onChange({ ...r, hand: !hand, ...(r.mark != null && !hand ? { mark: handTime(r.mark), thousandths: undefined } : {}) }); }} />
        {preview ? <Text style={st.preview}>= {formatMark(hand ? handTime(preview.mark) : preview.mark, def)}{hand ? 'h' : ''}</Text> : null}
        {bad && <Text style={st.badTxt}>Can't read that</Text>}
      </View>
      {hand ? <Text style={textStyles.muted}>{swim ? 'Manual time to 1/100 (SW 11.3).' : handNote(def, r.mark)}{handMeet ? '' : ' Not record-eligible.'}</Text> : null}
    </View>
  );
}

function ReactionField({ value, swim, onSave }: { value?: number; swim?: boolean; onSave: (v: number | undefined) => void }) {
  const [t, setT] = useState(value != null ? value.toFixed(3) : '');
  const v = num(t);
  return (
    <View style={st.inline}>
      <Text style={st.label}>Reaction (s)</Text>
      <TextInput style={[st.input, { width: 80 }]} value={t} onChangeText={setT} placeholder="0.145" placeholderTextColor={theme.colors.textMuted}
        keyboardType="decimal-pad" accessibilityLabel="Reaction time in seconds" onBlur={() => onSave(num(t))} onSubmitEditing={() => onSave(num(t))} />
      {!swim && reactionFalseStart(v) ? <Text style={st.badTxt}>Under 0.100 s — a false start if the start was recalled (TR 16.6)</Text> : null}
    </View>
  );
}

/** SD-94: the lane's watches (SW 11.3) — type up to three times; the official
 *  time is two-of-three, else the middle one, or the average of two (thousandth dropped). */
function WatchesField({ def, r, onChange }: { def: DisciplineDef; r: EntryResult; onChange: Change }) {
  const [t, setT] = useState((r.watches ?? []).map((w) => formatMark(w, def)).join(' '));
  const read = (x: string) => (/[.:,]/.test(x) ? parseMark(x, def)?.mark : digitsToTime(x)) ?? undefined;
  const vals = t.trim() ? t.trim().split(/\s+/).slice(0, 3).map(read) : [];
  const official = officialManualTime(vals);
  const commit = () => {
    const w = vals.filter((x): x is number => x != null);
    if (!w.length || official == null) return;
    onChange({ ...r, watches: w, mark: official, hand: true, thousandths: undefined });
  };
  return (
    <View style={st.inline}>
      <Text style={st.label}>Watches</Text>
      <TextInput style={[st.input, { flex: 1, minWidth: 120 }]} value={t} onChangeText={setT} placeholder="3245 3251 3248" placeholderTextColor={theme.colors.textMuted}
        keyboardType="numbers-and-punctuation" accessibilityLabel="Times from the lane's watches" onBlur={commit} onSubmitEditing={commit} />
      {official != null ? <Text style={st.preview}>→ {formatMark(official, def)}</Text> : null}
    </View>
  );
}

/** SD-94: cumulative 50 m splits (stopwatch digits or "1:05.30"). */
function SplitsField({ def, r, onChange }: { def: DisciplineDef; r: EntryResult; onChange: Change }) {
  const ds = splitDistances(def.key);
  const [t, setT] = useState(ds.map((_, i) => (r.splits?.[i] != null ? formatMark(r.splits[i], def) : '')));
  const read = (x: string) => (!x.trim() ? undefined : (/[.:,]/.test(x) ? parseMark(x, def)?.mark : digitsToTime(x)) ?? NaN);
  const vals = t.map(read);
  const err = vals.some((v) => Number.isNaN(v)) ? "Can't read a split" : splitsError(vals as (number | undefined)[], r.mark);
  const commit = () => {
    if (err) return;
    const list = vals as (number | undefined)[];
    while (list.length && list[list.length - 1] == null) list.pop();
    if (JSON.stringify(list) !== JSON.stringify(r.splits ?? [])) onChange({ ...r, splits: list.length ? (list as number[]) : undefined });
  };
  const legs = swimEventOf(def.key);
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={st.wrap}>
        {ds.map((d, i) => (
          <View key={d} style={{ gap: 2 }}>
            <Text style={st.cellWind}>{d} m{legs?.relay && d % legs.legDistance === 0 ? ' ⇄' : ''}</Text>
            <TextInput style={[st.input, { width: 78 }]} value={t[i]} placeholder="split" placeholderTextColor={theme.colors.textMuted} keyboardType="numbers-and-punctuation"
              accessibilityLabel={`Split at ${d} metres`} onChangeText={(x) => setT((cur) => cur.map((y, j) => (j === i ? x : y)))} onBlur={commit} onSubmitEditing={commit} />
          </View>
        ))}
      </View>
      {err ? <Text style={st.badTxt}>{err}</Text> : null}
    </View>
  );
}

/** SD-94: DNS / DQ with the World Aquatics reason (the event's strokes, the
 *  relay rules — early take-off by leg). */
function SwimStatusChips({ def, r, onChange }: { def: DisciplineDef; r: EntryResult; onChange: Change }) {
  const s = r.status ?? 'ok';
  const codes = dqCodesFor(def.key);
  const [leg, setLeg] = useState<number | undefined>(undefined);
  const relay = !!def.teamSize;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.wrap}>
        {(['DNS', 'DQ'] as ResultStatus[]).map((x) => (
          <TouchableOpacity key={x} accessibilityRole="button" accessibilityState={{ selected: s === x }} accessibilityLabel={`Mark ${x}`}
            onPress={() => onChange({ ...r, status: s === x ? undefined : x, ruleRef: undefined, reason: undefined })}
            style={[st.status, s === x && st.statusOn]}>
            <Text style={[st.statusTxt, s === x && st.statusTxtOn]}>{x}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {s === 'DQ' && (
        <>
          {relay && (
            <View style={st.wrap}>
              <Text style={st.label}>Leg</Text>
              {[1, 2, 3, 4].map((n) => <SelectChip key={n} label={String(n)} active={leg === n} onPress={() => setLeg(leg === n ? undefined : n)} />)}
            </View>
          )}
          <View style={st.wrap}>
            {codes.map((c) => {
              const on = r.ruleRef === c.ref;
              return <SelectChip key={c.ref} label={`${c.ref} · ${c.label}`} active={on} onPress={() => onChange({ ...r, ruleRef: on ? undefined : c.ref, reason: on ? undefined : dqReason(c, relay && (c.legged || leg != null) ? leg : undefined, def.key) })} />;
            })}
          </View>
          {r.reason ? <Text style={textStyles.muted}>{r.ruleRef} — {r.reason}</Text> : <Text style={textStyles.muted}>Pick the reason{relay ? ' (and the leg)' : ''}; no time or place is recorded for a DQ (SW 11.4).</Text>}
        </>
      )}
    </View>
  );
}

function SmallNum({ label, value, editable, onSave }: { label: string; value?: number; editable: boolean; onSave: (v: number | undefined) => void }) {
  const [t, setT] = useState(value != null ? String(value) : '');
  return (
    <View style={st.inline}>
      <Text style={st.label}>{label}</Text>
      <TextInput style={[st.input, { width: 64 }]} value={t} onChangeText={setT} editable={editable} keyboardType="number-pad" accessibilityLabel={label}
        onBlur={() => onSave(num(t))} onSubmitEditing={() => onSave(num(t))} />
    </View>
  );
}

function DeciderField({ label, value, onSave }: { label: string; value?: number; onSave: (v: number | undefined) => void }) {
  return <SmallNum label={label} value={value} editable onSave={onSave} />;
}

function StatusChips({ def, r, onChange }: { def: DisciplineDef; r: EntryResult; onChange: Change }) {
  const s = r.status ?? 'ok';
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.wrap}>
        {statusesFor(def).map((x) => (
          <TouchableOpacity key={x} accessibilityRole="button" accessibilityState={{ selected: s === x }} accessibilityLabel={`Mark ${x}`}
            onPress={() => onChange({ ...r, status: s === x ? undefined : x, ruleRef: s === x ? undefined : x === 'FS' ? 'TR 16.8' : r.ruleRef })}
            style={[st.status, s === x && st.statusOn]}>
            <Text style={[st.statusTxt, s === x && st.statusTxtOn]}>{x}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {(s === 'DQ' || s === 'FS') && (
        <RuleRef value={r.ruleRef} hint={ruleHint(def)} onSave={(v) => onChange({ ...r, ruleRef: v || undefined })} />
      )}
    </View>
  );
}

function RuleRef({ value, hint, onSave }: { value?: string; hint: string; onSave: (v: string) => void }) {
  const [t, setT] = useState(value ?? '');
  return (
    <View style={st.inline}>
      <Text style={st.label}>Rule</Text>
      <TextInput style={[st.input, { flex: 1 }]} value={t} onChangeText={setT} placeholder={hint} placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Rule reference" onBlur={() => onSave(t.trim())} onSubmitEditing={() => onSave(t.trim())} />
    </View>
  );
}

/** Field events: one cell per attempt; the selected round's cell is the input. */
function AttemptCells({ def, r, round, editable, extraAllowed, onChange }: { def: DisciplineDef; r: EntryResult; round: number; editable: boolean; extraAllowed: boolean; onChange: Change }) {
  const count = def.attempts?.count ?? 3;
  const slots = count + (def.attempts?.extra ?? 0);
  const list = r.attempts ?? [];
  const [t, setT] = useState('');
  const [w, setW] = useState('');
  const i = round - 1;
  const allowed = editable && (i < count || extraAllowed) && list.length >= i;
  const put = (a: EntryResult['attempts'] extends (infer A)[] | undefined ? A : never) => {
    const next = [...list];
    next[i] = a;
    onChange({ ...r, attempts: next });
    setT(''); setW('');
  };
  const commit = () => {
    const p = parseMark(t, def);
    if (p) put({ mark: p.mark, ...(def.wind === 'attempt' && num(w) != null ? { wind: num(w) } : {}) });
  };
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.cells}>
        {Array.from({ length: slots }, (_, k) => (
          <View key={k} style={[st.cell, k === i && st.cellOn, k >= count && !extraAllowed && st.cellOff]}>
            <Text style={st.cellTxt}>{attemptText(list[k], def) || (k < list.length ? '' : '·')}</Text>
            {def.wind === 'attempt' && list[k]?.wind != null ? <Text style={st.cellWind}>{windText(list[k]?.wind)}</Text> : null}
          </View>
        ))}
      </View>
      {allowed && (
        <View style={st.inline}>
          <TextInput style={[st.input, { width: 80 }]} value={t} onChangeText={setT} placeholder={`R${round}`} placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad" accessibilityLabel={`Attempt ${round} mark`} onSubmitEditing={commit} />
          {def.wind === 'attempt' && (
            <TextInput style={[st.input, { width: 64 }]} value={w} onChangeText={setW} placeholder="wind" placeholderTextColor={theme.colors.textMuted}
              keyboardType="numbers-and-punctuation" accessibilityLabel={`Attempt ${round} wind`} onSubmitEditing={commit} />
          )}
          <SelectChip label="✓" active={false} onPress={commit} />
          <SelectChip label="X" active={list[i]?.foul === true} onPress={() => put({ foul: true })} />
          <SelectChip label="–" active={list[i]?.pass === true} onPress={() => put({ pass: true })} />
        </View>
      )}
    </View>
  );
}

function BarHeights({ def, bar, current, onPick, onAdd, editable }: { def: DisciplineDef; bar: number[]; current: number | null; onPick: (h: number) => void; onAdd: (h: number) => Promise<void>; editable: boolean }) {
  const [t, setT] = useState('');
  return (
    <Card style={{ gap: theme.spacing(2), padding: theme.spacing(3) }}>
      <Text style={st.label}>Bar heights</Text>
      <View style={st.wrap}>
        {bar.map((h) => <SelectChip key={h} label={formatMark(h, def)} active={current === h} onPress={() => onPick(h)} />)}
        {!bar.length && <Text style={textStyles.muted}>Add the opening height.</Text>}
      </View>
      {editable && (
        <View style={st.inline}>
          <TextInput style={[st.input, { width: 90 }]} value={t} onChangeText={setT} placeholder="1.20" placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad" accessibilityLabel="New bar height" />
          <SelectChip label="Add height" active={false} onPress={() => { const p = parseMark(t, def); if (p) { setT(''); void onAdd(p.mark); } }} />
        </View>
      )}
    </Card>
  );
}

function HeightRow({ def, r, bar, editable, onChange }: { def: DisciplineDef; r: EntryResult; bar: number | null; editable: boolean; onChange: Change }) {
  const list = r.heights ?? [];
  const sum = summarizeHeights(list);
  const at = bar == null ? undefined : list.find((h) => h.height === bar);
  const tries = at?.tries ?? '';
  const done = tries.endsWith('O') || tries.endsWith('-') || tries.length >= 3;
  const set = (next: string) => {
    const rest = list.filter((h) => h.height !== bar);
    onChange({ ...r, heights: next ? [...rest, { height: bar as number, tries: next }].sort((a, b) => a.height - b.height) : rest });
  };
  const series = list.filter((h) => h.tries).map((h) => `${formatMark(h.height, def)} ${h.tries}`).join(' · ');
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.muted}>{series || 'No attempts yet'}{sum.eliminated ? ' · out' : ''}</Text>
      {bar != null && editable && (
        <View style={st.inline}>
          <Text style={st.label}>{formatMark(bar, def)}: {tries || '—'}</Text>
          {(['O', 'X', '-'] as const).map((x) => (
            <SelectChip key={x} label={x === '-' ? '– pass' : x} active={false} disabled={done || (sum.eliminated && !tries)} onPress={() => set(addTry(tries, x))} />
          ))}
          {tries ? <SelectChip label="Undo" active={false} onPress={() => set(tries.slice(0, -1))} /> : null}
        </View>
      )}
    </View>
  );
}

function LiftCells({ r, editable, nextSeq, onChange }: { r: EntryResult; editable: boolean; nextSeq: number; onChange: Change }) {
  const [kg, setKg] = useState('');
  const add = (lift: 'snatch' | 'cj', good: boolean) => {
    const v = num(kg);
    const list = r.lifts?.[lift] ?? [];
    if (v == null || list.length >= 3) return;
    const next: LiftAttempt[] = [...list, { kg: v, good, seq: nextSeq }];
    onChange({ ...r, lifts: { ...r.lifts, [lift]: next } });
    setKg('');
  };
  const row = (lift: 'snatch' | 'cj', label: string) => (
    <View style={st.inline}>
      <Text style={[st.label, { width: 44 }]}>{label}</Text>
      {(r.lifts?.[lift] ?? []).map((a, k) => <Text key={k} style={[st.cellTxt, a.good === false && { textDecorationLine: 'line-through', color: theme.colors.danger }]}>{a.kg}</Text>)}
      {editable && (r.lifts?.[lift]?.length ?? 0) < 3 && (
        <>
          <SelectChip label="✓ good" active={false} onPress={() => add(lift, true)} />
          <SelectChip label="✗ no lift" active={false} onPress={() => add(lift, false)} />
        </>
      )}
    </View>
  );
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {editable && <TextInput style={[st.input, { width: 90 }]} value={kg} onChangeText={setKg} placeholder="kg" placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" accessibilityLabel="Weight in kg" />}
      {row('snatch', 'Sn')}
      {row('cj', 'C&J')}
    </View>
  );
}

/* ------------------------- SD-91: field events -------------------------- */

const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`;

/** TR 25.17 trial clock: tap to start; the last 15 s show in red (the yellow flag). */
function TrialClock({ seconds, resetKey }: { seconds: number; resetKey: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => { setLeft(null); }, [resetKey]);
  useEffect(() => {
    if (left == null || left <= 0) return;
    const t = setTimeout(() => setLeft((x) => (x == null ? x : x - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const mmss = (v: number) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Trial clock" onPress={() => setLeft(left == null ? seconds : null)}
      style={[st.clock, left != null && left <= 15 && { borderColor: theme.colors.danger }]}>
      <Text style={[st.clockTxt, left != null && left <= 15 && { color: theme.colors.danger }]}>⏱ {left == null ? mmss(seconds) : left <= 0 ? 'Time' : mmss(left)}</Text>
    </TouchableOpacity>
  );
}

/** The attempt card: who is up (round order, top 8 in reverse after round 3),
 *  their series and standing, and one-tap mark / X foul / – pass. Saving moves
 *  straight on to the next athlete. */
function AttemptCard({ def, up, rows, heatRes, phaseKind, onSave }: {
  def: DisciplineDef; up: { round: number; entry: ResultEntry } | null; rows: RankedEntry[]; heatRes: ResultEntry[]; phaseKind: string;
  onSave: (id: string, round: number, a: Attempt) => void;
}) {
  const [t, setT] = useState('');
  const [w, setW] = useState('');
  const [bad, setBad] = useState(false);
  const key = up ? `${up.entry.id}:${up.round}` : 'done';
  useEffect(() => { setT(''); setW(''); setBad(false); }, [key]);
  if (!up) {
    const total = trialsFor(def, phaseKind as never);
    return (
      <Card style={st.upCard}>
        <Text style={textStyles.h3}>All trials taken</Text>
        <Text style={textStyles.muted}>{phaseKind === 'qualification' ? 'Every athlete has had 3 trials (or reached the standard).' : `Every athlete has had their trials (${total} for the finalists).`} Check the ranking, then finish below. Tap “Edit round” to correct a trial.</Text>
      </Card>
    );
  }
  const me = rows.find((r) => r.id === up.entry.id);
  const lead = rows.find((r) => r.position === 1);
  const list = up.entry.result.attempts ?? [];
  const wind = def.wind === 'attempt';
  const commit = () => {
    const p = parseMark(t, def);
    if (!p) { setBad(true); return; }
    const wv = num(w);
    onSave(up.entry.id, up.round, { mark: p.mark, ...(wind && wv != null ? { wind: wv } : {}) });
  };
  const inRound = heatRes.filter((e) => (e.result.attempts ?? []).length >= up.round).length;
  return (
    <Card style={st.upCard}>
      <View style={st.headRow}>
        <Text style={st.upRound}>R{up.round}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.upName} numberOfLines={1}>{up.entry.name}</Text>
          <Text style={textStyles.muted} numberOfLines={1}>
            {[up.entry.team?.name, `#${up.entry.result.order ?? '–'}`, me?.position ? `now ${me.label.startsWith('=') ? '=' : ''}${ord(me.position)}` : 'no mark yet'].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <TrialClock seconds={trialSeconds(def, heatRes.length)} resetKey={key} />
      </View>
      <Text style={textStyles.muted} numberOfLines={1}>
        {list.length ? `Series: ${list.map((a) => attemptText(a, def)).join('  ')}` : 'First trial'}{lead && lead.id !== up.entry.id ? `  ·  leader ${lead.entry.name.split(' ')[0]} ${lead.bestText}` : lead ? '  ·  leading' : ''}
      </Text>
      <View style={st.inline}>
        <TextInput style={[st.input, st.markInput, bad && st.bad]} value={t} onChangeText={(x) => { setT(x); setBad(false); }} placeholder="5.12"
          placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" accessibilityLabel={`Round ${up.round} mark for ${up.entry.name}`}
          onSubmitEditing={commit} autoFocus={false} />
        {wind && (
          <TextInput style={[st.input, { width: 72 }]} value={w} onChangeText={setW} placeholder="wind" placeholderTextColor={theme.colors.textMuted}
            keyboardType="numbers-and-punctuation" accessibilityLabel={`Round ${up.round} wind`} onSubmitEditing={commit} />
        )}
      </View>
      <View style={st.inline}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Save mark" onPress={commit} style={[st.bigBtn, st.bigOk]}><Text style={st.bigTxt}>✓ Mark</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Foul" onPress={() => onSave(up.entry.id, up.round, { foul: true })} style={[st.bigBtn, st.bigX]}><Text style={st.bigTxt}>X foul</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pass" onPress={() => onSave(up.entry.id, up.round, { pass: true })} style={[st.bigBtn, st.bigPass]}><Text style={st.bigTxtDark}>– pass</Text></TouchableOpacity>
      </View>
      {bad ? <Text style={st.badTxt}>Type the mark in metres, e.g. 5.12</Text> : null}
      <Text style={textStyles.muted}>{inRound}/{heatRes.length} have jumped / thrown in round {up.round}.{wind ? ' Wind in m/s (+ = tail).' : ''} Marks are measured down to the centimetre.</Text>
    </Card>
  );
}

/** HJ / PV: the bar now, who is up and their try, and O / X / – (pass). */
function HeightCard({ def, vs, bar, onTry, onAdd }: { def: DisciplineDef; vs: VerticalState | null; bar: number[]; onTry: (id: string, h: number, t: 'O' | 'X' | '-') => void; onAdd: (h: number) => void }) {
  const warn = barProgressionError(bar, def);
  if (!vs) return null;
  if (!bar.length) return <Card style={st.upCard}><Text style={textStyles.muted}>Add the opening height below to start.</Text></Card>;
  if (!vs.up || vs.height == null) {
    const one = vs.active.length === 1 ? vs.active[0] : null;
    return (
      <Card style={st.upCard}>
        <Text style={textStyles.h3}>{vs.active.length === 0 ? 'Competition over' : one ? `${one.name} has won` : 'Raise the bar'}</Text>
        <Text style={textStyles.muted}>
          {vs.active.length === 0 ? 'Everyone is out. Check the ranking (and any jump-off for 1st), then finish below.'
            : one ? `${one.name.split(' ')[0]} may keep jumping at heights they choose — or finish below.` : 'Everyone has finished at the listed heights.'}
        </Text>
        {vs.suggestNext != null && <SelectChip label={`＋ Next height ${formatMark(vs.suggestNext, def)}`} active={false} onPress={() => onAdd(vs.suggestNext!)} />}
      </Card>
    );
  }
  const h = vs.height;
  return (
    <Card style={st.upCard}>
      <View style={st.headRow}>
        <Text style={st.upRound}>{formatMark(h, def)}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.upName} numberOfLines={1}>{vs.up.name}</Text>
          <Text style={textStyles.muted} numberOfLines={1}>{[vs.up.team?.name, `try ${vs.attempt} of 3`, `${vs.active.length} still in`].filter(Boolean).join(' · ')}</Text>
        </View>
        <TrialClock seconds={trialSeconds(def, vs.active.length)} resetKey={`${vs.up.id}:${h}:${vs.attempt}`} />
      </View>
      <View style={st.inline}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cleared" onPress={() => onTry(vs.up!.id, h, 'O')} style={[st.bigBtn, st.bigOk]}><Text style={st.bigTxt}>O clear</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Failed" onPress={() => onTry(vs.up!.id, h, 'X')} style={[st.bigBtn, st.bigX]}><Text style={st.bigTxt}>X fail</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pass" onPress={() => onTry(vs.up!.id, h, '-')} style={[st.bigBtn, st.bigPass]}><Text style={st.bigTxtDark}>– pass</Text></TouchableOpacity>
      </View>
      <Text style={textStyles.muted}>Three failures in a row (at any heights) and the athlete is out. Pass a height an athlete doesn’t want to jump.</Text>
      {warn ? <Text style={st.badTxt}>{warn}</Text> : null}
    </Card>
  );
}

/** The HJ / PV card: athletes × heights, O / X / – per height. */
function HeightGrid({ def, entries, current }: { def: DisciplineDef; entries: ResultEntry[]; current: number | null }) {
  const heights = [...new Set([...entries.flatMap((e) => (e.result.heights ?? []).filter((h) => h.tries).map((h) => h.height)), ...(current != null ? [current] : [])])].sort((a, b) => a - b);
  if (!heights.length) return null;
  return (
    <Card style={{ padding: theme.spacing(2) }}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={st.gridRow}>
            <Text style={[st.gridName, st.gridHead]}>Athlete</Text>
            {heights.map((h) => <Text key={h} style={[st.gridCell, st.gridHead, h === current && st.gridCur]}>{formatMark(h, def)}</Text>)}
          </View>
          {entries.map((e) => {
            const sum = summarizeHeights(e.result.heights);
            return (
              <View key={e.id} style={st.gridRow}>
                <Text style={[st.gridName, sum.eliminated && { color: theme.colors.textMuted }]} numberOfLines={1}>{e.name.split(' ')[0]}{sum.eliminated ? ' ·out' : ''}</Text>
                {heights.map((h) => <Text key={h} style={[st.gridCell, h === current && st.gridCur]}>{(e.result.heights ?? []).find((x) => Math.abs(x.height - h) < 1e-9)?.tries ?? ''}</Text>)}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Card>
  );
}

/** "Jump-off: 1.47 Asha O, Riya X → Asha 1st" for the sheet. */
function jumpOffText(jo: JumpOff, def: DisciplineDef, entries: ResultEntry[]): string {
  const name = (id: string) => entries.find((e) => e.id === id)?.name ?? '?';
  if (jo.shared) return `Jump-off: not held — ${jo.athletes.map(name).join(' and ')} agreed to share 1st (TR 26.9).`;
  const rounds = jo.rounds.map((r) => `${formatMark(r.height, def)} ${Object.entries(r.tries).map(([id, t]) => `${name(id).split(' ')[0]} ${t}`).join(', ')}`);
  return `Jump-off: ${rounds.join(' · ') || 'not started'}`;
}

/** A tie for 1st in HJ / PV once everyone is out: a jump-off (one try per
 *  height, bar down 2 cm / 5 cm after all fail, up after several clear) or the
 *  athletes agree to share 1st (TR 26.9). */
function JumpOffCard({ def, rows, vs, bar, jo, editable, onWrite }: {
  def: DisciplineDef; rows: RankedEntry[]; vs: VerticalState | null; bar: number[]; jo?: JumpOff; editable: boolean;
  onWrite: (jo: JumpOff | undefined, places: Map<string, number>, ids: string[]) => void;
}) {
  const tied = rows.filter((r) => r.position === 1 && r.tie);
  const ids = jo?.athletes ?? tied.map((r) => r.id);
  if (!jo && (tied.length < 2 || (vs?.active.length ?? 0) > 0)) return null;
  const tieHeight = (jo ? rows.find((r) => r.id === jo.athletes[0])?.best : tied[0]?.best) ?? 0;
  const start = jumpOffStart(bar, tieHeight, def);
  const name = (id: string) => rows.find((r) => r.id === id)?.entry.name ?? '?';
  const status = jo ? jumpOffStatus(jo, def, start) : null;
  const reset = () => onWrite(undefined, new Map(), ids);
  return (
    <Card style={[st.upCard, { borderColor: theme.colors.danger }]}>
      <Text style={textStyles.h3}>{jo?.shared ? 'Shared 1st' : status?.decided ? 'Jump-off decided' : `Tie for 1st at ${formatMark(tieHeight, def)}`}</Text>
      <Text style={textStyles.muted}>{ids.map(name).join(', ')}{!jo ? ' — same failures at that height and in total.' : ''}</Text>
      {!jo && editable && (
        <View style={st.inline}>
          <SelectChip label={`Start jump-off at ${formatMark(start, def)}`} active={false} onPress={() => onWrite({ athletes: ids, rounds: [] }, new Map(), ids)} />
          <SelectChip label="They share 1st" active={false} onPress={() => onWrite({ athletes: ids, shared: true, rounds: [] }, new Map(ids.map((id) => [id, 1])), ids)} />
        </View>
      )}
      {status && !status.decided && status.up && status.height != null && (
        <>
          <Text style={st.label}>Bar {formatMark(status.height, def)} · {name(status.up)} — one try</Text>
          {editable && (
            <View style={st.inline}>
              {(['O', 'X'] as const).map((t) => (
                <TouchableOpacity key={t} accessibilityRole="button" accessibilityLabel={t === 'O' ? 'Jump-off clear' : 'Jump-off fail'}
                  onPress={() => { const next = jumpOffTry(jo!, def, start, status.up!, t); const s2 = jumpOffStatus(next, def, start); onWrite(next, s2.decided ? s2.places : new Map(), ids); }}
                  style={[st.bigBtn, t === 'O' ? st.bigOk : st.bigX]}><Text style={st.bigTxt}>{t === 'O' ? 'O clear' : 'X fail'}</Text></TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={textStyles.muted}>All fail → the bar comes down {def.key === 'ath.pv' ? '5' : '2'} cm; more than one clears → it goes up {def.key === 'ath.pv' ? '5' : '2'} cm. The jump-off decides 1st only — its heights don’t count as marks.</Text>
        </>
      )}
      {status?.decided && !jo?.shared && <Text style={textStyles.body}>{[...status.places].sort((a, b) => a[1] - b[1]).map(([id, p]) => `${ord(p)} ${name(id)}`).join(' · ')}</Text>}
      {jo && <Text style={textStyles.muted}>{jumpOffText(jo, def, rows.map((r) => r.entry))}</Text>}
      {jo && editable && <SelectChip label="Reset the jump-off" active={false} onPress={reset} />}
    </Card>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3), paddingBottom: theme.spacing(12) },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  inline: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  info: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700' },
  entryCard: { gap: theme.spacing(2), padding: theme.spacing(3) },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  lane: { width: 34, color: theme.colors.textMuted, fontWeight: '800', fontSize: theme.font.small },
  name: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  place: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.h3 },
  label: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2.5), color: theme.colors.text, fontSize: theme.font.body,
  },
  markInput: { width: 130, fontSize: theme.font.h3, fontWeight: '800' },
  bad: { borderColor: theme.colors.danger },
  preview: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
  badTxt: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  status: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  statusOn: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  statusTxt: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800' },
  statusTxtOn: { color: '#fff' },
  cells: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, minHeight: 40, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  cellOn: { borderColor: theme.colors.primary },
  cellOff: { opacity: 0.35 },
  cellTxt: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cellWind: { color: theme.colors.textMuted, fontSize: 9 },
  upCard: { gap: theme.spacing(2), padding: theme.spacing(3), borderWidth: 2, borderColor: theme.colors.primary },
  upRound: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.h3, minWidth: 40, fontVariant: ['tabular-nums'] },
  upName: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  bigBtn: { flexGrow: 1, minWidth: 88, paddingVertical: theme.spacing(3), borderRadius: theme.radius.sm, alignItems: 'center' },
  bigOk: { backgroundColor: theme.colors.primary },
  bigX: { backgroundColor: theme.colors.danger },
  bigPass: { backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border },
  bigTxt: { color: '#fff', fontWeight: '900', fontSize: theme.font.body },
  bigTxtDark: { color: theme.colors.text, fontWeight: '900', fontSize: theme.font.body },
  clock: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  clockTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', fontVariant: ['tabular-nums'] },
  gridRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  gridName: { width: 84, color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  gridCell: { width: 44, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
  gridHead: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  gridCur: { backgroundColor: theme.colors.primary + '22' },
});
