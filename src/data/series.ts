/** Series / ties — the wrapper that turns several matches between the same two
 *  teams into one contest with a single winner. One primitive covers three real
 *  shapes:
 *    • best_of  — first to a majority of wins (cricket bilateral series, an
 *                 NBA/EuroLeague best-of-7 playoff). Once clinched, the rest are
 *                 dead rubbers.
 *    • aggregate — two legs, combined score decides it (a UCL/Libertadores
 *                 two-legged knockout). Level on aggregate → optional away-goals,
 *                 else the 2nd leg's DECIDER (extra time / penalties / 7 m played
 *                 on aggregate — SD-120), else the organiser picks who advances.
 *                 A leg 2 that was simply won on the day never settles a level
 *                 aggregate on its own.
 *    • rubbers  — a fixed set of sub-matches, most wins takes the tie (Davis Cup,
 *                 Thomas/Uber/Sudirman, a team squash/padel match).
 *
 *  Storage is deliberately light: a series has no table of its own. Its config
 *  rides on each child match's `format` under `__series*` keys, and a series is
 *  *derived* by grouping matches that share a `__seriesId`. That keeps it working
 *  in demo and live with no migration, and means the bracket can treat a tie as
 *  one pairing just by grouping. This module is pure + dependency-free so it runs
 *  the same everywhere and is unit-testable under `node --test`. */
import type { Match, SportId, SportFormat } from '../core/types';
import { chessTeamKoWinner, koBreakOf } from '../sports/chess/teamKo.ts';
import { teamScoreOf } from './walkover.ts';

/** SD-140 — a leg's score for the aggregate: its walkover / forfeit score
 *  (`result.forfeit`) when it has one, else the board (older legs unchanged). */
const legScore = (m: Match): { home: number; away: number } | undefined =>
  m.result?.forfeit ? teamScoreOf(m) : m.score ?? undefined;

export type SeriesFormat = 'best_of' | 'aggregate' | 'rubbers';

/** The `format`-key names a child match carries so a series can be reconstructed.
 *  All values are primitives (string/number/boolean) to fit SportFormat. */
export const SERIES_KEYS = {
  id: '__seriesId',
  fmt: '__seriesFmt',
  legs: '__seriesN',
  leg: '__seriesLeg',
  teamA: '__seriesA',
  name: '__seriesName',
  awayGoals: '__seriesAwayGoals',
} as const;

/** SD-120 — the organiser's "Advances: X" pick for a knockout match or tie that
 *  scoring can't settle (abandoned, a level result under a rule with no
 *  decider, a chess / cricket edge case). Stamped on the match's `format` (a
 *  tie: its last leg) so it needs no migration; the bracket reads it only when
 *  the result itself has no winner. */
export const ADVANCE_KEYS = {
  teamId: '__advances',
  reason: '__advancesReason',
  by: '__advancesBy',
  at: '__advancesAt',
} as const;

/** The format patch that records an organiser's advance pick. */
export function advancePatch(teamId: string, reason: string, byName?: string, at: string = new Date().toISOString()): Record<string, string> {
  return {
    [ADVANCE_KEYS.teamId]: teamId,
    [ADVANCE_KEYS.reason]: reason.trim(),
    [ADVANCE_KEYS.at]: at,
    ...(byName ? { [ADVANCE_KEYS.by]: byName } : {}),
  };
}

/** The organiser's advance pick stamped on a match — only a team that is
 *  actually one of its two sides counts. */
export function advanceOverride(m: Match): { teamId: string; reason?: string; by?: string; at?: string } | undefined {
  const f = m.format as Record<string, unknown> | undefined;
  const id = f?.[ADVANCE_KEYS.teamId];
  if (typeof id !== 'string' || (id !== m.homeTeam?.id && id !== m.awayTeam?.id)) return undefined;
  const str = (k: string) => (typeof f?.[k] === 'string' ? (f[k] as string) : undefined);
  return { teamId: id, reason: str(ADVANCE_KEYS.reason), by: str(ADVANCE_KEYS.by), at: str(ADVANCE_KEYS.at) };
}

/** SD-120 — the leg-1 score as seen from leg 2's home / away sides, once leg 1
 *  is complete (null otherwise). Feeds `aggPriorHome` / `aggPriorAway`. */
export function aggregatePriorFor(leg2: Match, legs: Match[]): { home: number; away: number } | null {
  const meta = readSeriesMeta(leg2);
  if (!meta || meta.format !== 'aggregate' || meta.leg !== 2) return null;
  const leg1 = legs.find((m) => m.id !== leg2.id && readSeriesMeta(m)?.id === meta.id && readSeriesMeta(m)?.leg === 1);
  // SD-140: a walkover / forfeit leg counts its forfeit score (result.forfeit)
  const sc = leg1 ? legScore(leg1) : undefined;
  if (!leg1 || leg1.status !== 'completed' || !sc) return null;
  const forTeam = (teamId: string) =>
    leg1.homeTeam?.id === teamId ? sc.home : leg1.awayTeam?.id === teamId ? sc.away : 0;
  return { home: forTeam(leg2.homeTeam.id), away: forTeam(leg2.awayTeam.id) };
}

/** The series fields stamped onto a leg's `format`. Merge into the sport format. */
export function seriesLegFormat(cfg: {
  id: string;
  format: SeriesFormat;
  legs: number;
  leg: number;
  teamAId: string;
  name?: string;
  awayGoals?: boolean;
}): SportFormat {
  const f: SportFormat = {
    [SERIES_KEYS.id]: cfg.id,
    [SERIES_KEYS.fmt]: cfg.format,
    [SERIES_KEYS.legs]: cfg.legs,
    [SERIES_KEYS.leg]: cfg.leg,
    [SERIES_KEYS.teamA]: cfg.teamAId,
  };
  if (cfg.name) f[SERIES_KEYS.name] = cfg.name;
  if (cfg.awayGoals) f[SERIES_KEYS.awayGoals] = true;
  return f;
}

/** The series metadata read off a single match, or null if it isn't part of one. */
export interface SeriesLegMeta {
  id: string;
  format: SeriesFormat;
  legs: number;
  leg: number;
  teamAId: string;
  name?: string;
  awayGoals: boolean;
}
/** Read series metadata from a raw `format` record (a match's `format`, or the
 *  config the live-scoring screen already holds). */
export function seriesMetaFromFormat(f?: Record<string, unknown> | null): SeriesLegMeta | null {
  if (!f) return null;
  const id = f[SERIES_KEYS.id];
  const fmt = f[SERIES_KEYS.fmt];
  const teamA = f[SERIES_KEYS.teamA];
  if (typeof id !== 'string' || typeof teamA !== 'string') return null;
  if (fmt !== 'best_of' && fmt !== 'aggregate' && fmt !== 'rubbers') return null;
  const legs = Number(f[SERIES_KEYS.legs]) || 0;
  const leg = Number(f[SERIES_KEYS.leg]) || 0;
  const name = typeof f[SERIES_KEYS.name] === 'string' ? (f[SERIES_KEYS.name] as string) : undefined;
  return { id, format: fmt, legs, leg, teamAId: teamA, name, awayGoals: f[SERIES_KEYS.awayGoals] === true };
}

export function readSeriesMeta(m: Match): SeriesLegMeta | null {
  return seriesMetaFromFormat(m.format as Record<string, unknown> | undefined);
}

/** Is this match part of a multi-match series/tie? */
export const isSeriesLeg = (m: Match): boolean => readSeriesMeta(m) !== null;

/** A reconstructed series: its config plus the child legs in order. */
export interface Series {
  id: string;
  name?: string;
  format: SeriesFormat;
  legsPlanned: number;
  teamAId: string;
  awayGoals: boolean;
  sport: SportId;
  tournamentId?: string;
  stage?: string;
  /** the two sides, taken from the legs (A first) */
  teamA?: Match['homeTeam'];
  teamB?: Match['awayTeam'];
  /** child matches, ordered by leg number then kickoff */
  legs: Match[];
}

/** Group a flat match list into the series they belong to (single matches are
 *  left out — call `readSeriesMeta` for those). Legs are ordered. */
export function deriveSeries(matches: Match[]): Series[] {
  const byId = new Map<string, { meta: SeriesLegMeta; legs: Match[] }>();
  for (const m of matches) {
    const meta = readSeriesMeta(m);
    if (!meta) continue;
    const entry = byId.get(meta.id) ?? { meta, legs: [] };
    entry.legs.push(m);
    byId.set(meta.id, entry);
  }
  const out: Series[] = [];
  for (const { meta, legs } of byId.values()) {
    legs.sort((a, b) => (readSeriesMeta(a)!.leg - readSeriesMeta(b)!.leg) || (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
    const first = legs[0];
    // A/B teams: whichever leg has A as home gives us both team objects cleanly.
    const teamA = legs.map((l) => (l.homeTeam?.id === meta.teamAId ? l.homeTeam : l.awayTeam?.id === meta.teamAId ? l.awayTeam : undefined)).find(Boolean);
    const teamB = legs.map((l) => (l.homeTeam?.id === meta.teamAId ? l.awayTeam : l.awayTeam?.id === meta.teamAId ? l.homeTeam : undefined)).find(Boolean);
    out.push({
      id: meta.id,
      name: meta.name,
      format: meta.format,
      legsPlanned: meta.legs,
      teamAId: meta.teamAId,
      awayGoals: meta.awayGoals,
      sport: first.sport,
      tournamentId: first.tournamentId,
      stage: first.stage,
      teamA,
      teamB,
      legs,
    });
  }
  return out;
}

/** Wins needed to clinch a best_of / rubbers series of N games. */
export const clinchTarget = (legs: number): number => Math.floor(legs / 2) + 1;

export interface SeriesStanding {
  winsA: number;
  winsB: number;
  /** aggregate score across legs (aggregate format; also filled for others) */
  aggA: number;
  aggB: number;
  played: number;
  clinchAt: number;
  decided: boolean;
  drawn: boolean;
  winnerId?: string;
  status: 'scheduled' | 'live' | 'decided';
  /** scheduled legs not yet played (a decided series may still have dead rubbers) */
  gamesLeft: number;
  /** short human line, e.g. "IND lead 2–1" / "AUS win the series 3–1" */
  summary: string;
  /** SD-120: the winner came from the organiser's advance pick */
  byOrganiser?: boolean;
}

const shortName = (t?: { shortName?: string; name?: string }) => t?.shortName || t?.name || '';

/** Resolve a series to a standing + winner. Pure over its legs' results. */
export function resolveSeries(s: Series): SeriesStanding {
  const nameA = shortName(s.teamA);
  const nameB = shortName(s.teamB);
  let winsA = 0, winsB = 0, aggA = 0, aggB = 0, played = 0, anyLive = false;

  for (const m of s.legs) {
    const aIsHome = m.homeTeam?.id === s.teamAId;
    if (m.status === 'live') anyLive = true;
    // SD-140: a walkover / forfeit leg adds its forfeit score (result.forfeit),
    // not the board — the aggregate the table would count.
    const sc = legScore(m);
    if (sc) {
      const aScore = aIsHome ? sc.home : sc.away;
      const bScore = aIsHome ? sc.away : sc.home;
      aggA += aScore;
      aggB += bScore;
    }
    if (m.status === 'completed' && m.winner && m.winner !== 'draw') {
      played += 1;
      const winnerIsA = (m.winner === 'home') === aIsHome;
      if (winnerIsA) winsA += 1; else winsB += 1;
    } else if (m.status === 'completed') {
      played += 1; // a drawn leg counts as played but no win credited
      // SD-48: a drawn rubber of a chess team match is ½ each (not a 0-0
      // double forfeit, not a no result).
      if (s.format === 'rubbers' && m.winner === 'draw' && halfPointLeg(m)) { winsA += 0.5; winsB += 0.5; }
    }
  }

  const n = s.legsPlanned || s.legs.length || 1;
  // SD-48: with ½-point rubbers a team needs MORE than half (2½ of 4 boards).
  const halves = s.format === 'rubbers' && s.legs.some(halfPointLeg);
  const clinchAt = halves ? n / 2 + 0.5 : clinchTarget(n);
  const scheduledLeft = s.legs.filter((m) => m.status === 'scheduled' || m.status === 'live' || m.status === 'postponed').length;

  let winnerId: string | undefined;
  let drawn = false;

  if (s.format === 'aggregate') {
    // Decided only once both legs are done (or the planned legs are exhausted).
    const legsDone = s.legs.filter((m) => m.status === 'completed').length;
    const allDone = legsDone >= (s.legsPlanned || 2) && scheduledLeft === 0;
    if (allDone) {
      if (aggA > aggB) winnerId = s.teamAId;
      else if (aggB > aggA) winnerId = s.teamB?.id;
      else {
        // Level on aggregate. Optional away-goals, else the 2nd leg's own winner
        // (which reflects extra time / penalties played in that match).
        if (s.awayGoals) {
          const awayA = awayGoalsFor(s, s.teamAId);
          const awayB = awayGoalsFor(s, s.teamB?.id);
          if (awayA > awayB) winnerId = s.teamAId;
          else if (awayB > awayA) winnerId = s.teamB?.id;
        }
        if (!winnerId) {
          // SD-120: only the last leg's DECIDER breaks a level aggregate (its
          // shoot-out / 7 m, a leg level on the day then settled, or a result
          // awarded by hand). A leg 2 simply won on goals doesn't — that used to
          // hand the tie to the leg-2 winner (2-1, 0-1 → the 0-1 side went through).
          const last = [...s.legs].reverse().find((m) => m.status === 'completed');
          if (last && last.winner && last.winner !== 'draw' && settledByDecider(last)) {
            winnerId = last.winner === 'home' ? last.homeTeam?.id : last.awayTeam?.id;
          } else drawn = true;
        }
      }
    }
  } else {
    // best_of / rubbers — first to a majority of wins.
    if (winsA >= clinchAt) winnerId = s.teamAId;
    else if (winsB >= clinchAt) winnerId = s.teamB?.id;
    else if (scheduledLeft === 0 && played > 0) {
      // All games played, no majority reached (only possible with an even set).
      if (winsA > winsB) winnerId = s.teamAId;
      else if (winsB > winsA) winnerId = s.teamB?.id;
      else drawn = true;
    }
  }

  // SD-120: the organiser's advance pick settles a tie scoring couldn't — only
  // once nothing is left to play.
  let byOrganiser = false;
  if (!winnerId && scheduledLeft === 0) {
    const pick = [...s.legs].reverse().map(advanceOverride).find((o) => o && (o.teamId === s.teamAId || o.teamId === s.teamB?.id));
    if (pick) { winnerId = pick.teamId; drawn = false; byOrganiser = true; }
  }

  const decided = !!winnerId || drawn;
  const status: SeriesStanding['status'] = decided ? 'decided' : anyLive || played > 0 ? 'live' : 'scheduled';

  return {
    winsA, winsB, aggA, aggB, played, clinchAt, decided, drawn, winnerId, status,
    gamesLeft: scheduledLeft,
    summary: summarize({ s, nameA, nameB, winsA, winsB, aggA, aggB, winnerId, drawn }) + (byOrganiser ? ' (organiser decision)' : ''),
    ...(byOrganiser ? { byOrganiser } : {}),
  };
}

/** SD-120 — did this completed leg's winner come from a decider rather than
 *  the run of play? A shoot-out / 7 m winner on the state, a leg level on goals
 *  but still given a winner (ET + pens under the old per-leg rule), a walkover,
 *  or a result awarded / conceded by hand. */
function settledByDecider(m: Match): boolean {
  if (m.walkover) return true;
  if (m.result && (m.result.kind === 'awarded' || m.result.kind === 'conceded')) return true;
  if ((m.state as { shootoutWinner?: unknown } | null | undefined)?.shootoutWinner) return true;
  return !!m.score && m.score.home === m.score.away;
}

/** SD-48 — a rubber whose draw is worth ½ to each side (chess team match:
 *  `__tieHalf` on its format), unless it ended without a game (no result,
 *  abandoned, a 0-0 double forfeit). */
function halfPointLeg(m: Match): boolean {
  if ((m.format as Record<string, unknown> | undefined)?.__tieHalf !== true) return false;
  if (m.result?.kind === 'no_result' || m.result?.kind === 'abandoned') return false;
  return (m.state as { method?: unknown } | null | undefined)?.method !== 'double-forfeit';
}

/** Away goals a side scored (the leg where they were the away team). */
function awayGoalsFor(s: Series, teamId?: string): number {
  if (!teamId) return 0;
  let goals = 0;
  for (const m of s.legs) {
    const sc = legScore(m);
    if (!sc) continue;
    if (m.awayTeam?.id === teamId) goals += sc.away;
  }
  return goals;
}

/** The winning team id of a decided series, else undefined. */
export function seriesWinnerId(s: Series): string | undefined {
  const st = resolveSeries(s);
  if (st.winnerId || !st.drawn) return st.winnerId;
  // SD-48: a knockout chess team match level on board points goes to the
  // board count; a group-stage draw stays a draw (1 match point each).
  const ko = !!s.stage && s.stage !== 'group' && s.stage !== 'super' && !s.stage.startsWith('swiss');
  if (!(ko && s.format === 'rubbers' && s.legs.some(halfPointLeg))) return undefined;
  // SD-121: the organiser's knockout rule from the tie spec ('board-count'
  // Berger weighting, or 'lowest-board'); read raw to avoid a teamTie import cycle.
  let spec: { koBreak?: unknown } | null = null;
  try {
    const raw = (s.legs[0]?.format as Record<string, unknown> | undefined)?.__tie;
    spec = typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch { spec = null; }
  return chessTeamKoWinner({ teamAId: s.teamAId, teamBId: s.teamB?.id, legs: s.legs }, koBreakOf(spec));
}

/** SD-48 — knockout only: a chess team match level on board points is decided
 *  by the board count (Berger board weighting: points on board b count
 *  n − b + 1, so board 1 weighs most). Still level → undefined (the organiser
 *  settles it, e.g. a blitz play-off). Check the event's own regulations. */
export function boardCountWinner(s: Series): string | undefined {
  const n = s.legs.length;
  let a = 0, b = 0;
  s.legs.forEach((m, i) => {
    if (m.status !== 'completed') return;
    const w = n - i;
    const aHome = m.homeTeam?.id === s.teamAId;
    if (m.winner === 'draw') { if (halfPointLeg(m)) { a += w / 2; b += w / 2; } }
    else if (m.winner) { if ((m.winner === 'home') === aHome) a += w; else b += w; }
  });
  if (a === b) return undefined;
  return a > b ? s.teamAId : s.teamB?.id;
}

function summarize(a: {
  s: Series; nameA: string; nameB: string;
  winsA: number; winsB: number; aggA: number; aggB: number;
  winnerId?: string; drawn: boolean;
}): string {
  const { s, nameA, nameB, winsA, winsB, aggA, aggB, winnerId, drawn } = a;
  const winnerName = winnerId === s.teamAId ? nameA : winnerId === s.teamB?.id ? nameB : '';

  if (s.format === 'aggregate') {
    const line = `${aggA}–${aggB} agg`;
    if (winnerId) return `${winnerName} win ${line}`;
    if (drawn) return `Level ${line}`;
    return `${line}`;
  }
  // wins-based
  const hi = Math.max(winsA, winsB), lo = Math.min(winsA, winsB);
  if (winnerId) return `${winnerName} win the series ${hi}–${lo}`;
  if (drawn) return `Series drawn ${winsA}–${winsB}`;
  if (winsA === winsB) return winsA === 0 ? 'Series to start' : `Series level ${winsA}–${winsB}`;
  const leader = winsA > winsB ? nameA : nameB;
  return `${leader} lead ${hi}–${lo}`;
}
