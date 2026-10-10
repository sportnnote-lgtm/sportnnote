/**
 * Golf leaderboard maths over stored rounds: a round's format, each entry's
 * round context (holes + strokes received) and the multi-round leaderboard with
 * the cut. Pure (no storage / network) so the litmus tests run it directly;
 * src/data/golf.ts re-exports everything here.
 */
import type { FieldEntry, FieldEvent, GolfCourse } from '../core/types.ts';
import {
  holesFor, courseHandicap, playingHandicap, strokesReceived, rankLeaderboard, emptyCard,
  type GolfCard, type GolfFormat, type HoleSet, type RankRow, type Hole,
} from '../sports/golf/engine.ts';

/* -------------------------------- format -------------------------------- */

/** A golf round's format (stored on FieldEvent.format). */
export interface GolfRoundFormat extends GolfFormat {
  courseId: string;
  tee?: string;
  /** rank by net (handicap) scores in stroke play */
  net: boolean;
  tieBreak: 'countback' | 'shared';
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
    tieBreak: f.tieBreak === 'shared' ? 'shared' : 'countback',
  };
}

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
export function buildLeaderboard(events: FieldEvent[], entries: FieldEntry[], courses: GolfCourse[]): RankRow[] {
  if (!events.length) return [];
  const ordered = [...events].sort((a, b) => a.roundNo - b.roundNo);
  const last = golfFormatOf(ordered[ordered.length - 1]);
  const byPlayer = new Map<string, { status: FieldEntry['status']; lastRound: number; rounds: { card: GolfCard; holes: Hole[]; received: number[] }[] }>();
  let latestRound = 0;
  for (const ev of ordered) {
    const course = courses.find((c) => c.id === golfFormatOf(ev).courseId);
    if (!course) continue;
    for (const en of entries.filter((e) => e.eventId === ev.id)) {
      const ctx = roundContext(ev, course, en);
      const row = byPlayer.get(en.playerId) ?? { status: en.status, lastRound: 0, rounds: [] };
      row.rounds.push({ card: cardOf(en, ctx.holes.length), holes: ctx.holes, received: ctx.received });
      row.status = en.status;
      row.lastRound = Math.max(row.lastRound, ev.roundNo);
      latestRound = Math.max(latestRound, ev.roundNo);
      byPlayer.set(en.playerId, row);
    }
  }
  const opts = { scoring: last.scoring, net: last.net, tieBreak: last.tieBreak };
  const players = [...byPlayer.entries()].map(([id, r]) => ({ id, status: r.status, rounds: r.rounds, lastRound: r.lastRound }));
  const board = rankLeaderboard(players.filter((p) => p.lastRound === latestRound), opts);
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
