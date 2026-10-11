/**
 * SD-119 — the `opponent` label on a stat line, from the side the player
 * played for. PURE (node tests load it).
 *
 * Every line names the side its player did NOT play for (the other team's
 * name; for doubles the opposing pair's team label). Before SD-119 the live
 * layer took the side from the ACTION (`action.side` — the winner, the side
 * that scored the point), so a chess / golf result credited to both players,
 * a double fault (point to the receiver, fault on the server), a volleyball
 * opponent's error, a kabaddi tackle or a cricket bowler's wicket (side =
 * batting side) named the player's OWN team as the opponent.
 *
 * The player's side, first rule that applies:
 *   1. the credit says so (`Attribution.side`, set by plugins that know);
 *   2. the player is on exactly one side's roster / squad;
 *   3. the action's side (the old rule — right for a goal, a point won, runs).
 * Unknown → no label (better than a wrong one).
 */
export type Side = 'home' | 'away';

export interface SideRosters { home: readonly string[]; away: readonly string[] }
export interface SideNames { home?: string; away?: string }

/** The side whose roster holds the player — only when exactly one does. */
export function rosterSide(playerId: string, rosters?: SideRosters | null): Side | undefined {
  if (!rosters || !playerId) return undefined;
  const h = rosters.home.includes(playerId), a = rosters.away.includes(playerId);
  return h && !a ? 'home' : a && !h ? 'away' : undefined;
}

/** The side a credited player played for (rules above). */
export function creditedSide(
  credit: { playerId: string; side?: Side },
  actionSide: Side | undefined,
  rosters?: SideRosters | null,
): Side | undefined {
  return credit.side ?? rosterSide(credit.playerId, rosters) ?? actionSide;
}

/** The other side's name for a player on `side`. */
export function opponentOf(side: Side | undefined, names: SideNames): string | undefined {
  if (side === 'home') return names.away;
  if (side === 'away') return names.home;
  return undefined;
}

/** The opponent label for a credit (`creditedSide` → the other team's name). */
export function creditOpponent(
  credit: { playerId: string; side?: Side },
  actionSide: Side | undefined,
  names: SideNames,
  rosters?: SideRosters | null,
): string | undefined {
  return opponentOf(creditedSide(credit, actionSide, rosters), names);
}

interface CreditLike {
  playerId: string; stat: string; by?: number; extra?: Record<string, number>; tracked?: string[]; side?: Side;
}

/** One stat-line increment a dispatched action writes. */
export interface LineCredit {
  playerId: string; stat: string; by: number; opponent?: string; tracked?: string[];
  /** from `attribution` (the follower alert goes with it), not `attribution2` */
  primary: boolean;
}

/** Every stat-line increment an action credits — `attribution` and its extras,
 *  then `attribution2` and its extras — each labelled with the opponent of
 *  THAT player's side. The live layer writes these on dispatch. */
export function actionLineCredits(
  action: { side?: Side; attribution?: CreditLike; attribution2?: CreditLike },
  names: SideNames,
  rosters?: SideRosters | null,
): LineCredit[] {
  const out: LineCredit[] = [];
  const add = (a: CreditLike | undefined, primary: boolean) => {
    if (!a) return;
    const opponent = creditOpponent(a, action.side, names, rosters);
    const { playerId, tracked } = a;
    out.push({ playerId, stat: a.stat, by: a.by ?? 1, opponent, tracked, primary });
    for (const [k, v] of Object.entries(a.extra ?? {})) out.push({ playerId, stat: k, by: v, opponent, tracked, primary });
  };
  add(action.attribution, true);
  add(action.attribution2, false);
  return out;
}

/* ---------------------------- repair (backfill) ---------------------------- */

export interface OpponentRepairLine { id: string; playerId: string; opponent?: string | null }

export interface OpponentRepairWrite { id: string; playerId: string; from: string | null; to: string }

/** The `opponent` fixes for one match's lines. `sideOf` gives each player's
 *  side when it is certain (undefined = leave the line alone). Only lines whose
 *  label differs are returned; a match whose two teams share a name is skipped
 *  (no label could tell them apart). */
export function planOpponentRepair(
  lines: OpponentRepairLine[],
  sideOf: (playerId: string) => Side | undefined,
  names: SideNames,
): { writes: OpponentRepairWrite[]; unknown: number } {
  const writes: OpponentRepairWrite[] = [];
  let unknown = 0;
  if (!names.home || !names.away || names.home === names.away) return { writes, unknown: lines.length };
  for (const l of lines) {
    const side = sideOf(l.playerId);
    if (!side) { unknown += 1; continue; }
    const to = opponentOf(side, names)!;
    const from = l.opponent ?? null;
    if (from !== to) writes.push({ id: l.id, playerId: l.playerId, from, to });
  }
  return { writes, unknown };
}

/** Side lookup from several sources, most certain first: each source maps a
 *  player to a side or undefined; a source where the player is on BOTH sides
 *  should return undefined itself. */
export function firstSide(...sources: ((playerId: string) => Side | undefined)[]): (playerId: string) => Side | undefined {
  return (pid) => {
    for (const s of sources) {
      const v = s(pid);
      if (v) return v;
    }
    return undefined;
  };
}

/** A side lookup from per-side id lists: a player on both sides → undefined. */
function sidesFrom(lists: { home: Iterable<string>; away: Iterable<string> }, mapId: (id: string) => string): (pid: string) => Side | undefined {
  const m = new Map<string, Side | null>();
  for (const side of ['home', 'away'] as const) {
    for (const raw of lists[side]) {
      if (!raw) continue;
      const id = mapId(raw);
      m.set(id, m.has(id) && m.get(id) !== side ? null : side);
    }
  }
  return (pid) => m.get(pid) ?? undefined;
}

/** SD-119 repair — each player's side in ONE match, most certain source first:
 *  1. the sport's replayed totals (the side the scoring state put them on —
 *     cricket's batters and fielders, racket players);
 *  2. the matchday squad / pitch lineup;
 *  3. the team roster (now — so last).
 *  Every id goes through `mapId` (resolved participation disputes), as the
 *  lines do. A player found on both sides of a source falls to the next. */
export function matchSideOf(input: {
  totals?: Record<string, { side: Side }> | null;
  squads?: { home: { starters: string[]; subs: string[] }; away: { starters: string[]; subs: string[] } } | null;
  lineup?: { home: { playerId?: string }[]; away: { playerId?: string }[] } | null;
  rosters?: SideRosters | null;
  mapId?: (playerId: string) => string;
}): (playerId: string) => Side | undefined {
  const mapId = input.mapId ?? ((id: string) => id);
  const totals = input.totals ?? {};
  const fromTotals = sidesFrom({
    home: Object.keys(totals).filter((id) => totals[id].side === 'home'),
    away: Object.keys(totals).filter((id) => totals[id].side === 'away'),
  }, mapId);
  const sq = input.squads, lu = input.lineup;
  const fromSquad = sidesFrom({
    home: [...(sq?.home.starters ?? []), ...(sq?.home.subs ?? []), ...(lu?.home ?? []).map((s) => s.playerId ?? '')],
    away: [...(sq?.away.starters ?? []), ...(sq?.away.subs ?? []), ...(lu?.away ?? []).map((s) => s.playerId ?? '')],
  }, mapId);
  const fromRoster = sidesFrom({ home: input.rosters?.home ?? [], away: input.rosters?.away ?? [] }, mapId);
  return firstSide(fromTotals, fromSquad, fromRoster);
}
