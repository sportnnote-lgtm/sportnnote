/**
 * Sport registry — the ONLY place the core couples to concrete sports.
 * To add a sport: implement a SportPlugin and add it to this map. Done.
 */
import type { SportId } from '../core/types';
import type { SportPlugin } from './types';
import { setStandingsRateProvider } from '../data/standings';
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
};

export const SPORT_LIST = Object.values(SPORTS);

// Let the (RN-free) standings engine compute NRR without importing this registry
// — it can't, or the pure test runner would pull in React Native. We inject the
// rate lookup lazily on first use (not at module load, which is fragile under
// circular imports / hot-reload) — by the time a table is ranked, every module
// is fully initialised.
let rateWired = false;
export function getSport(id: SportId): SportPlugin<any> {
  if (!rateWired) {
    rateWired = true;
    setStandingsRateProvider((sport, state) => (state == null ? null : SPORTS[sport].standingsRate?.(state) ?? null));
  }
  return SPORTS[id];
}
