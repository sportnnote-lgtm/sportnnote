/**
 * SD-138 — tournament history (founder 2026-10-11): what happened, and what is
 * happening, in every group and every knockout round, and one team's journey
 * through the whole tournament. Pure — reads the existing tables / bracket /
 * places helpers and never changes a result:
 *
 *   • `groupViews` — each group (and a Super round) as a live table: every
 *     entrant listed (0 played too), "live" rows while a match is in play,
 *     provisional until the group is done; then "final" with qualified /
 *     eliminated markers (from who actually reached the next stage, else the
 *     organiser's saved "top N (+ best placed)" rule once every group is done).
 *   • `teamJourney` — group finish → each knockout round (single / double
 *     elimination, double-chance playoff, third place, plate; one-off matches,
 *     two-legged ties and team ties as one step) → final place.
 *   • `roundProgress` — "2 of 4 decided · 1 live" for a knockout round.
 *   • `deciderFromStatus` — a sport's own status words for how a level match
 *     was settled ("Kites win 4–3 on pens", "Won the Super Over…", Armageddon).
 *
 * The medal table is untouched here: SD-123 keeps it empty for a groups /
 * knockout sport until the knockout starts.
 */
import type { Match, SportId } from '../core/types';
import { standingsPhases, advancement, type GroupTable } from './groups.ts';
import { defaultStandingsConfig, type StandingsConfig, type TeamStanding } from './standings.ts';
import {
  isEliminationStage, isPlateStage, isDoubleElimStage, pairingsInStage, pairingWinnerId, pairingMatches,
  pairingAdvanceOverride, stageLabel, isKoStage, koStageRank, type KnockoutPairing,
} from './bracket.ts';
import { resolveSeries } from './series.ts';
import { collapseTies } from './teamTie.ts';
import { sportPlaces, type BronzeRule } from './bracketPlaces.ts';
import { plateState } from './elimDraws.ts';
import type { StructureShape } from './structureConfig.ts';

/* --------------------------------- groups --------------------------------- */

export type PhaseStatus = 'upcoming' | 'in_progress' | 'live' | 'final';
export type RowMark = 'qualified' | 'eliminated';

export interface GroupRow extends TeamStanding {
  /** 1-based position in the group (provisional until the group is final) */
  position: number;
  /** a match of this entrant in this group is in play right now */
  live: boolean;
  /** set once the group is final and who goes through is known */
  mark?: RowMark;
  /** 'best' = through as one of the best-placed teams across groups */
  via?: 'direct' | 'best';
}

export interface GroupView {
  /** the standings phase key ('group:A' | 'super') — matches StandingsPhase.key */
  key: string;
  /** "Group A" / "Super Four" */
  title: string;
  status: PhaseStatus;
  /** fixtures finished / scheduled (a team tie counts once; cancelled left out) */
  played: number;
  total: number;
  /** fixtures in play right now (a team tie as one) */
  live: Match[];
  rows: GroupRow[];
  /** where the markers came from: who reached the next stage, or the saved rule */
  marksFrom?: 'next-stage' | 'rule';
}

export interface GroupViewOptions {
  /** the organiser's rule (structureConfig): top N of each group go through … */
  advanceTopN?: number;
  /** … plus this many best-placed (N+1)th teams */
  advanceBest?: number;
}

const isGroupKey = (k: string) => k.startsWith('group:') || k === 'super';
const sidesOf = (m: Match) => [m.homeTeam.id, m.awayTeam.id];

/** "Group A — final" / "Group A · live" / "Group A · 3 of 6 played". */
export function groupHeading(v: Pick<GroupView, 'title' | 'status' | 'played' | 'total'>): string {
  if (v.status === 'final') return `${v.title} — final`;
  if (v.status === 'live') return `${v.title} · live`;
  if (v.status === 'in_progress') return `${v.title} · ${v.played} of ${v.total} played`;
  return v.title;
}

/**
 * Every group (and the Super round) of `sport` with its live status, its
 * provisional or final table and — once final — who went through.
 */
export function groupViews(
  matches: Match[], sport: SportId, cfg: StandingsConfig = defaultStandingsConfig(sport), opts: GroupViewOptions = {},
): GroupView[] {
  const all = matches.filter((m) => m.sport === sport);
  const phases = standingsPhases(all, sport, cfg).filter((p) => isGroupKey(p.key));
  if (!phases.length) return [];
  const fixtures = collapseTies(all);
  const phaseMatches = (key: string) => fixtures.filter((m) => !isEliminationStage(m.stage)
    && (key === 'super' ? m.stage === 'super' && !m.group : m.group === key.slice('group:'.length)));

  // Who reached the stage after the groups (the Super round when there is one,
  // else the knockout — byes count) and after the Super round (the knockout).
  const koIds = new Set<string>();
  for (const m of all) {
    if (!isEliminationStage(m.stage) || isPlateStage(m.stage)) continue;
    // A drop-in to a losers' bracket is not a qualification from the groups.
    if (/^lb\d+$/.test(m.stage ?? '')) continue;
    sidesOf(m).forEach((id) => koIds.add(id));
    (m.byes ?? []).forEach((id) => koIds.add(id));
  }
  const superIds = new Set(all.filter((m) => m.stage === 'super' && !m.group).flatMap(sidesOf));
  const nextFor = (key: string) => (key === 'super' ? koIds : superIds.size ? superIds : koIds);

  const views: GroupView[] = phases.map((ph) => {
    const ms = phaseMatches(ph.key);
    const counted = ms.filter((m) => m.status !== 'cancelled' && m.status !== 'postponed');
    const played = counted.filter((m) => m.status === 'completed').length;
    const live = ms.filter((m) => m.status === 'live');
    const liveIds = new Set(live.flatMap(sidesOf));
    // Every entrant of the group, even before their first result.
    const rows: TeamStanding[] = [...ph.rows];
    const seen = new Set(rows.map((r) => r.teamId));
    for (const m of ms) {
      for (const t of [m.homeTeam, m.awayTeam]) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        rows.push({ teamId: t.id, name: t.name, colorHex: t.colorHex, played: 0, won: 0, lost: 0, drawn: 0, nr: 0, for: 0, against: 0, diff: 0, points: 0, forUnits: 0, againstUnits: 0, adjust: 0 });
      }
    }
    const next = nextFor(ph.key);
    const nextStarted = next.size > 0;
    const done = counted.length > 0 && played === counted.length;
    const status: PhaseStatus = live.length ? 'live' : done || (nextStarted && played > 0) ? 'final' : played > 0 ? 'in_progress' : 'upcoming';
    const out: GroupRow[] = rows.map((r, i) => ({ ...r, position: i + 1, live: liveIds.has(r.teamId) }));
    if (status === 'final' && nextStarted) {
      for (const r of out) r.mark = next.has(r.teamId) ? 'qualified' : 'eliminated';
    }
    return { key: ph.key, title: ph.title, status, played, total: counted.length, live, rows: out, ...(status === 'final' && nextStarted ? { marksFrom: 'next-stage' as const } : {}) };
  });

  // Not started yet, but every group is done → the saved "top N (+ best)" rule.
  const groups = views.filter((v) => v.key.startsWith('group:'));
  const topN = opts.advanceTopN ?? 0;
  if (topN > 0 && groups.length && groups.every((v) => v.status === 'final' && !v.marksFrom) && !superIds.size) {
    const tables: GroupTable[] = groups.map((v) => ({ name: v.key.slice('group:'.length), rows: v.rows }));
    const through = new Map(advancement(tables, topN, opts.advanceBest ?? 0, cfg).map((q) => [q.teamId, q.via]));
    for (const v of groups) {
      v.marksFrom = 'rule';
      for (const r of v.rows) {
        const via = through.get(r.teamId);
        r.mark = via ? 'qualified' : 'eliminated';
        if (via) r.via = via;
      }
    }
  }
  return views;
}

/* ------------------------------- knockouts -------------------------------- */

/** Every elimination stage of a sport, in the order it is played. */
function stageOrder(stage: string): number {
  if (isKoStage(stage)) return 100 + koStageRank(stage) * 10;
  const m = /^(wb|lb|pl)(\d+)$/.exec(stage);
  if (m) return (m[1] === 'pl' ? 300 : 100) + Number(m[2]) * 10 + (m[1] === 'lb' ? 5 : 0);
  const fixed: Record<string, number> = { playin: 50, 'play-in': 50, q1: 150, eliminator: 151, q2: 160, third: 165, gf: 250, gf2: 251 };
  return fixed[stage] ?? 200;
}

/** One knockout round's progress: "2 of 4 decided · 1 live". */
export interface RoundProgress { total: number; decided: number; live: number; text: string }
export function roundProgress(pairings: KnockoutPairing[]): RoundProgress {
  const total = pairings.length;
  const decided = pairings.filter((p) => !!pairingWinnerId(p)).length;
  const live = pairings.filter((p) => !pairingWinnerId(p) && pairingMatches(p).some((m) => m.status === 'live')).length;
  const text = decided === total ? (total === 1 ? 'Decided' : `All ${total} decided`)
    : total === 1 ? (live ? '● Live' : 'To play')
    : [`${decided} of ${total} decided`, live ? `${live} live` : ''].filter(Boolean).join(' · ');
  return { total, decided, live, text };
}

const DECIDER_RE = /pens\b|penalt|shoot-?out|7-metre|super over|super five|armageddon|blitz|rapid|golden raid|extra time|overtime|\bOT\d*\b|tie-?break|mini-match/i;

/**
 * How a level match was settled, in the sport's own words, from its status
 * line ("Home win 4–3 on pens" → "Kites win 4–3 on pens"; "Won the Super Over
 * by 4 runs" → "Kites won the Super Over by 4 runs"; "1½–½ · Away through
 * (Armageddon)"; "Final · OT1"). undefined when nothing special decided it.
 */
export function deciderFromStatus(line: string | undefined, home: string, away: string, winnerName?: string): string | undefined {
  if (!line || !DECIDER_RE.test(line)) return undefined;
  let t = line.trim()
    .replace(/^full time \(after extra time\)$/i, 'After extra time')
    .replace(/^(full time|final)\s*·\s*/i, '');
  t = t.replace(/\bHome\b/g, home).replace(/\bAway\b/g, away);
  if (/^OT\d*$/.test(t)) t = `After overtime (${t})`;
  if (/^won\b/i.test(t) && winnerName) t = `${winnerName} ${t[0].toLowerCase()}${t.slice(1)}`;
  return t;
}

export type StepOutcome = 'won' | 'lost' | 'live' | 'upcoming' | 'awaiting';

export interface JourneyStep {
  key: string;
  stage: string;
  /** "Quarter-finals", "Losers' round 2", "Plate final", "Third-place playoff" */
  label: string;
  opponentId?: string;
  opponentName: string;
  outcome: StepOutcome;
  /** from this team's side: "2–1", "3–2 agg", "2–1 in rubbers" */
  score?: string;
  /** each leg / rubber from this team's side (a multi-leg tie) */
  legs?: string[];
  /** penalties / Super Over / Armageddon / organiser decision / walkover */
  decider?: string;
  /** the match to open (the single match, or the tie's last leg) */
  matchId?: string;
  /** earliest kickoff of the pairing */
  startsAt?: string;
}

export interface GroupFinish {
  key: string;
  title: string;
  position: number;
  of: number;
  status: PhaseStatus;
  mark?: RowMark;
  via?: 'direct' | 'best';
  points: number;
  played: number;
}

export interface JourneyFinish {
  position: number;
  shared: number;
  /** "Champions", "Runners-up", "3rd", "Joint 3rd", "=5th" */
  label: string;
}

export interface TeamJourney {
  teamId: string;
  name: string;
  colorHex?: string;
  /** the group (and Super round) this entrant played in */
  phases: GroupFinish[];
  steps: JourneyStep[];
  finish?: JourneyFinish;
  plateWinner: boolean;
  /** 'alive' = still in it; 'out' = knocked out / eliminated; 'done' = placed;
   *  'champion' = won it */
  state: 'champion' | 'done' | 'out' | 'alive';
  /** one line: "Group A 1st → QF won → SF lost → 3rd" */
  summary: string;
}

export interface JourneyOptions extends GroupViewOptions {
  shape?: StructureShape | null;
  bronze?: BronzeRule;
  /** the sport's own words for how a finished match was decided (UI supplies it) */
  decider?: (m: Match) => string | undefined;
  /** a set/game line from this team's side ("6-4, 3-6, [10-7]") (UI supplies it) */
  line?: (m: Match, teamId: string) => string;
}

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** "Champions" / "Runners-up" / "3rd" / "Joint 3rd" / "=5th". */
export function finishLabel(position: number, shared: number): string {
  if (position === 1 && shared === 1) return 'Champions';
  if (position === 2 && shared === 1) return 'Runners-up';
  if (shared > 1) return position === 3 && shared === 2 ? 'Joint 3rd' : `=${ordinal(position)}`;
  return ordinal(position);
}

const scoreFrom = (mine?: number, theirs?: number) => (mine == null || theirs == null ? undefined : `${mine}–${theirs}`);

function stepFor(p: KnockoutPairing, teamId: string, opts: JourneyOptions): JourneyStep {
  const ms = pairingMatches(p);
  const oppId = p.homeId === teamId ? p.awayId : p.homeId;
  const anyM = ms[0];
  const oppSide = anyM ? (anyM.homeTeam.id === oppId ? anyM.homeTeam : anyM.awayTeam) : undefined;
  const winner = pairingWinnerId(p);
  const live = ms.some((m) => m.status === 'live');
  const finished = ms.length > 0 && ms.every((m) => m.status === 'completed' || m.status === 'cancelled');
  const outcome: StepOutcome = winner ? (winner === teamId ? 'won' : 'lost') : live ? 'live' : finished ? 'awaiting' : 'upcoming';
  const mine = (m: Match) => (m.homeTeam.id === teamId ? 'home' : 'away');
  const legScore = (m: Match): string => {
    if (m.walkover) return 'w/o';
    const line = opts.line?.(m, teamId) ?? '';
    const big = m.score ? scoreFrom(m.score[mine(m)], m.score[mine(m) === 'home' ? 'away' : 'home']) : undefined;
    if (m.status !== 'completed' && m.status !== 'live') return '—';
    return [big, line && line !== big ? `(${line})` : ''].filter(Boolean).join(' ') || '—';
  };
  const startsAt = ms.reduce<string | undefined>((min, m) => (m.startsAt && (!min || m.startsAt < min) ? m.startsAt : min), undefined);
  const base = {
    key: p.key, stage: String(p.stage), label: stageLabel(String(p.stage)), opponentId: oppId,
    opponentName: oppSide?.name ?? 'To be decided', outcome, startsAt,
    matchId: ms[ms.length - 1]?.id,
  };
  const override = pairingAdvanceOverride(p);
  const decision = override ? `Organiser decision${override.reason ? ` — ${override.reason}` : ''}` : undefined;

  if (p.series) {
    const st = resolveSeries(p.series);
    const aIsMe = (p.series.teamA?.id ?? p.series.teamAId) === teamId;
    const agg = p.series.format === 'aggregate';
    const [me, them] = agg ? (aIsMe ? [st.aggA, st.aggB] : [st.aggB, st.aggA]) : aIsMe ? [st.winsA, st.winsB] : [st.winsB, st.winsA];
    const started = ms.some((m) => m.status === 'completed' || m.status === 'live');
    const lastPlayed = [...ms].reverse().find((m) => m.status === 'completed');
    const sportDecider = lastPlayed ? opts.decider?.(lastPlayed) : undefined;
    return {
      ...base,
      score: started ? `${me}–${them}${agg ? ' agg' : p.series.format === 'rubbers' ? ' in rubbers' : ' in games'}` : undefined,
      legs: ms.map((m, i) => `${p.series!.format === 'rubbers' ? 'R' : 'L'}${i + 1} ${legScore(m)}`),
      decider: decision ?? sportDecider ?? (st.decided && agg && me === them ? st.summary : undefined),
    };
  }
  const m = p.match!;
  return {
    ...base,
    score: m.status === 'completed' || m.status === 'live' || m.walkover ? legScore(m) : undefined,
    decider: decision ?? (m.walkover ? 'Walkover' : m.status === 'completed' ? opts.decider?.(m) : undefined),
  };
}

/**
 * One entrant's whole tournament in `sport`: group (and Super round) finish,
 * every knockout step in playing order, and the final place. null when the
 * entrant has no fixture in this sport.
 */
export function teamJourney(
  matches: Match[], sport: SportId, teamId: string, cfg: StandingsConfig = defaultStandingsConfig(sport), opts: JourneyOptions = {},
): TeamJourney | null {
  const all = matches.filter((m) => m.sport === sport);
  const mineAll = all.filter((m) => m.homeTeam.id === teamId || m.awayTeam.id === teamId || (m.byes ?? []).includes(teamId));
  if (!mineAll.length) return null;
  const me = mineAll.map((m) => (m.homeTeam.id === teamId ? m.homeTeam : m.awayTeam.id === teamId ? m.awayTeam : undefined)).find(Boolean);

  const phases: GroupFinish[] = [];
  for (const v of groupViews(all, sport, cfg, opts)) {
    const r = v.rows.find((x) => x.teamId === teamId);
    if (!r) continue;
    phases.push({ key: v.key, title: v.title, position: r.position, of: v.rows.length, status: v.status, mark: r.mark, via: r.via, points: r.points, played: r.played });
  }

  // Knockout steps: every elimination stage, one step per pairing (a tie's legs
  // or a team tie's rubbers fold into one).
  const byStage = new Map<string, Match[]>();
  for (const m of all) {
    if (!isEliminationStage(m.stage)) continue;
    const list = byStage.get(m.stage!) ?? [];
    list.push(m);
    byStage.set(m.stage!, list);
  }
  const steps: JourneyStep[] = [];
  for (const [stage, ms] of byStage) {
    for (const p of pairingsInStage(stage, ms)) {
      if (p.homeId !== teamId && p.awayId !== teamId) continue;
      steps.push(stepFor(p, teamId, opts));
    }
  }
  steps.sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage) || (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));
  // A play-in bye: the step the entrant skipped.
  const byeStages = [...new Set(all.filter((m) => (m.byes ?? []).includes(teamId)).map((m) => m.stage ?? ''))];

  const places = sportPlaces(all, sport, cfg, { shape: opts.shape ?? null, bronze: opts.bronze });
  const place = places.basis === 'structure' ? places.places.find((p) => p.teamId === teamId) : undefined;
  const finish = place ? { position: place.position, shared: place.shared, label: finishLabel(place.position, place.shared) } : undefined;
  const plateWinner = plateState(all)?.winnerId === teamId;

  const open = steps.some((s) => s.outcome === 'live' || s.outcome === 'upcoming' || s.outcome === 'awaiting');
  const groupOut = phases.some((p) => p.mark === 'eliminated');
  const groupsOpen = phases.some((p) => p.status !== 'final');
  // Double elimination: a first loss isn't the end — only the last step counts.
  const de = steps.some((s) => isDoubleElimStage(s.stage));
  const mainSteps = steps.filter((s) => !isPlateStage(s.stage));
  const lastMain = mainSteps[mainSteps.length - 1];
  const knockedOut = !!lastMain && lastMain.outcome === 'lost' && (de ? !open : lastMain.stage !== 'third' && lastMain.stage !== 'q1');
  const state: TeamJourney['state'] = finish?.position === 1 && finish.shared === 1 ? 'champion'
    : finish ? 'done'
    : open || groupsOpen ? 'alive'
    : groupOut || knockedOut ? 'out'
    : 'alive';

  const bits: string[] = [];
  for (const p of phases) bits.push(`${p.title} ${p.status === 'final' ? ordinal(p.position) : `${ordinal(p.position)} (so far)`}`);
  for (const s of byeStages) bits.push(`${stageLabel(s)} bye`);
  for (const s of steps) bits.push(`${shortStage(s.stage)} ${s.outcome === 'won' ? 'won' : s.outcome === 'lost' ? 'lost' : s.outcome === 'live' ? 'live' : s.outcome === 'awaiting' ? 'to be decided' : 'next'}`);
  if (finish) bits.push(finish.label);
  else if (plateWinner) bits.push('Plate winner');
  else if (state === 'out' && groupOut && !steps.length) bits.push('out in the groups');

  return {
    teamId, name: me?.name ?? 'Team', colorHex: me?.colorHex, phases, steps, finish, plateWinner, state,
    summary: bits.join(' → '),
  };
}

/** Short stage names for a one-line summary. */
export function shortStage(stage: string): string {
  const fixed: Record<string, string> = { r128: 'R128', r64: 'R64', r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'Final', third: '3rd-place match', q1: 'Q1', q2: 'Q2', eliminator: 'Eliminator', gf: 'Grand final', gf2: 'GF reset', playin: 'Play-in', 'play-in': 'Play-in' };
  if (fixed[stage]) return fixed[stage];
  const m = /^(wb|lb|pl)(\d+)$/.exec(stage);
  if (m) return `${{ wb: 'WB', lb: 'LB', pl: 'Plate' }[m[1]]} R${m[2]}`;
  return stageLabel(stage);
}

/** The tournaments × sports an entrant took part in, from a match list —
 *  [{ tournamentId, sport, teamId }] once each (latest first). */
export function journeysOf(matches: Match[], teamIds: string[]): { tournamentId: string; sport: SportId; teamId: string; lastAt: string }[] {
  const ids = new Set(teamIds);
  const out = new Map<string, { tournamentId: string; sport: SportId; teamId: string; lastAt: string }>();
  for (const m of matches) {
    if (!m.tournamentId) continue;
    const tid = ids.has(m.homeTeam.id) ? m.homeTeam.id : ids.has(m.awayTeam.id) ? m.awayTeam.id : undefined;
    if (!tid) continue;
    const k = `${m.tournamentId}|${m.sport}|${tid}`;
    const prev = out.get(k);
    if (!prev || (m.startsAt ?? '') > prev.lastAt) out.set(k, { tournamentId: m.tournamentId, sport: m.sport, teamId: tid, lastAt: m.startsAt ?? '' });
  }
  return [...out.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
