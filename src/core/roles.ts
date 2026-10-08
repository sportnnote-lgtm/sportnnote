/** Role capability helpers. `support` is the admin/superset role — it can do
 *  everything an organizer/scorer can, plus review verifications. */
import type { Role } from './types';

/** Internal support/admin — gated access to the verification review console. */
export const isSupport = (r?: Role) => r === 'support';

/** May organize: create tournaments, manage matches. */
export const canOrganize = (r?: Role) => r === 'organizer' || r === 'support';

/** May score ad-hoc/local games (the per-match assigned scorer is separate). */
export const canScoreByRole = (r?: Role) => r === 'scorer' || r === 'organizer' || r === 'support';

/** Parity #05: how long after a match ends its scorers / match hosts may still
 *  correct it. Tournament organisers/hosts have no limit. */
export const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** May this user publish a correction to a completed match? `completedAt` is
 *  epoch ms (see `completedAt()` in sports/amend); null/undefined (demo, no
 *  server timestamps) → open for scorers/hosts. Client-only gate (REVIEW 05/21). */
export function canCorrectMatch(p: {
  complete: boolean;
  isScorer: boolean;
  isMatchHost: boolean;
  isTournamentHost: boolean;
  completedAt?: number | null;
  now: number;
}): boolean {
  if (!p.complete) return false;
  if (p.isTournamentHost) return true;
  if (!p.isScorer && !p.isMatchHost) return false;
  if (p.completedAt == null) return true;
  return p.now - p.completedAt < CORRECTION_WINDOW_MS;
}

/** Milliseconds left in the 24 h correction window (never negative).
 *  No timestamp (demo) → Infinity (no countdown to show). */
export function correctionHoursLeft(completedAt: number | null | undefined, now: number): number {
  if (completedAt == null) return Infinity;
  return Math.max(0, completedAt + CORRECTION_WINDOW_MS - now);
}

/** "17 h 40 m" / "40 m" (minutes rounded down; under a minute but open → "1 m").
 *  Infinity/NaN → ''. */
export function formatTimeLeft(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return '0 m';
  const totalMin = Math.max(1, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}
