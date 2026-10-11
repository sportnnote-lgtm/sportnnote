/** One phase of a timed / measured event (results engine, SD-28): the official's
 *  phone screen. Start list by heat → enter marks / attempts / bar clearances /
 *  lifts / scores and statuses → live ranking with Q / q and PB / SB / MR
 *  flags → close the round (seeds the next one) or finish the final (records).
 *  Everything is driven by the discipline definition (unit, capture, tie rule,
 *  wind, attempts), so Wave 4 sports only add disciplines. Saves are offline-safe
 *  (the golf outbox). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useKeepAwakeWhile } from '../core/keepAwake';
import { tapFeedback } from '../core/haptics';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { askConfirm, confirmMatchAction } from '../components/ConfirmSheet';
import { confirmCopy } from '../core/matchSafety';
import { Button, Card, FormError, LoadingState, SelectChip, textStyles } from '../components/ui';
import { ResultsSheet, Flags, windText } from '../components/results/ResultsSheet';
import { WeighInCard, NextLiftCard, LiftGrid } from '../components/results/LiftingPanel';
import { SeriesCard, FinalCard } from '../components/results/ShootingPanel';
import { EndCard, BracketCard } from '../components/results/ArcheryPanel';
import { FinishOrderCard, StageCard, PointsRaceCard, SprintBracketCard, cycHeader } from '../components/results/CyclingPanel';
import type { RootStackParamList } from '../navigation/types';
import { useParamState } from '../navigation/useParamState';
import { getPlayers, getMyPlayerId } from '../data/repos';
import type { FieldEntry, FieldEvent } from '../core/types';
import {
  getPhase, getResultsPhases, getPhaseEntries, saveEntryResult, patchPhaseFormat, setPhaseStatus, advancePhase,
  completeFinal, getMarkHistory, getRecordBook, getOrgRecordBook, moveEntry, reopenPhase,
} from '../data/resultsStore';
import {
  disciplineOf, phaseOf, phaseLabel, toResultEntry, rankByHeat, qualify, withQualification, withRecordFlags,
  fieldFinalists, firstRoundsDone, attemptOrder, formatMark, parseMark, attemptText, summarizeHeights, addTry,
  eventAwards, categoryKey, categoryLabel, usesLanes,
  digitsToTime, handTime as handTimeTenth, handNote, reactionFalseStart, moveLane, startListText, resultsText, hurdleHeight,
  looseLegal, attemptNextUp, trialsFor, verticalState, jumpOffStatus, jumpOffTry, jumpOffStart, trialSeconds, barProgressionError,
  type DisciplineDef, type EntryResult, type MarkHistory, type RankedEntry, type RecordMark, type ResultStatus,
  type ResultEntry, type JumpOff, type VerticalState, type Attempt,
  phaseDiscipline, laneNumbers, rankEntries, dqCodesFor, dqReason, officialManualTime, splitDistances, splitsError,
  courseLabel, swimEventOf, eventMeetSettings, recordDefsFor, activeLift, nextSeq, weightClasses, LIFT_DISCIPLINE, liftAwards, pointsLabel,
  rangeCheck, readDigits, toggleHand, stripUnconfirmedFlags, unconfirmedOutOfRange, rowsForRecords, blankEntries, newRecords,
  closeRoundDetail, finishDetail, reopenVerdict, updateRecords, type KeypadMode, type RangeIssue, type Category,
  shootEvent, shotsOf, qualView, isFinalRows, finalState, totalText,
  archRound, isBracketRows, archQualView, archRowText, bracketState, bracketFormat, phaseNameOf, roundLine, hasMatchData, matchFormatOf, BOW_LABEL,
  isCrewSport, routeCrews, routeTarget, describeRoutes, crewMembersText, crewEventOf,
  cycKind, cycStatuses, sprintBracket, ittStart, startText, rankStage, stageClassifications, roadTimeMissing,
} from '../data/results';
import { isEventSport, eventWords } from '../sports/eventSports';
import { useAuth } from '../core/auth';
import { canOrganize } from '../core/roles';
import { canManageTournament } from '../core/org';
import { useTournamentById, useOrganizations } from '../data/hooks';
import type { TextInput as TextInputT } from 'react-native';
import { shareMessage } from '../core/share';
import { resultsLink } from '../core/shareText';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Change = (next: EntryResult) => void;

const STATUSES: ResultStatus[] = ['DNS', 'DNF', 'FS', 'DQ'];
// SD-94: in swimming a false start is a DQ (SW 4.4) and not finishing is a DQ (SW 10.2).
// SD-99 / SD-100: rowing / canoe — did not start, did not finish, excluded / disqualified
const statusesFor = (def: DisciplineDef): ResultStatus[] =>
  // SD-98 cycling: road — DNS, DNF, OTL (outside the time limit), DQ; track — DNS, DNF, DQ
  def.sport === 'cycling' ? cycStatuses(def) : isCrewSport(def.sport) ? ['DNS', 'DNF', 'DQ'] : def.sport === 'swimming' ? ['DNS', 'DQ'] : def.capture === 'single' ? (def.unit === 'time' ? STATUSES : ['DNS', 'DQ']) : ['DNS', 'DQ', 'WD'];
const ruleHint = (def: DisciplineDef) => (def.sport === 'cycling' ? 'e.g. irregular sprint / relegated (UCI)' : def.sport === 'rowing' ? 'Excluded — e.g. 2nd false start' : def.sport === 'canoe' ? 'e.g. False start / left lane (ICF)' : def.sport === 'swimming' ? 'SW 7.6' : def.sport === 'athletics' ? 'TR 16.8' : 'rule');
/** The meet's points settings for an event sport (athletics / swimming / SD-97 weightlifting). */
const pointsFor = (sport: string, fmt?: Record<string, unknown>) => eventMeetSettings(sport, fmt);
const num = (t: string) => { const v = Number(t.trim().replace(',', '.').replace('−', '-')); return t.trim() && Number.isFinite(v) ? v : undefined; };
type Course = Category['course'];
/** SD-112: a mark outside the event's usual range is never rejected — it asks first. */
const confirmRange = (issue: RangeIssue, shown: string) => askConfirm({
  title: 'Check this mark', message: issue.message, yesLabel: `Yes, save ${shown}`, noLabel: 'No, re-enter it', tone: 'caution',
});
/** Ask about an out-of-range mark; resolves { ok, rangeOk } (rangeOk = confirmed out of range). */
async function checkRange(def: DisciplineDef, mark: number, course: Course): Promise<{ ok: boolean; rangeOk?: true }> {
  const issue = rangeCheck(def, mark, course);
  if (!issue) return { ok: true };
  const ok = await confirmRange(issue, `${formatMark(mark, def)}${def.unit === 'time' ? '' : ' m'}`);
  return ok ? { ok: true, rangeOk: true } : { ok: false };
}

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
  // SD-112: the next round's state (may this round be reopened?), splits opened per entry,
  // the 5 s Undo after a one-tap foul / pass, the time boxes for "Next ›"
  const [nextResults, setNextResults] = useState<{ status: string; results: EntryResult[] } | null>(null);
  const [openSplits, setOpenSplits] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ label: string; entryId: string; prev: EntryResult } | null>(null);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(t); }, [undo]);
  const inputs = useRef(new Map<string, TextInputT | null>());
  const scroller = useRef<ScrollView>(null);

  const f = phase ? phaseOf(phase) : null;
  // SD-94: as raced at this venue (a 6- / 10-lane pool)
  const baseDef = f ? disciplineOf(f.discipline) ?? null : null;
  const def = baseDef && f ? phaseDiscipline(baseDef, f) : null;
  const swim = def?.sport === 'swimming';
  // SD-99 / SD-100: rowing / canoe — a final run as Finals A / B (places run on from A into B)
  const crew = isCrewSport(def?.sport);
  const raceFinal = !!f && f.phase === 'final' && (f.races?.length ?? 0) > 1;
  // SD-94: a final run in several heats is a timed final — places on time across heats
  const timedFinal = !!f && f.phase === 'final' && f.heats > 1 && def?.capture === 'single' && !raceFinal;
  const tournament = useTournamentById(phase?.tournamentId);
  // Who may enter results: the event's creator / hosts, the tournament's
  // managers, or an organiser. Everyone else (a shared /r/ link) reads.
  const canEdit = !!phase && (canOrganize(profile?.role) || phase.createdBy === profile?.id || (!!me && (phase.hostIds ?? []).includes(me))
    || (!!tournament && canManageTournament(tournament, orgs, me)));
  const view = canEdit ? tab : 'sheet';
  // SD-112: reopening a locked round / final is the organiser's call (not a scorer's)
  const canManage = !!phase && (canOrganize(profile?.role) || phase.createdBy === profile?.id || (!!tournament && canManageTournament(tournament, orgs, me)));

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
    const nx = all.find((p) => p.roundNo === ev.roundNo + 1);
    setNextResults(nx ? { status: nx.status, results: (await getPhaseEntries([nx.id])).map((e) => (e.result ?? {}) as EntryResult) } : null);
    // SD-90: + the school record (SR) — the best at the host organisation's other meets.
    setRecords(recs);
    setLocal(new Map());
    // SD-97: weightlifting PBs per lift and for the total
    setHistory((await Promise.all(recordDefsFor(d).map((x) => getMarkHistory(x, ens.map((e) => e.playerId), ev.id, pf.category?.course, pf.category?.shots)))).flat());
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
    if (timedFinal || raceFinal) {
      // every heat ranked together; each heat's rows keep their overall place
      // (SD-99: Finals A / B — race by race, places running on)
      const all = stripUnconfirmedFlags(withRecordFlags(rankEntries(resEntries, def, { handLegal: looseLegal(f) }), def, ctx), def, f.category?.course);
      const hs = [...new Set(resEntries.map((e) => e.heat))].sort((a, b) => a - b);
      return new Map(hs.map((h) => [h, all.filter((r) => r.entry.heat === h)]));
    }
    const byHeat = rankByHeat(resEntries, def, { handLegal: looseLegal(f) });
    const q = f.progression ? qualify(byHeat, def, f.progression) : null;
    // SD-112: an out-of-range mark nobody confirmed shows no PB / SB / MR
    return new Map([...byHeat].map(([h, rows]) => [h, stripUnconfirmedFlags(withRecordFlags(q ? withQualification(rows, q) : rows, def, ctx), def, f.category?.course)]));
  }, [def, f, phase, resEntries, history, records, srBook, timedFinal, raceFinal]);
  // SD-99 / SD-100: where each crew goes (→ Final A / → Repechage / out) and dead heats on a line
  const routing = useMemo(() => (crew && def && f?.progression?.routes?.length ? routeCrews(rankByHeat(resEntries, def, { handLegal: looseLegal(f) }), f.progression) : null), [crew, def, f, resEntries]);
  const routeNotes = useMemo(() => {
    const m = new Map<string, string>();
    if (!routing || !f) return m;
    for (const e of resEntries) {
      const d = routing.dest.get(e.id);
      const row = [...ranked.values()].flat().find((r) => r.id === e.id);
      if (d) m.set(e.id, `→ ${routeTarget(f.plan, d)}`);
      else if (row?.position != null) m.set(e.id, 'out');
    }
    return m;
  }, [routing, f, resEntries, ranked]);
  // SD-98 cycling: the event kind, a sprint bracket, an order event (road race, keirin, points …)
  const cycK = def?.sport === 'cycling' ? cycKind(def.key) : undefined;
  const sprintBr = cycK === 'sprint' && isBracketRows(resEntries);
  const orderEv = def?.capture === 'order';
  const heatName = (h: number) => (raceFinal && cycK ? (h === 1 ? 'Final for gold' : 'Final for bronze') : raceFinal ? `Final ${f?.races?.[h - 1] ?? h}` : f?.phase === 'repechage' ? `Repechage ${h}` : f?.phase === 'semi' && crew ? `Semi-final ${h}` : `Heat ${h}`);
  // SD-96: shooting — the ISSF event, and whether this phase is its elimination final
  const shoot = shootEvent(def);
  const shootFinalPhase = !!shoot && isFinalRows(resEntries);
  // SD-95: archery — the round, and whether this phase is match play (the bracket)
  const arch = def?.sport === 'archery' ? archRound(def) : undefined;
  const archBracket = !!arch && isBracketRows(resEntries);
  // SD-95: a tie for the last match-play place is shot off (WA)
  const archCut = useMemo(() => {
    if (!arch || !def || !f?.progression || archBracket) return new Set<string>();
    return new Set(qualify(rankByHeat(resEntries, def), def, f.progression).tieAtLine);
  }, [arch, def, f, resEntries, archBracket]);
  // SD-97: weightlifting — the snatch and C&J rankings (own medals / records / PBs)
  const lifts = def?.capture === 'lifts';
  const liftRanked = useMemo(() => {
    if (!lifts || !f || !phase) return null;
    const ctx = { history, records: [...records, ...srBook], category: categoryKey(f.category), seasonFrom: `${phase.startsAt.slice(0, 4)}-01-01`, eventKey: f.eventKey };
    const one = (k: 'snatch' | 'cj') => { const d = disciplineOf(LIFT_DISCIPLINE[k])!; return stripUnconfirmedFlags(withRecordFlags(rankEntries(resEntries, d), d, ctx), d); };
    return { snatch: one('snatch'), cj: one('cj') };
  }, [lifts, f, phase, resEntries, history, records, srBook]);
  // SD-94: the overall order of a timed final (the sheet / share), and the
  // swim-off a tie at the qualifying line needs (SW 3.2.3)
  const overall = useMemo(() => (timedFinal || raceFinal ? [...ranked.values()].flat().sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.status === 'ok' ? 0 : 1) - (b.status === 'ok' ? 0 : 1)) : null), [ranked, timedFinal, raceFinal]);
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
    tapFeedback(); // SD-110: feel that the mark went in
    setLocal((m) => new Map(m).set(entry.id, next));
    try {
      setPending(await saveEntryResult(entry.id, next));
      if (phase?.status === 'scheduled') { await setPhaseStatus(phase.id, 'live'); setPhase({ ...phase, status: 'live' }); }
    } catch (e) { setError((e as Error).message); }
  };
  const resultOf = (e: FieldEntry): EntryResult => (local.get(e.id) ?? (e.result as EntryResult) ?? {});

  // SD-110 — keep the official's phone awake while entering results of an open event.
  const focused = useIsFocused();
  useKeepAwakeWhile(focused && editable && view === 'enter');

  if (loading) return <LoadingState />;
  if (!phase || !f || !def) return <SafeAreaView style={st.safe}><Text style={[textStyles.muted, { padding: 16 }]}>This event isn't available.</Text></SafeAreaView>;

  const next = f.plan?.[f.phaseNo];
  // SD-95: "Ranking round" / "Match play" for archery; the usual labels elsewhere
  // SD-98: a stage race's phases are all 'stage' — this phase reads "Stage 2"
  const pName = (k: typeof f.phase) => phaseNameOf({ discipline: f.discipline, phase: k, plan: f.plan, ...(k === f.phase ? { phaseNo: f.phaseNo } : {}) });
  const orderFor = (list: FieldEntry[]) => {
    if (def.capture === 'attempts') {
      const ids = attemptOrder(list.map((e) => toResultEntry(e, nameOf)), def, round).map((e) => e.id);
      const rest = list.filter((e) => !ids.includes(e.id));
      return [...ids.map((id) => list.find((e) => e.id === id)!), ...rest];
    }
    const key = (e: FieldEntry) => (resultOf(e).lane ?? resultOf(e).order ?? 99);
    return [...list].sort((a, b) => key(a) - key(b));
  };

  const course = f.category?.course;
  const advance = async () => {
    if (!next) return;
    // SD-112: say who has no result — they drop out without a place
    const detail = f.progression?.stage
      // SD-98: a stage race — finishers start the next stage with their GC time
      ? `${roadTimeMissing(resEntries) ? 'Some riders on the line have no time yet — type the winner’s time first. ' : ''}Every rider who finished this stage starts stage ${f.phaseNo + 1} carrying their GC time (bonuses off, points and KOM kept); DNF, OTL, DQ and DNS riders are out of the race. An organiser can reopen this stage until the next one has results.`
      : f.progression?.routes?.length
      // SD-99 / SD-100: crews go where the progression sends them
      ? `${closeRoundDetail(blankEntries(resEntries, def), def, pName(next.phase).toLowerCase()).split('The qualifiers')[0]}Each crew goes on by place: ${describeRoutes(f.progression.routes, f.plan)}${routing?.tieAtLine.length ? '. A dead heat on a line sends both crews on (enter a re-row / draw place to separate them)' : ''}. An organiser can reopen this round until the next one has results.`
      : closeRoundDetail(blankEntries(resEntries, def), def, pName(next.phase).toLowerCase());
    const ok = await askConfirm({ ...confirmCopy('closePhase', { detail }), title: f.progression?.stage ? `Close stage ${f.phaseNo}?` : `Close ${pName(f.phase).toLowerCase()}?` });
    if (!ok) return;
    setBusy(true);
    try {
      const ev = await advancePhase(phase, merged, nameOf);
      nav.replace('ResultsEvent', { phaseId: ev.id });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const finish = async () => {
    const jo = [...ranked.values()].flat().some((r) => r.needsDecider && r.flags.includes('JO'));
    // SD-112: blank rows, unconfirmed out-of-range marks and any new meet record, in the confirm
    const rows = rankEntries(resEntries, def, { handLegal: looseLegal(f) });
    // SD-97: a weightlifting session can set snatch, C&J and total records
    let after = records;
    // SD-96: a shooting record is a qualification / match score — a final reads as its finalists' qualification scores
    // SD-95: an archery record is a ranking-round score — a bracket reads as its archers' ranking scores
    // SD-98: a sprint bracket's record is the riders' flying 200 m times
    const recRows = (d: DisciplineDef) => (shoot ? rankEntries(qualView(resEntries), d) : arch || sprintBr ? rankEntries(archQualView(resEntries), d) : d === def ? rows : rankEntries(resEntries, d));
    for (const d of recordDefsFor(def)) after = updateRecords(rowsForRecords(recRows(d), d, course), d, categoryKey(f.category), after, phase.startsAt.slice(0, 10), ['MR'], f.eventKey);
    const unfinished = (shoot && shootFinalPhase && !finalState(resEntries, shoot).done) || (archBracket && !bracketState(resEntries, bracketFormat(def)).done) || (sprintBr && !sprintBracket(resEntries)?.done) ? `The ${archBracket ? 'bracket' : 'final'} isn’t complete — the places stand as they are now. ` : '';
    const detail = unfinished + finishDetail({
      blank: blankEntries(resEntries, def), def, records: newRecords(records, after), jumpOff: jo,
      unconfirmed: resEntries.filter((e) => unconfirmedOutOfRange(e.result, def, course)).length,
    });
    const ok = await confirmMatchAction('finishEvent', { detail });
    if (!ok) return;
    setBusy(true);
    try {
      const pts = isEventSport(def.sport) ? pointsFor(def.sport, tournament?.formats?.[def.sport] as Record<string, unknown> | undefined) : undefined;
      const book = await completeFinal(phase, merged, nameOf, ['MR'], pts);
      const keys = recordDefsFor(def).map((d) => d.key);
      const mine = book.filter((r) => keys.includes(r.discipline) && r.category === categoryKey(f.category));
      const what = (k: string) => (lifts ? `${k === LIFT_DISCIPLINE.snatch ? 'snatch' : k === LIFT_DISCIPLINE.cj ? 'C&J' : 'total'} ` : '');
      setInfo(mine.length ? `Records: ${mine.map((r) => `${r.scope} ${what(r.discipline)}${formatMark(r.value, def)}${lifts ? ' kg' : ''} (${r.holder})`).join(' · ')}` : null);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  // SD-112: an organiser reopens a locked round (while the next round has no
  // results) or the final (records and medal points rolled back).
  const isFinal = !next;
  const reopen = phase.status === 'completed' ? reopenVerdict(phase, nextResults, isFinal) : null;
  const doReopen = async () => {
    const nextLabel = next ? pName(next.phase).toLowerCase() : '';
    const ok = await askConfirm(isFinal
      ? { title: arch ? `Reopen ${pName(f.phase).toLowerCase()}?` : 'Reopen the final?', message: 'It goes back to live so you can correct it. Any record it set goes back to the previous holder, and its medals and points leave the meet table until you finish & lock again.', yesLabel: 'Yes, reopen final', noLabel: 'No, keep it locked', tone: 'danger' }
      : { title: `Reopen ${pName(f.phase).toLowerCase()}?`, message: `It goes back to live so you can correct it. The ${nextLabel} start list is removed and seeded again when you close this round.`, yesLabel: 'Yes, reopen round', noLabel: 'No, keep it locked', tone: 'caution' });
    if (!ok) return;
    setBusy(true);
    try {
      await reopenPhase(phase);
      setInfo(isFinal ? 'Final reopened — records and points are rolled back until you finish & lock again.' : `${pName(f.phase)} reopened.`);
      setTab('enter');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  /** SD-112: one-tap X / – (and O / X / – at the bar) can be undone for 5 s. */
  const offerUndo = (entryId: string, prev: EntryResult, label: string) => setUndo({ entryId, prev, label });
  const doUndo = () => {
    if (!undo) return;
    const e = merged.find((x) => x.id === undo.entryId);
    setUndo(null);
    if (e) void save(e, undo.prev);
  };
  /** SD-112 "Next ›": the next lane's time box (skipping DNS / DQ rows). */
  const focusAfter = (id: string) => {
    const list = orderFor(heatEntries).filter((e) => (resultOf(e).status ?? 'ok') === 'ok');
    const i = list.findIndex((e) => e.id === id);
    const nx = list[i + 1];
    if (nx) inputs.current.get(nx.id)?.focus();
  };
  const heatIdx = heats.indexOf(activeHeat);
  const nextHeat = heatIdx >= 0 && heatIdx < heats.length - 1 ? heats[heatIdx + 1] : null;

  const heatRows = ranked.get(activeHeat) ?? [];
  const meet = isEventSport(def.sport) ? pointsFor(def.sport, tournament?.formats?.[def.sport] as Record<string, unknown> | undefined) : undefined;
  // relays score × the meet's relay factor (as in the house table)
  const relayX = meet && def.teamSize && meet.relayFactor !== 1 ? meet.relayFactor : 1;
  const awards = (f.phase === 'final' ? eventAwards(overall ?? [...ranked.values()].flat(), meet ? { positionPoints: meet.positionPoints } : {}) : [])
    .map((a) => (relayX !== 1 ? { ...a, points: Math.round(a.points * relayX * 100) / 100 } : a));
  // SD-97: snatch / C&J medals when the meet awards them
  const liftMedals = lifts && !!meet?.liftMedals ? liftAwards(resEntries, { positionPoints: meet!.positionPoints, liftMedals: true }) : null;
  const wlClasses = lifts ? weightClasses(f.category?.age, f.category?.gender === 'F' ? 'F' : 'M') : [];
  const saveLift = (entryId: string, n: EntryResult, undoLabel?: string) => {
    const e = merged.find((x) => x.id === entryId);
    if (!e) return;
    if (undoLabel) offerUndo(entryId, resultOf(e), undoLabel);
    void save(e, n);
  };
  const anyMark = merged.some((e) => { const r = (e.result ?? {}) as EntryResult; return r.mark != null || (r.status ?? 'ok') !== 'ok' || !!r.attempts?.length || !!r.heights?.length || !!r.lifts?.snatch?.some((a) => a.good !== undefined || a.pass) || !!r.lifts?.cj?.some((a) => a.good !== undefined || a.pass) || !!r.fshots?.length || !!r.ends?.length || hasMatchData(r) || r.fin != null || !!Object.keys(r.spr ?? {}).length; });
  const curLift = lifts ? activeLift(resEntries) : null;
  const hurdles = hurdleHeight(def.key, f.category ?? {});
  // SD-91: the field event's set-up line (implement, board, wind gauge)
  const fieldNote = [f.implement ? `Implement ${f.implement}` : '', f.board ? `Take-off board ${f.board} m` : '', f.noWindGauge ? 'No wind gauge — jumps without a reading count for records' : ''].filter(Boolean).join(' · ');
  const curBar = def.capture === 'heights' ? (bar != null && (f.bar ?? []).includes(bar) ? bar : vState?.height ?? bar) : null;
  const saveAttempt = async (id: string, round: number, a: Attempt) => {
    const e = merged.find((x) => x.id === id);
    if (!e) return;
    const r = resultOf(e);
    const list = [...(r.attempts ?? [])];
    if (list.length < round - 1) return;
    // SD-112: a mark outside the event's usual range asks first ("512" in long jump)
    let att = a;
    if (a.mark != null) {
      const c = await checkRange(def, a.mark, course);
      if (!c.ok) return;
      if (c.rangeOk) att = { ...a, rangeOk: true };
    }
    list[round - 1] = att;
    if (a.foul || a.pass) offerUndo(id, r, `${a.foul ? 'X foul' : '– pass'} · ${toResultEntry(e, nameOf).name.split(' ')[0]} R${round}`);
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
    offerUndo(id, r, `${t === 'O' ? 'O clear' : t === 'X' ? 'X fail' : '– pass'} · ${toResultEntry(e, nameOf).name.split(' ')[0]} ${formatMark(height, def)}`);
    void save(e, { ...r, heights: [...list.filter((h) => Math.abs(h.height - height) >= 1e-9), { height, tries: next }].sort((a, b) => a.height - b.height) });
  };
  const addBar = async (h: number) => {
    // SD-112: a bar height outside the usual range ("120" for 1.20 m) asks first
    if (!(await checkRange(def, h, course)).ok) return;
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
    const title = `${f.eventTitle ?? def.label} — ${pName(f.phase)}`;
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
      <ScrollView ref={scroller} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={textStyles.h2}>{f.eventTitle ?? def.label}</Text>
          <Text style={textStyles.muted}>
            {pName(f.phase)} · {categoryLabel(f.category)} · {phase.status === 'completed' ? 'final results' : phase.status === 'live' ? 'in progress' : 'start list'}
            {pending ? `  ·  ${pending} waiting to sync` : ''}
          </Text>
        </View>
        {phases.length > 1 && (
          <View style={st.wrap}>
            {phases.map((p) => {
              const pf = phaseOf(p)!;
              return <SelectChip key={p.id} label={`${phaseNameOf(pf)}${p.status === 'completed' ? ' ✓' : ''}`} active={p.id === phase.id} onPress={() => p.id !== phase.id && nav.replace('ResultsEvent', { phaseId: p.id })} />;
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
        {crew ? <Text style={textStyles.muted}>{def.sport === 'rowing' ? 'World Rowing' : 'ICF canoe sprint'} · {crewEventOf(def.key)?.boat.label} · {def.lanes} lanes · {f.handTimed ? 'hand timing (1/100)' : 'photo finish: thousandths decide the order'}{raceFinal ? ` · Finals ${f.races!.join(', ')}: Final A for the medals, places run on into Final ${f.races![1]}` : ''}</Text> : null}
        {cycK ? <Text style={textStyles.muted}>{cycHeader(cycK, def, f)}{raceFinal ? ' · Final for gold: 1st v 2nd fastest · Final for bronze: 3rd v 4th (a catch ends the race)' : ''}</Text> : null}
        {fieldNote ? <Text style={textStyles.muted}>{fieldNote}</Text> : null}
        {shoot ? <Text style={textStyles.muted}>{shoot.rules} · {shotsOf(shoot, f.category)} shots{shootFinalPhase ? ` · final from zero: ${shoot.final?.stage ?? 'single shots'}, eliminations from the bottom` : f.shootFinal ? ' · the best go to an elimination final' : ' · no final: the match decides the medals'}{shootFinalPhase ? ' · a tie for an elimination or for gold: shoot-off' : ` · ties: ${shoot.scoring === 'integer' ? 'inner tens, then ' : ''}${shoot.positions ? 'standing, kneeling, prone, then ' : ''}the last series back`}</Text> : null}
        {arch ? <Text style={textStyles.muted}>World Archery · {BOW_LABEL[arch.bow]} · {archBracket ? (matchFormatOf(arch.bow) === 'sets' ? 'set system: ends of 3, 2 points an end, first to 6; 5–5 → one-arrow shoot-off' : 'cumulative: 5 ends of 3, higher total; level → one-arrow shoot-off') : `${roundLine(arch)} · ties: most 10s (X included), then most X${f.progression ? ' · the best go to match play' : ' · no match play: the ranking round decides the medals'}`}</Text> : null}
        {lifts ? <Text style={textStyles.muted}>IWF: snatch then clean & jerk, 3 attempts each · equal totals → whoever lifted the total first · medals for {meet?.liftMedals ? 'snatch, C&J and total' : 'the total'}{curLift && phase.status !== 'completed' ? ` · now: ${curLift === 'snatch' ? 'snatch' : 'clean & jerk'}` : ''}</Text> : null}
        <FormError message={error} />
        {info ? <Text style={st.info}>{info}</Text> : null}

        {view === 'enter' && (
          <>
            {heats.length > 1 && (
              <View style={st.wrap}>
                {heats.map((h) => <SelectChip key={h} label={heatName(h)} active={h === activeHeat} onPress={() => setHeat(h)} />)}
              </View>
            )}
            {f.progression?.routes?.length ? (
              <Text style={textStyles.muted}>Progression: {describeRoutes(f.progression.routes, f.plan)}.</Text>
            ) : null}
            {f.carry?.length ? (
              <Text style={textStyles.muted}>Already through: {f.carry.map((c) => `${c.label ?? c.result.name ?? 'Crew'} (${c.from}) → ${routeTarget(f.plan, c)}`).join(' · ')}.</Text>
            ) : null}
            {f.progression && !f.progression.routes?.length && !f.progression.stage && (
              <Text style={textStyles.muted}>
                Through: {f.progression.byPlace ? `first ${f.progression.byPlace} in each heat (Q)` : ''}{f.progression.byMark ? ` + ${f.progression.byMark} fastest / best (q)` : ''}{f.progression.standard != null ? `standard ${formatMark(f.progression.standard, def)} (Q)` : ''}{f.progression.fillTo != null && f.progression.standard == null && !f.progression.byPlace ? `the best ${f.progression.fillTo} to ${arch ? '' : 'the '}${next ? pName(next.phase).toLowerCase() : 'next round'} (q)` : ''}
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

            {lifts && phase.status !== 'completed' && (
              <WeighInCard entries={heatRes} classes={wlClasses} weightClass={f.category?.weightClass} editable={editable} onSave={saveLift} />
            )}
            {shoot && !shootFinalPhase && (editable || anyMark) && (
              <SeriesCard entries={heatRes} ev={shoot} shots={shotsOf(shoot, f.category)} mode={f.shootEntry ?? 'series'} editable={editable} onSave={saveLift} />
            )}
            {arch && !archBracket && (editable || anyMark) && <EndCard entries={heatRes} round={arch} editable={editable} onSave={saveLift} />}
            {/* SD-98 cycling: the order on the line, a stage, a points race, sprint match play */}
            {orderEv && cycK && cycK !== 'points' && cycK !== 'stage' && (editable || anyMark) && (
              <FinishOrderCard def={def} kind={cycK} entries={heatRes} editable={editable} onSave={saveLift} statuses={statusesFor(def)} />
            )}
            {cycK === 'stage' && (editable || anyMark) && (
              <StageCard def={def} stageType={f.cyc?.stageType ?? f.cyc?.stages?.[f.phaseNo - 1] ?? 'road'} stageNo={f.phaseNo} stages={f.plan?.length ?? 1} interval={f.cyc?.interval}
                entries={heatRes} editable={editable} onSave={saveLift} statuses={statusesFor(def)} />
            )}
            {cycK === 'points' && (editable || anyMark) && (
              <PointsRaceCard entries={heatRes} laps={f.cyc?.laps} every={f.cyc?.sprintEvery} editable={editable} onSave={saveLift} statuses={statusesFor(def)} />
            )}
            {sprintBr && <SprintBracketCard entries={resEntries} editable={editable} onSave={saveLift} />}
            {arch && archBracket && <BracketCard entries={resEntries} round={arch} fmt={matchFormatOf(arch.bow)} editable={editable} onSave={saveLift} />}
            {shoot && shootFinalPhase && phase.status !== 'completed' && <FinalCard entries={heatRes} ev={shoot} editable={editable} onSave={saveLift} />}
            {lifts && editable && <NextLiftCard entries={heatRes} seq={nextSeq(resEntries)} onSave={saveLift} />}
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

            {(shootFinalPhase || archBracket || sprintBr || orderEv ? [] : orderFor(heatEntries)).map((e) => {
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
                    {/* SD-98: an ITT rider's start, from the start interval */}
                    {cycK === 'itt' && f.cyc?.interval ? <Text style={textStyles.muted}>{startText(ittStart(r.order, f.cyc.interval))}</Text> : null}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.name} numberOfLines={1}>{finalists.has(e.id) && extraOpen ? '★ ' : ''}{re.name}</Text>
                      {re.team?.name ? <Text style={textStyles.muted} numberOfLines={1}>{[re.team.name !== re.name ? re.team.name : '', r.members?.length ? (crew ? crewMembersText(def.key, r.members) : r.members.map((m) => m.name.split(' ')[0]).join(', ')) : ''].filter(Boolean).join(' · ')}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={st.place}>{lifts && row?.status === 'NM' ? '—' : row?.label || ''}</Text>
                      {row ? <Flags flags={row.flags} /> : null}
                      {routeNotes.get(e.id) ? <Text style={textStyles.muted}>{routeNotes.get(e.id)}</Text> : null}
                    </View>
                  </View>
                  {arch ? (
                    <Text style={textStyles.muted} numberOfLines={2}>{archRowText(r, arch) || 'No ends yet'}</Text>
                  ) : shoot ? (
                    <Text style={textStyles.muted} numberOfLines={2}>{r.mark != null ? `${(r.series ?? []).length} series · ${totalText(r.mark, shoot.scoring === 'integer' ? r.xs : undefined, shoot.scoring)}` : 'No series yet'}{r.members?.length ? ` · ${r.members.map((m) => m.name).join(' / ')}` : ''}</Text>
                  ) : def.capture === 'single' || def.capture === 'target' ? (
                    def.unit === 'time'
                      ? <TimeField key={`${e.id}:${r.mark ?? ''}:${r.thousandths ?? ''}:${r.hand ? 'h' : ''}`} def={def} r={r} handMeet={!!f.handTimed} course={course}
                          editable={editable && (r.status ?? 'ok') === 'ok'} watchesOnly={swim && !!f.handTimed}
                          register={(x) => { inputs.current.set(e.id, x); }} onNext={() => focusAfter(e.id)} onChange={(n) => void save(e, n)} />
                      : <MarkField key={`${e.id}:${r.mark ?? ''}:${r.thousandths ?? ''}`} def={def} r={r} editable={editable && (r.status ?? 'ok') === 'ok'} onChange={(n) => void save(e, n)} />
                  ) : null}
                  {def.capture === 'attempts' && (
                    <AttemptCells def={def} r={r} round={round} editable={editable && (r.status ?? 'ok') === 'ok'} course={course}
                      extraAllowed={extraOpen && finalists.has(e.id)} onChange={(n) => void save(e, n)}
                      onUndoable={(label) => offerUndo(e.id, r, `${label} · ${re.name.split(' ')[0]} R${round}`)} />
                  )}
                  {def.capture === 'heights' && <HeightRow def={def} r={r} bar={curBar} editable={editable && (r.status ?? 'ok') === 'ok'} onChange={(n) => void save(e, n)} />}
                  {def.capture === 'lifts' && <LiftGrid r={r} editable={editable && (r.status ?? 'ok') === 'ok'} onChange={(n) => void save(e, n)} />}
                  {swim && editable && f.handTimed && (r.status ?? 'ok') === 'ok' && (
                    <WatchesField key={`${e.id}:w:${(r.watches ?? []).join(',')}`} def={def} r={r} course={course}
                      register={(x) => { inputs.current.set(e.id, x); }} onNext={() => focusAfter(e.id)} onChange={(n) => void save(e, n)} />
                  )}
                  {/* SD-112: splits stay folded behind "＋ Splits" (a 1500 m card would show 29 boxes) */}
                  {(swim || crew) && editable && (swim ? (f.splits ?? true) : !!f.splits) && splitDistances(def.key).length > 0 && (r.status ?? 'ok') === 'ok' && (
                    openSplits.has(e.id) || r.splits?.length
                      ? <SplitsField key={`${e.id}:s:${(r.splits ?? []).join(',')}`} def={def} r={r} onChange={(n) => void save(e, n)} />
                      : <SelectChip label="＋ Splits" active={false} onPress={() => setOpenSplits((cur) => new Set(cur).add(e.id))} />
                  )}
                  {/* SD-98: a pursuit final ends when one rider catches the other */}
                  {cycK === 'ip' && raceFinal && editable && (r.status ?? 'ok') === 'ok' && (
                    <SelectChip label={r.caught ? '✓ Caught (loses the race)' : 'Caught'} active={!!r.caught} onPress={() => void save(e, { ...r, caught: !r.caught || undefined })} />
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
                  {crew && editable && routing?.tieAtLine.includes(e.id) && (
                    <View style={{ gap: theme.spacing(1) }}>
                      <Text style={st.badTxt}>Dead heat on a qualifying line — both crews go on unless a re-row (or, failing that, a draw) separates them. Enter the re-row / draw place (1 = ahead).</Text>
                      <DeciderField label="Re-row / draw place" value={r.decider} onSave={(d) => void save(e, { ...r, decider: d })} />
                    </View>
                  )}
                  {arch && editable && archCut.has(e.id) && !row?.needsDecider && (
                    <View style={{ gap: theme.spacing(1) }}>
                      <Text style={st.badTxt}>Level for the last match-play place (same score, 10s and X) — a shoot-off decides who goes through (WA). Enter the shoot-off place (1 = through).</Text>
                      <DeciderField label="Shoot-off place" value={r.decider} onSave={(d) => void save(e, { ...r, decider: d })} />
                    </View>
                  )}
                  {arch && f.progression && editable && row?.tie && !row.needsDecider && !archCut.has(e.id) && (
                    <DeciderField label="Coin-toss place (seed)" value={r.decider} onSave={(d) => void save(e, { ...r, decider: d })} />
                  )}
                  {row?.needsDecider && editable && (
                    <DeciderField label={def.tie === 'vertical' ? 'Jump-off place' : arch && f.progression ? 'Shoot-off / toss place' : 'Shoot-off place'} value={r.decider} onSave={(d) => void save(e, { ...r, decider: d })} />
                  )}
                  {editable && (swim ? <SwimStatusChips def={def} r={r} onChange={(n) => void save(e, n)} /> : <StatusChips def={def} r={r} onChange={(n) => void save(e, n)} />)}
                </Card>
              );
            })}

            {nextHeat != null && (
              <Button label={`Next ${raceFinal ? 'final' : f.phase === 'repechage' ? 'repechage' : 'heat'} → ${heatName(nextHeat)}`} variant="ghost" onPress={() => { setHeat(nextHeat); scroller.current?.scrollTo({ y: 0, animated: true }); }} />
            )}

            {lifts && liftRanked && curLift === 'snatch'
              // SD-97: during the snatch nobody has a total yet — show the snatch standings
              ? <ResultsSheet def={disciplineOf(LIFT_DISCIPLINE.snatch)!} title="Live — snatch standings" heats={new Map([[1, liftRanked.snatch]])} />
              : <ResultsSheet def={def} title={cycK === 'stage' ? `GC after stage ${f.phaseNo}` : 'Live ranking'} subtitle={heats.length > 1 ? heatName(activeHeat) : undefined} heats={new Map([[activeHeat, heatRows]])} wind={windByHeat} notes={routeNotes} />}
            {cycK === 'stage' && anyMark ? <StageSheets def={def} stageNo={f.phaseNo} entries={heatRes} /> : null}

            {editable && next && <Button label={busy ? 'Seeding…' : f.progression?.stage ? `Close stage ${f.phaseNo} → start stage ${f.phaseNo + 1}` : `Close ${pName(f.phase).toLowerCase()} → seed ${arch ? '' : 'the '}${pName(next.phase).toLowerCase()}`} onPress={() => void advance()} disabled={busy} />}
            {editable && !next && <Button label={busy ? 'Finishing…' : '🏁 Finish & lock results'} onPress={() => void finish()} disabled={busy} />}
          </>
        )}

        {view === 'sheet' && (
          <>
            <ResultsSheet def={def} title={phase.title} subtitle={`${categoryLabel(f.category)}${swim ? ` · ${courseLabel(f.category?.course)}` : ''} · ${phase.startsAt.slice(0, 10)}`} heats={overall && anyMark ? new Map([[0, overall]]) : ranked} wind={windByHeat} overall={!!overall && anyMark} heatLabel={heatName} notes={routeNotes} />
            {f.jumpOff ? <Text style={textStyles.muted}>{jumpOffText(f.jumpOff, def, resEntries)}</Text> : null}
            {cycK === 'stage' && anyMark ? <StageSheets def={def} stageNo={f.phaseNo} entries={resEntries} /> : null}
            {lifts && liftRanked && anyMark && (
              <>
                <ResultsSheet def={disciplineOf(LIFT_DISCIPLINE.snatch)!} title="Snatch" heats={new Map([[1, liftRanked.snatch]])} />
                <ResultsSheet def={disciplineOf(LIFT_DISCIPLINE.cj)!} title="Clean & jerk" heats={new Map([[1, liftRanked.cj]])} />
              </>
            )}
            {awards.length > 0 && (
              <Card style={{ gap: theme.spacing(1) }}>
                <Text style={textStyles.h3}>Medals & points</Text>
                {awards.slice(0, 8).map((a) => (
                  <Text key={a.entryId} style={textStyles.body}>
                    {a.medal === 'gold' ? '🥇' : a.medal === 'silver' ? '🥈' : a.medal === 'bronze' ? '🥉' : `${a.position}.`} {a.name}{a.team?.name && a.team.name !== a.name ? ` (${a.team.name})` : ''} — {a.points} pts
                  </Text>
                ))}
                {liftMedals && (['snatch', 'cj'] as const).map((k) => (
                  <View key={k} style={{ gap: theme.spacing(1) }}>
                    <Text style={st.label}>{k === 'snatch' ? 'Snatch' : 'Clean & jerk'}</Text>
                    {liftMedals[k].filter((a) => a.medal).map((a) => (
                      <Text key={a.entryId} style={textStyles.body}>{a.medal === 'gold' ? '🥇' : a.medal === 'silver' ? '🥈' : '🥉'} {a.name} — {a.points} pts</Text>
                    ))}
                  </View>
                ))}
                <Text style={textStyles.muted}>{meet ? pointsLabel(meet.positionPoints) : 'Default 8-7-6-5-4-3-2-1'}; tied places share the points.{meet && meet.relayFactor !== 1 && def.teamSize ? ` Relays score ×${meet.relayFactor}.` : ''} These feed the meet's house / medal table.</Text>
              </Card>
            )}
          </>
        )}

        {canManage && reopen && (
          reopen.ok
            ? <Button label={busy ? 'Reopening…' : isFinal ? (arch ? `↺ Reopen ${pName(f.phase).toLowerCase()}` : '↺ Reopen final') : `↺ Reopen ${pName(f.phase).toLowerCase()}`} variant="ghost" onPress={() => void doReopen()} disabled={busy} />
            : <Text style={textStyles.muted}>Locked. {reopen.reason}</Text>
        )}
      </ScrollView>
      {undo ? (
        <View style={st.snack} accessibilityLiveRegion="polite">
          <Text style={st.snackTxt} numberOfLines={1}>{undo.label} saved</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Undo" onPress={doUndo} style={st.snackBtn}><Text style={st.snackBtnTxt}>Undo</Text></TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** SD-98: a stage's own result and the points / mountains classifications (the GC is the main sheet). */
function StageSheets({ def, stageNo, entries }: { def: DisciplineDef; stageNo: number; entries: ResultEntry[] }) {
  const cls = stageClassifications(entries);
  return (
    <>
      <ResultsSheet def={def} title={`Stage ${stageNo} result`} heats={new Map([[1, rankStage(entries)]])} />
      {cls.points.length || cls.kom.length ? (
        <Card style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.h3}>Classifications after stage {stageNo}</Text>
          {cls.points.length ? <Text style={textStyles.body}>Points: {cls.points.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} ${c.value}`).join(' · ')}</Text> : null}
          {cls.kom.length ? <Text style={textStyles.body}>Mountains (KOM): {cls.kom.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} ${c.value}`).join(' · ')}</Text> : null}
          <Text style={textStyles.muted}>Most points; equal points: more stage wins. The GC decides the medals.</Text>
        </Card>
      ) : null}
    </>
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
 *  thousandths) still works. Hand times go to the next tenth (TR 19.21).
 *  SD-112: in Hand mode the last digit is the tenth ("1053" → 1:05.3); the
 *  ".000" chip reads the last three digits as thousandths ("10853" → 10.853);
 *  a time outside the event's usual range asks first; "Next ›" saves and moves
 *  to the next lane; the Hand chip keeps the typed time (`raw`); with manual
 *  swim timing the watches are the only input (the official time is read-only). */
function TimeField({ def, r, editable, handMeet, course, watchesOnly, register, onNext, onChange }: {
  def: DisciplineDef; r: EntryResult; editable: boolean; handMeet: boolean; course: Course; watchesOnly?: boolean;
  register?: (x: TextInputT | null) => void; onNext?: () => void; onChange: Change;
}) {
  const initial = r.thousandths != null ? r.thousandths.toFixed(3) : formatMark(r.mark, def);
  const [t, setT] = useState(initial);
  const [bad, setBad] = useState<string | null>(null);
  const swim = def.sport === 'swimming';
  // SD-99 / SD-100: rowing / canoe hand times stay at 1/100 too (no tenths keypad)
  const centi = swim || isCrewSport(def.sport) || def.sport === 'cycling';
  // SD-98: track cycling is timed to 1/1000 — the last three digits are the thousandths and they ARE the time
  const milli = def.dp === 3;
  const hand = r.hand ?? (handMeet && r.mark == null ? true : false);
  // photo-finish thousandths: athletics, automatic timing only
  const photoOk = !swim && def.tie === 'photo' && !hand;
  const [photo, setPhoto] = useState(r.thousandths != null || milli);
  // SD-94: a swimming manual time stays at 1/100 (SW 11.3) — no rounding to the tenth, no tenths keypad.
  const modeFor = (h: boolean, ph: boolean): KeypadMode => (h && !centi ? 'hand' : ph && !swim && def.tie === 'photo' && !h ? 'photo' : 'auto');
  const mode = modeFor(hand, photo);
  const handTime = (v: number) => (centi ? v : handTimeTenth(v));
  const read = (text: string, m: KeypadMode = mode): { mark: number; thousandths?: number } | null => {
    const p = /[.:,]/.test(text) ? parseMark(text, def) : readDigits(text, m);
    return p && milli && p.thousandths != null ? { mark: p.thousandths } : p;
  };
  // a tap on Hand / .000 must not save the typed digits in the OLD mode first (the
  // box blurs before the chip's press): the chip's press-in skips that blur.
  const skipBlur = useRef(false);
  const box = useRef<TextInputT | null>(null);
  const preview = t.trim() && !/[.:,]/.test(t) ? read(t) : null;
  // one commit at a time (blur + "Next ›" + Enter all commit); the same text is never asked about twice
  const busy = useRef<Promise<boolean> | null>(null);
  const done = useRef(initial);
  const commit = (opt: { hand?: boolean; photo?: boolean } = {}): Promise<boolean> => {
    if (busy.current) return busy.current;
    if (t === done.current && opt.hand == null && opt.photo == null) return Promise.resolve(!bad);
    const h = opt.hand ?? hand;
    const run = async (): Promise<boolean> => {
      const text = t;
      if (!text.trim()) {
        done.current = text; setBad(null);
        if (r.mark != null) onChange({ ...r, mark: undefined, thousandths: undefined, raw: undefined, rangeOk: undefined });
        return true;
      }
      const p = read(text, modeFor(h, opt.photo ?? photo));
      if (!p) { done.current = text; setBad("Can't read that"); return false; }
      const mark = h ? handTime(p.mark) : p.mark;
      const thousandths = h ? undefined : p.thousandths;
      const c = await checkRange(def, mark, course);
      done.current = text;
      if (!c.ok) { setBad('Not saved — check the time'); return false; }
      setBad(null);
      const next: EntryResult = { ...r, mark, thousandths, hand: h, raw: { mark: p.mark, ...(p.thousandths != null ? { thousandths: p.thousandths } : {}) }, rangeOk: c.rangeOk };
      if (next.mark !== r.mark || next.thousandths !== r.thousandths || !!next.hand !== !!r.hand || !!next.rangeOk !== !!r.rangeOk) onChange(next);
      return true;
    };
    busy.current = run().finally(() => { busy.current = null; });
    return busy.current;
  };
  const next = () => { void commit().then((ok) => { if (ok) onNext?.(); }); };
  const pending = !!t.trim() && t !== done.current;
  const onHand = () => {
    skipBlur.current = false;
    // typed but not saved yet: save it read in the new mode; else re-derive the saved time
    if (pending) void commit({ hand: !hand });
    else onChange(toggleHand(r, !hand, centi));
  };
  const onPhoto = () => {
    skipBlur.current = false;
    setPhoto(!photo);
    // the same digits read differently now: let them be saved (and checked) again
    done.current = '\u0000'; setBad(null);
    box.current?.focus();
  };
  if (watchesOnly) {
    return (
      <View style={st.inline}>
        <Text style={st.label}>Official time</Text>
        <Text style={[st.preview, { fontSize: theme.font.h3 }]} accessibilityLabel="Official time from the watches">{r.mark != null ? formatMark(r.mark, def) : '—'}</Text>
        <Text style={textStyles.muted}>from the watches below</Text>
      </View>
    );
  }
  const shown = preview ? `${formatMark(hand ? handTime(preview.mark) : preview.mark, hand && !centi ? { ...def, dp: 1 } : def)}${hand && !centi ? 'h' : ''}${preview.thousandths != null && mode === 'photo' ? ` (${preview.thousandths.toFixed(3)})` : ''}` : '';
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={st.inline}>
        <TextInput ref={(x) => { box.current = x; register?.(x); }} style={[st.input, st.markInput, !!bad && st.bad]} value={t} onChangeText={(x) => { setT(x); setBad(null); }} editable={editable}
          placeholder={mode === 'hand' ? '108 = 10.8' : mode === 'photo' ? '10853 = 10.853' : '1085 = 10.85'}
          placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" returnKeyType="next" accessibilityLabel="Time" selectTextOnFocus
          onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } void commit(); }} onSubmitEditing={next} blurOnSubmit={false} />
        {editable && onNext ? <SelectChip label="Next ›" active={false} onPress={next} /> : null}
        {!swim || !handMeet ? (
          <ModeChip label={swim ? 'Manual' : 'Hand'} active={hand} disabled={!editable} onPressIn={() => { skipBlur.current = true; }} onPress={onHand} />
        ) : null}
        {photoOk && editable ? <ModeChip label=".000" active={photo} onPressIn={() => { skipBlur.current = true; }} onPress={onPhoto} /> : null}
      </View>
      {shown ? <Text style={st.preview}>= {shown}</Text> : null}
      {bad ? <Text style={st.badTxt}>{bad}</Text> : null}
      {hand ? <Text style={textStyles.muted}>{swim ? 'Manual time to 1/100 (SW 11.3).' : centi ? 'Hand time to 1/100 — the order on the line is the finish judges’ call.' : `${handNote(def, r.mark)} Type the tenth last: 108 = 10.8, 1053 = 1:05.3.`}{handMeet ? '' : ' Not record-eligible.'}{r.raw && r.raw.mark !== r.mark ? ` Typed ${formatMark(r.raw.thousandths ?? r.raw.mark, { ...def, dp: r.raw.thousandths != null ? 3 : def.dp })} is kept.` : ''}</Text> : null}
      {photo && photoOk && editable && !(milli && r.mark != null) ? <Text style={textStyles.muted}>{milli ? 'Track timing to 1/1000: the last three digits are the thousandths (9088 = 9.088).' : centi ? 'Photo finish: the last three digits are thousandths — they decide the order; the time shows to 1/100.' : 'Photo finish: the last three digits are thousandths; the official time rounds up to the hundredth (TR 19.24).'}</Text> : null}
    </View>
  );
}

/** A SelectChip-looking toggle that reports press-in (before the time box blurs on web). */
function ModeChip({ label, active, disabled, onPressIn, onPress }: { label: string; active: boolean; disabled?: boolean; onPressIn: () => void; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }} disabled={disabled}
      delayPressIn={0} onPressIn={onPressIn} onPress={onPress} activeOpacity={0.8} style={[st.mode, active && st.modeOn, disabled && { opacity: 0.4 }]}>
      <Text style={[st.modeTxt, active && st.modeTxtOn]}>{label}</Text>
    </TouchableOpacity>
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
 *  time is two-of-three, else the middle one, or the average of two (thousandth dropped).
 *  SD-112: with manual timing on these are the only input; an official time
 *  outside the usual range asks first. */
function WatchesField({ def, r, course, register, onNext, onChange }: {
  def: DisciplineDef; r: EntryResult; course: Course; register?: (x: TextInputT | null) => void; onNext?: () => void; onChange: Change;
}) {
  const initial = (r.watches ?? []).map((w) => formatMark(w, def)).join(' ');
  const [t, setT] = useState(initial);
  const [bad, setBad] = useState<string | null>(null);
  const read = (x: string) => (/[.:,]/.test(x) ? parseMark(x, def)?.mark : digitsToTime(x)) ?? undefined;
  const vals = t.trim() ? t.trim().split(/\s+/).slice(0, 3).map(read) : [];
  const official = officialManualTime(vals);
  const busy = useRef<Promise<boolean> | null>(null);
  const done = useRef(initial);
  const commit = (): Promise<boolean> => {
    if (busy.current) return busy.current;
    if (t === done.current) return Promise.resolve(!bad);
    const run = async () => {
      const text = t;
      const w = vals.filter((x): x is number => x != null);
      if (!w.length || official == null) { done.current = text; if (text.trim()) setBad("Can't read the watches"); return !text.trim(); }
      const c = await checkRange(def, official, course);
      done.current = text;
      if (!c.ok) { setBad('Not saved — check the watches'); return false; }
      setBad(null);
      onChange({ ...r, watches: w, mark: official, hand: true, thousandths: undefined, raw: undefined, rangeOk: c.rangeOk });
      return true;
    };
    busy.current = run().finally(() => { busy.current = null; });
    return busy.current;
  };
  const next = () => { void commit().then((ok) => { if (ok) onNext?.(); }); };
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <View style={st.inline}>
        <Text style={st.label}>Watches</Text>
        <TextInput ref={register} style={[st.input, { flex: 1, minWidth: 120 }, !!bad && st.bad]} value={t} onChangeText={(x) => { setT(x); setBad(null); }}
          placeholder="3245 3251 3248" placeholderTextColor={theme.colors.textMuted} returnKeyType="next" blurOnSubmit={false}
          keyboardType="numbers-and-punctuation" accessibilityLabel="Times from the lane's watches" onBlur={() => void commit()} onSubmitEditing={next} />
        {onNext ? <SelectChip label="Next ›" active={false} onPress={next} /> : null}
      </View>
      {official != null ? <Text style={st.preview}>→ official {formatMark(official, def)}</Text> : null}
      {bad ? <Text style={st.badTxt}>{bad}</Text> : null}
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
function AttemptCells({ def, r, round, editable, extraAllowed, course, onChange, onUndoable }: {
  def: DisciplineDef; r: EntryResult; round: number; editable: boolean; extraAllowed: boolean; course: Course; onChange: Change; onUndoable?: (label: string) => void;
}) {
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
  const commit = async () => {
    const p = parseMark(t, def);
    if (!p) return;
    // SD-112: out-of-range field marks ask first
    const c = await checkRange(def, p.mark, course);
    if (!c.ok) return;
    put({ mark: p.mark, ...(def.wind === 'attempt' && num(w) != null ? { wind: num(w) } : {}), ...(c.rangeOk ? { rangeOk: true } : {}) });
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
            keyboardType="decimal-pad" accessibilityLabel={`Attempt ${round} mark`} onSubmitEditing={() => void commit()} />
          {def.wind === 'attempt' && (
            <TextInput style={[st.input, { width: 64 }]} value={w} onChangeText={setW} placeholder="wind" placeholderTextColor={theme.colors.textMuted}
              keyboardType="numbers-and-punctuation" accessibilityLabel={`Attempt ${round} wind`} onSubmitEditing={() => void commit()} />
          )}
          <SelectChip label="✓" active={false} onPress={() => void commit()} />
          <SelectChip label="X" active={list[i]?.foul === true} onPress={() => { onUndoable?.('X foul'); put({ foul: true }); }} />
          <SelectChip label="–" active={list[i]?.pass === true} onPress={() => { onUndoable?.('– pass'); put({ pass: true }); }} />
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
  // SD-112: 44 pt targets, set apart from the time box above
  status: { minHeight: 44, minWidth: 56, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  statusOn: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  statusTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
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
  mode: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3.5), justifyContent: 'center', borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  modeOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  modeTxt: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  modeTxtOn: { color: '#06120D' },
  snack: {
    position: 'absolute', left: theme.spacing(4), right: theme.spacing(4), bottom: theme.spacing(4), flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingLeft: theme.spacing(4), maxWidth: 560, alignSelf: 'center',
  },
  snackTxt: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  snackBtn: { minHeight: 48, minWidth: 72, paddingHorizontal: theme.spacing(4), alignItems: 'center', justifyContent: 'center' },
  snackBtnTxt: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900' },
});
