/**
 * Chess engine — a result-only match: record who won (or a draw) and how. No
 * move-by-move scoring; the board is the players'. Scoring is the standard
 * 1 / ½ / 0, so Swiss and round-robin tables read like a crosstable.
 */
export type Side = 'home' | 'away';
export type ChessMethod =
  | 'checkmate' | 'resignation' | 'time' | 'agreement' | 'stalemate'
  | 'repetition' | 'fifty-move' | 'insufficient' | 'forfeit';

export const DECISIVE: ChessMethod[] = ['checkmate', 'resignation', 'time', 'forfeit'];
export const DRAWN: ChessMethod[] = ['agreement', 'stalemate', 'repetition', 'fifty-move', 'insufficient'];

export const METHOD_LABEL: Record<ChessMethod, string> = {
  checkmate: 'Checkmate', resignation: 'Resignation', time: 'On time', forfeit: 'Forfeit',
  agreement: 'Draw agreed', stalemate: 'Stalemate', repetition: 'Threefold repetition',
  'fifty-move': '50-move rule', insufficient: 'Insufficient material',
};

export interface ChessState {
  /** which side has the white pieces */
  white: Side;
  /** time control label for reference, e.g. 'rapid' (from the format) */
  timeControl: string;
  winner?: Side | 'draw';
  method?: ChessMethod;
  /** optional move count, for the record */
  moves?: number;
  ended: boolean;
  seq: number;
}

/** `config.white` (SD-26) is the fixture's colour from the Swiss pairing;
 *  absent (every older fixture) = home has White, as before. The scorer can
 *  still switch it with SET_WHITE before the result. */
export function init(config?: Record<string, unknown>): ChessState {
  const white: Side = config?.white === 'away' ? 'away' : 'home';
  return { white, timeControl: String(config?.timeControl ?? 'rapid'), ended: false, seq: 0 };
}

/** Actions: SET_WHITE {side}, RESULT {winner, method, moves?}. PLAYED is a no-op
 *  carrier the controls use to credit each player a game for their profile. */
export function reducer(s: ChessState, a: { type: string; side?: Side; payload?: Record<string, unknown> }): ChessState {
  if (a.type === 'SET_WHITE' && !s.ended) {
    const side = (a.payload?.side ?? a.side) as Side | undefined;
    return side === 'home' || side === 'away' ? { ...s, white: side } : s;
  }
  if (a.type === 'RESULT' && !s.ended) {
    const winner = a.payload?.winner as Side | 'draw' | undefined;
    const method = a.payload?.method as ChessMethod | undefined;
    if (winner !== 'home' && winner !== 'away' && winner !== 'draw') return s;
    // A method must be consistent with the outcome (no "draw by checkmate").
    if (method && (winner === 'draw' ? !DRAWN.includes(method) : !DECISIVE.includes(method))) return s;
    const moves = typeof a.payload?.moves === 'number' && a.payload.moves > 0 ? Math.round(a.payload.moves as number) : undefined;
    return { ...s, winner, method, moves, ended: true, seq: s.seq + 1 };
  }
  return s;
}

/** Game points: 1 / ½ / 0. */
export function points(s: ChessState): { home: number; away: number } {
  if (!s.ended || !s.winner) return { home: 0, away: 0 };
  if (s.winner === 'draw') return { home: 0.5, away: 0.5 };
  return s.winner === 'home' ? { home: 1, away: 0 } : { home: 0, away: 1 };
}

/** "1-0", "0-1" or "½-½" (the chess way of writing a result). */
export function resultString(s: ChessState): string {
  if (!s.ended || !s.winner) return '–';
  if (s.winner === 'draw') return '½-½';
  // Written white-first.
  const whiteWon = s.winner === s.white;
  return whiteWon ? '1-0' : '0-1';
}

/** SD-116 — the arbiter's result written White-first for a pending result:
 *  "1-0", "½-½" or "0-1" for `winner` when `white` has the white pieces. */
export function scoreFor(white: Side, winner: Side | 'draw'): '1-0' | '½-½' | '0-1' {
  if (winner === 'draw') return '½-½';
  return winner === white ? '1-0' : '0-1';
}

/** SD-116 — the one-line result the confirm sheet asks about:
 *  "1-0: Anand beat Carlsen by Resignation", "½-½: Anand drew with Carlsen (Stalemate)".
 *  Names are White first (whiteName has the white pieces). */
export function resultSentence(white: Side, winner: Side | 'draw', whiteName: string, blackName: string, method?: ChessMethod): string {
  const sc = scoreFor(white, winner);
  if (winner === 'draw') return `${sc}: ${whiteName} drew with ${blackName}${method ? ` (${METHOD_LABEL[method]})` : ''}`;
  const [w, l] = winner === white ? [whiteName, blackName] : [blackName, whiteName];
  const how = method ? (method === 'time' ? ' on time' : method === 'forfeit' ? ' by forfeit' : ` by ${METHOD_LABEL[method]}`) : '';
  return `${sc}: ${w} beat ${l}${how}`;
}
