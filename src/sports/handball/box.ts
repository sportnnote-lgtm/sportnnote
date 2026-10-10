/**
 * SD-102 — handball's box score source (SD-23 shared box score). PURE.
 * Per player: the same `eventCredits` the stat lines get, per half (or the
 * whole match), plus MIN from the field tracker and GA for keepers (Overall
 * only). Team figures feed the comparison: time-outs; sanctions given to team
 * officials (and anything logged without a player) land on the "Team" row so
 * the totals equal the score.
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import { eventCredits, periodName, teamFigures, totalPeriods, LIVE_KEYS, GOAL_KEY, SHOT_KEY, SHOT_TYPES, type HandballState, type Side } from './engine.ts';
import { handballTotals } from './totals.ts';

export interface HandballBoxContext { homeRoster?: Player[]; awayRoster?: Player[] }

/** every key a row carries (the comparison sums line keys over the rows) */
const ROW_KEYS = LIVE_KEYS.filter((k) => k !== 'soTaken' && k !== 'soGoals');
const TEAM_KEYS = ['goals', 'shots', 'saves', 'blocks', 'technicalFaults', 'steals', 'yellowCards', 'twoMinutes', 'redCards', 'blueCards', 'sevenMGoals', 'sevenMTaken'] as const;

export function handballBox(s: HandballState, ctx: HandballBoxContext = {}): MatchBoxSource {
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const periods = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.clock.since ? 5000 : undefined,
    data: (scope) => {
      const totals = scope === 'all' ? handballTotals(s) : {};
      const side = (sd: Side): BoxSideInput => {
        const roster = (sd === 'home' ? ctx.homeRoster : ctx.awayRoster) ?? [];
        const rows = new Map<string, BoxRowInput>();
        const keyOf = (id?: string, name?: string) => id ?? (name ? `name:${name}` : '');
        const row = (id?: string, name?: string) => {
          const k = keyOf(id, name);
          if (!k) return undefined;
          let r = rows.get(k);
          if (!r) {
            const nm = name ?? roster.find((p) => p.id === id)?.fullName ?? 'Player';
            r = { name: nm, ...(id ? { playerId: id } : {}), stats: Object.fromEntries(ROW_KEYS.map((x) => [x, 0])) };
            rows.set(k, r);
          }
          return r;
        };
        for (const p of s.xi?.[sd]?.players ?? []) row(p.id, p.name)!.starter = true;
        for (const e of s.events) if (e.side === sd && e.type === 'sub' && (e.secondId || e.secondName)) row(e.secondId, e.secondName);
        for (const e of s.events) {
          if (e.side !== sd || (scope !== 'all' && e.period !== scope)) continue;
          const c = eventCredits(e);
          for (const cr of [c.first, c.second]) {
            if (!cr) continue;
            const r = row(cr.playerId, cr.playerName);
            if (r) for (const [k, v] of Object.entries(cr.stats)) if (k in r.stats) r.stats[k] += v;
          }
        }
        if (scope === 'all') {
          for (const [id, t] of Object.entries(totals)) {
            if (t.side !== sd) continue;
            const r = row(id);
            if (!r) continue;
            if (t.stats.minutes !== undefined) r.stats.minutes = t.stats.minutes;
            if (t.stats.goalsConceded !== undefined) r.stats.goalsConceded = t.stats.goalsConceded;
          }
        }
        const f = teamFigures(s, sd, scope);
        const sum = (k: string) => [...rows.values()].reduce((a, r) => a + (r.stats[k] ?? 0), 0);
        const teamStats: Record<string, number> = {};
        const want: Record<string, number> = Object.fromEntries(TEAM_KEYS.map((k) => [k, f[k]]));
        for (const t of SHOT_TYPES) { want[GOAL_KEY[t]] = f.byType[t].goals; want[SHOT_KEY[t]] = f.byType[t].shots; }
        for (const [k, v] of Object.entries(want)) {
          const left = v - sum(k);
          if (left > 0) teamStats[k] = left;
        }
        return {
          rows: [...rows.values()],
          ...(Object.keys(teamStats).length ? { team: { label: 'Team / officials', stats: teamStats } } : {}),
          teamStats: { timeouts: f.timeouts },
        };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}
