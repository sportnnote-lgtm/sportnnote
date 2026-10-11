/**
 * Results engine storage (SD-28) — phases on `field_events`, entries on
 * `field_entries`, demo store first, the same offline-safe outbox as golf
 * (data/golf.ts saveFieldResult). The maths is in data/results/*.
 *
 *   phase  = field_events row, format.results = PhaseFormat (round_no = phaseNo)
 *   entry  = field_entries row, group_no = heat, result = EntryResult,
 *            team_id = relay team / school / house (migration 0051)
 *   records = the tournament's formats[sport].records (JSON) — or, with no
 *            tournament, the demo store only
 */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { demo, genId } from './demoStore';
import type { FieldEntry, FieldEvent, SportId } from '../core/types';
import { saveFieldResult, toEntry, toEvent, getFieldEntries } from './golf';
import { patchTournamentFormat } from './repos';
import {
  disciplineOf, phaseOf, planRounds, seedHeats, fieldStatusFor, toResultEntry, performanceOf, rankByHeat, rankEntries,
  qualify, nextRound, updateRecords, categoryKey, categoryLabel, phaseLabel, withQualification, eventAwards, phaseLines,
  groupMeet, deriveRecordBook, meetFieldResults, seedOrder,
  type Category, type DisciplineDef, type EntryResult, type MarkHistory, type PhaseFormat, type PlannedPhase,
  type RecordMark, type RecordScope, type ResultEntry, type RankedEntry, type PhaseKind, compareKeys, type MeetEvent, type MeetPhase, type PhaseInfo, type PointsSettings,
  type FieldResultInput, looseLegal, seededRng, phaseDiscipline, swimSeed, timedFinalHeats, laneOrder, type Seeded,
  rowsForRecords, recordsFor, rollbackRecords, reopenVerdict, recordDefsFor, liftLines, shootLines, finalistResult, qualView,
  phaseNameOf, archLines, archQualView, bracketEntrant, bracketSeeds, hasMatchData, advanceCrews, crewLines, isCrewSport,
  cycLines, cycKind, sprintEntrant, stageFinishers, type CycFormat,
  roadLines, phaseTeams, teamAwards, roadRecordsAllowed, type RoadFormat,
  combinedStandings, combinedAwards, combinedLines, combinedEventLines, combinedRanked, combinedSeed, combinedBar, continuing, nextCombinedFormat,
  combinedKey, markKey, type CombinedKind, type CombinedTable, type CombinedPhaseInput,
  plannedSlot, type PhaseSched,
} from './results';
import { removeFieldEntry } from './golf';
import { applyRecordOps, recordOpsFor, bestRecords, type RecordOp } from './results/recordBook';
import { updateFieldEventFormat } from './golf';
import { finalAlert, combinedAlert, type ResultAlert } from './results/alerts';
import { phaseRules, zeroLanes, type CompRules } from './results/competitionRules';

/** SD-131 — leave the podium on the row (format.alert) for the follower push.
 *  Never blocks the lock: the push is a courtesy, the result is what matters. */
async function saveResultAlert(id: string, alert: ResultAlert): Promise<void> {
  try { await updateFieldEventFormat(id, { alert }); } catch { /* no alert — the push falls back to the stat lines */ }
}
import { isEventSport } from '../sports/eventSports';

const live = () => isSupabaseConfigured && !!supabase;

/** Thrown when an action needs migration 0051 (relay / crew rows, team links). */
export const NEEDS_UPDATE = 'Relay and crew entries need the latest database update — ask your administrator to run it.';
const missingColumn = (msg?: string) => !!msg && /team_id|null value in column "player_id"/i.test(msg);

export interface NewEntrant {
  playerId?: string;
  name: string;
  team?: { id?: string; name: string; colorHex?: string };
  members?: { playerId?: string; name: string }[];
  /** seed mark (season best / entry time) — better first */
  seed?: number;
  bib?: string;
  /** SD-97: start-list fields known at entry (bodyweight, opening declarations) */
  start?: Pick<EntryResult, 'bodyweight' | 'lifts'>;
}

export interface NewResultsEvent {
  discipline: string;
  category?: Category;
  /** "100 m U14 Boys" — defaults to discipline + category */
  title?: string;
  tournamentId?: string;
  startsAt?: string;
  hostIds?: string[];
  entrants: NewEntrant[];
  /** the rounds; default planRounds(discipline, entrants) */
  plan?: PlannedPhase[];
  /** SD-90 lanes: 'draw' = World Athletics first round (TR 20.4.3: drawn
   *  lanes, seeded heats); 'seeded' (default) = best in the centre lanes */
  lanes?: 'draw' | 'seeded';
  /** the draw's random source (tests pass a seeded one) */
  rng?: () => number;
  /** SD-90 meet settings carried on every phase */
  handTimed?: boolean;
  reaction?: boolean;
  /** SD-91 field events: bar heights (HJ / PV), implement, TJ board, no wind gauge at the pit */
  bar?: number[];
  implement?: string;
  board?: number;
  noWindGauge?: boolean;
  /** SD-94: the venue's lanes when not the discipline's default (a 6- / 10-lane pool) */
  venueLanes?: number;
  /** SD-94: 50 m splits are recorded */
  splits?: boolean;
  /** SD-96 shooting: entry by series or shot by shot; an elimination final follows */
  shootEntry?: 'series' | 'shot';
  shootFinal?: boolean;
  /** SD-98 cycling: laps, sprints, start interval, sprint heats per match, the stages */
  cyc?: CycFormat;
  /** SD-92 road / race walk / cross-country: certified course, timing, team scoring, walk rules */
  road?: RoadFormat;
  /** SD-129: the timetable slots for the event's rounds (round 1 = this phase) */
  sched?: PhaseSched;
}

// SD-95: archery phases read "Ranking round" / "Match play"
const phaseTitle = (eventTitle: string, f: Pick<PhaseFormat, 'phase' | 'discipline' | 'plan' | 'races'>) => `${eventTitle} — ${phaseNameOf(f)}`;

/** SD-141: the tournament's settings for one sport (fresh read; demo store offline). */
export async function sportFormatOf(tournamentId: string | undefined, sport: string): Promise<Record<string, unknown> | undefined> {
  if (!tournamentId) return undefined;
  if (!live()) return (demo.tournaments.find((t) => t.id === tournamentId)?.formats as Record<string, Record<string, unknown>> | undefined)?.[sport];
  const { data } = await supabase!.from('tournaments').select('formats').eq('id', tournamentId).maybeSingle();
  return (data as { formats?: Record<string, Record<string, unknown>> } | null)?.formats?.[sport];
}

/** SD-141: the competition rules a new phase of this sport carries (only non-default values). */
export async function rulesForNewPhase(tournamentId: string | undefined, sport: string): Promise<CompRules> {
  try { return phaseRules(sport, await sportFormatOf(tournamentId, sport)); } catch { return {}; }
}

async function insertPhase(input: Omit<FieldEvent, 'id' | 'status'>): Promise<FieldEvent> {
  // SD-141: a phase without the meet's rules (a new event, or an older event's
  // next round) takes them from the tournament now — later rounds copy them.
  const res = (input.format as { results?: PhaseFormat } | undefined)?.results;
  if (res && !res.rules && input.tournamentId) {
    const rules = await rulesForNewPhase(input.tournamentId, input.sport);
    input = { ...input, format: { ...input.format, results: { ...res, rules } } };
  }
  const base = withPlannedSlot(input);
  if (!live()) {
    const ev: FieldEvent = { ...base, id: genId('fev'), status: 'scheduled' };
    demo.fieldEvents.push(ev);
    return ev;
  }
  const { data, error } = await supabase!.from('field_events').insert({
    tournament_id: base.tournamentId ?? null, sport: base.sport, title: base.title, round_no: base.roundNo,
    starts_at: base.startsAt, status: 'scheduled', format: base.format, host_ids: base.hostIds ?? [],
  }).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the event');
  return toEvent(data);
}

/** SD-129: a new phase takes its slot from the event's plan of times (when
 *  the organiser scheduled this round), else keeps the given start. */
function withPlannedSlot(base: Omit<FieldEvent, 'id' | 'status'>): Omit<FieldEvent, 'id' | 'status'> {
  const slot = plannedSlot(phaseOf(base as FieldEvent), base.roundNo);
  return slot ? { ...base, startsAt: slot.at } : base;
}

export type Row = { playerId?: string; teamId?: string; heat: number; result: EntryResult };

/** SD-128: exported for late entries (meetEntriesStore). */
export async function insertEntries(eventId: string, rows: Row[]): Promise<FieldEntry[]> {
  if (!live()) {
    const out: FieldEntry[] = rows.map((r) => ({ id: genId('fen'), eventId, playerId: r.playerId ?? '', teamId: r.teamId, groupNo: r.heat, result: r.result, status: 'playing' }));
    demo.fieldEntries.push(...out);
    return out;
  }
  const payload = (withTeam: boolean) => rows.map((r) => ({
    event_id: eventId, player_id: r.playerId ?? null, group_no: r.heat, result: r.result, status: 'playing',
    ...(withTeam && r.teamId ? { team_id: r.teamId } : {}),
  }));
  let res = await supabase!.from('field_entries').insert(payload(true)).select('*');
  // Before 0051: individuals still save (team kept in the result snapshot);
  // team-only rows (relays / crews) can't exist yet.
  if (res.error && missingColumn(res.error.message)) {
    if (rows.some((r) => !r.playerId)) throw new Error(NEEDS_UPDATE);
    res = await supabase!.from('field_entries').insert(payload(false)).select('*');
  }
  if (res.error) throw new Error(res.error.message);
  return ((res.data ?? []) as any[]).map(toEntry);
}

/** Order entrants best seed first (unseeded last, in the given order). */
function bySeed(list: NewEntrant[], def: DisciplineDef): NewEntrant[] {
  const sign = def.better === 'higher' ? -1 : 1;
  return list.map((e, i) => ({ e, i })).sort((a, b) => {
    if (a.e.seed == null || b.e.seed == null) return (a.e.seed == null ? 1 : 0) - (b.e.seed == null ? 1 : 0) || a.i - b.i;
    return sign * (a.e.seed - b.e.seed) || a.i - b.i;
  }).map((x) => x.e);
}

/** Create an event: its first phase (heats, or a straight final) with the
 *  seeded start list. Later phases are created by `advancePhase`. */
export async function createResultsEvent(input: NewResultsEvent): Promise<FieldEvent> {
  const base = disciplineOf(input.discipline);
  if (!base) throw new Error('Unknown discipline');
  const venueLanes = input.venueLanes && base.lanes && input.venueLanes !== base.lanes ? input.venueLanes : undefined;
  // SD-141: the meet's competition rules (lane numbering, late lanes …) from the start
  const rules = input.tournamentId ? await rulesForNewPhase(input.tournamentId, base.sport) : undefined;
  const def = phaseDiscipline(base, { lanes: venueLanes, rules });
  if (!input.entrants.length) throw new Error('Add at least one entry.');
  if (def.teamSize && input.entrants.some((e) => e.playerId)) throw new Error(`${def.label} entries are teams, not athletes.`);
  const plan = input.plan ?? planRounds(def, input.entrants.length);
  const eventTitle = input.title ?? `${def.label} ${categoryLabel(input.category)}`;
  const first = plan[0];
  const fmt: PhaseFormat = {
    discipline: def.key, category: input.category, phase: first.phase, phaseNo: 1, heats: first.heats,
    progression: first.progression, eventKey: genId('rev'), plan, eventTitle,
    ...(input.handTimed ? { handTimed: true } : {}), ...(input.reaction ? { reaction: true } : {}),
    ...(input.bar?.length ? { bar: input.bar } : {}), ...(input.implement ? { implement: input.implement } : {}),
    ...(input.board ? { board: input.board } : {}), ...(input.noWindGauge ? { noWindGauge: true } : {}),
    ...(venueLanes ? { lanes: venueLanes } : {}), ...(input.splits ? { splits: true } : {}),
    ...(input.shootEntry ? { shootEntry: input.shootEntry } : {}), ...(input.shootFinal ? { shootFinal: true } : {}),
    // SD-98: a stage race's first stage carries its type ('road' / 'itt')
    ...(input.cyc ? { cyc: { ...input.cyc, ...(input.cyc.stages?.length ? { stageType: input.cyc.stages[0] } : {}) } } : {}),
    ...(input.road ? { road: input.road } : {}),
    ...(input.sched?.rounds.length ? { sched: input.sched } : {}),
    ...(rules ? { rules } : {}),
  };
  const ev = await insertPhase({
    tournamentId: input.tournamentId, sport: def.sport as SportId, title: phaseTitle(eventTitle, fmt), roundNo: 1,
    startsAt: input.startsAt ?? new Date().toISOString(), format: { results: fmt }, hostIds: input.hostIds ?? [],
  });
  const draw = input.lanes === 'draw';
  const rng = input.rng ?? Math.random;
  // A draw also shuffles the unseeded entrants; else the given order stands.
  // SD-94: swimmers without an entry time are placed by draw (SW 3.1.1).
  const ordered = draw || def.sport === 'swimming' ? seedOrder(input.entrants.map((e, i) => ({ ...e, id: String(i) })), def, rng) : bySeed(input.entrants, def);
  const ids = ordered.map((_, i) => String(i));
  // SD-94: swimming seeds by World Aquatics SW 3.1 (heats circle-seeded, the
  // fastest in the centre lanes, no lane draw); a timed final (a final run in
  // several heats) puts the fastest in the last heat — athletics too.
  let seeded = def.sport === 'swimming' ? swimSeed(ids, first.phase, first.heats, def.lanes ?? 8, def.key, zeroLanes(def.lanes ?? 8, rules))
    : first.phase === 'final' && first.heats > 1 && def.lanes && def.capture === 'single' ? timedFinalSeed(ids, def.lanes, def.key, draw ? rng : undefined)
      : seedHeats(ids, first.heats, def, draw ? rng : undefined, { drawAll: draw });
  // SD-91 field events: seeds are spread over the qualification groups; the
  // order inside a group is drawn (TR 25.5), or — not drawn — the best seed goes last.
  if (def.capture !== 'single') seeded = fieldOrder(seeded, draw ? rng : undefined);
  await insertEntries(ev.id, seeded.map((s) => {
    const e = ordered[Number(s.id)];
    return {
      playerId: e.playerId, teamId: e.team?.id, heat: s.heat,
      // SD-92: a mass-start road / XC race's start list reads in entry (bib) order
      result: { ...(e.start ?? {}), lane: s.lane, order: def.tie === 'road' ? Number(s.id) + 1 : s.order, bib: e.bib, team: e.team, ...(e.playerId ? {} : { name: e.name, members: e.members ?? [] }) },
    };
  }));
  return ev;
}

/** SD-94: a timed final in lanes — fastest heat last (at least three in the
 *  first heat), lanes by ranking inside each heat (drawn within the World
 *  Athletics groups when `rng` is given). */
function timedFinalSeed(ids: string[], lanes: number, discipline: string, rng?: () => number): Seeded[] {
  const out: Seeded[] = [];
  timedFinalHeats(ids.length, lanes).forEach((ranks, h) => {
    const order = laneOrder(Math.max(lanes, ranks.length), rng, discipline);
    ranks.forEach((rank, i) => out.push({ id: ids[rank], heat: h + 1, lane: order[i], order: i + 1 }));
  });
  return out;
}

/** Re-number the order inside each group: a draw (shuffle), else reversed (best seed last). */
function fieldOrder<T extends { heat: number; order: number }>(rows: T[], rng?: () => number): T[] {
  const out: T[] = [];
  for (const h of [...new Set(rows.map((r) => r.heat))]) {
    const g = rows.filter((r) => r.heat === h);
    if (rng) for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
    else g.reverse();
    g.forEach((r, i) => out.push({ ...r, order: i + 1 }));
  }
  return out;
}

/** Every results-engine phase (newest first) — for the dev lab / hubs. */
export async function getResultsPhases(filter: { tournamentId?: string; eventKey?: string } = {}): Promise<FieldEvent[]> {
  let evs: FieldEvent[];
  if (!live()) evs = demo.fieldEvents.filter((e) => !filter.tournamentId || e.tournamentId === filter.tournamentId);
  else {
    let q = supabase!.from('field_events').select('*').not('format->results', 'is', null).order('starts_at', { ascending: false });
    if (filter.tournamentId) q = q.eq('tournament_id', filter.tournamentId);
    if (filter.eventKey) q = q.eq('format->results->>eventKey', filter.eventKey);
    const { data } = await q;
    evs = ((data ?? []) as any[]).map(toEvent);
  }
  return evs.filter((e) => { const f = phaseOf(e); return !!f && (!filter.eventKey || f.eventKey === filter.eventKey); })
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt) || a.roundNo - b.roundNo);
}

export async function getPhase(id: string): Promise<FieldEvent | null> {
  if (!live()) return demo.fieldEvents.find((e) => e.id === id) ?? null;
  const { data } = await supabase!.from('field_events').select('*').eq('id', id).maybeSingle();
  return data ? toEvent(data) : null;
}

export { getFieldEntries as getPhaseEntries };

/** Save one entry's result (offline-safe; returns how many saves are waiting to sync). */
export function saveEntryResult(entryId: string, result: EntryResult): Promise<number> {
  const hasMark = result.mark != null || !!result.attempts?.some((a) => a.mark != null) || !!result.heights?.some((h) => h.tries.includes('O')) || !!result.lifts?.snatch?.some((l) => l.good) || !!result.lifts?.cj?.some((l) => l.good) || !!result.fshots?.length || !!result.ends?.length || hasMatchData(result) || result.fin != null || !!Object.keys(result.spr ?? {}).length;
  return saveFieldResult(entryId, result, fieldStatusFor(result.status, hasMark));
}

/** Change a phase's format (bar heights, progression …): fresh read → merge → write. */
export async function patchPhaseFormat(id: string, patch: Partial<PhaseFormat>): Promise<void> {
  const ev = await getPhase(id);
  const cur = ev && phaseOf(ev);
  if (!ev || !cur) throw new Error('Event not found');
  const format = { ...ev.format, results: { ...cur, ...patch } };
  if (!live()) { const d = demo.fieldEvents.find((e) => e.id === id); if (d) d.format = format; return; }
  const { error } = await supabase!.from('field_events').update({ format }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setPhaseStatus(id: string, status: FieldEvent['status']): Promise<void> {
  if (!live()) { const d = demo.fieldEvents.find((e) => e.id === id); if (d) d.status = status; return; }
  const { error } = await supabase!.from('field_events').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Close a round and build the next: Q / q from the heats, seeded into the next
 * phase's heats and lanes. Returns the new phase. The qualifiers keep their
 * team snapshot and relay members.
 */
export async function advancePhase(phase: FieldEvent, entries: FieldEntry[], nameOf: (id: string) => string): Promise<FieldEvent> {
  const f = phaseOf(phase);
  const base = f && disciplineOf(f.discipline);
  const def = base ? phaseDiscipline(base, f) : null;
  if (!f || !def) throw new Error('Not a results event');
  // SD-93: a combined event — everyone still in goes on to the next event
  if (f.combined) return advanceCombined(phase, f, def, entries, nameOf);
  const next = f.plan?.[f.phaseNo];
  if (!next || !f.progression) throw new Error('This is the last round.');
  const res = entries.map((e) => toResultEntry(e, nameOf));
  const byHeat = rankByHeat(res, def, { handLegal: looseLegal(f) });
  // SD-98 cycling: a stage race's next stage, the sprint bracket, pursuit finals (routes), keirin final
  if (def.sport === 'cycling') {
    const kind = cycKind(def.key);
    if (kind === 'stage' && f.progression.stage) return advanceStage(phase, f, def, entries, byHeat, next);
    if (kind === 'sprint' && next.phase === 'final') return advanceToBracket(phase, f, def, entries, [...byHeat.values()].flat(), next);
    if (f.progression.routes?.length) return advanceCrewPhase(phase, f, def, entries, byHeat, next, (rows) => cycLines(f, rows));
  }
  // SD-99 / SD-100: rowing / canoe — places routed to the repechage, semis or lettered finals
  if (f.progression.routes?.length) return advanceCrewPhase(phase, f, def, entries, byHeat, next);
  // SD-95: archery — the ranking round seeds a match-play bracket
  if (def.sport === 'archery' && next.phase === 'final') return advanceToBracket(phase, f, def, entries, [...byHeat.values()].flat(), next);
  const q = qualify(byHeat, def, f.progression);
  if (!q.marks.size) throw new Error('Nobody has qualified yet — enter the results first.');
  if (isEventSport(def.sport)) {
    const ranked = [...byHeat.values()].flatMap((rows) => withQualification(rows, q));
    // SD-96: a shooting qualification writes the match score, points / shots, inner tens, "made the final"
    await writePhaseLines(phase, f, def.sport === 'shooting' ? shootLines(f, ranked, 'qual') : def.sport === 'cycling' ? cycLines(f, ranked) : phaseLines(f, ranked));
  }
  let seeded = def.sport === 'swimming' ? swimNextRound(byHeat, def, q, next.phase, next.heats) : nextRound(byHeat, def, q, next.heats);
  // SD-91: a field final's order is drawn afresh (TR 25.5); a vertical final keeps the bar heights.
  if (def.capture !== 'single') seeded = fieldOrder(seeded, seededRng(Date.now()));
  const fmt: PhaseFormat = { ...f, phase: next.phase, phaseNo: f.phaseNo + 1, heats: next.heats, progression: next.progression, bar: def.capture === 'heights' ? f.bar : undefined, jumpOff: undefined };
  const ev = await insertPhase({
    tournamentId: phase.tournamentId, sport: phase.sport, title: phaseTitle(f.eventTitle ?? def.label, fmt), roundNo: fmt.phaseNo,
    startsAt: new Date().toISOString(), format: { results: fmt }, hostIds: phase.hostIds ?? [],
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  await insertEntries(ev.id, seeded.map((s) => {
    const old = byId.get(s.id)!;
    const r = (old.result ?? {}) as EntryResult;
    // SD-96: a shooting finalist starts the final from zero (its qualification score kept for the sheet / records)
    const extra = def.sport === 'shooting' && next.phase === 'final' && !!f.shootFinal ? finalistResult(r) : {};
    return { playerId: old.playerId || undefined, teamId: old.teamId, heat: s.heat, result: { lane: s.lane, order: s.order, bib: r.bib, team: r.team, name: r.name, members: r.members, ...extra } };
  }));
  await setPhaseStatus(phase.id, 'completed');
  return ev;
}

/**
 * SD-95 — close an archery ranking round: the best N (the bracket's field) are
 * seeded 1 … N by rank into match play; a tie for the last place needs a
 * shoot-off first (WA), other equal ranks keep the target order (a coin toss
 * result can be entered as the shoot-off / toss place).
 */
async function advanceToBracket(phase: FieldEvent, f: PhaseFormat, def: DisciplineDef, entries: FieldEntry[], ranked: RankedEntry[], next: PlannedPhase): Promise<FieldEvent> {
  const n = f.progression?.fillTo ?? ranked.length;
  const { ids, tieAtCut } = bracketSeeds(ranked, n);
  const cyc = def.sport === 'cycling';
  if (ids.length < 2) throw new Error(cyc ? 'Match play needs at least two riders with a 200 m time — enter the qualifying times first.' : 'Match play needs at least two archers with a score — enter the ranking round first.');
  if (tieAtCut.length) {
    const names = ranked.filter((r) => tieAtCut.includes(r.id)).map((r) => r.entry.name).join(', ');
    throw new Error(cyc ? `${names} have the same 200 m time for the last match-play place — enter the commissaires' order (1 = through) as the decider, then close qualifying.` : `${names} are level for the last match-play place — a shoot-off decides it (WA). Enter each archer's shoot-off place, then close the ranking round.`);
  }
  const seeded = new Set(ids);
  // SD-98: a sprint qualifying writes the riders' 200 m times
  await writePhaseLines(phase, f, cyc ? cycLines(f, ranked) : archLines(f, ranked.map((r) => (seeded.has(r.id) ? { ...r, flags: ['q' as const, ...r.flags] } : r)), 'qual', [], seeded));
  const fmt: PhaseFormat = { ...f, phase: next.phase, phaseNo: f.phaseNo + 1, heats: 1, progression: undefined };
  const ev = await insertPhase({
    tournamentId: phase.tournamentId, sport: phase.sport, title: phaseTitle(f.eventTitle ?? def.label, fmt), roundNo: fmt.phaseNo,
    startsAt: new Date().toISOString(), format: { results: fmt }, hostIds: phase.hostIds ?? [],
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  await insertEntries(ev.id, ids.map((id, i) => {
    const old = byId.get(id)!;
    const r = (old.result ?? {}) as EntryResult;
    return { playerId: old.playerId || undefined, teamId: old.teamId, heat: 1, result: { bib: r.bib, team: r.team, name: r.name, members: r.members, ...(cyc ? sprintEntrant(r, i + 1, f.cyc?.bo ?? 3) : bracketEntrant(r, i + 1)) } };
  }));
  await setPhaseStatus(phase.id, 'completed');
  return ev;
}

/**
 * SD-99 / SD-100 — close a rowing / canoe round: every place goes where the
 * progression routes it. Crews for the next round are seeded into its heats
 * (or its lettered finals) with lanes by ranking; crews through to a later
 * round (a heat winner past the repechage to Final A) wait on the new phase's
 * format (`carry`) and join when their round is seeded.
 */
async function advanceCrewPhase(phase: FieldEvent, f: PhaseFormat, def: DisciplineDef, entries: FieldEntry[], byHeat: Map<number, RankedEntry[]>, next: PlannedPhase,
  lines: (rows: RankedEntry[]) => { playerId: string; stats: Record<string, number>; won: boolean }[] = (rows) => crewLines(f, rows)): Promise<FieldEvent> {
  const { seeded, carry } = advanceCrews(byHeat, f, next, def.lanes ?? 6);
  if (!seeded.length && !carry.length) throw new Error(def.sport === 'cycling' ? 'No rider has a time yet — enter the results first.' : 'No crew has a time yet — enter the results first.');
  await writePhaseLines(phase, f, lines([...byHeat.values()].flat()));
  const races = next.races && next.races.length > 1 ? next.races : undefined;
  const fmt: PhaseFormat = { ...f, phase: next.phase, phaseNo: f.phaseNo + 1, heats: next.heats, progression: next.progression, races, carry: carry.length ? carry : undefined, recordsBefore: undefined };
  const ev = await insertPhase({
    tournamentId: phase.tournamentId, sport: phase.sport, title: phaseTitle(f.eventTitle ?? def.label, fmt), roundNo: fmt.phaseNo,
    startsAt: new Date().toISOString(), format: { results: fmt }, hostIds: phase.hostIds ?? [],
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  await insertEntries(ev.id, seeded.map((s) => {
    const src = s.carried ? { playerId: s.carried.playerId, teamId: s.carried.teamId, result: s.carried.result as EntryResult } : (() => { const o = byId.get(s.ref)!; return { playerId: o.playerId || undefined, teamId: o.teamId, result: (o.result ?? {}) as EntryResult }; })();
    const r = src.result;
    return { playerId: src.playerId || undefined, teamId: src.teamId, heat: s.heat, result: { lane: s.lane, order: s.order, bib: r.bib, team: r.team, name: r.name, members: r.members, ...(s.race && races ? { race: s.race } : {}) } };
  }));
  await setPhaseStatus(phase.id, 'completed');
  return ev;
}

/**
 * SD-98 — close a stage of a stage race: every rider who finished it (in the
 * time limit) starts the next stage carrying the GC after this one (time,
 * ITT fractions, stage places, points / KOM, stages and stage wins); DNF /
 * OTL / DQ / DNS riders are out. The start order is the GC order.
 */
async function advanceStage(phase: FieldEvent, f: PhaseFormat, def: DisciplineDef, entries: FieldEntry[], byHeat: Map<number, RankedEntry[]>, next: PlannedPhase): Promise<FieldEvent> {
  const rows = [...byHeat.values()].flat();
  const on = stageFinishers(rows.map((r) => r.entry), f.rules);
  if (!on.length) throw new Error('No rider has finished this stage yet — enter the finish order (and the winner’s time) first.');
  await writePhaseLines(phase, f, cycLines(f, rows));
  const no = f.phaseNo + 1;
  const fmt: PhaseFormat = { ...f, phase: next.phase, phaseNo: no, heats: 1, progression: next.progression, recordsBefore: undefined, cyc: { ...(f.cyc ?? {}), stageType: f.cyc?.stages?.[no - 1] ?? 'road' } };
  const ev = await insertPhase({
    tournamentId: phase.tournamentId, sport: phase.sport, title: phaseTitle(f.eventTitle ?? def.label, fmt), roundNo: no,
    startsAt: new Date().toISOString(), format: { results: fmt }, hostIds: phase.hostIds ?? [],
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  // a time-trial stage starts in reverse GC order (the leader last); a road stage keeps the GC order
  const itt = fmt.cyc?.stageType === 'itt';
  const order = itt ? [...on].reverse() : on;
  await insertEntries(ev.id, order.map((x, i) => {
    const old = byId.get(x.id)!;
    const r = (old.result ?? {}) as EntryResult;
    return { playerId: old.playerId || undefined, teamId: old.teamId, heat: 1, result: { order: i + 1, bib: r.bib, team: r.team, name: r.name, gc: x.gc } };
  }));
  await setPhaseStatus(phase.id, 'completed');
  return ev;
}

/* -------------------------------- records -------------------------------- */

export async function getRecordBook(tournamentId: string | undefined, sport: string): Promise<RecordMark[]> {
  if (!live() || !tournamentId) return [...(demo.resultRecords[tournamentId ?? ''] ?? [])];
  const { data } = await supabase!.from('tournaments').select('formats').eq('id', tournamentId).maybeSingle();
  const raw = (data as { formats?: Record<string, Record<string, unknown>> } | null)?.formats?.[sport]?.records;
  try { return typeof raw === 'string' ? (JSON.parse(raw) as RecordMark[]) : []; } catch { return []; }
}

/** SD-128: exported for "Delete event" (records rolled back). */
export async function saveRecordBook(tournamentId: string | undefined, sport: string, list: RecordMark[]): Promise<void> {
  if (!live() || !tournamentId) { demo.resultRecords[tournamentId ?? ''] = list; return; }
  await patchTournamentFormat(tournamentId, sport, { records: JSON.stringify(list) });
}

/* ----------------------- SD-130 record-book integrity ----------------------- */

const missingRpc = (e: { code?: string; message?: string } | null | undefined, fn: string) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || (new RegExp(fn).test(e.message ?? '') && /could not find|does not exist|schema cache/i.test(e.message ?? '')));

/**
 * Apply record-book operations (recordBook.ts) and return the book after.
 * Live: merge_field_records() merges them on the server with the tournament
 * row locked — two finals locked at once both keep their records, and an
 * event host may write what their own event set. Before that migration: a
 * fresh read, the same merge, then the old write (organisers only).
 */
export async function writeRecordOps(tournamentId: string | undefined, sport: string, ops: RecordOp[], phaseId?: string): Promise<RecordMark[]> {
  if (!ops.length) return getRecordBook(tournamentId, sport);
  if (!live() || !tournamentId) {
    const next = applyRecordOps(demo.resultRecords[tournamentId ?? ''] ?? [], ops);
    demo.resultRecords[tournamentId ?? ''] = next;
    return [...next];
  }
  const { data, error } = await supabase!.rpc('merge_field_records', { p_tid: tournamentId, p_sport: sport, p_ops: ops, p_phase: phaseId ?? null });
  if (!error) return Array.isArray(data) ? (data as RecordMark[]) : getRecordBook(tournamentId, sport);
  if (!missingRpc(error, 'merge_field_records')) throw new Error(error.message);
  const fresh = await getRecordBook(tournamentId, sport);
  const next = applyRecordOps(fresh, ops);
  await patchTournamentFormat(tournamentId, sport, { records: JSON.stringify(next) });
  return next;
}

/** A final's new records → the book. Never blocks the lock: a failed write is
 *  kept for "Retry" (and the book the final computed is returned). */
async function commitRecords(phase: FieldEvent, sport: string, book: RecordMark[], next: RecordMark[]): Promise<RecordMark[]> {
  const ops = recordOpsFor(book, next);
  try {
    const after = await writeRecordOps(phase.tournamentId, sport, ops, phase.id);
    resolveSyncIssue(phase.id, 'records');
    return after;
  } catch (e) {
    const msg = (e as Error).message || 'Network error';
    noteSyncIssue(phase, { recordOps: ops, recordsError: /can.t change this tournament/i.test(msg) ? 'Only an organiser can save this record until the latest database update is run.' : msg });
    return next;
  }
}

/** SD-130 — historic records from the school's board (organisers). Each one
 *  replaces whatever the book holds for its scope + event + category. */
export async function addHistoricRecords(tournamentId: string | undefined, sport: string, recs: RecordMark[]): Promise<RecordMark[]> {
  return writeRecordOps(tournamentId, sport, recs.map((rec) => ({ op: 'set' as const, rec })));
}

/** SD-130 — delete one record from the book (organisers). */
export async function removeRecord(tournamentId: string | undefined, sport: string, rec: Pick<RecordMark, 'scope' | 'discipline' | 'category'>): Promise<RecordMark[]> {
  return writeRecordOps(tournamentId, sport, [{ op: 'remove', scope: rec.scope, discipline: rec.discipline, category: rec.category }]);
}

/* ------------- SD-130 results that didn't reach profiles / the book ------------- */

/** What a locked phase still has to save: its stat lines (profiles) and / or its records. */
export interface ResultSyncIssue {
  phaseId: string;
  title: string;
  lines?: StatLine[];
  linesError?: string;
  recordOps?: RecordOp[];
  recordsError?: string;
}

const syncIssues = new Map<string, ResultSyncIssue & { phase: FieldEvent }>();
const syncListeners = new Set<() => void>();
const emitSync = () => { for (const l of syncListeners) l(); };

function noteSyncIssue(phase: FieldEvent, patch: Partial<ResultSyncIssue>): void {
  const cur = syncIssues.get(phase.id) ?? { phaseId: phase.id, title: phase.title, phase };
  syncIssues.set(phase.id, { ...cur, ...patch, phase });
  emitSync();
}
function resolveSyncIssue(phaseId: string, part: 'lines' | 'records'): void {
  const cur = syncIssues.get(phaseId);
  if (!cur) return;
  const next = part === 'lines' ? { ...cur, lines: undefined, linesError: undefined } : { ...cur, recordOps: undefined, recordsError: undefined };
  if (!next.lines && !next.recordOps) syncIssues.delete(phaseId); else syncIssues.set(phaseId, next);
  emitSync();
}
function clearSyncIssue(phaseId: string): void {
  if (syncIssues.delete(phaseId)) emitSync();
}

/** The unsaved part of a phase's results (or null). */
export function getSyncIssue(phaseId: string): ResultSyncIssue | null {
  const i = syncIssues.get(phaseId);
  if (!i) return null;
  const { phase: _p, ...rest } = i;
  void _p;
  return rest;
}

/** Listen for changes to the unsaved results (returns the unsubscribe). */
export function onSyncIssues(fn: () => void): () => void {
  syncListeners.add(fn);
  return () => { syncListeners.delete(fn); };
}

/** "Retry saving results to profiles": the same lines and record changes again
 *  (both idempotent). Throws the first error that's still there. */
export async function retrySync(phaseId: string): Promise<void> {
  const i = syncIssues.get(phaseId);
  if (!i) return;
  if (i.lines) {
    try { await putLines(i.phase, i.lines); resolveSyncIssue(phaseId, 'lines'); } catch (e) { noteSyncIssue(i.phase, { linesError: (e as Error).message }); throw e; }
  }
  if (i.recordOps) {
    try { await writeRecordOps(i.phase.tournamentId, i.phase.sport, i.recordOps, phaseId); resolveSyncIssue(phaseId, 'records'); } catch (e) { noteSyncIssue(i.phase, { recordsError: (e as Error).message }); throw e; }
  }
}

/**
 * Re-sync a locked final's stat lines from its saved results (organisers) —
 * after an app restart lost the retry, or to repair profiles. Idempotent:
 * the phase's lines are replaced. Throws if the save fails.
 */
export async function resyncFinalLines(phase: FieldEvent, entries: FieldEntry[], nameOf: (id: string) => string, points?: PointsSettings): Promise<number> {
  const f = phaseOf(phase);
  const def = f && disciplineOf(f.discipline);
  if (!f || !def) throw new Error('Not a results event');
  let lines: StatLine[] | null;
  if (f.combined) {
    const res = entries.map((e) => toResultEntry(e, nameOf));
    const ranked = rankEntries(res, phaseDiscipline(def, f), { handLegal: looseLegal(f) });
    const rows = combinedStandings(await combinedPhases(f, nameOf, { id: phase.id, entries }), { final: true });
    lines = [...combinedEventLines(f, ranked), ...combinedLines(f, rows, combinedAwards(rows, points ?? {}))];
  } else {
    const rows = rankEntries(entries.map((e) => toResultEntry(e, nameOf)), def, { handLegal: looseLegal(f) });
    lines = finalLinesFor(f, def, entries, nameOf, rows, points);
  }
  if (!lines) return 0;
  if (!live()) { await writePhaseLines(phase, f, lines); return lines.length; }
  await putLines(phase, lines);
  resolveSyncIssue(phase.id, 'lines');
  return lines.length;
}

/* -------------------------- SD-130 event officials -------------------------- */

/** Set who runs an event (results entry, closing rounds, locking the final):
 *  `host_ids` (PLAYER ids) on every phase of the event. Organisers only. */
export async function setEventOfficials(eventKey: string, hostIds: string[]): Promise<void> {
  const ids = [...new Set(hostIds.filter(Boolean))];
  const phases = await getResultsPhases({ eventKey });
  if (!phases.length) throw new Error('Event not found');
  if (!live()) { for (const p of phases) { const d = demo.fieldEvents.find((e) => e.id === p.id); if (d) d.hostIds = ids; } return; }
  const { data, error } = await supabase!.from('field_events').update({ host_ids: ids }).in('id', phases.map((p) => p.id)).select('id');
  if (error) throw new Error(/organisers/i.test(error.message) ? 'Only the organisers can change who runs this event.' : error.message);
  if (!data?.length) throw new Error('You can’t change this event.');
}

/* ----------------------------- SD-130 meet ages ----------------------------- */

/** Ages on the meet's cut-off day (organisers; ids → age), from the private
 *  DOB on the server. Empty before the migration (the app falls back to the
 *  age it can see). */
export async function getMeetAges(tournamentId: string, sport: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!live() || !uniq.length) return out;
  const { data, error } = await supabase!.rpc('meet_ages', { p_tid: tournamentId, p_sport: sport, p_ids: uniq.slice(0, 2000) });
  if (error) return out;
  for (const r of (data ?? []) as { id: string; age: number }[]) if (r.age != null) out.set(r.id, Number(r.age));
  return out;
}

/** Finish a final: lock it and write any new meet / school record. Athletics
 *  (SD-90) also writes each athlete's stat line with medals and points. */
export async function completeFinal(phase: FieldEvent, entries: FieldEntry[], nameOf: (id: string) => string, scopes: RecordScope[] = ['MR'], points?: PointsSettings): Promise<RecordMark[]> {
  const f = phaseOf(phase);
  const def = f && disciplineOf(f.discipline);
  if (!f || !def) throw new Error('Not a results event');
  // SD-93: the last event of a combined event — totals, medals, records on the total
  if (f.combined) return completeCombined(phase, f, def, entries, nameOf, scopes, points);
  // A timed final (several heats) ranks across heats — the whole phase at once.
  const rows = rankEntries(entries.map((e) => toResultEntry(e, nameOf)), def, { handLegal: looseLegal(f) });
  // SD-130: the lines are computed apart, so a failed save can be re-synced later
  const lines = finalLinesFor(f, def, entries, nameOf, rows, points);
  if (lines) await writePhaseLines(phase, f, lines);
  const book = await getRecordBook(phase.tournamentId, def.sport);
  const cat = categoryKey(f.category);
  // SD-112: an out-of-range mark nobody confirmed never sets a record.
  // SD-97: a weightlifting session sets snatch, C&J and total records.
  let next = book;
  // SD-92: a road / walk time sets a record only on a certified course (gun time); cross-country never
  for (const d of roadRecordsAllowed(f) ? recordDefsFor(def) : []) {
    // SD-96: a shooting final's rows read as their qualification scores (a final score is no record)
    // SD-95: an archery bracket's rows read as their ranking-round scores (a match is no record)
    // SD-98: a sprint bracket's rows read as their flying 200 m times
    const view = def.sport === 'shooting' ? qualView : def.sport === 'archery' || (def.sport === 'cycling' && rows.some((r) => r.entry.result.mp != null)) ? archQualView : null;
    const dRows = view ? rankEntries(view(entries.map((e) => toResultEntry(e, nameOf))), d) : d === def ? rows : rankEntries(entries.map((e) => toResultEntry(e, nameOf)), d);
    next = updateRecords(rowsForRecords(dRows, d, f.category?.course), d, cat, next, phase.startsAt.slice(0, 10), scopes, f.eventKey);
  }
  // SD-112: keep what the book said before, so "Reopen final" can put it back
  await patchPhaseFormat(phase.id, { recordsBefore: recordDefsFor(def).flatMap((d) => recordsFor(book, d.key, cat)) });
  // SD-130: only the records this final set are sent, merged on the server (no lost writes)
  if (next !== book) next = await commitRecords(phase, def.sport, book, next);
  // SD-131: the podium for the follower push (read by notify-followers once the status flips)
  await saveResultAlert(phase.id, finalAlert(rows, f.eventTitle));
  await setPhaseStatus(phase.id, 'completed');
  return next;
}

type StatLine = { playerId: string; stats: Record<string, number>; won: boolean };

/** SD-130 — the stat lines a locked (non-combined) final writes; null = none
 *  (not an event sport). Shared by completeFinal and the re-sync. */
function finalLinesFor(f: PhaseFormat, def: DisciplineDef, entries: FieldEntry[], nameOf: (id: string) => string, rows: RankedEntry[], points?: PointsSettings): StatLine[] | null {
  if (def.capture === 'lifts') {
    // SD-97: weightlifting lines — best snatch / C&J / total, make rate, medals
    return liftLines(f, entries.map((e) => toResultEntry(e, nameOf)), points ?? {});
  } else if (def.sport === 'archery') {
    // SD-95: match play (places, matches won / lost, set points) or a ranking round that decides the medals
    const bracket = rows.some((r) => r.entry.result.mp != null);
    return archLines(f, rows, bracket ? 'bracket' : 'match', eventAwards(rows, points ?? {}));
  } else if (def.sport === 'shooting') {
    // SD-96: an elimination final (finals reached, place, final score) or a match with no final (the score)
    const fin = rows.some((r) => Array.isArray(r.entry.result.fshots));
    return shootLines(f, rows, fin ? 'final' : 'match', eventAwards(rows, points ?? {}));
  } else if (def.sport === 'cycling') {
    // SD-98: places, medals, points; times under m_cyc_*; points-race points; sprint matches; stages
    return cycLines(f, rows, eventAwards(rows, points ?? {}));
  } else if (def.tie === 'road') {
    // SD-92: road / walk / XC — place, time (PB key, not XC), red cards, medals, points; the team score
    const teams = phaseTeams(f, rows);
    return roadLines(f, rows, eventAwards(rows, points ?? {}), teams, f.road?.team?.points === false ? [] : teamAwards(teams, points ?? {}));
  } else if (isCrewSport(def.sport)) {
    // SD-99 / SD-100: every rower / paddler and the cox gets the crew's line
    let awards = eventAwards(rows, points ?? {});
    if (def.teamSize && points?.relayFactor && points.relayFactor !== 1) awards = awards.map((a) => ({ ...a, points: Math.round(a.points * points.relayFactor! * 100) / 100 }));
    return crewLines(f, rows, awards);
  } else if (isEventSport(def.sport)) {
    let awards = eventAwards(rows, points ?? {});
    if (def.teamSize && points?.relayFactor && points.relayFactor !== 1) awards = awards.map((a) => ({ ...a, points: Math.round(a.points * points.relayFactor! * 100) / 100 }));
    return phaseLines(f, rows, awards);
  }
  return null;
}

/**
 * SD-112 — an organiser reopens a locked phase.
 *  - a round (heats / semis / qualification): only while the next round has no
 *    results; the next round's start list is removed and re-seeded on the next
 *    "Close round".
 *  - the final: back to live; the records it set are rolled back to what stood
 *    before, and its stat lines (medals, points) are removed — the meet table
 *    only counts completed finals, so its points drop out until it is locked again.
 * Returns the removed next-round phase id (a round) or the record book after the rollback (a final).
 */
export async function reopenPhase(stale: FieldEvent): Promise<{ removedPhase?: string; records?: RecordMark[] }> {
  const phase = (await getPhase(stale.id)) ?? stale;
  const f = phaseOf(phase);
  const def = f && disciplineOf(f.discipline);
  if (!f || !def) throw new Error('Not a results event');
  const isFinal = !f.plan?.[f.phaseNo];
  const all = await getResultsPhases({ eventKey: f.eventKey });
  const later = all.filter((p) => p.roundNo > phase.roundNo).sort((a, b) => a.roundNo - b.roundNo);
  const nextPhase = later[0] ?? null;
  const nextEntries = nextPhase ? await getFieldEntries([nextPhase.id]) : [];
  const v = reopenVerdict(phase, nextPhase ? { status: nextPhase.status, results: nextEntries.map((e) => e.result as EntryResult) } : null, isFinal);
  if (!v.ok) throw new Error(v.reason);
  const out: { removedPhase?: string; records?: RecordMark[] } = {};
  if (v.kind === 'round' && nextPhase) {
    if (later.length > 1) throw new Error('Later rounds already exist — reopen the latest round first.');
    for (const e of nextEntries) await removeFieldEntry(e.id);
    await deletePhase(nextPhase.id);
    out.removedPhase = nextPhase.id;
  }
  if (v.kind === 'final') {
    const cat = categoryKey(f.category);
    const book = await getRecordBook(phase.tournamentId, def.sport);
    let next = book;
    // SD-93: a combined event's record is its total
    const defs = f.combined ? [disciplineOf(f.combined.key)!] : recordDefsFor(def);
    for (const d of defs) next = rollbackRecords(next, d.key, cat, f.eventKey, f.recordsBefore);
    // SD-130: sent as "restore" operations — a record another final set meanwhile is kept
    if (next.length !== book.length || next.some((r, i) => r !== book[i])) {
      next = await writeRecordOps(phase.tournamentId, def.sport, defs.map((d) => ({ op: 'restore' as const, discipline: d.key, category: cat, eventKey: f.eventKey, before: f.recordsBefore ?? [] })), phase.id);
    }
    clearSyncIssue(phase.id);
    out.records = next;
  }
  // the phase's stat lines are rewritten when it is closed / locked again
  if (isEventSport(def.sport)) await writePhaseLines(phase, f, []);
  await setPhaseStatus(phase.id, 'live');
  return out;
}

/** SD-128: exported for "Delete event" (meetEntriesStore). */
export async function deletePhase(id: string): Promise<void> {
  if (!live()) { demo.fieldEvents = demo.fieldEvents.filter((e) => e.id !== id); return; }
  const { error } = await supabase!.from('field_events').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* -------------------------------- history -------------------------------- */

/**
 * Earlier legal marks of these athletes in this discipline, from completed
 * phases (any meet), excluding `exceptPhaseId` — the PB / SB input.
 */
export async function getMarkHistory(def: DisciplineDef, athleteIds: string[], exceptPhaseId: string, course?: Category['course'], shots?: number): Promise<MarkHistory[]> {
  const ids = athleteIds.filter(Boolean);
  if (!ids.length) return [];
  // SD-94: swimming PBs are per pool length (an unset course reads as long course)
  // SD-96: shooting PBs per match length (a 40-shot and a 60-shot match are different)
  const sameCourse = (e: FieldEvent) => (def.sport !== 'swimming' || (phaseOf(e)?.category?.course ?? 'LCM') === (course ?? 'LCM'))
    && (def.sport !== 'shooting' || phaseOf(e)?.category?.shots === shots);
  // SD-97: a lift (wl.snatch / wl.cj) comes from the weightlifting sessions ('wl.total')
  const phaseKey = def.capture === 'lifts' ? 'wl.total' : def.key;
  let phases: FieldEvent[];
  let entries: FieldEntry[];
  if (!live()) {
    phases = demo.fieldEvents.filter((e) => e.status === 'completed' && e.id !== exceptPhaseId && phaseOf(e)?.discipline === phaseKey && sameCourse(e));
    const pids = new Set(phases.map((p) => p.id));
    entries = demo.fieldEntries.filter((e) => pids.has(e.eventId) && ids.includes(e.playerId));
  } else {
    const { data } = await supabase!.from('field_events').select('*').eq('status', 'completed').eq('format->results->>discipline', phaseKey);
    phases = ((data ?? []) as any[]).map(toEvent).filter((e) => e.id !== exceptPhaseId && sameCourse(e));
    if (!phases.length) return [];
    const { data: rows } = await supabase!.from('field_entries').select('*').in('event_id', phases.map((p) => p.id)).in('player_id', ids);
    entries = ((rows ?? []) as any[]).map(toEntry);
  }
  const dateOf = new Map(phases.map((p) => [p.id, p.startsAt.slice(0, 10)]));
  const out: MarkHistory[] = [];
  for (const e of entries) {
    const p = performanceOf(toResultEntry(e, () => ''), def, undefined, looseLegal(phaseOf(phases.find((x) => x.id === e.eventId)!)));
    if (p.status === 'ok' && p.bestLegal != null) out.push({ athleteId: e.playerId, discipline: def.key, value: p.bestLegal, date: dateOf.get(e.eventId) ?? '' });
  }
  return out;
}

/** For tests / sheets: the engine's entries for a phase. */
export const resultEntries = (entries: FieldEntry[], nameOf: (id: string) => string): ResultEntry[] => entries.map((e) => toResultEntry(e, nameOf));

/* ------------------------------ SD-90 athletics ------------------------------ */

/** Write a closed round's stat lines (one per athlete / relay member, event_id =
 *  the phase). Idempotent: re-closing rewrites them. Not fatal — results stay
 *  saved if a line can't be written (the profile is a view of them). */
async function writePhaseLines(phase: FieldEvent, f: PhaseFormat, lines: { playerId: string; stats: Record<string, number>; won: boolean }[]): Promise<void> {
  const label = phase.title;
  if (!live()) {
    demo.statLines = demo.statLines.filter((l) => l.eventId !== phase.id);
    for (const l of lines) demo.statLines.push({ id: genId('sl'), matchId: '', eventId: phase.id, playerId: l.playerId, sport: phase.sport, stats: l.stats, won: l.won, opponent: label, date: phase.startsAt });
    return;
  }
  // SD-130: a failed save no longer vanishes — the results stay saved and locked,
  // the lines wait in the sync list (banner + "Retry saving results to profiles").
  try {
    await putLines(phase, lines);
    resolveSyncIssue(phase.id, 'lines');
  } catch (e) {
    noteSyncIssue(phase, { lines, linesError: (e as Error).message || 'Network error' });
  }
  void f;
}

/** Replace a phase's stat lines (idempotent: delete, then insert). Throws on failure. */
async function putLines(phase: FieldEvent, lines: StatLine[]): Promise<void> {
  const del = await supabase!.from('stat_lines').delete().eq('event_id', phase.id);
  if (del.error) throw new Error(del.error.message);
  if (!lines.length) return;
  const ins = await supabase!.from('stat_lines').insert(lines.map((l) => ({
    event_id: phase.id, match_id: null, player_id: l.playerId, sport: phase.sport, stats: l.stats, won: l.won, opponent: phase.title, recorded_at: phase.startsAt,
  })));
  if (ins.error) throw new Error(ins.error.message);
}

/** Manual lane / heat override on a start list (managers only). */
export async function moveEntry(entryId: string, heat: number, result: EntryResult): Promise<void> {
  if (!live()) {
    const d = demo.fieldEntries.find((e) => e.id === entryId);
    if (d) { d.groupNo = heat; d.result = result; }
    return;
  }
  const { error } = await supabase!.from('field_entries').update({ group_no: heat, result }).eq('id', entryId);
  if (error) throw new Error(error.message);
}

/** Every phase of a tournament's event sport (athletics by default; SD-94
 *  swimming; `'all'` = every event sport) with its entries, as the meet model. */
export async function getMeet(tournamentId: string, nameOf: (id: string) => string, sport: string = 'athletics'): Promise<MeetEvent[]> {
  const phases = (await getResultsPhases({ tournamentId })).filter((p) => (sport === 'all' ? isEventSport(p.sport) : p.sport === sport));
  const entries = await getFieldEntries(phases.map((p) => p.id));
  return groupMeet(meetPhases(phases, entries, nameOf));
}

function meetPhases(phases: FieldEvent[], entries: FieldEntry[], nameOf: (id: string) => string): MeetPhase[] {
  return phases.flatMap((p) => {
    const f = phaseOf(p);
    if (!f) return [];
    return [{ id: p.id, format: f, status: p.status as MeetPhase['status'], date: p.startsAt, entries: entries.filter((e) => e.eventId === p.id).map((e) => toResultEntry(e, nameOf)) }];
  });
}

/** The tournament's finished athletics finals → the medal / house table. */
export function meetResultsFor(events: MeetEvent[], points: PointsSettings): FieldResultInput[] {
  return meetFieldResults(events, points);
}

/**
 * The school record book (SR) for an organisation: the best legal mark per
 * event + category at its OTHER meets (tournaments it hosts), derived from
 * their completed results, and (SD-130) the historic school records entered
 * from its record board on any of its meets.
 */
export async function getOrgRecordBook(orgId: string, exceptTournamentId: string | undefined, nameOf: (id: string) => string, sport: string = 'athletics'): Promise<RecordMark[]> {
  // SD-130: + the historic school records (SR) organisers entered on any of its meets' boards
  let all: { id: string; records: RecordMark[] }[];
  if (!live()) all = demo.tournaments.filter((t) => t.hostOrgId === orgId).map((t) => ({ id: t.id, records: demo.resultRecords[t.id] ?? [] }));
  else {
    const { data } = await supabase!.from('tournaments').select('id, formats').eq('host_org_id', orgId);
    all = ((data ?? []) as { id: string; formats?: Record<string, Record<string, unknown>> }[]).map((r) => {
      const raw = r.formats?.[sport]?.records;
      let records: RecordMark[] = [];
      try { records = typeof raw === 'string' ? (JSON.parse(raw) as RecordMark[]) : []; } catch { records = []; }
      return { id: r.id, records };
    });
  }
  const historic = all.flatMap((t) => t.records.filter((r) => r.scope === 'SR' && r.historic));
  const tids = all.map((t) => t.id).filter((id) => id !== exceptTournamentId);
  if (!tids.length) return bestRecords(historic);
  let phases: FieldEvent[];
  if (!live()) phases = demo.fieldEvents.filter((e) => e.sport === sport && e.status === 'completed' && !!e.tournamentId && tids.includes(e.tournamentId));
  else {
    const { data } = await supabase!.from('field_events').select('*').eq('sport', sport).eq('status', 'completed').in('tournament_id', tids);
    phases = ((data ?? []) as any[]).map(toEvent);
  }
  if (!phases.length) return bestRecords(historic);
  const entries = await getFieldEntries(phases.map((p) => p.id));
  return bestRecords(deriveRecordBook(groupMeet(meetPhases(phases, entries, nameOf)), 'SR'), historic);
}

/** What the athletics career needs about the phases an athlete's lines came from. */
export async function getPhaseInfos(ids: string[]): Promise<Map<string, PhaseInfo>> {
  const out = new Map<string, PhaseInfo>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  let evs: FieldEvent[];
  if (!live()) evs = demo.fieldEvents.filter((e) => uniq.includes(e.id));
  else {
    const { data } = await supabase!.from('field_events').select('*').in('id', uniq);
    evs = ((data ?? []) as any[]).map(toEvent);
  }
  for (const e of evs) {
    const f = phaseOf(e);
    if (f) out.set(e.id, { discipline: f.discipline, category: f.category, phase: f.phase, title: e.title, date: e.startsAt, eventTitle: f.eventTitle, implement: f.implement, ...(f.combined ? { combinedKey: f.combined.key } : {}) });
  }
  return out;
}

/**
 * SD-94 — the next swimming round: everyone through is q on time (ties at the
 * line settled by a swim-off, SW 3.2.3), ranked on time across the heats and
 * seeded into the semi-finals (SW 3.2.1) or the final's lanes (SW 3.2.2).
 */
function swimNextRound(byHeat: Map<number, RankedEntry[]>, def: DisciplineDef, q: ReturnType<typeof qualify>, phase: PhaseKind, heats: number): Seeded[] {
  const through = [...byHeat.values()].flat().filter((r) => q.marks.has(r.id));
  const keyOf = (r: RankedEntry) => [...performanceOf(r.entry, def).keys, r.entry.result.decider != null ? -r.entry.result.decider : undefined];
  through.sort((a, b) => compareKeys(keyOf(a), keyOf(b)) || a.entry.name.localeCompare(b.entry.name));
  return swimSeed(through.map((r) => r.id), phase, heats, def.lanes ?? 8, def.key, zeroLanes(def.lanes ?? 8, def.rules));
}

/* ------------------------------ SD-93 combined events ------------------------------ */

export interface NewCombinedEvent {
  kind: CombinedKind | 'x';
  table: CombinedTable;
  /** the events in order */
  events: string[];
  /** the first event of day 2 (index) — absent = one day */
  day2?: number;
  category: Category;
  title?: string;
  tournamentId?: string;
  startsAt?: string;
  hostIds?: string[];
  /** individual athletes only (a combined event has no relays) */
  entrants: NewEntrant[];
  /** the throws' implements ("ath.sp" → "4 kg") */
  implements?: Record<string, string>;
  handTimed?: boolean;
  noWindGauge?: boolean;
  /** SD-129: the timetable slots for its events (event 1 = this phase) */
  sched?: PhaseSched;
}

/** Create a combined event: its first event's phase with the start list.
 *  Each later event is created when the one before is closed. */
export async function createCombinedEvent(input: NewCombinedEvent): Promise<FieldEvent> {
  if (input.events.length < 2) throw new Error('Pick at least two events.');
  if (!input.entrants.length) throw new Error('Add at least one athlete.');
  if (input.entrants.some((e) => !e.playerId)) throw new Error('Combined events are for individual athletes.');
  const key = combinedKey(input.kind, input.table, input.events);
  const cdef = disciplineOf(key);
  const first = disciplineOf(input.events[0]);
  if (!cdef || !first) throw new Error('Unknown event');
  const eventTitle = input.title ?? `${cdef.label} ${categoryLabel(input.category)}`;
  const n = input.events.length;
  const seeded = combinedSeed(input.entrants.map((_, i) => ({ id: String(i), total: 0 })), first);
  const heats = Math.max(1, ...seeded.map((x) => x.heat));
  const fmt: PhaseFormat = {
    discipline: first.key, category: input.category, phase: 'final', phaseNo: 1, heats, eventKey: genId('rev'), eventTitle,
    plan: input.events.map(() => ({ phase: 'final' as const, heats: 1 })),
    ...(input.handTimed ? { handTimed: true } : {}), ...(input.noWindGauge ? { noWindGauge: true } : {}),
    ...(combinedBar(first.key, input.category) ? { bar: combinedBar(first.key, input.category) } : {}),
    ...(input.implements?.[first.key] ? { implement: input.implements[first.key] } : {}),
    combined: { key, table: input.table, events: input.events, index: 0, ...(input.day2 != null && input.day2 > 0 && input.day2 < n ? { day2: input.day2 } : {}), ...(input.implements ? { implements: input.implements } : {}) },
    ...(input.sched?.rounds.length ? { sched: input.sched } : {}),
  };
  const ev = await insertPhase({
    tournamentId: input.tournamentId, sport: 'athletics', title: phaseTitle(eventTitle, fmt), roundNo: 1,
    startsAt: input.startsAt ?? new Date().toISOString(), format: { results: fmt }, hostIds: input.hostIds ?? [],
  });
  await insertEntries(ev.id, seeded.map((x) => {
    const e = input.entrants[Number(x.id)];
    return { playerId: e.playerId, teamId: e.team?.id, heat: x.heat, result: { lane: x.lane, order: x.order, bib: e.bib, team: e.team } };
  }));
  return ev;
}

/** Every phase of a combined event with its entries (the current phase's from `current` when given). */
async function combinedPhases(f: PhaseFormat, nameOf: (id: string) => string, current?: { id: string; entries: FieldEntry[] }): Promise<CombinedPhaseInput[]> {
  const all = await getResultsPhases({ eventKey: f.eventKey });
  const others = all.filter((p) => p.id !== current?.id);
  const ens = await getFieldEntries(others.map((p) => p.id));
  const out: CombinedPhaseInput[] = others.flatMap((p) => { const pf = phaseOf(p); return pf ? [{ id: p.id, format: pf, status: p.status, date: p.startsAt, entries: ens.filter((e) => e.eventId === p.id).map((e) => toResultEntry(e, nameOf)) }] : []; });
  if (current) {
    const p = all.find((x) => x.id === current.id);
    if (p) out.push({ id: p.id, format: phaseOf(p)!, status: p.status, date: p.startsAt, entries: current.entries.map((e) => toResultEntry(e, nameOf)) });
  }
  return out;
}

/** SD-93 — close one event of a combined event: its stat lines (marks, points),
 *  then the next event's start list for everyone still in (TR 39.10: a DNS / WD
 *  is out), seeded by the running total (leaders in the last heat). */
async function advanceCombined(phase: FieldEvent, f: PhaseFormat, def: DisciplineDef, entries: FieldEntry[], nameOf: (id: string) => string): Promise<FieldEvent> {
  const res = entries.map((e) => toResultEntry(e, nameOf));
  const ranked = rankEntries(res, phaseDiscipline(def, f), { handLegal: looseLegal(f) });
  await writePhaseLines(phase, f, combinedEventLines(f, ranked));
  const on = continuing(res, f);
  if (!on.length) throw new Error('Nobody is left in the competition — check the DNS / withdrawn marks.');
  const standings = combinedStandings(await combinedPhases(f, nameOf, { id: phase.id, entries }));
  const totalOf = new Map(standings.map((r) => [r.athleteId, r.total]));
  const nextDef = disciplineOf(f.combined!.events[f.combined!.index + 1]);
  if (!nextDef) throw new Error('This is the last event.');
  const seeded = combinedSeed(on.map((e) => ({ id: e.id, total: totalOf.get(e.athleteId ?? '') ?? 0 })), nextDef);
  const fmt = nextCombinedFormat(f, Math.max(1, ...seeded.map((x) => x.heat)));
  if (!fmt) throw new Error('This is the last event.');
  const ev = await insertPhase({
    tournamentId: phase.tournamentId, sport: phase.sport, title: phaseTitle(f.eventTitle ?? def.label, fmt), roundNo: fmt.phaseNo,
    startsAt: new Date().toISOString(), format: { results: fmt }, hostIds: phase.hostIds ?? [],
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  await insertEntries(ev.id, seeded.map((x) => {
    const old = byId.get(x.id)!;
    const r = (old.result ?? {}) as EntryResult;
    return { playerId: old.playerId || undefined, teamId: old.teamId, heat: x.heat, result: { lane: x.lane, order: x.order, bib: r.bib, team: r.team } };
  }));
  await setPhaseStatus(phase.id, 'completed');
  return ev;
}

/** SD-93 — lock the last event: its lines + the totals (places, medals, points,
 *  the legal total as a PB key), and a meet record on the total. */
async function completeCombined(phase: FieldEvent, f: PhaseFormat, def: DisciplineDef, entries: FieldEntry[], nameOf: (id: string) => string, scopes: RecordScope[], points?: PointsSettings): Promise<RecordMark[]> {
  const res = entries.map((e) => toResultEntry(e, nameOf));
  const ranked = rankEntries(res, phaseDiscipline(def, f), { handLegal: looseLegal(f) });
  const rows = combinedStandings(await combinedPhases(f, nameOf, { id: phase.id, entries }), { final: true });
  const awards = combinedAwards(rows, points ?? {});
  await writePhaseLines(phase, f, [...combinedEventLines(f, ranked), ...combinedLines(f, rows, awards)]);
  const cdef = disciplineOf(f.combined!.key)!;
  const cat = categoryKey(f.category);
  const book = await getRecordBook(phase.tournamentId, 'athletics');
  let next = updateRecords(combinedRanked(rows, cdef.key), cdef, cat, book, phase.startsAt.slice(0, 10), scopes, f.eventKey);
  await patchPhaseFormat(phase.id, { recordsBefore: recordsFor(book, cdef.key, cat) });
  if (next !== book) next = await commitRecords(phase, 'athletics', book, next); // SD-130
  await saveResultAlert(phase.id, combinedAlert(rows, f.eventTitle)); // SD-131
  await setPhaseStatus(phase.id, 'completed');
  return next;
}

/** The standings of a combined event (every event so far) — for screens. */
export async function getCombinedPhases(f: PhaseFormat, nameOf: (id: string) => string): Promise<CombinedPhaseInput[]> {
  return combinedPhases(f, nameOf);
}

/**
 * SD-93 — earlier legal totals of these athletes in this combined event and
 * age group (from their stat lines), excluding this event's own phases — the
 * PB / SB input for the standings.
 */
export async function getCombinedHistory(key: string, athleteIds: string[], exceptPhaseIds: string[], age?: string): Promise<MarkHistory[]> {
  const ids = athleteIds.filter(Boolean);
  if (!ids.length) return [];
  const mk = markKey(key);
  let rows: { playerId: string; eventId?: string; value: number; date: string }[];
  if (!live()) {
    rows = demo.statLines.filter((l) => ids.includes(l.playerId) && l.stats?.[mk] != null && !exceptPhaseIds.includes(l.eventId ?? ''))
      .map((l) => ({ playerId: l.playerId, eventId: l.eventId, value: l.stats[mk], date: (l.date ?? '').slice(0, 10) }));
  } else {
    const { data } = await supabase!.from('stat_lines').select('player_id, event_id, stats, recorded_at').eq('sport', 'athletics').in('player_id', ids).not(`stats->>${mk}`, 'is', null);
    rows = ((data ?? []) as { player_id: string; event_id?: string; stats: Record<string, number>; recorded_at?: string }[])
      .filter((l) => !exceptPhaseIds.includes(l.event_id ?? ''))
      .map((l) => ({ playerId: l.player_id, eventId: l.event_id, value: Number(l.stats?.[mk]), date: (l.recorded_at ?? '').slice(0, 10) }));
  }
  if (age) {
    const infos = await getPhaseInfos(rows.map((r) => r.eventId ?? ''));
    rows = rows.filter((r) => (infos.get(r.eventId ?? '')?.category?.age ?? age) === age);
  }
  return rows.filter((r) => Number.isFinite(r.value)).map((r) => ({ athleteId: r.playerId, discipline: key, value: r.value, date: r.date }));
}
