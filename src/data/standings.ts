/**
 * Standings & statistics — computed from completed match results and the
 * stat-line log. Works for any single sport, so a single-sport tournament just
 * shows that sport's table and leaders. Pure functions.
 */
import type { Match, Player, SportId, StatLine } from '../core/types';
import { isGoalkeeper } from '../sports/football/keepers.ts';

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
  /** organiser points adjustment (parity #07): Σ of the team's signed
   *  adjustments for this phase, already included in `points` */
  adjust: number;
  /** Swiss pairing-allocated byes (SD-10): rounds sat out, each worth the bye
   *  points (already in `points`) but NOT a played game — absent when none */
  byes?: number;
  /** chess games won / lost by forfeit (SD-10): their points are in `points`
   *  but they're unplayed — out of `played`, W/D/L and Sonneborn-Berger.
   *  Absent when none. */
  forfeitWins?: number;
  forfeitLosses?: number;
  /** per-round record for FIDE C.07 tie-breaks (chess, or any sport with a bye
   *  point): one entry per game or bye, with `unplayed` set for a bye or a
   *  forfeit. The data Buchholz / Swiss tie-breaks read (Wave 1). */
  games?: GameRecord[];
  /** rally points won / lost over the team's matches (table tennis: every
   *  game's points) — the overall analog of the ITTF "points ratio", used to
   *  seed across groups (SD-12). Present only when the order uses `h2hPoints`. */
  rallyFor?: number;
  rallyAgainst?: number;
}

/** One round of a team's record (SD-10). `points` are the game points it took
 *  (a bye: the bye points). */
export interface GameRecord {
  kind: 'played' | 'forfeit' | 'bye';
  /** a bye or a forfeit — FIDE C.07 "unplayed game" */
  unplayed: boolean;
  /** absent for a bye */
  opponentId?: string;
  matchId?: string;
  /** the fixture's stage, e.g. 'swiss3' */
  stage?: string;
  result: 'win' | 'draw' | 'loss' | 'nr';
  points: number;
}

/** An organiser's signed points bonus/penalty for one team (parity #07), with
 *  a public reason. Stored as a JSON array in `formats[sport].pointsAdj`.
 *  `phase` ('league' | 'group:A' | 'super' | 'swiss') scopes it to one table;
 *  absent = applies to every table the team appears in. */
export interface PointsAdjustment {
  id: string;
  teamId: string;
  /** signed: −2 is a deduction */
  points: number;
  reason: string;
  phase?: string;
  byName?: string;
  /** ISO timestamp */
  at: string;
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
  /** organiser points adjustments (parity #07) — absent when there are none */
  adjustments?: PointsAdjustment[];
  /** points for a Swiss pairing-allocated bye (SD-10, the organiser's
   *  `byePoints`: 1, ½ or 0). Absent = the sport default — always read it
   *  through `byePointsFor()`. */
  bye?: number;
}

/** Points for a Swiss bye: the organiser's `byePoints`, else the sport default —
 *  chess 1 (founder decision D7; FIDE C.04 "pairing-allocated bye"), applied to
 *  existing Swiss events too because the point was simply missing. Other sports
 *  have no bye point unless the organiser set one (undefined = byes not credited,
 *  unchanged behaviour). */
export function byePointsFor(sport: SportId, cfg?: StandingsConfig | null): number | undefined {
  return cfg?.bye ?? (sport === 'chess' ? 1 : undefined);
}

/** A chess game decided without play: a walkover, or a result recorded with the
 *  "forfeit" method. FIDE treats it as unplayed (C.07): out of the played-game
 *  stats and Sonneborn-Berger, though its points still count. Chess only — a
 *  walkover in another sport is a normal win/loss in the table. */
export function isChessForfeit(m: Match): boolean {
  if (m.sport !== 'chess') return false;
  if (m.walkover) return true;
  const st = m.state as { method?: unknown } | null | undefined;
  return !!st && typeof st === 'object' && st.method === 'forfeit';
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

/** Founder decision D1 (sport-depth PLAN): a tournament created from now on
 *  starts on the sport's international points system. These keys are WRITTEN
 *  into `formats[sport]` when a tournament (or a sport added to one) is created,
 *  instead of changing `defaultStandingsConfig`, because that default is
 *  computed at read time: changing it would silently re-score every existing
 *  table. Old tournaments have no key stored, so they keep the legacy default.
 *  Basketball (FIBA): win 2, loss 1 (a forfeit, 0, isn't modelled yet). */
export const NEW_TOURNAMENT_POINTS: Partial<Record<SportId, Record<string, number>>> = {
  basketball: { winPoints: 2, lossPoints: 1 },
};

/** A new tournament's format for one sport: the international points keys
 *  under whatever the organiser already chose (their keys win). */
export function withNewTournamentPoints<T extends Record<string, unknown>>(sport: SportId, fmt?: T | null): T {
  return { ...(NEW_TOURNAMENT_POINTS[sport] ?? {}), ...(fmt ?? {}) } as T;
}

/** Every sport of a tournament being created, stamped with `withNewTournamentPoints`
 *  (the choke point in `createTournament`, so every creation path gets D1). */
export function newTournamentFormats<F extends Record<string, unknown>>(sports: SportId[], formats?: Partial<Record<SportId, F>> | null): Partial<Record<SportId, F>> {
  const out: Partial<Record<SportId, F>> = { ...(formats ?? {}) };
  for (const sp of sports) if (NEW_TOURNAMENT_POINTS[sp]) out[sp] = withNewTournamentPoints(sp, out[sp] ?? ({} as F));
  return out;
}

/** One-tap points presets for the PointsEditor: the body's system and the
 *  "Simple 2-1-0" fallback (D1). Empty for sports without a body preset yet. */
export function standingsPresets(sport: SportId): { label: string; set: Record<string, number> }[] {
  if (sport === 'basketball') {
    return [
      { label: 'FIBA 2-1 (loss = 1)', set: { winPoints: 2, drawPoints: 1, lossPoints: 1 } },
      { label: 'Simple 2-1-0', set: { winPoints: 2, drawPoints: 1, lossPoints: 0 } },
    ];
  }
  return [];
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

/** The saved points adjustments in a sport's format (`pointsAdj`, a JSON
 *  string). Bad JSON or malformed rows are ignored, like `manualStandings`. */
export function pointsAdjustmentsFromFormat(fmt?: Record<string, unknown> | null): PointsAdjustment[] {
  const raw = fmt?.pointsAdj;
  if (typeof raw !== 'string' || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((a): a is PointsAdjustment => {
    if (!a || typeof a !== 'object') return false;
    const r = a as Record<string, unknown>;
    return typeof r.id === 'string' && typeof r.teamId === 'string' && typeof r.points === 'number' && Number.isFinite(r.points)
      && typeof r.reason === 'string' && typeof r.at === 'string'
      && (r.phase === undefined || typeof r.phase === 'string') && (r.byName === undefined || typeof r.byName === 'string');
  });
}

/** Read a tournament's per-sport override from its `formats[sport]` (reserved
 *  `winPoints`/`drawPoints`/`lossPoints`/`nrPoints`/`byePoints`/`tieBreak`/`pointsAdj`
 *  keys), falling back to the sport defaults. Zero-migration: rides on the
 *  existing formats jsonb. `noResult` is set only when the organiser chose
 *  `nrPoints`; `adjustments` only when there are any. */
export function standingsConfigFromFormat(sport: SportId, fmt?: Record<string, unknown> | null): StandingsConfig {
  const d = defaultStandingsConfig(sport);
  if (!fmt) return d;
  const num = (k: string, dv: number) => (typeof fmt[k] === 'number' ? (fmt[k] as number) : dv);
  const order = typeof fmt.tieBreak === 'string'
    ? (fmt.tieBreak as string).split(',').map((s) => s.trim()).filter(isTieBreaker)
    : [];
  const adjustments = pointsAdjustmentsFromFormat(fmt);
  return { win: num('winPoints', d.win), draw: num('drawPoints', d.draw), loss: num('lossPoints', d.loss), order: order.length ? order : d.order, ...(d.restart ? { restart: true } : {}),
    ...(typeof fmt.nrPoints === 'number' ? { noResult: fmt.nrPoints } : {}),
    ...(typeof fmt.byePoints === 'number' && Number.isFinite(fmt.byePoints) ? { bye: fmt.byePoints } : {}),
    ...(adjustments.length ? { adjustments } : {}) };
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

/** Runs (score) each side is credited with in the table, when the sport says
 *  they differ from the result score — cricket's ICC NRR crediting in a chase
 *  to a revised target (SD-13). Same DI pattern; null = use the score. */
type ScoreProvider = (sport: SportId, state: unknown) => { home: number; away: number } | null;
let scoreProvider: ScoreProvider | null = null;
export function setStandingsScoreProvider(fn: ScoreProvider | null): void { scoreProvider = fn; }

/** A match closed by hand as no result / abandoned (parity #04) — no winner,
 *  counts as played, each side takes `noResult` points. */
export const isNoResultMatch = (m: Match): boolean =>
  m.result?.kind === 'no_result' || m.result?.kind === 'abandoned';

/** League table for a sport, ranked by the config's points + tie-breakers.
 *  `phaseKey` ('league' | 'group:A' | 'super' | 'swiss') picks which of the
 *  config's points adjustments apply: those tagged with that phase plus the
 *  phase-less ones (no `phaseKey` = all of them). Adjustments are added to
 *  `points` before ranking; head-to-head ignores them.
 *
 *  Swiss byes (SD-10): an entrant listed in a Swiss round's `byes` takes
 *  `byePointsFor()` once for that round (the id rides on every fixture of the
 *  round, so it's de-duplicated by stage) as soon as the round is drawn. A bye
 *  is unplayed: it adds to `points` and `byes`, never to `played` / W/D/L /
 *  for-against / Sonneborn-Berger. `teams` (optional) names a bye-only entrant
 *  who has no fixture in `matches` yet (e.g. after round 1). Chess forfeits
 *  are unplayed too: their points count, but they're out of `played`, W/D/L
 *  and SB (counted in `forfeitWins` / `forfeitLosses`). */
export function teamStandings(
  matches: Match[], sport: SportId, cfg: StandingsConfig = defaultStandingsConfig(sport), phaseKey?: string,
  teams?: { id: string; name: string; colorHex?: string }[],
): TeamStanding[] {
  const table = new Map<string, TeamStanding>();
  const ensure = (id: string, name: string, color?: string) => {
    if (!table.has(id))
      table.set(id, { teamId: id, name, colorHex: color, played: 0, won: 0, lost: 0, drawn: 0, nr: 0, for: 0, against: 0, diff: 0, points: 0, forUnits: 0, againstUnits: 0, adjust: 0 });
    return table.get(id)!;
  };
  const byePts = byePointsFor(sport, cfg);
  // Per-round records (C.07 tie-break data) for chess, or wherever a bye scores.
  const keepGames = sport === 'chess' || byePts !== undefined;
  const log = (t: TeamStanding, g: GameRecord) => { if (keepGames) (t.games ??= []).push(g); };
  const wantRally = cfg.order.includes('h2hPoints');
  const resultOf = (pts: number): GameRecord['result'] => (pts >= cfg.win ? 'win' : pts > cfg.loss ? 'draw' : 'loss');
  const played = matches.filter((m) => m.sport === sport && m.status === 'completed' && (!!m.winner || isNoResultMatch(m)));
  for (const m of played) {
    const h = ensure(m.homeTeam.id, m.homeTeam.name, m.homeTeam.colorHex);
    const a = ensure(m.awayTeam.id, m.awayTeam.name, m.awayTeam.colorHex);
    const base = { matchId: m.id, stage: m.stage };
    // No result / abandoned: played and the NR points, but nothing towards
    // for/against or the rate.
    if (isNoResultMatch(m)) {
      h.played += 1;
      a.played += 1;
      const nrPts = noResultPoints(sport, cfg);
      h.nr += 1; a.nr += 1; h.points += nrPts; a.points += nrPts;
      log(h, { ...base, kind: 'played', unplayed: false, opponentId: a.teamId, result: 'nr', points: nrPts });
      log(a, { ...base, kind: 'played', unplayed: false, opponentId: h.teamId, result: 'nr', points: nrPts });
      continue;
    }
    // A chess forfeit: the points, but not a played game (FIDE C.07).
    const forfeit = isChessForfeit(m);
    if (!forfeit) {
      h.played += 1;
      a.played += 1;
    }
    // A manual cricket result with "Count in NRR" off still takes its points,
    // but its runs and overs stay out of the table.
    const counts = m.result?.countNrr !== false;
    // SD-13: a scored (not hand-ended) match may credit different runs for the
    // table (cricket: target − 1 for the side batting first after a revision).
    const score = m.result?.score ?? (m.result ? null : scoreProvider?.(sport, m.state)) ?? m.score;
    if (score && counts) {
      h.for += score.home; h.against += score.away;
      a.for += score.away; a.against += score.home;
    }
    const rate = counts ? rateProvider?.(sport, m.state, !!m.result) : null;
    if (rate) {
      h.forUnits += rate.home; h.againstUnits += rate.away;
      a.forUnits += rate.away; a.againstUnits += rate.home;
    }
    // Rally points for cross-group seeding (SD-12) — only when the order asks.
    if (wantRally && !forfeit) {
      const rp = pointsProvider?.(sport, m.state) ?? null;
      if (rp) {
        h.rallyFor = (h.rallyFor ?? 0) + rp.home; h.rallyAgainst = (h.rallyAgainst ?? 0) + rp.away;
        a.rallyFor = (a.rallyFor ?? 0) + rp.away; a.rallyAgainst = (a.rallyAgainst ?? 0) + rp.home;
      }
    }
    const kind: GameRecord['kind'] = forfeit ? 'forfeit' : 'played';
    if (m.winner === 'draw') {
      if (!forfeit) { h.drawn += 1; a.drawn += 1; }
      h.points += cfg.draw; a.points += cfg.draw;
      log(h, { ...base, kind, unplayed: forfeit, opponentId: a.teamId, result: 'draw', points: cfg.draw });
      log(a, { ...base, kind, unplayed: forfeit, opponentId: h.teamId, result: 'draw', points: cfg.draw });
    } else {
      const [w, l] = m.winner === 'home' ? [h, a] : [a, h];
      if (forfeit) { w.forfeitWins = (w.forfeitWins ?? 0) + 1; l.forfeitLosses = (l.forfeitLosses ?? 0) + 1; }
      else { w.won += 1; l.lost += 1; }
      w.points += cfg.win; l.points += cfg.loss;
      log(w, { ...base, kind, unplayed: forfeit, opponentId: l.teamId, result: 'win', points: cfg.win });
      log(l, { ...base, kind, unplayed: forfeit, opponentId: w.teamId, result: 'loss', points: cfg.loss });
    }
  }
  // Swiss byes: once per (round, entrant), from any drawn (not cancelled)
  // fixture of that round — and never to someone who also has a game in it.
  if (byePts !== undefined) {
    const names = new Map<string, { name: string; colorHex?: string }>();
    for (const t of teams ?? []) names.set(t.id, { name: t.name, colorHex: t.colorHex });
    for (const m of matches) {
      if (m.sport !== sport) continue;
      names.set(m.homeTeam.id, { name: m.homeTeam.name, colorHex: m.homeTeam.colorHex });
      names.set(m.awayTeam.id, { name: m.awayTeam.name, colorHex: m.awayTeam.colorHex });
    }
    const swiss = matches.filter((m) => m.sport === sport && m.status !== 'cancelled' && typeof m.stage === 'string' && m.stage.startsWith('swiss'));
    const inRound = new Set(swiss.flatMap((m) => [`${m.stage}|${m.homeTeam.id}`, `${m.stage}|${m.awayTeam.id}`]));
    const seen = new Set<string>();
    for (const m of swiss) {
      for (const id of m.byes ?? []) {
        const key = `${m.stage}|${id}`;
        if (seen.has(key) || inRound.has(key)) continue;
        seen.add(key);
        const n = names.get(id);
        const t = ensure(id, n?.name ?? 'Entrant', n?.colorHex);
        t.byes = (t.byes ?? 0) + 1;
        t.points += byePts;
        log(t, { kind: 'bye', unplayed: true, stage: m.stage, result: resultOf(byePts), points: byePts });
      }
    }
  }
  for (const t of table.values()) {
    t.diff = t.for - t.against;
    if (t.forUnits > 0 && t.againstUnits > 0) t.nrr = t.for / t.forUnits - t.against / t.againstUnits;
  }
  // Organiser adjustments — only for teams already in this table (a team with
  // no result in the phase has no row to adjust).
  for (const a of cfg.adjustments ?? []) {
    if (phaseKey && a.phase && a.phase !== phaseKey) continue;
    const t = table.get(a.teamId);
    if (!t) continue;
    t.adjust += a.points;
    t.points += a.points;
  }
  // Sonneborn-Berger needs everyone's final points, so it's a second pass.
  // Played games only: a forfeit (and a bye, which has no opponent) is
  // unplayed and stays out (FIDE C.07). Opponents' totals include their own
  // bye / forfeit points (Wave 1 refines that with the C.07 unplayed rules).
  if (cfg.order.includes('sb')) {
    for (const t of table.values()) t.sb = 0;
    for (const m of played) {
      if (isNoResultMatch(m) || isChessForfeit(m)) continue;
      const h = table.get(m.homeTeam.id)!;
      const a = table.get(m.awayTeam.id)!;
      const share = m.winner === 'draw' ? 0.5 : 1;
      // Game points only — an organiser adjustment isn't a result.
      if (m.winner === 'home' || m.winner === 'draw') h.sb! += share * (a.points - a.adjust);
      if (m.winner === 'away' || m.winner === 'draw') a.sb! += share * (h.points - h.adjust);
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
    // FIDE C.07 WIN: rounds won with or without playing — over-the-board wins,
    // forfeit wins and a full-point bye (forfeits used to sit in `won`).
    case 'wins': return t.won + (t.forfeitWins ?? 0) + (t.games ?? []).filter((g) => g.kind === 'bye' && g.result === 'win').length;
    case 'sb': return t.sb ?? 0;
    default: return t.for;
  }
}

/** A tie-breaker's value for ranking teams from DIFFERENT groups (SD-12): the
 *  sport's own chain, with the "among the tied" criteria swapped for their
 *  overall equivalents — h2h itself is skipped (they never met), the ITTF
 *  games ratio becomes the team's overall score ratio, the points ratio its
 *  overall rally-point ratio. Higher is better. */
export function seedKey(t: TeamStanding, tb: TieBreaker): number | null {
  if (tb === 'h2h') return null;
  if (tb === 'h2hRatio') return ratio(t.for, t.against);
  if (tb === 'h2hPoints') return t.rallyFor === undefined ? null : ratio(t.rallyFor, t.rallyAgainst ?? 0);
  return numericKey(t, tb);
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

/** Aggregate points across every sport in the meet — the headline house table.
 *  Each sport's points come from the organiser's config for it (SD-12: its
 *  win/draw/loss/NR points and adjustments, `formats[sport]`), so the overall
 *  total is exactly the sum of the per-sport tables. */
export function overallStandings(
  matches: Match[], sports: SportId[], formats?: Partial<Record<SportId, Record<string, unknown> | null | undefined>> | null,
): OverallStanding[] {
  // A house/school fields a SEPARATE team row per sport (each row is single-sport),
  // so the cross-sport "overall" table must merge by NAME — the app's cross-sport
  // identity convention (e.g. "Red House" football + "Red House" cricket = one
  // house). Keying by teamId would show a multi-sport house as several rows.
  const totals = new Map<string, OverallStanding>();
  for (const sport of sports) {
    for (const t of teamStandings(matches, sport, standingsConfigFromFormat(sport, formats?.[sport] ?? null))) {
      const key = t.name.trim().toLowerCase();
      const o = totals.get(key) ?? { teamId: t.teamId, name: t.name, colorHex: t.colorHex, played: 0, points: 0 };
      o.played += t.played;
      o.points += t.points;
      totals.set(key, o);
    }
  }
  return [...totals.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/** How a sport's league table labels its columns (SD-12, cricket CK-02):
 *  cricket calls a level result a Tie ("T"), always shows the NR column (a
 *  washout is part of the format) and ranks by NRR, so it shows no run
 *  difference. Other sports: "D", NR only once a match was abandoned, and the
 *  score difference. */
export function tableLabels(sport: SportId | undefined): { draw: 'T' | 'D'; alwaysNr: boolean; showDiff: boolean } {
  if (sport === 'cricket') return { draw: 'T', alwaysNr: true, showDiff: false };
  return { draw: 'D', alwaysNr: false, showDiff: true };
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
  // SD-09: football clean sheets rank goalkeepers only — older clean sheets
  // credited to defenders stay on their lines until the stat backfill.
  const keepers = sport === 'football' && key === 'cleanSheets'
    ? new Set(lines.filter((l) => l.sport === sport && (
        isGoalkeeper(byId.get(l.playerId)?.sportDetails?.football?.position) || (l.stats && 'goalsConceded' in l.stats)
      )).map((l) => l.playerId))
    : null;
  return [...totals.entries()]
    .filter(([id, v]) => v > 0 && (!keepers || keepers.has(id)))
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
