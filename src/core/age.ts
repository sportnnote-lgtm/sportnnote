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
