/**
 * Cricket scorecard depth (parity #19) — PURE selectors over the reducer's
 * derived ball log (`state.log`): extras breakdown, fall of wickets,
 * partnerships, over history (Manhattan / worm), maidens / wides / no-balls per
 * bowler, and `statTotals` — the absolute per-player match figures the stat
 * sync writes at completion and on a correction.
 *
 * A persisted snapshot has no `log` (it is rebuilt by replaying the event log),
 * so every selector degrades to an empty result and the UI hides those rows.
 * No React Native imports — node tests load this file (note the `.ts` imports).
 */
import { oversStr, other, type BallRec, type CricketState } from './engine.ts';

type Side = 'home' | 'away';

/** Does this state carry a ball log (i.e. was it rebuilt by replay)? */
export const hasLog = (s: Pick<CricketState, 'log'>): boolean => Array.isArray(s.log);

const recs = (s: Pick<CricketState, 'log'>, side: Side): BallRec[] => (s.log ?? []).filter((r) => r.side === side);

/** Dismissals that are a wicket (retired hurt ends a partnership but isn't one). */
const isWicket = (r: BallRec) => !!r.out && r.out.kind !== 'retired';

/** A real delivery (chip in the over strip) — not a penalty, retirement or Mankad. */
const isDelivery = (r: BallRec) => r.sym !== undefined && r.out?.kind !== 'mankad';

/** Runs the bowler is charged on this ball (mirrors BowlCard: never byes, leg byes or penalties). */
export const charged = (r: BallRec) => r.bat + r.wd + r.nb;

/** Team runs on this ball, extras included. */
const teamRuns = (r: BallRec) => r.bat + r.wd + r.nb + r.b + r.lb + (r.pen ?? 0);

export interface Extras { b: number; lb: number; wd: number; nb: number; pen: number }

/** Byes, leg byes, wides, no-balls and penalty runs conceded while `side` batted. */
export function extrasBreakdown(s: Pick<CricketState, 'log'>, side: Side): Extras {
  const out: Extras = { b: 0, lb: 0, wd: 0, nb: 0, pen: 0 };
  for (const r of recs(s, side)) {
    out.b += r.b; out.lb += r.lb; out.wd += r.wd; out.nb += r.nb; out.pen += r.pen ?? 0;
  }
  return out;
}

/** "b 1, lb 2, wd 6, nb 3" — only the non-zero parts ('' when none). */
export function extrasText(e: Extras): string {
  return ([['b', e.b], ['lb', e.lb], ['wd', e.wd], ['nb', e.nb], ['pen', e.pen]] as const)
    .filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ');
}

export interface FallOfWicket { n: number; runs: number; overs: string; name: string }

/** Each wicket in order: "1-12 (Asha, 2.3 ov)". Retired hurt isn't a wicket. */
export function fallOfWickets(s: Pick<CricketState, 'log' | 'ballsPerOver'>, side: Side): FallOfWicket[] {
  return recs(s, side).filter(isWicket).map((r) => ({ n: r.tw, runs: r.tr, overs: oversStr(r.lb6, s.ballsPerOver), name: r.out!.name }));
}

export const fowText = (f: FallOfWicket[]): string => f.map((w) => `${w.n}-${w.runs} (${w.name}, ${w.overs} ov)`).join(', ');

export interface Partnership {
  /** for the Nth wicket (a retired-hurt break keeps the same N) */
  wkt: number;
  runs: number;
  balls: number;
  a: { id?: string; name: string; runs: number; balls: number };
  b: { id?: string; name: string; runs: number; balls: number };
  unbroken: boolean;
}

/** Partnerships in order. One breaks at every dismissal (incl. retired hurt)
 *  or when the pair at the crease changes. `runs`/`balls` are the team's
 *  (extras included, legal balls); each batter's share is runs off the bat and
 *  balls faced (a no-ball is faced, a wide is not). */
export function partnerships(s: Pick<CricketState, 'log' | 'batting'>, side: Side): Partnership[] {
  const out: Partnership[] = [];
  const nameOf = (id?: string) => (id ? s.batting[id]?.name : undefined) || 'Batter';
  let cur: Partnership | null = null;
  let wkts = 0;
  const start = (r: BallRec): Partnership => ({
    wkt: wkts + 1, runs: 0, balls: 0, unbroken: true,
    a: { id: r.strikerId, name: nameOf(r.strikerId), runs: 0, balls: 0 },
    b: { id: r.nonStrikerId, name: nameOf(r.nonStrikerId), runs: 0, balls: 0 },
  });
  const samePair = (p: Partnership, r: BallRec) => {
    const ids = new Set([p.a.id, p.b.id]);
    return ids.has(r.strikerId) && ids.has(r.nonStrikerId);
  };
  for (const r of recs(s, side)) {
    if (cur && !samePair(cur, r)) { out.push(cur); cur = null; } // a substitution without a dismissal
    if (!cur) cur = start(r);
    cur.runs += teamRuns(r);
    if (r.legal) cur.balls += 1;
    const who = r.strikerId === cur.a.id ? cur.a : r.strikerId === cur.b.id ? cur.b : null;
    if (who) {
      who.runs += r.bat;
      // faced: any legal ball that isn't a wide, and every no-ball
      if (r.ext === 'nb' || (r.legal && r.ext !== 'wd' && isDelivery(r))) who.balls += 1;
    }
    if (r.out) {
      cur.unbroken = false;
      out.push(cur);
      cur = null;
      if (isWicket(r)) wkts = r.tw;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export interface OverRow {
  /** 1-based over number */
  over: number;
  bowlerName: string;
  /** team runs in the over (Manhattan) */
  runs: number;
  wkts: number;
  syms: string[];
  /** team total at the end of the over (worm) */
  cum: number;
  /** wickets down at the end of the over ("54/2") */
  cumW: number;
}

/** 0-based over each record belongs to. Wides / no-balls belong to the over in
 *  progress; a penalty or retirement (no chip) to the over of the last chip. */
function overIndexes(list: BallRec[], bpo: number): number[] {
  let last = 0;
  return list.map((r) => {
    if (r.sym === undefined) return last;
    last = r.legal ? Math.floor((r.lb6 - 1) / bpo) : Math.floor(r.lb6 / bpo);
    return last;
  });
}

/** Over-by-over history of `side`'s innings. */
export function overHistory(s: Pick<CricketState, 'log' | 'ballsPerOver'>, side: Side): OverRow[] {
  const list = recs(s, side);
  const ix = overIndexes(list, s.ballsPerOver);
  const rows = new Map<number, OverRow & { bowlers: string[] }>();
  list.forEach((r, i) => {
    let row = rows.get(ix[i]);
    if (!row) { row = { over: ix[i] + 1, bowlerName: '', bowlers: [], runs: 0, wkts: 0, syms: [], cum: 0, cumW: 0 }; rows.set(ix[i], row); }
    row.runs += teamRuns(r);
    if (isWicket(r)) row.wkts += 1;
    if (r.sym !== undefined) row.syms.push(r.sym);
    if (isDelivery(r) && r.bowlerName && !row.bowlers.includes(r.bowlerName)) row.bowlers.push(r.bowlerName);
    row.cum = r.tr;
    row.cumW = r.tw;
  });
  return [...rows.values()].sort((a, b) => a.over - b.over).map(({ bowlers, ...row }) => ({ ...row, bowlerName: bowlers.join(' / ') }));
}

export interface BowlerSplit { maidens: number; wides: number; noBalls: number }

/** Maidens, wides and no-balls per bowler id for the bowling side against
 *  `side`'s innings. A maiden is a complete over (`bpo` legal balls) bowled by
 *  ONE bowler with nothing charged to him (`bat + wd + nb = 0`; byes / leg byes
 *  don't spoil it). An over shared after a mid-over replacement is no maiden
 *  for either bowler. */
export function bowlerSplits(s: Pick<CricketState, 'log' | 'ballsPerOver'>, side: Side): Record<string, BowlerSplit> {
  const out: Record<string, BowlerSplit> = {};
  const get = (id: string) => (out[id] ??= { maidens: 0, wides: 0, noBalls: 0 });
  const list = recs(s, side);
  const ix = overIndexes(list, s.ballsPerOver);
  const overs = new Map<number, BallRec[]>();
  list.forEach((r, i) => {
    if (!isDelivery(r)) return;
    if (r.bowlerId) {
      if (r.ext === 'wd') get(r.bowlerId).wides += 1;
      if (r.ext === 'nb') get(r.bowlerId).noBalls += 1;
    }
    const o = overs.get(ix[i]) ?? [];
    o.push(r);
    overs.set(ix[i], o);
  });
  for (const balls of overs.values()) {
    const ids = new Set(balls.map((r) => r.bowlerId));
    const id = balls[0].bowlerId;
    if (!id || ids.size !== 1) continue;
    if (balls.filter((r) => r.legal).length < s.ballsPerOver) continue;
    if (balls.some((r) => charged(r) !== 0)) continue;
    get(id).maidens += 1;
  }
  return out;
}

/** The stat keys `statTotals` owns (absolute at sync time). */
export const CRICKET_TOTAL_KEYS = [
  'runs', 'ballsFaced', 'fours', 'sixes', 'innings', 'notOut',
  'wickets', 'ballsBowled', 'runsConceded', 'maidens', 'dots', 'wides', 'noBalls',
  'catches', 'stumpings', 'runouts',
] as const;

/** Absolute per-player match figures (regulation innings only — a Super Over is
 *  a tie-breaker and isn't counted in careers). Batting from BatCard (no-ball
 *  and run-out runs already right; `runsAs` respected), bowling from BowlCard
 *  plus `bowlerSplits`, fielding from `dismissals`. Maidens / wides / no-balls
 *  need the log; without it those keys are left out (never zeroed). */
export function statTotals(s: CricketState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  const entry = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const sideOfBatter = new Map<string, Side>();
  for (const [id, c] of Object.entries(s.batting)) {
    sideOfBatter.set(id, c.side);
    Object.assign(entry(id, c.side).stats, {
      runs: c.runs, ballsFaced: c.balls, fours: c.fours, sixes: c.sixes, innings: 1, notOut: c.out ? 0 : 1,
    });
  }
  const log = hasLog(s);
  const splits = { ...bowlerSplits(s, 'home'), ...bowlerSplits(s, 'away') };
  for (const [id, c] of Object.entries(s.bowling)) {
    // a bowler named but who never bowled a ball has no figures
    if (!c.balls && !c.runs && !c.wickets && !(c.overs?.length)) continue;
    const st = entry(id, c.side).stats;
    Object.assign(st, { wickets: c.wickets, ballsBowled: c.balls, runsConceded: c.runs, dots: c.dots });
    if (log) Object.assign(st, { maidens: splits[id]?.maidens ?? 0, wides: splits[id]?.wides ?? 0, noBalls: splits[id]?.noBalls ?? 0 });
  }
  const fielding: Record<string, { catches: number; stumpings: number; runouts: number; side?: Side }> = {};
  for (const d of s.dismissals) {
    const stat = d.kind === 'caught' ? 'catches' : d.kind === 'stumped' ? 'stumpings' : d.kind === 'runout' || d.kind === 'mankad' ? 'runouts' : null;
    if (!stat || !d.fielderId) continue;
    const f = (fielding[d.fielderId] ??= { catches: 0, stumpings: 0, runouts: 0 });
    f[stat] += 1;
    const outSide = d.outId ? sideOfBatter.get(d.outId) : undefined;
    if (outSide) f.side = other(outSide);
  }
  for (const [id, f] of Object.entries(fielding)) {
    const side = out[id]?.side ?? f.side ?? s.bowling[id]?.side;
    if (!side) continue;
    Object.assign(entry(id, side).stats, { catches: f.catches, stumpings: f.stumpings, runouts: f.runouts });
  }
  // Every involved player carries the fielding keys (0 when none), so a
  // correction that moves a catch away zeroes it.
  for (const e of Object.values(out)) for (const k of ['catches', 'stumpings', 'runouts']) e.stats[k] ??= 0;
  return out;
}
