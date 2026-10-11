/** Age helpers. Age is derived from date of birth so it stays correct over time. */

/** Whole years from a YYYY-MM-DD date of birth, or undefined if unset/invalid. */
export function ageFromDob(dob?: string): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : undefined;
}

/** A player's age: from their DOB when we can see it, else the server-derived
 *  age (live reads of other people don't include the private DOB). */
export const ageOf = (p: { dob?: string; age?: number } | null | undefined): number | undefined =>
  ageFromDob(p?.dob) ?? p?.age;

/** Under-18 players surface the guardian flow more prominently. */
export const isMinor = (dob?: string): boolean => {
  const a = ageFromDob(dob);
  return a !== undefined && a < 18;
};

/** SD-130: whole years on a given day (YYYY-MM-DD), from a YYYY-MM-DD date of birth. */
export function ageOn(dob: string | undefined, on: string): number | undefined {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? '');
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(on);
  if (!b || !d) return undefined;
  let age = Number(d[1]) - Number(b[1]);
  if (Number(d[2]) * 100 + Number(d[3]) < Number(b[2]) * 100 + Number(b[3])) age -= 1;
  return age >= 0 && age < 130 ? age : undefined;
}

/**
 * SD-130: which day a meet's age groups are counted on. World Athletics U18 /
 * U20 and World Aquatics use the age on 31 December of the competition year;
 * school associations often publish their own cut-off date. Stored on the
 * tournament's sport format as `ageOn`: 'dec31' (default) | 'jan1' | 'meet'
 * (the meet's first day) | 'today' | a YYYY-MM-DD cut-off | SD-153 recurring
 * school-year dates: 'aug31' (England & Wales / British-curriculum schools:
 * 31 August at the start of the school year — a June 2027 meet counts on
 * 31 Aug 2026) and 'sep1' (1 September at the start of the school year).
 */
export type AgeBasis = 'dec31' | 'jan1' | 'meet' | 'today' | 'aug31' | 'sep1' | string;

export const AGE_BASIS_OPTIONS: { value: AgeBasis; label: string }[] = [
  { value: 'dec31', label: '31 Dec of the meet year (World Athletics)' },
  { value: 'jan1', label: '1 Jan of the meet year' },
  { value: 'meet', label: 'The meet’s first day' },
];

/** SD-153: the recurring school-year cut-offs (the most recent such day on or
 *  before the meet). Both are the 1st or last day of a month (privacy rule). */
export const SCHOOL_YEAR_BASES: { value: AgeBasis; label: string; monthDay: string }[] = [
  { value: 'aug31', label: '31 Aug, start of the school year', monthDay: '08-31' },
  { value: 'sep1', label: '1 Sep, start of the school year', monthDay: '09-01' },
];

/** The cut-off choices for a market's default (core/markets.ts ageCutoff): the
 *  standard three, plus the market's school-year date first when it has one
 *  (UK / British-curriculum Gulf: 31 Aug; US: 1 Sep), and the meet's current
 *  basis if it is a school-year one. India: exactly the standard three. */
export function ageBasisOptions(marketCutoff?: string, current?: AgeBasis): { value: AgeBasis; label: string }[] {
  const extra = SCHOOL_YEAR_BASES.filter((b) => b.value === marketCutoff || b.value === current);
  return [...extra.map(({ value, label }) => ({ value, label })), ...AGE_BASIS_OPTIONS];
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The cut-off day (YYYY-MM-DD) for a basis and the meet's first day. */
/** A board's cut-off must be the 1st or the last day of a month (31 Dec,
 *  1 Jan, 1 Oct…) — any other day could be used to narrow down a child's
 *  birthday through repeated changes. Mirrors meet_age_cutoff() in SQL. */
export function isBoardCutoff(day: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return false;
  const d = Number(m[3]);
  if (d === 1) return true;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return d === last;
}

export function ageCutoff(basis: AgeBasis | undefined, meetStart?: string, today: Date = new Date()): string {
  const start = /^\d{4}-\d{2}-\d{2}/.test(meetStart ?? '') ? meetStart!.slice(0, 10) : iso(today);
  const year = start.slice(0, 4);
  const b = basis ?? 'dec31';
  if (/^\d{4}-\d{2}-\d{2}$/.test(b) && isBoardCutoff(b)) return b;
  if (b === 'jan1') return `${year}-01-01`;
  const sy = SCHOOL_YEAR_BASES.find((x) => x.value === b);
  if (sy) return start.slice(5) >= sy.monthDay ? `${year}-${sy.monthDay}` : `${Number(year) - 1}-${sy.monthDay}`;
  if (b === 'meet') return start;
  if (b === 'today') return iso(today);
  return `${year}-12-31`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Ages on 31 Dec 2026" */
export const cutoffLabel = (day: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : day;
};

/** A player's age on the meet's cut-off: from their DOB when we can see it,
 *  else the server's age on that day (`serverAge`), else their age today. */
export function meetAgeOf(p: { id?: string; dob?: string; age?: number } | null | undefined, cutoff: string, serverAge?: Map<string, number>): number | undefined {
  if (!p) return undefined;
  return ageOn(p.dob, cutoff) ?? (p.id ? serverAge?.get(p.id) : undefined) ?? p.age;
}
