/**
 * SD-128 — meet entries storage: late entries, scratches, deleting an event,
 * the meet's entries document (matrix ticks, caps, event-only athletes) and
 * bulk-added athletes. The rules are pure in data/results/entries.ts.
 *
 * No migration: entries / phases are the existing field_entries /
 * field_events rows (managers may insert, update and delete them — RLS
 * can_manage_field_event); the entries document is JSON on the tournament
 * (formats[sport].meetEntries, like the record book); athletes are ordinary
 * provisional players (profile_id null).
 */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { demo, addPlayer } from './demoStore';
import type { FieldEntry, FieldEvent, Player, SportId } from '../core/types';
import { getFieldEntries, removeFieldEntry } from './golf';
import { getPlayer, patchTournamentFormat } from './repos';
import {
  getPhase, getResultsPhases, insertEntries, deletePhase, patchPhaseFormat, moveEntry, getRecordBook, writeRecordOps, type NewEntrant,
} from './resultsStore';
import {
  phaseOf, disciplineOf, phaseDiscipline, categoryKey, recordDefsFor, rollbackRecords, crewEventOf,
  lateAddVerdict, placeLateEntry, scratchVerdict, scratchResult, reinstateResult, deleteCheck, parseEntriesDoc, emptyEntries,
  type EntryResult, type LatePlace, type MeetEntriesDoc, type DeleteCheck,
} from './results';

const live = () => isSupabaseConfigured && !!supabase;

/* ------------------------------ the document ------------------------------ */

/** The meet's entries document (fresh read). Empty before anyone used it. */
export async function getEntriesDoc(tournamentId: string | undefined, sport: string): Promise<MeetEntriesDoc> {
  if (!tournamentId) return emptyEntries();
  if (!live()) {
    const t = demo.tournaments.find((x) => x.id === tournamentId);
    return parseEntriesDoc((t?.formats as Record<string, Record<string, unknown>> | undefined)?.[sport]?.meetEntries);
  }
  const { data } = await supabase!.from('tournaments').select('formats').eq('id', tournamentId).maybeSingle();
  return parseEntriesDoc((data as { formats?: Record<string, Record<string, unknown>> } | null)?.formats?.[sport]?.meetEntries);
}

/** Change the document: fresh read → change → write (two desks rarely clash on one tick). */
export async function updateEntriesDoc(tournamentId: string, sport: string, change: (d: MeetEntriesDoc) => MeetEntriesDoc): Promise<MeetEntriesDoc> {
  const next = change(await getEntriesDoc(tournamentId, sport));
  await patchTournamentFormat(tournamentId, sport, { meetEntries: JSON.stringify(next) });
  return next;
}

/* ------------------------------- late entry ------------------------------- */

/** Where a late entry would go (for the confirm sheet). */
export async function previewLateEntry(phaseId: string, heat?: number | 'new'): Promise<{ place: LatePlace; reason?: string }> {
  const ph = await getPhase(phaseId);
  const f = ph && phaseOf(ph);
  const base = f && disciplineOf(f.discipline);
  if (!ph || !f || !base) throw new Error('Event not found');
  const def = phaseDiscipline(base, f);
  const ens = await getFieldEntries([ph.id]);
  const v = lateAddVerdict(f, ph.status, ens.map((e) => ({ result: (e.result ?? {}) as EntryResult })));
  const place = placeLateEntry(ens.map((e) => ({ heat: e.groupNo, lane: (e.result as EntryResult | null)?.lane, order: (e.result as EntryResult | null)?.order })), def, { heats: f.heats, heat });
  return { place, ...(v.ok ? {} : { reason: v.reason }) };
}

/**
 * Add an entrant to an open first round after its start list exists: into the
 * heat with room (a free lane — the outside first) or a new heat; field
 * events / distance races / road / lifting go last in the smallest flight.
 * Returns the new entry and where it went.
 */
export async function lateAddEntry(phaseId: string, e: NewEntrant, opts: { heat?: number | 'new' } = {}): Promise<{ entry: FieldEntry; place: LatePlace }> {
  const ph = await getPhase(phaseId);
  const f = ph && phaseOf(ph);
  const base = f && disciplineOf(f.discipline);
  if (!ph || !f || !base) throw new Error('Event not found');
  const def = phaseDiscipline(base, f);
  const ens = await getFieldEntries([ph.id]);
  const v = lateAddVerdict(f, ph.status, ens.map((x) => ({ result: (x.result ?? {}) as EntryResult })));
  if (!v.ok) throw new Error(v.reason);
  if (def.teamSize && e.playerId) throw new Error(`${def.label} entries are teams, not athletes.`);
  if (!def.teamSize && !e.playerId) throw new Error('Pick an athlete.');
  if (e.playerId && ens.some((x) => x.playerId === e.playerId)) throw new Error('Already on this start list.');
  if (def.teamSize) {
    const boat = crewEventOf(def.key)?.boat;
    const need = boat ? boat.seats + (boat.cox ? 1 : 0) : def.teamSize;
    if ((e.members?.length ?? 0) < need) throw new Error(`Pick the ${need} ${boat ? 'crew members' : 'team members'}${boat?.cox ? ' (the cox last)' : ''}.`);
  }
  const place = placeLateEntry(ens.map((x) => ({ heat: x.groupNo, lane: (x.result as EntryResult | null)?.lane, order: (x.result as EntryResult | null)?.order })), def, { heats: f.heats, heat: opts.heat });
  const boat = def.teamSize ? crewEventOf(def.key)?.boat : undefined;
  const members = e.members?.map((m, i, all) => (boat?.cox && i === all.length - 1 ? { ...m, cox: true } : m));
  const result: EntryResult = {
    ...(e.start ?? {}), ...(place.lane != null ? { lane: place.lane } : {}), order: place.order, bib: e.bib, team: e.team, late: true,
    ...(e.playerId ? {} : { name: e.name, members: members ?? [] }),
  };
  const [entry] = await insertEntries(ph.id, [{ playerId: e.playerId, teamId: e.team?.id, heat: place.heat, result }]);
  if (place.heat > f.heats) await patchPhaseFormat(ph.id, { heats: place.heat });
  return { entry, place };
}

/* --------------------------------- scratch -------------------------------- */

async function phaseAndEntry(phaseId: string, entryId: string): Promise<{ ph: FieldEvent; ens: FieldEntry[]; en: FieldEntry }> {
  const ph = await getPhase(phaseId);
  if (!ph) throw new Error('Event not found');
  const ens = await getFieldEntries([ph.id]);
  const en = ens.find((x) => x.id === entryId);
  if (!en) throw new Error('Entry not found');
  return { ph, ens, en };
}

/** Scratch an entrant: DNS with the reason; the lane stays empty and they
 *  can't be seeded into a later round. */
export async function scratchEntry(phaseId: string, entryId: string, reason: string): Promise<EntryResult> {
  const { ph, ens, en } = await phaseAndEntry(phaseId, entryId);
  const r = (en.result ?? {}) as EntryResult;
  const v = scratchVerdict(ph.status, r, ens.map((x) => ({ result: (x.result ?? {}) as EntryResult })));
  if (!v.ok) throw new Error(v.reason);
  const next = scratchResult(r, reason);
  await moveEntry(en.id, en.groupNo, next);
  return next;
}

/** Put a scratched entrant back on the start list (same heat / lane). */
export async function reinstateEntry(phaseId: string, entryId: string): Promise<EntryResult> {
  const { ph, en } = await phaseAndEntry(phaseId, entryId);
  if (ph.status === 'completed') throw new Error('This round is closed — an organiser can reopen it first.');
  const next = reinstateResult((en.result ?? {}) as EntryResult);
  await moveEntry(en.id, en.groupNo, next);
  return next;
}

/** Take a never-started entry off the start list altogether (a wrong entry). */
export async function removeEntry(phaseId: string, entryId: string): Promise<void> {
  const { ph, ens, en } = await phaseAndEntry(phaseId, entryId);
  const v = scratchVerdict(ph.status, { ...((en.result ?? {}) as EntryResult), scratch: undefined }, ens.map((x) => ({ result: (x.result ?? {}) as EntryResult })));
  if (!v.ok) throw new Error(v.reason);
  await removeFieldEntry(en.id);
}

/* ------------------------------ delete event ------------------------------ */

/** What deleting this event would remove (every phase, from the first). */
export async function checkDeleteEvent(eventKey: string): Promise<DeleteCheck & { phaseIds: string[] }> {
  const phases = (await getResultsPhases({ eventKey })).sort((a, b) => a.roundNo - b.roundNo);
  const ens = await getFieldEntries(phases.map((p) => p.id));
  return {
    ...deleteCheck(phases.map((p) => ({ status: p.status, results: ens.filter((e) => e.eventId === p.id).map((e) => e.result as EntryResult) }))),
    phaseIds: phases.map((p) => p.id),
  };
}

/**
 * Delete a whole event (organiser). Refused when it has results unless
 * `withResults`; then any record it set goes back to the previous holder and
 * its medals / points / stat lines go with it.
 */
export async function deleteResultsEvent(eventKey: string, opts: { withResults?: boolean } = {}): Promise<void> {
  const phases = (await getResultsPhases({ eventKey })).sort((a, b) => a.roundNo - b.roundNo);
  if (!phases.length) return;
  const ens = await getFieldEntries(phases.map((p) => p.id));
  const chk = deleteCheck(phases.map((p) => ({ status: p.status, results: ens.filter((e) => e.eventId === p.id).map((e) => e.result as EntryResult) })));
  if (chk.hasResults && !opts.withResults) throw new Error('This event has results — confirm "delete results too" to remove it.');
  // records it set → the previous holder (as Reopen final does)
  for (const p of phases) {
    const f = phaseOf(p);
    const d = f && disciplineOf(f.discipline);
    if (!f || !d || p.status !== 'completed') continue;
    const sport = d.sport;
    const book = await getRecordBook(p.tournamentId, sport);
    let next = book;
    const defs = f.combined ? [disciplineOf(f.combined.key)!].filter(Boolean) : recordDefsFor(d);
    for (const x of defs) next = rollbackRecords(next, x.key, categoryKey(f.category), f.eventKey, f.recordsBefore);
    // SD-130: "restore" operations through the atomic merge (a record another
    // final sets at the same moment is kept), as Reopen final does
    if (next.length !== book.length || next.some((r, i) => r !== book[i])) {
      await writeRecordOps(p.tournamentId, sport, defs.map((x) => ({ op: 'restore' as const, discipline: x.key, category: categoryKey(f.category), eventKey: f.eventKey, before: f.recordsBefore ?? [] })), p.id);
    }
  }
  // stat lines, entries, then the phases (latest first)
  for (const p of [...phases].reverse()) {
    if (!live()) demo.statLines = demo.statLines.filter((l) => l.eventId !== p.id);
    else await supabase!.from('stat_lines').delete().eq('event_id', p.id);
    for (const e of ens.filter((x) => x.eventId === p.id)) await removeFieldEntry(e.id);
    await deletePhase(p.id);
  }
}

/* ------------------------------ event athletes ------------------------------ */

export interface NewEventAthlete {
  fullName: string;
  gender?: 'M' | 'F';
  dob?: string;
  houseName?: string;
  houseColor?: string;
}

/** Create an athlete for this meet (a provisional player, no account) — a
 *  pasted list or a late entry of someone on no roster. */
export async function createEventAthlete(a: NewEventAthlete, sport: SportId): Promise<Player> {
  const gender = a.gender === 'M' ? 'Male' : a.gender === 'F' ? 'Female' : undefined;
  if (!live()) return addPlayer({ fullName: a.fullName, sports: [sport], houseName: a.houseName, houseColor: a.houseColor, gender, dob: a.dob });
  const { data, error } = await supabase!.from('players').insert({
    full_name: a.fullName, sports: [sport], house_name: a.houseName ?? null, house_color: a.houseColor ?? null, gender: gender ?? null, dob: a.dob ?? null, profile_id: null,
  }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'Could not add the athlete');
  const p = await getPlayer(data.id as string);
  return p ?? { id: data.id as string, fullName: a.fullName, sports: [sport], houseName: a.houseName, gender, dob: a.dob };
}
