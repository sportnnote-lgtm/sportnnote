/** First-run guided tour — a short, skippable spotlight walkthrough shown once
 *  after a user first signs in. Each step dims the screen and highlights the
 *  actual element it's describing (a bottom-tab, or the ••• quick-actions button),
 *  with the explainer card anchored right next to it. Deliberately brief (7 steps,
 *  under the 10-step cap). Persists a "seen" flag; replay via resetOnboarding(). */
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../core/theme';
import { Button } from './ui';
import { hasSeenOnboarding, markOnboardingSeen } from '../core/onboarding';
import { onboardingStore } from '../data/onboardingStore';

// target: a bottom-tab index (0–4), 'more' (the ••• button), or undefined (centered).
type Step = { icon: string; title: string; body: string; target?: number | 'more' };
const STEPS: Step[] = [
  { icon: '👋', title: 'Welcome to SportnNote', body: 'Play a Sport, Make a Note. Here’s a 20-second tour — tap Next to follow along.' },
  { icon: '🏠', title: 'Home is your feed', body: 'Live & upcoming matches from the players, teams and tournaments you follow — plus your own games.', target: 0 },
  { icon: '📅', title: 'Matches', body: 'Only your games — ones you play, organize or score — split into Live, Upcoming and Completed.', target: 1 },
  { icon: '🎛️', title: 'Organize', body: 'Create a tournament (with divisions like U14 Boys / U16 Girls), add teams, or start a quick friendly.', target: 2 },
  { icon: '🔍', title: 'Discover & follow', body: 'Search players and teams, then follow them so their matches appear on your Home feed.', target: 3 },
  { icon: '👤', title: 'Your profile', body: 'Your details, settings, and sign-out live here. You can also score any match point-by-point — even by voice.', target: 4 },
  { icon: '•••', title: 'Quick actions', body: 'Voice scoring, Start a friendly, and your Calendar are tucked under the ••• menu, top-right.', target: 'more' },
];

const TAB_BAR_H = 56;
const PAD = theme.spacing(4);
const BTN = 44;

export function OnboardingOverlay() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const visible = useSyncExternalStore(onboardingStore.subscribe, onboardingStore.getSnapshot, onboardingStore.getSnapshot);
  const [i, setI] = useState(0);

  // Auto-open on first run; a "Replay tour" action opens it again via the store.
  useEffect(() => { hasSeenOnboarding().then((seen) => { if (!seen) onboardingStore.request(); }); }, []);
  // Always start a fresh run from the first step.
  useEffect(() => { if (visible) setI(0); }, [visible]);

  const finish = () => { void markOnboardingSeen(); onboardingStore.done(); };
  if (!visible) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // The rect (in screen coords) of the element this step points at.
  const rect = ((): { x: number; y: number; w: number; h: number; r: number } | null => {
    if (step.target === undefined) return null;
    if (step.target === 'more') return { x: W - PAD - BTN, y: insets.top + PAD, w: BTN, h: BTN, r: 22 };
    const colW = W / 5;
    const top = H - insets.bottom - TAB_BAR_H;
    return { x: colW * step.target + 8, y: top + 2, w: colW - 16, h: TAB_BAR_H - 6, r: theme.radius.md };
  })();

  // Anchor the card next to the highlight: below a top target, above a bottom one.
  const cardWrap = !rect
    ? [st.fill, st.center]
    : rect.y < H / 2
      ? [st.anchor, { top: rect.y + rect.h + 14 }]
      : [st.anchor, { bottom: H - rect.y + 14 }];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={st.fill}>
        {rect ? (
          <>
            {/* Dim everything except the highlighted element (4 surrounding rects). */}
            <View style={[st.dim, { left: 0, right: 0, top: 0, height: rect.y }]} />
            <View style={[st.dim, { left: 0, right: 0, top: rect.y + rect.h, bottom: 0 }]} />
            <View style={[st.dim, { left: 0, top: rect.y, width: rect.x, height: rect.h }]} />
            <View style={[st.dim, { right: 0, top: rect.y, left: rect.x + rect.w, height: rect.h }]} />
            <View style={[st.ring, { left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.r }]} />
          </>
        ) : (
          <View style={[st.fill, st.dimFull]} />
        )}

        <View style={cardWrap}>
          <View style={st.card}>
            <Text style={st.skip} onPress={finish} accessibilityRole="button">Skip</Text>
            <Text style={st.cardIcon}>{step.icon}</Text>
            <Text style={st.title}>{step.title}</Text>
            <Text style={st.body}>{step.body}</Text>
            <View style={st.dots}>
              {STEPS.map((_, d) => <View key={d} style={[st.dot, d === i && st.dotOn]} />)}
            </View>
            <View style={st.row}>
              {i > 0 && <View style={st.flex}><Button label="Back" variant="ghost" onPress={() => setI(i - 1)} /></View>}
              <View style={st.flex}><Button label={last ? 'Get started' : 'Next'} onPress={() => (last ? finish() : setI(i + 1))} /></View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const DIM = 'rgba(0,0,0,0.66)';
const st = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6) },
  dim: { position: 'absolute', backgroundColor: DIM },
  dimFull: { backgroundColor: DIM },
  ring: { position: 'absolute', borderWidth: 3, borderColor: theme.colors.primary, backgroundColor: 'transparent' },
  anchor: { position: 'absolute', left: theme.spacing(4), right: theme.spacing(4), alignItems: 'center' },
  card: { width: '100%', maxWidth: 420, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(5), gap: theme.spacing(3), alignItems: 'center' },
  skip: { alignSelf: 'flex-end', color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  cardIcon: { fontSize: 40 },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900', textAlign: 'center' },
  body: { color: theme.colors.textMuted, fontSize: theme.font.body, textAlign: 'center', lineHeight: 21 },
  dots: { flexDirection: 'row', gap: theme.spacing(1), marginVertical: theme.spacing(1) },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.border },
  dotOn: { backgroundColor: theme.colors.primary, width: 20 },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignSelf: 'stretch' },
  flex: { flex: 1 },
});
