/** The format a tournament match is created with (extracted from
 *  GenerateFixtures, parity #24). Pure — node tests load it.
 *
 *  Base = the tournament's format for the sport, else the sport's defaults
 *  (passed in, since they live in the sport registry). The football knockout
 *  decider (extra time / penalties) must apply ONLY to real knockout ties — a
 *  football match with a decider is treated as a knockout (draws can't stand).
 *  So league/group/super football strips it, and knockout football keeps it
 *  (falling back to a pre-per-sport tournament's old tournament-wide
 *  knockoutFormat). */
import type { SportId, Tournament } from '../core/types';

export type MatchFormat = Record<string, number | string | boolean>;

export function matchFormatFor(
  tournament: Pick<Tournament, 'formats' | 'knockoutFormat'> | null | undefined,
  sport: SportId,
  koLike: boolean,
  defaults: Record<string, unknown> = {},
): MatchFormat {
  let format: Record<string, unknown> = tournament?.formats?.[sport] ?? defaults;
  if (sport === 'football') {
    if (koLike) {
      const kf = tournament?.knockoutFormat;
      if (format.decider == null && kf) {
        format = { ...format, decider: kf.decider,
          ...(kf.extraTimeMinutes != null ? { extraTimeMinutes: kf.extraTimeMinutes } : {}),
          ...(kf.extraTimeSubs != null ? { extraTimeSubs: kf.extraTimeSubs } : {}) };
      }
    } else {
      const { decider, extraTimeMinutes, extraTimeSubs, ...rest } = format;
      format = rest;
    }
  }
  return format as MatchFormat;
}
