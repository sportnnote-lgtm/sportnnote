/**
 * Post-match corrections (parity #05) — the PURE engine.
 *
 * A correction is ONE appended event row:
 *   { type: 'AMEND', payload: { ops, lines, byName, deltas } }
 * The original rows are never edited; replaying the log applies the AMEND ops
 * (replace / void, by target `seq`) on top, so removing an AMEND row restores
 * the original match exactly. No RN imports — node tests load this file.
 */
import type { MatchEventRecord } from '../core/types';
import type { ScoreAction, SportPlugin } from './types';

export const AMEND_TYPE = 'AMEND';

export type AmendOp = { op: 'replace'; seq: number; action: ScoreAction } | { op: 'void'; seq: number };
export interface StatDelta { playerId: string; stat: string; by: number }
export interface AmendPayload { ops: AmendOp[]; lines: string[]; byName: string; deltas: StatDelta[] }

type Attr = NonNullable<MatchEventRecord['attribution']>;
const isAmend = (e: Pick<MatchEventRecord, 'type'>) => e.type === AMEND_TYPE;

/** Same mapping useLiveMatch uses to turn a stored row into a reducer action. */
const toAction = (e: MatchEventRecord): ScoreAction => ({
  type: e.type,
  side: e.side ?? undefined,
  payload: e.payload ?? undefined,
  attribution: e.attribution ?? undefined,
});

/** The log as it should be replayed: AMEND rows dropped, their ops applied in
 *  AMEND seq order (last write wins). A replaced row keeps its original seq,
 *  created_at and clientId; a voided row disappears; ops on a missing seq are
 *  ignored. Output is in seq order. */
export function effectiveLog(events: MatchEventRecord[]): MatchEventRecord[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const base = new Map<number, MatchEventRecord | null>();
  for (const e of sorted) if (!isAmend(e)) base.set(e.seq, e);
  for (const am of sorted) {
    if (!isAmend(am)) continue;
    const ops = ((am.payload as Partial<AmendPayload> | null | undefined)?.ops ?? []) as AmendOp[];
    for (const op of ops) {
      if (!op || typeof op.seq !== 'number' || !base.has(op.seq)) continue;
      const target = base.get(op.seq);
      if (!target) continue; // already voided — nothing to act on
      if (op.op === 'void') base.set(op.seq, null);
      else if (op.op === 'replace' && op.action) {
        const a = op.action;
        base.set(op.seq, {
          ...target,
          type: a.type,
          side: a.side ?? null,
          payload: a.attribution2 ? { ...(a.payload ?? {}), _attr2: a.attribution2 } : a.payload ?? {},
          attribution: a.attribution ?? null,
        });
      }
    }
  }
  return sorted.filter((e) => !isAmend(e)).map((e) => base.get(e.seq)).filter((e): e is MatchEventRecord => !!e);
}

/** Replay a raw log (AMEND rows included) to a state. */
export function replayLog<S>(plugin: Pick<SportPlugin<S>, 'createInitialState' | 'reducer'>, config: Record<string, unknown> | undefined, events: MatchEventRecord[]): S {
  return effectiveLog(events).reduce((s, e) => plugin.reducer(s, toAction(e)), plugin.createInitialState(config));
}

/** playerId → stat → total credited by the log (attribution.by default 1, plus
 *  `extra`, plus `payload._attr2`). AMEND rows are skipped; pass an effective log. */
export function attributionTotals(events: MatchEventRecord[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const add = (playerId: string, stat: string, by: number) => {
    const p = (out[playerId] ??= {});
    p[stat] = (p[stat] ?? 0) + by;
  };
  const credit = (a?: Attr | null) => {
    if (!a || !a.playerId || !a.stat) return;
    add(a.playerId, a.stat, a.by ?? 1);
    for (const [k, v] of Object.entries(a.extra ?? {})) add(a.playerId, k, v);
  };
  for (const e of events) {
    if (isAmend(e)) continue;
    credit(e.attribution);
    credit((e.payload as { _attr2?: Attr } | null | undefined)?._attr2);
  }
  return out;
}

/** The non-zero stat changes (after − before), sorted by playerId then stat. */
export function statDeltas(beforeEff: MatchEventRecord[], afterEff: MatchEventRecord[]): StatDelta[] {
  const before = attributionTotals(beforeEff);
  const after = attributionTotals(afterEff);
  const out: StatDelta[] = [];
  for (const playerId of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[playerId] ?? {};
    const a = after[playerId] ?? {};
    for (const stat of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const by = (a[stat] ?? 0) - (b[stat] ?? 0);
      if (by !== 0) out.push({ playerId, stat, by });
    }
  }
  return out.sort((x, y) => (x.playerId < y.playerId ? -1 : x.playerId > y.playerId ? 1 : x.stat < y.stat ? -1 : x.stat > y.stat ? 1 : 0));
}

const ms = (iso?: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** When the match finished (epoch ms): the later of the last non-AMEND event's
 *  created_at and a manual result's `at` (#04). null when neither is known (demo). */
export function completedAt(events: MatchEventRecord[], result?: { at?: string | null } | null): number | null {
  let last: MatchEventRecord | undefined;
  for (const e of events) if (!isAmend(e) && (!last || e.seq > last.seq)) last = e;
  const times = [ms(last?.created_at), ms(result?.at)].filter((t): t is number => t != null);
  return times.length ? Math.max(...times) : null;
}

/** Map each `state.events[].id` to the seq of the record that created it, by
 *  replaying one record at a time. Recompute from the CURRENT effective log:
 *  ids are reducer-assigned (football: a running counter), so removing an
 *  earlier event renumbers the later ones. Sports without `state.events` → {}. */
export function eventSeqs<S>(plugin: Pick<SportPlugin<S>, 'createInitialState' | 'reducer'>, config: Record<string, unknown> | undefined, eff: MatchEventRecord[]): Record<number, number> {
  const out: Record<number, number> = {};
  const idsOf = (s: S): unknown[] | null => {
    const evs = (s as { events?: unknown } | null | undefined)?.events;
    return Array.isArray(evs) ? evs.map((x) => (x as { id?: unknown } | null)?.id) : null;
  };
  let s = plugin.createInitialState(config);
  let prev = new Set<unknown>(idsOf(s) ?? []);
  let hasEvents = idsOf(s) != null;
  for (const e of eff) {
    s = plugin.reducer(s, toAction(e));
    const ids = idsOf(s);
    if (!ids) continue;
    hasEvents = true;
    // "new" = not present in the previous state (an id reused after a removal
    // maps to the record that created the entry now on screen)
    for (const id of ids) if (typeof id === 'number' && !prev.has(id)) out[id] = e.seq;
    prev = new Set(ids);
  }
  return hasEvents ? out : {};
}

/** Exactly reverse an AMEND row's stored deltas (live undo of a correction). */
export function undoAmendDeltas(amendRecord: Pick<MatchEventRecord, 'payload'>): StatDelta[] {
  const deltas = ((amendRecord.payload as Partial<AmendPayload> | null | undefined)?.deltas ?? []) as StatDelta[];
  return deltas.map((d) => ({ playerId: d.playerId, stat: d.stat, by: -d.by }));
}
