/**
 * Golf leaderboard maths over stored rounds: a round's format, each entry's
 * round context (holes + strokes received) and the multi-round leaderboard with
 * the cut. Pure (no storage / network) so the litmus tests run it directly;
 * src/data/golf.ts re-exports everything here.
 */
import type { FieldEntry, FieldEvent, GolfCourse } from '../core/types.ts';
import {
  holesFor, courseHandicap, playingHandicap, strokesReceived, rankLeaderboard, emptyCard, summarize,
  type GolfCard, type GolfFormat, type HoleSet, type RankRow, type Hole, type EntryStatus, type EntryAdmin,
} from '../sports/golf/engine.ts';

/* -------------------------------- format -------------------------------- */

/** A golf round's format (stored on FieldEvent.format). */
export interface GolfRoundFormat extends GolfFormat {
  courseId: string;
  tee?: string;
  /** rank by net (handicap) scores in stroke play */
  net: boolean;
  /** 'playoff' (SD-89): a tie for first is shared until the host records the
   *  playoff winner (`format.playoffWinner`); other ties are shared */
  tieBreak: 'countback' | 'shared' | 'playoff';
  /** SD-66 — gross + net prizes: 'one' = a player takes one prize only (the
   *  gross prize first); 'both' (default) = they can win both */
  prizes: 'both' | 'one';
  /** SD-89 — the player who won the playoff for first */
  playoffWinner?: string;
}

export function golfFormatOf(ev: Pick<FieldEvent, 'format'>): GolfRoundFormat {
  const f = ev.format ?? {};
  return {
    scoring: f.competition === 'stableford' || f.scoring === 'stableford' ? 'stableford' : 'stroke',
    holes: (['18', 'front9', 'back9'].includes(String(f.holes)) ? String(f.holes) : '18') as HoleSet,
    allowance: typeof f.allowance === 'number' ? f.allowance : 95,
    maxScore: (['none', 'ndb', 'par3', 'par5'].includes(String(f.maxScore)) ? f.maxScore : 'ndb') as GolfFormat['maxScore'],
    courseId: String(f.courseId ?? ''),
    tee: typeof f.tee === 'string' ? f.tee : undefined,
    net: f.net === true || f.netScoring === 'net',
    tieBreak: f.tieBreak === 'shared' ? 'shared' : f.tieBreak === 'playoff' ? 'playoff' : 'countback',
    prizes: f.prizes === 'one' ? 'one' : 'both',
    playoffWinner: typeof f.playoffWinner === 'string' && f.playoffWinner ? f.playoffWinner : undefined,
  };
}

/* ----------------------------- entry admin ------------------------------ */

/** "12.4" → 12.4; "+2.1" (a plus handicap) → −2.1; '' → undefined. WHS
 *  range: up to 54.0 (and plus handicaps), one decimal. */
export const parseIndex = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  const plus = t.startsWith('+');
  const n = Number(t.replace('+', ''));
  if (!Number.isFinite(n) || n < 0 || n > 54 || (plus && n > 10)) return undefined;
  const r = Math.round(n * 10) / 10;
  return plus ? (r === 0 ? 0 : -r) : r;
};
/** −2.1 → "+2.1"; undefined → ''. */
export const showIndex = (n?: number | null) => (n == null ? '' : n < 0 ? `+${Math.abs(n)}` : String(n));

/** SD-35 — the organiser's admin note on an entry's card, if any. */
export const entryAdminOf = (entry: Pick<FieldEntry, 'result' | 'status'>): EntryAdmin | undefined => {
  const a = (entry.result as GolfCard | null)?.admin;
  return a && (a.status === 'wd' || a.status === 'dq' || a.status === 'dns') ? a : undefined;
};

/** SD-35 — the entry's status for ranking: a DNS is stored as `wd` (the
 *  status column has no 'dns') with `admin.status: 'dns'` on the card. */
export function entryStatusOf(entry: Pick<FieldEntry, 'result' | 'status'>): EntryStatus {
  const a = entryAdminOf(entry);
  if (entry.status === 'wd' && a?.status === 'dns') return 'dns';
  return entry.status;
}

/** SD-35 — the card + status column for an admin change. `null` reinstates
 *  the player (playing; finished once the round is closed). A DNS is stored
 *  as `wd`. Pure: the caller saves both in one write. */
export function withAdmin(card: GolfCard, admin: EntryAdmin | null, roundCompleted = false): { card: GolfCard; status: FieldEntry['status'] } {
  const { admin: _old, ...rest } = card;
  if (!admin) return { card: rest, status: roundCompleted ? 'finished' : 'playing' };
  const reason = admin.reason?.trim();
  const a: EntryAdmin = { status: admin.status, ...(reason ? { reason } : {}), ...(admin.thru != null ? { thru: admin.thru } : {}) };
  return { card: { ...rest, admin: a }, status: admin.status === 'dq' ? 'dq' : 'wd' };
}

/** "WD — injury" / "DQ (Rule 3.3b)" / "DNS" — the leaderboard's note. */
export const adminLabel = (a: EntryAdmin): string =>
  `${a.status.toUpperCase()}${a.status === 'wd' && a.thru ? ` after ${a.thru}` : ''}${a.reason ? ` — ${a.reason}` : ''}`;

/* ----------------------------- computations ----------------------------- */

/** The holes and strokes received for one entry in one round. */
export function roundContext(ev: FieldEvent, course: GolfCourse, entry: Pick<FieldEntry, 'handicapIndex'>) {
  const fmt = golfFormatOf(ev);
  const holes = holesFor(course, fmt.holes);
  const tee = course.tees.find((t) => t.name === fmt.tee) ?? course.tees[0];
  const idx = entry.handicapIndex;
  const ch = idx == null ? 0 : courseHandicap(idx, tee, holes);
  const ph = idx == null ? 0 : playingHandicap(ch, fmt.allowance);
  return { fmt, holes, tee, courseHandicap: ch, playingHandicap: ph, received: strokesReceived(ph, holes) };
}

export const cardOf = (entry: FieldEntry, holes: number): GolfCard => {
  const c = entry.result as GolfCard | null;
  return c && Array.isArray(c.strokes) && c.strokes.length === holes ? c : emptyCard(holes);
};

/**
 * The leaderboard across one or more rounds (a tournament's rounds, or a single
 * casual round). Players are matched across rounds by player id; the format of
 * the LAST round decides scoring/net/tie-break.
 *
 * Missed cut: once a later round exists, a player who played earlier rounds but
 * is not entered in the latest round missed the cut (the setup screen only
 * carries the cut-makers forward; the round's format records `cutAfterRound` /
 * `cut`). They are listed BELOW everyone still in the event, labelled "MC", with
 * their total over the rounds they played — never ranked among the field.
 * Players who went further rank above those cut earlier (54-hole MC above
 * 36-hole MC). WD / DQ / NR keep their own labels at the bottom.
 */
export function buildLeaderboard(events: FieldEvent[], entries: FieldEntry[], courses: GolfCourse[], override: { net?: boolean } = {}): RankRow[] {
  if (!events.length) return [];
  const ordered = [...events].sort((a, b) => a.roundNo - b.roundNo);
  const last = golfFormatOf(ordered[ordered.length - 1]);
  const notes = new Map<string, string>();
  const byPlayer = new Map<string, { status: EntryStatus; lastRound: number; rounds: { card: GolfCard; holes: Hole[]; received: number[] }[] }>();
  let latestRound = 0;
  for (const ev of ordered) {
    const course = courses.find((c) => c.id === golfFormatOf(ev).courseId);
    if (!course) continue;
    for (const en of entries.filter((e) => e.eventId === ev.id)) {
      const ctx = roundContext(ev, course, en);
      const status = entryStatusOf(en);
      const row = byPlayer.get(en.playerId) ?? { status, lastRound: 0, rounds: [] };
      row.rounds.push({ card: cardOf(en, ctx.holes.length), holes: ctx.holes, received: ctx.received });
      row.status = status;
      const a = entryAdminOf(en);
      if (a?.reason) notes.set(en.playerId, a.reason); else notes.delete(en.playerId);
      row.lastRound = Math.max(row.lastRound, ev.roundNo);
      latestRound = Math.max(latestRound, ev.roundNo);
      byPlayer.set(en.playerId, row);
    }
  }
  // SD-89 — a playoff ranks like "shared" until the winner is recorded
  const opts = { scoring: last.scoring, net: override.net ?? last.net, tieBreak: last.tieBreak === 'countback' ? 'countback' as const : 'shared' as const };
  const players = [...byPlayer.entries()].map(([id, r]) => ({ id, status: r.status, rounds: r.rounds, lastRound: r.lastRound }));
  let board = rankLeaderboard(players.filter((p) => p.lastRound === latestRound), opts);
  // SD-35 — the organiser's reason on WD / DQ / DNS rows (only when there is one)
  if (notes.size) board = board.map((r) => (r.position == null && notes.has(r.id) ? { ...r, note: notes.get(r.id) } : r));
  if (last.tieBreak === 'playoff') {
    // only a tie between finished cards goes to a playoff
    const done = (id: string) => {
      const rd = byPlayer.get(id)?.rounds.at(-1);
      return !!rd && summarize(rd.card, rd.holes, rd.received).thru >= rd.holes.length;
    };
    board = applyPlayoff(board, last.playoffWinner, done);
  }
  const cutRounds = [...new Set(players.filter((p) => p.lastRound < latestRound).map((p) => p.lastRound))].sort((a, b) => b - a);
  if (!cutRounds.length) return board;
  // Missed the cut: ranked among themselves only to ORDER them, per cut stage.
  const mc: RankRow[] = [];
  const mcOut: RankRow[] = [];
  for (const rn of cutRounds) {
    for (const r of rankLeaderboard(players.filter((p) => p.lastRound === rn), opts)) {
      if (r.position != null) mc.push({ ...r, position: null, positionLabel: 'MC', missedCut: true });
      else mcOut.push(r);
    }
  }
  return [...board.filter((r) => r.position != null), ...mc, ...board.filter((r) => r.position == null), ...mcOut];
}

/* ---------------------------- SD-89 playoff ----------------------------- */

/** A tie for first under the playoff tie-break (once every tied card is
 *  complete): "Playoff pending" until the host records the winner; then the winner is 1 and the other(s) share 2nd
 *  (a sudden-death playoff only decides the winner). Other places unchanged. */
export function applyPlayoff(board: RankRow[], winner?: string, complete: (id: string) => boolean = () => true): RankRow[] {
  const top = board.filter((r) => r.position === 1);
  if (top.length < 2 || !top.every((r) => complete(r.id))) return board;
  if (!winner || !top.some((r) => r.id === winner)) return board.map((r) => (r.position === 1 ? { ...r, playoff: 'pending' as const } : r));
  const losers = top.length - 1;
  const w = top.find((r) => r.id === winner)!;
  const rest = board.filter((r) => r.position !== 1);
  const lost = top.filter((r) => r.id !== winner).map((r) => ({ ...r, position: 2, positionLabel: losers > 1 ? 'T2' : '2', playoff: 'lost' as const }));
  return [{ ...w, positionLabel: '1', playoff: 'won' as const }, ...lost, ...rest];
}

/* ----------------------- SD-42 round-by-round columns -------------------- */

export interface RoundCell {
  /** strokes over the holes played (a pickup leaves that hole out) */
  gross: number;
  toPar: number;
  thru: number;
  holes: number;
  /** a pickup in stroke play: no return for the round */
  noReturn: boolean;
}

/** Each player's rounds in round order (null = not in that round), for the
 *  R1–R4 columns and the "F" / "thru N" / "–" cell. */
export function roundCells(events: FieldEvent[], entries: FieldEntry[], courses: GolfCourse[]): { rounds: number[]; byPlayer: Map<string, (RoundCell | null)[]> } {
  const ordered = [...events].sort((a, b) => a.roundNo - b.roundNo);
  const byPlayer = new Map<string, (RoundCell | null)[]>();
  ordered.forEach((ev, ri) => {
    const course = courses.find((c) => c.id === golfFormatOf(ev).courseId);
    if (!course) return;
    for (const en of entries.filter((e) => e.eventId === ev.id)) {
      const ctx = roundContext(ev, course, en);
      const s = summarize(cardOf(en, ctx.holes.length), ctx.holes, ctx.received);
      const row = byPlayer.get(en.playerId) ?? ordered.map(() => null);
      row[ri] = { gross: s.gross, toPar: s.toPar, thru: s.thru, holes: ctx.holes.length, noReturn: s.noReturn };
      byPlayer.set(en.playerId, row);
    }
  });
  return { rounds: ordered.map((e) => e.roundNo), byPlayer };
}

/** The leaderboard's "Thru" cell: "F" when the current round's card is
 *  complete, "thru N" → "N" while playing, "–" before tee-off (or when the
 *  player is not in the round). */
export function thruLabel(cell: RoundCell | null | undefined): string {
  if (!cell || cell.thru === 0) return '–';
  return cell.thru >= cell.holes ? 'F' : String(cell.thru);
}

/* -------------------------- SD-66 gross + net --------------------------- */

/** Best Gross and Best Net side by side: the top `places` of each board
 *  (default one per four players, 1–3)
 *  (players in the competition only). With `prizes: 'one'` a player takes one
 *  prize — the gross prize first (the usual club rule) — so the net board
 *  skips the gross prize-winners. */
export function prizeBoards(gross: RankRow[], net: RankRow[], places?: number, prizes: 'both' | 'one' = 'both'): { gross: RankRow[]; net: RankRow[] } {
  const inField = (r: RankRow) => r.position != null && !r.missedCut && (r.thru > 0 || r.grossTotal > 0);
  // default: one place per four players, 1–3 (a 3-ball has one prize each way)
  const n = places ?? Math.max(1, Math.min(3, Math.ceil(gross.filter(inField).length / 4)));
  const g = gross.filter(inField).slice(0, n);
  const taken = new Set(prizes === 'one' ? g.map((r) => r.id) : []);
  return { gross: g, net: net.filter((r) => inField(r) && !taken.has(r.id)).slice(0, n) };
}
