/** SD-111 — "Result sent to followers in 0:58 · Undo · Send now", shown to the
 *  scorer while the match-deciding tap's result is held (see data/resultHold.ts). */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { formatHold } from '../data/resultHold';

export function ResultHoldNote({ sendsAt, onUndo, onSendNow }: { sendsAt: number; onUndo: () => void; onSendNow: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sendsAt]);
  return (
    <View style={st.box} accessibilityLiveRegion="polite" testID="result-hold-note">
      <Text style={st.text}>
        Result sent to followers in {formatHold(sendsAt - now)}
        <Text style={st.dot}> · </Text>
        <Text style={st.link} accessibilityRole="button" accessibilityLabel="Undo the last tap and keep the result unsent" onPress={onUndo}>Undo</Text>
        <Text style={st.dot}> · </Text>
        <Text style={st.link} accessibilityRole="button" accessibilityLabel="Send the result to followers now" onPress={onSendNow}>Send now</Text>
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: {
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.accent + '66',
    backgroundColor: theme.colors.accent + '14', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3),
  },
  text: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
  dot: { color: theme.colors.textMuted },
  link: { color: theme.colors.primary, fontWeight: '800', textDecorationLine: 'underline' },
});
