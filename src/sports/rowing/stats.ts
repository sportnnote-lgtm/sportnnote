/** SD-99 — rowing's stat schema (see ../statSchema.ts). PURE. Results come
 *  from the results engine; a closed round writes one stat line per rower and
 *  cox (data/results/crews.ts `crewLines`): races, place, the crew's time and
 *  its LEGAL time under `m_row_<boat>_<metres>` (best time per boat class and
 *  distance), finals and A finals reached, medals, the seat or `cox`. The
 *  profile renders the crew career (careerView 'measured'). */
import { crewStats } from '../crewStats.ts';

export const rowingStats = crewStats('rowing');
