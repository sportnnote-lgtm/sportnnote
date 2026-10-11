/** The format a tournament match is created with (extracted from
 *  GenerateFixtures, parity #24). Pure — node tests load it.
 *
 *  Base = the tournament's format for the sport, else the sport's defaults
 *  (passed in, since they live in the sport registry).
 *
 *  SD-120 — the "if level at full time" decider is STAGE-AWARE for every sport
 *  that has one (football ET/pens, hockey shoot-out, handball ET/7 m, kabaddi
 *  ET/golden raid, basketball overtime):
 *    • league / group / Super / Swiss matches never go to a decider — the draw
 *      stands and the sport's standings rules score it. The match format says
 *      so EXPLICITLY (`decider: 'none'`), because the scoring screen merges the
 *      tournament's format underneath the match's own: a stripped key would let
 *      a tournament-wide decider leak back into a group game.
 *    • knockout matches always resolve: a decider left at none (or missing) is
 *      replaced by the sport's standard knockout decider.
 *  Football still falls back to a pre-per-sport tournament's tournament-wide
 *  knockoutFormat first. Only NEW matches are affected — an existing match
 *  keeps the format it was created with, so old logs replay identically. */
import type { SportId, Tournament } from '../core/types';

export type MatchFormat = Record<string, number | string | boolean>;

/** The sport's standard knockout decider (when the organiser left it at none). */
export const KO_DECIDER: Partial<Record<SportId, string>> = {
  football: 'extra_time', // IFAB Law 10: extra time, then kicks from the penalty mark
  hockey: 'shootout', // FIH: shoot-out
  handball: 'et2', // IHF 2:2: 2 × 5 min, again if level, then 7 m throws
  kabaddi: 'extra_time', // extra time, then golden raid
};

/** Does this sport's level knockout match need a decider in its format? */
export const hasDecider = (sport: SportId): boolean => sport in KO_DECIDER || sport === 'basketball';

/** Apply the stage rule to one match format (see the header). `elimination` =
 *  a knockout / third-place / play-in match (`isEliminationStage`). */
export function stageAwareFormat(
  format: Record<string, unknown>,
  sport: SportId,
  elimination: boolean,
  knockoutFormat?: Tournament['knockoutFormat'],
): MatchFormat {
  let f: Record<string, unknown> = { ...format };
  if (sport === 'basketball') {
    // FIBA: a level game always goes to overtime. A league may let a draw stand
    // (`allowDraw`); a knockout never does.
    if (elimination && f.allowDraw != null) f.allowDraw = false;
    return f as MatchFormat;
  }
  const koDecider = KO_DECIDER[sport];
  if (!koDecider) return f as MatchFormat;
  if (!elimination) {
    if (sport === 'football') {
      const { extraTimeMinutes: _e, extraTimeSubs: _s, knockout: _k, ...rest } = f;
      f = rest;
    }
    f.decider = 'none';
    return f as MatchFormat;
  }
  if (sport === 'football' && f.decider == null && knockoutFormat) {
    f = { ...f, decider: knockoutFormat.decider,
      ...(knockoutFormat.extraTimeMinutes != null ? { extraTimeMinutes: knockoutFormat.extraTimeMinutes } : {}),
      ...(knockoutFormat.extraTimeSubs != null ? { extraTimeSubs: knockoutFormat.extraTimeSubs } : {}) };
  }
  if (f.decider == null || f.decider === 'none' || f.decider === '') f.decider = koDecider;
  return f as MatchFormat;
}

export function matchFormatFor(
  tournament: Pick<Tournament, 'formats' | 'knockoutFormat'> | null | undefined,
  sport: SportId,
  koLike: boolean,
  defaults: Record<string, unknown> = {},
): MatchFormat {
  const format: Record<string, unknown> = tournament?.formats?.[sport] ?? defaults;
  return stageAwareFormat(format, sport, koLike, tournament?.knockoutFormat);
}

/** SD-120 — the per-leg rules of a NEW two-legged (aggregate) knockout tie.
 *  Leg 1 never goes to a decider (a draw stands — the tie isn't over). Leg 2
 *  gets the sport's knockout decider, and `aggregateLeg: 2` tells its engine
 *  that "level" means level ON AGGREGATE (UEFA / EHF: extra time, then pens /
 *  7 m when the aggregate is level after leg 2, even if leg 2 itself wasn't
 *  drawn). The leg-1 score reaches leg 2 as `aggPriorHome` / `aggPriorAway`
 *  (see `aggregatePriorFor` in series.ts). Plain (non-`__`) keys so they survive
 *  the scoring screen's merge. */
/** Engines that read `aggregateLeg` / `aggPrior*` (src/sports/aggregate.ts). */
export const AGG_ENGINES: ReadonlySet<SportId> = new Set<SportId>(['football', 'hockey', 'handball']);

export function aggregateLegFormat(format: Record<string, unknown>, sport: SportId, leg: number, awayGoals = false): MatchFormat {
  if (!hasDecider(sport)) return { ...format } as MatchFormat;
  // FIBA two-game series: no overtime after game 1 — a level game 1 stands.
  if (sport === 'basketball' && leg <= 1) return { ...format, allowDraw: true } as MatchFormat;
  if (leg <= 1) return stageAwareFormat(format, sport, false);
  // An engine that can't yet play its decider on aggregate (kabaddi) lets the
  // leg stand; a level aggregate then goes to the organiser's advance pick.
  if (!AGG_ENGINES.has(sport) && sport !== 'basketball') return { ...stageAwareFormat(format, sport, false), aggregateLeg: 2 };
  // EHF two-legged ties: a level aggregate goes straight to 7 m throws (no extra
  // time) unless the organiser chose otherwise. Verify per competition.
  const base = sport === 'handball' && (format.decider == null || format.decider === 'none') ? { ...format, decider: 'shootout' } : format;
  return { ...stageAwareFormat(base, sport, true), aggregateLeg: 2, ...(awayGoals ? { aggAwayGoals: true } : {}) };
}
