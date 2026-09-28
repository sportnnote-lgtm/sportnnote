/** The "acting as" context switcher (spec §18). A compact control showing the
 *  current context (Personal, or an org you belong to) that opens a sheet to switch.
 *  Switching only changes the lens — the Organize hub then shows that context's
 *  events & management, and tournament creation defaults to organizing as it. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { textStyles } from './ui';
import { useActiveOrg } from '../core/orgContext';

export function ContextSwitcher() {
  const { activeOrg, myOrgs, setActiveOrgId } = useActiveOrg();
  const [open, setOpen] = useState(false);

  // Nothing to switch between → don't clutter the header with a dead control.
  if (myOrgs.length === 0) return null;

  const label = activeOrg ? activeOrg.name : 'Personal';
  const pick = (id: string | null) => { setActiveOrgId(id); setOpen(false); };

  return (
    <>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Acting as ${label}. Switch context`} onPress={() => setOpen(true)} style={st.chip} activeOpacity={0.8}>
        <View style={[st.dot, activeOrg ? st.dotOrg : st.dotPersonal]} />
        <Text style={st.chipText} numberOfLines={1}>{label}</Text>
        <Text style={st.caret}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={st.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={st.sheetTitle}>Acting as</Text>
            <Row label="Personal" hint="Your own profile, teams & tournaments" active={!activeOrg} personal onPress={() => pick(null)} />
            {myOrgs.map((o) => (
              <Row key={o.id} label={o.name} hint={[o.type, o.city].filter(Boolean).join(' · ') || 'Community'} active={activeOrg?.id === o.id} onPress={() => pick(o.id)} />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Row({ label, hint, active, personal, onPress }: { label: string; hint?: string; active: boolean; personal?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[st.row, active && st.rowActive]} activeOpacity={0.8}>
      <View style={[st.dot, personal ? st.dotPersonal : st.dotOrg]} />
      <View style={{ flex: 1 }}>
        <Text style={textStyles.body}>{label}</Text>
        {!!hint && <Text style={textStyles.muted} numberOfLines={1}>{hint}</Text>}
      </View>
      {active && <Text style={st.check}>✓</Text>}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3), borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start', maxWidth: '100%' },
  chipText: { color: theme.colors.text, fontWeight: '800', fontSize: theme.font.small, flexShrink: 1 },
  caret: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotPersonal: { backgroundColor: theme.colors.accent },
  dotOrg: { backgroundColor: theme.colors.primary },
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-start', paddingTop: theme.spacing(14), paddingHorizontal: theme.spacing(4) },
  sheet: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(1) },
  sheetTitle: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: theme.spacing(2), paddingBottom: theme.spacing(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), padding: theme.spacing(3), borderRadius: theme.radius.md },
  rowActive: { backgroundColor: theme.colors.surfaceAlt },
  check: { color: theme.colors.primary, fontWeight: '900', fontSize: theme.font.h3 },
});
