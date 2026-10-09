/**
 * Live settings (parity #14) — the pure decisions behind LiveSettingsCard: what
 * an Apply does (format patch vs logged event), who may edit, and the
 * "Standard / N custom" count. No React imports, so node tests load it.
 */
import type { FormatValue, LiveSettings, ScoreAction } from './types';

export type LiveApply =
  | { kind: 'none' }
  | { kind: 'format'; patch: Record<string, FormatValue> }
  | { kind: 'event'; action: ScoreAction };

/** Keys whose draft value differs from the current one. */
export function changedKeys(current: Record<string, FormatValue>, draft: Record<string, FormatValue>): Record<string, FormatValue> {
  const out: Record<string, FormatValue> = {};
  for (const [k, v] of Object.entries(draft)) if (current[k] !== v) out[k] = v;
  return out;
}

/** Has play started, per the sport (default: any event logged)? */
export function isBeforeStart<S>(ls: LiveSettings<S>, state: S, eventCount: number): boolean {
  return ls.beforeStart ? ls.beforeStart(state) : eventCount === 0;
}

/** What applying `draft` does. Config mode, or event mode before play → patch
 *  `matches.format` (it becomes the baseline and survives Restart). Event mode
 *  after play starts → dispatch `actionType` with the changed keys, so the
 *  change applies from the next play and past plays keep their rules. */
export function planLiveApply<S>(
  ls: LiveSettings<S>, state: S, eventCount: number,
  current: Record<string, FormatValue>, draft: Record<string, FormatValue>,
): LiveApply {
  const patch = changedKeys(current, draft);
  if (!Object.keys(patch).length) return { kind: 'none' };
  if (ls.mode === 'config' || isBeforeStart(ls, state, eventCount) || !ls.actionType) return { kind: 'format', patch };
  return { kind: 'event', action: { type: ls.actionType, payload: patch } };
}

/** Who can edit. Event mode while live: the scorer only (others read-only with
 *  a note). Before play, or config mode: scorer or match manager. */
export function liveSettingsAccess(opts: {
  mode: LiveSettings['mode']; beforeStart: boolean; canScore: boolean; canManage: boolean; complete: boolean;
}): { editable: boolean; note?: string } {
  if (opts.complete) return { editable: false };
  if (opts.mode === 'event' && !opts.beforeStart) {
    return opts.canScore ? { editable: true } : { editable: false, note: 'Only scorers and hosts can change rules during play.' };
  }
  return { editable: opts.canScore || opts.canManage };
}

/** How many fields differ from the standard values. */
export function customCount<S>(ls: LiveSettings<S>, values: Record<string, FormatValue>): number {
  return ls.fields.filter((f) => (values[f.key] ?? f.default) !== (ls.defaults?.[f.key] ?? f.default)).length;
}
