/**
 * Golf rules engine — pure, framework-free (unit-tested in tests/golf.test.mts).
 * See docs/sports/GOLF_DESIGN.md.
 *
 *   • Courses: holes (par + stroke index) and tees (course rating + slope).
 *   • WHS handicaps: course handicap → playing handicap (allowance) → strokes
 *     received per hole by stroke index (plus handicaps give strokes back).
 *   • Card maths: gross, to-par, net, Stableford points, adjusted (max-score) gross.
 *   • Ranking: stroke (low) or Stableford (high), ties shown "T3", countback on
 *     the last 9 / 6 / 3 / 1 holes of the final round, DNF/WD/DQ below finishers.
 *   • Multi-round: totals across rounds + cut (top N and ties, or within X).
 *   • Match play: hole-by-hole state — "2 UP", "AS", dormie, "3&2".
 *
 * We never issue an official Handicap Index (only authorised associations can);
 * players enter their own and we apply it.
 */
import { sharedPositions, topNAndTies } from '../../data/results/positions.ts';

/* ------------------------------- courses -------------------------------- */

export interface Hole {
  /** hole number on the course, 1..18 */
  n: number;
  par: number;
  /** stroke index 1 (hardest) .. 18 (or 1..9 on a 9-hole course) */
  si: number;
}

export interface Tee {
  name: string;
  /** 18-hole course rating and slope (WHS); optional — without them, CH = index */
  courseRating?: number;
  slope?: number;
  /** 9-hole ratings, when the scorecard lists them */
  rating9F?: number; slope9F?: number;
  rating9B?: number; slope9B?: number;
}

export interface Course {
  id: string;
  name: string;
  city?: string;
  holes: Hole[];
  tees: Tee[];
}

/** Which holes a round uses. */
export type HoleSet = '18' | 'front9' | 'back9';

/** A standard par-72 layout (4 par-3s, 4 par-5s, 10 par-4s) with a typical
 *  stroke-index spread — the "quick-create" template when the organizer doesn't
 *  have the scorecard handy. Edit pars/SI to match the real course. */
export function standardPar72(): Hole[] {
  const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
  // Odd SIs on the front nine, even on the back (WHS recommendation).
  const si = [7, 11, 15, 1, 5, 9, 17, 3, 13, 8, 12, 16, 2, 6, 10, 18, 4, 14];
  return pars.map((par, i) => ({ n: i + 1, par, si: si[i] }));
}

export function holesFor(course: Pick<Course, 'holes'>, set: HoleSet): Hole[] {
  const all = [...course.holes].sort((a, b) => a.n - b.n);
  if (all.length <= 9) return all; // a 9-hole course plays its nine
  if (set === 'front9') return all.filter((h) => h.n <= 9);
  if (set === 'back9') return all.filter((h) => h.n >= 10);
  return all;
}

export const parOf = (holes: Hole[]) => holes.reduce((t, h) => t + h.par, 0);

/* ------------------------------ handicaps ------------------------------- */

/** WHS rounding: to the nearest whole number, .5 rounding up (away from the
 *  "better" side is not required — WHS rounds .5 upward). */
const whsRound = (x: number) => Math.floor(x + 0.5);

/**
 * Course Handicap (WHS) = Index × Slope / 113 + (Course Rating − Par).
 * 9 holes: half the index, with the 9-hole rating/slope when known (else half
 * the 18-hole rating). Without a rating/slope, the course handicap is simply the
 * index (or half of it for 9 holes).
 */
export function courseHandicap(index: number, tee: Tee | undefined, holes: Hole[]): number {
  const nine = holes.length <= 9;
  const front = nine && holes.every((h) => h.n <= 9);
  const par = parOf(holes);
  const idx = nine ? index / 2 : index;
  let rating: number | undefined;
  let slope: number | undefined;
  if (tee) {
    if (nine) {
      rating = front ? tee.rating9F : tee.rating9B;
      slope = front ? tee.slope9F : tee.slope9B;
      if (rating == null && tee.courseRating != null) rating = tee.courseRating / 2;
      if (slope == null) slope = tee.slope;
    } else {
      rating = tee.courseRating;
      slope = tee.slope;
    }
  }
  if (rating == null || slope == null) return whsRound(idx);
  return whsRound(idx * (slope / 113) + (rating - par));
}

/** Playing Handicap = Course Handicap × allowance% (WHS defaults: 95% individual
 *  stroke play & Stableford, 100% singles match play). */
export function playingHandicap(ch: number, allowancePct = 100): number {
  return whsRound((ch * allowancePct) / 100);
}

/** Strokes received on each hole (same order as `holes`), by stroke index. A
 *  positive playing handicap gives strokes on the hardest holes first (PH 20 over
 *  18 holes = 1 everywhere + a 2nd on the two hardest); a plus (negative)
 *  handicap gives strokes BACK, starting from the easiest holes. On a 9-hole
 *  round the nine are ranked among themselves. */
export function strokesReceived(ph: number, holes: Hole[]): number[] {
  const n = holes.length;
  if (!n || ph === 0) return holes.map(() => 0);
  // Rank holes hardest → easiest by SI.
  const order = holes.map((h, i) => ({ i, si: h.si })).sort((a, b) => a.si - b.si);
  const rank = new Array<number>(n);
  order.forEach((o, r) => { rank[o.i] = r; });
  const abs = Math.abs(ph);
  const base = Math.floor(abs / n);
  const extra = abs % n;
  return holes.map((_, i) => {
    if (ph > 0) return base + (rank[i] < extra ? 1 : 0);
    // Plus handicap: give back on the EASIEST holes (highest rank) first.
    const back = base + (rank[i] >= n - extra ? 1 : 0);
    return back === 0 ? 0 : -back;
  });
}

/* -------------------------------- cards --------------------------------- */

/** A hole's score: strokes, 'P' (picked up / no return), or null (not played yet). */
export type HoleScore = number | 'P' | null;

export interface GolfCard {
  strokes: HoleScore[];
  /** optional per-hole extras (same indexing) */
  putts?: (number | null)[];
  /** fairway in regulation: true/false, null = not recorded or par 3 */
  fir?: (boolean | null)[];
  /** green in regulation */
  gir?: (boolean | null)[];
  penalties?: (number | null)[];
  /** SD-117c — Rule 3.3b certification: the marker and the player have each
   *  signed this card (the scorecard's "Marker ✓ / Player ✓"). Any change to a
   *  hole score clears it — they signed the card as it stood. Absent = not
   *  signed (every older card). */
  signed?: { marker?: boolean; player?: boolean };
}

/** SD-117c — the most strokes a hole can be entered as on the scorecard. */
export const MAX_HOLE_STROKES = 20;

/** SD-117c — has the card been certified by both the marker and the player? */
export const cardSigned = (c: Pick<GolfCard, 'signed'> | null | undefined): boolean => !!c?.signed?.marker && !!c?.signed?.player;

/** SD-117c — putts can't be more than the strokes on the hole (= strokes is a
 *  chip-in-free hole of all putts — allowed); null stays null. */
export const clampPutts = (putts: number | null | undefined, strokes: HoleScore): number | null => {
  if (putts == null || typeof strokes !== 'number') return putts ?? null;
  return Math.max(0, Math.min(putts, strokes));
};

/** SD-117c — the hole-state line of a conceded match-play match from the
 *  conceding side's view: "conceded, 3 down thru 12" / "conceded, all square
 *  thru 4" / "conceded before hole 1". */
export function concededLine(holes: HoleWinner[], conceder: 'home' | 'away', regulation = 18, extraHoles = false): string {
  const m = matchState(holes, regulation, extraHoles);
  if (!m.played) return 'conceded before hole 1';
  const mine = conceder === 'home' ? m.up : -m.up;
  const st = mine === 0 ? 'all square' : `${Math.abs(mine)} ${mine < 0 ? 'down' : 'up'}`;
  return `conceded, ${st} thru ${m.played}`;
}

export type GolfScoring = 'stroke' | 'stableford';
export type MaxScore = 'none' | 'ndb' | 'par3' | 'par5';

export interface GolfFormat {
  scoring: GolfScoring;
  holes: HoleSet;
  /** handicap allowance % (default 95 for stroke/Stableford) */
  allowance: number;
  /** cap per hole for the ADJUSTED gross (stats / handicap estimates) */
  maxScore: MaxScore;
}

export const DEFAULT_FORMAT: GolfFormat = { scoring: 'stroke', holes: '18', allowance: 95, maxScore: 'ndb' };

export const emptyCard = (holes: number): GolfCard => ({ strokes: new Array(holes).fill(null) });

/** Stableford points on a hole: 2 + par + strokes received − strokes, min 0.
 *  A pickup scores 0. */
export function stablefordPoints(strokes: HoleScore, par: number, received: number): number {
  if (strokes == null) return 0;
  if (strokes === 'P') return 0;
  return Math.max(0, 2 + par + received - strokes);
}

/** Max-score cap for a hole (for the adjusted gross): net double bogey =
 *  par + 2 + strokes received; or par + 3 / par + 5. A pickup takes the cap. */
export function holeCap(par: number, received: number, rule: MaxScore): number | null {
  if (rule === 'ndb') return par + 2 + received;
  if (rule === 'par3') return par + 3;
  if (rule === 'par5') return par + 5;
  return null;
}

export interface CardSummary {
  /** holes with a score or a pickup */
  thru: number;
  /** all holes in the round have a score/pickup */
  complete: boolean;
  /** sum of numeric strokes */
  gross: number;
  /** strokes − par over the holes scored with a number */
  toPar: number;
  /** net = gross − strokes received over the holes scored */
  net: number;
  netToPar: number;
  stableford: number;
  /** stroke play: a pickup means no return (NR) */
  noReturn: boolean;
  /** gross with each hole capped by the max-score rule (pickups take the cap) */
  adjustedGross: number;
}

export function summarize(card: GolfCard, holes: Hole[], received: number[], fmt: Pick<GolfFormat, 'maxScore'> = DEFAULT_FORMAT): CardSummary {
  let thru = 0, gross = 0, parPlayed = 0, recvPlayed = 0, stableford = 0, adjusted = 0;
  let noReturn = false;
  holes.forEach((h, i) => {
    const s = card.strokes[i] ?? null;
    if (s == null) return;
    thru += 1;
    const rcv = received[i] ?? 0;
    stableford += stablefordPoints(s, h.par, rcv);
    const cap = holeCap(h.par, rcv, fmt.maxScore);
    if (s === 'P') {
      noReturn = true;
      adjusted += cap ?? h.par + 2 + rcv;
      return;
    }
    gross += s;
    parPlayed += h.par;
    recvPlayed += rcv;
    adjusted += cap != null ? Math.min(s, cap) : s;
  });
  const net = gross - recvPlayed;
  return {
    thru, complete: thru === holes.length && holes.length > 0,
    gross, toPar: gross - parPlayed, net, netToPar: net - parPlayed,
    stableford, noReturn, adjustedGross: adjusted,
  };
}

/** "−3", "E", "+2" */
export const toParLabel = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/* ------------------------------- ranking -------------------------------- */

export type EntryStatus = 'playing' | 'finished' | 'dnf' | 'wd' | 'dq';

/** One player's rounds, already summarized, for the leaderboard. */
export interface RankInput {
  id: string;
  status: EntryStatus;
  /** per round (round order), with that round's holes + strokes received */
  rounds: Array<{ card: GolfCard; holes: Hole[]; received: number[] }>;
}

export interface RankRow {
  id: string;
  position: number | null;
  /** "1", "T3", "DQ" … */
  positionLabel: string;
  status: EntryStatus;
  /** total in the competition's measure (to-par for stroke; points for Stableford) */
  total: number;
  /** today's (last round's) value in the same measure */
  today: number;
  /** holes completed in the current (last) round */
  thru: number;
  grossTotal: number;
  noReturn: boolean;
  /** missed the cut (multi-round events): listed below the cut line, labelled
   *  "MC", not ranked among the field. Derived, never a stored status. */
  missedCut?: boolean;
}

export interface RankOptions {
  scoring: GolfScoring;
  /** use net (handicap) scores for stroke play */
  net: boolean;
  /** break ties by countback (last 9/6/3/1 of the final round) or share them */
  tieBreak: 'countback' | 'shared';
}

/** The competition measure for one round. Stroke: to-par (gross or net) over the
 *  holes played — so a player "thru 12" compares fairly. Stableford: points. */
function roundValue(sum: CardSummary, o: RankOptions): number {
  if (o.scoring === 'stableford') return sum.stableford;
  return o.net ? sum.netToPar : sum.toPar;
}

/** Countback on the final round over the last 9, 6, 3, then last hole (on 9
 *  holes: last 6, 3, 1). Stableford uses the points on those holes. Net stroke
 *  play deducts the matching FRACTION of the playing handicap (½, ⅓, ⅙, 1/18 —
 *  the standard R&A/WHS countback), not the per-hole strokes. */
function countbackKey(r: RankInput, o: RankOptions): number[] {
  const last = r.rounds[r.rounds.length - 1];
  if (!last) return [];
  const n = last.holes.length;
  const windows = n >= 18 ? [9, 6, 3, 1] : [6, 3, 1].filter((w) => w <= n);
  const ph = last.received.reduce((t, x) => t + x, 0);
  return windows.map((w) => {
    const from = Math.max(0, n - w);
    const holes = last.holes.slice(from);
    const card: GolfCard = { strokes: last.card.strokes.slice(from) };
    const sum = summarize(card, holes, last.received.slice(from));
    if (o.scoring === 'stableford') return sum.stableford;
    return o.net ? sum.toPar - (ph * w) / n : sum.toPar;
  });
}

const FINISH_ORDER: Record<EntryStatus, number> = { finished: 0, playing: 0, dnf: 1, wd: 2, dq: 3 };

export function rankLeaderboard(inputs: RankInput[], o: RankOptions): RankRow[] {
  const better = o.scoring === 'stableford' ? -1 : 1; // sort multiplier: low-wins vs high-wins
  const rows = inputs.map((r) => {
    let total = 0, gross = 0, noReturn = false, today = 0, thru = 0;
    r.rounds.forEach((rd, i) => {
      const s = summarize(rd.card, rd.holes, rd.received);
      total += roundValue(s, o);
      gross += s.gross;
      if (o.scoring === 'stroke' && s.noReturn) noReturn = true;
      if (i === r.rounds.length - 1) { today = roundValue(s, o); thru = s.thru; }
    });
    // Stroke play: a pickup is "no return" — ranks with the non-finishers.
    const status: EntryStatus = noReturn && r.status === 'finished' ? 'dnf' : r.status;
    // Countback only settles ties between COMPLETE final-round cards; while a
    // card is still being played, an equal total reads as a tie ("T").
    const lastRd = r.rounds[r.rounds.length - 1];
    const complete = !!lastRd && thru === lastRd.holes.length && lastRd.holes.length > 0;
    return { r, total, gross, noReturn, today, thru, status, complete, cb: countbackKey(r, o) };
  });

  const ranked = rows.filter((x) => FINISH_ORDER[x.status] === 0 && x.thru + x.r.rounds.length > 0);
  const others = rows.filter((x) => !ranked.includes(x));
  // Countback applies to a group of equal totals only when EVERY card in it is
  // complete — otherwise the whole group shares the place ("T"), so the result
  // never depends on sort order.
  const incompleteTotals = new Set(ranked.filter((x) => !x.complete).map((x) => x.total));
  const useCountback = (total: number) => o.tieBreak === 'countback' && !incompleteTotals.has(total);

  ranked.sort((a, b) => {
    if (a.total !== b.total) return better * (a.total - b.total);
    if (useCountback(a.total)) {
      for (let i = 0; i < Math.max(a.cb.length, b.cb.length); i++) {
        const d = (a.cb[i] ?? 0) - (b.cb[i] ?? 0);
        if (d !== 0) return better * d;
      }
    }
    return 0;
  });

  const tied = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    a.total === b.total && (!useCountback(a.total) || a.cb.every((v, i) => v === b.cb[i]));

  const out: RankRow[] = [];
  // Shared position with the first equal row above (results-engine primitive).
  const places = sharedPositions(ranked, tied);
  ranked.forEach((x, i) => {
    const { position: pos, tie: isTie } = places[i];
    out.push({ id: x.r.id, position: pos, positionLabel: `${isTie ? 'T' : ''}${pos}`, status: x.status, total: x.total, today: x.today, thru: x.thru, grossTotal: x.gross, noReturn: x.noReturn });
  });
  others
    .sort((a, b) => FINISH_ORDER[a.status] - FINISH_ORDER[b.status])
    .forEach((x) => out.push({ id: x.r.id, position: null, positionLabel: x.status === 'finished' ? 'NR' : x.status.toUpperCase(), status: x.status, total: x.total, today: x.today, thru: x.thru, grossTotal: x.gross, noReturn: x.noReturn }));
  return out;
}

/* --------------------------------- cut ---------------------------------- */

export type CutRule = { type: 'top'; n: number } | { type: 'within'; strokes: number } | { type: 'none' };

/** Who makes the cut from a ranked leaderboard: top N **and ties**, or everyone
 *  within X of the lead (stroke play). Non-finishers never make the cut. */
export function makesCut(rows: RankRow[], rule: CutRule, scoring: GolfScoring = 'stroke'): string[] {
  const ranked = rows.filter((r) => r.position != null);
  if (rule.type === 'none') return ranked.map((r) => r.id);
  if (rule.type === 'top') {
    return topNAndTies(ranked, rule.n, (a, b) => a.total === b.total).map((r) => r.id);
  }
  if (!ranked.length) return [];
  const lead = ranked[0].total;
  return ranked
    .filter((r) => (scoring === 'stableford' ? lead - r.total : r.total - lead) <= rule.strokes)
    .map((r) => r.id);
}

/* ------------------------------ match play ------------------------------ */

export type HoleWinner = 'home' | 'away' | 'halved';

/** Who wins a hole on (net) strokes. `homeRecv`/`awayRecv` are the strokes each
 *  receives on this hole (match-play handicaps: the difference between playing
 *  handicaps, allocated to the higher handicap). */
export function holeWinner(home: number, away: number, homeRecv = 0, awayRecv = 0): HoleWinner {
  const h = home - homeRecv;
  const a = away - awayRecv;
  return h < a ? 'home' : a < h ? 'away' : 'halved';
}

export interface MatchState {
  /** home holes up (negative = away up) */
  up: number;
  played: number;
  remaining: number;
  /** "AS", "2 UP" (from the leader's side), "Dormie 2" */
  status: string;
  leader: 'home' | 'away' | null;
  dormie: boolean;
  /** decided: closed out early, or after the last hole with a leader */
  decided: boolean;
  winner: 'home' | 'away' | 'halved' | null;
  /** "3&2", "1 UP", "2 UP", "Halved" (after decided); "20th hole" for extra holes */
  result: string | null;
}

/**
 * Match state after the given holes (in order). `regulation` = holes in the match
 * (18 or 9). With `extraHoles`, an all-square match continues until a hole is won
 * (knockout); otherwise it ends halved.
 */
export function matchState(holes: HoleWinner[], regulation = 18, extraHoles = false): MatchState {
  let up = 0;
  let played = 0;
  let decided = false;
  for (const w of holes) {
    if (decided) break; // holes after the match is over don't count
    if (w === 'home') up += 1;
    else if (w === 'away') up -= 1;
    played += 1;
    const remaining = Math.max(0, regulation - played);
    if (played < regulation) decided = Math.abs(up) > remaining; // closed out
    else if (played === regulation) decided = up !== 0 || !extraHoles;
    else decided = up !== 0; // extra holes: first hole won ends it
  }
  const remaining = Math.max(0, regulation - played);
  const lead = Math.abs(up);
  const leader = up > 0 ? 'home' : up < 0 ? 'away' : null;
  let winner: MatchState['winner'] = null;
  let result: string | null = null;
  if (decided) {
    if (lead === 0) { winner = 'halved'; result = 'Halved'; }
    else {
      winner = leader;
      if (played > regulation) result = `Won at the ${ordinal(played)}`;
      else if (remaining > 0) result = `${lead}&${remaining}`;
      else result = `${lead} UP`;
    }
  }
  const dormie = !decided && lead > 0 && lead === remaining;
  const status = decided ? (result ?? '') : lead === 0 ? 'AS' : dormie ? `Dormie ${lead}` : `${lead} UP`;
  return { up, played, remaining, status, leader, dormie, decided, winner, result };
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]} hole`;
};

/** Match-play handicap strokes: the higher playing handicap receives the
 *  difference, allocated by stroke index. Returns per-hole strokes for each side. */
export function matchPlayStrokes(homePH: number, awayPH: number, holes: Hole[]): { home: number[]; away: number[] } {
  const diff = homePH - awayPH;
  const zero = holes.map(() => 0);
  if (diff === 0) return { home: zero, away: zero };
  return diff > 0
    ? { home: strokesReceived(diff, holes), away: zero }
    : { home: zero, away: strokesReceived(-diff, holes) };
}

/* -------------------------------- stats --------------------------------- */

/** Per-round stat line (credited to the player's profile). */
export function roundStats(card: GolfCard, holes: Hole[], received: number[]): Record<string, number> {
  const s = summarize(card, holes, received);
  const out: Record<string, number> = {
    rounds: 1, holes: s.thru, strokes: s.gross, stableford: s.stableford,
    eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0,
    putts: 0, puttHoles: 0, girHit: 0, girHoles: 0, firHit: 0, firHoles: 0, penalties: 0,
  };
  // An 18-hole-equivalent stroke total, only for complete rounds with no pickup.
  if (s.complete && !s.noReturn) { out.toPar = s.toPar; out.completeRounds = 1; out.completeStrokes = s.gross * (18 / holes.length); }
  holes.forEach((h, i) => {
    const st = card.strokes[i];
    if (typeof st === 'number') {
      const d = st - h.par;
      if (d <= -2) out.eagles += 1;
      else if (d === -1) out.birdies += 1;
      else if (d === 0) out.pars += 1;
      else if (d === 1) out.bogeys += 1;
      else out.doubles += 1;
    }
    const p = card.putts?.[i];
    if (typeof p === 'number') { out.putts += p; out.puttHoles += 1; }
    const g = card.gir?.[i];
    if (g != null) { out.girHoles += 1; if (g) out.girHit += 1; }
    const f = card.fir?.[i];
    if (f != null && h.par >= 4) { out.firHoles += 1; if (f) out.firHit += 1; }
    const pen = card.penalties?.[i];
    if (typeof pen === 'number') out.penalties += pen;
  });
  return out;
}

/** Profile headline figures from a player's golf stat lines, compared like
 *  for like:
 *  - `best18` / `best9`: lowest gross over COMPLETE rounds (no pickup) of 18 and
 *    of 9 holes respectively — a 9-hole 40 is never "better" than an 18-hole 75;
 *  - `puttsPerRound`: putts per 18 holes over only the holes where putts were
 *    entered (`puttHoles`; older lines without it count a round as tracked when
 *    it has any putts), so rounds without putts don't drag the average down. */
export function golfProfileSummary(lines: Array<{ stats: Record<string, number> }>): { best18: number | null; best9: number | null; puttsPerRound: number | null } {
  const best = (n: number) => {
    const xs = lines.filter((l) => l.stats.completeRounds && l.stats.holes === n).map((l) => l.stats.strokes);
    return xs.length ? Math.min(...xs) : null;
  };
  let putts = 0, holes = 0;
  for (const { stats: s } of lines) {
    const tracked = s.puttHoles ?? ((s.putts ?? 0) > 0 ? s.holes ?? 0 : 0);
    if (tracked > 0) { putts += s.putts ?? 0; holes += tracked; }
  }
  return { best18: best(18), best9: best(9), puttsPerRound: holes ? (putts / holes) * 18 : null };
}

/** Scoring average (18-hole equivalent) from summed stat totals. */
export const scoringAverage = (t: Record<string, number>): number | null =>
  t.completeRounds ? t.completeStrokes / t.completeRounds : null;
