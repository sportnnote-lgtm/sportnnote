/**
 * Rounds and progression: Q (by place in each heat, or by a qualifying
 * standard) and q (the best of the rest across all heats), the top-8 who get
 * three more attempts in a field final, attempt order, and seeding the next
 * round's heats and lanes. Pure.
 */
import type { DisciplineDef, Progression, RankedEntry, ResultEntry } from './model.ts';
import { performanceOf, rankEntries, betterMark, levelKeys } from './rank.ts';
import { compareKeys, topNAndTies } from './positions.ts';

export interface Qualification {
  /** entry id → 'Q' (place / standard) or 'q' (best of the rest) */
  marks: Map<string, 'Q' | 'q'>;
  /** entries that went through on a tie at the last spot (the referee may need a
   *  draw / swim-off / extra lane) */
  tieAtLine: string[];
}

const keysOf = (r: RankedEntry, def: DisciplineDef) => performanceOf(r.entry, def).keys;

/**
 * Who goes through from a round. `byHeat` = each heat's ranking (rankByHeat).
 * Ties at the last Q place in a heat, or the last q spot, all go through and are
 * listed in `tieAtLine` (World Athletics TR 21: a draw decides only if there
 * aren't enough lanes — that's the referee's call, not the engine's).
 */
export function qualify(byHeat: Map<number, RankedEntry[]>, def: DisciplineDef, prog: Progression): Qualification {
  const marks = new Map<string, 'Q' | 'q'>();
  const tieAtLine: string[] = [];
  const all: RankedEntry[] = [];
  for (const rows of byHeat.values()) {
    const ranked = rows.filter((r) => r.position != null);
    all.push(...ranked);
    if (prog.byPlace) {
      const through = ranked.filter((r) => (r.position as number) <= prog.byPlace!);
      for (const r of through) marks.set(r.id, 'Q');
      if (through.length > prog.byPlace) tieAtLine.push(...through.filter((r) => r.position === through[through.length - 1].position).map((r) => r.id));
    }
  }
  if (prog.standard != null) {
    for (const r of all) if (r.best != null && (r.best === prog.standard || betterMark(r.best, prog.standard, def))) marks.set(r.id, 'Q');
  }
  const qCount = prog.byMark ?? (prog.fillTo != null ? Math.max(0, prog.fillTo - marks.size) : 0);
  if (qCount > 0) {
    const keys = new Map(all.filter((r) => !marks.has(r.id)).map((r) => [r.id, performanceOf(r.entry, def)]));
    // SD-94: a swim-off (SW 3.2.3) separates equal times for the last places through.
    if (def.tie === 'stands') for (const r of all) { const p = keys.get(r.id); if (p) p.keys = [...p.keys, r.entry.result?.decider != null ? -r.entry.result.decider : undefined]; }
    levelKeys([...keys.values()]);
    const k = (r: RankedEntry) => keys.get(r.id)!.keys;
    const rest = all.filter((r) => keys.has(r.id)).sort((a, b) => compareKeys(k(a), k(b)));
    const same = (a: RankedEntry, b: RankedEntry) => compareKeys(k(a), k(b)) === 0;
    const through = topNAndTies(rest, qCount, same);
    for (const r of through) marks.set(r.id, 'q');
    if (through.length > qCount) tieAtLine.push(...through.filter((r) => same(r, through[qCount - 1])).map((r) => r.id));
  }
  return { marks, tieAtLine };
}

/** Add the Q / q flags to a ranking (a copy). */
export function withQualification(rows: RankedEntry[], q: Qualification): RankedEntry[] {
  return rows.map((r) => {
    const m = q.marks.get(r.id);
    return m ? { ...r, flags: [m, ...r.flags.filter((f) => f !== 'Q' && f !== 'q')] } : r;
  });
}

/**
 * Field final: who gets the extra attempts (World Athletics TR 25.5: the best
 * eight after three rounds, plus anyone tied for 8th; with eight or fewer
 * athletes, everyone who started). Countback applies when ranking after three.
 */
export function fieldFinalists(entries: ResultEntry[], def: DisciplineDef): Set<string> {
  const a = def.attempts;
  const competing = entries.filter((e) => !['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok'));
  if (!a?.finalists || !a.extra) return new Set();
  if (competing.length <= a.finalists) return new Set(competing.map((e) => e.id));
  const ranked = rankEntries(competing, def, { upToAttempt: a.count }).filter((r) => r.position != null);
  return new Set(topNAndTies(ranked, a.finalists, (x, y) => x.position === y.position).map((r) => r.id));
}

/** Has every finalist-eligible athlete taken their first `count` attempts? */
export function firstRoundsDone(entries: ResultEntry[], def: DisciplineDef): boolean {
  const n = def.attempts?.count ?? 3;
  return entries
    .filter((e) => !['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok'))
    .every((e) => (e.result?.attempts ?? []).slice(0, n).filter((x) => x.foul || x.pass || x.mark != null).length >= n);
}

/**
 * Who jumps / throws in what order in round `round` (1-based). Rounds 1 … count:
 * the drawn start order. Rounds 4 and 5: the finalists in REVERSE order of the
 * ranking after `count` rounds; the last round (6): reverse order of the
 * ranking after round 5 (World Athletics TR 25.6 — the leader goes last).
 */
export function attemptOrder(entries: ResultEntry[], def: DisciplineDef, round: number): ResultEntry[] {
  const count = def.attempts?.count ?? 3;
  const last = count + (def.attempts?.extra ?? 0);
  const byStart = [...entries].sort((a, b) => (a.result?.order ?? 999) - (b.result?.order ?? 999));
  if (round <= count) return byStart;
  const finalists = fieldFinalists(entries, def);
  const after = round === last && last > count + 1 ? last - 1 : count;
  const ranked = rankEntries(entries.filter((e) => finalists.has(e.id)), def, { upToAttempt: after });
  return ranked.map((r) => r.entry).reverse();
}

/* ------------------------------ seeding ---------------------------------- */

/**
 * Lane preference for a ranked list. Eight lanes follow the World Athletics
 * groups (TR 20.4.4 for 200 m and up; also used for the 100 m here): ranks
 * 1–4 → lanes 3–6, ranks 5–6 → lanes 7–8, ranks 7–8 → lanes 1–2. The 800 m
 * (TR 20.4.5) draws ranks 1–5 into lanes 3–7 and ranks 6–8 into 1, 2 and 8.
 * The lanes inside a group are DRAWN; pass `rng` to draw, else a fixed order
 * (best in lane 4) is used. Other lane counts go middle-out.
 */
export function laneOrder(lanes: number, rng?: () => number, discipline?: string): number[] {
  const shuffle = (xs: number[]) => {
    if (!rng) return xs;
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  if (lanes === 8 && discipline === 'ath.800m') return [...shuffle([4, 5, 3, 6, 7]), ...shuffle([2, 1, 8])];
  if (lanes === 8) return [...shuffle([4, 5, 3, 6]), ...shuffle([7, 8]), ...shuffle([2, 1])];
  const mid = Math.ceil(lanes / 2);
  const out: number[] = [mid];
  for (let d = 1; out.length < lanes; d++) {
    if (mid + d <= lanes) out.push(mid + d);
    if (mid - d >= 1 && out.length < lanes) out.push(mid - d);
  }
  return out;
}

export interface Seeded { id: string; heat: number; lane?: number; order: number }

/**
 * Seed a ranked list (best first) into `heats` heats — serpentine, so each heat
 * gets a fair spread — and give lanes (lane races) or a running / attempt order.
 * `drawAll` (SD-90, World Athletics TR 20.4.3: the first round's lanes are
 * drawn): every athlete in a heat draws from the lanes the heat uses, with no
 * ranking groups — needs `rng`.
 */
export function seedHeats(rankedIds: string[], heats: number, def: DisciplineDef, rng?: () => number, opts: { drawAll?: boolean } = {}): Seeded[] {
  const n = Math.max(1, heats);
  const buckets: string[][] = Array.from({ length: n }, () => []);
  rankedIds.forEach((id, i) => {
    const round = Math.floor(i / n), k = i % n;
    buckets[round % 2 === 0 ? k : n - 1 - k].push(id);
  });
  const out: Seeded[] = [];
  buckets.forEach((ids, h) => {
    let lanes = def.lanes && def.capture === 'single' ? laneOrder(Math.max(def.lanes, ids.length), rng, def.key) : null;
    if (lanes && opts.drawAll && rng) {
      const used = lanes.slice(0, ids.length);
      for (let i = used.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [used[i], used[j]] = [used[j], used[i]]; }
      lanes = used;
    }
    ids.forEach((id, i) => out.push({ id, heat: h + 1, lane: lanes ? lanes[i] : undefined, order: i + 1 }));
  });
  return out;
}

/**
 * The next round's start list from a finished round: the qualifiers, Q before
 * q; Q ranked by heat place then mark, q by mark (TR 21.4 seeding), seeded into
 * `nextHeats` heats.
 */
export function nextRound(byHeat: Map<number, RankedEntry[]>, def: DisciplineDef, q: Qualification, nextHeats: number, rng?: () => number): Seeded[] {
  const rows = [...byHeat.values()].flat().filter((r) => q.marks.has(r.id));
  rows.sort((a, b) => {
    const qa = q.marks.get(a.id) === 'Q' ? 0 : 1, qb = q.marks.get(b.id) === 'Q' ? 0 : 1;
    if (qa !== qb) return qa - qb;
    if (qa === 0 && a.position !== b.position) return (a.position ?? 99) - (b.position ?? 99);
    return compareKeys(keysOf(a, def), keysOf(b, def));
  });
  return seedHeats(rows.map((r) => r.id), nextHeats, def, rng);
}
