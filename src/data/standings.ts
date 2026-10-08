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
  /** no result / abandoned (parity #04): counts as played, `noResult` points each */
  nr: number;
  /** points/goals/runs scored & conceded across the team's matches */
  for: number;
  against: number;
  diff: number;
  points: number;
  /** rate denominators (cricket: overs faced / bowled) — drives NRR */
  forUnits: number;
  againstUnits: number;
  /** Sonneborn-Berger (chess): Σ over games of (share of the game's points won ×
   *  that opponent's final points) — credit for scoring against strong finishers */
  sb?: number;
  /** net rate (cricket: net run rate) when the sport supplies rate units */
  nrr?: number;
}

/** How a league/group table awards points and breaks ties. Points default per
 *  sport (football 3-1-0, chess 1-½-0, table tennis ITTF 2-1, others 2-1-0); the
 *  tie-break order is applied within any cluster still level after points.
 *
 *  Tie-breakers:
 *   • h2h       — points from matches played only among the tied teams
 *   • nrr       — net run rate (cricket)
 *   • diff      — overall score difference;  for — overall score for
 *   • wins      — number of wins (FIDE)
 *   • sb        — Sonneborn-Berger (FIDE round robin)
 *   • h2hRatio  — score ratio (e.g. games won ÷ lost) among the tied teams only (ITTF)
 *   • h2hPoints — rally-point ratio among the tied teams only (ITTF), from the
 *                 sport's `standingsPoints` (points won in every game) */
export type TieBreaker = 'h2h' | 'nrr' | 'diff' | 'for' | 'wins' | 'sb' | 'h2hRatio' | 'h2hPoints';
export interface StandingsConfig {
  win: number;
  draw: number;
  loss: number;
  /** points each side takes from a no-result / abandoned match (parity #04).
   *  Absent = the sport default — always read it through `noResultPoints()`. */
  noResult?: number;
  order: TieBreaker[];
  /** ITTF-style: when a criterion separates SOME of the tied teams, the ones
   *  still level start the whole procedure again among themselves only (so
   *  "among the tied" criteria are recomputed for the smaller group). */
  restart?: boolean;
}
const ALL_TB: TieBreaker[] = ['h2h', 'nrr', 'diff', 'for', 'wins', 'sb', 'h2hRatio', 'h2hPoints'];
const isTieBreaker = (s: string): s is TieBreaker => (ALL_TB as string[]).includes(s);

/** Sensible defaults: football is the modern 3 points a win; cricket ranks ties
 *  by net run rate; chess and table tennis follow FIDE / ITTF; everything else
 *  by points difference. Head-to-head first, which is how most real
 *  competitions read a two-team tie. A no result is worth 1 in cricket (common
 *  league practice, the washout shares the points) and 0 elsewhere (usually
 *  replayed) — see `noResultPoints`. */
export function defaultStandingsConfig(sport: SportId): StandingsConfig {
  // Chess: game points 1 / ½ / 0. FIDE (C.07) leaves the order to each event;
  // elite round robins (Candidates 2024, Tata Steel 2024) rank ties by
  // Sonneborn-Berger, then number of wins, then direct encounter.
  if (sport === 'chess') return { win: 1, draw: 0.5, loss: 0, order: ['sb', 'wins', 'h2h'] };
  // ITTF group: 2 match points a win, 1 a loss (played); ties → among the tied
  // players only: match points, then games ratio, then points ratio — restarting
  // among any still level.
  if (sport === 'tabletennis') return { win: 2, draw: 0, loss: 1, order: ['h2h', 'h2hRatio', 'h2hPoints'], restart: true };
  const win = sport === 'football' ? 3 : 2;
  const order: TieBreaker[] = sport === 'cricket' ? ['h2h', 'nrr', 'for'] : ['h2h', 'diff', 'for'];
  return { win, draw: 1, loss: 0, order };
}

/** Points each side takes from a no result / abandoned match: the config's
 *  `noResult` (the organiser's `nrPoints`), else the sport default. */
export function noResultPoints(sport: SportId, cfg?: StandingsConfig | null): number {
  return cfg?.noResult ?? (sport === 'cricket' ? 1 : 0);
}

/** The tie-breakers an organiser can put first for a sport (PointsEditor). */
export function availableTieBreakers(sport: SportId): TieBreaker[] {
  if (sport === 'chess') return ['sb', 'wins', 'h2h'];
  if (sport === 'tabletennis') return ['h2h', 'h2hRatio', 'h2hPoints'];
  return sport === 'cricket' ? ['h2h', 'nrr', 'for'] : ['h2h', 'diff', 'for'];
}

/** Read a tournament's per-sport override from its `formats[sport]` (reserved
 *  `winPoints`/`drawPoints`/`lossPoints`/`nrPoints`/`tieBreak` keys), falling
 *  back to the sport defaults. Zero-migration: rides on the existing formats
 *  jsonb. `noResult` is set only when the organiser chose `nrPoints`. */
export function standingsConfigFromFormat(sport: SportId, fmt?: Record<string, unknown> | null): StandingsConfig {
  const d = defaultStandingsConfig(sport);
  if (!fmt) return d;
  const num = (k: string, dv: number) => (typeof fmt[k] === 'number' ? (fmt[k] as number) : dv);
  const order = typeof fmt.tieBreak === 'string'
    ? (fmt.tieBreak as string).split(',').map((s) => s.trim()).filter(isTieBreaker)
    : [];
  return { win: num('winPoints', d.win), draw: num('drawPoints', d.draw), loss: num('lossPoints', d.loss), order: order.length ? order : d.order, ...(d.restart ? { restart: true } : {}),
    ...(typeof fmt.nrPoints === 'number' ? { noResult: fmt.nrPoints } : {}) };
}

/** DI so `standings.ts` can compute NRR without importing the sport registry
 *  (which would pull React Native into the pure test runner). The app registers
 *  a provider at startup (see registry.ts); returns the rate denominators —
 *  cricket's overs faced by each side — or null for sports without a rate.
 *  `manual` is set for a match ended by hand (parity #04): the provider should
 *  use the plugin's `manualRate` (cricket charges both sides all their overs)
 *  when it has one, else the normal `standingsRate`. */
type RateProvider = (sport: SportId, state: unknown, manual?: boolean) => { home: number; away: number } | null;
let rateProvider: RateProvider | null = null;
export function setStandingsRateProvider(fn: RateProvider | null): void { rateProvider = fn; }
/** Rally points won by each side over the whole match (table tennis: every
 *  game's points) — the ITTF "points ratio" tie-break. Same DI pattern. */
type PointsProvider = (sport: SportId, state: unknown) => { home: number; away: number } | null;
let pointsProvider: PointsProvider | null = null;
export function setStandingsPointsProvider(fn: PointsProvider | null): void { pointsProvider = fn; }

/** A match closed by hand as no result / abandoned (parity #04) — no winner,
 *  counts as played, each side takes `noResult` points. */
export const isNoResultMatch = (m: Match): boolean =>
  m.result?.kind === 'no_result' || m.result?.kind === 'abandoned';

/** League table for a sport, ranked by the config's points + tie-breakers. */
export function teamStandings(matches: Match[], sport: SportId, cfg: StandingsConfig = defaultStandingsConfig(sport)): TeamStanding[] {
  const table = new Map<string, TeamStanding>();
  const ensure = (id: string, name: string, color?: string) => {
    if (!table.has(id))
      table.set(id, { teamId: id, name, colorHex: color, played: 0, won: 0, lost: 0, drawn: 0, nr: 0, for: 0, against: 0, diff: 0, points: 0, forUnits: 0, againstUnits: 0 });
    return table.get(id)!;
  };
  const played = matches.filter((m) => m.sport === sport && m.status === 'completed' && (!!m.winner || isNoResultMatch(m)));
  for (const m of played) {
    const h = ensure(m.homeTeam.id, m.homeTeam.name, m.homeTeam.colorHex);
    const a = ensure(m.awayTeam.id, m.awayTeam.name, m.awayTeam.colorHex);
    h.played += 1;
    a.played += 1;
    // No result / abandoned: played and the NR points, but nothing towards
    // for/against or the rate.
    if (isNoResultMatch(m)) {
      const nrPts = noResultPoints(sport, cfg);
      h.nr += 1; a.nr += 1; h.points += nrPts; a.points += nrPts;
      continue;
    }
    // A manual cricket result with "Count in NRR" off still takes its points,
    // but its runs and overs stay out of the table.
    const counts = m.result?.countNrr !== false;
    const score = m.result?.score ?? m.score;
    if (score && counts) {
      h.for += score.home; h.against += score.away;
      a.for += score.away; a.against += score.home;
    }
    const rate = counts ? rateProvider?.(sport, m.state, !!m.result) : null;
    if (rate) {
      h.forUnits += rate.home; h.againstUnits += rate.away;
      a.forUnits += rate.away; a.againstUnits += rate.home;
    }
    if (m.winner === 'draw') {
      h.drawn += 1; a.drawn += 1; h.points += cfg.draw; a.points += cfg.draw;
    } else if (m.winner === 'home') {
      h.won += 1; a.lost += 1; h.points += cfg.win; a.points += cfg.loss;
    } else {
      a.won += 1; h.lost += 1; a.points += cfg.win; h.points += cfg.loss;
    }
  }
  for (const t of table.values()) {
    t.diff = t.for - t.against;
    if (t.forUnits > 0 && t.againstUnits > 0) t.nrr = t.for / t.forUnits - t.against / t.againstUnits;
  }
  // Sonneborn-Berger needs everyone's final points, so it's a second pass.
  if (cfg.order.includes('sb')) {
    for (const t of table.values()) t.sb = 0;
    for (const m of played) {
      if (isNoResultMatch(m)) continue;
      const h = table.get(m.homeTeam.id)!;
      const a = table.get(m.awayTeam.id)!;
      const share = m.winner === 'draw' ? 0.5 : 1;
      if (m.winner === 'home' || m.winner === 'draw') h.sb! += share * a.points;
      if (m.winner === 'away' || m.winner === 'draw') a.sb! += share * h.points;
    }
  }
  return rankTeams([...table.values()], played, cfg);
}

/** Rank rows: by points, then break each still-tied cluster with the config's
 *  ordered tie-breakers (head-to-head runs a mini-league among just that
 *  cluster). Recursive so a partial tie falls through to the next criterion. */
export function rankTeams(rows: TeamStanding[], matches: Match[], cfg: StandingsConfig): TeamStanding[] {
  const out: TeamStanding[] = [];
  const byPoints = [...rows].sort((x, y) => y.points - x.points);
  for (let i = 0; i < byPoints.length; ) {
    let j = i;
    while (j < byPoints.length && byPoints[j].points === byPoints[i].points) j++;
    out.push(...orderCluster(byPoints.slice(i, j), cfg.order, matches, cfg));
    i = j;
  }
  return out;
}

function numericKey(t: TeamStanding, tb: 'nrr' | 'diff' | 'for' | 'wins' | 'sb'): number {
  switch (tb) {
    case 'nrr': return t.nrr ?? 0;
    case 'diff': return t.diff;
    case 'wins': return t.won;
    case 'sb': return t.sb ?? 0;
    default: return t.for;
  }
}

/** won ÷ lost, with nothing lost ranking above any finite ratio. */
const ratio = (won: number, lost: number) => (lost === 0 ? (won > 0 ? Number.POSITIVE_INFINITY : 0) : won / lost);

/** Score ratio (e.g. games) — or, with `rally`, rally-point ratio — counting only
 *  matches played among the cluster (ITTF 3.7.5.2). */
function headToHeadRatio(teamId: string, cluster: TeamStanding[], matches: Match[], rally: boolean): number {
  const ids = new Set(cluster.map((c) => c.teamId));
  let won = 0;
  let lost = 0;
  for (const m of matches) {
    if (!ids.has(m.homeTeam.id) || !ids.has(m.awayTeam.id)) continue;
    const isHome = m.homeTeam.id === teamId;
    if (!isHome && m.awayTeam.id !== teamId) continue;
    if (isNoResultMatch(m)) continue;
    const sc = rally ? pointsProvider?.(m.sport, m.state) ?? null : m.score ?? null;
    if (!sc) continue;
    won += isHome ? sc.home : sc.away;
    lost += isHome ? sc.away : sc.home;
  }
  return ratio(won, lost);
}

/** Points a team took from matches played *only among the given cluster*. */
function headToHeadPoints(teamId: string, cluster: TeamStanding[], matches: Match[], cfg: StandingsConfig): number {
  const ids = new Set(cluster.map((c) => c.teamId));
  let pts = 0;
  for (const m of matches) {
    if (!ids.has(m.homeTeam.id) || !ids.has(m.awayTeam.id)) continue;
    const isHome = m.homeTeam.id === teamId;
    const isAway = m.awayTeam.id === teamId;
    if (!isHome && !isAway) continue;
    // A winner-less no result shares `noResult` (it used to read as an away win).
    if (isNoResultMatch(m)) pts += noResultPoints(m.sport, cfg);
    else if (m.winner === 'draw') pts += cfg.draw;
    else if ((m.winner === 'home') === isHome) pts += cfg.win;
    else pts += cfg.loss;
  }
  return pts;
}

function tieKey(t: TeamStanding, tb: TieBreaker, cluster: TeamStanding[], matches: Match[], cfg: StandingsConfig): number {
  if (tb === 'h2h') return headToHeadPoints(t.teamId, cluster, matches, cfg);
  if (tb === 'h2hRatio') return headToHeadRatio(t.teamId, cluster, matches, false);
  if (tb === 'h2hPoints') return headToHeadRatio(t.teamId, cluster, matches, true);
  return numericKey(t, tb);
}

function orderCluster(cluster: TeamStanding[], tbs: TieBreaker[], matches: Match[], cfg: StandingsConfig): TeamStanding[] {
  if (cluster.length <= 1) return cluster;
  if (tbs.length === 0) return [...cluster].sort((a, b) => a.name.localeCompare(b.name));
  const [tb, ...rest] = tbs;
  const keyed = cluster.map((t) => ({ t, k: tieKey(t, tb, cluster, matches, cfg) }));
  keyed.sort((a, b) => b.k - a.k);
  // Not separated at all by this criterion → straight on to the next one.
  if (keyed[0].k === keyed[keyed.length - 1].k) return orderCluster(cluster, rest, matches, cfg);
  const res: TeamStanding[] = [];
  for (let i = 0; i < keyed.length; ) {
    let j = i;
    while (j < keyed.length && keyed[j].k === keyed[i].k) j++;
    // A sub-group still level: ITTF restarts the whole order among just them
    // (it's strictly smaller, so recursion terminates); otherwise continue with
    // the NEXT tie-breaker.
    const sub = keyed.slice(i, j).map((x) => x.t);
    res.push(...orderCluster(sub, cfg.restart ? cfg.order : rest, matches, cfg));
    i = j;
  }
  return res;
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
    { key: 'blocks', label: 'Blocks' },
  ],
  kabaddi: [
    { key: 'raidPoints', label: 'Raid pts' },
    { key: 'tacklePoints', label: 'Tackle pts' },
  ],
  pickleball: [{ key: 'points', label: 'Points' }],
  padel: [{ key: 'points', label: 'Points' }],
  squash: [{ key: 'points', label: 'Points' }],
  tabletennis: [{ key: 'points', label: 'Points' }],
  chess: [{ key: 'wins', label: 'Wins' }, { key: 'draws', label: 'Draws' }],
  carrom: [{ key: 'points', label: 'Points' }, { key: 'queens', label: 'Queens' }],
  golf: [{ key: 'birdies', label: 'Birdies' }, { key: 'holesWon', label: 'Holes won' }],
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
