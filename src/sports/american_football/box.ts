/**
 * SD-147 — American football's box score source (SD-23 shared box score). PURE.
 * Per player: the same `eventCredits` the stat lines get, per period (or the
 * whole game). Points nobody can be credited with land on the "Team" row so
 * the totals equal the score. Team figures feed the comparison (first downs,
 * total yards, turnovers, penalties…) and the notes (time of possession, 3rd
 * downs) — those need play-by-play mode.
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import {
  eventCredits, secondIsDefence, periodName, teamFigures, totalPeriods, mmss, matchSec, other,
  PBP_KEYS, SCORE_KEYS, type AFState, type Side,
} from './engine.ts';

export interface AFBoxContext { homeRoster?: Player[]; awayRoster?: Player[]; homeName?: string; awayName?: string }

const ROW_SCORE = SCORE_KEYS.filter((k) => k !== 'ejections');

export function afBox(s: AFState, ctx: AFBoxContext = {}): MatchBoxSource {
  const n = Math.min(totalPeriods(s), Math.max(1, s.period));
  const periods = n >= 2 ? Array.from({ length: n }, (_, i) => ({ value: i + 1, label: periodName(s, i + 1) })) : [];
  const pbp = s.mode === 'pbp' || s.events.some((e) => e.pbp);
  const tackles = s.trackTackles || s.events.some((e) => e.type === 'tackle');
  const ROW_KEYS: string[] = [...ROW_SCORE, ...(pbp ? PBP_KEYS : []), ...(tackles ? ['tackles'] : [])];
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.clock.since && pbp ? 5000 : undefined,
    notes: () => {
      if (!pbp) return [];
      const h = teamFigures(s, 'home', 'all', matchSec(s, Date.now()));
      const a = teamFigures(s, 'away', 'all', matchSec(s, Date.now()));
      // names when the caller has them; else home – away, the table's order
      const pair = (x: string, y: string) => (ctx.homeName && ctx.awayName ? `${ctx.homeName} ${x} · ${ctx.awayName} ${y}` : `${x} – ${y}`);
      return [
        `Time of possession: ${pair(mmss(h.top), mmss(a.top))}`,
        `3rd-down conversions: ${pair(`${h.thirdConv}/${h.thirdAtt}`, `${a.thirdConv}/${a.thirdAtt}`)}`,
      ];
    },
    data: (scope) => {
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
        for (const e of s.events) {
          if (scope !== 'all' && e.period !== scope) continue;
          const c = eventCredits(e);
          const defSide = secondIsDefence(e) ? other(e.side) : e.side;
          const cr1 = e.side === sd ? c.first : undefined;
          const cr2 = defSide === sd ? c.second : undefined;
          for (const cr of [cr1, cr2]) {
            if (!cr) continue;
            const r = row(cr.playerId, cr.playerName);
            if (r) for (const [k, v] of Object.entries(cr.stats)) if (k in r.stats) r.stats[k] += v;
          }
        }
        const f = teamFigures(s, sd, scope);
        const credited = [...rows.values()].reduce((x, r) => x + (r.stats.points ?? 0), 0);
        const left = f.points - credited;
        const tdLeft = f.touchdowns - [...rows.values()].reduce((x, r) => x + (r.stats.touchdowns ?? 0), 0);
        const teamRow: Record<string, number> = {};
        if (left > 0) teamRow.points = left;
        if (tdLeft > 0) teamRow.touchdowns = tdLeft;
        return {
          rows: [...rows.values()],
          ...(Object.keys(teamRow).length ? { team: { label: 'Team', stats: teamRow } } : {}),
          teamStats: {
            timeoutsUsed: f.timeouts,
            ...(pbp ? {
              firstDowns: f.firstDowns, totalYards: f.totalYards, teamRushYds: f.rushYds, teamPassYds: f.passYds,
              turnovers: f.turnovers, sacksAllowed: f.sacked, penaltyCount: f.penalties, penaltyYds: f.penaltyYds,
            } : {}),
          },
        };
      };
      return { home: side('home'), away: side('away'), ...(pbp ? {} : { untracked: ['firstDowns', 'totalYards', 'teamRushYds', 'teamPassYds', 'turnovers', 'sacksAllowed', 'penaltyCount', 'penaltyYds'] }) };
    },
  };
}
