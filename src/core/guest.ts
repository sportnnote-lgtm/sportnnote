/**
 * Guest (logged-out) viewing of shared pages — match, tournament, golf round,
 * player profile. Anything that needs an account calls `promptSignIn()`: we
 * remember the page they were on, open sign-up, and return them to that page
 * once they're signed in (RootNavigator → takePendingRoute).
 */
import { isSupabaseConfigured } from './supabase';
import { navRef } from '../navigation/navRef';

type Pending = { name: string; params?: object };
let pending: Pending | null = null;

export function promptSignIn(mode: 'up' | 'in' = 'up'): void {
  if (!navRef.isReady()) return;
  const cur = navRef.getCurrentRoute();
  if (cur && cur.name !== 'Auth') pending = { name: cur.name, params: cur.params as object | undefined };
  navRef.navigate('Auth', { mode });
}

/** The page to return to after sign-in (consumed once). */
export function takePendingRoute(): Pending | null {
  const p = pending;
  pending = null;
  return p;
}

/** Live app, nobody signed in → guest. (Demo mode is never a guest.) */
export const isGuestSession = (authed: boolean) => isSupabaseConfigured && !authed;
