/**
 * SD-144 — baseball box score sources (SD-23 shared box score). PURE.
 * Batting: every batter in the order (and anyone who came in), AB R H RBI BB
 * SO (+ 2B 3B HR SB when someone has one) and AVG for the game. Pitching (a
 * second table): IP H R ER BB SO HR NP ERA per pitcher who appeared. Both
 * come from the same absolute totals the stat lines get (./totals.ts). The
 * team comparison reads errors, left on base and pitches thrown.
 */
import type { Player } from '../../core/types';
import type { BoxRowInput, BoxSideInput, MatchBoxSource } from '../boxScore.ts';
import { batterStats, whoKey, type BaseballState, type Side } from './engine.ts';
import { baseballTotals, teamFigures } from './totals.ts';

export interface BaseballBoxContext { homeRoster?: Player[]; awayRoster?: Player[] }

const BAT_KEYS = ['plateAppearances', 'atBats', 'runs', 'hits', 'twoB', 'threeB', 'homeRuns', 'rbi', 'baseOnBalls', 'hitByPitch', 'strikeouts', 'sacFlies', 'sacBunts', 'stolenBases'] as const;
const PITCH_KEYS = ['outsPitched', 'hitsAllowed', 'runsAllowed', 'earnedRuns', 'erN', 'bbAllowed', 'kPitched', 'hrAllowed', 'pitches'] as const;
const OCCASIONAL = new Set(['twoB', 'threeB', 'homeRuns', 'stolenBases', 'hrAllowed']);

const nameIn = (roster: Player[] | undefined, id?: string, name?: string) => name ?? roster?.find((p) => p.id === id)?.fullName ?? 'Player';

/** Per-batter figures straight from the log, keyed by id (else "name:…"),
 *  so a game scored without a roster ("Batter 3") still has a box. */
function battingLines(s: BaseballState): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  const add = (k: string | undefined, stats: Record<string, number>) => {
    if (!k) return;
    const l = out.get(k) ?? {};
    for (const [x, v] of Object.entries(stats)) l[x] = (l[x] ?? 0) + v;
    out.set(k, l);
  };
  for (const e of s.events) {
    if (e.type === 'pa' && e.outcome) add(whoKey(e.batter), batterStats(e.outcome, e.rbi ?? 0));
    if (e.type === 'runner' && e.kind === 'SB') add(whoKey(e.moves?.[0]), { stolenBases: 1 });
  }
  for (const r of s.g.runs) add(r.runnerId ?? (r.runnerName ? `name:${r.runnerName}` : undefined), { runs: 1 });
  return out;
}

/** The batting box (the shared one — the match Summary tab reads it too). */
export function baseballBox(s: BaseballState, ctx: BaseballBoxContext = {}): MatchBoxSource {
  return {
    periods: [],
    emptyText: 'No batters yet.',
    data: () => {
      const lines = battingLines(s);
      const side = (sd: Side): BoxSideInput => {
        const roster = sd === 'home' ? ctx.homeRoster : ctx.awayRoster;
        const rows = new Map<string, BoxRowInput>();
        const row = (id: string | undefined, name: string | undefined, starter: boolean) => {
          const k = id ?? `name:${name}`;
          if (rows.has(k)) return;
          const t = lines.get(k) ?? {};
          const stats: Record<string, number> = {};
          for (const key of BAT_KEYS) if (!OCCASIONAL.has(key) || (t[key] ?? 0) > 0) stats[key] = t[key] ?? 0;
          rows.set(k, { name: nameIn(roster, id, name), ...(id ? { playerId: id } : {}), stats, ...(starter ? { starter: true } : {}) });
        };
        const start = s.lineup[sd]?.length ? s.lineup[sd]! : s.g.order[sd];
        start.forEach((e) => row(e.id, e.name, true));
        for (const e of s.events) {
          if (e.side !== sd) continue;
          if (e.type === 'pa' && e.batter) row(e.batter.id, e.batter.name, false);
          if (e.type === 'sub' && e.kind !== 'p' && e.on) row(e.on.id, e.on.name, false);
        }
        for (const e of s.g.order[sd]) row(e.id, e.name, false);
        const f = teamFigures(s, sd);
        return { rows: [...rows.values()], teamStats: { teamErrors: f.errors, leftOnBase: f.lob, teamPitches: teamFigures(s, sd === 'home' ? 'away' : 'home').pitches } };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}

/** The pitching box: one row per pitcher who appeared, in order. */
export function baseballPitchingBox(s: BaseballState, ctx: BaseballBoxContext = {}): MatchBoxSource {
  return {
    periods: [],
    emptyText: 'No pitchers yet.',
    data: () => {
      const totals = baseballTotals(s);
      const side = (sd: Side): BoxSideInput => {
        const roster = sd === 'home' ? ctx.homeRoster : ctx.awayRoster;
        const rows: BoxRowInput[] = [];
        const seen = new Set<string>();
        for (const sp of s.g.spells) {
          if (sp.side !== sd || seen.has(sp.key)) continue;
          seen.add(sp.key);
          const t = sp.id ? totals[sp.id]?.stats ?? {} : {};
          const stats: Record<string, number> = {};
          for (const k of PITCH_KEYS) if (!OCCASIONAL.has(k) || (t[k] ?? 0) > 0) stats[k] = t[k] ?? (k === 'pitches' ? s.g.pitches[sp.key] ?? 0 : 0);
          const dec = s.g.decisions;
          const tag = dec?.w === sp.key ? ' (W)' : dec?.l === sp.key ? ' (L)' : dec?.sv === sp.key ? ' (SV)' : '';
          rows.push({ name: `${nameIn(roster, sp.id, sp.name)}${tag}`, ...(sp.id ? { playerId: sp.id } : {}), stats, ...(sp.first ? { starter: true } : {}) });
        }
        // a starter named before the first pitch
        const st = s.starters[sd];
        if (st && !seen.has(whoKey(st) ?? '')) rows.unshift({ name: nameIn(roster, st.id, st.name), ...(st.id ? { playerId: st.id } : {}), stats: Object.fromEntries(PITCH_KEYS.filter((k) => !OCCASIONAL.has(k)).map((k) => [k, 0])), starter: true });
        return { rows };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}
