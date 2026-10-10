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
  qualify, nextRound, updateRecords, categoryKey, categoryLabel, phaseLabel,
  type Category, type DisciplineDef, type EntryResult, type MarkHistory, type PhaseFormat, type PlannedPhase,
  type RecordMark, type RecordScope, type ResultEntry,
} from './results';

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
}

const phaseTitle = (eventTitle: string, f: Pick<PhaseFormat, 'phase'>) => `${eventTitle} — ${phaseLabel(f.phase)}`;

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
  const def = disciplineOf(input.discipline);
  if (!def) throw new Error('Unknown discipline');
  if (!input.entrants.length) throw new Error('Add at least one entry.');
  if (def.teamSize && input.entrants.some((e) => e.playerId)) throw new Error(`${def.label} entries are teams, not athletes.`);
  const plan = input.plan ?? planRounds(def, input.entrants.length);
  const eventTitle = input.title ?? `${def.label} ${categoryLabel(input.category)}`;
  const first = plan[0];
  const fmt: PhaseFormat = {
    discipline: def.key, category: input.category, phase: first.phase, phaseNo: 1, heats: first.heats,
    progression: first.progression, eventKey: genId('rev'), plan, eventTitle,
  };
  const ev = await insertPhase({
    tournamentId: input.tournamentId, sport: def.sport as SportId, title: phaseTitle(eventTitle, fmt), roundNo: 1,
    startsAt: input.startsAt ?? new Date().toISOString(), format: { results: fmt }, hostIds: input.hostIds ?? [],
  });
  const ordered = bySeed(input.entrants, def);
  const seeded = seedHeats(ordered.map((_, i) => String(i)), first.heats, def);
  await insertEntries(ev.id, seeded.map((s) => {
    const e = ordered[Number(s.id)];
    return {
      playerId: e.playerId, teamId: e.team?.id, heat: s.heat,
      result: { lane: s.lane, order: s.order, bib: e.bib, team: e.team, ...(e.playerId ? {} : { name: e.name, members: e.members ?? [] }) },
    };
  }));
  return ev;
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
  const hasMark = result.mark != null || !!result.attempts?.some((a) => a.mark != null) || !!result.heights?.some((h) => h.tries.includes('O')) || !!result.lifts?.snatch?.some((l) => l.good);
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
  const def = f && disciplineOf(f.discipline);
  if (!f || !def) throw new Error('Not a results event');
  const next = f.plan?.[f.phaseNo];
  if (!next || !f.progression) throw new Error('This is the last round.');
  const res = entries.map((e) => toResultEntry(e, nameOf));
  const byHeat = rankByHeat(res, def);
  const q = qualify(byHeat, def, f.progression);
  if (!q.marks.size) throw new Error('Nobody has qualified yet — enter the results first.');
  const seeded = nextRound(byHeat, def, q, next.heats);
  const fmt: PhaseFormat = { ...f, phase: next.phase, phaseNo: f.phaseNo + 1, heats: next.heats, progression: next.progression, bar: undefined };
  const ev = await insertPhase({
    tournamentId: phase.tournamentId, sport: phase.sport, title: phaseTitle(f.eventTitle ?? def.label, fmt), roundNo: fmt.phaseNo,
    startsAt: new Date().toISOString(), format: { results: fmt }, hostIds: phase.hostIds ?? [],
  });
  const byId = new Map(entries.map((e) => [e.id, e]));
  await insertEntries(ev.id, seeded.map((s) => {
    const old = byId.get(s.id)!;
    const r = (old.result ?? {}) as EntryResult;
    return { playerId: old.playerId || undefined, teamId: old.teamId, heat: s.heat, result: { lane: s.lane, order: s.order, bib: r.bib, team: r.team, name: r.name, members: r.members } };
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

/** Finish a final: lock it and write any new meet / school record. */
export async function completeFinal(phase: FieldEvent, entries: FieldEntry[], nameOf: (id: string) => string, scopes: RecordScope[] = ['MR']): Promise<RecordMark[]> {
  const f = phaseOf(phase);
  const def = f && disciplineOf(f.discipline);
  if (!f || !def) throw new Error('Not a results event');
  const rows = rankEntries(entries.map((e) => toResultEntry(e, nameOf)), def);
  const book = await getRecordBook(phase.tournamentId, def.sport);
  const next = updateRecords(rows, def, categoryKey(f.category), book, phase.startsAt.slice(0, 10), scopes, f.eventKey);
  if (next !== book) await saveRecordBook(phase.tournamentId, def.sport, next);
  await setPhaseStatus(phase.id, 'completed');
  return next;
}

/* -------------------------------- history -------------------------------- */

/**
 * Earlier legal marks of these athletes in this discipline, from completed
 * phases (any meet), excluding `exceptPhaseId` — the PB / SB input.
 */
export async function getMarkHistory(def: DisciplineDef, athleteIds: string[], exceptPhaseId: string): Promise<MarkHistory[]> {
  const ids = athleteIds.filter(Boolean);
  if (!ids.length) return [];
  let phases: FieldEvent[];
  let entries: FieldEntry[];
  if (!live()) {
    phases = demo.fieldEvents.filter((e) => e.status === 'completed' && e.id !== exceptPhaseId && phaseOf(e)?.discipline === def.key);
    const pids = new Set(phases.map((p) => p.id));
    entries = demo.fieldEntries.filter((e) => pids.has(e.eventId) && ids.includes(e.playerId));
  } else {
    const { data } = await supabase!.from('field_events').select('*').eq('status', 'completed').eq('format->results->>discipline', def.key);
    phases = ((data ?? []) as any[]).map(toEvent).filter((e) => e.id !== exceptPhaseId);
    if (!phases.length) return [];
    const { data: rows } = await supabase!.from('field_entries').select('*').in('event_id', phases.map((p) => p.id)).in('player_id', ids);
    entries = ((rows ?? []) as any[]).map(toEntry);
  }
  const dateOf = new Map(phases.map((p) => [p.id, p.startsAt.slice(0, 10)]));
  const out: MarkHistory[] = [];
  for (const e of entries) {
    const p = performanceOf(toResultEntry(e, () => ''), def);
    if (p.status === 'ok' && p.bestLegal != null) out.push({ athleteId: e.playerId, discipline: def.key, value: p.bestLegal, date: dateOf.get(e.eventId) ?? '' });
  }
  return out;
}

/** For tests / sheets: the engine's entries for a phase. */
export const resultEntries = (entries: FieldEntry[], nameOf: (id: string) => string): ResultEntry[] => entries.map((e) => toResultEntry(e, nameOf));
