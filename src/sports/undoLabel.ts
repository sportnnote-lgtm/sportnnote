/**
 * SD-115 — name what Undo will remove: "point to Federer (30-15)", "ace · Nadal",
 * "rally to Away · side-out", "first-server pick". Pure: built from the newest
 * logged event's type and the state just before / after it (useLiveMatch
 * `lastStep`), using the timeline events that step added. Null = unknown, and
 * the bar falls back to a plain "Undo".
 */
import type { LiveEvent } from './liveEvents';

type Side = 'home' | 'away';

/** Steps that add no timeline event — named by what they set. */
const QUIET: Record<string, string> = {
  SET_FIRST_SERVER: 'first-server pick',
  SET_START_RIGHT: 'right-court pick',
  SET_SERVE_ORDER: 'serving-order pick',
  FIRST_BREAK: 'break pick', // SD-117c carrom toss
  SET_DETAIL: 'point-detail setting',
  POINT_DETAIL: 'point detail',
  EDIT_LOG: 'timeline correction',
  AMEND: 'correction',
  STAT_ADJUST: 'stat correction',
};

const eventsOf = (s: unknown): LiveEvent[] | null => {
  const e = (s as { events?: unknown } | null)?.events;
  return Array.isArray(e) ? (e as LiveEvent[]) : null;
};

export function undoLabel(
  step: { type: string; prev: unknown; next: unknown } | null | undefined,
  names: { home: string; away: string },
  /** "30-15" — the live score after the step (plugin summary) */
  scoreOf?: (s: unknown) => string | null,
): string | null {
  if (!step) return null;
  if (QUIET[step.type]) return QUIET[step.type];
  const before = eventsOf(step.prev);
  const after = eventsOf(step.next);
  if (!before || !after || after.length <= before.length) return null;
  const added = after.slice(before.length);
  const p = added[0];
  const name = (s?: Side) => (s === 'home' ? names.home : s === 'away' ? names.away : '');
  let head: string;
  if (p.kind === 'rally') head = `rally to ${name(p.wonBy)}${p.label ? ` · ${p.label.toLowerCase()}` : ''}`;
  else if (p.df) head = `double fault → point to ${name(p.side)}`;
  else if (p.kind === 'ace' || (p.kind === 'point' && p.pd?.how === 'ace')) head = `ace · ${p.playerName ?? name(p.side)}`;
  else if (p.kind === 'point') head = `point to ${p.playerName ?? name(p.side)}`;
  else {
    // Other sports: the timeline label (some events carry none — never print
    // "undefined"; with nothing to name, fall back to the plain "Undo").
    const what = typeof p.label === 'string' && p.label.trim() ? p.label.trim() : null;
    if (!what) return null;
    const who = p.playerName || (p.side ? name(p.side) : '');
    head = who ? `${what} · ${who}` : what;
  }
  const bad = (t: string) => /\bundefined\b|\bnull\b|\bNaN\b/.test(t);
  if (bad(head)) return null;
  if (added.length > 1) {
    const last = added[added.length - 1].label ?? '';
    const tail = /^Match won/.test(last) ? 'match' : /^Set \d+ won/.test(last) ? 'set'
      : /^Game( \d+ won| home| away)/.test(last) ? 'game' : null;
    if (tail) return `${head} · ${tail}`;
  }
  const sc = scoreOf?.(step.next);
  return sc && !bad(sc) ? `${head} (${sc})` : head;
}
