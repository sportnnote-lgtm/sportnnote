/**
 * Sport registry — the ONLY place the core couples to concrete sports.
 * To add a sport: implement a SportPlugin and add it to this map. Done.
 */
import type { SportId } from '../core/types';
import type { SportPlugin } from './types';
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

export function getSport(id: SportId): SportPlugin<any> {
  return SPORTS[id];
}
