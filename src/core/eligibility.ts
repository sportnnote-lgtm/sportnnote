/**
 * Who may be added to a match. The rule:
 *  • Under-18 → the parent/guardian must be fully verified — proof document
 *    approved by support, plus verified mobile AND email.
 *  • 18+      → the player's own mobile AND email must be verified.
 * A player with no date of birth can't be assessed, so they're not eligible.
 */
import { ageOf } from './age';
import type { Player } from './types';

export interface Eligibility {
  ok: boolean;
  reason?: string;
}

export function matchEligibility(p: Player): Eligibility {
  const age = ageOf(p);
  if (age === undefined) return { ok: false, reason: 'Date of birth not set' };

  if (age < 18) {
    const g = p.guardian;
    // For someone else's child the guardian's details are private — only a
    // `present` flag comes back (players_view), which is enough to assess.
    if (!g?.name && !g?.present) return { ok: false, reason: 'No parent/guardian added' };
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

// ⚠️ TESTING ONLY — MUST be set back to `false` before go-live. ⚠️
// While true, unverified players (no verified mobile / no DOB / guardian not verified)
// may still be picked into a squad and placed on the pitch, so the squad / lineup /
// formation flows can be tested without every tester completing verification. This
// DELIBERATELY relaxes the child-safeguarding gate — it must NOT ship to production.
// `matchEligibility()` still returns the true assessment (screens show the real
// reason as a warning); only the *enforcement* is relaxed, via `canFieldPlayer()`.
// Flip this one constant to false to fully re-arm the gate everywhere.
export const TESTING_ALLOW_UNVERIFIED = true;

/** Whether a player may be fielded (picked into a squad / placed on the pitch).
 *  In production this is exactly `matchEligibility(p).ok`; during the testing phase
 *  the override above lets unverified players through. Enforcement points call this;
 *  informational labels keep calling `matchEligibility` so the real reason still shows. */
export function canFieldPlayer(p: Player): boolean {
  return TESTING_ALLOW_UNVERIFIED || matchEligibility(p).ok;
}
