/**
 * SD-121 — a drawn chess TEAM match in a knockout (SD-48 board ties, e.g. 2-2
 * on 4 boards) must still produce a winner. Event regulations differ, so the
 * rule is the organiser's (TieSpec `koBreak`):
 *  - 'board-count'    Berger board count: a result on board b of n is worth
 *                     n − b + 1, so board 1 weighs most (FIDE Olympiad-style
 *                     tie-break; today's series.ts behaviour).
 *  - 'lowest-board'   eliminate the lowest board, then the next lowest… until
 *                     one team is ahead on the boards left (common national
 *                     team KO practice — check the event's regulations).
 * Still level after the rule → a play-off game (an Armageddon between the
 * players the captains nominate, usually board 1); its winner decides.
 * Nothing decided → undefined (the organiser's "advances" pick, SD-120).
 *
 * PURE — reads the rubbers (Series legs) only; never edits series / bracket.
 */
import type { Match } from '../../core/types';

export type ChessTeamKoBreak = 'board-count' | 'lowest-board';
export const CHESS_TEAM_KO_BREAKS: { id: ChessTeamKoBreak; label: string; note: string }[] = [
  { id: 'board-count', label: 'Board count', note: 'A win on board 1 counts most (board 1 = n points … last board = 1). Still level → a play-off game.' },
  { id: 'lowest-board', label: 'Drop the lowest board', note: 'Ignore the last board’s result, then the next… until one team is ahead. Still level → a play-off game.' },
];

/** The minimum a decider needs from a team match (a Series of board rubbers). */
export interface TeamKoInput {
  teamAId: string;
  teamBId?: string;
  /** the board rubbers in board order (board 1 first) */
  legs: Pick<Match, 'status' | 'winner' | 'homeTeam' | 'awayTeam' | 'result' | 'state'>[];
}

/** A board's points for team A and team B (win 1, draw ½; a no-result or a
 *  0-0 double forfeit is worth nothing to either). */
function boardPts(m: TeamKoInput['legs'][number], teamAId: string): [number, number] {
  if (m.status !== 'completed') return [0, 0];
  if (m.result?.kind === 'no_result' || m.result?.kind === 'abandoned') return [0, 0];
  if (m.winner === 'draw') {
    return (m.state as { method?: unknown } | null | undefined)?.method === 'double-forfeit' ? [0, 0] : [0.5, 0.5];
  }
  if (!m.winner) return [0, 0];
  const aHome = m.homeTeam?.id === teamAId;
  return (m.winner === 'home') === aHome ? [1, 0] : [0, 1];
}

/** Board points each team scored. */
export function teamBoardPoints(t: TeamKoInput): { a: number; b: number } {
  return t.legs.reduce((acc, m) => { const [x, y] = boardPts(m, t.teamAId); return { a: acc.a + x, b: acc.b + y }; }, { a: 0, b: 0 });
}

/** Team A / team B under the rule only (undefined = still level). */
export function teamKoRuleWinner(t: TeamKoInput, rule: ChessTeamKoBreak): string | undefined {
  const n = t.legs.length;
  const pts = t.legs.map((m) => boardPts(m, t.teamAId));
  const pick = (a: number, b: number) => (a > b ? t.teamAId : b > a ? t.teamBId : undefined);
  if (rule === 'board-count') {
    let a = 0, b = 0;
    pts.forEach(([x, y], i) => { a += x * (n - i); b += y * (n - i); });
    return pick(a, b);
  }
  // lowest-board: drop boards from the bottom while level
  for (let keep = n - 1; keep >= 1; keep--) {
    let a = 0, b = 0;
    for (let i = 0; i < keep; i++) { a += pts[i][0]; b += pts[i][1]; }
    const w = pick(a, b);
    if (w) return w;
  }
  return undefined;
}

/**
 * Who goes through a knockout team match: board points, then the event's
 * rule, then the play-off game's winner (a team id) if one was played.
 * undefined while the boards aren't all finished, or when nothing decides it.
 */
export function chessTeamKoWinner(t: TeamKoInput, rule: ChessTeamKoBreak = 'board-count', playoffWinnerId?: string): string | undefined {
  if (t.legs.some((m) => m.status !== 'completed' && m.status !== 'cancelled')) return undefined;
  const { a, b } = teamBoardPoints(t);
  if (a !== b) return a > b ? t.teamAId : t.teamBId;
  return teamKoRuleWinner(t, rule) ?? playoffWinnerId;
}

/** The rule a tie spec names (absent / unknown = board count, as before). */
export const koBreakOf = (spec?: { koBreak?: unknown } | null): ChessTeamKoBreak =>
  spec?.koBreak === 'lowest-board' ? 'lowest-board' : 'board-count';
