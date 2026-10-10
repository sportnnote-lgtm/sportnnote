/**
 * SD-101 — hockey's box score source (SD-23 shared box score). PURE.
 * Per player: the same `eventCredits` the stat lines get, per quarter / half
 * (or the whole match), plus MIN from the field tracker and GA for keepers
 * (Overall only). Team figures feed the comparison: penalty corners won and
 * converted, strokes, cards.
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import { eventCredits, periodName, teamFigures, pcConversion, type HockeyState, type Side } from './engine.ts';
import { hockeyTotals } from './totals.ts';

export interface HockeyBoxContext { homeRoster?: Player[]; awayRoster?: Player[] }

const ROW_KEYS = ['goals', 'assists', 'shots', 'shotsOnGoal', 'pcGoals', 'saves', 'greenCards', 'yellowCards', 'redCards'] as const;

export function hockeyBox(s: HockeyState, ctx: HockeyBoxContext = {}): MatchBoxSource {
  const n = Math.min(s.periods, Math.max(1, s.period));
  const periods = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.clock.since ? 5000 : undefined,
    data: (scope) => {
      const totals = scope === 'all' ? hockeyTotals(s) : {};
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
          if (scope !== 'all' && e.period !== scope) continue;
          const c = eventCredits(e);
          const add = (cr: typeof c.first, who: Side) => {
            if (!cr || who !== sd) return;
            const r = row(cr.playerId, cr.playerName);
            if (r) for (const [k, v] of Object.entries(cr.stats)) if (k in r.stats) r.stats[k] += v;
          };
          add(c.first, e.side);
          add(c.second, e.side);
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
        const conv = pcConversion(f);
        // goals / shots / cards logged with no player: the side's "Team" row,
        // so the totals equal the score
        const sum = (k: string) => [...rows.values()].reduce((a, r) => a + (r.stats[k] ?? 0), 0);
        const teamStats: Record<string, number> = {};
        for (const k of ['goals', 'shots', 'shotsOnGoal', 'pcGoals', 'saves', 'greenCards', 'yellowCards', 'redCards'] as const) {
          const left = f[k] - sum(k);
          if (left > 0) teamStats[k] = left;
        }
        return {
          rows: [...rows.values()],
          ...(Object.keys(teamStats).length ? { team: { label: 'Team', stats: teamStats } } : {}),
          teamStats: { pcs: f.pcs, strokesAwarded: f.strokes, ...(conv !== null ? { pcConversion: conv } : {}) },
        };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}
