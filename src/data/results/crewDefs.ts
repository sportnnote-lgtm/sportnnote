/**
 * SD-99 / SD-100 — the boat classes and distances the results engine knows for
 * rowing (World Rowing) and canoe sprint (ICF). No imports, so model.ts can
 * build its discipline catalogue from it and swimming.ts can read split
 * points without a cycle.
 *
 *  - Rowing: 1x, 2x, 2-, 4x, 4-, 4+, 8+ (sculling / sweep, coxed / coxless);
 *    2000 m is the championship distance; 1500 / 1000 / 500 m are offered for
 *    school, junior and masters regattas (World Rowing masters race 1000 m).
 *    Lightweight and para (PR1 / PR2 / PR3) are CATEGORIES of these boats
 *    (category.weightClass), so their records / PBs stay apart.
 *  - Canoe sprint: K1 / K2 / K4 (kayak), C1 / C2 / C4 (canoe) over 200 / 500 /
 *    1000 m, 5000 m optional; women / men / mixed. Slalom, marathon and para
 *    canoe (KL / VL) are out of scope.
 *
 * Keys: 'row.<boat>.<metres>' ('row.8p.2000') and 'cs.<boat>.<metres>'
 * ('cs.k1.500'). Boat codes avoid '+' / '-' so stat keys stay identifiers:
 * 2- = '2m', 4- = '4m', 4+ = '4p', 8+ = '8p'.
 */

export type CrewSport = 'rowing' | 'canoe';

export interface BoatClass {
  code: string;
  /** "1x", "4+", "K2" */
  short: string;
  label: string;
  /** paddlers / rowers in the boat (the cox is extra) */
  seats: number;
  cox: boolean;
  /** rowing: sculling (two oars each) or sweep (one oar) */
  rig?: 'scull' | 'sweep';
}

export const ROW_BOATS: BoatClass[] = [
  { code: '1x', short: '1x', label: 'Single sculls', seats: 1, cox: false, rig: 'scull' },
  { code: '2x', short: '2x', label: 'Double sculls', seats: 2, cox: false, rig: 'scull' },
  { code: '2m', short: '2-', label: 'Pair', seats: 2, cox: false, rig: 'sweep' },
  { code: '4x', short: '4x', label: 'Quadruple sculls', seats: 4, cox: false, rig: 'scull' },
  { code: '4m', short: '4-', label: 'Four', seats: 4, cox: false, rig: 'sweep' },
  { code: '4p', short: '4+', label: 'Coxed four', seats: 4, cox: true, rig: 'sweep' },
  { code: '8p', short: '8+', label: 'Eight', seats: 8, cox: true, rig: 'sweep' },
];

export const CANOE_BOATS: BoatClass[] = [
  { code: 'k1', short: 'K1', label: 'Kayak single', seats: 1, cox: false },
  { code: 'k2', short: 'K2', label: 'Kayak double', seats: 2, cox: false },
  { code: 'k4', short: 'K4', label: 'Kayak four', seats: 4, cox: false },
  { code: 'c1', short: 'C1', label: 'Canoe single', seats: 1, cox: false },
  { code: 'c2', short: 'C2', label: 'Canoe double', seats: 2, cox: false },
  { code: 'c4', short: 'C4', label: 'Canoe four', seats: 4, cox: false },
];

export const ROW_DISTANCES = [2000, 1500, 1000, 500];
export const CANOE_DISTANCES = [200, 500, 1000, 5000];

/** Lanes on the course: World Rowing championship courses have 6 (some 8);
 *  ICF canoe sprint courses have 9. */
export const CREW_LANES: Record<CrewSport, number> = { rowing: 6, canoe: 9 };

export interface CrewEvent { sport: CrewSport; boat: BoatClass; distance: number; key: string; label: string }

const distLabel = (m: number) => (m >= 1000 && m % 1000 === 0 && m > 2000 ? `${m / 1000} km` : `${m} m`);

/** 'row.4p.2000' → the coxed four over 2000 m; null for any other key. */
export function crewEventOf(key: string): CrewEvent | null {
  const m = /^(row|cs)\.([0-9a-z]+)\.(\d+)$/.exec(key);
  if (!m) return null;
  const sport: CrewSport = m[1] === 'row' ? 'rowing' : 'canoe';
  const boat = (sport === 'rowing' ? ROW_BOATS : CANOE_BOATS).find((b) => b.code === m[2]);
  if (!boat) return null;
  const distance = Number(m[3]);
  return { sport, boat, distance, key, label: `${boat.short} ${distLabel(distance)}` };
}

export const crewKey = (sport: CrewSport, boat: string, distance: number) => `${sport === 'rowing' ? 'row' : 'cs'}.${boat}.${distance}`;

/** Every crew discipline in programme order (boat, then distance). */
export const CREW_EVENTS: CrewEvent[] = [
  ...ROW_BOATS.flatMap((b) => ROW_DISTANCES.map((d) => crewEventOf(crewKey('rowing', b.code, d))!)),
  ...CANOE_BOATS.flatMap((b) => CANOE_DISTANCES.map((d) => crewEventOf(crewKey('canoe', b.code, d))!)),
];

/** Crew size on a start list: rowers / paddlers plus the cox. */
export const crewSize = (b: BoatClass) => b.seats + (b.cox ? 1 : 0);

/**
 * Seat names, bow to stern. Rowing (World Rowing usage): bow, 2, 3 …, stroke,
 * then the cox; a single is the sculler. Canoe sprint: seat 1 is the front
 * (the pace-setter) — "Seat 1" … "Seat 4".
 */
export function seatNames(e: Pick<CrewEvent, 'sport' | 'boat'>): string[] {
  const n = e.boat.seats;
  if (e.sport === 'canoe') return n === 1 ? ['Paddler'] : Array.from({ length: n }, (_, i) => `Seat ${i + 1}`);
  const rowers = n === 1 ? ['Sculler'] : Array.from({ length: n }, (_, i) => (i === 0 ? 'Bow' : i === n - 1 ? 'Stroke' : String(i + 1)));
  return e.boat.cox ? [...rowers, 'Cox'] : rowers;
}

/**
 * Where intermediate times are read (optional — a meet turns them on): rowing
 * every 500 m (World Rowing results show 500 / 1000 / 1500 m), a 500 m race at
 * 250 m; canoe sprint at 250 m intervals over 500 / 1000 m, halfway over 200 m,
 * every 1000 m over 5000 m.
 */
export function crewSplitDistances(key: string): number[] {
  const e = crewEventOf(key);
  if (!e) return [];
  const step = e.sport === 'rowing' ? (e.distance <= 500 ? 250 : 500) : e.distance <= 200 ? 100 : e.distance >= 5000 ? 1000 : 250;
  const out: number[] = [];
  for (let d = step; d < e.distance; d += step) out.push(d);
  return out;
}

/**
 * The fast end of the usual range per boat at its standard distance (seconds),
 * just under the senior men's world best time (World Rowing best times for
 * 2000 m; ICF K1 / C1 bests). Other boats / distances scale from these.
 */
export const ROW_BEST_2000: Record<string, number> = { '1x': 385, '2x': 355, '2m': 362, '4x': 328, '4m': 333, '4p': 355, '8p': 315 };
export const CANOE_BEST_K1: Record<number, number> = { 200: 32.5, 500: 92, 1000: 198, 5000: 1140 };
export const CANOE_BOAT_FACTOR: Record<string, number> = { k1: 1, k2: 0.92, k4: 0.85, c1: 1.1, c2: 1.03, c4: 0.95 };

/** [min, max] seconds for a crew discipline, or null. The slow end is
 *  generous for a school / novice regatta (2.4 × the fast end). */
export function crewRange(key: string): { min: number; max: number } | null {
  const e = crewEventOf(key);
  if (!e) return null;
  let min: number;
  if (e.sport === 'rowing') min = ((ROW_BEST_2000[e.boat.code] ?? 385) * e.distance) / 2000 * (e.distance < 2000 ? 0.97 : 1);
  else min = (CANOE_BEST_K1[e.distance] ?? (e.distance / 1000) * 198) * (CANOE_BOAT_FACTOR[e.boat.code] ?? 1);
  min = Math.floor(min * 10) / 10;
  return { min, max: Math.round(min * 2.4) };
}
