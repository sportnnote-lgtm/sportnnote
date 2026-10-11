/**
 * SD-58 serve + rotation and SD-71 substitutions + libero (VB-05, VB-06).
 * PURE (no React Native) — the volleyball reducer delegates the three new
 * actions here, and the UI / stats read the derived tracker.
 *
 * New actions (all optional; an older log has none and replays identically —
 * REVIEW Decision 8). They are STATE STAMPS, not timeline events, so a
 * timeline correction (EDIT_LOG) keeps them:
 *   SET_SERVE     payload { side, set? }         first server of a set (the toss)
 *   SET_ROTATION  payload { team, players, set?, liberos? }
 *                 the starting rotation, positions I–VI in order (I = server),
 *                 plus up to 2 liberos (FIVB 19.1.1)
 *   SUB           side + payload { off, on, kind }  kind: 'regular' (counts
 *                 toward the 6 per set, FIVB 15.6) · 'exceptional' (injury,
 *                 FIVB 15.7 — not counted) · 'libero' (a libero replacement,
 *                 FIVB 19.3.2 — not a substitution)
 *                 Anchored to (set, rallies played in it) so a correction that
 *                 keeps the set keeps the sub.
 *
 * Derived (never stored): who serves each rally, the rotation (a side that
 * wins the serve back rotates one place clockwise — FIVB 7.6), the six on
 * court after the subs, regular subs used per set.
 *
 * First server per set (FIVB 7.1): the toss decides set 1 (and the decider —
 * a new toss); in the other sets the team that did not serve first in the
 * previous set serves first. An explicit SET_SERVE for a set always wins.
 */
import type { CourtPlayer, VolleyballState } from './engine.ts';
import type { ScoreAction } from '../types';

type Side = 'home' | 'away';
const flip = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const SCORED = new Set(['point', 'attack', 'block', 'ace', 'opperror', 'serveerror']);

export type SubKind = 'regular' | 'exceptional' | 'libero';
export interface VbSub {
  set: number;
  /** rallies already played in the set when the sub was made */
  at: number;
  side: Side;
  off: CourtPlayer;
  on: CourtPlayer;
  kind: SubKind;
}

/** Regular substitutions per team per set (FIVB 15.6). */
export const SUBS_PER_SET = 6;
/** Positions in rotation order — index 0 = I (the server). */
export const POSITIONS = ['I', 'II', 'III', 'IV', 'V', 'VI'];
/** Front-row positions (II, III, IV) — the libero may not play there (FIVB 19.3.1). */
export const FRONT_ROW = new Set([1, 2, 3]);

export const setNoOf = (s: VolleyballState) => s.setsWon.home + s.setsWon.away + 1;
const isDeciderSet = (s: VolleyballState, n: number) => s.setsToWin > 1 && n === s.setsToWin * 2 - 1;
const scoredIn = (s: VolleyballState, n: number) =>
  s.events.filter((e) => e.set === n && SCORED.has(e.kind ?? '') && (e.side === 'home' || e.side === 'away'));

const cleanPlayer = (p: unknown): CourtPlayer | null => {
  const x = p as { id?: unknown; name?: unknown } | null;
  return x && x.id ? { id: String(x.id), name: String(x.name ?? '') } : null;
};
const cleanList = (v: unknown): CourtPlayer[] | null =>
  Array.isArray(v) ? v.map(cleanPlayer).filter((p): p is CourtPlayer => !!p) : null;

/** The reducer branch for SET_SERVE / SET_ROTATION / SUB. null = not one of them. */
export function serveReducer(s: VolleyballState, a: ScoreAction): VolleyballState | null {
  if (a.type !== 'SET_SERVE' && a.type !== 'SET_ROTATION' && a.type !== 'SUB') return null;
  if (s.ended) return s;
  const cur = setNoOf(s);
  const setArg = Number(a.payload?.set);
  const set = Number.isInteger(setArg) && setArg >= 1 && setArg <= cur ? setArg : cur;
  if (a.type === 'SET_SERVE') {
    const side = (a.payload?.side ?? a.side) as Side;
    if (side !== 'home' && side !== 'away') return s;
    return { ...s, serve: { ...s.serve, [set]: side } };
  }
  if (a.type === 'SET_ROTATION') {
    const team = a.payload?.team as Side;
    const players = cleanList(a.payload?.players);
    if ((team !== 'home' && team !== 'away') || !players || !players.length) return s;
    const libs = cleanList(a.payload?.liberos);
    // stamped after rallies of the set were played = the court as it stands now
    const at = set === cur ? scoredIn(s, cur).length : 0;
    const prev = { ...s.rotation?.[set] };
    delete prev[`${team}At` as 'homeAt'];
    return {
      ...s,
      rotation: { ...s.rotation, [set]: { ...prev, [team]: players, ...(at > 0 ? { [`${team}At`]: at } : {}) } },
      ...(libs ? { liberos: { ...s.liberos, [team]: libs.slice(0, 2) } } : {}),
    };
  }
  // SUB
  const side = a.side;
  const off = cleanPlayer(a.payload?.off);
  const on = cleanPlayer(a.payload?.on);
  if ((side !== 'home' && side !== 'away') || !off || !on || off.id === on.id) return s;
  const k = a.payload?.kind;
  const kind: SubKind = k === 'exceptional' || k === 'libero' ? k : 'regular';
  const sub: VbSub = { set: cur, at: scoredIn(s, cur).length, side, off, on, kind };
  return { ...s, subs: [...(s.subs ?? []), sub] };
}

/** Is serve tracking on (a toss was recorded)? */
export const serveTracked = (s: VolleyballState) => !!s?.serve && Object.keys(s.serve).length > 0;

/** First server of set `n`: the explicit pick, else the other side from the
 *  previous set's first server (not in the decider — a new toss). */
export function firstServer(s: VolleyballState, n: number): Side | null {
  const x = s.serve?.[n];
  if (x === 'home' || x === 'away') return x;
  if (n <= 1 || isDeciderSet(s, n)) return null;
  const prev = firstServer(s, n - 1);
  return prev ? flip(prev) : null;
}

/** The starting rotation stamp for set `n` (the latest stamp at or before it),
 *  and the set it was stamped for. */
export function rotationFor(s: VolleyballState, n: number, side: Side): { players: CourtPlayer[]; from: number; at: number } | null {
  for (let k = n; k >= 1; k--) {
    const r = s.rotation?.[k]?.[side];
    if (r && r.length) return { players: r, from: k, at: k === n ? s.rotation?.[k]?.[`${side}At`] ?? 0 : 0 };
  }
  return null;
}

export const liberosOf = (s: VolleyballState, side: Side): CourtPlayer[] => s.liberos?.[side] ?? [];

export interface RallyServe { set: number; side: Side | null; serverId?: string; serverName?: string }

export interface SetCourt {
  n: number;
  start: { home: CourtPlayer[] | null; away: CourtPlayer[] | null };
  end: { home: CourtPlayer[] | null; away: CourtPlayer[] | null };
}

export interface VbTrack {
  /** one per scored point, in log order (aligned with pointInputs) */
  rallies: RallyServe[];
  /** the set in play */
  set: number;
  /** who serves the next rally (null = not known) */
  serving: Side | null;
  /** the next server (position I of the serving side), when the rotation is known */
  server: CourtPlayer | null;
  /** on court now, per side. `ordered` = positions I–VI (from a rotation stamp) */
  court: { home: CourtPlayer[] | null; away: CourtPlayer[] | null };
  ordered: { home: boolean; away: boolean };
  /** regular subs used in the set in play */
  subsUsed: { home: number; away: number };
  sets: SetCourt[];
}

const copy = (l: CourtPlayer[] | null) => (l ? l.map((p) => ({ ...p })) : null);

/**
 * Walk every set: apply the subs at their rally, name the server of each
 * rally, rotate on every side-out. `base` for a set = its rotation stamp,
 * else the court stamp (SD-29 `lineup`) — unordered.
 */
export function trackCourt(s: VolleyballState): VbTrack {
  const cur = setNoOf(s);
  const lastSet = s.ended ? Math.max(1, s.sets.length) : cur;
  const rallies: RallyServe[] = [];
  const sets: SetCourt[] = [];
  const tracked = serveTracked(s);
  let serving: Side | null = null;
  let court: VbTrack['court'] = { home: null, away: null };
  let ordered = { home: false, away: false };
  let used = { home: 0, away: 0 };
  // a rally index → its slot in `rallies` (log order across sets)
  const order = new Map<number, number>();
  {
    let i = 0;
    s.events.forEach((e, idx) => { if (SCORED.has(e.kind ?? '') && (e.side === 'home' || e.side === 'away')) order.set(idx, i++); });
  }
  const out: RallyServe[] = new Array(order.size);
  for (let n = 1; n <= lastSet; n++) {
    const c: VbTrack['court'] = { home: null, away: null };
    const ord = { home: false, away: false };
    // a stamp made mid-set takes over at its rally (`late`); before it, the
    // previous stamp or the court stamp
    const late: Partial<Record<Side, { at: number; players: CourtPlayer[] }>> = {};
    for (const side of ['home', 'away'] as const) {
      let r = rotationFor(s, n, side);
      if (r && r.at > 0) { late[side] = { at: r.at, players: r.players }; r = n > 1 ? rotationFor(s, n - 1, side) : null; }
      if (r) { c[side] = copy(r.players); ord[side] = true; } else if (s.lineup?.[side]?.length) c[side] = copy(s.lineup[side]!);
    }
    const start = { home: copy(c.home), away: copy(c.away) };
    const pts: number[] = [];
    s.events.forEach((e, idx) => { if (e.set === n && order.has(idx)) pts.push(idx); });
    const subs = (s.subs ?? []).filter((x) => x.set === n);
    let si = 0;
    let S: Side | null = tracked ? firstServer(s, n) : null;
    const apply = (x: VbSub) => {
      const l = c[x.side];
      if (!l) return;
      const i = l.findIndex((p) => p.id === x.off.id);
      if (i >= 0) {
        if (l.some((p) => p.id === x.on.id)) l.splice(i, 1); // already on: just leaves
        else l[i] = { ...x.on };
      } else if (!l.some((p) => p.id === x.on.id)) l.push({ ...x.on });
    };
    for (let i = 0; i <= pts.length; i++) {
      for (const side of ['home', 'away'] as const) {
        const l = late[side];
        if (l && (l.at === i || (i === pts.length && l.at > i))) { c[side] = copy(l.players); ord[side] = true; delete late[side]; }
      }
      while (si < subs.length && subs[si].at <= i) apply(subs[si++]);
      if (i === pts.length) break;
      const e = s.events[pts[i]];
      const W = e.side as Side;
      const srv = S && ord[S] ? c[S]?.[0] : undefined;
      out[order.get(pts[i])!] = { set: n, side: S, ...(srv ? { serverId: srv.id, serverName: srv.name } : {}) };
      // side-out: the team that wins the serve back rotates one place (FIVB 7.6.2)
      if (S && W !== S && ord[W] && c[W] && c[W]!.length > 1) c[W] = [...c[W]!.slice(1), c[W]![0]];
      S = W;
    }
    sets.push({ n, start, end: { home: copy(c.home), away: copy(c.away) } });
    if (n === lastSet) {
      serving = S;
      court = c;
      ordered = ord;
      used = {
        home: subs.filter((x) => x.side === 'home' && x.kind === 'regular').length,
        away: subs.filter((x) => x.side === 'away' && x.kind === 'regular').length,
      };
    }
  }
  for (let i = 0; i < out.length; i++) rallies.push(out[i] ?? { set: 0, side: null });
  const server = !s.ended && serving && ordered[serving] ? court[serving]?.[0] ?? null : null;
  return { rallies, set: cur, serving: s.ended ? null : serving, server, court, ordered, subsUsed: used, sets };
}

/** Who serves each rally (log order) — the SD-22 serve-stats adapter. */
export const rallyServers = (s: VolleyballState): RallyServe[] => trackCourt(s).rallies;

/* ------------------------------------------------------------ sub checks -- */

export interface SubCheck {
  kind: SubKind;
  /** what looks illegal (FIVB rule cited) — empty = fine */
  issues: string[];
  /** the 7th (or later) regular sub: offer it as an exceptional sub */
  overLimit: boolean;
  /** regular subs used before this one */
  used: number;
}

/**
 * Check a substitution against FIVB 15.6 / 19.3 before it's recorded. Never
 * blocks — the scorer confirms (the referee decides; an exceptional sub or a
 * sanction may make it legal).
 */
export function checkSub(s: VolleyballState, side: Side, off: CourtPlayer, on: CourtPlayer, want?: SubKind): SubCheck {
  const n = setNoOf(s);
  const subs = (s.subs ?? []).filter((x) => x.set === n && x.side === side);
  const regular = subs.filter((x) => x.kind === 'regular');
  const libs = new Set(liberosOf(s, side).map((p) => p.id));
  const t = trackCourt(s);
  const issues: string[] = [];
  const at = scoredIn(s, n).length;
  const nm = (p: CourtPlayer) => p.name || 'player';
  if (want === 'libero' || libs.has(on.id) || libs.has(off.id)) {
    // Libero replacement (FIVB 19.3.2): not a substitution, unlimited
    const court = t.court[side];
    const pos = court ? court.findIndex((p) => p.id === off.id) : -1;
    if (libs.has(on.id) && !libs.has(off.id) && t.ordered[side] && FRONT_ROW.has(pos)) {
      issues.push(`${nm(on)} would replace a front-row player — the libero replaces back-row players only (FIVB 19.3.2.1)`);
    }
    if (libs.has(off.id) && !libs.has(on.id)) {
      const lastIn = [...subs].reverse().find((x) => x.kind === 'libero' && x.on.id === off.id);
      if (lastIn && lastIn.off.id !== on.id) issues.push(`${nm(off)} can only be replaced by ${nm(lastIn.off)}, the player the libero replaced (FIVB 19.3.2.1)`);
    }
    const lastLib = [...subs].reverse().find((x) => x.kind === 'libero');
    if (lastLib && lastLib.at === at) issues.push('Two libero replacements need a completed rally between them (FIVB 19.3.2.3)');
    return { kind: 'libero', issues, overLimit: false, used: regular.length };
  }
  if (want === 'exceptional') return { kind: 'exceptional', issues, overLimit: false, used: regular.length };
  // the set's starting six (a rotation stamped mid-set stands in for it)
  const starters = new Set((t.sets.find((x) => x.n === n)?.start[side] ?? rotationFor(s, n, side)?.players ?? []).map((p) => p.id));
  const overLimit = regular.length >= SUBS_PER_SET;
  if (overLimit) issues.push(`This would be substitution ${regular.length + 1} — only ${SUBS_PER_SET} per set (FIVB 15.6)`);
  if (starters.has(off.id)) {
    if (regular.some((x) => x.off.id === off.id)) issues.push(`${nm(off)} has already left the court once this set (FIVB 15.6.1)`);
  } else {
    const came = regular.find((x) => x.on.id === off.id);
    if (came && came.off.id !== on.id) issues.push(`${nm(off)} can only be replaced by ${nm(came.off)}, the starter they replaced (FIVB 15.6.2)`);
  }
  if (starters.has(on.id)) {
    const left = regular.find((x) => x.off.id === on.id);
    if (left && left.on.id !== off.id) issues.push(`${nm(on)} can only come back for ${nm(left.on)}, who replaced them (FIVB 15.6.1)`);
    if (regular.some((x) => x.on.id === on.id)) issues.push(`${nm(on)} has already come back once this set (FIVB 15.6.1)`);
  } else if (regular.some((x) => x.on.id === on.id)) {
    issues.push(`${nm(on)} has already come on once this set (FIVB 15.6.2)`);
  }
  return { kind: 'regular', issues, overLimit, used: regular.length };
}

/** A libero standing where FIVB doesn't allow one (front row, or at I when
 *  the team serves — FIVB 19.3.1.2 / 19.3.1.3). Null = fine / not known. */
export function liberoCue(s: VolleyballState, side: Side, t: VbTrack = trackCourt(s)): string | null {
  const court = t.court[side];
  if (!court || !t.ordered[side]) return null;
  const libs = new Set(liberosOf(s, side).map((p) => p.id));
  if (!libs.size) return null;
  const i = court.findIndex((p) => libs.has(p.id));
  if (i < 0) return null;
  const who = court[i].name;
  const n = setNoOf(s);
  const lastIn = [...(s.subs ?? [])].reverse().find((x) => x.set === n && x.side === side && x.kind === 'libero' && x.on.id === court[i].id);
  const back = lastIn ? ` — bring ${lastIn.off.name} back` : '';
  if (FRONT_ROW.has(i)) return `Libero ${who} is in the front row (${POSITIONS[i]})${back}`;
  if (i === 0 && t.serving === side) return `Libero ${who} can't serve${back}`;
  return null;
}
