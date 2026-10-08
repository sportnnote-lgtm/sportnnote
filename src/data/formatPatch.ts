/**
 * Per-sport format patching (parity #07, REVIEW Decision 5). A tournament's
 * `formats` jsonb holds every sport's settings plus organiser data that rides
 * along with them (`pointsAdj`, `manualRows`, points / tie-break keys). Saving a
 * whole `formats` object from a stale draft erases whatever someone else wrote
 * meanwhile, so every write merges just its own keys into one sport, on top of
 * a fresh read. Pure — `patchTournamentFormat` (repos.ts) does the I/O.
 */

/** `formats` with `patch` merged into `formats[sport]` only. Other sports and
 *  this sport's other keys are kept; a patch value of `undefined` deletes that
 *  key. Never mutates the input. */
export function mergeSportFormat(
  formats: Record<string, Record<string, unknown>> | null | undefined,
  sport: string,
  patch: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const next: Record<string, unknown> = { ...(formats?.[sport] ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return { ...(formats ?? {}), [sport]: next };
}
