/**
 * SD-155 — tells screen-reader users when the score changes (WCAG 4.1.3 Status
 * Messages). Mount once on a live screen with the current score sentence:
 *
 *   <LiveAnnouncer message={`${home} 2, ${away} 1. 2nd half`} />
 *
 * Android: a (visually hidden) accessibilityLiveRegion="polite" view — TalkBack
 * reads it whenever its text changes. iOS: AccessibilityInfo.announceForAccessibility.
 * Web: the shared aria-live="polite" region (src/core/a11y.ts).
 *
 * Changes are debounced (`delay`, default 700 ms) so a burst of taps reads once,
 * and the first value on mount is never announced (it's already on screen).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { announce } from '../core/a11y';

export function LiveAnnouncer({ message, delay = 700 }: { message: string | null | undefined; delay?: number }) {
  const first = useRef(true);
  const lastSaid = useRef<string>(message ?? '');
  const [androidText, setAndroidText] = useState(message ?? '');
  useEffect(() => {
    const msg = (message ?? '').trim();
    if (first.current) { first.current = false; lastSaid.current = msg; return; }
    if (!msg || msg === lastSaid.current) return;
    const t = setTimeout(() => {
      lastSaid.current = msg;
      if (Platform.OS === 'android') setAndroidText(msg);
      else announce(msg);
    }, delay);
    return () => clearTimeout(t);
  }, [message, delay]);
  if (Platform.OS !== 'android') return null;
  return (
    <View style={st.hidden} accessibilityLiveRegion="polite" importantForAccessibility="yes" pointerEvents="none">
      <Text>{androidText}</Text>
    </View>
  );
}

/** Plain sentence for a two-sided score: "Lions 2, Tigers 1. Second half". */
export function scoreSentence(homeName: string, homeScore: unknown, awayName: string, awayScore: unknown, status?: string | null): string {
  const h = homeScore == null || homeScore === '' ? '' : String(homeScore);
  const a = awayScore == null || awayScore === '' ? '' : String(awayScore);
  if (!h && !a) return status ?? '';
  return `${homeName} ${h}, ${awayName} ${a}${status ? `. ${status}` : ''}`;
}

const st = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', left: 0, top: 0 },
});
