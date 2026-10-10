/**
 * Marks in their units — parse what an official types, format what a results
 * sheet shows — and the per-capture summaries the ranking uses (best attempt,
 * bar progression, lift totals). Pure.
 */
import type { Attempt, DisciplineDef, EntryResult, HeightAttempt, LiftAttempt, ResultStatus } from './model.ts';

const EPS = 1e-9;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** A mark as shown: 10.85 · 1:52.34 · 1:02:03.45 · 6.45 · 185 · 652. */
export function formatMark(v: number | null | undefined, def: Pick<DisciplineDef, 'unit' | 'dp'>): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (def.unit !== 'time') return v.toFixed(def.dp);
  const dp = def.dp;
  const scale = 10 ** dp;
  const total = Math.round(v * scale);
  const frac = total % scale;
  const secsAll = Math.floor(total / scale);
  const h = Math.floor(secsAll / 3600), m = Math.floor((secsAll % 3600) / 60), s = secsAll % 60;
  const fracText = dp > 0 ? `.${String(frac).padStart(dp, '0')}` : '';
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}${fracText}`;
  if (m > 0) return `${m}:${pad2(s)}${fracText}`;
  return `${s}${fracText}`;
}

export interface ParsedMark { mark: number; thousandths?: number }

/**
 * Parse an official's entry. Times: "10.85", "1:52.34", "1:02:03.45" (a "."
 * between minutes and seconds — "1.52.34" — is accepted too). A time typed to
 * the thousandth (photo finish, "10.853") is ROUNDED UP to the hundredth for the
 * official mark (World Athletics TR 19.24) and kept as `thousandths` for ties.
 * Distance / height / points / kg: a plain decimal ("6.45", "6,45").
 * Returns null for anything unreadable.
 */
export function parseMark(text: string, def: Pick<DisciplineDef, 'unit' | 'dp'>): ParsedMark | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  if (def.unit === 'time') {
    const parts = t.split(':');
    if (parts.length === 1) {
      const dots = t.split('.');
      if (dots.length === 3) parts.splice(0, 1, dots[0], `${dots[1]}.${dots[2]}`);
    }
    if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
    if (parts.slice(0, -1).some((p) => p.includes('.'))) return null;
    const nums = parts.map(Number);
    const secs = nums.reduce((acc, n) => acc * 60 + n, 0);
    if (parts.length > 1 && nums.slice(1).some((n) => n >= 60)) return null;
    if (!(secs > 0)) return null;
    const scale = 10 ** def.dp;
    const decimals = (parts[parts.length - 1].split('.')[1] ?? '').length;
    const mark = Math.ceil(secs * scale - EPS) / scale;
    return decimals > def.dp ? { mark, thousandths: Math.round(secs * 1000) / 1000 } : { mark };
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  if (!(v >= 0)) return null;
  // Field marks are measured DOWN to the last full centimetre (TR 29.10 / 33.6).
  const scale = 10 ** def.dp;
  return { mark: Math.floor(v * scale + EPS) / scale };
}

/* ------------------------------- attempts -------------------------------- */

export interface AttemptSummary {
  /** valid marks, best first */
  valid: number[];
  best: number | null;
  /** wind of the best attempt */
  bestWind?: number;
  /** the best mark with legal (or no-gauge) wind */
  bestLegal: number | null;
  taken: number;
}

/** A wind reading is record-legal: at most the limit (+2.0 m/s). `noGauge` (a
 *  meet / pit without a gauge, SD-90 / SD-91): a missing reading counts too. */
export const windLegal = (wind: number | undefined, def: Pick<DisciplineDef, 'wind' | 'windLimit'>, noGauge = false): boolean =>
  !def.wind || (wind == null ? noGauge : wind <= (def.windLimit ?? 2.0) + EPS);

/** Best of N attempts (`upTo` = only the first N, e.g. "after 3 rounds"). */
export function summarizeAttempts(attempts: Attempt[] | undefined, def: DisciplineDef, upTo?: number, noGauge = false): AttemptSummary {
  const list = (attempts ?? []).filter((a): a is Attempt => !!a).slice(0, upTo ?? Infinity);
  const sign = def.better === 'higher' ? 1 : -1;
  const valid = list.filter((a) => a.mark != null && !a.foul && !a.pass);
  const sorted = [...valid].sort((a, b) => sign * ((b.mark as number) - (a.mark as number)));
  const best = sorted[0];
  const legal = sorted.find((a) => windLegal(a.wind, def, noGauge));
  return {
    valid: sorted.map((a) => a.mark as number),
    best: best ? (best.mark as number) : null,
    bestWind: best?.wind,
    bestLegal: legal ? (legal.mark as number) : null,
    taken: list.filter((a) => a.foul || a.pass || a.mark != null).length,
  };
}

/** "6.45 X 6.51 – …" — the attempt series for a results sheet. */
export function attemptText(a: Attempt | undefined, def: DisciplineDef): string {
  if (!a) return '';
  if (a.pass) return '–';
  if (a.foul) return 'X';
  return a.mark != null ? formatMark(a.mark, def) : '';
}

/* ---------------------------- vertical jumps ----------------------------- */

const TRIES = /^(O|XO|XXO|XXX|-|X-|XX-|X|XX)$/;
export const isValidTries = (s: string) => s === '' || TRIES.test(s);

export interface HeightSummary {
  best: number | null;
  /** failures at the best cleared height */
  failsAtBest: number;
  /** failures up to and including the best cleared height */
  totalFails: number;
  /** three consecutive failures (across heights) → out of the competition */
  eliminated: boolean;
}

/** World Athletics TR 26.8 inputs from the bar progression (O / X / –). */
export function summarizeHeights(heights: HeightAttempt[] | undefined): HeightSummary {
  const rows = [...(heights ?? [])].sort((a, b) => a.height - b.height);
  let best: number | null = null, failsAtBest = 0, totalFails = 0, running = 0, consecutive = 0, eliminated = false;
  for (const h of rows) {
    const t = h.tries.toUpperCase();
    const xs = (t.match(/X/g) ?? []).length;
    running += xs;
    if (t.endsWith('O')) {
      best = h.height; failsAtBest = xs; totalFails = running; consecutive = 0;
    } else {
      consecutive += xs;
      if (consecutive >= 3) eliminated = true;
    }
  }
  return { best, failsAtBest, totalFails, eliminated };
}

/** Next state of a height's tries after the official taps O, X or – (pass). */
export function addTry(tries: string, t: 'O' | 'X' | '-'): string {
  if (tries.endsWith('O') || tries.endsWith('-') || tries.length >= 3) return tries;
  return tries + t;
}

/* ------------------------------ weightlifting ---------------------------- */

export interface LiftSummary {
  snatch: number | null;
  cj: number | null;
  total: number | null;
  /** attempt order (seq) of the lift that made the total — earlier wins a tie */
  totalSeq?: number;
  bombedOut: boolean;
}

const bestLift = (list: LiftAttempt[] | undefined) => {
  const good = (list ?? []).filter((a) => a.good === true);
  if (!good.length) return null;
  // Heaviest good lift; among equal weights the first taken.
  return good.reduce((b, a) => (a.kg > b.kg ? a : b));
};

/** Best good snatch + best good clean & jerk = total (IWF TCRR). Three no-lifts
 *  in either lift = no total. The total is "reached" by whichever of the two
 *  best lifts came later in the competition (its `seq`). */
export function summarizeLifts(lifts: EntryResult['lifts']): LiftSummary {
  const s = bestLift(lifts?.snatch), c = bestLift(lifts?.cj);
  const failed = liftFailed;
  const bombedOut = failed(lifts?.snatch) || failed(lifts?.cj);
  const total = s && c ? s.kg + c.kg : null;
  const seqs = [s?.seq, c?.seq].filter((x): x is number => x != null);
  return { snatch: s?.kg ?? null, cj: c?.kg ?? null, total, totalSeq: total != null && seqs.length === 2 ? Math.max(...seqs) : undefined, bombedOut };
}

/** Three attempts taken in a lift and none good (a declined attempt — SD-97 `pass` — counts as no lift). */
export const liftFailed = (l?: LiftAttempt[]): boolean =>
  (l ?? []).length >= 3 && (l ?? []).slice(0, 3).every((a) => a.good === false || (a.good !== true && !!a.pass));

/** SD-97: the best good attempt of one lift (heaviest; among equal weights the first taken). */
export const bestLiftAttempt = (list: LiftAttempt[] | undefined): LiftAttempt | null => bestLift(list);

/** IWF: a lifter's next attempt may not be lighter than the previous one. */
export function liftProgressionError(list: LiftAttempt[] | undefined): string | null {
  const l = list ?? [];
  if (l.length > 3) return 'Only three attempts per lift.';
  for (let i = 1; i < l.length; i++) if (l[i].kg < l[i - 1].kg) return `Attempt ${i + 1} (${l[i].kg} kg) is lighter than attempt ${i} (${l[i - 1].kg} kg).`;
  return null;
}

/* -------------------------------- status --------------------------------- */

/** The effective status: an explicit DNS / DNF / DQ / FS / WD wins; a field event
 *  with every attempt taken and no valid mark, or a vertical jumper out without
 *  a clearance, is NM; a weightlifter with no total after bombing out is NM. */
export function effectiveStatus(r: EntryResult, def: DisciplineDef): ResultStatus {
  if (r.status && r.status !== 'ok') return r.status;
  if (def.capture === 'attempts') {
    const s = summarizeAttempts(r.attempts, def);
    if (s.best == null && s.taken >= (def.attempts?.count ?? 3)) return 'NM';
  }
  if (def.capture === 'heights') {
    const h = summarizeHeights(r.heights);
    if (h.best == null && h.eliminated) return 'NM';
  }
  if (def.capture === 'lifts') {
    // SD-97: one lift ranked on its own (wl.snatch / wl.cj) — out only if that lift failed
    const only = def.lifts?.length === 1 ? def.lifts[0] : undefined;
    if (only ? liftFailed(r.lifts?.[only]) : summarizeLifts(r.lifts).bombedOut) return 'NM';
  }
  return 'ok';
}
