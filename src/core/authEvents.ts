/**
 * How the auth provider reacts to Supabase auth events (perf audit F-05/F-06/
 * F-07). Pure — no imports — so it is unit-tested (tests/auth-events.test.mts).
 *
 * Before: every event (INITIAL_SESSION, TOKEN_REFRESHED hourly on native, and
 * SIGNED_IN each time a web tab / Home-screen app became visible) reloaded the
 * profile with `loading = true`, which swapped the whole navigator for a
 * spinner — a flash on every return to the web app, and on native an hourly
 * reset to Home that lost the user's place. Now the full-screen spinner shows
 * only when there is no profile for the signed-in user yet.
 */

/** What to do with one auth event.
 *  - `signed-out`: no session — clear the profile.
 *  - `switch`: a different user (or the first one) — load their profile; the
 *    old user's profile must not stay on screen.
 *  - `retry`: same user, no profile and nothing loading — load again (blocking).
 *  - `silent`: same user, profile shown — refresh it in the background.
 *  - `ignore`: nothing to do (a duplicate, or a token refresh). */
export type AuthEventPlan = 'signed-out' | 'switch' | 'retry' | 'silent' | 'ignore';

export interface AuthProviderState {
  /** the user whose profile is shown or being loaded */
  userId: string | null;
  hasProfile: boolean;
  /** a blocking (first) profile load for `userId` is in flight */
  loadingProfile: boolean;
}

/** Events after which the profile may have changed for the same user. */
const REFRESH_EVENTS = new Set(['SIGNED_IN', 'USER_UPDATED', 'PASSWORD_RECOVERY']);

export function planAuthEvent(event: string, sessionUserId: string | null | undefined, s: AuthProviderState): AuthEventPlan {
  if (!sessionUserId) return 'signed-out';
  if (sessionUserId !== s.userId) return 'switch';
  if (s.loadingProfile) return 'ignore'; // the load already running covers it
  if (!s.hasProfile) return 'retry';
  return REFRESH_EVENTS.has(event) ? 'silent' : 'ignore';
}

const ROLES = ['organizer', 'scorer', 'player', 'parent', 'fan', 'support'] as const;
type SessionRole = (typeof ROLES)[number];

/** The bits of a Supabase session user we read (structural, so tests need no SDK). */
export interface SessionUserLike {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/** A minimal profile from the session's sign-up metadata (name + role), so Home
 *  can mount the moment a sign-in completes while `profiles` is still loading
 *  (F-05). Null when the metadata lacks a usable name or role — the caller then
 *  waits for `profiles` as before. */
export function profileFromSession(user: SessionUserLike | null | undefined): { id: string; fullName: string; handle: string; role: SessionRole } | null {
  if (!user?.id) return null;
  const meta = user.user_metadata ?? {};
  const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  const role = meta.role;
  if (!fullName || typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) return null;
  return { id: user.id, fullName, handle: '', role: role as SessionRole };
}

/** The confirmed login email to copy onto the player's contact email, read from
 *  the session (no `getUser()` round trip — F-06). Null for unconfirmed
 *  addresses and the internal placeholder that mobile sign-ups carry. */
export function confirmedLoginEmail(user: SessionUserLike | null | undefined): string | null {
  const email = user?.email;
  if (!email || !user?.email_confirmed_at) return null;
  if (/@phone\.sportnnote\.in$/i.test(email)) return null;
  return email;
}
