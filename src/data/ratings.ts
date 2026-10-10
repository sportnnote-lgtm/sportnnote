/**
 * Cross-sport player ratings for the match Summary tab. Each sport scores a
 * player's recorded stat line (the per-match counters written during scoring)
 * with its own weights, then we map the contribution to a 1–5 star rating
 * relative to the best performer in that match. Cricket ships its own richer,
 * state-based summary; every other sport uses this.
 */
import type { Player, SportId, StatLine, TournamentAward } from '../core/types';
import { leadersByKey } from './standings.ts';
import { STAT_SPORTS, mvpWeights, matchSummaryLabels, labelCompact, matchAwards, tournamentAwards, eligibilityOf, awardDef } from '../sports/statSchemas.ts';
import { cricketCareer } from './cricketCareer.ts';
import { isGoalkeeper } from '../sports/football/keepers.ts';

/** SD-15: every map below is a derived view of the per-sport stat schema
 *  (src/sports/<sport>/stats.ts) — edit the schema, not these. */

/** Points per unit of each stat, per sport (schema `weight`, in schema order).
 *  Negatives penalise (cards, fouls). Volleyball's `points` includes aces &
 *  blocks (SD-04), so theirs is the bonus on top. Per match, cricket uses its
 *  own Summary; its weights drive "Player of the Tournament". */
export const STAT_WEIGHTS: Record<SportId, Record<string, number>> = Object.fromEntries(
  STAT_SPORTS.map((sp) => [sp, mvpWeights(sp)]),
) as Record<SportId, Record<string, number>>;

/** Short (plural) labels for the per-player stat detail line — the keys the
 *  schema lists on the per-match rating line (`matchSummary`). */
export const STAT_LABELS: Record<string, string> = matchSummaryLabels();

/** Count-aware stat label — "1 goal" / "2 goals", invariant labels unchanged.
 *  Pass the sport for a sport-specific label (all sports agree today). */
export const statLabel = (stat: string, count: number, sport?: SportId): string => labelCompact(stat, count, sport);

/** Sport-specific "best in role" awards — the top player by a single stat
 *  (schema awards shown per match). */
export const SPORT_AWARDS: Record<SportId, { icon: string; label: string; stat: string }[]> = Object.fromEntries(
  STAT_SPORTS.map((sp) => [sp, matchAwards(sp).map((a) => ({ icon: a.icon, label: a.label, stat: a.stat }))]),
) as Record<SportId, { icon: string; label: string; stat: string }[]>;

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

/* ------------------------- Tournament awards (parity #21) ------------------------- */

export interface AwardSlot {
  /** 'mvp' or the stat key it ranks by */
  slot: string;
  label: string;
  icon: string;
  stat?: string;
}

const MVP_SLOT: AwardSlot = { slot: 'mvp', label: 'Player of the Tournament', icon: '🏆' };

/** The fixed award slots per sport: Player of the Tournament + the schema's
 *  tournament awards (a tournament name such as "Golden Glove" keeps the same
 *  slot key, so awards already published keep matching their slot). */
export const TOURNAMENT_AWARD_SLOTS: Record<SportId, AwardSlot[]> = Object.fromEntries(
  STAT_SPORTS.map((sp) => [
    sp,
    [MVP_SLOT, ...tournamentAwards(sp).map((a) => ({ slot: a.stat, label: a.tournamentLabel ?? a.label, icon: a.icon, stat: a.stat }))],
  ]),
) as Record<SportId, AwardSlot[]>;

/** SD-09: football's Golden Glove ranks goalkeepers only (schema `eligible`). */
const isGoldenGlove = (sport: SportId, slot: string) => eligibilityOf(sport, slot) === 'goalkeeper';

/** Icon for an award (custom awards get a medal). */
export const awardIcon = (sport: SportId, slot: string): string =>
  TOURNAMENT_AWARD_SLOTS[sport]?.find((x) => x.slot === slot)?.icon ?? '🏅';

/** How each slot is ranked — shown behind "How is this ranked?". */
export function awardFormula(sport: SportId, slot: string): string {
  if (slot === 'mvp') {
    const w = Object.entries(STAT_WEIGHTS[sport] ?? {}).filter(([, v]) => v !== 0);
    const parts = w.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([k, v]) => `${statLabel(k, 2)} ${v > 0 ? '×' : '−'}${Math.abs(v)}`);
    return `Points summed over every match in this tournament${parts.length ? `: ${parts.join(', ')}` : ''}. Ties go by name. You choose the winner.`;
  }
  if (isGoldenGlove(sport, slot)) {
    return 'Goalkeepers only (anyone who kept goal in these matches, or is listed as a GK). Most clean sheets, then most saves, then fewest goals conceded. A clean sheet goes to the keeper on the pitch longest when their team let in no goal (penalty shootouts don\'t count). You choose the winner.';
  }
  return `Total ${statLabel(slot, 2)} in this tournament's matches. Ties go by name. You choose the winner.`;
}

export interface AwardCandidate {
  playerId: string;
  name: string;
  teamName?: string;
  teamColor?: string;
  value: number;
  /** matches with a stat line in this sport */
  games: number;
  detail: string;
}

/** Higher tie-break values first, criterion by criterion. */
const tieCmp = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d) return d;
  }
  return 0;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const dashless = (parts: (string | false | undefined)[]) => parts.filter((p): p is string => !!p && !p.includes('–'));

/** Ranked players for one award slot, from this tournament's stat lines.
 *  'mvp' sums the sport's STAT_WEIGHTS over each player's lines; a stat slot
 *  totals that stat (leadersByKey). Highest first, ties by name. Pass
 *  `matchIds` to restrict to a tournament's matches. */
export function rankAwardCandidates(
  lines: StatLine[], players: Player[], sport: SportId, slot: string, limit = 10,
  opts: { matchIds?: Iterable<string> } = {},
): AwardCandidate[] {
  const ids = opts.matchIds ? new Set(opts.matchIds) : null;
  const mine = lines.filter((l) => l.sport === sport && (!ids || ids.has(l.matchId)));
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const linesOf = new Map<string, StatLine[]>();
  for (const l of mine) (linesOf.get(l.playerId) ?? linesOf.set(l.playerId, []).get(l.playerId)!).push(l);
  const sum = (ls: StatLine[], k: string) => ls.reduce((a, l) => a + (Number(l.stats?.[k]) || 0), 0);
  const career = (ls: StatLine[]) => {
    const c = cricketCareer(ls);
    const v = (sec: 'batting' | 'bowling', k: string) => c[sec].find((x) => x.key === k)?.value ?? '–';
    return { inns: v('batting', 'innings'), avg: v('batting', 'avg'), sr: v('batting', 'sr'), econ: v('bowling', 'econ'), bowlAvg: v('bowling', 'bowlAvg') };
  };

  const detailFor = (pid: string, value: number, games: number): string => {
    const ls = linesOf.get(pid) ?? [];
    const m = `${games} m`;
    if (sport === 'cricket' && slot === 'runs') {
      const c = career(ls);
      return dashless([`${value} ${statLabel('runs', value)}`, `${c.inns} inns`, `avg ${c.avg}`, `SR ${c.sr}`]).join(' · ');
    }
    if (sport === 'cricket' && slot === 'wickets') {
      const c = career(ls);
      return dashless([`${value} ${statLabel('wickets', value)}`, m, `econ ${c.econ}`, `avg ${c.bowlAvg}`]).join(' · ');
    }
    if (isGoldenGlove(sport, slot)) {
      const sv = sum(ls, 'saves');
      const tracked = ls.some((l) => l.stats && 'goalsConceded' in l.stats);
      return [`${value} ${statLabel('cleanSheets', value)}`, sv ? `${sv} ${statLabel('saves', sv)}` : '', tracked ? `${sum(ls, 'goalsConceded')} conceded` : '', m].filter(Boolean).join(' · ');
    }
    if (slot === 'mvp') {
      const w = STAT_WEIGHTS[sport] ?? {};
      const top = Object.keys(w)
        .map((k) => [k, sum(ls, k)] as const)
        .filter(([k, v]) => v > 0 && (w[k] ?? 0) > 0 && STAT_LABELS[k])
        .sort((a, b) => b[1] * (w[b[0]] ?? 0) - a[1] * (w[a[0]] ?? 0))
        .slice(0, 3)
        .map(([k, v]) => `${v} ${statLabel(k, v)}`);
      return [m, ...top].join(' · ');
    }
    return `${value} ${statLabel(slot, value)} · ${m}`;
  };

  // Tie-breaks after the value, from the schema's award (Golden Glove: more
  // saves, then fewer conceded) — higher-is-better values rank first.
  const tieOf = (ls: StatLine[]) => (awardDef(sport, slot)?.tieBreak ?? []).map((t) => (t.better === 'higher' ? 1 : -1) * sum(ls, t.key));
  let rows: { playerId: string; value: number; games: number; tie?: number[] }[];
  if (isGoldenGlove(sport, slot)) {
    // Keepers: listed as a GK, or kept goal in one of these matches (a keeper
    // line carries goalsConceded). Older clean sheets credited to defenders
    // don't qualify.
    rows = [...linesOf.entries()]
      .filter(([pid, ls]) => isGoalkeeper(byId.get(pid)?.sportDetails?.football?.position) || ls.some((l) => l.stats && 'goalsConceded' in l.stats))
      .map(([pid, ls]) => ({ playerId: pid, value: sum(ls, slot), games: ls.length, tie: tieOf(ls) }));
  } else if (slot === 'mvp') {
    const w = STAT_WEIGHTS[sport] ?? {};
    rows = [...linesOf.entries()].map(([pid, ls]) => ({
      playerId: pid,
      value: round1(ls.reduce((a, l) => a + Object.entries(l.stats ?? {}).reduce((s2, [k, v]) => s2 + (Number(v) || 0) * (w[k] ?? 0), 0), 0)),
      games: ls.length,
    }));
  } else {
    rows = leadersByKey(mine, players, sport, slot, Number.MAX_SAFE_INTEGER)
      .map((l) => ({ playerId: l.playerId, value: l.value, games: l.totalGames ?? 0 }));
  }
  return rows
    .filter((r) => r.value > 0)
    .map((r) => {
      const p = byId.get(r.playerId);
      return {
        playerId: r.playerId, name: p?.fullName ?? 'Player', teamName: p?.houseName, teamColor: p?.houseColor,
        value: r.value, games: r.games, detail: detailFor(r.playerId, r.value, r.games), tie: r.tie ?? [],
      };
    })
    .sort((a, b) => b.value - a.value || tieCmp(a.tie, b.tie) || a.name.localeCompare(b.name))
    .map(({ tie: _tie, ...c }) => c)
    .slice(0, limit);
}

/** Stable id for a fixed slot's award. */
export const awardId = (sport: SportId, slot: string) => `${sport}:${slot}`;

/** An award from a candidate (fills the label/sport/slot). */
export function awardFrom(sport: SportId, slot: string, label: string, c: AwardCandidate, id = awardId(sport, slot)): TournamentAward {
  return { id, slot, label, sport, playerId: c.playerId, playerName: c.name, teamName: c.teamName, value: c.value, detail: c.detail };
}

/** The suggested awards: the #1 candidate in each of the sport's slots (slots
 *  with no candidate are left out). */
export function defaultAwards(
  lines: StatLine[], players: Player[], sport: SportId, opts: { matchIds?: Iterable<string> } = {},
): TournamentAward[] {
  return (TOURNAMENT_AWARD_SLOTS[sport] ?? []).flatMap((s) => {
    const top = rankAwardCandidates(lines, players, sport, s.slot, 1, opts)[0];
    return top ? [awardFrom(sport, s.slot, s.label, top)] : [];
  });
}

/* ------------------------ Player of the Match precedence ------------------------ */

export interface PotmProp {
  id: string;
  name: string;
  /** changed by officials (an override with `by`) */
  changed: boolean;
}
export interface ResolvedPotm {
  id?: string;
  name: string;
  source: 'stored' | 'legacy' | 'mvp';
  changed: boolean;
}

/** REVIEW Decision 10 — the stored matches.potm override, then the legacy
 *  cricket `s.potm` (a name, resolved to an id by the caller where possible),
 *  then the computed MVP. A #05/#06 correction that changes the MVP never
 *  replaces a stored override. */
export function resolvePotm(
  stored: PotmProp | undefined | null,
  legacy: { id?: string; name: string } | string | undefined | null,
  mvp: { id: string; name: string } | undefined | null,
): ResolvedPotm | undefined {
  if (stored && stored.name) return { id: stored.id, name: stored.name, source: 'stored', changed: !!stored.changed };
  const lg = typeof legacy === 'string' ? { name: legacy } : legacy;
  if (lg && lg.name) return { id: lg.id, name: lg.name, source: 'legacy', changed: false };
  if (mvp) return { id: mvp.id, name: mvp.name, source: 'mvp', changed: false };
  return undefined;
}
