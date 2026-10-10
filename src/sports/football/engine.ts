/** Football — the PURE scoring core (state, reducer, clock, stats projection).
 *  No React / React Native imports, so it runs in tests and on the server exactly
 *  as it does on-device; the UI lives in index.tsx. Mirrors the basketball /
 *  cricket / kabaddi engines. */
import type { ScoreAction, LiveSettings, FormatField } from "../types";
import type { FootballEvent, GoalType, BodyPart, StatEvent, StatKind } from "./events";
import type { Player } from "../../core/types";
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
  /** SD-08: live events are stamped with the ORDINAL minute (FIFA: a goal at
   *  10:30 is 11', at 45:30 of the 1st half 45+1'). Set by the first kickoff of
   *  matches scored on this version; absent = older logs, whose minutes were
   *  stamped as completed minutes (floor) and are shown as stored. */
  minuteOrdinal?: true;
  /** SD-09: who started for each side (stamped at kickoff and at full time from
   *  the lineup / squad) — the input for keeper minutes and clean sheets.
   *  Absent on older logs. */
  xi?: { home?: XiStamp; away?: XiStamp };
  /** SD-29: a grassroots sin-bin of this many minutes (format `sinBinMinutes`;
   *  absent = no sin-bin — older matches and the default). */
  sinBinMinutes?: number;
}

/** A side's starting keeper and players, plus the squad's keepers (so a
 *  keeper coming off the bench is recognised). Ids + names: older sub events
 *  carry names only. */
export interface XiStamp {
  gk?: { id: string; name: string };
  players?: { id: string; name: string }[];
  keepers?: { id: string; name: string }[];
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

export const TRACK_KEYS: (keyof TrackConfig)[] = ['shots', 'possession', 'fouls', 'cards', 'offsides', 'corners', 'tackles', 'interceptions', 'saves', 'passes', 'crosses', 'dribbles', 'handball', 'attackContribution', 'defenceContribution'];
export const readTrack = (config?: Record<string, unknown>): TrackConfig => {
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

/** The stats a scorer can switch on/off mid-match (parity #14 live settings —
 *  the old inline "Scoring settings" card's set, in the same order). */
const TRACKABLE: [keyof TrackConfig, string][] = [
  ['shots', 'Shots'], ['possession', 'Possession'], ['passes', 'Passes'], ['fouls', 'Fouls'],
  ['cards', 'Cards'], ['offsides', 'Offsides'], ['corners', 'Corners'], ['tackles', 'Tackles'],
  ['interceptions', 'Interceptions'], ['saves', 'Saves'],
  ['attackContribution', 'Attacking play'], ['defenceContribution', 'Defensive play'],
];
const trackKey = (k: string) => `track${k[0].toUpperCase()}${k.slice(1)}`;

/** Football's live settings (config mode): each tap patches the match format and
 *  the log replays with it, exactly as the old inline card did. */
export const FOOTBALL_LIVE_SETTINGS: LiveSettings<FootballState> = {
  title: '⚙️ Scoring settings',
  hint: 'Capture only what this scorer can keep up with — toggles apply to this match only.',
  mode: 'config',
  fields: [
    ...TRACKABLE.map(([k, label]): FormatField => ({ key: trackKey(k), label, type: 'toggle', default: readTrack()[k], group: 'Stats captured' })),
    { key: 'halfMinutes', label: 'Match length', type: 'number', default: 45, min: 5, max: 60, step: 5, hint: 'min / half' },
  ],
  read: (s) => ({
    ...Object.fromEntries(TRACKABLE.map(([k]) => [trackKey(k), s.track?.[k] ?? false])),
    halfMinutes: s.halfMinutes ?? 45,
  }),
  defaults: {
    ...Object.fromEntries(TRACKABLE.map(([k]) => [trackKey(k), readTrack()[k]])),
    halfMinutes: 45,
  },
};

export const init = (config?: Record<string, unknown>): FootballState => ({
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
  // SD-29: only on the state when the format sets one (old states keep their shape)
  ...(Number(config?.sinBinMinutes) > 0 ? { sinBinMinutes: Number(config?.sinBinMinutes) } : {}),
});

/** Decide a penalty shootout: best-of-five (clinched early when a lead can't be
 *  caught), then sudden death once both have taken five. */
export function decideShootout(h: boolean[], a: boolean[]): 'home' | 'away' | undefined {
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
export const HALF_NAME: Record<1 | 2 | 3 | 4, string> = { 1: 'first half', 2: 'second half', 3: 'first period of extra time', 4: 'second period of extra time' };

/** Elapsed-minute offset at the START of each half: 0, 45, 90, 105 (halves 1-4). */
export const startOffset = (s: FootballState): number => {
  const { halfMinutes: hm, etMinutes: et } = s;
  return s.half === 1 ? 0 : s.half === 2 ? hm : s.half === 3 ? 2 * hm : 2 * hm + et;
};

/** Live match minute, derived from the running clock. Safe to call in UI.
 *  Holds at the half's regulation end + any signalled added time rather than
 *  drifting past it — the manual clock never auto-ends a half, so otherwise a
 *  long-open tab reads "90+59'". Signalling added time (SET_STOPPAGE) extends it. */
export function currentMinute(s: FootballState): number {
  const base = startOffset(s);
  // SD-08: ordinal minutes (FIFA) — the minute being played, so 0:30 is 1' and a
  // half-time substitution is 46'. Older matches keep completed minutes.
  const ord = s.minuteOrdinal ? 1 : 0;
  if (!s.startedAt) return base + ord;
  const raw = base + Math.floor((Date.now() - s.startedAt) / 60000) + ord;
  return Math.min(raw, halfBase(s) + (s.stoppage[s.half] ?? 0));
}

/** Half lengths, for turning a stored (minute, half) into FIFA notation. */
export interface MinuteFormat { halfMinutes: number; etMinutes: number }
/** The regulation end minute of half `h` (45 / 90 / 105 / 120). */
export const halfEndOf = (h: 1 | 2 | 3 | 4, f: MinuteFormat): number =>
  h === 1 ? f.halfMinutes : h === 2 ? 2 * f.halfMinutes : h === 3 ? 2 * f.halfMinutes + f.etMinutes : 2 * f.halfMinutes + 2 * f.etMinutes;
/** The half a bare minute falls in (for events stored without `half`). */
export const halfOfMinute = (m: number, f: MinuteFormat): 1 | 2 | 3 | 4 =>
  m <= f.halfMinutes ? 1 : m <= 2 * f.halfMinutes ? 2 : m <= 2 * f.halfMinutes + f.etMinutes ? 3 : 4;
/** More "added time" than this is not added time: an event whose stored half
 *  disagrees with its minute by that much (an old backfill stamped with the then
 *  current half) is placed by its minute instead. */
const MAX_ADDED = 20;
/** SD-08: the half an event belongs to — stored, else derived from its minute. */
export const eventHalf = (e: { minute: number; half?: 1 | 2 | 3 | 4 }, f: MinuteFormat): 1 | 2 | 3 | 4 =>
  e.half && e.minute <= halfEndOf(e.half, f) + MAX_ADDED ? e.half : halfOfMinute(e.minute, f);
/** SD-08: FIFA minute notation — "37'", "45+2'", "90+4'", "120+1'". A minute past
 *  its half's regulation end is added time of THAT half (a first-half 47 is
 *  45+2', never 47'). Display only: stored minutes are untouched. */
export function minuteText(minute: number, half: 1 | 2 | 3 | 4 | undefined, f: MinuteFormat): string {
  const h = eventHalf({ minute, half }, f);
  const end = halfEndOf(h, f);
  return minute > end ? `${end}+${minute - end}'` : `${minute}'`;
}
/** Newest-first comparator for timeline rows: half, then minute, then log order. */
export const byMatchTimeDesc = (
  a: { half: number; minute: number; order: number },
  b: { half: number; minute: number; order: number },
) => b.half - a.half || b.minute - a.minute || b.order - a.order;

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
export function accrue(s: FootballState, at: number): { home: number; away: number } {
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

export const push = (s: FootballState, e: Omit<FootballEvent, 'id'>): FootballState => ({
  ...s,
  seq: s.seq + 1,
  events: [...s.events, { ...e, id: s.seq + 1 }],
});

export const reducer = (s: FootballState, a: ScoreAction): FootballState => {
  // Once full time is called, only shootout actions are still accepted.
  if (s.ended && a.type !== 'END' && a.type !== 'START_SHOOTOUT' && a.type !== 'START_EXTRA_TIME' && a.type !== 'PEN' && a.type !== 'XI') return s;
  const minute = Number(a.payload?.minute ?? currentMinute(s));
  // The half an event belongs to: carried in the payload when the controls stamp
  // it (handles stoppage time + backfill correctly); else the current half.
  const evHalf: 1 | 2 | 3 | 4 = (a.payload?.half as 1 | 2 | 3 | 4 | undefined) ?? s.half;
  const name = a.attribution?.playerName;
  // SD-30: new logs carry the credited player's id (optional key; older logs
  // have names only and replay exactly as before — Decision 8).
  const pid = typeof a.payload?.pid === 'string' && a.payload.pid ? { playerId: a.payload.pid } : {};
  switch (a.type) {
    case 'KICKOFF': {
      const at = Number(a.payload?.at);
      // first kickoff sets who has the ball; a 2nd-half restart keeps the side
      const side = (a.payload?.possSide as 'home' | 'away') ?? s.possession.side ?? 'home';
      // SD-08: the opening kickoff of a match scored on this version switches on
      // ordinal minutes (only before anything is logged, so a match never mixes).
      const ord = a.payload?.ord === true && s.half === 1 && !s.events.length && !s.stats.length;
      return { ...s, ...(ord ? { minuteOrdinal: true as const } : {}), startedAt: at, possession: { ...s.possession, side, sinceAt: at } };
    }
    case 'XI': {
      // SD-09: a side's starters / keeper, stamped from the lineup. The latest
      // stamp wins (a lineup fixed after kickoff is re-stamped at full time).
      const team = a.payload?.team;
      if (team !== 'home' && team !== 'away') return s;
      const stamp: XiStamp = {};
      const gk = a.payload?.gk as XiStamp['gk'];
      if (gk?.id) stamp.gk = { id: String(gk.id), name: String(gk.name ?? '') };
      const players = a.payload?.players as XiStamp['players'];
      if (Array.isArray(players)) stamp.players = players.filter((p) => p?.id).map((p) => ({ id: String(p.id), name: String(p.name ?? '') }));
      const keepers = a.payload?.keepers as XiStamp['keepers'];
      if (Array.isArray(keepers)) stamp.keepers = keepers.filter((p) => p?.id).map((p) => ({ id: String(p.id), name: String(p.name ?? '') }));
      return { ...s, xi: { ...s.xi, [team]: stamp } };
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
        // SD-08: only new logs carry it (absent key keeps old states identical).
        ...(a.payload?.blocked === true ? { blocked: true } : {}),
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
      return push(scored, { minute, half: evHalf, type: 'goal', side: a.side, playerName: name, goalType: a.payload?.goalType as FootballEvent['goalType'], bodyPart: a.payload?.bodyPart as BodyPart | undefined, ...pid });
    }
    case 'OWN_GOAL': {
      if (!a.side) return s; // side = team awarded the goal
      const scored = { ...s, [a.side]: s[a.side] + 1 } as FootballState;
      // playerName = the opposing player who put it into their own net (no goal credited).
      return push(scored, { minute, half: evHalf, type: 'owngoal', side: a.side, playerName: a.payload?.scorerName as string | undefined, ...pid });
    }
    case 'ASSIST': {
      if (!a.side || !name) return s;
      // The assist is recorded immediately after its goal, so attach it to the
      // most recent goal of this side (overwriting any prior assister).
      const events = [...s.events];
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === 'goal' && events[i].side === a.side) {
          // SD-30: the assister's id rides in `secondId` (a later assist
          // without one drops the earlier id with its name)
          const { secondId: _old, ...goal } = events[i];
          events[i] = { ...goal, secondName: name, ...(pid.playerId ? { secondId: pid.playerId } : {}) };
          return { ...s, events };
        }
      }
      return s;
    }
    case 'SET_STOPPAGE':
      return { ...s, stoppage: { ...s.stoppage, [s.half]: Math.max(0, Number(a.payload?.minutes ?? 0)) } };
    case 'STOPPAGE':
      // An in-play pause (injury / cooling break / VAR check) — a timeline marker,
      // no scoring effect. `reason` (injury / var / cooling / other) is optional.
      return push(s, { minute, half: evHalf, type: 'stoppage', side: a.side ?? 'home', playerName: a.payload?.reason as string | undefined });
    case 'YELLOW':
      return a.side ? push(s, { minute, half: evHalf, type: 'yellow', side: a.side, playerName: name, ...pid }) : s;
    case 'RED':
      return a.side ? push(s, { minute, half: evHalf, type: 'red', side: a.side, playerName: name, secondYellow: a.payload?.secondYellow as boolean | undefined, ...pid }) : s;
    case 'SUSPEND': {
      // SD-29: a sin-bin — the player is off (his side a player down) for the
      // minutes, then back automatically (derived by src/sports/onField.ts).
      const mins = Number(a.payload?.minutes ?? s.sinBinMinutes ?? 0);
      if (!a.side || !(mins > 0)) return s;
      const sec = a.payload?.sec;
      return push(s, {
        minute, half: evHalf, type: 'sinbin', side: a.side, playerName: name,
        ...(a.attribution?.playerId ? { playerId: a.attribution.playerId } : {}),
        suspendMinutes: mins, ...(typeof sec === 'number' ? { sec } : {}),
      });
    }
    case 'SUB': {
      // Rolling subs (futsal / small-sided / friendlies) let a player return, so
      // the substitution count is unlimited — `maxSubs` there is just bench size.
      // Fixed subs cap the number of changes.
      if (!a.side || (s.subType === 'fixed' && s.subsUsed[a.side] >= s.maxSubs)) return s;
      const offName = String(a.payload?.offName ?? '');
      // SD-09: new logs also carry the two ids (keeper minutes / clean sheets).
      const ids = {
        ...(a.payload?.offId ? { playerId: String(a.payload.offId) } : {}),
        ...(a.payload?.onId ? { secondId: String(a.payload.onId) } : {}),
      };
      const withEvent = push(s, { minute, half: evHalf, type: 'sub', side: a.side, playerName: offName, secondName: String(a.payload?.onName ?? ''), ...ids });
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

export const cardCount = (events: FootballEvent[], type: 'yellow' | 'red', side: 'home' | 'away') =>
  events.filter((e) => e.type === type && e.side === side).length;

/** SD-17 fair-play score per side (FIFA / UEFA team conduct, ≤ 0; higher is
 *  better): per player per match only the worst applies — yellow −1, a red for
 *  a second yellow −3, a direct red −4, a yellow then a direct red −5. A card
 *  without a player is its own entry. */
/** SD-114 (F4): the auto second-yellow red a yellow triggered. Taking either of
 *  the player's two yellows away leaves him on one, so that red goes with it
 *  (removed by its own REMOVE_EVENT — no reducer change, old logs replay as-is). */
export function pairedSecondYellowRed(events: FootballEvent[], ev: FootballEvent): FootballEvent | undefined {
  if (ev.type !== 'yellow') return undefined;
  const same = (e: FootballEvent) => e.side === ev.side && (ev.playerId && e.playerId ? e.playerId === ev.playerId : e.playerName === ev.playerName);
  if (events.filter((e) => e.type === 'yellow' && same(e)).length !== 2) return undefined;
  return events.find((e) => e.type === 'red' && e.secondYellow && same(e));
}

export function fairPlayScore(events: FootballEvent[]): { home: number; away: number } {
  const by = new Map<string, { side: 'home' | 'away'; y: number; secondY: boolean; red: boolean }>();
  for (const e of events ?? []) {
    if (e.type !== 'yellow' && e.type !== 'red') continue;
    const who = e.playerId ?? e.playerName;
    const key = `${e.side}|${who ?? `#${e.id}`}`;
    const r = by.get(key) ?? { side: e.side, y: 0, secondY: false, red: false };
    if (e.type === 'yellow') r.y += 1;
    else if (e.secondYellow) r.secondY = true;
    else r.red = true;
    by.set(key, r);
  }
  const out = { home: 0, away: 0 };
  for (const r of by.values()) {
    out[r.side] -= r.red ? (r.y > 0 ? 5 : 4) : r.secondY || r.y >= 2 ? 3 : r.y > 0 ? 1 : 0;
  }
  return out;
}

export interface TeamStatTotals {
  shots: number; shotsOnTarget: number; blockedShots: number; fouls: number; yellow: number; red: number;
  offsides: number; corners: number; tackles: number; interceptions: number; saves: number;
  passes: number; passesComplete: number; crosses: number; dribbles: number; handballs: number;
  attackContributions: number; defenceContributions: number;
}
export const blankTotals = (): TeamStatTotals => ({
  shots: 0, shotsOnTarget: 0, blockedShots: 0, fouls: 0, yellow: 0, red: 0, offsides: 0, corners: 0,
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
      // A blocked shot is a shot but never on target (SD-08; older logs flagged
      // blocks as on target and are shown as stored).
      case 'shot': t.shots++; if (e.onTarget && !e.blocked) t.shotsOnTarget++; if (e.blocked) t.blockedShots++; if (p) { p.shots++; if (e.onTarget && !e.blocked) p.shotsOnTarget++; } break;
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
