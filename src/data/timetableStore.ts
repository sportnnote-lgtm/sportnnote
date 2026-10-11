/**
 * SD-129 — meet timetable I/O. A round's slot is written to the phase row
 * (`starts_at` + `format.results.sched.rounds`) when the phase exists, else to
 * the event's latest phase (the next round copies its plan of times when it is
 * created — resultsStore insertPhase). Meet-wide timetable settings (the clash
 * gap) live in `tournaments.formats.meet` (merge-patched like a sport's).
 * The maths is in data/results/timetable.ts.
 */
import { supabase, isSupabaseConfigured } from '../core/supabase';
import { demo } from './demoStore';
import { getPhase } from './resultsStore';
import { patchTournamentFormat } from './repos';
import { phaseOf, withRound, type SlotChange } from './results';
import type { Tournament } from '../core/types';

const live = () => isSupabaseConfigured && !!supabase;

async function writePhase(id: string, patch: { startsAt?: string; format: Record<string, unknown> }): Promise<void> {
  if (!live()) {
    const d = demo.fieldEvents.find((e) => e.id === id);
    if (d) { d.format = patch.format; if (patch.startsAt) d.startsAt = patch.startsAt; }
    return;
  }
  const { error } = await supabase!.from('field_events').update({ format: patch.format, ...(patch.startsAt ? { starts_at: patch.startsAt } : {}) }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Put one round in its slot (fresh read → merge → write). */
export async function applySlot(c: SlotChange): Promise<void> {
  const id = c.phaseId ?? c.lastPhaseId;
  const ev = await getPhase(id);
  const f = ev && phaseOf(ev);
  if (!ev || !f) throw new Error('Event not found');
  const round = { phaseNo: c.phaseNo, at: c.at, ...(c.area ? { area: c.area } : {}), ...(c.session ? { session: c.session } : {}) };
  await writePhase(id, { startsAt: c.phaseId ? c.at : undefined, format: { ...ev.format, results: { ...f, ...withRound(f, round) } } });
}

/** Several slots ("running late" moves the rest of a session). */
export async function applySlots(changes: SlotChange[]): Promise<void> {
  for (const c of changes) await applySlot(c);
}

export interface MeetTimetableSettings {
  /** minimum minutes between an athlete's two events (end → start) */
  clashMins: number;
}
export const DEFAULT_CLASH_MINS = 30;

export function timetableSettings(t?: Pick<Tournament, 'formats'> | null): MeetTimetableSettings {
  const m = (t?.formats as Record<string, Record<string, unknown>> | undefined)?.meet;
  const v = Number(m?.clashMins);
  return { clashMins: Number.isFinite(v) && v >= 0 ? v : DEFAULT_CLASH_MINS };
}

export async function saveTimetableSettings(tournamentId: string, s: Partial<MeetTimetableSettings>): Promise<void> {
  await patchTournamentFormat(tournamentId, 'meet', { ...(s.clashMins != null ? { clashMins: s.clashMins } : {}) });
}
