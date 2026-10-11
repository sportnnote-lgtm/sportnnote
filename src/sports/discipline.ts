/**
 * SD-126 — tournament discipline for every team sport that logs cards,
 * generalising football's SD-70 (./football/discipline.ts, unchanged). PURE (no
 * React Native): the tournament Stats tab, the matchday squad / lineup pickers,
 * the settings page and the node tests read the same figures.
 *
 * Each sport describes its own card model in `./<sport>/discipline.ts`:
 *   - `columns`   the table's card columns (hockey 🟩🟨🟥, handball warning /
 *                 2′ / red / blue, basketball U / T / D / ejected, kabaddi 🟩🟨🟥)
 *   - `sendOffs`  the cards that can cost the next match(es), each with its own
 *                 organiser key in `formats[sport]` (banRed, banBlue, banEject…)
 *                 and a federation default
 *   - `caution`   the card that can add up to a 1-match ban (`banYellows`,
 *                 0 = off) — wiped by `yellowReset` like football
 *   - `marks()`   reads one match's stored state into card marks.
 *
 * The rule (as SD-70): one ban per match — the biggest of the match's
 * send-offs — plus one match for every `banYellows` cautions shown in different
 * matches; a ban is served in the team's next completed matches of this
 * tournament (walkovers count), picked or not. Team officials' cards are listed
 * but never suspend a player. A suspension is a WARNING on the pickers only.
 * Volleyball sanctions aren't logged per player and cricket has no code-of-
 * conduct offences in its data, so neither has a discipline table.
 */
import type { SportId } from '../core/types';
import { isEliminationStage } from '../data/bracket.ts';
import * as football from './football/discipline.ts';
import { HOCKEY_DISCIPLINE } from './hockey/discipline.ts';
import { HANDBALL_DISCIPLINE } from './handball/discipline.ts';
import { BASKETBALL_DISCIPLINE } from './basketball/discipline.ts';
import { KABADDI_DISCIPLINE } from './kabaddi/discipline.ts';

type Side = 'home' | 'away';
export type YellowReset = football.YellowReset;
export type DisciplineMatch = football.DisciplineMatch;
export type Suspension = football.Suspension;
export { isSuspended, suspendedPickCopy } from './football/discipline.ts';

/** One card / sanction in a match, as the sport's `marks()` reads it. */
export interface CardMark {
  side: Side;
  playerId?: string;
  playerName?: string;
  /** a team official's card (the name) — listed, never suspends */
  official?: string;
  /** the column it counts in */
  col: string;
  /** the send-off it triggers (a `sendOffs[].key`) */
  off?: string;
  /** counts towards the caution accumulation */
  caution?: boolean;
}

export interface CardColumn { key: string; icon: string; label: string }

export interface SendOffRule {
  /** the organiser's key in `formats[sport]` (e.g. 'banRed') */
  key: string;
  /** the settings question: "A red card means" */
  ask: string;
  /** why the player is out: "red card" */
  reason: string;
  /** the federation default (matches) */
  def: number;
}

export interface SportDisciplineSpec {
  sport: SportId;
  columns: CardColumn[];
  sendOffs: SendOffRule[];
  /** the card that can add up to a ban (organiser key `banYellows`) */
  caution?: { col: string; plural: string; def: number };
  /** one line on where the defaults come from */
  source: string;
  marks(m: DisciplineMatch): CardMark[];
}

export const DISCIPLINE_SPECS: Partial<Record<SportId, SportDisciplineSpec>> = {
  hockey: HOCKEY_DISCIPLINE,
  handball: HANDBALL_DISCIPLINE,
  basketball: BASKETBALL_DISCIPLINE,
  kabaddi: KABADDI_DISCIPLINE,
};

/** Football's own model, shown through the same table. */
export const FOOTBALL_COLUMNS: CardColumn[] = [
  { key: 'yellow', icon: '🟨', label: 'Yellow cards' },
  { key: 'second', icon: '2🟨', label: 'Red cards for a second yellow' },
  { key: 'red', icon: '🟥', label: 'Direct red cards' },
];

/** Does this sport have a discipline table + suspension rule? */
export const hasDiscipline = (sport?: SportId | string | null): boolean => sport === 'football' || !!(sport && DISCIPLINE_SPECS[sport as SportId]);

export interface SportDisciplineRule {
  /** matches per send-off key */
  bans: Record<string, number>;
  /** cautions (in different matches) that cost one match (0 = off) */
  banYellows: number;
  yellowReset: YellowReset;
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);

/** The organiser's rule from `formats[sport]` (absent keys = the defaults). */
export function readSportRule(spec: SportDisciplineSpec, format?: Record<string, unknown> | null): SportDisciplineRule {
  const r = format?.yellowReset;
  return {
    bans: Object.fromEntries(spec.sendOffs.map((o) => [o.key, num(format?.[o.key], o.def)])),
    banYellows: spec.caution ? num(format?.banYellows, spec.caution.def) : 0,
    yellowReset: r === 'groups' || r === 'qf' ? r : 'never',
  };
}

const plural = (n: number) => `${n} match${n === 1 ? '' : 'es'} out`;

/** "Red card = 1 match out · 2 yellow cards = 1 match out" — any sport. */
export function sportRuleText(sport: SportId | string, format?: Record<string, unknown> | null): string {
  if (sport === 'football') return football.disciplineRuleText(football.readDisciplineRule(format));
  const spec = DISCIPLINE_SPECS[sport as SportId];
  if (!spec) return '';
  const rule = readSportRule(spec, format);
  const parts = spec.sendOffs.map((o) => {
    const n = rule.bans[o.key];
    const what = o.reason.charAt(0).toUpperCase() + o.reason.slice(1);
    return n > 0 ? `${what} = ${plural(n)}` : `${what}: no automatic ban`;
  });
  if (spec.caution) {
    parts.push(rule.banYellows > 0 ? `${rule.banYellows} ${spec.caution.plural} = 1 match out` : `${spec.caution.plural} don’t add up`);
    if (rule.banYellows > 0 && rule.yellowReset !== 'never') parts.push(`wiped ${rule.yellowReset === 'groups' ? 'when the knockouts start' : 'after the quarter-finals'}`);
  }
  return parts.join(' · ');
}

export interface SportDisciplineRow {
  key: string;
  playerId?: string;
  name: string;
  teamId: string;
  teamName: string;
  counts: Record<string, number>;
  suspended: boolean;
  banLeft: number;
  banReason?: string;
  /** cautions counting towards the next accumulation ban */
  towardBan: number;
}

export interface SportDisciplineTable {
  columns: CardColumn[];
  rows: SportDisciplineRow[];
  officials: { teamId: string; teamName: string; name: string; counts: Record<string, number> }[];
  teams: { teamId: string; teamName: string; counts: Record<string, number> }[];
  /** how many cautions make a ban (0 = off) — for the "one more" hint */
  banYellows: number;
}

function phaseOf(stage?: string): number {
  if (!stage || !isEliminationStage(stage)) return 0;
  return stage === 'sf' || stage === 'final' || stage === 'third' ? 2 : 1;
}
const resetLevel = (r: YellowReset): number => (r === 'groups' ? 1 : r === 'qf' ? 2 : Infinity);
const played = (m: DisciplineMatch) => m.status === 'completed';
const byTime = (a: DisciplineMatch, b: DisciplineMatch) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id.localeCompare(b.id);

interface PlayerState { row: SportDisciplineRow; accum: number[]; pending: number; cause?: string }

function safeMarks(spec: SportDisciplineSpec, m: DisciplineMatch): CardMark[] {
  try { return spec.marks(m); } catch { return []; }
}

function run(spec: SportDisciplineSpec, matches: DisciplineMatch[], rule: SportDisciplineRule) {
  const ms = matches.filter((m) => m.sport === spec.sport).sort(byTime);
  // name → id per team, from every mark that carries both
  const ids = new Map<string, string>();
  for (const m of ms) for (const c of safeMarks(spec, m)) {
    if (c.official || !c.playerId || !c.playerName) continue;
    ids.set(`${c.side === 'home' ? m.homeTeam.id : m.awayTeam.id}|${c.playerName}`, c.playerId);
  }
  const players = new Map<string, PlayerState>();
  const officials = new Map<string, SportDisciplineTable['officials'][number]>();
  const offOf = new Map(spec.sendOffs.map((o) => [o.key, o]));
  for (const m of ms) {
    if (!played(m)) continue;
    const phase = phaseOf(m.stage);
    const marks = safeMarks(spec, m);
    for (const side of ['home', 'away'] as const) {
      const team = side === 'home' ? m.homeTeam : m.awayTeam;
      for (const p of players.values()) if (p.row.teamId === team.id && p.pending > 0) p.pending -= 1;
      for (const p of players.values()) if (p.row.teamId === team.id && phase >= resetLevel(rule.yellowReset)) p.accum = p.accum.filter((ph) => ph >= resetLevel(rule.yellowReset));
      const per = new Map<string, { counts: Record<string, number>; offs: Set<string>; caution: boolean; name?: string; id?: string }>();
      for (const c of marks) {
        if (c.side !== side) continue;
        if (c.official) {
          const k = `${team.id}|${c.official}`;
          const o = officials.get(k) ?? { teamId: team.id, teamName: team.name, name: c.official, counts: {} };
          o.counts[c.col] = (o.counts[c.col] ?? 0) + 1;
          officials.set(k, o);
          continue;
        }
        const id = c.playerId ?? (c.playerName ? ids.get(`${team.id}|${c.playerName}`) : undefined);
        const key = id ? `${team.id}|${id}` : `${team.id}|n:${c.playerName ?? 'Player'}`;
        const e = per.get(key) ?? { counts: {}, offs: new Set<string>(), caution: false, name: c.playerName, id };
        e.counts[c.col] = (e.counts[c.col] ?? 0) + 1;
        if (c.off) e.offs.add(c.off);
        if (c.caution) e.caution = true;
        if (!e.name && c.playerName) e.name = c.playerName;
        per.set(key, e);
      }
      for (const [key, c] of per) {
        let p = players.get(key);
        if (!p) {
          p = { row: { key, ...(c.id ? { playerId: c.id } : {}), name: c.name ?? 'Player', teamId: team.id, teamName: team.name, counts: {}, suspended: false, banLeft: 0, towardBan: 0 }, accum: [], pending: 0 };
          players.set(key, p);
        }
        if (c.name && p.row.name === 'Player') p.row.name = c.name;
        for (const [col, n] of Object.entries(c.counts)) p.row.counts[col] = (p.row.counts[col] ?? 0) + n;
        // one ban per match: the biggest of its send-offs
        let ban = 0; let why: string | undefined;
        for (const k of c.offs) { const n = rule.bans[k] ?? 0; if (n > ban) { ban = n; why = offOf.get(k)?.reason; } }
        if (ban > 0) { p.pending += ban; p.cause = why; }
        if (c.caution && rule.banYellows > 0 && spec.caution) {
          p.accum.push(phase);
          if (p.accum.length >= rule.banYellows) { p.pending += 1; p.accum = []; p.cause = `${rule.banYellows} ${spec.caution.plural}`; }
        }
      }
    }
  }
  return { players, officials };
}

const sum = (into: Record<string, number>, from: Record<string, number>) => { for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n; };
const weight = (cols: CardColumn[], counts: Record<string, number>) =>
  cols.reduce((t, c, i) => t + (counts[c.key] ?? 0) * Math.pow(10, i), 0);

/** A tournament's discipline table for one sport (football via SD-70). */
export function sportDisciplineTable(sport: SportId | string, matches: DisciplineMatch[], format?: Record<string, unknown> | null): SportDisciplineTable | null {
  if (sport === 'football') {
    const t = football.disciplineTable(matches, format);
    const rule = football.readDisciplineRule(format);
    return {
      columns: FOOTBALL_COLUMNS,
      rows: t.rows.map((r) => ({
        key: r.key, ...(r.playerId ? { playerId: r.playerId } : {}), name: r.name, teamId: r.teamId, teamName: r.teamName,
        counts: { yellow: r.yellows, second: r.secondYellows, red: r.reds }, suspended: r.suspended, banLeft: r.banLeft,
        ...(r.banReason ? { banReason: r.banReason } : {}), towardBan: r.yellowsTowardBan,
      })),
      officials: t.officials.map((o) => ({ teamId: o.teamId, teamName: o.teamName, name: o.name, counts: { yellow: o.yellows, red: o.reds } })),
      teams: t.teams.map((x) => ({ teamId: x.teamId, teamName: x.teamName, counts: { yellow: x.yellows, red: x.reds } })),
      banYellows: rule.banYellows,
    };
  }
  const spec = DISCIPLINE_SPECS[sport as SportId];
  if (!spec) return null;
  const rule = readSportRule(spec, format);
  const { players, officials } = run(spec, matches, rule);
  const rows = [...players.values()].map((p) => ({
    ...p.row, banLeft: p.pending, suspended: p.pending > 0, towardBan: rule.banYellows > 0 ? p.accum.length : 0,
    ...(p.pending > 0 && p.cause ? { banReason: p.cause } : {}),
  }));
  // suspended first, then the heaviest cards (the last column weighs most)
  rows.sort((a, b) => Number(b.suspended) - Number(a.suspended) || weight(spec.columns, b.counts) - weight(spec.columns, a.counts) || a.name.localeCompare(b.name));
  const teams = new Map<string, { teamId: string; teamName: string; counts: Record<string, number> }>();
  for (const r of rows) {
    const t = teams.get(r.teamId) ?? { teamId: r.teamId, teamName: r.teamName, counts: {} };
    sum(t.counts, r.counts);
    teams.set(r.teamId, t);
  }
  return {
    columns: spec.columns,
    rows,
    officials: [...officials.values()],
    teams: [...teams.values()].sort((a, b) => weight(spec.columns, b.counts) - weight(spec.columns, a.counts) || a.teamName.localeCompare(b.teamName)),
    banYellows: rule.banYellows,
  };
}

/** Who is suspended for one upcoming match of any sport with discipline. */
export function sportSuspensionsFor(match: DisciplineMatch, matches: DisciplineMatch[], format?: Record<string, unknown> | null): Record<Side, Suspension[]> {
  if (match.sport === 'football') return football.suspensionsFor(match, matches, format);
  const out: Record<Side, Suspension[]> = { home: [], away: [] };
  const spec = DISCIPLINE_SPECS[match.sport];
  if (!spec || played(match)) return out;
  const rule = readSportRule(spec, format);
  const others = matches.filter((m) => m.id !== match.id);
  const before = others.filter((m) => byTime(m, match) < 0 || played(m));
  const { players } = run(spec, before.filter(played), rule);
  for (const side of ['home', 'away'] as const) {
    const team = side === 'home' ? match.homeTeam : match.awayTeam;
    const gap = others.filter((m) => m.sport === match.sport && !played(m) && m.status !== 'cancelled' && m.status !== 'postponed' && byTime(m, match) < 0
      && (m.homeTeam.id === team.id || m.awayTeam.id === team.id)).length;
    for (const p of players.values()) {
      if (p.row.teamId !== team.id || p.pending <= gap) continue;
      out[side].push({ ...(p.row.playerId ? { playerId: p.row.playerId } : {}), name: p.row.name, teamId: team.id, reason: p.cause ?? 'cards' });
    }
  }
  return out;
}
