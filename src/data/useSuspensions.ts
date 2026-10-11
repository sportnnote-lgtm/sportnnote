/** SD-70 (FB-12) / SD-126 — the players suspended for one upcoming match of a
 *  tournament (its organiser's rule in `formats[sport]`), for the matchday
 *  squad / lineup pickers. Football, hockey, handball, basketball and kabaddi
 *  (src/sports/discipline.ts); empty for any other sport, a friendly or a
 *  match already played. A warning only — picking a suspended player is allowed. */
import { useEffect, useState } from 'react';
import { getMatch, getMatches, getTournaments } from './repos';
import { hasDiscipline, sportSuspensionsFor, type Suspension } from '../sports/discipline';
import type { SportId } from '../core/types';

type Side = 'home' | 'away';
const NONE: Record<Side, Suspension[]> = { home: [], away: [] };

export function useMatchSuspensions(matchId: string | undefined, sport: SportId | undefined): Record<Side, Suspension[]> {
  const [out, setOut] = useState<Record<Side, Suspension[]>>(NONE);
  useEffect(() => {
    if (!matchId || !sport || !hasDiscipline(sport)) return;
    let on = true;
    (async () => {
      const m = await getMatch(matchId);
      if (!m?.tournamentId || m.status === 'completed') return;
      const [all, ts] = await Promise.all([getMatches(sport), getTournaments()]);
      const t = ts.find((x) => x.id === m.tournamentId);
      const mine = all.filter((x) => x.tournamentId === m.tournamentId);
      if (on) setOut(sportSuspensionsFor(m, mine, t?.formats?.[sport] as Record<string, unknown> | undefined));
    })().catch(() => { /* a warning only — never block the picker */ });
    return () => { on = false; };
  }, [matchId, sport]);
  return out;
}
