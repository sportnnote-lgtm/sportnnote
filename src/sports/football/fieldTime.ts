/**
 * SD-29 — football on the generic time-on-field tracker (../onField.ts). PURE.
 *
 * Input: the XI stamp (`state.xi`, SD-09), `sub`, `red` and `sinbin` events
 * and the goals (for +/-). Two clocks, both from SD-09's `position`:
 *   - `reg`   regulation minutes (FIFA / Opta "minutes played": 90, +30 with
 *             extra time; an event in added time counts as the end of its
 *             half) → the `minutes` written on every player's line;
 *   - `exact` added time included → the live sin-bin countdown, which keeps
 *             running in added time.
 * A side with no XI stamp (older logs) is left out entirely — its subs alone
 * would give a misleading partial picture — so old matches write nothing new.
 */
import { trackField, timeLeft, type FieldEvent, type FieldLog, type FieldResult, type Who } from '../onField.ts';
import { startOffset, halfBase, type FootballState } from './engine.ts';
import { end, keeperTotals, position } from './keepers.ts';

type Side = 'home' | 'away';
type Clock = 'reg' | 'exact';

const stamped = (s: FootballState, side: Side): boolean => {
  const st = s.xi?.[side];
  return !!st && (!!st.players?.length || !!st.gk);
};

/** The football field log on one clock. `upTo` = the clock's "now" (live);
 *  default = the end of the match so far. */
export function footballFieldLog(s: FootballState, clock: Clock = 'reg', upTo?: number): FieldLog {
  const starters = { home: [] as Who[], away: [] as Who[] };
  const people: Who[] = [];
  for (const side of ['home', 'away'] as const) {
    if (!stamped(s, side)) continue;
    const st = s.xi![side]!;
    starters[side] = (st.players?.length ? st.players : st.gk ? [st.gk] : []).map((p) => ({ id: p.id, name: p.name }));
    for (const p of [...(st.players ?? []), ...(st.keepers ?? []), ...(st.gk ? [st.gk] : [])]) people.push({ id: p.id, name: p.name });
  }
  const at = (minute: number, half?: 1 | 2 | 3 | 4) => position(s, minute, half)[clock];
  const events: FieldEvent[] = [];
  for (const e of s.events ?? []) {
    const scoring = e.type === 'goal' || e.type === 'owngoal';
    // a sin-bin is about the player, so it counts (live banner, on-pitch list)
    // even for a side with no XI stamp; its player gets no minutes there
    // (`footballTotals` writes only stamped sides)
    if (!scoring && e.type !== 'sinbin' && !stamped(s, e.side)) continue;
    const t = at(e.type === 'sinbin' && typeof e.sec === 'number' ? e.sec / 60 : e.minute, e.half);
    if (scoring) events.push({ kind: 'score', t, side: e.side, points: 1 });
    else if (e.type === 'sub') events.push({ kind: 'sub', t, side: e.side, off: { id: e.playerId, name: e.playerName }, on: { id: e.secondId, name: e.secondName } });
    else if (e.type === 'red' && e.playerName) events.push({ kind: 'off', t, side: e.side, who: { id: e.playerId, name: e.playerName } });
    else if (e.type === 'sinbin' && (e.playerName || e.playerId)) events.push({ kind: 'suspend', t, side: e.side, who: { id: e.playerId, name: e.playerName }, minutes: Number(e.suspendMinutes ?? s.sinBinMinutes ?? 0) });
  }
  const last = events.reduce((m, e) => Math.max(m, e.t), 0);
  const finish = upTo ?? end(s)[clock];
  return { starters, events, people, end: Math.max(finish, upTo !== undefined ? last : 0) };
}

/** Time on the pitch per player on the regulation clock. */
export const footballField = (s: FootballState): FieldResult => trackField(footballFieldLog(s, 'reg'));

/** SD-29: the absolute figures football's `statTotals` owns — `minutes` for
 *  every player who took the field (starters and subs who came on; ids only),
 *  plus SD-09's keeper `cleanSheets` / `goalsConceded`. Keeper minutes are time
 *  on the pitch (the same as time in goal unless an outfielder went in goal). */
export function footballTotals(s: FootballState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  for (const p of footballField(s).players) {
    // never on the pitch (a red card on the bench) → no minutes; a name-only
    // sub from an older log has no id to write to
    if (!p.played || !p.id || !stamped(s, p.side)) continue;
    // (a sub who came on at the final whistle still played: 0 minutes)
    out[p.id] = { side: p.side, stats: { minutes: Math.round(p.minutes) } };
  }
  for (const [id, k] of Object.entries(keeperTotals(s))) {
    out[id] = { side: k.side, stats: { ...(out[id]?.stats ?? {}), cleanSheets: k.stats.cleanSheets, goalsConceded: k.stats.goalsConceded, ...(out[id] ? {} : { minutes: k.stats.minutes }) } };
  }
  return out;
}

/** The live match clock in minutes, added time included (not the ordinal
 *  minute events are stamped with): holds at the half's end + added time. */
export function liveClockMinutes(s: FootballState, nowMs: number): number {
  const base = startOffset(s);
  if (!s.startedAt) return base;
  const raw = base + Math.max(0, nowMs - s.startedAt) / 60000;
  return Math.min(raw, halfBase(s) + (s.stoppage?.[s.half] ?? 0));
}

/** For the live banner: players in the sin-bin now (with the time left) and
 *  how many each side has on the pitch. */
export function footballLiveField(s: FootballState, nowMs: number): {
  suspended: { side: Side; name: string; left: string }[];
  onPitch: { home: number; away: number } | null;
  short: { home: number; away: number };
} {
  const now = position(s, liveClockMinutes(s, nowMs), s.half).exact;
  const r = trackField(footballFieldLog(s, 'exact', now));
  const suspended = s.ended ? [] : r.suspended.map((x) => ({ side: x.side, name: x.name ?? 'Player', left: timeLeft(x.until, now) }));
  const both = stamped(s, 'home') && stamped(s, 'away');
  return { suspended, onPitch: both ? { home: r.onField.home.length, away: r.onField.away.length } : null, short: r.short };
}
