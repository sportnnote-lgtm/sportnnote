/** SD-101 — hockey events as timeline rows (the shared LiveTimeline) and the
 *  scorer's correction list. PURE. */
import type { LiveEvent } from '../liveEvents';
import { minuteText, periodName, type HockeyEvent, type HockeyState } from './engine.ts';

export const GOAL_LABEL = { field: 'Field goal', pc: 'Penalty-corner goal', stroke: 'Penalty-stroke goal' } as const;
const CARD_ICON = { green: '🟩', yellow: '🟨', red: '🟥' } as const;

/** One row's icon + words ("🏑 Field goal · Asha Rao · assist Meera"). `saver`
 *  = the keeper of the save linked to a shot / stroke. */
export function describeEvent(e: HockeyEvent, saver?: string): { icon: string; label: string; detail?: string } {
  switch (e.type) {
    case 'goal':
      return { icon: '🏑', label: GOAL_LABEL[e.goalType ?? 'field'], detail: [e.playerName ?? 'Team goal', e.secondName ? `assist ${e.secondName}` : ''].filter(Boolean).join(' · ') };
    case 'pc':
      return { icon: '🚩', label: 'Penalty corner' };
    case 'stroke':
      return { icon: '⚪', label: e.outcome === 'saved' ? 'Penalty stroke saved' : 'Penalty stroke missed', detail: [e.playerName, saver ? `save ${saver}` : ''].filter(Boolean).join(' · ') || undefined };
    case 'shot':
      return { icon: '🎯', label: e.onGoal ? 'Shot on goal — saved' : 'Shot off target', detail: [e.playerName, saver ? `save ${saver}` : ''].filter(Boolean).join(' · ') || undefined };
    case 'save':
      return { icon: '🧤', label: 'Save', detail: e.playerName };
    case 'card': {
      const c = e.card ?? 'green';
      const word = c[0].toUpperCase() + c.slice(1);
      return { icon: CARD_ICON[c], label: `${word} card${e.minutes ? ` (${e.minutes} min)` : ''}`, detail: e.playerName };
    }
    case 'sub':
      return { icon: '🔁', label: 'Substitution', detail: `${e.secondName ?? '?'} ⬆  ${e.playerName ?? '?'} ⬇` };
    case 'gk':
      return { icon: '🧤', label: 'Goalkeeper', detail: e.playerName };
  }
}

/** The saves linked to each shot / stroke (by its id). */
export const linkedSaves = (s: HockeyState): Map<string, HockeyEvent[]> => {
  const out = new Map<string, HockeyEvent[]>();
  for (const e of s.events) if (e.type === 'save' && e.ref) out.set(e.ref, [...(out.get(e.ref) ?? []), e]);
  return out;
};
/** Rows to list: a save linked to a listed shot / stroke reads on that row. */
export function timelineEvents(s: HockeyState): { e: HockeyEvent; saver?: string; saves: HockeyEvent[] }[] {
  const ids = new Set(s.events.map((e) => e.id));
  const saves = linkedSaves(s);
  return s.events
    .filter((e) => !(e.type === 'save' && e.ref && ids.has(e.ref)))
    .map((e) => ({ e, saver: saves.get(e.id)?.[0]?.playerName, saves: saves.get(e.id) ?? [] }));
}

/** The viewer timeline: newest first by game time (LiveTimeline sorts by id). */
export function hockeyTimeline(s: HockeyState): LiveEvent[] {
  return timelineEvents(s).map(({ e, saver }, i) => {
    const d = describeEvent(e, saver);
    const name = e.type === 'sub' ? e.secondName : e.playerName;
    return {
      id: e.sec * 1000 + i,
      stamp: minuteText(e.sec),
      icon: d.icon,
      label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      side: e.side,
      kind: e.type,
      ...(name ? { playerName: name } : {}),
      minute: Math.ceil(e.sec / 60),
      half: e.period,
      ...(e.type === 'goal' ? { tone: 'boundary' as const } : e.type === 'card' && e.card === 'red' ? { tone: 'wicket' as const } : {}),
    };
  });
}

/** "Q2 · 23'" — where a row sits, for the correction list. */
export const eventWhen = (s: HockeyState, e: HockeyEvent): string => `${periodName(s, e.period)} · ${minuteText(e.sec)}`;
