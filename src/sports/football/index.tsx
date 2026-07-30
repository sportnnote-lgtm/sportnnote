/**
 * Football plugin — archetype: goal/time.
 *
 * Captures the full set of in-game events an organizer logs live: goals (with
 * scorer + assist), yellow/red cards, substitutions and own goals — each
 * attributed to a player and stamped with the match minute. A running clock and
 * an event timeline render on the live page (LiveExtras), visible to everyone.
 *
 * Clean sheets are NOT a live action: they're awarded automatically at full
 * time to the GK/defenders (from the lineup) of whichever side conceded zero.
 *
 * The reducer is pure, so it can't read the clock — the controls compute the
 * current minute (via `currentMinute`) and pass it in `payload.minute`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip, TextField } from '../../components/ui';
import { Pitch } from './Pitch';
import { LineupView } from './LineupView';
import { Timeline } from './Timeline';
import { DEFENSIVE_POSITIONS, emptyFormation } from './formation';
import { useSpeech } from '../../core/speech';
import { normalizeCommand as llmNormalize, enabled as llmEnabled } from '../../core/voiceLLM';
import { parseIntent, parseGoalType, matchPlayer, matchTeam, isNoAssist, isYes, isNo, deburr } from './voiceCommands';
import type { FootballEvent, GoalType, BodyPart } from './events';
import { type StatEvent, type StatKind, STAT_META, EVENT_META, GOAL_TYPE_LABEL, BODY_PART_LABEL } from './events';
import type { Player } from '../../core/types';
import type { ScoreAction, SportPlugin } from '../types';

/** How a level result at full time is settled. */
export type Decider = 'none' | 'extra_time' | 'penalties';

export interface FootballState {
  home: number;
  away: number;
  /** 1/2 = regulation halves; 3/4 = extra-time halves (knockout only). */
  half: 1 | 2 | 3 | 4;
  /** ms epoch the current half's clock started; undefined = paused (pre-KO / HT) */
  startedAt?: number;
  events: FootballEvent[];
  seq: number;
  ended: boolean;
  // format (from the tournament/match)
  playersPerSide: number;
  subType: 'rolling' | 'fixed';
  maxSubs: number;
  subsUsed: { home: number; away: number };
  /** names already substituted off (for 'fixed', they can't return) */
  subbedOff: { home: string[]; away: string[] };
  /** knockout tie — a level result at full time must be decided (derived: decider !== 'none') */
  knockout: boolean;
  /** how a level result at full time is settled: draw stands / extra time then
   *  penalties / straight to penalties */
  decider: Decider;
  /** penalty shootout kicks (true = scored); null until the shootout starts */
  shootout: { home: boolean[]; away: boolean[] } | null;
  /** who won the shootout, once decided */
  shootoutWinner?: 'home' | 'away';
  /** minutes per half (format: halfMinutes) — editable last-minute */
  halfMinutes: number;
  /** minutes per extra-time half (knockout) — scorer can adjust when starting ET */
  etMinutes: number;
  /** extra substitutions unlocked when extra time begins (per team) */
  etExtraSubs: number;
  /** added (injury) time the fourth official signalled, per half */
  /** Added (injury) minutes announced per half. Extra time is halves 3 & 4, so
   *  all four are keyed — a 2-key record silently returned `undefined` in ET and
   *  the added-time prompt never appeared. */
  stoppage: { 1: number; 2: number; 3: number; 4: number };
  /** granular, player-attributed match stats (shots, fouls, corners…) */
  stats: StatEvent[];
  /** time-based possession: who has the ball, when they got it, accrued ms each */
  possession: { side: 'home' | 'away' | null; sinceAt?: number; acc: { home: number; away: number } };
  /** which aspects this scorer is tracking for THIS match (game-wise settings) */
  track: TrackConfig;
}

/** Per-match toggle of which stats the scorer captures — set game-wise so a
 *  last-minute stand-in scorer can switch off whatever they can't keep up with. */
export interface TrackConfig {
  shots: boolean;
  possession: boolean;
  fouls: boolean;
  cards: boolean;
  offsides: boolean;
  corners: boolean;
  tackles: boolean;
  interceptions: boolean;
  saves: boolean;
  passes: boolean;
  crosses: boolean;
  dribbles: boolean;
  handball: boolean;
  /** catch-all "positive contribution" buttons for fast logging */
  attackContribution: boolean;
  defenceContribution: boolean;
}

const TRACK_KEYS: (keyof TrackConfig)[] = ['shots', 'possession', 'fouls', 'cards', 'offsides', 'corners', 'tackles', 'interceptions', 'saves', 'passes', 'crosses', 'dribbles', 'handball', 'attackContribution', 'defenceContribution'];
const readTrack = (config?: Record<string, unknown>): TrackConfig => {
  const cap = (k: string) => k[0].toUpperCase() + k.slice(1);
  const def: Record<keyof TrackConfig, boolean> = {
    shots: true, possession: true, fouls: true, cards: true, offsides: true,
    corners: true, tackles: true, interceptions: true, saves: true, passes: false, // passes off by default (too fast for one scorer)
    crosses: true, dribbles: true, handball: true,
    attackContribution: true, defenceContribution: true,
  };
  const out = {} as TrackConfig;
  for (const k of TRACK_KEYS) {
    const v = config?.[`track${cap(k)}`];
    out[k] = v === undefined ? def[k] : Boolean(v);
  }
  return out;
};

const init = (config?: Record<string, unknown>): FootballState => ({
  home: 0, away: 0, half: 1, events: [], seq: 0, ended: false,
  playersPerSide: Number(config?.playersPerSide ?? 11),
  subType: (config?.subType as 'rolling' | 'fixed') ?? 'rolling',
  // format editor exposes this as `substitutes`; older mock data used `maxSubs`
  maxSubs: Number(config?.substitutes ?? config?.maxSubs ?? 5),
  subsUsed: { home: 0, away: 0 },
  subbedOff: { home: [], away: [] },
  ...(() => {
    // New matches carry `decider`; older ones only had the `knockout` boolean
    // (true = extra time then penalties). Map both to the decider + knockout flag.
    const decider: Decider = (config?.decider as Decider) ?? (config?.knockout ? 'extra_time' : 'none');
    return { decider, knockout: decider !== 'none' };
  })(),
  shootout: null,
  halfMinutes: Number(config?.halfMinutes ?? 45),
  etMinutes: Number(config?.extraTimeMinutes ?? 15),
  etExtraSubs: Number(config?.extraTimeSubs ?? 1),
  stoppage: { 1: 0, 2: 0, 3: 0, 4: 0 },
  stats: [],
  possession: { side: null, acc: { home: 0, away: 0 } },
  track: readTrack(config),
});

/** Decide a penalty shootout: best-of-five (clinched early when a lead can't be
 *  caught), then sudden death once both have taken five. */
function decideShootout(h: boolean[], a: boolean[]): 'home' | 'away' | undefined {
  const hs = h.filter(Boolean).length;
  const as = a.filter(Boolean).length;
  const hRem = Math.max(0, 5 - h.length);
  const aRem = Math.max(0, 5 - a.length);
  if (h.length <= 5 && a.length <= 5) {
    if (hs > as + aRem) return 'home';
    if (as > hs + hRem) return 'away';
  }
  if (h.length === a.length && h.length >= 5 && hs !== as) return hs > as ? 'home' : 'away';
  return undefined;
}
/** Goals scored in the shootout (for tallies). */
export const penScore = (s: FootballState) => ({
  home: s.shootout?.home.filter(Boolean).length ?? 0,
  away: s.shootout?.away.filter(Boolean).length ?? 0,
});

/** How each half is spoken about in the UI. */
const HALF_NAME: Record<1 | 2 | 3 | 4, string> = { 1: 'first half', 2: 'second half', 3: 'first period of extra time', 4: 'second period of extra time' };

/** Elapsed-minute offset at the START of each half: 0, 45, 90, 105 (halves 1-4). */
const startOffset = (s: FootballState): number => {
  const { halfMinutes: hm, etMinutes: et } = s;
  return s.half === 1 ? 0 : s.half === 2 ? hm : s.half === 3 ? 2 * hm : 2 * hm + et;
};

/** Live match minute, derived from the running clock. Safe to call in UI.
 *  Holds at the half's regulation end + any signalled added time rather than
 *  drifting past it — the manual clock never auto-ends a half, so otherwise a
 *  long-open tab reads "90+59'". Signalling added time (SET_STOPPAGE) extends it. */
export function currentMinute(s: FootballState): number {
  const base = startOffset(s);
  if (!s.startedAt) return base;
  const raw = base + Math.floor((Date.now() - s.startedAt) / 60000);
  return Math.min(raw, halfBase(s) + s.stoppage[s.half]);
}

/** The regulation end-of-half minute (45 / 90 / 105 / 120). Base for "+x" display. */
export const halfBase = (s: FootballState): number => {
  const { halfMinutes: hm, etMinutes: et } = s;
  return s.half === 1 ? hm : s.half === 2 ? 2 * hm : s.half === 3 ? 2 * hm + et : 2 * hm + 2 * et;
};

/** Clock label: "37'" in regulation, "45+2'" once past the half's base minute. */
export function clockLabel(s: FootballState): string {
  const min = currentMinute(s);
  const base = halfBase(s);
  return min > base ? `${base}+${min - base}'` : `${min}'`;
}

/** Running clock with seconds for the live display: "37:24" in regulation,
 *  "45+2:14" in added time. Events stay stamped in whole minutes (see
 *  `currentMinute`); this is only for the ticking on-screen clock. */
export function clockTime(s: FootballState): string {
  const base = startOffset(s);
  const elapsedSec = s.startedAt ? Math.max(0, Math.floor((Date.now() - s.startedAt) / 1000)) : 0;
  const bMin = halfBase(s);
  // Cap at the half's regulation end + signalled added time (see currentMinute).
  const totalSec = Math.min(base * 60 + elapsedSec, (bMin + s.stoppage[s.half]) * 60);
  const totalMin = Math.floor(totalSec / 60);
  const ss = String(totalSec % 60).padStart(2, '0');
  return totalMin > bMin ? `${bMin}+${totalMin - bMin}:${ss}` : `${totalMin}:${ss}`;
}

/** Accrue the current possession segment up to `at`, returning new acc totals. */
function accrue(s: FootballState, at: number): { home: number; away: number } {
  const p = s.possession;
  if (!p.side || !p.sinceAt || !at) return p.acc;
  return { ...p.acc, [p.side]: p.acc[p.side] + Math.max(0, at - p.sinceAt) };
}
/** Live possession split (0–100) including the running segment. */
export function possessionPct(s: FootballState, nowMs: number): { home: number; away: number } {
  const acc = accrue(s, nowMs);
  const total = acc.home + acc.away;
  if (total <= 0) return { home: 50, away: 50 };
  const home = Math.round((acc.home / total) * 100);
  return { home, away: 100 - home };
}

const push = (s: FootballState, e: Omit<FootballEvent, 'id'>): FootballState => ({
  ...s,
  seq: s.seq + 1,
  events: [...s.events, { ...e, id: s.seq + 1 }],
});

const reducer = (s: FootballState, a: ScoreAction): FootballState => {
  // Once full time is called, only shootout actions are still accepted.
  if (s.ended && a.type !== 'END' && a.type !== 'START_SHOOTOUT' && a.type !== 'START_EXTRA_TIME' && a.type !== 'PEN') return s;
  const minute = Number(a.payload?.minute ?? currentMinute(s));
  // The half an event belongs to: carried in the payload when the controls stamp
  // it (handles stoppage time + backfill correctly); else the current half.
  const evHalf: 1 | 2 | 3 | 4 = (a.payload?.half as 1 | 2 | 3 | 4 | undefined) ?? s.half;
  const name = a.attribution?.playerName;
  switch (a.type) {
    case 'KICKOFF': {
      const at = Number(a.payload?.at);
      // first kickoff sets who has the ball; a 2nd-half restart keeps the side
      const side = (a.payload?.possSide as 'home' | 'away') ?? s.possession.side ?? 'home';
      return { ...s, startedAt: at, possession: { ...s.possession, side, sinceAt: at } };
    }
    case 'POSSESSION': {
      const at = Number(a.payload?.at);
      const side = a.payload?.side as 'home' | 'away';
      if (side !== 'home' && side !== 'away') return s;
      return { ...s, possession: { side, sinceAt: at, acc: accrue(s, at) } };
    }
    case 'STAT': {
      const kind = a.payload?.kind as StatKind;
      if (!kind || (a.side !== 'home' && a.side !== 'away')) return s;
      const at = Number(a.payload?.at ?? 0);
      const ev: StatEvent = {
        id: s.seq + 1,
        kind,
        side: a.side,
        playerId: a.attribution?.playerId,
        playerName: a.attribution?.playerName ?? (a.payload?.playerName as string | undefined),
        secondName: a.payload?.secondName as string | undefined, // foul: who was fouled
        minute,
        half: evHalf,
        onTarget: a.payload?.onTarget as boolean | undefined,
        complete: a.payload?.complete as boolean | undefined,
      };
      let next: FootballState = { ...s, seq: s.seq + 1, stats: [...s.stats, ev] };
      // some actions hand the ball to the other side (foul, corner won, tackle…)
      const poss = a.payload?.possSide as 'home' | 'away' | undefined;
      if (poss === 'home' || poss === 'away') {
        next = { ...next, possession: { side: poss, sinceAt: at || s.possession.sinceAt, acc: accrue(s, at) } };
      }
      return next;
    }
    case 'GOAL': {
      if (!a.side) return s;
      const scored = { ...s, [a.side]: s[a.side] + 1 } as FootballState;
      return push(scored, { minute, half: evHalf, type: 'goal', side: a.side, playerName: name, goalType: a.payload?.goalType as FootballEvent['goalType'], bodyPart: a.payload?.bodyPart as BodyPart | undefined });
    }
    case 'OWN_GOAL': {
      if (!a.side) return s; // side = team awarded the goal
      const scored = { ...s, [a.side]: s[a.side] + 1 } as FootballState;
      // playerName = the opposing player who put it into their own net (no goal credited).
      return push(scored, { minute, half: evHalf, type: 'owngoal', side: a.side, playerName: a.payload?.scorerName as string | undefined });
    }
    case 'ASSIST': {
      if (!a.side || !name) return s;
      // The assist is recorded immediately after its goal, so attach it to the
      // most recent goal of this side (overwriting any prior assister).
      const events = [...s.events];
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === 'goal' && events[i].side === a.side) {
          events[i] = { ...events[i], secondName: name };
          return { ...s, events };
        }
      }
      return s;
    }
    case 'SET_STOPPAGE':
      return { ...s, stoppage: { ...s.stoppage, [s.half]: Math.max(0, Number(a.payload?.minutes ?? 0)) } };
    case 'YELLOW':
      return a.side ? push(s, { minute, half: evHalf, type: 'yellow', side: a.side, playerName: name }) : s;
    case 'RED':
      return a.side ? push(s, { minute, half: evHalf, type: 'red', side: a.side, playerName: name, secondYellow: a.payload?.secondYellow as boolean | undefined }) : s;
    case 'SUB': {
      if (!a.side || s.subsUsed[a.side] >= s.maxSubs) return s;
      const offName = String(a.payload?.offName ?? '');
      const withEvent = push(s, { minute, half: evHalf, type: 'sub', side: a.side, playerName: offName, secondName: String(a.payload?.onName ?? '') });
      return {
        ...withEvent,
        subsUsed: { ...s.subsUsed, [a.side]: s.subsUsed[a.side] + 1 },
        subbedOff: { ...s.subbedOff, [a.side]: [...s.subbedOff[a.side], offName] },
      };
    }
    case 'UNDO_GOAL': {
      if (!a.side) return s;
      const idx = [...s.events].reverse().findIndex((e) => e.type === 'goal' && e.side === a.side);
      if (idx === -1 || s[a.side] === 0) return s;
      const realIdx = s.events.length - 1 - idx;
      return {
        ...s,
        [a.side]: s[a.side] - 1,
        events: s.events.filter((_, i) => i !== realIdx),
      } as FootballState;
    }
    case 'REMOVE_EVENT': {
      // Surgically remove one logged moment (goal/card/sub/stat), reversing its
      // effect on the score/subs. Logged like any action, so it replays cleanly.
      const id = Number(a.payload?.id);
      if (a.payload?.target === 'stat') return { ...s, stats: s.stats.filter((e) => e.id !== id) };
      const ev = s.events.find((e) => e.id === id);
      if (!ev) return s;
      let next: FootballState = { ...s, events: s.events.filter((e) => e.id !== id) };
      if (ev.type === 'goal' || ev.type === 'owngoal') next = { ...next, [ev.side]: Math.max(0, next[ev.side] - 1) } as FootballState;
      else if (ev.type === 'sub') next = { ...next, subsUsed: { ...next.subsUsed, [ev.side]: Math.max(0, next.subsUsed[ev.side] - 1) }, subbedOff: { ...next.subbedOff, [ev.side]: next.subbedOff[ev.side].filter((n) => n !== ev.playerName) } };
      return next;
    }
    case 'NEXT_HALF': {
      // 1→2 (regulation) and 3→4 (extra time). Other transitions are explicit.
      const nextHalf = s.half === 1 ? 2 : s.half === 3 ? 4 : null;
      if (nextHalf == null) return s;
      return { ...s, half: nextHalf, startedAt: undefined, possession: { side: s.possession.side, sinceAt: undefined, acc: accrue(s, Number(a.payload?.at ?? 0)) } };
    }
    case 'END':
      return { ...s, ended: true, startedAt: undefined, possession: { side: s.possession.side, sinceAt: undefined, acc: accrue(s, Number(a.payload?.at ?? 0)) } };
    case 'START_EXTRA_TIME':
      // A level tie at full time of the 2nd half, when the decider is extra time →
      // extra time (un-ends the match, moves to ET1, grants the extra ET sub).
      if (!s.ended || s.home !== s.away || s.decider !== 'extra_time' || s.half !== 2 || s.shootout) return s;
      return { ...s, ended: false, half: 3, startedAt: undefined, maxSubs: s.maxSubs + s.etExtraSubs, etMinutes: Number(a.payload?.etMinutes ?? s.etMinutes) };
    case 'START_SHOOTOUT':
      // only from a level result at full time of a knockout tie
      if (!s.ended || s.home !== s.away || s.shootout) return s;
      return { ...s, shootout: { home: [], away: [] } };
    case 'PEN': {
      if (!s.shootout || s.shootoutWinner || (a.side !== 'home' && a.side !== 'away')) return s;
      const scored = Boolean(a.payload?.scored);
      const shootout = { ...s.shootout, [a.side]: [...s.shootout[a.side], scored] };
      return { ...s, shootout, shootoutWinner: decideShootout(shootout.home, shootout.away) };
    }
    default:
      return s;
  }
};

const cardCount = (events: FootballEvent[], type: 'yellow' | 'red', side: 'home' | 'away') =>
  events.filter((e) => e.type === type && e.side === side).length;

export interface TeamStatTotals {
  shots: number; shotsOnTarget: number; fouls: number; yellow: number; red: number;
  offsides: number; corners: number; tackles: number; interceptions: number; saves: number;
  passes: number; passesComplete: number; crosses: number; dribbles: number; handballs: number;
  attackContributions: number; defenceContributions: number;
}
const blankTotals = (): TeamStatTotals => ({
  shots: 0, shotsOnTarget: 0, fouls: 0, yellow: 0, red: 0, offsides: 0, corners: 0,
  tackles: 0, interceptions: 0, saves: 0, passes: 0, passesComplete: 0, crosses: 0, dribbles: 0, handballs: 0,
  attackContributions: 0, defenceContributions: 0,
});
export interface PlayerStatLine { id: string; name: string; side: 'home' | 'away'; goals: number; shots: number; shotsOnTarget: number; fouls: number; tackles: number; interceptions: number; saves: number; }

/** Aggregate the granular stats into FIFA-style team totals + per-player lines.
 *  A goal counts as a shot on target (so the scorer logs Shot only for attempts
 *  that did NOT score). */
export function footballStats(s: FootballState, nowMs: number) {
  const totals = { home: blankTotals(), away: blankTotals() };
  const players = new Map<string, PlayerStatLine>();
  const line = (id: string, name: string | undefined, side: 'home' | 'away') => {
    let p = players.get(id);
    if (!p) { p = { id, name: name ?? 'Player', side, goals: 0, shots: 0, shotsOnTarget: 0, fouls: 0, tackles: 0, interceptions: 0, saves: 0 }; players.set(id, p); }
    return p;
  };
  for (const e of s.stats) {
    const t = totals[e.side];
    const p = e.playerId ? line(e.playerId, e.playerName, e.side) : undefined;
    switch (e.kind) {
      case 'shot': t.shots++; if (e.onTarget) t.shotsOnTarget++; if (p) { p.shots++; if (e.onTarget) p.shotsOnTarget++; } break;
      case 'foul': t.fouls++; if (p) p.fouls++; break;
      case 'offside': t.offsides++; break;
      case 'corner': t.corners++; break;
      case 'tackle': t.tackles++; if (p) p.tackles++; break;
      case 'interception': t.interceptions++; if (p) p.interceptions++; break;
      case 'save': t.saves++; if (p) p.saves++; break;
      case 'pass': t.passes++; if (e.complete) t.passesComplete++; break;
      case 'cross': t.crosses++; break;
      case 'dribble': t.dribbles++; break;
      case 'handball': t.handballs++; break;
      case 'attackContribution': t.attackContributions++; break;
      case 'defenceContribution': t.defenceContributions++; break;
    }
  }
  for (const e of s.events) {
    if (e.type === 'goal') { totals[e.side].shots++; totals[e.side].shotsOnTarget++; } // a goal is a shot on target
    else if (e.type === 'yellow') totals[e.side].yellow++;
    else if (e.type === 'red') totals[e.side].red++;
  }
  const poss = possessionPct(s, nowMs);
  const passAcc = (t: TeamStatTotals) => (t.passes ? Math.round((t.passesComplete / t.passes) * 100) : 0);
  return {
    totals,
    possession: poss,
    passAcc: { home: passAcc(totals.home), away: passAcc(totals.away) },
    players: [...players.values()],
  };
}

/* ------------------------------- Controls ---------------------------------- */

/** A tappable player list shown as a table — jersey number, name, position —
 *  so picking who did something while scoring live is fast and unambiguous. */
const PlayerTable = ({
  players,
  onPick,
  selectedId,
}: {
  players: Player[];
  onPick: (p: Player) => void;
  selectedId?: string;
}) => (
  <View style={ctrl.table}>
    {players.length === 0 ? (
      <Text style={ctrl.meta}>No players on the field.</Text>
    ) : (
      players.map((p) => (
        <TouchableOpacity accessibilityRole="button"
          key={p.id}
          style={[ctrl.prow, p.id === selectedId && ctrl.prowSel]}
          activeOpacity={0.7}
          onPress={() => onPick(p)}
        >
          <View style={ctrl.jersey}><Text style={ctrl.jerseyTxt}>{p.jerseyNo ?? '–'}</Text></View>
          <Text style={ctrl.pname} numberOfLines={1}>{p.fullName}</Text>
          {p.sportDetails?.football?.position ? <Text style={ctrl.ppos}>{p.sportDetails.football.position}</Text> : null}
        </TouchableOpacity>
      ))
    )}
  </View>
);

// How a goal was WON (its body part is a separate choice — see BodyPart).
const GOAL_TYPES: GoalType[] = ['open', 'penalty', 'freekick'];
const BODY_PARTS: BodyPart[] = ['left', 'right', 'head', 'chest'];

/** Flow state for the multi-step capture (goal, foul, or a generic stat/card). */
type Flow =
  | { mode: 'goal'; side: 'home' | 'away'; step: 'scorer' }
  | { mode: 'goal'; side: 'home' | 'away'; step: 'og' }
  | { mode: 'goal'; side: 'home' | 'away'; step: 'type'; scorer: Player }
  | { mode: 'goal'; side: 'home' | 'away'; step: 'body'; scorer: Player; goalType: GoalType }
  | { mode: 'goal'; side: 'home' | 'away'; step: 'assist'; scorer: Player }
  | { mode: 'foul'; step: 'team' }
  | { mode: 'foul'; step: 'by'; side: 'home' | 'away' }
  | { mode: 'foul'; step: 'victim'; side: 'home' | 'away'; fouler: Player }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'team' }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'player'; side: 'home' | 'away' }
  | { mode: 'stat'; kind: StatKind | 'card'; step: 'detail'; side: 'home' | 'away'; player: Player }
  // A shot on target branches into its outcome (saved / blocked / goal).
  | { mode: 'stat'; kind: 'shot'; step: 'outcome'; side: 'home' | 'away'; player: Player }
  | { mode: 'stat'; kind: 'shot'; step: 'blocker'; side: 'home' | 'away'; player: Player }
  // Penalty: won by → taken by → scored / saved / missed.
  | { mode: 'pen'; step: 'team' }
  | { mode: 'pen'; step: 'wonBy'; side: 'home' | 'away' }
  | { mode: 'pen'; step: 'takenBy'; side: 'home' | 'away'; wonBy?: Player }
  | { mode: 'pen'; step: 'outcome'; side: 'home' | 'away'; taker: Player; wonBy?: Player };

const ScoringControls: SportPlugin<FootballState>['ScoringControls'] = ({
  state,
  dispatch,
  homeName,
  awayName,
  homeColor,
  awayColor,
  homeRoster = [],
  awayRoster = [],
  homeLineup = [],
  awayLineup = [],
}) => {
  // Team kit colours for the home/away controls (fall back to the app's accents).
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const [sub, setSub] = useState<{ side: 'home' | 'away'; off?: Player } | null>(null);
  // Multi-step capture: tap an action → pick the player(s) from a jersey+name
  // table → any follow-up (goal type, assist, on/off target). One tap per step.
  const [flow, setFlow] = useState<Flow | null>(null);
  // Joining a game already in progress: the minute to kick the clock off at.
  const [koMin, setKoMin] = useState('');
  // Backfill mode: when set, everything logged is stamped at this past minute
  // (so the scorer can catch up on events that happened before they started).
  const [backfillMin, setBackfillMin] = useState<number | null>(null);
  const [backfillText, setBackfillText] = useState('');
  // Show the "correct the timeline" editor (remove/edit a specific past moment).
  const [showEdit, setShowEdit] = useState(false);
  // Editing a past moment: re-entered events are stamped at this original minute
  // (auto-clears when the re-entry flow closes).
  const [editMin, setEditMin] = useState<number | null>(null);
  // Scorer-adjustable extra-time half length (knockout ties).
  const [etMins, setEtMins] = useState(state.etMinutes);
  const opp = (side: 'home' | 'away') => (side === 'home' ? 'away' : 'home');
  // Re-render every few seconds so time-based prompts (added time) keep up.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.startedAt || state.ended) return;
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [state.startedAt, state.ended]);

  // Stamp every event with the live minute — or, when backfilling / editing a past
  // moment, that past minute — plus the half it belongs to (a past minute derives
  // its half; live events use the current half).
  const pastMin = editMin ?? backfillMin;
  const fire = (action: ScoreAction) => {
    const hm = state.halfMinutes, et = state.etMinutes;
    const halfFromMin = (m: number): 1 | 2 | 3 | 4 => (m < hm ? 1 : m < 2 * hm ? 2 : m < 2 * hm + et ? 3 : 4);
    const half = pastMin != null ? halfFromMin(pastMin) : state.half;
    dispatch({ ...action, payload: { ...action.payload, minute: pastMin ?? currentMinute(state), half } });
  };

  // When a re-entry flow finishes (or is cancelled), stop stamping at the edited minute.
  useEffect(() => {
    if (flow === null && editMin != null) setEditMin(null);
  }, [flow]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = state.track;
  // The player-attributed stat keys being tracked this match — stamped on each
  // stat line so a profile can show "this total spans N of M games".
  const trackedKeys = (): string[] => {
    const keys = ['goals', 'openPlayGoals', 'penaltyGoals', 'freekickGoals', 'assists', 'yellowCards', 'redCards', 'cleanSheets'];
    if (t.shots) keys.push('shots', 'shotsOnTarget');
    if (t.fouls) keys.push('fouls');
    if (t.tackles) keys.push('tackles');
    if (t.interceptions) keys.push('interceptions');
    if (t.saves) keys.push('saves');
    if (t.passes) keys.push('passes', 'passesComplete');
    if (t.attackContribution) keys.push('attackingContributions');
    if (t.defenceContribution) keys.push('defensiveContributions');
    return keys;
  };

  const attr = (side: 'home' | 'away', type: string, stat: string, p: Player, extra?: Record<string, number>) =>
    fire({ type, side, attribution: { playerId: p.id, stat, playerName: p.fullName, extra, tracked: trackedKeys() } });

  // Record a card. A player's second yellow is also a red (sending off), flagged
  // so it shows as a red badge with a "2".
  const recordCard = (side: 'home' | 'away', color: 'yellow' | 'red', p: Player) => {
    if (color === 'red') { attr(side, 'RED', 'redCards', p); return; }
    const secondYellow = state.events.some((e) => e.type === 'yellow' && e.playerName === p.fullName);
    attr(side, 'YELLOW', 'yellowCards', p);
    if (secondYellow) {
      fire({ type: 'RED', side, payload: { secondYellow: true }, attribution: { playerId: p.id, stat: 'redCards', playerName: p.fullName, tracked: trackedKeys() } });
    }
  };

  // Which side the ball goes to after each kind of action.
  const handover = (kind: StatKind, side: 'home' | 'away'): 'home' | 'away' | undefined => {
    if (kind === 'foul' || kind === 'offside' || kind === 'handball') return side === 'home' ? 'away' : 'home';
    if (kind === 'tackle' || kind === 'interception' || kind === 'save' || kind === 'corner' || kind === 'defenceContribution') return side;
    return undefined; // shot / pass / cross / dribble / attacking play — possession unchanged
  };
  const STAT_KEY: Partial<Record<StatKind, string>> = { shot: 'shots', foul: 'fouls', offside: 'offsides', tackle: 'tackles', interception: 'interceptions', save: 'saves', pass: 'passes', cross: 'crosses', dribble: 'dribbles', handball: 'handballs', attackContribution: 'attackingContributions', defenceContribution: 'defensiveContributions', penaltyWon: 'penaltiesWon', penaltyMissed: 'penaltiesMissed' };
  const recordStat = (kind: StatKind, side: 'home' | 'away', player?: Player, detail?: { onTarget?: boolean; complete?: boolean }) => {
    const statKey = STAT_KEY[kind];
    // a shot on target also bumps shotsOnTarget; a completed pass bumps passesComplete
    const extra: Record<string, number> | undefined =
      kind === 'shot' && detail?.onTarget ? { shotsOnTarget: 1 }
      : kind === 'pass' && detail?.complete ? { passesComplete: 1 }
      : undefined;
    fire({
      type: 'STAT', side,
      payload: { kind, possSide: handover(kind, side), at: Date.now(), ...detail, playerName: player?.fullName },
      attribution: player && statKey ? { playerId: player.id, stat: statKey, playerName: player.fullName, extra, tracked: trackedKeys() } : undefined,
    });
    setFlow(null);
  };
  const setPossession = (side: 'home' | 'away') => dispatch({ type: 'POSSESSION', payload: { side, at: Date.now() } });
  const playerNeeded = (kind: StatKind | 'card') => kind !== 'corner';
  const detailNeeded = (kind: StatKind | 'card') => kind === 'shot' || kind === 'pass' || kind === 'card';

  const rosterOf = (side: 'home' | 'away') => (side === 'home' ? homeRoster : awayRoster);
  const lineupOf = (side: 'home' | 'away') => (side === 'home' ? homeLineup : awayLineup);

  // The 11 currently on the pitch: the starting XI from the lineup, with each
  // substitution applied. Falls back to the full squad if no lineup is set.
  const xi = (side: 'home' | 'away'): Player[] => {
    const roster = rosterOf(side);
    const byId = new Map(roster.map((p) => [p.id, p]));
    const byName = new Map(roster.map((p) => [p.fullName, p]));
    let names = lineupOf(side)
      .filter((sl) => sl.playerId)
      .map((sl) => byId.get(sl.playerId!)?.fullName ?? sl.playerName)
      .filter((n): n is string => !!n);
    if (names.length === 0) return roster;
    for (const e of state.events) {
      if (e.type === 'sub' && e.side === side && e.playerName && e.secondName) {
        names = names.map((n) => (n === e.playerName ? e.secondName! : n));
      }
    }
    return names.map((n) => byName.get(n)).filter((p): p is Player => !!p);
  };
  // The bench = squad members not currently on the pitch (and, for fixed subs,
  // not already withdrawn).
  const benchOf = (side: 'home' | 'away'): Player[] => {
    const onIds = new Set(xi(side).map((p) => p.id));
    return rosterOf(side)
      .filter((p) => !onIds.has(p.id))
      .filter((p) => state.subType !== 'fixed' || !state.subbedOff[side].includes(p.fullName));
  };

  // Each goal credits the total (`goals`) and a type-specific tally so a profile
  // shows the open-play / penalty / free-kick split alongside the total.
  const GOAL_STAT: Record<GoalType, string> = { open: 'openPlayGoals', header: 'openPlayGoals', penalty: 'penaltyGoals', freekick: 'freekickGoals' };
  // The team's current goalkeeper (the GK in the on-field XI) — saves default to
  // them, so the scorer doesn't pick a player for every save.
  const gkOf = (side: 'home' | 'away'): Player | undefined => {
    const gkSlot = lineupOf(side).find((sl) => sl.position === 'GK' && sl.playerId);
    const onField = xi(side);
    return (gkSlot && onField.find((p) => p.id === gkSlot.playerId))
      ?? onField.find((p) => p.sportDetails?.football?.position === 'GK');
  };

  const recordGoal = (side: 'home' | 'away', scorer: Player, goalType: GoalType, bodyPart?: BodyPart) =>
    fire({ type: 'GOAL', side, payload: { goalType, bodyPart }, attribution: { playerId: scorer.id, stat: 'goals', playerName: scorer.fullName, extra: { shots: 1, shotsOnTarget: 1, [GOAL_STAT[goalType]]: 1 }, tracked: trackedKeys() } });
  const recordOwnGoal = (side: 'home' | 'away', scorer: Player) => {
    fire({ type: 'OWN_GOAL', side, payload: { scorerName: scorer.fullName } });
    setFlow(null);
  };
  // Team goal — no named scorer. Keeps the scoreline correct for a friendly whose
  // players aren't on the app yet; who scored can be filled in later via the
  // timeline editor once they register.
  const recordTeamGoal = (side: 'home' | 'away') => {
    fire({ type: 'GOAL', side, payload: { goalType: 'open' } });
    setFlow(null);
  };
  const recordAssist = (side: 'home' | 'away', p: Player | null) => {
    if (p) attr(side, 'ASSIST', 'assists', p);
    setFlow(null);
  };

  // ----- Correct the timeline: remove one specific past moment (not undo-all) -----
  // The negative attribution reverses that action's stat line; the reducer reverses
  // its score/subs effect. Both are logged, so the correction replays cleanly.
  const rosterId = (nm?: string) => [...homeRoster, ...awayRoster].find((p) => p.fullName === nm)?.id;
  const removeEvent = (ev: FootballEvent) => {
    const pid = rosterId(ev.playerName);
    let attribution: ScoreAction['attribution'];
    if (ev.type === 'goal' && pid) attribution = { playerId: pid, stat: 'goals', by: -1, playerName: ev.playerName, extra: { shots: -1, shotsOnTarget: -1, [GOAL_STAT[ev.goalType ?? 'open']]: -1 } };
    else if (ev.type === 'yellow' && pid) attribution = { playerId: pid, stat: 'yellowCards', by: -1, playerName: ev.playerName };
    else if (ev.type === 'red' && pid) attribution = { playerId: pid, stat: 'redCards', by: -1, playerName: ev.playerName };
    dispatch({ type: 'REMOVE_EVENT', payload: { id: ev.id, target: 'event' }, attribution });
    // A goal's assist is a separate log entry keyed to the goal's `secondName` —
    // reverse the assister's tally too so an edit/remove leaves no phantom assist.
    if (ev.type === 'goal' && ev.secondName) {
      const aid = rosterId(ev.secondName);
      if (aid) dispatch({ type: 'REMOVE_EVENT', payload: { id: -1, target: 'stat' }, attribution: { playerId: aid, stat: 'assists', by: -1, playerName: ev.secondName } });
    }
  };
  const removeStat = (st: StatEvent) => {
    const key = STAT_KEY[st.kind];
    const extra: Record<string, number> | undefined =
      st.kind === 'shot' && st.onTarget ? { shotsOnTarget: -1 } : st.kind === 'pass' && st.complete ? { passesComplete: -1 } : undefined;
    const attribution = st.playerId && key ? { playerId: st.playerId, stat: key, by: -1, playerName: st.playerName, extra } : undefined;
    dispatch({ type: 'REMOVE_EVENT', payload: { id: st.id, target: 'stat' }, attribution });
  };
  // Edit a moment in place = remove the old one, then re-enter it through its normal
  // flow stamped at the SAME minute (so all match/profile stats re-adjust to match).
  const editEvent = (ev: FootballEvent) => {
    removeEvent(ev);
    setEditMin(ev.minute);
    setShowEdit(false);
    if (ev.type === 'goal') setFlow({ mode: 'goal', side: ev.side, step: 'scorer' });
    else if (ev.type === 'owngoal') setFlow({ mode: 'goal', side: ev.side, step: 'og' });
    else if (ev.type === 'yellow' || ev.type === 'red') setFlow({ mode: 'stat', kind: 'card', step: 'player', side: ev.side });
    else if (ev.type === 'sub') setSub({ side: ev.side });
  };
  const editStat = (st: StatEvent) => {
    removeStat(st);
    setEditMin(st.minute);
    setShowEdit(false);
    if (st.kind === 'foul') setFlow({ mode: 'foul', step: 'by', side: st.side });
    else if (playerNeeded(st.kind)) setFlow({ mode: 'stat', kind: st.kind, step: 'player', side: st.side });
    else setFlow({ mode: 'stat', kind: st.kind, step: 'team' });
  };
  const recordFoul = (side: 'home' | 'away', fouler: Player, victim: Player) => {
    fire({
      type: 'STAT', side,
      payload: { kind: 'foul', possSide: opp(side), at: Date.now(), playerName: fouler.fullName, secondName: victim.fullName },
      attribution: { playerId: fouler.id, stat: 'fouls', playerName: fouler.fullName, tracked: trackedKeys() },
    });
    setFlow(null);
  };

  // Penalty in open play: credit who won it, then the outcome — a scored goal, or
  // a miss (with the opponent GK's save when saved). Each is its own timeline row.
  const finishPenalty = (side: 'home' | 'away', outcome: 'scored' | 'saved' | 'missed', taker: Player, wonBy?: Player) => {
    if (wonBy) recordStat('penaltyWon', side, wonBy);
    if (outcome === 'scored') {
      recordGoal(side, taker, 'penalty');
    } else {
      recordStat('penaltyMissed', side, taker);
      if (outcome === 'saved') { const gk = gkOf(opp(side)); if (gk) recordStat('save', opp(side), gk); }
    }
    setFlow(null);
  };

  const endMatch = () => {
    const award = (side: 'home' | 'away', lineup: typeof homeLineup) =>
      lineup
        .filter((s) => s.playerId && DEFENSIVE_POSITIONS.has(s.position))
        .forEach((s) =>
          dispatch({ type: 'CLEAN_SHEET', side, attribution: { playerId: s.playerId!, stat: 'cleanSheets', playerName: s.playerName } })
        );
    if (state.away === 0) award('home', homeLineup);
    if (state.home === 0) award('away', awayLineup);
    dispatch({ type: 'END' });
  };

  // ───────────────────────── Voice scoring ─────────────────────────
  // Spoken commands drive the very same flow the buttons do. The command is
  // interpreted in the context of the current step ("who scored?" → a name).
  const [feedback, setFeedback] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const cardColor = useRef<'yellow' | 'red' | null>(null);
  const homeTeams = [homeName, homeRoster[0]?.houseName].filter(Boolean) as string[];
  const awayTeams = [awayName, awayRoster[0]?.houseName].filter(Boolean) as string[];
  const teamName = (s: 'home' | 'away') => (s === 'home' ? homeName : awayName);

  const processCommand = (raw: string, fromLLM = false) => {
    const text = raw.trim();
    if (!text) return;
    const say = setFeedback;

    // ---- Mid-flow: the utterance answers the current question. ----
    if (flow) {
      if (parseIntent(text).kind === 'cancel') { setFlow(null); cardColor.current = null; say('Cancelled.'); return; }
      if (flow.mode === 'goal') {
        if (flow.step === 'scorer') {
          if (/own goal/.test(deburr(text))) { setFlow({ mode: 'goal', side: flow.side, step: 'og' }); say('Own goal — which opponent?'); return; }
          const p = matchPlayer(text, xi(flow.side));
          if (p) { setFlow({ mode: 'goal', side: flow.side, step: 'type', scorer: p }); say(`${p.fullName} — penalty, free kick, header or open play?`); }
          else say("Didn't catch the scorer — say a name.");
          return;
        }
        if (flow.step === 'og') { const p = matchPlayer(text, xi(opp(flow.side))); if (p) { recordOwnGoal(flow.side, p); say(`Own goal by ${p.fullName}.`); } else say("Didn't catch the player."); return; }
        if (flow.step === 'type') { const gt = parseGoalType(text) ?? 'open'; recordGoal(flow.side, flow.scorer, gt); setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: flow.scorer }); say(`${GOAL_TYPE_LABEL[gt]} — who assisted? (or say "no assist")`); return; }
        // assist
        if (isNoAssist(text)) { recordAssist(flow.side, null); say('Goal recorded — no assist.'); return; }
        const a = matchPlayer(text, xi(flow.side).filter((x) => x.id !== flow.scorer.id));
        if (a) { recordAssist(flow.side, a); say(`Assist: ${a.fullName}.`); } else say('Say the assister\'s name, or "no assist".');
        return;
      }
      if (flow.mode === 'foul') {
        if (flow.step === 'team') { const s = matchTeam(text, homeTeams, awayTeams); if (s) { setFlow({ mode: 'foul', step: 'by', side: s }); say('Who committed the foul?'); } else say('Which team committed it?'); return; }
        if (flow.step === 'by') { const p = matchPlayer(text, xi(flow.side)); if (p) { setFlow({ mode: 'foul', step: 'victim', side: flow.side, fouler: p }); say(`${p.fullName} fouled whom?`); } else say("Didn't catch the player."); return; }
        const v = matchPlayer(text, xi(opp(flow.side))); if (v) { recordFoul(flow.side, flow.fouler, v); say(`Foul: ${flow.fouler.fullName} on ${v.fullName}.`); } else say("Didn't catch the player."); return;
      }
      // generic stat (shot / corner / card / save / tackle / …)
      if (flow.mode === 'stat') {
        if (flow.step === 'team') {
          const s = matchTeam(text, homeTeams, awayTeams); if (!s) { say('Which team?'); return; }
          const kind = flow.kind;
          if (kind === 'save') { const gk = gkOf(s); if (gk) { recordStat('save', s, gk); say(`Save by ${gk.fullName}.`); } else setFlow({ mode: 'stat', kind, step: 'player', side: s }); return; }
          if (!playerNeeded(kind)) { recordStat(kind as StatKind, s); say(`${STAT_META[kind].label} — ${teamName(s)}.`); return; }
          setFlow({ mode: 'stat', kind, step: 'player', side: s }); say('Which player?'); return;
        }
        if (flow.step === 'player') {
          const p = matchPlayer(text, xi(flow.side)); if (!p) { say("Didn't catch the player."); return; }
          if (flow.kind === 'card') {
            const col = cardColor.current;
            if (col) { recordCard(flow.side, col, p); cardColor.current = null; setFlow(null); say(`${col} card: ${p.fullName}.`); }
            else { setFlow({ mode: 'stat', kind: 'card', step: 'detail', side: flow.side, player: p }); say('Yellow or red?'); }
            return;
          }
          if (detailNeeded(flow.kind)) { setFlow({ mode: 'stat', kind: flow.kind, step: 'detail', side: flow.side, player: p }); say(flow.kind === 'shot' ? 'On target or off?' : 'Completed or misplaced?'); return; }
          recordStat(flow.kind as StatKind, flow.side, p); say(`${STAT_META[flow.kind as StatKind].label}: ${p.fullName}.`); return;
        }
        // detail
        const { kind, side, player } = flow;
        if (kind === 'card') { const col = /red/.test(deburr(text)) ? 'red' : /yellow/.test(deburr(text)) ? 'yellow' : null; if (!col) { say('Yellow or red?'); return; } recordCard(side, col, player); setFlow(null); say(`${col} card: ${player.fullName}.`); return; }
        if (kind === 'shot') { const on = isYes(text) ? true : isNo(text) ? false : undefined; if (on === undefined) { say('On target or off target?'); return; } recordStat('shot', side, player, { onTarget: on }); say(`Shot ${on ? 'on' : 'off'} target: ${player.fullName}.`); return; }
        if (kind === 'pass') { const c = /complete|accurate/.test(deburr(text)) ? true : /misplace|incomplete|miss/.test(deburr(text)) ? false : undefined; if (c === undefined) { say('Completed or misplaced?'); return; } recordStat('pass', side, player, { complete: c }); say(`Pass: ${player.fullName}.`); return; }
      }
      say("Didn't catch that — try again or say 'cancel'.");
      return;
    }

    // ---- No flow: a fresh command. ----
    const intent = parseIntent(text);
    const teamIn = matchTeam(text, homeTeams, awayTeams);
    const startStat = (kind: StatKind | 'card') => setFlow({ mode: 'stat', kind, step: 'team' });
    switch (intent.kind) {
      case 'kickoff': if (!state.startedAt) { dispatch({ type: 'KICKOFF', payload: { at: Date.now() } }); say('Kicked off ▶'); } else say('Already underway.'); return;
      case 'endHalf': if (state.half === 1 || state.half === 3) { const ended = HALF_NAME[state.half]; dispatch({ type: 'NEXT_HALF', payload: { at: Date.now() } }); say(`Ended the ${ended}.`); } else say('Say "full time" to end the match.'); return;
      case 'fullTime': endMatch(); say('Full time — match ended.'); return;
      case 'goal': { const side = teamIn ?? state.possession.side ?? 'home'; setFlow({ mode: 'goal', side, step: 'scorer' }); say(`Goal for ${teamName(side)} — who scored?`); return; }
      case 'ownGoal': { const side = teamIn ?? 'home'; setFlow({ mode: 'goal', side, step: 'og' }); say(`Own goal for ${teamName(side)} — which opponent?`); return; }
      case 'card': {
        cardColor.current = intent.color ?? null;
        if (teamIn) {
          const p = matchPlayer(text, xi(teamIn));
          if (p && intent.color) { recordCard(teamIn, intent.color, p); cardColor.current = null; say(`${intent.color} card: ${p.fullName}.`); return; }
          setFlow({ mode: 'stat', kind: 'card', step: 'player', side: teamIn }); say(`${intent.color ?? 'Card'} — who?`); return;
        }
        startStat('card'); say(`${intent.color ? intent.color + ' card' : 'Card'} — which team?`); return;
      }
      case 'foul': setFlow({ mode: 'foul', step: 'team' }); say('Foul — which team?'); return;
      case 'sub': { const side = teamIn ?? 'home'; setSub({ side }); say(`Substitution — ${teamName(side)}: pick who comes off.`); return; }
      case 'corner': { if (teamIn) { recordStat('corner', teamIn); say(`Corner — ${teamName(teamIn)}.`); } else { startStat('corner'); say('Corner — which team?'); } return; }
      case 'offside': { if (teamIn) { recordStat('offside', teamIn); say(`Offside — ${teamName(teamIn)}.`); } else { startStat('offside'); say('Offside — which team?'); } return; }
      case 'save': startStat('save'); say('Save — which team? (credited to their keeper)'); return;
      case 'tackle': startStat('tackle'); say('Tackle — which team?'); return;
      case 'interception': startStat('interception'); say('Interception — which team?'); return;
      case 'shot': startStat('shot'); say('Shot — which team?'); return;
      case 'attack': startStat('attackContribution'); say('Attacking play — which team?'); return;
      case 'defence': startStat('defenceContribution'); say('Defensive play — which team?'); return;
      default:
        // Free-form phrasing the grammar didn't catch → ask the optional LLM to
        // normalise it to a canonical command, then re-run that through the grammar.
        // `fromLLM` guards against a loop if the LLM echoes something unparseable.
        if (!fromLLM && llmEnabled()) {
          say('🤖 interpreting…');
          const players = [...xi('home'), ...xi('away')].map((p) => p.fullName);
          void llmNormalize(text, { teams: { home: homeName, away: awayName }, players }).then((cmd) => {
            if (cmd && deburr(cmd) !== deburr(text)) processCommand(cmd, true);
            else say(`Didn't recognise "${text}".`);
          });
          return;
        }
        say(`Didn't recognise "${text}". Try: goal, yellow card, corner, substitution, kick off.`);
        return;
    }
  };

  const speech = useSpeech(processCommand);
  const sendTyped = () => { if (voiceText.trim()) { processCommand(voiceText); setVoiceText(''); } };
  // Use a real player from this match in the example, not a stock "Kane" no one
  // on the teamsheet recognises. Falls back to a name-free example if empty.
  const samplePlayer = (homeRoster[0] ?? awayRoster[0])?.fullName?.split(' ')[0];
  const cmdPlaceholder = samplePlayer
    ? `…or type a command (e.g. "goal", "${samplePlayer}", "penalty")`
    : '…or type a command (e.g. "goal", "penalty")';
  const voiceBar = (
    <View style={ctrl.voiceBar}>
      <View style={ctrl.row}>
        <Button
          label={speech.listening ? '🛑 Stop listening' : '🎤 Voice scoring'}
          variant={speech.listening ? 'danger' : 'ghost'}
          style={ctrl.flex}
          onPress={() => (speech.listening ? speech.stop() : speech.supported ? speech.start() : setFeedback('Voice needs Chrome/Edge on web — use the text box below.'))}
        />
      </View>
      {speech.interim ? (
        <Text style={ctrl.voiceHeard}>🎙 {speech.interim}</Text>
      ) : feedback ? (
        <Text style={ctrl.voiceFeedback}>🤖 {feedback}</Text>
      ) : (
        <Text style={ctrl.meta}>Say e.g. “goal”, “yellow card”, “corner”, “substitution”, “kick off”. Then answer its follow-ups by voice.</Text>
      )}
      <View style={ctrl.row}>
        <View style={ctrl.flex}><TextField label="" value={voiceText} onChange={setVoiceText} placeholder={cmdPlaceholder} /></View>
        <Button label="Send" variant="ghost" onPress={sendTyped} disabled={!voiceText.trim()} />
      </View>
    </View>
  );

  // Substitution UI — shared between the live controls and the half-time break.
  const subSection = (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>
        🔄 Substitution · {state.subType} · {state.maxSubs - state.subsUsed.home}/{state.maxSubs} {homeName}{state.subsUsed.home >= state.maxSubs ? ' (none left)' : ''}, {state.maxSubs - state.subsUsed.away}/{state.maxSubs} {awayName}{state.subsUsed.away >= state.maxSubs ? ' (none left)' : ''}
      </Text>
      <View style={ctrl.row}>
        <Button label={state.subsUsed.home >= state.maxSubs ? `${homeName} · no subs left` : `Sub — ${homeName}`} variant="ghost" style={ctrl.flex}
          disabled={state.subsUsed.home >= state.maxSubs}
          onPress={() => setSub(sub?.side === 'home' ? null : { side: 'home' })} />
        <Button label={state.subsUsed.away >= state.maxSubs ? `${awayName} · no subs left` : `Sub — ${awayName}`} variant="ghost" style={ctrl.flex}
          disabled={state.subsUsed.away >= state.maxSubs}
          onPress={() => setSub(sub?.side === 'away' ? null : { side: 'away' })} />
      </View>
      {sub && (
        <View style={ctrl.subBox}>
          <Text style={ctrl.meta}>Player OFF (on the field):</Text>
          <PlayerTable players={xi(sub.side)} selectedId={sub.off?.id} onPick={(p) => setSub({ ...sub, off: p })} />
          {sub.off && (
            <>
              <Text style={ctrl.meta}>Player ON (from the bench){state.subType === 'fixed' ? ' — withdrawn players unavailable' : ''}:</Text>
              <PlayerTable players={benchOf(sub.side)} onPick={(p) => { fire({ type: 'SUB', side: sub.side, payload: { offName: sub.off!.fullName, onName: p.fullName } }); setSub(null); }} />
            </>
          )}
        </View>
      )}
    </View>
  );

  // Pre-kickoff / half-time / extra-time breaks: show the clock-start control.
  if (!state.startedAt && !state.ended) {
    const base = startOffset(state);
    // Joining a game already in progress: start the clock at the current minute.
    const startAt = koMin.trim() === '' ? base : Math.max(base, Math.floor(Number(koMin)) || base);
    const kickoff = () => dispatch({ type: 'KICKOFF', payload: { at: Date.now() - Math.max(0, startAt - base) * 60000 } });
    const koLabel = state.half === 1 ? 'Kick off' : state.half === 2 ? 'Start 2nd half' : state.half === 3 ? 'Start extra time' : 'Start ET 2nd half';
    const breakMsg = state.half === 1 ? 'Set the lineup, then kick off to start the clock.'
      : state.half === 2 ? 'Half time — make any substitutions, then start the second half.'
      : state.half === 3 ? `Extra time (${state.etMinutes}′ halves) — make substitutions, then kick off.`
      : 'Extra-time break — then start the second ET half.';
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.meta}>{breakMsg}</Text>
        {/* #7 / Phase C: substitutions during any break (HT and the extra-time breaks). */}
        {state.half >= 2 && subSection}
        {/* #6: joining a match already underway — start the clock at the live minute. */}
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={ctrl.meta}>⏱ Already underway? Enter the current match minute (optional).</Text>
          <TextField label="" value={koMin} onChange={setKoMin} placeholder={`e.g. ${base + 25}`} autoCapitalize="none" />
        </View>
        <Button label={startAt > base ? `▶ ${koLabel} at ${startAt}'` : `▶ ${koLabel}`} onPress={kickoff} />
        {voiceBar}
      </View>
    );
  }

  // Level knockout tie: after full time offer extra time (following the 2nd half)
  // or penalties; once the shootout is under way, the shootout controls take over.
  if (state.ended) {
    if (state.shootout) return <ShootoutControls state={state} dispatch={dispatch} homeName={homeName} awayName={awayName} />;
    // Extra time is only offered when it's the chosen decider and we're at the end
    // of normal time; "penalties straightaway" jumps direct to the shootout.
    const canET = state.half === 2 && state.decider === 'extra_time';
    const atFullTime = state.half === 2;
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <View style={ctrl.addedBox}>
          <Text style={ctrl.label}>⏱ {atFullTime ? 'Full time — level' : 'Extra time over — still level'}</Text>
          <Text style={ctrl.meta}>{homeName} {state.home}–{state.away} {awayName}. {canET ? 'Play extra time, or go straight to penalties.' : 'Decide it on penalties.'}</Text>
          {canET && (
            <>
              <View style={ctrl.row}>
                <Button label="−1'" variant="ghost" style={ctrl.flex} onPress={() => setEtMins((m) => Math.max(1, m - 1))} />
                <Text style={[ctrl.label, { alignSelf: 'center' }]}>{etMins}′ halves</Text>
                <Button label="+1'" variant="ghost" style={ctrl.flex} onPress={() => setEtMins((m) => m + 1)} />
              </View>
              <Button label={`▶ Extra time · 2×${etMins}′ · +${state.etExtraSubs} sub`} variant="home" onPress={() => dispatch({ type: 'START_EXTRA_TIME', payload: { etMinutes: etMins } })} />
            </>
          )}
          <Button label="Penalty shootout →" variant="danger" onPress={() => dispatch({ type: 'START_SHOOTOUT' })} />
        </View>
      </View>
    );
  }

  // ----- Multi-step capture (goal / foul / generic stat) -----
  const panel = (title: string, hint: string | undefined, body: React.ReactNode) => (
    <View style={{ gap: theme.spacing(3) }}>
      <View style={ctrl.flowPanel}>
        <View style={ctrl.extrasHeader}>
          <Text style={ctrl.label}>{title}</Text>
          <Button label="Cancel" variant="ghost" onPress={() => setFlow(null)} />
        </View>
        {editMin != null ? <Text style={ctrl.editBanner}>✎ Re-entering the {editMin}&apos; moment — your pick replaces the old one.</Text> : null}
        {hint ? <Text style={ctrl.meta}>{hint}</Text> : null}
        {body}
      </View>
      {voiceBar}
    </View>
  );
  const teamButtons = (onSide: (side: 'home' | 'away') => void) => (
    <View style={ctrl.row}>
      <Button label={homeName} variant="home" color={hc} style={ctrl.flex} onPress={() => onSide('home')} />
      <Button label={awayName} variant="away" color={ac} style={ctrl.flex} onPress={() => onSide('away')} />
    </View>
  );

  if (flow) {
    if (flow.mode === 'goal') {
      const sideName = flow.side === 'home' ? homeName : awayName;
      if (flow.step === 'scorer') {
        return panel(`⚽ Goal — ${sideName}`, 'Who scored?', (
          <>
            <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'goal', side: flow.side, step: 'type', scorer: p })} />
            <Button label={`⚽ Team goal — no scorer${xi(flow.side).length === 0 ? ' (no players yet)' : ''}`} variant="ghost" onPress={() => recordTeamGoal(flow.side)} />
            <Button label="🥅 Own goal instead" variant="ghost" onPress={() => setFlow({ mode: 'goal', side: flow.side, step: 'og' })} />
          </>
        ));
      }
      if (flow.step === 'og') {
        return panel(`🥅 Own goal → ${sideName}`, `Which ${flow.side === 'home' ? awayName : homeName} player put it into their own net?`, (
          <PlayerTable players={xi(opp(flow.side))} onPick={(p) => recordOwnGoal(flow.side, p)} />
        ));
      }
      if (flow.step === 'type') {
        return panel(`⚽ Goal — ${flow.scorer.fullName}`, 'How was it won?', (
          <View style={ctrl.chips}>
            {GOAL_TYPES.map((g) => (
              <Button key={g} label={GOAL_TYPE_LABEL[g]} variant="ghost" style={ctrl.actionBtn}
                onPress={() => setFlow({ mode: 'goal', side: flow.side, step: 'body', scorer: flow.scorer, goalType: g })} />
            ))}
          </View>
        ));
      }
      if (flow.step === 'body') {
        return panel(`⚽ Goal — ${flow.scorer.fullName}`, 'Struck with?', (
          <View style={ctrl.chips}>
            {BODY_PARTS.map((b) => (
              <Button key={b} label={BODY_PART_LABEL[b]} variant="ghost" style={ctrl.actionBtn}
                onPress={() => { recordGoal(flow.side, flow.scorer, flow.goalType, b); setFlow({ mode: 'goal', side: flow.side, step: 'assist', scorer: flow.scorer }); }} />
            ))}
          </View>
        ));
      }
      return panel(`🅰️ Assist — ${sideName}`, `Who assisted ${flow.scorer.fullName}'s goal?`, (
        <>
          <PlayerTable players={xi(flow.side).filter((p) => p.id !== flow.scorer.id)} onPick={(p) => recordAssist(flow.side, p)} />
          <Button label="No assist" variant="ghost" onPress={() => recordAssist(flow.side, null)} />
        </>
      ));
    }

    if (flow.mode === 'foul') {
      if (flow.step === 'team') {
        return panel('🟫 Foul', 'Which team committed it?', teamButtons((side) => setFlow({ mode: 'foul', step: 'by', side })));
      }
      if (flow.step === 'by') {
        const sideName = flow.side === 'home' ? homeName : awayName;
        return panel(`🟫 Foul — ${sideName}`, 'Who committed the foul?', (
          <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'foul', step: 'victim', side: flow.side, fouler: p })} />
        ));
      }
      return panel(`🟫 ${flow.fouler.fullName} fouled…`, 'Who was fouled?', (
        <PlayerTable players={xi(opp(flow.side))} onPick={(v) => recordFoul(flow.side, flow.fouler, v)} />
      ));
    }

    if (flow.mode === 'pen') {
      if (flow.step === 'team') {
        return panel('🥅 Penalty', 'Which team has the penalty?', teamButtons((side) => setFlow({ mode: 'pen', step: 'wonBy', side })));
      }
      const sideName = flow.side === 'home' ? homeName : awayName;
      if (flow.step === 'wonBy') {
        return panel(`🥅 Penalty — ${sideName}`, 'Who won the penalty?', (
          <>
            <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'pen', step: 'takenBy', side: flow.side, wonBy: p })} />
            <Button label="Skip — not recorded" variant="ghost" onPress={() => setFlow({ mode: 'pen', step: 'takenBy', side: flow.side })} />
          </>
        ));
      }
      if (flow.step === 'takenBy') {
        return panel(`🥅 Penalty — ${sideName}`, 'Who is taking it?', (
          <PlayerTable players={xi(flow.side)} onPick={(p) => setFlow({ mode: 'pen', step: 'outcome', side: flow.side, taker: p, wonBy: flow.wonBy })} />
        ));
      }
      return panel(`🥅 Penalty — ${flow.taker.fullName}`, 'Outcome?', (
        <View style={ctrl.row}>
          <Button label="⚽ Scored" variant="home" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'scored', flow.taker, flow.wonBy)} />
          <Button label="🧤 Saved" variant="ghost" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'saved', flow.taker, flow.wonBy)} />
          <Button label="🚫 Missed" variant="ghost" style={ctrl.flex} onPress={() => finishPenalty(flow.side, 'missed', flow.taker, flow.wonBy)} />
        </View>
      ));
    }

    // Generic stat (shot, corner, offside, tackle, interception, save, pass, card)
    const meta = flow.kind === 'card' ? { icon: '🟨', label: 'Card' } : STAT_META[flow.kind];
    if (flow.step === 'team') {
      const kind = flow.kind;
      const hint = kind === 'save' ? 'Which team made the save? (credited to their goalkeeper)' : 'Which team?';
      return panel(`${meta.icon} ${meta.label}`, hint, teamButtons((side) => {
        // A save defaults to the team's current goalkeeper — no player pick needed.
        if (kind === 'save') {
          const gk = gkOf(side);
          return gk ? recordStat('save', side, gk) : setFlow({ mode: 'stat', kind, step: 'player', side });
        }
        return playerNeeded(kind)
          ? setFlow({ mode: 'stat', kind, step: 'player', side })
          : recordStat(kind as StatKind, side);
      }));
    }
    if (flow.step === 'player') {
      const sideName = flow.side === 'home' ? homeName : awayName;
      return panel(`${meta.icon} ${meta.label} — ${sideName}`, 'Who?', (
        <PlayerTable players={xi(flow.side)} onPick={(p) => (
          detailNeeded(flow.kind)
            ? setFlow({ mode: 'stat', kind: flow.kind, step: 'detail', side: flow.side, player: p })
            : recordStat(flow.kind as StatKind, flow.side, p)
        )} />
      ));
    }
    const { kind, side, player } = flow;
    if (kind === 'shot') {
      // On-target shots branch into their outcome; a block is credited to the defender.
      if (flow.step === 'outcome') {
        return panel(`🎯 On target — ${player.fullName}`, 'What happened?', (
          <View style={{ gap: theme.spacing(2) }}>
            <View style={ctrl.row}>
              <Button label="⚽ Goal" variant="home" style={ctrl.flex} onPress={() => setFlow({ mode: 'goal', side, step: 'type', scorer: player })} />
              <Button label="🧤 Saved" variant="ghost" style={ctrl.flex}
                onPress={() => { recordStat('shot', side, player, { onTarget: true }); const gk = gkOf(opp(side)); if (gk) recordStat('save', opp(side), gk); }} />
            </View>
            <View style={ctrl.row}>
              <Button label="🧱 Blocked" variant="ghost" style={ctrl.flex}
                onPress={() => { recordStat('shot', side, player, { onTarget: true }); setFlow({ mode: 'stat', kind: 'shot', step: 'blocker', side, player }); }} />
              <Button label="On target only" variant="ghost" style={ctrl.flex} onPress={() => recordStat('shot', side, player, { onTarget: true })} />
            </View>
          </View>
        ));
      }
      if (flow.step === 'blocker') {
        return panel('🧱 Blocked by…', `Which ${opp(side) === 'home' ? homeName : awayName} player blocked it?`, (
          <PlayerTable players={xi(opp(side))} onPick={(b) => recordStat('defenceContribution', opp(side), b)} />
        ));
      }
      return panel(`🎯 Shot — ${player.fullName}`, 'On target?', (
        <View style={ctrl.row}>
          <Button label="🎯 On target" variant="home" style={ctrl.flex} onPress={() => setFlow({ mode: 'stat', kind: 'shot', step: 'outcome', side, player })} />
          <Button label="↗ Off target" variant="ghost" style={ctrl.flex} onPress={() => recordStat('shot', side, player, { onTarget: false })} />
        </View>
      ));
    }
    if (kind === 'pass') {
      return panel(`➡️ Pass — ${player.fullName}`, 'Pass outcome?', (
        <View style={ctrl.row}>
          <Button label="✓ Completed" variant="home" style={ctrl.flex} onPress={() => recordStat('pass', side, player, { complete: true })} />
          <Button label="✗ Misplaced" variant="ghost" style={ctrl.flex} onPress={() => recordStat('pass', side, player, { complete: false })} />
        </View>
      ));
    }
    return panel(`🟨 Card — ${player.fullName}`, 'Which card?', (
      <View style={ctrl.row}>
        <Button label="🟨 Yellow" variant="home" style={[ctrl.flex, { backgroundColor: theme.colors.accent }]} onPress={() => { recordCard(side, 'yellow', player); setFlow(null); }} />
        <Button label="🟥 Red" variant="danger" style={ctrl.flex} onPress={() => { recordCard(side, 'red', player); setFlow(null); }} />
      </View>
    ));
  }

  // ----- Main controls -----
  // Actions grouped so the scorer scans by phase of play, not one long list.
  const trackFor: Record<string, boolean> = {
    shot: t.shots, cross: t.crosses, dribble: t.dribbles, corner: t.corners, pass: t.passes, attackContribution: t.attackContribution,
    tackle: t.tackles, interception: t.interceptions, save: t.saves, defenceContribution: t.defenceContribution,
    foul: t.fouls, offside: t.offsides, handball: t.handball, card: t.cards,
  };
  const ACTION_GROUPS: { title: string; kinds: (StatKind | 'card')[] }[] = [
    { title: '⚡ Attacking', kinds: ['shot', 'cross', 'dribble', 'corner', 'pass', 'attackContribution'] },
    { title: '🛡️ Defensive', kinds: ['tackle', 'interception', 'save', 'defenceContribution'] },
    { title: '🟨 Discipline', kinds: ['foul', 'offside', 'handball', 'card'] },
  ];
  const startAction = (kind: StatKind | 'card') =>
    setFlow(kind === 'foul' ? { mode: 'foul', step: 'team' } : { mode: 'stat', kind, step: 'team' });

  return (
    <View style={{ gap: theme.spacing(4) }}>
      {voiceBar}
      {t.possession && <PossessionBar state={state} homeName={homeName} awayName={awayName} homeColor={hc} awayColor={ac} onSwitch={setPossession} />}

      {/* Goal — one flow: scorer (or own goal) → goal type → assist. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>⚽ Goal</Text>
        <Text style={ctrl.meta}>Pick the scorer (or own goal), the goal type, then the assist.</Text>
        <View style={ctrl.row}>
          <Button label={`Goal — ${homeName}`} variant="home" color={hc} style={ctrl.flex} onPress={() => setFlow({ mode: 'goal', side: 'home', step: 'scorer' })} />
          <Button label={`Goal — ${awayName}`} variant="away" color={ac} style={ctrl.flex} onPress={() => setFlow({ mode: 'goal', side: 'away', step: 'scorer' })} />
        </View>
      </View>

      {/* Penalty — won by → taken by → scored / saved / missed (credits the GK on a save). */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>🥅 Penalty</Text>
        <Text style={ctrl.meta}>Who won it, who took it, and whether it was scored, saved or missed.</Text>
        <Button label="Award a penalty" variant="ghost" onPress={() => setFlow({ mode: 'pen', step: 'team' })} />
      </View>

      {ACTION_GROUPS.map((g) => {
        const kinds = g.kinds.filter((k) => trackFor[k]);
        if (kinds.length === 0) return null;
        return (
          <View key={g.title} style={{ gap: theme.spacing(2) }}>
            <Text style={ctrl.label}>{g.title}</Text>
            <View style={ctrl.chips}>
              {kinds.map((k) => {
                const m = k === 'card' ? { icon: '🟨', label: 'Card' } : STAT_META[k];
                return <Button key={k} label={`${m.icon} ${m.label}`} variant="ghost" style={ctrl.actionBtn} onPress={() => startAction(k)} />;
              })}
            </View>
          </View>
        );
      })}

      {subSection}

      {/* #6: backfill — catch up on events that happened before scoring started.
          While active, every logged action is stamped at the chosen past minute. */}
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={ctrl.label}>⏪ Backfill an earlier moment</Text>
        {backfillMin == null ? (
          <>
            <Text style={ctrl.meta}>Started scoring late? Enter a past minute — everything you log is stamped there until you go back to live.</Text>
            <View style={ctrl.row}>
              <View style={ctrl.flex}><TextField label="" value={backfillText} onChange={setBackfillText} placeholder="minute, e.g. 12" autoCapitalize="none" /></View>
              <Button label="Backfill" variant="ghost" disabled={backfillText.trim() === ''} onPress={() => setBackfillMin(Math.max(0, Math.floor(Number(backfillText)) || 0))} />
            </View>
          </>
        ) : (
          <View style={ctrl.addedBox}>
            <Text style={ctrl.label}>⏪ Backfilling at {backfillMin}&apos;</Text>
            <Text style={ctrl.meta}>Every action you log now is stamped at {backfillMin}&apos;. Adjust the minute, or go back to live scoring.</Text>
            <View style={ctrl.row}>
              <Button label="−1'" variant="ghost" style={ctrl.flex} onPress={() => setBackfillMin(Math.max(0, backfillMin - 1))} />
              <Button label="+1'" variant="ghost" style={ctrl.flex} onPress={() => setBackfillMin(backfillMin + 1)} />
              <Button label="▶ Back to live" variant="home" style={ctrl.flex} onPress={() => { setBackfillMin(null); setBackfillText(''); }} />
            </View>
          </View>
        )}
      </View>

      {/* B9: correct the timeline — remove one specific wrong moment (e.g. a mistaken
          decision at 10') without undoing everything back to it. */}
      <View style={{ gap: theme.spacing(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={ctrl.label}>🗓 Correct the timeline</Text>
          <Button label={showEdit ? 'Done' : 'Edit'} variant="ghost" onPress={() => setShowEdit((v) => !v)} />
        </View>
        {showEdit && (() => {
          const items = [
            ...state.events.map((e) => ({ key: `e${e.id}`, minute: e.minute, order: e.id, label: `${EVENT_META[e.type].icon} ${EVENT_META[e.type].label}${e.type === 'sub' ? ` — ${e.secondName ?? ''} for ${e.playerName ?? ''}` : e.playerName ? ` — ${e.playerName}` : ''}`, onRemove: () => removeEvent(e), onEdit: () => editEvent(e) })),
            ...state.stats.map((st) => ({ key: `s${st.id}`, minute: st.minute, order: st.id, label: `${STAT_META[st.kind].icon} ${STAT_META[st.kind].label}${st.playerName ? ` — ${st.playerName}` : ''}`, onRemove: () => removeStat(st), onEdit: () => editStat(st) })),
          ].sort((a, b) => b.minute - a.minute || b.order - a.order);
          if (items.length === 0) return <Text style={ctrl.meta}>Nothing logged yet.</Text>;
          return (
            <View style={{ gap: theme.spacing(1) }}>
              <Text style={ctrl.meta}>Tap Edit to re-pick the player/type (stamped at the same minute — every stat re-adjusts), or Remove to delete it. Nothing else is touched.</Text>
              {items.map((it) => (
                <View key={it.key} style={ctrl.editRow}>
                  <Text style={ctrl.editMin}>{it.minute}&apos;</Text>
                  <Text style={ctrl.editLabel} numberOfLines={1}>{it.label}</Text>
                  <Text style={ctrl.editEdit} onPress={it.onEdit}>✎ Edit</Text>
                  <Text style={ctrl.editRemove} onPress={it.onRemove}>✕</Text>
                </View>
              ))}
            </View>
          );
        })()}
      </View>

      {/* Added (injury) time: near the half's end, prompt for the minutes; then
          count up as 45+x / 90+x; once they're up, nudge to end. */}
      {(() => {
        const base = halfBase(state);
        const min = currentMinute(state);
        // `?? 0` covers matches saved before ET halves were keyed here.
        const stop = state.stoppage[state.half] ?? 0;
        if (stop === 0 && min >= base - 2) {
          return (
            <View style={ctrl.addedBox}>
              <Text style={ctrl.label}>⏱ Added time</Text>
              <Text style={ctrl.meta}>The {HALF_NAME[state.half]} is nearly up — enter the minutes of added (injury) time.</Text>
              <View style={ctrl.chips}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((m) => (
                  <Button key={m} label={`+${m}`} variant="ghost" style={ctrl.actionBtn} onPress={() => dispatch({ type: 'SET_STOPPAGE', payload: { minutes: m } })} />
                ))}
              </View>
            </View>
          );
        }
        if (stop > 0 && min >= base + stop) {
          return <Text style={ctrl.endNudge}>⏱ {stop}′ added time is up — {state.half === 1 || state.half === 3 ? `end the ${HALF_NAME[state.half]}` : 'end the match'}.</Text>;
        }
        if (stop > 0) return <Text style={ctrl.meta}>⏱ +{stop}′ added time signalled</Text>;
        return null;
      })()}

      {(() => {
        const nextHalf = () => dispatch({ type: 'NEXT_HALF', payload: { at: Date.now() } });
        if (state.half === 1) return <Button label="End 1st Half →" onPress={nextHalf} />;
        if (state.half === 3) return <Button label="End ET 1st half →" onPress={nextHalf} />;
        // End of 2nd half (or 2nd ET half): a level knockout tie goes to the ET/penalty
        // decision (END without awarding clean sheets yet); otherwise it's full time.
        const toDecision = state.knockout && state.home === state.away;
        const label = toDecision ? (state.half === 2 ? 'End 2nd Half →' : 'End extra time →') : 'End Match';
        return <Button label={label} variant="danger" onPress={() => (toDecision ? dispatch({ type: 'END', payload: { at: Date.now() } }) : endMatch())} />;
      })()}
    </View>
  );
};

/** Live possession bar — time-based split, ticking each second, with a one-tap
 *  switch for when the ball changes hands. */
function PossessionBar({
  state, homeName, awayName, homeColor, awayColor, onSwitch,
}: {
  state: FootballState; homeName: string; awayName: string; homeColor?: string; awayColor?: string; onSwitch: (side: 'home' | 'away') => void;
}) {
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.startedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.startedAt]);
  const pct = possessionPct(state, Date.now());
  const side = state.possession.side;
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <Text style={ctrl.label}>⚽ Possession — {homeName} {pct.home}% : {pct.away}% {awayName}</Text>
      <View style={[ctrl.possTrack, { backgroundColor: ac }]}>
        <View style={[ctrl.possFill, { width: `${pct.home}%`, backgroundColor: hc }]} />
      </View>
      <View style={ctrl.row}>
        <Button label={`${side === 'home' ? '● ' : ''}Ball: ${homeName}`} variant={side === 'home' ? 'home' : 'ghost'} color={hc} style={ctrl.flex} onPress={() => onSwitch('home')} />
        <Button label={`${side === 'away' ? '● ' : ''}Ball: ${awayName}`} variant={side === 'away' ? 'away' : 'ghost'} color={ac} style={ctrl.flex} onPress={() => onSwitch('away')} />
      </View>
      <Text style={ctrl.meta}>Tap to set who has the ball (after a throw-in, corner, foul…); time on the ball drives the %.</Text>
    </View>
  );
}

/** Penalty shootout panel — shown when a knockout tie is level at full time. */
function ShootoutControls({
  state, dispatch, homeName, awayName,
}: {
  state: FootballState; dispatch: (a: ScoreAction) => void; homeName: string; awayName: string;
}) {
  if (!state.knockout || state.home !== state.away) {
    return <Text style={ctrl.meta}>✅ Full time — final score saved.</Text>;
  }
  const pens = penScore(state);
  if (!state.shootout) {
    return (
      <View style={{ gap: theme.spacing(3) }}>
        <Text style={ctrl.label}>⚖️ Level {state.home}–{state.away} at full time</Text>
        <Text style={ctrl.meta}>Extra time settled nothing — it goes to a penalty shootout.</Text>
        <Button label="▶ Start penalty shootout" onPress={() => dispatch({ type: 'START_SHOOTOUT' })} />
      </View>
    );
  }
  const nextSide: 'home' | 'away' = state.shootout.home.length <= state.shootout.away.length ? 'home' : 'away';
  const nextName = nextSide === 'home' ? homeName : awayName;
  const dot = (scored: boolean, i: number) => (
    <Text key={i} style={[ctrl.penDot, { color: scored ? theme.colors.primary : theme.colors.textMuted }]}>{scored ? '●' : '○'}</Text>
  );
  return (
    <View style={{ gap: theme.spacing(3) }}>
      <Text style={ctrl.label}>🥅 Penalty shootout — {pens.home} : {pens.away}</Text>
      <View style={ctrl.penRow}><Text style={ctrl.penTeam}>{homeName}</Text><View style={ctrl.row}>{state.shootout.home.map(dot)}</View></View>
      <View style={ctrl.penRow}><Text style={ctrl.penTeam}>{awayName}</Text><View style={ctrl.row}>{state.shootout.away.map(dot)}</View></View>
      <Text style={ctrl.meta}>{nextName} to take the next kick</Text>
      <View style={ctrl.row}>
        <Button label="✓ Scored" variant={nextSide} style={ctrl.flex} onPress={() => dispatch({ type: 'PEN', side: nextSide, payload: { scored: true } })} />
        <Button label="✗ Missed" variant="ghost" style={ctrl.flex} onPress={() => dispatch({ type: 'PEN', side: nextSide, payload: { scored: false } })} />
      </View>
    </View>
  );
}

/* ------------------------------ Live panel --------------------------------- */

/** Running match clock — rendered inside the scoreboard (between status & score). */
const LiveClock: NonNullable<SportPlugin<FootballState>['LiveClock']> = ({ state }) => {
  const s = state as FootballState;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt || s.ended) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [s.startedAt, s.ended]);

  const running = !!s.startedAt && !s.ended;
  const label = s.ended ? 'FT' : !s.startedAt ? (s.half === 2 ? 'HT' : '—') : clockTime(s);
  return (
    <View style={ctrl.clockRow}>
      <View style={[ctrl.liveDot, { backgroundColor: running ? theme.colors.danger : theme.colors.textMuted }]} />
      <Text style={ctrl.clockTime}>{label}</Text>
    </View>
  );
};

/** Timeline only — the pitch/lineups are rendered generically by the live
 *  screen from `plugin.Court`, so every sport's layout shows the same way. */
/** One comparison row: the higher value gets a colored pill (FIFA-style). A stat
 *  the scorer isn't tracking this match is shown muted with a ☁ "not tracked" tag
 *  rather than hidden — so viewers see the same coverage idea as on profiles. */
function StatRow({ label, home, away, homeColor, awayColor, tracked }: { label: string; home: string; away: string; homeColor: string; awayColor: string; tracked: boolean }) {
  if (!tracked) {
    return (
      <View style={sv.statRow}>
        <Text style={[sv.statLabel, sv.labelMuted, { textAlign: 'left' }]}>{label}</Text>
        <Text style={sv.notTracked}>☁ not tracked</Text>
      </View>
    );
  }
  const hn = parseFloat(home), an = parseFloat(away);
  const lead = isNaN(hn) || isNaN(an) || hn === an ? null : hn > an ? 'home' : 'away';
  // Proportional comparison bar: each side's share of the two values, so the
  // balance of play reads at a glance (5 shots vs 3 → a 5:3 split, 60% vs 40%
  // possession → 60:40). Neutral when there's nothing yet (0–0).
  const h = isNaN(hn) ? 0 : hn, a = isNaN(an) ? 0 : an;
  const total = h + a;
  const Cell = ({ v, side }: { v: string; side: 'home' | 'away' }) => (
    <View style={[sv.cell, lead === side && { backgroundColor: side === 'home' ? homeColor : awayColor }]}>
      <Text style={[sv.cellText, lead === side && sv.cellTextLead]}>{v}</Text>
    </View>
  );
  return (
    <View style={sv.statBlock}>
      <View style={sv.statRow}>
        <Cell v={home} side="home" />
        <Text style={sv.statLabel}>{label}</Text>
        <Cell v={away} side="away" />
      </View>
      <View style={sv.bar}>
        {total > 0 ? (
          <>
            <View style={{ flex: h, backgroundColor: homeColor }} />
            <View style={{ flex: a, backgroundColor: awayColor }} />
          </>
        ) : (
          <View style={{ flex: 1, backgroundColor: theme.colors.surfaceAlt }} />
        )}
      </View>
    </View>
  );
}

const StatsComparison = ({ s, homeName, awayName, homeColor, awayColor }: { s: FootballState; homeName: string; awayName: string; homeColor: string; awayColor: string }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.startedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, [s.startedAt]);
  // Split the table into Overall / 1st half / 2nd half. Events carry their half,
  // so per-half totals are just the same aggregation over a filtered event set.
  const [scope, setScope] = useState<'all' | 1 | 2 | 3 | 4>('all');
  const inScope = (h?: 1 | 2 | 3 | 4) => scope === 'all' || h === scope;
  // Extra-time periods only get their own chips once they've actually been played,
  // otherwise every 90-minute match shows two dead filters.
  const etPlayed = s.half >= 3;
  const scoped = scope === 'all'
    ? s
    : { ...s, stats: s.stats.filter((e) => inScope(e.half)), events: s.events.filter((e) => inScope(e.half)) };
  const { totals, possession, passAcc } = footballStats(scoped, Date.now());
  const t = s.track;
  const rows: { label: string; home: string; away: string; tracked: boolean; overallOnly?: boolean }[] = [
    { label: 'Shots', home: `${totals.home.shots}`, away: `${totals.away.shots}`, tracked: t.shots },
    { label: 'Shots on target', home: `${totals.home.shotsOnTarget}`, away: `${totals.away.shotsOnTarget}`, tracked: t.shots },
    // Possession is time-based (cumulative), so it's only meaningful over the whole match.
    { label: 'Possession', home: `${possession.home}%`, away: `${possession.away}%`, tracked: t.possession, overallOnly: true },
    { label: 'Passes', home: `${totals.home.passes}`, away: `${totals.away.passes}`, tracked: t.passes },
    { label: 'Pass accuracy', home: `${passAcc.home}%`, away: `${passAcc.away}%`, tracked: t.passes },
    { label: 'Fouls', home: `${totals.home.fouls}`, away: `${totals.away.fouls}`, tracked: t.fouls },
    { label: 'Yellow cards', home: `${totals.home.yellow}`, away: `${totals.away.yellow}`, tracked: t.cards },
    { label: 'Red cards', home: `${totals.home.red}`, away: `${totals.away.red}`, tracked: t.cards },
    { label: 'Offsides', home: `${totals.home.offsides}`, away: `${totals.away.offsides}`, tracked: t.offsides },
    { label: 'Corners', home: `${totals.home.corners}`, away: `${totals.away.corners}`, tracked: t.corners },
    { label: 'Tackles', home: `${totals.home.tackles}`, away: `${totals.away.tackles}`, tracked: t.tackles },
    { label: 'Interceptions', home: `${totals.home.interceptions}`, away: `${totals.away.interceptions}`, tracked: t.interceptions },
    { label: 'Saves', home: `${totals.home.saves}`, away: `${totals.away.saves}`, tracked: t.saves },
    { label: 'Crosses', home: `${totals.home.crosses}`, away: `${totals.away.crosses}`, tracked: t.crosses },
    { label: 'Dribbles', home: `${totals.home.dribbles}`, away: `${totals.away.dribbles}`, tracked: t.dribbles },
    { label: 'Handballs', home: `${totals.home.handballs}`, away: `${totals.away.handballs}`, tracked: t.handball },
    { label: 'Attacking plays', home: `${totals.home.attackContributions}`, away: `${totals.away.attackContributions}`, tracked: t.attackContribution },
    { label: 'Defensive plays', home: `${totals.home.defenceContributions}`, away: `${totals.away.defenceContributions}`, tracked: t.defenceContribution },
  ];
  const shownRows = rows.filter((r) => scope === 'all' || !r.overallOnly);
  const anyUntracked = shownRows.some((r) => !r.tracked);
  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={sv.scopeRow}>
        {([['all', 'Overall'], [1, '1st half'], [2, '2nd half'], ...(etPlayed ? ([[3, 'ET 1'], [4, 'ET 2']] as const) : [])] as const).map(([key, label]) => (
          <SelectChip key={label} label={label} active={scope === key} onPress={() => setScope(key)} />
        ))}
      </View>
      <View style={sv.head}>
        <Text style={[sv.headTeam, { color: homeColor }]} numberOfLines={1}>{homeName}</Text>
        <Text style={sv.headTitle}>TEAM STATS</Text>
        <Text style={[sv.headTeam, { color: awayColor, textAlign: 'right' }]} numberOfLines={1}>{awayName}</Text>
      </View>
      {shownRows.map((r) => <StatRow key={r.label} label={r.label} home={r.home} away={r.away} homeColor={homeColor} awayColor={awayColor} tracked={r.tracked} />)}
      {anyUntracked ? (
        <Text style={sv.coverageHint}>☁ not tracked — the scorer isn’t capturing this stat for this match (Scoring settings · Info tab).</Text>
      ) : null}
    </View>
  );
};

/** Football contributes Lineups / Stats / Timeline as their own top-level tabs on
 *  the live screen (the screen calls LiveExtras with each view's key). */
const FOOTBALL_VIEWS = [
  { key: 'lineups', label: 'Lineups' },
  { key: 'stats', label: 'Stats' },
  { key: 'timeline', label: 'Timeline' },
];

const LiveExtras: NonNullable<SportPlugin<FootballState>['LiveExtras']> = ({
  state,
  homeName,
  awayName,
  homeColor,
  awayColor,
  homeRoster,
  awayRoster,
  homeLineup,
  awayLineup,
  homeManager,
  awayManager,
  homeFormation,
  awayFormation,
  view = 'lineups',
}) => {
  const s = state as FootballState;
  const hc = homeColor ?? theme.colors.home;
  const ac = awayColor ?? theme.colors.away;
  if (view === 'timeline') {
    return <Timeline events={s.events} stats={s.stats} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} />;
  }
  if (view === 'stats') {
    return <StatsComparison s={s} homeName={homeName} awayName={awayName} homeColor={hc} awayColor={ac} />;
  }
  return (
    <LineupView
      homeLineup={homeLineup} awayLineup={awayLineup} homeRoster={homeRoster} awayRoster={awayRoster}
      events={s.events} homeName={homeName} awayName={awayName} homeColor={hc} awayColor={ac}
      homeManager={homeManager} awayManager={awayManager}
      homeFormation={homeFormation} awayFormation={awayFormation}
    />
  );
};

const sv = StyleSheet.create({
  scopeRow: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2), marginBottom: theme.spacing(1) },
  headTeam: { flex: 1, fontSize: theme.font.small, fontWeight: '800' },
  headTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  statBlock: { gap: theme.spacing(1), paddingVertical: theme.spacing(1.5) },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: theme.colors.surfaceAlt },
  statLabel: { flex: 1, textAlign: 'center', color: theme.colors.text, fontSize: theme.font.small },
  cell: { minWidth: 48, paddingVertical: 4, paddingHorizontal: 10, borderRadius: theme.radius.pill, alignItems: 'center' },
  cellText: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  cellTextLead: { color: '#06120D', fontWeight: '900' },
  labelMuted: { color: theme.colors.textMuted },
  notTracked: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', fontStyle: 'italic' },
  coverageHint: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontStyle: 'italic', marginTop: theme.spacing(2), textAlign: 'center' },
});

/** Football's pitch as the generic Court (positions mirrored per side). */
const Court: NonNullable<SportPlugin<FootballState>['Court']> = ({ homeLineup, awayLineup, homeColor, awayColor }) => (
  <Pitch homeLineup={homeLineup} awayLineup={awayLineup} homeColor={homeColor} awayColor={awayColor} />
);

export const footballPlugin: SportPlugin<FootballState> = {
  id: 'football',
  name: 'Football',
  icon: '⚽',
  archetype: 'goal-time',
  createInitialState: init,
  reducer,
  // A level knockout tie isn't complete until the shootout produces a winner.
  isComplete: (s) => s.ended && (s.home !== s.away || !s.knockout || s.shootoutWinner != null),
  summary: (s) => {
    const pens = penScore(s);
    // Cards are no longer a lumped tally on the scorecard — reds show as badges by
    // the team name (see homeReds/awayReds), so the scorer sees who's down to 10.
    return {
      homeScore: String(s.home),
      awayScore: String(s.away),
      statusLine: s.shootoutWinner
        ? `${s.shootoutWinner === 'home' ? 'Home' : 'Away'} win ${pens.home}–${pens.away} on pens`
        : s.shootout
        ? `Penalties ${pens.home}–${pens.away}`
        : s.ended
        ? 'Full Time'
        : s.half === 1 ? '1st Half' : s.half === 2 ? '2nd Half' : s.half === 3 ? 'Extra Time (1st)' : 'Extra Time (2nd)',
      detailLine: s.shootout ? `Shootout · ${pens.home}–${pens.away}` : undefined,
      homeReds: s.events.filter((e) => e.type === 'red' && e.side === 'home').length,
      awayReds: s.events.filter((e) => e.type === 'red' && e.side === 'away').length,
    };
  },
  ScoringControls,
  LiveExtras,
  LiveClock,
  formation: emptyFormation,
  Court,
  // football renders its own rich lineups inside LiveExtras (the LINEUPS sub-tab),
  // so the generic court isn't shown twice on the live screen.
  lineupsInExtras: true,
  liveViews: FOOTBALL_VIEWS,
  formatFields: [
    {
      key: 'preset', label: 'Format', type: 'preset', default: 'eleven',
      options: [
        { value: 'eleven', label: '11-a-side', set: { playersPerSide: 11, halfMinutes: 45, substitutes: 5, subType: 'rolling' } },
        { value: 'sevens', label: '7-a-side', set: { playersPerSide: 7, halfMinutes: 25, substitutes: 5, subType: 'rolling' } },
        { value: 'fives', label: '5s turf', set: { playersPerSide: 5, halfMinutes: 20, substitutes: 5, subType: 'rolling' } },
        { value: 'futsal', label: 'Futsal', set: { playersPerSide: 5, halfMinutes: 20, substitutes: 9, subType: 'rolling' } },
        { value: 'custom', label: 'Custom' },
      ],
    },
    { key: 'playersPerSide', label: 'Players per side', type: 'count', default: 11, min: 1, max: 11, advanced: true },
    { key: 'halfMinutes', label: 'Minutes per half', type: 'number', default: 45, min: 1, max: 60, advanced: true },
    { key: 'substitutes', label: 'Substitutes per side', type: 'count', default: 5, min: 0, max: 11, advanced: true },
    {
      key: 'subType', label: 'Substitutions', type: 'choice', default: 'rolling', advanced: true,
      options: [
        { value: 'rolling', label: 'Rolling (can return)' },
        { value: 'fixed', label: 'Fixed (no return)' },
      ],
    },
    {
      key: 'decider', label: 'If level at full time', type: 'choice', default: 'none',
      options: [
        { value: 'none', label: 'Draw stands — no extra time or penalties' },
        { value: 'extra_time', label: 'Extra time, then penalties' },
        { value: 'penalties', label: 'Penalties straightaway (no extra time)' },
      ],
    },
    { key: 'extraTimeMinutes', label: 'Extra-time half length', type: 'number', default: 15, min: 1, max: 30, advanced: true, hint: 'used only when the decider is “Extra time, then penalties”' },
    { key: 'extraTimeSubs', label: 'Extra substitutions in extra time', type: 'count', default: 1, min: 0, max: 3, advanced: true },
  ],
};

const ctrl = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing(3) },
  flex: { flex: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  editMin: { color: theme.colors.accent, fontWeight: '800', width: 34, fontSize: theme.font.small },
  editLabel: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  editEdit: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  editBanner: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '700', backgroundColor: theme.colors.accent + '22', padding: theme.spacing(2), borderRadius: theme.radius.sm },
  editRemove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  subBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  extrasHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  liveDot: { width: 9, height: 9, borderRadius: 5 },
  clockTime: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '900', letterSpacing: 1 },
  penRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  penTeam: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', width: 110 },
  penDot: { fontSize: 18, marginRight: 2 },
  flowPanel: { gap: theme.spacing(3), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4) },
  actionBtn: { paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3) },
  table: { borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  prow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  prowSel: { backgroundColor: theme.colors.surfaceAlt },
  jersey: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  jerseyTxt: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small },
  pname: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  ppos: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700' },
  addedBox: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  endNudge: { color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800', textAlign: 'center' },
  voiceBar: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3) },
  voiceHeard: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', fontStyle: 'italic' },
  voiceFeedback: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  pickRow: { flexDirection: 'row', gap: theme.spacing(3) },
  pickCol: { flex: 1, gap: theme.spacing(2) },
  pickTeam: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  possTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.away, overflow: 'hidden' },
  possFill: { height: 8, borderRadius: 4 },
  extraTabs: { flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, padding: 3 },
  extraTab: { flex: 1, textAlign: 'center', paddingVertical: theme.spacing(2), borderRadius: theme.radius.pill, color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', overflow: 'hidden' },
  extraTabActive: { backgroundColor: theme.colors.primary, color: '#06120D', fontWeight: '800' },
});
