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
  phaseNameOf, archLines, archQualView, bracketEntrant, bracketSeeds, hasMatchData,
} from './results';
import { removeFieldEntry } from './golf';
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
}

// SD-95: archery phases read "Ranking round" / "Match play"
const phaseTitle = (eventTitle: string, f: Pick<PhaseFormat, 'phase' | 'discipline' | 'plan'>) => `${eventTitle} — ${phaseNameOf(f)}`;

async function insertPhase(base: Omit<FieldEvent, 'id' | 'status'>): Promise<FieldEvent> {
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

type Row = { playerId?: string; teamId?: string; heat: number; result: EntryResult };

async function insertEntries(eventId: string, rows: Row[]): Promise<FieldEntry[]> {
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
  const def = phaseDiscipline(base, { lanes: venueLanes });
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
  let seeded = def.sport === 'swimming' ? swimSeed(ids, first.phase, first.heats, def.lanes ?? 8, def.key)
    : first.phase === 'final' && first.heats > 1 && def.lanes && def.capture === 'single' ? timedFinalSeed(ids, def.lanes, def.key, draw ? rng : undefined)
      : seedHeats(ids, first.heats, def, draw ? rng : undefined, { drawAll: draw });
  // SD-91 field events: seeds are spread over the qualification groups; the
  // order inside a group is drawn (TR 25.5), or — not drawn — the best seed goes last.
  if (def.capture !== 'single') seeded = fieldOrder(seeded, draw ? rng : undefined);
  await insertEntries(ev.id, seeded.map((s) => {
    const e = ordered[Number(s.id)];
    return {
      playerId: e.playerId, teamId: e.team?.id, heat: s.heat,
      result: { ...(e.start ?? {}), lane: s.lane, order: s.order, bib: e.bib, team: e.team, ...(e.playerId ? {} : { name: e.name, members: e.members ?? [] }) },
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
  const hasMark = result.mark != null || !!result.attempts?.some((a) => a.mark != null) || !!result.heights?.some((h) => h.tries.includes('O')) || !!result.lifts?.snatch?.some((l) => l.good) || !!result.lifts?.cj?.some((l) => l.good) || !!result.fshots?.length || !!result.ends?.length || hasMatchData(result);
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
  const next = f.plan?.[f.phaseNo];
  if (!next || !f.progression) throw new Error('This is the last round.');
  const res = entries.map((e) => toResultEntry(e, nameOf));
  const byHeat = rankByHeat(res, def, { handLegal: looseLegal(f) });
  // SD-95: archery — the ranking round seeds a match-play bracket
  if (def.sport === 'archery' && next.phase === 'final') return advanceToBracket(phase, f, def, entries, [...byHeat.values()].flat(), next);
  const q = qualify(byHeat, def, f.progression);
  if (!q.marks.size) throw new Error('Nobody has qualified yet — enter the results first.');
  if (isEventSport(def.sport)) {
    const ranked = [...byHeat.values()].flatMap((rows) => withQualification(rows, q));
    // SD-96: a shooting qualification writes the match score, points / shots, inner tens, "made the final"
    await writePhaseLines(phase, f, def.sport === 'shooting' ? shootLines(f, ranked, 'qual') : phaseLines(f, ranked));
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
  if (ids.length < 2) throw new Error('Match play needs at least two archers with a score — enter the ranking round first.');
  if (tieAtCut.length) {
    const names = ranked.filter((r) => tieAtCut.includes(r.id)).map((r) => r.entry.name).join(', ');
    throw new Error(`${names} are level for the last match-play place — a shoot-off decides it (WA). Enter each archer's shoot-off place, then close the ranking round.`);
  }
  const seeded = new Set(ids);
  await writePhaseLines(phase, f, archLines(f, ranked.map((r) => (seeded.has(r.id) ? { ...r, flags: ['q' as const, ...r.flags] } : r)), 'qual', [], seeded));
  const fmt: PhaseFormat = { ...f, phase: next.phase, phaseNo: f.phaseNo + 1, heats: 1, progression: undefined };
  const ev = await insertPhase({
    tournamentId: phase.tournamentId, sport: phase.sport, title: phaseTitle(f.eventTitle ?? def.label, fmt), roundNo: fmt.phaseNo,
    startsAt: new Date().toISOString(), format: { results: fmt }, hostIds: phase.hostIds ?? [],
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  await insertEntries(ev.id, ids.map((id, i) => {
    const old = byId.get(id)!;
    const r = (old.result ?? {}) as EntryResult;
    return { playerId: old.playerId || undefined, teamId: old.teamId, heat: 1, result: { bib: r.bib, team: r.team, name: r.name, members: r.members, ...bracketEntrant(r, i + 1) } };
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

async function saveRecordBook(tournamentId: string | undefined, sport: string, list: RecordMark[]): Promise<void> {
  if (!live() || !tournamentId) { demo.resultRecords[tournamentId ?? ''] = list; return; }
  await patchTournamentFormat(tournamentId, sport, { records: JSON.stringify(list) });
}

/** Finish a final: lock it and write any new meet / school record. Athletics
 *  (SD-90) also writes each athlete's stat line with medals and points. */
export async function completeFinal(phase: FieldEvent, entries: FieldEntry[], nameOf: (id: string) => string, scopes: RecordScope[] = ['MR'], points?: PointsSettings): Promise<RecordMark[]> {
  const f = phaseOf(phase);
  const def = f && disciplineOf(f.discipline);
  if (!f || !def) throw new Error('Not a results event');
  // A timed final (several heats) ranks across heats — the whole phase at once.
  const rows = rankEntries(entries.map((e) => toResultEntry(e, nameOf)), def, { handLegal: looseLegal(f) });
  if (def.capture === 'lifts') {
    // SD-97: weightlifting lines — best snatch / C&J / total, make rate, medals
    await writePhaseLines(phase, f, liftLines(f, entries.map((e) => toResultEntry(e, nameOf)), points ?? {}));
  } else if (def.sport === 'archery') {
    // SD-95: match play (places, matches won / lost, set points) or a ranking round that decides the medals
    const bracket = rows.some((r) => r.entry.result.mp != null);
    await writePhaseLines(phase, f, archLines(f, rows, bracket ? 'bracket' : 'match', eventAwards(rows, points ?? {})));
  } else if (def.sport === 'shooting') {
    // SD-96: an elimination final (finals reached, place, final score) or a match with no final (the score)
    const fin = rows.some((r) => Array.isArray(r.entry.result.fshots));
    await writePhaseLines(phase, f, shootLines(f, rows, fin ? 'final' : 'match', eventAwards(rows, points ?? {})));
  } else if (isEventSport(def.sport)) {
    let awards = eventAwards(rows, points ?? {});
    if (def.teamSize && points?.relayFactor && points.relayFactor !== 1) awards = awards.map((a) => ({ ...a, points: Math.round(a.points * points.relayFactor! * 100) / 100 }));
    await writePhaseLines(phase, f, phaseLines(f, rows, awards));
  }
  const book = await getRecordBook(phase.tournamentId, def.sport);
  const cat = categoryKey(f.category);
  // SD-112: an out-of-range mark nobody confirmed never sets a record.
  // SD-97: a weightlifting session sets snatch, C&J and total records.
  let next = book;
  for (const d of recordDefsFor(def)) {
    // SD-96: a shooting final's rows read as their qualification scores (a final score is no record)
    // SD-95: an archery bracket's rows read as their ranking-round scores (a match is no record)
    const view = def.sport === 'shooting' ? qualView : def.sport === 'archery' ? archQualView : null;
    const dRows = view ? rankEntries(view(entries.map((e) => toResultEntry(e, nameOf))), d) : d === def ? rows : rankEntries(entries.map((e) => toResultEntry(e, nameOf)), d);
    next = updateRecords(rowsForRecords(dRows, d, f.category?.course), d, cat, next, phase.startsAt.slice(0, 10), scopes, f.eventKey);
  }
  // SD-112: keep what the book said before, so "Reopen final" can put it back
  await patchPhaseFormat(phase.id, { recordsBefore: recordDefsFor(def).flatMap((d) => recordsFor(book, d.key, cat)) });
  if (next !== book) await saveRecordBook(phase.tournamentId, def.sport, next);
  await setPhaseStatus(phase.id, 'completed');
  return next;
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
    for (const d of recordDefsFor(def)) next = rollbackRecords(next, d.key, cat, f.eventKey, f.recordsBefore);
    if (next.length !== book.length || next.some((r, i) => r !== book[i])) await saveRecordBook(phase.tournamentId, def.sport, next);
    out.records = next;
  }
  // the phase's stat lines are rewritten when it is closed / locked again
  if (isEventSport(def.sport)) await writePhaseLines(phase, f, []);
  await setPhaseStatus(phase.id, 'live');
  return out;
}

async function deletePhase(id: string): Promise<void> {
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
  try {
    await supabase!.from('stat_lines').delete().eq('event_id', phase.id);
    if (lines.length) {
      await supabase!.from('stat_lines').insert(lines.map((l) => ({
        event_id: phase.id, match_id: null, player_id: l.playerId, sport: phase.sport, stats: l.stats, won: l.won, opponent: label, recorded_at: phase.startsAt,
      })));
    }
  } catch { /* lines are a profile view; the results themselves are saved */ }
  void f;
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
 * their completed results — no separate storage. Historic records set before
 * the app are not included.
 */
export async function getOrgRecordBook(orgId: string, exceptTournamentId: string | undefined, nameOf: (id: string) => string, sport: string = 'athletics'): Promise<RecordMark[]> {
  let tids: string[];
  if (!live()) tids = demo.tournaments.filter((t) => t.hostOrgId === orgId && t.id !== exceptTournamentId).map((t) => t.id);
  else {
    const { data } = await supabase!.from('tournaments').select('id').eq('host_org_id', orgId);
    tids = ((data ?? []) as { id: string }[]).map((r) => r.id).filter((id) => id !== exceptTournamentId);
  }
  if (!tids.length) return [];
  let phases: FieldEvent[];
  if (!live()) phases = demo.fieldEvents.filter((e) => e.sport === sport && e.status === 'completed' && !!e.tournamentId && tids.includes(e.tournamentId));
  else {
    const { data } = await supabase!.from('field_events').select('*').eq('sport', sport).eq('status', 'completed').in('tournament_id', tids);
    phases = ((data ?? []) as any[]).map(toEvent);
  }
  if (!phases.length) return [];
  const entries = await getFieldEntries(phases.map((p) => p.id));
  return deriveRecordBook(groupMeet(meetPhases(phases, entries, nameOf)), 'SR');
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
    if (f) out.set(e.id, { discipline: f.discipline, category: f.category, phase: f.phase, title: e.title, date: e.startsAt, eventTitle: f.eventTitle, implement: f.implement });
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
  return swimSeed(through.map((r) => r.id), phase, heats, def.lanes ?? 8, def.key);
}
