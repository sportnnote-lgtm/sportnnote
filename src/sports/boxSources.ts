/**
 * SD-23 — each sport's box score SOURCE: one match's per-player figures (and
 * the team figures for the comparison panel) for a period scope, from that
 * match's own live log. PURE (no React Native): the shared <BoxScore> renders
 * it on the live Score / Stats views and on the Summary tab, and the node
 * tests compare it with the bespoke tables it replaced.
 *
 * The per-player values are the same tallies the old components showed
 * (tests/box-score.test.mts holds them equal on fixtures): basketball's
 * play-by-play tally + SD-29 MIN / +/-, volleyball's and kabaddi's engine
 * `tally`, the racket point tallies. Football's per-player table is new
 * (FB-09): goals, assists, shots / on target, saves, fouls and cards from the
 * log, minutes from the SD-29 field tracker, goals conceded for keepers.
 */
import type { Player, SportId } from '../core/types';
import type { LiveEvent } from './liveEvents';
import type { BoxRowInput, BoxScope, BoxSideInput, MatchBoxSource } from './boxScore.ts';
import { periodLabel, type BasketballState } from './basketball/engine.ts';
import { pointsOf, type BBEvent } from './basketball/events.ts';
import { boxFieldByName } from './basketball/fieldTime.ts';
import { tally as volleyballTally, type VolleyballState } from './volleyball/engine.ts';
import { tally as kabaddiTally, isShootoutEvent, type KabaddiState } from './kabaddi/engine.ts';
import { footballStats, type FootballState, type TrackConfig } from './football/engine.ts';
import { footballFieldLog, liveClockMinutes } from './football/fieldTime.ts';
import { keeperTotals, position } from './football/keepers.ts';
import { trackField } from './onField.ts';
import type { RallyState } from './rallyEngine.ts';
import type { TennisState } from './tennis/engine.ts';
import type { PadelState } from './padel/engine.ts';
import type { BadmintonState } from './badminton/engine.ts';
import type { CarromState } from './carrom/engine.ts';

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export interface BoxContext {
  homeRoster?: Player[];
  awayRoster?: Player[];
  /** the clock for live figures (football minutes / possession) */
  now?: number;
}

const rosterOf = (ctx: BoxContext, side: Side): Player[] => (side === 'home' ? ctx.homeRoster : ctx.awayRoster) ?? [];
const idIn = (name: string, roster: Player[]) => roster.find((p) => p.fullName === name)?.id;
const withId = (row: BoxRowInput, roster: Player[]): BoxRowInput => {
  const id = row.playerId ?? idIn(row.name, roster);
  return id ? { ...row, playerId: id } : row;
};
const numbered = (n: number, word: string) => Array.from({ length: n }, (_, i) => ({ value: i + 1, label: `${word} ${i + 1}` }));

/* -------------------------------- basketball -------------------------------- */

export interface BasketballLine {
  name: string;
  pts: number; reb: number; ast: number; stl: number; blk: number; to: number; pf: number;
  ftm: number; fta: number;
}

/** A side's players from the play-by-play (every roster player listed, as the
 *  old table did); `scope` = one period. Sorted by points. */
export function basketballTally(events: BBEvent[], side: Side, roster: Player[], scope: BoxScope = 'all'): BasketballLine[] {
  const byName = new Map<string, BasketballLine>();
  const ensure = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, ftm: 0, fta: 0 });
    return byName.get(name)!;
  };
  roster.forEach((p) => ensure(p.fullName));
  for (const e of events) {
    if (e.side !== side || !e.playerName) continue;
    if (scope !== 'all' && e.quarter !== scope) continue;
    add(ensure(e.playerName), e);
  }
  return [...byName.values()].sort((a, b) => b.pts - a.pts);
}

function add(l: BasketballLine, e: BBEvent) {
  l.pts += pointsOf(e); // field goals + made free throws
  if (e.type === 'freethrow') { l.fta += 1; if (e.made) l.ftm += 1; }
  if (e.type === 'rebound') l.reb += 1;
  else if (e.type === 'assist') l.ast += 1;
  else if (e.type === 'steal') l.stl += 1;
  else if (e.type === 'block') l.blk += 1;
  else if (e.type === 'turnover') l.to += 1;
  else if (e.type === 'foul') l.pf += 1;
}

const bbStats = (l: BasketballLine): Record<string, number> => ({
  points: l.pts, rebounds: l.reb, assists: l.ast, steals: l.stl, blocks: l.blk, turnovers: l.to, fouls: l.pf,
  freeThrowsMade: l.ftm, freeThrowsAtt: l.fta,
});

export function basketballBox(s: BasketballState, ctx: BoxContext = {}): MatchBoxSource {
  const periods = Array.from({ length: Math.max(1, s.quarter) }, (_, i) => ({ value: i + 1, label: periodLabel(i + 1, s.regPeriods) }));
  return {
    periods,
    emptyText: 'No players.',
    data: (scope) => {
      // SD-29 MIN / +/- / on court: whole-game figures, the Overall view only.
      const field = scope === 'all' ? boxFieldByName(s) : undefined;
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        const rows = basketballTally(s.events, sd, roster, scope).map((l) => {
          const f = field?.get(l.name);
          const stats = bbStats(l);
          if (f?.min !== undefined) stats.minutes = f.min;
          if (f) stats.plusMinus = f.pm;
          return withId({ name: l.name, stats, ...(f?.on ? { on: true } : null) }, roster);
        });
        // points / rebounds … logged with no player: the side's "Team" row
        const team: BasketballLine = { name: 'Team', pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, ftm: 0, fta: 0 };
        for (const e of s.events) if (e.side === sd && !e.playerName && (scope === 'all' || e.quarter === scope)) add(team, e);
        return { rows, team: { label: 'Team', stats: bbStats(team) } };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}

/* -------------------------------- volleyball -------------------------------- */

const VB_OUTCOME_KINDS = new Set(['attack', 'opperror', 'serveerror']);

export function volleyballBox(s: VolleyballState, ctx: BoxContext = {}): MatchBoxSource {
  const currentSet = s.setsWon.home + s.setsWon.away + 1;
  const periods = numbered(s.ended ? s.sets.length : currentSet, 'Set');
  // D8: attack points exist only once the scorer logs outcomes (SD-04); an
  // older "Point"-only log hides the ATK column instead of showing zeros.
  const outcomes = s.events.some((e) => VB_OUTCOME_KINDS.has(e.kind ?? ''));
  return {
    periods,
    emptyText: 'No points yet.',
    data: (scope) => {
      const inScope = (e: LiveEvent) => scope === 'all' || e.set === scope;
      const count = (sd: Side, kind: string, name?: string) =>
        s.events.filter((e) => e.side === sd && e.kind === kind && inScope(e) && (name === undefined || e.playerName === name)).length;
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        const rows = volleyballTally(s.events, sd, scope).map((l) => withId({
          name: l.name,
          stats: { points: l.points, aces: l.aces, blocks: l.blocks, ...(outcomes ? { attackPoints: count(sd, 'attack', l.name) } : null) },
        }, roster));
        const oppErrors = count(sd, 'opperror') + count(sd, 'serveerror');
        const scoredKinds = ['point', 'attack', 'ace', 'block'];
        const scored = s.events.filter((e) => e.side === sd && inScope(e) && scoredKinds.includes(e.kind ?? '')).length;
        // the side's points no player earned: the opponent's errors (VB-07),
        // plus any point logged without a player
        const loose = s.events.filter((e) => e.side === sd && inScope(e) && !e.playerName && scoredKinds.includes(e.kind ?? ''));
        const looseOf = (k: string) => loose.filter((e) => e.kind === k).length;
        return {
          rows,
          team: {
            label: loose.length ? 'Team + opp. errors' : 'Opp. errors',
            stats: { points: oppErrors + loose.length, aces: looseOf('ace'), blocks: looseOf('block'), ...(outcomes ? { attackPoints: looseOf('attack') } : null) },
          },
          teamStats: {
            points: scored + oppErrors,
            ...(outcomes ? { attackPoints: count(sd, 'attack') } : null),
            aces: count(sd, 'ace'),
            blocks: count(sd, 'block'),
            ...(outcomes ? { oppErrors, serveErrors: count(other(sd), 'serveerror') } : null),
          },
        };
      };
      return { home: side('home'), away: side('away'), ...(outcomes ? null : { untracked: ['attackPoints', 'oppErrors', 'serveErrors'] }) };
    },
  };
}

/* ---------------------------------- kabaddi ---------------------------------- */

export const kabaddiPeriodName = (h: number): string => (h === 1 ? '1st half' : h === 2 ? '2nd half' : h === 3 ? 'ET 1' : 'ET 2');

export function kabaddiBox(s: KabaddiState, ctx: BoxContext = {}): MatchBoxSource {
  const periods = Array.from({ length: Math.max(1, s.half) }, (_, i) => ({ value: i + 1, label: kabaddiPeriodName(i + 1) }));
  return {
    periods,
    emptyText: 'No points yet.',
    data: (scope) => {
      const inScope = (e: LiveEvent) => !isShootoutEvent(e) && (scope === 'all' || e.half === scope);
      const pts = (sd: Side, kind: string) => s.events.filter((e) => e.side === sd && e.kind === kind && inScope(e)).reduce((a, e) => a + (e.points ?? 0), 0);
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        // raid / tackle points logged without a player
        const loose = (kind: string) => s.events.filter((e) => e.side === sd && e.kind === kind && !e.playerName && inScope(e)).reduce((a, e) => a + (e.points ?? 0), 0);
        return {
          rows: kabaddiTally(s.events, sd, scope).map((l) => withId({ name: l.name, stats: { raidPoints: l.raid, tacklePoints: l.tackle } }, roster)),
          team: { label: 'Team', stats: { raidPoints: loose('raid'), tacklePoints: loose('tackle') } },
          teamStats: {
            raidPoints: pts(sd, 'raid'),
            tacklePoints: pts(sd, 'tackle'),
            allOutPoints: pts(sd, 'allout'),
            raids: s.events.filter((e) => e.side === sd && e.kind === 'raid' && inScope(e)).length,
          },
        };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}

/* --------------------------------- football ---------------------------------- */

/** The comparison / box keys each "Stats captured" toggle covers (D8). */
const FOOTBALL_TRACK_KEYS: Record<keyof TrackConfig, string[]> = {
  shots: ['shots', 'shotsOnTarget', 'blockedShots'],
  possession: ['possession'],
  passes: ['passes', 'passAccuracy'],
  fouls: ['fouls'],
  cards: ['yellowCards', 'redCards'],
  offsides: ['offsides'],
  corners: ['corners'],
  tackles: ['tackles'],
  interceptions: ['interceptions'],
  saves: ['saves'],
  crosses: ['crosses'],
  dribbles: ['dribbles'],
  handball: ['handballs'],
  attackContribution: ['attackingContributions'],
  defenceContribution: ['defensiveContributions'],
};

export const footballPeriodName = (h: number): string => (h === 1 ? '1st half' : h === 2 ? '2nd half' : h === 3 ? 'ET 1' : 'ET 2');

/** Minutes on the pitch so far, by side + name (only sides with an XI stamp). */
function footballMinutes(s: FootballState, now: number): Map<string, number> {
  const out = new Map<string, number>();
  const live = !s.ended && s.startedAt;
  const upTo = live ? position(s, liveClockMinutes(s, now), s.half).reg : undefined;
  for (const p of trackField(footballFieldLog(s, 'reg', upTo)).players) {
    if (!p.played || !p.name || !s.xi?.[p.side]) continue;
    out.set(`${p.side}|${p.name}`, Math.round(p.minutes));
  }
  return out;
}

export function footballBox(s: FootballState, ctx: BoxContext = {}): MatchBoxSource {
  const periods = s.half >= 2 ? Array.from({ length: s.half }, (_, i) => ({ value: i + 1, label: footballPeriodName(i + 1) })) : [];
  const t = s.track;
  const untracked = (Object.keys(FOOTBALL_TRACK_KEYS) as (keyof TrackConfig)[]).filter((k) => t && !t[k]).flatMap((k) => FOOTBALL_TRACK_KEYS[k]);
  return {
    periods,
    emptyText: 'No players yet.',
    tickMs: s.startedAt ? 2000 : undefined,
    untrackedHint: 'turn on in Scoring settings (Info tab).',
    data: (scope) => {
      const now = ctx.now ?? Date.now();
      const inScope = (h?: number) => scope === 'all' || h === scope;
      const scoped = scope === 'all' ? s : { ...s, stats: s.stats.filter((e) => inScope(e.half)), events: s.events.filter((e) => inScope(e.half)) };
      const { totals, possession, passAcc } = footballStats(scoped, now);
      const minutes = scope === 'all' ? footballMinutes(s, now) : new Map<string, number>();
      const conceded = new Map<string, number>(); // keeper id → goals let in (whole match)
      if (scope === 'all') for (const [id, k] of Object.entries(keeperTotals(s))) conceded.set(`${k.side}|${id}`, k.stats.goalsConceded);
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        const rows = new Map<string, BoxRowInput>();
        const blank = (): Record<string, number> => ({
          goals: 0, assists: 0,
          ...(t?.shots !== false ? { shots: 0, shotsOnTarget: 0 } : null),
          ...(t?.saves !== false ? { saves: 0 } : null),
          ...(t?.fouls !== false ? { fouls: 0 } : null),
          ...(t?.cards !== false ? { yellowCards: 0, redCards: 0 } : null),
        });
        const row = (name: string, id?: string) => {
          let r = rows.get(name);
          if (!r) { r = { name, ...(id ? { playerId: id } : null), stats: blank() }; rows.set(name, r); }
          else if (id && !r.playerId) r.playerId = id;
          return r;
        };
        const bump = (r: BoxRowInput, k: string) => { if (k in r.stats) r.stats[k] += 1; };
        // starters first (the XI stamp), then subs as they came on
        const xi = s.xi?.[sd];
        for (const p of xi?.players ?? (xi?.gk ? [xi.gk] : [])) row(p.name, p.id).starter = true;
        for (const e of s.events) if (e.side === sd && e.type === 'sub' && e.secondName) row(e.secondName, e.secondId);
        for (const e of scoped.events) {
          if (e.side !== sd || !e.playerName) continue;
          if (e.type === 'goal') {
            const r = row(e.playerName);
            r.stats.goals += 1; bump(r, 'shots'); bump(r, 'shotsOnTarget'); // a goal is a shot on target
            if (e.secondName) row(e.secondName).stats.assists += 1;
          } else if (e.type === 'yellow') bump(row(e.playerName), 'yellowCards');
          else if (e.type === 'red') bump(row(e.playerName), 'redCards');
        }
        for (const e of scoped.stats) {
          if (e.side !== sd || !e.playerName) continue;
          if (e.kind === 'shot') { const r = row(e.playerName, e.playerId); bump(r, 'shots'); if (e.onTarget && !e.blocked) bump(r, 'shotsOnTarget'); }
          else if (e.kind === 'save') bump(row(e.playerName, e.playerId), 'saves');
          else if (e.kind === 'foul') bump(row(e.playerName, e.playerId), 'fouls');
        }
        for (const r of rows.values()) {
          const m = minutes.get(`${sd}|${r.name}`);
          if (m !== undefined) r.stats.minutes = m;
          const id = r.playerId ?? idIn(r.name, roster);
          const ga = id ? conceded.get(`${sd}|${id}`) : undefined;
          if (ga !== undefined) r.stats.goalsConceded = ga;
        }
        // the rest of the squad: the bench (listed on request)
        for (const p of roster) if (!rows.has(p.fullName)) rows.set(p.fullName, { name: p.fullName, playerId: p.id, stats: {}, dnp: true });
        const tt = totals[sd];
        return {
          rows: [...rows.values()].map((r) => withId(r, roster)),
          teamStats: {
            shots: tt.shots, shotsOnTarget: tt.shotsOnTarget, blockedShots: tt.blockedShots, possession: possession[sd],
            passes: tt.passes, passAccuracy: passAcc[sd], fouls: tt.fouls, yellowCards: tt.yellow, redCards: tt.red,
            offsides: tt.offsides, corners: tt.corners, tackles: tt.tackles, interceptions: tt.interceptions, saves: tt.saves,
            crosses: tt.crosses, dribbles: tt.dribbles, handballs: tt.handballs,
            attackingContributions: tt.attackContributions, defensiveContributions: tt.defenceContributions,
          },
        };
      };
      return { home: side('home'), away: side('away'), untracked };
    },
  };
}

/* ------------------------------ racket sports ------------------------------ */

/** Points (and tennis aces) per player from a point log; `periodOf` reads an
 *  event's game / set; `kinds` = the scoring kinds; `roster` players listed
 *  at 0 (the old PointBoxScore did, tennis / badminton didn't). */
export function pointTally(events: LiveEvent[], side: Side, opts: {
  scope?: BoxScope; periodOf: (e: LiveEvent) => number | undefined; kinds: string[]; roster?: Player[]; aces?: boolean;
}): { name: string; points: number; aces: number }[] {
  const byName = new Map<string, { name: string; points: number; aces: number }>();
  const ensure = (name: string) => (byName.get(name) ?? byName.set(name, { name, points: 0, aces: 0 }).get(name)!);
  (opts.roster ?? []).forEach((p) => ensure(p.fullName));
  for (const e of events) {
    if (e.side !== side || !e.playerName || !opts.kinds.includes(e.kind ?? '')) continue;
    if (opts.scope !== undefined && opts.scope !== 'all' && opts.periodOf(e) !== opts.scope) continue;
    const l = ensure(e.playerName);
    l.points += 1;
    if (e.kind === 'ace') l.aces += 1;
  }
  return [...byName.values()].sort((a, b) => b.points - a.points || (opts.aces ? b.aces - a.aces : 0));
}

function pointBox(events: LiveEvent[], ctx: BoxContext, periods: { value: number; label: string }[], o: {
  periodOf: (e: LiveEvent) => number | undefined; kinds: string[]; listRoster: boolean; aces?: boolean;
}): MatchBoxSource {
  return {
    periods,
    emptyText: 'No points yet.',
    data: (scope) => {
      const side = (sd: Side): BoxSideInput => {
        const roster = rosterOf(ctx, sd);
        return {
          rows: pointTally(events, sd, { scope, periodOf: o.periodOf, kinds: o.kinds, roster: o.listRoster ? roster : undefined, aces: o.aces })
            .map((l) => withId({ name: l.name, stats: { points: l.points, ...(o.aces ? { aces: l.aces } : null) } }, roster)),
        };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}

/** Table tennis / squash / pickleball (the rally engine): per game. */
export const rallyBox = (s: RallyState, ctx: BoxContext = {}): MatchBoxSource =>
  pointBox(s.events, ctx, numbered(Math.max(1, s.games.length + 1), 'Game'), { periodOf: (e) => e.game ?? e.set, kinds: ['point'], listRoster: true });

export const padelBox = (s: PadelState, ctx: BoxContext = {}): MatchBoxSource =>
  pointBox(s.events, ctx, numbered(Math.max(1, s.sets.length + 1), 'Set'), { periodOf: (e) => e.game ?? e.set, kinds: ['point'], listRoster: true });

export function tennisBox(s: TennisState, ctx: BoxContext = {}): MatchBoxSource {
  const currentSet = s.setsWon.home + s.setsWon.away + 1;
  return pointBox(s.events, ctx, numbered(s.ended ? s.sets.length : currentSet, 'Set'), { periodOf: (e) => e.set, kinds: ['point', 'ace'], listRoster: false, aces: true });
}

export function badmintonBox(s: BadmintonState, ctx: BoxContext = {}): MatchBoxSource {
  return pointBox(s.events, ctx, numbered(s.ended ? s.games.length : s.games.length + 1, 'Game'), { periodOf: (e) => e.game, kinds: ['point'], listRoster: false });
}

/* ---------------------------------- carrom ---------------------------------- */

/** Carrom boards aren't credited to a player in the state: a team comparison
 *  (points, boards, queens) per game, no player table. */
export function carromBox(s: CarromState): MatchBoxSource {
  const games = Math.max(1, s.games.length + (s.ended ? 0 : 1), ...s.boards.map((b) => b.game));
  return {
    periods: numbered(games, 'Game'),
    players: false,
    data: (scope) => {
      const side = (sd: Side): BoxSideInput => {
        const won = s.boards.filter((b) => b.winner === sd && (scope === 'all' || b.game === scope));
        return { rows: [], teamStats: { points: won.reduce((a, b) => a + b.points, 0), boards: won.length, queens: won.filter((b) => b.queen).length } };
      };
      return { home: side('home'), away: side('away') };
    },
  };
}

/* --------------------------------- registry --------------------------------- */

/** The box score source for a sport's match state (undefined = none: cricket
 *  keeps its innings scorecard, chess and golf have no box). */
export function matchBoxSource(sport: SportId, state: unknown, ctx: BoxContext = {}): MatchBoxSource | undefined {
  if (!state || typeof state !== 'object') return undefined;
  switch (sport) {
    case 'basketball': return basketballBox(state as BasketballState, ctx);
    case 'volleyball': return volleyballBox(state as VolleyballState, ctx);
    case 'kabaddi': return kabaddiBox(state as KabaddiState, ctx);
    case 'football': return footballBox(state as FootballState, ctx);
    case 'tennis': return tennisBox(state as TennisState, ctx);
    case 'badminton': return badmintonBox(state as BadmintonState, ctx);
    case 'padel': return padelBox(state as PadelState, ctx);
    case 'tabletennis': case 'squash': case 'pickleball': return rallyBox(state as RallyState, ctx);
    case 'carrom': return carromBox(state as CarromState);
    default: return undefined;
  }
}
