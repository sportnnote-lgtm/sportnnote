/**
 * SD-141 — the Competition rules step: read whether a sport's rules are locked
 * (any result exists for it in the tournament), and save them. The rules live
 * in the tournament's `formats[sport]` (patchTournamentFormat merges just these
 * keys into a fresh read); the ones the engine reads while scoring are copied
 * onto every phase of that sport (`PhaseFormat.rules`), which is safe because
 * a save is refused once any phase has a result. No migration.
 */
import type { SportId } from '../core/types';
import { patchTournamentFormat } from './repos';
import { getFieldEntries } from './golf';
import { getResultsPhases, patchPhaseFormat, sportFormatOf } from './resultsStore';
import { updateEntriesDoc } from './meetEntriesStore';
import { hasAnyResult, phaseRules, rulesLocked, type EntryCaps, type EntryResult } from './results';

export interface RulesLock { locked: boolean; events: number }

/** The sport's phases in the tournament, with their results. */
async function sportPhases(tournamentId: string, sport: string) {
  const phases = (await getResultsPhases({ tournamentId })).filter((p) => p.sport === sport);
  const entries = phases.length ? await getFieldEntries(phases.map((p) => p.id)) : [];
  return phases.map((p) => ({
    id: p.id, status: p.status, eventKey: (p.format as { results?: { eventKey?: string } } | undefined)?.results?.eventKey,
    // a scratch is not a result (SD-128)
    results: entries.filter((e) => e.eventId === p.id).map((e) => { const r = (e.result ?? {}) as EntryResult; return r.scratch ? { ...r, status: undefined, scratch: undefined } : r; }),
  }));
}

/** Locked once any result exists for the sport in the tournament. */
export async function getRulesLock(tournamentId: string, sport: string): Promise<RulesLock> {
  const ps = await sportPhases(tournamentId, sport);
  return { locked: rulesLocked(ps, (rs) => hasAnyResult(rs as EntryResult[])), events: new Set(ps.map((p) => p.eventKey ?? p.id)).size };
}

/**
 * Save the sport's rules (`patch`: rule key → value; undefined = back to the
 * standard default) and, when given, the entries caps. Refused when results
 * exist (checked again here, on a fresh read). Copies the scoring rules onto
 * every phase of the sport already set up. Returns how many phases were updated.
 */
export async function saveCompetitionRules(tournamentId: string, sport: string, patch: Record<string, unknown>, caps?: EntryCaps | null): Promise<number> {
  const ps = await sportPhases(tournamentId, sport);
  if (rulesLocked(ps, (rs) => hasAnyResult(rs as EntryResult[]))) throw new Error('Results already exist for this sport — the competition rules are locked.');
  await patchTournamentFormat(tournamentId, sport, { ...patch, rulesSetAt: new Date().toISOString() });
  if (caps !== undefined) await updateEntriesDoc(tournamentId, sport, (d) => ({ ...d, caps: caps && (caps.individual != null || caps.relay != null) ? caps : undefined }));
  const rules = phaseRules(sport, await sportFormatOf(tournamentId, sport));
  for (const p of ps) await patchPhaseFormat(p.id, { rules });
  return ps.length;
}

/** The team sports of a tournament (not event sports) — their bans and walkover scores are set per sport. */
export const teamSportsOf = (sports: SportId[], isEvent: (s: string) => boolean): SportId[] => sports.filter((s) => !isEvent(s));
