/**
 * SD-133 — cricket's named Undo, like every other sport (SD-115): "FOUR —
 * Rohit (4.3)", "Wide + 1 (4.5)", "CAUGHT — Rohit (4.6)", "bowler pick".
 * Pure: from the newest logged step (useLiveMatch `lastStep`) — the state just
 * before and after it — using the timeline event the step added (a live Super
 * Over's own timeline included). Null = unknown → the bar says plain "Undo".
 */
import type { CricketState } from './engine.ts';

/** Steps that add no timeline event — named by what they set. */
const QUIET: Record<string, string> = {
  SET_STRIKER: 'striker pick',
  SET_NONSTRIKER: 'non-striker pick',
  SET_BOWLER: 'bowler pick',
  SWAP_STRIKE: 'strike swap',
  SET_TOSS: 'toss',
  SET_CAPTAIN: 'captain pick',
  SET_KEEPER: 'keeper pick',
  SHOT: 'wagon-wheel tag',
  START_SUPER_OVER: 'Super Over start',
  POTM: 'player of the match',
  END: 'match end',
  END_INNINGS: 'innings end',
  EDIT_LOG: 'ball correction',
  AMEND: 'correction',
};
const BALLS = new Set(['RUNS', 'BYES', 'LEGBYES', 'WICKET', 'EXTRA']);

const asState = (x: unknown): CricketState | null =>
  x && typeof x === 'object' && Array.isArray((x as CricketState).events) ? (x as CricketState) : null;
/** The innings being played: a live Super Over's nested state, else the match. */
const live = (s: CricketState): CricketState => (s.superOver && !s.superOver.state.ended ? s.superOver.state : s);

export function cricketUndoLabel(step: { type: string; prev: unknown; next: unknown } | null | undefined): string | null {
  if (!step) return null;
  const prev = asState(step.prev);
  const next = asState(step.next);
  if (!prev || !next) return QUIET[step.type] ?? null;
  // The timeline that grew: the match's, or the Super Over's (which may have
  // just ended inside this step — compare the nested states directly).
  const pairs: [CricketState, CricketState][] = [[prev, next]];
  if (next.superOver) {
    const pIn = prev.superOver && prev.superOver.round === next.superOver.round ? prev.superOver.state : null;
    if (pIn) pairs.unshift([pIn, next.superOver.state]);
  }
  const grown = pairs.find(([a, b]) => b.events.length > a.events.length);
  if (!grown) return QUIET[step.type] ?? null;
  const [a, b] = grown;
  const e = b.events[a.events.length];
  const what = typeof e?.label === 'string' ? e.label.trim() : '';
  if (!what) return QUIET[step.type] ?? null;
  const stamp = e.stamp && e.stamp !== '☔' ? ` (${e.stamp})` : '';
  const bad = (t: string) => /\bundefined\b|\bnull\b|\bNaN\b/.test(t);
  let out: string;
  if (BALLS.has(step.type)) {
    const before = live(a);
    // A wicket names who was out; a ball off the bat names the striker; extras just the ball.
    let who: string | undefined;
    if (b.dismissals.length > a.dismissals.length) {
      const d = b.dismissals[b.dismissals.length - 1];
      who = d.outId ? b.batting[d.outId]?.name : undefined;
    } else if (step.type === 'RUNS') who = before.strikerName;
    else if (step.type === 'WICKET') {
      // retired hurt / not out: not a dismissal record — the batter whose card changed
      const id = Object.keys(b.batting).find((k) => b.batting[k].retired && !a.batting[k]?.retired);
      who = id ? b.batting[id].name : undefined;
    }
    out = `${what}${who ? ` — ${who}` : ''}${stamp}`;
  } else {
    out = `${what}${stamp}`;
  }
  return bad(out) ? null : out;
}
