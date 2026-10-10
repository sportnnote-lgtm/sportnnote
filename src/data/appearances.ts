/**
 * SD-11 (GEN-01) — appearance + result lines, the PURE planner.
 *
 * At completion every player who took part in a match gets a stat line (an
 * "appearance"), and every line of the match carries `result` — W / D / L / T /
 * NR — read from THAT player's side. Before this, only players credited with a
 * stat had a line, and `won` (a boolean) made every draw, tie and no-result
 * read as LOST.
 *
 * Who took part, per side (first rule that applies):
 *   1. a matchday squad / lineup is known → its starters, plus the bench players
 *      the state shows coming ON (sub events), plus bench players the sport says
 *      were involved (cricket `involvedPlayerIds`). Unused subs get no line.
 *      Starters get `starts: 1`, subs who came on `starts: 0` (not cricket — the
 *      XI all "start", so Starts would just repeat Apps).
 *   2. no squad → the team roster, but only when it is small enough to BE the
 *      side (≤ players-per-side, and always for a 1-player / 2-player entry:
 *      chess, carrom, racket singles and doubles). A 20-player school house with
 *      no squad would otherwise give everyone an appearance.
 *   3. otherwise nobody new — players credited with a stat already have a line.
 * Every id goes through `mapId` (resolved participation disputes) first.
 *
 * Idempotent: a line is inserted only when the player has none, and an existing
 * line is only written when its result / won / starts actually change.
 * No React Native imports — node tests load this file.
 */
import type { LineResult } from '../core/types';

export type { LineResult };
type Side = 'home' | 'away';

/** The bits of a match the outcome depends on. */
export interface OutcomeMatch {
  sport: string;
  status?: string;
  winner?: 'home' | 'away' | 'draw' | null;
  result?: { kind: string; winner?: Side } | null;
}

/** Each side's result for a match, or null while it isn't decided (scheduled /
 *  live / a completed match with no winner recorded). Mirrors the SQL backfill
 *  in migration 0050 rule for rule. */
export function sideResults(m: OutcomeMatch): { home: LineResult; away: LineResult } | null {
  const kind = m.result?.kind;
  const both = (r: LineResult) => ({ home: r, away: r });
  if (kind === 'no_result' || kind === 'abandoned') return both('NR');
  // Before migration 0040 a no-result was saved as status 'cancelled' (a match
  // that was never played has no lines, so this only ever labels played ones).
  if (m.status === 'cancelled') return both('NR');
  if (m.status !== 'completed') return null;
  if (kind === 'tie') return both('T');
  if (kind === 'draw') return both('D');
  const awarded = kind === 'awarded' || kind === 'conceded';
  const w = awarded ? (m.result?.winner ?? m.winner) : m.winner;
  if (w === 'home') return { home: 'W', away: 'L' };
  if (w === 'away') return { home: 'L', away: 'W' };
  if (awarded) return null;
  // A level finish: limited-overs cricket calls it a tie; everything else a draw.
  if (w === 'draw') return both(m.sport === 'cricket' ? 'T' : 'D');
  return null;
}

/** Which side a line belongs to, from its `opponent` label (the other team's
 *  name, written on every line). Undefined when it can't tell. */
export function sideFromOpponent(opponent: string | undefined, names: { home?: string; away?: string }): Side | undefined {
  if (!opponent || names.home === names.away) return undefined;
  if (opponent === names.away) return 'home';
  if (opponent === names.home) return 'away';
  return undefined;
}

/** Players coming ON in a sub event, from any sport's event list: football
 *  (`secondId` / `secondName`), basketball (`onName`), kabaddi (`detail`
 *  "On ⬆  Off ⬇"). Removed events are already gone from the list. */
export function subsCameOn(state: unknown): { ids: string[]; names: string[] } {
  const ids: string[] = [], names: string[] = [];
  const evs = (state as { events?: unknown })?.events;
  if (!Array.isArray(evs)) return { ids, names };
  for (const e of evs as Record<string, unknown>[]) {
    if (!e || (e.type !== 'sub' && e.kind !== 'sub')) continue;
    if (typeof e.secondId === 'string' && e.secondId) ids.push(e.secondId);
    for (const k of ['secondName', 'onName'] as const) if (typeof e[k] === 'string' && e[k]) names.push(e[k] as string);
    if (typeof e.detail === 'string') {
      const m = /^(.+?)\s*⬆/.exec(e.detail);
      if (m && m[1].trim()) names.push(m[1].trim());
    }
  }
  return { ids, names };
}

export interface ExistingLine {
  id: string;
  playerId: string;
  stats: Record<string, number>;
  won: boolean;
  result?: LineResult;
  opponent?: string;
}

export interface AppearanceInput {
  sport: string;
  /** `sideResults(match)`; null → nothing to write (not decided yet) */
  outcome: { home: LineResult; away: LineResult } | null;
  /** team names — the opponent label on new lines, and side-from-opponent */
  names: { home?: string; away?: string };
  squads?: { home: { starters: string[]; subs: string[] }; away: { starters: string[]; subs: string[] } };
  /** the pitch lineup (football) — slots with a player are starters */
  lineup?: { home: { playerId?: string }[]; away: { playerId?: string }[] };
  rosters: { home: string[]; away: string[] };
  /** players per side from the format (roster fallback limit) */
  perSide?: number;
  /** `subsCameOn(state)` */
  cameOn?: { ids: string[]; names: string[] };
  /** id → full name, for matching name-only sub events to bench players */
  playerNames?: Record<string, string>;
  /** the sport's `involvedPlayerIds(state)` (cricket: a fielding sub who took a catch) */
  involved?: string[];
  /** this match's existing (non-field-event) lines in this sport */
  existing: ExistingLine[];
  mapId?: (playerId: string) => string;
}

export type AppearanceWrite =
  | { kind: 'insert'; playerId: string; side: Side; stats: Record<string, number>; result: LineResult; won: boolean; opponent?: string }
  | { kind: 'update'; id: string; playerId: string; patch: { stats?: Record<string, number>; result?: LineResult; won?: boolean } };

/** Sports whose whole matchday XI "starts" — no Starts figure there. */
const NO_STARTS = new Set(['cricket']);

interface SidePlan { players: Set<string>; starters: Set<string>; lineupKnown: boolean }

export function planAppearances(input: AppearanceInput): AppearanceWrite[] {
  const { outcome } = input;
  if (!outcome) return [];
  const mapId = input.mapId ?? ((id: string) => id);
  const startsTracked = !NO_STARTS.has(input.sport);
  const nameToId = (side: Side, name: string): string | undefined => {
    const bench = input.squads?.[side].subs ?? [];
    return bench.find((id) => input.playerNames?.[id] === name);
  };

  const planSide = (side: Side): SidePlan => {
    const sq = input.squads?.[side];
    const lu = input.lineup?.[side] ?? [];
    const starters = new Set<string>([...(sq?.starters ?? []), ...lu.map((s) => s.playerId).filter((x): x is string => !!x)]);
    if (starters.size) {
      const players = new Set(starters);
      const bench = new Set(sq?.subs ?? []);
      for (const id of input.cameOn?.ids ?? []) if (bench.has(id)) players.add(id);
      for (const n of input.cameOn?.names ?? []) { const id = nameToId(side, n); if (id) players.add(id); }
      for (const id of input.involved ?? []) if (bench.has(id)) players.add(id);
      return { players: mapSet(players, mapId), starters: mapSet(starters, mapId), lineupKnown: true };
    }
    const roster = input.rosters[side] ?? [];
    if (roster.length && roster.length <= Math.max(2, input.perSide ?? 0)) {
      return { players: mapSet(new Set(roster), mapId), starters: new Set(), lineupKnown: false };
    }
    return { players: new Set(), starters: new Set(), lineupKnown: false };
  };
  const plans = { home: planSide('home'), away: planSide('away') };

  // Who plays for which side. Someone listed on both sides is left alone.
  const sideOf = new Map<string, Side | null>();
  for (const side of ['home', 'away'] as const) {
    for (const id of plans[side].players) sideOf.set(id, sideOf.has(id) && sideOf.get(id) !== side ? null : side);
  }
  // A known side for an EXISTING line: participant, else squad / roster
  // membership (only one side), else its opponent label.
  const memberSide = (pid: string): Side | undefined => {
    const inSide = (side: Side) => {
      const sq = input.squads?.[side];
      const pool = [...(sq?.starters ?? []), ...(sq?.subs ?? []), ...(input.rosters[side] ?? [])].map(mapId);
      return pool.includes(pid);
    };
    const h = inSide('home'), a = inSide('away');
    return h && !a ? 'home' : a && !h ? 'away' : undefined;
  };

  const writes: AppearanceWrite[] = [];
  const startsFor = (side: Side, pid: string): number | undefined =>
    startsTracked && plans[side].lineupKnown && plans[side].players.has(pid) ? (plans[side].starters.has(pid) ? 1 : 0) : undefined;

  const have = new Set<string>();
  for (const line of input.existing) {
    have.add(line.playerId);
    const known = sideOf.get(line.playerId);
    const side: Side | undefined = known === null ? undefined
      : known ?? memberSide(line.playerId) ?? sideFromOpponent(line.opponent, input.names);
    const result: LineResult | undefined = side ? outcome[side] : outcome.home === outcome.away ? outcome.home : undefined;
    if (!result) continue;
    const patch: { stats?: Record<string, number>; result?: LineResult; won?: boolean } = {};
    if (line.result !== result) patch.result = result;
    if (line.won !== (result === 'W')) patch.won = result === 'W';
    const starts = side ? startsFor(side, line.playerId) : undefined;
    if (starts !== undefined && line.stats.starts !== starts) patch.stats = { ...line.stats, starts };
    if (Object.keys(patch).length) writes.push({ kind: 'update', id: line.id, playerId: line.playerId, patch });
  }
  for (const side of ['home', 'away'] as const) {
    for (const pid of plans[side].players) {
      if (have.has(pid) || sideOf.get(pid) !== side) continue;
      have.add(pid);
      const starts = startsFor(side, pid);
      writes.push({
        kind: 'insert', playerId: pid, side,
        stats: starts === undefined ? {} : { starts },
        result: outcome[side], won: outcome[side] === 'W',
        opponent: side === 'home' ? input.names.away : input.names.home,
      });
    }
  }
  return writes;
}

function mapSet(s: Set<string>, mapId: (id: string) => string): Set<string> {
  return new Set([...s].map(mapId));
}

/* ------------------------------ read side -------------------------------- */

/** The match fields `lineResult` needs (a full `Match` fits). */
export interface ResultMatch extends OutcomeMatch {
  homeTeam: { name: string };
  awayTeam: { name: string };
}

/** A line's result for display: the stored `result`, else derived from its
 *  match (before migration 0050 / for lines written before SD-11), else the old
 *  `won` flag. Undefined for a golf round or a match still in play. */
export function lineResult(
  l: { result?: LineResult; won: boolean; opponent?: string; eventId?: string },
  m?: ResultMatch,
): LineResult | undefined {
  if (l.eventId) return undefined;
  // The match is known and back in play (an undo after full time) → no result,
  // whatever the line last stored.
  const o = m ? sideResults(m) : null;
  if (m && !o) return undefined;
  if (l.result) return l.result;
  if (!m || !o) return l.won ? 'W' : 'L';
  const side = sideFromOpponent(l.opponent, { home: m.homeTeam.name, away: m.awayTeam.name });
  if (side) return o[side];
  if (o.home === o.away) return o.home;
  return l.won ? 'W' : 'L';
}

/** History-pill label for a result. */
export const RESULT_PILL: Record<LineResult, string> = { W: 'WON', D: 'DRAW', L: 'LOST', T: 'TIE', NR: 'NO RESULT' };
