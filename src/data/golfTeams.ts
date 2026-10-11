/**
 * SD-76 (GF-07) — golf team stroke play, best N of M. PURE (tests in
 * tests/golf-handicap-team-match.test.mts).
 *
 * Each player's entry carries the team it scores for (`field_entries.team_id`,
 * migration 0051 — no new migration). The round's format holds the team rule:
 *
 *   format.team = { count: N, basis: 'gross' | 'net', mode: 'round' | 'hole' }
 *
 *   • mode 'round' (the inter-school / Eisenhower Trophy shape): each round the
 *     team's best N members' round scores count; the rest are discarded.
 *   • mode 'hole' (best ball): on every hole the best N members' scores count.
 *
 * Stroke play compares to par (gross or net, over the holes played — so a team
 * mid-round compares fairly); Stableford adds points (higher wins). A team with
 * fewer than N scores in a round (or, best-ball, on a hole) can't return a
 * score and is listed below the ranked teams.
 *
 * Ties (once every counting card is complete): the non-counting score(s) of the
 * final round, best first, then of the rounds before it (the World Amateur
 * Team Championships rule); then the counting cards' last 9 / 6 / 3 / 1 holes
 * of the final round; otherwise the place is shared ("T2").
 */
import type { FieldEntry, FieldEvent, GolfCourse } from '../core/types.ts';
import { summarize, type GolfCard, type Hole } from '../sports/golf/engine.ts';
import { sharedPositions } from './results/positions.ts';
import { golfFormatOf, roundContext, cardOf, entryStatusOf } from './golfLeaderboard.ts';

export interface GolfTeamFormat {
  /** best N scores count */
  count: number;
  basis: 'gross' | 'net';
  mode: 'round' | 'hole';
}

/** The round's team rule, or null for an individual-only round. */
export function golfTeamFormatOf(ev: Pick<FieldEvent, 'format'>): GolfTeamFormat | null {
  const t = (ev.format ?? {}).team as Record<string, unknown> | undefined;
  if (!t || typeof t !== 'object') return null;
  const n = Number(t.count);
  if (!Number.isInteger(n) || n < 1 || n > 10) return null;
  return { count: n, basis: t.basis === 'net' ? 'net' : 'gross', mode: t.mode === 'hole' ? 'hole' : 'round' };
}

export interface TeamRoundCell {
  /** the team's score for the round (to par, or points); null = can't return one yet */
  total: number | null;
  /** player ids whose score counts / is discarded (round mode) */
  counted: string[];
  discarded: string[];
  /** every counting card is complete */
  complete: boolean;
  /** holes the round has been scored through (best ball: holes with N scores) */
  thru: number;
  holes: number;
}

export interface TeamRow {
  teamId: string;
  position: number | null;
  /** "1", "T2", "–" */
  positionLabel: string;
  total: number;
  /** per round in round order (null = the team wasn't in that round) */
  rounds: (TeamRoundCell | null)[];
  members: string[];
  /** each member's score in the latest round (null = none), for the drill-down */
  memberScores: Map<string, number | null>;
  /** a round without N scores — listed below the ranked teams */
  short: boolean;
}

interface Member {
  playerId: string;
  card: GolfCard;
  holes: Hole[];
  received: number[];
  /** round value: to par (gross / net) or points; null = no score */
  value: number | null;
  complete: boolean;
  /** nothing more will be scored: every hole entered, or out (WD / DQ / DNS) */
  done: boolean;
}

const out = (en: FieldEntry) => {
  const s = entryStatusOf(en);
  return s === 'wd' || s === 'dq' || s === 'dns' || s === 'dnf';
};

/** Per-hole values for best ball: to par (gross / net) or Stableford points. */
function holeValue(m: Member, i: number, stableford: boolean, net: boolean): number | null {
  const s = m.card.strokes[i];
  if (s == null) return null;
  const h = m.holes[i];
  const r = net ? m.received[i] ?? 0 : 0;
  if (stableford) return s === 'P' ? 0 : Math.max(0, 2 + h.par + (m.received[i] ?? 0) - s);
  if (s === 'P') return null;
  return s - r - h.par;
}

function roundCell(members: Member[], fmt: GolfTeamFormat, stableford: boolean): TeamRoundCell {
  const better = (a: number, b: number) => (stableford ? b - a : a - b);
  const holes = members[0]?.holes.length ?? 0;
  if (fmt.mode === 'hole') {
    const net = fmt.basis === 'net';
    let total = 0, thru = 0;
    let missing = false;
    for (let i = 0; i < holes; i++) {
      const vals = members.map((m) => holeValue(m, i, stableford, net)).filter((v): v is number => v != null).sort(better);
      if (vals.length < fmt.count) { missing = true; continue; }
      thru += 1;
      total += vals.slice(0, fmt.count).reduce((t, v) => t + v, 0);
    }
    const complete = thru === holes && holes > 0;
    // A finished hole without N scores (pick-ups / withdrawals) can't be
    // returned: the team has no score once every member's card is done.
    const allDone = members.every((m) => m.done);
    return { total: thru === 0 || (missing && allDone) ? null : total, counted: members.map((m) => m.playerId), discarded: [], complete, thru, holes };
  }
  const scored = members.filter((m) => m.value != null).sort((a, b) => better(a.value!, b.value!));
  const counted = scored.slice(0, fmt.count);
  const discarded = members.filter((m) => !counted.includes(m));
  if (counted.length < fmt.count) {
    return { total: null, counted: counted.map((m) => m.playerId), discarded: discarded.map((m) => m.playerId), complete: false, thru: 0, holes };
  }
  return {
    total: counted.reduce((t, m) => t + m.value!, 0),
    counted: counted.map((m) => m.playerId),
    discarded: discarded.map((m) => m.playerId),
    complete: counted.every((m) => m.complete),
    thru: Math.min(...counted.map((m) => summarize(m.card, m.holes, m.received).thru)),
    holes,
  };
}

/**
 * The team leaderboard across a round or a tournament's rounds. The LAST
 * round's format decides the team rule (and scoring); rounds without one are
 * skipped. Entries without a team are ignored here (they still play on the
 * individual board).
 */
export function buildTeamLeaderboard(events: FieldEvent[], entries: FieldEntry[], courses: GolfCourse[]): { format: GolfTeamFormat | null; rows: TeamRow[] } {
  const ordered = [...events].sort((a, b) => a.roundNo - b.roundNo);
  const last = ordered[ordered.length - 1];
  const fmt = last ? golfTeamFormatOf(last) : null;
  if (!fmt) return { format: null, rows: [] };
  const stableford = golfFormatOf(last).scoring === 'stableford';
  const net = fmt.basis === 'net';
  // members per team per round
  const perRound: Map<string, Member[]>[] = [];
  const teamIds = new Set<string>();
  for (const ev of ordered) {
    const course = courses.find((c) => c.id === golfFormatOf(ev).courseId);
    const m = new Map<string, Member[]>();
    perRound.push(m);
    if (!course || !golfTeamFormatOf(ev)) continue;
    for (const en of entries.filter((e) => e.eventId === ev.id && e.teamId)) {
      const ctx = roundContext(ev, course, en);
      const card = cardOf(en, ctx.holes.length);
      const s = summarize(card, ctx.holes, ctx.received);
      const noScore = out(en) || s.thru === 0 || (!stableford && s.noReturn);
      const value = noScore ? null : stableford ? s.stableford : net ? s.netToPar : s.toPar;
      const list = m.get(en.teamId!) ?? [];
      list.push({ playerId: en.playerId, card, holes: ctx.holes, received: ctx.received, value, complete: s.complete && !s.noReturn, done: out(en) || s.thru >= ctx.holes.length });
      m.set(en.teamId!, list);
      teamIds.add(en.teamId!);
    }
  }

  const better = stableford ? -1 : 1;
  const rows = [...teamIds].map((teamId) => {
    const rounds = perRound.map((m) => (m.has(teamId) ? roundCell(m.get(teamId)!, fmt, stableford) : null));
    const played = rounds.filter((r): r is TeamRoundCell => r != null);
    const short = played.some((r) => r.total == null);
    const total = played.reduce((t, r) => t + (r.total ?? 0), 0);
    const lastMembers = perRound[perRound.length - 1]?.get(teamId) ?? [];
    const lastCell = rounds[rounds.length - 1];
    // countback key, all "lower is better" after the direction multiplier
    const worst = Number.POSITIVE_INFINITY;
    const key: number[] = [];
    if (fmt.mode === 'round') {
      for (let ri = perRound.length - 1; ri >= 0; ri--) {
        const ms = perRound[ri].get(teamId) ?? [];
        const cell = rounds[ri];
        const disc = ms.filter((x) => cell?.discarded.includes(x.playerId)).map((x) => (x.value == null ? worst : better * x.value)).sort((a, b) => a - b);
        // up to (M − N) discards — pad so teams compare position by position
        for (let k = 0; k < Math.max(1, ms.length - fmt.count); k++) key.push(disc[k] ?? worst);
      }
    }
    const counting = lastMembers.filter((x) => lastCell?.counted.includes(x.playerId));
    const n = counting[0]?.holes.length ?? 0;
    for (const w of n >= 18 ? [9, 6, 3, 1] : [6, 3, 1].filter((x) => x <= n)) {
      const from = Math.max(0, n - w);
      let v = 0;
      if (fmt.mode === 'hole') {
        for (let i = from; i < n; i++) {
          const vals = lastMembers.map((m) => holeValue(m, i, stableford, net)).filter((x): x is number => x != null).sort((a, b) => better * (a - b));
          v += vals.slice(0, fmt.count).reduce((t, x) => t + x, 0);
        }
      } else {
        for (const m of counting) {
          const sum = summarize({ strokes: m.card.strokes.slice(from) }, m.holes.slice(from), m.received.slice(from));
          const ph = m.received.reduce((t, x) => t + x, 0);
          v += stableford ? sum.stableford : net ? sum.toPar - (ph * w) / n : sum.toPar;
        }
      }
      key.push(better * v);
    }
    const memberScores = new Map(lastMembers.map((m) => [m.playerId, m.value] as const));
    const members = [...new Set(perRound.flatMap((m) => (m.get(teamId) ?? []).map((x) => x.playerId)))];
    return { teamId, rounds, total, short, key, complete: played.every((r) => r.complete), memberScores, members };
  });

  const ranked = rows.filter((r) => !r.short);
  const others = rows.filter((r) => r.short);
  const incompleteTotals = new Set(ranked.filter((r) => !r.complete).map((r) => r.total));
  const useCb = (total: number) => !incompleteTotals.has(total);
  const cmpKey = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? Number.POSITIVE_INFINITY, y = b[i] ?? Number.POSITIVE_INFINITY;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };
  ranked.sort((a, b) => (a.total !== b.total ? better * (a.total - b.total) : useCb(a.total) ? cmpKey(a.key, b.key) : 0));
  const tied = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.total === b.total && (!useCb(a.total) || cmpKey(a.key, b.key) === 0);
  const places = sharedPositions(ranked, tied);
  const outRows: TeamRow[] = ranked.map((r, i) => ({
    teamId: r.teamId, position: places[i].position, positionLabel: `${places[i].tie ? 'T' : ''}${places[i].position}`,
    total: r.total, rounds: r.rounds, members: r.members, memberScores: r.memberScores, short: false,
  }));
  for (const r of others) outRows.push({ teamId: r.teamId, position: null, positionLabel: '–', total: r.total, rounds: r.rounds, members: r.members, memberScores: r.memberScores, short: true });
  return { format: fmt, rows: outRows };
}

/** "Best 3 of 4 · gross · per round" */
export function teamRuleLabel(fmt: GolfTeamFormat, teamSize?: number): string {
  return `Best ${fmt.count}${teamSize ? ` of ${teamSize}` : ''} ${fmt.mode === 'hole' ? 'on each hole (best ball)' : 'scores each round'} · ${fmt.basis}`;
}
