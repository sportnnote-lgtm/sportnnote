/**
 * SD-134 — a Swiss round as the arbiter runs it (pure, RN-free — node tests
 * load it):
 *  • numbered boards (Bd 1 = the top score group's top board, as the pairing
 *    made them; the board number is saved on each game as `__board`, older
 *    games fall back to the players' scores before the round, then their
 *    order);
 *  • the round's pairing sheet as text (WhatsApp / notice board) and as an
 *    A4 page (the SD-129 print helpers);
 *  • the round-results sheet's picks — 1-0 / ½-½ / 0-1 / +/− / −/+ / 0-0 —
 *    turned into the SAME `RESULT` action the game screen records (with each
 *    player's profile credit), so a result entered here is identical to one
 *    entered on the game.
 */
import type { Match } from '../../core/types';
import { chessResultCredit } from './stats.ts';
import type { ChessMethod, Side } from './engine.ts';

/** Format key: the board number a Swiss game was paired on. */
export const BOARD_KEY = '__board';

export type BoardPick = '1-0' | '½-½' | '0-1' | '+/-' | '-/+' | '0-0';
export const BOARD_PICKS: BoardPick[] = ['1-0', '½-½', '0-1', '+/-', '-/+', '0-0'];
export const PICK_LABEL: Record<BoardPick, string> = {
  '1-0': 'White won', '½-½': 'Draw', '0-1': 'Black won',
  '+/-': 'White won by forfeit', '-/+': 'Black won by forfeit', '0-0': 'Double forfeit (both lose)',
};

export interface RoundBoard {
  no: number;
  matchId: string;
  /** the side with White on the fixture */
  white: Side;
  whiteId: string;
  blackId: string;
  whiteName: string;
  blackName: string;
  /** players' scores before this round (when known) */
  whitePts?: number;
  blackPts?: number;
  status: Match['status'];
  /** the result written White first ("1-0", "½-½", "+/−", "0-0") once recorded */
  result?: string;
}

const swissRound = (stage?: string): number | undefined => {
  const m = /^swiss(\d+)$/.exec(String(stage ?? ''));
  return m ? Number(m[1]) : undefined;
};

/** Who has White on a fixture: the game's state, else the paired `white`, else home. */
export function whiteOf(m: Pick<Match, 'state' | 'format'>): Side {
  const st = m.state as { white?: unknown } | null | undefined;
  if (st && (st.white === 'home' || st.white === 'away')) return st.white;
  const f = m.format as { white?: unknown } | undefined;
  return f?.white === 'away' ? 'away' : 'home';
}

/** A finished game's result White first, FIDE style: 1-0, ½-½, 0-1, +/−, −/+, 0-0. */
export function resultWhiteFirst(m: Pick<Match, 'state' | 'format' | 'winner' | 'walkover' | 'status'>): string | undefined {
  if (m.status !== 'completed') return undefined;
  const st = (m.state ?? {}) as { method?: string; winner?: string };
  const w = whiteOf(m);
  const winner = m.winner ?? (st.winner as Match['winner']);
  if (st.method === 'double-forfeit') return '0-0';
  if (!winner) return undefined;
  const forfeit = st.method === 'forfeit' || !!m.walkover;
  if (winner === 'draw') return '½-½';
  const whiteWon = winner === w;
  if (forfeit) return whiteWon ? '+/−' : '−/+';
  return whiteWon ? '1-0' : '0-1';
}

/**
 * The boards of Swiss round `round`: numbered by the saved board number, else
 * by the higher pre-round score of the two players, then the lower one, then
 * kick-off, then id. `scoreBefore` (optional) gives each entrant's points
 * before the round.
 */
export function roundBoards(matches: Match[], round: number, scoreBefore?: (id: string) => number | undefined): RoundBoard[] {
  const games = matches.filter((m) => m.sport === 'chess' && swissRound(m.stage) === round && m.status !== 'cancelled');
  const boardNo = (m: Match) => { const n = Number((m.format as Record<string, unknown> | undefined)?.[BOARD_KEY]); return Number.isFinite(n) && n > 0 ? n : undefined; };
  const sc = (id: string) => scoreBefore?.(id) ?? 0;
  const sorted = [...games].sort((a, b) => {
    const na = boardNo(a), nb = boardNo(b);
    if (na !== undefined && nb !== undefined) return na - nb;
    if (na !== undefined) return -1;
    if (nb !== undefined) return 1;
    const hi = (m: Match) => Math.max(sc(m.homeTeam.id), sc(m.awayTeam.id));
    const lo = (m: Match) => Math.min(sc(m.homeTeam.id), sc(m.awayTeam.id));
    return hi(b) - hi(a) || lo(b) - lo(a) || String(a.startsAt).localeCompare(String(b.startsAt)) || a.id.localeCompare(b.id);
  });
  return sorted.map((m, i) => {
    const w = whiteOf(m);
    const [W, B] = w === 'home' ? [m.homeTeam, m.awayTeam] : [m.awayTeam, m.homeTeam];
    const result = resultWhiteFirst(m);
    return {
      no: boardNo(m) ?? i + 1, matchId: m.id, white: w, whiteId: W.id, blackId: B.id, whiteName: W.name, blackName: B.name,
      ...(scoreBefore ? { whitePts: sc(W.id), blackPts: sc(B.id) } : {}),
      status: m.status, ...(result ? { result } : {}),
    };
  });
}

/** The Swiss rounds in the matches (sorted). */
export function swissRoundsIn(matches: Match[]): number[] {
  return [...new Set(matches.map((m) => swissRound(m.stage)).filter((r): r is number => r !== undefined))].sort((a, b) => a - b);
}

/* --------------------------- the result picks ---------------------------- */

export interface BoardResultAction {
  type: 'RESULT';
  side?: Side;
  payload: { winner: Side | 'draw'; method?: ChessMethod };
  attribution?: ReturnType<typeof chessResultCredit>;
  attribution2?: ReturnType<typeof chessResultCredit>;
}

/** The outcome of a pick on a board where `white` has White. */
export function pickOutcome(pick: BoardPick, white: Side): { winner: Side | 'draw'; method?: ChessMethod } {
  const black: Side = white === 'home' ? 'away' : 'home';
  switch (pick) {
    case '1-0': return { winner: white };
    case '0-1': return { winner: black };
    case '½-½': return { winner: 'draw' };
    case '+/-': return { winner: white, method: 'forfeit' };
    case '-/+': return { winner: black, method: 'forfeit' };
    case '0-0': return { winner: 'draw', method: 'double-forfeit' };
  }
}

/** The RESULT action for a pick — the one ScoringControls dispatches (same
 *  payload and profile credits), so the game, the table and both profiles
 *  read the same as a result recorded on the game screen. */
export function boardResultAction(
  pick: BoardPick, white: Side,
  players: { home?: { id: string; fullName: string }; away?: { id: string; fullName: string } } = {},
): BoardResultAction {
  const { winner, method } = pickOutcome(pick, white);
  const dff = method === 'double-forfeit';
  const credit = (side: Side) => chessResultCredit(side, players[side], winner, method, dff);
  return {
    type: 'RESULT',
    ...(winner === 'draw' ? {} : { side: winner }),
    payload: { winner, ...(method ? { method } : {}) },
    attribution: credit('home'),
    attribution2: credit('away'),
  };
}

/** "Bd 3: Asha Rao 1-0 Vikram S" — the confirm sheet's lines. */
export const pickLine = (b: Pick<RoundBoard, 'no' | 'whiteName' | 'blackName'>, pick: BoardPick): string =>
  `Bd ${b.no}: ${b.whiteName} ${pick === '+/-' ? '+/−' : pick === '-/+' ? '−/+' : pick} ${b.blackName}`;

/* ---------------------------- the pairing sheet --------------------------- */

const half = (n?: number) => (n === undefined ? '' : String(n).replace('.5', '½').replace(/^0½$/, '½'));

/** The pairing sheet as text — for WhatsApp or a notice board. */
export function pairingsText(o: {
  event: string; round: number; boards: RoundBoard[]; byes?: string[]; notPaired?: string; results?: boolean;
}): string {
  const lines = [`♟️ ${o.event} — Round ${o.round} ${o.results ? 'results' : 'pairings'}`, ''];
  for (const b of o.boards) {
    const pts = (n?: number) => (n === undefined ? '' : ` (${half(n)})`);
    const res = o.results ? ` ${b.result ?? '…'} ` : ' – ';
    lines.push(`Bd ${b.no}. ${b.whiteName}${pts(b.whitePts)}${res}${b.blackName}${pts(b.blackPts)}`);
  }
  if (o.byes?.length) lines.push('', `Bye: ${o.byes.join(', ')}`);
  if (o.notPaired) lines.push(o.byes?.length ? '' : '', `Not paired — ${o.notPaired}`);
  lines.push('', 'White is named first.');
  return lines.join('\n');
}

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The pairing (or results) table, as one sheet body for the SD-129 printable document. */
export function pairingsSheet(o: { round: number; boards: RoundBoard[]; byes?: string[]; notPaired?: string; results?: boolean }): string {
  const rows = o.boards.map((b) => `<tr><td class="num">${b.no}</td><td>${esc(b.whiteName)}</td><td class="num">${esc(half(b.whitePts))}</td>`
    + `<td class="c">${o.results ? esc(b.result ?? '') : '–'}</td><td>${esc(b.blackName)}</td><td class="num">${esc(half(b.blackPts))}</td>`
    + `${o.results ? '' : '<td class="blank"></td>'}</tr>`).join('');
  const head = `<tr><th class="num">Bd</th><th>White</th><th class="num">Pts</th><th class="c">${o.results ? 'Result' : '–'}</th><th>Black</th><th class="num">Pts</th>${o.results ? '' : '<th>Result</th>'}</tr>`;
  const tail = [o.byes?.length ? `Bye: ${o.byes.map(esc).join(', ')}` : '', o.notPaired ? `Not paired — ${esc(o.notPaired)}` : ''].filter(Boolean)
    .map((t) => `<p class="note">${t}</p>`).join('');
  return `<h1>Round ${o.round} — ${o.results ? 'results' : 'pairings'}</h1><div class="sub">White is named first · Pts = score before the round</div><table>${head}${rows}</table>${tail}`;
}
