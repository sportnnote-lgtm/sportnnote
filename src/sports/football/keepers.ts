/**
 * SD-09 — football time on the pitch, keeper spells and clean sheets. PURE:
 * reads the match state only (no React), so completion, corrections (#05 AMEND
 * replays) and tests all derive the same figures.
 *
 * Time on the pitch comes from the XI stamp (`state.xi`, from the lineup),
 * `sub` events and `red` events. Minutes are regulation minutes (a full match
 * is 90, plus 30 with extra time): an event in added time counts as the end of
 * its half. The keeper comparison also counts the signalled added time, so a
 * keeper replaced in first-half added time is told apart from his replacement.
 *
 * Clean sheet (FIFA / Opta): the side conceded no goal in open play — the
 * regulation and extra-time score, penalty-shootout kicks excluded — and it goes
 * to the goalkeeper who was on the pitch the longest (ties: the earlier one).
 * Outfield players never get one.
 */
import { halfOfMinute, type FootballState, type XiStamp } from './engine.ts';

type Side = 'home' | 'away';

/** A squad position that means goalkeeper — the lineup slot code "GK" or the
 *  free-text profile position ("Goalkeeper", "Keeper", "GK"). */
export const isGoalkeeper = (position?: string | null): boolean =>
  !!position && /^\s*(gk|goal\s*-?\s*keeper|keeper)\s*$/i.test(position);
const opp = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export interface KeeperSpell {
  id: string;
  name: string;
  /** regulation minutes in goal (whole minutes) */
  minutes: number;
  /** goals the side let in while this keeper was in goal (open play; incl. own goals) */
  goalsConceded: number;
  /** added-time-inclusive minutes, for the longest-on-the-pitch comparison */
  exact: number;
  /** first minute (match time) this keeper was in goal — the tie-break */
  from: number;
}

/** The match timeline in minutes: each played half's start and regulation /
 *  added-time length, so an event's (minute, half) maps to a position. */
function halves(s: FootballState) {
  const hm = s.halfMinutes, et = s.etMinutes;
  const played = ([1, 2, 3, 4] as const).filter((h) => h <= s.half);
  let cum = 0;
  return played.map((h) => {
    const start = h === 1 ? 0 : h === 2 ? hm : h === 3 ? 2 * hm : 2 * hm + et;
    const reg = h <= 2 ? hm : et;
    const added = Math.max(0, Number(s.stoppage?.[h] ?? 0));
    const out = { h, start, reg, added, cumReg: cum };
    cum += reg;
    return out;
  });
}

interface Pos { reg: number; exact: number }

/** Where an event sits on the match clock: regulation minutes elapsed (added
 *  time clamps to the half's end) and added-time-inclusive minutes. */
function position(s: FootballState, minute: number, half: 1 | 2 | 3 | 4 | undefined): Pos {
  const hs = halves(s);
  const h = half ?? halfOfMinute(minute, { halfMinutes: s.halfMinutes, etMinutes: s.etMinutes });
  let exactBefore = 0;
  for (const x of hs) {
    if (x.h === h) {
      const into = Math.max(0, minute - x.start);
      return { reg: x.cumReg + Math.min(into, x.reg), exact: exactBefore + Math.min(into, x.reg + x.added) };
    }
    exactBefore += x.reg + x.added;
  }
  // An event stamped in a half the match never reached: the end of the match.
  return end(s);
}
function end(s: FootballState): Pos {
  const hs = halves(s);
  return {
    reg: hs.reduce((a, x) => a + x.reg, 0),
    exact: hs.reduce((a, x) => a + x.reg + x.added, 0),
  };
}

/** Each keeper's spell(s) for one side, merged per keeper. Empty when no keeper
 *  is known (no XI stamp — older logs — or a squad with no goalkeeper). */
export function keeperSpells(s: FootballState, side: Side): KeeperSpell[] {
  const stamp: XiStamp | undefined = s.xi?.[side];
  if (!stamp?.gk) return [];
  const known = new Map<string, string>(); // name → id (older subs carry names only)
  for (const p of [...(stamp.players ?? []), ...(stamp.keepers ?? []), stamp.gk]) if (p.name) known.set(p.name, p.id);
  const keeperIds = new Set((stamp.keepers ?? []).map((k) => k.id));
  keeperIds.add(stamp.gk.id);

  const spells = new Map<string, KeeperSpell>();
  let cur: { id: string; name: string; at: Pos } | null = { id: stamp.gk.id, name: stamp.gk.name, at: { reg: 0, exact: 0 } };
  const close = (to: Pos) => {
    if (!cur) return;
    const sp = spells.get(cur.id) ?? { id: cur.id, name: cur.name, minutes: 0, goalsConceded: 0, exact: 0, from: cur.at.exact };
    sp.minutes += Math.max(0, to.reg - cur.at.reg);
    sp.exact += Math.max(0, to.exact - cur.at.exact);
    spells.set(cur.id, sp);
  };
  const open = (id: string, name: string, at: Pos) => {
    cur = { id, name, at };
    if (!spells.has(id)) spells.set(id, { id, name, minutes: 0, goalsConceded: 0, exact: 0, from: at.exact });
  };
  const isCur = (id: string | undefined, name: string | undefined) =>
    !!cur && ((!!id && id === cur.id) || (!id && !!name && name === cur.name));

  // Events are logged in time order; a backfilled moment is placed by its minute.
  const evs = s.events
    .filter((e) => e.side === side || ((e.type === 'goal' || e.type === 'owngoal') && e.side === opp(side)))
    .map((e) => ({ e, at: position(s, e.minute, e.half) }))
    .sort((a, b) => a.at.exact - b.at.exact || a.e.id - b.e.id);

  for (const { e, at } of evs) {
    if ((e.type === 'goal' || e.type === 'owngoal') && e.side === opp(side)) {
      if (cur) {
        const c: { id: string; name: string } = cur;
        const sp = spells.get(c.id) ?? { id: c.id, name: c.name, minutes: 0, goalsConceded: 0, exact: 0, from: at.exact };
        sp.goalsConceded += 1;
        spells.set(c.id, sp);
      }
      continue;
    }
    if (e.type === 'sub') {
      const onId = e.secondId ?? (e.secondName ? known.get(e.secondName) : undefined);
      if (isCur(e.playerId, e.playerName)) {
        // The keeper came off: whoever replaced him goes in goal.
        close(at);
        cur = null;
        if (onId) open(onId, e.secondName ?? '', at);
      } else if (!cur && onId && keeperIds.has(onId)) {
        // Side without a keeper (he was sent off): a keeper coming on takes over.
        open(onId, e.secondName ?? '', at);
      }
      continue;
    }
    if (e.type === 'red' && isCur(undefined, e.playerName)) {
      close(at);
      cur = null;
    }
  }
  close(end(s));
  return [...spells.values()].map((sp) => ({ ...sp, minutes: Math.round(sp.minutes), exact: Math.round(sp.exact * 100) / 100 }));
}

/** The keeper credited with the side's clean sheet, if it kept one. */
export function cleanSheetKeeper(s: FootballState, side: Side): KeeperSpell | undefined {
  if (s[opp(side)] !== 0) return undefined; // open-play goals only — the shootout is separate
  return [...keeperSpells(s, side)].sort((a, b) => b.exact - a.exact || a.from - b.from)[0];
}

/** SD-09: the keeper figures `statTotals` owns — `cleanSheets`, `goalsConceded`
 *  and `minutes` for every keeper who played. Outfield players are left to the
 *  appearance lines (SD-11) so no line is created just to say "0". */
export function keeperTotals(s: FootballState): Record<string, { side: Side; stats: Record<string, number> }> {
  const out: Record<string, { side: Side; stats: Record<string, number> }> = {};
  for (const side of ['home', 'away'] as const) {
    const cs = cleanSheetKeeper(s, side);
    for (const sp of keeperSpells(s, side)) {
      if (sp.exact <= 0 && sp.goalsConceded === 0) continue; // never actually in goal
      out[sp.id] = { side, stats: { cleanSheets: cs?.id === sp.id ? 1 : 0, goalsConceded: sp.goalsConceded, minutes: sp.minutes } };
    }
  }
  return out;
}
