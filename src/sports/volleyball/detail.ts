/**
 * SD-81 (VB-07 / VB-08) — volleyball's optional "Detailed stats" capture
 * mode: attack attempts per attacker (kill / error / blocked / in play) and,
 * optionally, reception quality. PURE (no React Native).
 *
 * Off by default (like the racket "Point detail", SD-107): one tap per point
 * stays the default. Turned on (`SET_DETAIL {detail}`) it applies from the
 * next point; earlier points keep what they had.
 *
 * What an attack attempt is (NCAA "hitting percentage" / FIVB VIS "attack
 * efficiency" — both count every attack swing):
 *   kill     an Attack point                          (already logged: ATTACK)
 *   error    the attacker hit out / into the net      (an "Opp. fault" typed
 *            "Attack out" that names the attacker — SD-117b)
 *   blocked  stuffed by a block for a point          (a Block point + "Who was
 *            blocked?" — VB_DETAIL kind 'blocked')
 *   in play  dug / kept alive, rally goes on         (VB_DETAIL kind 'inplay')
 * Attempts = kills + errors + blocked + in play.
 * Attack efficiency = (kills − errors − blocked) ÷ attempts (NCAA counts a
 * blocked attack as an attack error; FIVB VIS lists "blocked" separately and
 * subtracts both). Attack success % (FIVB Best Attacker) = kills ÷ attempts.
 *
 * Reception (optional within the mode): the receiver and a grade —
 * 'perfect' (#, setter can run any play), 'good' (+, positive), 'poor' (−)
 * (VB_DETAIL kind 'reception'). A reception error is the opponent's ace, so
 * it isn't graded here.
 *
 * Storage (REVIEW Decision 8): new optional state keys only — `detail` (the
 * on/off switches, anchored to set + rallies played) and `vd` (the detail
 * entries, anchored the same way as SD-71 subs). They are STATE STAMPS, not
 * timeline events, so a timeline correction (EDIT_LOG) keeps them and an old
 * log (neither key) replays to exactly its old state.
 */
import type { LiveEvent } from '../liveEvents';
import type { ScoreAction } from '../types';
import type { VolleyballState } from './engine.ts';

type Side = 'home' | 'away';
const SCORED = new Set(['point', 'attack', 'block', 'ace', 'opperror', 'serveerror']);

/** A detail switch: from `at` rallies into `set`, detail is `on`. */
export interface VbDetailToggle { set: number; at: number; on: boolean }

export type VbDetailKind = 'inplay' | 'blocked' | 'reception';
export type ReceptionGrade = 'perfect' | 'good' | 'poor';

/** One detail entry (an attack kept in play, an attacker blocked, a reception). */
export interface VbDetailEntry {
  kind: VbDetailKind;
  /** the PLAYER's side (the attacker / the receiver) */
  side: Side;
  set: number;
  /** rallies already played in the set when it was logged ('blocked': the
   *  block point is rally `at` — logged right after it) */
  at: number;
  playerId?: string;
  playerName: string;
  /** reception grade */
  q?: ReceptionGrade;
}

export const RECEPTION_GRADES: Array<{ key: ReceptionGrade; label: string; sign: string }> = [
  { key: 'perfect', label: 'Perfect', sign: '#' },
  { key: 'good', label: 'Good', sign: '+' },
  { key: 'poor', label: 'Poor', sign: '−' },
];

const setNo = (s: VolleyballState) => s.setsWon.home + s.setsWon.away + 1;
const scoredIn = (s: VolleyballState, n: number) =>
  (s.events ?? []).filter((e) => e.set === n && SCORED.has(e.kind ?? '') && (e.side === 'home' || e.side === 'away')).length;

/** Is detail capture on right now (for the next point)? */
export const detailOn = (s: VolleyballState | null | undefined): boolean => {
  const t = s?.detail;
  return !!t && t.length > 0 && t[t.length - 1].on;
};

/** Did this match ever capture detail? (the keyed stats are written then) */
export const detailTracked = (s: VolleyballState | null | undefined): boolean =>
  !!s && ((s.detail ?? []).some((t) => t.on) || (s.vd ?? []).length > 0);

/** Was rally `idx` (0-based) of set `set` played with detail on? */
export function coveredAt(s: VolleyballState, set: number, idx: number): boolean {
  let on = false;
  for (const t of s.detail ?? []) {
    if (t.set < set || (t.set === set && t.at <= idx)) on = t.on;
  }
  return on;
}

/** The format key a new match may start with detail on (`detail: true`). */
export function initDetail(config?: Record<string, unknown>): Pick<VolleyballState, 'detail'> {
  return config?.detail === true ? { detail: [{ set: 1, at: 0, on: true }] } : {};
}

/** SET_DETAIL / VB_DETAIL — null when the action isn't one of them. */
export function detailReducer(s: VolleyballState, a: ScoreAction): VolleyballState | null {
  if (a.type === 'SET_DETAIL') {
    const want = a.payload?.detail;
    if (typeof want !== 'boolean' || s.ended || want === detailOn(s)) return s;
    const n = setNo(s);
    return { ...s, detail: [...(s.detail ?? []), { set: n, at: scoredIn(s, n), on: want }] };
  }
  if (a.type !== 'VB_DETAIL') return null;
  const kind = a.payload?.kind as VbDetailKind;
  const side = a.side;
  // the player rides in the payload (not an attribution: no live stat credit —
  // the keys are set absolutely by statTotals at completion)
  const who = a.payload?.player as { playerId?: string; playerName?: string } | undefined;
  if (s.ended && kind !== 'blocked') return s;
  if ((side !== 'home' && side !== 'away') || !who?.playerName || !['inplay', 'blocked', 'reception'].includes(kind)) return s;
  const q = a.payload?.q as ReceptionGrade | undefined;
  if (kind === 'reception' && !RECEPTION_GRADES.some((g) => g.key === q)) return s;
  // a blocked attacker annotates the last Block point (the set it was in)
  const n = kind === 'blocked' ? lastBlock(s)?.set ?? setNo(s) : setNo(s);
  const at = kind === 'blocked' ? lastBlock(s)?.at ?? scoredIn(s, n) : scoredIn(s, n);
  // one "blocked" per block point: a second tap replaces it
  const rest = (s.vd ?? []).filter((x) => !(kind === 'blocked' && x.kind === 'blocked' && x.set === n && x.at === at));
  const entry: VbDetailEntry = {
    kind, side, set: n, at, playerName: who.playerName,
    ...(who.playerId ? { playerId: who.playerId } : {}), ...(kind === 'reception' ? { q } : {}),
  };
  return { ...s, vd: [...rest, entry] };
}

/** The last scored point, when it was a Block — its set and rally number
 *  (1-based: the count of rallies up to and including it). */
export function lastBlock(s: VolleyballState): { set: number; at: number; side: Side; e: LiveEvent } | null {
  const ev = s.events ?? [];
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    if (!SCORED.has(e.kind ?? '')) continue;
    if (e.kind !== 'block' || (e.side !== 'home' && e.side !== 'away')) return null;
    const set = e.set ?? 1;
    const at = ev.slice(0, i + 1).filter((x) => x.set === set && SCORED.has(x.kind ?? '')).length;
    return { set, at, side: e.side, e };
  }
  return null;
}

/** The blocked attacker already named for the last Block point, if any. */
export function blockedFor(s: VolleyballState, b: { set: number; at: number }): VbDetailEntry | undefined {
  return (s.vd ?? []).find((x) => x.kind === 'blocked' && x.set === b.set && x.at === b.at);
}

/* ------------------------------------------------------------ tally -- */

export interface VbAttackLine {
  side: Side;
  name: string;
  playerId?: string;
  attackAttempts: number;
  attackKills: number;
  attackErrors: number;
  attacksBlocked: number;
  receptions: number;
  receptionsPerfect: number;
  receptionsPositive: number;
}

export const VB_ATTACK_KEYS = ['attackAttempts', 'attackKills', 'attackErrors', 'attacksBlocked'] as const;
export const VB_RECEPTION_KEYS = ['receptions', 'receptionsPerfect', 'receptionsPositive'] as const;

/** Did the match grade any reception? (the reception keys are written then) */
export const receptionTracked = (s: VolleyballState | null | undefined): boolean =>
  !!s && (s.vd ?? []).some((x) => x.kind === 'reception');

/**
 * Per player ("side|name"), for the whole match or one set: attack attempts
 * by result and receptions by grade — only rallies played with detail on
 * count kills and attack errors (an Attack point before the switch was
 * turned on isn't an attempt we saw the rest of).
 */
export function detailTally(s: VolleyballState, scope: 'all' | number = 'all'): Map<string, VbAttackLine> {
  const out = new Map<string, VbAttackLine>();
  if (!s) return out;
  const line = (side: Side, name: string, playerId?: string): VbAttackLine => {
    const k = `${side}|${name}`;
    let l = out.get(k);
    if (!l) {
      l = { side, name, attackAttempts: 0, attackKills: 0, attackErrors: 0, attacksBlocked: 0, receptions: 0, receptionsPerfect: 0, receptionsPositive: 0 };
      out.set(k, l);
    }
    if (playerId && !l.playerId) l.playerId = playerId;
    return l;
  };
  const count = new Map<number, number>();
  for (const e of s.events ?? []) {
    if (!SCORED.has(e.kind ?? '') || (e.side !== 'home' && e.side !== 'away')) continue;
    const set = e.set ?? 1;
    const idx = count.get(set) ?? 0;
    count.set(set, idx + 1);
    if (scope !== 'all' && set !== scope) continue;
    if (!coveredAt(s, set, idx)) continue;
    if (e.kind === 'attack' && e.playerName) {
      const l = line(e.side, e.playerName, e.playerId);
      l.attackKills += 1; l.attackAttempts += 1;
    } else if (e.kind === 'opperror' && e.oe?.type === 'attackout' && e.oe.playerName) {
      const l = line(e.side === 'home' ? 'away' : 'home', e.oe.playerName, e.oe.playerId);
      l.attackErrors += 1; l.attackAttempts += 1;
    }
  }
  for (const x of s.vd ?? []) {
    if (scope !== 'all' && x.set !== scope) continue;
    const l = line(x.side, x.playerName, x.playerId);
    if (x.kind === 'inplay') l.attackAttempts += 1;
    else if (x.kind === 'blocked') { l.attacksBlocked += 1; l.attackAttempts += 1; }
    else if (x.kind === 'reception') {
      l.receptions += 1;
      if (x.q === 'perfect') l.receptionsPerfect += 1;
      if (x.q === 'perfect' || x.q === 'good') l.receptionsPositive += 1;
    }
  }
  return out;
}

/** Attack efficiency (kills − errors − blocked) ÷ attempts, or null. */
export const attackEfficiency = (l: Pick<VbAttackLine, 'attackAttempts' | 'attackKills' | 'attackErrors' | 'attacksBlocked'>): number | null =>
  l.attackAttempts > 0 ? (l.attackKills - l.attackErrors - l.attacksBlocked) / l.attackAttempts : null;
