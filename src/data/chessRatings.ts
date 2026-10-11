/**
 * SD-85 (CH-07) — chess ratings, entered by hand on the player's chess
 * profile (no FIDE API): FIDE ID + a rating per FIDE list (standard / rapid /
 * blitz). From them, per event: rating-seeded Swiss round 1, the average
 * rating of opponents (ARO) and the tournament performance rating (TPR).
 *
 * Every figure here is UNOFFICIAL — the app is not a FIDE rating server and
 * the event is not FIDE-rated; the UI says so next to each figure.
 *
 * Rules followed:
 *  • Initial ranking (FIDE Handbook C.04.2 "General handling rules for Swiss
 *    tournaments", B.2 / C.04.3 Dutch "initial pairing numbers"): by rating,
 *    highest first; then (no titles here) alphabetically. Unrated players
 *    follow the rated ones.
 *  • ARO (C.07 Tie-Break Regulations 2023, art. 10.1): the sum of the ratings
 *    of the opponents met over the board ÷ the number of those opponents,
 *    rounded to the nearest whole number (0.5 up). Unplayed games (byes,
 *    forfeits) are excluded; unrated opponents are left out here (C.07 lets
 *    the regulations give them a rating — the app doesn't invent one).
 *  • TPR (C.07 art. 10.2, B.02 FIDE Rating Regulations 8.1 / Title
 *    Regulations B.01 1.48: Rp = Ra + dp): Ra = ARO, dp from the B.02 table
 *    8.1(a) for the fractional score p = points ÷ games over the board, p
 *    rounded to two decimals; 100 % → +800, 0 % → −800.
 *
 * PURE (no React Native) — node tests load it.
 */
import type { Player } from '../core/types';

/** The FIDE rating lists (B.02: standard, rapid, blitz). */
export type RatingList = 'standard' | 'rapid' | 'blitz';
export const RATING_LISTS: { key: RatingList; label: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'rapid', label: 'Rapid' },
  { key: 'blitz', label: 'Blitz' },
];

/** `sportDetails.chess.ratings` — stored in the player's sport_details jsonb
 *  (no migration). Every field optional. */
export interface ChessRatings {
  fideId?: string;
  standard?: number;
  rapid?: number;
  blitz?: number;
}

/** Which list an event's time control is rated on: classical (and untimed)
 *  → standard, rapid → rapid, blitz / bullet → blitz. */
export function ratingListFor(timeControl?: unknown): RatingList {
  if (timeControl === 'rapid') return 'rapid';
  if (timeControl === 'blitz' || timeControl === 'bullet') return 'blitz';
  return 'standard';
}

/** A typed rating: a whole number 100–3500 (national / club ratings go below
 *  FIDE's floor), else undefined. */
export function parseRating(v: unknown): number | undefined {
  const s = String(v ?? '').trim();
  if (!/^\d{3,4}$/.test(s)) return undefined;
  const n = Number(s);
  return n >= 100 && n <= 3500 ? n : undefined;
}

/** A FIDE ID: digits only, 4–10 long. */
export const validFideId = (v: unknown): boolean => /^\d{4,10}$/.test(String(v ?? '').trim());

/** The player's ratings, read defensively from their chess profile. */
export function chessRatingsOf(p?: Pick<Player, 'sportDetails'> | null): ChessRatings {
  const r = (p?.sportDetails?.chess as { ratings?: Record<string, unknown> } | undefined)?.ratings;
  if (!r || typeof r !== 'object') return {};
  const out: ChessRatings = {};
  if (validFideId(r.fideId)) out.fideId = String(r.fideId).trim();
  for (const { key } of RATING_LISTS) { const n = parseRating(r[key]); if (n !== undefined) out[key] = n; }
  return out;
}

/** The rating on `list` (strictly that list — a rapid event never borrows a
 *  standard rating), undefined = unrated on it. */
export const ratingOn = (r: ChessRatings, list: RatingList): number | undefined => r[list];

/** Clean ratings to store (drops blanks / invalid values); undefined when empty. */
export function cleanRatings(r: Record<string, unknown> | undefined): ChessRatings | undefined {
  if (!r) return undefined;
  const out = chessRatingsOf({ sportDetails: { chess: { ratings: r } as never } });
  return Object.keys(out).length ? out : undefined;
}

/** "Std 1850 · Rapid 1790 · FIDE ID 46616543" — what's on file. */
export function ratingsText(r: ChessRatings): string {
  const parts = RATING_LISTS.filter((l) => r[l.key] !== undefined).map((l) => `${l.label} ${r[l.key]}`);
  if (r.fideId) parts.push(`FIDE ID ${r.fideId}`);
  return parts.join(' · ');
}

/* ------------------------------ seeding ------------------------------ */

/** C.04.2 initial ranking: rating (highest first), unrated after the rated,
 *  then alphabetically by name; stable for equal names. */
export function ratingSeedOrder(
  ids: string[], ratingOf: (id: string) => number | undefined, nameOf: (id: string) => string = (id) => id,
): string[] {
  return ids
    .map((id, i) => ({ id, i, r: ratingOf(id), n: nameOf(id) }))
    .sort((a, b) => (b.r ?? -1) - (a.r ?? -1) || a.n.localeCompare(b.n) || a.i - b.i)
    .map((x) => x.id);
}

/* -------------------------- performance (B.02) -------------------------- */

/** FIDE B.02 table 8.1(a): dp for p = 0.50 … 1.00 (index = round(p×100) − 50).
 *  Lower scores are the mirror image (dp(1 − p) = −dp(p)). */
const DP_TABLE = [
  0, 7, 14, 21, 29, 36, 43, 50, 57, 65, // .50–.59
  72, 80, 87, 95, 102, 110, 117, 125, 133, 141, // .60–.69
  149, 158, 166, 175, 184, 193, 202, 211, 220, 230, // .70–.79
  240, 251, 262, 273, 284, 296, 309, 322, 336, 351, // .80–.89
  366, 383, 401, 422, 444, 470, 501, 538, 589, 677, // .90–.99
  800, // 1.00
];

/** dp for a fractional score p (0–1), rounded to the hundredth first. */
export function dpFor(p: number): number {
  const h = Math.round(Math.min(1, Math.max(0, p)) * 100);
  return h >= 50 ? DP_TABLE[h - 50] : -DP_TABLE[50 - h];
}

/** Round half up, as C.07 rounds ARO / TPR. */
const roundHalfUp = (x: number) => Math.floor(x + 0.5);

export interface PerformanceGame {
  /** the opponent's rating on the event's list (undefined = unrated) */
  oppRating?: number;
  /** 1 / 0.5 / 0 */
  score: number;
  /** a bye / forfeit — never counts */
  unplayed?: boolean;
}

export interface Performance {
  /** average rating of the rated opponents met over the board */
  aro?: number;
  /** tournament performance rating = ARO + dp(p) */
  tpr?: number;
  /** games that counted (played, rated opponent) */
  games: number;
  /** points scored in those games */
  score: number;
}

/** ARO and TPR over a player's games: played games against rated opponents
 *  only. Nothing to show (no such game) → `aro` / `tpr` undefined. */
export function performance(gs: PerformanceGame[]): Performance {
  const rated = gs.filter((g) => !g.unplayed && typeof g.oppRating === 'number');
  if (!rated.length) return { games: 0, score: 0 };
  const sum = rated.reduce((s, g) => s + (g.oppRating as number), 0);
  const score = rated.reduce((s, g) => s + g.score, 0);
  const aro = roundHalfUp(sum / rated.length);
  return { aro, tpr: aro + dpFor(score / rated.length), games: rated.length, score };
}

/** The line every ARO / TPR figure carries. */
export const UNOFFICIAL_NOTE = 'Unofficial — not FIDE-rated. ARO / TPR use the ratings players entered on their profiles (FIDE B.02 table 8.1a).';
