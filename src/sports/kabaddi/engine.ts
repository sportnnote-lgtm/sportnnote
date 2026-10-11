/**
 * Kabaddi — the PURE scoring core (state, reducer, raid → timeline derivation).
 * No React / React Native imports, so it runs in node tests exactly as on-device.
 * The UI (controls, scoreboard, box score) lives in index.tsx and imports from here.
 *
 * SD-03 (raid/tackle attribution): a guided raid (`RAID_OUTCOME`) is folded into
 * `raids[]` and replayed by `replayRaids`. Its timeline lines are DERIVED from that
 * replay: a `raid` line on the raiding side worth the raid points actually scored
 * (touch + eligible bonus — 0 for an empty or failed raid), a `tackle` line on the
 * DEFENDING side (1, or 2 for a super tackle; a failed do-or-die gives the defence
 * its point the same way) and an `allout` line (+2) for the side that emptied the
 * mat. The team score is computed exactly as before, so old logs replay to the
 * same score (Decision 8); only the derived lines change.
 *
 * Event ids: a guided raid keeps id = seq + 1 (one id per action, as before — old
 * logged REMOVE_EVENT ids still point at the same moment). Its tackle / all-out
 * lines take fractional ids just above it (id + 0.1, + 0.2 …) and carry
 * `group` = the raid's id.
 */
import type { LiveEvent } from '../liveEvents';
import type { ScoreAction } from '../types';
import { replayRaids, decideRaidShootout, YELLOW_MINUTES, type RaidOutcome, type ExtraOutcome, type KabaddiDerived, type KabaddiStyle, type KabaddiCfg, type RaidBreakdown, type Side } from './rules.ts';

/** A raid in `raids[]`: the engine input plus who / when, for the timeline. */
export interface RaidEntry extends RaidOutcome {
  /** id of this raid's timeline line (the action's seq + 1) */
  eid?: number;
  minute?: number;
  half?: number;
  /** logged as a Golden Raid (sudden death) */
  gr?: boolean;
  raider?: string;
  raiderId?: string;
  tackler?: string;
  tacklerId?: string;
  /** the single line value the pre-SD-03 reducer showed for this raid (frozen at
   *  log time) — only used to replay a LEGACY (un-versioned) remove exactly */
  lp?: number;
  /** legacy remove took the line away but left the raid in play */
  hidden?: boolean;
  /** SD-117b: how the raider was tackled (optional chip — TACKLE_TYPES key) */
  tt?: string;
}

/** SD-59 / SD-72 — a technical point or a card in `extras[]` (log order by
 *  `eid`, like a raid). Replayed with the raids (rules.ts), so the score, the
 *  players on the mat, revival and all-outs follow it. */
export interface ExtraEntry extends ExtraOutcome {
  eid: number;
  minute?: number;
  half?: number;
  /** tech: TECH_REASONS key */
  reason?: string;
  /** the player at fault (tech) / carded (card) */
  playerName?: string;
  playerId?: string;
  /** card: given to a coach / team official (no change on the mat) */
  official?: boolean;
}

/** SD-59 — technical points (AKFI / IKF rules; a point to the opponent, nobody
 *  goes out). Line-outs are logged on the raid itself. */
export const TECH_REASONS: Array<{ key: string; label: string; short: string }> = [
  { key: 'cant', label: 'Cant late / not kept', short: 'cant' },
  { key: 'coaching', label: 'Coaching from outside', short: 'coaching' },
  { key: 'delay', label: 'Delay of game', short: 'delay' },
  { key: 'twoRaiders', label: 'Two raiders entered', short: 'two raiders' },
  { key: 'entry', label: 'Entered / left the court without leave', short: 'unauthorised entry' },
  { key: 'other', label: 'Other', short: 'other' },
];
export const techReasonLabel = (k?: string) => (k ? TECH_REASONS.find((r) => r.key === k)?.label ?? k : undefined);

export type CardColour = 'green' | 'yellow' | 'red';
export const CARD_ICON: Record<CardColour, string> = { green: '🟩', yellow: '🟨', red: '🟥' };

/** SD-117b — how a raider was stopped (optional on a tackled raid). */
export const TACKLE_TYPES: Array<{ key: string; label: string }> = [
  { key: 'ankle', label: 'Ankle hold' },
  { key: 'thigh', label: 'Thigh hold' },
  { key: 'waist', label: 'Waist hold' },
  { key: 'dash', label: 'Dash' },
  { key: 'block', label: 'Block' },
  { key: 'chain', label: 'Chain' },
];
export const tackleTypeLabel = (k?: string) => (k ? TACKLE_TYPES.find((t) => t.key === k)?.label ?? k : undefined);

/** SD-117b — team timeouts per half (PKL / AKFI: 2 per team per half). */
export const TIMEOUTS_PER_HALF = 2;

/** A timeline line; `group` ties a guided raid's lines together. `ret` (SD-117b)
 *  = a substitution that brought a previously substituted player back on. */
export type KabaddiEvent = LiveEvent & { group?: number; ret?: string; card?: CardColour };

export interface KabaddiState {
  home: number;
  away: number;
  half: 1 | 2 | 3 | 4; // 3 & 4 = extra-time halves (tie-breaker)
  startedAt?: number;
  /** SD-117b: the clock is paused (timeout, injury, review) since this time;
   *  RESUME moves `startedAt` on by the pause, so the minute doesn't drift.
   *  Absent = running (or not started). Only PAUSE sets it. */
  pausedAt?: number;
  /** SD-117b (format: subReturn): a substituted player may come back on, within
   *  the substitution limit (AKFI / PKL). Absent = takes no further part. */
  subReturn?: true;
  /** minutes per half (format: halfMinutes) */
  halfMinutes: number;
  /** minutes per extra-time half (format: extraTimeMinutes) */
  extraTimeMinutes: number;
  /** how a level result is settled: draw stands / extra time then Golden Raid /
   *  Golden Raid straightaway (format: decider) */
  decider: 'none' | 'extra_time' | 'golden_raid';
  /** sudden-death Golden Raid under way — the next point wins the match */
  goldenRaid: boolean;
  /** 5-raid shootout tie-breaker (PKL) — points scored per raid per side; the
   *  regulation score stays tied and the shootout totals decide the winner.
   *  Undefined until a shootout starts. */
  shootout?: { home: number[]; away: number[] };
  /** substitutions allowed per side (format: substitutes) */
  maxSubs: number;
  subsUsed: { home: number; away: number };
  /** names taken off — they can't be credited points once subbed out */
  subbedOff: { home: string[]; away: string[] };
  /** Pro-Kabaddi raid model (guided outcomes replayed for out-counts & revival). */
  style: KabaddiStyle;
  teamSize: number;
  proRules: boolean;
  raids: RaidEntry[];
  /** SD-59 / SD-72 — technical points and cards (absent until the first one) */
  extras?: ExtraEntry[];
  /** SD-83 (format caughtTouches): 'void' = a caught raider's touches don't
   *  score (AKFI / IKF / PKL). Stamped only for formats that carry the key,
   *  so older matches replay as they scored. */
  caughtTouches?: 'void' | 'count';
  /** LEGACY replay only: raids an old (mis-ordinal) remove took out of play
   *  while their line stayed on the timeline. Display only. */
  orphanRaids?: RaidEntry[];
  /** players currently off the mat (out) per side */
  out: { home: number; away: number };
  /** consecutive empty raids per side (3rd is do-or-die) */
  emptyRaids: { home: number; away: number };
  events: KabaddiEvent[];
  seq: number;
  ended: boolean;
}

export const init = (config?: Record<string, unknown>): KabaddiState => ({
  home: 0, away: 0, half: 1,
  halfMinutes: Number(config?.halfMinutes ?? 20),
  extraTimeMinutes: Number(config?.extraTimeMinutes ?? 5),
  decider: (config?.decider as KabaddiState['decider']) ?? 'extra_time',
  goldenRaid: false,
  maxSubs: Number(config?.substitutes ?? 0),
  subsUsed: { home: 0, away: 0 },
  subbedOff: { home: [], away: [] },
  style: (config?.style as KabaddiStyle) ?? 'sanjeevani',
  teamSize: Number(config?.playersPerSide ?? 7),
  proRules: Boolean(config?.proRules ?? true),
  raids: [],
  out: { home: 0, away: 0 },
  emptyRaids: { home: 0, away: 0 },
  events: [], seq: 0, ended: false,
  // SD-117b: only stamped when the format turns it on (old states keep their shape)
  ...(config?.subReturn === true ? { subReturn: true as const } : null),
  // SD-83: only formats that carry the key (older states keep their shape)
  ...(config?.caughtTouches === 'void' || config?.caughtTouches === 'count' ? { caughtTouches: config.caughtTouches as 'void' | 'count' } : null),
});

/** SD-117b — drop the pause mark (the clock stops / restarts). A state without
 *  one is returned as is, so older logs replay to exactly the same shape. */
const unpause = (s: KabaddiState): KabaddiState => {
  if (!('pausedAt' in s)) return s;
  const { pausedAt: _p, ...rest } = s;
  return rest;
};

// Defensive against state persisted before the Pro-Kabaddi fields existed.
export const kabaddiCfg = (s: KabaddiState): KabaddiCfg => ({
  teamSize: s.teamSize ?? 7, style: s.style ?? 'sanjeevani', proRules: s.proRules ?? true,
  ...(s.caughtTouches === 'void' ? { caughtVoid: true } : null),
});
const raidsOf = (s: KabaddiState): RaidEntry[] => s.raids ?? [];
export const extrasOf = (s: KabaddiState): ExtraEntry[] => s.extras ?? [];
/** The full replay: raids + technical points / cards (SD-59 / SD-72). */
export const replayOf = (s: KabaddiState, raids: RaidOutcome[] = raidsOf(s), extras: ExtraOutcome[] = extrasOf(s), now?: number): KabaddiDerived =>
  replayRaids(raids, kabaddiCfg(s), extras, now);
const other = (x: Side): Side => (x === 'home' ? 'away' : 'home');

/** 1st/2nd half, then the two extra-time halves. */
export const halfLabel = (h: number): string =>
  h === 1 ? '1st Half' : h === 2 ? '2nd Half' : h === 3 ? 'Extra Time · 1st' : 'Extra Time · 2nd';

export function currentMinute(s: KabaddiState): number {
  const hm = s.halfMinutes, et = s.extraTimeMinutes;
  const base = s.half === 1 ? 0 : s.half === 2 ? hm : s.half === 3 ? 2 * hm : 2 * hm + et;
  if (!s.startedAt) return base;
  // Hold at the half's end instead of drifting past it (the manual clock never
  // auto-ends a half). SD-117b: a paused clock holds at the pause.
  const cap = base + (s.half <= 2 ? hm : et);
  const now = s.pausedAt ?? Date.now();
  return Math.min(base + Math.floor(Math.max(0, now - s.startedAt) / 60000), cap);
}

/** SD-72 — the match clock in fractional minutes at time `at` (ms): what a
 *  2-minute suspension runs on (it stops with the clock). */
export function clockAt(s: KabaddiState, at: number): number {
  const hm = s.halfMinutes, et = s.extraTimeMinutes;
  const base = s.half === 1 ? 0 : s.half === 2 ? hm : s.half === 3 ? 2 * hm : 2 * hm + et;
  if (!s.startedAt) return base;
  const cap = base + (s.half <= 2 ? hm : et);
  const now = Math.min(at, s.pausedAt ?? at);
  return Math.min(base + Math.max(0, now - s.startedAt) / 60000, cap);
}
/** The match clock now (fractional minutes). */
export const clockNow = (s: KabaddiState): number => clockAt(s, Date.now());

/** A 5-raid shootout line (stamp 'SO') — not part of the regulation score. */
export const isShootoutEvent = (e: LiveEvent) => e.stamp === 'SO';
/** A guided raid's own line (not its tackle / all-out child). */
export const isRaidHead = (e: KabaddiEvent) => e.group != null && e.id === e.group;

/** SD-117b — the clock is running and can be paused / is paused. */
export const clockPaused = (s: KabaddiState) => !!s.startedAt && s.pausedAt != null && !s.ended;

/** SD-117b — team timeouts a side has used in the current half. */
export const timeoutsUsed = (s: KabaddiState, side: Side, half: number = s.half) =>
  s.events.filter((e) => e.kind === 'timeout' && e.side === side && e.half === half).length;

/** SD-117b — the side expected to raid next: raids alternate, so it's the other
 *  side from the last raid of this half; a half opens with the side that did
 *  NOT raid first in the half before. null = not known (the toss decides). */
export function expectedRaider(s: KabaddiState): Side | null {
  if (!s || s.ended || s.goldenRaid || s.shootout) return null;
  const inHalf = (h: number) => raidsOf(s).filter((r) => !r.hidden && (r.half ?? 1) === h);
  const cur = inHalf(s.half);
  if (cur.length) return other(cur[cur.length - 1].side);
  const prev = s.half > 1 ? inHalf(s.half - 1) : [];
  return prev.length ? other(prev[0].side) : null;
}

/** SD-117b — names of the players currently out, per side, as far as the log
 *  knows them. Defenders touched aren't named (KB-10), so they are anonymous
 *  places in the queue; revival is first out, first in (the rules), and an
 *  all-out brings everyone back. Display only (the Raider chip dims them). */
export function outPlayers(s: KabaddiState): Record<Side, string[]> {
  const cfg = kabaddiCfg(s);
  const q: Record<Side, (string | null)[]> = { home: [], away: [] };
  if (cfg.style === 'amar') return { home: [], away: [] };
  const raids = raidsOf(s);
  const extras = extrasOf(s);
  const d = replayOf(s);
  const per = d.perRaid;
  // perRaid holds only the raids replayed (in merged order)
  let ri = 0;
  for (const [kind, idx] of d.order) {
    if (kind === 'x') {
      // SD-72: a player sent off while out leaves the revival queue
      const e = extras[idx];
      if (e?.x === 'card' && e.card === 'red' && e.player && e.wasOut) {
        const at = e.playerName ? q[e.side].indexOf(e.playerName) : -1;
        q[e.side].splice(at >= 0 ? at : q[e.side].indexOf(null), at >= 0 || q[e.side].includes(null) ? 1 : 0);
      }
      continue;
    }
    const r = raids[idx];
    const b = per[ri++];
    if (!b) break;
    const opp = other(r.side);
    const sent = b.touchPts + (b.defOutPts ?? 0);
    for (let k = 0; k < sent; k++) q[opp].push(null);
    if (cfg.style === 'sanjeevani') q[r.side].splice(0, sent);
    if (b.raiderOut) {
      q[r.side].push(r.raider ?? null);
      if (cfg.style === 'sanjeevani') q[opp].splice(0, 1);
    }
    for (const side of ['home', 'away'] as const) if (q[side].length > cfg.teamSize) q[side] = q[side].slice(-cfg.teamSize);
    for (const t of b.allOuts) q[other(t)] = [];
  }
  return { home: q.home.filter((n): n is string => !!n), away: q.away.filter((n): n is string => !!n) };
}

/** SD-72 — live on-mat figures (suspensions run on the clock `now`). */
export function matNow(s: KabaddiState, now: number = clockNow(s)): { onMat: Record<Side, number>; out: Record<Side, number>; short: Record<Side, number>; sentOff: Record<Side, number> } {
  const cfg = kabaddiCfg(s);
  const d = replayOf(s, undefined, undefined, s.ended ? undefined : now);
  const amar = cfg.style === 'amar';
  const onMat = (x: Side) => Math.max(0, cfg.teamSize - (amar ? 0 : d.out[x]) - d.short[x]);
  return { onMat: { home: onMat('home'), away: onMat('away') }, out: d.out, short: d.short, sentOff: d.sentOff };
}

/** SD-72 — a player's cards so far (by id or name). */
export function cardsOf(s: KabaddiState, side: Side, who: { id?: string; name?: string }): Record<CardColour, number> {
  const c = { green: 0, yellow: 0, red: 0 };
  for (const e of extrasOf(s)) {
    if (e.x !== 'card' || e.side !== side || !e.card || e.official) continue;
    if ((who.id && e.playerId === who.id) || (who.name && e.playerName === who.name)) c[e.card] += 1;
  }
  return c;
}

/** SD-72 — card escalation (AKFI): two greens → the next card is yellow; two
 *  yellows → the next is red. The scorer's hint, not enforced. */
export function suggestedCard(c: Record<CardColour, number>): CardColour | null {
  if (c.red) return null;
  if (c.yellow >= 2) return 'red';
  if (c.green >= 2) return 'yellow';
  return null;
}

/** SD-72 — players who can't play now: sent off (red) or serving a yellow
 *  (running, or waiting for their revival). Names, per side. */
export function unavailable(s: KabaddiState, now: number = clockNow(s)): Record<Side, { name: string; why: 'red' | 'yellow'; until?: number }[]> {
  const out: Record<Side, { name: string; why: 'red' | 'yellow'; until?: number }[]> = { home: [], away: [] };
  const extras = extrasOf(s);
  const per = replayOf(s).perExtra;
  const reds = new Set(extras.filter((e) => e.x === 'card' && e.card === 'red' && e.player && e.playerName).map((e) => `${e.side}|${e.playerName}`));
  extras.forEach((e, j) => {
    if (e.x !== 'card' || !e.player || !e.playerName) return;
    const key = `${e.side}|${e.playerName}`;
    if (e.card === 'red') { if (!out[e.side].some((x) => x.name === e.playerName && x.why === 'red')) out[e.side].push({ name: e.playerName, why: 'red' }); return; }
    if (e.card !== 'yellow' || reds.has(key) || s.ended) return;
    const b = per[j];
    if (!b) return;
    if (b.suspFrom == null) out[e.side].push({ name: e.playerName, why: 'yellow' }); // waits for revival
    else if (b.suspUntil != null && now < b.suspUntil) out[e.side].push({ name: e.playerName, why: 'yellow', until: b.suspUntil });
  });
  return out;
}

/** What a raid would score if logged now (or in place of raid `replaces`) — the
 *  UI uses it to credit the raider / tackler exactly what the engine will score. */
export function previewRaid(s: KabaddiState, outcome: RaidOutcome, replaces?: number): RaidBreakdown | undefined {
  const raids = raidsOf(s);
  const idx = replaces != null ? raids.findIndex((r) => r.eid === replaces) : -1;
  // a new raid goes last, at the clock now (SD-72: suspensions that ran out are back)
  const fresh = idx < 0 && outcome.t == null && s.startedAt ? { ...outcome, t: clockNow(s) } : outcome;
  const list = idx >= 0 ? raids.map((r, i) => (i === idx ? { ...r, defOut: undefined, lineOut: undefined, ...outcome } : r)) : [...raids, fresh];
  const d = replayOf(s, list);
  // perRaid follows the merged order — find this raid's slot
  const want = idx >= 0 ? idx : list.length - 1;
  let ri = 0;
  for (const [kind, i] of d.order) {
    if (kind !== 'r') continue;
    if (i === want) return d.perRaid[ri];
    ri++;
  }
  return undefined;
}

/** SD-114: defenders on the mat facing a raid by `side` — now, or (editing)
 *  just before raid `replaces`. The raid form disables touch chips above it.
 *  SD-72: players suspended / sent off aren't on the mat. */
export function defendersOnMat(s: KabaddiState, side: Side, replaces?: number): number {
  const cfg = kabaddiCfg(s);
  const raids = raidsOf(s);
  const idx = replaces != null ? raids.findIndex((r) => r.eid === replaces) : -1;
  const opp = other(side);
  if (idx >= 0) {
    const eid = raids[idx].eid ?? Infinity;
    const before = replayOf(s, raids.slice(0, idx), extrasOf(s).filter((e) => e.eid < eid), raids[idx].t ?? raids[idx].minute);
    return Math.max(0, cfg.teamSize - (cfg.style === 'amar' ? 0 : before.out[opp]) - before.short[opp]);
  }
  return matNow(s).onMat[opp];
}

type Who = { id: string; fullName: string };
/** The guided-raid form's answers. `editOf` = the id of a past raid being re-entered. */
export interface RaidForm {
  side: Side; touches: number; bonus: boolean; tackled: boolean; raider?: Who; tackler?: Who; editOf?: number; tackleType?: string;
  /** SD-59: defenders who stepped out (line-out) / the raider stepped out */
  defOut?: number; lineOut?: boolean;
}

/** The engine input for a raid form (v2). SD-59: a raider line-out is not a
 *  tackle and his touches don't count. */
export function formOutcome(f: Pick<RaidForm, 'side' | 'touches' | 'bonus' | 'tackled' | 'defOut' | 'lineOut'>): RaidOutcome {
  return {
    side: f.side, touches: f.lineOut ? 0 : f.touches, bonus: f.bonus, raiderOut: f.tackled && !f.lineOut, v: 2,
    ...(f.defOut && f.defOut > 0 ? { defOut: Math.floor(f.defOut) } : null),
    ...(f.lineOut ? { lineOut: true } : null),
  };
}

/** Stat reversals for a guided raid (head or child line): the raider's raid
 *  points and the tackler's tackle points as the engine scores them now. */
export function raidReversals(s: KabaddiState, e: KabaddiEvent, idOf: (name?: string) => string | undefined = () => undefined): Pick<ScoreAction, 'attribution' | 'attribution2'> {
  const r = raidOfEvent(s, e);
  if (!r?.breakdown) return {};
  const { raid, breakdown: b } = r;
  const raiderId = raid.raiderId ?? idOf(raid.raider);
  const tacklerId = raid.tacklerId ?? idOf(raid.tackler);
  return {
    attribution: raiderId && b.raidPts ? { playerId: raiderId, stat: 'raidPoints', by: -b.raidPts, playerName: raid.raider } : undefined,
    attribution2: tacklerId && b.raiderOut && b.tacklePts ? { playerId: tacklerId, stat: 'tacklePoints', by: -b.tacklePts, playerName: raid.tackler } : undefined,
  };
}

/** The actions the guided raid form dispatches (minute / half are stamped by the
 *  caller). The raider is credited exactly the raid points the engine scores —
 *  nothing on an empty or failed raid — and the tackler the tackle points (2 for
 *  a super tackle). An edit first reverses the old credits (REMOVE_EVENT id -1
 *  matches no line: a stat carrier only), then replaces the raid in place. */
export function raidActions(s: KabaddiState, f: RaidForm, idOf?: (name?: string) => string | undefined): ScoreAction[] {
  const out: ScoreAction[] = [];
  // SD-114: the form logs v2 raids — touches capped at the defenders on the mat.
  const outcome = formOutcome(f);
  const b = previewRaid(s, outcome, f.editOf);
  if (f.editOf != null) {
    const head = s.events.find((x) => x.id === f.editOf);
    const rev = head ? raidReversals(s, head, idOf) : {};
    if (rev.attribution || rev.attribution2) out.push({ type: 'REMOVE_EVENT', side: f.side, payload: { id: -1, v: 2 }, ...rev });
  }
  const tackler = f.tackled && !f.lineOut ? f.tackler : undefined;
  const raidPts = b?.raidPts ?? 0;
  const tacklePts = b?.raiderOut ? b.tacklePts : 0;
  out.push({
    type: 'RAID_OUTCOME', side: f.side,
    attribution: f.raider && raidPts ? { playerId: f.raider.id, stat: 'raidPoints', by: raidPts, playerName: f.raider.fullName } : undefined,
    // SD-119: the tackler defends — the side that is NOT raiding
    attribution2: tackler && tacklePts ? { playerId: tackler.id, stat: 'tacklePoints', by: tacklePts, playerName: tackler.fullName, side: f.side === 'home' ? 'away' : 'home' } : undefined,
    payload: {
      ...outcome,
      ...(f.raider ? { raiderId: f.raider.id, raiderName: f.raider.fullName } : null),
      ...(tackler ? { tacklerId: tackler.id, tacklerName: tackler.fullName } : null),
      // SD-117b: optional, only on a tackled raid
      ...(f.tackled && !f.lineOut && f.tackleType ? { tackleType: f.tackleType } : null),
      ...(f.editOf != null ? { replaces: f.editOf } : null),
    },
  });
  return out;
}

/** The raid entry + its current breakdown for a timeline line (head or child). */
export function raidOfEvent(s: KabaddiState, e: KabaddiEvent): { raid: RaidEntry; breakdown?: RaidBreakdown } | null {
  if (e.group == null) return null;
  const raids = raidsOf(s);
  const i = raids.findIndex((r) => r.eid === e.group);
  if (i < 0) return null;
  return { raid: raids[i], breakdown: perRaidByIndex(replayOf(s))[i] };
}

/** perRaid indexed by the raid's index in `raids[]` (perRaid follows the
 *  merged replay order, which with technical points / cards in the log is
 *  still raid order — kept explicit for safety). */
function perRaidByIndex(d: KabaddiDerived): RaidBreakdown[] {
  const out: RaidBreakdown[] = [];
  let ri = 0;
  for (const [kind, i] of d.order) if (kind === 'r') { const b = d.perRaid[ri++]; if (b) out[i] = b; }
  return out;
}
export { perRaidByIndex };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w.endsWith('h') ? 'es' : 's'}`;

/** The timeline lines of every guided raid, derived from the replay. */
export function raidEvents(raids: RaidEntry[], orphans: RaidEntry[], cfg: KabaddiCfg, extras: ExtraEntry[] = []): KabaddiEvent[] {
  const per = perRaidByIndex(replayRaids(raids, cfg, extras));
  const out: KabaddiEvent[] = [];
  raids.forEach((r, i) => {
    const b = per[i];
    if (r.eid == null || r.hidden || !b) return;
    const eid = r.eid;
    const stamp = r.gr ? 'GR' : `${r.minute ?? 0}'`;
    const base = { stamp, minute: r.minute, half: r.half, group: eid };
    const parts = [
      b.touchPts ? plural(b.touchPts, 'touch') : null,
      b.touchesLost ? `${plural(b.touchesLost, 'touch')} lost (caught)` : null,
      b.bonusPts ? 'bonus' : r.bonus ? 'bonus (void — under 6 defenders)' : null,
      b.defOutPts ? `${plural(b.defOutPts, 'defender')} stepped out` : null,
      b.lineOut ? 'raider stepped out' : b.raiderOut ? 'raider out' : null,
    ].filter(Boolean).join(' · ');
    const name = b.raidPts >= 3 ? 'Super raid' : b.raidPts === 0 && !b.raiderOut ? 'Empty raid' : 'Raid';
    const head = `${b.doOrDie ? 'Do-or-die · ' : ''}${name}${b.raidPts ? ` +${b.raidPts}` : ''}${parts ? ` — ${parts}` : ''}`;
    out.push({ ...base, id: eid, icon: r.gr ? '⚡' : '🤼', label: r.gr ? `Golden Raid — ${head}` : head, detail: r.raider, side: r.side, kind: 'raid', points: b.raidPts, playerName: r.raider });
    let k = 1;
    // SD-59: line-outs — 1 point per player who stepped out, to the other side
    if (b.defOutPts) {
      out.push({ ...base, id: eid + k / 10, icon: '🚩', label: `Line-out +${b.defOutPts} — ${plural(b.defOutPts, 'defender')} out`, side: r.side, kind: 'lineout', points: b.defOutPts });
      k += 1;
    }
    if (b.lineOut) {
      out.push({ ...base, id: eid + k / 10, icon: '🚩', label: 'Line-out +1 — raider out', detail: r.raider, side: other(r.side), kind: 'lineout', points: 1 });
      k += 1;
    } else if (b.raiderOut) {
      const tl = b.superTackle ? 'Super tackle' : b.doOrDieFail ? 'Do-or-die stop' : 'Tackle';
      // SD-117b: "(ankle hold)" only on a raid logged with a tackle type
      const how = r.tt && r.raiderOut ? ` (${tackleTypeLabel(r.tt)!.toLowerCase()})` : '';
      out.push({ ...base, id: eid + k / 10, icon: '🛡️', label: `${tl} +${b.tacklePts}${how}`, detail: r.tackler, side: other(r.side), kind: 'tackle', points: b.tacklePts, playerName: r.tackler, ...(how ? { tackleType: r.tt } : null) });
      k += 1;
    }
    for (const side of b.allOuts) {
      out.push({ ...base, id: eid + k / 10, icon: '💥', label: 'All out +2', side, kind: 'allout', points: 2 });
      k += 1;
    }
  });
  // Legacy-only: a raid taken out of play whose line stayed (frozen value).
  for (const r of orphans) {
    if (r.eid == null) continue;
    out.push({ id: r.eid, group: r.eid, stamp: r.gr ? 'GR' : `${r.minute ?? 0}'`, minute: r.minute, half: r.half, icon: '🤼', label: 'Raid', detail: r.raider, side: r.side, kind: 'raid', points: r.lp ?? 0, playerName: r.raider });
  }
  return out;
}

/** SD-59 / SD-72 — the timeline lines of technical points and cards. A
 *  card's technical point is its own line (group = the card). */
export function extraEvents(raids: RaidEntry[], extras: ExtraEntry[], cfg: KabaddiCfg): KabaddiEvent[] {
  if (!extras.length) return [];
  const per = replayRaids(raids, cfg, extras).perExtra;
  const out: KabaddiEvent[] = [];
  extras.forEach((e, j) => {
    const b = per[j];
    if (!b) return; // after a gaminee all-out ended the match
    const base = { stamp: `${e.minute ?? 0}'`, minute: e.minute, half: e.half, group: e.eid };
    const who = e.official ? 'Team official' : e.playerName;
    if (e.x === 'tech') {
      out.push({ ...base, id: e.eid, icon: '⚖️', label: `Technical point +${b.points}${e.reason ? ` — ${techReasonLabel(e.reason)!.toLowerCase()}` : ''}`, detail: who, side: e.side, kind: 'tech', points: b.points });
      return;
    }
    const c = e.card ?? 'green';
    const label = c === 'green' ? 'Green card — warning'
      : c === 'yellow' ? (e.player && b.suspFrom == null ? `Yellow card — ${YELLOW_MINUTES} min from his revival` : `Yellow card — ${YELLOW_MINUTES} min suspension`)
      : 'Red card — sent off';
    out.push({ ...base, id: e.eid, icon: CARD_ICON[c], label, detail: who, side: e.side, kind: 'card', points: 0, card: c, ...(e.playerName && !e.official ? { playerName: e.playerName } : null), ...(e.playerId ? { playerId: e.playerId } : null) });
    if (b.points) out.push({ ...base, id: e.eid + 0.1, icon: '⚖️', label: `Technical point +${b.points} (${c} card)`, side: other(e.side), kind: 'tech', points: b.points });
  });
  return out;
}

/** Rebuild the timeline: non-raid lines kept, every guided raid's lines re-derived. */
function withRaids(s: KabaddiState, raids: RaidEntry[], orphans = s.orphanRaids ?? [], keep: KabaddiEvent[] = s.events, extras: ExtraEntry[] = extrasOf(s)): KabaddiState {
  const cfg = kabaddiCfg(s);
  const events = [...keep.filter((e) => e.group == null), ...raidEvents(raids, orphans, cfg, extras), ...extraEvents(raids, extras, cfg)].sort((a, b) => a.id - b.id);
  return { ...s, raids, ...(orphans.length || s.orphanRaids ? { orphanRaids: orphans } : null), ...(extras.length || s.extras ? { extras } : null), events };
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** SD-72: the clock time of a LIVE step (the UI sends `at` only when live —
 *  not while backfilling or editing). Undefined = use the minute stamp. */
function liveT(s: KabaddiState, a: ScoreAction): number | undefined {
  const at = Number(a.payload?.at);
  if (!a.payload || a.payload.at == null || !Number.isFinite(at) || !s.startedAt) return undefined;
  return Math.round(clockAt(s, at) * 1000) / 1000;
}

/** Log a technical point / card: replay, re-derive the timeline, score the
 *  change (incrementally, like a raid). In a Golden Raid a point decides it. */
function addExtra(s: KabaddiState, entry: ExtraEntry): KabaddiState {
  const prev = extrasOf(s);
  const extras = [...prev, entry];
  const before = replayOf(s);
  const after = replayOf(s, raidsOf(s), extras);
  const scored = after.home !== before.home || after.away !== before.away;
  const finish = after.allOutEnded || (s.goldenRaid && scored);
  const next: KabaddiState = {
    ...withRaids(s, raidsOf(s), s.orphanRaids ?? [], s.events, extras),
    home: s.home + (after.home - before.home),
    away: s.away + (after.away - before.away),
    out: after.out, emptyRaids: after.emptyRaids,
    ended: s.ended || finish,
    startedAt: finish ? undefined : s.startedAt,
    seq: s.seq + 1,
  };
  return finish ? unpause(next) : next;
}

export const reducer = (s: KabaddiState, a: ScoreAction): KabaddiState => {
  if (s.ended && a.type !== 'END') return s;
  const minute = Number(a.payload?.minute ?? currentMinute(s));
  const hf = Number(a.payload?.half ?? s.half);
  const who = a.attribution?.playerName;
  const pts = Number(a.payload?.points ?? 1);
  const pushPt = (type: 'RAID' | 'TACKLE'): KabaddiState => {
    if (!a.side) return s;
    // a player who's been subbed off takes no further part
    if (who && s.subbedOff[a.side].includes(who)) return s;
    const gr = s.goldenRaid; // sudden death: this point decides the match
    const kind = type === 'RAID' ? 'raid' : 'tackle';
    const scored = { ...s, [a.side]: s[a.side] + pts } as KabaddiState;
    return {
      ...scored,
      ...(gr ? { ended: true, startedAt: undefined } : null),
      seq: s.seq + 1,
      events: [...s.events, { id: s.seq + 1, stamp: gr ? 'GR' : `${minute}'`, icon: gr ? '⚡' : type === 'RAID' ? '🤼' : '🛡️', label: gr ? `Golden Raid — ${kind} +${pts}` : type === 'RAID' ? `Raid +${pts}` : `Tackle +${pts}`, detail: who, side: a.side, kind, points: pts, playerName: who, ...(a.attribution?.playerId ? { playerId: a.attribution.playerId } : null), minute, half: hf }],
    };
  };
  switch (a.type) {
    case 'KICKOFF':
      return unpause({ ...s, startedAt: Number(a.payload?.at) });
    case 'PAUSE': {
      // SD-117b (new action): hold the clock — a timeout, injury or review.
      if (!s.startedAt || s.pausedAt != null) return s;
      return { ...s, pausedAt: Number(a.payload?.at ?? Date.now()) };
    }
    case 'RESUME': {
      // SD-117b: restart it; the pause is added to the start, so the minute
      // carries on from where it stopped (accumulated elapsed time).
      if (!s.startedAt || s.pausedAt == null) return s;
      const at = Number(a.payload?.at ?? Date.now());
      return unpause({ ...s, startedAt: s.startedAt + Math.max(0, at - s.pausedAt) });
    }
    case 'TIMEOUT': {
      // SD-117b (new action): a team timeout — a timeline marker, no score.
      // 2 per team per half.
      if (a.side !== 'home' && a.side !== 'away' || timeoutsUsed(s, a.side, hf) >= TIMEOUTS_PER_HALF) return s;
      return {
        ...s, seq: s.seq + 1,
        events: [...s.events, { id: s.seq + 1, stamp: `${minute}'`, icon: '⏱️', label: 'Timeout', side: a.side, kind: 'timeout', minute, half: hf }],
      };
    }
    case 'RAID':
      return pushPt('RAID');
    case 'TACKLE':
      return pushPt('TACKLE');
    case 'RAID_OUTCOME': {
      // Guided raid: touches / bonus / raider-out → the engine (replayed for
      // correct revival, super tackle, do-or-die & all-out) sets the new score.
      if (!a.side) return s;
      const p = a.payload ?? {};
      const attr2 = (a.attribution2 ?? (p._attr2 as ScoreAction['attribution2'])) || undefined;
      const raider = str(p.raiderName) ?? who;
      // (a correction of a past raid may name a player subbed off since)
      if (raider && p.replaces == null && s.subbedOff[a.side].includes(raider)) return s;
      const outcome: RaidOutcome = {
        side: a.side,
        touches: Math.max(0, Math.floor(Number(p.touches ?? 0))),
        bonus: Boolean(p.bonus),
        raiderOut: Boolean(p.raiderOut),
        // SD-114: a v2 raid's touches are capped at the defenders on the mat
        // (in the replay); an un-versioned one replays its raw touches.
        ...(Number(p.v) >= 2 ? { v: 2 as const } : null),
        // SD-59 (new optional keys): line-outs
        ...(Number(p.defOut) > 0 ? { defOut: Math.floor(Number(p.defOut)) } : null),
        ...(p.lineOut === true ? { lineOut: true } : null),
      };
      const cfg = kabaddiCfg(s);
      const ex = extrasOf(s);
      const prev = raidsOf(s);
      // Edit in place (new optional key): the corrected raid keeps its id & slot.
      const replaces = p.replaces != null ? prev.findIndex((r) => r.eid === Number(p.replaces)) : -1;
      const gr = s.goldenRaid;
      const entry: RaidEntry = {
        ...outcome,
        eid: replaces >= 0 ? prev[replaces].eid : s.seq + 1,
        minute, half: hf, ...(gr ? { gr: true } : null),
        ...(raider ? { raider } : null),
        ...(str(p.raiderId) ?? a.attribution?.playerId ? { raiderId: str(p.raiderId) ?? a.attribution?.playerId } : null),
        ...(str(p.tacklerName) ?? attr2?.playerName ? { tackler: str(p.tacklerName) ?? attr2?.playerName } : null),
        ...(str(p.tacklerId) ?? attr2?.playerId ? { tacklerId: str(p.tacklerId) ?? attr2?.playerId } : null),
        ...(outcome.raiderOut && str(p.tackleType) ? { tt: str(p.tackleType) } : null),
      };
      // SD-72: the clock time orders the raid against suspensions (live raids only)
      const t = replaces >= 0 ? prev[replaces].t : liveT(s, a);
      if (t != null) entry.t = t;
      const before = replayRaids(prev, cfg, ex);
      const raids = replaces >= 0 ? prev.map((r, i) => (i === replaces ? entry : r)) : [...prev, entry];
      const after = replayRaids(raids, cfg, ex);
      if (replaces < 0) entry.lp = (after.home - before.home) || (after.away - before.away);
      const scored = after.home !== before.home || after.away !== before.away;
      const finish = after.allOutEnded || (gr && scored);
      const next: KabaddiState = {
        ...withRaids(s, raids),
        home: s.home + (after.home - before.home),
        away: s.away + (after.away - before.away),
        out: after.out, emptyRaids: after.emptyRaids,
        ended: s.ended || finish,
        startedAt: finish ? undefined : s.startedAt,
        seq: s.seq + 1,
      };
      return finish ? unpause(next) : next;
    }
    case 'TECH_POINT': {
      // SD-59 (new action): a technical point to `side` (AKFI / IKF) — the
      // player at fault (optional) is on the other side. Nobody goes out.
      if (a.side !== 'home' && a.side !== 'away') return s;
      const p = a.payload ?? {};
      const n = Math.max(1, Math.floor(Number(p.points ?? 1)) || 1);
      const entry: ExtraEntry = {
        x: 'tech', side: a.side, eid: s.seq + 1, minute, half: hf, ...(n !== 1 ? { n } : null),
        ...(str(p.reason) ? { reason: str(p.reason) } : null),
        ...(str(p.playerName) ? { playerName: str(p.playerName) } : null),
        ...(str(p.playerId) ? { playerId: str(p.playerId) } : null),
      };
      const t = liveT(s, a);
      if (t != null) entry.t = t;
      return addExtra(s, entry);
    }
    case 'CARD': {
      // SD-72 (new action): green = warning; yellow = 2-minute suspension (the
      // side plays short; a player carded while out serves it from his
      // revival); red = off for the match, no substitute. `tp` = technical
      // point(s) to the opponent with the card.
      if (a.side !== 'home' && a.side !== 'away') return s;
      const p = a.payload ?? {};
      const card = p.card === 'green' || p.card === 'yellow' || p.card === 'red' ? p.card : null;
      if (!card) return s;
      const official = p.official === true;
      const name = official ? undefined : str(p.playerName);
      const id = official ? undefined : str(p.playerId);
      const tp = Math.max(0, Math.floor(Number(p.tp ?? 0)) || 0);
      const entry: ExtraEntry = {
        x: 'card', side: a.side, card, eid: s.seq + 1, minute, half: hf,
        ...(official ? { official: true } : name || id ? { player: true, who: id ?? name } : p.player === true ? { player: true } : null),
        ...(name ? { playerName: name } : null), ...(id ? { playerId: id } : null),
        ...(!official && p.wasOut === true ? { wasOut: true } : null),
        ...(tp ? { tp } : null),
      };
      const t = liveT(s, a);
      if (t != null) entry.t = t;
      return addExtra(s, entry);
    }
    case 'SUB': {
      if (!a.side || s.subsUsed[a.side] >= s.maxSubs) return s;
      const offName = String(a.payload?.offName ?? '');
      const onName = String(a.payload?.onName ?? '');
      if (!offName || !onName) return s;
      // SD-117b (format: subReturn): a substituted player may come back on —
      // they leave the "subbed off" list (the sub still counts to the limit).
      const back = s.subReturn && s.subbedOff[a.side].includes(onName) ? onName : undefined;
      const off = back ? s.subbedOff[a.side].filter((n) => n !== back) : s.subbedOff[a.side];
      return {
        ...s,
        seq: s.seq + 1,
        events: [...s.events, { id: s.seq + 1, stamp: `${minute}'`, icon: '🔄', label: back ? 'Substitution (returns)' : 'Substitution', detail: `${onName} ⬆  ${offName} ⬇`, side: a.side, kind: 'sub', playerName: offName, minute, half: hf, ...(back ? { ret: back } : null) }],
        subsUsed: { ...s.subsUsed, [a.side]: s.subsUsed[a.side] + 1 },
        subbedOff: { ...s.subbedOff, [a.side]: [...off, offName] },
      };
    }
    case 'REMOVE_EVENT':
      // Surgically remove one logged moment, reversing its score (raid/tackle) or
      // its substitution. The stat line is reversed by this action's attribution.
      // `id: -1` matches nothing — a pure stat-reversal carrier (Edit uses it).
      return Number(a.payload?.v) >= 2 ? removeV2(s, Number(a.payload?.id)) : removeLegacy(s, Number(a.payload?.id));
    case 'NEXT_HALF':
      // 1→2 (regulation) and 3→4 (extra time).
      return s.half === 1 ? unpause({ ...s, half: 2, startedAt: undefined }) : s.half === 3 ? unpause({ ...s, half: 4, startedAt: undefined }) : s;
    case 'START_EXTRA_TIME':
      // Level after regulation → two extra-time halves.
      return s.home === s.away && s.half === 2 && !s.ended && s.decider === 'extra_time' ? unpause({ ...s, half: 3, startedAt: undefined }) : s;
    case 'START_GOLDEN_RAID':
      // Level after regulation or extra time → sudden-death Golden Raid.
      return s.home === s.away && !s.ended ? unpause({ ...s, goldenRaid: true, startedAt: undefined }) : s;
    case 'START_SHOOTOUT':
      // Level after regulation/extra time → a 5-raid shootout (PKL tie-breaker).
      return s.home === s.away && !s.ended && !s.shootout ? unpause({ ...s, shootout: { home: [], away: [] }, startedAt: undefined }) : s;
    case 'SHOOTOUT_RAID': {
      // One shootout raid: `points` scored (0 = failed/empty). The regulation
      // score stays tied; the shootout totals decide the winner.
      if (!s.shootout || s.ended || (a.side !== 'home' && a.side !== 'away')) return s;
      const p = Math.max(0, Math.floor(Number(a.payload?.points ?? 0)));
      const sh = { ...s.shootout, [a.side]: [...s.shootout[a.side], p] };
      const winner = decideRaidShootout(sh.home, sh.away);
      return {
        ...s,
        shootout: sh,
        ended: winner != null,
        startedAt: undefined,
        seq: s.seq + 1,
        events: [...s.events, { id: s.seq + 1, stamp: 'SO', icon: '🎯', label: `Shootout raid +${p}`, detail: who, side: a.side, kind: 'raid', points: p, playerName: who, minute, half: hf }],
      };
    }
    case 'END':
      return unpause({ ...s, ended: true, startedAt: undefined });
    default:
      return s;
  }
};

/** Score change from replacing the raid list (the incremental rule the reducer
 *  has always used, so legacy score offsets are preserved). */
function rescore(s: KabaddiState, raids: RaidEntry[], extras: ExtraEntry[] = extrasOf(s)): Pick<KabaddiState, 'home' | 'away' | 'out' | 'emptyRaids'> {
  const before = replayOf(s);
  const after = replayOf(s, raids, extras);
  return { home: Math.max(0, s.home + (after.home - before.home)), away: Math.max(0, s.away + (after.away - before.away)), out: after.out, emptyRaids: after.emptyRaids };
}

/** v:2 remove — a guided raid's line (head, tackle or all-out) takes the whole
 *  raid out and re-derives everything after it; a shootout raid leaves the
 *  regulation score alone. */
function removeV2(s: KabaddiState, id: number): KabaddiState {
  const ev = s.events.find((e) => e.id === id);
  if (!ev || !ev.side) return s;
  if (ev.group != null) {
    const orphans = s.orphanRaids ?? [];
    if (orphans.some((r) => r.eid === ev.group)) return withRaids(s, raidsOf(s), orphans.filter((r) => r.eid !== ev.group));
    // SD-59 / SD-72: a technical point / card (and its technical-point line)
    if (extrasOf(s).some((x) => x.eid === ev.group)) {
      const extras = extrasOf(s).filter((x) => x.eid !== ev.group);
      return { ...withRaids(s, raidsOf(s), orphans, s.events, extras), ...rescore(s, raidsOf(s), extras) };
    }
    const raids = raidsOf(s).filter((r) => r.eid !== ev.group);
    return { ...withRaids(s, raids), ...rescore(s, raids) };
  }
  const events = s.events.filter((e) => e.id !== id);
  if (isShootoutEvent(ev) && s.shootout) {
    const side = ev.side;
    const idx = s.events.filter((e) => isShootoutEvent(e) && e.side === side).findIndex((e) => e.id === id);
    const sh = { ...s.shootout, [side]: s.shootout[side].filter((_, i) => i !== idx) };
    return { ...s, events, shootout: sh };
  }
  return removePlain(s, ev, events);
}

/** A legacy RAID / TACKLE point or a substitution. */
function removePlain(s: KabaddiState, ev: KabaddiEvent, events: KabaddiEvent[], points = ev.points ?? 0): KabaddiState {
  if (!ev.side) return s;
  let next = { ...s, events } as KabaddiState;
  if (ev.kind === 'raid' || ev.kind === 'tackle') next = { ...next, [ev.side]: Math.max(0, next[ev.side] - points) } as KabaddiState;
  else if (ev.kind === 'sub' && ev.playerName) {
    // SD-117b: undoing a "returns" sub sends the returning player back off
    const off = next.subbedOff[ev.side].filter((n) => n !== ev.playerName);
    next = { ...next, subsUsed: { ...next.subsUsed, [ev.side]: Math.max(0, next.subsUsed[ev.side] - 1) }, subbedOff: { ...next.subbedOff, [ev.side]: ev.ret && !off.includes(ev.ret) ? [...off, ev.ret] : off } };
  }
  return next;
}

/** Un-versioned remove — replays a pre-SD-03 log EXACTLY as it scored then: the
 *  raid taken out is the n-th entry of `raids[]`, where n counts every 'raid'
 *  line (guided, legacy RAID and shootout alike). When that isn't the tapped
 *  raid, the tapped line goes and the n-th raid leaves play (its line stays). */
function removeLegacy(s: KabaddiState, id: number): KabaddiState {
  const ev = s.events.find((e) => e.id === id);
  if (!ev || !ev.side) return s;
  const raids = raidsOf(s);
  const orphans = s.orphanRaids ?? [];
  const headRaid = ev.group != null && ev.id === ev.group ? raids.find((r) => r.eid === ev.group) : undefined;
  const headOrphan = ev.group != null && ev.id === ev.group ? orphans.find((r) => r.eid === ev.group) : undefined;
  if (ev.kind === 'raid' && raids.length) {
    const ordinal = s.events.filter((e) => e.kind === 'raid' && (e.group == null || e.id === e.group)).findIndex((e) => e.id === id);
    if (ordinal >= 0 && ordinal < raids.length) {
      const gone = raids[ordinal];
      const kept = raids.filter((_, i) => i !== ordinal);
      const score = rescore(s, kept);
      if (headRaid === gone) return { ...withRaids(s, kept), ...score };
      // The wrong raid left play: hide the tapped line, keep the other's line.
      const nextRaids = kept.map((r) => (r === headRaid ? { ...r, hidden: true } : r));
      const nextOrphans = (headOrphan ? orphans.filter((r) => r !== headOrphan) : orphans).concat(gone.hidden ? [] : [gone]);
      const keep = s.events.filter((e) => e.id !== id);
      return { ...withRaids(s, nextRaids, nextOrphans, keep), ...score };
    }
  }
  // Fallback: take the line's shown value off its side (the pre-SD-03 value for a guided raid).
  if (headRaid || headOrphan) {
    const t = headRaid
      ? withRaids(s, raids.map((r) => (r === headRaid ? { ...r, hidden: true } : r)))
      : withRaids(s, raids, orphans.filter((r) => r !== headOrphan));
    return removePlain(t, ev, t.events, (headRaid ?? headOrphan)?.lp ?? 0);
  }
  return removePlain(s, ev, s.events.filter((e) => e.id !== id));
}

/** Winner for display: a shootout decides a level match; a draw has none. */
export function kabaddiWinner(s: KabaddiState): 'home' | 'away' | 'draw' {
  if (s.shootout) {
    const hs = s.shootout.home.reduce((x, y) => x + y, 0), as = s.shootout.away.reduce((x, y) => x + y, 0);
    if (hs !== as) return hs > as ? 'home' : 'away';
  }
  return s.home > s.away ? 'home' : s.away > s.home ? 'away' : 'draw';
}

/** Regulation points per half per side, from the timeline (shootout excluded). */
export function halfPoints(s: KabaddiState, side: Side, half: number): number {
  return s.events
    .filter((e) => e.side === side && e.half === half && !isShootoutEvent(e) && (e.kind === 'raid' || e.kind === 'tackle' || e.kind === 'allout' || e.kind === 'tech' || e.kind === 'lineout'))
    .reduce((x, e) => x + (e.points ?? 0), 0);
}

export interface Line { name: string; raid: number; tackle: number }

/** Box score: raid / tackle points per player for one side; `scope` limits to one
 *  half. A guided raid's tackle line sits on the DEFENDING side under the tackler,
 *  so RAID and TCKL each land in the right team's table (SD-03). Shootout raids
 *  stay out of player stats (PKL). */
export function tally(events: LiveEvent[], side: Side, scope: 'all' | number = 'all'): Line[] {
  const byName = new Map<string, Line>();
  const ensure = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, raid: 0, tackle: 0 });
    return byName.get(name)!;
  };
  for (const e of events) {
    if (e.side !== side || !e.playerName || !e.points || isShootoutEvent(e)) continue;
    if (scope !== 'all' && e.half !== scope) continue;
    const l = ensure(e.playerName);
    if (e.kind === 'raid') l.raid += e.points;
    else if (e.kind === 'tackle') l.tackle += e.points;
  }
  return [...byName.values()].sort((a, b) => (b.raid + b.tackle) - (a.raid + a.tackle));
}
