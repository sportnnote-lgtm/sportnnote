/** Manage the set of hosts for a match or tournament. Hosts can manage the
 *  event and receive "no scorer assigned" reminders — multiple hosts mean a
 *  single point of contact never blocks getting a scorer assigned in time. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, EmptyState, textStyles } from './ui';

/** Up to two initials from a name, for a host avatar. */
const initials = (name?: string): string =>
  (name ?? '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '🤝';

export function HostsCard({
  hostIds,
  nameOf,
  candidates,
  canManage,
  onChange,
  addPicker,
  meId,
  subtitle = 'Hosts can assign the scorer and manage this. Reminders go to all of them.',
}: {
  hostIds: string[];
  nameOf: (id: string) => string | undefined;
  candidates: { id: string; name: string }[];
  canManage: boolean;
  onChange: (ids: string[]) => void;
  /** "add anyone" UI shown in the add panel (e.g. <PersonPicker role="host" …/>) */
  addPicker?: React.ReactNode;
  /** the viewer's player id — their host row is highlighted with "· you" */
  meId?: string;
  subtitle?: string;
}) {
  const [adding, setAdding] = useState(false);
  const addable = candidates.filter((c) => !hostIds.includes(c.id));

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <Text style={textStyles.h3}>Hosts{hostIds.length ? ` · ${hostIds.length}` : ''}</Text>
        {canManage && (addable.length > 0 || !!addPicker) && (
          <Text style={st.link} onPress={() => setAdding((v) => !v)}>{adding ? 'Close' : '+ Add host'}</Text>
        )}
      </View>
      <Text style={textStyles.muted}>{subtitle}</Text>

      {hostIds.length === 0 ? (
        <EmptyState icon="🤝" title="No hosts yet" compact />
      ) : (
        hostIds.map((id) => {
          const me = !!meId && id === meId;
          return (
            <View key={id} style={st.row}>
              <View style={[st.avatar, me && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}>
                <Text style={[st.avatarText, me && { color: '#0B0F14' }]}>{initials(nameOf(id))}</Text>
              </View>
              <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{nameOf(id) ?? 'Host'}{me ? ' · you' : ''}</Text>
              {canManage && hostIds.length > 1 && (
                <Text style={st.remove} onPress={() => onChange(hostIds.filter((h) => h !== id))}>Remove</Text>
              )}
            </View>
          );
        })
      )}

      {canManage && adding && (
        <View style={st.picker}>
          {addable.map((c) => (
            <TouchableOpacity accessibilityRole="button"
              key={c.id}
              style={st.opt}
              activeOpacity={0.8}
              onPress={() => {
                onChange([...hostIds, c.id]);
                setAdding(false);
              }}
            >
              <Text style={st.optText}>+ {c.name}</Text>
            </TouchableOpacity>
          ))}
          {addPicker && (
            <View style={{ gap: theme.spacing(2), paddingTop: theme.spacing(2) }}>
              <Text style={textStyles.muted}>Add anyone — by mobile number or name:</Text>
              {addPicker}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '900' },
  remove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  picker: { gap: theme.spacing(1) },
  opt: { paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  optText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
});
