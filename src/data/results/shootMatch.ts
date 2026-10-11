/**
 * SD-137b — ISSF mixed team medal matches (10 m Air Rifle / Air Pistol mixed
 * team), pure. Rules as implemented (ISSF Rifle / Pistol rules, mixed team
 * event, as remembered — rule numbers not checked, verify):
 *
 *  - the qualification ranks the teams on their combined score (30 shots each);
 *    the best 4 go on: 1st v 2nd shoot the gold medal match, 3rd v 4th the
 *    bronze medal match;
 *  - a medal match is shot in series of one shot per athlete (2 shots a team);
 *    the team with the higher series total takes 2 points, equal totals 1 each;
 *    the first team to 16 points wins;
 *  - level at 16–16 (both reach 16 on the same series): a shoot-off series —
 *    one shot each, the higher total wins; still level, shoot again;
 *  - scoring follows the event (rifle decimal 10.9, pistol integer — verify
 *    whether pistol medal matches use decimals at your competition).
 *
 * Storage: each match row carries its `seed` (qualification place), its
 * qualification score in `qual` (records / sheet), and its side of the gold
 * ('G') or bronze ('B') match in `mp` — `ends` = the series (one shot per
 * member), `so` = shoot-off shots. Nothing about who meets whom is stored.
 */
import type { ArchSide, DisciplineDef, EntryResult, RankedEntry, ResultEntry, ResultStatus } from './model.ts';
import { STATUS_ORDER } from './model.ts';
import { sumTenths, fromTenths } from './shootingDefs.ts';

export const SHOOT_MATCH_WIN = 16;
/** Teams in the medal matches (gold 1 v 2, bronze 3 v 4). */
export const SHOOT_MATCH_TEAMS = 4;

export interface ShootSeries { a: number; b: number; pa: number; pb: number }
export interface ShootMatchOutcome {
  series: ShootSeries[];
  /** points */
  a: number;
  b: number;
  winner?: 'a' | 'b';
  /** level at 16–16 → shoot-off; the round still to shoot (1-based) */
  soNeed?: number;
  soWon?: number;
  walkover?: boolean;
  done: boolean;
}

const total = (shots: (number | string)[]): number => fromTenths(sumTenths(shots.map((v) => Number(v) || 0)));

/** One medal match from both teams' series. `size` = shots per team per series (2: one per athlete). */
export function shootMatchOutcome(A: ArchSide | undefined, B: ArchSide | undefined, size = 2, okA = true, okB = true): ShootMatchOutcome {
  const o: ShootMatchOutcome = { series: [], a: 0, b: 0, done: false };
  okA = okA && !A?.wo; okB = okB && !B?.wo;
  if (!okA || !okB) return { ...o, done: true, walkover: true, ...(okA ? { winner: 'a' as const } : okB ? { winner: 'b' as const } : {}) };
  const full = (s?: ArchSide) => (s?.ends ?? []).filter((e) => e && e.length >= size);
  const ea = full(A), eb = full(B);
  const n = Math.min(ea.length, eb.length);
  for (let k = 0; k < n; k++) {
    const sa = total(ea[k] as number[]), sb = total(eb[k] as number[]);
    const pa = sa > sb ? 2 : sa === sb ? 1 : 0;
    o.series.push({ a: sa, b: sb, pa, pb: 2 - pa });
    o.a += pa; o.b += 2 - pa;
    if (o.a >= SHOOT_MATCH_WIN || o.b >= SHOOT_MATCH_WIN) break;
  }
  if (o.a >= SHOOT_MATCH_WIN && o.a > o.b) return { ...o, winner: 'a', done: true };
  if (o.b >= SHOOT_MATCH_WIN && o.b > o.a) return { ...o, winner: 'b', done: true };
  if (o.a < SHOOT_MATCH_WIN) return o;
  // 16–16: shoot-off series, one shot per athlete
  for (let j = 0; ; j++) {
    const ra = (A?.so ?? []).slice(j * size, j * size + size), rb = (B?.so ?? []).slice(j * size, j * size + size);
    if (ra.length < size || rb.length < size) return { ...o, soNeed: j + 1 };
    const x = total(ra as number[]), y = total(rb as number[]);
    if (x !== y) return { ...o, winner: x > y ? 'a' : 'b', done: true, soWon: j + 1 };
  }
}

/** "16–12", "17–15 (SO 20.6–20.1)", "w/o" — from A's side unless `flip`. */
export function shootMatchText(o: ShootMatchOutcome, A?: ArchSide, B?: ArchSide, size = 2, flip = false): string {
  if (o.walkover) return 'w/o';
  const [x, y] = flip ? [o.b, o.a] : [o.a, o.b];
  let t = `${x}–${y}`;
  if (o.soWon || o.soNeed) {
    const rounds = Math.max(A?.so?.length ?? 0, B?.so?.length ?? 0) / size;
    const parts: string[] = [];
    for (let j = 0; j < rounds; j++) {
      const ra = total(((A?.so ?? []).slice(j * size, j * size + size)) as number[]), rb = total(((B?.so ?? []).slice(j * size, j * size + size)) as number[]);
      parts.push(flip ? `${rb}–${ra}` : `${ra}–${rb}`);
    }
    if (parts.length) t += ` (SO ${parts.join(', ')})`;
  }
  return t;
}

export interface ShootMatch { key: 'G' | 'B'; label: string; a?: string; b?: string; out?: ShootMatchOutcome; winner?: string; loser?: string; decided: boolean }
export interface ShootMatchState { matches: ShootMatch[]; places: Map<string, number>; current?: ShootMatch; done: boolean }

const competing = (e?: ResultEntry) => !!e && !['DNS', 'WD', 'DQ'].includes(e.result?.status ?? 'ok');

/** Is this phase the medal matches (rows carry `mp`)? */
export const isShootMatchRows = (entries: ResultEntry[]): boolean => entries.some((e) => e.result?.mp != null && e.result?.seed != null);

/** The gold and bronze medal matches from the rows' seeds and series. */
export function shootMatchState(entries: ResultEntry[], size = 2): ShootMatchState {
  const rows = entries.filter((e) => e.result?.mp != null && e.result.seed != null);
  const bySeed = new Map(rows.map((e) => [e.result.seed!, e]));
  const places = new Map<string, number>();
  const play = (key: 'G' | 'B', label: string, sa: number, sb: number, placeW: number): ShootMatch => {
    const ea = bySeed.get(sa), eb = bySeed.get(sb);
    const m: ShootMatch = { key, label, a: ea?.id, b: eb?.id, decided: false };
    if (!ea || !eb) {
      // a team without an opponent takes the place (a 3-team event: the 3rd team's bronze)
      const only = ea ?? eb;
      if (only && competing(only)) { m.winner = only.id; m.decided = true; places.set(only.id, placeW); }
      return m;
    }
    m.out = shootMatchOutcome(ea.result.mp?.[key], eb.result.mp?.[key], size, competing(ea), competing(eb));
    if (m.out.done) {
      m.decided = true;
      if (m.out.winner) {
        m.winner = m.out.winner === 'a' ? ea.id : eb.id;
        m.loser = m.out.winner === 'a' ? eb.id : ea.id;
        if (competing(entries.find((e) => e.id === m.winner))) places.set(m.winner, placeW);
        if (competing(entries.find((e) => e.id === m.loser))) places.set(m.loser, placeW + 1);
      }
    }
    return m;
  };
  const matches = [play('B', 'Bronze medal match', 3, 4, 3), play('G', 'Gold medal match', 1, 2, 1)];
  const current = matches.find((m) => m.a && m.b && !m.decided);
  return { matches, places, current, done: matches.every((m) => m.decided || (!m.a && !m.b)) };
}

/** Rank the medal matches: places 1–4 from the matches, teams still shooting by seed, then DNS / WD / DQ. */
export function rankShootMatches(entries: ResultEntry[], _def?: DisciplineDef): RankedEntry[] {
  const st = shootMatchState(entries, 2);
  const lastText = (id: string): string => {
    const m = st.matches.find((x) => x.out && (x.a === id || x.b === id));
    if (!m?.out) return '';
    const flip = m.b === id;
    const wl = m.decided ? (m.winner === id ? 'W ' : 'L ') : '';
    return `${wl}${m.out.walkover ? 'w/o' : flip ? `${m.out.b}–${m.out.a}` : `${m.out.a}–${m.out.b}`}${m.out.soWon ? ' SO' : ''}`;
  };
  const rows = entries.filter((e) => e.result?.mp != null);
  const key = (e: ResultEntry) => st.places.get(e.id) ?? (e.result.seed! <= 2 ? 0.5 : 2.5);
  const ok = rows.filter(competing).sort((a, b) => key(a) - key(b) || (a.result.seed ?? 99) - (b.result.seed ?? 99));
  const out: RankedEntry[] = ok.map((e) => {
    const p = st.places.get(e.id) ?? null;
    return { id: e.id, entry: e, position: p, label: p != null ? String(p) : '', tie: false, status: 'ok', best: null, bestText: lastText(e.id), legal: false, bestLegal: null, flags: [] };
  });
  const bad = rows.filter((e) => !competing(e)).sort((a, b) => STATUS_ORDER[(a.result.status ?? 'ok') as ResultStatus] - STATUS_ORDER[(b.result.status ?? 'ok') as ResultStatus]);
  for (const e of bad) out.push({ id: e.id, entry: e, position: null, label: e.result.status ?? '', tie: false, status: (e.result.status ?? 'ok') as ResultStatus, best: null, bestText: '', legal: false, bestLegal: null, flags: [] });
  return out;
}

/** A medal-match row from a qualification row: its seed and its qualification score (records / sheet). */
export function shootMatchEntrant(q: EntryResult, seed: number): Pick<EntryResult, 'seed' | 'order' | 'mp' | 'qual'> {
  return { seed, order: seed, mp: {}, qual: { mark: q.mark ?? 0, ...(q.xs != null ? { xs: q.xs } : {}), ...(q.series ? { series: q.series } : {}) } };
}

/** Set series `i` (0-based) of match `key` for one team — its two shots; `null` clears it and the series after it (and any shoot-off). */
export function setShootSeries(r: EntryResult, key: string, i: number, shots: number[] | null): EntryResult {
  const side: ArchSide = { ...(r.mp?.[key] ?? {}) };
  const ends = [...(side.ends ?? [])];
  if (shots == null) { ends.splice(i); delete side.so; }
  else { while (ends.length < i) ends.push([]); ends[i] = shots; }
  side.ends = ends;
  return { ...r, mp: { ...(r.mp ?? {}), [key]: side } };
}

/** Set shoot-off round `j` (0-based) for one team — one shot per athlete; `null` clears it and any after. */
export function setShootSo(r: EntryResult, key: string, j: number, shots: number[] | null, size = 2): EntryResult {
  const side: ArchSide = { ...(r.mp?.[key] ?? {}) };
  const so = [...(side.so ?? [])].slice(0, j * size);
  if (shots) so.push(...shots.slice(0, size));
  side.so = so;
  return { ...r, mp: { ...(r.mp ?? {}), [key]: side } };
}

/** Mark (or clear) a walkover: this team doesn't shoot match `key`. */
export function setShootWalkover(r: EntryResult, key: string, wo: boolean): EntryResult {
  const side: ArchSide = { ...(r.mp?.[key] ?? {}) };
  if (wo) side.wo = true; else delete side.wo;
  return { ...r, mp: { ...(r.mp ?? {}), [key]: side } };
}
