/** Divisions (categories) helpers — the age × gender structure school meets run
 *  on. A division has a display `label` plus optional structured `ageGroup` /
 *  `gender`. Presets build both; custom divisions carry just a label. */
import type { CategoryGender, NewTournamentCategory } from './types';

/** Common school-sport age bands. 'Open' = no age cap (seniors). */
export const AGE_GROUPS = ['U11', 'U14', 'U16', 'U19', 'Open'] as const;
export const GENDERS: { key: CategoryGender; label: string }[] = [
  { key: 'boys', label: 'Boys' },
  { key: 'girls', label: 'Girls' },
  { key: 'mixed', label: 'Mixed' },
];

const genderWord = (g?: CategoryGender) => (g === 'boys' ? 'Boys' : g === 'girls' ? 'Girls' : g === 'mixed' ? 'Mixed' : '');

/** Build the display label for a division from its parts (e.g. 'U14 Boys',
 *  'Open Mixed', or just 'U16' when no gender is set). */
export function divisionLabel(ageGroup?: string, gender?: CategoryGender): string {
  return [ageGroup, genderWord(gender)].filter(Boolean).join(' ').trim();
}

/** A preset division from an age band + gender, with its label filled in. */
export function presetDivision(ageGroup: string, gender: CategoryGender, sort = 0): NewTournamentCategory {
  return { label: divisionLabel(ageGroup, gender), ageGroup, gender, sort };
}

/** Case-insensitive key to dedupe divisions by their effective label. */
export const divisionKey = (c: { label: string }) => c.label.trim().toLowerCase();
