/** Define a tournament's divisions (age × gender) — the backbone of school meets.
 *  Add via presets (U14 Boys, U16 Girls…) or a custom label. Controlled: holds a
 *  NewTournamentCategory[]. Used at tournament creation; reusable wherever
 *  divisions are managed. Empty ⇒ the tournament runs as one implicit division. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { Card, Button, TextField, SelectChip, FieldLabel } from './ui';
import { AGE_GROUPS, GENDERS, presetDivision, divisionLabel, divisionKey } from '../core/divisions';
import type { CategoryGender, NewTournamentCategory } from '../core/types';

export function DivisionsEditor({
  value,
  onChange,
}: {
  value: NewTournamentCategory[];
  onChange: (list: NewTournamentCategory[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [age, setAge] = useState<string>('U14');
  const [gender, setGender] = useState<CategoryGender>('boys');
  const [custom, setCustom] = useState('');

  const add = (cat: NewTournamentCategory) => {
    const key = divisionKey(cat);
    if (!cat.label.trim() || value.some((c) => divisionKey(c) === key)) return; // no blanks / dupes
    onChange([...value, { ...cat, sort: value.length }]);
  };
  const remove = (label: string) => onChange(value.filter((c) => c.label !== label));

  return (
    <View style={{ gap: theme.spacing(2) }}>
      <View style={st.head}>
        <FieldLabel>Divisions (optional)</FieldLabel>
        <Text style={st.link} onPress={() => setOpen((v) => !v)}>{open ? 'Done' : '+ Add division'}</Text>
      </View>

      {value.length > 0 && (
        <View style={st.chips}>
          {value.map((c) => (
            <View key={c.label} style={st.pill}>
              <Text style={st.pillText}>{c.label}</Text>
              <Text style={st.pillX} onPress={() => remove(c.label)}> ✕</Text>
            </View>
          ))}
        </View>
      )}

      {open && (
        <Card style={{ gap: theme.spacing(3) }}>
          <Text style={st.muted}>Age group</Text>
          <View style={st.chips}>
            {AGE_GROUPS.map((a) => <SelectChip key={a} label={a} active={age === a} onPress={() => setAge(a)} />)}
          </View>
          <Text style={st.muted}>Gender</Text>
          <View style={st.chips}>
            {GENDERS.map((g) => <SelectChip key={g.key} label={g.label} active={gender === g.key} onPress={() => setGender(g.key)} />)}
          </View>
          <Button label={`+ Add ${divisionLabel(age, gender)}`} variant="ghost" onPress={() => add(presetDivision(age, gender))} />

          <View style={st.divider} />
          <Text style={st.muted}>Or a custom division</Text>
          <View style={st.row}>
            <View style={st.flex1}><TextField label="" value={custom} onChange={setCustom} placeholder="e.g. Staff, House A" /></View>
            <Button label="Add" variant="ghost" onPress={() => { add({ label: custom.trim() }); setCustom(''); }} />
          </View>
        </Card>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'flex-end' },
  flex1: { flex: 1 },
  muted: { color: theme.colors.textMuted, fontSize: theme.font.small },
  divider: { height: 1, backgroundColor: theme.colors.border },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(3) },
  pillText: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  pillX: { color: theme.colors.danger, fontSize: theme.font.small, fontWeight: '900' },
});
