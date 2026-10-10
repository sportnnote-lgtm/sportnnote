/**
 * SD-23 golden reference — the per-player tables the bespoke box score
 * components drew before the shared box score replaced them (copied from
 * src/sports/basketball/BoxScore.tsx, volleyball/BoxScore.tsx,
 * kabaddi/BoxScore.tsx, tennis/BoxScore.tsx, badminton/BoxScore.tsx and
 * src/sports/PointBoxScore.tsx at 3c8d93b), reduced to their visible text:
 * the column headers and, per row, the name and each cell as drawn.
 * tests/box-score.test.mts holds the shared model equal to these.
 */
import type { Player } from '../src/core/types.ts';
import type { LiveEvent } from '../src/sports/liveEvents.ts';
import { pointsOf, type BBEvent } from '../src/sports/basketball/events.ts';
import { tally as vbTally } from '../src/sports/volleyball/engine.ts';
import { tally as kbTally } from '../src/sports/kabaddi/engine.ts';

export interface LegacyTable { headers: string[]; rows: string[][] }
type Side = 'home' | 'away';
type Scope = 'all' | number;

/* basketball/BoxScore.tsx */
interface BBLine { name: string; pts: number; reb: number; ast: number; stl: number; blk: number; to: number; pf: number }
function bbTally(events: BBEvent[], side: Side, roster: Player[], scope: Scope = 'all'): BBLine[] {
  const byName = new Map<string, BBLine>();
  const ensure = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 });
    return byName.get(name)!;
  };
  roster.forEach((p) => ensure(p.fullName));
  for (const e of events) {
    if (e.side !== side || !e.playerName) continue;
    if (scope !== 'all' && e.quarter !== scope) continue;
    const l = ensure(e.playerName);
    l.pts += pointsOf(e);
    if (e.type === 'rebound') l.reb += 1;
    else if (e.type === 'assist') l.ast += 1;
    else if (e.type === 'steal') l.stl += 1;
    else if (e.type === 'block') l.blk += 1;
    else if (e.type === 'turnover') l.to += 1;
    else if (e.type === 'foul') l.pf += 1;
  }
  return [...byName.values()].sort((a, b) => b.pts - a.pts);
}
type BoxField = Map<string, { min?: number; pm: number; on: boolean }>;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
export function legacyBasketball(events: BBEvent[], side: Side, roster: Player[], scope: Scope, fieldAll?: BoxField): LegacyTable {
  const lines = bbTally(events, side, roster, scope);
  const field = scope === 'all' ? fieldAll : undefined;
  const showField = !!field && lines.some((l) => field.has(l.name));
  const showMin = showField && lines.some((l) => field!.get(l.name)?.min !== undefined);
  const headers = [...(showMin ? ['MIN'] : []), 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', ...(showField ? ['+/-'] : [])];
  const rows = lines.map((l) => [
    l.name,
    ...(showMin ? [String(field!.get(l.name)?.min ?? '–')] : []),
    ...[l.pts, l.reb, l.ast, l.stl, l.blk, l.to, l.pf].map(String),
    ...(showField ? [field!.has(l.name) ? signed(field!.get(l.name)!.pm) : '–'] : []),
  ]);
  return { headers, rows };
}

/* volleyball/BoxScore.tsx */
export function legacyVolleyball(events: LiveEvent[], side: Side, scope: Scope): LegacyTable {
  return { headers: ['PTS', 'ACE', 'BLK'], rows: vbTally(events, side, scope).map((l) => [l.name, String(l.points), String(l.aces), String(l.blocks)]) };
}

/* kabaddi/BoxScore.tsx */
export function legacyKabaddi(events: LiveEvent[], side: Side, scope: Scope): LegacyTable {
  return { headers: ['RAID', 'TCKL', 'PTS'], rows: kbTally(events, side, scope).map((l) => [l.name, String(l.raid), String(l.tackle), String(l.raid + l.tackle)]) };
}

/* tennis/BoxScore.tsx */
export function legacyTennis(events: LiveEvent[], side: Side, scope: Scope): LegacyTable {
  const byName = new Map<string, { name: string; points: number; aces: number }>();
  for (const e of events) {
    if (e.side !== side || !e.playerName || (e.kind !== 'point' && e.kind !== 'ace')) continue;
    if (scope !== 'all' && e.set !== scope) continue;
    const l = byName.get(e.playerName) ?? byName.set(e.playerName, { name: e.playerName, points: 0, aces: 0 }).get(e.playerName)!;
    l.points += 1;
    if (e.kind === 'ace') l.aces += 1;
  }
  const lines = [...byName.values()].sort((a, b) => b.points - a.points || b.aces - a.aces);
  return { headers: ['PTS', 'ACE'], rows: lines.map((l) => [l.name, String(l.points), String(l.aces)]) };
}

/* badminton/BoxScore.tsx */
export function legacyBadminton(events: LiveEvent[], side: Side, scope: Scope): LegacyTable {
  const byName = new Map<string, { name: string; points: number }>();
  for (const e of events) {
    if (e.side !== side || !e.playerName || e.kind !== 'point') continue;
    if (scope !== 'all' && e.game !== scope) continue;
    const l = byName.get(e.playerName) ?? { name: e.playerName, points: 0 };
    l.points += 1;
    byName.set(e.playerName, l);
  }
  const lines = [...byName.values()].sort((a, b) => b.points - a.points);
  return { headers: ['PTS'], rows: lines.map((l) => [l.name, String(l.points)]) };
}

/* PointBoxScore.tsx (table tennis, squash, pickleball, padel) */
export function legacyPoint(events: LiveEvent[], side: Side, scope: Scope, roster: Player[]): LegacyTable {
  const periodOf = (e: LiveEvent) => e.game ?? e.set;
  const byName = new Map<string, { name: string; points: number }>();
  const ensure = (name: string) => (byName.get(name) ?? byName.set(name, { name, points: 0 }).get(name)!);
  roster.forEach((p) => ensure(p.fullName));
  for (const e of events) {
    if (e.side !== side || !e.playerName || e.kind !== 'point') continue;
    if (scope !== 'all' && periodOf(e) !== scope) continue;
    ensure(e.playerName).points += 1;
  }
  const lines = [...byName.values()].sort((a, b) => b.points - a.points);
  return { headers: ['PTS'], rows: lines.map((l) => [l.name, String(l.points)]) };
}
