/**
 * SD-96 — the ISSF shooting programme the results engine knows (no imports, so
 * model.ts can build its discipline catalogue from it). Rules as implemented —
 * ISSF General Technical Rules (GTR) and the Rifle / Pistol / Shotgun rules,
 * edition in force from 1 January 2022 (as remembered; see the SD-96 report):
 *
 *  - 10 m Air Rifle: 60 shots, decimal scoring (10.9 a shot), series of 10;
 *    final of 8 — 2 series of 5 shots, then single shots, the last-placed
 *    eliminated after shot 12 and after every 2nd shot after it; shot 24
 *    decides gold and silver.
 *  - 10 m Air Pistol: 60 shots, integer scoring (10 a shot) with inner tens;
 *    the same final format, scored in decimals.
 *  - 10 m mixed team (rifle / pistol): a pair, 30 shots each, team total — the
 *    ISSF medal matches (first to 16) are not built: ranked on the total.
 *  - 50 m Rifle 3 Positions: 3 × 20 shots (kneeling, prone, standing), integer
 *    scoring with inner tens; final of 8 over 45 shots — two eliminated after
 *    shot 40, then one after each shot to 44, shot 45 decides gold.
 *  - 25 m Pistol / 25 m Rapid Fire Pistol: 60 shots in series of 5, integer
 *    scoring with inner tens — the hit-scored finals are not built: the
 *    qualification (match) result is the result.
 *  - Trap / Skeet: rounds of 25 targets, hits — qualification only.
 *
 * Shorter junior / school matches (40, 30, 20 shots …) are offered per event;
 * the category carries the shot count so records / PBs stay per match length.
 */

export type ShotScoring = 'decimal' | 'integer' | 'hits';
export type Gun = 'rifle' | 'pistol' | 'shotgun';
export type Position = 'K' | 'P' | 'S';

export interface ShootFinalDef {
  /** finalists for the standard final */
  finalists: number;
  /** the shot after which each elimination happens (one entry per shooter out,
   *  from the 8th place up) — 10 m: 12, 14 … 22 */
  elims: number[];
  /** the last shot: decides gold and silver */
  last: number;
  /** the first stage, as a hint ("2 series of 5 shots") */
  stage: string;
}

export interface ShootEventDef {
  key: string;
  label: string;
  short: string;
  gun: Gun;
  /** how a qualification shot is scored */
  scoring: ShotScoring;
  /** the standard qualification (match) length */
  shots: number;
  /** shots per series as entered (10; 25 m pistol 5; shotgun rounds 25) */
  seriesOf: number;
  /** shorter matches offered (junior / youth / school) */
  shotOptions: number[];
  /** 3 positions: the order of the positions in the match */
  positions?: Position[];
  final?: ShootFinalDef;
  /** a team of N (mixed team: a man and a woman) */
  teamSize?: number;
  /** rule references for the sheet */
  rules: string;
}

const AIR_FINAL: ShootFinalDef = { finalists: 8, elims: [12, 14, 16, 18, 20, 22], last: 24, stage: '2 series of 5 shots, then single shots' };
const R3P_FINAL: ShootFinalDef = { finalists: 8, elims: [40, 40, 41, 42, 43, 44], last: 45, stage: '3 × 5 kneeling, 3 × 5 prone, 2 × 5 standing, then single shots' };

export const SHOOT_EVENTS: ShootEventDef[] = [
  { key: 'shoot.10mar', label: '10 m Air Rifle', short: '10m AR', gun: 'rifle', scoring: 'decimal', shots: 60, seriesOf: 10, shotOptions: [60, 40, 30, 20], final: AIR_FINAL, rules: 'ISSF Rifle rules · decimal scoring' },
  { key: 'shoot.10map', label: '10 m Air Pistol', short: '10m AP', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 10, shotOptions: [60, 40, 30, 20], final: AIR_FINAL, rules: 'ISSF Pistol rules · integer scoring, inner tens' },
  { key: 'shoot.50m3p', label: '50 m Rifle 3 Positions', short: '50m 3P', gun: 'rifle', scoring: 'integer', shots: 60, seriesOf: 10, shotOptions: [60, 30], positions: ['K', 'P', 'S'], final: R3P_FINAL, rules: 'ISSF Rifle rules · 3 × 20 kneeling, prone, standing' },
  { key: 'shoot.25mp', label: '25 m Pistol', short: '25m P', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 5, shotOptions: [60, 30], rules: 'ISSF Pistol rules · precision + rapid stages, series of 5' },
  { key: 'shoot.25mrf', label: '25 m Rapid Fire Pistol', short: '25m RF', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 5, shotOptions: [60, 30], rules: 'ISSF Pistol rules · series of 5 in 8 / 6 / 4 s' },
  { key: 'shoot.10marx', label: '10 m Air Rifle Mixed Team', short: '10m AR MT', gun: 'rifle', scoring: 'decimal', shots: 60, seriesOf: 10, shotOptions: [60, 40], teamSize: 2, rules: 'ISSF Rifle rules · 30 shots each, team total' },
  { key: 'shoot.10mapx', label: '10 m Air Pistol Mixed Team', short: '10m AP MT', gun: 'pistol', scoring: 'integer', shots: 60, seriesOf: 10, shotOptions: [60, 40], teamSize: 2, rules: 'ISSF Pistol rules · 30 shots each, team total' },
  { key: 'shoot.trap', label: 'Trap', short: 'Trap', gun: 'shotgun', scoring: 'hits', shots: 125, seriesOf: 25, shotOptions: [125, 75, 50], rules: 'ISSF Shotgun rules · rounds of 25 targets' },
  { key: 'shoot.skeet', label: 'Skeet', short: 'Skeet', gun: 'shotgun', scoring: 'hits', shots: 125, seriesOf: 25, shotOptions: [125, 75, 50], rules: 'ISSF Shotgun rules · rounds of 25 targets' },
];

export const shootEventOf = (key?: string): ShootEventDef | undefined => SHOOT_EVENTS.find((e) => e.key === key);

/** The most a shot / target scores: 10.9 (decimal), 10 (integer), 1 (a hit). */
export const maxShot = (s: ShotScoring): number => (s === 'decimal' ? 10.9 : s === 'hits' ? 1 : 10);

/** Points as integer tenths, so decimal sums compare exactly (10.4 + 10.2 = 20.6, not 20.599…). */
export const tenths = (v: number): number => Math.round(v * 10);
export const sumTenths = (xs: number[]): number => xs.reduce((a, v) => a + tenths(v), 0);
export const fromTenths = (t: number): number => t / 10;

/**
 * The elimination points for a final of `n` (default: the event's finalists).
 * A smaller final (a school final of 6) drops the first eliminations, so it
 * still ends on the same last shot (10 m: 16, 18, 20, 22, then 24).
 */
export function finalSchedule(f: ShootFinalDef, n: number): number[] {
  const need = Math.max(0, n - 2);
  return f.elims.slice(Math.max(0, f.elims.length - need));
}

/** The series count of a match: 60 shots in tens = 6; 25 m in fives = 12; shotgun 125 = 5 rounds. */
export const seriesCount = (ev: ShootEventDef, shots: number): number => Math.ceil(shots / ev.seriesOf);

/** 3 positions: which position a series belongs to (3 × 20: K K P P S S). */
export function positionOf(ev: ShootEventDef, shots: number, seriesIdx: number): Position | undefined {
  if (!ev.positions) return undefined;
  const per = Math.max(1, Math.round(seriesCount(ev, shots) / ev.positions.length));
  return ev.positions[Math.min(ev.positions.length - 1, Math.floor(seriesIdx / per))];
}

export const POSITION_LABEL: Record<Position, string> = { K: 'Kneeling', P: 'Prone', S: 'Standing' };
