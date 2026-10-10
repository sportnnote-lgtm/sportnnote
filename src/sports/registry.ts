/**
 * Sport registry — the ONLY place the core couples to concrete sports.
 * To add a sport: implement a SportPlugin and add it to this map. Done.
 */
import type { SportId } from '../core/types';
import type { SportPlugin } from './types';
import { setStandingsPointsProvider, setStandingsRateProvider, setStandingsScoreProvider, setStandingsUnitsProvider } from '../data/standings';
import { footballPlugin } from './football';
import { cricketPlugin } from './cricket';
import { basketballPlugin } from './basketball';
import { badmintonPlugin } from './badminton';
import { tennisPlugin } from './tennis';
import { volleyballPlugin } from './volleyball';
import { kabaddiPlugin } from './kabaddi';
import { pickleballPlugin } from './pickleball';
import { padelPlugin } from './padel';
import { squashPlugin } from './squash';
import { tableTennisPlugin } from './tabletennis';
import { chessPlugin } from './chess';
import { carromPlugin } from './carrom';
import { golfPlugin } from './golf';
import { STAT_SCHEMAS } from './statSchemas';

export const SPORTS: Record<SportId, SportPlugin<any>> = {
  football: footballPlugin,
  cricket: cricketPlugin,
  basketball: basketballPlugin,
  badminton: badmintonPlugin,
  tennis: tennisPlugin,
  volleyball: volleyballPlugin,
  kabaddi: kabaddiPlugin,
  pickleball: pickleballPlugin,
  padel: padelPlugin,
  squash: squashPlugin,
  tabletennis: tableTennisPlugin,
  chess: chessPlugin,
  carrom: carromPlugin,
  golf: golfPlugin,
};

// SD-15: every plugin carries its stat schema (defined next to the plugin in
// `<sport>/stats.ts`, collected RN-free in statSchemas.ts).
for (const id of Object.keys(SPORTS) as SportId[]) SPORTS[id].statSchema = STAT_SCHEMAS[id] as SportPlugin<any>['statSchema'];

export const SPORT_LIST = Object.values(SPORTS);

/** How the two sides of a match are picked, resolved for a concrete format.
 *  'team' = pick two teams; 'individual' = pick two people; 'pairs' = pick two
 *  pairs (doubles). A 'both' sport is decided by its `playersPerSide` value. */
export type ParticipantMode = 'team' | 'individual' | 'pairs';
export function participantMode(sport: SportId, format?: Record<string, unknown>): ParticipantMode {
  const kind = SPORTS[sport].participantKind ?? 'team';
  if (kind === 'team') return 'team';
  if (kind === 'individual') return 'individual';
  // 'both' → Singles (1 player a side) is individual, Doubles (2) is a pair.
  return Number(format?.playersPerSide ?? 1) >= 2 ? 'pairs' : 'individual';
}

// Let the (RN-free) standings engine compute NRR without importing this registry
// — it can't, or the pure test runner would pull in React Native. We inject the
// rate lookup lazily on first use (not at module load, which is fragile under
// circular imports / hot-reload) — by the time a table is ranked, every module
// is fully initialised.
let rateWired = false;
export function getSport(id: SportId): SportPlugin<any> {
  if (!rateWired) {
    rateWired = true;
    // A match closed by hand (parity #04) is charged its full overs when the
    // sport says so (cricket "count in NRR, all overs").
    setStandingsRateProvider((sport, state, manual) => {
      if (state == null) return null;
      const p = SPORTS[sport];
      return (manual && p.manualRate ? p.manualRate(state) : p.standingsRate?.(state)) ?? null;
    });
    setStandingsPointsProvider((sport, state) => (state == null ? null : SPORTS[sport].standingsPoints?.(state) ?? null));
    setStandingsScoreProvider((sport, state) => (state == null ? null : SPORTS[sport].standingsScore?.(state) ?? null));
    // SD-17: sets / games / rally points / fair play for the standings rule kit.
    setStandingsUnitsProvider((sport, state) => (state == null ? null : SPORTS[sport]?.standingsUnits?.(state) ?? null));
  }
  return SPORTS[id];
}
