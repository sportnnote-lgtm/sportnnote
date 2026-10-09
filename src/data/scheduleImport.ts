/**
 * Bulk schedule import (parity #24): turn a pasted / uploaded spreadsheet into
 * validated match drafts. Pure — no RN imports — so node tests load it and the
 * screen (ImportScheduleScreen) only renders what this decides.
 *
 * The flow: text → `parseDelimited` (cells) → `toRawRows` (header → fields) →
 * `validateImport` (teams, dates, clashes) → one ImportRow per match, each
 * `ok` / `warn` (imports, but worth a look) / `error` (won't import).
 *
 * Forgiving on purpose: dates read day-first (India-first pilot), times take
 * most spreadsheet spellings, team names ignore case/punctuation and suggest a
 * near miss. It never invents a team — an unknown name is an error.
 */
import type { Match, SportId, Team, Tournament } from '../core/types';
import { findScheduleConflicts, type ConflictCandidate } from './scheduleConflicts.ts';
import { nameTier } from './search.ts';
import { wallTimeToIso } from '../core/time.ts';

/* --------------------------------- Columns -------------------------------- */

export type ImportField = 'date' | 'time' | 'home_team' | 'away_team' | 'venue' | 'group' | 'stage' | 'sport';
export const TEMPLATE_COLUMNS: ImportField[] = ['date', 'time', 'home_team', 'away_team', 'venue', 'group', 'stage', 'sport'];

/** Header spellings → field. Keys are squashed (lowercase, no spaces/punctuation),
 *  so "Home Team", "home_team" and "HOMETEAM" all match. */
const HEADER_ALIASES: Record<string, ImportField> = {
  date: 'date', matchdate: 'date', day: 'date',
  time: 'time', starttime: 'time', kickoff: 'time', start: 'time',
  hometeam: 'home_team', home: 'home_team', teama: 'home_team', team1: 'home_team',
  awayteam: 'away_team', away: 'away_team', teamb: 'away_team', team2: 'away_team',
  venue: 'venue', ground: 'venue',
  group: 'group', pool: 'group',
  stage: 'stage', round: 'stage',
  sport: 'sport',
};
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The field a header cell names, or null for an unknown column. */
export function columnFor(header: string): ImportField | null {
  return HEADER_ALIASES[squash(header)] ?? null;
}

/* ------------------------------ Delimited text ---------------------------- */

export interface ParsedLine { line: number; cells: string[] }

/** The separator: tab (cells copied from Excel / Sheets) > comma > semicolon
 *  (European Excel), judged on the first real line outside quotes. */
function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#')) ?? '';
  let inQ = false;
  const count: Record<string, number> = { '\t': 0, ',': 0, ';': 0 };
  for (const ch of first) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in count) count[ch]++;
  }
  return count['\t'] ? '\t' : count[','] ? ',' : count[';'] ? ';' : ',';
}

/** Parse CSV / TSV / semicolon text into rows of trimmed cells, each tagged with
 *  the (1-based) line it starts on — the spreadsheet row number the organiser
 *  sees. Strips a BOM, honours quotes (separators, `""` and newlines inside
 *  them), and drops blank rows and `#` comment rows. */
export function parseDelimitedLines(text: string): ParsedLine[] {
  const src = text.replace(/^﻿/, '');
  const delim = detectDelimiter(src);
  const out: ParsedLine[] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    row.push(cell);
    const cells = row.map((c) => c.trim());
    if (cells.some((c) => c) && !cells[0].startsWith('#')) out.push({ line: rowLine, cells });
    row = []; cell = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') { cell = ''; inQ = true; }
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\r') { /* CRLF — the \n ends the row */ }
    else if (ch === '\n') { endRow(); line++; rowLine = line; }
    else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  return out;
}

/** Just the cells (see parseDelimitedLines). */
export function parseDelimited(text: string): string[][] {
  return parseDelimitedLines(text).map((l) => l.cells);
}

export interface RawRow { line: number; cells: Partial<Record<ImportField, string>> }

/** Map parsed lines to fields. The first line is a header when it names at least
 *  a date and both teams; without one, columns are read in template order (rows
 *  pasted without their heading). */
export function toRawRows(lines: ParsedLine[]): { rows: RawRow[]; hasHeader: boolean; unknownColumns: string[] } {
  if (!lines.length) return { rows: [], hasHeader: false, unknownColumns: [] };
  const head = lines[0].cells.map(columnFor);
  const hasHeader = head.includes('date') && head.includes('home_team') && head.includes('away_team');
  const cols: (ImportField | null)[] = hasHeader ? head : TEMPLATE_COLUMNS;
  const unknownColumns = hasHeader ? lines[0].cells.filter((c, i) => c && !head[i]) : [];
  const rows = (hasHeader ? lines.slice(1) : lines).map((l) => {
    const cells: Partial<Record<ImportField, string>> = {};
    l.cells.forEach((v, i) => { const f = cols[i]; if (f && v && cells[f] == null) cells[f] = v; });
    return { line: l.line, cells };
  });
  return { rows, hasHeader, unknownColumns };
}

/* ------------------------------- Dates & times ---------------------------- */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const monthOf = (s: string): number => {
  const k = s.toLowerCase().slice(0, 3);
  const i = MONTHS.indexOf(k === 'sept' ? 'sep' : k);
  return i < 0 ? 0 : i + 1;
};
function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (!m || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 31/02 etc.
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A date cell → 'YYYY-MM-DD', or null. Reads ISO (2026-10-12), DAY-FIRST
 *  numeric dates (12/10/2026, 12-10-26, 12.10.2026), 12 Oct 2026, Oct 12, 2026,
 *  and Excel serial day numbers (46307). A leading weekday is ignored. */
export function parseDateCell(raw: string | undefined | null): string | null {
  let s = (raw ?? '').trim();
  if (!s) return null;
  // Excel serial (days since 1899-12-30); any time fraction is ignored.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 20000 || n > 80000) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  s = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.,]+([a-z]{3,9})\.?[\s\-/.,]+(\d{2}|\d{4})$/i.exec(s);
  if (m) return ymd(+m[3], monthOf(m[2]), +m[1]);
  m = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2}|\d{4})$/i.exec(s);
  if (m) return ymd(+m[3], monthOf(m[1]), +m[2]);
  return null;
}

const hm = (h: number, mi: number): string | null => (h >= 0 && h < 24 && mi >= 0 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null);

/** A time cell → 'HH:MM' (24 h), or null. Reads 14:30, 14:30:00, 14.30,
 *  2:30 pm, 2 PM, 1430, and Excel day fractions (0.6041… = 14:30). */
export function parseTimeCell(raw: string | undefined | null): string | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^0?\.\d+$/.test(s) || s === '0') {
    const mins = Math.round(Number(s) * 1440);
    return mins >= 1440 ? null : hm(Math.floor(mins / 60), mins % 60);
  }
  let m = /^(\d{1,2})(?:[:.](\d{2}))?(?:[:.](\d{2}))?\s*([ap])\.?\s*m?\.?$/.exec(s);
  if (m) {
    const h = +m[1];
    if (h < 1 || h > 12) return null;
    return hm((h % 12) + (m[4] === 'p' ? 12 : 0), +(m[2] ?? 0));
  }
  m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(s);
  if (m) return hm(+m[1], +m[2]);
  m = /^(\d{1,2})(\d{2})$/.exec(s);
  if (m) return hm(+m[1], +m[2]);
  return null;
}

/* ---------------------------------- Teams --------------------------------- */

/** Compare-friendly name: lowercase, & → "and", no punctuation, single spaces. */
export function normName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export type TeamMatch =
  | { status: 'ok'; team: Team }
  | { status: 'notEntered'; team: Team }
  | { status: 'suggest'; team: Team; entered: boolean }
  | { status: 'missing' };

/** Resolve a typed team name against the tournament's teams (`entered`) and all
 *  teams of that sport (`all`). Exact (name or short name, normalised) → ok /
 *  notEntered; else a unique substring or a Levenshtein ≤ 2 near miss →
 *  suggest (entered teams win); else missing. */
export function matchTeam(raw: string | undefined | null, entered: readonly Team[], all: readonly Team[]): TeamMatch {
  const n = normName(raw);
  if (!n) return { status: 'missing' };
  const exact = (t: Team) => normName(t.name) === n || (!!t.shortName && normName(t.shortName) === n);
  const inT = entered.find(exact);
  if (inT) return { status: 'ok', team: inT };
  const anyT = all.find(exact);
  if (anyT) return { status: 'notEntered', team: anyT };

  const enteredIds = new Set(entered.map((t) => t.id));
  const pools: Team[][] = [[...entered], all.filter((t) => !enteredIds.has(t.id))];
  const unique = (list: Team[]) => (list.length === 1 ? list[0] : null);
  const hit = (team: Team | null): TeamMatch | null => (team ? { status: 'suggest', team, entered: enteredIds.has(team.id) } : null);

  // A unique substring either way ("Red" → "Red House", "Red House FC" → "Red House");
  // the substring test reuses global search's name matcher (#22).
  if (n.length >= 3) {
    for (const pool of pools) {
      const hits = pool.filter((t) => {
        const tn = normName(t.name);
        return nameTier(tn, n) < 4 || (tn.length >= 3 && nameTier(n, tn) < 4);
      });
      if (hits.length > 1) break; // ambiguous among closer teams — don't guess further out
      if (hits.length) return hit(hits[0])!;
    }
  }
  // A typo: the closest full name within 2 edits, when it's the only closest one.
  if (n.length >= 4) {
    for (const pool of pools) {
      const scored = pool.map((t) => ({ t, d: levenshtein(normName(t.name), n) })).filter((x) => x.d <= 2);
      if (!scored.length) continue;
      const best = Math.min(...scored.map((x) => x.d));
      const s = unique(scored.filter((x) => x.d === best).map((x) => x.t));
      return s ? hit(s)! : { status: 'missing' }; // a tie is too close to call
    }
  }
  return { status: 'missing' };
}

/* --------------------------------- Stages --------------------------------- */

/** A stage cell → the match's stage id: group/league/pool → 'group', knockout
 *  words → bracket ids (r16, qf, sf, final, …), anything else kept as typed. */
export function stageFrom(raw: string | undefined | null): string | undefined {
  const s = (raw ?? '').trim();
  if (!s) return undefined;
  const k = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/^(group|league|pool|round robin)\b/.test(k)) return 'group';
  if (/^super (four|4|six|6|eight|8)$|^super$/.test(k)) return 'super';
  if (/^(r ?128|round of 128)$/.test(k)) return 'r128';
  if (/^(r ?64|round of 64)$/.test(k)) return 'r64';
  if (/^(r ?32|round of 32|last 32)$/.test(k)) return 'r32';
  if (/^(r ?16|round of 16|last 16|pre quarter)/.test(k)) return 'r16';
  if (/^(qf|quarter)/.test(k)) return 'qf';
  if (/^(sf|semi)/.test(k)) return 'sf';
  if (/^(third|3rd|bronze)/.test(k)) return 'third';
  if (/^(q1|qualifier 1)$/.test(k)) return 'q1';
  if (/^(q2|qualifier 2)$/.test(k)) return 'q2';
  if (/^eliminator$/.test(k)) return 'eliminator';
  if (/^(final|f|grand final)$/.test(k)) return 'final';
  return s;
}

/* -------------------------------- Validation ------------------------------ */

export interface ImportIssue {
  field: ImportField;
  msg: string;
  level: 'error' | 'warn';
  /** a one-tap fix: use this team in `field` */
  fix?: Team;
}

export interface ImportDraft {
  sport: SportId;
  home: Team;
  away: Team;
  /** wall date + time as typed (viewer zone) and the resulting instant */
  date: string;
  time: string;
  startsAt: string;
  venueName?: string;
  group?: string;
  stage?: string;
  /** teams to enter into the tournament first (found, but not in it yet) */
  addTeamIds: string[];
}

export interface ImportRow {
  line: number;
  cells: Partial<Record<ImportField, string>>;
  status: 'ok' | 'warn' | 'error';
  issues: ImportIssue[];
  draft?: ImportDraft;
}

export interface ImportSport { id: SportId; name: string }

export interface ImportContext {
  tournament: Pick<Tournament, 'id' | 'sports' | 'startDate' | 'endDate'> & { grounds?: string[] };
  /** every sport the app knows (id + display name) — SPORT_LIST in the screen */
  sports: readonly ImportSport[];
  /** the tournament's participating teams (any sport) */
  entered: readonly Team[];
  /** every team (any sport) — a name found here gets added to the tournament */
  allTeams: readonly Team[];
  /** matches already scheduled (for clashes and duplicate fixtures) */
  existing: readonly Match[];
  /** the viewer's time zone — typed times are wall times there */
  zone: string;
  /** rows the organiser skipped — validated, but they don't clash with others */
  skipLines?: ReadonlySet<number>;
}

const DEFAULT_TIME = '09:00';
const DAY = 86_400_000;
const shiftDay = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** The wall-clock day of an instant in a zone ('YYYY-MM-DD'). */
export function localDay(iso: string, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch {
    return iso.slice(0, 10);
  }
}

/** "12 Oct" for messages. */
const shortDate = (date: string) => `${+date.slice(8, 10)} ${MONTHS[+date.slice(5, 7) - 1]?.replace(/^./, (c) => c.toUpperCase())}`;
/** "4:30 pm" for messages. */
export function prettyTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}

function resolveSport(cell: string | undefined, ctx: ImportContext): { sport?: SportId; issue?: string } {
  const tSports = ctx.tournament.sports;
  const v = (cell ?? '').trim();
  if (!v) {
    if (tSports.length === 1) return { sport: tSports[0] };
    return { issue: `Add the sport — this tournament has ${tSports.length} (${tSports.map((s) => ctx.sports.find((x) => x.id === s)?.name ?? s).join(', ')})` };
  }
  const n = normName(v);
  const found = ctx.sports.find((s) => s.id === v.toLowerCase() || normName(s.name) === n || normName(s.id) === n);
  if (!found) return { issue: `Unknown sport “${v}”` };
  if (!tSports.includes(found.id)) return { issue: `${found.name} isn't in this tournament` };
  return { sport: found.id };
}

/** Validate parsed rows into ImportRows. Errors stop a row importing; warnings
 *  import it but ask for a look. Earlier valid rows count as scheduled when
 *  checking later rows for clashes and repeated fixtures. */
export function validateImport(rows: readonly RawRow[], ctx: ImportContext): ImportRow[] {
  const out: ImportRow[] = [];
  const earlier: { line: number; match: Match }[] = [];
  const start = (ctx.tournament.startDate ?? '').slice(0, 10);
  const end = (ctx.tournament.endDate ?? ctx.tournament.startDate ?? '').slice(0, 10);
  const lo = start ? shiftDay(start, -1) : '';
  const hi = end ? shiftDay(end, 7) : '';
  const grounds = ctx.tournament.grounds ?? [];

  for (const r of rows) {
    const c = r.cells;
    const issues: ImportIssue[] = [];
    const err = (field: ImportField, msg: string) => issues.push({ field, msg, level: 'error' });
    const warn = (field: ImportField, msg: string, fix?: Team) => issues.push({ field, msg, level: 'warn', ...(fix ? { fix } : {}) });

    // Date
    const date = parseDateCell(c.date);
    if (!c.date?.trim()) err('date', 'No date');
    else if (!date) err('date', `Can't read the date “${c.date}” — use 12/10/2026`);
    else if (lo && hi && (date < lo || date > hi)) err('date', `${shortDate(date)} is outside the tournament (${shortDate(start)} – ${shortDate(end)})`);

    // Time
    let time = parseTimeCell(c.time);
    if (!c.time?.trim()) { time = DEFAULT_TIME; warn('time', `No time — set to ${prettyTime(DEFAULT_TIME)}`); }
    else if (!time) err('time', `Can't read the time “${c.time}” — use 4:30 pm or 16:30`);

    // Sport
    const sp = resolveSport(c.sport, ctx);
    if (sp.issue) err('sport', sp.issue);

    // Teams (per sport)
    let home: Team | undefined;
    let away: Team | undefined;
    const addTeamIds: string[] = [];
    if (sp.sport) {
      const entered = ctx.entered.filter((t) => t.sport === sp.sport);
      const all = ctx.allTeams.filter((t) => t.sport === sp.sport);
      const side = (field: 'home_team' | 'away_team'): Team | undefined => {
        const raw = c[field];
        const label = field === 'home_team' ? 'home team' : 'away team';
        if (!raw?.trim()) { err(field, `No ${label}`); return undefined; }
        const m = matchTeam(raw, entered, all);
        if (m.status === 'missing') { err(field, `No team called “${raw}” — add it under Participating teams first`); return undefined; }
        if (m.status === 'suggest') warn(field, `“${raw}” — did you mean ${m.team.name}?`, m.team);
        const notIn = m.status === 'notEntered' || (m.status === 'suggest' && !m.entered);
        if (notIn) {
          if (m.status === 'notEntered') warn(field, `${m.team.name} isn't in this tournament yet — will be added`);
          addTeamIds.push(m.team.id);
        }
        return m.team;
      };
      home = side('home_team');
      away = side('away_team');
      if (home && away && home.id === away.id) err('away_team', `${home.name} can't play itself`);
    }

    // Venue: use the tournament's own spelling of a known ground.
    const venueRaw = c.venue?.trim();
    const venueName = venueRaw ? (grounds.find((g) => normName(g) === normName(venueRaw)) ?? venueRaw) : undefined;
    const stage = stageFrom(c.stage);
    const group = c.group?.trim() || undefined;

    const hasError = issues.some((i) => i.level === 'error');
    let draft: ImportDraft | undefined;
    if (!hasError && date && time && sp.sport && home && away) {
      const startsAt = wallTimeToIso(date, time, ctx.zone);
      draft = {
        sport: sp.sport, home, away, date, time, startsAt, venueName, group,
        stage: stage ?? (group ? 'group' : undefined),
        addTeamIds: [...new Set(addTeamIds)],
      };

      // Same two teams, same day — an existing match or an earlier row.
      const pair = [home.id, away.id].sort().join('|');
      const dupOf = new Set<string>();
      const live = (m: Match) => m.status !== 'cancelled' && m.status !== 'postponed';
      for (const m of ctx.existing) {
        if (!live(m) || m.sport !== sp.sport || !m.startsAt) continue;
        if ([m.homeTeam?.id, m.awayTeam?.id].sort().join('|') !== pair) continue;
        if (localDay(m.startsAt, ctx.zone) !== date) continue;
        dupOf.add(m.id);
        warn('home_team', `${home.name} v ${away.name} is already scheduled on ${shortDate(date)}`);
        break;
      }
      for (const e of earlier) {
        if (dupOf.size) break;
        if (e.match.sport !== sp.sport) continue;
        if ([e.match.homeTeam.id, e.match.awayTeam.id].sort().join('|') !== pair) continue;
        if (localDay(e.match.startsAt, ctx.zone) !== date) continue;
        dupOf.add(e.match.id);
        warn('home_team', `Same fixture as row #${e.line} on ${shortDate(date)}`);
      }

      // Ground / team clashes against existing matches plus earlier rows.
      const cand: ConflictCandidate = {
        sport: sp.sport, startsAt, venueName,
        homeTeamId: home.id, awayTeamId: away.id, homeTeamName: home.name, awayTeamName: away.name,
      };
      const rowOf = new Map(earlier.map((e) => [e.match.id, e.line]));
      const seenVenue = new Set<string>();
      for (const cf of findScheduleConflicts(cand, [...ctx.existing, ...earlier.map((e) => e.match)])) {
        if (dupOf.has(cf.other.id)) continue;
        const where = rowOf.has(cf.other.id) ? `row #${rowOf.get(cf.other.id)}` : `${cf.other.homeTeam?.name ?? '?'} v ${cf.other.awayTeam?.name ?? '?'}`;
        if (cf.kind === 'venue') {
          if (seenVenue.has(cf.other.id)) continue;
          seenVenue.add(cf.other.id);
          warn('venue', `Clash: ${venueName} is busy then (${where})`);
        } else {
          warn('time', `Clash: ${cf.teamName} is already playing then (${where})`);
        }
      }

      if (!ctx.skipLines?.has(r.line)) {
        earlier.push({
          line: r.line,
          match: {
            id: `import-row-${r.line}`, sport: sp.sport, status: 'scheduled', startsAt, venueName,
            homeTeam: home, awayTeam: away, tournamentId: ctx.tournament.id,
          } as Match,
        });
      }
    }

    out.push({
      line: r.line,
      cells: c,
      status: hasError ? 'error' : issues.length ? 'warn' : 'ok',
      issues,
      ...(draft ? { draft } : {}),
    });
  }
  return out;
}

/** Text → validated rows in one step (what the screen calls on every edit). */
export function importFromText(text: string, ctx: ImportContext, overrides: Record<number, Partial<Record<ImportField, string>>> = {}) {
  const { rows, hasHeader, unknownColumns } = toRawRows(parseDelimitedLines(text));
  const withFixes = rows.map((r) => (overrides[r.line] ? { ...r, cells: { ...r.cells, ...overrides[r.line] } } : r));
  return { rows: validateImport(withFixes, ctx), hasHeader, unknownColumns };
}

/** Count rows by outcome for the summary pills. */
export function importSummary(rows: readonly ImportRow[], skip: ReadonlySet<number> = new Set()) {
  let ok = 0, warn = 0, error = 0;
  for (const r of rows) {
    if (skip.has(r.line)) continue;
    if (r.status === 'ok') ok++; else if (r.status === 'warn') warn++; else error++;
  }
  return { ok, warn, error };
}

/* --------------------------------- Template ------------------------------- */

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csvRow = (cells: string[]) => cells.map(csvCell).join(',');
const dayFirst = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** The venue to put in the example rows: the tournament ground used most in its
 *  matches (ties → listed order), else the most-used venue, else its first
 *  ground, else blank. */
export function mostUsedVenue(grounds: readonly string[] | undefined, matches: readonly Match[]): string {
  const counts = new Map<string, { name: string; n: number }>();
  for (const m of matches) {
    const v = m.venueName?.trim();
    if (!v) continue;
    const k = normName(v);
    const e = counts.get(k);
    if (e) e.n++; else counts.set(k, { name: v, n: 1 });
  }
  const gs = (grounds ?? []).filter((g) => g.trim());
  if (gs.length) {
    let best = gs[0], bestN = -1;
    for (const g of gs) { const n = counts.get(normName(g))?.n ?? 0; if (n > bestN) { best = g; bestN = n; } }
    return best;
  }
  let top = '', topN = 0;
  for (const { name, n } of counts.values()) if (n > topN) { top = name; topN = n; }
  return top;
}

/** A ready-to-fill CSV: the header, two example rows built from the
 *  tournament's real teams, start date, sport and most-used venue, then a `#`
 *  row explaining the formats (dropped on import). */
export function templateCsv(
  tournament: Pick<Tournament, 'sports' | 'startDate'> & { grounds?: string[] },
  teams: readonly Team[],
  opts: { matches?: readonly Match[]; sportName?: (id: SportId) => string } = {},
): string {
  const sport = tournament.sports[0];
  const sportTeams = teams.filter((t) => !sport || t.sport === sport);
  const names = sportTeams.map((t) => t.name);
  const a = names[0] ?? 'Team A', b = names[1] ?? 'Team B';
  const c = names[2] ?? b, d = names[3] ?? a;
  const start = (tournament.startDate ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const venue = mostUsedVenue(tournament.grounds, opts.matches ?? []);
  const sportLabel = sport ? (opts.sportName?.(sport) ?? sport) : '';
  const grouped = names.length >= 4;
  const lines = [
    csvRow(TEMPLATE_COLUMNS),
    csvRow([dayFirst(start), '4:30 pm', a, b, venue, grouped ? 'A' : '', grouped ? 'Group' : 'League', sportLabel]),
    csvRow([dayFirst(shiftDay(start, 1)), '4:30 pm', c, d, venue, grouped ? 'B' : '', grouped ? 'Group' : 'League', sportLabel]),
    csvRow(['# One row per match. Dates are DAY-FIRST (12/10/2026 = 12 Oct). Times like 4:30 pm or 16:30, in your time zone. Team names must match your teams. Stage: Group, QF, SF, Final… Replace the two example rows.']),
  ];
  return lines.join('\r\n') + '\r\n';
}

/** "Inter-House Cup 2026" → "inter-house-cup-2026" (template file name). */
export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'tournament';
}
