/**
 * SD-144 — WBSC standings tie-breakers for baseball / softball, computed from
 * the games AMONG the tied teams (WBSC tournament regulations, e.g. Premier12
 * / Softball World Cup — verify per event):
 *   1. head-to-head record (the shared 'h2h' criterion),
 *   2. TQB, team quality balance = runs scored ÷ innings at bat − runs allowed
 *      ÷ innings in the field,
 *   3. ER-TQB — the same with earned runs only,
 *   4. batting average in those games,
 *   then a coin toss / drawing of lots.
 * PURE (no React Native): standings.ts registers them.
 */
import type { Match } from '../../core/types';
import { earnedRunsBy, inningsAtBat, type BaseballState, type Side } from './engine.ts';

export const BASEBALL_TIE_BREAKERS = ['tqb', 'erTqb', 'bavgTied'] as const;

function gamesAmong(teamId: string, cluster: Set<string>, matches: Match[]): { m: Match; s: BaseballState; me: Side }[] {
  return matches.flatMap((m) => {
    if (m.sport !== 'baseball' || m.status !== 'completed' || m.walkover) return [];
    const s = m.state as BaseballState | null | undefined;
    if (!s?.g || !Array.isArray(s.events)) return [];
    const h = m.homeTeam.id, a = m.awayTeam.id;
    if (!cluster.has(h) || !cluster.has(a) || (h !== teamId && a !== teamId)) return [];
    return [{ m, s, me: (h === teamId ? 'home' : 'away') as Side }];
  });
}

/** TQB (or ER-TQB) among the cluster. */
export function tqbAmong(teamId: string, clusterIds: string[], matches: Match[], earnedOnly = false): number {
  let rf = 0, ra = 0, inBat = 0, inField = 0;
  for (const { s, me } of gamesAmong(teamId, new Set(clusterIds), matches)) {
    const opp: Side = me === 'home' ? 'away' : 'home';
    const runs = earnedOnly ? earnedRunsBy(s) : s.g.score;
    const inn = inningsAtBat(s);
    rf += runs[me]; ra += runs[opp]; inBat += inn[me]; inField += inn[opp];
  }
  return (inBat > 0 ? rf / inBat : 0) - (inField > 0 ? ra / inField : 0);
}

/** Team batting average (hits ÷ at bats) in the games among the cluster. */
export function battingAvgAmong(teamId: string, clusterIds: string[], matches: Match[]): number {
  let h = 0, ab = 0;
  for (const { s, me } of gamesAmong(teamId, new Set(clusterIds), matches)) {
    for (const e of s.events) {
      if (e.type !== 'pa' || e.side !== me || s.g.ann[e.id]?.ignored || !e.outcome) continue;
      if (!['BB', 'IBB', 'HBP', 'SF', 'SH'].includes(e.outcome)) ab++;
      if (['1B', '2B', '3B', 'HR'].includes(e.outcome)) h++;
    }
  }
  return ab > 0 ? h / ab : 0;
}
