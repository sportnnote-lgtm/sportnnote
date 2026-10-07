/** A whole mobile number (10+ digits) or an email — searched in Discover as an
 *  exact contact match (migration 0034), never as a partial. Pure. */
export function looksLikeContact(q: string): 'phone' | 'email' | null {
  const t = q.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email';
  if (/^[+\d(][\d\s()+-]*$/.test(t) && t.replace(/\D/g, '').length >= 10) return 'phone';
  return null;
}
