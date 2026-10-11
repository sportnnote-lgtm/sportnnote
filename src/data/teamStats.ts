/**
 * A team's stats from its completed matches: recent form, scored/conceded,
 * head-to-head per opponent, and top performers (from the stat lines recorded
 * while scoring). Pure — the team page feeds it matches, stat lines and who
 * played for this team in each match.
 */
import type { Match, SportId, StatLine } from '../core/types';
import { statSchema, labelCompact } from '../sports/statSchemas.ts';
import { rankPlayers, statDefIn } from '../sports/statSchema.ts';
import { withLineResults } from './leaderMinimums.ts';

/** W / D / L, plus a cricket tie ('T') and a no result / abandoned match
 *  ('NR'), which counts as played (SD-12) — the same Played as the table. */
export type Result = 'W' | 'D' | 'L' | 'T' | 'NR';
export interface HeadToHead {
  opponentId: string; opponentName: string; played: number; won: number;
  /** level results — draws, or cricket ties */
  drawn: number; lost: number; for: number; against: number;
  /** no results / abandoned (SD-12) */
  nr: number;
  /** SD-20 — the latest meeting, from this team's side: result, score and the
   *  set/game line ("6-4, 3-2 ret.") when the sport has one */
  last?: { matchId: string; result: Result; for?: number; against?: number; line?: string };
}

/** SD-20 — the head-to-head row's latest meeting: "Last: W 2–1 · 6-4, 3-6, [10-7]",
 *  "Last: W w/o", "Last: L 0–1 · 3-6, 1-2 ret.", "Last: NR". '' when unknown. */
export function h2hLastText(h: Pick<HeadToHead, 'last'>): string {
  const l = h.last;
  if (!l) return '';
  if (l.line === 'w/o') return `Last: ${l.result} w/o`;
  const score = l.for != null && l.against != null ? ` ${l.for}–${l.against}` : '';
  return `Last: ${l.result}${score}${l.line ? ` · ${l.line}` : ''}`;
}
export interface Leader {
  icon: string; label: string; stat: string; playerId: string; total: number;
  /** SD-105 — the figure as shown when it isn't "<total> <stat label>" ("4 wins", "75%") */
  display?: string;
}

/** SD-105 — the team-page record leaders for sports ranked by results (the
 *  racket sports: "Most wins", "Best win %" from the schema's `matchesWon` /
 *  `winPct`). Sports without those stats keep their per-match awards only. */
const RECORD_LEADERS: { key: string; icon: string }[] = [
  { key: 'matchesWon', icon: '🏆' },
  { key: 'winPct', icon: '📈' },
];
export interface TeamStats {
  played: number; won: number;
  /** level results — draws, or cricket ties ('T') */
  drawn: number; lost: number;
  /** no results / abandoned — included in `played` (SD-12) */
  nr: number;
  /** most recent first, up to 5 */
  form: { matchId: string; result: Result; opponentName: string; line?: string }[];
  scored: number; conceded: number;
  /** what the score counts in this sport, e.g. "goals"; undefined = mixed / generic */
  unit?: string;
  headToHead: HeadToHead[];
  leaders: Leader[];
  /** players by matches played for this team (most first) */
  appearances: { playerId: string; matches: number }[];
}


export function resultFor(m: Match, teamId: string): Result | null {
  if (m.status !== 'completed') return null;
  const side = m.homeTeam.id === teamId ? 'home' : m.awayTeam.id === teamId ? 'away' : null;
  if (!side) return null;
  // A no result / abandoned match (parity #04) is played, like the table counts it (SD-12).
  if (m.result?.kind === 'no_result' || m.result?.kind === 'abandoned') return 'NR';
  if (!m.winner) return null;
  // SD-67: a chess double forfeit (0-0) is a loss for both
  if (m.winner === 'draw' && !m.result && m.sport === 'chess' && (m.state as { method?: unknown } | null | undefined)?.method === 'double-forfeit') return 'L';
  // A level cricket match is a tie, not a draw (CK-02).
  if (m.winner === 'draw') return m.sport === 'cricket' ? 'T' : 'D';
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
  /** SD-20 — the set/game line of a match read from this team's side (the team
   *  page passes `matchLineFor`); omitted = no lines */
  lineOf?: (m: Match) => string,
): TeamStats {
  const done = matches
    .filter((m) => (m.homeTeam.id === teamId || m.awayTeam.id === teamId) && resultFor(m, teamId))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const out: TeamStats = { played: 0, won: 0, drawn: 0, lost: 0, nr: 0, form: [], scored: 0, conceded: 0, headToHead: [], leaders: [], appearances: [] };
  const h2h = new Map<string, HeadToHead>();
  const sports = new Set<SportId>();
  for (const m of done) {
    const home = m.homeTeam.id === teamId;
    const opp = home ? m.awayTeam : m.homeTeam;
    const r = resultFor(m, teamId)!;
    sports.add(m.sport);
    out.played++;
    const tally = (t: { won: number; drawn: number; lost: number; nr: number }) => {
      if (r === 'W') t.won++; else if (r === 'D' || r === 'T') t.drawn++; else if (r === 'NR') t.nr++; else t.lost++;
    };
    tally(out);
    let line = '';
    try { line = lineOf?.(m) ?? ''; } catch { line = ''; }
    if (out.form.length < 5) out.form.push({ matchId: m.id, result: r, opponentName: opp.name, ...(line ? { line } : {}) });
    // A no result has no score to count (the table leaves it out of for/against too).
    const noScore = m.walkover || !m.score || r === 'NR';
    const f = noScore ? 0 : home ? m.score!.home : m.score!.away;
    const a = noScore ? 0 : home ? m.score!.away : m.score!.home;
    out.scored += f; out.conceded += a;
    const row = h2h.get(opp.id) ?? { opponentId: opp.id, opponentName: opp.name, played: 0, won: 0, drawn: 0, lost: 0, for: 0, against: 0, nr: 0 };
    row.played++; row.for += f; row.against += a;
    // `done` is newest first → the first meeting seen is the latest.
    if (!row.last) row.last = { matchId: m.id, result: r, ...(noScore ? {} : { for: f, against: a }), ...(line ? { line } : {}) };
    tally(row);
    h2h.set(opp.id, row);
  }
  // what the score counts, from the stat schema (SD-15)
  out.unit = sports.size === 1 ? statSchema([...sports][0])?.scoreUnit : undefined;
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
  // SD-105 — racket sports: most wins and best win % (team members only, the
  // schema's minimum — 3 decided matches for win %), from each line's result.
  const seen = new Set<string>();
  const mineLines = lines.filter((l) => doneIds.has(l.matchId) && (playedFor[l.matchId] ?? []).includes(l.playerId));
  for (const sp of sports) {
    const schema = statSchema(sp);
    if (!schema) continue;
    const ls = withLineResults(mineLines.filter((l) => l.sport === sp), done);
    for (const r of RECORD_LEADERS) {
      const def = schema.leaders.includes(r.key) ? statDefIn(schema, r.key) : undefined;
      if (!def || seen.has(r.key)) continue;
      seen.add(r.key);
      const top = rankPlayers(schema, def, ls, { limit: 1 })[0];
      if (!top) continue;
      const display = def.format?.unit === 'percent' ? top.text : `${top.text} ${labelCompact(def.key, top.value, sp)}`;
      out.leaders.push({ icon: r.icon, label: def.leaderLabel ?? def.label, stat: def.key, playerId: top.playerId, total: top.value, display });
    }
  }
  const awards = [...sports].flatMap((sp) => awardsBySport[sp] ?? []);
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
