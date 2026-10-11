/**
 * SD-95 — archery match play (World Archery), pure; imported by rank.ts.
 *
 *  - the bracket is derived from the rows: each bracket row carries its
 *    ranking-round `seed` and its side of every match it shot (`mp`, keyed by
 *    round — '1' … the gold match, 'B' the bronze match). Nothing about who
 *    plays whom is stored, so a corrected end re-derives every later match.
 *  - seeding (WA): the standard bracket positions — 1 v 8, 4 v 5, 2 v 7, 3 v 6
 *    for 8 (1 v 64 … for 64); a field short of a power of two gives the top
 *    seeds byes.
 *  - a match: recurve / barebow set system (ends of 3, 2 set points for the
 *    higher end, 1 each for a tie, first to 6; 5–5 → one-arrow shoot-off), or
 *    compound cumulative (5 ends of 3, higher total; level → shoot-off). A
 *    shoot-off: the higher arrow wins; level → the arrow closest to the centre
 *    (the judge's call — `closer`); still not separable → another arrow.
 *  - places: gold / silver from the gold match, bronze / 4th from the bronze
 *    match; archers out in the same earlier round share a place (quarter-final
 *    losers 5th, 1/8 losers 9th …).
 */
import type { ArchSide, DisciplineDef, RankedEntry, ResultEntry, ResultFlag, ResultStatus } from './model.ts';
import { STATUS_ORDER } from './model.ts';
import { archRoundOf, arrowValue, endSum, matchFormatOf, MATCH_ARROWS, MATCH_ENDS, SET_WIN, type ArchMatchFormat, type Arrow } from './archeryDefs.ts';

/** Is this a phase of match play (bracket rows carry `mp`)? */
export const isBracketRows = (entries: ResultEntry[]): boolean => entries.some((e) => e.result?.mp != null);

/** The bracket for `n` archers: the next power of two (at least 2). */
export function bracketSize(n: number): number {
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

/** The standard seed at each bracket line: 8 → [1, 8, 4, 5, 2, 7, 3, 6] (pairs play). */
export function seedPositions(size: number): number[] {
  let seeds = [1];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    seeds = seeds.flatMap((s) => [s, sum - s]);
  }
  return seeds;
}

/** "Gold medal match", "Semi-final", "Quarter-final", "1/8 elimination" … */
export function roundLabel(round: number | 'B', rounds: number): string {
  if (round === 'B') return 'Bronze medal match';
  const left = rounds - round;
  if (left === 0) return 'Gold medal match';
  if (left === 1) return 'Semi-final';
  if (left === 2) return 'Quarter-final';
  return `1/${2 ** left} elimination`;
}
export const roundShort = (round: number | 'B', rounds: number): string => {
  if (round === 'B') return 'Bronze';
  const left = rounds - round;
  return left === 0 ? 'Gold' : left === 1 ? 'SF' : left === 2 ? 'QF' : `1/${2 ** left}`;
};

/* ---------------------------------- a match --------------------------------- */

export interface EndScore { a: number; b: number; pa: number; pb: number }
export interface MatchOutcome {
  /** ends both archers have shot (3 arrows each), with the set points they earned */
  ends: EndScore[];
  /** set points (sets) or totals (cumulative) */
  a: number;
  b: number;
  /** arrow totals over the ends */
  ta: number;
  tb: number;
  winner?: 'a' | 'b';
  /** level after the regulation ends → shoot-off */
  shootOff: boolean;
  /** shoot-off: the next thing the scorer must enter (round is 1-based) */
  soNeed?: { round: number; kind: 'arrows' | 'closer' };
  /** the shoot-off round that decided it, and whether by "closest to the centre" */
  soWon?: { round: number; closer: boolean };
  /** won because the other archer didn't start / withdrew / was disqualified */
  walkover?: boolean;
  /** the next end to shoot (1-based) while the match is on */
  nextEnd?: number;
  done: boolean;
}

const fullEnds = (s?: ArchSide): Arrow[][] => (s?.ends ?? []).filter((e) => e && e.length >= MATCH_ARROWS);

/** One match from both sides' arrows. `okA` / `okB` = still competing (no DNS / WD / DQ). */
export function matchOutcome(A: ArchSide | undefined, B: ArchSide | undefined, fmt: ArchMatchFormat, okA = true, okB = true): MatchOutcome {
  const base: MatchOutcome = { ends: [], a: 0, b: 0, ta: 0, tb: 0, shootOff: false, done: false };
  okA = okA && !A?.wo; okB = okB && !B?.wo;
  if (!okA || !okB) return { ...base, done: true, walkover: true, ...(okA ? { winner: 'a' as const } : okB ? { winner: 'b' as const } : {}) };
  const ea = fullEnds(A), eb = fullEnds(B);
  const n = Math.min(ea.length, eb.length, MATCH_ENDS);
  const o = { ...base };
  for (let k = 0; k < n; k++) {
    const sa = endSum(ea[k]), sb = endSum(eb[k]);
    const pa = sa > sb ? 2 : sa === sb ? 1 : 0;
    const pb = 2 - pa;
    o.ends.push({ a: sa, b: sb, pa, pb });
    o.ta += sa; o.tb += sb;
    if (fmt === 'sets') {
      o.a += pa; o.b += pb;
      if (o.a >= SET_WIN || o.b >= SET_WIN) break;
    }
  }
  if (fmt === 'cumulative') { o.a = o.ta; o.b = o.tb; }
  if (fmt === 'sets') {
    if (o.a >= SET_WIN && o.a > o.b) return { ...o, winner: 'a', done: true };
    if (o.b >= SET_WIN && o.b > o.a) return { ...o, winner: 'b', done: true };
  }
  if (o.ends.length < MATCH_ENDS) return { ...o, nextEnd: o.ends.length + 1 };
  if (fmt === 'cumulative' && o.a !== o.b) return { ...o, winner: o.a > o.b ? 'a' : 'b', done: true };
  // level after 5 ends (5–5 / equal totals): one-arrow shoot-offs
  o.shootOff = true;
  for (let j = 0; ; j++) {
    const va = A?.so?.[j], vb = B?.so?.[j];
    if (va == null || vb == null) return { ...o, soNeed: { round: j + 1, kind: 'arrows' } };
    const x = arrowValue(va), y = arrowValue(vb);
    if (x !== y) return finishSo(o, x > y ? 'a' : 'b', j, false, fmt);
    const ca = !!A?.closer?.[j], cb = !!B?.closer?.[j];
    if (ca !== cb) return finishSo(o, ca ? 'a' : 'b', j, true, fmt);
    if (A?.so?.[j + 1] == null && B?.so?.[j + 1] == null) return { ...o, soNeed: { round: j + 1, kind: 'closer' } };
  }
}

function finishSo(o: MatchOutcome, w: 'a' | 'b', j: number, closer: boolean, fmt: ArchMatchFormat): MatchOutcome {
  // sets: the shoot-off winner takes the match 6–5
  const pts = fmt === 'sets' ? { a: o.a + (w === 'a' ? 1 : 0), b: o.b + (w === 'b' ? 1 : 0) } : {};
  return { ...o, ...pts, winner: w, done: true, soWon: { round: j + 1, closer } };
}

/** "6–4", "6–5 (SO 10*–10)", "146–143", "w/o". From A's side unless `flip`. */
export function outcomeText(o: MatchOutcome, A?: ArchSide, B?: ArchSide, flip = false): string {
  if (o.walkover) return 'w/o';
  const [x, y] = flip ? [o.b, o.a] : [o.a, o.b];
  let t = `${x}–${y}`;
  if (o.shootOff && (A?.so?.length || B?.so?.length)) {
    const n = Math.max(A?.so?.length ?? 0, B?.so?.length ?? 0);
    const one = (s: ArchSide | undefined, j: number) => `${s?.so?.[j] ?? '–'}${s?.closer?.[j] ? '*' : ''}`;
    const rounds = Array.from({ length: n }, (_, j) => (flip ? `${one(B, j)}–${one(A, j)}` : `${one(A, j)}–${one(B, j)}`));
    t += ` (SO ${rounds.join(', ')})`;
  }
  return t;
}

/* ---------------------------------- bracket --------------------------------- */

export interface BMatch {
  /** the `mp` key: '1' … String(rounds) (gold), 'B' (bronze) */
  key: string;
  round: number | 'B';
  slot: number;
  label: string;
  a?: string;
  b?: string;
  /** both archers are known (the feeding matches are decided) */
  known: boolean;
  /** one side has nobody (a bye, or a walkover further back) */
  bye: boolean;
  out?: MatchOutcome;
  winner?: string;
  loser?: string;
  /** decided (a played match, a bye, or an empty slot) */
  decided: boolean;
}

export interface BracketState {
  size: number;
  rounds: number;
  /** by round, slot; the bronze match before the gold match */
  matches: BMatch[];
  places: Map<string, { place: number; tie: boolean }>;
  /** the next match to shoot (earliest round first, bronze before gold) */
  current?: BMatch;
  done: boolean;
  fmt: ArchMatchFormat;
}

const competing = (e?: ResultEntry) => !!e && !['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok');

/** The match format of a bracket's discipline (sets for recurve / barebow, cumulative for compound). */
export const bracketFormat = (def: Pick<DisciplineDef, 'key'>): ArchMatchFormat => matchFormatOf(archRoundOf(def.key)?.bow ?? 'R');

/** SD-98: how one match is decided — archery by default; the track sprint
 *  (cycling.ts `sprintMatch`) passes its best-of-three heats. */
export type MatchFn = (A: ArchSide | undefined, B: ArchSide | undefined, okA: boolean, okB: boolean) => MatchOutcome;

/** Where the bracket stands (pure — from the rows' seeds and match sides). */
export function bracketState(entries: ResultEntry[], fmt: ArchMatchFormat, match?: MatchFn): BracketState {
  const rows = entries.filter((e) => e.result?.mp != null && e.result.seed != null);
  const bySeed = new Map(rows.map((e) => [e.result.seed!, e]));
  const byId = new Map(rows.map((e) => [e.id, e]));
  const maxSeed = Math.max(0, ...rows.map((e) => e.result.seed!));
  const size = bracketSize(Math.max(2, maxSeed));
  const rounds = Math.round(Math.log2(size));
  const pos = seedPositions(size);
  const matches: BMatch[] = [];
  const play = (key: string, round: number | 'B', slot: number, a: string | undefined, b: string | undefined, known: boolean): BMatch => {
    const m: BMatch = { key, round, slot, label: roundLabel(round, rounds), a, b, known, bye: false, decided: false };
    if (!known) return m;
    if (!a || !b) {
      m.bye = true; m.decided = true; m.winner = a ?? b;
      return m;
    }
    const ea = byId.get(a), eb = byId.get(b);
    m.out = match ? match(ea?.result.mp?.[key], eb?.result.mp?.[key], competing(ea), competing(eb)) : matchOutcome(ea?.result.mp?.[key], eb?.result.mp?.[key], fmt, competing(ea), competing(eb));
    if (m.out.done) {
      m.decided = true;
      if (m.out.winner) { m.winner = m.out.winner === 'a' ? a : b; m.loser = m.out.winner === 'a' ? b : a; }
      else m.loser = undefined; // both out: nobody goes through
    }
    return m;
  };
  let prev: BMatch[] = [];
  for (let r = 1; r <= rounds; r++) {
    const cur: BMatch[] = [];
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      if (r === 1) cur.push(play('1', 1, i, bySeed.get(pos[2 * i])?.id, bySeed.get(pos[2 * i + 1])?.id, true));
      else {
        const f1 = prev[2 * i], f2 = prev[2 * i + 1];
        cur.push(play(String(r), r, i, f1.winner, f2.winner, f1.decided && f2.decided));
        // show who is already through while the other side is still playing
        const m = cur[cur.length - 1];
        if (!m.known) { m.a = f1.decided ? f1.winner : undefined; m.b = f2.decided ? f2.winner : undefined; }
      }
    }
    if (r === rounds && rounds >= 2) {
      // the bronze match: the semi-final losers (a semi-final bye or walkover leaves a gap)
      const [s1, s2] = prev;
      const bm = play('B', 'B', 0, s1.loser, s2.loser, s1.decided && s2.decided);
      if (!bm.known) { bm.a = s1.decided ? s1.loser : undefined; bm.b = s2.decided ? s2.loser : undefined; }
      matches.push(bm);
    }
    matches.push(...cur);
    prev = cur;
  }
  // places
  const places = new Map<string, { place: number; tie: boolean }>();
  const set = (id: string | undefined, place: number) => { if (id && competing(byId.get(id))) places.set(id, { place, tie: false }); };
  const gold = matches.find((m) => m.round === rounds);
  const bronze = matches.find((m) => m.round === 'B');
  if (gold?.decided) { set(gold.winner, 1); set(gold.loser, 2); }
  if (bronze?.decided) { set(bronze.winner, 3); set(bronze.loser, 4); }
  if (rounds === 1 && gold?.decided) { /* a final only */ }
  for (const m of matches) {
    if (typeof m.round !== 'number' || m.round > rounds - 2 || !m.decided || !m.loser) continue;
    set(m.loser, size / 2 ** m.round + 1);
  }
  const count = new Map<number, number>();
  for (const p of places.values()) count.set(p.place, (count.get(p.place) ?? 0) + 1);
  for (const p of places.values()) p.tie = (count.get(p.place) ?? 0) > 1;
  const order = (m: BMatch) => (m.round === 'B' ? rounds - 0.5 : m.round);
  const current = [...matches].sort((x, y) => order(x) - order(y) || x.slot - y.slot).find((m) => m.known && !m.bye && !m.decided);
  const done = !!gold?.decided && (!bronze || bronze.decided);
  return { size, rounds, matches, places, current, done, fmt };
}

/** Each archer's opponent in each match (mp key → the other id, '' = not known yet) — for spotting stale scores after a correction. */
function participation(st: BracketState): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const m of st.matches) {
    if (m.a) (out.get(m.a) ?? out.set(m.a, new Map()).get(m.a)!).set(m.key, m.b ?? '');
    if (m.b) (out.get(m.b) ?? out.set(m.b, new Map()).get(m.b)!).set(m.key, m.a ?? '');
  }
  return out;
}

const hasData = (s?: ArchSide) => !!s && ((s.ends?.length ?? 0) > 0 || (s.so?.length ?? 0) > 0 || !!s.wo || (s.heats?.length ?? 0) > 0);

/**
 * After a correction (`entries` = the rows with it applied; `before` = as they
 * were): the match scores that no longer belong — the archer isn't in that
 * match any more, or now faces a different opponent there (their ends were shot
 * against someone else). Clearing them keeps the bracket honest; the UI asks first.
 */
export function staleMatchData(entries: ResultEntry[], fmt: ArchMatchFormat, before?: ResultEntry[], match?: MatchFn): { id: string; keys: string[] }[] {
  const now = participation(bracketState(entries, fmt, match));
  const was = before ? participation(bracketState(before, fmt, match)) : null;
  const out: { id: string; keys: string[] }[] = [];
  for (const e of entries) {
    const keys = Object.entries(e.result?.mp ?? {}).filter(([k, s]) => {
      if (!hasData(s)) return false;
      const opp = now.get(e.id)?.get(k);
      if (opp == null) return true;
      const old = was?.get(e.id)?.get(k);
      // shot against someone who is no longer the opponent (now another archer, or nobody known yet)
      return old != null && old !== '' && old !== opp;
    }).map(([k]) => k);
    if (keys.length) out.push({ id: e.id, keys });
  }
  return out;
}

/** Any match score on a bracket row? */
export const hasMatchData = (r?: { mp?: Record<string, ArchSide> } | null): boolean => !!r?.mp && Object.values(r.mp).some(hasData);

/** Rank match play: places from the bracket, the archers still in (by seed), then DNS / WD / DQ. */
export function rankArcheryBracket(entries: ResultEntry[], def: DisciplineDef, match?: MatchFn): RankedEntry[] {
  const st = bracketState(entries, bracketFormat(def), match);
  const out: RankedEntry[] = [];
  const lastText = (id: string): string => {
    const mine = st.matches.filter((m) => m.out && !m.bye && (m.a === id || m.b === id) && (m.out.ends.length || m.out.walkover || m.out.done));
    const m = mine[mine.length - 1];
    if (!m?.out) return '';
    // short for the sheet's score column ("W 6–5"); the full line (rounds, shoot-offs) is the detail
    const flip = m.b === id;
    const wl = m.decided ? (m.winner === id ? 'W ' : 'L ') : '';
    return `${wl}${m.out.walkover ? 'w/o' : flip ? `${m.out.b}–${m.out.a}` : `${m.out.a}–${m.out.b}`}`;
  };
  const make = (e: ResultEntry, position: number | null, tie: boolean, status: ResultStatus, flags: ResultFlag[] = []): RankedEntry => ({
    id: e.id, entry: e, position, label: position != null ? `${tie ? '=' : ''}${position}` : status !== 'ok' ? status : '', tie, status,
    best: null, bestText: lastText(e.id), legal: false, bestLegal: null, flags,
  });
  const rows = entries.filter((e) => e.result?.mp != null);
  const soIds = new Set(st.matches.filter((m) => m.out?.soNeed).flatMap((m) => [m.a, m.b]));
  // the archers still in sit at the best place they can still reach (1st, or 3rd in the bronze match), above anyone placed below that
  const bronze = st.matches.find((m) => m.key === 'B');
  const inBronze = (id: string) => !!bronze && (bronze.a === id || bronze.b === id);
  const key = (e: ResultEntry) => st.places.get(e.id)?.place ?? (inBronze(e.id) ? 2.5 : 0.5);
  const ok = rows.filter(competing).sort((a, b) => key(a) - key(b) || (a.result.seed ?? 99) - (b.result.seed ?? 99));
  for (const e of ok) {
    const p = st.places.get(e.id);
    out.push(p ? make(e, p.place, p.tie, 'ok') : make(e, null, false, 'ok', soIds.has(e.id) ? ['SO'] : []));
  }
  const unranked = rows.filter((e) => !competing(e)).sort((a, b) => STATUS_ORDER[(a.result.status ?? 'ok') as ResultStatus] - STATUS_ORDER[(b.result.status ?? 'ok') as ResultStatus]);
  for (const e of unranked) out.push(make(e, null, false, (e.result.status ?? 'ok') as ResultStatus));
  return out;
}
