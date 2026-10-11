/**
 * SD-146 — netball's box score source (SD-23 shared box score). PURE.
 * Per player: the same `eventCredits` the stat lines get, per quarter (or the
 * whole match), plus Q (quarters played) from the line-up (Overall only).
 * Team figures feed the comparison: centre passes, centre-pass goals, goals
 * from gains and time-outs; anything logged without a player (a team goal, an
 * official's sanction) lands on the "Team" row so the totals equal the score.
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import { centreInfo, eventCredits, periodName, teamFigures, totalPeriods, LIVE_KEYS, POSITIONS, type NetballState, type Side } from './engine.ts';
import { netballTotals } from './totals.ts';

export interface NetballBoxContext { homeRoster?: Player[]; awayRoster?: Player[] }

const ROW_KEYS = [...LIVE_KEYS];
const TEAM_KEYS = ['goals', 'attempts', 'goalAssists', 'feeds', 'intercepts', 'deflections', 'rebounds', 'turnovers', 'penaltiesConceded', 'contacts', 'obstructions', 'warnings', 'suspensions', 'orderedOff'] as const;

export function netballBox(s: NetballState, ctx: NetballBoxContext = {}): MatchBoxSource {
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const periods = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.clock.since ? 5000 : undefined,
    data: (scope) => {
      const totals = scope === 'all' ? netballTotals(s) : {};
      const cp = scope === 'all' ? centreInfo(s) : undefined;
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
        for (const p of POSITIONS) { const w = s.xi?.[sd]?.pos?.[p]; if (w) row(w.id, w.name)!.starter = true; }
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
            if (r && t.stats.quarters !== undefined) r.stats.quarters = t.stats.quarters;
          }
        }
        const f = teamFigures(s, sd, scope);
        const sum = (k: string) => [...rows.values()].reduce((a, r) => a + (r.stats[k] ?? 0), 0);
        const teamStats: Record<string, number> = {};
        for (const k of TEAM_KEYS) {
          const left = f[k] - sum(k);
          if (left > 0) teamStats[k] = left;
        }
        return {
          rows: [...rows.values()],
          ...(Object.keys(teamStats).length ? { team: { label: 'Team / officials', stats: teamStats } } : {}),
          teamStats: {
            timeouts: f.timeouts,
            ...(cp && s.firstCentre ? { centrePasses: cp.taken[sd], cpGoals: cp.cpGoals[sd], gainGoals: cp.gainGoals[sd] } : {}),
          },
        };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}
