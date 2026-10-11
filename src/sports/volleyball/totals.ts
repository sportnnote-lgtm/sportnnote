/**
 * SD-32 (VB-03) — volleyball's absolute `statTotals`: the point credits the
 * log gives each player, keyed by player id. PURE.
 *
 *  - Box keys: exactly what the controls credit live (`volleyballCredits`) —
 *    `points` (every credited point: attack, block, ace, or an outcome not
 *    recorded), `attackPoints` (kills), `blocks` (block points) and `aces`,
 *    summed over the log. Edits (EDIT_LOG + STAT_ADJUST), undos and a retried
 *    upload can't drift. Older lines heal: before SD-04 an ace / block didn't
 *    also credit `points` live; the re-sync (D2) sets the line to the log.
 *  - Errors / serve errors are player keys only when the scorer named the
 *    erring opponent (SD-117b "Opp. fault" → `errors`; SD-58 a missed serve
 *    pre-filled with the opponent's server → `serveErrors`), keyed coverage.
 *    The team figures stay in src/sports/boxSources.ts.
 *  - `setsPlayed` (SD-29, fieldTime.ts) and `setsWon` / `setsLost` (SD-19,
 *    racketTotals.ts) are merged in.
 *
 * Ids: once a court is stamped (SD-29, `LINEUP`) each credited point carries
 * its `playerId`. Older logs carry names only — they resolve per side through
 * the stamped court and the matchday squads (`ctx`). If ANY credited name
 * can't be resolved (or is ambiguous), the box keys are left out entirely and
 * the lines keep moving by live increments, as before — the sync zeroes owned
 * keys for players missing from the totals, so a partial guess would wipe
 * real stats (the SD-40 / SD-30 safeguard).
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { mergeTotals, volleyballSetRecord } from '../racketTotals.ts';
import { volleyballCredits, type VolleyballState } from './engine.ts';
import { volleyballTotals } from './fieldTime.ts';
import type { PointKind } from '../rallyEdit.ts';

type Side = 'home' | 'away';

/** The box keys the totals own (all of them, or none). */
export const VOLLEYBALL_BOX_KEYS = ['points', 'attackPoints', 'blocks', 'aces'] as const;
/** Owned here but never credited live. */
export const VOLLEYBALL_DERIVED_KEYS = ['setsPlayed', 'setsWon', 'setsLost'] as const;

const CREDITED = new Set<string>(['point', 'attack', 'block', 'ace']);

/** name → id per side (court stamp + ctx); a name with two ids is ambiguous. */
function nameIndex(s: VolleyballState, ctx?: StatTotalsContext): Record<Side, Map<string, string | null>> {
  const idx: Record<Side, Map<string, string | null>> = { home: new Map(), away: new Map() };
  const note = (side: Side, id?: string, name?: string) => {
    if (!id || !name) return;
    const cur = idx[side].get(name);
    if (cur === undefined) idx[side].set(name, id);
    else if (cur !== id) idx[side].set(name, null);
  };
  for (const side of ['home', 'away'] as const) {
    for (const p of s.lineup?.[side] ?? []) note(side, p.id, p.name);
    for (const p of ctx?.players?.[side] ?? []) note(side, p.id, p.name);
  }
  for (const e of s.events ?? []) if (e.side === 'home' || e.side === 'away') note(e.side, e.playerId, e.playerName);
  return idx;
}

/** The box keys per player id — empty when any credited name is unresolved. */
export function volleyballBoxTotals(s: VolleyballState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  if (!s?.events) return out;
  const idx = nameIndex(s, ctx);
  for (const e of s.events) {
    if (!CREDITED.has(e.kind ?? '') || !e.playerName || (e.side !== 'home' && e.side !== 'away')) continue;
    const id = e.playerId || idx[e.side].get(e.playerName) || undefined;
    if (!id) return {}; // the safeguard: leave the whole group out
    const line = out[id] ?? (out[id] = { side: e.side, stats: Object.fromEntries(VOLLEYBALL_BOX_KEYS.map((k) => [k, 0])) });
    for (const [k, v] of Object.entries(volleyballCredits(e.kind as PointKind))) line.stats[k] = (line.stats[k] ?? 0) + v;
  }
  return out;
}

/** SD-117b — `errors` per player id: each "Opp. fault" that names the erring
 *  opponent charges them one. SD-58 — `serveErrors` the same way: each missed
 *  serve that names the opponent's server. Written only for a match that named
 *  at least one (coverage 'keyed': every other match reads "not tracked",
 *  never 0) — then on every line of the match, 0 for the rest. Left out whole
 *  when a named player can't be resolved (the same safeguard as the box keys). */
function chargedTotals(kind: 'opperror' | 'serveerror', key: string, s: VolleyballState, ctx: StatTotalsContext | undefined, lines: Record<string, StatTotalsEntry>): Record<string, StatTotalsEntry> {
  const faults = (s?.events ?? []).filter((e) => e.kind === kind && e.oe?.playerName && (e.side === 'home' || e.side === 'away'));
  if (!faults.length) return {};
  const idx = nameIndex(s, ctx);
  const count = new Map<string, { side: Side; n: number }>();
  for (const e of faults) {
    const side: Side = e.side === 'home' ? 'away' : 'home'; // the erring side
    const id = e.oe!.playerId || idx[side].get(e.oe!.playerName!) || undefined;
    if (!id) return {};
    const c = count.get(id) ?? { side, n: 0 };
    c.n += 1;
    count.set(id, c);
  }
  const out: Record<string, StatTotalsEntry> = {};
  for (const [id, e] of Object.entries(lines)) out[id] = { side: e.side, stats: { [key]: 0 } };
  for (const [id, c] of count) out[id] = { side: out[id]?.side ?? c.side, stats: { [key]: c.n } };
  return out;
}
export const volleyballErrorTotals = (s: VolleyballState, ctx: StatTotalsContext | undefined, lines: Record<string, StatTotalsEntry>) =>
  chargedTotals('opperror', VOLLEYBALL_ERROR_KEY, s, ctx, lines);
/** SD-58 / SD-81 — `serveErrors` per player id (keyed coverage). */
export const volleyballServeErrorTotals = (s: VolleyballState, ctx: StatTotalsContext | undefined, lines: Record<string, StatTotalsEntry>) =>
  chargedTotals('serveerror', VOLLEYBALL_SERVE_ERROR_KEY, s, ctx, lines);
export const VOLLEYBALL_SERVE_ERROR_KEY = 'serveErrors';
export const VOLLEYBALL_ERROR_KEY = 'errors';

/** The plugin's `statTotals`: box keys, SD-29 sets played, SD-19 set record,
 *  SD-117b errors (only for a match that named an erring player), SD-58
 *  serve errors (only for a match that named a server who missed). */
export const volleyballStatTotals = (s: VolleyballState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> => {
  const base = mergeTotals(mergeTotals(volleyballBoxTotals(s, ctx), volleyballTotals(s)), volleyballSetRecord(s, ctx));
  const withErrors = mergeTotals(base, volleyballErrorTotals(s, ctx, base));
  return mergeTotals(withErrors, volleyballServeErrorTotals(s, ctx, withErrors));
};
