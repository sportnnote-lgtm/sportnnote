/** Notification preferences: the reminder timers before a match. Users keep any
 *  set of lead times — quick presets or a custom "N minutes/hours/days before".
 *  Applies to matches they play in and players they follow (see reminders.ts). */
import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, ScreenTitle, FieldLabel, textStyles } from '../components/ui';
import { reminderPrefsStore, LEAD_PRESETS, formatLead } from '../data/reminderPrefs';

type Unit = 'min' | 'hour' | 'day';
const UNIT_MINS: Record<Unit, number> = { min: 1, hour: 60, day: 1440 };

export default function NotificationPrefsScreen() {
  const selected = useSyncExternalStore(reminderPrefsStore.subscribe, reminderPrefsStore.getSnapshot);
  const [num, setNum] = useState('45');
  const [unit, setUnit] = useState<Unit>('min');

  const addCustom = () => {
    const n = parseInt(num.trim(), 10);
    if (!n || n <= 0) return;
    reminderPrefsStore.add(n * UNIT_MINS[unit]);
  };

  const presets = LEAD_PRESETS.filter((m) => !selected.includes(m));

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <ScreenTitle title="Match reminders" subtitle="When to remind you before your matches" />

        <Card style={{ gap: theme.spacing(3) }}>
          <Text style={textStyles.h3}>🔔 Reminder timers</Text>
          <Text style={textStyles.muted}>
            We&apos;ll nudge you before matches you&apos;re playing in or scoring — and before players you follow take the field. You&apos;ll also get one email the day before (or an hour before, for matches set up at short notice). Tap a timer to remove it.
          </Text>

          {selected.length === 0 ? (
            <Text style={st.off}>Reminders are off — no notifications or emails before matches.</Text>
          ) : (
            <View style={st.chips}>
              {selected.map((m) => (
                <SelectChip key={m} label={`${formatLead(m)}  ✕`} active onPress={() => reminderPrefsStore.remove(m)} />
              ))}
            </View>
          )}

          <FieldLabel>Quick add</FieldLabel>
          {presets.length === 0 ? (
            <Text style={textStyles.muted}>All presets added — use a custom timer below for others.</Text>
          ) : (
            <View style={st.chips}>
              {presets.map((m) => (
                <SelectChip key={m} label={`+ ${formatLead(m).replace(' before', '')}`} active={false} onPress={() => reminderPrefsStore.add(m)} />
              ))}
            </View>
          )}

          <FieldLabel>Custom timer</FieldLabel>
          <View style={st.row}>
            <View style={st.numField}>
              <TextField label="" value={num} onChange={(t) => setNum(t.replace(/[^0-9]/g, ''))} autoCapitalize="none" placeholder="45" />
            </View>
            <View style={st.chips}>
              {(['min', 'hour', 'day'] as Unit[]).map((u) => (
                <SelectChip key={u} label={u === 'min' ? 'minutes' : u === 'hour' ? 'hours' : 'days'} active={unit === u} onPress={() => setUnit(u)} />
              ))}
            </View>
          </View>
          <Button label="＋ Add timer" variant="ghost" onPress={addCustom} disabled={!parseInt(num.trim(), 10)} />
        </Card>

        <Text style={textStyles.muted}>
          Organizers can set their own reminder times per tournament, which override yours for that tournament&apos;s matches.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'center', flexWrap: 'wrap' },
  numField: { width: 90 },
  off: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
});
