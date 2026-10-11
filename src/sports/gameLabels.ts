/**
 * SD-75 — padel point-log labels with team names: a won game reads
 * "Hold · Lions" (the server's side won it) or "Break · Tigers" (the
 * receivers won it); sets and the match name their winner too. DISPLAY ONLY —
 * the events in the log keep their stored labels ("Game home"), so replay,
 * fingerprints and corrections are untouched (Decision 8).
 *
 * Who served a game is derived like serve.ts: the side serving game index G
 * (0-based, every game of the match so far, a set tiebreak counting as one) is
 * the first server when G is even. Uses the match's CURRENT first server, so a
 * "Fix who served first" relabels the log too. PURE.
 */
import type { LiveEvent } from './liveEvents';

type Side = 'home' | 'away';
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

export function setSportGameLabels(
  events: LiveEvent[],
  st: { firstServer?: Side; sets?: Array<[number, number]> },
  names: { home: string; away: string },
): LiveEvent[] {
  if (!events?.length) return events;
  const first: Side = st.firstServer === 'away' ? 'away' : 'home';
  const sets = st.sets ?? [];
  let setIdx = 0;
  let before = 0; // games played in completed sets
  let changed = false;
  const out = events.map((e) => {
    const side = e.side === 'home' || e.side === 'away' ? e.side : undefined;
    if (e.stamp === 'Set' && /^Set \d+ won$/.test(e.label)) {
      const done = sets[setIdx];
      if (done) before += done[0] + done[1];
      setIdx += 1;
      if (!side) return e;
      changed = true;
      return { ...e, label: `${e.label} · ${names[side]}` };
    }
    if (e.stamp === 'Match' && e.label === 'Match won' && side) {
      changed = true;
      return { ...e, label: `Match won · ${names[side]}` };
    }
    if (e.stamp !== 'Game' || !side || !/^Game (home|away)$/.test(e.label)) return e;
    const m = /^(\d+)-(\d+)$/.exec(String(e.detail ?? ''));
    if (!m) return e;
    const g = before + Number(m[1]) + Number(m[2]) - 1; // this game's 0-based index
    const server: Side = g % 2 === 0 ? first : other(first);
    changed = true;
    return { ...e, icon: server === side ? '✅' : '💥', label: `${server === side ? 'Hold' : 'Break'} · ${names[side]}` };
  });
  return changed ? out : events;
}
