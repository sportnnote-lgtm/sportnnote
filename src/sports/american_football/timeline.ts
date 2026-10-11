/** SD-147 — American football events as timeline rows (the shared
 *  LiveTimeline), the scorer's correction list and the named Undo. PURE. */
import type { LiveEvent } from '../liveEvents';
import { clockAt, eventWhen, periodName, pointsOf, spotText, type AFEvent, type AFState, type Side } from './engine.ts';

const HOW: Record<string, string> = { run: 'run', pass: 'pass', int: 'interception return', fumble: 'fumble return', punt: 'punt return', kick: 'kickoff return', other: '' };
const PLAY: Record<string, string> = {
  run: 'Run', pass: 'Pass complete', inc: 'Pass incomplete', sack: 'Sack', int: 'Interception', fumble: 'Fumble lost', punt: 'Punt',
  kickoff: 'Kickoff', penalty: 'Penalty', downs: 'Turnover on downs', kneel: 'Kneel',
};

/** One row's icon + words ("🏈 Touchdown · Asha Rao · 12-yd pass from Ravi"). */
export function describeEvent(e: AFEvent, s?: Pick<AFState, 'field' | 'variant'>): { icon: string; label: string; detail?: string } {
  const yds = (n?: number) => (n != null ? `${n} yd${Math.abs(n) === 1 ? '' : 's'}` : '');
  switch (e.type) {
    case 'td': {
      const how = e.how === 'pass' ? `${e.yards != null ? `${e.yards}-yd ` : ''}pass${e.secondName ? ` from ${e.secondName}` : ''}`
        : e.how === 'run' ? (e.yards != null ? `${e.yards}-yd run` : 'run') : `${e.yards != null ? `${e.yards}-yd ` : ''}${HOW[e.how ?? 'other']}`;
      return { icon: '🏈', label: 'Touchdown', detail: [e.playerName ?? 'Team', how].filter(Boolean).join(' · ') };
    }
    case 'try': {
      if (e.none) return { icon: '–', label: 'No try' };
      const what = e.kind === 'kick' ? 'Extra point' : e.kind === 'two' ? '2-point conversion' : '1-point conversion';
      return { icon: e.good ? '✅' : '✗', label: `${what} ${e.good ? 'good' : e.kind === 'kick' ? 'no good' : 'failed'}`, detail: e.playerName };
    }
    case 'defTry':
      return { icon: '↩', label: 'Defensive conversion return (2)', detail: e.playerName };
    case 'fg':
      return { icon: e.good ? '🥅' : '✗', label: `Field goal ${e.good ? 'good' : 'no good'}${e.yards ? ` · ${e.yards} yds` : ''}`, detail: e.playerName };
    case 'safety':
      return { icon: '🛡️', label: 'Safety (2)', detail: e.playerName };
    case 'timeout':
      return { icon: '⏸', label: 'Timeout' };
    case 'tackle':
      return { icon: '🤚', label: 'Tackle', detail: e.playerName };
    case 'eject':
      return { icon: '🚫', label: 'Ejected', detail: e.playerName };
    case 'possEnd':
      return { icon: '⛔', label: 'Possession over · no score' };
    case 'play': {
      const p = e.play ?? 'run';
      const at = e.pre && s ? ` (${e.pre.down}${['st', 'nd', 'rd', 'th'][Math.min(3, e.pre.down - 1)]} & ${e.pre.toGo} at ${spotText(s, e.pre.spot)})` : '';
      let detail: string | undefined;
      if (p === 'run' || p === 'kneel') detail = [e.playerName, yds(e.yards)].filter(Boolean).join(' · ');
      else if (p === 'pass') detail = [`${e.playerName ?? '?'} → ${e.secondName ?? '?'}`, yds(e.yards)].join(' · ');
      else if (p === 'inc') detail = e.playerName;
      else if (p === 'sack') detail = [e.secondName, yds(e.yards)].filter(Boolean).join(' · ');
      else if (p === 'int') detail = [e.secondName && `by ${e.secondName}`, e.playerName && `thrown by ${e.playerName}`].filter(Boolean).join(' · ');
      else if (p === 'fumble') detail = [e.playerName, e.secondName && `recovered by ${e.secondName}`].filter(Boolean).join(' · ');
      else if (p === 'punt') detail = [e.playerName, yds(e.yards)].filter(Boolean).join(' · ');
      else if (p === 'penalty') detail = [e.foul, yds(Math.abs(e.yards ?? 0)), e.autoFirst ? 'automatic first down' : '', e.lossOfDown ? 'loss of down' : ''].filter(Boolean).join(' · ');
      return { icon: p === 'penalty' ? '🚩' : p === 'int' || p === 'fumble' ? '🔄' : '▸', label: `${PLAY[p]}${e.first ? ' · 1st down' : ''}`, detail: [detail, at.trim()].filter(Boolean).join(' ') || undefined };
    }
  }
}

/** The viewer timeline: scores, misses, timeouts, turnovers and penalties
 *  (ordinary gains stay in the play-by-play list, not here). */
export function afTimeline(s: AFState): LiveEvent[] {
  const shown = (e: AFEvent) => e.type !== 'tackle' && e.type !== 'possEnd' && !(e.type === 'play' && !['int', 'fumble', 'downs', 'penalty'].includes(e.play ?? ''));
  return s.events.map((e, i) => ({ e, i })).filter(({ e }) => shown(e)).map(({ e, i }) => {
    const d = describeEvent(e, s);
    const name = e.type === 'play' && (e.play === 'int' || e.play === 'fumble') ? e.secondName : e.playerName;
    return {
      id: e.period * 1e8 + e.psec * 1000 + i,
      stamp: eventWhen(s, e),
      icon: d.icon,
      label: d.label,
      ...(d.detail ? { detail: d.detail } : {}),
      side: e.type === 'play' && e.play === 'penalty' && e.on ? e.on : e.side,
      kind: e.type,
      ...(name ? { playerName: name } : {}),
      minute: Math.ceil(e.sec / 60),
      half: e.period,
      ...(e.type === 'td' ? { tone: 'boundary' as const } : e.type === 'safety' || (e.type === 'play' && (e.play === 'int' || e.play === 'fumble')) ? { tone: 'wicket' as const } : {}),
    };
  });
}

/** The play-by-play list (newest first) for the live page. */
export function afPlays(s: AFState, limit = 30): { id: string; when: string; side: Side; text: string }[] {
  return [...s.events].reverse().filter((e) => e.type !== 'tackle').slice(0, limit).map((e) => {
    const d = describeEvent(e, s);
    return { id: e.id, when: eventWhen(s, e), side: e.side, text: `${d.icon} ${d.label}${d.detail ? ` · ${d.detail}` : ''}` };
  });
}

export const whenText = (s: AFState, e: AFEvent): string => `${periodName(s, e.period)}${clockAt(s, e.period, e.psec) ? ` · ${clockAt(s, e.period, e.psec)}` : ''}`;

/** SD-115 — what Undo removes: "Touchdown · Asha Rao (13-7)", "Field goal good · 32 yds". */
export function afUndoLabel(step: { type: string; prev: unknown; next: unknown } | null | undefined): string | null {
  if (!step) return null;
  const prev = step.prev as AFState | null;
  const next = step.next as AFState | null;
  if (step.type === 'CLOCK') return 'clock start / stop';
  if (step.type === 'SET_CLOCK') return 'clock set';
  if (step.type === 'TWO_MIN') return 'two-minute warning';
  if (step.type === 'END_PERIOD') return 'end of the period';
  if (step.type === 'XI') return 'line-up';
  if (step.type === 'SET_DRIVE') return 'ball placement';
  if (step.type === 'OT_FIRST') return 'overtime coin toss';
  if (!prev?.events || !next?.events || next.events.length <= prev.events.length) return null;
  const e = next.events[next.events.length - 1];
  const d = describeEvent(e);
  const who = e.type === 'play' ? undefined : e.playerName;
  const head = who ? `${d.label} · ${who}` : e.type === 'play' && d.detail ? `${d.label} · ${d.detail.split(' (')[0]}` : d.label;
  return pointsOf(e) ? `${head} (${next.home}-${next.away})` : head;
}
