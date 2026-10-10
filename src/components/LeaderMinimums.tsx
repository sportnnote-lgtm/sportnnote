/** SD-27 (GEN-14) — the organiser's leaderboard minimums for one sport of a
 *  tournament: how many games / sets / matches / service points a player needs
 *  before a per-game, per-set or % figure ranks (and before they can win an
 *  award ranked by one). Collapsed to one line under the leaders; "Change"
 *  opens a stepper per figure. Saved in the sport's format (`leaderMins`). */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Button, Card, textStyles } from './ui';
import { minimumRows, type LeaderMins } from '../data/leaderMinimums';
import type { SportId } from '../core/types';

export function LeaderMinimums({
  sport, mins, canManage, onSave,
}: {
  sport: SportId;
  mins: LeaderMins;
  canManage: boolean;
  onSave: (next: LeaderMins) => Promise<void>;
}) {
  const rows = useMemo(() => minimumRows(sport, mins), [sport, mins]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LeaderMins>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setOpen(false); setDraft({}); setError(null); }, [sport]);
  if (!rows.length) return null;
  const changed = rows.some((r) => r.value !== r.defaultValue);

  if (!open) {
    if (!canManage && !changed) return null;
    return (
      <View style={st.line}>
        <Text style={[textStyles.muted, { flex: 1 }]} numberOfLines={2}>
          {changed ? 'Minimums set by the organiser.' : 'Rates and averages need a minimum to rank.'}
        </Text>
        {canManage ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Change leaderboard minimums"
            onPress={() => { setDraft(Object.fromEntries(rows.map((r) => [r.key, r.value]))); setOpen(true); }}>
            <Text style={st.link}>Minimums</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const step = (key: string, d: number) => setDraft((x) => ({ ...x, [key]: Math.max(0, (x[key] ?? 0) + d) }));
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>Minimums to rank</Text>
      <Text style={textStyles.muted}>A player needs at least this much before the figure ranks on a leaderboard or wins an award ranked by it. 0 = no minimum.</Text>
      {rows.map((r) => {
        const v = draft[r.key] ?? r.value;
        return (
          <View key={r.key} style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={textStyles.body} numberOfLines={2}>{r.label}</Text>
              <Text style={st.unit} numberOfLines={1}>{v === r.defaultValue ? 'default' : `default ${r.defaultValue}`}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Fewer ${r.unit} for ${r.label}`} onPress={() => step(r.key, -1)} style={st.stepBtn}>
              <Text style={st.stepText}>−</Text>
            </TouchableOpacity>
            <View style={st.valueBox} accessible accessibilityLabel={`${r.label}: ${v} ${v === 1 ? r.unitOne : r.unit}`}>
              <Text style={st.value}>{v}</Text>
              <Text style={st.unit} numberOfLines={1}>{v === 1 ? r.unitOne : r.unit}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`More ${r.unit} for ${r.label}`} onPress={() => step(r.key, 1)} style={st.stepBtn}>
              <Text style={st.stepText}>+</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      {error ? <Text style={st.error}>{error}</Text> : null}
      <View style={st.actions}>
        <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button label="Defaults" variant="ghost" style={{ flex: 1 }} onPress={() => setDraft(Object.fromEntries(rows.map((r) => [r.key, r.defaultValue])))} />
        <Button label={saving ? 'Saving…' : 'Save'} disabled={saving} style={{ flex: 1 }} onPress={() => void save()} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small, paddingVertical: theme.spacing(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  valueBox: { width: 84, alignItems: 'center' },
  value: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  unit: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '600' },
  error: { color: theme.colors.danger, fontSize: theme.font.small },
  actions: { flexDirection: 'row', gap: theme.spacing(2) },
});
