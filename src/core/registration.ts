/** Tournament registration gates — whether a team can still request to join,
 *  given the organizer's controls (open flag, deadline, capacity). Pure so it's
 *  shared by the join flow, the Discover listing and the organizer's dashboard,
 *  and unit-testable. */
import type { Tournament, TournamentEntry } from './types';

/** Entry statuses that occupy a real spot in the field (count toward capacity).
 *  A pending request or a withdrawal does not; an invite does (it's a held slot). */
const COUNTS_AS_ENTERED = new Set(['confirmed', 'invited']);

/** Teams actually in the tournament — confirmed or invited. Excludes pending
 *  requests and withdrawals, so fixtures/standings/capacity all agree. */
export function activeEntries(entries: TournamentEntry[]): TournamentEntry[] {
  return entries.filter((e) => COUNTS_AS_ENTERED.has(e.status));
}

export interface RegistrationState {
  /** can a new team request to join right now? */
  open: boolean;
  /** why it's closed (when `open` is false) */
  reason?: 'not_open' | 'deadline_passed' | 'full';
  /** spots remaining before `maxTeams` (undefined ⇒ no cap) */
  spotsLeft?: number;
  /** the tournament hasn't reached its `minTeams` yet (organizer heads-up) */
  belowMin: boolean;
  /** short human line for the UI */
  label: string;
}

/** Evaluate registration for a tournament given how many teams are already in
 *  it. `nowMs` is injected so the result is deterministic/testable. */
export function registrationState(t: Pick<Tournament, 'isOpen' | 'registrationDeadline' | 'minTeams' | 'maxTeams'>, enteredCount: number, nowMs: number): RegistrationState {
  const cap = t.maxTeams && t.maxTeams > 0 ? t.maxTeams : undefined;
  const spotsLeft = cap !== undefined ? Math.max(0, cap - enteredCount) : undefined;
  const belowMin = !!t.minTeams && enteredCount < t.minTeams;
  const deadlineMs = t.registrationDeadline ? new Date(t.registrationDeadline).getTime() : undefined;

  if (!t.isOpen) return { open: false, reason: 'not_open', spotsLeft, belowMin, label: 'Registration closed' };
  if (deadlineMs !== undefined && !Number.isNaN(deadlineMs) && nowMs > deadlineMs) {
    return { open: false, reason: 'deadline_passed', spotsLeft, belowMin, label: 'Registration deadline passed' };
  }
  if (spotsLeft === 0) return { open: false, reason: 'full', spotsLeft: 0, belowMin, label: 'Field full' };

  const label = spotsLeft !== undefined ? `Open · ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left` : 'Open for registration';
  return { open: true, spotsLeft, belowMin, label };
}

/** Guard used by the join path: the reason a request can't be accepted, or null
 *  if it's fine. (Capacity counts entered teams; a re-request by a withdrawn team
 *  is allowed as long as the field isn't full.) */
export function joinBlockReason(t: Pick<Tournament, 'isOpen' | 'registrationDeadline' | 'minTeams' | 'maxTeams'>, entries: TournamentEntry[], nowMs: number): string | null {
  const st = registrationState(t, activeEntries(entries).length, nowMs);
  if (st.open) return null;
  return st.reason === 'deadline_passed'
    ? 'Registration has closed — the deadline has passed.'
    : st.reason === 'full'
      ? 'This tournament is full.'
      : 'This tournament isn’t open for registration.';
}
