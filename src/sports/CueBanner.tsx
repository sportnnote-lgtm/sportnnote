/**
 * SD-117c — the "↔ Change ends · 90 s" / "⏸ Interval at 11 (60 s)" banner at
 * the top of a racket sport's controls (see courtCues.ts), and the hook that
 * places the same cues on the point log. Display only.
 */
import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import type { LiveEvent } from './liveEvents';
import type { ScoreAction } from './types';
import { cueMarkers, withCues, type Cue } from './courtCues';
import type { PointInput } from './rallyEdit';

export function CueBanner({ cue }: { cue: Cue | null | undefined }) {
  if (!cue) return null;
  return (
    <Text style={[st.banner, cue.kind === 'ends' ? st.ends : st.interval]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {cue.text}
    </Text>
  );
}

/** The point log with its derived cue markers (replayed once per new log). */
export function useCueTimeline<S extends { events: LiveEvent[] }>(
  reducer: (s: S, a: ScoreAction) => S,
  s: S,
  inputs: (events: LiveEvent[]) => PointInput[],
  /** null = this sport has no cues (the log as is) */
  cueOf: ((s: S) => Cue | null) | null,
): LiveEvent[] {
  return useMemo(() => {
    if (!cueOf) return s.events;
    try {
      const cleared = reducer(s, { type: 'EDIT_LOG', payload: { points: [] } });
      return withCues(s.events, cueMarkers(reducer, cleared, inputs(s.events), cueOf, s.events));
    } catch {
      return s.events;
    }
    // the log decides the markers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.events]);
}

const st = StyleSheet.create({
  banner: {
    fontSize: theme.font.small, fontWeight: '900', letterSpacing: 0.3, overflow: 'hidden',
    borderRadius: theme.radius.md, borderWidth: 2, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3),
  },
  ends: { color: theme.colors.text, borderColor: theme.colors.accent, backgroundColor: theme.colors.accent + '22' },
  interval: { color: theme.colors.text, borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '1A' },
});
