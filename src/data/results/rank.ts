/**
 * Ranking for timed / measured events: the best mark by unit and direction,
 * then the discipline's tie rule (photo-finish thousandths, countback on the
 * next-best mark, high-jump failures, IWF "lifted first", 10s / X counts,
 * jump-off / shoot-off deciders), shared positions shown "=3", and the
 * unranked statuses (NM, DNF, FS, DQ, WD, DNS) listed below. Pure.
 */
import { STATUS_ORDER, type DisciplineDef, type RankedEntry, type ResultEntry, type ResultFlag, type ResultStatus } from './model.ts';
import { effectiveStatus, formatMark, summarizeAttempts, summarizeHeights, summarizeLifts, windLegal } from './marks.ts';
import { compareKeys, sharedPositions } from './positions.ts';

export interface Performance {
  status: ResultStatus;
  best: number | null;
  bestLegal: number | null;
  wind?: number;
  legal: boolean;
  /** comparison vector — bigger is better at every index; undefined = skip */
  keys: (number | undefined)[];
  flags: ResultFlag[];
}

export interface RankOptions {
  /** prefix for a shared place: '=' (athletics, default) or 'T' (golf) */
  tiePrefix?: string;
  /** field events: rank on the first N attempts only (the top-8 cut after 3) */
  upToAttempt?: number;
  /** SD-90: a hand-timed meet — hand times are record-legal (still flagged "h"),
   *  and a race with no wind reading counts (no gauge); a reading over the
   *  limit still doesn't */
  handLegal?: boolean;
}

const aided = (wind: number | undefined, def: DisciplineDef) => !!def.wind && wind != null && !windLegal(wind, def);

/** One entry's performance in its discipline. */
export function performanceOf(e: ResultEntry, def: DisciplineDef, upToAttempt?: number, handLegal?: boolean): Performance {
  const r = e.result ?? {};
  const sign = def.better === 'higher' ? 1 : -1;
  const decider = r.decider != null ? -r.decider : undefined;
  const status = effectiveStatus(r, def);
  const flags: ResultFlag[] = [];
  switch (def.capture) {
    case 'attempts': {
      const s = summarizeAttempts(r.attempts, def, upToAttempt);
      const slots = (def.attempts?.count ?? 3) + (def.attempts?.extra ?? 0);
      const series = [...s.valid.map((v) => sign * v)];
      while (series.length < slots) series.push(-Infinity);
      if (aided(s.bestWind, def)) flags.push('w');
      return { status, best: s.best, bestLegal: s.bestLegal, wind: s.bestWind, legal: s.best != null && s.best === s.bestLegal, keys: [...series, decider], flags };
    }
    case 'heights': {
      const h = summarizeHeights(r.heights);
      return { status, best: h.best, bestLegal: h.best, legal: h.best != null, keys: [h.best ?? -Infinity, -h.failsAtBest, -h.totalFails, decider], flags };
    }
    case 'lifts': {
      const l = summarizeLifts(r.lifts);
      return { status, best: l.total, bestLegal: l.total, legal: l.total != null, keys: [l.total ?? -Infinity, l.totalSeq != null ? -l.totalSeq : undefined], flags };
    }
    case 'target': {
      const best = r.mark ?? null;
      return { status, best, bestLegal: best, legal: best != null, keys: [best ?? -Infinity, r.tens, r.xs, decider], flags };
    }
    default: {
      const best = r.mark ?? null;
      // A hand-timed meet (SD-90) has no wind gauge either: no reading is accepted there.
      const legal = best != null && (!r.hand || !!handLegal) && (def.wind !== 'race' || windLegal(r.wind, def) || (!!handLegal && r.wind == null));
      if (best != null && def.wind === 'race' && aided(r.wind, def)) flags.push('w');
      if (best != null && r.hand) flags.push('h');
      const thou = def.tie === 'photo' && r.thousandths != null ? sign * r.thousandths : undefined;
      return { status, best, bestLegal: legal ? best : null, wind: r.wind, legal, keys: [best == null ? -Infinity : sign * best, thou, decider], flags };
    }
  }
}

/**
 * A tie-break key that only SOME of the rows level on the main mark have (a
 * thousandths reading, a jump-off place) can't separate any of them — else
 * x < y, x = z, y = z. Drop it for that whole group (in place), so the tie stands.
 */
export function levelKeys(perfs: { keys: (number | undefined)[] }[]): void {
  const byMain = new Map<number | undefined, { keys: (number | undefined)[] }[]>();
  for (const p of perfs) byMain.set(p.keys[0], [...(byMain.get(p.keys[0]) ?? []), p]);
  for (const group of byMain.values()) {
    if (group.length < 2) continue;
    const width = Math.max(...group.map((p) => p.keys.length));
    for (let i = 1; i < width; i++) {
      if (group.some((p) => p.keys[i] === undefined)) for (const p of group) p.keys[i] = undefined;
    }
  }
}

/** a is better than b by mark alone (unit direction). */
export const betterMark = (a: number, b: number, def: Pick<DisciplineDef, 'better'>) => (def.better === 'higher' ? a > b : a < b);

/**
 * Rank one heat / flight / final. Ranked rows first (shared places for ties the
 * rule can't separate), then entries still without a mark (start-list order),
 * then NM, DNF, FS, DQ, WD, DNS.
 */
export function rankEntries(entries: ResultEntry[], def: DisciplineDef, o: RankOptions = {}): RankedEntry[] {
  const prefix = o.tiePrefix ?? '=';
  const rows = entries.map((entry) => ({ entry, p: performanceOf(entry, def, o.upToAttempt, o.handLegal) }));
  levelKeys(rows.map((x) => x.p));
  const startOrder = (x: (typeof rows)[number]) => x.entry.result?.lane ?? x.entry.result?.order ?? 999;
  const ranked = rows.filter((x) => x.p.status === 'ok' && x.p.best != null);
  ranked.sort((a, b) => compareKeys(a.p.keys, b.p.keys) || startOrder(a) - startOrder(b) || a.entry.name.localeCompare(b.entry.name));
  const tied = (a: (typeof rows)[number], b: (typeof rows)[number]) => compareKeys(a.p.keys, b.p.keys) === 0;
  const places = sharedPositions(ranked, tied);

  const make = (x: (typeof rows)[number], position: number | null, label: string, tie: boolean): RankedEntry => ({
    id: x.entry.id, entry: x.entry, position, label, tie, status: x.p.status, best: x.p.best,
    bestText: formatMark(x.p.best, def), wind: x.p.wind, legal: x.p.legal, bestLegal: x.p.bestLegal, flags: [...x.p.flags],
  });
  const out: RankedEntry[] = ranked.map((x, i) => {
    const { position, tie } = places[i];
    const row = make(x, position, `${tie ? prefix : ''}${position}`, tie);
    // A tie the rules send to a jump-off (HJ / PV, 1st place — TR 26.9) or a
    // shoot-off (archery / shooting medal places) that hasn't been held yet.
    if (tie && ((def.tie === 'vertical' && position === 1) || (def.tie === 'inner-count' && position <= 3))) {
      row.needsDecider = true;
      row.flags.push(def.tie === 'vertical' ? 'JO' : 'SO');
    }
    return row;
  });
  const pending = rows.filter((x) => x.p.status === 'ok' && x.p.best == null).sort((a, b) => startOrder(a) - startOrder(b));
  for (const x of pending) out.push(make(x, null, '', false));
  const unranked = rows.filter((x) => x.p.status !== 'ok')
    .sort((a, b) => STATUS_ORDER[a.p.status] - STATUS_ORDER[b.p.status] || startOrder(a) - startOrder(b));
  for (const x of unranked) out.push(make(x, null, x.p.status, false));
  return out;
}

/** Rank every heat of a phase separately (heat number → ranking). */
export function rankByHeat(entries: ResultEntry[], def: DisciplineDef, o: RankOptions = {}): Map<number, RankedEntry[]> {
  const heats = [...new Set(entries.map((e) => e.heat))].sort((a, b) => a - b);
  return new Map(heats.map((h) => [h, rankEntries(entries.filter((e) => e.heat === h), def, o)]));
}
