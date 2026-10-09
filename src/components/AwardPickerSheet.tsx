/** Pick a player for an award (parity #21) — a `Modal` sheet like ContextSwitcher.
 *  Ranked rows (rank badge · avatar · name · team · detail · value), an optional
 *  "How is this ranked?" link, optional side tabs (the POTM change: home / away)
 *  and an optional search box. Tapping a row selects it and closes the sheet. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { SelectChip, TextField, textStyles } from './ui';
import { RankBadge } from './Rank';
import { notice } from '../core/confirm';

export interface PickerRow {
  id: string;
  name: string;
  teamName?: string;
  teamColor?: string;
  detail?: string;
  value?: number | string;
}

const initials = (name?: string): string =>
  (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export function AwardPickerSheet({
  visible, title, subtitle, howRanked, rows, tabs, ranked = true, searchable = false, selectedId, emptyLabel, onPick, onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** shown via notice() behind "How is this ranked?" */
  howRanked?: string;
  rows?: PickerRow[];
  /** split by side (e.g. home / away) — replaces `rows` */
  tabs?: { key: string; label: string; color?: string; rows: PickerRow[] }[];
  /** show rank badges (off for an unranked roster) */
  ranked?: boolean;
  searchable?: boolean;
  selectedId?: string;
  emptyLabel?: string;
  onPick: (row: PickerRow) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(tabs?.[0]?.key ?? '');
  const [q, setQ] = useState('');
  useEffect(() => { if (visible) { setQ(''); setTab(tabs?.[0]?.key ?? ''); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = tabs ? (tabs.find((t) => t.key === tab)?.rows ?? []) : (rows ?? []);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? base.filter((r) => r.name.toLowerCase().includes(needle) || (r.teamName ?? '').toLowerCase().includes(needle)) : base;
  }, [base, q]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={st.head}>
            <View style={{ flex: 1 }}>
              <Text style={st.title} numberOfLines={2}>{title}</Text>
              {subtitle ? <Text style={textStyles.muted} numberOfLines={2}>{subtitle}</Text> : null}
            </View>
            <Text style={st.close} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}>✕</Text>
          </View>
          {howRanked ? (
            <Text style={st.link} accessibilityRole="button" onPress={() => notice('How is this ranked?', howRanked)}>How is this ranked?</Text>
          ) : null}
          {tabs && tabs.length > 1 ? (
            <View style={st.chips}>
              {tabs.map((t) => <SelectChip key={t.key} label={t.label} dotColor={t.color} active={tab === t.key} onPress={() => setTab(t.key)} />)}
            </View>
          ) : null}
          {searchable ? <TextField label="Search players" value={q} onChange={setQ} placeholder="Name or team" autoCapitalize="none" /> : null}
          <ScrollView contentContainerStyle={{ gap: 2 }} keyboardShouldPersistTaps="handled">
            {list.length === 0 ? (
              <Text style={[textStyles.muted, { paddingVertical: theme.spacing(3) }]}>{emptyLabel ?? 'No players yet.'}</Text>
            ) : list.map((r, i) => (
              <TouchableOpacity
                key={r.id} accessibilityRole="button" accessibilityLabel={`Pick ${r.name}`} accessibilityState={{ selected: selectedId === r.id }}
                activeOpacity={0.8} onPress={() => onPick(r)} style={[st.row, selectedId === r.id && st.rowActive]}
              >
                {ranked ? <RankBadge index={i} width={22} /> : null}
                <View style={[st.avatar, { backgroundColor: r.teamColor ?? theme.colors.surfaceAlt }]}>
                  <Text style={st.avatarText}>{initials(r.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={textStyles.body} numberOfLines={1}>{r.name}{r.teamName ? <Text style={textStyles.muted}> · {r.teamName}</Text> : null}</Text>
                  {r.detail ? <Text style={st.detail} numberOfLines={1}>{r.detail}</Text> : null}
                </View>
                {r.value !== undefined ? <Text style={st.value}>{r.value}</Text> : null}
                {selectedId === r.id ? <Text style={st.check}>✓</Text> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), gap: theme.spacing(2),
    maxHeight: '80%', width: '100%', maxWidth: 640, alignSelf: 'center',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing(2) },
  title: { color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '800' },
  close: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '800', padding: theme.spacing(1) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(1), borderRadius: theme.radius.sm },
  rowActive: { backgroundColor: theme.colors.surfaceAlt },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#06120D', fontSize: theme.font.small, fontWeight: '900' },
  detail: { color: theme.colors.textMuted, fontSize: theme.font.tiny, marginTop: 1 },
  value: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '900', minWidth: 28, textAlign: 'right' },
  check: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.body },
});
