/**
 * A match's effective format (pure). A tournament match inherits the
 * tournament's format for its sport; a per-match format only overrides the keys
 * it sets — it must never REPLACE the tournament's (it used to: a match whose
 * format held one setting lost the tournament's overs/halves on replay).
 * `__*` keys are internal bookkeeping (walkover, break, series id…), not rules.
 */
export type Format = Record<string, unknown>;

export function stripInternal(format?: Format | null): Format {
  const out: Format = {};
  for (const [k, v] of Object.entries(format ?? {})) if (!k.startsWith('__')) out[k] = v;
  return out;
}

export function mergeMatchConfig(tourFormat?: Format | null, matchFormat?: Format | null): Format | undefined {
  if (!tourFormat && !matchFormat) return undefined;
  return { ...(tourFormat ?? {}), ...stripInternal(matchFormat) };
}
