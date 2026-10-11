/** SD-143 — rugby events as timeline rows (the shared LiveTimeline), the
 *  scorer's correction list and the named Undo. PURE. */
import type { LiveEvent } from '../liveEvents';
import { shootoutOrderRows } from '../shootoutOrder.ts';
import { minuteText, periodName, clockAt, pointsOf, DETAIL_LABEL, KICK_LABEL, type RugbyEvent, type RugbyState } from './engine.ts';

/** One row's icon + words ("🏉 Try · Asha Rao · assist Meera"). */
export function describeEvent(e: RugbyEvent): { icon: string; label: string; detail?: string } {
  switch (e.type) {
    case 'try':
      return { icon: '🏉', label: 'Try', detail: [e.playerName ?? 'Team try', e.secondName ? `assist ${e.secondName}` : ''].filter(Boolean).join(' · ') };
    case 'pentry':
      return { icon: '🏉', label: 'Penalty try (7)' };
    case 'kick': {
      const k = KICK_LABEL[e.kick ?? 'pen'];
      return { icon: e.made ? '🎯' : '↗', label: e.kick === 'conv' ? `Conversion ${e.made ? 'good' : 'missed'}` : `${k} ${e.made ? 'good' : 'missed'}`, detail: e.playerName };
    }
    case 'card': {
      const label = e.card === 'yellow' ? 'Yellow card (sin-bin)'
        : e.second ? `Red card (2nd yellow)${e.red20 ? ' · 20 min' : ''}`
        : e.red20 ? 'Red card · 20 minutes' : 'Red card';
      return { icon: e.card === 'yellow' ? '🟨' : '🟥', label, detail: e.official ? `${e.official} (official)` : e.playerName };
    }
    case 'sub': {
      const what = e.temp === 'hia' ? 'HIA replacement' : e.temp === 'blood' ? 'Blood replacement' : e.back ? 'Back on' : 'Replacement';
      return { icon: '🔁', label: what, detail: e.playerId || e.playerName ? `${e.secondName ?? '?'} ⬆  ${e.playerName ?? '?'} ⬇` : `${e.secondName ?? '?'} ⬆` };
    }
    case 'detail':
      return { icon: '📋', label: DETAIL_LABEL[e.detail ?? 'tackle'], detail: e.playerName };
    case 'setpiece':
      return { icon: e.piece === 'scrum' ? '🤼' : '🙌', label: `${e.piece === 'scrum' ? 'Scrum' : 'Lineout'} ${e.won ? 'won' : 'lost'} (own ${e.piece === 'scrum' ? 'feed' : 'throw'})` };
  }
}

/** The viewer timeline (LiveTimeline sorts by id: period, then playing time).
 *  Detail and set-piece rows stay off it (they'd drown the scores). */
export function rugbyTimeline(s: RugbyState, names?: { home?: string; away?: string }): LiveEvent[] {
  return [...s.events.map((e, i) => ({ e, i })).filter(({ e }) => e.type !== 'detail' && e.type !== 'setpiece').map(({ e, i }) => {
    const d = describeEvent(e);
    const name = e.type === 'sub' ? e.secondName : e.official ? undefined : e.playerName;
    return {
      id: e.period * 1e8 + e.psec * 1000 + i,
      stamp: minuteText(s, e.period, e.psec),
      icon: d.icon,
      label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      side: e.side,
      kind: e.type,
      ...(name ? { playerName: name } : {}),
      minute: Math.ceil(e.sec / 60),
      half: e.period,
      ...(e.type === 'try' || e.type === 'pentry' ? { tone: 'boundary' as const } : e.type === 'card' && e.card === 'red' ? { tone: 'wicket' as const } : {}),
    };
  }), ...shootoutOrderRows(s.shootout, names, { what: 'Kicking competition', verb: 'kick' })];
}

/** "H2 · 63:20" — where a row sits, for the correction list. */
export const eventWhen = (s: RugbyState, e: RugbyEvent): string => `${periodName(s, e.period)} · ${clockAt(s, e.period, e.psec)}`;

/** SD-115 — what Undo removes: "Try · Asha Rao (12-7)", "Conversion good · Meera". */
export function rugbyUndoLabel(step: { type: string; prev: unknown; next: unknown } | null | undefined): string | null {
  if (!step) return null;
  const prev = step.prev as RugbyState | null;
  const next = step.next as RugbyState | null;
  if (step.type === 'CLOCK') return 'clock start / stop';
  if (step.type === 'SET_CLOCK') return 'clock set';
  if (step.type === 'END_PERIOD') return 'end of the period';
  if (step.type === 'XI') return 'line-up';
  if (step.type === 'SO_ORDER' || step.type === 'START_SHOOTOUT') return 'kicking order pick';
  if (step.type === 'SO') return 'kicking competition kick';
  if (!prev?.events || !next?.events || next.events.length <= prev.events.length) return null;
  const e = next.events[next.events.length - 1];
  const d = describeEvent(e);
  const who = e.type === 'sub' ? e.secondName : e.playerName;
  const head = who ? `${d.label} · ${who}` : d.label;
  return pointsOf(e) ? `${head} (${next.home}-${next.away})` : head;
}
