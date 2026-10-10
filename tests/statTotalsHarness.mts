/**
 * SD-19 — the shared `statTotals` contract harness (see the contract on
 * `SportPlugin.statTotals` in src/sports/types.ts). Not a test file itself;
 * tests/stat-totals-contract.test.mts runs it over every sport that implements
 * statTotals, and later items (football SD-30, basketball, kabaddi, carrom…)
 * add their case there.
 *
 * "Live increments" are exactly what useLiveMatch writes on dispatch: every
 * event's `attribution` (by, default 1) + its `extra`, and a second
 * `attribution2` (stored as `payload._attr2`) — `attributionTotals` of the
 * EFFECTIVE log (AMEND ops applied; an AMEND's stored deltas move the lines by
 * exactly that difference). An undo removes the last event and reverses its
 * credits, so every prefix of the log is a state the lines must also match.
 */
import assert from 'node:assert/strict';
import type { MatchEventRecord } from '../src/core/types.ts';
import type { ScoreAction, StatTotalsContext, StatTotalsEntry } from '../src/sports/types.ts';
import { attributionTotals, effectiveLog, replayLog, AMEND_TYPE, type AmendOp, statDeltas } from '../src/sports/amend.ts';

export type Totals = Record<string, StatTotalsEntry>;

export interface TotalsSport<S> {
  name: string;
  init: (config?: Record<string, unknown>) => S;
  reducer: (s: S, a: ScoreAction) => S;
  statTotals: (s: S, ctx?: StatTotalsContext) => Totals;
  /** the plugin's `statTotalsPartial` */
  partial?: boolean;
  config?: Record<string, unknown>;
  ctx?: StatTotalsContext;
  /** owned keys that are never credited live (games won, minutes…): checked
   *  only for being finite and ≥ 0. A function decides per key. */
  derived: readonly string[] | ((key: string) => boolean);
}

/** Stored rows for a list of dispatched actions (as useLiveMatch persists them). */
export function toRecords(actions: ScoreAction[], startSeq = 1): MatchEventRecord[] {
  return actions.map((a, i) => ({
    seq: startSeq + i,
    type: a.type,
    side: a.side ?? null,
    payload: a.attribution2 ? { ...(a.payload ?? {}), _attr2: a.attribution2 } : a.payload ?? {},
    attribution: a.attribution ?? null,
  }));
}

/** An AMEND row (#05) with the deltas it would store. */
export function amendRecord(records: MatchEventRecord[], ops: AmendOp[]): MatchEventRecord {
  const before = effectiveLog(records);
  const seq = Math.max(0, ...records.map((r) => r.seq)) + 1;
  const draft: MatchEventRecord = { seq, type: AMEND_TYPE, side: null, payload: { ops, lines: [], byName: 'test', deltas: [] }, attribution: null };
  const after = effectiveLog([...records, draft]);
  return { ...draft, payload: { ops, lines: [], byName: 'test', deltas: statDeltas(before, after) } };
}

/** What the stat lines hold after live play: the credits of the effective log. */
export const liveSums = (records: MatchEventRecord[]) => attributionTotals(effectiveLog(records));

export const replay = <S,>(sp: TotalsSport<S>, records: MatchEventRecord[]): S =>
  replayLog({ createInitialState: sp.init, reducer: sp.reducer }, sp.config, records);

const isDerived = (sp: TotalsSport<unknown>, k: string) =>
  typeof sp.derived === 'function' ? sp.derived(k) : sp.derived.includes(k);

/** Every contract violation of `totals` against the live sums (empty = ok). */
export function contractErrors<S>(sp: TotalsSport<S>, totals: Totals, live: Record<string, Record<string, number>>, where = ''): string[] {
  const errs: string[] = [];
  const owned = new Set<string>();
  for (const t of Object.values(totals)) for (const k of Object.keys(t.stats)) owned.add(k);
  // (5) derived keys: finite, ≥ 0
  for (const [id, t] of Object.entries(totals)) {
    if (t.side !== 'home' && t.side !== 'away') errs.push(`${where}${id}: bad side ${t.side}`);
    for (const [k, v] of Object.entries(t.stats)) {
      if (!Number.isFinite(v)) errs.push(`${where}${id}.${k} = ${v} (not finite)`);
      else if (isDerived(sp as TotalsSport<unknown>, k) && v < 0) errs.push(`${where}${id}.${k} = ${v} (< 0)`);
    }
  }
  // (2) owned live keys = the live sum, per player (a missing key reads 0 — rule 4)
  const players = new Set([...Object.keys(totals), ...Object.keys(live)]);
  for (const k of owned) {
    if (isDerived(sp as TotalsSport<unknown>, k)) continue;
    for (const id of players) {
      const want = live[id]?.[k] ?? 0;
      const got = totals[id]?.stats[k] ?? 0;
      if (want !== got) errs.push(`${where}${id}.${k}: totals ${got} ≠ live ${want}`);
    }
  }
  // (6) a whole-line sport must own every key it credits live
  if (!sp.partial) {
    for (const [id, stats] of Object.entries(live)) {
      for (const [k, v] of Object.entries(stats)) if (v !== 0 && !owned.has(k)) errs.push(`${where}${id}.${k}: credited live (${v}) but not owned by a non-partial statTotals`);
    }
  }
  return errs;
}

/** (1)–(6) on a full log and on its prefixes (undo). `every` = check every
 *  n-th prefix (1 = all). Returns the final totals. */
export function assertContract<S>(sp: TotalsSport<S>, records: MatchEventRecord[], opts: { every?: number; label?: string } = {}): Totals {
  const every = Math.max(1, opts.every ?? 1);
  const label = `${sp.name}${opts.label ? ` · ${opts.label}` : ''}`;
  const totalsOf = (recs: MatchEventRecord[]) => sp.statTotals(replay(sp, recs), sp.ctx);
  const final = totalsOf(records);
  // (1) pure: same log → same totals
  assert.deepEqual(totalsOf(records), final, `${label}: totals not deterministic`);
  const errs = contractErrors(sp, final, liveSums(records), `${label}: `);
  // A correction (EDIT_LOG + its STAT_ADJUSTs) is dispatched as one batch, so
  // pass an `every` larger than the batch to skip cuts inside it.
  for (let n = records.length - every; n >= 0; n -= every) {
    const pre = records.slice(0, n);
    errs.push(...contractErrors(sp, totalsOf(pre), liveSums(pre), `${label} · undo to ${n} events: `));
  }
  assert.deepEqual(errs, [], errs.slice(0, 12).join('\n'));
  return final;
}

/** (3) a corrected log gives the totals of the same match scored cleanly, and
 *  still matches its own live sums. */
export function assertSameAsClean<S>(sp: TotalsSport<S>, corrected: MatchEventRecord[], clean: MatchEventRecord[], label = 'correction'): void {
  const a = sp.statTotals(replay(sp, corrected), sp.ctx);
  const b = sp.statTotals(replay(sp, clean), sp.ctx);
  assert.deepEqual(normalize(a), normalize(b), `${sp.name} · ${label}: corrected ≠ clean`);
  const errs = contractErrors(sp, a, liveSums(corrected), `${sp.name} · ${label}: `);
  assert.deepEqual(errs, [], errs.join('\n'));
}

/** Totals with zero keys dropped (a 0 and a missing owned key are the same). */
export function normalize(t: Totals): Record<string, { side: string; stats: Record<string, number> }> {
  const out: Record<string, { side: string; stats: Record<string, number> }> = {};
  for (const id of Object.keys(t).sort()) {
    const stats: Record<string, number> = {};
    for (const k of Object.keys(t[id].stats).sort()) if (t[id].stats[k] !== 0) stats[k] = t[id].stats[k];
    out[id] = { side: t[id].side, stats };
  }
  return out;
}
