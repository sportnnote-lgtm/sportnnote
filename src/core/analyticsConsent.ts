/**
 * SD-152 — the viewer's analytics choice ("Essential only" / "Allow analytics").
 *
 * Saved on this device (AsyncStorage) so it applies before sign-in, and copied to
 * the account (set_analytics_consent RPC, migration 20261020120000) so the server
 * stops linking that person's actions too. Rules per country: core/privacyRegion.ts.
 * Telemetry (core/telemetry.ts) asks analyticsState() before sending or storing
 * anything.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from './supabase';
import { analyticsDecision, analyticsNeedsConsent, privacyCountry, setPrivacyCountry, type AnalyticsChoice, type AnalyticsDecision } from './privacyRegion';
import { regionStore } from './region';

const KEY = 'sn.consent.analytics';

let choice: AnalyticsChoice | null = null;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });

// A country chosen in Settings → Region (SD-150) overrides the device guess.
const syncCountry = () => setPrivacyCountry(regionStore.prefs().country);
syncCountry();
regionStore.subscribe(() => { syncCountry(); emit(); });

/** 'allowed' | 'denied' | 'undecided' (consent-first country, no choice yet). */
export function analyticsState(): AnalyticsDecision {
  // Until the saved choice has loaded, consent-first countries wait (nothing sent).
  if (!hydrated && analyticsNeedsConsent(privacyCountry())) return 'undecided';
  return analyticsDecision(choice, privacyCountry());
}

export const analyticsChoice = (): AnalyticsChoice | null => choice;

/** Show the first-visit banner? Only in consent-first countries, before any choice. */
export const needsAnalyticsBanner = (): boolean => hydrated && !choice && analyticsNeedsConsent(privacyCountry());

export function subscribeAnalyticsConsent(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export async function hydrateAnalyticsConsent(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    choice = v === 'granted' || v === 'denied' ? v : null;
  } catch { /* storage off → behave as "no choice yet" */ }
  hydrated = true;
  emit();
}

/** Save a choice on this device and, when signed in, on the account. */
export async function setAnalyticsChoice(c: AnalyticsChoice): Promise<void> {
  choice = c;
  hydrated = true;
  try { await AsyncStorage.setItem(KEY, c); } catch { /* ignore */ }
  emit();
  await syncAnalyticsChoiceToAccount();
}

/** Copy the device choice to the signed-in account (no-op in demo / signed out). */
export async function syncAnalyticsChoiceToAccount(): Promise<void> {
  if (!choice || !isSupabaseConfigured || !supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.rpc('set_analytics_consent', { p_allow: choice === 'granted' });
  } catch { /* best effort — the device choice still applies */ }
}
