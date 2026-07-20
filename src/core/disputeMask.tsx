/** Dispute masking for the live match screen. When a participation dispute is
 *  open, the disputed player's identity is hidden as "X" wherever it shows for
 *  that match — timeline, summary/scorecard, etc. Surfaces opt in by calling
 *  `useMask()`; with no provider (or no open disputes) everything is a no-op.
 *
 *  Cross-match aggregates (profiles, leaderboards) don't use this — they instead
 *  hold disputed stat lines OUT entirely until resolved (see getAllStatLines). */
import React, { createContext, useContext } from 'react';

export const MASK = 'X';

export interface MaskValue {
  /** player ids with an open dispute on the current match (id-keyed surfaces) */
  ids: Set<string>;
  /** disputed player names (for masking names embedded in free-text/event strings) */
  names: Set<string>;
}

const MaskContext = createContext<MaskValue>({ ids: new Set(), names: new Set() });
export const DisputeMaskProvider = MaskContext.Provider;

export function useMask() {
  const v = useContext(MaskContext);
  return {
    active: v.ids.size > 0 || v.names.size > 0,
    /** mask a name resolved from a player id */
    byId: (id: string | undefined, name: string) => (id && v.ids.has(id) ? MASK : name),
    /** mask a bare player name */
    name: (name?: string) => (name && v.names.has(name) ? MASK : name ?? ''),
    /** mask any disputed name occurring inside a free-text string (e.g. "3-2 · Aarav") */
    text: (s?: string) => {
      if (!s || v.names.size === 0) return s ?? '';
      let out = s;
      v.names.forEach((n) => { if (n) out = out.split(n).join(MASK); });
      return out;
    },
  };
}
