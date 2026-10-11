/**
 * SD-70 (FB-12) — football tournament discipline: the cards table and the
 * suspension rule. PURE (no React Native): the tournament Stats tab, the
 * matchday squad picker and the node tests all read the same figures.
 *
 * Input: the tournament's football matches (their stored `state` — the card
 * events) and the organiser's rule from `formats.football` (no migration: the
 * keys live in the existing JSON, like the points-table keys):
 *   - `banRed`      matches a DIRECT red costs (0 = no automatic ban; default 1)
 *   - `banYellows`  N yellows in different matches = a 1-match ban (0 = off; default 2)
 *   - `yellowReset` 'never' (default) | 'groups' (wiped when the knockouts start)
 *                   | 'qf' (wiped after the quarter-finals — World Cup style)
 *
 * The rule, as FIFA / AIFF competitions word it:
 *   - a red card for a second yellow = 1 match; those two yellows don't count
 *     towards the accumulation;
 *   - a direct red = `banRed` matches (a yellow earlier in that match still counts);
 *   - every `banYellows` yellows (each match's single yellow) = 1 match, then the
 *     count starts again;
 *   - a ban is served in the team's next completed matches of this tournament
 *     (football), whether or not the player was picked; pending bans survive a
 *     yellow reset.
 * Team officials' cards (SD-117) are listed but never suspend a player.
 * Old logs carry names only: a player is keyed by id where the log has one,
 * else by name (the same name with an id elsewhere in the tournament joins it).
 */
import type { Match } from '../../core/types';
import { isEliminationStage } from '../../data/bracket.ts';
import type { FootballEvent } from './events.ts';
import type { ConfirmCopy } from '../../core/matchSafety.ts';

type Side = 'home' | 'away';
export type YellowReset = 'never' | 'groups' | 'qf';

export interface DisciplineRule {
  /** matches a direct red costs (0 = no automatic ban) */
  banRed: number;
  /** yellows (in different matches) that cost one match (0 = off) */
  banYellows: number;
  yellowReset: YellowReset;
}

export const DEFAULT_DISCIPLINE: DisciplineRule = { banRed: 1, banYellows: 2, yellowReset: 'never' };

/** The organiser's rule from `formats.football` (absent keys = the defaults). */
export function readDisciplineRule(format?: Record<string, unknown> | null): DisciplineRule {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  const r = format?.yellowReset;
  return {
    banRed: n(format?.banRed, DEFAULT_DISCIPLINE.banRed),
    banYellows: n(format?.banYellows, DEFAULT_DISCIPLINE.banYellows),
    yellowReset: r === 'groups' || r === 'qf' ? r : 'never',
  };
}

/** "Red = 1 match · 2 yellows = 1 match · yellows reset after the group stage" */
export function disciplineRuleText(r: DisciplineRule): string {
  const red = r.banRed > 0 ? `Red card = ${r.banRed} match${r.banRed === 1 ? '' : 'es'} out` : 'No automatic ban for a red card';
  const yel = r.banYellows > 0 ? `${r.banYellows} yellow cards = 1 match out` : 'yellow cards don’t add up';
  const reset = r.banYellows > 0 && r.yellowReset !== 'never' ? ` · yellows wiped ${r.yellowReset === 'groups' ? 'when the knockouts start' : 'after the quarter-finals'}` : '';
  return `${red} · ${yel}${reset}`;
}

export type DisciplineMatch = Pick<Match, 'id' | 'sport' | 'status' | 'startsAt' | 'homeTeam' | 'awayTeam' | 'state'> & Partial<Pick<Match, 'stage' | 'walkover'>>;

export interface DisciplineRow {
  /** stable key: `${teamId}|${playerId}` or `${teamId}|n:${name}` */
  key: string;
  playerId?: string;
  name: string;
  teamId: string;
  teamName: string;
  /** every yellow shown (incl. the two of a second-yellow red) */
  yellows: number;
  /** direct reds */
  reds: number;
  /** reds for a second yellow */
  secondYellows: number;
  /** suspended for the team's next match */
  suspended: boolean;
  /** matches still to sit out */
  banLeft: number;
  /** yellows counting towards the next accumulation ban */
  yellowsTowardBan: number;
  /** what the ban is for ("red card", "second yellow", "2 yellow cards") */
  banReason?: string;
}

export interface OfficialCardRow { teamId: string; teamName: string; name: string; yellows: number; reds: number }

export interface DisciplineTable {
  rows: DisciplineRow[];
  officials: OfficialCardRow[];
  /** per team: yellows / reds (player cards) */
  teams: { teamId: string; teamName: string; yellows: number; reds: number }[];
}

/** 0 = group / league stage, 1 = knockouts up to the quarter-finals, 2 = semi-finals on. */
function phaseOf(stage?: string): number {
  if (!stage || !isEliminationStage(stage)) return 0;
  return stage === 'sf' || stage === 'final' || stage === 'third' ? 2 : 1;
}
const resetLevel = (r: YellowReset): number => (r === 'groups' ? 1 : r === 'qf' ? 2 : Infinity);

const eventsOf = (m: DisciplineMatch): FootballEvent[] => {
  const ev = (m.state as { events?: unknown } | null | undefined)?.events;
  return Array.isArray(ev) ? (ev as FootballEvent[]) : [];
};
const played = (m: DisciplineMatch) => m.status === 'completed';
const byTime = (a: DisciplineMatch, b: DisciplineMatch) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.id.localeCompare(b.id);

interface PlayerState {
  row: DisciplineRow;
  /** yellows counting, each tagged with the phase it was shown in */
  accum: number[];
  pending: number;
  /** what the latest ban was for */
  cause?: string;
}

/** The whole tournament's discipline after its completed matches, plus the
 *  per-team ban state to project onto upcoming fixtures. */
function run(matches: DisciplineMatch[], rule: DisciplineRule) {
  const fb = matches.filter((m) => m.sport === 'football').sort(byTime);
  // name → id per team, from every card that carries both
  const ids = new Map<string, string>();
  for (const m of fb) for (const e of eventsOf(m)) {
    if (e.official || !e.playerId || !e.playerName) continue;
    const t = e.side === 'home' ? m.homeTeam.id : m.awayTeam.id;
    ids.set(`${t}|${e.playerName}`, e.playerId);
  }
  const players = new Map<string, PlayerState>();
  const officials = new Map<string, OfficialCardRow>();
  const keyOf = (teamId: string, e: FootballEvent) => {
    const id = e.playerId ?? (e.playerName ? ids.get(`${teamId}|${e.playerName}`) : undefined);
    return { key: id ? `${teamId}|${id}` : `${teamId}|n:${e.playerName ?? `#${e.id}`}`, id };
  };
  for (const m of fb) {
    if (!played(m)) continue;
    const phase = phaseOf(m.stage);
    for (const side of ['home', 'away'] as const) {
      const team = side === 'home' ? m.homeTeam : m.awayTeam;
      // 1) this match serves one match of every pending ban of the team
      for (const p of players.values()) if (p.row.teamId === team.id && p.pending > 0) p.pending -= 1;
      // 2) a yellow reset as the team enters the new phase
      for (const p of players.values()) if (p.row.teamId === team.id && phase >= resetLevel(rule.yellowReset)) p.accum = p.accum.filter((ph) => ph >= resetLevel(rule.yellowReset));
      // 3) this match's cards, per player
      const per = new Map<string, { y: number; red: boolean; second: boolean; e: FootballEvent; id?: string }>();
      for (const e of eventsOf(m)) {
        if (e.side !== side || (e.type !== 'yellow' && e.type !== 'red')) continue;
        if (e.official) {
          const k = `${team.id}|${e.playerName ?? 'Team official'}`;
          const o = officials.get(k) ?? { teamId: team.id, teamName: team.name, name: e.playerName ?? 'Team official', yellows: 0, reds: 0 };
          if (e.type === 'yellow') o.yellows += 1; else o.reds += 1;
          officials.set(k, o);
          continue;
        }
        const { key, id } = keyOf(team.id, e);
        const c = per.get(key) ?? { y: 0, red: false, second: false, e, id };
        if (e.type === 'yellow') c.y += 1;
        else if (e.secondYellow) c.second = true;
        else c.red = true;
        per.set(key, c);
      }
      for (const [key, c] of per) {
        let p = players.get(key);
        if (!p) {
          p = { row: { key, ...(c.id ? { playerId: c.id } : {}), name: c.e.playerName ?? 'Player', teamId: team.id, teamName: team.name, yellows: 0, reds: 0, secondYellows: 0, suspended: false, banLeft: 0, yellowsTowardBan: 0 }, accum: [], pending: 0 };
          players.set(key, p);
        }
        if (c.e.playerName && p.row.name === 'Player') p.row.name = c.e.playerName;
        p.row.yellows += c.y;
        // A second-yellow red (flagged, or two yellows logged without the flag):
        // 1 match, and those yellows don't accumulate.
        const second = c.second || (c.y >= 2 && !c.red);
        if (second) p.row.secondYellows += 1;
        if (c.red) p.row.reds += 1;
        if (second) { p.pending += 1; p.cause = 'second yellow'; }
        if (c.red && rule.banRed > 0) { p.pending += rule.banRed; p.cause = 'red card'; }
        if (!second && c.y > 0 && rule.banYellows > 0) {
          p.accum.push(phase);
          if (p.accum.length >= rule.banYellows) { p.pending += 1; p.accum = []; p.cause = `${rule.banYellows} yellow cards`; }
        }
      }
    }
  }
  return { fb, players, officials };
}

/** The tournament's discipline table: most cards first (reds weigh more). */
export function disciplineTable(matches: DisciplineMatch[], format?: Record<string, unknown> | null): DisciplineTable {
  const rule = readDisciplineRule(format);
  const { players, officials } = run(matches, rule);
  const rows = [...players.values()].map((p) => ({
    ...p.row, banLeft: p.pending, suspended: p.pending > 0, yellowsTowardBan: rule.banYellows > 0 ? p.accum.length : 0,
    ...(p.pending > 0 && p.cause ? { banReason: p.cause } : {}),
  }));
  rows.sort((a, b) => Number(b.suspended) - Number(a.suspended) || (b.reds + b.secondYellows) - (a.reds + a.secondYellows) || b.yellows - a.yellows || a.name.localeCompare(b.name));
  const teams = new Map<string, { teamId: string; teamName: string; yellows: number; reds: number }>();
  for (const r of rows) {
    const t = teams.get(r.teamId) ?? { teamId: r.teamId, teamName: r.teamName, yellows: 0, reds: 0 };
    t.yellows += r.yellows; t.reds += r.reds + r.secondYellows;
    teams.set(r.teamId, t);
  }
  return {
    rows,
    officials: [...officials.values()],
    teams: [...teams.values()].sort((a, b) => b.reds - a.reds || b.yellows - a.yellows || a.teamName.localeCompare(b.teamName)),
  };
}

export interface Suspension { playerId?: string; name: string; teamId: string; reason: string }

/**
 * Who is suspended for one (upcoming) match: the players of its two teams
 * with a ban still to serve once the team's earlier unplayed fixtures are
 * counted as served. A completed match is never "upcoming" — [].
 */
export function suspensionsFor(match: DisciplineMatch, matches: DisciplineMatch[], format?: Record<string, unknown> | null): Record<Side, Suspension[]> {
  const out: Record<Side, Suspension[]> = { home: [], away: [] };
  if (match.sport !== 'football' || played(match)) return out;
  const rule = readDisciplineRule(format);
  const others = matches.filter((m) => m.id !== match.id);
  // Only completed matches before this one count; later results don't change it.
  const before = others.filter((m) => byTime(m, match) < 0 || played(m));
  const { players } = run(before.filter(played), rule);
  for (const side of ['home', 'away'] as const) {
    const team = side === 'home' ? match.homeTeam : match.awayTeam;
    // the team's unplayed fixtures scheduled before this one serve bans first
    const gap = others.filter((m) => m.sport === 'football' && !played(m) && m.status !== 'cancelled' && m.status !== 'postponed' && byTime(m, match) < 0
      && (m.homeTeam.id === team.id || m.awayTeam.id === team.id)).length;
    for (const p of players.values()) {
      if (p.row.teamId !== team.id || p.pending <= gap) continue;
      out[side].push({ ...(p.row.playerId ? { playerId: p.row.playerId } : {}), name: p.row.name, teamId: team.id, reason: p.cause ?? 'cards' });
    }
  }
  return out;
}

/** Is this squad player one of the suspended (by id, else by name)? */
export const isSuspended = (list: Suspension[], p: { id: string; fullName: string }): Suspension | undefined =>
  list.find((s) => (s.playerId ? s.playerId === p.id : s.name === p.fullName));

/** The warning when a suspended player is picked (askConfirm; never blocks). */
export const suspendedPickCopy = (name: string, reason: string): ConfirmCopy => ({
  title: `${name} is suspended`,
  message: `Suspended for this match (${reason}) under this tournament's discipline rule. Pick anyway?`,
  yesLabel: 'Yes, pick anyway',
  noLabel: 'No, leave out',
  tone: 'caution',
});
