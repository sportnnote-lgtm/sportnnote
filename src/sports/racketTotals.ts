/**
 * SD-19 (GEN-06) — absolute `statTotals` for the racket / net sports: tennis,
 * padel, badminton, and the rally engine (table tennis, squash, pickleball).
 * ONE implementation: each engine is reduced to a side-level record (points,
 * games, sets, deciders, tiebreaks), then every player of a side gets that
 * record plus the points credited to them on the log. PURE (no React Native),
 * derived only — an old log replays to the same totals.
 *
 * Keys written per player (all of them, 0 when none — see the contract in
 * ../sports/types.ts `statTotals`):
 *   points            points credited to the player (the existing live key)
 *   aces              tennis only: aces credited to the player (live key)
 *   ptsWon / ptsLost  rally points the player's SIDE won / lost
 *   gamesWon / Lost   games (tennis / padel: inside sets, a match tiebreak = 1
 *                     game, ATP; badminton / TT / squash / pickleball: the games)
 *   setsWon / Lost    tennis / padel only
 *   decidersPlayed / decidersWon   the deciding set (tennis / padel) or game
 *   tiebreaksPlayed / tiebreaksWon tennis / padel: set + match tiebreaks
 *   SD-22 serve keys (src/sports/serveStats.ts, replayed from the log):
 *   srvPts / srvPtsWon  service points the player SERVED / won (doubles: only
 *                     where the server is named — tennis / padel by slot,
 *                     pickleball by court; else left out for every player)
 *   rcvPts / rcvPtsWon  the side's return points played / won
 *   tennis / padel: svcGames / svcHeld / bpFaced / bpSaved (serving player),
 *                     rtnGames / breaks / bpOpps / bpWon (the side)
 * Doubles lines also get a derived `partnerId` (not stored: no column).
 * NOT owned: tennis `doubleFaults` (credited through attribution2, which the
 * log keeps but an EDIT_LOG point list can't carry) — it stays on increments,
 * so the racket plugins set `statTotalsPartial`.
 */
import type { LiveEvent } from './liveEvents';
import type { StatTotalsContext, StatTotalsEntry } from './types';
import type { RallyState } from './rallyEngine.ts';
import type { BadmintonState } from './badminton/engine.ts';
import { type TennisState, setTiebreaks as tennisTiebreaks, standingsUnits as tennisGames } from './tennis/engine.ts';
import { type PadelState, setTiebreaks as padelTiebreaks, standingsUnits as padelGames } from './padel/engine.ts';
import { serveStats, serveCareerKeys, type ServeSport } from './serveStats.ts';

type Side = 'home' | 'away';
type PerSide = { home: number; away: number };
const SIDES: Side[] = ['home', 'away'];
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** The record of one side in one match (everything but player credits). */
export interface SideRecord {
  ptsWon: PerSide;
  games: PerSide;
  /** tennis / padel only */
  sets?: PerSide;
  /** tennis / padel only: tiebreaks played, and won per side */
  tiebreaks?: { played: number; won: PerSide };
  /** the deciding set / game was reached (played), and who won it (if done) */
  decider: { played: boolean; winner?: Side };
}

/** Which event kinds credit which live stat to the player on them. */
export type CreditMap = Record<string, string>;
const POINT_CREDITS: CreditMap = { point: 'points' };
const TENNIS_CREDITS: CreditMap = { point: 'points', ace: 'aces' };

/** Was the deciding unit reached? `units` = completed sets/games (winner per
 *  unit), `toWin` = sets/games needed, `inPlay` = the current unit has points. */
function deciderOf(winners: Side[], toWin: number, ended: boolean, inPlay: boolean): SideRecord['decider'] {
  if (!(toWin > 1)) return { played: false };
  const last = 2 * toWin - 1;
  if (winners.length >= last) return { played: true, winner: winners[last - 1] };
  const won = { home: winners.filter((w) => w === 'home').length, away: winners.filter((w) => w === 'away').length };
  const both = won.home === toWin - 1 && won.away === toWin - 1;
  return { played: both && !ended && inPlay };
}

const winnerOf = ([h, a]: [number, number]): Side => (h >= a ? 'home' : 'away');
const sumGames = (games: Array<[number, number]> | undefined, current?: PerSide): PerSide =>
  (games ?? []).reduce((t, [h, a]) => ({ home: t.home + h, away: t.away + a }), { home: current?.home ?? 0, away: current?.away ?? 0 });

/** Points won per side from a set sport's log (points + aces; tiebreaks incl.). */
function eventPoints(events: LiveEvent[] | undefined): PerSide {
  const out = { home: 0, away: 0 };
  for (const e of events ?? []) if ((e.kind === 'point' || e.kind === 'ace') && (e.side === 'home' || e.side === 'away')) out[e.side] += 1;
  return out;
}

// ------------------------------------------------------- side records --

/** Tennis: games as the SD-17 standings count them (match tiebreak = 1 game). */
export function tennisRecord(s: TennisState): SideRecord {
  const tbs = tennisTiebreaks(s);
  const won = { home: 0, away: 0 };
  let played = 0;
  for (const t of tbs) if (t) { played += 1; won[t[0] > t[1] ? 'home' : 'away'] += 1; }
  const winners = (s.sets ?? []).map(winnerOf).map((w, i) => (tbs[i] ? (tbs[i]![0] > tbs[i]![1] ? 'home' : 'away') : w));
  const inPlay = !!(s.pts?.home || s.pts?.away || s.games?.home || s.games?.away);
  return {
    ptsWon: eventPoints(s.events),
    games: tennisGames(s)?.games ?? { home: 0, away: 0 },
    sets: { home: s.setsWon?.home ?? 0, away: s.setsWon?.away ?? 0 },
    tiebreaks: { played, won },
    decider: deciderOf(winners, s.setsToWin, !!s.ended, inPlay),
  };
}

/** Padel: as tennis (golden point / short sets change nothing here). */
export function padelRecord(s: PadelState): SideRecord {
  const tbs = padelTiebreaks(s);
  const won = { home: 0, away: 0 };
  let played = 0;
  for (const t of tbs) if (t) { played += 1; won[t[0] > t[1] ? 'home' : 'away'] += 1; }
  const winners = (s.sets ?? []).map(winnerOf).map((w, i) => (tbs[i] ? (tbs[i]![0] > tbs[i]![1] ? 'home' : 'away') : w));
  const inPlay = !!(s.pts?.home || s.pts?.away || s.games?.home || s.games?.away);
  return {
    ptsWon: eventPoints(s.events),
    games: padelGames(s)?.games ?? { home: 0, away: 0 },
    sets: { home: s.setsWon?.home ?? 0, away: s.setsWon?.away ?? 0 },
    tiebreaks: { played, won },
    decider: deciderOf(winners, s.setsToWin, !!s.ended, inPlay),
  };
}

/** Badminton and the rally engine (TT / squash / pickleball): games are the
 *  units; points = every game's score + the unfinished one. */
export function gamesRecord(s: BadmintonState | RallyState): SideRecord {
  const inPlay = !!(s.current?.home || s.current?.away);
  return {
    ptsWon: sumGames(s.games, s.current),
    games: { home: s.gamesWon?.home ?? 0, away: s.gamesWon?.away ?? 0 },
    decider: deciderOf((s.games ?? []).map(winnerOf), s.gamesToWin, !!s.ended, inPlay),
  };
}

// ------------------------------------------------------ player totals --

/** Per-side record keys for `side`. */
export function recordKeys(r: SideRecord, side: Side): Record<string, number> {
  const o = opp(side);
  const out: Record<string, number> = {
    ptsWon: r.ptsWon[side], ptsLost: r.ptsWon[o],
    gamesWon: r.games[side], gamesLost: r.games[o],
  };
  if (r.sets) { out.setsWon = r.sets[side]; out.setsLost = r.sets[o]; }
  out.decidersPlayed = r.decider.played ? 1 : 0;
  out.decidersWon = r.decider.played && r.decider.winner === side ? 1 : 0;
  if (r.tiebreaks) { out.tiebreaksPlayed = r.tiebreaks.played; out.tiebreaksWon = r.tiebreaks.won[side]; }
  return out;
}

/** Spread a side record + the log's player credits over the players. Players
 *  = `ctx.players` per side, plus anyone credited on the log (by id, else by
 *  name through ctx). A side with no known player writes nothing. */
export function playerTotals(
  events: LiveEvent[] | undefined,
  record: SideRecord,
  credits: CreditMap,
  doubles: boolean,
  ctx?: StatTotalsContext,
  /** players the state itself knows per side (e.g. a stamped volleyball six) */
  known?: { home?: { id: string; name?: string }[]; away?: { id: string; name?: string }[] },
): Record<string, StatTotalsEntry> {
  const roster = {
    home: [...(ctx?.players?.home ?? []), ...(known?.home ?? [])],
    away: [...(ctx?.players?.away ?? []), ...(known?.away ?? [])],
  };
  const sideById = new Map<string, Side>();
  const idByName = new Map<string, string | null>();
  for (const side of SIDES) {
    for (const p of roster[side]) {
      if (!p?.id) continue;
      if (!sideById.has(p.id)) sideById.set(p.id, side);
      if (p.name) idByName.set(p.name, idByName.has(p.name) && idByName.get(p.name) !== p.id ? null : p.id);
    }
  }
  const creditKeys = [...new Set(Object.values(credits))];
  const tally = new Map<string, Record<string, number>>();
  const order: string[] = [];
  const touch = (id: string, side: Side) => {
    if (!sideById.has(id)) sideById.set(id, side);
    if (!tally.has(id)) { tally.set(id, Object.fromEntries(creditKeys.map((k) => [k, 0]))); order.push(id); }
    return tally.get(id)!;
  };
  for (const side of SIDES) for (const p of roster[side]) if (p?.id) touch(p.id, side);
  for (const e of events ?? []) {
    const stat = e.kind ? credits[e.kind] : undefined;
    if (!stat || (e.side !== 'home' && e.side !== 'away')) continue;
    const id = e.playerId || (e.playerName ? idByName.get(e.playerName) ?? undefined : undefined);
    if (!id) continue;
    touch(id, e.side)[stat] += 1;
  }
  const out: Record<string, StatTotalsEntry> = {};
  for (const id of order) {
    const side = sideById.get(id)!;
    const entry: StatTotalsEntry = { side, stats: { ...tally.get(id)!, ...recordKeys(record, side) } };
    if (doubles) {
      const mates = order.filter((x) => x !== id && sideById.get(x) === side);
      const fromRoster = roster[side].map((p) => p.id).filter((x) => x && x !== id);
      const partner = fromRoster.length === 1 ? fromRoster[0] : mates.length === 1 ? mates[0] : undefined;
      if (partner) entry.partnerId = partner;
    }
    out[id] = entry;
  }
  return out;
}

// ----------------------------------------------- the plugin statTotals --

/** SD-22 — add the replayed serve / return keys to every line. The server is
 *  named from ctx's roster order (as the live controls do); singles with no ctx
 *  falls back to the one player credited on the side. */
function withServe(sport: ServeSport | undefined, s: { events?: LiveEvent[] } | null | undefined, totals: Record<string, StatTotalsEntry>, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  if (!sport || !s) return totals;
  const ids = (side: Side) => {
    const fromCtx = (ctx?.players?.[side] ?? []).map((p) => p.id).filter(Boolean);
    if (fromCtx.length) return fromCtx;
    const mine = Object.entries(totals).filter(([, e]) => e.side === side).map(([id]) => id);
    return mine.length === 1 ? mine : [];
  };
  const st = serveStats(sport, s, { home: ids('home'), away: ids('away') });
  if (!st) return totals;
  const out: Record<string, StatTotalsEntry> = {};
  for (const [id, e] of Object.entries(totals)) out[id] = { ...e, stats: { ...e.stats, ...serveCareerKeys(st, e.side, id) } };
  return out;
}

export const tennisTotals = (s: TennisState, ctx?: StatTotalsContext) =>
  withServe('tennis', s, playerTotals(s?.events, tennisRecord(s), TENNIS_CREDITS, !!s?.doubles, ctx), ctx);

export const padelTotals = (s: PadelState, ctx?: StatTotalsContext) =>
  withServe('padel', s, playerTotals(s?.events, padelRecord(s), POINT_CREDITS, s?.doubles !== false, ctx), ctx);

export const badmintonTotals = (s: BadmintonState, ctx?: StatTotalsContext) =>
  withServe('badminton', s, playerTotals(s?.events, gamesRecord(s), POINT_CREDITS, !!s?.doubles, ctx), ctx);

/** Table tennis, squash, pickleball. A side-out 'rally' event credits nobody.
 *  `sport` names the serve rule (the rally state doesn't know its sport):
 *  without it the SD-22 serve keys are left out (unknown, not 0). */
export const rallyTotals = (s: RallyState, ctx?: StatTotalsContext, sport?: 'tabletennis' | 'squash' | 'pickleball') =>
  withServe(sport, s, playerTotals(s?.events, gamesRecord(s), POINT_CREDITS, !!s?.doubles, ctx), ctx);

/** The keys each sport's totals own (for docs, schema and tests). */
export const RACKET_RECORD_KEYS = ['ptsWon', 'ptsLost', 'gamesWon', 'gamesLost', 'decidersPlayed', 'decidersWon'] as const;
export const SET_RECORD_KEYS = ['setsWon', 'setsLost', 'tiebreaksPlayed', 'tiebreaksWon'] as const;
export { SERVE_KEYS, SERVE_SET_KEYS } from './serveStats.ts';

// ------------------------------------------------ volleyball set record --

/** SD-19 — volleyball's set record on every line: `setsWon` / `setsLost` of the
 *  player's team (the per-set denominators SD-16 declared). Players = ctx +
 *  the stamped court (`state.lineup`, SD-29) + anyone credited on the log. */
export function volleyballSetRecord(
  s: { setsWon?: PerSide; events?: LiveEvent[]; lineup?: { home?: { id: string; name?: string }[]; away?: { id: string; name?: string }[] } },
  ctx?: StatTotalsContext,
): Record<string, StatTotalsEntry> {
  const credits: CreditMap = { point: '_', attack: '_', ace: '_', block: '_' };
  const raw = playerTotals(s?.events, { ptsWon: { home: 0, away: 0 }, games: { home: 0, away: 0 }, decider: { played: false } }, credits, false, ctx, s?.lineup);
  const out: Record<string, StatTotalsEntry> = {};
  for (const [id, e] of Object.entries(raw)) {
    out[id] = { side: e.side, stats: { setsWon: s?.setsWon?.[e.side] ?? 0, setsLost: s?.setsWon?.[opp(e.side)] ?? 0 } };
  }
  return out;
}

/** Merge two partial totals (same player → keys combined). */
export function mergeTotals(a: Record<string, StatTotalsEntry>, b: Record<string, StatTotalsEntry>): Record<string, StatTotalsEntry> {
  const out: Record<string, StatTotalsEntry> = {};
  for (const [id, e] of Object.entries(a)) out[id] = { ...e, stats: { ...e.stats } };
  for (const [id, e] of Object.entries(b)) {
    const cur = out[id];
    out[id] = cur ? { ...cur, stats: { ...cur.stats, ...e.stats } } : { ...e, stats: { ...e.stats } };
  }
  return out;
}
