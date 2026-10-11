/**
 * SD-95 — archery (World Archery) on the results engine. Pure.
 *
 *  - an event = a ranking round (72 arrows outdoor in ends of 6, 60 indoor in
 *    ends of 3) — then, optionally, a seeded match-play bracket with a bronze
 *    medal match; without match play the ranking round decides the medals;
 *  - an end is entered arrow by arrow (keypad X 10 … 1 M, or typed "X 10 9 9 8 7",
 *    optionally "= 53" to check against the scorecard total); an end can never
 *    have more arrows than the round shoots or score more than 60 / 30;
 *  - ranking: total → 10s (X included) → X → shoot-off / coin toss (rank.ts);
 *    match play: archeryBracket.ts;
 *  - stat lines (best ranking score per round, arrows and points for the
 *    average arrow, 10s and X, matches won / lost, set points, medals), the
 *    career, records (ranking-round scores only — a match is never a record),
 *    meet points.
 */
import type { ArchSide, Category, EntryResult, PhaseFormat, PhaseKind, RankedEntry, ResultEntry } from './model.ts';
import { categoryLabel, disciplineOf } from './model.ts';
import { phaseLabel } from './plan.ts';
import type { Award } from './medals.ts';
import {
  ARCH_ROUNDS, archRoundOf, arrowValue, endMax, endSum, endTens, endXs, endsOf, parseArrow, sortEnd, BOW_LABEL, MATCH_ARROWS, matchFormatOf,
  type ArchRoundDef, type Arrow, type Bow,
} from './archeryDefs.ts';
import { bracketState, isBracketRows, outcomeText, roundShort, type BracketState } from './archeryBracket.ts';
import { cycPhaseName } from './cyclingDefs.ts';

export * from './archeryDefs.ts';
export {
  isBracketRows, bracketSize, seedPositions, roundLabel, roundShort, matchOutcome, outcomeText, bracketState, staleMatchData, hasMatchData,
  rankArcheryBracket, bracketFormat, type BMatch, type BracketState, type MatchOutcome, type EndScore,
} from './archeryBracket.ts';

/* ---------------------------------- format --------------------------------- */

/** The archery round behind a discipline. */
export const archRound = (def?: { key: string } | null): ArchRoundDef | undefined => archRoundOf(def?.key);

/** "X 10 9 9 8 7" */
export const endText = (arrows?: Arrow[]): string => (arrows ?? []).map(String).join(' ');

/** The ranking-round phase is "Ranking round", match play "Match play"; other sports keep their labels. */
export function phaseNameOf(f: { discipline: string; phase: PhaseKind; plan?: { phase: PhaseKind }[]; races?: string[]; phaseNo?: number; combined?: PhaseFormat['combined'] }): string {
  // SD-93: a combined event's phases are its events — "3. Shot put"
  if (f.combined) return `${f.combined.index + 1}. ${disciplineOf(f.discipline)?.label ?? f.discipline}`;
  // SD-98 cycling: "Stage 2", "Qualifying (flying 200 m)", "Match play", "Finals (gold / bronze)"
  const cyc = cycPhaseName(f);
  if (cyc) return cyc;
  // SD-99 / SD-100: a final run as lettered races reads "Finals A/B"
  if (f.phase === 'final' && (f.races?.length ?? 0) > 1) return `Finals ${f.races!.join('/')}`;
  if (!archRoundOf(f.discipline)) return phaseLabel(f.phase);
  if (f.phase === 'final' && (f.plan?.length ?? 1) > 1) return 'Match play';
  return 'Ranking round';
}

/* ------------------------------ entry & checks ------------------------------ */

/**
 * An end as typed: arrows separated by spaces / commas ("X 10 9 9 8 M"), or
 * run together when unambiguous ("X109987" is not — use spaces). An optional
 * "= 53" checks the arrows against the scorecard's end total.
 */
export function parseEnd(text: string, perEnd: number): { arrows: Arrow[] } | { error: string } {
  const [lhs, rhs] = text.split('=');
  const parts = lhs.trim().split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) return { error: 'Type the arrows, e.g. X 10 9 8 7 M.' };
  const arrows: Arrow[] = [];
  for (const p of parts) {
    const a = parseArrow(p);
    if (a == null) return { error: `Arrow ${arrows.length + 1}: "${p}" isn't a score (X, 10 … 1, M).` };
    arrows.push(a);
  }
  const bad = endError(arrows, perEnd);
  if (bad) return { error: bad };
  if (rhs != null && rhs.trim()) {
    const t = Number(rhs.trim());
    if (!Number.isInteger(t)) return { error: `Can't read the total "${rhs.trim()}".` };
    if (t !== endSum(arrows)) return { error: `These arrows add to ${endSum(arrows)}, but the scorecard total says ${t}. Check the arrows.` };
  }
  return { arrows: sortEnd(arrows) };
}

/** Hard limits of an end: exactly `perEnd` arrows (6 outdoor / 3 indoor and in matches), each X / 10 … 1 / M. */
export function endError(arrows: Arrow[], perEnd: number): string | null {
  if (arrows.length !== perEnd) return `${arrows.length} arrow${arrows.length === 1 ? '' : 's'} — an end here is ${perEnd} arrows.`;
  if (arrows.some((a) => parseArrow(String(a)) == null)) return 'An arrow scores X, 10 … 1 or M.';
  if (endSum(arrows) > endMax(perEnd)) return `An end of ${perEnd} can't score more than ${endMax(perEnd)}.`;
  return null;
}

/** Ranking totals from the ends: score, 10s (incl. X), X, arrows shot. */
export function archTotals(ends: Arrow[][] = []): { mark: number; tens: number; xs: number; arrows: number } {
  const all = ends.flat();
  return { mark: endSum(all), tens: endTens(all), xs: endXs(all), arrows: all.length };
}

/** Set ranking-round end `i` (0-based); `null` clears it (only the last end really goes — later ends stay). */
export function setEnd(r: EntryResult, i: number, arrows: Arrow[] | null): EntryResult {
  const ends = [...(r.ends ?? [])];
  if (arrows == null) ends.splice(i, 1);
  else { while (ends.length < i) ends.push([]); ends[i] = sortEnd(arrows); }
  const t = archTotals(ends);
  return { ...r, ends, ...(ends.length ? { mark: t.mark, tens: t.tens, xs: t.xs } : { mark: undefined, tens: undefined, xs: undefined }) };
}

/** Halves of a ranking round (36 + 36 / 30 + 30) — the scoresheet's distance totals. */
export function halfTotals(ends: Arrow[][] = [], round: ArchRoundDef): number[] {
  const half = Math.ceil(endsOf(round) / 2);
  return [endSum(ends.slice(0, half).flat()), endSum(ends.slice(half).flat())];
}

/** "8 ends · 302 (10s 12, X 4)" — a ranking row's line. */
export function archRowText(r: EntryResult, round: ArchRoundDef): string {
  const ends = (r.ends ?? []).filter((e) => e?.length);
  if (!ends.length && r.mark == null) return '';
  const t = ends.length ? archTotals(ends) : { mark: r.mark ?? 0, tens: r.tens ?? 0, xs: r.xs ?? 0, arrows: 0 };
  const total = endsOf(round);
  const h = halfTotals(r.ends, round);
  const halves = ends.length > total / 2 ? ` · ${h[0]} + ${h[1]}` : '';
  return `${ends.length}/${total} ends · ${t.mark} · 10s ${t.tens} · X ${t.xs}${halves}`;
}

/* ---------------------------------- matches -------------------------------- */

/** Set end `i` of this archer's side of match `key`; `null` clears it (and any shoot-off after it). */
export function setMatchEnd(r: EntryResult, key: string, i: number, arrows: Arrow[] | null): EntryResult {
  const side: ArchSide = { ...(r.mp?.[key] ?? {}) };
  const ends = [...(side.ends ?? [])];
  if (arrows == null) { ends.splice(i); delete side.so; delete side.closer; }
  else { while (ends.length < i) ends.push([]); ends[i] = sortEnd(arrows); }
  side.ends = ends;
  return { ...r, mp: { ...(r.mp ?? {}), [key]: side } };
}

/** Shoot-off arrow `j` (0-based) of match `key`; `null` clears it and any after. */
export function setMatchSo(r: EntryResult, key: string, j: number, arrow: Arrow | null): EntryResult {
  const side: ArchSide = { ...(r.mp?.[key] ?? {}) };
  const so = [...(side.so ?? [])];
  const closer = [...(side.closer ?? [])];
  if (arrow == null) { so.splice(j); closer.splice(j); }
  else { so[j] = arrow; closer.splice(j); }
  side.so = so;
  side.closer = closer;
  return { ...r, mp: { ...(r.mp ?? {}), [key]: side } };
}

/** The judge's call on shoot-off arrow `j`: this archer's arrow is closer to the centre (or not). */
export function setCloser(r: EntryResult, key: string, j: number, closer: boolean): EntryResult {
  const side: ArchSide = { ...(r.mp?.[key] ?? {}) };
  const c = [...(side.closer ?? [])];
  while (c.length < j) c.push(false);
  c[j] = closer;
  side.closer = c;
  return { ...r, mp: { ...(r.mp ?? {}), [key]: side } };
}

/** Mark (or clear) a walkover: this archer doesn't shoot match `key`; the opponent goes through. */
export function setWalkover(r: EntryResult, key: string, wo: boolean): EntryResult {
  const side: ArchSide = { ...(r.mp?.[key] ?? {}) };
  if (wo) side.wo = true; else delete side.wo;
  return { ...r, mp: { ...(r.mp ?? {}), [key]: side } };
}

/** Take matches `keys` off a bracket row (stale after a correction further back). */
export function clearMatches(r: EntryResult, keys: string[]): EntryResult {
  const mp = { ...(r.mp ?? {}) };
  for (const k of keys) delete mp[k];
  return { ...r, mp };
}

/** A bracket row from a ranking-round row: its seed, the ranking score kept for the sheet and the records. */
export function bracketEntrant(q: EntryResult, seed: number): Pick<EntryResult, 'seed' | 'mp' | 'qual' | 'order'> {
  return { seed, order: seed, mp: {}, qual: { mark: q.mark ?? 0, tens: q.tens ?? 0, xs: q.xs ?? 0 } };
}

/** For records / PBs: a bracket's rows read as their ranking-round scores. */
export function archQualView(entries: ResultEntry[]): ResultEntry[] {
  if (!isBracketRows(entries)) return entries;
  return entries.map((e) => ({ ...e, result: { status: e.result.status, order: e.result.order, mark: e.result.qual?.mark, tens: e.result.qual?.tens, xs: e.result.qual?.xs } }));
}

/**
 * The ranking-round order the bracket is seeded from, and any tie for the last
 * place in it that only a shoot-off can settle (WA: a shoot-off decides entry
 * to the elimination rounds; other equal ranks are separated by a coin toss
 * for the bracket position — the `decider` field, or the target order).
 */
export function bracketSeeds(ranked: RankedEntry[], n: number): { ids: string[]; tieAtCut: string[] } {
  const ok = ranked.filter((r) => r.status === 'ok' && r.position != null);
  // equal ranks: the target / start order (a coin toss result goes in as a `decider`, which the rank already used)
  const order = [...ok].sort((a, b) => (a.position! - b.position!) || (a.entry.result.order ?? 99) - (b.entry.result.order ?? 99));
  if (order.length <= n) return { ids: order.map((r) => r.id), tieAtCut: [] };
  const last = order[n - 1], first = order[n];
  // an equal rank across the cut — only a shoot-off place (decider) splits them
  const tied = last.position === first.position;
  return { ids: order.slice(0, n).map((r) => r.id), tieAtCut: tied ? order.filter((r) => r.position === last.position).map((r) => r.id) : [] };
}

/* ------------------------------ meet settings ------------------------------ */

export interface ArchMeetSettings { positionPoints: number[]; relayFactor: number; handTimed: false; reaction: false }

export function archMeetSettings(fmt?: Record<string, unknown>): ArchMeetSettings {
  const scheme = String(fmt?.pointsScheme ?? '8,7,6,5,4,3,2,1').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  return { positionPoints: scheme.length ? scheme : [8, 7, 6, 5, 4, 3, 2, 1], relayFactor: 1, handTimed: false, reaction: false };
}

/* -------------------------------- stat lines ------------------------------- */

/** The stat key of a complete ranking round: 'm_ar_r70', 'm_ar_c18i' … */
export const archMarkKey = (discipline: string): string => `m_ar_${discipline.replace(/^arch\./, '')}`;

export interface ArchLine { playerId: string; stats: Record<string, number>; won: boolean }

/**
 * The stat lines a closed phase writes (one per archer):
 *   ranking round ('qual' — match play follows; 'match' — it decides the medals):
 *     comps, arrows, pts (average arrow), tens (10 + X rate), xs, m_ar_* (a complete
 *     round's score), rPlace / seeded (qual) or place (match);
 *   match play ('bracket'): brackets, mW / mL (matches won / lost), sp / spA (set
 *     points won / against, set system), place;
 *   medals (golds / silvers / bronzes) and posPoints on the deciding phase.
 */
export function archLines(f: Pick<PhaseFormat, 'discipline' | 'category'>, ranked: RankedEntry[], kind: 'qual' | 'match' | 'bracket', awards: Award[] = [], seeded: Set<string> = new Set()): ArchLine[] {
  const round = archRoundOf(f.discipline);
  if (!round) return [];
  const byEntry = new Map(awards.map((a) => [a.entryId, a]));
  const st: BracketState | null = kind === 'bracket' ? bracketState(ranked.map((r) => r.entry), matchFormatOf(round.bow)) : null;
  const out: ArchLine[] = [];
  for (const r of ranked) {
    if (r.status === 'DNS' || r.status === 'WD') continue;
    const s: Record<string, number> = {};
    const res = r.entry.result ?? {};
    if (r.status === 'DQ') s.dq = 1;
    if (st) {
      s.brackets = 1;
      if (r.position != null) s.place = r.position;
      let w = 0, l = 0, sp = 0, spA = 0;
      for (const m of st.matches) {
        if (!m.out || m.bye || (m.a !== r.id && m.b !== r.id)) continue;
        const mine = m.a === r.id ? 'a' : 'b';
        if (m.decided && !m.out.walkover) { if (m.winner === r.id) w += 1; else if (m.loser === r.id) l += 1; }
        if (st.fmt === 'sets' && !m.out.walkover) { sp += mine === 'a' ? m.out.a : m.out.b; spA += mine === 'a' ? m.out.b : m.out.a; }
      }
      s.mW = w; s.mL = l;
      if (st.fmt === 'sets') { s.sp = sp; s.spA = spA; }
    } else {
      s.comps = 1;
      const ends = (res.ends ?? []).filter((e) => e?.length);
      const t = archTotals(ends);
      if (ends.length) { s.arrows = t.arrows; s.pts = t.mark; s.tens = t.tens; s.xs = t.xs; }
      if (r.bestLegal != null && ends.length >= endsOf(round)) s[archMarkKey(round.key)] = r.bestLegal;
      if (kind === 'match' && r.position != null) s.place = r.position;
      if (kind === 'qual' && r.position != null) s.rPlace = r.position;
      if (kind === 'qual' && seeded.has(r.id)) s.seeded = 1;
    }
    const a = byEntry.get(r.id);
    if (a?.medal === 'gold') s.golds = 1; else if (a?.medal === 'silver') s.silvers = 1; else if (a?.medal === 'bronze') s.bronzes = 1;
    if (a && a.points > 0) s.posPoints = a.points;
    if (r.entry.athleteId) out.push({ playerId: r.entry.athleteId, stats: s, won: a?.medal === 'gold' });
  }
  return out;
}

/* ---------------------------------- career --------------------------------- */

export interface ArchBest { value: number; text: string; date: string; eventId: string; category?: string }
export interface ArcheryCareer {
  comps: number; brackets: number; mW: number; mL: number; sp: number; spA: number;
  golds: number; silvers: number; bronzes: number; points: number;
  arrows: number; pts: number; tens: number; xs: number;
  /** points per arrow over the ranking rounds (2 dp), null without any */
  avgArrow: number | null;
  /** 10s (X included) and X per 100 arrows */
  tenRate: number | null; xRate: number | null;
  /** best complete ranking round per round (PB / SB) with the average arrow */
  bests: { key: string; label: string; pb: ArchBest; sb?: ArchBest; avgArrow: number; rounds: number }[];
  history: { eventId: string; title: string; date: string; text: string; place?: number; medal?: 'gold' | 'silver' | 'bronze'; flags: string[] }[];
}

const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th'}`;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** An archer's career from their archery stat lines (`eventId` = the phase). History newest first. */
export function archeryCareer(
  lines: { eventId?: string; stats: Record<string, number>; date?: string; opponent?: string }[],
  phases: Map<string, { discipline: string; title: string; date: string; category?: Category; eventTitle?: string; phase?: string }>,
  seasonFrom: string,
): ArcheryCareer {
  const c: ArcheryCareer = { comps: 0, brackets: 0, mW: 0, mL: 0, sp: 0, spA: 0, golds: 0, silvers: 0, bronzes: 0, points: 0, arrows: 0, pts: 0, tens: 0, xs: 0, avgArrow: null, tenRate: null, xRate: null, bests: [], history: [] };
  const bests = new Map<string, ArcheryCareer['bests'][number] & { ptsSum: number; arrowSum: number }>();
  const sorted = [...lines].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const pbSoFar = new Map<string, number>();
  for (const l of sorted) {
    const s = l.stats ?? {};
    const info = l.eventId ? phases.get(l.eventId) : undefined;
    const key = Object.keys(s).find((k) => k.startsWith('m_ar_'));
    const disc = info?.discipline ?? (key ? `arch.${key.slice(5)}` : undefined);
    const round = archRoundOf(disc);
    c.comps += s.comps ?? 0; c.brackets += s.brackets ?? 0;
    c.mW += s.mW ?? 0; c.mL += s.mL ?? 0; c.sp += s.sp ?? 0; c.spA += s.spA ?? 0;
    c.golds += s.golds ?? 0; c.silvers += s.silvers ?? 0; c.bronzes += s.bronzes ?? 0; c.points += s.posPoints ?? 0;
    c.arrows += s.arrows ?? 0; c.pts += s.pts ?? 0; c.tens += s.tens ?? 0; c.xs += s.xs ?? 0;
    const date = info?.date ?? l.date ?? '';
    const flags: string[] = [];
    if (round && s.arrows) {
      const row = bests.get(round.key) ?? { key: round.key, label: `${round.label} (${round.arrows} arrows)`, pb: { value: -1, text: '', date: '', eventId: '' }, avgArrow: 0, rounds: 0, ptsSum: 0, arrowSum: 0 };
      row.ptsSum += s.pts ?? 0; row.arrowSum += s.arrows;
      const v = key ? s[key] : undefined;
      if (v != null) {
        row.rounds += 1;
        const best: ArchBest = { value: v, text: `${v}${s.tens != null ? ` (${s.tens} 10s, ${s.xs ?? 0} X)` : ''}`, date, eventId: l.eventId ?? '', category: info?.category ? categoryLabel(info.category) : undefined };
        const prev = pbSoFar.get(round.key);
        if (prev == null || v > prev) { if (prev != null) flags.push('PB'); pbSoFar.set(round.key, v); }
        if (v > row.pb.value) row.pb = best;
        if (date.slice(0, 10) >= seasonFrom && (!row.sb || v > row.sb.value)) row.sb = best;
      }
      bests.set(round.key, row);
    }
    if (s.seeded) flags.push('match play');
    const medal = s.golds ? 'gold' : s.silvers ? 'silver' : s.bronzes ? 'bronze' : undefined;
    const text = s.brackets
      ? [s.place ? `${ord(s.place)} in match play` : 'match play', `won ${s.mW ?? 0}, lost ${s.mL ?? 0}`, s.sp != null ? `${s.sp} set points` : ''].filter(Boolean).join(' · ')
      : [s.place ? ord(s.place) : s.rPlace ? `${ord(s.rPlace)} in the ranking round` : s.dq ? 'DQ' : '', s.pts != null ? `${s.pts}` : '', s.arrows ? `${s.arrows} arrows` : ''].filter(Boolean).join(' · ');
    c.history.push({ eventId: l.eventId ?? '', title: info?.title ?? l.opponent ?? 'Archery', date, text, place: s.place, medal, flags });
  }
  c.points = Math.round(c.points * 100) / 100;
  c.avgArrow = c.arrows ? Math.round((c.pts / c.arrows) * 100) / 100 : null;
  c.tenRate = pct(c.tens, c.arrows);
  c.xRate = pct(c.xs, c.arrows);
  c.bests = [...bests.values()].filter((b) => b.arrowSum > 0).map(({ ptsSum, arrowSum, ...b }) => ({
    ...b, pb: b.pb.value >= 0 ? b.pb : { ...b.pb, value: 0, text: '–' }, avgArrow: Math.round((ptsSum / arrowSum) * 100) / 100,
  }));
  c.history.reverse();
  return c;
}

/* --------------------------------- presets --------------------------------- */

export type ArchAge = 'Senior' | 'Junior' | 'U18' | 'U15' | 'School';
export const ARCH_AGES: { key: ArchAge; label: string; note: string }[] = [
  { key: 'Senior', label: 'Senior', note: 'WA senior (open age)' },
  { key: 'Junior', label: 'U21', note: 'WA U21: under 21 in the competition year' },
  { key: 'U18', label: 'U18', note: 'WA U18: recurve shoots 60 m' },
  { key: 'U15', label: 'U15', note: 'U15 / club — the national federation sets the distance' },
  { key: 'School', label: 'School', note: 'school championships — a house choice (check your school board)' },
];

/** The usual round for a bow, age group and venue. */
export function defaultRound(bow: Bow, age: ArchAge, indoor: boolean): ArchRoundDef {
  const pick = (d: number, ind = false) => ARCH_ROUNDS.find((r) => r.bow === bow && r.distance === d && r.indoor === ind)!;
  if (indoor) return pick(18, true);
  if (bow === 'R') return pick(age === 'Senior' || age === 'Junior' ? 70 : age === 'U18' ? 60 : age === 'U15' ? 40 : 30);
  return pick(age === 'School' ? 30 : 50);
}

/** The default match-play field: the biggest bracket of 4 … 32 that fits; none under 4 archers. */
export function defaultBracket(n: number): number {
  if (n < 4) return 0;
  let s = 4;
  while (s * 2 <= n && s < 32) s *= 2;
  return s;
}

/** "Recurve 70 m · 72 arrows, 12 ends of 6 · 122 cm face" */
export const roundLine = (r: ArchRoundDef): string => `${r.label} · ${r.arrows} arrows, ${endsOf(r)} ends of ${r.perEnd} · ${r.face}`;

/** The match line under a bracket row on the results sheet. */
export function bracketRowText(e: ResultEntry, st: BracketState, entries: ResultEntry[]): string {
  const parts: string[] = [];
  // SD-98: a sprint seed's flying 200 m time to the thousandth
  if (e.result.seed != null) parts.push(`Seed ${e.result.seed}${e.result.qual ? ` (${e.result.bo != null ? e.result.qual.mark.toFixed(3) : e.result.qual.mark})` : ''}`);
  for (const m of st.matches) {
    if (!m.out || m.bye || (m.a !== e.id && m.b !== e.id) || (!m.out.ends.length && !m.out.walkover)) continue;
    const A = entries.find((x) => x.id === m.a)?.result.mp?.[m.key], B = entries.find((x) => x.id === m.b)?.result.mp?.[m.key];
    parts.push(`${roundShort(m.round, st.rounds)} ${m.decided ? (m.winner === e.id ? 'W' : 'L') : '…'} ${outcomeText(m.out, A, B, m.b === e.id)}`);
  }
  return parts.join(' · ');
}

