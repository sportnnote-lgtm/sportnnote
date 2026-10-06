/**
 * Send feedback — the pilot's main channel back to the founder. Reuses the
 * support pipeline (support-escalate: recorded in support_cases + emailed),
 * tagged with the kind and the screens the user was on just before.
 */
import React, { useState } from 'react';
import { ScrollView, View, Text, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, FormError, SelectChip, TextField, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { SUPPORT_EMAIL, submitSupportCase } from '../data/repos';
import { appVersionLabel, recentScreens, track } from '../core/telemetry';

const KINDS = [
  { id: 'bug', label: '🐞 Something’s broken' },
  { id: 'idea', label: '💡 Idea' },
  { id: 'confusing', label: '🤔 Confusing' },
  { id: 'love', label: '❤️ Love it' },
] as const;
type Kind = (typeof KINDS)[number]['id'];

export default function FeedbackScreen() {
  const nav = useNavigation();
  const { profile } = useAuth();
  const [kind, setKind] = useState<Kind>('bug');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where they were before opening Feedback (drop Settings/Feedback themselves).
  const trail = recentScreens().filter((s) => s !== 'Feedback' && s !== 'Settings');

  const send = async () => {
    const body = text.trim();
    if (body.length < 3) return setError('Tell us a little more first.');
    setError(null);
    setBusy(true);
    const label = KINDS.find((k) => k.id === kind)!.label;
    const context = [
      `Kind: ${label}`,
      trail.length ? `Screens before: ${trail.join(' → ')}` : '',
      `Platform: ${Platform.OS}`,
    ].filter(Boolean).join(' · ');
    const question = `[Feedback · ${kind}] ${body}`;
    const { delivered } = await submitSupportCase({ question, tried: context, handle: profile?.handle, appVersion: appVersionLabel() });
    setBusy(false);
    if (delivered) {
      track('feedback_sent', { kind });
      setSent(true);
      return;
    }
    // Not delivered (offline / email not configured): fall back to a pre-filled email.
    const mail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`SportnNote feedback (${kind})`)}&body=${encodeURIComponent(`${body}\n\n— ${context} · v${appVersionLabel()}`)}`;
    void Linking.openURL(mail);
  };

  if (sent) {
    return (
      <SafeAreaView style={st.safe} edges={['bottom']}>
        <View style={st.done}>
          <Text style={textStyles.h2}>Thank you! 🙌</Text>
          <Text style={[textStyles.muted, { textAlign: 'center' }]}>We read every message. If we need more detail we’ll reply by email.</Text>
          <Button label="Done" onPress={() => nav.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.h2}>Send feedback</Text>
          <Text style={textStyles.muted}>Bugs, ideas, anything confusing — it goes straight to the team.</Text>
        </View>
        <View style={st.kinds}>
          {KINDS.map((k) => <SelectChip key={k.id} label={k.label} active={kind === k.id} onPress={() => setKind(k.id)} />)}
        </View>
        <TextField
          label={kind === 'bug' ? 'What happened? What did you expect?' : 'Tell us'}
          value={text}
          onChange={setText}
          placeholder={kind === 'bug' ? 'I tapped End match and…' : 'It would be great if…'}
          multiline
        />
        {trail.length ? (
          <Card>
            <Text style={textStyles.muted}>We’ll include the screens you were on ({trail.slice(-3).join(' → ')}), your app version and device type — nothing else.</Text>
          </Card>
        ) : null}
        <FormError message={error} />
        <Button label={busy ? 'Sending…' : 'Send'} onPress={() => void send()} disabled={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(4) },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6), gap: theme.spacing(4) },
});
