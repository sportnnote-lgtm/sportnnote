/** Series / ties — the wrapper that turns several matches between the same two
 *  teams into one contest with a single winner. One primitive covers three real
 *  shapes:
 *    • best_of  — first to a majority of wins (cricket bilateral series, an
 *                 NBA/EuroLeague best-of-7 playoff). Once clinched, the rest are
 *                 dead rubbers.
 *    • aggregate — two legs, combined score decides it (a UCL/Libertadores
 *                 two-legged knockout). Level on aggregate → optional away-goals,
 *                 else the 2nd leg's own result (which captures extra time /
 *                 penalties) breaks it.
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
    if (m.score) {
      const aScore = aIsHome ? m.score.home : m.score.away;
      const bScore = aIsHome ? m.score.away : m.score.home;
      aggA += aScore;
      aggB += bScore;
    }
    if (m.status === 'completed' && m.winner && m.winner !== 'draw') {
      played += 1;
      const winnerIsA = (m.winner === 'home') === aIsHome;
      if (winnerIsA) winsA += 1; else winsB += 1;
    } else if (m.status === 'completed') {
      played += 1; // a drawn leg counts as played but no win credited
    }
  }

  const clinchAt = clinchTarget(s.legsPlanned || s.legs.length || 1);
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
          const decider = [...s.legs].reverse().find((m) => m.status === 'completed' && m.winner && m.winner !== 'draw');
          if (decider) winnerId = decider.winner === 'home' ? decider.homeTeam?.id : decider.awayTeam?.id;
          else drawn = true;
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

  const decided = !!winnerId || drawn;
  const status: SeriesStanding['status'] = decided ? 'decided' : anyLive || played > 0 ? 'live' : 'scheduled';

  return {
    winsA, winsB, aggA, aggB, played, clinchAt, decided, drawn, winnerId, status,
    gamesLeft: scheduledLeft,
    summary: summarize({ s, nameA, nameB, winsA, winsB, aggA, aggB, winnerId, drawn }),
  };
}

/** Away goals a side scored (the leg where they were the away team). */
function awayGoalsFor(s: Series, teamId?: string): number {
  if (!teamId) return 0;
  let goals = 0;
  for (const m of s.legs) {
    if (!m.score) continue;
    if (m.awayTeam?.id === teamId) goals += m.score.away;
  }
  return goals;
}

/** The winning team id of a decided series, else undefined. */
export function seriesWinnerId(s: Series): string | undefined {
  return resolveSeries(s).winnerId;
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
