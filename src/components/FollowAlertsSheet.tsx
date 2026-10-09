/** "Which alerts?" — per-follow alert choices (CricHeroes parity #23).
 *  A `Modal` sheet like ContextSwitcher: one full-width tap row per alert this
 *  follow type actually sends, a one-tap "Turn all off/on", and Save. All alerts
 *  start ticked (opt-out); only the OFF switches are stored. */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { textStyles, Button } from './ui';
import { useAuth } from '../core/auth';
import { useFollow } from '../data/hooks';
import { ALERTS, prefsFromTicked, wants, type AlertKey } from '../data/followPrefs';
import type { FollowType } from '../data/followStore';

export function FollowAlertsSheet({ visible, type, id, name, onClose }: {
  visible: boolean;
  type: FollowType;
  id: string;
  name: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const { prefsOf, savePrefs } = useFollow(profile?.id);
  const options = ALERTS[type];
  const tickedFromStore = () => new Set(options.filter((o) => wants(prefsOf(type, id), o.key)).map((o) => o.key));
  const [ticked, setTicked] = useState<Set<AlertKey>>(tickedFromStore);
  const [saving, setSaving] = useState(false);

  // Fresh copy of the saved choices every time the sheet opens.
  useEffect(() => {
    if (visible) setTicked(tickedFromStore());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, type, id]);

  const toggle = (k: AlertKey) => setTicked((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const allOn = ticked.size === options.length;
  const noneOn = ticked.size === 0;
  const save = async () => {
    setSaving(true);
    const ok = await savePrefs(type, id, prefsFromTicked(type, ticked, prefsOf(type, id)));
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={{ gap: theme.spacing(2) }} keyboardShouldPersistTaps="handled">
            <Text style={textStyles.h3}>Which alerts?</Text>
            <Text style={textStyles.muted}>
              For <Text style={st.bold}>{name}</Text>. Untick what you don’t need.
            </Text>
            <View style={{ gap: theme.spacing(1) }}>
              {options.map((o) => {
                const on = ticked.has(o.key);
                return (
                  <TouchableOpacity
                    key={o.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    accessibilityLabel={o.label}
                    accessibilityHint={o.hint}
                    onPress={() => toggle(o.key)}
                    style={st.row}
                    activeOpacity={0.8}
                  >
                    <Text style={st.box}>{on ? '☑' : '☐'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>{o.label}</Text>
                      <Text style={textStyles.muted}>{o.hint}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setTicked(allOn ? new Set() : new Set(options.map((o) => o.key)))}
              style={st.link}
            >
              <Text style={st.linkText}>{allOn ? 'Turn all off' : 'Turn all on'}</Text>
            </TouchableOpacity>
            {noneOn && (
              <Text style={textStyles.muted}>
                You’ll get nothing for {name} — unfollow to remove it from your feed too.
              </Text>
            )}
            <Button label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end', padding: theme.spacing(4) },
  sheet: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), maxHeight: '90%', width: '100%', maxWidth: 520, alignSelf: 'center' },
  bold: { color: theme.colors.text, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.md, minHeight: 48 },
  box: { color: theme.colors.primary, fontSize: 24, lineHeight: 28, width: 28, textAlign: 'center' },
  link: { alignSelf: 'flex-start', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2) },
  linkText: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
});
