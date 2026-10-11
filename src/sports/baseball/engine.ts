/**
 * Baseball + softball (WBSC) — the PURE scoring core (SD-144). No React /
 * React Native, so node tests, corrections (#05 AMEND replays) and the device
 * all derive the same game from the same log.
 *
 * One sport id (`baseball`), several formats (organiser presets):
 *  - Baseball (WBSC / OBR): 9 innings, DH on, run rule 15 after 5 / 10 after 7
 *    (WBSC event regulations — verify per event), extra innings with the WBSC
 *    tie-break (runners on 1B + 2B from the 10th — organiser: off / runner on
 *    2B (MLB) / 1B + 2B, and from which inning).
 *  - Softball fast pitch (WBSC): 7 innings, run rule 15 / 3, 10 / 4, 7 / 5
 *    (verify), tie-break runner on 2B from the 8th (WBSC international
 *    tie-breaker). DP/FLEX isn't modelled — use DH off and subs.
 *  - Slow pitch (WBSC): 7 innings, 10 in the line-up, a 1-1 count, a foul
 *    with two strikes is out (organiser options — verify; many leagues use
 *    house rules), run rule 20 / 3, 15 / 4, 10 / 5 (verify).
 *  - Youth (6 innings, 10 after 4) and school (7 innings, 10 after 5) — common
 *    house / federation run rules, organiser-editable.
 *
 * How the log works: every play carries its EXPLICIT effects — the runner
 * moves (from → to, with who), the outs it made, the RBI — so the credits a
 * stat line gets are a pure function of the action (SD-19), and removing or
 * re-entering a past play only changes that play. The game situation (inning,
 * outs, count, bases, score, line score) is RE-DERIVED from the whole log on
 * every action (`derive`), which also applies the rules that end a
 * half-inning (3 outs; runs on a 3rd-out force / batter out don't count —
 * OBR 5.08), the walk-off (only the winning run counts unless it's a home run
 * — OBR 7.01(g)), the run rule and the end of regulation / extra innings.
 *
 * Earned runs (simplified, with a scorer override per play): a run is
 * unearned when the runner reached on an error, was placed on base by the
 * extra-inning tie-break, scored on a passed ball or on the error play
 * itself; it is charged to the pitcher who put the runner on base (inherited
 * runners stay with the earlier pitcher — OBR 9.16(g)).
 */
import type { ScoreAction, LiveSettings, FormatField, Attribution } from '../types';

export type Side = 'home' | 'away';
export const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export interface Who { id?: string; name?: string }
export interface LineupEntry { id?: string; name: string; pos?: string }

export type PitchKind = 'ball' | 'called' | 'swinging' | 'foul';
/** how a plate appearance ended */
export type Outcome =
  | '1B' | '2B' | '3B' | 'HR'
  | 'BB' | 'IBB' | 'HBP' | 'K'
  | 'GO' | 'FO' | 'LO' | 'SF' | 'SH' | 'FC' | 'E' | 'DP';
/** a runner play between pitches */
export type RunnerKind = 'SB' | 'CS' | 'WP' | 'PB' | 'BK' | 'PO' | 'ADV' | 'OUT';
export type SubKind = 'ph' | 'pr' | 'def' | 'p';
/** 0 = home plate (the batter) */
export type Base = 0 | 1 | 2 | 3;
/** 4 = scored, -1 = out */
export type Dest = 1 | 2 | 3 | 4 | -1;
export interface Move { from: Base; to: Dest; id?: string; name?: string }

export const HITS: Outcome[] = ['1B', '2B', '3B', 'HR'];
export const NO_AB: Outcome[] = ['BB', 'IBB', 'HBP', 'SF', 'SH'];
/** the outcomes where the batter is put out at the plate / before 1B */
export const BATTER_OUT: Outcome[] = ['K', 'GO', 'FO', 'LO', 'SF', 'SH', 'DP'];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run',
  BB: 'Walk', IBB: 'Intentional walk', HBP: 'Hit by pitch', K: 'Strikeout',
  GO: 'Groundout', FO: 'Flyout', LO: 'Lineout', SF: 'Sacrifice fly', SH: 'Sacrifice bunt',
  FC: "Fielder's choice", E: 'Reached on error', DP: 'Double play',
};
export const RUNNER_LABEL: Record<RunnerKind, string> = {
  SB: 'Stolen base', CS: 'Caught stealing', WP: 'Wild pitch', PB: 'Passed ball', BK: 'Balk', PO: 'Picked off', ADV: 'Runner advance', OUT: 'Runner out',
};
/** scorer's position numbers (1 = P … 9 = RF; 10 = slow-pitch extra fielder) */
export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
export const POS_NUM: Record<string, number> = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9, EF: 10 };

export interface BaseballEvent {
  /** stable id from the action (`payload.uid`) */
  id: string;
  type: 'pitch' | 'pa' | 'runner' | 'sub' | 'er' | 'eject';
  /** pitch / pa / runner: the BATTING side; sub / eject: the team */
  side?: Side;
  pitch?: PitchKind | 'inplay' | 'hbp';
  outcome?: Outcome;
  kind?: RunnerKind | SubKind;
  batter?: Who & { slot?: number };
  pitcher?: Who;
  moves?: Move[];
  /** outs the play made (clamped to the half-inning) */
  outs?: number;
  rbi?: number;
  /** scorer's notation, e.g. "6-3", "E5", "F8" */
  fielders?: string;
  /** sub: batting-order slot, base (pinch runner), who comes on / off, position */
  slot?: number;
  base?: 1 | 2 | 3;
  on?: Who;
  off?: Who;
  pos?: string;
  /** er: the play it overrides, and earned or not */
  ref?: string;
  earned?: boolean;
  /** eject: a team official instead of a player */
  official?: string;
}

/* --------------------------------- format ---------------------------------- */

export type TieBreak = 'none' | 'r2' | 'r12';

export interface BaseballConfig {
  /** regulation innings */
  innings: number;
  /** "15@5,10@7": a lead of 15 after 5 innings, 10 after 7 ('' = none) */
  mercy: string;
  tiebreak: TieBreak;
  /** first inning the tie-break runners are placed */
  tbFrom: number;
  dh: boolean;
  lineupSize: number;
  startBalls: number;
  startStrikes: number;
  /** slow pitch: a foul with two strikes is a strikeout */
  foulOut: boolean;
  /** a level game may stand (time-limited leagues) */
  allowTies: boolean;
  /** stop after this many innings, level = a tie (0 = play on) */
  maxInnings: number;
  /** pitch-by-pitch counts (off = outcomes only) */
  pitches: boolean;
  /** ask for the fielders on outs (scorer's notation) */
  askFielders: boolean;
  /** which preset (for labels / format split) */
  preset: string;
}

export const BASEBALL_PRESETS: Record<string, { label: string; set: Record<string, number | string | boolean> }> = {
  baseball: { label: 'Baseball 9 inn (WBSC)', set: { innings: 9, mercy: '15@5,10@7', tiebreak: 'r12', tbFrom: 10, dh: true, lineupSize: 9, startCount: '0-0', foulOut: false } },
  softball: { label: 'Softball fast pitch 7 inn (WBSC)', set: { innings: 7, mercy: '15@3,10@4,7@5', tiebreak: 'r2', tbFrom: 8, dh: false, lineupSize: 9, startCount: '0-0', foulOut: false } },
  slowpitch: { label: 'Slow pitch 7 inn', set: { innings: 7, mercy: '20@3,15@4,10@5', tiebreak: 'r2', tbFrom: 8, dh: false, lineupSize: 10, startCount: '1-1', foulOut: true } },
  youth: { label: 'Youth 6 inn', set: { innings: 6, mercy: '10@4', tiebreak: 'none', tbFrom: 7, dh: true, lineupSize: 9, startCount: '0-0', foulOut: false } },
  school: { label: 'School 7 inn', set: { innings: 7, mercy: '10@5', tiebreak: 'none', tbFrom: 8, dh: true, lineupSize: 9, startCount: '0-0', foulOut: false } },
};

const bool = (v: unknown, d: boolean) => (v === undefined || v === null || v === '' ? d : v === true || v === 'true' || v === 1);
const numOr = (v: unknown, d: number, min = 0, max = 99) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : d; };

/** Is this a softball format (7-inning ERA, the 7-0 forfeit)? */
export const isSoftball = (fmt?: Record<string, unknown> | null): boolean => {
  const p = String(fmt?.preset ?? '');
  return p === 'softball' || p === 'slowpitch';
};

export function readConfig(config?: Record<string, unknown>): BaseballConfig {
  const preset = typeof config?.preset === 'string' && BASEBALL_PRESETS[config.preset] ? config.preset : 'baseball';
  const base = BASEBALL_PRESETS[preset].set;
  const get = (k: string) => (config && config[k] !== undefined && config[k] !== '' ? config[k] : base[k]);
  const innings = numOr(get('innings'), 9, 1, 15);
  const tb = get('tiebreak');
  const count = String(get('startCount') ?? '0-0');
  const m = /^(\d)-(\d)$/.exec(count);
  return {
    innings,
    mercy: typeof get('mercy') === 'string' ? (get('mercy') as string) : '',
    tiebreak: tb === 'r2' || tb === 'r12' ? tb : 'none',
    tbFrom: numOr(get('tbFrom'), innings + 1, 2, 30),
    dh: bool(get('dh'), true),
    lineupSize: numOr(get('lineupSize'), 9, 1, 20),
    startBalls: m ? Math.min(3, Number(m[1])) : 0,
    startStrikes: m ? Math.min(2, Number(m[2])) : 0,
    foulOut: bool(get('foulOut'), false),
    allowTies: bool(config?.allowTies, false),
    maxInnings: numOr(config?.maxInnings, 0, 0, 30),
    pitches: bool(config?.pitches, true),
    askFielders: bool(config?.askFielders, false),
    preset,
  };
}

/** "15@5,10@7" → [{after 5, lead 15}, {after 7, lead 10}] */
export function mercyRules(raw: string): { after: number; lead: number }[] {
  return raw.split(',').map((p) => /^\s*(\d+)\s*@\s*(\d+)\s*$/.exec(p)).filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ lead: Number(m[1]), after: Number(m[2]) })).filter((r) => r.lead > 0 && r.after > 0);
}
export const mercyText = (raw: string): string => {
  const r = mercyRules(raw);
  return r.length ? r.map((x) => `${x.lead} after ${x.after}`).join(', ') : 'none';
};
const mercyLead = (cfg: BaseballConfig, inning: number): number | undefined => {
  let lead: number | undefined;
  for (const r of mercyRules(cfg.mercy)) if (inning >= r.after && (lead === undefined || r.lead < lead)) lead = r.lead;
  return lead;
};

/* ---------------------------------- state ---------------------------------- */

export interface Runner { id?: string; name?: string; slot?: number; resp?: string; respName?: string; ue: boolean }
export interface RunCredit { event: string; side: Side; runnerId?: string; runnerName?: string; resp?: string; respName?: string; earned: boolean }
/** per event: the situation BEFORE it (for stamps, edits) and what it did */
export interface Ann { half: number; outs: number; balls: number; strikes: number; runs: number; outsMade: number; ignored?: boolean; score: { home: number; away: number } }
export interface PitcherSpell { key: string; id?: string; name?: string; side: Side; leadAtEntry: number; outs: number; first: boolean; last?: boolean }

export interface Game {
  half: number;
  outs: number;
  balls: number;
  strikes: number;
  bases: [Runner | null, Runner | null, Runner | null];
  score: { home: number; away: number };
  /** runs per half-inning (index = half) */
  line: number[];
  hits: { home: number; away: number };
  /** errors COMMITTED by each team (in the field) */
  errors: { home: number; away: number };
  lob: { home: number; away: number };
  /** next batter's index in the order */
  next: { home: number; away: number };
  order: { home: LineupEntry[]; away: LineupEntry[] };
  /** each team's pitcher now */
  pitcher: { home?: Who; away?: Who };
  pitches: Record<string, number>;
  spells: PitcherSpell[];
  runs: RunCredit[];
  ann: Record<string, Ann>;
  ended: boolean;
  endReason?: 'reg' | 'walkoff' | 'mercy' | 'called' | 'tie';
  /** W / L / SV pitcher keys once the game is over */
  decisions?: { w?: string; l?: string; sv?: string };
}

export interface BaseballState {
  v: 1;
  cfg: BaseballConfig;
  lineup: { home?: LineupEntry[]; away?: LineupEntry[] };
  starters: { home?: Who; away?: Who };
  events: BaseballEvent[];
  seq: number;
  /** a called game (time limit / weather) */
  called?: boolean;
  g: Game;
}

export const whoKey = (w?: Who | null): string | undefined => (w?.id ? w.id : w?.name ? `name:${w.name}` : undefined);
export const inningOf = (half: number): number => Math.floor(half / 2) + 1;
export const isTop = (half: number): boolean => half % 2 === 0;
export const battingSide = (half: number): Side => (isTop(half) ? 'away' : 'home');
export const ord = (n: number): string => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
/** "▲ 3rd" / "▼ 3rd" */
export const halfShort = (half: number): string => `${isTop(half) ? '▲' : '▼'} ${ord(inningOf(half))}`;
export const halfLong = (half: number): string => `${isTop(half) ? 'Top' : 'Bottom'} ${ord(inningOf(half))}`;

/** A side's batting order (default: anonymous "Batter n" slots). */
export function defaultOrder(n: number): LineupEntry[] {
  return Array.from({ length: n }, (_, i) => ({ name: `Batter ${i + 1}` }));
}

export function derive(cfg: BaseballConfig, s: Pick<BaseballState, 'lineup' | 'starters' | 'events' | 'called'>): Game {
  const order = {
    home: (s.lineup.home?.length ? s.lineup.home : defaultOrder(cfg.lineupSize)).map((e) => ({ ...e })),
    away: (s.lineup.away?.length ? s.lineup.away : defaultOrder(cfg.lineupSize)).map((e) => ({ ...e })),
  };
  const g: Game = {
    half: 0, outs: 0, balls: cfg.startBalls, strikes: cfg.startStrikes, bases: [null, null, null],
    score: { home: 0, away: 0 }, line: [0], hits: { home: 0, away: 0 }, errors: { home: 0, away: 0 }, lob: { home: 0, away: 0 },
    next: { home: 0, away: 0 }, order, pitcher: { home: s.starters.home, away: s.starters.away }, pitches: {}, spells: [], runs: [], ann: {}, ended: false,
  };
  const leadOf = (side: Side) => g.score[side] - g.score[other(side)];
  const spellOf = (side: Side): PitcherSpell | undefined => {
    const key = whoKey(g.pitcher[side]);
    if (!key) return undefined;
    let sp = [...g.spells].reverse().find((x) => x.side === side);
    if (!sp || sp.key !== key) {
      sp = { key, ...(g.pitcher[side]?.id ? { id: g.pitcher[side]!.id } : {}), ...(g.pitcher[side]?.name ? { name: g.pitcher[side]!.name } : {}), side, leadAtEntry: leadOf(side), outs: 0, first: !g.spells.some((x) => x.side === side) };
      g.spells.push(sp);
    }
    return sp;
  };
  // lead changes: who put the eventual winner ahead for good
  const leadLog: { leader: Side; winPitcher?: string; losePitcher?: string }[] = [];
  let leader: Side | null = null;

  const resetCount = () => { g.balls = cfg.startBalls; g.strikes = cfg.startStrikes; };
  const startHalf = () => {
    g.bases = [null, null, null];
    g.outs = 0;
    resetCount();
    if (g.line.length <= g.half) g.line[g.half] = 0;
    const inning = inningOf(g.half);
    if (cfg.tiebreak !== 'none' && inning >= cfg.tbFrom) {
      const bat = battingSide(g.half);
      const ord_ = g.order[bat];
      const n = ord_.length || 1;
      const lead = g.next[bat];
      const fieldKey = whoKey(g.pitcher[other(bat)]);
      const mk = (idx: number): Runner => { const e = ord_[(idx + n) % n]; return { ...(e?.id ? { id: e.id } : {}), name: e?.name, slot: (idx + n) % n, resp: fieldKey, respName: g.pitcher[other(bat)]?.name, ue: true }; };
      g.bases[1] = mk(lead - 1);
      if (cfg.tiebreak === 'r12') g.bases[0] = mk(lead - 2);
    }
  };
  const endIfOver = (afterHalf: number) => {
    const inning = inningOf(afterHalf);
    const d = g.score.home - g.score.away;
    const ml = mercyLead(cfg, inning);
    if (isTop(afterHalf)) {
      if (inning >= cfg.innings && d > 0) { g.ended = true; g.endReason = 'reg'; return; }
      if (ml !== undefined && d >= ml) { g.ended = true; g.endReason = 'mercy'; return; }
      return;
    }
    if (ml !== undefined && Math.abs(d) >= ml && inning < cfg.innings) { g.ended = true; g.endReason = 'mercy'; return; }
    if (inning >= cfg.innings && d !== 0) { g.ended = true; g.endReason = 'reg'; return; }
    if (inning >= cfg.innings && d === 0 && (cfg.allowTies || (cfg.maxInnings > 0 && inning >= cfg.maxInnings))) { g.ended = true; g.endReason = 'tie'; }
  };
  const halfOver = () => {
    if (g.outs < 3) return;
    const bat = battingSide(g.half);
    g.lob[bat] += g.bases.filter(Boolean).length;
    const done = g.half;
    endIfOver(done);
    g.half = done + 1;
    if (!g.ended) startHalf();
    else { g.bases = [null, null, null]; g.outs = 0; resetCount(); }
  };

  const runnerFromMove = (m: Move, e: BaseballEvent): Runner => {
    const fieldKey = whoKey(e.pitcher ?? g.pitcher[other(battingSide(g.half))]);
    return { ...(m.id ? { id: m.id } : {}), ...(m.name ? { name: m.name } : {}), resp: fieldKey, respName: (e.pitcher ?? g.pitcher[other(battingSide(g.half))])?.name, ue: false };
  };

  /** apply one play's moves; returns runs counted and outs made */
  const applyMoves = (e: BaseballEvent): { runs: number; outs: number } => {
    const bat = battingSide(g.half);
    const field = other(bat);
    const moves = [...(e.moves ?? [])].sort((a, b) => b.from - a.from);
    const before = g.outs;
    const scored: { r: Runner; m: Move }[] = [];
    let batterOut = false;
    for (const m of moves) {
      let r: Runner | null;
      if (m.from === 0) {
        const pk = whoKey(e.pitcher ?? g.pitcher[field]);
        r = {
          ...(e.batter?.id ? { id: e.batter.id } : m.id ? { id: m.id } : {}), name: e.batter?.name ?? m.name, slot: e.batter?.slot,
          resp: pk, respName: (e.pitcher ?? g.pitcher[field])?.name, ue: e.outcome === 'E',
        };
      } else {
        r = g.bases[m.from - 1] ?? runnerFromMove(m, e);
        g.bases[m.from - 1] = null;
      }
      if (m.to === -1) { g.outs = Math.min(3, g.outs + 1); if (m.from === 0) batterOut = true; }
      else if (m.to === 4) scored.push({ r, m });
      else g.bases[m.to - 1] = r;
    }
    const outsMade = g.outs - before;
    // OBR 5.08(a): no run scores on a 3rd out made by the batter before he
    // reaches 1B, or on a force out
    const third = g.outs >= 3;
    const forced = third && (batterOut || e.outcome === 'FC' || e.outcome === 'DP' || e.outcome === 'GO');
    let runs = 0;
    if (!forced) {
      for (const { r, m } of scored) {
        g.score[bat]++;
        g.line[g.half] = (g.line[g.half] ?? 0) + 1;
        runs++;
        const earned = !r.ue && e.outcome !== 'E' && e.kind !== 'PB';
        g.runs.push({ event: e.id, side: bat, ...(r.id ?? m.id ? { runnerId: r.id ?? m.id } : {}), ...(r.name ?? m.name ? { runnerName: r.name ?? m.name } : {}), resp: r.resp, respName: r.respName, earned });
        // lead changes (pitchers of record)
        const d = g.score.home - g.score.away;
        const now: Side | null = d > 0 ? 'home' : d < 0 ? 'away' : null;
        if (now && now !== leader) leadLog.push({ leader: now, winPitcher: whoKey(g.pitcher[now]), losePitcher: r.resp });
        leader = now;
        // walk-off: the bottom of the last (or an extra) inning, home ahead
        if (!isTop(g.half) && inningOf(g.half) >= cfg.innings && g.score.home > g.score.away) {
          g.ended = true; g.endReason = 'walkoff';
          if (e.outcome !== 'HR') break; // only the winning run counts (OBR 7.01(g))
        }
      }
      // a home run walk-off: every run counts (the loop above didn't break)
    }
    if (!g.ended && !isTop(g.half)) {
      const ml = mercyLead(cfg, inningOf(g.half));
      if (ml !== undefined && g.score.home - g.score.away >= ml) { g.ended = true; g.endReason = 'mercy'; }
    }
    return { runs, outs: outsMade };
  };

  const overrides = new Map<string, boolean>();
  for (const e of s.events) {
    const ann: Ann = { half: g.half, outs: g.outs, balls: g.balls, strikes: g.strikes, runs: 0, outsMade: 0, score: { ...g.score } };
    g.ann[e.id] = ann;
    if (e.type === 'er') { if (e.ref) overrides.set(e.ref, e.earned !== false); continue; }
    if (e.type === 'eject') continue;
    if (e.type === 'sub') {
      const side = e.side;
      if (!side || !e.on) continue;
      const on: LineupEntry = { ...(e.on.id ? { id: e.on.id } : {}), name: e.on.name ?? 'Player' };
      const slotOk = typeof e.slot === 'number' && e.slot >= 0 && e.slot < g.order[side].length;
      if (e.kind === 'p') {
        g.pitcher[side] = e.on;
        if (!g.ended) spellOf(side);
        if (slotOk && !cfg.dh) g.order[side][e.slot!] = { ...on, pos: 'P' };
      } else if (e.kind === 'pr') {
        const b = e.base;
        if (b && g.bases[b - 1]) {
          const r = g.bases[b - 1]!;
          const slot = typeof e.slot === 'number' ? e.slot : r.slot;
          g.bases[b - 1] = { ...r, id: e.on.id, name: e.on.name, slot };
          if (typeof slot === 'number' && slot >= 0 && slot < g.order[side].length) g.order[side][slot] = { ...on, pos: 'PR' };
        }
      } else if (slotOk) {
        g.order[side][e.slot!] = { ...on, pos: e.pos ?? (e.kind === 'ph' ? 'PH' : g.order[side][e.slot!]?.pos) };
      }
      continue;
    }
    if (g.ended) { ann.ignored = true; continue; }
    const bat = battingSide(g.half);
    const field = other(bat);
    const pKey = whoKey(e.pitcher ?? g.pitcher[field]);
    const spell = spellOf(field);
    if (e.type === 'pitch') {
      if (pKey) g.pitches[pKey] = (g.pitches[pKey] ?? 0) + 1;
      if (e.pitch === 'ball') g.balls = Math.min(3, g.balls + 1);
      else if (e.pitch === 'called' || e.pitch === 'swinging') g.strikes = Math.min(2, g.strikes + 1);
      else if (e.pitch === 'foul' && g.strikes < 2) g.strikes++;
      continue;
    }
    if (e.type === 'pa') {
      if (pKey && e.outcome !== 'IBB' && e.pitch) g.pitches[pKey] = (g.pitches[pKey] ?? 0) + 1;
      const r = applyMoves(e);
      ann.runs = r.runs; ann.outsMade = r.outs;
      if (spell) spell.outs += r.outs;
      if (e.outcome && HITS.includes(e.outcome)) g.hits[bat]++;
      if (e.outcome === 'E') g.errors[field]++;
      const n = g.order[bat].length || 1;
      const slot = typeof e.batter?.slot === 'number' ? e.batter.slot : g.next[bat];
      g.next[bat] = (slot + 1) % n;
      resetCount();
      if (!g.ended) halfOver();
      continue;
    }
    if (e.type === 'runner') {
      const r = applyMoves(e);
      ann.runs = r.runs; ann.outsMade = r.outs;
      if (spell) spell.outs += r.outs;
      if (!g.ended) halfOver();
    }
  }
  if (s.called && !g.ended) { g.ended = true; g.endReason = 'called'; }
  // earned-run overrides (the scorer's call on a play)
  for (const r of g.runs) if (overrides.has(r.event)) r.earned = overrides.get(r.event)!;
  if (g.ended) g.decisions = decisions(cfg, g, leadLog);
  return g;
}

/** W / L / SV (OBR 9.17, 9.19 — simplified): the winning team's pitcher when
 *  it took the lead for good (a starter short of 5 of 9 innings — 4 of 7, 3 of
 *  6 — gives it to the reliever who got the most outs); the loss to the
 *  pitcher charged with the go-ahead run; a save to the winning team's last
 *  pitcher (not the winner) who entered with a lead of 1–3 and got 3+ outs, or
 *  pitched 3+ innings. Scorer's judgment cases aren't modelled — verify. */
function decisions(cfg: BaseballConfig, g: Game, leadLog: { leader: Side; winPitcher?: string; losePitcher?: string }[]): Game['decisions'] {
  const d = g.score.home - g.score.away;
  if (d === 0) return {};
  const win: Side = d > 0 ? 'home' : 'away';
  // the last lead change is the one the winner never gave back
  const go = [...leadLog].reverse().find((x) => x.leader === win);
  let w = go?.winPitcher;
  const l = go?.losePitcher;
  const mine = g.spells.filter((x) => x.side === win);
  const starter = mine.find((x) => x.first);
  const minOuts = Math.round((cfg.innings * 5) / 9) * 3;
  if (w && starter && w === starter.key && mine.length > 1 && starter.outs < minOuts) {
    const best = [...mine].filter((x) => x.key !== starter.key).sort((a, b) => b.outs - a.outs)[0];
    if (best) w = best.key;
  }
  const last = mine[mine.length - 1];
  const sv = last && last.key !== w && !last.first && ((last.leadAtEntry >= 1 && last.leadAtEntry <= 3 && last.outs >= 3) || last.outs >= 9) ? last.key : undefined;
  return { ...(w ? { w } : {}), ...(l ? { l } : {}), ...(sv ? { sv } : {}) };
}

/* ----------------------------------- init ---------------------------------- */

export const init = (config?: Record<string, unknown>): BaseballState => {
  const cfg = readConfig(config);
  const s = { v: 1 as const, cfg, lineup: {}, starters: {}, events: [], seq: 0 };
  return { ...s, g: derive(cfg, s) };
};

/* --------------------------------- credits --------------------------------- */

type Credit = { playerId: string; playerName?: string; stats: Record<string, number> };

/** Every key a live baseball action credits (statTotals owns all of them). */
export const LIVE_KEYS = [
  'plateAppearances', 'atBats', 'hits', 'twoB', 'threeB', 'homeRuns', 'rbi', 'baseOnBalls', 'hitByPitch', 'strikeouts', 'sacFlies', 'sacBunts', 'gidp',
  'stolenBases', 'caughtStealing',
  'battersFaced', 'hitsAllowed', 'bbAllowed', 'hbpAllowed', 'kPitched', 'hrAllowed', 'outsPitched',
] as const;

/** The batter's line for one plate appearance. */
export function batterStats(o: Outcome, rbi = 0): Record<string, number> {
  const b: Record<string, number> = { plateAppearances: 1 };
  if (!NO_AB.includes(o)) b.atBats = 1;
  if (HITS.includes(o)) b.hits = 1;
  if (o === '2B') b.twoB = 1;
  if (o === '3B') b.threeB = 1;
  if (o === 'HR') b.homeRuns = 1;
  if (rbi > 0) b.rbi = rbi;
  if (o === 'BB' || o === 'IBB') b.baseOnBalls = 1;
  if (o === 'HBP') b.hitByPitch = 1;
  if (o === 'K') b.strikeouts = 1;
  if (o === 'SF') b.sacFlies = 1;
  if (o === 'SH') b.sacBunts = 1;
  if (o === 'DP') b.gidp = 1;
  return b;
}
/** The pitcher's line for one plate appearance. */
export function pitcherStats(o: Outcome, outs = 0): Record<string, number> {
  const p: Record<string, number> = { battersFaced: 1 };
  if (HITS.includes(o)) p.hitsAllowed = 1;
  if (o === 'BB' || o === 'IBB') p.bbAllowed = 1;
  if (o === 'HBP') p.hbpAllowed = 1;
  if (o === 'K') p.kPitched = 1;
  if (o === 'HR') p.hrAllowed = 1;
  if (outs > 0) p.outsPitched = outs;
  return p;
}

/** The stat-line credits one event writes: [primary player, second player]. */
export function eventCredits(e: Pick<BaseballEvent, 'type' | 'outcome' | 'kind' | 'batter' | 'pitcher' | 'moves' | 'outs' | 'rbi'>): { first?: Credit; second?: Credit } {
  const who = (w: Who | undefined, stats: Record<string, number>): Credit | undefined =>
    (w?.id && Object.keys(stats).length ? { playerId: w.id, ...(w.name ? { playerName: w.name } : {}), stats } : undefined);
  if (e.type === 'pa' && e.outcome) return { first: who(e.batter, batterStats(e.outcome, e.rbi ?? 0)), second: who(e.pitcher, pitcherStats(e.outcome, e.outs ?? 0)) };
  if (e.type === 'runner') {
    const m = e.moves?.[0];
    const runner = m ? { id: m.id, name: m.name } : undefined;
    const outs = e.outs ?? 0;
    const pitcher = who(e.pitcher, outs > 0 ? { outsPitched: outs } : {});
    if (e.kind === 'SB') return { first: who(runner, { stolenBases: 1 }) };
    if (e.kind === 'CS') return { first: who(runner, { caughtStealing: 1 }), second: pitcher };
    return { second: pitcher };
  }
  return {};
}

/** Credits → the action's `attribution` / `attribution2` (sign −1 reverses). */
export function creditAttribution(c: Credit | undefined, sign = 1, tracked?: string[]): Attribution | undefined {
  if (!c) return undefined;
  const entries = Object.entries(c.stats);
  if (!entries.length) return undefined;
  const [[stat, by], ...rest] = entries;
  return {
    playerId: c.playerId, stat, by: by * sign, ...(c.playerName ? { playerName: c.playerName } : {}),
    ...(rest.length ? { extra: Object.fromEntries(rest.map(([k, v]) => [k, v * sign])) } : {}),
    ...(tracked ? { tracked } : {}),
  };
}
const TRACKED: string[] = [...LIVE_KEYS];
const withCredits = (a: ScoreAction, e: Parameters<typeof eventCredits>[0]): ScoreAction => {
  const c = eventCredits(e);
  const a1 = creditAttribution(c.first, 1, TRACKED);
  const a2 = creditAttribution(c.second, 1, TRACKED);
  return { ...a, ...(a1 ? { attribution: a1 } : {}), ...(a2 ? { attribution2: a2 } : {}) };
};

/* --------------------------------- reducer --------------------------------- */

const ENDED_OK = new Set(['STAT_ADJUST', 'REMOVE_EVENT', 'ER', 'SUB', 'EJECT', 'LINEUP']);
const whoIn = (v: unknown): Who | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id ? o.id : undefined;
  const name = typeof o.name === 'string' && o.name ? o.name : undefined;
  return id || name ? { ...(id ? { id } : {}), ...(name ? { name } : {}) } : undefined;
};
const movesIn = (v: unknown): Move[] => (Array.isArray(v) ? v : []).flatMap((m) => {
  const o = m as Record<string, unknown>;
  const from = Number(o?.from);
  const to = Number(o?.to);
  if (![0, 1, 2, 3].includes(from) || ![1, 2, 3, 4, -1].includes(to)) return [];
  return [{ from: from as Base, to: to as Dest, ...(typeof o.id === 'string' ? { id: o.id } : {}), ...(typeof o.name === 'string' ? { name: o.name } : {}) }];
});
const OUTCOMES = Object.keys(OUTCOME_LABEL) as Outcome[];
const RUNNER_KINDS = Object.keys(RUNNER_LABEL) as RunnerKind[];

const started = (s: BaseballState) => s.events.some((e) => e.type === 'pitch' || e.type === 'pa' || e.type === 'runner');

export const reducer = (s: BaseballState, a: ScoreAction): BaseballState => {
  if (s.g.ended && !ENDED_OK.has(a.type)) return s;
  const p = a.payload ?? {};
  const uid = typeof p.uid === 'string' && p.uid ? (p.uid as string) : `e${s.seq + 1}`;
  const side = a.side === 'home' || a.side === 'away' ? a.side : undefined;
  const after = typeof p.after === 'string' ? (p.after as string) : undefined;
  const commit = (st: BaseballState): BaseballState => ({ ...st, g: derive(st.cfg, st) });
  const push = (e: Omit<BaseballEvent, 'id'>): BaseballState => {
    const ev = { id: uid, ...e } as BaseballEvent;
    let events: BaseballEvent[];
    if (after !== undefined) {
      // a correction re-entered at its place in the log ('' = the very start)
      const i = after === '' ? -1 : s.events.findIndex((x) => x.id === after);
      events = i < -1 || (after !== '' && i < 0) ? [...s.events, ev] : [...s.events.slice(0, i + 1), ev, ...s.events.slice(i + 1)];
    } else events = [...s.events, ev];
    return commit({ ...s, seq: s.seq + 1, events });
  };
  switch (a.type) {
    case 'LINEUP': {
      const team = p.team;
      if (team !== 'home' && team !== 'away') return s;
      if (started(s)) return s; // after the first pitch the line-up changes by subs
      const order = (Array.isArray(p.order) ? p.order : []).flatMap((x) => {
        const o = x as Record<string, unknown>;
        const name = typeof o?.name === 'string' ? o.name : '';
        if (!name && !o?.id) return [];
        return [{ ...(typeof o.id === 'string' && o.id ? { id: o.id } : {}), name: name || 'Player', ...(typeof o.pos === 'string' && o.pos ? { pos: o.pos } : {}) }];
      });
      const pitcher = whoIn(p.pitcher);
      return commit({ ...s, lineup: { ...s.lineup, [team]: order.length ? order : undefined }, starters: { ...s.starters, [team]: pitcher } });
    }
    case 'PITCH': {
      const k = p.kind;
      if (!side || (k !== 'ball' && k !== 'called' && k !== 'swinging' && k !== 'foul')) return s;
      const pitcher = whoIn(p.pitcher);
      return push({ type: 'pitch', side, pitch: k, ...(pitcher ? { pitcher } : {}) });
    }
    case 'PLAY': {
      const o = p.outcome as Outcome;
      if (!side || !OUTCOMES.includes(o)) return s;
      const batter = whoIn(p.batter);
      const pitcher = whoIn(p.pitcher);
      const slot = Number((p.batter as Record<string, unknown> | undefined)?.slot);
      const pitch = p.pitch === 'ball' || p.pitch === 'called' || p.pitch === 'swinging' || p.pitch === 'foul' || p.pitch === 'inplay' || p.pitch === 'hbp' ? p.pitch : undefined;
      return push({
        type: 'pa', side, outcome: o, ...(pitch ? { pitch } : {}),
        batter: { ...(batter ?? {}), ...(Number.isFinite(slot) ? { slot } : {}) },
        ...(pitcher ? { pitcher } : {}),
        moves: movesIn(p.moves), outs: Number(p.outs) || 0, rbi: Number(p.rbi) || 0,
        ...(typeof p.fielders === 'string' && p.fielders ? { fielders: p.fielders } : {}),
      });
    }
    case 'RUNNER': {
      const k = p.kind as RunnerKind;
      if (!side || !RUNNER_KINDS.includes(k)) return s;
      const pitcher = whoIn(p.pitcher);
      return push({ type: 'runner', side, kind: k, ...(pitcher ? { pitcher } : {}), moves: movesIn(p.moves), outs: Number(p.outs) || 0 });
    }
    case 'SUB': {
      const k = p.kind;
      const on = whoIn(p.on);
      if (!side || !on || (k !== 'ph' && k !== 'pr' && k !== 'def' && k !== 'p')) return s;
      const off = whoIn(p.off);
      const slot = Number(p.slot);
      const base = Number(p.base);
      return push({
        type: 'sub', side, kind: k, on, ...(off ? { off } : {}),
        ...(Number.isFinite(slot) && p.slot !== undefined && p.slot !== null ? { slot } : {}),
        ...(base === 1 || base === 2 || base === 3 ? { base: base as 1 | 2 | 3 } : {}),
        ...(typeof p.pos === 'string' && p.pos ? { pos: p.pos } : {}),
      });
    }
    case 'EJECT': {
      if (!side) return s;
      const on = whoIn(p.player);
      const official = typeof p.official === 'string' && p.official ? (p.official as string) : undefined;
      if (!on && !official) return s;
      return push({ type: 'eject', side, ...(on ? { on } : {}), ...(official ? { official } : {}) });
    }
    case 'ER': {
      const ref = String(p.ref ?? '');
      if (!s.events.some((e) => e.id === ref)) return s;
      return push({ type: 'er', ref, earned: p.earned !== false });
    }
    case 'REMOVE_EVENT': {
      const id = String(p.id ?? '');
      if (!s.events.some((e) => e.id === id)) return s;
      return commit({ ...s, events: s.events.filter((e) => e.id !== id && !(e.type === 'er' && e.ref === id)) });
    }
    case 'END': {
      // a called game (time limit, weather, light) — the screen asks first
      if (s.g.ended) return s;
      return commit({ ...s, called: true });
    }
    case 'STAT_ADJUST':
    default:
      return s;
  }
};

/* ---------------------------- plays (builders) ----------------------------- */

/** the side at bat now, the batter due and the pitcher on the mound */
export function situation(s: BaseballState): { bat: Side; field: Side; batter: LineupEntry & { slot: number }; pitcher?: Who } {
  const bat = battingSide(s.g.half);
  const field = other(bat);
  const slot = s.g.next[bat];
  const e = s.g.order[bat][slot] ?? { name: `Batter ${slot + 1}` };
  return { bat, field, batter: { ...e, slot }, pitcher: s.g.pitcher[field] };
}

const occupant = (s: BaseballState, b: 1 | 2 | 3): Move | null => {
  const r = s.g.bases[b - 1];
  return r ? { from: b, to: b, ...(r.id ? { id: r.id } : {}), ...(r.name ? { name: r.name } : {}) } : null;
};

/** The usual runner advancement for an outcome (the scorer adjusts it). */
export function defaultMoves(s: BaseballState, o: Outcome): Move[] {
  const r1 = occupant(s, 1), r2 = occupant(s, 2), r3 = occupant(s, 3);
  const b = situation(s).batter;
  const bat = (to: Dest): Move => ({ from: 0, to, ...(b.id ? { id: b.id } : {}), name: b.name });
  const mv = (r: Move | null, to: Dest): Move[] => (r ? [{ ...r, to }] : []);
  /** runners forced by the batter taking first */
  const forced = (): Move[] => [
    ...mv(r1, 2),
    ...(r1 && r2 ? mv(r2, 3) : []),
    ...(r1 && r2 && r3 ? mv(r3, 4) : []),
  ];
  switch (o) {
    case '1B': return [...mv(r3, 4), ...mv(r2, 3), ...mv(r1, 2), bat(1)];
    case '2B': return [...mv(r3, 4), ...mv(r2, 4), ...mv(r1, 3), bat(2)];
    case '3B': return [...mv(r3, 4), ...mv(r2, 4), ...mv(r1, 4), bat(3)];
    case 'HR': return [...mv(r3, 4), ...mv(r2, 4), ...mv(r1, 4), bat(4)];
    case 'BB': case 'IBB': case 'HBP': return [...forced(), bat(1)];
    case 'K': case 'GO': case 'FO': case 'LO': return [bat(-1)];
    case 'SF': return [...mv(r3, 4), bat(-1)];
    case 'SH': return [...mv(r3, 4), ...mv(r2, 3), ...mv(r1, 2), bat(-1)];
    case 'E': return [...mv(r3, 4), ...mv(r2, 3), ...mv(r1, 2), bat(1)];
    case 'FC': {
      if (r1) return [...mv(r1, -1), ...(r2 ? mv(r2, 3) : []), ...(r2 && r3 ? mv(r3, 4) : []), bat(1)];
      const lead = r3 ?? r2;
      return [...mv(lead, -1), ...(lead === r3 ? mv(r2, 3) : []), bat(1)];
    }
    case 'DP': {
      if (r1) return [...mv(r1, -1), bat(-1)];
      const lead = r3 ?? r2;
      return [...mv(lead, -1), bat(-1)];
    }
  }
}

/** Every runner (and the batter) with where the moves send them — for the
 *  advance sheet: unmentioned runners stay. */
export function withStays(s: BaseballState, moves: Move[], batter = true): Move[] {
  const out: Move[] = [];
  for (const b of [3, 2, 1] as const) {
    const occ = occupant(s, b);
    if (!occ) continue;
    out.push(moves.find((m) => m.from === b) ?? occ);
  }
  if (batter) { const bm = moves.find((m) => m.from === 0); if (bm) out.push(bm); }
  return out;
}

/** What a draft play does (runs counted, outs made) — the reducer's own answer. */
function preview(s: BaseballState, a: ScoreAction): { runs: number; outs: number } {
  const uid = String(a.payload?.uid);
  const next = reducer(s, a);
  const ann = next.g.ann[uid];
  return { runs: ann?.runs ?? 0, outs: ann?.outsMade ?? 0 };
}

let uidN = 0;
export const newUid = (): string => `b${Date.now().toString(36)}${(uidN++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export interface PlayOpts { moves?: Move[]; pitch?: BaseballEvent['pitch']; fielders?: string; rbi?: number; uid?: string; extra?: Record<string, unknown> }

/** RBI the play earns by default (OBR 9.04, simplified): the runs it scored,
 *  none on an error or a double play. */
export const defaultRbi = (o: Outcome, runs: number): number => (o === 'E' || o === 'DP' ? 0 : runs);

/** A plate appearance as an action (credits attached). */
export function buildPlay(s: BaseballState, o: Outcome, opts: PlayOpts = {}): ScoreAction {
  const sit = situation(s);
  const uid = opts.uid ?? newUid();
  const moves = (opts.moves ?? defaultMoves(s, o)).filter((m) => !(m.from !== 0 && m.from === m.to));
  const pitch = opts.pitch ?? (o === 'IBB' ? undefined : o === 'HBP' ? 'hbp' : o === 'BB' ? 'ball' : o === 'K' ? 'swinging' : 'inplay');
  const batter = { ...(sit.batter.id ? { id: sit.batter.id } : {}), name: sit.batter.name, slot: sit.batter.slot };
  const base: ScoreAction = {
    type: 'PLAY', side: sit.bat,
    payload: { ...(opts.extra ?? {}), uid, outcome: o, ...(pitch ? { pitch } : {}), batter, ...(sit.pitcher ? { pitcher: sit.pitcher } : {}), moves, ...(opts.fielders ? { fielders: opts.fielders } : {}) },
  };
  const pv = preview(s, base);
  const rbi = opts.rbi ?? defaultRbi(o, pv.runs);
  const payload = { ...base.payload, outs: pv.outs, rbi };
  return withCredits({ ...base, payload }, { type: 'pa', outcome: o, batter, pitcher: sit.pitcher, outs: pv.outs, rbi });
}

/** One pitch. Ball four / strike three (and a slow-pitch 2-strike foul) close
 *  the plate appearance, so they come back as the walk / strikeout play. */
export function buildPitch(s: BaseballState, kind: PitchKind, extra: Record<string, unknown> = {}): ScoreAction {
  const g = s.g;
  if (kind === 'ball' && g.balls >= 3) return buildPlay(s, 'BB', { pitch: 'ball', extra });
  if ((kind === 'called' || kind === 'swinging') && g.strikes >= 2) return buildPlay(s, 'K', { pitch: kind, extra });
  if (kind === 'foul' && g.strikes >= 2 && s.cfg.foulOut) return buildPlay(s, 'K', { pitch: 'foul', extra });
  const sit = situation(s);
  return { type: 'PITCH', side: sit.bat, payload: { ...extra, uid: (extra.uid as string | undefined) ?? newUid(), kind, ...(sit.pitcher ? { pitcher: sit.pitcher } : {}) } };
}

/** A runner play (steal, caught stealing, wild pitch, passed ball, balk,
 *  pick-off, other advance / out). Default moves: a steal / CS / pick-off
 *  takes `base`'s runner; WP / PB / BK move every runner up one. */
export function defaultRunnerMoves(s: BaseballState, kind: RunnerKind, base?: 1 | 2 | 3): Move[] {
  const occ = ([3, 2, 1] as const).map((b) => occupant(s, b)).filter((m): m is Move => !!m);
  const pick = base ? occupant(s, base) : occ[occ.length - 1] ?? null;
  switch (kind) {
    case 'SB': return pick ? [{ ...pick, to: Math.min(4, pick.from + 1) as Dest }] : [];
    case 'CS': case 'PO': case 'OUT': return pick ? [{ ...pick, to: -1 }] : [];
    case 'ADV': return pick ? [{ ...pick, to: Math.min(4, pick.from + 1) as Dest }] : [];
    case 'WP': case 'PB': case 'BK': return occ.map((m) => ({ ...m, to: Math.min(4, m.from + 1) as Dest }));
  }
}
export function buildRunner(s: BaseballState, kind: RunnerKind, moves?: Move[], extra: Record<string, unknown> = {}): ScoreAction {
  const sit = situation(s);
  const uid = (extra.uid as string | undefined) ?? newUid();
  const mv = (moves ?? defaultRunnerMoves(s, kind)).filter((m) => m.from !== m.to);
  const base: ScoreAction = { type: 'RUNNER', side: sit.bat, payload: { ...extra, uid, kind, moves: mv, ...(sit.pitcher ? { pitcher: sit.pitcher } : {}) } };
  const pv = preview(s, base);
  return withCredits({ ...base, payload: { ...base.payload, outs: pv.outs } }, { type: 'runner', kind, moves: mv, pitcher: sit.pitcher, outs: pv.outs });
}

/** The state as it stood just after event `after` ('' = before the first) —
 *  the view a correction is entered against. */
export function stateAfter(s: BaseballState, after: string): BaseballState {
  const i = after === '' ? -1 : s.events.findIndex((e) => e.id === after);
  const events = s.events.slice(0, i + 1);
  const st = { ...s, events, called: false };
  return { ...st, g: derive(s.cfg, st) };
}

/* ----------------------------- derived figures ----------------------------- */

export const isComplete = (s: BaseballState): boolean => !!s.g?.ended;

export function result(s: BaseballState): { winner: Side | 'draw'; home: number; away: number } | null {
  if (!isComplete(s)) return null;
  const { home, away } = s.g.score;
  return { winner: home > away ? 'home' : away > home ? 'away' : 'draw', home, away };
}

/** Innings at bat / in the field for each side (outs ÷ 3), for WBSC TQB. */
export function inningsAtBat(s: BaseballState): { home: number; away: number } {
  const outs = { home: 0, away: 0 };
  for (const e of s.events) {
    const a = s.g.ann[e.id];
    if (!a || a.ignored || (e.type !== 'pa' && e.type !== 'runner')) continue;
    outs[battingSide(a.half)] += a.outsMade;
  }
  return { home: outs.home / 3, away: outs.away / 3 };
}

/** Earned runs scored BY each side (ER-TQB). */
export function earnedRunsBy(s: BaseballState): { home: number; away: number } {
  const out = { home: 0, away: 0 };
  for (const r of s.g.runs) if (r.earned) out[r.side]++;
  return out;
}

/** "Final/10", "Final (run rule, 5 inn)", "▲ 3rd · 1 out" */
export function statusText(s: BaseballState): string {
  const g = s.g;
  if (g.ended) {
    const inn = lastInning(s);
    if (g.endReason === 'mercy') return `Final · run rule (${inn} inn)`;
    if (g.endReason === 'called') return `Final · called (${inn} inn)`;
    if (g.endReason === 'tie') return `Final · tied (${inn} inn)`;
    return inn > s.cfg.innings ? `Final/${inn}` : 'Final';
  }
  if (!started(s)) return 'Play ball';
  return `${halfShort(g.half)} · ${g.outs} out${g.outs === 1 ? '' : 's'}`;
}

/** The inning of the last play (a game over at a half's end has moved on). */
export function lastInning(s: BaseballState): number {
  let h = 0;
  for (const e of s.events) { const a = s.g.ann[e.id]; if (a && !a.ignored && (e.type === 'pa' || e.type === 'runner' || e.type === 'pitch')) h = Math.max(h, a.half); }
  return inningOf(h);
}

export const countText = (g: Game): string => `${g.balls}-${g.strikes}`;

/** The line under the score on a match card: "▲ 3rd · 1 out" / "Final/10". */
export const cardLine = (s: BaseballState): string => (s?.g ? statusText(s) : '');

/* --------------------------- live settings (#14) --------------------------- */

export const BASEBALL_LIVE_SETTINGS: LiveSettings<BaseballState> = {
  title: '⚙️ Scoring settings',
  hint: 'Applies to this game only.',
  mode: 'config',
  fields: [
    { key: 'pitches', label: 'Pitch-by-pitch (balls & strikes)', type: 'toggle', default: true, group: 'Detail' },
    { key: 'askFielders', label: 'Ask for fielders (6-3)', type: 'toggle', default: false, group: 'Detail' },
  ] as FormatField[],
  read: (s) => ({ pitches: s.cfg.pitches, askFielders: s.cfg.askFielders }),
  defaults: { pitches: true, askFielders: false },
};
