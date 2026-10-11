/**
 * SD-133 (CK-11) — wagon wheel maths: zones ⇄ angles, the left-hander mirror,
 * a batter's shots and the per-zone totals. Pure and JSX-free (node tests).
 *
 * The field is drawn from behind the batter, the bowler at the top. For a
 * right-hander the off side is on the right: zone 1 Mid-off (0–45° clockwise
 * from straight), 2 Cover, 3 Point, 4 Third man, 5 Fine leg, 6 Square leg,
 * 7 Mid-wicket, 8 Mid-on. A left-hander's picture is the mirror image, so a tap
 * on screen zone z is stored as `mirrorZone(z)` — careers then add up in one frame.
 */
import { ZONES, type ShotRec } from './engine.ts';

/** Screen zone ⇄ stored zone for a left-hander (1↔8, 2↔7, 3↔6, 4↔5). */
export const mirrorZone = (z: number): number => 9 - z;
/** The zone name as the scorer sees it (a left-hander's names are mirrored). */
export const zoneName = (screenZone: number, lh = false): string => ZONES[(lh ? mirrorZone(screenZone) : screenZone) - 1] ?? '';
/** Centre angle (degrees clockwise from straight) of a zone. */
export const zoneAngle = (z: number): number => (z - 0.5) * 45;

/** A batter's tagged shots in one innings (or all, without `inn`). */
export const shotsOf = (shots: ShotRec[] | undefined, batterId: string, inn?: 1 | 2): ShotRec[] =>
  (shots ?? []).filter((x) => x.batterId === batterId && (inn === undefined || x.inn === inn));

/** Runs per zone (index 0 = zone 1) from shots with a zone. */
export function zoneRuns(shots: ShotRec[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const x of shots) if (x.zone && x.zone >= 1 && x.zone <= 8) out[x.zone - 1] += x.runs;
  return out;
}

/** Runs per zone from career stat lines (`wz1`…`wz8`) and the tagged count. */
export function careerZones(lines: { stats: Record<string, number> }[]): { runs: number[]; shots: number } {
  const runs = [0, 0, 0, 0, 0, 0, 0, 0];
  let shots = 0;
  for (const l of lines) {
    for (let z = 1; z <= 8; z++) runs[z - 1] += Number(l.stats[`wz${z}`] ?? 0) || 0;
    shots += Number(l.stats.wwShots ?? 0) || 0;
  }
  return { runs, shots };
}

/** "Off side 62% · leg side 38%" from per-zone runs (zones 1–4 off, 5–8 leg). */
export function sideSplit(runs: number[]): { off: number; leg: number } | null {
  const off = runs.slice(0, 4).reduce((a, b) => a + b, 0);
  const leg = runs.slice(4).reduce((a, b) => a + b, 0);
  const t = off + leg;
  return t > 0 ? { off: Math.round((off / t) * 100), leg: 100 - Math.round((off / t) * 100) } : null;
}

/** Coverage line: how many of the scoring shots off the bat were tagged. */
export function coverage(tagged: number, scoringShots: number): string {
  if (scoringShots <= 0) return '';
  return `${Math.min(tagged, scoringShots)} of ${scoringShots} scoring shot${scoringShots === 1 ? '' : 's'} tagged`;
}

/**
 * Where a line for shot `i` of a zone ends, as a fraction of the radius (x
 * right, y down, centre 0,0). Shots in one zone fan out a little so they don't
 * sit on top of each other; boundaries (4 / 6) reach the rope, deep shots
 * 0.8, the rest 0.45.
 */
export function shotEnd(x: Pick<ShotRec, 'zone' | 'deep' | 'runs'>, i: number): { x: number; y: number } {
  const spread = ((i % 5) - 2) * 6; // −12°…+12°
  const deg = zoneAngle(x.zone ?? 1) + spread;
  const len = x.runs === 4 || x.runs === 6 ? 0.97 : x.deep ? 0.8 : 0.45;
  const r = (deg * Math.PI) / 180;
  return { x: Math.sin(r) * len, y: -Math.cos(r) * len };
}
