/** SD-145 — ice hockey events as timeline rows (the shared LiveTimeline) and
 *  the scorer's correction list. PURE. */
import type { LiveEvent } from '../liveEvents';
import { shootoutOrderRows } from '../shootoutOrder.ts';
import { eventWhen, mmss, periodOffset, PEN_LABEL, STRENGTH_LABEL, type IceEvent, type IceHockeyState } from './engine.ts';

const PEN_ICON = { minor: '⏱', bench: '⏱', double: '⏱', major: '🟥', majorGm: '🟥', misconduct: '🕙', gm: '🚫', match: '🚫' } as const;

/** "PP" / "SH" / "EN" / "PS" tags of a goal. */
export function goalTags(e: Pick<IceEvent, 'strength' | 'en' | 'ps'>): string[] {
  return [
    ...(e.ps ? ['PS'] : e.strength === 'pp' ? ['PP'] : e.strength === 'sh' ? ['SH'] : []),
    ...(e.en ? ['EN'] : []),
  ];
}

/** One row's icon + words ("🚨 Goal (PP) · Asha Rao · assists Meera, Kiran"). */
export function describeEvent(e: IceEvent): { icon: string; label: string; detail?: string } {
  switch (e.type) {
    case 'goal': {
      const tags = goalTags(e);
      const assists = [e.secondName, e.thirdName].filter(Boolean);
      return {
        icon: '🚨', label: `Goal${tags.length ? ` (${tags.join(', ')})` : ''}`,
        detail: [e.playerName ?? 'Team goal', assists.length ? `assist${assists.length > 1 ? 's' : ''} ${assists.join(', ')}` : e.ps ? 'penalty shot' : 'unassisted'].join(' · '),
      };
    }
    case 'shot':
      return { icon: '🥅', label: e.ps ? 'Penalty shot saved' : 'Shot on goal', detail: [e.playerName, e.gkName ? `save ${e.gkName}` : ''].filter(Boolean).join(' · ') || undefined };
    case 'miss':
      return { icon: '↗', label: 'Penalty shot missed', detail: e.playerName };
    case 'pen': {
      const k = e.pen ?? 'minor';
      return { icon: PEN_ICON[k], label: `${PEN_LABEL[k]}${e.infraction ? ` · ${e.infraction.toLowerCase()}` : ''}`, detail: e.playerName ?? (k === 'bench' ? 'Bench' : undefined) };
    }
    case 'gk':
      return { icon: '🧤', label: 'Goalie in', detail: e.playerName };
    case 'pull':
      return { icon: '🥅', label: 'Goalie pulled (empty net)' };
    case 'back':
      return { icon: '🧤', label: 'Goalie back in net' };
    case 'timeout':
      return { icon: '⏸', label: 'Team time-out' };
  }
}

/** The viewer timeline (LiveTimeline sorts by id: game time). Shots are left
 *  out (there are dozens) — they're in the box score and the comparison. */
export function iceHockeyTimeline(s: IceHockeyState, names?: { home?: string; away?: string }): LiveEvent[] {
  return [...s.events.filter((e) => e.type !== 'shot').map((e, i) => {
    const d = describeEvent(e);
    return {
      id: e.sec * 1000 + i,
      stamp: eventWhen(s, e),
      icon: d.icon,
      label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      side: e.side,
      kind: e.type,
      ...(e.playerName && e.type !== 'pull' && e.type !== 'back' ? { playerName: e.playerName } : {}),
      ...(e.playerId ? { playerId: e.playerId } : {}),
      minute: Math.ceil(e.sec / 60),
      half: e.period,
      ...(e.type === 'goal' ? { tone: 'boundary' as const } : e.type === 'pen' && (e.pen === 'gm' || e.pen === 'match' || e.pen === 'majorGm') ? { tone: 'wicket' as const } : {}),
    };
  }), ...shootoutOrderRows(s.shootout, names, { what: 'Shoot-out', verb: 'shoot' })];
}

/** The correction list's rows, newest first (shots included). */
export function correctionRows(s: IceHockeyState): IceEvent[] {
  return [...s.events].reverse();
}

/** "P2 12:34 · Power play" — a goal's line in the summary. */
export const goalLine = (s: IceHockeyState, e: IceEvent): string =>
  `${eventWhen(s, e)}${e.strength && e.strength !== 'ev' ? ` · ${STRENGTH_LABEL[e.strength]}` : ''}`;

export const elapsedInPeriod = (s: IceHockeyState, e: Pick<IceEvent, 'sec' | 'period'>): string => mmss(e.sec - periodOffset(s, e.period));
