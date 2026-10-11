/**
 * SD-37 (CR-02) — carrom's absolute `statTotals`: every player of a side gets
 * the side's match record, keyed by player id. PURE (no React Native), derived
 * only from the state (+ ctx) — an old log replays to the same totals.
 *
 * A carrom board is won by the SIDE (in doubles, by the pair), so the record
 * goes to both partners alike — the old "Finished by" credit gave everything to
 * one of them.
 *
 *  - Box keys (credited live on every board — attribution + the partner's
 *    attribution2 — and owned here): `points` = board points CAPPED per ICF
 *    (the game-winning board adds only what takes the side to 25, so a
 *    player's points = their side's game scores), `boards` (boards won),
 *    `queens` (Queens covered by the board winner).
 *  - Derived keys (never credited live, ≥ 0): `gamesWon` / `gamesLost`,
 *    `boardsPlayed` (every board of the match, both sides play each one),
 *    `whiteSlams` / `blackSlams` (boards the side won with a slam — SD-37's
 *    optional `slam` on BOARD; old logs: 0) and `zeroGames` (games won 25-0).
 *
 * Players per side = `ctx.players` (matchday squad, else a 1–2 player entry)
 * plus everyone the log credited on that side (`state.credited`). A credit
 * with a name but no id (none today) resolves through ctx; if any can't be
 * resolved the BOX keys are left out entirely and those lines keep moving by
 * live increments — the sync zeroes owned keys for players missing from the
 * totals, so a partial guess would wipe real stats (the SD-30 / SD-32
 * safeguard). Derived keys are still written to the players that are known.
 *
 * Corrections: a capped board's value depends on the boards before it, so an
 * AMEND that changes an earlier board of the same game can leave the stored
 * live `by` of a later game-winning board stale. The plugin is partial, so
 * the completion / correction sync SETS these keys from the replay — the
 * totals are always right; only the in-between live line may lag.
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { boardBreakers, creditedPoints, type CarromState } from './engine.ts';

type Side = 'home' | 'away';
const SIDES: Side[] = ['home', 'away'];

/** The keys credited live (and owned here, all or none). */
export const CARROM_BOX_KEYS = ['points', 'boards', 'queens'] as const;
/** Owned here, never credited live. */
export const CARROM_DERIVED_KEYS = ['gamesWon', 'gamesLost', 'boardsPlayed', 'whiteSlams', 'blackSlams', 'zeroGames'] as const;
/** SD-117c — derived keys written only on a match that tracked them ('keyed'
 *  coverage: an older line reads "not tracked", never 0):
 *   boardBreaks / boardBreaksWon — boards the side broke / won on its own break (the
 *     toss was recorded: FIRST_BREAK);
 *   lostQueens — boards the side LOST after covering the Queen (the three-way
 *     Queen chip was used on any board). */
export const CARROM_BREAK_KEYS = ['boardBreaks', 'boardBreaksWon'] as const;
export const CARROM_QUEEN_KEYS = ['lostQueens'] as const;

/** One side's record for the match. */
export function carromSideRecord(s: CarromState, side: Side): Record<string, number> {
  const capped = creditedPoints(s);
  const opp: Side = side === 'home' ? 'away' : 'home';
  let points = 0, boards = 0, queens = 0, whiteSlams = 0, blackSlams = 0;
  (s?.boards ?? []).forEach((b, i) => {
    if (b.winner !== side) return;
    points += capped[i];
    if (b.penalty) return; // SD-68 — penalty points count, but not as a board won
    boards += 1;
    if (b.queen) queens += 1;
    if (b.slam === 'white') whiteSlams += 1;
    if (b.slam === 'black') blackSlams += 1;
  });
  const idx = side === 'home' ? 0 : 1;
  const games = s?.games ?? [];
  const won = games.filter((g) => g[idx] > g[1 - idx]);
  // SD-117c — the break (when the toss was recorded) and the losing side's Queen
  const extra: Record<string, number> = {};
  if (s?.firstBreak) {
    const br = boardBreakers(s);
    extra.boardBreaks = br.filter((x) => x === side).length;
    extra.boardBreaksWon = (s.boards ?? []).filter((b, i) => br[i] === side && b.winner === side).length;
  }
  if ((s?.boards ?? []).some((b) => b.queenBy)) {
    extra.lostQueens = (s.boards ?? []).filter((b) => b.winner === opp && b.queenBy === 'loser').length;
  }
  return {
    ...extra,
    points, boards, queens,
    gamesWon: s?.gamesWon?.[side] ?? won.length,
    gamesLost: s?.gamesWon?.[opp] ?? games.length - won.length,
    boardsPlayed: s?.boards?.length ?? 0,
    whiteSlams, blackSlams,
    zeroGames: won.filter((g) => g[1 - idx] === 0).length,
  };
}

/** The ids of each side's players, and whether every credit resolved. */
function playersOf(s: CarromState, ctx?: StatTotalsContext): { ids: Record<Side, string[]>; resolved: boolean } {
  const ids: Record<Side, string[]> = { home: [], away: [] };
  const add = (side: Side, id?: string) => { if (id && !ids[side].includes(id)) ids[side].push(id); };
  for (const side of SIDES) for (const p of ctx?.players?.[side] ?? []) add(side, p.id);
  let resolved = true;
  for (const c of s?.credited ?? []) {
    if (c.side !== 'home' && c.side !== 'away') continue;
    if (c.id) { add(c.side, c.id); continue; }
    const hits = [...new Set((ctx?.players?.[c.side] ?? []).filter((p) => p.name && p.name === c.name).map((p) => p.id))];
    if (hits.length === 1) add(c.side, hits[0]);
    else resolved = false; // unknown or ambiguous: the safeguard
  }
  return { ids, resolved };
}

/** The plugin's `statTotals`. */
export function carromStatTotals(s: CarromState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  if (!s || !Array.isArray(s.boards)) return out;
  const { ids, resolved } = playersOf(s, ctx);
  for (const side of SIDES) {
    const rec = carromSideRecord(s, side);
    const stats: Record<string, number> = {};
    for (const k of CARROM_DERIVED_KEYS) stats[k] = rec[k];
    for (const k of [...CARROM_BREAK_KEYS, ...CARROM_QUEEN_KEYS]) if (k in rec) stats[k] = rec[k];
    if (resolved) for (const k of CARROM_BOX_KEYS) stats[k] = rec[k];
    const list = ids[side];
    for (const id of list) {
      out[id] = { side, stats: { ...stats }, ...(list.length === 2 ? { partnerId: list.find((x) => x !== id) } : {}) };
    }
  }
  return out;
}

/** SD-37 — the players a board credits live: the whole side when the roster
 *  IS the side (singles 1, doubles 2), else the ones picked ("Played by",
 *  default the first `perSide` — the matchday starters come first). */
export function creditedPlayers<P extends { id: string }>(roster: P[], perSide: number, picked?: string[]): P[] {
  if (roster.length <= perSide) return roster;
  const chosen = roster.filter((p) => picked?.includes(p.id)).slice(0, perSide);
  return chosen.length ? chosen : roster.slice(0, perSide);
}
