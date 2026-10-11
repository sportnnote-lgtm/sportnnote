/**
 * Phone identity key — the full international number, never "the last 10 digits".
 *
 * Exact mirror of SQL `phone_key()` (migration 20261020120100_phone_e164.sql) and
 * `phoneKey()` in src/core/phone.ts. A verified Firebase token carries E.164
 * (`+19175551234`), so it only ever matches the same full number on a profile:
 * a US +1 917 555 1234 can't match the Indian +91 91755 51234 any more.
 *  • `+…` / `00…` → `+` + all digits;
 *  • bare digits (rows saved before E.164): leading zeros dropped; 10 digits is an
 *    Indian mobile (`+91…`, what the app always assumed); 11–15 digits already
 *    carry a country code; shorter → '' (a local number with no country);
 *  • fewer than 8 or more than 15 digits → ''.
 */
export function phoneKey(raw: unknown): string {
  const s = String(raw ?? '').trim();
  let d = s.replace(/\D/g, '');
  if (s.startsWith('+')) {
    // international already
  } else if (s.startsWith('00')) {
    d = d.slice(2);
  } else {
    d = d.replace(/^0+/, '');
    if (d.length === 10) d = `91${d}`;
    else if (d.length < 11) return '';
  }
  if (d.length < 8 || d.length > 15 || d.startsWith('0')) return '';
  return `+${d}`;
}

/** Same full number? Blank / unparseable never matches. */
export function samePhoneKey(a: unknown, b: unknown): boolean {
  const ka = phoneKey(a);
  return ka !== '' && ka === phoneKey(b);
}
