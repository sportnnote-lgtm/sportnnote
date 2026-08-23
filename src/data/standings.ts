/**
 * Standings & statistics — computed from completed match results and the
 * stat-line log. Works for any single sport, so a single-sport tournament just
 * shows that sport's table and leaders. Pure functions.
 */
import type { Match, Player, SportId, StatLine } from '../core/types';

export interface TeamStanding {
  teamId: string;
  name: string;
  colorHex?: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  /** points/goals/runs scored & conceded across the team's matches */
  for: number;
  against: number;
  diff: number;
  points: number;
}

/** League table for a sport: 2 pts a win, 1 a draw, with for/against/diff. */
export function teamStandings(matches: Match[], sport: SportId): TeamStanding[] {
  const table = new Map<string, TeamStanding>();
  const ensure = (id: string, name: string, color?: string) => {
    if (!table.has(id))
      table.set(id, { teamId: id, name, colorHex: color, played: 0, won: 0, lost: 0, drawn: 0, for: 0, against: 0, diff: 0, points: 0 });
    return table.get(id)!;
  };
  for (const m of matches) {
    if (m.sport !== sport || m.status !== 'completed' || !m.winner) continue;
    const h = ensure(m.homeTeam.id, m.homeTeam.name, m.homeTeam.colorHex);
    const a = ensure(m.awayTeam.id, m.awayTeam.name, m.awayTeam.colorHex);
    h.played += 1;
    a.played += 1;
    if (m.score) {
      h.for += m.score.home; h.against += m.score.away;
      a.for += m.score.away; a.against += m.score.home;
    }
    if (m.winner === 'draw') {
      h.drawn += 1; a.drawn += 1; h.points += 1; a.points += 1;
    } else if (m.winner === 'home') {
      h.won += 1; a.lost += 1; h.points += 2;
    } else {
      a.won += 1; h.lost += 1; a.points += 2;
    }
  }
  for (const t of table.values()) t.diff = t.for - t.against;
  return [...table.values()].sort(
    (x, y) => y.points - x.points || y.diff - x.diff || y.for - x.for || x.name.localeCompare(y.name)
  );
}

export interface OverallStanding {
  teamId: string;
  name: string;
  colorHex?: string;
  played: number;
  points: number;
}

/** Aggregate points across every sport in the meet — the headline house table. */
export function overallStandings(matches: Match[], sports: SportId[]): OverallStanding[] {
  // A house/school fields a SEPARATE team row per sport (each row is single-sport),
  // so the cross-sport "overall" table must merge by NAME — the app's cross-sport
  // identity convention (e.g. "Red House" football + "Red House" cricket = one
  // house). Keying by teamId would show a multi-sport house as several rows.
  const totals = new Map<string, OverallStanding>();
  for (const sport of sports) {
    for (const t of teamStandings(matches, sport)) {
      const key = t.name.trim().toLowerCase();
      const o = totals.get(key) ?? { teamId: t.teamId, name: t.name, colorHex: t.colorHex, played: 0, points: 0 };
      o.played += t.played;
      o.points += t.points;
      totals.set(key, o);
    }
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/** Per-sport leaderboard categories — the stats we rank players by. The first
 *  is the headline (used for compact summaries). */
export const STAT_CATEGORIES: Record<SportId, { key: string; label: string }[]> = {
  football: [
    { key: 'goals', label: 'Goals' },
    { key: 'openPlayGoals', label: 'Open-play goals' },
    { key: 'penaltyGoals', label: 'Penalties' },
    { key: 'freekickGoals', label: 'Free-kick goals' },
    { key: 'assists', label: 'Assists' },
    { key: 'cleanSheets', label: 'Clean sheets' },
    { key: 'shots', label: 'Shots' },
    { key: 'shotsOnTarget', label: 'Shots on target' },
    { key: 'tackles', label: 'Tackles' },
    { key: 'interceptions', label: 'Interceptions' },
    { key: 'saves', label: 'Saves' },
    { key: 'passes', label: 'Passes' },
    { key: 'attackingContributions', label: 'Attacking plays' },
    { key: 'defensiveContributions', label: 'Defensive plays' },
  ],
  cricket: [
    { key: 'runs', label: 'Runs' },
    { key: 'wickets', label: 'Wickets' },
    { key: 'catches', label: 'Catches' },
  ],
  basketball: [
    { key: 'points', label: 'Points' },
    { key: 'rebounds', label: 'Rebounds' },
    { key: 'assists', label: 'Assists' },
    { key: 'steals', label: 'Steals' },
    { key: 'blocks', label: 'Blocks' },
  ],
  badminton: [{ key: 'points', label: 'Points' }],
  tennis: [
    { key: 'points', label: 'Points' },
    { key: 'aces', label: 'Aces' },
  ],
  volleyball: [
    { key: 'points', label: 'Points' },
    { key: 'aces', label: 'Aces' },
  ],
  kabaddi: [
    { key: 'raidPoints', label: 'Raid pts' },
    { key: 'tacklePoints', label: 'Tackle pts' },
  ],
  pickleball: [{ key: 'points', label: 'Points' }],
  padel: [{ key: 'points', label: 'Points' }],
  squash: [{ key: 'points', label: 'Points' }],
};

/** The headline stat used to rank individuals in each sport. */
export const leaderStat = (sport: SportId) => {
  const c = STAT_CATEGORIES[sport][0];
  return { key: c.key, label: c.label.toLowerCase() };
};

export interface StatLeader {
  playerId: string;
  name: string;
  houseName?: string;
  value: number;
  /** games in which this stat was tracked (≤ games played) */
  trackedGames?: number;
  /** total games the player featured in this sport */
  totalGames?: number;
}

/** Top-N players by a single stat key in a sport. Also records, per player, how
 *  many of their games actually tracked this stat (so a leaderboard can flag a
 *  total that spans fewer games — see the per-game scoring settings). */
export function leadersByKey(lines: StatLine[], players: Player[], sport: SportId, key: string, limit = 10): StatLeader[] {
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const totals = new Map<string, number>();
  const totalGames = new Map<string, number>();
  const trackedGames = new Map<string, number>();
  for (const l of lines) {
    if (l.sport !== sport) continue;
    totals.set(l.playerId, (totals.get(l.playerId) ?? 0) + (l.stats[key] ?? 0));
    totalGames.set(l.playerId, (totalGames.get(l.playerId) ?? 0) + 1);
    if (l.tracked ? l.tracked.includes(key) : true) trackedGames.set(l.playerId, (trackedGames.get(l.playerId) ?? 0) + 1);
  }
  return [...totals.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, value]) => ({
      playerId: id, name: byId.get(id)?.fullName ?? 'Player', houseName: byId.get(id)?.houseName, value,
      trackedGames: trackedGames.get(id) ?? 0, totalGames: totalGames.get(id) ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export interface LeaderCategory {
  key: string;
  label: string;
  leaders: StatLeader[];
}

/** Every leaderboard category for a sport, each with its ranked players. */
export function categoryLeaders(lines: StatLine[], players: Player[], sport: SportId): LeaderCategory[] {
  return STAT_CATEGORIES[sport]
    .map((c) => ({ key: c.key, label: c.label, leaders: leadersByKey(lines, players, sport, c.key) }))
    .filter((c) => c.leaders.length > 0);
}

/** Back-compat: headline leaders for a sport. */
export function statLeaders(lines: StatLine[], players: Player[], sport: SportId): StatLeader[] {
  return leadersByKey(lines, players, sport, leaderStat(sport).key);
}
