/** SD-146 — netball events as timeline rows (the shared LiveTimeline) and the
 *  scorer's correction list. PURE. */
import type { LiveEvent } from '../liveEvents';
import { clockText, periodName, secInPeriod, type NetballEvent, type NetballState } from './engine.ts';

const STAT_LABEL = { intercept: 'Intercept', deflection: 'Deflection', rebound: 'Rebound', turnover: 'Turnover' } as const;
const STAT_ICON = { intercept: '🖐', deflection: '☝️', rebound: '⤴️', turnover: '⚠️' } as const;
const PEN_LABEL = { contact: 'Contact', obstruction: 'Obstruction', other: 'Penalty' } as const;
const STOP_LABEL = { injury: 'Time held — injury / illness', blood: 'Time held — blood', tactical: 'Time held — tactical change', other: 'Time held' } as const;

/** One row's icon + words ("🥅 Goal · GS · Asha Rao · feed Meera"). `answer` =
 *  the rebounder linked to a missed attempt. */
export function describeEvent(e: NetballEvent, answer?: string): { icon: string; label: string; detail?: string } {
  switch (e.type) {
    case 'goal':
      return { icon: '🥅', label: `Goal${e.pos ? ` · ${e.pos}` : ''}`, detail: [e.playerName ?? (e.pos ? undefined : 'Team goal'), e.secondName ? `feed ${e.secondName}` : ''].filter(Boolean).join(' · ') || undefined };
    case 'miss':
      return { icon: '↗', label: `Missed shot${e.pos ? ` · ${e.pos}` : ''}`, detail: [e.playerName, e.secondName ? `feed ${e.secondName}` : '', answer ? `rebound ${answer}` : ''].filter(Boolean).join(' · ') || undefined };
    case 'stat':
      return { icon: STAT_ICON[e.stat ?? 'intercept'], label: STAT_LABEL[e.stat ?? 'intercept'], detail: e.playerName };
    case 'penalty':
      return { icon: '✋', label: `Penalty · ${PEN_LABEL[e.penalty ?? 'other']}`, detail: e.playerName };
    case 'sanction': {
      const label = e.sanction === 'warning' ? 'Warning' : e.sanction === 'off' ? 'Ordered off' : `Suspended (${e.minutes ?? 2} min)`;
      return { icon: e.sanction === 'warning' ? '🟨' : e.sanction === 'off' ? '🟥' : '⏱', label, detail: e.official ? `${e.official} (official)` : e.playerName };
    }
    case 'timeout':
      return { icon: '⏸', label: 'Team time-out' };
    case 'stop':
      return { icon: '⏸', label: STOP_LABEL[e.reason ?? 'other'], detail: e.playerName };
    case 'sub':
      return { icon: '🔁', label: `Substitution${e.pos ? ` · ${e.pos}` : ''}`, detail: e.playerId || e.playerName ? `${e.secondName ?? '?'} ⬆  ${e.playerName ?? '?'} ⬇` : `${e.secondName ?? '?'} ⬆` };
    case 'pos':
      return { icon: '⇄', label: `Position change · ${e.pos}`, detail: e.playerName };
    case 'centre':
      return { icon: '⚪', label: 'Centre pass order set', detail: 'by the scorer' };
  }
}

const isAnswer = (e: NetballEvent) => e.type === 'stat' && e.stat === 'rebound' && !!e.ref;

/** Rows to list: a rebound linked to a listed miss reads on that row. */
export function timelineEvents(s: NetballState): { e: NetballEvent; answer?: string; answers: NetballEvent[] }[] {
  const ids = new Set(s.events.map((e) => e.id));
  const ans = new Map<string, NetballEvent[]>();
  for (const e of s.events) if (isAnswer(e)) ans.set(e.ref!, [...(ans.get(e.ref!) ?? []), e]);
  return s.events
    .filter((e) => !(isAnswer(e) && ids.has(e.ref!)))
    .map((e) => ({ e, answer: ans.get(e.id)?.[0]?.playerName, answers: ans.get(e.id) ?? [] }));
}

/** "Q2 07:32" — the period and the time into it. */
export const eventWhen = (s: NetballState, e: NetballEvent): string => `${periodName(s, e.period)} ${clockText(secInPeriod(s, e))}`;

/** The viewer timeline (LiveTimeline sorts by id: game time). */
export function netballTimeline(s: NetballState, names?: { home?: string; away?: string }): LiveEvent[] {
  const rows: LiveEvent[] = timelineEvents(s).map(({ e, answer }, i) => {
    const d = describeEvent(e, answer);
    const name = e.type === 'sub' ? e.secondName : e.official ? undefined : e.playerName;
    return {
      id: e.sec * 1000 + i,
      stamp: eventWhen(s, e),
      icon: d.icon,
      label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      ...(e.side ? { side: e.side } : {}),
      kind: e.type,
      ...(name ? { playerName: name } : {}),
      minute: Math.ceil(e.sec / 60),
      half: e.period,
      ...(e.type === 'goal' ? { tone: 'boundary' as const } : e.type === 'sanction' && e.sanction !== 'warning' ? { tone: 'wicket' as const } : {}),
    };
  });
  if (s.firstCentre) {
    rows.unshift({ id: -1, stamp: 'Toss', icon: '🪙', label: `First centre pass — ${names?.[s.firstCentre] || (s.firstCentre === 'home' ? 'Home' : 'Away')}`, detail: 'Picked by the scorer', side: s.firstCentre, kind: 'toss' });
  }
  return rows;
}
