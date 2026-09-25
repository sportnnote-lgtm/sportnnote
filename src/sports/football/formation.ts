/** Football formation templates. x: 0(left)→1(right); y: 0(own goal)→1(attack).
 *  Slots are listed in a stable order so a saved XI can be re-laid onto another
 *  formation by index, preserving player assignments. */
import type { LineupSlot } from '../../core/types';

type Slot = Omit<LineupSlot, 'playerId' | 'playerName'>;

const F_433: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'LB', x: 0.15, y: 0.28 },
  { position: 'CB', x: 0.38, y: 0.24 },
  { position: 'CB', x: 0.62, y: 0.24 },
  { position: 'RB', x: 0.85, y: 0.28 },
  { position: 'CM', x: 0.27, y: 0.52 },
  { position: 'CM', x: 0.5, y: 0.48 },
  { position: 'CM', x: 0.73, y: 0.52 },
  { position: 'LW', x: 0.2, y: 0.82 },
  { position: 'ST', x: 0.5, y: 0.86 },
  { position: 'RW', x: 0.8, y: 0.82 },
];

const F_4231: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'LB', x: 0.15, y: 0.26 },
  { position: 'CB', x: 0.38, y: 0.22 },
  { position: 'CB', x: 0.62, y: 0.22 },
  { position: 'RB', x: 0.85, y: 0.26 },
  { position: 'CDM', x: 0.38, y: 0.46 },
  { position: 'CDM', x: 0.62, y: 0.46 },
  { position: 'LW', x: 0.2, y: 0.68 },
  { position: 'CAM', x: 0.5, y: 0.64 },
  { position: 'RW', x: 0.8, y: 0.68 },
  { position: 'ST', x: 0.5, y: 0.88 },
];

const F_442: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'LB', x: 0.15, y: 0.28 },
  { position: 'CB', x: 0.38, y: 0.24 },
  { position: 'CB', x: 0.62, y: 0.24 },
  { position: 'RB', x: 0.85, y: 0.28 },
  { position: 'LM', x: 0.18, y: 0.56 },
  { position: 'CM', x: 0.4, y: 0.52 },
  { position: 'CM', x: 0.6, y: 0.52 },
  { position: 'RM', x: 0.82, y: 0.56 },
  { position: 'ST', x: 0.4, y: 0.85 },
  { position: 'ST', x: 0.6, y: 0.85 },
];

const F_352: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.3, y: 0.22 },
  { position: 'CB', x: 0.5, y: 0.2 },
  { position: 'CB', x: 0.7, y: 0.22 },
  { position: 'LM', x: 0.12, y: 0.5 },
  { position: 'CM', x: 0.35, y: 0.54 },
  { position: 'CM', x: 0.5, y: 0.48 },
  { position: 'CM', x: 0.65, y: 0.54 },
  { position: 'RM', x: 0.88, y: 0.5 },
  { position: 'ST', x: 0.4, y: 0.85 },
  { position: 'ST', x: 0.6, y: 0.85 },
];

const F_343: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.3, y: 0.22 },
  { position: 'CB', x: 0.5, y: 0.2 },
  { position: 'CB', x: 0.7, y: 0.22 },
  { position: 'LM', x: 0.14, y: 0.5 },
  { position: 'CM', x: 0.4, y: 0.5 },
  { position: 'CM', x: 0.6, y: 0.5 },
  { position: 'RM', x: 0.86, y: 0.5 },
  { position: 'LW', x: 0.2, y: 0.82 },
  { position: 'ST', x: 0.5, y: 0.86 },
  { position: 'RW', x: 0.8, y: 0.82 },
];

const F_3421: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.3, y: 0.22 },
  { position: 'CB', x: 0.5, y: 0.2 },
  { position: 'CB', x: 0.7, y: 0.22 },
  { position: 'LM', x: 0.12, y: 0.48 },
  { position: 'CM', x: 0.4, y: 0.5 },
  { position: 'CM', x: 0.6, y: 0.5 },
  { position: 'RM', x: 0.88, y: 0.48 },
  { position: 'CAM', x: 0.38, y: 0.7 },
  { position: 'CAM', x: 0.62, y: 0.7 },
  { position: 'ST', x: 0.5, y: 0.88 },
];

const F_532: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'LB', x: 0.1, y: 0.32 },
  { position: 'CB', x: 0.3, y: 0.24 },
  { position: 'CB', x: 0.5, y: 0.22 },
  { position: 'CB', x: 0.7, y: 0.24 },
  { position: 'RB', x: 0.9, y: 0.32 },
  { position: 'CM', x: 0.35, y: 0.55 },
  { position: 'CM', x: 0.5, y: 0.5 },
  { position: 'CM', x: 0.65, y: 0.55 },
  { position: 'ST', x: 0.4, y: 0.85 },
  { position: 'ST', x: 0.6, y: 0.85 },
];

const F_4141: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'LB', x: 0.15, y: 0.26 },
  { position: 'CB', x: 0.38, y: 0.22 },
  { position: 'CB', x: 0.62, y: 0.22 },
  { position: 'RB', x: 0.85, y: 0.26 },
  { position: 'CDM', x: 0.5, y: 0.42 },
  { position: 'LM', x: 0.18, y: 0.62 },
  { position: 'CM', x: 0.4, y: 0.6 },
  { position: 'CM', x: 0.6, y: 0.6 },
  { position: 'RM', x: 0.82, y: 0.62 },
  { position: 'ST', x: 0.5, y: 0.88 },
];

const F_4123: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'LB', x: 0.15, y: 0.26 },
  { position: 'CB', x: 0.38, y: 0.22 },
  { position: 'CB', x: 0.62, y: 0.22 },
  { position: 'RB', x: 0.85, y: 0.26 },
  { position: 'CDM', x: 0.5, y: 0.42 },
  { position: 'CM', x: 0.35, y: 0.58 },
  { position: 'CM', x: 0.65, y: 0.58 },
  { position: 'LW', x: 0.2, y: 0.82 },
  { position: 'ST', x: 0.5, y: 0.86 },
  { position: 'RW', x: 0.8, y: 0.82 },
];

const F_4132: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'LB', x: 0.15, y: 0.28 },
  { position: 'CB', x: 0.38, y: 0.24 },
  { position: 'CB', x: 0.62, y: 0.24 },
  { position: 'RB', x: 0.85, y: 0.28 },
  { position: 'CDM', x: 0.5, y: 0.44 },
  { position: 'LM', x: 0.2, y: 0.64 },
  { position: 'CAM', x: 0.5, y: 0.66 },
  { position: 'RM', x: 0.8, y: 0.64 },
  { position: 'ST', x: 0.4, y: 0.88 },
  { position: 'ST', x: 0.6, y: 0.88 },
];

/** All selectable 11-a-side formations, keyed by their conventional label. */
export const FORMATIONS: Record<string, Slot[]> = {
  '4-3-3': F_433,
  '4-1-2-3': F_4123,
  '4-1-3-2': F_4132,
  '4-2-3-1': F_4231,
  '4-4-2': F_442,
  '4-1-4-1': F_4141,
  '3-5-2': F_352,
  '3-4-3': F_343,
  '3-4-2-1': F_3421,
  '5-3-2': F_532,
};

// ---- Small-sided formations ------------------------------------------------
// 7-a-side (GK + 6). Labels are outfield lines back→front.
const F7_231: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.34, y: 0.26 }, { position: 'CB', x: 0.66, y: 0.26 },
  { position: 'LM', x: 0.2, y: 0.52 }, { position: 'CM', x: 0.5, y: 0.5 }, { position: 'RM', x: 0.8, y: 0.52 },
  { position: 'ST', x: 0.5, y: 0.86 },
];
const F7_321: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.25, y: 0.26 }, { position: 'CB', x: 0.5, y: 0.24 }, { position: 'CB', x: 0.75, y: 0.26 },
  { position: 'CM', x: 0.35, y: 0.54 }, { position: 'CM', x: 0.65, y: 0.54 },
  { position: 'ST', x: 0.5, y: 0.86 },
];
const F7_312: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.25, y: 0.26 }, { position: 'CB', x: 0.5, y: 0.24 }, { position: 'CB', x: 0.75, y: 0.26 },
  { position: 'CM', x: 0.5, y: 0.52 },
  { position: 'ST', x: 0.38, y: 0.85 }, { position: 'ST', x: 0.62, y: 0.85 },
];
const F7_222: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.35, y: 0.26 }, { position: 'CB', x: 0.65, y: 0.26 },
  { position: 'CM', x: 0.35, y: 0.52 }, { position: 'CM', x: 0.65, y: 0.52 },
  { position: 'ST', x: 0.38, y: 0.85 }, { position: 'ST', x: 0.62, y: 0.85 },
];
// 5-a-side / futsal (GK + 4).
const F5_121: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.5, y: 0.28 },
  { position: 'CM', x: 0.3, y: 0.54 }, { position: 'CM', x: 0.7, y: 0.54 },
  { position: 'ST', x: 0.5, y: 0.85 },
];
const F5_22: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.35, y: 0.3 }, { position: 'CB', x: 0.65, y: 0.3 },
  { position: 'ST', x: 0.35, y: 0.8 }, { position: 'ST', x: 0.65, y: 0.8 },
];
const F5_211: Slot[] = [
  { position: 'GK', x: 0.5, y: 0.06 },
  { position: 'CB', x: 0.35, y: 0.28 }, { position: 'CB', x: 0.65, y: 0.28 },
  { position: 'CM', x: 0.5, y: 0.55 },
  { position: 'ST', x: 0.5, y: 0.85 },
];

const FORMATIONS_7: Record<string, Slot[]> = { '2-3-1': F7_231, '3-2-1': F7_321, '3-1-2': F7_312, '2-2-2': F7_222 };
const FORMATIONS_5: Record<string, Slot[]> = { '1-2-1': F5_121, '2-2': F5_22, '2-1-1': F5_211 };

/** Which formation set applies for a given players-per-side (5-a-side, 7-a-side,
 *  or full 11). Non-standard sizes snap to the nearest supported set. */
function sizeKey(perSide?: number): 5 | 7 | 11 {
  const n = Number(perSide ?? 11);
  if (n <= 5) return 5;
  if (n <= 8) return 7;
  return 11;
}
export function formationsForSize(perSide?: number): Record<string, Slot[]> {
  const k = sizeKey(perSide);
  return k === 5 ? FORMATIONS_5 : k === 7 ? FORMATIONS_7 : FORMATIONS;
}
/** Selectable formation labels for this team size. */
export function formationNamesFor(perSide?: number): string[] {
  return Object.keys(formationsForSize(perSide));
}
/** The sensible default formation for this team size. */
export function defaultFormationFor(perSide?: number): string {
  const k = sizeKey(perSide);
  return k === 5 ? '1-2-1' : k === 7 ? '2-3-1' : DEFAULT_FORMATION;
}

export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = '4-3-3';

/** Back-compat export (the old single template). */
export const FORMATION_433 = F_433;

/** Positions that earn a clean sheet when their team concedes zero. */
export const DEFENSIVE_POSITIONS = new Set(['GK', 'LB', 'CB', 'RB', 'CDM']);

export const ALL_POSITIONS = [
  'GK', 'LB', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST',
];

/** Fresh, unfilled slots for a named formation, sized to the team's per-side
 *  count (5 / 7 / 11). Falls back to that size's default formation. */
export function formationSlots(name?: string, perSide?: number): LineupSlot[] {
  const group = formationsForSize(perSide);
  const def = defaultFormationFor(perSide);
  return (group[name ?? def] ?? group[def]).map((s) => ({ ...s }));
}

export function emptyFormation(perSide?: number): LineupSlot[] {
  return formationSlots(defaultFormationFor(perSide), perSide);
}
