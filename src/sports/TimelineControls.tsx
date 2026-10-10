/**
 * SD-114 — shared pieces for the live "Correct the timeline" lists and backfill
 * mode (football, hockey, basketball, kabaddi, RallyPointEditor):
 *   • RowAction — ✎ / ✕ / ＋ as real ≥44pt buttons (they were 4px text links
 *     sitting next to each other);
 *   • confirmRemove — ✕ asks first in the shared ConfirmSheet;
 *   • BackfillBar — the sticky "⏪ Backfilling at 12′ — Back to live" bar pinned
 *     at the very top of the controls, so a scorer can't forget they're stamping
 *     live taps at a past minute.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { confirmMatchAction } from '../components/ConfirmSheet';

type Tone = 'edit' | 'remove' | 'insert';
const TONE: Record<Tone, string> = { edit: theme.colors.accent, remove: theme.colors.danger, insert: theme.colors.primary };

/** A ≥44×44pt row action (✎ Edit / ✕ / ＋). */
export function RowAction({ label, tone, onPress, a11y }: { label: string; tone: Tone; onPress: () => void; a11y: string }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} activeOpacity={0.7}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      style={[st.action, { borderColor: TONE[tone] + '66' }]}>
      <Text style={[st.actionTxt, { color: TONE[tone] }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** ✕ on a timeline row: ask in the ConfirmSheet, then remove. `detail` says what
 *  else goes with it (a raid's tackle / all-out, a yellow's second-yellow red). */
export async function confirmRemove(what: string, remove: () => void, detail?: string): Promise<void> {
  if (await confirmMatchAction('removeEvent', { what, ...(detail ? { detail } : {}) })) remove();
}

/** Sticky backfill banner — render it first in the controls while backfilling. */
export function BackfillBar({ at, onLive }: { at: string; onLive: () => void }) {
  return (
    <View style={st.bar} accessibilityRole="alert">
      <Text style={st.barTxt} numberOfLines={2}>⏪ Backfilling at {at}{"\n"}Taps are stamped there</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to live scoring" onPress={onLive} activeOpacity={0.8} style={st.barBtn}>
        <Text style={st.barBtnTxt}>▶ Back to live</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  action: { minWidth: 44, minHeight: 44, paddingHorizontal: theme.spacing(2), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: theme.radius.sm },
  actionTxt: { fontSize: theme.font.small, fontWeight: '800' },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), padding: theme.spacing(2), paddingLeft: theme.spacing(3),
    backgroundColor: theme.colors.accent + '26', borderWidth: 1, borderColor: theme.colors.accent, borderRadius: theme.radius.md,
  },
  barTxt: { flex: 1, color: theme.colors.accent, fontSize: theme.font.small, fontWeight: '800' },
  barBtn: { minHeight: 44, paddingHorizontal: theme.spacing(3), borderRadius: theme.radius.sm, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' },
  barBtnTxt: { color: '#06120D', fontSize: theme.font.small, fontWeight: '900' },
});
