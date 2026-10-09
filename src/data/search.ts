/**
 * Global search helpers (parity #22). Pure — node tests load this, and the repo's
 * live and demo branches both run their rows through it so the two behave alike.
 */
import { looksLikeContact } from '../core/contactQuery.ts';
import { isLiveTournament } from './tournamentForm.ts';
import type { Match, SportId, Team, Tournament } from '../core/types';

/** Shortest query that searches (fewer letters would match nearly every row) —
 *  except a whole phone number or email, which is always an exact lookup. */
export const MIN_QUERY = 2;
/** Results kept per entity type. */
export const SEARCH_LIMIT = 20;
/** Max ids in one PostgREST `.in()` list — longer lists overrun the URL. */
export const SEARCH_ID_CAP = 50;

/** True when `q` is long enough to search (or is a contact lookup). */
export function isSearchable(q: string): boolean {
  const t = q.trim();
  return t.length >= MIN_QUERY || !!looksLikeContact(t);
}

/** "Red vs Blue" / "red v blue" / "red v/s blue" / "a x b" → ['Red', 'Blue'];
 *  anything else → [q]. Splits on the first separator only. */
export function parseVsQuery(q: string): [string] | [string, string] {
  const t = q.trim();
  const m = /\s+(?:vs?\.?|v\/s|x)\s+/i.exec(t);
  if (!m) return [t];
  const a = t.slice(0, m.index).trim();
  const b = t.slice(m.index + m[0].length).trim();
  if (!a || !b) return [t];
  return [a, b];
}

/** Make text safe to drop into a PostgREST `or()` filter: commas and brackets
 *  would split or nest the filter, and `%` / `*` are wildcards. */
export function orSafe(q: string): string {
  return q.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** How well one name matches: 0 exact · 1 starts with · 2 a word starts with ·
 *  3 contains · 4 no match. Blank query → 4 (no preference). */
export function nameTier(name: string | null | undefined, q: string): number {
  const n = norm(name ?? '');
  const needle = norm(q);
  if (!n || !needle) return 4;
  if (n === needle) return 0;
  if (n.startsWith(needle)) return 1;
  if (n.split(/[\s\-_./()&'’]+/).some((w) => w && w.startsWith(needle))) return 2;
  if (n.includes(needle)) return 3;
  return 4;
}

type Names = string | null | undefined | readonly (string | null | undefined)[];
/** Best tier across an item's names (e.g. name + short name). */
export function bestTier(names: Names, q: string): number {
  const list = Array.isArray(names) ? names : [names];
  return list.reduce<number>((best, n) => Math.min(best, nameTier(n as string | null | undefined, q)), 4);
}

/** Sort by match quality — exact, starts-with, word starts-with, contains, then
 *  rows the database matched on another field. Ties keep their input order
 *  (recency / activity). Does not mutate `items`. */
export function rankByName<T>(items: readonly T[], q: string, nameOf: (t: T) => Names): T[] {
  return items
    .map((item, i) => ({ item, i, tier: bestTier(nameOf(item), q) }))
    .sort((x, y) => x.tier - y.tier || x.i - y.i)
    .map((x) => x.item);
}

/** Keep the rows whose names contain `q`, best first — the demo's stand-in for
 *  the live `ilike` query. */
export function filterByName<T>(items: readonly T[], q: string, nameOf: (t: T) => Names): T[] {
  return rankByName(items.filter((t) => bestTier(nameOf(t), q) < 4), q, nameOf);
}

/** Distinct ids, first `max` kept (pass them best-ranked first). */
export function capIds(ids: Iterable<string | null | undefined>, max = SEARCH_ID_CAP): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** One team hit. A Club owns one team row per sport; those rows collapse into a
 *  single hit that lists every sport and every row id. */
export interface TeamHit { team: Team; sports: SportId[]; teamIds: string[] }

/** Collapse ranked team rows sharing a `clubId` into one hit (first row wins). */
export function collapseTeams(rows: readonly Team[]): TeamHit[] {
  const byKey = new Map<string, TeamHit>();
  for (const t of rows) {
    const key = t.clubId ? `club:${t.clubId}` : `team:${t.id}`;
    const hit = byKey.get(key);
    if (!hit) { byKey.set(key, { team: t, sports: [t.sport], teamIds: [t.id] }); continue; }
    if (!hit.sports.includes(t.sport)) hit.sports.push(t.sport);
    if (!hit.teamIds.includes(t.id)) hit.teamIds.push(t.id);
  }
  return [...byKey.values()];
}

/** Tournaments search may show — never a soft-deleted one (#09). */
export const liveOnly = (ts: readonly Tournament[]): Tournament[] => ts.filter(isLiveTournament);

/** The matches a search keeps. Without `b`: a side in `a` or the tournament in
 *  `tournamentIds`. With `b` ("A vs B"): one side in `a` and the other in `b`,
 *  either way round. A soft-deleted tournament's matches never show. Newest first. */
export function selectMatchHits(
  matches: readonly Match[],
  opts: { a: Iterable<string>; b?: Iterable<string>; tournamentIds?: Iterable<string>; deletedTournamentIds?: Iterable<string> },
): Match[] {
  const A = new Set(opts.a);
  const B = opts.b ? new Set(opts.b) : null;
  const T = new Set(opts.tournamentIds ?? []);
  const dead = new Set(opts.deletedTournamentIds ?? []);
  return matches
    .filter((m) => !(m.tournamentId && dead.has(m.tournamentId)))
    .filter((m) => {
      const h = m.homeTeam?.id, w = m.awayTeam?.id;
      if (B) return (A.has(h) && B.has(w)) || (B.has(h) && A.has(w));
      return A.has(h) || A.has(w) || (!!m.tournamentId && T.has(m.tournamentId));
    })
    .slice()
    .sort((x, y) => (y.startsAt ?? '').localeCompare(x.startsAt ?? ''));
}

/** A match's searchable names — both sides, full and short. */
export const matchNames = (m: Match) => [m.homeTeam?.name, m.homeTeam?.shortName, m.awayTeam?.name, m.awayTeam?.shortName];

export interface SearchResults<P = unknown> {
  players: P[];
  teams: TeamHit[];
  matches: Match[];
  tournaments: Tournament[];
}
export type SearchKind = keyof SearchResults;
export const SEARCH_KINDS: SearchKind[] = ['players', 'teams', 'matches', 'tournaments'];

/** Narrow teams / matches / tournaments to the picked sports (players are
 *  narrowed by the player query itself). No sports → unchanged. */
export function narrowBySports<P>(r: SearchResults<P>, sports?: readonly SportId[]): SearchResults<P> {
  if (!sports?.length) return r;
  const on = new Set(sports);
  return {
    players: r.players,
    teams: r.teams.filter((t) => t.sports.some((s) => on.has(s))),
    matches: r.matches.filter((m) => on.has(m.sport)),
    tournaments: r.tournaments.filter((t) => (t.sports ?? []).some((s) => on.has(s))),
  };
}

/** Section order for the "All" tab: types whose best hit is an exact name match
 *  move to the top; otherwise the default order. Empty types are dropped. */
export function orderSections(exact: Partial<Record<SearchKind, boolean>>, counts: Record<SearchKind, number>): SearchKind[] {
  const present = SEARCH_KINDS.filter((k) => counts[k] > 0);
  return [...present.filter((k) => exact[k]), ...present.filter((k) => !exact[k])];
}
