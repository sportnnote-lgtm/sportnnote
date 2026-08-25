/** Tournament structure config, per sport — the intended shape of the
 *  competition, made persistent so it's the source of truth instead of living
 *  only in the transient "auto-generate fixtures" tool (where the real group
 *  count / advancement could silently diverge from the tournament's coarse
 *  `structure` label).
 *
 *  Stored on `formats[sport]` under reserved keys (zero-migration, riding the
 *  existing jsonb), read/written by the generator, the structure editor and the
 *  tournament page. Pure + dependency-free. */
import type { SportFormat, TournamentStructure } from '../core/types';

/** The competition shape for one sport. `groups` means a group stage that then
 *  feeds a knockout (optionally via a Super round-robin phase). */
export type StructureShape = 'league' | 'knockout' | 'groups';

export interface StructureConfig {
  shape: StructureShape;
  /** number of groups (shape = 'groups') */
  groupCount: number;
  /** teams that advance directly from each group */
  advanceTopN: number;
  /** extra "best (N+1)-placed across all groups" wildcard slots */
  advanceBest: number;
  /** home-and-away round-robin (league / group / super) */
  doubleRound: boolean;
  /** group → a Super round-robin among the qualifiers → knockout (Asia-Cup style) */
  superPhase: boolean;
}

const KEYS = {
  shape: 'structShape',
  groupCount: 'structGroups',
  advanceTopN: 'structTopN',
  advanceBest: 'structBest',
  doubleRound: 'structDouble',
  superPhase: 'structSuper',
} as const;

const isShape = (s: unknown): s is StructureShape => s === 'league' || s === 'knockout' || s === 'groups';

/** The saved structure config for a sport, or null if none was ever stored. */
export function structureFromFormat(fmt?: Record<string, unknown> | null): StructureConfig | null {
  if (!fmt || !isShape(fmt[KEYS.shape])) return null;
  const num = (k: string, dv: number) => (typeof fmt[k] === 'number' ? (fmt[k] as number) : dv);
  return {
    shape: fmt[KEYS.shape] as StructureShape,
    groupCount: Math.max(2, num(KEYS.groupCount, 4)),
    advanceTopN: Math.max(1, num(KEYS.advanceTopN, 2)),
    advanceBest: Math.max(0, num(KEYS.advanceBest, 0)),
    doubleRound: fmt[KEYS.doubleRound] === true,
    superPhase: fmt[KEYS.superPhase] === true,
  };
}

/** The reserved keys to merge into a sport's format to persist a config. */
export function structureToFormat(cfg: StructureConfig): SportFormat {
  return {
    [KEYS.shape]: cfg.shape,
    [KEYS.groupCount]: cfg.groupCount,
    [KEYS.advanceTopN]: cfg.advanceTopN,
    [KEYS.advanceBest]: cfg.advanceBest,
    [KEYS.doubleRound]: cfg.doubleRound,
    [KEYS.superPhase]: cfg.superPhase,
  };
}

/** Merge a structure config into an existing sport format (keeping its other
 *  keys — scoring rules, points, etc.). */
export function mergeStructure(fmt: SportFormat | undefined, cfg: StructureConfig): SportFormat {
  return { ...(fmt ?? {}), ...structureToFormat(cfg) };
}

/** The coarse tournament-wide `structure` a shape implies — so the label the
 *  tournament page shows stays consistent with the fixtures generated. */
export function structureFieldFor(shape: StructureShape): TournamentStructure {
  return shape === 'league' ? 'league' : shape === 'knockout' ? 'knockout' : 'league_knockout';
}

/** The per-sport shape a coarse tournament structure implies (the inverse). */
export function shapeForStructure(structure?: TournamentStructure | null): StructureShape {
  return structure === 'knockout' ? 'knockout' : structure === 'league' ? 'league' : 'groups';
}

/** A one-line, human-readable summary of the structure for the tournament page. */
export function describeStructure(cfg: StructureConfig): string {
  const rr = cfg.doubleRound ? 'home & away round-robin' : 'round-robin';
  if (cfg.shape === 'league') return `Single league — ${rr}, ranked on points`;
  if (cfg.shape === 'knockout') return 'Straight knockout — win or go home';
  const advance =
    cfg.advanceBest > 0
      ? `top ${cfg.advanceTopN} + the ${cfg.advanceBest} best ${ordinal(cfg.advanceTopN + 1)}-placed`
      : `top ${cfg.advanceTopN}`;
  const then = cfg.superPhase ? 'a Super round-robin, then the knockout' : 'the knockout';
  return `${cfg.groupCount} groups (${rr}) → ${advance} advance to ${then}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
