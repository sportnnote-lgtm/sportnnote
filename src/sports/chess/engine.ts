/**
 * Chess engine — a result-only match: record who won (or a draw) and how. No
 * move-by-move scoring; the board is the players'. Scoring is the standard
 * 1 / ½ / 0, so Swiss and round-robin tables read like a crosstable.
 */
export type Side = 'home' | 'away';
export type ChessMethod =
  | 'checkmate' | 'resignation' | 'time' | 'agreement' | 'stalemate'
  | 'repetition' | 'fifty-move' | 'insufficient' | 'forfeit'
  // SD-117c — FIDE Laws: an illegal move (Art. 7.5.5 / A.4.2 — the 2nd one in
  // standard / rapid, the 1st in blitz loses); a flag fall when the opponent
  // can't mate (Art. 6.9 — a draw); fivefold repetition and the 75-move rule
  // (Art. 9.6 — automatic draws, no claim needed)
  | 'illegal-move' | 'time-insufficient' | 'fivefold' | 'seventy-five-move'
  // SD-67 — a dead position (Art. 5.2.2: no sequence of legal moves can mate —
  // a draw); an adjudicated game and the arbiter's decision (Art. 12.9 / a
  // penalty) — either a win or a draw; a double forfeit (neither player came:
  // 0-0, both lose — FIDE C.07 treats it as two unplayed losses)
  | 'dead-position' | 'adjudication' | 'arbiter' | 'double-forfeit';

export const DECISIVE: ChessMethod[] = ['checkmate', 'resignation', 'time', 'illegal-move', 'forfeit', 'adjudication', 'arbiter'];
export const DRAWN: ChessMethod[] = ['agreement', 'stalemate', 'repetition', 'fifty-move', 'insufficient', 'time-insufficient', 'fivefold', 'seventy-five-move', 'dead-position', 'adjudication', 'arbiter'];

export const METHOD_LABEL: Record<ChessMethod, string> = {
  checkmate: 'Checkmate', resignation: 'Resignation', time: 'On time', forfeit: 'Forfeit',
  agreement: 'Draw agreed', stalemate: 'Stalemate', repetition: 'Threefold repetition',
  'fifty-move': '50-move rule', insufficient: 'Insufficient material',
  'illegal-move': 'Illegal move', 'time-insufficient': 'Time out vs insufficient material',
  fivefold: 'Fivefold repetition', 'seventy-five-move': '75-move rule',
  'dead-position': 'Dead position', adjudication: 'Adjudicated', arbiter: 'Arbiter\'s decision',
  'double-forfeit': 'Double forfeit',
};

/** SD-67 — neither player turned up: 0-0, both lose by forfeit (no game). */
export const isDoubleForfeit = (m?: ChessMethod | null): boolean => m === 'double-forfeit';

/** SD-67 — the exact time control, FIDE style: "90+30" (base minutes +
 *  increment seconds per move), "15+10", "5+0"; '' when no base is set. */
export function exactTimeControl(baseMin?: unknown, incSec?: unknown): string {
  const b = Number(baseMin); const i = Number(incSec);
  if (!Number.isFinite(b) || b <= 0) return '';
  return `${Math.round(b)}+${Number.isFinite(i) && i > 0 ? Math.round(i) : 0}`;
}

/** SD-117c — a forfeit (no game played): the result counts in the table, but
 *  neither player is credited a game played (FIDE: forfeits are excluded from
 *  played-game stats). */
export const isForfeit = (m?: ChessMethod | null): boolean => m === 'forfeit';

/** SD-117c — clock time left, "1:05:30" / "4:07" / "0:42", from seconds. */
export function clockText(secs: number): string {
  const t = Math.max(0, Math.round(secs));
  const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** SD-117c — parse a typed clock reading to seconds: "4:07" (m:ss),
 *  "1:05:30" (h:mm:ss), "0:42", or a bare "12" / "12m" (minutes); null when it
 *  isn't one. */
export function parseClock(v: string): number | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  const mins = /^(\d+(?:\.\d+)?)\s*m(in)?$/.exec(t);
  if (mins) return Math.round(Number(mins[1]) * 60);
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  if (!t.includes(':')) return Number(t) * 60;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some((n) => n >= 60)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/* ── SD-121: knockout tie-breaks ─────────────────────────────────────────────
 * A knockout "match" must produce a winner (FIDE World Cup regulations): a
 * mini-match of N games at the event's time control, then — while level —
 * pairs of rapid games, then pairs of blitz games, then one Armageddon game
 * (Black has draw odds: a draw sends Black through; colours by the arbiter /
 * lot). The match holds every game; the bracket sees only the winner. */

/** How a knockout pairing is played: games in the main mini-match, then the
 *  number of rapid and blitz PAIRS before the Armageddon. */
export interface KoPlan { games: number; rapid: number; blitz: number }
export const DEFAULT_KO_PLAN: KoPlan = { games: 1, rapid: 1, blitz: 1 };
export type KoPhaseKind = 'main' | 'rapid' | 'blitz' | 'armageddon';
export interface KoPhase { kind: KoPhaseKind; games: number; /** 1-based pair number for rapid / blitz */ n?: number }
/** One game of a knockout match. */
export interface KoGame {
  phase: number;
  white: Side;
  winner: Side | 'draw';
  method?: ChessMethod;
  moves?: number;
  clock?: { white?: number; black?: number };
}
export interface KoState { plan: KoPlan; games: KoGame[] }

const clampInt = (v: unknown, lo: number, hi: number, dv: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dv;
};
/** A plan from the format / a payload (out-of-range values clamped). */
export function koPlanFrom(v: unknown): KoPlan {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    games: clampInt(o.games ?? o.koGames, 1, 12, DEFAULT_KO_PLAN.games),
    rapid: clampInt(o.rapid ?? o.koRapidPairs, 0, 4, DEFAULT_KO_PLAN.rapid),
    blitz: clampInt(o.blitz ?? o.koBlitzPairs, 0, 4, DEFAULT_KO_PLAN.blitz),
  };
}
/** The phases in order: main mini-match, rapid pairs, blitz pairs, Armageddon. */
export function koPhases(plan: KoPlan): KoPhase[] {
  return [
    { kind: 'main', games: plan.games },
    ...Array.from({ length: plan.rapid }, (_, i) => ({ kind: 'rapid' as const, games: 2, n: i + 1 })),
    ...Array.from({ length: plan.blitz }, (_, i) => ({ kind: 'blitz' as const, games: 2, n: i + 1 })),
    { kind: 'armageddon', games: 1 },
  ];
}
const gamePts = (g: KoGame, side: Side): number =>
  isDoubleForfeit(g.method) ? 0 : g.winner === 'draw' ? 0.5 : g.winner === side ? 1 : 0;
/** Points each side scored in one phase (or every game when `phase` is omitted). */
export function koPoints(ko: KoState, phase?: number): { home: number; away: number } {
  const gs = phase == null ? ko.games : ko.games.filter((g) => g.phase === phase);
  return gs.reduce((a, g) => ({ home: a.home + gamePts(g, 'home'), away: a.away + gamePts(g, 'away') }), { home: 0, away: 0 });
}
/** The winner of a phase once it can't be caught (lead > games left), or
 *  after its last game; Armageddon: a draw goes to Black. null = level / open. */
export function koPhaseWinner(ko: KoState, phase: number): Side | null {
  const ph = koPhases(ko.plan)[phase];
  if (!ph) return null;
  const gs = ko.games.filter((g) => g.phase === phase);
  if (ph.kind === 'armageddon') {
    const g = gs[0];
    if (!g) return null;
    if (g.winner !== 'draw') return g.winner;
    return isDoubleForfeit(g.method) ? null : g.white === 'home' ? 'away' : 'home';
  }
  const p = koPoints(ko, phase);
  const left = ph.games - gs.length;
  if (Math.abs(p.home - p.away) > left) return p.home > p.away ? 'home' : 'away';
  return null;
}
/** Where a knockout match stands: the phase now being played (its index and
 *  game number in it), and the winner once decided. */
export function koStatus(ko: KoState): { phase: number; game: number; winner: Side | null } {
  const phases = koPhases(ko.plan);
  for (let i = 0; i < phases.length; i++) {
    const w = koPhaseWinner(ko, i);
    if (w) return { phase: i, game: ko.games.filter((g) => g.phase === i).length, winner: w };
    const played = ko.games.filter((g) => g.phase === i).length;
    if (played < phases[i].games) return { phase: i, game: played + 1, winner: null };
  }
  // A drawn Armageddon after a double forfeit — nothing can decide it here.
  const last = phases.length - 1;
  return { phase: last, game: 1, winner: null };
}
export const KO_PHASE_LABEL: Record<KoPhaseKind, string> = {
  main: 'Match', rapid: 'Rapid tie-break', blitz: 'Blitz tie-break', armageddon: 'Armageddon',
};
/** "Rapid tie-break 1 · game 2", "Armageddon", "Match · game 1 of 2". */
export function koPhaseText(ko: KoState, phase: number, game: number): string {
  const ph = koPhases(ko.plan)[phase];
  if (!ph) return '';
  if (ph.kind === 'armageddon') return 'Armageddon (draw = Black goes through)';
  if (ph.kind === 'main') return ph.games > 1 ? `Mini-match · game ${game} of ${ph.games}` : 'Match game';
  return `${KO_PHASE_LABEL[ph.kind]}${(ph.kind === 'rapid' ? ko.plan.rapid : ko.plan.blitz) > 1 ? ` ${ph.n}` : ''} · game ${game} of 2`;
}

export interface ChessState {
  /** which side has the white pieces */
  white: Side;
  /** time control label for reference, e.g. 'rapid' (from the format) */
  timeControl: string;
  /** SD-67 — the exact time control "90+30" from the format (`tcBase`
   *  minutes + `tcInc` seconds). Absent on older games / when not set. */
  tcExact?: string;
  winner?: Side | 'draw';
  method?: ChessMethod;
  /** optional move count, for the record */
  moves?: number;
  /** SD-117c — optional clock time left at the end, in seconds, by colour
   *  (RESULT payload `clock`). Absent on older games. */
  clock?: { white?: number; black?: number };
  ended: boolean;
  seq: number;
  /** SD-121 — the organiser's knockout plan (format `koGames` / `koRapidPairs`
   *  / `koBlitzPairs`); only set when the format carries one. */
  koPlan?: KoPlan;
  /** SD-121 — a knockout match: every game so far (set by the first RESULT
   *  that carries `ko` — a new payload key, so no older log has it). While it
   *  is undecided the top-level winner / method are empty; once decided,
   *  `winner` is the side that goes through. */
  ko?: KoState;
}

/** `config.white` (SD-26) is the fixture's colour from the Swiss pairing;
 *  absent (every older fixture) = home has White, as before. The scorer can
 *  still switch it with SET_WHITE before the result. */
export function init(config?: Record<string, unknown>): ChessState {
  const white: Side = config?.white === 'away' ? 'away' : 'home';
  // SD-67 — only when the organiser set one (old fixtures' state is unchanged)
  const tcExact = exactTimeControl(config?.tcBase, config?.tcInc);
  // SD-121 — only when the format has a knockout plan (older fixtures unchanged)
  const hasKo = config && ['koGames', 'koRapidPairs', 'koBlitzPairs'].some((k) => config[k] != null);
  return { white, timeControl: String(config?.timeControl ?? 'rapid'), ...(tcExact ? { tcExact } : {}), ended: false, seq: 0,
    ...(hasKo ? { koPlan: koPlanFrom(config) } : {}) };
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
    // SD-67: a double forfeit is recorded as winner 'draw' (no winner) with
    // this method only — a new value, so no older log carries it.
    if (method && !(winner === 'draw' && method === 'double-forfeit') && (winner === 'draw' ? !DRAWN.includes(method) : !DECISIVE.includes(method))) return s;
    const moves = typeof a.payload?.moves === 'number' && a.payload.moves > 0 ? Math.round(a.payload.moves as number) : undefined;
    // SD-117c — optional clock times left (a new optional key: old logs carry none)
    const c = a.payload?.clock as { white?: unknown; black?: unknown } | undefined;
    const secs = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);
    const clock = c && typeof c === 'object' ? { ...(secs(c.white) != null ? { white: secs(c.white) } : {}), ...(secs(c.black) != null ? { black: secs(c.black) } : {}) } : undefined;
    // SD-121 — a knockout match: this result is ONE game of it.
    const ko: KoState | undefined = s.ko ?? (a.payload?.ko ? { plan: koPlanFrom(a.payload.ko), games: [] } : undefined);
    if (ko) {
      const at = koStatus(ko);
      const game: KoGame = { phase: at.phase, white: s.white, winner, ...(method ? { method } : {}), ...(moves ? { moves } : {}), ...(clock && Object.keys(clock).length ? { clock } : {}) };
      const next: KoState = { ...ko, games: [...ko.games, game] };
      const st = koStatus(next);
      if (st.winner) {
        return { ...s, ko: next, winner: st.winner, method, moves, ...(clock && Object.keys(clock).length ? { clock } : {}), ended: true, seq: s.seq + 1 };
      }
      // Undecided: the next game. Colours alternate (the arbiter can still
      // switch them with SET_WHITE — e.g. the Armageddon draw of lots).
      const { winner: _w, method: _m, moves: _mv, clock: _c, ...rest } = s;
      return { ...rest, ko: next, white: s.white === 'home' ? 'away' : 'home', seq: s.seq + 1 };
    }
    return { ...s, winner, method, moves, ...(clock && Object.keys(clock).length ? { clock } : {}), ended: true, seq: s.seq + 1 };
  }
  return s;
}

/** Game points: 1 / ½ / 0. */
export function points(s: ChessState): { home: number; away: number } {
  // SD-121 — a knockout match: every game's points (live too)
  if (s.ko) return koPoints(s.ko);
  if (!s.ended || !s.winner) return { home: 0, away: 0 };
  if (isDoubleForfeit(s.method)) return { home: 0, away: 0 };
  if (s.winner === 'draw') return { home: 0.5, away: 0.5 };
  return s.winner === 'home' ? { home: 1, away: 0 } : { home: 0, away: 1 };
}

/** "1-0", "0-1" or "½-½" (the chess way of writing a result). */
export function resultString(s: ChessState): string {
  // SD-121 — a knockout match reads home-first over all its games: "2½-1½"
  if (s.ko && (s.ko.games.length > 1 || !s.ended)) {
    if (!s.ko.games.length) return '–';
    const p = koPoints(s.ko);
    const h = (n: number) => String(n).replace('.5', '½').replace(/^0½$/, '½');
    return `${h(p.home)}-${h(p.away)}`;
  }
  if (!s.ended || !s.winner) return '–';
  if (isDoubleForfeit(s.method)) return '0-0';
  if (s.winner === 'draw') return '½-½';
  // Written white-first.
  const whiteWon = s.winner === s.white;
  return whiteWon ? '1-0' : '0-1';
}

/** SD-116 — the arbiter's result written White-first for a pending result:
 *  "1-0", "½-½" or "0-1" for `winner` when `white` has the white pieces. */
export function scoreFor(white: Side, winner: Side | 'draw', method?: ChessMethod | null): '1-0' | '½-½' | '0-1' | '0-0' {
  if (winner === 'draw' && isDoubleForfeit(method)) return '0-0';
  if (winner === 'draw') return '½-½';
  return winner === white ? '1-0' : '0-1';
}

/** SD-116 — the one-line result the confirm sheet asks about:
 *  "1-0: Anand beat Carlsen by Resignation", "½-½: Anand drew with Carlsen (Stalemate)".
 *  Names are White first (whiteName has the white pieces). */
export function resultSentence(white: Side, winner: Side | 'draw', whiteName: string, blackName: string, method?: ChessMethod): string {
  const sc = scoreFor(white, winner, method);
  if (winner === 'draw' && isDoubleForfeit(method)) return `0-0: double forfeit — neither ${whiteName} nor ${blackName} played (both lose)`;
  if (winner === 'draw') return `${sc}: ${whiteName} drew with ${blackName}${method ? ` (${METHOD_LABEL[method]})` : ''}`;
  const [w, l] = winner === white ? [whiteName, blackName] : [blackName, whiteName];
  const how = method ? (method === 'time' ? ' on time' : method === 'forfeit' ? ' by forfeit' : method === 'illegal-move' ? ' (illegal move)' : method === 'adjudication' ? ' (adjudicated)' : method === 'arbiter' ? ' (arbiter\'s decision)' : ` by ${METHOD_LABEL[method]}`) : '';
  return `${sc}: ${w} beat ${l}${how}`;
}
