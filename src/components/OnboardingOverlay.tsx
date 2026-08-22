/** First-run guided tour — a short, skippable step-through of the basics shown
 *  once after a user first signs in. Deliberately brief (7 steps, well under the
 *  10-step cap): what each tab is for, plus how to score. Persists a "seen" flag
 *  so it never nags. Replayable via resetOnboarding(). */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button } from './ui';
import { hasSeenOnboarding, markOnboardingSeen } from '../core/onboarding';

const STEPS: { icon: string; title: string; body: string }[] = [
  { icon: '👋', title: 'Welcome to SportnNote', body: 'Play a Sport, Make a Note. Here’s a 20-second tour of the basics.' },
  { icon: '🏠', title: 'Home is your feed', body: 'Live & upcoming matches from the players, teams and tournaments you follow — plus your own games.' },
  { icon: '📅', title: 'Matches', body: 'Every game you play, organize or score — split into Live, Upcoming and Completed.' },
  { icon: '🎛️', title: 'Organize', body: 'Create a tournament (with divisions like U14 Boys / U16 Girls), add teams, or start a quick friendly.' },
  { icon: '🔍', title: 'Discover & follow', body: 'Search players and teams, then follow them so their matches appear on your Home feed.' },
  { icon: '🎙️', title: 'Score live', body: 'Open any match to score it point-by-point or ball-by-ball — you can even score hands-free by voice.' },
  { icon: '👤', title: 'You’re all set', body: 'Your profile, settings and sign-out live in the Profile tab. Enjoy SportnNote!' },
];

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => { hasSeenOnboarding().then((seen) => { if (!seen) setVisible(true); }); }, []);

  const finish = () => { void markOnboardingSeen(); setVisible(false); };
  if (!visible) return null;

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={st.backdrop}>
        <View style={st.card}>
          <Text style={st.skip} onPress={finish} accessibilityRole="button">Skip</Text>
          <Text style={st.icon}>{step.icon}</Text>
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
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6) },
  card: { width: '100%', maxWidth: 420, backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(6), gap: theme.spacing(3), alignItems: 'center' },
  skip: { alignSelf: 'flex-end', color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700' },
  icon: { fontSize: 44 },
  title: { color: theme.colors.text, fontSize: theme.font.h2, fontWeight: '900', textAlign: 'center' },
  body: { color: theme.colors.textMuted, fontSize: theme.font.body, textAlign: 'center', lineHeight: 21 },
  dots: { flexDirection: 'row', gap: theme.spacing(1), marginVertical: theme.spacing(1) },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.border },
  dotOn: { backgroundColor: theme.colors.primary, width: 20 },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignSelf: 'stretch' },
  flex: { flex: 1 },
});
