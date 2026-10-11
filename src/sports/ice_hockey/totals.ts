/**
 * SD-145 — ice hockey statTotals (SD-19): the WHOLE line per player. PURE.
 *
 * Live keys are the sum of `eventCredits` over the state (goals, assists,
 * points, shots on goal, PP / SH / EN goals, saves, penalty minutes and
 * penalty counts, shoot-out shots). Derived keys only the state can know:
 *  - goalies: `gkMinutes` (time in net on the game clock, pulled time out),
 *    `goalsAgainst` (goals while in net; empty-net goals and shoot-out goals
 *    don't count), `shotsAgainst` (saves + goals against), `shutouts` (the
 *    only goalie of his side in a finished match, nothing conceded) and
 *    `gkGames`;
 *  - `gwg`: the game-winning goal (the winner's goal one more than the
 *    loser's final total; none when a shoot-out decided it);
 *  - `plusMinus` (only when +/- tracking is on): +1 / −1 for each skater on
 *    the ice at an even-strength, short-handed or empty-net goal; power-play
 *    and penalty-shot goals don't count (NHL / IIHF statistics).
 */
import {
  eventCredits, isComplete, matchSec, result, LIVE_KEYS,
  type IceHockeyState, type Side, type Who,
} from './engine.ts';

type Line = { side: Side; stats: Record<string, number> };

type Spell = { side: Side; id?: string; name?: string; secs: number; ga: number; saves: number };

/** The game's end on the clock: now / the final horn, or the last event. */
const endSec = (s: IceHockeyState): number => Math.max(matchSec(s), ...s.events.map((e) => e.sec));

/** Who was in net for `side` over the game, in game-clock order (a backfilled
 *  change sits at its own time): [from sec, log index, goalie | undefined = pulled]. */
export function netTimeline(s: IceHockeyState, side: Side): { from: number; i: number; who?: Who }[] {
  const start = s.xi?.[side]?.gk ? { id: s.xi[side]!.gk!.id, name: s.xi[side]!.gk!.name } : undefined;
  const out: { from: number; i: number; who?: Who }[] = [{ from: 0, i: -1, who: start }];
  let gk: Who | undefined = start;
  let pulled = false;
  const changes = s.events.map((e, i) => ({ e, i })).filter(({ e }) => e.side === side && (e.type === 'gk' || e.type === 'pull' || e.type === 'back'))
    .sort((a, b) => a.e.sec - b.e.sec || a.i - b.i);
  for (const { e, i } of changes) {
    if (e.type === 'gk') { gk = { id: e.playerId, name: e.playerName }; pulled = false; }
    else if (e.type === 'pull') pulled = true;
    else pulled = false;
    out.push({ from: e.sec, i, who: pulled ? undefined : gk });
  }
  return out;
}
/** The goalie in net for `side` at an event (its game second, then log order). */
export function goalieAtTime(tl: { from: number; i: number; who?: Who }[], sec: number, index: number): Who | undefined {
  let cur: Who | undefined;
  for (const x of tl) if (x.from < sec || (x.from === sec && x.i < index)) cur = x.who;
  return cur;
}

/** Goalie spells per side: seconds in net, goals against, saves. */
export function goalieSpells(s: IceHockeyState): Map<string, Spell> {
  const out = new Map<string, Spell>();
  const end = endSec(s);
  const key = (w?: Who) => (w?.id ? w.id : w?.name ? `name:${w.name}` : '');
  for (const side of ['home', 'away'] as const) {
    const get = (w?: Who) => {
      const k = key(w);
      if (!k) return undefined;
      let r = out.get(k);
      if (!r) { r = { side, ...(w?.id ? { id: w.id } : {}), ...(w?.name ? { name: w.name } : {}), secs: 0, ga: 0, saves: 0 }; out.set(k, r); }
      return r;
    };
    const tl = netTimeline(s, side);
    tl.forEach((x, j) => {
      const r = get(x.who);
      const to = Math.min(end, j + 1 < tl.length ? tl[j + 1].from : end);
      if (r) r.secs += Math.max(0, to - x.from);
    });
    s.events.forEach((e, i) => {
      if (e.type === 'goal' && e.side !== side && !e.en) { const r = get(goalieAtTime(tl, e.sec, i)); if (r) r.ga += 1; }
      if (e.type === 'shot' && e.side !== side && e.gkId) { const r = get({ id: e.gkId, name: e.gkName }); if (r) r.saves += 1; }
    });
  }
  return out;
}

/** The game-winning goal's id (none for a tie or a shoot-out win). */
export function gameWinningGoal(s: IceHockeyState): string | undefined {
  const r = result(s);
  if (!r || r.winner === 'draw' || s.shootoutWinner) return undefined;
  const w = r.winner;
  const loserGoals = w === 'home' ? s.away : s.home;
  const goals = s.events.map((e, i) => ({ e, i })).filter(({ e }) => e.type === 'goal' && e.side === w)
    .sort((a, b) => a.e.sec - b.e.sec || a.i - b.i);
  return goals[loserGoals]?.e.id;
}

/** SD-19 statTotals: the whole line per player id. */
export function iceHockeyTotals(s: IceHockeyState): Record<string, Line> {
  const out: Record<string, Line> = {};
  const line = (id: string, side: Side) => (out[id] ??= { side, stats: {} });
  const add = (id: string, side: Side, stats: Record<string, number>) => {
    const l = line(id, side);
    for (const [k, v] of Object.entries(stats)) l.stats[k] = (l.stats[k] ?? 0) + v;
  };
  for (const e of s.events) {
    const c = eventCredits(e, s.pimScale);
    for (const cr of [c.first, c.second, c.third]) if (cr) add(cr.playerId, cr.side ?? e.side, cr.stats);
  }
  for (const side of ['home', 'away'] as const) {
    for (const k of s.shootout?.[side] ?? []) if (k.playerId) add(k.playerId, side, { soTaken: 1, soGoals: k.scored ? 1 : 0 });
  }
  // goalies
  const spells = [...goalieSpells(s).values()];
  const done = isComplete(s);
  for (const g of spells) {
    if (!g.id) continue;
    const l = line(g.id, g.side).stats;
    l.gkMinutes = Math.round((g.secs / 60) * 10) / 10;
    l.goalsAgainst = g.ga;
    l.shotsAgainst = g.saves + g.ga;
    l.gkGames = 1;
    const only = spells.filter((x) => x.side === g.side && (x.secs > 0 || x.ga > 0 || x.saves > 0)).length === 1;
    l.shutouts = done && only && g.ga === 0 && !s.events.some((e) => e.type === 'goal' && e.side !== g.side) ? 1 : 0;
  }
  // game-winning goal
  const gwg = gameWinningGoal(s);
  if (gwg) {
    const e = s.events.find((x) => x.id === gwg);
    if (e?.playerId) add(e.playerId, e.side, { gwg: 1 });
  }
  // +/- from the on-ice lists (tracking on)
  if (s.plusMinus) {
    const goalies = new Set(spells.map((g) => g.id).filter(Boolean) as string[]);
    for (const e of s.events) {
      if (e.type !== 'goal' || !e.onIce) continue;
      const counts = !e.ps && e.strength !== 'pp';
      for (const side of ['home', 'away'] as const) {
        for (const id of e.onIce[side] ?? []) {
          if (goalies.has(id)) continue;
          add(id, side, { plusMinus: counts ? (side === e.side ? 1 : -1) : 0 });
        }
      }
    }
  }
  for (const l of Object.values(out)) {
    for (const k of ['goals', 'assists', 'points', 'shotsOnGoal', 'penaltyMinutes'] as const) l.stats[k] ??= 0;
  }
  return out;
}

/** The keys statTotals owns that no live action credits (contract rule 5). */
export const DERIVED_KEYS = ['gkMinutes', 'goalsAgainst', 'shotsAgainst', 'shutouts', 'gkGames', 'gwg', 'plusMinus'] as const;
export const OWNED_LIVE_KEYS = LIVE_KEYS;
