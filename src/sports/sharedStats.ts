/**
 * SD-15 — stat definitions shared by several sports. A key means the same in
 * every sport that writes it, so its labels are defined once here and each
 * sport's schema spreads it in, adding its own weight / group / coverage.
 * PURE (no React Native).
 */
import type { StatDef } from './statSchema.ts';

type Base = Omit<StatDef, 'key'> & { key: string };
const def = (d: Base): StatDef => d;

/** Rally / court sports' point, basketball / volleyball / carrom points. */
export const POINTS = def({ key: 'points', label: 'Points', short: 'pts', abbr: 'PTS', matchSummary: true });
export const ACES = def({ key: 'aces', label: 'Aces', short: 'aces', one: 'ace', abbr: 'ACE', matchSummary: true });
export const BLOCKS = def({ key: 'blocks', label: 'Blocks', short: 'blocks', one: 'block', abbr: 'BLK', matchSummary: true });
export const ASSISTS = def({ key: 'assists', label: 'Assists', short: 'assists', one: 'assist', abbr: 'AST', matchSummary: true });
export const FOULS = def({ key: 'fouls', label: 'Fouls', short: 'fouls', one: 'foul', abbr: 'PF', matchSummary: true });
export const SAVES = def({ key: 'saves', label: 'Saves', short: 'saves', one: 'save', matchSummary: true });
export const YELLOW_CARDS = def({ key: 'yellowCards', label: 'Yellow', short: 'yellow cards', one: 'yellow card', compact: 'yellow', matchSummary: true });
/** SD-24 — the most points in one match (basketball career high, volleyball,
 *  carrom best game) */
export const HIGH_POINTS = def({ key: 'highPoints', label: 'Most points in a match', short: 'most points', source: 'derived', group: 'bests', agg: { kind: 'max', key: 'points' } });
export const RED_CARDS = def({ key: 'redCards', label: 'Red', short: 'red cards', one: 'red card', compact: 'red', matchSummary: true });

/**
 * Keys valid on any sport's line, outside the per-sport schemas:
 * - `apps` / `starts` — the appearance line (SD-11), counted with the record;
 * - `golds` / `silvers` — medal counts a multi-sport meet profile may carry.
 */
export const SHARED_STATS: StatDef[] = [
  { key: 'apps', label: 'Apps', short: 'apps', one: 'app', agg: { kind: 'appearance' } },
  { key: 'starts', label: 'Starts', short: 'starts', one: 'start', agg: { kind: 'appearance' } },
  { key: 'golds', label: 'Golds', short: 'golds', one: 'gold', source: 'team' },
  { key: 'silvers', label: 'Silvers', short: 'silvers', one: 'silver', source: 'team' },
];
