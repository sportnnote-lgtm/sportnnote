/**
 * Stat rollups. Given a player's StatLines (one per match they featured in),
 * aggregate them into the totals a profile shows: matches, wins, per-sport
 * breakdowns and summed counters. Pure functions — easy to unit test and reuse
 * on client or server.
 */
import type { SportId, StatLine } from '../core/types';

export interface SportBreakdown {
  sport: SportId;
  matches: number;
  wins: number;
  totals: Record<string, number>;
}

export interface PlayerStats {
  matches: number;
  wins: number;
  winRate: number; // 0..1
  sports: SportId[];
  /** every counter summed across all sports, e.g. {goals: 3, points: 56} */
  totals: Record<string, number>;
  bySport: SportBreakdown[];
  /** most recent first */
  recent: StatLine[];
}

function addInto(target: Record<string, number>, src: Record<string, number>) {
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] ?? 0) + v;
}

export function aggregate(lines: StatLine[]): PlayerStats {
  const totals: Record<string, number> = {};
  const bySportMap = new Map<SportId, SportBreakdown>();
  let wins = 0;

  for (const l of lines) {
    addInto(totals, l.stats);
    if (l.won) wins += 1;
    let b = bySportMap.get(l.sport);
    if (!b) {
      b = { sport: l.sport, matches: 0, wins: 0, totals: {} };
      bySportMap.set(l.sport, b);
    }
    b.matches += 1;
    if (l.won) b.wins += 1;
    addInto(b.totals, l.stats);
  }

  const recent = [...lines].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  return {
    matches: lines.length,
    wins,
    winRate: lines.length ? wins / lines.length : 0,
    sports: [...bySportMap.keys()],
    totals,
    bySport: [...bySportMap.values()].sort((a, b) => b.matches - a.matches),
    recent,
  };
}

/**
 * How many of a player's games (in one sport) actually *tracked* a given stat.
 * A stat line's `tracked` list says which stats its match was capturing; lines
 * without it (legacy / core stats) count as tracked. So a total like "shots on
 * target" can correctly read "over 32 of 50 games" when some scorers didn't track it.
 */
export function statCoverage(lines: StatLine[], sport: SportId, statKey: string): { tracked: number; total: number } {
  const sportLines = lines.filter((l) => l.sport === sport);
  const tracked = sportLines.filter((l) => (l.tracked ? l.tracked.includes(statKey) : true)).length;
  return { tracked, total: sportLines.length };
}

/** Short (plural) labels for compact per-sport stat summaries (profile rows, Discover). */
const STAT_LABEL: Record<string, string> = {
  goals: 'goals', openPlayGoals: 'open-play', penaltyGoals: 'penalties', freekickGoals: 'free-kick goals',
  assists: 'assists', cleanSheets: 'clean sheets', shots: 'shots', shotsOnTarget: 'shots on target',
  tackles: 'tackles', interceptions: 'interceptions', saves: 'saves', passes: 'passes',
  attackingContributions: 'attacking plays', defensiveContributions: 'defensive plays',
  runs: 'runs', wickets: 'wkts', points: 'pts', rebounds: 'reb', aces: 'aces', blocks: 'blocks', attackPoints: 'attack pts', raidPoints: 'raid pts', tacklePoints: 'tackle pts', games: 'games',
  wins: 'wins', draws: 'draws', losses: 'losses', boards: 'boards', queens: 'queens',
  rounds: 'rounds', birdies: 'birdies', eagles: 'eagles', holesWon: 'holes won',
};
/** Singular form for count === 1, only where it differs from the plural label.
 *  Keys absent here (mass nouns / abbreviations like "pts", "wkts", "open-play")
 *  read the same for one or many, so they fall back to the plural label. */
const STAT_LABEL_ONE: Record<string, string> = {
  goals: 'goal', penaltyGoals: 'penalty', freekickGoals: 'free-kick goal', assists: 'assist',
  cleanSheets: 'clean sheet', shots: 'shot', shotsOnTarget: 'shot on target', tackles: 'tackle',
  interceptions: 'interception', saves: 'save', passes: 'pass', attackingContributions: 'attacking play',
  defensiveContributions: 'defensive play', runs: 'run', aces: 'ace', blocks: 'block', games: 'game',
  wins: 'win', draws: 'draw', losses: 'loss', boards: 'board', queens: 'queen',
  rounds: 'round', birdies: 'birdie', eagles: 'eagle', holesWon: 'hole won',
};
/** Readable short label for a stat key, e.g. "raidPoints" → "raid pts". Pass the
 *  count to get the singular for exactly one ("1 goal" vs "2 goals"). Falls back
 *  to the raw key so a new stat still renders (just un-prettified). */
export const statLabelShort = (key: string, count?: number): string => {
  const plural = STAT_LABEL[key] ?? key;
  return count === 1 ? (STAT_LABEL_ONE[key] ?? plural) : plural;
};

/** Per-sport priority of which stats to surface first in a compact summary. */
const HEADLINE_ORDER: Partial<Record<SportId, string[]>> = {
  football: ['goals', 'assists', 'shotsOnTarget', 'tackles', 'saves', 'passes'],
  cricket: ['runs', 'wickets'],
  basketball: ['points', 'rebounds', 'assists'],
  kabaddi: ['raidPoints', 'tacklePoints'],
  tennis: ['points', 'aces'],
  volleyball: ['points', 'aces'],
  badminton: ['points'],
  pickleball: ['points'],
  padel: ['points'],
  squash: ['points'],
  tabletennis: ['points'],
  chess: ['wins', 'draws', 'games'],
  carrom: ['points', 'boards', 'queens'],
  golf: ['rounds', 'birdies', 'eagles'],
};
/** A compact "8 goals · 2 assists · 9 shots on target" line for one sport. */
export function sportSummary(b: SportBreakdown): string {
  if (b.sport === 'golf') {
    // Golf reads in rounds + scoring average, not summed counters.
    const t = b.totals;
    // 18-hole-equivalent scoring average over complete rounds (see golf engine).
    const avg = t.completeRounds ? t.completeStrokes / t.completeRounds : null;
    return [
      t.rounds ? `${t.rounds} ${t.rounds === 1 ? 'round' : 'rounds'}` : '',
      avg != null ? `avg ${avg.toFixed(1)}` : '',
      t.birdies ? `${t.birdies} ${statLabelShort('birdies', t.birdies)}` : '',
    ].filter(Boolean).join(' · ');
  }
  const order = HEADLINE_ORDER[b.sport] ?? Object.keys(b.totals);
  const keys = order.filter((k) => (b.totals[k] ?? 0) > 0).slice(0, 3);
  return keys.map((k) => `${b.totals[k]} ${statLabelShort(k, b.totals[k])}`).join(' · ');
}

/** Whether any of a player's stats in a sport were tracked in fewer games than played. */
export function hasPartialCoverage(lines: StatLine[], b: SportBreakdown): boolean {
  return Object.keys(b.totals).some((k) => {
    const c = statCoverage(lines, b.sport, k);
    return c.tracked < c.total;
  });
}

/** A short headline stat for list rows, e.g. "12 goals" or "18.0 ppg". */
export function headline(stats: PlayerStats): string {
  const t = stats.totals;
  if (t.goals) return `${t.goals} ${statLabelShort('goals', t.goals)}`;
  if (t.points && stats.bySport.some((s) => s.sport === 'basketball'))
    return `${(t.points / Math.max(1, stats.matches)).toFixed(1)} ppg`;
  if (t.raidPoints) return `${t.raidPoints} raid pts`;
  if (t.golds) return `${t.golds}🥇`;
  if (t.points) return `${t.points} pts`;
  return `${stats.matches} ${stats.matches === 1 ? 'match' : 'matches'}`;
}
