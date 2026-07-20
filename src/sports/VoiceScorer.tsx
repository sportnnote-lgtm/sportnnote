/** Shared voice/typed scoring panel for any sport whose plugin declares `voice`.
 *  Mirrors football's UI: a mic toggle (Web Speech / native adapter) plus a
 *  "type a command" fallback, routing every phrase through the plugin's pure
 *  parser and dispatching the result. Feedback is shown as text (no TTS needed). */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, TextField, textStyles } from '../components/ui';
import { useSpeech } from '../core/speech';
import type { Player } from '../core/types';
import type { ScoreAction, SportPlugin } from './types';

export function VoiceScorer({
  voice, state, dispatch, homeName, awayName, homeRoster = [], awayRoster = [],
}: {
  voice: NonNullable<SportPlugin['voice']>;
  state: unknown;
  dispatch: (a: ScoreAction) => void;
  homeName: string;
  awayName: string;
  homeRoster?: Player[];
  awayRoster?: Player[];
}) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const process = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const actions = voice.parse(t, { state, homeName, awayName, homeRoster, awayRoster });
    if (!actions || actions.length === 0) {
      setFeedback(`🤔 Didn't catch “${t}”. Try e.g. “${voice.hints[0]}”.`);
      return;
    }
    actions.forEach(dispatch);
    const a = actions[actions.length - 1];
    const who = a.attribution?.playerName;
    const sideName = a.side === 'home' ? homeName : a.side === 'away' ? awayName : '';
    setFeedback(`✅ ${a.type.toLowerCase()} — ${sideName}${who ? ` · ${who}` : ''}`);
  };

  const speech = useSpeech(process);
  const send = () => { if (text.trim()) { process(text); setText(''); } };

  return (
    <View style={st.box}>
      <Button
        label={speech.listening ? '🛑 Stop listening' : '🎤 Voice scoring'}
        variant={speech.listening ? 'danger' : 'ghost'}
        onPress={() =>
          speech.listening ? speech.stop() : speech.supported ? speech.start()
            : setFeedback('Voice needs Chrome/Edge on web (or a device build) — use the box below.')
        }
      />
      {speech.interim ? <Text style={st.heard}>🎙 {speech.interim}</Text> : null}
      <Text style={textStyles.muted}>Say e.g. {voice.hints.slice(0, 3).map((h) => `“${h}”`).join(', ')}. Then answer any follow-ups.</Text>
      <View style={st.row}>
        <View style={st.flex}>
          <TextField label="" value={text} onChange={setText} placeholder="…or type a command" autoCapitalize="none" />
        </View>
        <Button label="Send" variant="ghost" onPress={send} disabled={!text.trim()} />
      </View>
      {feedback ? <Text style={st.feedback}>{feedback}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  box: {
    gap: theme.spacing(2),
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    padding: theme.spacing(3),
  },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex: { flex: 1 },
  heard: { color: theme.colors.accent, fontSize: theme.font.small, fontStyle: 'italic' },
  feedback: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
});
