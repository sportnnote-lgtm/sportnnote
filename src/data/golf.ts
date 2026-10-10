/**
 * Golf data layer — courses, field events (rounds) and entries (cards), with the
 * demo ↔ live split every repo follows. Leaderboards are computed client-side by
 * the pure engine (sports/golf/engine). Card saves go through a small durable
 * outbox so a marker on a course with patchy signal never loses a hole.
 * See docs/sports/GOLF_DESIGN.md.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { demo, genId } from './demoStore';
import type { FieldEntry, FieldEntryStatus, FieldEvent, FieldEventStatus, GolfCourse } from '../core/types';
import { roundStats, emptyCard, type GolfCard, type Hole } from '../sports/golf/engine';
import { buildLeaderboard, roundContext, cardOf, entryStatusOf, withAdmin } from './golfLeaderboard';
import type { EntryAdmin } from '../sports/golf/engine';

// Pure leaderboard/format helpers live in golfLeaderboard.ts (testable in node);
// re-exported so screens keep importing them from here.
export {
  golfFormatOf, roundContext, cardOf, buildLeaderboard, type GolfRoundFormat,
  parseIndex, showIndex, entryAdminOf, entryStatusOf, withAdmin, adminLabel, applyPlayoff, roundCells, thruLabel, prizeBoards, type RoundCell,
} from './golfLeaderboard';

const live = () => isSupabaseConfigured && !!supabase;

/* -------------------------------- courses ------------------------------- */

const toCourse = (r: any): GolfCourse => ({
  id: r.id, name: r.name, city: r.city ?? undefined, holes: r.holes_data ?? [], tees: r.tees ?? [], createdBy: r.created_by ?? undefined,
});

export async function getGolfCourses(): Promise<GolfCourse[]> {
  if (!live()) return [...demo.golfCourses];
  const { data } = await supabase!.from('golf_courses').select('*').order('name');
  return ((data ?? []) as any[]).map(toCourse);
}

export async function getGolfCourse(id: string): Promise<GolfCourse | null> {
  if (!live()) return demo.golfCourses.find((c) => c.id === id) ?? null;
  const { data } = await supabase!.from('golf_courses').select('*').eq('id', id).maybeSingle();
  return data ? toCourse(data) : null;
}

export async function createGolfCourse(input: Omit<GolfCourse, 'id' | 'createdBy'>): Promise<GolfCourse> {
  validateHoles(input.holes);
  if (!live()) {
    const c: GolfCourse = { ...input, id: genId('course') };
    demo.golfCourses.push(c);
    return c;
  }
  const { data, error } = await supabase!.from('golf_courses')
    .insert({ name: input.name, city: input.city ?? null, holes_data: input.holes, tees: input.tees })
    .select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the course');
  return toCourse(data);
}

/** Pars 3–6 and each stroke index used exactly once (1..9 or 1..18). */
export function validateHoles(holes: Hole[]): void {
  if (holes.length !== 9 && holes.length !== 18) throw new Error('A course has 9 or 18 holes.');
  if (holes.some((h) => h.par < 3 || h.par > 6)) throw new Error('Each hole needs a par between 3 and 6.');
  const sis = [...holes.map((h) => h.si)].sort((a, b) => a - b);
  if (sis.some((si, i) => si !== i + 1)) throw new Error(`Stroke indexes must be 1–${holes.length}, each used once.`);
}

/* ----------------------------- events/entries --------------------------- */

export const toEvent = (r: any): FieldEvent => ({
  id: r.id, tournamentId: r.tournament_id ?? undefined, sport: r.sport, title: r.title, roundNo: r.round_no ?? 1,
  startsAt: r.starts_at, status: r.status, format: r.format ?? {}, hostIds: r.host_ids ?? [], createdBy: r.created_by ?? undefined,
});
export const toEntry = (r: any): FieldEntry => ({
  id: r.id, eventId: r.event_id, playerId: r.player_id ?? '', teamId: r.team_id ?? undefined, groupNo: r.group_no ?? 1, teeTime: r.tee_time ?? undefined,
  startHole: r.start_hole ?? undefined, handicapIndex: r.handicap_index ?? undefined, result: r.result ?? null,
  status: r.status, updatedAt: r.updated_at ?? undefined,
});

export interface NewFieldEvent {
  tournamentId?: string;
  sport: 'golf';
  title: string;
  roundNo?: number;
  startsAt: string;
  format: Record<string, unknown>;
  hostIds?: string[];
}

export async function createFieldEvent(input: NewFieldEvent): Promise<FieldEvent> {
  if (!live()) {
    const ev: FieldEvent = { id: genId('fev'), tournamentId: input.tournamentId, sport: input.sport, title: input.title, roundNo: input.roundNo ?? 1, startsAt: input.startsAt, status: 'scheduled', format: input.format, hostIds: input.hostIds ?? [] };
    demo.fieldEvents.push(ev);
    return ev;
  }
  const { data, error } = await supabase!.from('field_events').insert({
    tournament_id: input.tournamentId ?? null, sport: input.sport, title: input.title, round_no: input.roundNo ?? 1,
    starts_at: input.startsAt, status: 'scheduled', format: input.format, host_ids: input.hostIds ?? [],
  }).select('*').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the round');
  return toEvent(data);
}

export async function getFieldEvents(filter: { tournamentId?: string; sport?: string; status?: FieldEventStatus } = {}): Promise<FieldEvent[]> {
  if (!live()) {
    return demo.fieldEvents.filter((e) =>
      (!filter.tournamentId || e.tournamentId === filter.tournamentId) && (!filter.sport || e.sport === filter.sport) && (!filter.status || e.status === filter.status),
    ).sort((a, b) => a.roundNo - b.roundNo || a.startsAt.localeCompare(b.startsAt));
  }
  let q = supabase!.from('field_events').select('*').order('round_no').order('starts_at');
  if (filter.tournamentId) q = q.eq('tournament_id', filter.tournamentId);
  if (filter.sport) q = q.eq('sport', filter.sport);
  if (filter.status) q = q.eq('status', filter.status);
  const { data } = await q;
  return ((data ?? []) as any[]).map(toEvent);
}

export async function getFieldEvent(id: string): Promise<FieldEvent | null> {
  if (!live()) return demo.fieldEvents.find((e) => e.id === id) ?? null;
  const { data } = await supabase!.from('field_events').select('*').eq('id', id).maybeSingle();
  return data ? toEvent(data) : null;
}

/** SD-89 — merge keys into a round's format (the playoff winner). Hosts only
 *  (RLS: can_manage_field_event). */
export async function updateFieldEventFormat(id: string, patch: Record<string, unknown>): Promise<void> {
  if (!live()) {
    const e = demo.fieldEvents.find((x) => x.id === id);
    if (e) e.format = { ...e.format, ...patch };
    return;
  }
  const { data, error: readErr } = await supabase!.from('field_events').select('format').eq('id', id).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  const { error } = await supabase!.from('field_events').update({ format: { ...((data?.format as Record<string, unknown>) ?? {}), ...patch } }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setFieldEventStatus(id: string, status: FieldEventStatus): Promise<void> {
  if (!live()) {
    const e = demo.fieldEvents.find((x) => x.id === id);
    if (e) e.status = status;
    return;
  }
  const { error } = await supabase!.from('field_events').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface NewEntry { playerId: string; groupNo: number; teeTime?: string; startHole?: number; handicapIndex?: number }

export async function addFieldEntries(eventId: string, entries: NewEntry[], holes: number): Promise<FieldEntry[]> {
  const card = emptyCard(holes);
  if (!live()) {
    const out = entries.map((e) => ({ id: genId('fen'), eventId, playerId: e.playerId, groupNo: e.groupNo, teeTime: e.teeTime, startHole: e.startHole, handicapIndex: e.handicapIndex, result: card, status: 'playing' as FieldEntryStatus }));
    demo.fieldEntries.push(...out);
    return out;
  }
  const { data, error } = await supabase!.from('field_entries').insert(entries.map((e) => ({
    event_id: eventId, player_id: e.playerId, group_no: e.groupNo, tee_time: e.teeTime ?? null,
    start_hole: e.startHole ?? null, handicap_index: e.handicapIndex ?? null, result: card, status: 'playing',
  }))).select('*');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(toEntry);
}

export async function getFieldEntries(eventIds: string[]): Promise<FieldEntry[]> {
  if (!eventIds.length) return [];
  if (!live()) return demo.fieldEntries.filter((e) => eventIds.includes(e.eventId)).map((e) => ({ ...e, result: pendingCard(e.id) ?? e.result }));
  const { data } = await supabase!.from('field_entries').select('*').in('event_id', eventIds);
  return ((data ?? []) as any[]).map(toEntry).map((e) => ({ ...e, result: pendingCard(e.id) ?? e.result }));
}

/* --------------------------- card outbox (offline) ---------------------- */
// Latest unsynced card per entry, persisted. A save writes here first, then tries
// the backend; failures retry on the next save / interval / app start. Reads
// prefer the pending copy so the marker always sees what they entered.

const OUTBOX_KEY = 'sportfolio.golfOutbox.v1';
// The outbox is generic over field results: a golf card, or a results-engine
// EntryResult (athletics / swimming … — data/resultsStore.ts).
type Pending = { card: unknown; status?: FieldEntryStatus };
const pending = new Map<string, Pending>();
let hydrated = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Pending>)) pending.set(k, v);
  } catch { /* storage unavailable — in-memory only */ }
}
const persist = () => AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(Object.fromEntries(pending))).catch(() => {});
const pendingCard = (entryId: string): GolfCard | undefined => pending.get(entryId)?.card as GolfCard | undefined;
export const pendingCardCount = () => pending.size;

async function pushEntry(entryId: string, p: Pending): Promise<boolean> {
  if (!live()) {
    const e = demo.fieldEntries.find((x) => x.id === entryId);
    if (e) { e.result = p.card; if (p.status) e.status = p.status; e.updatedAt = new Date().toISOString(); }
    return true;
  }
  const { error } = await supabase!.from('field_entries')
    .update({ result: p.card, ...(p.status ? { status: p.status } : {}), updated_at: new Date().toISOString() })
    .eq('id', entryId);
  return !error;
}

export async function flushGolfOutbox(): Promise<number> {
  await hydrate();
  for (const [id, p] of [...pending]) {
    if (await pushEntry(id, p)) pending.delete(id);
  }
  void persist();
  return pending.size;
}

/** Save a player's card (and optionally status). Never throws for a network
 *  failure — the card stays queued and the returned count says how many are
 *  waiting to sync. Throws only for a permission error from the server. */
export async function saveCard(entryId: string, card: GolfCard, status?: FieldEntryStatus): Promise<number> {
  return saveFieldResult(entryId, card, status);
}

/** The same offline-safe save for any field entry's result payload. */
export async function saveFieldResult(entryId: string, card: unknown, status?: FieldEntryStatus): Promise<number> {
  await hydrate();
  pending.set(entryId, { card, status: status ?? pending.get(entryId)?.status });
  void persist();
  if (!flushTimer) flushTimer = setInterval(() => { void flushGolfOutbox(); }, 15_000);
  return flushGolfOutbox();
}

/** Organizer edits outside the card: handicap index, group, status. */
export async function updateFieldEntry(entryId: string, patch: Partial<Pick<FieldEntry, 'groupNo' | 'teeTime' | 'startHole' | 'status'>> & { handicapIndex?: number | null }): Promise<void> {
  if (!live()) {
    const e = demo.fieldEntries.find((x) => x.id === entryId);
    if (e) Object.assign(e, { ...patch, ...(patch.handicapIndex === null ? { handicapIndex: undefined } : {}) });
    return;
  }
  const row: Record<string, unknown> = {};
  if (patch.handicapIndex !== undefined) row.handicap_index = patch.handicapIndex;
  if (patch.groupNo !== undefined) row.group_no = patch.groupNo;
  if (patch.teeTime !== undefined) row.tee_time = patch.teeTime;
  if (patch.startHole !== undefined) row.start_hole = patch.startHole;
  if (patch.status !== undefined) row.status = patch.status;
  const { error } = await supabase!.from('field_entries').update(row).eq('id', entryId);
  if (error) throw new Error(error.message);
}

/** SD-35 — withdraw / disqualify / mark DNS (with a reason), or reinstate
 *  (`admin = null`): the card's `admin` note and the status column in one
 *  offline-safe write. Organisers only (the server guard rejects a marker). */
export async function setEntryAdmin(entry: FieldEntry, holes: number, admin: EntryAdmin | null, roundCompleted = false): Promise<number> {
  const { card, status } = withAdmin(cardOf(entry, holes), admin, roundCompleted);
  return saveFieldResult(entry.id, card, status);
}

export async function removeFieldEntry(entryId: string): Promise<void> {
  if (!live()) { demo.fieldEntries = demo.fieldEntries.filter((e) => e.id !== entryId); return; }
  const { error } = await supabase!.from('field_entries').delete().eq('id', entryId);
  if (error) throw new Error(error.message);
}

/* ----------------------------- computations ----------------------------- */

/**
 * Finish a round: mark it completed and write each player's stat line (birdies,
 * putts, GIR…), with `won` for the round's winner(s). Idempotent — re-finishing
 * rewrites the lines.
 */
export async function completeRound(ev: FieldEvent, entries: FieldEntry[], course: GolfCourse): Promise<void> {
  await flushGolfOutbox();
  const rows = buildLeaderboard([ev], entries, [course]);
  const winners = new Set(rows.filter((r) => r.position === 1).map((r) => r.id));
  // SD-35 — a player who did not start gets no line (they played no golf)
  const lines = entries.filter((en) => entryStatusOf(en) !== 'dns').map((en) => {
    const ctx = roundContext(ev, course, en);
    return { playerId: en.playerId, stats: roundStats(cardOf(en, ctx.holes.length), ctx.holes, ctx.received), won: winners.has(en.playerId) };
  });
  const label = course.name;
  if (!live()) {
    demo.statLines = demo.statLines.filter((l) => l.eventId !== ev.id);
    for (const l of lines) {
      demo.statLines.push({ id: genId('sl'), matchId: '', eventId: ev.id, playerId: l.playerId, sport: 'golf', stats: l.stats, won: l.won, opponent: label, date: ev.startsAt });
    }
    const e = demo.fieldEvents.find((x) => x.id === ev.id);
    if (e) e.status = 'completed';
    for (const en of entries) { const d = demo.fieldEntries.find((x) => x.id === en.id); if (d && d.status === 'playing') d.status = 'finished'; }
    return;
  }
  // Players still "playing" are marked finished as the round closes.
  await supabase!.from('field_entries').update({ status: 'finished' }).eq('event_id', ev.id).eq('status', 'playing');
  await supabase!.from('stat_lines').delete().eq('event_id', ev.id);
  if (lines.length) {
    const { error } = await supabase!.from('stat_lines').insert(lines.map((l) => ({
      event_id: ev.id, match_id: null, player_id: l.playerId, sport: 'golf', stats: l.stats, won: l.won, opponent: label, recorded_at: ev.startsAt,
    })));
    if (error) throw new Error(error.message);
  }
  await setFieldEventStatus(ev.id, 'completed');
}

/** Split players into playing groups of `size` (3- or 4-balls), keeping the
 *  given order, with tee times every `intervalMin` from `firstTee`. */
export function autoGroups(playerIds: string[], size: number, firstTee: Date, intervalMin: number): NewEntry[] {
  const n = Math.max(1, Math.ceil(playerIds.length / size));
  return playerIds.map((pid, i) => {
    const g = Math.floor(i / size) + 1;
    return { playerId: pid, groupNo: Math.min(g, n), teeTime: new Date(firstTee.getTime() + (g - 1) * intervalMin * 60_000).toISOString() };
  });
}

/** Live (in-progress) golf rounds, for Home's "Live now". */
export async function getLiveGolfRounds(): Promise<FieldEvent[]> {
  return getFieldEvents({ sport: 'golf', status: 'live' });
}
