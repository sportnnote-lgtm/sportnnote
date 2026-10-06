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
import {
  holesFor, courseHandicap, playingHandicap, strokesReceived, rankLeaderboard, roundStats, emptyCard,
  type GolfCard, type GolfFormat, type HoleSet, type RankRow, type Hole,
} from '../sports/golf/engine';

const live = () => isSupabaseConfigured && !!supabase;

/* -------------------------------- format -------------------------------- */

/** A golf round's format (stored on FieldEvent.format). */
export interface GolfRoundFormat extends GolfFormat {
  courseId: string;
  tee?: string;
  /** rank by net (handicap) scores in stroke play */
  net: boolean;
  tieBreak: 'countback' | 'shared';
}

export function golfFormatOf(ev: Pick<FieldEvent, 'format'>): GolfRoundFormat {
  const f = ev.format ?? {};
  return {
    scoring: f.competition === 'stableford' || f.scoring === 'stableford' ? 'stableford' : 'stroke',
    holes: (['18', 'front9', 'back9'].includes(String(f.holes)) ? String(f.holes) : '18') as HoleSet,
    allowance: typeof f.allowance === 'number' ? f.allowance : 95,
    maxScore: (['none', 'ndb', 'par3', 'par5'].includes(String(f.maxScore)) ? f.maxScore : 'ndb') as GolfFormat['maxScore'],
    courseId: String(f.courseId ?? ''),
    tee: typeof f.tee === 'string' ? f.tee : undefined,
    net: f.net === true || f.netScoring === 'net',
    tieBreak: f.tieBreak === 'shared' ? 'shared' : 'countback',
  };
}

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

const toEvent = (r: any): FieldEvent => ({
  id: r.id, tournamentId: r.tournament_id ?? undefined, sport: r.sport, title: r.title, roundNo: r.round_no ?? 1,
  startsAt: r.starts_at, status: r.status, format: r.format ?? {}, hostIds: r.host_ids ?? [], createdBy: r.created_by ?? undefined,
});
const toEntry = (r: any): FieldEntry => ({
  id: r.id, eventId: r.event_id, playerId: r.player_id, groupNo: r.group_no ?? 1, teeTime: r.tee_time ?? undefined,
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
type Pending = { card: GolfCard; status?: FieldEntryStatus };
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
const pendingCard = (entryId: string): GolfCard | undefined => pending.get(entryId)?.card;
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
  await hydrate();
  pending.set(entryId, { card, status: status ?? pending.get(entryId)?.status });
  void persist();
  if (!flushTimer) flushTimer = setInterval(() => { void flushGolfOutbox(); }, 15_000);
  return flushGolfOutbox();
}

/** Organizer edits outside the card: handicap index, group, status. */
export async function updateFieldEntry(entryId: string, patch: Partial<Pick<FieldEntry, 'handicapIndex' | 'groupNo' | 'teeTime' | 'startHole' | 'status'>>): Promise<void> {
  if (!live()) {
    const e = demo.fieldEntries.find((x) => x.id === entryId);
    if (e) Object.assign(e, patch);
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

export async function removeFieldEntry(entryId: string): Promise<void> {
  if (!live()) { demo.fieldEntries = demo.fieldEntries.filter((e) => e.id !== entryId); return; }
  const { error } = await supabase!.from('field_entries').delete().eq('id', entryId);
  if (error) throw new Error(error.message);
}

/* ----------------------------- computations ----------------------------- */

/** The holes and strokes received for one entry in one round. */
export function roundContext(ev: FieldEvent, course: GolfCourse, entry: Pick<FieldEntry, 'handicapIndex'>) {
  const fmt = golfFormatOf(ev);
  const holes = holesFor(course, fmt.holes);
  const tee = course.tees.find((t) => t.name === fmt.tee) ?? course.tees[0];
  const idx = entry.handicapIndex;
  const ch = idx == null ? 0 : courseHandicap(idx, tee, holes);
  const ph = idx == null ? 0 : playingHandicap(ch, fmt.allowance);
  return { fmt, holes, tee, courseHandicap: ch, playingHandicap: ph, received: strokesReceived(ph, holes) };
}

export const cardOf = (entry: FieldEntry, holes: number): GolfCard => {
  const c = entry.result as GolfCard | null;
  return c && Array.isArray(c.strokes) && c.strokes.length === holes ? c : emptyCard(holes);
};

/**
 * The leaderboard across one or more rounds (a tournament's rounds, or a single
 * casual round). Players are matched across rounds by player id; the format of
 * the LAST round decides scoring/net/tie-break.
 */
export function buildLeaderboard(events: FieldEvent[], entries: FieldEntry[], courses: GolfCourse[]): RankRow[] {
  if (!events.length) return [];
  const ordered = [...events].sort((a, b) => a.roundNo - b.roundNo);
  const last = golfFormatOf(ordered[ordered.length - 1]);
  const byPlayer = new Map<string, { status: FieldEntry['status']; rounds: { card: GolfCard; holes: Hole[]; received: number[] }[] }>();
  for (const ev of ordered) {
    const course = courses.find((c) => c.id === golfFormatOf(ev).courseId);
    if (!course) continue;
    for (const en of entries.filter((e) => e.eventId === ev.id)) {
      const ctx = roundContext(ev, course, en);
      const row = byPlayer.get(en.playerId) ?? { status: en.status, rounds: [] };
      row.rounds.push({ card: cardOf(en, ctx.holes.length), holes: ctx.holes, received: ctx.received });
      row.status = en.status;
      byPlayer.set(en.playerId, row);
    }
  }
  return rankLeaderboard(
    [...byPlayer.entries()].map(([id, r]) => ({ id, status: r.status, rounds: r.rounds })),
    { scoring: last.scoring, net: last.net, tieBreak: last.tieBreak },
  );
}

/**
 * Finish a round: mark it completed and write each player's stat line (birdies,
 * putts, GIR…), with `won` for the round's winner(s). Idempotent — re-finishing
 * rewrites the lines.
 */
export async function completeRound(ev: FieldEvent, entries: FieldEntry[], course: GolfCourse): Promise<void> {
  await flushGolfOutbox();
  const rows = buildLeaderboard([ev], entries, [course]);
  const winners = new Set(rows.filter((r) => r.position === 1).map((r) => r.id));
  const lines = entries.map((en) => {
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
