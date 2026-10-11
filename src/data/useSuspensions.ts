/** SD-70 (FB-12) — the players suspended for one upcoming football match of a
 *  tournament (its organiser's rule in `formats.football`), for the matchday
 *  squad / lineup pickers. Empty for any other sport, a friendly or a match
 *  already played. A warning only — picking a suspended player is allowed. */
import { useEffect, useState } from 'react';
import { getMatch, getMatches, getTournaments } from './repos';
import { suspensionsFor, type Suspension } from '../sports/football/discipline';
import type { SportId } from '../core/types';

type Side = 'home' | 'away';
const NONE: Record<Side, Suspension[]> = { home: [], away: [] };

export function useMatchSuspensions(matchId: string | undefined, sport: SportId | undefined): Record<Side, Suspension[]> {
  const [out, setOut] = useState<Record<Side, Suspension[]>>(NONE);
  useEffect(() => {
    if (!matchId || sport !== 'football') return;
    let on = true;
    (async () => {
      const m = await getMatch(matchId);
      if (!m?.tournamentId || m.status === 'completed') return;
      const [all, ts] = await Promise.all([getMatches('football'), getTournaments()]);
      const t = ts.find((x) => x.id === m.tournamentId);
      const mine = all.filter((x) => x.tournamentId === m.tournamentId);
      if (on) setOut(suspensionsFor(m, mine, t?.formats?.football as Record<string, unknown> | undefined));
    })().catch(() => { /* a warning only — never block the picker */ });
    return () => { on = false; };
  }, [matchId, sport]);
  return out;
}
