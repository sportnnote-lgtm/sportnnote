/**
 * SD-134 — Swiss field management (pure, RN-free): withdrawals, absences,
 * requested byes and late entries, saved on the tournament's sport format as
 * one JSON string (`formats[sport].swissOps`) — zero migration, and an event
 * without the key reads exactly as before.
 *
 * FIDE practice (C.04.1 / C.07 16):
 *  • a WITHDRAWN player is not paired from the round they leave; each round
 *    they miss is an unplayed zero (C.07 treats it as an absence — and if
 *    nothing but unplayed rounds follow, as a draw in their past opponents'
 *    Buchholz: C.07 16.2.5, already in swissTiebreaks.ts);
 *  • an ABSENT player (one round) is not paired that round — 0 points;
 *  • a REQUESTED BYE is a round off asked for in advance — the organiser
 *    gives ½ (a half-point bye, the usual open-event offer, with a limit per
 *    player) or 0;
 *  • a LATE ENTRY joins from round N; the rounds missed score 0 or ½ each
 *    (the organiser's call — many opens give ½ for round 1 only; here one
 *    value for every missed round).
 * None of these is a pairing-allocated bye (C.04.1 d): a player who had one
 * can still be given the PAB later.
 */

export interface SwissLateEntry {
  /** first round they are paired in (≥ 2) */
  round: number;
  /** points for each round missed: 0 or ½ (the organiser's choice) */
  missed: 0 | 0.5;
  /** name, so the table shows them before their first game */
  name?: string;
}

export interface SwissOps {
  v: 1;
  /** entrant id → first round NOT paired (withdrawn from that round on) */
  withdrawn?: Record<string, number>;
  /** entrant id → rounds absent (not paired, 0 points) */
  absent?: Record<string, number[]>;
  /** entrant id → round → points for a requested bye (½ or 0) */
  byes?: Record<string, Record<string, number>>;
  /** entrant id → late entry */
  late?: Record<string, SwissLateEntry>;
  /** most requested ½-point byes per player (default 2 — organiser option) */
  hpbLimit?: number;
}

/** Default limit of requested half-point byes per player (organiser option;
 *  common open-event rule — not a FIDE number). */
export const DEFAULT_HPB_LIMIT = 2;

export const SWISS_OPS_KEY = 'swissOps';

export const emptySwissOps = (): SwissOps => ({ v: 1 });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const posInt = (v: unknown): number | undefined => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : undefined;
};

/** Read the ops from a sport format (`formats[sport].swissOps`); a missing or
 *  broken value is an empty set (never throws). */
export function swissOpsOf(fmt?: Record<string, unknown> | null): SwissOps {
  const raw = fmt?.[SWISS_OPS_KEY];
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } }
  if (!isObj(o)) return emptySwissOps();
  const out: SwissOps = { v: 1 };
  if (isObj(o.withdrawn)) {
    const w: Record<string, number> = {};
    for (const [id, r] of Object.entries(o.withdrawn)) { const n = posInt(r); if (n) w[id] = n; }
    if (Object.keys(w).length) out.withdrawn = w;
  }
  if (isObj(o.absent)) {
    const a: Record<string, number[]> = {};
    for (const [id, rs] of Object.entries(o.absent)) {
      const list = Array.isArray(rs) ? [...new Set(rs.map(posInt).filter((n): n is number => !!n))].sort((x, y) => x - y) : [];
      if (list.length) a[id] = list;
    }
    if (Object.keys(a).length) out.absent = a;
  }
  if (isObj(o.byes)) {
    const b: Record<string, Record<string, number>> = {};
    for (const [id, rs] of Object.entries(o.byes)) {
      if (!isObj(rs)) continue;
      const one: Record<string, number> = {};
      for (const [r, p] of Object.entries(rs)) { const n = posInt(r); if (n && (p === 0 || p === 0.5 || p === 1)) one[String(n)] = p; }
      if (Object.keys(one).length) b[id] = one;
    }
    if (Object.keys(b).length) out.byes = b;
  }
  if (isObj(o.late)) {
    const l: Record<string, SwissLateEntry> = {};
    for (const [id, e] of Object.entries(o.late)) {
      if (!isObj(e)) continue;
      const round = posInt(e.round);
      if (!round || round < 2) continue;
      l[id] = { round, missed: e.missed === 0.5 ? 0.5 : 0, ...(typeof e.name === 'string' && e.name ? { name: e.name } : {}) };
    }
    if (Object.keys(l).length) out.late = l;
  }
  const lim = Number(o.hpbLimit);
  if (Number.isFinite(lim) && lim >= 0 && lim <= 20) out.hpbLimit = Math.floor(lim);
  return out;
}

/** The format patch that saves `ops` (the JSON string). */
export const swissOpsPatch = (ops: SwissOps): Record<string, string> => ({ [SWISS_OPS_KEY]: JSON.stringify(ops) });

/** Is the ops set empty (nothing to show / store)? */
export const swissOpsEmpty = (o: SwissOps): boolean => !o.withdrawn && !o.absent && !o.byes && !o.late && o.hpbLimit === undefined;

/* ------------------------------- queries -------------------------------- */

export const hpbLimitOf = (o: SwissOps): number => o.hpbLimit ?? DEFAULT_HPB_LIMIT;

/** Requested half-point byes a player has (any round). */
export const halfByesOf = (o: SwissOps, id: string): number =>
  Object.values(o.byes?.[id] ?? {}).filter((p) => p === 0.5).length;

/** Why `id` is not paired in `round` — or null when they are available. */
export function unavailableIn(o: SwissOps, id: string, round: number): 'withdrawn' | 'absent' | 'bye' | 'late' | null {
  const w = o.withdrawn?.[id];
  if (w !== undefined && round >= w) return 'withdrawn';
  if (o.late?.[id] && round < o.late[id].round) return 'late';
  if (o.byes?.[id]?.[String(round)] !== undefined) return 'bye';
  if (o.absent?.[id]?.includes(round)) return 'absent';
  return null;
}

/** The entrants to pair in `round`: everyone available. Late entrants whose
 *  first round has come are added by the caller's field (see swissField). */
export function pairableIds(ids: string[], o: SwissOps, round: number): string[] {
  return ids.filter((id) => unavailableIn(o, id, round) === null);
}

/** One unplayed round that scores (a requested bye or a late entry's missed
 *  round). `kind`: 'hpb' (½), 'zpb' (0) — FIDE C.07 names; a 1-point
 *  requested bye (rare; organiser's own rule) is written 'hpb' with 1. */
export interface SwissExtraRound { id: string; round: number; points: number; kind: 'hpb' | 'zpb'; name?: string }

/** Every scored unplayed round the ops give: requested byes, and each missed
 *  round of a late entry (0 or ½). The standings add the ones whose round has
 *  been drawn. */
export function swissExtraRounds(o: SwissOps): SwissExtraRound[] {
  const out: SwissExtraRound[] = [];
  for (const [id, rs] of Object.entries(o.byes ?? {})) {
    for (const [r, p] of Object.entries(rs)) out.push({ id, round: Number(r), points: p, kind: p > 0 ? 'hpb' : 'zpb' });
  }
  for (const [id, e] of Object.entries(o.late ?? {})) {
    for (let r = 1; r < e.round; r++) {
      if (o.byes?.[id]?.[String(r)] !== undefined) continue;
      out.push({ id, round: r, points: e.missed, kind: e.missed > 0 ? 'hpb' : 'zpb', ...(e.name ? { name: e.name } : {}) });
    }
  }
  return out.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
}

/* ------------------------------- edits ---------------------------------- */
// Each returns a NEW ops object (callers save it with swissOpsPatch).

const clone = (o: SwissOps): SwissOps => JSON.parse(JSON.stringify(o)) as SwissOps;
const tidy = (o: SwissOps): SwissOps => {
  for (const k of ['withdrawn', 'absent', 'byes', 'late'] as const) if (o[k] && !Object.keys(o[k]!).length) delete o[k];
  return o;
};

/** Withdraw `id` from `round` on (not paired again). */
export function withdraw(o: SwissOps, id: string, round: number): SwissOps {
  const n = clone(o);
  n.withdrawn = { ...(n.withdrawn ?? {}), [id]: Math.max(1, Math.floor(round)) };
  // later absences / byes are moot
  if (n.absent?.[id]) { n.absent[id] = n.absent[id].filter((r) => r < round); if (!n.absent[id].length) delete n.absent[id]; }
  if (n.byes?.[id]) { for (const r of Object.keys(n.byes[id])) if (Number(r) >= round) delete n.byes[id][r]; if (!Object.keys(n.byes[id]).length) delete n.byes[id]; }
  return tidy(n);
}

/** Bring a withdrawn player back (paired again from the next round drawn). */
export function reinstate(o: SwissOps, id: string): SwissOps {
  const n = clone(o);
  if (n.withdrawn) delete n.withdrawn[id];
  return tidy(n);
}

/** Mark `id` absent for `round` (on = true) or clear it. */
export function setAbsent(o: SwissOps, id: string, round: number, on: boolean): SwissOps {
  const n = clone(o);
  const cur = new Set(n.absent?.[id] ?? []);
  if (on) cur.add(round); else cur.delete(round);
  n.absent = { ...(n.absent ?? {}) };
  if (cur.size) n.absent[id] = [...cur].sort((a, b) => a - b); else delete n.absent[id];
  if (on && n.byes?.[id]) { delete n.byes[id][String(round)]; if (!Object.keys(n.byes[id]).length) delete n.byes[id]; }
  return tidy(n);
}

export type ByeRefusal = 'limit' | 'withdrawn';

/** Record a requested bye (`points` ½ or 0; null clears it). A ½-point bye
 *  over the organiser's limit is refused (`limit`). */
export function setRequestedBye(o: SwissOps, id: string, round: number, points: 0 | 0.5 | null): SwissOps | ByeRefusal {
  if (points !== null && o.withdrawn?.[id] !== undefined && round >= o.withdrawn[id]) return 'withdrawn';
  const had = o.byes?.[id]?.[String(round)];
  if (points === 0.5 && had !== 0.5 && halfByesOf(o, id) >= hpbLimitOf(o)) return 'limit';
  const n = clone(o);
  n.byes = { ...(n.byes ?? {}) };
  const one = { ...(n.byes[id] ?? {}) };
  if (points === null) delete one[String(round)]; else one[String(round)] = points;
  if (Object.keys(one).length) n.byes[id] = one; else delete n.byes[id];
  if (points !== null && n.absent?.[id]) { n.absent[id] = n.absent[id].filter((r) => r !== round); if (!n.absent[id].length) delete n.absent[id]; }
  return tidy(n);
}

/** Add a late entrant who is paired from `round` (≥ 2); missed rounds score `missed`. */
export function addLate(o: SwissOps, id: string, round: number, missed: 0 | 0.5, name?: string): SwissOps {
  const n = clone(o);
  n.late = { ...(n.late ?? {}), [id]: { round: Math.max(2, Math.floor(round)), missed, ...(name ? { name } : {}) } };
  return tidy(n);
}

export function removeLate(o: SwissOps, id: string): SwissOps {
  const n = clone(o);
  if (n.late) delete n.late[id];
  return tidy(n);
}

export function setHpbLimit(o: SwissOps, limit: number): SwissOps {
  const n = clone(o);
  n.hpbLimit = Math.max(0, Math.min(20, Math.floor(limit)));
  return n;
}

/** Plain words for a round's not-paired list ("Withdrawn: A · Absent: B · ½ bye: C"). */
export function roundStatusText(o: SwissOps, ids: string[], round: number, nameOf: (id: string) => string): string {
  const groups: Record<string, string[]> = {};
  for (const id of ids) {
    const why = unavailableIn(o, id, round);
    if (!why) continue;
    const label = why === 'bye' ? (o.byes?.[id]?.[String(round)] === 0.5 ? '½-point bye' : o.byes?.[id]?.[String(round)] === 1 ? '1-point bye' : '0-point bye')
      : why === 'withdrawn' ? 'Withdrawn' : why === 'absent' ? 'Absent (0)' : 'Joins later';
    (groups[label] ??= []).push(nameOf(id));
  }
  return Object.entries(groups).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ');
}

/** SD-134 — the current Swiss round is finished: every game is completed; a
 *  cancelled game (or a team tie's set-aside rubber) no longer blocks the next
 *  round. */
export function swissRoundComplete(games: { status: string }[]): boolean {
  const live = games.filter((m) => m.status !== 'cancelled');
  return games.length > 0 && live.every((m) => m.status === 'completed');
}
