/**
 * SD-137b — team events for the results-engine sports. Pure.
 *
 *  - archery team (3) / mixed team (1 + 1) and shooting teams of 3 are ranked on
 *    their members' scores in the individual event (ranking round /
 *    qualification): a team row keeps one MemberScore per member (`ms`) and its
 *    `mark` / `tens` / `xs` / `series` are their sums — so the usual ranking
 *    (inner-count / ISSF) and records work on the team row unchanged;
 *  - a member's score is taken from the individual event (by player id) or
 *    typed by the official (a member who shot elsewhere);
 *  - "best of each house" suggests a team from the individual results;
 *  - team results credit every member: `teamLines` turns a team row's stats
 *    into one stat line per member (team medals, team matches) — never the
 *    member's individual keys (a team score is not their PB).
 */
import type { EntryResult, MemberScore, RankedEntry, ResultEntry } from './model.ts';
import { archTeamOf } from './archeryDefs.ts';
import { shootTeamOf, shootEventOf, sumTenths, fromTenths } from './shootingDefs.ts';
import { cycEventOf } from './cyclingDefs.ts';

/** Is this discipline a team event that credits members as a team (SD-137b)? */
export function isTeamEventKey(key?: string | null): boolean {
  return !!archTeamOf(key) || !!shootTeamOf(key) || !!cycEventOf(key)?.riders;
}

/** A team row (no athlete, members listed). */
export const isTeamRow = (e: Pick<ResultEntry, 'athleteId' | 'result'>): boolean => !e.athleteId && !!e.result?.members?.length;

/** What a member's individual row gives the team: score, 10s, X / inner tens, series. */
export function memberScoreOf(r: EntryResult | undefined, playerId?: string): MemberScore {
  // a bracket / final row reads as its qualification score
  const q = r?.qual;
  const src = q && (r?.mp != null || Array.isArray(r?.fshots)) ? { mark: q.mark, tens: q.tens, xs: q.xs, series: q.series } : r;
  const out: MemberScore = { ...(playerId ? { playerId } : {}) };
  if (src?.mark != null) out.mark = src.mark;
  if (src?.tens != null) out.tens = src.tens;
  if (src?.xs != null) out.xs = src.xs;
  if (src?.series?.length) out.series = [...src.series];
  return out;
}

/** Each player's best row in the individual events (first phase rows), for the team ranking. */
export function memberLookup(rows: ResultEntry[]): Map<string, MemberScore> {
  const out = new Map<string, MemberScore>();
  for (const e of rows) {
    if (!e.athleteId || ['DNS', 'WD'].includes(e.result?.status ?? 'ok')) continue;
    const s = memberScoreOf(e.result, e.athleteId);
    const cur = out.get(e.athleteId);
    if (s.mark == null) { if (!cur) out.set(e.athleteId, s); continue; }
    if (!cur || cur.mark == null || s.mark > cur.mark) out.set(e.athleteId, s);
  }
  return out;
}

const addAll = (vals: (number | undefined)[], decimal: boolean): number | undefined =>
  (vals.some((v) => v == null) ? undefined : decimal ? fromTenths(sumTenths(vals as number[])) : (vals as number[]).reduce((a, v) => a + v, 0));

/**
 * The team's totals from its members' scores: the score only when every member
 * has one (a member with no score leaves the team without a total — type 0 for
 * a member who didn't shoot); 10s / X added; series added position by position
 * when every member has the same number (the team countback).
 */
export function teamTotals(ms: MemberScore[], size: number, decimal = false): Pick<EntryResult, 'mark' | 'tens' | 'xs' | 'series'> {
  const list = ms.slice(0, size);
  if (list.length < size) return { mark: undefined, tens: undefined, xs: undefined, series: undefined };
  const mark = addAll(list.map((m) => m.mark), decimal);
  const tens = list.some((m) => m.tens != null) ? list.reduce((a, m) => a + (m.tens ?? 0), 0) : undefined;
  const xs = list.some((m) => m.xs != null) ? list.reduce((a, m) => a + (m.xs ?? 0), 0) : undefined;
  const lens = new Set(list.map((m) => m.series?.length ?? 0));
  const n = lens.size === 1 ? [...lens][0] : 0;
  const series = n ? Array.from({ length: n }, (_, i) => addAll(list.map((m) => m.series![i]), decimal)!) : undefined;
  return { mark, tens, xs, series };
}

/** Is the discipline scored in tenths (decimal shooting)? */
const decimalOf = (discipline?: string): boolean => shootEventOf(discipline)?.scoring === 'decimal';
/** The team size for a team discipline (archery 3 / 2, shooting 3). */
export const teamSizeOf = (discipline?: string): number => archTeamOf(discipline)?.size ?? shootTeamOf(discipline)?.teamSize ?? cycEventOf(discipline)?.riders ?? 0;

/** A team row with its member scores set and the totals recomputed. */
export function withTeamScores(r: EntryResult, ms: MemberScore[], discipline: string): EntryResult {
  const t = teamTotals(ms, teamSizeOf(discipline) || ms.length, decimalOf(discipline));
  const next: EntryResult = { ...r, ms };
  for (const k of ['mark', 'tens', 'xs', 'series'] as const) {
    if (t[k] == null) delete next[k];
    else (next as Record<string, unknown>)[k] = t[k];
  }
  return next;
}

/** Fill every member's score from the individual events (a typed score is kept). */
export function fillFromIndividuals(r: EntryResult, lookup: Map<string, MemberScore>, discipline: string): { result: EntryResult; found: number; missing: string[] } {
  const members = r.members ?? [];
  let found = 0;
  const missing: string[] = [];
  const ms = members.map((m, i) => {
    // a score the official typed stays (a correction) — "take" never overwrites it
    const prev = r.ms?.[i];
    if (prev?.typed && prev.mark != null) return prev;
    const got = m.playerId ? lookup.get(m.playerId) : undefined;
    if (got && got.mark != null) { found += 1; return { ...got, playerId: m.playerId }; }
    missing.push(m.name);
    return { ...(m.playerId ? { playerId: m.playerId } : {}) };
  });
  return { result: withTeamScores(r, ms, discipline), found, missing };
}

/** Set (or clear) member `i`'s score by hand. */
export function setMemberScore(r: EntryResult, i: number, score: Omit<MemberScore, 'playerId' | 'typed'> | null, discipline: string): EntryResult {
  const members = r.members ?? [];
  const ms = members.map((m, j) => r.ms?.[j] ?? { ...(m.playerId ? { playerId: m.playerId } : {}) });
  ms[i] = score ? { ...score, ...(members[i]?.playerId ? { playerId: members[i].playerId } : {}), typed: true } : { ...(members[i]?.playerId ? { playerId: members[i].playerId } : {}) };
  return withTeamScores(r, ms, discipline);
}

/** "Asha 642 · Bina 630 · Chitra —" */
export function memberScoresText(r: EntryResult, fmt: (v: number) => string = String): string {
  return (r.members ?? []).map((m, i) => `${m.name.split(' ')[0]} ${r.ms?.[i]?.mark != null ? fmt(r.ms[i].mark!) : '—'}`).join(' · ');
}

/* ------------------------------ suggestions ------------------------------ */

export interface Candidate { playerId: string; teamKey: string; mark?: number; gender?: string }

/**
 * Best of each house: for every team / house, its best `size` scorers in the
 * individual event (mixed: the best man and the best woman). Highest score
 * first; players without a score are not suggested.
 */
export function bestOfHouse(cands: Candidate[], size: number, mixed = false): Map<string, string[]> {
  const by = new Map<string, Candidate[]>();
  for (const c of cands) if (c.mark != null) by.set(c.teamKey, [...(by.get(c.teamKey) ?? []), c]);
  const out = new Map<string, string[]>();
  for (const [k, list] of by) {
    const sorted = [...list].sort((a, b) => (b.mark ?? 0) - (a.mark ?? 0));
    if (mixed) {
      // genders as stored on profiles ('M' / 'Male' / 'boy' …)
      const g = (c: Candidate) => (c.gender ?? '').trim().toLowerCase();
      const m = sorted.find((c) => /^(m|male|man|boy)/.test(g(c))), w = sorted.find((c) => /^(f|female|woman|girl)/.test(g(c)));
      if (m && w) out.set(k, [m.playerId, w.playerId]);
    } else if (sorted.length >= size) out.set(k, sorted.slice(0, size).map((c) => c.playerId));
  }
  return out;
}

/* -------------------------------- stat lines -------------------------------- */

export interface TeamLine { playerId: string; stats: Record<string, number>; won: boolean }

/**
 * One line per member of a team row: `teamEv` (a team event), `place`,
 * medals, position points and any match counts the sport adds. A member's
 * individual keys (scores, PB keys, arrows …) are never written — the team's
 * score is the team's.
 */
export function teamLines(r: Pick<RankedEntry, 'entry' | 'position'>, extra: Record<string, number>, award?: { medal?: string; points: number }): TeamLine[] {
  const s: Record<string, number> = { teamEv: 1, ...extra };
  if (r.position != null) s.place = r.position;
  if (award?.medal === 'gold') s.golds = 1; else if (award?.medal === 'silver') s.silvers = 1; else if (award?.medal === 'bronze') s.bronzes = 1;
  if (award && award.points > 0) s.posPoints = award.points;
  const won = award?.medal === 'gold';
  return (r.entry.result?.members ?? []).filter((m) => !!m.playerId).map((m) => ({ playerId: m.playerId!, stats: { ...s }, won }));
}

/** Team events and team medals from a career's lines (`teamEv` lines). */
export function teamCareer(lines: { stats: Record<string, number> }[]): { events: number; golds: number; silvers: number; bronzes: number; won: number; lost: number } {
  const c = { events: 0, golds: 0, silvers: 0, bronzes: 0, won: 0, lost: 0 };
  for (const l of lines) {
    const s = l.stats ?? {};
    if (!s.teamEv) continue;
    c.events += 1;
    c.golds += s.golds ?? 0; c.silvers += s.silvers ?? 0; c.bronzes += s.bronzes ?? 0;
    c.won += s.tmW ?? 0; c.lost += s.tmL ?? 0;
  }
  return c;
}

/** "👥 Team events 2 · 🥇 1 🥈 1 · team matches 3–1 (included in the medals above)" — '' with none. */
export function teamCareerText(t: { events: number; golds: number; silvers: number; bronzes: number; won?: number; lost?: number }): string {
  if (!t.events) return '';
  const medals = [t.golds ? `🥇 ${t.golds}` : '', t.silvers ? `🥈 ${t.silvers}` : '', t.bronzes ? `🥉 ${t.bronzes}` : ''].filter(Boolean).join(' ');
  const matches = (t.won ?? 0) + (t.lost ?? 0) ? `team matches ${t.won ?? 0}–${t.lost ?? 0}` : '';
  return [`👥 Team events ${t.events}`, medals, matches].filter(Boolean).join(' · ') + (medals ? ' (included in the medals above)' : '');
}
