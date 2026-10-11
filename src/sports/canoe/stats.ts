/** SD-100 — canoe sprint's stat schema (see ../statSchema.ts). PURE. One line
 *  per paddler for every closed round (data/results/crews.ts `crewLines`):
 *  races, place, the boat's time and its LEGAL time under `m_cs_<boat>_<metres>`
 *  (best time per boat — K1 … C4 — and distance), finals and A finals reached,
 *  medals and the seat. The profile renders the crew career. */
import { crewStats } from '../crewStats.ts';

export const canoeStats = crewStats('canoe');
