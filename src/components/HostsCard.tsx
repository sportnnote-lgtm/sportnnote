/** Manage the set of hosts for a match or tournament. Hosts can manage the
 *  event and receive "no scorer assigned" reminders — multiple hosts mean a
 *  single point of contact never blocks getting a scorer assigned in time. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, EmptyState, textStyles } from './ui';

export function HostsCard({
  hostIds,
  nameOf,
  candidates,
  canManage,
  onChange,
  subtitle = 'Hosts can assign the scorer and manage this. Reminders go to all of them.',
}: {
  hostIds: string[];
  nameOf: (id: string) => string | undefined;
  candidates: { id: string; name: string }[];
  canManage: boolean;
  onChange: (ids: string[]) => void;
  subtitle?: string;
}) {
  const [adding, setAdding] = useState(false);
  const addable = candidates.filter((c) => !hostIds.includes(c.id));

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <Text style={textStyles.h3}>Hosts</Text>
        {canManage && addable.length > 0 && (
          <Text style={st.link} onPress={() => setAdding((v) => !v)}>{adding ? 'Close' : '+ Add host'}</Text>
        )}
      </View>
      <Text style={textStyles.muted}>{subtitle}</Text>

      {hostIds.length === 0 ? (
        <EmptyState icon="🤝" title="No hosts yet" compact />
      ) : (
        hostIds.map((id) => (
          <View key={id} style={st.row}>
            <Text style={st.icon}>🧑‍💼</Text>
            <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{nameOf(id) ?? 'Host'}</Text>
            {canManage && hostIds.length > 1 && (
              <Text style={st.remove} onPress={() => onChange(hostIds.filter((h) => h !== id))}>Remove</Text>
            )}
          </View>
        ))
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
        </View>
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  icon: { fontSize: 16 },
  remove: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '700' },
  picker: { gap: theme.spacing(1) },
  opt: { paddingVertical: theme.spacing(2), borderTopWidth: 1, borderTopColor: theme.colors.border },
  optText: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
});
