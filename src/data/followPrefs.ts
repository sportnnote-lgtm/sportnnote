/**
 * Alert choices per followed player, team or tournament (CricHeroes parity #23).
 *
 * Opt-out framing: following turns every alert on; a FollowPrefs object stores
 * only the switches the user turned OFF ({ scores: false }). Nothing stored —
 * or `null` in follows.prefs — means "all on", so old rows need no backfill and
 * an unfollow (which deletes the row) resets everything.
 *
 * Pure — no React, no I/O — so tests and both the client and the edge functions'
 * logic agree on what "wants" means.
 */
import type { FollowType } from './followStore';

export type AlertKey = 'reminder' | 'start' | 'result' | 'scores' | 'award';
export type FollowPrefs = Partial<Record<AlertKey, false>>;

export interface AlertOption {
  key: AlertKey;
  label: string;
  hint: string;
}

const START: AlertOption = { key: 'start', label: 'Match starts', hint: 'When their match goes live' };
const RESULT: AlertOption = { key: 'result', label: 'Result', hint: 'Who won, when the match ends' };

/** The switches shown per follow type. Only alerts something actually sends are
 *  listed — `award` stays out until #21's follower fan-out exists. */
export const ALERTS: Record<FollowType, AlertOption[]> = {
  player: [
    { key: 'reminder', label: 'Before they play', hint: 'A day, an hour and 15 minutes before' },
    { ...START, hint: 'When their match goes live' },
    { ...RESULT },
    { key: 'scores', label: 'Goals, wickets & big moments', hint: 'Each time they score, in any sport' },
  ],
  team: [{ ...START, hint: 'When the team’s match goes live' }, { ...RESULT }],
  tournament: [{ ...START, hint: 'When any match in it goes live' }, { ...RESULT }],
};

/** Does this follow want the alert? Missing prefs / missing key = yes. */
export const wants = (p: FollowPrefs | null | undefined, k: AlertKey): boolean => p?.[k] !== false;

/** Bell icon state for a follow: every shown switch on, some, or none. */
export function bellState(type: FollowType, p: FollowPrefs | null | undefined): 'all' | 'some' | 'none' {
  const keys = ALERTS[type].map((a) => a.key);
  const on = keys.filter((k) => wants(p, k)).length;
  return on === keys.length ? 'all' : on === 0 ? 'none' : 'some';
}

/** Keep only real OFF switches (drops `true`/unknown keys). */
export function normalizePrefs(p: unknown): FollowPrefs {
  const out: FollowPrefs = {};
  if (!p || typeof p !== 'object') return out;
  const keys: AlertKey[] = ['reminder', 'start', 'result', 'scores', 'award'];
  for (const k of keys) if ((p as Record<string, unknown>)[k] === false) out[k] = false;
  return out;
}

/** What goes into follows.prefs: null when everything is on. */
export function serializePrefs(p: FollowPrefs | null | undefined): FollowPrefs | null {
  const n = normalizePrefs(p);
  return Object.keys(n).length ? n : null;
}

/** Prefs from a set of ticked keys for a type (untick = false). */
export function prefsFromTicked(type: FollowType, ticked: ReadonlySet<AlertKey>, base?: FollowPrefs | null): FollowPrefs {
  const out: FollowPrefs = { ...normalizePrefs(base) };
  for (const { key } of ALERTS[type]) {
    if (ticked.has(key)) delete out[key];
    else out[key] = false;
  }
  return out;
}
