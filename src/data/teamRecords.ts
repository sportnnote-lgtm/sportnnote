/**
 * SD-46 (GEN-15) — a team page's stats and records, generic for every sport
 * through its stat schema (SD-15) and score unit. PURE (node tests load it);
 * the team page feeds it the matches of ONE sport (already filtered by the
 * tournament / season chips), the stat lines of those matches and who played
 * for the team in each.
 *
 *  - `teamPerGame`  — for / against / margin per game in the sport's unit
 *    ("Goals for per game 1.67"), and the unit's difference label ("Goal
 *    difference", "Set difference" …). Cricket keeps season NRR (SD-12).
 *  - `teamAverages` — per-game team figures from the schema's comparison keys
 *    (shots, rebounds, raid points…): each match's team total = the sum of its
 *    players' lines; a match that didn't track a key isn't a 0 (D8). Rates
 *    (FG%, FT%) are recomputed over all the team's lines.
 *  - `teamLeaders`  — the top team player per schema leader category, ranked
 *    by `rankPlayers` (its minimums and tie-breaks) over the team's lines.
 *  - `teamRecords`  — biggest win / heaviest defeat, highest (and for cricket
 *    lowest) total, longest winning / unbeaten run, current run, clean sheets
 *    and failed to score (goal sports).
 *  - `teamMatchFilters` / `filterTeamMatches` — the tournament / season chips.
 */
import type { Match, SportId, StatLine } from '../core/types';
import { labelCompact, statSchema } from '../sports/statSchemas.ts';
import { aggregateValue, hasKey, rankPlayers, statDefIn, trackedIn, type SportStatSchema } from '../sports/statSchema.ts';
import { scoreUnit, type ScoreUnit } from './standings.ts';
import { resultFor, type Leader, type Result } from './teamStats.ts';
import { withLineResults } from './leaderMinimums.ts';
import { seasonOf } from './lineContext.ts';

/* --------------------------------- unit --------------------------------- */

const UNIT_WORDS: Record<ScoreUnit, { word: string; one: string; diff: string; dp: number }> = {
  goals: { word: 'goals', one: 'goal', diff: 'Goal difference', dp: 2 },
  points: { word: 'points', one: 'point', diff: 'Point difference', dp: 1 },
  runs: { word: 'runs', one: 'run', diff: 'Run difference', dp: 1 },
  sets: { word: 'sets', one: 'set', diff: 'Set difference', dp: 2 },
  games: { word: 'games', one: 'game', diff: 'Game difference', dp: 2 },
};

/** What a sport's team score counts, and how its difference reads. */
export function teamUnit(sport: SportId): { unit: ScoreUnit; word: string; one: string; diffLabel: string; dp: number } {
  const u = (statSchema(sport)?.scoreUnit as ScoreUnit | undefined) ?? scoreUnit(sport);
  const w = UNIT_WORDS[u] ?? UNIT_WORDS.points;
  return { unit: u, word: w.word, one: w.one, diffLabel: w.diff, dp: w.dp };
}

const signedText = (n: number, dp = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(dp)}`;

/** A completed match this team played with a counted score (not NR / w/o). */
interface Played { m: Match; side: 'home' | 'away'; r: Result; f?: number; a?: number; opp: string }

function playedBy(teamId: string, matches: Match[]): Played[] {
  const out: (Played & { i: number })[] = [];
  matches.forEach((m, i) => {
    const r = resultFor(m, teamId);
    if (!r) return;
    const side = m.homeTeam.id === teamId ? 'home' : 'away';
    const scored = r !== 'NR' && !m.walkover && !!m.score;
    out.push({
      i, m, side, r, opp: (side === 'home' ? m.awayTeam : m.homeTeam).name,
      ...(scored ? { f: side === 'home' ? m.score!.home : m.score!.away, a: side === 'home' ? m.score!.away : m.score!.home } : {}),
    });
  });
  // oldest → newest (runs read forwards); same kick-off time → the later in
  // the list is the older, as the team page's form strip reads it
  return out.sort((x, y) => x.m.startsAt.localeCompare(y.m.startsAt) || y.i - x.i);
}

/* ------------------------------- per game ------------------------------- */

export interface TeamPerGame {
  /** matches with a counted score */
  games: number;
  forPg: string; againstPg: string; marginPg: string;
  diff: string; diffLabel: string;
  /** "goals", "sets"… */
  word: string;
}

/** For / against / margin per game and the total difference, in the sport's
 *  unit. Undefined when no match has a counted score. */
export function teamPerGame(sport: SportId, teamId: string, matches: Match[]): TeamPerGame | undefined {
  const ps = playedBy(teamId, matches).filter((p) => p.f !== undefined);
  if (!ps.length) return undefined;
  const u = teamUnit(sport);
  const f = ps.reduce((s, p) => s + p.f!, 0);
  const a = ps.reduce((s, p) => s + p.a!, 0);
  const n = ps.length;
  return {
    games: n, forPg: (f / n).toFixed(u.dp), againstPg: (a / n).toFixed(u.dp), marginPg: signedText((f - a) / n, u.dp),
    diff: signedText(f - a), diffLabel: u.diffLabel, word: u.word,
  };
}

/* -------------------------------- averages -------------------------------- */

export interface TeamAverage {
  key: string; label: string; abbr?: string;
  /** "12.3" per game, or "45%" for a rate */
  value: string;
  /** a rate over all the team's lines, not a per-game figure */
  rate?: boolean;
  /** matches that tracked it, of the matches with lines */
  games: number; of: number;
}

/** The team's lines in its matches (only players who played for it). */
const teamLinesOf = (matchIds: Set<string>, lines: StatLine[], playedFor: Record<string, string[]>) =>
  lines.filter((l) => matchIds.has(l.matchId) && (playedFor[l.matchId] ?? []).includes(l.playerId));

/** Per-game team averages from the schema's comparison keys (and, for a sport
 *  without `compare`, its headline stats). At most `limit`. */
export function teamAverages(
  sport: SportId, teamId: string, matches: Match[], lines: StatLine[], playedFor: Record<string, string[]>, limit = 9,
): TeamAverage[] {
  const schema = statSchema(sport);
  if (!schema) return [];
  const done = playedBy(teamId, matches).filter((p) => p.r !== 'NR');
  const ids = new Set(done.map((p) => p.m.id));
  const mine = teamLinesOf(ids, lines, playedFor);
  const byMatch = new Map<string, StatLine[]>();
  for (const l of mine) (byMatch.get(l.matchId) ?? byMatch.set(l.matchId, []).get(l.matchId)!).push(l);
  const of = byMatch.size;
  if (!of) return [];
  const specs = schema.compare?.length
    ? schema.compare.map((c) => (typeof c === 'string' ? { key: c, label: undefined } : { key: c.key, label: c.label }))
    : schema.headline.map((key) => ({ key, label: undefined }));
  const out: TeamAverage[] = [];
  for (const { key, label: specLabel } of specs) {
    const def = statDefIn(schema, key);
    if (!def || def.source === 'team') continue; // lives in the match state, not on lines
    const label = specLabel ?? def.label;
    if (def.source === 'derived') {
      if (def.agg?.kind !== 'rate') continue;
      const v = aggregateValue(schema, def, mine);
      if (!v.tracked || v.value === undefined) continue;
      out.push({ key, label, abbr: def.abbr, value: v.text, rate: true, games: v.games, of });
    } else {
      // a match counts when a team line carries the key, or explicitly says it
      // was tracked (D8: a legacy line without a `tracked` list proves nothing)
      let total = 0, games = 0;
      for (const ls of byMatch.values()) {
        const counted = ls.some((l) => hasKey(l, key) || (l.tracked?.includes(key) && trackedIn(schema, l, key)));
        if (!counted) continue;
        games++;
        total += ls.reduce((s, l) => s + (Number(l.stats?.[key]) || 0), 0);
      }
      // nothing to average (no cards, no fouls) — not worth a tile
      if (!games || !total) continue;
      out.push({ key, label, abbr: def.abbr, value: (total / games).toFixed(1), games, of });
    }
    if (out.length >= limit) break;
  }
  return out;
}

/* --------------------------------- leaders --------------------------------- */

/** The team's top player per schema leader category (team lines only, the
 *  stat's minimum applies), skipping `skip` keys (already listed) and zeros.
 *  At most `limit`. */
export function teamLeaders(
  sport: SportId, teamId: string, matches: Match[], lines: StatLine[], playedFor: Record<string, string[]>,
  skip: Iterable<string> = [], limit = 6,
): Leader[] {
  const schema = statSchema(sport) as SportStatSchema<SportId> | undefined;
  if (!schema) return [];
  const done = playedBy(teamId, matches).map((p) => p.m);
  const ids = new Set(done.map((m) => m.id));
  const mine = withLineResults(teamLinesOf(ids, lines, playedFor).filter((l) => l.sport === sport), done);
  if (!mine.length) return [];
  const seen = new Set(skip);
  const out: Leader[] = [];
  for (const key of schema.leaders) {
    if (out.length >= limit) break;
    if (seen.has(key)) continue;
    const def = statDefIn(schema, key);
    if (!def) continue;
    seen.add(key);
    let top;
    try { top = rankPlayers(schema, def, mine, { limit: 1 })[0]; } catch { top = undefined; }
    if (!top || !top.value) continue;
    const unit = def.format?.unit;
    const plain = !unit || unit === 'count' || unit === 'minutes';
    const display = plain ? `${top.text} ${labelCompact(def.key, top.value, sport)}` : top.text;
    out.push({ icon: '🏅', label: def.leaderLabel ?? def.label, stat: def.key, playerId: top.playerId, total: top.value, display });
  }
  return out;
}

/* --------------------------------- records --------------------------------- */

export interface TeamRecord {
  key: string; label: string;
  /** the figure ("4–0", "6", "W3") */
  value: string;
  /** "vs Blue House · 12 Oct 2026" */
  detail?: string;
  matchId?: string;
}

const GOAL_SPORTS = new Set<string>(['football', 'hockey', 'handball']);
const DRAW_SPORTS = new Set<string>(['football', 'hockey', 'handball', 'kabaddi', 'chess']);

/** The team's records in these matches (one sport). `lineOf` adds the set /
 *  game line from the team's side ("6-4, 6-3"); `dayOf` formats a date. */
export function teamRecords(
  sport: SportId, teamId: string, matches: Match[],
  opts: { lineOf?: (m: Match) => string; dayOf?: (iso: string) => string } = {},
): TeamRecord[] {
  const ps = playedBy(teamId, matches);
  if (!ps.length) return [];
  const u = teamUnit(sport);
  const day = opts.dayOf ?? ((iso: string) => iso.slice(0, 10));
  const detail = (p: Played) => {
    let line = '';
    try { line = opts.lineOf?.(p.m) ?? ''; } catch { line = ''; }
    return [`vs ${p.opp}`, line, day(p.m.startsAt)].filter(Boolean).join(' · ');
  };
  const score = (p: Played) => `${p.f}–${p.a}`;
  const out: TeamRecord[] = [];
  const scored = ps.filter((p) => p.f !== undefined);
  // newest wins a level record (the latest time it happened)
  const pick = (xs: Played[], better: (x: Played, y: Played) => number) =>
    xs.reduce<Played | undefined>((b, x) => (!b || better(x, b) >= 0 ? x : b), undefined);

  // A cricket margin isn't the run difference (a chase wins by wickets) — its
  // records are the highest / lowest totals instead.
  if (sport !== 'cricket') {
    const win = pick(scored.filter((p) => p.r === 'W'), (x, y) => (x.f! - x.a!) - (y.f! - y.a!) || x.f! - y.f!);
    if (win) out.push({ key: 'biggestWin', label: 'Biggest win', value: score(win), detail: detail(win), matchId: win.m.id });
    const loss = pick(scored.filter((p) => p.r === 'L'), (x, y) => (x.a! - x.f!) - (y.a! - y.f!) || x.a! - y.a!);
    if (loss) out.push({ key: 'heaviestDefeat', label: 'Heaviest defeat', value: score(loss), detail: detail(loss), matchId: loss.m.id });
  }
  // a total means something in goals / points / runs, not in sets or games won
  if (u.unit === 'goals' || u.unit === 'points' || u.unit === 'runs') {
    const hi = pick(scored, (x, y) => x.f! - y.f!);
    if (hi) out.push({ key: 'highest', label: sport === 'cricket' ? 'Highest total' : `Most ${u.word} in a match`, value: String(hi.f), detail: detail(hi), matchId: hi.m.id });
    if (sport === 'cricket') {
      const lo = pick(scored, (x, y) => y.f! - x.f!);
      if (lo && lo !== hi) out.push({ key: 'lowest', label: 'Lowest total', value: String(lo.f), detail: detail(lo), matchId: lo.m.id });
    }
  }
  // runs, oldest → newest; a no result neither extends nor breaks a run
  let win = 0, bestWin = 0, unb = 0, bestUnb = 0;
  for (const p of ps) {
    if (p.r === 'NR') continue;
    win = p.r === 'W' ? win + 1 : 0;
    unb = p.r === 'L' ? 0 : unb + 1;
    bestWin = Math.max(bestWin, win); bestUnb = Math.max(bestUnb, unb);
  }
  if (bestWin >= 2) out.push({ key: 'winRun', label: 'Longest winning run', value: String(bestWin) });
  if (DRAW_SPORTS.has(sport) && bestUnb > bestWin && bestUnb >= 2) out.push({ key: 'unbeatenRun', label: 'Longest unbeaten run', value: String(bestUnb) });
  const decided = ps.filter((p) => p.r !== 'NR');
  if (decided.length >= 2) {
    const last = decided[decided.length - 1].r;
    let n = 0;
    for (let i = decided.length - 1; i >= 0 && decided[i].r === last; i--) n++;
    out.push({ key: 'currentRun', label: 'Current run', value: `${last}${n}` });
  }
  if (GOAL_SPORTS.has(sport) && scored.length) {
    out.push({ key: 'cleanSheets', label: 'Clean sheets', value: String(scored.filter((p) => p.a === 0).length) });
    out.push({ key: 'failedToScore', label: 'Failed to score', value: String(scored.filter((p) => p.f === 0).length) });
  }
  return out;
}

/* --------------------------------- filters --------------------------------- */

export interface TeamFilterValue { key: string; label: string; count: number }
export interface TeamMatchFilters { tournaments: TeamFilterValue[]; seasons: TeamFilterValue[] }
export interface TeamMatchSelection { tournament?: string; season?: string }

const FRIENDLY = 'friendly';

/** The tournament / season chips for a team's finished matches: a dimension is
 *  offered only with ≥ 2 values. Tournament names come from `nameOf`. */
export function teamMatchFilters(teamId: string, matches: Match[], nameOf: (tournamentId: string) => string | undefined = () => undefined): TeamMatchFilters {
  const ps = playedBy(teamId, matches);
  const tours = new Map<string, TeamFilterValue>();
  const seasons = new Map<string, TeamFilterValue>();
  for (const p of ps) {
    const tk = p.m.tournamentId ?? FRIENDLY;
    const t = tours.get(tk) ?? tours.set(tk, { key: tk, label: p.m.tournamentId ? nameOf(p.m.tournamentId) ?? 'Tournament' : 'Friendlies', count: 0 }).get(tk)!;
    t.count++;
    const s = seasonOf(p.m.startsAt);
    if (s) { const e = seasons.get(s.key) ?? seasons.set(s.key, { ...s, count: 0 }).get(s.key)!; e.count++; }
  }
  const tl = [...tours.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const sl = [...seasons.values()].sort((a, b) => b.key.localeCompare(a.key));
  return { tournaments: tl.length >= 2 ? tl : [], seasons: sl.length >= 2 ? sl : [] };
}

/** The matches a selection keeps (any match; unfinished ones pass the season
 *  test on their date too). */
export function filterTeamMatches(matches: Match[], sel: TeamMatchSelection): Match[] {
  return matches.filter((m) =>
    (!sel.tournament || (m.tournamentId ?? FRIENDLY) === sel.tournament) &&
    (!sel.season || seasonOf(m.startsAt)?.key === sel.season));
}
