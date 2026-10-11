/**
 * SD-62 / SD-74 — who serves to whom in table tennis and badminton DOUBLES, by
 * name. DERIVED from the score, the current game's point log and an optional
 * per-game pick (`dblOrder`, from SET_SERVE_ORDER { server?, receiver? }) —
 * never stored, so undo / replay / timeline corrections stay right and old logs
 * replay identically (the pick is a new optional action payload; Decision 8).
 *
 * Table tennis (ITTF Laws 2.13.3, 2.13.4, 2.13.6):
 *  • the pair serving first in a game chooses which partner serves; in game 1
 *    the receiving pair chooses who receives first; in later games the first
 *    receiver is the player who served to the first server in the game before;
 *  • at each change of service the previous receiver serves and the partner of
 *    the previous server receives: A→X, X→B, B→Y, Y→A, …;
 *  • in the last possible game, the receiving pair changes its order when one
 *    pair first reaches 5 (10 in a 21-point game): A→X becomes A→Y.
 *  Turns follow `ttServer` (2 serves each, 1 each from 10-10; 21: 5 each).
 *
 * Badminton (BWF Law 11): the server serves from the right court when the
 * serving side's score is even, from the left when odd, diagonally to the
 * receiver; only the serving side changes courts, and only on winning a rally
 * as server; on losing serve, the new server is the player of the other side in
 * the court their score's parity points to. Either player may serve / receive
 * first in each game (Law 11.5–11.6 — the per-game pick).
 *
 * Without a pick: each pair's first listed player (roster order). PURE.
 * `gamePts` (optional): the current game's point winners in order, for callers
 * replaying without a log (serveStats); else read from `s.events`.
 */
import type { LiveEvent } from './liveEvents';
import { ttServer, ttServesEach } from './tabletennis/serve.ts';

export type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** SD-62 / SD-74 — per game index (0-based), the picked first server /
 *  receiver (player ids). Absent → roster order. */
export type DoublesOrder = Array<{ server?: string; receiver?: string } | null | undefined>;

export interface DoublesTurn {
  server: string;
  receiver: string;
  serverSide: Side;
  /** badminton: the court the server serves from (receiver is diagonal) */
  court?: 'right' | 'left';
  /** table tennis: the deciding game's receiving order has switched */
  switched?: boolean;
}

type Rosters = { home: string[]; away: string[] };

interface GameLike {
  current: { home: number; away: number };
  games: Array<[number, number]>;
  gamesWon: { home: number; away: number };
  gamesToWin: number;
  target: number;
  doubles: boolean;
  ended?: boolean;
  events: LiveEvent[];
  dblOrder?: DoublesOrder;
}

const pairOf = (r: string[] | undefined): [string, string] | null => (r && r.length >= 2 && r[0] && r[1] && r[0] !== r[1] ? [r[0], r[1]] : null);
const partnerIn = (pair: [string, string], id: string) => (pair[0] === id ? pair[1] : pair[0]);
const pickIn = (pair: [string, string], id: string | undefined, dflt: string) => (id && pair.includes(id) ? id : dflt);

/** The winners of the current game's points, in order (penalty points too —
 *  they're on the score). */
function gamePoints(s: GameLike, given?: Side[]): Side[] {
  if (given) return given.length === s.current.home + s.current.away ? given : [];
  const g = (s.games?.length ?? 0) + 1;
  const out: Side[] = [];
  for (const e of s.events ?? []) {
    if (e.kind !== 'point' || e.game !== g) continue;
    if (e.side === 'home' || e.side === 'away') out.push(e.side);
  }
  // A log that doesn't match the score (shouldn't happen) → trust the score.
  return out.length === s.current.home + s.current.away ? out : [];
}

/** May the doubles order be picked for the current game? Before its first
 *  point (any time with `v:2` — a fix; the score never moves). */
export const doublesOrderOpen = (s: Pick<GameLike, 'current' | 'doubles' | 'ended'>) =>
  !!s.doubles && !s.ended && s.current.home === 0 && s.current.away === 0;

/** Apply a SET_SERVE_ORDER { server?, receiver?, v? } (player ids) to the
 *  current game. Unchanged when not doubles, ended, or mid-game without v:2. */
export function withDoublesOrder<T extends GameLike>(s: T, payload: Record<string, unknown> | undefined): T {
  if (!s.doubles || s.ended) return s;
  if (!doublesOrderOpen(s) && payload?.v !== 2) return s;
  const server = typeof payload?.server === 'string' && payload.server ? payload.server : undefined;
  const receiver = typeof payload?.receiver === 'string' && payload.receiver ? payload.receiver : undefined;
  if (!server && !receiver) return s;
  const i = s.games?.length ?? 0;
  const order: DoublesOrder = [...(s.dblOrder ?? [])];
  order[i] = { ...(order[i] ?? {}), ...(server ? { server } : {}), ...(receiver ? { receiver } : {}) };
  return { ...s, dblOrder: order };
}

// ------------------------------------------------------------ table tennis --

/** Service turn index of point index `n` (points already played in the game). */
function ttTurn(n: number, target: number): number {
  const deuce = Math.max(1, (Number(target) || 11) - 1);
  const each = ttServesEach(target);
  return n < 2 * deuce ? Math.floor(n / each) : Math.floor((2 * deuce) / each) + (n - 2 * deuce);
}

/** First server / receiver of game `g` (no deciding-game switch inside). */
function ttGameStart(s: GameLike & { opening?: Side }, g: number, R: { home: [string, string]; away: [string, string] }): { s: string; r: string } {
  const opening = s.opening ?? 'home';
  const srvSide = (k: number): Side => (k % 2 === 0 ? opening : other(opening));
  const pick = s.dblOrder?.[0];
  let S = pickIn(R[srvSide(0)], pick?.server, R[srvSide(0)][0]);
  let Rc = pickIn(R[other(srvSide(0))], pick?.receiver, R[other(srvSide(0))][0]);
  for (let k = 1; k <= g; k++) {
    // game k: served first by the pair that received first in game k-1
    const pair = R[srvSide(k)];
    const pk = s.dblOrder?.[k];
    const nextS = pickIn(pair, pk?.server, Rc);
    // the receiver is the player who served to nextS in game k-1:
    // cycle S→Rc, Rc→pS, pS→pRc, pRc→S  ⇒ servedTo(Rc)=S, servedTo(pRc)=pS
    const pS = partnerIn(R[srvSide(k - 1)], S);
    const dflt = nextS === Rc ? S : pS;
    const nextR = pickIn(R[other(srvSide(k))], pk?.receiver, dflt);
    S = nextS; Rc = nextR;
  }
  return { s: S, r: Rc };
}

/** Is the game in play the last possible one? */
const deciding = (s: GameLike) => s.gamesToWin > 1 && s.gamesWon.home === s.gamesToWin - 1 && s.gamesWon.away === s.gamesToWin - 1;

/** SD-62 — who serves the NEXT point to whom (table tennis doubles), or null
 *  (singles, a pair without two players, or the match is over). */
export function ttDoublesTurn(s: GameLike & { opening?: Side }, rosters: Rosters, gamePts?: Side[]): DoublesTurn | null {
  if (!s?.doubles || s.ended) return null;
  const H = pairOf(rosters.home), A = pairOf(rosters.away);
  if (!H || !A) return null;
  const R = { home: H, away: A };
  const g = s.games?.length ?? 0;
  const start = ttGameStart(s, g, R);
  const n = s.current.home + s.current.away;
  // deciding game: the point index at which a pair first reached half the target
  let p5 = -1;
  if (deciding(s)) {
    const at = Math.floor(s.target / 2);
    const c = { home: 0, away: 0 };
    const pts = gamePoints(s, gamePts);
    for (let i = 0; i < pts.length; i++) {
      c[pts[i]] += 1;
      if (c[pts[i]] === at && c[other(pts[i])] < at) { p5 = i + 1; break; }
    }
  }
  const k = ttTurn(n, s.target);
  const swapTurn = p5 >= 0 && n >= p5 ? ttTurn(p5, s.target) : -1;
  let cur = { s: start.s, r: start.r };
  const sideOf = (id: string): Side => (H.includes(id) ? 'home' : 'away');
  for (let i = 0; i <= k; i++) {
    if (i > 0) cur = { s: cur.r, r: partnerIn(R[sideOf(cur.s)], cur.s) };
    if (i === swapTurn) cur = { s: cur.s, r: partnerIn(R[sideOf(cur.r)], cur.r) };
  }
  const serverSide = sideOf(cur.s);
  // consistency with the side rotation the rest of the app uses
  if (serverSide !== ttServer(s.current.home, s.current.away, g, s.opening ?? 'home', s.target)) return null;
  return { server: cur.s, receiver: cur.r, serverSide, ...(swapTurn >= 0 ? { switched: true } : {}) };
}

/** SD-62 — game ≥ 2: the receiver the rules give for a chosen first server. */
export function ttGameStartOrder(s: GameLike & { opening?: Side }, rosters: Rosters): { server: string; receiver: string } | null {
  const H = pairOf(rosters.home), A = pairOf(rosters.away);
  if (!s?.doubles || !H || !A) return null;
  const st = ttGameStart(s, s.games?.length ?? 0, { home: H, away: A });
  return { server: st.s, receiver: st.r };
}

// --------------------------------------------------------------- badminton --

/** SD-74 — who serves the next rally, from which court, to whom (badminton
 *  doubles), or null. `firstServer` = the side serving game 1; later games are
 *  opened by the previous game's winner (BWF Law 7.4). */
export function badmintonDoublesTurn(s: GameLike & { firstServer?: Side }, rosters: Rosters, gamePts?: Side[]): DoublesTurn | null {
  if (!s?.doubles || s.ended) return null;
  const H = pairOf(rosters.home), A = pairOf(rosters.away);
  if (!H || !A) return null;
  const R = { home: H, away: A };
  const g = s.games?.length ?? 0;
  // who opened this game: the first server (game 1), else the last game's winner
  let opener: Side = s.firstServer ?? 'home';
  if (g > 0) {
    const [h, a] = s.games[g - 1];
    opener = h > a ? 'home' : 'away';
  }
  const pick = s.dblOrder?.[g];
  const right: Record<Side, string> = {
    [opener]: pickIn(R[opener], pick?.server, R[opener][0]),
    [other(opener)]: pickIn(R[other(opener)], pick?.receiver, R[other(opener)][0]),
  } as Record<Side, string>;
  let srv: Side = opener;
  const pts = gamePoints(s, gamePts);
  if (pts.length === 0 && s.current.home + s.current.away > 0) return null;
  for (const w of pts) {
    if (w === srv) right[w] = partnerIn(R[w], right[w]); // server's side wins: they switch courts
    else srv = w; // service over: nobody moves
  }
  const court: 'right' | 'left' = s.current[srv] % 2 === 0 ? 'right' : 'left';
  const at = (side: Side) => (court === 'right' ? right[side] : partnerIn(R[side], right[side]));
  return { server: at(srv), receiver: at(other(srv)), serverSide: srv, court };
}
