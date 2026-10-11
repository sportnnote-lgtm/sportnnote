/** Divisions (categories) helpers — the age × gender structure school meets run
 *  on. A division has a display `label` plus optional structured `ageGroup` /
 *  `gender`. Presets build both; custom divisions carry just a label. */
import type { CategoryGender, NewTournamentCategory } from './types';
import { classKey, marketFor, type MarketId } from './markets.ts';

/** Common school-sport age bands (India). 'Open' = no age cap (seniors). */
export const AGE_GROUPS = ['U11', 'U14', 'U16', 'U19', 'Open'] as const;

/** SD-153: the age bands a market's schools use (India = AGE_GROUPS). */
export const ageGroupsFor = (market?: MarketId | string | null): readonly string[] => marketFor(market).ageBands;

/**
 * SD-153: what an age-band label means. Ages are whole years on the meet's
 * cut-off day; grades are checked against the class timeline on the meet day.
 * - "U14" / "Under 14" → 13 or younger (maxAge 13)
 * - "12 & Under" / "12 and under" / "12U" → maxAge 12
 * - "10–12 years" / "10-12" → minAge 10, maxAge 12
 * - "35+" / "35 & over" → minAge 35
 * - "A/B/C Division" (Singapore NSG, by birth year = age on 31 Dec; verify) →
 *   A 18, B 16, C 14 and under
 * - "Junior / Inter / Senior" (ESAA athletics, age on 31 Aug; verify) →
 *   12–13, 14–15, 16–18
 * - "Grade 9", "Grades 9–12", "Year 7–8" → grade range
 * - "Open" or anything else → no limit (the organiser checks)
 */
export interface AgeBand { minAge?: number; maxAge?: number; minGrade?: number; maxGrade?: number }

export function ageBandOf(label: string | null | undefined): AgeBand {
  const s = (label ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return {};
  let m: RegExpExecArray | null;
  if ((m = /^(?:U|Under[- ]?)(\d{1,2})$/i.exec(s))) return { maxAge: Number(m[1]) - 1 };
  if ((m = /^(\d{1,2}) ?(?:&|and|\/)? ?(?:under|U)$/i.exec(s))) return { maxAge: Number(m[1]) };
  if ((m = /^(?:Grades?|Years?|Yrs?|Class(?:es)?|Std) ?(\d{1,2})(?: ?(?:–|-|to) ?(\d{1,2}))?$/i.exec(s))) {
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    return { minGrade: Math.min(a, b), maxGrade: Math.max(a, b) };
  }
  if ((m = /^(\d{1,2}) ?(?:–|-|to) ?(\d{1,2})(?: ?(?:years?|yrs?|y))?$/i.exec(s))) {
    const a = Number(m[1]), b = Number(m[2]);
    return { minAge: Math.min(a, b), maxAge: Math.max(a, b) };
  }
  if ((m = /^(\d{1,2}) ?(?:\+|& ?over|and over|& ?older)$/i.exec(s))) return { minAge: Number(m[1]) };
  if ((m = /^([ABC]) ?Div(?:ision)?\.?$/i.exec(s))) return { maxAge: { A: 18, B: 16, C: 14 }[m[1].toUpperCase() as 'A' | 'B' | 'C'] };
  if (/^junior$/i.test(s)) return { minAge: 12, maxAge: 13 };
  if (/^inter(?:mediate)?$/i.test(s)) return { minAge: 14, maxAge: 15 };
  if (/^senior$/i.test(s)) return { minAge: 16, maxAge: 18 };
  return {};
}

/** The grade number of a class label for grade bands ("Grade 10-A" → 10,
 *  "Year 7" → 7, "Freshman" → 9), or undefined. */
export const gradeNumber = (classLabel: string | null | undefined): number | undefined => classKey(classLabel)?.n;

/** Does an athlete fit a band? Unknown age / class never excludes (the
 *  organiser checks); a known mismatch does. */
export function fitsBand(band: AgeBand, p: { age?: number; grade?: string }): boolean {
  if (p.age != null) {
    if (band.maxAge != null && p.age > band.maxAge) return false;
    if (band.minAge != null && p.age < band.minAge) return false;
  }
  const g = band.minGrade != null || band.maxGrade != null ? gradeNumber(p.grade) : undefined;
  if (g != null) {
    if (band.maxGrade != null && g > band.maxGrade) return false;
    if (band.minGrade != null && g < band.minGrade) return false;
  }
  return true;
}

/** A short line describing a band ("12 or younger", "10 to 12", "Grades 9 to 12") — for hints. */
export function bandRule(label: string): string | undefined {
  const b = ageBandOf(label);
  if (b.minGrade != null) return b.minGrade === b.maxGrade ? `grade ${b.minGrade} on the meet day` : `grades ${b.minGrade} to ${b.maxGrade} on the meet day`;
  if (b.minAge != null && b.maxAge != null) return `${b.minAge} to ${b.maxAge} on the cut-off day`;
  if (b.maxAge != null) return `${b.maxAge} or younger on the cut-off day`;
  if (b.minAge != null) return `${b.minAge} or older on the cut-off day`;
  return undefined;
}
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
