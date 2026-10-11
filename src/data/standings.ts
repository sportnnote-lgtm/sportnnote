/**
 * Standings & statistics — computed from completed match results and the
 * stat-line log. Works for any single sport, so a single-sport tournament just
 * shows that sport's table and leaders. Pure functions.
 */
import type { Match, Player, SportId, StatLine } from '../core/types';
import { isGoalkeeper } from '../sports/football/keepers.ts';
import { STAT_SPORTS, leaderCategories, eligibilityOf, statSchema } from '../sports/statSchemas.ts';
import { rankPlayers, statDefIn, qualifierOf, qualifierText, type Qualifier, type StatDef } from '../sports/statSchema.ts';
import { fideTieBreaks, type FideTieBreaks, type XRound } from './swissTiebreaks.ts';
import { effectiveQualifier, withLineResults, type LeaderMins } from './leaderMinimums.ts';

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
  /** FIDE C.07 crosstable tie-breaks (SD-26: Buchholz, Cut-1, Median,
   *  progressive score, games with Black …) — present only when the chain
   *  uses one of them (or Sonneborn-Berger) and the rows keep `games`. */
  fide?: FideTieBreaks;
  /** rally points won / lost over the team's matches (table tennis: every
   *  game's points) — the overall analog of the ITTF "points ratio", used to
   *  seed across groups (SD-12). Present only when the order uses `h2hPoints`. */
  rallyFor?: number;
  rallyAgainst?: number;
  /** SD-17 units, present only when the chain (or `withUnits`) needs them:
   *  sets / games won and lost over the team's matches, and the fair-play
   *  score (FIFA disciplinary points, ≤ 0 — higher is better). Rally points
   *  ride on `rallyFor` / `rallyAgainst`. */
  setsFor?: number;
  setsAgainst?: number;
  gamesFor?: number;
  gamesAgainst?: number;
  fairPlay?: number;
  /** level on every tie-breaker of a chain that ends in `lots`: the order
   *  shown is by name and must be settled by drawing lots ("Drawn by lot") */
  lots?: boolean;
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
  /** Swiss round number (from the stage 'swissN'), when known (SD-26) */
  round?: number;
  /** chess: the colour this side had over the board (played games only;
   *  the fixture's / game's `white`, else home — SD-26) */
  colour?: 'white' | 'black';
}

/** Which side has White in a chess game: the game state's `white`, else the
 *  fixture's `white` key (SD-26 pairing writes it into the match format),
 *  else home (the engine default, so old matches read as before). */
export function chessWhiteSide(m: Pick<Match, 'state' | 'format'>): 'home' | 'away' {
  const st = m.state as { white?: unknown } | null | undefined;
  const w = st && typeof st === 'object' ? st.white : undefined;
  if (w === 'home' || w === 'away') return w;
  const f = (m.format as Record<string, unknown> | undefined)?.white;
  return f === 'away' ? 'away' : 'home';
}

/** The Swiss round of a stage ('swiss3' → 3), else undefined. */
export const swissRoundOf = (stage?: string): number | undefined => {
  if (typeof stage !== 'string' || !stage.startsWith('swiss')) return undefined;
  const n = parseInt(stage.slice(5), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

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
 *  Tie-breakers (SD-17 standings rule kit — every one is "higher is better"):
 *   • h2h       — points from matches played only among the tied teams
 *   • h2hDiff   — score difference in those matches (FIBA / UEFA / IHF mini-league)
 *   • h2hFor    — score scored in those matches
 *   • h2hRatio  — score ratio (e.g. games won ÷ lost) among the tied teams only (ITTF)
 *   • h2hPoints — rally-point ratio among the tied teams only (ITTF), from the
 *                 sport's points provider (points won in every game)
 *   • nrr       — net run rate (cricket)
 *   • diff      — overall score difference;  for — overall score for
 *   • wins      — number of wins (FIDE: incl. forfeit wins and a full-point bye)
 *   • played    — matches played (ATP: a player who withdrew ranks below)
 *   • sb        — Sonneborn-Berger (FIDE round robin)
 *   • setRatio / setsPct   — sets won ÷ lost / sets won ÷ played (FIVB, ATP)
 *   • pointRatio / pointsDiff — rally points won ÷ lost / won − lost (FIVB, BWF, pickleball)
 *   • gamesDiff / gamesPct — games won − lost / games won ÷ played (BWF, ATP, padel)
 *   • fairPlay  — fewest disciplinary points (FIFA: Y −1, 2nd Y −3, R −4, Y+R −5)
 *   • lots      — explicit drawing of lots: teams still level are flagged
 *                 `lots` ("Drawn by lot") instead of a silent name order
 *  plus any tie-breaker registered with `registerTieBreaker` (chess Buchholz &
 *  co., SD-26). */
export type BuiltinTieBreaker =
  | 'h2h' | 'nrr' | 'diff' | 'for' | 'wins' | 'sb' | 'h2hRatio' | 'h2hPoints'
  | 'h2hDiff' | 'h2hFor' | 'setRatio' | 'pointRatio' | 'gamesDiff' | 'pointsDiff'
  | 'setsPct' | 'gamesPct' | 'played' | 'fairPlay' | 'lots';
/** A built-in tie-breaker, or the key of one added with `registerTieBreaker`. */
export type TieBreaker = BuiltinTieBreaker | (string & { readonly __customTieBreaker?: never });

export interface StandingsConfig {
  win: number;
  draw: number;
  loss: number;
  /** points each side takes from a no-result / abandoned match (parity #04).
   *  Absent = the sport default — always read it through `noResultPoints()`. */
  noResult?: number;
  order: TieBreaker[];
  /** When a criterion separates SOME of the tied teams, the ones still level
   *  start the whole procedure again among themselves only (so "among the
   *  tied" criteria are recomputed for the smaller group). `true` = after any
   *  criterion (ITTF, FIBA, BWF); `'h2h'` = only after a head-to-head criterion
   *  (UEFA / IHF: re-apply the h2h criteria, then go on to the overall ones). */
  restart?: boolean | 'h2h';
  /** organiser points adjustments (parity #07) — absent when there are none */
  adjustments?: PointsAdjustment[];
  /** points for a Swiss pairing-allocated bye (SD-10, the organiser's
   *  `byePoints`: 1, ½ or 0). Absent = the sport default — always read it
   *  through `byePointsFor()`. */
  bye?: number;
  // ── SD-17 rule kit (all absent = the legacy behaviour) ──
  /** the chain used when exactly TWO teams are level (BWF / ATP: "2 tied →
   *  head-to-head"); `order` is then the 3+ chain. Applied at the start of a
   *  procedure and on every restart. */
  pairOrder?: TieBreaker[];
  /** what is compared before the points: 'wins' = matches won first, then
   *  points (FIVB: "number of matches won, match points, …"). Absent = points. */
  rankBy?: 'points' | 'wins';
  /** match points by the sets score, winner-first "3-2" → [winner, loser]
   *  (FIVB 3-0 / 3-1 → 3-0, 3-2 → 2-1). A score not listed uses win / loss. */
  setPoints?: Record<string, [number, number]>;
  /** a losing side within `margin` (score difference ≤ margin) also takes
   *  `points` (PKL: +1 for a loss by 7 or fewer). */
  lossBonus?: { margin: number; points: number };
  /** a match level on the score and won in a shoot-out (FIH variant: winner 2,
   *  loser 1). Absent = a normal win / loss. */
  shootout?: { win: number; loss: number };
  /** points for the losing side of a walkover / forfeit (FIBA: 0, while a
   *  played loss is 1). Absent = a normal loss. */
  forfeitLoss?: number;
  /** compute sets / games / rally points / fair play for every row even when
   *  no tie-breaker asks for them (for columns, SD-18). */
  withUnits?: boolean;
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
  return !!st && typeof st === 'object' && (st.method === 'forfeit' || st.method === 'double-forfeit');
}

/** SD-67 — a chess double forfeit (neither player came): 0-0, an unplayed
 *  loss for both (FIDE C.07 16.4: each is a forfeit loss — a voluntary
 *  unplayed round). Recorded as winner 'draw' + method 'double-forfeit'. */
export function isChessDoubleForfeit(m: Pick<Match, 'sport' | 'state' | 'result'>): boolean {
  if (m.sport !== 'chess' || m.result) return false;
  const st = m.state as { method?: unknown } | null | undefined;
  return !!st && typeof st === 'object' && st.method === 'double-forfeit';
}
const BUILTIN_TB: BuiltinTieBreaker[] = [
  'h2h', 'nrr', 'diff', 'for', 'wins', 'sb', 'h2hRatio', 'h2hPoints',
  'h2hDiff', 'h2hFor', 'setRatio', 'pointRatio', 'gamesDiff', 'pointsDiff', 'setsPct', 'gamesPct', 'played', 'fairPlay', 'lots',
];
/** The criteria computed only from matches among the tied teams. */
const AMONG_TIED = new Set<string>(['h2h', 'h2hDiff', 'h2hFor', 'h2hRatio', 'h2hPoints']);

/** A tie-breaker added from outside the kit (chess Buchholz / Cut-1 / Median /
 *  Progressive in SD-26). `value` is higher-is-better; `seed` is its value
 *  across groups (null = skip; default `value` against a one-team cluster). */
export interface CustomTieBreaker {
  label: string;
  value: (t: TeamStanding, ctx: { cluster: TeamStanding[]; matches: Match[]; cfg: StandingsConfig }) => number;
  seed?: (t: TeamStanding) => number | null;
  /** computed among the tied only (so a restart in 'h2h' mode follows it) */
  amongTied?: boolean;
  /** the table column it shows while it is in the active chain (SD-18):
   *  a short header ("BH") and the row's figure (`rows` = the whole table).
   *  Absent = the overall `seed` value under its label, when it has one. */
  column?: { short: string; value: (t: TeamStanding, rows: TeamStanding[]) => number | string | null };
}
const customTB = new Map<string, CustomTieBreaker>();
/** Register (or, with null, remove) an extra tie-breaker under `key`. Saved
 *  chains (`tieBreak`) may then name it. */
export function registerTieBreaker(key: string, def: CustomTieBreaker | null): void {
  if ((BUILTIN_TB as string[]).includes(key)) throw new Error(`"${key}" is a built-in tie-breaker`);
  if (def) customTB.set(key, def); else customTB.delete(key);
}
/** A registered (non built-in) tie-breaker, if `key` is one. */
export function customTieBreaker(key: string): CustomTieBreaker | undefined { return customTB.get(key); }
const isTieBreaker = (s: string): s is TieBreaker => (BUILTIN_TB as string[]).includes(s) || customTB.has(s);

/** What a sport's match score counts (`m.score` / `result()`): sets, games,
 *  goals, points or runs. Drives the sets / games fallbacks and the labels. */
export type ScoreUnit = 'goals' | 'points' | 'runs' | 'sets' | 'games';
export function scoreUnit(sport: SportId | string): ScoreUnit {
  switch (sport) {
    case 'football': case 'hockey': case 'handball': return 'goals';
    case 'cricket': return 'runs';
    case 'volleyball': case 'tennis': case 'padel': return 'sets';
    case 'badminton': case 'tabletennis': case 'squash': case 'pickleball': case 'carrom': return 'games';
    default: return 'points';
  }
}

/** Sensible defaults: football is the modern 3 points a win; cricket ranks ties
 *  by net run rate; chess and table tennis follow FIDE / ITTF; everything else
 *  by points difference. Head-to-head first, which is how most real
 *  competitions read a two-team tie. A no result is worth 1 in cricket (common
 *  league practice, the washout shares the points) and 0 elsewhere (usually
 *  replayed) — see `noResultPoints`.
 *
 *  This is the LEGACY read-time default (existing tournaments store no keys and
 *  read this). New tournaments store their sport's body preset instead (D1,
 *  `newTournamentFormats`), so this function must not change. */
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

/** A one-tap points system for the PointsEditor (SD-17). `set` holds EVERY
 *  reserved rule key, so picking a preset fully defines the table ('' clears a
 *  key: absent = legacy). */
export interface PointsPreset {
  id: string;
  label: string;
  /** one line for the editor: the points and the order */
  note: string;
  set: Record<string, number | string | boolean>;
}

/** The rule keys a preset writes — '' = not used. */
const CLEAR: Record<string, string | boolean> = {
  setPoints: '', lossBonusMargin: '', lossBonusPoints: '', soWinPoints: '', soLossPoints: '', forfeitLossPoints: '',
  tieBreak: '', tieBreak2: '', tieRestart: false, rankBy: 'points',
};
const preset = (id: string, label: string, note: string, set: Record<string, number | string | boolean>): PointsPreset =>
  ({ id, label, note, set: { ...CLEAR, ...set } });

/** "Simple 2-1-0" (D1's fallback): win 2, draw 1, loss 0 and the plain legacy
 *  chain (football keeps 3-1-0: its simple system). */
function simplePreset(sport: SportId | string): PointsPreset {
  const d = defaultStandingsConfig((['chess', 'tabletennis', 'cricket', 'football'].includes(sport) ? sport : 'basketball') as SportId);
  const win = sport === 'football' ? 3 : 2;
  const order = sport === 'tabletennis' || sport === 'chess' ? ['h2h', 'diff', 'for'] : d.order;
  return preset('simple', `Simple ${win}-1-0`, `${win} a win, 1 a draw, 0 a loss; ties on head-to-head, then difference, then scored`,
    { winPoints: win, drawPoints: 1, lossPoints: 0, tieBreak: order.join(',') });
}

const FIVB_SETS = '3-0:3/0,3-1:3/0,3-2:2/1,2-0:3/0,2-1:2/1';

/** Each sport's international points system(s) (D1), first = the default a
 *  NEW tournament stores. Keyed by string so the Wave-4 sports (hockey,
 *  handball) are declared before their plugins exist. */
const BODY_PRESETS: Record<string, PointsPreset[]> = {
  football: [
    preset('fifa', 'FIFA / UEFA 3-1-0', '3-1-0; ties: head-to-head points, goal difference, goals; then overall goal difference, goals; fair play; lots',
      { winPoints: 3, drawPoints: 1, lossPoints: 0, tieBreak: 'h2h,h2hDiff,h2hFor,diff,for,fairPlay,lots', tieRestart: 'h2h' }),
    preset('fifa22', 'Goal difference first', '3-1-0; ties: goal difference, goals, then head-to-head, fair play, lots (FIFA 2022)',
      { winPoints: 3, drawPoints: 1, lossPoints: 0, tieBreak: 'diff,for,h2h,h2hDiff,h2hFor,fairPlay,lots' }),
  ],
  basketball: [
    preset('fiba', 'FIBA 2-1 (loss = 1)', '2 a win, 1 a loss, 0 a forfeit; ties: head-to-head points, difference, scored; then overall',
      { winPoints: 2, drawPoints: 1, lossPoints: 1, forfeitLossPoints: 0, tieBreak: 'h2h,h2hDiff,h2hFor,diff,for,lots', tieRestart: true }),
  ],
  volleyball: [
    preset('fivb', 'FIVB 3-3-2-1', 'Wins first; 3-0 / 3-1 → 3 pts, 3-2 → 2 and 1; ties: set ratio, point ratio, head-to-head',
      { winPoints: 3, drawPoints: 0, lossPoints: 0, setPoints: FIVB_SETS, rankBy: 'wins', tieBreak: 'setRatio,pointRatio,h2h,lots' }),
  ],
  kabaddi: [
    preset('pkl', 'PKL 5-3-1', '5 a win, 3 a tie, +1 for a loss by 7 or fewer; ties: score difference, wins, head-to-head',
      { winPoints: 5, drawPoints: 3, lossPoints: 0, lossBonusMargin: 7, lossBonusPoints: 1, tieBreak: 'diff,wins,h2h,for,lots' }),
  ],
  badminton: [
    preset('bwf', 'BWF', 'Matches won; 2 tied → head-to-head; 3+ tied → games difference, points difference',
      { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'diff,pointsDiff,lots', tieBreak2: 'h2h,lots', tieRestart: true }),
  ],
  tennis: [
    preset('atp', 'ATP / ITF round robin', 'Wins; matches played; 2 tied → head-to-head; 3+ → % sets, % games',
      { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'played,setsPct,gamesPct,h2h,lots', tieBreak2: 'played,h2h,lots', tieRestart: true }),
  ],
  padel: [
    preset('fip', 'FIP', 'Wins; ties: head-to-head, set difference, games difference',
      { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'h2h,diff,gamesDiff,lots', tieRestart: true }),
  ],
  pickleball: [
    preset('pickleball', 'Pool play', 'Wins; ties: head-to-head, then point differential',
      { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'h2h,pointsDiff,lots', tieRestart: true }),
  ],
  squash: [
    preset('wsf', 'WSF round robin', 'Wins; ties among the tied: match points, games ratio, points ratio',
      { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'h2h,h2hRatio,h2hPoints,lots', tieRestart: true }),
  ],
  tabletennis: [
    preset('ittf', 'ITTF 2-1', '2 a win, 1 a loss; ties among the tied: match points, games ratio, points ratio',
      { winPoints: 2, drawPoints: 0, lossPoints: 1, tieBreak: 'h2h,h2hRatio,h2hPoints,lots', tieRestart: true }),
  ],
  carrom: [
    preset('carrom', 'Carrom league', 'Wins; ties: head-to-head, games difference, board points difference',
      { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'h2h,diff,pointsDiff,lots' }),
  ],
  cricket: [
    preset('icc', 'ICC events', '2 a win, 1 a tie or no result; ties: wins, net run rate, head-to-head',
      { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'wins,nrr,h2h,lots' }),
  ],
  // Wave 4 (no plugin yet): declared so the sport is born with its body's rules.
  hockey: [
    preset('fih', 'FIH 3-1-0', '3-1-0; ties: wins, goal difference, goals, head-to-head',
      { winPoints: 3, drawPoints: 1, lossPoints: 0, tieBreak: 'wins,diff,for,h2h,lots' }),
    preset('fih-so', 'FIH + shoot-out bonus', '3 a win; a draw goes to a shoot-out: winner 2, loser 1',
      { winPoints: 3, drawPoints: 1, lossPoints: 0, soWinPoints: 2, soLossPoints: 1, tieBreak: 'wins,diff,for,h2h,lots' }),
  ],
  handball: [
    preset('ihf', 'IHF 2-1-0', '2-1-0; ties: head-to-head points, goal difference, goals; then overall',
      { winPoints: 2, drawPoints: 1, lossPoints: 0, tieBreak: 'h2h,h2hDiff,h2hFor,diff,for,lots', tieRestart: 'h2h' }),
  ],
};

/** Chess (SD-26): the FIDE Swiss order and the elite round-robin order, both
 *  1 / ½ / 0. Not a body preset, so a new tournament stores nothing (a Swiss
 *  stores the Swiss order when its round 1 is drawn). Lazy: the Swiss keys
 *  are registered further down the module. */
const CHESS_PRESETS = (): PointsPreset[] => [
  preset('fide-swiss', 'FIDE Swiss', '1-½-0; ties: Buchholz Cut-1, Buchholz, Sonneborn-Berger, progressive score, direct encounter, wins, wins with Black',
    { winPoints: 1, drawPoints: 0.5, lossPoints: 0, tieBreak: FIDE_SWISS_ORDER.join(',') }),
  preset('fide-rr', 'FIDE round robin', '1-½-0; ties: Sonneborn-Berger, wins, direct encounter',
    { winPoints: 1, drawPoints: 0.5, lossPoints: 0, tieBreak: 'sb,wins,h2h' }),
];

/** One-tap points presets for the PointsEditor: the body's system(s), then the
 *  "Simple 2-1-0" fallback (D1). Chess has none (Swiss / round-robin
 *  tie-breaks are their own item, SD-26); golf has no table. */
export function standingsPresets(sport: SportId | string): PointsPreset[] {
  if (sport === 'chess') return CHESS_PRESETS();
  const body = BODY_PRESETS[sport];
  return body ? [...body, simplePreset(sport)] : [];
}

/** The keys a NEW tournament's format stores for a sport (D1): its default
 *  body preset, without the '' (unused) keys. */
function newTournamentKeys(sport: SportId | string): Record<string, number | string | boolean> | undefined {
  const p = BODY_PRESETS[sport]?.[0];
  if (!p) return undefined;
  return Object.fromEntries(Object.entries(p.set).filter(([k, v]) => v !== '' && !(k === 'tieRestart' && v === false) && !(k === 'rankBy' && v === 'points')));
}

/** Founder decision D1 (sport-depth PLAN): a tournament created from now on
 *  starts on the sport's international points system. These keys are WRITTEN
 *  into `formats[sport]` when a tournament (or a sport added to one) is created,
 *  instead of changing `defaultStandingsConfig`, because that default is
 *  computed at read time: changing it would silently re-score every existing
 *  table. Old tournaments have no key stored, so they keep the legacy default.
 *  SD-05 began it with basketball; SD-17 covers every sport with a body preset. */
export const NEW_TOURNAMENT_POINTS: Partial<Record<SportId, Record<string, number | string | boolean>>> = Object.fromEntries(
  Object.keys(BODY_PRESETS).map((sp) => [sp, newTournamentKeys(sp)!]),
) as Partial<Record<SportId, Record<string, number | string | boolean>>>;

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

/** Which preset (if any) a saved format is on — compares the resulting rules,
 *  so a format that spells the same rules differently still matches. */
export function activePreset(sport: SportId, fmt?: Record<string, unknown> | null): PointsPreset | undefined {
  const rules = (c: StandingsConfig) => JSON.stringify([c.win, c.draw, c.loss, c.order, c.pairOrder ?? null, c.restart ?? false, c.rankBy ?? 'points',
    c.setPoints ?? null, c.lossBonus ?? null, c.shootout ?? null, c.forfeitLoss ?? null]);
  const now = rules(standingsConfigFromFormat(sport, fmt));
  return standingsPresets(sport).find((p) => rules(standingsConfigFromFormat(sport, { ...(fmt ?? {}), ...p.set })) === now);
}

/** Short points text for a settings row: the preset's name, else "w/d/l". */
export function pointsSystemLabel(sport: SportId, fmt?: Record<string, unknown> | null): string {
  const p = activePreset(sport, fmt);
  if (p) return p.label;
  const c = standingsConfigFromFormat(sport, fmt);
  return `${c.win}/${c.draw}/${c.loss}`;
}

/** "3-0:3/0,3-2:2/1" → { '3-0': [3, 0], '3-2': [2, 1] }; malformed parts dropped. */
export function parseSetPoints(raw: unknown): Record<string, [number, number]> | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const out: Record<string, [number, number]> = {};
  for (const part of raw.split(',')) {
    const m = /^\s*(\d+)-(\d+)\s*:\s*(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s*$/.exec(part);
    if (m) out[`${m[1]}-${m[2]}`] = [Number(m[3]), Number(m[4])];
  }
  return Object.keys(out).length ? out : undefined;
}

/** Points each side takes from a no result / abandoned match: the config's
 *  `noResult` (the organiser's `nrPoints`), else the sport default. */
export function noResultPoints(sport: SportId, cfg?: StandingsConfig | null): number {
  return cfg?.noResult ?? (sport === 'cricket' ? 1 : 0);
}

/** The tie-breakers an organiser can use for a sport (PointsEditor's
 *  advanced order), most useful first. */
export function availableTieBreakers(sport: SportId): TieBreaker[] {
  if (sport === 'chess') return ['sb', 'wins', 'h2h', ...customTB.keys(), 'lots'];
  // (chess: the FIDE Buchholz family, progressive score and Black counts are
  // registered tie-breakers — SD-26)
  if (sport === 'cricket') return ['h2h', 'nrr', 'for', 'wins', 'played', 'lots'];
  switch (scoreUnit(sport)) {
    case 'sets':
      return sport === 'volleyball'
        ? ['wins', 'setRatio', 'pointRatio', 'h2h', 'diff', 'setsPct', 'pointsDiff', 'played', 'lots']
        : ['wins', 'played', 'h2h', 'setsPct', 'gamesPct', 'diff', 'gamesDiff', 'setRatio', 'lots'];
    case 'games':
      return sport === 'tabletennis'
        ? ['h2h', 'h2hRatio', 'h2hPoints', 'diff', 'pointsDiff', 'pointRatio', 'gamesPct', 'wins', 'played', 'lots']
        : ['h2h', 'diff', 'pointsDiff', 'h2hRatio', 'h2hPoints', 'pointRatio', 'gamesPct', 'wins', 'played', 'lots'];
    case 'goals':
      return ['h2h', 'h2hDiff', 'h2hFor', 'diff', 'for', 'wins', ...(sport === 'football' ? ['fairPlay' as const] : []), 'played', 'lots'];
    default:
      return ['h2h', 'h2hDiff', 'h2hFor', 'diff', 'for', 'wins', 'played', 'lots'];
  }
}

/** A tie-breaker in plain words, in the sport's unit ("goal difference",
 *  "set ratio"). */
export function tieBreakerLabel(tb: TieBreaker, sport?: SportId | string): string {
  const u = scoreUnit(sport ?? '');
  const unit = u === 'goals' ? 'goal' : u === 'runs' ? 'run' : u === 'sets' ? 'set' : u === 'games' ? 'games' : 'points';
  const scored = u === 'goals' ? 'goals scored' : u === 'runs' ? 'runs scored' : u === 'sets' ? 'sets won' : u === 'games' ? 'games won' : 'points scored';
  switch (tb) {
    case 'h2h': return sport === 'chess' ? 'direct encounter' : 'head-to-head';
    case 'h2hDiff': return `head-to-head ${unit} difference`;
    case 'h2hFor': return `head-to-head ${scored}`;
    case 'h2hRatio': return 'games ratio (among tied)';
    case 'h2hPoints': return 'points ratio (among tied)';
    case 'nrr': return 'net run rate';
    case 'diff': return u === 'points' ? 'points difference' : `${unit} difference`;
    case 'for': return scored;
    case 'wins': return 'number of wins';
    case 'played': return 'matches played';
    case 'sb': return 'Sonneborn-Berger';
    case 'setRatio': return 'set ratio';
    case 'pointRatio': return 'point ratio';
    case 'gamesDiff': return 'games difference';
    case 'pointsDiff': return sport === 'carrom' ? 'board points difference' : 'points difference';
    case 'setsPct': return '% of sets won';
    case 'gamesPct': return '% of games won';
    case 'fairPlay': return 'fair play (cards)';
    case 'lots': return 'drawing of lots';
    default: return customTB.get(tb)?.label ?? tb;
  }
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

const parseOrder = (raw: unknown): TieBreaker[] =>
  typeof raw === 'string' ? raw.split(',').map((s) => s.trim()).filter(isTieBreaker) : [];

/** Read a tournament's per-sport override from its `formats[sport]` (reserved
 *  `winPoints`/`drawPoints`/`lossPoints`/`nrPoints`/`byePoints`/`tieBreak`/`pointsAdj`
 *  keys, and the SD-17 rule keys `tieBreak2`/`tieRestart`/`rankBy`/`setPoints`/
 *  `lossBonusMargin`+`lossBonusPoints`/`soWinPoints`+`soLossPoints`/
 *  `forfeitLossPoints`), falling back to the sport defaults. Zero-migration:
 *  rides on the existing formats jsonb. Each optional rule is set only when its
 *  key is stored, so an old format reads exactly as before. */
export function standingsConfigFromFormat(sport: SportId, fmt?: Record<string, unknown> | null): StandingsConfig {
  const d = defaultStandingsConfig(sport);
  if (!fmt) return d;
  const has = (k: string) => typeof fmt[k] === 'number' && Number.isFinite(fmt[k]);
  const num = (k: string, dv: number) => (has(k) ? (fmt[k] as number) : dv);
  const order = parseOrder(fmt.tieBreak);
  const pairOrder = parseOrder(fmt.tieBreak2);
  const adjustments = pointsAdjustmentsFromFormat(fmt);
  const setPoints = parseSetPoints(fmt.setPoints);
  const restart = fmt.tieRestart === true || fmt.tieRestart === 'h2h' ? fmt.tieRestart : fmt.tieRestart === false ? undefined : d.restart;
  return { win: num('winPoints', d.win), draw: num('drawPoints', d.draw), loss: num('lossPoints', d.loss), order: order.length ? order : d.order,
    ...(restart ? { restart } : {}),
    ...(typeof fmt.nrPoints === 'number' ? { noResult: fmt.nrPoints } : {}),
    ...(has('byePoints') ? { bye: fmt.byePoints as number } : {}),
    ...(adjustments.length ? { adjustments } : {}),
    ...(pairOrder.length ? { pairOrder } : {}),
    ...(fmt.rankBy === 'wins' ? { rankBy: 'wins' as const } : {}),
    ...(setPoints ? { setPoints } : {}),
    ...(has('lossBonusMargin') && has('lossBonusPoints') && (fmt.lossBonusPoints as number) !== 0
      ? { lossBonus: { margin: fmt.lossBonusMargin as number, points: fmt.lossBonusPoints as number } } : {}),
    ...(has('soWinPoints') ? { shootout: { win: fmt.soWinPoints as number, loss: num('soLossPoints', num('lossPoints', d.loss)) } } : {}),
    ...(has('forfeitLossPoints') ? { forfeitLoss: fmt.forfeitLossPoints as number } : {}) };
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

/** A match's sub-units for the standings rule kit (SD-17): sets, games and
 *  rally / board points won by each side, and each side's fair-play score
 *  (≤ 0, FIFA disciplinary points). Any may be absent. The plugin hook is
 *  `standingsUnits` (registry.ts); a sport whose match score already IS sets
 *  or games needs no hook for that unit (see `scoreUnit`). */
export interface StandingsUnits {
  sets?: { home: number; away: number };
  games?: { home: number; away: number };
  points?: { home: number; away: number };
  fairPlay?: { home: number; away: number };
}
type UnitsProvider = (sport: SportId, state: unknown) => StandingsUnits | null;
let unitsProvider: UnitsProvider | null = null;
export function setStandingsUnitsProvider(fn: UnitsProvider | null): void { unitsProvider = fn; }

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

/** The score a match counts in the table: a hand-ended result's score, else
 *  the sport's table crediting (SD-13), else the match score. */
function tableScore(m: Match): { home: number; away: number } | null {
  return m.result?.score ?? (m.result ? null : scoreProvider?.(m.sport, m.state)) ?? m.score ?? null;
}

/** Rally / board points won by each side (the sport's points provider). */
function pointsOf(m: Match): { home: number; away: number } | null {
  const u = m.state != null ? unitsProvider?.(m.sport, m.state) ?? null : null;
  return u?.points ?? pointsProvider?.(m.sport, m.state) ?? null;
}

/** A match's sets / games / points / fair play (SD-17): the plugin's units,
 *  with the match score standing in for sets or games when that is what the
 *  sport's score counts (volleyball's score is sets, badminton's is games). */
export function matchUnits(m: Match): StandingsUnits {
  const u = m.state != null ? unitsProvider?.(m.sport, m.state) ?? null : null;
  const score = tableScore(m) ?? undefined;
  const unit = scoreUnit(m.sport);
  const points = u?.points ?? pointsProvider?.(m.sport, m.state) ?? undefined;
  return {
    ...(u?.sets ?? (unit === 'sets' ? score : undefined) ? { sets: u?.sets ?? score } : {}),
    ...(u?.games ?? (unit === 'games' ? score : undefined) ? { games: u?.games ?? score } : {}),
    ...(points ? { points } : {}),
    ...(u?.fairPlay ? { fairPlay: u.fairPlay } : {}),
  };
}

/** Match points each side takes from one finished match (SD-17 margin-aware
 *  points): no result → `noResult` each; draw → `draw` each; otherwise win /
 *  loss, replaced by the forfeit loss for a walkover, the shoot-out points for
 *  a match level on the score, or the sets-score table (FIVB 3-2 → 2-1); then
 *  the losing bonus when the margin is within `lossBonus.margin` (PKL ≤ 7).
 *  With none of those rules set, exactly the legacy win / draw / loss. */
export function matchPoints(m: Match, cfg: StandingsConfig): { home: number; away: number } {
  if (isNoResultMatch(m)) { const n = noResultPoints(m.sport, cfg); return { home: n, away: n }; }
  if (isChessDoubleForfeit(m)) return { home: cfg.loss, away: cfg.loss };
  if (m.winner === 'draw') return { home: cfg.draw, away: cfg.draw };
  let w = cfg.win;
  let l = cfg.loss;
  const score = cfg.shootout || cfg.lossBonus ? tableScore(m) : null;
  if (m.walkover && cfg.forfeitLoss !== undefined) l = cfg.forfeitLoss;
  else if (cfg.shootout && score && score.home === score.away) { w = cfg.shootout.win; l = cfg.shootout.loss; }
  else if (cfg.setPoints) {
    const sets = matchUnits(m).sets;
    if (sets) {
      const p = cfg.setPoints[m.winner === 'home' ? `${sets.home}-${sets.away}` : `${sets.away}-${sets.home}`];
      if (p) [w, l] = p;
    }
  }
  if (cfg.lossBonus && !m.walkover && score && Math.abs(score.home - score.away) <= cfg.lossBonus.margin) l += cfg.lossBonus.points;
  return m.winner === 'home' ? { home: w, away: l } : { home: l, away: w };
}

/** Which units a config's tie-breakers read. */
function unitNeeds(cfg: StandingsConfig) {
  const tbs = new Set<string>([...cfg.order, ...(cfg.pairOrder ?? [])]);
  const all = !!cfg.withUnits;
  return {
    sets: all || tbs.has('setRatio') || tbs.has('setsPct'),
    games: all || tbs.has('gamesDiff') || tbs.has('gamesPct'),
    points: all || tbs.has('h2hPoints') || tbs.has('pointRatio') || tbs.has('pointsDiff'),
    fair: all || tbs.has('fairPlay'),
  };
}

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
  const need = unitNeeds(cfg);
  const resultOf = (pts: number): GameRecord['result'] => (pts >= cfg.win ? 'win' : pts > cfg.loss ? 'draw' : 'loss');
  const played = matches.filter((m) => m.sport === sport && m.status === 'completed' && (!!m.winner || isNoResultMatch(m)));
  for (const m of played) {
    const h = ensure(m.homeTeam.id, m.homeTeam.name, m.homeTeam.colorHex);
    const a = ensure(m.awayTeam.id, m.awayTeam.name, m.awayTeam.colorHex);
    const rnd = swissRoundOf(m.stage);
    const base = { matchId: m.id, stage: m.stage, ...(rnd ? { round: rnd } : {}) };
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
    const score = tableScore(m);
    if (score && counts) {
      h.for += score.home; h.against += score.away;
      a.for += score.away; a.against += score.home;
    }
    const rate = counts ? rateProvider?.(sport, m.state, !!m.result) : null;
    if (rate) {
      h.forUnits += rate.home; h.againstUnits += rate.away;
      a.forUnits += rate.away; a.againstUnits += rate.home;
    }
    // Rally points for cross-group seeding (SD-12) and the SD-17 units — only
    // when the order asks (so a legacy row carries exactly its old fields).
    if (!forfeit) {
      const add = (k: 'rally' | 'sets' | 'games', pair: { home: number; away: number } | undefined | null) => {
        if (!pair) return;
        const [f, ag] = k === 'rally' ? ['rallyFor', 'rallyAgainst'] as const : k === 'sets' ? ['setsFor', 'setsAgainst'] as const : ['gamesFor', 'gamesAgainst'] as const;
        h[f] = (h[f] ?? 0) + pair.home; h[ag] = (h[ag] ?? 0) + pair.away;
        a[f] = (a[f] ?? 0) + pair.away; a[ag] = (a[ag] ?? 0) + pair.home;
      };
      if (need.points) add('rally', pointsOf(m));
      if (need.sets || need.games || need.fair) {
        const u = matchUnits(m);
        if (need.sets) add('sets', u.sets);
        if (need.games) add('games', u.games);
        if (need.fair && u.fairPlay) { h.fairPlay = (h.fairPlay ?? 0) + u.fairPlay.home; a.fairPlay = (a.fairPlay ?? 0) + u.fairPlay.away; }
      }
    }
    const kind: GameRecord['kind'] = forfeit ? 'forfeit' : 'played';
    const mp = matchPoints(m, cfg);
    h.points += mp.home; a.points += mp.away;
    // SD-26: the colours over the board (chess, played games only).
    const white = sport === 'chess' && !forfeit ? chessWhiteSide(m) : undefined;
    const col = (side: 'home' | 'away') => (white ? { colour: side === white ? 'white' as const : 'black' as const } : {});
    if (forfeit && isChessDoubleForfeit(m)) {
      // SD-67: two forfeit losses, 0 points each
      h.forfeitLosses = (h.forfeitLosses ?? 0) + 1; a.forfeitLosses = (a.forfeitLosses ?? 0) + 1;
      log(h, { ...base, kind, unplayed: true, opponentId: a.teamId, result: 'loss', points: mp.home });
      log(a, { ...base, kind, unplayed: true, opponentId: h.teamId, result: 'loss', points: mp.away });
    } else if (m.winner === 'draw') {
      if (!forfeit) { h.drawn += 1; a.drawn += 1; }
      log(h, { ...base, kind, unplayed: forfeit, opponentId: a.teamId, result: 'draw', points: mp.home, ...col('home') });
      log(a, { ...base, kind, unplayed: forfeit, opponentId: h.teamId, result: 'draw', points: mp.away, ...col('away') });
    } else {
      const [w, l] = m.winner === 'home' ? [h, a] : [a, h];
      const [ws, ls] = m.winner === 'home' ? ['home', 'away'] as const : ['away', 'home'] as const;
      if (forfeit) { w.forfeitWins = (w.forfeitWins ?? 0) + 1; l.forfeitLosses = (l.forfeitLosses ?? 0) + 1; }
      else { w.won += 1; l.lost += 1; }
      const [wp, lp] = m.winner === 'home' ? [mp.home, mp.away] : [mp.away, mp.home];
      log(w, { ...base, kind, unplayed: forfeit, opponentId: l.teamId, result: 'win', points: wp, ...col(ws) });
      log(l, { ...base, kind, unplayed: forfeit, opponentId: w.teamId, result: 'loss', points: lp, ...col(ls) });
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
        const rnd = swissRoundOf(m.stage);
        log(t, { kind: 'bye', unplayed: true, stage: m.stage, ...(rnd ? { round: rnd } : {}), result: resultOf(byePts), points: byePts });
      }
    }
  }
  for (const t of table.values()) {
    t.diff = t.for - t.against;
    if (t.forUnits > 0 && t.againstUnits > 0) t.nrr = t.for / t.forUnits - t.against / t.againstUnits;
    // SD-17 units: every row gets them (0 when none recorded) once asked for.
    if (need.sets) { t.setsFor ??= 0; t.setsAgainst ??= 0; }
    if (need.games) { t.gamesFor ??= 0; t.gamesAgainst ??= 0; }
    if (need.fair) t.fairPlay ??= 0;
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
  // SD-26: the crosstable tie-breaks (FIDE C.07 2023) — Buchholz & co. and,
  // wherever per-round records are kept, Sonneborn-Berger with the C.07
  // unplayed-round rules: in a Swiss, your own bye / forfeit is a game against
  // a dummy on your own final score; an opponent's bye or forfeit counts at
  // face value; a withdrawn opponent's missing rounds count as draws. In a
  // round robin a forfeit is a regular game (C.07 15.2).
  const chain = new Set<string>([...cfg.order, ...(cfg.pairOrder ?? [])]);
  if (keepGames && (chain.has('sb') || [...chain].some((k) => FIDE_KEYS.has(k)))) {
    const fide = fideFor([...table.values()], matches, sport, cfg);
    for (const t of table.values()) {
      t.fide = fide.get(t.teamId);
      if (chain.has('sb')) t.sb = t.fide?.sb ?? 0;
    }
  } else if (cfg.order.includes('sb')) {
    // Sonneborn-Berger without per-round records (not chess, no bye point):
    // played games only, opponents' final game points.
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

/** The tie-breaks that read the FIDE crosstable (registered below). */
const FIDE_KEYS = new Set(['bh', 'bhc1', 'bhm1', 'ps', 'bpg', 'bwg']);

/** Build each row's C.07 crosstable from its `games` and compute the
 *  tie-breaks. Swiss when the records carry Swiss rounds: a round with no game
 *  and no bye is an absence (not if that player's game is still to be
 *  finished). Scores are game points (an organiser adjustment is not a result). */
function fideFor(rows: TeamStanding[], matches: Match[], sport: SportId, cfg: StandingsConfig): Map<string, FideTieBreaks> {
  const swiss = rows.some((t) => (t.games ?? []).some((g) => g.round !== undefined));
  const pending = new Set<string>();
  let rounds = 0;
  for (const t of rows) for (const g of t.games ?? []) rounds = Math.max(rounds, g.round ?? 0);
  if (swiss) {
    for (const m of matches) {
      const r = swissRoundOf(m.stage);
      if (m.sport !== sport || !r || m.status === 'cancelled') continue;
      const done = m.status === 'completed' && (!!m.winner || isNoResultMatch(m));
      if (!done) { pending.add(`${m.homeTeam.id}|${r}`); pending.add(`${m.awayTeam.id}|${r}`); }
    }
  }
  const records = new Map<string, XRound[]>();
  for (const t of rows) {
    records.set(t.teamId, (t.games ?? []).map((g, i): XRound => ({
      round: swiss ? g.round ?? 0 : i + 1,
      kind: g.kind === 'bye' ? 'pab' : g.kind === 'forfeit' ? (g.result === 'win' ? 'forfeitWin' : 'forfeitLoss') : g.result === 'nr' ? 'nr' : 'played',
      opponentId: g.opponentId, points: g.points, result: g.result, colour: g.colour,
    })).filter((r) => r.round > 0));
  }
  const score = new Map(rows.map((t) => [t.teamId, t.points - t.adjust]));
  return fideTieBreaks(records, { swiss, draw: cfg.draw, rounds, pending }, (id) => score.get(id));
}

// SD-26: the FIDE crosstable tie-breaks, registered so a saved chain can name
// them and the table shows a column for each one in the active chain (SD-18).
// Registration order = the PointsEditor's offer order.
for (const [key, label, short, pick] of [
  ['bhc1', 'Buchholz Cut-1', 'BH-C1', (f: FideTieBreaks) => f.bhc1],
  ['bh', 'Buchholz', 'BH', (f: FideTieBreaks) => f.bh],
  ['bhm1', 'Median Buchholz', 'BH-M1', (f: FideTieBreaks) => f.bhm1],
  ['ps', 'progressive score', 'PS', (f: FideTieBreaks) => f.ps],
  ['bwg', 'wins with Black', 'BWG', (f: FideTieBreaks) => f.bwg],
  ['bpg', 'games with Black', 'BPG', (f: FideTieBreaks) => f.bpg],
] as const) {
  registerTieBreaker(key, {
    label,
    value: (t) => (t.fide ? pick(t.fide) : 0),
    seed: (t) => (t.fide ? pick(t.fide) : null),
    column: { short, value: (t) => (t.fide ? pick(t.fide) : null) },
  });
}

/** FIDE's tie-break order for an individual Swiss (Handbook C.02 13.16.4,
 *  events where not all ratings are consistent — the school / club case):
 *  Buchholz Cut-1, Buchholz, Sonneborn-Berger, progressive score, direct
 *  encounter, number of wins (forfeits and a full-point bye included), wins
 *  with Black. C.07 (2023) leaves the list to the organiser; this is the
 *  default a new Swiss chess event stores (SD-26). */
export const FIDE_SWISS_ORDER: TieBreaker[] = ['bhc1', 'bh', 'sb', 'ps', 'h2h', 'wins', 'bwg'];

/** Rank rows: by points (FIVB `rankBy: 'wins'`: by wins, then points), then
 *  break each still-tied cluster with the config's ordered tie-breakers
 *  (head-to-head runs a mini-league among just that cluster; a two-team
 *  cluster uses `pairOrder` when set). Recursive so a partial tie falls
 *  through to the next criterion. */
export function rankTeams(rows: TeamStanding[], matches: Match[], cfg: StandingsConfig): TeamStanding[] {
  const out: TeamStanding[] = [];
  const byWins = cfg.rankBy === 'wins';
  const level = (x: TeamStanding, y: TeamStanding) => x.points === y.points && (!byWins || winsOf(x) === winsOf(y));
  const byPoints = [...rows].sort((x, y) => (byWins ? winsOf(y) - winsOf(x) : 0) || y.points - x.points);
  for (let i = 0; i < byPoints.length; ) {
    let j = i;
    while (j < byPoints.length && level(byPoints[j], byPoints[i])) j++;
    const cluster = byPoints.slice(i, j);
    out.push(...orderCluster(cluster, chainFor(cluster.length, cfg), matches, cfg));
    i = j;
  }
  return out;
}

/** The chain a level cluster starts (or restarts) with: the two-team chain
 *  when there is one and exactly two are level (BWF / ATP), else `order`. */
const chainFor = (size: number, cfg: StandingsConfig): TieBreaker[] =>
  size === 2 && cfg.pairOrder?.length ? cfg.pairOrder : cfg.order;

/** FIDE C.07 WIN: rounds won with or without playing — over-the-board wins,
 *  forfeit wins and a full-point bye (forfeits used to sit in `won`). */
const winsOf = (t: TeamStanding) =>
  t.won + (t.forfeitWins ?? 0) + (t.games ?? []).filter((g) => g.kind === 'bye' && g.result === 'win').length;

/** won ÷ (won + lost); 0 when nothing was played. */
const pct = (won: number, lost: number) => (won + lost === 0 ? 0 : won / (won + lost));

/** A tie-breaker computed over ALL the team's matches (not just among the
 *  tied); null for the among-the-tied ones. Higher is better. */
function overallKey(t: TeamStanding, tb: TieBreaker): number | null {
  switch (tb) {
    case 'nrr': return t.nrr ?? 0;
    case 'diff': return t.diff;
    case 'for': return t.for;
    case 'wins': return winsOf(t);
    case 'sb': return t.sb ?? 0;
    case 'played': return t.played;
    case 'setRatio': return ratio(t.setsFor ?? 0, t.setsAgainst ?? 0);
    case 'setsPct': return pct(t.setsFor ?? 0, t.setsAgainst ?? 0);
    case 'gamesDiff': return (t.gamesFor ?? 0) - (t.gamesAgainst ?? 0);
    case 'gamesPct': return pct(t.gamesFor ?? 0, t.gamesAgainst ?? 0);
    case 'pointRatio': return ratio(t.rallyFor ?? 0, t.rallyAgainst ?? 0);
    case 'pointsDiff': return (t.rallyFor ?? 0) - (t.rallyAgainst ?? 0);
    case 'fairPlay': return t.fairPlay ?? 0;
    default: return null;
  }
}

/** A tie-breaker's value for ranking teams from DIFFERENT groups (SD-12): the
 *  sport's own chain, with the "among the tied" criteria swapped for their
 *  overall equivalents — h2h (and its difference / scored) is skipped (they
 *  never met), the ITTF games ratio becomes the team's overall score ratio, the
 *  points ratio its overall rally-point ratio; lots is skipped. Higher is better. */
export function seedKey(t: TeamStanding, tb: TieBreaker): number | null {
  if (tb === 'h2h' || tb === 'h2hDiff' || tb === 'h2hFor' || tb === 'lots') return null;
  if (tb === 'h2hRatio') return ratio(t.for, t.against);
  if (tb === 'h2hPoints' || tb === 'pointRatio' || tb === 'pointsDiff') {
    if (t.rallyFor === undefined) return null;
    return tb === 'pointsDiff' ? t.rallyFor - (t.rallyAgainst ?? 0) : ratio(t.rallyFor, t.rallyAgainst ?? 0);
  }
  const custom = customTB.get(tb);
  if (custom) return custom.seed ? custom.seed(t) : null;
  return overallKey(t, tb);
}

/** won ÷ lost, with nothing lost ranking above any finite ratio. */
const ratio = (won: number, lost: number) => (lost === 0 ? (won > 0 ? Number.POSITIVE_INFINITY : 0) : won / lost);

/** The matches played among the cluster that involve `teamId` (no results
 *  excluded), with the team's side. */
function amongTied(teamId: string, cluster: TeamStanding[], matches: Match[]): { m: Match; isHome: boolean }[] {
  const ids = new Set(cluster.map((c) => c.teamId));
  const out: { m: Match; isHome: boolean }[] = [];
  for (const m of matches) {
    if (!ids.has(m.homeTeam.id) || !ids.has(m.awayTeam.id)) continue;
    const isHome = m.homeTeam.id === teamId;
    if (!isHome && m.awayTeam.id !== teamId) continue;
    out.push({ m, isHome });
  }
  return out;
}

/** Score ratio (e.g. games) — or, with `rally`, rally-point ratio — counting only
 *  matches played among the cluster (ITTF 3.7.5.2). */
function headToHeadRatio(teamId: string, cluster: TeamStanding[], matches: Match[], rally: boolean): number {
  let won = 0;
  let lost = 0;
  for (const { m, isHome } of amongTied(teamId, cluster, matches)) {
    if (isNoResultMatch(m)) continue;
    const sc = rally ? pointsOf(m) : m.score ?? null;
    if (!sc) continue;
    won += isHome ? sc.home : sc.away;
    lost += isHome ? sc.away : sc.home;
  }
  return ratio(won, lost);
}

/** Score difference (or scored) in the matches among the cluster only — the
 *  FIBA / UEFA / IHF mini-league. */
function headToHeadScore(teamId: string, cluster: TeamStanding[], matches: Match[], what: 'diff' | 'for'): number {
  let f = 0;
  let ag = 0;
  for (const { m, isHome } of amongTied(teamId, cluster, matches)) {
    if (isNoResultMatch(m)) continue;
    const sc = tableScore(m);
    if (!sc) continue;
    f += isHome ? sc.home : sc.away;
    ag += isHome ? sc.away : sc.home;
  }
  return what === 'diff' ? f - ag : f;
}

/** Points a team took from matches played *only among the given cluster*
 *  (the same match points as the table, margins included). */
function headToHeadPoints(teamId: string, cluster: TeamStanding[], matches: Match[], cfg: StandingsConfig): number {
  let pts = 0;
  for (const { m, isHome } of amongTied(teamId, cluster, matches)) {
    const mp = matchPoints(m, cfg);
    pts += isHome ? mp.home : mp.away;
  }
  return pts;
}

function tieKey(t: TeamStanding, tb: TieBreaker, cluster: TeamStanding[], matches: Match[], cfg: StandingsConfig): number {
  switch (tb) {
    case 'h2h': return headToHeadPoints(t.teamId, cluster, matches, cfg);
    case 'h2hRatio': return headToHeadRatio(t.teamId, cluster, matches, false);
    case 'h2hPoints': return headToHeadRatio(t.teamId, cluster, matches, true);
    case 'h2hDiff': return headToHeadScore(t.teamId, cluster, matches, 'diff');
    case 'h2hFor': return headToHeadScore(t.teamId, cluster, matches, 'for');
  }
  const custom = customTB.get(tb);
  if (custom) return custom.value(t, { cluster, matches, cfg });
  return overallKey(t, tb) ?? 0;
}

/** Does a criterion that separated some teams send the still-level ones back
 *  to the start of the procedure? */
function restartsAfter(tb: TieBreaker, cfg: StandingsConfig): boolean {
  if (cfg.restart === true) return true;
  return cfg.restart === 'h2h' && (AMONG_TIED.has(tb) || !!customTB.get(tb)?.amongTied);
}

function orderCluster(cluster: TeamStanding[], tbs: TieBreaker[], matches: Match[], cfg: StandingsConfig): TeamStanding[] {
  if (cluster.length <= 1) return cluster;
  const byName = () => [...cluster].sort((a, b) => a.name.localeCompare(b.name));
  if (tbs.length === 0) return byName();
  const [tb, ...rest] = tbs;
  // Explicit drawing of lots: still level after every criterion. Shown in name
  // order, flagged so the table says "Drawn by lot" (not before any result).
  if (tb === 'lots') {
    if (cluster.some((t) => t.played + (t.byes ?? 0) + (t.forfeitWins ?? 0) + (t.forfeitLosses ?? 0) > 0)) for (const t of cluster) t.lots = true;
    return byName();
  }
  const keyed = cluster.map((t) => ({ t, k: tieKey(t, tb, cluster, matches, cfg) }));
  keyed.sort((a, b) => b.k - a.k);
  // Not separated at all by this criterion → straight on to the next one.
  if (keyed[0].k === keyed[keyed.length - 1].k) return orderCluster(cluster, rest, matches, cfg);
  const res: TeamStanding[] = [];
  for (let i = 0; i < keyed.length; ) {
    let j = i;
    while (j < keyed.length && keyed[j].k === keyed[i].k) j++;
    // A sub-group still level: ITTF / FIBA / BWF restart the whole order among
    // just them (UEFA / IHF only after a head-to-head criterion) — it's strictly
    // smaller, so recursion terminates; otherwise continue with the NEXT one.
    const sub = keyed.slice(i, j).map((x) => x.t);
    res.push(...orderCluster(sub, restartsAfter(tb, cfg) ? chainFor(sub.length, cfg) : rest, matches, cfg));
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
 *  difference. Kabaddi also calls it a Tie (SD-18, PKL "T"). Other sports:
 *  "D", NR only once a match was abandoned, and the score difference. The
 *  full per-sport column set is `tableColumns` (standingsColumns.ts). */
export function tableLabels(sport: SportId | undefined): { draw: 'T' | 'D'; alwaysNr: boolean; showDiff: boolean } {
  if (sport === 'cricket') return { draw: 'T', alwaysNr: true, showDiff: false };
  if (sport === 'kabaddi') return { draw: 'T', alwaysNr: false, showDiff: true };
  return { draw: 'D', alwaysNr: false, showDiff: true };
}

/** Per-sport leaderboard categories — the stats we rank players by. The first
 *  is the headline (used for compact summaries). Derived from the stat schema
 *  (`leaders`, SD-15). */
export const STAT_CATEGORIES: Record<SportId, { key: string; label: string }[]> = Object.fromEntries(
  STAT_SPORTS.map((sp) => [sp, leaderCategories(sp)]),
) as Record<SportId, { key: string; label: string }[]>;

/** The headline stat used to rank individuals in each sport. */
export const leaderStat = (sport: SportId) => {
  const c = STAT_CATEGORIES[sport][0];
  // the stat's own name, not its card title ("4 matches won", not "4 most wins")
  const schema = statSchema(sport);
  const def = schema && statDefIn(schema, c.key);
  return { key: c.key, label: (def?.label ?? c.label).toLowerCase() };
};

export interface StatLeader {
  playerId: string;
  name: string;
  houseName?: string;
  value: number;
  /** the figure as shown when it isn't a plain count ("54*", "3/12", "7.25") */
  display?: string;
  /** games in which this stat was tracked (≤ games played) */
  trackedGames?: number;
  /** total games the player featured in this sport */
  totalGames?: number;
  /** a single-match figure (highest score, best bowling): the match it came from */
  matchId?: string;
}

/** Top-N players by any stat of the sport's schema (SD-16): totals, counts,
 *  single-match highs, best figures, rates with their qualifier, per-game /
 *  per-set — via the aggregate engine's `rankPlayers`. Also records, per
 *  player, how many of their games actually tracked the stat (so a
 *  leaderboard can flag a total that spans fewer games — see the per-game
 *  scoring settings). A key the schema doesn't declare ranks as a total. */
export function leadersByKey(
  lines: StatLine[], players: Player[], sport: SportId, key: string, limit = 10,
  opts: { qualifier?: Qualifier | null } = {},
): StatLeader[] {
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const schema = statSchema(sport);
  const mine = lines.filter((l) => l.sport === sport);
  const def: StatDef = (schema && statDefIn(schema, key)) || { key, label: key };
  // SD-09: football clean sheets rank goalkeepers only (schema `eligible`) — older clean sheets
  // credited to defenders stay on their lines until the stat backfill.
  const keepers = eligibilityOf(sport, key) === 'goalkeeper'
    ? new Set(mine.filter((l) =>
        isGoalkeeper(byId.get(l.playerId)?.sportDetails?.football?.position) || (l.stats && 'goalsConceded' in l.stats),
      ).map((l) => l.playerId))
    : null;
  const ranked = rankPlayers(schema ?? { sport, stats: [def], leaders: [], headline: [], awards: [] }, def, mine, {
    qualifier: opts.qualifier, limit, eligible: keepers ? (id) => keepers.has(id) : undefined,
  });
  const plainCount = (def.agg?.kind ?? 'sum') === 'sum' || def.agg?.kind === 'countIf';
  return ranked.map((r) => ({
    playerId: r.playerId, name: byId.get(r.playerId)?.fullName ?? 'Player', houseName: byId.get(r.playerId)?.houseName,
    value: r.value,
    display: plainCount && r.text === String(r.value) ? undefined : r.text,
    trackedGames: r.trackedGames, totalGames: r.totalGames,
    matchId: r.line?.matchId || undefined,
  }));
}

export interface LeaderCategory {
  key: string;
  label: string;
  leaders: StatLeader[];
  /** the minimum to rank ("min 30 balls faced"), when the stat has one */
  qualifier?: string;
}

/** Every leaderboard category for a sport, each with its ranked players.
 *  SD-27: `matches` fills each line's result (racket "Most wins" / "Best win
 *  %" count W-L; a match still in play is never a loss), `mins` = the
 *  organiser's minimums for this tournament (format `leaderMins`). */
export function categoryLeaders(
  lines: StatLine[], players: Player[], sport: SportId,
  opts: { matches?: Match[]; mins?: LeaderMins } = {},
): LeaderCategory[] {
  const schema = statSchema(sport);
  const ls = withLineResults(lines, opts.matches);
  return STAT_CATEGORIES[sport]
    .map((c) => {
      const def = schema && statDefIn(schema, c.key);
      const q = opts.mins && c.key in opts.mins ? effectiveQualifier(sport, c.key, opts.mins) : def ? qualifierOf(def) : undefined;
      const qualifier = schema && def ? qualifierText(schema, def, q) : undefined;
      return {
        key: c.key, label: c.label,
        leaders: leadersByKey(ls, players, sport, c.key, 10, opts.mins && c.key in opts.mins ? { qualifier: q ?? null } : {}),
        ...(qualifier ? { qualifier } : {}),
      };
    })
    .filter((c) => c.leaders.length > 0);
}

/** Back-compat: headline leaders for a sport. SD-27: `matches` fills line
 *  results (racket "Most wins"), `mins` = the organiser's minimums. */
export function statLeaders(
  lines: StatLine[], players: Player[], sport: SportId,
  opts: { matches?: Match[]; mins?: LeaderMins } = {},
): StatLeader[] {
  const key = leaderStat(sport).key;
  const ls = withLineResults(lines, opts.matches);
  return leadersByKey(ls, players, sport, key, 10, opts.mins && key in opts.mins ? { qualifier: effectiveQualifier(sport, key, opts.mins) ?? null } : {});
}
