/**
 * SD-136 (the SD-53 gap) — volleyball sanctions. PURE (no React Native).
 *
 * FIVB Official Volleyball Rules 2025–2028:
 *   Rule 21 (misconduct) — sanction scale, 21.3:
 *     warning           minor misconduct; no score effect (verify: card use
 *                       for the warning stage differs between editions)
 *     penalty           red card — the opponent wins the rally: a point AND
 *                       the serve (21.3.1)
 *     expulsion         red + yellow jointly — the player leaves for the rest
 *                       of the SET (21.3.2), no other effect
 *     disqualification  red + yellow separately — the player leaves for the
 *                       rest of the MATCH (21.3.3), no other effect
 *   Rule 16 (delays):
 *     delay warning     a team's first delay in the match (16.2.1)
 *     delay penalty     every later delay by that team — a point and the
 *                       serve to the opponent (16.2.2)
 *   15.8: an expelled / disqualified player must be substituted legally (an
 *   exceptional substitution if no legal one is possible).
 *
 * One action, applied through volleyball's reducer (none of this existed
 * before, so every older log replays identically — REVIEW Decision 8):
 *   CONDUCT {side = the OFFENDER, payload {vb: level, reason?, playerId?, playerName?}}
 *     a point-bearing level scores a point for the opponent through the normal
 *     point path (sets / match follow; the rotation treats it as a rally won),
 *     marked `pen` so a timeline correction replays it as a PENALTY_POINT;
 *     the others are `kind: 'conduct'` records that a correction keeps.
 */
import type { LiveEvent } from '../liveEvents';
import type { PenMark } from '../conduct';

type Side = 'home' | 'away';
export const oppSide = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export type VbSanctionLevel = 'warning' | 'penalty' | 'expulsion' | 'disqualification' | 'delayWarning' | 'delayPenalty';
export type VbSanctionTrack = 'misconduct' | 'delay';

export interface VbSanctionDef {
  level: VbSanctionLevel;
  track: VbSanctionTrack;
  label: string;
  icon: string;
  /** what it does to the score / the court */
  effect: 'none' | 'point' | 'set' | 'match';
  rule: string;
}

export const VB_SANCTIONS: VbSanctionDef[] = [
  { level: 'warning', track: 'misconduct', label: 'Warning', icon: '🟨', effect: 'none', rule: 'FIVB 21.1 / 21.3' },
  { level: 'penalty', track: 'misconduct', label: 'Penalty', icon: '🟥', effect: 'point', rule: 'FIVB 21.3.1' },
  { level: 'expulsion', track: 'misconduct', label: 'Expulsion', icon: '🟥🟨', effect: 'set', rule: 'FIVB 21.3.2' },
  { level: 'disqualification', track: 'misconduct', label: 'Disqualification', icon: '🟥|🟨', effect: 'match', rule: 'FIVB 21.3.3' },
  { level: 'delayWarning', track: 'delay', label: 'Delay warning', icon: '⏱️', effect: 'none', rule: 'FIVB 16.2.1' },
  { level: 'delayPenalty', track: 'delay', label: 'Delay penalty', icon: '⏱️🟥', effect: 'point', rule: 'FIVB 16.2.2' },
];
export const sanctionDef = (l: VbSanctionLevel): VbSanctionDef | undefined => VB_SANCTIONS.find((d) => d.level === l);
export const isSanctionLevel = (x: unknown): x is VbSanctionLevel => typeof x === 'string' && VB_SANCTIONS.some((d) => d.level === x);

/** FIVB 21.2 categories (the referee picks the level from these). */
export const VB_MISCONDUCT_REASONS = ['Minor misconduct', 'Rude conduct', 'Offensive conduct', 'Aggression'];

/** What a sanction record carries (`LiveEvent.vs`). */
export interface VbSanction {
  level: VbSanctionLevel;
  by: Side;
  playerId?: string;
  playerName?: string;
  reason?: string;
  /** the set it was given in */
  set: number;
}

/** Every sanction in the log, in order (records + penalty points). */
export function sanctionsOf(events: LiveEvent[]): VbSanction[] {
  const out: VbSanction[] = [];
  for (const e of events ?? []) {
    if (e.vs) out.push(e.vs);
    else if (e.pen && e.kind === 'point') out.push(fromPen(e.pen, e.set ?? 1));
  }
  return out;
}

/** A replayed penalty point's sanction (the `pen` mark is what survives a correction). */
export function fromPen(pen: PenMark, set: number): VbSanction {
  return {
    level: pen.track === 'time' ? 'delayPenalty' : 'penalty', by: pen.by, set,
    ...(pen.playerId ? { playerId: pen.playerId } : {}), ...(pen.playerName ? { playerName: pen.playerName } : {}),
    ...(pen.reason ? { reason: pen.reason } : {}),
  };
}

/** The `pen` mark a penalty point carries (replays as PENALTY_POINT). */
export function toPen(x: Omit<VbSanction, 'set'>): PenMark {
  return {
    level: 'point', by: x.by, ...(x.level === 'delayPenalty' ? { track: 'time' as const } : {}),
    ...(x.playerId ? { playerId: x.playerId } : {}), ...(x.playerName ? { playerName: x.playerName } : {}),
    ...(x.reason ? { reason: x.reason } : {}),
  };
}

/** "Penalty · Rude conduct", "Delay warning" — the timeline label. */
export function sanctionLabel(x: Pick<VbSanction, 'level'>): string {
  const d = sanctionDef(x.level);
  return d?.track === 'delay' ? d.label : `Sanction · ${(d?.label ?? x.level).toLowerCase()}`;
}

/**
 * The suggested next sanction for an offender (never binding — the referee
 * chooses by the offence, FIVB 21.2):
 *   delay      — the team's 1st delay → delay warning, later → delay penalty (16.2)
 *   misconduct — a named player already expelled → disqualification; already
 *                penalised → expulsion; else the team's first → warning,
 *                after a warning → penalty (21.3; verify the escalation for
 *                a repeated offence by the same member).
 */
export function suggestSanction(events: LiveEvent[], by: Side, track: VbSanctionTrack, playerId?: string): VbSanctionLevel {
  const mine = sanctionsOf(events).filter((x) => x.by === by && sanctionDef(x.level)?.track === track);
  if (track === 'delay') return mine.length ? 'delayPenalty' : 'delayWarning';
  if (playerId) {
    const his = mine.filter((x) => x.playerId === playerId);
    if (his.some((x) => x.level === 'expulsion')) return 'disqualification';
    if (his.some((x) => x.level === 'penalty')) return 'expulsion';
  }
  return mine.length ? 'penalty' : 'warning';
}

/** Players who may not play right now: expelled this set, or disqualified. */
export function barredPlayers(events: LiveEvent[], side: Side, set: number): Array<{ id: string; name: string; why: 'expulsion' | 'disqualification' }> {
  const out = new Map<string, { id: string; name: string; why: 'expulsion' | 'disqualification' }>();
  for (const x of sanctionsOf(events)) {
    if (x.by !== side || !x.playerId) continue;
    if (x.level === 'disqualification') out.set(x.playerId, { id: x.playerId, name: x.playerName ?? '', why: 'disqualification' });
    else if (x.level === 'expulsion' && x.set === set && !out.has(x.playerId)) out.set(x.playerId, { id: x.playerId, name: x.playerName ?? '', why: 'expulsion' });
  }
  return [...out.values()];
}

/** What a level does, in words, for the confirm. */
export function sanctionEffect(level: VbSanctionLevel, offender: string, other: string): string {
  switch (sanctionDef(level)?.effect) {
    case 'point': return `${other} win the rally — a point and the serve.`;
    case 'set': return `${offender} must leave the court for the rest of this set and be substituted (FIVB 15.8). No point.`;
    case 'match': return `${offender} must leave for the rest of the match and be substituted (FIVB 15.8). No point.`;
    default: return 'Recorded — no change to the score.';
  }
}
