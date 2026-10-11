/**
 * Pro-Kabaddi scoring model — pure & replay-based.
 *
 * A raid's outcome (defenders touched, bonus, raider tackled) drives points AND
 * the out-count of players on the mat. Deriving the whole match state by replaying
 * the raid list keeps undo/edit trivially correct (drop a raid → recompute).
 *
 * Revival styles:
 *   • sanjeevani — putting an opponent out revives one of your own out players;
 *     an all-out gives +2 and the emptied side revives everyone.
 *   • amar       — nobody leaves the mat; points only (no out-count, super tackle
 *     or all-out apply).
 *   • gaminee    — no revival; an all-out ends the match.
 *
 * Pro rules (when enabled): super tackle (+2 when ≤3 defenders remain) and
 * do-or-die (a 3rd consecutive empty raid that scores nothing puts the raider out).
 */
export type KabaddiStyle = 'sanjeevani' | 'amar' | 'gaminee';
export type Side = 'home' | 'away';

export interface RaidOutcome {
  side: Side;
  /** defenders touched — each goes out; also the raid points scored */
  touches: number;
  /** bonus-line point (raider must return safely) */
  bonus: boolean;
  /** the raider was tackled (caught) — the defence scores, the raider goes out */
  raiderOut: boolean;
  /** SD-114: logged by the v2 raid form — touches are capped at the defenders
   *  on the mat. Absent on older logs, which replay their raw touches exactly
   *  as they scored then (REVIEW Decision 8). SD-83: with the `caughtVoid`
   *  format a v2 raid whose raider is caught loses its touches. */
  v?: 2;
  /** SD-59 (new optional key): defenders who stepped out of bounds during the
   *  raid without a struggle (AKFI line-out) — each is out and gives the
   *  RAIDING side 1 point (not a raid point: the raider isn't credited). */
  defOut?: number;
  /** SD-59 (new optional key): the raider stepped out of bounds — out, 1 point
   *  to the defence (no tackle), his touches don't count. */
  lineOut?: boolean;
  /** SD-59 / SD-72: match-clock time (fractional minutes) — orders the raid
   *  against card suspensions. Absent on older logs (the minute is used). */
  t?: number;
  minute?: number;
  /** log order (the action's id) — merges raids with technical points / cards */
  eid?: number;
}

/** SD-59 / SD-72 — a non-raid entry replayed in log order with the raids.
 *  `tech`: a technical point (late / broken cant, coaching from outside,
 *  delay, two raiders …) — `n` points to `side`, nobody goes out.
 *  `card`: green (warning), yellow (2-minute suspension: the player leaves the
 *  mat, the side plays short; a player carded while out serves it from his
 *  revival), red (off for the match, no substitute — the side is short for the
 *  rest of the match). `tp` = technical point(s) to the opponent with the card. */
export interface ExtraOutcome {
  x: 'tech' | 'card';
  /** tech: the side awarded the point. card: the carded side. */
  side: Side;
  n?: number;
  card?: 'green' | 'yellow' | 'red';
  /** card: given to a player (not a coach / team official) */
  player?: boolean;
  /** card: the player was off the mat (out) when carded */
  wasOut?: boolean;
  tp?: number;
  /** card: the player (id or name) — a red supersedes his own suspension */
  who?: string;
  t?: number;
  minute?: number;
  eid?: number;
}

/** What a technical point / card did in the replay. */
export interface ExtraBreakdown {
  /** points to `side` (tech) or to the opponent (card's technical point) */
  points: number;
  /** yellow: when the 2 minutes started (undefined = still out, waiting to be
   *  revived) and end */
  suspFrom?: number;
  suspUntil?: number;
}

/** SD-72 — a yellow card suspends for 2 minutes (AKFI / IKF). */
export const YELLOW_MINUTES = 2;

export interface KabaddiCfg {
  teamSize: number; style: KabaddiStyle; proRules: boolean;
  /** SD-83 (format caughtTouches 'void'): a caught raider's touches don't score
   *  and the touched defenders stay in (AKFI / IKF, PKL alike). Applies to v2
   *  raids only, so older logs replay exactly as they scored. */
  caughtVoid?: boolean;
}

export interface KabaddiDerived {
  home: number;
  away: number;
  /** players currently OUT (off the mat) per side */
  out: { home: number; away: number };
  /** consecutive empty raids per side (3rd is do-or-die) */
  emptyRaids: { home: number; away: number };
  /** an all-out ended the match (gaminee) */
  allOutEnded: boolean;
  /** What each replayed raid scored, in raid order (SD-03). Shorter than the
   *  input only when a gaminee all-out ended the match early. Derived only — the
   *  totals above are computed exactly as before. */
  perRaid: RaidBreakdown[];
  /** SD-59 / SD-72 — per technical point / card, in the input order */
  perExtra: ExtraBreakdown[];
  /** players off the mat for cards per side (suspended + sent off) */
  short: { home: number; away: number };
  /** red cards (players) per side */
  sentOff: { home: number; away: number };
  /** the merged replay order: ['r', raid index] / ['x', extra index] */
  order: Array<['r' | 'x', number]>;
}

/** One raid's points, split the way PKL's match centre counts them. */
export interface RaidBreakdown {
  side: Side;
  /** touch + eligible bonus points — the raider's raid points */
  raidPts: number;
  touchPts: number;
  bonusPts: number;
  /** the raider ended up out: tackled, or a failed do-or-die raid */
  raiderOut: boolean;
  /** this was a do-or-die raid */
  doOrDie: boolean;
  /** the raider was out only because a do-or-die raid scored nothing (no tackle made) */
  doOrDieFail: boolean;
  /** points to the DEFENDING side for putting the raider out (2 = super tackle) */
  tacklePts: number;
  superTackle: boolean;
  /** sides that scored an all-out (+2 each) at the end of this raid */
  allOuts: Side[];
  /** SD-59: defenders out by line-out — 1 point each to the raiding side */
  defOutPts?: number;
  /** SD-59: the raider stepped out — 1 point to the defence (no tackle) */
  lineOut?: boolean;
  /** SD-83: touches logged on a caught raid that didn't score */
  touchesLost?: number;
}

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Winner of a 5-raid shootout (PKL tie-breaker): best-of-5 (clinched early when a
 *  lead can't be caught), then sudden death once both have taken five. null =
 *  undecided. Points-based analogue of a penalty shootout. */
export function decideRaidShootout(h: number[], a: number[]): 'home' | 'away' | null {
  const hs = sum(h), as = sum(a);
  const hRem = Math.max(0, 5 - h.length), aRem = Math.max(0, 5 - a.length);
  if (h.length <= 5 && a.length <= 5) {
    if (hs > as + aRem) return 'home';
    if (as > hs + hRem) return 'away';
  }
  if (h.length === a.length && h.length >= 5 && hs !== as) return hs > as ? 'home' : 'away';
  return null;
}

/** Fold a raid list into the full derived match state. `extras` (SD-59 /
 *  SD-72: technical points, cards) merge with the raids by log order (`eid`);
 *  without them the replay is exactly the raid-only one. `now` = the match
 *  clock (minutes) to run suspensions up to (live on-mat counts). */
export function replayRaids(raids: RaidOutcome[], cfg: KabaddiCfg, extras: ExtraOutcome[] = [], now?: number): KabaddiDerived {
  const amar = cfg.style === 'amar';
  const score = { home: 0, away: 0 };
  const out = { home: 0, away: 0 };
  const emptyRaids = { home: 0, away: 0 };
  let allOutEnded = false;
  const perRaid: RaidBreakdown[] = [];
  const perExtra: ExtraBreakdown[] = [];
  // SD-72: card state — reds and running suspensions are off the mat (short);
  // a yellow given to a player who is out starts when he is revived (pending).
  const sentOff = { home: 0, away: 0 };
  const susp: { side: Side; j: number; until: number }[] = [];
  const pending: { side: Side; j: number }[] = [];
  const short = (side: Side) => sentOff[side] + susp.filter((x) => x.side === side).length;
  const onMat = (side: Side) => Math.max(0, cfg.teamSize - (amar ? 0 : out[side]) - short(side));
  const expire = (t?: number) => {
    if (t == null) return;
    for (let i = susp.length - 1; i >= 0; i--) if (susp[i].until <= t) susp.splice(i, 1);
  };
  /** revive up to k of `side`'s out players; a pending suspension starts first */
  const revive = (side: Side, k: number, t?: number) => {
    const n = Math.min(out[side], k);
    out[side] -= n;
    if (n > 0 && t != null) {
      for (let i = 0; i < pending.length && i < n; ) {
        if (pending[i].side !== side) { i++; continue; }
        const p = pending.splice(i, 1)[0];
        perExtra[p.j].suspFrom = t;
        perExtra[p.j].suspUntil = t + YELLOW_MINUTES;
        susp.push({ side, j: p.j, until: t + YELLOW_MINUTES });
      }
    }
  };
  const timeOf = (e: { t?: number; minute?: number }) => e.t ?? e.minute;

  // merged order: raids and extras by log order (a raid with no eid — a preview — last)
  const order: Array<['r' | 'x', number]> = raids.map((_, i) => ['r', i] as ['r', number]);
  if (extras.length) {
    const key = (e: { eid?: number }) => e.eid ?? Infinity;
    const all = [...order, ...extras.map((_, j) => ['x', j] as ['x', number])];
    all.sort((a, b) => {
      const ka = key(a[0] === 'r' ? raids[a[1]] : extras[a[1]]), kb = key(b[0] === 'r' ? raids[b[1]] : extras[b[1]]);
      return ka - kb || (a[0] === b[0] ? a[1] - b[1] : a[0] === 'r' ? -1 : 1);
    });
    order.splice(0, order.length, ...all);
  }

  /** all-out: +2 to the opponent; gaminee ends, others revive everyone */
  const allOutCheck = (t?: number): Side[] => {
    const allOuts: Side[] = [];
    if (amar) return allOuts;
    (['home', 'away'] as Side[]).forEach((side) => {
      // the mat is empty (SD-72: players suspended / sent off aren't on it)
      if (out[side] > 0 && out[side] >= cfg.teamSize - short(side)) {
        score[other(side)] += 2;
        allOuts.push(other(side));
        if (cfg.style === 'gaminee') allOutEnded = true;
        else revive(side, out[side], t);
      }
    });
    return allOuts;
  };

  for (const [kind, idx] of order) {
    if (allOutEnded) break;
    if (kind === 'x') {
      const e = extras[idx];
      const t = timeOf(e);
      expire(t);
      const b: ExtraBreakdown = { points: 0 };
      perExtra[idx] = b;
      if (e.x === 'tech') {
        b.points = Math.max(0, Math.floor(e.n ?? 1));
        score[e.side] += b.points;
        continue;
      }
      // a card
      b.points = Math.max(0, Math.floor(e.tp ?? 0));
      score[other(e.side)] += b.points;
      if (!e.player || amar && e.card !== 'red') continue;
      if (e.card === 'red') {
        // off for the match: out of the revival queue if he was out
        if (e.wasOut && out[e.side] > 0) out[e.side] -= 1;
        // a running suspension of the same player is superseded (he is
        // already off the mat — now for good); a pending one is dropped
        const same = (j: number) => !!e.who && extras[j].who === e.who && extras[j].side === e.side;
        const si = susp.findIndex((x) => same(x.j));
        if (si >= 0) susp.splice(si, 1);
        const pi = pending.findIndex((x) => same(x.j));
        if (pi >= 0) pending.splice(pi, 1);
        sentOff[e.side] += 1;
      } else if (e.card === 'yellow') {
        if (e.wasOut && !amar) pending.push({ side: e.side, j: idx });
        else if (t != null) {
          b.suspFrom = t;
          b.suspUntil = t + YELLOW_MINUTES;
          susp.push({ side: e.side, j: idx, until: t + YELLOW_MINUTES });
        }
      }
      continue;
    }
    const r = raids[idx];
    const t = timeOf(r);
    expire(t);
    const opp = other(r.side);
    // A bonus point only counts when the defending side has ≥6 defenders on the
    // mat (the standard "bonus line" eligibility) — `out[opp]` here is the count
    // BEFORE this raid's touches are applied. Below teamSize 6 the concept doesn't
    // apply, so it's always allowed. (SD-72: suspended / sent-off players
    // aren't on the mat.)
    const defendersBefore = amar ? cfg.teamSize - short(opp) : onMat(opp);
    const bonusCounts = r.bonus && (cfg.teamSize < 6 || defendersBefore >= 6);
    // SD-59: the raider stepped out — out, his touches don't count.
    const lineOut = r.lineOut === true;
    // SD-83 (v2 + caughtVoid): a caught raider's touches don't score.
    const caughtVoid = !!cfg.caughtVoid && r.v === 2 && r.raiderOut && !lineOut;
    // SD-114 (v2 only): you can't touch more defenders than are on the mat.
    const rawTouches = r.v === 2 ? Math.max(0, Math.min(r.touches, defendersBefore)) : r.touches;
    const touches = lineOut || caughtVoid ? 0 : rawTouches;
    // SD-59: defenders out of bounds (line-out) — after the touched ones
    const defOut = Math.max(0, Math.min(Math.floor(r.defOut ?? 0), Math.max(0, defendersBefore - touches)));
    const raidPts = touches + (bonusCounts ? 1 : 0);

    // Do-or-die: a 3rd straight empty raid that fails ⇒ the raider is out.
    const isDoOrDie = cfg.proRules && emptyRaids[r.side] >= 2;
    let raiderOut = r.raiderOut || lineOut;
    const dodFail = isDoOrDie && raidPts === 0 && defOut === 0 && !raiderOut;
    if (dodFail) raiderOut = true;

    // Raid points + defenders sent out (+ raiding side's revival).
    score[r.side] += raidPts + defOut;
    const sentOut = touches + defOut;
    if (!amar && sentOut > 0) {
      out[opp] = Math.min(cfg.teamSize - short(opp), out[opp] + sentOut);
      if (cfg.style === 'sanjeevani') revive(r.side, sentOut, t);
    }

    // Raider tackled ⇒ defence scores (super tackle when short-handed) + raider out.
    // SD-59: a line-out gives the defence 1 point, no tackle.
    let tacklePts = 0;
    let superTackle = false;
    if (raiderOut) {
      const defendersOnMat = amar ? cfg.teamSize : onMat(opp);
      superTackle = !lineOut && cfg.proRules && !amar && defendersOnMat <= 3;
      tacklePts = lineOut ? 0 : superTackle ? 2 : 1;
      score[opp] += lineOut ? 1 : tacklePts;
      if (!amar) {
        out[r.side] = Math.min(cfg.teamSize - short(r.side), out[r.side] + 1);
        if (cfg.style === 'sanjeevani') revive(opp, 1, t);
      }
    }

    // Empty raid streak (for do-or-die on the next raid).
    const empty = raidPts === 0 && defOut === 0 && !raiderOut;
    emptyRaids[r.side] = empty ? emptyRaids[r.side] + 1 : 0;

    const allOuts = allOutCheck(t);
    perRaid.push({
      side: r.side, raidPts, touchPts: touches, bonusPts: bonusCounts ? 1 : 0,
      raiderOut, doOrDie: isDoOrDie, doOrDieFail: dodFail,
      tacklePts, superTackle, allOuts,
      ...(defOut ? { defOutPts: defOut } : null),
      ...(lineOut ? { lineOut: true } : null),
      ...(caughtVoid && rawTouches ? { touchesLost: rawTouches } : null),
    });
  }
  expire(now);

  const shortNow = { home: short('home'), away: short('away') };
  return { home: score.home, away: score.away, out, emptyRaids, allOutEnded, perRaid, perExtra, short: shortNow, sentOff, order };
}
