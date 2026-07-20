/**
 * Who may be added to a match. The rule:
 *  • Under-18 → the parent/guardian must be fully verified — proof document
 *    approved by support, plus verified mobile AND email.
 *  • 18+      → the player's own mobile AND email must be verified.
 * A player with no date of birth can't be assessed, so they're not eligible.
 */
import { ageFromDob } from './age';
import type { Player } from './types';

export interface Eligibility {
  ok: boolean;
  reason?: string;
}

export function matchEligibility(p: Player): Eligibility {
  const age = ageFromDob(p.dob);
  if (age === undefined) return { ok: false, reason: 'Date of birth not set' };

  if (age < 18) {
    const g = p.guardian;
    if (!g?.name) return { ok: false, reason: 'No parent/guardian added' };
    if (p.verification?.status !== 'approved') return { ok: false, reason: 'Guardian/age proof not verified' };
    if (!g.phoneVerified) return { ok: false, reason: 'Guardian mobile not verified' };
    if (!g.emailVerified) return { ok: false, reason: 'Guardian email not verified' };
    return { ok: true };
  }

  // 18+
  if (!p.phoneVerified) return { ok: false, reason: 'Mobile not verified' };
  if (!p.emailVerified) return { ok: false, reason: 'Email not verified' };
  return { ok: true };
}
