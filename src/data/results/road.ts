/**
 * SD-92 — athletics road races, race walks and cross-country on the results
 * engine. Pure.
 *
 *  - Ranking: the order of finish (`fin`, tapped as athletes cross the line,
 *    TR 55 / 56); a time per athlete is optional (gun time by default — the
 *    official time, TR 19.25; chip / net when the meet says so). Statuses DNF,
 *    DNS, DQ. Race walks keep a red-card count per walker: 3 red cards from
 *    different judges disqualify (TR 54.7.1), or with the Penalty Zone rule 3
 *    send the walker to the zone and the 4th disqualifies (TR 54.7.3–54.7.4).
 *  - Team scoring by placings (cross-country and road): the places of each
 *    team's first N finishers are added; lowest total wins; equal totals → the
 *    team whose last scoring runner finished closer to first (the World
 *    Athletics Cross Country Championships rule, from memory; NFHS schools use
 *    the 6th runner instead); a team with fewer than N finishers is not ranked.
 *    Places are counted three ways (`TeamBasis`, see roadDefs.ts).
 *  - Records: a road / walk time sets a meet / school record only on a
 *    certified course with gun timing; cross-country keeps no records and no
 *    PBs (every course is different). Rule numbers from memory — verify.
 */
import type { DisciplineDef, EntryResult, PhaseFormat, RankedEntry, ResultEntry, ResultFlag, ResultStatus } from './model.ts';
import { STATUS_ORDER, disciplineOf } from './model.ts';
import { formatMark } from './marks.ts';
import { sharedPositions } from './positions.ts';
import type { Award, PointsConfig } from './medals.ts';
import { DEFAULT_EVENT_POINTS } from './medals.ts';
import { roadEventOf, dqCards, penaltyMinutes, type RoadFormat, type TeamBasis, type TeamScoring } from './roadDefs.ts';

export * from './roadDefs.ts';

const statusOf = (e: ResultEntry) => (e.result?.status ?? 'ok') as ResultStatus;
const ok = (e: ResultEntry) => statusOf(e) === 'ok';

/** Is this a road / walk / XC discipline? */
export const isRoadDiscipline = (def?: Pick<DisciplineDef, 'tie'> | null): boolean => def?.tie === 'road';

/* --------------------------------- ranking --------------------------------- */

/**
 * Rank a road / walk / XC race by the order of finish. `best` = the athlete's
 * own time (if typed), `bestLegal` = the same unless it's a cross-country race
 * (no PBs) — record eligibility is the course's (see `roadRecordsAllowed`).
 * Unplaced athletes still in the race come next (start order), then DNF, DQ, DNS.
 */
export function rankRoad(entries: ResultEntry[], def: DisciplineDef): RankedEntry[] {
  const xc = roadEventOf(def.key)?.kind === 'xc';
  const placed = entries.filter((e) => ok(e) && e.result?.fin != null).sort((a, b) => a.result.fin! - b.result.fin!);
  const out: RankedEntry[] = placed.map((e, i) => {
    const t = e.result.mark ?? null;
    return {
      id: e.id, entry: e, position: i + 1, label: String(i + 1), tie: false, status: 'ok', best: t,
      bestText: t != null ? formatMark(t, def) : '', legal: t != null && !xc, bestLegal: xc ? null : t, flags: [] as ResultFlag[],
    };
  });
  const startOrder = (e: ResultEntry) => Number(e.result?.bib) || e.result?.order || 9999;
  for (const e of entries.filter((x) => ok(x) && x.result?.fin == null).sort((a, b) => startOrder(a) - startOrder(b))) {
    out.push({ id: e.id, entry: e, position: null, label: '', tie: false, status: 'ok', best: null, bestText: '', legal: false, bestLegal: null, flags: [] });
  }
  for (const e of entries.filter((x) => !ok(x)).sort((a, b) => STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)] || startOrder(a) - startOrder(b))) {
    out.push({ id: e.id, entry: e, position: null, label: statusOf(e), tie: false, status: statusOf(e), best: null, bestText: '', legal: false, bestLegal: null, flags: [] });
  }
  return out;
}

/** May this race set a meet / school record? Road / walk: a certified course
 *  with gun timing (TR 55.2, CR 31 — from memory); cross-country never. */
export function roadRecordsAllowed(f?: Pick<PhaseFormat, 'discipline' | 'road'> | null): boolean {
  const e = roadEventOf(f?.discipline);
  if (!e) return true;
  if (e.kind === 'xc') return false;
  if (e.kind === 'walk' && e.track) return (f?.road?.timing ?? 'gun') === 'gun';
  return !!f?.road?.certified && (f.road.timing ?? 'gun') === 'gun';
}

/* -------------------------------- finish entry -------------------------------- */

/** "3412" → 34:12, "13405" → 1:34:05, "1:34:05" as typed; a track walk keeps hundredths ("13:05.42"). */
export function parseRoadTime(text: string, def: Pick<DisciplineDef, 'dp'>): number | null {
  const t = text.trim().replace(/\s+/g, '');
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    if (t.length > 6 || /^0+$/.test(t)) return null;
    const ss = Number(t.slice(-2)), mm = Number(t.slice(-4, -2) || 0), hh = Number(t.slice(0, -4) || 0);
    if (t.length > 2 && ss >= 60) return null;
    if (t.length > 4 && mm >= 60) return null;
    return hh * 3600 + mm * 60 + ss;
  }
  const parts = t.replace(',', '.').split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p)) || parts.slice(0, -1).some((p) => p.includes('.'))) return null;
  const nums = parts.map(Number);
  if (parts.length > 1 && nums.slice(1).some((n) => n >= 60)) return null;
  const secs = nums.reduce((a, n) => a * 60 + n, 0);
  if (!(secs > 0)) return null;
  // TR 19.24: road times go to the NEXT longer whole second; a track walk to the next 1/100
  const scale = 10 ** def.dp;
  return Math.ceil(secs * scale - 1e-9) / scale;
}

/** The entry whose bib is `bib` (trimmed, case-insensitive) — null if none / several. */
export function entryByBib(entries: ResultEntry[], bib: string): ResultEntry | null {
  const b = bib.trim().toLowerCase();
  if (!b) return null;
  const hits = entries.filter((e) => (e.result?.bib ?? '').trim().toLowerCase() === b);
  return hits.length === 1 ? hits[0] : null;
}

/** A time out of step with the order: faster than someone who finished ahead, or slower than someone behind. */
export function orderClash(entries: ResultEntry[], id: string, time: number): string | null {
  const me = entries.find((e) => e.id === id);
  const f = me?.result?.fin;
  if (f == null) return null;
  for (const e of entries) {
    if (e.id === id || e.result?.fin == null || e.result.mark == null || !ok(e)) continue;
    if (e.result.fin < f && e.result.mark > time) return `${e.name} finished ahead (place ${e.result.fin}) with a slower time.`;
    if (e.result.fin > f && e.result.mark < time) return `${e.name} finished behind (place ${e.result.fin}) with a faster time.`;
  }
  return null;
}

/* --------------------------------- race walks --------------------------------- */

export interface WalkCards { cards: number; dq: boolean; penalty: boolean; text: string }

/** A walker's red cards and what they mean under this race's rules. */
export function walkCards(r: Pick<EntryResult, 'rc'>, road?: RoadFormat, metres = 0): WalkCards {
  const cards = r.rc ?? 0;
  const lim = dqCards(road?.penaltyZone);
  const dq = cards >= lim;
  const penalty = !!road?.penaltyZone && cards === lim - 1;
  const text = !cards ? '' : dq ? `${cards} red cards — DQ (TR 54.7)` : penalty ? `${cards} red cards — penalty zone ${penaltyMinutes(metres)} min` : `${cards} red card${cards === 1 ? '' : 's'}`;
  return { cards, dq, penalty, text };
}

/* -------------------------------- team scoring -------------------------------- */

export interface TeamRunner { id: string; name: string; athleteId?: string; overall: number; place: number | null; scoring: boolean }
export interface TeamResult {
  key: string;
  name: string;
  teamId?: string;
  colorHex?: string;
  /** null = not ranked (an incomplete team) */
  position: number | null;
  label: string;
  tie: boolean;
  /** sum of the scoring runners' places; null when incomplete */
  total: number | null;
  /** the last scoring runner's place (the tie-break) */
  last?: number;
  runners: TeamRunner[];
  complete: boolean;
}

const teamKey = (e: ResultEntry) => (e.team?.id ? `id:${e.team.id}` : e.team?.name ? `n:${e.team.name.trim().toLowerCase()}` : null);

/**
 * Team scores from a road / XC ranking. Each team's runners are its first
 * `size` finishers (later ones run as individuals); a team with fewer than
 * `scorers` finishers is incomplete (listed, not ranked). Team places by
 * `basis` (roadDefs.ts). Lowest total wins; equal totals → the lower place of
 * the last scorer; still equal → shared.
 */
export function teamScores(ranked: RankedEntry[], cfg: TeamScoring): TeamResult[] {
  const finishers = ranked.filter((r) => r.position != null).sort((a, b) => a.position! - b.position!);
  const teams = new Map<string, { name: string; teamId?: string; colorHex?: string; rows: RankedEntry[] }>();
  for (const r of ranked) {
    const k = teamKey(r.entry);
    if (!k) continue;
    const t = teams.get(k) ?? { name: r.entry.team!.name, teamId: r.entry.team!.id, colorHex: r.entry.team!.colorHex, rows: [] };
    if (r.position != null) t.rows.push(r);
    teams.set(k, t);
  }
  const N = Math.max(1, cfg.scorers);
  const size = Math.max(N, cfg.size ?? 99);
  // the team's runners (first `size` finishers) and its scorers (first N of those)
  const runnerOf = new Map<string, string>();
  const scorerIds = new Set<string>();
  const complete = new Set<string>();
  for (const [k, t] of teams) {
    t.rows.sort((a, b) => a.position! - b.position!);
    const runners = t.rows.slice(0, size);
    runners.forEach((r, i) => { runnerOf.set(r.id, k); if (i < N) scorerIds.add(r.id); });
    if (runners.length >= N) complete.add(k);
  }
  // team places
  const place = new Map<string, number>();
  let p = 0;
  for (const r of finishers) {
    const k = runnerOf.get(r.id);
    const counts = cfg.basis === 'overall' ? true : !!k && complete.has(k) && (cfg.basis === 'teams' || scorerIds.has(r.id));
    if (cfg.basis === 'overall') place.set(r.id, r.position!);
    else if (counts) place.set(r.id, ++p);
  }
  const rows: TeamResult[] = [...teams].map(([k, t]) => {
    const runners = t.rows.slice(0, size).map((r): TeamRunner => ({ id: r.id, name: r.entry.name, athleteId: r.entry.athleteId, overall: r.position!, place: place.get(r.id) ?? null, scoring: scorerIds.has(r.id) && complete.has(k) }));
    const scoring = runners.filter((r) => r.scoring);
    const full = complete.has(k);
    return {
      key: k, name: t.name, teamId: t.teamId, colorHex: t.colorHex, position: null, label: '', tie: false, complete: full, runners,
      total: full ? scoring.reduce((s, r) => s + (r.place ?? 0), 0) : null, last: full ? scoring[scoring.length - 1]?.place ?? undefined : undefined,
    };
  });
  const ranked2 = rows.filter((r) => r.complete).sort((a, b) => a.total! - b.total! || (a.last ?? 0) - (b.last ?? 0) || a.name.localeCompare(b.name));
  const same = (a: TeamResult, b: TeamResult) => a.total === b.total && a.last === b.last;
  sharedPositions(ranked2, same).forEach((x, i) => { ranked2[i].position = x.position; ranked2[i].tie = x.tie; ranked2[i].label = `${x.tie ? '=' : ''}${x.position}`; });
  const rest = rows.filter((r) => !r.complete).sort((a, b) => b.runners.length - a.runners.length || a.name.localeCompare(b.name));
  for (const r of rest) r.label = 'inc';
  return [...ranked2, ...rest];
}

/** Two complete teams level on total, separated only by the last scorer (shown on the sheet). */
export function tieBrokenByLast(rows: TeamResult[]): Set<string> {
  const out = new Set<string>();
  const done = rows.filter((r) => r.complete);
  for (const a of done) if (done.some((b) => b !== a && b.total === a.total && b.last !== a.last)) out.add(a.key);
  return out;
}

/** "1 + 3 + 6 + 8 = 18" (scorers' team places) and the non-scorers in brackets. */
export function teamLine(t: TeamResult): string {
  const sc = t.runners.filter((r) => r.scoring).map((r) => r.place ?? '–');
  const non = t.runners.filter((r) => !r.scoring).map((r) => r.place ?? '–');
  if (!t.complete) return `${t.runners.length} finished — incomplete`;
  return `${sc.join(' + ')} = ${t.total}${non.length ? `  (${non.join(', ')})` : ''}`;
}

/** Team medals / points: the meet's position points for each ranked team (ties share). */
export function teamAwards(rows: TeamResult[], cfg: PointsConfig = {}): Award[] {
  const table = cfg.positionPoints?.length ? cfg.positionPoints : DEFAULT_EVENT_POINTS;
  const ranked = rows.filter((r) => r.position != null);
  const MED = ['gold', 'silver', 'bronze'] as const;
  return ranked.map((r) => {
    const pos = r.position!;
    const group = ranked.filter((x) => x.position === pos).length;
    let points = table[pos - 1] ?? 0;
    if (group > 1 && (cfg.ties ?? 'share') === 'share') {
      let sum = 0;
      for (let i = 0; i < group; i++) sum += table[pos - 1 + i] ?? 0;
      points = Math.round((sum / group) * 100) / 100;
    }
    return { entryId: `team:${r.key}`, name: r.name, team: { id: r.teamId, name: r.name, colorHex: r.colorHex }, position: pos, medal: MED[pos - 1], points };
  });
}

/** What the setup / sheet says about the team rule. */
export function describeTeamScoring(t: TeamScoring): string {
  const basis: Record<TeamBasis, string> = {
    teams: 'places counted among complete teams only — individuals and incomplete teams are left out; a team’s non-scorers still take a place (they “displace”)',
    overall: 'everyone’s overall finishing place counts, individuals included',
    scorers: 'places counted among scoring runners only — non-scorers don’t displace',
  };
  return `Team score: first ${t.scorers}${t.size ? ` of up to ${t.size}` : ''} finishers per team, ${basis[t.basis]}. Lowest total wins; equal totals → the team whose last scorer finished higher. Fewer than ${t.scorers} finishers: not ranked.`;
}

/* --------------------------------- stat lines --------------------------------- */

export interface RoadLine { playerId: string; stats: Record<string, number>; won: boolean }

/**
 * The stat lines a finished road / walk / XC race writes (one per athlete):
 * races + road / walks / xc, place, the time (and its legal key `m_<kind>_<m>`
 * for PBs — not cross-country), dnf / dq, red cards, individual medals and
 * points, and — with team scoring — the team's place, team medals and whether
 * the athlete scored for the team.
 */
export function roadLines(f: Pick<PhaseFormat, 'discipline' | 'road'>, ranked: RankedEntry[], awards: Award[] = [], teams: TeamResult[] = [], tAwards: Award[] = []): RoadLine[] {
  const def = disciplineOf(f.discipline);
  const ev = roadEventOf(f.discipline);
  if (!def || !ev) return [];
  const byEntry = new Map(awards.map((a) => [a.entryId, a]));
  const teamOf = new Map<string, { t: TeamResult; scoring: boolean }>();
  for (const t of teams) for (const r of t.runners) teamOf.set(r.id, { t, scoring: r.scoring });
  const tAward = new Map(tAwards.map((a) => [a.entryId, a]));
  const out: RoadLine[] = [];
  for (const r of ranked) {
    if (r.status === 'DNS' || r.status === 'WD' || !r.entry.athleteId) continue;
    const s: Record<string, number> = { races: 1, finals: 1, [ev.kind === 'road' ? 'road' : ev.kind === 'walk' ? 'walks' : 'xc']: 1 };
    const a = byEntry.get(r.id);
    if (r.position != null) s.place = r.position;
    if (r.status === 'DNF') s.dnf = 1;
    if (r.status === 'DQ') s.dq = 1;
    if (a?.medal === 'gold') s.golds = 1; else if (a?.medal === 'silver') s.silvers = 1; else if (a?.medal === 'bronze') s.bronzes = 1;
    if (a && a.points > 0) s.posPoints = a.points;
    if (r.best != null) s.mark = r.best;
    if (r.bestLegal != null) s[roadMarkKey(def.key)] = r.bestLegal;
    if (r.entry.result.rc) s.walkCards = r.entry.result.rc;
    const tm = teamOf.get(r.id);
    if (tm) {
      if (tm.scoring) s.teamScorer = 1;
      if (tm.t.position != null) s.teamPlace = tm.t.position;
      const ta = tAward.get(`team:${tm.t.key}`);
      if (ta?.medal === 'gold') s.teamGolds = 1; else if (ta?.medal === 'silver') s.teamSilvers = 1; else if (ta?.medal === 'bronze') s.teamBronzes = 1;
    }
    out.push({ playerId: r.entry.athleteId, stats: s, won: a?.medal === 'gold' });
  }
  return out;
}

/** 'ath.road.10000' → 'm_road_10000', 'ath.road.hm' → 'm_road_hm', 'ath.walk.t3000' → 'm_walk_t3000'. */
export const roadMarkKey = (discipline: string) => `m_${discipline.replace(/^ath\./, '').replace('.', '_')}`;
/** The discipline a road mark key came from (null if it isn't one). */
export function roadKeyDiscipline(key: string): string | null {
  const m = /^m_(road|walk|xc)_(t?(?:hm|mar|\d{3,6}))$/.exec(key);
  if (!m) return null;
  const d = `ath.${m[1]}.${m[2]}`;
  return roadEventOf(d) ? d : null;
}

/* ------------------------------ meet-level results ------------------------------ */

/** The team table of a finished road / XC phase (empty without team scoring). */
export function phaseTeams(f: Pick<PhaseFormat, 'discipline' | 'road'>, ranked: RankedEntry[]): TeamResult[] {
  return f.road?.team ? teamScores(ranked, f.road.team) : [];
}

/** Share text for the team table. */
export function teamText(rows: TeamResult[]): string {
  if (!rows.length) return '';
  return ['', 'TEAMS', ...rows.map((t) => `${t.complete ? `${t.label}.` : 'inc.'} ${t.name} ${t.complete ? `${t.total} pts (${t.runners.filter((r) => r.scoring).map((r) => r.place).join('+')})` : `(${t.runners.length} finished)`}`)].join('\n');
}

/** The detail line under an athlete on the results sheet: a walker's red cards (the bib has its own column). */
export function roadRowText(r: RankedEntry, f?: Pick<PhaseFormat, 'discipline' | 'road'> | null): string {
  const ev = roadEventOf(f?.discipline);
  const res = r.entry.result ?? {};
  return [ev?.kind === 'walk' ? walkCards(res, f?.road, ev.metres).text : ''].filter(Boolean).join(' · ');
}
