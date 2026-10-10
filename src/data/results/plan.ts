/**
 * Storage mapping and round planning — still pure. A phase is a field_events
 * row whose `format.results` is a PhaseFormat; an entry is a field_entries row
 * whose `result` is an EntryResult (see model.ts).
 */
import type { FieldEntry, FieldEntryStatus, FieldEvent } from '../../core/types.ts';
import type { DisciplineDef, EntryResult, PhaseFormat, PhaseKind, Progression, ResultEntry, ResultStatus } from './model.ts';
import { disciplineOf } from './model.ts';

/** The phase format of a field event, or null if it isn't a results-engine phase. */
export function phaseOf(ev: Pick<FieldEvent, 'format' | 'roundNo'>): PhaseFormat | null {
  const f = (ev.format as { results?: PhaseFormat } | undefined)?.results;
  if (!f || typeof f.discipline !== 'string' || !disciplineOf(f.discipline)) return null;
  return { ...f, phaseNo: f.phaseNo ?? ev.roundNo ?? 1, heats: Math.max(1, f.heats ?? 1) };
}

/** field_entries.status from the engine's status (the column keeps 0028's set;
 *  the precise status lives in result.status). */
export function fieldStatusFor(status: ResultStatus | undefined, hasMark: boolean): FieldEntryStatus {
  switch (status) {
    case 'DNF': case 'NM': return 'dnf';
    case 'DQ': case 'FS': return 'dq';
    case 'DNS': case 'WD': return 'wd';
    default: return hasMark ? 'finished' : 'playing';
  }
}

/** A stored entry → the engine's entry. `nameOf` resolves a player id. */
export function toResultEntry(fe: FieldEntry, nameOf: (playerId: string) => string): ResultEntry {
  const r = (fe.result && typeof fe.result === 'object' ? fe.result : {}) as EntryResult;
  const isTeam = !fe.playerId;
  return {
    id: fe.id,
    athleteId: fe.playerId || undefined,
    name: isTeam ? r.name ?? r.team?.name ?? 'Team' : nameOf(fe.playerId),
    team: r.team ?? (fe.teamId ? { id: fe.teamId, name: '' } : undefined),
    heat: fe.groupNo ?? 1,
    result: r,
  };
}

const PHASE_LABEL: Record<PhaseKind, string> = { heat: 'Heats', repechage: 'Repechage', semi: 'Semi-finals', qualification: 'Qualification', final: 'Final' };
export const phaseLabel = (k: PhaseKind) => PHASE_LABEL[k];

export interface PlannedPhase { phase: PhaseKind; heats: number; progression?: Progression }

/**
 * The rounds for a field of `entrants` (a sensible default an official can
 * change): a lane race straight to a final when the field fits the lanes,
 * otherwise heats → final (a final of `lanes`: first N of each heat Q plus the
 * fastest losers q), with semi-finals once there are more than four heats.
 * Non-lane races and field events: one final (field events give the top 8
 * three more attempts inside the final).
 */
export function planRounds(def: DisciplineDef, entrants: number): PlannedPhase[] {
  const lanes = def.capture === 'single' ? def.lanes : undefined;
  if (!lanes || entrants <= lanes) return [{ phase: 'final', heats: 1 }];
  const feed = (heats: number, size: number): Progression => {
    const byPlace = Math.max(1, Math.floor((size - 2) / heats));
    return { byPlace, byMark: Math.max(0, size - byPlace * heats) };
  };
  const heats = Math.ceil(entrants / lanes);
  if (heats <= 4) return [{ phase: 'heat', heats, progression: feed(heats, lanes) }, { phase: 'final', heats: 1 }];
  const semis = heats <= 6 ? 2 : 3;
  return [
    { phase: 'heat', heats, progression: feed(heats, semis * lanes) },
    { phase: 'semi', heats: semis, progression: feed(semis, lanes) },
    { phase: 'final', heats: 1 },
  ];
}
