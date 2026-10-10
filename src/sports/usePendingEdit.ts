/**
 * SD-114 — "✎ Edit" on a timeline row must not lose the event when the scorer
 * cancels the re-entry. Edit used to dispatch the removal first and then open
 * the normal capture flow; Cancel left the event deleted.
 *
 * Now the removal is HELD: `begin(actions)` keeps the removal actions locally,
 * and the controls render from `view` — the state as if they had been applied
 * (the engine reducer is pure, so this is exact) — so every picker behaves as it
 * did before (a re-entered yellow isn't a "second" yellow, a removed red's
 * player is back in the XI…). The first real action the re-entry dispatches
 * through `dispatch` sends the held removal first, then the action — the log is
 * byte-for-byte what the old flow logged. `cancel()` drops it: nothing was sent.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ScoreAction } from './types';

export function usePendingEdit<S>(state: S, rawDispatch: (a: ScoreAction) => void, reducer: (s: S, a: ScoreAction) => S) {
  const [held, setHeld] = useState<ScoreAction[] | null>(null);
  const ref = useRef<ScoreAction[] | null>(null);
  const view = useMemo(() => (held ? held.reduce(reducer, state) : state), [held, state, reducer]);
  const dispatch = useCallback((a: ScoreAction) => {
    const h = ref.current;
    if (h) { ref.current = null; setHeld(null); for (const x of h) rawDispatch(x); }
    rawDispatch(a);
  }, [rawDispatch]);
  const begin = useCallback((actions: ScoreAction[]) => { ref.current = actions; setHeld(actions); }, []);
  const cancel = useCallback(() => { if (ref.current) { ref.current = null; setHeld(null); } }, []);
  return { view, dispatch, begin, cancel, holding: held != null };
}
