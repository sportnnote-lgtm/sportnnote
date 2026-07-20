/**
 * Phone number = the primary identity key across Sportfolio.
 *
 * Platform baseline: one number ⇒ one person. A profile is recognised by its
 * contact number first; the name (and everything else) is pulled from that
 * number, and two different names can never exist for the same number. Every
 * profile-creating path routes a number through here so matches are deduped
 * rather than duplicated.
 *
 * These helpers make "+91 98765 43210", "9876543210" and "+919876543210" the
 * same identity.
 */

/** Digits only, leading zeros dropped — the stored/canonical form. */
export function normalizePhone(raw?: string): string {
  return (raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/** The comparable key: the last 10 digits (a mobile number), so a local number
 *  and the same number with a country code resolve to one identity. */
export function phoneKey(raw?: string): string {
  const d = normalizePhone(raw);
  return d.length > 10 ? d.slice(-10) : d;
}

/** A usable number needs enough digits to identify a person. */
export function isValidPhone(raw?: string): boolean {
  return normalizePhone(raw).length >= 8;
}

/** Same person? True when both are valid numbers with the same identity key. */
export function samePhone(a?: string, b?: string): boolean {
  const ka = phoneKey(a);
  return ka.length >= 8 && ka === phoneKey(b);
}
