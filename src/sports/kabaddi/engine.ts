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
import { replayRaids, decideRaidShootout, type RaidOutcome, type KabaddiStyle, type KabaddiCfg, type RaidBreakdown, type Side } from './rules.ts';

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
}

/** A timeline line; `group` ties a guided raid's lines together. */
export type KabaddiEvent = LiveEvent & { group?: number };

export interface KabaddiState {
  home: number;
  away: number;
  half: 1 | 2 | 3 | 4; // 3 & 4 = extra-time halves (tie-breaker)
  startedAt?: number;
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
});

// Defensive against state persisted before the Pro-Kabaddi fields existed.
export const kabaddiCfg = (s: KabaddiState): KabaddiCfg => ({ teamSize: s.teamSize ?? 7, style: s.style ?? 'sanjeevani', proRules: s.proRules ?? true });
const raidsOf = (s: KabaddiState): RaidEntry[] => s.raids ?? [];
const other = (x: Side): Side => (x === 'home' ? 'away' : 'home');

/** 1st/2nd half, then the two extra-time halves. */
export const halfLabel = (h: number): string =>
  h === 1 ? '1st Half' : h === 2 ? '2nd Half' : h === 3 ? 'Extra Time · 1st' : 'Extra Time · 2nd';

export function currentMinute(s: KabaddiState): number {
  const hm = s.halfMinutes, et = s.extraTimeMinutes;
  const base = s.half === 1 ? 0 : s.half === 2 ? hm : s.half === 3 ? 2 * hm : 2 * hm + et;
  if (!s.startedAt) return base;
  // Hold at the half's end instead of drifting past it (the manual clock never
  // auto-ends a half).
  const cap = base + (s.half <= 2 ? hm : et);
  return Math.min(base + Math.floor((Date.now() - s.startedAt) / 60000), cap);
}

/** A 5-raid shootout line (stamp 'SO') — not part of the regulation score. */
export const isShootoutEvent = (e: LiveEvent) => e.stamp === 'SO';
/** A guided raid's own line (not its tackle / all-out child). */
export const isRaidHead = (e: KabaddiEvent) => e.group != null && e.id === e.group;

/** What a raid would score if logged now (or in place of raid `replaces`) — the
 *  UI uses it to credit the raider / tackler exactly what the engine will score. */
export function previewRaid(s: KabaddiState, outcome: RaidOutcome, replaces?: number): RaidBreakdown | undefined {
  const raids = raidsOf(s);
  const idx = replaces != null ? raids.findIndex((r) => r.eid === replaces) : -1;
  const list = idx >= 0 ? raids.map((r, i) => (i === idx ? { ...r, ...outcome } : r)) : [...raids, outcome];
  return replayRaids(list, kabaddiCfg(s)).perRaid[idx >= 0 ? idx : list.length - 1];
}

type Who = { id: string; fullName: string };
/** The guided-raid form's answers. `editOf` = the id of a past raid being re-entered. */
export interface RaidForm { side: Side; touches: number; bonus: boolean; tackled: boolean; raider?: Who; tackler?: Who; editOf?: number }

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
  const outcome: RaidOutcome = { side: f.side, touches: f.touches, bonus: f.bonus, raiderOut: f.tackled };
  const b = previewRaid(s, outcome, f.editOf);
  if (f.editOf != null) {
    const head = s.events.find((x) => x.id === f.editOf);
    const rev = head ? raidReversals(s, head, idOf) : {};
    if (rev.attribution || rev.attribution2) out.push({ type: 'REMOVE_EVENT', side: f.side, payload: { id: -1, v: 2 }, ...rev });
  }
  const tackler = f.tackled ? f.tackler : undefined;
  const raidPts = b?.raidPts ?? 0;
  const tacklePts = b?.raiderOut ? b.tacklePts : 0;
  out.push({
    type: 'RAID_OUTCOME', side: f.side,
    attribution: f.raider && raidPts ? { playerId: f.raider.id, stat: 'raidPoints', by: raidPts, playerName: f.raider.fullName } : undefined,
    attribution2: tackler && tacklePts ? { playerId: tackler.id, stat: 'tacklePoints', by: tacklePts, playerName: tackler.fullName } : undefined,
    payload: {
      ...outcome,
      ...(f.raider ? { raiderId: f.raider.id, raiderName: f.raider.fullName } : null),
      ...(tackler ? { tacklerId: tackler.id, tacklerName: tackler.fullName } : null),
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
  return { raid: raids[i], breakdown: replayRaids(raids, kabaddiCfg(s)).perRaid[i] };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w.endsWith('h') ? 'es' : 's'}`;

/** The timeline lines of every guided raid, derived from the replay. */
export function raidEvents(raids: RaidEntry[], orphans: RaidEntry[], cfg: KabaddiCfg): KabaddiEvent[] {
  const per = replayRaids(raids, cfg).perRaid;
  const out: KabaddiEvent[] = [];
  raids.forEach((r, i) => {
    const b = per[i];
    if (r.eid == null || r.hidden || !b) return;
    const eid = r.eid;
    const stamp = r.gr ? 'GR' : `${r.minute ?? 0}'`;
    const base = { stamp, minute: r.minute, half: r.half, group: eid };
    const parts = [
      b.touchPts ? plural(b.touchPts, 'touch') : null,
      b.bonusPts ? 'bonus' : r.bonus ? 'bonus (void — under 6 defenders)' : null,
      b.raiderOut ? 'raider out' : null,
    ].filter(Boolean).join(' · ');
    const name = b.raidPts >= 3 ? 'Super raid' : b.raidPts === 0 && !b.raiderOut ? 'Empty raid' : 'Raid';
    const head = `${b.doOrDie ? 'Do-or-die · ' : ''}${name}${b.raidPts ? ` +${b.raidPts}` : ''}${parts ? ` — ${parts}` : ''}`;
    out.push({ ...base, id: eid, icon: r.gr ? '⚡' : '🤼', label: r.gr ? `Golden Raid — ${head}` : head, detail: r.raider, side: r.side, kind: 'raid', points: b.raidPts, playerName: r.raider });
    let k = 1;
    if (b.raiderOut) {
      const tl = b.superTackle ? 'Super tackle' : b.doOrDieFail ? 'Do-or-die stop' : 'Tackle';
      out.push({ ...base, id: eid + k / 10, icon: '🛡️', label: `${tl} +${b.tacklePts}`, detail: r.tackler, side: other(r.side), kind: 'tackle', points: b.tacklePts, playerName: r.tackler });
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

/** Rebuild the timeline: non-raid lines kept, every guided raid's lines re-derived. */
function withRaids(s: KabaddiState, raids: RaidEntry[], orphans = s.orphanRaids ?? [], keep: KabaddiEvent[] = s.events): KabaddiState {
  const events = [...keep.filter((e) => e.group == null), ...raidEvents(raids, orphans, kabaddiCfg(s))].sort((a, b) => a.id - b.id);
  return { ...s, raids, ...(orphans.length || s.orphanRaids ? { orphanRaids: orphans } : null), events };
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

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
      return { ...s, startedAt: Number(a.payload?.at) };
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
      };
      const cfg = kabaddiCfg(s);
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
      };
      const before = replayRaids(prev, cfg);
      const raids = replaces >= 0 ? prev.map((r, i) => (i === replaces ? entry : r)) : [...prev, entry];
      const after = replayRaids(raids, cfg);
      if (replaces < 0) entry.lp = (after.home - before.home) || (after.away - before.away);
      const scored = after.home !== before.home || after.away !== before.away;
      const finish = after.allOutEnded || (gr && scored);
      return {
        ...withRaids(s, raids),
        home: s.home + (after.home - before.home),
        away: s.away + (after.away - before.away),
        out: after.out, emptyRaids: after.emptyRaids,
        ended: s.ended || finish,
        startedAt: finish ? undefined : s.startedAt,
        seq: s.seq + 1,
      };
    }
    case 'SUB': {
      if (!a.side || s.subsUsed[a.side] >= s.maxSubs) return s;
      const offName = String(a.payload?.offName ?? '');
      const onName = String(a.payload?.onName ?? '');
      if (!offName || !onName) return s;
      return {
        ...s,
        seq: s.seq + 1,
        events: [...s.events, { id: s.seq + 1, stamp: `${minute}'`, icon: '🔄', label: 'Substitution', detail: `${onName} ⬆  ${offName} ⬇`, side: a.side, kind: 'sub', playerName: offName, minute, half: hf }],
        subsUsed: { ...s.subsUsed, [a.side]: s.subsUsed[a.side] + 1 },
        subbedOff: { ...s.subbedOff, [a.side]: [...s.subbedOff[a.side], offName] },
      };
    }
    case 'REMOVE_EVENT':
      // Surgically remove one logged moment, reversing its score (raid/tackle) or
      // its substitution. The stat line is reversed by this action's attribution.
      // `id: -1` matches nothing — a pure stat-reversal carrier (Edit uses it).
      return Number(a.payload?.v) >= 2 ? removeV2(s, Number(a.payload?.id)) : removeLegacy(s, Number(a.payload?.id));
    case 'NEXT_HALF':
      // 1→2 (regulation) and 3→4 (extra time).
      return s.half === 1 ? { ...s, half: 2, startedAt: undefined } : s.half === 3 ? { ...s, half: 4, startedAt: undefined } : s;
    case 'START_EXTRA_TIME':
      // Level after regulation → two extra-time halves.
      return s.home === s.away && s.half === 2 && !s.ended && s.decider === 'extra_time' ? { ...s, half: 3, startedAt: undefined } : s;
    case 'START_GOLDEN_RAID':
      // Level after regulation or extra time → sudden-death Golden Raid.
      return s.home === s.away && !s.ended ? { ...s, goldenRaid: true, startedAt: undefined } : s;
    case 'START_SHOOTOUT':
      // Level after regulation/extra time → a 5-raid shootout (PKL tie-breaker).
      return s.home === s.away && !s.ended && !s.shootout ? { ...s, shootout: { home: [], away: [] }, startedAt: undefined } : s;
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
      return { ...s, ended: true, startedAt: undefined };
    default:
      return s;
  }
};

/** Score change from replacing the raid list (the incremental rule the reducer
 *  has always used, so legacy score offsets are preserved). */
function rescore(s: KabaddiState, raids: RaidEntry[]): Pick<KabaddiState, 'home' | 'away' | 'out' | 'emptyRaids'> {
  const cfg = kabaddiCfg(s);
  const before = replayRaids(raidsOf(s), cfg);
  const after = replayRaids(raids, cfg);
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
  else if (ev.kind === 'sub' && ev.playerName) next = { ...next, subsUsed: { ...next.subsUsed, [ev.side]: Math.max(0, next.subsUsed[ev.side] - 1) }, subbedOff: { ...next.subbedOff, [ev.side]: next.subbedOff[ev.side].filter((n) => n !== ev.playerName) } };
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
    .filter((e) => e.side === side && e.half === half && !isShootoutEvent(e) && (e.kind === 'raid' || e.kind === 'tackle' || e.kind === 'allout'))
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
