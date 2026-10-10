/**
 * SD-25 (GEN-12) — line context and splits.
 *
 * Every stat line gets a CONTEXT derived at read time from its match (and the
 * match's tournament): no migration, nothing stored. From the context a
 * profile (later: leaders / awards) can split a career by
 *   - format      cricket overs category (T20 / ODI / T10 / Hundred / Box / Long),
 *                 tennis / racket best-of, volleyball indoor / beach, football
 *                 n-a-side, basketball 3x3 / 5-on-5, kabaddi style
 *   - ball        cricket ball type (leather / tennis)
 *   - discipline  singles / doubles (racket sports, carrom)
 *   - competition tournament vs friendly
 *   - tournament  which tournament ("Friendlies" for none)
 *   - season      calendar year, or a school season ("2025–26") from a start month
 *   - opponent    the other side (team id when known, else the line's label)
 *   - colour      chess: White / Black (from the match's `white` side)
 *   - timeControl chess: classical / rapid / blitz / bullet / untimed
 *   - venue, homeAway  where known
 *
 * Each sport's stat schema declares which splits apply (`splits`, SD-15 shape);
 * the profile shows a chip only for a declared split with ≥ 2 values among the
 * player's lines. Filtering is a plain line filter, so every career figure is
 * recomputed by the SD-16 aggregate engine over the filtered lines.
 *
 * PURE (no React Native) — node tests load it.
 */
import type { Match, SportId, StatLine, Tournament } from '../core/types';
import type { SplitDim } from '../sports/statSchema.ts';
import { sideFromOpponent } from './appearances.ts';

export type { SplitDim };

type Side = 'home' | 'away';
type Cfg = Record<string, unknown>;

/** One split value: a stable key (what a filter compares) and its chip label. */
export interface SplitValue { key: string; label: string }

export interface LineContext {
  sport: SportId;
  /** the player's side in the match, when it can be told */
  side?: Side;
  format?: SplitValue;
  ball?: SplitValue;
  discipline?: SplitValue;
  /** unknown (undefined) when the line's match isn't loaded */
  competition?: SplitValue;
  tournament?: SplitValue;
  season?: SplitValue;
  opponent?: SplitValue;
  colour?: SplitValue;
  timeControl?: SplitValue;
  venue?: SplitValue;
  homeAway?: SplitValue;
}

export interface ContextOptions {
  /** month a season starts (1 = January → calendar years "2026"; 4 = April →
   *  an Indian school year "2026–27"). Default 1. */
  seasonStartMonth?: number;
}

/* --------------------------------- helpers --------------------------------- */

const v = (key: string, label = key): SplitValue => ({ key, label });
const numOf = (x: unknown): number | undefined => {
  const n = Number(x);
  return x != null && x !== '' && Number.isFinite(n) ? n : undefined;
};
const strOf = (x: unknown): string | undefined => (typeof x === 'string' && x ? x : undefined);

/** The format the match was played under: the tournament's format for the
 *  sport, overridden by the match's own (a friendly / one-off override). */
function configOf(match: Match | undefined, tournament: Pick<Tournament, 'formats'> | undefined): Cfg {
  const sport = match?.sport;
  return { ...((sport && tournament?.formats?.[sport]) ?? {}), ...(match?.format ?? {}) };
}
const stateOf = (match: Match | undefined): Cfg => (match?.state && typeof match.state === 'object' ? (match.state as Cfg) : {});

/** Season of an ISO date: "2026", or "2025–26" when the season starts after January. */
export function seasonOf(date: string | undefined, startMonth = 1): SplitValue | undefined {
  if (!date || date.length < 7) return undefined;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return undefined;
  if (startMonth <= 1) return v(String(y));
  const start = m >= startMonth ? y : y - 1;
  return v(String(start), `${start}–${String(start + 1).slice(2)}`);
}

/* ----------------------------- format, per sport ----------------------------- */

/** CK-03 — the cricket format of a match. The preset decides when it names
 *  one; a custom / unnamed format is classified by its numbers: 10-ball overs →
 *  Hundred; fewer than 11 a side → Box (box / sixes / gully); overs ≤ 10 → T10,
 *  ≤ 20 → T20, ≤ 50 → ODI (one-day), more (Test / timeless 999) → Long. No
 *  format information at all → Other. */
export const CRICKET_FORMATS: SplitValue[] = [
  v('t20', 'T20'), v('odi', 'ODI'), v('t10', 'T10'), v('hundred', 'Hundred'), v('box', 'Box'), v('long', 'Long'), v('other', 'Other'),
];
const CK = Object.fromEntries(CRICKET_FORMATS.map((f) => [f.key, f])) as Record<string, SplitValue>;

export function cricketFormat(cfg: Cfg, state: Cfg = {}): SplitValue {
  const preset = strOf(cfg.preset);
  const named: Record<string, string> = { t20: 't20', odi: 'odi', t10: 't10', hundred: 'hundred', sixes: 'box', box: 'box', test: 'long' };
  if (preset && named[preset]) return CK[named[preset]];
  const overs = numOf(cfg.overs) ?? numOf(state.inn1Overs);
  const bpo = numOf(cfg.ballsPerOver) ?? numOf(state.ballsPerOver) ?? 6;
  const wl = numOf(state.wicketsLimit);
  const pps = numOf(cfg.playersPerSide) ?? (wl != null ? wl + 1 : undefined);
  if (overs == null && pps == null) return CK.other;
  if (bpo === 10) return CK.hundred;
  if (pps != null && pps < 11) return CK.box;
  if (overs == null) return CK.other;
  if (overs <= 10) return CK.t10;
  if (overs <= 20) return CK.t20;
  if (overs <= 50) return CK.odi;
  return CK.long;
}

const bestOf = (toWin: number, unit: string) => (toWin <= 1 ? `1 ${unit}` : `Best of ${toWin * 2 - 1}`);

const TENNIS_PRESETS: Record<string, string> = { fast4: 'Fast4', proset: 'Pro set', match_tb: 'Match tiebreak' };
const VOLLEY_PRESETS: Record<string, string> = { indoor: 'Indoor', beach: 'Beach', nineaside: '9-a-side', single: 'Single set' };

function formatFor(sport: SportId, cfg: Cfg, state: Cfg): SplitValue | undefined {
  switch (sport) {
    case 'cricket': return cricketFormat(cfg, state);
    case 'tennis': case 'padel': {
      const p = strOf(cfg.preset);
      if (sport === 'tennis' && p && TENNIS_PRESETS[p]) return v(p, TENNIS_PRESETS[p]);
      const s = numOf(cfg.setsToWin) ?? numOf(state.setsToWin);
      return s != null ? v(`bo${s * 2 - 1}`, bestOf(s, 'set')) : undefined;
    }
    case 'badminton': case 'tabletennis': case 'squash': case 'pickleball': {
      const g = numOf(cfg.gamesToWin) ?? numOf(state.gamesToWin);
      const pts = numOf(cfg.pointsPerGame) ?? numOf(state.pointsPerGame);
      if (g == null) return undefined;
      return v(`bo${g * 2 - 1}${pts ? `x${pts}` : ''}`, `${bestOf(g, 'game')}${pts ? ` · ${pts}` : ''}`);
    }
    case 'volleyball': {
      const p = strOf(cfg.preset);
      if (p && VOLLEY_PRESETS[p]) return v(p, VOLLEY_PRESETS[p]);
      const n = numOf(cfg.playersPerSide);
      if (n === 2) return v('beach', 'Beach');
      if (n === 6) return v('indoor', 'Indoor');
      return n ? v(`${n}aside`, `${n}-a-side`) : undefined;
    }
    case 'football': {
      const n = numOf(cfg.playersPerSide);
      return n ? v(`${n}aside`, `${n}-a-side`) : undefined;
    }
    case 'basketball': {
      const n = numOf(cfg.playersPerSide);
      return n === 3 ? v('3x3', '3x3') : n ? v(`${n}v${n}`, `${n}-on-${n}`) : undefined;
    }
    case 'kabaddi': {
      const s = strOf(cfg.style);
      return s ? v(s, s[0].toUpperCase() + s.slice(1)) : undefined;
    }
    default: return undefined;
  }
}

const DISCIPLINE_SPORTS = new Set<SportId>(['tennis', 'badminton', 'tabletennis', 'squash', 'pickleball', 'padel', 'carrom']);

/** Singles / doubles (mixed when the format says so). The engine's own
 *  `doubles` flag wins; else players per side (≥ 2 = doubles). Padel is
 *  always doubles. */
function disciplineFor(sport: SportId, cfg: Cfg, state: Cfg): SplitValue | undefined {
  if (!DISCIPLINE_SPORTS.has(sport)) return undefined;
  const cat = strOf(cfg.category) ?? strOf(cfg.discipline);
  if (cat === 'mixed') return v('mixed', 'Mixed');
  let doubles: boolean | undefined = typeof state.doubles === 'boolean' ? state.doubles : undefined;
  if (doubles === undefined) {
    const n = numOf(cfg.playersPerSide);
    doubles = n != null ? n >= 2 : sport === 'padel' ? true : undefined;
  }
  if (doubles === undefined) return sport === 'padel' ? v('doubles', 'Doubles') : v('singles', 'Singles');
  return doubles ? v('doubles', 'Doubles') : v('singles', 'Singles');
}

const TIME_CONTROLS: Record<string, string> = { classical: 'Classical', rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', untimed: 'Untimed' };

/* -------------------------------- the context -------------------------------- */

/** The player's side: from the line's opponent label, else roster membership. */
export function sideOf(line: StatLine, match: Match | undefined): Side | undefined {
  if (!match) return undefined;
  const s = sideFromOpponent(line.opponent, { home: match.homeTeam?.name, away: match.awayTeam?.name });
  if (s) return s;
  const inHome = match.homeTeam?.roster?.includes(line.playerId);
  const inAway = match.awayTeam?.roster?.includes(line.playerId);
  if (inHome && !inAway) return 'home';
  if (inAway && !inHome) return 'away';
  return undefined;
}

/** A stat line's context, derived from its match and the match's tournament. */
export function lineContext(
  line: StatLine,
  match: Match | undefined,
  tournament: Pick<Tournament, 'id' | 'name' | 'formats'> | undefined,
  opts: ContextOptions = {},
): LineContext {
  const sport = line.sport;
  const cfg = configOf(match, tournament);
  const state = stateOf(match);
  const side = sideOf(line, match);
  const tId = match?.tournamentId ?? tournament?.id;
  const ctx: LineContext = {
    sport,
    side,
    // a line whose match isn't loaded can't be called a friendly
    competition: tId ? v('tournament', 'Tournament') : match ? v('friendly', 'Friendly') : undefined,
    tournament: tId ? v(tId, tournament?.name ?? 'Tournament') : match ? v('friendly', 'Friendlies') : undefined,
    season: seasonOf(match?.startsAt ?? line.date, opts.seasonStartMonth),
  };
  if (match) {
    ctx.format = formatFor(sport, cfg, state);
    ctx.discipline = disciplineFor(sport, cfg, state);
  }
  if (sport === 'cricket' && match) {
    const ball = strOf(cfg.ballType) ?? strOf(state.ballType);
    if (ball) ctx.ball = v(ball, ball === 'tennis' ? 'Tennis ball' : 'Leather');
  }
  if (sport === 'chess' && match) {
    const tc = strOf(state.timeControl) ?? strOf(cfg.timeControl);
    if (tc) ctx.timeControl = v(tc, TIME_CONTROLS[tc] ?? tc);
    // the game's colour, else the fixture's (SD-26 Swiss pairing), else home (the engine default)
    const white = state.white === 'away' || state.white === 'home' ? state.white : cfg.white === 'away' ? 'away' : 'home';
    if (side) ctx.colour = side === white ? v('white', 'White') : v('black', 'Black');
  }
  // Opponent: the other side's team (id) when the side is known, else the label.
  const opp = side && match ? (side === 'home' ? match.awayTeam : match.homeTeam) : undefined;
  if (opp?.id) ctx.opponent = v(opp.id, opp.name);
  else if (line.opponent) ctx.opponent = v(`name:${line.opponent}`, line.opponent);
  if (match?.venueName) ctx.venue = v(match.venueName);
  if (side) ctx.homeAway = side === 'home' ? v('home', 'Home') : v('away', 'Away');
  return ctx;
}

/** Contexts for many lines at once (one pass, from already-loaded data). */
export function contextsFor(
  lines: StatLine[],
  matchById: Map<string, Match>,
  tournamentById: Map<string, Pick<Tournament, 'id' | 'name' | 'formats'>>,
  opts: ContextOptions = {},
): Map<string, LineContext> {
  const out = new Map<string, LineContext>();
  for (const l of lines) {
    const m = l.matchId ? matchById.get(l.matchId) : undefined;
    const t = m?.tournamentId ? tournamentById.get(m.tournamentId) : undefined;
    out.set(l.id, lineContext(l, m, t, opts));
  }
  return out;
}

/* ---------------------------------- splits ---------------------------------- */

/** Chip title per split. */
export const SPLIT_LABEL: Record<SplitDim, string> = {
  format: 'Format', ball: 'Ball', discipline: 'Singles/Doubles', competition: 'Tournament / friendly',
  tournament: 'Tournament', season: 'Season', opponent: 'Opponent', colour: 'Colour',
  timeControl: 'Time control', venue: 'Venue', homeAway: 'Home/Away',
};

export type SplitSelection = Partial<Record<SplitDim, string>>;

export const splitValue = (ctx: LineContext | undefined, dim: SplitDim): SplitValue | undefined => ctx?.[dim];

export interface SplitOption { dim: SplitDim; label: string; values: (SplitValue & { count: number })[] }

/** The splits worth offering: declared for the sport AND with ≥ 2 distinct
 *  values among the lines. Values are ordered by the sport's natural order
 *  (cricket formats, seasons newest first), else by how many lines they cover. */
export function splitOptions(lines: StatLine[], ctxOf: Map<string, LineContext>, dims: readonly SplitDim[]): SplitOption[] {
  const out: SplitOption[] = [];
  for (const dim of dims) {
    const seen = new Map<string, SplitValue & { count: number }>();
    for (const l of lines) {
      const sv = splitValue(ctxOf.get(l.id), dim);
      if (!sv) continue;
      const cur = seen.get(sv.key);
      if (cur) cur.count += 1;
      else seen.set(sv.key, { ...sv, count: 1 });
    }
    if (seen.size < 2) continue;
    const values = [...seen.values()];
    if (dim === 'season') values.sort((a, b) => b.key.localeCompare(a.key));
    else if (dim === 'format' && lines[0]?.sport === 'cricket') {
      const order = CRICKET_FORMATS.map((f) => f.key);
      values.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    } else values.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    out.push({ dim, label: SPLIT_LABEL[dim], values });
  }
  return out;
}

/** The lines matching every chosen split value. No selection → the same array
 *  (so "no filter" is byte-for-byte today's output). */
export function filterLines(lines: StatLine[], ctxOf: Map<string, LineContext>, sel: SplitSelection): StatLine[] {
  const chosen = (Object.entries(sel) as [SplitDim, string | undefined][]).filter(([, k]) => k != null);
  if (!chosen.length) return lines;
  return lines.filter((l) => {
    const ctx = ctxOf.get(l.id);
    return chosen.every(([dim, key]) => splitValue(ctx, dim)?.key === key);
  });
}
