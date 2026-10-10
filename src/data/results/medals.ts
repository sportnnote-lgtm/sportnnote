/**
 * Medals and position points from an event's final ranking — what feeds the
 * multi-sport medal / house table (data/medalStandings.ts `fieldResults`).
 * Ties share: two golds and no silver; points for tied places are shared
 * (averaged) by default, or each gets the higher place's points. Pure.
 */
import type { RankedEntry } from './model.ts';

export type Medal = 'gold' | 'silver' | 'bronze';

export interface PointsConfig {
  /** points for 1st, 2nd, … (index 0 = 1st); default 8-7-6-5-4-3-2-1 */
  positionPoints?: number[];
  /** tied places: 'share' the points of the places they cover (default) or 'full' */
  ties?: 'share' | 'full';
}

export const DEFAULT_EVENT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

export interface Award {
  entryId: string;
  name: string;
  team?: { id?: string; name: string; colorHex?: string };
  position: number;
  medal?: Medal;
  points: number;
}

const MEDALS: Medal[] = ['gold', 'silver', 'bronze'];

/** Medals + points for every ranked entry of a final. */
export function eventAwards(rows: RankedEntry[], cfg: PointsConfig = {}): Award[] {
  const table = cfg.positionPoints?.length ? cfg.positionPoints : DEFAULT_EVENT_POINTS;
  const ranked = rows.filter((r) => r.position != null);
  return ranked.map((r) => {
    const p = r.position as number;
    const group = ranked.filter((x) => x.position === p).length;
    let points = table[p - 1] ?? 0;
    if (group > 1 && (cfg.ties ?? 'share') === 'share') {
      let sum = 0;
      for (let i = 0; i < group; i++) sum += table[p - 1 + i] ?? 0;
      points = Math.round((sum / group) * 100) / 100;
    }
    return { entryId: r.id, name: r.entry.name, team: r.entry.team, position: p, medal: MEDALS[p - 1], points };
  });
}

/** One event's contribution to the medal table (data/medalStandings.ts). */
export interface FieldResultInput {
  /** the sport (athletics, swimming …) — the per-sport weight key */
  sport: string;
  /** "100 m U14 Boys" */
  event: string;
  awards: Award[];
}
