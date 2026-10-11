/**
 * SD-47 (GEN-16) — head-to-head and form. PURE (node tests load it).
 *
 *  - `playerForm`       — a player's last N results in a sport (newest first).
 *  - `playerHeadToHead` — player vs player: the matches where both have a stat
 *    line on OPPOSITE sides. A line's side comes from its `opponent` label
 *    (correct per line since SD-119), else the match rosters (`sideOf`); when
 *    neither tells, a decided W/L pair still proves opposite sides. Two lines
 *    on the same side (doubles partners) are not a meeting.
 *  - `opponentsFaced`   — everyone a player has met in a sport (from the other
 *    lines of the player's matches + singles rosters), most met first: the
 *    "Compare with…" list.
 *  - `teamHeadToHead`   — team vs team from the matches (team sports).
 * Each meeting is read from the FIRST player's / team's side: result, score
 * and the set / game line (`lineOf`, the screens pass `matchLine`).
 */
import type { Match, SportId, StatLine } from '../core/types';
import type { LineResult } from '../core/types';
import { lineResult } from './appearances.ts';
import { sideOf } from './lineContext.ts';
import { resultFor } from './teamStats.ts';

type Side = 'home' | 'away';

export interface FormEntry {
  matchId: string;
  result: LineResult;
  date?: string;
  opponent?: string;
}

/** Newest first; a match in play or a field-event line has no result. */
const newest = (a: { date?: string; id?: string }, b: { date?: string; id?: string }) =>
  (b.date ?? '').localeCompare(a.date ?? '') || (b.id ?? '').localeCompare(a.id ?? '');

/** A player's last `n` results in `sport` (newest first). */
export function playerForm(lines: StatLine[], matchById: Map<string, Match>, sport: SportId, n = 5): FormEntry[] {
  const out: FormEntry[] = [];
  const rows = lines
    .filter((l) => l.sport === sport && !l.eventId && l.matchId)
    .map((l) => ({ l, date: matchById.get(l.matchId)?.startsAt ?? l.date, id: l.id }))
    .sort(newest);
  for (const { l, date } of rows) {
    if (out.length >= n) break;
    if (l.pending) continue;
    const m = matchById.get(l.matchId);
    const r = lineResult(l, m);
    if (!r) continue;
    out.push({ matchId: l.matchId, result: r, ...(date ? { date } : {}), ...(l.opponent ? { opponent: l.opponent } : {}) });
  }
  return out;
}

export interface Meeting {
  matchId: string;
  date: string;
  /** from the first player's / team's side */
  result: LineResult;
  for?: number; against?: number;
  /** the set / game line from that side ("6-4, 3-6, 7-5"), '' when none */
  line: string;
  tournamentId?: string;
  walkover?: boolean;
}

export interface HeadToHeadRecord {
  played: number; won: number; drawn: number; lost: number; nr: number;
  /** newest first */
  meetings: Meeting[];
}

const blank = (): HeadToHeadRecord => ({ played: 0, won: 0, drawn: 0, lost: 0, nr: 0, meetings: [] });

function add(rec: HeadToHeadRecord, m: Match, side: Side, result: LineResult, lineOf?: (m: Match, side: Side) => string) {
  rec.played++;
  if (result === 'W') rec.won++; else if (result === 'L') rec.lost++; else if (result === 'NR') rec.nr++; else rec.drawn++;
  let line = '';
  try { line = lineOf?.(m, side) ?? ''; } catch { line = ''; }
  const scored = result !== 'NR' && !m.walkover && m.score;
  rec.meetings.push({
    matchId: m.id, date: m.startsAt, result, line,
    ...(scored ? { for: side === 'home' ? m.score!.home : m.score!.away, against: side === 'home' ? m.score!.away : m.score!.home } : {}),
    ...(m.tournamentId ? { tournamentId: m.tournamentId } : {}),
    ...(m.walkover ? { walkover: true } : {}),
  });
}

const sortMeetings = (rec: HeadToHeadRecord) => {
  rec.meetings.sort((a, b) => b.date.localeCompare(a.date) || b.matchId.localeCompare(a.matchId));
  return rec;
};

const OPP: Record<LineResult, LineResult> = { W: 'L', L: 'W', D: 'D', T: 'T', NR: 'NR' };

/** Which sides two players were on in a match: [a, b], or null when they were
 *  on the same side or it can't be told. A decided pair (one won, one lost)
 *  were opponents whatever the labels say (a pre-SD-119 chess loser's line
 *  named its own side); the winner's side is the match winner. Otherwise the
 *  line sides (`opponent` label, else rosters) decide. */
function opposingSides(la: StatLine, lb: StatLine, m: Match): [Side, Side] | null {
  const flip = (x: Side): Side => (x === 'home' ? 'away' : 'home');
  const ra = lineResult(la, m), rb = lineResult(lb, m);
  const sa = sideOf(la, m), sb = sideOf(lb, m);
  if (ra && rb && (ra === 'W' || ra === 'L') && rb === OPP[ra]) {
    const winner = m.winner === 'home' || m.winner === 'away' ? m.winner : m.result?.winner;
    if (winner) { const a = ra === 'W' ? winner : flip(winner); return [a, flip(a)]; }
    const a = sa ?? (sb ? flip(sb) : undefined);
    return a ? [a, flip(a)] : null;
  }
  if (sa && sb) return sa !== sb ? [sa, sb] : null;
  return null;
}

/** Player `a` vs player `b` in `sport`, from `a`'s side. `lines` may hold
 *  anyone's lines (both players' own lines, or every line of a's matches). */
export function playerHeadToHead(
  sport: SportId, a: string, b: string, lines: StatLine[], matchById: Map<string, Match>,
  lineOf?: (m: Match, side: Side) => string,
): HeadToHeadRecord {
  const rec = blank();
  if (!a || !b || a === b) return rec;
  const byMatch = new Map<string, { a?: StatLine; b?: StatLine }>();
  for (const l of lines) {
    if (l.sport !== sport || !l.matchId || l.eventId) continue;
    if (l.playerId !== a && l.playerId !== b) continue;
    const e = byMatch.get(l.matchId) ?? byMatch.set(l.matchId, {}).get(l.matchId)!;
    if (l.playerId === a) e.a = l; else e.b = l;
  }
  for (const [id, e] of byMatch) {
    const m = matchById.get(id);
    if (!m || !e.a) continue;
    let sides: [Side, Side] | null = null;
    if (e.b) sides = opposingSides(e.a, e.b, m);
    else {
      // b has no line (an old match): the singles rosters can still tell
      const sa = sideOf(e.a, m);
      const other = sa === 'home' ? m.awayTeam : sa === 'away' ? m.homeTeam : undefined;
      if (sa && other?.roster?.length === 1 && other.roster[0] === b) sides = [sa, sa === 'home' ? 'away' : 'home'];
    }
    if (!sides) continue;
    const r = lineResult(e.a, m);
    if (!r || e.a.pending) continue;
    add(rec, m, sides[0], r, lineOf);
  }
  return sortMeetings(rec);
}

export interface OpponentFaced { playerId: string; played: number; won: number; drawn: number; lost: number }

/** Everyone `a` met in `sport`: from the other lines of a's matches (any
 *  opposing line), else a singles roster. Most met first. */
export function opponentsFaced(
  sport: SportId, a: string, lines: StatLine[], matchById: Map<string, Match>,
): OpponentFaced[] {
  const mine = lines.filter((l) => l.playerId === a && l.sport === sport && l.matchId && !l.eventId);
  const byMatch = new Map<string, StatLine[]>();
  for (const l of lines) if (l.matchId && l.sport === sport) (byMatch.get(l.matchId) ?? byMatch.set(l.matchId, []).get(l.matchId)!).push(l);
  const out = new Map<string, OpponentFaced>();
  for (const la of mine) {
    const m = matchById.get(la.matchId);
    if (!m) continue;
    const r = la.pending ? undefined : lineResult(la, m);
    if (!r) continue;
    const opps = new Set<string>();
    for (const lb of byMatch.get(la.matchId) ?? []) {
      if (lb.playerId === a) continue;
      if (opposingSides(la, lb, m)) opps.add(lb.playerId);
    }
    if (!opps.size) {
      const sa = sideOf(la, m);
      const other = sa === 'home' ? m.awayTeam : sa === 'away' ? m.homeTeam : undefined;
      for (const pid of other?.roster ?? []) if (pid !== a && (other?.roster?.length ?? 0) <= 2) opps.add(pid);
    }
    for (const pid of opps) {
      const e = out.get(pid) ?? out.set(pid, { playerId: pid, played: 0, won: 0, drawn: 0, lost: 0 }).get(pid)!;
      e.played++;
      if (r === 'W') e.won++; else if (r === 'L') e.lost++; else if (r !== 'NR') e.drawn++;
    }
  }
  return [...out.values()].sort((x, y) => y.played - x.played || y.won - x.won || x.playerId.localeCompare(y.playerId));
}

/** Team `a` vs team `b` (any sport), from `a`'s side. */
export function teamHeadToHead(
  a: string, b: string, matches: Match[], lineOf?: (m: Match, side: Side) => string,
): HeadToHeadRecord {
  const rec = blank();
  if (!a || !b || a === b) return rec;
  for (const m of matches) {
    const ids = [m.homeTeam?.id, m.awayTeam?.id];
    if (!ids.includes(a) || !ids.includes(b)) continue;
    const r = resultFor(m, a);
    if (!r) continue;
    add(rec, m, m.homeTeam.id === a ? 'home' : 'away', r, lineOf);
  }
  return sortMeetings(rec);
}

/** A team's last `n` results (newest first) — the team form strip. */
export function teamForm(teamId: string, matches: Match[], n = 5): FormEntry[] {
  const out: FormEntry[] = [];
  const done = matches
    .filter((m) => m.homeTeam?.id === teamId || m.awayTeam?.id === teamId)
    .sort((x, y) => y.startsAt.localeCompare(x.startsAt) || y.id.localeCompare(x.id));
  for (const m of done) {
    if (out.length >= n) break;
    const r = resultFor(m, teamId);
    if (!r) continue;
    out.push({ matchId: m.id, result: r, date: m.startsAt, opponent: (m.homeTeam.id === teamId ? m.awayTeam : m.homeTeam).name });
  }
  return out;
}

/** "3W 1D 2L" (W-L only when nothing was drawn), + " 1NR" when any. */
export function h2hRecordText(r: Pick<HeadToHeadRecord, 'won' | 'drawn' | 'lost' | 'nr'>, drawLetter: 'D' | 'T' = 'D'): string {
  return `${r.won}W${r.drawn ? ` ${r.drawn}${drawLetter}` : ''} ${r.lost}L${r.nr ? ` ${r.nr}NR` : ''}`;
}

/** A meeting's score as read from the first side: "W 2–1 · 6-4, 3-6, 7-5",
 *  "W w/o", "NR". */
export function meetingText(m: Meeting): string {
  if (m.walkover) return `${m.result} w/o`;
  const score = m.for != null && m.against != null ? ` ${m.for}–${m.against}` : '';
  return `${m.result}${score}${m.line ? ` · ${m.line}` : ''}`;
}
