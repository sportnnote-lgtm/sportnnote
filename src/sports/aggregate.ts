/** SD-120 — leg 2 of a two-legged (aggregate) knockout tie. Pure, shared by
 *  every engine with a decider (football, hockey, handball; basketball can use
 *  it the same way).
 *
 *  A NEW leg 2 carries `aggregateLeg: 2` on its format plus the leg-1 score as
 *  seen from its own sides (`aggPriorHome` / `aggPriorAway`, stamped once leg 1
 *  is complete). Then "level at full time" means level ON AGGREGATE (UEFA, EHF:
 *  extra time then penalties / 7 m throws when the aggregate is level after leg
 *  2, even if leg 2 itself wasn't drawn — and no decider when the leg is drawn
 *  but the aggregate isn't). Away goals (`aggAwayGoals`) are off by default, as
 *  UEFA abolished them in 2021. A match without these keys — every older one —
 *  keeps the plain per-match rule, so its log replays identically. */
export interface AggPrior {
  /** what leg 2's home side scored in leg 1 */
  home: number;
  /** what leg 2's away side scored in leg 1 */
  away: number;
  /** a level aggregate goes to away goals first (old UEFA rule; off by default) */
  awayGoals?: boolean;
}

export function aggPriorFromConfig(config?: Record<string, unknown>): AggPrior | undefined {
  if (!config || Number(config.aggregateLeg) !== 2) return undefined;
  const h = config.aggPriorHome, a = config.aggPriorAway;
  if (h === undefined || h === null || h === '' || a === undefined || a === null || a === '') return undefined;
  const home = Number(h), away = Number(a);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return undefined;
  return { home, away, ...(config.aggAwayGoals === true || config.aggAwayGoals === 'true' ? { awayGoals: true } : {}) };
}

/** Aggregate totals for leg 2's home / away sides. */
export const aggTotals = (s: { home: number; away: number; agg?: AggPrior }) =>
  ({ home: s.home + (s.agg?.home ?? 0), away: s.away + (s.agg?.away ?? 0) });

/** Is the contest level for the decider? The match score, or — on a new leg 2 —
 *  the aggregate (and, with away goals on, the away goals too: leg 2's home
 *  side scored its away goals in leg 1, leg 2's away side scores them now). */
export function levelForDecider(s: { home: number; away: number; agg?: AggPrior }): boolean {
  if (!s.agg) return s.home === s.away;
  const t = aggTotals(s);
  if (t.home !== t.away) return false;
  return s.agg.awayGoals ? s.agg.home === s.away : true;
}

/** "Aggregate 2–2" for the leg-2 scoreboard (undefined on any other match). */
export function aggregateText(s: { home: number; away: number; agg?: AggPrior }): string | undefined {
  if (!s.agg) return undefined;
  const t = aggTotals(s);
  return `Aggregate ${t.home}–${t.away}`;
}
