/**
 * SD-98 — the cycling events the results engine knows (UCI Regulations Part 2
 * road, Part 3 track). No imports, so model.ts can build its discipline
 * catalogue from it.
 *
 *  Road
 *   - 'cyc.itt.<km>'  individual time trial (riders start alone at intervals,
 *                     ranked on time to 1/100, a photo-finish / transponder
 *                     reading to 1/1000 separates equal times);
 *   - 'cyc.rr'        road race, mass start: ranked by the order on the line;
 *                     riders finishing in a group get the group's time ("s.t.");
 *   - 'cyc.stage'     a stage race: one phase per stage, the general
 *                     classification (GC) by cumulative time.
 *  Track (250 m velodrome; times to 1/1000)
 *   - 'cyc.ip.<m>'    individual pursuit — qualifying, then the two fastest race
 *                     for gold, 3rd and 4th for bronze;
 *   - 'cyc.tt.<m>'    time trial (500 m / 1000 m "kilo");
 *   - 'cyc.sprint'    sprint — flying 200 m qualifying time, then a seeded
 *                     bracket of matches (best of three heats);
 *   - 'cyc.keirin'    keirin — heats, then a final, by finish order;
 *   - 'cyc.scratch'   scratch race — first over the line (laps gained count first);
 *   - 'cyc.points'    points race — sprints every N laps (5-3-2-1, double in the
 *                     final sprint), ±20 for a lap gained / lost;
 *   - 'cyc.elim'      elimination race — the last rider every 2 laps is out.
 */

export type CycKind = 'itt' | 'rr' | 'stage' | 'ip' | 'tt' | 'sprint' | 'keirin' | 'scratch' | 'points' | 'elim' | 'tp' | 'ts';
export type CycSetting = 'road' | 'track';

export interface CycEvent {
  key: string;
  kind: CycKind;
  setting: CycSetting;
  label: string;
  /** short chip label ("ITT 10 km", "IP 4000 m") */
  short: string;
  /** metres (timed events with a fixed distance) */
  metres?: number;
  /** timed against the clock (one mark per rider, records / PBs) */
  timed: boolean;
  /** SD-137b: a team event — riders per team (team pursuit 4, team sprint 3) */
  riders?: number;
}

export const ITT_KM = [5, 10, 15, 20, 25, 30, 40];
export const IP_METRES = [2000, 3000, 4000];
export const TT_METRES = [500, 1000];

const itt = (km: number): CycEvent => ({ key: `cyc.itt.${km}`, kind: 'itt', setting: 'road', label: `Individual time trial ${km} km`, short: `ITT ${km} km`, metres: km * 1000, timed: true });
const ip = (m: number): CycEvent => ({ key: `cyc.ip.${m}`, kind: 'ip', setting: 'track', label: `Individual pursuit ${m} m`, short: `Pursuit ${m} m`, metres: m, timed: true });
const tt = (m: number): CycEvent => ({ key: `cyc.tt.${m}`, kind: 'tt', setting: 'track', label: `Time trial ${m} m`, short: m === 1000 ? 'Kilo (1000 m)' : `TT ${m} m`, metres: m, timed: true });

export const CYC_EVENTS: CycEvent[] = [
  ...ITT_KM.map(itt),
  { key: 'cyc.rr', kind: 'rr', setting: 'road', label: 'Road race', short: 'Road race', timed: false },
  { key: 'cyc.stage', kind: 'stage', setting: 'road', label: 'Stage race', short: 'Stage race (GC)', timed: false },
  ...IP_METRES.map(ip),
  ...TT_METRES.map(tt),
  { key: 'cyc.sprint', kind: 'sprint', setting: 'track', label: 'Sprint', short: 'Sprint', metres: 200, timed: true },
  { key: 'cyc.keirin', kind: 'keirin', setting: 'track', label: 'Keirin', short: 'Keirin', timed: false },
  { key: 'cyc.scratch', kind: 'scratch', setting: 'track', label: 'Scratch race', short: 'Scratch', timed: false },
  { key: 'cyc.points', kind: 'points', setting: 'track', label: 'Points race', short: 'Points race', timed: false },
  { key: 'cyc.elim', kind: 'elim', setting: 'track', label: 'Elimination race', short: 'Elimination', timed: false },
];

/**
 * SD-137b — UCI track team events (Part 3, as remembered — verify):
 *  - team pursuit: 4 riders from a standing start on opposite sides of the
 *    track, 4000 m (elite, U23, junior men and women); the time is taken on the
 *    third rider's front wheel; qualifying on time, then the two fastest teams
 *    race for gold and 3rd–4th for bronze; a team that is caught (the other
 *    team reaches its third rider) loses the race. 3000 m is offered as a
 *    school / youth distance (a house choice).
 *  - team sprint: 3 riders, 3 laps of a 250 m track (750 m), each leading one
 *    lap and pulling off; the time is taken on the last rider; qualifying, then
 *    finals for gold and bronze.
 * The UCI's first round (1st v 4th, 2nd v 3rd … deciding who rides for gold)
 * is not built: qualifying goes straight to the finals.
 */
export const CYC_TEAM_EVENTS: CycEvent[] = [
  { key: 'cyc.tp.4000', kind: 'tp', setting: 'track', label: 'Team pursuit 4000 m', short: 'Team pursuit 4000 m', metres: 4000, timed: true, riders: 4 },
  { key: 'cyc.tp.3000', kind: 'tp', setting: 'track', label: 'Team pursuit 3000 m', short: 'Team pursuit 3000 m', metres: 3000, timed: true, riders: 4 },
  { key: 'cyc.ts.750', kind: 'ts', setting: 'track', label: 'Team sprint', short: 'Team sprint 750 m', metres: 750, timed: true, riders: 3 },
];

export const cycEventOf = (key?: string | null): CycEvent | undefined => CYC_EVENTS.find((e) => e.key === key) ?? CYC_TEAM_EVENTS.find((e) => e.key === key);
/** SD-137b: team pursuit / team sprint. */
export const isCycTeamKind = (k?: CycKind | null): boolean => k === 'tp' || k === 'ts';
/** Pursuit-style rounds: qualifying on time, then finals for gold and bronze (a catch ends a pursuit). */
export const isPursuitKind = (k?: CycKind | null): boolean => k === 'ip' || k === 'tp';
export const isCycKey = (key?: string | null): boolean => !!key && key.startsWith('cyc.');
export const cycKind = (key?: string | null): CycKind | undefined => cycEventOf(key)?.kind;

/** Events ranked by the order on the line (or points) rather than a time. */
export const ORDER_KINDS: CycKind[] = ['rr', 'stage', 'keirin', 'scratch', 'points', 'elim'];
export const isOrderKind = (k?: CycKind): boolean => !!k && ORDER_KINDS.includes(k);

/* ------------------------------- points race ------------------------------- */

/** UCI points race: 5-3-2-1 at every intermediate sprint, double (10-6-4-2) at the final sprint. */
export const SPRINT_POINTS = [5, 3, 2, 1];
/** UCI points race (and omnium): +20 for gaining a lap on the main field, −20 for losing one. */
export const LAP_POINTS = 20;

/** Points for `place` (1-based) in sprint `n` of `total` (the last sprint is the finish, double).
 *  SD-141: `table` / `double` = the meet's points per sprint and final-sprint rule (competitionRules.ts). */
export const sprintPoints = (place: number | undefined, n: number, total: number, table: number[] = SPRINT_POINTS, double = true): number =>
  place == null || place < 1 ? 0 : (table[place - 1] ?? 0) * (n === total && double ? 2 : 1);

/* --------------------------------- ranges ---------------------------------- */

/**
 * [min, max] seconds for a timed event — the fast end just under the elite
 * world record / best (flying 200 m ≈ 9.1 s, kilo ≈ 55.4 s, 500 m ≈ 32.3 s,
 * 4000 m IP ≈ 3:59.6), the slow end generous enough for a school / club
 * velodrome or a U14 time trial (~18 km/h). Road ITT: 60 s per km (60 km/h) to
 * 200 s per km (18 km/h). Order events (road race, keirin, scratch …) have none.
 */
export function cycRange(key: string): { min: number; max: number } | null {
  const e = cycEventOf(key);
  if (!e || !e.timed) return null;
  if (e.kind === 'itt') { const km = (e.metres ?? 0) / 1000; return { min: km * 60, max: km * 200 }; }
  if (e.kind === 'sprint') return { min: 9, max: 20 };
  if (e.kind === 'tt') return e.metres === 1000 ? { min: 55, max: 120 } : { min: 32, max: 75 };
  if (e.kind === 'ip') return e.metres === 4000 ? { min: 238, max: 480 } : e.metres === 3000 ? { min: 180, max: 390 } : { min: 120, max: 270 };
  // SD-137b: team pursuit (4000 m elite world best ≈ 3:40) / team sprint (750 m ≈ 41 s)
  if (e.kind === 'tp') return e.metres === 4000 ? { min: 218, max: 420 } : { min: 163, max: 330 };
  if (e.kind === 'ts') return { min: 40, max: 75 };
  return null;
}

/* ------------------------------- phase names -------------------------------- */

/** SD-98: "Stage 2", "Qualifying (flying 200 m)", "Match play", "Finals" — null = the usual phase label. */
export function cycPhaseName(f: { discipline: string; phase: string; plan?: { phase: string }[]; phaseNo?: number; races?: string[] }): string | null {
  const kind = cycKind(f.discipline);
  if (!kind) return null;
  if (kind === 'stage') return f.phaseNo ? `Stage ${f.phaseNo}` : 'Stage';
  const multi = (f.plan?.length ?? 1) > 1;
  if (kind === 'sprint' && multi) return f.phase === 'qualification' ? 'Qualifying (flying 200 m)' : 'Match play';
  if ((kind === 'ip' || kind === 'tt' || kind === 'tp' || kind === 'ts') && multi) return f.phase === 'qualification' ? 'Qualifying' : 'Finals (gold / bronze)';
  return null;
}
