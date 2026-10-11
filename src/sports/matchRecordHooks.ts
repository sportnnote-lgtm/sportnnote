/**
 * SD-51 (GEN-21 / CK-07) — each sport's `matchRecords(state)` hook: the record
 * candidates of ONE finished match, derived from its final state only (no
 * reducer change; an old log replays to the same records). The registry sets
 * them on the plugins (`plugin.matchRecords`); the record types and the shared
 * set/game-sport helper live in matchRecords.ts.
 *
 * PURE (no React Native): node tests load it — note the `.ts` imports.
 * The results-engine sports and golf STROKE play have no hook (they keep
 * their own records); carrom and golf match play joined in SD-137a.
 */
import type { SportId } from '../core/types';
import { block, scoreItems, otherSide, setSportRecords, type MatchRecordItem, type MatchRecordsBlock, type Side } from './matchRecords.ts';
import { outcome, oversStr, type CricketState } from './cricket/engine.ts';
import { partnerships, hasLog } from './cricket/scorecard.ts';
import { minuteText, type FootballState } from './football/engine.ts';
import type { HockeyState } from './hockey/engine.ts';
import type { HandballState } from './handball/engine.ts';
import { iceHockeyMatchRecords } from './ice_hockey/records.ts';
import { netballMatchRecords } from './netball/records.ts';
import { minuteText as rugbyMinute, pointsOf as rugbyPoints, type RugbyState } from './rugby/engine.ts';
import type { BasketballState } from './basketball/engine.ts';
import { eventCredits } from './basketball/credits.ts';
import { shotsTracked } from './basketball/totals.ts';
import type { KabaddiState } from './kabaddi/engine.ts';
import { kabaddiTotals } from './kabaddi/totals.ts';
import { METHOD_LABEL, isForfeit, isDoubleForfeit, type ChessState } from './chess/engine.ts';
import { lineScore as tennisLine, type TennisState } from './tennis/engine.ts';
import { lineScore as padelLine, type PadelState } from './padel/engine.ts';
import { lineScore as badmintonLine, type BadmintonState } from './badminton/engine.ts';
import { lineScore as volleyballLine, type VolleyballState } from './volleyball/engine.ts';
import { rallyLineScore, type RallyState } from './rallyEngine.ts';
import type { CarromState } from './carrom/engine.ts';
import { matchState as golfMatchState } from './golf/engine.ts';
import type { GolfMatchState } from './golf/match.ts';
import { matchHole } from './golf/matchStrokes.ts';

const ordinal = (n: number): string => {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suf}`;
};

/** The best `n` of a list by value (desc). */
const topN = <T extends { value: number }>(xs: T[], n: number): T[] => [...xs].sort((a, b) => b.value - a.value).slice(0, n);

/* ------------------------------------------------------------- cricket -- */

/**
 * Cricket (CK-07): each side's innings total (highest; lowest only for an
 * innings that ran its course — the side batting first, or a chase that fell
 * short), the top 3 partnerships per side (with the wicket and both batters;
 * needs the replayed ball log, so a log-less snapshot has none), the top 3
 * individual innings and bowling figures per side (they link to the match's
 * stat lines), and the margin of victory (runs or wickets). A Super Over is
 * never part of a record; a match a Super Over decided has no margin.
 */
export function cricketMatchRecords(s: CricketState): MatchRecordsBlock | null {
  if (!s || !s.scores || !s.ended) return null;
  const bpo = s.ballsPerOver || 6;
  const items: MatchRecordItem[] = [];
  const chase: Side = s.innings === 2 ? s.battingSide : otherSide(s.battingSide);
  const first = otherSide(chase);
  const allOut = (side: Side) => s.scores[side].wickets >= s.wicketsLimit || !!s.closedNoBatter?.[side];
  const totalText = (side: Side) => {
    const inn = s.scores[side];
    return `${inn.runs}${allOut(side) ? '' : `/${inn.wickets}`} (${oversStr(inn.balls, bpo)} ov)`;
  };
  for (const side of [first, chase] as Side[]) {
    const inn = s.scores[side];
    if (side === chase && s.innings !== 2) continue; // never batted
    if (!inn.balls && !inn.runs) continue;
    items.push({ type: 'teamHigh', value: inn.runs, text: totalText(side), side });
    const ranItsCourse = side === first || s.target === undefined || inn.runs < s.target;
    if (ranItsCourse) items.push({ type: 'teamLow', value: inn.runs, text: totalText(side), side });
  }

  if (hasLog(s)) {
    for (const side of ['home', 'away'] as Side[]) {
      const ps = partnerships(s, side).filter((p) => p.runs > 0).map((p) => ({ p, value: p.runs * 1000 - p.balls }));
      for (const { p } of topN(ps, 3)) {
        items.push({
          type: 'partnership', value: p.runs, text: `${p.runs}${p.unbroken ? '*' : ''} (${p.balls})`, side,
          playerId: p.a.id, playerName: p.a.name, partnerId: p.b.id, partnerName: p.b.name, note: `${ordinal(p.wkt)} wkt`,
        });
      }
    }
  }

  for (const side of ['home', 'away'] as Side[]) {
    const bats = Object.entries(s.batting ?? {}).filter(([, c]) => c.side === side && (c.runs > 0 || c.balls > 0))
      .map(([id, c]) => ({ id, c, value: c.runs * 10 + (c.out ? 0 : 1) }));
    for (const { id, c, value } of topN(bats, 3)) {
      items.push({ type: 'bestInnings', value, text: `${c.runs}${c.out ? '' : '*'} (${c.balls})`, side, playerId: id, playerName: c.name });
    }
    const bowls = Object.entries(s.bowling ?? {}).filter(([, c]) => c.side === side && c.wickets > 0)
      .map(([id, c]) => ({ id, c, value: c.wickets * 1000 - c.runs }));
    for (const { id, c, value } of topN(bowls, 3)) {
      items.push({ type: 'bestBowling', value, text: `${c.wickets}/${c.runs}`, note: `${oversStr(c.balls, bpo)} ov`, side, playerId: id, playerName: c.name });
    }
  }

  if (s.innings === 2 && !s.superOver) {
    const o = outcome(s);
    const m = /^Won by (\d+) (run|wkt)s?(.*)$/.exec(o.text);
    if (o.winner && m) {
      const n = Number(m[1]);
      const tag = m[3] ?? '';
      if (m[2] === 'run') {
        items.push({ type: 'marginRuns', value: n, text: `by ${n} run${n === 1 ? '' : 's'}${tag}`, side: o.winner });
      } else {
        const sched = (s.inn2Overs ?? s.oversLimit) * bpo;
        const left = Math.max(0, sched - s.scores[chase].balls);
        items.push({ type: 'marginWkts', value: n * 1000 + left, text: `by ${n} wkt${n === 1 ? '' : 's'}${left ? ` (${left} ball${left === 1 ? '' : 's'} left)` : ''}${tag}`, side: o.winner });
      }
    }
  }
  return block(items);
}

/* ------------------------------------------------ goal sports (events) -- */

interface GoalLike { side: Side; playerId?: string; playerName?: string; at: number; atText: string }

function goalRecords(home: number, away: number, goals: GoalLike[], hatTricks: boolean): MatchRecordsBlock | null {
  const items = scoreItems(home, away, { mostGoals: true, biggestWin: true });
  const first = [...goals].sort((a, b) => a.at - b.at)[0];
  if (first && (first.playerId || first.playerName)) {
    items.push({ type: 'fastestGoal', value: first.at, text: first.atText, side: first.side, playerId: first.playerId, playerName: first.playerName });
  }
  const by = new Map<string, { g: GoalLike; n: number }>();
  for (const g of goals) {
    if (!g.playerId && !g.playerName) continue;
    const k = `${g.side}|${g.playerId ?? `n:${g.playerName}`}`;
    const cur = by.get(k);
    if (cur) cur.n += 1; else by.set(k, { g, n: 1 });
  }
  const scorers = [...by.values()];
  if (hatTricks) {
    for (const { g, n } of scorers) if (n >= 3) items.push({ type: 'hatTrick', value: n, text: `${n} goals`, side: g.side, playerId: g.playerId, playerName: g.playerName });
  } else {
    for (const { g, n } of topN(scorers.map((x) => ({ ...x, value: x.n })), 3)) {
      items.push({ type: 'playerGoals', value: n, text: `${n} goal${n === 1 ? '' : 's'}`, side: g.side, playerId: g.playerId, playerName: g.playerName });
    }
  }
  return block(items);
}

/** Football: biggest win, most goals, the match's first goal (own goals don't
 *  count as anyone's), hat-tricks. Shootout kicks are never goals here. */
export function footballMatchRecords(s: FootballState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const f = { halfMinutes: s.halfMinutes || 45, etMinutes: s.etMinutes || 15 };
  const goals: GoalLike[] = (s.events ?? []).filter((e) => e.type === 'goal').map((e) => ({
    side: e.side, playerId: e.playerId, playerName: e.playerName, at: Number(e.minute) || 0, atText: minuteText(Number(e.minute) || 0, e.half, f),
  }));
  return goalRecords(s.home, s.away, goals, true);
}

const clockMinute = (sec: number) => `${Math.floor(Math.max(0, sec) / 60) + 1}'`;

/** Hockey: as football (penalty-corner and stroke goals included). */
export function hockeyMatchRecords(s: HockeyState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const goals: GoalLike[] = (s.events ?? []).filter((e) => e.type === 'goal').map((e) => ({
    side: e.side, playerId: e.playerId, playerName: e.playerName, at: Number(e.sec) || 0, atText: clockMinute(Number(e.sec) || 0),
  }));
  return goalRecords(s.home, s.away, goals, true);
}

/** Handball: a hat-trick is routine, so the record is the most goals by one player. */
export function handballMatchRecords(s: HandballState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const goals: GoalLike[] = (s.events ?? []).filter((e) => e.type === 'goal').map((e) => ({
    side: e.side, playerId: e.playerId, playerName: e.playerName, at: Number(e.sec) || 0, atText: clockMinute(Number(e.sec) || 0),
  }));
  return goalRecords(s.home, s.away, goals, false);
}

/** SD-143 — rugby: team high, biggest win, most points in a match, the
 *  first try, try hat-tricks, and each side's top 2 points scorers (penalty
 *  tries are the team's, never a player's). */
export function rugbyMatchRecords(s: RugbyState): MatchRecordsBlock | null {
  if (!s || !s.ended || !Array.isArray(s.events)) return null;
  const items = scoreItems(s.home, s.away, { teamHigh: true, mostGoals: true, biggestWin: true });
  const tries = s.events.filter((e) => e.type === 'try');
  const first = [...tries].sort((a, b) => a.period - b.period || a.psec - b.psec)[0];
  if (first && (first.playerId || first.playerName)) {
    items.push({ type: 'fastestTry', value: first.sec, text: rugbyMinute(s, first.period, first.psec), side: first.side, playerId: first.playerId, playerName: first.playerName });
  }
  const lines = new Map<string, { side: Side; id?: string; name?: string; tries: number; points: number }>();
  for (const e of s.events) {
    if (e.type === 'pentry' || (!e.playerId && !e.playerName) || e.official) continue;
    const pts = rugbyPoints(e);
    if (!pts) continue;
    const k = `${e.side}|${e.playerId ?? `n:${e.playerName}`}`;
    const l = lines.get(k) ?? { side: e.side, id: e.playerId, name: e.playerName, tries: 0, points: 0 };
    l.points += pts;
    if (e.type === 'try') l.tries += 1;
    lines.set(k, l);
  }
  for (const l of lines.values()) {
    if (l.tries >= 3) items.push({ type: 'tryHatTrick', value: l.tries, text: `${l.tries} tries`, side: l.side, playerId: l.id, playerName: l.name });
  }
  for (const side of ['home', 'away'] as Side[]) {
    for (const l of topN([...lines.values()].filter((x) => x.side === side).map((x) => ({ ...x, value: x.points })), 2)) {
      items.push({ type: 'playerPoints', value: l.points, text: `${l.points} pts`, side, playerId: l.id, playerName: l.name });
    }
  }
  return block(items);
}

/* ---------------------------------------------------------- basketball -- */

/** Basketball: team high, biggest win, each side's top 2 scorers, 30-point
 *  games (40+ marked), triple-doubles (10+ in three of PTS / REB / AST / STL /
 *  BLK — only what the scorer logged). Players by id where the log names one. */
export function basketballMatchRecords(s: BasketballState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const items = scoreItems(s.home, s.away, { teamHigh: true, biggestWin: true });
  const halfCourt = s.targetPoints > 0;
  const tracked = shotsTracked(s);
  const lines = new Map<string, { side: Side; name: string; id?: string; st: Record<string, number> }>();
  for (const e of s.events ?? []) {
    if (!e.playerName) continue;
    const c = eventCredits(e, halfCourt, tracked);
    if (!Object.keys(c).length) continue;
    const id = s.ids?.[e.playerName];
    const k = `${e.side}|${id ?? `n:${e.playerName}`}`;
    const l = lines.get(k) ?? { side: e.side, name: e.playerName, id, st: {} };
    for (const [key, v] of Object.entries(c)) l.st[key] = (l.st[key] ?? 0) + v;
    lines.set(k, l);
  }
  const all = [...lines.values()];
  for (const side of ['home', 'away'] as Side[]) {
    for (const l of topN(all.filter((x) => x.side === side && (x.st.points ?? 0) > 0).map((x) => ({ ...x, value: x.st.points ?? 0 })), 2)) {
      items.push({ type: 'playerHigh', value: l.value, text: `${l.value} pts`, side, playerId: l.id, playerName: l.name });
    }
  }
  const CATS: [string, string][] = [['points', 'pts'], ['rebounds', 'reb'], ['assists', 'ast'], ['steals', 'stl'], ['blocks', 'blk']];
  for (const l of all) {
    const pts = l.st.points ?? 0;
    if (pts >= 30) items.push({ type: 'bigGame', value: pts, text: `${pts} pts${pts >= 40 ? ' · 40+' : ''}`, side: l.side, playerId: l.id, playerName: l.name });
    const tens = CATS.filter(([k]) => (l.st[k] ?? 0) >= 10);
    if (tens.length >= 3) {
      items.push({ type: 'tripleDouble', value: pts, text: tens.map(([k, u]) => `${l.st[k]} ${u}`).join(' · '), side: l.side, playerId: l.id, playerName: l.name });
    }
  }
  return block(items);
}

/* -------------------------------------------------------------- kabaddi -- */

/** Kabaddi: team high, biggest win (regulation score; a shootout decides but
 *  isn't a margin), each side's top 2 raiders, Super 10s (10+ raid points) and
 *  High 5s (5+ tackle points), from the raid replay's absolute totals. */
export function kabaddiMatchRecords(s: KabaddiState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const items = scoreItems(s.home, s.away, { teamHigh: true, biggestWin: true });
  let totals: ReturnType<typeof kabaddiTotals> = {};
  try { totals = kabaddiTotals(s); } catch { totals = {}; }
  const names = new Map<string, string>();
  for (const r of s.raids ?? []) {
    if (r.raiderId && r.raider) names.set(r.raiderId, r.raider);
    if (r.tacklerId && r.tackler) names.set(r.tacklerId, r.tackler);
  }
  const rows = Object.entries(totals).map(([id, t]) => ({ id, side: t.side, rp: t.stats.raidPoints ?? 0, tp: t.stats.tacklePoints ?? 0 }));
  for (const side of ['home', 'away'] as Side[]) {
    for (const r of topN(rows.filter((x) => x.side === side && x.rp > 0).map((x) => ({ ...x, value: x.rp })), 2)) {
      items.push({ type: 'raidPoints', value: r.rp, text: `${r.rp} raid pts`, side, playerId: r.id, playerName: names.get(r.id) });
    }
  }
  for (const r of rows) {
    if (r.rp >= 10) items.push({ type: 'super10', value: r.rp, text: `${r.rp} raid pts`, side: r.side, playerId: r.id, playerName: names.get(r.id) });
    if (r.tp >= 5) items.push({ type: 'high5', value: r.tp, text: `${r.tp} tackle pts`, side: r.side, playerId: r.id, playerName: names.get(r.id) });
  }
  return block(items);
}

/* ---------------------------------------------------------------- chess -- */

/** Chess: the winner's move count, when the scorer entered one (a forfeit has none). */
export function chessMatchRecords(s: ChessState): MatchRecordsBlock | null {
  if (!s || !s.ended || (s.winner !== 'home' && s.winner !== 'away')) return null;
  if (!s.moves || s.moves <= 0 || isForfeit(s.method) || isDoubleForfeit(s.method)) return null;
  const how = s.method ? METHOD_LABEL[s.method] : undefined;
  return block([{ type: 'fastestWin', value: s.moves, text: `${s.moves} moves`, side: s.winner, ...(how ? { note: how } : {}) }]);
}

/* --------------------------------------------------------------- carrom -- */

/**
 * SD-137a — carrom: each game's winning margin ("25–3", game 2; margin, then
 * the winner's points), the longest run of boards won in a row by one side
 * (penalty boards break a run and never count as won), and every slam (white
 * / black, the game and board). The board winner's credited player(s) name
 * the run / slam when the scorer picked them.
 */
export function carromMatchRecords(s: CarromState): MatchRecordsBlock | null {
  if (!s || !s.ended) return null;
  const items: MatchRecordItem[] = [];
  (s.games ?? []).forEach(([h, a], i) => {
    if (h === a) return;
    const w: Side = h > a ? 'home' : 'away';
    items.push({ type: 'biggestWin', value: Math.abs(h - a) * 1000 + Math.max(h, a), text: w === 'home' ? `${h}–${a}` : `${a}–${h}`, side: w, note: `game ${i + 1}` });
  });
  const who = (i: number) => {
    const c = s.boardBy?.[i]?.[0];
    return c ? { ...(c.id ? { playerId: c.id } : {}), ...(c.name ? { playerName: c.name } : {}) } : {};
  };
  let best: { side: Side; n: number; at: number } | null = null;
  let run: { side: Side; n: number; at: number } | null = null;
  (s.boards ?? []).forEach((b, i) => {
    if (b.penalty) { run = null; return; }
    run = run && run.side === b.winner ? { ...run, n: run.n + 1 } : { side: b.winner, n: 1, at: i };
    if (!best || run.n > best.n) best = { ...run };
    if (b.slam) items.push({ type: 'slam', value: 1, text: `${b.slam === 'white' ? 'White' : 'Black'} slam`, side: b.winner, note: `game ${b.game}`, ...who(i) });
  });
  const top = best as { side: Side; n: number; at: number } | null;
  if (top && top.n >= 2) items.push({ type: 'boardRun', value: top.n, text: `${top.n} boards`, side: top.side });
  return block(items);
}

/* ------------------------------------------------------ golf match play -- */

/**
 * SD-137a — golf match play: the winning margin ("5&4"; holes up, then holes
 * to spare — a conceded or halved match has none), each side's holes won,
 * and birdies or better when the hole scores were entered (with handicap
 * strokes set up). Stroke play is scored on the round screens and keeps its
 * own records.
 */
export function golfMatchRecords(s: GolfMatchState): MatchRecordsBlock | null {
  if (!s || !s.ended || !Array.isArray(s.holes)) return null;
  const items: MatchRecordItem[] = [];
  const m = golfMatchState(s.holes, s.regulation, s.extraHoles, s.firstHole ?? 1);
  if (!s.conceded && (m.winner === 'home' || m.winner === 'away') && m.result) {
    items.push({ type: 'biggestMargin', value: Math.abs(m.up) * 100 + m.remaining, text: m.result, side: m.winner });
  }
  const counted = s.holes.slice(0, m.played);
  for (const side of ['home', 'away'] as Side[]) {
    const n = counted.filter((w) => w === side).length;
    if (n > 0) items.push({ type: 'holesWon', value: n, text: `${n} hole${n === 1 ? '' : 's'}`, side });
  }
  const ms = s.strokes;
  if (s.scores && ms?.holes?.length) {
    for (const side of ['home', 'away'] as Side[]) {
      const n = s.scores.slice(0, m.played).filter((sc, i) => sc && sc[side] < matchHole(ms, i).hole.par).length;
      if (n > 0) items.push({ type: 'birdies', value: n, text: `${n} birdie${n === 1 ? '' : 's'} or better`, side });
    }
  }
  return block(items);
}

/* ------------------------------------------------------ set / game sports -- */

export const tennisMatchRecords = (s: TennisState) => setSportRecords(tennisLine(s), s?.events, { tiebreaks: true });
export const padelMatchRecords = (s: PadelState) => setSportRecords(padelLine(s), s?.events, { tiebreaks: true });
export const badmintonMatchRecords = (s: BadmintonState) => setSportRecords(badmintonLine(s), s?.events, { tiebreaks: false });
export const volleyballMatchRecords = (s: VolleyballState) => setSportRecords(volleyballLine(s), s?.events, { tiebreaks: false });
export const rallyMatchRecords = (s: RallyState) => setSportRecords(rallyLineScore(s), s?.events, { tiebreaks: false });

/** The hook per sport (the registry sets `plugin.matchRecords` from this). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MATCH_RECORD_HOOKS: Partial<Record<SportId, (state: any) => MatchRecordsBlock | null>> = {
  cricket: cricketMatchRecords,
  football: footballMatchRecords,
  hockey: hockeyMatchRecords,
  handball: handballMatchRecords,
  ice_hockey: iceHockeyMatchRecords,
  netball: netballMatchRecords,
  rugby: rugbyMatchRecords,
  basketball: basketballMatchRecords,
  kabaddi: kabaddiMatchRecords,
  chess: chessMatchRecords,
  tennis: tennisMatchRecords,
  padel: padelMatchRecords,
  badminton: badmintonMatchRecords,
  volleyball: volleyballMatchRecords,
  tabletennis: rallyMatchRecords,
  squash: rallyMatchRecords,
  pickleball: rallyMatchRecords,
  carrom: carromMatchRecords,
  golf: golfMatchRecords,
};
