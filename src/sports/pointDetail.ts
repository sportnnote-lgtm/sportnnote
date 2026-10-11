/**
 * SD-107 — optional point detail for the racket sports: HOW a point was won
 * (winner by stroke, forced / unforced error, ace, service winner, service
 * fault, squash stroke / no-let decisions), plus tennis' 1st / 2nd serve.
 *
 * Capture (D8, off by default): the scorer still taps WHO won the point. With
 * "Point detail" on (`SET_DETAIL`, format key `pointDetail`), an optional row
 * under the controls describes the LAST point; each tap dispatches
 * `POINT_DETAIL` { pd, serve } which annotates that point event (no score
 * effect, replaces any earlier detail on it, `pd: null` clears it). Undo pops
 * the annotation like any other event. Old logs never contain either action,
 * so they replay identically (Decision 8).
 *
 * Credits (absolute, via statTotals — never live increments):
 *   winner / ace / service winner / stroke awarded → the point winner (the
 *   player on the point, else the side's only player in singles);
 *   forced / unforced error / service fault / no let / stroke conceded → the
 *   erring opponent (`pd.err`, else the other side's only player in singles).
 * A match that never tracked detail writes none of these keys ("not tracked",
 * never a false 0).
 *
 * PURE (no React Native): engines, statTotals, the panel and tests import it.
 */
import type { LiveEvent } from './liveEvents';

export type DetailSport = 'tennis' | 'badminton' | 'tabletennis' | 'squash' | 'padel' | 'pickleball';
type Side = 'home' | 'away';
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

/** How a point ended. */
export type How = 'winner' | 'fe' | 'ue' | 'ace' | 'sw' | 'sf' | 'stroke' | 'nolet';

/** The detail stored on a point event (`event.pd`) and its PointInput. */
export interface PointDetail {
  how: How;
  /** the stroke / error type (ids in STROKES) */
  stroke?: string;
  /** tennis: the point winner won it at the net */
  net?: true;
  /** the erring / conceding player (errors, service faults, no-lets) */
  err?: { playerId?: string; playerName?: string };
}

export interface HowDef {
  how: How;
  label: string;
  /** chip label */
  chip: string;
  /** who the point's credit goes to */
  credit: 'winner' | 'loser';
  /** only offered when the point winner served ('server') / received ('receiver') */
  serve?: 'server' | 'receiver';
  /** the stroke / error-type chips offered after it */
  strokes?: string[];
}

/** Stroke and error-type ids → labels (one map for every sport). */
export const STROKES: Record<string, { label: string; chip: string }> = {
  fh: { label: 'Forehand', chip: 'Forehand' },
  bh: { label: 'Backhand', chip: 'Backhand' },
  fhVolley: { label: 'Forehand volley', chip: 'FH volley' },
  bhVolley: { label: 'Backhand volley', chip: 'BH volley' },
  volley: { label: 'Volley', chip: 'Volley' },
  overhead: { label: 'Overhead', chip: 'Overhead' },
  smash: { label: 'Smash', chip: 'Smash' },
  x3: { label: 'Smash out (×3 / ×4)', chip: 'Smash out ×3/×4' },
  drop: { label: 'Drop shot', chip: 'Drop' },
  lob: { label: 'Lob', chip: 'Lob' },
  return: { label: 'Return', chip: 'Return' },
  netKill: { label: 'Net kill', chip: 'Net kill' },
  clear: { label: 'Clear', chip: 'Clear' },
  drive: { label: 'Drive', chip: 'Drive' },
  push: { label: 'Push / lift', chip: 'Push / lift' },
  loop: { label: 'Loop', chip: 'Loop' },
  flick: { label: 'Flick', chip: 'Flick' },
  boast: { label: 'Boast', chip: 'Boast' },
  nick: { label: 'Nick', chip: 'Nick' },
  bandeja: { label: 'Bandeja', chip: 'Bandeja' },
  vibora: { label: 'Víbora', chip: 'Víbora' },
  dink: { label: 'Dink', chip: 'Dink' },
  erne: { label: 'Erne', chip: 'Erne' },
  atp: { label: 'Around the post (ATP)', chip: 'ATP' },
  net: { label: 'Into the net', chip: 'Net' },
  out: { label: 'Out', chip: 'Out' },
  tin: { label: 'Tin', chip: 'Tin' },
  fault: { label: 'Fault (touch / double hit)', chip: 'Fault' },
  // SD-52 — pickleball (PB-05): non-volley-zone ("kitchen") fault, foot fault
  kitchen: { label: 'Kitchen (non-volley zone) fault', chip: 'Kitchen' },
  foot: { label: 'Foot fault', chip: 'Foot fault' },
};

const WINNER = (strokes: string[]): HowDef => ({ how: 'winner', label: 'Winner', chip: 'Winner', credit: 'winner', strokes });
const FE: HowDef = { how: 'fe', label: 'Forced error', chip: 'Forced error', credit: 'loser' };
const UE = (strokes: string[]): HowDef => ({ how: 'ue', label: 'Unforced error', chip: 'Unforced error', credit: 'loser', strokes });
const ACE: HowDef = { how: 'ace', label: 'Ace', chip: 'Ace', credit: 'winner', serve: 'server' };
const SW: HowDef = { how: 'sw', label: 'Service winner', chip: 'Service winner', credit: 'winner', serve: 'server' };
const SF: HowDef = { how: 'sf', label: 'Service fault', chip: 'Service fault', credit: 'loser', serve: 'receiver' };

/** Each sport's options, in chip order. Tennis aces and double faults keep
 *  their own one-tap buttons (SD-104), so they're not repeated here. */
export const DETAIL_HOWS: Record<DetailSport, HowDef[]> = {
  // ATP / WTA match-stat conventions
  tennis: [SW, WINNER(['fh', 'bh', 'fhVolley', 'bhVolley', 'overhead', 'drop', 'lob', 'return']), FE, UE(['fh', 'bh', 'volley', 'overhead'])],
  // BWF: smash / net kill / drop / clear / drive / push winners; errors into the net, out, faults
  badminton: [WINNER(['smash', 'netKill', 'drop', 'clear', 'drive', 'push']), FE, UE(['net', 'out', 'fault']), SF],
  tabletennis: [ACE, WINNER(['fh', 'bh', 'loop', 'flick', 'smash']), FE, UE(['net', 'out']), SF],
  // WSF: winners incl. the nick; referee decisions (SQ-03): stroke awarded, no let
  squash: [
    WINNER(['drive', 'drop', 'boast', 'volley', 'nick']), FE, UE(['tin', 'out']), SF,
    { how: 'stroke', label: 'Stroke awarded', chip: 'Stroke', credit: 'winner' },
    { how: 'nolet', label: 'No let', chip: 'No let', credit: 'loser' },
  ],
  padel: [ACE, SW, WINNER(['smash', 'x3', 'volley', 'bandeja', 'vibora', 'drop', 'lob']), FE, UE(['net', 'out'])],
  pickleball: [WINNER(['drive', 'dink', 'volley', 'overhead', 'erne', 'atp', 'lob']), FE, UE(['net', 'out', 'kitchen', 'foot']), SF],
};

export const isDetailSport = (s: string): s is DetailSport => s in DETAIL_HOWS;
/** Tennis only: the "At net" flag and the 1st / 2nd serve toggle. */
export const hasNetFlag = (s: DetailSport) => s === 'tennis';
export const hasServeDetail = (s: DetailSport) => s === 'tennis';

export const howDef = (sport: DetailSport, how: How): HowDef | undefined => DETAIL_HOWS[sport].find((h) => h.how === how);

// ---------------------------------------------------------------- keys --

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The stat key a how credits. */
export const HOW_KEY: Record<How, string> = {
  winner: 'winners', fe: 'forcedErrors', ue: 'unforcedErrors', ace: 'aces',
  sw: 'serviceWinners', sf: 'serviceFaults', stroke: 'strokesWon', nolet: 'noLets',
};
/** squash: a stroke awarded is also one conceded by the opponent */
export const STROKES_CONCEDED = 'strokesConceded';
export const NET_KEY = 'netPtsWon';
/** Winners / unforced errors by stroke: winnersFh, ueNet … */
export const strokeKey = (how: How, stroke: string): string | undefined =>
  how === 'winner' ? `winners${cap(stroke)}` : how === 'ue' ? `ue${cap(stroke)}` : undefined;

/** Every key the sport's detail writes on a tracked line, in display order. */
export function detailKeys(sport: DetailSport): string[] {
  const out: string[] = [];
  for (const h of DETAIL_HOWS[sport]) {
    out.push(HOW_KEY[h.how]);
    if (h.how === 'stroke') out.push(STROKES_CONCEDED);
    for (const st of h.strokes ?? []) out.push(strokeKey(h.how, st)!);
  }
  if (hasNetFlag(sport)) out.push(NET_KEY);
  return out;
}

/** 1st / 2nd serve keys (tennis, `serveDetail`): tracked service points,
 *  1st serves in, points won on the 1st serve, 2nd-serve points (incl.
 *  double faults) and won. The serving player's, like srvPts. */
export const SERVE_DETAIL_KEYS = ['srv1Pts', 'srv1In', 'srv1Won', 'srv2Pts', 'srv2Won'] as const;

// -------------------------------------------------------------- labels --

/** "Forehand winner", "Unforced error (net)", "Ace" — for the timeline. */
/** `names` = add the erring player's name (off where names may be masked). */
export function pdText(pd: PointDetail | undefined | null, names = true): string {
  if (!pd || !pd.how) return '';
  const st = pd.stroke ? STROKES[pd.stroke]?.label : undefined;
  let t: string;
  switch (pd.how) {
    case 'winner': t = st ? `${st} winner` : 'Winner'; break;
    case 'ue': t = st ? `Unforced error (${st.toLowerCase()})` : 'Unforced error'; break;
    case 'fe': t = 'Forced error'; break;
    case 'ace': t = 'Ace'; break;
    case 'sw': t = 'Service winner'; break;
    case 'sf': t = 'Service fault'; break;
    case 'stroke': t = 'Stroke awarded'; break;
    case 'nolet': t = 'No let'; break;
    default: t = '';
  }
  if (names && pd.err?.playerName && (pd.how === 'ue' || pd.how === 'fe' || pd.how === 'sf' || pd.how === 'nolet')) t += ` · ${pd.err.playerName}`;
  if (pd.net) t += ' · at net';
  return t;
}

// ------------------------------------------------------------- reducer --

/** Kinds a detail can describe: a scored point, a tennis ace, a side-out rally. */
const DESCRIBABLE = new Set(['point', 'ace', 'rally']);

const validPd = (v: unknown): PointDetail | null | undefined => {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.how !== 'string' || !(o.how in HOW_KEY)) return undefined;
  const err = o.err && typeof o.err === 'object' ? o.err as { playerId?: unknown; playerName?: unknown } : undefined;
  return {
    how: o.how as How,
    ...(typeof o.stroke === 'string' && o.stroke in STROKES ? { stroke: o.stroke } : {}),
    ...(o.net === true ? { net: true as const } : {}),
    ...(err && (typeof err.playerId === 'string' || typeof err.playerName === 'string') ? {
      err: { ...(typeof err.playerId === 'string' && err.playerId ? { playerId: err.playerId } : {}), ...(typeof err.playerName === 'string' && err.playerName ? { playerName: err.playerName } : {}) },
    } : {}),
  };
};

/**
 * `POINT_DETAIL` — annotate the LAST describable event (a point, an ace, a
 * side-out rally). payload.pd: a detail (replaces), null (clears), absent
 * (keeps). payload.serve: 1 / 2 (tennis 1st / 2nd serve; only on a point that
 * was served while serve tracking was on, i.e. already carries `serve`).
 * A double-fault point is fully described already — left alone.
 */
export function applyPointDetail(events: LiveEvent[], payload: Record<string, unknown> | undefined): LiveEvent[] | null {
  let i = events.length - 1;
  while (i >= 0 && !DESCRIBABLE.has(events[i].kind ?? '')) i--;
  if (i < 0) return null;
  const e = events[i];
  if (e.df) return null;
  const pd = validPd(payload?.pd);
  const sv = payload?.serve === 1 || payload?.serve === 2 ? payload.serve : undefined;
  if (pd === undefined && sv === undefined) return null;
  const next: LiveEvent = { ...e };
  if (pd === null) delete next.pd;
  else if (pd) next.pd = pd;
  if (sv && e.serve) next.serve = sv;
  const out = [...events];
  out[i] = next;
  return out;
}

/** `SET_DETAIL` — the scorer's capture settings (event mode: applies from the
 *  next point; earlier points keep what they had). Returns the flags patch. */
export function detailFlags(payload: Record<string, unknown> | undefined, cur: { pointDetail?: boolean; serveDetail?: boolean }): { pointDetail?: boolean; serveDetail?: boolean } | null {
  const out: { pointDetail?: boolean; serveDetail?: boolean } = {};
  if (typeof payload?.pointDetail === 'boolean' && payload.pointDetail !== !!cur.pointDetail) out.pointDetail = payload.pointDetail;
  if (typeof payload?.serveDetail === 'boolean' && payload.serveDetail !== !!cur.serveDetail) out.serveDetail = payload.serveDetail;
  return Object.keys(out).length ? out : null;
}

/** The flags `init` reads from a match format (absent unless switched on, so
 *  an old match's state is unchanged). */
export function initDetailFlags(config?: Record<string, unknown>): { pointDetail?: true; serveDetail?: true } {
  return { ...(config?.pointDetail === true ? { pointDetail: true as const } : {}), ...(config?.serveDetail === true ? { serveDetail: true as const } : {}) };
}

/** Did this match track point detail? (switched on, or any annotated point) */
export const detailTracked = (s: { pointDetail?: boolean; events?: LiveEvent[] } | null | undefined): boolean =>
  !!s && (s.pointDetail === true || (s.events ?? []).some((e) => !!e.pd));

/** Did this match track 1st / 2nd serves on any point? */
export const serveTracked = (s: { events?: LiveEvent[] } | null | undefined): boolean =>
  !!s && (s.events ?? []).some((e) => e.serve === 1 || e.serve === 2);

// ---------------------------------------------------------------- tally --

/** The side that WON a describable event. */
export const winnerSide = (e: LiveEvent): Side | undefined =>
  (e.kind === 'rally' ? e.wonBy : e.side) as Side | undefined;

/** Per-side counts of every detail key: winner-credit keys count for the
 *  side that hit them, error keys for the side that made them. `period`
 *  filters by the event's set / game. */
export function detailTally(sport: DetailSport, events: LiveEvent[] | undefined, period?: number): { home: Record<string, number>; away: Record<string, number>; points: number } {
  const keys = detailKeys(sport);
  const zero = () => Object.fromEntries(keys.map((k) => [k, 0])) as Record<string, number>;
  const out = { home: zero(), away: zero(), points: 0 };
  for (const e of events ?? []) {
    if (!e.pd || !DESCRIBABLE.has(e.kind ?? '')) continue;
    if (period !== undefined && (e.set ?? e.game) !== period) continue;
    const W = winnerSide(e);
    if (W !== 'home' && W !== 'away') continue;
    for (const [side, key] of creditsOf(sport, e.pd)) {
      const t = side === 'winner' ? W : opp(W);
      out[t][key] = (out[t][key] ?? 0) + 1;
    }
    out.points += 1;
  }
  return out;
}

/** The (who, key) credits one detail makes. */
export function creditsOf(sport: DetailSport, pd: PointDetail): Array<['winner' | 'loser', string]> {
  const def = howDef(sport, pd.how);
  if (!def) return [];
  const out: Array<['winner' | 'loser', string]> = [[def.credit, HOW_KEY[pd.how]]];
  if (pd.how === 'stroke') out.push(['loser', STROKES_CONCEDED]);
  const sk = pd.stroke && def.strokes?.includes(pd.stroke) ? strokeKey(pd.how, pd.stroke) : undefined;
  if (sk) out.push([def.credit, sk]);
  if (pd.net && hasNetFlag(sport) && def.credit === 'winner') out.push(['winner', NET_KEY]);
  return out;
}

/** Player credits for statTotals: per player id, the detail keys. `resolve`
 *  maps an event's player (id / name) to a line id, else the side's only
 *  player (singles). */
export function detailPlayerCredits(
  sport: DetailSport,
  events: LiveEvent[] | undefined,
  resolve: (side: Side, p?: { playerId?: string; playerName?: string }) => string | undefined,
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  const add = (id: string | undefined, key: string) => {
    if (!id) return;
    const m = out.get(id) ?? {};
    m[key] = (m[key] ?? 0) + 1;
    out.set(id, m);
  };
  for (const e of events ?? []) {
    if (!e.pd || !DESCRIBABLE.has(e.kind ?? '')) continue;
    const W = winnerSide(e);
    if (W !== 'home' && W !== 'away') continue;
    const winnerId = resolve(W, e.kind === 'rally' ? undefined : { playerId: e.playerId, playerName: e.playerName });
    const loserId = resolve(opp(W), e.pd.err);
    for (const [who, key] of creditsOf(sport, e.pd)) add(who === 'winner' ? winnerId : loserId, key);
  }
  return out;
}

// ----------------------------------------------------------- panel rows --

export interface DetailRow { key: string; label: string; home: string; away: string; hv: number; av: number }

const HOW_ROW_LABEL: Record<How, string> = {
  winner: 'Winners', fe: 'Forced errors', ue: 'Unforced errors', ace: 'Aces', sw: 'Service winners',
  sf: 'Service faults', stroke: 'Strokes awarded', nolet: 'No lets',
};

/** The match-stats panel rows for point detail (empty when nothing is
 *  annotated in scope). Winners and errors, the winners / UE ratio, then the
 *  strokes that occurred (by stroke rows only when non-zero). */
export function detailRows(sport: DetailSport, events: LiveEvent[] | undefined, period?: number): DetailRow[] {
  const t = detailTally(sport, events, period);
  if (!t.points) return [];
  const rows: DetailRow[] = [];
  const count = (key: string, label: string, always = false) => {
    const h = t.home[key] ?? 0, a = t.away[key] ?? 0;
    if (!always && h + a === 0) return;
    rows.push({ key, label, home: String(h), away: String(a), hv: h, av: a });
  };
  const hows = DETAIL_HOWS[sport];
  const main: How[] = ['winner', 'ue', 'fe'];
  for (const h of main) count(HOW_KEY[h], HOW_ROW_LABEL[h], true);
  const ratio = (x: Record<string, number>) => (x.unforcedErrors ? x.winners / x.unforcedErrors : x.winners ? Infinity : 0);
  const rt = (x: Record<string, number>) => (x.unforcedErrors ? (x.winners / x.unforcedErrors).toFixed(2) : x.winners ? `${x.winners}–0` : '–');
  const rh = ratio(t.home), ra = ratio(t.away);
  rows.push({ key: 'wue', label: 'Winners / UE', home: rt(t.home), away: rt(t.away), hv: Number.isFinite(rh) ? rh : 99, av: Number.isFinite(ra) ? ra : 99 });
  for (const d of hows) if (!main.includes(d.how)) count(HOW_KEY[d.how], HOW_ROW_LABEL[d.how]);
  if (hasNetFlag(sport)) count(NET_KEY, 'Net points won');
  for (const d of hows) {
    for (const st of d.strokes ?? []) {
      const lab = STROKES[st]?.label ?? st;
      count(strokeKey(d.how, st)!, d.how === 'winner' ? `${lab} winners` : `UE · ${lab.toLowerCase()}`);
    }
  }
  return rows;
}

/** SD-107 — the keys the box score shows (W, UE, FE). */
export const DETAIL_BOX_KEYS = ['winners', 'unforcedErrors', 'forcedErrors'] as const;
