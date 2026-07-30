/**
 * Cross-sport player ratings for the match Summary tab. Each sport scores a
 * player's recorded stat line (the per-match counters written during scoring)
 * with its own weights, then we map the contribution to a 1–5 star rating
 * relative to the best performer in that match. Cricket ships its own richer,
 * state-based summary; every other sport uses this.
 */
import type { Player, SportId, StatLine } from '../core/types';

/** Points per unit of each stat, per sport. Negatives penalise (cards, fouls). */
export const STAT_WEIGHTS: Record<SportId, Record<string, number>> = {
  football: {
    goals: 10, assists: 6, cleanSheets: 8,
    shotsOnTarget: 1.5, shots: 0.5, saves: 2, tackles: 1, interceptions: 1,
    attackingContributions: 1, defensiveContributions: 1, passesComplete: 0.05,
    crosses: 0.5, dribbles: 0.5,
    penaltiesWon: 2, penaltiesMissed: -3,
    fouls: -1, offsides: -0.5, handballs: -1, yellowCards: -2, redCards: -6,
  },
  basketball: { points: 1, rebounds: 1.5, assists: 2, fouls: -1 },
  volleyball: { points: 1, aces: 3, blocks: 2 },
  badminton: { points: 1 },
  tennis: { points: 1, aces: 2 },
  kabaddi: { raidPoints: 2, tacklePoints: 2 },
  cricket: { runs: 1, wickets: 18, cleanSheets: 0 }, // cricket uses its own Summary
  pickleball: { points: 1 },
  padel: { points: 1 },
  squash: { points: 1 },
};

/** Short (plural) labels for the per-player stat detail line. */
export const STAT_LABELS: Record<string, string> = {
  goals: 'goals', assists: 'assists', cleanSheets: 'clean sheets', yellowCards: 'yellow', redCards: 'red',
  shots: 'shots', shotsOnTarget: 'on target', saves: 'saves', tackles: 'tackles', interceptions: 'interceptions',
  attackingContributions: 'att. plays', defensiveContributions: 'def. plays', passesComplete: 'passes',
  crosses: 'crosses', dribbles: 'dribbles', offsides: 'offside', handballs: 'handball',
  penaltiesWon: 'pen won', penaltiesMissed: 'pen missed',
  points: 'pts', rebounds: 'reb', fouls: 'fouls', aces: 'aces', blocks: 'blocks',
  raidPoints: 'raid pts', tacklePoints: 'tackle pts', runs: 'runs', wickets: 'wkts', games: 'games',
};

/** Labels that read the same for one or many (mass nouns, abbreviations, adjectives). */
const INVARIANT_LABELS = new Set([
  'yellowCards', 'redCards', 'shotsOnTarget', 'offsides', 'handballs',
  'penaltiesWon', 'penaltiesMissed', 'points', 'rebounds', 'raidPoints', 'tacklePoints', 'wickets',
]);

/** Singular form for count === 1, only where it differs from the plural label. */
const SINGULAR_LABELS: Record<string, string> = {
  goals: 'goal', assists: 'assist', cleanSheets: 'clean sheet', shots: 'shot', saves: 'save',
  tackles: 'tackle', interceptions: 'interception', attackingContributions: 'att. play',
  defensiveContributions: 'def. play', passesComplete: 'pass', crosses: 'cross', dribbles: 'dribble',
  fouls: 'foul', aces: 'ace', blocks: 'block', runs: 'run', games: 'game',
};

/** Count-aware stat label — "1 goal" / "2 goals", invariant labels unchanged. */
export const statLabel = (stat: string, count: number): string => {
  const plural = STAT_LABELS[stat] ?? stat;
  if (count === 1 && !INVARIANT_LABELS.has(stat)) return SINGULAR_LABELS[stat] ?? plural;
  return plural;
};

/** Sport-specific "best in role" awards — the top player by a single stat. */
export const SPORT_AWARDS: Record<SportId, { icon: string; label: string; stat: string }[]> = {
  football: [
    { icon: '⚽', label: 'Top scorer', stat: 'goals' },
    { icon: '🅰️', label: 'Playmaker', stat: 'assists' },
    { icon: '🧤', label: 'Clean sheet', stat: 'cleanSheets' },
  ],
  basketball: [
    { icon: '🏀', label: 'Top scorer', stat: 'points' },
    { icon: '💪', label: 'Rebounds', stat: 'rebounds' },
    { icon: '🎯', label: 'Playmaker', stat: 'assists' },
  ],
  volleyball: [
    { icon: '🏐', label: 'Top scorer', stat: 'points' },
    { icon: '💥', label: 'Aces', stat: 'aces' },
  ],
  badminton: [{ icon: '🏸', label: 'Top scorer', stat: 'points' }],
  tennis: [
    { icon: '🎾', label: 'Top scorer', stat: 'points' },
    { icon: '💥', label: 'Aces', stat: 'aces' },
  ],
  kabaddi: [
    { icon: '🤼', label: 'Top raider', stat: 'raidPoints' },
    { icon: '🛡️', label: 'Top defender', stat: 'tacklePoints' },
  ],
  cricket: [], // cricket ships its own richer summary
  pickleball: [{ icon: '🥒', label: 'Top scorer', stat: 'points' }],
  padel: [{ icon: '🟡', label: 'Top scorer', stat: 'points' }],
  squash: [{ icon: '⚫', label: 'Top scorer', stat: 'points' }],
};

export interface MatchRating {
  id: string;
  name: string;
  side: 'home' | 'away';
  points: number;
  rating: number; // 1–5
  detail: string; // e.g. "2 goals · 1 assist"
  stats: Record<string, number>;
}

const star = (r: number) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
export const ratingStars = star;

/** Build ratings for a match from its stat lines + the two rosters. */
export function matchRatings(
  lines: StatLine[],
  sport: SportId,
  homeRoster: Player[],
  awayRoster: Player[]
): { players: MatchRating[]; mvp?: MatchRating } {
  const weights = STAT_WEIGHTS[sport] ?? {};
  const sideOf = (id: string): 'home' | 'away' | undefined =>
    homeRoster.some((p) => p.id === id) ? 'home' : awayRoster.some((p) => p.id === id) ? 'away' : undefined;
  const nameOf = (id: string) =>
    [...homeRoster, ...awayRoster].find((p) => p.id === id)?.fullName ?? 'Player';

  const raw = lines
    .map((l) => {
      const stats = l.stats ?? {};
      const points = Object.entries(stats).reduce((sum, [k, v]) => sum + v * (weights[k] ?? 0), 0);
      const detail = Object.entries(stats)
        .filter(([k, v]) => v !== 0 && STAT_LABELS[k])
        .sort((a, b) => Math.abs(b[1] * (weights[b[0]] ?? 0)) - Math.abs(a[1] * (weights[a[0]] ?? 0)))
        .slice(0, 6) // keep the line readable for busy players
        .map(([k, v]) => `${v} ${statLabel(k, v)}`)
        .join(' · ');
      return { id: l.playerId, name: nameOf(l.playerId), side: sideOf(l.playerId) ?? 'home', points, detail, stats };
    })
    .filter((p) => p.detail.length > 0);

  const top = Math.max(1, ...raw.map((p) => p.points));
  const players: MatchRating[] = raw
    .map((p) => {
      // Relative to the match's best; a contribution of 0/negative floors at 1.
      const r = p.points <= 0 ? 1 : Math.max(1, Math.min(5, Math.round((1.5 + (p.points / top) * 3.5) * 2) / 2));
      return { ...p, rating: r };
    })
    .sort((a, b) => b.points - a.points);

  return { players, mvp: players.find((p) => p.points > 0) };
}

export interface Award {
  icon: string;
  label: string;
  stat: string;
  player: MatchRating;
  value: number;
}

/** Top player for each of the sport's role awards (highest of that stat, > 0). */
export function awardsFor(players: MatchRating[], sport: SportId): Award[] {
  return (SPORT_AWARDS[sport] ?? [])
    .map((a) => {
      const ranked = players.filter((p) => (p.stats[a.stat] ?? 0) > 0).sort((x, y) => (y.stats[a.stat] ?? 0) - (x.stats[a.stat] ?? 0));
      const player = ranked[0];
      return player ? { ...a, player, value: player.stats[a.stat] ?? 0 } : null;
    })
    .filter((a): a is Award => !!a);
}
