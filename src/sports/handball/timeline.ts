/** SD-102 — handball events as timeline rows (the shared LiveTimeline) and the
 *  scorer's correction list. PURE. */
import type { LiveEvent } from '../liveEvents';
import { clockText, periodName, SHOT_LABEL, type HandballEvent, type HandballState } from './engine.ts';

const CARD_ICON = { yellow: '🟨', twoMin: '⏱', red: '🟥' } as const;
const MISS_LABEL = { saved: 'saved', missed: 'missed', blocked: 'blocked' } as const;

/** One row's icon + words ("🤾 Goal · 9 m · Asha Rao · assist Meera"). `answer`
 *  = the keeper / blocker / stealer linked to an attempt or turnover. */
export function describeEvent(e: HandballEvent, answer?: string): { icon: string; label: string; detail?: string } {
  const type = SHOT_LABEL[e.shotType ?? 'nineM'];
  switch (e.type) {
    case 'goal':
      return { icon: '🤾', label: `Goal · ${type}`, detail: [e.playerName ?? 'Team goal', e.secondName ? `assist ${e.secondName}` : ''].filter(Boolean).join(' · ') };
    case 'miss': {
      const r = e.result ?? 'missed';
      return { icon: r === 'saved' ? '🧤' : r === 'blocked' ? '🛡' : '↗', label: `${type} ${MISS_LABEL[r]}`, detail: [e.playerName, answer ? `${r === 'saved' ? 'save' : 'block'} ${answer}` : ''].filter(Boolean).join(' · ') || undefined };
    }
    case 'save':
      return { icon: '🧤', label: e.shotType === 'sevenM' ? '7 m save' : 'Save', detail: e.playerName };
    case 'block':
      return { icon: '🛡', label: 'Block', detail: e.playerName };
    case 'turnover':
      return { icon: '⚠️', label: 'Technical fault', detail: [e.playerName, answer ? `steal ${answer}` : ''].filter(Boolean).join(' · ') || undefined };
    case 'steal':
      return { icon: '🖐', label: 'Steal', detail: e.playerName };
    case 'card': {
      const c = e.card ?? 'twoMin';
      const label = c === 'yellow' ? 'Warning (yellow)'
        : c === 'twoMin' ? (e.third ? '2-minute suspension (3rd) — disqualified' : '2-minute suspension')
        : e.blue ? 'Disqualification + report (blue)' : 'Disqualification (red)';
      return { icon: e.third ? '🟥' : CARD_ICON[c], label, detail: e.official ? `${e.official} (official)` : e.playerName };
    }
    case 'timeout':
      return { icon: '⏸', label: 'Team time-out' };
    case 'sub':
      return { icon: '🔁', label: 'Substitution', detail: e.playerId || e.playerName ? `${e.secondName ?? '?'} ⬆  ${e.playerName ?? '?'} ⬇` : `${e.secondName ?? '?'} ⬆` };
    case 'gk':
      return { icon: '🧤', label: 'Goalkeeper', detail: e.playerName };
  }
}

/** The answers (save / block / steal) linked to each attempt / turnover (by its id). */
export const linkedAnswers = (s: HandballState): Map<string, HandballEvent[]> => {
  const out = new Map<string, HandballEvent[]>();
  for (const e of s.events) if ((e.type === 'save' || e.type === 'block' || e.type === 'steal') && e.ref) out.set(e.ref, [...(out.get(e.ref) ?? []), e]);
  return out;
};
const isAnswer = (e: HandballEvent) => (e.type === 'save' || e.type === 'block' || e.type === 'steal') && !!e.ref;

/** Rows to list: a save / block / steal linked to a listed row reads on that row. */
export function timelineEvents(s: HandballState): { e: HandballEvent; answer?: string; answers: HandballEvent[] }[] {
  const ids = new Set(s.events.map((e) => e.id));
  const ans = linkedAnswers(s);
  return s.events
    .filter((e) => !(isAnswer(e) && ids.has(e.ref!)))
    .map((e) => ({ e, answer: ans.get(e.id)?.[0]?.playerName, answers: ans.get(e.id) ?? [] }));
}

/** The viewer timeline (LiveTimeline sorts by id: game time). */
export function handballTimeline(s: HandballState): LiveEvent[] {
  return timelineEvents(s).map(({ e, answer }, i) => {
    const d = describeEvent(e, answer);
    const name = e.type === 'sub' ? e.secondName : e.official ? undefined : e.playerName;
    return {
      id: e.sec * 1000 + i,
      stamp: clockText(e.sec),
      icon: d.icon,
      label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      side: e.side,
      kind: e.type,
      ...(name ? { playerName: name } : {}),
      minute: Math.ceil(e.sec / 60),
      half: e.period,
      ...(e.type === 'goal' ? { tone: 'boundary' as const } : e.type === 'card' && (e.card === 'red' || e.third) ? { tone: 'wicket' as const } : {}),
    };
  });
}

/** "H2 · 41:20" — where a row sits, for the correction list. */
export const eventWhen = (s: HandballState, e: HandballEvent): string => `${periodName(s, e.period)} · ${clockText(e.sec)}`;
