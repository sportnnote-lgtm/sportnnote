/**
 * A team's stats from its completed matches: recent form, scored/conceded,
 * head-to-head per opponent, and top performers (from the stat lines recorded
 * while scoring). Pure — the team page feeds it matches, stat lines and who
 * played for this team in each match.
 */
import type { Match, SportId, StatLine } from '../core/types';

export type Result = 'W' | 'D' | 'L';
export interface HeadToHead { opponentId: string; opponentName: string; played: number; won: number; drawn: number; lost: number; for: number; against: number }
export interface Leader { icon: string; label: string; stat: string; playerId: string; total: number }
export interface TeamStats {
  played: number; won: number; drawn: number; lost: number;
  /** most recent first, up to 5 */
  form: { matchId: string; result: Result; opponentName: string }[];
  scored: number; conceded: number;
  /** what the score counts in this sport, e.g. "goals"; undefined = mixed / generic */
  unit?: string;
  headToHead: HeadToHead[];
  leaders: Leader[];
  /** players by matches played for this team (most first) */
  appearances: { playerId: string; matches: number }[];
}

const UNIT: Partial<Record<SportId, string>> = { football: 'goals', cricket: 'runs', basketball: 'points', kabaddi: 'points', volleyball: 'sets' };

export function resultFor(m: Match, teamId: string): Result | null {
  if (m.status !== 'completed' || !m.winner) return null;
  if (m.winner === 'draw') return 'D';
  const side = m.homeTeam.id === teamId ? 'home' : m.awayTeam.id === teamId ? 'away' : null;
  if (!side) return null;
  return m.winner === side ? 'W' : 'L';
}

export function computeTeamStats(
  teamId: string,
  matches: Match[],
  lines: StatLine[] = [],
  /** player ids who played for THIS team, per match id */
  playedFor: Record<string, string[]> = {},
  /** "best in role" stats per sport (ratings.SPORT_AWARDS) */
  awardsBySport: Partial<Record<SportId, { icon: string; label: string; stat: string }[]>> = {},
): TeamStats {
  const done = matches
    .filter((m) => (m.homeTeam.id === teamId || m.awayTeam.id === teamId) && resultFor(m, teamId))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const out: TeamStats = { played: 0, won: 0, drawn: 0, lost: 0, form: [], scored: 0, conceded: 0, headToHead: [], leaders: [], appearances: [] };
  const h2h = new Map<string, HeadToHead>();
  const sports = new Set<SportId>();
  for (const m of done) {
    const home = m.homeTeam.id === teamId;
    const opp = home ? m.awayTeam : m.homeTeam;
    const r = resultFor(m, teamId)!;
    sports.add(m.sport);
    out.played++;
    if (r === 'W') out.won++; else if (r === 'D') out.drawn++; else out.lost++;
    if (out.form.length < 5) out.form.push({ matchId: m.id, result: r, opponentName: opp.name });
    const f = m.walkover || !m.score ? 0 : home ? m.score.home : m.score.away;
    const a = m.walkover || !m.score ? 0 : home ? m.score.away : m.score.home;
    out.scored += f; out.conceded += a;
    const row = h2h.get(opp.id) ?? { opponentId: opp.id, opponentName: opp.name, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0 };
    row.played++; row.for += f; row.against += a;
    if (r === 'W') row.won++; else if (r === 'D') row.drawn++; else row.lost++;
    h2h.set(opp.id, row);
  }
  out.unit = sports.size === 1 ? UNIT[[...sports][0]] : undefined;
  out.headToHead = [...h2h.values()].sort((x, y) => y.played - x.played || x.opponentName.localeCompare(y.opponentName));

  // Top performers: only lines from this team's matches, by players who played for it.
  const doneIds = new Set(done.map((m) => m.id));
  const totals = new Map<string, Record<string, number>>();
  const apps = new Map<string, number>();
  for (const m of done) {
    for (const pid of new Set(playedFor[m.id] ?? [])) apps.set(pid, (apps.get(pid) ?? 0) + 1);
  }
  for (const l of lines) {
    if (!doneIds.has(l.matchId) || !(playedFor[l.matchId] ?? []).includes(l.playerId)) continue;
    const t = totals.get(l.playerId) ?? {};
    for (const [k, v] of Object.entries(l.stats ?? {})) t[k] = (t[k] ?? 0) + (v ?? 0);
    totals.set(l.playerId, t);
  }
  const awards = [...sports].flatMap((sp) => awardsBySport[sp] ?? []);
  const seen = new Set<string>();
  for (const a of awards) {
    if (seen.has(a.stat)) continue;
    seen.add(a.stat);
    let best: Leader | null = null;
    for (const [pid, t] of totals) {
      const v = t[a.stat] ?? 0;
      if (v > 0 && (!best || v > best.total)) best = { ...a, playerId: pid, total: v };
    }
    if (best) out.leaders.push(best);
  }
  out.appearances = [...apps.entries()].map(([playerId, n]) => ({ playerId, matches: n })).sort((x, y) => y.matches - x.matches).slice(0, 5);
  return out;
}
