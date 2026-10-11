/**
 * SD-134 — prize categories inside ONE field (pure, RN-free): chess category
 * prizes (best U-9 / U-11 / U-13, best girl, best unrated, rating bands) and
 * golf divisions on one leaderboard (Boys U-12 / U-15, Girls …). One shared
 * filter: a category is a set of conditions on a player — gender, age on the
 * event's cut-off day, rating on the event's list (or unrated) — and the
 * organiser can add or drop a player by hand (no age on the profile, a
 * guest …).
 *
 * The category board is the OVERALL ranking filtered to the category, so the
 * places inside it follow the event's own order (tie-breaks, countback) —
 * nothing is re-ranked. Prize rule (organiser option, common Indian open /
 * school practice — not a FIDE rule): `onePrize` (default on) — a player gets
 * one prize only: overall prize winners and earlier categories' winners are
 * passed over and the next player in the category takes the prize.
 *
 * Saved on the tournament's sport format as one JSON string
 * (`formats[sport].prizeCats`) — zero migration; absent = no categories.
 */
import { ageCutoff, meetAgeOf, type AgeBasis } from '../core/age.ts';

export type PrizeGender = 'F' | 'M';

export interface PrizeCategory {
  id: string;
  label: string;
  gender?: PrizeGender;
  /** under this age on the cut-off day ("U-12" = 11 or younger) */
  under?: number;
  /** this age or older (seniors / veterans) */
  minAge?: number;
  /** chess: unrated only */
  unrated?: boolean;
  /** chess: rating band [ratingMin, ratingMax] on the event's list (inclusive) */
  ratingMin?: number;
  ratingMax?: number;
  /** prizes in this category (default: the event's `places`) */
  places?: number;
}

export interface PrizeSetup {
  v: 1;
  cats: PrizeCategory[];
  /** which day ages are counted on (core/age.ts) — chess default 1 Jan (FIDE
   *  youth: "under 12 on 1 January"), golf default 31 Dec (verify) */
  ageOn?: AgeBasis;
  /** prizes per category (default 3) */
  places?: number;
  /** overall (main) prizes — the ones a category winner can't also take (default 3) */
  mainPlaces?: number;
  /** a player takes one prize only (default true) */
  onePrize?: boolean;
  /** organiser's hand edits: category id → ids added / dropped */
  add?: Record<string, string[]>;
  drop?: Record<string, string[]>;
}

export const PRIZE_KEY = 'prizeCats';
export const DEFAULT_PLACES = 3;
export const DEFAULT_MAIN_PLACES = 3;

/** What a category reads about a player. */
export interface PrizePerson { id?: string; gender?: string; dob?: string; age?: number }

/** Free-form profile gender → F / M (anything else → unknown). */
export function genderOf(g?: string | null): PrizeGender | undefined {
  const t = String(g ?? '').trim().toLowerCase();
  if (!t) return undefined;
  if (/^(f|female|girl|girls|woman|women|w)$/.test(t) || t.startsWith('female') || t.startsWith('girl') || t.startsWith('wom')) return 'F';
  if (/^(m|male|boy|boys|man|men)$/.test(t) || t.startsWith('male') || t.startsWith('boy')) return 'M';
  return undefined;
}

/* ------------------------------- presets -------------------------------- */

const cat = (id: string, label: string, c: Omit<PrizeCategory, 'id' | 'label'> = {}): PrizeCategory => ({ id, label, ...c });

/** Chess: the usual school / open categories (organisers pick the ones they award). */
export const CHESS_PRESETS: PrizeCategory[] = [
  cat('u9', 'U-9', { under: 9 }), cat('u11', 'U-11', { under: 11 }), cat('u13', 'U-13', { under: 13 }),
  cat('u15', 'U-15', { under: 15 }), cat('u17', 'U-17', { under: 17 }),
  cat('girls', 'Best girl / woman', { gender: 'F' }), cat('unrated', 'Best unrated', { unrated: true }),
  cat('b1600', 'Rated below 1600', { ratingMax: 1599 }), cat('b1400', 'Rated below 1400', { ratingMax: 1399 }),
  cat('vet', 'Veterans 60+', { minAge: 60 }),
];

/** Golf: junior divisions on one field (Boys / Girls × U-12 / U-15 / U-18). */
export const GOLF_PRESETS: PrizeCategory[] = [
  cat('bu12', 'Boys U-12', { gender: 'M', under: 12 }), cat('bu15', 'Boys U-15', { gender: 'M', under: 15 }), cat('bu18', 'Boys U-18', { gender: 'M', under: 18 }),
  cat('gu12', 'Girls U-12', { gender: 'F', under: 12 }), cat('gu15', 'Girls U-15', { gender: 'F', under: 15 }), cat('gu18', 'Girls U-18', { gender: 'F', under: 18 }),
  cat('ladies', 'Ladies', { gender: 'F' }), cat('seniors', 'Seniors 50+', { minAge: 50 }),
];

export const presetsFor = (sport: string): PrizeCategory[] => (sport === 'golf' ? GOLF_PRESETS : CHESS_PRESETS);
export const defaultAgeOn = (sport: string): AgeBasis => (sport === 'golf' ? 'dec31' : 'jan1');

/* ------------------------------ read / write ----------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi ? Math.floor(n) : undefined;
};

export function prizeSetupOf(fmt?: Record<string, unknown> | null): PrizeSetup | null {
  const raw = fmt?.[PRIZE_KEY];
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } }
  if (!isObj(o) || !Array.isArray(o.cats)) return null;
  const cats: PrizeCategory[] = [];
  for (const c of o.cats) {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.label !== 'string' || !c.id || !c.label.trim()) continue;
    if (cats.some((x) => x.id === c.id)) continue;
    cats.push({
      id: c.id, label: c.label.trim().slice(0, 40),
      ...(c.gender === 'F' || c.gender === 'M' ? { gender: c.gender } : {}),
      ...(num(c.under, 1, 120) !== undefined ? { under: num(c.under, 1, 120) } : {}),
      ...(num(c.minAge, 1, 120) !== undefined ? { minAge: num(c.minAge, 1, 120) } : {}),
      ...(c.unrated === true ? { unrated: true } : {}),
      ...(num(c.ratingMin, 0, 3500) !== undefined ? { ratingMin: num(c.ratingMin, 0, 3500) } : {}),
      ...(num(c.ratingMax, 0, 3500) !== undefined ? { ratingMax: num(c.ratingMax, 0, 3500) } : {}),
      ...(num(c.places, 1, 20) !== undefined ? { places: num(c.places, 1, 20) } : {}),
    });
  }
  const ids = (v: unknown): Record<string, string[]> | undefined => {
    if (!isObj(v)) return undefined;
    const out: Record<string, string[]> = {};
    for (const [k, list] of Object.entries(v)) if (Array.isArray(list)) { const l = list.filter((x): x is string => typeof x === 'string'); if (l.length) out[k] = [...new Set(l)]; }
    return Object.keys(out).length ? out : undefined;
  };
  const add = ids(o.add); const drop = ids(o.drop);
  return {
    v: 1, cats,
    ...(typeof o.ageOn === 'string' && o.ageOn ? { ageOn: o.ageOn } : {}),
    ...(num(o.places, 1, 20) !== undefined ? { places: num(o.places, 1, 20) } : {}),
    ...(num(o.mainPlaces, 0, 50) !== undefined ? { mainPlaces: num(o.mainPlaces, 0, 50) } : {}),
    ...(o.onePrize === false ? { onePrize: false } : {}),
    ...(add ? { add } : {}), ...(drop ? { drop } : {}),
  };
}

export const prizeSetupPatch = (p: PrizeSetup | null): Record<string, string> => ({ [PRIZE_KEY]: p && p.cats.length ? JSON.stringify(p) : '' });

/* ------------------------------- membership ------------------------------ */

export interface PrizeContext {
  /** the cut-off day, YYYY-MM-DD (ageCutoff of the setup's basis and the event's first day) */
  cutoff: string;
  /** the player behind an entrant / leaderboard row id */
  personOf: (id: string) => PrizePerson | undefined;
  /** rating on the event's list (chess) */
  ratingOf?: (id: string) => number | undefined;
  /** server ages on the cut-off (private DOBs), when known */
  serverAge?: Map<string, number>;
}

/** The context for a setup and an event start (YYYY-MM-DD or ISO). */
export function prizeCutoff(setup: Pick<PrizeSetup, 'ageOn'> | null, sport: string, eventStart?: string, today?: Date): string {
  return ageCutoff(setup?.ageOn ?? defaultAgeOn(sport), eventStart, today);
}

/** Does the category's rule hold for this player? undefined = can't tell
 *  (the profile has no age / gender for a rule that needs it). */
export function matchesRule(c: PrizeCategory, id: string, ctx: PrizeContext): boolean | undefined {
  const p = ctx.personOf(id);
  let unknown = false;
  if (c.gender) {
    const g = genderOf(p?.gender);
    if (!g) unknown = true; else if (g !== c.gender) return false;
  }
  if (c.under !== undefined || c.minAge !== undefined) {
    const a = meetAgeOf(p ? { ...p } : undefined, ctx.cutoff, ctx.serverAge);
    if (a === undefined) unknown = true;
    else {
      if (c.under !== undefined && a >= c.under) return false;
      if (c.minAge !== undefined && a < c.minAge) return false;
    }
  }
  if (c.unrated || c.ratingMin !== undefined || c.ratingMax !== undefined) {
    const r = ctx.ratingOf?.(id);
    if (c.unrated && r !== undefined) return false;
    if (c.ratingMin !== undefined && (r === undefined || r < c.ratingMin)) return false;
    // a "below 1600" band includes the unrated (the usual open-event reading)
    if (c.ratingMax !== undefined && r !== undefined && r > c.ratingMax) return false;
  }
  return unknown ? undefined : true;
}

/** In the category: the organiser's hand edits first, then the rule. */
export function inCategory(setup: Pick<PrizeSetup, 'add' | 'drop'>, c: PrizeCategory, id: string, ctx: PrizeContext): boolean {
  if (setup.drop?.[c.id]?.includes(id)) return false;
  if (setup.add?.[c.id]?.includes(id)) return true;
  return matchesRule(c, id, ctx) === true;
}

/** Entrants the rule can't place (no age / gender on the profile) and that
 *  the organiser hasn't placed by hand — shown so they can be added. */
export function unknownFor(setup: Pick<PrizeSetup, 'add' | 'drop'>, c: PrizeCategory, ids: string[], ctx: PrizeContext): string[] {
  return ids.filter((id) => !setup.add?.[c.id]?.includes(id) && !setup.drop?.[c.id]?.includes(id) && matchesRule(c, id, ctx) === undefined);
}

/** A row of a ranked board (chess standings / golf leaderboard). */
export interface RankedLike { id: string; position?: number | null }

export interface CategoryRow<R> { row: R; /** place inside the category (shared on a tie) */ place: number | null; label: string }

/**
 * The category board: the overall ranking filtered to the category. Places
 * are renumbered inside it; rows level overall (same `position`) share a
 * place ("T2"). Rows without a position (WD, MC) keep no place.
 */
export function categoryBoard<R extends RankedLike>(rows: R[], setup: PrizeSetup, c: PrizeCategory, ctx: PrizeContext): CategoryRow<R>[] {
  const mine = rows.filter((r) => inCategory(setup, c, r.id, ctx));
  const out: CategoryRow<R>[] = [];
  let place = 0;
  mine.forEach((r, i) => {
    if (r.position == null) { out.push({ row: r, place: null, label: '–' }); return; }
    const prev = mine[i - 1];
    if (!(prev && prev.position != null && prev.position === r.position)) place = out.filter((x) => x.place != null).length + 1;
    out.push({ row: r, place, label: String(place) });
  });
  // "T" for shared places
  const count = new Map<number, number>();
  for (const x of out) if (x.place != null) count.set(x.place, (count.get(x.place) ?? 0) + 1);
  return out.map((x) => (x.place != null && (count.get(x.place) ?? 0) > 1 ? { ...x, label: `T${x.place}` } : x));
}

export interface PrizeAward { catId: string; label: string; place: number; id: string }

/**
 * Who takes each category's prizes. With `onePrize` (default) a player who
 * won an overall prize (top `mainPlaces` of the overall board) or a prize in
 * an EARLIER category (the setup's order = the organiser's priority) is
 * passed over; the next player in the category moves up.
 */
export function prizeAwards<R extends RankedLike>(rows: R[], setup: PrizeSetup, ctx: PrizeContext): { main: string[]; byCat: Map<string, PrizeAward[]> } {
  const onePrize = setup.onePrize !== false;
  const mainN = setup.mainPlaces ?? DEFAULT_MAIN_PLACES;
  const placed = rows.filter((r) => r.position != null);
  const main = placed.slice(0, mainN).map((r) => r.id);
  const taken = new Set(onePrize ? main : []);
  const byCat = new Map<string, PrizeAward[]>();
  for (const c of setup.cats) {
    const n = c.places ?? setup.places ?? DEFAULT_PLACES;
    const list: PrizeAward[] = [];
    for (const x of categoryBoard(rows, setup, c, ctx)) {
      if (list.length >= n) break;
      if (x.place == null || taken.has(x.row.id)) continue;
      list.push({ catId: c.id, label: c.label, place: list.length + 1, id: x.row.id });
    }
    if (onePrize) for (const a of list) taken.add(a.id);
    byCat.set(c.id, list);
  }
  return { main, byCat };
}

/** A short rule text: "Girls · under 12 on 1 Jan 2027" / "Unrated" / "Rated 1400–1599". */
export function ruleText(c: PrizeCategory): string {
  const parts: string[] = [];
  if (c.gender) parts.push(c.gender === 'F' ? 'Girls / women' : 'Boys / men');
  if (c.under !== undefined) parts.push(`under ${c.under}`);
  if (c.minAge !== undefined) parts.push(`${c.minAge} or older`);
  if (c.unrated) parts.push('unrated');
  if (c.ratingMin !== undefined && c.ratingMax !== undefined) parts.push(`rated ${c.ratingMin}–${c.ratingMax}`);
  else if (c.ratingMin !== undefined) parts.push(`rated ${c.ratingMin}+`);
  else if (c.ratingMax !== undefined) parts.push(`rated up to ${c.ratingMax} (or unrated)`);
  return parts.join(' · ') || 'Hand-picked';
}
