/**
 * SD-92 — athletics road running, race walking and cross-country: the
 * disciplines the results engine knows. No imports, so model.ts can build its
 * catalogue (and parse a custom distance) from it.
 *
 * Keys carry the distance in metres, so every distance keeps its own records
 * and PBs:
 *  - 'ath.road.<m>'   road race — World Athletics TR 55 (5 km, 10 km, 15 km,
 *                     half marathon 21.0975 km, marathon 42.195 km, or any
 *                     custom distance);
 *  - 'ath.walk.<m>'   race walk on the road (10 km, 20 km …) and
 *    'ath.walk.t<m>'  race walk on the track (3000 m, 5000 m …) — TR 54;
 *  - 'ath.xc.<m>'     cross-country — TR 56 (distances by age group; courses
 *                     differ, so no records and no PBs).
 *
 * Ranking: the order of finish (TR 55 / 56: placings by the order in which
 * athletes' torsos reach the finish; with chip timing the official time is
 * still the gun time — TR 19.25, from memory). Road and road-walk times are
 * read to the next longer whole second (TR 19.24, races wholly or partly
 * outside the stadium); a track walk to 1/100.
 */

export type RoadKind = 'road' | 'walk' | 'xc';

/** How team places are counted (team scoring by placings). */
export type TeamBasis =
  /** re-placed among the runners of complete teams: individuals and incomplete
   *  teams are taken out, a team's non-scoring runners (5th, 6th …) still take
   *  a place and push other teams' scorers back ("displace") — the usual
   *  school / NFHS / NCAA cross-country rule (from memory) */
  | 'teams'
  /** the overall finishing place, everyone counted (World Athletics Cross
   *  Country Championships team scoring, from memory) */
  | 'overall'
  /** re-placed among scoring runners only — non-scorers don't displace */
  | 'scorers';

export interface TeamScoring {
  /** the first N finishers of a team score (World XC senior 6, U20 4; schools 3 or 4) */
  scorers: number;
  /** a team's runners: the first M of the team to finish count as the team
   *  (6 is usual); later finishers from the same house run as individuals */
  size?: number;
  basis: TeamBasis;
  /** team places get the meet's position points / medals too (default on) */
  points?: boolean;
}

/** What `PhaseFormat.road` holds for a road / walk / cross-country race. */
export interface RoadFormat {
  kind: RoadKind;
  /** road / walk: the course is measured and certified (a World Athletics /
   *  AIMS A- or B-grade measurer, TR 55.2 / CR 31) — only then can a time set
   *  a meet / school record. PBs count on any course. */
  certified?: boolean;
  /** which clock the times are: 'gun' (official, TR 19.25) or 'chip' (net) */
  timing?: 'gun' | 'chip';
  /** team scoring by placings (XC and road) */
  team?: TeamScoring;
  /** race walks: the Penalty Zone rule (TR 54.7.3–54.7.4, from memory) — 3
   *  red cards send the walker to the penalty zone, the 4th disqualifies.
   *  Off = 3 red cards from different judges disqualify (TR 54.7.1). */
  penaltyZone?: boolean;
}

export interface RoadEvent { key: string; kind: RoadKind; metres: number; track: boolean; label: string; short: string }

export const HALF = 21097.5;
export const MARATHON = 42195;

/** The standard road distances (TR 55.1 lists 5 km … marathon). */
export const ROAD_METRES = [5000, 10000, 15000, HALF, MARATHON];
/** Race walks: road 10 / 20 km (35 km at senior level), track 3000 / 5000 m (school / U18). */
export const WALK_ROAD_METRES = [5000, 10000, 20000];
export const WALK_TRACK_METRES = [3000, 5000, 10000];

const km = (m: number) => {
  const v = m / 1000;
  return `${Number.isInteger(v) ? v : v.toFixed(v * 10 === Math.round(v * 10) ? 1 : 2)} km`;
};
/** The key's distance as written in the key ('21097.5' → '21097_5' never — dots stay out of keys) */
const mKey = (m: number) => (m === HALF ? 'hm' : m === MARATHON ? 'mar' : String(Math.round(m)));

export const roadKey = (kind: RoadKind, metres: number, track = false): string =>
  `ath.${kind}.${kind === 'walk' && track ? 't' : ''}${mKey(metres)}`;

/** Parse 'ath.road.10000', 'ath.road.hm', 'ath.walk.t3000', 'ath.xc.4000' (null for anything else). */
export function roadEventOf(key?: string | null): RoadEvent | null {
  const m = /^ath\.(road|walk|xc)\.(t?)(hm|mar|\d{3,6})$/.exec(key ?? '');
  if (!m) return null;
  const kind = m[1] as RoadKind;
  const track = m[2] === 't';
  if (track && kind !== 'walk') return null;
  const metres = m[3] === 'hm' ? HALF : m[3] === 'mar' ? MARATHON : Number(m[3]);
  if (!(metres >= 400 && metres <= 100000)) return null;
  if (kind !== 'road' && (m[3] === 'hm' || m[3] === 'mar')) return null;
  const label = kind === 'road'
    ? (metres === HALF ? 'Half marathon' : metres === MARATHON ? 'Marathon' : `${km(metres)} road race`)
    : kind === 'walk'
      ? (track ? `${metres} m race walk` : `${km(metres)} race walk`)
      : `Cross-country ${km(metres)}`;
  const short = kind === 'road' ? (metres === HALF ? 'Half marathon' : metres === MARATHON ? 'Marathon' : `Road ${km(metres)}`) : kind === 'walk' ? (track ? `Walk ${metres} m` : `Walk ${km(metres)}`) : `XC ${km(metres)}`;
  return { key: key!, kind, metres, track, label, short };
}

export const isRoadKey = (key?: string | null): boolean => !!roadEventOf(key);

/** The standard road / walk events (listed in the catalogue; custom distances are parsed on demand). */
export const ROAD_EVENTS: RoadEvent[] = [
  ...ROAD_METRES.map((m) => roadEventOf(roadKey('road', m))!),
  ...WALK_TRACK_METRES.map((m) => roadEventOf(roadKey('walk', m, true))!),
  ...WALK_ROAD_METRES.map((m) => roadEventOf(roadKey('walk', m))!),
];

/* ------------------------------ cross-country ------------------------------ */

/**
 * Cross-country distances by age group (metres). Seniors / U20 / U18 follow the
 * World Athletics Cross Country Championships pattern (from memory: senior
 * 10 km, U20 men 8 km / women 6 km; U18 boys 6 km / girls 4 km — TR 56 only
 * says "about"). U10–U16 are the usual school presets (a house choice — the
 * school board / association sets them).
 */
export function xcDistance(age?: string, gender?: 'M' | 'F' | 'X'): number {
  const girls = gender === 'F';
  switch (age) {
    case 'U10': return 1000;
    case 'U12': return 2000;
    case 'U14': return girls ? 2000 : 3000;
    case 'U16': return girls ? 3000 : 4000;
    case 'U18': return girls ? 4000 : 6000;
    case 'U20': return girls ? 6000 : 8000;
    default: return 10000;
  }
}
/** The distance chips the setup offers for cross-country. */
export const XC_METRES = [1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000];

/** The usual team scoring: school 3 or 4 of 6; World XC senior 6 of 6, U20 4 of 6 (from memory). */
export function defaultTeamScoring(age?: string): TeamScoring {
  const school = ['U10', 'U12', 'U14', 'U16'].includes(age ?? '');
  return { scorers: school ? 4 : age === 'U18' || age === 'U20' ? 4 : 6, size: 6, basis: 'teams', points: true };
}

/* --------------------------------- ranges ---------------------------------- */

/**
 * [min, max] seconds for a road / walk / XC time — the fast end just under
 * the senior world best pace (road 5–10 km ≈ 2:30 /km, half ≈ 2:40 /km,
 * marathon ≈ 2:50 /km; walks ≈ 3:25 /km short, 3:45 /km 10–20 km), the slow
 * end generous for a school race (U10–U12 15–17 min /km, older 12–15 min /km).
 * Cross-country courses vary, so the same pace band as the road.
 */
export function roadRange(key: string, age?: string): { min: number; max: number } | null {
  const e = roadEventOf(key);
  if (!e) return null;
  const k = e.metres / 1000;
  const young = age === 'U10' || age === 'U12';
  if (e.kind === 'walk') return { min: Math.floor(k * (e.metres <= 5000 ? 205 : 225)), max: Math.ceil(k * (young ? 1020 : 900)) };
  const fast = e.metres > 30000 ? 170 : e.metres > 12000 ? 160 : 150;
  return { min: Math.floor(k * fast), max: Math.ceil(k * (young ? 1000 : 900)) };
}

/* -------------------------------- race walks -------------------------------- */

/** Red cards that disqualify (TR 54.7.1: three from different judges; with the Penalty Zone rule, four). */
export const dqCards = (penaltyZone?: boolean): number => (penaltyZone ? 4 : 3);

/** The Penalty Zone time for the distance (TR 54.7.3 table, from memory): ≤ 5 km 0.5 min, 10 km 1 min, 20 km 2 min, 35 km 3.5 min. */
export function penaltyMinutes(metres: number): number {
  if (metres <= 5000) return 0.5;
  if (metres <= 10000) return 1;
  if (metres <= 20000) return 2;
  if (metres <= 30000) return 3;
  if (metres <= 35000) return 3.5;
  return 5;
}
