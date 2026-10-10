/**
 * SD-33 (KB-02) + SD-41 (KB-03) — kabaddi figures derived from the raid replay.
 * PURE (no React Native): node tests load it.
 *
 *  • `kabaddiTotals` — the ABSOLUTE per-player stat line of a match (the
 *    `statTotals` contract, src/sports/types.ts). Raid / tackle points are the
 *    live keys (owned, so the sync heals pre-SD-03 lines that credited +1 per
 *    raid); the rest are derived counts nobody credits live:
 *      raids, successfulRaids (scored ≥ 1), emptyRaids (0 and not out),
 *      raidsOut (the raider ended up out: tackled or a failed do-or-die),
 *      touchPoints, bonusPoints, superRaids (3+ raid points),
 *      doOrDieRaids, doOrDiePoints, tackles (raiders the player tackled),
 *      superTackles.
 *    A failed do-or-die (no tackle made) gives the defence its point but
 *    credits no defender.
 *  • `kabaddiMatchCentre` — the PKL match-centre figures per team (points
 *    split, raid / tackle strike rates, super raids / tackles, do-or-die,
 *    all-outs), for the comparison panel.
 *
 * Coverage (D8): a match with old one-tap RAID / TACKLE points (no raid
 * outcome logged) has no raid counts — the count keys are left out for every
 * player (not 0) and the panel marks them untracked. A credited raider or
 * tackler we can't name an id for (an old snapshot) drops the raid / tackle
 * point keys from the totals, so their live lines are left as they are.
 */
import type { StatTotalsContext, StatTotalsEntry } from '../types';
import { replayRaids, type RaidBreakdown, type Side } from './rules.ts';
import { kabaddiCfg, isShootoutEvent, type KabaddiState, type RaidEntry } from './engine.ts';

/** Keys credited live (attribution): raider / tackler points. */
export const KABADDI_LIVE_KEYS = ['raidPoints', 'tacklePoints'] as const;
/** Derived per-player count keys (never credited live). */
export const KABADDI_COUNT_KEYS = [
  'raids', 'successfulRaids', 'emptyRaids', 'raidsOut', 'touchPoints', 'bonusPoints',
  'superRaids', 'doOrDieRaids', 'doOrDiePoints', 'tackles', 'superTackles',
] as const;

const other = (x: Side): Side => (x === 'home' ? 'away' : 'home');
const raidsOf = (s: KabaddiState): RaidEntry[] => s.raids ?? [];

/** Old one-tap RAID / TACKLE lines (not a guided raid, not a shootout raid). */
const plainLines = (s: KabaddiState) =>
  (s.events ?? []).filter((e) => e.group == null && (e.kind === 'raid' || e.kind === 'tackle') && !isShootoutEvent(e));

/** Each in-play raid with what the replay scored for it. */
function replayed(s: KabaddiState): { raid: RaidEntry; b: RaidBreakdown }[] {
  const raids = raidsOf(s);
  const per = replayRaids(raids, kabaddiCfg(s)).perRaid;
  return raids.flatMap((raid, i) => (per[i] ? [{ raid, b: per[i] }] : []));
}

/** Whether the match has only guided raids (the count keys are known). */
export const kabaddiCountsTracked = (s: KabaddiState): boolean => plainLines(s).length === 0;

export function kabaddiTotals(s: KabaddiState, ctx?: StatTotalsContext): Record<string, StatTotalsEntry> {
  const byName = (side: Side, name?: string) =>
    name ? ctx?.players?.[side].find((p) => p.name && p.name.trim().toLowerCase() === name.trim().toLowerCase())?.id : undefined;
  const idOf = (side: Side, id?: string, name?: string) => id ?? byName(side, name);
  const counts = kabaddiCountsTracked(s);
  const out: Record<string, StatTotalsEntry> = {};
  let unknown = false;
  const entry = (id: string, side: Side) => {
    if (!out[id]) {
      const stats: Record<string, number> = { raidPoints: 0, tacklePoints: 0 };
      if (counts) for (const k of KABADDI_COUNT_KEYS) stats[k] = 0;
      out[id] = { side, stats };
    }
    return out[id].stats;
  };
  const add = (st: Record<string, number>, k: string, by: number) => { if (k in st) st[k] += by; };

  for (const { raid: r, b } of replayed(s)) {
    const raider = idOf(r.side, r.raiderId, r.raider);
    if (raider) {
      const st = entry(raider, r.side);
      st.raidPoints += b.raidPts;
      add(st, 'raids', 1);
      add(st, 'successfulRaids', b.raidPts > 0 ? 1 : 0);
      add(st, 'emptyRaids', b.raidPts === 0 && !b.raiderOut ? 1 : 0);
      add(st, 'raidsOut', b.raiderOut ? 1 : 0);
      add(st, 'touchPoints', b.touchPts);
      add(st, 'bonusPoints', b.bonusPts);
      add(st, 'superRaids', b.raidPts >= 3 ? 1 : 0);
      add(st, 'doOrDieRaids', b.doOrDie ? 1 : 0);
      add(st, 'doOrDiePoints', b.doOrDie ? b.raidPts : 0);
    } else if (r.raider && b.raidPts) unknown = true;
    // the tackler: only a real tackle (a failed do-or-die credits no defender)
    if (b.raiderOut && r.raiderOut && (r.tacklerId || r.tackler)) {
      const d = other(r.side);
      const tackler = idOf(d, r.tacklerId, r.tackler);
      if (tackler) {
        const st = entry(tackler, d);
        st.tacklePoints += b.tacklePts;
        add(st, 'tackles', 1);
        add(st, 'superTackles', b.superTackle ? 1 : 0);
      } else unknown = true;
    }
  }
  // Old one-tap points: the line's points to the player on it.
  for (const e of plainLines(s)) {
    if (!e.side || !e.points || (!e.playerId && !e.playerName)) continue;
    const id = idOf(e.side, e.playerId, e.playerName);
    if (!id) { unknown = true; continue; }
    entry(id, e.side)[e.kind === 'raid' ? 'raidPoints' : 'tacklePoints'] += e.points;
  }
  if (unknown) for (const t of Object.values(out)) { delete t.stats.raidPoints; delete t.stats.tacklePoints; }
  return out;
}

/* ------------------------------ match centre (SD-41) ------------------------------ */

/** One team's PKL match-centre figures. Rates are 0–100, absent with no
 *  denominator. */
export interface KabaddiTeamCentre {
  raidPoints: number;
  tacklePoints: number;
  allOutPoints: number;
  /** points not from a raid, a tackle or an all-out: a failed do-or-die raid
   *  (the defence's point, no tackle made) and any old score offset */
  extraPoints: number;
  raids: number;
  successfulRaids: number;
  emptyRaids: number;
  raidsOut: number;
  superRaids: number;
  /** successful tackles (the raider tackled out) */
  tackles: number;
  /** tackles + the opponent's raids that scored a touch and got back */
  tackleAttempts: number;
  superTackles: number;
  doOrDieRaids: number;
  /** do-or-die raids that scored */
  doOrDieWon: number;
  /** all-outs inflicted / conceded */
  allOuts: number;
  allOutsConceded: number;
  raidStrikeRate?: number;
  tackleStrikeRate?: number;
  doOrDieRate?: number;
}

export interface KabaddiMatchCentre {
  home: KabaddiTeamCentre;
  away: KabaddiTeamCentre;
  /** false when old one-tap points make the raid / tackle counts unknown */
  countsTracked: boolean;
}

const zero = (): KabaddiTeamCentre => ({
  raidPoints: 0, tacklePoints: 0, allOutPoints: 0, extraPoints: 0, raids: 0, successfulRaids: 0, emptyRaids: 0, raidsOut: 0,
  superRaids: 0, tackles: 0, tackleAttempts: 0, superTackles: 0, doOrDieRaids: 0, doOrDieWon: 0, allOuts: 0, allOutsConceded: 0,
});
const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : undefined);

/** The PKL match centre for the whole match (`'all'`) or one half. Points come
 *  from the timeline (they equal the scoreboard's half cells); counts from the
 *  raid replay. Shootout raids are not regulation and stay out. */
export function kabaddiMatchCentre(s: KabaddiState, scope: 'all' | number = 'all'): KabaddiMatchCentre {
  const t = { home: zero(), away: zero() };
  const inScope = (half?: number) => scope === 'all' || half === scope;
  const all = replayed(s);
  const byEid = new Map(all.filter((x) => x.raid.eid != null).map((x) => [x.raid.eid!, x.b]));
  for (const e of s.events ?? []) {
    if (!e.side || !inScope(e.half) || isShootoutEvent(e)) continue;
    const p = e.points ?? 0;
    if (e.kind === 'raid') t[e.side].raidPoints += p;
    else if (e.kind === 'allout') t[e.side].allOutPoints += p;
    else if (e.kind === 'tackle') {
      const b = e.group != null ? byEid.get(e.group) : undefined;
      if (b?.doOrDieFail) t[e.side].extraPoints += p;
      else t[e.side].tacklePoints += p;
    }
  }
  for (const { raid: r, b } of all) {
    if (r.hidden || !inScope(r.half)) continue;
    const a = t[r.side], d = t[other(r.side)];
    a.raids += 1;
    if (b.raidPts > 0) a.successfulRaids += 1;
    if (b.raidPts === 0 && !b.raiderOut) a.emptyRaids += 1;
    if (b.raiderOut) a.raidsOut += 1;
    if (b.raidPts >= 3) a.superRaids += 1;
    if (b.doOrDie) { a.doOrDieRaids += 1; if (b.raidPts > 0) a.doOrDieWon += 1; }
    if (b.raiderOut && !b.doOrDieFail) {
      d.tackles += 1;
      d.tackleAttempts += 1;
      if (b.superTackle) d.superTackles += 1;
    } else if (!b.raiderOut && b.touchPts > 0) d.tackleAttempts += 1;
    for (const side of b.allOuts) { t[side].allOuts += 1; t[other(side)].allOutsConceded += 1; }
  }
  const countsTracked = kabaddiCountsTracked(s);
  for (const side of ['home', 'away'] as Side[]) {
    const x = t[side];
    if (scope === 'all') {
      // anything the timeline doesn't explain (an old remove's offset)
      const rest = (s[side] ?? 0) - (x.raidPoints + x.tacklePoints + x.allOutPoints + x.extraPoints);
      if (rest > 0) x.extraPoints += rest;
    }
    if (countsTracked) {
      x.raidStrikeRate = pct(x.successfulRaids, x.raids);
      x.tackleStrikeRate = pct(x.tackles, x.tackleAttempts);
      x.doOrDieRate = pct(x.doOrDieWon, x.doOrDieRaids);
    }
  }
  return { ...t, countsTracked };
}
